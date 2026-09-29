// PERFORMANCE / ACTUAL_SQL. Diagnostic warm rollback samples, not production percentiles.
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createPhase2CFixture} from './support/reliability/phase2c-fixture.mjs';
import {configureFiniteTimeout} from './support/reliability/phase2c-install.mjs';
import {createDatabase,sql,jsonLiteral,timedSqlSamples,destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {seedSyntheticSideGameHistory,actualCounts} from './support/reliability/synthetic-history.mjs';
import {compatibilityVariants,seedCompatibilityVariant} from './support/reliability/phase2-eligible-history.mjs';
import {prepareLocalScoreDerivedWorkerFixture} from './support/reliability/phase2c-worker.mjs';
import {inputFor} from './support/reliability/phase2-score-fixture.mjs';
import {runtimeScope,syntheticDirector} from './support/reliability/synthetic-tournament.mjs';
import {createScoreDerivedDeliveryAdapter} from '../lib/score-derived-delivery.js';
import {capturePhase2Plan} from '../tools/reliability/phase2-plan-capture.mjs';
const deliveryIndexManifest=JSON.parse(await readFile(new URL('./support/reliability/phase2c-delivery-indexes.json',import.meta.url),'utf8'));


test('NA-P2C-B eight-intent materialization and current claim remain finite across irrelevant history', {timeout:300000}, async t=>{
 let fixture;const rows=[];let waitingOwnerConstraint;
 try {
  fixture=await createPhase2CFixture();
  waitingOwnerConstraint=sql(fixture.cluster,fixture.database,"select pg_get_indexdef(indexrelid) from pg_index where indexrelid='scoring_authority.production_net_skins_v1_one_active_job_per_round'::regclass and indisvalid and indisunique");
  assert.match(waitingOwnerConstraint,/UNIQUE/);assert.match(waitingOwnerConstraint,/tournament_id, round_number/);assert.match(waitingOwnerConstraint,/PENDING/);assert.match(waitingOwnerConstraint,/RUNNING/);
  for(const scale of [1,2,5,10]){
   const base=`delivery_history_${scale}`;createDatabase(fixture.cluster,base,{template:fixture.database});
   sql(fixture.cluster,base,`alter database ${base} set statement_timeout='180000ms'`,{role:''});
   seedSyntheticSideGameHistory(fixture.cluster,base,scale);prepareLocalScoreDerivedWorkerFixture(fixture.cluster,base);
   sql(fixture.cluster,base,'analyze',{role:''});
   configureFiniteTimeout(fixture.cluster,base,1000);const counts=actualCounts(fixture.cluster,base);
   for(const [index,variant] of compatibilityVariants.entries())await t.test(`${scale}x ${variant.name}`,async()=>{
    const evidence={scale,variant:variant.name,pass:false,counts};rows.push(evidence);
    const database=`delivery_history_${scale}_${index}`;createDatabase(fixture.cluster,database,{template:base});configureFiniteTimeout(fixture.cluster,database,1000);
    for(let hole=1;hole<=8;hole++){
     const input=inputFor(fixture.cluster,database,'2026-R3-12',hole,{key:`history-${randomUUID()}`});
     const accepted=JSON.parse(sql(fixture.cluster,database,`select public.submit_production_hole_score(${jsonLiteral(runtimeScope(input))})`));
     assert.equal(accepted.ok,true);assert.equal(accepted.code,'ACCEPTED');
    }
    seedCompatibilityVariant(fixture.cluster,database,variant.name);
    assert.equal(sql(fixture.cluster,database,"select count(*) from scoring_authority.score_derived_intents_v1 where family='CALCUTTA' and status='PENDING'"),'8');
    const tickInput=runtimeScope({contract_version:'score-derived-delivery-v1',worker_id:'history-worker',operation_id:randomUUID(),materialization_family:'CALCUTTA'});
    const tickSql=`select public.score_derived_delivery_tick_v1(${jsonLiteral(tickInput)})`;
    const validateTick=output=>{const result=JSON.parse(output);assert.equal(result.ok,true);assert.equal(result.statusIncomplete,false);assert.equal(result.materialized,8);assert.equal(result.ready.CALCUTTA,true);};
    const durations=timedSqlSamples(fixture.cluster,database,tickSql,3,{setup:"set local statement_timeout='5000ms';",validateResult:validateTick});
    const competitionSql=`select public.score_derived_delivery_tick_v1(${jsonLiteral({...tickInput,materialization_family:'COMPETITION',operation_id:randomUUID()})})`;
    const validateCompetition=output=>{const result=JSON.parse(output);assert.equal(result.ok,true);assert.equal(result.statusIncomplete,false);assert.equal(result.materialized,8);assert.equal(result.ready.COMPETITION,true);};
    const competitionTickMs=timedSqlSamples(fixture.cluster,database,competitionSql,3,{setup:"set local statement_timeout='5000ms';",validateResult:validateCompetition});
    const plans=(scale===1||scale===10)?{
     tick:capturePhase2Plan(fixture.cluster,database,{id:'delivery-calcutta-tick',sql:tickSql,setupSql:"set local statement_timeout='5000ms';",validateResult:validateTick}),
     competitionTick:capturePhase2Plan(fixture.cluster,database,{id:'delivery-competition-tick',sql:competitionSql,setupSql:"set local statement_timeout='5000ms';",validateResult:validateCompetition}),
    }:null;
    const calls=[];
    const adapter=createScoreDerivedDeliveryAdapter({resolveContext:async()=>({runtime:{tournamentId:'2026'}}),rpc:async(name,input)=>{
     assert.equal(name,'score_derived_delivery_tick_v1');calls.push({family:input.materialization_family,operationId:input.operation_id,cycleId:input.cycle_operation_id});
     return JSON.parse(sql(fixture.cluster,database,`set statement_timeout='5000ms';select public.${name}(${jsonLiteral(runtimeScope(input))})`));
    }});
    const actual=await adapter.tick({workerId:'history-adapter',operationId:randomUUID()});assert.equal(actual.ok,true);assert.equal(actual.materialized,16);assert.equal(actual.statusIncomplete,false);
    assert.deepEqual(calls.map(v=>v.family),['CALCUTTA','NET_SKINS','COMPETITION']);assert.equal(new Set(calls.map(v=>v.operationId)).size,3);assert.equal(new Set(calls.map(v=>v.cycleId)).size,1);
    assert.equal(sql(fixture.cluster,database,"select count(*) from scoring_authority.score_derived_intents_v1 where status<>'SUCCEEDED'"),'0');
    const current=JSON.parse(sql(fixture.cluster,database,"select to_jsonb(c) from scoring_authority.calcutta_v1_current c where tournament_id='2026'"));
    const claimInput=runtimeScope({contract_version:'production-calcutta-v1',worker_id:'history-worker',lease_seconds:60,
     player_id:syntheticDirector.playerId,authorization:{tournament_id:'2026',player_id:syntheticDirector.playerId,auth_user_id:syntheticDirector.authUserId,role:'DIRECTOR'},
     expected_configuration_revision:current.configuration_revision,expected_configuration_fingerprint:current.configuration_fingerprint,
     expected_auction_revision:current.auction_revision,expected_auction_fingerprint:current.auction_fingerprint,request_fingerprint:'b'.repeat(64)});
    const claimSql=`select public.claim_production_calcutta_v1_recalculation(${jsonLiteral(claimInput)})`;
    const validateClaim=output=>{const result=JSON.parse(output);assert.equal(result.ok,true);assert.ok(result.job?.job_id&&result.job.claim_token&&result.calculation_input);};
    // The actual adapter already committed materialization in separate transactions.
    const setup="set local statement_timeout='5000ms';";
    const claimDurations=timedSqlSamples(fixture.cluster,database,claimSql,3,{setup,validateResult:validateClaim});
    if(plans)plans.claim=capturePhase2Plan(fixture.cluster,database,{id:'delivery-claim',sql:claimSql,setupSql:setup,validateResult:validateClaim});
    if(plans&&index===0){
     const indexNames=deliveryIndexManifest.retainedNonuniqueIndexes;
     const without=setup+indexNames.map(name=>`drop index ${name};`).join('');
     const currentWork=actual.work.find(v=>v.family==='CALCUTTA');assert.ok(currentWork);
     const failInput=runtimeScope({contract_version:'score-derived-delivery-v1',worker_id:'history-index',family:'CALCUTTA',work:[currentWork],error_code:'42883'});
     const failSetup=`do $failure$ begin perform public.fail_score_derived_preclaim_v1(${jsonLiteral(failInput)});end $failure$;`;
     const requeueInput=runtimeScope({contract_version:'score-derived-delivery-v1',authorization:{tournament_id:'2026',player_id:syntheticDirector.playerId,auth_user_id:syntheticDirector.authUserId,role:'DIRECTOR'},family:'CALCUTTA',work_identity:currentWork.key,expected_cycle:currentWork.cycle,expected_attempt:1,request_id:randomUUID(),reason:'Isolated index plan cause correction'});
     const requeueSql=`select public.requeue_score_derived_delivery_v1(${jsonLiteral(requeueInput)})`;
     const validateRequeue=output=>{const result=JSON.parse(output);assert.equal(result.ok,true);assert.equal(result.idempotent,false);assert.equal(result.cycle,currentWork.cycle+1);};
     const validateIdleTick=output=>{const result=JSON.parse(output);assert.equal(result.ok,true);assert.equal(result.materialized,0);assert.equal(result.statusIncomplete,false);};
     plans.candidateIndexCounterfactual={schema:'candidate columns retained; candidate nonunique indexes dropped only inside rollback transaction',indexNames,
      readinessWith:capturePhase2Plan(fixture.cluster,database,{id:'readiness-indexes-present',sql:competitionSql,setupSql:setup,validateResult:validateIdleTick}),
      readinessWithout:capturePhase2Plan(fixture.cluster,database,{id:'readiness-indexes-absent',sql:competitionSql,setupSql:without,validateResult:validateIdleTick}),
      claimWith:plans.claim,
      claimWithout:capturePhase2Plan(fixture.cluster,database,{id:'claim-indexes-absent',sql:claimSql,setupSql:without,validateResult:validateClaim}),
      requeueWith:capturePhase2Plan(fixture.cluster,database,{id:'requeue-indexes-present',sql:requeueSql,setupSql:setup+failSetup,validateResult:validateRequeue}),
      requeueWithout:capturePhase2Plan(fixture.cluster,database,{id:'requeue-indexes-absent',sql:requeueSql,setupSql:without+failSetup,validateResult:validateRequeue}),
      limitations:['Not the old schema: new delivery columns and correctness constraints remain','No index build cost or isolated write-amplification measurement','Attempt-work index has no scaled attempt-history fixture here; no necessity claim','Unique identity/requeue indexes retained for correctness']};
     sql(fixture.cluster,database,`set session_replication_role=replica;
      update scoring_authority.matches set status='FINAL',scorecard_complete=true,scoring_locked=true,finalized_at=clock_timestamp();
      update scoring_authority.odds_published_snapshots set published_payload=published_payload||jsonb_build_object('phase','Final Results') where milestone='Final Results' and is_current_for_milestone;
      set session_replication_role=origin;analyze scoring_authority.matches;analyze scoring_authority.odds_published_snapshots;`,{role:''});
     plans.finalReady=capturePhase2Plan(fixture.cluster,database,{id:'final-ready-current-publication',sql:competitionSql,setupSql:setup,validateResult:output=>{const result=JSON.parse(output);assert.equal(result.ok,true);assert.equal(result.materialized,0);assert.equal(result.ready.INTELLIGENCE,true);assert.equal(result.waitingPublication.FINAL_RECAP,0);}});
    }
    Object.assign(evidence,{pass:true,intentsPerFamily:8,materialized:16,fixtureSeedStatementTimeoutMs:180000,workerStatementTimeoutMs:5000,
     tickMs:durations,competitionTickMs,claimMs:claimDurations,actualAdapterFamilyTransactions:calls,plans});
   });
  }
 }finally{
  if(fixture)await destroyIsolatedCluster(fixture.cluster);
  if(process.env.BAGGER_PHASE2C_WORKER_HISTORY_EVIDENCE){
   assert.equal(process.env.BAGGER_PHASE2C_WORKER_HISTORY_EVIDENCE,fileURLToPath(new URL('../docs/reliability/phase2c/evidence/worker-history-detail.json',import.meta.url)));
   await writeFile(process.env.BAGGER_PHASE2C_WORKER_HISTORY_EVIDENCE,JSON.stringify({installed:fixture?.phase2c,waitingOwnerConstraint,waitingOwnerMaximumActiveRows:3,declaredBranches:32,passedBranches:rows.filter(v=>v.pass).length,rows,
    limitations:['Warm3 samples peroperation; no percentiles','Synthetic compatibility receipts; final-ready plans directly seed final/publication state without protected issuance','Owned socket only; noProduction orprovider calls','Plan instrumentation durations overlap and are not latency'],production:false},null,2)+'\n');
  }
 }
});
