-- One-time MAINTENANCE_WINDOW_V1 release binding and prepared-epoch runtime
-- deployment rebind.  Installation is inert: no release is bound, staged, or
-- rebound and no authority, admission, identity, read, ingress, worker, or
-- first-write state is changed by applying this migration.
begin;

create table production_control.maintenance_release_candidates (
  binding_id uuid primary key default extensions.gen_random_uuid(),
  scope_key text not null unique default 'BAGGER_INV_PRODUCTION' check (
    scope_key = 'BAGGER_INV_PRODUCTION'
  ),
  contract_version text not null check (
    contract_version = 'production-maintenance-release-binding-v1'
  ),
  release_sha text not null check (release_sha ~ '^[0-9a-f]{40}$'),
  candidate_deployment_id text not null check (
    candidate_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  candidate_hostname text not null check (
    candidate_hostname =
      'bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app'
  ),
  candidate_deployment_hostname text not null check (
    candidate_deployment_hostname ~ '^[a-z0-9-]+\.vercel\.app$'
  ),
  candidate_evidence_observed_at timestamptz not null,
  vercel_project_id text not null check (
    vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
  ),
  vercel_team_id text not null check (
    vercel_team_id = 'team_kPw5zaib8uaQJALAwj4fWI6R'
  ),
  activation_revision bigint not null check (activation_revision >= 0),
  authority_generation_id uuid not null,
  admission_revision bigint not null check (admission_revision >= 0),
  admission_generation_id uuid not null,
  source_fingerprint text not null check (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  semantic_payload_fingerprint text not null check (
    semantic_payload_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  semantic_database_fingerprint text not null check (
    semantic_database_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  binding_manifest jsonb not null check (
    pg_catalog.jsonb_typeof(binding_manifest) = 'object'
  ),
  binding_fingerprint text not null unique check (
    binding_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  request_fingerprint text not null unique check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  created_at timestamptz not null default pg_catalog.now(),
  unique (release_sha, candidate_deployment_id)
);

alter table production_control.maintenance_release_candidates
  enable row level security;

create table production_control.maintenance_runtime_deployment_rebindings (
  rebind_id uuid primary key default extensions.gen_random_uuid(),
  boundary_mode text not null check (
    boundary_mode = 'MAINTENANCE_WINDOW_V1'
  ),
  tournament_id text not null check (tournament_id = '2026'),
  epoch_id uuid not null unique references
    scoring_authority.authority_epochs(epoch_id) on delete restrict,
  closure_id uuid not null unique references
    production_control.scoring_admission_closures(closure_id)
    on delete restrict,
  deployment_commit text not null check (
    deployment_commit ~ '^[0-9a-f]{40}$'
  ),
  prior_deployment_id text not null check (
    prior_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  rebound_deployment_id text not null unique check (
    rebound_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
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
  authority_generation_id uuid not null,
  admission_generation_id uuid not null,
  staged_environment_delta_fingerprint_v2 text not null check (
    staged_environment_delta_fingerprint_v2 ~ '^[0-9a-f]{64}$'
  ),
  runtime_binding_contract text not null check (
    runtime_binding_contract =
      'production-maintenance-precommit-deployment-rebind-v1'
  ),
  runtime_binding_manifest jsonb not null check (
    pg_catalog.jsonb_typeof(runtime_binding_manifest) = 'object'
  ),
  runtime_binding_fingerprint text not null unique check (
    runtime_binding_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  runtime_observed_at timestamptz not null,
  request_fingerprint text not null unique check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  created_at timestamptz not null default pg_catalog.now(),
  check (prior_deployment_id <> rebound_deployment_id)
);

alter table production_control.maintenance_runtime_deployment_rebindings
  enable row level security;

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
  select pg_catalog.jsonb_build_object(
    'contract_version', 'production-maintenance-environment-delta-v3',
    'release_sha', pg_catalog.lower(target_release_sha),
    'candidate_deployment_id', target_candidate_deployment_id,
    'candidate_deployment_hostname', target_candidate_deployment_hostname,
    'candidate_deployment_target', 'PREVIEW',
    'candidate_runtime_environment', 'preview',
    'candidate_hostname',
      'bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app',
    'preview_isolation_contract', 'production-shadow-candidate-v1',
    'preview_isolation_allowed', true,
    'preview_commit_approved', true,
    'preview_no_authoritative_features', true,
    'production_deployment_target', 'PRODUCTION',
    'vercel_environment', 'production',
    'vercel_project', 'bagger-inv',
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
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
    'semantic_parity_contract',
      'production-current-shadow-semantic-parity-v1',
    'semantic_parity_migration',
      '202608270048_production_current_shadow_semantic_fingerprint.sql',
    'staging_provenance_contract',
      'production-maintenance-staging-provenance-v2',
    'staging_provenance_migration',
      '202608280050_production_maintenance_precommit_deployment_rebind.sql',
    'release_binding_contract',
      'production-maintenance-release-binding-v1',
    'release_binding_fingerprint',
      pg_catalog.lower(target_binding_fingerprint),
    'precommit_deployment_rebind_contract',
      'production-maintenance-precommit-deployment-rebind-v1',
    'precommit_deployment_rebind_migration',
      '202608280050_production_maintenance_precommit_deployment_rebind.sql'
  )
$$;

create or replace function
  production_control.production_maintenance_legacy_049_input(input jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select input || pg_catalog.jsonb_build_object(
    'maintenance_provenance_contract',
      'production-maintenance-staging-provenance-v1',
    'deployment_commit',
      '6911c63cee6f6fe40c03a95bf7a7ba824be0d1fb',
    'candidate_commit_sha',
      '6911c63cee6f6fe40c03a95bf7a7ba824be0d1fb',
    'selected_release_configuration', pg_catalog.jsonb_build_object(
      'contract_version', 'production-maintenance-environment-delta-v2',
      'release_sha', '6911c63cee6f6fe40c03a95bf7a7ba824be0d1fb',
      'candidate_deployment_id', input->>'deployment_id',
      'candidate_deployment_target', 'PREVIEW',
      'candidate_runtime_environment', 'preview',
      'candidate_hostname',
        'bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app',
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
      'semantic_parity_contract',
        'production-current-shadow-semantic-parity-v1',
      'semantic_parity_migration',
        '202608270048_production_current_shadow_semantic_fingerprint.sql',
      'staging_provenance_contract',
        'production-maintenance-staging-provenance-v1',
      'staging_provenance_migration',
        '202608280049_production_maintenance_staging_provenance.sql'
    )
  )
$$;

revoke all on table production_control.maintenance_release_candidates
  from public, anon, authenticated;
revoke all on table
  production_control.maintenance_runtime_deployment_rebindings
  from public, anon, authenticated;
revoke all on function
  production_control.production_maintenance_selected_configuration_v2(
    text, text, text, text
  ) from public, anon, authenticated, service_role;
revoke all on function
  production_control.production_maintenance_legacy_049_input(jsonb)
  from public, anon, authenticated, service_role;

-- This is a one-shot database-owner operation, deliberately not a PostgREST
-- RPC.  The owner must first verify the exact live Vercel candidate; ordinary
-- service-role callers cannot create or replace release evidence.
create or replace function
  production_control.bind_production_maintenance_release_candidate(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  resource production_control.resource_scope%rowtype;
  legacy_provenance jsonb;
  prior_binding production_control.maintenance_release_candidates%rowtype;
  binding production_control.maintenance_release_candidates%rowtype;
  target_release text := pg_catalog.lower(
    coalesce(input->>'deployment_commit', '')
  );
  binding_manifest jsonb;
  binding_fingerprint text;
  candidate_observed_at timestamptz;
  prior_claim_role text;
  response_value jsonb;
begin
  if not pg_catalog.pg_has_role(session_user, current_user, 'USAGE') then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DATABASE_OWNER_REQUIRED';
  end if;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if resource.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or resource.project_url <> 'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or resource.google_workbook_id <>
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or resource.vercel_project <> 'bagger-inv'
     or resource.canonical_domain <> 'https://baggerinv.com'
     or resource.current_tournament_id <> '2026'
     or resource.current_tournament_year <> 2026
  then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_RESOURCE_SCOPE_INVALID';
  end if;
  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'project_ref' is distinct from resource.project_ref
     or input->>'project_url' is distinct from resource.project_url
     or input->>'source_workbook_id' is distinct from
       resource.google_workbook_id
     or input->>'tournament_id' is distinct from
       resource.current_tournament_id
  then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_RESOURCE_ASSERTION_FAILED';
  end if;
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  perform production_control.assert_no_active_physical_writer_fence();
  if input->>'boundary_mode' is distinct from 'MAINTENANCE_WINDOW_V1'
     or input->>'maintenance_provenance_contract' is distinct from
       'production-maintenance-staging-provenance-v2'
     or target_release !~ '^[0-9a-f]{40}$'
     or pg_catalog.lower(coalesce(input->>'candidate_commit_sha', ''))
       is distinct from target_release
     or input->>'candidate_deployment_status' is distinct from 'READY'
     or input->>'candidate_deployment_target' is distinct from 'PREVIEW'
     or input->>'candidate_runtime_environment' is distinct from 'preview'
     or input->>'candidate_evidence_contract' is distinct from
       'vercel-ready-live-runtime-v1'
     or input->>'candidate_git_branch' is distinct from
       'feature/mock-tournament-qa-integration'
     or input->>'candidate_hostname' is distinct from
       'bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app'
     or coalesce(input->>'candidate_deployment_hostname', '')
       !~ '^[a-z0-9-]+\.vercel\.app$'
     or input->>'candidate_deployment_hostname' in (
       'bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app',
       'baggerinv.com', 'www.baggerinv.com'
     )
     or input->>'vercel_project' is distinct from 'bagger-inv'
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'vercel_team_id' is distinct from
       'team_kPw5zaib8uaQJALAwj4fWI6R'
     or input->>'preview_isolation_contract' is distinct from
       'production-shadow-candidate-v1'
     or input->'preview_isolation_allowed' is distinct from 'true'::jsonb
     or input->'preview_commit_approved' is distinct from 'true'::jsonb
     or input->'preview_no_authoritative_features' is distinct from
       'true'::jsonb
     or input->'step11_allowed' is distinct from 'true'::jsonb
     or input->'step11_sha_approved' is distinct from 'true'::jsonb
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_RELEASE_BINDING_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  candidate_observed_at :=
    (input->>'candidate_evidence_observed_at')::timestamptz;
  if candidate_observed_at is null
     or candidate_observed_at > pg_catalog.now()
     or candidate_observed_at < pg_catalog.now() - interval '15 minutes'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_RELEASE_EVIDENCE_NOT_CURRENT';
  end if;

  select value.* into prior_binding
  from production_control.maintenance_release_candidates value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  if found and (
    prior_binding.release_sha is distinct from target_release
    or prior_binding.candidate_deployment_id is distinct from
      input->>'deployment_id'
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_RELEASE_BINDING_ALREADY_BOUND';
  end if;

  -- Migration 049 remains immutable.  Its exact dormant-state and semantic
  -- parity implementation is reused with its certified release value, then
  -- this migration binds the newly Ready release separately and explicitly.
  -- The legacy helper is PostgREST-shaped, so the already-authorized database
  -- owner supplies its claim locally for this call only; the prior claim is
  -- restored before the one-shot binding is persisted.
  prior_claim_role := pg_catalog.current_setting(
    'request.jwt.claim.role', true
  );
  perform pg_catalog.set_config(
    'request.jwt.claim.role', 'service_role', true
  );
  legacy_provenance :=
    production_control.production_maintenance_stage_provenance_v1(
      production_control.production_maintenance_legacy_049_input(input)
    );
  perform pg_catalog.set_config(
    'request.jwt.claim.role', coalesce(prior_claim_role, ''), true
  );

  binding_manifest := pg_catalog.jsonb_build_object(
    'domain', 'BAGGER_MAINTENANCE_RELEASE_BINDING_V1',
    'contract_version', 'production-maintenance-release-binding-v1',
    'release_sha', target_release,
    'candidate_deployment_id', input->>'deployment_id',
    'candidate_deployment_hostname',
      input->>'candidate_deployment_hostname',
    'candidate_deployment_status', 'READY',
    'candidate_evidence_contract', 'vercel-ready-live-runtime-v1',
    'candidate_evidence_observed_at', candidate_observed_at,
    'candidate_deployment_target', 'PREVIEW',
    'candidate_runtime_environment', 'preview',
    'candidate_git_branch', 'feature/mock-tournament-qa-integration',
    'candidate_hostname', input->>'candidate_hostname',
    'vercel_project', 'bagger-inv',
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
    'project_ref', 'ymqhhtxaywtqllynrmxe',
    'source_workbook_id',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
    'tournament_id', '2026',
    'activation_revision', legacy_provenance->'activation_revision',
    'authority_generation_id',
      legacy_provenance->'authority_generation_id',
    'admission_revision', legacy_provenance->'admission_revision',
    'admission_generation_id',
      legacy_provenance->'admission_generation_id',
    'source_fingerprint', pg_catalog.lower(input->>'source_fingerprint'),
    'semantic_parity_contract',
      'production-current-shadow-semantic-parity-v1',
    'semantic_payload_fingerprint',
      legacy_provenance->>'semantic_payload_fingerprint',
    'semantic_database_fingerprint',
      legacy_provenance->>'semantic_database_fingerprint',
    'semantic_parity', true,
    'unexplained_semantic_difference_count', 0,
    'preview_isolation_allowed', true,
    'preview_commit_approved', true,
    'preview_no_authoritative_features', true,
    'step11_allowed', true,
    'step11_sha_approved', true,
    'first_supabase_canonical_write_possible', false,
    'first_supabase_canonical_write_observed', false
  );
  binding_fingerprint := pg_catalog.encode(
    extensions.digest(binding_manifest::text, 'sha256'), 'hex'
  );

  if prior_binding.binding_id is not null then
    if prior_binding.binding_manifest is distinct from binding_manifest
       or prior_binding.binding_fingerprint is distinct from
         binding_fingerprint
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_MAINTENANCE_RELEASE_BINDING_IMMUTABLE';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_MAINTENANCE_RELEASE_CANDIDATE_BOUND',
      'binding_id', prior_binding.binding_id,
      'release_sha', prior_binding.release_sha,
      'candidate_deployment_id', prior_binding.candidate_deployment_id,
      'binding_manifest', prior_binding.binding_manifest,
      'binding_fingerprint', prior_binding.binding_fingerprint,
      'semantic_parity', true,
      'first_supabase_canonical_write_possible', false,
      'first_supabase_canonical_write_observed', false,
      'idempotent', true
    );
  end if;

  insert into production_control.maintenance_release_candidates (
    contract_version, release_sha, candidate_deployment_id,
    candidate_hostname, candidate_deployment_hostname,
    candidate_evidence_observed_at, vercel_project_id, vercel_team_id,
    activation_revision, authority_generation_id, admission_revision,
    admission_generation_id, source_fingerprint,
    semantic_payload_fingerprint, semantic_database_fingerprint,
    binding_manifest, binding_fingerprint, request_fingerprint,
    payload_hash, actor_id
  ) values (
    'production-maintenance-release-binding-v1', target_release,
    input->>'deployment_id', input->>'candidate_hostname',
    input->>'candidate_deployment_hostname', candidate_observed_at,
    'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'team_kPw5zaib8uaQJALAwj4fWI6R',
    (legacy_provenance->>'activation_revision')::bigint,
    (legacy_provenance->>'authority_generation_id')::uuid,
    (legacy_provenance->>'admission_revision')::bigint,
    (legacy_provenance->>'admission_generation_id')::uuid,
    pg_catalog.lower(input->>'source_fingerprint'),
    legacy_provenance->>'semantic_payload_fingerprint',
    legacy_provenance->>'semantic_database_fingerprint',
    binding_manifest, binding_fingerprint,
    pg_catalog.lower(input->>'request_fingerprint'),
    production_control.cutover_payload_hash(input),
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into binding;

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_MAINTENANCE_RELEASE_CANDIDATE_BOUND',
    'binding_id', binding.binding_id,
    'release_sha', binding.release_sha,
    'candidate_deployment_id', binding.candidate_deployment_id,
    'binding_manifest', binding.binding_manifest,
    'binding_fingerprint', binding.binding_fingerprint,
    'semantic_parity', true,
    'first_supabase_canonical_write_possible', false,
    'first_supabase_canonical_write_observed', false,
    'idempotent', false
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_MAINTENANCE_RELEASE_CANDIDATE_BOUND',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    response_value - 'ok' - 'idempotent' - 'binding_manifest'
  );
  return response_value;
end;
$$;

create or replace function
  production_control.production_maintenance_stage_provenance_v2(
    input jsonb
  )
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  binding production_control.maintenance_release_candidates%rowtype;
  legacy_provenance jsonb;
  expected_configuration jsonb;
  environment_manifest jsonb;
  certification_manifest jsonb;
  environment_fingerprint text;
  certification_fingerprint text;
  target_release text := pg_catalog.lower(
    coalesce(input->>'deployment_commit', '')
  );
begin
  if input->>'boundary_mode' is distinct from 'MAINTENANCE_WINDOW_V1'
     or input->>'maintenance_provenance_contract' is distinct from
       'production-maintenance-staging-provenance-v2'
     or target_release !~ '^[0-9a-f]{40}$'
     or pg_catalog.lower(coalesce(input->>'candidate_commit_sha', ''))
       is distinct from target_release
     or coalesce(input->>'release_binding_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_RELEASE_CONFIGURATION_INVALID';
  end if;

  select value.* into strict binding
  from production_control.maintenance_release_candidates value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
    and value.release_sha = target_release
    and value.candidate_deployment_id = input->>'deployment_id';
  if binding.binding_fingerprint is distinct from
       pg_catalog.lower(input->>'release_binding_fingerprint')
     or binding.candidate_hostname is distinct from
       input->>'candidate_hostname'
     or binding.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or binding.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or binding.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or binding.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or binding.source_fingerprint is distinct from
       pg_catalog.lower(input->>'source_fingerprint')
  then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_MAINTENANCE_RELEASE_BINDING_CONFLICT';
  end if;

  legacy_provenance :=
    production_control.production_maintenance_stage_provenance_v1(
      production_control.production_maintenance_legacy_049_input(input)
    );
  if binding.semantic_payload_fingerprint is distinct from
       legacy_provenance->>'semantic_payload_fingerprint'
     or binding.semantic_database_fingerprint is distinct from
       legacy_provenance->>'semantic_database_fingerprint'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_RELEASE_PARITY_CHANGED';
  end if;

  expected_configuration :=
    production_control.production_maintenance_selected_configuration_v2(
      target_release, input->>'deployment_id',
      binding.candidate_deployment_hostname, binding.binding_fingerprint
    );
  if pg_catalog.jsonb_typeof(input->'selected_release_configuration')
       is distinct from 'object'
     or input->'selected_release_configuration' is distinct from
       expected_configuration
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_SELECTED_CONFIGURATION_INVALID';
  end if;

  environment_manifest :=
    (legacy_provenance->'environment_delta_manifest') ||
    pg_catalog.jsonb_build_object(
      'domain', 'BAGGER_STEP12_MAINTENANCE_ENVIRONMENT_DELTA_V3',
      'contract_version', 'production-maintenance-environment-delta-v3',
      'selected_release_configuration', expected_configuration,
      'release_candidate_binding', binding.binding_manifest,
      'release_candidate_binding_fingerprint', binding.binding_fingerprint
    );
  environment_fingerprint := pg_catalog.encode(
    extensions.digest(environment_manifest::text, 'sha256'), 'hex'
  );

  certification_manifest :=
    (legacy_provenance->'certification_manifest') ||
    pg_catalog.jsonb_build_object(
      'domain', 'BAGGER_MAINTENANCE_WINDOW_RELEASE_CERTIFICATION_V2',
      'contract_version', 'production-maintenance-staging-provenance-v2',
      'release_sha', target_release,
      'environment_delta_fingerprint_v2', environment_fingerprint,
      'release_candidate_binding', binding.binding_manifest,
      'release_candidate_binding_fingerprint', binding.binding_fingerprint,
      'installed_contracts',
        (legacy_provenance->'certification_manifest'->'installed_contracts') ||
        pg_catalog.jsonb_build_object(
          'maintenance_staging_provenance_contract',
            'production-maintenance-staging-provenance-v2',
          'maintenance_staging_provenance_migration',
            '202608280050_production_maintenance_precommit_deployment_rebind.sql',
          'maintenance_release_binding_contract',
            'production-maintenance-release-binding-v1',
          'maintenance_precommit_deployment_rebind_contract',
            'production-maintenance-precommit-deployment-rebind-v1',
          'maintenance_precommit_deployment_rebind_migration',
            '202608280050_production_maintenance_precommit_deployment_rebind.sql'
        )
    );
  certification_fingerprint := pg_catalog.encode(
    extensions.digest(certification_manifest::text, 'sha256'), 'hex'
  );

  return legacy_provenance || pg_catalog.jsonb_build_object(
    'code', 'PRODUCTION_MAINTENANCE_STAGE_PROVENANCE_READY',
    'deployment_commit', target_release,
    'maintenance_provenance_contract',
      'production-maintenance-staging-provenance-v2',
    'environment_delta_contract',
      'production-maintenance-environment-delta-v3',
    'environment_delta_manifest', environment_manifest,
    'environment_delta_fingerprint_v2', environment_fingerprint,
    'certification_manifest', certification_manifest,
    'certification_fingerprint', certification_fingerprint,
    'release_binding_id', binding.binding_id,
    'release_binding_fingerprint', binding.binding_fingerprint
  );
end;
$$;

create or replace function
  public.inspect_production_maintenance_stage_provenance(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if input->>'maintenance_provenance_contract' =
       'production-maintenance-staging-provenance-v2'
  then
    return production_control.production_maintenance_stage_provenance_v2(
      input
    );
  end if;
  return production_control.production_maintenance_stage_provenance_v1(input);
end;
$$;

revoke all on function
  production_control.bind_production_maintenance_release_candidate(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.production_maintenance_stage_provenance_v2(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.inspect_production_maintenance_stage_provenance(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.inspect_production_maintenance_stage_provenance(jsonb)
  to service_role;

alter function
  production_control.stage_production_maintenance_release(jsonb)
  rename to stage_production_maintenance_release_v1;
revoke all on function
  production_control.stage_production_maintenance_release_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function
  production_control.stage_production_maintenance_release_v2(input jsonb)
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
  binding production_control.maintenance_release_candidates%rowtype;
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
     or input->>'maintenance_provenance_contract' is distinct from
       'production-maintenance-staging-provenance-v2'
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
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select value.* into strict binding
  from production_control.maintenance_release_candidates value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for share;

  if activation.state = 'STAGED' then
    if activation.boundary_mode is distinct from 'MAINTENANCE_WINDOW_V1'
       or activation.activation_revision is distinct from
         (input->>'expected_activation_revision')::bigint + 1
       or activation.authority_generation_id is distinct from
         (input->>'expected_authority_generation')::uuid
       or activation.expected_deployment_commit is distinct from
         pg_catalog.lower(input->>'deployment_commit')
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
       or binding.release_sha is distinct from
         pg_catalog.lower(input->>'deployment_commit')
       or binding.candidate_deployment_id is distinct from
         input->>'deployment_id'
       or binding.binding_fingerprint is distinct from
         pg_catalog.lower(input->>'release_binding_fingerprint')
       or activation.staged_request_fingerprint is distinct from
         stage_request_fingerprint
       or activation.staged_payload_hash is distinct from stage_payload_hash
       or activation.staged_certification_fingerprint is distinct from
         certification_fingerprint
       or activation.staged_environment_delta_fingerprint_v2 is distinct from
         environment_fingerprint
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
        'production-maintenance-staging-provenance-v2'
    );
  elsif activation.state <> 'DORMANT' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_STAGE_PROVENANCE_IMMUTABLE';
  end if;

  lock table
    production_control.import_runs,
    production_control.current_shadow_revisions,
    production_control.current_shadow_semantic_baselines,
    production_control.worker_controls,
    production_control.worker_contracts,
    production_control.maintenance_release_candidates,
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
    production_control.production_maintenance_stage_provenance_v2(input);
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
      pg_catalog.lower(input->>'deployment_commit');
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
      'deployment_commit', pg_catalog.lower(input->>'deployment_commit'),
      'release_binding_fingerprint',
        provenance->>'release_binding_fingerprint',
      'maintenance_provenance_contract',
        provenance->>'maintenance_provenance_contract',
      'certification_fingerprint', certification_fingerprint,
      'environment_delta_fingerprint_v2', environment_fingerprint,
      'semantic_payload_fingerprint',
        provenance->>'semantic_payload_fingerprint',
      'semantic_database_fingerprint',
        provenance->>'semantic_database_fingerprint',
      'unexplained_semantic_difference_count', 0,
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
    'release_binding_fingerprint',
      provenance->>'release_binding_fingerprint',
    'maintenance_provenance_contract',
      'production-maintenance-staging-provenance-v2'
  );
end;
$$;

create or replace function
  production_control.stage_production_maintenance_release(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if input->>'maintenance_provenance_contract' =
       'production-maintenance-staging-provenance-v2'
  then
    return production_control.stage_production_maintenance_release_v2(input);
  end if;
  return production_control.stage_production_maintenance_release_v1(input);
end;
$$;

revoke all on function
  production_control.stage_production_maintenance_release_v2(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.stage_production_maintenance_release(jsonb)
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
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  binding production_control.maintenance_release_candidates%rowtype;
  prior_rebind
    production_control.maintenance_runtime_deployment_rebindings%rowtype;
  rebind
    production_control.maintenance_runtime_deployment_rebindings%rowtype;
  runtime_observed_at timestamptz;
  intent_input jsonb := input - 'runtime_observed_at';
  runtime_manifest jsonb;
  runtime_fingerprint text;
  next_activation_revision bigint;
  next_admission_revision bigint;
  response_value jsonb;
begin
  perform production_control.assert_maintenance_common_input(input);
  perform production_control.assert_no_active_physical_writer_fence();
  if input->>'operation' is distinct from
       'REBIND_PRODUCTION_MAINTENANCE_PRECOMMIT_DEPLOYMENT'
     or coalesce(input->>'epoch_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or coalesce(input->>'closure_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or coalesce(input->>'original_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or input->>'deployment_id' = input->>'original_deployment_id'
     or input->>'runtime_binding_contract' is distinct from
       'production-maintenance-precommit-deployment-rebind-v1'
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
     or input->>'runtime_cutover_phase' is distinct from 'SCORING_COMMIT'
     or input->>'runtime_scoring_authority' is distinct from 'SUPABASE'
     or input->>'runtime_participant_identity_authority' is distinct from
       'SUPABASE'
     or input->'runtime_activation_enabled' is distinct from 'true'::jsonb
     or input->'runtime_foundation_enabled' is distinct from 'true'::jsonb
     or input->'runtime_google_ingress_lease_gate_enabled'
       is distinct from 'true'::jsonb
     or input->'runtime_supabase_scoring_ingress_enabled'
       is distinct from 'true'::jsonb
     or input->'runtime_workers_enabled' is distinct from 'false'::jsonb
     or input->'runtime_google_mirror_enabled' is distinct from 'false'::jsonb
     or input->'runtime_scorecard_archive_enabled'
       is distinct from 'false'::jsonb
     or pg_catalog.lower(coalesce(
       input->>'runtime_deployment_commit', ''
     )) is distinct from input->>'deployment_commit'
     or pg_catalog.lower(coalesce(
       input->>'runtime_expected_authority_epoch', ''
     )) is distinct from pg_catalog.lower(input->>'epoch_id')
     or pg_catalog.lower(coalesce(
       input->>'runtime_expected_admission_generation', ''
     )) is distinct from pg_catalog.lower(
       input->>'expected_admission_generation'
     )
     or coalesce(input->>'staged_environment_delta_fingerprint_v2', '')
       !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_INPUT_INVALID';
  end if;
  existing := production_control.lookup_cutover_receipt(
    'REBIND_MAINTENANCE_PRECOMMIT_DEPLOYMENT', intent_input
  );
  if existing is not null then
    return existing || pg_catalog.jsonb_build_object('idempotent', true);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'REBIND_MAINTENANCE_PRECOMMIT_DEPLOYMENT', intent_input
  );
  if existing is not null then
    return existing || pg_catalog.jsonb_build_object('idempotent', true);
  end if;
  runtime_observed_at :=
    (input->>'runtime_observed_at')::timestamptz;
  if runtime_observed_at is null
     or runtime_observed_at > pg_catalog.now()
     or runtime_observed_at < pg_catalog.now() - interval '5 minutes'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_PRECOMMIT_RUNTIME_NOT_CURRENT';
  end if;

  runtime_manifest := pg_catalog.jsonb_build_object(
    'domain', 'BAGGER_MAINTENANCE_PRECOMMIT_DEPLOYMENT_REBIND_V1',
    'contract_version',
      'production-maintenance-precommit-deployment-rebind-v1',
    'release_sha', pg_catalog.lower(input->>'deployment_commit'),
    'original_deployment_id', input->>'original_deployment_id',
    'replacement_deployment_id', input->>'deployment_id',
    'replacement_deployment_status', 'READY',
    'readiness_evidence', 'LIVE_CANONICAL_PRODUCTION_ROUTE',
    'deployment_target', 'PRODUCTION',
    'runtime_environment', 'production',
    'deployment_hostname', input->>'runtime_deployment_hostname',
    'canonical_hostname', 'baggerinv.com',
    'vercel_project', 'bagger-inv',
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
    'supabase_project_ref', 'ymqhhtxaywtqllynrmxe',
    'supabase_project_url', 'https://ymqhhtxaywtqllynrmxe.supabase.co',
    'google_workbook_id',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
    'tournament_id', '2026',
    'cutover_phase', 'SCORING_COMMIT',
    'scoring_authority', 'SUPABASE',
    'participant_identity_authority', 'SUPABASE',
    'prepared_authority_epoch', pg_catalog.lower(input->>'epoch_id'),
    'current_google_authority_generation',
      pg_catalog.lower(input->>'expected_authority_generation'),
    'admission_generation',
      pg_catalog.lower(input->>'expected_admission_generation'),
    'expected_activation_revision',
      (input->>'expected_activation_revision')::bigint,
    'expected_admission_revision',
      (input->>'expected_admission_revision')::bigint,
    'activation_enabled', true,
    'foundation_enabled', true,
    'google_ingress_lease_gate_enabled', true,
    'supabase_scoring_ingress_enabled', true,
    'workers_enabled', false,
    'google_mirror_enabled', false,
    'scorecard_archive_enabled', false,
    'staged_environment_delta_fingerprint_v2',
      pg_catalog.lower(input->>'staged_environment_delta_fingerprint_v2')
  );
  runtime_fingerprint := pg_catalog.encode(
    extensions.digest(runtime_manifest::text, 'sha256'), 'hex'
  );

  select value.* into prior_rebind
  from production_control.maintenance_runtime_deployment_rebindings value
  where value.epoch_id = (input->>'epoch_id')::uuid
  for update;
  if found then
    if prior_rebind.prior_deployment_id is distinct from
         input->>'original_deployment_id'
       or prior_rebind.rebound_deployment_id is distinct from
         input->>'deployment_id'
       or prior_rebind.deployment_commit is distinct from
         input->>'deployment_commit'
       or prior_rebind.activation_revision_before is distinct from
         (input->>'expected_activation_revision')::bigint
       or prior_rebind.admission_revision_before is distinct from
         (input->>'expected_admission_revision')::bigint
       or prior_rebind.authority_generation_id is distinct from
         (input->>'expected_authority_generation')::uuid
       or prior_rebind.admission_generation_id is distinct from
         (input->>'expected_admission_generation')::uuid
       or prior_rebind.runtime_binding_manifest is distinct from
         runtime_manifest
       or prior_rebind.runtime_binding_fingerprint is distinct from
         runtime_fingerprint
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_ALREADY_USED';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_MAINTENANCE_PRECOMMIT_DEPLOYMENT_REBOUND',
      'rebind_id', prior_rebind.rebind_id,
      'epoch_id', prior_rebind.epoch_id,
      'closure_id', prior_rebind.closure_id,
      'deployment_commit', prior_rebind.deployment_commit,
      'original_deployment_id', prior_rebind.prior_deployment_id,
      'deployment_id', prior_rebind.rebound_deployment_id,
      'activation_revision', prior_rebind.activation_revision_after,
      'admission_revision', prior_rebind.admission_revision_after,
      'authority_generation_id', prior_rebind.authority_generation_id,
      'admission_generation_id', prior_rebind.admission_generation_id,
      'runtime_binding_fingerprint',
        prior_rebind.runtime_binding_fingerprint,
      'authority', 'GOOGLE',
      'maintenance_state', 'SCORING_MAINTENANCE',
      'ingress', 'PAUSED',
      'first_supabase_canonical_write_possible', false,
      'first_supabase_canonical_write_observed', false,
      'idempotent', true
    );
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
  where value.closure_id = (input->>'closure_id')::uuid for update;
  select value.* into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = (input->>'epoch_id')::uuid for update;
  select value.* into strict binding
  from production_control.maintenance_release_candidates value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
    and value.release_sha = activation.expected_deployment_commit;

  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.state <> 'CUTOVER_PREPARED'
     or activation.maintenance_state <> 'SCORING_MAINTENANCE'
     or activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.read_cutover_phase <> 'SCORING_PREPARE'
     or activation.active_transition_epoch_id is distinct from epoch.epoch_id
     or activation.expected_deployment_commit is distinct from
       input->>'deployment_commit'
     or activation.expected_vercel_project_id is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or activation.staged_environment_delta_fingerprint_v2 is distinct from
       pg_catalog.lower(input->>'staged_environment_delta_fingerprint_v2')
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.first_supabase_mutation_key is not null
     or activation.first_supabase_match_id is not null
     or activation.first_supabase_match_revision is not null
     or resource.current_tournament_read_authority <> 'SUPABASE'
     or resource.scoring_authority <> 'GOOGLE'
     or resource.participant_identity_authority <> 'SUPABASE'
     or resource.scoring_ingress_enabled
     or resource.workers_enabled
     or resource.google_writes_enabled
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.authority <> 'GOOGLE'
     or gate.state <> 'PAUSED'
     or gate.admission_state <> 'CLOSED'
     or not gate.admission_protocol_enforced
     or gate.unresolved_client_queues <> 0
     or gate.admission_deployment_id is distinct from
       input->>'original_deployment_id'
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.active_epoch_id is distinct from epoch.epoch_id
     or gate.active_closure_id is distinct from closure.closure_id
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.closure_kind <> 'LEGACY_ADMISSION'
     or closure.authority <> 'GOOGLE'
     or closure.status <> 'CLOSED'
     or closure.deployment_id is distinct from
       input->>'original_deployment_id'
     or closure.authority_generation_id is distinct from
       activation.authority_generation_id
     or closure.admission_generation_id is distinct from
       gate.admission_generation_id
     or closure.closed_admission_revision is distinct from
       gate.admission_revision
     or closure.final_source_fingerprint is distinct from
       closure.supabase_shadow_fingerprint
     or closure.unexplained_difference_count <> 0
     or epoch.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or epoch.status <> 'PREPARED'
     or epoch.epoch_type <> 'CUTOVER'
     or epoch.authority_before <> 'GOOGLE'
     or epoch.authority_after <> 'SUPABASE'
     or epoch.deployment_commit is distinct from
       activation.expected_deployment_commit
     or epoch.admission_closure_id is distinct from closure.closure_id
     or epoch.admission_generation_id is distinct from
       gate.admission_generation_id
     or epoch.closed_admission_revision is distinct from
       gate.admission_revision
     or epoch.closure_boundary_fingerprint is distinct from
       closure.lease_set_fingerprint
     or epoch.source_fingerprint is distinct from
       closure.final_source_fingerprint
     or epoch.supabase_shadow_fingerprint is distinct from
       closure.supabase_shadow_fingerprint
     or epoch.reconciliation_fingerprint is distinct from
       closure.reconciliation_fingerprint
     or epoch.supabase_match_revisions is distinct from
       production_control.current_match_revisions('2026')
     or epoch.google_checkpoints is distinct from
       production_control.current_google_checkpoints('2026')
     or binding.candidate_deployment_id is null
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026'
         and lease.protocol_version = 'ADMISSION_V2'
         and lease.admission_generation_id = gate.admission_generation_id
         and lease.admission_sequence > closure.lease_high_watermark
     )
     or exists (
       select 1 from scoring_authority.google_outbox_events event
       where event.tournament_id = '2026' and event.status <> 'DELIVERED'
     )
     or exists (
       select 1 from scoring_authority.scorecard_archive_jobs job
       where job.tournament_id = '2026'
         and job.status not in ('VERIFIED', 'SUPERSEDED')
     )
     or exists (
       select 1 from production_control.worker_controls worker
       where worker.enabled or worker.scheduler_installed
          or worker.google_writes_allowed
     )
     or exists (
       select 1 from production_control.worker_contracts contract
       where contract.operation_allowed or contract.scheduler_installed
          or contract.authoritative_write_allowed
     )
     or exists (
       select 1 from scoring_authority.authority_epochs other_epoch
       where other_epoch.tournament_id = '2026'
         and other_epoch.status = 'PREPARED'
         and other_epoch.epoch_id <> epoch.epoch_id
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_NOT_SAFE';
  end if;

  next_activation_revision := activation.activation_revision + 1;
  next_admission_revision := gate.admission_revision + 1;
  update scoring_authority.ingress_gates
  set admission_deployment_id = input->>'deployment_id',
      admission_revision = next_admission_revision,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' returning * into gate;
  update production_control.scoring_admission_closures
  set deployment_id = input->>'deployment_id',
      closed_admission_revision = next_admission_revision
  where closure_id = closure.closure_id returning * into closure;
  update scoring_authority.authority_epochs
  set closed_admission_revision = next_admission_revision
  where epoch_id = epoch.epoch_id returning * into epoch;
  update production_control.cutover_activation_state
  set activation_revision = next_activation_revision,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION' returning * into activation;

  insert into production_control.maintenance_runtime_deployment_rebindings (
    boundary_mode, tournament_id, epoch_id, closure_id,
    deployment_commit, prior_deployment_id, rebound_deployment_id,
    activation_revision_before, activation_revision_after,
    admission_revision_before, admission_revision_after,
    authority_generation_id, admission_generation_id,
    staged_environment_delta_fingerprint_v2,
    runtime_binding_contract, runtime_binding_manifest,
    runtime_binding_fingerprint, runtime_observed_at,
    request_fingerprint, payload_hash, actor_id
  ) values (
    'MAINTENANCE_WINDOW_V1', '2026', epoch.epoch_id, closure.closure_id,
    input->>'deployment_commit', input->>'original_deployment_id',
    input->>'deployment_id',
    (input->>'expected_activation_revision')::bigint,
    next_activation_revision,
    (input->>'expected_admission_revision')::bigint,
    next_admission_revision,
    activation.authority_generation_id, gate.admission_generation_id,
    pg_catalog.lower(input->>'staged_environment_delta_fingerprint_v2'),
    'production-maintenance-precommit-deployment-rebind-v1',
    runtime_manifest, runtime_fingerprint, runtime_observed_at,
    pg_catalog.lower(input->>'request_fingerprint'),
    production_control.cutover_payload_hash(intent_input),
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into rebind;

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_MAINTENANCE_PRECOMMIT_DEPLOYMENT_REBOUND',
    'rebind_id', rebind.rebind_id,
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'epoch_id', epoch.epoch_id,
    'closure_id', closure.closure_id,
    'deployment_commit', rebind.deployment_commit,
    'original_deployment_id', rebind.prior_deployment_id,
    'deployment_id', rebind.rebound_deployment_id,
    'activation_revision', activation.activation_revision,
    'admission_revision', gate.admission_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'runtime_binding_fingerprint', runtime_fingerprint,
    'authority', 'GOOGLE',
    'maintenance_state', 'SCORING_MAINTENANCE',
    'ingress', 'PAUSED',
    'workers_enabled', false,
    'first_supabase_canonical_write_possible', false,
    'first_supabase_canonical_write_observed', false,
    'idempotent', false
  );
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'MAINTENANCE_PRECOMMIT_DEPLOYMENT_REBOUND',
    pg_catalog.left(input->>'actor_id', 160),
    response_value - 'ok' - 'idempotent'
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_MAINTENANCE_PRECOMMIT_DEPLOYMENT_REBOUND',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    response_value - 'ok' - 'idempotent'
  );
  perform production_control.store_cutover_receipt(
    'REBIND_MAINTENANCE_PRECOMMIT_DEPLOYMENT', intent_input, response_value
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

comment on function
  public.rebind_production_maintenance_precommit_deployment(jsonb)
is
  'One-time MAINTENANCE_WINDOW_V1-only rebind from the original admitted Production deployment to a Ready exact-SHA Production runtime bound to the active PREPARED authority epoch; it never applies to PROVIDER_FENCE_V2.';

notify pgrst, 'reload schema';
commit;
