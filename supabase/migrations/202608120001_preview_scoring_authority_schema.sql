-- Phase 2 Preview scoring authority aggregate.
-- This schema is production-shaped, but all access remains service/server-only.
-- The application authority flag remains GOOGLE until an explicit cutover epoch.

create schema if not exists scoring_authority;
revoke all on schema scoring_authority from public, anon, authenticated;

create table scoring_authority.tournaments (
  tournament_id text primary key,
  tournament_year integer not null,
  name text not null,
  source_workbook_id text not null,
  scoring_authority text not null default 'GOOGLE' check (scoring_authority in ('GOOGLE', 'SUPABASE')),
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_year)
);

create table scoring_authority.players (
  player_id text primary key,
  display_name text not null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table scoring_authority.teams (
  tournament_id text not null references scoring_authority.tournaments on delete cascade,
  team_id text not null,
  team_side integer not null check (team_side in (1, 2)),
  name text not null,
  source_payload jsonb not null default '{}'::jsonb,
  primary key (tournament_id, team_id),
  unique (tournament_id, team_side)
);

create table scoring_authority.tournament_players (
  tournament_id text not null references scoring_authority.tournaments on delete cascade,
  player_id text not null references scoring_authority.players,
  team_id text not null,
  team_side integer not null check (team_side in (1, 2)),
  participation_status text not null default 'ACTIVE' check (participation_status in ('ACTIVE', 'WITHDRAWN', 'INACTIVE')),
  source_roster_key text not null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, player_id),
  foreign key (tournament_id, team_id) references scoring_authority.teams (tournament_id, team_id)
);

create index scoring_authority_tournament_players_team_idx
  on scoring_authority.tournament_players (tournament_id, team_side, participation_status);

create table scoring_authority.rounds (
  tournament_id text not null references scoring_authority.tournaments on delete cascade,
  round_number integer not null check (round_number between 1 and 99),
  format text not null check (format in ('BB', 'SC', 'SI')),
  name text not null,
  handicap_allowance numeric,
  status text not null default 'UPCOMING',
  source_payload jsonb not null default '{}'::jsonb,
  primary key (tournament_id, round_number)
);

create table scoring_authority.scoring_snapshots (
  snapshot_id text primary key,
  tournament_id text not null references scoring_authority.tournaments on delete cascade,
  match_id text not null,
  snapshot_revision bigint not null check (snapshot_revision >= 0),
  scoring_rules_version text not null,
  format text not null check (format in ('BB', 'SC', 'SI')),
  handicap_allowance numeric,
  course_id text not null,
  tee text not null,
  rating numeric,
  slope integer,
  par integer not null,
  match_netting_baseline text not null,
  hole_definitions jsonb not null,
  participant_configuration jsonb not null,
  team_configuration jsonb not null,
  effective_at timestamptz,
  imported_at timestamptz not null default now(),
  canonical_hash text not null check (canonical_hash ~ '^[0-9a-f]{64}$'),
  unique (match_id, snapshot_revision),
  check (jsonb_typeof(hole_definitions) = 'array' and jsonb_array_length(hole_definitions) = 18),
  check (jsonb_typeof(participant_configuration) = 'object')
);

create table scoring_authority.matches (
  match_id text primary key,
  tournament_id text not null references scoring_authority.tournaments on delete cascade,
  round_number integer not null,
  format text not null check (format in ('BB', 'SC', 'SI')),
  scoring_snapshot_id text not null references scoring_authority.scoring_snapshots,
  status text not null check (status in ('UPCOMING', 'LIVE', 'FINAL')),
  scoring_locked boolean not null default false,
  permission_revision bigint not null default 1 check (permission_revision > 0),
  match_revision bigint not null default 0 check (match_revision >= 0),
  source_google_revision bigint not null default 0 check (source_google_revision >= 0),
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
  source_google_updated_at timestamptz,
  authority_updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tournament_id, round_number) references scoring_authority.rounds (tournament_id, round_number)
);

create index scoring_authority_matches_round_status_idx
  on scoring_authority.matches (tournament_id, round_number, status);

create table scoring_authority.match_participants (
  match_id text not null references scoring_authority.matches on delete cascade,
  player_id text not null references scoring_authority.players,
  team_side integer not null check (team_side in (1, 2)),
  player_slot integer not null check (player_slot in (1, 2)),
  handicap_index numeric,
  course_handicap integer,
  playing_handicap integer not null,
  final_strokes integer not null,
  primary key (match_id, team_side, player_slot),
  unique (match_id, player_id)
);

create table scoring_authority.scoring_permissions (
  match_id text not null references scoring_authority.matches on delete cascade,
  player_id text not null references scoring_authority.players,
  can_score boolean not null default true,
  permission_revision bigint not null default 1 check (permission_revision > 0),
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

create table scoring_authority.match_holes (
  match_id text not null references scoring_authority.matches on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),
  snapshot_id text not null references scoring_authority.scoring_snapshots,
  stroke_index integer not null check (stroke_index between 1 and 18),
  par integer not null check (par between 3 and 6),
  yardage integer,
  primary key (match_id, hole_number)
);

create table scoring_authority.hole_scores (
  match_id text not null references scoring_authority.matches on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),
  hole_revision bigint not null check (hole_revision > 0),
  team_1_gross_scores jsonb not null,
  team_2_gross_scores jsonb not null,
  team_1_strokes jsonb not null,
  team_2_strokes jsonb not null,
  team_1_net_score integer not null,
  team_2_net_score integer not null,
  hole_winner text not null check (hole_winner in ('Team 1', 'Team 2', 'Halved')),
  source_google_revision bigint not null default 0 check (source_google_revision >= 0),
  source_google_updated_at timestamptz,
  mutation_key text not null,
  actor_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, hole_number)
);

create unique index scoring_authority_hole_score_revision_idx
  on scoring_authority.hole_scores (match_id, hole_number, hole_revision);

create table scoring_authority.score_mutations (
  match_id text not null references scoring_authority.matches on delete cascade,
  mutation_key text not null,
  mutation_type text not null check (mutation_type in ('HOLE_SCORE', 'FINALIZE', 'REOPEN')),
  hole_number integer,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  previous_match_revision bigint not null,
  next_match_revision bigint not null,
  previous_hole_revision bigint,
  next_hole_revision bigint,
  result jsonb not null,
  actor_id text not null,
  created_at timestamptz not null default now(),
  primary key (match_id, mutation_key)
);

create index scoring_authority_mutations_history_idx
  on scoring_authority.score_mutations (match_id, next_match_revision, created_at);

create table scoring_authority.score_revision_history (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references scoring_authority.matches on delete cascade,
  hole_number integer,
  mutation_key text not null,
  action text not null,
  previous_match_revision bigint not null,
  next_match_revision bigint not null,
  previous_hole_revision bigint,
  next_hole_revision bigint,
  before_state jsonb not null,
  after_state jsonb not null,
  actor_id text not null,
  created_at timestamptz not null default now(),
  unique (match_id, mutation_key)
);

create table scoring_authority.audit_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments on delete cascade,
  match_id text,
  mutation_key text,
  action text not null,
  actor_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table scoring_authority.google_outbox_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments on delete cascade,
  match_id text not null references scoring_authority.matches on delete cascade,
  match_revision bigint not null,
  hole_number integer,
  hole_revision bigint,
  mutation_key text not null,
  event_type text not null check (event_type in ('HOLE_SCORE_UPSERTED', 'MATCH_FINALIZED', 'MATCH_REOPENED')),
  payload jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'DELIVERED', 'RETRYABLE', 'BLOCKED')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  claimed_by text,
  last_error_code text,
  last_error_safe text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (match_id, mutation_key),
  unique (match_id, match_revision)
);

create index scoring_authority_outbox_pending_idx
  on scoring_authority.google_outbox_events (status, available_at, match_id, match_revision)
  where status in ('PENDING', 'RETRYABLE', 'PROCESSING');

create table scoring_authority.google_match_checkpoints (
  match_id text primary key references scoring_authority.matches on delete cascade,
  last_supabase_match_revision bigint not null default 0,
  google_match_updated_at timestamptz,
  google_match_revision bigint not null default 0,
  google_hole_revisions jsonb not null default '{}'::jsonb,
  last_outbox_event_id uuid,
  verified_fingerprint text,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table scoring_authority.authority_epochs (
  epoch_id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments on delete cascade,
  epoch_type text not null check (epoch_type in ('CUTOVER', 'ROLLBACK')),
  status text not null check (status in ('PREPARED', 'COMMITTED', 'BLOCKED', 'ABORTED')),
  authority_before text not null check (authority_before in ('GOOGLE', 'SUPABASE')),
  authority_after text not null check (authority_after in ('GOOGLE', 'SUPABASE')),
  reconciliation_fingerprint text not null,
  google_checkpoints jsonb not null,
  supabase_match_revisions jsonb not null,
  deployment_commit text not null,
  actor_id text not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create table scoring_authority.ingress_gates (
  tournament_id text primary key references scoring_authority.tournaments on delete cascade,
  state text not null default 'OPEN' check (state in ('OPEN', 'PAUSED')),
  authority text not null default 'GOOGLE' check (authority in ('GOOGLE', 'SUPABASE')),
  active_epoch_id uuid references scoring_authority.authority_epochs,
  unresolved_client_queues integer not null default 0 check (unresolved_client_queues >= 0),
  updated_by text not null,
  updated_at timestamptz not null default now()
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'tournaments','players','teams','tournament_players','rounds','scoring_snapshots','matches',
    'match_participants','scoring_permissions','match_holes','hole_scores','score_mutations',
    'score_revision_history','audit_events','google_outbox_events','google_match_checkpoints',
    'authority_epochs','ingress_gates'
  ] loop
    execute format('alter table scoring_authority.%I enable row level security', table_name);
  end loop;
end $$;

revoke all on all tables in schema scoring_authority from public, anon, authenticated;
revoke all on all sequences in schema scoring_authority from public, anon, authenticated;

create or replace function public.replace_preview_scoring_authority_import(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  tournament jsonb := payload->'tournament';
  tournament_key text := tournament->>'tournament_id';
  item jsonb;
  imported_players integer := 0;
  imported_matches integer := 0;
  imported_holes integer := 0;
begin
  if coalesce(tournament_key, '') = '' or upper(coalesce(payload->>'environment', '')) <> 'PREVIEW' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_IMPORT_REQUIRED');
  end if;
  if coalesce(payload->>'source_workbook_id', '') = '' then
    return jsonb_build_object('ok', false, 'code', 'SOURCE_WORKBOOK_REQUIRED');
  end if;

  delete from scoring_authority.tournaments where tournament_id = tournament_key;

  insert into scoring_authority.tournaments (
    tournament_id, tournament_year, name, source_workbook_id, scoring_authority
  ) values (
    tournament_key, (tournament->>'tournament_year')::integer, tournament->>'name',
    payload->>'source_workbook_id', 'GOOGLE'
  );

  for item in select value from jsonb_array_elements(payload->'players') loop
    insert into scoring_authority.players (player_id, display_name, source_payload)
    values (item->>'player_id', item->>'display_name', coalesce(item->'source_payload', '{}'::jsonb))
    on conflict (player_id) do update set display_name = excluded.display_name,
      source_payload = excluded.source_payload, updated_at = now();
  end loop;

  for item in select value from jsonb_array_elements(payload->'teams') loop
    insert into scoring_authority.teams (tournament_id, team_id, team_side, name, source_payload)
    values (tournament_key, item->>'team_id', (item->>'team_side')::integer, item->>'name', coalesce(item->'source_payload', '{}'::jsonb));
  end loop;

  for item in select value from jsonb_array_elements(payload->'tournament_players') loop
    insert into scoring_authority.tournament_players (
      tournament_id, player_id, team_id, team_side, participation_status, source_roster_key, source_payload
    ) values (
      tournament_key, item->>'player_id', item->>'team_id', (item->>'team_side')::integer,
      coalesce(item->>'participation_status', 'ACTIVE'), item->>'source_roster_key', coalesce(item->'source_payload', '{}'::jsonb)
    );
    imported_players := imported_players + 1;
  end loop;

  for item in select value from jsonb_array_elements(payload->'rounds') loop
    insert into scoring_authority.rounds (
      tournament_id, round_number, format, name, handicap_allowance, status, source_payload
    ) values (
      tournament_key, (item->>'round_number')::integer, item->>'format', item->>'name',
      nullif(item->>'handicap_allowance', '')::numeric, coalesce(item->>'status', 'UPCOMING'), coalesce(item->'source_payload', '{}'::jsonb)
    );
  end loop;

  for item in select value from jsonb_array_elements(payload->'snapshots') loop
    insert into scoring_authority.scoring_snapshots (
      snapshot_id, tournament_id, match_id, snapshot_revision, scoring_rules_version, format,
      handicap_allowance, course_id, tee, rating, slope, par, match_netting_baseline,
      hole_definitions, participant_configuration, team_configuration, effective_at, canonical_hash
    ) values (
      item->>'snapshot_id', tournament_key, item->>'match_id', (item->>'snapshot_revision')::bigint,
      item->>'scoring_rules_version', item->>'format', nullif(item->>'handicap_allowance', '')::numeric,
      item->>'course_id', item->>'tee', nullif(item->>'rating', '')::numeric,
      nullif(item->>'slope', '')::integer, (item->>'par')::integer,
      item->>'match_netting_baseline', item->'hole_definitions', item->'participant_configuration',
      item->'team_configuration', nullif(item->>'effective_at', '')::timestamptz, item->>'canonical_hash'
    );
  end loop;

  for item in select value from jsonb_array_elements(payload->'matches') loop
    insert into scoring_authority.matches (
      match_id, tournament_id, round_number, format, scoring_snapshot_id, status, scoring_locked,
      permission_revision, match_revision, source_google_revision, scored_holes, current_hole,
      holes_remaining, team_1_holes_won, team_2_holes_won, running_result, result_winner,
      clinched, scorecard_complete, unresolved_mutations, source_google_updated_at,
      authority_updated_at, finalized_at
    ) values (
      item->>'match_id', tournament_key, (item->>'round_number')::integer, item->>'format',
      item->>'scoring_snapshot_id', item->>'status', coalesce((item->>'scoring_locked')::boolean, false),
      coalesce((item->>'permission_revision')::bigint, 1), coalesce((item->>'match_revision')::bigint, 0),
      coalesce((item->>'source_google_revision')::bigint, 0), coalesce((item->>'scored_holes')::integer, 0),
      coalesce((item->>'current_hole')::integer, 0), coalesce((item->>'holes_remaining')::integer, 18),
      coalesce((item->>'team_1_holes_won')::integer, 0), coalesce((item->>'team_2_holes_won')::integer, 0),
      coalesce(item->>'running_result', 'Scheduled'), coalesce(item->>'result_winner', ''),
      coalesce((item->>'clinched')::boolean, false), coalesce((item->>'scorecard_complete')::boolean, false),
      0, nullif(item->>'source_google_updated_at', '')::timestamptz,
      coalesce(nullif(item->>'authority_updated_at', '')::timestamptz, now()),
      nullif(item->>'finalized_at', '')::timestamptz
    );
    imported_matches := imported_matches + 1;
  end loop;

  for item in select value from jsonb_array_elements(payload->'match_participants') loop
    insert into scoring_authority.match_participants (
      match_id, player_id, team_side, player_slot, handicap_index, course_handicap, playing_handicap, final_strokes
    ) values (
      item->>'match_id', item->>'player_id', (item->>'team_side')::integer, (item->>'player_slot')::integer,
      nullif(item->>'handicap_index', '')::numeric, nullif(item->>'course_handicap', '')::integer,
      (item->>'playing_handicap')::integer, (item->>'final_strokes')::integer
    );
  end loop;

  for item in select value from jsonb_array_elements(payload->'permissions') loop
    insert into scoring_authority.scoring_permissions (match_id, player_id, can_score, permission_revision, revoked_at)
    values (item->>'match_id', item->>'player_id', coalesce((item->>'can_score')::boolean, true),
      coalesce((item->>'permission_revision')::bigint, 1), nullif(item->>'revoked_at', '')::timestamptz);
  end loop;

  for item in select value from jsonb_array_elements(payload->'match_holes') loop
    insert into scoring_authority.match_holes (match_id, hole_number, snapshot_id, stroke_index, par, yardage)
    values (item->>'match_id', (item->>'hole_number')::integer, item->>'snapshot_id',
      (item->>'stroke_index')::integer, (item->>'par')::integer, nullif(item->>'yardage', '')::integer);
  end loop;

  for item in select value from jsonb_array_elements(payload->'hole_scores') loop
    insert into scoring_authority.hole_scores (
      match_id, hole_number, hole_revision, team_1_gross_scores, team_2_gross_scores,
      team_1_strokes, team_2_strokes, team_1_net_score, team_2_net_score, hole_winner,
      source_google_revision, source_google_updated_at, mutation_key, actor_id, created_at, updated_at
    ) values (
      item->>'match_id', (item->>'hole_number')::integer, (item->>'hole_revision')::bigint,
      item->'team_1_gross_scores', item->'team_2_gross_scores', item->'team_1_strokes', item->'team_2_strokes',
      (item->>'team_1_net_score')::integer, (item->>'team_2_net_score')::integer, item->>'hole_winner',
      coalesce((item->>'source_google_revision')::bigint, 0), nullif(item->>'source_google_updated_at', '')::timestamptz,
      item->>'mutation_key', coalesce(item->>'actor_id', 'Google import'),
      coalesce(nullif(item->>'source_google_updated_at', '')::timestamptz, now()),
      coalesce(nullif(item->>'source_google_updated_at', '')::timestamptz, now())
    );
    imported_holes := imported_holes + 1;
  end loop;

  for item in select value from jsonb_array_elements(payload->'checkpoints') loop
    insert into scoring_authority.google_match_checkpoints (
      match_id, last_supabase_match_revision, google_match_updated_at, google_match_revision,
      google_hole_revisions, verified_fingerprint, verified_at
    ) values (
      item->>'match_id', (item->>'last_supabase_match_revision')::bigint,
      nullif(item->>'google_match_updated_at', '')::timestamptz,
      coalesce((item->>'google_match_revision')::bigint, 0), item->'google_hole_revisions',
      item->>'verified_fingerprint', now()
    );
  end loop;

  insert into scoring_authority.ingress_gates (tournament_id, state, authority, updated_by)
  values (tournament_key, 'OPEN', 'GOOGLE', coalesce(payload->>'requested_by', 'Phase 2 import'));

  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (tournament_key, 'CANONICAL_IMPORT_REPLACED', coalesce(payload->>'requested_by', 'Phase 2 import'),
    jsonb_build_object('players', imported_players, 'matches', imported_matches, 'holes', imported_holes,
      'source_workbook_id', payload->>'source_workbook_id'));

  return jsonb_build_object('ok', true, 'tournament_id', tournament_key,
    'tournament_players', imported_players, 'matches', imported_matches, 'holes', imported_holes,
    'authority', 'GOOGLE');
end;
$$;

create or replace function public.read_preview_scoring_authority(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  tournament_key text := input->>'tournament_id';
  target_match text := input->>'match_id';
  mode text := upper(coalesce(input->>'mode', 'DIAGNOSTICS'));
  payload jsonb;
begin
  if mode = 'DIAGNOSTICS' then
    select jsonb_build_object(
      'tournaments', (select count(*) from scoring_authority.tournaments where tournament_id = tournament_key),
      'players', (select count(*) from scoring_authority.tournament_players where tournament_id = tournament_key),
      'teams', (select count(*) from scoring_authority.teams where tournament_id = tournament_key),
      'rounds', (select count(*) from scoring_authority.rounds where tournament_id = tournament_key),
      'snapshots', (select count(*) from scoring_authority.scoring_snapshots where tournament_id = tournament_key),
      'matches', (select count(*) from scoring_authority.matches where tournament_id = tournament_key),
      'holes', (select count(*) from scoring_authority.hole_scores h join scoring_authority.matches m using (match_id) where m.tournament_id = tournament_key),
      'match_holes', (select count(*) from scoring_authority.match_holes h join scoring_authority.matches m using (match_id) where m.tournament_id = tournament_key),
      'permissions', (select count(*) from scoring_authority.scoring_permissions p join scoring_authority.matches m using (match_id) where m.tournament_id = tournament_key),
      'pending_outbox', (select count(*) from scoring_authority.google_outbox_events where tournament_id = tournament_key and status <> 'DELIVERED'),
      'authority', (select scoring_authority from scoring_authority.tournaments where tournament_id = tournament_key),
      'ingress', (select to_jsonb(g) from scoring_authority.ingress_gates g where tournament_id = tournament_key),
      'duplicate_holes', (select count(*) from (select match_id, hole_number from scoring_authority.hole_scores group by match_id, hole_number having count(*) > 1) d),
      'duplicate_matches', (select count(*) from (select match_id from scoring_authority.matches group by match_id having count(*) > 1) d)
    ) into payload;
  elsif mode = 'MATCH' then
    select to_jsonb(m) into payload from scoring_authority.matches m where match_id = target_match;
  elsif mode = 'SCORECARD' then
    select jsonb_build_object('match', to_jsonb(m), 'holes', coalesce((select jsonb_agg(to_jsonb(h) order by hole_number) from scoring_authority.hole_scores h where h.match_id = m.match_id), '[]'::jsonb))
    into payload from scoring_authority.matches m where match_id = target_match;
  elsif mode = 'CURRENT_STATE' then
    select jsonb_build_object(
      'matches', coalesce((select jsonb_agg(to_jsonb(m) order by round_number, match_id) from scoring_authority.matches m where tournament_id = tournament_key), '[]'::jsonb),
      'holes', coalesce((select jsonb_agg(to_jsonb(h) order by h.match_id, h.hole_number) from scoring_authority.hole_scores h join scoring_authority.matches m using (match_id) where m.tournament_id = tournament_key), '[]'::jsonb),
      'players', coalesce((select jsonb_agg(to_jsonb(p) order by player_id) from scoring_authority.tournament_players p where tournament_id = tournament_key), '[]'::jsonb),
      'snapshots', coalesce((select jsonb_agg(to_jsonb(s) order by match_id) from scoring_authority.scoring_snapshots s where tournament_id = tournament_key), '[]'::jsonb),
      'permissions', coalesce((select jsonb_agg(to_jsonb(p) order by match_id, player_id) from scoring_authority.scoring_permissions p join scoring_authority.matches m using (match_id) where m.tournament_id = tournament_key), '[]'::jsonb),
      'checkpoints', coalesce((select jsonb_agg(to_jsonb(c) order by match_id) from scoring_authority.google_match_checkpoints c join scoring_authority.matches m using (match_id) where m.tournament_id = tournament_key), '[]'::jsonb)
    ) into payload;
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_READ_MODE');
  end if;
  return jsonb_build_object('ok', true, 'mode', mode, 'data', payload);
end;
$$;

create or replace function public.claim_preview_google_outbox(worker_id text, lease_seconds integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare event_row scoring_authority.google_outbox_events%rowtype;
begin
  select e.* into event_row
  from scoring_authority.google_outbox_events e
  join scoring_authority.google_match_checkpoints c on c.match_id = e.match_id
  where e.status in ('PENDING', 'RETRYABLE', 'PROCESSING')
    and e.available_at <= now()
    and (e.status <> 'PROCESSING' or e.lease_expires_at < now())
    and e.match_revision = c.last_supabase_match_revision + 1
  order by e.created_at, e.match_id, e.match_revision
  for update of e skip locked
  limit 1;
  if not found then return jsonb_build_object('ok', true, 'event', null); end if;
  update scoring_authority.google_outbox_events set status = 'PROCESSING', attempts = attempts + 1,
    claimed_by = worker_id, lease_expires_at = now() + make_interval(secs => greatest(5, least(lease_seconds, 300)))
  where id = event_row.id
  returning * into event_row;
  return jsonb_build_object('ok', true, 'event', to_jsonb(event_row), 'checkpoint',
    (select to_jsonb(c) from scoring_authority.google_match_checkpoints c where c.match_id = event_row.match_id));
end;
$$;

create or replace function public.complete_preview_google_outbox(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  event_row scoring_authority.google_outbox_events%rowtype;
  checkpoint_row scoring_authority.google_match_checkpoints%rowtype;
begin
  select * into event_row from scoring_authority.google_outbox_events where id = (input->>'event_id')::uuid for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'EVENT_NOT_FOUND'); end if;
  select * into checkpoint_row from scoring_authority.google_match_checkpoints where match_id = event_row.match_id for update;
  if event_row.status = 'DELIVERED' then return jsonb_build_object('ok', true, 'idempotent', true, 'checkpoint', to_jsonb(checkpoint_row)); end if;
  if event_row.match_revision <> checkpoint_row.last_supabase_match_revision + 1 then
    return jsonb_build_object('ok', false, 'code', 'CHECKPOINT_ORDER_CONFLICT', 'current_revision', checkpoint_row.last_supabase_match_revision);
  end if;
  update scoring_authority.google_outbox_events set status = 'DELIVERED', delivered_at = now(),
    lease_expires_at = null, last_error_code = null, last_error_safe = null where id = event_row.id;
  update scoring_authority.google_match_checkpoints set
    last_supabase_match_revision = event_row.match_revision,
    google_match_updated_at = nullif(input->>'google_match_updated_at', '')::timestamptz,
    google_match_revision = coalesce((input->>'google_match_revision')::bigint, google_match_revision),
    google_hole_revisions = case when event_row.hole_number is null then google_hole_revisions
      else google_hole_revisions || jsonb_build_object(event_row.hole_number::text, coalesce((input->>'google_hole_revision')::bigint, event_row.hole_revision)) end,
    last_outbox_event_id = event_row.id,
    verified_fingerprint = input->>'verified_fingerprint', verified_at = now(), updated_at = now()
  where match_id = event_row.match_id returning * into checkpoint_row;
  return jsonb_build_object('ok', true, 'idempotent', false, 'checkpoint', to_jsonb(checkpoint_row));
end;
$$;

create or replace function public.fail_preview_google_outbox(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare delay_seconds integer := greatest(1, least(coalesce((input->>'retry_after_seconds')::integer, 1), 300));
begin
  update scoring_authority.google_outbox_events set status = 'RETRYABLE', available_at = now() + make_interval(secs => delay_seconds),
    lease_expires_at = null, last_error_code = left(coalesce(input->>'error_code', 'DELIVERY_FAILED'), 80),
    last_error_safe = left(coalesce(input->>'error_safe', 'Google mirror delivery will retry.'), 240)
  where id = (input->>'event_id')::uuid and status <> 'DELIVERED';
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.prepare_preview_authority_epoch(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  tournament_key text := input->>'tournament_id';
  requested_type text := upper(input->>'epoch_type');
  current_authority text;
  unresolved integer;
  epoch uuid;
begin
  select authority, unresolved_client_queues into current_authority, unresolved
  from scoring_authority.ingress_gates where tournament_id = tournament_key for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_IMPORTED'); end if;
  if unresolved > 0 then return jsonb_build_object('ok', false, 'code', 'CLIENT_QUEUES_NOT_DRAINED', 'unresolved', unresolved); end if;
  if exists (select 1 from scoring_authority.google_outbox_events where tournament_id = tournament_key and status <> 'DELIVERED') then
    return jsonb_build_object('ok', false, 'code', 'GOOGLE_OUTBOX_NOT_DRAINED');
  end if;
  if requested_type = 'ROLLBACK' and exists (
    select 1 from scoring_authority.matches m join scoring_authority.google_match_checkpoints c using (match_id)
    where m.tournament_id = tournament_key and c.last_supabase_match_revision <> m.match_revision
  ) then return jsonb_build_object('ok', false, 'code', 'GOOGLE_BEHIND_SUPABASE'); end if;
  if requested_type not in ('CUTOVER', 'ROLLBACK') then return jsonb_build_object('ok', false, 'code', 'INVALID_EPOCH_TYPE'); end if;
  insert into scoring_authority.authority_epochs (
    tournament_id, epoch_type, status, authority_before, authority_after, reconciliation_fingerprint,
    google_checkpoints, supabase_match_revisions, deployment_commit, actor_id, reason
  ) values (
    tournament_key, requested_type, 'PREPARED', current_authority,
    case when requested_type = 'CUTOVER' then 'SUPABASE' else 'GOOGLE' end,
    input->>'reconciliation_fingerprint', input->'google_checkpoints', input->'supabase_match_revisions',
    input->>'deployment_commit', input->>'actor_id', coalesce(input->>'reason', '')
  ) returning epoch_id into epoch;
  update scoring_authority.ingress_gates set state = 'PAUSED', active_epoch_id = epoch,
    updated_by = input->>'actor_id', updated_at = now() where tournament_id = tournament_key;
  return jsonb_build_object('ok', true, 'code', 'EPOCH_PREPARED', 'epoch_id', epoch, 'authority', current_authority, 'ingress', 'PAUSED');
end;
$$;

create or replace function public.abort_preview_authority_epoch(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare epoch_row scoring_authority.authority_epochs%rowtype;
begin
  select * into epoch_row from scoring_authority.authority_epochs where epoch_id = (input->>'epoch_id')::uuid for update;
  if not found or epoch_row.status <> 'PREPARED' then return jsonb_build_object('ok', false, 'code', 'EPOCH_NOT_PREPARED'); end if;
  update scoring_authority.authority_epochs set status = 'ABORTED', reason = coalesce(input->>'reason', reason) where epoch_id = epoch_row.epoch_id;
  update scoring_authority.ingress_gates set state = 'OPEN', active_epoch_id = null,
    updated_by = input->>'actor_id', updated_at = now() where tournament_id = epoch_row.tournament_id;
  return jsonb_build_object('ok', true, 'code', 'EPOCH_ABORTED', 'authority', epoch_row.authority_before);
end;
$$;

create or replace function public.inspect_preview_scoring_authority_security()
returns jsonb
language sql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'tables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'scoring_authority' and c.relkind = 'r'),
    'rls_enabled', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'scoring_authority' and c.relkind = 'r' and c.relrowsecurity),
    'policies', (select count(*) from pg_policies where schemaname = 'scoring_authority'),
    'participant_table_grants', (select count(*) from information_schema.role_table_grants where table_schema = 'scoring_authority' and grantee in ('anon', 'authenticated')),
    'participant_rpc_grants', (select count(*) from information_schema.role_routine_grants where routine_schema = 'public' and grantee in ('anon', 'authenticated') and routine_name like '%scoring%authority%'),
    'service_only', true
  )
$$;

-- Deliberately no commit-authority RPC in this migration. Activation requires a
-- separate, explicitly authorized migration/deployment after readiness review.

do $$
declare function_signature text;
begin
  foreach function_signature in array array[
    'public.replace_preview_scoring_authority_import(jsonb)',
    'public.read_preview_scoring_authority(jsonb)',
    'public.claim_preview_google_outbox(text,integer)',
    'public.complete_preview_google_outbox(jsonb)',
    'public.fail_preview_google_outbox(jsonb)',
    'public.prepare_preview_authority_epoch(jsonb)',
    'public.abort_preview_authority_epoch(jsonb)'
    ,'public.inspect_preview_scoring_authority_security()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', function_signature);
    execute format('grant execute on function %s to service_role', function_signature);
  end loop;
end $$;

grant usage on schema scoring_authority to service_role;
grant select, insert, update, delete on all tables in schema scoring_authority to service_role;
grant usage, select on all sequences in schema scoring_authority to service_role;
notify pgrst, 'reload schema';
