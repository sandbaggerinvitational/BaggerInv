-- CLI scaffold20261002213402 mapped to repository forward ordinal143.
-- Certification owner-requested calculation/publication; no automatic publication.
-- Historical Production wrappers remain admitted exactly as before; no historical data adopted.
begin;
create temporary table certification_odds_original_attributes on commit drop as
select oid,proowner,proacl,prosecdef,proconfig,provolatile,prosrc from pg_proc where oid in(
 'public.future_production_dispatch_odds_pre_withdrawal_v1(jsonb)'::regprocedure,
 'production_control.publish_annual_odds_v1(jsonb,text)'::regprocedure);

-- Keep each existing Production CHECK expression verbatim behind its original
-- operation modes. Certification is a distinct, constrained provenance branch.
do $checks$ declare name text; old_expression text; cert_expression text;
begin
 foreach name in array array['production_odds_operation_mode_check','production_odds_initial_publication_separation_check','production_odds_step11_rehearsal_fixture_check']loop
  select pg_get_expr(conbin,conrelid)into strict old_expression from pg_constraint
   where conrelid='scoring_authority.odds_calculation_jobs'::regclass and conname=name;
  cert_expression:=$cert$(production_operation_mode='CERTIFICATION' and production_deployment_commit ~ '^[0-9a-f]{40}$'
   and production_candidate_hostname is null and source_revision->>'certification_odds_contract'='certification-odds-v1'
   and source_revision->>'resource_class'='CERTIFICATION' and source_revision->>'resource_id' like 'CERTIFICATION:%'
   and source_revision->>'installation_id' ~ '^[0-9a-f-]{36}$'
   and source_revision->>'certification_ingress_generation_id' ~ '^[0-9a-f-]{36}$'
   and not(source_revision ?| array['rehearsal_fixture_contract','rehearsal_fixture_fingerprint','rehearsal_namespace','google_publication_reference'])
   and not(coalesce(input_snapshot->'metadata','{}'::jsonb)?'productionRehearsalFixture')
   and ((status='SUCCEEDED' and publication_status='READY' and publication_reference='{}'::jsonb)
    or(status='SUCCEEDED' and publication_status='PUBLISHED'
     and publication_reference->>'contract_version'='production-odds-publication-v1'
     and publication_reference->>'snapshot_id' ~ '^[0-9a-f-]{36}$'
     and (publication_reference->>'publication_revision')::bigint>0
     and (publication_reference->>'expected_predecessor_revision')::bigint>=0
     and publication_reference?'expected_predecessor_snapshot_id'
     and publication_reference->>'request_fingerprint' ~ '^[0-9a-f]{64}$')
    or(status='SUPERSEDED' and publication_status='STALE' and publication_reference='{}'::jsonb)
    or(status in('PENDING','RUNNING','RETRYABLE','FAILED')and publication_status='NOT_REQUESTED'and publication_reference='{}'::jsonb)))$cert$;
  execute format('alter table scoring_authority.odds_calculation_jobs drop constraint %I',name);
  execute format('alter table scoring_authority.odds_calculation_jobs add constraint %I check(case when production_operation_mode=''CERTIFICATION'' then coalesce(%s,false) else (%s) end)',name,cert_expression,old_expression);
 end loop;
end;$checks$;

create table production_control.certification_odds_receipts_v1(
 resource_id text not null references production_control.canonical_resource_v1(resource_id),
 tournament_id text not null references scoring_authority.tournaments(tournament_id),
 operation_request_id uuid not null, operation_name text not null check(operation_name in('request_production_odds_calculation_job','publish_production_championship_odds_v1')),
 actor_auth_user_id uuid not null,actor_player_id text not null,
 request_hash text not null check(request_hash~'^[0-9a-f]{64}$'),
 canonical_context jsonb not null,result jsonb not null,
 committed_at timestamptz not null default clock_timestamp(),
 primary key(resource_id,tournament_id,operation_request_id));
alter table production_control.certification_odds_receipts_v1 enable row level security;
revoke all on production_control.certification_odds_receipts_v1 from public,anon,authenticated,service_role;
create trigger certification_odds_receipt_immutable_v1 before update or delete on production_control.certification_odds_receipts_v1
 for each row execute function production_control.reject_future_runtime_immutable_v2();

create function production_control.certification_odds_runtime_v1(context jsonb)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb:=production_control.current_certification_context_v1();g production_control.certification_ingress_generations_v1%rowtype;
 annual production_control.future_annual_runtime_generations_v1%rowtype;r production_control.canonical_resource_v1%rowtype;
begin
 select * into strict r from production_control.canonical_resource_v1 where singleton;
 if context is distinct from c or c->>'resource_class'<>'CERTIFICATION' or c->>'resource_id' is distinct from r.resource_id
  or r.database_name<>current_database() or c->>'phase'not in('DIRECTOR','WORKERS')then
  raise exception using errcode='42501',message='CERTIFICATION_ODDS_CONTEXT_REQUIRED';end if;
 select * into strict g from production_control.certification_ingress_generations_v1
  where resource_id=r.resource_id and tournament_id=c->>'tournament_id'and state='OPEN'for share;
 if g.authority_epoch_id::text is distinct from c->>'authority_epoch_id'or g.pointer_revision::text is distinct from c->>'pointer_revision'then
  raise exception using errcode='40001',message='CERTIFICATION_ODDS_GENERATION_STALE';end if;
 if c->>'tournament_id'<>'2026'then
  perform production_control.assert_current_certification_future_context_v1(c);
  select * into strict annual from production_control.future_annual_runtime_generations_v1
   where tournament_id=c->>'tournament_id'and generation_status='ACTIVE';
  if annual.admission_generation_id<>g.generation_id or annual.authority_generation_id<>g.authority_epoch_id
   or annual.pointer_revision<>g.pointer_revision or annual.ingress_state<>'OPEN'or annual.authority<>'SUPABASE'then
   raise exception using errcode='40001',message='CERTIFICATION_ODDS_GENERATION_STALE';end if;
 end if;
 return c||jsonb_build_object('runtime_generation_id',annual.runtime_generation_id,
  'certification_ingress_generation_id',g.generation_id,'provenance_id',r.provenance_id);
exception when no_data_found then raise exception using errcode='55000',message='CERTIFICATION_ODDS_RUNTIME_REQUIRED';
end;$$;

create function production_control.assert_certification_odds_actor_v1(input jsonb,context jsonb)returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if input#>>'{authorization,role}'is distinct from 'DIRECTOR'
  or coalesce((input#>>'{authorization,impersonating}')::boolean,false)
  or coalesce((input#>>'{authorization,impersonated}')::boolean,false)
  or coalesce((input#>>'{authorization,is_impersonating}')::boolean,false)
  or nullif(input#>>'{authorization,impersonating_player_id}','')is not null
  or input#>>'{authorization,tournament_id}'is distinct from context->>'tournament_id'then
  raise exception using errcode='42501',message='CERTIFICATION_ODDS_DIRECTOR_REQUIRED';end if;
 if context->>'tournament_id'='2026'then perform production_control.assert_production_scoring_actor(input,true);
 else perform production_control.assert_canonical_future_scoring_actor_v1(input,context->>'tournament_id',true,context);end if;
end;$$;

create function production_control.assert_canonical_odds_job_v1(input jsonb,target text,retained scoring_authority.odds_calculation_jobs,context jsonb)
returns void language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if context is null then perform production_control.assert_annual_odds_job_scope_v1(input,target,retained);return;end if;
 if retained.tournament_id is distinct from target or retained.runtime_generation_id is distinct from nullif(input->>'expected_runtime_generation_id','')::uuid
  or retained.production_operation_mode is distinct from 'CERTIFICATION' or retained.production_deployment_commit is distinct from context->>'release_commit'
  or retained.production_candidate_hostname is not null or retained.source_revision->>'resource_id'is distinct from context->>'resource_id'
  or retained.source_revision->>'installation_id'is distinct from context->>'installation_id'
  or retained.source_revision->>'certification_odds_contract'is distinct from 'certification-odds-v1'
  or retained.source_revision->>'certification_ingress_generation_id'is distinct from input->>'certification_ingress_generation_id'
  or retained.source_revision->>'annual_authority_generation_id'is distinct from context->>'authority_epoch_id'
  or retained.source_revision->>'annual_pointer_revision'is distinct from context->>'pointer_revision'then
  raise exception using errcode='42501',message='CERTIFICATION_ODDS_JOB_SCOPE_DENIED';end if;
end;$$;

create function production_control.guard_certification_odds_job_v1()returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb;r production_control.canonical_resource_v1%rowtype;
begin
 select * into r from production_control.canonical_resource_v1 where singleton;
 if new.production_operation_mode='CERTIFICATION' or r.resource_class='CERTIFICATION'then
  c:=production_control.current_certification_context_v1();
  if new.production_operation_mode<>'CERTIFICATION'or r.resource_class<>'CERTIFICATION'or r.database_name<>current_database()
   or new.tournament_id is distinct from c->>'tournament_id'or new.source_revision->>'resource_id'is distinct from r.resource_id
   or new.source_revision->>'installation_id'is distinct from r.installation_id::text then
   raise exception using errcode='42501',message='CERTIFICATION_ODDS_JOB_RESOURCE_DENIED';end if;
  if tg_op='UPDATE'and (new.source_revision is distinct from old.source_revision or new.runtime_generation_id is distinct from old.runtime_generation_id
   or new.input_snapshot is distinct from old.input_snapshot or new.invocation_fingerprint is distinct from old.invocation_fingerprint
   or(old.status='SUCCEEDED'and(new.result_payload is distinct from old.result_payload or new.result_fingerprint is distinct from old.result_fingerprint)))then
   raise exception using errcode='55000',message='CERTIFICATION_ODDS_JOB_PROVENANCE_IMMUTABLE';end if;
  if tg_op='INSERT'and new.tournament_id<>'2026'then
   select runtime_generation_id into strict new.runtime_generation_id from production_control.future_annual_runtime_generations_v1
    where tournament_id=new.tournament_id and generation_status='ACTIVE'and authority_generation_id::text=c->>'authority_epoch_id';
  end if;
 end if;return new;
end;$$;
create trigger zz_guard_certification_odds_job_v1 before insert or update on scoring_authority.odds_calculation_jobs
 for each row execute function production_control.guard_certification_odds_job_v1();

create function production_control.canonical_odds_inputs_v2(target text,destination_workbook text,input jsonb,require_exact_revision boolean,context jsonb) returns scoring_authority.odds_input_configurations
language plpgsql security definer stable set search_path=pg_catalog as $core$
declare
  config scoring_authority.odds_input_configurations%rowtype;
  revision jsonb := input->'source_revision';
begin
  select value.* into strict config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target and value.is_current;
  if (context is null and target = '2026')
     or config.source_workbook_id is distinct from destination_workbook
     or config.validation_status is distinct from 'VALID'
     or config.settings_contract_version is distinct from
       'prediction-settings-v1'
     or coalesce(config.source_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or config.settings_fingerprint !~ '^[0-9a-f]{64}$'
     or config.effective_settings_fingerprint !~ '^[0-9a-f]{64}$'
     or config.bundle_fingerprint !~ '^[0-9a-f]{64}$'
     or config.ratings_fingerprint !~ '^[0-9a-f]{64}$'
     or config.pairing_fingerprint !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(config.effective_settings) <> 'object'
     or scoring_authority.jsonb_object_length(
       config.effective_settings
     ) <> 30 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_PREDICTION_SETTINGS_NOT_CURRENT';
  end if;
  if require_exact_revision and (
    pg_catalog.jsonb_typeof(revision) <> 'object'
    or input->>'input_configuration_id' is distinct from config.id::text
    or coalesce((input->>'configuration_revision')::bigint, -1)
      <> config.configuration_revision
    or pg_catalog.lower(coalesce(input->>'settings_fingerprint', ''))
      is distinct from config.settings_fingerprint
    or pg_catalog.lower(coalesce(
      input->>'effective_settings_fingerprint', ''
    )) is distinct from config.effective_settings_fingerprint
    or pg_catalog.lower(coalesce(input->>'input_bundle_fingerprint', ''))
      is distinct from config.bundle_fingerprint
    or pg_catalog.lower(coalesce(revision->>'source_fingerprint', ''))
      is distinct from pg_catalog.lower(config.source_fingerprint)
    or pg_catalog.lower(coalesce(revision->>'bundle_fingerprint', ''))
      is distinct from config.bundle_fingerprint
    or pg_catalog.lower(coalesce(revision->>'settings_fingerprint', ''))
      is distinct from config.settings_fingerprint
    or pg_catalog.lower(coalesce(
      revision->>'effective_settings_fingerprint', ''
    )) is distinct from config.effective_settings_fingerprint
    or pg_catalog.lower(coalesce(revision->>'ratings_fingerprint', ''))
      is distinct from config.ratings_fingerprint
    or pg_catalog.lower(coalesce(revision->>'pairing_fingerprint', ''))
      is distinct from config.pairing_fingerprint
    or coalesce((revision->>'configuration_revision')::bigint, -1)
      <> config.configuration_revision
    or revision->>'annual_tournament_id' is distinct from target
    or revision->>'annual_runtime_generation_id' is distinct from
      input->>'expected_runtime_generation_id'
    or coalesce((revision->>'annual_pointer_revision')::bigint, -1)
      <> coalesce((input->>'expected_pointer_revision')::bigint, -2)
    or revision->>'annual_authority_generation_id' is distinct from
      input->>'expected_annual_authority_generation_id'
    or revision->>'annual_admission_generation_id' is distinct from
      input->>'expected_annual_admission_generation_id'
  ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_ODDS_INPUT_REVISION_STALE';
  end if;
  return config;
exception
  when no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_ODDS_INPUT_CONFIGURATION_REQUIRED';
end;
$core$;

create function production_control.current_canonical_odds_inputs_v2(target text,destination text,input jsonb,exact_revision boolean,context jsonb)
returns scoring_authority.odds_input_configurations language plpgsql stable security definer set search_path=pg_catalog as $$
declare c scoring_authority.odds_input_configurations%rowtype;catalog production_control.future_tournament_catalog_v1%rowtype;
begin
 if context is null then return production_control.current_annual_odds_inputs_v1(target,destination,input,exact_revision);end if;
 c:=production_control.canonical_odds_inputs_v2(target,destination,input,exact_revision,context);
 if exact_revision and(input#>>'{source_revision,certification_odds_contract}'is distinct from 'certification-odds-v1'
  or input#>>'{source_revision,resource_id}'is distinct from context->>'resource_id'
  or input#>>'{source_revision,installation_id}'is distinct from context->>'installation_id'
  or input#>>'{source_revision,certification_ingress_generation_id}'is distinct from input->>'certification_ingress_generation_id')then
  raise exception using errcode='40001',message='CERTIFICATION_ODDS_INPUT_REVISION_STALE';end if;
 if target<>'2026'then
  select * into strict catalog from production_control.future_tournament_catalog_v1 where tournament_id=target;
  if c.pairing_fingerprint is distinct from production_control.annual_odds_pairing_fingerprint_v1(target)
   or coalesce((c.validation_diagnostics->>'annualSetupRevision')::bigint,-1)<>catalog.setup_revision then
   raise exception using errcode='55000',message='PRODUCTION_ANNUAL_PREDICTION_SETTINGS_NOT_CURRENT';end if;
 end if;return c;
end;$$;

create function production_control.canonical_odds_dispatch_v2(input jsonb,context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $core$
declare
  operation_name text := pg_catalog.btrim(coalesce(
    input->>'annual_odds_operation', ''
  ));
  target text;
  destination text;
  config scoring_authority.odds_input_configurations%rowtype;
  retained scoring_authority.odds_calculation_jobs%rowtype;
  inserted scoring_authority.odds_calculation_jobs%rowtype;
  existing_checkpoint scoring_authority.odds_calculation_checkpoints%rowtype;
  invocation_value jsonb;
  canonical_value jsonb;
  input_snapshot_value jsonb;
  checkpoint_value jsonb;
  job text := pg_catalog.lower(coalesce(input->>'job_id', ''));
  input_hash text := pg_catalog.lower(coalesce(
    input->>'input_fingerprint', ''
  ));
  checkpoint_hash_value text := pg_catalog.lower(coalesce(
    input->>'checkpoint_hash', ''
  ));
  result_hash text := pg_catalog.lower(coalesce(
    input->>'result_fingerprint', ''
  ));
  claim uuid;
  progress integer;
  retryable boolean;
  superseded_count integer := 0;
  next_sequence integer;
  jobs jsonb;
  checkpoints jsonb;
  publication_result jsonb;
begin
  if context is null then target := production_control.assert_annual_odds_runtime_v1(input,operation_name);
  else target:=context->>'tournament_id';perform production_control.certification_odds_runtime_v1(context);end if;
  destination := input->>'annual_destination_workbook_id';

  if operation_name = 'read_production_odds_calculation_inputs' then
    perform production_control.current_canonical_odds_inputs_v2(
      target, destination, input, false
    ,context);
    if context is null then return public.read_championship_odds_inputs(target);end if;
    return jsonb_set(public.read_championship_odds_inputs(target),'{data,certification_context}',production_control.certification_odds_runtime_v1(context));
  end if;

  if operation_name = 'request_production_odds_calculation_job' then
    config := production_control.current_canonical_odds_inputs_v2(
      target, destination, input, true
    ,context);
    if job !~ '^[0-9a-f]{64}$'
       or job <> pg_catalog.lower(coalesce(
         input->>'invocation_fingerprint', ''
       ))
       or input_hash !~ '^[0-9a-f]{64}$'
       or checkpoint_hash_value !~ '^[0-9a-f]{64}$'
       or input->>'target_tournament_id' is distinct from target
       or coalesce((input->>'target_tournament_year')::integer, 0)
         <> target::integer
       or input->>'phase' not in (
         'Pre-Tournament', 'After Round 1', 'After Round 2',
         'Round 3 Pairings Announced', 'Final Results'
       )
       or coalesce((input->>'total_iterations')::integer, 0)
         not in (10000, 25000, 50000, 100000)
       or pg_catalog.btrim(coalesce(input->>'engine_version', '')) = ''
       or pg_catalog.btrim(coalesce(
         input->>'publication_contract_version', ''
       )) = ''
       or pg_catalog.btrim(coalesce(
         input->>'checkpoint_contract_version', ''
       )) = ''
       or pg_catalog.btrim(coalesce(
         input->>'deterministic_seed', ''
       )) = ''
       or pg_catalog.btrim(coalesce(input->>'requested_by', '')) = ''
       or pg_catalog.btrim(coalesce(input->>'output_timestamp', '')) = ''
       or pg_catalog.jsonb_typeof(input->'input_snapshot') <> 'object'
       or pg_catalog.jsonb_typeof(input->'checkpoint_payload') <> 'object'
       or pg_catalog.jsonb_typeof(input->'source_revision') <> 'object'
       or pg_catalog.btrim(coalesce(
         input->>'invocation_canonical_json', ''
       )) = ''
       or pg_catalog.btrim(coalesce(
         input->>'input_snapshot_canonical_json', ''
       )) = ''
       or pg_catalog.btrim(coalesce(
         input->>'checkpoint_canonical_json', ''
       )) = '' then
      raise exception using errcode = '22023',
        message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_JOB_REQUIRED';
    end if;
    begin
      invocation_value := (input->>'invocation_canonical_json')::jsonb;
      input_snapshot_value :=
        (input->>'input_snapshot_canonical_json')::jsonb;
      checkpoint_value := (input->>'checkpoint_canonical_json')::jsonb;
    exception when others then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_ODDS_CANONICAL_JSON_INVALID';
    end;
    if input_snapshot_value is distinct from input->'input_snapshot'
       or checkpoint_value is distinct from input->'checkpoint_payload'
       or pg_catalog.encode(extensions.digest(
         input->>'input_snapshot_canonical_json', 'sha256'
       ), 'hex') <> input_hash
       or pg_catalog.encode(extensions.digest(
         input->>'checkpoint_canonical_json', 'sha256'
       ), 'hex') <> checkpoint_hash_value
       or pg_catalog.encode(extensions.digest(
         input->>'invocation_canonical_json', 'sha256'
       ), 'hex') <> job
       or invocation_value->>'tournamentId' is distinct from target
       or invocation_value->>'phase' is distinct from input->>'phase'
       or coalesce((invocation_value->>'iterations')::integer, 0)
         <> (input->>'total_iterations')::integer
       or invocation_value->>'inputFingerprint' is distinct from input_hash
       or invocation_value->>'settingsFingerprint' is distinct from
         config.settings_fingerprint
       or invocation_value->>'operationMode' is distinct from
         (case when context is null then 'PRODUCTION_CUTOVER' else 'CERTIFICATION' end)
       or invocation_value->>'annualRuntimeGenerationId' is distinct from
         input->>'expected_runtime_generation_id'
       or coalesce((invocation_value->>'annualPointerRevision')::bigint, -1)
         <> (input->>'expected_pointer_revision')::bigint
       or invocation_value->>'annualAuthorityGenerationId' is distinct from
         input->>'expected_annual_authority_generation_id'
       or invocation_value->>'annualAdmissionGenerationId' is distinct from
         input->>'expected_annual_admission_generation_id'
       or input#>>'{input_snapshot,metadata,settingsFingerprint}'
         is distinct from config.settings_fingerprint
       or input#>>'{input_snapshot,sheets,tournaments,0,Tournament ID}'
         is distinct from target then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_ODDS_DETERMINISTIC_IDENTITY_MISMATCH';
    end if;
    if context is not null and(invocation_value->>'certificationResourceId' is distinct from context->>'resource_id'
      or invocation_value->>'certificationInstallationId' is distinct from context->>'installation_id'
      or invocation_value->>'certificationIngressGenerationId' is distinct from input->>'certification_ingress_generation_id'
      or invocation_value->>'jobIdentityContract' is distinct from 'certification-odds-calculation-job-identity-v1'
      or invocation_value->>'jobContractVersion' is distinct from 'championship-odds-calculation-job-v1'
      or invocation_value->>'deploymentCommit' is distinct from context->>'release_commit'
      or invocation_value->>'engineVersion' is distinct from input->>'engine_version'
      or invocation_value->>'publicationContractVersion' is distinct from input->>'publication_contract_version'
      or invocation_value->>'checkpointContractVersion' is distinct from input->>'checkpoint_contract_version'
      or invocation_value->>'deterministicSeed' is distinct from input->>'deterministic_seed')then
      raise exception using errcode='23514',message='CERTIFICATION_ODDS_DETERMINISTIC_IDENTITY_MISMATCH';end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('production-annual-odds-job:' || job));
    select value.* into retained
    from scoring_authority.odds_calculation_jobs value
    where value.job_id = job for update;
    if found then
      perform production_control.assert_canonical_odds_job_v1(input,target,retained,context);
      if retained.input_fingerprint <> input_hash
         or retained.input_configuration_id <> config.id
         or retained.input_bundle_fingerprint <> config.bundle_fingerprint
         or retained.total_iterations <>
           (input->>'total_iterations')::integer then
        raise exception using errcode = '23505',
          message = 'PRODUCTION_ODDS_CALCULATION_JOB_IDENTITY_CONFLICT';
      end if;
      return pg_catalog.jsonb_build_object(
        'ok', true, 'changed', false, 'duplicate', true,
        'job', pg_catalog.to_jsonb(retained) - 'input_snapshot'
          - 'checkpoint_payload' - 'result_payload' - 'claim_token',
        'publication_created', false, 'mirror_created', false
      );
    end if;
    insert into scoring_authority.odds_calculation_jobs (
      job_id, tournament_id, phase, total_iterations, engine_version,
      publication_contract_version, checkpoint_contract_version,
      deterministic_seed, input_fingerprint, settings_fingerprint,
      invocation_fingerprint, source_revision, input_snapshot,
      checkpoint_payload, checkpoint_hash, requested_by, output_timestamp,
      resource_metrics, input_configuration_id,
      effective_settings_fingerprint, input_bundle_fingerprint,
      production_operation_mode, production_deployment_commit,
      production_candidate_hostname, publication_status,
      publication_reference, runtime_generation_id
    ) values (
      job, target, input->>'phase',
      (input->>'total_iterations')::integer, input->>'engine_version',
      input->>'publication_contract_version',
      input->>'checkpoint_contract_version', input->>'deterministic_seed',
      input_hash, config.settings_fingerprint, job,
      input->'source_revision', input->'input_snapshot',
      input->'checkpoint_payload', checkpoint_hash_value,
      pg_catalog.left(input->>'requested_by', 180),
      (input->>'output_timestamp')::timestamptz,
      coalesce(input->'resource_metrics', '{}'::jsonb), config.id,
      config.effective_settings_fingerprint, config.bundle_fingerprint,
      (case when context is null then 'PRODUCTION_CUTOVER' else 'CERTIFICATION' end), input->>'deployment_commit', null,
      'NOT_REQUESTED', '{}'::jsonb,
      (input->>'expected_runtime_generation_id')::uuid
    ) returning * into inserted;
    update scoring_authority.odds_calculation_jobs value set
      status = 'SUPERSEDED', publication_status = 'STALE',
      superseded_by = job, superseded_at = pg_catalog.clock_timestamp(),
      claim_token = null, lease_owner = null, lease_expires_at = null,
      last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
      last_error_safe = (case when context is null then 'Canonical Production calculation inputs advanced.' else 'Canonical Certification calculation inputs advanced.' end),
      updated_at = pg_catalog.clock_timestamp()
    where value.job_id <> job and value.tournament_id = target
      and (value.runtime_generation_id = (input->>'expected_runtime_generation_id')::uuid or(context is not null and value.runtime_generation_id is null and input->>'expected_runtime_generation_id' is null))
      and value.phase = input->>'phase'
      and value.production_operation_mode = (case when context is null then 'PRODUCTION_CUTOVER' else 'CERTIFICATION' end)
      and value.input_bundle_fingerprint is distinct from
        config.bundle_fingerprint
      and value.status in ('PENDING', 'RUNNING', 'RETRYABLE', 'SUCCEEDED')
      and value.publication_status <> 'PUBLISHED';
    get diagnostics superseded_count = row_count;
    insert into production_control.operation_audit_events (
      event_type, domain, tournament_id, actor, request_fingerprint,
      result, details
    ) values (
      (case when context is null then 'PRODUCTION_ODDS_CALCULATION_REQUESTED' else 'CERTIFICATION_ODDS_CALCULATION_REQUESTED' end),
      'CHAMPIONSHIP_ODDS_CALCULATION', target,
      pg_catalog.left(input->>'requested_by', 160), job, 'SUCCEEDED',
      pg_catalog.jsonb_build_object(
        'job_id', job, 'phase', input->>'phase',
        'iterations', (input->>'total_iterations')::integer,
        'runtime_generation_id', input->>'expected_runtime_generation_id',
        'input_fingerprint', input_hash,
        'settings_fingerprint', config.settings_fingerprint,
        'input_bundle_fingerprint', config.bundle_fingerprint,
        'superseded_jobs', superseded_count,
        'publication_created', false, 'mirror_created', false
      ) || case when context is null then '{}'::jsonb else jsonb_build_object(
       'resource_class','CERTIFICATION','resource_id',context->>'resource_id','installation_id',context->>'installation_id',
       'release_commit',context->>'release_commit','certification_ingress_generation_id',input->>'certification_ingress_generation_id')end
    );
    return pg_catalog.jsonb_build_object(
      'ok', true, 'changed', true, 'duplicate', false,
      'superseded_jobs', superseded_count,
      'job', pg_catalog.to_jsonb(inserted) - 'input_snapshot'
        - 'checkpoint_payload' - 'result_payload' - 'claim_token',
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'claim_production_odds_calculation_job' then
    if job !~ '^[0-9a-f]{64}$'
       or pg_catalog.btrim(coalesce(input->>'worker_id', '')) = '' then
      raise exception using errcode = '22023',
        message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_CLAIM_REQUIRED';
    end if;
    select value.* into retained
    from scoring_authority.odds_calculation_jobs value
    where value.job_id = job for update;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND'
      );
    end if;
    perform production_control.assert_canonical_odds_job_v1(input,target,retained,context);
    begin
      config := production_control.current_canonical_odds_inputs_v2(
        target, destination,
        input || pg_catalog.jsonb_build_object(
          'input_configuration_id', retained.input_configuration_id,
          'configuration_revision',
            retained.source_revision->>'configuration_revision',
          'settings_fingerprint', retained.settings_fingerprint,
          'effective_settings_fingerprint',
            retained.effective_settings_fingerprint,
          'input_bundle_fingerprint', retained.input_bundle_fingerprint,
          'source_revision', retained.source_revision
        ), true
      ,context);
    exception when sqlstate '40001' then
      update scoring_authority.odds_calculation_jobs set
        status = 'SUPERSEDED', publication_status = 'STALE',
        superseded_at = pg_catalog.clock_timestamp(), claim_token = null,
        lease_owner = null, lease_expires_at = null,
        last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
        last_error_safe = (case when context is null then 'Canonical Production calculation inputs advanced.' else 'Canonical Certification calculation inputs advanced.' end),
        updated_at = pg_catalog.clock_timestamp()
      where job_id = job;
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_SUPERSEDED',
        'retryable', false
      );
    end;
    if retained.input_configuration_id <> config.id
       or retained.input_bundle_fingerprint <> config.bundle_fingerprint then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_ANNUAL_ODDS_INPUT_REVISION_STALE';
    end if;
    if retained.status = 'SUCCEEDED' then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'deliver', false, 'completed', true,
        'job', pg_catalog.to_jsonb(retained) - 'claim_token'
      );
    end if;
    if retained.status in ('SUPERSEDED', 'FAILED') then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_' || retained.status,
        'retryable', false
      );
    end if;
    if retained.status = 'RUNNING'
       and retained.lease_expires_at > pg_catalog.clock_timestamp() then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'deliver', false, 'in_progress', true,
        'job', pg_catalog.to_jsonb(retained) - 'input_snapshot'
          - 'checkpoint_payload' - 'result_payload' - 'claim_token'
      );
    end if;
    update scoring_authority.odds_calculation_jobs set
      status = 'RUNNING', attempt_count = attempt_count + 1,
      claim_token = extensions.gen_random_uuid(),
      lease_owner = pg_catalog.left(input->>'worker_id', 180),
      lease_expires_at = pg_catalog.clock_timestamp() + interval '12 minutes',
      started_at = coalesce(started_at, pg_catalog.clock_timestamp()),
      updated_at = pg_catalog.clock_timestamp(), last_error_code = null,
      last_error_safe = null
    where job_id = job returning * into retained;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'deliver', true, 'job', pg_catalog.to_jsonb(retained),
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'checkpoint_production_odds_calculation_job' then
    begin claim := nullif(input->>'claim_token', '')::uuid;
    exception when others then claim := null; end;
    progress := coalesce((input->>'completed_iterations')::integer, 0);
    if job !~ '^[0-9a-f]{64}$' or claim is null
       or checkpoint_hash_value !~ '^[0-9a-f]{64}$'
       or pg_catalog.jsonb_typeof(input->'checkpoint_payload') <> 'object'
       or pg_catalog.btrim(coalesce(
         input->>'checkpoint_canonical_json', ''
       )) = '' then
      raise exception using errcode = '22023',
        message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_CHECKPOINT_REQUIRED';
    end if;
    begin canonical_value := (input->>'checkpoint_canonical_json')::jsonb;
    exception when others then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_ODDS_CANONICAL_JSON_INVALID';
    end;
    if canonical_value is distinct from input->'checkpoint_payload'
       or pg_catalog.encode(extensions.digest(
         input->>'checkpoint_canonical_json', 'sha256'
       ), 'hex') <> checkpoint_hash_value then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_ODDS_CHECKPOINT_FINGERPRINT_MISMATCH';
    end if;
    select value.* into retained
    from scoring_authority.odds_calculation_jobs value
    where value.job_id = job for update;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND'
      );
    end if;
    perform production_control.assert_canonical_odds_job_v1(input,target,retained,context);
    if retained.status <> 'RUNNING'
       or retained.claim_token is distinct from claim
       or retained.lease_expires_at <= pg_catalog.clock_timestamp() then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_CLAIM_STALE',
        'retryable', false
      );
    end if;
    if progress < retained.completed_iterations
       or progress > retained.total_iterations then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_PROGRESS_INVALID'
      );
    end if;
    if progress = retained.completed_iterations then
      if retained.checkpoint_hash = checkpoint_hash_value then
        return pg_catalog.jsonb_build_object(
          'ok', true, 'duplicate', true,
          'checkpoint_count', retained.checkpoint_count,
          'completed_iterations', retained.completed_iterations
        );
      end if;
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_CHECKPOINT_CONFLICT'
      );
    end if;
    select value.* into existing_checkpoint
    from scoring_authority.odds_calculation_checkpoints value
    where value.job_id = job and value.completed_iterations = progress;
    if found then
      if existing_checkpoint.checkpoint_hash = checkpoint_hash_value then
        return pg_catalog.jsonb_build_object(
          'ok', true, 'duplicate', true,
          'checkpoint_count', retained.checkpoint_count,
          'completed_iterations', progress
        );
      end if;
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_CHECKPOINT_CONFLICT'
      );
    end if;
    next_sequence := retained.checkpoint_count + 1;
    insert into scoring_authority.odds_calculation_checkpoints (
      job_id, checkpoint_sequence, completed_iterations,
      checkpoint_contract_version, checkpoint_payload, checkpoint_hash,
      attempt_number, resource_metrics
    ) values (
      job, next_sequence, progress, retained.checkpoint_contract_version,
      input->'checkpoint_payload', checkpoint_hash_value,
      retained.attempt_count, coalesce(input->'resource_metrics', '{}'::jsonb)
    );
    update scoring_authority.odds_calculation_jobs set
      completed_iterations = progress,
      checkpoint_payload = input->'checkpoint_payload',
      checkpoint_hash = checkpoint_hash_value,
      checkpoint_count = next_sequence,
      resource_metrics = coalesce(input->'resource_metrics', resource_metrics),
      lease_expires_at = pg_catalog.clock_timestamp() + interval '12 minutes',
      updated_at = pg_catalog.clock_timestamp()
    where job_id = job;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'duplicate', false, 'completed_iterations', progress,
      'total_iterations', retained.total_iterations,
      'checkpoint_count', next_sequence,
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'complete_production_odds_calculation_job' then
    begin claim := nullif(input->>'claim_token', '')::uuid;
    exception when others then claim := null; end;
    if job !~ '^[0-9a-f]{64}$' or claim is null
       or result_hash !~ '^[0-9a-f]{64}$'
       or pg_catalog.jsonb_typeof(input->'result_payload') <> 'object'
       or pg_catalog.jsonb_typeof(
         input->'result_fingerprint_payload'
       ) <> 'object'
       or pg_catalog.btrim(coalesce(
         input->>'result_canonical_json', ''
       )) = '' then
      raise exception using errcode = '22023',
        message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_RESULT_REQUIRED';
    end if;
    begin canonical_value := (input->>'result_canonical_json')::jsonb;
    exception when others then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_ODDS_CANONICAL_JSON_INVALID';
    end;
    if canonical_value is distinct from input->'result_fingerprint_payload'
       or input->'result_fingerprint_payload' is distinct from
         (input->'result_payload') - 'publishedAt'
       or pg_catalog.encode(extensions.digest(
         input->>'result_canonical_json', 'sha256'
       ), 'hex') <> result_hash then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_ODDS_RESULT_FINGERPRINT_MISMATCH';
    end if;
    select value.* into retained
    from scoring_authority.odds_calculation_jobs value
    where value.job_id = job for update;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND'
      );
    end if;
    perform production_control.assert_canonical_odds_job_v1(input,target,retained,context);
    begin
      config := production_control.current_canonical_odds_inputs_v2(
        target, destination,
        input || pg_catalog.jsonb_build_object(
          'input_configuration_id', retained.input_configuration_id,
          'configuration_revision',
            retained.source_revision->>'configuration_revision',
          'settings_fingerprint', retained.settings_fingerprint,
          'effective_settings_fingerprint',
            retained.effective_settings_fingerprint,
          'input_bundle_fingerprint', retained.input_bundle_fingerprint,
          'source_revision', retained.source_revision
        ), true
      ,context);
    exception when sqlstate '40001' then
      update scoring_authority.odds_calculation_jobs set
        status = 'SUPERSEDED', publication_status = 'STALE',
        superseded_at = pg_catalog.clock_timestamp(), claim_token = null,
        lease_owner = null, lease_expires_at = null,
        last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
        last_error_safe = (case when context is null then 'Canonical Production calculation inputs advanced.' else 'Canonical Certification calculation inputs advanced.' end),
        updated_at = pg_catalog.clock_timestamp()
      where job_id = job;
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_SUPERSEDED',
        'retryable', false, 'publication_created', false,
        'mirror_created', false
      );
    end;
    if retained.input_configuration_id <> config.id
       or retained.input_bundle_fingerprint <> config.bundle_fingerprint then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_ANNUAL_ODDS_INPUT_REVISION_STALE';
    end if;
    if retained.status = 'SUCCEEDED' then
      if retained.result_fingerprint = result_hash
         and retained.publication_status = 'READY' then
        return pg_catalog.jsonb_build_object(
          'ok', true, 'duplicate', true, 'job_id', job,
          'result_fingerprint', result_hash,
          'publication_status', retained.publication_status,
          'publication_eligible', true,
          'publication_created', false, 'mirror_created', false
        );
      end if;
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_RESULT_CONFLICT'
      );
    end if;
    if retained.status <> 'RUNNING'
       or retained.claim_token is distinct from claim
       or retained.lease_expires_at <= pg_catalog.clock_timestamp() then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_CLAIM_STALE'
      );
    end if;
    if retained.completed_iterations <> retained.total_iterations then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_INCOMPLETE'
      );
    end if;
    if input->'result_payload'->>'phase' is distinct from retained.phase
       or coalesce((input->'result_payload'->>'year')::integer, 0)
         <> target::integer then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_ODDS_RESULT_TOURNAMENT_MISMATCH';
    end if;
    update scoring_authority.odds_calculation_jobs set
      status = 'SUCCEEDED', publication_status = 'READY',
      publication_reference = '{}'::jsonb,
      result_payload = input->'result_payload',
      result_fingerprint = result_hash,
      output_payload_bytes = greatest(
        0, coalesce((input->>'output_payload_bytes')::integer, 0)
      ),
      resource_metrics = coalesce(input->'resource_metrics', resource_metrics),
      claim_token = null, lease_owner = null, lease_expires_at = null,
      completed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp(),
      last_error_code = null, last_error_safe = null
    where job_id = job returning * into retained;
    insert into production_control.operation_audit_events (
      event_type, domain, tournament_id, actor, request_fingerprint,
      result, details
    ) values (
      (case when context is null then 'PRODUCTION_ODDS_CALCULATION_SUCCEEDED' else 'CERTIFICATION_ODDS_CALCULATION_SUCCEEDED' end),
      'CHAMPIONSHIP_ODDS_CALCULATION', target, retained.requested_by,
      job, 'SUCCEEDED', pg_catalog.jsonb_build_object(
        'job_id', job, 'phase', retained.phase,
        'iterations', retained.total_iterations,
        'runtime_generation_id', retained.runtime_generation_id,
        'result_fingerprint', result_hash,
        'checkpoint_count', retained.checkpoint_count,
        'attempt_count', retained.attempt_count,
        'publication_status', 'READY',
        'publication_eligible', true,
        'publication_created', false, 'mirror_created', false
      ) || case when context is null then '{}'::jsonb else jsonb_build_object(
       'resource_class','CERTIFICATION','resource_id',context->>'resource_id','installation_id',context->>'installation_id',
       'release_commit',context->>'release_commit','certification_ingress_generation_id',input->>'certification_ingress_generation_id')end
    );
    return pg_catalog.jsonb_build_object(
      'ok', true, 'duplicate', false, 'job_id', job,
      'result_fingerprint', result_hash,
      'checkpoint_count', retained.checkpoint_count,
      'attempt_count', retained.attempt_count,
      'publication_status', 'READY', 'publication_eligible', true,
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'fail_production_odds_calculation_job' then
    begin claim := nullif(input->>'claim_token', '')::uuid;
    exception when others then claim := null; end;
    retryable := coalesce((input->>'retryable')::boolean, true);
    if job !~ '^[0-9a-f]{64}$' or claim is null then
      raise exception using errcode = '22023',
        message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_FAILURE_REQUIRED';
    end if;
    select value.* into retained
    from scoring_authority.odds_calculation_jobs value
    where value.job_id = job for update;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'marked', false, 'stale_claim', true,
        'publication_created', false, 'mirror_created', false
      );
    end if;
    perform production_control.assert_canonical_odds_job_v1(input,target,retained,context);
    if retained.status <> 'RUNNING'
       or retained.claim_token is distinct from claim then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'marked', false, 'stale_claim', true,
        'publication_created', false, 'mirror_created', false
      );
    end if;
    update scoring_authority.odds_calculation_jobs set
      status = case when retryable then 'RETRYABLE' else 'FAILED' end,
      claim_token = null, lease_owner = null, lease_expires_at = null,
      last_error_code = pg_catalog.left(coalesce(
        nullif(input->>'error_code', ''), 'ODDS_CALCULATION_FAILED'
      ), 120),
      last_error_safe = pg_catalog.left(coalesce(
        nullif(input->>'error_safe', ''),
        'Championship calculation stopped safely.'
      ), 400),
      completed_at = case when retryable then completed_at
        else pg_catalog.clock_timestamp() end,
      updated_at = pg_catalog.clock_timestamp()
    where job_id = job returning * into retained;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'marked', true, 'retryable', retryable,
      'status', retained.status,
      'completed_iterations', retained.completed_iterations,
      'checkpoint_count', retained.checkpoint_count,
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'supersede_production_odds_calculation_job' then
    if job !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023',
        message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_SUPERSESSION_REQUIRED';
    end if;
    select value.* into retained
    from scoring_authority.odds_calculation_jobs value
    where value.job_id = job for update;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND'
      );
    end if;
    perform production_control.assert_canonical_odds_job_v1(input,target,retained,context);
    config := production_control.current_canonical_odds_inputs_v2(
      target, destination, input, false
    ,context);
    if retained.input_bundle_fingerprint = config.bundle_fingerprint
       and retained.input_configuration_id = config.id then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ODDS_CALCULATION_INPUTS_STILL_CURRENT'
      );
    end if;
    update scoring_authority.odds_calculation_jobs set
      status = 'SUPERSEDED', publication_status = 'STALE',
      superseded_at = pg_catalog.clock_timestamp(), claim_token = null,
      lease_owner = null, lease_expires_at = null,
      last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
      last_error_safe = (case when context is null then 'Canonical Production calculation inputs advanced.' else 'Canonical Certification calculation inputs advanced.' end),
      updated_at = pg_catalog.clock_timestamp()
    where job_id = job
      and status in ('PENDING', 'RUNNING', 'RETRYABLE', 'SUCCEEDED')
    returning * into retained;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'superseded', found,
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'read_production_odds_calculation_jobs' then
    if job <> '' and job !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_ODDS_JOB_ID_INVALID';
    end if;
    if job <> '' then
      select value.* into retained
      from scoring_authority.odds_calculation_jobs value
      where value.job_id = job;
      if found then
        perform production_control.assert_canonical_odds_job_v1(input,target,retained,context);
      end if;
    end if;
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(value) - 'claim_token'
      order by value.requested_at desc
    ), '[]'::jsonb) into jobs
    from scoring_authority.odds_calculation_jobs value
    where value.tournament_id = target
      and (value.runtime_generation_id = (input->>'expected_runtime_generation_id')::uuid or(context is not null and value.runtime_generation_id is null and input->>'expected_runtime_generation_id' is null))
      and value.production_operation_mode = (case when context is null then 'PRODUCTION_CUTOVER' else 'CERTIFICATION' end)
      and value.production_deployment_commit = input->>'deployment_commit'
      and value.production_candidate_hostname is null
      and value.source_revision->>(case when context is null then 'production_job_identity_contract' else 'job_identity_contract' end)
        = (case when context is null then 'production-odds-calculation-job-identity-v2' else 'certification-odds-calculation-job-identity-v1' end)
      and value.source_revision->>'annual_odds_contract'
        = (case when context is null then 'production-annual-odds-dispatch-v1' else 'certification-odds-v1' end)
      and (job = '' or value.job_id = job);
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(checkpoint) - 'checkpoint_payload'
      order by checkpoint.job_id, checkpoint.checkpoint_sequence
    ), '[]'::jsonb) into checkpoints
    from scoring_authority.odds_calculation_checkpoints checkpoint
    join scoring_authority.odds_calculation_jobs value
      on value.job_id = checkpoint.job_id
    where value.tournament_id = target
      and (value.runtime_generation_id = (input->>'expected_runtime_generation_id')::uuid or(context is not null and value.runtime_generation_id is null and input->>'expected_runtime_generation_id' is null))
      and value.production_operation_mode = (case when context is null then 'PRODUCTION_CUTOVER' else 'CERTIFICATION' end)
      and value.production_deployment_commit = input->>'deployment_commit'
      and value.production_candidate_hostname is null
      and value.source_revision->>'annual_odds_contract'
        = (case when context is null then 'production-annual-odds-dispatch-v1' else 'certification-odds-v1' end)
      and (job = '' or checkpoint.job_id = job);
    return pg_catalog.jsonb_build_object(
      'ok', true, 'jobs', jobs, 'checkpoints', checkpoints,
      'operation_mode', (case when context is null then 'PRODUCTION_CUTOVER' else 'CERTIFICATION' end),
      'deployment_commit', input->>'deployment_commit',
      'candidate_hostname', null,
      'runtime_generation_id', input->>'expected_runtime_generation_id',
      'publication_created', false, 'mirror_created', false
    );
  end if;

  if operation_name = 'read_production_odds_publication_v1' then
    if context is null then return production_control.annual_odds_publication_projection_v1(target);end if;
    return production_control.certification_odds_publication_state_v1(target,context);
  end if;

  if operation_name = 'publish_production_championship_odds_v1' then
    publication_result:=production_control.canonical_publish_odds_v2(input,target,context);
    return publication_result;
  end if;

  raise exception using errcode = '42501',
    message = 'PRODUCTION_ANNUAL_ODDS_OPERATION_NOT_ALLOWLISTED';
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ANNUAL_ODDS_INPUT_INVALID';
end;
$core$;

create function production_control.canonical_publish_odds_v2(input jsonb,target text,context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $core$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  annual_resource production_control.future_tournament_resources_v1%rowtype;
  current_value scoring_authority.odds_publication_current%rowtype;
  current_snapshot scoring_authority.odds_published_snapshots%rowtype;
  job scoring_authority.odds_calculation_jobs%rowtype;
  config scoring_authority.odds_input_configurations%rowtype;
  created_snapshot scoring_authority.odds_published_snapshots%rowtype;
  response_value jsonb;
  binding jsonb;
  source_revision_value jsonb;
  binding_fingerprint text;
  payload_hash_value text;
  expected_revision bigint := coalesce(
    (input->>'expected_publication_revision')::bigint, -1
  );
  expected_snapshot uuid;
  next_revision bigint;
  next_milestone_revision bigint;
  phase_order_value integer;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth_user uuid;
  expected_authority_epoch uuid;
  request_fingerprint_value text := pg_catalog.lower(coalesce(
    input->>'request_fingerprint', ''
  ));
  expected_request_fingerprint text;
begin
  begin
    expected_snapshot := nullif(input->>'expected_snapshot_id', '')::uuid;
    actor_auth_user := nullif(
      input#>>'{authorization,auth_user_id}', ''
    )::uuid;
    expected_authority_epoch := nullif(
      input->>'expected_authority_epoch_id', ''
    )::uuid;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_PUBLICATION_INPUT_INVALID';
  end;
  if context is null then
  perform production_control.assert_future_production_scoring_actor_v1(
    input, target, true
  );
  expected_request_fingerprint := pg_catalog.encode(extensions.digest(
    pg_catalog.concat_ws(E'\n',
      'production-odds-publication-v1', 'PUBLISH', target,
      pg_catalog.lower(coalesce(input->>'job_id', '')),
      coalesce(input->>'expected_activation_revision', ''),
      pg_catalog.lower(coalesce(input->>'expected_authority_epoch_id', '')),
      pg_catalog.lower(coalesce(
        input#>>'{authorization,auth_user_id}', ''
      )), actor_player
    ), 'sha256'
  ), 'hex');
  if target = '2026'
     or input->>'operation' is distinct from
       'PUBLISH_PRODUCTION_CHAMPIONSHIP_ODDS_V1'
     or input->>'contract_version' is distinct from
       'production-odds-publication-v1'
     or input->>'target_tournament_id' is distinct from target
     or coalesce((input->>'target_tournament_year')::integer, 0)
       <> target::integer
     or input->>'vercel_team_id' is distinct from
       'team_kPw5zaib8uaQJALAwj4fWI6R'
     or input->>'vercel_environment' is distinct from 'production'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or coalesce(input->>'job_id', '') !~ '^[0-9a-f]{64}$'
     or expected_revision < 0
     or coalesce(input->>'deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'deployment_commit', '') !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'expected_activation_revision', '') !~ '^[0-9]+$'
     or expected_authority_epoch is null
     or request_fingerprint_value !~ '^[0-9a-f]{64}$'
     or request_fingerprint_value is distinct from
       expected_request_fingerprint then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_PUBLICATION_INPUT_INVALID';
  end if;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target
    and value.runtime_generation_id =
      (input->>'expected_runtime_generation_id')::uuid
    and value.generation_status = 'ACTIVE';
  select value.* into strict annual_resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target;
  else
    perform production_control.certification_odds_runtime_v1(context);
    perform production_control.assert_certification_odds_actor_v1(input,context);
    expected_request_fingerprint:=input->>'_certification_request_fingerprint';
    if input->>'operation'is distinct from 'PUBLISH_PRODUCTION_CHAMPIONSHIP_ODDS_V1'
     or input->>'contract_version'is distinct from 'production-odds-publication-v1'
     or input->>'target_tournament_id'is distinct from target or input->>'target_tournament_year'is distinct from target
     or coalesce(input->>'job_id','')!~'^[0-9a-f]{64}$'or expected_revision<0
     or expected_authority_epoch is distinct from (context->>'authority_epoch_id')::uuid
     or expected_request_fingerprint is null or request_fingerprint_value is distinct from expected_request_fingerprint then
     raise exception using errcode='22023',message='CERTIFICATION_ODDS_PUBLICATION_INPUT_INVALID';end if;
    generation.runtime_generation_id:=nullif(input->>'expected_runtime_generation_id','')::uuid;
    generation.pointer_revision:=(context->>'pointer_revision')::bigint;
    generation.authority_generation_id:=(context->>'authority_epoch_id')::uuid;
    generation.admission_generation_id:=(input->>'certification_ingress_generation_id')::uuid;
    annual_resource.source_workbook_id:=input->>'annual_destination_workbook_id';
  end if;
  select value.* into current_value
  from scoring_authority.odds_publication_current value
  where value.tournament_id = target for update;
  select value.* into job
  from scoring_authority.odds_calculation_jobs value
  where value.job_id = input->>'job_id' for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND'
    );
  end if;
  perform production_control.assert_canonical_odds_job_v1(input,target,job,context);
  if job.status = 'SUCCEEDED'
     and job.publication_status = 'PUBLISHED'
     and job.publication_reference->>'contract_version'
       = 'production-odds-publication-v1'
     and job.publication_reference->>'request_fingerprint'
       = request_fingerprint_value then
    select value.* into strict created_snapshot
    from scoring_authority.odds_published_snapshots value
    where value.id = (job.publication_reference->>'snapshot_id')::uuid;
    if current_value.tournament_id is null
       or current_value.publication_authority <> 'SUPABASE'
       or current_value.current_snapshot_id <> created_snapshot.id
       or current_value.publication_revision < 1
       or created_snapshot.tournament_id <> target
       or created_snapshot.source_calculation_job_id <> job.job_id then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ODDS_PUBLICATION_REPLAY_STATE_INVALID';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_ODDS_PUBLISHED',
      'idempotent', true, 'publication_authority', 'SUPABASE',
      'publication_contract_version', 'production-odds-publication-v1',
      'snapshot_id', created_snapshot.id,
      'publication_revision', current_value.publication_revision,
      'publication_state', current_value.publication_state,
      'freshness', current_value.freshness,
      'published_at', created_snapshot.published_at,
      'published_payload', created_snapshot.published_payload,
      'runtime_generation_id', generation.runtime_generation_id,
      'mirror_created', false, 'google_writes', 0
    );
  end if;
  if context is null then
  if resource.odds_publication_authority <> 'SUPABASE'
     or not resource.odds_publication_enabled
     or resource.scoring_authority <> 'SUPABASE'
     or resource.current_tournament_read_authority <> 'SUPABASE'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or activation.current_authority <> 'SUPABASE'
     or activation.maintenance_state <> 'NORMAL'
     or not activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.expected_deployment_commit is distinct from
       input->>'deployment_commit'
     or activation.activation_revision <>
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       expected_authority_epoch
     or annual_resource.resource_status <> 'CURRENT_RESOURCE_BOUND'
     or annual_resource.source_workbook_id is distinct from
       input->>'annual_destination_workbook_id'
     or generation.authority <> 'SUPABASE'
     or generation.ingress_state <> 'OPEN'
     or exists (
       select 1 from production_control.worker_controls value
       where value.worker_name = 'ODDS_GOOGLE_MIRROR'
         and (value.enabled or value.google_writes_allowed)
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_PUBLICATION_NOT_SAFE';
  end if;
  end if;
  if current_value.tournament_id is null then
    if expected_revision <> 0 or expected_snapshot is not null then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_ODDS_PUBLICATION_REVISION_CONFLICT';
    end if;
  elsif current_value.publication_authority <> 'SUPABASE'
     or current_value.publication_state <> 'PUBLISHED'
     or current_value.publication_revision <> expected_revision
     or current_value.current_snapshot_id is distinct from expected_snapshot
  then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ODDS_PUBLICATION_REVISION_CONFLICT';
  end if;
  if job.status <> 'SUCCEEDED'
     or job.publication_status <> 'READY'
     or job.publication_reference <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(job.result_payload) <> 'object'
     or coalesce(job.result_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or job.result_payload->>'phase' is distinct from job.phase
     or coalesce((job.result_payload->>'year')::integer, 0) <> target::integer
     or pg_catalog.jsonb_typeof(job.result_payload->'teams') <> 'array'
     or pg_catalog.jsonb_array_length(job.result_payload->'teams') = 0
     or pg_catalog.jsonb_typeof(job.result_payload->'players') <> 'array'
     or pg_catalog.jsonb_array_length(job.result_payload->'players') = 0
     or (job.result_payload->>'publishedAt')::timestamptz
       is distinct from job.output_timestamp then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_CALCULATION_NOT_PUBLISHABLE';
  end if;
  config := production_control.current_canonical_odds_inputs_v2(
    target, annual_resource.source_workbook_id,
    input || pg_catalog.jsonb_build_object(
      'input_configuration_id', job.input_configuration_id,
      'configuration_revision',
        job.source_revision->>'configuration_revision',
      'settings_fingerprint', job.settings_fingerprint,
      'effective_settings_fingerprint', job.effective_settings_fingerprint,
      'input_bundle_fingerprint', job.input_bundle_fingerprint,
      'source_revision', job.source_revision
    ), true,context
  );
  if context is not null and(input->>'milestone'is distinct from job.phase
    or input->>'expected_source_fingerprint'is distinct from job.source_revision->>'source_fingerprint'
    or input->>'expected_result_fingerprint'is distinct from job.result_fingerprint
    or(job.phase='Final Results'and(select count(*)from scoring_authority.matches where tournament_id=target)<>24))then
    raise exception using errcode='40001',message='CERTIFICATION_ODDS_PUBLICATION_RESULT_STALE';end if;
  phase_order_value := pg_catalog.array_position(array[
    'Pre-Tournament', 'After Round 1', 'After Round 2',
    'Round 3 Pairings Announced', 'Final Results'
  ], job.phase) - 1;
  if current_value.current_snapshot_id is not null then
    select value.* into strict current_snapshot
    from scoring_authority.odds_published_snapshots value
    where value.id = current_value.current_snapshot_id;
    if phase_order_value < current_snapshot.phase_order then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ODDS_PUBLICATION_PHASE_REGRESSION';
    end if;
  end if;
  if job.phase = 'Final Results' and exists (
    select 1 from scoring_authority.matches value
    where value.tournament_id = target
      and (value.status <> 'FINAL' or value.scorecard_complete is not true)
  ) then
    raise exception using errcode = '55000',
      message = 'FINAL_RESULTS_NOT_READY';
  end if;
  next_revision := expected_revision + 1;
  select coalesce(pg_catalog.max(value.publication_revision), 0) + 1
    into next_milestone_revision
  from scoring_authority.odds_published_snapshots value
  where value.tournament_id = target and value.milestone = job.phase;
  source_revision_value := job.source_revision ||
    pg_catalog.jsonb_build_object(
      'calculation_job_id', job.job_id,
      'calculation_result_fingerprint', job.result_fingerprint,
      'input_configuration_id', config.id,
      'configuration_revision', config.configuration_revision,
      'settings_fingerprint', config.settings_fingerprint,
      'effective_settings_fingerprint',
        config.effective_settings_fingerprint,
      'ratings_fingerprint', config.ratings_fingerprint,
      'pairing_fingerprint', config.pairing_fingerprint,
      'bundle_fingerprint', config.bundle_fingerprint,
      'runtime_generation_id', generation.runtime_generation_id,
      'pointer_revision', generation.pointer_revision,
      'annual_authority_generation_id', generation.authority_generation_id,
      'annual_admission_generation_id', generation.admission_generation_id
    );
  if context is null then
  binding := pg_catalog.jsonb_build_object(
    'contract_version', 'production-odds-publication-v1',
    'annual_contract_version', 'production-annual-odds-dispatch-v1',
    'environment', 'PRODUCTION', 'project_ref', resource.project_ref,
    'project_url', resource.project_url,
    'source_workbook_id', annual_resource.source_workbook_id,
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
    'vercel_environment', 'production',
    'deployment_id', input->>'deployment_id',
    'deployment_commit', input->>'deployment_commit',
    'canonical_domain', resource.canonical_domain,
    'tournament_id', target,
    'runtime_generation_id', generation.runtime_generation_id,
    'pointer_revision', generation.pointer_revision,
    'authority_generation_id', generation.authority_generation_id,
    'admission_generation_id', generation.admission_generation_id,
    'platform_authority_epoch_id', expected_authority_epoch,
    'activation_revision', activation.activation_revision,
    'publication_revision', next_revision,
    'source_calculation_job_id', job.job_id,
    'google_publication_retired', true,
    'google_mirror_retired', true
  );
  else
    binding:=jsonb_build_object('contract_version','certification-odds-publication-v1','resource_class','CERTIFICATION',
      'resource_id',context->>'resource_id','installation_id',context->>'installation_id','project_ref',context->>'project_ref',
      'tournament_id',target,'authority_epoch_id',context->>'authority_epoch_id','runtime_generation_id',generation.runtime_generation_id,
      'ingress_generation_id',input->>'certification_ingress_generation_id','pointer_revision',generation.pointer_revision,
      'release_commit',context->>'release_commit','deployment_id',context->>'deployment_id','deployment_origin',context->>'deployment_origin',
      'activation_revision',context->>'activation_revision','admission_revision',context->>'admission_revision',
      'publication_revision',next_revision,'operation_request_id',input->>'operation_request_id','source_calculation_job_id',job.job_id,
      'previous_publication_state',case when expected_revision=0 then 'NEVER_PUBLISHED'else 'PUBLISHED'end,
      'previous_snapshot_id',expected_snapshot,'source_fingerprint',job.source_revision->>'source_fingerprint',
      'result_fingerprint',job.result_fingerprint,'actor_player_id',actor_player,'actor_auth_user_id',actor_auth_user);
  end if;
  binding_fingerprint :=
    production_control.odds_publication_v1_hash(binding);
  payload_hash_value :=
    production_control.odds_publication_v1_hash(job.result_payload);
  update scoring_authority.odds_published_snapshots set
    is_current_for_milestone = false
  where tournament_id = target and milestone = job.phase
    and is_current_for_milestone;
  update scoring_authority.odds_published_snapshots set
    is_current_official = false
  where tournament_id = target and is_current_official;
  insert into scoring_authority.odds_published_snapshots (
    tournament_id, milestone, phase_order, publication_revision,
    published_at, published_payload, payload_hash, source_fingerprint,
    engine_version, engine_metadata, google_publication_fingerprint,
    google_publication_reference, is_current_for_milestone,
    is_current_official, publication_verified, imported_by,
    logical_payload_hash, settings_fingerprint, ratings_fingerprint,
    pairing_fingerprint, deterministic_seed, publication_actor_id,
    mirror_status, authority_contract_version, publication_authority,
    publication_state_revision, source_calculation_job_id,
    source_calculation_revision, published_by_auth_user_id,
    published_by_player_id, authority_epoch_id, resource_binding,
    resource_binding_fingerprint
  ) values (
    target, job.phase, phase_order_value, next_milestone_revision,
    job.output_timestamp, job.result_payload, payload_hash_value,
    nullif(job.source_revision->>'source_fingerprint', ''),
    job.engine_version, pg_catalog.jsonb_build_object(
      'iterations', job.total_iterations, 'phaseOrder', phase_order_value,
      'calculationJobId', job.job_id,
      'resultFingerprint', job.result_fingerprint,
      'runtimeGenerationId', generation.runtime_generation_id
    ), null, null, true, true, true,
    (case when context is null then 'production-odds-publication-v1'else 'certification-odds-publication-v1'end), job.result_fingerprint,
    config.settings_fingerprint, config.ratings_fingerprint,
    config.pairing_fingerprint, job.deterministic_seed, actor_player,
    'RETIRED', 'production-odds-publication-v1', 'SUPABASE',
    next_revision, job.job_id, source_revision_value, actor_auth_user,
    actor_player, expected_authority_epoch, binding, binding_fingerprint
  ) returning * into created_snapshot;
  insert into scoring_authority.odds_publication_current (
    tournament_id, contract_version, publication_authority,
    publication_state, freshness, current_snapshot_id,
    publication_revision, source_calculation_revision, published_at,
    published_by_player_id, published_by_auth_user_id, authority_epoch_id,
    resource_binding, resource_binding_fingerprint, adoption_kind,
    activated_by, activated_at, updated_at
  ) values (
    target, 'production-odds-publication-v1', 'SUPABASE', 'PUBLISHED',
    'CURRENT', created_snapshot.id, next_revision, source_revision_value,
    created_snapshot.published_at, actor_player, actor_auth_user,
    expected_authority_epoch, binding, binding_fingerprint, null,
    actor_player, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ) on conflict (tournament_id) do update set
    publication_state = excluded.publication_state,
    freshness = excluded.freshness,
    current_snapshot_id = excluded.current_snapshot_id,
    publication_revision = excluded.publication_revision,
    source_calculation_revision = excluded.source_calculation_revision,
    published_at = excluded.published_at,
    published_by_player_id = excluded.published_by_player_id,
    published_by_auth_user_id = excluded.published_by_auth_user_id,
    authority_epoch_id = excluded.authority_epoch_id,
    resource_binding = excluded.resource_binding,
    resource_binding_fingerprint = excluded.resource_binding_fingerprint,
    adoption_kind = null, activated_by = excluded.activated_by,
    activated_at = coalesce(
      scoring_authority.odds_publication_current.activated_at,
      excluded.activated_at
    ), updated_at = excluded.updated_at;
  update scoring_authority.odds_calculation_jobs set
    publication_status = 'PUBLISHED',
    publication_reference = pg_catalog.jsonb_build_object(
      'contract_version', 'production-odds-publication-v1',
      'snapshot_id', created_snapshot.id,
      'publication_revision', next_revision,
      'expected_predecessor_revision', expected_revision,
      'expected_predecessor_snapshot_id', expected_snapshot,
      'request_fingerprint', request_fingerprint_value,
      'runtime_generation_id', generation.runtime_generation_id
    ), updated_at = pg_catalog.clock_timestamp()
  where job_id = job.job_id;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_ODDS_PUBLISHED',
    'idempotent', false, 'publication_authority', 'SUPABASE',
    'publication_contract_version', 'production-odds-publication-v1',
    'snapshot_id', created_snapshot.id,
    'publication_revision', next_revision,
    'publication_state', 'PUBLISHED', 'freshness', 'CURRENT',
    'published_at', created_snapshot.published_at,
    'published_payload', created_snapshot.published_payload,
    'runtime_generation_id', generation.runtime_generation_id,
    'mirror_created', false, 'google_writes', 0
  );
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target, 'CHAMPIONSHIP_ODDS_PUBLISHED_SUPABASE', actor_player,
    (response_value - 'ok' - 'idempotent' - 'published_payload') || case when context is null then '{}'::jsonb else jsonb_build_object('resource_binding',binding)end
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    (case when context is null then 'PRODUCTION_CHAMPIONSHIP_ODDS_PUBLISHED'else 'CERTIFICATION_CHAMPIONSHIP_ODDS_PUBLISHED'end),
    'CHAMPIONSHIP_ODDS_PUBLICATION', target, actor_player,
    request_fingerprint_value, 'SUCCEEDED',
    (response_value - 'ok' - 'idempotent' - 'published_payload') || case when context is null then '{}'::jsonb else jsonb_build_object('resource_binding',binding)end
  );
  return response_value;
end;
$core$;

do $check$begin if encode(extensions.digest((select prosrc from pg_proc where oid='public.future_production_dispatch_odds_pre_withdrawal_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'2402f281143c0d4160451c69bfe96ed844695e38f98278e51c2a5aff233231dd'then raise exception 'CERTIFICATION_ODDS_PREDECESSOR_MISMATCH: public.future_production_dispatch_odds_pre_withdrawal_v1';end if;end;$check$;

create or replace function public.future_production_dispatch_odds_pre_withdrawal_v1(input jsonb)returns jsonb language plpgsql security definer set search_path=pg_catalog as $$begin return production_control.canonical_odds_dispatch_v2(input,null);end;$$;

do $check$begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.publish_annual_odds_v1(jsonb,text)'::regprocedure),'sha256'),'hex')<>'a914849ab44990ed118b6b3e9767ec5db145d03309cf9603c2ceeb905615edf1'then raise exception 'CERTIFICATION_ODDS_PREDECESSOR_MISMATCH: production_control.publish_annual_odds_v1';end if;end;$check$;

create or replace function production_control.publish_annual_odds_v1(input jsonb,target text)returns jsonb language plpgsql security definer set search_path=pg_catalog as $$begin return production_control.canonical_publish_odds_v2(input,target,null);end;$$;

create function production_control.certification_odds_publication_state_v1(target text,context jsonb)returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare p scoring_authority.odds_publication_current%rowtype;
begin
 if target is distinct from context->>'tournament_id'or context->>'resource_class'is distinct from 'CERTIFICATION'then
  raise exception using errcode='42501',message='CERTIFICATION_ODDS_PUBLICATION_TARGET_DENIED';end if;
 select * into p from scoring_authority.odds_publication_current where tournament_id=target;
 if p.tournament_id is null then return jsonb_build_object('ok',true,'publication',jsonb_build_object('state','NEVER_PUBLISHED','revision',0,'snapshot_id',null));end if;
 if p.resource_binding->>'resource_id'is distinct from context->>'resource_id'
  or p.resource_binding->>'installation_id'is distinct from context->>'installation_id'or p.adoption_kind is not null then
  raise exception using errcode='42501',message='CERTIFICATION_ODDS_PUBLICATION_RESOURCE_DENIED';end if;
 return jsonb_build_object('ok',true,'publication',jsonb_build_object('state',p.publication_state,'revision',p.publication_revision,
 'snapshot_id',p.current_snapshot_id,'freshness',p.freshness,'published_at',p.published_at));
end;$$;

create function production_control.certification_odds_request_hash_v1(input jsonb,resource_id text)returns text
language sql immutable set search_path=pg_catalog as $$
 select production_control.tournament_setup_hash_v1(jsonb_build_object('contract','certification-odds-operation-v1',
 'resource_id',resource_id,'operation_request_id',input->>'operation_request_id','operation_name',input#>>'{payload,odds_operation}',
 'actor_auth_user_id',input#>>'{authorization,auth_user_id}','actor_player_id',input#>>'{authorization,player_id}',
 'tournament_id',input#>>'{authorization,tournament_id}',
 'payload',case when input#>>'{payload,odds_operation}'='request_production_odds_calculation_job'
  then(input->'payload')-array['output_timestamp','resource_metrics','requested_by']else input->'payload'end))
$$;

create function public.read_certification_odds_operation_v1(input jsonb)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;receipt production_control.certification_odds_receipts_v1%rowtype;
 op uuid:=(input->>'operation_request_id')::uuid;target text:=input#>>'{payload,target_tournament_id}';
begin
 r:=production_control.certification_ingress_recovery_resource_v1(input);
 if input->>'phase'is distinct from 'DIRECTOR'or input#>>'{payload,odds_operation}'not in('request_production_odds_calculation_job','publish_production_championship_odds_v1')
  or input#>>'{payload,odds_operation}'is null or op is null or target is null
  or input#>>'{authorization,tournament_id}'is distinct from target
  or coalesce((input#>>'{authorization,impersonating}')::boolean,false)
  or coalesce((input#>>'{authorization,impersonated}')::boolean,false)
  or coalesce((input#>>'{authorization,is_impersonating}')::boolean,false)
  or nullif(input#>>'{authorization,impersonating_player_id}','')is not null
  or exists(select 1 from jsonb_object_keys(input->'payload')k where k not in('odds_operation','target_tournament_id'))then
  raise exception using errcode='42501',message='CERTIFICATION_ODDS_RECOVERY_DENIED';end if;
 perform production_control.assert_certification_ingress_recovery_actor_v1(input,target,true);
 select * into receipt from production_control.certification_odds_receipts_v1
  where resource_id=r.resource_id and tournament_id=target and operation_request_id=op;
 if not found then return jsonb_build_object('ok',true,'state','UNKNOWN','operation_request_id',op);end if;
 if receipt.actor_auth_user_id::text is distinct from input#>>'{authorization,auth_user_id}'
  or receipt.actor_player_id is distinct from input#>>'{authorization,player_id}'
  or receipt.operation_name is distinct from input#>>'{payload,odds_operation}'then
  raise exception using errcode='42501',message='CERTIFICATION_ODDS_RECOVERY_DENIED';end if;
 return jsonb_build_object('ok',true,'state','COMMITTED','operation_request_id',op,'result',receipt.result,'committed_at',receipt.committed_at);
end;$$;

create function public.dispatch_certification_odds_v1(input jsonb)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare payload jsonb:=input->'payload';op text:=input#>>'{payload,odds_operation}';phase text;mut boolean;
 c jsonb;runtime jsonb;canonical jsonb;result jsonb;r production_control.canonical_resource_v1%rowtype;
 receipt production_control.certification_odds_receipts_v1%rowtype;hash text;request_id uuid;
 target text;destination text;source jsonb;publication jsonb;
begin
 if jsonb_typeof(payload)is distinct from 'object'or op is null or op not in(
 'read_production_odds_calculation_inputs','request_production_odds_calculation_job','claim_production_odds_calculation_job',
 'checkpoint_production_odds_calculation_job','complete_production_odds_calculation_job','fail_production_odds_calculation_job',
 'supersede_production_odds_calculation_job','read_production_odds_calculation_jobs','read_production_odds_publication_v1',
 'publish_production_championship_odds_v1')or input->>'operation_id'is distinct from 'ODDS.'||op
 or payload ?|array['authorization','resource','deployment','canonical_context','_certification_request_fingerprint',
 'annual_destination_workbook_id','deployment_commit','deployment_id','operation_mode','environment','google_publication_reference',
 'adoption_kind','vercel_environment','canonical_domain']then
  raise exception using errcode='42501',message='CERTIFICATION_ODDS_OPERATION_DENIED';end if;
 phase:=case when op in('claim_production_odds_calculation_job','checkpoint_production_odds_calculation_job',
 'complete_production_odds_calculation_job','fail_production_odds_calculation_job')then 'WORKERS'else 'DIRECTOR'end;
 mut:=op not in('read_production_odds_calculation_inputs','read_production_odds_calculation_jobs','read_production_odds_publication_v1');
 if op in('request_production_odds_calculation_job','publish_production_championship_odds_v1')then
  -- Recover a committed same-operation response before fresh write admission.
  -- This exact static resource/actor check cannot execute a domain mutation.
  r:=production_control.certification_ingress_recovery_resource_v1(input);
  request_id:=(input->>'operation_request_id')::uuid;target:=input#>>'{authorization,tournament_id}';
  if request_id is null or input->>'phase'is distinct from 'DIRECTOR'or target is null
   or coalesce((input#>>'{authorization,impersonating}')::boolean,false)
  or coalesce((input#>>'{authorization,impersonated}')::boolean,false)
   or coalesce((input#>>'{authorization,is_impersonating}')::boolean,false)
   or nullif(input#>>'{authorization,impersonating_player_id}','')is not null then
   raise exception using errcode='42501',message='CERTIFICATION_ODDS_DIRECTOR_REQUIRED';end if;
  perform production_control.assert_certification_ingress_recovery_actor_v1(input,target,true);
  hash:=production_control.certification_odds_request_hash_v1(input,r.resource_id);
  perform pg_advisory_xact_lock(hashtextextended(r.resource_id||':'||target||':ODDS:'||request_id,143));
  select * into receipt from production_control.certification_odds_receipts_v1
   where resource_id=r.resource_id and tournament_id=target and operation_request_id=request_id;
  if found then
   if receipt.actor_auth_user_id::text is distinct from input#>>'{authorization,auth_user_id}'
    or receipt.actor_player_id is distinct from input#>>'{authorization,player_id}'then
    raise exception using errcode='42501',message='CERTIFICATION_ODDS_RECOVERY_DENIED';end if;
   if receipt.request_hash is distinct from hash or receipt.operation_name is distinct from op then
    raise exception using errcode='40001',message='CERTIFICATION_ODDS_OPERATION_CONFLICT';end if;
   return receipt.result||jsonb_build_object('idempotent',true,'operation_state','COMMITTED');
  end if;
 end if;
 c:=production_control.push_certification_context_v1(input,phase,mut);runtime:=production_control.certification_odds_runtime_v1(c);
 target:=c->>'tournament_id';
 if phase='DIRECTOR'then perform production_control.assert_certification_odds_actor_v1(input,c);end if;
 if payload->>'target_tournament_id'is not null and payload->>'target_tournament_id'is distinct from target
  or payload->>'tournament_id'is not null and payload->>'tournament_id'is distinct from target
  or payload?'expected_runtime_generation_id'and payload->>'expected_runtime_generation_id'is distinct from runtime->>'runtime_generation_id'
  or payload->>'certification_ingress_generation_id'is not null and payload->>'certification_ingress_generation_id'is distinct from runtime->>'certification_ingress_generation_id'
  or payload?'expected_pointer_revision'and payload->>'expected_pointer_revision'is distinct from c->>'pointer_revision'
  or payload?'expected_annual_authority_generation_id'and payload->>'expected_annual_authority_generation_id'is distinct from c->>'authority_epoch_id'
  or payload?'expected_annual_admission_generation_id'and payload->>'expected_annual_admission_generation_id'is distinct from runtime->>'certification_ingress_generation_id'then
  raise exception using errcode='40001',message='CERTIFICATION_ODDS_TARGET_STALE';end if;
 select provenance_id into strict destination from production_control.canonical_resource_v1 where singleton;
 if target<>'2026'then select source_workbook_id into strict destination from production_control.future_tournament_resources_v1 where tournament_id=target;end if;
 canonical:=payload||jsonb_build_object('annual_odds_operation',op,'annual_destination_workbook_id',destination,
 'target_tournament_id',target,'target_tournament_year',target::integer,'tournament_id',target,
 'deployment_commit',c->>'release_commit','deployment_id',c->>'deployment_id','authorization',input->'authorization',
 'expected_runtime_generation_id',runtime->'runtime_generation_id','expected_pointer_revision',c->'pointer_revision',
 'expected_annual_authority_generation_id',c->>'authority_epoch_id',
 'expected_annual_admission_generation_id',runtime->>'certification_ingress_generation_id',
 'certification_ingress_generation_id',runtime->>'certification_ingress_generation_id',
 'operation_request_id',input->>'operation_request_id','requested_by',c->>'actor_player_id');
 if op='request_production_odds_calculation_job'then
  source:=payload->'source_revision';
  if source->>'resource_class'is distinct from 'CERTIFICATION'or source->>'resource_id'is distinct from c->>'resource_id'
   or source->>'installation_id'is distinct from c->>'installation_id'
   or source->>'certification_odds_contract'is distinct from 'certification-odds-v1'
   or source->>'job_identity_contract'is distinct from 'certification-odds-calculation-job-identity-v1'
   or source->>'annual_odds_contract'is distinct from 'certification-odds-v1'
   or source->>'certification_ingress_generation_id'is distinct from runtime->>'certification_ingress_generation_id'
   or source?'production_job_identity_contract' then
   raise exception using errcode='42501',message='CERTIFICATION_ODDS_SOURCE_PROVENANCE_DENIED';end if;
 end if;
 if op='publish_production_championship_odds_v1'then
  perform pg_advisory_xact_lock(hashtextextended(c->>'resource_id'||':'||target||':ODDS_PUBLICATION',143));
  canonical:=canonical||jsonb_build_object('operation','PUBLISH_PRODUCTION_CHAMPIONSHIP_ODDS_V1',
   'contract_version','production-odds-publication-v1','expected_authority_epoch_id',c->>'authority_epoch_id',
   'expected_activation_revision',c->'activation_revision','request_fingerprint',hash,'_certification_request_fingerprint',hash);
 end if;
 result:=production_control.canonical_odds_dispatch_v2(canonical,c);
 if op='read_production_odds_calculation_jobs'then
  publication:=production_control.certification_odds_publication_state_v1(target,c);
  result:=result||jsonb_build_object('publication',publication->'publication');
 end if;
 if op in('request_production_odds_calculation_job','publish_production_championship_odds_v1')and result->>'ok'='true'then
  result:=result||jsonb_build_object('operation_request_id',request_id,'operation_state','COMMITTED');
  insert into production_control.certification_odds_receipts_v1(resource_id,tournament_id,operation_request_id,operation_name,
    actor_auth_user_id,actor_player_id,request_hash,canonical_context,result)
   values(c->>'resource_id',target,request_id,op,(c->>'actor_auth_user_id')::uuid,c->>'actor_player_id',hash,
    runtime-array['authorization'],result);
  insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
   values('CERTIFICATION_ODDS_OPERATION_COMMITTED','CHAMPIONSHIP_ODDS',target,c->>'actor_player_id',hash,'SUCCEEDED',
    jsonb_build_object('resource_id',c->>'resource_id','installation_id',c->>'installation_id','operation_request_id',request_id,
     'operation_name',op,'job_id',payload->>'job_id','snapshot_id',result->>'snapshot_id','publication_revision',result->'publication_revision',
     'certification_ingress_generation_id',runtime->>'certification_ingress_generation_id','release_commit',c->>'release_commit'));
 end if;
 perform production_control.pop_certification_context_v1();return result;
end;$$;

-- No runtime role receives private-core access. Existing wrapper OIDs, owners,
-- ACLs and definer/search_path/volatility attributes are preserved.
do $acl$ declare item record;begin
 for item in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)args from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='production_control'and p.proname in('certification_odds_runtime_v1','assert_certification_odds_actor_v1',
  'assert_canonical_odds_job_v1','guard_certification_odds_job_v1','canonical_odds_inputs_v2','current_canonical_odds_inputs_v2',
  'canonical_odds_dispatch_v2','canonical_publish_odds_v2','certification_odds_publication_state_v1','certification_odds_request_hash_v1')loop
  execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',item.nspname,item.proname,item.args);
 end loop;
 if exists(select 1 from certification_odds_original_attributes o join pg_proc p on p.oid=o.oid
  where row(p.proowner,p.proacl,p.prosecdef,p.proconfig,p.provolatile)is distinct from row(o.proowner,o.proacl,o.prosecdef,o.proconfig,o.provolatile))then
  raise exception 'CERTIFICATION_ODDS_PRODUCTION_PRIVILEGE_CHANGED';end if;
end;$acl$;
revoke all on function public.dispatch_certification_odds_v1(jsonb),public.read_certification_odds_operation_v1(jsonb)from public,anon,authenticated,service_role;
grant execute on function public.dispatch_certification_odds_v1(jsonb),public.read_certification_odds_operation_v1(jsonb)to service_role;
notify pgrst,'reload schema';
commit;
