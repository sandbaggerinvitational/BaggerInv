// Real shipping participant GET and canonical projection. Only external session
// discovery/provider HTTP is substituted; no result or privacy projection is mocked.
import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{randomUUID}from'node:crypto';
import{certificationProjectionRpc}from'../../../lib/certification-runtime-server.js';
import{publishedOddsFreshness,publishedOddsLegacyPublication,publishedOddsSnapshotsFromView}from'../../../lib/published-odds-supabase.js';
import{participantIdentityRpc}from'../../../lib/participant-identity-supabase.js';import{participantIdentityPublicError}from'../../../lib/participant-identity-resolver.js';
import{currentIntelligenceDerivedState}from'../../../lib/intelligence-derived-supabase.js';
import{fixtureIdentities}from'../../../tools/reliability/certification-part2a-fixture.mjs';
export async function oddsParticipantRoute(f,dependencies,{signedOut=false}={}){
 const key='odds-read-'+randomUUID(),calls=[];
 const read=async()=>{calls.push('READS.CURRENT_VIEW');return certificationProjectionRpc('READS.CURRENT_VIEW',{surface:'PUBLISHED_ODDS',target_tournament_id:'2026'},{env:f.env},dependencies);};
 globalThis[key]={NextResponse:Response,cookies:async()=>({get:()=>null}),applicationRequestEnvironment:()=>f.env,
 readOddsSnapshots:()=>assert.fail('GOOGLE_FORBIDDEN'),withWorkbookWriteDiagnostics:()=>assert.fail('GOOGLE_FORBIDDEN'),
 requirePublishedOddsReadSource:()=>({resolved:'supabase'}),requireIntelligenceDerivedReadSources:()=>({tournamentIntelligence:{resolved:'supabase'},projectionEditorial:{resolved:'supabase'},finalRecap:{resolved:'supabase'}}),
 currentIntelligenceDerivedState:tid=>currentIntelligenceDerivedState(tid,{env:f.env,certificationDependencies:dependencies}),
 createRuntimeProfile:()=>({measure:async(_n,fn)=>fn(),mark:()=>{},finish:()=>({})}),attachRuntimeTiming:r=>r,
 participantIdentityPublicError,publishedOddsFreshness,publishedOddsLegacyPublication,publishedOddsSnapshotsFromView,
 readPublishedOddsView:read,resolveSupabaseParticipantIdentity:async()=>{
  if(signedOut)throw Object.assign(Error('Sign in required'),{code:'AUTH_SESSION_REQUIRED',status:401});
  const id=fixtureIdentities[1];const r=await participantIdentityRpc('read_participant_identity_context_for_auth',{target_auth_user_id:id.auth_user_id,target_tournament_id:null},{env:f.env,certificationDependencies:dependencies});
  assert.equal(r.payload.ok,true);return{playerId:id.player_id,tournamentId:'2026'};
 }};
 const s=(await readFile(new URL('../../../app/api/leaderboards/insights/route.js',import.meta.url),'utf8'))
 .replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,(_m,n)=>`const {${n.replace(/\bas\b/g,':')}}=globalThis[${JSON.stringify(key)}];\n`);
 const route=await import('data:text/javascript;base64,'+Buffer.from(s).toString('base64')+'#'+key);delete globalThis[key];
 return{get:()=>route.GET(new Request('http://localhost/api/leaderboards/insights?year=2026')),calls};
}
