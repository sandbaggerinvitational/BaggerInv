import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalReviewerContext,requireReviewerRead,reviewerRevision,readCanonicalReviewer} from '../lib/mobile-reviewer-identity.js';
import {historicalReviewerMatchData,mobileReviewerHistoryResult} from '../lib/mobile-reviewer-history.js';
import {assertMobileV1Schema} from './support/mobile-v1-schema-validator.mjs';
import {historicalFixture,historicalView} from './fixtures/reviewer-history.mjs';
const authUserId='60000000-0000-4000-8000-000000000001',tournamentId='2026';
const raw=(fixture=historicalFixture)=>({kind:'observer',authUserId,tournament:{id:tournamentId,name:'Current tournament',year:2026},active:true,contextRevision:1,expiresAt:'2099-01-01T00:00:00Z',admin:false,scoring:false,historicalFixture:fixture});
const context=f=>canonicalReviewerContext(raw(f),{authUserId,tournamentId});
test('identity/revision and general reads survive missing, malformed and unavailable fixture',async()=>{
 const c=context(null);
 for(const fixture of [null,{}, {...historicalFixture,year:2026},{...historicalFixture,revisionId:'forged'}]) {
  const v=context(fixture);assert.equal(reviewerRevision(c),reviewerRevision(v));
  assert.doesNotThrow(()=>requireReviewerRead(v,{surface:'today'}));
  assert.throws(()=>requireReviewerRead(v,{surface:'match-detail',matchId:historicalFixture.matchId,historicalFixture}),{code:'MATCH_NOT_FOUND',status:404});
 }
 const client={rpc:async name=>name==='read_native_review_context_v1'?{data:{ok:true,data:raw(null)}}:Promise.reject(new Error('fixture outage'))};
 const v=await readCanonicalReviewer({authUserId,tournamentId},{env:{VERCEL_ENV:'production'},client});
 assert.equal(v.historicalFixture,null);assert.equal(reviewerRevision(v),reviewerRevision(c));
 assert.equal(reviewerRevision(context(historicalFixture)),reviewerRevision(c));
});
test('exact fixture tuple only, GET only, no arbitrary historical access',()=>{
 const c=context(historicalFixture);
 assert.doesNotThrow(()=>requireReviewerRead(c,{surface:'match-detail',matchId:historicalFixture.matchId,historicalFixture}));
 for(const patch of [{year:2024},{revisionId:'2143cada-a6de-495d-ba49-e3c83ea944fe'},{matchId:'2025-R3-11'},{tournamentId:'2024'},{bindingRevision:2},{matchId:'../other'}]) {
  assert.throws(()=>requireReviewerRead(c,{surface:'match-detail',matchId:historicalFixture.matchId,historicalFixture:{...historicalFixture,...patch}}));
 }
 for(const method of ['POST','PUT','PATCH','DELETE']) assert.throws(()=>requireReviewerRead(c,{method,surface:'scorecard',matchId:historicalFixture.matchId,historicalFixture}));
});
test('canonical historical adapter preserves scores, strokes, recorded points and absent modern finality',async()=>{
 const view=historicalView(),before=JSON.stringify(view),data=historicalReviewerMatchData(view,historicalFixture);
 await assertMobileV1Schema('match-detail',{ok:true,apiVersion:'v1',data,meta:{generatedAt:'2026-09-11T00:00:00Z',revision:'history-fixture-test'}});
 assert.equal(data.tournament.tournamentId,'2025');assert.equal(data.historical.finality,'LEGACY_FINAL');
 assert.equal(data.match.scorecard.confirmedAt,null);assert.equal(data.match.freshness.confirmedAt,null);
 assert.equal(data.match.flow,null);assert.equal(data.match.stats,null);assert.equal(data.match.clinch,null);assert.equal(data.match.result.notation,null);
 assert.deepEqual([data.historical.teamOnePoints,data.historical.teamTwoPoints],[0,3]);
 const cards=view.scorecardAnalytics.scorecards;
 assert.deepEqual(cards.map(c=>[c.frontNine,c.backNine,c.total,c.strokesReceived]),[[37,39,76,0],[41,36,77,7]]);
 assert.equal(cards[1].netTotals.total,70);
 assert.equal(data.match.teams.some(t=>t.participants.some(p=>p.isAuthenticatedPlayer)),false);
 assert.equal(JSON.stringify(view),before,'Projection cannot change History/Records');
 for(const mutation of [v=>v.matches[0].lifecycle='LIVE',v=>v.matches[0].completionState='MODERN_FINAL',v=>v.matches[0].scorecardCoverage='PARTIAL',v=>v.scorecardAnalytics.scorecards[0].holes.pop(),v=>v.revision.revision_id='wrong']) {
  const bad=historicalView();mutation(bad);assert.throws(()=>historicalReviewerMatchData(bad,historicalFixture));
 }
});
test('fixture revocation during read rejects result without changing reviewer identity',async()=>{
 const c=context(historicalFixture);let current=c,reads=0;
 const identity={kind:'observer',authUserId,tournamentId,context:c,requestedHistoricalFixture:historicalFixture};
 const dependencies={readCurrentTournamentRuntime:async()=>({lifecycle:'ACTIVE',tournamentId}),readReviewer:async()=>current,
  loadCompletedHistoryView:async()=>{reads++;return historicalView();}};
 const result=await mobileReviewerHistoryResult(identity,historicalFixture.matchId,{dependencies});
 assert.equal(result.body.data.historical.revisionId,historicalFixture.revisionId);assert.equal(identity.tournamentId,'2026');
 dependencies.loadCompletedHistoryView=async()=>{current=context(null);return historicalView();};
 await assert.rejects(()=>mobileReviewerHistoryResult(identity,historicalFixture.matchId,{dependencies}),{code:'MATCH_NOT_FOUND',status:404});
 assert.doesNotThrow(()=>requireReviewerRead(current,{surface:'today'}));assert.equal(reads,1);
});
