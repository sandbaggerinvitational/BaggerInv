-- Restore Google-authoritative scoring admission when a maintenance window is
-- aborted before any Supabase authority epoch has been prepared. Installation
-- is inert: this migration only adds the narrowly scoped service-role RPC.
begin;

create or replace function public.abort_production_scoring_maintenance_preprepare(
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
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  next_generation uuid := extensions.gen_random_uuid();
  aborted_at timestamptz;
  response_value jsonb;
begin
  perform production_control.assert_maintenance_common_input(input);
  existing := production_control.lookup_cutover_receipt(
    'ABORT_SCORING_MAINTENANCE_PREPREPARE', input
  );
  if existing is not null then return existing; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  perform production_control.assert_no_active_physical_writer_fence();

  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;

  if gate.active_closure_id is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_PREPREPARE_ABORT_NOT_SAFE';
  end if;

  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = gate.active_closure_id for update;

  perform lease.lease_id
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and (
      lease.protocol_version = 'LEGACY_V1'
      or lease.admission_generation_id = gate.admission_generation_id
    )
  order by lease.lease_id for update;

  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.maintenance_state <> 'SCORING_MAINTENANCE'
     or activation.state <> 'GOOGLE_LEASE_ARMED'
     or activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.first_supabase_mutation_key is not null
     or activation.first_supabase_match_id is not null
     or activation.first_supabase_match_revision is not null
     or activation.active_transition_epoch_id is not null
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or activation.expected_deployment_commit is distinct from
       input->>'deployment_commit'
     or resource.scoring_authority <> 'GOOGLE'
     or resource.scoring_ingress_enabled
     or resource.workers_enabled
     or resource.google_writes_enabled
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.authority <> 'GOOGLE'
     or gate.state <> 'PAUSED'
     or gate.admission_state not in ('CLOSING', 'CLOSED')
     or not gate.admission_protocol_enforced
     or gate.active_epoch_id is not null
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or gate.unresolved_client_queues <> 0
     or gate.external_fence_evidence_id is not null
     or gate.google_writer_provider_fence_id is not null
     or gate.google_writer_provider_verification_id is not null
     or closure.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or closure.closure_kind <> 'LEGACY_ADMISSION'
     or closure.prior_legacy_closure_id is not null
     or closure.authority <> 'GOOGLE'
     or closure.status is distinct from gate.admission_state
     or closure.authority_generation_id is distinct from
       activation.authority_generation_id
     or closure.admission_generation_id is distinct from
       gate.admission_generation_id
     or closure.deployment_id is distinct from gate.admission_deployment_id
     or closure.opening_admission_revision >= gate.admission_revision
     or closure.closing_admission_revision > gate.admission_revision
     or (
       closure.status = 'CLOSED'
       and closure.closed_admission_revision is distinct from
         gate.admission_revision
     )
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
     or exists (
       select 1
       from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026'
         and lease.protocol_version = 'ADMISSION_V2'
         and lease.admission_generation_id = gate.admission_generation_id
         and lease.admission_sequence > closure.lease_high_watermark
     )
     or exists (
       select 1
       from scoring_authority.authority_epochs epoch
       where epoch.tournament_id = '2026' and epoch.status = 'PREPARED'
     )
     or exists (
       select 1
       from scoring_authority.google_outbox_events event
       where event.tournament_id = '2026' and event.status <> 'DELIVERED'
     )
     or exists (
       select 1
       from scoring_authority.scorecard_archive_jobs job
       where job.tournament_id = '2026'
         and job.status not in ('VERIFIED', 'SUPERSEDED')
     )
     or exists (
       select 1
       from production_control.worker_controls controls
       where controls.enabled
     )
     or not exists (
       select 1
       from scoring_authority.tournaments tournament
       where tournament.tournament_id = '2026'
         and tournament.scoring_authority = 'GOOGLE'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_PREPREPARE_ABORT_NOT_SAFE';
  end if;

  aborted_at := pg_catalog.now();

  update production_control.scoring_admission_closures
  set status = 'REOPENED', reopened_at = aborted_at
  where closure_id = closure.closure_id;

  update scoring_authority.ingress_gates
  set boundary_mode = 'MAINTENANCE_WINDOW_V1',
      state = 'OPEN', authority = 'GOOGLE', active_epoch_id = null,
      admission_state = 'OPEN',
      admission_revision = admission_revision + 1,
      admission_generation_id = next_generation,
      admission_opened_at = aborted_at, active_closure_id = null,
      external_fence_evidence_id = null,
      google_writer_provider_fence_id = null,
      google_writer_provider_verification_id = null,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = aborted_at
  where tournament_id = '2026' returning * into gate;

  update production_control.cutover_activation_state
  set state = 'GOOGLE_LEASE_ARMED', maintenance_state = 'NORMAL',
      maintenance_ended_at = aborted_at,
      activation_revision = activation_revision + 1,
      active_transition_epoch_id = null,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = aborted_at
  where scope_key = 'BAGGER_INV_PRODUCTION' returning * into activation;

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_SCORING_MAINTENANCE_PREPREPARE_ABORTED',
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'closure_id', closure.closure_id,
    'activation_state', activation.state,
    'authority', activation.current_authority,
    'maintenance_state', activation.maintenance_state,
    'execution_gate', gate.state,
    'admission_state', gate.admission_state,
    'scoring_ingress_enabled', activation.scoring_ingress_enabled,
    'workers_enabled', resource.workers_enabled,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'first_supabase_canonical_write_possible', false,
    'first_supabase_canonical_write_observed', false,
    'idempotent', false
  );

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_SCORING_MAINTENANCE_PREPREPARE_ABORTED',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    response_value - 'ok' - 'idempotent'
  );

  perform production_control.store_cutover_receipt(
    'ABORT_SCORING_MAINTENANCE_PREPREPARE', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  public.abort_production_scoring_maintenance_preprepare(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.abort_production_scoring_maintenance_preprepare(jsonb)
  to service_role;

comment on function
  public.abort_production_scoring_maintenance_preprepare(jsonb) is
  'Reopens Google scoring admission only for a quiescent MAINTENANCE_WINDOW_V1 closure before any Supabase authority epoch is prepared or committed.';

commit;
