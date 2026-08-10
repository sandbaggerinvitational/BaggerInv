-- Preview Phase 1: keep current match authority independent from historical hole observations.
-- Google Sheets remains authoritative. This migration adds no participant access.

create or replace function public.upsert_scoring_shadow_match_observation(observation jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  authoritative_match_revision bigint := coalesce(
    nullif(observation->>'match_google_revision', '')::bigint,
    nullif(observation->>'google_revision', '')::bigint,
    0
  );
  authoritative_match_updated_at timestamptz := coalesce(
    nullif(observation->>'match_google_updated_at', '')::timestamptz,
    nullif(observation->>'google_updated_at', '')::timestamptz
  );
begin
  insert into public.live_match_mirror (
    source_workbook_id, tournament_id, tournament_year, round_number, match_id, authority,
    format, status, current_hole, holes_remaining, team_1_holes_won, team_2_holes_won,
    running_result, result_winner, clinched, scorecard_complete, finalized,
    google_revision, google_updated_at, finalized_at, payload_hash, scored_holes,
    scoring_locked, participant_snapshot, course_snapshot
  ) values (
    observation->>'source_workbook_id', coalesce(observation->>'match_tournament_id', observation->>'tournament_id'),
    coalesce(nullif(observation->>'match_tournament_year', '')::integer, (observation->>'tournament_year')::integer),
    coalesce(nullif(observation->>'match_round_number', '')::integer, (observation->>'round_number')::integer),
    observation->>'match_id', 'google', coalesce(observation->>'match_format', observation->>'format'), observation#>>'{match,status}',
    coalesce((observation#>>'{match,current_hole}')::integer, 0),
    coalesce((observation#>>'{match,holes_remaining}')::integer, 18),
    coalesce((observation#>>'{match,team_1_holes_won}')::integer, 0),
    coalesce((observation#>>'{match,team_2_holes_won}')::integer, 0),
    observation#>>'{match,running_result}', observation#>>'{match,result_winner}',
    coalesce((observation#>>'{match,clinched}')::boolean, false),
    coalesce((observation#>>'{match,scorecard_complete}')::boolean, false),
    coalesce((observation#>>'{match,finalized}')::boolean, false),
    authoritative_match_revision, authoritative_match_updated_at,
    nullif(observation#>>'{match,finalized_at}', '')::timestamptz,
    observation->>'match_payload_hash', coalesce((observation#>>'{match,scored_holes}')::integer, 0),
    coalesce((observation#>>'{match,scoring_locked}')::boolean, false),
    coalesce(observation#>'{match,participants}', '{"team_1":[],"team_2":[]}'::jsonb),
    coalesce(observation#>'{match,course}', '{}'::jsonb)
  )
  on conflict (source_workbook_id, match_id) do update set
    tournament_id = excluded.tournament_id,
    tournament_year = excluded.tournament_year,
    round_number = excluded.round_number,
    format = excluded.format,
    status = excluded.status,
    current_hole = excluded.current_hole,
    holes_remaining = excluded.holes_remaining,
    team_1_holes_won = excluded.team_1_holes_won,
    team_2_holes_won = excluded.team_2_holes_won,
    running_result = excluded.running_result,
    result_winner = excluded.result_winner,
    clinched = excluded.clinched,
    scorecard_complete = excluded.scorecard_complete,
    finalized = excluded.finalized,
    google_revision = excluded.google_revision,
    google_updated_at = excluded.google_updated_at,
    finalized_at = excluded.finalized_at,
    payload_hash = excluded.payload_hash,
    scored_holes = excluded.scored_holes,
    scoring_locked = excluded.scoring_locked,
    participant_snapshot = excluded.participant_snapshot,
    course_snapshot = excluded.course_snapshot,
    mirrored_at = now()
  where excluded.google_revision >= public.live_match_mirror.google_revision;
end;
$$;

revoke all on function public.upsert_scoring_shadow_match_observation(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_scoring_shadow_match_observation(jsonb) to service_role;

create or replace function public.record_scoring_shadow_observation(observation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.score_mirror_events;
begin
  insert into public.score_mirror_events (
    authority, source_workbook_id, tournament_id, tournament_year, round_number,
    match_id, hole_number, google_hole_score_id, google_revision, google_updated_at,
    mutation_key, payload_hash, canonical_payload, google_result, shadow_result,
    comparison_status, comparison_diagnostics, actor_id, actor_name, google_verified_at
  ) values (
    'google', observation->>'source_workbook_id', observation->>'tournament_id',
    (observation->>'tournament_year')::integer, (observation->>'round_number')::integer,
    observation->>'match_id', (observation->>'hole_number')::integer,
    nullif(observation->>'google_hole_score_id', ''), (observation->>'google_revision')::bigint,
    nullif(observation->>'google_updated_at', '')::timestamptz, observation->>'mutation_key',
    observation->>'payload_hash', observation->'canonical_payload', observation->'google_result',
    observation->'shadow_result', observation->>'comparison_status',
    coalesce(observation->'comparison_diagnostics', '{}'::jsonb), nullif(observation->>'actor_id', ''),
    nullif(observation->>'actor_name', ''), (observation->>'google_verified_at')::timestamptz
  )
  on conflict (source_workbook_id, match_id, hole_number, google_revision)
  do update set observed_at = now(), delivery_count = public.score_mirror_events.delivery_count + 1
  returning * into event_row;

  insert into public.hole_score_mirror (
    source_workbook_id, tournament_id, tournament_year, round_number, match_id, hole_number,
    authority, google_hole_score_id, google_revision, google_updated_at, format, stroke_index,
    team_1_gross_scores, team_2_gross_scores, team_1_strokes, team_2_strokes,
    team_1_net_score, team_2_net_score, hole_winner, mutation_key, payload_hash, actor_id, actor_name
  ) values (
    observation->>'source_workbook_id', observation->>'tournament_id',
    (observation->>'tournament_year')::integer, (observation->>'round_number')::integer,
    observation->>'match_id', (observation->>'hole_number')::integer, 'google',
    nullif(observation->>'google_hole_score_id', ''), (observation->>'google_revision')::bigint,
    nullif(observation->>'google_updated_at', '')::timestamptz, observation->>'format',
    (observation->>'stroke_index')::integer, observation->'team_1_gross_scores',
    observation->'team_2_gross_scores', coalesce(observation->'team_1_strokes', '[]'::jsonb),
    coalesce(observation->'team_2_strokes', '[]'::jsonb),
    (observation->>'team_1_net_score')::numeric, (observation->>'team_2_net_score')::numeric,
    observation->>'hole_winner', observation->>'mutation_key', observation->>'payload_hash',
    nullif(observation->>'actor_id', ''), nullif(observation->>'actor_name', '')
  )
  on conflict (source_workbook_id, match_id, hole_number) do update set
    tournament_id = excluded.tournament_id,
    tournament_year = excluded.tournament_year,
    round_number = excluded.round_number,
    google_hole_score_id = excluded.google_hole_score_id,
    google_revision = excluded.google_revision,
    google_updated_at = excluded.google_updated_at,
    format = excluded.format,
    stroke_index = excluded.stroke_index,
    team_1_gross_scores = excluded.team_1_gross_scores,
    team_2_gross_scores = excluded.team_2_gross_scores,
    team_1_strokes = excluded.team_1_strokes,
    team_2_strokes = excluded.team_2_strokes,
    team_1_net_score = excluded.team_1_net_score,
    team_2_net_score = excluded.team_2_net_score,
    hole_winner = excluded.hole_winner,
    mutation_key = excluded.mutation_key,
    payload_hash = excluded.payload_hash,
    actor_id = excluded.actor_id,
    actor_name = excluded.actor_name,
    mirrored_at = now()
  where excluded.google_revision >= public.hole_score_mirror.google_revision;

  perform public.upsert_scoring_shadow_match_observation(observation);

  return jsonb_build_object('event_id', event_row.id, 'match_id', event_row.match_id,
    'hole_number', event_row.hole_number, 'google_revision', event_row.google_revision,
    'comparison_status', event_row.comparison_status);
end;
$$;

revoke all on function public.record_scoring_shadow_observation(jsonb) from public, anon, authenticated;
grant execute on function public.record_scoring_shadow_observation(jsonb) to service_role;

create or replace function public.rebuild_scoring_shadow(
  source_workbook text,
  target_tournament text,
  observations jsonb,
  match_observations jsonb,
  requested_by_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  run_id uuid := gen_random_uuid();
  started timestamptz := clock_timestamp();
  mirrored integer := 0;
  mirrored_matches integer := 0;
  target_year integer := coalesce((match_observations->0->>'tournament_year')::integer, (observations->0->>'tournament_year')::integer, 0);
begin
  if source_workbook is null or source_workbook = '' or target_tournament is null or target_tournament = '' then
    raise exception 'A scoped Preview workbook and tournament are required.';
  end if;

  delete from public.score_mirror_events where source_workbook_id = source_workbook and tournament_id = target_tournament;
  delete from public.hole_score_mirror where source_workbook_id = source_workbook and tournament_id = target_tournament;
  delete from public.live_match_mirror where source_workbook_id = source_workbook and tournament_id = target_tournament;
  delete from public.mirror_reconciliation_runs where source_workbook_id = source_workbook and tournament_id = target_tournament;

  -- Historical hole observations are written first. Their scoring context remains
  -- available to the event/hole mirror, but it cannot own the final current match row.
  for item in select value from jsonb_array_elements(coalesce(observations, '[]'::jsonb)) loop
    perform public.record_scoring_shadow_observation(item);
    mirrored := mirrored + 1;
  end loop;

  -- Current Live Matches is the final authority for every match, including zero-hole matches.
  for item in select value from jsonb_array_elements(coalesce(match_observations, '[]'::jsonb)) loop
    perform public.upsert_scoring_shadow_match_observation(item);
    mirrored_matches := mirrored_matches + 1;
  end loop;

  insert into public.mirror_reconciliation_runs (
    id, source_workbook_id, tournament_id, tournament_year, operation, status,
    google_logical_holes, supabase_logical_holes, requested_by, started_at, completed_at,
    duration_ms, summary
  ) values (
    run_id, source_workbook, target_tournament, target_year, 'REBUILD', 'PASS',
    mirrored, mirrored, requested_by_name, started, clock_timestamp(),
    greatest(0, extract(milliseconds from clock_timestamp() - started)::integer),
    jsonb_build_object('mirrored', mirrored, 'mirrored_matches', mirrored_matches, 'authority', 'google')
  );

  return jsonb_build_object('run_id', run_id, 'mirrored', mirrored, 'mirrored_matches', mirrored_matches, 'status', 'PASS');
end;
$$;

revoke all on function public.rebuild_scoring_shadow(text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.rebuild_scoring_shadow(text, text, jsonb, jsonb, text) to service_role;

revoke all on table public.score_mirror_events from anon, authenticated;
revoke all on table public.hole_score_mirror from anon, authenticated;
revoke all on table public.live_match_mirror from anon, authenticated;
revoke all on table public.mirror_reconciliation_runs from anon, authenticated;
