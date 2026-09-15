import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { mobileMatchDetailResult } from '../lib/mobile-v1-match-detail.js';
import { expectedMatchAuthorizationDecision } from '../lib/match-authorization-supabase.js';
import { mobileScoringHoleResult, mobileScoringFinalizeResult } from '../lib/mobile-v1-scoring.js';
import { issueMobileNativeCertification } from '../lib/mobile-native-certification.js';
import { resolveMobileBearerIdentity } from '../lib/mobile-bearer-identity.js';
import { rawFixture } from './fixtures/pn1-mobile.mjs';
import { environment, authorityFixtures, request, actor, productionContext } from './fixtures/pn2-native.mjs';
import { assertMobileV1Schema } from './support/mobile-v1-schema-validator.mjs';

const viewer = { ...actor, playerId: 'P1' };
const ownID = '2026-R1-3', otherID = '2026-R1-1';
function authority(format = 'BB') {
  return {
    tournament: { tournament_id: '2026' }, players: [{player_id:'P1',display_name:'Synthetic viewer'}],
    tournament_players: [{tournament_id:'2026',player_id:'P1',participation_status:'ACTIVE'}],
    matches: [...[ownID,otherID].map(match_id=>({match_id,tournament_id:'2026',format,status:'LIVE',scoring_locked:false,permission_revision:7})),
      {match_id:'2027-R1-1',tournament_id:'2027',format,status:'LIVE',scoring_locked:false,permission_revision:7}],
    match_participants: [{match_id:ownID,player_id:'P1'}],
    permissions: [{match_id:ownID,player_id:'P1',can_score:true,permission_revision:7}],
  };
}
async function fixture(format = 'BB') {
  const env = environment(['reads','auth','certification','scoring']);
  const f = authorityFixtures(env), source = authority(format);
  const context = {...viewer,tournament:{id:'2026'},membership:{active:true},contextRevision:1,
    matches:[{matchId:ownID,round:1,format,status:'LIVE',canScore:true,permissionRevision:7}]};
  const proof = issueMobileNativeCertification({...viewer,env,productionContext:{...productionContext(),participant:context}});
  const identity = await resolveMobileBearerIdentity({env,capability:'scoring',
    request:request('session',{headers:{authorization:'Bearer synthetic','x-bagger-certification':proof.token}}),
    dependencies:{readReviewer:async()=>null,nativeAdmission:f.dependencies,
      verifyAccessToken:async()=>({status:'active',authUserId:viewer.authUserId}),
      readForAuth:async()=>({payload:{ok:true,data:context}}),readCurrentTournamentRuntime:async()=>f.current}});
  const raw = id => {
    const value=rawFixture({format,matchId:id,owned:id===ownID});value.match.tournament_id='2026';
    value.participants.forEach(p=>{delete p.is_authenticated_player;p.email='PRIVATE_EMAIL';p.auth_user_id='PRIVATE_AUTH';});
    value.permissions=[{secret:'PRIVATE_PERMISSION',can_score:true}];value.admin={secret:'PRIVATE_ADMIN'};
    value.navigation={position:{index:1,total:6},previous:null,next:{id:'2026-R1-2'}};
    return value;
  };
  const dependencies={readCurrentTournamentRuntime:async()=>f.current,
    authorizeMatchAccess:async scope=>({payload:expectedMatchAuthorizationDecision(source,scope)}),
    readGameCenterView:async(id,options)=>{assert.equal(options.tournamentId,'2026');return {payload:{ok:true,data:raw(id)}};}};
  return {env,identity,source,raw,dependencies};
}

test('Production participant can read own and other BB/SC/SI matches without acquiring ownership or private fields',async()=>{
  for(const format of ['BB','SC','SI']) {
    const f=await fixture(format);
    for(const id of [ownID,otherID]) {
      const decision=(await f.dependencies.authorizeMatchAccess({tournamentId:'2026',playerId:'P1',matchId:id,action:'VIEW_GAME_CENTER'})).payload;
      assert.equal(decision.allowed,id===ownID);
      if(id===otherID)assert.equal(decision.code,'NOT_MATCH_PARTICIPANT');
      const result=await mobileMatchDetailResult(f.identity,id,f);
      assert.equal(result.status,200);await assertMobileV1Schema('match-detail',result.body);
      assert.equal(result.body.data.match.authenticatedPlayer.involved,id===ownID);
      assert.equal(result.body.data.match.navigation.isMyMatch,id===ownID);
      assert.equal(result.body.data.match.navigation.myMatchId,id===ownID?id:null);
      assert.equal(result.body.data.match.scorecard.holes.length,18);
      for(const forbidden of ['PRIVATE_EMAIL','PRIVATE_AUTH','PRIVATE_PERMISSION','PRIVATE_ADMIN','can_score'])assert.ok(!JSON.stringify(result.body).includes(forbidden));
      const retry=await mobileMatchDetailResult(f.identity,id,f);assert.equal(retry.revision,result.revision);
      if(process.env.BAGGER_CROSS_MATCH_RESPONSE_CAPTURE && format==='SC' && id===otherID)
        await writeFile(process.env.BAGGER_CROSS_MATCH_RESPONSE_CAPTURE,JSON.stringify(result.body,null,2)+'\n');
    }
  }
});

test('Cross-tournament, inactive membership and unproven/malformed read decisions fail closed before data transport',async()=>{
  const f=await fixture();
  await assert.rejects(()=>mobileMatchDetailResult(f.identity,'2027-R1-1',{...f,dependencies:{...f.dependencies,
    readGameCenterView:async()=>assert.fail('cross tournament transport forbidden')}}),{code:'PARTICIPANT_NOT_FOUND'});
  const base=(await f.dependencies.authorizeMatchAccess({tournamentId:'2026',playerId:'P1',matchId:otherID,action:'VIEW_GAME_CENTER'})).payload;
  for(const change of [{membership_active:false},{membership_active:undefined},{membership_active:'true'},
    {participant_membership:true},{read_only:false},{read_only:undefined},{code:'UNKNOWN'},
    {code:'MATCH_NOT_FOUND'},{code:'TOURNAMENT_MEMBERSHIP_INACTIVE'},
    {tournament_id:'2027'},{player_id:'P2'},{match_id:ownID},{action:'START_SCORING'}]) {
    await assert.rejects(()=>mobileMatchDetailResult(f.identity,otherID,{...f,dependencies:{...f.dependencies,
      authorizeMatchAccess:async()=>({payload:{...base,...change}}),readGameCenterView:async()=>assert.fail('denied before read')}}),{code:'PARTICIPANT_NOT_FOUND'});
  }
  const inactive={...f.identity,context:{...f.identity.context,membership:{active:false}}};
  await assert.rejects(()=>mobileMatchDetailResult(inactive,otherID,f),{code:'PARTICIPANT_NOT_FOUND'});
});

test('Cross-match projection remains tournament-scoped, roster-consistent, and pointer fenced',async()=>{
  for(const mutate of [raw=>{raw.match.tournament_id='2027'},raw=>{raw.tournament.tournament_id='2027'},
    raw=>{raw.match.match_id=ownID},raw=>{raw.participants[0].player_id='P1'}]) {
    const f=await fixture(),raw=f.raw(otherID);mutate(raw);
    await assert.rejects(()=>mobileMatchDetailResult(f.identity,otherID,{...f,dependencies:{...f.dependencies,
      readGameCenterView:async()=>({payload:{ok:true,data:raw}})}}),{code:'MOBILE_API_UNAVAILABLE'});
  }
  const f=await fixture();let calls=0;
  await assert.rejects(()=>mobileMatchDetailResult(f.identity,otherID,{...f,dependencies:{...f.dependencies,
    readCurrentTournamentRuntime:async()=>({...await f.dependencies.readCurrentTournamentRuntime(),pointerRevision:++calls})}}),{code:'MOBILE_API_UNAVAILABLE'});
});

test('Production cross-match detail success cannot authorize score or finalization; own scoring still reaches canonical persistence',async()=>{
  const f=await fixture();await mobileMatchDetailResult(f.identity,otherID,f);
  const before=structuredClone(f.source);let writes=0;
  const stop=Object.assign(new Error('synthetic canonical persistence boundary'),{code:'SYNTHETIC_BOUNDARY'});
  const dependencies={...f.dependencies,scoringAuthorityEnvironment:()=>({resolved:'supabase'}),requireScoringReadSource:()=>({resolved:'supabase'}),
    persistParticipantScore:async()=>{writes++;throw stop;}};
  const common={mutationId:'synthetic-local-mutation',expectedMatchRevision:0};
  const hole={...common,holeNumber:1,expectedHoleRevision:0,teamOneGrossScores:[4,5],teamTwoGrossScores:[5,6]};
  for(const [operation,input] of [[mobileScoringHoleResult,hole],[mobileScoringFinalizeResult,common]]) {
    await assert.rejects(()=>operation(f.identity,{...input,matchId:otherID},{env:f.env,dependencies}),{code:'SCORING_NOT_AUTHORIZED'});
    assert.equal(writes,0);
  }
  // Even a stale context advertising the other match cannot override the
  // independent canonical scorer decision or reach the persistence boundary.
  f.identity.context.matches.push({...f.identity.context.matches[0],matchId:otherID});
  for(const [operation,input] of [[mobileScoringHoleResult,hole],[mobileScoringFinalizeResult,common]]) {
    await assert.rejects(()=>operation(f.identity,{...input,matchId:otherID},{env:f.env,dependencies}),{code:'SCORING_NOT_AUTHORIZED'});
    assert.equal(writes,0);
  }
  f.identity.context.matches.pop();
  assert.equal(expectedMatchAuthorizationDecision(f.source,{tournamentId:'2026',playerId:'P1',matchId:otherID,action:'START_SCORING'}).allowed,false);
  assert.equal(expectedMatchAuthorizationDecision(f.source,{tournamentId:'2026',playerId:'P1',matchId:ownID,action:'START_SCORING'}).allowed,true);
  await assert.rejects(()=>mobileScoringHoleResult(f.identity,{...hole,matchId:ownID},{env:f.env,dependencies}));
  assert.equal(writes,1,'authorized own write reaches existing persistence boundary only');
  assert.deepEqual(f.source,before,'read policy never changes canonical scoring facts');
});
