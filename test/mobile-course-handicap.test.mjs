import test from 'node:test';
import assert from 'node:assert/strict';
import { rawFixture } from './fixtures/pn1-mobile.mjs';
import { mobileCourseHandicap } from '../lib/mobile-course-handicap.js';
import { mobileMatchDetailDataFromPreviewView } from '../lib/mobile-v1-match-detail.js';
import { tournamentLiveDataFromSupabaseView } from '../lib/tournament-live-supabase.js';
import { mobileMatchesResult } from '../lib/mobile-v1-tournament-reads.js';
import { assertMobileV1Schema } from './support/mobile-v1-schema-validator.mjs';
const identity={tournamentId:'2026',playerId:'P1',matchId:'2026-R1-2'};
for (const format of ['BB','SI','SC']) test(`${format}: additive canonical precision, list/detail parity, unchanged PH/strokes and source`,async()=>{
 const raw=rawFixture({format});
 raw.match.tournament_id='2026';
 raw.participants.forEach((p,i)=>{p.course_handicap=[14.583185840707966,-0.5,9,12.2][i];p.playing_handicap=[15,-1,9,12][i];});
 const before=structuredClone(raw);
 const detail=mobileMatchDetailDataFromPreviewView(raw,identity);
 const view={rounds:[raw.round],tournament:raw.tournament,teams:raw.teams,players:raw.participants,matches:[{match:raw.match,round:raw.round,snapshot:raw.snapshot,participants:raw.participants,scores:raw.scores,holes:raw.holes,presentation:raw.presentation}]};
 const live=tournamentLiveDataFromSupabaseView(view,{mobileContract:true});
 const result=await mobileMatchesResult(identity,{dependencies:{requireTournamentReadSource:()=>({resolved:"supabase"}),readTournamentLiveView:async()=>({payload:{ok:true,data:view}}),readGuideProjection:async()=>({}),applyGuideCoursesToTournament:x=>x}});
 await assertMobileV1Schema('matches',result.body);
 const list=result.body.data.matches[0];
 const dp=detail.match.teams.flatMap(t=>t.participants),lp=list.teams.flatMap(t=>t.participants);
 for(let i=0;i<dp.length;i++) {
   assert.equal(dp[i].courseHandicap,format==='SC'?null:raw.participants[i].course_handicap);
   assert.equal(lp[i].courseHandicap,dp[i].courseHandicap);
   assert.equal(dp[i].playingHandicap,raw.participants[i].playing_handicap);
   assert.equal(lp[i].playingHandicap,raw.participants[i].playing_handicap);
   assert.equal(dp[i].strokesReceived,format==='SC'?null:raw.participants[i].final_strokes);
   assert.equal(lp[i].strokesReceived,dp[i].strokesReceived);
 }
 assert.deepEqual(raw,before);
 const again=await mobileMatchesResult(identity,{dependencies:{requireTournamentReadSource:()=>({resolved:"supabase"}),readTournamentLiveView:async()=>({payload:{ok:true,data:view}}),readGuideProjection:async()=>({}),applyGuideCoursesToTournament:x=>x}});
 assert.equal(result.revision,again.revision);
});
test('missing, malformed, nonfinite and unsupported course handicap stays unavailable',()=>{
 for(const v of [null,undefined,'',true,'abc','0x10',Infinity,NaN]) assert.equal(mobileCourseHandicap(v,'BB'),null);
 for(const v of [7.5,12.2,9,-0.5,0]) assert.equal(mobileCourseHandicap(v,'SI'),v);
 assert.equal(mobileCourseHandicap('7.5','BB'),7.5);
 assert.equal(mobileCourseHandicap(7.5,'SC'),null);
});
test('field changes read revision without changing old PH/stroke semantics', async()=>{
 let ch=7.5;
 const deps={requireTournamentReadSource:()=>({resolved:"supabase"}),readTournamentLiveView:async()=>({payload:{ok:true,data:{}}}),readGuideProjection:async()=>({}),applyGuideCoursesToTournament:x=>x,
 tournamentLiveDataFromSupabaseView:()=>({tournament:{id:'2026',name:'Test',year:2026,teamOne:{id:'T1',name:'One'},teamTwo:{id:'T2',name:'Two'}},rounds:[{number:1,matches:[{id:'2026-R1-2',format:'BB',team1Players:[{id:'P1',name:'Participant',playingHcp:8,courseHandicap:ch,stroke:2}],team2Players:[]}]}]})};
 const a=await mobileMatchesResult(identity,{dependencies:deps});ch=7.6;const b=await mobileMatchesResult(identity,{dependencies:deps});
 assert.notEqual(a.revision,b.revision);
 const strip=x=>{const y=structuredClone(x);for(const m of y.matches)for(const t of m.teams)for(const p of t.participants)delete p.courseHandicap;return y;};
 assert.deepEqual(strip(a.body.data),strip(b.body.data));
});