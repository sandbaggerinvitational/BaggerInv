-- Preview-only compact Tournament live read. Canonical score/match state stays
-- in the Phase 2 authority aggregate; Director-authored display modules stay in
-- the existing versioned participant presentation projection.

create or replace function public.read_tournament_live_view(target_tournament_id text default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  tournament_value jsonb;
  teams_value jsonb;
  rounds_value jsonb;
  matches_value jsonb;
  presentation_value jsonb;
  live_revision_value jsonb;
begin
  if target_tournament = '' then
    select t.tournament_id into target_tournament
    from scoring_authority.tournaments t
    where exists (select 1 from scoring_authority.matches m where m.tournament_id = t.tournament_id)
    order by t.tournament_year desc, t.tournament_id desc
    limit 1;
  end if;
  if coalesce(target_tournament, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND');
  end if;

  select to_jsonb(t) into tournament_value
  from scoring_authority.tournaments t where t.tournament_id = target_tournament;
  if tournament_value is null then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND'); end if;

  select coalesce(jsonb_agg(to_jsonb(team) order by team.team_side), '[]'::jsonb) into teams_value
  from scoring_authority.teams team where team.tournament_id = target_tournament;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.round_number), '[]'::jsonb) into rounds_value
  from scoring_authority.rounds r where r.tournament_id = target_tournament;

  select coalesce(jsonb_agg(jsonb_build_object(
    'match', to_jsonb(m),
    'round', to_jsonb(r),
    'snapshot', jsonb_build_object(
      'snapshot_id', ss.snapshot_id, 'course_id', ss.course_id, 'tee', ss.tee,
      'par', ss.par, 'rating', ss.rating, 'slope', ss.slope,
      'team_configuration', ss.team_configuration
    ),
    'presentation', coalesce(to_jsonb(gp), '{}'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'player_id', mp.player_id, 'display_name', p.display_name, 'team_side', mp.team_side,
      'player_slot', mp.player_slot, 'playing_handicap', mp.playing_handicap,
      'final_strokes', mp.final_strokes
    ) order by mp.team_side, mp.player_slot)
      from scoring_authority.match_participants mp
      join scoring_authority.players p on p.player_id = mp.player_id
      where mp.match_id = m.match_id), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', hs.hole_number, 'hole_winner', hs.hole_winner, 'updated_at', hs.updated_at
    ) order by hs.hole_number)
      from scoring_authority.hole_scores hs where hs.match_id = m.match_id), '[]'::jsonb)
  ) order by m.round_number, coalesce(gp.match_sort_order, 9999), m.match_id), '[]'::jsonb)
  into matches_value
  from scoring_authority.matches m
  join scoring_authority.rounds r on r.tournament_id = m.tournament_id and r.round_number = m.round_number
  join scoring_authority.scoring_snapshots ss on ss.snapshot_id = m.scoring_snapshot_id
  left join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  where m.tournament_id = target_tournament;

  select to_jsonb(hp) into presentation_value
  from scoring_authority.participant_home_presentations hp
  where hp.tournament_id = target_tournament;

  select jsonb_build_object(
    'maxMatchRevision', coalesce(max(m.match_revision), 0),
    'totalMatchRevisions', coalesce(sum(m.match_revision), 0),
    'scoredHoles', coalesce(sum(m.scored_holes), 0),
    'finalMatches', count(*) filter (where m.status = 'FINAL'),
    'liveMatches', count(*) filter (where m.status = 'LIVE'),
    'authorityUpdatedAt', max(m.authority_updated_at)
  ) into live_revision_value
  from scoring_authority.matches m where m.tournament_id = target_tournament;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value,
    'teams', teams_value,
    'rounds', rounds_value,
    'matches', matches_value,
    'tournament_presentation', presentation_value,
    'live_revision', live_revision_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$$;

create or replace function public.read_tournament_secondary_view(
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
  started_at timestamptz := clock_timestamp();
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  module_name text := lower(btrim(coalesce(target_module, '')));
  projection_row scoring_authority.participant_home_presentations%rowtype;
begin
  if module_name not in ('calcutta') then
    return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_SECONDARY_MODULE_NOT_SUPPORTED');
  end if;
  if target_tournament = '' then
    select t.tournament_id into target_tournament
    from scoring_authority.tournaments t
    where exists (select 1 from scoring_authority.matches m where m.tournament_id = t.tournament_id)
    order by t.tournament_year desc, t.tournament_id desc limit 1;
  end if;
  select * into projection_row
  from scoring_authority.participant_home_presentations hp
  where hp.tournament_id = target_tournament;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_PRESENTATION_NOT_IMPORTED'); end if;
  return jsonb_build_object(
    'ok', true,
    'data', coalesce(projection_row.presentation->'tournamentSecondary'->module_name, 'null'::jsonb),
    'module', module_name,
    'source_fingerprint', projection_row.source_fingerprint,
    'imported_at', projection_row.imported_at,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  );
end;
$$;

revoke all on function public.read_tournament_live_view(text) from public, anon, authenticated;
revoke all on function public.read_tournament_secondary_view(text, text) from public, anon, authenticated;
grant execute on function public.read_tournament_live_view(text) to service_role;
grant execute on function public.read_tournament_secondary_view(text, text) to service_role;

notify pgrst, 'reload schema';
