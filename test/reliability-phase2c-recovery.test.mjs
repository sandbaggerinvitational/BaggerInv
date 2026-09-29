// Proof layer: UNIT / API handler. Provider boundaries are explicit test doubles.
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeScoreRecoveryRequest, recoverCanonicalScoreMutation, assertScoreRecoveryIdentity,
  SCORE_RECOVERY_CONTRACT } from '../lib/scoring-mutation-recovery.js';
import { createScoreMutationRecoveryHandler } from '../lib/scoring-mutation-recovery-route.js';
import { environment as nativeEnvironment, request as nativeRequest } from './fixtures/pn2-native.mjs';
import { resetRateLimitsForTests } from '../lib/rate-limit.js';
import { withOperationalRoute } from '../lib/operational-telemetry.js';
const identity={authUserId:'10000000-0000-4000-8000-000000000023',playerId:'P23',tournamentId:'2026'};
const value={matchId:'2026-R3-12',mutationId:'00000000-0000-4000-8000-000000000001'};
const response=(status='UNKNOWN')=>({payload:{ok:true,contract:SCORE_RECOVERY_CONTRACT,status,
 match_id:value.matchId,mutation_key:value.mutationId,...(status==='COMMITTED'?{result:{ok:true,code:'ACCEPTED',
 match_id:value.matchId,hole_number:1,match_revision:1,hole_revision:1,updated_at:'2026-09-28T12:00:00.123456Z',
 gross:{team_1:[4],team_2:[5]},strokes:{team_1:[1],team_2:[2]},net:{team_1:3,team_2:3},hole_winner:'Halved',match:{scored_holes:1},
 originating_auth_user_id:identity.authUserId,payload_hash:'not-for-client',google_target_match_id:'not-for-client'}}:{})}});
const request=(body=value,headers={})=>new Request('https://isolated.invalid/api/scoring/mutation-status',{
 method:'POST',headers:{'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const handler=extra=>createScoreMutationRecoveryHandler({env:{},resolveIdentity:async()=>identity,
 readStatus:async()=>response(),rateLimit:()=>({allowed:true}),...extra});

test('recovery strict request accepts only exact match/mutation IDs',()=>{
 assert.deepEqual(normalizeScoreRecoveryRequest(value),value);
 for(const bad of [null,[],{}, {...value,authorization:{role:'DIRECTOR'}}, {...value,tournamentId:'2027'},
 {...value,team1GrossScores:[4]}, {...value,matchId:'x'.repeat(121)}, {...value,mutationId:'x'.repeat(161)},
 {...value,mutationId:'../receipt'}, {...value,mutationId:'secret@example.test'}, {...value,matchId:24}])
 assert.throws(()=>normalizeScoreRecoveryRequest(bad),{code:'SCORE_RECOVERY_INVALID_REQUEST'});
});
test('recovery identity refuses signed out, observer, impersonation and invalid scope',()=>{
 assert.equal(assertScoreRecoveryIdentity(identity),identity);
 for(const bad of [null,{}, {...identity,kind:'observer'}, {...identity,impersonation:{}},
 {...identity,previewMode:true}, {...identity,playerId:''}, {...identity,tournamentId:'private'},
 {...identity,authUserId:'not-an-auth-id'}])assert.throws(()=>assertScoreRecoveryIdentity(bad));
});
test('only exact committed receipt is projected; private fields excluded',async()=>{
 let seen;
 const recovered=await recoverCanonicalScoreMutation(identity,value,{readStatus:async input=>{seen=input;return response('COMMITTED');}});
 assert.equal(recovered.status,'COMMITTED');assert.equal(recovered.retry,'DO_NOT_RESUBMIT');
 assert.equal(seen.authorization.auth_user_id,identity.authUserId);assert.equal(seen.authorization.role,'PLAYER');
 assert.deepEqual(recovered.canonical.gross,{team_1:[4],team_2:[5]});
 assert.doesNotMatch(JSON.stringify(recovered),/originating_auth|payload_hash|google_target|000000000023/);
});
test('unknown is never NOT_COMMITTED and does not return a canonical guess',async()=>{
 const recovered=await recoverCanonicalScoreMutation(identity,value,{readStatus:async()=>response()});
 assert.deepEqual(recovered,{contract:SCORE_RECOVERY_CONTRACT,status:'UNKNOWN',...value,retry:'CHECK_STATUS'});
});
test('corrupt or mismatched provider responses fail closed without false outcome',async()=>{
 for(const changed of [{status:'NOT_COMMITTED'},{status:'COMMITTED'},{match_id:'other'},{mutation_key:'other'},{contract:'v0'},{ok:false}]){
 const bad=response();Object.assign(bad.payload,changed);
 await assert.rejects(recoverCanonicalScoreMutation(identity,value,{readStatus:async()=>bad}),{code:'SCORE_RECOVERY_UNAVAILABLE'});
 }
});
test('route response is private no-store with request correlation preserved',async()=>{
 const result=await handler()(request(value,{'x-request-id':'c0ffee00-0000-4000-8000-000000000001'}));
 assert.equal(result.status,200);assert.equal((await result.json()).status,'UNKNOWN');
 assert.match(result.headers.get('cache-control'),/no-store/);assert.ok(result.headers.get('x-request-id'));
});
test('route denies malformed and oversized streams before database lookup',async()=>{
 let calls=0;const h=handler({readStatus:async()=>{calls++;return response();}});
 for(const body of ['{',JSON.stringify({...value,mutationId:'a'.repeat(1600)}),JSON.stringify({...value,authUserId:identity.authUserId})]){
 const result=await h(request(body));assert.equal(result.status,400);assert.equal((await result.json()).status,'UNKNOWN');
 }
 assert.equal(calls,0);
});
test('route preserves unknown on timeout, connection failure and secret-bearing errors',async()=>{
 for(const code of ['57014','08006','57P01']){
 const result=await handler({readStatus:async()=>{throw Object.assign(new Error('Bearer SECRET postgres://private'),{code});}})(request());
 assert.equal(result.status,503);const text=await result.text();assert.match(text,/UNKNOWN/);assert.doesNotMatch(text,/SECRET|postgres|57014|08006/);
 }
});
test('auth failure does not call receipt provider',async()=>{
 let calls=0;
 for(const status of [401,403]){
 const result=await handler({resolveIdentity:async()=>{throw Object.assign(new Error('private'),{status});},readStatus:async()=>{calls++;}})(request());
 assert.equal(result.status,status);assert.equal((await result.json()).status,'UNKNOWN');
 }
 assert.equal(calls,0);
});
test('rate limiting is by authenticated account, independent of guessed mutation IDs',async()=>{
 resetRateLimitsForTests();let calls=0;
 const h=createScoreMutationRecoveryHandler({env:{},resolveIdentity:async()=>identity,readStatus:async input=>{
 calls++;return {payload:{...response().payload,mutation_key:input.mutation_key}};}});
 for(let n=0;n<60;n++)assert.equal((await h(request({...value,mutationId:`guess-${n}`}))).status,200);
 const denied=await h(request({...value,mutationId:'new-guess'}));assert.equal(denied.status,429);assert.equal(calls,60);
 assert.ok(denied.headers.get('retry-after'));resetRateLimitsForTests();
});
test('mobile read authority is rechecked and revocation cannot leak receipt',async()=>{
 let checked=0;
 const h=handler({mobile:true,readStatus:async()=>response('COMMITTED'),recheckIdentity:async()=>{checked++;throw Object.assign(new Error('revoked'),{status:403});}});
 const result=await h(request());assert.equal(result.status,403);assert.equal(checked,1);
 assert.equal((await result.json()).status,'UNKNOWN');
});

test('mobile recovery default-off denies through real factory before any identity or receipt transport',async()=>{
 const env=nativeEnvironment();delete env.PRODUCTION_NATIVE_CAPABILITIES;
 const originalFetch=globalThis.fetch;let network=0,receipts=0;
 globalThis.fetch=async()=>{network++;throw new Error('No provider transport permitted');};
 try{
  const h=createScoreMutationRecoveryHandler({mobile:true,env,readStatus:async()=>{receipts++;return response();}});
  const result=await h(nativeRequest('scoring/mutation-status',{method:'POST',body:value,
   headers:{'content-type':'application/json',authorization:'Bearer synthetic','x-bagger-certification':'synthetic'}}));
  assert.equal(result.status,503);const body=await result.json();assert.equal(body.error.code,'NATIVE_READS_DISABLED');
  assert.equal(body.status,'UNKNOWN');assert.equal(network,0);assert.equal(receipts,0);
 }finally{globalThis.fetch=originalFetch;}
});

// UNIT / actual API-handler runtime. Provider identity/receipts below are
// explicit doubles; these assertions do not claim database or hosted proof.
const telemetryRequestId='c0ffee00-0000-4000-8000-000000000099';
const privateTelemetryMarker='PRIVATE_RECOVERY_DIAGNOSTIC';
function observedRecovery(extra={},sinkOverride) {
 const events=[];
 const route=createScoreMutationRecoveryHandler({env:{},resolveIdentity:async()=>identity,
  readStatus:async()=>response('COMMITTED'),rateLimit:()=>({allowed:true}),...extra});
 // Use the existing Phase1 wrapper/sink option. Its nested-context behavior
 // enters the actual recovery handler, without adding a shipping test seam.
 const run=withOperationalRoute({route:'/api/scoring/mutation-status',domain:'SCORING'},route,{
  enabled:true,env:{BAGGER_TELEMETRY_RELEASE_ID:'139',BAGGER_TELEMETRY_ACTIVATION_REVISION:'238',
   VERCEL_GIT_COMMIT_SHA:'7'.repeat(40)},sink:sinkOverride||((event)=>events.push(event))});
 return{run,events};
}
function telemetryRequest() {
 return request(value,{'x-request-id':telemetryRequestId,
  authorization:`Bearer ${privateTelemetryMarker}`,cookie:`session=${privateTelemetryMarker}`,
  'x-private-otp':privateTelemetryMarker});
}
function assertSafeRecoveryEvents(events,{trustedMutation=true}={}) {
 assert.ok(events.length>0);
 for(const event of events){
  assert.equal(event.domain,'SCORING');assert.equal(event.route,'/api/scoring/mutation-status');
  assert.equal(event.request_id,telemetryRequestId);assert.equal(event.correlation_id,telemetryRequestId);
  assert.equal(event.release,139);assert.equal(event.activation,238);assert.equal(event.sha,'7'.repeat(40));
  assert.equal(event.release_source,'DEPLOYMENT_CONFIG');assert.equal(event.activation_source,'DEPLOYMENT_CONFIG');
  assert.equal(event.mutation_id,trustedMutation?value.mutationId:null);assert.equal(event.match_id,trustedMutation?value.matchId:null);
 }
 const serialized=JSON.stringify(events);
 for(const privateValue of [identity.authUserId,privateTelemetryMarker,'not-for-client','private-database-password'])
  assert.equal(serialized.includes(privateValue),false,`Telemetry disclosed private fixture value ${privateValue}`);
 assert.doesNotMatch(serialized,/"(?:gross|strokes|net|authorization|headers|cookie|password|payload_hash|originating_auth_user_id)"/);
}
test('recovery telemetry emits safe SCORING correlation and committed/unknown knowledge from actual handler',async()=>{
 for(const status of ['COMMITTED','UNKNOWN']){
  const {run,events}=observedRecovery({readStatus:async()=>response(status)});
  const result=await run(telemetryRequest());assert.equal(result.status,200);assert.equal((await result.json()).status,status);
  assert.equal(result.headers.get('x-request-id'),telemetryRequestId);assertSafeRecoveryEvents(events);
  const outcomes=events.filter(event=>event.event==='OUTCOME');assert.equal(outcomes.length,1);
  assert.equal(outcomes[0].phase,'mutation_recovery');assert.equal(outcomes[0].outcome,status);
  const summary=events.filter(event=>event.event==='REQUEST');assert.equal(summary.length,1);
  assert.equal(summary[0].http_status,200);assert.ok(Number.isFinite(summary[0].latency_ms));
  assert.equal(summary[0].outcome,'NOT_APPLICABLE','A status read is not a new canonical mutation');
 }
});
test('recovery telemetry records authentication/authorization denials without trusting requested mutation identity',async()=>{
 for(const status of [401,403]){
  let calls=0;
  const {run,events}=observedRecovery({resolveIdentity:async()=>{throw Object.assign(new Error(privateTelemetryMarker),
   {status,code:status===401?'AUTH_SESSION_REQUIRED':'AUTHORIZATION_DENIED',authUserId:identity.authUserId});},
   readStatus:async()=>{calls++;return response('COMMITTED');}});
  const result=await run(telemetryRequest());assert.equal(result.status,status);assert.equal((await result.json()).status,'UNKNOWN');
  assert.equal(calls,0);assertSafeRecoveryEvents(events,{trustedMutation:false});
  assert.equal(events.some(event=>event.event==='OUTCOME'),false);
  const denial=events.find(event=>event.event==='DOMAIN_ERROR');assert.ok(denial);
  assert.equal(denial.error_class,status===401?'AUTH_INVALID':'AUTHORIZATION_DENIED');
  assert.equal(events.find(event=>event.event==='REQUEST').http_status,status);
 }
});
test('recovery telemetry classifies database timeout and connection errors without logging diagnostic payloads',async()=>{
 for(const [code,errorClass] of [['57014','DATABASE_TIMEOUT'],['08006','DATABASE_UNAVAILABLE']]){
  const {run,events}=observedRecovery({readStatus:async()=>{throw Object.assign(new Error(privateTelemetryMarker),
   {code,authUserId:identity.authUserId,connectionString:'postgres://private-database-password',
    headers:{authorization:`Bearer ${privateTelemetryMarker}`},diagnostics:{message:privateTelemetryMarker}});}});
  const result=await run(telemetryRequest());assert.equal(result.status,503);const body=await result.json();assert.equal(body.status,'UNKNOWN');
  assertSafeRecoveryEvents(events);assert.equal(events.some(event=>event.event==='OUTCOME'),false);
  for(const event of events.filter(event=>['DOMAIN_ERROR','REQUEST'].includes(event.event))){
   assert.equal(event.sqlstate,code);assert.equal(event.error_class,errorClass);
  }
  assert.equal(events.find(event=>event.event==='REQUEST').http_status,503);
 }
});
test('optional synchronous or asynchronous telemetry sink failure cannot turn a committed receipt read into failure',async()=>{
 for(const sink of [()=>{throw new Error('sink unavailable');},()=>Promise.reject(new Error('export unavailable'))]){
  let reads=0;const {run}=observedRecovery({readStatus:async()=>{reads++;return response('COMMITTED');}},sink);
  const result=await run(telemetryRequest());assert.equal(result.status,200);const body=await result.json();
  assert.equal(body.status,'COMMITTED');assert.equal(body.mutationId,value.mutationId);assert.equal(reads,1);
  await new Promise(resolve=>setImmediate(resolve));
 }
});
