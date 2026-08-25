-- Step 11 Production Championship Odds runtime input read.
--
-- Applying this migration is inert: it creates one server-only bounded read
-- RPC. It does not enable a worker, create a calculation job, publish Odds,
-- enqueue a mirror, change an authority, or make any Google request.
--
-- The general Production-shadow candidate read contract intentionally requires
-- every worker to remain dormant. The Odds calculation worker, however, must be
-- enabled before a durable job can be requested. This purpose-built RPC keeps
-- those contracts separate: it reuses the exact enabled Odds runtime assertion
-- (including migration 031's shared advisory transaction lock), then reads the
-- already-certified current Production input bundle.
begin;

create or replace function public.read_production_odds_calculation_inputs(
  input jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
begin
  perform production_control.assert_production_odds_calculation_scope(
    input,
    true
  );

  return public.read_championship_odds_inputs('2026');
end;
$$;

revoke all on function public.read_production_odds_calculation_inputs(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_odds_calculation_inputs(jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
