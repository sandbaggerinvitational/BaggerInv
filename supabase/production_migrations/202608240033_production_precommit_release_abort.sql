-- Abort an exact Production release before a Supabase scoring epoch commits.
--
-- Applying this migration is inert. The service-role-only RPC closes the
-- Google lease gate and clears a frozen candidate only after all read and
-- identity changes have been rolled back, all in-flight leases have drained,
-- every worker/runtime is dormant, and no first-Supabase-write boundary has
-- ever been crossed. It covers both STAGED and GOOGLE_LEASE_ARMED so neither
-- precommit state can strand an obsolete release SHA.
begin;

create or replace function public.abort_production_precommit_release(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority,
  participant_identity, production_rehearsal
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  runtime production_control.odds_calculation_runtime%rowtype;
  prior_state text;
  expected_revision bigint;
  expected_generation uuid;
  active_lease_count integer;
  expired_lease_count integer;
  expired_shadow_claim_count integer;
  request_fingerprint_value text := lower(coalesce(input->>'request_fingerprint', ''));
  deployment_commit_value text := lower(coalesce(input->>'deployment_commit', ''));
  source_fingerprint_value text := lower(coalesce(input->>'source_fingerprint', ''));
  actor text := left(coalesce(input->>'actor_id', ''), 160);
  response_value jsonb;
begin
  -- A non-staged assertion is intentional: an identical retry must be able to
  -- replay its durable receipt after the first transaction reached DORMANT.
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  existing := production_control.lookup_cutover_receipt(
    'ABORT_PRECOMMIT_RELEASE', input
  );
  if existing is not null then return existing; end if;

  if input->>'contract_version'
       is distinct from 'production-cutover-activation-v1'
     or input->>'operation'
       is distinct from 'ABORT_PRODUCTION_PRECOMMIT_RELEASE'
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
     or coalesce(input->>'expected_epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or request_fingerprint_value !~ '^[0-9a-f]{64}$'
     or actor = '' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_PRECOMMIT_ABORT_EXACT_INPUT_REQUIRED';
  end if;
  expected_revision := (input->>'expected_activation_revision')::bigint;
  expected_generation := (input->>'expected_epoch_id')::uuid;

  -- Enabled Odds operations hold the shared counterpart. Taking the exclusive
  -- lock waits for an in-flight operation and prevents a new one from passing
  -- its scope assertion while this release is cleared.
  perform pg_catalog.pg_advisory_xact_lock(731102026031::bigint);

  -- Authority/scoring operations take the activation row before their mutable
  -- dependants. Once held, no read, identity, lease-begin, or epoch transition
  -- can race the proof below. resource_scope is intentionally an MVCC read:
  -- the Odds runtime transition takes resource -> activation, so taking both
  -- rows here in the reverse order would create a lock-order inversion. A
  -- runtime transition that already holds resource must still obtain this
  -- activation row and will fail its optimistic revision after this commit.
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict runtime
  from production_control.odds_calculation_runtime
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;

  -- A concurrent identical abort may have completed while this transaction
  -- waited. Replay its receipt instead of treating DORMANT as a conflict.
  existing := production_control.lookup_cutover_receipt(
    'ABORT_PRECOMMIT_RELEASE', input
  );
  if existing is not null then return existing; end if;

  if activation.state not in ('STAGED', 'GOOGLE_LEASE_ARMED')
     or activation.activation_revision <> expected_revision
     or activation.authority_generation_id <> expected_generation
     or activation.expected_deployment_commit
       is distinct from deployment_commit_value
     or activation.expected_vercel_project_id
       is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or activation.expected_source_fingerprint
       is distinct from source_fingerprint_value then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_PRECOMMIT_ABORT_REVISION_CONFLICT';
  end if;
  prior_state := activation.state;

  -- Read rollback intentionally retains the certified source fingerprint.
  -- Accept only NULL (never activated) or the exact staged fingerprint; any
  -- other value is unexplained drift.
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
     or exists (
       select 1 from scoring_authority.authority_epochs epoch
       where epoch.tournament_id = '2026' and epoch.status = 'PREPARED'
     ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PRECOMMIT_ABORT_PREWRITE_STATE_REQUIRED';
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
      message = 'PRODUCTION_PRECOMMIT_ABORT_DORMANT_AUTHORITY_REQUIRED';
  end if;

  if runtime.enabled
     or runtime.operation_mode <> 'DORMANT'
     or runtime.cutover_phase is not null
     or runtime.deployment_commit is not null
     or runtime.activation_revision is not null
     or runtime.candidate_hostname is not null then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PRECOMMIT_ABORT_ODDS_RUNTIME_DORMANT_REQUIRED';
  end if;

  -- complete_production_scoring_ingress takes lease -> gate. Lock every ACTIVE
  -- lease before taking the gate row so an already-running completion can
  -- finish and no gate/lease inversion is possible. New lease creation is
  -- already blocked by the activation row above.
  perform lease.lease_id
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026' and lease.status = 'ACTIVE'
  order by lease.lease_id
  for update;

  -- A crashed caller may leave a lease row ACTIVE beyond its bounded expiry.
  -- Mark only those elapsed leases terminal; never cancel a live lease.
  update scoring_authority.scoring_ingress_leases
  set status = 'EXPIRED', completed_at = now()
  where tournament_id = '2026' and status = 'ACTIVE' and expires_at <= now();
  get diagnostics expired_lease_count = row_count;

  -- This claim type has an explicit EXPIRED terminal state and its claim RPC
  -- performs the same bounded transition. Other operational rows without an
  -- established expiry contract remain blockers and must use their audited
  -- owner cleanup workflow.
  update production_control.current_shadow_import_claims
  set status = 'EXPIRED'
  where tournament_id = '2026' and status = 'PENDING' and expires_at <= now();
  get diagnostics expired_shadow_claim_count = row_count;

  select count(*)::integer into active_lease_count
  from scoring_authority.scoring_ingress_leases
  where tournament_id = '2026' and status = 'ACTIVE' and expires_at > now();

  select * into strict gate
  from scoring_authority.ingress_gates
  where tournament_id = '2026'
  for update;
  if gate.authority <> 'GOOGLE'
     or gate.active_epoch_id is not null
     or (prior_state = 'STAGED' and gate.state <> 'PAUSED')
     or (prior_state = 'GOOGLE_LEASE_ARMED' and gate.state <> 'OPEN') then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PRECOMMIT_ABORT_PREWRITE_STATE_REQUIRED';
  end if;
  update scoring_authority.ingress_gates
  set unresolved_client_queues = active_lease_count, updated_at = now()
  where tournament_id = '2026';
  if active_lease_count <> 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_PRECOMMIT_ABORT_ACTIVE_GOOGLE_LEASES';
  end if;

  -- Wait for transactions that already own a modifying table lock, then hold
  -- their start surfaces stable until this abort commits.
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
      message = 'PRODUCTION_PRECOMMIT_ABORT_PENDING_WORK';
  end if;

  -- This is the only state change: close the lease gate and forget the exact
  -- abandoned candidate. Canonical authority remains Google throughout.
  update scoring_authority.ingress_gates
  set state = 'PAUSED', authority = 'GOOGLE', active_epoch_id = null,
      unresolved_client_queues = 0,
      updated_by = actor, updated_at = now()
  where tournament_id = '2026';

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
      first_supabase_write_possible_at = null,
      first_supabase_write_observed_at = null,
      first_supabase_mutation_key = null,
      first_supabase_match_id = null,
      first_supabase_match_revision = null,
      updated_by = actor,
      updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
    and state = prior_state
    and activation_revision = expected_revision
  returning * into activation;
  if not found or activation.activation_revision <> expected_revision + 1 then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_PRECOMMIT_ABORT_REVISION_CONFLICT';
  end if;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_PRECOMMIT_RELEASE_ABORTED', 'SCORING_AUTHORITY', '2026',
    actor, request_fingerprint_value, 'SUCCEEDED',
    jsonb_build_object(
      'prior_state', prior_state,
      'state', 'DORMANT',
      'prior_activation_revision', expected_revision,
      'activation_revision', activation.activation_revision,
      'deployment_commit', deployment_commit_value,
      'source_fingerprint', source_fingerprint_value,
      'authority', 'GOOGLE',
      'participant_identity_authority', 'PASSPORT',
      'read_cutover_phase', 'STATIC_BACKEND',
      'google_lease_gate', 'PAUSED',
      'active_google_leases', 0,
      'expired_google_leases', expired_lease_count,
      'expired_shadow_import_claims', expired_shadow_claim_count,
      'first_supabase_canonical_write_possible', false,
      'first_supabase_canonical_write_observed', false,
      'staged_candidate_fields_cleared', true,
      'authority_generation_preserved', true,
      'no_automatic_fallback', true
    )
  );

  response_value := jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_PRECOMMIT_RELEASE_ABORTED',
    'prior_state', prior_state,
    'state', 'DORMANT',
    'activation_revision', activation.activation_revision,
    'epoch_id', activation.authority_generation_id,
    'authority', 'GOOGLE',
    'participant_identity_authority', 'PASSPORT',
    'read_cutover_phase', 'STATIC_BACKEND',
    'google_lease_gate', 'PAUSED',
    'active_google_leases', 0,
    'expired_google_leases', expired_lease_count,
    'expired_shadow_import_claims', expired_shadow_claim_count,
    'scoring_ingress_enabled', false,
    'public_supabase_reads_enabled', false,
    'workers_enabled', false,
    'publication_enabled', false,
    'mirror_enabled', false,
    'google_writes_enabled', false,
    'first_supabase_canonical_write_possible', false,
    'first_supabase_canonical_write_observed', false,
    'staged_candidate_fields_cleared', true,
    'authority_generation_preserved', true,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'ABORT_PRECOMMIT_RELEASE', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function public.abort_production_precommit_release(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.abort_production_precommit_release(jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
