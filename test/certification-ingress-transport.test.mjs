// UNIT / injected API transport only. SQL atomicity, durable state and races
// require the separate PostgreSQL suite; these tests do not stand in for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {certificationRuntimeFixture} from './support/reliability/certification-runtime-fixture.mjs';
import {certificationOperationRpc,readCertificationIngressStatus,resolveCertificationIngress,replayCertificationIngress} from '../lib/certification-runtime-server.js';

const requestId='device:2026.score-1';
const directorId='99999999-9999-4999-8999-999999999999';
const score={match_id:'SYNTHETIC-R3-1',mutation_key:requestId,hole_number:1,gross_scores:[4,4],expected_match_revision:0};
const receipt={ok:true,code:'SCORE_OFFICIAL',match_id:score.match_id,mutation_key:requestId};
const options=f=>({env:f.env,operationRequestId:requestId,authorization:{auth_user_id:f.authorization.identity.authUserId,player_id:'SYNTHETIC-P01',role:'PLAYER',tournament_id:'2026'}});
const names=f=>f.requests.map(r=>r.url.split('/').at(-1));
function intercept(f, handler) {
  const original=f.dependencies.fetchImpl;
  f.dependencies.fetchImpl=async(url,init)=>{
    const input=JSON.parse(init.body).input,name=url.split('/').at(-1);
    const result=await handler(name,input);
    if(result===undefined)return original(url,init);
    f.requests.push({url,init,input});
    if(result instanceof Error)throw result;
    return result;
  };
}

test('admission response completes before canonical execution; only DB lease identity is forwarded',async()=>{
  const f=certificationRuntimeFixture();let admitted=false;
  intercept(f,(name,input)=>{
    if(name==='admit_certification_operation_v1'){admitted=true;assert.equal(input.ingress,undefined);return Response.json(f.admissionFor(input));}
    if(name==='execute_certification_operation_v1'){
      assert.equal(admitted,true);assert.deepEqual(input.ingress,{lease_id:'77777777-7777-4777-8777-777777777777',admission_generation_id:'88888888-8888-4888-8888-888888888888'});
      assert.deepEqual(input.payload,score);assert.equal(input.operation_request_id,requestId);return Response.json(receipt);
    }
  });
  assert.deepEqual((await certificationOperationRpc('SCORING.SUBMIT_HOLE',score,options(f),f.dependencies)).payload,receipt);
  assert.deepEqual(names(f),['read_certification_runtime_context_v1','admit_certification_operation_v1','execute_certification_operation_v1']);
});

for(const operation of ['SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH','DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION'])test(`durable admission applies to required canonical family ${operation}`,async()=>{
  const f=certificationRuntimeFixture();await certificationOperationRpc(operation,{}, {...options(f),operationRequestId:operation.startsWith('SCORING.')?requestId:directorId},f.dependencies);
  assert.deepEqual(names(f),['read_certification_runtime_context_v1','admit_certification_operation_v1','execute_certification_operation_v1']);
});
for(const operation of ['WORKERS.COMPETITION_CLAIM','WORKERS.INTELLIGENCE_WRITE','WORKERS.CALCUTTA_COMPLETE','DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.REQUEUE_DERIVED'])test(`existing job protocol stays separate: ${operation}`,async()=>{
  const f=certificationRuntimeFixture();await certificationOperationRpc(operation,{}, {...options(f),operationRequestId:directorId},f.dependencies);
  assert.deepEqual(names(f),['read_certification_runtime_context_v1','execute_certification_operation_v1']);
});

for(const failureKind of ['connection','57014','missing-schema'])test(`failed admission never executes or fabricates non-commit: ${failureKind}`,async()=>{
  const f=certificationRuntimeFixture();intercept(f,name=>name==='admit_certification_operation_v1'?(failureKind==='connection'?Error('lost admission response'):Response.json({code:failureKind==='57014'?'57014':'PGRST202',message:'unavailable'},{status:503})):undefined);
  await assert.rejects(certificationOperationRpc('SCORING.SUBMIT_HOLE',score,options(f),f.dependencies),e=>{
    assert.equal(e.operationRequestId,requestId);assert.equal(e.outcome,'UNKNOWN');assert.equal(e.recovery,'CHECK_STATUS_RETRY_SAME_OPERATION');return true;
  });
  assert.deepEqual(names(f),['read_certification_runtime_context_v1','admit_certification_operation_v1']);
});

for(const [field,value] of [['contract','wrong'],['operation_request_id','other'],['lease_id',null],['lease_id','bad'],['admission_generation_id','bad'],['admission_sequence',0],['admission_sequence',Number.MAX_SAFE_INTEGER+1],['request_hash','bad'],['state','EXPIRED']])test(`invalid admission readback fails before execution: ${field}=${value}`,async()=>{
  const f=certificationRuntimeFixture();intercept(f,(name,input)=>name==='admit_certification_operation_v1'?Response.json({...f.admissionFor(input),[field]:value}):undefined);
  await assert.rejects(certificationOperationRpc('SCORING.SUBMIT_HOLE',score,options(f),f.dependencies),{code:'CERTIFICATION_INGRESS_RESPONSE_INVALID',outcome:'UNKNOWN',operationRequestId:requestId});
  assert.equal(names(f).includes('execute_certification_operation_v1'),false);
});

for(const [state,result] of [['COMMITTED',receipt],['NOT_COMMITTED',{ok:false,code:'MATCH_REVISION_CONFLICT'}]])test(`terminal same-operation admission replays established result without executing: ${state}`,async()=>{
  const f=certificationRuntimeFixture();intercept(f,(name,input)=>name==='admit_certification_operation_v1'?Response.json(f.admissionFor(input,state,result)):undefined);
  const response=await certificationOperationRpc('SCORING.SUBMIT_HOLE',score,options(f),f.dependencies);
  assert.deepEqual(response.payload,result);assert.equal(names(f).includes('execute_certification_operation_v1'),false);
});
for(const [state,result] of [['COMMITTED',{ok:false}],['NOT_COMMITTED',{ok:true}],['ADMITTED',{ok:true}]])test(`contradictory lease outcome cannot become a client receipt: ${state}`,async()=>{
  const f=certificationRuntimeFixture();intercept(f,(name,input)=>name==='admit_certification_operation_v1'?Response.json(f.admissionFor(input,state,result)):undefined);
  await assert.rejects(certificationOperationRpc('SCORING.SUBMIT_HOLE',score,options(f),f.dependencies),{code:'CERTIFICATION_INGRESS_RESPONSE_INVALID',outcome:'UNKNOWN'});
  assert.equal(names(f).includes('execute_certification_operation_v1'),false);
});

test('lost execution response attempts durable UNKNOWN with same identity and no sensitive payload',async()=>{
  const f=certificationRuntimeFixture();intercept(f,name=>name==='execute_certification_operation_v1'?Error('lost acknowledgement'):undefined);
  await assert.rejects(certificationOperationRpc('SCORING.SUBMIT_HOLE',score,options(f),f.dependencies),{outcome:'UNKNOWN',operationRequestId:requestId});
  assert.deepEqual(names(f),['read_certification_runtime_context_v1','admit_certification_operation_v1','execute_certification_operation_v1','mark_certification_ingress_unknown_v1']);
  const recovery=f.requests.at(-1).input;assert.deepEqual(recovery.payload,{match_id:score.match_id});assert.equal(recovery.operation_request_id,requestId);assert.equal(recovery.expected_context_token,undefined);
});
test('lost acknowledgement can be recovered from terminal outcome returned by UNKNOWN marker',async()=>{
  const f=certificationRuntimeFixture();intercept(f,(name,input)=>name==='execute_certification_operation_v1'?Error('lost ack'):name==='mark_certification_ingress_unknown_v1'?Response.json(f.admissionFor(input,'COMMITTED',receipt)):undefined);
  assert.deepEqual((await certificationOperationRpc('SCORING.SUBMIT_HOLE',score,options(f),f.dependencies)).payload,receipt);
  assert.equal(names(f).filter(n=>n==='execute_certification_operation_v1').length,1);
});
test('failed UNKNOWN marker does not replace original typed error or imply non-commit',async()=>{
  const f=certificationRuntimeFixture();intercept(f,name=>name==='execute_certification_operation_v1'?Response.json({code:'57014',message:'query timeout'},{status:500}):name==='mark_certification_ingress_unknown_v1'?Error('also unavailable'):undefined);
  await assert.rejects(certificationOperationRpc('SCORING.SUBMIT_HOLE',score,options(f),f.dependencies),{code:'CERTIFICATION_DATABASE_TIMEOUT',databaseSqlstate:'57014',outcome:'UNKNOWN',operationRequestId:requestId});
  assert.equal(names(f).filter(n=>n==='execute_certification_operation_v1').length,1);
});
test('marker cannot substitute another lease result even with matching operation identity',async()=>{
  const f=certificationRuntimeFixture();intercept(f,(name,input)=>name==='execute_certification_operation_v1'?Error('lost ack'):name==='mark_certification_ingress_unknown_v1'?Response.json({...f.admissionFor(input,'COMMITTED',receipt),admission_generation_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}):undefined);
  await assert.rejects(certificationOperationRpc('SCORING.SUBMIT_HOLE',score,options(f),f.dependencies),{code:'CERTIFICATION_TRANSPORT_UNAVAILABLE',outcome:'UNKNOWN'});
});

for(const [fn,rpc] of [[readCertificationIngressStatus,'read_certification_ingress_status_v1'],[resolveCertificationIngress,'resolve_certification_ingress_v1']])test(`exact recovery needs no open-write context and preserves original actor: ${rpc}`,async()=>{
  const f=certificationRuntimeFixture();const response=await fn('SCORING.SUBMIT_HOLE',{match_id:score.match_id},options(f),f.dependencies);
  assert.deepEqual(names(f),[rpc]);const input=f.requests[0].input;
  assert.equal(input.operation_request_id,requestId);assert.deepEqual(input.authorization,options(f).authorization);assert.equal(input.resource.resource_class,'CERTIFICATION');assert.equal(input.expected_context_token,undefined);
  assert.equal(response.payload.operation_request_id,requestId);
});
test('an absent operation status is UNKNOWN, with no implicit resolution or new admission',async()=>{
  const f=certificationRuntimeFixture();intercept(f,(name,input)=>name==='read_certification_ingress_status_v1'?Response.json({ok:true,contract:'certification-ingress-v1',operation_request_id:input.operation_request_id,state:'UNKNOWN',lease_id:null}):undefined);
  const result=await readCertificationIngressStatus('SCORING.SUBMIT_HOLE',{match_id:score.match_id},options(f),f.dependencies);
  assert.equal(result.payload.state,'UNKNOWN');assert.equal(result.payload.lease_id,null);assert.deepEqual(names(f),['read_certification_ingress_status_v1']);
});
test('replay-only recovery verifies full request while never obtaining write context',async()=>{
  const f=certificationRuntimeFixture();intercept(f,(name,input)=>name==='admit_certification_operation_v1'?Response.json(f.admissionFor(input,'COMMITTED',receipt)):undefined);
  const result=await replayCertificationIngress('SCORING.SUBMIT_HOLE',score,options(f),f.dependencies);
  assert.deepEqual(result.payload.result,receipt);assert.deepEqual(names(f),['admit_certification_operation_v1']);assert.equal(f.requests[0].input.replay_only,true);assert.deepEqual(f.requests[0].input.payload,score);assert.equal(f.requests[0].input.expected_context_token,undefined);
});
test('server hash conflict is preserved without recovery, execution or fallback',async()=>{
  const f=certificationRuntimeFixture();intercept(f,name=>name==='admit_certification_operation_v1'?Response.json({code:'40001',message:'CERTIFICATION_INGRESS_REQUEST_CONFLICT'},{status:409}):undefined);
  await assert.rejects(replayCertificationIngress('SCORING.SUBMIT_HOLE',score,options(f),f.dependencies),{code:'CERTIFICATION_INGRESS_REQUEST_CONFLICT',status:409});assert.deepEqual(names(f),['admit_certification_operation_v1']);
});
test('recovery rejects authority selectors, unlisted operation families and blank identity before network',async()=>{
  const f=certificationRuntimeFixture();
  for(const fn of [readCertificationIngressStatus,resolveCertificationIngress]){
    await assert.rejects(fn('WORKERS.COMPETITION_CLAIM',{},options(f),f.dependencies),{code:'CERTIFICATION_OPERATION_FORBIDDEN'});
    await assert.rejects(fn('SCORING.SUBMIT_HOLE',{generation:'fake'},options(f),f.dependencies),{code:'CERTIFICATION_INPUT_INVALID'});
    await assert.rejects(fn('SCORING.SUBMIT_HOLE',{}, {...options(f),operationRequestId:''},f.dependencies),{code:'CERTIFICATION_OPERATION_ID_REQUIRED'});
  }
  for(const key of ['ingress','lease_id','admission_generation_id','admission_sequence','request_hash'])await assert.rejects(certificationOperationRpc('SCORING.SUBMIT_HOLE',{...score,nested:{[key]:'fake'}},options(f),f.dependencies),{code:'CERTIFICATION_INPUT_INVALID'});
  assert.equal(f.requests.length,0);
});
test('closed-origin recovery cannot bypass registration or use a Production endpoint',async()=>{
  const f=certificationRuntimeFixture();
  await assert.rejects(readCertificationIngressStatus('SCORING.SUBMIT_HOLE',{}, {...options(f),env:{...f.env,SUPABASE_SCORING_MIRROR_URL:'https://ymqhhtxaywtqllynrmxe.supabase.co'}},f.dependencies),{code:'CANONICAL_RESOURCE_UNAVAILABLE'});
  assert.equal(f.requests.length,0);
});
