// UNIT / injected API proof. PostgreSQL lease and receipt provenance have
// independent integration tests; these assertions exercise shipping adapters.
import test from 'node:test';
import assert from 'node:assert/strict';
import {certificationRuntimeFixture} from './support/reliability/certification-runtime-fixture.mjs';
import {readCanonicalScoreMutationStatus} from '../lib/scoring-authority-supabase.js';
import {recoverCanonicalScoreMutation} from '../lib/scoring-mutation-recovery.js';
import {resolveIsolatedDirectorOperation} from '../lib/isolated-director-operations.js';
import {canonicalDirectorOperationsRequest} from '../lib/canonical-director-operations-client.js';
import {mutateIsolatedCanonicalDirectorMatch} from '../lib/canonical-director-overview.js';

const operationRequestId='66666666-6666-4666-8666-666666666666';
const setupInput={mode:'status',family:'TOURNAMENT_SETUP',action:'update-team',operationRequestId,
 expectedContextToken:'b'.repeat(64),payload:{expectedRevision:0,teamId:'T1',teamName:'Original team',captainPlayerId:'SYNTHETIC-P01'}};
function recoveryFixture({state='COMMITTED',receipt={ok:true,action:'UPDATE_TEAM',revision:1},materialChange=()=>{},replayError}={}){
 const f=certificationRuntimeFixture();
 f.authorization.identity.tournamentId='2027';
 f.dependencies.fetchImpl=async(url,init)=>{
  const input=JSON.parse(init.body).input;f.requests.push({url,input});
  if(url.endsWith('/read_certification_director_recovery_material_v1')){
   const material={...f.admissionFor(input,state,state==='COMMITTED'?receipt:undefined),
    admission_context:{...f.contextFor(input),operation_request_id:input.operation_request_id}};
   materialChange(material);return Response.json(material);
  }
  if(url.endsWith('/admit_certification_operation_v1')){
   assert.equal(input.replay_only,true);assert.equal(input.expected_context_token,undefined);
   return replayError?Response.json(replayError,{status:400}):Response.json(f.admissionFor(input,state,state==='COMMITTED'?receipt:undefined));
  }
  // Simulate admission/current target unavailable after close/annual advance.
  assert.match(url,/read_certification_runtime_context_v1$/);
  return Response.json({code:'42501',message:'CERTIFICATION_CONTEXT_REQUIRED'},{status:403});
 };
 return f;
}
for(const status of ['COMMITTED','UNKNOWN'])test(`score recovery preserves public ${status} DTO without open-context request`,async()=>{
 const f=certificationRuntimeFixture(),request={matchId:'2026-R1-1',mutationId:'native:original.1'};
 f.dependencies.fetchImpl=async(url,init)=>{
  const input=JSON.parse(init.body).input;f.requests.push({url,input});
  assert.match(url,/read_certification_operation_v1$/);assert.equal(input.operation_id,'SCORING.READ_MUTATION_STATUS');
  assert.equal(input.expected_context_token,undefined);
  return Response.json({ok:true,contract:'score-mutation-recovery-v1',status,match_id:request.matchId,mutation_key:request.mutationId,
   ...(status==='COMMITTED'?{result:{ok:true,code:'ACCEPTED',match_id:request.matchId,hole_number:1,match_revision:1,hole_revision:1,
    gross:{team_1:[4],team_2:[5]},strokes:{team_1:[1],team_2:[2]},net:{team_1:3,team_2:3},hole_winner:'Halved',match:{scored_holes:1}}}:{})});
 };
 const identity={authUserId:f.authorization.identity.authUserId,playerId:'SYNTHETIC-P01',tournamentId:'2027'};
 const result=await recoverCanonicalScoreMutation(identity,request,{env:f.env,
  readStatus:(input,options)=>readCanonicalScoreMutationStatus(input,{...options,certificationDependencies:f.dependencies})});
 assert.equal(result.status,status);assert.equal(result.mutationId,request.mutationId);assert.equal(f.requests.length,1);
 assert.equal(result.retry,status==='COMMITTED'?'DO_NOT_RESUBMIT':'CHECK_STATUS');
 assert.doesNotMatch(JSON.stringify(result),/ADMITTED|NOT_COMMITTED|lease_id|resource_id|admission_generation/);
});
test('Director client accepts an original committed receipt after annual advance without false current readback',async()=>{
 const f=recoveryFixture();
 const result=await canonicalDirectorOperationsRequest(setupInput,{fetchImpl:async(_url,init)=>Response.json(
  await resolveIsolatedDirectorOperation({authorization:f.authorization,input:JSON.parse(init.body),env:f.env},{certificationDependencies:f.dependencies}))});
 assert.equal(result.outcome,'COMMITTED');assert.equal(result.readbackVerified,false);assert.equal(result.context.tournamentId,'2026');
 assert.equal(result.operationRequestId,operationRequestId);assert.equal(result.receipt.revision,1);
 assert.equal(f.requests[0].input.authorization.tournament_id,'2027');
 assert.match(f.requests[0].url,/read_certification_director_recovery_material_v1$/);
 assert.equal(f.requests[1].input.payload.operation,'UPDATE_TEAM');
 assert.equal(f.requests.some(call=>call.url.endsWith('/execute_certification_operation_v1')),false);
 assert.doesNotMatch(JSON.stringify(result),/lease_id|service_role|request_hash|project_url/);
});
for(const state of ['ADMITTED','UNKNOWN','NOT_COMMITTED'])test(`Director recovery contains internal ${state} as public UNKNOWN`,async()=>{
 const f=recoveryFixture({state});
 if(state==='NOT_COMMITTED'){
  const previous=f.dependencies.fetchImpl;f.dependencies.fetchImpl=async(...args)=>{
   const response=await previous(...args),value=await response.json();
   if(value.contract==='certification-ingress-v1')value.result={ok:false,code:'CERTIFICATION_INGRESS_NOT_COMMITTED'};
   return Response.json(value,{status:response.status});
  };
 }
 const result=await resolveIsolatedDirectorOperation({authorization:f.authorization,input:setupInput,env:f.env},{certificationDependencies:f.dependencies});
 assert.equal(result.outcome,'UNKNOWN');assert.equal(result.receipt,null);assert.equal(result.committed,false);
 assert.equal(result.operationRequestId,operationRequestId);assert.equal(f.requests.length,2);
});
test('missing original lease remains unconfirmed without fabricated historical context',async()=>{
 const f=recoveryFixture({materialChange:material=>{material.lease_id=null;material.state='UNKNOWN';delete material.result;delete material.admission_context;}});
 await assert.rejects(resolveIsolatedDirectorOperation({authorization:f.authorization,input:setupInput,env:f.env},{certificationDependencies:f.dependencies}),
  {code:'DIRECTOR_OPERATIONS_RECOVERY_UNCONFIRMED',outcome:'UNKNOWN',operationRequestId});assert.equal(f.requests.length,1);
});
for(const change of ['resource','context','operation'])test(`Director origin recovery rejects mismatched ${change} before replay`,async()=>{
 const f=recoveryFixture({materialChange:value=>{
  if(change==='resource')value.admission_context.project_ref='dddddddddddddddddddd';
  if(change==='context')value.admission_context.context_token='c'.repeat(64);
  if(change==='operation')value.admission_context.operation_request_id='77777777-7777-4777-8777-777777777777';
 }});
 await assert.rejects(resolveIsolatedDirectorOperation({authorization:f.authorization,input:setupInput,env:f.env},{certificationDependencies:f.dependencies}),error=>error.outcome==='UNKNOWN');
 assert.equal(f.requests.length,1);
});
test('Director changed original request conflicts and never executes or substitutes an ID',async()=>{
 const f=recoveryFixture({replayError:{code:'23505',message:'CERTIFICATION_INGRESS_IDEMPOTENCY_CONFLICT'}});
 await assert.rejects(resolveIsolatedDirectorOperation({authorization:f.authorization,input:setupInput,env:f.env},{certificationDependencies:f.dependencies}),
  {code:'DIRECTOR_OPERATIONS_CONTEXT_STALE',status:409,operationRequestId,outcome:'UNKNOWN'});
 assert.equal(f.requests.length,2);assert.equal(f.requests[1].input.operation_request_id,operationRequestId);
});
for(const role of ['participant','spectator','signed-out','impersonated'])test(`Director recovery denies ${role} before any transport`,async()=>{
 const f=recoveryFixture();
 if(role==='signed-out')f.authorization.status='inactive';else if(role==='impersonated')f.authorization.identity.impersonating=true;
 else f.authorization.identity.actor.role=role.toUpperCase();
 await assert.rejects(resolveIsolatedDirectorOperation({authorization:f.authorization,input:setupInput,env:f.env},{certificationDependencies:f.dependencies}),
  {code:'DIRECTOR_OPERATIONS_AUTHORIZATION_REQUIRED',status:403});assert.equal(f.requests.length,0);
});
for(const action of ['clear-entry','replace-auction'])test(`financial ${action} recovery reconstructs only original admitted predecessor`,async()=>{
 const predecessor={tournament_id:'2026',publication_state:'PUBLISHED',predecessor_auction_fingerprint:'d'.repeat(64),
  players:[{player_id:'P1'},{player_id:'P2'}],predecessor_purchases:[{player_id:'P1',purchase_price:'10'}],
  predecessor_ownership:[{player_id:'P1',owner_player_id:'P2',ownership_fraction:'1'}]};
 const f=recoveryFixture({receipt:{ok:true,auction_revision:3},materialChange:value=>{value.predecessor_projection=predecessor;}});
 const input={...setupInput,family:'CALCUTTA_MANAGEMENT',action,payload:{expectedTournamentId:'2026',
  expectedConfigurationRevision:1,expectedConfigurationFingerprint:'a'.repeat(64),expectedAuctionRevision:2,
  expectedAuctionFingerprint:'d'.repeat(64),expectedPublicationRevision:0,
  ...(action==='clear-entry'?{playerId:'P1'}:{entry:{playerId:'P1',purchasePrice:'20',owners:[{buyerId:'P2',percentage:'100'}]}})}};
 const result=await resolveIsolatedDirectorOperation({authorization:f.authorization,input,env:f.env},{certificationDependencies:f.dependencies});
 assert.equal(result.committed,true);assert.equal(result.readbackVerified,false);
 const sent=f.requests[1].input;assert.equal(sent.payload.expected_auction_revision,2);
 if(action==='clear-entry')assert.equal(sent.payload.player_id,'P1');else assert.deepEqual(sent.payload.purchases,[{player_id:'P1',purchase_price:'20'}]);
 assert.equal(f.requests[0].input.payload.expected_auction_revision,undefined);
});
for(const action of ['finalize','reopen'])test(`Director ${action} lost acknowledgement recovery precedes open capability gates`,async()=>{
 const f=certificationRuntimeFixture();f.authorization.identity.tournamentId='2027';
 const input={action,matchId:'2026-R1-1',operationRequestId:'director:original.1',expectedMatchRevision:10,expectedPermissionRevision:1};
 f.dependencies.fetchImpl=async(url,init)=>{const body=JSON.parse(init.body).input;f.requests.push({url,input:body});
  assert.match(url,/read_certification_operation_v1$/);assert.equal(body.operation_id,'SCORING.READ_DIRECTOR_OPERATION_STATUS');
  return Response.json({ok:true,committed:true,receipt:{ok:true,match_id:input.matchId,match_revision:11,idempotent:true}});};
 await assert.rejects(mutateIsolatedCanonicalDirectorMatch({authorization:f.authorization,input,env:f.env},{certificationDependencies:f.dependencies,
  readCanonicalScoringAuthority:async()=>{throw new Error('Original current read no longer available');},
  finalizeCanonicalMatch:()=>assert.fail('Committed operation must not submit again'),reopenCanonicalMatch:()=>assert.fail('Committed operation must not submit again')}),
  {code:'DIRECTOR_CANONICAL_READBACK_UNCONFIRMED',committed:true,operationRequestId:input.operationRequestId});
 assert.equal(f.requests.length,1);
});
