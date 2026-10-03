// UNIT / API transport contract with synthetic registration and fetch. No hosted
// resources, real keys, database execution or implicit developer configuration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {certificationRuntimeFixture as fixture} from './support/reliability/certification-runtime-fixture.mjs';
import {resolveCertificationRuntimeContext, assertCertificationRuntimeContext, certificationOperationRpc} from '../lib/certification-runtime-server.js';
import {canonicalReadEnvironment, isolatedCanonicalDatabaseEnvironment} from '../lib/canonical-runtime-source.js';
import {scoringAuthorityEnvironment} from '../lib/scoring-authority.js';
import {scoringShadowRpc} from '../lib/scoring-shadow.js';
import {classifyDerivedFailure} from '../lib/score-derived-worker.js';

test('unregistered shipping runtime never performs network even with copied configuration',async()=>{
  const f=fixture();let calls=0;await assert.rejects(resolveCertificationRuntimeContext({env:f.env},{fetchImpl:async()=>{calls++;throw Error('not called');}}),{code:'CANONICAL_RESOURCE_UNAVAILABLE'});assert.equal(calls,0);
});
test('registration handshake is exact, bounded and redacted; caller cannot forge context',async()=>{
  const f=fixture(),context=await resolveCertificationRuntimeContext({env:f.env,phase:'SCORING'},f.dependencies);
  assert.equal(context.resource_class,'CERTIFICATION');assert.equal(context.phase,'SCORING');assert.equal(Object.isFrozen(context),true);
  assert.equal(assertCertificationRuntimeContext(context,{env:f.env,phase:'SCORING'},f.dependencies),context);
  assert.throws(()=>assertCertificationRuntimeContext({...context},{env:f.env,phase:'SCORING'},f.dependencies),{code:'CERTIFICATION_CONTEXT_REQUIRED'});
  const request=f.requests[0];assert.equal(request.url,'https://cccccccccccccccccccc.supabase.co/rest/v1/rpc/read_certification_runtime_context_v1');
  assert.equal(request.init.redirect,'error');assert.equal(request.input.contract_version,'certification-runtime-v1');assert.equal(request.input.phase,'SCORING');
  assert.equal(JSON.stringify(request.input).includes(f.env.SUPABASE_SCORING_MIRROR_SECRET_KEY),false);
  assert.equal(JSON.stringify(context).includes(f.env.SUPABASE_SCORING_MIRROR_SECRET_KEY),false);
});
for(const field of ['resource_id','installation_id','project_ref','project_url','manifest_digest','registration_revision','schema_contract','schema_digest','release_commit','deployment_id','deployment_origin','git_branch','vercel_project_id','vercel_team_id'])test(`wrong database/deployment readback denied: ${field}`,async()=>{
  const f=fixture();f.dependencies.fetchImpl=async(_url,init)=>{const context=f.contextFor(JSON.parse(init.body).input);context[field]='wrong';return Response.json({contract:'certification-runtime-v1',context});};
  await assert.rejects(resolveCertificationRuntimeContext({env:f.env},f.dependencies),{code:'CERTIFICATION_CONTEXT_INVALID'});
});
test('missing schema returns unavailable without fallback or registration attempts',async()=>{
  const f=fixture();let calls=0;f.dependencies.fetchImpl=async()=>{calls++;return Response.json({code:'PGRST202',message:'function is missing'},{status:404});};
  await assert.rejects(resolveCertificationRuntimeContext({env:f.env},f.dependencies),{code:'CERTIFICATION_SCHEMA_REQUIRED',status:503});assert.equal(calls,1);
});
test('known score operation reaches execute gateway with original operation identity and server context',async()=>{
  const f=fixture(),operationRequestId='55555555-5555-4555-8555-555555555555';
  const result=await certificationOperationRpc('SCORING.SUBMIT_HOLE',{match_id:'SYNTHETIC-R3-1',hole_number:1},{env:f.env,operationRequestId,authorization:{auth_user_id:'66666666-6666-4666-8666-666666666666',player_id:'SYNTHETIC',role:'PLAYER'}},f.dependencies);
  assert.equal(result.payload.code,'ACCEPTED');assert.equal(f.requests.length,3);
  assert.match(f.requests[1].url,/admit_certification_operation_v1$/);
  const request=f.requests[2];assert.match(request.url,/execute_certification_operation_v1$/);assert.equal(request.input.operation_request_id,operationRequestId);
  assert.equal(request.input.operation_id,'SCORING.SUBMIT_HOLE');assert.equal(request.input.phase,'SCORING');assert.equal(request.input.expected_context_token,'b'.repeat(64));
  assert.equal(request.input.resource.resource_class,'CERTIFICATION');assert.equal(request.input.authorization.player_id,'SYNTHETIC');assert.equal(Object.hasOwn(request.input.payload,'authorization'),false);
});
test('unknown operation, missing operation ID and payload authority are denied before any request',async()=>{
  const f=fixture();
  await assert.rejects(certificationOperationRpc('DROP_TABLE',{}, {env:f.env},f.dependencies),{code:'CERTIFICATION_OPERATION_FORBIDDEN'});
  await assert.rejects(certificationOperationRpc('SCORING.SUBMIT_HOLE',{}, {env:f.env},f.dependencies),{code:'CERTIFICATION_OPERATION_ID_REQUIRED'});
  for(const key of ['resource','deployment','authorization','resource_id','actor_auth_user_id','context_token'])await assert.rejects(certificationOperationRpc('SCORING.READ_AUTHORITY',{nested:{[key]:'forged'}},{env:f.env},f.dependencies),{code:'CERTIFICATION_INPUT_INVALID'});
  assert.equal(f.requests.length,0);
});
test('stale token conflicts before execute and is not silently rebound',async()=>{
  const f=fixture();await assert.rejects(certificationOperationRpc('SCORING.SUBMIT_HOLE',{}, {env:f.env,operationRequestId:'55555555-5555-4555-8555-555555555555',expectedContextToken:'c'.repeat(64)},f.dependencies),{code:'CERTIFICATION_CONTEXT_STALE',status:409});
  assert.equal(f.requests.length,1);
});
test('read context cannot confer write phase; wrong request environment cannot reuse branded context',async()=>{
  const f=fixture(),context=await resolveCertificationRuntimeContext({env:f.env},f.dependencies);
  await assert.rejects(certificationOperationRpc('SCORING.SUBMIT_HOLE',{}, {env:f.env,context,operationRequestId:'55555555-5555-4555-8555-555555555555'},f.dependencies),{code:'CERTIFICATION_CONTEXT_REQUIRED'});
  assert.throws(()=>assertCertificationRuntimeContext(context,{env:{...f.env,VERCEL_GIT_COMMIT_SHA:'c'.repeat(40)},phase:'READS'},f.dependencies),{code:'CERTIFICATION_CONTEXT_REQUIRED'});
  assert.equal(f.requests.length,1);
});
test('lost mutation response preserves same operation ID as unknown; transport has no fallback',async()=>{
  const f=fixture(),fetchImpl=f.dependencies.fetchImpl,operationRequestId='55555555-5555-4555-8555-555555555555';
  f.dependencies.fetchImpl=async(url,init)=>url.endsWith('/execute_certification_operation_v1')?Promise.reject(Error('lost response')):fetchImpl(url,init);
  await assert.rejects(certificationOperationRpc('SCORING.SUBMIT_HOLE',{}, {env:f.env,operationRequestId},f.dependencies),{code:'CERTIFICATION_TRANSPORT_UNAVAILABLE',operationRequestId,outcome:'UNKNOWN',recovery:'CHECK_STATUS_RETRY_SAME_OPERATION'});
});
test('SQL statement timeout remains typed and mutation outcome retains identity',async()=>{
  const f=fixture(),fetchImpl=f.dependencies.fetchImpl;f.dependencies.fetchImpl=async(url,init)=>url.endsWith('/execute_certification_operation_v1')?Response.json({code:'57014',message:'query cancelled'},{status:500}):fetchImpl(url,init);
  await assert.rejects(certificationOperationRpc('SCORING.SUBMIT_HOLE',{}, {env:f.env,operationRequestId:'55555555-5555-4555-8555-555555555555'},f.dependencies),{code:'CERTIFICATION_DATABASE_TIMEOUT',databaseSqlstate:'57014',outcome:'UNKNOWN'});
});
for(const [sqlstate,classification]of[['XX000','TERMINAL'],['23514','TERMINAL'],['40P01','RETRYABLE'],['57014','RETRYABLE']])
test(`worker classification retains database ${sqlstate} ahead of its HTTP envelope`,async()=>{
 const f=fixture(),original=f.dependencies.fetchImpl;
 f.dependencies.fetchImpl=(url,init)=>url.endsWith('/execute_certification_operation_v1')
  ?Response.json({code:sqlstate,message:'Synthetic SQL failure; no private data'},{status:400}):original(url,init);
 await assert.rejects(certificationOperationRpc('WORKERS.INTELLIGENCE_WRITE',{},
  {env:f.env,operationRequestId:'55555555-5555-4555-8555-555555555555'},f.dependencies),error=>{
   assert.equal(error.databaseSqlstate,sqlstate);assert.equal(error.diagnostics.code,sqlstate);
   assert.equal(classifyDerivedFailure(error).sqlstate,sqlstate);
   assert.equal(classifyDerivedFailure(error).classification,classification);
   assert.equal(JSON.stringify(error).includes('Synthetic SQL failure'),false);return true;
  });
});
test('established domain rejection preserves meaning without returning raw database details',async()=>{
  const f=fixture(),fetchImpl=f.dependencies.fetchImpl;
  f.dependencies.fetchImpl=async(url,init)=>url.endsWith('/execute_certification_operation_v1')?Response.json({code:'P0001',message:'PRODUCTION_CALCUTTA_AUCTION_REVISION_STALE',detail:'private-financial-payload'},{status:400}):fetchImpl(url,init);
  await assert.rejects(certificationOperationRpc('DIRECTOR.REPLACE_CALCUTTA_AUCTION',{}, {env:f.env,operationRequestId:'55555555-5555-4555-8555-555555555555'},f.dependencies),error=>{
    assert.equal(error.code,'CERTIFICATION_DOMAIN_REJECTED');assert.equal(error.status,409);assert.equal(error.domainCode,'PRODUCTION_CALCUTTA_AUCTION_REVISION_STALE');assert.equal(JSON.stringify(error).includes('private-financial-payload'),false);return true;
  });
});
test('explicit invalid Certification cannot borrow legacy Preview, diagnostic, Production or Google transport',async()=>{
  const f=fixture();const env={...f.env,SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co',PRODUCTION_SHADOW_CANDIDATE_ENABLED:'true',GOOGLE_SHEETS_ID:'synthetic-forbidden'};
  assert.equal(isolatedCanonicalDatabaseEnvironment(env).eligible,false);assert.equal(canonicalReadEnvironment(env,'HOME_READ_SOURCE').blocked,true);
  assert.equal(scoringAuthorityEnvironment(env).blocked,true);assert.equal(scoringAuthorityEnvironment({...env,VERCEL_ENV:'production',PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED:'true'}).blocked,true);
  await assert.rejects(scoringShadowRpc('read_tournament_live_view',{}, {env}),{code:'CANONICAL_RESOURCE_UNAVAILABLE'});
  await assert.rejects(scoringShadowRpc('claim_preview_google_outbox',{}, {env}),{code:'CERTIFICATION_LEGACY_RPC_FORBIDDEN'});
});
