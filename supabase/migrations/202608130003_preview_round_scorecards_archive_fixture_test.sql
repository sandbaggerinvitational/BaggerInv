-- Service-only isolated fixture test for Final -> Reopen -> correct -> re-Finalize.
-- The fixture is deleted before the function returns; it never creates a Google delivery.

create or replace function public.test_preview_scorecard_archive_fixture(input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  fixture_tournament constant text := 'ARCHIVE-FIXTURE-3026';
  fixture_match constant text := '3026-R3-1';
  first_snapshot uuid;
  second_snapshot uuid;
  first_job_count integer;
  invalidation_job_count integer;
  final_job_count integer;
  corrected_value integer;
  result_value jsonb;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'actor_id', '')) = '' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_SERVICE_AUTHORIZATION_REQUIRED');
  end if;
  delete from scoring_authority.tournaments where tournament_id = fixture_tournament;

  insert into scoring_authority.tournaments (tournament_id, tournament_year, name, source_workbook_id, scoring_authority)
  values (fixture_tournament, 3026, 'Archive Fixture', 'preview-fixture-workbook', 'SUPABASE');
  insert into scoring_authority.teams (tournament_id, team_id, team_side, name) values
    (fixture_tournament, 'FIXTURE-T1', 1, 'Fixture Team 1'),
    (fixture_tournament, 'FIXTURE-T2', 2, 'Fixture Team 2');
  insert into scoring_authority.players (player_id, display_name) values
    ('ARCHIVE-FIXTURE-P1', 'Fixture Player 1'), ('ARCHIVE-FIXTURE-P2', 'Fixture Player 2')
  on conflict (player_id) do update set display_name = excluded.display_name;
  insert into scoring_authority.tournament_players (
    tournament_id, player_id, team_id, team_side, participation_status, source_roster_key
  ) values
    (fixture_tournament, 'ARCHIVE-FIXTURE-P1', 'FIXTURE-T1', 1, 'ACTIVE', '3026:P1'),
    (fixture_tournament, 'ARCHIVE-FIXTURE-P2', 'FIXTURE-T2', 2, 'ACTIVE', '3026:P2');
  insert into scoring_authority.rounds (tournament_id, round_number, format, name, status)
  values (fixture_tournament, 3, 'SI', 'Fixture Singles', 'LIVE');
  insert into scoring_authority.scoring_snapshots (
    snapshot_id, tournament_id, match_id, snapshot_revision, scoring_rules_version, format,
    course_id, tee, rating, slope, par, match_netting_baseline,
    hole_definitions, participant_configuration, team_configuration, canonical_hash
  ) values (
    fixture_match || ':S1', fixture_tournament, fixture_match, 1, 'fixture-v1', 'SI',
    'FIXTURE-COURSE', 'Fixture', 72, 125, 72, 'LOWEST_PLAYING_HANDICAP',
    (select jsonb_agg(jsonb_build_object('hole_number', hole, 'par', 4, 'stroke_index', hole, 'yardage', 400) order by hole) from generate_series(1,18) hole),
    jsonb_build_object('team_1', jsonb_build_array(jsonb_build_object('id','ARCHIVE-FIXTURE-P1','slot',1)),
      'team_2', jsonb_build_array(jsonb_build_object('id','ARCHIVE-FIXTURE-P2','slot',1))),
    jsonb_build_object('team_1_id','FIXTURE-T1','team_2_id','FIXTURE-T2'), repeat('a',64)
  );
  insert into scoring_authority.matches (
    match_id, tournament_id, round_number, format, scoring_snapshot_id, status, scoring_locked,
    permission_revision, match_revision, scored_holes, current_hole, holes_remaining,
    team_1_holes_won, team_2_holes_won, running_result, result_winner,
    clinched, scorecard_complete, unresolved_mutations
  ) values (
    fixture_match, fixture_tournament, 3, 'SI', fixture_match || ':S1', 'LIVE', false,
    1, 0, 18, 18, 0, 18, 0, 'Team 1 wins 10 & 8', 'Team 1', true, true, 0
  );
  insert into scoring_authority.match_participants (
    match_id, player_id, team_side, player_slot, handicap_index, course_handicap, playing_handicap, final_strokes
  ) values
    (fixture_match, 'ARCHIVE-FIXTURE-P1', 1, 1, 0, 0, 0, 0),
    (fixture_match, 'ARCHIVE-FIXTURE-P2', 2, 1, 0, 0, 0, 0);
  insert into scoring_authority.scoring_permissions (match_id, player_id, can_score, permission_revision) values
    (fixture_match, 'ARCHIVE-FIXTURE-P1', true, 1),
    (fixture_match, 'ARCHIVE-FIXTURE-P2', true, 1);
  insert into scoring_authority.match_holes (match_id, hole_number, snapshot_id, stroke_index, par, yardage)
  select fixture_match, hole, fixture_match || ':S1', hole, 4, 400 from generate_series(1,18) hole;
  insert into scoring_authority.hole_scores (
    match_id, hole_number, hole_revision, team_1_gross_scores, team_2_gross_scores,
    team_1_strokes, team_2_strokes, team_1_net_score, team_2_net_score,
    hole_winner, mutation_key, actor_id
  ) select fixture_match, hole, 1, '[4]'::jsonb, '[5]'::jsonb, '[0]'::jsonb, '[0]'::jsonb,
    4, 5, 'Team 1', 'fixture:H' || hole || ':R1', 'Archive fixture'
  from generate_series(1,18) hole;
  insert into scoring_authority.game_center_presentations (
    match_id, tournament_id, display_match_number, match_sort_order,
    source_workbook_id, source_payload_hash, imported_by
  ) values (fixture_match, fixture_tournament, '1', 1, 'preview-fixture-workbook', repeat('b',64), 'Archive fixture');

  update scoring_authority.matches set status = 'FINAL', scoring_locked = true,
    match_revision = 1, finalized_at = now(), authority_updated_at = now(), updated_at = now()
  where match_id = fixture_match;
  select snapshot_id into first_snapshot from scoring_authority.finalized_scorecard_snapshots
  where match_id = fixture_match and state = 'CURRENT';
  select count(*) into first_job_count from scoring_authority.scorecard_archive_jobs
  where match_id = fixture_match and event_type = 'SCORECARD_ARCHIVE_UPSERT' and match_revision = 1;

  update scoring_authority.matches set status = 'LIVE', scoring_locked = false,
    match_revision = 2, finalized_at = null, authority_updated_at = now(), updated_at = now()
  where match_id = fixture_match;
  select count(*) into invalidation_job_count from scoring_authority.scorecard_archive_jobs
  where match_id = fixture_match and event_type = 'SCORECARD_ARCHIVE_INVALIDATE' and match_revision = 2;

  update scoring_authority.hole_scores set team_2_gross_scores = '[4]'::jsonb,
    team_2_net_score = 4, hole_winner = 'Halved', hole_revision = 2,
    mutation_key = 'fixture:H13:R2', updated_at = now()
  where match_id = fixture_match and hole_number = 13;
  update scoring_authority.matches set team_1_holes_won = 17,
    running_result = 'Team 1 wins 10 & 8', result_winner = 'Team 1',
    status = 'FINAL', scoring_locked = true, match_revision = 3,
    finalized_at = now(), authority_updated_at = now(), updated_at = now()
  where match_id = fixture_match;
  select snapshot_id into second_snapshot from scoring_authority.finalized_scorecard_snapshots
  where match_id = fixture_match and state = 'CURRENT';
  select count(*) into final_job_count from scoring_authority.scorecard_archive_jobs
  where match_id = fixture_match and event_type = 'SCORECARD_ARCHIVE_UPSERT' and match_revision = 3;
  select (hole->'team_2_gross_scores'->>0)::integer into corrected_value
  from scoring_authority.finalized_scorecard_snapshots s,
    lateral jsonb_array_elements(s.payload->'holes') hole
  where s.snapshot_id = second_snapshot and (hole->>'hole_number')::integer = 13;

  result_value := jsonb_build_object(
    'ok', first_snapshot is not null and second_snapshot is not null and first_snapshot <> second_snapshot
      and first_job_count = 1 and invalidation_job_count = 1 and final_job_count = 1 and corrected_value = 4,
    'first_snapshot_created', first_snapshot is not null,
    'first_upsert_jobs', first_job_count,
    'invalidation_jobs', invalidation_job_count,
    'second_snapshot_created', second_snapshot is not null and second_snapshot <> first_snapshot,
    'second_upsert_jobs', final_job_count,
    'corrected_hole_13_team_2_gross', corrected_value,
    'snapshot_revisions', (select jsonb_agg(snapshot_revision order by snapshot_revision)
      from scoring_authority.finalized_scorecard_snapshots where match_id = fixture_match),
    'logical_google_writes', 0
  );
  delete from scoring_authority.tournaments where tournament_id = fixture_tournament;
  delete from scoring_authority.players where player_id in ('ARCHIVE-FIXTURE-P1','ARCHIVE-FIXTURE-P2')
    and not exists (select 1 from scoring_authority.tournament_players tp where tp.player_id = scoring_authority.players.player_id);
  return result_value;
exception when others then
  delete from scoring_authority.tournaments where tournament_id = fixture_tournament;
  delete from scoring_authority.players where player_id in ('ARCHIVE-FIXTURE-P1','ARCHIVE-FIXTURE-P2')
    and not exists (select 1 from scoring_authority.tournament_players tp where tp.player_id = scoring_authority.players.player_id);
  return jsonb_build_object('ok', false, 'code', sqlerrm);
end;
$$;

revoke all on function public.test_preview_scorecard_archive_fixture(jsonb) from public, anon, authenticated;
grant execute on function public.test_preview_scorecard_archive_fixture(jsonb) to service_role;

notify pgrst, 'reload schema';
