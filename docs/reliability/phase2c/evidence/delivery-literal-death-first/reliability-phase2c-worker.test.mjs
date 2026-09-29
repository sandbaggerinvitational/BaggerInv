import { FULL_NET_CALCUTTA_ENGINE, calculateProductionFullNetCalcutta } from '../lib/production-full-net.js';
// Proof layers: ACTUAL_SQL / CHILD_PROCESS / UNCHANGED_CALCULATORS / FAILURE_INJECTION.
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { installRelease139Schema, installRelease139FunctionCandidates, installCertifiedSqlRepairs } from './support/reliability/release139-schema.mjs';
import { configureFiniteTimeout, installPhase2C } from './support/reliability/phase2c-install.mjs';
import { createPhase2CFixture } from './support/reliability/phase2c-fixture.mjs';
import { createDatabase, sql, sqlFile, sqlResult, jsonLiteral, destroyIsolatedCluster, repositoryRoot } from './support/reliability/postgres17.mjs';
import { inputFor, createScoreProofFixture } from './support/reliability/phase2-score-fixture.mjs';
import { runtimeScope, syntheticDirector, seedSyntheticTournament } from './support/reliability/synthetic-tournament.mjs';
import { compatibilityVariants, seedCompatibilityVariant } from './support/reliability/phase2-eligible-history.mjs';
import { seedSyntheticSideGameHistory } from './support/reliability/synthetic-history.mjs';
import { prepareLocalScoreDerivedWorkerFixture, startLocalScoreDerivedWorker, assertLocalDerivedCurrent } from './support/reliability/phase2c-worker.mjs';
import { capturePhase2Plan } from '../tools/reliability/phase2-plan-capture.mjs';
import { classifyDerivedFailure, runScoreDerivedWorker } from '../lib/score-derived-worker.js';

const outcomes = [];
const director = { tournament_id:'2026',player_id:syntheticDirector.playerId,auth_user_id:syntheticDirector.authUserId,role:'DIRECTOR' };
function call(cluster,database,name,input={}) {
 if(name==='score_derived_delivery_tick_v1'&&!input.materialization_family){
  let result,total=0;for(const family of ['CALCUTTA','NET_SKINS','COMPETITION']){
   result=call(cluster,database,name,{...input,materialization_family:family,operation_id:randomUUID()});
   total+=result.materialized||0;if(result.cancelled||result.statusIncomplete)break;
  }return {...result,materialized:total};
 }
 const output=JSON.parse(sql(cluster,database,`select public.${name}(${jsonLiteral(runtimeScope(input))})`));
 assert.equal(output.ok,true,name+':'+String(output.code||''));return output;
}
function jobState(cluster,database) {
 return JSON.parse(sql(cluster,database,`select jsonb_build_object(
  'intents',(select count(*) from scoring_authority.score_derived_intents_v1 where status<>'SUCCEEDED'),
  'automaticJobs',(select jsonb_agg(jsonb_build_object('engine',engine_key,'status',status,'attempt',delivery_attempts,'cycle',delivery_cycle,'terminal',delivery_dead_letter_at is not null)) from scoring_authority.competition_recalculation_jobs where round_number=0 and engine_key<>'TOURNAMENT_FINAL_RECAP'),
  'calcutta',(select to_jsonb(j)-'source_revision' from scoring_authority.calcutta_v1_recalculation_jobs j where status in('PENDING','RUNNING') order by requested_at desc limit 1),
  'results',(select count(*) from scoring_authority.calcutta_v1_result_revisions),
  'currentSource',(select source_fingerprint from scoring_authority.calcutta_v1_result_revisions where is_current),
  'canonicalSource',production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2026')))`));
}
async function waitDelivered(worker,fromIndex) {
 return worker.waitFor(event=>event.type==='tick'&&!event.statusIncomplete&&event.blockedAutomatic===0&&event.pendingAutomatic===0&&event.activeLeases===0&&event.terminal===0
  &&Object.values(event.ready).every(value=>value===false),{timeoutMs:45000,fromIndex});
}
function commitScore(f,database,hole=1) {
 const input=inputFor(f.cluster,database,'2026-R3-12',hole,{key:`delivery-${randomUUID()}`});
 const result=call(f.cluster,database,'submit_production_hole_score',input);
 assert.equal(result.code,'ACCEPTED');return input;
}

test('NA-P2C-B autonomous delivery, durable retry boundaries and exact requeue', { timeout:240000 }, async t=>{
 let fixture;const children=[];
 try {
  const inheritedCandidateMode=process.env.BAGGER_PHASE2C_CANDIDATE;
  delete process.env.BAGGER_PHASE2C_CANDIDATE;
  try {fixture=await createScoreProofFixture({candidateSql:'supabase/production_migrations/202609280121_score_derived_intents_v1.sql'});}
  finally {if(inheritedCandidateMode===undefined)delete process.env.BAGGER_PHASE2C_CANDIDATE;else process.env.BAGGER_PHASE2C_CANDIDATE=inheritedCandidateMode;}
  createDatabase(fixture.cluster,'p2cb_pre_upgrade',{template:fixture.database});
  fixture.phase2c=await installPhase2C(fixture.cluster,fixture.database,{timeoutMs:5000});
  sql(fixture.cluster,fixture.database,`alter database ${fixture.database} set statement_timeout='30000ms'`,{role:''});
  seedSyntheticSideGameHistory(fixture.cluster,fixture.database,1);
  prepareLocalScoreDerivedWorkerFixture(fixture.cluster,fixture.database);
  sql(fixture.cluster,fixture.database,`alter database ${fixture.database} set statement_timeout='1000ms'`,{role:''});
  const clone=name=>{const database=`p2cb_${name}`;createDatabase(fixture.cluster,database,{template:fixture.database});configureFiniteTimeout(fixture.cluster,database,1000);return database;};
  await t.test('upgrade preserves121 pending identity, durable demand and prior successful result',async()=>{
   const database='p2cb_upgrade';createDatabase(fixture.cluster,database,{template:'p2cb_pre_upgrade'});
   sql(fixture.cluster,database,`alter database ${database} set statement_timeout='30000ms'`,{role:''});
   seedSyntheticSideGameHistory(fixture.cluster,database,1);prepareLocalScoreDerivedWorkerFixture(fixture.cluster,database);
   configureFiniteTimeout(fixture.cluster,database,1000);
   commitScore(fixture,database);
   const flushed=JSON.parse(sql(fixture.cluster,database,"set statement_timeout='5000ms';select production_control.flush_score_derived_intents_v1('2026','CALCUTTA',8)"));assert.equal(flushed.processed,1);
   const prior=JSON.parse(sql(fixture.cluster,database,`select jsonb_build_object(
    'job',(select to_jsonb(j) from scoring_authority.calcutta_v1_recalculation_jobs j where status='PENDING'),
    'result',(select to_jsonb(r) from scoring_authority.calcutta_v1_result_revisions r where is_current),
    'pendingIntents',(select count(*) from scoring_authority.score_derived_intents_v1 where status<>'SUCCEEDED'))`));
   assert.ok(prior.job.job_id);assert.equal(prior.pendingIntents,1);
   const installed=await installPhase2C(fixture.cluster,database);
   const after=JSON.parse(sql(fixture.cluster,database,`select jsonb_build_object(
    'job',(select to_jsonb(j)-'delivery_available_at'-'delivery_cycle'-'delivery_attempts'-'delivery_dead_letter_at'-'delivery_error_class'-'delivery_score_origin'
      from scoring_authority.calcutta_v1_recalculation_jobs j where job_id='${prior.job.job_id}'),
    'result',(select to_jsonb(r) from scoring_authority.calcutta_v1_result_revisions r where result_id='${prior.result.result_id}'),
    'pendingIntents',(select count(*) from scoring_authority.score_derived_intents_v1 where status<>'SUCCEEDED'))`));
   assert.deepEqual(after,prior);
   const worker=await startLocalScoreDerivedWorker({...fixture,database});children.push(worker);
   await worker.waitFor(e=>e.type==='processed'&&e.family==='CALCUTTA'&&!e.empty);await waitDelivered(worker,0);
   const parity=await assertLocalDerivedCurrent(fixture.cluster,database);await worker.stop();
   assert.equal(sql(fixture.cluster,database,`select status from scoring_authority.calcutta_v1_recalculation_jobs where job_id='${prior.job.job_id}'`),'SUCCEEDED');
   outcomes.push({case:'121-pending-upgrade',pass:true,pendingIdentityPreserved:true,priorResultPreserved:true,pendingIntents:1,installed,parity});
  });
  await t.test('migration is chained and delivery administration is unavailable to participants',()=>{
   assert.equal(sql(fixture.cluster,fixture.database,"select production_control.annual_side_game_implementation_manifest_v1()->>'scoreDerivedDeliveryContract'"),'score-derived-delivery-v1');
   for(const role of ['anon','authenticated']){
    const result=sqlResult(fixture.cluster,fixture.database,`set role ${role};select public.score_derived_delivery_tick_v1('{}')`,{role:''});
    assert.notEqual(result.status,0);assert.match(result.stderr,/permission denied/);
   }
   for(const family of ['CALCUTTA','INTELLIGENCE']){
    const result=sqlResult(fixture.cluster,fixture.database,`select public.requeue_score_derived_delivery_v1(${jsonLiteral(runtimeScope({contract_version:'score-derived-delivery-v1',authorization:director,family,work_identity:family==='CALCUTTA'?'not-a-uuid':'2026:1:TOURNAMENT_INTELLIGENCE',expected_cycle:1,expected_attempt:1,request_id:randomUUID(),reason:'Invalid exact identity probe'}))})`);
    assert.notEqual(result.status,0);assert.match(result.stderr,/DERIVED_REQUEUE_IDENTITY_INVALID/);
   }
   const invalid=sqlResult(fixture.cluster,fixture.database,`select public.fail_score_derived_preclaim_v1(${jsonLiteral(runtimeScope({contract_version:'score-derived-delivery-v1',worker_id:'invalid-identity-probe',family:'CALCUTTA',work:[{family:'CALCUTTA',key:'not-a-uuid',cycle:1,attempt:0}]}))})`);
   assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/DERIVED_PRECLAIM_IDENTITY_INVALID/);
   outcomes.push({case:'service-only-chained-manifest',pass:true,invalidExactIdentitiesDenied:3});
  });
  await t.test('a running child discovers a later committed score and completes automatic families',async()=>{
   const database=clone('automatic');const before=jobState(fixture.cluster,database);
   const worker=await startLocalScoreDerivedWorker({...fixture,database});children.push(worker);
   const fromIndex=worker.events.length;const acceptedInput=commitScore(fixture,database);
   await worker.waitFor(e=>e.type==='processed'&&e.family==='CALCUTTA',{fromIndex});
   await waitDelivered(worker,fromIndex);
   const after=jobState(fixture.cluster,database);
   assert.equal(after.intents,0);assert.equal(after.calcutta,null);assert.equal(after.currentSource,after.canonicalSource);
   assert.ok(after.automaticJobs.length===4&&after.automaticJobs.every(job=>job.status==='SUCCEEDED'));
   assert.equal(after.results,before.results+1);
   await assertLocalDerivedCurrent(fixture.cluster,database);
   await worker.stop();
   const trace=JSON.parse(sql(fixture.cluster,database,`select jsonb_build_object(
    'mutation',(select jsonb_build_object('matchId',match_id,'mutationKey',mutation_key,'matchRevision',next_match_revision,'holeRevision',next_hole_revision) from scoring_authority.score_mutations where match_id='2026-R3-12' and mutation_key=${jsonLiteral(acceptedInput.mutation_key)}#>>'{}'),
    'canonical',(select jsonb_build_object('mutationKey',mutation_key,'holeRevision',hole_revision) from scoring_authority.hole_scores where match_id='2026-R3-12' and hole_number=1),
    'intents',(select jsonb_agg(jsonb_build_object('intentId',intent_id,'family',family,'transaction',source_transaction,'revision',canonical_revision,'status',status) order by family) from scoring_authority.score_derived_intents_v1 where match_id='2026-R3-12'),
    'financial',(select jsonb_build_object('jobId',j.job_id,'cycle',j.delivery_cycle,'attempt',j.delivery_attempts,'resultId',r.result_id,'source',r.source_fingerprint,'jobSource',j.source_fingerprint) from scoring_authority.calcutta_v1_result_revisions r join scoring_authority.calcutta_v1_recalculation_jobs j using(job_id) where r.is_current),
    'automatic',(select jsonb_agg(jsonb_build_object('identity',concat(j.tournament_id,':',j.round_number,':',j.engine_key),'engine',j.engine_key,'cycle',j.delivery_cycle,'attempt',j.delivery_attempts,'generation',j.runtime_generation_id,'requested',j.requested_source_revision,'snapshotId',r.id,'source',r.source_fingerprint) order by j.engine_key) from scoring_authority.competition_recalculation_jobs j join scoring_authority.competition_derived_snapshots r using(tournament_id,round_number,engine_key) where r.is_current and j.round_number=0),
    'attemptEvents',(select jsonb_agg(jsonb_build_object('eventId',event_id,'family',family,'workIdentity',work_identity,'cycle',cycle,'attempt',attempt,'transition',transition,'generation',runtime_generation_id,'activation',handling_activation_revision,'release',handling_release_commit) order by event_id) from production_control.score_derived_delivery_attempts_v1))`));
   assert.equal(trace.canonical.mutationKey,trace.mutation.mutationKey);assert.equal(trace.canonical.holeRevision,trace.mutation.holeRevision);
   assert.equal(trace.intents.length,2);for(const intent of trace.intents){assert.equal(intent.revision.mutationKey,trace.mutation.mutationKey);assert.equal(intent.status,'SUCCEEDED');assert.ok(trace.attemptEvents.some(e=>e.family==='INTENT'&&e.workIdentity===intent.intentId));}
   assert.equal(trace.financial.source,trace.financial.jobSource);assert.ok(trace.attemptEvents.some(e=>e.family==='CALCUTTA'&&e.workIdentity===trace.financial.jobId&&e.transition==='SUCCEEDED'));
   for(const job of trace.automatic){assert.ok(trace.attemptEvents.some(e=>e.workIdentity===job.identity&&e.cycle===job.cycle&&e.transition==='SUCCEEDED'));if(job.engine==='TOURNAMENT_INTELLIGENCE')assert.ok(trace.intents.some(i=>i.intentId===job.requested.derivedIntentId));}
   trace.relationshipLimit='Financial and completed Competition work is source-bound aggregate coalescing, not an intent-to-job foreign key; current Intelligence demand retains derivedIntentId. Earlier satisfied demand need not produce its own result.';
   outcomes.push({case:'autonomous-after-commit',pass:true,events:worker.events,trace,
    acceptedScores:1,calculationResultsAdded:after.results-before.results,automaticFamilies:['CALCUTTA','COMPETITION','INTELLIGENCE'],netSkins:'WAITING_OWNER'});
  });
  await t.test('a crash after real claim retains a lease and restart recovers after expiry',async()=>{
   const database=clone('crash');commitScore(fixture,database);
   const first=await startLocalScoreDerivedWorker({...fixture,database,fault:{operation:'claim_production_calcutta_v1_recalculation',action:'crash'}});children.push(first);
   await first.waitFor(e=>e.type==='injected-crash');await first.exit;
   const retained=jobState(fixture.cluster,database);assert.equal(retained.calcutta.status,'RUNNING');
   // Clock/lease expiry injection only; no queue deletion or status reset.
   sql(fixture.cluster,database,"update scoring_authority.calcutta_v1_recalculation_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where status='RUNNING'",{role:''});
   const resumed=await startLocalScoreDerivedWorker({...fixture,database,workerId:'phase2c-resumed'});children.push(resumed);
   await resumed.waitFor(e=>e.type==='processed'&&e.family==='CALCUTTA'&&!e.empty);
   await waitDelivered(resumed,0);const after=jobState(fixture.cluster,database);assert.equal(after.currentSource,after.canonicalSource);
   await resumed.stop();outcomes.push({case:'crash-lease-restart',pass:true,clockInjectedLeaseExpiry:true,events:resumed.events});
  });
  for(const [family,operation,engines] of [
   ['COMPETITION','claim_competition_derived_jobs',['TEAM_MOMENTUM','TOURNAMENT_STORYLINES']],
   ['INTELLIGENCE','claim_intelligence_derived_bundle',['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']],
  ])await t.test(family+' actual claim crash survives process restart and expired lease',async()=>{
   const database=clone('crash_'+family.toLowerCase());commitScore(fixture,database);
   const first=await startLocalScoreDerivedWorker({...fixture,database,fault:{operation,action:'crash'}});children.push(first);
   await first.waitFor(e=>e.type==='injected-crash');await first.exit;
   const engineList=engines.map(v=>"'"+v+"'").join(',');
   assert.equal(Number(sql(fixture.cluster,database,`select count(*) from scoring_authority.competition_recalculation_jobs where engine_key in(${engineList}) and status='RUNNING'`)),2);
   sql(fixture.cluster,database,`update scoring_authority.competition_recalculation_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where engine_key in(${engineList}) and status='RUNNING'`,{role:''});
   const resumed=await startLocalScoreDerivedWorker({...fixture,database,workerId:'resumed-'+family});children.push(resumed);
   await resumed.waitFor(e=>e.type==='processed'&&e.family===family&&!e.empty);await waitDelivered(resumed,0);
   const parity=await assertLocalDerivedCurrent(fixture.cluster,database);await resumed.stop();
   outcomes.push({case:family.toLowerCase()+'-claim-crash-restart',pass:true,actualClaim:true,clockInjectedLeaseExpiry:true,parity,events:resumed.events});
  });
  for (const [family, operation, engines] of [
   ['CALCUTTA','complete_production_calcutta_v1_recalculation',[]],
   ['COMPETITION','write_competition_derived_snapshot',['TEAM_MOMENTUM','TOURNAMENT_STORYLINES']],
   ['INTELLIGENCE','write_intelligence_derived_bundle',['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']],
  ]) for (const cutpoint of ['during-calculation','before-completion','after-result-write'])
   await t.test(family+' literal process death '+cutpoint+' recovers without duplicate current results',async()=>{
    const caseName=family.toLowerCase()+'-'+cutpoint+'-process-death';
    const database=clone('death_'+family.toLowerCase()+'_'+cutpoint.replaceAll('-','_'));
    const table=family==='CALCUTTA'?'calcutta_v1_recalculation_jobs':'competition_recalculation_jobs';
    const predicate=family==='CALCUTTA'?'delivery_score_origin':`round_number=0 and engine_key in(${engines.map(v=>"'"+v+"'").join(',')})`;
    const resultTable=family==='CALCUTTA'?'calcutta_v1_result_revisions':'competition_derived_snapshots';
    const resultPredicate=family==='CALCUTTA'?'true':predicate;
    const expectedResults=family==='CALCUTTA'?1:2;
    const countResults=()=>Number(sql(fixture.cluster,database,`select count(*) from scoring_authority.${resultTable} where tournament_id='2026' and ${resultPredicate}`));
    const initialResults=countResults();commitScore(fixture,database);
    const canonical=()=>sql(fixture.cluster,database,`select encode(extensions.digest(jsonb_build_object(
      'scores',(select jsonb_agg(to_jsonb(h) order by match_id,hole_number)from scoring_authority.hole_scores h),
      'mutations',(select jsonb_agg(to_jsonb(m) order by match_id,mutation_key)from scoring_authority.score_mutations m),
      'matches',(select jsonb_agg(to_jsonb(m) order by match_id)from scoring_authority.matches m))::text,'sha256'),'hex')`);
    const unchangedCanonical=canonical();
    const state=()=>{const rows=JSON.parse(sql(fixture.cluster,database,`select coalesce(jsonb_agg(jsonb_build_object(
      'identity',coalesce(to_jsonb(j)->>'job_id',to_jsonb(j)->>'engine_key'),'status',status,
      'cycle',delivery_cycle,'attempt',delivery_attempts,'leasePresent',lease_expires_at is not null)
      order by coalesce(to_jsonb(j)->>'job_id',to_jsonb(j)->>'engine_key')),'[]')
      from scoring_authority.${table} j where tournament_id='2026' and ${predicate}`));
      return {rows,running:rows.filter(r=>r.status==='RUNNING').length,succeeded:rows.filter(r=>r.status==='SUCCEEDED').length,newResults:countResults()-initialResults};};
    const fault=cutpoint==='during-calculation'?{action:'hold-during-calculation',family}
      :{operation,action:cutpoint==='before-completion'?'hold-before-write':'crash',allMatching:family==='COMPETITION'};
    const first=await startLocalScoreDerivedWorker({...fixture,database,workerId:'death-'+family+'-'+cutpoint,fault});children.push(first);
    const eventType=cutpoint==='during-calculation'?'held-during-calculation':cutpoint==='before-completion'?'held-before-write':'injected-crash';
    const faultEvent=await first.waitFor(e=>e.type===eventType);
    if(cutpoint==='before-completion'&&family==='COMPETITION')for(const engine of engines)await first.waitFor(e=>e.type==='held-before-write'&&e.engine===engine);
    if(cutpoint==='during-calculation'){
      assert.equal(faultEvent.family,family);assert.equal(faultEvent.claimCommitted,true);
      const bytes=await readFile(path.join(repositoryRoot,faultEvent.sourceFile));
      assert.equal(faultEvent.originalSourceSha256,createHash('sha256').update(bytes).digest('hex'));
      assert.match(faultEvent.instrumentedSourceSha256,/^[a-f0-9]{64}$/);assert.notEqual(faultEvent.instrumentedSourceSha256,faultEvent.originalSourceSha256);
      assert.ok(faultEvent.insertionAfterLine>0);assert.equal(faultEvent.barrierTimeoutMs,10000);
    }
    if(cutpoint!=='after-result-write')assert.equal(first.child.kill('SIGKILL'),true);
    const exit=await first.exit;const actualProcessDeath={code:exit.code,signal:exit.signal};
    assert.deepEqual(actualProcessDeath,cutpoint==='after-result-write'?{code:77,signal:null}:{code:null,signal:'SIGKILL'});
    const beforeRestart=state();assert.equal(beforeRestart.rows.length,expectedResults);
    assert.ok(beforeRestart.rows.every(r=>r.attempt===1&&['RUNNING','SUCCEEDED'].includes(r.status)));
    assert.equal(canonical(),unchangedCanonical);
    if(cutpoint==='after-result-write'){
      assert.ok(beforeRestart.newResults>=1&&beforeRestart.newResults<=expectedResults);
      assert.equal(beforeRestart.succeeded,beforeRestart.newResults);
    }else{assert.equal(beforeRestart.running,expectedResults);assert.equal(beforeRestart.newResults,0);assert.ok(beforeRestart.rows.every(r=>r.leasePresent));}
    // Expire only still-running leases. Already committed results and successful
    // jobs stay untouched, including a partial parallel Competition completion.
    if(beforeRestart.running)sql(fixture.cluster,database,`update scoring_authority.${table} set lease_expires_at=clock_timestamp()-interval '1 second'
      where tournament_id='2026' and ${predicate} and status='RUNNING'`,{role:''});
    const resumed=await startLocalScoreDerivedWorker({...fixture,database,workerId:'restart-'+family+'-'+cutpoint});children.push(resumed);
    await waitDelivered(resumed,0);const parity=await assertLocalDerivedCurrent(fixture.cluster,database);await resumed.stop();
    const afterRestart=state();assert.equal(afterRestart.running,0);assert.equal(afterRestart.succeeded,expectedResults);assert.equal(afterRestart.newResults,expectedResults);
    for(const row of afterRestart.rows){const prior=beforeRestart.rows.find(v=>v.identity===row.identity);assert.ok(prior);assert.equal(row.cycle,prior.cycle);assert.equal(row.attempt,prior.status==='RUNNING'?2:1);}
    assert.equal(canonical(),unchangedCanonical);
    outcomes.push({case:caseName,pass:true,family,cutpoint,actualProcessDeath,claimCommitted:true,
      clockInjectedLeaseExpiry:beforeRestart.running>0,beforeRestart,afterRestart,canonicalUnchanged:true,parity,faultEvent,events:resumed.events,
      calculationInstrumentation:cutpoint==='during-calculation'?'ONE_TEST_ONLY_BARRIER_AFTER_REAL_STEP_WITH_ORIGINAL_AND_INSTRUMENTED_HASHES':'NONE'});
   });
  await t.test('unknown completion acknowledgement leaves one successful canonical result',async()=>{
   const database=clone('unknown');const before=jobState(fixture.cluster,database);commitScore(fixture,database);
   const worker=await startLocalScoreDerivedWorker({...fixture,database,fault:{operation:'complete_production_calcutta_v1_recalculation',action:'unknown-ack'}});children.push(worker);
   await worker.waitFor(e=>e.type==='failed'&&e.family==='CALCUTTA');await waitDelivered(worker,0);
   const after=jobState(fixture.cluster,database);assert.equal(after.results,before.results+1);assert.equal(after.currentSource,after.canonicalSource);
   await worker.stop();outcomes.push({case:'unknown-completion-ack',pass:true,resultsAdded:1,events:worker.events});
  });
  for(const [family,operation,engines] of [
   ['COMPETITION','write_competition_derived_snapshot',['TEAM_MOMENTUM','TOURNAMENT_STORYLINES']],
   ['INTELLIGENCE','write_intelligence_derived_bundle',['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']],
  ])await t.test(family+' actual completion acknowledgement loss converges without duplicate snapshots',async()=>{
   const database=clone('ack_'+family.toLowerCase());commitScore(fixture,database);
   const engineSql=engines.map(v=>"'"+v+"'").join(',');
   const count=()=>Number(sql(fixture.cluster,database,`select count(*) from scoring_authority.competition_derived_snapshots where tournament_id='2026' and round_number=0 and engine_key in(${engineSql})`));
   const before=count();const worker=await startLocalScoreDerivedWorker({...fixture,database,fault:{operation,action:'unknown-ack'}});children.push(worker);
   await worker.waitFor(e=>e.type==='injected-ack-loss'&&e.operation===operation);await waitDelivered(worker,0);
   const parity=await assertLocalDerivedCurrent(fixture.cluster,database);await worker.stop();
   assert.equal(count()-before,2);assert.equal(sql(fixture.cluster,database,`select count(*) from scoring_authority.competition_recalculation_jobs where engine_key in(${engineSql}) and status='SUCCEEDED'`),'2');
   outcomes.push({case:family.toLowerCase()+'-completion-ack-loss',pass:true,actualCommittedWrite:true,newSnapshots:2,parity,events:worker.events});
  });
  for(const [family,operation,engines] of [
   ['CALCUTTA','claim_production_calcutta_v1_recalculation',[]],
   ['COMPETITION','claim_competition_derived_jobs',['TEAM_MOMENTUM','TOURNAMENT_STORYLINES']],
   ['INTELLIGENCE','claim_intelligence_derived_bundle',['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']],
  ])await t.test(family+' deterministic claim failure does not prevent other families completing',async()=>{
   const database=clone('isolation_'+family.toLowerCase());commitScore(fixture,database);
   sql(fixture.cluster,database,`alter function public.${operation}(jsonb) rename to fixture_missing_claim`,{role:''});
   const worker=await startLocalScoreDerivedWorker({...fixture,database});children.push(worker);
   await worker.waitFor(e=>e.type==='failed'&&e.family===family&&e.sqlstate==='42883');
   const terminal=family==='CALCUTTA'?1:2;
   await worker.waitFor(e=>e.type==='tick'&&e.cycle>=3&&e.terminal===terminal&&e.activeLeases===0&&Object.values(e.ready).every(v=>v===false));await worker.stop();
   const jobs=JSON.parse(sql(fixture.cluster,database,"select jsonb_agg(jsonb_build_object('engine',engine_key,'status',status,'attempts',delivery_attempts)) from scoring_authority.competition_recalculation_jobs where round_number=0 and engine_key<>'TOURNAMENT_FINAL_RECAP'"));
   for(const j of jobs){assert.equal(j.status,engines.includes(j.engine)?'FAILED':'SUCCEEDED');if(engines.includes(j.engine))assert.equal(j.attempts,1);}
   assert.equal(sql(fixture.cluster,database,"select status from scoring_authority.calcutta_v1_recalculation_jobs where delivery_score_origin order by requested_at desc limit 1"),family==='CALCUTTA'?'FAILED':'SUCCEEDED');
   assert.equal(worker.events.filter(e=>e.type==='failed'&&e.family===family).length,1);
   outcomes.push({case:family.toLowerCase()+'-failure-isolation',pass:true,actualSqlstate:'42883',terminal,otherFamiliesSucceeded:true,failedInvocations:1,events:worker.events});
  });
  await t.test('deterministic preclaim failure terminates once, Director requeue preserves exact receipt',()=>{
   const database=clone('requeue');commitScore(fixture,database);
   const tick=call(fixture.cluster,database,'score_derived_delivery_tick_v1',{contract_version:'score-derived-delivery-v1',worker_id:'phase2c-terminal',operation_id:randomUUID()});
   const work=tick.work.filter(item=>item.family==='COMPETITION');assert.equal(work.length,2);
   call(fixture.cluster,database,'fail_score_derived_preclaim_v1',{contract_version:'score-derived-delivery-v1',worker_id:'phase2c-terminal',family:'COMPETITION',work,error_code:'42883'});
   const row=JSON.parse(sql(fixture.cluster,database,"select to_jsonb(j) from scoring_authority.competition_recalculation_jobs j where engine_key='TEAM_MOMENTUM' and round_number=0"));
   assert.equal(row.status,'FAILED');assert.equal(row.delivery_attempts,1);assert.ok(row.delivery_dead_letter_at);
   const requeue={contract_version:'score-derived-delivery-v1',authorization:director,family:'COMPETITION',work_identity:'2026:0:TEAM_MOMENTUM',expected_cycle:row.delivery_cycle,expected_attempt:1,request_id:randomUUID(),reason:'Missing function corrected in candidate'};
   assert.equal(call(fixture.cluster,database,'requeue_score_derived_delivery_v1',requeue).idempotent,false);
   assert.equal(call(fixture.cluster,database,'requeue_score_derived_delivery_v1',requeue).idempotent,true);
   const conflict=sqlResult(fixture.cluster,database,`select public.requeue_score_derived_delivery_v1(${jsonLiteral(runtimeScope({...requeue,reason:'different request'}))})`);
   assert.notEqual(conflict.status,0);assert.match(conflict.stderr,/REUSE_CONFLICT/);
   assert.equal(sql(fixture.cluster,database,"select count(*) from production_control.score_derived_delivery_attempts_v1 where work_identity='2026:0:TEAM_MOMENTUM' and transition='REQUEUED'"),'1');
   outcomes.push({case:'deterministic-terminal-exact-requeue',pass:true,terminalAttempts:1,recoveryEvents:1});
  });
  for (const [caseName,operation,position,revalidation,correction=false] of [
   ['intelligence-correction-before-write','write_intelligence_derived_bundle','score-before',false,true],
   ['competition-before-claim','claim_competition_derived_jobs','score-before',false],
   ['competition-before-write','write_competition_derived_snapshot','score-before',false],
   ['intelligence-before-claim','claim_intelligence_derived_bundle','score-before',true],
   ['intelligence-after-claim','claim_intelligence_derived_bundle','score-after',true],
   ['intelligence-before-write','write_intelligence_derived_bundle','score-before',false],
   ['calcutta-before-claim','claim_production_calcutta_v1_recalculation','score-before',false],
  ]) await t.test(caseName+' retains later score demand and converges to canonical source',async()=>{
   const database=clone(caseName.replaceAll('-','_'));commitScore(fixture,database,1);
   const scoreInput=inputFor(fixture.cluster,database,'2026-R3-12',correction?1:2,{key:`race-${randomUUID()}`});if(correction)scoreInput.team_1_gross_scores=scoreInput.team_1_gross_scores.map(v=>v+1);
   const worker=await startLocalScoreDerivedWorker({...fixture,database,fault:{operation,action:position,scoreInput}});children.push(worker);
   const injected=await worker.waitFor(e=>e.type==='injected-score');assert.ok(injected.pendingCompetitionIntents>0);
   if(revalidation)await worker.waitFor(e=>e.type==='failed'&&e.family==='INTELLIGENCE'&&e.sqlstate==='40001');
   await waitDelivered(worker,0);const parity=await assertLocalDerivedCurrent(fixture.cluster,database);
   await worker.stop();outcomes.push({case:caseName,pass:true,postClaimRevalidation:revalidation,sameHoleCorrection:correction,parity,events:worker.events});
  });
  for(const [family,operation] of [['COMPETITION','write_competition_derived_snapshot'],['INTELLIGENCE','write_intelligence_derived_bundle']])
   await t.test(family+' stale writer cannot replace a newer canonical current result',async()=>{
    const database=clone('late_'+family.toLowerCase());commitScore(fixture,database);
    const old=await startLocalScoreDerivedWorker({...fixture,database,workerId:'old-'+family,fault:{operation,action:'hold-before-write'}});children.push(old);
    await old.waitFor(e=>e.type==='held-before-write');
    const corrected=inputFor(fixture.cluster,database,'2026-R3-12',1,{key:`late-${family}`});corrected.team_1_gross_scores=corrected.team_1_gross_scores.map(v=>v+1);
    assert.equal(call(fixture.cluster,database,'submit_production_hole_score',corrected).code,'ACCEPTED');
    const fresh=await startLocalScoreDerivedWorker({...fixture,database,workerId:'new-'+family});children.push(fresh);
    await waitDelivered(fresh,0);const before=await assertLocalDerivedCurrent(fixture.cluster,database);await fresh.stop();
    const pointers=()=>sql(fixture.cluster,database,"select jsonb_agg(jsonb_build_object('engine',engine_key,'source',source_fingerprint,'payload',payload_hash,'id',id) order by engine_key)::text from scoring_authority.competition_derived_snapshots where is_current and engine_key<>'NET_SKINS'");
    const retained=pointers();old.child.send({type:'release-held-write'});
    await old.waitFor(e=>e.type==='failed'&&e.family===family);await waitDelivered(old,0);await old.stop();
    assert.equal(pointers(),retained);const after=await assertLocalDerivedCurrent(fixture.cluster,database);assert.deepEqual(after,before);
    outcomes.push({case:family.toLowerCase()+'-late-writer-current-pointer',pass:true,actualClaimAndWrite:true,sameHoleCorrection:true,newerCurrentPointersUnchanged:true,parity:after,events:old.events});
   });
  for(const [family,operation,engines] of [
   ['CALCUTTA','complete_production_calcutta_v1_recalculation',[]],
   ['COMPETITION','write_competition_derived_snapshot',['TEAM_MOMENTUM','TOURNAMENT_STORYLINES']],
   ['INTELLIGENCE','write_intelligence_derived_bundle',['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']],
  ])await t.test(family+' expired live worker cannot overwrite a same-source replacement claim',async()=>{
   const database=clone('live_expiry_'+family.toLowerCase());commitScore(fixture,database);
   const table=family==='CALCUTTA'?'calcutta_v1_recalculation_jobs':'competition_recalculation_jobs';
   const familyPredicate=family==='CALCUTTA'?"delivery_score_origin":`round_number=0 and engine_key in(${engines.map(v=>"'"+v+"'").join(',')})`;
   const authority=()=>sql(fixture.cluster,database,`select encode(extensions.digest(jsonb_build_object(
    'activation',(select activation_revision from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION'),
    'pointer',(select to_jsonb(p)from production_control.current_tournament_pointer_v1 p where scope_key='BAGGER_INV_PRODUCTION'),
    'source',production_control.calcutta_v1_source_revision('2026'))::text,'sha256'),'hex')`);
   const jobs=()=>JSON.parse(sql(fixture.cluster,database,`select jsonb_agg(jsonb_build_object(
    'identity',coalesce(to_jsonb(j)->>'job_id',to_jsonb(j)->>'engine_key'),'status',status,
    'cycle',delivery_cycle,'attempt',delivery_attempts,'startedAt',started_at,
    'claimIdentityHash',encode(extensions.digest(coalesce(claim_token::text,started_at::text),'sha256'),'hex'))
    order by coalesce(to_jsonb(j)->>'job_id',to_jsonb(j)->>'engine_key'))
    from scoring_authority.${table} j where tournament_id='2026' and ${familyPredicate}`));
   const footprint=()=>sql(fixture.cluster,database,`select encode(extensions.digest(jsonb_build_object(
    'financial',(select jsonb_agg(jsonb_build_object('id',result_id,'job',job_id,'source',source_fingerprint,'payload',payload_hash,'current',is_current)order by result_id)from scoring_authority.calcutta_v1_result_revisions where tournament_id='2026'),
    'derived',(select jsonb_agg(jsonb_build_object('id',id,'engine',engine_key,'source',source_fingerprint,'payload',payload_hash,'current',is_current)order by id)from scoring_authority.competition_derived_snapshots where tournament_id='2026'),
    'attempts',(select jsonb_agg(to_jsonb(v)order by event_id)from production_control.score_derived_delivery_attempts_v1 v where tournament_id='2026'))::text,'sha256'),'hex')`);
   const old=await startLocalScoreDerivedWorker({...fixture,database,workerId:'expired-live-'+family,fault:{operation,action:'hold-before-write',allMatching:family==='COMPETITION'}});children.push(old);
   await old.waitFor(e=>e.type==='held-before-write');if(family==='COMPETITION')for(const engine of engines)await old.waitFor(e=>e.type==='held-before-write'&&e.engine===engine);const held=jobs(),canonical=authority();assert.equal(held.length,family==='CALCUTTA'?1:2);assert.ok(held.every(v=>v.status==='RUNNING'&&v.attempt===1));
   // Expire only the lease clock. Do not change source, activation, generation,
   // status, due time, claim token, attempt budget or the retained live child.
   sql(fixture.cluster,database,`update scoring_authority.${table} set lease_expires_at=clock_timestamp()-interval '1 second' where tournament_id='2026' and ${familyPredicate} and status='RUNNING'`,{role:''});
   const fresh=await startLocalScoreDerivedWorker({...fixture,database,workerId:'replacement-live-'+family});children.push(fresh);
   await fresh.waitFor(e=>e.type==='processed'&&e.family===family&&!e.empty);await waitDelivered(fresh,0);const parity=await assertLocalDerivedCurrent(fixture.cluster,database);await fresh.stop();
   assert.equal(authority(),canonical,'source, activation and generation unchanged');assert.equal(old.child.exitCode,null,'original child remains live');
   const replaced=jobs();assert.equal(replaced.length,held.length);
   for(let index=0;index<held.length;index++){assert.equal(replaced[index].identity,held[index].identity);assert.equal(replaced[index].cycle,held[index].cycle);assert.equal(replaced[index].attempt,held[index].attempt+1);assert.equal(replaced[index].status,'SUCCEEDED');assert.notEqual(replaced[index].startedAt,held[index].startedAt);assert.notEqual(replaced[index].claimIdentityHash,held[index].claimIdentityHash);}
   const retained=footprint(),fromIndex=old.events.length;old.child.send({type:'release-held-write'});
   const rejected=await old.waitFor(e=>e.type==='failed'&&e.family===family,{fromIndex});await waitDelivered(old,fromIndex);await old.stop();
   assert.equal(footprint(),retained,'late old write/failure acknowledgement cannot alter results or attempt audit');assert.equal(authority(),canonical);assert.deepEqual(await assertLocalDerivedCurrent(fixture.cluster,database),parity);
   outcomes.push({case:family.toLowerCase()+'-expired-live-same-source',pass:true,clockInjectedLeaseExpiry:true,
    sourceActivationGenerationUnchanged:true,jobIdentitiesPreserved:true,claimIdentityChanged:true,realBackoffObservedWithoutDueTimeEdit:true,
    oldChildAliveUntilRelease:true,lateFailure:{code:rejected.code,sqlstate:rejected.sqlstate},currentAndHistoryAndAuditUnchanged:true,
    held:held.map(({claimIdentityHash,...v})=>v),replacement:replaced.map(({claimIdentityHash,...v})=>v),parity,events:old.events,replacementEvents:fresh.events});
  });
  let expectedFinancialPayload=null;
  for(const variant of compatibilityVariants) await t.test('score-intent exact-current processing preserves financial output: '+variant.name,async()=>{
   const database=clone('compat_'+variant.name);commitScore(fixture,database);
   // Receipt is constructed AFTER the score, while its older durable intent is
   // pending. This explicitly tests later compatibility cannot bypass canonical
   // processing. Receipt issuance itself remains a synthetic fixture boundary.
   seedCompatibilityVariant(fixture.cluster,database,variant.name);
   const financialHash=()=>sql(fixture.cluster,database,`select encode(extensions.digest(jsonb_build_object(
    'configuration',(select to_jsonb(c)-'updated_at' from scoring_authority.calcutta_v1_current c where tournament_id='2026')
      -'state'-'result_revision'-'last_error_code'-'last_error_safe',
    'publication',(select count(*) from scoring_authority.calcutta_v1_publication_revisions),
    'auction',(select count(*) from scoring_authority.calcutta_v1_auction_fact_revisions))::text,'sha256'),'hex')`);
   const before=financialHash();const worker=await startLocalScoreDerivedWorker({...fixture,database});children.push(worker);
   await worker.waitFor(e=>e.type==='processed'&&e.family==='CALCUTTA'&&!e.empty);await waitDelivered(worker,0);
   const parity=await assertLocalDerivedCurrent(fixture.cluster,database);assert.equal(financialHash(),before);
   const payload=JSON.parse(sql(fixture.cluster,database,"select engine_result_payload from scoring_authority.calcutta_v1_result_revisions where is_current"));
   if(expectedFinancialPayload===null)expectedFinancialPayload=payload;else assert.deepEqual(payload,expectedFinancialPayload);
   await worker.stop();outcomes.push({case:'receipt-'+variant.name,pass:true,syntheticReceipt:true,delayedIntent:true,
    exactFinancialPayloadParity:true,financialConfigurationAndPublicationUnchanged:true,parity});
  });
  await t.test('real25ms cancellation records each intent attempt across connections and reaches terminal',()=>{
   const database=clone('cancel');commitScore(fixture,database);
   sql(fixture.cluster,database,`alter function production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text) rename to fixture_enqueue_before_timeout;
    create function production_control.enqueue_score_calcutta_v1(reason_value text,requested_by_value text,force_value boolean default false,
     request_fingerprint_value text default null,request_payload_hash_value text default null)
    returns jsonb language plpgsql security definer set search_path=pg_catalog as $inject$
    begin perform pg_sleep(0.2); return production_control.fixture_enqueue_before_timeout(reason_value,requested_by_value,force_value,request_fingerprint_value,request_payload_hash_value); end $inject$;
    revoke all on function production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text) from public,anon,authenticated,service_role;`,{role:''});
   const elapsed=[];
   for(let attempt=1;attempt<=5;attempt++){
    if(attempt>1)sql(fixture.cluster,database,"update scoring_authority.score_derived_intents_v1 set available_at=clock_timestamp()-interval '1 second' where family='CALCUTTA' and status='RETRYABLE'",{role:''});
    const input=runtimeScope({contract_version:'score-derived-delivery-v1',worker_id:'phase2c-cancel',operation_id:randomUUID()});
    const start=performance.now();const result=JSON.parse(sql(fixture.cluster,database,`set statement_timeout='25ms';select public.score_derived_delivery_tick_v1(${jsonLiteral({...input,materialization_family:'CALCUTTA'})})`));elapsed.push(performance.now()-start);
    assert.equal(result.ok,true);assert.equal(result.cancelled,true);assert.equal(result.statusIncomplete,true);assert.equal(result.pendingAutomatic,1);
    const intent=JSON.parse(sql(fixture.cluster,database,"select to_jsonb(i) from scoring_authority.score_derived_intents_v1 i where family='CALCUTTA'"));
    assert.equal(intent.attempts,attempt);assert.equal(intent.last_sqlstate,'57014');assert.equal(intent.status,attempt===5?'DEAD_LETTER':'RETRYABLE');
    if(attempt<5)assert.ok(Date.parse(intent.available_at)>Date.now());
   }
   assert.equal(sql(fixture.cluster,database,"select count(*) from production_control.score_derived_delivery_attempts_v1 where family='INTENT' and safe_code='57014'"),'5');
   outcomes.push({case:'actual57014-durable-budget',pass:true,statementTimeoutMs:25,attempts:5,elapsedMs:elapsed,
    expeditedBackoffClock:true,newConnectionEachAttempt:true});
  });
  await t.test('Intelligence delayed, running and terminal siblings suppress automatic thrash',async()=>{
   const database=clone('intel_group');commitScore(fixture,database);
   const input={contract_version:'score-derived-delivery-v1',worker_id:'group-proof',operation_id:randomUUID()};
   const initial=call(fixture.cluster,database,'score_derived_delivery_tick_v1',input);
   call(fixture.cluster,database,'fail_score_derived_preclaim_v1',{...input,family:'INTELLIGENCE',
    work:initial.work.filter(v=>v.key==='PROJECTION_EDITORIAL'),error_code:'40001'});
   assert.equal(call(fixture.cluster,database,'score_derived_delivery_tick_v1',input).ready.INTELLIGENCE,false);
   sql(fixture.cluster,database,"update scoring_authority.competition_recalculation_jobs set delivery_available_at=clock_timestamp()-interval '1 second' where engine_key='PROJECTION_EDITORIAL'",{role:''});
   const claim=call(fixture.cluster,database,'claim_intelligence_derived_bundle',{worker_id:'group-proof',requested_by:'group-proof',engine_keys:['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']});assert.notEqual(claim.empty,true);
   assert.equal(call(fixture.cluster,database,'score_derived_delivery_tick_v1',input).ready.INTELLIGENCE,false);
   call(fixture.cluster,database,'fail_intelligence_derived_bundle_v1',{...input,claim_started_at:claim.claim_started_at,claim_token:claim.claim_token,error_code:'42883'});
   assert.equal(call(fixture.cluster,database,'score_derived_delivery_tick_v1',input).ready.INTELLIGENCE,false);
   const worker=await startLocalScoreDerivedWorker({...fixture,database,intervalMs:20});children.push(worker);
   await worker.waitFor(e=>e.type==='tick'&&e.cycle>=5);await worker.stop();
   assert.equal(worker.events.filter(e=>e.type==='processed'&&e.family==='INTELLIGENCE').length,0);
   outcomes.push({case:'intelligence-sibling-no-thrash',pass:true,delayed:true,running:true,terminal:true,actualChildCycles:6});
  });
  await t.test('lone FinalRecap recovery requires existing final publication and preserves successful siblings',async()=>{
   const database=clone('final_recap');commitScore(fixture,database);
   const first=await startLocalScoreDerivedWorker({...fixture,database});children.push(first);
   await first.waitFor(e=>e.type==='processed'&&e.family==='CALCUTTA'&&!e.empty);await waitDelivered(first,0);await first.stop();
   const claim=call(fixture.cluster,database,'claim_intelligence_derived_bundle',{worker_id:'final-proof',requested_by:'final-proof',engine_keys:['TOURNAMENT_FINAL_RECAP']});assert.notEqual(claim.empty,true);
   call(fixture.cluster,database,'fail_intelligence_derived_bundle_v1',{contract_version:'score-derived-delivery-v1',worker_id:'final-proof',claim_started_at:claim.claim_started_at,claim_token:claim.claim_token,error_code:'42883'});
   const row=JSON.parse(sql(fixture.cluster,database,"select to_jsonb(j) from scoring_authority.competition_recalculation_jobs j where engine_key='TOURNAMENT_FINAL_RECAP'"));
   const recovery={contract_version:'score-derived-delivery-v1',authorization:director,family:'INTELLIGENCE',work_identity:'2026:0:TOURNAMENT_FINAL_RECAP',expected_cycle:row.delivery_cycle,expected_attempt:row.delivery_attempts,request_id:randomUUID(),reason:'Final processor cause corrected'};
   const closed=sqlResult(fixture.cluster,database,`select public.requeue_score_derived_delivery_v1(${jsonLiteral(runtimeScope(recovery))})`);assert.notEqual(closed.status,0);assert.match(closed.stderr,/DERIVED_FINAL_RECAP_GATE_REQUIRED/);
   // Synthetic authoritative final/publication state only. This does not issue
   // a protected publication or claim full-round canonical lifecycle proof.
   sql(fixture.cluster,database,`set session_replication_role=replica;
    update scoring_authority.matches set status='FINAL',scorecard_complete=true,scoring_locked=true,finalized_at=clock_timestamp();
    update scoring_authority.odds_published_snapshots set published_payload=published_payload||jsonb_build_object('phase','Final Results','phaseOrder',4,'year',2026,'players','[]'::jsonb,'teams','[]'::jsonb)
      where milestone='Final Results' and is_current_for_milestone;
    update scoring_authority.competition_recalculation_jobs set delivery_attempts=5
      where engine_key in('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL') and status='SUCCEEDED';
    set session_replication_role=origin;`,{role:''});
   assert.equal(sql(fixture.cluster,database,"select production_control.derived_final_recap_ready_v1('2026')"),'t');
   const footprint=()=>sql(fixture.cluster,database,"select md5((select jsonb_agg(to_jsonb(m) order by match_id)::text from scoring_authority.matches m)||(select jsonb_agg(to_jsonb(h) order by match_id,hole_number)::text from scoring_authority.hole_scores h))");
   const before=footprint();call(fixture.cluster,database,'requeue_score_derived_delivery_v1',recovery);
   assert.equal(sql(fixture.cluster,database,"select count(*) from scoring_authority.competition_recalculation_jobs where engine_key in('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL') and status='SUCCEEDED' and delivery_attempts=5"),'2');
   const demand=JSON.parse(sql(fixture.cluster,database,"select jsonb_agg(jsonb_build_object('engine',engine_key,'status',status,'attempt',delivery_attempts,'source',requested_source_revision) order by engine_key) from scoring_authority.competition_recalculation_jobs where engine_key in('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP')"));
   assert.ok(demand.every(v=>JSON.stringify(v.source)===JSON.stringify(demand[0].source)),JSON.stringify(demand));
   const plan=capturePhase2Plan(fixture.cluster,database,{id:'final-gate-tick',sql:`select public.score_derived_delivery_tick_v1(${jsonLiteral(runtimeScope({contract_version:'score-derived-delivery-v1',worker_id:'final-plan',operation_id:randomUUID(),materialization_family:'COMPETITION'}))})`,setupSql:"set local statement_timeout='5000ms';",validateResult:out=>{const v=JSON.parse(out);assert.equal(v.ok,true);assert.equal(v.ready.INTELLIGENCE,true);}});
   const worker=await startLocalScoreDerivedWorker({...fixture,database});children.push(worker);
   await worker.waitFor(e=>e.type==='processed'&&e.family==='INTELLIGENCE'&&!e.empty);await waitDelivered(worker,0);await worker.stop();
   assert.equal(footprint(),before);
   assert.equal(sql(fixture.cluster,database,"select count(*) from scoring_authority.competition_derived_snapshots where engine_key='TOURNAMENT_FINAL_RECAP' and is_current"),'1');
   assert.equal(sql(fixture.cluster,database,"select count(*) from production_control.score_derived_delivery_attempts_v1 where safe_code='SUCCESSFUL_SIBLING_REJOINED_BUNDLE'"),'2');
   const empty=call(fixture.cluster,database,'claim_intelligence_derived_bundle',{worker_id:'final-proof',requested_by:'final-proof',engine_keys:['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP']});assert.equal(empty.empty,true);
   outcomes.push({case:'lone-final-recovery',pass:true,plan,canonicalDemandPreserved:true,syntheticFinalAndPublishedOdds:true,priorSucceededAttemptCountInjected:5,
    successfulSiblingsPreservedAtRequeue:true,auditedRejoins:2,currentFinalSnapshots:1,canonicalFootprintUnchanged:true,allSucceededCannotReclaim:true});
  });
  await t.test('two autonomous workers share claims and converge without a manual tick',async()=>{
   const database=clone('two_workers');
   const first=await startLocalScoreDerivedWorker({...fixture,database,workerId:'phase2c-first'});children.push(first);
   const second=await startLocalScoreDerivedWorker({...fixture,database,workerId:'phase2c-second'});children.push(second);
   const fromFirst=first.events.length,fromSecond=second.events.length;
   for(let hole=1;hole<=4;hole++)commitScore(fixture,database,hole);
   const lastCommitAt=Date.now();
   const currentIdle=e=>e.type==='tick'&&e.tickStartedAt>lastCommitAt&&!e.statusIncomplete&&e.blockedAutomatic===0
    &&e.pendingAutomatic===0&&e.activeLeases===0&&e.terminal===0&&Object.values(e.ready).every(v=>v===false);
   await first.waitFor(currentIdle,{fromIndex:fromFirst});await second.waitFor(currentIdle,{fromIndex:fromSecond});
   const parity=await assertLocalDerivedCurrent(fixture.cluster,database);
   await first.stop();await second.stop();
   assert.equal(first.events.concat(second.events).filter(e=>e.type==='halted').length,0);
   outcomes.push({case:'two-workers',pass:true,parity,events:[first.events,second.events]});
  });
  await t.test('closed worker gate stops the autonomous process visibly after one denied tick',async()=>{
   const database=clone('closed_gate');commitScore(fixture,database);
   sql(fixture.cluster,database,"update production_control.resource_scope set workers_enabled=false",{role:''});
   const worker=await startLocalScoreDerivedWorker({...fixture,database});children.push(worker);await worker.exit;
   assert.equal(worker.events.filter(e=>e.type==='tick-failed').length,1);
   assert.equal(worker.events.find(e=>e.type==='halted').reason,'TERMINAL_TICK_FAILURE');
   assert.equal(jobState(fixture.cluster,database).intents,2);
   outcomes.push({case:'closed-gate-autonomous',pass:true,tickAttempts:1,pendingIntentsRetained:2});
  });
  await t.test('each automatic family exhausts five durable attempts then exact Director requeue recovers',async()=>{
   const database=clone('job_budget');commitScore(fixture,database);
   const input={contract_version:'score-derived-delivery-v1',worker_id:'phase2c-job-budget',operation_id:randomUUID()};
   const requeues=[];
   for(const family of ['CALCUTTA','COMPETITION','INTELLIGENCE']){
    const first=call(fixture.cluster,database,'score_derived_delivery_tick_v1',input);
    const initial=first.work.find(v=>v.family===family);assert.ok(initial);
    const table=family==='CALCUTTA'?'calcutta_v1_recalculation_jobs':'competition_recalculation_jobs';
    const predicate=family==='CALCUTTA'?`job_id='${initial.key}'`:`engine_key='${initial.key}' and round_number=0`;
    let row;
    for(let attempt=1;attempt<=5;attempt++){
     if(attempt>1)sql(fixture.cluster,database,`update scoring_authority.${table} set delivery_available_at=clock_timestamp()-interval '1 second' where ${predicate}`,{role:''});
     const tick=call(fixture.cluster,database,'score_derived_delivery_tick_v1',input);
     const work=tick.work.filter(v=>v.key===initial.key);assert.equal(work.length,1);
     call(fixture.cluster,database,'fail_score_derived_preclaim_v1',{...input,family,work,error_code:'40001'});
     row=JSON.parse(sql(fixture.cluster,database,`select to_jsonb(j) from scoring_authority.${table} j where ${predicate}`));
     assert.equal(row.delivery_attempts,attempt);assert.equal(row.status,attempt===5?'FAILED':'PENDING');
     assert.equal(Boolean(row.delivery_dead_letter_at),attempt===5);
     if(attempt<5)assert.ok(Date.parse(row.delivery_available_at)>Date.now());
    }
    const identity=family==='CALCUTTA'?initial.key:`2026:0:${initial.key}`;
    const tick=call(fixture.cluster,database,'score_derived_delivery_tick_v1',input);assert.ok(!tick.work.some(v=>v.key===initial.key));
    const provenance=JSON.parse(sql(fixture.cluster,database,`select jsonb_build_object('count',count(*),'bound',bool_and(
     handling_activation_revision=139 and handling_release_commit is not null and processor_contract='score-derived-delivery-v1'))
     from production_control.score_derived_delivery_attempts_v1 where work_identity='${identity}'`));
    assert.equal(provenance.count,10);assert.equal(provenance.bound,true);
    requeues.push({family,identity,row});outcomes.push({case:family.toLowerCase()+'-five-attempt-budget',pass:true,
     attempts:5,immutableEvents:10,expeditedBackoffClock:true,provenance});
   }
   assert.equal(call(fixture.cluster,database,'score_derived_delivery_tick_v1',input).terminal,3);
   for(const {family,identity,row} of requeues){
    const receipt=call(fixture.cluster,database,'requeue_score_derived_delivery_v1',{...input,authorization:director,family,work_identity:identity,
     expected_cycle:row.delivery_cycle,expected_attempt:5,request_id:randomUUID(),reason:'Injected transient cause removed'});
    assert.equal(receipt.cycle,row.delivery_cycle+1);
   }
   const worker=await startLocalScoreDerivedWorker({...fixture,database});children.push(worker);
   await worker.waitFor(e=>e.type==='processed'&&e.family==='CALCUTTA'&&!e.empty);await waitDelivered(worker,0);
   const parity=await assertLocalDerivedCurrent(fixture.cluster,database);await worker.stop();
   outcomes.push({case:'all-family-requeue-delivery',pass:true,families:requeues.map(v=>v.family),parity});
  });
  await t.test('terminal Calcutta work survives compatible activation and exact supported recovery',async()=>{
   const database=clone('terminal_activation');commitScore(fixture,database);
   const input={contract_version:'score-derived-delivery-v1',worker_id:'terminal-activation',operation_id:randomUUID()};
   const initial=call(fixture.cluster,database,'score_derived_delivery_tick_v1',input),work=initial.work.filter(v=>v.family==='CALCUTTA');assert.equal(work.length,1);
   call(fixture.cluster,database,'fail_score_derived_preclaim_v1',{...input,family:'CALCUTTA',work,error_code:'42883'});
   const old=JSON.parse(sql(fixture.cluster,database,`select to_jsonb(j) from scoring_authority.calcutta_v1_recalculation_jobs j where job_id='${work[0].key}'`));assert.equal(old.status,'FAILED');assert.ok(old.delivery_dead_letter_at);
   const priorEvents=JSON.parse(sql(fixture.cluster,database,`select jsonb_agg(to_jsonb(e) order by event_id) from production_control.score_derived_delivery_attempts_v1 e where work_identity='${old.job_id}'`));
   const requeue={...input,authorization:director,family:'CALCUTTA',work_identity:old.job_id,expected_cycle:old.delivery_cycle,expected_attempt:old.delivery_attempts,request_id:randomUUID(),reason:'Compatible release contains the corrected processor'};
   const correction=inputFor(fixture.cluster,database,'2026-R3-12',1,{key:'terminal-source-probe'});correction.team_1_gross_scores=correction.team_1_gross_scores.map(v=>v+1);
   const sourceDenied=sqlResult(fixture.cluster,database,`begin;select public.submit_production_hole_score(${jsonLiteral(runtimeScope(correction))});select public.requeue_score_derived_delivery_v1(${jsonLiteral(runtimeScope(requeue))});rollback;`);
   assert.notEqual(sourceDenied.status,0);assert.match(sourceDenied.stderr,/DERIVED_REQUEUE_FINANCIAL_SOURCE_CHANGED/);assert.equal(JSON.parse(sourceDenied.stdout.trim()).code,'ACCEPTED');
   const generationDenied=sqlResult(fixture.cluster,database,`begin;set local session_replication_role=replica;update scoring_authority.calcutta_v1_recalculation_jobs set runtime_generation_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' where job_id='${old.job_id}';set local session_replication_role=origin;select public.requeue_score_derived_delivery_v1(${jsonLiteral(runtimeScope(requeue))});rollback;`);
   assert.notEqual(generationDenied.status,0);assert.match(generationDenied.stderr,/DERIVED_REQUEUE_GENERATION_CHANGED/);
   sql(fixture.cluster,database,"update production_control.cutover_activation_state set activation_revision=140 where scope_key='BAGGER_INV_PRODUCTION'",{role:''});
   const receipt=call(fixture.cluster,database,'requeue_score_derived_delivery_v1',{...requeue,expected_activation_revision:140});assert.equal(receipt.cycle,old.delivery_cycle+1);
   const worker=await startLocalScoreDerivedWorker({...fixture,database});children.push(worker);
   await worker.waitFor(e=>e.type==='processed'&&e.family==='CALCUTTA'&&!e.empty);await waitDelivered(worker,0);const parity=await assertLocalDerivedCurrent(fixture.cluster,database);await worker.stop();
   assert.equal(sql(fixture.cluster,database,`select status from scoring_authority.calcutta_v1_recalculation_jobs where job_id='${old.job_id}'`),'SUPERSEDED');
   assert.equal(sql(fixture.cluster,database,"select j.activation_revision from scoring_authority.calcutta_v1_result_revisions r join scoring_authority.calcutta_v1_recalculation_jobs j using(job_id) where r.is_current"),'140');
   const afterEvents=JSON.parse(sql(fixture.cluster,database,`select jsonb_agg(to_jsonb(e) order by event_id) from production_control.score_derived_delivery_attempts_v1 e where event_id in(${priorEvents.map(v=>v.event_id).join(',')})`));assert.deepEqual(afterEvents,priorEvents);
   outcomes.push({case:'terminal-compatible-activation-requeue',pass:true,priorAttemptsPreserved:priorEvents.length,originActivation:139,handlingActivation:140,sourceChangeDenied:true,staleGenerationDenied:true,negativeGenerationProbeBypassedFixtureFk:true,leasesTransferred:0,parity,events:worker.events});
  });
  await t.test('compatible activation replacement is atomic and rejects late old completion',()=>{
   const database=clone('activation_late');commitScore(fixture,database);
   const tickInput={contract_version:'score-derived-delivery-v1',worker_id:'phase2c-activation-late',operation_id:randomUUID()};
   call(fixture.cluster,database,'score_derived_delivery_tick_v1',tickInput);
   const c=JSON.parse(sql(fixture.cluster,database,"select to_jsonb(c) from scoring_authority.calcutta_v1_current c"));
   const base={contract_version:'production-calcutta-v1',worker_id:'phase2c-old-worker',lease_seconds:60,
    expected_configuration_revision:c.configuration_revision,expected_configuration_fingerprint:c.configuration_fingerprint,
    expected_auction_revision:c.auction_revision,expected_auction_fingerprint:c.auction_fingerprint};
   const claim=call(fixture.cluster,database,'claim_production_calcutta_v1_recalculation',{...base,request_fingerprint:'a'.repeat(64)});assert.ok(claim.job.claim_token);
   const calculated=calculateProductionFullNetCalcutta({tournament:claim.calculation_input.tournament,
    configuration:{...claim.calculation_input.configuration,configuration_fingerprint:claim.job.configuration_fingerprint}},claim.calculation_input.core_view);
   const complete={...base,job_id:claim.job.job_id,claim_token:claim.job.claim_token,
    expected_result_revision:claim.job.expected_result_revision,configuration_fingerprint:claim.job.configuration_fingerprint,
    auction_fingerprint:claim.job.auction_fingerprint,expected_source_fingerprint:claim.job.source_fingerprint,
    engine_version:FULL_NET_CALCUTTA_ENGINE,result_state:calculated.resultState,result_payload:calculated.calcutta,request_fingerprint:'e'.repeat(64)};
   const validBefore=JSON.parse(sql(fixture.cluster,database,`begin;select public.complete_production_calcutta_v1_recalculation(${jsonLiteral(runtimeScope(complete))});rollback;`));assert.equal(validBefore.ok,true);
   sql(fixture.cluster,database,"update scoring_authority.calcutta_v1_recalculation_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where status='RUNNING';update production_control.cutover_activation_state set activation_revision=140",{role:''});
   sql(fixture.cluster,database,`alter function production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text) rename to fixture_enqueue_before_crash;
    create function production_control.enqueue_score_calcutta_v1(a text,b text,c boolean default false,d text default null,e text default null)
    returns jsonb language plpgsql security definer set search_path=pg_catalog as $inject$
    begin perform production_control.fixture_enqueue_before_crash(a,b,c,d,e);raise exception using errcode='42883',message='FIXTURE_CRASH_BEFORE_REPLACEMENT_ACK';end $inject$;
    revoke all on function production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text) from public,anon,authenticated,service_role;`,{role:''});
   const failed=sqlResult(fixture.cluster,database,`select public.score_derived_delivery_tick_v1(${jsonLiteral(runtimeScope({...tickInput,materialization_family:'CALCUTTA'}))})`);assert.notEqual(failed.status,0);assert.match(failed.stderr,/FIXTURE_CRASH_BEFORE_REPLACEMENT_ACK/);
   assert.equal(sql(fixture.cluster,database,`select status from scoring_authority.calcutta_v1_recalculation_jobs where job_id='${claim.job.job_id}'`),'RUNNING');
   sql(fixture.cluster,database,'drop function production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text);alter function production_control.fixture_enqueue_before_crash(text,text,boolean,text,text) rename to enqueue_score_calcutta_v1;',{role:''});
   call(fixture.cluster,database,'score_derived_delivery_tick_v1',tickInput);
   const late=sqlResult(fixture.cluster,database,`select public.complete_production_calcutta_v1_recalculation(${jsonLiteral(runtimeScope({...complete,expected_activation_revision:140}))})`);
   assert.notEqual(late.status,0);assert.match(late.stderr,/CLAIM|LEASE|JOB/);
   assert.equal(sql(fixture.cluster,database,`select status from scoring_authority.calcutta_v1_recalculation_jobs where job_id='${claim.job.job_id}'`),'SUPERSEDED');
   const provenance=JSON.parse(sql(fixture.cluster,database,"select jsonb_build_object('origin',originating_activation_revision,'handler',handling_activation_revision,'linked',related_work_identity is not null) from production_control.score_derived_delivery_attempts_v1 where safe_code='COMPATIBLE_ACTIVATION_REPLACEMENT'"));
   assert.deepEqual(provenance,{origin:139,handler:140,linked:true});
   outcomes.push({case:'activation-atomic-late-completion',pass:true,crashRollbackRetainedOldLease:true,identicalCompletionValidBefore:true,lateCompletionDenied:true,provenance});
  });
  await t.test('compatible activation replaces old pending identity without transferring a lease',()=>{
   const database=clone('activation');commitScore(fixture,database);
   const input={contract_version:'score-derived-delivery-v1',worker_id:'phase2c-activation',operation_id:randomUUID()};
   call(fixture.cluster,database,'score_derived_delivery_tick_v1',input);
   const old=jobState(fixture.cluster,database).calcutta;assert.ok(old?.job_id);assert.equal(old.activation_revision,139);
   sql(fixture.cluster,database,"update production_control.cutover_activation_state set activation_revision=140 where scope_key='BAGGER_INV_PRODUCTION'",{role:''});
   call(fixture.cluster,database,'score_derived_delivery_tick_v1',{...input,operation_id:randomUUID()});
   const current=jobState(fixture.cluster,database).calcutta;assert.notEqual(current.job_id,old.job_id);assert.equal(current.activation_revision,140);
   assert.equal(sql(fixture.cluster,database,`select status from scoring_authority.calcutta_v1_recalculation_jobs where job_id='${old.job_id}'`),'SUPERSEDED');
   call(fixture.cluster,database,'score_derived_delivery_tick_v1',{...input,operation_id:randomUUID()});
   assert.equal(jobState(fixture.cluster,database).calcutta.job_id,current.job_id);
   outcomes.push({case:'compatible-activation-replacement',pass:true,oldJobRetained:true,leasesTransferred:0,replacementCount:1});
  });
 } finally {
  for(const child of children)await child.stop();
  if(fixture)await destroyIsolatedCluster(fixture.cluster);
  const output={installed:fixture?.phase2c,environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',productionQueries:0,networkDenied:true,
   fixtureSetupTimeoutMs:30000,scoreTimeoutMs:1000,workerTimeoutMs:5000,fsync:false,outcomes,
   limitations:['Synthetic initial approved financial rules and runtime boundaries','Hosted scheduler installation is not proven','Net Skins processing remains owner-controlled','Crash recovery uses explicit lease clock injection']};
  if(process.env.BAGGER_PHASE2C_WORKER_EVIDENCE){const file=path.resolve(process.env.BAGGER_PHASE2C_WORKER_EVIDENCE);
   assert.ok(file.startsWith(path.join(repositoryRoot,'docs/reliability/phase2c/evidence')+path.sep)||file.startsWith('/private/tmp/bagger-phase2-notes/'));
   await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(output,null,2)+'\n');}
 }
});

test('deterministic global tick failure stops visibly and classifies only known transient errors',async()=>{
 const events=[];const processors=Object.fromEntries(['CALCUTTA','COMPETITION','INTELLIGENCE'].map(k=>[k,async()=>({ok:true})]));
 const result=await runScoreDerivedWorker({tick:async()=>{throw Object.assign(new Error('missing'),{sqlstate:'42883'});},processors,emit:e=>events.push(e),intervalMs:10});
 assert.equal(result.halted,true);assert.equal(result.attempts,1);assert.equal(events.filter(e=>e.type==='tick-failed').length,1);
 for(const sqlstate of ['40001','40P01','57014','08006','55P03'])assert.equal(classifyDerivedFailure({sqlstate}).classification,'RETRYABLE');
 for(const sqlstate of ['42883','42501','22023','55000'])assert.equal(classifyDerivedFailure({sqlstate,status:503}).classification,'TERMINAL');
 for(const code of ['ECONNRESET','UND_ERR_SOCKET','EPIPE']){
  const failure=classifyDerivedFailure(new TypeError('fetch failed',{cause:{code}}));
  assert.equal(failure.classification,'RETRYABLE');assert.equal(failure.code,'CONNECTION_FAILED');assert.equal(failure.sqlstate,null);
 }
 for(const status of [408,429,502,503,504])assert.equal(classifyDerivedFailure({code:'PRODUCTION_SCORING_RPC_FAILED',status,diagnostics:{status,code:''}}).code,'CONNECTION_FAILED');
 assert.equal(classifyDerivedFailure(new TypeError('programming defect')).classification,'TERMINAL');
});


test('optional synchronous and asynchronous exporter failures preserve worker execution and retry',async()=>{
 const execute=async emit=>{
  const calls=[];let attempt=0;
  const result=await runScoreDerivedWorker({maximumCycles:2,intervalMs:10,workerId:'exporter-proof',emit,
   tick:async()=>{calls.push('tick');return {ok:true,ready:{CALCUTTA:true,COMPETITION:true,INTELLIGENCE:false}};},
   processors:{CALCUTTA:async()=>{calls.push('CALCUTTA');if(++attempt===1)throw Object.assign(new Error('synthetic retry'),{code:'CONNECTION_FAILED'});return {ok:true};},
    COMPETITION:async()=>{calls.push('COMPETITION');return {ok:true};},INTELLIGENCE:async()=>{throw new Error('not ready');}}});
  await new Promise(resolve=>setImmediate(resolve));
  return {result,calls};
 };
 const expected=await execute(()=>{});
 assert.equal(expected.result.ok,true);assert.equal(expected.result.cycles,2);
 assert.equal(expected.calls.filter(v=>v==='tick').length,2);assert.equal(expected.calls.filter(v=>v==='CALCUTTA').length,2);
 assert.deepEqual(await execute(()=>{throw new Error('SYNTHETIC_SYNC_EXPORTER_FAILED');}),expected);
 assert.deepEqual(await execute(async()=>{throw new Error('SYNTHETIC_ASYNC_EXPORTER_FAILED');}),expected);
});
