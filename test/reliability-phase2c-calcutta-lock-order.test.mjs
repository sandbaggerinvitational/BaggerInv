// Actual RPC lock schedules; no canonical trigger or timeout is weakened.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,writeFile} from 'node:fs/promises';
import {createPhase2CFixture} from './support/reliability/phase2c-fixture.mjs';
import {sql,sqlResult,jsonLiteral,openSqlSession,destroyIsolatedCluster,createDatabase} from './support/reliability/postgres17.mjs';
import {configureFiniteTimeout} from './support/reliability/phase2c-install.mjs';
import {seedSyntheticSideGameHistory} from './support/reliability/synthetic-history.mjs';
import {prepareLocalScoreDerivedWorkerFixture} from './support/reliability/phase2c-worker.mjs';
import {inputFor,rpcSql} from './support/reliability/phase2-score-fixture.mjs';
import {runtimeScope} from './support/reliability/synthetic-tournament.mjs';
import {calculateProductionFullNetCalcutta,FULL_NET_CALCUTTA_ENGINE} from '../lib/production-full-net.js';
const before=JSON.parse(await readFile(new URL('../docs/reliability/phase2c/evidence/calcutta-current-job-before-definitions.json',import.meta.url),'utf8'));
const evidence={issue:'P2C-NEW-CALCUTTA-CURRENT-JOB-LOCK',proof:'ACTUAL_RPC_RECIPROCAL_LOCK_GRAPH',production:false,tests:[]};
const beforeDefinition=name=>before.find(v=>v.signature===name+'(jsonb)').definition;
const queryJson=(c,d,q)=>JSON.parse(sql(c,d,q));
const result=p=>p.then(value=>({ok:true,value:JSON.parse(value)}),error=>({ok:false,error:error.message}));
async function graph(c,d,pids,predicate){for(let i=0;i<50;i++){const g=queryJson(c,d,`select jsonb_agg(jsonb_build_object('pid',pid,'blockedBy',pg_blocking_pids(pid),'wait',wait_event,'query',left(query,100))) from pg_stat_activity where pid in(${pids.join(',')})`);if(predicate(g))return g;await new Promise(r=>setTimeout(r,10));}throw new Error('Expected current/job graph not observed');}
async function close(sessions,pending){if(sessions[0])await Promise.resolve().then(()=>sessions[0].query('rollback')).catch(()=>{});await Promise.allSettled(pending);await Promise.allSettled(sessions.map(async s=>s.query('rollback')));await Promise.allSettled(sessions.map(async s=>s.close()));}
const call=(c,d,name,input)=>queryJson(c,d,rpcSql(name,runtimeScope(input)));
function base(c,d){const v=queryJson(c,d,"select to_jsonb(c) from scoring_authority.calcutta_v1_current c where tournament_id='2026'");return {contract_version:'production-calcutta-v1',worker_id:'calcutta-lock-proof',lease_seconds:60,expected_configuration_revision:v.configuration_revision,expected_configuration_fingerprint:v.configuration_fingerprint,expected_auction_revision:v.auction_revision,expected_auction_fingerprint:v.auction_fingerprint};}
function completedInput(claim,b){const calc=calculateProductionFullNetCalcutta({tournament:claim.calculation_input.tournament,configuration:{...claim.calculation_input.configuration,configuration_fingerprint:claim.job.configuration_fingerprint}},claim.calculation_input.core_view);return {...b,job_id:claim.job.job_id,claim_token:claim.job.claim_token,expected_result_revision:claim.job.expected_result_revision,configuration_fingerprint:claim.job.configuration_fingerprint,auction_fingerprint:claim.job.auction_fingerprint,expected_source_fingerprint:claim.job.source_fingerprint,engine_version:FULL_NET_CALCUTTA_ENGINE,result_state:calc.resultState,result_payload:calc.calcutta,request_fingerprint:'b'.repeat(64)};}
test('Calcutta current-before-job preserves Finalize and exact worker authority',{timeout:90000},async t=>{
 let f;
 try{
  f=await createPhase2CFixture();const c=f.cluster; evidence.installed=f.phase2c;
  sql(c,f.database,`alter database ${f.database} set statement_timeout='30000ms'`,{role:''});seedSyntheticSideGameHistory(c,f.database,1);prepareLocalScoreDerivedWorkerFixture(c,f.database);
  // Real canonical mutations prepare a complete scorecard. Synthetic configuration
  // and runtime boundaries are inherited explicitly from the isolated fixture.
  for(let hole=1;hole<=18;hole++)assert.equal(call(c,f.database,'submit_production_hole_score',inputFor(c,f.database,'2026-R1-1',hole,{key:'cal-lock:'+hole})).code,'ACCEPTED');
  sql(c,f.database,"set statement_timeout='5s';select production_control.flush_score_derived_intents_v1('2026','CALCUTTA',8);select production_control.flush_score_derived_intents_v1('2026','CALCUTTA',8);select production_control.flush_score_derived_intents_v1('2026','CALCUTTA',8)");
  for(const operation of ['claim','complete','fail'])for(const order of ['before','after'])await t.test(`${operation} ${order}: actual Finalize lock graph`,async()=>{
   const d=`cal_lock_${operation}_${order}`;createDatabase(c,d,{template:f.database});configureFiniteTimeout(c,d,1000);
   const name=`${operation}_production_calcutta_v1_recalculation`,b=base(c,d),sessions=[],pending=[];
   let workerInput={...b,request_fingerprint:'a'.repeat(64)},stage='setup';
   if(operation!=='claim'){const claim=call(c,d,'claim_production_calcutta_v1_recalculation',workerInput);assert.ok(claim.job?.claim_token);workerInput=operation==='complete'?completedInput(claim,b):{...b,job_id:claim.job.job_id,claim_token:claim.job.claim_token,error_code:'CONNECTION_FAILED',error_safe:'Synthetic bounded retry',request_fingerprint:'b'.repeat(64)};}
   let definition=order==='before'?beforeDefinition(name):sql(c,d,`select pg_get_functiondef('public.${name}(jsonb)'::regprocedure)`,{role:''});
   const current="where value.tournament_id = '2026'\n  for update;";
   if(order==='after')assert.ok(definition.includes(current),'shipping worker locks current before job');
   const anchor=operation==='fail'?"  update scoring_authority.calcutta_v1_recalculation_jobs\n  set status = 'FAILED'":"  current_source := production_control.calcutta_v1_source_revision('2026');";
   assert.equal(definition.split(anchor).length,2);definition=definition.replace(anchor,'  perform pg_catalog.pg_advisory_xact_lock(284124101);\n'+anchor);sql(c,d,definition,{role:''});
   try{
    const barrier=openSqlSession(c,d),worker=openSqlSession(c,d),owner=openSqlSession(c,d);sessions.push(barrier,worker,owner);const pids=[];for(const s of sessions)pids.push(Number(await s.query('select pg_backend_pid()')));
    await barrier.query('begin;select pg_advisory_xact_lock(284124101)');await worker.query("set statement_timeout='5s';set deadlock_timeout='5s'");await owner.query("set statement_timeout='1s';set deadlock_timeout='5s'");
    const work=result(worker.query(rpcSql(name,runtimeScope(workerInput))));pending.push(work);stage='worker-after-job';await graph(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[0])));
    // Claim's stale replacement branch is triggered by a real committed correction
    // after its existing flush and job selection, not by changing financial rows.
    if(operation==='claim'){const correction=inputFor(c,d,'2026-R1-1',18,{key:'lock-correction'});correction.team_1_gross_scores=correction.team_1_gross_scores.map(v=>v+1);assert.equal(call(c,d,'submit_production_hole_score',correction).code,'ACCEPTED');}
    const control=result(owner.query(rpcSql('finalize_production_match',inputFor(c,d,'2026-R1-1',18,{key:'lock-final'}))));pending.push(control);stage='finalize-waits';const oneWay=await graph(c,d,pids,g=>g.some(v=>v.pid===pids[2]&&v.blockedBy.includes(pids[1])));await barrier.query('commit');
    if(order==='before'){stage='reciprocal';const reciprocal=await graph(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[2]))&&g.some(v=>v.pid===pids[2]&&v.blockedBy.includes(pids[1])));const final=await control;assert.equal(final.ok,false);assert.match(final.error,/statement timeout/);const w=await work;assert.equal(w.ok,true);assert.equal(w.value.ok,true);evidence.tests.push({operation,order,expectedCounterexample:true,oneWay,reciprocal,finalize:final,workerSucceededAfterRollback:true});}
    else{const [w,final]=await Promise.all([work,control]);assert.equal(w.ok,true,JSON.stringify(w));assert.equal(w.value.ok,true);assert.equal(final.ok,true,JSON.stringify(final));assert.equal(final.value.code,'FINALIZED');evidence.tests.push({operation,order,oneWay,worker:true,finalize:true,scoreTimeoutMs:1000,workerTimeoutMs:5000});}
   }catch(error){evidence.tests.push({operation,order,stage,pass:false,error:error.message});throw error;}finally{await close(sessions,pending);}
  });
  await t.test('all six installed worker bodies retain attributes and bind the ordered locks in the manifest',()=>{
   const rows=queryJson(c,f.database,`select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'hash',encode(extensions.digest(p.prosrc,'sha256'),'hex'),'source',p.prosrc,'definer',p.prosecdef,'acl',p.proacl,'configuration',p.proconfig)) from pg_proc p where p.oid in(
    'public.claim_production_calcutta_v1_recalculation(jsonb)'::regprocedure,'public.complete_production_calcutta_v1_recalculation(jsonb)'::regprocedure,'public.fail_production_calcutta_v1_recalculation(jsonb)'::regprocedure,
    'public.future_production_claim_calcutta_recalculation_v1(jsonb)'::regprocedure,'public.future_production_complete_calcutta_recalculation_v1(jsonb)'::regprocedure,'public.future_production_fail_calcutta_recalculation_v1(jsonb)'::regprocedure)`);
   assert.equal(rows.length,6);for(const row of rows){assert.match(row.source,/calcutta_v1_current value\n  where value.tournament_id = (?:'2026'|target)\n  for update;/);assert.equal(row.definer,true);if(row.signature.includes('claim_'))assert.ok(row.source.indexOf('perform production_control.flush_score_derived_intents_v1')<row.source.indexOf('into strict current_value'));}
   const manifest=queryJson(c,f.database,'select production_control.annual_side_game_implementation_manifest_v1()');assert.equal(manifest.scoreDerivedCalcuttaWorkerLocks.length,6);
   for(const row of rows)assert.equal(manifest.scoreDerivedCalcuttaWorkerLocks.find(v=>v.signature==='public.'+row.signature)?.source,row.source);
   evidence.workerSources=rows.map(({source,...row})=>row);
  });
  await t.test('claim does not wait on an intent held by another bounded materializer',async()=>{
   const d='cal_lock_intent';createDatabase(c,d,{template:f.database});configureFiniteTimeout(c,d,1000);const correction=inputFor(c,d,'2026-R1-1',18,{key:'held-intent-correction'});correction.team_1_gross_scores=correction.team_1_gross_scores.map(v=>v+1);assert.equal(call(c,d,'submit_production_hole_score',correction).code,'ACCEPTED');
   sql(c,d,`alter function production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text) rename to lock_graph_enqueue;
    create function production_control.enqueue_score_calcutta_v1(a text,b text,c boolean default false,d text default null,e text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog as $q$ begin if current_setting('application_name')='held-intent-materializer' then perform pg_advisory_xact_lock(284124102);end if;return production_control.lock_graph_enqueue(a,b,c,d,e);end $q$;
    revoke all on function production_control.enqueue_score_calcutta_v1(text,text,boolean,text,text) from public,anon,authenticated,service_role;`,{role:''});
   const sessions=[],pending=[];try{
    const barrier=openSqlSession(c,d),materializer=openSqlSession(c,d),worker=openSqlSession(c,d);sessions.push(barrier,materializer,worker);const pids=[];for(const v of sessions)pids.push(Number(await v.query('select pg_backend_pid()')));
    await barrier.query('begin;select pg_advisory_xact_lock(284124102)');await materializer.query("set statement_timeout='5s';set application_name='held-intent-materializer'");await worker.query("set statement_timeout='5s'");
    const materialized=result(materializer.query("select production_control.flush_score_derived_intents_v1('2026','CALCUTTA',8)"));pending.push(materialized);const held=await graph(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[0])));
    const claimed=await result(worker.query(rpcSql('claim_production_calcutta_v1_recalculation',runtimeScope({...base(c,d),request_fingerprint:'c'.repeat(64)}))));assert.equal(claimed.ok,true);assert.ok(claimed.value.job?.claim_token);await barrier.query('commit');const processed=await materialized;assert.equal(processed.ok,true);assert.equal(processed.value.processed,1);
    assert.equal(sql(c,d,"select count(*) from scoring_authority.score_derived_intents_v1 where family='CALCUTTA' and status<>'SUCCEEDED'"),'0');evidence.tests.push({case:'held-intent-claim',pass:true,held,claimCommittedBeforeMaterializerReleased:true,currentSourceReplacement:true});
   }finally{await close(sessions,pending);}
  });
  await t.test('post-Finalize old completion and failure retain42501 without touching replacement work',()=>{
   const d='cal_lock_stale';createDatabase(c,d,{template:f.database});configureFiniteTimeout(c,d,1000);const b=base(c,d),claim=call(c,d,'claim_production_calcutta_v1_recalculation',{...b,request_fingerprint:'a'.repeat(64)}),complete=completedInput(claim,b);assert.ok(claim.job?.claim_token);
   assert.equal(call(c,d,'finalize_production_match',inputFor(c,d,'2026-R1-1',18,{key:'stale-final'})).code,'FINALIZED');
   assert.equal(sql(c,d,`select status from scoring_authority.calcutta_v1_recalculation_jobs where job_id='${claim.job.job_id}'`),'SUPERSEDED');
   const state=()=>queryJson(c,d,`select jsonb_build_object('current',(select to_jsonb(v) from scoring_authority.calcutta_v1_current v where tournament_id='2026'),'jobs',(select jsonb_agg(to_jsonb(v) order by job_id) from scoring_authority.calcutta_v1_recalculation_jobs v),'results',(select jsonb_agg(to_jsonb(v) order by result_id) from scoring_authority.calcutta_v1_result_revisions v),'attempts',(select jsonb_agg(to_jsonb(v) order by event_id) from production_control.score_derived_delivery_attempts_v1 v))`),prior=state();
   for(const [name,input] of [['complete',complete],['fail',{...b,job_id:claim.job.job_id,claim_token:claim.job.claim_token,error_code:'CONNECTION_FAILED',request_fingerprint:'d'.repeat(64)}]]){const failed=sqlResult(c,d,`\\set VERBOSITY verbose\n`+rpcSql(name+'_production_calcutta_v1_recalculation',runtimeScope(input)));assert.notEqual(failed.status,0);assert.match(failed.stderr,/42501.*PRODUCTION_CALCUTTA_JOB_LEASE_REQUIRED/);assert.deepEqual(state(),prior);}
   evidence.tests.push({case:'stale-lease-after-finalize',pass:true,denial:'42501 PRODUCTION_CALCUTTA_JOB_LEASE_REQUIRED',replacementAndResultAndAuditUnchanged:true});
  });
 }finally{if(f)await destroyIsolatedCluster(f.cluster);await writeFile(new URL('../docs/reliability/phase2c/evidence/calcutta-current-job-lock-after.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');}
});
