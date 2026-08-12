-- Preview-only canonical input projection for the existing JavaScript
-- Leaderboards engines. This function performs no ranking, handicap, points,
-- skins, Calcutta, odds, storyline, or intelligence calculation.

create or replace function public.read_leaderboards_core_view(target_tournament_id text default null)
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
  players_value jsonb;
  rounds_value jsonb;
  matches_value jsonb;
  presentation_value jsonb;
  source_revision_value jsonb;
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

  select to_jsonb(t) into tournament_value
  from scoring_authority.tournaments t where t.tournament_id = target_tournament;
  if tournament_value is null then
    return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND');
  end if;

  select coalesce(jsonb_agg(to_jsonb(team) order by team.team_side), '[]'::jsonb)
    into teams_value
  from scoring_authority.teams team where team.tournament_id = target_tournament;

  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', p.player_id,
    'display_name', p.display_name,
    'source_payload', p.source_payload,
    'presentation', coalesce((select hp.presentation -> 'leaderboardsPlayers' -> p.player_id
      from scoring_authority.participant_home_presentations hp
      where hp.tournament_id = target_tournament), '{}'::jsonb),
    'team_id', tp.team_id,
    'team_side', tp.team_side,
    'participation_status', tp.participation_status,
    'tournament_source_payload', tp.source_payload
  ) order by tp.team_side, p.display_name, p.player_id), '[]'::jsonb)
    into players_value
  from scoring_authority.tournament_players tp
  join scoring_authority.players p on p.player_id = tp.player_id
  where tp.tournament_id = target_tournament and tp.participation_status = 'ACTIVE';

  select coalesce(jsonb_agg(to_jsonb(r) order by r.round_number), '[]'::jsonb)
    into rounds_value
  from scoring_authority.rounds r where r.tournament_id = target_tournament;

  select coalesce(jsonb_agg(jsonb_build_object(
    'match', to_jsonb(m),
    'round', to_jsonb(r),
    'snapshot', jsonb_build_object(
      'snapshot_id', ss.snapshot_id,
      'snapshot_revision', ss.snapshot_revision,
      'canonical_hash', ss.canonical_hash,
      'course_id', ss.course_id,
      'tee', ss.tee,
      'par', ss.par,
      'rating', ss.rating,
      'slope', ss.slope,
      'format', ss.format,
      'team_configuration', ss.team_configuration,
      'participant_configuration', ss.participant_configuration
    ),
    'presentation', coalesce(to_jsonb(gp), '{}'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'player_id', mp.player_id,
      'display_name', p.display_name,
      'source_payload', p.source_payload,
      'team_side', mp.team_side,
      'player_slot', mp.player_slot,
      'handicap_index', mp.handicap_index,
      'course_handicap', mp.course_handicap,
      'playing_handicap', mp.playing_handicap,
      'final_strokes', mp.final_strokes
    ) order by mp.team_side, mp.player_slot)
      from scoring_authority.match_participants mp
      join scoring_authority.players p on p.player_id = mp.player_id
      where mp.match_id = m.match_id), '[]'::jsonb),
    'holes', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', mh.hole_number,
      'stroke_index', mh.stroke_index,
      'par', mh.par,
      'yardage', mh.yardage
    ) order by mh.hole_number)
      from scoring_authority.match_holes mh where mh.match_id = m.match_id), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', hs.hole_number,
      'hole_revision', hs.hole_revision,
      'team_1_gross_scores', hs.team_1_gross_scores,
      'team_2_gross_scores', hs.team_2_gross_scores,
      'team_1_strokes', hs.team_1_strokes,
      'team_2_strokes', hs.team_2_strokes,
      'team_1_net_score', hs.team_1_net_score,
      'team_2_net_score', hs.team_2_net_score,
      'hole_winner', hs.hole_winner,
      'updated_at', hs.updated_at
    ) order by hs.hole_number)
      from scoring_authority.hole_scores hs where hs.match_id = m.match_id), '[]'::jsonb)
  ) order by m.round_number, coalesce(gp.match_sort_order, 9999), m.match_id), '[]'::jsonb)
    into matches_value
  from scoring_authority.matches m
  join scoring_authority.rounds r
    on r.tournament_id = m.tournament_id and r.round_number = m.round_number
  join scoring_authority.scoring_snapshots ss on ss.snapshot_id = m.scoring_snapshot_id
  left join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  where m.tournament_id = target_tournament;

  select to_jsonb(hp) into presentation_value
  from scoring_authority.participant_home_presentations hp
  where hp.tournament_id = target_tournament;

  select jsonb_build_object(
    'tournamentId', target_tournament,
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
      'matchId', m.match_id,
      'matchRevision', m.match_revision,
      'status', m.status,
      'scoringLocked', m.scoring_locked,
      'scorecardComplete', m.scorecard_complete,
      'finalizedAt', m.finalized_at
    ) order by m.match_id)
      from scoring_authority.matches m where m.tournament_id = target_tournament), '[]'::jsonb),
    'holes', coalesce((select jsonb_agg(jsonb_build_object(
      'matchId', hs.match_id,
      'holeNumber', hs.hole_number,
      'holeRevision', hs.hole_revision
    ) order by hs.match_id, hs.hole_number)
      from scoring_authority.hole_scores hs
      join scoring_authority.matches m on m.match_id = hs.match_id
      where m.tournament_id = target_tournament), '[]'::jsonb)
  ) into source_revision_value;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value,
    'teams', teams_value,
    'players', players_value,
    'rounds', rounds_value,
    'matches', matches_value,
    'tournament_presentation', presentation_value,
    'source_revision', source_revision_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$$;

revoke all on function public.read_leaderboards_core_view(text) from public, anon, authenticated;
grant execute on function public.read_leaderboards_core_view(text) to service_role;

notify pgrst, 'reload schema';
