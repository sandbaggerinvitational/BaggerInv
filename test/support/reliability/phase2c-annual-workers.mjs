// Proof layer: POSTGRESQL. Synthetic 2099 worker contracts; not annual admission proof.
// Only owned socket-only fixture handles are accepted by the SQL helper.
import { createHash } from 'node:crypto';
import { sql, jsonLiteral } from './postgres17.mjs';
import { syntheticDirector, syntheticRuntime } from './synthetic-tournament.mjs';
export const annualWorkerGeneration = 'a2200000-0000-4000-8000-000000000003';
export const annualWorkerInput = Object.freeze({expected_current_tournament_id:'2099',
  expected_runtime_generation_id:annualWorkerGeneration,worker_id:'synthetic-annual-worker'});
export function seedAnnualWorkerBoundary(c,d) {
  sql(c,d,`begin;set local session_replication_role=replica;
    insert into scoring_authority.tournaments select(jsonb_populate_record(null::scoring_authority.tournaments,
      to_jsonb(t)||'{"tournament_id":"2099","tournament_year":2099,"source_workbook_id":"synthetic-annual-worker-2099"}'::jsonb)).*
      from scoring_authority.tournaments t where tournament_id='2026';
    insert into production_control.future_annual_runtime_generations_v1(runtime_generation_id,tournament_id,
      generation_status,runtime_revision,pointer_revision,authority_generation_id,admission_generation_id,
      authority,ingress_state,readiness_fingerprint,activated_at)
      values('${annualWorkerGeneration}','2099','ACTIVE',1,2,'${annualWorkerGeneration}',
        '${annualWorkerGeneration}','SUPABASE','OPEN',repeat('a',64),clock_timestamp());
    insert into production_control.annual_scoring_runtime_authorities_v1(runtime_generation_id,tournament_id,
      platform_tournament_id,platform_authority_generation_id,platform_admission_generation_id,pointer_revision,
      lifecycle_revision,authority_generation_id,admission_generation_id,google_writer_generation_id,
      destination_workbook_id,google_target_contract_fingerprint,authority_status,admission_state,
      admission_revision,legacy_root_closure_id,predecessor_tournament_id,predecessor_closure_id,
      predecessor_boundary_fingerprint,activated_by_player_id,activated_by_auth_user_id)
    values('${annualWorkerGeneration}','2099','2026','${annualWorkerGeneration}','${annualWorkerGeneration}',2,1,
      '${annualWorkerGeneration}','${annualWorkerGeneration}','${annualWorkerGeneration}',
      'synthetic-annual-worker-2099',repeat('a',64),'ACTIVE','OPEN',1,'${annualWorkerGeneration}',
      '2026','${annualWorkerGeneration}',repeat('a',64),'P01','10000000-0000-4000-8000-000000000001');
    update production_control.current_tournament_pointer_v1 set tournament_id='2099',pointer_revision=2;
    commit;
    create or replace function production_control.assert_future_production_scoring_runtime_v1(
      input jsonb, required_worker text default null)returns text language plpgsql security definer
      set search_path=pg_catalog as $$begin
      if input->>'expected_current_tournament_id' is distinct from '2099'
        or input->>'expected_runtime_generation_id' is distinct from '${annualWorkerGeneration}'
      then raise exception using errcode='42501',message='ISOLATED_ANNUAL_WORKER_SCOPE';end if;
      return '2099';end$$;`,{role:''});
}
export function seedAnnualCompetitionJobs(c,d,engines=['TEAM_MOMENTUM','TOURNAMENT_STORYLINES']) {
  sql(c,d,`insert into scoring_authority.competition_recalculation_jobs(tournament_id,round_number,
    engine_key,status,runtime_generation_id)select '2099',0,e,'PENDING','${annualWorkerGeneration}'
    from jsonb_array_elements_text(${jsonLiteral(engines)})e`,{role:''});
}
export function seedAnnualOddsCompletion(c,d) {
  // Build only the two Odds template rows needed here; no unrelated historical seed scans.
  sql(c,d,`begin;set local session_replication_role=replica;
    insert into scoring_authority.odds_input_configurations(
      id,tournament_id,configuration_revision,source_workbook_id,settings,
      historical_ratings,settings_fingerprint,ratings_fingerprint,
      pairing_fingerprint,bundle_fingerprint,is_current,imported_by,imported_at,
      source_tab,source_fingerprint,canonical_settings,effective_settings,
      effective_settings_fingerprint,settings_contract_version,validation_status,
      validation_diagnostics,synchronized_at
    ) select md5('odds-config:'||n)::uuid,'2026',n,'synthetic-local-only','[]',
      jsonb_build_object('synthetic',true),
      encode(extensions.digest('odds-settings:'||n,'sha256'),'hex'),
      encode(extensions.digest('odds-ratings:'||n,'sha256'),'hex'),
      encode(extensions.digest('odds-pairing:'||n,'sha256'),'hex'),
      encode(extensions.digest('odds-bundle:'||n,'sha256'),'hex'),
      n=1,'reliability-fixture',
      '2026-08-02T00:00:00Z'::timestamptz+n*interval '1 second','Synthetic',
      encode(extensions.digest('odds-source:'||n,'sha256'),'hex'),
      '{}'::jsonb,'{}'::jsonb,
      encode(extensions.digest('odds-effective:'||n,'sha256'),'hex'),
      'prediction-settings-v1','VALID',jsonb_build_object('synthetic',true),
      '2026-08-02T00:00:00Z'::timestamptz+n*interval '1 second'
    from generate_series(1,1) as generated(n);
    insert into scoring_authority.odds_calculation_jobs(
      job_id,tournament_id,phase,total_iterations,completed_iterations,
      engine_version,publication_contract_version,checkpoint_contract_version,
      deterministic_seed,input_fingerprint,settings_fingerprint,
      invocation_fingerprint,source_revision,input_snapshot,checkpoint_payload,
      checkpoint_hash,checkpoint_count,status,attempt_count,requested_by,
      requested_at,updated_at,completed_at,output_timestamp,result_payload,
      result_fingerprint,output_payload_bytes,resource_metrics,
      publication_status,publication_reference,input_configuration_id,
      effective_settings_fingerprint,input_bundle_fingerprint,
      production_operation_mode,production_deployment_commit,
      production_candidate_hostname,lease_owner
    ) select encode(extensions.digest('odds-job:'||n,'sha256'),'hex'),'2026',
      (array['Pre-Tournament','After Round 1','After Round 2',
        'Round 3 Pairings Announced','Final Results'])[1+((n-1)%5)],
      10000,10000,'synthetic-odds-v1','production-odds-publication-v1',
      'synthetic-checkpoint-v1','synthetic-seed-'||n,
      encode(extensions.digest('odds-input:'||n,'sha256'),'hex'),
      encode(extensions.digest('odds-settings:'||n,'sha256'),'hex'),
      encode(extensions.digest('odds-job:'||n,'sha256'),'hex'),
      jsonb_build_object('production_job_identity_contract',
        'production-odds-calculation-job-identity-v2','synthetic',true),
      jsonb_build_object('synthetic',true),jsonb_build_object('synthetic',true),
      encode(extensions.digest('odds-checkpoint:'||n,'sha256'),'hex'),1,
      'SUPERSEDED',1,'reliability-fixture',
      '2026-08-03T00:00:00Z'::timestamptz+n*interval '1 second',
      '2026-08-03T00:00:01Z'::timestamptz+n*interval '1 second',
      '2026-08-03T00:00:01Z'::timestamptz+n*interval '1 second',
      '2026-08-03T00:00:01Z'::timestamptz+n*interval '1 second',
      jsonb_build_object('synthetic',true),
      encode(extensions.digest('odds-result:'||n,'sha256'),'hex'),128,
      jsonb_build_object('synthetic',true),'STALE','{}'::jsonb,
      md5('odds-config:'||(1+((n-1)%1)))::uuid,
      encode(extensions.digest('odds-effective:'||n,'sha256'),'hex'),
      encode(extensions.digest('odds-bundle-job:'||n,'sha256'),'hex'),
      'PRODUCTION_CUTOVER',repeat('7',40),null,null
    from generate_series(1,1) as generated(n);
commit;`,{role:''});
  const job=JSON.parse(sql(c,d,'select to_jsonb(j)from scoring_authority.odds_calculation_jobs j limit 1',{role:''}));
  const config=JSON.parse(sql(c,d,`select to_jsonb(c)from scoring_authority.odds_input_configurations c where id='${job.input_configuration_id}'`,{role:''}));
  const jobId='a'.repeat(64),configId='a2200000-0000-4000-8000-000000000001',token='a2200000-0000-4000-8000-000000000002';
  sql(c,d,`begin;set local session_replication_role=replica;
    insert into scoring_authority.odds_input_configurations select(jsonb_populate_record(null::scoring_authority.odds_input_configurations,
      ${jsonLiteral(config)}||jsonb_build_object('id','${configId}','tournament_id','2099'))).*;
    insert into scoring_authority.odds_calculation_jobs select(jsonb_populate_record(null::scoring_authority.odds_calculation_jobs,
      ${jsonLiteral(job)}||jsonb_build_object('job_id','${jobId}','tournament_id','2099','input_configuration_id','${configId}',
      'input_bundle_fingerprint','${config.bundle_fingerprint}','runtime_generation_id','${annualWorkerGeneration}',
      'status','RUNNING','publication_status','NOT_REQUESTED','publication_reference','{}'::jsonb,
      'result_payload',null,'result_fingerprint',null,'completed_at',null,'claim_token','${token}',
      'lease_owner','synthetic-worker','lease_expires_at',clock_timestamp()+interval'60s',
      'completed_iterations',${Number(job.total_iterations)},'invocation_fingerprint','${jobId}'))).*;commit;
    create or replace function production_control.assert_annual_odds_runtime_v1(input jsonb,expected_odds_operation text)
      returns text language plpgsql security definer set search_path=pg_catalog as $$begin
      if input->>'expected_current_tournament_id' is distinct from '2099'
        or expected_odds_operation<>'complete_production_odds_calculation_job' then raise exception 'ISOLATED_ODDS_SCOPE';end if;
      return '2099';end$$;
    create or replace function production_control.assert_annual_odds_job_scope_v1(input jsonb,target text,retained scoring_authority.odds_calculation_jobs)
      returns void language plpgsql security definer set search_path=pg_catalog as $$begin
      if target<>'2099' or retained.tournament_id<>target or retained.runtime_generation_id<>'${annualWorkerGeneration}'::uuid
        then raise exception 'ISOLATED_ODDS_JOB_SCOPE';end if;end$$;
    create or replace function production_control.current_annual_odds_inputs_v1(target text,destination_workbook text,input jsonb,require_exact_revision boolean default true)
      returns scoring_authority.odds_input_configurations language sql security definer set search_path=pg_catalog
      as $$select*from scoring_authority.odds_input_configurations where id='${configId}'::uuid and tournament_id=target$$;`,{role:''});
  const payload={year:2099,phase:job.phase},canonical=JSON.stringify(payload);
  return {...annualWorkerInput,annual_odds_operation:'complete_production_odds_calculation_job',
    annual_destination_workbook_id:'synthetic-annual-worker-2099',job_id:jobId,claim_token:token,
    result_payload:payload,result_canonical_json:canonical,result_fingerprint_payload:payload,
    result_fingerprint:createHash('sha256').update(canonical).digest('hex'),output_payload_bytes:123};
}

// A separate fixture version extends Phase2 evidence with real Singles entries.
export function seedThreeRoundNetSkinsConfiguration(cluster, database) {
  sql(cluster, database, `begin; set local session_replication_role=replica;
    insert into production_control.net_skins_entry_revisions_v1(tournament_id,round_number,revision,
      request_id,request_hash,field_fingerprint,configured,entries,actor_player_id,actor_auth_user_id,created_at,response)
    select '2026',rn,1,md5('processor-entry:'||rn)::uuid,repeat('d',64),
      production_control.tournament_setup_hash_v1(production_control.net_skins_entry_field_v1('2026',rn)),true,
      (select jsonb_agg(item||'{"entered":true}'::jsonb) from jsonb_array_elements(production_control.net_skins_entry_field_v1('2026',rn)) item),
      '${syntheticDirector.playerId}','${syntheticDirector.authUserId}','2026-08-01T00:00:00Z','{}'
    from generate_series(1,3) rn;
    update scoring_authority.net_skins_v1_configuration_revisions set
      configuration_manifest=production_control.full_net_skins_manifest_v2('2026',array[1,2,3],'{"1":1,"2":1,"3":1}')
    where configuration_revision_id=(select configuration_revision_id from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026');
    update scoring_authority.net_skins_v1_configuration_revisions set
      configuration_fingerprint=production_control.net_skins_v1_hash(configuration_manifest)
    where configuration_revision_id=(select configuration_revision_id from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026');
    delete from scoring_authority.net_skins_configuration_entries
    where tournament_id='2026';
    delete from scoring_authority.net_skins_configurations
    where tournament_id='2026';
    with manifest as (
      select configuration_revision,configuration_manifest
      from scoring_authority.net_skins_v1_configuration_revisions
      where configuration_revision_id=(select configuration_revision_id
        from scoring_authority.net_skins_v1_configuration_current
        where tournament_id='2026')
    ), rounds as (
      select manifest.configuration_revision,item.round_value
      from manifest cross join lateral
        jsonb_array_elements(manifest.configuration_manifest->'rounds')
          as item(round_value)
    )
    insert into scoring_authority.net_skins_configurations(
      tournament_id,round_number,format,enabled,entry_type,buy_in_per_entry,
      expected_pot,completion_rule,payout_rounding,tie_rule,
      configuration_revision,configuration_fingerprint,source_workbook_id,
      imported_by,imported_at,approved_at,updated_at)
    select '2026',(round_value->>'round_number')::integer,
      round_value->>'format',true,round_value->>'entry_type',
      (round_value->>'buy_in_per_entry')::numeric,
      (round_value->>'expected_pot')::numeric,round_value->>'completion_rule',
      round_value->>'payout_rounding',round_value->>'tie_rule',
      configuration_revision,round_value->>'configuration_fingerprint',
      '${syntheticRuntime.sourceWorkbookId}','reliability-fixture',
      clock_timestamp(),clock_timestamp(),clock_timestamp()
    from rounds;
    with manifest as (
      select configuration_manifest
      from scoring_authority.net_skins_v1_configuration_revisions
      where configuration_revision_id=(select configuration_revision_id
        from scoring_authority.net_skins_v1_configuration_current
        where tournament_id='2026')
    ), entries as (
      select round_item.round_value,entry_item.entry_value
      from manifest
      cross join lateral jsonb_array_elements(configuration_manifest->'rounds')
        as round_item(round_value)
      cross join lateral jsonb_array_elements(round_item.round_value->'entries')
        as entry_item(entry_value)
    )
    insert into scoring_authority.net_skins_configuration_entries(
      tournament_id,round_number,entry_id,match_number,format,
      player_id_1,player_id_2,team_handicap,buy_in,eligible,source_payload)
    select '2026',(round_value->>'round_number')::integer,
      entry_value->>'entry_id',entry_value->>'match_number',
      round_value->>'format',entry_value->>'player_id_1',
      nullif(entry_value->>'player_id_2',''),
      nullif(entry_value->>'team_handicap','')::numeric,
      (entry_value->>'buy_in')::numeric,
      coalesce((entry_value->>'eligible')::boolean,false),
      jsonb_build_object(
        'Entry Revision',entry_value->'entry_revision',
        'Entry Key',entry_value->>'entry_key',
        'Entry Binding Fingerprint',entry_value->>'binding_fingerprint',
        'Canonical Match ID',entry_value->>'match_id',
        'Net Handicap Basis','production-full-course-handicap-v1',
        'Individual Stroke Allocation',
          entry_value->>'individual_stroke_allocation')
    from entries;

    delete from scoring_authority.finalized_scorecard_snapshots where match_id='2026-R1-1';
    update scoring_authority.matches set status='LIVE',scoring_locked=false,
      scorecard_complete=false,finalized_at=null where match_id='2026-R1-1';
    update scoring_authority.scoring_permissions set can_score=true,revoked_at=null
      where match_id='2026-R1-1';
    commit;`, { role: "" });
}

// Focused claim/lease fixture: synthetic annual configuration and auction facts.
// Financial calculation and full annual admission are separate proof layers.
export function seedAnnualCalcuttaClaim(c,d) {
  seedAnnualWorkerBoundary(c,d);
  const config='a2700000-0000-4000-8000-000000000001';
  const auction='a2700000-0000-4000-8000-000000000002';
  const job='a2700000-0000-4000-8000-000000000003';
  sql(c,d,`begin;set local session_replication_role=replica;
    insert into scoring_authority.calcutta_v1_configuration_revisions(configuration_revision_id,tournament_id,
      configuration_revision,contract_version,state,configuration_manifest,configuration_fingerprint,
      resource_fingerprint,activation_revision,configured_by_player_id,configured_by_auth_user_id,
      request_fingerprint,request_payload_hash,configured_at)
      values('${config}','2099',1,'production-calcutta-v1','CONFIGURED',
        '{"point_structure":[],"payout_structure":[],"financial_contract":{"synthetic":true}}',repeat('a',64),
        repeat('b',64),139,'P01','${syntheticDirector.authUserId}',repeat('1',64),repeat('2',64),clock_timestamp());
    insert into scoring_authority.calcutta_v1_auction_fact_revisions(auction_revision_id,tournament_id,
      auction_revision,state,auction_manifest,auction_fingerprint,resource_fingerprint,activation_revision,
      recorded_by_player_id,recorded_by_auth_user_id,request_fingerprint,request_payload_hash,recorded_at)
      values('${auction}','2099',1,'AUCTION_COMPLETE','{"purchases":[],"ownership":[],"pot":0}',
        repeat('c',64),repeat('d',64),139,'P01','${syntheticDirector.authUserId}',repeat('3',64),repeat('4',64),clock_timestamp());
    insert into scoring_authority.calcutta_v1_current(tournament_id,configuration_revision_id,configuration_revision,
      configuration_fingerprint,auction_revision_id,auction_revision,auction_fingerprint,state)
      values('2099','${config}',1,repeat('a',64),'${auction}',1,repeat('c',64),'AUCTION_COMPLETE');
    insert into scoring_authority.calcutta_v1_recalculation_jobs(job_id,tournament_id,configuration_revision_id,
      configuration_revision,configuration_fingerprint,auction_revision_id,auction_revision,auction_fingerprint,
      activation_revision,source_revision,source_fingerprint,status,reason,requested_by,runtime_generation_id)
      select '${job}','2099','${config}',1,repeat('a',64),'${auction}',1,repeat('c',64),139,
        production_control.calcutta_v1_source_revision('2099'),
        production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2099')),
        'PENDING','ISOLATED_ANNUAL_CLAIM','phase2c','${annualWorkerGeneration}';commit;
    create or replace function production_control.assert_annual_calcutta_runtime_v1(input jsonb,expected_operation text)
      returns text language plpgsql security definer set search_path=pg_catalog as $$begin
      if input->>'expected_current_tournament_id'<>'2099' then raise exception 'ISOLATED_CALCUTTA_SCOPE';end if;
      return '2099';end$$;`,{role:''});
  return {...annualWorkerInput,contract_version:'production-calcutta-v1',expected_activation_revision:139,
    expected_configuration_revision:1,expected_configuration_fingerprint:'a'.repeat(64),
    expected_auction_revision:1,expected_auction_fingerprint:'c'.repeat(64),request_fingerprint:'e'.repeat(64)};
}

// Explicit synthetic provisioning facts; actual writer sync and claim SQL execute.
export function seedFutureGoogleCompatibility(c,d) {
 const writer='a2600000-0000-4000-8000-000000000001';
 sql(c,d,`begin;set local session_replication_role=replica;
 insert into production_control.future_match_definitions_v1(tournament_id,match_id,round_number,match_number,format,team_size,setup_revision,created_by_player_id)
 values('2100','2100-R1-1',1,1,'BB',2,1,'P01');
 insert into production_control.future_runtime_match_bindings_v2(tournament_id,match_id,
 structural_setup_revision,runtime_revision,runtime_state,configuration_fingerprint)
 values('2100','2100-R1-1',1,1,'PREPARED',repeat('a',64));
 insert into production_control.future_google_writer_generations_v2(writer_generation_id,contract_version,destination_workbook_id,
 implementation_fingerprint,certification_status)values('${writer}','production-future-google-match-provisioning-v2',
 'synthetic-local-2100',repeat('d',64),'CERTIFIED');
 insert into production_control.future_google_writer_targets_v2(tournament_id,writer_generation_id,destination_workbook_id,
 target_contract_fingerprint,contract_status,certification_contract_version,resource_revision,promotion_revision,
 source_setup_revision,promoted_manifest_fingerprint,resource_binding_fingerprint)
 values('2100','${writer}','synthetic-local-2100',repeat('b',64),'CERTIFIED',
 'production-annual-google-writer-certification-v1',1,1,1,repeat('c',64),repeat('d',64));
 insert into production_control.future_match_google_compatibility_jobs_v1(tournament_id,match_id,requirement_class,status)
 values('2100','2100-R1-1','REQUIRED_FOR_ROLLBACK_EVIDENCE','PROVISIONING_REQUIRED');commit;`,{role:''});
 return writer;
}
