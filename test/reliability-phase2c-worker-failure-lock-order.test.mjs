// POSTGRESQL / CONCURRENCY: actual expiry/failure/claim bodies and control locks.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {createPhase2CFixture} from './support/reliability/phase2c-fixture.mjs';
import {sql,openSqlSession,destroyIsolatedCluster,createDatabase} from './support/reliability/postgres17.mjs';
import {configureFiniteTimeout} from './support/reliability/phase2c-install.mjs';
import {seedSyntheticSideGameHistory} from './support/reliability/synthetic-history.mjs';
import {prepareLocalScoreDerivedWorkerFixture} from './support/reliability/phase2c-worker.mjs';
import {inputFor,rpcSql} from './support/reliability/phase2-score-fixture.mjs';
import {runtimeScope} from './support/reliability/synthetic-tournament.mjs';
import {seedAnnualWorkerBoundary,annualWorkerInput,annualWorkerGeneration} from './support/reliability/phase2c-annual-workers.mjs';
const beforePath='../docs/reliability/phase2c/evidence/worker-failure-lock-before-9bd77498/phase2c-worker-failure-before-definitions.json';
const beforeBytes=await readFile(new URL(beforePath,import.meta.url));
const before=JSON.parse(beforeBytes);
assert.equal(before.installed.migrations.find(v=>v.path.includes('0124_')).sha256,'9bd77498ad3ea0d54c2af2adfba5609fd1951e6ee910d564b35cb621a890bcf6');
const functions={
 'expiry-update':'score_derived_delivery_tick_v1',
 'bundle-failure':'fail_intelligence_derived_bundle_v1',
 'preclaim-skip-locked':'fail_score_derived_preclaim_v1',
 'future-expiry':'future_production_claim_competition_derived_jobs_v1',
 'future-intelligence':'future_production_claim_intelligence_derived_bundle_v1',
};
const evidence={schemaVersion:1,environment:'OWNED_LOCAL_SOCKET_ONLY_POSTGRESQL17',production:false,tests:[],
 beforeDefinitionSHA256:createHash('sha256').update(beforeBytes).digest('hex'),startedAt:new Date().toISOString(),
 limitations:['Actual worker/control function bodies execute unchanged apart from restoring the captured historical body in BEFORE cases.',
 'Fixture-only BEFORE UPDATE barrier pauses after one real worker row lock. Marker rows are legally reinserted in a different physical order; no planner settings are forced.',
 'Future2099 cases use an explicit outer runtime seam and the actual installed match-control trigger through synthetic DML. They are not protected annual Director RPC certification.',
 'Future Intelligence pauses the actual control trigger after its Intel row lock, then starts the complete unchanged claim; no worker key is manually prelocked.',
 'CONTROL1s and WORKER5s budgets are local mechanism proof, not provider capacity.']};
const parse=(c,d,s)=>JSON.parse(sql(c,d,s,{role:''}));
const result=p=>p.then(v=>({ok:true,value:JSON.parse(v)}),e=>({ok:false,error:e.message}));
async function graph(c,d,pids,predicate){for(let i=0;i<60;i++){const rows=parse(c,d,`select jsonb_agg(jsonb_build_object('pid',pid,'blockedBy',pg_blocking_pids(pid),'wait',wait_event,'query',left(query,160)))from pg_stat_activity where pid in(${pids.join(',')})`);if(predicate(rows))return rows;await new Promise(r=>setTimeout(r,8));}throw Error('Expected worker/control wait graph not observed');}
async function cleanup(sessions,pending){if(sessions[0])await Promise.resolve().then(()=>sessions[0].query('rollback')).catch(()=>{});await Promise.allSettled(pending);await Promise.allSettled(sessions.map(s=>Promise.resolve().then(()=>s.query('rollback'))));await Promise.allSettled(sessions.map(s=>Promise.resolve().then(()=>s.close())));}
const q=v=>`'${String(v).replaceAll("'","''")}'`;
test('Worker expiry, failure and future claims preserve actual control lock order',{timeout:180000},async t=>{
 let f;
 try{
  f=await createPhase2CFixture();const c=f.cluster;evidence.installed=f.phase2c;
  sql(c,f.database,`alter database ${f.database} set statement_timeout='180s'`,{role:''});
  seedSyntheticSideGameHistory(c,f.database,1);prepareLocalScoreDerivedWorkerFixture(c,f.database);
  for(let hole=1;hole<=18;hole++)assert.equal(parse(c,f.database,rpcSql('submit_production_hole_score',inputFor(c,f.database,'2026-R1-1',hole,{director:true,key:'failure-order-score-'+hole}))).code,'ACCEPTED');
  sql(c,f.database,"set statement_timeout='5s';select production_control.flush_score_derived_intents_v1('2026','COMPETITION',8);select production_control.flush_score_derived_intents_v1('2026','COMPETITION',8);select production_control.flush_score_derived_intents_v1('2026','COMPETITION',8)");
  const specs=[];
  for(const scenario of ['expiry-update','bundle-failure'])for(const control of ['SCORING_LOCK','FINALIZE'])for(const order of ['before','after'])specs.push({scenario,control,order});
  for(const control of ['SCORING_LOCK','FINALIZE'])specs.push({scenario:'preclaim-skip-locked',control,order:'after'});
  for(const scenario of ['future-expiry','future-intelligence'])for(const order of ['before','after'])specs.push({scenario,control:'INSTALLED_MATCH_CONTROL_TRIGGER',order});
  for(const [number,spec] of specs.entries())await t.test(`${spec.scenario} ${spec.control} ${spec.order}`,async()=>{
   const {scenario,control:controlKind,order}=spec,annual=scenario.startsWith('future-'),target=annual?'2099':'2026';
   const d='failure_order_'+number;createDatabase(c,d,{template:f.database});configureFiniteTimeout(c,d,1000);
   if(annual){seedAnnualWorkerBoundary(c,d);sql(c,d,`begin;set local session_replication_role=replica;update scoring_authority.matches set tournament_id='2099'where match_id='2026-R1-1';update scoring_authority.competition_recalculation_jobs set tournament_id='2099',runtime_generation_id='${annualWorkerGeneration}'where tournament_id='2026';commit`,{role:''});}
   const state=['preclaim-skip-locked','future-intelligence'].includes(scenario)?'PENDING':'RUNNING';
   sql(c,d,`begin;set local session_replication_role=replica;
    delete from scoring_authority.score_derived_intents_v1;
    create temporary table marker_fixture as select to_jsonb(j)payload from scoring_authority.competition_recalculation_jobs j where tournament_id=${q(target)}and round_number=0;
    delete from scoring_authority.competition_recalculation_jobs where tournament_id=${q(target)}and round_number=0;
    insert into scoring_authority.competition_recalculation_jobs select v.* from marker_fixture f cross join lateral jsonb_populate_record(null::scoring_authority.competition_recalculation_jobs,f.payload||jsonb_build_object('status','SUCCEEDED','delivery_attempts',0,'attempts',0,'delivery_dead_letter_at',null,'delivery_error_class',null,'delivery_available_at','2000-01-01T00:00:00Z'))v
      order by case v.engine_key when 'PROJECTION_EDITORIAL'then 1 when 'TOURNAMENT_INTELLIGENCE'then 2 else 3 end;
    update scoring_authority.competition_recalculation_jobs set status='${state}',started_at='2026-09-01T00:00:00Z',completed_at=null,delivery_attempts=1,attempts=1,
      claimed_by='failure-lock-worker',claim_token='00000000-0000-4000-8000-000000000124',lease_expires_at='${scenario.includes('expiry')?'2000':'2100'}-01-01T00:00:00Z'
      where tournament_id=${q(target)}and round_number=0 and engine_key in('PROJECTION_EDITORIAL','TOURNAMENT_INTELLIGENCE');
    set local session_replication_role=origin;commit;analyze scoring_authority.competition_recalculation_jobs;
    create function scoring_authority.isolated_failure_barrier()returns trigger language plpgsql set search_path=pg_catalog as $barrier$begin
      if (current_setting('bagger.isolated_failure_worker',true)='yes'and new.engine_key='PROJECTION_EDITORIAL')
        or(current_setting('bagger.isolated_failure_control',true)='yes'and new.engine_key='TOURNAMENT_INTELLIGENCE')
      then perform pg_advisory_xact_lock(284124991);end if;return new;end;$barrier$;
    create trigger aaa_isolated_failure_barrier before update on scoring_authority.competition_recalculation_jobs for each row execute function scoring_authority.isolated_failure_barrier();`,{role:''});
   const fn=functions[scenario];
   if(order==='before')sql(c,d,before.functions.find(v=>v.signature===fn+'(jsonb)').definition,{role:''});
   const definition=parse(c,d,`select jsonb_build_object('source',prosrc,'hash',encode(extensions.digest(prosrc,'sha256'),'hex'))from pg_proc where oid='public.${fn}(jsonb)'::regprocedure`);
   if(order==='before')assert.equal(definition.hash,before.functions.find(v=>v.signature===fn+'(jsonb)').sha256);
   if(scenario==='future-intelligence')assert.match(definition.source,order==='before'?/order by value.engine_key\s+for update/:/order by case value.engine_key when 'TOURNAMENT_INTELLIGENCE' then 3/);
   assert.equal(sql(c,d,'select count(*)from scoring_authority.score_derived_intents_v1'),'0');
   const work=parse(c,d,`select jsonb_agg(jsonb_build_object('family','INTELLIGENCE','key',engine_key,'cycle',delivery_cycle,'attempt',delivery_attempts)order by case engine_key when 'PROJECTION_EDITORIAL'then 1 else 2 end)from scoring_authority.competition_recalculation_jobs where tournament_id=${q(target)}and round_number=0 and engine_key in('PROJECTION_EDITORIAL','TOURNAMENT_INTELLIGENCE')`);
   const input=runtimeScope({...(annual?annualWorkerInput:{}),contract_version:'score-derived-delivery-v1',worker_id:'failure-lock-worker',operation_id:randomUUID(),materialization_family:'COMPETITION',claim_started_at:'2026-09-01T00:00:00Z',error_code:'57014',family:'INTELLIGENCE',work,
    engine_keys:scenario==='future-expiry'?['TEAM_MOMENTUM','TOURNAMENT_STORYLINES']:['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']});
   const controlName=controlKind==='FINALIZE'?'finalize_production_match':'mutate_production_match_control';
   const controlInput=annual?null:inputFor(c,d,'2026-R1-1',18,{director:controlKind!=='FINALIZE',operation:controlKind,key:'failure-order-control'});
   const controlSql=annual?"update scoring_authority.matches set scoring_locked=true,match_revision=match_revision+1,authority_updated_at=clock_timestamp(),updated_at=clock_timestamp()where match_id='2026-R1-1' returning jsonb_build_object('ok',true)":rpcSql(controlName,controlInput);
   const record={...spec,tournamentId:target,function:fn,functionSHA256:definition.hash,controlBudgetMs:1000,workerBudgetMs:5000,pass:false};evidence.tests.push(record);
   const sessions=[],pending=[];let stage='open';
   try{
    const barrier=openSqlSession(c,d),worker=openSqlSession(c,d),control=openSqlSession(c,d);sessions.push(barrier,worker,control);const pids=[];for(const s of sessions)pids.push(Number(await s.query('select pg_backend_pid()')));
    await barrier.query('begin;select pg_advisory_xact_lock(284124991)');
    await worker.query("set statement_timeout='5s';set deadlock_timeout='5s';set bagger.isolated_failure_worker='yes'");
    await control.query("set statement_timeout='1s';set deadlock_timeout='5s'");
    let processing,controlling;
    if(scenario==='future-intelligence'){
     await worker.query("set bagger.isolated_failure_worker='no'");
     await control.query("set bagger.isolated_failure_control='yes'");
     controlling=result(control.query(controlSql));pending.push(controlling);stage='actual-control-first-key';
     record.barrier=await graph(c,d,pids,g=>g.some(v=>v.pid===pids[2]&&v.blockedBy.includes(pids[0])));
     processing=result(worker.query(rpcSql(fn,input)));pending.push(processing);stage='actual-claim-prefix';
     record.oneWay=await graph(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[2])));
     record.workerManualPrelock=false;
    }else{
     processing=result(worker.query(rpcSql(fn,input)));pending.push(processing);stage='worker-first-row';
     record.barrier=await graph(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[0])));
     controlling=result(control.query(controlSql));pending.push(controlling);stage='control-worker';
     record.oneWay=await graph(c,d,pids,g=>g.some(v=>v.pid===pids[2]&&v.blockedBy.includes(pids[1])));
    }
    await barrier.query('commit');stage='released';
    if(order==='before'){
     record.reciprocal=await graph(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[2]))&&g.some(v=>v.pid===pids[2]&&v.blockedBy.includes(pids[1])));
     const ctl=await controlling;assert.equal(ctl.ok,false);assert.match(ctl.error,/statement timeout/);
     const processed=await processing;assert.ok(processed.ok&&processed.value.ok,JSON.stringify(processed));record.results={worker:processed,control:ctl};
     assert.equal(sql(c,d,"select scoring_locked from scoring_authority.matches where match_id='2026-R1-1'"),'f');
     assert.equal(parse(c,d,controlSql).ok,true);record.sameControlRetry=true;record.expectedCounterexample=true;
    }else{
     const processed=await processing;assert.ok(processed.ok&&processed.value.ok,JSON.stringify(processed));const ctl=await controlling;assert.ok(ctl.ok&&ctl.value.ok,JSON.stringify(ctl));record.results={worker:processed,control:ctl};
     if(scenario==='preclaim-skip-locked')assert.equal(processed.value.marked,1);
     record.expectedCounterexample=false;
    }
    assert.equal(sql(c,d,"select count(*)from scoring_authority.hole_scores where match_id='2026-R1-1'"),'18');
    assert.equal(sql(c,d,"select scoring_locked from scoring_authority.matches where match_id='2026-R1-1'"),'t');
    if(controlKind==='FINALIZE')assert.equal(sql(c,d,"select status from scoring_authority.matches where match_id='2026-R1-1'"),'FINAL');
    record.canonicalHolesUnchanged=18;record.pass=true;
   }catch(error){record.stage=stage;record.error=error.message;throw error;}finally{await cleanup(sessions,pending);}
  });
  await t.test('all four affected function privileges and attributes remain unchanged',()=>{
   const records=[];
   for(const fn of Object.values(functions)){
    const actual=parse(c,f.database,`select jsonb_build_object('signature',oid::regprocedure::text,'acl',proacl,'owner',proowner,'securityDefiner',prosecdef,'config',proconfig,'volatility',provolatile,'source',prosrc)from pg_proc where oid='public.${fn}(jsonb)'::regprocedure`);
    const old=before.functions.find(v=>v.signature===fn+'(jsonb)');
    if(fn==='future_production_claim_competition_derived_jobs_v1'){
     const prefix=actual.source.split('  -- Preserve the inherited expiry domain,')[1]?.split('  update scoring_authority.competition_recalculation_jobs value set')[0];
     assert.ok(prefix);assert.match(prefix,/where value.tournament_id=target and value.runtime_generation_id=generation_id/);
     assert.match(prefix,/order by value.round_number/);assert.ok(!prefix.includes('round_number=0'));
     evidence.futureExpiryDomain={proofLayer:'SOURCE',exactTargetAndGeneration:true,nonRoundZeroNotExcluded:true,existingUpdatePredicatesUnchanged:actual.source.slice(actual.source.indexOf('  update scoring_authority.competition_recalculation_jobs value set'))===old.source.slice(old.source.indexOf('  update scoring_authority.competition_recalculation_jobs value set'))};
     assert.equal(evidence.futureExpiryDomain.existingUpdatePredicatesUnchanged,true);
    }
    for(const key of ['acl','owner','securityDefiner','config','volatility'])assert.deepEqual(actual[key],old[key],fn+' '+key);records.push(actual);
   }
   evidence.attributes=records;
  });
 }finally{if(f){await destroyIsolatedCluster(f.cluster);evidence.clusterDestroyed=true;}evidence.completedAt=new Date().toISOString();await writeFile(new URL('../docs/reliability/phase2c/evidence/worker-failure-lock-after.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');}
});
