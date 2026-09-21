import test from 'node:test';
import assert from 'node:assert/strict';
import {rawFixture} from './fixtures/pn1-mobile.mjs';
import {mobileMatchDetailDataFromPreviewView} from '../lib/mobile-v1-match-detail.js';
import {mobileMatchesResult,mobileTodayResult} from '../lib/mobile-v1-tournament-reads.js';
import {calculateMatchPoints} from '../lib/live-hole-scoring.js';
import {officialMatchResult,finalizedMatchResult} from '../lib/match-result.js';
const names={1:'The Pickles',2:'Lipp it and Rip it'};
const cases={
 '7 & 5':Array.from({length:18},(_,i)=>i<6||i===12?'Team 1':'Halved'),
 '1 UP':Array.from({length:18},(_,i)=>i===17?'Team 1':'Halved'),
 'HALVED':Array(18).fill('Halved'),
 '2 & 1':Array.from({length:18},(_,i)=>[0,1,16].includes(i)?'Team 2':i===2?'Team 1':'Halved')
};
for(const format of ['BB','SC','SI']) for(const [notation,winners] of Object.entries(cases)) {
 test(`${format} ${notation}: consistent scorecard/result/points reach Today, list and Detail without source mutation`,async()=>{
  const raw=rawFixture({format,status:'FINAL',winners});
  // Supply internally coherent net/gross evidence rather than the generic fixture's placeholder scores.
  for(const score of raw.scores){
   const a=score.hole_winner==='Team 2'?5:4,b=score.hole_winner==='Team 1'?5:4;
   score.team_1_net_score=a;score.team_2_net_score=b;
   score.team_1_gross_scores=score.team_1_strokes.map(x=>a+x);
   score.team_2_gross_scores=score.team_2_strokes.map(x=>b+x);
  }
  const before=structuredClone(raw);
  const expected=calculateMatchPoints(format,winners.map((winner,i)=>({holeNumber:i+1,winner})));
  const view={tournament:raw.tournament,teams:raw.teams,rounds:[raw.round],matches:[raw],participant_view:{ok:true,data:{tournament:raw.tournament,player:{player_id:'P1',display_name:'Synthetic'},tournament_player:{team_side:1},teams:raw.teams,matches:[raw]}}};
  const list=await mobileMatchesResult({tournamentId:'2026',playerId:'P1'},{dependencies:{requireTournamentReadSource:()=>({resolved:'supabase'}),readTournamentLiveView:async()=>({payload:{ok:true,data:view}}),readGuideProjection:async()=>({}),applyGuideCoursesToTournament:x=>x}});
  const today=await mobileTodayResult({tournamentId:'2026',playerId:'P1'},{dependencies:{requireHomeReadSource:()=>({resolved:'supabase'}),readParticipantHomeView:async()=>({payload:{ok:true,data:view}}),readGuideProjection:async()=>({}),applyGuideProjectionToHome:x=>x}});
  const detail=mobileMatchDetailDataFromPreviewView(raw,{tournamentId:'2026',playerId:'P1',matchId:raw.match.match_id});
  const lr=list.body.data.matches[0].result,tr=today.body.data.currentMatch.result;
  assert.equal(lr.summary,detail.match.result.summary);
  assert.equal(tr.summary,lr.summary);
  assert.ok(lr.summary.endsWith(notation));
  if(notation==='2 & 1')assert.ok(lr.summary.startsWith(names[2]));
  for(const r of [lr,tr]){assert.equal(r.teamOnePoints,expected.team1Points);assert.equal(r.teamTwoPoints,expected.team2Points);}
  assert.deepEqual(raw,before);
 });
}
test('unknown result stays unknown despite equal points; explicit halved and official margin remain authoritative',()=>{
 for(const points of [0,1.5,3]) assert.equal(officialMatchResult({status:'FINAL',team1Points:points,team2Points:points},names),'');
 for(const winner of ['Halved','Tie']) assert.equal(officialMatchResult({overallWinner:winner,team1Points:1.5,team2Points:1.5},names),'HALVED');
 assert.equal(officialMatchResult({'Match Status Text':'Team 1 7 & 5',team1Points:1.5,team2Points:1.5},names),'The Pickles 7 & 5');
 assert.equal(officialMatchResult({overallWinner:'Team 1',team1Points:1.5,team2Points:1.5},names),'');
});
test('adversarial equal awards never replace stronger semantic authority and never get rewritten',()=>{
 const source={status:'FINAL',team1Points:1.5,team2Points:1.5};const before=structuredClone(source);
 const holes=cases['7 & 5'].map((winner,i)=>({holeNumber:i+1,winner}));
 assert.equal(finalizedMatchResult(source,holes,names),'The Pickles 7 & 5');
 assert.equal(finalizedMatchResult(source,[],names),'');
 assert.deepEqual(source,before);
});