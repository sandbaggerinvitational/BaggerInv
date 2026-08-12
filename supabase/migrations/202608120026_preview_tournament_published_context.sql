-- Participant Tournament reads must resolve the Director-published tournament,
-- never an isolated scoring-authority benchmark fixture with a synthetic year.

alter function public.read_tournament_live_view(text)
  rename to read_tournament_live_view_unscoped_20260812;
alter function public.read_tournament_secondary_view(text, text)
  rename to read_tournament_secondary_view_unscoped_20260812;

revoke all on function public.read_tournament_live_view_unscoped_20260812(text)
  from public, anon, authenticated, service_role;
revoke all on function public.read_tournament_secondary_view_unscoped_20260812(text, text)
  from public, anon, authenticated, service_role;

create function public.read_tournament_live_view(target_tournament_id text default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
begin
  if target_tournament = '' then
    select hp.tournament_id into target_tournament
    from scoring_authority.participant_home_presentations hp
    join scoring_authority.tournaments t on t.tournament_id = hp.tournament_id
    where exists (
      select 1 from scoring_authority.matches m
      where m.tournament_id = hp.tournament_id
    )
    order by hp.imported_at desc, t.tournament_year desc, hp.tournament_id desc
    limit 1;
  end if;
  if coalesce(target_tournament, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'PUBLISHED_TOURNAMENT_NOT_FOUND');
  end if;
  return public.read_tournament_live_view_unscoped_20260812(target_tournament);
end;
$$;

create function public.read_tournament_secondary_view(
  target_tournament_id text default null,
  target_module text default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
begin
  if target_tournament = '' then
    select hp.tournament_id into target_tournament
    from scoring_authority.participant_home_presentations hp
    join scoring_authority.tournaments t on t.tournament_id = hp.tournament_id
    where exists (
      select 1 from scoring_authority.matches m
      where m.tournament_id = hp.tournament_id
    )
    order by hp.imported_at desc, t.tournament_year desc, hp.tournament_id desc
    limit 1;
  end if;
  if coalesce(target_tournament, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'PUBLISHED_TOURNAMENT_NOT_FOUND');
  end if;
  return public.read_tournament_secondary_view_unscoped_20260812(target_tournament, target_module);
end;
$$;

revoke all on function public.read_tournament_live_view(text) from public, anon, authenticated;
revoke all on function public.read_tournament_secondary_view(text, text) from public, anon, authenticated;
grant execute on function public.read_tournament_live_view(text) to service_role;
grant execute on function public.read_tournament_secondary_view(text, text) to service_role;

notify pgrst, 'reload schema';
