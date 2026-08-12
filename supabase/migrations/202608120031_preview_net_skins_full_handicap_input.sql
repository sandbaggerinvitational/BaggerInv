-- Net Skins individual competition uses each entrant's immutable full-round allocation.
-- Match-applied hole strokes remain authoritative for match play and are not changed here.

create or replace function public.read_net_skins_input_view(target_tournament_id text)
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
  config_value jsonb;
  players_value jsonb;
  matches_value jsonb;
  source_revision_value jsonb;
begin
  if target_tournament = '' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED'); end if;
  select to_jsonb(t) into tournament_value from scoring_authority.tournaments t where t.tournament_id = target_tournament;
  if tournament_value is null then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'configuration', to_jsonb(c),
    'entries', coalesce((select jsonb_agg(to_jsonb(e) order by e.entry_id)
      from scoring_authority.net_skins_configuration_entries e
      where e.tournament_id = c.tournament_id and e.round_number = c.round_number), '[]'::jsonb)
  ) order by c.round_number), '[]'::jsonb) into config_value
  from scoring_authority.net_skins_configurations c
  where c.tournament_id = target_tournament and c.enabled;
  if jsonb_array_length(config_value) = 0 then return jsonb_build_object('ok', false, 'code', 'NET_SKINS_CONFIGURATION_REQUIRED'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('player_id', p.player_id, 'display_name', p.display_name)
    order by p.display_name, p.player_id), '[]'::jsonb) into players_value
  from scoring_authority.tournament_players tp join scoring_authority.players p on p.player_id = tp.player_id
  where tp.tournament_id = target_tournament and tp.participation_status = 'ACTIVE';

  select coalesce(jsonb_agg(jsonb_build_object(
    'match', to_jsonb(m), 'presentation', coalesce(to_jsonb(gp), '{}'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'player_id', mp.player_id, 'display_name', p.display_name,
      'team_side', mp.team_side, 'player_slot', mp.player_slot,
      'playing_handicap', mp.playing_handicap, 'final_strokes', mp.final_strokes
    ) order by mp.team_side, mp.player_slot)
      from scoring_authority.match_participants mp join scoring_authority.players p on p.player_id = mp.player_id
      where mp.match_id = m.match_id), '[]'::jsonb),
    'holes', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', mh.hole_number, 'stroke_index', mh.stroke_index, 'par', mh.par
    ) order by mh.hole_number) from scoring_authority.match_holes mh where mh.match_id = m.match_id), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', hs.hole_number, 'hole_revision', hs.hole_revision,
      'team_1_gross_scores', hs.team_1_gross_scores, 'team_2_gross_scores', hs.team_2_gross_scores,
      'team_1_strokes', hs.team_1_strokes, 'team_2_strokes', hs.team_2_strokes,
      'team_1_net_score', hs.team_1_net_score, 'team_2_net_score', hs.team_2_net_score
    ) order by hs.hole_number) from scoring_authority.hole_scores hs where hs.match_id = m.match_id), '[]'::jsonb)
  ) order by m.round_number, coalesce(gp.match_sort_order, 9999), m.match_id), '[]'::jsonb) into matches_value
  from scoring_authority.matches m
  left join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  where m.tournament_id = target_tournament;

  select jsonb_build_object(
    'tournamentId', target_tournament,
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
      'matchId', m.match_id, 'round', m.round_number, 'matchRevision', m.match_revision,
      'status', m.status, 'finalizedAt', m.finalized_at, 'scorecardComplete', m.scorecard_complete,
      'resultWinner', m.result_winner) order by m.match_id)
      from scoring_authority.matches m where m.tournament_id = target_tournament), '[]'::jsonb),
    'holes', coalesce((select jsonb_agg(jsonb_build_object(
      'matchId', hs.match_id, 'hole', hs.hole_number, 'revision', hs.hole_revision)
      order by hs.match_id, hs.hole_number)
      from scoring_authority.hole_scores hs join scoring_authority.matches m on m.match_id = hs.match_id
      where m.tournament_id = target_tournament), '[]'::jsonb)
  ) into source_revision_value;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value, 'configurations', config_value, 'players', players_value,
    'matches', matches_value, 'source_revision', source_revision_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$$;

revoke all on function public.read_net_skins_input_view(text) from public, anon, authenticated;
grant execute on function public.read_net_skins_input_view(text) to service_role;
