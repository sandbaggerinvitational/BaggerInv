-- Disabled Net Skins rounds remain explicit configuration, but they do not
-- create recalculation work or participant-facing current results.

create or replace function public.clear_disabled_net_skins_operational_state(target_tournament_id text)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  jobs_removed integer := 0;
  snapshots_retired integer := 0;
begin
  if target_tournament = '' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED'); end if;
  delete from scoring_authority.competition_recalculation_jobs j
  using scoring_authority.net_skins_configurations c
  where j.tournament_id = target_tournament and j.engine_key = 'NET_SKINS'
    and c.tournament_id = j.tournament_id and c.round_number = j.round_number and not c.enabled;
  get diagnostics jobs_removed = row_count;
  update scoring_authority.competition_derived_snapshots s set is_current = false
  from scoring_authority.net_skins_configurations c
  where s.tournament_id = target_tournament and s.engine_key = 'NET_SKINS' and s.is_current
    and c.tournament_id = s.tournament_id and c.round_number = s.round_number and not c.enabled;
  get diagnostics snapshots_retired = row_count;
  return jsonb_build_object('ok', true, 'jobs_removed', jobs_removed, 'snapshots_retired', snapshots_retired);
end;
$$;

revoke all on function public.clear_disabled_net_skins_operational_state(text) from public, anon, authenticated;
grant execute on function public.clear_disabled_net_skins_operational_state(text) to service_role;

notify pgrst, 'reload schema';
