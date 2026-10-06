// Real PostgreSQL 17 + pg-safeupdate. Synthetic credentials; owned sockets only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createGlobalFaultFixture} from './support/reliability/certification-global-fault-fixture.mjs';
import {consumeProcess} from './support/reliability/certification-global-fault-process.mjs';
import {destroyIsolatedCluster,sqlFile,sqlResult,jsonLiteral,repositoryRoot,restartIsolatedCluster,openSqlSession} from './support/reliability/postgres17.mjs';
import {demandCheckpointSink} from './support/reliability/certification-demand-checkpoint.mjs';
import {createCertificationWorkerDemand} from '../tools/reliability/certification-worker-demand.mjs';
import {createCertificationWorkerSourceDemand,planCertificationWorkerSourceDemand} from '../tools/reliability/certification-worker-source-demand.mjs';
import {certificationWorkerRpc} from '../lib/certification-worker-adapter.js';
import {certificationOperationRpc} from '../lib/certification-runtime-server.js';
import {createCurrentScoreDerivedDeliveryAdapter} from '../lib/score-derived-delivery.js';
import {fixtureIdentities} from '../tools/reliability/certification-part2a-fixture.mjs';
import {loadIntelligenceCanonicalInputs,calculateIntelligenceDerivedFromData} from '../lib/intelligence-derived-supabase.js';

const engines=['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL'];
const artifact=repositoryRoot+'/supabase/production_incremental/certification-derived-attempt-cycle-v1.sql';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('per-cycle derived attempts: duplicate demand, terminal recovery, genuine source and concurrency',async t=>{
 let f;const evidence={hosted:false,environment:'POSTGRESQL17_PG_SAFEUPDATE_OWNED_SOCKET',cases:[]};
 const check=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){error=e;throw e;}});if(error)throw error;};
 try{
  f=await createGlobalFaultFixture({emptyAuction:true});
  for(const name of ['certification-queue-retry-envelope-v6.sql','certification-queue-routing-closure-v7.sql'])
   sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/'+name,{role:''});
  const source=await readFile(artifact,'utf8'),manifest=JSON.parse(source.split('$manifest$')[1]),patch=manifest[0];
  const metadata=()=>f.q(`select jsonb_build_object('owner',proowner,'acl',proacl,'security',prosecdef,'config',proconfig)
   from pg_proc where oid='${patch.signature}'::regprocedure`);
  const beforeMetadata=metadata(),oldDefinitions=manifest.map(p=>f.q(`select pg_get_functiondef('${p.signature}'::regprocedure)`)).join(';\n');
  const historyBefore=f.q('select to_jsonb(t)from production_control.worker_supervisor_routing_closure_installation_v7 t');
  const jobs=()=>engines.map(e=>f.job(e)),state=()=>f.q(`select jsonb_agg(to_jsonb(j)order by engine_key)from scoring_authority.competition_recalculation_jobs j`);
  const attemptHistory=()=>JSON.parse(f.q('select coalesce(jsonb_agg(to_jsonb(a)order by event_id),\'[]\')from production_control.score_derived_delivery_attempts_v1 a'));
  const financial=()=>f.q(`select jsonb_build_object('auction',(select to_jsonb(c)from scoring_authority.calcutta_v1_current c),
   'facts',(select count(*)from scoring_authority.calcutta_v1_auction_fact_revisions),'jobs',(select count(*)from scoring_authority.calcutta_v1_recalculation_jobs),
   'scores',(select count(*)from scoring_authority.hole_scores),'odds',(select count(*)from scoring_authority.odds_published_snapshots))`);
  let facts=financial();
  let options={env:f.env,dependencies:f.dependencies,onCheckpoint:demandCheckpointSink(f.cluster)};
  let workerOptions={env:f.env,certificationDependencies:f.dependencies};
  const rpc=async(name,input)=>(await certificationWorkerRpc(name,{tournament_id:'2026',worker_id:'owned-attempt-proof',requested_by:'owned-attempt-proof',lease_seconds:90,...input},workerOptions)).payload;
  const claim=async()=>{
   const c=await rpc('claim_competition_derived_jobs',{engine_keys:engines.slice(0,2)});
   const i=await rpc('claim_intelligence_derived_bundle',{engine_keys:engines.slice(2)});
   assert.equal(c.ok,true,JSON.stringify(c));assert.equal(i.ok,true,JSON.stringify(i));assert.equal(c.claims.length,2);assert.notEqual(i.empty,true);
   return {c,i};
  };
  const fail=async({c,i},code)=>{
   for(const v of c.claims)assert.equal((await rpc('mark_competition_derived_job_failed',{
    engine_key:v.engine_key,claim_started_at:v.claim_started_at,error_code:code})).ok,true);
   assert.equal((await rpc('fail_intelligence_derived_bundle_v1',{contract_version:'score-derived-delivery-v1',
    claim_started_at:i.claim_started_at,claim_token:i.claim_token,error_code:code})).ok,true);
  };
  const recover=async(engine)=>{
   const j=f.job(engine),id=randomUUID();
   const r=await certificationOperationRpc('DIRECTOR.REQUEUE_DERIVED',{contract_version:'score-derived-delivery-v1',
    tournament_id:'2026',family:engines.indexOf(engine)<2?'COMPETITION':'INTELLIGENCE',work_identity:'2026:0:'+engine,
    request_id:id,expected_cycle:j.delivery_cycle,expected_attempt:j.delivery_attempts,
    reason:'Owned fixed synthetic cause corrected; retain terminal history'},
    {env:f.env,authorization:f.authorization,operationRequestId:id},f.dependencies);
   assert.equal(r.payload.ok,true,JSON.stringify(r.payload));return r;
  };
  const enqueueSql=engine=>{const d=f.job(engine).requested_source_revision;return `select scoring_authority.enqueue_competition_derived_job(
   '2026','${engine}',${jsonLiteral(d.reason)}#>>'{}',${jsonLiteral(d.revision)})`;};
  const waitDue=async()=>{const remaining=Math.max(...jobs().map(j=>Date.parse(j.delivery_available_at)-Date.now()));if(remaining>0)await delay(remaining+100);};
  const adapter=()=>createCurrentScoreDerivedDeliveryAdapter({env:f.env,certificationDependencies:f.dependencies});
  const tick=async()=>{const a=await adapter();return a.tick({workerId:'owned-attempt-proof',operationId:randomUUID()});};
  const drain=async()=>{const a=await adapter(),r=await a.tick({workerId:'owned-attempt-proof',operationId:randomUUID()});
   for(const family of ['COMPETITION','INTELLIGENCE'])if(r.ready[family])await a.processors[family]({workerId:'owned-attempt-proof',tickResult:r,operationId:randomUUID()});};
  let lastSetupInput;
  const duplicate=async()=>{const base=f.dependencies.fetchImpl;try{
   f.dependencies.fetchImpl=async(url,init)=>{const i=JSON.parse(init.body).input;
    if(new URL(url).pathname.endsWith('/execute_certification_operation_v1')&&i.operation_id==='DIRECTOR.MUTATE_SETUP')lastSetupInput=i;
    return base(url,init);};
   assert.equal((await createCertificationWorkerDemand(options)).ok,true);
  }finally{f.dependencies.fetchImpl=base;}};
  const stranded=()=>Number(f.q(`select count(*)from scoring_authority.competition_recalculation_jobs
   where engine_key<>'TOURNAMENT_FINAL_RECAP'and status='PENDING'and(delivery_attempts>=5 or delivery_dead_letter_at is not null)`));

  await check('forward correction: atomic mismatch rollback, exact predecessor, replay and metadata/history preserved',()=>{
   const bad=source.replace(patch.new_hash,'0'.repeat(64));const r=sqlResult(f.cluster,f.database,bad,{role:''});
   assert.notEqual(r.status,0);assert.match(r.stderr,/PATCH_HASH_DRIFT/);
   assert.equal(f.q("select to_regclass('production_control.derived_attempt_cycle_installation_v1')is null"),'t');
   assert.equal(metadata(),beforeMetadata);sqlFile(f.cluster,f.database,artifact,{role:''});
   const receipt=f.q('select to_jsonb(t)from production_control.derived_attempt_cycle_installation_v1 t');
   sqlFile(f.cluster,f.database,artifact,{role:''});assert.equal(f.q('select to_jsonb(t)from production_control.derived_attempt_cycle_installation_v1 t'),receipt);
   assert.equal(metadata(),beforeMetadata);assert.equal(f.q('select to_jsonb(t)from production_control.worker_supervisor_routing_closure_installation_v7 t'),historyBefore);
   assert.equal(f.q("select current_setting('safeupdate.enabled')"),'on');
   assert.match(sqlResult(f.cluster,f.database,'update production_control.worker_supervisor_v1 set reason=reason',{role:''}).stderr,/UPDATE requires a WHERE clause/);
  });
  f.toggle(true);await duplicate();
  await check('cycle 29 fixture is built by real canonical failures/recoveries, without job inserts or attempt resets',async()=>{
   for(let n=1;n<29;n++){await fail(await claim(),'OWNED_FIXED_TERMINAL');for(const e of engines)await recover(e);}
   assert.ok(jobs().every(j=>j.delivery_cycle===29&&j.delivery_attempts===0&&j.status==='PENDING'));
   assert.equal(attemptHistory().filter(e=>e.transition==='DEAD_LETTER').length,28*4);
   assert.equal(attemptHistory().filter(e=>e.transition==='REQUEUED').length,28*4);
  });
  await check('attempt 1 through 4 obey real durable backoff; duplicate enqueue/poll/restart never replenish budget',async()=>{
   for(let attempt=1;attempt<=4;attempt++){
    await waitDue();await fail(await claim(),'40001');
    const before=state(),history=attemptHistory();
    assert.ok(jobs().every(j=>j.delivery_attempts===attempt&&j.status==='PENDING'&&j.delivery_available_at>j.updated_at));
    await duplicate();await duplicate();assert.equal(state(),before);assert.deepEqual(attemptHistory(),history);
    if(attempt===4){const sessions=[openSqlSession(f.cluster,f.database),openSqlSession(f.cluster,f.database)];
     try{const sql=enqueueSql('TOURNAMENT_INTELLIGENCE');await Promise.all(sessions.map(s=>s.query(sql)));}
     finally{await Promise.all(sessions.map(s=>s.close()));}
     assert.equal(state(),before);assert.deepEqual(attemptHistory(),history);}
    for(let n=0;n<3;n++){const r=await tick();assert.equal(r.ready.COMPETITION,false);assert.equal(r.ready.INTELLIGENCE,false);}
    assert.equal(state(),before);restartIsolatedCluster(f.cluster);assert.equal(state(),before);
   }
  });
  await waitDue();
  await check('unchanged private consumer and existing worker produce cycle 29 attempt 5 success/current for all four families',async()=>{
   f.start({budget:1});const e=f.batch().messages[0];await f.due(e);const r=await f.consume(e);
   assert.equal(r.outcome,'SUCCEEDED');assert.equal(r.cycles,1);f.stop();
   assert.ok(jobs().every(j=>j.status==='SUCCEEDED'&&j.delivery_cycle===29&&j.delivery_attempts===5));
   assert.equal(f.status().counts.pending_work,0);assert.equal(stranded(),0);
  });
  const successState=state(),successHistory=attemptHistory();
  await check('exact predecessor reproduces stranded Intelligence cycle29/attempt5 inside a rollback-only transaction',()=>{
   const r=JSON.parse(f.q(`begin;${oldDefinitions};
    update scoring_authority.competition_recalculation_jobs set requested_source_revision=requested_source_revision-'priorRevision'where round_number=0;
    set local "request.jwt.claim.role"='service_role';select production_control.push_certification_context_v1(${jsonLiteral(lastSetupInput)},'DIRECTOR',true);
    update scoring_authority.matches set match_revision=match_revision,updated_at=clock_timestamp()where match_id='2026-R3-11';
    select jsonb_agg(jsonb_build_object('engine',engine_key,'status',status,'cycle',delivery_cycle,'attempt',delivery_attempts))
    from scoring_authority.competition_recalculation_jobs where engine_key<>'TOURNAMENT_FINAL_RECAP';rollback;`).split('\n').at(-1));
   assert.ok(r.filter(j=>engines.indexOf(j.engine)>=2).every(j=>j.status==='PENDING'&&j.cycle===29&&j.attempt===5),JSON.stringify(r));evidence.oldBehavior=r;
   assert.equal(state(),successState);assert.deepEqual(attemptHistory(),successHistory);
  });
  await check('same-source successful repeated enqueue is exact no-op; current outputs and attempt evidence retained',async()=>{
   for(let n=0;n<4;n++)await duplicate();assert.equal(state(),successState);assert.deepEqual(attemptHistory(),successHistory);
   assert.equal(stranded(),0);assert.equal(f.status().counts.pending_work,0);
   for(const e of engines)assert.equal(f.q(`select count(*)from scoring_authority.competition_derived_snapshots where engine_key='${e}'and is_current`),'1');
  });
  await check('independent real consumer processes preserve attempt5 success across worker runtime restart',async()=>{
   f.start({budget:2});
   for(const entry of f.batch().messages){const r=await consumeProcess(f,entry);
    assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.result.outcome,'SUCCEEDED');assert.equal(r.result.cycles,1);
    assert.equal(state(),successState);assert.deepEqual(attemptHistory(),successHistory);}
   f.stop();assert.equal(stranded(),0);
  });
  await check('legacy successful output-fingerprint marker remains satisfied at attempt5; missing source history never grants budget',()=>{
   // Model only the pre-correction Competition completion representation using
   // actual current snapshots. This entire compatibility probe rolls back; no
   // attempt, cycle, historical failure or hosted row is reset or rewritten.
   const lines=f.q(`begin;
    update scoring_authority.competition_recalculation_jobs j set requested_source_revision=jsonb_build_object(
     'sourceFingerprint',s.source_fingerprint,'configurationFingerprint',s.configuration_fingerprint,'payloadHash',s.payload_hash)
    from scoring_authority.competition_derived_snapshots s where j.tournament_id=s.tournament_id and j.round_number=s.round_number
     and j.engine_key=s.engine_key and s.is_current and j.engine_key in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES');
    select jsonb_agg(to_jsonb(j)order by engine_key)from scoring_authority.competition_recalculation_jobs j;
    set local "request.jwt.claim.role"='service_role';select production_control.push_certification_context_v1(${jsonLiteral(lastSetupInput)},'DIRECTOR',true);
    update scoring_authority.matches set match_revision=match_revision,updated_at=clock_timestamp()where match_id='2026-R3-11';
    select jsonb_agg(to_jsonb(j)order by engine_key)from scoring_authority.competition_recalculation_jobs j;rollback;`).split('\n');
   assert.equal(lines[0],lines.at(-1));assert.equal(state(),successState);assert.deepEqual(attemptHistory(),successHistory);
  });
  await check('concurrent identical common enqueue is idempotent and cannot manufacture cycles/budgets',async()=>{
   // Both actual private enqueue calls use the SAME canonical demand identity.
   // The transactional producer path was proved above; here the helper's own
   // existing request format is exercised under independent SQL sessions.
   const sessions=[openSqlSession(f.cluster,f.database),openSqlSession(f.cluster,f.database)];
   try{
    const j=f.job('TOURNAMENT_INTELLIGENCE'),d=j.requested_source_revision;
    const command=`select scoring_authority.enqueue_competition_derived_job('2026','TOURNAMENT_INTELLIGENCE',${jsonLiteral(d.reason)}#>>'{}',${jsonLiteral(d.revision)})`;
    // Producer and helper provenance differences cannot replenish attempts.
    const before=state();
    await Promise.all(sessions.map(s=>s.query(command)));assert.equal(state(),before);assert.equal(stranded(),0);
   }finally{await Promise.all(sessions.map(s=>s.close()));}
   await duplicate();assert.equal(state(),successState);
  });
  evidence.succeededCycle29={jobs:jobs(),history:attemptHistory()};
  // A separate owned fixture exercises failures/recovery. No previous history
  // is reset or relabeled to set up this case; each fixture's ledger is saved.
  await destroyIsolatedCluster(f.cluster);f=null;
  f=await createGlobalFaultFixture({emptyAuction:true});
  for(const name of ['certification-queue-retry-envelope-v6.sql','certification-queue-routing-closure-v7.sql','certification-derived-attempt-cycle-v1.sql'])
   sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/'+name,{role:''});
  facts=financial();options={env:f.env,dependencies:f.dependencies,onCheckpoint:demandCheckpointSink(f.cluster)};
  workerOptions={env:f.env,certificationDependencies:f.dependencies};f.toggle(true);await duplicate();
  await check('attempt5 FAILED remains terminal on ordinary duplicate; Director recovery is a separate auditable cycle',async()=>{
   for(let n=1;n<=5;n++){await waitDue();await fail(await claim(),'40001');}
   assert.ok(jobs().every(j=>j.status==='FAILED'&&j.delivery_attempts===5&&j.delivery_dead_letter_at));
   const terminal=state(),history=attemptHistory();
   for(const e of engines){const d=f.job(e).requested_source_revision;f.q(`select scoring_authority.enqueue_competition_derived_job('2026','${e}',${jsonLiteral(d.reason)}#>>'{}',${jsonLiteral(d.revision)})`);}
   assert.equal(state(),terminal);assert.deepEqual(attemptHistory(),history);
   const before=jobs();
   const sessions=[openSqlSession(f.cluster,f.database),openSqlSession(f.cluster,f.database)],fetchBase=f.dependencies.fetchImpl;
   try{
    f.dependencies.fetchImpl=async(url,init)=>{
     const input=JSON.parse(init.body).input;
     if(input.operation_id!=='DIRECTOR.REQUEUE_DERIVED')return fetchBase(url,init);
     // Independent SQL sessions contend on the real row lock; the committed
     // canonical owner operation keeps its existing context/actor checks.
     const value=await sessions[0].query(`begin;set local role service_role;select public.execute_certification_operation_v1(${jsonLiteral(input)});select pg_sleep(0.1);commit`);
     return Response.json(JSON.parse(value.trim()));
    };
    for(const e of engines){const sql=enqueueSql(e);await Promise.all([recover(e),sessions[1].query(sql)]);}
   }finally{f.dependencies.fetchImpl=fetchBase;await Promise.all(sessions.map(s=>s.close()));}
   assert.ok(jobs().every(j=>j.status==='PENDING'&&j.delivery_attempts===0&&j.delivery_cycle===before.find(b=>b.engine_key===j.engine_key).delivery_cycle+1));
   assert.deepEqual(attemptHistory().slice(0,history.length),history);
  });
  await check('claim/enqueue simultaneous transactions retain one owner and lawful attempt budget',async()=>{
   const sessions=[openSqlSession(f.cluster,f.database),openSqlSession(f.cluster,f.database)],fetchBase=f.dependencies.fetchImpl;
   let result;try{
    f.dependencies.fetchImpl=async(url,init)=>{
     const input=JSON.parse(init.body).input;
     if(input.operation_id!=='WORKERS.COMPETITION_CLAIM')return fetchBase(url,init);
     const value=await sessions[0].query(`begin;set local role service_role;select public.execute_certification_operation_v1(${jsonLiteral(input)});select pg_sleep(0.1);commit`);
     return Response.json(JSON.parse(value.trim()));
    };
    const sql=enqueueSql('TEAM_MOMENTUM');[result]=await Promise.all([rpc('claim_competition_derived_jobs',{engine_keys:['TEAM_MOMENTUM']}),sessions[1].query(sql)]);
   }finally{f.dependencies.fetchImpl=fetchBase;await Promise.all(sessions.map(s=>s.close()));}
   if(result.claims.length===0)result=await rpc('claim_competition_derived_jobs',{engine_keys:['TEAM_MOMENTUM']});
   assert.equal(result.claims.length,1);assert.equal(f.job('TEAM_MOMENTUM').delivery_attempts,1);
   assert.equal((await rpc('claim_competition_derived_jobs',{engine_keys:['TEAM_MOMENTUM']})).claims.length,0);
   assert.equal((await rpc('mark_competition_derived_job_failed',{engine_key:'TEAM_MOMENTUM',claim_started_at:result.claims[0].claim_started_at,error_code:'40001'})).ok,true);
   await waitDue();assert.equal(stranded(),0);
  });
  await check('duplicate while canonical claim is active preserves claim/lease and retry attempt exactly',async()=>{
   const held=await claim(),before=state(),history=attemptHistory();
   for(const e of engines){const d=f.job(e).requested_source_revision;f.q(`select scoring_authority.enqueue_competition_derived_job('2026','${e}',${jsonLiteral(d.reason)}#>>'{}',${jsonLiteral(d.revision)})`);}
   assert.equal(state(),before);assert.deepEqual(attemptHistory(),history);
   // Keep this old claim for the genuine source supersession case.
   f.oldClaim=held;
   f.oldIntelligence=calculateIntelligenceDerivedFromData(await loadIntelligenceCanonicalInputs('2026',{
    env:f.env,certificationDependencies:f.dependencies}));
  });
  await check('supported secondary scoring-lock advances actual source with empty auction2, no preparation or financial mutation',async()=>{
   const before=jobs(),history=attemptHistory(),plan=await planCertificationWorkerSourceDemand(options);
   const n=f.calls.length,r=await createCertificationWorkerSourceDemand({...options,checkpoint:plan});
   assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.canonical_outcome,'COMMITTED');assert.equal(r.result.match_revision,plan.match_revision+1);
   assert.ok(jobs().every(j=>j.status==='PENDING'&&j.delivery_attempts===0&&j.delivery_cycle===before.find(b=>b.engine_key===j.engine_key).delivery_cycle+1));
   assert.deepEqual(attemptHistory().slice(0,history.length),history);assert.equal(attemptHistory().filter(a=>a.safe_code==='CANONICAL_SOURCE_ADVANCED').length,4);
   assert.equal(f.q("select status||':'||match_revision from scoring_authority.matches where match_id='2026-R3-11'"),'UPCOMING:1');
   assert.equal(f.q("select count(*)from scoring_authority.scoring_permissions where match_id='2026-R3-11'and can_score"),'0');
   assert.equal(financial(),facts);assert.equal(f.q('select auction_revision from scoring_authority.calcutta_v1_current'),'2');
   assert.equal(f.calls.slice(n).filter(c=>c.operation?.startsWith('WORKERS.')).length,0);
   const after=state();assert.equal((await createCertificationWorkerSourceDemand({...options,checkpoint:r.checkpoint})).ok,true);assert.equal(state(),after);
   await assert.rejects(planCertificationWorkerSourceDemand(options),/UNLOCKED_FIXTURE_REQUIRED/);
   const noChange=await createCertificationWorkerSourceDemand({...options,checkpoint:{...r.checkpoint,
    operation_request_id:randomUUID(),match_revision:r.result.match_revision,permission_revision:r.result.permission_revision,state:'PLANNED'}});
   assert.equal(noChange.canonical_outcome,'COMMITTED');assert.equal(noChange.state,'NO_NEW_SOURCE');assert.equal(noChange.ok,false);assert.equal(state(),after);
   evidence.freshSource={operation:'DIRECTOR.MATCH_CONTROL/SCORING_LOCK',before:plan.match_revision,after:r.result.match_revision,scoringAccess:'REVOKED'};
  });
  await check('stale old ownership cannot complete or fail over the new source; new current output drains via unchanged worker',async()=>{
   const before=state();await fail(f.oldClaim,'40001');assert.equal(state(),before);
   // Real processors are exercised below; stale completion ownership predicates
   // are also checked before any new snapshot can be written.
   for(const c of f.oldClaim.c.claims){const r=await rpc('write_competition_derived_snapshot',{engine_key:c.engine_key,engine_version:'test-stale',
    configuration_fingerprint:'a'.repeat(64),source_fingerprint:'b'.repeat(64),payload_hash:'c'.repeat(64),result_payload:{},
    calculated_by:'owned-attempt-proof',claim_started_at:c.claim_started_at});assert.equal(r.ok,false,JSON.stringify(r));assert.equal(r.superseded,true);}
   const calc=f.oldIntelligence;let denied=false;
   try{const r=await rpc('write_intelligence_derived_bundle',{calculated_by:'owned-attempt-proof',claim_token:f.oldClaim.i.claim_token,
    source_fingerprint:calc.sourceFingerprint,dependency:calc.dependency,final_gate:calc.recap.gate,engines:[
     {key:engines[2],version:'tournament-intelligence-js-v1',result:calc.intelligence.result,payload_hash:calc.intelligence.payloadHash,claim_started_at:f.oldClaim.i.claim_started_at},
     {key:engines[3],version:'projection-editorial-js-v1',result:calc.editorial.result,payload_hash:calc.editorial.payloadHash,claim_started_at:f.oldClaim.i.claim_started_at}]});
    denied=r.ok===false;
   }catch(e){assert.match(e.code,/STALE|SOURCE|CONTEXT/);denied=true;}assert.equal(denied,true);
   assert.equal(state(),before);f.start({budget:1});const e=f.batch().messages[0];await f.due(e);assert.equal((await f.consume(e)).outcome,'SUCCEEDED');f.stop();
   assert.ok(jobs().every(j=>j.status==='SUCCEEDED'&&j.delivery_attempts===1));assert.equal(stranded(),0);
   for(const e of engines)assert.equal(f.q(`select count(*)from scoring_authority.competition_derived_snapshots where engine_key='${e}'and is_current`),'1');
  });
  await check('client/private authority, metadata/RLS and final empty-auction/FinalRecap boundaries remain closed',async()=>{
   for(const role of ['anon','authenticated','service_role']){
    for(const signature of [patch.signature,'scoring_authority.enqueue_competition_derived_job(text,text,text,jsonb)',
     'production_control.canonical_requeue_score_derived_delivery_v1_core_v2(jsonb,jsonb)'])assert.equal(f.q(`select has_function_privilege('${role}','${signature}','EXECUTE')`),'f');
    assert.equal(f.q(`select has_table_privilege('${role}','production_control.derived_attempt_cycle_installation_v1','SELECT')`),'f');
   }
   const before=state(),m=JSON.parse(f.q("select to_jsonb(m)from scoring_authority.matches m where match_id='2026-R3-11'"));
   for(const identity of [fixtureIdentities[1],fixtureIdentities[2]]){
    const id=randomUUID();await assert.rejects(certificationOperationRpc('DIRECTOR.MATCH_CONTROL',{
     action:'scoring-lock',match_id:m.match_id,expected_match_revision:m.match_revision,expected_permission_revision:m.permission_revision,mutation_key:id},
     {env:f.env,authorization:{...identity,tournament_id:'2026',match_id:m.match_id,match_revision:m.match_revision,permission_revision:m.permission_revision},operationRequestId:id},f.dependencies));
   }
   for(const changes of [{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},
    {BAGGER_CERTIFICATION_RESOURCE_ID:'PRODUCTION'},{SUPABASE_SCORING_MIRROR_URL:'https://foreign.supabase.co'},
    {VERCEL_DEPLOYMENT_ID:'dpl_Foreign'},{VERCEL_GIT_COMMIT_SHA:'a'.repeat(40)}])
    await assert.rejects(planCertificationWorkerSourceDemand({...options,env:{...f.env,...changes}}));
   assert.equal(state(),before);
   assert.equal(metadata(),beforeMetadata);assert.equal(financial(),facts);assert.equal(stranded(),0);
   assert.equal(f.q("select production_control.derived_final_recap_ready_v1('2026')"),'f');
   assert.equal(f.q('select count(*)from scoring_authority.google_outbox_events'),'0');
   f.toggle(false);assert.equal(f.status().state,'OFF');assert.equal(f.status().counts.pending_work,0);
   for(const key of ['active_claims','active_leases','dead_letters','expired_claims'])assert.equal(f.status().counts[key],0,key);
   evidence.finalJobs=jobs();evidence.recoveryHistory=attemptHistory();evidence.historyEvents=evidence.recoveryHistory.length;evidence.stranded=0;
  });
  await check('shared trigger remains compatible with a real supported financial job row, without changing financial transitions',async()=>{
   let g;
   try{
    g=await createGlobalFaultFixture({emptyAuction:true});
    for(const name of ['certification-queue-retry-envelope-v6.sql','certification-queue-routing-closure-v7.sql','certification-derived-attempt-cycle-v1.sql'])
     sqlFile(g.cluster,g.database,repositoryRoot+'/supabase/production_incremental/'+name,{role:''});
    g.toggle(true);
    const c=JSON.parse(g.q('select to_jsonb(c)from scoring_authority.calcutta_v1_current c'));
    const purchase=await certificationOperationRpc('DIRECTOR.REPLACE_CALCUTTA_AUCTION',{
     contract_version:'production-calcutta-v1',expected_configuration_revision:c.configuration_revision,
     expected_configuration_fingerprint:c.configuration_fingerprint,expected_auction_revision:c.auction_revision,
     expected_auction_fingerprint:c.auction_fingerprint,expected_publication_revision:c.publication_revision,
     action:'replace-auction',purchases:[{player_id:'P01',purchase_price:'1'}],
     ownership:[{player_id:'P01',owner_player_id:'P12',ownership_fraction:'1'}]},
     {env:g.env,authorization:g.authorization,operationRequestId:randomUUID()},g.dependencies);
    assert.equal(purchase.payload.ok,true);
    const change=await createCertificationWorkerSourceDemand({env:g.env,dependencies:g.dependencies,onCheckpoint:demandCheckpointSink(g.cluster)});
    assert.equal(change.ok,true);
    const rows=JSON.parse(g.q('select jsonb_agg(to_jsonb(j))from scoring_authority.calcutta_v1_recalculation_jobs j'));
    assert.equal(rows.length,1);assert.equal(Object.hasOwn(rows[0],'requested_source_revision'),false);
    assert.equal(g.q("select current_setting('safeupdate.enabled')"),'on');
    const before=g.q('select jsonb_agg(to_jsonb(j))from scoring_authority.calcutta_v1_recalculation_jobs j');
    const touched=g.q(`begin;update scoring_authority.calcutta_v1_recalculation_jobs set updated_at=updated_at
     where job_id='${rows[0].job_id}'returning job_id;rollback`);
    assert.equal(touched,rows[0].job_id);assert.equal(g.q('select jsonb_agg(to_jsonb(j))from scoring_authority.calcutta_v1_recalculation_jobs j'),before);
    evidence.financialCompatibility={family:'CALCUTTA',supportedSyntheticJob:true,rows:1,safeupdate:true,
     qualifiedRollbackOnlyNoop:true,unchanged:true,financialPayloadRecorded:false};
   }finally{if(g)await destroyIsolatedCluster(g.cluster);}
  });
 }finally{
  if(f)await destroyIsolatedCluster(f.cluster);
  const dir=repositoryRoot+'/docs/reliability/phase2d-derived-attempt-cycle/evidence';await mkdir(dir,{recursive:true});
  await writeFile(dir+'/integration.json',JSON.stringify(evidence,null,2)+'\n');
 }
});
