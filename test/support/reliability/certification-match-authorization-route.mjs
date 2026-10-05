// Execute the shipping route with test-only Auth/transport boundaries.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MATCH_ACCESS_ACTIONS,matchAuthorizationPublicError} from '../../../lib/match-authorization-supabase.js';
import {createScoringSession,scoringSessionCookie,verifyScoringSession} from '../../../lib/scoring-access.js';
import {participantIdentityPublicError} from '../../../lib/participant-identity-resolver.js';
const secret='local-only-scoring-signature-secret-for-tests';
export async function shippingAuthorizationRoute({identity,authorize,identityError}={}){
 const cookies=[];const unexpected=()=>assert.fail('Google/Passport/fallback cannot execute');
 const deps={cookies:async()=>({get:()=>undefined}),NextResponse:{json:(body,init)=>{
  const response=Response.json(body,init);response.cookies={set:cookie=>cookies.push(cookie)};return response;}},
  requireParticipantIdentityAuthority:()=>({resolved:'supabase'}),resolveSupabaseParticipantIdentity:async()=>{
   if(identityError)throw identityError;return identity??{playerId:'P12',tournamentId:'2026',displayName:'Synthetic Participant A'};},
  participantIdentityPublicError,requireMatchAuthorizationSource:()=>({resolved:'supabase'}),
  authorizeMatchAccess:authorize,MATCH_ACCESS_ACTIONS,matchAuthorizationPublicError,
  createScoringSession:input=>createScoringSession(input,secret),scoringSessionCookie,
  productionShadowScoringMutationResponse:()=>null,authorizePassportMatch:unexpected,
  verifyPlayerPassportSession:unexpected,playerPassportTokenFromRequest:unexpected,
  playerPassportEffectivePlayerId:unexpected,console:{error:()=>{},info:()=>{}}};
 const source=(await readFile(new URL('../../../app/api/player-passport/matches/route.js',import.meta.url),'utf8'))
  .replace(/^import\s+\{[\s\S]*?\}\s+from\s+[^;]+;\n/gm,'')
  .replaceAll('export const','const').replaceAll('export async function','async function');
 const post=new Function(...Object.keys(deps),`${source};return POST;`)(...Object.values(deps));
 const request=async(body={matchId:'2026-R3-12'})=>{
  const response=await post(new Request('https://local-certification.invalid/api/player-passport/matches',
   {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
  return {response,body:await response.json(),cookies};};
 return {request,cookies,session:()=>verifyScoringSession(cookies.at(-1)?.value,secret)};
}
