-- Keep the participant-scoped My Match service payload compact. My Match
-- needs hole identity/outcome for canonical result notation; full gross/net
-- scorecard rows remain available through the separately authorized scorecard.

create or replace function public.read_my_match_view(target_tournament_id text, target_player_id text)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, participant_identity, public, extensions, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  target_player text := btrim(coalesce(target_player_id, ''));
  tournament_value jsonb;
  player_value jsonb;
  tournament_player_value jsonb;
  team_value jsonb;
  teams_value jsonb;
  matches_value jsonb;
  current_round_value integer;
  context_revision_value bigint;
  expected_matches integer;
  presented_matches integer;
begin
  if target_tournament = '' or target_player = '' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_PARTICIPANT_CONTEXT_REQUIRED');
  end if;

  select to_jsonb(t) into tournament_value
  from scoring_authority.tournaments t
  where t.tournament_id = target_tournament;
  if tournament_value is null then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND'); end if;

  select to_jsonb(p), to_jsonb(tp), to_jsonb(team)
    into player_value, tournament_player_value, team_value
  from scoring_authority.tournament_players tp
  join scoring_authority.players p on p.player_id = tp.player_id
  join scoring_authority.teams team on team.tournament_id = tp.tournament_id and team.team_id = tp.team_id
  where tp.tournament_id = target_tournament and tp.player_id = target_player
    and tp.participation_status = 'ACTIVE';
  if player_value is null then return jsonb_build_object('ok', false, 'code', 'ACTIVE_TOURNAMENT_PLAYER_REQUIRED'); end if;

  select count(*) into expected_matches
  from scoring_authority.match_participants mp
  join scoring_authority.matches m on m.match_id = mp.match_id
  where mp.player_id = target_player and m.tournament_id = target_tournament;

  select count(*) into presented_matches
  from scoring_authority.match_participants mp
  join scoring_authority.matches m on m.match_id = mp.match_id
  join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  where mp.player_id = target_player and m.tournament_id = target_tournament;
  if presented_matches <> expected_matches then
    return jsonb_build_object('ok', false, 'code', 'MY_MATCH_PRESENTATION_NOT_IMPORTED');
  end if;

  select coalesce(jsonb_agg(to_jsonb(team) order by team.team_side), '[]'::jsonb)
    into teams_value
  from scoring_authority.teams team
  where team.tournament_id = target_tournament;

  select coalesce(max(m.round_number) filter (where m.status <> 'FINAL'), max(m.round_number), 0)
    into current_round_value
  from scoring_authority.matches m
  where m.tournament_id = target_tournament;

  select coalesce(cr.context_revision, 0) into context_revision_value
  from participant_identity.identity_context_revisions cr
  where cr.tournament_id = target_tournament;
  context_revision_value := coalesce(context_revision_value, 0);

  select coalesce(jsonb_agg(jsonb_build_object(
    'match', to_jsonb(m),
    'round', to_jsonb(r),
    'snapshot', jsonb_build_object('snapshot_id', ss.snapshot_id, 'course_id', ss.course_id, 'tee', ss.tee),
    'presentation', to_jsonb(gp),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'player_id', participant.player_id,
      'display_name', participant_player.display_name,
      'team_side', participant.team_side,
      'player_slot', participant.player_slot
    ) order by participant.team_side, participant.player_slot)
      from scoring_authority.match_participants participant
      join scoring_authority.players participant_player on participant_player.player_id = participant.player_id
      where participant.match_id = m.match_id), '[]'::jsonb),
    'permission', (select to_jsonb(sp)
      from scoring_authority.scoring_permissions sp
      where sp.match_id = m.match_id and sp.player_id = target_player),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', hs.hole_number,
      'hole_winner', hs.hole_winner
    ) order by hs.hole_number)
      from scoring_authority.hole_scores hs where hs.match_id = m.match_id), '[]'::jsonb)
  ) order by m.round_number, gp.match_sort_order, m.match_id), '[]'::jsonb)
    into matches_value
  from scoring_authority.match_participants own_participation
  join scoring_authority.matches m on m.match_id = own_participation.match_id
  join scoring_authority.rounds r on r.tournament_id = m.tournament_id and r.round_number = m.round_number
  join scoring_authority.scoring_snapshots ss on ss.snapshot_id = m.scoring_snapshot_id
  join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  where own_participation.player_id = target_player and m.tournament_id = target_tournament;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value,
    'player', player_value,
    'tournament_player', tournament_player_value,
    'team', team_value,
    'teams', teams_value,
    'current_round', current_round_value,
    'context_revision', context_revision_value,
    'matches', matches_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$$;

revoke all on function public.read_my_match_view(text, text) from public, anon, authenticated;
grant execute on function public.read_my_match_view(text, text) to service_role;

notify pgrst, 'reload schema';
