-- Make every Production Odds runtime transition single-use and optimistic.
--
-- The global cutover activation revision does not change when the isolated
-- Odds worker is enabled or disabled.  It therefore cannot by itself prevent
-- an old ENABLE/DISABLE request from being replayed after a later transition.
-- This forward migration adds an independent monotonic runtime revision.  A
-- caller must prove both the exact current runtime revision and enabled state;
-- the transition locks the row and advances the revision atomically.
--
-- Applying this migration leaves the runtime and worker in their current
-- state.  It does not enable a worker, alter authority, publish Odds, create a
-- mirror, or perform any Google request/write.
begin;

alter table production_control.odds_calculation_runtime
  add column if not exists runtime_revision bigint not null default 0
    check (runtime_revision >= 0),
  add column if not exists last_transition_request_fingerprint text
    check (last_transition_request_fingerprint is null
      or last_transition_request_fingerprint ~ '^[0-9a-f]{64}$');

create or replace function public.inspect_production_odds_calculation_runtime_control(
  input jsonb
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control
as $$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  runtime production_control.odds_calculation_runtime%rowtype;
  worker production_control.worker_controls%rowtype;
  worker_contract production_control.worker_contracts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_STEP11_ODDS_SERVICE_ROLE_REQUIRED';
  end if;
  perform production_control.assert_exact_cutover_resource_scope(input, false);

  if input->>'project_ref' is distinct from 'ymqhhtxaywtqllynrmxe'
     or input->>'project_url'
          is distinct from 'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or input->>'source_workbook_id'
          is distinct from '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or input->>'vercel_project_id'
          is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or input->>'worker_name' is distinct from 'ODDS_CALCULATION'
     or upper(coalesce(input->>'operation_mode', '')) <> 'STEP11_REHEARSAL'
     or upper(coalesce(input->>'cutover_phase', '')) <> 'ODDS_WAR_ROOM'
     or input->>'candidate_hostname' in (
       'baggerinv.com', 'www.baggerinv.com', 'bagger-inv.vercel.app'
     ) then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_EXACT_SCOPE_REQUIRED';
  end if;

  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict runtime
  from production_control.odds_calculation_runtime
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict worker
  from production_control.worker_controls
  where worker_name = 'ODDS_CALCULATION';
  select * into strict worker_contract
  from production_control.worker_contracts
  where worker_name = 'ODDS_CALCULATION';

  if activation.state not in ('DORMANT', 'STAGED')
     or activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or resource.current_tournament_read_authority <> 'GOOGLE'
     or resource.scoring_authority <> 'GOOGLE'
     or resource.participant_identity_authority <> 'PASSPORT'
     or resource.public_supabase_reads_enabled
     or resource.scoring_ingress_enabled
     or resource.google_writes_enabled
     or resource.odds_publication_enabled
     or worker.scheduler_installed
     or worker.google_writes_allowed
     or worker_contract.scheduler_installed
     or worker_contract.authoritative_write_allowed
     or exists (
       select 1 from production_control.worker_controls mirror
       where mirror.worker_name = 'ODDS_GOOGLE_MIRROR'
         and (mirror.enabled or mirror.google_writes_allowed)
     ) then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_STEP11_ODDS_LEGACY_AUTHORITY_REQUIRED';
  end if;

  return jsonb_build_object(
    'ok', true,
    'runtime_revision', runtime.runtime_revision,
    'enabled', runtime.enabled,
    'operation_mode', runtime.operation_mode,
    'activation_revision', runtime.activation_revision,
    'worker_enabled', worker.enabled,
    'worker_operation_allowed', worker_contract.operation_allowed,
    'scheduler_installed', false,
    'authoritative_write_allowed', false,
    'google_writes_allowed', false,
    'publication_created', false,
    'mirror_created', false,
    'external_google_writes', 0
  );
end;
$$;

create or replace function public.configure_production_odds_calculation_runtime(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  runtime production_control.odds_calculation_runtime%rowtype;
  requested_enabled boolean;
  expected_runtime_enabled boolean;
  expected_runtime_revision bigint;
  previous_runtime_revision bigint;
  previous_runtime_enabled boolean;
  request_fingerprint_value text := lower(coalesce(input->>'request_fingerprint', ''));
  mode text := upper(coalesce(input->>'operation_mode', ''));
  phase text := upper(coalesce(input->>'cutover_phase', ''));
  actor text := left(coalesce(nullif(input->>'actor_id', ''), ''), 160);
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);

  if jsonb_typeof(input->'enabled') <> 'boolean'
     or jsonb_typeof(input->'expected_runtime_enabled') <> 'boolean'
     or jsonb_typeof(input->'expected_runtime_revision') <> 'number'
     or (input->>'expected_runtime_revision') !~ '^(0|[1-9][0-9]*)$'
     or jsonb_typeof(input->'expected_activation_revision') <> 'number'
     or (input->>'expected_activation_revision') !~ '^(0|[1-9][0-9]*)$'
     or request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_RUNTIME_TRANSITION_EXPECTATION_REQUIRED';
  end if;

  requested_enabled := (input->>'enabled')::boolean;
  expected_runtime_enabled := (input->>'expected_runtime_enabled')::boolean;
  expected_runtime_revision := (input->>'expected_runtime_revision')::bigint;

  if input->>'vercel_project_id'
       is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or input->>'worker_name' is distinct from 'ODDS_CALCULATION'
     or actor = ''
     or (
       mode = 'STEP11_REHEARSAL'
       and input->>'operation' is distinct from case when requested_enabled
         then 'ENABLE_STEP11_ODDS_REHEARSAL_RUNTIME'
         else 'DISABLE_STEP11_ODDS_REHEARSAL_RUNTIME'
       end
     ) then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_EXACT_SCOPE_REQUIRED';
  end if;

  -- Preserve the established lock order, then lock the runtime nonce itself.
  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select * into strict runtime
  from production_control.odds_calculation_runtime
  where scope_key = 'BAGGER_INV_PRODUCTION' for update;

  if activation.activation_revision
       <> (input->>'expected_activation_revision')::bigint then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ACTIVATION_REVISION_CONFLICT';
  end if;
  if runtime.runtime_revision <> expected_runtime_revision
     or runtime.enabled is distinct from expected_runtime_enabled then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ODDS_RUNTIME_TRANSITION_CONFLICT';
  end if;

  previous_runtime_revision := runtime.runtime_revision;
  previous_runtime_enabled := runtime.enabled;

  if requested_enabled then
    perform production_control.assert_production_odds_calculation_scope(input, false);
    update production_control.odds_calculation_runtime
    set enabled = true, operation_mode = mode, cutover_phase = phase,
        deployment_commit = activation.expected_deployment_commit,
        activation_revision = activation.activation_revision,
        candidate_hostname = nullif(input->>'candidate_hostname', ''),
        configured_by = actor, configured_at = now(), updated_at = now(),
        runtime_revision = runtime_revision + 1,
        last_transition_request_fingerprint = request_fingerprint_value
    where scope_key = 'BAGGER_INV_PRODUCTION'
      and runtime_revision = expected_runtime_revision
      and enabled is not distinct from expected_runtime_enabled
    returning * into runtime;
  else
    if not runtime.enabled
       or runtime.operation_mode <> mode
       or runtime.activation_revision is distinct from activation.activation_revision then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_ODDS_RUNTIME_DISABLE_STATE_CONFLICT';
    end if;
    update production_control.odds_calculation_runtime
    set enabled = false, operation_mode = 'DORMANT', cutover_phase = null,
        deployment_commit = null, activation_revision = null,
        candidate_hostname = null, configured_by = actor,
        configured_at = now(), updated_at = now(),
        runtime_revision = runtime_revision + 1,
        last_transition_request_fingerprint = request_fingerprint_value
    where scope_key = 'BAGGER_INV_PRODUCTION'
      and runtime_revision = expected_runtime_revision
      and enabled is not distinct from expected_runtime_enabled
    returning * into runtime;
  end if;

  if not found or runtime.runtime_revision <> previous_runtime_revision + 1 then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ODDS_RUNTIME_TRANSITION_CONFLICT';
  end if;

  update production_control.worker_controls
  set enabled = requested_enabled, scheduler_installed = false,
      google_writes_allowed = false, last_verified_at = now(),
      metadata = metadata || jsonb_build_object(
        'contract_version', runtime.contract_version,
        'operation_mode', runtime.operation_mode,
        'cutover_phase', runtime.cutover_phase,
        'deployment_commit', runtime.deployment_commit,
        'runtime_revision', runtime.runtime_revision,
        'configured_by', actor,
        'configured_at', now(),
        'publication_separate', true,
        'google_mirror_separate', true
      )
  where worker_name = 'ODDS_CALCULATION';
  update production_control.worker_contracts
  set operation_allowed = requested_enabled, scheduler_installed = false,
      authoritative_write_allowed = false
  where worker_name = 'ODDS_CALCULATION';
  update production_control.resource_scope
  set workers_enabled = exists (
    select 1 from production_control.worker_controls where enabled
  )
  where scope_key = 'BAGGER_INV_PRODUCTION';

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    case when requested_enabled
      then 'PRODUCTION_ODDS_CALCULATION_WORKER_ENABLED'
      else 'PRODUCTION_ODDS_CALCULATION_WORKER_DISABLED' end,
    'CHAMPIONSHIP_ODDS_CALCULATION', '2026', actor,
    request_fingerprint_value, 'SUCCEEDED',
    jsonb_build_object(
      'enabled', requested_enabled, 'operation_mode', runtime.operation_mode,
      'cutover_phase', runtime.cutover_phase, 'scheduler_installed', false,
      'previous_runtime_revision', previous_runtime_revision,
      'runtime_revision', runtime.runtime_revision,
      'previous_runtime_enabled', previous_runtime_enabled,
      'authoritative_write_allowed', false, 'google_writes_allowed', false,
      'publication_created', false, 'mirror_created', false
    )
  );
  return jsonb_build_object(
    'ok', true, 'enabled', runtime.enabled,
    'operation_mode', runtime.operation_mode,
    'cutover_phase', runtime.cutover_phase,
    'deployment_commit', runtime.deployment_commit,
    'previous_runtime_revision', previous_runtime_revision,
    'runtime_revision', runtime.runtime_revision,
    'previous_runtime_enabled', previous_runtime_enabled,
    'scheduler_installed', false, 'authoritative_write_allowed', false,
    'publication_created', false, 'mirror_created', false
  );
end;
$$;

revoke all on function public.inspect_production_odds_calculation_runtime_control(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.inspect_production_odds_calculation_runtime_control(jsonb)
  to service_role;
revoke all on function public.configure_production_odds_calculation_runtime(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.configure_production_odds_calculation_runtime(jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
