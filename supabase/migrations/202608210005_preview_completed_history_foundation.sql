-- Step 6A: Preview-only canonical completed-history foundation (2017-2025).
--
-- This migration deliberately reuses the shared tournament, player, team,
-- tournament-player, and round identities in scoring_authority.  The companion
-- tables below preserve completed-history evidence at an immutable revision so
-- sparse legacy records are not forced into the live-scoring schema's complete
-- 18-hole snapshot contract.  No public route is switched by this migration.

create table scoring_authority.completed_history_revisions (
  revision_id uuid primary key,
  project_ref text not null check (project_ref = 'idgigvjjqkfbqjeredpb'),
  source_workbook_id text not null
    check (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  tournament_id text not null references scoring_authority.tournaments (tournament_id),
  tournament_year integer not null check (tournament_year between 2017 and 2025),
  revision_number bigint not null check (revision_number > 0),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  database_payload_fingerprint text not null check (database_payload_fingerprint ~ '^[0-9a-f]{64}$'),
  import_contract_version text not null,
  correction_set_version text not null,
  importer_version text not null,
  source_counts jsonb not null,
  canonical_counts jsonb not null,
  certification jsonb not null,
  operation text not null check (operation in ('INITIAL_IMPORT', 'CORRECTION')),
  previous_revision_id uuid references scoring_authority.completed_history_revisions (revision_id),
  correction_reason text,
  imported_by text not null,
  certified_at timestamptz not null default now(),
  unique (tournament_id, revision_number),
  unique (tournament_year, revision_number),
  unique (
    project_ref, tournament_year, source_fingerprint,
    payload_fingerprint, database_payload_fingerprint
  ),
  unique (revision_id, tournament_id),
  check (
    (operation = 'INITIAL_IMPORT' and previous_revision_id is null and correction_reason is null)
    or
    (operation = 'CORRECTION' and previous_revision_id is not null and length(btrim(correction_reason)) >= 10)
  ),
  check (jsonb_typeof(source_counts) = 'object'),
  check (jsonb_typeof(canonical_counts) = 'object'),
  check (jsonb_typeof(certification) = 'object')
);

create index completed_history_revisions_year_certified_idx
  on scoring_authority.completed_history_revisions (tournament_year, certified_at desc);

create table scoring_authority.completed_history_current_revisions (
  tournament_id text primary key references scoring_authority.tournaments (tournament_id),
  tournament_year integer not null unique check (tournament_year between 2017 and 2025),
  revision_id uuid not null unique references scoring_authority.completed_history_revisions (revision_id),
  project_ref text not null check (project_ref = 'idgigvjjqkfbqjeredpb'),
  source_workbook_id text not null
    check (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  advanced_by text not null,
  advanced_at timestamptz not null default now()
);

create table scoring_authority.completed_history_import_runs (
  import_run_id uuid primary key,
  revision_id uuid not null unique references scoring_authority.completed_history_revisions (revision_id),
  tournament_id text not null,
  tournament_year integer not null check (tournament_year between 2017 and 2025),
  operation text not null check (operation in ('INITIAL_IMPORT', 'CORRECTION')),
  status text not null check (status = 'SUCCEEDED'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  actor_id text not null,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  foreign key (revision_id, tournament_id)
    references scoring_authority.completed_history_revisions (revision_id, tournament_id),
  check (jsonb_typeof(metadata) = 'object')
);

create index completed_history_import_runs_year_idx
  on scoring_authority.completed_history_import_runs (tournament_year, imported_at desc);

-- Stable cross-year course identity.  Tee/rating/slope/yardage/par belong to a
-- revision-scoped tournament appearance below and never overwrite one another.
create table scoring_authority.completed_history_course_identities (
  course_id text primary key,
  canonical_name text not null,
  canonical_location text,
  first_seen_year integer not null check (first_seen_year between 2017 and 2025),
  identity_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(identity_payload) = 'object')
);

create table scoring_authority.completed_history_tournament_facts (
  revision_id uuid primary key references scoring_authority.completed_history_revisions (revision_id),
  tournament_id text not null,
  tournament_year integer not null check (tournament_year between 2017 and 2025),
  start_date date,
  end_date date,
  destination text,
  timezone text,
  lifecycle text not null check (lifecycle = 'FINAL'),
  score_availability text not null check (score_availability in ('RECORDED', 'UNAVAILABLE')),
  official_team_1_points numeric,
  official_team_2_points numeric,
  total_awarded_points numeric,
  expected_configured_points numeric,
  champion_team_side integer check (champion_team_side in (1, 2)),
  champion_team_id text,
  team_size integer check (team_size > 0),
  source_payload jsonb not null default '{}'::jsonb,
  foreign key (revision_id, tournament_id)
    references scoring_authority.completed_history_revisions (revision_id, tournament_id),
  foreign key (tournament_id, champion_team_id)
    references scoring_authority.teams (tournament_id, team_id),
  check (jsonb_typeof(source_payload) = 'object'),
  check (
    (score_availability = 'RECORDED' and official_team_1_points is not null
      and official_team_2_points is not null and total_awarded_points is not null)
    or
    (score_availability = 'UNAVAILABLE' and official_team_1_points is null
      and official_team_2_points is null and total_awarded_points is null)
  )
);

create table scoring_authority.completed_history_team_facts (
  revision_id uuid not null references scoring_authority.completed_history_revisions (revision_id),
  tournament_id text not null,
  team_id text not null,
  team_side integer not null check (team_side in (1, 2)),
  name text not null,
  captain_player_id text references scoring_authority.players (player_id),
  logo_key text,
  presentation_identity jsonb not null default '{}'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  primary key (revision_id, team_id),
  unique (revision_id, team_side),
  foreign key (tournament_id, team_id)
    references scoring_authority.teams (tournament_id, team_id),
  check (jsonb_typeof(presentation_identity) = 'object'),
  check (jsonb_typeof(source_payload) = 'object')
);

create index completed_history_team_facts_captain_idx
  on scoring_authority.completed_history_team_facts (captain_player_id, revision_id);

create table scoring_authority.completed_history_roster_facts (
  revision_id uuid not null references scoring_authority.completed_history_revisions (revision_id),
  tournament_id text not null,
  player_id text not null references scoring_authority.players (player_id),
  display_name text not null,
  team_id text not null,
  team_side integer not null check (team_side in (1, 2)),
  participation_status text not null check (participation_status in ('ACTIVE', 'WITHDRAWN', 'INACTIVE')),
  is_captain boolean not null default false,
  -- Governor history is not recorded consistently in the legacy source.
  -- NULL means unavailable; it must not be fabricated as false.
  is_governor boolean,
  tournament_handicap numeric,
  source_payload jsonb not null default '{}'::jsonb,
  primary key (revision_id, player_id),
  foreign key (tournament_id, player_id)
    references scoring_authority.tournament_players (tournament_id, player_id),
  foreign key (tournament_id, team_id)
    references scoring_authority.teams (tournament_id, team_id),
  check (jsonb_typeof(source_payload) = 'object')
);

create index completed_history_roster_player_idx
  on scoring_authority.completed_history_roster_facts (player_id, revision_id);
create index completed_history_roster_team_idx
  on scoring_authority.completed_history_roster_facts (revision_id, team_side, player_id);

create table scoring_authority.completed_history_round_facts (
  revision_id uuid not null references scoring_authority.completed_history_revisions (revision_id),
  tournament_id text not null,
  round_number integer not null check (round_number between 1 and 99),
  format text not null check (format in ('BB', 'SC', 'SI')),
  name text not null,
  team_size integer not null check (team_size > 0),
  points_per_match numeric,
  handicap_allowance numeric,
  course_appearance_id text,
  scoring_semantics jsonb not null default '{}'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  primary key (revision_id, round_number),
  foreign key (tournament_id, round_number)
    references scoring_authority.rounds (tournament_id, round_number),
  check (jsonb_typeof(scoring_semantics) = 'object'),
  check (jsonb_typeof(source_payload) = 'object')
);

create table scoring_authority.completed_history_course_appearances (
  revision_id uuid not null references scoring_authority.completed_history_revisions (revision_id),
  tournament_id text not null,
  appearance_id text not null,
  round_number integer not null,
  course_id text not null references scoring_authority.completed_history_course_identities (course_id),
  source_course_id text not null,
  display_name text not null,
  location text,
  tee text,
  rating numeric,
  slope integer,
  yardage integer,
  par integer,
  hole_definitions jsonb not null default '[]'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  primary key (revision_id, appearance_id),
  unique (revision_id, round_number),
  foreign key (revision_id, round_number)
    references scoring_authority.completed_history_round_facts (revision_id, round_number),
  check (slope is null or slope > 0),
  check (yardage is null or yardage > 0),
  check (par is null or par > 0),
  check (jsonb_typeof(hole_definitions) = 'array'),
  check (jsonb_array_length(hole_definitions) in (0, 18)),
  check (jsonb_typeof(source_payload) = 'object')
);

create index completed_history_course_appearance_course_idx
  on scoring_authority.completed_history_course_appearances (course_id, revision_id, round_number);
create index completed_history_course_appearance_source_idx
  on scoring_authority.completed_history_course_appearances (source_course_id, revision_id);

create table scoring_authority.completed_history_matches (
  revision_id uuid not null references scoring_authority.completed_history_revisions (revision_id),
  tournament_id text not null,
  match_id text not null,
  round_number integer not null,
  format text not null check (format in ('BB', 'SC', 'SI')),
  course_appearance_id text not null,
  lifecycle text not null check (lifecycle = 'FINAL'),
  completion_state text not null check (completion_state in ('COMPLETE', 'CONCEDED', 'FORFEIT', 'LEGACY_FINAL')),
  scorecard_coverage text not null check (scorecard_coverage in ('COMPLETE', 'PARTIAL', 'UNAVAILABLE')),
  result text not null,
  result_winner text not null check (result_winner in ('Team 1', 'Team 2', 'Halved')),
  team_1_points numeric,
  team_2_points numeric,
  points_available numeric,
  points_availability text not null check (points_availability in ('RECORDED', 'UNAVAILABLE')),
  source_match_key text not null,
  source_payload jsonb not null default '{}'::jsonb,
  primary key (revision_id, match_id),
  unique (revision_id, source_match_key),
  foreign key (revision_id, round_number)
    references scoring_authority.completed_history_round_facts (revision_id, round_number),
  foreign key (revision_id, course_appearance_id)
    references scoring_authority.completed_history_course_appearances (revision_id, appearance_id),
  check (jsonb_typeof(source_payload) = 'object'),
  check (
    (points_availability = 'RECORDED' and team_1_points is not null
      and team_2_points is not null and points_available is not null)
    or
    (points_availability = 'UNAVAILABLE' and team_1_points is null
      and team_2_points is null)
  )
);

create index completed_history_matches_round_idx
  on scoring_authority.completed_history_matches (revision_id, round_number, match_id);
create index completed_history_matches_tournament_result_idx
  on scoring_authority.completed_history_matches (tournament_id, lifecycle, result_winner);
create index completed_history_matches_course_idx
  on scoring_authority.completed_history_matches (course_appearance_id, revision_id);

create table scoring_authority.completed_history_match_participants (
  revision_id uuid not null,
  match_id text not null,
  player_id text not null references scoring_authority.players (player_id),
  team_side integer not null check (team_side in (1, 2)),
  player_slot integer not null check (player_slot in (1, 2)),
  tournament_handicap numeric,
  applied_handicap numeric,
  applied_strokes numeric,
  source_payload jsonb not null default '{}'::jsonb,
  primary key (revision_id, match_id, team_side, player_slot),
  unique (revision_id, match_id, player_id),
  foreign key (revision_id, match_id)
    references scoring_authority.completed_history_matches (revision_id, match_id),
  check (jsonb_typeof(source_payload) = 'object')
);

create index completed_history_match_participants_player_idx
  on scoring_authority.completed_history_match_participants (player_id, revision_id, match_id);

create table scoring_authority.completed_history_scorecards (
  revision_id uuid not null,
  scorecard_id text not null,
  match_id text not null,
  entity_kind text not null check (entity_kind in ('PLAYER', 'PAIRING', 'TEAM')),
  player_id text references scoring_authority.players (player_id),
  team_side integer check (team_side in (1, 2)),
  player_slot integer check (player_slot in (1, 2)),
  coverage_status text not null check (coverage_status in ('COMPLETE', 'PARTIAL', 'UNAVAILABLE')),
  recorded_holes integer not null check (recorded_holes between 0 and 18),
  hole_values jsonb not null default '[]'::jsonb,
  score_semantics jsonb not null default '{}'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  primary key (revision_id, scorecard_id),
  foreign key (revision_id, match_id)
    references scoring_authority.completed_history_matches (revision_id, match_id),
  check (jsonb_typeof(hole_values) = 'array'),
  check (jsonb_typeof(score_semantics) = 'object'),
  check (jsonb_typeof(source_payload) = 'object'),
  check (
    (coverage_status = 'COMPLETE' and recorded_holes = 18 and jsonb_array_length(hole_values) = 18)
    or
    (coverage_status = 'PARTIAL' and recorded_holes between 1 and 17
      and jsonb_array_length(hole_values) = 18)
    or
    (coverage_status = 'UNAVAILABLE' and recorded_holes = 0
      and jsonb_array_length(hole_values) in (0, 18))
  )
);

create index completed_history_scorecards_match_idx
  on scoring_authority.completed_history_scorecards (revision_id, match_id, coverage_status);
create index completed_history_scorecards_player_idx
  on scoring_authority.completed_history_scorecards (player_id, revision_id)
  where player_id is not null;
create index completed_history_scorecards_coverage_idx
  on scoring_authority.completed_history_scorecards (coverage_status, revision_id);

create table scoring_authority.completed_history_awards (
  revision_id uuid not null references scoring_authority.completed_history_revisions (revision_id),
  tournament_id text not null,
  award_id text not null,
  award_type text not null,
  label text not null,
  recipient_kind text not null check (recipient_kind in ('PLAYER', 'TEAM', 'TEXT', 'UNAVAILABLE')),
  winner_player_id text references scoring_authority.players (player_id),
  winner_team_id text,
  recipient_display text,
  source_payload jsonb not null default '{}'::jsonb,
  primary key (revision_id, award_id),
  foreign key (tournament_id, winner_team_id)
    references scoring_authority.teams (tournament_id, team_id),
  check (jsonb_typeof(source_payload) = 'object'),
  check (
    (recipient_kind = 'PLAYER' and winner_player_id is not null)
    or (recipient_kind = 'TEAM' and winner_team_id is not null)
    or (recipient_kind = 'TEXT' and btrim(coalesce(recipient_display, '')) <> '')
    or (recipient_kind = 'UNAVAILABLE' and winner_player_id is null and winner_team_id is null)
  )
);

create index completed_history_awards_player_idx
  on scoring_authority.completed_history_awards (winner_player_id, revision_id)
  where winner_player_id is not null;
create index completed_history_awards_type_idx
  on scoring_authority.completed_history_awards (award_type, revision_id);

create table scoring_authority.completed_history_record_eligibility (
  revision_id uuid not null,
  match_id text not null,
  player_id text not null references scoring_authority.players (player_id),
  is_record_eligible boolean not null,
  reason_code text not null,
  source_payload jsonb not null default '{}'::jsonb,
  primary key (revision_id, match_id, player_id),
  foreign key (revision_id, match_id, player_id)
    references scoring_authority.completed_history_match_participants (revision_id, match_id, player_id),
  check (btrim(reason_code) <> ''),
  check (jsonb_typeof(source_payload) = 'object')
);

create index completed_history_record_eligibility_player_idx
  on scoring_authority.completed_history_record_eligibility
    (player_id, is_record_eligible, revision_id);
create index completed_history_record_eligibility_excluded_idx
  on scoring_authority.completed_history_record_eligibility (revision_id, match_id, player_id)
  where is_record_eligible is false;

create table scoring_authority.completed_history_correction_applications (
  revision_id uuid not null references scoring_authority.completed_history_revisions (revision_id),
  correction_id text not null,
  category text not null,
  description text not null,
  evidence jsonb not null default '{}'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  primary key (revision_id, correction_id),
  check (jsonb_typeof(evidence) = 'object'),
  check (jsonb_typeof(source_payload) = 'object')
);

create index completed_history_corrections_category_idx
  on scoring_authority.completed_history_correction_applications (category, revision_id);

-- All completed-history facts are append-only and can only be inserted by the
-- security-definer importer.  The sole mutable object is the current-revision
-- pointer, and it is guarded by the same transaction-local capability.
create or replace function scoring_authority.guard_completed_history_append_only()
returns trigger
language plpgsql
set search_path = scoring_authority, public, extensions, pg_temp
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode = '42501', message = 'COMPLETED_HISTORY_IS_IMMUTABLE';
  end if;
  if current_setting('scoring_authority.completed_history_import', true) <> 'on' then
    raise exception using errcode = '42501', message = 'COMPLETED_HISTORY_IMPORT_RPC_REQUIRED';
  end if;
  return new;
end;
$$;

create or replace function scoring_authority.guard_completed_history_pointer()
returns trigger
language plpgsql
set search_path = scoring_authority, public, extensions, pg_temp
as $$
begin
  if current_setting('scoring_authority.completed_history_import', true) <> 'on' then
    raise exception using errcode = '42501', message = 'COMPLETED_HISTORY_IMPORT_RPC_REQUIRED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Stable course identity metadata may be corrected only as part of the same
-- Director-authorized correction transaction that appends a new revision.
-- Deletion is never supported, and ordinary writes remain denied.
create or replace function scoring_authority.guard_completed_history_course_identity()
returns trigger
language plpgsql
set search_path = scoring_authority, public, extensions, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'COMPLETED_HISTORY_IS_IMMUTABLE';
  end if;
  if current_setting('scoring_authority.completed_history_import', true) <> 'on' then
    raise exception using errcode = '42501', message = 'COMPLETED_HISTORY_IMPORT_RPC_REQUIRED';
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'completed_history_revisions',
    'completed_history_import_runs',
    'completed_history_tournament_facts',
    'completed_history_team_facts',
    'completed_history_roster_facts',
    'completed_history_round_facts',
    'completed_history_course_appearances',
    'completed_history_matches',
    'completed_history_match_participants',
    'completed_history_scorecards',
    'completed_history_awards',
    'completed_history_record_eligibility',
    'completed_history_correction_applications'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on scoring_authority.%I '
      || 'for each row execute function scoring_authority.guard_completed_history_append_only()',
      table_name || '_append_only', table_name
    );
  end loop;
end $$;

create trigger completed_history_course_identity_guard
before insert or update or delete on scoring_authority.completed_history_course_identities
for each row execute function scoring_authority.guard_completed_history_course_identity();

create trigger completed_history_current_revision_guard
before insert or update or delete on scoring_authority.completed_history_current_revisions
for each row execute function scoring_authority.guard_completed_history_pointer();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'completed_history_revisions',
    'completed_history_current_revisions',
    'completed_history_import_runs',
    'completed_history_course_identities',
    'completed_history_tournament_facts',
    'completed_history_team_facts',
    'completed_history_roster_facts',
    'completed_history_round_facts',
    'completed_history_course_appearances',
    'completed_history_matches',
    'completed_history_match_participants',
    'completed_history_scorecards',
    'completed_history_awards',
    'completed_history_record_eligibility',
    'completed_history_correction_applications'
  ] loop
    execute format('alter table scoring_authority.%I enable row level security', table_name);
    execute format(
      'revoke all on table scoring_authority.%I from public, anon, authenticated, service_role',
      table_name
    );
  end loop;
end $$;

revoke all on function scoring_authority.guard_completed_history_append_only()
  from public, anon, authenticated, service_role;
revoke all on function scoring_authority.guard_completed_history_pointer()
  from public, anon, authenticated, service_role;
revoke all on function scoring_authority.guard_completed_history_course_identity()
  from public, anon, authenticated, service_role;

-- Pure validation used by the protected importer.  It performs no writes and
-- returns normalized counts/score reconciliation evidence to the caller.
create or replace function scoring_authority.validate_completed_history_payload(input jsonb)
returns jsonb
language plpgsql
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  body jsonb := input->'payload';
  tournament_value jsonb := input->'payload'->'tournament';
  target_year integer;
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  team_count integer;
  player_count integer;
  roster_count integer;
  round_count integer;
  course_count integer;
  appearance_count integer;
  match_count integer;
  participant_count integer;
  scorecard_count integer;
  award_count integer;
  eligibility_count integer;
  correction_count integer;
  complete_scorecards integer;
  partial_scorecards integer;
  unavailable_scorecards integer;
  recorded_hole_rows integer;
  all_points_recorded boolean;
  derived_team_1 numeric;
  derived_team_2 numeric;
  official_team_1 numeric;
  official_team_2 numeric;
  total_awarded numeric;
  expected_configured numeric;
  score_availability text;
  champion_side integer;
  champion_team text;
  counts_value jsonb;
begin
  begin target_year := (input->>'tournament_year')::integer;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_REQUIRED');
  end;
  if target_year not between 2017 and 2025
     or target_tournament <> target_year::text then
    return jsonb_build_object('ok', false, 'code', 'COMPLETED_HISTORY_YEAR_SCOPE_INVALID');
  end if;
  if jsonb_typeof(body) <> 'object'
     or jsonb_typeof(tournament_value) <> 'object'
     or tournament_value->>'tournament_id' <> target_tournament
     or tournament_value->>'tournament_year' <> target_year::text
     or btrim(coalesce(tournament_value->>'name', '')) = '' then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_TOURNAMENT_CONTRACT_INVALID');
  end if;
  if jsonb_typeof(body->'teams') <> 'array'
     or jsonb_typeof(body->'players') <> 'array'
     or jsonb_typeof(body->'roster') <> 'array'
     or jsonb_typeof(body->'rounds') <> 'array'
     or jsonb_typeof(body->'courses') <> 'array'
     or jsonb_typeof(body->'course_appearances') <> 'array'
     or jsonb_typeof(body->'matches') <> 'array'
     or jsonb_typeof(body->'match_participants') <> 'array'
     or jsonb_typeof(body->'scorecards') <> 'array'
     or jsonb_typeof(body->'awards') <> 'array'
     or jsonb_typeof(body->'record_eligibility') <> 'array'
     or jsonb_typeof(body->'corrections') <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_NORMALIZED_ARRAYS_REQUIRED');
  end if;

  team_count := jsonb_array_length(body->'teams');
  player_count := jsonb_array_length(body->'players');
  roster_count := jsonb_array_length(body->'roster');
  round_count := jsonb_array_length(body->'rounds');
  course_count := jsonb_array_length(body->'courses');
  appearance_count := jsonb_array_length(body->'course_appearances');
  match_count := jsonb_array_length(body->'matches');
  participant_count := jsonb_array_length(body->'match_participants');
  scorecard_count := jsonb_array_length(body->'scorecards');
  award_count := jsonb_array_length(body->'awards');
  eligibility_count := jsonb_array_length(body->'record_eligibility');
  correction_count := jsonb_array_length(body->'corrections');

  if team_count <> 2 or player_count = 0 or roster_count = 0
     or round_count <> 3 or course_count = 0 or appearance_count <> 3
     or match_count = 0 or participant_count = 0 then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_CANONICAL_SET_INCOMPLETE');
  end if;
  if (select count(distinct value->>'team_id') from jsonb_array_elements(body->'teams')) <> team_count
     or (select count(distinct value->>'team_side') from jsonb_array_elements(body->'teams')) <> 2
     or exists (
       select 1 from jsonb_array_elements(body->'teams') value
       where btrim(coalesce(value->>'team_id', '')) = ''
          or btrim(coalesce(value->>'name', '')) = ''
          or coalesce(value->>'team_side', '') not in ('1', '2')
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_TEAM_IDENTITY_INVALID');
  end if;
  if (select count(distinct value->>'player_id') from jsonb_array_elements(body->'players')) <> player_count
     or exists (
       select 1 from jsonb_array_elements(body->'players') value
       where btrim(coalesce(value->>'player_id', '')) = ''
          or btrim(coalesce(value->>'display_name', '')) = ''
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_PLAYER_IDENTITY_INVALID');
  end if;
  if (select count(distinct value->>'player_id') from jsonb_array_elements(body->'roster')) <> roster_count
     or exists (
       select 1 from jsonb_array_elements(body->'roster') roster
       where btrim(coalesce(roster->>'player_id', '')) = ''
          or btrim(coalesce(roster->>'team_id', '')) = ''
          or btrim(coalesce(roster->>'source_roster_key', '')) = ''
          or not exists (
            select 1 from jsonb_array_elements(body->'players') player
            where player->>'player_id' = roster->>'player_id'
          )
          or not exists (
            select 1 from jsonb_array_elements(body->'teams') team
            where team->>'team_id' = roster->>'team_id'
              and team->>'team_side' = roster->>'team_side'
          )
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_ROSTER_IDENTITY_INVALID');
  end if;
  if (select count(distinct value->>'round_number') from jsonb_array_elements(body->'rounds')) <> round_count
     or exists (
       select 1 from jsonb_array_elements(body->'rounds') value
       where coalesce(value->>'format', '') not in ('BB', 'SC', 'SI')
          or nullif(value->>'round_number', '')::integer not between 1 and 99
          or nullif(value->>'team_size', '')::integer <= 0
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_ROUND_CONTRACT_INVALID');
  end if;
  if (select count(distinct value->>'course_id') from jsonb_array_elements(body->'courses')) <> course_count
     or exists (
       select 1 from jsonb_array_elements(body->'courses') value
       where btrim(coalesce(value->>'course_id', '')) = ''
          or btrim(coalesce(value->>'canonical_name', '')) = ''
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_COURSE_IDENTITY_INVALID');
  end if;
  if (select count(distinct value->>'appearance_id') from jsonb_array_elements(body->'course_appearances')) <> appearance_count
     or (select count(distinct value->>'round_number') from jsonb_array_elements(body->'course_appearances')) <> round_count
     or exists (
       select 1 from jsonb_array_elements(body->'course_appearances') appearance
       where btrim(coalesce(appearance->>'appearance_id', '')) = ''
          or btrim(coalesce(appearance->>'source_course_id', '')) = ''
          or btrim(coalesce(appearance->>'display_name', '')) = ''
          or not exists (
            select 1 from jsonb_array_elements(body->'courses') course
            where course->>'course_id' = appearance->>'course_id'
          )
          or not exists (
            select 1 from jsonb_array_elements(body->'rounds') round_value
            where round_value->>'round_number' = appearance->>'round_number'
          )
          or jsonb_typeof(coalesce(appearance->'hole_definitions', '[]'::jsonb)) <> 'array'
          or jsonb_array_length(coalesce(appearance->'hole_definitions', '[]'::jsonb)) not in (0, 18)
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_COURSE_APPEARANCE_INVALID');
  end if;
  if (select count(distinct value->>'match_id') from jsonb_array_elements(body->'matches')) <> match_count
     or (select count(distinct value->>'source_match_key') from jsonb_array_elements(body->'matches')) <> match_count
     or exists (
       select 1 from jsonb_array_elements(body->'matches') match_value
       where btrim(coalesce(match_value->>'match_id', '')) = ''
          or btrim(coalesce(match_value->>'source_match_key', '')) = ''
          or coalesce(match_value->>'format', '') not in ('BB', 'SC', 'SI')
          or coalesce(match_value->>'lifecycle', '') <> 'FINAL'
          or coalesce(match_value->>'completion_state', '') not in ('COMPLETE', 'CONCEDED', 'FORFEIT', 'LEGACY_FINAL')
          or coalesce(match_value->>'scorecard_coverage', '') not in ('COMPLETE', 'PARTIAL', 'UNAVAILABLE')
          or coalesce(match_value->>'result_winner', '') not in ('Team 1', 'Team 2', 'Halved')
          or coalesce(match_value->>'points_availability', '') not in ('RECORDED', 'UNAVAILABLE')
          or not exists (
            select 1 from jsonb_array_elements(body->'rounds') round_value
            where round_value->>'round_number' = match_value->>'round_number'
              and round_value->>'format' = match_value->>'format'
          )
          or not exists (
            select 1 from jsonb_array_elements(body->'course_appearances') appearance
            where appearance->>'appearance_id' = match_value->>'course_appearance_id'
              and appearance->>'round_number' = match_value->>'round_number'
          )
          or (match_value->>'points_availability' = 'RECORDED' and (
            match_value->>'team_1_points' is null or match_value->>'team_2_points' is null
            or match_value->>'points_available' is null
          ))
          or (match_value->>'points_availability' = 'UNAVAILABLE' and (
            match_value->>'team_1_points' is not null or match_value->>'team_2_points' is not null
          ))
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_MATCH_CONTRACT_INVALID');
  end if;
  if exists (
    select 1
    from jsonb_array_elements(body->'matches') match_value
    join jsonb_array_elements(body->'rounds') round_value
      on round_value->>'round_number' = match_value->>'round_number'
    where match_value->>'points_availability' = 'RECORDED'
      and (
        (match_value->>'team_1_points')::numeric + (match_value->>'team_2_points')::numeric
          is distinct from (match_value->>'points_available')::numeric
        or (match_value->>'points_available')::numeric
          is distinct from (round_value->>'points_per_match')::numeric
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_MATCH_POINT_RECONCILIATION_FAILED');
  end if;
  if exists (
       select 1 from (
         select value->>'match_id', value->>'player_id', count(*)
         from jsonb_array_elements(body->'match_participants') value
         group by 1, 2 having count(*) > 1
       ) duplicate_participants
     )
     or exists (
       select 1 from jsonb_array_elements(body->'match_participants') participant
       where not exists (
         select 1 from jsonb_array_elements(body->'matches') match_value
         where match_value->>'match_id' = participant->>'match_id'
       )
       or not exists (
         select 1 from jsonb_array_elements(body->'roster') roster
         where roster->>'player_id' = participant->>'player_id'
           and roster->>'team_side' = participant->>'team_side'
       )
       or coalesce(participant->>'team_side', '') not in ('1', '2')
       or coalesce(participant->>'player_slot', '') not in ('1', '2')
     )
     or exists (
       select 1 from jsonb_array_elements(body->'matches') match_value
       where (
         select count(*) from jsonb_array_elements(body->'match_participants') participant
         where participant->>'match_id' = match_value->>'match_id'
       ) <> case when match_value->>'format' = 'SI' then 2 else 4 end
       or exists (
         select 1 from generate_series(1, 2) side(team_side)
         where (
           select count(*) from jsonb_array_elements(body->'match_participants') participant
           where participant->>'match_id' = match_value->>'match_id'
             and participant->>'team_side' = side.team_side::text
         ) <> case when match_value->>'format' = 'SI' then 1 else 2 end
       )
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_MATCH_PARTICIPANTS_INVALID');
  end if;
  if eligibility_count <> participant_count
     or exists (
       select 1 from (
         select value->>'match_id', value->>'player_id', count(*)
         from jsonb_array_elements(body->'record_eligibility') value
         group by 1, 2 having count(*) > 1
       ) duplicate_eligibility
     )
     or exists (
       select 1 from jsonb_array_elements(body->'match_participants') participant
       where not exists (
         select 1 from jsonb_array_elements(body->'record_eligibility') eligibility
         where eligibility->>'match_id' = participant->>'match_id'
           and eligibility->>'player_id' = participant->>'player_id'
           and jsonb_typeof(eligibility->'is_record_eligible') = 'boolean'
           and btrim(coalesce(eligibility->>'reason_code', '')) <> ''
       )
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_RECORD_ELIGIBILITY_INVALID');
  end if;
  if scorecard_count <> (select count(distinct value->>'scorecard_id') from jsonb_array_elements(body->'scorecards'))
     or exists (
       select 1 from jsonb_array_elements(body->'scorecards') scorecard
       where btrim(coalesce(scorecard->>'scorecard_id', '')) = ''
          or coalesce(scorecard->>'entity_kind', '') not in ('PLAYER', 'PAIRING', 'TEAM')
          or coalesce(scorecard->>'coverage_status', '') not in ('COMPLETE', 'PARTIAL', 'UNAVAILABLE')
          or not exists (
            select 1 from jsonb_array_elements(body->'matches') match_value
            where match_value->>'match_id' = scorecard->>'match_id'
          )
          or (scorecard->>'player_id' is not null and not exists (
            select 1 from jsonb_array_elements(body->'roster') roster
            where roster->>'player_id' = scorecard->>'player_id'
          ))
          or jsonb_typeof(coalesce(scorecard->'hole_values', '[]'::jsonb)) <> 'array'
          or (scorecard->>'coverage_status' = 'COMPLETE' and (
            (scorecard->>'recorded_holes')::integer <> 18
            or jsonb_array_length(scorecard->'hole_values') <> 18
          ))
          or (scorecard->>'coverage_status' = 'PARTIAL' and (
            (scorecard->>'recorded_holes')::integer not between 1 and 17
            or jsonb_array_length(scorecard->'hole_values') <> 18
          ))
          or (scorecard->>'coverage_status' = 'UNAVAILABLE' and (
            (scorecard->>'recorded_holes')::integer <> 0
            or jsonb_array_length(scorecard->'hole_values') not in (0, 18)
          ))
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_SCORECARD_CONTRACT_INVALID');
  end if;
  if award_count <> (select count(distinct value->>'award_id') from jsonb_array_elements(body->'awards'))
     or exists (
       select 1 from jsonb_array_elements(body->'awards') award
       where btrim(coalesce(award->>'award_id', '')) = ''
          or btrim(coalesce(award->>'award_type', '')) = ''
          or btrim(coalesce(award->>'label', '')) = ''
          or coalesce(award->>'recipient_kind', '') not in ('PLAYER', 'TEAM', 'TEXT', 'UNAVAILABLE')
          or (award->>'recipient_kind' = 'PLAYER' and not exists (
            select 1 from jsonb_array_elements(body->'players') player
            where player->>'player_id' = award->>'winner_player_id'
          ))
          or (award->>'recipient_kind' = 'TEAM' and not exists (
            select 1 from jsonb_array_elements(body->'teams') team
            where team->>'team_id' = award->>'winner_team_id'
          ))
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_AWARD_CONTRACT_INVALID');
  end if;

  select count(*) filter (where value->>'coverage_status' = 'COMPLETE'),
         count(*) filter (where value->>'coverage_status' = 'PARTIAL'),
         count(*) filter (where value->>'coverage_status' = 'UNAVAILABLE'),
         coalesce(sum((value->>'recorded_holes')::integer), 0)
  into complete_scorecards, partial_scorecards, unavailable_scorecards, recorded_hole_rows
  from jsonb_array_elements(body->'scorecards') value;
  all_points_recorded := not exists (
    select 1 from jsonb_array_elements(body->'matches') value
    where value->>'points_availability' <> 'RECORDED'
  );
  if all_points_recorded then
    select coalesce(sum((value->>'team_1_points')::numeric), 0),
           coalesce(sum((value->>'team_2_points')::numeric), 0)
    into derived_team_1, derived_team_2
    from jsonb_array_elements(body->'matches') value;
  end if;
  score_availability := coalesce(tournament_value->>'score_availability', '');
  official_team_1 := nullif(tournament_value->>'official_team_1_points', '')::numeric;
  official_team_2 := nullif(tournament_value->>'official_team_2_points', '')::numeric;
  total_awarded := nullif(tournament_value->>'total_awarded_points', '')::numeric;
  expected_configured := nullif(tournament_value->>'expected_configured_points', '')::numeric;
  champion_side := nullif(tournament_value->>'champion_team_side', '')::integer;
  champion_team := nullif(btrim(coalesce(tournament_value->>'champion_team_id', '')), '');
  if coalesce(tournament_value->>'lifecycle', '') <> 'FINAL'
     or score_availability not in ('RECORDED', 'UNAVAILABLE')
     or champion_side not in (1, 2) or champion_team is null
     or not exists (
       select 1 from jsonb_array_elements(body->'teams') team
       where team->>'team_id' = champion_team and team->>'team_side' = champion_side::text
     ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_FINAL_RESULT_INVALID');
  end if;
  if score_availability = 'RECORDED' and (
       not all_points_recorded
       or official_team_1 is distinct from derived_team_1
       or official_team_2 is distinct from derived_team_2
       or total_awarded is distinct from derived_team_1 + derived_team_2
       or (expected_configured is not null and expected_configured is distinct from total_awarded)
       or (official_team_1 > official_team_2 and champion_side <> 1)
       or (official_team_2 > official_team_1 and champion_side <> 2)
     ) then
    return jsonb_build_object(
      'ok', false, 'code', 'HISTORICAL_FINAL_SCORE_RECONCILIATION_FAILED',
      'derived', jsonb_build_object(
        'team_1_points', derived_team_1, 'team_2_points', derived_team_2,
        'total_awarded_points', derived_team_1 + derived_team_2
      )
    );
  elsif score_availability = 'UNAVAILABLE' and (
    official_team_1 is not null or official_team_2 is not null or total_awarded is not null
  ) then
    return jsonb_build_object('ok', false, 'code', 'UNAVAILABLE_SCORE_MUST_REMAIN_NULL');
  end if;

  counts_value := jsonb_build_object(
    'teams', team_count, 'players', player_count, 'roster', roster_count,
    'rounds', round_count, 'courses', course_count, 'course_appearances', appearance_count,
    'matches', match_count, 'match_participants', participant_count,
    'scorecards', scorecard_count, 'complete_scorecards', complete_scorecards,
    'partial_scorecards', partial_scorecards, 'unavailable_scorecards', unavailable_scorecards,
    'recorded_hole_rows', recorded_hole_rows, 'awards', award_count,
    'record_eligibility', eligibility_count,
    'record_exclusions', (
      select count(*) from jsonb_array_elements(body->'record_eligibility') value
      where coalesce((value->>'is_record_eligible')::boolean, false) is false
    ),
    'corrections', correction_count
  );
  return jsonb_build_object(
    'ok', true,
    'counts', counts_value,
    'derived_team_1_points', derived_team_1,
    'derived_team_2_points', derived_team_2,
    'score_availability', score_availability,
    'champion_team_side', champion_side,
    'champion_team_id', champion_team
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('ok', false, 'code', 'HISTORICAL_NUMERIC_CONTRACT_INVALID');
end;
$$;

revoke all on function scoring_authority.validate_completed_history_payload(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.import_preview_completed_history_year(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  preview_project constant text := 'idgigvjjqkfbqjeredpb';
  historical_source constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  environment_value text := upper(btrim(coalesce(input->>'environment', '')));
  project_value text := btrim(coalesce(input->>'project_ref', ''));
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  actor text := btrim(coalesce(input->>'actor_id', ''));
  authorization_value jsonb := input->'director_authorization';
  authorization_id text := btrim(coalesce(input #>> '{director_authorization,authorization_id}', ''));
  authorization_time timestamptz;
  target_year integer;
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  source_fingerprint_value text := lower(btrim(coalesce(input->>'source_fingerprint', '')));
  payload_fingerprint_value text := lower(btrim(coalesce(input->>'payload_fingerprint', '')));
  payload_body jsonb := input->'payload';
  tournament_value jsonb;
  expected_source_fingerprint text := lower(btrim(coalesce(input #>> '{correction,expected_source_fingerprint}', '')));
  correction_reason_value text := btrim(coalesce(input #>> '{correction,reason}', ''));
  validation jsonb;
  current_revision scoring_authority.completed_history_revisions%rowtype;
  previous_revision_id_value uuid;
  revision_id_value uuid := gen_random_uuid();
  import_run_id_value uuid := gen_random_uuid();
  revision_number_value bigint := 1;
  operation_value text := 'INITIAL_IMPORT';
  database_payload_fingerprint_value text;
  request_fingerprint_value text;
  canonical_counts_value jsonb;
  certification_value jsonb;
  item jsonb;
begin
  if environment_value <> 'PREVIEW'
     or project_value <> preview_project
     or source_workbook <> historical_source then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_COMPLETED_HISTORY_SCOPE_REQUIRED');
  end if;
  if jsonb_typeof(authorization_value) <> 'object'
     or coalesce((authorization_value->>'authorized')::boolean, false) is not true
     or authorization_value->>'scope' <> 'COMPLETED_HISTORY_IMPORT'
     or authorization_value->>'actor_id' <> actor
     or length(authorization_id) < 8 then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_HISTORY_IMPORT_AUTHORIZATION_REQUIRED');
  end if;
  begin
    authorization_time := (authorization_value->>'authorized_at')::timestamptz;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_HISTORY_IMPORT_AUTHORIZATION_REQUIRED');
  end;
  if authorization_time < now() - interval '15 minutes'
     or authorization_time > now() + interval '1 minute' then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_HISTORY_IMPORT_AUTHORIZATION_EXPIRED');
  end if;
  begin target_year := (input->>'tournament_year')::integer;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_REQUIRED');
  end;
  if actor = ''
     or target_year not between 2017 and 2025
     or target_tournament <> target_year::text
     or source_fingerprint_value !~ '^[0-9a-f]{64}$'
     or payload_fingerprint_value !~ '^[0-9a-f]{64}$'
     or btrim(coalesce(input->>'import_contract_version', '')) = ''
     or btrim(coalesce(input->>'correction_set_version', '')) = ''
     or btrim(coalesce(input->>'importer_version', '')) = ''
     or jsonb_typeof(coalesce(input->'source_counts', '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(input->'certification', '{}'::jsonb)) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETED_HISTORY_PROVENANCE_REQUIRED');
  end if;

  validation := scoring_authority.validate_completed_history_payload(input);
  if coalesce((validation->>'ok')::boolean, false) is not true then
    return validation;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(payload_body->'courses') incoming
    join scoring_authority.completed_history_course_identities existing
      on existing.course_id = incoming->>'course_id'
    where (
      lower(btrim(existing.canonical_name))
        <> lower(btrim(coalesce(incoming->>'canonical_name', '')))
      or lower(btrim(coalesce(existing.canonical_location, '')))
        <> lower(btrim(coalesce(incoming->>'canonical_location', '')))
    )
      and (expected_source_fingerprint = '' or length(correction_reason_value) < 10)
  ) then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_COURSE_IDENTITY_CONFLICT');
  end if;
  canonical_counts_value := validation->'counts';
  certification_value := coalesce(input->'certification', '{}'::jsonb) || jsonb_build_object(
    'database_validated', true,
    'final_score_reconciled', true,
    'champion_reconciled', true,
    'participant_structure_reconciled', true,
    'missing_scorecards_are_not_zeroes', true,
    'derived_team_1_points', validation->'derived_team_1_points',
    'derived_team_2_points', validation->'derived_team_2_points'
  );
  tournament_value := payload_body->'tournament';

  perform pg_advisory_xact_lock(hashtext('completed-history-' || target_year::text));
  select revision.* into current_revision
  from scoring_authority.completed_history_current_revisions current_pointer
  join scoring_authority.completed_history_revisions revision
    on revision.revision_id = current_pointer.revision_id
  where current_pointer.tournament_year = target_year
  for update of current_pointer;

  database_payload_fingerprint_value := encode(
    extensions.digest(payload_body::text, 'sha256'), 'hex'
  );
  request_fingerprint_value := encode(
    extensions.digest((input - 'director_authorization' - 'correction')::text, 'sha256'), 'hex'
  );

  if current_revision.revision_id is not null then
    if current_revision.source_fingerprint = source_fingerprint_value
       and current_revision.payload_fingerprint = payload_fingerprint_value
       and current_revision.database_payload_fingerprint = database_payload_fingerprint_value then
      return jsonb_build_object(
        'ok', true, 'changed', false, 'duplicate', true,
        'tournament_id', target_tournament, 'tournament_year', target_year,
        'revision_id', current_revision.revision_id,
        'revision_number', current_revision.revision_number,
        'source_fingerprint', current_revision.source_fingerprint,
        'payload_fingerprint', current_revision.payload_fingerprint,
        'database_payload_fingerprint', current_revision.database_payload_fingerprint,
        'canonical_counts', current_revision.canonical_counts,
        'certification', current_revision.certification
      );
    end if;
    if expected_source_fingerprint <> current_revision.source_fingerprint
       or length(correction_reason_value) < 10 then
      return jsonb_build_object(
        'ok', false, 'code', 'HISTORICAL_RECONCILIATION_REQUIRED',
        'current_revision_id', current_revision.revision_id,
        'current_source_fingerprint', current_revision.source_fingerprint,
        'incoming_source_fingerprint', source_fingerprint_value,
        'current_payload_fingerprint', current_revision.payload_fingerprint,
        'incoming_payload_fingerprint', payload_fingerprint_value
      );
    end if;
    operation_value := 'CORRECTION';
    previous_revision_id_value := current_revision.revision_id;
    revision_number_value := current_revision.revision_number + 1;
  elsif target_year > 2017 and not exists (
    select 1 from scoring_authority.completed_history_current_revisions
    where tournament_year = target_year - 1
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'PRIOR_HISTORY_YEAR_NOT_CERTIFIED',
      'required_year', target_year - 1
    );
  end if;

  -- A transaction-local capability is required by every new-table trigger.
  -- It is set only after Preview/project/source/Director checks and validation.
  perform set_config('scoring_authority.completed_history_import', 'on', true);
  if exists (
    select 1 from scoring_authority.tournaments
    where tournament_year = target_year and tournament_id <> target_tournament
  ) then
    raise exception using errcode = '23505', message = 'HISTORICAL_TOURNAMENT_IDENTITY_CONFLICT';
  end if;

  insert into scoring_authority.tournaments (
    tournament_id, tournament_year, name, source_workbook_id, scoring_authority,
    imported_at, created_at, updated_at
  ) values (
    target_tournament, target_year, tournament_value->>'name', historical_source,
    'SUPABASE', now(), now(), now()
  )
  on conflict (tournament_id) do update set
    name = excluded.name,
    source_workbook_id = excluded.source_workbook_id,
    scoring_authority = 'SUPABASE',
    imported_at = now(), updated_at = now();

  for item in select value from jsonb_array_elements(payload_body->'players') loop
    insert into scoring_authority.players (player_id, display_name, source_payload)
    values (
      item->>'player_id', item->>'display_name',
      coalesce(item->'source_payload', '{}'::jsonb)
        || jsonb_build_object('completed_history_last_seen_year', target_year)
    )
    on conflict (player_id) do update set
      source_payload = scoring_authority.players.source_payload
        || coalesce(excluded.source_payload, '{}'::jsonb)
        || jsonb_build_object('completed_history_last_seen_year', target_year),
      updated_at = now();
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'courses') loop
    insert into scoring_authority.completed_history_course_identities (
      course_id, canonical_name, canonical_location, first_seen_year, identity_payload
    ) values (
      item->>'course_id', item->>'canonical_name', nullif(item->>'canonical_location', ''),
      target_year, coalesce(item->'identity_payload', '{}'::jsonb)
    ) on conflict (course_id) do update set
      canonical_name = excluded.canonical_name,
      canonical_location = excluded.canonical_location,
      identity_payload = scoring_authority.completed_history_course_identities.identity_payload
        || excluded.identity_payload
    where expected_source_fingerprint <> '' and length(correction_reason_value) >= 10;
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'teams') loop
    insert into scoring_authority.teams (
      tournament_id, team_id, team_side, name, source_payload
    ) values (
      target_tournament, item->>'team_id', (item->>'team_side')::integer,
      item->>'name', coalesce(item->'source_payload', '{}'::jsonb)
    )
    on conflict (tournament_id, team_id) do update set
      team_side = excluded.team_side, name = excluded.name,
      source_payload = excluded.source_payload;
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'roster') loop
    insert into scoring_authority.tournament_players (
      tournament_id, player_id, team_id, team_side, participation_status,
      source_roster_key, source_payload
    ) values (
      target_tournament, item->>'player_id', item->>'team_id',
      (item->>'team_side')::integer,
      coalesce(item->>'participation_status', 'ACTIVE'),
      item->>'source_roster_key', coalesce(item->'source_payload', '{}'::jsonb)
    )
    on conflict (tournament_id, player_id) do update set
      team_id = excluded.team_id, team_side = excluded.team_side,
      participation_status = excluded.participation_status,
      source_roster_key = excluded.source_roster_key,
      source_payload = excluded.source_payload, updated_at = now();
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'rounds') loop
    insert into scoring_authority.rounds (
      tournament_id, round_number, format, name, handicap_allowance, status, source_payload
    ) values (
      target_tournament, (item->>'round_number')::integer, item->>'format',
      coalesce(nullif(item->>'name', ''), 'Round ' || item->>'round_number'),
      nullif(item->>'handicap_allowance', '')::numeric, 'FINAL',
      coalesce(item->'source_payload', '{}'::jsonb)
    )
    on conflict (tournament_id, round_number) do update set
      format = excluded.format, name = excluded.name,
      handicap_allowance = excluded.handicap_allowance, status = 'FINAL',
      source_payload = excluded.source_payload;
  end loop;

  insert into scoring_authority.completed_history_revisions (
    revision_id, project_ref, source_workbook_id, tournament_id, tournament_year,
    revision_number, source_fingerprint, payload_fingerprint,
    database_payload_fingerprint, import_contract_version, correction_set_version,
    importer_version, source_counts, canonical_counts, certification, operation,
    previous_revision_id, correction_reason, imported_by
  ) values (
    revision_id_value, preview_project, historical_source, target_tournament, target_year,
    revision_number_value, source_fingerprint_value, payload_fingerprint_value,
    database_payload_fingerprint_value, input->>'import_contract_version',
    input->>'correction_set_version', input->>'importer_version',
    coalesce(input->'source_counts', '{}'::jsonb), canonical_counts_value,
    certification_value, operation_value, previous_revision_id_value,
    case when operation_value = 'CORRECTION' then correction_reason_value else null end,
    actor
  );

  insert into scoring_authority.completed_history_tournament_facts (
    revision_id, tournament_id, tournament_year, start_date, end_date, destination,
    timezone, lifecycle, score_availability, official_team_1_points,
    official_team_2_points, total_awarded_points, expected_configured_points,
    champion_team_side, champion_team_id, team_size, source_payload
  ) values (
    revision_id_value, target_tournament, target_year,
    nullif(tournament_value->>'start_date', '')::date,
    nullif(tournament_value->>'end_date', '')::date,
    nullif(tournament_value->>'destination', ''), nullif(tournament_value->>'timezone', ''),
    'FINAL', tournament_value->>'score_availability',
    nullif(tournament_value->>'official_team_1_points', '')::numeric,
    nullif(tournament_value->>'official_team_2_points', '')::numeric,
    nullif(tournament_value->>'total_awarded_points', '')::numeric,
    nullif(tournament_value->>'expected_configured_points', '')::numeric,
    (tournament_value->>'champion_team_side')::integer,
    tournament_value->>'champion_team_id',
    nullif(tournament_value->>'team_size', '')::integer,
    coalesce(tournament_value->'source_payload', '{}'::jsonb)
  );

  for item in select value from jsonb_array_elements(payload_body->'teams') loop
    insert into scoring_authority.completed_history_team_facts (
      revision_id, tournament_id, team_id, team_side, name, captain_player_id,
      logo_key, presentation_identity, source_payload
    ) values (
      revision_id_value, target_tournament, item->>'team_id',
      (item->>'team_side')::integer, item->>'name',
      nullif(item->>'captain_player_id', ''), nullif(item->>'logo_key', ''),
      coalesce(item->'presentation_identity', '{}'::jsonb),
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'roster') loop
    insert into scoring_authority.completed_history_roster_facts (
      revision_id, tournament_id, player_id, display_name, team_id, team_side,
      participation_status, is_captain, is_governor, tournament_handicap, source_payload
    ) values (
      revision_id_value, target_tournament, item->>'player_id',
      coalesce(nullif(item->>'display_name', ''), (
        select p.display_name from scoring_authority.players p where p.player_id = item->>'player_id'
      )), item->>'team_id', (item->>'team_side')::integer,
      coalesce(item->>'participation_status', 'ACTIVE'),
      coalesce((item->>'is_captain')::boolean, false),
      (item->>'is_governor')::boolean,
      nullif(item->>'tournament_handicap', '')::numeric,
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'rounds') loop
    insert into scoring_authority.completed_history_round_facts (
      revision_id, tournament_id, round_number, format, name, team_size,
      points_per_match, handicap_allowance, course_appearance_id,
      scoring_semantics, source_payload
    ) values (
      revision_id_value, target_tournament, (item->>'round_number')::integer,
      item->>'format', coalesce(nullif(item->>'name', ''), 'Round ' || item->>'round_number'),
      (item->>'team_size')::integer, nullif(item->>'points_per_match', '')::numeric,
      nullif(item->>'handicap_allowance', '')::numeric,
      nullif(item->>'course_appearance_id', ''),
      coalesce(item->'scoring_semantics', '{}'::jsonb),
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'course_appearances') loop
    insert into scoring_authority.completed_history_course_appearances (
      revision_id, tournament_id, appearance_id, round_number, course_id,
      source_course_id, display_name, location, tee, rating, slope, yardage,
      par, hole_definitions, source_payload
    ) values (
      revision_id_value, target_tournament, item->>'appearance_id',
      (item->>'round_number')::integer, item->>'course_id', item->>'source_course_id',
      item->>'display_name', nullif(item->>'location', ''), nullif(item->>'tee', ''),
      nullif(item->>'rating', '')::numeric, nullif(item->>'slope', '')::integer,
      nullif(item->>'yardage', '')::integer, nullif(item->>'par', '')::integer,
      coalesce(item->'hole_definitions', '[]'::jsonb),
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'matches') loop
    insert into scoring_authority.completed_history_matches (
      revision_id, tournament_id, match_id, round_number, format,
      course_appearance_id, lifecycle, completion_state, scorecard_coverage,
      result, result_winner, team_1_points, team_2_points, points_available,
      points_availability, source_match_key, source_payload
    ) values (
      revision_id_value, target_tournament, item->>'match_id',
      (item->>'round_number')::integer, item->>'format', item->>'course_appearance_id',
      'FINAL', item->>'completion_state', item->>'scorecard_coverage',
      item->>'result', item->>'result_winner',
      nullif(item->>'team_1_points', '')::numeric,
      nullif(item->>'team_2_points', '')::numeric,
      nullif(item->>'points_available', '')::numeric,
      item->>'points_availability', item->>'source_match_key',
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'match_participants') loop
    insert into scoring_authority.completed_history_match_participants (
      revision_id, match_id, player_id, team_side, player_slot,
      tournament_handicap, applied_handicap, applied_strokes, source_payload
    ) values (
      revision_id_value, item->>'match_id', item->>'player_id',
      (item->>'team_side')::integer, (item->>'player_slot')::integer,
      nullif(item->>'tournament_handicap', '')::numeric,
      nullif(item->>'applied_handicap', '')::numeric,
      nullif(item->>'applied_strokes', '')::numeric,
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'scorecards') loop
    insert into scoring_authority.completed_history_scorecards (
      revision_id, scorecard_id, match_id, entity_kind, player_id, team_side,
      player_slot, coverage_status, recorded_holes, hole_values, score_semantics,
      source_payload
    ) values (
      revision_id_value, item->>'scorecard_id', item->>'match_id',
      item->>'entity_kind', nullif(item->>'player_id', ''),
      nullif(item->>'team_side', '')::integer, nullif(item->>'player_slot', '')::integer,
      item->>'coverage_status', (item->>'recorded_holes')::integer,
      coalesce(item->'hole_values', '[]'::jsonb),
      coalesce(item->'score_semantics', '{}'::jsonb),
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'awards') loop
    insert into scoring_authority.completed_history_awards (
      revision_id, tournament_id, award_id, award_type, label, recipient_kind,
      winner_player_id, winner_team_id, recipient_display, source_payload
    ) values (
      revision_id_value, target_tournament, item->>'award_id', item->>'award_type',
      item->>'label', item->>'recipient_kind', nullif(item->>'winner_player_id', ''),
      nullif(item->>'winner_team_id', ''), nullif(item->>'recipient_display', ''),
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'record_eligibility') loop
    insert into scoring_authority.completed_history_record_eligibility (
      revision_id, match_id, player_id, is_record_eligible, reason_code, source_payload
    ) values (
      revision_id_value, item->>'match_id', item->>'player_id',
      (item->>'is_record_eligible')::boolean, item->>'reason_code',
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload_body->'corrections') loop
    insert into scoring_authority.completed_history_correction_applications (
      revision_id, correction_id, category, description, evidence, source_payload
    ) values (
      revision_id_value, item->>'correction_id', item->>'category',
      item->>'description', coalesce(item->'evidence', '{}'::jsonb),
      coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  insert into scoring_authority.completed_history_import_runs (
    import_run_id, revision_id, tournament_id, tournament_year, operation,
    status, source_fingerprint, payload_fingerprint, request_fingerprint,
    actor_id, metadata
  ) values (
    import_run_id_value, revision_id_value, target_tournament, target_year,
    operation_value, 'SUCCEEDED', source_fingerprint_value,
    payload_fingerprint_value, request_fingerprint_value, actor,
    jsonb_build_object(
      'project_ref', preview_project, 'source_workbook_id', historical_source,
      'director_authorization_id', authorization_id,
      'import_contract_version', input->>'import_contract_version',
      'correction_set_version', input->>'correction_set_version',
      'importer_version', input->>'importer_version'
    )
  );

  insert into scoring_authority.completed_history_current_revisions (
    tournament_id, tournament_year, revision_id, project_ref,
    source_workbook_id, advanced_by, advanced_at
  ) values (
    target_tournament, target_year, revision_id_value, preview_project,
    historical_source, actor, now()
  )
  on conflict (tournament_id) do update set
    revision_id = excluded.revision_id, project_ref = excluded.project_ref,
    source_workbook_id = excluded.source_workbook_id,
    advanced_by = excluded.advanced_by, advanced_at = excluded.advanced_at;

  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (
    target_tournament,
    case when operation_value = 'INITIAL_IMPORT'
      then 'COMPLETED_HISTORY_YEAR_CERTIFIED'
      else 'COMPLETED_HISTORY_YEAR_CORRECTED' end,
    actor,
    jsonb_build_object(
      'revisionId', revision_id_value, 'revisionNumber', revision_number_value,
      'sourceFingerprint', source_fingerprint_value,
      'payloadFingerprint', payload_fingerprint_value,
      'databasePayloadFingerprint', database_payload_fingerprint_value,
      'operation', operation_value, 'canonicalCounts', canonical_counts_value,
      'directorAuthorizationId', authorization_id,
      'correctionReason', case when operation_value = 'CORRECTION'
        then correction_reason_value else null end
    )
  );

  return jsonb_build_object(
    'ok', true, 'changed', true, 'duplicate', false,
    'operation', operation_value, 'tournament_id', target_tournament,
    'tournament_year', target_year, 'revision_id', revision_id_value,
    'revision_number', revision_number_value, 'import_run_id', import_run_id_value,
    'source_fingerprint', source_fingerprint_value,
    'payload_fingerprint', payload_fingerprint_value,
    'database_payload_fingerprint', database_payload_fingerprint_value,
    'canonical_counts', canonical_counts_value, 'certification', certification_value
  );
end;
$$;

revoke all on function public.import_preview_completed_history_year(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.import_preview_completed_history_year(jsonb)
  to service_role;

-- Bounded server-side read contract for future shared consumers.  Public pages
-- are intentionally not connected to this RPC in Step 6A.
create or replace function public.read_preview_completed_history(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  preview_project constant text := 'idgigvjjqkfbqjeredpb';
  historical_source constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  mode_value text := upper(btrim(coalesce(input->>'mode', input->>'scope', 'YEARS')));
  target_year integer;
  target_player text := btrim(coalesce(input->>'player_id', ''));
  target_course text := btrim(coalesce(input->>'course_id', ''));
  target_match text := btrim(coalesce(input->>'match_id', ''));
  revision_value uuid;
  result_value jsonb;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> preview_project
     or btrim(coalesce(input->>'source_workbook_id', historical_source)) <> historical_source then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_COMPLETED_HISTORY_SCOPE_REQUIRED');
  end if;

  if mode_value = 'YEARS' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'tournament_id', revision.tournament_id,
      'tournament_year', revision.tournament_year,
      'revision_id', revision.revision_id,
      'revision_number', revision.revision_number,
      'source_fingerprint', revision.source_fingerprint,
      'payload_fingerprint', revision.payload_fingerprint,
      'import_contract_version', revision.import_contract_version,
      'correction_set_version', revision.correction_set_version,
      'importer_version', revision.importer_version,
      'certified_at', revision.certified_at,
      'canonical_counts', revision.canonical_counts,
      'certification', revision.certification,
      'tournament', jsonb_build_object(
        'name', tournament.name,
        'start_date', fact.start_date,
        'end_date', fact.end_date,
        'destination', fact.destination,
        'lifecycle', fact.lifecycle,
        'score_availability', fact.score_availability,
        'official_team_1_points', fact.official_team_1_points,
        'official_team_2_points', fact.official_team_2_points,
        'total_awarded_points', fact.total_awarded_points,
        'champion_team_side', fact.champion_team_side,
        'champion_team_id', fact.champion_team_id
      )
    ) order by revision.tournament_year), '[]'::jsonb)
    into result_value
    from scoring_authority.completed_history_current_revisions current_pointer
    join scoring_authority.completed_history_revisions revision
      on revision.revision_id = current_pointer.revision_id
    join scoring_authority.tournaments tournament
      on tournament.tournament_id = revision.tournament_id
    join scoring_authority.completed_history_tournament_facts fact
      on fact.revision_id = revision.revision_id;
  elsif mode_value = 'YEAR' then
    begin target_year := coalesce(input->>'tournament_year', input->>'year')::integer;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_REQUIRED');
    end;
    select current_pointer.revision_id into revision_value
    from scoring_authority.completed_history_current_revisions current_pointer
    where current_pointer.tournament_year = target_year;
    if revision_value is null then
      return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_NOT_CERTIFIED');
    end if;
    select jsonb_build_object(
      'revision', to_jsonb(revision),
      'tournament', to_jsonb(tournament) || to_jsonb(fact),
      'players', coalesce((
        select jsonb_agg(jsonb_build_object(
          'player_id', player.player_id,
          'display_name', player.display_name
        ) order by player.player_id)
        from scoring_authority.completed_history_roster_facts roster
        join scoring_authority.players player on player.player_id = roster.player_id
        where roster.revision_id = revision_value
      ), '[]'::jsonb),
      'teams', coalesce((
        select jsonb_agg(to_jsonb(team_fact) order by team_fact.team_side)
        from scoring_authority.completed_history_team_facts team_fact
        where team_fact.revision_id = revision_value
      ), '[]'::jsonb),
      'roster', coalesce((
        select jsonb_agg(to_jsonb(roster) order by roster.team_side, roster.display_name, roster.player_id)
        from scoring_authority.completed_history_roster_facts roster
        where roster.revision_id = revision_value
      ), '[]'::jsonb),
      'rounds', coalesce((
        select jsonb_agg(to_jsonb(round_fact) order by round_fact.round_number)
        from scoring_authority.completed_history_round_facts round_fact
        where round_fact.revision_id = revision_value
      ), '[]'::jsonb),
      'courses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'course_id', course.course_id,
          'canonical_name', course.canonical_name,
          'canonical_location', course.canonical_location
        ) order by course.course_id)
        from (
          select distinct appearance.course_id
          from scoring_authority.completed_history_course_appearances appearance
          where appearance.revision_id = revision_value
        ) year_course
        join scoring_authority.completed_history_course_identities course
          on course.course_id = year_course.course_id
      ), '[]'::jsonb),
      'course_appearances', coalesce((
        select jsonb_agg(
          to_jsonb(appearance) || jsonb_build_object(
            'canonical_name', course.canonical_name,
            'canonical_location', course.canonical_location
          ) order by appearance.round_number
        )
        from scoring_authority.completed_history_course_appearances appearance
        join scoring_authority.completed_history_course_identities course
          on course.course_id = appearance.course_id
        where appearance.revision_id = revision_value
      ), '[]'::jsonb),
      'matches', coalesce((
        select jsonb_agg(to_jsonb(match_value) order by match_value.round_number, match_value.match_id)
        from scoring_authority.completed_history_matches match_value
        where match_value.revision_id = revision_value
      ), '[]'::jsonb),
      'match_participants', coalesce((
        select jsonb_agg(to_jsonb(participant)
          order by participant.match_id, participant.team_side, participant.player_slot)
        from scoring_authority.completed_history_match_participants participant
        where participant.revision_id = revision_value
      ), '[]'::jsonb),
      'scorecards', coalesce((
        select jsonb_agg(to_jsonb(scorecard) order by scorecard.match_id, scorecard.scorecard_id)
        from scoring_authority.completed_history_scorecards scorecard
        where scorecard.revision_id = revision_value
      ), '[]'::jsonb),
      'awards', coalesce((
        select jsonb_agg(to_jsonb(award) order by award.award_type, award.award_id)
        from scoring_authority.completed_history_awards award
        where award.revision_id = revision_value
      ), '[]'::jsonb),
      'record_eligibility', coalesce((
        select jsonb_agg(to_jsonb(eligibility)
          order by eligibility.match_id, eligibility.player_id)
        from scoring_authority.completed_history_record_eligibility eligibility
        where eligibility.revision_id = revision_value
      ), '[]'::jsonb),
      'corrections', coalesce((
        select jsonb_agg(to_jsonb(correction) order by correction.correction_id)
        from scoring_authority.completed_history_correction_applications correction
        where correction.revision_id = revision_value
      ), '[]'::jsonb)
    ) into result_value
    from scoring_authority.completed_history_revisions revision
    join scoring_authority.tournaments tournament
      on tournament.tournament_id = revision.tournament_id
    join scoring_authority.completed_history_tournament_facts fact
      on fact.revision_id = revision.revision_id
    where revision.revision_id = revision_value;
  elsif mode_value = 'PLAYER' then
    if target_player = '' then
      return jsonb_build_object('ok', false, 'code', 'PLAYER_ID_REQUIRED');
    end if;
    select jsonb_build_object(
      'player', to_jsonb(player),
      'tournaments', coalesce((
        select jsonb_agg(to_jsonb(roster) || jsonb_build_object(
          'tournament_year', revision.tournament_year
        ) order by revision.tournament_year)
        from scoring_authority.completed_history_current_revisions current_pointer
        join scoring_authority.completed_history_revisions revision
          on revision.revision_id = current_pointer.revision_id
        join scoring_authority.completed_history_roster_facts roster
          on roster.revision_id = revision.revision_id
         and roster.player_id = target_player
      ), '[]'::jsonb),
      'matches', coalesce((
        select jsonb_agg(
          to_jsonb(participant) || to_jsonb(match_value)
            || jsonb_build_object(
              'tournament_year', revision.tournament_year,
              'is_record_eligible', eligibility.is_record_eligible,
              'record_eligibility_reason', eligibility.reason_code
            ) order by revision.tournament_year, match_value.round_number, match_value.match_id
        )
        from scoring_authority.completed_history_current_revisions current_pointer
        join scoring_authority.completed_history_revisions revision
          on revision.revision_id = current_pointer.revision_id
        join scoring_authority.completed_history_match_participants participant
          on participant.revision_id = revision.revision_id
         and participant.player_id = target_player
        join scoring_authority.completed_history_matches match_value
          on match_value.revision_id = participant.revision_id
         and match_value.match_id = participant.match_id
        join scoring_authority.completed_history_record_eligibility eligibility
          on eligibility.revision_id = participant.revision_id
         and eligibility.match_id = participant.match_id
         and eligibility.player_id = participant.player_id
      ), '[]'::jsonb),
      'awards', coalesce((
        select jsonb_agg(to_jsonb(award) || jsonb_build_object(
          'tournament_year', revision.tournament_year
        ) order by revision.tournament_year, award.award_type)
        from scoring_authority.completed_history_current_revisions current_pointer
        join scoring_authority.completed_history_revisions revision
          on revision.revision_id = current_pointer.revision_id
        join scoring_authority.completed_history_awards award
          on award.revision_id = revision.revision_id
         and award.winner_player_id = target_player
      ), '[]'::jsonb)
    ) into result_value
    from scoring_authority.players player
    where player.player_id = target_player;
    if result_value is null then
      return jsonb_build_object('ok', false, 'code', 'HISTORICAL_PLAYER_NOT_FOUND');
    end if;
  elsif mode_value = 'COURSE' then
    if target_course = '' then
      return jsonb_build_object('ok', false, 'code', 'COURSE_ID_REQUIRED');
    end if;
    select jsonb_build_object(
      'course', to_jsonb(course),
      'appearances', coalesce((
        select jsonb_agg(to_jsonb(appearance) || jsonb_build_object(
          'tournament_year', revision.tournament_year
        ) order by revision.tournament_year, appearance.round_number)
        from scoring_authority.completed_history_current_revisions current_pointer
        join scoring_authority.completed_history_revisions revision
          on revision.revision_id = current_pointer.revision_id
        join scoring_authority.completed_history_course_appearances appearance
          on appearance.revision_id = revision.revision_id
         and appearance.course_id = target_course
      ), '[]'::jsonb),
      'matches', coalesce((
        select jsonb_agg(to_jsonb(match_value) || jsonb_build_object(
          'tournament_year', revision.tournament_year
        ) order by revision.tournament_year, match_value.round_number, match_value.match_id)
        from scoring_authority.completed_history_current_revisions current_pointer
        join scoring_authority.completed_history_revisions revision
          on revision.revision_id = current_pointer.revision_id
        join scoring_authority.completed_history_course_appearances appearance
          on appearance.revision_id = revision.revision_id
         and appearance.course_id = target_course
        join scoring_authority.completed_history_matches match_value
          on match_value.revision_id = appearance.revision_id
         and match_value.course_appearance_id = appearance.appearance_id
      ), '[]'::jsonb)
    ) into result_value
    from scoring_authority.completed_history_course_identities course
    where course.course_id = target_course;
    if result_value is null then
      return jsonb_build_object('ok', false, 'code', 'HISTORICAL_COURSE_NOT_FOUND');
    end if;
  elsif mode_value = 'MATCH' then
    if target_match = '' then
      return jsonb_build_object('ok', false, 'code', 'MATCH_ID_REQUIRED');
    end if;
    select jsonb_build_object(
      'tournament_year', revision.tournament_year,
      'match', to_jsonb(match_value),
      'participants', coalesce((
        select jsonb_agg(to_jsonb(participant)
          order by participant.team_side, participant.player_slot)
        from scoring_authority.completed_history_match_participants participant
        where participant.revision_id = match_value.revision_id
          and participant.match_id = match_value.match_id
      ), '[]'::jsonb),
      'scorecards', coalesce((
        select jsonb_agg(to_jsonb(scorecard) order by scorecard.scorecard_id)
        from scoring_authority.completed_history_scorecards scorecard
        where scorecard.revision_id = match_value.revision_id
          and scorecard.match_id = match_value.match_id
      ), '[]'::jsonb),
      'record_eligibility', coalesce((
        select jsonb_agg(to_jsonb(eligibility) order by eligibility.player_id)
        from scoring_authority.completed_history_record_eligibility eligibility
        where eligibility.revision_id = match_value.revision_id
          and eligibility.match_id = match_value.match_id
      ), '[]'::jsonb)
    ) into result_value
    from scoring_authority.completed_history_current_revisions current_pointer
    join scoring_authority.completed_history_revisions revision
      on revision.revision_id = current_pointer.revision_id
    join scoring_authority.completed_history_matches match_value
      on match_value.revision_id = revision.revision_id
     and match_value.match_id = target_match;
    if result_value is null then
      return jsonb_build_object('ok', false, 'code', 'HISTORICAL_MATCH_NOT_FOUND');
    end if;
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_COMPLETED_HISTORY_READ_MODE');
  end if;

  return jsonb_build_object(
    'ok', true,
    'mode', mode_value,
    'schema_version', 'completed-history-v1',
    'data', result_value
  );
end;
$$;

create or replace function public.inspect_preview_completed_history(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  preview_project constant text := 'idgigvjjqkfbqjeredpb';
  historical_source constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  target_year integer;
  years_value jsonb;
  revisions_value jsonb;
  sequence_ok boolean;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> preview_project
     or btrim(coalesce(input->>'source_workbook_id', historical_source)) <> historical_source then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_COMPLETED_HISTORY_SCOPE_REQUIRED');
  end if;
  begin target_year := nullif(coalesce(input->>'tournament_year', input->>'year'), '')::integer;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_INVALID');
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tournament_year', revision.tournament_year,
    'tournament_id', revision.tournament_id,
    'revision_id', revision.revision_id,
    'revision_number', revision.revision_number,
    'operation', revision.operation,
    'source_fingerprint', revision.source_fingerprint,
    'payload_fingerprint', revision.payload_fingerprint,
    'database_payload_fingerprint', revision.database_payload_fingerprint,
    'import_contract_version', revision.import_contract_version,
    'correction_set_version', revision.correction_set_version,
    'importer_version', revision.importer_version,
    'source_counts', revision.source_counts,
    'canonical_counts', revision.canonical_counts,
    'certification', revision.certification,
    'certified_at', revision.certified_at,
    'import_run', to_jsonb(import_run)
  ) order by revision.tournament_year), '[]'::jsonb)
  into years_value
  from scoring_authority.completed_history_current_revisions current_pointer
  join scoring_authority.completed_history_revisions revision
    on revision.revision_id = current_pointer.revision_id
  join scoring_authority.completed_history_import_runs import_run
    on import_run.revision_id = revision.revision_id
  where target_year is null or revision.tournament_year = target_year;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tournament_year', revision.tournament_year,
    'revision_id', revision.revision_id,
    'revision_number', revision.revision_number,
    'operation', revision.operation,
    'previous_revision_id', revision.previous_revision_id,
    'source_fingerprint', revision.source_fingerprint,
    'payload_fingerprint', revision.payload_fingerprint,
    'certified_at', revision.certified_at,
    'is_current', current_pointer.revision_id is not null
  ) order by revision.tournament_year, revision.revision_number), '[]'::jsonb)
  into revisions_value
  from scoring_authority.completed_history_revisions revision
  left join scoring_authority.completed_history_current_revisions current_pointer
    on current_pointer.revision_id = revision.revision_id
  where target_year is null or revision.tournament_year = target_year;

  select not exists (
    select year_value
    from generate_series(
      2017,
      coalesce((select max(tournament_year)
        from scoring_authority.completed_history_current_revisions), 2016)
    ) year_value
    where not exists (
      select 1 from scoring_authority.completed_history_current_revisions current_pointer
      where current_pointer.tournament_year = year_value
    )
  ) into sequence_ok;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'scope', jsonb_build_object(
        'environment', 'PREVIEW', 'project_ref', preview_project,
        'source_workbook_id', historical_source,
        'public_routes_switched', false
      ),
      'certified_year_count', (
        select count(*) from scoring_authority.completed_history_current_revisions
      ),
      'certified_sequence_complete_through_latest', sequence_ok,
      'years', years_value,
      'revisions', revisions_value,
      'duplicate_current_years', (
        select count(*) from (
          select tournament_year from scoring_authority.completed_history_current_revisions
          group by tournament_year having count(*) > 1
        ) duplicate_years
      ),
      'orphan_current_revisions', (
        select count(*)
        from scoring_authority.completed_history_current_revisions current_pointer
        left join scoring_authority.completed_history_revisions revision
          on revision.revision_id = current_pointer.revision_id
        where revision.revision_id is null
      )
    )
  );
end;
$$;

create or replace function public.inspect_preview_completed_history_security()
returns jsonb
language sql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
  with checks as (
    select
      has_function_privilege('anon', 'public.import_preview_completed_history_year(jsonb)', 'execute') as anon_import,
      has_function_privilege('authenticated', 'public.import_preview_completed_history_year(jsonb)', 'execute') as auth_import,
      has_function_privilege('service_role', 'public.import_preview_completed_history_year(jsonb)', 'execute') as service_import,
      has_function_privilege('anon', 'public.read_preview_completed_history(jsonb)', 'execute') as anon_read,
      has_function_privilege('authenticated', 'public.read_preview_completed_history(jsonb)', 'execute') as auth_read,
      has_function_privilege('service_role', 'public.read_preview_completed_history(jsonb)', 'execute') as service_read,
      has_table_privilege('anon', 'scoring_authority.completed_history_matches', 'select') as anon_fact,
      has_table_privilege('authenticated', 'scoring_authority.completed_history_matches', 'select') as auth_fact,
      has_table_privilege('service_role', 'scoring_authority.completed_history_matches', 'select') as service_fact
  )
  select jsonb_build_object(
    'ok', not anon_import and not auth_import and service_import
      and not anon_read and not auth_read and service_read
      and not anon_fact and not auth_fact and not service_fact,
    'anon_import_execute', anon_import,
    'authenticated_import_execute', auth_import,
    'service_import_execute', service_import,
    'anon_read_execute', anon_read,
    'authenticated_read_execute', auth_read,
    'service_read_execute', service_read,
    'anon_fact_select', anon_fact,
    'authenticated_fact_select', auth_fact,
    'service_direct_fact_select', service_fact
  ) from checks
$$;

revoke all on function public.read_preview_completed_history(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.inspect_preview_completed_history(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.inspect_preview_completed_history_security()
  from public, anon, authenticated, service_role;

grant execute on function public.read_preview_completed_history(jsonb) to service_role;
grant execute on function public.inspect_preview_completed_history(jsonb) to service_role;
grant execute on function public.inspect_preview_completed_history_security() to service_role;

notify pgrst, 'reload schema';
