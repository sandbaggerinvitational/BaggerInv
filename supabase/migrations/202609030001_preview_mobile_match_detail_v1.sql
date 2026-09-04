-- Participant-safe, bounded Match Detail authority for isolated native Preview.
-- The RPC exposes canonical read facts only. Participant-facing Match flow,
-- scorecard, clinch, and statistics are projected by the trusted server adapter;
-- native clients never receive scoring permissions or mutation authority.

begin;

create or replace function public.read_preview_mobile_match_detail_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, scoring_authority, public
as $$
declare
  target_tournament text := pg_catalog.btrim(coalesce(input->>'tournament_id', ''));
  target_player text := pg_catalog.btrim(coalesce(input->>'player_id', ''));
  target_match text := pg_catalog.btrim(coalesce(input->>'match_id', ''));
  tournament_row scoring_authority.tournaments%rowtype;
  round_row scoring_authority.rounds%rowtype;
  match_row scoring_authority.matches%rowtype;
  presentation_row scoring_authority.game_center_presentations%rowtype;
  snapshot_row scoring_authority.scoring_snapshots%rowtype;
  teams_value jsonb := '[]'::jsonb;
  participants_value jsonb := '[]'::jsonb;
  holes_value jsonb := '[]'::jsonb;
  scores_value jsonb := '[]'::jsonb;
  navigation_value jsonb;
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
      or target_tournament = '' or target_player = '' or target_match = ''
      or not exists (
        select 1
        from scoring_authority.tournament_players membership
        where membership.tournament_id = target_tournament
          and membership.player_id = target_player
          and membership.participation_status = 'ACTIVE'
      ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREVIEW_PARTICIPANT_MATCH_DETAIL_REQUIRED');
  end if;

  select value.* into match_row
  from scoring_authority.matches value
  where value.match_id = target_match
    and value.tournament_id = target_tournament;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_DETAIL_NOT_FOUND');
  end if;

  select value.* into tournament_row
  from scoring_authority.tournaments value
  where value.tournament_id = target_tournament;
  select value.* into round_row
  from scoring_authority.rounds value
  where value.tournament_id = target_tournament
    and value.round_number = match_row.round_number;
  select value.* into presentation_row
  from scoring_authority.game_center_presentations value
  where value.match_id = target_match
    and value.tournament_id = target_tournament;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_DETAIL_AUTHORITY_UNAVAILABLE');
  end if;
  select value.* into snapshot_row
  from scoring_authority.scoring_snapshots value
  where value.snapshot_id = match_row.scoring_snapshot_id
    and value.tournament_id = target_tournament
    and value.match_id = target_match;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_DETAIL_AUTHORITY_UNAVAILABLE');
  end if;

  -- Fail closed rather than truncating malformed canonical rows. Match Detail
  -- supports exactly two teams, one or two participants per side, at most two
  -- score slots per side, and at most eighteen holes.
  if (select pg_catalog.count(*) from scoring_authority.teams team
        where team.tournament_id = target_tournament) <> 2
      or (select pg_catalog.count(*) from scoring_authority.match_participants participant
        where participant.match_id = target_match) not between 2 and 4
      or (select pg_catalog.count(distinct participant.team_side)
        from scoring_authority.match_participants participant
        where participant.match_id = target_match) <> 2
      or exists (
        select 1
        from scoring_authority.match_participants participant
        where participant.match_id = target_match
        group by participant.team_side
        having pg_catalog.count(*) not between 1 and 2
      )
      or (select pg_catalog.count(*) from scoring_authority.match_holes hole
        where hole.match_id = target_match) <> 18
      or (select pg_catalog.count(*) from scoring_authority.hole_scores score
        where score.match_id = target_match) > 18
      or exists (
    select 1
    from scoring_authority.hole_scores score
    where score.match_id = target_match
      and (
        case when pg_catalog.jsonb_typeof(score.team_1_gross_scores) = 'array'
          then pg_catalog.jsonb_array_length(score.team_1_gross_scores) else 0 end not between 1 and 2
        or case when pg_catalog.jsonb_typeof(score.team_2_gross_scores) = 'array'
          then pg_catalog.jsonb_array_length(score.team_2_gross_scores) else 0 end not between 1 and 2
        or case when pg_catalog.jsonb_typeof(score.team_1_strokes) = 'array'
          then pg_catalog.jsonb_array_length(score.team_1_strokes) else 0 end not between 1 and 2
        or case when pg_catalog.jsonb_typeof(score.team_2_strokes) = 'array'
          then pg_catalog.jsonb_array_length(score.team_2_strokes) else 0 end not between 1 and 2
      )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_DETAIL_AUTHORITY_INVALID');
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'team_id', team.team_id,
    'team_side', team.team_side,
    'name', team.name,
    'logo', case when team.team_side = 1
      then presentation_row.team_1_logo else presentation_row.team_2_logo end,
    'primary_color', case when team.team_side = 1
      then presentation_row.team_1_primary_color else presentation_row.team_2_primary_color end,
    'secondary_color', case when team.team_side = 1
      then presentation_row.team_1_secondary_color else presentation_row.team_2_secondary_color end
  ) order by team.team_side), '[]'::jsonb)
  into teams_value
  from scoring_authority.teams team
  where team.tournament_id = target_tournament;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'player_id', participant.player_id,
    'display_name', player.display_name,
    'team_side', participant.team_side,
    'player_slot', participant.player_slot,
    'playing_handicap', participant.playing_handicap,
    'final_strokes', participant.final_strokes,
    'is_authenticated_player', participant.player_id = target_player
  ) order by participant.team_side, participant.player_slot), '[]'::jsonb)
  into participants_value
  from scoring_authority.match_participants participant
  join scoring_authority.players player using (player_id)
  where participant.match_id = target_match;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'hole_number', hole.hole_number,
    'stroke_index', hole.stroke_index,
    'par', hole.par,
    'yardage', hole.yardage
  ) order by hole.hole_number), '[]'::jsonb)
  into holes_value
  from scoring_authority.match_holes hole
  where hole.match_id = target_match;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'hole_number', score.hole_number,
    'team_1_gross_scores', score.team_1_gross_scores,
    'team_2_gross_scores', score.team_2_gross_scores,
    'team_1_strokes', score.team_1_strokes,
    'team_2_strokes', score.team_2_strokes,
    'team_1_net_score', score.team_1_net_score,
    'team_2_net_score', score.team_2_net_score,
    'hole_winner', score.hole_winner,
    'updated_at', score.updated_at
  ) order by score.hole_number), '[]'::jsonb)
  into scores_value
  from scoring_authority.hole_scores score
  where score.match_id = target_match;

  -- A complete Round presentation with unique explicit sort positions is the
  -- only navigation authority. Opaque IDs and display labels are never used as
  -- ordering substitutes.
  if exists (
      select 1
      from scoring_authority.matches candidate
      left join scoring_authority.game_center_presentations candidate_presentation
        on candidate_presentation.match_id = candidate.match_id
        and candidate_presentation.tournament_id = candidate.tournament_id
      where candidate.tournament_id = target_tournament
        and candidate.round_number = match_row.round_number
        and (
          candidate_presentation.match_id is null
          or candidate_presentation.match_sort_order is null
        )
    ) or exists (
      select 1
      from scoring_authority.matches candidate
      join scoring_authority.game_center_presentations candidate_presentation
        on candidate_presentation.match_id = candidate.match_id
        and candidate_presentation.tournament_id = candidate.tournament_id
      where candidate.tournament_id = target_tournament
        and candidate.round_number = match_row.round_number
      group by candidate_presentation.match_sort_order
      having pg_catalog.count(*) > 1
    ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_DETAIL_AUTHORITY_INVALID');
  end if;

  with ordered as (
    select candidate.match_id,
      pg_catalog.row_number() over (
        order by candidate_presentation.match_sort_order
      ) as round_match_index,
      pg_catalog.count(*) over () as round_match_count,
      pg_catalog.lag(candidate.match_id) over (
        order by candidate_presentation.match_sort_order
      ) as previous_match_id,
      pg_catalog.lead(candidate.match_id) over (
        order by candidate_presentation.match_sort_order
      ) as next_match_id,
      candidate_presentation.match_sort_order
    from scoring_authority.matches candidate
    join scoring_authority.game_center_presentations candidate_presentation
      on candidate_presentation.match_id = candidate.match_id
      and candidate_presentation.tournament_id = candidate.tournament_id
    where candidate.tournament_id = target_tournament
      and candidate.round_number = match_row.round_number
  ), selected as (
    select * from ordered where match_id = target_match
  ), my_match as (
    select candidate.match_id
    from ordered candidate
    join scoring_authority.match_participants participant
      on participant.match_id = candidate.match_id
      and participant.player_id = target_player
    order by candidate.match_sort_order
    limit 1
  )
  select pg_catalog.jsonb_build_object(
    'round_match_index', selected.round_match_index,
    'round_match_count', selected.round_match_count,
    'previous_match_id', selected.previous_match_id,
    'next_match_id', selected.next_match_id,
    'my_match_id', my_match.match_id,
    'is_my_match', selected.match_id = my_match.match_id
  ) into navigation_value
  from selected
  left join my_match on true;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'tournament', pg_catalog.jsonb_build_object(
      'tournament_id', tournament_row.tournament_id,
      'tournament_year', tournament_row.tournament_year,
      'name', tournament_row.name
    ),
    'round', pg_catalog.jsonb_build_object(
      'round_number', round_row.round_number,
      'name', round_row.name,
      'format', round_row.format,
      'status', round_row.status
    ),
    'match', pg_catalog.jsonb_build_object(
      'match_id', match_row.match_id,
      'round_number', match_row.round_number,
      'format', match_row.format,
      'status', match_row.status,
      'scored_holes', match_row.scored_holes,
      'current_hole', match_row.current_hole,
      'holes_remaining', match_row.holes_remaining,
      'team_1_holes_won', match_row.team_1_holes_won,
      'team_2_holes_won', match_row.team_2_holes_won,
      'running_result', match_row.running_result,
      'result_winner', match_row.result_winner,
      'clinched', match_row.clinched,
      'scorecard_complete', match_row.scorecard_complete,
      'authority_updated_at', match_row.authority_updated_at,
      'finalized_at', match_row.finalized_at
    ),
    'presentation', pg_catalog.jsonb_build_object(
      'course_name', presentation_row.course_name,
      'course_logo', presentation_row.course_logo,
      'course_yardage', presentation_row.course_yardage,
      'tee_time', presentation_row.tee_time,
      'starting_hole', presentation_row.starting_hole,
      'display_match_number', presentation_row.display_match_number,
      'team_1_logo', presentation_row.team_1_logo,
      'team_1_primary_color', presentation_row.team_1_primary_color,
      'team_1_secondary_color', presentation_row.team_1_secondary_color,
      'team_2_logo', presentation_row.team_2_logo,
      'team_2_primary_color', presentation_row.team_2_primary_color,
      'team_2_secondary_color', presentation_row.team_2_secondary_color,
      'tournament_location', presentation_row.tournament_location,
      'tournament_logo', presentation_row.tournament_logo,
      'tournament_status', presentation_row.tournament_status,
      'tournament_time_zone', presentation_row.tournament_time_zone,
      'source_updated_at', presentation_row.source_updated_at,
      'updated_at', presentation_row.updated_at
    ),
    'snapshot', pg_catalog.jsonb_build_object(
      'format', snapshot_row.format,
      'course_id', snapshot_row.course_id,
      'tee', snapshot_row.tee,
      'rating', snapshot_row.rating,
      'slope', snapshot_row.slope,
      'par', snapshot_row.par,
      'team_configuration', pg_catalog.jsonb_build_object(
        'team_1_playing_handicap', snapshot_row.team_configuration->'team_1_playing_handicap',
        'team_2_playing_handicap', snapshot_row.team_configuration->'team_2_playing_handicap',
        'team_1_strokes', snapshot_row.team_configuration->'team_1_strokes',
        'team_2_strokes', snapshot_row.team_configuration->'team_2_strokes'
      )
    ),
    'teams', teams_value,
    'participants', participants_value,
    'holes', holes_value,
    'scores', scores_value,
    'navigation', navigation_value
  );
end;
$$;

revoke all on function public.read_preview_mobile_match_detail_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_preview_mobile_match_detail_v1(jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;
