// Local modeled Auth boundary plus actual unchanged canonical SQL projection.
// No JWT is generated, no provider session is claimed and no network is used.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {jsonLiteral} from './postgres17.mjs';
import {fixtureIdentities} from '../../../tools/reliability/certification-part2a-fixture.mjs';
import {resolveSupabaseParticipantIdentity} from '../../../lib/participant-identity-resolver.js';

export async function proveCanonicalContactIdentity({q,resource,deployment}){
 const envelope={contract_version:'certification-runtime-v1',resource,deployment,phase:'READS'};
 const project=ref=>`https://${ref}.supabase.co`;
 // Reuse the existing resolver's local test boundary. Fake values cannot reach
 // a provider: readForAuth executes the actual registered Certification SQL.
 const env={VERCEL_ENV:'preview',PARTICIPANT_IDENTITY_AUTHORITY:'supabase',
  SUPABASE_SCORING_MIRROR_URL:project('idgigvjjqkfbqjeredpb'),SUPABASE_SCORING_MIRROR_SECRET_KEY:'local-only-synthetic',
  NEXT_PUBLIC_SUPABASE_AUTH_URL:project('idgigvjjqkfbqjeredpb'),NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:'local-only-public'};
 const canonical=(authUserId,{setup='',target='2026'}={})=>{
  const input={...envelope,operation:'READS.IDENTITY_FOR_AUTH',payload:{target_auth_user_id:authUserId,target_tournament_id:target}};
  return JSON.parse(q(`begin;${setup};set local request.jwt.claim.role='service_role';set local role service_role;
   select public.read_certification_projection_v1(${jsonLiteral(input)});rollback;`));
 };
 const request=new Request('https://local-certification.invalid/api/participant/context?playerId=P11&auth_user_id=client-selected&resource=PRODUCTION');
 request.cookies={get:()=>undefined}; // NextRequest cookie interface; no Passport/session token.
 const resolve=(authUserId,{setup='',verified=true,target}={})=>resolveSupabaseParticipantIdentity({
  request,
  tournamentId:target,env,dependencies:{
   verifyClaims:async()=>verified?{status:'active',claims:{sub:authUserId}}:{status:'inactive'},
   readForAuth:async args=>{assert.equal(args.authUserId,authUserId);return{payload:canonical(args.authUserId,{setup,target:args.tournamentId})};},
  }});
 const mappings=[];
 for(const identity of fixtureIdentities){
  const result=await resolve(identity.auth_user_id);
  assert.equal(result.playerId,identity.player_id);assert.equal(result.authUserId,identity.auth_user_id);
  assert.equal(result.context.contextRevision,1);assert.equal(result.context.membership.active,true);
  assert.equal(result.googleRequests,0);mappings.push({authUserId:identity.auth_user_id,playerId:result.playerId});
 }
 await assert.rejects(resolve(null,{verified:false}),{code:'AUTH_SESSION_REQUIRED',status:401});
 const unlinked=randomUUID();
 await assert.rejects(resolve(unlinked,{setup:`insert into auth.users(id,email,email_confirmed_at)values('${unlinked}','unlinked@synthetic.bagger-certification.invalid',clock_timestamp())`}),
  {code:'ACTIVE_USER_PLAYER_LINK_REQUIRED',status:403});
 for(const setup of [
  "update participant_identity.participant_identity_contacts set identity_active=false where player_id='P12'",
  "update participant_identity.participant_identity_contacts set email=email_normalized||'.wrong',email_normalized=email_normalized||'.wrong' where player_id='P12'",
  "update participant_identity.participant_auth_identifiers set normalized_value_private='wrong@synthetic.bagger-certification.invalid' where player_id='P12'",
  "update scoring_authority.tournament_players set participation_status='INACTIVE' where player_id='P12'",
 ])await assert.rejects(resolve(fixtureIdentities[1].auth_user_id,{setup}),{code:'ACTIVE_USER_PLAYER_LINK_REQUIRED',status:403});
 assert.throws(()=>canonical(fixtureIdentities[1].auth_user_id,{target:'2027'}),/CERTIFICATION_READ_CONTEXT_DENIED/);
 // Client selection never changes the verified subject or its canonical player.
 assert.equal((await resolve(fixtureIdentities[1].auth_user_id)).playerId,'P12');
 return{mappings,signedOut:'AUTH_SESSION_REQUIRED',unlinked:'ACTIVE_USER_PLAYER_LINK_REQUIRED',
  inactiveOrMismatchedIdentity:'DENIED',clientCrossSelection:'CANNOT SELECT OTHER PLAYER',
  authProof:'MODELED_LOCAL_VERIFIED_SUBJECT; actual unchanged SQL projection and resolver executed; no hosted Auth claim'};
}
