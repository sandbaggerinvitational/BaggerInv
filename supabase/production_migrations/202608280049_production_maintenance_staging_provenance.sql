-- Bind MAINTENANCE_WINDOW_V1 staging to a deterministic, exact-release
-- provenance contract that is independent of the PROVIDER_FENCE_V2 rehearsal
-- evidence.  The provider branch and its ACL/WAF requirements are unchanged.
-- Applying this migration is inert: it does not stage a release or mutate any
-- authority, admission, worker, identity, ingress, or tournament state.
begin;

create or replace function
  production_control.production_maintenance_stage_provenance_v1(
    input jsonb
  )
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  exact_release constant text :=
    '6911c63cee6f6fe40c03a95bf7a7ba824be0d1fb';
  provenance_contract constant text :=
    'production-maintenance-staging-provenance-v1';
  environment_contract constant text :=
    'production-maintenance-environment-delta-v2';
  semantic_contract constant text :=
    'production-current-shadow-semantic-parity-v1';
  stable_candidate_hostname constant text :=
    'bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app';
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  selected_configuration jsonb := input->'selected_release_configuration';
  expected_configuration jsonb;
  parity jsonb;
  environment_manifest jsonb;
  certification_manifest jsonb;
  environment_fingerprint text;
  certification_fingerprint text;
  worker_count bigint;
  worker_contract_count bigint;
  unresolved_lease_count bigint;
  authority_epoch_count bigint;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  perform production_control.assert_no_active_physical_writer_fence();

  if input->>'boundary_mode' is distinct from 'MAINTENANCE_WINDOW_V1'
     or input->>'contract_version' is distinct from
       'production-cutover-activation-v1'
     or input->>'maintenance_provenance_contract' is distinct from
       provenance_contract
     or input->>'vercel_environment' is distinct from 'production'
     or input->>'vercel_project' is distinct from 'bagger-inv'
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or input->>'tournament_year' is distinct from '2026'
     or pg_catalog.lower(coalesce(input->>'deployment_commit', '')) <>
       exact_release
     or pg_catalog.lower(coalesce(input->>'candidate_commit_sha', '')) <>
       exact_release
     or input->>'candidate_deployment_target' is distinct from 'PREVIEW'
     or input->>'candidate_runtime_environment' is distinct from 'preview'
     or input->>'candidate_hostname' is distinct from
       stable_candidate_hostname
     or input->>'preview_isolation_contract' is distinct from
       'production-shadow-candidate-v1'
     or input->'preview_isolation_allowed' is distinct from 'true'::jsonb
     or input->'preview_commit_approved' is distinct from 'true'::jsonb
     or input->'preview_no_authoritative_features' is distinct from
       'true'::jsonb
     or input->>'semantic_parity_contract' is distinct from semantic_contract
     or pg_catalog.lower(coalesce(input->>'source_fingerprint', ''))
       !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_RELEASE_CONFIGURATION_INVALID';
  end if;

  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  select pg_catalog.count(*) into worker_count
  from production_control.worker_controls worker
  where worker.enabled
     or worker.scheduler_installed
     or worker.google_writes_allowed;
  select pg_catalog.count(*) into worker_contract_count
  from production_control.worker_contracts contract
  where contract.operation_allowed
     or contract.scheduler_installed
     or contract.authoritative_write_allowed;
  select pg_catalog.count(*) into unresolved_lease_count
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and (
      lease.status = 'ACTIVE'
      or lease.resolution_state in (
        'LEGACY_UNCLASSIFIED', 'ADMITTED', 'WRITE_STARTED',
        'AMBIGUOUS', 'PARTIAL_WRITE'
      )
    );
  select pg_catalog.count(*) into authority_epoch_count
  from scoring_authority.authority_epochs epoch
  where epoch.tournament_id = '2026'
    and epoch.status in ('PREPARED', 'COMMITTED');

  if activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
  then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_MAINTENANCE_PROVENANCE_TOKEN_CONFLICT';
  end if;

  if activation.state <> 'DORMANT'
     or activation.current_authority <> 'GOOGLE'
     or activation.read_cutover_phase <> 'STATIC_BACKEND'
     or activation.maintenance_state <> 'NORMAL'
     or activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.active_google_writer_provider_fence_id is not null
     or activation.active_google_writer_provider_verification_id is not null
     or activation.active_vercel_quiesce_evidence_id is not null
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.first_supabase_mutation_key is not null
     or activation.first_supabase_match_id is not null
     or activation.first_supabase_match_revision is not null
     or resource.current_tournament_read_authority <> 'GOOGLE'
     or resource.scoring_authority <> 'GOOGLE'
     or resource.participant_identity_authority <> 'PASSPORT'
     or resource.public_supabase_reads_enabled
     or resource.scoring_ingress_enabled
     or resource.google_writes_enabled
     or resource.auth_user_creation_enabled
     or resource.odds_publication_enabled
     or resource.workers_enabled
     or gate.state <> 'PAUSED'
     or gate.authority <> 'GOOGLE'
     or gate.admission_state <> 'OPEN'
     or gate.unresolved_client_queues <> 0
     or gate.active_epoch_id is not null
     or gate.active_closure_id is not null
     or gate.external_fence_evidence_id is not null
     or gate.google_writer_provider_fence_id is not null
     or gate.google_writer_provider_verification_id is not null
     or worker_count <> 0
     or worker_contract_count <> 0
     or unresolved_lease_count <> 0
     or authority_epoch_count <> 0
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_PROVENANCE_DORMANT_STATE_REQUIRED';
  end if;

  expected_configuration := pg_catalog.jsonb_build_object(
    'contract_version', environment_contract,
    'release_sha', exact_release,
    'candidate_deployment_id', input->>'deployment_id',
    'candidate_deployment_target', 'PREVIEW',
    'candidate_runtime_environment', 'preview',
    'candidate_hostname', stable_candidate_hostname,
    'preview_isolation_contract', 'production-shadow-candidate-v1',
    'preview_isolation_allowed', true,
    'preview_commit_approved', true,
    'preview_no_authoritative_features', true,
    'production_deployment_target', 'PRODUCTION',
    'vercel_environment', 'production',
    'vercel_project', 'bagger-inv',
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'canonical_domain', 'https://baggerinv.com',
    'supabase_project_ref', 'ymqhhtxaywtqllynrmxe',
    'supabase_project_url', 'https://ymqhhtxaywtqllynrmxe.supabase.co',
    'google_workbook_id',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
    'tournament_id', '2026',
    'tournament_year', 2026,
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'read_cutover_phase', 'STATIC_BACKEND',
    'current_tournament_read_authority', 'GOOGLE',
    'scoring_authority', 'GOOGLE',
    'participant_identity_authority', 'PASSPORT',
    'maintenance_state', 'NORMAL',
    'legacy_admission', 'OPEN',
    'scoring_ingress_enabled', false,
    'workers_enabled', false,
    'first_supabase_write_possible', false,
    'first_supabase_write_observed', false,
    'maintenance_window_contract', 'production-maintenance-window-v1',
    'maintenance_window_migration',
      '202608270044_production_maintenance_window_cutover.sql',
    'semantic_parity_contract', semantic_contract,
    'semantic_parity_migration',
      '202608270048_production_current_shadow_semantic_fingerprint.sql',
    'staging_provenance_contract', provenance_contract,
    'staging_provenance_migration',
      '202608280049_production_maintenance_staging_provenance.sql'
  );
  if pg_catalog.jsonb_typeof(selected_configuration) is distinct from 'object'
     or selected_configuration is distinct from expected_configuration
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_SELECTED_CONFIGURATION_INVALID';
  end if;

  parity := public.read_production_current_tournament_shadow(
    pg_catalog.jsonb_build_object(
      'environment', 'PRODUCTION',
      'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.google_workbook_id,
      'tournament_id', resource.current_tournament_id,
      'tournament_year', resource.current_tournament_year,
      'mode', 'DIAGNOSTICS',
      'semantic_parity_contract', semantic_contract,
      'semantic_payload_fingerprint',
        input->>'semantic_payload_fingerprint',
      'semantic_payload_canonical_json',
        input->>'semantic_payload_canonical_json'
    )
  );
  if parity->'ok' is distinct from 'true'::jsonb
     or parity->'semantic_parity' is distinct from 'true'::jsonb
     or parity->'semantic_payload_parity' is distinct from 'true'::jsonb
     or parity->'semantic_database_parity' is distinct from 'true'::jsonb
     or parity->'google_supabase_difference_sections'
       is distinct from '[]'::jsonb
     or parity->'semantic_difference_sections' is distinct from '[]'::jsonb
     or (parity->>'source_fingerprint') is distinct from
       pg_catalog.lower(input->>'source_fingerprint')
     or coalesce((parity->>'outbox_count')::bigint, -1) <> 0
     or coalesce((parity->>'worker_controls_enabled')::bigint, -1) <> 0
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_SEMANTIC_PARITY_REQUIRED';
  end if;

  environment_manifest := pg_catalog.jsonb_build_object(
    'domain', 'BAGGER_STEP12_MAINTENANCE_ENVIRONMENT_DELTA_V2',
    'contract_version', environment_contract,
    'selected_release_configuration', expected_configuration,
    'activation_binding', pg_catalog.jsonb_build_object(
      'state', activation.state,
      'activation_revision', activation.activation_revision,
      'authority_generation_id', activation.authority_generation_id,
      'prior_boundary_mode', activation.boundary_mode
    ),
    'admission_binding', pg_catalog.jsonb_build_object(
      'state', gate.admission_state,
      'revision', gate.admission_revision,
      'generation_id', gate.admission_generation_id,
      'execution_gate', gate.state,
      'prior_boundary_mode', gate.boundary_mode
    ),
    'authoritative_state', pg_catalog.jsonb_build_object(
      'scoring_authority', resource.scoring_authority,
      'participant_identity_authority',
        resource.participant_identity_authority,
      'current_tournament_read_authority',
        resource.current_tournament_read_authority,
      'read_cutover_phase', activation.read_cutover_phase,
      'maintenance_state', activation.maintenance_state,
      'scoring_ingress_enabled', false,
      'workers_enabled', false,
      'first_supabase_write_possible', false,
      'first_supabase_write_observed', false
    )
  );
  environment_fingerprint := pg_catalog.encode(
    extensions.digest(environment_manifest::text, 'sha256'), 'hex'
  );

  certification_manifest := pg_catalog.jsonb_build_object(
    'domain', 'BAGGER_MAINTENANCE_WINDOW_RELEASE_CERTIFICATION_V1',
    'contract_version', provenance_contract,
    'release_sha', exact_release,
    'environment_delta_fingerprint_v2', environment_fingerprint,
    'semantic_parity', pg_catalog.jsonb_build_object(
      'contract_version', semantic_contract,
      'source_fingerprint', parity->>'source_fingerprint',
      'semantic_payload_fingerprint',
        parity->>'provided_semantic_payload_fingerprint',
      'expected_semantic_payload_fingerprint',
        parity->>'expected_semantic_payload_fingerprint',
      'semantic_database_fingerprint',
        parity->>'semantic_actual_database_fingerprint',
      'expected_semantic_database_fingerprint',
        parity->>'semantic_expected_database_fingerprint',
      'semantic_payload_parity', true,
      'semantic_database_parity', true,
      'semantic_parity', true,
      'google_supabase_difference_sections', '[]'::jsonb,
      'semantic_difference_sections', '[]'::jsonb,
      'unexplained_semantic_difference_count', 0
    ),
    'resource_binding', pg_catalog.jsonb_build_object(
      'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.google_workbook_id,
      'vercel_project', resource.vercel_project,
      'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
      'vercel_environment', 'production',
      'canonical_domain', resource.canonical_domain,
      'tournament_id', resource.current_tournament_id,
      'tournament_year', resource.current_tournament_year
    ),
    'installed_contracts', pg_catalog.jsonb_build_object(
      'maintenance_window_contract', 'production-maintenance-window-v1',
      'maintenance_window_migration',
        '202608270044_production_maintenance_window_cutover.sql',
      'semantic_parity_contract', semantic_contract,
      'semantic_parity_migration',
        '202608270048_production_current_shadow_semantic_fingerprint.sql',
      'maintenance_staging_provenance_contract', provenance_contract,
      'maintenance_staging_provenance_migration',
        '202608280049_production_maintenance_staging_provenance.sql'
    ),
    'activation_binding', environment_manifest->'activation_binding',
    'activation_revision_after', activation.activation_revision + 1,
    'admission_binding', environment_manifest->'admission_binding',
    'authoritative_state', environment_manifest->'authoritative_state',
    'production_preview_isolation', true
  );
  certification_fingerprint := pg_catalog.encode(
    extensions.digest(certification_manifest::text, 'sha256'), 'hex'
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_MAINTENANCE_STAGE_PROVENANCE_READY',
    'eligible', true,
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'deployment_commit', exact_release,
    'maintenance_provenance_contract', provenance_contract,
    'environment_delta_contract', environment_contract,
    'environment_delta_manifest', environment_manifest,
    'environment_delta_fingerprint_v2', environment_fingerprint,
    'certification_manifest', certification_manifest,
    'certification_fingerprint', certification_fingerprint,
    'semantic_parity_contract', semantic_contract,
    'semantic_parity', true,
    'semantic_payload_fingerprint',
      parity->>'provided_semantic_payload_fingerprint',
    'semantic_database_fingerprint',
      parity->>'semantic_actual_database_fingerprint',
    'unexplained_semantic_difference_count', 0,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_revision', gate.admission_revision,
    'admission_generation_id', gate.admission_generation_id,
    'first_supabase_canonical_write_possible', false,
    'first_supabase_canonical_write_observed', false
  );
end;
$$;

revoke all on function
  production_control.production_maintenance_stage_provenance_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function
  public.inspect_production_maintenance_stage_provenance(input jsonb)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select production_control.production_maintenance_stage_provenance_v1(input)
$$;

revoke all on function
  public.inspect_production_maintenance_stage_provenance(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.inspect_production_maintenance_stage_provenance(jsonb)
  to service_role;

create or replace function
  production_control.stage_production_maintenance_release(input jsonb)
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
  existing jsonb;
  provenance jsonb;
  response_value jsonb;
  stage_request_fingerprint text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  stage_payload_hash text := production_control.cutover_payload_hash(input);
  certification_fingerprint text := pg_catalog.lower(
    coalesce(input->>'certification_fingerprint', '')
  );
  environment_fingerprint text := pg_catalog.lower(
    coalesce(input->>'environment_delta_fingerprint_v2', '')
  );
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  perform production_control.assert_no_active_physical_writer_fence();
  if input->>'boundary_mode' is distinct from 'MAINTENANCE_WINDOW_V1'
     or certification_fingerprint !~ '^[0-9a-f]{64}$'
     or environment_fingerprint !~ '^[0-9a-f]{64}$'
     or nullif(input->>'provider_fence_id', '') is not null
     or nullif(input->>'provider_fence_verification_id', '') is not null
     or nullif(input->>'quiesce_evidence_id', '') is not null
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_STAGE_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;

  if activation.state = 'STAGED' then
    if activation.boundary_mode is distinct from 'MAINTENANCE_WINDOW_V1'
       or activation.activation_revision is distinct from
         (input->>'expected_activation_revision')::bigint + 1
       or activation.authority_generation_id is distinct from
         (input->>'expected_authority_generation')::uuid
       or activation.current_authority <> 'GOOGLE'
       or activation.read_cutover_phase <> 'STATIC_BACKEND'
       or activation.maintenance_state <> 'NORMAL'
       or activation.scoring_ingress_enabled
       or activation.active_transition_epoch_id is not null
       or activation.active_google_writer_provider_fence_id is not null
       or activation.active_google_writer_provider_verification_id is not null
       or activation.active_vercel_quiesce_evidence_id is not null
       or activation.first_supabase_write_possible_at is not null
       or activation.first_supabase_write_observed_at is not null
       or activation.first_supabase_mutation_key is not null
       or activation.first_supabase_match_id is not null
       or activation.first_supabase_match_revision is not null
       or resource.current_tournament_read_authority <> 'GOOGLE'
       or resource.scoring_authority <> 'GOOGLE'
       or resource.participant_identity_authority <> 'PASSPORT'
       or resource.public_supabase_reads_enabled
       or resource.scoring_ingress_enabled
       or resource.google_writes_enabled
       or resource.auth_user_creation_enabled
       or resource.odds_publication_enabled
       or resource.workers_enabled
       or gate.state <> 'PAUSED'
       or gate.authority <> 'GOOGLE'
       or gate.admission_state <> 'OPEN'
       or gate.admission_revision is distinct from
         (input->>'expected_admission_revision')::bigint
       or gate.admission_generation_id is distinct from
         (input->>'expected_admission_generation')::uuid
       or gate.unresolved_client_queues <> 0
       or gate.active_epoch_id is not null
       or gate.active_closure_id is not null
       or gate.external_fence_evidence_id is not null
       or gate.google_writer_provider_fence_id is not null
       or gate.google_writer_provider_verification_id is not null
       or exists (
         select 1 from scoring_authority.scoring_ingress_leases lease
         where lease.tournament_id = '2026'
           and (
             lease.status = 'ACTIVE'
             or lease.resolution_state in (
               'LEGACY_UNCLASSIFIED', 'ADMITTED', 'WRITE_STARTED',
               'AMBIGUOUS', 'PARTIAL_WRITE'
             )
           )
       )
       or exists (
         select 1 from scoring_authority.authority_epochs epoch
         where epoch.tournament_id = '2026'
           and epoch.status in ('PREPARED', 'COMMITTED')
       )
       or exists (
         select 1 from scoring_authority.google_outbox_events event
         where event.tournament_id = '2026'
       )
       or exists (
         select 1 from production_control.worker_controls worker
         where worker.enabled
            or worker.scheduler_installed
            or worker.google_writes_allowed
       )
       or exists (
         select 1 from production_control.worker_contracts contract
         where contract.operation_allowed
            or contract.scheduler_installed
            or contract.authoritative_write_allowed
       )
       or activation.staged_request_fingerprint is distinct from
         stage_request_fingerprint
       or activation.staged_payload_hash is distinct from stage_payload_hash
       or activation.staged_certification_fingerprint is distinct from
         certification_fingerprint
       or activation.staged_environment_delta_fingerprint_v2 is distinct from
         environment_fingerprint
       or activation.expected_deployment_commit is distinct from
         '6911c63cee6f6fe40c03a95bf7a7ba824be0d1fb'
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_STAGE_PROVENANCE_IMMUTABLE';
    end if;
    existing := production_control.lookup_cutover_receipt(
      'STAGE_RELEASE', input
    );
    if existing is null then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_MAINTENANCE_STAGE_RECEIPT_REQUIRED';
    end if;
    return existing || pg_catalog.jsonb_build_object(
      'boundary_mode', 'MAINTENANCE_WINDOW_V1',
      'maintenance_state', 'NORMAL',
      'stage_request_fingerprint', stage_request_fingerprint,
      'stage_payload_hash', stage_payload_hash,
      'certification_fingerprint', certification_fingerprint,
      'environment_delta_fingerprint_v2', environment_fingerprint,
      'maintenance_provenance_contract',
        'production-maintenance-staging-provenance-v1'
    );
  end if;

  -- Hold the complete semantic projection and every state predicate stable
  -- until the base stage and provenance binding commit atomically.
  lock table
    production_control.import_runs,
    production_control.current_shadow_revisions,
    production_control.current_shadow_semantic_baselines,
    production_control.worker_controls,
    production_control.worker_contracts,
    scoring_authority.tournaments,
    scoring_authority.players,
    scoring_authority.teams,
    scoring_authority.tournament_players,
    scoring_authority.rounds,
    scoring_authority.scoring_snapshots,
    scoring_authority.matches,
    scoring_authority.match_participants,
    scoring_authority.scoring_permissions,
    scoring_authority.match_holes,
    scoring_authority.hole_scores,
    scoring_authority.google_match_checkpoints,
    scoring_authority.scoring_ingress_leases,
    scoring_authority.authority_epochs,
    scoring_authority.google_outbox_events
  in share mode;

  provenance :=
    production_control.production_maintenance_stage_provenance_v1(input);
  if provenance->>'certification_fingerprint' is distinct from
       certification_fingerprint
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_CERTIFICATION_FINGERPRINT_MISMATCH';
  end if;
  if provenance->>'environment_delta_fingerprint_v2' is distinct from
       environment_fingerprint
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_ENVIRONMENT_DELTA_MISMATCH';
  end if;

  response_value :=
    public.stage_production_cutover_release_pre_step11_6_rehearsal(input);
  update production_control.cutover_activation_state
  set boundary_mode = 'MAINTENANCE_WINDOW_V1',
      maintenance_state = 'NORMAL',
      maintenance_started_at = null,
      maintenance_ended_at = null,
      staged_request_fingerprint = stage_request_fingerprint,
      staged_payload_hash = stage_payload_hash,
      staged_certification_fingerprint = certification_fingerprint,
      staged_environment_delta_fingerprint_v2 = environment_fingerprint
  where scope_key = 'BAGGER_INV_PRODUCTION'
    and state = 'STAGED'
    and expected_deployment_commit =
      '6911c63cee6f6fe40c03a95bf7a7ba824be0d1fb';
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_STAGE_BINDING_FAILED';
  end if;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_MAINTENANCE_RELEASE_PROVENANCE_STAGED',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    stage_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'boundary_mode', 'MAINTENANCE_WINDOW_V1',
      'deployment_commit',
        '6911c63cee6f6fe40c03a95bf7a7ba824be0d1fb',
      'maintenance_provenance_contract',
        provenance->>'maintenance_provenance_contract',
      'certification_fingerprint', certification_fingerprint,
      'environment_delta_fingerprint_v2', environment_fingerprint,
      'semantic_parity_contract',
        provenance->>'semantic_parity_contract',
      'semantic_payload_fingerprint',
        provenance->>'semantic_payload_fingerprint',
      'semantic_database_fingerprint',
        provenance->>'semantic_database_fingerprint',
      'unexplained_semantic_difference_count', 0,
      'activation_revision_before',
        provenance->'activation_revision',
      'authority_generation_id',
        provenance->'authority_generation_id',
      'admission_revision', provenance->'admission_revision',
      'admission_generation_id', provenance->'admission_generation_id',
      'first_supabase_canonical_write_possible', false,
      'first_supabase_canonical_write_observed', false
    )
  );

  return response_value || pg_catalog.jsonb_build_object(
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'maintenance_state', 'NORMAL',
    'stage_request_fingerprint', stage_request_fingerprint,
    'stage_payload_hash', stage_payload_hash,
    'certification_fingerprint', certification_fingerprint,
    'environment_delta_fingerprint_v2', environment_fingerprint,
    'maintenance_provenance_contract',
      provenance->>'maintenance_provenance_contract'
  );
end;
$$;

revoke all on function
  production_control.stage_production_maintenance_release(jsonb)
  from public, anon, authenticated, service_role;

comment on function
  production_control.production_maintenance_stage_provenance_v1(jsonb)
is
  'Builds exact-release MAINTENANCE_WINDOW_V1 environment and certification fingerprints from authoritative dormant state and semantic Google-to-Supabase parity. It does not apply to PROVIDER_FENCE_V2.';
comment on function
  public.inspect_production_maintenance_stage_provenance(jsonb)
is
  'Service-role-only, read-only preflight for deterministic MAINTENANCE_WINDOW_V1 staging provenance.';

notify pgrst, 'reload schema';
commit;
