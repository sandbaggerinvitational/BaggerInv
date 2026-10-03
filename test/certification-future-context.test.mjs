// UNIT / real server adapter with injected synthetic resource and transport.
// The annual PostgreSQL transition integration independently proves resource authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import {certificationRuntimeFixture} from './support/reliability/certification-runtime-fixture.mjs';
import {readIsolatedDirectorOperations} from '../lib/isolated-director-operations.js';
import {canonicalDirectorOperationsRequest} from '../lib/canonical-director-operations-client.js';
import {participantIdentityRpc} from '../lib/participant-identity-supabase.js';
function futureFixture({identityTarget='2097',contextTarget='2097',token='b'.repeat(64)}={}) {
 const f=certificationRuntimeFixture();f.authorization.identity.tournamentId=identityTarget;
 f.dependencies.fetchImpl=async(url,init)=>{
  const input=JSON.parse(init.body).input;f.requests.push({url,input});
  if(url.endsWith('/read_certification_runtime_context_v1'))return Response.json({contract:'certification-runtime-v1',context:{...f.contextFor(input),
   current_tournament_id:contextTarget,tournament_id:contextTarget,current_tournament_year:Number(contextTarget),pointer_revision:2,
   governance_tournament_id:'2026',context_token:token}});
  assert.match(url,/read_certification_operation_v1$/);assert.equal(input.operation_id,'DIRECTOR.READ_SETUP');
  assert.equal(input.payload.family,'MATCH_CONTROL');assert.equal(input.authorization.tournament_id,'2097');
  return Response.json({ok:true,data:{tournament:{tournamentId:contextTarget},matches:[]}});
 };
 return f;
}
test('future Director current target and immutable governance authority remain separately bound',async()=>{
 const f=futureFixture();const result=await readIsolatedDirectorOperations({authorization:f.authorization,family:'MATCH_CONTROL',env:f.env},{certificationDependencies:f.dependencies});
 assert.equal(result.context.tournamentId,'2097');assert.equal(result.context.governanceTournamentId,'2026');
 assert.equal(result.googleRequests,0);assert.equal(result.fallbackUsed,false);assert.equal(f.requests.length,2);
});
test('shipping Director client parses separately bound future current and governance from the actual server adapter',async()=>{
 const f=futureFixture();const result=await canonicalDirectorOperationsRequest(null,{family:'MATCH_CONTROL',fetchImpl:async()=>Response.json(
  await readIsolatedDirectorOperations({authorization:f.authorization,family:'MATCH_CONTROL',env:f.env},{certificationDependencies:f.dependencies}))});
 assert.equal(result.context.tournamentId,'2097');assert.equal(result.context.governanceTournamentId,'2026');
 assert.deepEqual(result.data.matches,[]);assert.equal(f.requests.length,2);
});
test('client retains ordinary 2026 context compatibility and rejects malformed authority identifiers',async()=>{
 const f=futureFixture();const valid=await readIsolatedDirectorOperations({authorization:f.authorization,family:'MATCH_CONTROL',env:f.env},{certificationDependencies:f.dependencies});
 const ordinary={...valid,context:{...valid.context,tournamentId:'2026',governanceTournamentId:'2026'}};
 assert.equal((await canonicalDirectorOperationsRequest(null,{family:'MATCH_CONTROL',fetchImpl:async()=>Response.json(ordinary)})).context.tournamentId,'2026');
 for(const patch of[{tournamentId:''},{tournamentId:'../2026'},{tournamentId:2097},{governanceTournamentId:''},{governanceTournamentId:'2026/other'},{governanceTournamentId:2026}])
  await assert.rejects(canonicalDirectorOperationsRequest(null,{family:'MATCH_CONTROL',fetchImpl:async()=>Response.json({...valid,context:{...valid.context,...patch}})}),{code:'DIRECTOR_OPERATIONS_RESPONSE_INVALID'});
});
for(const identityTarget of ['2026','2098'])test(`future Director rejects wrong identity target ${identityTarget}`,async()=>{
 const f=futureFixture({identityTarget});await assert.rejects(readIsolatedDirectorOperations({authorization:f.authorization,family:'MATCH_CONTROL',env:f.env},{certificationDependencies:f.dependencies}),{code:'DIRECTOR_OPERATIONS_SCOPE_MISMATCH'});
 assert.equal(f.requests.length,1);
});
test('future Director stale context remains conflict with no read or write fallback',async()=>{
 const f=futureFixture();await assert.rejects(readIsolatedDirectorOperations({authorization:f.authorization,family:'MATCH_CONTROL',expectedContextToken:'a'.repeat(64),env:f.env},{certificationDependencies:f.dependencies}),{code:'DIRECTOR_OPERATIONS_CONTEXT_STALE'});
 assert.equal(f.requests.length,1);
});
for(const role of ['PLAYER','SPECTATOR','signed-out','impersonating'])test(`future Director ${role} has no authority expansion`,async()=>{
 const f=futureFixture();if(role==='signed-out')f.authorization.status='inactive';else if(role==='impersonating')f.authorization.identity.impersonating=true;else f.authorization.identity.actor.role=role;
 await assert.rejects(readIsolatedDirectorOperations({authorization:f.authorization,family:'MATCH_CONTROL',env:f.env},{certificationDependencies:f.dependencies}),{code:'DIRECTOR_OPERATIONS_AUTHORIZATION_REQUIRED'});assert.equal(f.requests.length,0);
});

function identityFixture({returnedTarget='2097',failContext=false}={}){
 const f=certificationRuntimeFixture();
 f.dependencies.fetchImpl=async(url,init)=>{
  const input=JSON.parse(init.body).input;f.requests.push({url,input});
  if(url.endsWith('/read_certification_runtime_context_v1')){
   if(failContext)return Response.json({code:'42501',message:'CERTIFICATION_RESOURCE_DENIED'},{status:403});
   return Response.json({contract:'certification-runtime-v1',context:{...f.contextFor(input),
    current_tournament_id:returnedTarget,tournament_id:returnedTarget,current_tournament_year:Number(returnedTarget),pointer_revision:2}});
  }
  assert.match(url,/read_certification_projection_v1$/);
  assert.equal(input.payload.target_tournament_id,'2097');assert.equal(input.phase,'READS');
  return Response.json({ok:true,found:true,active:true,tournamentId:'2097',directorPlayerId:'SYNTHETIC-P01'});
 };
 return f;
}
for(const target of [undefined,null,'','2097'])test(`identity binds ${String(target)} only to the admitted current pointer`,async()=>{
 const f=identityFixture(),body={target_auth_user_id:f.authorization.identity.authUserId,...(target===undefined?{}:{target_tournament_id:target})};
 const result=await participantIdentityRpc('read_preview_director_entitlement',body,{env:f.env,certificationDependencies:f.dependencies});
 assert.equal(result.payload.tournamentId,'2097');assert.equal(f.requests.length,2);
 assert.equal(f.requests[1].input.operation,'READS.DIRECTOR_ENTITLEMENT');
 assert.equal(f.requests[1].input.payload.target_auth_user_id,f.authorization.identity.authUserId);
});
for(const target of ['2026','2098','BAGGER_INV_PRODUCTION'])test(`identity never silently rebinds explicit wrong target ${target}`,async()=>{
 const f=identityFixture();await assert.rejects(participantIdentityRpc('read_preview_director_entitlement',{
  target_auth_user_id:f.authorization.identity.authUserId,target_tournament_id:target},
 {env:f.env,certificationDependencies:f.dependencies}),{code:'CERTIFICATION_READ_TARGET_DENIED'});
 assert.equal(f.requests.length,1);
});
test('identity context denial cannot select the legacy or Production provider',async()=>{
 const f=identityFixture({failContext:true});await assert.rejects(participantIdentityRpc('read_preview_director_entitlement',{
  target_auth_user_id:f.authorization.identity.authUserId},{env:f.env,certificationDependencies:f.dependencies}),
 {code:'CERTIFICATION_RESOURCE_DENIED'});assert.equal(f.requests.length,1);
});
