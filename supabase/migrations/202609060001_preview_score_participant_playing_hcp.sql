-- Step 2J.4.1: isolated Preview Score participant HCP read parity.
-- Published participant playingHcp, then unchanged snapshot fallback.
-- No stored value, stroke, formula, permission, Match-ID or DTO-shape changes.
-- Apply only to the isolated Preview project; do not apply to Production.

begin;

create or replace function public.read_game_center_view(target_match_id text)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  match_row scoring_authority.matches%rowtype;
  presentation_row scoring_authority.game_center_presentations%rowtype;
  tournament_value jsonb;
  round_value jsonb;
  snapshot_value jsonb;
  teams_value jsonb;
  participants_value jsonb;
  permissions_value jsonb;
  holes_value jsonb;
  scores_value jsonb;
  navigation_value jsonb;
  published_match_display jsonb;
begin
  select * into match_row from scoring_authority.matches where match_id = btrim(coalesce(target_match_id, ''));
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  select * into presentation_row from scoring_authority.game_center_presentations where match_id = match_row.match_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'GAME_CENTER_PRESENTATION_NOT_IMPORTED'); end if;
  select to_jsonb(t) into tournament_value from scoring_authority.tournaments t where t.tournament_id = match_row.tournament_id;
  select to_jsonb(r) into round_value from scoring_authority.rounds r where r.tournament_id = match_row.tournament_id and r.round_number = match_row.round_number;
  select to_jsonb(s) into snapshot_value from scoring_authority.scoring_snapshots s where s.snapshot_id = match_row.scoring_snapshot_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.team_side), '[]'::jsonb) into teams_value
    from scoring_authority.teams t where t.tournament_id = match_row.tournament_id;
  -- Read projection only: same exact Match key and per-side/player identity
  -- precedence as the certified Matches and Match Detail projections.
  select hp.presentation->'tournamentMatchDisplay'->match_row.match_id
    into published_match_display
    from scoring_authority.participant_home_presentations hp
    where hp.tournament_id = match_row.tournament_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', mp.player_id, 'display_name', p.display_name, 'team_side', mp.team_side,
    'player_slot', mp.player_slot, 'handicap_index', mp.handicap_index,
    'course_handicap', mp.course_handicap,
    'playing_handicap', coalesce(
      nullif((
        select published.value->'playingHcp'
        from pg_catalog.jsonb_array_elements(coalesce(
          nullif(published_match_display->(case when mp.team_side = 1
            then 'team1Players' else 'team2Players' end), 'null'::jsonb),
          '[]'::jsonb)) with ordinality published(value, position)
        where pg_catalog.btrim(coalesce(published.value->>'id', '')) =
          pg_catalog.btrim(mp.player_id)
        order by published.position
        limit 1
      ), 'null'::jsonb),
      pg_catalog.to_jsonb(mp.playing_handicap)),
    'final_strokes', mp.final_strokes
  ) order by mp.team_side, mp.player_slot), '[]'::jsonb) into participants_value
    from scoring_authority.match_participants mp join scoring_authority.players p using (player_id)
    where mp.match_id = match_row.match_id;
  select coalesce(jsonb_agg(to_jsonb(sp) order by sp.player_id), '[]'::jsonb) into permissions_value
    from scoring_authority.scoring_permissions sp where sp.match_id = match_row.match_id;
  select coalesce(jsonb_agg(to_jsonb(mh) order by mh.hole_number), '[]'::jsonb) into holes_value
    from scoring_authority.match_holes mh where mh.match_id = match_row.match_id;
  select coalesce(jsonb_agg(to_jsonb(hs) order by hs.hole_number), '[]'::jsonb) into scores_value
    from scoring_authority.hole_scores hs where hs.match_id = match_row.match_id;

  with ordered as (
    select m.match_id, m.round_number, p.display_match_number, p.match_sort_order,
      lag(m.match_id) over (order by m.round_number, p.match_sort_order, m.match_id) as previous_id,
      lead(m.match_id) over (order by m.round_number, p.match_sort_order, m.match_id) as next_id,
      row_number() over (partition by m.round_number order by p.match_sort_order, m.match_id) as round_position,
      count(*) over (partition by m.round_number) as round_total
    from scoring_authority.matches m
    join scoring_authority.game_center_presentations p using (match_id)
    where m.tournament_id = match_row.tournament_id
  ), selected as (
    select * from ordered where match_id = match_row.match_id
  ) select jsonb_build_object(
    'previous', case when s.previous_id is null then null else jsonb_build_object(
      'id', s.previous_id, 'label', 'Round ' || pm.round_number || ', Match ' || pp.display_match_number) end,
    'next', case when s.next_id is null then null else jsonb_build_object(
      'id', s.next_id, 'label', 'Round ' || nm.round_number || ', Match ' || np.display_match_number) end,
    'position', jsonb_build_object('round', s.round_number, 'index', s.round_position, 'total', s.round_total)
  ) into navigation_value from selected s
    left join scoring_authority.matches pm on pm.match_id = s.previous_id
    left join scoring_authority.game_center_presentations pp on pp.match_id = s.previous_id
    left join scoring_authority.matches nm on nm.match_id = s.next_id
    left join scoring_authority.game_center_presentations np on np.match_id = s.next_id;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value, 'round', round_value, 'match', to_jsonb(match_row),
    'snapshot', snapshot_value, 'teams', teams_value, 'participants', participants_value,
    'permissions', permissions_value, 'holes', holes_value, 'scores', scores_value,
    'presentation', to_jsonb(presentation_row), 'navigation', navigation_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$$;

revoke all on function public.read_game_center_view(text) from public, anon, authenticated;
grant execute on function public.read_game_center_view(text) to service_role;

notify pgrst, 'reload schema';
commit;
