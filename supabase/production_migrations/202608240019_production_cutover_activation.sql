-- Step 11 reviewed Production cutover activation contract.
--
-- Applying this migration is inert: Production remains Google scoring,
-- Passport identity, Supabase scoring ingress disabled, Google writes disabled,
-- and every worker disabled.  State can move only through the service-role-only
-- RPCs defined below with the exact Production resource tuple and a staged,
-- frozen deployment SHA.
begin;

-- The foundation deliberately made authority flags permanently false/legacy.
-- Add the control-plane audit timestamp used by later authority mutations, then
-- replace those one-way checks with bounded value checks while preserving every
-- existing authority/source value and default.
alter table production_control.resource_scope
  add column if not exists updated_at timestamptz not null default now();

alter table production_control.resource_scope
  drop constraint if exists resource_scope_current_tournament_read_authority_check,
  drop constraint if exists resource_scope_scoring_authority_check,
  drop constraint if exists resource_scope_participant_identity_authority_check,
  drop constraint if exists resource_scope_public_supabase_reads_enabled_check,
  drop constraint if exists resource_scope_scoring_ingress_enabled_check,
  drop constraint if exists resource_scope_google_writes_enabled_check,
  drop constraint if exists resource_scope_auth_user_creation_enabled_check,
  drop constraint if exists resource_scope_odds_publication_enabled_check,
  drop constraint if exists resource_scope_workers_enabled_check;

alter table production_control.resource_scope
  add constraint production_resource_current_read_authority_check
    check (current_tournament_read_authority in ('GOOGLE', 'SUPABASE')),
  add constraint production_resource_scoring_authority_check
    check (scoring_authority in ('GOOGLE', 'SUPABASE')),
  add constraint production_resource_identity_authority_check
    check (participant_identity_authority in ('PASSPORT', 'SUPABASE'));

alter table production_control.worker_controls
  drop constraint if exists worker_controls_enabled_check,
  drop constraint if exists worker_controls_scheduler_installed_check,
  drop constraint if exists worker_controls_google_writes_allowed_check;

alter table production_control.worker_contracts
  drop constraint if exists worker_contracts_operation_allowed_check,
  drop constraint if exists worker_contracts_scheduler_installed_check,
  drop constraint if exists worker_contracts_authoritative_write_allowed_check;

create table production_control.cutover_activation_state (
  scope_key text primary key
    references production_control.resource_scope(scope_key) on delete restrict,
  contract_version text not null
    check (contract_version = 'production-cutover-activation-v1'),
  state text not null default 'DORMANT' check (state in (
    'DORMANT', 'STAGED', 'GOOGLE_LEASE_ARMED', 'CUTOVER_PREPARED',
    'SCORING_COMMITTED', 'ROLLBACK_PREPARED', 'ROLLED_BACK'
  )),
  activation_revision bigint not null default 0 check (activation_revision >= 0),
  expected_deployment_commit text
    check (expected_deployment_commit is null or expected_deployment_commit ~ '^[0-9a-f]{40}$'),
  expected_vercel_project_id text
    check (expected_vercel_project_id is null
      or expected_vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'),
  expected_source_fingerprint text
    check (expected_source_fingerprint is null or expected_source_fingerprint ~ '^[0-9a-f]{64}$'),
  expected_google_service_account text not null
    default 'sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com'
    check (expected_google_service_account = 'sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com'),
  authority_generation_id uuid not null default extensions.gen_random_uuid(),
  current_authority text not null default 'GOOGLE'
    check (current_authority in ('GOOGLE', 'SUPABASE')),
  scoring_ingress_enabled boolean not null default false,
  active_transition_epoch_id uuid
    references scoring_authority.authority_epochs(epoch_id) on delete restrict,
  first_supabase_write_possible_at timestamptz,
  first_supabase_write_observed_at timestamptz,
  first_supabase_mutation_key text,
  first_supabase_match_id text,
  first_supabase_match_revision bigint,
  staged_by text,
  staged_at timestamptz,
  updated_by text not null default 'production-foundation-migration',
  updated_at timestamptz not null default now(),
  check (
    (state = 'DORMANT' and expected_deployment_commit is null
      and expected_vercel_project_id is null and expected_source_fingerprint is null)
    or state <> 'DORMANT'
  ),
  check (not scoring_ingress_enabled or current_authority = 'SUPABASE'),
  check (
    first_supabase_write_observed_at is null
    or (first_supabase_write_possible_at is not null
      and first_supabase_mutation_key is not null
      and first_supabase_match_id is not null
      and first_supabase_match_revision is not null)
  )
);

insert into production_control.cutover_activation_state (
  scope_key, contract_version
) values (
  'BAGGER_INV_PRODUCTION', 'production-cutover-activation-v1'
)
on conflict (scope_key) do nothing;

create table production_control.cutover_operation_receipts (
  request_fingerprint text primary key check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  operation text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  actor text not null,
  created_at timestamptz not null default now()
);

alter table production_control.cutover_activation_state enable row level security;
alter table production_control.cutover_operation_receipts enable row level security;

alter table scoring_authority.authority_epochs
  add column if not exists request_fingerprint text,
  add column if not exists source_fingerprint text,
  add column if not exists prepared_activation_revision bigint,
  add column if not exists prior_active_epoch_id uuid,
  add column if not exists aborted_at timestamptz;

alter table scoring_authority.authority_epochs
  add constraint production_authority_epoch_request_fingerprint_check
    check (request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_authority_epoch_source_fingerprint_check
    check (source_fingerprint is null or source_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_authority_epoch_reconciliation_fingerprint_check
    check (reconciliation_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_authority_epoch_deployment_commit_check
    check (deployment_commit ~ '^[0-9a-f]{40}$'),
  add constraint production_authority_epoch_prior_active_fkey
    foreign key (prior_active_epoch_id)
    references scoring_authority.authority_epochs(epoch_id) on delete restrict;

create unique index production_authority_epoch_request_fingerprint_idx
  on scoring_authority.authority_epochs(request_fingerprint)
  where request_fingerprint is not null;

create unique index production_authority_one_prepared_epoch_idx
  on scoring_authority.authority_epochs(tournament_id)
  where status = 'PREPARED';

alter table scoring_authority.scoring_ingress_leases
  add column if not exists operation text,
  add column if not exists authority_generation_id uuid,
  add column if not exists deployment_commit text,
  add column if not exists request_fingerprint text,
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists completed_at timestamptz;

alter table scoring_authority.scoring_ingress_leases
  add constraint production_scoring_lease_operation_check
    check (operation is null or operation ~ '^[A-Z0-9:_-]{3,100}$'),
  add constraint production_scoring_lease_deployment_commit_check
    check (deployment_commit is null or deployment_commit ~ '^[0-9a-f]{40}$'),
  add constraint production_scoring_lease_request_fingerprint_check
    check (request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_status_check
    check (status in ('ACTIVE', 'COMPLETED', 'EXPIRED'));

create index if not exists production_scoring_ingress_active_idx
  on scoring_authority.scoring_ingress_leases(tournament_id, status, expires_at);

create unique index if not exists production_scoring_ingress_request_idx
  on scoring_authority.scoring_ingress_leases(request_fingerprint)
  where status = 'ACTIVE' and request_fingerprint is not null;

create or replace function production_control.assert_production_service_role()
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control
as $$
declare
  claim_role text;
  claims_text text;
begin
  claims_text := nullif(current_setting('request.jwt.claims', true), '');
  claim_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    case when claims_text is null then null else claims_text::jsonb->>'role' end
  );
  if claim_role is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'PRODUCTION_SERVICE_ROLE_REQUIRED';
  end if;
end;
$$;

create or replace function production_control.cutover_payload_hash(input jsonb)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, production_control, extensions
as $$
  select encode(extensions.digest(input::text, 'sha256'), 'hex')
$$;

create or replace function production_control.assert_exact_cutover_resource_scope(
  input jsonb,
  require_staged_release boolean default true
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control
as $$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
begin
  perform production_control.assert_production_service_role();

  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';

  if resource.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or resource.project_url <> 'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or resource.google_workbook_id <> '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or resource.vercel_project <> 'bagger-inv'
     or resource.canonical_domain <> 'https://baggerinv.com'
     or resource.current_tournament_id <> '2026'
     or resource.current_tournament_year <> 2026 then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_RESOURCE_SCOPE_INVALID';
  end if;

  if upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'project_ref' is distinct from resource.project_ref
     or input->>'project_url' is distinct from resource.project_url
     or input->>'source_workbook_id' is distinct from resource.google_workbook_id
     or input->>'tournament_id' is distinct from resource.current_tournament_id then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_RESOURCE_ASSERTION_FAILED';
  end if;

  if require_staged_release then
    if activation.state = 'DORMANT'
       or activation.expected_deployment_commit is null
       or activation.expected_vercel_project_id
          is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
       or input->>'deployment_commit' is distinct from activation.expected_deployment_commit then
      raise exception using errcode = 'P0001', message = 'PRODUCTION_EXACT_RELEASE_REQUIRED';
    end if;
  end if;
end;
$$;

create or replace function production_control.lookup_cutover_receipt(
  requested_operation text,
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control
as $$
declare
  fingerprint text := lower(coalesce(input->>'request_fingerprint', ''));
  input_hash text := production_control.cutover_payload_hash(input);
  receipt production_control.cutover_operation_receipts%rowtype;
begin
  if fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_REQUEST_FINGERPRINT_INVALID';
  end if;
  select * into receipt
  from production_control.cutover_operation_receipts
  where request_fingerprint = fingerprint;
  if not found then return null; end if;
  if receipt.operation <> requested_operation or receipt.payload_hash <> input_hash then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_IDEMPOTENCY_CONFLICT';
  end if;
  return receipt.response || jsonb_build_object('idempotent', true);
end;
$$;

create or replace function production_control.store_cutover_receipt(
  requested_operation text,
  input jsonb,
  response_value jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control
as $$
begin
  insert into production_control.cutover_operation_receipts (
    request_fingerprint, operation, payload_hash, response, actor
  ) values (
    lower(input->>'request_fingerprint'), requested_operation,
    production_control.cutover_payload_hash(input), response_value,
    left(coalesce(nullif(input->>'actor_id', ''), 'production-cutover-operator'), 160)
  );
end;
$$;

create or replace function production_control.current_match_revisions(
  target_tournament_id text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, scoring_authority
as $$
  select coalesce(
    jsonb_object_agg(match_id, match_revision order by match_id),
    '{}'::jsonb
  )
  from scoring_authority.matches
  where tournament_id = target_tournament_id
$$;

create or replace function production_control.current_google_checkpoints(
  target_tournament_id text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, scoring_authority
as $$
  select coalesce(
    jsonb_object_agg(
      match_value.match_id,
      jsonb_build_object(
        'last_supabase_match_revision', checkpoint.last_supabase_match_revision,
        'google_match_revision', checkpoint.google_match_revision,
        'google_hole_revisions', checkpoint.google_hole_revisions,
        'verified_fingerprint', checkpoint.verified_fingerprint
      ) order by match_value.match_id
    ),
    '{}'::jsonb
  )
  from scoring_authority.matches match_value
  left join scoring_authority.google_match_checkpoints checkpoint
    on checkpoint.match_id = match_value.match_id
  where match_value.tournament_id = target_tournament_id
$$;

create or replace function public.stage_production_cutover_release(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  expected_revision bigint;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  existing := production_control.lookup_cutover_receipt('STAGE_RELEASE', input);
  if existing is not null then return existing; end if;

  if coalesce(input->>'actor_id', '') = ''
     or input->>'contract_version' is distinct from 'production-cutover-activation-v1'
     or input->>'vercel_project' is distinct from 'bagger-inv'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or input->>'vercel_project_id'
        is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or coalesce(input->>'deployment_commit', '') !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'source_fingerprint', '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_RELEASE_CONFIGURATION_INVALID';
  end if;

  expected_revision := coalesce((input->>'expected_activation_revision')::bigint, -1);
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  if activation.activation_revision <> expected_revision then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_ACTIVATION_REVISION_CONFLICT';
  end if;
  if activation.state not in ('DORMANT', 'STAGED', 'ROLLED_BACK')
     or activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or resource.scoring_authority <> 'GOOGLE'
     or resource.scoring_ingress_enabled
     or resource.google_writes_enabled
     or exists (
       select 1 from production_control.worker_controls
       where enabled or google_writes_allowed
     ) then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_RELEASE_CANNOT_BE_RESTAGED';
  end if;

  update production_control.cutover_activation_state
  set state = 'STAGED', activation_revision = activation_revision + 1,
      expected_deployment_commit = lower(input->>'deployment_commit'),
      expected_vercel_project_id = input->>'vercel_project_id',
      expected_source_fingerprint = lower(input->>'source_fingerprint'),
      staged_by = left(input->>'actor_id', 160), staged_at = now(),
      updated_by = left(input->>'actor_id', 160), updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_CUTOVER_RELEASE_STAGED', 'SCORING_AUTHORITY', '2026',
    left(input->>'actor_id', 160), lower(input->>'request_fingerprint'), 'SUCCEEDED',
    jsonb_build_object(
      'activation_revision', activation.activation_revision,
      'deployment_commit', activation.expected_deployment_commit,
      'source_fingerprint', activation.expected_source_fingerprint,
      'authority_changed', false,
      'scoring_ingress_enabled', false,
      'workers_enabled', false
    )
  );

  response_value := jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_RELEASE_STAGED',
    'state', activation.state,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'authority', activation.current_authority,
    'scoring_ingress_enabled', activation.scoring_ingress_enabled,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt('STAGE_RELEASE', input, response_value);
  return response_value;
end;
$$;

create or replace function public.arm_production_google_ingress_lease_gate(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  expected_revision bigint;
  expected_generation uuid;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  existing := production_control.lookup_cutover_receipt('ARM_GOOGLE_LEASE_GATE', input);
  if existing is not null then return existing; end if;

  if coalesce(input->>'actor_id', '') = '' then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_CUTOVER_ACTOR_REQUIRED';
  end if;

  expected_revision := coalesce((input->>'expected_activation_revision')::bigint, -1);
  expected_generation := nullif(input->>'expected_epoch_id', '')::uuid;
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates
  where tournament_id = '2026'
  for update;

  if activation.activation_revision <> expected_revision
     or activation.authority_generation_id <> expected_generation then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_ACTIVATION_REVISION_CONFLICT';
  end if;
  if activation.state <> 'STAGED' or activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or gate.authority <> 'GOOGLE'
     or gate.active_epoch_id is not null
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases
       where tournament_id = '2026' and status = 'ACTIVE' and expires_at > now()
     ) then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_GOOGLE_LEASE_GATE_NOT_ARMABLE';
  end if;

  update scoring_authority.ingress_gates
  set state = 'OPEN', active_epoch_id = null, unresolved_client_queues = 0,
      updated_by = left(input->>'actor_id', 160), updated_at = now()
  where tournament_id = '2026';
  update production_control.cutover_activation_state
  set state = 'GOOGLE_LEASE_ARMED', activation_revision = activation_revision + 1,
      updated_by = left(input->>'actor_id', 160), updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ARMED', 'SCORING_AUTHORITY', '2026',
    left(input->>'actor_id', 160), lower(input->>'request_fingerprint'), 'SUCCEEDED',
    jsonb_build_object(
      'authority_generation_id', activation.authority_generation_id,
      'authority', 'GOOGLE', 'canonical_authority_changed', false,
      'supabase_scoring_ingress_enabled', false
    )
  );

  response_value := jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_GOOGLE_LEASE_GATE_ARMED',
    'activation_revision', activation.activation_revision,
    'epoch_id', activation.authority_generation_id,
    'authority', 'GOOGLE', 'ingress', 'OPEN', 'idempotent', false
  );
  perform production_control.store_cutover_receipt('ARM_GOOGLE_LEASE_GATE', input, response_value);
  return response_value;
end;
$$;

create or replace function public.begin_production_scoring_ingress(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  expected_epoch uuid;
  expected_authority text := upper(coalesce(input->>'expected_authority', ''));
  input_hash text := production_control.cutover_payload_hash(input);
  lease scoring_authority.scoring_ingress_leases%rowtype;
  active_count integer;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  if expected_authority not in ('GOOGLE', 'SUPABASE')
     or coalesce(input->>'operation', '') !~ '^[A-Z0-9:_-]{3,100}$'
     or coalesce(input->>'match_id', '') = ''
     or not exists (
       select 1 from scoring_authority.matches
       where tournament_id = '2026' and match_id = input->>'match_id'
     ) then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_SCORING_INGRESS_REQUEST_INVALID';
  end if;
  expected_epoch := nullif(input->>'expected_epoch_id', '')::uuid;

  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates
  where tournament_id = '2026'
  for update;

  update scoring_authority.scoring_ingress_leases
  set status = 'EXPIRED', completed_at = now()
  where tournament_id = '2026' and status = 'ACTIVE' and expires_at <= now();

  select * into lease
  from scoring_authority.scoring_ingress_leases
  where request_fingerprint = input_hash and status = 'ACTIVE' and expires_at > now();
  if found then
    return jsonb_build_object(
      'ok', true, 'lease_id', lease.lease_id, 'authority', lease.authority,
      'epoch_id', lease.authority_generation_id, 'ingress', gate.state,
      'idempotent', true
    );
  end if;

  if gate.state <> 'OPEN'
     or gate.authority <> expected_authority
     or activation.current_authority <> expected_authority
     or activation.authority_generation_id <> expected_epoch
     or (expected_authority = 'GOOGLE' and activation.state <> 'GOOGLE_LEASE_ARMED')
     or (expected_authority = 'SUPABASE'
       and (activation.state <> 'SCORING_COMMITTED' or not activation.scoring_ingress_enabled)) then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_SCORING_AUTHORITY_BOUNDARY_MISMATCH';
  end if;

  insert into scoring_authority.scoring_ingress_leases (
    tournament_id, match_id, authority, actor_id, expires_at,
    operation, authority_generation_id, deployment_commit,
    request_fingerprint, status
  ) values (
    '2026', input->>'match_id', expected_authority,
    left(coalesce(nullif(input->>'actor_id', ''), 'Authorized Production scorer'), 160),
    now() + make_interval(secs => greatest(30, least(coalesce((input->>'lease_seconds')::integer, 180), 300))),
    input->>'operation', activation.authority_generation_id,
    activation.expected_deployment_commit, input_hash, 'ACTIVE'
  ) returning * into lease;

  select count(*)::integer into active_count
  from scoring_authority.scoring_ingress_leases
  where tournament_id = '2026' and status = 'ACTIVE' and expires_at > now();
  update scoring_authority.ingress_gates
  set unresolved_client_queues = active_count, updated_at = now()
  where tournament_id = '2026';

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_INGRESS_LEASE_BEGAN', 'SCORING_AUTHORITY', '2026',
    lease.actor_id, input_hash, 'SUCCEEDED',
    jsonb_build_object(
      'lease_id', lease.lease_id, 'match_id', lease.match_id,
      'operation', lease.operation, 'authority', lease.authority,
      'authority_generation_id', lease.authority_generation_id,
      'expires_at', lease.expires_at
    )
  );

  return jsonb_build_object(
    'ok', true, 'lease_id', lease.lease_id, 'authority', lease.authority,
    'epoch_id', lease.authority_generation_id, 'ingress', gate.state,
    'active_leases', active_count, 'idempotent', false
  );
end;
$$;

create or replace function public.complete_production_scoring_ingress(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  expected_epoch uuid;
  active_count integer;
  completed_now boolean := false;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  expected_epoch := nullif(input->>'expected_epoch_id', '')::uuid;
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  if activation.authority_generation_id <> expected_epoch then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_SCORING_AUTHORITY_EPOCH_MISMATCH';
  end if;

  select * into lease
  from scoring_authority.scoring_ingress_leases
  where lease_id = nullif(input->>'lease_id', '')::uuid
  for update;
  if not found then
    return jsonb_build_object('ok', true, 'idempotent', true, 'active_leases',
      (select count(*) from scoring_authority.scoring_ingress_leases
       where tournament_id = '2026' and status = 'ACTIVE' and expires_at > now()));
  end if;
  if lease.authority_generation_id <> expected_epoch
     or lease.deployment_commit <> activation.expected_deployment_commit then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_SCORING_LEASE_SCOPE_MISMATCH';
  end if;
  if lease.status = 'ACTIVE' then
    completed_now := true;
    update scoring_authority.scoring_ingress_leases
    set status = 'COMPLETED', completed_at = now()
    where lease_id = lease.lease_id;
  end if;
  select count(*)::integer into active_count
  from scoring_authority.scoring_ingress_leases
  where tournament_id = '2026' and status = 'ACTIVE' and expires_at > now();
  update scoring_authority.ingress_gates
  set unresolved_client_queues = active_count, updated_at = now()
  where tournament_id = '2026';

  if completed_now then
    insert into production_control.operation_audit_events (
      event_type, domain, tournament_id, actor, request_fingerprint, result, details
    ) values (
      'PRODUCTION_SCORING_INGRESS_LEASE_COMPLETED', 'SCORING_AUTHORITY', '2026',
      lease.actor_id, lease.request_fingerprint, 'SUCCEEDED',
      jsonb_build_object('lease_id', lease.lease_id, 'active_leases', active_count)
    );
  end if;
  return jsonb_build_object(
    'ok', true, 'idempotent', not completed_now,
    'active_leases', active_count
  );
end;
$$;

create or replace function public.prepare_production_authority_epoch(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  requested_type text := upper(coalesce(input->>'epoch_type', ''));
  expected_revision bigint;
  expected_generation uuid;
  current_revisions jsonb;
  current_checkpoints jsonb;
  active_leases integer;
  unresolved_outbox integer;
  unresolved_archive integer;
  epoch scoring_authority.authority_epochs%rowtype;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  existing := production_control.lookup_cutover_receipt('PREPARE_AUTHORITY_EPOCH', input);
  if existing is not null then return existing; end if;

  if coalesce(input->>'actor_id', '') = ''
     or requested_type not in ('CUTOVER', 'ROLLBACK')
     or coalesce(input->>'reconciliation_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'source_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(input->'google_checkpoints') is distinct from 'object'
     or jsonb_typeof(input->'supabase_match_revisions') is distinct from 'object' then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_AUTHORITY_PREPARE_INPUT_INVALID';
  end if;
  expected_revision := coalesce((input->>'expected_activation_revision')::bigint, -1);
  expected_generation := nullif(input->>'expected_epoch_id', '')::uuid;

  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates
  where tournament_id = '2026'
  for update;

  update scoring_authority.scoring_ingress_leases
  set status = 'EXPIRED', completed_at = now()
  where tournament_id = '2026' and status = 'ACTIVE' and expires_at <= now();
  select count(*)::integer into active_leases
  from scoring_authority.scoring_ingress_leases
  where tournament_id = '2026' and status = 'ACTIVE' and expires_at > now();
  update scoring_authority.ingress_gates
  set unresolved_client_queues = active_leases, updated_at = now()
  where tournament_id = '2026';

  current_revisions := production_control.current_match_revisions('2026');
  current_checkpoints := production_control.current_google_checkpoints('2026');
  select count(*)::integer into unresolved_outbox
  from scoring_authority.google_outbox_events
  where tournament_id = '2026' and status <> 'DELIVERED';
  select count(*)::integer into unresolved_archive
  from scoring_authority.scorecard_archive_jobs
  where tournament_id = '2026' and status not in ('VERIFIED', 'SUPERSEDED');

  if activation.activation_revision <> expected_revision
     or activation.authority_generation_id <> expected_generation
     or active_leases <> 0
     or gate.state <> 'OPEN'
     or input->'supabase_match_revisions' <> current_revisions
     or input->'google_checkpoints' <> current_checkpoints
     or exists (
       select 1
       from scoring_authority.matches match_value
       left join scoring_authority.google_match_checkpoints checkpoint using (match_id)
       where match_value.tournament_id = '2026' and checkpoint.match_id is null
     ) then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_AUTHORITY_RECONCILIATION_CHANGED';
  end if;

  if requested_type = 'CUTOVER' then
    if activation.state <> 'GOOGLE_LEASE_ARMED'
       or activation.current_authority <> 'GOOGLE'
       or activation.scoring_ingress_enabled
       or gate.authority <> 'GOOGLE'
       or activation.expected_source_fingerprint <> lower(input->>'source_fingerprint')
       or unresolved_outbox <> 0 then
      raise exception using errcode = 'P0001', message = 'PRODUCTION_CUTOVER_NOT_PREPARABLE';
    end if;
  else
    if activation.state <> 'SCORING_COMMITTED'
       or activation.current_authority <> 'SUPABASE'
       or not activation.scoring_ingress_enabled
       or gate.authority <> 'SUPABASE'
       or activation.expected_source_fingerprint
          <> lower(coalesce(input->>'expected_prior_source_fingerprint', ''))
       or unresolved_outbox <> 0
       or unresolved_archive <> 0
       or exists (
         select 1
         from scoring_authority.matches match_value
         left join scoring_authority.google_match_checkpoints checkpoint using (match_id)
         where match_value.tournament_id = '2026'
           and checkpoint.last_supabase_match_revision is distinct from match_value.match_revision
       ) then
      raise exception using errcode = 'P0001', message = 'PRODUCTION_ROLLBACK_RECONCILIATION_INCOMPLETE';
    end if;
  end if;

  insert into scoring_authority.authority_epochs (
    tournament_id, epoch_type, status, authority_before, authority_after,
    reconciliation_fingerprint, google_checkpoints, supabase_match_revisions,
    deployment_commit, actor_id, reason, request_fingerprint,
    source_fingerprint, prepared_activation_revision, prior_active_epoch_id
  ) values (
    '2026', requested_type, 'PREPARED', activation.current_authority,
    case when requested_type = 'CUTOVER' then 'SUPABASE' else 'GOOGLE' end,
    lower(input->>'reconciliation_fingerprint'), current_checkpoints, current_revisions,
    activation.expected_deployment_commit, left(input->>'actor_id', 160),
    left(coalesce(input->>'reason', ''), 500), lower(input->>'request_fingerprint'),
    lower(input->>'source_fingerprint'), activation.activation_revision,
    gate.active_epoch_id
  ) returning * into epoch;

  update scoring_authority.ingress_gates
  set state = 'PAUSED', active_epoch_id = epoch.epoch_id,
      unresolved_client_queues = 0,
      updated_by = left(input->>'actor_id', 160), updated_at = now()
  where tournament_id = '2026';
  update production_control.cutover_activation_state
  set state = case when requested_type = 'CUTOVER' then 'CUTOVER_PREPARED' else 'ROLLBACK_PREPARED' end,
      activation_revision = activation_revision + 1,
      expected_source_fingerprint = lower(input->>'source_fingerprint'),
      active_transition_epoch_id = epoch.epoch_id,
      updated_by = left(input->>'actor_id', 160), updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', requested_type || '_EPOCH_PREPARED', left(input->>'actor_id', 160),
    jsonb_build_object(
      'epoch_id', epoch.epoch_id, 'authority_before', epoch.authority_before,
      'authority_after', epoch.authority_after,
      'reconciliation_fingerprint', epoch.reconciliation_fingerprint,
      'source_fingerprint', epoch.source_fingerprint,
      'deployment_commit', epoch.deployment_commit
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_' || requested_type || '_EPOCH_PREPARED', 'SCORING_AUTHORITY', '2026',
    left(input->>'actor_id', 160), lower(input->>'request_fingerprint'), 'SUCCEEDED',
    jsonb_build_object('epoch_id', epoch.epoch_id, 'ingress', 'PAUSED',
      'active_leases', 0, 'unresolved_outbox', unresolved_outbox,
      'unresolved_archive', unresolved_archive)
  );

  response_value := jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_AUTHORITY_EPOCH_PREPARED',
    'epoch_id', epoch.epoch_id, 'epoch_type', requested_type,
    'authority', epoch.authority_before, 'authority_after', epoch.authority_after,
    'ingress', 'PAUSED', 'activation_revision', activation.activation_revision,
    'first_supabase_canonical_write_possible', false, 'idempotent', false
  );
  perform production_control.store_cutover_receipt('PREPARE_AUTHORITY_EPOCH', input, response_value);
  return response_value;
end;
$$;

create or replace function public.commit_production_authority_epoch(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  active_leases integer;
  unresolved_outbox integer;
  unresolved_archive integer;
  boundary_at timestamptz;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  existing := production_control.lookup_cutover_receipt('COMMIT_AUTHORITY_EPOCH', input);
  if existing is not null then return existing; end if;

  if coalesce(input->>'actor_id', '') = '' then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_CUTOVER_ACTOR_REQUIRED';
  end if;

  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates
  where tournament_id = '2026'
  for update;
  select * into epoch
  from scoring_authority.authority_epochs
  where epoch_id = nullif(input->>'epoch_id', '')::uuid
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_AUTHORITY_EPOCH_NOT_FOUND';
  end if;

  update scoring_authority.scoring_ingress_leases
  set status = 'EXPIRED', completed_at = now()
  where tournament_id = '2026' and status = 'ACTIVE' and expires_at <= now();
  select count(*)::integer into active_leases
  from scoring_authority.scoring_ingress_leases
  where tournament_id = '2026' and status = 'ACTIVE' and expires_at > now();
  select count(*)::integer into unresolved_outbox
  from scoring_authority.google_outbox_events
  where tournament_id = '2026' and status <> 'DELIVERED';
  select count(*)::integer into unresolved_archive
  from scoring_authority.scorecard_archive_jobs
  where tournament_id = '2026' and status not in ('VERIFIED', 'SUPERSEDED');

  if epoch.status <> 'PREPARED'
     or epoch.tournament_id <> '2026'
     or epoch.deployment_commit <> activation.expected_deployment_commit
     or epoch.source_fingerprint <> activation.expected_source_fingerprint
     or epoch.reconciliation_fingerprint <> lower(coalesce(input->>'reconciliation_fingerprint', ''))
     or gate.state <> 'PAUSED'
     or gate.active_epoch_id <> epoch.epoch_id
     or activation.active_transition_epoch_id <> epoch.epoch_id
     or activation.activation_revision <> coalesce((input->>'expected_activation_revision')::bigint, -1)
     or active_leases <> 0
     or epoch.supabase_match_revisions <> production_control.current_match_revisions('2026')
     or epoch.google_checkpoints <> production_control.current_google_checkpoints('2026') then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_AUTHORITY_COMMIT_PRECONDITION_FAILED';
  end if;
  if epoch.epoch_type = 'CUTOVER' and unresolved_outbox <> 0 then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_GOOGLE_OUTBOX_NOT_DRAINED';
  end if;
  if epoch.epoch_type = 'ROLLBACK' and (unresolved_outbox <> 0 or unresolved_archive <> 0) then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_ROLLBACK_RECONCILIATION_INCOMPLETE';
  end if;

  boundary_at := now();
  update scoring_authority.authority_epochs
  set status = 'COMMITTED', committed_at = boundary_at
  where epoch_id = epoch.epoch_id;
  update scoring_authority.ingress_gates
  set state = 'OPEN', authority = epoch.authority_after,
      active_epoch_id = epoch.epoch_id, unresolved_client_queues = 0,
      updated_by = left(input->>'actor_id', 160), updated_at = boundary_at
  where tournament_id = '2026';
  update scoring_authority.tournaments
  set scoring_authority = epoch.authority_after, updated_at = boundary_at
  where tournament_id = '2026';

  if epoch.authority_after = 'SUPABASE' then
    update production_control.resource_scope
    set scoring_authority = 'SUPABASE', scoring_ingress_enabled = true
    where scope_key = 'BAGGER_INV_PRODUCTION';
    update production_control.cutover_activation_state
    set state = 'SCORING_COMMITTED', activation_revision = activation_revision + 1,
        current_authority = 'SUPABASE', scoring_ingress_enabled = true,
        authority_generation_id = epoch.epoch_id,
        active_transition_epoch_id = null,
        first_supabase_write_possible_at = boundary_at,
        first_supabase_write_observed_at = null,
        first_supabase_mutation_key = null,
        first_supabase_match_id = null,
        first_supabase_match_revision = null,
        updated_by = left(input->>'actor_id', 160), updated_at = boundary_at
    where scope_key = 'BAGGER_INV_PRODUCTION'
    returning * into activation;
  else
    execute 'alter table scoring_authority.matches disable trigger capture_scorecard_archive_transition';
    update production_control.worker_controls
    set enabled = false, google_writes_allowed = false,
        metadata = metadata || jsonb_build_object('disabled_by_epoch', epoch.epoch_id, 'disabled_at', boundary_at)
    where worker_name in ('SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE');
    update production_control.worker_contracts
    set operation_allowed = false, authoritative_write_allowed = false
    where worker_name in ('SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE');
    update production_control.resource_scope
    set scoring_authority = 'GOOGLE', scoring_ingress_enabled = false,
        workers_enabled = exists (
          select 1 from production_control.worker_controls where enabled
        ),
        google_writes_enabled = exists (
          select 1 from production_control.worker_controls
          where enabled and google_writes_allowed
        )
    where scope_key = 'BAGGER_INV_PRODUCTION';
    update production_control.cutover_activation_state
    set state = 'ROLLED_BACK', activation_revision = activation_revision + 1,
        current_authority = 'GOOGLE', scoring_ingress_enabled = false,
        authority_generation_id = epoch.epoch_id,
        active_transition_epoch_id = null,
        updated_by = left(input->>'actor_id', 160), updated_at = boundary_at
    where scope_key = 'BAGGER_INV_PRODUCTION'
    returning * into activation;
  end if;

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', epoch.epoch_type || '_EPOCH_COMMITTED', left(input->>'actor_id', 160),
    jsonb_build_object(
      'epoch_id', epoch.epoch_id, 'authority_before', epoch.authority_before,
      'authority_after', epoch.authority_after,
      'first_supabase_canonical_write_possible_at',
        case when epoch.authority_after = 'SUPABASE' then boundary_at else null end
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    case when epoch.authority_after = 'SUPABASE'
      then 'FIRST_SUPABASE_CANONICAL_WRITE_POSSIBLE'
      else 'PRODUCTION_SCORING_AUTHORITY_ROLLED_BACK' end,
    'SCORING_AUTHORITY', '2026', left(input->>'actor_id', 160),
    lower(input->>'request_fingerprint'), 'SUCCEEDED',
    jsonb_build_object(
      'epoch_id', epoch.epoch_id, 'authority', epoch.authority_after,
      'boundary_at', boundary_at, 'scoring_ingress_enabled', activation.scoring_ingress_enabled,
      'workers_enabled', false, 'google_writes_enabled', false
    )
  );

  response_value := jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_AUTHORITY_EPOCH_COMMITTED',
    'epoch_id', epoch.epoch_id, 'authority', epoch.authority_after,
    'ingress', 'OPEN', 'scoring_ingress_enabled', activation.scoring_ingress_enabled,
    'activation_revision', activation.activation_revision,
    'first_supabase_canonical_write_possible', epoch.authority_after = 'SUPABASE',
    'first_supabase_canonical_write_possible_at',
      case when epoch.authority_after = 'SUPABASE' then boundary_at else null end,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt('COMMIT_AUTHORITY_EPOCH', input, response_value);
  return response_value;
end;
$$;

create or replace function public.abort_production_authority_epoch(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  existing := production_control.lookup_cutover_receipt('ABORT_AUTHORITY_EPOCH', input);
  if existing is not null then return existing; end if;

  if coalesce(input->>'actor_id', '') = '' then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_CUTOVER_ACTOR_REQUIRED';
  end if;

  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into epoch
  from scoring_authority.authority_epochs
  where epoch_id = nullif(input->>'epoch_id', '')::uuid
  for update;
  if not found or epoch.status <> 'PREPARED'
     or activation.active_transition_epoch_id <> epoch.epoch_id
     or activation.activation_revision <> coalesce((input->>'expected_activation_revision')::bigint, -1) then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_AUTHORITY_EPOCH_NOT_ABORTABLE';
  end if;

  update scoring_authority.authority_epochs
  set status = 'ABORTED', aborted_at = now(),
      reason = left(coalesce(nullif(input->>'reason', ''), reason), 500)
  where epoch_id = epoch.epoch_id;
  update scoring_authority.ingress_gates
  set state = 'OPEN', authority = epoch.authority_before,
      active_epoch_id = epoch.prior_active_epoch_id,
      unresolved_client_queues = 0,
      updated_by = left(input->>'actor_id', 160), updated_at = now()
  where tournament_id = '2026';
  update production_control.cutover_activation_state
  set state = case when epoch.authority_before = 'GOOGLE'
      then 'GOOGLE_LEASE_ARMED' else 'SCORING_COMMITTED' end,
      activation_revision = activation_revision + 1,
      active_transition_epoch_id = null,
      updated_by = left(input->>'actor_id', 160), updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', epoch.epoch_type || '_EPOCH_ABORTED', left(input->>'actor_id', 160),
    jsonb_build_object('epoch_id', epoch.epoch_id, 'authority', epoch.authority_before)
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_AUTHORITY_EPOCH_ABORTED', 'SCORING_AUTHORITY', '2026',
    left(input->>'actor_id', 160), lower(input->>'request_fingerprint'), 'SUCCEEDED',
    jsonb_build_object('epoch_id', epoch.epoch_id, 'authority', epoch.authority_before)
  );

  response_value := jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_AUTHORITY_EPOCH_ABORTED',
    'epoch_id', epoch.epoch_id, 'authority', epoch.authority_before,
    'ingress', 'OPEN', 'activation_revision', activation.activation_revision,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt('ABORT_AUTHORITY_EPOCH', input, response_value);
  return response_value;
end;
$$;

create or replace function public.set_production_cutover_worker_state(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  worker text := upper(coalesce(input->>'worker_name', ''));
  requested_enabled boolean;
  active_workers integer;
  active_google_writers integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  existing := production_control.lookup_cutover_receipt('SET_WORKER_STATE', input);
  if existing is not null then return existing; end if;

  if coalesce(input->>'actor_id', '') = ''
     or worker not in ('SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE')
     or input->>'enabled' is null then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_CUTOVER_WORKER_NOT_ALLOWED';
  end if;
  requested_enabled := (input->>'enabled')::boolean;

  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  if activation.activation_revision <> coalesce((input->>'expected_activation_revision')::bigint, -1)
     or activation.authority_generation_id <> nullif(input->>'expected_epoch_id', '')::uuid
     or activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or not activation.scoring_ingress_enabled then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_CUTOVER_WORKER_AUTHORITY_REQUIRED';
  end if;
  if requested_enabled and input->>'google_service_account_email'
       is distinct from activation.expected_google_service_account then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_DEDICATED_GOOGLE_SERVICE_ACCOUNT_REQUIRED';
  end if;

  update production_control.worker_controls
  set enabled = requested_enabled,
      google_writes_allowed = requested_enabled,
      scheduler_installed = false,
      last_verified_at = now(),
      metadata = metadata || jsonb_build_object(
        'activation_epoch_id', activation.authority_generation_id,
        'deployment_commit', activation.expected_deployment_commit,
        'google_service_account', case when requested_enabled
          then activation.expected_google_service_account else null end,
        'configured_by', left(input->>'actor_id', 160),
        'configured_at', now()
      )
  where worker_name = worker;
  if not found then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_CUTOVER_WORKER_CONTRACT_MISSING';
  end if;
  update production_control.worker_contracts
  set operation_allowed = requested_enabled,
      scheduler_installed = false,
      authoritative_write_allowed = false
  where worker_name = worker;

  if worker = 'ROUND_SCORECARDS_ARCHIVE' then
    -- Finalize/Reopen own the only archive-transition path through their
    -- explicit, atomic snapshot helpers. Worker activation must never enable
    -- the legacy table trigger or one lifecycle mutation could enqueue the
    -- same transition twice.
    execute 'alter table scoring_authority.matches disable trigger capture_scorecard_archive_transition';
  end if;

  select count(*)::integer into active_workers
  from production_control.worker_controls
  where enabled;
  select count(*)::integer into active_google_writers
  from production_control.worker_controls
  where enabled and google_writes_allowed;
  update production_control.resource_scope
  set workers_enabled = active_workers > 0,
      google_writes_enabled = active_google_writers > 0
  where scope_key = 'BAGGER_INV_PRODUCTION';
  update production_control.cutover_activation_state
  set activation_revision = activation_revision + 1,
      updated_by = left(input->>'actor_id', 160), updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    case when requested_enabled then 'PRODUCTION_CUTOVER_WORKER_ENABLED'
      else 'PRODUCTION_CUTOVER_WORKER_DISABLED' end,
    'SCORING_AUTHORITY', '2026', left(input->>'actor_id', 160),
    lower(input->>'request_fingerprint'), 'SUCCEEDED',
    jsonb_build_object(
      'worker', worker, 'enabled', requested_enabled,
      'google_writes_allowed', requested_enabled,
      'authoritative_write_allowed', false,
      'scheduler_installed', false,
      'epoch_id', activation.authority_generation_id
    )
  );

  response_value := jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_CUTOVER_WORKER_STATE_UPDATED',
    'worker', worker, 'enabled', requested_enabled,
    'authoritative_write_allowed', false,
    'workers_enabled', active_workers > 0,
    'google_writes_enabled', active_google_writers > 0,
    'activation_revision', activation.activation_revision,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt('SET_WORKER_STATE', input, response_value);
  return response_value;
end;
$$;

create or replace function production_control.capture_first_production_canonical_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  target_tournament text;
  activation production_control.cutover_activation_state%rowtype;
begin
  select tournament_id into target_tournament
  from scoring_authority.matches
  where match_id = new.match_id;
  if target_tournament <> '2026' then return new; end if;

  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  if activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or not activation.scoring_ingress_enabled
     or not exists (
       select 1 from scoring_authority.ingress_gates gate
       where gate.tournament_id = '2026'
         and gate.state = 'OPEN'
         and gate.authority = 'SUPABASE'
         and gate.active_epoch_id = activation.authority_generation_id
     ) then
    return new;
  end if;

  update production_control.cutover_activation_state
  set activation_revision = activation_revision + 1,
      first_supabase_write_observed_at = now(),
      first_supabase_mutation_key = new.mutation_key,
      first_supabase_match_id = new.match_id,
      first_supabase_match_revision = new.next_match_revision,
      updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
    and first_supabase_write_observed_at is null;
  if found then
    insert into production_control.operation_audit_events (
      event_type, domain, tournament_id, actor, request_fingerprint, result, details
    ) values (
      'FIRST_SUPABASE_CANONICAL_WRITE_OBSERVED', 'SCORING_AUTHORITY', '2026',
      left(new.actor_id, 160), null, 'SUCCEEDED',
      jsonb_build_object(
        'epoch_id', activation.authority_generation_id,
        'mutation_key', new.mutation_key,
        'match_id', new.match_id,
        'match_revision', new.next_match_revision
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists capture_first_production_canonical_write
  on scoring_authority.score_mutations;
create trigger capture_first_production_canonical_write
after insert on scoring_authority.score_mutations
for each row execute function production_control.capture_first_production_canonical_write();

create or replace function public.inspect_production_cutover_authority(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict gate
  from scoring_authority.ingress_gates
  where tournament_id = '2026';

  return jsonb_build_object(
    'ok', true,
    'contract_version', activation.contract_version,
    'state', activation.state,
    'activation_revision', activation.activation_revision,
    'deployment_commit', activation.expected_deployment_commit,
    'source_fingerprint', activation.expected_source_fingerprint,
    'authority_generation_id', activation.authority_generation_id,
    'authority', activation.current_authority,
    'gate', jsonb_build_object(
      'state', gate.state, 'authority', gate.authority,
      'active_epoch_id', gate.active_epoch_id,
      'unresolved_client_queues', gate.unresolved_client_queues
    ),
    'first_canonical_write_boundary', jsonb_build_object(
      'possible', activation.first_supabase_write_possible_at is not null
        and activation.current_authority = 'SUPABASE',
      'possible_at', activation.first_supabase_write_possible_at,
      'observed', activation.first_supabase_write_observed_at is not null,
      'observed_at', activation.first_supabase_write_observed_at,
      'mutation_key', activation.first_supabase_mutation_key,
      'match_id', activation.first_supabase_match_id,
      'match_revision', activation.first_supabase_match_revision
    ),
    'resource_flags', jsonb_build_object(
      'current_tournament_read_authority', resource.current_tournament_read_authority,
      'scoring_authority', resource.scoring_authority,
      'participant_identity_authority', resource.participant_identity_authority,
      'public_supabase_reads_enabled', resource.public_supabase_reads_enabled,
      'scoring_ingress_enabled', resource.scoring_ingress_enabled,
      'google_writes_enabled', resource.google_writes_enabled,
      'workers_enabled', resource.workers_enabled,
      'odds_publication_enabled', resource.odds_publication_enabled
    ),
    'workers', (
      select coalesce(jsonb_object_agg(worker_name, jsonb_build_object(
        'enabled', enabled,
        'scheduler_installed', scheduler_installed,
        'google_writes_allowed', google_writes_allowed
      ) order by worker_name), '{}'::jsonb)
      from production_control.worker_controls
    ),
    'supabase_match_revisions', production_control.current_match_revisions('2026'),
    'google_checkpoints', production_control.current_google_checkpoints('2026'),
    'active_leases', (
      select count(*) from scoring_authority.scoring_ingress_leases
      where tournament_id = '2026' and status = 'ACTIVE' and expires_at > now()
    ),
    'no_automatic_fallback', true
  );
end;
$$;

revoke all on table production_control.cutover_activation_state
  from public, anon, authenticated, service_role;
revoke all on table production_control.cutover_operation_receipts
  from public, anon, authenticated, service_role;
grant select on table production_control.cutover_activation_state to service_role;
grant select on table production_control.cutover_operation_receipts to service_role;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'production_control.assert_production_service_role()',
    'production_control.cutover_payload_hash(jsonb)',
    'production_control.assert_exact_cutover_resource_scope(jsonb,boolean)',
    'production_control.lookup_cutover_receipt(text,jsonb)',
    'production_control.store_cutover_receipt(text,jsonb,jsonb)',
    'production_control.current_match_revisions(text)',
    'production_control.current_google_checkpoints(text)',
    'production_control.capture_first_production_canonical_write()',
    'public.stage_production_cutover_release(jsonb)',
    'public.arm_production_google_ingress_lease_gate(jsonb)',
    'public.begin_production_scoring_ingress(jsonb)',
    'public.complete_production_scoring_ingress(jsonb)',
    'public.prepare_production_authority_epoch(jsonb)',
    'public.commit_production_authority_epoch(jsonb)',
    'public.abort_production_authority_epoch(jsonb)',
    'public.set_production_cutover_worker_state(jsonb)',
    'public.inspect_production_cutover_authority(jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', signature);
  end loop;
end
$$;

grant execute on function public.stage_production_cutover_release(jsonb) to service_role;
grant execute on function public.arm_production_google_ingress_lease_gate(jsonb) to service_role;
grant execute on function public.begin_production_scoring_ingress(jsonb) to service_role;
grant execute on function public.complete_production_scoring_ingress(jsonb) to service_role;
grant execute on function public.prepare_production_authority_epoch(jsonb) to service_role;
grant execute on function public.commit_production_authority_epoch(jsonb) to service_role;
grant execute on function public.abort_production_authority_epoch(jsonb) to service_role;
grant execute on function public.set_production_cutover_worker_state(jsonb) to service_role;
grant execute on function public.inspect_production_cutover_authority(jsonb) to service_role;

alter default privileges in schema production_control
  revoke all on functions from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
