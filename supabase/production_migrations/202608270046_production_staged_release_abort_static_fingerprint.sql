-- Accept the exact certified source fingerprint retained by a completed
-- read rollback to STATIC_BACKEND. Installation is inert: this migration
-- replaces only the staged-release abort predicate and performs no state
-- transition until the service-role RPC is explicitly invoked.
begin;

create or replace function public.abort_production_staged_release(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority,
  participant_identity, production_rehearsal
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  runtime production_control.odds_calculation_runtime%rowtype;
  expected_revision bigint;
  request_fingerprint_value text := coalesce(input->>'request_fingerprint', '');
  deployment_commit_value text := coalesce(input->>'deployment_commit', '');
  source_fingerprint_value text := coalesce(input->>'source_fingerprint', '');
  actor text := left(coalesce(input->>'actor_id', ''), 160);
  response_value jsonb;
begin
  -- The shared assertion proves the service-role JWT and the immutable
  -- Production project/workbook/tournament resource row. A non-staged lookup is
  -- intentional so an already-committed receipt can be replayed safely after
  -- the successful transition has made the activation row DORMANT.
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  existing := production_control.lookup_cutover_receipt(
    'ABORT_STAGED_RELEASE', input
  );
  if existing is not null then return existing; end if;

  if input->>'contract_version'
       is distinct from 'production-cutover-activation-v1'
     or input->>'operation'
       is distinct from 'ABORT_PRODUCTION_STAGED_RELEASE'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'project_ref' is distinct from 'ymqhhtxaywtqllynrmxe'
     or input->>'project_url'
       is distinct from 'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or input->>'source_workbook_id'
       is distinct from '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or input->>'tournament_id' is distinct from '2026'
     or jsonb_typeof(input->'tournament_year') is distinct from 'number'
     or input->>'tournament_year' <> '2026'
     or input->>'vercel_project' is distinct from 'bagger-inv'
     or input->>'vercel_project_id'
       is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or deployment_commit_value !~ '^[0-9a-f]{40}$'
     or source_fingerprint_value !~ '^[0-9a-f]{64}$'
     or input ? 'candidate_hostname'
     or jsonb_typeof(input->'expected_activation_revision')
       is distinct from 'number'
     or input->>'expected_activation_revision' !~ '^[1-9][0-9]*$'
     or request_fingerprint_value !~ '^[0-9a-f]{64}$'
     or actor = '' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_STAGED_RELEASE_ABORT_EXACT_INPUT_REQUIRED';
  end if;
  expected_revision := (input->>'expected_activation_revision')::bigint;

  -- Wait for every enabled Odds RPC transaction to finish, then prevent a new
  -- one from passing its shared scope lock until this abort commits.
  perform pg_catalog.pg_advisory_xact_lock(731102026031::bigint);

  -- Lock the activation boundary before inspecting every dependent control.
  -- All authority-changing RPCs take this row before their dependent state, so
  -- no later phase, epoch, worker, or ingress transition can race this abort.
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict gate
  from scoring_authority.ingress_gates
  where tournament_id = '2026'
  for update;
  select * into strict runtime
  from production_control.odds_calculation_runtime
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;

  -- Runtime disable and this activation-row lock prevent a new rehearsal
  -- request from starting. These table locks also wait for any transaction
  -- that passed its runtime check before disable and make the following
  -- pending-work proof stable until this abort commits.
  lock table scoring_authority.authority_epochs,
    scoring_authority.scoring_ingress_leases,
    scoring_authority.google_outbox_events,
    scoring_authority.scorecard_archive_jobs,
    scoring_authority.odds_calculation_jobs,
    scoring_authority.odds_google_mirror_jobs,
    scoring_authority.guide_sync_runs,
    production_control.import_runs,
    production_control.current_shadow_import_claims,
    participant_identity.production_participant_enrollment_claims,
    production_rehearsal.scoring_runs
  in share mode;

  -- A concurrent identical abort may have completed while this transaction
  -- waited for the activation row. Replay its durable receipt rather than
  -- treating the now-DORMANT state as a conflict.
  existing := production_control.lookup_cutover_receipt(
    'ABORT_STAGED_RELEASE', input
  );
  if existing is not null then return existing; end if;

  if activation.state <> 'STAGED'
     or activation.activation_revision <> expected_revision
     or activation.expected_deployment_commit
       is distinct from deployment_commit_value
     or activation.expected_vercel_project_id
       is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or activation.expected_source_fingerprint
       is distinct from source_fingerprint_value then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_STAGED_RELEASE_ABORT_REVISION_CONFLICT';
  end if;

  -- Read rollback intentionally retains the certified source fingerprint.
  -- Accept only NULL (never activated) or the exact staged fingerprint; any
  -- other value remains unexplained drift and fails closed.
  if activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.read_cutover_phase <> 'STATIC_BACKEND'
     or (
       activation.read_source_fingerprint is not null
       and activation.read_source_fingerprint
         is distinct from activation.expected_source_fingerprint
     )
     or activation.public_reads_activated_at is not null
     or activation.active_transition_epoch_id is not null
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.first_supabase_mutation_key is not null
     or activation.first_supabase_match_id is not null
     or activation.first_supabase_match_revision is not null
     or gate.state <> 'PAUSED'
     or gate.authority <> 'GOOGLE'
     or gate.active_epoch_id is not null
     or gate.unresolved_client_queues <> 0
     or exists (
       select 1 from scoring_authority.authority_epochs epoch
       where epoch.tournament_id = '2026' and epoch.status = 'PREPARED'
     ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_STAGED_RELEASE_ABORT_PRECUTOVER_STATE_REQUIRED';
  end if;

  if resource.current_tournament_read_authority <> 'GOOGLE'
     or resource.scoring_authority <> 'GOOGLE'
     or resource.participant_identity_authority <> 'PASSPORT'
     or resource.public_supabase_reads_enabled
     or resource.scoring_ingress_enabled
     or resource.google_writes_enabled
     or resource.auth_user_creation_enabled
     or resource.workers_enabled
     or resource.odds_publication_enabled
     or exists (
       select 1 from production_control.worker_controls worker
       where worker.enabled or worker.scheduler_installed
         or worker.google_writes_allowed
     )
     or exists (
       select 1 from production_control.worker_contracts contract
       where contract.operation_allowed or contract.scheduler_installed
         or contract.authoritative_write_allowed
     ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_STAGED_RELEASE_ABORT_DORMANT_AUTHORITY_REQUIRED';
  end if;

  if runtime.enabled
     or runtime.operation_mode <> 'DORMANT'
     or runtime.cutover_phase is not null
     or runtime.deployment_commit is not null
     or runtime.activation_revision is not null
     or runtime.candidate_hostname is not null then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_STAGED_RELEASE_ABORT_ODDS_RUNTIME_DORMANT_REQUIRED';
  end if;

  -- Terminal history may remain, but nothing claimable, retryable, publishable,
  -- mirrorable, or awaiting cleanup may survive the staged-release abort.
  if exists (
       select 1 from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026' and lease.status = 'ACTIVE'
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
       select 1 from scoring_authority.odds_calculation_jobs job
       where job.tournament_id = '2026'
         and (job.status in ('PENDING', 'RUNNING', 'RETRYABLE')
           or job.publication_status in ('READY', 'PUBLISHED'))
     )
     or exists (
       select 1 from scoring_authority.odds_google_mirror_jobs job
       where job.tournament_id = '2026' and job.status in ('PENDING', 'RUNNING')
     )
     or exists (
       select 1 from scoring_authority.guide_sync_runs run
       where run.tournament_id = '2026' and run.status = 'CLAIMED'
     )
     or exists (
       select 1 from production_control.import_runs run
       where run.tournament_id = '2026' and run.status in ('PENDING', 'RUNNING')
     )
     or exists (
       select 1 from production_control.current_shadow_import_claims claim
       where claim.tournament_id = '2026' and claim.status = 'PENDING'
     )
     or exists (
       select 1
       from participant_identity.production_participant_enrollment_claims claim
       where claim.tournament_id = '2026'
         and claim.status in ('PENDING', 'CLEANUP_REQUIRED')
     )
     or exists (
       select 1 from production_rehearsal.scoring_runs run
       where run.status in ('PREPARED', 'ACTIVE')
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_STAGED_RELEASE_ABORT_PENDING_WORK';
  end if;

  update production_control.cutover_activation_state
  set state = 'DORMANT',
      activation_revision = activation_revision + 1,
      expected_deployment_commit = null,
      expected_vercel_project_id = null,
      expected_source_fingerprint = null,
      active_transition_epoch_id = null,
      staged_by = null,
      staged_at = null,
      read_cutover_phase = 'STATIC_BACKEND',
      read_source_fingerprint = null,
      public_reads_activated_at = null,
      updated_by = actor,
      updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
    and state = 'STAGED'
    and activation_revision = expected_revision
  returning * into activation;
  if not found or activation.activation_revision <> expected_revision + 1 then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_STAGED_RELEASE_ABORT_REVISION_CONFLICT';
  end if;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_STAGED_RELEASE_ABORTED', 'SCORING_AUTHORITY', '2026',
    actor, request_fingerprint_value, 'SUCCEEDED',
    jsonb_build_object(
      'prior_state', 'STAGED',
      'state', 'DORMANT',
      'prior_activation_revision', expected_revision,
      'activation_revision', activation.activation_revision,
      'deployment_commit', deployment_commit_value,
      'source_fingerprint', source_fingerprint_value,
      'authority', 'GOOGLE',
      'read_cutover_phase', 'STATIC_BACKEND',
      'participant_identity_authority', 'PASSPORT',
      'scoring_ingress_enabled', false,
      'public_supabase_reads_enabled', false,
      'auth_user_creation_enabled', false,
      'workers_enabled', false,
      'odds_publication_enabled', false,
      'google_mirror_enabled', false,
      'google_writes_enabled', false,
      'first_supabase_canonical_write_possible', false,
      'first_supabase_canonical_write_observed', false,
      'active_or_prepared_epochs', 0,
      'pending_operational_work', 0,
      'staged_candidate_fields_cleared', true
    )
  );

  response_value := jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_STAGED_RELEASE_ABORTED',
    'state', 'DORMANT',
    'activation_revision', activation.activation_revision,
    'authority', 'GOOGLE',
    'read_cutover_phase', 'STATIC_BACKEND',
    'participant_identity_authority', 'PASSPORT',
    'scoring_ingress_enabled', false,
    'public_supabase_reads_enabled', false,
    'workers_enabled', false,
    'publication_enabled', false,
    'mirror_enabled', false,
    'google_writes_enabled', false,
    'first_supabase_canonical_write_possible', false,
    'first_supabase_canonical_write_observed', false,
    'staged_candidate_fields_cleared', true,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'ABORT_STAGED_RELEASE', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function public.abort_production_staged_release(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.abort_production_staged_release(jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
