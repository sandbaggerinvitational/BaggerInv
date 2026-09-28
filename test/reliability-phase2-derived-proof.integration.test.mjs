// Proof layers: POSTGRESQL / FAILURE_INJECTION / CONCURRENCY.
// Candidate only, owned socket-only database, no external service.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir,writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createScoreProofFixture,cloneScoreProofDatabase,inputFor,rpc,rpcSql,canonicalState }
  from "./support/reliability/phase2-score-fixture.mjs";
import { sql,sqlResult,openSqlSession,destroyIsolatedCluster,repositoryRoot,jsonLiteral }
  from "./support/reliability/postgres17.mjs";
import { seedSyntheticSideGameHistory } from "./support/reliability/synthetic-history.mjs";

const migration="supabase/production_migrations/202609280121_score_derived_intents_v1.sql";
const score=(c,d,i)=>rpc(c,d,"submit_production_hole_score",i);
const flush=(c,d,f,n=8)=>JSON.parse(sql(c,d,
  `select production_control.flush_score_derived_intents_v1('2026','${f}',${n})`));
const intents=(c,d)=>JSON.parse(sql(c,d,`select coalesce(jsonb_agg(jsonb_build_object(
  'id',intent_id,'match',match_id,'family',family,'status',status,'attempts',attempts,
  'sqlstate',last_sqlstate,'revision',canonical_revision) order by match_id,family,created_at),'[]')
  from scoring_authority.score_derived_intents_v1`));
const artifact=process.env.BAGGER_PHASE2_DERIVED_OUTPUT;
let output;
if(artifact){output=path.resolve(repositoryRoot,artifact);assert.ok(output.startsWith(path.join(repositoryRoot,"docs/reliability/phase2")+path.sep));assert.match(output,/\.json$/);}

test("Phase2 durable derived intent behavioral proof",{timeout:600000},async t=>{
 const fixture=await createScoreProofFixture({candidateSql:migration}),c=fixture.cluster;
 // Production-shaped side-game history is synthetic and seeded with triggers off.
 seedSyntheticSideGameHistory(c,fixture.database,1);
 const evidence={schemaVersion:1,startedAt:new Date().toISOString(),...fixture.metadata,
   candidate:fixture.candidate,tests:[],limitations:[...fixture.metadata.limitations,
     "Private flush exercised as database owner; existing public worker claim hooks need separate runtime proof",
     "Queue/source materialization tested; this suite does not calculate/publish financial results"]};
 const run=async(id,title,body)=>t.test(`${id}: ${title}`,async()=>{
   const row={id,title,result:"FAIL",proofLayer:["POSTGRESQL","FAILURE_INJECTION"]},start=performance.now();
   try{row.details=await body();row.result="PASS";}catch(error){row.error=error.message;throw error;}
   finally{row.elapsedMs=performance.now()-start;evidence.tests.push(row);}
 });
 try{
  await run("P2-DERIVED-ATOMIC","required durable intent append failure rolls back score and receipt",()=>{
   const d=cloneScoreProofDatabase(fixture,"intent_atomic"),i=inputFor(c,d,"2026-R1-1"),before=canonicalState(c,d,i.match_id);
   sql(c,d,`create function public.phase2_intent_fault()returns trigger language plpgsql as $$begin raise exception 'PHASE2_INTENT_APPEND_FAULT';end$$;
    create trigger phase2_intent_fault after insert on scoring_authority.score_derived_intents_v1
    for each row execute function public.phase2_intent_fault();`,{role:""});
   const result=sqlResult(c,d,rpcSql("submit_production_hole_score",i));assert.notEqual(result.status,0);assert.match(result.stderr,/PHASE2_INTENT_APPEND_FAULT/);
   assert.deepEqual(canonicalState(c,d,i.match_id),before);assert.equal(intents(c,d).length,0);
   return {canonicalCommit:false,requiredIntent:false,receipt:false,appendFailure:"ATOMIC_ROLLBACK"};
  });
  await run("P2-DERIVED-COALESCE","one canonical transaction coalesces hole/match trigger intent per family",()=>{
   const d=cloneScoreProofDatabase(fixture,"intent_count"),i=inputFor(c,d,"2026-R1-1");
   assert.equal(score(c,d,i).code,"ACCEPTED");const rows=intents(c,d);
   assert.deepEqual(rows.map(r=>r.family).sort(),["CALCUTTA","COMPETITION","NET_SKINS"]);
   assert.ok(rows.every(r=>r.status==="PENDING"&&r.attempts===0));
   assert.equal(score(c,d,i).idempotent,true);assert.deepEqual(intents(c,d),rows);
   for(const family of ["CALCUTTA","NET_SKINS","COMPETITION"]){const r=flush(c,d,family);assert.equal(r.failed,0,JSON.stringify(r));assert.equal(r.processed,1);}
   assert.ok(intents(c,d).every(r=>r.status==="SUCCEEDED"));
   for(const family of ["CALCUTTA","NET_SKINS","COMPETITION"])assert.equal(flush(c,d,family).processed,0);
   return {intentCount:3,canonicalHoles:1,sameMutationAdditionalIntents:0,processed:3,repeatFlush:0};
  });
  for(const family of ["CALCUTTA","NET_SKINS","COMPETITION"])await run(`P2-DERIVED-FAIL-${family}`,`${family} unavailable leaves score Official and durable demand retryable`,()=>{
   const d=cloneScoreProofDatabase(fixture,`fail_${family.toLowerCase()}`),i=inputFor(c,d,"2026-R1-1");
   let original;
   if(family==="CALCUTTA"){
    original=sql(c,d,"select pg_get_functiondef('production_control.enqueue_production_calcutta_v1(text,text,boolean,text,text)'::regprocedure)");
    sql(c,d,`create or replace function production_control.enqueue_production_calcutta_v1(reason_value text,requested_by_value text,force_value boolean default false,request_fingerprint_value text default null,request_payload_hash_value text default null)
     returns jsonb language plpgsql security definer set search_path=pg_catalog as $$begin raise exception using errcode='P0001',message='PHASE2_CALCUTTA_UNAVAILABLE';end$$;`,{role:""});
   }else if(family==="NET_SKINS"){
    original=sql(c,d,"select pg_get_functiondef('production_control.enqueue_production_net_skins_v1_round(integer,text,text)'::regprocedure)");
    sql(c,d,`create or replace function production_control.enqueue_production_net_skins_v1_round(target_round_number integer,reason_value text,requested_by_value text)
     returns scoring_authority.net_skins_v1_recalculation_jobs language plpgsql security definer set search_path=pg_catalog as $$begin raise exception using errcode='P0001',message='PHASE2_SKINS_UNAVAILABLE';end$$;`,{role:""});
   }else{
    sql(c,d,`create function public.phase2_competition_fault()returns trigger language plpgsql as $$begin raise exception 'PHASE2_COMPETITION_UNAVAILABLE';end$$;
     create trigger phase2_competition_fault before insert or update on scoring_authority.competition_recalculation_jobs
     for each row execute function public.phase2_competition_fault();`,{role:""});
   }
   assert.equal(score(c,d,i).code,"ACCEPTED");
   const failed=flush(c,d,family);assert.equal(failed.failed,1);assert.equal(failed.processed,0);
   const row=intents(c,d).find(r=>r.family===family);assert.equal(row.status,"RETRYABLE");assert.equal(row.attempts,1);assert.equal(row.sqlstate,"P0001");
   const state=canonicalState(c,d,i.match_id);assert.equal(state.holes.length,1);assert.equal(state.receipts.length,1);
   if(original)sql(c,d,original,{role:""});else sql(c,d,"drop trigger phase2_competition_fault on scoring_authority.competition_recalculation_jobs;drop function public.phase2_competition_fault();",{role:""});
   // Clock advancement is fixture-only; production retry backoff is not changed.
   sql(c,d,`update scoring_authority.score_derived_intents_v1 set available_at=clock_timestamp()-interval '1 second' where family='${family}'`,{role:""});
   const retry=flush(c,d,family);assert.equal(retry.failed,0);assert.equal(retry.processed,1);
   assert.equal(intents(c,d).find(r=>r.family===family).status,"SUCCEEDED");
   assert.equal(canonicalState(c,d,i.match_id).holes.length,1);
   return {score:"ACCEPTED",failure:"RETRYABLE_P0001",retry:"SUCCEEDED",canonicalHoles:1};
  });
  for(const operation of ["LOCK","FINALIZE"])await run(`P2-DERIVED-STANDALONE-${operation}`,`standalone ${operation} retains synchronous derived failure and atomic rollback`,()=>{
   const observations=[];
   for(const family of ["CALCUTTA","NET_SKINS","COMPETITION"]){
    const d=cloneScoreProofDatabase(fixture,`standalone_${operation.toLowerCase()}_${family.toLowerCase()}`),matchId="2026-R1-1";
    // These are independent committed score requests, not score + control in
    // one transaction. Prior intents must not accidentally defer later control.
    if(operation==="FINALIZE")for(let hole=1;hole<=18;hole++){
     assert.equal(score(c,d,inputFor(c,d,matchId,hole)).code,"ACCEPTED");
    }
    const control=inputFor(c,d,matchId,1,{director:true,key:`standalone-${operation}-${family}`,
     ...(operation==="LOCK"?{operation:"SCORING_LOCK"}:{})});
    const before=canonicalState(c,d,matchId),queued=intents(c,d);
    if(family==="CALCUTTA"){
     sql(c,d,`create or replace function production_control.enqueue_production_calcutta_v1(reason_value text,requested_by_value text,force_value boolean default false,request_fingerprint_value text default null,request_payload_hash_value text default null)
      returns jsonb language plpgsql security definer set search_path=pg_catalog as $$begin raise exception using errcode='P0001',message='PHASE2_STANDALONE_CALCUTTA_FAILURE';end$$;`,{role:""});
    }else if(family==="NET_SKINS"){
     sql(c,d,`create or replace function production_control.enqueue_production_net_skins_v1_round(target_round_number integer,reason_value text,requested_by_value text)
      returns scoring_authority.net_skins_v1_recalculation_jobs language plpgsql security definer set search_path=pg_catalog as $$begin raise exception using errcode='P0001',message='PHASE2_STANDALONE_NET_SKINS_FAILURE';end$$;`,{role:""});
    }else{
     sql(c,d,`create function public.phase2_standalone_competition_fault()returns trigger language plpgsql as $$begin raise exception 'PHASE2_STANDALONE_COMPETITION_FAILURE';end$$;
      create trigger phase2_standalone_competition_fault before insert or update on scoring_authority.competition_recalculation_jobs
      for each row execute function public.phase2_standalone_competition_fault();`,{role:""});
    }
    const target=operation==="LOCK"?"mutate_production_match_control":"finalize_production_match";
    const failure=sqlResult(c,d,rpcSql(target,control));
    assert.notEqual(failure.status,0,"Standalone control must still execute original synchronous hook");
    assert.match(failure.stderr,new RegExp(`PHASE2_STANDALONE_${family}_FAILURE`));
    assert.deepEqual(canonicalState(c,d,matchId),before,"Failed standalone control must roll back all canonical changes");
    assert.deepEqual(intents(c,d),queued,"A prior transaction's intents must not turn standalone control into deferred work");
    observations.push({family,standaloneOperation:operation,derivedFailureCanAbort:true,
     canonicalChange:false,newIntent:false,semantics:"UNCHANGED_SYNCHRONOUS_NON_SCORE_PATH"});
   }
   return {scope:"SCORE_ONLY_DEFERRAL_NOT_ROUND_CONTROL_ISOLATION",observations};
  });
  await run("P2-DERIVED-BACKLOG","432 pending intents do not block canonical writes; bounded batches catch up",()=>{
   const d=cloneScoreProofDatabase(fixture,"backlog"),times=[];
   // 144 genuine committed canonical holes, not synthetic queue inserts.
   for(const round of [1,2])for(let n=1;n<=4;n++)for(let h=1;h<=18;h++){
    const i=inputFor(c,d,`2026-R${round}-${n}`,h),start=performance.now();assert.equal(score(c,d,i).code,"ACCEPTED");times.push(performance.now()-start);
   }
   const queued=intents(c,d);assert.equal(queued.length,432);assert.ok(queued.every(r=>r.status==="PENDING"));
   let processed=0,batches=0;const workerStarted=performance.now();
   for(const family of ["CALCUTTA","NET_SKINS","COMPETITION"]){
    let result;
    do{result=flush(c,d,family);assert.equal(result.failed,0,JSON.stringify(result));assert.ok(result.processed<=8);processed+=result.processed;batches++;}while(result.processed);
   }
   assert.equal(processed,432);assert.ok(intents(c,d).every(r=>r.status==="SUCCEEDED"));
   const holes=Number(sql(c,d,"select count(*) from scoring_authority.hole_scores where match_id like '2026-%'"));assert.equal(holes,144);
   times.sort((a,b)=>a-b);return {canonicalHoles:144,pendingBefore:432,processed,batches,pendingAfter:0,
     localPsqlProcessPerScore:{p50:times[71],p95:times[136],p99:null,max:times.at(-1)},
     workerDurationMs:performance.now()-workerStarted,publicationsCreated:false};
  });
  await run("P2-DERIVED-BURST","12 independent Singles matches commit concurrently with configured history",async()=>{
   const d=cloneScoreProofDatabase(fixture,"burst"),inputs=Array.from({length:12},(_,n)=>inputFor(c,d,`2026-R3-${n+1}`,1));
   const sessions=inputs.map(()=>openSqlSession(c,d));const began=performance.now();
   try{
    const values=await Promise.all(inputs.map((i,n)=>sessions[n].query(rpcSql("submit_production_hole_score",i)).then(JSON.parse)));
    assert.ok(values.every(r=>r.code==="ACCEPTED"),JSON.stringify(values));
    assert.equal(Number(sql(c,d,"select count(*) from scoring_authority.hole_scores")),12);
    return {requests:12,success:12,failures:0,deadlocks:0,elapsedMs:performance.now()-began,
      connectionModel:"12_REAL_POSTGRESQL_CONNECTIONS",history:"SYNTHETIC_1X_CALCUTTA_SKINS_ODDS"};
   }finally{await Promise.allSettled(sessions.map(s=>s.close()));}
  });
  await run("P2-DERIVED-WORKER-RACE","scoring continues while a derived worker holds shared competition markers",async()=>{
   const d=cloneScoreProofDatabase(fixture,"worker_race");assert.equal(score(c,d,inputFor(c,d,"2026-R1-1")).code,"ACCEPTED");
   const worker=openSqlSession(c,d),scorer=openSqlSession(c,d);
   try{
    await worker.query("begin");const drained=JSON.parse(await worker.query("select production_control.flush_score_derived_intents_v1('2026','COMPETITION',8)"));assert.equal(drained.processed,1);
    const next=inputFor(c,d,"2026-R1-2");const result=JSON.parse(await scorer.query(`set statement_timeout='2s';${rpcSql("submit_production_hole_score",next)}`));assert.equal(result.code,"ACCEPTED");
    await worker.query("commit");assert.equal(canonicalState(c,d,next.match_id).holes.length,1);
    return {worker:"HOLDS_COMPETITION_MARKERS_UNCOMMITTED",score:"COMMITTED_BEFORE_WORKER",timeoutMs:2000,canonicalHoles:2};
   }finally{await Promise.resolve().then(()=>worker.query("rollback")).catch(()=>{});await Promise.allSettled([worker.close(),scorer.close()]);}
  });
  await run("P2-DERIVED-ORDER","older financial demand observes latest canonical source instead of publishing obsolete result",()=>{
   const d=cloneScoreProofDatabase(fixture,"ordering");score(c,d,inputFor(c,d,"2026-R1-1",1));
   const old=intents(c,d).find(r=>r.family==="CALCUTTA").id;
   sql(c,d,`update scoring_authority.score_derived_intents_v1 set available_at=clock_timestamp()+interval '1 hour' where intent_id=(${jsonLiteral(old)}#>>'{}')::uuid`,{role:""});
   score(c,d,inputFor(c,d,"2026-R1-1",2));assert.equal(flush(c,d,"CALCUTTA").processed,1);
   const currentBefore=sql(c,d,"select jsonb_build_object('results',count(*),'maximumRevision',max(result_revision))from scoring_authority.calcutta_v1_result_revisions");
   const jobsBefore=sql(c,d,"select count(*)from scoring_authority.calcutta_v1_recalculation_jobs where status in('PENDING','RUNNING')");
   sql(c,d,`update scoring_authority.score_derived_intents_v1 set available_at=clock_timestamp()-interval '1 second' where intent_id=(${jsonLiteral(old)}#>>'{}')::uuid`,{role:""});
   const replay=flush(c,d,"CALCUTTA");assert.equal(replay.processed,1);assert.equal(replay.failed,0);
   assert.equal(sql(c,d,"select jsonb_build_object('results',count(*),'maximumRevision',max(result_revision))from scoring_authority.calcutta_v1_result_revisions"),currentBefore);
   assert.equal(sql(c,d,"select count(*)from scoring_authority.calcutta_v1_recalculation_jobs where status in('PENDING','RUNNING')"),jobsBefore);
   return {newerThenOlder:"PROCESSED_CURRENT_SOURCE",newResult:false,activeJobCountChanged:false};
  });
  await run("P2-DERIVED-DEAD-LETTER","bounded repeated consumer failure becomes visible dead letter without changing score",()=>{
   const d=cloneScoreProofDatabase(fixture,"dead_letter"),i=inputFor(c,d,"2026-R1-1");
   sql(c,d,`create or replace function production_control.enqueue_production_calcutta_v1(reason_value text,requested_by_value text,force_value boolean default false,request_fingerprint_value text default null,request_payload_hash_value text default null)
     returns jsonb language plpgsql security definer set search_path=pg_catalog as $$begin raise exception using errcode='P0001',message='PHASE2_PERSISTENT_FAILURE';end$$;`,{role:""});
   assert.equal(score(c,d,i).code,"ACCEPTED");
   for(let attempt=1;attempt<=5;attempt++){
    const failed=flush(c,d,"CALCUTTA");assert.equal(failed.failed,1);
    const row=intents(c,d).find(r=>r.family==="CALCUTTA");assert.equal(row.attempts,attempt);
    assert.equal(row.status,attempt===5?"DEAD_LETTER":"RETRYABLE");
    sql(c,d,"update scoring_authority.score_derived_intents_v1 set available_at=clock_timestamp()-interval '1 second' where family='CALCUTTA'",{role:""});
   }
   assert.equal(flush(c,d,"CALCUTTA").processed,0);
   assert.equal(sql(c,d,"select production_control.score_derived_intents_pending_v1('2026')"),"t");
   assert.equal(canonicalState(c,d,i.match_id).holes.length,1);
   return {attempts:5,status:"DEAD_LETTER",closeFencePending:true,automaticInfiniteRetry:false,canonicalHoles:1};
  });
  await run("P2-DERIVED-TIMEOUT","57014 aborts worker transaction while prior canonical score remains committed",()=>{
   const d=cloneScoreProofDatabase(fixture,"worker_timeout"),i=inputFor(c,d,"2026-R1-1");
   assert.equal(score(c,d,i).code,"ACCEPTED");const before=intents(c,d);
   sql(c,d,`create or replace function production_control.enqueue_production_calcutta_v1(reason_value text,requested_by_value text,force_value boolean default false,request_fingerprint_value text default null,request_payload_hash_value text default null)
     returns jsonb language plpgsql security definer set search_path=pg_catalog as $$begin perform pg_sleep(1);return '{}'::jsonb;end$$;`,{role:""});
   const failure=sqlResult(c,d,"\\set VERBOSITY verbose\nset statement_timeout='100ms';select production_control.flush_score_derived_intents_v1('2026','CALCUTTA',8)");
   assert.notEqual(failure.status,0);assert.match(failure.stderr,/57014/);assert.deepEqual(intents(c,d),before);
   assert.equal(canonicalState(c,d,i.match_id).holes.length,1);
   return {sqlstate:"57014",workerTransaction:"ROLLED_BACK",intent:"PENDING_REPLAYABLE",canonicalScore:"COMMITTED"};
  });
  await run("P2-DERIVED-ACL","intent table and private helpers inaccessible to application/client roles",()=>{
   const d=cloneScoreProofDatabase(fixture,"intent_acl");
   const roleDenials=[];
   for(const role of ["anon","authenticated","service_role"]){
    assert.equal(sql(c,d,`select has_table_privilege('${role}','scoring_authority.score_derived_intents_v1','SELECT,INSERT,UPDATE,DELETE')`),"f");
    assert.equal(sql(c,d,`select has_function_privilege('${role}','production_control.flush_score_derived_intents_v1(text,text,integer)','execute')`),"f");
    for(const [operation,statement] of [
     ["SELECT_INTENT_TABLE","select * from scoring_authority.score_derived_intents_v1 limit 1"],
     ["INVOKE_PRIVATE_FLUSH","select production_control.flush_score_derived_intents_v1('2026','COMPETITION',1)"],
    ]){
     // SET ROLE exercises the real PostgreSQL grant boundary. JWT claim GUCs
     // alone do not stop a database-owner connection bypassing permissions.
     const denied=sqlResult(c,d,`\\set VERBOSITY verbose\nbegin;set local role ${role};${statement};rollback;`);
     assert.notEqual(denied.status,0,`${role} ${operation} must be denied by PostgreSQL`);
     assert.match(denied.stderr,/42501/,`${role} ${operation} must report insufficient_privilege`);
     roleDenials.push({role,operation,sqlstate:"42501",result:"DENIED"});
    }
   }
   assert.equal(sql(c,d,"select relrowsecurity from pg_class where oid='scoring_authority.score_derived_intents_v1'::regclass"),"t");
   for(const maximum of [0,9])assert.notEqual(sqlResult(c,d,`select production_control.flush_score_derived_intents_v1('2026','COMPETITION',${maximum})`).status,0);
   return {RLS:true,RLSProof:"ENABLED_FLAG_ONLY_NOT_FULL_ROW_POLICY_MATRIX",catalogAndRealRoleDenial:true,
    roleAccess:"DENIED",roleDenials,invalidBatchLimit:"REJECTED",maximumBatch:8};
  });
 }finally{
  evidence.completedAt=new Date().toISOString();evidence.counts={pass:evidence.tests.filter(r=>r.result==="PASS").length,fail:evidence.tests.filter(r=>r.result!=="PASS").length};
  if(output){await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(evidence,null,2)+"\n");}
  await destroyIsolatedCluster(c);
 }
});
