import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeMatchAccess,matchAuthorizationPublicError} from '../lib/match-authorization-supabase.js';
import {scoringShadowRpc} from '../lib/scoring-shadow.js';
import {certificationRuntimeFixture} from './support/reliability/certification-runtime-fixture.mjs';
import {ParticipantIdentityResolutionError} from '../lib/participant-identity-resolver.js';

const scope={tournamentId:'2026',playerId:'P12',matchId:'2026-R3-12',action:'START_SCORING'};
const decision={allowed:true,code:'AUTHORIZED',tournament_id:'2026',player_id:'P12',player_display_name:'Synthetic Participant A',
 match_id:scope.matchId,action:scope.action,read_only:false,permission_revision:2,match_permission_revision:2,
 match_revision:3,context_revision:1,membership_active:true,participant_membership:true,match_status:'LIVE',
 scoring_locked:false,can_score:true,query_ms:1};
import {shippingAuthorizationRoute} from './support/reliability/certification-match-authorization-route.mjs';

function fixture({matrix,sqlError,transportError,drift=false}={}){
 const f=certificationRuntimeFixture();
 f.dependencies.fetchImpl=async(url,init)=>{
  const input=JSON.parse(init.body).input;f.requests.push({url,input});
  if(transportError)throw transportError;
  if(sqlError)return Response.json({code:'42501',message:sqlError},{status:400});
  if(url.endsWith('/read_certification_runtime_context_v1'))return Response.json({contract:'certification-runtime-v1',
   context:{...f.contextFor(input),...(drift&&input.phase==='SCORING'?{context_token:'c'.repeat(64)}:{})}});
  assert.match(url,/read_certification_projection_v1$/);
  assert.equal(input.operation,'READS.CURRENT_VIEW');assert.equal(input.payload.surface,'MATCH_AUTHORIZATION');
  assert.deepEqual(Object.keys(input.payload).sort(),['surface','target_tournament_id']);
  return Response.json(matrix??{ok:true,tournament_id:'2026',decisions:[structuredClone(decision)]});
 };
 f.options={env:f.env,certificationDependencies:f.dependencies};return f;
}

test('Certification selects the exact native decision through its existing projection, never the legacy RPC',async()=>{
 const f=fixture();const result=await authorizeMatchAccess(scope,f.options);
 assert.deepEqual(result.payload,decision);
 assert.deepEqual(f.requests.map(r=>[r.url.split('/').at(-1),r.input.phase]),[
  ['read_certification_runtime_context_v1','READS'],['read_certification_runtime_context_v1','SCORING'],['read_certification_projection_v1','READS']]);
 assert.ok(f.requests.every(r=>r.input.resource.resource_class==='CERTIFICATION'));
 assert.equal(result.payload.permission_revision,2);
});

test('read-only final scorecard preserves READS and the database decision',async()=>{
 const row={...decision,action:'VIEW_FINAL_SCORECARD',read_only:true,match_status:'FINAL'};
 const f=fixture({matrix:{ok:true,tournament_id:'2026',decisions:[row]}});
 assert.deepEqual((await authorizeMatchAccess({...scope,action:row.action},f.options)).payload,row);
 assert.equal(f.requests.some(r=>r.input.phase==='SCORING'),false);
});

for(const code of ['NOT_MATCH_PARTICIPANT','TOURNAMENT_MEMBERSHIP_INACTIVE','MATCH_LOCKED','MATCH_FINAL','SCORING_PERMISSION_STALE','SCORING_PERMISSION_REVOKED','MATCH_NOT_SCOREABLE'])test(`native ${code} denial is preserved without an allow reconstruction`,async()=>{
 const row={...decision,allowed:false,code};const f=fixture({matrix:{ok:true,tournament_id:'2026',decisions:[row]}});
 assert.deepEqual((await authorizeMatchAccess(scope,f.options)).payload,row);
});

for(const [name,matrix,code,status] of [
 ['absent player/match/action tuple',{ok:true,tournament_id:'2026',decisions:[]},'MATCH_AUTHORIZATION_SCOPE_DENIED',403],
 ['another player only',{ok:true,tournament_id:'2026',decisions:[{...decision,player_id:'P11'}]},'MATCH_AUTHORIZATION_SCOPE_DENIED',403],
 ['duplicate tuple',{ok:true,tournament_id:'2026',decisions:[decision,decision]},'AUTHORIZATION_UNAVAILABLE',503],
 ['wrong tournament',{ok:true,tournament_id:'2027',decisions:[decision]},'AUTHORIZATION_UNAVAILABLE',503],
 ['malformed response',{ok:true,tournament_id:'2026'},'AUTHORIZATION_UNAVAILABLE',503],
 ['malformed decision',{ok:true,tournament_id:'2026',decisions:[{...decision,permission_revision:null}]},'AUTHORIZATION_UNAVAILABLE',503],
 ['false success',{ok:true,tournament_id:'2026',decisions:[{...decision,code:'MATCH_LOCKED'}]},'AUTHORIZATION_UNAVAILABLE',503],
])test(`${name} fails closed`,async()=>{
 const f=fixture({matrix});let error;try{await authorizeMatchAccess(scope,f.options);}catch(value){error=value;}
 assert.ok(error);assert.equal(matchAuthorizationPublicError(error).code,code);assert.equal(matchAuthorizationPublicError(error).status,status);
});

for(const [code,status]of [['CANONICAL_RESOURCE_DEPLOYMENT_DENIED',403],['CANONICAL_RESOURCE_INGRESS_CLOSED',409],
 ['CANONICAL_RESOURCE_CONTEXT_STALE',409],['CANONICAL_RESOURCE_REGISTRATION_STALE',409],['CERTIFICATION_READ_CONTEXT_DENIED',403]])test(`canonical ${code} remains typed`,async()=>{
 const f=fixture({sqlError:code});let error;try{await authorizeMatchAccess(scope,f.options);}catch(value){error=value;}
 assert.equal(matchAuthorizationPublicError(error).code,code);assert.equal(matchAuthorizationPublicError(error).status,status);
});

test('runtime revision drift between READS and SCORING is denied',async()=>{
 const f=fixture({drift:true});await assert.rejects(authorizeMatchAccess(scope,f.options),{code:'CERTIFICATION_CONTEXT_STALE',status:409});
 assert.equal(f.requests.some(r=>r.url.endsWith('/read_certification_projection_v1')),false);
});

test('legacy authorization and arbitrary legacy RPCs remain forbidden',async()=>{
 const f=fixture();for(const name of ['authorize_match_access','arbitrary_legacy_rpc'])
  await assert.rejects(scoringShadowRpc(name,{},f.options),{code:'CERTIFICATION_LEGACY_RPC_FORBIDDEN',status:403});
 assert.equal(f.requests.length,0);
});


test('shipping POST returns its unchanged DTO and signed score session for valid Certification instead of 503',async()=>{
 const f=fixture(),route=await shippingAuthorizationRoute({authorize:input=>authorizeMatchAccess(input,f.options)});
 const result=await route.request({matchId:scope.matchId,playerId:'P11',resource:'PRODUCTION'});
 assert.equal(result.response.status,200);assert.deepEqual(result.body,{authorized:true,action:'START_SCORING',readOnly:false,permissionRevision:2,source:'supabase'});
 const session=route.session();assert.equal(session.playerId,'P12');assert.equal(session.matchId,scope.matchId);assert.equal(session.accessVersion,2);
 assert.equal(session.identityAuthority,'supabase');assert.equal(result.response.headers.get('x-match-authorization-google-requests'),'0');
});

for(const [name,error,status,code]of [
 ['signed-out',new ParticipantIdentityResolutionError('AUTH_SESSION_REQUIRED'),401,'AUTH_SESSION_REQUIRED'],
 ['unlinked',new ParticipantIdentityResolutionError('ACTIVE_USER_PLAYER_LINK_REQUIRED'),403,'ACTIVE_USER_PLAYER_LINK_REQUIRED'],
])test(`shipping ${name} fails before match authorization without private data`,async()=>{
 const route=await shippingAuthorizationRoute({identityError:error,authorize:()=>assert.fail('Authorization cannot run')});
 const result=await route.request();assert.equal(result.response.status,status);assert.equal(result.body.code,code);
 assert.deepEqual(Object.keys(result.body).sort(),['code','error']);assert.equal(result.cookies.length,0);
});

for(const code of ['CANONICAL_RESOURCE_DEPLOYMENT_DENIED','CANONICAL_RESOURCE_CONTEXT_STALE','CANONICAL_RESOURCE_INGRESS_CLOSED'])test(`shipping ${code} is a typed denial rather than generic 503`,async()=>{
 const f=fixture({sqlError:code}),route=await shippingAuthorizationRoute({authorize:input=>authorizeMatchAccess(input,f.options)});
 const result=await route.request();assert.equal(result.response.status,code.includes('DEPLOYMENT')?403:409);assert.equal(result.body.code,code);
 assert.deepEqual(Object.keys(result.body).sort(),['code','error']);assert.equal(result.cookies.length,0);
});

test('actual transport loss and unrelated internal errors retain generic unavailable without private details',async()=>{
 const f=fixture({transportError:new Error('private connection detail')});
 for(const authorize of [input=>authorizeMatchAccess(input,f.options),()=>{throw new Error('private internal detail');}]){
  const result=await(await shippingAuthorizationRoute({authorize})).request();
  assert.equal(result.response.status,503);assert.deepEqual(result.body,{error:'Scorecard authorization is temporarily unavailable.',code:'AUTHORIZATION_UNAVAILABLE'});
  assert.equal(result.cookies.length,0);
 }
});
