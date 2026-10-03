// UNIT / API transport proof only: real adapters with an injected synthetic
// registration and fetch. PostgreSQL/hosted authority requires separate proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {certificationRuntimeFixture} from './support/reliability/certification-runtime-fixture.mjs';
import {submitCanonicalHoleScore,finalizeCanonicalMatch,reopenCanonicalMatch,readPreviewScoringParticipantContext,readCanonicalScoreMutationStatus} from '../lib/scoring-authority-supabase.js';
import {scoringShadowRpc} from '../lib/scoring-shadow.js';
import {readIsolatedDirectorOperations,mutateIsolatedDirectorOperations,resolveIsolatedDirectorOperation} from '../lib/isolated-director-operations.js';
import {certificationWorkerContext,certificationWorkerRpc} from '../lib/certification-worker-adapter.js';
import {createCurrentScoreDerivedDeliveryAdapter} from '../lib/score-derived-delivery.js';
import {participantIdentityRpc} from '../lib/participant-identity-supabase.js';
const operationRequestId='66666666-6666-4666-8666-666666666666';
const setup=revision=>({ok:true,data:{contractVersion:'production-tournament-setup-v1',revision,tournament:{id:'2026',year:2026,name:'Synthetic'},teams:[],roster:[],rounds:[],courses:[],matches:[],readiness:{state:'SETUP_REQUIRED',sections:[]},audit:[],capabilities:{}}});
function intercept(f, fn) {const original=f.dependencies.fetchImpl;f.dependencies.fetchImpl=async(url,init)=>{
  const input=JSON.parse(init.body).input;
  if(url.endsWith('/read_certification_runtime_context_v1')||url.endsWith('/admit_certification_operation_v1')||url.endsWith('/mark_certification_ingress_unknown_v1'))return original(url,init);
  f.requests.push({url,init,input});return fn(input,url);
};}
for(const [fn,id,phase] of [[submitCanonicalHoleScore,'SCORING.SUBMIT_HOLE','SCORING'],[finalizeCanonicalMatch,'SCORING.FINALIZE_MATCH','SCORING'],[reopenCanonicalMatch,'SCORING.REOPEN_MATCH','DIRECTOR']])test(`score adapter preserves existing non-UUID mutation identity: ${id}`,async()=>{
  const f=certificationRuntimeFixture(),mutation='native:device-7.score_18';
  const authorization={auth_user_id:f.authorization.identity.authUserId,player_id:'SYNTHETIC-P01',role:'DIRECTOR',tournament_id:'2026'};
  const payload={match_id:'R1-M1',mutation_key:mutation,expected_match_revision:2,authorization};
  const result=await fn(payload,{env:f.env,certificationDependencies:f.dependencies});assert.equal(result.payload.ok,true);
  const sent=f.requests.at(-1).input;assert.equal(sent.operation_id,id);assert.equal(sent.operation_request_id,mutation);assert.equal(sent.payload.mutation_key,mutation);assert.equal(sent.phase,phase);
  assert.deepEqual(sent.authorization,authorization);assert.equal(Object.hasOwn(sent.payload,'authorization'),false);
  assert.equal(sent.resource.resource_class,'CERTIFICATION');assert.equal(JSON.stringify(sent).includes('PRODUCTION'),false);
});
test('participant context adapter separates server-bound actor fields without changing caller DTO',async()=>{
  const f=certificationRuntimeFixture();await readPreviewScoringParticipantContext({tournament_id:'2026',match_id:'R1-M1',player_id:'SYNTHETIC-P01',auth_user_id:f.authorization.identity.authUserId,role:'PLAYER',permission_revision:3,production_verified:true},{env:f.env,certificationDependencies:f.dependencies});
  const sent=f.requests.at(-1).input;assert.equal(sent.operation_id,'SCORING.READ_PARTICIPANT_CONTEXT');assert.equal(sent.authorization.player_id,'SYNTHETIC-P01');assert.equal(Object.hasOwn(sent.payload,'player_id'),false);assert.equal(sent.payload.permission_revision,3);
});
test('receipt recovery remains an exact read and retains mutation identity after revocation',async()=>{
  const f=certificationRuntimeFixture();await readCanonicalScoreMutationStatus({match_id:'R1-M1',mutation_key:'device:lost.001',authorization:{auth_user_id:f.authorization.identity.authUserId,player_id:'SYNTHETIC-P01',tournament_id:'2026',role:'PLAYER'}},{env:f.env,certificationDependencies:f.dependencies});
  const sent=f.requests.at(-1);assert.match(sent.url,/read_certification_operation_v1$/);assert.equal(sent.input.phase,'READS');assert.equal(sent.input.payload.mutation_key,'device:lost.001');
});
for(const [alias,operation,surface] of [['read_tournament_live_view','READS.CURRENT_VIEW','TOURNAMENT_LIVE'],['read_leaderboards_core_view','READS.CURRENT_VIEW','LEADERBOARDS'],['read_canonical_2026_historical_view','READS.HISTORY_2026'],['read_preview_completed_history','READS.COMPLETED_HISTORY'],['read_current_guide_projection','READS.GUIDE'],['read_preview_draft_view','READS.DRAFT'],['read_championship_odds_inputs','READS.CURRENT_VIEW','ODDS_INPUT'],['read_preview_secondary_history_players','READS.PLAYER_EDITORIAL']])test(`read alias uses admitted projection gateway: ${alias}`,async()=>{
  const f=certificationRuntimeFixture();await scoringShadowRpc(alias,{target_tournament_id:'2026'},{env:f.env,certificationDependencies:f.dependencies});
  const sent=f.requests.at(-1);assert.match(sent.url,/read_certification_projection_v1$/);assert.equal(sent.input.operation,operation);if(surface)assert.equal(sent.input.payload.surface,surface);
  assert.equal(sent.input.resource.resource_class,'CERTIFICATION');assert.equal(Object.hasOwn(sent.input.payload,'environment'),false);
});
test('unlisted legacy mutation, publication, Google and import aliases never dispatch',async()=>{
  const f=certificationRuntimeFixture();for(const name of ['import_preview_championship_odds_inputs','publish_preview_championship_odds','claim_preview_google_outbox','replace_preview_scoring_authority_import'])await assert.rejects(scoringShadowRpc(name,{}, {env:f.env,certificationDependencies:f.dependencies}),{code:'CERTIFICATION_LEGACY_RPC_FORBIDDEN'});assert.equal(f.requests.length,0);
});
test('read aliases reject supplied resource or historical workbook authority before transport',async()=>{
  const f=certificationRuntimeFixture();for(const body of [{resource:{}},{input:{environment:'PRODUCTION'}},{target_source_workbook_id:'untrusted-workbook'}])await assert.rejects(scoringShadowRpc('read_tournament_live_view',body,{env:f.env,certificationDependencies:f.dependencies}),{code:'CERTIFICATION_INPUT_INVALID'});assert.equal(f.requests.length,0);
});
for(const family of ['TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL','NET_SKINS_ENTRIES','CALCUTTA_MANAGEMENT'])test(`Director family read uses canonical context and separate actor: ${family}`,async()=>{
  const f=certificationRuntimeFixture();intercept(f,input=>Response.json(family==='NET_SKINS_ENTRIES'?{ok:true,data:{contract:'production-net-skins-entries-v1',tournamentId:'2026',rounds:[]}}:family==='CALCUTTA_MANAGEMENT'?{ok:true,tournament_id:'2026',players:[],purchases:[],ownership:[]}:setup(1)));
  const result=await readIsolatedDirectorOperations({authorization:f.authorization,family,env:f.env},{certificationDependencies:f.dependencies});
  assert.equal(result.authority,'supabase');assert.equal(result.googleRequests,0);assert.equal(result.context.tournamentId,'2026');
  const sent=f.requests.at(-1).input;assert.equal(sent.phase,'DIRECTOR');assert.equal(sent.authorization.role,'DIRECTOR');assert.equal(sent.authorization.auth_user_id,f.authorization.identity.authUserId);assert.equal(Object.hasOwn(sent.payload,'authorization'),false);
});
test('Director setup mutation confirms existing receipt and canonical readback; contract stays provider-neutral',async()=>{
  const f=certificationRuntimeFixture();let saved=false;intercept(f,input=>{if(input.operation_id==='DIRECTOR.READ_SETUP')return Response.json(setup(saved?1:0));assert.equal(input.operation_id,'DIRECTOR.MUTATE_SETUP');saved=true;return Response.json({ok:true,action:'UPDATE_TEAM',revision:1,idempotent:false});});
  const input={family:'TOURNAMENT_SETUP',action:'update-team',operationRequestId,expectedContextToken:'b'.repeat(64),payload:{expectedRevision:0,teamId:'T1',teamName:'Synthetic Team',captainPlayerId:'SYNTHETIC-P01'}};
  const result=await mutateIsolatedDirectorOperations({authorization:f.authorization,input,env:f.env},{certificationDependencies:f.dependencies});
  assert.equal(result.outcome,'COMMITTED');assert.equal(result.readbackVerified,true);assert.equal(result.operationRequestId,operationRequestId);assert.equal(result.data.revision,1);assert.equal(result.contract,'isolated-director-operations-v1');
  const sent=f.requests.find(r=>r.input.operation_id==='DIRECTOR.MUTATE_SETUP').input;assert.equal(sent.operation_request_id,operationRequestId);assert.equal(sent.payload.action,'update-team');assert.equal(sent.payload.operation,'UPDATE_TEAM');assert.equal(sent.authorization.passport_verified,true);
});
for(const [family,projection]of[
 ['NET_SKINS_ENTRIES',{contract:'production-net-skins-entries-v1',tournamentId:'2026',rounds:[]}],
 ['CALCUTTA_MANAGEMENT',{tournament_id:'2026',players:[],purchases:[],ownership:[]}],
])test(`Director admits the canonical direct ${family} projection but never a denial or wrong target`,async()=>{
 const f=certificationRuntimeFixture();let value=projection;intercept(f,()=>Response.json(value));
 const read=()=>readIsolatedDirectorOperations({authorization:f.authorization,family,env:f.env},{certificationDependencies:f.dependencies});
 const result=await read();assert.equal(result.ok,true);assert.equal(result.googleRequests,0);
 value={...projection,ok:false,code:'EXPLICIT_DOMAIN_DENIAL'};
 await assert.rejects(read(),{code:'DIRECTOR_OPERATIONS_DOMAIN_REJECTED',status:409});
 value={...projection,tournamentId:'OTHER',tournament_id:'OTHER'};await assert.rejects(read());
 value={};await assert.rejects(read());
 assert.ok(f.requests.every(row=>!row.url.endsWith('/execute_certification_operation_v1')));
});
for(const authority of ['PLAYER','SPECTATOR','signed-out','impersonated','wrong-target'])test(`Director authorization rejects ${authority} without mutation`,async()=>{
  const f=certificationRuntimeFixture(),authorization=structuredClone(f.authorization);
  if(authority==='signed-out')authorization.status='inactive';else if(authority==='impersonated')authorization.identity.impersonating=true;else if(authority==='wrong-target')authorization.identity.tournamentId='2027';else authorization.identity.actor.role=authority;
  await assert.rejects(readIsolatedDirectorOperations({authorization,env:f.env},{certificationDependencies:f.dependencies}),e=>e.status===403);assert.equal(f.requests.some(r=>r.url.endsWith('/execute_certification_operation_v1')),false);
});
test('Director stale token fails conflict without rebinding or dispatching mutation',async()=>{
  const f=certificationRuntimeFixture();await assert.rejects(readIsolatedDirectorOperations({authorization:f.authorization,family:'TOURNAMENT_SETUP',expectedContextToken:'c'.repeat(64),env:f.env},{certificationDependencies:f.dependencies}),{code:'DIRECTOR_OPERATIONS_CONTEXT_STALE',status:409});assert.equal(f.requests.length,1);
});
test('Director recovery verifies original admitted context and full request without current admission',async()=>{
  const f=certificationRuntimeFixture();f.dependencies.fetchImpl=async(url,init)=>{
    const input=JSON.parse(init.body).input;f.requests.push({url,init,input});
    if(url.endsWith('/read_certification_director_recovery_material_v1'))return Response.json({...f.admissionFor(input,'UNKNOWN'),
      admission_context:{...f.contextFor(input),context_token:'c'.repeat(64),operation_request_id:input.operation_request_id}});
    assert.match(url,/admit_certification_operation_v1$/);assert.equal(input.replay_only,true);
    return Response.json(f.admissionFor(input,'UNKNOWN'));
  };
  const input={mode:'status',family:'TOURNAMENT_SETUP',action:'update-team',operationRequestId,expectedContextToken:'c'.repeat(64),payload:{expectedRevision:0,teamId:'T1',teamName:'Synthetic Team',captainPlayerId:'SYNTHETIC-P01'}};
  const result=await resolveIsolatedDirectorOperation({authorization:f.authorization,input,env:f.env},{certificationDependencies:f.dependencies});assert.equal(result.outcome,'UNKNOWN');
  assert.equal(result.context.contextToken,'c'.repeat(64));
  const sent=f.requests.at(-1).input;assert.equal(sent.expected_context_token,undefined);assert.equal(sent.payload.action,'update-team');
  assert.equal(sent.operation_request_id,operationRequestId);assert.equal(f.requests.length,2);
  assert.equal(f.requests.some(r=>r.url.endsWith('/execute_certification_operation_v1')),false);
});
for(const [name,id] of [['score_derived_delivery_tick_v1','WORKERS.DELIVERY_TICK'],['claim_competition_derived_jobs','WORKERS.COMPETITION_CLAIM'],['claim_intelligence_derived_bundle','WORKERS.INTELLIGENCE_CLAIM'],['claim_production_calcutta_v1_recalculation','WORKERS.CALCUTTA_CLAIM']])test(`worker preserves lease and exact authority: ${name}`,async()=>{
  const f=certificationRuntimeFixture();await certificationWorkerRpc(name,{environment:'PREVIEW',tournament_id:'2026',operation_id:operationRequestId,worker_id:'synthetic-worker',lease_seconds:30,claim_token:'synthetic-claim'},{env:f.env,certificationDependencies:f.dependencies});
  const sent=f.requests.at(-1).input;assert.equal(sent.operation_id,id);assert.equal(sent.operation_request_id,operationRequestId);assert.equal(sent.payload.claim_token,'synthetic-claim');assert.equal(sent.payload.lease_seconds,30);assert.equal(sent.phase,'WORKERS');assert.equal(Object.hasOwn(sent.payload,'environment'),false);
});
test('worker rejects unknown functions, Production-tagged payload and forged supplied context',async()=>{
  const f=certificationRuntimeFixture();await assert.rejects(certificationWorkerRpc('publish_production_calcutta_v1',{}, {env:f.env,certificationDependencies:f.dependencies}),{code:'CERTIFICATION_OPERATION_FORBIDDEN'});
  await assert.rejects(certificationWorkerRpc('score_derived_delivery_tick_v1',{environment:'PRODUCTION'}, {env:f.env,certificationDependencies:f.dependencies}),{code:'CERTIFICATION_INPUT_INVALID'});
  await assert.rejects(certificationWorkerContext({env:f.env,certificationDependencies:f.dependencies,scoringDispatchContext:{phase:'WORKERS'}}),{code:'CERTIFICATION_CONTEXT_REQUIRED'});assert.equal(f.requests.length,0);
});
test('current worker factory selects Certification without importing a Production runtime or requiring Google',async()=>{
  const f=certificationRuntimeFixture();intercept(f,()=>Response.json({ok:true,materialized:0,scope:{tournamentId:'2026'},work:[]}));
  const adapter=await createCurrentScoreDerivedDeliveryAdapter({env:f.env,certificationDependencies:f.dependencies});const result=await adapter.tick({workerId:'synthetic-worker',operationId:operationRequestId});assert.equal(result.ok,true);assert.equal(f.requests.filter(r=>r.input.operation_id==='WORKERS.DELIVERY_TICK').length,3);assert.ok(f.requests.every(r=>r.url.startsWith('https://cccccccccccccccccccc.supabase.co/')));
});
test('identity reads use admitted gateway; provider administration and participant messaging are unavailable',async()=>{
  const f=certificationRuntimeFixture();for(const name of ['read_participant_identity_context_for_auth','read_production_director_entitlement','read_preview_director_entitlement'])await participantIdentityRpc(name,{target_auth_user_id:f.authorization.identity.authUserId,target_tournament_id:'2026'},{env:f.env,certificationDependencies:f.dependencies});
  const reads=f.requests.filter(r=>r.url.endsWith('/read_certification_projection_v1'));assert.equal(reads.length,3);assert.deepEqual(reads.map(r=>r.input.operation),['READS.IDENTITY_FOR_AUTH','READS.DIRECTOR_ENTITLEMENT','READS.DIRECTOR_ENTITLEMENT']);
  for(const name of ['admin_link_auth_user_to_player','authorize_single_participant_otp_request','begin_participant_phone_login','grant_production_director_entitlement'])await assert.rejects(participantIdentityRpc(name,{}, {env:f.env,certificationDependencies:f.dependencies}),{code:'CERTIFICATION_IDENTITY_OPERATION_FORBIDDEN'});assert.equal(f.requests.length,6);
});
