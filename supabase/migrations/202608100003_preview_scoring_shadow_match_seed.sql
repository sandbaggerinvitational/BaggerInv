-- Preview Phase 1: seed authoritative match state independently of hole scores.
-- Google Sheets remains authoritative. This migration adds no participant access.

alter table public.live_match_mirror
  add column if not exists scored_holes integer not null default 0 check (scored_holes between 0 and 18),
  add column if not exists scoring_locked boolean not null default false,
  add column if not exists participant_snapshot jsonb not null default '{"team_1":[],"team_2":[]}'::jsonb,
  add column if not exists course_snapshot jsonb not null default '{}'::jsonb;

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

  for item in select value from jsonb_array_elements(coalesce(match_observations, '[]'::jsonb)) loop
    insert into public.live_match_mirror (
      source_workbook_id, tournament_id, tournament_year, round_number, match_id, authority,
      format, status, current_hole, holes_remaining, team_1_holes_won, team_2_holes_won,
      running_result, result_winner, clinched, scorecard_complete, finalized,
      google_revision, google_updated_at, finalized_at, payload_hash, scored_holes,
      scoring_locked, participant_snapshot, course_snapshot
    ) values (
      item->>'source_workbook_id', item->>'tournament_id', (item->>'tournament_year')::integer,
      (item->>'round_number')::integer, item->>'match_id', 'google', item->>'format',
      item#>>'{match,status}', coalesce((item#>>'{match,current_hole}')::integer, 0),
      coalesce((item#>>'{match,holes_remaining}')::integer, 18),
      coalesce((item#>>'{match,team_1_holes_won}')::integer, 0),
      coalesce((item#>>'{match,team_2_holes_won}')::integer, 0),
      item#>>'{match,running_result}', item#>>'{match,result_winner}',
      coalesce((item#>>'{match,clinched}')::boolean, false),
      coalesce((item#>>'{match,scorecard_complete}')::boolean, false),
      coalesce((item#>>'{match,finalized}')::boolean, false),
      coalesce((item->>'google_revision')::bigint, 0),
      nullif(item->>'google_updated_at', '')::timestamptz,
      nullif(item#>>'{match,finalized_at}', '')::timestamptz,
      item->>'match_payload_hash', coalesce((item#>>'{match,scored_holes}')::integer, 0),
      coalesce((item#>>'{match,scoring_locked}')::boolean, false),
      coalesce(item#>'{match,participants}', '{"team_1":[],"team_2":[]}'::jsonb),
      coalesce(item#>'{match,course}', '{}'::jsonb)
    );
    mirrored_matches := mirrored_matches + 1;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(observations, '[]'::jsonb)) loop
    perform public.record_scoring_shadow_observation(item);
    mirrored := mirrored + 1;
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

revoke all on table public.live_match_mirror from anon, authenticated;

