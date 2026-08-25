-- Keep the Production Odds calculation runtime eligible after the cutover
-- advances from ODDS_WAR_ROOM into OBSERVATION.
--
-- The runtime continues to store ODDS_WAR_ROOM as its functional enablement
-- phase.  Advancing the cutover phase increments the global activation
-- revision, so the existing configure_production_odds_calculation_runtime RPC
-- must be invoked again with that exact new revision before work can resume.
-- Until that explicit optimistic rebind occurs every request remains closed.
-- Applying this migration does not enable a worker, alter an authority, create
-- a publication/mirror, or write Google.
begin;

create or replace function production_control.assert_production_odds_calculation_scope(
  input jsonb,
  require_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  runtime production_control.odds_calculation_runtime%rowtype;
  worker production_control.worker_controls%rowtype;
  mode text := upper(coalesce(input->>'operation_mode', ''));
  phase text := upper(coalesce(input->>'cutover_phase', ''));
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);

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

  -- ODDS_WAR_ROOM is the immutable functional phase for this worker.  A later
  -- cutover phase is proved independently below and is never stored here.
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
     or phase <> 'ODDS_WAR_ROOM'
     or mode not in ('STEP11_REHEARSAL', 'PRODUCTION_CUTOVER') then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_EXACT_SCOPE_REQUIRED';
  end if;

  if resource.odds_publication_enabled
     or exists (
       select 1 from production_control.worker_controls
       where worker_name = 'ODDS_GOOGLE_MIRROR'
         and (enabled or google_writes_allowed)
     ) then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_PUBLICATION_MUST_REMAIN_SEPARATE';
  end if;

  if mode = 'STEP11_REHEARSAL' then
    if activation.state <> 'STAGED'
       or activation.current_authority <> 'GOOGLE'
       or activation.scoring_ingress_enabled
       or resource.scoring_authority <> 'GOOGLE'
       or resource.scoring_ingress_enabled
       or resource.google_writes_enabled
       or coalesce(input->>'candidate_hostname', '') = '' then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_ODDS_REHEARSAL_LEGACY_AUTHORITY_REQUIRED';
    end if;
  else
    if activation.state <> 'SCORING_COMMITTED'
       or activation.current_authority <> 'SUPABASE'
       or not activation.scoring_ingress_enabled
       or production_control.cutover_phase_rank(activation.read_cutover_phase)
            < production_control.cutover_phase_rank(phase)
       or resource.scoring_authority <> 'SUPABASE'
       or not resource.scoring_ingress_enabled
       or input ? 'candidate_hostname' then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_ODDS_CUTOVER_AUTHORITY_REQUIRED';
    end if;
  end if;

  if require_enabled then
    if not runtime.enabled
       or runtime.operation_mode <> mode
       or runtime.cutover_phase <> phase
       or runtime.deployment_commit <> activation.expected_deployment_commit
       -- The phase-advance revision is deliberately not accepted implicitly.
       -- Re-running the configuration RPC with the exact new optimistic
       -- revision atomically rebinds this value before requests can resume.
       or runtime.activation_revision <> activation.activation_revision
       or runtime.candidate_hostname is distinct from nullif(input->>'candidate_hostname', '')
       or not worker.enabled
       or worker.google_writes_allowed
       or not resource.workers_enabled then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_ODDS_CALCULATION_WORKER_DISABLED';
    end if;
  end if;
end;
$$;

revoke all on function production_control.assert_production_odds_calculation_scope(jsonb, boolean)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
