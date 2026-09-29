// Temporary ACTUAL_SQL/CONCURRENCY characterization; owned local PostgreSQL only.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createPhase2CFixture} from '/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv/test/support/reliability/phase2c-fixture.mjs';
import {sql,jsonLiteral,openSqlSession,destroyIsolatedCluster,createDatabase} from '/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv/test/support/reliability/postgres17.mjs';
import {configureFiniteTimeout} from '/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv/test/support/reliability/phase2c-install.mjs';
import {seedSyntheticSideGameHistory} from '/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv/test/support/reliability/synthetic-history.mjs';
import {prepareLocalScoreDerivedWorkerFixture} from '/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv/test/support/reliability/phase2c-worker.mjs';
import {inputFor,rpcSql} from '/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv/test/support/reliability/phase2-score-fixture.mjs';
import {runtimeScope} from '/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv/test/support/reliability/synthetic-tournament.mjs';
const output='/private/tmp/phase2c-worker-failure-lock-review-results.json';
const evidence={environment:'OWNED_LOCAL_SOCKET_ONLY_POSTGRESQL17',production:false,tests:[],startedAt:new Date().toISOString(),result:'FAIL',limitations:['Actual worker and supported control bodies are unchanged. A fixture-only BEFORE UPDATE trigger pauses after the worker has locked its first job row.','The five current marker rows are reinserted in a legal different physical order, with all CHECK and unique constraints active; fixture triggers/FKs are bypassed during construction only.','Frozen2026 synthetic runtime boundary; actual annual admission is separate.','Control1s and worker5s finite budgets; no Production or provider capacity claim.']};
const parse=(c,d,s)=>JSON.parse(sql(c,d,s,{role:''}));
const result=p=>p.then(v=>({ok:true,value:JSON.parse(v)}),e=>({ok:false,error:e.message}));
async function observe(c,d,pids,predicate){for(let i=0;i<60;i++){const rows=parse(c,d,`select jsonb_agg(jsonb_build_object('pid',pid,'blockedBy',pg_blocking_pids(pid),'wait',wait_event,'query',left(query,160)))from pg_stat_activity where pid in(${pids.join(',')})`);if(predicate(rows))return rows;await new Promise(r=>setTimeout(r,8));}throw Error('Expected wait graph not observed');}
async function cleanup(sessions,pending){if(sessions[0])await Promise.resolve().then(()=>sessions[0].query('rollback')).catch(()=>{});await Promise.allSettled(pending);await Promise.allSettled(sessions.map(s=>Promise.resolve().then(()=>s.query('rollback'))));await Promise.allSettled(sessions.map(s=>Promise.resolve().then(()=>s.close())));}
let fixture;
try{
 fixture=await createPhase2CFixture();const c=fixture.cluster;evidence.installed=fixture.phase2c;
 sql(c,fixture.database,`alter database ${fixture.database} set statement_timeout='180s'`,{role:''});
 seedSyntheticSideGameHistory(c,fixture.database,1);prepareLocalScoreDerivedWorkerFixture(c,fixture.database);
 for(const scenario of ['expiry-update','bundle-failure','preclaim-skip-locked']){
  const d='worker_failure_'+scenario.replaceAll('-','_');createDatabase(c,d,{template:fixture.database});configureFiniteTimeout(c,d,1000);
  const score=inputFor(c,d,'2026-R1-1',1,{director:true,key:'failure-lock-score'});assert.equal(parse(c,d,rpcSql('submit_production_hole_score',score)).code,'ACCEPTED');
  sql(c,d,"set statement_timeout='5s';select production_control.flush_score_derived_intents_v1('2026','COMPETITION',8)");
  // Only fixture construction changes row order. No planner GUC is forced.
  const state=scenario==='preclaim-skip-locked'?'PENDING':'RUNNING';
  sql(c,d,`begin;set local session_replication_role=replica;
   delete from scoring_authority.score_derived_intents_v1;
   create temporary table marker_fixture as select to_jsonb(j) payload from scoring_authority.competition_recalculation_jobs j where tournament_id='2026'and round_number=0;
   delete from scoring_authority.competition_recalculation_jobs where tournament_id='2026'and round_number=0;
   insert into scoring_authority.competition_recalculation_jobs select v.* from marker_fixture f cross join lateral jsonb_populate_record(null::scoring_authority.competition_recalculation_jobs,f.payload||jsonb_build_object('status','SUCCEEDED','delivery_attempts',0,'attempts',0,'delivery_dead_letter_at',null,'delivery_error_class',null,'delivery_available_at','2000-01-01T00:00:00Z'))v
    order by case v.engine_key when 'PROJECTION_EDITORIAL'then1when'TOURNAMENT_INTELLIGENCE'then2else3end;
   update scoring_authority.competition_recalculation_jobs set status='${state}',started_at='2026-09-01T00:00:00Z',completed_at=null,delivery_attempts=1,attempts=1,
    claimed_by='failure-lock-worker',claim_token='00000000-0000-4000-8000-000000000124',lease_expires_at='${scenario==='expiry-update'?'2000':'2100'}-01-01T00:00:00Z'
    where tournament_id='2026'and round_number=0 and engine_key in('PROJECTION_EDITORIAL','TOURNAMENT_INTELLIGENCE');
   set local session_replication_role=origin;commit;analyze scoring_authority.competition_recalculation_jobs;
   create function scoring_authority.isolated_failure_barrier()returns trigger language plpgsql set search_path=pg_catalog as $barrier$begin
    if current_setting('bagger.isolated_failure_worker',true)='yes' and new.engine_key='PROJECTION_EDITORIAL' then perform pg_advisory_xact_lock(284124991);end if;return new;end;$barrier$;
   create trigger aaa_isolated_failure_barrier before update on scoring_authority.competition_recalculation_jobs for each row execute function scoring_authority.isolated_failure_barrier();`.replace("when 'PROJECTION_EDITORIAL'then1when'TOURNAMENT_INTELLIGENCE'then2else3end","when 'PROJECTION_EDITORIAL' then 1 when 'TOURNAMENT_INTELLIGENCE' then 2 else 3 end"),{role:''});
  assert.equal(sql(c,d,"select count(*)from scoring_authority.score_derived_intents_v1"),'0');
  const initial=parse(c,d,"select jsonb_agg(jsonb_build_object('engine',engine_key,'ctid',ctid::text,'status',status)order by ctid)from scoring_authority.competition_recalculation_jobs where tournament_id='2026'and round_number=0");
  const markerWork=parse(c,d,"select jsonb_agg(jsonb_build_object('family','INTELLIGENCE','key',engine_key,'cycle',delivery_cycle,'attempt',delivery_attempts)order by case engine_key when 'PROJECTION_EDITORIAL'then 1 else 2 end)from scoring_authority.competition_recalculation_jobs where tournament_id='2026'and round_number=0 and engine_key in('PROJECTION_EDITORIAL','TOURNAMENT_INTELLIGENCE')");
  const workerInput=runtimeScope({contract_version:'score-derived-delivery-v1',worker_id:'failure-lock-worker',operation_id:randomUUID(),materialization_family:'COMPETITION',claim_started_at:'2026-09-01T00:00:00Z',error_code:'57014',family:'INTELLIGENCE',work:markerWork});
  const fn=scenario==='expiry-update'?'score_derived_delivery_tick_v1':scenario==='bundle-failure'?'fail_intelligence_derived_bundle_v1':'fail_score_derived_preclaim_v1';
  const controlInput=inputFor(c,d,'2026-R1-1',1,{director:true,operation:'SCORING_LOCK',key:'failure-lock-control'});
  const sessions=[],pending=[];const record={scenario,function:fn,initial,pass:false};evidence.tests.push(record);let stage='open';
  try{
   const barrier=openSqlSession(c,d),worker=openSqlSession(c,d),control=openSqlSession(c,d);sessions.push(barrier,worker,control);
   const pids=[];for(const s of sessions)pids.push(Number(await s.query('select pg_backend_pid()')));
   await barrier.query('begin;select pg_advisory_xact_lock(284124991)');
   await worker.query("set statement_timeout='5s';set deadlock_timeout='5s';set bagger.isolated_failure_worker='yes'");
   await control.query("set statement_timeout='1s';set deadlock_timeout='5s'");
   const processing=result(worker.query(rpcSql(fn,workerInput)));pending.push(processing);stage='worker-first-row';
   record.barrier=await observe(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[0])));
   const controlling=result(control.query(rpcSql('mutate_production_match_control',controlInput)));pending.push(controlling);stage='control-worker';
   record.oneWay=await observe(c,d,pids,g=>g.some(v=>v.pid===pids[2]&&v.blockedBy.includes(pids[1])));
   await barrier.query('commit');stage='released';
   if(scenario==='preclaim-skip-locked'){
    record.results=await Promise.all(pending);assert.ok(record.results.every(v=>v.ok&&v.value.ok),JSON.stringify(record.results));
    assert.equal(record.results[0].value.marked,1,'Already-held sibling is skipped instead of awaited');record.expected='NO_CYCLE_SKIP_LOCKED';
   }else{
    record.reciprocal=await observe(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[2]))&&g.some(v=>v.pid===pids[2]&&v.blockedBy.includes(pids[1])));
    const ctl=await controlling;assert.equal(ctl.ok,false);assert.match(ctl.error,/statement timeout/);
    const work=await processing;assert.equal(work.ok,true,JSON.stringify(work));assert.equal(work.value.ok,true);record.results=[work,ctl];record.expected='CONTROL_57014_FROM_ACTUAL_RECIPROCAL_CYCLE';
    assert.equal(sql(c,d,"select scoring_locked from scoring_authority.matches where match_id='2026-R1-1'"),'f');
    assert.equal(parse(c,d,rpcSql('mutate_production_match_control',controlInput)).ok,true);
   }
   assert.equal(sql(c,d,"select count(*)from scoring_authority.hole_scores where match_id='2026-R1-1'"),'1');
   assert.equal(sql(c,d,"select scoring_locked from scoring_authority.matches where match_id='2026-R1-1'"),'t');
   record.pass=true;
  }catch(error){record.error=error.message;record.stage=stage;throw error;}finally{await cleanup(sessions,pending);}
 }
 evidence.result='PASS';
}finally{if(fixture){await destroyIsolatedCluster(fixture.cluster);evidence.clusterDestroyed=true;}evidence.completedAt=new Date().toISOString();await writeFile(output,JSON.stringify(evidence,null,2)+'\n');}
