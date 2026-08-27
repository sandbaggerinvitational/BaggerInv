-- Option 2: bounded Production maintenance-window scoring cutover.
--
-- Installation is inert. Existing provider-fence operations retain their
-- exact behavior. MAINTENANCE_WINDOW_V1 is an explicit alternate boundary
-- that pauses the barrier-aware application, drains every admitted writer,
-- binds two stable Google readbacks and exact Supabase parity, commits the
-- authority epoch with Supabase ingress still paused, and requires a separate
-- smoke-certified resume operation before a Supabase write is possible.
begin;

alter table production_control.cutover_activation_state
  add column if not exists boundary_mode text not null
    default 'PROVIDER_FENCE_V2',
  add column if not exists maintenance_state text not null default 'NORMAL',
  add column if not exists maintenance_started_at timestamptz,
  add column if not exists maintenance_ended_at timestamptz;

alter table production_control.cutover_activation_state
  add constraint production_cutover_boundary_mode_check check (
    boundary_mode in ('PROVIDER_FENCE_V2', 'MAINTENANCE_WINDOW_V1')
  ),
  add constraint production_cutover_maintenance_state_check check (
    maintenance_state in ('NORMAL', 'SCORING_MAINTENANCE')
  ),
  add constraint production_cutover_maintenance_shape_check check (
    (maintenance_state = 'SCORING_MAINTENANCE'
      and boundary_mode = 'MAINTENANCE_WINDOW_V1'
      and maintenance_started_at is not null
      and maintenance_ended_at is null)
    or maintenance_state = 'NORMAL'
  );

alter table production_control.scoring_admission_closures
  add column if not exists boundary_mode text not null
    default 'PROVIDER_FENCE_V2',
  add column if not exists first_source_fingerprint text,
  add column if not exists first_source_captured_at timestamptz,
  add column if not exists second_source_captured_at timestamptz,
  add column if not exists supabase_shadow_fingerprint text,
  add column if not exists unexplained_difference_count integer;

alter table production_control.scoring_admission_closures
  alter column external_fence_evidence_id drop not null,
  alter column google_writer_provider_fence_id drop not null,
  alter column google_writer_provider_verification_id drop not null;

alter table production_control.scoring_admission_closures
  add constraint production_scoring_closure_boundary_mode_check check (
    boundary_mode in ('PROVIDER_FENCE_V2', 'MAINTENANCE_WINDOW_V1')
  ),
  add constraint production_scoring_closure_first_source_check check (
    first_source_fingerprint is null
    or first_source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add constraint production_scoring_closure_shadow_check check (
    supabase_shadow_fingerprint is null
    or supabase_shadow_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add constraint production_scoring_closure_difference_count_check check (
    unexplained_difference_count is null
    or unexplained_difference_count >= 0
  ),
  add constraint production_scoring_closure_boundary_evidence_check check (
    (boundary_mode = 'PROVIDER_FENCE_V2'
      and external_fence_evidence_id is not null
      and google_writer_provider_fence_id is not null
      and google_writer_provider_verification_id is not null
      and first_source_fingerprint is null
      and first_source_captured_at is null
      and second_source_captured_at is null
      and supabase_shadow_fingerprint is null
      and unexplained_difference_count is null)
    or
    (boundary_mode = 'MAINTENANCE_WINDOW_V1'
      and external_fence_evidence_id is null
      and google_writer_provider_fence_id is null
      and google_writer_provider_verification_id is null
      and (
        status in ('CLOSING', 'REOPENED')
        or (
          status in ('CLOSED', 'CONSUMED')
          and first_source_fingerprint is not null
          and first_source_captured_at is not null
          and second_source_captured_at is not null
          and second_source_captured_at >= first_source_captured_at
          and final_source_fingerprint = first_source_fingerprint
          and final_source_fingerprint = supabase_shadow_fingerprint
          and unexplained_difference_count = 0
        )
      ))
  );

alter table scoring_authority.ingress_gates
  add column if not exists boundary_mode text not null
    default 'PROVIDER_FENCE_V2';
alter table scoring_authority.ingress_gates
  drop constraint if exists production_scoring_admission_gate_shape_check;
alter table scoring_authority.ingress_gates
  add constraint production_scoring_gate_boundary_mode_check check (
    boundary_mode in ('PROVIDER_FENCE_V2', 'MAINTENANCE_WINDOW_V1')
  ),
  add constraint production_scoring_admission_gate_shape_check check (
    not admission_protocol_enforced
    or (
      (admission_state = 'OPEN'
        and active_closure_id is null
        and external_fence_evidence_id is null
        and google_writer_provider_fence_id is null
        and google_writer_provider_verification_id is null)
      or (admission_state in ('CLOSING', 'CLOSED')
        and active_closure_id is not null
        and (
          (boundary_mode = 'PROVIDER_FENCE_V2'
            and external_fence_evidence_id is not null
            and google_writer_provider_fence_id is not null
            and google_writer_provider_verification_id is not null)
          or (boundary_mode = 'MAINTENANCE_WINDOW_V1'
            and external_fence_evidence_id is null
            and google_writer_provider_fence_id is null
            and google_writer_provider_verification_id is null)
        ))
    )
  );

alter table scoring_authority.authority_epochs
  add column if not exists boundary_mode text not null
    default 'PROVIDER_FENCE_V2',
  add column if not exists supabase_shadow_fingerprint text,
  add column if not exists commit_source_fingerprint text,
  add column if not exists commit_source_verified_at timestamptz;

alter table scoring_authority.authority_epochs
  add constraint production_authority_epoch_boundary_mode_check check (
    boundary_mode in ('PROVIDER_FENCE_V2', 'MAINTENANCE_WINDOW_V1')
  ),
  add constraint production_authority_epoch_shadow_check check (
    supabase_shadow_fingerprint is null
    or supabase_shadow_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add constraint production_authority_epoch_commit_source_check check (
    commit_source_fingerprint is null
    or commit_source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add constraint production_authority_epoch_boundary_evidence_check check (
    boundary_mode = 'PROVIDER_FENCE_V2'
    or (
      boundary_mode = 'MAINTENANCE_WINDOW_V1'
      and external_fence_evidence_id is null
      and google_writer_provider_fence_id is null
      and google_writer_provider_verification_id is null
      and supabase_shadow_fingerprint is not null
    )
  );

create or replace function production_control.assert_no_active_physical_writer_fence()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if exists (
       select 1
       from production_control.google_writer_provider_fences value
       where value.status in (
         'INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED'
       )
     )
     or exists (
       select 1
       from production_control.vercel_writer_critical_waf_epochs value
       where value.status in ('ACTIVE_UNBOUND', 'FENCE_BOUND', 'RESTORE_PENDING')
     )
     or exists (
       select 1
       from production_control.google_writer_fence_rehearsals value
       where value.status = 'RUNNING'
          or (value.status = 'FAILED' and not value.restoration_confirmed)
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_ACTIVE_PHYSICAL_FENCE';
  end if;
end;
$$;

create or replace function production_control.assert_maintenance_cutover_commit_safe(
  input jsonb
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
  closure production_control.scoring_admission_closures%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  commit_captured_at timestamptz;
begin
  perform production_control.assert_maintenance_common_input(input);
  perform production_control.assert_no_active_physical_writer_fence();
  commit_captured_at := (input->>'commit_google_captured_at')::timestamptz;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid;
  select * into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = (input->>'epoch_id')::uuid;
  if coalesce(input->>'commit_google_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or input->>'commit_google_source_fingerprint' is distinct from
       closure.final_source_fingerprint
     or input->>'supabase_shadow_fingerprint' is distinct from
       closure.supabase_shadow_fingerprint
     or commit_captured_at < epoch.created_at
     or commit_captured_at > pg_catalog.now()
     or commit_captured_at < pg_catalog.now() - interval '5 minutes'
     or activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.maintenance_state <> 'SCORING_MAINTENANCE'
     or activation.state <> 'CUTOVER_PREPARED'
     or activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or resource.scoring_authority <> 'GOOGLE'
     or resource.scoring_ingress_enabled or resource.workers_enabled
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.authority <> 'GOOGLE' or gate.state <> 'PAUSED'
     or gate.admission_state <> 'CLOSED'
     or not gate.admission_protocol_enforced
     or gate.unresolved_client_queues <> 0
     or gate.active_epoch_id is distinct from epoch.epoch_id
     or gate.active_closure_id is distinct from closure.closure_id
     or activation.active_transition_epoch_id is distinct from epoch.epoch_id
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.expected_deployment_commit is distinct from
       input->>'deployment_commit'
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.status <> 'CLOSED'
     or closure.final_source_fingerprint is distinct from
       closure.supabase_shadow_fingerprint
     or closure.unexplained_difference_count <> 0
     or epoch.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or epoch.status <> 'PREPARED' or epoch.epoch_type <> 'CUTOVER'
     or epoch.authority_before <> 'GOOGLE'
     or epoch.authority_after <> 'SUPABASE'
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
       select 1 from production_control.worker_controls value
       where value.enabled
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_CUTOVER_COMMIT_NOT_SAFE';
  end if;
end;
$$;

create or replace function public.commit_production_maintenance_authority_epoch(
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
  epoch scoring_authority.authority_epochs%rowtype;
  boundary_at timestamptz;
  response_value jsonb;
begin
  existing := production_control.lookup_cutover_receipt(
    'COMMIT_MAINTENANCE_AUTHORITY_EPOCH', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  perform production_control.assert_maintenance_cutover_commit_safe(input);
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid for update;
  select * into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = (input->>'epoch_id')::uuid for update;
  boundary_at := pg_catalog.now();
  update scoring_authority.authority_epochs
  set status = 'COMMITTED', committed_at = boundary_at,
      commit_source_fingerprint = pg_catalog.lower(
        input->>'commit_google_source_fingerprint'
      ),
      commit_source_verified_at =
        (input->>'commit_google_captured_at')::timestamptz
  where epoch_id = epoch.epoch_id returning * into epoch;
  update scoring_authority.tournaments
  set scoring_authority = 'SUPABASE', updated_at = boundary_at
  where tournament_id = '2026';
  update production_control.scoring_admission_closures
  set status = 'CONSUMED', consumed_at = boundary_at,
      consumed_epoch_id = epoch.epoch_id
  where closure_id = closure.closure_id returning * into closure;
  update scoring_authority.ingress_gates
  set boundary_mode = 'MAINTENANCE_WINDOW_V1',
      state = 'PAUSED', authority = 'SUPABASE',
      active_epoch_id = epoch.epoch_id,
      admission_state = 'CLOSED',
      admission_revision = admission_revision + 1,
      active_closure_id = closure.closure_id,
      external_fence_evidence_id = null,
      google_writer_provider_fence_id = null,
      google_writer_provider_verification_id = null,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = boundary_at
  where tournament_id = '2026' returning * into gate;
  update production_control.resource_scope
  set scoring_authority = 'SUPABASE', scoring_ingress_enabled = false,
      workers_enabled = false, google_writes_enabled = false,
      updated_at = boundary_at
  where scope_key = 'BAGGER_INV_PRODUCTION';
  update production_control.cutover_activation_state
  set state = 'SCORING_COMMITTED',
      activation_revision = activation_revision + 1,
      current_authority = 'SUPABASE', scoring_ingress_enabled = false,
      authority_generation_id = epoch.epoch_id,
      active_transition_epoch_id = null,
      first_supabase_write_possible_at = null,
      first_supabase_write_observed_at = null,
      first_supabase_mutation_key = null,
      first_supabase_match_id = null,
      first_supabase_match_revision = null,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = boundary_at
  where scope_key = 'BAGGER_INV_PRODUCTION' returning * into activation;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_MAINTENANCE_AUTHORITY_COMMITTED_PAUSED',
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'maintenance_cutover_commit_safe', true,
    'epoch_id', epoch.epoch_id, 'closure_id', closure.closure_id,
    'authority', 'SUPABASE', 'ingress', 'PAUSED',
    'admission_state', 'CLOSED',
    'maintenance_state', activation.maintenance_state,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'first_supabase_canonical_write_possible', false,
    'first_supabase_canonical_write_observed', false,
    'idempotent', false
  );
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'MAINTENANCE_CUTOVER_EPOCH_COMMITTED_PAUSED',
    pg_catalog.left(input->>'actor_id', 160), response_value - 'ok'
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_MAINTENANCE_AUTHORITY_COMMITTED_PAUSED',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    response_value - 'ok' - 'idempotent'
  );
  perform production_control.store_cutover_receipt(
    'COMMIT_MAINTENANCE_AUTHORITY_EPOCH', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.resume_production_supabase_scoring(input jsonb)
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
  resumed_at timestamptz;
  response_value jsonb;
begin
  perform production_control.assert_maintenance_common_input(input);
  if coalesce(input->>'runtime_verification_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'configuration_fingerprint', '')
       !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SUPABASE_SCORING_RESUME_EVIDENCE_INVALID';
  end if;
  existing := production_control.lookup_cutover_receipt(
    'RESUME_SUPABASE_SCORING', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select * into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = (input->>'epoch_id')::uuid for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = epoch.admission_closure_id for update;
  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.maintenance_state <> 'SCORING_MAINTENANCE'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or activation.scoring_ingress_enabled
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.expected_deployment_commit is distinct from
       input->>'deployment_commit'
     or activation.authority_generation_id is distinct from epoch.epoch_id
     or (input->>'expected_authority_generation')::uuid is distinct from
       epoch.epoch_id
     or resource.scoring_authority <> 'SUPABASE'
     or resource.scoring_ingress_enabled or resource.workers_enabled
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.authority <> 'SUPABASE' or gate.state <> 'PAUSED'
     or gate.admission_state <> 'CLOSED'
     or gate.active_epoch_id is distinct from epoch.epoch_id
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or not gate.admission_protocol_enforced
     or gate.unresolved_client_queues <> 0
     or epoch.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or epoch.status <> 'COMMITTED' or epoch.epoch_type <> 'CUTOVER'
     or epoch.authority_after <> 'SUPABASE'
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.status <> 'CONSUMED'
     or pg_catalog.lower(input->>'configuration_fingerprint') is distinct from
       activation.staged_environment_delta_fingerprint_v2
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or exists (
       select 1 from production_control.worker_controls value
       where value.enabled
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SUPABASE_SCORING_NOT_RESUMABLE';
  end if;
  resumed_at := pg_catalog.now();
  update scoring_authority.ingress_gates
  set state = 'OPEN', admission_revision = admission_revision + 1,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = resumed_at
  where tournament_id = '2026' returning * into gate;
  update production_control.resource_scope
  set scoring_ingress_enabled = true, updated_at = resumed_at
  where scope_key = 'BAGGER_INV_PRODUCTION';
  update production_control.cutover_activation_state
  set maintenance_state = 'NORMAL', maintenance_ended_at = resumed_at,
      scoring_ingress_enabled = true,
      first_supabase_write_possible_at = resumed_at,
      activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = resumed_at
  where scope_key = 'BAGGER_INV_PRODUCTION' returning * into activation;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SUPABASE_SCORING_RESUMED',
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'maintenance_state', 'NORMAL',
    'epoch_id', epoch.epoch_id, 'authority', 'SUPABASE',
    'ingress', 'OPEN', 'admission_state', 'CLOSED',
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'first_supabase_canonical_write_possible', true,
    'first_supabase_canonical_write_possible_at', resumed_at,
    'first_supabase_canonical_write_observed', false,
    'runtime_verification_fingerprint',
      pg_catalog.lower(input->>'runtime_verification_fingerprint'),
    'configuration_fingerprint',
      pg_catalog.lower(input->>'configuration_fingerprint'),
    'idempotent', false
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'FIRST_SUPABASE_CANONICAL_WRITE_POSSIBLE',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    response_value - 'ok' - 'idempotent'
  );
  perform production_control.store_cutover_receipt(
    'RESUME_SUPABASE_SCORING', input, response_value
  );
  return response_value;
end;
$$;

create or replace function production_control.assert_maintenance_cutover_snapshot_safe(
  input jsonb
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
  closure production_control.scoring_admission_closures%rowtype;
begin
  perform production_control.assert_maintenance_common_input(input);
  perform production_control.assert_no_active_physical_writer_fence();
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid;
  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.maintenance_state <> 'SCORING_MAINTENANCE'
     or activation.state <> 'GOOGLE_LEASE_ARMED'
     or activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or resource.scoring_authority <> 'GOOGLE'
     or resource.scoring_ingress_enabled or resource.workers_enabled
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.authority <> 'GOOGLE' or gate.state <> 'PAUSED'
     or gate.admission_state <> 'CLOSED'
     or not gate.admission_protocol_enforced
     or gate.unresolved_client_queues <> 0
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id is not null
     or gate.google_writer_provider_fence_id is not null
     or gate.google_writer_provider_verification_id is not null
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.status <> 'CLOSED'
     or closure.authority <> 'GOOGLE'
     or closure.closure_kind <> 'LEGACY_ADMISSION'
     or closure.final_source_fingerprint is null
     or closure.final_source_fingerprint is distinct from
       closure.first_source_fingerprint
     or closure.final_source_fingerprint is distinct from
       closure.supabase_shadow_fingerprint
     or closure.unexplained_difference_count <> 0
     or closure.first_source_captured_at is null
     or closure.second_source_captured_at is null
     or closure.second_source_captured_at <
       closure.first_source_captured_at + interval '1 second'
     or closure.second_source_captured_at <
       pg_catalog.now() - interval '5 minutes'
     or closure.authority_generation_id is distinct from
       activation.authority_generation_id
     or closure.admission_generation_id is distinct from
       gate.admission_generation_id
     or closure.closed_admission_revision is distinct from
       gate.admission_revision
     or closure.lease_set_fingerprint is distinct from
       production_control.scoring_admission_lease_set_fingerprint(
         gate.admission_generation_id
       )
     or closure.supabase_match_revisions is distinct from
       production_control.current_match_revisions('2026')
     or closure.google_checkpoints is distinct from
       production_control.current_google_checkpoints('2026')
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
       select 1 from production_control.worker_controls value
       where value.enabled
     )
     or exists (
       select 1 from scoring_authority.authority_epochs value
       where value.tournament_id = '2026' and value.status = 'PREPARED'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_CUTOVER_SNAPSHOT_NOT_SAFE';
  end if;
end;
$$;

create or replace function production_control.assert_maintenance_cutover_prepare_safe(
  input jsonb
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
begin
  perform production_control.assert_maintenance_cutover_snapshot_safe(input);
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid;
  if activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or activation.expected_deployment_commit is distinct from
       input->>'deployment_commit'
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or closure.final_source_fingerprint is distinct from
       pg_catalog.lower(input->>'source_fingerprint')
     or closure.supabase_shadow_fingerprint is distinct from
       pg_catalog.lower(input->>'supabase_shadow_fingerprint')
     or closure.reconciliation_fingerprint is distinct from
       pg_catalog.lower(input->>'reconciliation_fingerprint')
     or closure.lease_set_fingerprint is distinct from
       pg_catalog.lower(input->>'closure_boundary_fingerprint')
     or closure.supabase_match_revisions is distinct from
       input->'supabase_match_revisions'
     or closure.google_checkpoints is distinct from
       input->'google_checkpoints'
     or activation.active_transition_epoch_id is not null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_CUTOVER_PREPARE_NOT_SAFE';
  end if;
end;
$$;

create or replace function public.prepare_production_maintenance_authority_epoch(
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
  epoch scoring_authority.authority_epochs%rowtype;
  response_value jsonb;
begin
  if input->>'epoch_type' is distinct from 'CUTOVER'
     or coalesce(input->>'source_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'supabase_shadow_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'reconciliation_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'closure_boundary_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'supabase_match_revisions')
       is distinct from 'object'
     or pg_catalog.jsonb_typeof(input->'google_checkpoints')
       is distinct from 'object' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_AUTHORITY_PREPARE_INPUT_INVALID';
  end if;
  existing := production_control.lookup_cutover_receipt(
    'PREPARE_MAINTENANCE_AUTHORITY_EPOCH', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  perform production_control.assert_maintenance_cutover_prepare_safe(input);
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid for update;
  insert into scoring_authority.authority_epochs (
    tournament_id, epoch_type, status, authority_before, authority_after,
    reconciliation_fingerprint, google_checkpoints, supabase_match_revisions,
    deployment_commit, actor_id, reason, request_fingerprint,
    source_fingerprint, prepared_activation_revision, prior_active_epoch_id,
    admission_closure_id, admission_generation_id,
    closed_admission_revision, closure_boundary_fingerprint,
    prior_source_fingerprint, external_fence_evidence_id,
    google_writer_provider_fence_id,
    google_writer_provider_verification_id, boundary_mode,
    supabase_shadow_fingerprint
  ) values (
    '2026', 'CUTOVER', 'PREPARED', 'GOOGLE', 'SUPABASE',
    closure.reconciliation_fingerprint, closure.google_checkpoints,
    closure.supabase_match_revisions, activation.expected_deployment_commit,
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.left(coalesce(input->>'reason', ''), 500),
    pg_catalog.lower(input->>'request_fingerprint'),
    closure.final_source_fingerprint, activation.activation_revision,
    gate.active_epoch_id, closure.closure_id,
    gate.admission_generation_id, gate.admission_revision,
    closure.lease_set_fingerprint, activation.expected_source_fingerprint,
    null, null, null, 'MAINTENANCE_WINDOW_V1',
    closure.supabase_shadow_fingerprint
  ) returning * into epoch;
  update scoring_authority.ingress_gates
  set active_epoch_id = epoch.epoch_id, unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' returning * into gate;
  update production_control.cutover_activation_state
  set state = 'CUTOVER_PREPARED',
      activation_revision = activation_revision + 1,
      active_transition_epoch_id = epoch.epoch_id,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION' returning * into activation;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_MAINTENANCE_AUTHORITY_EPOCH_PREPARED',
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'maintenance_cutover_prepare_safe', true,
    'epoch_id', epoch.epoch_id, 'epoch_type', 'CUTOVER',
    'authority', 'GOOGLE', 'authority_after', 'SUPABASE',
    'closure_id', closure.closure_id,
    'ingress', 'PAUSED', 'admission_state', 'CLOSED',
    'activation_revision', activation.activation_revision,
    'admission_revision', gate.admission_revision,
    'first_supabase_canonical_write_possible', false,
    'idempotent', false
  );
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'MAINTENANCE_CUTOVER_EPOCH_PREPARED',
    pg_catalog.left(input->>'actor_id', 160), response_value - 'ok'
  );
  perform production_control.store_cutover_receipt(
    'PREPARE_MAINTENANCE_AUTHORITY_EPOCH', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.drain_production_scoring_maintenance(input jsonb)
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
  transitioned_no_write integer;
  transitioned_ambiguous integer;
  unresolved_count integer;
  legacy_blockers integer;
  lease_fingerprint text;
  response_value jsonb;
begin
  perform production_control.assert_maintenance_common_input(input);
  existing := production_control.lookup_cutover_receipt(
    'DRAIN_SCORING_MAINTENANCE', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid for update;
  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.maintenance_state <> 'SCORING_MAINTENANCE'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or activation.expected_deployment_commit is distinct from
       input->>'deployment_commit'
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.state <> 'PAUSED' or gate.admission_state <> 'CLOSING'
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.closure_kind <> 'LEGACY_ADMISSION'
     or closure.authority <> 'GOOGLE' or closure.status <> 'CLOSING'
     or closure.authority_generation_id is distinct from
       activation.authority_generation_id
     or closure.admission_generation_id is distinct from
       gate.admission_generation_id then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_MAINTENANCE_DRAIN_REVISION_CONFLICT';
  end if;
  perform lease.lease_id
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and (lease.protocol_version = 'LEGACY_V1'
      or lease.admission_generation_id = gate.admission_generation_id)
  order by lease.lease_id for update;
  update scoring_authority.scoring_ingress_leases
  set resolution_state = 'PROVEN_NO_WRITE', status = 'COMPLETED',
      completed_at = pg_catalog.now(),
      outcome_reported_at = pg_catalog.now(),
      resolved_at = pg_catalog.now(), resolved_by = 'DATABASE_EXPIRY_V3',
      last_error_code = 'LEASE_EXPIRED_BEFORE_PROVIDER_DISPATCH'
  where tournament_id = '2026'
    and protocol_version = 'ADMISSION_V2'
    and admission_generation_id = gate.admission_generation_id
    and resolution_state = 'ADMITTED'
    and provider_credential_class = 'LEGACY_PROVIDER_FENCEABLE'
    and write_started_at is null
    and expires_at <= pg_catalog.now();
  get diagnostics transitioned_no_write = row_count;
  update scoring_authority.scoring_ingress_leases
  set resolution_state = 'AMBIGUOUS', status = 'ACTIVE',
      completed_at = null, outcome_reported_at = pg_catalog.now(),
      last_error_code = case when resolution_state = 'ADMITTED'
        then 'LEASE_EXPIRED_WITHOUT_V3_DISPATCH_PROOF'
        else 'LEASE_EXPIRED_AFTER_WRITE_START' end
  where tournament_id = '2026'
    and protocol_version = 'ADMISSION_V2'
    and admission_generation_id = gate.admission_generation_id
    and resolution_state in ('ADMITTED', 'WRITE_STARTED')
    and expires_at <= pg_catalog.now();
  get diagnostics transitioned_ambiguous = row_count;
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  );
  legacy_blockers := production_control.scoring_admission_legacy_blocker_count(
    gate.admission_enforced_at
  );
  lease_fingerprint :=
    production_control.scoring_admission_lease_set_fingerprint(
      gate.admission_generation_id
    );
  update scoring_authority.ingress_gates
  set admission_revision = admission_revision + 1,
      unresolved_client_queues = unresolved_count + legacy_blockers,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' returning * into gate;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_MAINTENANCE_DRAIN_INSPECTED',
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'admission_revision', gate.admission_revision,
    'expired_proven_no_write', transitioned_no_write,
    'expired_became_ambiguous', transitioned_ambiguous,
    'v2_unresolved', unresolved_count,
    'legacy_unclassified', legacy_blockers,
    'active_or_unresolved_leases', unresolved_count + legacy_blockers,
    'lease_set_fingerprint', lease_fingerprint,
    'ready_to_finalize', unresolved_count + legacy_blockers = 0,
    'idempotent', false
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_SCORING_MAINTENANCE_DRAIN_INSPECTED',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'),
    case when unresolved_count + legacy_blockers = 0
      then 'SUCCEEDED' else 'BLOCKED' end,
    response_value - 'ok' - 'idempotent'
  );
  perform production_control.store_cutover_receipt(
    'DRAIN_SCORING_MAINTENANCE', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.finalize_production_scoring_maintenance_snapshot(
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
  first_captured_at timestamptz;
  second_captured_at timestamptz;
  current_revisions jsonb;
  current_checkpoints jsonb;
  current_lease_fingerprint text;
  unresolved_count integer;
  legacy_blockers integer;
  unresolved_outbox integer;
  unresolved_archive integer;
  response_value jsonb;
begin
  perform production_control.assert_maintenance_common_input(input);
  perform production_control.assert_no_active_physical_writer_fence();
  if coalesce(input->>'first_google_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or input->>'second_google_source_fingerprint' is distinct from
       input->>'first_google_source_fingerprint'
     or input->>'final_source_fingerprint' is distinct from
       input->>'second_google_source_fingerprint'
     or input->>'supabase_shadow_fingerprint' is distinct from
       input->>'final_source_fingerprint'
     or coalesce(input->>'reconciliation_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'lease_set_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'unexplained_difference_count', '') !~ '^[0-9]+$'
     or (input->>'unexplained_difference_count')::integer <> 0
     or pg_catalog.jsonb_typeof(input->'supabase_match_revisions')
       is distinct from 'object'
     or pg_catalog.jsonb_typeof(input->'google_checkpoints')
       is distinct from 'object' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_SNAPSHOT_EVIDENCE_INVALID';
  end if;
  first_captured_at := (input->>'first_google_captured_at')::timestamptz;
  second_captured_at := (input->>'second_google_captured_at')::timestamptz;
  existing := production_control.lookup_cutover_receipt(
    'FINALIZE_SCORING_MAINTENANCE_SNAPSHOT', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid for update;
  perform lease.lease_id
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and (lease.protocol_version = 'LEGACY_V1'
      or lease.admission_generation_id = gate.admission_generation_id)
  order by lease.lease_id for update;
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  );
  legacy_blockers := production_control.scoring_admission_legacy_blocker_count(
    gate.admission_enforced_at
  );
  current_lease_fingerprint :=
    production_control.scoring_admission_lease_set_fingerprint(
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
  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.maintenance_state <> 'SCORING_MAINTENANCE'
     or activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.first_supabase_mutation_key is not null
     or activation.first_supabase_match_id is not null
     or activation.first_supabase_match_revision is not null
     or activation.state <> 'GOOGLE_LEASE_ARMED'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.authority <> 'GOOGLE' or gate.state <> 'PAUSED'
     or gate.admission_state <> 'CLOSING'
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id is not null
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from
       input->>'deployment_commit'
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.status <> 'CLOSING'
     or first_captured_at < closure.closing_at
     or second_captured_at < first_captured_at + interval '1 second'
     or second_captured_at > pg_catalog.now()
     or second_captured_at < pg_catalog.now() - interval '5 minutes'
     or unresolved_count <> 0 or legacy_blockers <> 0
     or unresolved_outbox <> 0 or unresolved_archive <> 0
     or current_lease_fingerprint is distinct from
       pg_catalog.lower(input->>'lease_set_fingerprint')
     or current_revisions is distinct from input->'supabase_match_revisions'
     or current_checkpoints is distinct from input->'google_checkpoints'
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026'
         and lease.protocol_version = 'ADMISSION_V2'
         and lease.admission_generation_id = gate.admission_generation_id
         and lease.admission_sequence > closure.lease_high_watermark
     )
     or exists (
       select 1 from scoring_authority.authority_epochs value
       where value.tournament_id = '2026' and value.status = 'PREPARED'
     )
     or exists (
       select 1
       from scoring_authority.matches match_value
       left join scoring_authority.google_match_checkpoints checkpoint
         using (match_id)
       where match_value.tournament_id = '2026'
         and checkpoint.match_id is null
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_SNAPSHOT_NOT_SAFE';
  end if;
  update production_control.scoring_admission_closures
  set status = 'CLOSED',
      closed_admission_revision = gate.admission_revision + 1,
      first_source_fingerprint = pg_catalog.lower(
        input->>'first_google_source_fingerprint'
      ),
      first_source_captured_at = first_captured_at,
      second_source_captured_at = second_captured_at,
      final_source_fingerprint = pg_catalog.lower(
        input->>'final_source_fingerprint'
      ),
      supabase_shadow_fingerprint = pg_catalog.lower(
        input->>'supabase_shadow_fingerprint'
      ),
      unexplained_difference_count = 0,
      reconciliation_fingerprint = pg_catalog.lower(
        input->>'reconciliation_fingerprint'
      ),
      lease_set_fingerprint = current_lease_fingerprint,
      supabase_match_revisions = current_revisions,
      google_checkpoints = current_checkpoints,
      closed_at = pg_catalog.now()
  where closure_id = closure.closure_id returning * into closure;
  update scoring_authority.ingress_gates
  set admission_state = 'CLOSED',
      admission_revision = closure.closed_admission_revision,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' returning * into gate;
  update production_control.cutover_activation_state
  set activation_revision = activation_revision + 1,
      expected_source_fingerprint = closure.final_source_fingerprint,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION' returning * into activation;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_MAINTENANCE_CUTOVER_SNAPSHOT_SAFE',
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'maintenance_cutover_snapshot_safe', true,
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'admission_revision', gate.admission_revision,
    'final_source_fingerprint', closure.final_source_fingerprint,
    'supabase_shadow_fingerprint', closure.supabase_shadow_fingerprint,
    'reconciliation_fingerprint', closure.reconciliation_fingerprint,
    'lease_set_fingerprint', closure.lease_set_fingerprint,
    'active_or_unresolved_leases', 0,
    'unexplained_difference_count', 0,
    'idempotent', false
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_MAINTENANCE_CUTOVER_SNAPSHOT_SAFE',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    response_value - 'ok' - 'idempotent'
  );
  perform production_control.store_cutover_receipt(
    'FINALIZE_SCORING_MAINTENANCE_SNAPSHOT', input, response_value
  );
  return response_value;
end;
$$;

create or replace function production_control.assert_maintenance_common_input(
  input jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'boundary_mode' is distinct from 'MAINTENANCE_WINDOW_V1'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = '' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_EXACT_INPUT_REQUIRED';
  end if;
end;
$$;

-- Provider mode continues through the exact v4 implementation. Maintenance
-- mode calls the pre-Step11.6 base stage, then binds the same provenance plus
-- the explicit boundary mode in the same transaction.
alter function public.stage_production_cutover_release(jsonb)
  rename to stage_production_cutover_release_provider_fence_v2;
revoke all on function
  public.stage_production_cutover_release_provider_fence_v2(jsonb)
  from public, anon, authenticated, service_role;

create or replace function production_control.stage_production_maintenance_release(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
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
  perform production_control.assert_no_active_physical_writer_fence();
  if input->>'boundary_mode' is distinct from 'MAINTENANCE_WINDOW_V1'
     or stage_request_fingerprint !~ '^[0-9a-f]{64}$'
     or certification_fingerprint !~ '^[0-9a-f]{64}$'
     or environment_fingerprint !~ '^[0-9a-f]{64}$'
     or nullif(input->>'provider_fence_id', '') is not null
     or nullif(input->>'provider_fence_verification_id', '') is not null
     or nullif(input->>'quiesce_evidence_id', '') is not null then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_STAGE_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  if activation.staged_request_fingerprint is not null
     and activation.state <> 'ROLLED_BACK'
     and (
       activation.staged_request_fingerprint is distinct from
         stage_request_fingerprint
       or activation.staged_payload_hash is distinct from stage_payload_hash
       or activation.staged_certification_fingerprint is distinct from
         certification_fingerprint
       or activation.staged_environment_delta_fingerprint_v2 is distinct from
         environment_fingerprint
       or activation.boundary_mode is distinct from 'MAINTENANCE_WINDOW_V1'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_STAGE_PROVENANCE_IMMUTABLE';
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
    and expected_deployment_commit = pg_catalog.lower(
      input->>'deployment_commit'
    );
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_STAGE_BINDING_FAILED';
  end if;
  return response_value || pg_catalog.jsonb_build_object(
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'maintenance_state', 'NORMAL',
    'stage_request_fingerprint', stage_request_fingerprint,
    'stage_payload_hash', stage_payload_hash,
    'certification_fingerprint', certification_fingerprint,
    'environment_delta_fingerprint_v2', environment_fingerprint
  );
end;
$$;

create or replace function public.stage_production_cutover_release(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if input->>'boundary_mode' = 'MAINTENANCE_WINDOW_V1' then
    return production_control.stage_production_maintenance_release(input);
  end if;
  return public.stage_production_cutover_release_provider_fence_v2(input);
end;
$$;

create or replace function public.begin_production_scoring_maintenance(input jsonb)
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
  high_watermark bigint;
  unresolved_count integer;
  response_value jsonb;
begin
  perform production_control.assert_maintenance_common_input(input);
  perform production_control.assert_no_active_physical_writer_fence();
  if coalesce(input->>'start_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_START_FINGERPRINT_REQUIRED';
  end if;
  existing := production_control.lookup_cutover_receipt(
    'BEGIN_SCORING_MAINTENANCE', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.maintenance_state <> 'NORMAL'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or activation.state <> 'GOOGLE_LEASE_ARMED'
     or activation.read_cutover_phase <> 'CURRENT_READS'
     or activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.first_supabase_mutation_key is not null
     or activation.first_supabase_match_id is not null
     or activation.first_supabase_match_revision is not null
     or resource.scoring_authority <> 'GOOGLE'
     or resource.scoring_ingress_enabled
     or resource.workers_enabled
     or gate.authority <> 'GOOGLE'
     or gate.state <> 'OPEN'
     or gate.admission_state <> 'OPEN'
     or not gate.admission_protocol_enforced
     or gate.active_closure_id is not null
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from
       input->>'deployment_commit'
     or exists (
       select 1 from production_control.worker_controls value
       where value.enabled
     )
     or exists (
       select 1 from scoring_authority.authority_epochs value
       where value.tournament_id = '2026' and value.status = 'PREPARED'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_NOT_ENTERABLE';
  end if;
  select coalesce(pg_catalog.max(lease.admission_sequence), 0)
  into high_watermark
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.protocol_version = 'ADMISSION_V2'
    and lease.admission_generation_id = gate.admission_generation_id;
  insert into production_control.scoring_admission_closures (
    boundary_mode, closure_kind, prior_legacy_closure_id,
    tournament_id, authority, authority_generation_id,
    admission_generation_id, deployment_id,
    opening_admission_revision, closing_admission_revision,
    lease_high_watermark, start_source_fingerprint,
    external_fence_evidence_id, google_writer_provider_fence_id,
    google_writer_provider_verification_id, close_request_fingerprint,
    close_payload_hash, actor_id
  ) values (
    'MAINTENANCE_WINDOW_V1', 'LEGACY_ADMISSION', null,
    '2026', 'GOOGLE', activation.authority_generation_id,
    gate.admission_generation_id, gate.admission_deployment_id,
    gate.admission_revision, gate.admission_revision + 1,
    high_watermark, pg_catalog.lower(input->>'start_source_fingerprint'),
    null, null, null, pg_catalog.lower(input->>'request_fingerprint'),
    production_control.cutover_payload_hash(input),
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into closure;
  update scoring_authority.scoring_ingress_leases
  set close_fence_id = closure.closure_id
  where tournament_id = '2026'
    and protocol_version = 'ADMISSION_V2'
    and admission_generation_id = gate.admission_generation_id
    and resolution_state in (
      'ADMITTED', 'WRITE_STARTED', 'AMBIGUOUS', 'PARTIAL_WRITE'
    );
  unresolved_count :=
    production_control.scoring_admission_unresolved_count(
      gate.admission_generation_id
    ) + production_control.scoring_admission_legacy_blocker_count(
      gate.admission_enforced_at
    );
  update scoring_authority.ingress_gates
  set boundary_mode = 'MAINTENANCE_WINDOW_V1',
      state = 'PAUSED', admission_state = 'CLOSING',
      admission_revision = closure.closing_admission_revision,
      active_closure_id = closure.closure_id,
      external_fence_evidence_id = null,
      google_writer_provider_fence_id = null,
      google_writer_provider_verification_id = null,
      unresolved_client_queues = unresolved_count,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' returning * into gate;
  update production_control.cutover_activation_state
  set maintenance_state = 'SCORING_MAINTENANCE',
      maintenance_started_at = pg_catalog.now(), maintenance_ended_at = null,
      activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION' returning * into activation;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_SCORING_MAINTENANCE_ENTERED', 'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'boundary_mode', 'MAINTENANCE_WINDOW_V1',
      'closure_id', closure.closure_id,
      'lease_high_watermark', high_watermark,
      'active_or_unresolved_leases', unresolved_count,
      'canonical_authority', 'GOOGLE',
      'supabase_ingress_enabled', false
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_MAINTENANCE_ENTERED',
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'maintenance_state', activation.maintenance_state,
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'execution_gate', gate.state, 'admission_state', gate.admission_state,
    'active_or_unresolved_leases', unresolved_count,
    'first_supabase_canonical_write_possible', false,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'BEGIN_SCORING_MAINTENANCE', input, response_value
  );
  return response_value;
end;
$$;

create or replace function production_control.assert_maintenance_google_reopen_safe(
  input jsonb
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
begin
  perform production_control.assert_maintenance_common_input(input);
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  if activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or resource.scoring_authority <> 'GOOGLE'
     or resource.scoring_ingress_enabled
     or gate.authority <> 'GOOGLE' or gate.state <> 'PAUSED'
     or activation.active_transition_epoch_id is not null
     or exists (
       select 1 from scoring_authority.authority_epochs value
       where value.tournament_id = '2026' and value.status = 'PREPARED'
     )
     or activation.first_supabase_write_observed_at is not null
        and coalesce(input->>'reconciliation_complete', 'false') <> 'true'
     or coalesce((input->>'lost_write_count')::integer, 0) <> 0
     or coalesce((input->>'duplicate_write_count')::integer, 0) <> 0
     or coalesce((input->>'unresolved_write_count')::integer, 0) <> 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_GOOGLE_REOPEN_NOT_SAFE';
  end if;
end;
$$;

create or replace function public.abort_production_maintenance_authority_epoch(
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
  epoch scoring_authority.authority_epochs%rowtype;
  next_generation uuid := extensions.gen_random_uuid();
  verified_at timestamptz;
  response_value jsonb;
begin
  perform production_control.assert_maintenance_common_input(input);
  if coalesce(input->>'epoch_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or coalesce(input->>'google_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_ABORT_INPUT_INVALID';
  end if;
  verified_at := (input->>'google_source_captured_at')::timestamptz;
  existing := production_control.lookup_cutover_receipt(
    'ABORT_MAINTENANCE_AUTHORITY_EPOCH', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select * into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = (input->>'epoch_id')::uuid for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = epoch.admission_closure_id for update;
  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.maintenance_state <> 'SCORING_MAINTENANCE'
     or activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.state <> 'CUTOVER_PREPARED'
     or activation.active_transition_epoch_id is distinct from epoch.epoch_id
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.state <> 'PAUSED' or gate.admission_state <> 'CLOSED'
     or gate.active_epoch_id is distinct from epoch.epoch_id
     or gate.active_closure_id is distinct from closure.closure_id
     or epoch.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or epoch.status <> 'PREPARED' or epoch.epoch_type <> 'CUTOVER'
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.status <> 'CLOSED'
     or pg_catalog.lower(input->>'google_source_fingerprint')
       is distinct from closure.final_source_fingerprint
     or verified_at < epoch.created_at or verified_at > pg_catalog.now()
     or verified_at < pg_catalog.now() - interval '5 minutes' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_ABORT_NOT_SAFE';
  end if;
  update scoring_authority.authority_epochs
  set status = 'ABORTED', aborted_at = pg_catalog.now(),
      reason = pg_catalog.left(coalesce(input->>'reason', reason), 500)
  where epoch_id = epoch.epoch_id;
  update production_control.scoring_admission_closures
  set status = 'REOPENED', reopened_at = pg_catalog.now()
  where closure_id = closure.closure_id;
  update scoring_authority.ingress_gates
  set boundary_mode = 'MAINTENANCE_WINDOW_V1',
      state = 'OPEN', authority = 'GOOGLE', active_epoch_id = null,
      admission_state = 'OPEN', admission_revision = admission_revision + 1,
      admission_generation_id = next_generation,
      admission_opened_at = pg_catalog.now(), active_closure_id = null,
      external_fence_evidence_id = null,
      google_writer_provider_fence_id = null,
      google_writer_provider_verification_id = null,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' returning * into gate;
  update production_control.cutover_activation_state
  set state = 'GOOGLE_LEASE_ARMED', maintenance_state = 'NORMAL',
      maintenance_ended_at = pg_catalog.now(),
      activation_revision = activation_revision + 1,
      active_transition_epoch_id = null,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION' returning * into activation;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_MAINTENANCE_AUTHORITY_EPOCH_ABORTED',
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'epoch_id', epoch.epoch_id, 'closure_id', closure.closure_id,
    'authority', 'GOOGLE', 'ingress', 'OPEN',
    'admission_state', 'OPEN', 'maintenance_state', 'NORMAL',
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'first_supabase_canonical_write_possible', false,
    'first_supabase_canonical_write_observed', false,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'ABORT_MAINTENANCE_AUTHORITY_EPOCH', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.begin_production_supabase_rollback_maintenance(
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
  prior_closure production_control.scoring_admission_closures%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  high_watermark bigint;
  response_value jsonb;
begin
  perform production_control.assert_maintenance_common_input(input);
  existing := production_control.lookup_cutover_receipt(
    'BEGIN_SUPABASE_ROLLBACK_MAINTENANCE', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select * into strict prior_closure
  from production_control.scoring_admission_closures value
  where value.closure_id = gate.active_closure_id for update;
  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.authority <> 'SUPABASE'
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.state not in ('OPEN', 'PAUSED')
     or gate.admission_state <> 'CLOSED'
     or prior_closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or prior_closure.closure_kind <> 'LEGACY_ADMISSION'
     or prior_closure.status <> 'CONSUMED'
     or exists (
       select 1 from scoring_authority.authority_epochs value
       where value.tournament_id = '2026' and value.status = 'PREPARED'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SUPABASE_ROLLBACK_MAINTENANCE_NOT_ENTERABLE';
  end if;
  select coalesce(pg_catalog.max(lease.admission_sequence), 0)
  into high_watermark
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.admission_generation_id = gate.admission_generation_id;
  insert into production_control.scoring_admission_closures (
    boundary_mode, closure_kind, prior_legacy_closure_id,
    tournament_id, authority, authority_generation_id,
    admission_generation_id, deployment_id,
    opening_admission_revision, closing_admission_revision,
    lease_high_watermark, start_source_fingerprint,
    external_fence_evidence_id, google_writer_provider_fence_id,
    google_writer_provider_verification_id, close_request_fingerprint,
    close_payload_hash, actor_id
  ) values (
    'MAINTENANCE_WINDOW_V1', 'SUPABASE_INGRESS', prior_closure.closure_id,
    '2026', 'SUPABASE', activation.authority_generation_id,
    gate.admission_generation_id, gate.admission_deployment_id,
    gate.admission_revision, gate.admission_revision + 1,
    high_watermark, activation.expected_source_fingerprint,
    null, null, null, pg_catalog.lower(input->>'request_fingerprint'),
    production_control.cutover_payload_hash(input),
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into closure;
  update scoring_authority.ingress_gates
  set boundary_mode = 'MAINTENANCE_WINDOW_V1', state = 'PAUSED',
      admission_state = 'CLOSING',
      admission_revision = closure.closing_admission_revision,
      active_closure_id = closure.closure_id,
      external_fence_evidence_id = null,
      google_writer_provider_fence_id = null,
      google_writer_provider_verification_id = null,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' returning * into gate;
  update production_control.resource_scope
  set scoring_ingress_enabled = false, updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION';
  update production_control.cutover_activation_state
  set maintenance_state = 'SCORING_MAINTENANCE',
      maintenance_started_at = case when maintenance_state = 'NORMAL'
        then pg_catalog.now() else maintenance_started_at end,
      maintenance_ended_at = null, scoring_ingress_enabled = false,
      activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION' returning * into activation;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_SUPABASE_ROLLBACK_MAINTENANCE_ENTERED',
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'maintenance_state', 'SCORING_MAINTENANCE',
    'closure_id', closure.closure_id,
    'prior_legacy_closure_id', prior_closure.closure_id,
    'authority', 'SUPABASE', 'ingress', 'PAUSED',
    'admission_state', 'CLOSING',
    'activation_revision', activation.activation_revision,
    'admission_revision', gate.admission_revision,
    'first_supabase_canonical_write_possible',
      activation.first_supabase_write_possible_at is not null,
    'first_supabase_canonical_write_observed',
      activation.first_supabase_write_observed_at is not null,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'BEGIN_SUPABASE_ROLLBACK_MAINTENANCE', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.finalize_production_maintenance_rollback_snapshot(
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
  first_captured_at timestamptz;
  second_captured_at timestamptz;
  response_value jsonb;
begin
  perform production_control.assert_maintenance_common_input(input);
  if coalesce(input->>'supabase_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or input->>'google_reconciled_fingerprint' is distinct from
       input->>'supabase_source_fingerprint'
     or coalesce(input->>'reconciliation_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce((input->>'lost_write_count')::integer, -1) <> 0
     or coalesce((input->>'duplicate_write_count')::integer, -1) <> 0
     or coalesce((input->>'unresolved_write_count')::integer, -1) <> 0
     or pg_catalog.jsonb_typeof(input->'supabase_match_revisions')
       is distinct from 'object'
     or pg_catalog.jsonb_typeof(input->'google_checkpoints')
       is distinct from 'object' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_ROLLBACK_SNAPSHOT_INPUT_INVALID';
  end if;
  first_captured_at := (input->>'supabase_source_captured_at')::timestamptz;
  second_captured_at := (input->>'google_reconciled_captured_at')::timestamptz;
  existing := production_control.lookup_cutover_receipt(
    'FINALIZE_MAINTENANCE_ROLLBACK_SNAPSHOT', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid for update;
  if activation.current_authority <> 'SUPABASE'
     or activation.scoring_ingress_enabled
     or activation.maintenance_state <> 'SCORING_MAINTENANCE'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or gate.state <> 'PAUSED' or gate.admission_state <> 'CLOSING'
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.closure_kind <> 'SUPABASE_INGRESS'
     or closure.status <> 'CLOSING'
     or first_captured_at < closure.closing_at
     or second_captured_at < first_captured_at
     or second_captured_at > pg_catalog.now()
     or second_captured_at < pg_catalog.now() - interval '5 minutes'
     or (activation.first_supabase_write_observed_at is not null
       and input->>'reconciliation_complete' is distinct from 'true')
     or gate.unresolved_client_queues <> 0
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or exists (
       select 1 from scoring_authority.google_outbox_events event
       where event.tournament_id = '2026' and event.status <> 'DELIVERED'
     )
     or exists (
       select 1 from scoring_authority.scorecard_archive_jobs job
       where job.tournament_id = '2026'
         and job.status not in ('VERIFIED', 'SUPERSEDED')
     )
     or input->'supabase_match_revisions' is distinct from
       production_control.current_match_revisions('2026')
     or input->'google_checkpoints' is distinct from
       production_control.current_google_checkpoints('2026') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_ROLLBACK_SNAPSHOT_NOT_SAFE';
  end if;
  update production_control.scoring_admission_closures
  set status = 'CLOSED',
      closed_admission_revision = gate.admission_revision + 1,
      first_source_fingerprint = pg_catalog.lower(
        input->>'supabase_source_fingerprint'
      ),
      first_source_captured_at = first_captured_at,
      second_source_captured_at = second_captured_at,
      final_source_fingerprint = pg_catalog.lower(
        input->>'google_reconciled_fingerprint'
      ),
      supabase_shadow_fingerprint = pg_catalog.lower(
        input->>'supabase_source_fingerprint'
      ),
      unexplained_difference_count = 0,
      reconciliation_fingerprint = pg_catalog.lower(
        input->>'reconciliation_fingerprint'
      ),
      lease_set_fingerprint =
        production_control.scoring_admission_lease_set_fingerprint(
          gate.admission_generation_id
        ),
      supabase_match_revisions = input->'supabase_match_revisions',
      google_checkpoints = input->'google_checkpoints',
      closed_at = pg_catalog.now()
  where closure_id = closure.closure_id returning * into closure;
  update scoring_authority.ingress_gates
  set admission_state = 'CLOSED',
      admission_revision = closure.closed_admission_revision,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' returning * into gate;
  update production_control.cutover_activation_state
  set expected_source_fingerprint = closure.final_source_fingerprint,
      activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION' returning * into activation;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_MAINTENANCE_ROLLBACK_SNAPSHOT_SAFE',
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'admission_revision', gate.admission_revision,
    'source_fingerprint', closure.final_source_fingerprint,
    'reconciliation_fingerprint', closure.reconciliation_fingerprint,
    'first_supabase_canonical_write_observed',
      activation.first_supabase_write_observed_at is not null,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'FINALIZE_MAINTENANCE_ROLLBACK_SNAPSHOT', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.rollback_production_maintenance_authority_epoch(
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
  legacy_closure production_control.scoring_admission_closures%rowtype;
  prior_epoch scoring_authority.authority_epochs%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  next_generation uuid := extensions.gen_random_uuid();
  boundary_at timestamptz;
  response_value jsonb;
begin
  perform production_control.assert_maintenance_common_input(input);
  if coalesce(input->>'reconciliation_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce((input->>'lost_write_count')::integer, -1) <> 0
     or coalesce((input->>'duplicate_write_count')::integer, -1) <> 0
     or coalesce((input->>'unresolved_write_count')::integer, -1) <> 0 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_MAINTENANCE_ROLLBACK_INPUT_INVALID';
  end if;
  existing := production_control.lookup_cutover_receipt(
    'ROLLBACK_MAINTENANCE_AUTHORITY_EPOCH', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid for update;
  select * into strict prior_epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = gate.active_epoch_id for update;
  if activation.current_authority <> 'SUPABASE'
     or activation.scoring_ingress_enabled
     or activation.maintenance_state <> 'SCORING_MAINTENANCE'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.authority <> 'SUPABASE' or gate.state <> 'PAUSED'
     or gate.admission_state <> 'CLOSED'
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.active_closure_id is distinct from closure.closure_id
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.closure_kind <> 'SUPABASE_INGRESS'
     or closure.authority <> 'SUPABASE' or closure.status <> 'CLOSED'
     or closure.final_source_fingerprint is distinct from
       closure.supabase_shadow_fingerprint
     or closure.reconciliation_fingerprint is distinct from
       pg_catalog.lower(input->>'reconciliation_fingerprint')
     or prior_epoch.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or prior_epoch.status <> 'COMMITTED'
     or prior_epoch.authority_after <> 'SUPABASE'
     or (activation.first_supabase_write_observed_at is not null
       and input->>'reconciliation_complete' is distinct from 'true')
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or exists (
       select 1 from scoring_authority.google_outbox_events event
       where event.tournament_id = '2026' and event.status <> 'DELIVERED'
     )
     or exists (
       select 1 from scoring_authority.scorecard_archive_jobs job
       where job.tournament_id = '2026'
         and job.status not in ('VERIFIED', 'SUPERSEDED')
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_ROLLBACK_NOT_SAFE';
  end if;
  boundary_at := pg_catalog.now();
  insert into scoring_authority.authority_epochs (
    tournament_id, epoch_type, status, authority_before, authority_after,
    reconciliation_fingerprint, google_checkpoints, supabase_match_revisions,
    deployment_commit, actor_id, reason, request_fingerprint,
    source_fingerprint, prepared_activation_revision, prior_active_epoch_id,
    admission_closure_id, admission_generation_id,
    closed_admission_revision, closure_boundary_fingerprint,
    prior_source_fingerprint, external_fence_evidence_id,
    google_writer_provider_fence_id,
    google_writer_provider_verification_id, boundary_mode,
    supabase_shadow_fingerprint, commit_source_fingerprint,
    commit_source_verified_at, committed_at
  ) values (
    '2026', 'ROLLBACK', 'COMMITTED', 'SUPABASE', 'GOOGLE',
    closure.reconciliation_fingerprint, closure.google_checkpoints,
    closure.supabase_match_revisions, activation.expected_deployment_commit,
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.left(coalesce(input->>'reason', ''), 500),
    pg_catalog.lower(input->>'request_fingerprint'),
    closure.final_source_fingerprint, activation.activation_revision,
    prior_epoch.epoch_id, closure.closure_id,
    gate.admission_generation_id, gate.admission_revision,
    closure.lease_set_fingerprint, prior_epoch.source_fingerprint,
    null, null, null, 'MAINTENANCE_WINDOW_V1',
    closure.supabase_shadow_fingerprint, closure.final_source_fingerprint,
    boundary_at, boundary_at
  ) returning * into epoch;
  update production_control.scoring_admission_closures
  set status = 'CONSUMED', consumed_at = boundary_at,
      consumed_epoch_id = epoch.epoch_id
  where closure_id = closure.closure_id;
  insert into production_control.scoring_admission_closures (
    boundary_mode, closure_kind, prior_legacy_closure_id,
    tournament_id, authority, authority_generation_id,
    admission_generation_id, deployment_id, status,
    opening_admission_revision, closing_admission_revision,
    closed_admission_revision, lease_high_watermark,
    start_source_fingerprint, first_source_fingerprint,
    first_source_captured_at, second_source_captured_at,
    final_source_fingerprint, supabase_shadow_fingerprint,
    unexplained_difference_count, reconciliation_fingerprint,
    lease_set_fingerprint, supabase_match_revisions, google_checkpoints,
    external_fence_evidence_id, google_writer_provider_fence_id,
    google_writer_provider_verification_id, close_request_fingerprint,
    close_payload_hash, closing_at, closed_at, actor_id
  ) values (
    'MAINTENANCE_WINDOW_V1', 'LEGACY_ADMISSION', null,
    '2026', 'GOOGLE', epoch.epoch_id, next_generation,
    gate.admission_deployment_id, 'CLOSED',
    gate.admission_revision, gate.admission_revision + 1,
    gate.admission_revision + 1, 0,
    closure.final_source_fingerprint, closure.final_source_fingerprint,
    boundary_at, boundary_at, closure.final_source_fingerprint,
    closure.final_source_fingerprint, 0,
    closure.reconciliation_fingerprint,
    production_control.scoring_admission_lease_set_fingerprint(
      next_generation
    ), closure.supabase_match_revisions, closure.google_checkpoints,
    null, null, null,
    pg_catalog.encode(extensions.digest(
      (pg_catalog.lower(input->>'request_fingerprint') || ':google-closed')::text,
      'sha256'
    ), 'hex'),
    production_control.cutover_payload_hash(input), boundary_at, boundary_at,
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into legacy_closure;
  update scoring_authority.tournaments
  set scoring_authority = 'GOOGLE', updated_at = boundary_at
  where tournament_id = '2026';
  update scoring_authority.ingress_gates
  set boundary_mode = 'MAINTENANCE_WINDOW_V1', state = 'PAUSED',
      authority = 'GOOGLE', active_epoch_id = epoch.epoch_id,
      admission_state = 'CLOSED',
      admission_revision = legacy_closure.closed_admission_revision,
      admission_generation_id = next_generation,
      active_closure_id = legacy_closure.closure_id,
      external_fence_evidence_id = null,
      google_writer_provider_fence_id = null,
      google_writer_provider_verification_id = null,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = boundary_at
  where tournament_id = '2026' returning * into gate;
  update production_control.resource_scope
  set scoring_authority = 'GOOGLE', scoring_ingress_enabled = false,
      workers_enabled = false, google_writes_enabled = false,
      updated_at = boundary_at
  where scope_key = 'BAGGER_INV_PRODUCTION';
  update production_control.cutover_activation_state
  set state = 'ROLLED_BACK', activation_revision = activation_revision + 1,
      current_authority = 'GOOGLE', scoring_ingress_enabled = false,
      authority_generation_id = epoch.epoch_id,
      active_transition_epoch_id = null,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = boundary_at
  where scope_key = 'BAGGER_INV_PRODUCTION' returning * into activation;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_MAINTENANCE_AUTHORITY_ROLLED_BACK_PAUSED',
    'epoch_id', epoch.epoch_id,
    'closure_id', legacy_closure.closure_id,
    'authority', 'GOOGLE', 'ingress', 'PAUSED',
    'admission_state', 'CLOSED',
    'maintenance_state', 'SCORING_MAINTENANCE',
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'first_supabase_canonical_write_observed',
      activation.first_supabase_write_observed_at is not null,
    'reconciliation_required',
      activation.first_supabase_write_observed_at is not null,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'ROLLBACK_MAINTENANCE_AUTHORITY_EPOCH', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.resume_production_google_scoring_after_maintenance_rollback(
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
  next_generation uuid := extensions.gen_random_uuid();
  captured_at timestamptz;
  response_value jsonb;
begin
  perform production_control.assert_maintenance_common_input(input);
  captured_at := (input->>'google_source_captured_at')::timestamptz;
  existing := production_control.lookup_cutover_receipt(
    'RESUME_GOOGLE_AFTER_MAINTENANCE_ROLLBACK', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  perform production_control.assert_maintenance_google_reopen_safe(input);
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = gate.active_closure_id for update;
  if activation.state <> 'ROLLED_BACK'
     or activation.maintenance_state <> 'SCORING_MAINTENANCE'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.admission_state <> 'CLOSED'
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.closure_kind <> 'LEGACY_ADMISSION'
     or closure.status <> 'CLOSED'
     or coalesce(input->>'google_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.lower(input->>'google_source_fingerprint') is distinct from
       closure.final_source_fingerprint
     or captured_at < closure.closed_at or captured_at > pg_catalog.now()
     or captured_at < pg_catalog.now() - interval '5 minutes' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_GOOGLE_NOT_RESUMABLE';
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
      google_writer_provider_fence_id = null,
      google_writer_provider_verification_id = null,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026' returning * into gate;
  update production_control.cutover_activation_state
  set state = 'GOOGLE_LEASE_ARMED', maintenance_state = 'NORMAL',
      maintenance_ended_at = pg_catalog.now(),
      activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION' returning * into activation;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_GOOGLE_SCORING_RESUMED_AFTER_ROLLBACK',
    'authority', 'GOOGLE', 'ingress', 'OPEN',
    'admission_state', 'OPEN', 'maintenance_state', 'NORMAL',
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'first_supabase_canonical_write_observed',
      activation.first_supabase_write_observed_at is not null,
    'reconciliation_complete',
      activation.first_supabase_write_observed_at is null
      or input->>'reconciliation_complete' = 'true',
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'RESUME_GOOGLE_AFTER_MAINTENANCE_ROLLBACK', input, response_value
  );
  return response_value;
end;
$$;

-- Dispatch the established public authority names by explicit boundary mode.
-- Any missing or unknown mode continues to the unchanged provider-fence v2
-- functions, which retain every Step 11.6 provider predicate.
alter function public.prepare_production_authority_epoch(jsonb)
  rename to prepare_production_authority_epoch_provider_fence_v2;
alter function public.commit_production_authority_epoch(jsonb)
  rename to commit_production_authority_epoch_provider_fence_v2;
alter function public.abort_production_authority_epoch(jsonb)
  rename to abort_production_authority_epoch_provider_fence_v2;
revoke all on function
  public.prepare_production_authority_epoch_provider_fence_v2(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.commit_production_authority_epoch_provider_fence_v2(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.abort_production_authority_epoch_provider_fence_v2(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.prepare_production_authority_epoch(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if input->>'boundary_mode' = 'MAINTENANCE_WINDOW_V1' then
    return public.prepare_production_maintenance_authority_epoch(input);
  end if;
  return public.prepare_production_authority_epoch_provider_fence_v2(input);
end;
$$;

create or replace function public.commit_production_authority_epoch(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if input->>'boundary_mode' = 'MAINTENANCE_WINDOW_V1' then
    return public.commit_production_maintenance_authority_epoch(input);
  end if;
  return public.commit_production_authority_epoch_provider_fence_v2(input);
end;
$$;

create or replace function public.abort_production_authority_epoch(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if input->>'boundary_mode' = 'MAINTENANCE_WINDOW_V1' then
    return public.abort_production_maintenance_authority_epoch(input);
  end if;
  return public.abort_production_authority_epoch_provider_fence_v2(input);
end;
$$;

alter function production_control.assert_production_scoring_runtime(jsonb, text)
  rename to assert_production_scoring_runtime_provider_fence_v2;
revoke all on function
  production_control.assert_production_scoring_runtime_provider_fence_v2(
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
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  active_closure production_control.scoring_admission_closures%rowtype;
  legacy_closure production_control.scoring_admission_closures%rowtype;
  required_worker_name text := pg_catalog.upper(
    coalesce(required_worker, '')
  );
  normal_runtime boolean := false;
  rollback_worker_drain boolean := false;
begin
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1' then
    perform production_control.assert_production_scoring_runtime_provider_fence_v2(
      input, required_worker
    );
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  perform production_control.assert_exact_cutover_resource_scope(input, true);
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
  normal_runtime :=
    activation.maintenance_state = 'NORMAL'
    and activation.scoring_ingress_enabled
    and resource.scoring_ingress_enabled
    and gate.state = 'OPEN'
    and active_closure.boundary_mode = 'MAINTENANCE_WINDOW_V1'
    and active_closure.closure_kind = 'LEGACY_ADMISSION'
    and active_closure.authority = 'GOOGLE'
    and active_closure.status = 'CONSUMED'
    and active_closure.consumed_epoch_id = activation.authority_generation_id;
  rollback_worker_drain :=
    required_worker_name in (
      'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'
    )
    and activation.maintenance_state = 'SCORING_MAINTENANCE'
    and not activation.scoring_ingress_enabled
    and not resource.scoring_ingress_enabled
    and gate.state = 'PAUSED'
    and active_closure.boundary_mode = 'MAINTENANCE_WINDOW_V1'
    and active_closure.closure_kind = 'SUPABASE_INGRESS'
    and active_closure.authority = 'SUPABASE'
    and active_closure.status in ('CLOSING', 'CLOSED')
    and active_closure.prior_legacy_closure_id = legacy_closure.closure_id
    and legacy_closure.boundary_mode = 'MAINTENANCE_WINDOW_V1'
    and legacy_closure.closure_kind = 'LEGACY_ADMISSION'
    and legacy_closure.status = 'CONSUMED';
  if activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or activation.authority_generation_id is distinct from
       nullif(input->>'expected_epoch_id', '')::uuid
     or resource.scoring_authority <> 'SUPABASE'
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.authority <> 'SUPABASE'
     or gate.admission_state <> 'CLOSED'
     or not gate.admission_protocol_enforced
     or gate.active_epoch_id is distinct from
       activation.authority_generation_id
     or not (normal_runtime or rollback_worker_drain)
     or not exists (
       select 1 from scoring_authority.tournaments value
       where value.tournament_id = '2026'
         and value.scoring_authority = 'SUPABASE'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SUPABASE_SCORING_MAINTENANCE_BOUNDARY_REQUIRED';
  end if;
  if required_worker_name <> '' and (
       required_worker_name not in (
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
           and controls.enabled and controls.google_writes_allowed
           and contracts.operation_allowed
           and contracts.requires_google_write
           and not contracts.authoritative_write_allowed
           and coalesce(
             controls.metadata->>'activation_epoch_id', ''
           ) = activation.authority_generation_id::text
           and coalesce(
             controls.metadata->>'deployment_commit', ''
           ) = activation.expected_deployment_commit
       )
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_WORKER_NOT_ENABLED';
  end if;
  perform pg_catalog.set_config(
    'production_control.scoring_runtime_authority_generation',
    activation.authority_generation_id::text, true
  );
  perform pg_catalog.set_config(
    'production_control.scoring_runtime_admission_generation',
    gate.admission_generation_id::text, true
  );
end;
$$;

alter function public.inspect_production_scoring_admission(jsonb)
  rename to inspect_production_scoring_admission_pre_maintenance_window;
revoke all on function
  public.inspect_production_scoring_admission_pre_maintenance_window(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.inspect_production_scoring_admission(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  base jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
begin
  base := public.inspect_production_scoring_admission_pre_maintenance_window(
    input
  );
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
  return base || pg_catalog.jsonb_build_object(
    'boundary_mode', activation.boundary_mode,
    'maintenance_state', activation.maintenance_state,
    'maintenance_started_at', activation.maintenance_started_at,
    'maintenance_ended_at', activation.maintenance_ended_at,
    'active_closure_boundary_mode', case
      when gate.active_closure_id is null then null
      else closure.boundary_mode end,
    'maintenance_cutover_snapshot_safe',
      activation.boundary_mode = 'MAINTENANCE_WINDOW_V1'
      and activation.maintenance_state = 'SCORING_MAINTENANCE'
      and activation.current_authority = 'GOOGLE'
      and gate.boundary_mode = 'MAINTENANCE_WINDOW_V1'
      and gate.state = 'PAUSED' and gate.admission_state = 'CLOSED'
      and gate.unresolved_client_queues = 0
      and gate.active_closure_id is not null
      and closure.status = 'CLOSED'
      and closure.final_source_fingerprint =
        closure.supabase_shadow_fingerprint
      and closure.unexplained_difference_count = 0,
    'supabase_authority_committed_ingress_paused',
      activation.boundary_mode = 'MAINTENANCE_WINDOW_V1'
      and activation.current_authority = 'SUPABASE'
      and not activation.scoring_ingress_enabled,
    'first_supabase_canonical_write_possible',
      activation.first_supabase_write_possible_at is not null,
    'first_supabase_canonical_write_observed',
      activation.first_supabase_write_observed_at is not null
  );
end;
$$;

revoke all on function public.stage_production_cutover_release(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.prepare_production_authority_epoch(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.commit_production_authority_epoch(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.abort_production_authority_epoch(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.inspect_production_scoring_admission(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.stage_production_cutover_release(jsonb)
  to service_role;
grant execute on function public.prepare_production_authority_epoch(jsonb)
  to service_role;
grant execute on function public.commit_production_authority_epoch(jsonb)
  to service_role;
grant execute on function public.abort_production_authority_epoch(jsonb)
  to service_role;
grant execute on function public.inspect_production_scoring_admission(jsonb)
  to service_role;

do $$
declare
  function_name text;
begin
  foreach function_name in array array[
    'public.begin_production_scoring_maintenance(jsonb)',
    'public.drain_production_scoring_maintenance(jsonb)',
    'public.finalize_production_scoring_maintenance_snapshot(jsonb)',
    'public.prepare_production_maintenance_authority_epoch(jsonb)',
    'public.commit_production_maintenance_authority_epoch(jsonb)',
    'public.resume_production_supabase_scoring(jsonb)',
    'public.abort_production_maintenance_authority_epoch(jsonb)',
    'public.begin_production_supabase_rollback_maintenance(jsonb)',
    'public.finalize_production_maintenance_rollback_snapshot(jsonb)',
    'public.rollback_production_maintenance_authority_epoch(jsonb)',
    'public.resume_production_google_scoring_after_maintenance_rollback(jsonb)'
  ] loop
    execute 'revoke all on function ' || function_name ||
      ' from public, anon, authenticated, service_role';
    execute 'grant execute on function ' || function_name ||
      ' to service_role';
  end loop;
end;
$$;

revoke all on function
  production_control.assert_no_active_physical_writer_fence()
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_maintenance_common_input(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_maintenance_cutover_snapshot_safe(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_maintenance_cutover_prepare_safe(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_maintenance_cutover_commit_safe(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_maintenance_google_reopen_safe(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.stage_production_maintenance_release(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_production_scoring_runtime(jsonb, text)
  from public, anon, authenticated, service_role;

comment on function public.begin_production_scoring_maintenance(jsonb) is
  'Atomically pauses new barrier-aware Google canonical scoring admissions for MAINTENANCE_WINDOW_V1 while retaining Google authority and tracking admitted writers to deterministic resolution.';
comment on function public.commit_production_maintenance_authority_epoch(jsonb)
  is 'Atomically commits Supabase canonical scoring authority while leaving ingress paused and first-write-possible false until explicit runtime-certified resume.';
comment on function public.resume_production_supabase_scoring(jsonb) is
  'Opens Supabase scoring only after exact committed epoch, staged configuration, runtime evidence, paused ingress, zero unresolved work, and disabled workers are reverified.';

commit;
