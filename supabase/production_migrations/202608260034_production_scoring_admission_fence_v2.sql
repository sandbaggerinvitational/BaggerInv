-- Step 11.6 Production scoring-admission fence v2.
--
-- Installation is dormant. It does not change the current Google/Passport
-- authority, enable Supabase scoring, enable workers, or assert that external
-- Google writers have been fenced. The external-writer evidence recorded here
-- is an operator attestation only; Google/Vercel remain the enforcement plane.
begin;

alter table scoring_authority.ingress_gates
  add column if not exists admission_contract_version text not null
    default 'production-scoring-admission-v2',
  add column if not exists admission_state text not null default 'OPEN',
  add column if not exists admission_revision bigint not null default 0,
  add column if not exists admission_generation_id uuid not null
    default extensions.gen_random_uuid(),
  add column if not exists admission_protocol_enforced boolean not null default false,
  add column if not exists admission_enforced_at timestamptz,
  add column if not exists admission_opened_at timestamptz,
  add column if not exists admission_deployment_id text,
  add column if not exists legacy_lease_set_fingerprint text,
  add column if not exists active_closure_id uuid,
  add column if not exists external_fence_evidence_id uuid;

alter table scoring_authority.ingress_gates
  add constraint production_scoring_admission_contract_check
    check (admission_contract_version = 'production-scoring-admission-v2'),
  add constraint production_scoring_admission_state_check
    check (admission_state in ('OPEN', 'CLOSING', 'CLOSED')),
  add constraint production_scoring_admission_revision_check
    check (admission_revision >= 0),
  add constraint production_scoring_admission_legacy_set_check
    check (legacy_lease_set_fingerprint is null
      or legacy_lease_set_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_admission_enforcement_check
    check (
      (not admission_protocol_enforced and admission_enforced_at is null
        and admission_deployment_id is null)
      or (admission_protocol_enforced and admission_enforced_at is not null
        and admission_opened_at is not null
        and admission_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
        and legacy_lease_set_fingerprint ~ '^[0-9a-f]{64}$')
    );

create table production_control.scoring_external_fence_evidence (
  evidence_id uuid primary key default extensions.gen_random_uuid(),
  request_fingerprint text not null unique
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  deployment_commit text not null check (deployment_commit ~ '^[0-9a-f]{40}$'),
  deployment_id text not null check (deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'),
  vercel_project_id text not null
    check (vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'),
  source_workbook_id text not null
    check (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  provider_evidence_fingerprint text not null
    check (provider_evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  deployment_scope_fingerprint text not null
    check (deployment_scope_fingerprint ~ '^[0-9a-f]{64}$'),
  google_credential_scope_fingerprint text not null
    check (google_credential_scope_fingerprint ~ '^[0-9a-f]{64}$'),
  writer_coverage_fingerprint text not null
    check (writer_coverage_fingerprint ~ '^[0-9a-f]{64}$'),
  legacy_lease_set_fingerprint text not null
    check (legacy_lease_set_fingerprint ~ '^[0-9a-f]{64}$'),
  legacy_lease_count integer not null check (legacy_lease_count >= 0),
  legacy_deployments_fenced boolean not null,
  google_credentials_fenced boolean not null,
  manual_google_scoring_fenced boolean not null,
  captured_at timestamptz not null,
  expires_at timestamptz not null,
  actor_id text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  check (expires_at > captured_at),
  check (expires_at <= captured_at + interval '30 minutes'),
  check (legacy_deployments_fenced and google_credentials_fenced
    and manual_google_scoring_fenced)
);

create table production_control.scoring_admission_closures (
  closure_id uuid primary key default extensions.gen_random_uuid(),
  closure_kind text not null default 'LEGACY_ADMISSION'
    check (closure_kind in ('LEGACY_ADMISSION', 'SUPABASE_INGRESS')),
  prior_legacy_closure_id uuid,
  tournament_id text not null references scoring_authority.tournaments(tournament_id)
    on delete restrict,
  authority text not null check (authority in ('GOOGLE', 'SUPABASE')),
  authority_generation_id uuid not null,
  admission_generation_id uuid not null,
  deployment_id text not null check (deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'),
  status text not null default 'CLOSING'
    check (status in ('CLOSING', 'CLOSED', 'REOPENED', 'CONSUMED')),
  opening_admission_revision bigint not null check (opening_admission_revision >= 0),
  closing_admission_revision bigint not null check (closing_admission_revision > 0),
  closed_admission_revision bigint check (closed_admission_revision is null
    or closed_admission_revision >= closing_admission_revision),
  lease_high_watermark bigint not null default 0 check (lease_high_watermark >= 0),
  start_source_fingerprint text
    check (start_source_fingerprint is null or start_source_fingerprint ~ '^[0-9a-f]{64}$'),
  final_source_fingerprint text
    check (final_source_fingerprint is null or final_source_fingerprint ~ '^[0-9a-f]{64}$'),
  reconciliation_fingerprint text
    check (reconciliation_fingerprint is null or reconciliation_fingerprint ~ '^[0-9a-f]{64}$'),
  lease_set_fingerprint text
    check (lease_set_fingerprint is null or lease_set_fingerprint ~ '^[0-9a-f]{64}$'),
  supabase_match_revisions jsonb,
  google_checkpoints jsonb,
  external_fence_evidence_id uuid not null
    references production_control.scoring_external_fence_evidence(evidence_id)
    on delete restrict,
  close_request_fingerprint text not null unique
    check (close_request_fingerprint ~ '^[0-9a-f]{64}$'),
  close_payload_hash text not null check (close_payload_hash ~ '^[0-9a-f]{64}$'),
  closing_at timestamptz not null default pg_catalog.now(),
  closed_at timestamptz,
  reopened_at timestamptz,
  consumed_at timestamptz,
  actor_id text not null,
  consumed_epoch_id uuid references scoring_authority.authority_epochs(epoch_id)
    on delete restrict,
  check (
    (status = 'CLOSING' and closed_at is null and reopened_at is null and consumed_at is null)
    or (status = 'CLOSED' and closed_at is not null and reopened_at is null and consumed_at is null)
    or (status = 'REOPENED' and reopened_at is not null and consumed_at is null)
    or (status = 'CONSUMED' and closed_at is not null and consumed_at is not null
      and consumed_epoch_id is not null)
  ),
  check (
    status = 'CLOSING'
    or (
      closed_admission_revision is not null
      and final_source_fingerprint is not null
      and reconciliation_fingerprint is not null
      and lease_set_fingerprint is not null
      and pg_catalog.jsonb_typeof(supabase_match_revisions) = 'object'
      and pg_catalog.jsonb_typeof(google_checkpoints) = 'object'
    )
    or status = 'REOPENED'
  )
);

alter table production_control.scoring_admission_closures
  add constraint production_scoring_admission_prior_legacy_closure_fkey
    foreign key (prior_legacy_closure_id)
    references production_control.scoring_admission_closures(closure_id)
    on delete restrict,
  add constraint production_scoring_admission_closure_kind_shape_check
    check (
      (closure_kind = 'LEGACY_ADMISSION'
        and prior_legacy_closure_id is null
        and authority = 'GOOGLE')
      or (closure_kind = 'SUPABASE_INGRESS'
        and prior_legacy_closure_id is not null
        and authority = 'SUPABASE')
    );

alter table scoring_authority.ingress_gates
  add constraint production_scoring_admission_active_closure_fkey
    foreign key (active_closure_id)
    references production_control.scoring_admission_closures(closure_id)
    on delete restrict,
  add constraint production_scoring_admission_external_fence_fkey
    foreign key (external_fence_evidence_id)
    references production_control.scoring_external_fence_evidence(evidence_id)
    on delete restrict;

create sequence production_control.scoring_admission_lease_sequence;

alter table scoring_authority.scoring_ingress_leases
  add column if not exists protocol_version text not null default 'LEGACY_V1',
  add column if not exists admission_sequence bigint,
  add column if not exists admission_generation_id uuid,
  add column if not exists admission_revision bigint,
  add column if not exists admitted_activation_revision bigint,
  add column if not exists lease_nonce_hash text,
  add column if not exists operation_request_id uuid,
  add column if not exists writer_intent text,
  add column if not exists request_payload_hash text,
  add column if not exists resolution_state text not null default 'LEGACY_UNCLASSIFIED',
  add column if not exists write_started_at timestamptz,
  add column if not exists outcome_reported_at timestamptz,
  add column if not exists provider_mutation_key text,
  add column if not exists provider_before_fingerprint text,
  add column if not exists provider_after_fingerprint text,
  add column if not exists provider_readback_fingerprint text,
  add column if not exists outcome_evidence_fingerprint text,
  add column if not exists resolution_fingerprint text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text,
  add column if not exists close_fence_id uuid
    references production_control.scoring_admission_closures(closure_id)
    on delete restrict,
  add column if not exists last_error_code text;

alter table scoring_authority.scoring_ingress_leases
  add constraint production_scoring_lease_protocol_version_check
    check (protocol_version in ('LEGACY_V1', 'ADMISSION_V2')),
  add constraint production_scoring_lease_resolution_state_check
    check (resolution_state in (
      'LEGACY_UNCLASSIFIED', 'ADMITTED', 'WRITE_STARTED',
      'CONFIRMED_WRITE', 'PROVEN_NO_WRITE', 'AMBIGUOUS', 'PARTIAL_WRITE',
      'RESOLVED_WRITE', 'RESOLVED_NO_WRITE'
    )),
  add constraint production_scoring_lease_admission_sequence_check
    check (admission_sequence is null or admission_sequence > 0),
  add constraint production_scoring_lease_admission_revision_check
    check (admission_revision is null or admission_revision >= 0),
  add constraint production_scoring_lease_activation_revision_check
    check (admitted_activation_revision is null or admitted_activation_revision >= 0),
  add constraint production_scoring_lease_nonce_hash_check
    check (lease_nonce_hash is null or lease_nonce_hash ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_writer_intent_check
    check (writer_intent is null or writer_intent = 'CANONICAL_LEGACY'),
  add constraint production_scoring_lease_request_payload_hash_check
    check (request_payload_hash is null or request_payload_hash ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_provider_before_check
    check (provider_before_fingerprint is null or provider_before_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_provider_after_check
    check (provider_after_fingerprint is null or provider_after_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_provider_readback_check
    check (provider_readback_fingerprint is null or provider_readback_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_outcome_evidence_check
    check (outcome_evidence_fingerprint is null or outcome_evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_resolution_fingerprint_check
    check (resolution_fingerprint is null or resolution_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_v2_shape_check
    check (
      protocol_version <> 'ADMISSION_V2'
      or (
        admission_sequence is not null
        and admission_generation_id is not null
        and admission_revision is not null
        and admitted_activation_revision is not null
        and lease_nonce_hash is not null
        and operation_request_id is not null
        and writer_intent = 'CANONICAL_LEGACY'
        and request_payload_hash is not null
        and request_fingerprint is not null
      )
    );

alter table scoring_authority.ingress_gates
  add constraint production_scoring_admission_gate_shape_check
    check (
      not admission_protocol_enforced
      or (
        (admission_state = 'OPEN' and active_closure_id is null)
        or (admission_state in ('CLOSING', 'CLOSED')
          and active_closure_id is not null
          and external_fence_evidence_id is not null)
      )
    );

create unique index production_scoring_admission_v2_request_idx
  on scoring_authority.scoring_ingress_leases(request_fingerprint)
  where protocol_version = 'ADMISSION_V2';
create unique index production_scoring_admission_v2_operation_request_idx
  on scoring_authority.scoring_ingress_leases(
    tournament_id, operation_request_id
  ) where protocol_version = 'ADMISSION_V2';
create unique index production_scoring_admission_v2_sequence_idx
  on scoring_authority.scoring_ingress_leases(admission_sequence)
  where admission_sequence is not null;
create index production_scoring_admission_v2_unresolved_idx
  on scoring_authority.scoring_ingress_leases(
    tournament_id, admission_generation_id, resolution_state, expires_at
  ) where protocol_version = 'ADMISSION_V2';

alter table scoring_authority.authority_epochs
  add column if not exists admission_closure_id uuid
    references production_control.scoring_admission_closures(closure_id)
    on delete restrict,
  add column if not exists admission_generation_id uuid,
  add column if not exists closed_admission_revision bigint,
  add column if not exists closure_boundary_fingerprint text,
  add column if not exists prior_source_fingerprint text,
  add column if not exists external_fence_evidence_id uuid
    references production_control.scoring_external_fence_evidence(evidence_id)
    on delete restrict;

alter table scoring_authority.authority_epochs
  add constraint production_authority_epoch_closed_admission_revision_check
    check (closed_admission_revision is null or closed_admission_revision > 0),
  add constraint production_authority_epoch_closure_boundary_check
    check (closure_boundary_fingerprint is null
      or closure_boundary_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_authority_epoch_prior_source_fingerprint_check
    check (prior_source_fingerprint is null
      or prior_source_fingerprint ~ '^[0-9a-f]{64}$');

alter table production_control.scoring_external_fence_evidence enable row level security;
alter table production_control.scoring_admission_closures enable row level security;

create or replace function production_control.scoring_admission_lock_key()
returns bigint
language sql
immutable
security definer
set search_path = pg_catalog
as $$ select 731102026032::bigint $$;

create or replace function production_control.scoring_admission_unresolved_count(
  target_generation uuid
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.count(*)::integer
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.protocol_version = 'ADMISSION_V2'
    and lease.admission_generation_id = target_generation
    and lease.resolution_state in (
      'ADMITTED', 'WRITE_STARTED', 'AMBIGUOUS', 'PARTIAL_WRITE',
      'LEGACY_UNCLASSIFIED'
    )
$$;

create or replace function production_control.scoring_admission_legacy_blocker_count(
  enforcement_started_at timestamptz
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.count(*)::integer
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.protocol_version = 'LEGACY_V1'
    and lease.resolution_state = 'LEGACY_UNCLASSIFIED'
$$;

comment on function production_control.scoring_admission_legacy_blocker_count(timestamptz)
is 'The timestamp argument is retained for call compatibility. Every unclassified LEGACY_V1 row blocks closure regardless of age or legacy status until audited provider readback classifies it.';

create or replace function production_control.scoring_admission_legacy_set_fingerprint()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'match_id', lease.match_id,
      'authority', lease.authority,
      'status', lease.status,
      'created_at', lease.created_at,
      'expires_at', lease.expires_at,
      'completed_at', lease.completed_at,
      'request_fingerprint', lease.request_fingerprint
    ) order by lease.created_at, lease.lease_id), '[]'::jsonb)::text,
    'sha256'
  ), 'hex')
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.protocol_version = 'LEGACY_V1'
$$;

create or replace function production_control.scoring_admission_lease_set_fingerprint(
  target_generation uuid
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
  where lease.tournament_id = '2026'
    and lease.protocol_version = 'ADMISSION_V2'
    and lease.admission_generation_id = target_generation
$$;

create or replace function production_control.assert_current_external_scoring_fence(
  target_evidence_id uuid,
  target_deployment_commit text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  evidence production_control.scoring_external_fence_evidence%rowtype;
begin
  select * into evidence
  from production_control.scoring_external_fence_evidence value
  where value.evidence_id = target_evidence_id;
  if not found
     or evidence.revoked_at is not null
     or evidence.expires_at <= pg_catalog.now()
     or evidence.captured_at > pg_catalog.now()
     or evidence.captured_at < pg_catalog.now() - interval '30 minutes'
     or evidence.deployment_commit is distinct from target_deployment_commit
     or not evidence.legacy_deployments_fenced
     or not evidence.google_credentials_fenced
     or not evidence.manual_google_scoring_fenced then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_EXTERNAL_SCORING_FENCE_EVIDENCE_REQUIRED';
  end if;
end;
$$;

-- Defined before the epoch replacements so PostgreSQL can validate every
-- referenced helper while this single migration transaction is parsed. It is
-- repeated below only to keep the admission helpers grouped for reviewers.
create or replace function production_control.assert_scoring_admission_optimistic_input(
  input jsonb,
  require_external_fence boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if pg_catalog.jsonb_typeof(input->'expected_activation_revision')
       is distinct from 'number'
     or input->>'expected_activation_revision' !~ '^[0-9]+$'
     or coalesce(input->>'expected_authority_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_admission_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.jsonb_typeof(input->'expected_admission_revision')
       is distinct from 'number'
     or input->>'expected_admission_revision' !~ '^[0-9]+$'
     or coalesce(input->>'deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'request_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or (require_external_fence and coalesce(
       input->>'external_fence_evidence_id', ''
     ) !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_ADMISSION_OPTIMISTIC_INPUT_REQUIRED';
  end if;
end;
$$;

create or replace function public.prepare_production_authority_epoch(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  requested_type text := pg_catalog.upper(
    coalesce(input->>'epoch_type', '')
  );
  current_revisions jsonb;
  current_checkpoints jsonb;
  unresolved_outbox integer;
  unresolved_archive integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  if requested_type not in ('CUTOVER', 'ROLLBACK')
     or coalesce(input->>'source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'reconciliation_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'closure_boundary_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'closure_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.jsonb_typeof(input->'supabase_match_revisions')
       is distinct from 'object'
     or pg_catalog.jsonb_typeof(input->'google_checkpoints')
       is distinct from 'object' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_AUTHORITY_PREPARE_V2_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'PREPARE_AUTHORITY_EPOCH', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid
  for update;
  perform production_control.assert_current_external_scoring_fence(
    (input->>'external_fence_evidence_id')::uuid,
    activation.expected_deployment_commit
  );

  current_revisions := production_control.current_match_revisions('2026');
  current_checkpoints := production_control.current_google_checkpoints('2026');
  select pg_catalog.count(*)::integer into unresolved_outbox
  from scoring_authority.google_outbox_events event
  where event.tournament_id = '2026' and event.status <> 'DELIVERED';
  select pg_catalog.count(*)::integer into unresolved_archive
  from scoring_authority.scorecard_archive_jobs job
  where job.tournament_id = '2026'
    and job.status not in ('VERIFIED', 'SUPERSEDED');

  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit
       is distinct from input->>'deployment_commit'
     or gate.state is distinct from 'PAUSED'
     or gate.admission_state is distinct from 'CLOSED'
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id
       is distinct from (input->>'external_fence_evidence_id')::uuid
     or closure.status is distinct from 'CLOSED'
     or closure.authority_generation_id
       is distinct from activation.authority_generation_id
     or closure.admission_generation_id
       is distinct from gate.admission_generation_id
     or closure.closed_admission_revision
       is distinct from gate.admission_revision
     or closure.external_fence_evidence_id
       is distinct from gate.external_fence_evidence_id
     or closure.final_source_fingerprint
       is distinct from pg_catalog.lower(input->>'source_fingerprint')
     or closure.reconciliation_fingerprint
       is distinct from pg_catalog.lower(input->>'reconciliation_fingerprint')
     or closure.lease_set_fingerprint
       is distinct from pg_catalog.lower(input->>'closure_boundary_fingerprint')
     or closure.supabase_match_revisions is distinct from current_revisions
     or closure.google_checkpoints is distinct from current_checkpoints
     or input->'supabase_match_revisions' is distinct from current_revisions
     or input->'google_checkpoints' is distinct from current_checkpoints
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
     or unresolved_outbox <> 0
     or unresolved_archive <> 0
     or activation.active_transition_epoch_id is not null
     or exists (
       select 1 from scoring_authority.authority_epochs value
       where value.tournament_id = '2026' and value.status = 'PREPARED'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_AUTHORITY_PREPARE_V2_BOUNDARY_CHANGED';
  end if;
  if requested_type = 'CUTOVER' then
    if activation.state is distinct from 'GOOGLE_LEASE_ARMED'
       or activation.current_authority is distinct from 'GOOGLE'
       or activation.scoring_ingress_enabled
       or gate.authority is distinct from 'GOOGLE'
       or closure.authority is distinct from 'GOOGLE'
       or closure.closure_kind is distinct from 'LEGACY_ADMISSION'
       or activation.expected_source_fingerprint
         is distinct from closure.final_source_fingerprint then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_CUTOVER_V2_NOT_PREPARABLE';
    end if;
  else
    if activation.state is distinct from 'SCORING_COMMITTED'
       or activation.current_authority is distinct from 'SUPABASE'
       or not activation.scoring_ingress_enabled
       or gate.authority is distinct from 'SUPABASE'
       or closure.authority is distinct from 'SUPABASE'
       or closure.closure_kind is distinct from 'SUPABASE_INGRESS'
       or activation.expected_source_fingerprint is distinct from
         pg_catalog.lower(coalesce(
           input->>'expected_prior_source_fingerprint', ''
         )) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ROLLBACK_V2_NOT_PREPARABLE';
    end if;
  end if;

  insert into scoring_authority.authority_epochs (
    tournament_id, epoch_type, status, authority_before, authority_after,
    reconciliation_fingerprint, google_checkpoints, supabase_match_revisions,
    deployment_commit, actor_id, reason, request_fingerprint,
    source_fingerprint, prepared_activation_revision, prior_active_epoch_id,
    admission_closure_id, admission_generation_id,
    closed_admission_revision, closure_boundary_fingerprint,
    prior_source_fingerprint,
    external_fence_evidence_id
  ) values (
    '2026', requested_type, 'PREPARED', activation.current_authority,
    case when requested_type = 'CUTOVER' then 'SUPABASE' else 'GOOGLE' end,
    closure.reconciliation_fingerprint, current_checkpoints, current_revisions,
    activation.expected_deployment_commit, input->>'actor_id',
    pg_catalog.left(coalesce(input->>'reason', ''), 500),
    pg_catalog.lower(input->>'request_fingerprint'),
    closure.final_source_fingerprint, activation.activation_revision,
    gate.active_epoch_id, closure.closure_id, gate.admission_generation_id,
    gate.admission_revision, closure.lease_set_fingerprint,
    activation.expected_source_fingerprint,
    gate.external_fence_evidence_id
  ) returning * into epoch;

  update scoring_authority.ingress_gates
  set active_epoch_id = epoch.epoch_id,
      unresolved_client_queues = 0,
      updated_by = input->>'actor_id',
      updated_at = pg_catalog.now()
  where tournament_id = '2026';
  update production_control.cutover_activation_state
  set state = case when requested_type = 'CUTOVER'
        then 'CUTOVER_PREPARED' else 'ROLLBACK_PREPARED' end,
      activation_revision = activation_revision + 1,
      expected_source_fingerprint = closure.final_source_fingerprint,
      active_transition_epoch_id = epoch.epoch_id,
      updated_by = input->>'actor_id',
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', requested_type || '_EPOCH_PREPARED', input->>'actor_id',
    pg_catalog.jsonb_build_object(
      'epoch_id', epoch.epoch_id,
      'admission_closure_id', closure.closure_id,
      'admission_generation_id', gate.admission_generation_id,
      'closed_admission_revision', gate.admission_revision,
      'closure_boundary_fingerprint', closure.lease_set_fingerprint,
      'external_fence_evidence_id', gate.external_fence_evidence_id
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_' || requested_type || '_EPOCH_V2_PREPARED',
    'SCORING_AUTHORITY', '2026', input->>'actor_id',
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'epoch_id', epoch.epoch_id,
      'closure_id', closure.closure_id,
      'ingress', 'PAUSED',
      'admission_state', 'CLOSED',
      'active_or_unresolved_leases', 0,
      'unresolved_outbox', 0,
      'unresolved_archive', 0
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_AUTHORITY_EPOCH_V2_PREPARED',
    'epoch_id', epoch.epoch_id, 'epoch_type', requested_type,
    'authority', epoch.authority_before,
    'authority_after', epoch.authority_after,
    'closure_id', closure.closure_id,
    'ingress', 'PAUSED', 'admission_state', 'CLOSED',
    'activation_revision', activation.activation_revision,
    'admission_revision', gate.admission_revision,
    'first_supabase_canonical_write_possible', false,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'PREPARE_AUTHORITY_EPOCH', input, response_value
  );
  return response_value;
end;
$$;

create or replace function production_control.assert_production_scoring_lease_nonce(
  lease scoring_authority.scoring_ingress_leases,
  supplied_nonce text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if lease.protocol_version <> 'ADMISSION_V2'
     or coalesce(supplied_nonce, '')
       !~ '^[0-9a-fA-F-]{36}$'
     or lease.lease_nonce_hash is distinct from pg_catalog.encode(
       extensions.digest(pg_catalog.lower(supplied_nonce), 'sha256'), 'hex'
     ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_SCORING_LEASE_NONCE_INVALID';
  end if;
end;
$$;

create or replace function production_control.scoring_lease_outcome_evidence_hash(
  target_lease_id uuid,
  target_request_fingerprint text,
  target_outcome text,
  target_provider_mutation_key text,
  target_provider_before_fingerprint text,
  target_provider_after_fingerprint text,
  target_provider_readback_fingerprint text,
  target_authority_generation uuid,
  target_admission_generation uuid,
  target_admission_revision bigint
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object(
    'lease_id', target_lease_id,
    'request_fingerprint', pg_catalog.lower(target_request_fingerprint),
    'outcome', pg_catalog.upper(target_outcome),
    'provider_mutation_key', coalesce(target_provider_mutation_key, ''),
    'provider_before_fingerprint', pg_catalog.lower(coalesce(target_provider_before_fingerprint, '')),
    'provider_after_fingerprint', pg_catalog.lower(coalesce(target_provider_after_fingerprint, '')),
    'provider_readback_fingerprint', pg_catalog.lower(coalesce(target_provider_readback_fingerprint, '')),
    'authority_generation_id', target_authority_generation,
    'admission_generation_id', target_admission_generation,
    'admission_revision', target_admission_revision
  )::text, 'sha256'), 'hex')
$$;

create or replace function production_control.scoring_admission_begin_payload_hash(
  input jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(
    (input - array['lease_nonce', 'request_fingerprint'])::text,
    'sha256'
  ), 'hex')
$$;

create or replace function production_control.scoring_legacy_resolution_evidence_hash(
  target_lease_id uuid,
  target_request_fingerprint text,
  target_resolution text,
  target_provider_readback_fingerprint text,
  target_external_fence_evidence_id uuid,
  target_actor_id text
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object(
    'lease_id', target_lease_id,
    'request_fingerprint', pg_catalog.lower(target_request_fingerprint),
    'resolution', pg_catalog.upper(target_resolution),
    'provider_readback_fingerprint',
      pg_catalog.lower(target_provider_readback_fingerprint),
    'external_fence_evidence_id', target_external_fence_evidence_id,
    'actor_id', target_actor_id
  )::text, 'sha256'), 'hex')
$$;

create or replace function production_control.assert_scoring_admission_optimistic_input(
  input jsonb,
  require_external_fence boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if pg_catalog.jsonb_typeof(input->'expected_activation_revision') is distinct from 'number'
     or input->>'expected_activation_revision' !~ '^[0-9]+$'
     or coalesce(input->>'expected_authority_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_admission_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.jsonb_typeof(input->'expected_admission_revision') is distinct from 'number'
     or input->>'expected_admission_revision' !~ '^[0-9]+$'
     or coalesce(input->>'deployment_id', '') !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'deployment_commit', '') !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or (require_external_fence and coalesce(
       input->>'external_fence_evidence_id', ''
     ) !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_ADMISSION_OPTIMISTIC_INPUT_REQUIRED';
  end if;
end;
$$;

create or replace function public.record_production_scoring_external_fence_evidence(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  evidence production_control.scoring_external_fence_evidence%rowtype;
  captured timestamptz;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
  existing := production_control.lookup_cutover_receipt(
    'RECORD_SCORING_EXTERNAL_FENCE_EVIDENCE', input
  );
  if existing is not null then return existing; end if;

  if input->>'operation' is distinct from 'RECORD_PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE'
     or coalesce(input->>'deployment_id', '') !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'deployment_commit', '') !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'provider_evidence_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'deployment_scope_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'google_credential_scope_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'writer_coverage_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'legacy_lease_set_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'legacy_lease_count') is distinct from 'number'
     or input->>'legacy_deployments_fenced' is distinct from 'true'
     or input->>'google_credentials_fenced' is distinct from 'true'
     or input->>'manual_google_scoring_fenced' is distinct from 'true'
     or coalesce(input->>'actor_id', '') = '' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_EXTERNAL_FENCE_EXACT_EVIDENCE_REQUIRED';
  end if;
  captured := (input->>'captured_at')::timestamptz;
  if captured > pg_catalog.now()
     or captured < pg_catalog.now() - interval '5 minutes' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE_STALE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  perform pg_catalog.pg_advisory_xact_lock(
    731102027,
    pg_catalog.hashtext(pg_catalog.lower(input->>'request_fingerprint'))
  );
  existing := production_control.lookup_cutover_receipt(
    'RECORD_SCORING_EXTERNAL_FENCE_EVIDENCE', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for share;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for share;
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or activation.state not in ('STAGED', 'GOOGLE_LEASE_ARMED', 'SCORING_COMMITTED')
     or (activation.current_authority = 'GOOGLE' and activation.scoring_ingress_enabled)
     or (activation.current_authority = 'SUPABASE' and (
       activation.state <> 'SCORING_COMMITTED' or not activation.scoring_ingress_enabled
     )) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_EXTERNAL_FENCE_REVISION_CONFLICT';
  end if;
  if (input->>'legacy_lease_set_fingerprint')
       is distinct from production_control.scoring_admission_legacy_set_fingerprint()
     or (input->>'legacy_lease_count')::integer is distinct from (
       select pg_catalog.count(*)::integer
       from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026'
         and lease.protocol_version = 'LEGACY_V1'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_LEGACY_SCORING_LEASE_RECONCILIATION_REQUIRED';
  end if;

  insert into production_control.scoring_external_fence_evidence (
    request_fingerprint, deployment_commit, deployment_id,
    vercel_project_id, source_workbook_id,
    provider_evidence_fingerprint, deployment_scope_fingerprint,
    google_credential_scope_fingerprint, writer_coverage_fingerprint,
    legacy_lease_set_fingerprint, legacy_lease_count,
    legacy_deployments_fenced, google_credentials_fenced,
    manual_google_scoring_fenced, captured_at, expires_at, actor_id
  ) values (
    pg_catalog.lower(input->>'request_fingerprint'),
    pg_catalog.lower(input->>'deployment_commit'), input->>'deployment_id',
    'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
    pg_catalog.lower(input->>'provider_evidence_fingerprint'),
    pg_catalog.lower(input->>'deployment_scope_fingerprint'),
    pg_catalog.lower(input->>'google_credential_scope_fingerprint'),
    pg_catalog.lower(input->>'writer_coverage_fingerprint'),
    pg_catalog.lower(input->>'legacy_lease_set_fingerprint'),
    (input->>'legacy_lease_count')::integer,
    true, true, true, captured, captured + interval '30 minutes',
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into evidence;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_EXTERNAL_FENCE_ATTESTED', 'SCORING_AUTHORITY', '2026',
    evidence.actor_id, evidence.request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'evidence_id', evidence.evidence_id,
      'deployment_id', evidence.deployment_id,
      'deployment_commit', evidence.deployment_commit,
      'provider_evidence_fingerprint', evidence.provider_evidence_fingerprint,
      'legacy_lease_set_fingerprint', evidence.legacy_lease_set_fingerprint,
      'legacy_lease_count', evidence.legacy_lease_count,
      'expires_at', evidence.expires_at,
      'database_centrally_enforced', false
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE_RECORDED',
    'evidence_id', evidence.evidence_id,
    'deployment_id', evidence.deployment_id,
    'deployment_commit', evidence.deployment_commit,
    'captured_at', evidence.captured_at,
    'expires_at', evidence.expires_at,
    'external_google_writer_fence_centrally_enforced', false,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'RECORD_SCORING_EXTERNAL_FENCE_EVIDENCE', input, response_value
  );
  return response_value;
end;
$$;

-- A provider fence is deliberately short lived. A long drain or reconciliation
-- must not depend on operator speed, so a fresh independently captured proof can
-- replace an expired proof without reopening either ingress. The replacement is
-- allowed only when every immutable provider/deployment/credential/writer-scope
-- fingerprint is byte-for-byte identical to the proof already bound to the
-- active closure. Only the legacy lease-set evidence may advance.
create or replace function public.refresh_production_scoring_external_fence_evidence(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  prior_legacy_closure production_control.scoring_admission_closures%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  prior_evidence production_control.scoring_external_fence_evidence%rowtype;
  replacement production_control.scoring_external_fence_evidence%rowtype;
  captured timestamptz;
  next_admission_revision bigint;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
  if input->>'operation' is distinct from
       'REFRESH_PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE'
     or coalesce(input->>'prior_external_fence_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'closure_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'provider_evidence_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'deployment_scope_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'google_credential_scope_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'writer_coverage_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'legacy_lease_set_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'legacy_lease_count')
       is distinct from 'number'
     or input->>'legacy_deployments_fenced' is distinct from 'true'
     or input->>'google_credentials_fenced' is distinct from 'true'
     or input->>'manual_google_scoring_fenced' is distinct from 'true' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_EXTERNAL_FENCE_REFRESH_EXACT_EVIDENCE_REQUIRED';
  end if;
  captured := (input->>'captured_at')::timestamptz;
  if captured > pg_catalog.now()
     or captured < pg_catalog.now() - interval '5 minutes' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_EXTERNAL_FENCE_REFRESH_STALE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'REFRESH_SCORING_EXTERNAL_FENCE_EVIDENCE', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid
  for update;
  select * into strict prior_evidence
  from production_control.scoring_external_fence_evidence value
  where value.evidence_id = (input->>'prior_external_fence_evidence_id')::uuid
  for update;
  if closure.prior_legacy_closure_id is not null then
    select * into strict prior_legacy_closure
    from production_control.scoring_admission_closures value
    where value.closure_id = closure.prior_legacy_closure_id
    for update;
  end if;
  if activation.active_transition_epoch_id is not null then
    select * into strict epoch
    from scoring_authority.authority_epochs value
    where value.epoch_id = activation.active_transition_epoch_id
    for update;
  end if;

  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit
       is distinct from input->>'deployment_commit'
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id is distinct from prior_evidence.evidence_id
     or closure.external_fence_evidence_id is distinct from prior_evidence.evidence_id
     or closure.deployment_id is distinct from input->>'deployment_id'
     or gate.state is distinct from 'PAUSED'
     or gate.admission_state not in ('CLOSING', 'CLOSED')
     or closure.status not in ('CLOSING', 'CLOSED')
     or not gate.admission_protocol_enforced
     or gate.authority is distinct from activation.current_authority
     or closure.authority is distinct from activation.current_authority
     or (activation.active_transition_epoch_id is not null and (
       epoch.status is distinct from 'PREPARED'
       or epoch.admission_closure_id is distinct from closure.closure_id
       or epoch.external_fence_evidence_id is distinct from prior_evidence.evidence_id
     )) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_EXTERNAL_FENCE_REFRESH_BOUNDARY_CHANGED';
  end if;
  if prior_evidence.revoked_at is not null
     or prior_evidence.deployment_commit is distinct from input->>'deployment_commit'
     or prior_evidence.deployment_id is distinct from input->>'deployment_id'
     or prior_evidence.vercel_project_id
       is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or prior_evidence.source_workbook_id
       is distinct from '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or prior_evidence.provider_evidence_fingerprint
       is distinct from pg_catalog.lower(input->>'provider_evidence_fingerprint')
     or prior_evidence.deployment_scope_fingerprint
       is distinct from pg_catalog.lower(input->>'deployment_scope_fingerprint')
     or prior_evidence.google_credential_scope_fingerprint
       is distinct from pg_catalog.lower(
         input->>'google_credential_scope_fingerprint'
       )
     or prior_evidence.writer_coverage_fingerprint
       is distinct from pg_catalog.lower(input->>'writer_coverage_fingerprint') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_EXTERNAL_FENCE_REFRESH_SCOPE_DRIFT';
  end if;
  if input->>'legacy_lease_set_fingerprint'
       is distinct from production_control.scoring_admission_legacy_set_fingerprint()
     or (input->>'legacy_lease_count')::integer is distinct from (
       select pg_catalog.count(*)::integer
       from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026'
         and lease.protocol_version = 'LEGACY_V1'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_LEGACY_SCORING_LEASE_RECONCILIATION_REQUIRED';
  end if;

  insert into production_control.scoring_external_fence_evidence (
    request_fingerprint, deployment_commit, deployment_id,
    vercel_project_id, source_workbook_id,
    provider_evidence_fingerprint, deployment_scope_fingerprint,
    google_credential_scope_fingerprint, writer_coverage_fingerprint,
    legacy_lease_set_fingerprint, legacy_lease_count,
    legacy_deployments_fenced, google_credentials_fenced,
    manual_google_scoring_fenced, captured_at, expires_at, actor_id
  ) values (
    pg_catalog.lower(input->>'request_fingerprint'),
    prior_evidence.deployment_commit, prior_evidence.deployment_id,
    prior_evidence.vercel_project_id, prior_evidence.source_workbook_id,
    prior_evidence.provider_evidence_fingerprint,
    prior_evidence.deployment_scope_fingerprint,
    prior_evidence.google_credential_scope_fingerprint,
    prior_evidence.writer_coverage_fingerprint,
    pg_catalog.lower(input->>'legacy_lease_set_fingerprint'),
    (input->>'legacy_lease_count')::integer,
    true, true, true, captured, captured + interval '30 minutes',
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into replacement;

  next_admission_revision := gate.admission_revision + 1;
  update scoring_authority.ingress_gates
  set admission_revision = next_admission_revision,
      external_fence_evidence_id = replacement.evidence_id,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026';
  update production_control.scoring_admission_closures
  set external_fence_evidence_id = replacement.evidence_id,
      closing_admission_revision = case when status = 'CLOSING'
        then next_admission_revision else closing_admission_revision end,
      closed_admission_revision = case when status = 'CLOSED'
        then next_admission_revision else closed_admission_revision end
  where closure_id = closure.closure_id;
  if closure.prior_legacy_closure_id is not null then
    update production_control.scoring_admission_closures
    set external_fence_evidence_id = replacement.evidence_id
    where closure_id = closure.prior_legacy_closure_id;
  end if;
  if activation.active_transition_epoch_id is not null then
    update scoring_authority.authority_epochs
    set external_fence_evidence_id = replacement.evidence_id,
        closed_admission_revision = next_admission_revision
    where epoch_id = activation.active_transition_epoch_id;
  end if;
  update production_control.cutover_activation_state
  set activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_SCORING_EXTERNAL_FENCE_REFRESHED',
    'SCORING_AUTHORITY', '2026', pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'closure_id', closure.closure_id,
      'prior_evidence_id', prior_evidence.evidence_id,
      'replacement_evidence_id', replacement.evidence_id,
      'activation_revision', activation.activation_revision,
      'admission_revision', next_admission_revision,
      'expires_at', replacement.expires_at,
      'immutable_scope_match', true,
      'database_centrally_enforced', false
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE_REFRESHED',
    'closure_id', closure.closure_id,
    'prior_evidence_id', prior_evidence.evidence_id,
    'evidence_id', replacement.evidence_id,
    'captured_at', replacement.captured_at,
    'expires_at', replacement.expires_at,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', next_admission_revision,
    'external_google_writer_fence_centrally_enforced', false,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'REFRESH_SCORING_EXTERNAL_FENCE_EVIDENCE', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.arm_production_google_ingress_lease_gate(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  next_admission_generation uuid := extensions.gen_random_uuid();
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
  existing := production_control.lookup_cutover_receipt('ARM_GOOGLE_LEASE_GATE', input);
  if existing is not null then return existing; end if;
  if coalesce(input->>'actor_id', '') = ''
     or coalesce(input->>'deployment_id', '') !~ '^dpl_[A-Za-z0-9]{8,64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_LEASE_GATE_V2_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'ARM_GOOGLE_LEASE_GATE', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or activation.state <> 'STAGED'
     or activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or gate.authority <> 'GOOGLE'
     or gate.active_epoch_id is not null
     or gate.active_closure_id is not null
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026' and lease.status = 'ACTIVE'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_LEASE_GATE_V2_NOT_ARMABLE';
  end if;
  update scoring_authority.ingress_gates
  set state = 'OPEN', admission_state = 'OPEN',
      admission_revision = admission_revision + 1,
      admission_generation_id = next_admission_generation,
      admission_protocol_enforced = true,
      admission_enforced_at = pg_catalog.now(),
      admission_opened_at = pg_catalog.now(),
      admission_deployment_id = input->>'deployment_id',
      legacy_lease_set_fingerprint =
        production_control.scoring_admission_legacy_set_fingerprint(),
      active_epoch_id = null, active_closure_id = null,
      external_fence_evidence_id = null,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
  returning * into gate;
  update production_control.cutover_activation_state
  set state = 'GOOGLE_LEASE_ARMED', activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_V2_ARMED', 'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'authority_generation_id', activation.authority_generation_id,
      'admission_generation_id', gate.admission_generation_id,
      'admission_revision', gate.admission_revision,
      'deployment_id', gate.admission_deployment_id,
      'database_centrally_enforced_external_google', false
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_GOOGLE_LEASE_GATE_V2_ARMED',
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'authority', 'GOOGLE', 'execution_gate', gate.state,
    'admission_state', gate.admission_state,
    'external_fence_evidence_id', null,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt('ARM_GOOGLE_LEASE_GATE', input, response_value);
  return response_value;
end;
$$;

create or replace function public.begin_production_scoring_ingress_v2(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  prior scoring_authority.scoring_ingress_leases%rowtype;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  expected_authority text := pg_catalog.upper(coalesce(input->>'expected_authority', ''));
  operation_request uuid;
  nonce_value text := pg_catalog.lower(coalesce(input->>'lease_nonce', ''));
  active_count integer;
  replay_nonce_rotated boolean := false;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
  if expected_authority <> 'GOOGLE'
     or input->>'writer_intent' is distinct from 'CANONICAL_LEGACY'
     or coalesce(input->>'operation', '') !~ '^[A-Z0-9:_-]{3,100}$'
     or coalesce(input->>'match_id', '') = ''
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or nonce_value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(input->>'deployment_id', '') !~ '^dpl_[A-Za-z0-9]{8,64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_INGRESS_V2_REQUEST_INVALID';
  end if;
  operation_request := (input->>'operation_request_id')::uuid;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for share;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into prior
  from scoring_authority.scoring_ingress_leases value
  where value.tournament_id = '2026'
    and value.protocol_version = 'ADMISSION_V2'
    and value.operation_request_id = operation_request
  for update;
  if found then
    if prior.request_payload_hash is distinct from
         production_control.scoring_admission_begin_payload_hash(input) then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_SCORING_INGRESS_V2_IDEMPOTENCY_CONFLICT';
    end if;
    if prior.authority is distinct from 'GOOGLE'
       or prior.authority_generation_id
         is distinct from (input->>'expected_authority_generation')::uuid
       or prior.admission_generation_id
         is distinct from (input->>'expected_admission_generation')::uuid
       or prior.admission_revision
         is distinct from (input->>'expected_admission_revision')::bigint
       or prior.admitted_activation_revision
         is distinct from (input->>'expected_activation_revision')::bigint
       or prior.deployment_commit is distinct from input->>'deployment_commit'
       or activation.authority_generation_id
         is distinct from prior.authority_generation_id
       or gate.admission_generation_id
         is distinct from prior.admission_generation_id
       or gate.admission_deployment_id is distinct from input->>'deployment_id'
       or activation.expected_deployment_commit
         is distinct from input->>'deployment_commit'
       or not gate.admission_protocol_enforced
       or gate.authority is distinct from 'GOOGLE'
       or activation.current_authority is distinct from 'GOOGLE'
       or activation.state is distinct from 'GOOGLE_LEASE_ARMED'
       or activation.scoring_ingress_enabled then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_SCORING_ADMISSION_V2_REPLAY_BOUNDARY_CHANGED';
    end if;
    if gate.admission_state = 'OPEN' then
      if gate.state is distinct from 'OPEN'
         or gate.active_closure_id is not null
         or gate.admission_revision is distinct from prior.admission_revision
         or activation.activation_revision
           is distinct from prior.admitted_activation_revision then
        raise exception using errcode = '40001',
          message = 'PRODUCTION_SCORING_ADMISSION_V2_REPLAY_BOUNDARY_CHANGED';
      end if;
    elsif gate.admission_state = 'CLOSING' then
      select * into strict closure
      from production_control.scoring_admission_closures value
      where value.closure_id = gate.active_closure_id
      for share;
      if gate.state is distinct from 'PAUSED'
         or closure.status is distinct from 'CLOSING'
         or closure.closure_kind is distinct from 'LEGACY_ADMISSION'
         or closure.authority is distinct from 'GOOGLE'
         or closure.authority_generation_id
           is distinct from prior.authority_generation_id
         or closure.admission_generation_id
           is distinct from prior.admission_generation_id
         or prior.close_fence_id is distinct from closure.closure_id
         or prior.admission_sequence > closure.lease_high_watermark then
        raise exception using errcode = '40001',
          message = 'PRODUCTION_SCORING_ADMISSION_V2_REPLAY_BOUNDARY_CHANGED';
      end if;
    else
      raise exception using errcode = '40001',
        message = 'PRODUCTION_SCORING_ADMISSION_V2_REPLAY_BOUNDARY_CHANGED';
    end if;
    if prior.resolution_state = 'ADMITTED' then
      update scoring_authority.scoring_ingress_leases
      set lease_nonce_hash = pg_catalog.encode(
            extensions.digest(nonce_value, 'sha256'), 'hex'
          ),
          expires_at = pg_catalog.now() + pg_catalog.make_interval(
            secs => greatest(30, least(
              coalesce((input->>'lease_seconds')::integer, 180), 300
            ))
          )
      where lease_id = prior.lease_id
      returning * into prior;
      replay_nonce_rotated := true;
      insert into production_control.operation_audit_events (
        event_type, domain, tournament_id, actor, request_fingerprint,
        result, details
      ) values (
        'PRODUCTION_SCORING_LEASE_V2_BEGIN_REPLAY',
        'SCORING_AUTHORITY', '2026', prior.actor_id,
        pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
        pg_catalog.jsonb_build_object(
          'lease_id', prior.lease_id,
          'operation_request_id', prior.operation_request_id,
          'resolution_state', prior.resolution_state,
          'lease_nonce_rotated', true,
          'replay_usable', true,
          'expires_at', prior.expires_at
        )
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'lease_id', prior.lease_id,
      'operation_request_id', prior.operation_request_id,
      'authority', prior.authority,
      'authority_generation_id', prior.authority_generation_id,
      'admission_generation_id', prior.admission_generation_id,
      'admission_revision', prior.admission_revision,
      'writer_intent', prior.writer_intent,
      'resolution_state', prior.resolution_state,
      'lease_nonce_rotated', replay_nonce_rotated,
      'replay_usable', replay_nonce_rotated,
      'idempotent', true
    );
  end if;

  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or gate.state <> 'OPEN' or gate.admission_state <> 'OPEN'
     or gate.active_closure_id is not null
     or not gate.admission_protocol_enforced
     or gate.authority <> expected_authority
     or activation.current_authority <> expected_authority
     or activation.state <> 'GOOGLE_LEASE_ARMED'
     or activation.scoring_ingress_enabled
     or not exists (
       select 1 from scoring_authority.matches match_value
       where match_value.tournament_id = '2026'
         and match_value.match_id = input->>'match_id'
     ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_ADMISSION_V2_BOUNDARY_MISMATCH';
  end if;

  insert into scoring_authority.scoring_ingress_leases (
    tournament_id, match_id, authority, actor_id, created_at, expires_at,
    operation, authority_generation_id, deployment_commit, request_fingerprint,
    status, protocol_version, admission_sequence, admission_generation_id,
    admission_revision, admitted_activation_revision, lease_nonce_hash,
    writer_intent, operation_request_id, request_payload_hash, resolution_state
  ) values (
    '2026', input->>'match_id', expected_authority,
    pg_catalog.left(coalesce(nullif(input->>'actor_id', ''),
      'Authorized Production scorer'), 160),
    pg_catalog.now(), pg_catalog.now() + pg_catalog.make_interval(
      secs => greatest(30, least(
        coalesce((input->>'lease_seconds')::integer, 180), 300
      ))
    ),
    input->>'operation', activation.authority_generation_id,
    activation.expected_deployment_commit,
    pg_catalog.lower(input->>'request_fingerprint'), 'ACTIVE', 'ADMISSION_V2',
    pg_catalog.nextval('production_control.scoring_admission_lease_sequence'),
    gate.admission_generation_id, gate.admission_revision,
    activation.activation_revision,
    pg_catalog.encode(extensions.digest(nonce_value, 'sha256'), 'hex'),
    'CANONICAL_LEGACY', operation_request,
    production_control.scoring_admission_begin_payload_hash(input), 'ADMITTED'
  ) returning * into lease;
  select production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  ) into active_count;
  update scoring_authority.ingress_gates
  set unresolved_client_queues = active_count, updated_at = pg_catalog.now()
  where tournament_id = '2026';
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_LEASE_V2_ADMITTED', 'SCORING_AUTHORITY', '2026',
    lease.actor_id, lease.request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'admission_sequence', lease.admission_sequence,
      'match_id', lease.match_id,
      'operation', lease.operation,
      'operation_request_id', lease.operation_request_id,
      'writer_intent', lease.writer_intent,
      'authority_generation_id', lease.authority_generation_id,
      'admission_generation_id', lease.admission_generation_id,
      'admission_revision', lease.admission_revision,
      'expires_at', lease.expires_at
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_LEASE_V2_ADMITTED',
    'lease_id', lease.lease_id,
    'operation_request_id', lease.operation_request_id,
    'authority', lease.authority,
    'authority_generation_id', lease.authority_generation_id,
    'admission_generation_id', lease.admission_generation_id,
    'admission_revision', lease.admission_revision,
    'writer_intent', lease.writer_intent,
    'resolution_state', lease.resolution_state,
    'lease_nonce_rotated', false, 'replay_usable', true,
    'active_or_unresolved_leases', active_count, 'idempotent', false
  );
end;
$$;

-- The legacy name is retained only as a fail-closed compatibility bridge. A
-- v2 caller must supply every new fence field, so old flag-enabled code cannot
-- create an unfenced lease after this migration.
create or replace function public.begin_production_scoring_ingress(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return public.begin_production_scoring_ingress_v2(input);
end;
$$;

create or replace function public.mark_production_scoring_ingress_write_started(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  unresolved_count integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
  existing := production_control.lookup_cutover_receipt(
    'MARK_SCORING_INGRESS_WRITE_STARTED', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for share;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into lease
  from scoring_authority.scoring_ingress_leases value
  where value.lease_id = (input->>'lease_id')::uuid
  for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'PRODUCTION_SCORING_LEASE_V2_NOT_FOUND';
  end if;
  perform production_control.assert_production_scoring_lease_nonce(
    lease, input->>'lease_nonce'
  );
  existing := production_control.lookup_cutover_receipt(
    'MARK_SCORING_INGRESS_WRITE_STARTED', input
  );
  if existing is not null then return existing; end if;
  if lease.admitted_activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.activation_revision < lease.admitted_activation_revision
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or lease.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or lease.authority_generation_id is distinct from activation.authority_generation_id
     or lease.admission_generation_id is distinct from gate.admission_generation_id
     or lease.admission_revision > gate.admission_revision
     or gate.admission_state not in ('OPEN', 'CLOSING')
     or not gate.admission_protocol_enforced then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_LEASE_V2_BOUNDARY_CHANGED';
  end if;
  if lease.resolution_state = 'WRITE_STARTED' then
    response_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_SCORING_WRITE_ALREADY_STARTED',
      'lease_id', lease.lease_id, 'resolution_state', lease.resolution_state,
      'idempotent', true
    );
    perform production_control.store_cutover_receipt(
      'MARK_SCORING_INGRESS_WRITE_STARTED', input, response_value
    );
    return response_value;
  end if;
  if lease.resolution_state <> 'ADMITTED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_LEASE_V2_NOT_STARTABLE';
  end if;
  if lease.expires_at <= pg_catalog.now() then
    update scoring_authority.scoring_ingress_leases
    set resolution_state = 'AMBIGUOUS', outcome_reported_at = pg_catalog.now(),
        last_error_code = 'LEASE_EXPIRED_BEFORE_WRITE_START'
    where lease_id = lease.lease_id;
    unresolved_count := production_control.scoring_admission_unresolved_count(
      gate.admission_generation_id
    );
    update scoring_authority.ingress_gates
    set unresolved_client_queues = unresolved_count, updated_at = pg_catalog.now()
    where tournament_id = '2026';
    response_value := pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_SCORING_LEASE_EXPIRED_AMBIGUOUS',
      'lease_id', lease.lease_id, 'resolution_state', 'AMBIGUOUS',
      'idempotent', false
    );
  else
    update scoring_authority.scoring_ingress_leases
    set resolution_state = 'WRITE_STARTED', write_started_at = pg_catalog.now()
    where lease_id = lease.lease_id
    returning * into lease;
    response_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_SCORING_WRITE_STARTED',
      'lease_id', lease.lease_id,
      'write_started_at', lease.write_started_at,
      'resolution_state', lease.resolution_state,
      'idempotent', false
    );
  end if;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    case when response_value->>'ok' = 'true'
      then 'PRODUCTION_SCORING_LEASE_WRITE_STARTED'
      else 'PRODUCTION_SCORING_LEASE_EXPIRED_AMBIGUOUS' end,
    'SCORING_AUTHORITY', '2026', lease.actor_id,
    pg_catalog.lower(input->>'request_fingerprint'),
    case when response_value->>'ok' = 'true' then 'SUCCEEDED' else 'BLOCKED' end,
    pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'admission_generation_id', lease.admission_generation_id,
      'resolution_state', response_value->>'resolution_state'
    )
  );
  perform production_control.store_cutover_receipt(
    'MARK_SCORING_INGRESS_WRITE_STARTED', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.report_production_scoring_ingress_outcome(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  requested_outcome text := pg_catalog.upper(coalesce(input->>'outcome_state', ''));
  unresolved_count integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
  existing := production_control.lookup_cutover_receipt(
    'REPORT_SCORING_INGRESS_OUTCOME', input
  );
  if existing is not null then return existing; end if;
  if requested_outcome not in (
       'CONFIRMED_WRITE', 'PROVEN_NO_WRITE', 'AMBIGUOUS', 'PARTIAL_WRITE'
     )
     or coalesce(input->>'outcome_evidence_fingerprint', '')
       !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_LEASE_OUTCOME_EVIDENCE_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for share;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into lease
  from scoring_authority.scoring_ingress_leases value
  where value.lease_id = (input->>'lease_id')::uuid
  for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'PRODUCTION_SCORING_LEASE_V2_NOT_FOUND';
  end if;
  perform production_control.assert_production_scoring_lease_nonce(
    lease, input->>'lease_nonce'
  );
  existing := production_control.lookup_cutover_receipt(
    'REPORT_SCORING_INGRESS_OUTCOME', input
  );
  if existing is not null then return existing; end if;
  if lease.admitted_activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.activation_revision < lease.admitted_activation_revision
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or lease.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or lease.authority_generation_id is distinct from activation.authority_generation_id
     or lease.admission_generation_id is distinct from gate.admission_generation_id
     or gate.admission_state not in ('OPEN', 'CLOSING')
     or not gate.admission_protocol_enforced then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_LEASE_V2_BOUNDARY_CHANGED';
  end if;
  if lease.resolution_state in (
    'CONFIRMED_WRITE', 'PROVEN_NO_WRITE', 'RESOLVED_WRITE', 'RESOLVED_NO_WRITE'
  ) then
    if lease.resolution_state <> requested_outcome then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_SCORING_LEASE_OUTCOME_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'lease_id', lease.lease_id,
      'resolution_state', lease.resolution_state, 'idempotent', true
    );
  end if;
  if requested_outcome = 'PROVEN_NO_WRITE'
     and (lease.resolution_state <> 'ADMITTED' or lease.write_started_at is not null) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_NO_WRITE_RECONCILIATION_REQUIRED';
  end if;
  if requested_outcome in ('CONFIRMED_WRITE', 'AMBIGUOUS', 'PARTIAL_WRITE')
     and lease.resolution_state <> 'WRITE_STARTED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_WRITE_START_EVIDENCE_REQUIRED';
  end if;
  if requested_outcome = 'CONFIRMED_WRITE'
     and (
       coalesce(input->>'provider_mutation_key', '') = ''
       or coalesce(input->>'provider_before_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(input->>'provider_after_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(input->>'provider_readback_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or input->>'provider_after_fingerprint'
         is distinct from input->>'provider_readback_fingerprint'
     ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_CONFIRMED_WRITE_READBACK_REQUIRED';
  end if;
  if pg_catalog.lower(input->>'outcome_evidence_fingerprint')
       is distinct from production_control.scoring_lease_outcome_evidence_hash(
         lease.lease_id,
         lease.request_fingerprint,
         requested_outcome,
         input->>'provider_mutation_key',
         input->>'provider_before_fingerprint',
         input->>'provider_after_fingerprint',
         input->>'provider_readback_fingerprint',
         lease.authority_generation_id,
         lease.admission_generation_id,
         lease.admission_revision
       ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_LEASE_OUTCOME_EVIDENCE_HASH_MISMATCH';
  end if;

  update scoring_authority.scoring_ingress_leases
  set resolution_state = requested_outcome,
      status = case when requested_outcome in ('CONFIRMED_WRITE', 'PROVEN_NO_WRITE')
        then 'COMPLETED' else 'ACTIVE' end,
      completed_at = case when requested_outcome in ('CONFIRMED_WRITE', 'PROVEN_NO_WRITE')
        then pg_catalog.now() else null end,
      outcome_reported_at = pg_catalog.now(),
      provider_mutation_key = nullif(input->>'provider_mutation_key', ''),
      provider_before_fingerprint = nullif(
        pg_catalog.lower(input->>'provider_before_fingerprint'), ''
      ),
      provider_after_fingerprint = nullif(
        pg_catalog.lower(input->>'provider_after_fingerprint'), ''
      ),
      provider_readback_fingerprint = nullif(
        pg_catalog.lower(input->>'provider_readback_fingerprint'), ''
      ),
      outcome_evidence_fingerprint = pg_catalog.lower(
        input->>'outcome_evidence_fingerprint'
      ),
      resolved_at = case when requested_outcome in ('CONFIRMED_WRITE', 'PROVEN_NO_WRITE')
        then pg_catalog.now() else null end,
      resolved_by = case when requested_outcome in ('CONFIRMED_WRITE', 'PROVEN_NO_WRITE')
        then pg_catalog.left(input->>'actor_id', 160) else null end,
      last_error_code = nullif(
        pg_catalog.left(input->>'error_code', 120), ''
      )
  where lease_id = lease.lease_id
  returning * into lease;
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  );
  update scoring_authority.ingress_gates
  set unresolved_client_queues = unresolved_count, updated_at = pg_catalog.now()
  where tournament_id = '2026';
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_LEASE_' || requested_outcome,
    'SCORING_AUTHORITY', '2026', pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'),
    case when requested_outcome in ('AMBIGUOUS', 'PARTIAL_WRITE')
      then 'BLOCKED' else 'SUCCEEDED' end,
    pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'resolution_state', lease.resolution_state,
      'provider_readback_fingerprint', lease.provider_readback_fingerprint,
      'outcome_evidence_fingerprint', lease.outcome_evidence_fingerprint,
      'active_or_unresolved_leases', unresolved_count
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_LEASE_OUTCOME_RECORDED',
    'lease_id', lease.lease_id,
    'resolution_state', lease.resolution_state,
    'active_or_unresolved_leases', unresolved_count,
    'requires_reconciliation', lease.resolution_state in ('AMBIGUOUS', 'PARTIAL_WRITE'),
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'REPORT_SCORING_INGRESS_OUTCOME', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.resolve_production_scoring_ingress_ambiguity(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  requested_resolution text := pg_catalog.upper(
    coalesce(input->>'resolution', '')
  );
  unresolved_count integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
  existing := production_control.lookup_cutover_receipt(
    'RESOLVE_SCORING_INGRESS_AMBIGUITY', input
  );
  if existing is not null then return existing; end if;
  if requested_resolution not in ('WRITE', 'NO_WRITE')
     or coalesce(input->>'resolution_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'provider_readback_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'actor_id', '') = '' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_AMBIGUITY_RESOLUTION_EVIDENCE_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for share;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into lease
  from scoring_authority.scoring_ingress_leases value
  where value.lease_id = (input->>'lease_id')::uuid
  for update;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_AMBIGUITY_NOT_RESOLVABLE';
  end if;
  existing := production_control.lookup_cutover_receipt(
    'RESOLVE_SCORING_INGRESS_AMBIGUITY', input
  );
  if existing is not null then return existing; end if;
  if lease.resolution_state not in ('AMBIGUOUS', 'PARTIAL_WRITE') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_AMBIGUITY_NOT_RESOLVABLE';
  end if;
  if lease.resolution_state = 'PARTIAL_WRITE' and requested_resolution = 'NO_WRITE' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_PARTIAL_WRITE_REPAIR_REQUIRED';
  end if;
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or lease.admission_generation_id is distinct from gate.admission_generation_id
     or gate.admission_state not in ('OPEN', 'CLOSING') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_AMBIGUITY_BOUNDARY_CHANGED';
  end if;
  update scoring_authority.scoring_ingress_leases
  set resolution_state = case when requested_resolution = 'WRITE'
        then 'RESOLVED_WRITE' else 'RESOLVED_NO_WRITE' end,
      status = 'COMPLETED', completed_at = pg_catalog.now(),
      provider_readback_fingerprint = pg_catalog.lower(
        input->>'provider_readback_fingerprint'
      ),
      resolution_fingerprint = pg_catalog.lower(input->>'resolution_fingerprint'),
      resolved_at = pg_catalog.now(),
      resolved_by = pg_catalog.left(input->>'actor_id', 160)
  where lease_id = lease.lease_id
  returning * into lease;
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  );
  update scoring_authority.ingress_gates
  set unresolved_client_queues = unresolved_count, updated_at = pg_catalog.now()
  where tournament_id = '2026';
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_LEASE_AMBIGUITY_RESOLVED', 'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'resolution_state', lease.resolution_state,
      'provider_readback_fingerprint', lease.provider_readback_fingerprint,
      'resolution_fingerprint', lease.resolution_fingerprint,
      'active_or_unresolved_leases', unresolved_count
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_LEASE_AMBIGUITY_RESOLVED',
    'lease_id', lease.lease_id, 'resolution_state', lease.resolution_state,
    'active_or_unresolved_leases', unresolved_count, 'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'RESOLVE_SCORING_INGRESS_AMBIGUITY', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.resolve_production_legacy_scoring_ingress(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  requested_resolution text := pg_catalog.upper(
    coalesce(input->>'resolution', '')
  );
  evidence_id uuid;
  blockers integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  if requested_resolution not in ('WRITE', 'NO_WRITE')
     or coalesce(input->>'provider_readback_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'resolution_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or (requested_resolution = 'WRITE'
       and pg_catalog.btrim(coalesce(
         input->>'provider_mutation_key', ''
       )) = '') then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_LEGACY_SCORING_RESOLUTION_EVIDENCE_REQUIRED';
  end if;
  evidence_id := (input->>'external_fence_evidence_id')::uuid;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for share;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into lease
  from scoring_authority.scoring_ingress_leases value
  where value.lease_id = (input->>'lease_id')::uuid
  for update;
  if not found
     or lease.protocol_version is distinct from 'LEGACY_V1'
     or lease.resolution_state is distinct from 'LEGACY_UNCLASSIFIED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_LEGACY_SCORING_LEASE_NOT_RESOLVABLE';
  end if;
  existing := production_control.lookup_cutover_receipt(
    'RESOLVE_LEGACY_SCORING_INGRESS', input
  );
  if existing is not null then return existing; end if;
  perform production_control.assert_current_external_scoring_fence(
    evidence_id, activation.expected_deployment_commit
  );
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or activation.expected_deployment_commit
       is distinct from input->>'deployment_commit'
     or (gate.admission_protocol_enforced and gate.admission_deployment_id
       is distinct from input->>'deployment_id')
     or activation.current_authority is distinct from 'GOOGLE'
     or gate.authority is distinct from 'GOOGLE'
     or gate.admission_state not in ('OPEN', 'CLOSING') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_LEGACY_SCORING_RESOLUTION_BOUNDARY_CHANGED';
  end if;
  if pg_catalog.lower(input->>'resolution_fingerprint') is distinct from
    production_control.scoring_legacy_resolution_evidence_hash(
      lease.lease_id,
      pg_catalog.lower(input->>'request_fingerprint'),
      requested_resolution,
      pg_catalog.lower(input->>'provider_readback_fingerprint'),
      evidence_id,
      input->>'actor_id'
    ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_LEGACY_SCORING_RESOLUTION_HASH_MISMATCH';
  end if;

  update scoring_authority.scoring_ingress_leases
  set resolution_state = case when requested_resolution = 'WRITE'
        then 'RESOLVED_WRITE' else 'RESOLVED_NO_WRITE' end,
      status = 'COMPLETED', completed_at = pg_catalog.now(),
      outcome_reported_at = pg_catalog.now(),
      provider_mutation_key = nullif(
        input->>'provider_mutation_key', ''
      ),
      provider_readback_fingerprint = pg_catalog.lower(
        input->>'provider_readback_fingerprint'
      ),
      resolution_fingerprint = pg_catalog.lower(
        input->>'resolution_fingerprint'
      ),
      resolved_at = pg_catalog.now(),
      resolved_by = input->>'actor_id',
      last_error_code = null
  where lease_id = lease.lease_id
  returning * into lease;
  blockers := production_control.scoring_admission_legacy_blocker_count(
    gate.admission_enforced_at
  );
  update scoring_authority.ingress_gates
  set unresolved_client_queues =
        production_control.scoring_admission_unresolved_count(
          gate.admission_generation_id
        ) + blockers,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_LEGACY_SCORING_LEASE_RESOLVED', 'SCORING_AUTHORITY', '2026',
    input->>'actor_id', pg_catalog.lower(input->>'request_fingerprint'),
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'resolution_state', lease.resolution_state,
      'provider_readback_fingerprint', lease.provider_readback_fingerprint,
      'resolution_fingerprint', lease.resolution_fingerprint,
      'external_fence_evidence_id', evidence_id,
      'legacy_unclassified_remaining', blockers
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_LEGACY_SCORING_LEASE_RESOLVED',
    'lease_id', lease.lease_id,
    'resolution_state', lease.resolution_state,
    'legacy_unclassified_remaining', blockers,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'RESOLVE_LEGACY_SCORING_INGRESS', input, response_value
  );
  return response_value;
end;
$$;

-- Old clients have no outcome evidence. Completion is therefore never allowed
-- to turn a potentially transported write into a safe terminal state.
create or replace function public.complete_production_scoring_ingress(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  unresolved_count integer;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for share;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into lease
  from scoring_authority.scoring_ingress_leases value
  where value.lease_id = (input->>'lease_id')::uuid
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_SCORING_LEASE_NOT_FOUND_IDEMPOTENT',
      'idempotent', true
    );
  end if;
  if lease.protocol_version = 'ADMISSION_V2'
     and lease.resolution_state in ('ADMITTED', 'WRITE_STARTED') then
    update scoring_authority.scoring_ingress_leases
    set resolution_state = 'AMBIGUOUS', status = 'ACTIVE',
        outcome_reported_at = pg_catalog.now(), completed_at = null,
        last_error_code = 'LEGACY_COMPLETION_WITHOUT_OUTCOME_EVIDENCE'
    where lease_id = lease.lease_id
    returning * into lease;
  elsif lease.protocol_version = 'LEGACY_V1' and lease.status = 'ACTIVE' then
    -- Deliberately do not mark a legacy lease completed. It remains an explicit
    -- legacy blocker until a fresh provider boundary accounts for it.
    perform 1;
  end if;
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  ) + production_control.scoring_admission_legacy_blocker_count(
    gate.admission_enforced_at
  );
  update scoring_authority.ingress_gates
  set unresolved_client_queues = unresolved_count, updated_at = pg_catalog.now()
  where tournament_id = '2026';
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_LEGACY_COMPLETION_AMBIGUOUS', 'SCORING_AUTHORITY', '2026',
    lease.actor_id, lease.request_fingerprint, 'BLOCKED',
    pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'protocol_version', lease.protocol_version,
      'resolution_state', lease.resolution_state,
      'active_or_unresolved_leases', unresolved_count
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_LEGACY_COMPLETION_AMBIGUOUS',
    'lease_id', lease.lease_id,
    'resolution_state', case when lease.protocol_version = 'ADMISSION_V2'
      then 'AMBIGUOUS' else 'LEGACY_UNCLASSIFIED' end,
    'active_or_unresolved_leases', unresolved_count,
    'requires_reconciliation', true, 'idempotent', false
  );
end;
$$;

create or replace function public.close_production_scoring_admission(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  prior_legacy_closure production_control.scoring_admission_closures%rowtype;
  requested_authority text := pg_catalog.upper(
    coalesce(input->>'expected_authority', '')
  );
  evidence_id uuid;
  high_watermark bigint;
  unresolved_count integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  existing := production_control.lookup_cutover_receipt(
    'CLOSE_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  if requested_authority not in ('GOOGLE', 'SUPABASE')
     or coalesce(input->>'start_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'actor_id', '') = '' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_ADMISSION_CLOSE_EXACT_INPUT_REQUIRED';
  end if;
  evidence_id := (input->>'external_fence_evidence_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'CLOSE_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  if requested_authority = 'SUPABASE' then
    select * into strict prior_legacy_closure
    from production_control.scoring_admission_closures value
    where value.closure_id = gate.active_closure_id
    for update;
  end if;
  perform production_control.assert_current_external_scoring_fence(
    evidence_id, activation.expected_deployment_commit
  );
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or (requested_authority = 'GOOGLE'
       and activation.expected_source_fingerprint is distinct from
         pg_catalog.lower(input->>'start_source_fingerprint'))
     or activation.current_authority <> requested_authority
     or gate.authority <> requested_authority
     or gate.state <> 'OPEN'
     or not gate.admission_protocol_enforced
     or (requested_authority = 'GOOGLE' and (
       activation.state <> 'GOOGLE_LEASE_ARMED'
       or activation.scoring_ingress_enabled
       or gate.admission_state <> 'OPEN'
       or gate.active_closure_id is not null
     ))
     or (requested_authority = 'SUPABASE' and (
       activation.state <> 'SCORING_COMMITTED'
       or not activation.scoring_ingress_enabled
       or gate.admission_state <> 'CLOSED'
       or gate.active_closure_id is null
       or prior_legacy_closure.closure_kind <> 'LEGACY_ADMISSION'
       or prior_legacy_closure.authority <> 'GOOGLE'
       or prior_legacy_closure.status not in ('CLOSED', 'CONSUMED')
     )) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_ADMISSION_CLOSE_REVISION_CONFLICT';
  end if;
  select coalesce(pg_catalog.max(lease.admission_sequence), 0)
    into high_watermark
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.protocol_version = 'ADMISSION_V2'
    and lease.admission_generation_id = gate.admission_generation_id;

  insert into production_control.scoring_admission_closures (
    closure_kind, prior_legacy_closure_id,
    tournament_id, authority, authority_generation_id,
    admission_generation_id, deployment_id,
    opening_admission_revision, closing_admission_revision,
    lease_high_watermark, start_source_fingerprint,
    external_fence_evidence_id, close_request_fingerprint,
    close_payload_hash, actor_id
  ) values (
    case when requested_authority = 'GOOGLE'
      then 'LEGACY_ADMISSION' else 'SUPABASE_INGRESS' end,
    case when requested_authority = 'SUPABASE'
      then prior_legacy_closure.closure_id else null end,
    '2026', requested_authority, activation.authority_generation_id,
    gate.admission_generation_id, gate.admission_deployment_id,
    gate.admission_revision, gate.admission_revision + 1,
    high_watermark, pg_catalog.lower(input->>'start_source_fingerprint'),
    evidence_id, pg_catalog.lower(input->>'request_fingerprint'),
    production_control.cutover_payload_hash(input),
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into closure;
  update scoring_authority.scoring_ingress_leases
  set close_fence_id = closure.closure_id
  where tournament_id = '2026'
    and protocol_version = 'ADMISSION_V2'
    and admission_generation_id = gate.admission_generation_id
    and resolution_state in ('ADMITTED', 'WRITE_STARTED', 'AMBIGUOUS', 'PARTIAL_WRITE');
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  ) + production_control.scoring_admission_legacy_blocker_count(
    gate.admission_enforced_at
  );
  update scoring_authority.ingress_gates
  set state = 'PAUSED',
      admission_state = case when requested_authority = 'GOOGLE'
        then 'CLOSING' else 'CLOSED' end,
      admission_revision = closure.closing_admission_revision,
      active_closure_id = closure.closure_id,
      external_fence_evidence_id = evidence_id,
      unresolved_client_queues = unresolved_count,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
  returning * into gate;
  update production_control.cutover_activation_state
  set activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_ADMISSION_CLOSING', 'SCORING_AUTHORITY', '2026',
    closure.actor_id, closure.close_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'closure_id', closure.closure_id,
      'authority', closure.authority,
      'lease_high_watermark', closure.lease_high_watermark,
      'admission_revision', gate.admission_revision,
      'active_or_unresolved_leases', unresolved_count,
      'external_fence_evidence_id', evidence_id
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_ADMISSION_CLOSING',
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'execution_gate', gate.state, 'admission_state', gate.admission_state,
    'lease_high_watermark', closure.lease_high_watermark,
    'active_or_unresolved_leases', unresolved_count,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CLOSE_SCORING_ADMISSION', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.drain_production_scoring_admission(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  transitioned_count integer;
  unresolved_count integer;
  legacy_blockers integer;
  lease_fingerprint text;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  existing := production_control.lookup_cutover_receipt(
    'DRAIN_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'DRAIN_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid
  for update;
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id
       is distinct from (input->>'external_fence_evidence_id')::uuid
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or gate.state <> 'PAUSED'
     or gate.admission_state is distinct from (case
       when closure.authority = 'GOOGLE' then 'CLOSING' else 'CLOSED' end)
     or closure.status <> 'CLOSING'
     or closure.authority_generation_id is distinct from activation.authority_generation_id
     or closure.admission_generation_id is distinct from gate.admission_generation_id then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_ADMISSION_DRAIN_REVISION_CONFLICT';
  end if;
  perform lease.lease_id
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and (
      lease.protocol_version = 'LEGACY_V1'
      or lease.admission_generation_id = gate.admission_generation_id
    )
  order by lease.lease_id
  for update;
  update scoring_authority.scoring_ingress_leases
  set resolution_state = 'AMBIGUOUS', status = 'ACTIVE', completed_at = null,
      outcome_reported_at = pg_catalog.now(),
      last_error_code = case when resolution_state = 'ADMITTED'
        then 'LEASE_EXPIRED_WITHOUT_WRITE_START_PROOF'
        else 'LEASE_EXPIRED_AFTER_WRITE_START' end
  where tournament_id = '2026'
    and protocol_version = 'ADMISSION_V2'
    and admission_generation_id = gate.admission_generation_id
    and resolution_state in ('ADMITTED', 'WRITE_STARTED')
    and expires_at <= pg_catalog.now();
  get diagnostics transitioned_count = row_count;
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  );
  legacy_blockers := production_control.scoring_admission_legacy_blocker_count(
    gate.admission_enforced_at
  );
  lease_fingerprint := production_control.scoring_admission_lease_set_fingerprint(
    gate.admission_generation_id
  );
  update scoring_authority.ingress_gates
  set admission_revision = admission_revision + 1,
      unresolved_client_queues = unresolved_count + legacy_blockers,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
  returning * into gate;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_ADMISSION_DRAIN_INSPECTED', 'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'),
    case when unresolved_count + legacy_blockers = 0 then 'SUCCEEDED' else 'BLOCKED' end,
    pg_catalog.jsonb_build_object(
      'closure_id', closure.closure_id,
      'expired_became_ambiguous', transitioned_count,
      'v2_unresolved', unresolved_count,
      'legacy_unclassified', legacy_blockers,
      'lease_set_fingerprint', lease_fingerprint
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_ADMISSION_DRAIN_INSPECTED',
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'admission_revision', gate.admission_revision,
    'expired_became_ambiguous', transitioned_count,
    'v2_unresolved', unresolved_count,
    'legacy_unclassified', legacy_blockers,
    'active_or_unresolved_leases', unresolved_count + legacy_blockers,
    'lease_set_fingerprint', lease_fingerprint,
    'ready_to_finalize', unresolved_count + legacy_blockers = 0,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'DRAIN_SCORING_ADMISSION', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.finalize_production_scoring_admission(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  unresolved_count integer;
  legacy_blockers integer;
  unresolved_outbox integer;
  unresolved_archive integer;
  current_revisions jsonb;
  current_checkpoints jsonb;
  current_lease_fingerprint text;
  boundary_captured_at timestamptz;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  existing := production_control.lookup_cutover_receipt(
    'FINALIZE_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  if coalesce(input->>'final_source_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'reconciliation_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'lease_set_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'supabase_match_revisions') is distinct from 'object'
     or pg_catalog.jsonb_typeof(input->'google_checkpoints') is distinct from 'object' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_ADMISSION_FINAL_BOUNDARY_REQUIRED';
  end if;
  boundary_captured_at := (input->>'boundary_captured_at')::timestamptz;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'FINALIZE_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid
  for update;
  perform production_control.assert_current_external_scoring_fence(
    (input->>'external_fence_evidence_id')::uuid,
    activation.expected_deployment_commit
  );
  perform lease.lease_id
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and (
      lease.protocol_version = 'LEGACY_V1'
      or lease.admission_generation_id = gate.admission_generation_id
    )
  order by lease.lease_id
  for update;
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  );
  legacy_blockers := production_control.scoring_admission_legacy_blocker_count(
    gate.admission_enforced_at
  );
  current_lease_fingerprint := production_control.scoring_admission_lease_set_fingerprint(
    gate.admission_generation_id
  );
  current_revisions := production_control.current_match_revisions('2026');
  current_checkpoints := production_control.current_google_checkpoints('2026');
  select pg_catalog.count(*)::integer into unresolved_outbox
  from scoring_authority.google_outbox_events event
  where event.tournament_id = '2026' and event.status <> 'DELIVERED';
  select pg_catalog.count(*)::integer into unresolved_archive
  from scoring_authority.scorecard_archive_jobs job
  where job.tournament_id = '2026'
    and job.status not in ('VERIFIED', 'SUPERSEDED');
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id
       is distinct from (input->>'external_fence_evidence_id')::uuid
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or gate.state <> 'PAUSED'
     or gate.admission_state is distinct from (case
       when closure.authority = 'GOOGLE' then 'CLOSING' else 'CLOSED' end)
     or closure.status <> 'CLOSING'
     or closure.authority_generation_id is distinct from activation.authority_generation_id
     or closure.admission_generation_id is distinct from gate.admission_generation_id
     or boundary_captured_at < closure.closing_at
     or boundary_captured_at > pg_catalog.now()
     or boundary_captured_at < pg_catalog.now() - interval '5 minutes'
     or unresolved_count <> 0 or legacy_blockers <> 0
     or unresolved_outbox <> 0 or unresolved_archive <> 0
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026'
         and lease.protocol_version = 'ADMISSION_V2'
         and lease.admission_generation_id = gate.admission_generation_id
         and lease.admission_sequence > closure.lease_high_watermark
     )
     or pg_catalog.lower(input->>'lease_set_fingerprint')
       is distinct from current_lease_fingerprint
     or input->'supabase_match_revisions' is distinct from current_revisions
     or input->'google_checkpoints' is distinct from current_checkpoints
     or exists (
       select 1
       from scoring_authority.matches match_value
       left join scoring_authority.google_match_checkpoints checkpoint using (match_id)
       where match_value.tournament_id = '2026' and checkpoint.match_id is null
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_ADMISSION_FINAL_BOUNDARY_CHANGED';
  end if;
  update production_control.scoring_admission_closures
  set status = 'CLOSED',
      closed_admission_revision = gate.admission_revision + 1,
      final_source_fingerprint = pg_catalog.lower(input->>'final_source_fingerprint'),
      reconciliation_fingerprint = pg_catalog.lower(input->>'reconciliation_fingerprint'),
      lease_set_fingerprint = current_lease_fingerprint,
      supabase_match_revisions = current_revisions,
      google_checkpoints = current_checkpoints,
      closed_at = pg_catalog.now()
  where closure_id = closure.closure_id
  returning * into closure;
  update scoring_authority.ingress_gates
  set admission_state = 'CLOSED',
      admission_revision = closure.closed_admission_revision,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
  returning * into gate;
  update production_control.cutover_activation_state
  set activation_revision = activation_revision + 1,
      expected_source_fingerprint = closure.final_source_fingerprint,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_ADMISSION_CLOSED', 'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'closure_id', closure.closure_id,
      'authority', closure.authority,
      'admission_revision', gate.admission_revision,
      'final_source_fingerprint', closure.final_source_fingerprint,
      'reconciliation_fingerprint', closure.reconciliation_fingerprint,
      'lease_set_fingerprint', closure.lease_set_fingerprint,
      'active_or_unresolved_leases', 0,
      'unresolved_outbox', 0, 'unresolved_archive', 0
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_ADMISSION_CLOSED',
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'execution_gate', gate.state, 'admission_state', gate.admission_state,
    'final_source_fingerprint', closure.final_source_fingerprint,
    'reconciliation_fingerprint', closure.reconciliation_fingerprint,
    'lease_set_fingerprint', closure.lease_set_fingerprint,
    'active_or_unresolved_leases', 0, 'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'FINALIZE_SCORING_ADMISSION', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.reopen_production_scoring_admission(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  next_generation uuid := extensions.gen_random_uuid();
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  existing := production_control.lookup_cutover_receipt(
    'REOPEN_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'REOPEN_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid
  for update;
  perform production_control.assert_current_external_scoring_fence(
    (input->>'external_fence_evidence_id')::uuid,
    activation.expected_deployment_commit
  );
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id
       is distinct from (input->>'external_fence_evidence_id')::uuid
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or gate.state <> 'PAUSED'
     or gate.admission_state not in ('CLOSING', 'CLOSED')
     or closure.status not in ('CLOSING', 'CLOSED')
     or closure.authority is distinct from activation.current_authority
     or closure.closure_kind is distinct from 'LEGACY_ADMISSION'
     or closure.authority_generation_id
       is distinct from activation.authority_generation_id
     or closure.admission_generation_id
       is distinct from gate.admission_generation_id
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
     or activation.active_transition_epoch_id is not null
     or exists (
       select 1 from scoring_authority.authority_epochs epoch
       where epoch.tournament_id = '2026' and epoch.status = 'PREPARED'
     )
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.state not in ('GOOGLE_LEASE_ARMED', 'ROLLED_BACK') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_ADMISSION_NOT_REOPENABLE';
  end if;
  update production_control.scoring_admission_closures
  set status = 'REOPENED', reopened_at = pg_catalog.now()
  where closure_id = closure.closure_id;
  update scoring_authority.ingress_gates
  set state = 'OPEN', admission_state = 'OPEN',
      admission_revision = admission_revision + 1,
      admission_generation_id = next_generation,
      admission_opened_at = pg_catalog.now(), active_closure_id = null,
      external_fence_evidence_id = null,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
  returning * into gate;
  update production_control.cutover_activation_state
  set activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_ADMISSION_REOPENED', 'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'closure_id', closure.closure_id,
      'authority', gate.authority,
      'new_admission_generation_id', gate.admission_generation_id,
      'admission_revision', gate.admission_revision
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_ADMISSION_REOPENED',
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'execution_gate', gate.state, 'admission_state', gate.admission_state,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'REOPEN_SCORING_ADMISSION', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.commit_production_authority_epoch(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  rollback_legacy_closure production_control.scoring_admission_closures%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  unresolved_outbox integer;
  unresolved_archive integer;
  boundary_at timestamptz;
  next_admission_generation uuid := extensions.gen_random_uuid();
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  if coalesce(input->>'epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'closure_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'reconciliation_fingerprint', '')
       !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_AUTHORITY_COMMIT_V2_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'COMMIT_AUTHORITY_EPOCH', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = (input->>'epoch_id')::uuid
  for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid
  for update;
  perform production_control.assert_current_external_scoring_fence(
    (input->>'external_fence_evidence_id')::uuid,
    activation.expected_deployment_commit
  );
  select pg_catalog.count(*)::integer into unresolved_outbox
  from scoring_authority.google_outbox_events event
  where event.tournament_id = '2026' and event.status <> 'DELIVERED';
  select pg_catalog.count(*)::integer into unresolved_archive
  from scoring_authority.scorecard_archive_jobs job
  where job.tournament_id = '2026'
    and job.status not in ('VERIFIED', 'SUPERSEDED');

  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or activation.active_transition_epoch_id is distinct from epoch.epoch_id
     or gate.active_epoch_id is distinct from epoch.epoch_id
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id
       is distinct from (input->>'external_fence_evidence_id')::uuid
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit
       is distinct from input->>'deployment_commit'
     or gate.state is distinct from 'PAUSED'
     or gate.admission_state is distinct from 'CLOSED'
     or closure.status is distinct from 'CLOSED'
     or epoch.status is distinct from 'PREPARED'
     or epoch.tournament_id is distinct from '2026'
     or epoch.admission_closure_id is distinct from closure.closure_id
     or epoch.admission_generation_id
       is distinct from gate.admission_generation_id
     or epoch.closed_admission_revision
       is distinct from gate.admission_revision
     or epoch.closure_boundary_fingerprint
       is distinct from closure.lease_set_fingerprint
     or epoch.external_fence_evidence_id
       is distinct from gate.external_fence_evidence_id
     or epoch.deployment_commit
       is distinct from activation.expected_deployment_commit
     or epoch.source_fingerprint
       is distinct from activation.expected_source_fingerprint
     or epoch.reconciliation_fingerprint is distinct from
       pg_catalog.lower(input->>'reconciliation_fingerprint')
     or epoch.supabase_match_revisions is distinct from
       production_control.current_match_revisions('2026')
     or epoch.google_checkpoints is distinct from
       production_control.current_google_checkpoints('2026')
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
     or unresolved_outbox <> 0
     or unresolved_archive <> 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_AUTHORITY_COMMIT_V2_PRECONDITION_FAILED';
  end if;
  if (epoch.epoch_type = 'CUTOVER' and (
       activation.state is distinct from 'CUTOVER_PREPARED'
       or epoch.authority_before is distinct from 'GOOGLE'
       or epoch.authority_after is distinct from 'SUPABASE'
       or gate.authority is distinct from 'GOOGLE'
       or closure.authority is distinct from 'GOOGLE'
       or closure.closure_kind is distinct from 'LEGACY_ADMISSION'
     )) or (epoch.epoch_type = 'ROLLBACK' and (
       activation.state is distinct from 'ROLLBACK_PREPARED'
       or epoch.authority_before is distinct from 'SUPABASE'
       or epoch.authority_after is distinct from 'GOOGLE'
       or gate.authority is distinct from 'SUPABASE'
       or closure.authority is distinct from 'SUPABASE'
       or closure.closure_kind is distinct from 'SUPABASE_INGRESS'
     )) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_AUTHORITY_COMMIT_V2_DIRECTION_INVALID';
  end if;

  boundary_at := pg_catalog.now();
  update scoring_authority.authority_epochs
  set status = 'COMMITTED', committed_at = boundary_at
  where epoch_id = epoch.epoch_id;
  update scoring_authority.tournaments
  set scoring_authority = epoch.authority_after, updated_at = boundary_at
  where tournament_id = '2026';

  if epoch.authority_after = 'SUPABASE' then
    update production_control.scoring_admission_closures
    set status = 'CONSUMED', consumed_at = boundary_at,
        consumed_epoch_id = epoch.epoch_id
    where closure_id = closure.closure_id;
    update scoring_authority.ingress_gates
    set state = 'OPEN', authority = 'SUPABASE',
        active_epoch_id = epoch.epoch_id,
        admission_state = 'CLOSED',
        admission_revision = admission_revision + 1,
        active_closure_id = closure.closure_id,
        external_fence_evidence_id = closure.external_fence_evidence_id,
        unresolved_client_queues = 0,
        updated_by = input->>'actor_id', updated_at = boundary_at
    where tournament_id = '2026'
    returning * into gate;
    update production_control.resource_scope
    set scoring_authority = 'SUPABASE', scoring_ingress_enabled = true,
        updated_at = boundary_at
    where scope_key = 'BAGGER_INV_PRODUCTION';
    update production_control.cutover_activation_state
    set state = 'SCORING_COMMITTED',
        activation_revision = activation_revision + 1,
        current_authority = 'SUPABASE', scoring_ingress_enabled = true,
        authority_generation_id = epoch.epoch_id,
        active_transition_epoch_id = null,
        first_supabase_write_possible_at = boundary_at,
        first_supabase_write_observed_at = null,
        first_supabase_mutation_key = null,
        first_supabase_match_id = null,
        first_supabase_match_revision = null,
        updated_by = input->>'actor_id', updated_at = boundary_at
    where scope_key = 'BAGGER_INV_PRODUCTION'
    returning * into activation;
  else
    insert into production_control.scoring_admission_closures (
      closure_kind, prior_legacy_closure_id,
      tournament_id, authority, authority_generation_id,
      admission_generation_id, deployment_id, status,
      opening_admission_revision, closing_admission_revision,
      closed_admission_revision, lease_high_watermark,
      start_source_fingerprint, final_source_fingerprint,
      reconciliation_fingerprint, lease_set_fingerprint,
      supabase_match_revisions, google_checkpoints,
      external_fence_evidence_id, close_request_fingerprint,
      close_payload_hash, closing_at, closed_at, actor_id
    ) values (
      'LEGACY_ADMISSION', null, '2026', 'GOOGLE', epoch.epoch_id,
      next_admission_generation, input->>'deployment_id', 'CLOSED',
      gate.admission_revision, gate.admission_revision + 1,
      gate.admission_revision + 1, 0,
      epoch.source_fingerprint, epoch.source_fingerprint,
      epoch.reconciliation_fingerprint,
      production_control.scoring_admission_lease_set_fingerprint(
        next_admission_generation
      ),
      epoch.supabase_match_revisions, epoch.google_checkpoints,
      (input->>'external_fence_evidence_id')::uuid,
      pg_catalog.lower(input->>'request_fingerprint'),
      production_control.cutover_payload_hash(input),
      boundary_at, boundary_at, input->>'actor_id'
    ) returning * into rollback_legacy_closure;
    execute 'alter table scoring_authority.matches disable trigger capture_scorecard_archive_transition';
    update production_control.worker_controls
    set enabled = false, google_writes_allowed = false,
        metadata = metadata || pg_catalog.jsonb_build_object(
          'disabled_by_epoch', epoch.epoch_id,
          'disabled_at', boundary_at
        )
    where worker_name in (
      'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'
    );
    update production_control.worker_contracts
    set operation_allowed = false, authoritative_write_allowed = false
    where worker_name in (
      'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'
    );
    update scoring_authority.ingress_gates
    set state = 'PAUSED', authority = 'GOOGLE',
        active_epoch_id = epoch.epoch_id,
        admission_state = 'CLOSED',
        admission_revision = rollback_legacy_closure.closed_admission_revision,
        admission_generation_id = rollback_legacy_closure.admission_generation_id,
        active_closure_id = rollback_legacy_closure.closure_id,
        external_fence_evidence_id = rollback_legacy_closure.external_fence_evidence_id,
        unresolved_client_queues = 0,
        updated_by = input->>'actor_id', updated_at = boundary_at
    where tournament_id = '2026'
    returning * into gate;
    update production_control.resource_scope
    set scoring_authority = 'GOOGLE', scoring_ingress_enabled = false,
        workers_enabled = exists (
          select 1 from production_control.worker_controls value
          where value.enabled
        ),
        google_writes_enabled = exists (
          select 1 from production_control.worker_controls value
          where value.enabled and value.google_writes_allowed
        ),
        updated_at = boundary_at
    where scope_key = 'BAGGER_INV_PRODUCTION';
    update production_control.cutover_activation_state
    set state = 'ROLLED_BACK',
        activation_revision = activation_revision + 1,
        current_authority = 'GOOGLE', scoring_ingress_enabled = false,
        authority_generation_id = epoch.epoch_id,
        active_transition_epoch_id = null,
        updated_by = input->>'actor_id', updated_at = boundary_at
    where scope_key = 'BAGGER_INV_PRODUCTION'
    returning * into activation;
  end if;

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', epoch.epoch_type || '_EPOCH_COMMITTED', input->>'actor_id',
    pg_catalog.jsonb_build_object(
      'epoch_id', epoch.epoch_id,
      'closure_id', closure.closure_id,
      'authority_before', epoch.authority_before,
      'authority_after', epoch.authority_after,
      'first_supabase_canonical_write_possible_at',
        case when epoch.authority_after = 'SUPABASE'
          then boundary_at else null end
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    case when epoch.authority_after = 'SUPABASE'
      then 'FIRST_SUPABASE_CANONICAL_WRITE_POSSIBLE'
      else 'PRODUCTION_SCORING_AUTHORITY_ROLLED_BACK' end,
    'SCORING_AUTHORITY', '2026', input->>'actor_id',
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'epoch_id', epoch.epoch_id,
      'closure_id', closure.closure_id,
      'authority', epoch.authority_after,
      'boundary_at', boundary_at,
      'admission_state', gate.admission_state,
      'scoring_ingress_enabled', activation.scoring_ingress_enabled,
      'workers_enabled', false,
      'google_writes_enabled', false
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_AUTHORITY_EPOCH_V2_COMMITTED',
    'epoch_id', epoch.epoch_id,
    'closure_id', closure.closure_id,
    'authority', epoch.authority_after,
    'ingress', gate.state,
    'admission_state', gate.admission_state,
    'scoring_ingress_enabled', activation.scoring_ingress_enabled,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'first_supabase_canonical_write_possible',
      epoch.authority_after = 'SUPABASE',
    'first_supabase_canonical_write_possible_at',
      case when epoch.authority_after = 'SUPABASE'
        then boundary_at else null end,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'COMMIT_AUTHORITY_EPOCH', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.abort_production_authority_epoch(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  prior_legacy_closure production_control.scoring_admission_closures%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  if coalesce(input->>'epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'closure_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_AUTHORITY_ABORT_V2_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'ABORT_AUTHORITY_EPOCH', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = (input->>'epoch_id')::uuid
  for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid
  for update;
  if epoch.epoch_type = 'ROLLBACK' then
    select * into strict prior_legacy_closure
    from production_control.scoring_admission_closures value
    where value.closure_id = closure.prior_legacy_closure_id
    for update;
  end if;
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or activation.active_transition_epoch_id is distinct from epoch.epoch_id
     or gate.active_epoch_id is distinct from epoch.epoch_id
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id
       is distinct from (input->>'external_fence_evidence_id')::uuid
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit
       is distinct from input->>'deployment_commit'
     or gate.state is distinct from 'PAUSED'
     or gate.admission_state is distinct from 'CLOSED'
     or closure.status is distinct from 'CLOSED'
     or epoch.status is distinct from 'PREPARED'
     or epoch.admission_closure_id is distinct from closure.closure_id
     or epoch.admission_generation_id
       is distinct from gate.admission_generation_id
     or epoch.closed_admission_revision
       is distinct from gate.admission_revision
     or epoch.external_fence_evidence_id
       is distinct from gate.external_fence_evidence_id
     or (epoch.epoch_type = 'CUTOVER' and (
       activation.state is distinct from 'CUTOVER_PREPARED'
       or activation.current_authority is distinct from 'GOOGLE'
       or activation.scoring_ingress_enabled
       or epoch.authority_before is distinct from 'GOOGLE'
     ))
     or (epoch.epoch_type = 'ROLLBACK' and (
       activation.state is distinct from 'ROLLBACK_PREPARED'
       or activation.current_authority is distinct from 'SUPABASE'
       or not activation.scoring_ingress_enabled
       or epoch.authority_before is distinct from 'SUPABASE'
       or closure.closure_kind is distinct from 'SUPABASE_INGRESS'
       or prior_legacy_closure.closure_kind is distinct from 'LEGACY_ADMISSION'
       or prior_legacy_closure.authority is distinct from 'GOOGLE'
     )) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_AUTHORITY_EPOCH_V2_NOT_ABORTABLE';
  end if;

  update scoring_authority.authority_epochs
  set status = 'ABORTED', aborted_at = pg_catalog.now(),
      reason = pg_catalog.left(coalesce(
        nullif(input->>'reason', ''), reason
      ), 500)
  where epoch_id = epoch.epoch_id;

  if epoch.authority_before = 'SUPABASE' then
    update production_control.scoring_admission_closures
    set status = 'REOPENED', reopened_at = pg_catalog.now()
    where closure_id = closure.closure_id;
    update scoring_authority.ingress_gates
    set state = 'OPEN', authority = 'SUPABASE',
        active_epoch_id = epoch.prior_active_epoch_id,
        admission_state = 'CLOSED',
        admission_revision = admission_revision + 1,
        active_closure_id = prior_legacy_closure.closure_id,
        external_fence_evidence_id =
          (input->>'external_fence_evidence_id')::uuid,
        unresolved_client_queues = 0,
        updated_by = input->>'actor_id', updated_at = pg_catalog.now()
    where tournament_id = '2026'
    returning * into gate;
  else
    -- A CUTOVER abort deliberately leaves legacy Google admission CLOSED.
    -- Only the separately audited Google-only reopen RPC may admit it again.
    update scoring_authority.ingress_gates
    set state = 'PAUSED', authority = 'GOOGLE',
        active_epoch_id = epoch.prior_active_epoch_id,
        admission_state = 'CLOSED',
        unresolved_client_queues = 0,
        updated_by = input->>'actor_id', updated_at = pg_catalog.now()
    where tournament_id = '2026'
    returning * into gate;
  end if;
  update production_control.cutover_activation_state
  set state = case when epoch.authority_before = 'GOOGLE'
        then 'GOOGLE_LEASE_ARMED' else 'SCORING_COMMITTED' end,
      activation_revision = activation_revision + 1,
      expected_source_fingerprint = epoch.prior_source_fingerprint,
      active_transition_epoch_id = null,
      updated_by = input->>'actor_id', updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', epoch.epoch_type || '_EPOCH_ABORTED', input->>'actor_id',
    pg_catalog.jsonb_build_object(
      'epoch_id', epoch.epoch_id,
      'closure_id', closure.closure_id,
      'authority', epoch.authority_before,
      'admission_state', gate.admission_state,
      'legacy_google_automatically_reopened', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_AUTHORITY_EPOCH_V2_ABORTED', 'SCORING_AUTHORITY', '2026',
    input->>'actor_id', pg_catalog.lower(input->>'request_fingerprint'),
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'epoch_id', epoch.epoch_id,
      'closure_id', closure.closure_id,
      'authority', epoch.authority_before,
      'execution_gate', gate.state,
      'admission_state', gate.admission_state,
      'legacy_google_automatically_reopened', false
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_AUTHORITY_EPOCH_V2_ABORTED',
    'epoch_id', epoch.epoch_id,
    'closure_id', closure.closure_id,
    'authority', epoch.authority_before,
    'ingress', gate.state,
    'admission_state', gate.admission_state,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'legacy_google_automatically_reopened', false,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'ABORT_AUTHORITY_EPOCH', input, response_value
  );
  return response_value;
end;
$$;

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
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  active_closure production_control.scoring_admission_closures%rowtype;
  legacy_closure production_control.scoring_admission_closures%rowtype;
  required_worker_name text := pg_catalog.upper(
    coalesce(required_worker, '')
  );
  normal_supabase_runtime boolean := false;
  rollback_worker_drain boolean := false;
begin
  -- The transaction-scoped shared lock remains held through the caller RPC.
  -- Close/prepare/commit/reopen use the exclusive counterpart, so no Supabase
  -- canonical mutation can cross an admission boundary after this assertion.
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  select * into strict active_closure
  from production_control.scoring_admission_closures value
  where value.closure_id = gate.active_closure_id;

  if active_closure.closure_kind = 'SUPABASE_INGRESS' then
    select * into strict legacy_closure
    from production_control.scoring_admission_closures value
    where value.closure_id = active_closure.prior_legacy_closure_id;
  else
    legacy_closure := active_closure;
  end if;

  normal_supabase_runtime :=
    gate.state = 'OPEN'
    and active_closure.closure_kind = 'LEGACY_ADMISSION'
    and active_closure.authority = 'GOOGLE'
    and active_closure.status = 'CONSUMED'
    and active_closure.consumed_epoch_id = activation.authority_generation_id
    and active_closure.admission_generation_id = gate.admission_generation_id
    and active_closure.deployment_id = gate.admission_deployment_id
    and active_closure.external_fence_evidence_id = gate.external_fence_evidence_id;

  -- A Supabase mutation that held the shared authority lock may have committed
  -- immediately before rollback acquired the exclusive lock and paused new
  -- ingress. Its durable Google mirror/archive work must remain drainable or
  -- rollback finalization would deadlock on its own unresolved-queue checks.
  -- This exception is intentionally worker-only: every participant/Director
  -- canonical mutation calls this function without required_worker and stays
  -- rejected while the execution gate is PAUSED.
  rollback_worker_drain :=
    required_worker_name in (
      'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'
    )
    and gate.state = 'PAUSED'
    and active_closure.closure_kind = 'SUPABASE_INGRESS'
    and active_closure.authority = 'SUPABASE'
    and active_closure.status = 'CLOSING'
    and active_closure.authority_generation_id =
      activation.authority_generation_id
    and active_closure.admission_generation_id = gate.admission_generation_id
    and active_closure.deployment_id = gate.admission_deployment_id
    and active_closure.external_fence_evidence_id =
      gate.external_fence_evidence_id
    and active_closure.prior_legacy_closure_id = legacy_closure.closure_id
    and legacy_closure.closure_kind = 'LEGACY_ADMISSION'
    and legacy_closure.authority = 'GOOGLE'
    and legacy_closure.status = 'CONSUMED'
    and legacy_closure.consumed_epoch_id = activation.authority_generation_id
    and activation.active_transition_epoch_id is null;

  if activation.state is distinct from 'SCORING_COMMITTED'
     or activation.current_authority is distinct from 'SUPABASE'
     or not activation.scoring_ingress_enabled
     or activation.authority_generation_id is distinct from
       nullif(input->>'expected_epoch_id', '')::uuid
     or resource.scoring_authority is distinct from 'SUPABASE'
     or not resource.scoring_ingress_enabled
     or gate.admission_state is distinct from 'CLOSED'
     or not gate.admission_protocol_enforced
     or gate.active_closure_id is null
     or gate.external_fence_evidence_id is null
     or gate.authority is distinct from 'SUPABASE'
     or gate.active_epoch_id
       is distinct from activation.authority_generation_id
     or not (normal_supabase_runtime or rollback_worker_drain)
     or not exists (
       select 1 from scoring_authority.tournaments value
       where value.tournament_id = '2026'
         and value.scoring_authority = 'SUPABASE'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SUPABASE_SCORING_ADMISSION_V2_REQUIRED';
  end if;

  if required_worker_name <> '' then
    if required_worker_name not in (
         'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'
       )
       or not resource.workers_enabled
       or not resource.google_writes_enabled
       or not exists (
         select 1
         from production_control.worker_controls controls
         join production_control.worker_contracts contracts
           using (worker_name)
         where controls.worker_name = required_worker_name
           and controls.enabled
           and controls.google_writes_allowed
           and contracts.operation_allowed
           and contracts.requires_google_write
           and not contracts.authoritative_write_allowed
           and coalesce(
             controls.metadata->>'activation_epoch_id', ''
           ) = activation.authority_generation_id::text
           and coalesce(
             controls.metadata->>'deployment_commit', ''
           ) = activation.expected_deployment_commit
           and coalesce(
             controls.metadata->>'google_service_account', ''
           ) = activation.expected_google_service_account
       ) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_SCORING_WORKER_NOT_ENABLED';
    end if;
  end if;
  perform pg_catalog.set_config(
    'production_control.scoring_runtime_authority_generation',
    activation.authority_generation_id::text,
    true
  );
  perform pg_catalog.set_config(
    'production_control.scoring_runtime_admission_generation',
    gate.admission_generation_id::text,
    true
  );
end;
$$;

create or replace function public.inspect_production_scoring_admission(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  if gate.active_closure_id is not null then
    select * into strict closure
    from production_control.scoring_admission_closures value
    where value.closure_id = gate.active_closure_id;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contract_version', gate.admission_contract_version,
    'activation_state', activation.state,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'authority', activation.current_authority,
    'scoring_authority', activation.current_authority,
    'scoring_ingress_enabled', activation.scoring_ingress_enabled,
    'execution_gate', gate.state,
    'admission_state', gate.admission_state,
    'admission_protocol_enforced', gate.admission_protocol_enforced,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'admission_deployment_id', gate.admission_deployment_id,
    'deployment_id', gate.admission_deployment_id,
    'active_closure_id', gate.active_closure_id,
    'external_fence_evidence_id', gate.external_fence_evidence_id,
    'active_closure_status', case when gate.active_closure_id is null
      then null else closure.status end,
    'active_closure_high_watermark', case when gate.active_closure_id is null
      then null else closure.lease_high_watermark end,
    'v2_unresolved', production_control.scoring_admission_unresolved_count(
      gate.admission_generation_id
    ),
    'legacy_unclassified',
      production_control.scoring_admission_legacy_blocker_count(
        gate.admission_enforced_at
      ),
    'lease_set_fingerprint',
      production_control.scoring_admission_lease_set_fingerprint(
        gate.admission_generation_id
      ),
    'first_supabase_canonical_write_possible',
      activation.first_supabase_write_possible_at is not null,
    'first_supabase_canonical_write_observed',
      activation.first_supabase_write_observed_at is not null,
    'first_supabase_canonical_write_possible_at',
      activation.first_supabase_write_possible_at,
    'first_supabase_canonical_write_observed_at',
      activation.first_supabase_write_observed_at,
    'external_google_writer_fence_centrally_enforced', false,
    'captured_at', pg_catalog.clock_timestamp()
  );
end;
$$;

-- Preserve the reviewed 033 implementation behind a v2 lock/disarm wrapper.
-- The wrapper prevents the old precommit abort from expiring an ambiguous v2
-- lease or leaving a stale enforced protocol attached to a DORMANT release.
alter function public.abort_production_precommit_release(jsonb)
  rename to abort_production_precommit_release_legacy_v1;

revoke all on function public.abort_production_precommit_release_legacy_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.abort_production_precommit_release(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  gate scoring_authority.ingress_gates%rowtype;
  response_value jsonb;
  was_enforced boolean;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  -- Fixed global order: Odds lock first, admission lock second.
  perform pg_catalog.pg_advisory_xact_lock(731102026031::bigint);
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'ABORT_PRECOMMIT_RELEASE', input
  );
  if existing is not null then return existing; end if;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  was_enforced := gate.admission_protocol_enforced;
  if was_enforced and (
       gate.admission_state is distinct from 'OPEN'
       or gate.active_closure_id is not null
       or gate.external_fence_evidence_id is not null
       or production_control.scoring_admission_unresolved_count(
         gate.admission_generation_id
       ) <> 0
       or production_control.scoring_admission_legacy_blocker_count(
         gate.admission_enforced_at
       ) <> 0
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_PRECOMMIT_ABORT_ADMISSION_V2_UNRESOLVED';
  end if;

  response_value := public.abort_production_precommit_release_legacy_v1(input);
  if was_enforced then
    update scoring_authority.ingress_gates
    set admission_state = 'OPEN',
        admission_revision = admission_revision + 1,
        admission_generation_id = extensions.gen_random_uuid(),
        admission_protocol_enforced = false,
        admission_enforced_at = null,
        admission_opened_at = null,
        admission_deployment_id = null,
        legacy_lease_set_fingerprint = null,
        active_closure_id = null,
        external_fence_evidence_id = null,
        unresolved_client_queues = 0,
        updated_by = input->>'actor_id',
        updated_at = pg_catalog.now()
    where tournament_id = '2026';
  end if;
  return response_value;
end;
$$;

revoke all on table production_control.scoring_external_fence_evidence
  from public, anon, authenticated, service_role;
revoke all on table production_control.scoring_admission_closures
  from public, anon, authenticated, service_role;
grant select on table production_control.scoring_external_fence_evidence
  to service_role;
grant select on table production_control.scoring_admission_closures
  to service_role;
revoke all on sequence production_control.scoring_admission_lease_sequence
  from public, anon, authenticated, service_role;

do $admission_acl$
declare
  signature text;
begin
  foreach signature in array array[
    'production_control.scoring_admission_lock_key()',
    'production_control.scoring_admission_unresolved_count(uuid)',
    'production_control.scoring_admission_legacy_blocker_count(timestamptz)',
    'production_control.scoring_admission_legacy_set_fingerprint()',
    'production_control.scoring_admission_lease_set_fingerprint(uuid)',
    'production_control.assert_current_external_scoring_fence(uuid,text)',
    'production_control.assert_scoring_admission_optimistic_input(jsonb,boolean)',
    'production_control.assert_production_scoring_lease_nonce(scoring_authority.scoring_ingress_leases,text)',
    'production_control.scoring_lease_outcome_evidence_hash(uuid,text,text,text,text,text,text,uuid,uuid,bigint)',
    'production_control.scoring_admission_begin_payload_hash(jsonb)',
    'production_control.scoring_legacy_resolution_evidence_hash(uuid,text,text,text,uuid,text)',
    'public.record_production_scoring_external_fence_evidence(jsonb)',
    'public.refresh_production_scoring_external_fence_evidence(jsonb)',
    'public.arm_production_google_ingress_lease_gate(jsonb)',
    'public.begin_production_scoring_ingress_v2(jsonb)',
    'public.begin_production_scoring_ingress(jsonb)',
    'public.mark_production_scoring_ingress_write_started(jsonb)',
    'public.report_production_scoring_ingress_outcome(jsonb)',
    'public.resolve_production_scoring_ingress_ambiguity(jsonb)',
    'public.resolve_production_legacy_scoring_ingress(jsonb)',
    'public.complete_production_scoring_ingress(jsonb)',
    'public.close_production_scoring_admission(jsonb)',
    'public.drain_production_scoring_admission(jsonb)',
    'public.finalize_production_scoring_admission(jsonb)',
    'public.reopen_production_scoring_admission(jsonb)',
    'public.prepare_production_authority_epoch(jsonb)',
    'public.commit_production_authority_epoch(jsonb)',
    'public.abort_production_authority_epoch(jsonb)',
    'production_control.assert_production_scoring_runtime(jsonb,text)',
    'public.inspect_production_scoring_admission(jsonb)',
    'public.abort_production_precommit_release_legacy_v1(jsonb)',
    'public.abort_production_precommit_release(jsonb)'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
  end loop;
end
$admission_acl$;

grant execute on function public.record_production_scoring_external_fence_evidence(jsonb)
  to service_role;
grant execute on function public.refresh_production_scoring_external_fence_evidence(jsonb)
  to service_role;
grant execute on function public.arm_production_google_ingress_lease_gate(jsonb)
  to service_role;
grant execute on function public.begin_production_scoring_ingress_v2(jsonb)
  to service_role;
grant execute on function public.begin_production_scoring_ingress(jsonb)
  to service_role;
grant execute on function public.mark_production_scoring_ingress_write_started(jsonb)
  to service_role;
grant execute on function public.report_production_scoring_ingress_outcome(jsonb)
  to service_role;
grant execute on function public.resolve_production_scoring_ingress_ambiguity(jsonb)
  to service_role;
grant execute on function public.resolve_production_legacy_scoring_ingress(jsonb)
  to service_role;
grant execute on function public.complete_production_scoring_ingress(jsonb)
  to service_role;
grant execute on function public.close_production_scoring_admission(jsonb)
  to service_role;
grant execute on function public.drain_production_scoring_admission(jsonb)
  to service_role;
grant execute on function public.finalize_production_scoring_admission(jsonb)
  to service_role;
grant execute on function public.reopen_production_scoring_admission(jsonb)
  to service_role;
grant execute on function public.prepare_production_authority_epoch(jsonb)
  to service_role;
grant execute on function public.commit_production_authority_epoch(jsonb)
  to service_role;
grant execute on function public.abort_production_authority_epoch(jsonb)
  to service_role;
grant execute on function public.inspect_production_scoring_admission(jsonb)
  to service_role;
grant execute on function public.abort_production_precommit_release(jsonb)
  to service_role;

alter default privileges in schema production_control
  revoke all on functions from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
