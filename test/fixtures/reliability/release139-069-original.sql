-- Step 13E.7B Production annual scoring authority V1.
--
-- Installation is inert.  It does not close 2026 admission, create or activate
-- a future tournament, move the current-tournament pointer, enable a worker,
-- or mutate a scoring fact.  The frozen 2026 RPCs remain unchanged.  This
-- migration installs the only service-role path by which a later current
-- tournament may use the future scoring RPCs, plus a lock-held close-fence and
-- compare-and-set transition contract for a later, separately authorized run.
begin;

-- A prepared generation that is safely abandoned before pointer commit must
-- remain auditable without permanently consuming the tournament's one usable
-- generation slot.  Migration 066 had no abort terminal state.
alter table production_control.future_annual_runtime_generations_v1
  drop constraint if exists
    future_annual_runtime_generations_v1_generation_status_check,
  drop constraint if exists future_annual_runtime_generations_v1_check,
  drop constraint if exists
    future_annual_runtime_generations_v1_tournament_id_key;

alter table production_control.future_annual_runtime_generations_v1
  add constraint production_future_annual_generation_status_v2 check (
    generation_status in ('PREPARED', 'ACTIVE', 'CLOSED', 'ABORTED')
  ),
  add constraint production_future_annual_generation_shape_v2 check (
    (generation_status = 'PREPARED' and activated_at is null
      and closed_at is null)
    or (generation_status = 'ACTIVE' and activated_at is not null
      and closed_at is null)
    or (generation_status = 'CLOSED' and activated_at is not null
      and closed_at is not null)
    or (generation_status = 'ABORTED' and activated_at is null
      and closed_at is not null)
  );

create unique index production_future_one_usable_annual_generation_v2
  on production_control.future_annual_runtime_generations_v1(tournament_id)
  where generation_status in ('PREPARED', 'ACTIVE', 'CLOSED');

create table production_control.annual_scoring_rpc_allowlist_v1 (
  operation_name text primary key check (
    operation_name ~ '^[a-z][a-z0-9_]{2,95}$'
  ),
  target_rpc text not null unique check (
    target_rpc ~ '^public\.future_production_[a-z0-9_]+_v[1-9][0-9]*$'
  ),
  required_phase text not null check (
    required_phase in ('CURRENT_READS', 'SCORING_COMMIT', 'WORKERS')
  ),
  operation_class text not null check (
    operation_class in ('READ', 'MUTATION', 'WORKER')
  ),
  required_worker text check (
    required_worker is null or required_worker in (
      'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'
    )
  ),
  allowlist_revision bigint not null default 1 check (
    allowlist_revision > 0
  ),
  enabled boolean not null default true,
  installed_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (operation_class = 'WORKER' and required_phase = 'WORKERS')
    or (operation_class <> 'WORKER' and required_worker is null)
  )
);

insert into production_control.annual_scoring_rpc_allowlist_v1 (
  operation_name, target_rpc, required_phase, operation_class,
  required_worker
) values
  ('read_production_scoring_authority',
    'public.future_production_read_scoring_authority_v1',
    'CURRENT_READS', 'READ', null),
  ('read_production_scoring_participant_context',
    'public.future_production_read_scoring_participant_context_v1',
    'CURRENT_READS', 'READ', null),
  ('submit_production_hole_score',
    'public.future_production_submit_hole_score_v1',
    'SCORING_COMMIT', 'MUTATION', null),
  ('mutate_production_match_control',
    'public.future_production_mutate_match_control_v1',
    'SCORING_COMMIT', 'MUTATION', null),
  ('finalize_production_match',
    'public.future_production_finalize_match_v1',
    'SCORING_COMMIT', 'MUTATION', null),
  ('reopen_production_match',
    'public.future_production_reopen_match_v1',
    'SCORING_COMMIT', 'MUTATION', null),
  ('claim_production_google_outbox',
    'public.future_production_claim_google_outbox_v1',
    'WORKERS', 'WORKER', 'SCORING_GOOGLE_OUTBOX'),
  ('claim_production_google_outbox_event',
    'public.future_production_claim_google_outbox_event_v1',
    'WORKERS', 'WORKER', 'SCORING_GOOGLE_OUTBOX'),
  ('complete_production_google_outbox',
    'public.future_production_complete_google_outbox_v1',
    'WORKERS', 'WORKER', 'SCORING_GOOGLE_OUTBOX'),
  ('fail_production_google_outbox',
    'public.future_production_fail_google_outbox_v1',
    'WORKERS', 'WORKER', 'SCORING_GOOGLE_OUTBOX'),
  ('inspect_production_scoring_workers',
    'public.future_production_inspect_scoring_workers_v1',
    'WORKERS', 'READ', null),
  ('claim_production_scorecard_archive_job',
    'public.future_production_claim_scorecard_archive_job_v1',
    'WORKERS', 'WORKER', 'ROUND_SCORECARDS_ARCHIVE'),
  ('complete_production_scorecard_archive_job',
    'public.future_production_complete_scorecard_archive_job_v1',
    'WORKERS', 'WORKER', 'ROUND_SCORECARDS_ARCHIVE'),
  ('fail_production_scorecard_archive_job',
    'public.future_production_fail_scorecard_archive_job_v1',
    'WORKERS', 'WORKER', 'ROUND_SCORECARDS_ARCHIVE'),
  ('inspect_production_scorecard_archive_state',
    'public.future_production_inspect_scorecard_archive_state_v1',
    'WORKERS', 'READ', null);

-- The annual target changes; the Production platform capability does not.
-- Capture the exact frozen 2026 resource / authority / admission / deployment
-- tuple once at install time.  Runtime dispatch re-proves this immutable row
-- without adding anything to the established 2026 scoring request bodies.
create table production_control.annual_scoring_platform_certifications_v1 (
  scope_key text primary key check (scope_key = 'BAGGER_INV_PRODUCTION'),
  contract_version text not null check (
    contract_version = 'production-annual-scoring-platform-certification-v1'
  ),
  platform_tournament_id text not null check (
    platform_tournament_id = '2026'
  ),
  project_ref text not null,
  project_url text not null,
  source_workbook_id text not null,
  authority_generation_id uuid not null,
  admission_generation_id uuid not null,
  deployment_id text not null check (
    deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  deployment_commit text not null check (
    deployment_commit ~ '^[0-9a-f]{40}$'
  ),
  capability_contract text not null,
  capability_ceiling text not null,
  resource_fingerprint text not null check (
    resource_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  certification_fingerprint text not null unique check (
    certification_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  certified_at timestamptz not null default pg_catalog.clock_timestamp()
);

do $annual_platform_certification$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  release production_control.postcutover_application_release_rebindings%rowtype;
  normal_head production_control.postcutover_normal_release_head%rowtype;
  normal_release
    production_control.postcutover_normal_release_rebindings%rowtype;
  binding production_control.maintenance_deployment_capability_bindings%rowtype;
  deployment_value text;
  commit_value text;
  contract_value text;
  ceiling_value text;
  resource_hash text;
  certification_hash text;
begin
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  select value.* into normal_head
  from production_control.postcutover_normal_release_head value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if found then
    select value.* into strict normal_release
    from production_control.postcutover_normal_release_rebindings value
    where value.release_rebind_id = normal_head.release_rebind_id
      and value.release_sequence = normal_head.release_sequence;
    select value.* into strict binding
    from production_control.maintenance_deployment_capability_bindings value
    where value.capability_binding_id = normal_release.capability_binding_id;
    deployment_value := normal_release.deployment_id;
    commit_value := normal_release.deployment_commit;
    contract_value := normal_release.capability_contract;
    ceiling_value := normal_release.capability_ceiling;
  else
    select value.* into release
    from production_control.postcutover_application_release_rebindings value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    if found then
      select value.* into strict binding
      from production_control.maintenance_deployment_capability_bindings value
      where value.capability_binding_id = release.capability_binding_id;
      deployment_value := release.deployment_id;
      commit_value := release.deployment_commit;
      contract_value := release.capability_contract;
      ceiling_value := release.capability_ceiling;
    else
      select value.* into strict binding
      from production_control.maintenance_deployment_capability_bindings value
      where value.epoch_id = activation.authority_generation_id;
      deployment_value := binding.deployment_id;
      commit_value := binding.deployment_commit;
      contract_value := binding.contract_version;
      ceiling_value := binding.capability_ceiling;
    end if;
  end if;
  resource_hash := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'environment', 'PRODUCTION',
      'scopeKey', resource.scope_key,
      'projectRef', resource.project_ref,
      'projectUrl', resource.project_url,
      'sourceWorkbookId', resource.google_workbook_id,
      'platformTournamentId', '2026'
    )
  );
  certification_hash := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion',
        'production-annual-scoring-platform-certification-v1',
      'resourceFingerprint', resource_hash,
      'authorityGenerationId', activation.authority_generation_id,
      'admissionGenerationId', gate.admission_generation_id,
      'deploymentId', deployment_value,
      'deploymentCommit', commit_value,
      'capabilityContract', contract_value,
      'capabilityCeiling', ceiling_value
    )
  );
  insert into production_control.annual_scoring_platform_certifications_v1 (
    scope_key, contract_version, platform_tournament_id, project_ref,
    project_url, source_workbook_id, authority_generation_id,
    admission_generation_id, deployment_id, deployment_commit,
    capability_contract, capability_ceiling, resource_fingerprint,
    certification_fingerprint
  ) values (
    'BAGGER_INV_PRODUCTION',
    'production-annual-scoring-platform-certification-v1', '2026',
    resource.project_ref, resource.project_url, resource.google_workbook_id,
    activation.authority_generation_id, gate.admission_generation_id,
    deployment_value, commit_value, contract_value, ceiling_value,
    resource_hash, certification_hash
  );
end;
$annual_platform_certification$;

create table production_control.annual_scoring_runtime_authorities_v1 (
  runtime_generation_id uuid primary key references
    production_control.future_annual_runtime_generations_v1(
      runtime_generation_id
    ) on delete restrict,
  tournament_id text not null unique references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  platform_tournament_id text not null check (
    platform_tournament_id = '2026'
  ),
  platform_authority_generation_id uuid not null,
  platform_admission_generation_id uuid not null,
  pointer_revision bigint not null check (pointer_revision > 1),
  lifecycle_revision bigint not null check (lifecycle_revision > 0),
  authority_generation_id uuid not null unique,
  admission_generation_id uuid not null unique,
  google_writer_generation_id uuid not null,
  destination_workbook_id text not null check (
    pg_catalog.btrim(destination_workbook_id) <> ''
  ),
  google_target_contract_fingerprint text not null check (
    google_target_contract_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  authority_status text not null check (
    authority_status in ('ACTIVE', 'CLOSED')
  ),
  admission_state text not null check (
    admission_state in ('OPEN', 'CLOSING', 'CLOSED')
  ),
  admission_revision bigint not null check (admission_revision > 0),
  legacy_root_closure_id uuid not null references
    production_control.scoring_admission_closures(closure_id)
    on delete restrict,
  predecessor_tournament_id text not null references
    scoring_authority.tournaments(tournament_id) on delete restrict,
  predecessor_closure_id uuid not null references
    production_control.scoring_admission_closures(closure_id)
    on delete restrict,
  active_closure_id uuid references
    production_control.scoring_admission_closures(closure_id)
    on delete restrict,
  predecessor_boundary_fingerprint text not null check (
    predecessor_boundary_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  activated_by_player_id text not null references
    scoring_authority.players(player_id) on delete restrict,
  activated_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  activated_at timestamptz not null default pg_catalog.clock_timestamp(),
  closed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (authority_status = 'ACTIVE' and closed_at is null)
    or (authority_status = 'CLOSED' and admission_state = 'CLOSED'
      and closed_at is not null)
  ),
  check (
    (admission_state = 'OPEN' and active_closure_id is null)
    or (admission_state in ('CLOSING', 'CLOSED')
      and active_closure_id is not null)
  )
);

create unique index production_annual_single_open_scoring_authority_v1
  on production_control.annual_scoring_runtime_authorities_v1(
    authority_status
  ) where authority_status = 'ACTIVE' and admission_state = 'OPEN';

create table production_control.annual_scoring_transitions_v1 (
  transition_id uuid primary key default extensions.gen_random_uuid(),
  contract_version text not null check (
    contract_version = 'production-annual-scoring-transition-v1'
  ),
  transition_status text not null check (
    transition_status in (
      'PREPARED', 'CLOSING', 'CLOSED', 'COMMITTED', 'ABORTED'
    )
  ),
  predecessor_tournament_id text not null references
    scoring_authority.tournaments(tournament_id) on delete restrict,
  successor_tournament_id text not null references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  expected_pointer_revision bigint not null check (
    expected_pointer_revision > 0
  ),
  predecessor_lifecycle_revision bigint not null check (
    predecessor_lifecycle_revision > 0
  ),
  successor_prepared_lifecycle_revision bigint not null check (
    successor_prepared_lifecycle_revision > 0
  ),
  predecessor_closure_id uuid references
    production_control.scoring_admission_closures(closure_id)
    on delete restrict,
  predecessor_boundary_fingerprint text check (
    predecessor_boundary_fingerprint is null
    or predecessor_boundary_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  runtime_generation_id uuid not null unique references
    production_control.future_annual_runtime_generations_v1(
      runtime_generation_id
    ) on delete restrict,
  authority_generation_id uuid not null unique,
  admission_generation_id uuid not null unique,
  readiness_fingerprint text not null check (
    readiness_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  prepared_by_player_id text not null references
    scoring_authority.players(player_id) on delete restrict,
  prepared_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  prepared_at timestamptz not null default pg_catalog.clock_timestamp(),
  committed_at timestamptz,
  aborted_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (predecessor_tournament_id <> successor_tournament_id),
  check (
    (transition_status in ('PREPARED', 'CLOSING', 'CLOSED')
      and committed_at is null
      and aborted_at is null)
    or (transition_status = 'COMMITTED' and committed_at is not null
      and aborted_at is null)
    or (transition_status = 'ABORTED' and committed_at is null
      and aborted_at is not null)
  ),
  check (
    (transition_status = 'PREPARED' and predecessor_closure_id is null
      and predecessor_boundary_fingerprint is null)
    or (transition_status = 'CLOSING'
      and predecessor_closure_id is not null)
    or (transition_status in ('CLOSED', 'COMMITTED')
      and predecessor_closure_id is not null
      and predecessor_boundary_fingerprint is not null)
    or transition_status = 'ABORTED'
  )
);

create unique index production_annual_single_prepared_transition_v1
  on production_control.annual_scoring_transitions_v1((true))
  where transition_status in ('PREPARED', 'CLOSING', 'CLOSED');

create table production_control.annual_scoring_transition_receipts_v1 (
  operation text not null check (operation in (
    'PREPARE', 'ACTIVATE', 'ABORT', 'CLOSE', 'DRAIN', 'FINALIZE',
    'REOPEN'
  )),
  operation_request_id uuid not null,
  request_payload_hash text not null check (
    request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  response jsonb not null check (
    pg_catalog.jsonb_typeof(response) = 'object'
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (operation, operation_request_id)
);

alter table production_control.annual_scoring_rpc_allowlist_v1
  enable row level security;
alter table production_control.annual_scoring_platform_certifications_v1
  enable row level security;
alter table production_control.annual_scoring_runtime_authorities_v1
  enable row level security;
alter table production_control.annual_scoring_transitions_v1
  enable row level security;
alter table production_control.annual_scoring_transition_receipts_v1
  enable row level security;

create trigger production_annual_scoring_rpc_allowlist_immutable_v1
before update or delete
on production_control.annual_scoring_rpc_allowlist_v1
for each row execute function
  production_control.reject_future_runtime_immutable_v2();

create trigger production_annual_scoring_platform_certification_immutable_v1
before update or delete
on production_control.annual_scoring_platform_certifications_v1
for each row execute function
  production_control.reject_future_runtime_immutable_v2();

create trigger production_annual_scoring_transition_receipt_immutable_v1
before update or delete
on production_control.annual_scoring_transition_receipts_v1
for each row execute function
  production_control.reject_future_runtime_immutable_v2();

create or replace function
  production_control.annual_scoring_unresolved_count_v1(
    target_tournament_id text,
    target_admission_generation_id uuid
  )
returns integer
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.count(*)::integer
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = target_tournament_id
    and lease.admission_generation_id = target_admission_generation_id
    and lease.resolution_state in (
      'ADMITTED', 'WRITE_STARTED', 'AMBIGUOUS', 'PARTIAL_WRITE',
      'LEGACY_UNCLASSIFIED'
    )
$$;

create or replace function
  production_control.annual_scoring_lease_fingerprint_v1(
    target_tournament_id text,
    target_admission_generation_id uuid
  )
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'admission_sequence', lease.admission_sequence,
      'match_id', lease.match_id,
      'operation', lease.operation,
      'resolution_state', lease.resolution_state,
      'provider_readback_fingerprint', lease.provider_readback_fingerprint,
      'resolution_fingerprint', lease.resolution_fingerprint
    ) order by lease.admission_sequence, lease.lease_id), '[]'::jsonb)::text,
    'sha256'
  ), 'hex')
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = target_tournament_id
    and lease.admission_generation_id = target_admission_generation_id
$$;

create or replace function
  production_control.annual_scoring_platform_certification_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  certification
    production_control.annual_scoring_platform_certifications_v1%rowtype;
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  release production_control.postcutover_application_release_rebindings%rowtype;
  normal_head production_control.postcutover_normal_release_head%rowtype;
  normal_release
    production_control.postcutover_normal_release_rebindings%rowtype;
  binding production_control.maintenance_deployment_capability_bindings%rowtype;
  deployment_value text;
  commit_value text;
  contract_value text;
  ceiling_value text;
  resource_hash text;
  certification_hash text;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  select value.* into strict certification
  from production_control.annual_scoring_platform_certifications_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = certification.scope_key;
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = certification.scope_key;
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = certification.platform_tournament_id;
  -- The immutable row is adoption evidence, not a release pin.  Every call
  -- still proves the currently bound release and capability; a legitimate
  -- serial application-release rebind can advance these values, while a stale
  -- or unbound deployment remains rejected.
  select value.* into normal_head
  from production_control.postcutover_normal_release_head value
  where value.scope_key = certification.scope_key;
  if found then
    select value.* into strict normal_release
    from production_control.postcutover_normal_release_rebindings value
    where value.release_rebind_id = normal_head.release_rebind_id
      and value.release_sequence = normal_head.release_sequence;
    select value.* into strict binding
    from production_control.maintenance_deployment_capability_bindings value
    where value.capability_binding_id = normal_release.capability_binding_id;
    deployment_value := normal_release.deployment_id;
    commit_value := normal_release.deployment_commit;
    contract_value := normal_release.capability_contract;
    ceiling_value := normal_release.capability_ceiling;
  else
    select value.* into release
    from production_control.postcutover_application_release_rebindings value
    where value.scope_key = certification.scope_key;
    if found then
      select value.* into strict binding
      from production_control.maintenance_deployment_capability_bindings value
      where value.capability_binding_id = release.capability_binding_id;
      deployment_value := release.deployment_id;
      commit_value := release.deployment_commit;
      contract_value := release.capability_contract;
      ceiling_value := release.capability_ceiling;
    else
      select value.* into strict binding
      from production_control.maintenance_deployment_capability_bindings value
      where value.epoch_id = activation.authority_generation_id;
      deployment_value := binding.deployment_id;
      commit_value := binding.deployment_commit;
      contract_value := binding.contract_version;
      ceiling_value := binding.capability_ceiling;
    end if;
  end if;
  if input->>'deployment_id' is distinct from deployment_value
       or pg_catalog.lower(coalesce(input->>'deployment_commit', ''))
         is distinct from commit_value
       or input->>'deployment_capability_contract'
         is distinct from contract_value
       or input->>'deployment_capability_ceiling'
         is distinct from ceiling_value
       or activation.expected_deployment_commit is distinct from
         commit_value
       or gate.admission_deployment_id is distinct from deployment_value
       or binding.capability_fingerprint is distinct from pg_catalog.encode(
         extensions.digest(binding.capability_manifest::text, 'sha256'), 'hex'
       ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_CURRENT_RELEASE_REQUIRED';
  end if;
  resource_hash := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'environment', 'PRODUCTION',
      'scopeKey', resource.scope_key,
      'projectRef', resource.project_ref,
      'projectUrl', resource.project_url,
      'sourceWorkbookId', resource.google_workbook_id,
      'platformTournamentId', certification.platform_tournament_id
    )
  );
  certification_hash := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion', certification.contract_version,
      'resourceFingerprint', resource_hash,
      'authorityGenerationId', certification.authority_generation_id,
      'admissionGenerationId', certification.admission_generation_id,
      'deploymentId', certification.deployment_id,
      'deploymentCommit', certification.deployment_commit,
      'capabilityContract', certification.capability_contract,
      'capabilityCeiling', certification.capability_ceiling
    )
  );
  if resource.current_tournament_id <> '2026'
     or resource.current_tournament_year <> 2026
     or resource.project_ref is distinct from certification.project_ref
     or resource.project_url is distinct from certification.project_url
     or resource.google_workbook_id is distinct from
       certification.source_workbook_id
     or resource_hash is distinct from certification.resource_fingerprint
     or activation.authority_generation_id is distinct from
       certification.authority_generation_id
     or gate.admission_generation_id is distinct from
       certification.admission_generation_id
     or certification_hash is distinct from
       certification.certification_fingerprint then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_PLATFORM_CERTIFICATION_REQUIRED';
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', certification.contract_version,
    'platformTournamentId', certification.platform_tournament_id,
    'platformAuthorityGenerationId',
      certification.authority_generation_id,
    'platformAdmissionGenerationId',
      certification.admission_generation_id,
    'adoptionDeploymentId', certification.deployment_id,
    'adoptionDeploymentCommit', certification.deployment_commit,
    'adoptionCapabilityContract', certification.capability_contract,
    'adoptionCapabilityCeiling', certification.capability_ceiling,
    'resourceFingerprint', certification.resource_fingerprint,
    'certificationFingerprint', certification.certification_fingerprint
  );
end;
$$;

create or replace function
  public.read_production_scoring_dispatch_certification_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  return production_control.annual_scoring_platform_certification_v1(input);
end;
$$;

-- A server request may resolve the frozen branch before an annual switch and
-- wait behind the exclusive transition.  Re-check the pointer only after the
-- shared lock is held, then delegate to the exact installed 2026 assertion.
-- All successful legacy RPC names, inputs, responses and receipt behavior are
-- therefore unchanged, while a stale resolver cannot write the predecessor.
alter function production_control.assert_production_scoring_runtime(jsonb, text)
  rename to assert_production_scoring_runtime_pre_annual_pointer_fence;

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
  pointer production_control.current_tournament_pointer_v1%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id <> '2026' then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_LEGACY_SCORING_POINTER_CHANGED';
  end if;
  perform production_control.annual_scoring_platform_certification_v1(input);
  perform production_control
    .assert_production_scoring_runtime_pre_annual_pointer_fence(
      input, required_worker
    );
end;
$$;

create or replace function
  production_control.assert_annual_scoring_platform_v1(
    input jsonb,
    required_phase text,
    required_worker text default null
  )
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  release production_control.postcutover_application_release_rebindings%rowtype;
  normal_head production_control.postcutover_normal_release_head%rowtype;
  normal_release
    production_control.postcutover_normal_release_rebindings%rowtype;
  binding production_control.maintenance_deployment_capability_bindings%rowtype;
  deployment_value text;
  commit_value text;
  contract_value text;
  ceiling_value text;
  requested_worker text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    required_worker, ''
  )));
  phase_rank integer := production_control.cutover_phase_rank(required_phase);
begin
  perform production_control.annual_scoring_platform_certification_v1(input);
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  select value.* into normal_head
  from production_control.postcutover_normal_release_head value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if found then
    select value.* into strict normal_release
    from production_control.postcutover_normal_release_rebindings value
    where value.release_rebind_id = normal_head.release_rebind_id
      and value.release_sequence = normal_head.release_sequence;
    select value.* into strict binding
    from production_control.maintenance_deployment_capability_bindings value
    where value.capability_binding_id = normal_release.capability_binding_id;
    deployment_value := normal_release.deployment_id;
    commit_value := normal_release.deployment_commit;
    contract_value := normal_release.capability_contract;
    ceiling_value := normal_release.capability_ceiling;
  else
    select value.* into release
    from production_control.postcutover_application_release_rebindings value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    if found then
      select value.* into strict binding
      from production_control.maintenance_deployment_capability_bindings value
      where value.capability_binding_id = release.capability_binding_id;
      deployment_value := release.deployment_id;
      commit_value := release.deployment_commit;
      contract_value := release.capability_contract;
      ceiling_value := release.capability_ceiling;
    else
      select value.* into strict binding
      from production_control.maintenance_deployment_capability_bindings value
      where value.epoch_id = activation.authority_generation_id;
      deployment_value := binding.deployment_id;
      commit_value := binding.deployment_commit;
      contract_value := binding.contract_version;
      ceiling_value := binding.capability_ceiling;
    end if;
  end if;
  if input->>'deployment_id' is distinct from deployment_value
       or pg_catalog.lower(coalesce(input->>'deployment_commit', ''))
         is distinct from commit_value
       or input->>'deployment_capability_contract'
         is distinct from contract_value
       or input->>'deployment_capability_ceiling'
         is distinct from ceiling_value
       or binding.capability_fingerprint is distinct from pg_catalog.encode(
         extensions.digest(binding.capability_manifest::text, 'sha256'), 'hex'
       ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_PLATFORM_ATTESTATION_REQUIRED';
  end if;
  if activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or activation.active_transition_epoch_id is not null
     or activation.authority_generation_id is distinct from
       nullif(input->>'expected_epoch_id', '')::uuid
     or activation.expected_deployment_commit is distinct from
       pg_catalog.lower(input->>'deployment_commit')
     or resource.current_tournament_id <> '2026'
     or resource.current_tournament_year <> 2026
     or resource.scoring_authority <> 'SUPABASE'
     or phase_rank < 0
     or production_control.cutover_phase_rank(
       coalesce(ceiling_value, binding.capability_ceiling)
     ) < phase_rank
     or gate.authority <> 'SUPABASE'
     or gate.active_epoch_id is distinct from
       activation.authority_generation_id then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_PLATFORM_ATTESTATION_REQUIRED';
  end if;
  if requested_worker <> '' and (
       requested_worker not in (
         'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'
       )
       or not resource.workers_enabled
       or not resource.google_writes_enabled
       or not exists (
         select 1
         from production_control.worker_controls controls
         join production_control.worker_contracts contracts
           using (worker_name)
         where controls.worker_name = requested_worker
           and controls.enabled and controls.google_writes_allowed
           and contracts.operation_allowed
           and contracts.requires_google_write
           and not contracts.authoritative_write_allowed
           and coalesce(controls.metadata->>'activation_epoch_id', '') =
             activation.authority_generation_id::text
           and coalesce(controls.metadata->>'deployment_commit', '') =
             activation.expected_deployment_commit
       )
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_WORKER_NOT_ENABLED';
  end if;
exception
  when invalid_text_representation then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_PLATFORM_ATTESTATION_REQUIRED';
end;
$$;

create or replace function
  production_control.assert_annual_scoring_runtime_v1(
    input jsonb,
    expected_operation text,
    required_worker text default null
  )
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  operation production_control.annual_scoring_rpc_allowlist_v1%rowtype;
  active_generation_count integer;
  readiness jsonb;
  certified_writer jsonb;
begin
  -- The shared transaction lock is held through the invoked scoring RPC.
  -- Annual close/transition/abort take the exclusive counterpart of this
  -- exact legacy key, so an admitted mutation cannot cross the boundary.
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into operation
  from production_control.annual_scoring_rpc_allowlist_v1 value
  where value.operation_name = expected_operation and value.enabled;
  if operation.operation_name is null
     or input->>'annual_scoring_dispatch_contract'
       is distinct from 'production-annual-scoring-dispatch-v1'
     or input->>'annual_scoring_operation'
       is distinct from operation.operation_name
     or coalesce(required_worker, '') is distinct from
       coalesce(operation.required_worker, '') then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ANNUAL_SCORING_OPERATION_NOT_ALLOWLISTED';
  end if;
  perform production_control.assert_annual_scoring_platform_v1(
    input, operation.required_phase, operation.required_worker
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id = '2026' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_TARGET_REQUIRED';
  end if;
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = pointer.tournament_id;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE';
  select value.* into strict annual
  from production_control.annual_scoring_runtime_authorities_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.runtime_generation_id = generation.runtime_generation_id;
  if pg_catalog.to_regclass(
       'production_control.future_google_writer_targets_v2'
     ) is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_GOOGLE_DESTINATION_REQUIRED';
  end if;
  execute $writer$
    select pg_catalog.jsonb_build_object(
      'writerGenerationId', value.writer_generation_id,
      'destinationWorkbookId', value.destination_workbook_id,
      'targetContractFingerprint', value.target_contract_fingerprint
    )
    from production_control.future_google_writer_targets_v2 value
    where value.tournament_id = $1 and value.contract_status = 'CERTIFIED'
  $writer$ into certified_writer using pointer.tournament_id;
  select pg_catalog.count(*)::integer into active_generation_count
  from production_control.future_annual_runtime_generations_v1 value
  where value.generation_status = 'ACTIVE';
  if input->>'expected_current_tournament_id'
       is distinct from pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or input->>'expected_runtime_generation_id'
       is distinct from generation.runtime_generation_id::text
     or input->>'expected_annual_authority_generation_id'
       is distinct from generation.authority_generation_id::text
     or input->>'expected_annual_admission_generation_id'
       is distinct from generation.admission_generation_id::text
     or generation.authority_generation_id
       is distinct from annual.authority_generation_id
     or generation.admission_generation_id
       is distinct from annual.admission_generation_id
     or certified_writer is null
     or input->>'expected_google_writer_generation_id' is distinct from
       certified_writer->>'writerGenerationId'
     or input->>'annual_destination_workbook_id' is distinct from
       certified_writer->>'destinationWorkbookId'
     or input->>'expected_google_target_contract_fingerprint' is distinct from
       certified_writer->>'targetContractFingerprint'
     or annual.google_writer_generation_id::text is distinct from
       certified_writer->>'writerGenerationId'
     or annual.destination_workbook_id is distinct from
       certified_writer->>'destinationWorkbookId'
     or annual.google_target_contract_fingerprint is distinct from
       certified_writer->>'targetContractFingerprint'
     or generation.pointer_revision <> pointer.pointer_revision
     or annual.pointer_revision <> pointer.pointer_revision
     or active_generation_count <> 1
     or catalog.lifecycle <> 'ACTIVE'
     or catalog.lifecycle_revision <> pointer.lifecycle_revision
     or annual.lifecycle_revision <> pointer.lifecycle_revision
     or annual.platform_tournament_id <> '2026'
     or annual.platform_authority_generation_id is distinct from
       nullif(input->>'expected_epoch_id', '')::uuid
     or annual.platform_admission_generation_id is distinct from (
       select value.admission_generation_id
       from production_control.annual_scoring_platform_certifications_v1 value
       where value.scope_key = 'BAGGER_INV_PRODUCTION'
     )
     or annual.authority_status not in ('ACTIVE', 'CLOSED')
     or (operation.operation_class = 'MUTATION' and (
       annual.authority_status <> 'ACTIVE'
       or annual.admission_state <> 'OPEN'
     ))
     or (operation.operation_class = 'WORKER' and (
       annual.authority_status <> 'ACTIVE'
       or annual.admission_state not in ('OPEN', 'CLOSING')
     ))
     or not exists (
       select 1 from scoring_authority.tournaments tournament_value
       where tournament_value.tournament_id = pointer.tournament_id
         and tournament_value.scoring_authority = 'SUPABASE'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_RUNTIME_REQUIRED';
  end if;
  if operation.operation_name = 'mutate_production_match_control'
     and pg_catalog.upper(coalesce(input->>'operation', '')) = 'MARK_LIVE'
  then
    readiness :=
      production_control.assert_future_production_match_scoring_ready_v1(
        input->>'match_id', pointer.tournament_id
      );
    if coalesce((readiness->>'ready')::boolean, false) is not true then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ANNUAL_MARK_LIVE_READINESS_REQUIRED';
    end if;
  end if;
  return pointer.tournament_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_RUNTIME_REQUIRED';
end;
$$;

-- Replace only the internal future assertion installed by 067. The frozen
-- public 2026 RPC definitions remain byte-for-byte untouched; their central
-- assertion now delegates through the shared-pointer fence installed above.
create or replace function
  production_control.assert_future_production_scoring_runtime_v1(
    input jsonb,
    required_worker text default null
  )
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return production_control.assert_annual_scoring_runtime_v1(
    input, input->>'annual_scoring_operation', required_worker
  );
end;
$$;

create or replace function public.dispatch_production_annual_scoring_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  operation production_control.annual_scoring_rpc_allowlist_v1%rowtype;
  result_value jsonb;
begin
  select value.* into operation
  from production_control.annual_scoring_rpc_allowlist_v1 value
  where value.operation_name = input->>'annual_scoring_operation'
    and value.enabled;
  if operation.operation_name is null
     or pg_catalog.to_regprocedure(operation.target_rpc || '(jsonb)') is null
  then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ANNUAL_SCORING_OPERATION_NOT_ALLOWLISTED';
  end if;
  perform production_control.assert_annual_scoring_runtime_v1(
    input, operation.operation_name, operation.required_worker
  );
  execute pg_catalog.format('select %s($1)', operation.target_rpc)
    into strict result_value using input;
  return result_value;
end;
$$;

-- The 066 split CLOSE/ACTIVATE branches must never become reachable merely
-- because annual readiness is installed.  Preserve the old scope check under
-- an internal name and fail the two unsafe actions before the legacy body can
-- write any lifecycle, generation, or pointer row.
alter function production_control.assert_future_runtime_service_scope_v2(
  jsonb, boolean, boolean
) rename to assert_future_runtime_service_scope_v2_pre_annual_scoring_fence;

create or replace function production_control.assert_future_runtime_service_scope_v2(
  input jsonb,
  require_director boolean default true,
  require_owner boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(input->>'action', '')))
       in ('ACTIVATE_TOURNAMENT', 'CLOSE_TOURNAMENT') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_TRANSITION_REQUIRED';
  end if;
  perform production_control
    .assert_future_runtime_service_scope_v2_pre_annual_scoring_fence(
      input, require_director, require_owner
    );
end;
$$;

-- Annual transition operations are governed by the immutable Production
-- Owner root rather than by the mutable current-tournament membership. The
-- predecessor is supplied explicitly and compared under the exclusive
-- admission lock by each transition stage. This separation is required for
-- an exact ACTIVATE receipt replay after the pointer has committed and for a
-- later 2027 -> 2028 transition without cloning root governance facts.
create or replace function
  production_control.assert_annual_transition_platform_owner_v1(input jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  scope production_control.resource_scope%rowtype;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', input->>'actor_player_id', ''
  )));
  actor_auth uuid;
begin
  begin
    perform production_control.assert_production_service_role();
  exception when others then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_SERVICE_ROLE_REQUIRED';
  end;
  select value.* into strict scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if input->>'contract_version'
       is distinct from 'production-future-runtime-activation-v2'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'project_ref' is distinct from scope.project_ref
     or input->>'project_url' is distinct from scope.project_url
     or input->>'source_workbook_id' is distinct from scope.google_workbook_id
     or input->>'project_ref' ~* '(preview|staging|test)'
     or input->>'source_workbook_id' ~* '(preview|staging|test)'
     or input->>'tournament_id' is distinct from '2026'
     or coalesce((input->>'tournament_year')::integer, -1) <> 2026
     or input#>>'{authorization,tournament_id}' is distinct from '2026'
     or input#>>'{authorization,role}' is distinct from 'DIRECTOR'
     or actor_player !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ANNUAL_SCORING_PLATFORM_OWNER_REQUIRED';
  end if;
  begin
    actor_auth := coalesce(
      nullif(input#>>'{authorization,auth_user_id}', ''),
      nullif(input->>'actor_auth_user_id', '')
    )::uuid;
  exception when others then
    actor_auth := null;
  end;
  if actor_auth is null
     or (input ? 'actor_player_id' and pg_catalog.upper(pg_catalog.btrim(
       input->>'actor_player_id'
     )) is distinct from actor_player)
     or (input ? 'actor_auth_user_id' and pg_catalog.lower(pg_catalog.btrim(
       input->>'actor_auth_user_id'
     )) is distinct from actor_auth::text)
     or not exists (
       select 1
       from participant_identity.user_player_links link
       where link.auth_user_id = actor_auth
         and link.player_id = actor_player
         and link.status = 'ACTIVE'
         and link.revoked_at is null
     ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ANNUAL_SCORING_PLATFORM_OWNER_REQUIRED';
  end if;
  begin
    perform production_control.assert_access_governance_owner_v1(
      '2026', actor_player, actor_auth
    );
  exception when others then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ANNUAL_SCORING_PLATFORM_OWNER_REQUIRED';
  end;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ANNUAL_SCORING_PLATFORM_OWNER_REQUIRED';
end;
$$;

create or replace function
  production_control.annual_scoring_predecessor_certificate_v1(
    target_tournament_id text
  )
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  legacy_root production_control.scoring_admission_closures%rowtype;
  authority_generation uuid;
  admission_generation uuid;
  blocker_values jsonb := '[]'::jsonb;
  fingerprint_value text;
  unresolved_leases integer;
  legacy_blockers integer := 0;
  post_close_lease_count integer := 0;
  unresolved_outbox integer;
  unresolved_archive integer;
begin
  if target_tournament_id = '2026' then
    select value.* into strict activation
    from production_control.cutover_activation_state value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    select value.* into strict gate
    from scoring_authority.ingress_gates value
    where value.tournament_id = '2026';
    select value.* into closure
    from production_control.scoring_admission_closures value
    where value.closure_id = gate.active_closure_id;
    authority_generation := activation.authority_generation_id;
    admission_generation := gate.admission_generation_id;
    if closure.closure_kind = 'SUPABASE_INGRESS' then
      select value.* into legacy_root
      from production_control.scoring_admission_closures value
      where value.closure_id = closure.prior_legacy_closure_id;
    else
      legacy_root := closure;
    end if;
    if gate.state <> 'PAUSED' or gate.admission_state <> 'CLOSED'
       or closure.closure_id is null
       or closure.tournament_id <> '2026'
       or closure.closure_kind <> 'SUPABASE_INGRESS'
       or closure.authority <> 'SUPABASE'
       or closure.status <> 'CLOSED'
       or closure.authority_generation_id is distinct from
         authority_generation
       or closure.admission_generation_id is distinct from
         admission_generation
       or legacy_root.closure_kind <> 'LEGACY_ADMISSION'
       or legacy_root.status <> 'CONSUMED' then
      blocker_values := blocker_values || pg_catalog.jsonb_build_array(
        'PREDECESSOR_SCORING_ADMISSION_NOT_CLOSED'
      );
    end if;
  else
    select value.* into annual
    from production_control.annual_scoring_runtime_authorities_v1 value
    where value.tournament_id = target_tournament_id;
    select value.* into closure
    from production_control.scoring_admission_closures value
    where value.closure_id = annual.active_closure_id;
    select value.* into legacy_root
    from production_control.scoring_admission_closures value
    where value.closure_id = annual.legacy_root_closure_id;
    authority_generation := annual.authority_generation_id;
    admission_generation := annual.admission_generation_id;
    if annual.runtime_generation_id is null
       or annual.authority_status <> 'CLOSED'
       or annual.admission_state <> 'CLOSED'
       or closure.closure_id is null
       or closure.tournament_id <> target_tournament_id
       or closure.closure_kind <> 'SUPABASE_INGRESS'
       or closure.authority <> 'SUPABASE'
       or closure.status <> 'CLOSED'
       or closure.authority_generation_id is distinct from
         authority_generation
       or closure.admission_generation_id is distinct from
         admission_generation
       or legacy_root.closure_kind <> 'LEGACY_ADMISSION'
       or legacy_root.status <> 'CONSUMED' then
      blocker_values := blocker_values || pg_catalog.jsonb_build_array(
        'PREDECESSOR_SCORING_ADMISSION_NOT_CLOSED'
      );
    end if;
  end if;
  unresolved_leases :=
    production_control.annual_scoring_unresolved_count_v1(
      target_tournament_id, admission_generation
    );
  if target_tournament_id = '2026' then
    legacy_blockers :=
      production_control.scoring_admission_legacy_blocker_count(
        gate.admission_enforced_at
      );
  end if;
  select pg_catalog.count(*)::integer into post_close_lease_count
  from scoring_authority.scoring_ingress_leases value
  where value.tournament_id = target_tournament_id
    and value.admission_generation_id = admission_generation
    and value.admission_sequence > closure.lease_high_watermark;
  select pg_catalog.count(*)::integer into unresolved_outbox
  from scoring_authority.google_outbox_events value
  where value.tournament_id = target_tournament_id
    and value.status <> 'DELIVERED';
  select pg_catalog.count(*)::integer into unresolved_archive
  from scoring_authority.scorecard_archive_jobs value
  where value.tournament_id = target_tournament_id
    and value.status not in ('VERIFIED', 'SUPERSEDED');
  if unresolved_leases <> 0 or legacy_blockers <> 0
     or post_close_lease_count <> 0 or unresolved_outbox <> 0
     or unresolved_archive <> 0 then
    blocker_values := blocker_values || pg_catalog.jsonb_build_array(
      'PREDECESSOR_SCORING_DRAIN_INCOMPLETE'
    );
  end if;
  if not exists (
       select 1 from scoring_authority.matches value
       where value.tournament_id = target_tournament_id
     ) or exists (
       select 1 from scoring_authority.matches value
       where value.tournament_id = target_tournament_id
         and (value.status <> 'FINAL' or not value.scorecard_complete
           or value.unresolved_mutations <> 0)
     ) then
    blocker_values := blocker_values || pg_catalog.jsonb_build_array(
      'PREDECESSOR_FINAL_SCORING_FACTS_REQUIRED'
    );
  end if;
  fingerprint_value := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-annual-scoring-close-certificate-v1',
      'tournamentId', target_tournament_id,
      'closureId', closure.closure_id,
      'legacyRootClosureId', legacy_root.closure_id,
      'authorityGenerationId', authority_generation,
      'admissionGenerationId', admission_generation,
      'closedAdmissionRevision', closure.closed_admission_revision,
      'leaseSetFingerprint', closure.lease_set_fingerprint,
      'matchRevisions', closure.supabase_match_revisions,
      'googleCheckpoints', closure.google_checkpoints,
      'unresolvedLeases', unresolved_leases,
      'legacyAdmissionBlockers', legacy_blockers,
      'postCloseLeaseCount', post_close_lease_count,
      'unresolvedOutbox', unresolved_outbox,
      'unresolvedArchive', unresolved_archive
    )
  );
  return pg_catalog.jsonb_build_object(
    'certified', pg_catalog.jsonb_array_length(blocker_values) = 0,
    'tournamentId', target_tournament_id,
    'closureId', closure.closure_id,
    'legacyRootClosureId', legacy_root.closure_id,
    'authorityGenerationId', authority_generation,
    'admissionGenerationId', admission_generation,
    'legacyAdmissionBlockers', legacy_blockers,
    'postCloseLeaseCount', post_close_lease_count,
    'fingerprint', fingerprint_value,
    'blockers', blocker_values
  );
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'certified', false, 'tournamentId', target_tournament_id,
    'fingerprint', null,
    'blockers', pg_catalog.jsonb_build_array(
      'PREDECESSOR_SCORING_CLOSE_CERTIFICATE_UNAVAILABLE'
    )
  );
end;
$$;

create or replace function
  production_control.annual_scoring_transition_readiness_v1(
    target_tournament_id text
  )
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  baseline jsonb;
  certificate jsonb;
  blockers jsonb;
  fingerprint_value text;
begin
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  baseline := production_control.future_runtime_readiness_v2(
    target_tournament_id
  );
  select coalesce(pg_catalog.jsonb_agg(value), '[]'::jsonb)
    into blockers
  from pg_catalog.jsonb_array_elements(
    coalesce(baseline->'blockers', '[]'::jsonb)
  ) value
  where value->>'code' <>
    'FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED';
  certificate :=
    production_control.annual_scoring_predecessor_certificate_v1(
      pointer.tournament_id
    );
  if coalesce((certificate->>'certified')::boolean, false) is not true then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED',
        'section', 'Activation',
        'message', 'The current tournament scoring close and drain boundary is not certified.',
        'details', certificate->'blockers'
      )
    );
  end if;
  fingerprint_value := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-annual-scoring-transition-readiness-v1',
      'targetTournamentId', target_tournament_id,
      'predecessorTournamentId', pointer.tournament_id,
      'expectedPointerRevision', pointer.pointer_revision,
      'baselineFingerprint', baseline->>'fingerprint',
      'predecessorBoundaryFingerprint', certificate->>'fingerprint',
      'blockers', blockers
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion',
      'production-annual-scoring-transition-readiness-v1',
    'targetTournamentId', target_tournament_id,
    'predecessorTournamentId', pointer.tournament_id,
    'expectedPointerRevision', pointer.pointer_revision,
    'ready', pg_catalog.jsonb_array_length(blockers) = 0,
    'fingerprint', fingerprint_value,
    'predecessorCertificate', certificate,
    'blockers', blockers
  );
end;
$$;

create or replace function
  production_control.lookup_annual_scoring_receipt_v1(
    operation_value text,
    input jsonb
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash', ''
  )));
  computed_hash text := production_control.future_runtime_hash_v2(
    input - 'request_payload_hash'
  );
  receipt production_control.annual_scoring_transition_receipts_v1%rowtype;
begin
  begin request_id := (input->>'operation_request_id')::uuid;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ANNUAL_SCORING_OPERATION_REQUEST_INVALID';
  end;
  if declared_hash !~ '^[0-9a-f]{64}$'
     or declared_hash <> computed_hash then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ANNUAL_SCORING_PAYLOAD_HASH_INVALID';
  end if;
  select value.* into receipt
  from production_control.annual_scoring_transition_receipts_v1 value
  where value.operation = operation_value
    and value.operation_request_id = request_id;
  if receipt.operation_request_id is null then return null; end if;
  if receipt.request_payload_hash <> computed_hash then
    raise exception using errcode = '23505',
      message = 'PRODUCTION_ANNUAL_SCORING_IDEMPOTENCY_CONFLICT';
  end if;
  return receipt.response || pg_catalog.jsonb_build_object(
    'idempotent', true
  );
end;
$$;

create or replace function
  production_control.store_annual_scoring_receipt_v1(
    operation_value text,
    input jsonb,
    response_value jsonb
  )
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  insert into production_control.annual_scoring_transition_receipts_v1 (
    operation, operation_request_id, request_payload_hash, response
  ) values (
    operation_value, (input->>'operation_request_id')::uuid,
    production_control.future_runtime_hash_v2(
      input - 'request_payload_hash'
    ), response_value
  )
$$;

create or replace function
  public.read_production_annual_scoring_transition_readiness_v1(
    input jsonb
  )
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  perform production_control.assert_annual_transition_platform_owner_v1(input);
  return production_control.annual_scoring_transition_readiness_v1(
    input->>'target_tournament_id'
  );
end;
$$;

create or replace function
  production_control.close_annual_scoring_predecessor_v1(
    input jsonb,
    target_tournament_id text
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  legacy_root production_control.scoring_admission_closures%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(
    input#>>'{authorization,player_id}'
  ));
  close_fingerprint text := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-annual-scoring-transition-v1',
      'operationRequestId', input->>'operation_request_id',
      'requestPayloadHash', input->>'request_payload_hash',
      'stage', 'CLOSE_PREDECESSOR'
    )
  );
  close_input jsonb;
  high_watermark bigint;
  unresolved integer;
  response_value jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  if pointer.tournament_id <> target_tournament_id
     or input->>'expected_current_tournament_id' is distinct from
       pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or coalesce(input->>'start_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'final_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'reconciliation_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or not exists (
       select 1 from scoring_authority.matches value
       where value.tournament_id = pointer.tournament_id
     )
     or exists (
       select 1 from scoring_authority.matches value
       where value.tournament_id = pointer.tournament_id
         and (value.status <> 'FINAL' or not value.scorecard_complete
           or value.unresolved_mutations <> 0)
     )
     or exists (
       select 1 from scoring_authority.google_outbox_events value
       where value.tournament_id = pointer.tournament_id
         and value.status <> 'DELIVERED'
     )
     or exists (
       select 1 from scoring_authority.scorecard_archive_jobs value
       where value.tournament_id = pointer.tournament_id
         and value.status not in ('VERIFIED', 'SUPERSEDED')
     ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_NOT_CLOSEABLE';
  end if;

  if pointer.tournament_id = '2026' then
    select value.* into strict activation
    from production_control.cutover_activation_state value
    where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
    select value.* into strict gate
    from scoring_authority.ingress_gates value
    where value.tournament_id = '2026' for update;
    if coalesce((input->>'expected_platform_activation_revision')::bigint, -1)
         <> activation.activation_revision
       or input->>'expected_platform_authority_generation_id'
         is distinct from activation.authority_generation_id::text
       or input->>'expected_platform_admission_generation_id'
         is distinct from gate.admission_generation_id::text
       or coalesce((input->>'expected_platform_admission_revision')::bigint, -1)
         <> gate.admission_revision then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_REVISION_CONFLICT';
    end if;
    close_input := input || pg_catalog.jsonb_build_object(
      'actor_id', actor_player,
      'expected_authority', 'SUPABASE',
      'expected_activation_revision', activation.activation_revision,
      'expected_authority_generation', activation.authority_generation_id,
      'expected_admission_generation', gate.admission_generation_id,
      'expected_admission_revision', gate.admission_revision,
      'request_fingerprint', close_fingerprint
    );
    return public.close_production_scoring_admission(close_input);
  end if;

  select value.* into strict annual
  from production_control.annual_scoring_runtime_authorities_v1 value
  where value.tournament_id = pointer.tournament_id for update;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.runtime_generation_id = annual.runtime_generation_id
    and value.generation_status = 'ACTIVE' for update;
  select value.* into strict legacy_root
  from production_control.scoring_admission_closures value
  where value.closure_id = annual.legacy_root_closure_id;
  if input->>'expected_predecessor_runtime_generation_id' is distinct from
       generation.runtime_generation_id::text
     or input->>'expected_predecessor_annual_authority_generation_id'
       is distinct from
       annual.authority_generation_id::text
     or input->>'expected_predecessor_annual_admission_generation_id'
       is distinct from
       annual.admission_generation_id::text
     or coalesce(
       (input->>'expected_predecessor_annual_admission_revision')::bigint, -1
     )
       <> annual.admission_revision
     or annual.authority_status <> 'ACTIVE'
     or annual.admission_state <> 'OPEN'
     or annual.active_closure_id is not null
     or generation.admission_generation_id is distinct from
       annual.admission_generation_id then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_REVISION_CONFLICT';
  end if;
  select coalesce(pg_catalog.max(value.admission_sequence), 0)
    into high_watermark
  from scoring_authority.scoring_ingress_leases value
  where value.tournament_id = pointer.tournament_id
    and value.admission_generation_id = annual.admission_generation_id;
  insert into production_control.scoring_admission_closures (
    closure_kind, prior_legacy_closure_id, tournament_id, authority,
    authority_generation_id, admission_generation_id, deployment_id,
    status, opening_admission_revision, closing_admission_revision,
    lease_high_watermark, start_source_fingerprint,
    external_fence_evidence_id, google_writer_provider_fence_id,
    google_writer_provider_verification_id, close_request_fingerprint,
    close_payload_hash, actor_id
  ) values (
    'SUPABASE_INGRESS', legacy_root.closure_id, pointer.tournament_id,
    'SUPABASE', annual.authority_generation_id,
    annual.admission_generation_id, legacy_root.deployment_id,
    'CLOSING', annual.admission_revision, annual.admission_revision + 1,
    high_watermark, pg_catalog.lower(input->>'start_source_fingerprint'),
    legacy_root.external_fence_evidence_id,
    legacy_root.google_writer_provider_fence_id,
    legacy_root.google_writer_provider_verification_id,
    close_fingerprint,
    production_control.future_runtime_hash_v2(
      input - 'request_payload_hash'
    ), actor_player
  ) returning * into closure;
  update scoring_authority.scoring_ingress_leases set
    close_fence_id = closure.closure_id
  where tournament_id = pointer.tournament_id
    and admission_generation_id = annual.admission_generation_id
    and resolution_state in (
      'ADMITTED', 'WRITE_STARTED', 'AMBIGUOUS', 'PARTIAL_WRITE',
      'LEGACY_UNCLASSIFIED'
    );
  unresolved := production_control.annual_scoring_unresolved_count_v1(
    pointer.tournament_id, annual.admission_generation_id
  );
  update production_control.annual_scoring_runtime_authorities_v1 set
    admission_state = 'CLOSING',
    admission_revision = admission_revision + 1,
    active_closure_id = closure.closure_id,
    updated_at = pg_catalog.clock_timestamp()
  where runtime_generation_id = annual.runtime_generation_id;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_CLOSING',
    'closure_id', closure.closure_id,
    'authority_generation_id', annual.authority_generation_id,
    'admission_generation_id', annual.admission_generation_id,
    'admission_revision', annual.admission_revision + 1,
    'admission_state', 'CLOSING',
    'active_or_unresolved_leases', unresolved,
    'lease_high_watermark', closure.lease_high_watermark,
    'idempotent', false
  );
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_REVISION_CONFLICT';
end;
$$;

create or replace function
  production_control.advance_annual_scoring_transition_v1(
    target_transition_id uuid,
    input jsonb
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  transition_value production_control.annual_scoring_transitions_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(
    input#>>'{authorization,player_id}'
  ));
  actor_auth uuid := (input#>>'{authorization,auth_user_id}')::uuid;
  drain_input jsonb;
  drain_response jsonb;
  finalize_input jsonb;
  finalize_response jsonb;
  certificate jsonb;
  readiness jsonb;
  lease_fingerprint text;
  revisions jsonb;
  checkpoints jsonb;
  unresolved integer;
  unresolved_outbox integer;
  unresolved_archive integer;
  post_close_count integer;
  next_lifecycle_revision bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict transition_value
  from production_control.annual_scoring_transitions_v1 value
  where value.transition_id = target_transition_id for update;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict target
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = transition_value.successor_tournament_id
  for update;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.runtime_generation_id = transition_value.runtime_generation_id
  for update;
  select value.* into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = transition_value.predecessor_closure_id
  for update;
  if transition_value.transition_status = 'CLOSED' then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_CLOSED',
      'transitionId', transition_value.transition_id,
      'predecessorTournamentId', transition_value.predecessor_tournament_id,
      'successorTournamentId', transition_value.successor_tournament_id,
      'expectedPointerRevision', transition_value.expected_pointer_revision,
      'runtimeGenerationId', transition_value.runtime_generation_id,
      'authorityGenerationId', transition_value.authority_generation_id,
      'admissionGenerationId', transition_value.admission_generation_id,
      'readinessFingerprint', transition_value.readiness_fingerprint,
      'pointerChanged', false, 'predecessorClosed', true,
      'successorActivated', false, 'idempotent', true
    );
  end if;
  if transition_value.transition_status <> 'CLOSING'
     or pointer.tournament_id <> transition_value.predecessor_tournament_id
     or pointer.pointer_revision <> transition_value.expected_pointer_revision
     or input->>'expected_current_tournament_id' is distinct from
       pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or target.lifecycle <> 'READY_FOR_ACTIVATION'
     or generation.generation_status <> 'PREPARED'
     or closure.status not in ('CLOSING', 'CLOSED') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_DRAIN_REVISION_CONFLICT';
  end if;

  if pointer.tournament_id = '2026' then
    select value.* into strict activation
    from production_control.cutover_activation_state value
    where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
    select value.* into strict gate
    from scoring_authority.ingress_gates value
    where value.tournament_id = '2026' for update;
    if closure.status = 'CLOSING' then
      drain_input := input || pg_catalog.jsonb_build_object(
        'actor_id', actor_player,
        'closure_id', closure.closure_id,
        'external_fence_evidence_id', closure.external_fence_evidence_id,
        'expected_activation_revision', activation.activation_revision,
        'expected_authority_generation', activation.authority_generation_id,
        'expected_admission_generation', gate.admission_generation_id,
        'expected_admission_revision', gate.admission_revision,
        'request_fingerprint', production_control.future_runtime_hash_v2(
          pg_catalog.jsonb_build_object(
            'operationRequestId', input->>'operation_request_id',
            'requestPayloadHash', input->>'request_payload_hash',
            'transitionId', target_transition_id,
            'stage', 'DRAIN_PREDECESSOR'
          )
        )
      );
      drain_response := public.drain_production_scoring_admission(drain_input);
      if coalesce((drain_response->>'ready_to_finalize')::boolean, false)
           is not true then
        return pg_catalog.jsonb_build_object(
          'ok', true,
          'code', 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_DRAINING',
          'transitionId', target_transition_id,
          'predecessorTournamentId', pointer.tournament_id,
          'successorTournamentId', target.tournament_id,
          'closureId', closure.closure_id,
          'activeOrUnresolvedLeases',
            coalesce((drain_response->>'active_or_unresolved_leases')::integer, 0),
          'pointerChanged', false, 'predecessorClosed', false,
          'successorActivated', false, 'idempotent', false
        );
      end if;
      select value.* into strict activation
      from production_control.cutover_activation_state value
      where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
      select value.* into strict gate
      from scoring_authority.ingress_gates value
      where value.tournament_id = '2026' for update;
      revisions := production_control.current_match_revisions('2026');
      checkpoints := production_control.current_google_checkpoints('2026');
      finalize_input := input || pg_catalog.jsonb_build_object(
        'actor_id', actor_player,
        'closure_id', closure.closure_id,
        'external_fence_evidence_id', closure.external_fence_evidence_id,
        'expected_activation_revision', activation.activation_revision,
        'expected_authority_generation', activation.authority_generation_id,
        'expected_admission_generation', gate.admission_generation_id,
        'expected_admission_revision', gate.admission_revision,
        'boundary_captured_at', pg_catalog.clock_timestamp(),
        'lease_set_fingerprint', drain_response->>'lease_set_fingerprint',
        'supabase_match_revisions', revisions,
        'google_checkpoints', checkpoints,
        'request_fingerprint', production_control.future_runtime_hash_v2(
          pg_catalog.jsonb_build_object(
            'operationRequestId', input->>'operation_request_id',
            'requestPayloadHash', input->>'request_payload_hash',
            'transitionId', target_transition_id,
            'stage', 'FINALIZE_PREDECESSOR'
          )
        )
      );
      finalize_response :=
        public.finalize_production_scoring_admission(finalize_input);
    end if;
  else
    select value.* into strict annual
    from production_control.annual_scoring_runtime_authorities_v1 value
    where value.tournament_id = pointer.tournament_id for update;
    perform value.lease_id
    from scoring_authority.scoring_ingress_leases value
    where value.tournament_id = pointer.tournament_id
      and value.admission_generation_id = annual.admission_generation_id
    order by value.lease_id for update;
    unresolved := production_control.annual_scoring_unresolved_count_v1(
      pointer.tournament_id, annual.admission_generation_id
    );
    select pg_catalog.count(*)::integer into unresolved_outbox
    from scoring_authority.google_outbox_events value
    where value.tournament_id = pointer.tournament_id
      and value.status <> 'DELIVERED';
    select pg_catalog.count(*)::integer into unresolved_archive
    from scoring_authority.scorecard_archive_jobs value
    where value.tournament_id = pointer.tournament_id
      and value.status not in ('VERIFIED', 'SUPERSEDED');
    select pg_catalog.count(*)::integer into post_close_count
    from scoring_authority.scoring_ingress_leases value
    where value.tournament_id = pointer.tournament_id
      and value.admission_generation_id = annual.admission_generation_id
      and value.admission_sequence > closure.lease_high_watermark;
    update production_control.annual_scoring_runtime_authorities_v1 set
      admission_revision = admission_revision + 1,
      updated_at = pg_catalog.clock_timestamp()
    where runtime_generation_id = annual.runtime_generation_id
    returning * into annual;
    if unresolved <> 0 or unresolved_outbox <> 0
       or unresolved_archive <> 0 or post_close_count <> 0 then
      return pg_catalog.jsonb_build_object(
        'ok', true,
        'code', 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_DRAINING',
        'transitionId', target_transition_id,
        'predecessorTournamentId', pointer.tournament_id,
        'successorTournamentId', target.tournament_id,
        'closureId', closure.closure_id,
        'activeOrUnresolvedLeases', unresolved,
        'unresolvedOutbox', unresolved_outbox,
        'unresolvedArchive', unresolved_archive,
        'postCloseLeaseCount', post_close_count,
        'pointerChanged', false, 'predecessorClosed', false,
        'successorActivated', false, 'idempotent', false
      );
    end if;
    lease_fingerprint :=
      production_control.annual_scoring_lease_fingerprint_v1(
        pointer.tournament_id, annual.admission_generation_id
      );
    revisions := production_control.current_match_revisions(
      pointer.tournament_id
    );
    checkpoints := production_control.current_google_checkpoints(
      pointer.tournament_id
    );
    update production_control.scoring_admission_closures set
      status = 'CLOSED',
      closed_admission_revision = annual.admission_revision + 1,
      final_source_fingerprint =
        pg_catalog.lower(input->>'final_source_fingerprint'),
      reconciliation_fingerprint =
        pg_catalog.lower(input->>'reconciliation_fingerprint'),
      lease_set_fingerprint = lease_fingerprint,
      supabase_match_revisions = revisions,
      google_checkpoints = checkpoints,
      closed_at = pg_catalog.clock_timestamp()
    where closure_id = closure.closure_id
      and status = 'CLOSING'
    returning * into closure;
    if not found then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_ANNUAL_SCORING_DRAIN_REVISION_CONFLICT';
    end if;
    update production_control.annual_scoring_runtime_authorities_v1 set
      authority_status = 'CLOSED', admission_state = 'CLOSED',
      admission_revision = admission_revision + 1,
      closed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where runtime_generation_id = annual.runtime_generation_id;
  end if;

  certificate :=
    production_control.annual_scoring_predecessor_certificate_v1(
      pointer.tournament_id
    );
  readiness := production_control.annual_scoring_transition_readiness_v1(
    target.tournament_id
  );
  if coalesce((certificate->>'certified')::boolean, false) is not true
     or coalesce((readiness->>'ready')::boolean, false) is not true then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_CERTIFICATION_REQUIRED',
      detail = coalesce((readiness->'blockers')::text, '[]');
  end if;
  update production_control.future_annual_runtime_generations_v1 set
    readiness_fingerprint = readiness->>'fingerprint',
    runtime_revision = runtime_revision + 1,
    updated_at = pg_catalog.clock_timestamp()
  where runtime_generation_id = generation.runtime_generation_id
    and generation_status = 'PREPARED';
  update production_control.future_tournament_catalog_v1 set
    readiness_fingerprint = readiness->>'fingerprint',
    readiness_setup_revision = setup_revision,
    updated_by_player_id = actor_player,
    updated_by_auth_user_id = actor_auth,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target.tournament_id
    and lifecycle = 'READY_FOR_ACTIVATION'
    and lifecycle_revision = target.lifecycle_revision;
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED';
  end if;
  update production_control.future_runtime_promotions_v2 set
    runtime_status = 'READY', updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target.tournament_id;
  update production_control.annual_scoring_transitions_v1 set
    transition_status = 'CLOSED',
    predecessor_boundary_fingerprint = certificate->>'fingerprint',
    readiness_fingerprint = readiness->>'fingerprint',
    updated_at = pg_catalog.clock_timestamp()
  where transition_id = transition_value.transition_id
    and transition_status = 'CLOSING';
  perform production_control.assert_future_scoring_runtime_capability_v1(
    target.tournament_id, generation.runtime_generation_id,
    generation.authority_generation_id, generation.admission_generation_id
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_CLOSED',
    'transitionId', transition_value.transition_id,
    'predecessorTournamentId', pointer.tournament_id,
    'successorTournamentId', target.tournament_id,
    'expectedPointerRevision', pointer.pointer_revision,
    'runtimeGenerationId', generation.runtime_generation_id,
    'authorityGenerationId', generation.authority_generation_id,
    'admissionGenerationId', generation.admission_generation_id,
    'readinessFingerprint', readiness->>'fingerprint',
    'pointerChanged', false, 'predecessorClosed', true,
    'successorActivated', false, 'idempotent', false
  );
end;
$$;

create or replace function
  public.prepare_production_annual_scoring_transition_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target production_control.future_tournament_catalog_v1%rowtype;
  readiness jsonb;
  generation_id uuid := extensions.gen_random_uuid();
  authority_id uuid := extensions.gen_random_uuid();
  admission_id uuid := extensions.gen_random_uuid();
  actor_player text := pg_catalog.upper(pg_catalog.btrim(
    input#>>'{authorization,player_id}'
  ));
  actor_auth uuid := (input#>>'{authorization,auth_user_id}')::uuid;
  transition_value production_control.annual_scoring_transitions_v1%rowtype;
  response_value jsonb;
begin
  perform production_control.assert_annual_transition_platform_owner_v1(input);
  existing := production_control.lookup_annual_scoring_receipt_v1(
    'PREPARE', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_annual_scoring_receipt_v1(
    'PREPARE', input
  );
  if existing is not null then return existing; end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict target
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = input->>'target_tournament_id' for update;
  readiness := production_control.annual_scoring_transition_readiness_v1(
    target.tournament_id
  );
  if input->>'expected_current_tournament_id' is distinct from
       pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or coalesce((input->>'expected_revision')::bigint, -1)
       <> target.lifecycle_revision
     or target.lifecycle <> 'CONFIGURING'
     or input->>'readiness_fingerprint'
       is distinct from readiness->>'fingerprint'
     or pointer.tournament_id = target.tournament_id
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(
         coalesce(readiness->'blockers', '[]'::jsonb)
       ) blocker
       where blocker->>'code' <>
         'FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED'
     )
     or exists (
       select 1
       from production_control.annual_scoring_transitions_v1 value
       where value.transition_status in ('PREPARED', 'CLOSING', 'CLOSED')
     )
     or exists (
       select 1
       from production_control.postcutover_normal_release_intents value
       where value.scope_key = 'BAGGER_INV_PRODUCTION'
         and value.status = 'PENDING'
     )
     or exists (
       select 1
       from production_control.future_annual_runtime_generations_v1 value
       where value.tournament_id = target.tournament_id
         and value.generation_status <> 'ABORTED'
     ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED',
      detail = coalesce((readiness->'blockers')::text, '[]');
  end if;
  insert into production_control.future_annual_runtime_generations_v1 (
    runtime_generation_id, tournament_id, generation_status,
    runtime_revision, pointer_revision, authority_generation_id,
    admission_generation_id, authority, ingress_state,
    readiness_fingerprint
  ) values (
    generation_id, target.tournament_id, 'PREPARED', 1,
    pointer.pointer_revision + 1, authority_id, admission_id,
    'SUPABASE', 'OPEN', readiness->>'fingerprint'
  );
  update production_control.future_tournament_catalog_v1 set
    lifecycle = 'READY_FOR_ACTIVATION',
    lifecycle_revision = lifecycle_revision + 1,
    readiness_fingerprint = readiness->>'fingerprint',
    readiness_setup_revision = setup_revision,
    updated_by_player_id = actor_player,
    updated_by_auth_user_id = actor_auth,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target.tournament_id
    and lifecycle = 'CONFIGURING'
    and lifecycle_revision = target.lifecycle_revision;
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED';
  end if;
  update production_control.future_runtime_promotions_v2 set
    runtime_status = 'READY', updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target.tournament_id;
  insert into production_control.annual_scoring_transitions_v1 (
    contract_version, transition_status, predecessor_tournament_id,
    successor_tournament_id, expected_pointer_revision,
    predecessor_lifecycle_revision,
    successor_prepared_lifecycle_revision, predecessor_closure_id,
    predecessor_boundary_fingerprint, runtime_generation_id,
    authority_generation_id, admission_generation_id,
    readiness_fingerprint, prepared_by_player_id,
    prepared_by_auth_user_id
  ) values (
    'production-annual-scoring-transition-v1', 'PREPARED',
    pointer.tournament_id, target.tournament_id, pointer.pointer_revision,
    pointer.lifecycle_revision, target.lifecycle_revision + 1,
    null, null, generation_id, authority_id, admission_id,
    readiness->>'fingerprint', actor_player, actor_auth
  ) returning * into transition_value;
  perform production_control.assert_future_scoring_runtime_capability_v1(
    target.tournament_id, generation_id, authority_id, admission_id
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ANNUAL_SCORING_TRANSITION_PREPARED',
    'transitionId', transition_value.transition_id,
    'predecessorTournamentId', pointer.tournament_id,
    'successorTournamentId', target.tournament_id,
    'expectedPointerRevision', pointer.pointer_revision,
    'runtimeGenerationId', generation_id,
    'authorityGenerationId', authority_id,
    'admissionGenerationId', admission_id,
    'readinessFingerprint', readiness->>'fingerprint',
    'pointerChanged', false, 'predecessorClosed', false,
    'predecessorAdmissionStopped', false,
    'successorActivated', false, 'idempotent', false
  );
  perform production_control.store_annual_scoring_receipt_v1(
    'PREPARE', input, response_value
  );
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED';
end;
$$;

create or replace function
  public.close_production_annual_scoring_transition_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  transition_value production_control.annual_scoring_transitions_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  close_response jsonb;
  response_value jsonb;
begin
  perform production_control.assert_annual_transition_platform_owner_v1(input);
  existing := production_control.lookup_annual_scoring_receipt_v1(
    'CLOSE', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_annual_scoring_receipt_v1(
    'CLOSE', input
  );
  if existing is not null then return existing; end if;
  select value.* into strict transition_value
  from production_control.annual_scoring_transitions_v1 value
  where value.transition_id = (input->>'transition_id')::uuid
  for update;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict target
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = transition_value.successor_tournament_id
  for update;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.runtime_generation_id = transition_value.runtime_generation_id
  for update;
  if transition_value.transition_status <> 'PREPARED'
     or transition_value.predecessor_closure_id is not null
     or pointer.tournament_id <> transition_value.predecessor_tournament_id
     or pointer.pointer_revision <> transition_value.expected_pointer_revision
     or input->>'expected_current_tournament_id' is distinct from
       pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or target.lifecycle <> 'READY_FOR_ACTIVATION'
     or target.lifecycle_revision <>
       transition_value.successor_prepared_lifecycle_revision
     or generation.generation_status <> 'PREPARED'
     or input->>'expected_runtime_generation_id' is distinct from
       generation.runtime_generation_id::text
     or input->>'expected_annual_authority_generation_id' is distinct from
       generation.authority_generation_id::text
     or input->>'expected_annual_admission_generation_id' is distinct from
       generation.admission_generation_id::text then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_CLOSE_REVISION_CONFLICT';
  end if;
  close_response :=
    production_control.close_annual_scoring_predecessor_v1(
      input, pointer.tournament_id
    );
  update production_control.annual_scoring_transitions_v1 set
    transition_status = 'CLOSING',
    predecessor_closure_id = (close_response->>'closure_id')::uuid,
    updated_at = pg_catalog.clock_timestamp()
  where transition_id = transition_value.transition_id
    and transition_status = 'PREPARED';
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_CLOSE_REVISION_CONFLICT';
  end if;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ANNUAL_SCORING_PREDECESSOR_CLOSING',
    'transitionId', transition_value.transition_id,
    'predecessorTournamentId', pointer.tournament_id,
    'successorTournamentId', target.tournament_id,
    'closureId', close_response->>'closure_id',
    'activeOrUnresolvedLeases',
      coalesce((close_response->>'active_or_unresolved_leases')::integer, 0),
    'pointerChanged', false,
    'predecessorAdmissionStopped', true,
    'predecessorClosed', false,
    'successorActivated', false,
    'idempotent', false
  );
  perform production_control.store_annual_scoring_receipt_v1(
    'CLOSE', input, response_value
  );
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_CLOSE_REVISION_CONFLICT';
end;
$$;

create or replace function
  public.drain_production_annual_scoring_transition_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  response_value jsonb;
begin
  perform production_control.assert_annual_transition_platform_owner_v1(input);
  existing := production_control.lookup_annual_scoring_receipt_v1(
    'DRAIN', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_annual_scoring_receipt_v1(
    'DRAIN', input
  );
  if existing is not null then return existing; end if;
  response_value := production_control.advance_annual_scoring_transition_v1(
    (input->>'transition_id')::uuid, input
  );
  perform production_control.store_annual_scoring_receipt_v1(
    'DRAIN', input, response_value
  );
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_DRAIN_REVISION_CONFLICT';
end;
$$;

create or replace function
  public.activate_production_annual_scoring_transition_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  transition_value production_control.annual_scoring_transitions_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  predecessor production_control.future_tournament_catalog_v1%rowtype;
  successor production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  prior_annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  certificate jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  legacy_root_id uuid;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(
    input#>>'{authorization,player_id}'
  ));
  actor_auth uuid := (input#>>'{authorization,auth_user_id}')::uuid;
  predecessor_next_revision bigint;
  successor_next_revision bigint;
  certified_writer jsonb;
  response_value jsonb;
begin
  perform production_control.assert_annual_transition_platform_owner_v1(input);
  existing := production_control.lookup_annual_scoring_receipt_v1(
    'ACTIVATE', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_annual_scoring_receipt_v1(
    'ACTIVATE', input
  );
  if existing is not null then return existing; end if;
  select value.* into strict transition_value
  from production_control.annual_scoring_transitions_v1 value
  where value.transition_id = (input->>'transition_id')::uuid
  for update;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict predecessor
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = transition_value.predecessor_tournament_id
  for update;
  select value.* into strict successor
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = transition_value.successor_tournament_id
  for update;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.runtime_generation_id = transition_value.runtime_generation_id
  for update;
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  certificate :=
    production_control.annual_scoring_predecessor_certificate_v1(
      pointer.tournament_id
    );
  select value.* into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = transition_value.predecessor_closure_id;
  if pointer.tournament_id <> '2026' then
    select value.* into strict prior_annual
    from production_control.annual_scoring_runtime_authorities_v1 value
    where value.tournament_id = pointer.tournament_id for update;
    legacy_root_id := prior_annual.legacy_root_closure_id;
  else
    legacy_root_id := closure.prior_legacy_closure_id;
  end if;
  if transition_value.transition_status <> 'CLOSED'
     or pointer.tournament_id <> transition_value.predecessor_tournament_id
     or pointer.pointer_revision <> transition_value.expected_pointer_revision
     or input->>'expected_current_tournament_id' is distinct from
       pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or predecessor.lifecycle <> 'ACTIVE'
     or predecessor.lifecycle_revision <>
       transition_value.predecessor_lifecycle_revision
     or successor.lifecycle <> 'READY_FOR_ACTIVATION'
     or successor.lifecycle_revision <>
       transition_value.successor_prepared_lifecycle_revision
     or successor.readiness_fingerprint is distinct from
       transition_value.readiness_fingerprint
     or generation.generation_status <> 'PREPARED'
     or generation.pointer_revision <> pointer.pointer_revision + 1
     or generation.authority_generation_id is distinct from
       transition_value.authority_generation_id
     or generation.admission_generation_id is distinct from
       transition_value.admission_generation_id
     or input->>'expected_runtime_generation_id'
       is distinct from generation.runtime_generation_id::text
     or input->>'expected_annual_authority_generation_id'
       is distinct from generation.authority_generation_id::text
     or input->>'expected_annual_admission_generation_id'
       is distinct from generation.admission_generation_id::text
     or coalesce((certificate->>'certified')::boolean, false) is not true
     or certificate->>'closureId'
       is distinct from transition_value.predecessor_closure_id::text
     or certificate->>'fingerprint'
       is distinct from transition_value.predecessor_boundary_fingerprint
     or exists (
       select 1 from production_control.future_annual_runtime_generations_v1
       where generation_status = 'ACTIVE'
         and tournament_id <> pointer.tournament_id
     ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED',
      detail = coalesce((certificate->'blockers')::text, '[]');
  end if;
  perform production_control.assert_future_scoring_runtime_capability_v1(
    successor.tournament_id, generation.runtime_generation_id,
    generation.authority_generation_id, generation.admission_generation_id
  );
  if pg_catalog.to_regclass(
       'production_control.future_google_writer_targets_v2'
     ) is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_GOOGLE_DESTINATION_REQUIRED';
  end if;
  execute $writer$
    select pg_catalog.jsonb_build_object(
      'writerGenerationId', value.writer_generation_id,
      'destinationWorkbookId', value.destination_workbook_id,
      'targetContractFingerprint', value.target_contract_fingerprint
    )
    from production_control.future_google_writer_targets_v2 value
    where value.tournament_id = $1 and value.contract_status = 'CERTIFIED'
  $writer$ into certified_writer using successor.tournament_id;
  if certified_writer is null
     or input->>'expected_google_writer_generation_id' is distinct from
       certified_writer->>'writerGenerationId'
     or input->>'annual_destination_workbook_id' is distinct from
       certified_writer->>'destinationWorkbookId'
     or input->>'expected_google_target_contract_fingerprint' is distinct from
       certified_writer->>'targetContractFingerprint' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_GOOGLE_DESTINATION_REQUIRED';
  end if;
  if pg_catalog.to_regprocedure(
    'production_control.bind_future_participant_identity_runtime_v1(text,uuid,uuid,uuid,text,uuid)'
  ) is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_IDENTITY_CAPABILITY_REQUIRED';
  end if;
  execute 'select production_control.bind_future_participant_identity_runtime_v1($1,$2,$3,$4,$5,$6)'
    using successor.tournament_id, generation.runtime_generation_id,
      generation.authority_generation_id, generation.admission_generation_id,
      actor_player, actor_auth;
  predecessor_next_revision := predecessor.lifecycle_revision + 1;
  successor_next_revision := successor.lifecycle_revision + 1;
  update production_control.future_tournament_catalog_v1 set
    lifecycle = 'CLOSED', lifecycle_revision = predecessor_next_revision,
    updated_by_player_id = actor_player,
    updated_by_auth_user_id = actor_auth,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = predecessor.tournament_id
    and lifecycle = 'ACTIVE'
    and lifecycle_revision = predecessor.lifecycle_revision;
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_POINTER_CAS_FAILED';
  end if;
  if predecessor.tournament_id <> '2026' then
    update production_control.future_annual_runtime_generations_v1 set
      generation_status = 'CLOSED',
      closed_by_player_id = actor_player,
      closed_at = pg_catalog.clock_timestamp(),
      runtime_revision = runtime_revision + 1,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = predecessor.tournament_id
      and generation_status = 'ACTIVE';
    if not found then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_ANNUAL_SCORING_POINTER_CAS_FAILED';
    end if;
  end if;
  update production_control.future_tournament_catalog_v1 set
    lifecycle = 'ACTIVE', lifecycle_revision = successor_next_revision,
    updated_by_player_id = actor_player,
    updated_by_auth_user_id = actor_auth,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = successor.tournament_id
    and lifecycle = 'READY_FOR_ACTIVATION'
    and lifecycle_revision = successor.lifecycle_revision;
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_POINTER_CAS_FAILED';
  end if;
  update production_control.current_tournament_pointer_v1 set
    tournament_id = successor.tournament_id,
    tournament_year = successor.tournament_year,
    pointer_revision = pointer.pointer_revision + 1,
    lifecycle_revision = successor_next_revision,
    updated_by_player_id = actor_player,
    updated_by_auth_user_id = actor_auth,
    updated_at = pg_catalog.clock_timestamp()
  where scope_key = 'BAGGER_INV_PRODUCTION'
    and tournament_id = predecessor.tournament_id
    and pointer_revision = transition_value.expected_pointer_revision
    and lifecycle_revision = predecessor.lifecycle_revision;
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_POINTER_CAS_FAILED';
  end if;
  update production_control.future_annual_runtime_generations_v1 set
    generation_status = 'ACTIVE',
    pointer_revision = pointer.pointer_revision + 1,
    activated_by_player_id = actor_player,
    activated_by_auth_user_id = actor_auth,
    activated_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where runtime_generation_id = generation.runtime_generation_id
    and generation_status = 'PREPARED';
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_POINTER_CAS_FAILED';
  end if;
  insert into production_control.annual_scoring_runtime_authorities_v1 (
    runtime_generation_id, tournament_id, platform_tournament_id,
    platform_authority_generation_id, platform_admission_generation_id,
    pointer_revision, lifecycle_revision, authority_generation_id,
    admission_generation_id, google_writer_generation_id,
    destination_workbook_id, google_target_contract_fingerprint,
    authority_status, admission_state,
    admission_revision, legacy_root_closure_id,
    predecessor_tournament_id, predecessor_closure_id,
    predecessor_boundary_fingerprint, activated_by_player_id,
    activated_by_auth_user_id
  ) values (
    generation.runtime_generation_id, successor.tournament_id, '2026',
    activation.authority_generation_id, gate.admission_generation_id,
    pointer.pointer_revision + 1, successor_next_revision,
    generation.authority_generation_id, generation.admission_generation_id,
    (certified_writer->>'writerGenerationId')::uuid,
    certified_writer->>'destinationWorkbookId',
    certified_writer->>'targetContractFingerprint',
    'ACTIVE', 'OPEN', 1, legacy_root_id,
    predecessor.tournament_id, closure.closure_id,
    transition_value.predecessor_boundary_fingerprint,
    actor_player, actor_auth
  );
  update production_control.future_runtime_promotions_v2 set
    runtime_status = 'ACTIVE', updated_at = pg_catalog.clock_timestamp()
  where tournament_id = successor.tournament_id;
  update production_control.annual_scoring_transitions_v1 set
    transition_status = 'COMMITTED',
    committed_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where transition_id = transition_value.transition_id
    and transition_status = 'CLOSED';
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_POINTER_CAS_FAILED';
  end if;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_ANNUAL_SCORING_TRANSITION_COMMITTED',
    'transitionId', transition_value.transition_id,
    'predecessorTournamentId', predecessor.tournament_id,
    'successorTournamentId', successor.tournament_id,
    'pointerRevision', pointer.pointer_revision + 1,
    'runtimeGenerationId', generation.runtime_generation_id,
    'authorityGenerationId', generation.authority_generation_id,
    'admissionGenerationId', generation.admission_generation_id,
    'predecessorClosed', true, 'successorActivated', true,
    'pointerChanged', true, 'idempotent', false
  );
  perform production_control.store_annual_scoring_receipt_v1(
    'ACTIVATE', input, response_value
  );
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED';
end;
$$;

create or replace function
  public.abort_production_annual_scoring_transition_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  transition_value production_control.annual_scoring_transitions_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target production_control.future_tournament_catalog_v1%rowtype;
  successor_generation
    production_control.future_annual_runtime_generations_v1%rowtype;
  current_generation
    production_control.future_annual_runtime_generations_v1%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  legacy_root production_control.scoring_admission_closures%rowtype;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(
    input#>>'{authorization,player_id}'
  ));
  actor_auth uuid := (input#>>'{authorization,auth_user_id}')::uuid;
  next_admission_generation uuid := extensions.gen_random_uuid();
  admission_was_stopped boolean;
  predecessor_was_closed boolean;
  post_close_count integer;
  identity_rebind jsonb;
  side_game_rebind jsonb;
  response_value jsonb;
begin
  perform production_control.assert_annual_transition_platform_owner_v1(input);
  existing := production_control.lookup_annual_scoring_receipt_v1(
    'ABORT', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_annual_scoring_receipt_v1(
    'ABORT', input
  );
  if existing is not null then return existing; end if;
  select value.* into strict transition_value
  from production_control.annual_scoring_transitions_v1 value
  where value.transition_id = (input->>'transition_id')::uuid
  for update;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict target
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = transition_value.successor_tournament_id
  for update;
  select value.* into strict successor_generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.runtime_generation_id = transition_value.runtime_generation_id
  for update;
  admission_was_stopped := transition_value.transition_status in (
    'CLOSING', 'CLOSED'
  );
  predecessor_was_closed := transition_value.transition_status = 'CLOSED';
  if transition_value.transition_status not in (
       'PREPARED', 'CLOSING', 'CLOSED'
     )
     or pointer.tournament_id <>
       transition_value.predecessor_tournament_id
     or pointer.pointer_revision <>
       transition_value.expected_pointer_revision
     or input->>'expected_current_tournament_id' is distinct from
       pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or target.lifecycle <> 'READY_FOR_ACTIVATION'
     or target.lifecycle_revision <>
       transition_value.successor_prepared_lifecycle_revision
     or successor_generation.generation_status <> 'PREPARED'
     or input->>'expected_runtime_generation_id' is distinct from
       successor_generation.runtime_generation_id::text
     or input->>'expected_annual_authority_generation_id' is distinct from
       successor_generation.authority_generation_id::text
     or input->>'expected_annual_admission_generation_id' is distinct from
       successor_generation.admission_generation_id::text then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_ABORT_NOT_SAFE';
  end if;

  if admission_was_stopped then
    select value.* into strict closure
    from production_control.scoring_admission_closures value
    where value.closure_id = transition_value.predecessor_closure_id
    for update;
    select pg_catalog.count(*)::integer into post_close_count
    from scoring_authority.scoring_ingress_leases value
    where value.tournament_id = pointer.tournament_id
      and value.admission_generation_id = closure.admission_generation_id
      and value.admission_sequence > closure.lease_high_watermark;
    if production_control.annual_scoring_unresolved_count_v1(
         pointer.tournament_id, closure.admission_generation_id
       ) <> 0
       or post_close_count <> 0
       or exists (
         select 1 from scoring_authority.google_outbox_events value
         where value.tournament_id = pointer.tournament_id
           and value.status <> 'DELIVERED'
       )
       or exists (
         select 1 from scoring_authority.scorecard_archive_jobs value
         where value.tournament_id = pointer.tournament_id
           and value.status not in ('VERIFIED', 'SUPERSEDED')
       ) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ANNUAL_SCORING_ABORT_DRAIN_REQUIRED';
    end if;

    if pointer.tournament_id = '2026' then
      select value.* into strict activation
      from production_control.cutover_activation_state value
      where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
      select value.* into strict gate
      from scoring_authority.ingress_gates value
      where value.tournament_id = '2026' for update;
      select value.* into strict legacy_root
      from production_control.scoring_admission_closures value
      where value.closure_id = closure.prior_legacy_closure_id;
      if coalesce((input->>'expected_platform_activation_revision')::bigint, -1)
           <> activation.activation_revision
         or input->>'expected_platform_authority_generation_id'
           is distinct from activation.authority_generation_id::text
         or input->>'expected_platform_admission_generation_id'
           is distinct from gate.admission_generation_id::text
         or coalesce((input->>'expected_platform_admission_revision')::bigint, -1)
           <> gate.admission_revision
         or activation.state <> 'SCORING_COMMITTED'
         or activation.current_authority <> 'SUPABASE'
         or not activation.scoring_ingress_enabled
         or activation.active_transition_epoch_id is not null
         or gate.state <> 'PAUSED'
         or gate.authority <> 'SUPABASE'
         or gate.admission_state <> 'CLOSED'
         or gate.active_closure_id is distinct from closure.closure_id
         or closure.closure_kind <> 'SUPABASE_INGRESS'
         or closure.authority <> 'SUPABASE'
         or closure.status not in ('CLOSING', 'CLOSED')
         or legacy_root.closure_kind <> 'LEGACY_ADMISSION'
         or legacy_root.status <> 'CONSUMED' then
        raise exception using errcode = '40001',
          message = 'PRODUCTION_ANNUAL_SCORING_ABORT_NOT_SAFE';
      end if;
      update production_control.scoring_admission_closures set
        status = 'REOPENED', reopened_at = pg_catalog.clock_timestamp()
      where closure_id = closure.closure_id;
      update scoring_authority.ingress_gates set
        state = 'OPEN', authority = 'SUPABASE',
        admission_state = 'CLOSED',
        admission_revision = admission_revision + 1,
        active_closure_id = legacy_root.closure_id,
        external_fence_evidence_id = legacy_root.external_fence_evidence_id,
        unresolved_client_queues = 0,
        updated_by = actor_player,
        updated_at = pg_catalog.clock_timestamp()
      where tournament_id = '2026';
      update production_control.cutover_activation_state set
        activation_revision = activation_revision + 1,
        updated_by = actor_player,
        updated_at = pg_catalog.clock_timestamp()
      where scope_key = 'BAGGER_INV_PRODUCTION';
    else
      select value.* into strict annual
      from production_control.annual_scoring_runtime_authorities_v1 value
      where value.tournament_id = pointer.tournament_id for update;
      select value.* into strict current_generation
      from production_control.future_annual_runtime_generations_v1 value
      where value.runtime_generation_id = annual.runtime_generation_id
        and value.generation_status = 'ACTIVE' for update;
      if annual.active_closure_id is distinct from closure.closure_id
         or annual.authority_status not in ('ACTIVE', 'CLOSED')
         or annual.admission_state not in ('CLOSING', 'CLOSED')
         or annual.admission_generation_id is distinct from
           current_generation.admission_generation_id
         or input->>'expected_predecessor_runtime_generation_id'
           is distinct from
           current_generation.runtime_generation_id::text
         or input->>'expected_predecessor_annual_authority_generation_id'
           is distinct from
           annual.authority_generation_id::text
         or input->>'expected_predecessor_annual_admission_generation_id'
           is distinct from
           annual.admission_generation_id::text
         or coalesce(
           (input->>'expected_predecessor_annual_admission_revision')::bigint,
           -1
         )
           <> annual.admission_revision then
        raise exception using errcode = '40001',
          message = 'PRODUCTION_ANNUAL_SCORING_ABORT_NOT_SAFE';
      end if;
      update production_control.future_annual_runtime_generations_v1 set
        admission_generation_id = next_admission_generation,
        runtime_revision = runtime_revision + 1,
        updated_at = pg_catalog.clock_timestamp()
      where runtime_generation_id = current_generation.runtime_generation_id
        and admission_generation_id = annual.admission_generation_id;
      if pg_catalog.to_regprocedure(
        'production_control.rebind_future_participant_identity_admission_generation_v1(text,uuid,uuid,uuid,uuid,bigint)'
      ) is null then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_ANNUAL_IDENTITY_ADMISSION_REBIND_REQUIRED';
      end if;
      execute 'select production_control.rebind_future_participant_identity_admission_generation_v1($1,$2,$3,$4,$5,$6)'
        into identity_rebind
        using pointer.tournament_id, current_generation.runtime_generation_id,
          current_generation.authority_generation_id,
          annual.admission_generation_id, next_admission_generation,
          pointer.pointer_revision;
      update production_control.scoring_admission_closures set
        status = 'REOPENED', reopened_at = pg_catalog.clock_timestamp()
      where closure_id = closure.closure_id;
      update production_control.annual_scoring_runtime_authorities_v1 set
        authority_status = 'ACTIVE', admission_state = 'OPEN',
        admission_generation_id = next_admission_generation,
        admission_revision = admission_revision + 1,
        active_closure_id = null, closed_at = null,
        updated_at = pg_catalog.clock_timestamp()
      where runtime_generation_id = annual.runtime_generation_id;
      if pg_catalog.to_regprocedure(
        'production_control.rebind_annual_side_game_admission_generation_v1(text,uuid,uuid,uuid,uuid,bigint)'
      ) is null then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_ANNUAL_SIDE_GAME_ADMISSION_REBIND_REQUIRED';
      end if;
      execute 'select production_control.rebind_annual_side_game_admission_generation_v1($1,$2,$3,$4,$5,$6)'
        into side_game_rebind
        using pointer.tournament_id, current_generation.runtime_generation_id,
          current_generation.authority_generation_id,
          annual.admission_generation_id, next_admission_generation,
          pointer.pointer_revision;
    end if;
  end if;

  update production_control.future_annual_runtime_generations_v1 set
    generation_status = 'ABORTED',
    closed_by_player_id = actor_player,
    closed_at = pg_catalog.clock_timestamp(),
    runtime_revision = runtime_revision + 1,
    updated_at = pg_catalog.clock_timestamp()
  where runtime_generation_id = transition_value.runtime_generation_id
    and generation_status = 'PREPARED';
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_ABORT_NOT_SAFE';
  end if;
  update production_control.future_tournament_catalog_v1 set
    lifecycle = 'CONFIGURING', lifecycle_revision = lifecycle_revision + 1,
    readiness_fingerprint = null, readiness_setup_revision = null,
    updated_by_player_id = actor_player,
    updated_by_auth_user_id = actor_auth,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target.tournament_id
    and lifecycle = 'READY_FOR_ACTIVATION';
  update production_control.future_runtime_promotions_v2 set
    runtime_status = 'PROMOTED', updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target.tournament_id
    and runtime_status = 'READY';
  update production_control.annual_scoring_transitions_v1 set
    transition_status = 'ABORTED', aborted_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where transition_id = transition_value.transition_id
    and transition_status in ('PREPARED', 'CLOSING', 'CLOSED');
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED_SAFE',
    'transitionId', transition_value.transition_id,
    'predecessorTournamentId', pointer.tournament_id,
    'successorTournamentId', target.tournament_id,
    'pointerRevision', pointer.pointer_revision,
    'pointerChanged', false, 'predecessorClosed', false,
    'predecessorWasClosed', predecessor_was_closed,
    'successorActivated', false,
    'predecessorAdmissionReopened', admission_was_stopped,
    'requiresExplicitAdmissionRecovery', false,
    'idempotent', false
  );
  perform production_control.store_annual_scoring_receipt_v1(
    'ABORT', input, response_value
  );
  return response_value;
exception
  when invalid_text_representation or no_data_found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ANNUAL_SCORING_ABORT_NOT_SAFE';
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.future_production_read_scoring_authority_v1(jsonb)',
    'public.future_production_read_scoring_participant_context_v1(jsonb)',
    'public.future_production_submit_hole_score_v1(jsonb)',
    'public.future_production_mutate_match_control_v1(jsonb)',
    'public.future_production_finalize_match_v1(jsonb)',
    'public.future_production_reopen_match_v1(jsonb)',
    'public.future_production_claim_google_outbox_v1(jsonb)',
    'public.future_production_claim_google_outbox_event_v1(jsonb)',
    'public.future_production_complete_google_outbox_v1(jsonb)',
    'public.future_production_fail_google_outbox_v1(jsonb)',
    'public.future_production_inspect_scoring_workers_v1(jsonb)',
    'public.future_production_claim_scorecard_archive_job_v1(jsonb)',
    'public.future_production_complete_scorecard_archive_job_v1(jsonb)',
    'public.future_production_fail_scorecard_archive_job_v1(jsonb)',
    'public.future_production_inspect_scorecard_archive_state_v1(jsonb)'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
  end loop;
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.dispatch_production_annual_scoring_v1(jsonb)',
    'public.read_production_scoring_dispatch_certification_v1(jsonb)',
    'public.read_production_annual_scoring_transition_readiness_v1(jsonb)',
    'public.prepare_production_annual_scoring_transition_v1(jsonb)',
    'public.close_production_annual_scoring_transition_v1(jsonb)',
    'public.drain_production_annual_scoring_transition_v1(jsonb)',
    'public.activate_production_annual_scoring_transition_v1(jsonb)',
    'public.abort_production_annual_scoring_transition_v1(jsonb)'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
    execute pg_catalog.format(
      'grant execute on function %s to service_role', signature
    );
  end loop;
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'production_control.annual_scoring_unresolved_count_v1(text,uuid)',
    'production_control.annual_scoring_lease_fingerprint_v1(text,uuid)',
    'production_control.annual_scoring_platform_certification_v1(jsonb)',
    'production_control.assert_annual_scoring_platform_v1(jsonb,text,text)',
    'production_control.assert_annual_scoring_runtime_v1(jsonb,text,text)',
    'production_control.annual_scoring_predecessor_certificate_v1(text)',
    'production_control.annual_scoring_transition_readiness_v1(text)',
    'production_control.lookup_annual_scoring_receipt_v1(text,jsonb)',
    'production_control.store_annual_scoring_receipt_v1(text,jsonb,jsonb)',
    'production_control.close_annual_scoring_predecessor_v1(jsonb,text)',
    'production_control.advance_annual_scoring_transition_v1(uuid,jsonb)',
    'production_control.assert_future_production_scoring_runtime_v1(jsonb,text)',
    'production_control.assert_production_scoring_runtime(jsonb,text)',
    'production_control.assert_production_scoring_runtime_pre_annual_pointer_fence(jsonb,text)',
    'production_control.assert_future_runtime_service_scope_v2(jsonb,boolean,boolean)',
    'production_control.assert_future_runtime_service_scope_v2_pre_annual_scoring_fence(jsonb,boolean,boolean)',
    'production_control.assert_annual_transition_platform_owner_v1(jsonb)'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
  end loop;
end;
$$;

revoke all on table
  production_control.annual_scoring_rpc_allowlist_v1,
  production_control.annual_scoring_platform_certifications_v1,
  production_control.annual_scoring_runtime_authorities_v1,
  production_control.annual_scoring_transitions_v1,
  production_control.annual_scoring_transition_receipts_v1
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
