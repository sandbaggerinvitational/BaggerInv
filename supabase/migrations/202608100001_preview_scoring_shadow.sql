-- Phase 1 Preview-only observational scoring mirror.
-- Google Sheets remains authoritative. No participant role receives table DML.

create extension if not exists pgcrypto;

create table if not exists public.score_mirror_events (
  id uuid primary key default gen_random_uuid(),
  authority text not null default 'google' check (authority = 'google'),
  source_workbook_id text not null,
  tournament_id text not null,
  tournament_year integer not null,
  round_number integer not null check (round_number > 0),
  match_id text not null,
  hole_number integer not null check (hole_number between 1 and 18),
  google_hole_score_id text,
  google_revision bigint not null check (google_revision >= 0),
  google_updated_at timestamptz,
  mutation_key text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  canonical_payload jsonb not null,
  google_result jsonb not null,
  shadow_result jsonb not null,
  comparison_status text not null check (comparison_status in ('PASS', 'DIVERGENCE')),
  comparison_diagnostics jsonb not null default '{}'::jsonb,
  actor_id text,
  actor_name text,
  google_verified_at timestamptz not null,
  observed_at timestamptz not null default now(),
  delivery_duration_ms integer check (delivery_duration_ms is null or delivery_duration_ms >= 0),
  delivery_count integer not null default 1 check (delivery_count > 0),
  created_at timestamptz not null default now(),
  unique (source_workbook_id, mutation_key),
  unique (source_workbook_id, match_id, hole_number, google_revision)
);

create index if not exists score_mirror_events_tournament_observed_idx
  on public.score_mirror_events (source_workbook_id, tournament_id, observed_at desc);
create index if not exists score_mirror_events_divergence_idx
  on public.score_mirror_events (source_workbook_id, comparison_status, observed_at desc)
  where comparison_status = 'DIVERGENCE';

create table if not exists public.hole_score_mirror (
  source_workbook_id text not null,
  tournament_id text not null,
  tournament_year integer not null,
  round_number integer not null check (round_number > 0),
  match_id text not null,
  hole_number integer not null check (hole_number between 1 and 18),
  authority text not null default 'google' check (authority = 'google'),
  google_hole_score_id text,
  google_revision bigint not null check (google_revision >= 0),
  google_updated_at timestamptz,
  format text not null,
  stroke_index integer check (stroke_index between 1 and 18),
  team_1_gross_scores jsonb not null,
  team_2_gross_scores jsonb not null,
  team_1_strokes jsonb not null default '[]'::jsonb,
  team_2_strokes jsonb not null default '[]'::jsonb,
  team_1_net_score numeric not null,
  team_2_net_score numeric not null,
  hole_winner text not null,
  mutation_key text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  actor_id text,
  actor_name text,
  mirrored_at timestamptz not null default now(),
  primary key (source_workbook_id, match_id, hole_number)
);

create unique index if not exists hole_score_mirror_revision_idx
  on public.hole_score_mirror (source_workbook_id, match_id, hole_number, google_revision);
create index if not exists hole_score_mirror_tournament_round_idx
  on public.hole_score_mirror (source_workbook_id, tournament_id, round_number, match_id, hole_number);

create table if not exists public.live_match_mirror (
  source_workbook_id text not null,
  tournament_id text not null,
  tournament_year integer not null,
  round_number integer not null check (round_number > 0),
  match_id text not null,
  authority text not null default 'google' check (authority = 'google'),
  format text not null,
  status text not null,
  current_hole integer not null default 0 check (current_hole between 0 and 18),
  holes_remaining integer not null default 18 check (holes_remaining between 0 and 18),
  team_1_holes_won integer not null default 0,
  team_2_holes_won integer not null default 0,
  running_result text,
  result_winner text,
  clinched boolean not null default false,
  scorecard_complete boolean not null default false,
  finalized boolean not null default false,
  google_revision bigint not null default 0,
  google_updated_at timestamptz,
  finalized_at timestamptz,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  mirrored_at timestamptz not null default now(),
  primary key (source_workbook_id, match_id)
);

create index if not exists live_match_mirror_tournament_status_idx
  on public.live_match_mirror (source_workbook_id, tournament_id, status, round_number);

create table if not exists public.mirror_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  authority text not null default 'google' check (authority = 'google'),
  source_workbook_id text not null,
  tournament_id text not null,
  tournament_year integer not null,
  operation text not null check (operation in ('RECONCILE', 'REBUILD', 'BENCHMARK')),
  status text not null check (status in ('RUNNING', 'PASS', 'DIVERGENCE', 'FAILED')),
  google_logical_holes integer not null default 0,
  supabase_logical_holes integer not null default 0,
  missing_count integer not null default 0,
  duplicate_count integer not null default 0,
  payload_divergence_count integer not null default 0,
  calculation_divergence_count integer not null default 0,
  stale_count integer not null default 0,
  orphan_count integer not null default 0,
  repaired_count integer not null default 0,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  summary jsonb not null default '{}'::jsonb,
  requested_by text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists mirror_reconciliation_runs_recent_idx
  on public.mirror_reconciliation_runs (source_workbook_id, tournament_id, started_at desc);

alter table public.score_mirror_events enable row level security;
alter table public.hole_score_mirror enable row level security;
alter table public.live_match_mirror enable row level security;
alter table public.mirror_reconciliation_runs enable row level security;

revoke all on public.score_mirror_events from anon, authenticated;
revoke all on public.hole_score_mirror from anon, authenticated;
revoke all on public.live_match_mirror from anon, authenticated;
revoke all on public.mirror_reconciliation_runs from anon, authenticated;

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

  insert into public.live_match_mirror (
    source_workbook_id, tournament_id, tournament_year, round_number, match_id, authority,
    format, status, current_hole, holes_remaining, team_1_holes_won, team_2_holes_won,
    running_result, result_winner, clinched, scorecard_complete, finalized,
    google_revision, google_updated_at, finalized_at, payload_hash
  ) values (
    observation->>'source_workbook_id', observation->>'tournament_id',
    (observation->>'tournament_year')::integer, (observation->>'round_number')::integer,
    observation->>'match_id', 'google', observation->>'format', observation#>>'{match,status}',
    coalesce((observation#>>'{match,current_hole}')::integer, 0),
    coalesce((observation#>>'{match,holes_remaining}')::integer, 18),
    coalesce((observation#>>'{match,team_1_holes_won}')::integer, 0),
    coalesce((observation#>>'{match,team_2_holes_won}')::integer, 0),
    observation#>>'{match,running_result}', observation#>>'{match,result_winner}',
    coalesce((observation#>>'{match,clinched}')::boolean, false),
    coalesce((observation#>>'{match,scorecard_complete}')::boolean, false),
    coalesce((observation#>>'{match,finalized}')::boolean, false),
    (observation->>'google_revision')::bigint, nullif(observation->>'google_updated_at', '')::timestamptz,
    nullif(observation#>>'{match,finalized_at}', '')::timestamptz, observation->>'match_payload_hash'
  )
  on conflict (source_workbook_id, match_id) do update set
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
    google_revision = greatest(public.live_match_mirror.google_revision, excluded.google_revision),
    google_updated_at = excluded.google_updated_at,
    finalized_at = excluded.finalized_at,
    payload_hash = excluded.payload_hash,
    mirrored_at = now();

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
  target_year integer := coalesce((observations->0->>'tournament_year')::integer, 0);
begin
  if source_workbook is null or source_workbook = '' or target_tournament is null or target_tournament = '' then
    raise exception 'A scoped Preview workbook and tournament are required.';
  end if;

  delete from public.score_mirror_events where source_workbook_id = source_workbook and tournament_id = target_tournament;
  delete from public.hole_score_mirror where source_workbook_id = source_workbook and tournament_id = target_tournament;
  delete from public.live_match_mirror where source_workbook_id = source_workbook and tournament_id = target_tournament;
  delete from public.mirror_reconciliation_runs where source_workbook_id = source_workbook and tournament_id = target_tournament;

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
    jsonb_build_object('mirrored', mirrored, 'authority', 'google')
  );

  return jsonb_build_object('run_id', run_id, 'mirrored', mirrored, 'status', 'PASS');
end;
$$;

revoke all on function public.rebuild_scoring_shadow(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.rebuild_scoring_shadow(text, text, jsonb, text) to service_role;

comment on table public.hole_score_mirror is
  'Preview Phase 1 observation only. Google Sheets is authoritative; participant clients must not read this table.';
comment on table public.live_match_mirror is
  'Preview Phase 1 observation only. Never use for participant lifecycle or authorization.';
