import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {oddsSnapshotReview} from '../lib/odds-snapshot-review.js';
import {snapshot,verifiedFixture} from './fixtures/odds-review.mjs';
import {TOURNAMENT_2026_TAGLINE} from '../lib/site-config.js';

test('review preserves every retained result and distinguishes current context from artifact bindings',()=>{
 const fixture=verifiedFixture(),before=JSON.stringify(fixture),review=oddsSnapshotReview(fixture,{revision:25,approvedHandicapRevisionNumber:7});
 assert.equal(review.snapshot,snapshot);assert.equal(JSON.stringify(fixture),before);
 assert.equal(review.snapshot.teams.reduce((sum,t)=>sum+t.rawProbability,0),100);
 assert.equal(review.snapshot.teams.reduce((sum,t)=>sum+t.expectedPoints,0),72);
 assert.deepEqual(review.rounds,[{round:1,total:6,paired:6},{round:2,total:6,paired:6},{round:3,total:12,paired:0}]);
 assert.equal(review.certification.predictionSettingsRevision,2);
 assert.equal(review.certification.currentSetupRevision,25);assert.equal(review.certification.currentHandicapRevision,7);
 assert.equal(review.certification.setupRevision,undefined);assert.equal(review.certification.handicapRevision,undefined);
 assert.match(review.singlesBasis,/independently shuffles/);assert.match(review.titleBasis,/split title credit/);
 assert.equal(review.freshness,'CURRENT');assert.equal(review.publicationEligible,true);
 const historical=oddsSnapshotReview({...fixture,alreadyPublished:true});assert.equal(historical.freshness,'HISTORICAL');assert.equal(historical.publicationEligible,false);
 const other=oddsSnapshotReview({...fixture,job:{...fixture.job,phase:'After Round 1'}});assert.match(other.singlesBasis,/does not apply/);
});

test('real publication gate stays fail-closed; read-only review cannot supersede, publish or recalculate',()=>{
 const script=`
 import assert from 'node:assert/strict';
 import {gateFixture} from './test/fixtures/odds-review-gate.mjs';
 import {readProductionOddsSnapshotReview} from './lib/production-odds-snapshot-review-server.js';
 import {readPublishableProductionOddsCalculation} from './lib/production-odds-calculation-server.js';
 const f=gateFixture(); let writes=0; const before=JSON.stringify(f.job);
 const dependencies={readJobs:async()=>({payload:{ok:true,jobs:[f.job]}}),loadInputs:async()=>f.inputs,supersedeJob:async()=>{writes++}};
 const calculationOptions={env:f.env,runtimeContext:f.runtimeContext,dependencies,rpc:async()=>{throw Error('Unexpected RPC')}};
 const options={calculationOptions,readSetup:async()=>({revision:25,approvedHandicapRevisionNumber:7})};
 const review=await readProductionOddsSnapshotReview(f.job.job_id,{},options);
 assert.deepEqual(review.snapshot,f.job.result_payload);assert.equal(review.freshness,'CURRENT');assert.equal(writes,0);assert.equal(JSON.stringify(f.job),before);
 const old=f.inputs.metadata.sourceFingerprint; f.inputs.metadata.sourceFingerprint='9'.repeat(64);
 await assert.rejects(readProductionOddsSnapshotReview(f.job.job_id,{},options),e=>e.code==='PRODUCTION_ODDS_CALCULATION_STALE');assert.equal(writes,0);
 await assert.rejects(readPublishableProductionOddsCalculation(f.job.job_id,calculationOptions),e=>e.code==='PRODUCTION_ODDS_CALCULATION_STALE');assert.equal(writes,1,'existing publisher behavior retained');f.inputs.metadata.sourceFingerprint=old;
 const sha=f.job.production_deployment_commit;f.job.production_deployment_commit='0'.repeat(40);
 await assert.rejects(readProductionOddsSnapshotReview(f.job.job_id,{},options),e=>e.code==='PRODUCTION_ODDS_JOB_SCOPE_MISMATCH');f.job.production_deployment_commit=sha;
 const fingerprint=f.job.result_fingerprint;f.job.result_fingerprint='0'.repeat(64);
 await assert.rejects(readProductionOddsSnapshotReview(f.job.job_id,{},options),e=>e.code==='PRODUCTION_ODDS_CALCULATION_RESULT_INVALID');f.job.result_fingerprint=fingerprint;
 f.job.status='RUNNING';await assert.rejects(readProductionOddsSnapshotReview(f.job.job_id,{},options),e=>e.code==='PRODUCTION_ODDS_CALCULATION_NOT_READY');f.job.status='SUCCEEDED';
 assert.equal(writes,1); console.log('current, stale, wrong release, corrupt result, incomplete, immutable review: PASS');
 `;
 const result=spawnSync(process.execPath,['--conditions=react-server','--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS/);
});

test('review uses authenticated private GET; publish confirmation and history remain separate',async()=>{
 const route=await readFile(new URL('../app/api/admin/production-odds-calculations/route.js',import.meta.url),'utf8');
 const panel=await readFile(new URL('../app/admin/director/ProductionDirectorOperations.js',import.meta.url),'utf8');
 const review=await readFile(new URL('../app/admin/director/ProductionOddsSnapshotReview.js',import.meta.url),'utf8');
 assert.ok(route.indexOf('const director = await authorizeRequest(request')<route.indexOf('const review = await readProductionOddsSnapshotReview'));
 assert.match(route,/private, no-store/);assert.match(panel,/globalThis.confirm\?\.\(`Publish/);assert.match(panel,/Historical publications/);
 assert.match(panel,/SUCCEEDED.*publicationEligible.*ProductionOddsSnapshotReview/);
 assert.match(review,/Review Snapshot/);assert.match(review,/review.freshness === "CURRENT" && review.publicationEligible === true/);
 assert.doesNotMatch(review,/method:\s*["']POST|\/api\/odds\/publish/);
});

test('three current-runtime copy locations use one exact tagline; non-2026 fallback remains',async()=>{
 assert.equal(TOURNAMENT_2026_TAGLINE,'24 Players. 3 Rounds. 2 Teams. 1 Trophy.');
 for(const path of ['app/page.js','app/Menu.js','app/components.js']){
  const source=await readFile(new URL('../'+path,import.meta.url),'utf8');assert.match(source,/TOURNAMENT_2026_TAGLINE/);assert.doesNotMatch(source,/24 players · Two teams · One trophy|24 Players • Two Teams • One Trophy/);
 }
 const home=await readFile(new URL('../app/page.js',import.meta.url),'utf8');assert.match(home,/Number\(currentTournament.year\) === 2026/);
});
