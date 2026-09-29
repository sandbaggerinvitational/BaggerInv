// Proof layer: POSTGRESQL. Actual installed worker functions; fixture DML is construction only.
import assert from 'node:assert/strict';
import {sql,jsonLiteral} from './postgres17.mjs';
import {runtimeScope} from './synthetic-tournament.mjs';
import {seedAnnualWorkerBoundary,seedAnnualCompetitionJobs,seedAnnualCalcuttaClaim,
  seedFutureGoogleCompatibility,seedAnnualOddsCompletion,annualWorkerInput} from './phase2c-annual-workers.mjs';
export async function runAnnualWorkerBranchMatrix({run,clone,c,invoke,json}) {
 const write=(d,q)=>sql(c,d,q,{role:''});
 const change=(d,q)=>write(d,`begin;set local session_replication_role=replica;${q};commit;`);
 const fresh=(input,n)=>({...input,request_fingerprint:n.toString(16).padStart(64,'0')});
 await run('P2C-C-CALCUTTA-MATRIX','annual Calcutta empty, historical, stale-source and expired-lease branches',async()=>{
  const results=[];
  for(const scenario of ['EMPTY','TERMINAL_HISTORY','STALE_SOURCE','EXPIRED_LEASE','EXHAUSTED_LEASE']){
   const d=clone('calcutta_matrix'),input=seedAnnualCalcuttaClaim(c,d);
   if(scenario==='EMPTY')change(d,"delete from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2099'");
   if(scenario==='TERMINAL_HISTORY')change(d,`insert into scoring_authority.calcutta_v1_recalculation_jobs
    select(jsonb_populate_record(null::scoring_authority.calcutta_v1_recalculation_jobs,to_jsonb(j)||jsonb_build_object(
     'job_id',md5('annual-calcutta-history:'||n)::uuid,'status','SUPERSEDED','completed_at',clock_timestamp(),
     'source_fingerprint',md5(n::text)||md5(n::text),'request_fingerprint',null))).*
    from scoring_authority.calcutta_v1_recalculation_jobs j cross join generate_series(1,3)n where tournament_id='2099'`);
   if(scenario==='STALE_SOURCE')change(d,"update scoring_authority.calcutta_v1_recalculation_jobs set source_fingerprint=repeat('f',64)where tournament_id='2099'");
   const first=invoke(c,d,'public.future_production_claim_calcutta_recalculation_v1',input);
   if(scenario==='EMPTY'){assert.equal(first.job,null);results.push({scenario,result:first.code});continue;}
   assert.ok(first.job?.claim_token,JSON.stringify(first));
   if(scenario==='TERMINAL_HISTORY')assert.equal(write(d,"select count(*)from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2099'and status='SUPERSEDED'"),'3');
   if(scenario==='STALE_SOURCE'){
    assert.notEqual(first.job.job_id,'a2700000-0000-4000-8000-000000000003');
    assert.equal(write(d,"select status from scoring_authority.calcutta_v1_recalculation_jobs where job_id='a2700000-0000-4000-8000-000000000003'"),'SUPERSEDED');
   }
   if(scenario.includes('LEASE')){
    change(d,`update scoring_authority.calcutta_v1_recalculation_jobs set lease_expires_at=clock_timestamp()-interval'1s'
      ${scenario==='EXHAUSTED_LEASE'?',attempts=5':''} where job_id='${first.job.job_id}'`);
    const retry=invoke(c,d,'public.future_production_claim_calcutta_recalculation_v1',fresh(input,21));
    if(scenario==='EXPIRED_LEASE'){
     assert.equal(retry.job,null,'expired lease must first enter the real bounded delivery backoff');
     const waitMs=Math.ceil(Number(write(d,`select greatest(0,extract(epoch from(delivery_available_at-clock_timestamp()))*1000)from scoring_authority.calcutta_v1_recalculation_jobs where job_id='${first.job.job_id}'`)))+100;
     assert.ok(waitMs<=4500,`first delivery retry backoff must remain bounded: ${waitMs}`);
     await new Promise(resolve=>setTimeout(resolve,waitMs));
     const retried=invoke(c,d,'public.future_production_claim_calcutta_recalculation_v1',fresh(input,22));
     assert.ok(retried.job?.claim_token,JSON.stringify(retried));assert.notEqual(retried.job.claim_token,first.job.claim_token);
    }
    else{assert.equal(retry.job,null);assert.equal(write(d,`select status from scoring_authority.calcutta_v1_recalculation_jobs where job_id='${first.job.job_id}'`),'FAILED');}
   }
   results.push({scenario,result:'PASS'});
  }
  return{results,multipleActiveJobs:'NOT_APPLICABLE: unique partial index permits one active Calcutta job per tournament; multiple terminal history rows exercised'};
 });
 await run('P2C-C-COMPATIBILITY-MATRIX','Google compatibility rejects stale structure and bounds multiple-job selection',()=>{
  const results=[];
  for(const scenario of ['EMPTY','MULTIPLE','STALE_STRUCTURE','STALE_GENERATION','TERMINAL']){
   const d=clone('compatibility_matrix'),writer=seedFutureGoogleCompatibility(c,d);
   write(d,`select production_control.sync_future_google_writer_job_v2('2100','2100-R1-1');
    create or replace function production_control.assert_future_google_writer_v2(input jsonb,require_exact_contract boolean default true)
     returns text language sql security definer set search_path=pg_catalog as $$select '2100'::text$$;
    create or replace function production_control.future_google_match_manifest_v2(target_match text)
     returns jsonb language sql stable security definer set search_path=pg_catalog as $$select jsonb_build_object('synthetic',true,'matchId',target_match)$$;`);
   if(scenario==='EMPTY')change(d,"delete from production_control.future_match_google_compatibility_jobs_v1 where tournament_id='2100'");
   if(scenario==='STALE_STRUCTURE')change(d,"update production_control.future_runtime_match_bindings_v2 set runtime_revision=runtime_revision+1 where tournament_id='2100'");
   if(scenario==='TERMINAL')change(d,"update production_control.future_match_google_compatibility_jobs_v1 set status='BLOCKED',safe_error_code='ISOLATED_TERMINAL'where tournament_id='2100'");
   if(scenario==='MULTIPLE'){
    change(d,`insert into production_control.future_match_definitions_v1 select(jsonb_populate_record(null::production_control.future_match_definitions_v1,
      to_jsonb(v)||'{"match_definition_id":"a2600000-0000-4000-8000-000000000002","match_id":"2100-R1-2","match_number":2}'::jsonb)).*from production_control.future_match_definitions_v1 v where tournament_id='2100';
     insert into production_control.future_runtime_match_bindings_v2 select(jsonb_populate_record(null::production_control.future_runtime_match_bindings_v2,
      to_jsonb(v)||'{"match_id":"2100-R1-2"}'::jsonb)).*from production_control.future_runtime_match_bindings_v2 v where tournament_id='2100';
     insert into production_control.future_match_google_compatibility_jobs_v1(tournament_id,match_id,requirement_class,status)
      values('2100','2100-R1-2','REQUIRED_FOR_ROLLBACK_EVIDENCE','PROVISIONING_REQUIRED')`);
    write(d,"select production_control.sync_future_google_writer_job_v2('2100','2100-R1-2')");
   }
   const input={target_tournament_id:'2100',expected_writer_generation_id:writer,destination_workbook_id:'synthetic-local-2100',
    expected_target_contract_fingerprint:'b'.repeat(64),worker_id:'matrix-worker',lease_seconds:60};
   if(scenario==='STALE_GENERATION')input.expected_writer_generation_id='a2600000-0000-4000-8000-000000000009';
   const first=invoke(c,d,'public.claim_production_future_match_google_compatibility_v2',input);
   if(scenario==='MULTIPLE'){
    const second=invoke(c,d,'public.claim_production_future_match_google_compatibility_v2',input);
    assert.ok(first.job&&second.job);assert.notEqual(first.job.jobId,second.job.jobId);
    assert.equal(invoke(c,d,'public.claim_production_future_match_google_compatibility_v2',input).job,null);
   }else assert.equal(first.job,null,JSON.stringify(first));
   results.push({scenario,result:'PASS'});
  }return{results,boundarySubstitutions:['writer admission','manifest input'],superseded:'No SUPERSEDED enum; stale structural authority and terminal BLOCKED explicitly covered'};
 });
 await run('P2C-C-GOOGLE-MATRIX','annual Google exact and queue claims enforce empty, order, lease and terminal states',()=>{
  const d=clone('google_matrix');seedAnnualWorkerBoundary(c,d);
  const general='public.future_production_claim_google_outbox_pre_generation_v1',exact='public.future_production_claim_google_outbox_event_pre_generation_v1',fail='public.future_production_fail_google_outbox_pre_generation_v1';
  const input={...annualWorkerInput,lease_seconds:60};
  assert.equal(invoke(c,d,general,input).event,null);
  const ids=['a2800000-0000-4000-8000-000000000001','a2800000-0000-4000-8000-000000000002'];
  assert.equal(invoke(c,d,exact,{...input,event_id:ids[0]}).code,'OUTBOX_EVENT_NOT_FOUND');
  change(d,`insert into scoring_authority.google_match_checkpoints(match_id)values('2099-R1-1');
   insert into scoring_authority.google_outbox_events(id,tournament_id,match_id,match_revision,mutation_key,event_type,payload,payload_hash)
   values('${ids[0]}','2099','2099-R1-1',1,'matrix-event1','HOLE_SCORE_UPSERTED','{}',repeat('a',64)),
    ('${ids[1]}','2099','2099-R1-1',2,'matrix-event2','HOLE_SCORE_UPSERTED','{}',repeat('b',64))`);
  assert.equal(invoke(c,d,exact,{...input,event_id:ids[1]}).code,'CHECKPOINT_ORDER_CONFLICT');
  const first=invoke(c,d,general,input);assert.equal(first.event.id,ids[0]);
  assert.equal(invoke(c,d,general,input).event,null);
  assert.equal(invoke(c,d,exact,{...input,event_id:ids[0]}).code,'OUTBOX_EVENT_LEASE_ACTIVE');
  assert.equal(invoke(c,d,fail,{...input,event_id:ids[0],worker_id:'wrong-worker'}).code,'OUTBOX_CLAIM_STALE');
  change(d,`update scoring_authority.google_outbox_events set lease_expires_at=clock_timestamp()-interval'1s'where id='${ids[0]}'`);
  assert.equal(invoke(c,d,fail,{...input,event_id:ids[0]}).code,'OUTBOX_CLAIM_STALE');
  assert.equal(invoke(c,d,exact,{...input,event_id:ids[0]}).event.attempts,2);
  assert.equal(invoke(c,d,fail,{...input,event_id:ids[0],block:true}).status,'BLOCKED');
  assert.equal(invoke(c,d,exact,{...input,event_id:ids[0]}).code,'OUTBOX_EVENT_BLOCKED');
  change(d,`update scoring_authority.google_outbox_events set status='DELIVERED'where id='${ids[0]}';
   update scoring_authority.google_match_checkpoints set last_supabase_match_revision=1 where match_id='2099-R1-1'`);
  assert.equal(invoke(c,d,exact,{...input,event_id:ids[0]}).idempotent,true);
  assert.equal(invoke(c,d,general,input).event.id,ids[1]);
  return{empty:true,singleAndMultiple:true,checkpointOrdering:true,activeLease:true,expiredLeaseRetry:true,wrongOwnerDenied:true,
   permanentFailure:true,deliveredReplay:true,scope:'Queue metadata only; no external delivery. DELIVERED is fixture construction, not asserted transport proof.'};
 });
 await run('P2C-C-ARCHIVE-MATRIX','annual archive empty, active, expired, retry and blocked branches retain one job authority',()=>{
  const d=clone('archive_matrix');seedAnnualWorkerBoundary(c,d);
  const claim='public.future_production_claim_scorecard_archive_job_pre_generation_v1',fail='public.future_production_fail_scorecard_archive_job_pre_generation_v1',input={...annualWorkerInput,lease_seconds:60};
  assert.equal(invoke(c,d,claim,input).job,null);
  const id='a2900000-0000-4000-8000-000000000001';
  change(d,`insert into scoring_authority.scorecard_archive_jobs(job_id,tournament_id,match_id,snapshot_id,snapshot_revision,match_revision,event_type,source_fingerprint,archive_payload_hash)
   values('${id}','2099','2099-R1-1','a2900000-0000-4000-8000-000000000002',1,1,'SCORECARD_ARCHIVE_UPSERT',repeat('a',64),repeat('b',64))`);
  const first=invoke(c,d,claim,input);assert.equal(first.job.job_id,id);
  assert.equal(invoke(c,d,claim,input).job,null);
  const failure={...input,job_id:id,claim_token:first.job.claim_token};
  assert.equal(invoke(c,d,fail,{...failure,claim_token:'a2900000-0000-4000-8000-000000000009'}).code,'ARCHIVE_CLAIM_STALE');
  change(d,`update scoring_authority.scorecard_archive_jobs set lease_expires_at=clock_timestamp()-interval'1s'where job_id='${id}'`);
  assert.equal(invoke(c,d,fail,failure).code,'ARCHIVE_CLAIM_STALE');
  const second=invoke(c,d,claim,input);assert.equal(second.job.attempts,2);assert.notEqual(second.job.claim_token,first.job.claim_token);
  assert.equal(invoke(c,d,fail,{...failure,claim_token:second.job.claim_token,retry_after_seconds:2}).status,'RETRYABLE');
  assert.equal(invoke(c,d,claim,input).job,null);
  change(d,`update scoring_authority.scorecard_archive_jobs set available_at=clock_timestamp()-interval'1s'where job_id='${id}'`);
  const third=invoke(c,d,claim,input);assert.equal(third.job.attempts,3);
  assert.equal(invoke(c,d,fail,{...failure,claim_token:third.job.claim_token,block:true}).status,'BLOCKED');
  assert.equal(invoke(c,d,claim,input).job,null);
  return{empty:true,single:true,activeLeaseSkipped:true,wrongTokenRejected:true,expiredLeaseReclaimed:true,
   retryDelayRespected:true,retryClaimed:true,terminalExcluded:true,multipleAndSupersession:'P2C-C-ARCHIVE'};
 });
 await run('P2C-C-ANNUAL-COMPLETION-MATRIX','annual current jobs require exact active claims before completion',()=>{
  const results=[];
  for(const family of ['COMPETITION','INTELLIGENCE'])for(const variant of ['SINGLE','MISSING','WRONG_TOKEN','EXPIRED','SUPERSEDED_CLAIM']){
   const d=clone('completion_matrix');seedAnnualWorkerBoundary(c,d);
   const key=family==='COMPETITION'?'TEAM_MOMENTUM':'TOURNAMENT_INTELLIGENCE';
   seedAnnualCompetitionJobs(c,d,[key]);
   const claimName=family==='COMPETITION'?'public.future_production_claim_competition_derived_jobs_v1':'public.future_production_claim_intelligence_derived_bundle_v1';
   const writeName=family==='COMPETITION'?'public.future_production_write_competition_derived_snapshot_v1':'public.future_production_write_intelligence_derived_bundle_v1';
   const claim=invoke(c,d,claimName,{...annualWorkerInput,engine_keys:[key],lease_seconds:60});
   const value=family==='COMPETITION'?claim.claims[0]:claim;assert.ok(value?.claim_token,JSON.stringify(claim));
   const completion={...annualWorkerInput,round_number:0,engine_key:key,engine_version:'matrix-v1',configuration_fingerprint:'a'.repeat(64),
    source_fingerprint:'b'.repeat(64),payload_hash:'c'.repeat(64),result_payload:{synthetic:true},calculated_by:'phase2c',
    claim_token:value.claim_token,claim_started_at:value.claim_started_at,duration_ms:17,
    engines:[{key,version:'matrix-v1',result:{synthetic:true},payload_hash:'c'.repeat(64),claim_started_at:value.claim_started_at}]};
   if(variant==='MISSING')change(d,"delete from scoring_authority.competition_recalculation_jobs where tournament_id='2099'");
   if(variant==='WRONG_TOKEN')completion.claim_token='a3000000-0000-4000-8000-000000000001';
   if(variant==='EXPIRED')change(d,"update scoring_authority.competition_recalculation_jobs set lease_expires_at=clock_timestamp()-interval'1s'where tournament_id='2099'");
   if(variant==='SUPERSEDED_CLAIM')change(d,"update scoring_authority.competition_recalculation_jobs set status='PENDING',claim_token=null,claimed_by=null,lease_expires_at=null,requested_source_revision='{\"revision\":2}'where tournament_id='2099'");
   const result=invoke(c,d,writeName,completion);
   if(variant==='SINGLE'){assert.equal(result.ok,true);assert.equal(write(d,"select duration_ms from scoring_authority.competition_derived_runs where tournament_id='2099'"),'17');}
   else{assert.equal(result.ok,false);assert.match(result.code,/^STALE_(DERIVED_JOB|INTELLIGENCE_WORKER)$/);assert.equal(write(d,"select count(*)from scoring_authority.competition_derived_snapshots where tournament_id='2099'"),'0');}
   results.push({family,variant,result:result.code||'COMPLETED'});
  }
  const d=clone('empty_bundles');seedAnnualWorkerBoundary(c,d);
  assert.equal(invoke(c,d,'public.future_production_claim_competition_derived_jobs_v1',{...annualWorkerInput,engine_keys:['TEAM_MOMENTUM']}).claims.length,0);
  assert.equal(invoke(c,d,'public.future_production_claim_intelligence_derived_bundle_v1',{...annualWorkerInput,engine_keys:['TOURNAMENT_INTELLIGENCE']}).code,'NO_PENDING_INTELLIGENCE');
  return{results,emptyQueues:true,multipleJobs:'P2C-C-COMPETITION and P2C-C-INTELLIGENCE',scope:'No new scoring or financial payload semantics; exact current derived job authorization only'};
 });
 await run('P2C-C-ODDS-MATRIX','annual Odds completion rejects absent, stale and superseded exact jobs',()=>{
  const results=[];
  for(const variant of ['MISSING','WRONG_TOKEN','EXPIRED','SUPERSEDED','MULTIPLE']){
   const d=clone('odds_matrix');seedAnnualWorkerBoundary(c,d);const input=seedAnnualOddsCompletion(c,d);
   if(variant==='MISSING')change(d,`delete from scoring_authority.odds_calculation_jobs where job_id='${input.job_id}'`);
   if(variant==='WRONG_TOKEN')input.claim_token='a3100000-0000-4000-8000-000000000001';
   if(variant==='EXPIRED')change(d,`update scoring_authority.odds_calculation_jobs set lease_expires_at=clock_timestamp()-interval'1s'where job_id='${input.job_id}'`);
   if(variant==='SUPERSEDED')change(d,`update scoring_authority.odds_calculation_jobs set status='SUPERSEDED',publication_status='STALE',superseded_at=clock_timestamp(),claim_token=null,lease_owner=null,lease_expires_at=null where job_id='${input.job_id}'`);
   let other;
   if(variant==='MULTIPLE'){
    change(d,`insert into scoring_authority.odds_calculation_jobs select(jsonb_populate_record(null::scoring_authority.odds_calculation_jobs,
     to_jsonb(j)||jsonb_build_object('job_id',repeat('d',64),'invocation_fingerprint',repeat('d',64),'status','SUPERSEDED',
      'publication_status','STALE','superseded_at',clock_timestamp(),'claim_token',null,'lease_owner',null,'lease_expires_at',null))).*
     from scoring_authority.odds_calculation_jobs j where job_id='${input.job_id}'`);
    other=write(d,"select to_jsonb(j)::text from scoring_authority.odds_calculation_jobs j where job_id=repeat('d',64)");
   }
   const result=invoke(c,d,'public.future_production_dispatch_odds_pre_withdrawal_v1',input);
   if(variant==='MULTIPLE'){assert.equal(result.ok,true);assert.equal(write(d,"select to_jsonb(j)::text from scoring_authority.odds_calculation_jobs j where job_id=repeat('d',64)"),other);}
   else{assert.equal(result.ok,false);assert.match(result.code,/ODDS_CALCULATION_(JOB_NOT_FOUND|CLAIM_STALE|JOB_SUPERSEDED)/);}
   assert.equal(write(d,"select count(*)from scoring_authority.odds_published_snapshots where tournament_id='2099'"),'0');
   results.push({variant,result:result.code||'COMPLETED'});
  }return{results,scope:'Corrected completion branch. No automatic Odds publication or full Odds lifecycle claim.'};
 });
 await run('P2C-C-COMPETITION-RETRY','annual Competition expiration preserves bounded retry and rejects the retired claim',async()=>{
  const d=clone('competition_retry');seedAnnualWorkerBoundary(c,d);seedAnnualCompetitionJobs(c,d,['TEAM_MOMENTUM']);
  const input={...annualWorkerInput,engine_keys:['TEAM_MOMENTUM'],lease_seconds:60};
  const first=invoke(c,d,'public.future_production_claim_competition_derived_jobs_v1',input).claims[0];assert.ok(first);
  change(d,"update scoring_authority.competition_recalculation_jobs set lease_expires_at=clock_timestamp()-interval'1s'where tournament_id='2099'");
  assert.equal(invoke(c,d,'public.future_production_claim_competition_derived_jobs_v1',input).claims.length,0);
  const delay=Math.ceil(Number(write(d,"select greatest(0,extract(epoch from(delivery_available_at-clock_timestamp()))*1000)from scoring_authority.competition_recalculation_jobs where tournament_id='2099'and engine_key='TEAM_MOMENTUM'")))+100;
  assert.ok(delay<=4500);await new Promise(resolve=>setTimeout(resolve,delay));
  const retry=invoke(c,d,'public.future_production_claim_competition_derived_jobs_v1',input).claims[0];assert.ok(retry);assert.notEqual(retry.claim_token,first.claim_token);
  const old={...annualWorkerInput,round_number:0,engine_key:'TEAM_MOMENTUM',engine_version:'matrix-v1',configuration_fingerprint:'a'.repeat(64),
   source_fingerprint:'b'.repeat(64),payload_hash:'c'.repeat(64),result_payload:{synthetic:true},calculated_by:'phase2c',
   claim_token:first.claim_token,claim_started_at:first.claim_started_at,duration_ms:17};
  assert.equal(invoke(c,d,'public.future_production_write_competition_derived_snapshot_v1',old).code,'STALE_DERIVED_JOB');
  assert.equal(write(d,"select count(*)from scoring_authority.competition_derived_snapshots where tournament_id='2099'"),'0');
  assert.equal(invoke(c,d,'public.future_production_write_competition_derived_snapshot_v1',{...old,claim_token:retry.claim_token,claim_started_at:retry.claim_started_at}).ok,true);
  return{actualAnnualClaim:true,backoffMs:delay,retiredClaimRejected:true,retriedClaimCompleted:true,attempts:2};
 });
 await run('P2C-C-FROZEN-COMPLETION','supported frozen completion wrappers preserve exact claims and duration bounds',()=>{
  const rows=[];
  for(const family of ['COMPETITION','INTELLIGENCE'])for(const scenario of ['NULL','NEGATIVE','POSITIVE','MISSING','WRONG_STARTED','MULTIPLE']){
   const d=clone('frozen_completion');
   change(d,"delete from scoring_authority.competition_recalculation_jobs where tournament_id='2026';update production_control.resource_scope set workers_enabled=true where scope_key='BAGGER_INV_PRODUCTION';update production_control.cutover_activation_state set read_cutover_phase='WORKERS'where scope_key='BAGGER_INV_PRODUCTION'");
   const keys=family==='COMPETITION'?['TEAM_MOMENTUM','TOURNAMENT_STORYLINES']:['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL'];
   const selected=scenario==='MULTIPLE'?keys:[keys[0]],writer=family==='COMPETITION'?'write_competition_derived_snapshot':'write_intelligence_derived_bundle';
   assert.equal(write(d,`select to_regprocedure('public.${writer}_frozen_2026_installed_v1(jsonb)')is null`),'t','public wrapper must reach the corrected private core');
   change(d,`insert into scoring_authority.competition_recalculation_jobs(tournament_id,round_number,engine_key,status)
    select '2026',0,key,'PENDING'from jsonb_array_elements_text(${jsonLiteral(keys)})key`);
   const scope=runtimeScope({worker_id:'phase2c-frozen-matrix',requested_by:'phase2c-frozen-matrix',engine_keys:selected,lease_seconds:60});
   const publicCall=(name,input)=>JSON.parse(sql(c,d,`select public.${name}(${jsonLiteral(input)})`));
   const claim=publicCall(family==='COMPETITION'?'claim_competition_derived_jobs':'claim_intelligence_derived_bundle',scope);
   const claimed=family==='COMPETITION'?claim.claims[0]:claim;assert.ok(claimed?.claim_started_at,JSON.stringify(claim));
   const beforeSibling=write(d,`select to_jsonb(j)::text from scoring_authority.competition_recalculation_jobs j where tournament_id='2026'and engine_key='${keys[1]}'`);
   const at=scenario==='WRONG_STARTED'?'2001-01-01T00:00:00Z':claimed.claim_started_at;
   const input={...scope,round_number:0,engine_key:keys[0],engine_version:'matrix-v1',configuration_fingerprint:'a'.repeat(64),source_fingerprint:'b'.repeat(64),
    payload_hash:'c'.repeat(64),result_payload:{synthetic:true},calculated_by:'phase2c',claim_started_at:at,
    duration_ms:scenario==='NULL'?null:scenario==='NEGATIVE'?-17:17,
    engines:selected.map(key=>({key,version:'matrix-v1',result:{synthetic:true},payload_hash:'c'.repeat(64),claim_started_at:at}))};
   if(scenario==='MISSING')change(d,`delete from scoring_authority.competition_recalculation_jobs where tournament_id='2026'and engine_key='${keys[0]}'`);
   const completed=publicCall(writer,input);
   if(['MISSING','WRONG_STARTED'].includes(scenario)){
    assert.equal(completed.ok,false);assert.match(completed.code,/^STALE_(DERIVED_JOB|INTELLIGENCE_WORKER)$/);
    assert.equal(write(d,"select count(*)from scoring_authority.competition_derived_snapshots where tournament_id='2026'"),'0');
   }else{
    assert.equal(completed.ok,true,JSON.stringify(completed));
    const expected=scenario==='NULL'||scenario==='NEGATIVE'?0:17;
    const durations=json(c,d,"select jsonb_agg(duration_ms)from scoring_authority.competition_derived_runs where tournament_id='2026'");assert.ok(durations.every(v=>v===expected));
    const snapshot=write(d,"select jsonb_agg(to_jsonb(s)order by engine_key)::text from scoring_authority.competition_derived_snapshots s where tournament_id='2026'");
    const replay=publicCall(writer,input);assert.equal(replay.ok,false);assert.match(replay.code,/^STALE_(DERIVED_JOB|INTELLIGENCE_WORKER)$/);
    assert.equal(write(d,"select jsonb_agg(to_jsonb(s)order by engine_key)::text from scoring_authority.competition_derived_snapshots s where tournament_id='2026'"),snapshot);
   }
   if(family==='COMPETITION'||scenario!=='MULTIPLE')assert.equal(write(d,`select to_jsonb(j)::text from scoring_authority.competition_recalculation_jobs j where tournament_id='2026'and engine_key='${keys[1]}'`),beforeSibling);
   rows.push({family,scenario,result:completed.code||'COMPLETED',correctedPrivateCoreReached:true});
  }
  return{rows,leaseSemantics:'Frozen cores authorize RUNNING plus exact started_at; expiry retirement/reclaim belongs to delivery tick. No independent lease-token or immediate expiry denial is claimed.',queueSelection:'Not applicable to exact completion; claim matrix and delivery lease tests cover selection and retry.'};
 });
 await run('P2C-C-ANNUAL-MIXED-BUNDLE','annual Intelligence leaves mixed terminal and delayed siblings unchanged',()=>{
  const rows=[];
  for(const scenario of ['TERMINAL','DELAYED','RUNNING']){
   const d=clone('annual_mixed_bundle');seedAnnualWorkerBoundary(c,d);
   seedAnnualCompetitionJobs(c,d,['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']);
   if(scenario==='TERMINAL')change(d,"update scoring_authority.competition_recalculation_jobs set status='FAILED',delivery_attempts=5,delivery_dead_letter_at=clock_timestamp(),delivery_error_class='TERMINAL',completed_at=clock_timestamp()where tournament_id='2099'and engine_key='PROJECTION_EDITORIAL'");
   if(scenario==='DELAYED')change(d,"update scoring_authority.competition_recalculation_jobs set delivery_available_at=clock_timestamp()+interval'1minute'where tournament_id='2099'and engine_key='PROJECTION_EDITORIAL'");
   if(scenario==='RUNNING'){
    const first=invoke(c,d,'public.future_production_claim_intelligence_derived_bundle_v1',{...annualWorkerInput,engine_keys:['PROJECTION_EDITORIAL'],lease_seconds:60});assert.ok(first.claim_token);
   }
   const before=write(d,"select jsonb_agg(to_jsonb(j)order by engine_key)::text from scoring_authority.competition_recalculation_jobs j where tournament_id='2099'");
   const result=invoke(c,d,'public.future_production_claim_intelligence_derived_bundle_v1',{...annualWorkerInput,engine_keys:['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL'],lease_seconds:60});
   assert.equal(result.code,scenario==='RUNNING'?'INTELLIGENCE_LEASE_ACTIVE':'NO_PENDING_INTELLIGENCE');
   assert.equal(write(d,"select jsonb_agg(to_jsonb(j)order by engine_key)::text from scoring_authority.competition_recalculation_jobs j where tournament_id='2099'"),before);
   rows.push({scenario,result:result.code,rowsUnchanged:true});
  }return{rows,actualAnnualFunction:true,terminalState:'FAILED plus delivery_dead_letter_at; no SUPERSEDED enum exists for per-engine current jobs'};
 });
}
