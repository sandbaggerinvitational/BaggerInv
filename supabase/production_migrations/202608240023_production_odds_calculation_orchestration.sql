-- Step 11/12 Production Championship Odds durable calculation orchestration.
--
-- Applying this migration is inert.  The calculation worker remains disabled,
-- no scheduler is installed, no job is created, no publication is created, and
-- no Google mirror is created.  A service-role caller must first stage the exact
-- frozen release and explicitly arm this non-authoritative worker for either an
-- isolated Step 11 rehearsal or the ODDS_WAR_ROOM cutover phase.
begin;

do $$
begin
  if exists (
    select 1
    from scoring_authority.odds_calculation_jobs
    where publication_status = 'PUBLISHED'
       or publication_reference <> '{}'::jsonb
  ) then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_CALCULATION_BASELINE_NOT_DORMANT';
  end if;
end
$$;

alter table scoring_authority.odds_calculation_jobs
  add column if not exists input_configuration_id uuid
    references scoring_authority.odds_input_configurations(id) on delete restrict,
  add column if not exists effective_settings_fingerprint text,
  add column if not exists input_bundle_fingerprint text,
  add column if not exists production_operation_mode text,
  add column if not exists production_deployment_commit text,
  add column if not exists production_candidate_hostname text,
  add column if not exists lease_owner text;

alter table scoring_authority.odds_calculation_jobs
  add constraint production_odds_effective_settings_fingerprint_check
    check (effective_settings_fingerprint is null
      or effective_settings_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_odds_input_bundle_fingerprint_check
    check (input_bundle_fingerprint is null
      or input_bundle_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_odds_operation_mode_check
    check (production_operation_mode is null
      or production_operation_mode in ('STEP11_REHEARSAL', 'PRODUCTION_CUTOVER')),
  add constraint production_odds_deployment_commit_check
    check (production_deployment_commit is null
      or production_deployment_commit ~ '^[0-9a-f]{40}$'),
  add constraint production_odds_initial_publication_separation_check
    check (publication_status in ('NOT_REQUESTED', 'READY', 'STALE')
      and publication_reference = '{}'::jsonb);

create table production_control.odds_calculation_runtime (
  scope_key text primary key
    references production_control.resource_scope(scope_key) on delete restrict,
  contract_version text not null
    check (contract_version = 'production-odds-calculation-runtime-v1'),
  enabled boolean not null default false,
  operation_mode text not null default 'DORMANT'
    check (operation_mode in ('DORMANT', 'STEP11_REHEARSAL', 'PRODUCTION_CUTOVER')),
  cutover_phase text
    check (cutover_phase is null or cutover_phase = 'ODDS_WAR_ROOM'),
  deployment_commit text
    check (deployment_commit is null or deployment_commit ~ '^[0-9a-f]{40}$'),
  activation_revision bigint check (activation_revision is null or activation_revision >= 0),
  candidate_hostname text,
  configured_by text,
  configured_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (not enabled and operation_mode = 'DORMANT' and cutover_phase is null
      and deployment_commit is null and activation_revision is null
      and candidate_hostname is null)
    or
    (enabled and operation_mode <> 'DORMANT' and cutover_phase = 'ODDS_WAR_ROOM'
      and deployment_commit is not null and activation_revision is not null)
  ),
  check (
    (operation_mode = 'STEP11_REHEARSAL'
      and candidate_hostname ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$'
      and candidate_hostname not in ('baggerinv.com', 'www.baggerinv.com', 'bagger-inv.vercel.app'))
    or (operation_mode <> 'STEP11_REHEARSAL' and candidate_hostname is null)
  )
);

insert into production_control.odds_calculation_runtime (
  scope_key, contract_version
) values (
  'BAGGER_INV_PRODUCTION', 'production-odds-calculation-runtime-v1'
)
on conflict (scope_key) do nothing;

alter table production_control.odds_calculation_runtime enable row level security;
revoke all on table production_control.odds_calculation_runtime
  from public, anon, authenticated, service_role;
grant select on table production_control.odds_calculation_runtime to service_role;

create or replace function production_control.assert_production_odds_calculation_scope(
  input jsonb,
  require_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  runtime production_control.odds_calculation_runtime%rowtype;
  worker production_control.worker_controls%rowtype;
  mode text := upper(coalesce(input->>'operation_mode', ''));
  phase text := upper(coalesce(input->>'cutover_phase', ''));
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);

  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict runtime
  from production_control.odds_calculation_runtime
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict worker
  from production_control.worker_controls
  where worker_name = 'ODDS_CALCULATION';

  if input->>'project_ref' is distinct from 'ymqhhtxaywtqllynrmxe'
     or input->>'project_url'
          is distinct from 'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or input->>'source_workbook_id'
          is distinct from '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or input->>'vercel_project_id'
       is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or input->>'worker_name' is distinct from 'ODDS_CALCULATION'
     or phase <> 'ODDS_WAR_ROOM'
     or mode not in ('STEP11_REHEARSAL', 'PRODUCTION_CUTOVER') then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_EXACT_SCOPE_REQUIRED';
  end if;

  if resource.odds_publication_enabled
     or exists (
       select 1 from production_control.worker_controls
       where worker_name = 'ODDS_GOOGLE_MIRROR'
         and (enabled or google_writes_allowed)
     ) then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_PUBLICATION_MUST_REMAIN_SEPARATE';
  end if;

  if mode = 'STEP11_REHEARSAL' then
    if activation.state <> 'STAGED'
       or activation.current_authority <> 'GOOGLE'
       or activation.scoring_ingress_enabled
       or resource.scoring_authority <> 'GOOGLE'
       or resource.scoring_ingress_enabled
       or resource.google_writes_enabled
       or coalesce(input->>'candidate_hostname', '') = '' then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_ODDS_REHEARSAL_LEGACY_AUTHORITY_REQUIRED';
    end if;
  else
    if activation.state <> 'SCORING_COMMITTED'
       or activation.current_authority <> 'SUPABASE'
       or not activation.scoring_ingress_enabled
       or activation.read_cutover_phase <> phase
       or resource.scoring_authority <> 'SUPABASE'
       or not resource.scoring_ingress_enabled
       or input ? 'candidate_hostname' then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_ODDS_CUTOVER_AUTHORITY_REQUIRED';
    end if;
  end if;

  if require_enabled then
    if not runtime.enabled
       or runtime.operation_mode <> mode
       or runtime.cutover_phase <> phase
       or runtime.deployment_commit <> activation.expected_deployment_commit
       or runtime.activation_revision <> activation.activation_revision
       or runtime.candidate_hostname is distinct from nullif(input->>'candidate_hostname', '')
       or not worker.enabled
       or worker.google_writes_allowed
       or not resource.workers_enabled then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_ODDS_CALCULATION_WORKER_DISABLED';
    end if;
  end if;
end;
$$;

create or replace function production_control.current_production_odds_inputs(input jsonb)
returns scoring_authority.odds_input_configurations
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  config scoring_authority.odds_input_configurations%rowtype;
  source_revision jsonb := input->'source_revision';
begin
  select * into strict config
  from scoring_authority.odds_input_configurations
  where tournament_id = '2026' and is_current;

  if config.source_workbook_id
       is distinct from '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or config.validation_status is distinct from 'VALID'
     or config.settings_contract_version is distinct from 'prediction-settings-v1'
     or coalesce(config.source_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or coalesce(config.settings_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or coalesce(config.effective_settings_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or coalesce(config.bundle_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or coalesce(config.ratings_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or coalesce(config.pairing_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or coalesce(jsonb_typeof(config.effective_settings), '') <> 'object'
     or scoring_authority.jsonb_object_length(config.effective_settings) <> 30 then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_PREDICTION_SETTINGS_NOT_CURRENT';
  end if;

  if jsonb_typeof(source_revision) <> 'object'
     or input->>'input_configuration_id' is distinct from config.id::text
     or coalesce((input->>'configuration_revision')::bigint, -1)
          <> config.configuration_revision
     or lower(coalesce(input->>'settings_fingerprint', ''))
          <> config.settings_fingerprint
     or lower(coalesce(input->>'effective_settings_fingerprint', ''))
          <> config.effective_settings_fingerprint
     or lower(coalesce(input->>'input_bundle_fingerprint', ''))
          <> config.bundle_fingerprint
     or lower(coalesce(source_revision->>'source_fingerprint', ''))
          is distinct from lower(config.source_fingerprint)
     or lower(coalesce(source_revision->>'bundle_fingerprint', ''))
          is distinct from lower(config.bundle_fingerprint)
     or lower(coalesce(source_revision->>'settings_fingerprint', ''))
          is distinct from lower(config.settings_fingerprint)
     or lower(coalesce(source_revision->>'effective_settings_fingerprint', ''))
          is distinct from lower(config.effective_settings_fingerprint)
     or lower(coalesce(source_revision->>'ratings_fingerprint', ''))
          is distinct from lower(config.ratings_fingerprint)
     or lower(coalesce(source_revision->>'pairing_fingerprint', ''))
          is distinct from lower(config.pairing_fingerprint)
     or coalesce((source_revision->>'configuration_revision')::bigint, -1)
          <> config.configuration_revision then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_INPUT_REVISION_STALE';
  end if;
  return config;
exception when no_data_found then
  raise exception using errcode = 'P0001',
    message = 'PRODUCTION_ODDS_INPUT_CONFIGURATION_REQUIRED';
end;
$$;

create or replace function public.configure_production_odds_calculation_runtime(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  runtime production_control.odds_calculation_runtime%rowtype;
  requested_enabled boolean := coalesce((input->>'enabled')::boolean, false);
  mode text := upper(coalesce(input->>'operation_mode', ''));
  phase text := upper(coalesce(input->>'cutover_phase', ''));
  actor text := left(coalesce(nullif(input->>'actor_id', ''), ''), 160);
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  if input->>'vercel_project_id'
       is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or input->>'worker_name' is distinct from 'ODDS_CALCULATION'
     or actor = '' then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_EXACT_SCOPE_REQUIRED';
  end if;

  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION' for update;

  if activation.activation_revision
       <> coalesce((input->>'expected_activation_revision')::bigint, -1) then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ACTIVATION_REVISION_CONFLICT';
  end if;

  if requested_enabled then
    perform production_control.assert_production_odds_calculation_scope(input, false);
    update production_control.odds_calculation_runtime
    set enabled = true, operation_mode = mode, cutover_phase = phase,
        deployment_commit = activation.expected_deployment_commit,
        activation_revision = activation.activation_revision,
        candidate_hostname = nullif(input->>'candidate_hostname', ''),
        configured_by = actor, configured_at = now(), updated_at = now()
    where scope_key = 'BAGGER_INV_PRODUCTION'
    returning * into runtime;
  else
    update production_control.odds_calculation_runtime
    set enabled = false, operation_mode = 'DORMANT', cutover_phase = null,
        deployment_commit = null, activation_revision = null,
        candidate_hostname = null, configured_by = actor,
        configured_at = now(), updated_at = now()
    where scope_key = 'BAGGER_INV_PRODUCTION'
    returning * into runtime;
  end if;

  update production_control.worker_controls
  set enabled = requested_enabled, scheduler_installed = false,
      google_writes_allowed = false, last_verified_at = now(),
      metadata = metadata || jsonb_build_object(
        'contract_version', runtime.contract_version,
        'operation_mode', runtime.operation_mode,
        'cutover_phase', runtime.cutover_phase,
        'deployment_commit', runtime.deployment_commit,
        'configured_by', actor,
        'configured_at', now(),
        'publication_separate', true,
        'google_mirror_separate', true
      )
  where worker_name = 'ODDS_CALCULATION';
  update production_control.worker_contracts
  set operation_allowed = requested_enabled, scheduler_installed = false,
      authoritative_write_allowed = false
  where worker_name = 'ODDS_CALCULATION';
  update production_control.resource_scope
  set workers_enabled = exists (
    select 1 from production_control.worker_controls where enabled
  )
  where scope_key = 'BAGGER_INV_PRODUCTION';

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    case when requested_enabled
      then 'PRODUCTION_ODDS_CALCULATION_WORKER_ENABLED'
      else 'PRODUCTION_ODDS_CALCULATION_WORKER_DISABLED' end,
    'CHAMPIONSHIP_ODDS_CALCULATION', '2026', actor,
    lower(nullif(input->>'request_fingerprint', '')), 'SUCCEEDED',
    jsonb_build_object(
      'enabled', requested_enabled, 'operation_mode', runtime.operation_mode,
      'cutover_phase', runtime.cutover_phase, 'scheduler_installed', false,
      'authoritative_write_allowed', false, 'google_writes_allowed', false,
      'publication_created', false, 'mirror_created', false
    )
  );
  return jsonb_build_object(
    'ok', true, 'enabled', runtime.enabled,
    'operation_mode', runtime.operation_mode,
    'cutover_phase', runtime.cutover_phase,
    'deployment_commit', runtime.deployment_commit,
    'scheduler_installed', false, 'authoritative_write_allowed', false,
    'publication_created', false, 'mirror_created', false
  );
end;
$$;

create or replace function public.request_production_odds_calculation_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
as $$
declare
  config scoring_authority.odds_input_configurations%rowtype;
  existing scoring_authority.odds_calculation_jobs%rowtype;
  inserted scoring_authority.odds_calculation_jobs%rowtype;
  job text := lower(coalesce(input->>'job_id', ''));
  input_hash text := lower(coalesce(input->>'input_fingerprint', ''));
  checkpoint_hash_value text := lower(coalesce(input->>'checkpoint_hash', ''));
  invocation_value jsonb;
  input_snapshot_value jsonb;
  checkpoint_value jsonb;
  superseded_count integer := 0;
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  config := production_control.current_production_odds_inputs(input);

  if job !~ '^[0-9a-f]{64}$'
     or job <> lower(coalesce(input->>'invocation_fingerprint', ''))
     or input_hash !~ '^[0-9a-f]{64}$'
     or checkpoint_hash_value !~ '^[0-9a-f]{64}$'
     or input->>'tournament_id' <> '2026'
     or input->>'phase' not in (
       'Pre-Tournament', 'After Round 1', 'After Round 2',
       'Round 3 Pairings Announced', 'Final Results'
     )
     or coalesce((input->>'total_iterations')::integer, 0)
          not in (10000, 25000, 50000, 100000)
     or coalesce(input->>'engine_version', '') = ''
     or coalesce(input->>'publication_contract_version', '') = ''
     or coalesce(input->>'checkpoint_contract_version', '') = ''
     or coalesce(input->>'deterministic_seed', '') = ''
     or coalesce(input->>'requested_by', '') = ''
     or coalesce(input->>'output_timestamp', '') = ''
     or jsonb_typeof(input->'input_snapshot') <> 'object'
     or jsonb_typeof(input->'checkpoint_payload') <> 'object'
     or jsonb_typeof(input->'source_revision') <> 'object'
     or coalesce(input->>'invocation_canonical_json', '') = ''
     or coalesce(input->>'input_snapshot_canonical_json', '') = ''
     or coalesce(input->>'checkpoint_canonical_json', '') = '' then
    raise exception using errcode = '22023',
      message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_JOB_REQUIRED';
  end if;

  begin
    invocation_value := (input->>'invocation_canonical_json')::jsonb;
    input_snapshot_value := (input->>'input_snapshot_canonical_json')::jsonb;
    checkpoint_value := (input->>'checkpoint_canonical_json')::jsonb;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_CANONICAL_JSON_INVALID';
  end;
  if input_snapshot_value is distinct from input->'input_snapshot'
     or checkpoint_value is distinct from input->'checkpoint_payload'
     or encode(extensions.digest(input->>'input_snapshot_canonical_json', 'sha256'), 'hex')
          <> input_hash
     or encode(extensions.digest(input->>'checkpoint_canonical_json', 'sha256'), 'hex')
          <> checkpoint_hash_value
     or encode(extensions.digest(input->>'invocation_canonical_json', 'sha256'), 'hex')
          <> job
     or invocation_value->>'tournamentId' <> '2026'
     or invocation_value->>'phase' is distinct from input->>'phase'
     or coalesce((invocation_value->>'iterations')::integer, 0)
          <> (input->>'total_iterations')::integer
     or invocation_value->>'inputFingerprint' is distinct from input_hash
     or invocation_value->>'settingsFingerprint'
          is distinct from config.settings_fingerprint
     or input#>>'{input_snapshot,metadata,settingsFingerprint}'
          is distinct from config.settings_fingerprint
     or input#>>'{input_snapshot,sheets,tournaments,0,Tournament ID}'
          is distinct from '2026' then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_DETERMINISTIC_IDENTITY_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtext('production-odds-job:' || job));
  select * into existing
  from scoring_authority.odds_calculation_jobs
  where job_id = job for update;
  if found then
    if existing.input_fingerprint <> input_hash
       or existing.input_configuration_id <> config.id
       or existing.input_bundle_fingerprint <> config.bundle_fingerprint
       or existing.total_iterations <> (input->>'total_iterations')::integer
       or existing.production_deployment_commit <> input->>'deployment_commit'
       or existing.production_operation_mode <> input->>'operation_mode' then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_ODDS_CALCULATION_JOB_IDENTITY_CONFLICT';
    end if;
    return jsonb_build_object(
      'ok', true, 'changed', false, 'duplicate', true,
      'job', to_jsonb(existing) - 'input_snapshot' - 'checkpoint_payload'
        - 'result_payload' - 'claim_token',
      'publication_created', false, 'mirror_created', false
    );
  end if;

  insert into scoring_authority.odds_calculation_jobs (
    job_id, tournament_id, phase, total_iterations, engine_version,
    publication_contract_version, checkpoint_contract_version,
    deterministic_seed, input_fingerprint, settings_fingerprint,
    invocation_fingerprint, source_revision, input_snapshot,
    checkpoint_payload, checkpoint_hash, requested_by, output_timestamp,
    resource_metrics, input_configuration_id, effective_settings_fingerprint,
    input_bundle_fingerprint, production_operation_mode,
    production_deployment_commit, production_candidate_hostname,
    publication_status, publication_reference
  ) values (
    job, '2026', input->>'phase', (input->>'total_iterations')::integer,
    input->>'engine_version', input->>'publication_contract_version',
    input->>'checkpoint_contract_version', input->>'deterministic_seed',
    input_hash, config.settings_fingerprint, job, input->'source_revision',
    input->'input_snapshot', input->'checkpoint_payload', checkpoint_hash_value,
    left(input->>'requested_by', 180), (input->>'output_timestamp')::timestamptz,
    coalesce(input->'resource_metrics', '{}'::jsonb), config.id,
    config.effective_settings_fingerprint, config.bundle_fingerprint,
    input->>'operation_mode', input->>'deployment_commit',
    nullif(input->>'candidate_hostname', ''), 'NOT_REQUESTED', '{}'::jsonb
  ) returning * into inserted;

  update scoring_authority.odds_calculation_jobs
  set status = 'SUPERSEDED', publication_status = 'STALE',
      superseded_by = job, superseded_at = now(), claim_token = null,
      lease_expires_at = null,
      last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
      last_error_safe = 'Canonical Production calculation inputs advanced.',
      updated_at = now()
  where job_id <> job and tournament_id = '2026' and phase = input->>'phase'
    and input_bundle_fingerprint is distinct from config.bundle_fingerprint
    and status in ('PENDING', 'RUNNING', 'RETRYABLE', 'SUCCEEDED')
    and publication_status <> 'PUBLISHED';
  get diagnostics superseded_count = row_count;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_ODDS_CALCULATION_REQUESTED',
    'CHAMPIONSHIP_ODDS_CALCULATION', '2026',
    left(input->>'requested_by', 160), job, 'SUCCEEDED',
    jsonb_build_object(
      'job_id', job, 'phase', input->>'phase',
      'iterations', (input->>'total_iterations')::integer,
      'input_fingerprint', input_hash,
      'settings_fingerprint', config.settings_fingerprint,
      'effective_settings_fingerprint', config.effective_settings_fingerprint,
      'input_bundle_fingerprint', config.bundle_fingerprint,
      'superseded_jobs', superseded_count,
      'publication_created', false, 'mirror_created', false
    )
  );
  return jsonb_build_object(
    'ok', true, 'changed', true, 'duplicate', false,
    'superseded_jobs', superseded_count,
    'job', to_jsonb(inserted) - 'input_snapshot' - 'checkpoint_payload'
      - 'result_payload' - 'claim_token',
    'publication_created', false, 'mirror_created', false
  );
end;
$$;

create or replace function public.claim_production_odds_calculation_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
as $$
declare
  job text := lower(coalesce(input->>'job_id', ''));
  retained scoring_authority.odds_calculation_jobs%rowtype;
  config scoring_authority.odds_input_configurations%rowtype;
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  if job !~ '^[0-9a-f]{64}$' or coalesce(input->>'worker_id', '') = '' then
    raise exception using errcode = '22023',
      message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_CLAIM_REQUIRED';
  end if;
  select * into retained from scoring_authority.odds_calculation_jobs
  where job_id = job for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND');
  end if;

  config := production_control.current_production_odds_inputs(
    input || jsonb_build_object(
      'input_configuration_id', retained.input_configuration_id,
      'configuration_revision', retained.source_revision->>'configuration_revision',
      'settings_fingerprint', retained.settings_fingerprint,
      'effective_settings_fingerprint', retained.effective_settings_fingerprint,
      'input_bundle_fingerprint', retained.input_bundle_fingerprint,
      'source_revision', retained.source_revision
    )
  );
  if retained.input_configuration_id <> config.id
     or retained.input_bundle_fingerprint <> config.bundle_fingerprint then
    update scoring_authority.odds_calculation_jobs
    set status = 'SUPERSEDED', publication_status = 'STALE',
        superseded_at = now(), claim_token = null, lease_expires_at = null,
        last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
        last_error_safe = 'Canonical Production calculation inputs advanced.',
        updated_at = now()
    where job_id = job;
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_JOB_SUPERSEDED',
      'retryable', false
    );
  end if;

  if retained.status = 'SUCCEEDED' then
    return jsonb_build_object(
      'ok', true, 'deliver', false, 'completed', true,
      'job', to_jsonb(retained) - 'claim_token'
    );
  end if;
  if retained.status in ('SUPERSEDED', 'FAILED') then
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_JOB_' || retained.status,
      'retryable', false
    );
  end if;
  if retained.status = 'RUNNING' and retained.lease_expires_at > now() then
    return jsonb_build_object(
      'ok', true, 'deliver', false, 'in_progress', true,
      'job', to_jsonb(retained) - 'input_snapshot' - 'checkpoint_payload'
        - 'result_payload' - 'claim_token'
    );
  end if;

  update scoring_authority.odds_calculation_jobs
  set status = 'RUNNING', attempt_count = attempt_count + 1,
      claim_token = extensions.gen_random_uuid(),
      lease_owner = left(input->>'worker_id', 180),
      lease_expires_at = now() + interval '12 minutes',
      started_at = coalesce(started_at, now()), updated_at = now(),
      last_error_code = null, last_error_safe = null
  where job_id = job returning * into retained;
  return jsonb_build_object(
    'ok', true, 'deliver', true, 'job', to_jsonb(retained),
    'publication_created', false, 'mirror_created', false
  );
exception when sqlstate 'P0001' then
  if sqlerrm = 'PRODUCTION_ODDS_INPUT_REVISION_STALE' then
    update scoring_authority.odds_calculation_jobs
    set status = 'SUPERSEDED', publication_status = 'STALE',
        superseded_at = now(), claim_token = null, lease_expires_at = null,
        last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
        last_error_safe = 'Canonical Production calculation inputs advanced.',
        updated_at = now()
    where job_id = job and status in ('PENDING', 'RUNNING', 'RETRYABLE', 'SUCCEEDED');
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_JOB_SUPERSEDED',
      'retryable', false
    );
  end if;
  raise;
end;
$$;

create or replace function public.checkpoint_production_odds_calculation_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
as $$
declare
  job text := lower(coalesce(input->>'job_id', ''));
  claim uuid := nullif(input->>'claim_token', '')::uuid;
  progress integer := coalesce((input->>'completed_iterations')::integer, 0);
  checkpoint_hash_value text := lower(coalesce(input->>'checkpoint_hash', ''));
  retained scoring_authority.odds_calculation_jobs%rowtype;
  existing_checkpoint scoring_authority.odds_calculation_checkpoints%rowtype;
  next_sequence integer;
  canonical_value jsonb;
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  if job !~ '^[0-9a-f]{64}$' or claim is null
     or checkpoint_hash_value !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(input->'checkpoint_payload') <> 'object'
     or coalesce(input->>'checkpoint_canonical_json', '') = '' then
    raise exception using errcode = '22023',
      message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_CHECKPOINT_REQUIRED';
  end if;
  begin
    canonical_value := (input->>'checkpoint_canonical_json')::jsonb;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_CANONICAL_JSON_INVALID';
  end;
  if canonical_value is distinct from input->'checkpoint_payload'
     or encode(extensions.digest(input->>'checkpoint_canonical_json', 'sha256'), 'hex')
          <> checkpoint_hash_value then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_CHECKPOINT_FINGERPRINT_MISMATCH';
  end if;

  select * into retained from scoring_authority.odds_calculation_jobs
  where job_id = job for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND');
  end if;
  if retained.status <> 'RUNNING'
     or retained.claim_token is distinct from claim
     or retained.lease_expires_at <= now() then
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_CLAIM_STALE',
      'retryable', false
    );
  end if;
  if progress < retained.completed_iterations or progress > retained.total_iterations then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_PROGRESS_INVALID');
  end if;
  if progress = retained.completed_iterations then
    if retained.checkpoint_hash = checkpoint_hash_value then
      return jsonb_build_object(
        'ok', true, 'duplicate', true,
        'checkpoint_count', retained.checkpoint_count,
        'completed_iterations', retained.completed_iterations
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_CHECKPOINT_CONFLICT');
  end if;

  select * into existing_checkpoint
  from scoring_authority.odds_calculation_checkpoints
  where job_id = job and completed_iterations = progress;
  if found then
    if existing_checkpoint.checkpoint_hash = checkpoint_hash_value then
      return jsonb_build_object(
        'ok', true, 'duplicate', true,
        'checkpoint_count', retained.checkpoint_count,
        'completed_iterations', progress
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_CHECKPOINT_CONFLICT');
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
  update scoring_authority.odds_calculation_jobs
  set completed_iterations = progress,
      checkpoint_payload = input->'checkpoint_payload',
      checkpoint_hash = checkpoint_hash_value,
      checkpoint_count = next_sequence,
      resource_metrics = coalesce(input->'resource_metrics', resource_metrics),
      lease_expires_at = now() + interval '12 minutes', updated_at = now()
  where job_id = job;
  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'completed_iterations', progress,
    'total_iterations', retained.total_iterations,
    'checkpoint_count', next_sequence,
    'publication_created', false, 'mirror_created', false
  );
end;
$$;

create or replace function public.complete_production_odds_calculation_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
as $$
declare
  job text := lower(coalesce(input->>'job_id', ''));
  claim uuid := nullif(input->>'claim_token', '')::uuid;
  result_hash text := lower(coalesce(input->>'result_fingerprint', ''));
  retained scoring_authority.odds_calculation_jobs%rowtype;
  config scoring_authority.odds_input_configurations%rowtype;
  canonical_value jsonb;
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  if job !~ '^[0-9a-f]{64}$' or claim is null
     or result_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(input->'result_payload') <> 'object'
     or jsonb_typeof(input->'result_fingerprint_payload') <> 'object'
     or coalesce(input->>'result_canonical_json', '') = '' then
    raise exception using errcode = '22023',
      message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_RESULT_REQUIRED';
  end if;
  begin
    canonical_value := (input->>'result_canonical_json')::jsonb;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_CANONICAL_JSON_INVALID';
  end;
  if canonical_value is distinct from input->'result_fingerprint_payload'
     or input->'result_fingerprint_payload'
          is distinct from (input->'result_payload') - 'publishedAt'
     or encode(extensions.digest(input->>'result_canonical_json', 'sha256'), 'hex')
          <> result_hash then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_ODDS_RESULT_FINGERPRINT_MISMATCH';
  end if;

  select * into retained from scoring_authority.odds_calculation_jobs
  where job_id = job for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND');
  end if;

  config := production_control.current_production_odds_inputs(
    input || jsonb_build_object(
      'input_configuration_id', retained.input_configuration_id,
      'configuration_revision', retained.source_revision->>'configuration_revision',
      'settings_fingerprint', retained.settings_fingerprint,
      'effective_settings_fingerprint', retained.effective_settings_fingerprint,
      'input_bundle_fingerprint', retained.input_bundle_fingerprint,
      'source_revision', retained.source_revision
    )
  );
  if retained.input_configuration_id <> config.id
     or retained.input_bundle_fingerprint <> config.bundle_fingerprint then
    update scoring_authority.odds_calculation_jobs
    set status = 'SUPERSEDED', publication_status = 'STALE',
        superseded_at = now(), claim_token = null, lease_owner = null,
        lease_expires_at = null,
        last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
        last_error_safe = 'Canonical Production calculation inputs advanced.',
        updated_at = now()
    where job_id = job;
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_JOB_SUPERSEDED',
      'retryable', false, 'publication_created', false, 'mirror_created', false
    );
  end if;
  if retained.status = 'SUCCEEDED' then
    if retained.result_fingerprint = result_hash then
      return jsonb_build_object(
        'ok', true, 'duplicate', true, 'job_id', job,
        'result_fingerprint', result_hash,
        'publication_status', retained.publication_status,
        'publication_created', false, 'mirror_created', false
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_RESULT_CONFLICT');
  end if;
  if retained.status <> 'RUNNING'
     or retained.claim_token is distinct from claim
     or retained.lease_expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_CLAIM_STALE');
  end if;
  if retained.completed_iterations <> retained.total_iterations then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_INCOMPLETE');
  end if;

  update scoring_authority.odds_calculation_jobs
  set status = 'SUCCEEDED', publication_status = 'READY',
      publication_reference = '{}'::jsonb,
      result_payload = input->'result_payload',
      result_fingerprint = result_hash,
      output_payload_bytes = greatest(
        0, coalesce((input->>'output_payload_bytes')::integer, 0)
      ),
      resource_metrics = coalesce(input->'resource_metrics', resource_metrics),
      claim_token = null, lease_owner = null, lease_expires_at = null,
      completed_at = now(), updated_at = now(),
      last_error_code = null, last_error_safe = null
  where job_id = job returning * into retained;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_ODDS_CALCULATION_SUCCEEDED',
    'CHAMPIONSHIP_ODDS_CALCULATION', '2026', retained.requested_by,
    job, 'SUCCEEDED', jsonb_build_object(
      'job_id', job, 'phase', retained.phase,
      'iterations', retained.total_iterations,
      'result_fingerprint', result_hash,
      'checkpoint_count', retained.checkpoint_count,
      'attempt_count', retained.attempt_count,
      'calculation_completed', true,
      'publication_status', 'READY',
      'publication_created', false, 'mirror_created', false
    )
  );
  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'job_id', job,
    'result_fingerprint', result_hash,
    'checkpoint_count', retained.checkpoint_count,
    'attempt_count', retained.attempt_count,
    'publication_status', retained.publication_status,
    'publication_created', false, 'mirror_created', false
  );
exception when sqlstate 'P0001' then
  if sqlerrm = 'PRODUCTION_ODDS_INPUT_REVISION_STALE' then
    update scoring_authority.odds_calculation_jobs
    set status = 'SUPERSEDED', publication_status = 'STALE',
        superseded_at = now(), claim_token = null, lease_owner = null,
        lease_expires_at = null,
        last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
        last_error_safe = 'Canonical Production calculation inputs advanced.',
        updated_at = now()
    where job_id = job and status in ('PENDING', 'RUNNING', 'RETRYABLE', 'SUCCEEDED');
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_JOB_SUPERSEDED',
      'retryable', false, 'publication_created', false, 'mirror_created', false
    );
  end if;
  raise;
end;
$$;

create or replace function public.fail_production_odds_calculation_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  job text := lower(coalesce(input->>'job_id', ''));
  claim uuid := nullif(input->>'claim_token', '')::uuid;
  retryable boolean := coalesce((input->>'retryable')::boolean, true);
  retained scoring_authority.odds_calculation_jobs%rowtype;
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  if job !~ '^[0-9a-f]{64}$' or claim is null then
    raise exception using errcode = '22023',
      message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_FAILURE_REQUIRED';
  end if;
  update scoring_authority.odds_calculation_jobs
  set status = case when retryable then 'RETRYABLE' else 'FAILED' end,
      claim_token = null, lease_owner = null, lease_expires_at = null,
      last_error_code = left(coalesce(
        nullif(input->>'error_code', ''), 'ODDS_CALCULATION_FAILED'
      ), 120),
      last_error_safe = left(coalesce(
        nullif(input->>'error_safe', ''),
        'Championship calculation stopped safely.'
      ), 400),
      completed_at = case when retryable then completed_at else now() end,
      updated_at = now()
  where job_id = job and status = 'RUNNING' and claim_token = claim
  returning * into retained;
  if not found then
    return jsonb_build_object(
      'ok', true, 'marked', false, 'stale_claim', true,
      'publication_created', false, 'mirror_created', false
    );
  end if;
  return jsonb_build_object(
    'ok', true, 'marked', true, 'retryable', retryable,
    'status', retained.status,
    'completed_iterations', retained.completed_iterations,
    'checkpoint_count', retained.checkpoint_count,
    'publication_created', false, 'mirror_created', false
  );
end;
$$;

create or replace function public.supersede_production_odds_calculation_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  job text := lower(coalesce(input->>'job_id', ''));
  retained scoring_authority.odds_calculation_jobs%rowtype;
  config scoring_authority.odds_input_configurations%rowtype;
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  if job !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'COMPLETE_PRODUCTION_ODDS_CALCULATION_SUPERSESSION_REQUIRED';
  end if;
  select * into retained from scoring_authority.odds_calculation_jobs
  where job_id = job for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND');
  end if;
  select * into strict config from scoring_authority.odds_input_configurations
  where tournament_id = '2026' and is_current;
  if retained.input_bundle_fingerprint = config.bundle_fingerprint
     and retained.input_configuration_id = config.id then
    return jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_INPUTS_STILL_CURRENT'
    );
  end if;
  update scoring_authority.odds_calculation_jobs
  set status = 'SUPERSEDED', publication_status = 'STALE',
      superseded_at = now(), claim_token = null, lease_owner = null,
      lease_expires_at = null,
      last_error_code = 'ODDS_CALCULATION_SOURCE_ADVANCED',
      last_error_safe = 'Canonical Production calculation inputs advanced.',
      updated_at = now()
  where job_id = job and status in ('PENDING', 'RUNNING', 'RETRYABLE', 'SUCCEEDED')
  returning * into retained;
  return jsonb_build_object(
    'ok', true, 'superseded', found,
    'publication_created', false, 'mirror_created', false
  );
end;
$$;

create or replace function public.read_production_odds_calculation_jobs(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  jobs jsonb;
  checkpoints jsonb;
  target_job text := nullif(lower(coalesce(input->>'job_id', '')), '');
begin
  perform production_control.assert_production_odds_calculation_scope(input, true);
  if target_job is not null and target_job !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'PRODUCTION_ODDS_JOB_ID_INVALID';
  end if;
  select coalesce(jsonb_agg(
    to_jsonb(job_value) - 'claim_token'
    order by job_value.requested_at desc
  ), '[]'::jsonb) into jobs
  from scoring_authority.odds_calculation_jobs job_value
  where job_value.tournament_id = '2026'
    and (target_job is null or job_value.job_id = target_job);
  select coalesce(jsonb_agg(
    to_jsonb(checkpoint_value) - 'checkpoint_payload'
    order by checkpoint_value.job_id, checkpoint_value.checkpoint_sequence
  ), '[]'::jsonb) into checkpoints
  from scoring_authority.odds_calculation_checkpoints checkpoint_value
  join scoring_authority.odds_calculation_jobs job_value
    on job_value.job_id = checkpoint_value.job_id
  where job_value.tournament_id = '2026'
    and (target_job is null or checkpoint_value.job_id = target_job);
  return jsonb_build_object(
    'ok', true, 'jobs', jobs, 'checkpoints', checkpoints,
    'publication_created', false, 'mirror_created', false
  );
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'production_control.assert_production_odds_calculation_scope(jsonb,boolean)',
    'production_control.current_production_odds_inputs(jsonb)',
    'public.configure_production_odds_calculation_runtime(jsonb)',
    'public.request_production_odds_calculation_job(jsonb)',
    'public.claim_production_odds_calculation_job(jsonb)',
    'public.checkpoint_production_odds_calculation_job(jsonb)',
    'public.complete_production_odds_calculation_job(jsonb)',
    'public.fail_production_odds_calculation_job(jsonb)',
    'public.supersede_production_odds_calculation_job(jsonb)',
    'public.read_production_odds_calculation_jobs(jsonb)'
  ] loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
  end loop;
end
$$;

grant execute on function public.configure_production_odds_calculation_runtime(jsonb)
  to service_role;
grant execute on function public.request_production_odds_calculation_job(jsonb)
  to service_role;
grant execute on function public.claim_production_odds_calculation_job(jsonb)
  to service_role;
grant execute on function public.checkpoint_production_odds_calculation_job(jsonb)
  to service_role;
grant execute on function public.complete_production_odds_calculation_job(jsonb)
  to service_role;
grant execute on function public.fail_production_odds_calculation_job(jsonb)
  to service_role;
grant execute on function public.supersede_production_odds_calculation_job(jsonb)
  to service_role;
grant execute on function public.read_production_odds_calculation_jobs(jsonb)
  to service_role;

alter default privileges in schema production_control
  revoke all on functions from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
