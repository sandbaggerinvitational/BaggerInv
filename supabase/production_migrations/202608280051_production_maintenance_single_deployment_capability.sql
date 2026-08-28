-- One-deployment MAINTENANCE_WINDOW_V1 capability ceiling.
--
-- Installation is inert. It records no binding, advances no phase, enables no
-- worker, starts no Odds runtime, changes no authority, and opens no ingress.
-- The one exact rebound Production deployment may advertise its final server
-- capabilities in advance, but database phase and worker/runtime controls stay
-- authoritative for every activation.
begin;

create table production_control.maintenance_release_candidate_history (
  history_id uuid primary key default extensions.gen_random_uuid(),
  original_binding_id uuid not null unique,
  archived_binding jsonb not null check (
    pg_catalog.jsonb_typeof(archived_binding) = 'object'
  ),
  superseded_by_release_sha text not null check (
    superseded_by_release_sha ~ '^[0-9a-f]{40}$'
  ),
  superseded_by_candidate_deployment_id text not null check (
    superseded_by_candidate_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  superseded_by_actor text not null check (
    pg_catalog.btrim(superseded_by_actor) <> ''
    and pg_catalog.length(superseded_by_actor) <= 160
  ),
  archived_at timestamptz not null default pg_catalog.now()
);

alter table production_control.maintenance_release_candidate_history
  enable row level security;

create table production_control.maintenance_deployment_capability_bindings (
  capability_binding_id uuid primary key default extensions.gen_random_uuid(),
  rebind_id uuid not null unique references
    production_control.maintenance_runtime_deployment_rebindings(rebind_id)
    on delete restrict,
  boundary_mode text not null check (
    boundary_mode = 'MAINTENANCE_WINDOW_V1'
  ),
  contract_version text not null check (
    contract_version =
      'production-maintenance-single-deployment-capability-v1'
  ),
  capability_ceiling text not null check (
    capability_ceiling = 'OBSERVATION'
  ),
  tournament_id text not null check (tournament_id = '2026'),
  epoch_id uuid not null unique references
    scoring_authority.authority_epochs(epoch_id) on delete restrict,
  deployment_id text not null unique check (
    deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  deployment_commit text not null check (
    deployment_commit ~ '^[0-9a-f]{40}$'
  ),
  capability_manifest jsonb not null check (
    pg_catalog.jsonb_typeof(capability_manifest) = 'object'
  ),
  capability_fingerprint text not null unique check (
    capability_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  runtime_observed_at timestamptz not null,
  request_fingerprint text not null unique check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  response_value jsonb not null check (
    pg_catalog.jsonb_typeof(response_value) = 'object'
  ),
  created_at timestamptz not null default pg_catalog.now()
);

alter table production_control.maintenance_deployment_capability_bindings
  enable row level security;

revoke all on table
  production_control.maintenance_release_candidate_history,
  production_control.maintenance_deployment_capability_bindings
  from public, anon, authenticated, service_role;

-- A new exact release may replace only an unused, dormant maintenance release
-- binding. The prior immutable row is archived intact; installation itself does
-- not invoke this owner-only operation or alter an existing binding.
alter function
  production_control.bind_production_maintenance_release_candidate(jsonb)
  rename to bind_production_maintenance_release_candidate_pre_capability;

revoke all on function
  production_control.bind_production_maintenance_release_candidate_pre_capability(
    jsonb
  ) from public, anon, authenticated, service_role;

create or replace function
  production_control.bind_production_maintenance_release_candidate(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  prior_binding production_control.maintenance_release_candidates%rowtype;
  target_release text := pg_catalog.lower(
    coalesce(input->>'deployment_commit', '')
  );
begin
  if not pg_catalog.pg_has_role(session_user, current_user, 'USAGE') then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DATABASE_OWNER_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select value.* into prior_binding
  from production_control.maintenance_release_candidates value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;

  if prior_binding.binding_id is not null
     and (prior_binding.release_sha is distinct from target_release
       or prior_binding.candidate_deployment_id is distinct from
         input->>'deployment_id')
  then
    if activation.state <> 'DORMANT'
       or activation.current_authority <> 'GOOGLE'
       or activation.maintenance_state <> 'NORMAL'
       or activation.expected_deployment_commit is not null
       or activation.active_transition_epoch_id is not null
       or activation.first_supabase_write_possible_at is not null
       or activation.first_supabase_write_observed_at is not null
       or resource.current_tournament_read_authority <> 'GOOGLE'
       or resource.scoring_authority <> 'GOOGLE'
       or resource.participant_identity_authority <> 'PASSPORT'
       or resource.public_supabase_reads_enabled
       or resource.scoring_ingress_enabled
       or resource.workers_enabled
       or resource.google_writes_enabled
       or resource.odds_publication_enabled
       or gate.authority <> 'GOOGLE'
       or gate.state not in ('OPEN', 'PAUSED')
       or gate.admission_state <> 'OPEN'
       or exists (
         select 1
         from scoring_authority.authority_epochs epoch
         where epoch.tournament_id = '2026'
           and epoch.status in ('PREPARED', 'COMMITTED')
       )
       or exists (
         select 1
         from production_control.maintenance_runtime_deployment_rebindings value
         where value.deployment_commit = prior_binding.release_sha
       )
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_MAINTENANCE_RELEASE_SUPERSESSION_NOT_SAFE';
    end if;
    insert into production_control.maintenance_release_candidate_history (
      original_binding_id, archived_binding,
      superseded_by_release_sha, superseded_by_candidate_deployment_id,
      superseded_by_actor
    ) values (
      prior_binding.binding_id, pg_catalog.to_jsonb(prior_binding),
      target_release, input->>'deployment_id',
      pg_catalog.left(input->>'actor_id', 160)
    );
    delete from production_control.maintenance_release_candidates
    where binding_id = prior_binding.binding_id;
  end if;

  return production_control
    .bind_production_maintenance_release_candidate_pre_capability(input);
end;
$$;

revoke all on function
  production_control.bind_production_maintenance_release_candidate(jsonb)
  from public, anon, authenticated, service_role;

-- Extend the database-computed environment manifest for the exact new release.
-- The existing staging algorithm remains responsible for the hashes.
alter function
  production_control.production_maintenance_selected_configuration_v2(
    text, text, text, text
  ) rename to production_maintenance_selected_configuration_pre_capability;

revoke all on function
  production_control.production_maintenance_selected_configuration_pre_capability(
    text, text, text, text
  ) from public, anon, authenticated, service_role;

create or replace function
  production_control.production_maintenance_selected_configuration_v2(
    target_release_sha text,
    target_candidate_deployment_id text,
    target_candidate_deployment_hostname text,
    target_binding_fingerprint text
  )
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select production_control
    .production_maintenance_selected_configuration_pre_capability(
      target_release_sha,
      target_candidate_deployment_id,
      target_candidate_deployment_hostname,
      target_binding_fingerprint
    ) || pg_catalog.jsonb_build_object(
      'precommit_deployment_rebind_contract',
        'production-maintenance-precommit-deployment-rebind-v2',
      'precommit_deployment_rebind_migration',
        '202608280051_production_maintenance_single_deployment_capability.sql',
      'deployment_capability_contract',
        'production-maintenance-single-deployment-capability-v1',
      'deployment_capability_ceiling', 'OBSERVATION',
      'deployment_base_phase', 'SCORING_COMMIT',
      'public_supabase_reads_enabled', true,
      'workers_enabled', true,
      'scoring_google_mirror_enabled', true,
      'round_scorecards_archive_enabled', true,
      'odds_calculation_enabled', true,
      'war_room_input_source', 'SUPABASE',
      'prediction_settings_read_source', 'SUPABASE',
      'odds_calculation_input_source', 'SUPABASE',
      'prediction_settings_fingerprints',
        'EXACT_CURRENT_PRODUCTION_ODDS_INPUT_REQUIRED',
      'odds_publication_authority', 'GOOGLE',
      'supabase_odds_publication_enabled', false,
      'supabase_odds_google_mirror_enabled', false,
      'database_phase_authoritative', true,
      'postcommit_redeployment_required', false
    )
$$;

revoke all on function
  production_control.production_maintenance_selected_configuration_v2(
    text, text, text, text
  ) from public, anon, authenticated, service_role;

-- Keep migration 050's atomic deployment-ID transition, but make the public
-- operation attest and persist the final dormant capability snapshot.
alter function
  public.rebind_production_maintenance_precommit_deployment(jsonb)
  rename to rebind_production_maintenance_precommit_deployment_v1;

revoke all on function
  public.rebind_production_maintenance_precommit_deployment_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function
  public.rebind_production_maintenance_precommit_deployment(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  prior production_control.maintenance_deployment_capability_bindings%rowtype;
  created production_control.maintenance_deployment_capability_bindings%rowtype;
  odds_config scoring_authority.odds_input_configurations%rowtype;
  capability_manifest jsonb;
  capability_fingerprint text;
  runtime_observed_at timestamptz;
  legacy_input jsonb;
  legacy_response jsonb;
  response_value jsonb;
  intent_input jsonb := input - 'runtime_observed_at';
begin
  perform production_control.assert_maintenance_common_input(input);
  perform production_control.assert_no_active_physical_writer_fence();
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  if input->>'operation' is distinct from
       'REBIND_PRODUCTION_MAINTENANCE_PRECOMMIT_DEPLOYMENT'
     or input->>'runtime_binding_contract' is distinct from
       'production-maintenance-precommit-deployment-rebind-v2'
     or input->>'runtime_deployment_capability_contract' is distinct from
       'production-maintenance-single-deployment-capability-v1'
     or input->>'runtime_deployment_capability_ceiling' is distinct from
       'OBSERVATION'
     or input->>'runtime_cutover_phase' is distinct from 'SCORING_COMMIT'
     or input->>'runtime_deployment_status' is distinct from 'READY'
     or input->>'runtime_readiness_evidence' is distinct from
       'LIVE_CANONICAL_PRODUCTION_ROUTE'
     or input->>'runtime_deployment_target' is distinct from 'PRODUCTION'
     or input->>'runtime_environment' is distinct from 'production'
     or input->>'runtime_vercel_project' is distinct from 'bagger-inv'
     or input->>'runtime_vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'runtime_vercel_team_id' is distinct from
       'team_kPw5zaib8uaQJALAwj4fWI6R'
     or input->>'runtime_canonical_hostname' is distinct from 'baggerinv.com'
     or input->>'runtime_scoring_authority' is distinct from 'SUPABASE'
     or input->>'runtime_participant_identity_authority' is distinct from
       'SUPABASE'
     or input->'runtime_activation_enabled' is distinct from 'true'::jsonb
     or input->'runtime_foundation_enabled' is distinct from 'true'::jsonb
     or input->'runtime_public_supabase_reads_enabled' is distinct from
       'true'::jsonb
     or input->'runtime_google_ingress_lease_gate_enabled' is distinct from
       'true'::jsonb
     or input->'runtime_supabase_scoring_ingress_enabled' is distinct from
       'true'::jsonb
     or input->'runtime_workers_enabled' is distinct from 'true'::jsonb
     or input->'runtime_google_mirror_enabled' is distinct from 'true'::jsonb
     or input->'runtime_scorecard_archive_enabled' is distinct from
       'true'::jsonb
     or input->'runtime_outbox_worker_secret_configured' is distinct from
       'true'::jsonb
     or input->'runtime_archive_worker_secret_configured' is distinct from
       'true'::jsonb
     or input->'runtime_odds_calculation_enabled' is distinct from
       'true'::jsonb
     or input->>'runtime_war_room_input_source' is distinct from 'SUPABASE'
     or input->>'runtime_prediction_settings_read_source' is distinct from
       'SUPABASE'
     or input->>'runtime_odds_calculation_input_source' is distinct from
       'SUPABASE'
     or coalesce(input->>'runtime_prediction_settings_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(
       input->>'runtime_prediction_settings_effective_fingerprint', ''
     ) !~ '^[0-9a-f]{64}$'
     or input->>'runtime_odds_publication_authority' is distinct from 'GOOGLE'
     or input->'runtime_supabase_odds_publication_enabled' is distinct from
       'false'::jsonb
     or input->'runtime_supabase_odds_google_mirror_enabled' is distinct from
       'false'::jsonb
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_CAPABILITY_ATTESTATION_INVALID';
  end if;

  select value.* into strict odds_config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = '2026' and value.is_current;
  if odds_config.validation_status <> 'VALID'
     or pg_catalog.lower(
       input->>'runtime_prediction_settings_source_fingerprint'
     ) is distinct from pg_catalog.lower(odds_config.source_fingerprint)
     or pg_catalog.lower(
       input->>'runtime_prediction_settings_effective_fingerprint'
     ) is distinct from pg_catalog.lower(
       odds_config.effective_settings_fingerprint
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_PREDICTION_SETTINGS_BINDING_REQUIRED';
  end if;

  capability_manifest := pg_catalog.jsonb_build_object(
    'domain', 'BAGGER_MAINTENANCE_SINGLE_DEPLOYMENT_CAPABILITY_V1',
    'contract_version',
      'production-maintenance-single-deployment-capability-v1',
    'capability_ceiling', 'OBSERVATION',
    'base_cutover_phase', 'SCORING_COMMIT',
    'release_sha', pg_catalog.lower(input->>'deployment_commit'),
    'deployment_id', input->>'deployment_id',
    'deployment_hostname', input->>'runtime_deployment_hostname',
    'deployment_status', 'READY',
    'deployment_target', 'PRODUCTION',
    'runtime_environment', 'production',
    'vercel_project', 'bagger-inv',
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
    'supabase_project_ref', 'ymqhhtxaywtqllynrmxe',
    'google_workbook_id',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
    'tournament_id', '2026',
    'prepared_authority_epoch', pg_catalog.lower(input->>'epoch_id'),
    'authority_generation',
      pg_catalog.lower(input->>'expected_authority_generation'),
    'admission_generation',
      pg_catalog.lower(input->>'expected_admission_generation'),
    'expected_activation_revision',
      (input->>'expected_activation_revision')::bigint,
    'expected_admission_revision',
      (input->>'expected_admission_revision')::bigint,
    'scoring_authority', 'SUPABASE',
    'participant_identity_authority', 'SUPABASE',
    'public_supabase_reads_enabled', true,
    'supabase_scoring_ingress_capability', true,
    'workers_capability', true,
    'scoring_google_mirror_capability', true,
    'round_scorecards_archive_capability', true,
    'outbox_worker_secret_configured', true,
    'archive_worker_secret_configured', true,
    'odds_calculation_capability', true,
    'war_room_input_source', 'SUPABASE',
    'prediction_settings_read_source', 'SUPABASE',
    'odds_calculation_input_source', 'SUPABASE',
    'prediction_settings_source_fingerprint', pg_catalog.lower(
      input->>'runtime_prediction_settings_source_fingerprint'
    ),
    'prediction_settings_effective_fingerprint', pg_catalog.lower(
      input->>'runtime_prediction_settings_effective_fingerprint'
    ),
    'odds_publication_authority', 'GOOGLE',
    'supabase_odds_publication_enabled', false,
    'supabase_odds_google_mirror_enabled', false,
    'database_phase_authoritative', true,
    'database_worker_controls_authoritative', true,
    'database_odds_runtime_authoritative', true,
    'postcommit_redeployment_allowed', false
  );
  capability_fingerprint := pg_catalog.encode(
    extensions.digest(capability_manifest::text, 'sha256'), 'hex'
  );

  select value.* into prior
  from production_control.maintenance_deployment_capability_bindings value
  where value.epoch_id = (input->>'epoch_id')::uuid;
  if found then
    if prior.deployment_id is distinct from input->>'deployment_id'
       or prior.deployment_commit is distinct from
         pg_catalog.lower(input->>'deployment_commit')
       or prior.capability_manifest is distinct from capability_manifest
       or prior.capability_fingerprint is distinct from capability_fingerprint
       or prior.request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or prior.payload_hash is distinct from
         production_control.cutover_payload_hash(intent_input)
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_MAINTENANCE_CAPABILITY_ALREADY_BOUND';
    end if;
    return prior.response_value || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;

  runtime_observed_at := (input->>'runtime_observed_at')::timestamptz;
  if runtime_observed_at is null
     or runtime_observed_at > pg_catalog.now()
     or runtime_observed_at < pg_catalog.now() - interval '5 minutes'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_PRECOMMIT_RUNTIME_NOT_CURRENT';
  end if;

  legacy_input := input || pg_catalog.jsonb_build_object(
    'runtime_binding_contract',
      'production-maintenance-precommit-deployment-rebind-v1',
    'runtime_workers_enabled', false,
    'runtime_google_mirror_enabled', false,
    'runtime_scorecard_archive_enabled', false
  );
  legacy_response :=
    public.rebind_production_maintenance_precommit_deployment_v1(legacy_input);
  response_value := legacy_response || pg_catalog.jsonb_build_object(
    'runtime_binding_contract',
      'production-maintenance-precommit-deployment-rebind-v2',
    'deployment_capability_contract',
      'production-maintenance-single-deployment-capability-v1',
    'deployment_capability_ceiling', 'OBSERVATION',
    'capability_fingerprint', capability_fingerprint,
    'capabilities_dormant', true,
    'workers_enabled', false,
    'odds_runtime_enabled', false,
    'idempotent', false
  );

  insert into production_control.maintenance_deployment_capability_bindings (
    rebind_id, boundary_mode, contract_version, capability_ceiling,
    tournament_id, epoch_id, deployment_id, deployment_commit,
    capability_manifest, capability_fingerprint, runtime_observed_at,
    request_fingerprint, payload_hash, actor_id, response_value
  ) values (
    (legacy_response->>'rebind_id')::uuid,
    'MAINTENANCE_WINDOW_V1',
    'production-maintenance-single-deployment-capability-v1',
    'OBSERVATION', '2026', (input->>'epoch_id')::uuid,
    input->>'deployment_id', pg_catalog.lower(input->>'deployment_commit'),
    capability_manifest, capability_fingerprint, runtime_observed_at,
    pg_catalog.lower(input->>'request_fingerprint'),
    production_control.cutover_payload_hash(intent_input),
    pg_catalog.left(input->>'actor_id', 160), response_value
  ) returning * into created;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_MAINTENANCE_SINGLE_DEPLOYMENT_CAPABILITY_BOUND',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    response_value - 'ok' - 'idempotent'
  );
  return response_value;
end;
$$;

revoke all on function
  public.rebind_production_maintenance_precommit_deployment(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.rebind_production_maintenance_precommit_deployment(jsonb)
  to service_role;

create or replace function
  production_control.assert_production_maintenance_runtime_capability(
    input jsonb,
    required_phase text
  )
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  binding production_control.maintenance_deployment_capability_bindings%rowtype;
  rebound production_control.maintenance_runtime_deployment_rebindings%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  odds_config scoring_authority.odds_input_configurations%rowtype;
  required_rank integer := production_control.cutover_phase_rank(required_phase);
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  select value.* into binding
  from production_control.maintenance_deployment_capability_bindings value
  where value.epoch_id = gate.active_epoch_id;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED';
  end if;
  select value.* into strict rebound
  from production_control.maintenance_runtime_deployment_rebindings value
  where value.rebind_id = binding.rebind_id;
  select value.* into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = binding.epoch_id;

  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or required_rank < 0
     or input->>'deployment_capability_contract' is distinct from
       binding.contract_version
     or input->>'deployment_capability_ceiling' is distinct from
       binding.capability_ceiling
     or input->>'deployment_id' is distinct from binding.deployment_id
     or pg_catalog.lower(coalesce(input->>'deployment_commit', ''))
       is distinct from binding.deployment_commit
     or binding.capability_ceiling <> 'OBSERVATION'
     or production_control.cutover_phase_rank(binding.capability_ceiling)
       < required_rank
     or production_control.cutover_phase_rank(binding.capability_ceiling)
       < production_control.cutover_phase_rank(activation.read_cutover_phase)
     or binding.deployment_commit is distinct from
       activation.expected_deployment_commit
     or not (
       (
         activation.current_authority = 'GOOGLE'
         and activation.active_transition_epoch_id = binding.epoch_id
         and activation.authority_generation_id =
           rebound.authority_generation_id
       )
       or (
         activation.current_authority = 'SUPABASE'
         and activation.active_transition_epoch_id is null
         and activation.authority_generation_id = binding.epoch_id
       )
     )
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.active_epoch_id is distinct from binding.epoch_id
     or gate.admission_deployment_id is distinct from binding.deployment_id
     or rebound.rebound_deployment_id is distinct from binding.deployment_id
     or rebound.deployment_commit is distinct from binding.deployment_commit
     or rebound.epoch_id is distinct from binding.epoch_id
     or rebound.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or rebound.closure_id is distinct from gate.active_closure_id
     or rebound.admission_generation_id is distinct from
       gate.admission_generation_id
     or rebound.activation_revision_after > activation.activation_revision
     or rebound.admission_revision_after > gate.admission_revision
     or epoch.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or epoch.epoch_type <> 'CUTOVER'
     or epoch.status not in ('PREPARED', 'COMMITTED')
     or epoch.authority_before <> 'GOOGLE'
     or epoch.authority_after <> 'SUPABASE'
     or epoch.deployment_commit is distinct from binding.deployment_commit
     or epoch.admission_closure_id is distinct from gate.active_closure_id
     or epoch.admission_generation_id is distinct from
       gate.admission_generation_id
     or binding.capability_fingerprint is distinct from pg_catalog.encode(
       extensions.digest(binding.capability_manifest::text, 'sha256'), 'hex'
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED';
  end if;
  if required_rank >= production_control.cutover_phase_rank('ODDS_WAR_ROOM')
     or production_control.cutover_phase_rank(activation.read_cutover_phase)
       >= production_control.cutover_phase_rank('ODDS_WAR_ROOM')
  then
    select value.* into strict odds_config
    from scoring_authority.odds_input_configurations value
    where value.tournament_id = '2026' and value.is_current;
    if odds_config.validation_status <> 'VALID'
       or pg_catalog.lower(odds_config.source_fingerprint) is distinct from
         binding.capability_manifest->>
           'prediction_settings_source_fingerprint'
       or pg_catalog.lower(odds_config.effective_settings_fingerprint)
         is distinct from binding.capability_manifest->>
           'prediction_settings_effective_fingerprint'
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_MAINTENANCE_PREDICTION_SETTINGS_BINDING_REQUIRED';
    end if;
  end if;
end;
$$;

revoke all on function
  production_control.assert_production_maintenance_runtime_capability(
    jsonb, text
  ) from public, anon, authenticated, service_role;

-- Once a ceiling is bound, scoring authority cannot commit while the database
-- still reports SCORING_PREPARE. This replaces the timing fence formerly
-- supplied by a phase-specific deployment snapshot.
alter function production_control.assert_maintenance_cutover_commit_safe(jsonb)
  rename to assert_maintenance_cutover_commit_safe_pre_capability;

revoke all on function
  production_control.assert_maintenance_cutover_commit_safe_pre_capability(
    jsonb
  ) from public, anon, authenticated, service_role;

create or replace function
  production_control.assert_maintenance_cutover_commit_safe(input jsonb)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  capability
    production_control.maintenance_deployment_capability_bindings%rowtype;
begin
  perform production_control
    .assert_maintenance_cutover_commit_safe_pre_capability(input);
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  select value.* into capability
  from production_control.maintenance_deployment_capability_bindings value
  where value.epoch_id = gate.active_epoch_id
    and value.deployment_id = gate.admission_deployment_id;
  if activation.boundary_mode = 'MAINTENANCE_WINDOW_V1' then
    if not found then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED';
    end if;
    perform production_control.assert_production_maintenance_runtime_capability(
      input, 'SCORING_COMMIT'
    );
    if activation.read_cutover_phase <> 'SCORING_COMMIT'
       or capability.deployment_id is distinct from input->>'deployment_id'
       or capability.deployment_commit is distinct from
         pg_catalog.lower(input->>'deployment_commit')
       or capability.epoch_id is distinct from (input->>'epoch_id')::uuid
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_MAINTENANCE_SCORING_COMMIT_PHASE_REQUIRED';
    end if;
  end if;
end;
$$;

revoke all on function
  production_control.assert_maintenance_cutover_commit_safe(jsonb)
  from public, anon, authenticated, service_role;

-- Active reads use ceiling semantics only after the exact maintenance rebind
-- is present. All earlier maintenance phases and every PROVIDER_FENCE_V2 path
-- retain the prior exact env-phase/database-phase contract.
alter function production_control.assert_production_cutover_read_scope(
  jsonb, text
) rename to assert_production_cutover_read_scope_pre_capability;

revoke all on function
  production_control.assert_production_cutover_read_scope_pre_capability(
    jsonb, text
  ) from public, anon, authenticated, service_role;

create or replace function production_control.assert_production_cutover_read_scope(
  input jsonb,
  required_phase text
) returns production_control.resource_scope
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  required_rank integer := production_control.cutover_phase_rank(required_phase);
  capability_bound boolean := false;
  capability_claimed boolean :=
    pg_catalog.btrim(coalesce(
      input->>'deployment_capability_contract', ''
    )) <> '' or pg_catalog.btrim(coalesce(
      input->>'deployment_capability_ceiling', ''
    )) <> '';
  capability_required boolean := false;
begin
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  capability_bound := exists (
    select 1
    from production_control.maintenance_deployment_capability_bindings value
    where value.epoch_id = gate.active_epoch_id
  );
  capability_required :=
    activation.boundary_mode = 'MAINTENANCE_WINDOW_V1'
    and production_control.cutover_phase_rank(activation.read_cutover_phase)
      >= production_control.cutover_phase_rank('SCORING_COMMIT');
  if not capability_bound and not capability_claimed
     and not capability_required
  then
    return production_control
      .assert_production_cutover_read_scope_pre_capability(
        input, required_phase
      );
  end if;
  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED';
  end if;

  perform production_control.assert_production_maintenance_runtime_capability(
    input, activation.read_cutover_phase
  );
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if required_rank < production_control.cutover_phase_rank('READ_CUTOVER')
     or not resource.public_supabase_reads_enabled
     or production_control.cutover_phase_rank(activation.read_cutover_phase)
       < required_rank
     or pg_catalog.upper(coalesce(input->>'read_contract', '')) <>
       'ACTIVE_CUTOVER'
     or pg_catalog.upper(coalesce(input->>'cutover_phase', '')) <>
       'OBSERVATION'
     or activation.read_source_fingerprint is null
     or activation.read_source_fingerprint is distinct from
       activation.expected_source_fingerprint
     or (required_rank >= production_control.cutover_phase_rank('CURRENT_READS')
       and resource.current_tournament_read_authority <> 'SUPABASE')
  then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CUTOVER_READ_SCOPE_REQUIRED';
  end if;
  return resource;
end;
$$;

revoke all on function
  production_control.assert_production_cutover_read_scope(jsonb, text)
  from public, anon, authenticated, service_role;

-- Keep the existing receipt/idempotency and strict adjacent-rank transition
-- implementation, adding only the maintenance capability milestones that the
-- former sequence of phase-specific deployments supplied externally.
alter function public.set_production_cutover_read_state(jsonb)
  rename to set_production_cutover_read_state_pre_capability;

revoke all on function
  public.set_production_cutover_read_state_pre_capability(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.set_production_cutover_read_state(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  odds_runtime production_control.odds_calculation_runtime%rowtype;
  target_phase text := pg_catalog.upper(coalesce(input->>'target_phase', ''));
  requested_mode text := pg_catalog.upper(coalesce(input->>'mode', ''));
  capability_bound boolean := false;
  capability_claimed boolean :=
    pg_catalog.btrim(coalesce(
      input->>'deployment_capability_contract', ''
    )) <> '' or pg_catalog.btrim(coalesce(
      input->>'deployment_capability_ceiling', ''
    )) <> '';
  capability_required boolean := false;
  prior_activation_revision bigint;
  response_value jsonb;
begin
  existing := production_control.lookup_cutover_receipt(
    'SET_READ_STATE', input
  );
  if existing is not null then
    return existing;
  end if;
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  capability_bound := exists (
    select 1
    from production_control.maintenance_deployment_capability_bindings value
    where value.epoch_id = gate.active_epoch_id
  );
  capability_required :=
    activation.boundary_mode = 'MAINTENANCE_WINDOW_V1'
    and requested_mode = 'ACTIVATE'
    and production_control.cutover_phase_rank(target_phase)
      >= production_control.cutover_phase_rank('SCORING_COMMIT');
  if capability_bound or capability_claimed or capability_required then
    if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1' then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED';
    end if;
    perform production_control.assert_production_maintenance_runtime_capability(
      input, case when requested_mode = 'ACTIVATE'
        then target_phase else activation.read_cutover_phase end
    );
  end if;
  if capability_bound and requested_mode = 'ACTIVATE' then
    prior_activation_revision := activation.activation_revision;
    response_value :=
      public.set_production_cutover_read_state_pre_capability(input);
    select value.* into strict activation
    from production_control.cutover_activation_state value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    select value.* into strict resource
    from production_control.resource_scope value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    select value.* into strict gate
    from scoring_authority.ingress_gates value
    where value.tournament_id = '2026';
    if target_phase = 'SCORING_COMMIT' then
      select value.* into strict epoch
      from scoring_authority.authority_epochs value
      where value.epoch_id = gate.active_epoch_id;
      if activation.read_cutover_phase <> 'SCORING_COMMIT'
         or activation.state <> 'CUTOVER_PREPARED'
         or activation.current_authority <> 'GOOGLE'
         or activation.maintenance_state <> 'SCORING_MAINTENANCE'
         or activation.scoring_ingress_enabled
         or gate.state <> 'PAUSED'
         or epoch.status <> 'PREPARED'
      then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_SCORING_COMMIT_PHASE_PRECONDITION_REQUIRED';
      end if;
    elsif target_phase = 'WORKERS' then
      if activation.read_cutover_phase <> 'WORKERS'
         or activation.state <> 'SCORING_COMMITTED'
         or activation.current_authority <> 'SUPABASE'
         or activation.maintenance_state <> 'NORMAL'
         or not activation.scoring_ingress_enabled
         or resource.scoring_authority <> 'SUPABASE'
         or not resource.scoring_ingress_enabled
         or gate.authority <> 'SUPABASE'
         or gate.state <> 'OPEN'
      then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_WORKERS_PHASE_PRECONDITION_REQUIRED';
      end if;
    elsif target_phase = 'ODDS_WAR_ROOM' then
      if activation.read_cutover_phase <> 'ODDS_WAR_ROOM'
         or not resource.workers_enabled
         or not resource.google_writes_enabled
         or 2 <> (
           select pg_catalog.count(*)
           from production_control.worker_controls controls
           join production_control.worker_contracts contracts
             using (worker_name)
           where controls.worker_name in (
             'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'
           )
             and controls.enabled and controls.google_writes_allowed
             and contracts.operation_allowed
             and contracts.requires_google_write
             and not contracts.authoritative_write_allowed
             and controls.metadata->>'activation_epoch_id' =
               activation.authority_generation_id::text
             and controls.metadata->>'deployment_commit' =
               activation.expected_deployment_commit
         )
      then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_ODDS_WORKER_PRECONDITION_REQUIRED';
      end if;
    elsif target_phase = 'OBSERVATION' then
      select value.* into strict odds_runtime
      from production_control.odds_calculation_runtime value
      where value.scope_key = 'BAGGER_INV_PRODUCTION';
      if activation.read_cutover_phase <> 'OBSERVATION'
         or not odds_runtime.enabled
         or odds_runtime.operation_mode <> 'PRODUCTION_CUTOVER'
         or odds_runtime.cutover_phase <> 'ODDS_WAR_ROOM'
         or odds_runtime.deployment_commit is distinct from
           activation.expected_deployment_commit
         or odds_runtime.activation_revision is distinct from
           prior_activation_revision
      then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_OBSERVATION_ODDS_RUNTIME_REQUIRED';
      end if;
    end if;
    return response_value;
  end if;
  return public.set_production_cutover_read_state_pre_capability(input);
end;
$$;

revoke all on function public.set_production_cutover_read_state(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.set_production_cutover_read_state(jsonb)
  to service_role;

-- Preloaded route flags are never sufficient to enable a worker. The live
-- database phase must have reached WORKERS and the request must prove the exact
-- rebound capability binding. Disabling remains available for rollback/drain.
alter function public.set_production_cutover_worker_state(jsonb)
  rename to set_production_cutover_worker_state_pre_capability;

revoke all on function
  public.set_production_cutover_worker_state_pre_capability(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.set_production_cutover_worker_state(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  requested_enabled boolean := coalesce((input->>'enabled')::boolean, false);
  capability_claimed boolean :=
    pg_catalog.btrim(coalesce(
      input->>'deployment_capability_contract', ''
    )) <> '' or pg_catalog.btrim(coalesce(
      input->>'deployment_capability_ceiling', ''
    )) <> '';
begin
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if capability_claimed
     and activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED';
  end if;
  if activation.boundary_mode = 'MAINTENANCE_WINDOW_V1'
     and requested_enabled
  then
    if production_control.cutover_phase_rank(activation.read_cutover_phase)
         < production_control.cutover_phase_rank('WORKERS')
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_CUTOVER_WORKERS_PHASE_REQUIRED';
    end if;
    perform production_control.assert_production_maintenance_runtime_capability(
      input, 'WORKERS'
    );
  end if;
  return public.set_production_cutover_worker_state_pre_capability(input);
end;
$$;

revoke all on function public.set_production_cutover_worker_state(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.set_production_cutover_worker_state(jsonb)
  to service_role;

-- Worker claims also fail closed at the database phase even if a control row
-- is damaged or a preloaded cron route is invoked early.
alter function production_control.assert_production_scoring_runtime(jsonb, text)
  rename to assert_production_scoring_runtime_pre_capability;

revoke all on function
  production_control.assert_production_scoring_runtime_pre_capability(
    jsonb, text
  ) from public, anon, authenticated, service_role;

create or replace function production_control.assert_production_scoring_runtime(
  input jsonb,
  required_worker text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  capability_bound boolean := false;
  capability_claimed boolean :=
    pg_catalog.btrim(coalesce(
      input->>'deployment_capability_contract', ''
    )) <> '' or pg_catalog.btrim(coalesce(
      input->>'deployment_capability_ceiling', ''
    )) <> '';
  capability_required boolean := false;
  required_database_phase text;
begin
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  capability_bound := exists (
    select 1
    from production_control.maintenance_deployment_capability_bindings value
    where value.epoch_id = gate.active_epoch_id
  );
  capability_required :=
    activation.boundary_mode = 'MAINTENANCE_WINDOW_V1'
    and production_control.cutover_phase_rank(activation.read_cutover_phase)
      >= production_control.cutover_phase_rank('SCORING_COMMIT');
  if capability_bound or capability_claimed or capability_required
  then
    if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1' then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED';
    end if;
    required_database_phase := case
      when pg_catalog.btrim(coalesce(required_worker, '')) <> ''
        then 'WORKERS'
      else 'SCORING_COMMIT'
    end;
    if production_control.cutover_phase_rank(activation.read_cutover_phase)
         < production_control.cutover_phase_rank(required_database_phase)
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_CUTOVER_SCORING_DATABASE_PHASE_REQUIRED';
    end if;
    perform production_control.assert_production_maintenance_runtime_capability(
      input, required_database_phase
    );
  end if;
  perform production_control
    .assert_production_scoring_runtime_pre_capability(input, required_worker);
end;
$$;

revoke all on function
  production_control.assert_production_scoring_runtime(jsonb, text)
  from public, anon, authenticated, service_role;

-- The existing Odds function still enforces ODDS_WAR_ROOM and its exact
-- activation revision. This wrapper adds only the bound-deployment proof for
-- MAINTENANCE_WINDOW_V1 cutover execution.
alter function production_control.assert_production_odds_calculation_scope(
  jsonb, boolean
) rename to assert_production_odds_calculation_scope_pre_capability;

revoke all on function
  production_control.assert_production_odds_calculation_scope_pre_capability(
    jsonb, boolean
  ) from public, anon, authenticated, service_role;

create or replace function
  production_control.assert_production_odds_calculation_scope(
    input jsonb,
    require_enabled boolean default true
  )
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  capability_claimed boolean :=
    pg_catalog.btrim(coalesce(
      input->>'deployment_capability_contract', ''
    )) <> '' or pg_catalog.btrim(coalesce(
      input->>'deployment_capability_ceiling', ''
    )) <> '';
begin
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if capability_claimed
     and activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED';
  end if;
  if activation.boundary_mode = 'MAINTENANCE_WINDOW_V1'
     and pg_catalog.upper(coalesce(input->>'operation_mode', '')) =
       'PRODUCTION_CUTOVER'
  then
    perform production_control.assert_production_maintenance_runtime_capability(
      input, 'ODDS_WAR_ROOM'
    );
  end if;
  perform production_control
    .assert_production_odds_calculation_scope_pre_capability(
      input, require_enabled
    );
end;
$$;

revoke all on function
  production_control.assert_production_odds_calculation_scope(jsonb, boolean)
  from public, anon, authenticated, service_role;

comment on function
  public.rebind_production_maintenance_precommit_deployment(jsonb)
is
  'One-time MAINTENANCE_WINDOW_V1 deployment rebind that binds an exact OBSERVATION capability ceiling while every worker and Odds runtime remains database-disabled; PROVIDER_FENCE_V2 is unchanged.';

comment on function
  production_control.assert_production_maintenance_runtime_capability(
    jsonb, text
  )
is
  'Verifies the exact maintenance rebound deployment, release, epoch, and immutable capability ceiling before a postcommit read, worker, or Odds operation.';

notify pgrst, 'reload schema';
commit;
