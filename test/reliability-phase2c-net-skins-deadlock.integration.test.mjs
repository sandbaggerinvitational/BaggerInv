// Proof layers: POSTGRESQL / CONCURRENCY / INTEGRATION. Owned local PostgreSQL only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createScoreProofFixture,cloneScoreProofDatabase,inputFor,rpcSql,canonicalState} from './support/reliability/phase2-score-fixture.mjs';
import {sql,sqlFile,jsonLiteral,repositoryRoot,destroyIsolatedCluster,openSqlSession} from './support/reliability/postgres17.mjs';
import {seedSyntheticSideGameHistory} from './support/reliability/synthetic-history.mjs';
import {seedThreeRoundNetSkinsConfiguration} from './support/reliability/phase2c-annual-workers.mjs';
import {configureFiniteTimeout} from './support/reliability/phase2c-install.mjs';
import {runtimeScope,syntheticDirector} from './support/reliability/synthetic-tournament.mjs';
import {calculateProductionFullNetSkins,FULL_NET_SKINS_ENGINE} from '../lib/production-full-net.js';
const fullCandidate=process.env.BAGGER_PHASE2C_FULL==='1';
const migrationPath='supabase/production_migrations/202609280123_annual_worker_sql_and_net_skins_locks_v1.sql';
const migration=await readFile(path.join(repositoryRoot,migrationPath),'utf8');
const json=(c,d,q)=>JSON.parse(sql(c,d,q,{role:''}));
const flush="select production_control.flush_score_derived_intents_v1('2026','NET_SKINS',1)";
const append=(c,d,round,n)=>sql(c,d,`select production_control.append_score_derived_intent_v1(
 '2026','2026-R${round}-${n}',${round},'NET_SKINS','ISOLATED_MIXED_ROUND_WORKER','{}',null)`,{role:''});
const jobState=(c,d)=>json(c,d,`select coalesce(jsonb_agg(jsonb_build_object('round',round_number,'status',status,
 'source',source_fingerprint,'configuration',configuration_fingerprint)order by round_number),'[]')
 from scoring_authority.net_skins_v1_recalculation_jobs where status in('PENDING','RUNNING')and tournament_id='2026'`);
const file=path.join(repositoryRoot,'docs/reliability/phase2c/evidence/net-skins-deadlock.json');
test('Phase2C ordered Net Skins locks eliminate the reproduced cycle',{timeout:360000},async t=>{
 const f=await createScoreProofFixture({candidateSql:'supabase/production_migrations/202609280121_score_derived_intents_v1.sql'}),c=f.cluster;
 const evidence={schemaVersion:1,baseSha:'b1ceaa89f2d7cd0cdf2835aba04a24aca442ca18',fixture:'phase2c-three-round-workers-v1',
  seed:'ordered-rounds-20260928',environment:'ISOLATED_LOCAL_POSTGRESQL17',statementTimeoutMs:5000,composition:fullCandidate?'121+122+123+124':'121+123',
  migration:migrationPath,migrationSha256:createHash('sha256').update(migration).digest('hex'),timestamp:new Date().toISOString(),tests:[],
  limitations:['Synthetic current authority boundary; no Production lock-frequency or capacity claim',
   'Financial comparison executes an explicit owner-invoked SQL claim/calculator/completion sequence; it does not test Director HTTP authorization or authorize automated financial publication',
   'Eliminated known advisory cycle is distinct from automatic retry for unrelated40P01, covered by delivery tests']};
 const run=(id,title,fn)=>t.test(`${id}: ${title}`,async()=>{const row={id,title,proofLayer:'CONCURRENCY',result:'FAIL'};
  try{row.details=await fn();row.result='PASS';}catch(e){row.error=e.message;throw e;}finally{evidence.tests.push(row);}});
 const clone=label=>{const d=cloneScoreProofDatabase(f,label);configureFiniteTimeout(c,d,5000);return d;};
 try{
  seedSyntheticSideGameHistory(c,f.database,1);seedThreeRoundNetSkinsConfiguration(c,f.database);
  if(fullCandidate)sqlFile(c,f.database,path.join(repositoryRoot,'supabase/production_migrations/202609280122_score_mutation_recovery_v1.sql'),{role:''});
  sqlFile(c,f.database,path.join(repositoryRoot,migrationPath),{role:''});
  if(fullCandidate)sqlFile(c,f.database,path.join(repositoryRoot,'supabase/production_migrations/202609280124_score_derived_delivery_v1.sql'),{role:''});
  await run('P2C-D-ORDER','historical opposite-round transactions form one-way waiting, not a cycle',async()=>{
   const d=clone('lock_graph');for(const [r,n]of[[1,1],[2,1],[2,2],[1,2]])append(c,d,r,n);
   const sessions=[openSqlSession(c,d),openSqlSession(c,d)],pending=[];
   try{
    const pids=[];for(const s of sessions){pids.push(Number(await s.query('select pg_backend_pid()')));await s.query("set deadlock_timeout='100ms';set statement_timeout='5s';begin");}
    assert.equal(JSON.parse(await sessions[0].query(flush)).processed,1);
    pending.push(sessions[1].query(flush));
    let graph=[];for(let i=0;i<30;i++){graph=json(c,d,`select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'blockedBy',pg_blocking_pids(pid),'wait',wait_event)),'[]')from pg_stat_activity where pid in(${pids})and wait_event='advisory'`);if(graph.length)break;await new Promise(r=>setTimeout(r,10));}
    assert.equal(graph.length,1);assert.equal(graph[0].pid,pids[1]);assert.deepEqual(graph[0].blockedBy,[pids[0]]);
    assert.equal(JSON.parse(await sessions[0].query(flush)).processed,1);await sessions[0].query('commit');
    assert.equal(JSON.parse(await pending[0]).processed,1);assert.equal(JSON.parse(await sessions[1].query(flush)).processed,1);await sessions[1].query('commit');
    assert.equal(sql(c,d,"select count(*)from scoring_authority.score_derived_intents_v1 where status='SUCCEEDED'"),'4');
    return{graph,deadlocks:0,processed:4,priorFailure:'before-migration.json P2-MIG-SKINS-DEADLOCK has reciprocal advisory waits and40P01'};
   }finally{await Promise.allSettled(pending);await Promise.allSettled(sessions.map(s=>s.query('rollback')));await Promise.allSettled(sessions.map(s=>s.close()));}
  });
  for(const rounds of[[1,2],[2,3],[1,3],[1,2,3],[2,2]])await run(`P2C-D-STRESS-${rounds.join('')}`,
   `repeated mixed-round ${rounds.join('/')} batches preserve current job parity`,async()=>{
    const rows=[];
    for(let iteration=0;iteration<8;iteration++){
     const d=clone('stress'),serial=clone('serial');
     const order=iteration%2?[...rounds].reverse():rounds;
     for(const database of[d,serial])for(let i=0;i<order.length*3;i++)append(c,database,order[i%order.length],(i%4)+1);
     const expectedCount=order.length*3;
     while(Number(sql(c,serial,"select count(*)from scoring_authority.score_derived_intents_v1 where status='PENDING'")))
      assert.equal(json(c,serial,"select production_control.flush_score_derived_intents_v1('2026','NET_SKINS',8)").failed,0);
     const sessions=[openSqlSession(c,d),openSqlSession(c,d),openSqlSession(c,d)],started=performance.now();
     try{
      const outcomes=await Promise.all(sessions.map(async(s,n)=>{await s.query("set statement_timeout='5s';set deadlock_timeout='100ms';begin");
       const values=[];for(let i=0;i<order.length;i++)values.push(JSON.parse(await s.query(flush)));await s.query('commit');return values;}));
      assert.equal(outcomes.flat().reduce((n,x)=>n+x.failed,0),0);assert.equal(outcomes.flat().reduce((n,x)=>n+x.processed,0),expectedCount);
      assert.deepEqual(jobState(c,d),jobState(c,serial));
      assert.equal(sql(c,d,"select count(*)from scoring_authority.score_derived_intents_v1 where last_sqlstate='40P01'"),'0');
      rows.push({iteration,order,workers:3,processed:expectedCount,deadlocks:0,elapsedMs:performance.now()-started,jobFingerprintParity:true});
     }finally{await Promise.allSettled(sessions.map(s=>s.query('rollback')));await Promise.allSettled(sessions.map(s=>s.close()));}
    }return{iterations:8,rows};
   });
  await run('P2C-D-FINANCIAL','serial and concurrent materialization preserve actual three-round Net Skins results',async()=>{
   const concurrent=clone('financial_concurrent'),serial=clone('financial_serial');
   const financialState=database=>json(c,database,`select jsonb_build_object(
    'configuration',(select to_jsonb(v)from scoring_authority.net_skins_v1_configuration_current v where tournament_id='2026'),
    'revisions',(select jsonb_agg(to_jsonb(v)order by configuration_revision)from scoring_authority.net_skins_v1_configuration_revisions v where tournament_id='2026'),
    'membership',(select jsonb_agg(to_jsonb(v)order by round_number,entry_id)from scoring_authority.net_skins_configuration_entries v where tournament_id='2026'),
    'entryRevisions',(select jsonb_agg(to_jsonb(v)order by round_number,revision)from production_control.net_skins_entry_revisions_v1 v where tournament_id='2026'))`);
   const immutableResults=database=>json(c,database,`select coalesce(jsonb_agg(to_jsonb(v)-'is_current'-'superseded_at' order by result_id),'[]')
    from scoring_authority.net_skins_v1_result_revisions v where tournament_id='2026'`);
   const beforeFinancial=financialState(serial),beforeResults=immutableResults(serial);
   assert.deepEqual(financialState(concurrent),beforeFinancial);
   assert.deepEqual(immutableResults(concurrent),beforeResults);
   for(const round of[1,2,3]){
    const input=inputFor(c,serial,`2026-R${round}-1`,1,{director:true,key:`P2C-D-FINANCIAL:R${round}`});
    // A supported revision-aware correction also covers the seeded R1 hole.
    input.team_1_gross_scores=input.team_1_gross_scores.map(v=>v+1);
    for(const database of[serial,concurrent]){
     const written=JSON.parse(sql(c,database,rpcSql('submit_production_hole_score',input)));
     assert.equal(written.code,'ACCEPTED');
    }
   }
   const pending=database=>Number(sql(c,database,"select count(*)from scoring_authority.score_derived_intents_v1 where family='NET_SKINS'and status='PENDING'"));
   assert.equal(pending(serial),3);assert.equal(pending(concurrent),3);
   const serialFlush=json(c,serial,"select production_control.flush_score_derived_intents_v1('2026','NET_SKINS',8)");
   assert.equal(serialFlush.processed,3);assert.equal(serialFlush.failed,0);
   const sessions=[openSqlSession(c,concurrent),openSqlSession(c,concurrent),openSqlSession(c,concurrent)];
   let parallelFlush;
   try{
    parallelFlush=await Promise.all(sessions.map(async session=>{
     await session.query("set statement_timeout='5s';set deadlock_timeout='100ms';begin");
     const result=JSON.parse(await session.query(flush));await session.query('commit');return result;
    }));
    assert.equal(parallelFlush.reduce((n,v)=>n+v.processed,0),3);
    assert.equal(parallelFlush.reduce((n,v)=>n+v.failed,0),0);
   }finally{await Promise.allSettled(sessions.map(s=>s.query('rollback')));await Promise.allSettled(sessions.map(s=>s.close()));}
   assert.deepEqual(jobState(c,concurrent),jobState(c,serial));
   const processOwnerRequested=database=>{
    const call=(name,input)=>{const value=JSON.parse(sql(c,database,rpcSql(name,input)));assert.equal(value.ok,true,name);return value;};
    const workerBase=runtimeScope({expected_configuration_revision:beforeFinancial.configuration.configuration_revision,
     worker_id:'phase2c-owner-requested-net-skins',lease_seconds:60,actor_id:'phase2c-synthetic-owner',
     authorization:{tournament_id:'2026',player_id:syntheticDirector.playerId,auth_user_id:syntheticDirector.authUserId,role:'DIRECTOR'}});
    const processed=[];
    for(let index=0;index<3;index++){
     const claimInput={...workerBase,request_fingerprint:createHash('sha256').update(`P2C-D-FINANCIAL:claim:${index}`).digest('hex')};
     const claimed=call('claim_production_net_skins_v1_recalculation',claimInput),job=claimed.job;
     assert.ok(job?.job_id&&job.claim_token&&claimed.calculation_input,'all three configured rounds must produce a real claim');
     assert.ok(!processed.some(row=>row.round===job.round_number),'one result per distinct round');
     assert.equal(job.source_fingerprint,sql(c,database,`select production_control.net_skins_v1_hash(production_control.net_skins_v1_round_source_revision('2026',${job.round_number}))`));
     const replay=call('claim_production_net_skins_v1_recalculation',claimInput);
     assert.equal(replay.idempotent,true);assert.deepEqual(replay.job,job);
     const calculation=calculateProductionFullNetSkins(claimed.calculation_input);
     const payload=calculation.netSkins.rounds.find(row=>Number(row.round)===job.round_number);
     assert.ok(payload?.fullNetDetail?.length>0);assert.equal(payload.finalized,false);
     const completion={...workerBase,job_id:job.job_id,claim_token:job.claim_token,
      expected_result_revision:job.expected_result_revision,source_fingerprint:job.source_fingerprint,
      engine_version:FULL_NET_SKINS_ENGINE,result_state:'PROVISIONAL',result_payload:payload,
      request_fingerprint:createHash('sha256').update(`P2C-D-FINANCIAL:complete:${index}`).digest('hex')};
     call('complete_production_net_skins_v1_recalculation',completion);
     assert.equal(call('complete_production_net_skins_v1_recalculation',completion).idempotent,true);
     const stored=json(c,database,`select jsonb_build_object('status',j.status,'payload',r.engine_result_payload,'source',r.source_fingerprint,
      'revision',r.result_revision,'state',r.result_state,'published',r.published_at,'publicPayload',r.public_result_payload)
      from scoring_authority.net_skins_v1_recalculation_jobs j join scoring_authority.net_skins_v1_result_revisions r using(job_id)
      where j.job_id='${job.job_id}'::uuid and r.is_current`);
     assert.equal(stored.status,'SUCCEEDED');assert.equal(stored.state,'PROVISIONAL');assert.equal(stored.published,null);
     assert.equal(stored.publicPayload,null);assert.deepEqual(stored.payload,payload);assert.equal(stored.source,job.source_fingerprint);
     assert.equal(stored.revision,job.expected_result_revision+1);
     processed.push({round:job.round_number,source:stored.source,payloadSha256:createHash('sha256').update(JSON.stringify(stored.payload)).digest('hex'),
      fullNetEntrants:payload.fullNetDetail.length,claimReplay:true,completionReplay:true});
    }
    assert.deepEqual(processed.map(v=>v.round).sort(),[1,2,3]);
    const afterResults=immutableResults(database);assert.equal(afterResults.length,beforeResults.length+3);
    for(const historical of beforeResults)assert.deepEqual(afterResults.find(v=>v.result_id===historical.result_id),historical,
     'historical result identity, source and financial payload remain immutable');
    assert.deepEqual(financialState(database),beforeFinancial,'processing preserves configuration and explicit opt-in membership');
    const publicRead=call('read_production_net_skins_v1',runtimeScope());
    for(const round of publicRead.data.rounds){assert.equal(round.result_payload,null);assert.equal(round.official_results,null);}
    const currentResults=json(c,database,`select jsonb_agg(jsonb_build_object('round',round_number,'revision',result_revision,
     'configuration',configuration_fingerprint,'source',source_fingerprint,'engine',engine_version,'state',result_state,
     'payload',engine_result_payload,'publicPayload',public_result_payload,'payloadHash',payload_hash,'publishedAt',published_at)order by round_number)
     from scoring_authority.net_skins_v1_result_revisions where tournament_id='2026'and is_current`);
    assert.equal(currentResults.length,3);
    return{processed:processed.sort((a,b)=>a.round-b.round),currentResults};
   };
   const expected=processOwnerRequested(serial),actual=processOwnerRequested(concurrent);
   assert.deepEqual(actual,expected,'concurrent materialization has exactly the serial financial outcome');
   assert.equal(pending(serial),0);assert.equal(pending(concurrent),0);
   return{rounds:[1,2,3],workers:3,serialFlush,parallelFlush,processorPath:'EXPLICIT_OWNER_REQUEST_PUBLIC_CLAIM_UNCHANGED_JS_PUBLIC_COMPLETE',
    engine:FULL_NET_SKINS_ENGINE,resultState:'PROVISIONAL',roundEvidence:actual.processed,currentResultParity:true,
    historicalResultsPreserved:beforeResults.length,additionalResultsPerFixture:3,immutableMembership:true,
    duplicateResults:0,publicationChanged:false,provisionalPublicPayloadWithheld:true,
    limitations:['Synthetic explicit opt-ins and Live matches; no final financial publication or full-round payout certification',
     'SQL service-role worker path after explicit test owner request; Director HTTP authorization remains a separate proof layer']};
  });
  await run('P2C-D-STALE-CURRENT','stale and superseded financial workers cannot replace the current round result',async()=>{
   const rows=[];
   for(const scenario of ['STALE_RUNNING','SUPERSEDED'])for(let iteration=0;iteration<4;iteration++){
    const d=clone('stale_worker');append(c,d,1,1);assert.equal(json(c,d,flush).processed,1);
    const call=(name,input)=>JSON.parse(sql(c,d,rpcSql(name,input)));
    const worker=runtimeScope({expected_configuration_revision:Number(sql(c,d,"select configuration_revision from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026'")),
      worker_id:'phase2c-stale-net-skins',lease_seconds:60,actor_id:'phase2c-synthetic-owner'});
    const claimed=call('claim_production_net_skins_v1_recalculation',{...worker,request_fingerprint:createHash('sha256').update(`staleclaim:${scenario}:${iteration}`).digest('hex')});
    assert.ok(claimed.job?.claim_token);const old=claimed.job;
    const oldPayload=calculateProductionFullNetSkins(claimed.calculation_input).netSkins.rounds.find(v=>Number(v.round)===1);
    const completion={...worker,job_id:old.job_id,claim_token:old.claim_token,expected_result_revision:old.expected_result_revision,
      source_fingerprint:old.source_fingerprint,engine_version:FULL_NET_SKINS_ENGINE,result_state:'PROVISIONAL',result_payload:oldPayload,
      request_fingerprint:createHash('sha256').update(`stalecompletion:${scenario}:${iteration}`).digest('hex')};
    const input=inputFor(c,d,'2026-R1-1',2,{director:true,key:`P2C-D-STALE:${scenario}:${iteration}`});
    assert.equal(call('submit_production_hole_score',input).code,'ACCEPTED');
    const currentSource=sql(c,d,"select production_control.net_skins_v1_hash(production_control.net_skins_v1_round_source_revision('2026',1))");
    assert.notEqual(currentSource,old.source_fingerprint);
    if(scenario==='SUPERSEDED'){
     assert.equal(json(c,d,flush).processed,1);
     assert.equal(sql(c,d,`select status from scoring_authority.net_skins_v1_recalculation_jobs where job_id='${old.job_id}'`),'SUPERSEDED');
     append(c,d,1,2); // A later current intent must coexist safely with the old worker.
    }
    const sessions=[openSqlSession(c,d),openSqlSession(c,d)];
    try{
     await sessions[0].query(`set statement_timeout='5s';set deadlock_timeout='100ms';set "request.jwt.claim.role"='service_role';
      create function pg_temp.capture_stale_net_skins(input jsonb)returns jsonb language plpgsql as $test$
      declare state text;message text;begin return public.complete_production_net_skins_v1_recalculation(input);
      exception when sqlstate '40001' or sqlstate '42501' then get stacked diagnostics state=returned_sqlstate,message=message_text;
       return jsonb_build_object('denied',true,'sqlstate',state,'code',message);end$test$`);
     await sessions[1].query("set statement_timeout='5s';set deadlock_timeout='100ms'");
     const jobs=[()=>sessions[0].query(`begin;select pg_temp.capture_stale_net_skins(${jsonLiteral(completion)});commit`),
      ()=>sessions[1].query(`begin;${flush};commit`)];
     const order=iteration%2?[1,0]:[0,1],replies=await Promise.all(order.map(i=>jobs[i]()));
     const denied=JSON.parse(replies[order.indexOf(0)]),materialized=JSON.parse(replies[order.indexOf(1)]);
     assert.equal(denied.denied,true,JSON.stringify(denied));assert.match(denied.code,/PRODUCTION_NET_SKINS_(SOURCE_REVISION_CONFLICT|JOB_LEASE_REQUIRED)/);
     assert.equal(materialized.failed,0);assert.equal(materialized.processed,1);
     assert.equal(sql(c,d,`select count(*)from scoring_authority.net_skins_v1_result_revisions where job_id='${old.job_id}'`),'0');
     const current=jobState(c,d).filter(v=>v.round===1);assert.equal(current.length,1);assert.equal(current[0].source,currentSource);
     assert.equal(sql(c,d,"select count(*)from scoring_authority.score_derived_intents_v1 where last_sqlstate='40P01'"),'0');
     rows.push({scenario,iteration,startOrder:order,denial:denied.code,currentSourcePreserved:true,deadlocks:0,retries:0});
    }finally{await Promise.allSettled(sessions.map(s=>s.query('rollback')));await Promise.allSettled(sessions.map(s=>s.close()));}
   }
   return{rows,runs:8,deadlocks:0,oldResultsWritten:0,scope:'Actual owner-requested stale completion races current intent materialization; current financial result parity is separately proven by P2C-D-FINANCIAL.'};
  });
  await run('P2C-D-SCORING','held Net Skins ordered lock set does not prevent canonical scoring',async()=>{
   const d=clone('score_isolation');append(c,d,1,1);const s=openSqlSession(c,d);
   try{await s.query("set statement_timeout='5s';begin");assert.equal(JSON.parse(await s.query(flush)).processed,1);
    const input=inputFor(c,d,'2026-R2-1'),started=performance.now();
    const result=json(c,d,`begin;set local statement_timeout='1000ms';${rpcSql('submit_production_hole_score',input)};commit`);
    assert.equal(result.code,'ACCEPTED');assert.equal(canonicalState(c,d,input.match_id).holes.length,1);
    return{score:'ACCEPTED',scoreBudgetMs:1000,elapsedMs:performance.now()-started,workerLocksHeld:true};
   }finally{await s.query('rollback');await s.close();}
  });
 }finally{evidence.completedAt=new Date().toISOString();evidence.counts={pass:evidence.tests.filter(x=>x.result==='PASS').length,fail:evidence.tests.filter(x=>x.result!=='PASS').length};
  await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(evidence,null,2)+'\n');await destroyIsolatedCluster(c);}
});
