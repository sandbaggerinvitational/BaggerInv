// ACTUAL_SQL / CONCURRENCY. Barriers expose real lock dependencies, not load timing.
import assert from 'node:assert/strict';
import test from 'node:test';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createPhase2CFixture} from './support/reliability/phase2c-fixture.mjs';
import {sql,jsonLiteral,openSqlSession,destroyIsolatedCluster,createDatabase} from './support/reliability/postgres17.mjs';
import {configureFiniteTimeout} from './support/reliability/phase2c-install.mjs';
import {seedSyntheticSideGameHistory} from './support/reliability/synthetic-history.mjs';
import {seedThreeRoundNetSkinsConfiguration} from './support/reliability/phase2c-annual-workers.mjs';
import {prepareLocalScoreDerivedWorkerFixture} from './support/reliability/phase2c-worker.mjs';
import {inputFor,rpcSql} from './support/reliability/phase2-score-fixture.mjs';
import {runtimeScope} from './support/reliability/synthetic-tournament.mjs';
import {calculateProductionFullNetSkins,FULL_NET_SKINS_ENGINE} from '../lib/production-full-net.js';
const evidence={proof:'ACTUAL_SQL_LOCK_GRAPH',production:false,tests:[]};
const observe=(c,d,pids)=>JSON.parse(sql(c,d,`select jsonb_agg(jsonb_build_object('pid',pid,'blockedBy',pg_blocking_pids(pid),'wait',wait_event)) from pg_stat_activity where pid in(${pids.join(',')})`,{role:''}));
async function waitGraph(c,d,pids,predicate){for(let i=0;i<40;i++){const graph=observe(c,d,pids);if(predicate(graph))return graph;await new Promise(r=>setTimeout(r,10));}throw new Error('Expected lock graph not observed');}
const result=p=>p.then(value=>({ok:true,value:JSON.parse(value)}),error=>({ok:false,error:error.message}));
async function cleanup(sessions,pending){if(sessions[0])await Promise.resolve().then(()=>sessions[0].query('rollback')).catch(()=>{});await Promise.allSettled(pending);await Promise.allSettled(sessions.map(async s=>s.query('rollback')));await Promise.allSettled(sessions.map(async s=>s.close()));}
const tickSql=family=>`select public.score_derived_delivery_tick_v1(${jsonLiteral(runtimeScope({contract_version:'score-derived-delivery-v1',worker_id:'lock-graph',operation_id:randomUUID(),materialization_family:family}))})`;
test('Phase2C delivery transaction boundaries preserve actual owner/control lock order',{timeout:60000},async t=>{
 let f;
 try{
  f=await createPhase2CFixture();const c=f.cluster;
  sql(c,f.database,`alter database ${f.database} set statement_timeout='30000ms'`,{role:''});seedSyntheticSideGameHistory(c,f.database,1);seedThreeRoundNetSkinsConfiguration(c,f.database);prepareLocalScoreDerivedWorkerFixture(c,f.database);
  evidence.installed=f.phase2c;
  const clone=name=>{const d='lock_'+name;createDatabase(c,d,{template:f.database});configureFiniteTimeout(c,d,1000);const score=inputFor(c,d,'2026-R1-1',1,{director:true,key:name});score.team_1_gross_scores=score.team_1_gross_scores.map(v=>v+1);assert.equal(JSON.parse(sql(c,d,rpcSql('submit_production_hole_score',score))).code,'ACCEPTED');return d;};
  for(const scenario of ['match-control','owner-net-completion'])await t.test(scenario+' has one-way waiting and commits inside its existing timeout',async()=>{
   const d=clone(scenario.replaceAll('-','_')),sessions=[],pending=[];let stage='setup';
   const family=scenario==='match-control'?'NET_SKINS':'COMPETITION';
   let ownerSql;
   if(scenario==='match-control')ownerSql=rpcSql('mutate_production_match_control',inputFor(c,d,'2026-R1-1',1,{director:true,operation:'SCORING_LOCK',key:'lockgraph-control'}));
   else{
    sql(c,d,"set statement_timeout='5s';select production_control.flush_score_derived_intents_v1('2026','NET_SKINS',8)");
    const configurationRevision=Number(sql(c,d,"select configuration_revision from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026'"));
    const claim=JSON.parse(sql(c,d,rpcSql('claim_production_net_skins_v1_recalculation',runtimeScope({worker_id:'owner-net-proof',lease_seconds:60,expected_configuration_revision:configurationRevision,request_fingerprint:'a'.repeat(64)}))));assert.equal(claim.ok,true);assert.ok(claim.job?.job_id);
    const calc=calculateProductionFullNetSkins(claim.calculation_input),job=claim.job,payload=calc.netSkins.rounds.find(v=>Number(v.round)===job.round_number);
    ownerSql=rpcSql('complete_production_net_skins_v1_recalculation',runtimeScope({worker_id:'owner-net-proof',expected_configuration_revision:configurationRevision,job_id:job.job_id,claim_token:job.claim_token,expected_result_revision:job.expected_result_revision,source_fingerprint:job.source_fingerprint,engine_version:FULL_NET_SKINS_ENGINE,result_state:'PROVISIONAL',result_payload:payload,request_fingerprint:'b'.repeat(64)}));
   }
   try{
    sql(c,d,`alter function production_control.flush_score_derived_intents_v1(text,text,integer) rename to lock_graph_original_flush;
     create function production_control.flush_score_derived_intents_v1(t text,f text,m integer) returns jsonb language plpgsql security definer set search_path=pg_catalog as $q$
     declare v jsonb;begin v:=production_control.lock_graph_original_flush(t,f,m);if f='${family}' then perform pg_advisory_xact_lock(284124001);end if;return v;end $q$;
     revoke all on function production_control.flush_score_derived_intents_v1(text,text,integer) from public,anon,authenticated,service_role;`,{role:''});
    const barrier=openSqlSession(c,d),worker=openSqlSession(c,d),owner=openSqlSession(c,d);sessions.push(barrier,worker,owner);
    const pids=[];for(const s of sessions)pids.push(Number(await s.query('select pg_backend_pid()')));
    await barrier.query('begin;select pg_advisory_xact_lock(284124001)');await worker.query("set statement_timeout='5s';set deadlock_timeout='5s'");await owner.query(`set statement_timeout='${scenario==='match-control'?1:5}s';set deadlock_timeout='5s'`);
    const tick=result(worker.query(tickSql(family)));pending.push(tick);stage='worker-barrier';await waitGraph(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[0])));
    const owned=result(owner.query(ownerSql));pending.push(owned);stage='owner-worker';const waiting=await waitGraph(c,d,pids,g=>g.some(v=>v.pid===pids[2]&&v.blockedBy.includes(pids[1])));
    await barrier.query('commit');const results=await Promise.all(pending);assert.ok(results.every(v=>v.ok&&v.value.ok===true),JSON.stringify(results));
    evidence.tests.push({case:scenario,pass:true,waiting,results,controlTimeoutMs:1000,workerTimeoutMs:5000,barrier:'test-only after actual family flush; status uses no other-family write locks'});
   }catch(error){evidence.tests.push({case:scenario,pass:false,stage,error:error.message});throw error;}finally{await cleanup(sessions,pending);}
  });
  for(const order of ['old-lexicographic','inherited-control'])await t.test('Intelligence '+order+' prefix has the expected actual control graph',async()=>{
   const d=clone(order.replaceAll('-','_')),sessions=[],pending=[];
   sql(c,d,"set statement_timeout='5s';select production_control.flush_score_derived_intents_v1('2026','COMPETITION',8)");
   const old=order==='old-lexicographic',first=old?'PROJECTION_EDITORIAL':'TOURNAMENT_INTELLIGENCE';
   if(old)sql(c,d,`do $p$ declare d text;begin d:=pg_get_functiondef('production_control.intelligence_delivery_ready_v1(text,jsonb)'::regprocedure);
    d:=replace(d,'order by case engine_key when ''TEAM_MOMENTUM'' then 1 when ''TOURNAMENT_STORYLINES'' then 2'||chr(10)||'      when ''TOURNAMENT_INTELLIGENCE'' then 3 when ''PROJECTION_EDITORIAL'' then 4 when ''TOURNAMENT_FINAL_RECAP'' then 5 end for update;','order by engine_key for update;');execute d;end $p$;`,{role:''});
   assert.match(sql(c,d,"select prosrc from pg_proc where oid='production_control.intelligence_delivery_ready_v1(text,jsonb)'::regprocedure",{role:''}),old?/order by engine_key for update/:/when 'TOURNAMENT_INTELLIGENCE' then 3 when 'PROJECTION_EDITORIAL' then 4/);
   try{
    const worker=openSqlSession(c,d),owner=openSqlSession(c,d);sessions.push(worker,owner);const pids=[];for(const s of sessions)pids.push(Number(await s.query('select pg_backend_pid()')));
    await worker.query(`set statement_timeout='5s';set deadlock_timeout='5s';begin;select 1 from scoring_authority.competition_recalculation_jobs where tournament_id='2026' and round_number=0 and engine_key='${first}' for update`);await owner.query("set statement_timeout='1s';set deadlock_timeout='5s'");
    const control=result(owner.query(rpcSql('mutate_production_match_control',inputFor(c,d,'2026-R1-1',1,{director:true,operation:'SCORING_LOCK',key:'intel-lock-control'}))));pending.push(control);
    const oneWay=await waitGraph(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[0])));
    const claimed=result(worker.query(rpcSql('claim_intelligence_derived_bundle',runtimeScope({worker_id:'intel-graph',requested_by:'intel-graph',engine_keys:['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']}))));pending.push(claimed);
    if(old){const reciprocal=await waitGraph(c,d,pids,g=>g.every(v=>v.blockedBy.includes(pids.find(x=>x!==v.pid))));const cr=await control;assert.equal(cr.ok,false);assert.match(cr.error,/statement timeout/);assert.equal((await claimed).value.ok,true);await worker.query('commit');evidence.tests.push({case:order,pass:true,expectedCounterexample:true,oneWay,reciprocal,control:cr});}
    else{const cr=await claimed;assert.equal(cr.ok,true);assert.equal(cr.value.ok,true);assert.notEqual(cr.value.empty,true);await worker.query('commit');const ctl=await control;assert.equal(ctl.ok,true);assert.equal(ctl.value.ok,true);evidence.tests.push({case:order,pass:true,oneWay,claimed:true,controlCommitted:true});}
   }finally{await cleanup(sessions,pending);}
  });
 }finally{if(f)await destroyIsolatedCluster(f.cluster);await writeFile(new URL('../docs/reliability/phase2c/evidence/worker-lock-isolation-after.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');}
});
