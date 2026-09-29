// Proof layers: POSTGRESQL / INTEGRATION / FAILURE_INJECTION.
// This suite executes installed worker bodies with explicit synthetic authority boundaries.
// It does not certify annual activation/admission; that requires the protected annual flow.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createScoreProofFixture,cloneScoreProofDatabase} from './support/reliability/phase2-score-fixture.mjs';
import {sql,sqlResult,sqlFile,jsonLiteral,repositoryRoot,destroyIsolatedCluster,createDatabase,createIsolatedCluster} from './support/reliability/postgres17.mjs';
import {installRelease139Schema,installCertifiedSqlRepairs,installRelease139FunctionCandidates} from './support/reliability/release139-schema.mjs';
import {configureFiniteTimeout,normalWorkerTimeoutMs} from './support/reliability/phase2c-install.mjs';
import {runAnnualWorkerBranchMatrix} from './support/reliability/phase2c-annual-worker-branches.mjs';
import {seedAnnualWorkerBoundary,seedAnnualCompetitionJobs,seedAnnualOddsCompletion,
  annualWorkerInput,annualWorkerGeneration,seedAnnualCalcuttaClaim,seedFutureGoogleCompatibility} from './support/reliability/phase2c-annual-workers.mjs';
const fullCandidate=process.env.BAGGER_PHASE2C_FULL==='1';
const migration122='supabase/production_migrations/202609280122_score_mutation_recovery_v1.sql';
const migration124='supabase/production_migrations/202609280124_score_derived_delivery_v1.sql';
const migrationPath='supabase/production_migrations/202609280123_annual_worker_sql_and_net_skins_locks_v1.sql';
const migration=await readFile(path.join(repositoryRoot,migrationPath),'utf8');
const signatures=[...migration.matchAll(/\('([^']+\(jsonb\))', '[a-f0-9]{64}', '[a-f0-9]{64}'\)/g)].map(x=>x[1]);
assert.equal(signatures.length,14);
const json=(c,d,q)=>JSON.parse(sql(c,d,q,{role:''}));
const invoke=(c,d,name,input)=>json(c,d,`select ${name}(${jsonLiteral(input)})`);
const attrs=(c,d)=>json(c,d,`select jsonb_object_agg(s,jsonb_build_object('acl',p.proacl,'owner',p.proowner,
  'definer',p.prosecdef,'config',p.proconfig,'volatile',p.provolatile,'parallel',p.proparallel))
  from jsonb_array_elements_text(${jsonLiteral(signatures)})s join pg_proc p on p.oid=s::regprocedure`);
const rawCall=(c,d,signature,input={})=>sqlResult(c,d,`\\set VERBOSITY verbose\nbegin;set local statement_timeout='5s';
  select ${signature.replace('(jsonb)',`(${jsonLiteral(input)})`)};rollback;`,{role:''});
const file=path.join(repositoryRoot,'docs/reliability/phase2c/evidence/annual-workers.json');
test('Phase2C actual annual worker SQL corrections',{timeout:360000},async t=>{
 const f=await createScoreProofFixture({candidateSql:'supabase/production_migrations/202609280121_score_derived_intents_v1.sql'});
 const c=f.cluster,base=f.database;const evidence={schemaVersion:1,baseSha:'b1ceaa89f2d7cd0cdf2835aba04a24aca442ca18',
  fixture:'phase2c-annual-workers-v1',seed:'2099-worker-contracts-v1',environment:'ISOLATED_LOCAL_POSTGRESQL17',
  timestamp:new Date().toISOString(),migration:migrationPath,migrationSha256:createHash('sha256').update(migration).digest('hex'),
  statementTimeoutMs:normalWorkerTimeoutMs,composition:fullCandidate?'121+122+123+124':'121+123',tests:[],limitations:['Synthetic 2099 authority/current-pointer rows and explicit assert_future runtime substitution; not protected annual admission proof',
  'Odds completion additionally substitutes annual runtime, exact job scope, and current-input boundary; actual completion SQL/constraints execute',
  'No Google/Archive network delivery, Production, financial publication, or real participant identity']};
 const run=(id,title,fn)=>t.test(`${id}: ${title}`,async()=>{const row={id,title,proofLayer:'POSTGRESQL',result:'FAIL'};
  try{row.details=await fn();row.result='PASS';}catch(e){row.error=e.message;throw e;}finally{evidence.tests.push(row);}});
 let installed;
 const clone=label=>{const d=cloneScoreProofDatabase({...f,database:installed||base,counter:f.counter},label);f.counter++;configureFiniteTimeout(c,d,5000);return d;};
 try{
  await run('P2C-C-BEFORE','all14 installed defects reproduce SQLSTATE42883 before correction',()=>{
   const failures=[];for(const signature of signatures.filter(s=>!s.includes('dispatch_odds'))){const r=rawCall(c,base,signature);assert.match(r.stderr,/42883/);failures.push({signature,sqlstate:'42883'});}
   const d=clone('odds_before');seedAnnualWorkerBoundary(c,d);const input=seedAnnualOddsCompletion(c,d);
   const before=sql(c,d,`select to_jsonb(j)::text from scoring_authority.odds_calculation_jobs j where job_id='${input.job_id}'`);
   const r=rawCall(c,d,'public.future_production_dispatch_odds_pre_withdrawal_v1(jsonb)',input);assert.match(r.stderr,/42883/);
   assert.equal(sql(c,d,`select to_jsonb(j)::text from scoring_authority.odds_calculation_jobs j where job_id='${input.job_id}'`),before);
   return{failures:[...failures,{signature:'public.future_production_dispatch_odds_pre_withdrawal_v1(jsonb)',sqlstate:'42883',partialWrite:false}]};});
  await run('P2C-C-BEFORE-WRITER-CHECK','actual eligible writer sync reproduces obsolete false-only CHECK23514',()=>{
   const d=clone('writer_check_before');seedFutureGoogleCompatibility(c,d);
   const failure=sqlResult(c,d,`\\set VERBOSITY verbose
     select production_control.sync_future_google_writer_job_v2('2100','2100-R1-1')`,{role:''});
   assert.match(failure.stderr,/23514/);assert.match(failure.stderr,/future_match_google_compatibility_jobs_v_writer_installed_check/);
   assert.equal(sql(c,d,"select writer_installed from production_control.future_match_google_compatibility_jobs_v1 where tournament_id='2100'"),'f');
   return{issue:'P2C-NEW-GOOGLE-WRITER-23514',sqlstate:'23514',error:failure.stderr,partialInstallation:false};
  });
  await run('P2C-C-INSTALL','upgrade preserves attributes and removes only proven special-expression misuse',async()=>{
   installed=clone('installed');const before=attrs(c,installed);
   if(fullCandidate)sqlFile(c,installed,path.join(repositoryRoot,migration122),{role:''});
   sqlFile(c,installed,path.join(repositoryRoot,migrationPath),{role:''});
   if(fullCandidate)sqlFile(c,installed,path.join(repositoryRoot,migration124),{role:''});
   assert.deepEqual(attrs(c,installed),before);
   assert.equal(sql(c,installed,`select count(*)from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in('public','production_control','scoring_authority')and p.prosrc~'pg_catalog\\.(greatest|least|coalesce|nullif)[[:space:]]*\\('`),'0');
   const expressionNames=['least','greatest','coalesce','nullif','extract','trim','position','substring','overlay',
     'current_date','current_time','current_timestamp','localtime','localtimestamp'];
   const installedCandidates=json(c,installed,`select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
     'name',hit.parts[1],'catalogFunctionExists',exists(select 1 from pg_proc builtin join pg_namespace ns on ns.oid=builtin.pronamespace
       where ns.nspname='pg_catalog'and builtin.proname=hit.parts[1]))),'[]')from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     cross join lateral regexp_matches(p.prosrc,'pg_catalog\\.(${expressionNames.join('|')})[[:space:]]*\\(','g')hit(parts)
     where n.nspname in('public','production_control','scoring_authority')`);
   assert.deepEqual(installedCandidates.filter(x=>!x.catalogFunctionExists),[],'no unresolved qualified special-expression candidate may remain');
   const historicalFiles=[];for(const name of(await readdir(path.join(repositoryRoot,'supabase/production_migrations'))).filter(x=>x.endsWith('.sql'))){
     const content=await readFile(path.join(repositoryRoot,'supabase/production_migrations',name),'utf8');
     const hits=[...content.matchAll(new RegExp(`pg_catalog\\.(${expressionNames.join('|')})\\s*\\(`,'g'))].map(x=>x[1]);
     if(hits.length)historicalFiles.push({file:name,names:[...new Set(hits)],sourceOccurrences:hits.length});
   }
   return{functions:14,attributesPreserved:true,invalidInstalledExpressions:0,
     expressionInventory:{candidateNames:expressionNames,installedCandidates,historicalFiles,
       limitation:'Text candidates are distinguished from executable SQL. Existing ordinary catalog functions are not classified as defects merely by spelling; historical migration text remains preserved.'}};});
  await run('P2C-C-AFTER','every corrected initializer executes through its original guard rather than42883',()=>{
   const values=[undefined,null,-1,0,60,301,2147483647],calls=[];
   for(const signature of signatures.filter(s=>!s.includes('dispatch_odds')))for(const value of values){
    const input=value===undefined?{}:{lease_seconds:value,retry_after_seconds:value,duration_ms:value};
    const r=rawCall(c,installed,signature,input);assert.doesNotMatch(r.stderr,/42883/);
    calls.push({signature,input:value===undefined?'ABSENT':value,sqlstate:r.stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1]||null,
      result:r.status===0?'VALIDATION_RESPONSE':'ORIGINAL_AUTHORITY_GUARD'});}
   return{calls,scope:'Initializer runtime and original guard only; successful claims/completions below'};});
  await run('P2C-C-COMPETITION','2099 claim/complete/replay/stale and lease clamp use actual worker SQL',()=>{
   const results=[];for(const [lease,expected]of[[null,90],[-1,15],[60,60],[999,300]]){
    const d=clone('competition');seedAnnualWorkerBoundary(c,d);seedAnnualCompetitionJobs(c,d);
    const input={...annualWorkerInput,engine_keys:['TEAM_MOMENTUM','TOURNAMENT_STORYLINES'],lease_seconds:lease};
    const claim=invoke(c,d,'public.future_production_claim_competition_derived_jobs_v1',input);assert.equal(claim.claims.length,2);
    const duration=Number(sql(c,d,"select round(extract(epoch from(lease_expires_at-started_at)))from scoring_authority.competition_recalculation_jobs where tournament_id='2099'and engine_key='TEAM_MOMENTUM'"));assert.equal(duration,expected);
    const j=claim.claims[0],completion={...annualWorkerInput,round_number:0,engine_key:j.engine_key,engine_version:'synthetic-v1',
      configuration_fingerprint:'a'.repeat(64),source_fingerprint:'b'.repeat(64),payload_hash:'c'.repeat(64),result_payload:{synthetic:true},
      calculated_by:'phase2c',claim_token:j.claim_token,claim_started_at:j.claim_started_at,duration_ms:-1};
    const completed=invoke(c,d,'public.future_production_write_competition_derived_snapshot_v1',completion);assert.equal(completed.ok,true);
    const stale=invoke(c,d,'public.future_production_write_competition_derived_snapshot_v1',completion);assert.equal(stale.code,'STALE_DERIVED_JOB');
    assert.equal(sql(c,d,"select duration_ms from scoring_authority.competition_derived_runs where tournament_id='2099'"),'0');
    assert.equal(sql(c,d,"select count(*)from scoring_authority.competition_derived_snapshots where tournament_id='2099'"),'1');
    assert.equal(invoke(c,d,'public.future_production_claim_competition_derived_jobs_v1',input).claims.length,0);
    results.push({lease,actualLeaseSeconds:duration,completed:true,replay:'STALE_DERIVED_JOB',snapshots:1});}
   return{results};});
  await run('P2C-C-BEFORE-42702','corrected initializer exposes historical annual intelligence variable collision',async()=>{
   const d=clone('intelligence_old');seedAnnualWorkerBoundary(c,d);
   const original=JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2c/evidence/annual-sql-before.json'),'utf8'))
     .functions.find(x=>x.signature==='future_production_write_intelligence_derived_bundle_v1(jsonb)').definition;
   sql(c,d,original.replaceAll('pg_catalog.greatest(','greatest(').replaceAll('pg_catalog.least(','least('),{role:''});
   const input={...annualWorkerInput,engine_keys:['TOURNAMENT_INTELLIGENCE'],lease_seconds:60};
   seedAnnualCompetitionJobs(c,d,input.engine_keys);
   const claim=invoke(c,d,'public.future_production_claim_intelligence_derived_bundle_v1',input);
   const completion={...annualWorkerInput,claim_token:claim.claim_token,source_fingerprint:'b'.repeat(64),calculated_by:'phase2c',duration_ms:-1,
    engines:[{key:'TOURNAMENT_INTELLIGENCE',version:'synthetic-v1',result:{synthetic:true},payload_hash:'c'.repeat(64),claim_started_at:claim.claim_started_at}]};
   const result=rawCall(c,d,'public.future_production_write_intelligence_derived_bundle_v1(jsonb)',completion);
   assert.match(result.stderr,/42702/);assert.match(result.stderr,/configuration_fingerprint/);
   assert.equal(sql(c,d,"select count(*)from scoring_authority.competition_derived_snapshots where tournament_id='2099'"),'0');
   return{issue:'P2C-NEW-ANNUAL-42702',sqlstate:'42702',partialSnapshot:false,error:result.stderr};
  });
  await run('P2C-C-INTELLIGENCE','2099 bundle claim/complete preserves active lease and expired-lease retry',async()=>{
   const results=[];for(const [lease,expected]of[[null,90],[-1,15],[60,60],[999,300]]){
    const d=clone('intelligence');seedAnnualWorkerBoundary(c,d);
    const input={...annualWorkerInput,engine_keys:['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL'],lease_seconds:lease};
    // Seed explicit derived demand. Delivery124 intentionally does not regenerate completed work.
    seedAnnualCompetitionJobs(c,d,input.engine_keys);
    const claim=invoke(c,d,'public.future_production_claim_intelligence_derived_bundle_v1',input);assert.equal(claim.ok,true);
    const active=invoke(c,d,'public.future_production_claim_intelligence_derived_bundle_v1',input);
    assert.equal(active.code,'INTELLIGENCE_LEASE_ACTIVE');
    const seconds=Number(sql(c,d,"select round(extract(epoch from(lease_expires_at-started_at)))from scoring_authority.competition_recalculation_jobs where tournament_id='2099'and engine_key='TOURNAMENT_INTELLIGENCE'"));assert.equal(seconds,expected);
    const completion={...annualWorkerInput,claim_token:claim.claim_token,source_fingerprint:'b'.repeat(64),calculated_by:'phase2c',duration_ms:-1,
      engines:input.engine_keys.map(key=>({key,version:'synthetic-v1',result:{synthetic:true},payload_hash:'c'.repeat(64),claim_started_at:claim.claim_started_at}))};
    assert.equal(invoke(c,d,'public.future_production_write_intelligence_derived_bundle_v1',completion).written.length,2);
    assert.equal(invoke(c,d,'public.future_production_write_intelligence_derived_bundle_v1',completion).code,'STALE_INTELLIGENCE_WORKER');
    if(fullCandidate){
      assert.equal(invoke(c,d,'public.future_production_claim_intelligence_derived_bundle_v1',input).code,'NO_PENDING_INTELLIGENCE');
      // Isolated fixture construction models a genuinely new source revision, not an operational retry.
      sql(c,d,"update scoring_authority.competition_recalculation_jobs set status='PENDING',requested_source_revision='{\"syntheticRevision\":2}'::jsonb where tournament_id='2099'",{role:''});
    }
    const next=invoke(c,d,'public.future_production_claim_intelligence_derived_bundle_v1',input);assert.equal(next.ok,true);assert.ok(next.claim_token);
    let expiredLeaseReclaimed='SEPARATE_LEASE_60_CASE';
    if(!fullCandidate||lease===60){
      sql(c,d,"update scoring_authority.competition_recalculation_jobs set lease_expires_at=clock_timestamp()-interval'1s'where tournament_id='2099'",{role:''});
      if(fullCandidate){
        // The real autonomous tick retires the expired lease and schedules bounded backoff.
        // Do not edit delivery_available_at or bypass the new delivery predicate.
        sql(c,d,"update production_control.resource_scope set workers_enabled=true where scope_key='BAGGER_INV_PRODUCTION';update production_control.cutover_activation_state set read_cutover_phase='WORKERS'where scope_key='BAGGER_INV_PRODUCTION'",{role:''});
        const tick=invoke(c,d,'public.score_derived_delivery_tick_v1',{...annualWorkerInput,
          annual_scoring_operation:'score_derived_delivery_tick_v1',contract_version:'score-derived-delivery-v1',materialization_family:'COMPETITION',operation_id:'a2500000-0000-4000-8000-000000000001'});
        assert.equal(tick.ok,true);
        assert.equal(sql(c,d,"select count(*)from scoring_authority.competition_recalculation_jobs where tournament_id='2099'and status='PENDING'and delivery_error_class='RETRYABLE'"),'2');
        assert.equal(invoke(c,d,'public.future_production_claim_intelligence_derived_bundle_v1',input).code,'NO_PENDING_INTELLIGENCE');
        const waitMs=Math.ceil(Number(sql(c,d,"select greatest(0,extract(epoch from(max(delivery_available_at)-clock_timestamp()))*1000)from scoring_authority.competition_recalculation_jobs where tournament_id='2099'")))+100;
        assert.ok(waitMs<=4500,`first retry must have bounded backoff: ${waitMs}`);
        await new Promise(resolve=>setTimeout(resolve,waitMs));
      }
      const retried=invoke(c,d,'public.future_production_claim_intelligence_derived_bundle_v1',input);assert.equal(retried.ok,true);assert.ok(retried.claim_token);assert.notEqual(retried.claim_token,next.claim_token);
      expiredLeaseReclaimed=true;
    }
    results.push({lease,actualLeaseSeconds:seconds,completed:2,replay:'STALE_INTELLIGENCE_WORKER',expiredLeaseReclaimed,
      demandModel:fullCandidate?'NEW_SOURCE_THEN_DELIVERY_TICK_BACKOFF':'HISTORICAL_CLAIM_REGENERATION'});}
   return{results};});
  await run('P2C-C-CALCUTTA','2099 nonempty Calcutta claim executes lease bounds and same-request replay',()=>{
   const rows=[];for(const [lease,expected]of[[null,60],[-1,15],[60,60],[999,300]]){
    const d=clone('calcutta');const input={...seedAnnualCalcuttaClaim(c,d),lease_seconds:lease};
    const claim=invoke(c,d,'public.future_production_claim_calcutta_recalculation_v1',input);
    assert.equal(claim.code,'PRODUCTION_CALCUTTA_V1_RECALCULATION_CLAIMED');assert.ok(claim.job.claim_token);
    assert.equal(claim.job.runtime_generation_id,annualWorkerGeneration);
    const actual=Number(sql(c,d,"select round(extract(epoch from(lease_expires_at-started_at)))from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2099'"));assert.equal(actual,expected);
    const replay=invoke(c,d,'public.future_production_claim_calcutta_recalculation_v1',input);
    assert.equal(replay.idempotent,true);assert.deepEqual(replay.job,claim.job);
    assert.equal(invoke(c,d,'public.future_production_claim_calcutta_recalculation_v1',{...input,request_fingerprint:'f'.repeat(64)}).job,null);
    assert.equal(sql(c,d,"select attempts from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2099'"),'1');
    rows.push({lease,actualLeaseSeconds:actual,jobClaimed:true,sameRequestReplay:true,activeLeaseSkipped:true});
   }return{rows,boundarySubstitutions:['assert_future_production_scoring_runtime_v1','assert_annual_calcutta_runtime_v1'],
     scope:'Actual nonempty annual claim/lease/current-source/receipt SQL; empty synthetic annual golf/auction facts are not financial-calculator certification'};
  });
  await run('P2C-C-GOOGLE-COMPATIBILITY','2100 pre-activation job claims clamp leases and reclaim an expired lease',()=>{
   const rows=[];for(const [lease,expected]of[[null,120],[-1,30],[60,60],[999,300]]){
    const d=clone('google_compatibility');
    const writer=seedFutureGoogleCompatibility(c,d);
    sql(c,d,`select production_control.sync_future_google_writer_job_v2('2100','2100-R1-1');
      create or replace function production_control.assert_future_google_writer_v2(input jsonb,require_exact_contract boolean default true)
        returns text language plpgsql security definer set search_path=pg_catalog as $$begin
        if input->>'target_tournament_id'<>'2100' or input->>'expected_writer_generation_id'<>'${writer}'
          then raise exception 'ISOLATED_WRITER_SCOPE';end if;return '2100';end$$;
      create or replace function production_control.future_google_match_manifest_v2(target_match text)
        returns jsonb language sql stable security definer set search_path=pg_catalog as $$
        select jsonb_build_object('synthetic',true,'matchId',target_match)$$;`,{role:''});
    const input={target_tournament_id:'2100',expected_writer_generation_id:writer,
      destination_workbook_id:'synthetic-local-2100',expected_target_contract_fingerprint:'b'.repeat(64),
      worker_id:'synthetic-google-compatibility',lease_seconds:lease};
    const claim=invoke(c,d,'public.claim_production_future_match_google_compatibility_v2',input);
    assert.equal(claim.job.matchId,'2100-R1-1');assert.equal(claim.job.attempt,1);
    const actual=Number(sql(c,d,"select round(extract(epoch from(lease_expires_at-last_attempt_at)))from production_control.future_match_google_compatibility_jobs_v1 where tournament_id='2100'"));assert.equal(actual,expected);
    assert.equal(invoke(c,d,'public.claim_production_future_match_google_compatibility_v2',input).job,null);
    sql(c,d,"update production_control.future_match_google_compatibility_jobs_v1 set lease_expires_at=clock_timestamp()-interval'1s'where tournament_id='2100'",{role:''});
    const retry=invoke(c,d,'public.claim_production_future_match_google_compatibility_v2',input);
    assert.equal(retry.job.attempt,2);assert.notEqual(retry.job.claimToken,claim.job.claimToken);
    rows.push({lease,actualLeaseSeconds:actual,firstAttempt:1,reclaimedAttempt:2,activeLeaseSkipped:true});
   }return{rows,boundarySubstitutions:['assert_future_google_writer_v2','future_google_match_manifest_v2'],
     scope:'Actual nonempty pre-activation claim/lease SQL; not future writer certification or external Google provisioning'};
  });
  await run('P2C-C-WRITER-CHECK','writer sync retains certification and prepared-state requirements',()=>{
   const d=clone('writer_check_after');seedFutureGoogleCompatibility(c,d);
   const state=()=>json(c,d,"select jsonb_build_object('installed',writer_installed,'structural',structural_fingerprint,'status',status)from production_control.future_match_google_compatibility_jobs_v1 where tournament_id='2100'");
   sql(c,d,"select production_control.sync_future_google_writer_job_v2('2100','2100-R1-1')",{role:''});assert.equal(state().installed,true);
   sql(c,d,"begin;set local session_replication_role=replica;update production_control.future_google_writer_targets_v2 set contract_status='INVALIDATED',invalidated_at=clock_timestamp() where tournament_id='2100';commit;select production_control.sync_future_google_writer_job_v2('2100','2100-R1-1')",{role:''});
   assert.equal(state().installed,false);assert.equal(state().structural,null);
   sql(c,d,"begin;set local session_replication_role=replica;update production_control.future_google_writer_targets_v2 set contract_status='CERTIFIED',invalidated_at=null where tournament_id='2100';update production_control.future_runtime_match_bindings_v2 set runtime_state='PAIRED' where tournament_id='2100';commit;select production_control.sync_future_google_writer_job_v2('2100','2100-R1-1')",{role:''});
   assert.equal(state().installed,false);
   const negative=sqlResult(c,d,`\\set VERBOSITY verbose
     update production_control.future_match_google_compatibility_jobs_v1 set writer_installed=true,writer_generation_id=null where tournament_id='2100'`,{role:''});
   assert.match(negative.stderr,/23514/);assert.match(negative.stderr,/production_future_google_certified_writer_shape_v2/);
   return{eligibleInstalled:true,invalidatedTargetInstalled:false,unpreparedBindingInstalled:false,missingCertificationMetadata:'23514',remainingConstraints:json(c,d,"select jsonb_agg(conname order by conname)from pg_constraint where conrelid='production_control.future_match_google_compatibility_jobs_v1'::regclass")};
  });
  await run('P2C-C-GOOGLE','2099 outbox claims and retry delay retain finite bounds and stale-lease rejection',()=>{
   const rows=[];
   for(const [lease,expected,delay,expectedDelay]of[[null,30,null,1],[-1,5,-1,1],[60,60,20,20],[999,300,999,300]]) {
    const d=clone('google');seedAnnualWorkerBoundary(c,d);
    sql(c,d,`begin;set local session_replication_role=replica;
      insert into scoring_authority.google_match_checkpoints(match_id)values('2099-R1-1');
      insert into scoring_authority.google_outbox_events(id,tournament_id,match_id,match_revision,mutation_key,event_type,payload,payload_hash)
      values('a2300000-0000-4000-8000-000000000001','2099','2099-R1-1',1,'synthetic-worker-metadata','HOLE_SCORE_UPSERTED','{}',repeat('a',64));commit;`,{role:''});
    const input={...annualWorkerInput,lease_seconds:lease};
    const claim=invoke(c,d,'public.future_production_claim_google_outbox_pre_generation_v1',input);
    assert.equal(claim.event.tournament_id,'2099');
    const leaseSeconds=Number(sql(c,d,"select round(extract(epoch from(lease_expires_at-last_attempt_at)))from scoring_authority.google_outbox_events where tournament_id='2099'"));assert.equal(leaseSeconds,expected);
    const failed=invoke(c,d,'public.future_production_fail_google_outbox_pre_generation_v1',{...annualWorkerInput,event_id:claim.event.id,retry_after_seconds:delay});assert.equal(failed.status,'RETRYABLE');
    const actualDelay=Number(sql(c,d,"select round(extract(epoch from(available_at-clock_timestamp())))from scoring_authority.google_outbox_events where tournament_id='2099'"));assert.equal(actualDelay,expectedDelay);
    assert.equal(invoke(c,d,'public.future_production_fail_google_outbox_pre_generation_v1',{...annualWorkerInput,event_id:claim.event.id}).code,'OUTBOX_CLAIM_STALE');
    sql(c,d,"update scoring_authority.google_outbox_events set available_at=clock_timestamp()-interval'1s'where tournament_id='2099'",{role:''});
    const byId=invoke(c,d,'public.future_production_claim_google_outbox_event_pre_generation_v1',{...annualWorkerInput,event_id:claim.event.id,lease_seconds:lease});assert.equal(byId.ok,true);
    rows.push({lease,leaseSeconds,retryAfter:delay,retryDelaySeconds:actualDelay,exactIdClaim:true,staleFailDenied:true});
   }return{rows,scope:'Outbox metadata claim/lease/failure; no Google transport or verified mirror'};
  });
  await run('P2C-C-ARCHIVE','2099 archive claims and retry delay preserve supersession and finite bounds',()=>{
   const rows=[];
   for(const [lease,expected,delay,expectedDelay]of[[null,60,null,30],[-1,15,-1,2],[60,60,20,20],[999,300,9999,3600]]) {
    const d=clone('archive');seedAnnualWorkerBoundary(c,d);
    sql(c,d,`begin;set local session_replication_role=replica;
      insert into scoring_authority.scorecard_archive_jobs(job_id,tournament_id,match_id,snapshot_id,snapshot_revision,match_revision,event_type,source_fingerprint,archive_payload_hash)
      values('a2400000-0000-4000-8000-000000000001','2099','2099-R1-1','a2400000-0000-4000-8000-000000000002',1,1,'SCORECARD_ARCHIVE_UPSERT',repeat('a',64),repeat('b',64)),
      ('a2400000-0000-4000-8000-000000000003','2099','2099-R1-1','a2400000-0000-4000-8000-000000000004',2,2,'SCORECARD_ARCHIVE_UPSERT',repeat('c',64),repeat('d',64));commit;`,{role:''});
    const claim=invoke(c,d,'public.future_production_claim_scorecard_archive_job_pre_generation_v1',{...annualWorkerInput,lease_seconds:lease});assert.equal(claim.job.match_revision,2);
    assert.equal(sql(c,d,"select status from scoring_authority.scorecard_archive_jobs where job_id='a2400000-0000-4000-8000-000000000001'"),'SUPERSEDED');
    const leaseSeconds=Number(sql(c,d,"select round(extract(epoch from(lease_expires_at-updated_at)))from scoring_authority.scorecard_archive_jobs where status='PROCESSING'and tournament_id='2099'"));assert.equal(leaseSeconds,expected);
    const input={...annualWorkerInput,job_id:claim.job.job_id,claim_token:claim.job.claim_token,retry_after_seconds:delay};
    assert.equal(invoke(c,d,'public.future_production_fail_scorecard_archive_job_pre_generation_v1',input).status,'RETRYABLE');
    const actualDelay=Number(sql(c,d,"select round(extract(epoch from(available_at-updated_at)))from scoring_authority.scorecard_archive_jobs where status='RETRYABLE'and tournament_id='2099'"));assert.equal(actualDelay,expectedDelay);
    assert.equal(invoke(c,d,'public.future_production_fail_scorecard_archive_job_pre_generation_v1',input).code,'ARCHIVE_CLAIM_STALE');
    rows.push({lease,leaseSeconds,retryAfter:delay,retryDelaySeconds:actualDelay,supersededRevision:1,currentRevision:2,staleFailDenied:true});
   }return{rows,scope:'Archive queue metadata and lease/failure only; not scorecard rendering/storage/Google delivery'};
  });
  await run('P2C-C-ODDS','2099 actual completion clamps output bytes without publishing or duplicating results',()=>{
   const rows=[];for(const [bytes,expected]of[[null,0],[-1,0],[123,123],[2147483647,2147483647]]){
    const d=clone('odds_after');seedAnnualWorkerBoundary(c,d);const input={...seedAnnualOddsCompletion(c,d),output_payload_bytes:bytes};
    const result=invoke(c,d,'public.future_production_dispatch_odds_pre_withdrawal_v1',input);assert.equal(result.ok,true);
    const state=json(c,d,`select jsonb_build_object('status',status,'bytes',output_payload_bytes,'publication',publication_status,
      'payload',result_payload)from scoring_authority.odds_calculation_jobs where job_id='${input.job_id}'`);
    assert.equal(state.bytes,expected);assert.equal(state.publication,'READY');assert.equal(sql(c,d,"select count(*)from scoring_authority.odds_published_snapshots where tournament_id='2099'"),'0');assert.deepEqual(state.payload,input.result_payload);
    const replay=invoke(c,d,'public.future_production_dispatch_odds_pre_withdrawal_v1',input);assert.equal(replay.ok,true);
    assert.equal(sql(c,d,`select count(*)from scoring_authority.odds_calculation_jobs where job_id='${input.job_id}'`),'1');rows.push({bytes,state,replay:replay.code});}
   return{rows};});
  if(fullCandidate)await runAnnualWorkerBranchMatrix({run,clone,c,invoke,json});
  await run('P2C-C-MANIFEST','annual writer manifest retains strict authorship and rejects topology/security drift',()=>{
   const d=clone('manifest'),query='select production_control.future_google_writer_implementation_manifest_v2()';
   const manifest=json(c,d,query);
   assert.equal(manifest.triggers.length,5);assert.equal(manifest.liveAuthorship.name,'bagger_live_actor_auth_user_id');
   assert.equal(manifest.liveAuthorship.functionSourceSha256,'fdc0e44e1e1445256efb4018e37998df2c3a089ffd62103a415c695f1f8491b1');
   const table='production_control.future_google_writer_certification_receipts_v1';
   const cases=[
     ['DISABLED',`alter table ${table} disable trigger bagger_live_actor_auth_user_id`],
     ['MISSING',`drop trigger bagger_live_actor_auth_user_id on ${table}`],
     ['CHANGED_ARGUMENT',`drop trigger bagger_live_actor_auth_user_id on ${table};create trigger bagger_live_actor_auth_user_id before insert or update of actor_auth_user_id on ${table} for each row execute function participant_identity.require_live_authorship_v1('wrong_field')`],
     ['UNEXPECTED_EXTRA',`create trigger unexpected_fixture_trigger before insert or update of actor_auth_user_id on ${table} for each row execute function participant_identity.require_live_authorship_v1('actor_auth_user_id')`],
     ['PUBLIC_EXECUTE',`grant execute on function participant_identity.require_live_authorship_v1() to authenticated`],
     ['CHANGED_FUNCTION',`create or replace function participant_identity.require_live_authorship_v1()returns trigger language plpgsql security definer set search_path=pg_catalog as $$begin return new;end$$`],
   ];
   const rows=[];for(const [scenario,mutation]of cases){
     const result=sqlResult(c,d,`begin;${mutation};${query};rollback`,{role:''});
     assert.notEqual(result.status,0);assert.match(result.stderr,/PRODUCTION_FUTURE_GOOGLE_(AUTHORSHIP|IMPLEMENTATION_TRIGGER)_TOPOLOGY_REQUIRED/);
     assert.deepEqual(json(c,d,query),manifest,'failed probe must roll back catalog drift');rows.push({scenario,result:'REJECTED_AND_ROLLED_BACK'});
   }
   return{issue:'P2C-NEW-ANNUAL-MANIFEST-102',expectedOriginalTriggers:5,strictAuthorshipTrigger:1,rows};
  });
  await run('P2C-C-REAPPLY','reapplication fails atomically instead of silently accepting unknown source',()=>{
   const d=clone('reapply'),before=attrs(c,d);const result=sqlResult(c,d,migration,{role:''});assert.notEqual(result.status,0);
   assert.match(result.stderr,/PHASE2C_WRITER_CONSTRAINT_PRECONDITION_FAILED/);assert.deepEqual(attrs(c,d),before);return{reapplication:'REJECTED_ATOMICALLY'};});
 }finally{
  evidence.completedAt=new Date().toISOString();evidence.counts={pass:evidence.tests.filter(x=>x.result==='PASS').length,fail:evidence.tests.filter(x=>x.result!=='PASS').length};
  await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(evidence,null,2)+'\n');await destroyIsolatedCluster(c);
 }
});

// Sequential top-level test: the main suite has destroyed its cluster first.
// Roles are cluster-global, so an independent effective clean install owns a fresh cluster.
test('P2C-C-CLEAN: effective clean installation executes actual candidate manifest',{timeout:120000},async()=>{
 const c=await createIsolatedCluster();const row={id:'P2C-C-CLEAN',proofLayer:'POSTGRESQL',result:'FAIL'};
 try{
  const d='phase2c_workers_clean';createDatabase(c,d);await installRelease139Schema(c,d);
  installCertifiedSqlRepairs(c,d);installRelease139FunctionCandidates(c,d);
  sqlFile(c,d,path.join(repositoryRoot,'supabase/production_migrations/202609280121_score_derived_intents_v1.sql'),{role:''});
  if(fullCandidate)sqlFile(c,d,path.join(repositoryRoot,migration122),{role:''});
  sqlFile(c,d,path.join(repositoryRoot,migrationPath),{role:''});
  if(fullCandidate)sqlFile(c,d,path.join(repositoryRoot,migration124),{role:''});
  configureFiniteTimeout(c,d,5000);
  const manifest=json(c,d,'select production_control.annual_side_game_implementation_manifest_v1()');
  assert.equal(manifest.scoreDerivedIntentContract,'score-derived-intent-v1');
  row.result='PASS';row.details={effectiveCleanInstall:true,manifestExecuted:true,fullCandidate122And124:fullCandidate?'INSTALLED':'SEPARATE_COMPOSITION_SUITE'};
 }catch(error){row.error=error.message;throw error;}
 finally{
  await destroyIsolatedCluster(c);
  const evidence=JSON.parse(await readFile(file,'utf8'));evidence.tests.push(row);
  evidence.counts={pass:evidence.tests.filter(x=>x.result==='PASS').length,fail:evidence.tests.filter(x=>x.result!=='PASS').length};
  evidence.completedAt=new Date().toISOString();await writeFile(file,JSON.stringify(evidence,null,2)+'\n');
 }
});
