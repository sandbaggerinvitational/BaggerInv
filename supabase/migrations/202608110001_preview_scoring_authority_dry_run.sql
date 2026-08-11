-- Phase 2 pre-cutover Preview dry run.
-- Google remains authoritative. These isolated fixtures are never read by participants.

create schema if not exists scoring_dry_run;
revoke all on schema scoring_dry_run from public, anon, authenticated;

create table if not exists scoring_dry_run.matches (
  fixture_set text not null,
  match_id text not null,
  tournament_id text not null,
  tournament_year integer not null,
  round_number integer not null check (round_number > 0),
  format text not null check (format in ('BB', 'SC', 'SI')),
  scoring_rules_version text not null,
  scoring_snapshot jsonb not null,
  status text not null default 'LIVE' check (status in ('LIVE', 'FINAL')),
  scoring_locked boolean not null default false,
  permission_revision bigint not null default 1 check (permission_revision > 0),
  match_revision bigint not null default 0 check (match_revision >= 0),
  scored_holes integer not null default 0 check (scored_holes between 0 and 18),
  current_hole integer not null default 0 check (current_hole between 0 and 18),
  holes_remaining integer not null default 18 check (holes_remaining between 0 and 18),
  team_1_holes_won integer not null default 0,
  team_2_holes_won integer not null default 0,
  running_result text not null default 'Scheduled',
  result_winner text not null default '',
  clinched boolean not null default false,
  scorecard_complete boolean not null default false,
  unresolved_mutations integer not null default 0 check (unresolved_mutations >= 0),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (fixture_set, match_id),
  check (jsonb_typeof(scoring_snapshot) = 'object')
);

create index if not exists scoring_dry_run_matches_tournament_idx
  on scoring_dry_run.matches (fixture_set, tournament_id, round_number, status);

create table if not exists scoring_dry_run.hole_scores (
  fixture_set text not null,
  match_id text not null,
  hole_number integer not null check (hole_number between 1 and 18),
  hole_revision bigint not null check (hole_revision > 0),
  stroke_index integer not null check (stroke_index between 1 and 18),
  team_1_gross_scores jsonb not null,
  team_2_gross_scores jsonb not null,
  team_1_strokes jsonb not null,
  team_2_strokes jsonb not null,
  team_1_net_score integer not null,
  team_2_net_score integer not null,
  hole_winner text not null check (hole_winner in ('Team 1', 'Team 2', 'Halved')),
  mutation_key text not null,
  actor_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (fixture_set, match_id, hole_number),
  foreign key (fixture_set, match_id) references scoring_dry_run.matches (fixture_set, match_id) on delete cascade
);

create unique index if not exists scoring_dry_run_hole_revision_idx
  on scoring_dry_run.hole_scores (fixture_set, match_id, hole_number, hole_revision);
create index if not exists scoring_dry_run_hole_scorecard_idx
  on scoring_dry_run.hole_scores (fixture_set, match_id, hole_number);

create table if not exists scoring_dry_run.mutations (
  fixture_set text not null,
  match_id text not null,
  mutation_key text not null,
  hole_number integer,
  mutation_type text not null check (mutation_type in ('HOLE_SCORE', 'FINALIZE')),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  previous_match_revision bigint not null,
  next_match_revision bigint not null,
  previous_hole_revision bigint,
  next_hole_revision bigint,
  result jsonb not null,
  actor_id text not null,
  created_at timestamptz not null default now(),
  primary key (fixture_set, match_id, mutation_key),
  foreign key (fixture_set, match_id) references scoring_dry_run.matches (fixture_set, match_id) on delete cascade
);

create index if not exists scoring_dry_run_mutations_history_idx
  on scoring_dry_run.mutations (fixture_set, match_id, created_at, next_match_revision);

create table if not exists scoring_dry_run.audit_events (
  id uuid primary key default gen_random_uuid(),
  fixture_set text not null,
  match_id text not null,
  hole_number integer,
  mutation_key text not null,
  action text not null,
  actor_id text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now(),
  unique (fixture_set, match_id, mutation_key),
  foreign key (fixture_set, match_id) references scoring_dry_run.matches (fixture_set, match_id) on delete cascade
);

create table if not exists scoring_dry_run.google_outbox (
  id uuid primary key default gen_random_uuid(),
  fixture_set text not null,
  match_id text not null,
  match_revision bigint not null,
  mutation_key text not null,
  event_type text not null check (event_type in ('HOLE_SCORE_UPSERTED', 'MATCH_FINALIZED')),
  payload jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'DELIVERED', 'FAILED')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (fixture_set, match_id, mutation_key),
  foreign key (fixture_set, match_id) references scoring_dry_run.matches (fixture_set, match_id) on delete cascade
);

create index if not exists scoring_dry_run_google_outbox_pending_idx
  on scoring_dry_run.google_outbox (status, created_at) where status = 'PENDING';

create table if not exists scoring_dry_run.benchmark_samples (
  id uuid primary key default gen_random_uuid(),
  fixture_set text not null,
  operation text not null,
  match_id text,
  hole_number integer,
  outcome text not null,
  authorization_ms numeric,
  lock_wait_ms numeric,
  validation_ms numeric,
  calculation_ms numeric,
  mutation_ms numeric,
  server_transaction_ms numeric,
  rpc_total_ms numeric,
  commit_response_ms numeric,
  response_construction_ms numeric,
  total_server_ms numeric,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scoring_dry_run_benchmark_recent_idx
  on scoring_dry_run.benchmark_samples (fixture_set, operation, created_at desc);

alter table scoring_dry_run.matches enable row level security;
alter table scoring_dry_run.hole_scores enable row level security;
alter table scoring_dry_run.mutations enable row level security;
alter table scoring_dry_run.audit_events enable row level security;
alter table scoring_dry_run.google_outbox enable row level security;
alter table scoring_dry_run.benchmark_samples enable row level security;

revoke all on all tables in schema scoring_dry_run from public, anon, authenticated;
revoke all on all sequences in schema scoring_dry_run from public, anon, authenticated;

create or replace function scoring_dry_run.strokes_on_hole(total_strokes integer, stroke_index integer)
returns integer
language sql
immutable
strict
as $$
  select case
    when total_strokes <= 0 or stroke_index < 1 or stroke_index > 18 then 0
    else floor(total_strokes / 18.0)::integer + case when mod(total_strokes, 18) > 0 and stroke_index <= mod(total_strokes, 18) then 1 else 0 end
  end
$$;

create or replace function scoring_dry_run.valid_gross_scores(values_json jsonb, expected_count integer)
returns boolean
language sql
immutable
as $$
  select case when jsonb_typeof(values_json) = 'array' then
    jsonb_array_length(values_json) = expected_count
      and not exists (
        select 1 from jsonb_array_elements_text(values_json) value
        where value !~ '^[0-9]+$' or value::integer < 1 or value::integer > 20
      )
  else false end
$$;

create or replace function scoring_dry_run.match_progress(target_fixture_set text, target_match_id text, target_format text)
returns jsonb
language plpgsql
stable
set search_path = scoring_dry_run, public, pg_temp
as $$
declare
  scored integer := 0;
  current_hole_value integer := 0;
  team_1_wins integer := 0;
  team_2_wins integer := 0;
  holes_remaining_value integer := 18;
  difference integer := 0;
  status_text text := 'Scheduled';
  result_value text := '';
  clinched_value boolean := false;
  complete_value boolean := false;
  clinch_hole integer;
  clinch_lead integer;
  clinch_team_1 integer;
  clinch_team_2 integer;
  contiguous boolean := false;
begin
  select count(*), coalesce(max(hole_number), 0),
    count(*) filter (where hole_winner = 'Team 1'),
    count(*) filter (where hole_winner = 'Team 2')
  into scored, current_hole_value, team_1_wins, team_2_wins
  from scoring_dry_run.hole_scores
  where fixture_set = target_fixture_set and match_id = target_match_id;

  holes_remaining_value := greatest(0, 18 - current_hole_value);
  complete_value := scored = 18 and current_hole_value = 18;
  select coalesce(bool_and(existing.hole_number is not null), false)
  into contiguous
  from generate_series(1, current_hole_value) expected(hole_number)
  left join scoring_dry_run.hole_scores existing
    on existing.fixture_set = target_fixture_set
   and existing.match_id = target_match_id
   and existing.hole_number = expected.hole_number;
  difference := team_1_wins - team_2_wins;
  if scored > 0 then
    status_text := case when difference = 0 then 'All square through ' || current_hole_value
      else (case when difference > 0 then 'Team 1' else 'Team 2' end) || ' ' || abs(difference) || ' UP through ' || current_hole_value end;
  end if;

  if target_format = 'SI' then
    with running as (
      select hole_number,
        sum(case when hole_winner = 'Team 1' then 1 else 0 end) over (order by hole_number) as team_1,
        sum(case when hole_winner = 'Team 2' then 1 else 0 end) over (order by hole_number) as team_2
      from scoring_dry_run.hole_scores
      where fixture_set = target_fixture_set and match_id = target_match_id
    )
    select hole_number, abs(team_1 - team_2), team_1, team_2
    into clinch_hole, clinch_lead, clinch_team_1, clinch_team_2
    from running
    where abs(team_1 - team_2) > 18 - hole_number
    order by hole_number
    limit 1;

    if contiguous and clinch_hole is not null then
      clinched_value := true;
      result_value := case when clinch_team_1 > clinch_team_2 then 'Team 1' else 'Team 2' end;
      status_text := result_value || ' wins ' || clinch_lead || ' & ' || (18 - clinch_hole);
    elsif complete_value then
      result_value := case when difference = 0 then 'Halved' when difference > 0 then 'Team 1' else 'Team 2' end;
      status_text := case when result_value = 'Halved' then 'Match halved' else result_value || ' wins ' || abs(difference) || ' UP' end;
    end if;
  elsif complete_value then
    result_value := case when difference = 0 then 'Halved' when difference > 0 then 'Team 1' else 'Team 2' end;
  end if;

  return jsonb_build_object(
    'scored_holes', scored,
    'current_hole', current_hole_value,
    'holes_remaining', holes_remaining_value,
    'team_1_holes_won', team_1_wins,
    'team_2_holes_won', team_2_wins,
    'running_result', status_text,
    'result_winner', result_value,
    'clinched', clinched_value,
    'scorecard_complete', complete_value
  );
end;
$$;

create or replace function public.reset_scoring_authority_dry_run(target_fixture_set text, fixtures jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_dry_run, public, pg_temp
as $$
declare
  fixture jsonb;
  inserted integer := 0;
begin
  if coalesce(target_fixture_set, '') = '' or jsonb_typeof(fixtures) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_FIXTURE_SET');
  end if;

  delete from scoring_dry_run.matches where fixture_set = target_fixture_set;

  for fixture in select value from jsonb_array_elements(fixtures) loop
    insert into scoring_dry_run.matches (
      fixture_set, match_id, tournament_id, tournament_year, round_number, format,
      scoring_rules_version, scoring_snapshot, status, scoring_locked,
      permission_revision, match_revision, unresolved_mutations
    ) values (
      target_fixture_set, fixture->>'match_id', fixture->>'tournament_id',
      (fixture->>'tournament_year')::integer, (fixture->>'round_number')::integer,
      fixture->>'format', fixture->>'scoring_rules_version', fixture->'scoring_snapshot',
      coalesce(fixture->>'status', 'LIVE'), coalesce((fixture->>'scoring_locked')::boolean, false),
      coalesce((fixture->>'permission_revision')::bigint, 1),
      coalesce((fixture->>'match_revision')::bigint, 0),
      coalesce((fixture->>'unresolved_mutations')::integer, 0)
    );
    inserted := inserted + 1;
  end loop;
  return jsonb_build_object('ok', true, 'fixture_set', target_fixture_set, 'matches', inserted);
end;
$$;

create or replace function public.submit_hole_score_dry_run(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_dry_run, public, pg_temp
as $$
declare
  server_started timestamptz := clock_timestamp();
  lock_started timestamptz;
  lock_acquired timestamptz;
  validation_started timestamptz;
  calculation_started timestamptz;
  mutation_started timestamptz;
  match_row scoring_dry_run.matches%rowtype;
  hole_row scoring_dry_run.hole_scores%rowtype;
  prior_mutation scoring_dry_run.mutations%rowtype;
  fixture text := input->>'fixture_set';
  target_match text := input->>'match_id';
  target_hole integer := nullif(input->>'hole_number', '')::integer;
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  team_1_gross jsonb := input->'team_1_gross_scores';
  team_2_gross jsonb := input->'team_2_gross_scores';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  expected_hole bigint := coalesce((input->>'expected_hole_revision')::bigint, -1);
  payload_hash_value text;
  expected_count integer;
  stroke_index_value integer;
  team_1_stroke_values jsonb;
  team_2_stroke_values jsonb;
  team_1_net integer;
  team_2_net integer;
  winner text;
  current_hole_revision bigint := 0;
  next_hole_revision bigint;
  next_match_revision bigint;
  progress jsonb;
  result_value jsonb;
  before_state jsonb;
  validation_ms numeric;
  calculation_ms numeric;
  mutation_ms numeric;
  lock_wait_ms numeric;
  server_ms numeric;
  participant_ids jsonb;
begin
  if coalesce(fixture, '') = '' or coalesce(target_match, '') = '' or coalesce(mutation_identity, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  lock_started := clock_timestamp();
  select * into match_row from scoring_dry_run.matches
  where fixture_set = fixture and match_id = target_match
  for update;
  lock_acquired := clock_timestamp();
  lock_wait_ms := extract(milliseconds from lock_acquired - lock_started);
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;

  payload_hash_value := encode(digest(jsonb_build_object(
    'match_id', target_match, 'hole_number', target_hole,
    'team_1_gross_scores', team_1_gross, 'team_2_gross_scores', team_2_gross,
    'actor_id', actor
  )::text, 'sha256'), 'hex');

  select * into prior_mutation from scoring_dry_run.mutations
  where fixture_set = fixture and match_id = target_match and mutation_key = mutation_identity;
  if found then
    if prior_mutation.payload_hash = payload_hash_value then
      return prior_mutation.result || jsonb_build_object('idempotent', true, 'timings',
        coalesce(prior_mutation.result->'timings', '{}'::jsonb) || jsonb_build_object('lock_wait_ms', lock_wait_ms));
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT', 'lock_wait_ms', lock_wait_ms);
  end if;

  validation_started := clock_timestamp();
  participant_ids := coalesce(match_row.scoring_snapshot#>'{participants,all_ids}', '[]'::jsonb);
  if coalesce((input#>>'{authorization,passport_verified}')::boolean, false) is not true or
     input#>>'{authorization,tournament_id}' <> match_row.tournament_id or
     input#>>'{authorization,match_id}' <> match_row.match_id or
     coalesce(actor, '') = '' or
     not participant_ids ? actor then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'lock_wait_ms', lock_wait_ms);
  end if;
  if coalesce((input#>>'{authorization,permission_revision}')::bigint, -1) <> match_row.permission_revision then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE', 'lock_wait_ms', lock_wait_ms);
  end if;
  if match_row.scoring_locked then return jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED', 'lock_wait_ms', lock_wait_ms); end if;
  if match_row.status = 'FINAL' then return jsonb_build_object('ok', false, 'code', 'MATCH_FINAL', 'lock_wait_ms', lock_wait_ms); end if;
  if target_hole is null or target_hole < 1 or target_hole > 18 then return jsonb_build_object('ok', false, 'code', 'INVALID_HOLE', 'lock_wait_ms', lock_wait_ms); end if;
  if expected_match <> match_row.match_revision then return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT', 'current_match_revision', match_row.match_revision, 'lock_wait_ms', lock_wait_ms); end if;

  select * into hole_row from scoring_dry_run.hole_scores
  where fixture_set = fixture and match_id = target_match and hole_number = target_hole;
  if found then current_hole_revision := hole_row.hole_revision; else current_hole_revision := 0; end if;
  if expected_hole <> current_hole_revision then return jsonb_build_object('ok', false, 'code', 'HOLE_REVISION_CONFLICT', 'current_hole_revision', current_hole_revision, 'lock_wait_ms', lock_wait_ms); end if;

  expected_count := case when match_row.format = 'BB' then 2 else 1 end;
  if not scoring_dry_run.valid_gross_scores(team_1_gross, expected_count) or not scoring_dry_run.valid_gross_scores(team_2_gross, expected_count) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_GROSS_SCORES', 'lock_wait_ms', lock_wait_ms);
  end if;
  stroke_index_value := (match_row.scoring_snapshot#>>array['holes', (target_hole - 1)::text, 'stroke_index'])::integer;
  if stroke_index_value is null or stroke_index_value < 1 or stroke_index_value > 18 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SCORING_SNAPSHOT', 'lock_wait_ms', lock_wait_ms);
  end if;
  validation_ms := extract(milliseconds from clock_timestamp() - validation_started);

  calculation_started := clock_timestamp();
  if match_row.format = 'SC' then
    team_1_stroke_values := jsonb_build_array(scoring_dry_run.strokes_on_hole(coalesce((match_row.scoring_snapshot#>>'{teams,team_1_strokes}')::integer, 0), stroke_index_value));
    team_2_stroke_values := jsonb_build_array(scoring_dry_run.strokes_on_hole(coalesce((match_row.scoring_snapshot#>>'{teams,team_2_strokes}')::integer, 0), stroke_index_value));
  else
    select jsonb_agg(scoring_dry_run.strokes_on_hole(coalesce((player->>'final_strokes')::integer, 0), stroke_index_value) order by ordinality)
    into team_1_stroke_values
    from jsonb_array_elements(match_row.scoring_snapshot#>'{participants,team_1}') with ordinality as players(player, ordinality);
    select jsonb_agg(scoring_dry_run.strokes_on_hole(coalesce((player->>'final_strokes')::integer, 0), stroke_index_value) order by ordinality)
    into team_2_stroke_values
    from jsonb_array_elements(match_row.scoring_snapshot#>'{participants,team_2}') with ordinality as players(player, ordinality);
  end if;

  if match_row.format = 'BB' then
    select min(gross::integer - stroke::integer) into team_1_net
    from jsonb_array_elements_text(team_1_gross) with ordinality gross_values(gross, ordinality)
    join jsonb_array_elements_text(team_1_stroke_values) with ordinality stroke_values(stroke, stroke_ordinality) on ordinality = stroke_ordinality;
    select min(gross::integer - stroke::integer) into team_2_net
    from jsonb_array_elements_text(team_2_gross) with ordinality gross_values(gross, ordinality)
    join jsonb_array_elements_text(team_2_stroke_values) with ordinality stroke_values(stroke, stroke_ordinality) on ordinality = stroke_ordinality;
  else
    team_1_net := (team_1_gross->>0)::integer - (team_1_stroke_values->>0)::integer;
    team_2_net := (team_2_gross->>0)::integer - (team_2_stroke_values->>0)::integer;
  end if;
  winner := case when team_1_net = team_2_net then 'Halved' when team_1_net < team_2_net then 'Team 1' else 'Team 2' end;
  calculation_ms := extract(milliseconds from clock_timestamp() - calculation_started);

  mutation_started := clock_timestamp();
  before_state := case when current_hole_revision = 0 then '{}'::jsonb else to_jsonb(hole_row) end;
  next_hole_revision := current_hole_revision + 1;
  next_match_revision := match_row.match_revision + 1;
  insert into scoring_dry_run.hole_scores (
    fixture_set, match_id, hole_number, hole_revision, stroke_index,
    team_1_gross_scores, team_2_gross_scores, team_1_strokes, team_2_strokes,
    team_1_net_score, team_2_net_score, hole_winner, mutation_key, actor_id
  ) values (
    fixture, target_match, target_hole, next_hole_revision, stroke_index_value,
    team_1_gross, team_2_gross, team_1_stroke_values, team_2_stroke_values,
    team_1_net, team_2_net, winner, mutation_identity, actor
  ) on conflict (fixture_set, match_id, hole_number) do update set
    hole_revision = excluded.hole_revision,
    stroke_index = excluded.stroke_index,
    team_1_gross_scores = excluded.team_1_gross_scores,
    team_2_gross_scores = excluded.team_2_gross_scores,
    team_1_strokes = excluded.team_1_strokes,
    team_2_strokes = excluded.team_2_strokes,
    team_1_net_score = excluded.team_1_net_score,
    team_2_net_score = excluded.team_2_net_score,
    hole_winner = excluded.hole_winner,
    mutation_key = excluded.mutation_key,
    actor_id = excluded.actor_id,
    updated_at = now();

  progress := scoring_dry_run.match_progress(fixture, target_match, match_row.format);
  update scoring_dry_run.matches set
    match_revision = next_match_revision,
    scored_holes = (progress->>'scored_holes')::integer,
    current_hole = (progress->>'current_hole')::integer,
    holes_remaining = (progress->>'holes_remaining')::integer,
    team_1_holes_won = (progress->>'team_1_holes_won')::integer,
    team_2_holes_won = (progress->>'team_2_holes_won')::integer,
    running_result = progress->>'running_result',
    result_winner = progress->>'result_winner',
    clinched = (progress->>'clinched')::boolean,
    scorecard_complete = (progress->>'scorecard_complete')::boolean,
    updated_at = now()
  where fixture_set = fixture and match_id = target_match;

  result_value := jsonb_build_object(
    'ok', true, 'code', 'ACCEPTED', 'idempotent', false,
    'fixture_set', fixture, 'match_id', target_match, 'hole_number', target_hole,
    'hole_revision', next_hole_revision, 'match_revision', next_match_revision,
    'gross', jsonb_build_object('team_1', team_1_gross, 'team_2', team_2_gross),
    'strokes', jsonb_build_object('team_1', team_1_stroke_values, 'team_2', team_2_stroke_values),
    'net', jsonb_build_object('team_1', team_1_net, 'team_2', team_2_net),
    'hole_winner', winner, 'match', progress,
    'audit_created', true, 'google_outbox_created', true
  );

  insert into scoring_dry_run.mutations (
    fixture_set, match_id, mutation_key, hole_number, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, previous_hole_revision, next_hole_revision,
    result, actor_id
  ) values (
    fixture, target_match, mutation_identity, target_hole, 'HOLE_SCORE', payload_hash_value,
    match_row.match_revision, next_match_revision, current_hole_revision, next_hole_revision,
    result_value, actor
  );
  insert into scoring_dry_run.audit_events (
    fixture_set, match_id, hole_number, mutation_key, action, actor_id, before_state, after_state
  ) values (
    fixture, target_match, target_hole, mutation_identity, 'HOLE_SCORE_UPSERTED', actor,
    before_state, result_value
  );
  insert into scoring_dry_run.google_outbox (
    fixture_set, match_id, match_revision, mutation_key, event_type, payload
  ) values (
    fixture, target_match, next_match_revision, mutation_identity, 'HOLE_SCORE_UPSERTED', result_value
  );

  mutation_ms := extract(milliseconds from clock_timestamp() - mutation_started);
  server_ms := extract(milliseconds from clock_timestamp() - server_started);
  result_value := result_value || jsonb_build_object('timings', jsonb_build_object(
    'lock_wait_ms', lock_wait_ms,
    'validation_ms', validation_ms,
    'calculation_ms', calculation_ms,
    'mutation_ms', mutation_ms,
    'server_transaction_ms', server_ms
  ));
  update scoring_dry_run.mutations set result = result_value
  where fixture_set = fixture and match_id = target_match and mutation_key = mutation_identity;
  return result_value;
end;
$$;

create or replace function public.finalize_match_dry_run(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_dry_run, public, pg_temp
as $$
declare
  started timestamptz := clock_timestamp();
  lock_started timestamptz := clock_timestamp();
  locked_at timestamptz;
  match_row scoring_dry_run.matches%rowtype;
  fixture text := input->>'fixture_set';
  target_match text := input->>'match_id';
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  payload_hash_value text;
  prior_mutation scoring_dry_run.mutations%rowtype;
  next_revision bigint;
  result_value jsonb;
begin
  select * into match_row from scoring_dry_run.matches
  where fixture_set = fixture and match_id = target_match for update;
  locked_at := clock_timestamp();
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  payload_hash_value := encode(digest(jsonb_build_object('match_id', target_match, 'action', 'FINALIZE', 'actor_id', actor)::text, 'sha256'), 'hex');
  select * into prior_mutation from scoring_dry_run.mutations
  where fixture_set = fixture and match_id = target_match and mutation_key = mutation_identity;
  if found then
    if prior_mutation.payload_hash = payload_hash_value then return prior_mutation.result || jsonb_build_object('idempotent', true); end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if upper(coalesce(input#>>'{authorization,role}', '')) <> 'DIRECTOR' or coalesce((input#>>'{authorization,passport_verified}')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  if match_row.status = 'FINAL' then return jsonb_build_object('ok', false, 'code', 'MATCH_FINAL'); end if;
  if match_row.scoring_locked then return jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED'); end if;
  if expected_match <> match_row.match_revision then return jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT', 'current_match_revision', match_row.match_revision); end if;
  if match_row.scored_holes <> 18 or not match_row.scorecard_complete then return jsonb_build_object('ok', false, 'code', 'SCORECARD_INCOMPLETE', 'scored_holes', match_row.scored_holes); end if;
  if match_row.unresolved_mutations > 0 then return jsonb_build_object('ok', false, 'code', 'UNRESOLVED_MUTATIONS', 'unresolved', match_row.unresolved_mutations); end if;
  if match_row.result_winner = '' then return jsonb_build_object('ok', false, 'code', 'RESULT_UNAVAILABLE'); end if;
  next_revision := match_row.match_revision + 1;
  result_value := jsonb_build_object(
    'ok', true, 'code', 'FINALIZED', 'match_id', target_match,
    'match_revision', next_revision, 'result_winner', match_row.result_winner,
    'scorecard_complete', true, 'scored_holes', 18,
    'audit_created', true, 'google_outbox_created', true,
    'timings', jsonb_build_object(
      'lock_wait_ms', extract(milliseconds from locked_at - lock_started),
      'server_transaction_ms', extract(milliseconds from clock_timestamp() - started)
    )
  );
  update scoring_dry_run.matches set status = 'FINAL', match_revision = next_revision,
    finalized_at = now(), updated_at = now()
  where fixture_set = fixture and match_id = target_match;
  insert into scoring_dry_run.mutations (
    fixture_set, match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id
  ) values (
    fixture, target_match, mutation_identity, 'FINALIZE', payload_hash_value,
    match_row.match_revision, next_revision, result_value, actor
  );
  insert into scoring_dry_run.audit_events (
    fixture_set, match_id, mutation_key, action, actor_id, before_state, after_state
  ) values (fixture, target_match, mutation_identity, 'MATCH_FINALIZED', actor, to_jsonb(match_row), result_value);
  insert into scoring_dry_run.google_outbox (
    fixture_set, match_id, match_revision, mutation_key, event_type, payload
  ) values (fixture, target_match, next_revision, mutation_identity, 'MATCH_FINALIZED', result_value);
  return result_value;
end;
$$;

create or replace function public.read_scoring_authority_dry_run(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_dry_run, public, pg_temp
as $$
declare
  fixture text := input->>'fixture_set';
  target_match text := input->>'match_id';
  mode text := coalesce(input->>'mode', 'MATCH');
  payload jsonb;
begin
  if mode = 'MATCH' then
    select to_jsonb(match_row) into payload from scoring_dry_run.matches match_row
    where fixture_set = fixture and match_id = target_match;
  elsif mode = 'SCORECARD' then
    select jsonb_build_object('match', to_jsonb(match_row), 'holes', coalesce((
      select jsonb_agg(to_jsonb(hole_row) order by hole_number)
      from scoring_dry_run.hole_scores hole_row
      where hole_row.fixture_set = fixture and hole_row.match_id = target_match
    ), '[]'::jsonb)) into payload
    from scoring_dry_run.matches match_row
    where fixture_set = fixture and match_id = target_match;
  elsif mode = 'TOURNAMENT_SUMMARY' then
    select coalesce(jsonb_agg(to_jsonb(match_row) order by round_number, match_id), '[]'::jsonb)
    into payload from scoring_dry_run.matches match_row where fixture_set = fixture;
  elsif mode = 'LEADERBOARD_SUMMARY' then
    select jsonb_build_object(
      'team_1_holes_won', coalesce(sum(team_1_holes_won), 0),
      'team_2_holes_won', coalesce(sum(team_2_holes_won), 0),
      'complete_matches', count(*) filter (where scorecard_complete),
      'final_matches', count(*) filter (where status = 'FINAL')
    ) into payload from scoring_dry_run.matches where fixture_set = fixture;
  elsif mode = 'DIAGNOSTICS' then
    select jsonb_build_object(
      'matches', (select count(*) from scoring_dry_run.matches where fixture_set = fixture),
      'holes', (select count(*) from scoring_dry_run.hole_scores where fixture_set = fixture),
      'mutations', (select count(*) from scoring_dry_run.mutations where fixture_set = fixture),
      'audit_events', (select count(*) from scoring_dry_run.audit_events where fixture_set = fixture),
      'outbox_events', (select count(*) from scoring_dry_run.google_outbox where fixture_set = fixture),
      'duplicate_holes', (select count(*) from (
        select match_id, hole_number from scoring_dry_run.hole_scores where fixture_set = fixture group by match_id, hole_number having count(*) > 1
      ) duplicates),
      'duplicate_mutations', (select count(*) from (
        select match_id, mutation_key from scoring_dry_run.mutations where fixture_set = fixture group by match_id, mutation_key having count(*) > 1
      ) duplicates),
      'benchmark_samples', (select count(*) from scoring_dry_run.benchmark_samples where fixture_set = fixture),
      'pending_google_outbox', (select count(*) from scoring_dry_run.google_outbox where fixture_set = fixture and status = 'PENDING')
    ) into payload;
  elsif mode = 'BENCHMARK_SAMPLES' then
    select coalesce(jsonb_agg(to_jsonb(sample_row) order by created_at), '[]'::jsonb)
    into payload from scoring_dry_run.benchmark_samples sample_row where fixture_set = fixture;
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_READ_MODE');
  end if;
  return jsonb_build_object('ok', true, 'mode', mode, 'data', payload);
end;
$$;

create or replace function public.record_scoring_authority_dry_run_sample(sample jsonb)
returns uuid
language plpgsql
security definer
set search_path = scoring_dry_run, public, pg_temp
as $$
declare sample_id uuid := gen_random_uuid();
begin
  insert into scoring_dry_run.benchmark_samples (
    id, fixture_set, operation, match_id, hole_number, outcome,
    authorization_ms, lock_wait_ms, validation_ms, calculation_ms, mutation_ms,
    server_transaction_ms, rpc_total_ms, commit_response_ms,
    response_construction_ms, total_server_ms, diagnostics
  ) values (
    sample_id, sample->>'fixture_set', sample->>'operation', nullif(sample->>'match_id', ''),
    nullif(sample->>'hole_number', '')::integer, sample->>'outcome',
    nullif(sample->>'authorization_ms', '')::numeric,
    nullif(sample->>'lock_wait_ms', '')::numeric,
    nullif(sample->>'validation_ms', '')::numeric,
    nullif(sample->>'calculation_ms', '')::numeric,
    nullif(sample->>'mutation_ms', '')::numeric,
    nullif(sample->>'server_transaction_ms', '')::numeric,
    nullif(sample->>'rpc_total_ms', '')::numeric,
    nullif(sample->>'commit_response_ms', '')::numeric,
    nullif(sample->>'response_construction_ms', '')::numeric,
    nullif(sample->>'total_server_ms', '')::numeric,
    coalesce(sample->'diagnostics', '{}'::jsonb)
  );
  return sample_id;
end;
$$;

create or replace function public.scoring_authority_dry_run_timeout_probe(delay_ms integer)
returns jsonb
language plpgsql
security definer
set search_path = scoring_dry_run, public, pg_temp
as $$
begin
  perform pg_sleep(greatest(0, least(delay_ms, 5000)) / 1000.0);
  return jsonb_build_object('ok', true, 'delay_ms', delay_ms);
end;
$$;

revoke all on function public.reset_scoring_authority_dry_run(text, jsonb) from public, anon, authenticated;
revoke all on function public.submit_hole_score_dry_run(jsonb) from public, anon, authenticated;
revoke all on function public.finalize_match_dry_run(jsonb) from public, anon, authenticated;
revoke all on function public.read_scoring_authority_dry_run(jsonb) from public, anon, authenticated;
revoke all on function public.record_scoring_authority_dry_run_sample(jsonb) from public, anon, authenticated;
revoke all on function public.scoring_authority_dry_run_timeout_probe(integer) from public, anon, authenticated;

grant execute on function public.reset_scoring_authority_dry_run(text, jsonb) to service_role;
grant execute on function public.submit_hole_score_dry_run(jsonb) to service_role;
grant execute on function public.finalize_match_dry_run(jsonb) to service_role;
grant execute on function public.read_scoring_authority_dry_run(jsonb) to service_role;
grant execute on function public.record_scoring_authority_dry_run_sample(jsonb) to service_role;
grant execute on function public.scoring_authority_dry_run_timeout_probe(integer) to service_role;

comment on schema scoring_dry_run is
  'Preview-only Phase 2 authority-equivalent fixtures. Google remains authoritative and participant clients have no access.';
