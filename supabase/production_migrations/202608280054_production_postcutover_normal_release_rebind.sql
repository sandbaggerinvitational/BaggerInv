-- Serial, exact post-cutover application release rebinds.
--
-- Migration 053 remains the immutable sequence-1 baseline. Installation is
-- inert. Each later release must name the current effective predecessor and
-- the next monotonic sequence while Production remains in its healthy
-- MAINTENANCE_WINDOW_V1 OBSERVATION state.
begin;

create table production_control.postcutover_normal_release_rebindings (
  release_rebind_id uuid primary key default extensions.gen_random_uuid(),
  scope_key text not null check (scope_key = 'BAGGER_INV_PRODUCTION'),
  boundary_mode text not null check (boundary_mode = 'MAINTENANCE_WINDOW_V1'),
  contract_version text not null check (
    contract_version = 'production-postcutover-normal-release-rebind-v1'
  ),
  release_kind text not null check (
    release_kind in ('BASELINE_053', 'NORMAL')
  ),
  release_sequence bigint not null unique check (release_sequence >= 1),
  predecessor_release_sequence bigint,
  baseline_application_rebind_id uuid not null references
    production_control.postcutover_application_release_rebindings(
      application_rebind_id
    ) on delete restrict,
  predecessor_release_rebind_id uuid references
    production_control.postcutover_normal_release_rebindings(
      release_rebind_id
    ) on delete restrict,
  capability_binding_id uuid not null references
    production_control.maintenance_deployment_capability_bindings(
      capability_binding_id
    ) on delete restrict,
  tournament_id text not null check (tournament_id = '2026'),
  epoch_id uuid not null references
    scoring_authority.authority_epochs(epoch_id) on delete restrict,
  authority_generation_id uuid not null,
  admission_generation_id uuid not null,
  predecessor_deployment_id text not null check (
    predecessor_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  predecessor_deployment_commit text not null check (
    predecessor_deployment_commit ~ '^[0-9a-f]{40}$'
  ),
  deployment_id text not null unique check (
    deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  deployment_commit text not null check (
    deployment_commit ~ '^[0-9a-f]{40}$'
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
  check (predecessor_deployment_id <> deployment_id),
  check (
    (release_kind = 'BASELINE_053'
      and release_sequence = 1
      and predecessor_release_sequence is null
      and predecessor_release_rebind_id is null)
    or (release_kind = 'NORMAL'
      and release_sequence >= 2
      and predecessor_release_sequence = release_sequence - 1
      and predecessor_release_rebind_id is not null)
  )
);

create unique index production_postcutover_normal_release_baseline_idx
  on production_control.postcutover_normal_release_rebindings(
    baseline_application_rebind_id
  ) where release_kind = 'BASELINE_053';

create table production_control.postcutover_normal_release_head (
  scope_key text primary key check (scope_key = 'BAGGER_INV_PRODUCTION'),
  release_sequence bigint not null unique check (release_sequence >= 1),
  release_rebind_id uuid not null unique references
    production_control.postcutover_normal_release_rebindings(
      release_rebind_id
    ) on delete restrict,
  deployment_id text not null unique check (
    deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  deployment_commit text not null check (
    deployment_commit ~ '^[0-9a-f]{40}$'
  ),
  activation_revision bigint not null check (activation_revision >= 0),
  admission_revision bigint not null check (admission_revision >= 0),
  updated_at timestamptz not null default pg_catalog.now()
);

create table production_control.postcutover_normal_release_intents (
  release_intent_id uuid primary key default extensions.gen_random_uuid(),
  scope_key text not null check (scope_key = 'BAGGER_INV_PRODUCTION'),
  contract_version text not null check (
    contract_version = 'production-postcutover-normal-release-intent-v1'
  ),
  status text not null check (status in ('PENDING', 'CONSUMED')),
  release_sequence bigint not null unique check (release_sequence >= 1),
  predecessor_release_rebind_id uuid not null references
    production_control.postcutover_normal_release_rebindings(
      release_rebind_id
    ) on delete restrict,
  predecessor_deployment_id text not null check (
    predecessor_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  predecessor_deployment_commit text not null check (
    predecessor_deployment_commit ~ '^[0-9a-f]{40}$'
  ),
  target_deployment_commit text not null check (
    target_deployment_commit ~ '^[0-9a-f]{40}$'
  ),
  epoch_id uuid not null references
    scoring_authority.authority_epochs(epoch_id) on delete restrict,
  authority_generation_id uuid not null,
  admission_generation_id uuid not null,
  capability_binding_id uuid not null references
    production_control.maintenance_deployment_capability_bindings(
      capability_binding_id
    ) on delete restrict,
  capability_contract text not null check (
    capability_contract =
      'production-maintenance-single-deployment-capability-v1'
  ),
  capability_ceiling text not null check (capability_ceiling = 'OBSERVATION'),
  expected_activation_revision bigint not null check (
    expected_activation_revision >= 0
  ),
  expected_admission_revision bigint not null check (
    expected_admission_revision >= 0
  ),
  authorization_manifest jsonb not null check (
    pg_catalog.jsonb_typeof(authorization_manifest) = 'object'
  ),
  authorization_fingerprint text not null unique check (
    authorization_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  request_fingerprint text not null unique check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  authorized_by text not null check (
    pg_catalog.btrim(authorized_by) <> ''
    and pg_catalog.length(authorized_by) <= 160
  ),
  authorized_at timestamptz not null default pg_catalog.now(),
  consumed_release_rebind_id uuid unique references
    production_control.postcutover_normal_release_rebindings(
      release_rebind_id
    ) on delete restrict,
  consumed_at timestamptz,
  check (
    (status = 'PENDING' and consumed_release_rebind_id is null
      and consumed_at is null)
    or (status = 'CONSUMED' and consumed_release_rebind_id is not null
      and consumed_at is not null)
  )
);

create unique index production_postcutover_normal_release_one_pending_idx
  on production_control.postcutover_normal_release_intents(scope_key)
  where status = 'PENDING';

alter table production_control.postcutover_normal_release_rebindings
  enable row level security;
alter table production_control.postcutover_normal_release_head
  enable row level security;
alter table production_control.postcutover_normal_release_intents
  enable row level security;

revoke all on table
  production_control.postcutover_normal_release_rebindings,
  production_control.postcutover_normal_release_head,
  production_control.postcutover_normal_release_intents
  from public, anon, authenticated, service_role;

-- 053 can already have completed before this migration is installed, or 054
-- can be installed first in an ordered fresh fixture. In either case the
-- immutable 053 audit row becomes sequence 1 exactly once. The trigger does
-- not change that row or any Production control state.
create or replace function
  production_control.bootstrap_postcutover_normal_release_baseline()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  baseline
    production_control.postcutover_application_release_rebindings%rowtype;
  baseline_release_id uuid;
begin
  select value.* into baseline
  from production_control.postcutover_application_release_rebindings value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if not found then return; end if;

  insert into production_control.postcutover_normal_release_rebindings (
    scope_key, boundary_mode, contract_version, release_kind,
    release_sequence, predecessor_release_sequence,
    baseline_application_rebind_id, predecessor_release_rebind_id,
    capability_binding_id, tournament_id, epoch_id,
    authority_generation_id, admission_generation_id,
    predecessor_deployment_id, predecessor_deployment_commit,
    deployment_id, deployment_commit, deployment_hostname,
    vercel_project_id, vercel_team_id,
    capability_contract, capability_ceiling,
    activation_revision_before, activation_revision_after,
    admission_revision_before, admission_revision_after,
    runtime_manifest, runtime_fingerprint, runtime_observed_at,
    request_fingerprint, payload_hash, actor_id, response_value,
    created_at
  ) values (
    'BAGGER_INV_PRODUCTION', 'MAINTENANCE_WINDOW_V1',
    'production-postcutover-normal-release-rebind-v1', 'BASELINE_053',
    1, null,
    baseline.application_rebind_id, null,
    baseline.capability_binding_id, baseline.tournament_id, baseline.epoch_id,
    baseline.authority_generation_id, baseline.admission_generation_id,
    baseline.prior_deployment_id, baseline.prior_deployment_commit,
    baseline.deployment_id, baseline.deployment_commit,
    baseline.deployment_hostname, baseline.vercel_project_id,
    baseline.vercel_team_id, baseline.capability_contract,
    baseline.capability_ceiling, baseline.activation_revision_before,
    baseline.activation_revision_after, baseline.admission_revision_before,
    baseline.admission_revision_after, baseline.runtime_manifest,
    baseline.runtime_fingerprint, baseline.runtime_observed_at,
    baseline.request_fingerprint, baseline.payload_hash, baseline.actor_id,
    baseline.response_value, baseline.created_at
  )
  on conflict (release_sequence) do nothing
  returning release_rebind_id into baseline_release_id;

  if baseline_release_id is null then
    select value.release_rebind_id into strict baseline_release_id
    from production_control.postcutover_normal_release_rebindings value
    where value.release_kind = 'BASELINE_053'
      and value.baseline_application_rebind_id =
        baseline.application_rebind_id;
  end if;

  insert into production_control.postcutover_normal_release_head (
    scope_key, release_sequence, release_rebind_id,
    deployment_id, deployment_commit,
    activation_revision, admission_revision, updated_at
  ) values (
    'BAGGER_INV_PRODUCTION', 1, baseline_release_id,
    baseline.deployment_id, baseline.deployment_commit,
    baseline.activation_revision_after, baseline.admission_revision_after,
    pg_catalog.now()
  ) on conflict (scope_key) do nothing;
  return;
end;
$$;

revoke all on function
  production_control.bootstrap_postcutover_normal_release_baseline()
  from public, anon, authenticated, service_role;

create or replace function
  production_control.bootstrap_postcutover_normal_release_baseline_after_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform production_control.bootstrap_postcutover_normal_release_baseline();
  return null;
end;
$$;

revoke all on function
  production_control
    .bootstrap_postcutover_normal_release_baseline_after_insert()
  from public, anon, authenticated, service_role;

create trigger production_postcutover_normal_release_baseline_insert
after insert on
  production_control.postcutover_application_release_rebindings
for each row execute function
  production_control
    .bootstrap_postcutover_normal_release_baseline_after_insert();

do $$
begin
  perform production_control.bootstrap_postcutover_normal_release_baseline();
end;
$$;

-- Database-owner authorization is a separate step from runtime consumption.
-- A service-role runtime can consume only the one exact PENDING SHA bound here.
create or replace function
  production_control.authorize_production_postcutover_normal_release(
    input jsonb
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  head production_control.postcutover_normal_release_head%rowtype;
  predecessor
    production_control.postcutover_normal_release_rebindings%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  binding production_control.maintenance_deployment_capability_bindings%rowtype;
  existing production_control.postcutover_normal_release_intents%rowtype;
  target_sequence bigint;
  manifest jsonb;
  manifest_fingerprint text;
  payload_hash text := production_control.cutover_payload_hash(input);
  response_value jsonb;
begin
  if not pg_catalog.pg_has_role(session_user, current_user, 'USAGE') then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DATABASE_OWNER_REQUIRED';
  end if;
  if input->>'operation' is distinct from
       'AUTHORIZE_PRODUCTION_POSTCUTOVER_NORMAL_RELEASE'
     or pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'project_ref' is distinct from 'ymqhhtxaywtqllynrmxe'
     or input->>'project_url' is distinct from
       'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or input->>'source_workbook_id' is distinct from
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or input->>'tournament_id' is distinct from '2026'
     or coalesce(input->>'target_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'expected_predecessor_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'expected_predecessor_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or pg_catalog.jsonb_typeof(input->'expected_activation_revision')
       is distinct from 'number'
     or input->>'expected_activation_revision' !~ '^[0-9]+$'
     or pg_catalog.jsonb_typeof(input->'expected_admission_revision')
       is distinct from 'number'
     or input->>'expected_admission_revision' !~ '^[0-9]+$'
     or coalesce(input->>'expected_authority_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_admission_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or (
       input ? 'expected_release_sequence'
       and (
         pg_catalog.jsonb_typeof(input->'expected_release_sequence')
           is distinct from 'number'
         or input->>'expected_release_sequence' !~ '^[0-9]+$'
       )
     )
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  perform production_control.bootstrap_postcutover_normal_release_baseline();
  select value.* into strict head
  from production_control.postcutover_normal_release_head value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict predecessor
  from production_control.postcutover_normal_release_rebindings value
  where value.release_rebind_id = head.release_rebind_id;
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select value.* into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = gate.active_epoch_id;
  select value.* into strict binding
  from production_control.maintenance_deployment_capability_bindings value
  where value.capability_binding_id = predecessor.capability_binding_id;

  target_sequence := head.release_sequence + 1;
  if input ? 'expected_release_sequence'
     and (input->>'expected_release_sequence')::bigint <> target_sequence
  then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_SEQUENCE_STALE';
  end if;

  manifest := pg_catalog.jsonb_build_object(
    'domain', 'BAGGER_POSTCUTOVER_NORMAL_RELEASE_INTENT_V1',
    'contract_version', 'production-postcutover-normal-release-intent-v1',
    'release_sequence', target_sequence,
    'predecessor_release_rebind_id', predecessor.release_rebind_id,
    'predecessor_deployment_id', head.deployment_id,
    'predecessor_deployment_commit', head.deployment_commit,
    'target_deployment_commit', input->>'target_deployment_commit',
    'activation_revision', activation.activation_revision,
    'admission_revision', gate.admission_revision,
    'authority_epoch', epoch.epoch_id,
    'authority_generation', activation.authority_generation_id,
    'admission_generation', gate.admission_generation_id,
    'capability_binding_id', binding.capability_binding_id,
    'capability_contract', binding.contract_version,
    'capability_ceiling', binding.capability_ceiling,
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
    'supabase_project_ref', 'ymqhhtxaywtqllynrmxe',
    'google_workbook_id',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
    'tournament_id', '2026'
  );
  manifest_fingerprint := pg_catalog.encode(
    extensions.digest(manifest::text, 'sha256'), 'hex'
  );

  select value.* into existing
  from production_control.postcutover_normal_release_intents value
  where value.request_fingerprint = input->>'request_fingerprint';
  if found then
    if existing.payload_hash is distinct from payload_hash
       or existing.authorization_fingerprint is distinct from
         manifest_fingerprint
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_AUTHORIZED',
      'release_intent_id', existing.release_intent_id,
      'release_sequence', existing.release_sequence,
      'target_deployment_commit', existing.target_deployment_commit,
      'status', existing.status,
      'authorization_fingerprint', existing.authorization_fingerprint,
      'idempotent', true
    );
  end if;

  if head.release_rebind_id is distinct from predecessor.release_rebind_id
     or input->>'expected_predecessor_deployment_id' is distinct from
       head.deployment_id
     or input->>'expected_predecessor_deployment_commit' is distinct from
       head.deployment_commit
     or activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or activation.current_authority <> 'SUPABASE'
     or activation.maintenance_state <> 'NORMAL'
     or not activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.expected_deployment_commit is distinct from
       head.deployment_commit
     or activation.expected_vercel_project_id is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.activation_revision is distinct from head.activation_revision
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
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
     or gate.active_epoch_id is distinct from epoch.epoch_id
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.admission_revision is distinct from head.admission_revision
     or gate.admission_deployment_id is distinct from head.deployment_id
     or gate.unresolved_client_queues <> 0
     or epoch.status <> 'COMMITTED'
     or epoch.epoch_id is distinct from activation.authority_generation_id
     or binding.contract_version <>
       'production-maintenance-single-deployment-capability-v1'
     or binding.capability_ceiling <> 'OBSERVATION'
     or exists (
       select 1
       from production_control.postcutover_normal_release_intents value
       where value.scope_key = 'BAGGER_INV_PRODUCTION'
         and value.status = 'PENDING'
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_NOT_SAFE';
  end if;
  perform production_control.assert_no_active_physical_writer_fence();

  insert into production_control.postcutover_normal_release_intents (
    scope_key, contract_version, status, release_sequence,
    predecessor_release_rebind_id, predecessor_deployment_id,
    predecessor_deployment_commit, target_deployment_commit,
    epoch_id, authority_generation_id, admission_generation_id,
    capability_binding_id, capability_contract, capability_ceiling,
    expected_activation_revision, expected_admission_revision,
    authorization_manifest, authorization_fingerprint,
    request_fingerprint, payload_hash, authorized_by
  ) values (
    'BAGGER_INV_PRODUCTION',
    'production-postcutover-normal-release-intent-v1', 'PENDING',
    target_sequence, predecessor.release_rebind_id,
    head.deployment_id, head.deployment_commit,
    input->>'target_deployment_commit', epoch.epoch_id,
    activation.authority_generation_id, gate.admission_generation_id,
    binding.capability_binding_id, binding.contract_version,
    binding.capability_ceiling, activation.activation_revision,
    gate.admission_revision, manifest, manifest_fingerprint,
    input->>'request_fingerprint', payload_hash,
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into existing;

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_AUTHORIZED',
    'release_intent_id', existing.release_intent_id,
    'release_sequence', existing.release_sequence,
    'target_deployment_commit', existing.target_deployment_commit,
    'status', existing.status,
    'authorization_fingerprint', existing.authorization_fingerprint,
    'idempotent', false
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_AUTHORIZED',
    'APPLICATION_RELEASE', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    input->>'request_fingerprint', 'SUCCEEDED',
    response_value - 'ok' - 'idempotent'
  );
  return response_value;
end;
$$;

revoke all on function
  production_control.authorize_production_postcutover_normal_release(jsonb)
  from public, anon, authenticated, service_role;

-- This exact intent is the already owner-authorized homepage-only redeploy.
-- It is seeded only against the known consumed 053 head; all other installs
-- remain inert and require a later explicit owner authorization.
do $$
declare
  head production_control.postcutover_normal_release_head%rowtype;
  baseline
    production_control.postcutover_application_release_rebindings%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  manifest jsonb;
  manifest_fingerprint text;
begin
  select value.* into head
  from production_control.postcutover_normal_release_head value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  if head.release_rebind_id is null
     or head.release_sequence <> 1
     or head.activation_revision <> 100
     or head.deployment_id <>
       'dpl_4CXVow7mjxqDauNB85g1NMKxGwdZ'
     or head.deployment_commit <>
       '56ded61379e3308ab5c465ce186140550f3827a7'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or activation.current_authority <> 'SUPABASE'
     or activation.maintenance_state <> 'NORMAL'
     or activation.activation_revision <> head.activation_revision
     or activation.expected_deployment_commit <> head.deployment_commit
     or gate.authority <> 'SUPABASE'
     or gate.state <> 'OPEN'
     or gate.admission_revision <> head.admission_revision
     or gate.admission_deployment_id <> head.deployment_id
  then
    return;
  end if;
  select value.* into strict baseline
  from production_control.postcutover_application_release_rebindings value
  where value.application_rebind_id = (
    select history.baseline_application_rebind_id
    from production_control.postcutover_normal_release_rebindings history
    where history.release_rebind_id = head.release_rebind_id
  );
  manifest := pg_catalog.jsonb_build_object(
    'domain', 'BAGGER_POSTCUTOVER_NORMAL_RELEASE_INTENT_V1',
    'contract_version', 'production-postcutover-normal-release-intent-v1',
    'release_sequence', 2,
    'predecessor_release_rebind_id', head.release_rebind_id,
    'predecessor_deployment_id', head.deployment_id,
    'predecessor_deployment_commit', head.deployment_commit,
    'target_deployment_commit',
      '56ded61379e3308ab5c465ce186140550f3827a7',
    'activation_revision', head.activation_revision,
    'admission_revision', head.admission_revision,
    'authority_epoch', baseline.epoch_id,
    'authority_generation', baseline.authority_generation_id,
    'admission_generation', baseline.admission_generation_id,
    'capability_binding_id', baseline.capability_binding_id,
    'capability_contract', baseline.capability_contract,
    'capability_ceiling', baseline.capability_ceiling,
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
    'supabase_project_ref', 'ymqhhtxaywtqllynrmxe',
    'google_workbook_id',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
    'tournament_id', '2026'
  );
  manifest_fingerprint := pg_catalog.encode(
    extensions.digest(manifest::text, 'sha256'), 'hex'
  );
  insert into production_control.postcutover_normal_release_intents (
    scope_key, contract_version, status, release_sequence,
    predecessor_release_rebind_id, predecessor_deployment_id,
    predecessor_deployment_commit, target_deployment_commit,
    epoch_id, authority_generation_id, admission_generation_id,
    capability_binding_id, capability_contract, capability_ceiling,
    expected_activation_revision, expected_admission_revision,
    authorization_manifest, authorization_fingerprint,
    request_fingerprint, payload_hash, authorized_by
  ) values (
    'BAGGER_INV_PRODUCTION',
    'production-postcutover-normal-release-intent-v1', 'PENDING', 2,
    head.release_rebind_id, head.deployment_id, head.deployment_commit,
    '56ded61379e3308ab5c465ce186140550f3827a7',
    baseline.epoch_id, baseline.authority_generation_id,
    baseline.admission_generation_id, baseline.capability_binding_id,
    baseline.capability_contract, baseline.capability_ceiling,
    head.activation_revision, head.admission_revision, manifest,
    manifest_fingerprint,
    pg_catalog.encode(extensions.digest(
      ('BAGGER_054_AUTHORIZED_56DED_SEQUENCE_2:' ||
       head.release_rebind_id::text)::bytea, 'sha256'
    ), 'hex'),
    pg_catalog.encode(extensions.digest(manifest::text, 'sha256'), 'hex'),
    'migration-054-owner-authorized-homepage-release'
  ) on conflict (release_sequence) do nothing;
end;
$$;

-- Preserve migration 053's exact assertion when no normal release has been
-- installed. Once a head exists, the immutable 053 row remains the baseline
-- while the serial head becomes the only accepted runtime deployment.
alter function
  production_control.assert_production_maintenance_runtime_capability(
    jsonb, text
  ) rename to
    assert_production_maintenance_runtime_capability_pre_normal_release;

revoke all on function
  production_control
    .assert_production_maintenance_runtime_capability_pre_normal_release(
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
  head production_control.postcutover_normal_release_head%rowtype;
  release production_control.postcutover_normal_release_rebindings%rowtype;
  baseline
    production_control.postcutover_application_release_rebindings%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  binding production_control.maintenance_deployment_capability_bindings%rowtype;
  rebound production_control.maintenance_runtime_deployment_rebindings%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  odds_config scoring_authority.odds_input_configurations%rowtype;
  required_rank integer := production_control.cutover_phase_rank(required_phase);
begin
  select value.* into head
  from production_control.postcutover_normal_release_head value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if not found then
    perform production_control
      .assert_production_maintenance_runtime_capability_pre_normal_release(
        input, required_phase
      );
    return;
  end if;

  perform production_control.assert_exact_cutover_resource_scope(input, true);
  select value.* into strict release
  from production_control.postcutover_normal_release_rebindings value
  where value.release_rebind_id = head.release_rebind_id;
  select value.* into strict baseline
  from production_control.postcutover_application_release_rebindings value
  where value.application_rebind_id = release.baseline_application_rebind_id;
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

  if head.release_sequence is distinct from release.release_sequence
     or head.deployment_id is distinct from release.deployment_id
     or head.deployment_commit is distinct from release.deployment_commit
     or head.activation_revision is distinct from
       release.activation_revision_after
     or head.admission_revision is distinct from
       release.admission_revision_after
     or baseline.scope_key <> 'BAGGER_INV_PRODUCTION'
     or baseline.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or baseline.capability_binding_id is distinct from
       release.capability_binding_id
     or baseline.epoch_id is distinct from release.epoch_id
     or baseline.authority_generation_id is distinct from
       release.authority_generation_id
     or baseline.admission_generation_id is distinct from
       release.admission_generation_id
     or baseline.runtime_fingerprint is distinct from pg_catalog.encode(
       extensions.digest(baseline.runtime_manifest::text, 'sha256'), 'hex'
     )
     or release.runtime_fingerprint is distinct from pg_catalog.encode(
       extensions.digest(release.runtime_manifest::text, 'sha256'), 'hex'
     )
     or activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or activation.current_authority <> 'SUPABASE'
     or activation.maintenance_state <> 'NORMAL'
     or not activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.authority_generation_id is distinct from release.epoch_id
     or activation.expected_deployment_commit is distinct from
       release.deployment_commit
     or activation.activation_revision is distinct from
       release.activation_revision_after
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.authority <> 'SUPABASE'
     or gate.state <> 'OPEN'
     or gate.admission_state <> 'CLOSED'
     or not gate.admission_protocol_enforced
     or gate.active_epoch_id is distinct from release.epoch_id
     or gate.admission_generation_id is distinct from
       release.admission_generation_id
     or gate.admission_deployment_id is distinct from release.deployment_id
     or gate.admission_revision is distinct from
       release.admission_revision_after
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.closure_kind <> 'LEGACY_ADMISSION'
     or closure.authority <> 'GOOGLE'
     or closure.status <> 'CONSUMED'
     or closure.consumed_epoch_id is distinct from release.epoch_id
     or closure.deployment_id is distinct from release.deployment_id
     or closure.closed_admission_revision is distinct from
       release.admission_revision_after
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
     or binding.capability_fingerprint is distinct from pg_catalog.encode(
       extensions.digest(binding.capability_manifest::text, 'sha256'), 'hex'
     )
     or rebound.rebind_id is distinct from binding.rebind_id
     or rebound.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or rebound.epoch_id is distinct from release.epoch_id
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
     or epoch.closed_admission_revision is distinct from
       release.admission_revision_after
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REQUIRED';
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

create or replace function
  production_control.rebind_production_postcutover_normal_release(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  baseline
    production_control.postcutover_application_release_rebindings%rowtype;
  head production_control.postcutover_normal_release_head%rowtype;
  predecessor
    production_control.postcutover_normal_release_rebindings%rowtype;
  existing production_control.postcutover_normal_release_rebindings%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  binding production_control.maintenance_deployment_capability_bindings%rowtype;
  rebound production_control.maintenance_runtime_deployment_rebindings%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  odds_config scoring_authority.odds_input_configurations%rowtype;
  odds_runtime production_control.odds_calculation_runtime%rowtype;
  authorized_intent
    production_control.postcutover_normal_release_intents%rowtype;
  target_sequence bigint;
  next_activation_revision bigint;
  next_admission_revision bigint;
  new_release_rebind_id uuid := extensions.gen_random_uuid();
  runtime_observed_at timestamptz;
  runtime_manifest jsonb;
  runtime_fingerprint text;
  response_value jsonb;
  intent_input jsonb := input - 'runtime_observed_at';
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'boundary_mode' is distinct from 'MAINTENANCE_WINDOW_V1'
     or input->>'operation' is distinct from
       'REBIND_PRODUCTION_POSTCUTOVER_NORMAL_RELEASE'
     or input->>'contract_version' is distinct from
       'production-postcutover-normal-release-rebind-v1'
     or input->>'runtime_binding_contract' is distinct from
       'production-maintenance-precommit-deployment-rebind-v2'
     or (
       input ? 'expected_release_sequence'
       and (
         pg_catalog.jsonb_typeof(input->'expected_release_sequence')
           is distinct from 'number'
         or input->>'expected_release_sequence' !~ '^[0-9]+$'
       )
     )
     or coalesce(input->>'expected_predecessor_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'expected_predecessor_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or input->>'deployment_id' =
       input->>'expected_predecessor_deployment_id'
     or coalesce(input->>'epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
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
     or input->>'runtime_deployment_hostname' ~ '-git-'
     or input->>'runtime_deployment_hostname' in (
       'bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app',
       'bagger-inv.vercel.app'
     )
     or input->>'runtime_deployment_commit' is distinct from
       input->>'deployment_commit'
     or input->>'runtime_cutover_phase' is distinct from 'SCORING_COMMIT'
     or input->>'runtime_deployment_capability_contract' is distinct from
       'production-maintenance-single-deployment-capability-v1'
     or input->>'runtime_deployment_capability_ceiling' is distinct from
       'OBSERVATION'
     or input->>'runtime_scoring_authority' is distinct from 'SUPABASE'
     or input->>'runtime_participant_identity_authority' is distinct from
       'SUPABASE'
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
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  perform production_control.bootstrap_postcutover_normal_release_baseline();

  select value.* into strict baseline
  from production_control.postcutover_application_release_rebindings value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict head
  from production_control.postcutover_normal_release_head value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict predecessor
  from production_control.postcutover_normal_release_rebindings value
  where value.release_rebind_id = head.release_rebind_id for update;

  select value.* into existing
  from production_control.postcutover_normal_release_rebindings value
  where value.request_fingerprint = pg_catalog.lower(
    input->>'request_fingerprint'
  );
  if found then
    if existing.release_kind <> 'NORMAL'
       or (
         input ? 'expected_release_sequence'
         and existing.release_sequence is distinct from
           (input->>'expected_release_sequence')::bigint
       )
       or existing.predecessor_deployment_id is distinct from
         input->>'expected_predecessor_deployment_id'
       or existing.predecessor_deployment_commit is distinct from
         input->>'expected_predecessor_deployment_commit'
       or existing.deployment_id is distinct from input->>'deployment_id'
       or existing.deployment_commit is distinct from input->>'deployment_commit'
       or existing.payload_hash is distinct from
         production_control.cutover_payload_hash(intent_input)
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REQUEST_CONFLICT';
    end if;
    if head.release_rebind_id is distinct from existing.release_rebind_id
       or head.release_sequence is distinct from existing.release_sequence
       or head.deployment_id is distinct from existing.deployment_id
       or head.deployment_commit is distinct from existing.deployment_commit
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_STALE_REPLAY';
    end if;
    return existing.response_value || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;

  target_sequence := head.release_sequence + 1;
  if input ? 'expected_release_sequence'
     and (input->>'expected_release_sequence')::bigint <> target_sequence
  then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_SEQUENCE_STALE';
  end if;

  if exists (
    select 1
    from production_control.postcutover_normal_release_rebindings value
    where value.deployment_id = input->>'deployment_id'
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_TARGET_ALREADY_USED';
  end if;

  select value.* into strict authorized_intent
  from production_control.postcutover_normal_release_intents value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
    and value.status = 'PENDING' for update;

  runtime_observed_at := (input->>'runtime_observed_at')::timestamptz;
  if runtime_observed_at is null
     or runtime_observed_at > pg_catalog.now()
     or runtime_observed_at < pg_catalog.now() - interval '5 minutes'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_RUNTIME_NOT_CURRENT';
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
  where value.capability_binding_id = baseline.capability_binding_id for update;
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
  ) order by value.worker_name for update;

  if head.release_sequence is distinct from predecessor.release_sequence
     or head.deployment_id is distinct from predecessor.deployment_id
     or head.deployment_commit is distinct from predecessor.deployment_commit
     or head.activation_revision is distinct from
       predecessor.activation_revision_after
     or head.admission_revision is distinct from
       predecessor.admission_revision_after
     or target_sequence is distinct from head.release_sequence + 1
     or authorized_intent.release_sequence is distinct from target_sequence
     or authorized_intent.predecessor_release_rebind_id is distinct from
       predecessor.release_rebind_id
     or authorized_intent.predecessor_deployment_id is distinct from
       head.deployment_id
     or authorized_intent.predecessor_deployment_commit is distinct from
       head.deployment_commit
     or authorized_intent.target_deployment_commit is distinct from
       input->>'deployment_commit'
     or authorized_intent.epoch_id is distinct from predecessor.epoch_id
     or authorized_intent.authority_generation_id is distinct from
       predecessor.authority_generation_id
     or authorized_intent.admission_generation_id is distinct from
       predecessor.admission_generation_id
     or authorized_intent.capability_binding_id is distinct from
       predecessor.capability_binding_id
     or authorized_intent.expected_activation_revision is distinct from
       head.activation_revision
     or authorized_intent.expected_admission_revision is distinct from
       head.admission_revision
     or authorized_intent.authorization_fingerprint is distinct from
       pg_catalog.encode(extensions.digest(
         authorized_intent.authorization_manifest::text, 'sha256'
       ), 'hex')
     or input->>'expected_predecessor_deployment_id' is distinct from
       head.deployment_id
     or input->>'expected_predecessor_deployment_commit' is distinct from
       head.deployment_commit
     or baseline.capability_binding_id is distinct from
       predecessor.capability_binding_id
     or baseline.epoch_id is distinct from predecessor.epoch_id
     or baseline.authority_generation_id is distinct from
       predecessor.authority_generation_id
     or baseline.admission_generation_id is distinct from
       predecessor.admission_generation_id
     or baseline.runtime_fingerprint is distinct from pg_catalog.encode(
       extensions.digest(baseline.runtime_manifest::text, 'sha256'), 'hex'
     )
     or predecessor.runtime_fingerprint is distinct from pg_catalog.encode(
       extensions.digest(predecessor.runtime_manifest::text, 'sha256'), 'hex'
     )
     or activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or activation.current_authority <> 'SUPABASE'
     or activation.maintenance_state <> 'NORMAL'
     or not activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.expected_deployment_commit is distinct from
       head.deployment_commit
     or activation.expected_vercel_project_id is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.activation_revision is distinct from head.activation_revision
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or activation.authority_generation_id is distinct from epoch.epoch_id
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
     or not resource.auth_user_creation_enabled
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
     or gate.admission_revision is distinct from head.admission_revision
     or gate.admission_deployment_id is distinct from head.deployment_id
     or gate.unresolved_client_queues <> 0
     or gate.active_closure_id is distinct from closure.closure_id
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.closure_kind <> 'LEGACY_ADMISSION'
     or closure.authority <> 'GOOGLE'
     or closure.status <> 'CONSUMED'
     or closure.consumed_epoch_id is distinct from epoch.epoch_id
     or closure.deployment_id is distinct from head.deployment_id
     or closure.closed_admission_revision is distinct from
       head.admission_revision
     or epoch.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or epoch.epoch_type <> 'CUTOVER'
     or epoch.status <> 'COMMITTED'
     or epoch.authority_before <> 'GOOGLE'
     or epoch.authority_after <> 'SUPABASE'
     or epoch.deployment_commit is distinct from head.deployment_commit
     or epoch.admission_closure_id is distinct from closure.closure_id
     or epoch.admission_generation_id is distinct from
       gate.admission_generation_id
     or epoch.closed_admission_revision is distinct from
       head.admission_revision
     or binding.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or binding.contract_version <>
       'production-maintenance-single-deployment-capability-v1'
     or binding.capability_ceiling <> 'OBSERVATION'
     or binding.epoch_id is distinct from epoch.epoch_id
     or binding.capability_fingerprint is distinct from pg_catalog.encode(
       extensions.digest(binding.capability_manifest::text, 'sha256'), 'hex'
     )
     or rebound.rebind_id is distinct from binding.rebind_id
     or rebound.epoch_id is distinct from epoch.epoch_id
     or rebound.closure_id is distinct from closure.closure_id
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
     or odds_runtime.deployment_commit is distinct from head.deployment_commit
     or odds_runtime.activation_revision is distinct from
       activation.activation_revision
     or 3 <> (
       select pg_catalog.count(*)
       from production_control.worker_controls controls
       join production_control.worker_contracts contracts using (worker_name)
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
         and controls.metadata->>'deployment_commit' = head.deployment_commit
         and controls.metadata->>'deployment_id' = head.deployment_id
         and (
           controls.worker_name = 'ODDS_CALCULATION'
           or controls.metadata->>'activation_epoch_id' = epoch.epoch_id::text
         )
     )
     or exists (
       select 1 from production_control.worker_controls controls
       where controls.worker_name not in (
         'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE',
         'ODDS_CALCULATION'
       ) and (
         controls.enabled
         or controls.scheduler_installed
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
     or not exists (
       select 1 from scoring_authority.tournaments value
       where value.tournament_id = '2026'
         and value.scoring_authority = 'SUPABASE'
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_NOT_SAFE';
  end if;
  perform production_control.assert_no_active_physical_writer_fence();

  runtime_manifest := pg_catalog.jsonb_build_object(
    'domain', 'BAGGER_POSTCUTOVER_NORMAL_RELEASE_REBIND_V1',
    'contract_version', 'production-postcutover-normal-release-rebind-v1',
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'release_sequence', target_sequence,
    'predecessor_release_sequence', head.release_sequence,
    'release_intent_id', authorized_intent.release_intent_id,
    'release_intent_fingerprint',
      authorized_intent.authorization_fingerprint,
    'predecessor_deployment_id', head.deployment_id,
    'predecessor_release_sha', head.deployment_commit,
    'deployment_id', input->>'deployment_id',
    'release_sha', input->>'deployment_commit',
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
  set expected_deployment_commit = input->>'deployment_commit',
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
  set deployment_commit = input->>'deployment_commit',
      closed_admission_revision = next_admission_revision
  where epoch_id = epoch.epoch_id;
  update production_control.worker_controls
  set last_verified_at = runtime_observed_at,
      metadata = metadata || pg_catalog.jsonb_build_object(
        'deployment_commit', input->>'deployment_commit',
        'deployment_id', input->>'deployment_id',
        'runtime_revision', case
          when worker_name = 'ODDS_CALCULATION'
            then pg_catalog.to_jsonb(odds_runtime.runtime_revision + 1)
          else metadata->'runtime_revision'
        end,
        'postcutover_normal_release_sequence', target_sequence,
        'postcutover_normal_release_rebind_id', new_release_rebind_id,
        'postcutover_normal_release_rebound_at', pg_catalog.now()
      )
  where worker_name in (
    'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE', 'ODDS_CALCULATION'
  );
  update production_control.odds_calculation_runtime
  set deployment_commit = input->>'deployment_commit',
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
    'code', 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REBOUND',
    'release_rebind_id', new_release_rebind_id,
    'release_sequence', target_sequence,
    'predecessor_release_sequence', head.release_sequence,
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'deployment_commit', input->>'deployment_commit',
    'predecessor_deployment_id', head.deployment_id,
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

  insert into production_control.postcutover_normal_release_rebindings (
    release_rebind_id, scope_key, boundary_mode, contract_version,
    release_kind, release_sequence, predecessor_release_sequence,
    baseline_application_rebind_id, predecessor_release_rebind_id,
    capability_binding_id, tournament_id, epoch_id,
    authority_generation_id, admission_generation_id,
    predecessor_deployment_id, predecessor_deployment_commit,
    deployment_id, deployment_commit, deployment_hostname,
    vercel_project_id, vercel_team_id,
    capability_contract, capability_ceiling,
    activation_revision_before, activation_revision_after,
    admission_revision_before, admission_revision_after,
    runtime_manifest, runtime_fingerprint, runtime_observed_at,
    request_fingerprint, payload_hash, actor_id, response_value
  ) values (
    new_release_rebind_id, 'BAGGER_INV_PRODUCTION',
    'MAINTENANCE_WINDOW_V1',
    'production-postcutover-normal-release-rebind-v1',
    'NORMAL', target_sequence, head.release_sequence,
    baseline.application_rebind_id, predecessor.release_rebind_id,
    baseline.capability_binding_id, '2026', epoch.epoch_id,
    activation.authority_generation_id, gate.admission_generation_id,
    head.deployment_id, head.deployment_commit,
    input->>'deployment_id', input->>'deployment_commit',
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

  update production_control.postcutover_normal_release_intents
  set status = 'CONSUMED',
      consumed_release_rebind_id = new_release_rebind_id,
      consumed_at = pg_catalog.now()
  where release_intent_id = authorized_intent.release_intent_id
    and status = 'PENDING';
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_ADVANCED';
  end if;

  update production_control.postcutover_normal_release_head
  set release_sequence = target_sequence,
      release_rebind_id = new_release_rebind_id,
      deployment_id = input->>'deployment_id',
      deployment_commit = input->>'deployment_commit',
      activation_revision = next_activation_revision,
      admission_revision = next_admission_revision,
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
    and production_control.postcutover_normal_release_head.release_rebind_id =
      predecessor.release_rebind_id;
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_HEAD_ADVANCED';
  end if;

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'POSTCUTOVER_NORMAL_RELEASE_REBOUND',
    pg_catalog.left(input->>'actor_id', 160),
    response_value - 'ok' - 'idempotent'
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REBOUND',
    'APPLICATION_RELEASE', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    response_value - 'ok' - 'idempotent'
  );
  perform production_control.store_cutover_receipt(
    'REBIND_POSTCUTOVER_NORMAL_RELEASE', intent_input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  production_control.rebind_production_postcutover_normal_release(jsonb)
  from public, anon, authenticated, service_role;

create or replace function
  public.rebind_production_postcutover_normal_release(input jsonb)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select production_control.rebind_production_postcutover_normal_release(input)
$$;

revoke all on function
  public.rebind_production_postcutover_normal_release(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.rebind_production_postcutover_normal_release(jsonb)
  to service_role;

-- Exact 56ded and later compatible runtimes already call the protected v2
-- precommit endpoint. Preserve its original behavior through sequence 1, then
-- adapt only an owner-authorized OBSERVATION release to the serial contract.
alter function
  public.rebind_production_maintenance_precommit_deployment(jsonb)
  rename to
    rebind_production_maintenance_precommit_deployment_pre_normal_release;

revoke all on function
  public
    .rebind_production_maintenance_precommit_deployment_pre_normal_release(
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
  head production_control.postcutover_normal_release_head%rowtype;
  predecessor
    production_control.postcutover_normal_release_rebindings%rowtype;
  intent production_control.postcutover_normal_release_intents%rowtype;
  replay production_control.postcutover_normal_release_rebindings%rowtype;
  normalized jsonb;
begin
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into head
  from production_control.postcutover_normal_release_head value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';

  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or head.release_rebind_id is null
  then
    return public
      .rebind_production_maintenance_precommit_deployment_pre_normal_release(
        input
      );
  end if;

  select value.* into replay
  from production_control.postcutover_normal_release_rebindings value
  where value.release_kind = 'NORMAL'
    and value.request_fingerprint = pg_catalog.lower(
      input->>'request_fingerprint'
    );
  if found then
    normalized := input || pg_catalog.jsonb_build_object(
      'operation', 'REBIND_PRODUCTION_POSTCUTOVER_NORMAL_RELEASE',
      'contract_version',
        'production-postcutover-normal-release-rebind-v1',
      'expected_predecessor_deployment_id',
        replay.predecessor_deployment_id,
      'expected_predecessor_deployment_commit',
        replay.predecessor_deployment_commit,
      'expected_release_sequence', replay.release_sequence
    );
    return production_control.rebind_production_postcutover_normal_release(
      normalized
    );
  end if;

  select value.* into intent
  from production_control.postcutover_normal_release_intents value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
    and value.status = 'PENDING';
  if found then
    normalized := input || pg_catalog.jsonb_build_object(
      'operation', 'REBIND_PRODUCTION_POSTCUTOVER_NORMAL_RELEASE',
      'contract_version',
        'production-postcutover-normal-release-rebind-v1',
      'expected_predecessor_deployment_id',
        input->>'original_deployment_id',
      'expected_predecessor_deployment_commit',
        intent.predecessor_deployment_commit,
      'expected_release_sequence', intent.release_sequence
    );
    return production_control.rebind_production_postcutover_normal_release(
      normalized
    );
  end if;

  select value.* into strict predecessor
  from production_control.postcutover_normal_release_rebindings value
  where value.release_rebind_id = head.release_rebind_id;
  if predecessor.release_kind = 'BASELINE_053'
     and input->>'deployment_id' is not distinct from head.deployment_id
     and input->>'deployment_commit' is not distinct from
       head.deployment_commit
  then
    return public
      .rebind_production_maintenance_precommit_deployment_pre_normal_release(
        input
      );
  end if;

  raise exception using errcode = '55000',
    message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_REQUIRED';
end;
$$;

revoke all on function
  public.rebind_production_maintenance_precommit_deployment(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.rebind_production_maintenance_precommit_deployment(jsonb)
  to service_role;

comment on function
  public.rebind_production_postcutover_normal_release(jsonb)
is
  'Serial OBSERVATION-only Production application release rebind. Requires the exact current predecessor, next sequence, Ready Production runtime, active epoch/generations, and unchanged capability/resource safety state.';

comment on table
  production_control.postcutover_normal_release_rebindings
is
  'Append-only sequence ledger rooted at migration 053. Every normal post-cutover release records exact predecessor, runtime attestation, revisions, and response.';

comment on table production_control.postcutover_normal_release_head
is
  'Single effective post-cutover Production deployment head. Authority, phase, generations, workers, and tournament facts remain controlled by their existing tables.';

notify pgrst, 'reload schema';
commit;
