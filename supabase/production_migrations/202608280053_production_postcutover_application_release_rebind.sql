-- One exact post-cutover application-only release rebind.
--
-- Installation is inert. The service-role operation below is available only
-- after the MAINTENANCE_WINDOW_V1 cutover has reached its healthy OBSERVATION
-- state. It preserves the committed authority epoch, every authority and
-- worker switch, and all tournament data while replacing only the effective
-- Production application deployment binding from 7baf9b2... to 56ded61....
begin;

create table production_control.postcutover_application_release_rebindings (
  application_rebind_id uuid primary key default extensions.gen_random_uuid(),
  scope_key text not null unique check (scope_key = 'BAGGER_INV_PRODUCTION'),
  boundary_mode text not null check (boundary_mode = 'MAINTENANCE_WINDOW_V1'),
  contract_version text not null check (
    contract_version = 'production-postcutover-application-release-rebind-v1'
  ),
  capability_binding_id uuid not null unique references
    production_control.maintenance_deployment_capability_bindings(
      capability_binding_id
    ) on delete restrict,
  tournament_id text not null check (tournament_id = '2026'),
  epoch_id uuid not null unique references
    scoring_authority.authority_epochs(epoch_id) on delete restrict,
  authority_generation_id uuid not null,
  admission_generation_id uuid not null,
  prior_deployment_id text not null check (
    prior_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  prior_deployment_commit text not null check (
    prior_deployment_commit =
      '7baf9b284d4784d7387f3e4fa876b9d47cd0a177'
  ),
  deployment_id text not null unique check (
    deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  deployment_commit text not null unique check (
    deployment_commit = '56ded61379e3308ab5c465ce186140550f3827a7'
  ),
  deployment_hostname text not null check (
    deployment_hostname ~ '^[a-z0-9-]+\.vercel\.app$'
  ),
  vercel_project_id text not null check (
    vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
  ),
  vercel_team_id text not null check (
    vercel_team_id = 'team_kPw5zaib8uaQJALAwj4fWI6R'
  ),
  capability_contract text not null check (
    capability_contract =
      'production-maintenance-single-deployment-capability-v1'
  ),
  capability_ceiling text not null check (capability_ceiling = 'OBSERVATION'),
  activation_revision_before bigint not null check (
    activation_revision_before >= 0
  ),
  activation_revision_after bigint not null check (
    activation_revision_after = activation_revision_before + 1
  ),
  admission_revision_before bigint not null check (
    admission_revision_before >= 0
  ),
  admission_revision_after bigint not null check (
    admission_revision_after = admission_revision_before + 1
  ),
  runtime_manifest jsonb not null check (
    pg_catalog.jsonb_typeof(runtime_manifest) = 'object'
  ),
  runtime_fingerprint text not null unique check (
    runtime_fingerprint ~ '^[0-9a-f]{64}$'
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
  created_at timestamptz not null default pg_catalog.now(),
  check (prior_deployment_id <> deployment_id)
);

alter table production_control.postcutover_application_release_rebindings
  enable row level security;

revoke all on table
  production_control.postcutover_application_release_rebindings
  from public, anon, authenticated, service_role;

-- Preserve migration 051's exact capability validation for the cutover
-- deployment. Once the one exact application release lineage exists, validate
-- the immutable cutover binding and the new effective runtime binding together.
alter function
  production_control.assert_production_maintenance_runtime_capability(
    jsonb, text
  ) rename to
    assert_production_maintenance_runtime_capability_pre_application_release;

revoke all on function
  production_control
    .assert_production_maintenance_runtime_capability_pre_application_release(
      jsonb, text
    ) from public, anon, authenticated, service_role;

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
  closure production_control.scoring_admission_closures%rowtype;
  release
    production_control.postcutover_application_release_rebindings%rowtype;
  binding production_control.maintenance_deployment_capability_bindings%rowtype;
  rebound production_control.maintenance_runtime_deployment_rebindings%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  odds_config scoring_authority.odds_input_configurations%rowtype;
  required_rank integer := production_control.cutover_phase_rank(required_phase);
begin
  select value.* into release
  from production_control.postcutover_application_release_rebindings value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if not found then
    perform production_control
      .assert_production_maintenance_runtime_capability_pre_application_release(
        input, required_phase
      );
    return;
  end if;

  perform production_control.assert_exact_cutover_resource_scope(input, true);
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  select value.* into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = gate.active_closure_id;
  select value.* into strict binding
  from production_control.maintenance_deployment_capability_bindings value
  where value.capability_binding_id = release.capability_binding_id;
  select value.* into strict rebound
  from production_control.maintenance_runtime_deployment_rebindings value
  where value.rebind_id = binding.rebind_id;
  select value.* into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = release.epoch_id;

  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or activation.current_authority <> 'SUPABASE'
     or activation.maintenance_state <> 'NORMAL'
     or not activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.authority_generation_id is distinct from release.epoch_id
     or activation.expected_deployment_commit is distinct from
       release.deployment_commit
     or activation.activation_revision < release.activation_revision_after
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.authority <> 'SUPABASE'
     or gate.state <> 'OPEN'
     or gate.admission_state <> 'CLOSED'
     or not gate.admission_protocol_enforced
     or gate.active_epoch_id is distinct from release.epoch_id
     or gate.admission_generation_id is distinct from
       release.admission_generation_id
     or gate.admission_deployment_id is distinct from release.deployment_id
     or gate.admission_revision < release.admission_revision_after
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.closure_kind <> 'LEGACY_ADMISSION'
     or closure.authority <> 'GOOGLE'
     or closure.status <> 'CONSUMED'
     or closure.consumed_epoch_id is distinct from release.epoch_id
     or closure.deployment_id is distinct from release.deployment_id
     or input->>'deployment_capability_contract' is distinct from
       release.capability_contract
     or input->>'deployment_capability_ceiling' is distinct from
       release.capability_ceiling
     or input->>'deployment_id' is distinct from release.deployment_id
     or pg_catalog.lower(coalesce(input->>'deployment_commit', ''))
       is distinct from release.deployment_commit
     or required_rank < 0
     or production_control.cutover_phase_rank(release.capability_ceiling)
       < required_rank
     or binding.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or binding.contract_version is distinct from release.capability_contract
     or binding.capability_ceiling is distinct from release.capability_ceiling
     or binding.epoch_id is distinct from release.epoch_id
     or binding.deployment_id is distinct from release.prior_deployment_id
     or binding.deployment_commit is distinct from
       release.prior_deployment_commit
     or binding.capability_fingerprint is distinct from pg_catalog.encode(
       extensions.digest(binding.capability_manifest::text, 'sha256'), 'hex'
     )
     or rebound.rebind_id is distinct from binding.rebind_id
     or rebound.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or rebound.epoch_id is distinct from release.epoch_id
     or rebound.rebound_deployment_id is distinct from
       release.prior_deployment_id
     or rebound.deployment_commit is distinct from
       release.prior_deployment_commit
     or rebound.closure_id is distinct from gate.active_closure_id
     or rebound.admission_generation_id is distinct from
       release.admission_generation_id
     or epoch.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or epoch.epoch_type <> 'CUTOVER'
     or epoch.status <> 'COMMITTED'
     or epoch.authority_before <> 'GOOGLE'
     or epoch.authority_after <> 'SUPABASE'
     or epoch.epoch_id is distinct from release.epoch_id
     or epoch.deployment_commit is distinct from release.deployment_commit
     or epoch.admission_generation_id is distinct from
       release.admission_generation_id
     or release.authority_generation_id is distinct from release.epoch_id
     or release.runtime_fingerprint is distinct from pg_catalog.encode(
       extensions.digest(release.runtime_manifest::text, 'sha256'), 'hex'
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_POSTCUTOVER_APPLICATION_RELEASE_REQUIRED';
  end if;

  if required_rank >= production_control.cutover_phase_rank('ODDS_WAR_ROOM')
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

-- The existing Production route supplies the already-certified v2 runtime
-- attestation. This private operation consumes it only in the exact completed
-- cutover state and for the exact, one-time application release authorized by
-- this migration.
create or replace function
  production_control.rebind_production_postcutover_application_release(
    input jsonb
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing
    production_control.postcutover_application_release_rebindings%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  binding production_control.maintenance_deployment_capability_bindings%rowtype;
  rebound production_control.maintenance_runtime_deployment_rebindings%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  odds_config scoring_authority.odds_input_configurations%rowtype;
  odds_runtime production_control.odds_calculation_runtime%rowtype;
  runtime_observed_at timestamptz;
  runtime_manifest jsonb;
  runtime_fingerprint text;
  next_activation_revision bigint;
  next_admission_revision bigint;
  application_rebind_id uuid := extensions.gen_random_uuid();
  response_value jsonb;
  intent_input jsonb := input - 'runtime_observed_at';
begin
  -- The installed staged-release helper deliberately compares the request SHA
  -- to the prior binding. This operation proves the exact resources without
  -- that comparison, then fixes both the prior and replacement SHAs below. It
  -- also permits a lost-response replay after the replacement is authoritative.
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  perform production_control.assert_no_active_physical_writer_fence();
  if input->>'boundary_mode' is distinct from 'MAINTENANCE_WINDOW_V1'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or input->>'operation' is distinct from
       'REBIND_PRODUCTION_MAINTENANCE_PRECOMMIT_DEPLOYMENT'
     or input->>'runtime_binding_contract' is distinct from
       'production-maintenance-precommit-deployment-rebind-v2'
     or input->>'runtime_deployment_capability_contract' is distinct from
       'production-maintenance-single-deployment-capability-v1'
     or input->>'runtime_deployment_capability_ceiling' is distinct from
       'OBSERVATION'
     or input->>'deployment_commit' is distinct from
       '56ded61379e3308ab5c465ce186140550f3827a7'
     or input->>'runtime_deployment_commit' is distinct from
       '56ded61379e3308ab5c465ce186140550f3827a7'
     or coalesce(input->>'original_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or input->>'deployment_id' = input->>'original_deployment_id'
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
     or coalesce(input->>'runtime_deployment_hostname', '')
       !~ '^[a-z0-9-]+\.vercel\.app$'
     or input->>'runtime_deployment_hostname' in (
       'bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app',
       'bagger-inv.vercel.app'
     )
     or input->>'runtime_cutover_phase' is distinct from 'SCORING_COMMIT'
     or input->>'runtime_scoring_authority' is distinct from 'SUPABASE'
     or input->>'runtime_participant_identity_authority' is distinct from
       'SUPABASE'
     or input->'runtime_activation_enabled' is distinct from 'true'::jsonb
     or input->'runtime_foundation_enabled' is distinct from 'true'::jsonb
     or input->'runtime_public_supabase_reads_enabled' is distinct from
       'true'::jsonb
     or input->'runtime_google_ingress_lease_gate_enabled'
       is distinct from 'true'::jsonb
     or input->'runtime_supabase_scoring_ingress_enabled'
       is distinct from 'true'::jsonb
     or input->'runtime_workers_enabled' is distinct from 'true'::jsonb
     or input->'runtime_google_mirror_enabled' is distinct from 'true'::jsonb
     or input->'runtime_scorecard_archive_enabled' is distinct from
       'true'::jsonb
     or input->'runtime_outbox_worker_secret_configured' is distinct from
       'true'::jsonb
     or input->'runtime_archive_worker_secret_configured' is distinct from
       'true'::jsonb
     or input->'runtime_odds_calculation_enabled' is distinct from 'true'::jsonb
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
     or pg_catalog.lower(coalesce(
       input->>'runtime_expected_authority_epoch', ''
     )) is distinct from pg_catalog.lower(
       input->>'expected_authority_generation'
     )
     or pg_catalog.lower(coalesce(
       input->>'runtime_expected_admission_generation', ''
     )) is distinct from pg_catalog.lower(
       input->>'expected_admission_generation'
     )
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_POSTCUTOVER_APPLICATION_RELEASE_INPUT_INVALID';
  end if;

  select value.* into existing
  from production_control.postcutover_application_release_rebindings value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if found then
    if existing.deployment_id is distinct from input->>'deployment_id'
       or existing.deployment_commit is distinct from input->>'deployment_commit'
       or existing.prior_deployment_id is distinct from
         input->>'original_deployment_id'
       or existing.request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or existing.payload_hash is distinct from
         production_control.cutover_payload_hash(intent_input)
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_POSTCUTOVER_APPLICATION_RELEASE_ALREADY_USED';
    end if;
    return existing.response_value || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select value.* into existing
  from production_control.postcutover_application_release_rebindings value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if found then
    if existing.deployment_id is distinct from input->>'deployment_id'
       or existing.deployment_commit is distinct from input->>'deployment_commit'
       or existing.prior_deployment_id is distinct from
         input->>'original_deployment_id'
       or existing.request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or existing.payload_hash is distinct from
         production_control.cutover_payload_hash(intent_input)
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_POSTCUTOVER_APPLICATION_RELEASE_ALREADY_USED';
    end if;
    return existing.response_value || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;

  runtime_observed_at := (input->>'runtime_observed_at')::timestamptz;
  if runtime_observed_at is null
     or runtime_observed_at > pg_catalog.now()
     or runtime_observed_at < pg_catalog.now() - interval '5 minutes'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_POSTCUTOVER_APPLICATION_RUNTIME_NOT_CURRENT';
  end if;

  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select value.* into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = gate.active_closure_id for update;
  select value.* into strict binding
  from production_control.maintenance_deployment_capability_bindings value
  where value.epoch_id = gate.active_epoch_id for update;
  select value.* into strict rebound
  from production_control.maintenance_runtime_deployment_rebindings value
  where value.rebind_id = binding.rebind_id for update;
  select value.* into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = gate.active_epoch_id for update;
  select value.* into strict odds_config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = '2026' and value.is_current for update;
  select value.* into strict odds_runtime
  from production_control.odds_calculation_runtime value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  perform value.worker_name
  from production_control.worker_controls value
  where value.worker_name in (
    'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE', 'ODDS_CALCULATION'
  )
  order by value.worker_name for update;

  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or activation.current_authority <> 'SUPABASE'
     or activation.maintenance_state <> 'NORMAL'
     or not activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.expected_deployment_commit is distinct from
       '7baf9b284d4784d7387f3e4fa876b9d47cd0a177'
     or activation.expected_vercel_project_id is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or activation.authority_generation_id is distinct from epoch.epoch_id
     or activation.staged_environment_delta_fingerprint_v2 is distinct from
       pg_catalog.lower(input->>'staged_environment_delta_fingerprint_v2')
     or resource.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or resource.google_workbook_id <>
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or resource.current_tournament_id <> '2026'
     or resource.current_tournament_read_authority <> 'SUPABASE'
     or resource.scoring_authority <> 'SUPABASE'
     or resource.participant_identity_authority <> 'SUPABASE'
     or not resource.public_supabase_reads_enabled
     or not resource.scoring_ingress_enabled
     or not resource.workers_enabled
     or not resource.google_writes_enabled
     or resource.odds_publication_enabled
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.authority <> 'SUPABASE'
     or gate.state <> 'OPEN'
     or gate.admission_state <> 'CLOSED'
     or not gate.admission_protocol_enforced
     or gate.active_epoch_id is distinct from epoch.epoch_id
     or epoch.epoch_id is distinct from (input->>'epoch_id')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from
       input->>'original_deployment_id'
     or gate.active_closure_id is distinct from closure.closure_id
     or closure.closure_id is distinct from (input->>'closure_id')::uuid
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.closure_kind <> 'LEGACY_ADMISSION'
     or closure.authority <> 'GOOGLE'
     or closure.status <> 'CONSUMED'
     or closure.consumed_epoch_id is distinct from epoch.epoch_id
     or closure.deployment_id is distinct from input->>'original_deployment_id'
     or epoch.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or epoch.epoch_type <> 'CUTOVER'
     or epoch.status <> 'COMMITTED'
     or epoch.authority_before <> 'GOOGLE'
     or epoch.authority_after <> 'SUPABASE'
     or epoch.deployment_commit is distinct from
       '7baf9b284d4784d7387f3e4fa876b9d47cd0a177'
     or epoch.admission_closure_id is distinct from closure.closure_id
     or epoch.admission_generation_id is distinct from
       gate.admission_generation_id
     or binding.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or binding.contract_version <>
       'production-maintenance-single-deployment-capability-v1'
     or binding.capability_ceiling <> 'OBSERVATION'
     or binding.epoch_id is distinct from epoch.epoch_id
     or binding.deployment_id is distinct from input->>'original_deployment_id'
     or binding.deployment_commit is distinct from
       '7baf9b284d4784d7387f3e4fa876b9d47cd0a177'
     or binding.capability_fingerprint is distinct from pg_catalog.encode(
       extensions.digest(binding.capability_manifest::text, 'sha256'), 'hex'
     )
     or rebound.rebind_id is distinct from binding.rebind_id
     or rebound.epoch_id is distinct from epoch.epoch_id
     or rebound.rebound_deployment_id is distinct from
       input->>'original_deployment_id'
     or rebound.deployment_commit is distinct from
       '7baf9b284d4784d7387f3e4fa876b9d47cd0a177'
     or rebound.admission_generation_id is distinct from
       gate.admission_generation_id
     or odds_config.validation_status <> 'VALID'
     or pg_catalog.lower(odds_config.source_fingerprint) is distinct from
       pg_catalog.lower(
         input->>'runtime_prediction_settings_source_fingerprint'
       )
     or pg_catalog.lower(odds_config.effective_settings_fingerprint)
       is distinct from pg_catalog.lower(
         input->>'runtime_prediction_settings_effective_fingerprint'
       )
     or odds_config.source_fingerprint is distinct from
       binding.capability_manifest->>'prediction_settings_source_fingerprint'
     or odds_config.effective_settings_fingerprint is distinct from
       binding.capability_manifest->>
         'prediction_settings_effective_fingerprint'
     or not odds_runtime.enabled
     or odds_runtime.operation_mode <> 'PRODUCTION_CUTOVER'
     or odds_runtime.cutover_phase <> 'ODDS_WAR_ROOM'
     or odds_runtime.deployment_commit is distinct from
       '7baf9b284d4784d7387f3e4fa876b9d47cd0a177'
     or odds_runtime.activation_revision is distinct from
       activation.activation_revision
     or 3 <> (
       select pg_catalog.count(*)
       from production_control.worker_controls controls
       join production_control.worker_contracts contracts
         using (worker_name)
       where controls.worker_name in (
         'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE',
         'ODDS_CALCULATION'
       )
         and controls.enabled
         and not controls.scheduler_installed
         and contracts.operation_allowed
         and not contracts.scheduler_installed
         and not contracts.authoritative_write_allowed
         and (
           (controls.worker_name = 'ODDS_CALCULATION'
             and not controls.google_writes_allowed)
           or (controls.worker_name <> 'ODDS_CALCULATION'
             and controls.google_writes_allowed
             and contracts.requires_google_write)
         )
         and controls.metadata->>'deployment_commit' =
           '7baf9b284d4784d7387f3e4fa876b9d47cd0a177'
         and (
           controls.worker_name = 'ODDS_CALCULATION'
           or controls.metadata->>'activation_epoch_id' = epoch.epoch_id::text
         )
     )
     or exists (
       select 1
       from production_control.worker_controls controls
       where controls.worker_name not in (
         'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE',
         'ODDS_CALCULATION'
       )
         and (
           controls.enabled or controls.scheduler_installed
           or controls.google_writes_allowed
         )
     )
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or exists (
       select 1 from scoring_authority.authority_epochs value
       where value.tournament_id = '2026' and value.status = 'PREPARED'
     )
     or exists (
       select 1 from production_control.scoring_admission_closures value
       where value.tournament_id = '2026'
         and value.closure_kind = 'SUPABASE_INGRESS'
         and value.status in ('CLOSING', 'CLOSED')
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_POSTCUTOVER_APPLICATION_RELEASE_NOT_SAFE';
  end if;

  runtime_manifest := pg_catalog.jsonb_build_object(
    'domain', 'BAGGER_POSTCUTOVER_APPLICATION_RELEASE_REBIND_V1',
    'contract_version',
      'production-postcutover-application-release-rebind-v1',
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'prior_release_sha',
      '7baf9b284d4784d7387f3e4fa876b9d47cd0a177',
    'release_sha', '56ded61379e3308ab5c465ce186140550f3827a7',
    'prior_deployment_id', input->>'original_deployment_id',
    'deployment_id', input->>'deployment_id',
    'deployment_hostname', input->>'runtime_deployment_hostname',
    'deployment_status', 'READY',
    'readiness_evidence', 'LIVE_CANONICAL_PRODUCTION_ROUTE',
    'deployment_target', 'PRODUCTION',
    'runtime_environment', 'production',
    'vercel_project', 'bagger-inv',
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
    'supabase_project_ref', 'ymqhhtxaywtqllynrmxe',
    'google_workbook_id',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
    'tournament_id', '2026',
    'authority_epoch', epoch.epoch_id,
    'authority_generation', activation.authority_generation_id,
    'admission_generation', gate.admission_generation_id,
    'activation_revision_before', activation.activation_revision,
    'admission_revision_before', gate.admission_revision,
    'database_phase', 'OBSERVATION',
    'scoring_authority', 'SUPABASE',
    'participant_identity_authority', 'SUPABASE',
    'current_tournament_read_authority', 'SUPABASE',
    'maintenance_state', 'NORMAL',
    'scoring_ingress_enabled', true,
    'workers_enabled', true,
    'google_writes_enabled', true,
    'capability_contract', binding.contract_version,
    'capability_ceiling', binding.capability_ceiling,
    'outbox_worker_secret_configured', true,
    'archive_worker_secret_configured', true,
    'odds_calculation_enabled', true,
    'war_room_input_source', 'SUPABASE',
    'prediction_settings_read_source', 'SUPABASE',
    'odds_calculation_input_source', 'SUPABASE',
    'prediction_settings_source_fingerprint',
      pg_catalog.lower(odds_config.source_fingerprint),
    'prediction_settings_effective_fingerprint',
      pg_catalog.lower(odds_config.effective_settings_fingerprint),
    'odds_publication_authority', 'GOOGLE',
    'supabase_odds_publication_enabled', false,
    'supabase_odds_google_mirror_enabled', false,
    'pending_rollback_or_reconciliation', false
  );
  runtime_fingerprint := pg_catalog.encode(
    extensions.digest(runtime_manifest::text, 'sha256'), 'hex'
  );
  next_activation_revision := activation.activation_revision + 1;
  next_admission_revision := gate.admission_revision + 1;

  update production_control.cutover_activation_state
  set expected_deployment_commit =
        '56ded61379e3308ab5c465ce186140550f3827a7',
      activation_revision = next_activation_revision,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION';
  update scoring_authority.ingress_gates
  set admission_deployment_id = input->>'deployment_id',
      admission_revision = next_admission_revision,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026';
  update production_control.scoring_admission_closures
  set deployment_id = input->>'deployment_id',
      closed_admission_revision = next_admission_revision
  where closure_id = closure.closure_id;
  update scoring_authority.authority_epochs
  set deployment_commit =
        '56ded61379e3308ab5c465ce186140550f3827a7',
      closed_admission_revision = next_admission_revision
  where epoch_id = epoch.epoch_id;
  update production_control.worker_controls
  set last_verified_at = runtime_observed_at,
      metadata = metadata || pg_catalog.jsonb_build_object(
        'deployment_commit',
          '56ded61379e3308ab5c465ce186140550f3827a7',
        'deployment_id', input->>'deployment_id',
        'runtime_revision', case
          when worker_name = 'ODDS_CALCULATION'
            then pg_catalog.to_jsonb(odds_runtime.runtime_revision + 1)
          else metadata->'runtime_revision'
        end,
        'postcutover_application_rebind_id', application_rebind_id,
        'postcutover_application_rebound_at', pg_catalog.now()
      )
  where worker_name in (
    'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE', 'ODDS_CALCULATION'
  );
  update production_control.odds_calculation_runtime
  set deployment_commit =
        '56ded61379e3308ab5c465ce186140550f3827a7',
      activation_revision = next_activation_revision,
      runtime_revision = runtime_revision + 1,
      last_transition_request_fingerprint =
        pg_catalog.lower(input->>'request_fingerprint'),
      configured_by = pg_catalog.left(input->>'actor_id', 160),
      configured_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION';

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_POSTCUTOVER_APPLICATION_RELEASE_REBOUND',
    'application_rebind_id', application_rebind_id,
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'deployment_commit',
      '56ded61379e3308ab5c465ce186140550f3827a7',
    'original_deployment_id', input->>'original_deployment_id',
    'deployment_id', input->>'deployment_id',
    'activation_revision', next_activation_revision,
    'admission_revision', next_admission_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'capability_contract', binding.contract_version,
    'capability_ceiling', binding.capability_ceiling,
    'runtime_fingerprint', runtime_fingerprint,
    'cutover_phase', 'OBSERVATION',
    'authority', 'SUPABASE',
    'participant_identity_authority', 'SUPABASE',
    'maintenance_state', 'NORMAL',
    'ingress', 'OPEN',
    'workers_enabled', true,
    'idempotent', false
  );

  insert into production_control.postcutover_application_release_rebindings (
    application_rebind_id, scope_key, boundary_mode, contract_version,
    capability_binding_id, tournament_id, epoch_id,
    authority_generation_id, admission_generation_id,
    prior_deployment_id, prior_deployment_commit,
    deployment_id, deployment_commit, deployment_hostname,
    vercel_project_id, vercel_team_id,
    capability_contract, capability_ceiling,
    activation_revision_before, activation_revision_after,
    admission_revision_before, admission_revision_after,
    runtime_manifest, runtime_fingerprint, runtime_observed_at,
    request_fingerprint, payload_hash, actor_id, response_value
  ) values (
    application_rebind_id, 'BAGGER_INV_PRODUCTION',
    'MAINTENANCE_WINDOW_V1',
    'production-postcutover-application-release-rebind-v1',
    binding.capability_binding_id, '2026', epoch.epoch_id,
    activation.authority_generation_id, gate.admission_generation_id,
    input->>'original_deployment_id',
    '7baf9b284d4784d7387f3e4fa876b9d47cd0a177',
    input->>'deployment_id',
    '56ded61379e3308ab5c465ce186140550f3827a7',
    input->>'runtime_deployment_hostname',
    'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'team_kPw5zaib8uaQJALAwj4fWI6R',
    binding.contract_version, binding.capability_ceiling,
    activation.activation_revision, next_activation_revision,
    gate.admission_revision, next_admission_revision,
    runtime_manifest, runtime_fingerprint, runtime_observed_at,
    pg_catalog.lower(input->>'request_fingerprint'),
    production_control.cutover_payload_hash(intent_input),
    pg_catalog.left(input->>'actor_id', 160), response_value
  );

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'POSTCUTOVER_APPLICATION_RELEASE_REBOUND',
    pg_catalog.left(input->>'actor_id', 160),
    response_value - 'ok' - 'idempotent'
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_POSTCUTOVER_APPLICATION_RELEASE_REBOUND',
    'APPLICATION_RELEASE', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    response_value - 'ok' - 'idempotent'
  );
  perform production_control.store_cutover_receipt(
    'REBIND_POSTCUTOVER_APPLICATION_RELEASE', intent_input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  production_control.rebind_production_postcutover_application_release(jsonb)
  from public, anon, authenticated, service_role;

-- Serialize the effective deployment check with the atomic rebind. The prior
-- wrappers perform all established authority/worker/Odds checks unchanged;
-- taking the shared admission lock first prevents an old deployment from
-- passing its identity check and starting work across the rebind transaction.
alter function production_control.assert_production_scoring_runtime(jsonb, text)
  rename to assert_production_scoring_runtime_pre_application_release;

revoke all on function
  production_control.assert_production_scoring_runtime_pre_application_release(
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
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  perform production_control
    .assert_production_scoring_runtime_pre_application_release(
      input, required_worker
    );
end;
$$;

revoke all on function
  production_control.assert_production_scoring_runtime(jsonb, text)
  from public, anon, authenticated, service_role;

alter function production_control.assert_production_odds_calculation_scope(
  jsonb, boolean
) rename to assert_production_odds_calculation_scope_pre_application_release;

revoke all on function
  production_control
    .assert_production_odds_calculation_scope_pre_application_release(
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
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  perform production_control
    .assert_production_odds_calculation_scope_pre_application_release(
      input, require_enabled
    );
end;
$$;

revoke all on function
  production_control.assert_production_odds_calculation_scope(jsonb, boolean)
  from public, anon, authenticated, service_role;

-- Keep the already-shipped route/RPC name. Before completion it remains the
-- migration-051 precommit operation. At the exact committed OBSERVATION state
-- it becomes only the one-time, exact-SHA application release rebind above.
alter function
  public.rebind_production_maintenance_precommit_deployment(jsonb)
  rename to rebind_production_maintenance_precommit_deployment_pre_application_release;

revoke all on function
  public
    .rebind_production_maintenance_precommit_deployment_pre_application_release(
      jsonb
    ) from public, anon, authenticated, service_role;

create or replace function
  public.rebind_production_maintenance_precommit_deployment(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
begin
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if activation.boundary_mode = 'MAINTENANCE_WINDOW_V1'
     and activation.state = 'SCORING_COMMITTED'
     and activation.current_authority = 'SUPABASE'
     and activation.read_cutover_phase = 'OBSERVATION'
  then
    return production_control
      .rebind_production_postcutover_application_release(input);
  end if;
  return public
    .rebind_production_maintenance_precommit_deployment_pre_application_release(
      input
    );
end;
$$;

revoke all on function
  public.rebind_production_maintenance_precommit_deployment(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.rebind_production_maintenance_precommit_deployment(jsonb)
  to service_role;

comment on function
  public.rebind_production_maintenance_precommit_deployment(jsonb)
is
  'Preserves the exact migration-051 precommit rebind before scoring commit; at completed MAINTENANCE_WINDOW_V1 OBSERVATION it permits only the one exact, runtime-attested 7baf9b2-to-56ded61 application release rebind.';

comment on table
  production_control.postcutover_application_release_rebindings
is
  'Immutable one-time lineage for the exact post-cutover application-only Production deployment replacement; authority, phase, generation, worker enablement, and tournament data are unchanged.';

notify pgrst, 'reload schema';
commit;
