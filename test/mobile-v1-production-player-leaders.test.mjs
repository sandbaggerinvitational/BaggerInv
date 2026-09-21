import assert from 'node:assert/strict';
import test from 'node:test';
import {mobileLeadersResult} from '../lib/mobile-v1-tournament-reads.js';
import {leaderboardsCoreDataFromSupabaseView} from '../lib/leaderboards-core-supabase.js';
import {rankPlayerRows,playerPerformanceRows} from '../lib/mobile-leaderboards.js';
import {playerRoundSource as legacySource} from './support/player-round-performance-fixture.mjs';
import {assertMobileV1Schema} from './support/mobile-v1-schema-validator.mjs';
// Canonical Production IDs; keep the prior opaque-ID fixture untouched.
function playerRoundSource() {
 const s=legacySource();
 for(const e of s.matches) {
  const id=`fixture-R${e.match.round_number}-1`;e.match.match_id=id;
  for(const p of e.participants)p.match_id=id;
  for(const h of e.scores)h.match_id=id;
 }
 return s;
}
const projection=(source,identity={tournamentId:source.tournament.tournament_id})=>mobileLeadersResult(identity,{env:{VERCEL_ENV:'production'},dependencies:{requireLeaderboardsCoreReadSource:()=>({resolved:'supabase'}),readLeaderboardsCoreView:async()=>({payload:{ok:true,data:source}})}});
test('Production exports approved Players scopes without Preview identity authority',async()=>{
 const source=playerRoundSource(),before=structuredClone(source),result=await projection(source);
 assert.equal(result.status,200);await assertMobileV1Schema('leaders',result.body);
 const data=result.body.data;assert.deepEqual(data.playerIntelligence.rounds.map(x=>x.roundNumber),[1,2,3]);
 const canonical=leaderboardsCoreDataFromSupabaseView(source);
 for(const scope of [data.playerIntelligence.overall,...data.playerIntelligence.rounds]){
  const rounds=scope.roundNumber?canonical.rounds.filter(r=>r.number===scope.roundNumber):canonical.rounds;
  const rows=scope.roundNumber?canonical.roundLeaderboards[scope.roundNumber]:canonical.leaderboard;
  for(const ranking of scope.rankings) assert.deepEqual(ranking.order.map(x=>[x.playerId,x.rank]),rankPlayerRows(playerPerformanceRows(rows,canonical.scoreLeaderboard,rounds),ranking.metric).map(x=>[x.id,x.displayRank]));
 }
 assert.deepEqual(source,before);assert.ok(data.playerRoundPerformance.length);
 assert.ok(data.r1RoundCompetition);assert.ok(data.r2PairCompetition);assert.ok(data.r3RoundCompetition);
 assert.equal(JSON.stringify(result.body).includes('DO-NOT-EXPOSE'),false);
});
test('Unpaired upcoming R3 placeholder is not an invented player or result',async()=>{
 const source=playerRoundSource();for(const e of source.matches.filter(e=>e.match.round_number===3)){e.participants=[];e.scores=[];e.match.status='UPCOMING';e.match.finalized_at=null;}
 const result=await projection(source),d=result.body.data;
 assert.equal(result.status,200);assert.equal(d.playerIntelligence.rounds.find(r=>r.roundNumber===3).players.length,0);
 assert.equal(d.playerIntelligence.matchReferences.some(r=>r.roundNumber===3),false);
 assert.equal(d.playerRoundPerformance.some(r=>r.roundNumber===3),false);assert.equal(d.r3RoundCompetition.rows.length,0);
});
for(const [name,mutate] of [
 ['foreign tournament',s=>s.tournament.tournament_id='wrong'],
 ['duplicate match',s=>s.matches.push(structuredClone(s.matches[0]))],
 ['scored unpaired R3',s=>{const e=s.matches.find(e=>e.match.round_number===3);e.participants=[];e.match.status='UPCOMING';e.scores=[{hole_number:1}];}],
 ['finalized unpaired R3',s=>{const e=s.matches.find(e=>e.match.round_number===3);e.participants=[];e.scores=[];e.match.status='FINAL';}],
 ['unpaired R1',s=>{const e=s.matches[0];e.participants=[];e.scores=[];e.match.status='UPCOMING';}],
 ['partial assignment',s=>s.matches[0].participants.pop()],
])test(`${name} fails closed`,async()=>{const s=playerRoundSource(),identity={tournamentId:s.tournament.tournament_id};mutate(s);await assert.rejects(projection(s,identity));});
test('Representation changes when stable visible authority changes',async()=>{
 const s=playerRoundSource(),a=await projection(s);s.players[0].display_name='Changed display';const b=await projection(s);assert.notEqual(a.revision,b.revision);
});
