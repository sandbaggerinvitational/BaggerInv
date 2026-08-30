-- Step 13E.6 Production Tournament Setup V1.
--
-- Installation is inert. It creates empty revisioned setup overlays and bounded
-- Director RPCs, but does not change the current tournament, teams, roster,
-- rounds, courses, matches, pairings, scoring snapshots, permissions, scores,
-- authority, ingress, workers, or any side-game state.
--
-- This contract deliberately preserves the existing certified scoring engine.
-- Tournament Setup may prepare or replace scoring context only while a match is
-- strictly unstarted. It never grants scoring access and never rewrites scores.
begin;

create table production_control.tournament_setup_context_v1 (
  tournament_id text primary key references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  contract_version text not null check (
    contract_version = 'production-tournament-setup-v1'
  ),
  revision bigint not null check (revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table scoring_authority.tournament_setup_operational_v1 (
  tournament_id text primary key references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  destination text,
  start_date date,
  end_date date,
  timezone text,
  operational_status text not null default 'UPCOMING' check (
    operational_status = 'UPCOMING'
  ),
  setup_revision bigint not null check (setup_revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (destination is null or (
    pg_catalog.btrim(destination) <> '' and pg_catalog.length(destination) <= 240
  )),
  check (start_date is null or end_date is null or start_date <= end_date),
  check (timezone is null or (
    pg_catalog.btrim(timezone) <> '' and pg_catalog.length(timezone) <= 120
  ))
);

create table scoring_authority.tournament_setup_team_details_v1 (
  tournament_id text not null,
  team_id text not null,
  captain_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  setup_revision bigint not null check (setup_revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, team_id),
  foreign key (tournament_id, team_id)
    references scoring_authority.teams(tournament_id, team_id)
    on delete restrict
);

create table scoring_authority.tournament_setup_round_details_v1 (
  tournament_id text not null,
  round_number integer not null check (round_number between 1 and 99),
  -- Existing Director/browser contract expresses team size as Players per side.
  -- BB/SC use 2; SI uses 1.
  team_size integer not null check (team_size in (1, 2)),
  points_available numeric not null check (points_available >= 0),
  display_order integer not null check (display_order between 1 and 99),
  setup_revision bigint not null check (setup_revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, round_number),
  foreign key (tournament_id, round_number)
    references scoring_authority.rounds(tournament_id, round_number)
    on delete restrict
);

create table scoring_authority.tournament_setup_course_tees_v1 (
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  course_id text not null check (
    course_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$'
  ),
  tee_id text not null check (
    pg_catalog.btrim(tee_id) <> '' and pg_catalog.length(tee_id) <= 120
  ),
  display_name text not null check (
    pg_catalog.btrim(display_name) <> ''
    and pg_catalog.length(display_name) <= 240
  ),
  location text,
  rating numeric not null check (rating > 0 and rating <= 100),
  slope integer not null check (slope between 55 and 155),
  par integer not null check (par between 54 and 90),
  setup_revision bigint not null check (setup_revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, course_id, tee_id),
  check (location is null or (
    pg_catalog.btrim(location) <> '' and pg_catalog.length(location) <= 240
  ))
);

create table scoring_authority.tournament_setup_course_holes_v1 (
  tournament_id text not null,
  course_id text not null,
  tee_id text not null,
  hole_number integer not null check (hole_number between 1 and 18),
  par integer not null check (par between 3 and 6),
  stroke_index integer not null check (stroke_index between 1 and 18),
  yardage integer check (yardage is null or yardage between 1 and 999),
  setup_revision bigint not null check (setup_revision > 0),
  primary key (tournament_id, course_id, tee_id, hole_number),
  unique (tournament_id, course_id, tee_id, stroke_index),
  foreign key (tournament_id, course_id, tee_id)
    references scoring_authority.tournament_setup_course_tees_v1(
      tournament_id, course_id, tee_id
    ) on delete restrict
);

create table scoring_authority.tournament_setup_round_courses_v1 (
  tournament_id text not null,
  round_number integer not null,
  course_id text not null,
  tee_id text not null,
  setup_revision bigint not null check (setup_revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, round_number),
  foreign key (tournament_id, round_number)
    references scoring_authority.rounds(tournament_id, round_number)
    on delete restrict,
  foreign key (tournament_id, course_id, tee_id)
    references scoring_authority.tournament_setup_course_tees_v1(
      tournament_id, course_id, tee_id
    ) on delete restrict
);

create table scoring_authority.tournament_setup_match_details_v1 (
  match_id text primary key references scoring_authority.matches(match_id)
    on delete restrict,
  tournament_id text not null,
  round_number integer not null,
  match_number integer not null check (match_number between 1 and 99),
  course_id text not null,
  tee_id text not null,
  tee_time time without time zone,
  starting_hole integer not null default 1 check (starting_hole between 1 and 18),
  setup_revision bigint not null check (setup_revision > 0),
  prepared_setup_revision bigint check (
    prepared_setup_revision is null or prepared_setup_revision > 0
  ),
  prepared_configuration_fingerprint text check (
    prepared_configuration_fingerprint is null
    or prepared_configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tournament_id, round_number, match_number),
  foreign key (tournament_id, round_number)
    references scoring_authority.rounds(tournament_id, round_number)
    on delete restrict,
  foreign key (tournament_id, course_id, tee_id)
    references scoring_authority.tournament_setup_course_tees_v1(
      tournament_id, course_id, tee_id
    ) on delete restrict,
  check (
    (prepared_setup_revision is null
      and prepared_configuration_fingerprint is null)
    or (prepared_setup_revision is not null
      and prepared_configuration_fingerprint is not null)
  )
);

create table production_control.tournament_setup_operation_receipts_v1 (
  receipt_id uuid not null default extensions.gen_random_uuid() unique,
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  action text not null check (action in (
    'UPDATE_TOURNAMENT', 'UPDATE_TEAM', 'ASSIGN_ROSTER_TEAM',
    'UPDATE_ROUND', 'UPSERT_COURSE', 'UPSERT_MATCH',
    'REPLACE_PAIRINGS', 'PREPARE_SCORING_CONTEXT'
  )),
  operation_request_id uuid not null,
  declared_request_payload_hash text not null check (
    declared_request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  database_request_payload_hash text not null check (
    database_request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  prior_revision bigint not null check (prior_revision >= 0),
  next_revision bigint not null check (next_revision >= prior_revision),
  response jsonb not null check (pg_catalog.jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, action, operation_request_id)
);

create table production_control.tournament_setup_audit_events_v1 (
  event_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  action text not null,
  target_kind text not null check (target_kind in (
    'TOURNAMENT', 'TEAM', 'MEMBERSHIP', 'ROUND', 'COURSE_TEE',
    'MATCH', 'PAIRINGS', 'SCORING_CONTEXT'
  )),
  target_id text not null check (
    pg_catalog.btrim(target_id) <> '' and pg_catalog.length(target_id) <= 240
  ),
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  operation_request_id uuid not null,
  prior_revision bigint not null check (prior_revision >= 0),
  next_revision bigint not null check (next_revision >= prior_revision),
  result text not null check (result in ('CHANGED', 'NO_CHANGE')),
  safe_metadata jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(safe_metadata) = 'object'
  ),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index production_tournament_setup_audit_history_v1
  on production_control.tournament_setup_audit_events_v1(
    tournament_id, occurred_at desc, event_id
  );

alter table production_control.tournament_setup_context_v1 enable row level security;
alter table scoring_authority.tournament_setup_operational_v1 enable row level security;
alter table scoring_authority.tournament_setup_team_details_v1 enable row level security;
alter table scoring_authority.tournament_setup_round_details_v1 enable row level security;
alter table scoring_authority.tournament_setup_course_tees_v1 enable row level security;
alter table scoring_authority.tournament_setup_course_holes_v1 enable row level security;
alter table scoring_authority.tournament_setup_round_courses_v1 enable row level security;
alter table scoring_authority.tournament_setup_match_details_v1 enable row level security;
alter table production_control.tournament_setup_operation_receipts_v1 enable row level security;
alter table production_control.tournament_setup_audit_events_v1 enable row level security;

create or replace function production_control.reject_tournament_setup_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, production_control
as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_TOURNAMENT_SETUP_IMMUTABLE_RECORD';
end;
$$;

create or replace function production_control.apply_tournament_setup_pairings_v1(
  input jsonb,
  next_revision bigint,
  actor_player text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  payload jsonb := case when pg_catalog.jsonb_typeof(input->'pairings') = 'object'
    then input->'pairings' else input end;
  target_match text := pg_catalog.btrim(coalesce(
    payload->>'match_id', payload->>'matchId', ''
  ));
  supplied_format text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    payload->>'format', ''
  )));
  participants_input jsonb := payload->'participants';
  normalized jsonb := '[]'::jsonb;
  item jsonb;
  player_value text;
  side_value integer;
  slot_value integer;
  expected_count integer;
  match_value scoring_authority.matches%rowtype;
  detail_value scoring_authority.tournament_setup_match_details_v1%rowtype;
  current_handicap uuid;
  current_manifest jsonb;
  context_value jsonb;
  participant_item jsonb;
  dependencies jsonb;
  next_permission_revision bigint;
  changed_value boolean := false;
begin
  if target_match = '' or pg_catalog.jsonb_typeof(participants_input)
       is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_PAIRINGS_INPUT_INVALID';
  end if;
  select value.* into strict match_value
  from scoring_authority.matches value
  where value.tournament_id = '2026' and value.match_id = target_match
  for update;
  select value.* into strict detail_value
  from scoring_authority.tournament_setup_match_details_v1 value
  where value.match_id = target_match for update;
  if supplied_format <> match_value.format then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_PAIRING_FORMAT_MISMATCH';
  end if;
  expected_count := case when match_value.format = 'SI' then 2 else 4 end;
  if pg_catalog.jsonb_array_length(participants_input) <> expected_count then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_PAIRING_COUNT_INVALID';
  end if;
  for item in select value
    from pg_catalog.jsonb_array_elements(participants_input) entry(value)
  loop
    begin
      player_value := pg_catalog.upper(pg_catalog.btrim(coalesce(
        item->>'player_id', item->>'playerId', ''
      )));
      side_value := coalesce(item->>'team_side', item->>'teamSide')::integer;
      slot_value := coalesce(item->>'player_slot', item->>'playerSlot')::integer;
    exception when others then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_SETUP_PAIRING_STRUCTURE_INVALID';
    end;
    if player_value = '' or side_value not in (1, 2)
       or slot_value not between 1 and (case when match_value.format = 'SI'
         then 1 else 2 end)
       or not exists (
         select 1 from scoring_authority.tournament_players membership
         where membership.tournament_id = '2026'
           and membership.player_id = player_value
           and membership.team_side = side_value
           and membership.participation_status = 'ACTIVE'
       ) then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_SETUP_PAIRING_ACTIVE_TEAM_MEMBERSHIP_REQUIRED';
    end if;
    normalized := normalized || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'player_id', player_value, 'team_side', side_value,
        'player_slot', slot_value
      )
    );
  end loop;
  select pg_catalog.jsonb_agg(value order by
      (value->>'team_side')::integer, (value->>'player_slot')::integer)
    into normalized
  from pg_catalog.jsonb_array_elements(normalized) value;
  if (select pg_catalog.count(distinct value->>'player_id')
      from pg_catalog.jsonb_array_elements(normalized) value) <> expected_count
     or (select pg_catalog.count(distinct
        (value->>'team_side') || ':' || (value->>'player_slot'))
      from pg_catalog.jsonb_array_elements(normalized) value) <> expected_count
     or (select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(normalized) value
      where (value->>'team_side')::integer = 1) <> expected_count / 2
     or (select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(normalized) value
      where (value->>'team_side')::integer = 2) <> expected_count / 2 then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_PAIRING_STRUCTURE_INVALID';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(normalized) requested
    join scoring_authority.match_participants participant
      on participant.player_id = requested->>'player_id'
    join scoring_authority.matches other_match
      on other_match.match_id = participant.match_id
     and other_match.tournament_id = '2026'
     and other_match.round_number = match_value.round_number
     and other_match.match_id <> target_match
  ) then
    raise exception using errcode = '23505',
      message = 'TOURNAMENT_SETUP_ROUND_DUPLICATE_PLAYER';
  end if;
  select current_value.revision_id into strict current_handicap
  from scoring_authority.handicap_revision_current current_value
  where current_value.tournament_id = '2026';
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(normalized) requested
    where not exists (
      select 1 from scoring_authority.handicap_revision_entries entry
      where entry.revision_id = current_handicap
        and entry.tournament_id = '2026'
        and entry.player_id = requested->>'player_id'
    )
  ) then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_PAIRING_APPROVED_HANDICAP_REQUIRED';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'player_id', participant.player_id,
    'team_side', participant.team_side,
    'player_slot', participant.player_slot
  ) order by participant.team_side, participant.player_slot), '[]'::jsonb)
  into current_manifest
  from scoring_authority.match_participants participant
  where participant.match_id = target_match;
  changed_value := current_manifest is distinct from normalized;
  if changed_value then
    perform production_control.assert_tournament_setup_match_mutable_v1(
      target_match
    );
    dependencies := production_control.tournament_setup_dependency_codes_v1(
      null, null, match_value.round_number, target_match, 'PAIRINGS'
    );
    if pg_catalog.jsonb_array_length(dependencies) > 0 then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'TOURNAMENT_SETUP_DEPENDENCY_BLOCKED',
        'blockers', dependencies
      );
    end if;
    next_permission_revision := match_value.permission_revision + 1;
    delete from scoring_authority.scoring_permissions permission
    where permission.match_id = target_match;
    delete from scoring_authority.match_participants participant
    where participant.match_id = target_match;
    insert into scoring_authority.match_participants (
      match_id, player_id, team_side, player_slot, tournament_handicap,
      handicap_index, course_handicap, playing_handicap, final_strokes,
      handicap_revision_id
    )
    select target_match, requested->>'player_id',
      (requested->>'team_side')::integer,
      (requested->>'player_slot')::integer,
      handicap.tournament_handicap, handicap.tournament_handicap,
      handicap.tournament_handicap, 0, 0, current_handicap
    from pg_catalog.jsonb_array_elements(normalized) requested
    join scoring_authority.handicap_revision_entries handicap
      on handicap.revision_id = current_handicap
     and handicap.tournament_id = '2026'
     and handicap.player_id = requested->>'player_id';
    context_value := production_control.handicap_v1_match_context(
      target_match, current_handicap
    );
    for participant_item in select value
      from pg_catalog.jsonb_array_elements(
        context_value->'participants'
      ) item(value)
    loop
      update scoring_authority.match_participants set
        tournament_handicap =
          (participant_item->>'tournament_handicap')::numeric,
        handicap_index = (participant_item->>'handicap_index')::numeric,
        course_handicap = (participant_item->>'course_handicap')::numeric,
        playing_handicap = (participant_item->>'playing_handicap')::numeric,
        final_strokes = (participant_item->>'final_strokes')::integer,
        handicap_revision_id = current_handicap
      where match_id = target_match
        and player_id = participant_item->>'player_id';
    end loop;
    insert into scoring_authority.scoring_permissions (
      match_id, player_id, can_score, permission_revision,
      revoked_at, updated_at
    )
    select target_match, requested->>'player_id', false,
      next_permission_revision, pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    from pg_catalog.jsonb_array_elements(normalized) requested;
    update scoring_authority.matches set
      permission_revision = next_permission_revision,
      match_revision = match_revision + 1,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = target_match;
    update scoring_authority.tournament_setup_match_details_v1 set
      setup_revision = next_revision,
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = target_match;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'changed', changed_value,
    'targetKind', 'PAIRINGS', 'targetId', target_match,
    'safeMetadata', pg_catalog.jsonb_build_object(
      'matchId', target_match, 'format', match_value.format,
      'participantCount', expected_count,
      'handicapRevisionId', current_handicap,
      'scoringPermissionGranted', false,
      'scoringMutationCreated', false
    )
  );
exception when no_data_found then
  raise exception using errcode = '22023',
    message = 'TOURNAMENT_SETUP_MATCH_DETAILS_REQUIRED';
end;
$$;

create or replace function production_control.apply_tournament_setup_scoring_context_v1(
  input jsonb,
  next_revision bigint,
  actor_player text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  payload jsonb := case
    when pg_catalog.jsonb_typeof(input->'scoring_context') = 'object'
      then input->'scoring_context'
    else input end;
  target_match text := pg_catalog.btrim(coalesce(
    payload->>'match_id', payload->>'matchId', ''
  ));
  match_value scoring_authority.matches%rowtype;
  current_snapshot scoring_authority.scoring_snapshots%rowtype;
  round_value scoring_authority.rounds%rowtype;
  detail_value scoring_authority.tournament_setup_match_details_v1%rowtype;
  course_value scoring_authority.tournament_setup_course_tees_v1%rowtype;
  current_handicap uuid;
  holes_value jsonb;
  participant_manifest jsonb;
  preparation_fingerprint text;
  next_snapshot_revision bigint;
  next_snapshot_id text;
  context_value jsonb;
  participant_item jsonb;
  next_snapshot_hash text;
  dependencies jsonb;
  expected_count integer;
  changed_value boolean := true;
begin
  if target_match = '' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_SCORING_CONTEXT_INPUT_INVALID';
  end if;
  select value.* into strict match_value
  from scoring_authority.matches value
  where value.tournament_id = '2026' and value.match_id = target_match
  for update;
  perform production_control.assert_tournament_setup_match_mutable_v1(
    target_match
  );
  select value.* into strict current_snapshot
  from scoring_authority.scoring_snapshots value
  where value.snapshot_id = match_value.scoring_snapshot_id
    and value.match_id = target_match for update;
  select value.* into strict round_value
  from scoring_authority.rounds value
  where value.tournament_id = '2026'
    and value.round_number = match_value.round_number;
  if match_value.format <> round_value.format then
    raise exception using errcode = '55000',
      message = 'TOURNAMENT_SETUP_MATCH_ROUND_FORMAT_MISMATCH';
  end if;
  select value.* into strict detail_value
  from scoring_authority.tournament_setup_match_details_v1 value
  where value.match_id = target_match for update;
  select value.* into strict course_value
  from scoring_authority.tournament_setup_course_tees_v1 value
  where value.tournament_id = '2026'
    and value.course_id = detail_value.course_id
    and value.tee_id = detail_value.tee_id;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'hole_number', hole.hole_number, 'par', hole.par,
    'stroke_index', hole.stroke_index, 'yardage', hole.yardage
  ) order by hole.hole_number) into holes_value
  from scoring_authority.tournament_setup_course_holes_v1 hole
  where hole.tournament_id = '2026'
    and hole.course_id = detail_value.course_id
    and hole.tee_id = detail_value.tee_id;
  if pg_catalog.jsonb_array_length(coalesce(holes_value, '[]'::jsonb)) <> 18
     or (select pg_catalog.sum((value->>'par')::integer)
       from pg_catalog.jsonb_array_elements(holes_value) value)
       <> course_value.par then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_COURSE_HOLES_INCOMPLETE';
  end if;
  expected_count := case when match_value.format = 'SI' then 2 else 4 end;
  if (select pg_catalog.count(*)
      from scoring_authority.match_participants participant
      where participant.match_id = target_match) <> expected_count then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_PAIRINGS_INCOMPLETE';
  end if;
  select current_value.revision_id into strict current_handicap
  from scoring_authority.handicap_revision_current current_value
  where current_value.tournament_id = '2026';
  if exists (
    select 1 from scoring_authority.match_participants participant
    where participant.match_id = target_match
      and not exists (
        select 1 from scoring_authority.handicap_revision_entries entry
        where entry.revision_id = current_handicap
          and entry.tournament_id = '2026'
          and entry.player_id = participant.player_id
      )
  ) then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_APPROVED_HANDICAP_COVERAGE_REQUIRED';
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'player_id', participant.player_id,
    'team_side', participant.team_side,
    'player_slot', participant.player_slot
  ) order by participant.team_side, participant.player_slot)
  into participant_manifest
  from scoring_authority.match_participants participant
  where participant.match_id = target_match;
  preparation_fingerprint := production_control.tournament_setup_hash_v1(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-tournament-setup-v1',
      'tournament_id', '2026', 'match_id', target_match,
      'round_number', match_value.round_number, 'format', match_value.format,
      'handicap_allowance', round_value.handicap_allowance,
      'course_id', detail_value.course_id, 'tee', detail_value.tee_id,
      'starting_hole', detail_value.starting_hole,
      'rating', course_value.rating, 'slope', course_value.slope,
      'par', course_value.par, 'holes', holes_value,
      'participants', participant_manifest,
      'handicap_revision_id', current_handicap,
      'setup_revision', detail_value.setup_revision
    )
  );
  if detail_value.prepared_setup_revision = detail_value.setup_revision
     and detail_value.prepared_configuration_fingerprint =
       preparation_fingerprint
     and current_snapshot.handicap_revision_id = current_handicap
     and current_snapshot.course_id = detail_value.course_id
     and current_snapshot.tee = detail_value.tee_id then
    changed_value := false;
  end if;
  if changed_value then
    dependencies := production_control.tournament_setup_dependency_codes_v1(
      null, null, match_value.round_number, target_match, 'SCORING_CONTEXT'
    );
    if pg_catalog.jsonb_array_length(dependencies) > 0 then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'TOURNAMENT_SETUP_DEPENDENCY_BLOCKED',
        'blockers', dependencies
      );
    end if;
    select coalesce(pg_catalog.max(snapshot.snapshot_revision), 0) + 1
      into next_snapshot_revision
    from scoring_authority.scoring_snapshots snapshot
    where snapshot.match_id = target_match;
    next_snapshot_id := target_match || ':S' || next_snapshot_revision::text;
    next_snapshot_hash := production_control.tournament_setup_hash_v1(
      pg_catalog.jsonb_build_object(
        'preparation_fingerprint', preparation_fingerprint,
        'snapshot_revision', next_snapshot_revision,
        'state', 'PREPARING'
      )
    );
    insert into scoring_authority.scoring_snapshots (
      snapshot_id, tournament_id, match_id, snapshot_revision,
      scoring_rules_version, format, handicap_allowance,
      course_id, tee, rating, slope, par, match_netting_baseline,
      hole_definitions, participant_configuration, team_configuration,
      effective_at, canonical_hash, handicap_revision_id
    ) values (
      next_snapshot_id, '2026', target_match, next_snapshot_revision,
      current_snapshot.scoring_rules_version, match_value.format,
      round_value.handicap_allowance,
      detail_value.course_id, detail_value.tee_id, course_value.rating,
      course_value.slope, course_value.par,
      current_snapshot.match_netting_baseline, holes_value,
      current_snapshot.participant_configuration,
      current_snapshot.team_configuration,
      pg_catalog.clock_timestamp(), next_snapshot_hash, current_handicap
    );
    update scoring_authority.matches set
      scoring_snapshot_id = next_snapshot_id,
      match_revision = match_revision + 1,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = target_match;
    context_value := production_control.handicap_v1_match_context(
      target_match, current_handicap
    );
    for participant_item in select value
      from pg_catalog.jsonb_array_elements(
        context_value->'participants'
      ) item(value)
    loop
      update scoring_authority.match_participants set
        tournament_handicap =
          (participant_item->>'tournament_handicap')::numeric,
        handicap_index = (participant_item->>'handicap_index')::numeric,
        course_handicap = (participant_item->>'course_handicap')::numeric,
        playing_handicap = (participant_item->>'playing_handicap')::numeric,
        final_strokes = (participant_item->>'final_strokes')::integer,
        handicap_revision_id = current_handicap
      where match_id = target_match
        and player_id = participant_item->>'player_id';
    end loop;
    next_snapshot_hash := production_control.tournament_setup_hash_v1(
      pg_catalog.jsonb_build_object(
        'preparation_fingerprint', preparation_fingerprint,
        'snapshot_revision', next_snapshot_revision,
        'participants', context_value->'participant_configuration',
        'teams', context_value->'team_configuration'
      )
    );
    update scoring_authority.scoring_snapshots set
      participant_configuration = context_value->'participant_configuration',
      team_configuration = context_value->'team_configuration',
      canonical_hash = next_snapshot_hash,
      handicap_revision_id = current_handicap
    where snapshot_id = next_snapshot_id;
    delete from scoring_authority.match_holes hole
    where hole.match_id = target_match;
    insert into scoring_authority.match_holes (
      match_id, hole_number, snapshot_id, stroke_index, par, yardage
    ) select target_match, (value->>'hole_number')::integer,
      next_snapshot_id, (value->>'stroke_index')::integer,
      (value->>'par')::integer, nullif(value->>'yardage', '')::integer
    from pg_catalog.jsonb_array_elements(holes_value) value;
    update scoring_authority.tournament_setup_match_details_v1 set
      prepared_setup_revision = setup_revision,
      prepared_configuration_fingerprint = preparation_fingerprint,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = target_match;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'changed', changed_value,
    'targetKind', 'SCORING_CONTEXT', 'targetId', target_match,
    'snapshotPrepared', true,
    'safeMetadata', pg_catalog.jsonb_build_object(
      'matchId', target_match,
      'snapshotId', case when changed_value then next_snapshot_id
        else current_snapshot.snapshot_id end,
      'snapshotRevision', case when changed_value then next_snapshot_revision
        else current_snapshot.snapshot_revision end,
      'handicapRevisionId', current_handicap,
      'scoringPermissionGranted', false,
      'scoringMutationCreated', false
    )
  );
exception when no_data_found then
  raise exception using errcode = '22023',
    message = 'TOURNAMENT_SETUP_SCORING_CONTEXT_REQUIRED_FACT_MISSING';
end;
$$;

create trigger production_tournament_setup_receipt_immutable_v1
before update or delete
on production_control.tournament_setup_operation_receipts_v1
for each row execute function
  production_control.reject_tournament_setup_immutable_v1();

create trigger production_tournament_setup_audit_immutable_v1
before update or delete
on production_control.tournament_setup_audit_events_v1
for each row execute function
  production_control.reject_tournament_setup_immutable_v1();

create or replace function production_control.tournament_setup_hash_v1(
  value jsonb
)
returns text
language sql
immutable
set search_path = pg_catalog, extensions
as $$
  select pg_catalog.encode(extensions.digest(value::text, 'sha256'), 'hex')
$$;

-- Match-local readiness gate used by the existing Production MARK_LIVE path.
-- Legacy certified matches remain valid without a setup overlay. Once a match
-- has been edited through Tournament Setup, its revisioned prepared marker and
-- the current canonical setup facts are required. This function is read-only.
create or replace function production_control.assert_production_match_scoring_ready_v1(
  target_match_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  reasons jsonb := '[]'::jsonb;
  match_value scoring_authority.matches%rowtype;
  round_value scoring_authority.rounds%rowtype;
  detail_value scoring_authority.tournament_setup_match_details_v1%rowtype;
  assignment_value scoring_authority.tournament_setup_round_courses_v1%rowtype;
  course_value scoring_authority.tournament_setup_course_tees_v1%rowtype;
  snapshot_value scoring_authority.scoring_snapshots%rowtype;
  current_handicap uuid;
  holes_value jsonb;
  match_holes_value jsonb;
  context_value jsonb;
  current_participant_values jsonb;
  expected_count integer;
  participant_count integer;
begin
  select value.* into match_value
  from scoring_authority.matches value
  where value.tournament_id = '2026'
    and value.match_id = target_match_id;
  if match_value.match_id is null then
    return pg_catalog.jsonb_build_object(
      'ready', false,
      'contractVersion', 'production-match-scoring-readiness-v1',
      'matchId', target_match_id,
      'reasons', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'MATCH_NOT_FOUND',
          'message', 'The canonical Production match does not exist.'
        )
      )
    );
  end if;

  select value.* into round_value
  from scoring_authority.rounds value
  where value.tournament_id = '2026'
    and value.round_number = match_value.round_number;
  if round_value.tournament_id is null
     or round_value.round_number not between 1 and 3
     or round_value.format not in ('BB', 'SC', 'SI')
     or round_value.format is distinct from match_value.format then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROUND_CONFIGURATION_INVALID',
        'message', 'The match does not match its canonical round configuration.'
      )
    );
  end if;

  select value.* into snapshot_value
  from scoring_authority.scoring_snapshots value
  where value.snapshot_id = match_value.scoring_snapshot_id
    and value.tournament_id = '2026'
    and value.match_id = target_match_id;
  if snapshot_value.snapshot_id is null
     or snapshot_value.snapshot_revision is distinct from (
       select pg_catalog.max(candidate.snapshot_revision)
       from scoring_authority.scoring_snapshots candidate
       where candidate.match_id = target_match_id
     ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCORING_SNAPSHOT_NOT_CURRENT',
        'message', 'The match needs its latest scoring snapshot prepared.'
      )
    );
  end if;

  select value.* into detail_value
  from scoring_authority.tournament_setup_match_details_v1 value
  where value.tournament_id = '2026'
    and value.match_id = target_match_id;
  if detail_value.match_id is not null then
    if detail_value.round_number is distinct from match_value.round_number
       or detail_value.prepared_setup_revision is distinct from
         detail_value.setup_revision
       or detail_value.prepared_configuration_fingerprint is null then
      reasons := reasons || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'SETUP_SNAPSHOT_STALE',
          'message', 'The match setup changed after its scoring snapshot was prepared.'
        )
      );
    end if;
    select value.* into assignment_value
    from scoring_authority.tournament_setup_round_courses_v1 value
    where value.tournament_id = '2026'
      and value.round_number = match_value.round_number;
    if assignment_value.tournament_id is null
       or assignment_value.course_id is distinct from detail_value.course_id
       or assignment_value.tee_id is distinct from detail_value.tee_id then
      reasons := reasons || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'ROUND_COURSE_ASSIGNMENT_INVALID',
          'message', 'The match course and tee do not match the round assignment.'
        )
      );
    end if;
    select value.* into course_value
    from scoring_authority.tournament_setup_course_tees_v1 value
    where value.tournament_id = '2026'
      and value.course_id = detail_value.course_id
      and value.tee_id = detail_value.tee_id;
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'hole_number', hole.hole_number,
      'par', hole.par,
      'stroke_index', hole.stroke_index,
      'yardage', hole.yardage
    ) order by hole.hole_number) into holes_value
    from scoring_authority.tournament_setup_course_holes_v1 hole
    where hole.tournament_id = '2026'
      and hole.course_id = detail_value.course_id
      and hole.tee_id = detail_value.tee_id;
  else
    -- Migration installation is inert. Existing certified snapshots remain the
    -- canonical setup source until a Director explicitly edits this match.
    course_value.tournament_id := '2026';
    course_value.course_id := snapshot_value.course_id;
    course_value.tee_id := snapshot_value.tee;
    course_value.rating := snapshot_value.rating;
    course_value.slope := snapshot_value.slope;
    course_value.par := snapshot_value.par;
    holes_value := snapshot_value.hole_definitions;
  end if;
  if course_value.tournament_id is null
     or course_value.rating is null
     or course_value.slope not between 55 and 155
     or course_value.par not between 54 and 90 then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'COURSE_CONFIGURATION_INVALID',
        'message', 'The match course and tee scoring facts are incomplete.'
      )
    );
  end if;
  if pg_catalog.jsonb_typeof(holes_value) is distinct from 'array'
     or pg_catalog.jsonb_array_length(coalesce(holes_value, '[]'::jsonb)) <> 18
     or (select pg_catalog.count(distinct (hole->>'hole_number')::integer)
       from pg_catalog.jsonb_array_elements(coalesce(holes_value, '[]'::jsonb)) hole)
       <> 18
     or (select pg_catalog.count(distinct (hole->>'stroke_index')::integer)
       from pg_catalog.jsonb_array_elements(coalesce(holes_value, '[]'::jsonb)) hole)
       <> 18
     or (select pg_catalog.sum((hole->>'par')::integer)
       from pg_catalog.jsonb_array_elements(coalesce(holes_value, '[]'::jsonb)) hole)
       is distinct from course_value.par then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'COURSE_HOLES_INCOMPLETE',
        'message', 'The course requires 18 complete, valid hole definitions.'
      )
    );
  end if;
  if snapshot_value.snapshot_id is not null and (
       snapshot_value.format is distinct from match_value.format
       or snapshot_value.handicap_allowance is distinct from
         round_value.handicap_allowance
       or snapshot_value.course_id is distinct from course_value.course_id
       or snapshot_value.tee is distinct from course_value.tee_id
       or snapshot_value.rating is distinct from course_value.rating
       or snapshot_value.slope is distinct from course_value.slope
       or snapshot_value.par is distinct from course_value.par
       or snapshot_value.hole_definitions is distinct from holes_value
     ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCORING_SNAPSHOT_CONFIGURATION_STALE',
        'message', 'The scoring snapshot no longer matches the current setup facts.'
      )
    );
  end if;

  expected_count := case when match_value.format = 'SI' then 2 else 4 end;
  select pg_catalog.count(*)::integer into participant_count
  from scoring_authority.match_participants participant
  where participant.match_id = target_match_id;
  if participant_count <> expected_count
     or (select pg_catalog.count(distinct participant.player_id)
       from scoring_authority.match_participants participant
       where participant.match_id = target_match_id) <> expected_count
     or (select pg_catalog.count(*)
       from scoring_authority.match_participants participant
       where participant.match_id = target_match_id and participant.team_side = 1)
       <> expected_count / 2
     or (select pg_catalog.count(*)
       from scoring_authority.match_participants participant
       where participant.match_id = target_match_id and participant.team_side = 2)
       <> expected_count / 2 then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'PAIRINGS_INCOMPLETE',
        'message', 'The match requires complete, unique Player pairings.'
      )
    );
  end if;
  if exists (
    select 1
    from scoring_authority.match_participants participant
    left join scoring_authority.tournament_players membership
      on membership.tournament_id = '2026'
     and membership.player_id = participant.player_id
    left join scoring_authority.teams team
      on team.tournament_id = membership.tournament_id
     and team.team_id = membership.team_id
     and team.team_side = membership.team_side
    where participant.match_id = target_match_id
      and (membership.player_id is null
        or membership.participation_status <> 'ACTIVE'
        or membership.team_side <> participant.team_side
        or team.team_id is null)
  ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'PAIRING_TEAM_MEMBERSHIP_INVALID',
        'message', 'A paired Player does not have the required active team membership.'
      )
    );
  end if;
  if exists (
    select 1
    from scoring_authority.match_participants participant
    join scoring_authority.matches other_match
      on other_match.match_id = participant.match_id
     and other_match.tournament_id = '2026'
     and other_match.round_number = match_value.round_number
    where participant.player_id in (
      select current_participant.player_id
      from scoring_authority.match_participants current_participant
      where current_participant.match_id = target_match_id
    )
    group by participant.player_id
    having pg_catalog.count(*) > 1
  ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROUND_DUPLICATE_PLAYER',
        'message', 'A paired Player appears more than once in this round.'
      )
    );
  end if;

  select value.revision_id into current_handicap
  from scoring_authority.handicap_revision_current value
  where value.tournament_id = '2026';
  if current_handicap is null
     or snapshot_value.handicap_revision_id is distinct from current_handicap
     or exists (
       select 1
       from scoring_authority.match_participants participant
       left join scoring_authority.handicap_revision_entries entry
         on entry.revision_id = current_handicap
        and entry.tournament_id = '2026'
        and entry.player_id = participant.player_id
       where participant.match_id = target_match_id
         and (entry.player_id is null
           or participant.handicap_revision_id is distinct from current_handicap)
     ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'HANDICAP_CONTEXT_NOT_CURRENT',
        'message', 'Every paired Player needs the current approved handicap context.'
      )
    );
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'hole_number', hole.hole_number,
    'par', hole.par,
    'stroke_index', hole.stroke_index,
    'yardage', hole.yardage
  ) order by hole.hole_number) into match_holes_value
  from scoring_authority.match_holes hole
  where hole.match_id = target_match_id
    and hole.snapshot_id = snapshot_value.snapshot_id;
  if match_holes_value is distinct from holes_value then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCORING_HOLES_NOT_CURRENT',
        'message', 'The match hole scoring context is not current.'
      )
    );
  end if;
  if (select pg_catalog.count(*)
      from scoring_authority.scoring_permissions permission
      where permission.match_id = target_match_id) <> participant_count
     or exists (
       select 1
       from scoring_authority.match_participants participant
       left join scoring_authority.scoring_permissions permission
         on permission.match_id = participant.match_id
        and permission.player_id = participant.player_id
       where participant.match_id = target_match_id
         and (permission.player_id is null
           or permission.permission_revision <> match_value.permission_revision
           or (detail_value.match_id is not null and not (
              (permission.can_score and permission.revoked_at is null)
              or (not permission.can_score and permission.revoked_at is not null)
            ))
           or (detail_value.match_id is null
             and permission.can_score and permission.revoked_at is not null))
     )
     or exists (
       select 1
       from scoring_authority.scoring_permissions permission
       left join scoring_authority.match_participants participant
         on participant.match_id = permission.match_id
        and participant.player_id = permission.player_id
       where permission.match_id = target_match_id
         and participant.player_id is null
     )
     or (
       exists (
         select 1 from scoring_authority.scoring_permissions permission
         where permission.match_id = target_match_id and permission.can_score
       )
       and exists (
         select 1 from scoring_authority.scoring_permissions permission
         where permission.match_id = target_match_id and not permission.can_score
       )
     ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCORING_PERMISSION_COVERAGE_INVALID',
        'message', 'Scoring access records do not match the current pairings.'
      )
    );
  end if;
  if match_value.scored_holes <> 0
     or match_value.current_hole <> 0
     or match_value.holes_remaining <> 18
     or match_value.team_1_holes_won <> 0
     or match_value.team_2_holes_won <> 0
     or match_value.running_result <> 'Scheduled'
     or match_value.result_winner <> ''
     or match_value.clinched
     or match_value.scorecard_complete
     or match_value.finalized_at is not null
     or match_value.unresolved_mutations <> 0
     or exists (
       select 1 from scoring_authority.hole_scores score
       where score.match_id = target_match_id
     )
     or exists (
       select 1 from scoring_authority.score_mutations mutation
       where mutation.match_id = target_match_id
         and mutation.mutation_type in ('HOLE_SCORE', 'FINALIZE', 'REOPEN')
     )
     or exists (
       select 1 from scoring_authority.finalized_scorecard_snapshots final_value
       where final_value.match_id = target_match_id
     )
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026'
         and lease.match_id = target_match_id
         and lease.expires_at > pg_catalog.clock_timestamp()
     ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'MATCH_ALREADY_HAS_SCORING_ACTIVITY',
        'message', 'The match already has scoring activity and cannot be started from setup.'
      )
    );
  end if;

  if pg_catalog.jsonb_array_length(reasons) = 0 then
    begin
      context_value := production_control.handicap_v1_match_context(
        target_match_id, current_handicap
      );
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'match_id', participant.match_id,
        'player_id', participant.player_id,
        'team_side', participant.team_side,
        'player_slot', participant.player_slot,
        'tournament_handicap', participant.tournament_handicap,
        'handicap_index', participant.handicap_index,
        'course_handicap', participant.course_handicap,
        'playing_handicap', participant.playing_handicap,
        'final_strokes', participant.final_strokes
      ) order by participant.team_side, participant.player_slot)
      into current_participant_values
      from scoring_authority.match_participants participant
      where participant.match_id = target_match_id;
      if current_participant_values is distinct from
           context_value->'participants' then
        reasons := reasons || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'SCORING_PARTICIPANT_HANDICAPS_STALE',
            'message', 'The paired Player handicap values must be refreshed.'
          )
        );
      end if;
      if snapshot_value.participant_configuration is distinct from
           context_value->'participant_configuration'
         or snapshot_value.team_configuration is distinct from
           context_value->'team_configuration' then
        reasons := reasons || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'SCORING_HANDICAP_PROJECTION_STALE',
            'message', 'The scoring handicap projection must be refreshed.'
          )
        );
      end if;
    exception when others then
      reasons := reasons || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'SCORING_HANDICAP_PROJECTION_INCOMPLETE',
          'message', 'The scoring handicap projection is incomplete.'
        )
      );
    end;
  end if;

  return pg_catalog.jsonb_build_object(
    'ready', pg_catalog.jsonb_array_length(reasons) = 0,
    'contractVersion', 'production-match-scoring-readiness-v1',
    'matchId', target_match_id,
    'source', case when detail_value.match_id is null
      then 'CERTIFIED_CANONICAL_SNAPSHOT'
      else 'TOURNAMENT_SETUP_V1' end,
    'reasons', reasons
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'ready', false,
    'contractVersion', 'production-match-scoring-readiness-v1',
    'matchId', target_match_id,
    'reasons', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCORING_READINESS_UNAVAILABLE',
        'message', 'Scoring readiness could not be verified safely.'
      )
    )
  );
end;
$$;

create or replace function production_control.tournament_setup_revision_v1(
  target_tournament text
)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, production_control
as $$
  select coalesce((
    select value.revision
    from production_control.tournament_setup_context_v1 value
    where value.tournament_id = target_tournament
  ), 0)::bigint
$$;

create or replace function production_control.assert_tournament_setup_match_mutable_v1(
  target_match_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  match_value scoring_authority.matches%rowtype;
begin
  select value.* into strict match_value
  from scoring_authority.matches value
  where value.tournament_id = '2026' and value.match_id = target_match_id
  for update;
  perform 1
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.match_id = target_match_id
    and lease.expires_at > pg_catalog.clock_timestamp()
  for update;
  if not production_control.handicap_v1_match_is_unstarted(target_match_id)
     or exists (
       select 1 from scoring_authority.scoring_permissions permission
       where permission.match_id = target_match_id
         and (permission.can_score or permission.revoked_at is null
           or permission.permission_revision
             <> match_value.permission_revision)
     )
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026'
         and lease.match_id = target_match_id
         and lease.expires_at > pg_catalog.clock_timestamp()
     ) then
    raise exception using errcode = '55000',
      message = 'TOURNAMENT_SETUP_MATCH_FROZEN';
  end if;
exception when no_data_found then
  raise exception using errcode = '22023',
    message = 'TOURNAMENT_SETUP_MATCH_NOT_FOUND';
end;
$$;

create or replace function production_control.assert_tournament_setup_runtime_v1(
  input jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control
as $$
begin
  -- Reuse the installed exact-resource, Supabase-authority, current-runtime,
  -- linked-identity, and active Director entitlement proof. Only the contract
  -- discriminator is rebound; caller authorization/resource assertions are not.
  perform production_control.assert_player_access_runtime_v1(
    input || pg_catalog.jsonb_build_object(
      'contract_version', 'production-players-access-v1'
    )
  );
  if input->>'contract_version'
       is distinct from 'production-tournament-setup-v1'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_TOURNAMENT_SETUP_SCOPE_REQUIRED';
  end if;
end;
$$;

create or replace function production_control.tournament_setup_dependency_codes_v1(
  target_player text default null,
  target_team text default null,
  target_round integer default null,
  target_match text default null,
  change_kind text default 'STRUCTURAL'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  codes jsonb := '[]'::jsonb;
  current_draft uuid;
  target_kind text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    change_kind, 'STRUCTURAL'
  )));
begin
  if target_kind <> 'TOURNAMENT_METADATA' and exists (
    select 1
    from scoring_authority.matches match_value
    where match_value.tournament_id = '2026'
      and (target_match is null or match_value.match_id = target_match)
      and (target_round is null or match_value.round_number = target_round)
      and (
        target_player is null or exists (
          select 1 from scoring_authority.match_participants participant
          where participant.match_id = match_value.match_id
            and participant.player_id = target_player
        )
      )
      and (
        target_team is null or exists (
          select 1
          from scoring_authority.match_participants participant
          join scoring_authority.tournament_players membership
            on membership.tournament_id = match_value.tournament_id
           and membership.player_id = participant.player_id
          where participant.match_id = match_value.match_id
            and membership.team_id = target_team
        )
      )
      and not production_control.handicap_v1_match_is_unstarted(
        match_value.match_id
      )
  ) then
    codes := codes || pg_catalog.jsonb_build_array('STARTED_MATCH_DEPENDENCY');
  end if;
  if target_kind <> 'TOURNAMENT_METADATA' and exists (
    select 1
    from scoring_authority.matches match_value
    where match_value.tournament_id = '2026'
      and (target_match is null or match_value.match_id = target_match)
      and (target_round is null or match_value.round_number = target_round)
      and (
        exists (
          select 1 from scoring_authority.scoring_permissions permission
          where permission.match_id = match_value.match_id
            and (permission.can_score or permission.revoked_at is null
              or permission.permission_revision
                <> match_value.permission_revision)
        ) or exists (
          select 1 from scoring_authority.scoring_ingress_leases lease
          where lease.tournament_id = '2026'
            and lease.match_id = match_value.match_id
            and lease.expires_at > pg_catalog.clock_timestamp()
        )
      )
  ) then
    codes := codes || pg_catalog.jsonb_build_array(
      'ACTIVE_SCORING_ACCESS_DEPENDENCY'
    );
  end if;

  select current_value.revision_id into current_draft
  from scoring_authority.draft_current_revisions current_value
  where current_value.tournament_id = '2026';
  if current_draft is not null and (
    (target_player is not null and exists (
      select 1 from scoring_authority.draft_pick_facts pick
      where pick.revision_id = current_draft
        and pick.tournament_id = '2026'
        and pick.player_id = target_player
        and pick.pick_status = 'SELECTED'
        and (target_team is null or pick.team_id is distinct from target_team)
    )) or
    (target_team is not null and target_kind = 'TEAM' and exists (
      select 1 from scoring_authority.draft_configuration_facts config
      where config.revision_id = current_draft
        and config.tournament_id = '2026'
        and target_team in (config.team_1_id, config.team_2_id)
    )) or
    (target_player is not null and target_kind = 'TEAM' and exists (
      select 1 from scoring_authority.draft_configuration_facts config
      where config.revision_id = current_draft
        and config.tournament_id = '2026'
        and target_player in (
          config.team_1_captain_player_id, config.team_2_captain_player_id
        )
    ))
  ) then
    codes := codes || pg_catalog.jsonb_build_array('DRAFT_DEPENDENCY');
  end if;

  if target_kind in (
       'ROSTER', 'ROUND', 'COURSE', 'MATCH', 'PAIRINGS', 'SCORING_CONTEXT'
     ) and exists (
    select 1
    from scoring_authority.net_skins_v1_configuration_current current_value
    join scoring_authority.net_skins_v1_configuration_revisions revision_value
      on revision_value.configuration_revision_id =
        current_value.configuration_revision_id
    where current_value.tournament_id = '2026'
      and current_value.state = 'CONFIGURED'
      and (
        target_round is null or exists (
          select 1
          from pg_catalog.jsonb_array_elements(coalesce(
            revision_value.configuration_manifest->'rounds', '[]'::jsonb
          )) round_value
          where (round_value->>'round_number')::integer = target_round
            and (target_match is null or target_match in (
              select pg_catalog.jsonb_array_elements_text(coalesce(
                round_value->'match_ids', '[]'::jsonb
              ))
            ))
        )
      )
  ) then
    codes := codes || pg_catalog.jsonb_build_array(
      'NET_SKINS_CONFIGURATION_DEPENDENCY'
    );
  end if;
  if target_kind in (
       'ROSTER', 'ROUND', 'COURSE', 'MATCH', 'PAIRINGS', 'SCORING_CONTEXT'
     ) and (
    exists (
      select 1 from scoring_authority.net_skins_v1_recalculation_jobs job
      where job.tournament_id = '2026'
        and job.status in ('PENDING', 'RUNNING')
        and (target_round is null or job.round_number = target_round)
    ) or exists (
      select 1 from scoring_authority.net_skins_v1_result_revisions result_value
      where result_value.tournament_id = '2026'
        and result_value.is_current
        and (target_round is null or result_value.round_number = target_round)
    )
  ) then
    codes := codes || pg_catalog.jsonb_build_array('NET_SKINS_RESULT_DEPENDENCY');
  end if;

  if target_kind in (
       'ROSTER', 'ROUND', 'COURSE', 'MATCH', 'PAIRINGS', 'SCORING_CONTEXT'
     ) and exists (
    select 1
    from scoring_authority.calcutta_v1_current current_value
    where current_value.tournament_id = '2026'
      and current_value.auction_revision > 0
      and (
        target_player is null
        or exists (
          select 1
          from scoring_authority.calcutta_v1_auction_fact_revisions auction
          cross join lateral pg_catalog.jsonb_array_elements(coalesce(
            auction.auction_manifest->'purchases', '[]'::jsonb
          )) purchase
          where auction.auction_revision_id = current_value.auction_revision_id
            and purchase->>'player_id' = target_player
        )
        or exists (
          select 1
          from scoring_authority.calcutta_v1_auction_fact_revisions auction
          cross join lateral pg_catalog.jsonb_array_elements(coalesce(
            auction.auction_manifest->'ownership', '[]'::jsonb
          )) owner_value
          where auction.auction_revision_id = current_value.auction_revision_id
            and owner_value->>'owner_player_id' = target_player
        )
      )
  ) then
    codes := codes || pg_catalog.jsonb_build_array('CALCUTTA_AUCTION_DEPENDENCY');
  end if;
  if target_kind in (
       'ROUND', 'COURSE', 'MATCH', 'PAIRINGS', 'SCORING_CONTEXT'
     ) and (
    exists (
      select 1 from scoring_authority.calcutta_v1_current current_value
      where current_value.tournament_id = '2026'
        and (current_value.publication_state = 'PUBLISHED'
          or current_value.result_revision > 0)
    ) or exists (
      select 1 from scoring_authority.calcutta_v1_recalculation_jobs job
      where job.tournament_id = '2026'
        and job.status in ('PENDING', 'RUNNING')
    )
  ) then
    codes := codes || pg_catalog.jsonb_build_array('CALCUTTA_RESULT_DEPENDENCY');
  end if;

  if target_kind in (
       'ROSTER', 'TEAM', 'ROUND', 'COURSE', 'MATCH', 'PAIRINGS',
       'SCORING_CONTEXT'
     ) and (
    exists (
      select 1 from scoring_authority.odds_publication_current current_value
      where current_value.tournament_id = '2026'
        and current_value.publication_state = 'PUBLISHED'
    ) or exists (
      select 1 from scoring_authority.odds_calculation_jobs job
      where job.tournament_id = '2026'
        and (
          job.status in ('PENDING', 'RUNNING', 'RETRYABLE')
          or (job.status = 'SUCCEEDED' and job.publication_status = 'READY')
        )
    )
  ) then
    codes := codes || pg_catalog.jsonb_build_array('ODDS_PUBLICATION_DEPENDENCY');
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(value order by value)
    from (
      select distinct item #>> '{}' as value
      from pg_catalog.jsonb_array_elements(codes) item
    ) deduplicated
  ), '[]'::jsonb);
end;
$$;

create or replace function production_control.tournament_setup_section_state_v1(
  blockers jsonb,
  section_name text,
  source_present boolean,
  locked_state boolean default false
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when locked_state then 'LOCKED'
    when not source_present then 'NOT_STARTED'
    when exists (
      select 1 from pg_catalog.jsonb_array_elements(coalesce(blockers, '[]'::jsonb))
        blocker
      where blocker->>'section' = section_name
    ) then 'NEEDS_ATTENTION'
    else 'COMPLETE'
  end
$$;

create or replace function production_control.tournament_setup_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  blockers jsonb := '[]'::jsonb;
  tournament_value scoring_authority.tournaments%rowtype;
  operational_value scoring_authority.tournament_setup_operational_v1%rowtype;
  active_roster integer := 0;
  handicap_covered integer := 0;
  team_count integer := 0;
  round_count integer := 0;
  match_count integer := 0;
  paired_count integer := 0;
  snapshot_ready_count integer := 0;
  started_count integer := 0;
  net_skins_ready boolean := false;
  net_skins_state text := 'NOT_READY';
  calcutta_state text := 'NOT_CONFIGURED';
  expected_matches integer := 0;
  value record;
begin
  select item.* into strict tournament_value
  from scoring_authority.tournaments item
  where item.tournament_id = '2026';
  select item.* into operational_value
  from scoring_authority.tournament_setup_operational_v1 item
  where item.tournament_id = '2026';

  if pg_catalog.btrim(coalesce(tournament_value.name, '')) = '' then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'TOURNAMENT_NAME_REQUIRED', 'section', 'tournament',
        'message', 'Tournament name is required.'
      )
    );
  end if;
  if operational_value.tournament_id is null then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'TOURNAMENT_OPERATIONAL_METADATA_NOT_STARTED',
        'section', 'tournament',
        'message', 'Tournament dates, destination, and timezone need review.'
      )
    );
  else
    if operational_value.start_date is null
       or operational_value.end_date is null then
      blockers := blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'TOURNAMENT_DATES_REQUIRED', 'section', 'tournament',
          'message', 'Tournament start and end dates are required.'
        )
      );
    end if;
    if pg_catalog.btrim(coalesce(operational_value.destination, '')) = '' then
      blockers := blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'TOURNAMENT_DESTINATION_REQUIRED', 'section', 'tournament',
          'message', 'Tournament destination is required.'
        )
      );
    end if;
    if pg_catalog.btrim(coalesce(operational_value.timezone, '')) = '' then
      blockers := blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'TOURNAMENT_TIMEZONE_REQUIRED', 'section', 'tournament',
          'message', 'Tournament timezone is required.'
        )
      );
    end if;
  end if;

  select pg_catalog.count(*)::integer into team_count
  from scoring_authority.teams team
  where team.tournament_id = '2026';
  if team_count <> 2 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'TWO_TEAMS_REQUIRED', 'section', 'teams',
        'message', 'Exactly two tournament teams are required.',
        'currentCount', team_count
      )
    );
  end if;
  for value in
    select team.team_id, team.name, team.team_side,
      coalesce(detail.captain_player_id,
        nullif(team.source_payload->>'Captain', '')) captain_player_id
    from scoring_authority.teams team
    left join scoring_authority.tournament_setup_team_details_v1 detail
      on detail.tournament_id = team.tournament_id
     and detail.team_id = team.team_id
    where team.tournament_id = '2026'
    order by team.team_side
  loop
    if pg_catalog.btrim(coalesce(value.name, '')) = '' then
      blockers := blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'TEAM_NAME_REQUIRED', 'section', 'teams',
          'target', value.team_id,
          'message', pg_catalog.format('%s needs a team name.', value.team_id)
        )
      );
    end if;
    if value.captain_player_id is null or not exists (
      select 1 from scoring_authority.tournament_players membership
      where membership.tournament_id = '2026'
        and membership.player_id = value.captain_player_id
        and membership.team_id = value.team_id
        and membership.participation_status = 'ACTIVE'
    ) then
      blockers := blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'TEAM_CAPTAIN_REQUIRED', 'section', 'teams',
          'target', value.team_id,
          'message', pg_catalog.format(
            '%s needs an active roster captain.', value.name
          )
        )
      );
    end if;
  end loop;

  select pg_catalog.count(*)::integer into active_roster
  from scoring_authority.tournament_players membership
  where membership.tournament_id = '2026'
    and membership.participation_status = 'ACTIVE';
  if active_roster = 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ACTIVE_ROSTER_REQUIRED', 'section', 'roster',
        'message', 'Add active Players to the tournament roster.'
      )
    );
  end if;
  if active_roster > 0 and active_roster % 4 <> 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROSTER_FORMAT_DIVISIBILITY_INVALID', 'section', 'roster',
        'message',
          'The active roster must divide evenly into Best Ball and Scramble matches.'
      )
    );
  end if;
  if exists (
    select 1 from scoring_authority.tournament_players membership
    left join scoring_authority.teams team
      on team.tournament_id = membership.tournament_id
     and team.team_id = membership.team_id
     and team.team_side = membership.team_side
    where membership.tournament_id = '2026'
      and membership.participation_status = 'ACTIVE'
      and team.team_id is null
  ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROSTER_TEAM_ASSIGNMENT_INVALID', 'section', 'roster',
        'message', 'Every active roster Player needs a valid team assignment.'
      )
    );
  end if;
  select pg_catalog.count(*)::integer into handicap_covered
  from scoring_authority.tournament_players membership
  join scoring_authority.handicap_revision_current current_value
    on current_value.tournament_id = membership.tournament_id
  join scoring_authority.handicap_revision_entries entry
    on entry.revision_id = current_value.revision_id
   and entry.tournament_id = membership.tournament_id
   and entry.player_id = membership.player_id
  where membership.tournament_id = '2026'
    and membership.participation_status = 'ACTIVE';
  if handicap_covered <> active_roster then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROSTER_HANDICAPS_INCOMPLETE', 'section', 'roster',
        'message', pg_catalog.format(
          '%s roster Players are missing an approved tournament handicap.',
          active_roster - handicap_covered
        ),
        'missingCount', active_roster - handicap_covered
      )
    );
  end if;

  select pg_catalog.count(*)::integer into round_count
  from scoring_authority.rounds round_value
  where round_value.tournament_id = '2026';
  for value in
    select expected.round_number, expected.format,
      round_value.format actual_format, round_value.name
    from (values (1, 'BB'), (2, 'SC'), (3, 'SI'))
      expected(round_number, format)
    left join scoring_authority.rounds round_value
      on round_value.tournament_id = '2026'
     and round_value.round_number = expected.round_number
  loop
    if value.actual_format is null then
      blockers := blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'ROUND_REQUIRED', 'section', 'rounds',
          'target', pg_catalog.format('Round %s', value.round_number),
          'message', pg_catalog.format('Round %s is not configured.',
            value.round_number)
        )
      );
    elsif value.actual_format <> value.format then
      blockers := blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'ROUND_FORMAT_INVALID', 'section', 'rounds',
          'target', pg_catalog.format('Round %s', value.round_number),
          'message', pg_catalog.format(
            'Round %s must use %s for the current tournament contract.',
            value.round_number, value.format
          )
        )
      );
    end if;
  end loop;

  if exists (
    select 1
    from scoring_authority.matches match_value
    join scoring_authority.scoring_snapshots snapshot
      on snapshot.snapshot_id = match_value.scoring_snapshot_id
    left join scoring_authority.tournament_setup_round_courses_v1 assignment
      on assignment.tournament_id = match_value.tournament_id
     and assignment.round_number = match_value.round_number
    where match_value.tournament_id = '2026'
      and (
        pg_catalog.jsonb_typeof(snapshot.hole_definitions) <> 'array'
        or pg_catalog.jsonb_array_length(snapshot.hole_definitions) <> 18
        or (select pg_catalog.sum((hole->>'par')::integer)
          from pg_catalog.jsonb_array_elements(snapshot.hole_definitions) hole)
          <> snapshot.par
        or (assignment.round_number is not null and (
          assignment.course_id <> snapshot.course_id
          or assignment.tee_id <> snapshot.tee
        ))
      )
  ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'COURSE_ROUND_CONTEXT_INVALID', 'section', 'courses',
        'message',
          'A match course, tee, or 18-hole definition does not match its round.'
      )
    );
  end if;
  if exists (
    select 1
    from scoring_authority.matches match_value
    join scoring_authority.tournament_setup_round_details_v1 round_detail
      on round_detail.tournament_id = match_value.tournament_id
     and round_detail.round_number = match_value.round_number
    left join scoring_authority.tournament_setup_match_details_v1 match_detail
      on match_detail.match_id = match_value.match_id
    where match_value.tournament_id = '2026'
      and match_detail.match_id is null
  ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROUND_MATCH_CONTEXT_REFRESH_REQUIRED',
        'section', 'matches',
        'message',
          'One or more matches need review after the round configuration changed.'
      )
    );
  end if;

  for value in
    select round_value.round_number, round_value.format,
      pg_catalog.count(match_value.match_id)::integer actual_matches,
      case round_value.format when 'SI' then active_roster / 2
        else active_roster / 4 end expected_count
    from scoring_authority.rounds round_value
    left join scoring_authority.matches match_value
      on match_value.tournament_id = round_value.tournament_id
     and match_value.round_number = round_value.round_number
    where round_value.tournament_id = '2026'
      and round_value.round_number in (1, 2, 3)
    group by round_value.round_number, round_value.format
    order by round_value.round_number
  loop
    expected_matches := expected_matches + value.expected_count;
    if value.actual_matches <> value.expected_count then
      blockers := blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'ROUND_MATCH_COUNT_INCOMPLETE', 'section', 'matches',
          'target', pg_catalog.format('Round %s', value.round_number),
          'message', pg_catalog.format(
            'Round %s needs %s matches; %s are configured.',
            value.round_number, value.expected_count, value.actual_matches
          ),
          'expectedCount', value.expected_count,
          'actualCount', value.actual_matches
        )
      );
    end if;
  end loop;

  select pg_catalog.count(*)::integer into match_count
  from scoring_authority.matches match_value
  where match_value.tournament_id = '2026';
  if exists (
    select 1
    from scoring_authority.matches match_value
    join scoring_authority.rounds round_value
      on round_value.tournament_id = match_value.tournament_id
     and round_value.round_number = match_value.round_number
    where match_value.tournament_id = '2026'
      and match_value.format <> round_value.format
  ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'MATCH_ROUND_FORMAT_MISMATCH', 'section', 'matches',
        'message', 'A match format does not match its configured round.'
      )
    );
  end if;
  select pg_catalog.count(*)::integer into started_count
  from scoring_authority.matches match_value
  where match_value.tournament_id = '2026'
    and not production_control.handicap_v1_match_is_unstarted(
      match_value.match_id
    );

  for value in
    select match_value.match_id, match_value.round_number, match_value.format,
      pg_catalog.count(participant.player_id)::integer participant_count,
      pg_catalog.count(distinct participant.player_id)::integer unique_count,
      pg_catalog.count(*) filter (
        where participant.team_side = 1
      )::integer team_1_count,
      pg_catalog.count(*) filter (
        where participant.team_side = 2
      )::integer team_2_count
    from scoring_authority.matches match_value
    left join scoring_authority.match_participants participant
      on participant.match_id = match_value.match_id
    where match_value.tournament_id = '2026'
    group by match_value.match_id, match_value.round_number, match_value.format
    order by match_value.round_number, match_value.match_id
  loop
    if value.participant_count <> (case when value.format = 'SI' then 2 else 4 end)
       or value.unique_count <> value.participant_count
       or value.team_1_count <> (case when value.format = 'SI' then 1 else 2 end)
       or value.team_2_count <> (case when value.format = 'SI' then 1 else 2 end) then
      blockers := blockers || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'MATCH_PAIRINGS_INCOMPLETE', 'section', 'matches',
          'target', value.match_id,
          'message', pg_catalog.format('%s needs complete valid pairings.',
            value.match_id)
        )
      );
    else
      paired_count := paired_count + 1;
    end if;
  end loop;
  if exists (
    select 1
    from scoring_authority.match_participants participant
    join scoring_authority.matches match_value
      on match_value.match_id = participant.match_id
    left join scoring_authority.tournament_players membership
      on membership.tournament_id = match_value.tournament_id
     and membership.player_id = participant.player_id
    where match_value.tournament_id = '2026'
      and (membership.player_id is null
        or membership.participation_status <> 'ACTIVE'
        or membership.team_side <> participant.team_side)
  ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'PAIRING_ROSTER_TEAM_MISMATCH', 'section', 'matches',
        'message', 'One or more pairings do not match the active roster teams.'
      )
    );
  end if;
  if exists (
    select 1
    from scoring_authority.match_participants participant
    join scoring_authority.matches match_value
      on match_value.match_id = participant.match_id
    where match_value.tournament_id = '2026'
    group by match_value.round_number, participant.player_id
    having pg_catalog.count(*) > 1
  ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROUND_DUPLICATE_PLAYER', 'section', 'matches',
        'message', 'A Player appears more than once in the same round.'
      )
    );
  end if;

  select pg_catalog.count(*)::integer into snapshot_ready_count
  from scoring_authority.matches match_value
  join scoring_authority.scoring_snapshots snapshot
    on snapshot.snapshot_id = match_value.scoring_snapshot_id
   and snapshot.match_id = match_value.match_id
   and snapshot.tournament_id = match_value.tournament_id
  join scoring_authority.handicap_revision_current current_handicap
    on current_handicap.tournament_id = match_value.tournament_id
   and current_handicap.revision_id = snapshot.handicap_revision_id
  left join scoring_authority.tournament_setup_match_details_v1 detail
    on detail.match_id = match_value.match_id
  where match_value.tournament_id = '2026'
    and snapshot.format = match_value.format
    and snapshot.rating is not null
    and snapshot.slope between 55 and 155
    and snapshot.par between 54 and 90
    and pg_catalog.jsonb_typeof(snapshot.hole_definitions) = 'array'
    and pg_catalog.jsonb_array_length(snapshot.hole_definitions) = 18
    and (select pg_catalog.count(*)
      from scoring_authority.match_holes hole
      where hole.match_id = match_value.match_id) = 18
    and (detail.match_id is null or (
      detail.prepared_setup_revision = detail.setup_revision
      and detail.prepared_configuration_fingerprint is not null
    ))
    and not exists (
      select 1 from scoring_authority.match_participants participant
      left join scoring_authority.handicap_revision_entries entry
        on entry.revision_id = current_handicap.revision_id
       and entry.player_id = participant.player_id
      where participant.match_id = match_value.match_id
        and (entry.player_id is null
          or participant.handicap_revision_id
            is distinct from current_handicap.revision_id)
    );
  if snapshot_ready_count <> match_count then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCORING_CONTEXT_INCOMPLETE', 'section', 'matches',
        'message', pg_catalog.format(
          '%s matches need a complete scoring context.',
          match_count - snapshot_ready_count
        ),
        'missingCount', match_count - snapshot_ready_count
      )
    );
  end if;

  begin
    perform production_control.build_production_net_skins_v1_manifest(
      array[1, 2, 3]::integer[]
    );
    net_skins_ready := true;
    net_skins_state := 'READY';
  exception when others then
    net_skins_ready := false;
    net_skins_state := 'NOT_READY';
  end;
  select coalesce(current_value.state, 'NOT_CONFIGURED') into calcutta_state
  from scoring_authority.calcutta_v1_current current_value
  where current_value.tournament_id = '2026';

  return pg_catalog.jsonb_build_object(
    'state', case when pg_catalog.jsonb_array_length(blockers) = 0
      then 'READY' else 'NEEDS_ATTENTION' end,
    'ready', pg_catalog.jsonb_array_length(blockers) = 0,
    'blockers', blockers,
    'messages', coalesce((
      select pg_catalog.jsonb_agg(blocker->>'message')
      from pg_catalog.jsonb_array_elements(blockers) blocker
    ), '[]'::jsonb),
    'summary', pg_catalog.jsonb_build_object(
      'activeRoster', active_roster,
      'handicapCovered', handicap_covered,
      'teams', team_count,
      'rounds', round_count,
      'expectedMatches', expected_matches,
      'matches', match_count,
      'pairedMatches', paired_count,
      'preparedScoringContexts', snapshot_ready_count,
      'startedMatches', started_count
    ),
    'sections', pg_catalog.jsonb_build_object(
      'tournament', production_control.tournament_setup_section_state_v1(
        blockers, 'tournament', operational_value.tournament_id is not null, false
      ),
      'teams', production_control.tournament_setup_section_state_v1(
        blockers, 'teams', team_count > 0, false
      ),
      'roster', production_control.tournament_setup_section_state_v1(
        blockers, 'roster', active_roster > 0, started_count > 0
      ),
      'rounds', production_control.tournament_setup_section_state_v1(
        blockers, 'rounds', round_count > 0, started_count > 0
      ),
      'courses', production_control.tournament_setup_section_state_v1(
        blockers, 'courses', match_count > 0, started_count > 0
      ),
      'matches', production_control.tournament_setup_section_state_v1(
        blockers, 'matches', match_count > 0, started_count > 0
      ),
      'scoringContext', production_control.tournament_setup_section_state_v1(
        blockers, 'matches', snapshot_ready_count > 0, started_count > 0
      )
    ),
    'sideGames', pg_catalog.jsonb_build_object(
      'netSkins', pg_catalog.jsonb_build_object(
        'ready', net_skins_ready, 'state', net_skins_state,
        'derivedFromCanonicalSetup', true
      ),
      'calcutta', pg_catalog.jsonb_build_object(
        'state', coalesce(calcutta_state, 'NOT_CONFIGURED'),
        'optional', true, 'blocksTournamentReadiness', false
      )
    )
  );
end;
$$;

create or replace function public.read_production_tournament_setup_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  tournament_value jsonb;
  teams_value jsonb;
  roster_value jsonb;
  available_players_value jsonb;
  rounds_value jsonb;
  courses_value jsonb;
  available_course_identities_value jsonb;
  matches_value jsonb;
  audit_value jsonb;
  dependencies_value jsonb;
  readiness_value jsonb;
  revision_value bigint;
begin
  perform production_control.assert_tournament_setup_runtime_v1(input);
  if input->>'operation'
       is distinct from 'READ_PRODUCTION_TOURNAMENT_SETUP_V1' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_TOURNAMENT_SETUP_READ_INPUT_INVALID';
  end if;
  revision_value := production_control.tournament_setup_revision_v1('2026');

  select pg_catalog.jsonb_build_object(
    'id', tournament.tournament_id,
    'year', tournament.tournament_year,
    'name', tournament.name,
    'sourceWorkbookId', tournament.source_workbook_id,
    'destination', operational.destination,
    'startDate', operational.start_date,
    'endDate', operational.end_date,
    'timezone', operational.timezone,
    'status', 'UPCOMING',
    'statusEditable', false,
    'setupRevision', operational.setup_revision
  ) into tournament_value
  from scoring_authority.tournaments tournament
  left join scoring_authority.tournament_setup_operational_v1 operational
    on operational.tournament_id = tournament.tournament_id
  where tournament.tournament_id = '2026';

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'teamId', team.team_id,
    'teamSide', team.team_side,
    'name', team.name,
    'captainPlayerId', coalesce(detail.captain_player_id,
      nullif(team.source_payload->>'Captain', '')),
    'captainName', captain.display_name,
    'activeRosterCount', (
      select pg_catalog.count(*)::integer
      from scoring_authority.tournament_players membership
      where membership.tournament_id = team.tournament_id
        and membership.team_id = team.team_id
        and membership.participation_status = 'ACTIVE'
    ),
    'setupRevision', detail.setup_revision,
    'locked', exists (
      select 1 from scoring_authority.matches match_value
      where match_value.tournament_id = team.tournament_id
        and not production_control.handicap_v1_match_is_unstarted(
          match_value.match_id
        )
    )
  ) order by team.team_side), '[]'::jsonb) into teams_value
  from scoring_authority.teams team
  left join scoring_authority.tournament_setup_team_details_v1 detail
    on detail.tournament_id = team.tournament_id
   and detail.team_id = team.team_id
  left join scoring_authority.players captain
    on captain.player_id = coalesce(detail.captain_player_id,
      nullif(team.source_payload->>'Captain', ''))
  where team.tournament_id = '2026';

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'playerId', membership.player_id,
    'displayName', player.display_name,
    'membershipStatus', membership.participation_status,
    'teamId', membership.team_id,
    'teamSide', membership.team_side,
    'teamName', team.name,
    'tournamentHandicap', membership.tournament_handicap,
    'handicapRevisionId', membership.handicap_revision_id,
    'pairedMatchCount', (
      select pg_catalog.count(*)::integer
      from scoring_authority.match_participants participant
      join scoring_authority.matches match_value
        on match_value.match_id = participant.match_id
       and match_value.tournament_id = membership.tournament_id
      where participant.player_id = membership.player_id
    ),
    'frozenMatchCount', (
      select pg_catalog.count(*)::integer
      from scoring_authority.match_participants participant
      join scoring_authority.matches match_value
        on match_value.match_id = participant.match_id
       and match_value.tournament_id = membership.tournament_id
      where participant.player_id = membership.player_id
        and not production_control.handicap_v1_match_is_unstarted(
          match_value.match_id
        )
    ),
    'canAssignTeam', not exists (
      select 1
      from scoring_authority.match_participants participant
      join scoring_authority.matches match_value
        on match_value.match_id = participant.match_id
       and match_value.tournament_id = membership.tournament_id
      where participant.player_id = membership.player_id
        and not production_control.handicap_v1_match_is_unstarted(
          match_value.match_id
        )
    ) and pg_catalog.jsonb_array_length(
      production_control.tournament_setup_dependency_codes_v1(
        membership.player_id, membership.team_id, null, null, 'ROSTER'
      )
    ) = 0,
    'blockers', production_control.tournament_setup_dependency_codes_v1(
      membership.player_id, membership.team_id, null, null, 'ROSTER'
    ),
    'readiness', pg_catalog.jsonb_build_object(
      'teamAssigned', team.team_id is not null,
      'handicapApproved', membership.handicap_revision_id is not null
        and membership.tournament_handicap is not null
    )
  ) order by team.team_side, player.display_name, membership.player_id),
    '[]'::jsonb) into roster_value
  from scoring_authority.tournament_players membership
  join scoring_authority.players player
    on player.player_id = membership.player_id
  left join scoring_authority.teams team
    on team.tournament_id = membership.tournament_id
   and team.team_id = membership.team_id
  where membership.tournament_id = '2026';

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'playerId', player.player_id,
    'displayName', player.display_name,
    'globalStatus', production_control.access_governance_global_status_v1(
      player.player_id
    )
  ) order by player.display_name, player.player_id), '[]'::jsonb)
  into available_players_value
  from scoring_authority.players player
  where production_control.access_governance_global_status_v1(player.player_id)
      = 'ACTIVE'
    and not exists (
      select 1 from scoring_authority.tournament_players membership
      where membership.tournament_id = '2026'
        and membership.player_id = player.player_id
    );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'roundNumber', round_value.round_number,
    'name', round_value.name,
    'format', round_value.format,
    'handicapAllowance', round_value.handicap_allowance,
    'status', round_value.status,
    'teamSize', coalesce(detail.team_size,
      case when round_value.format = 'SI' then 1 else 2 end),
    'pointsAvailable', coalesce(detail.points_available,
      nullif(round_value.source_payload->>'Points Available', '')::numeric),
    'displayOrder', coalesce(detail.display_order, round_value.round_number),
    'courseId', assignment.course_id,
    'tee', assignment.tee_id,
    'matchCount', (
      select pg_catalog.count(*)::integer
      from scoring_authority.matches match_value
      where match_value.tournament_id = round_value.tournament_id
        and match_value.round_number = round_value.round_number
    ),
    'locked', exists (
      select 1 from scoring_authority.matches match_value
      where match_value.tournament_id = round_value.tournament_id
        and match_value.round_number = round_value.round_number
        and not production_control.handicap_v1_match_is_unstarted(
          match_value.match_id
        )
    ),
    'setupRevision', detail.setup_revision
  ) order by coalesce(detail.display_order, round_value.round_number)),
    '[]'::jsonb) into rounds_value
  from scoring_authority.rounds round_value
  left join scoring_authority.tournament_setup_round_details_v1 detail
    on detail.tournament_id = round_value.tournament_id
   and detail.round_number = round_value.round_number
  left join scoring_authority.tournament_setup_round_courses_v1 assignment
    on assignment.tournament_id = round_value.tournament_id
   and assignment.round_number = round_value.round_number
  where round_value.tournament_id = '2026';

  with candidates as (
    select course.tournament_id, course.course_id, course.tee_id,
      course.display_name, course.location, course.rating, course.slope,
      course.par, course.setup_revision,
      (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'holeNumber', hole.hole_number,
        'par', hole.par,
        'strokeIndex', hole.stroke_index,
        'yardage', hole.yardage
      ) order by hole.hole_number)
      from scoring_authority.tournament_setup_course_holes_v1 hole
      where hole.tournament_id = course.tournament_id
        and hole.course_id = course.course_id
        and hole.tee_id = course.tee_id) holes,
      true setup_managed
    from scoring_authority.tournament_setup_course_tees_v1 course
    where course.tournament_id = '2026'
    union all
    select existing.*
    from (
      select distinct on (snapshot.course_id, snapshot.tee)
        snapshot.tournament_id, snapshot.course_id, snapshot.tee,
        coalesce(identity_value.canonical_name, snapshot.course_id),
        identity_value.canonical_location, snapshot.rating, snapshot.slope,
        snapshot.par, null::bigint, snapshot.hole_definitions, false
      from scoring_authority.scoring_snapshots snapshot
      left join scoring_authority.completed_history_course_identities identity_value
        on identity_value.course_id = snapshot.course_id
      where snapshot.tournament_id = '2026'
        and not exists (
          select 1
          from scoring_authority.tournament_setup_course_tees_v1 managed
          where managed.tournament_id = snapshot.tournament_id
            and managed.course_id = snapshot.course_id
            and managed.tee_id = snapshot.tee
        )
      order by snapshot.course_id, snapshot.tee,
        snapshot.snapshot_revision desc
    ) existing
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'roundNumber', assigned_round.round_number,
    'courseId', course.course_id,
    'tee', course.tee_id,
    'name', course.display_name,
    'displayName', course.display_name,
    'location', course.location,
    'city', null,
    'state', null,
    'rating', course.rating,
    'slope', course.slope,
    'par', course.par,
    'holes', coalesce(course.holes, '[]'::jsonb),
    'holeCount', pg_catalog.jsonb_array_length(coalesce(
      course.holes, '[]'::jsonb
    )),
    'complete', pg_catalog.jsonb_array_length(coalesce(
      course.holes, '[]'::jsonb
    )) = 18,
    'roundNumbers', coalesce((
      select pg_catalog.jsonb_agg(assignment.round_number
        order by assignment.round_number)
      from scoring_authority.tournament_setup_round_courses_v1 assignment
      where assignment.tournament_id = course.tournament_id
        and assignment.course_id = course.course_id
        and assignment.tee_id = course.tee_id
    ), (
      select pg_catalog.jsonb_agg(round_number order by round_number)
      from (
        select distinct match_value.round_number
        from scoring_authority.matches match_value
        join scoring_authority.scoring_snapshots snapshot
          on snapshot.snapshot_id = match_value.scoring_snapshot_id
        where match_value.tournament_id = course.tournament_id
          and snapshot.course_id = course.course_id
          and snapshot.tee = course.tee_id
      ) existing_rounds
    ), '[]'::jsonb),
    'setupManaged', course.setup_managed,
    'setupRevision', course.setup_revision,
    'locked', exists (
      select 1
      from scoring_authority.matches match_value
      join scoring_authority.scoring_snapshots snapshot
        on snapshot.snapshot_id = match_value.scoring_snapshot_id
      where match_value.tournament_id = course.tournament_id
        and snapshot.course_id = course.course_id
        and snapshot.tee = course.tee_id
        and not production_control.handicap_v1_match_is_unstarted(
          match_value.match_id
        )
    )
  ) order by assigned_round.round_number, course.display_name, course.tee_id),
    '[]'::jsonb)
  into courses_value
  from candidates course
  cross join lateral (
    select distinct source.round_number
    from (
      select assignment.round_number
      from scoring_authority.tournament_setup_round_courses_v1 assignment
      where assignment.tournament_id = course.tournament_id
        and assignment.course_id = course.course_id
        and assignment.tee_id = course.tee_id
      union all
      select match_value.round_number
      from scoring_authority.matches match_value
      join scoring_authority.scoring_snapshots snapshot
        on snapshot.snapshot_id = match_value.scoring_snapshot_id
      where match_value.tournament_id = course.tournament_id
        and snapshot.course_id = course.course_id
        and snapshot.tee = course.tee_id
    ) source
  ) assigned_round;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'courseId', identity_value.course_id,
    'name', identity_value.canonical_name,
    'location', identity_value.canonical_location,
    'requiresTeeConfiguration', true,
    'requiresHoleConfiguration', true
  ) order by identity_value.canonical_name, identity_value.course_id),
    '[]'::jsonb)
  into available_course_identities_value
  from scoring_authority.completed_history_course_identities identity_value
  where not exists (
    select 1 from scoring_authority.tournament_setup_course_tees_v1 setup_course
    where setup_course.tournament_id = '2026'
      and setup_course.course_id = identity_value.course_id
  ) and not exists (
    select 1 from scoring_authority.scoring_snapshots snapshot
    where snapshot.tournament_id = '2026'
      and snapshot.course_id = identity_value.course_id
  );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'matchId', match_value.match_id,
    'roundNumber', match_value.round_number,
    'matchNumber', coalesce(detail.match_number,
      nullif(pg_catalog.regexp_replace(match_value.match_id, '^.*-', ''), '')::integer),
    'format', match_value.format,
    'status', match_value.status,
    'scoringLocked', match_value.scoring_locked,
    'matchRevision', match_value.match_revision,
    'permissionRevision', match_value.permission_revision,
    'courseId', coalesce(detail.course_id, snapshot.course_id),
    'courseName', coalesce(course.display_name,
      history_course.canonical_name, snapshot.course_id),
    'tee', coalesce(detail.tee_id, snapshot.tee),
    'teeTime', coalesce(detail.tee_time::text, presentation.tee_time),
    'startingHole', coalesce(detail.starting_hole,
      nullif(presentation.starting_hole, '')::integer, 1),
    'participantCount', (
      select pg_catalog.count(*)::integer
      from scoring_authority.match_participants participant
      where participant.match_id = match_value.match_id
    ),
    'scoredHoles', match_value.scored_holes,
    'scoring_ready', coalesce(
      (scoring_readiness.value->>'ready')::boolean, false
    ),
    'scoring_readiness_code', case
      when coalesce((scoring_readiness.value->>'ready')::boolean, false)
        then 'PRODUCTION_MATCH_SCORING_READY'
      else 'PRODUCTION_MATCH_NOT_SCORING_READY'
    end,
    'scoring_readiness_reasons', coalesce(
      scoring_readiness.value->'reasons', '[]'::jsonb
    ),
    'participants', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'playerId', participant.player_id,
        'displayName', player.display_name,
        'teamSide', participant.team_side,
        'playerSlot', participant.player_slot,
        'tournamentHandicap', participant.tournament_handicap,
        'finalStrokes', participant.final_strokes
      ) order by participant.team_side, participant.player_slot)
      from scoring_authority.match_participants participant
      join scoring_authority.players player
        on player.player_id = participant.player_id
      where participant.match_id = match_value.match_id
    ), '[]'::jsonb),
    'prepared', detail.prepared_setup_revision is not null
      or (snapshot.snapshot_id is not null
        and pg_catalog.jsonb_array_length(snapshot.hole_definitions) = 18),
    'preparedSetupRevision', detail.prepared_setup_revision,
    'strictlyUnstarted', production_control.handicap_v1_match_is_unstarted(
      match_value.match_id
    ),
    'accessActive', exists (
      select 1 from scoring_authority.scoring_permissions permission
      where permission.match_id = match_value.match_id
        and permission.can_score and permission.revoked_at is null
    ),
    'locked', not production_control.handicap_v1_match_is_unstarted(
      match_value.match_id
    ),
    'blockers', case
      when not production_control.handicap_v1_match_is_unstarted(
        match_value.match_id
      ) then pg_catalog.jsonb_build_array(
        'Match setup is locked because scoring has started.'
      )
      else '[]'::jsonb end,
    'warnings', case
      when (select pg_catalog.count(*)
        from scoring_authority.match_participants participant
        where participant.match_id = match_value.match_id)
        <> (case when match_value.format = 'SI' then 2 else 4 end)
      then pg_catalog.jsonb_build_array('Complete the match pairings.')
      when snapshot.handicap_revision_id is null
      then pg_catalog.jsonb_build_array(
        'Prepare the scoring context with the current approved handicaps.'
      )
      else '[]'::jsonb end,
    'snapshot', pg_catalog.jsonb_build_object(
      'id', snapshot.snapshot_id,
      'snapshotId', snapshot.snapshot_id,
      'revision', snapshot.snapshot_revision,
      'prepared', detail.prepared_setup_revision is not null
        or (snapshot.snapshot_id is not null
          and pg_catalog.jsonb_typeof(snapshot.hole_definitions) = 'array'
          and pg_catalog.jsonb_array_length(snapshot.hole_definitions) = 18),
      'current', snapshot.snapshot_id = match_value.scoring_snapshot_id,
      'courseId', snapshot.course_id,
      'tee', snapshot.tee,
      'rating', snapshot.rating,
      'slope', snapshot.slope,
      'par', snapshot.par,
      'holeCount', case
        when pg_catalog.jsonb_typeof(snapshot.hole_definitions) = 'array'
          then pg_catalog.jsonb_array_length(snapshot.hole_definitions)
        else 0 end,
      'handicapRevisionId', snapshot.handicap_revision_id,
      'canonicalHash', snapshot.canonical_hash
    )
  ) order by match_value.round_number,
    coalesce(detail.match_number, 999), match_value.match_id), '[]'::jsonb)
  into matches_value
  from scoring_authority.matches match_value
  left join scoring_authority.tournament_setup_match_details_v1 detail
    on detail.match_id = match_value.match_id
  left join scoring_authority.scoring_snapshots snapshot
    on snapshot.snapshot_id = match_value.scoring_snapshot_id
  left join scoring_authority.tournament_setup_course_tees_v1 course
    on course.tournament_id = match_value.tournament_id
   and course.course_id = coalesce(detail.course_id, snapshot.course_id)
   and course.tee_id = coalesce(detail.tee_id, snapshot.tee)
  left join scoring_authority.completed_history_course_identities history_course
    on history_course.course_id = snapshot.course_id
  left join scoring_authority.game_center_presentations presentation
    on presentation.match_id = match_value.match_id
  left join lateral (
    select production_control.assert_production_match_scoring_ready_v1(
      match_value.match_id
    ) value
  ) scoring_readiness on true
  where match_value.tournament_id = '2026';

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'eventId', event.event_id,
    'action', event.action,
    'targetKind', event.target_kind,
    'targetId', event.target_id,
    'actorPlayerId', event.actor_player_id,
    'result', event.result,
    'revision', event.next_revision,
    'occurredAt', event.occurred_at
  ) order by event.occurred_at desc), '[]'::jsonb) into audit_value
  from (
    select item.*
    from production_control.tournament_setup_audit_events_v1 item
    where item.tournament_id = '2026'
    order by item.occurred_at desc, item.event_id
    limit 60
  ) event;

  readiness_value := production_control.tournament_setup_readiness_v1();
  select pg_catalog.jsonb_build_object(
    'oddsPublished', exists (
      select 1 from scoring_authority.odds_publication_current current_value
      where current_value.tournament_id = '2026'
        and current_value.publication_state = 'PUBLISHED'
    ),
    'netSkinsConfigured', exists (
      select 1
      from scoring_authority.net_skins_v1_configuration_current current_value
      where current_value.tournament_id = '2026'
        and current_value.state = 'CONFIGURED'
    ),
    'calcuttaConfigured', exists (
      select 1 from scoring_authority.calcutta_v1_current current_value
      where current_value.tournament_id = '2026'
        and current_value.state <> 'NOT_CONFIGURED'
    ),
    'draftPickCount', (
      select pg_catalog.count(*)::integer
      from scoring_authority.draft_current_revisions current_value
      join scoring_authority.draft_pick_facts pick
        on pick.revision_id = current_value.revision_id
       and pick.tournament_id = current_value.tournament_id
      where current_value.tournament_id = '2026'
        and pick.pick_status = 'SELECTED'
    )
  ) into dependencies_value;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contractVersion', 'production-tournament-setup-v1',
      'tournamentId', '2026',
      'revision', revision_value,
      'actor', pg_catalog.jsonb_build_object(
        'playerId', input->>'actor_player_id',
        'owner', exists (
          select 1
          from production_control.tournament_owner_capabilities_v1 owner_value
          where owner_value.tournament_id = '2026'
            and owner_value.player_id = input->>'actor_player_id'
            and owner_value.auth_user_id = (input->>'actor_auth_user_id')::uuid
            and owner_value.status = 'ACTIVE'
        )
      ),
      'tournament', tournament_value,
      'teams', teams_value,
      'roster', roster_value,
      'availablePlayers', available_players_value,
      'rounds', rounds_value,
      'courses', courses_value,
      'availableCourseIdentities', available_course_identities_value,
      'matches', matches_value,
      'readiness', readiness_value,
      'dependencies', dependencies_value,
      'audit', audit_value,
      'capabilities', pg_catalog.jsonb_build_object(
        'update-tournament', true,
        'update-team', true,
        'assign-roster-team', true,
        'update-round', true,
        'upsert-course', true,
        'create-global-course', false,
        'upsert-match', true,
        'replace-pairings', true,
        'prepare-scoring-context', true,
        'activate-scoring-access', false,
        'change-operational-status', false
      ),
      'deferred', pg_catalog.jsonb_build_array(
        'GLOBAL_COURSE_ID_ALLOCATION_POLICY_REQUIRED',
        'TOURNAMENT_OPERATIONAL_STATUS_SEMANTICS_REQUIRED',
        'POST_START_SETUP_CORRECTION_FLOW_REQUIRED'
      )
    )
  );
end;
$$;

create or replace function production_control.apply_tournament_setup_tournament_v1(
  input jsonb,
  next_revision bigint,
  actor_player text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  payload jsonb := case when pg_catalog.jsonb_typeof(input->'tournament') = 'object'
    then input->'tournament' else input end;
  current_tournament scoring_authority.tournaments%rowtype;
  current_operational scoring_authority.tournament_setup_operational_v1%rowtype;
  next_name text;
  next_destination text;
  next_start date;
  next_end date;
  next_timezone text;
  requested_status text;
  metadata_supplied boolean;
  changed_value boolean := false;
begin
  select value.* into strict current_tournament
  from scoring_authority.tournaments value
  where value.tournament_id = '2026' for update;
  select value.* into current_operational
  from scoring_authority.tournament_setup_operational_v1 value
  where value.tournament_id = '2026' for update;

  if coalesce(payload->>'tournament_id', payload->>'tournamentId', '2026')
       <> '2026'
     or coalesce(payload->>'tournament_year', payload->>'tournamentYear',
       payload->>'year', '2026') <> '2026'
     or coalesce(payload->>'source_workbook_id', payload->>'sourceWorkbookId',
       current_tournament.source_workbook_id)
       <> current_tournament.source_workbook_id then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_IMMUTABLE_RESOURCE_FIELD';
  end if;
  requested_status := pg_catalog.upper(pg_catalog.btrim(coalesce(
    payload->>'operational_status', payload->>'status', 'UPCOMING'
  )));
  if requested_status <> 'UPCOMING' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_OPERATIONAL_STATUS_OWNER_DECISION_REQUIRED';
  end if;

  next_name := case
    when payload ? 'tournament_name'
      then pg_catalog.btrim(payload->>'tournament_name')
    when payload ? 'name'
      then pg_catalog.btrim(payload->>'name')
    else current_tournament.name end;
  if next_name = '' or pg_catalog.length(next_name) > 240 then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_NAME_INVALID';
  end if;
  next_destination := case
    when payload ? 'destination' then nullif(pg_catalog.btrim(
      payload->>'destination'
    ), '') else current_operational.destination end;
  next_timezone := case when payload ? 'time_zone' or payload ? 'timezone'
    then nullif(pg_catalog.btrim(coalesce(payload->>'time_zone',
      payload->>'timezone')), '')
    else current_operational.timezone end;
  begin
    next_start := case
      when payload ? 'start_date' then nullif(payload->>'start_date', '')::date
      when payload ? 'startDate' then nullif(payload->>'startDate', '')::date
      else current_operational.start_date end;
    next_end := case
      when payload ? 'end_date' then nullif(payload->>'end_date', '')::date
      when payload ? 'endDate' then nullif(payload->>'endDate', '')::date
      else current_operational.end_date end;
  exception when others then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_DATES_INVALID';
  end;
  if next_start is not null and next_end is not null and next_start > next_end then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_DATES_INVALID';
  end if;
  if next_timezone is not null and not exists (
    select 1 from pg_catalog.pg_timezone_names timezone_value
    where timezone_value.name = next_timezone
  ) then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_TIMEZONE_INVALID';
  end if;
  if next_destination is not null and pg_catalog.length(next_destination) > 240 then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_DESTINATION_INVALID';
  end if;

  metadata_supplied := payload ? 'destination' or payload ? 'start_date'
    or payload ? 'startDate' or payload ? 'end_date' or payload ? 'endDate'
    or payload ? 'time_zone' or payload ? 'timezone';
  if current_tournament.name is distinct from next_name then
    update scoring_authority.tournaments set
      name = next_name, updated_at = pg_catalog.clock_timestamp()
    where tournament_id = '2026';
    changed_value := true;
  end if;
  if metadata_supplied and (
    current_operational.tournament_id is null
    or current_operational.destination is distinct from next_destination
    or current_operational.start_date is distinct from next_start
    or current_operational.end_date is distinct from next_end
    or current_operational.timezone is distinct from next_timezone
  ) then
    insert into scoring_authority.tournament_setup_operational_v1 (
      tournament_id, destination, start_date, end_date, timezone,
      operational_status, setup_revision, updated_by_player_id
    ) values (
      '2026', next_destination, next_start, next_end, next_timezone,
      'UPCOMING', next_revision, actor_player
    ) on conflict (tournament_id) do update set
      destination = excluded.destination,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      timezone = excluded.timezone,
      operational_status = 'UPCOMING',
      setup_revision = excluded.setup_revision,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    changed_value := true;
  end if;
  if metadata_supplied then
    update scoring_authority.game_center_presentations as presentation set
      tournament_location = coalesce(next_destination, ''),
      tournament_time_zone = coalesce(next_timezone, 'America/Chicago'),
      source_payload_hash = production_control.tournament_setup_hash_v1(
        pg_catalog.jsonb_build_object(
          'contractVersion', 'production-tournament-setup-v1',
          'tournamentId', '2026',
          'setupRevision', next_revision,
          'matchId', presentation.match_id,
          'destination', next_destination,
          'timeZone', next_timezone,
          'sourceWorkbookId', presentation.source_workbook_id
        )
      ),
      imported_by = 'production-tournament-setup-v1',
      source_updated_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where presentation.tournament_id = '2026'
      and (
        presentation.tournament_location is distinct from
          coalesce(next_destination, '')
        or presentation.tournament_time_zone is distinct from
          coalesce(next_timezone, 'America/Chicago')
      );
    if found then
      changed_value := true;
    end if;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'changed', changed_value,
    'targetKind', 'TOURNAMENT', 'targetId', '2026',
    'safeMetadata', pg_catalog.jsonb_build_object(
      'nameChanged', current_tournament.name is distinct from next_name,
      'operationalMetadataChanged', metadata_supplied and changed_value,
      'status', 'UPCOMING', 'statusEditable', false
    )
  );
end;
$$;

create or replace function production_control.apply_tournament_setup_team_v1(
  input jsonb,
  next_revision bigint,
  actor_player text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  payload jsonb := case when pg_catalog.jsonb_typeof(input->'team') = 'object'
    then input->'team' else input end;
  target_team text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    payload->>'team_id', payload->>'teamId', ''
  )));
  target_captain text;
  current_team scoring_authority.teams%rowtype;
  current_detail scoring_authority.tournament_setup_team_details_v1%rowtype;
  current_captain text;
  next_name text;
  captain_supplied boolean;
  changed_value boolean := false;
  dependencies jsonb;
begin
  select value.* into strict current_team
  from scoring_authority.teams value
  where value.tournament_id = '2026' and value.team_id = target_team
  for update;
  select value.* into current_detail
  from scoring_authority.tournament_setup_team_details_v1 value
  where value.tournament_id = '2026' and value.team_id = target_team
  for update;
  if coalesce(payload->>'team_side', payload->>'teamSide',
       current_team.team_side::text) <> current_team.team_side::text then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_TEAM_SIDE_IMMUTABLE';
  end if;
  next_name := case when payload ? 'team_name' or payload ? 'name'
    then pg_catalog.btrim(coalesce(payload->>'team_name', payload->>'name'))
    else current_team.name end;
  if next_name = '' or pg_catalog.length(next_name) > 160 then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_TEAM_NAME_INVALID';
  end if;
  captain_supplied := payload ? 'captain_player_id' or payload ? 'captainPlayerId';
  current_captain := coalesce(current_detail.captain_player_id,
    nullif(current_team.source_payload->>'Captain', ''));
  target_captain := case when captain_supplied then nullif(
    pg_catalog.upper(pg_catalog.btrim(coalesce(
      payload->>'captain_player_id', payload->>'captainPlayerId', ''
    ))), '') else current_captain end;
  if target_captain is not null and not exists (
    select 1 from scoring_authority.tournament_players membership
    where membership.tournament_id = '2026'
      and membership.player_id = target_captain
      and membership.team_id = target_team
      and membership.team_side = current_team.team_side
      and membership.participation_status = 'ACTIVE'
  ) then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_CAPTAIN_ACTIVE_TEAM_MEMBERSHIP_REQUIRED';
  end if;
  changed_value := current_team.name is distinct from next_name
    or current_captain is distinct from target_captain;
  if changed_value then
    dependencies := production_control.tournament_setup_dependency_codes_v1(
      target_captain, target_team, null, null, 'TEAM'
    );
    if pg_catalog.jsonb_array_length(dependencies) > 0 then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'TOURNAMENT_SETUP_DEPENDENCY_BLOCKED',
        'blockers', dependencies
      );
    end if;
    update scoring_authority.teams set
      name = next_name,
      source_payload = case when captain_supplied then pg_catalog.jsonb_set(
        source_payload, array['Captain']::text[],
        pg_catalog.to_jsonb(coalesce(target_captain, '')), true
      ) else source_payload end
    where tournament_id = '2026' and team_id = target_team;
    insert into scoring_authority.tournament_setup_team_details_v1 (
      tournament_id, team_id, captain_player_id, setup_revision,
      updated_by_player_id
    ) values (
      '2026', target_team, target_captain, next_revision, actor_player
    ) on conflict (tournament_id, team_id) do update set
      captain_player_id = excluded.captain_player_id,
      setup_revision = excluded.setup_revision,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'changed', changed_value,
    'targetKind', 'TEAM', 'targetId', target_team,
    'safeMetadata', pg_catalog.jsonb_build_object(
      'teamSide', current_team.team_side,
      'nameChanged', current_team.name is distinct from next_name,
      'captainChanged', current_captain is distinct from target_captain
    )
  );
exception when no_data_found then
  raise exception using errcode = '22023',
    message = 'TOURNAMENT_SETUP_TEAM_NOT_FOUND';
end;
$$;

create or replace function production_control.apply_tournament_setup_membership_v1(
  input jsonb,
  next_revision bigint,
  actor_player text,
  actor_auth uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  payload jsonb := case when pg_catalog.jsonb_typeof(input->'membership') = 'object'
    then input->'membership' else input end;
  target_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    payload->>'player_id', payload->>'playerId', ''
  )));
  target_team text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    payload->>'team_id', payload->>'teamId', ''
  )));
  team_value scoring_authority.teams%rowtype;
  current_value scoring_authority.tournament_players%rowtype;
  dependencies jsonb;
  warning_values jsonb := '[]'::jsonb;
  invalidated_match_count integer := 0;
  changed_value boolean := false;
begin
  if target_player = '' or target_team = '' or not exists (
    select 1 from scoring_authority.players player
    where player.player_id = target_player
      and production_control.access_governance_global_status_v1(player.player_id)
        = 'ACTIVE'
  ) then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_ACTIVE_GLOBAL_PLAYER_REQUIRED';
  end if;
  select value.* into strict team_value
  from scoring_authority.teams value
  where value.tournament_id = '2026' and value.team_id = target_team;
  select value.* into current_value
  from scoring_authority.tournament_players value
  where value.tournament_id = '2026' and value.player_id = target_player
  for update;
  if current_value.player_id is not null
     and current_value.participation_status <> 'ACTIVE' then
    raise exception using errcode = '55000',
      message = 'TOURNAMENT_SETUP_MEMBERSHIP_REACTIVATION_REQUIRES_ACCESS_GOVERNANCE';
  end if;
  changed_value := current_value.player_id is null
    or current_value.team_id is distinct from target_team
    or current_value.team_side is distinct from team_value.team_side
    or current_value.participation_status is distinct from 'ACTIVE';
  if changed_value then
    dependencies := production_control.tournament_setup_dependency_codes_v1(
      target_player, target_team, null, null, 'ROSTER'
    );
    if pg_catalog.jsonb_array_length(dependencies) > 0 then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'TOURNAMENT_SETUP_DEPENDENCY_BLOCKED',
        'blockers', dependencies
      );
    end if;
    insert into scoring_authority.tournament_players (
      tournament_id, player_id, team_id, team_side, participation_status,
      source_roster_key, source_payload
    ) values (
      '2026', target_player, target_team, team_value.team_side, 'ACTIVE',
      '2026:' || target_player, '{}'::jsonb
    ) on conflict (tournament_id, player_id) do update set
      team_id = excluded.team_id,
      team_side = excluded.team_side,
      updated_at = pg_catalog.clock_timestamp();
    if current_value.player_id is null then
      insert into production_control.access_governance_membership_revisions_v1 (
        tournament_id, player_id, membership_revision,
        participation_status, updated_by_player_id, updated_by_auth_user_id
      ) values (
        '2026', target_player, 1, 'ACTIVE', actor_player, actor_auth
      ) on conflict (tournament_id, player_id) do nothing;
    end if;
    update scoring_authority.tournament_setup_match_details_v1 detail set
      setup_revision = next_revision,
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where detail.tournament_id = '2026'
      and exists (
        select 1
        from scoring_authority.match_participants participant
        join scoring_authority.matches match_value
          on match_value.match_id = participant.match_id
         and match_value.tournament_id = '2026'
        where participant.match_id = detail.match_id
          and participant.player_id = target_player
          and match_value.status = 'UPCOMING'
          and match_value.scored_holes = 0
          and match_value.current_hole = 0
          and match_value.finalized_at is null
          and not match_value.scorecard_complete
          and not exists (
            select 1 from scoring_authority.hole_scores score
            where score.match_id = match_value.match_id
          )
          and not exists (
            select 1
            from scoring_authority.finalized_scorecard_snapshots final_value
            where final_value.match_id = match_value.match_id
          )
      );
    get diagnostics invalidated_match_count = row_count;
    if invalidated_match_count > 0 then
      warning_values := warning_values || pg_catalog.jsonb_build_array(
        'Affected unstarted match scoring context requires preparation.'
      );
    end if;
  end if;
  if not exists (
    select 1
    from scoring_authority.handicap_revision_current current_handicap
    join scoring_authority.handicap_revision_entries entry
      on entry.revision_id = current_handicap.revision_id
     and entry.player_id = target_player
    where current_handicap.tournament_id = '2026'
  ) then
    warning_values := warning_values || pg_catalog.jsonb_build_array(
      'Player added to roster — handicap required'
    );
  end if;
  if not exists (
    select 1 from scoring_authority.match_participants participant
    where participant.player_id = target_player
  ) then
    warning_values := warning_values || pg_catalog.jsonb_build_array(
      'Player added — pairing assignment required'
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'changed', changed_value,
    'targetKind', 'MEMBERSHIP', 'targetId', target_player,
    'warnings', warning_values,
    'safeMetadata', pg_catalog.jsonb_build_object(
      'teamId', target_team,
      'teamSide', team_value.team_side,
      'membershipStatus', 'ACTIVE',
      'invalidatedMatchCount', invalidated_match_count,
      'teamChanged', current_value.player_id is not null
        and current_value.team_id is distinct from target_team,
      'authUserCreated', false,
      'scoringPermissionGranted', false
    )
  );
exception when no_data_found then
  raise exception using errcode = '22023',
    message = 'TOURNAMENT_SETUP_TEAM_NOT_FOUND';
end;
$$;

create or replace function production_control.apply_tournament_setup_round_v1(
  input jsonb,
  next_revision bigint,
  actor_player text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  payload jsonb := case when pg_catalog.jsonb_typeof(input->'round') = 'object'
    then input->'round' else input end;
  target_round integer;
  target_format text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    payload->>'format', ''
  )));
  target_name text := pg_catalog.btrim(coalesce(
    payload->>'round_name', payload->>'name', ''
  ));
  target_allowance numeric;
  target_team_size integer;
  target_points numeric;
  target_order integer;
  current_value scoring_authority.rounds%rowtype;
  current_detail scoring_authority.tournament_setup_round_details_v1%rowtype;
  changed_value boolean := false;
  dependencies jsonb;
begin
  begin
    target_round := coalesce(payload->>'round_number',
      payload->>'roundNumber')::integer;
    target_allowance := nullif(coalesce(payload->>'handicap_allowance',
      payload->>'handicapAllowance'), '')::numeric;
    target_team_size := coalesce(payload->>'team_size',
      payload->>'teamSize')::integer;
    target_points := coalesce(payload->>'points_available',
      payload->>'pointsAvailable')::numeric;
    target_order := coalesce(payload->>'display_order',
      payload->>'displayOrder', target_round::text)::integer;
  exception when others then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_ROUND_INPUT_INVALID';
  end;
  if target_round is null or target_round not between 1 and 3
     or target_format not in ('BB', 'SC', 'SI')
     or target_name = '' or pg_catalog.length(target_name) > 160
     or target_team_size is null or target_points is null
     or target_order is null
     or target_team_size <> (case when target_format = 'SI' then 1 else 2 end)
     or target_points < 0 or target_order not between 1 and 99
     or pg_catalog.upper(coalesce(payload->>'status', 'UPCOMING')) <> 'UPCOMING'
  then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_ROUND_INPUT_INVALID';
  end if;
  select value.* into current_value
  from scoring_authority.rounds value
  where value.tournament_id = '2026' and value.round_number = target_round
  for update;
  if current_value.tournament_id is null then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_EXISTING_ROUND_REQUIRED';
  end if;
  if current_value.status <> 'UPCOMING' then
    raise exception using errcode = '55000',
      message = 'TOURNAMENT_SETUP_ROUND_STARTED_LOCKED';
  end if;
  select value.* into current_detail
  from scoring_authority.tournament_setup_round_details_v1 value
  where value.tournament_id = '2026' and value.round_number = target_round
  for update;
  changed_value := current_value.tournament_id is null
    or current_value.format is distinct from target_format
    or current_value.name is distinct from target_name
    or current_value.handicap_allowance is distinct from target_allowance
    or current_detail.team_size is distinct from target_team_size
    or current_detail.points_available is distinct from target_points
    or current_detail.display_order is distinct from target_order;
  if changed_value then
    dependencies := production_control.tournament_setup_dependency_codes_v1(
      null, null, target_round, null, 'ROUND'
    );
    if pg_catalog.jsonb_array_length(dependencies) > 0 then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'TOURNAMENT_SETUP_DEPENDENCY_BLOCKED',
        'blockers', dependencies
      );
    end if;
    update scoring_authority.rounds set
      format = target_format,
      name = target_name,
      handicap_allowance = target_allowance,
      source_payload = pg_catalog.jsonb_set(
        source_payload, array['Points Available']::text[],
        pg_catalog.to_jsonb(target_points), true
      )
    where tournament_id = '2026' and round_number = target_round
      and status = 'UPCOMING';
    insert into scoring_authority.tournament_setup_round_details_v1 (
      tournament_id, round_number, team_size, points_available,
      display_order, setup_revision, updated_by_player_id
    ) values (
      '2026', target_round, target_team_size, target_points,
      target_order, next_revision, actor_player
    ) on conflict (tournament_id, round_number) do update set
      team_size = excluded.team_size,
      points_available = excluded.points_available,
      display_order = excluded.display_order,
      setup_revision = excluded.setup_revision,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    update scoring_authority.tournament_setup_match_details_v1 set
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      setup_revision = next_revision,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = '2026' and round_number = target_round;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'changed', changed_value,
    'targetKind', 'ROUND', 'targetId', target_round::text,
    'safeMetadata', pg_catalog.jsonb_build_object(
      'roundNumber', target_round,
      'format', target_format,
      'teamSizePerSide', target_team_size,
      'pointsAvailable', target_points,
      'status', 'UPCOMING'
    )
  );
end;
$$;

create or replace function production_control.apply_tournament_setup_course_v1(
  input jsonb,
  next_revision bigint,
  actor_player text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  payload jsonb := case when pg_catalog.jsonb_typeof(input->'course') = 'object'
    then input->'course' else input end;
  requested_course text := pg_catalog.btrim(coalesce(
    payload->>'course_id', payload->>'courseId', ''
  ));
  target_course text;
  target_tee text := pg_catalog.btrim(coalesce(
    payload->>'tee_id', payload->>'tee', ''
  ));
  target_name text;
  target_location text;
  target_rating numeric;
  target_slope integer;
  target_par integer;
  holes_input jsonb := payload->'holes';
  rounds_input jsonb;
  normalized_holes jsonb := '[]'::jsonb;
  normalized_rounds jsonb := '[]'::jsonb;
  hole_value jsonb;
  round_value jsonb;
  hole_number integer;
  hole_par integer;
  stroke_index integer;
  yardage_value integer;
  round_number_value integer;
  current_manifest jsonb;
  target_manifest jsonb;
  changed_value boolean := false;
  dependencies jsonb;
begin
  if requested_course = '' or target_tee = '' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_COURSE_ID_TEE_REQUIRED';
  end if;
  select known.course_id into target_course
  from (
    select course.course_id, 1 priority
    from scoring_authority.tournament_setup_course_tees_v1 course
    where course.tournament_id = '2026'
    union all
    select snapshot.course_id, 2
    from scoring_authority.scoring_snapshots snapshot
    where snapshot.tournament_id = '2026'
    union all
    select identity_value.course_id, 3
    from scoring_authority.completed_history_course_identities identity_value
  ) known
  where pg_catalog.lower(known.course_id) = pg_catalog.lower(requested_course)
  order by (known.course_id = requested_course) desc, known.priority
  limit 1;
  if target_course is null then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_EXISTING_COURSE_ID_REQUIRED';
  end if;
  target_name := pg_catalog.btrim(coalesce(
    payload->>'course_name', payload->>'display_name',
    payload->>'displayName', payload->>'name',
    (select course.display_name
      from scoring_authority.tournament_setup_course_tees_v1 course
      where course.tournament_id = '2026'
        and course.course_id = target_course and course.tee_id = target_tee),
    (select identity_value.canonical_name
      from scoring_authority.completed_history_course_identities identity_value
      where identity_value.course_id = target_course),
    target_course
  ));
  target_location := nullif(pg_catalog.btrim(coalesce(
    payload->>'location', nullif(pg_catalog.concat_ws(', ',
      nullif(pg_catalog.btrim(payload->>'city'), ''),
      nullif(pg_catalog.btrim(payload->>'state'), '')
    ), ''),
    (select course.location
      from scoring_authority.tournament_setup_course_tees_v1 course
      where course.tournament_id = '2026'
        and course.course_id = target_course and course.tee_id = target_tee),
    (select identity_value.canonical_location
      from scoring_authority.completed_history_course_identities identity_value
      where identity_value.course_id = target_course), ''
  )), '');
  begin
    target_rating := coalesce(payload->>'rating',
      payload->>'courseRating')::numeric;
    target_slope := coalesce(payload->>'slope',
      payload->>'slopeRating')::integer;
    target_par := (payload->>'par')::integer;
  exception when others then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_COURSE_SCORING_VALUES_INVALID';
  end;
  if target_name = '' or pg_catalog.length(target_name) > 240
     or target_rating is null or target_rating <= 0 or target_rating > 100
     or target_slope not between 55 and 155
     or target_par not between 54 and 90
     or pg_catalog.jsonb_typeof(holes_input) is distinct from 'array'
     or pg_catalog.jsonb_array_length(holes_input) <> 18 then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_COURSE_SCORING_VALUES_INVALID';
  end if;
  for hole_value in
    select item from pg_catalog.jsonb_array_elements(holes_input) item
  loop
    begin
      hole_number := coalesce(hole_value->>'hole_number',
        hole_value->>'holeNumber', hole_value->>'number')::integer;
      hole_par := (hole_value->>'par')::integer;
      stroke_index := coalesce(hole_value->>'stroke_index',
        hole_value->>'strokeIndex')::integer;
      yardage_value := nullif(hole_value->>'yardage', '')::integer;
    exception when others then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_SETUP_HOLE_DEFINITION_INVALID';
    end;
    if hole_number not between 1 and 18 or hole_par not between 3 and 6
       or stroke_index not between 1 and 18
       or (yardage_value is not null and yardage_value not between 1 and 999)
    then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_SETUP_HOLE_DEFINITION_INVALID';
    end if;
    normalized_holes := normalized_holes || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'hole_number', hole_number, 'par', hole_par,
        'stroke_index', stroke_index, 'yardage', yardage_value
      )
    );
  end loop;
  select pg_catalog.jsonb_agg(value order by (value->>'hole_number')::integer)
    into normalized_holes
  from pg_catalog.jsonb_array_elements(normalized_holes) value;
  if (select pg_catalog.count(distinct (value->>'hole_number')::integer)
      from pg_catalog.jsonb_array_elements(normalized_holes) value) <> 18
     or (select pg_catalog.count(distinct (value->>'stroke_index')::integer)
      from pg_catalog.jsonb_array_elements(normalized_holes) value) <> 18
     or (select pg_catalog.sum((value->>'par')::integer)
      from pg_catalog.jsonb_array_elements(normalized_holes) value)
        <> target_par then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_HOLE_NUMBER_STROKE_INDEX_INCOMPLETE';
  end if;

  rounds_input := case
    when pg_catalog.jsonb_typeof(payload->'round_numbers') = 'array'
      then payload->'round_numbers'
    when pg_catalog.jsonb_typeof(payload->'roundNumbers') = 'array'
      then payload->'roundNumbers'
    when coalesce(payload->>'round_number', payload->>'roundNumber', '') <> ''
      then pg_catalog.jsonb_build_array(coalesce(payload->>'round_number',
        payload->>'roundNumber')::integer)
    else '[]'::jsonb end;
  if pg_catalog.jsonb_array_length(rounds_input) = 0 then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_COURSE_ROUND_ASSIGNMENT_REQUIRED';
  end if;
  for round_value in
    select item from pg_catalog.jsonb_array_elements(rounds_input) item
  loop
    begin
      round_number_value := (round_value #>> '{}')::integer;
    exception when others then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_SETUP_COURSE_ROUND_INVALID';
    end;
    if not exists (
      select 1 from scoring_authority.rounds round_row
      where round_row.tournament_id = '2026'
        and round_row.round_number = round_number_value
    ) then
      raise exception using errcode = '22023',
        message = 'TOURNAMENT_SETUP_COURSE_ROUND_INVALID';
    end if;
    normalized_rounds := normalized_rounds ||
      pg_catalog.jsonb_build_array(round_number_value);
  end loop;
  select pg_catalog.jsonb_agg(value order by (value #>> '{}')::integer)
    into normalized_rounds
  from (
    select distinct value from (
      select value
      from pg_catalog.jsonb_array_elements(normalized_rounds) value
      union all
      select pg_catalog.to_jsonb(assignment.round_number)
      from scoring_authority.tournament_setup_round_courses_v1 assignment
      where assignment.tournament_id = '2026'
        and assignment.course_id = target_course
        and assignment.tee_id = target_tee
    ) retained
  ) deduplicated;

  select pg_catalog.jsonb_build_object(
    'course_id', course.course_id, 'tee', course.tee_id,
    'display_name', course.display_name, 'location', course.location,
    'rating', course.rating, 'slope', course.slope, 'par', course.par,
    'holes', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'hole_number', hole.hole_number, 'par', hole.par,
        'stroke_index', hole.stroke_index, 'yardage', hole.yardage
      ) order by hole.hole_number)
      from scoring_authority.tournament_setup_course_holes_v1 hole
      where hole.tournament_id = course.tournament_id
        and hole.course_id = course.course_id and hole.tee_id = course.tee_id
    ), '[]'::jsonb),
    'round_numbers', coalesce((
      select pg_catalog.jsonb_agg(assignment.round_number
        order by assignment.round_number)
      from scoring_authority.tournament_setup_round_courses_v1 assignment
      where assignment.tournament_id = course.tournament_id
        and assignment.course_id = course.course_id
        and assignment.tee_id = course.tee_id
    ), '[]'::jsonb)
  ) into current_manifest
  from scoring_authority.tournament_setup_course_tees_v1 course
  where course.tournament_id = '2026' and course.course_id = target_course
    and course.tee_id = target_tee;
  target_manifest := pg_catalog.jsonb_build_object(
    'course_id', target_course, 'tee', target_tee,
    'display_name', target_name, 'location', target_location,
    'rating', target_rating, 'slope', target_slope, 'par', target_par,
    'holes', normalized_holes, 'round_numbers', normalized_rounds
  );
  changed_value := current_manifest is distinct from target_manifest;
  if changed_value then
    if exists (
      select 1
      from scoring_authority.matches match_value
      join scoring_authority.scoring_snapshots snapshot
        on snapshot.snapshot_id = match_value.scoring_snapshot_id
      where match_value.tournament_id = '2026'
        and snapshot.course_id = target_course and snapshot.tee = target_tee
        and not production_control.handicap_v1_match_is_unstarted(
          match_value.match_id
        )
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'TOURNAMENT_SETUP_STARTED_MATCH_LOCKED',
        'blockers', pg_catalog.jsonb_build_array('STARTED_MATCH_DEPENDENCY')
      );
    end if;
    dependencies := production_control.tournament_setup_dependency_codes_v1(
      null, null, null, null, 'COURSE'
    );
    if pg_catalog.jsonb_array_length(dependencies) > 0 then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'TOURNAMENT_SETUP_DEPENDENCY_BLOCKED',
        'blockers', dependencies
      );
    end if;
    insert into scoring_authority.tournament_setup_course_tees_v1 (
      tournament_id, course_id, tee_id, display_name, location,
      rating, slope, par, setup_revision, updated_by_player_id
    ) values (
      '2026', target_course, target_tee, target_name, target_location,
      target_rating, target_slope, target_par, next_revision, actor_player
    ) on conflict (tournament_id, course_id, tee_id) do update set
      display_name = excluded.display_name,
      location = excluded.location,
      rating = excluded.rating,
      slope = excluded.slope,
      par = excluded.par,
      setup_revision = excluded.setup_revision,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    delete from scoring_authority.tournament_setup_course_holes_v1
    where tournament_id = '2026' and course_id = target_course
      and tee_id = target_tee;
    insert into scoring_authority.tournament_setup_course_holes_v1 (
      tournament_id, course_id, tee_id, hole_number, par, stroke_index,
      yardage, setup_revision
    ) select '2026', target_course, target_tee,
      (value->>'hole_number')::integer, (value->>'par')::integer,
      (value->>'stroke_index')::integer,
      nullif(value->>'yardage', '')::integer, next_revision
    from pg_catalog.jsonb_array_elements(normalized_holes) value;
    insert into scoring_authority.tournament_setup_round_courses_v1 (
      tournament_id, round_number, course_id, tee_id, setup_revision,
      updated_by_player_id
    ) select '2026', (value #>> '{}')::integer, target_course,
      target_tee, next_revision, actor_player
    from pg_catalog.jsonb_array_elements(rounds_input) value
    on conflict (tournament_id, round_number) do update set
      course_id = excluded.course_id,
      tee_id = excluded.tee_id,
      setup_revision = excluded.setup_revision,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    insert into scoring_authority.tournament_setup_match_details_v1 (
      match_id, tournament_id, round_number, match_number, course_id, tee_id,
      tee_time, starting_hole, setup_revision, prepared_setup_revision,
      prepared_configuration_fingerprint, updated_by_player_id
    )
    select match_value.match_id, '2026', match_value.round_number,
      nullif(pg_catalog.regexp_replace(match_value.match_id, '^.*-', ''), '')::integer,
      target_course, target_tee,
      nullif(presentation.tee_time, '')::time,
      coalesce(nullif(presentation.starting_hole, '')::integer, 1),
      next_revision, null, null, actor_player
    from scoring_authority.matches match_value
    join scoring_authority.scoring_snapshots snapshot
      on snapshot.snapshot_id = match_value.scoring_snapshot_id
    left join scoring_authority.game_center_presentations presentation
      on presentation.match_id = match_value.match_id
    where match_value.tournament_id = '2026'
      and snapshot.course_id = target_course and snapshot.tee = target_tee
      and production_control.handicap_v1_match_is_unstarted(
        match_value.match_id
      )
    on conflict (match_id) do update set
      setup_revision = excluded.setup_revision,
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    update scoring_authority.tournament_setup_match_details_v1 detail set
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      setup_revision = next_revision,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where detail.tournament_id = '2026'
      and (detail.course_id = target_course and detail.tee_id = target_tee
        or detail.round_number in (
          select (value #>> '{}')::integer
          from pg_catalog.jsonb_array_elements(normalized_rounds) value
        ));
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'changed', changed_value,
    'targetKind', 'COURSE_TEE',
    'targetId', target_course || ':' || target_tee,
    'safeMetadata', pg_catalog.jsonb_build_object(
      'courseId', target_course, 'tee', target_tee,
      'holeCount', 18, 'roundNumbers', normalized_rounds,
      'complete', true
    )
  );
end;
$$;

create or replace function production_control.apply_tournament_setup_match_v1(
  input jsonb,
  next_revision bigint,
  actor_player text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  payload jsonb := case when pg_catalog.jsonb_typeof(input->'match') = 'object'
    then input->'match' else input end;
  target_round integer;
  target_number integer;
  target_match text;
  supplied_match text := pg_catalog.btrim(coalesce(
    payload->>'match_id', payload->>'matchId', ''
  ));
  target_course text := pg_catalog.btrim(coalesce(
    payload->>'course_id', payload->>'courseId', ''
  ));
  target_tee text := pg_catalog.btrim(coalesce(
    payload->>'tee_id', payload->>'tee', ''
  ));
  target_tee_time time without time zone;
  target_start integer;
  round_value scoring_authority.rounds%rowtype;
  course_value scoring_authority.tournament_setup_course_tees_v1%rowtype;
  current_match scoring_authority.matches%rowtype;
  current_detail scoring_authority.tournament_setup_match_details_v1%rowtype;
  current_snapshot scoring_authority.scoring_snapshots%rowtype;
  changed_value boolean := false;
  semantic_change boolean := false;
  course_change boolean := false;
  dependencies jsonb;
begin
  begin
    target_round := coalesce(payload->>'round_number',
      payload->>'roundNumber')::integer;
    target_number := coalesce(payload->>'match_number',
      payload->>'matchNumber')::integer;
    target_start := coalesce(payload->>'starting_hole',
      payload->>'startingHole', '1')::integer;
    target_tee_time := nullif(coalesce(payload->>'tee_time',
      payload->>'teeTime'), '')::time;
  exception when others then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_MATCH_INPUT_INVALID';
  end;
  if target_round not between 1 and 99 or target_number not between 1 and 99
     or target_start not between 1 and 18
     or target_course = '' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_MATCH_INPUT_INVALID';
  end if;
  target_match := pg_catalog.format('2026-R%s-%s', target_round, target_number);
  if supplied_match <> '' and supplied_match <> target_match then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_MATCH_ID_INVALID';
  end if;
  select value.* into strict round_value
  from scoring_authority.rounds value
  where value.tournament_id = '2026' and value.round_number = target_round;
  if target_tee = '' then
    select assignment.tee_id into target_tee
    from scoring_authority.tournament_setup_round_courses_v1 assignment
    where assignment.tournament_id = '2026'
      and assignment.round_number = target_round
      and assignment.course_id = target_course;
  end if;
  if pg_catalog.btrim(coalesce(target_tee, '')) = '' then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_MATCH_TEE_ASSIGNMENT_REQUIRED';
  end if;
  select value.* into strict course_value
  from scoring_authority.tournament_setup_course_tees_v1 value
  where value.tournament_id = '2026' and value.course_id = target_course
    and value.tee_id = target_tee;
  if not exists (
    select 1
    from scoring_authority.tournament_setup_round_courses_v1 assignment
    where assignment.tournament_id = '2026'
      and assignment.round_number = target_round
      and assignment.course_id = target_course
      and assignment.tee_id = target_tee
  ) then
    raise exception using errcode = '22023',
      message = 'TOURNAMENT_SETUP_MATCH_ROUND_COURSE_MISMATCH';
  end if;
  select value.* into current_match
  from scoring_authority.matches value where value.match_id = target_match for update;
  if current_match.match_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'TOURNAMENT_SETUP_EXISTING_MATCH_REQUIRED',
      'blockers', pg_catalog.jsonb_build_array(
        'Tournament Setup can update only an existing canonical match.'
      )
    );
  end if;
  select value.* into current_detail
  from scoring_authority.tournament_setup_match_details_v1 value
  where value.match_id = target_match for update;
  select value.* into strict current_snapshot
  from scoring_authority.scoring_snapshots value
  where value.snapshot_id = current_match.scoring_snapshot_id;
  semantic_change := current_match.round_number is distinct from target_round
    or current_match.format is distinct from round_value.format
    or current_snapshot.course_id is distinct from target_course
    or current_snapshot.tee is distinct from target_tee
    or current_detail.starting_hole is distinct from target_start;
  course_change := current_snapshot.course_id is distinct from target_course
    or current_snapshot.tee is distinct from target_tee;
  changed_value := semantic_change or current_detail.match_id is null
    or current_detail.tee_time is distinct from target_tee_time
    or current_detail.starting_hole is distinct from target_start
    or current_detail.course_id is distinct from target_course
    or current_detail.tee_id is distinct from target_tee;
  if changed_value then
    perform production_control.assert_tournament_setup_match_mutable_v1(
      target_match
    );
    if semantic_change then
      dependencies := production_control.tournament_setup_dependency_codes_v1(
        null, null, target_round, target_match, 'MATCH'
      );
      if pg_catalog.jsonb_array_length(dependencies) > 0 then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'TOURNAMENT_SETUP_DEPENDENCY_BLOCKED',
          'blockers', dependencies
        );
      end if;
    end if;
    update scoring_authority.matches set
      round_number = target_round,
      format = round_value.format,
      match_revision = match_revision + case when semantic_change then 1 else 0 end,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = target_match;
    insert into scoring_authority.tournament_setup_match_details_v1 (
      match_id, tournament_id, round_number, match_number, course_id, tee_id,
      tee_time, starting_hole, setup_revision, prepared_setup_revision,
      prepared_configuration_fingerprint, updated_by_player_id
    ) values (
      target_match, '2026', target_round, target_number, target_course,
      target_tee, target_tee_time, target_start, next_revision, null, null,
      actor_player
    ) on conflict (match_id) do update set
      round_number = excluded.round_number,
      match_number = excluded.match_number,
      course_id = excluded.course_id,
      tee_id = excluded.tee_id,
      tee_time = excluded.tee_time,
      starting_hole = excluded.starting_hole,
      setup_revision = excluded.setup_revision,
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    insert into scoring_authority.game_center_presentations (
      match_id, tournament_id, course_name, course_logo, course_yardage,
      tee_time, starting_hole, display_match_number, match_sort_order,
      team_1_logo, team_1_primary_color, team_1_secondary_color,
      team_2_logo, team_2_primary_color, team_2_secondary_color,
      tournament_location, tournament_logo, tournament_status,
      tournament_time_zone, source_workbook_id, source_updated_at,
      source_payload_hash, imported_by
    ) values (
      target_match, '2026', course_value.display_name, '', '',
      coalesce(target_tee_time::text, ''), target_start::text,
      target_number::text, target_round * 100 + target_number,
      coalesce((select template.team_1_logo
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      coalesce((select template.team_1_primary_color
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      coalesce((select template.team_1_secondary_color
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      coalesce((select template.team_2_logo
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      coalesce((select template.team_2_primary_color
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      coalesce((select template.team_2_secondary_color
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      coalesce((select operational.destination
        from scoring_authority.tournament_setup_operational_v1 operational
        where operational.tournament_id = '2026'), ''),
      coalesce((select template.tournament_logo
        from scoring_authority.game_center_presentations template
        where template.tournament_id = '2026'
        order by template.match_sort_order limit 1), ''),
      'UPCOMING',
      coalesce((select operational.timezone
        from scoring_authority.tournament_setup_operational_v1 operational
        where operational.tournament_id = '2026'), 'America/Chicago'),
      (select tournament.source_workbook_id
       from scoring_authority.tournaments tournament
       where tournament.tournament_id = '2026'),
      null,
      production_control.tournament_setup_hash_v1(
        pg_catalog.jsonb_build_object(
          'match_id', target_match, 'course_name', course_value.display_name,
          'tee_time', target_tee_time, 'starting_hole', target_start,
          'match_number', target_number, 'round_number', target_round
        )
      ), actor_player
    ) on conflict (match_id) do update set
      course_name = excluded.course_name,
      course_logo = case when course_change then excluded.course_logo
        else scoring_authority.game_center_presentations.course_logo end,
      course_yardage = case when course_change then excluded.course_yardage
        else scoring_authority.game_center_presentations.course_yardage end,
      tee_time = excluded.tee_time,
      starting_hole = excluded.starting_hole,
      display_match_number = excluded.display_match_number,
      match_sort_order = excluded.match_sort_order,
      tournament_location = excluded.tournament_location,
      tournament_status = excluded.tournament_status,
      tournament_time_zone = excluded.tournament_time_zone,
      source_payload_hash = excluded.source_payload_hash,
      imported_by = excluded.imported_by,
      updated_at = pg_catalog.clock_timestamp();
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'changed', changed_value,
    'targetKind', 'MATCH', 'targetId', target_match,
    'safeMetadata', pg_catalog.jsonb_build_object(
      'matchId', target_match, 'roundNumber', target_round,
      'matchNumber', target_number, 'format', round_value.format,
      'courseId', target_course, 'tee', target_tee,
      'startingHole', target_start,
      'created', false,
      'scoringPermissionGranted', false,
      'scoringMutationCreated', false
    )
  );
exception when no_data_found then
  raise exception using errcode = '22023',
    message = 'TOURNAMENT_SETUP_ROUND_OR_COURSE_NOT_FOUND';
end;
$$;

create or replace function public.mutate_production_tournament_setup_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  action_value text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'operation', input->>'action', ''
  )));
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  operation_request uuid;
  expected_revision bigint;
  current_revision bigint;
  next_revision bigint;
  declared_hash text := pg_catalog.lower(coalesce(
    input->>'request_payload_hash', ''
  ));
  database_hash text;
  receipt production_control.tournament_setup_operation_receipts_v1%rowtype;
  result_value jsonb;
  response_value jsonb;
  changed_value boolean;
  target_kind text;
  target_id text;
  safe_metadata jsonb;
  warning_values jsonb;
begin
  perform production_control.assert_tournament_setup_runtime_v1(input);
  if action_value not in (
       'UPDATE_TOURNAMENT', 'UPDATE_TEAM', 'ASSIGN_ROSTER_TEAM',
       'UPDATE_ROUND', 'UPSERT_COURSE', 'UPSERT_MATCH',
       'REPLACE_PAIRINGS', 'PREPARE_SCORING_CONTEXT'
     )
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_revision', '') !~ '^[0-9]+$'
     or (input ? 'actor_player_id' and pg_catalog.upper(pg_catalog.btrim(
       input->>'actor_player_id'
     )) is distinct from actor_player)
     or (input ? 'actor_auth_user_id' and pg_catalog.lower(pg_catalog.btrim(
       input->>'actor_auth_user_id'
     )) is distinct from pg_catalog.lower(pg_catalog.btrim(
       input#>>'{authorization,auth_user_id}'
     ))) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'TOURNAMENT_SETUP_INPUT_INVALID'
    );
  end if;
  begin
    actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
    operation_request := (input->>'operation_request_id')::uuid;
    expected_revision := (input->>'expected_revision')::bigint;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'TOURNAMENT_SETUP_INPUT_INVALID'
    );
  end;
  database_hash := production_control.tournament_setup_hash_v1(
    input - 'request_payload_hash'
  );
  select value.* into receipt
  from production_control.tournament_setup_operation_receipts_v1 value
  where value.tournament_id = '2026'
    and value.action = action_value
    and value.operation_request_id = operation_request;
  if found then
    if receipt.declared_request_payload_hash = declared_hash
       and receipt.database_request_payload_hash = database_hash then
      return receipt.response || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT'
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-tournament-setup-v1:2026', 0
  ));
  select value.* into receipt
  from production_control.tournament_setup_operation_receipts_v1 value
  where value.tournament_id = '2026'
    and value.action = action_value
    and value.operation_request_id = operation_request;
  if found then
    if receipt.declared_request_payload_hash = declared_hash
       and receipt.database_request_payload_hash = database_hash then
      return receipt.response || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT'
    );
  end if;
  current_revision := production_control.tournament_setup_revision_v1('2026');
  if current_revision <> expected_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'TOURNAMENT_SETUP_REVISION_STALE',
      'currentRevision', current_revision
    );
  end if;
  next_revision := current_revision + 1;
  case action_value
    when 'UPDATE_TOURNAMENT' then
      result_value := production_control.apply_tournament_setup_tournament_v1(
        input, next_revision, actor_player
      );
    when 'UPDATE_TEAM' then
      result_value := production_control.apply_tournament_setup_team_v1(
        input, next_revision, actor_player
      );
    when 'ASSIGN_ROSTER_TEAM' then
      result_value := production_control.apply_tournament_setup_membership_v1(
        input, next_revision, actor_player, actor_auth
      );
    when 'UPDATE_ROUND' then
      result_value := production_control.apply_tournament_setup_round_v1(
        input, next_revision, actor_player
      );
    when 'UPSERT_COURSE' then
      result_value := production_control.apply_tournament_setup_course_v1(
        input, next_revision, actor_player
      );
    when 'UPSERT_MATCH' then
      result_value := production_control.apply_tournament_setup_match_v1(
        input, next_revision, actor_player
      );
    when 'REPLACE_PAIRINGS' then
      result_value := production_control.apply_tournament_setup_pairings_v1(
        input, next_revision, actor_player
      );
    when 'PREPARE_SCORING_CONTEXT' then
      result_value :=
        production_control.apply_tournament_setup_scoring_context_v1(
          input, next_revision, actor_player
        );
  end case;
  if not coalesce((result_value->>'ok')::boolean, false) then
    return result_value || pg_catalog.jsonb_build_object(
      'revision', current_revision,
      'readiness', production_control.tournament_setup_readiness_v1()
    );
  end if;
  changed_value := coalesce((result_value->>'changed')::boolean, false);
  if changed_value then
    insert into production_control.tournament_setup_context_v1 (
      tournament_id, contract_version, revision,
      updated_by_player_id, updated_by_auth_user_id
    ) values (
      '2026', 'production-tournament-setup-v1', next_revision,
      actor_player, actor_auth
    ) on conflict (tournament_id) do update set
      contract_version = excluded.contract_version,
      revision = excluded.revision,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_by_auth_user_id = excluded.updated_by_auth_user_id,
      updated_at = pg_catalog.clock_timestamp();
  else
    next_revision := current_revision;
  end if;
  target_kind := result_value->>'targetKind';
  target_id := result_value->>'targetId';
  safe_metadata := coalesce(result_value->'safeMetadata', '{}'::jsonb);
  warning_values := coalesce(result_value->'warnings', '[]'::jsonb);
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', case when changed_value then 'TOURNAMENT_SETUP_UPDATED'
      else 'TOURNAMENT_SETUP_NO_CHANGE' end,
    'action', action_value,
    'changed', changed_value,
    'revision', next_revision,
    'idempotent', false,
    'target', target_id,
    'targetId', target_id,
    'snapshotPrepared', coalesce(
      (result_value->>'snapshotPrepared')::boolean, false
    ),
    'warnings', warning_values,
    'readiness', production_control.tournament_setup_readiness_v1(),
    'timestamp', pg_catalog.clock_timestamp(),
    'scoringPermissionGranted', false,
    'scoringMutationCreated', false
  );
  insert into production_control.tournament_setup_audit_events_v1 (
    tournament_id, action, target_kind, target_id,
    actor_player_id, actor_auth_user_id, operation_request_id,
    prior_revision, next_revision, result, safe_metadata
  ) values (
    '2026', action_value, target_kind, target_id,
    actor_player, actor_auth, operation_request,
    current_revision, next_revision,
    case when changed_value then 'CHANGED' else 'NO_CHANGE' end,
    safe_metadata || pg_catalog.jsonb_build_object(
      'warningCount', pg_catalog.jsonb_array_length(warning_values),
      'scoringPermissionGranted', false,
      'scoringMutationCreated', false
    )
  );
  insert into production_control.tournament_setup_operation_receipts_v1 (
    tournament_id, action, operation_request_id,
    declared_request_payload_hash, database_request_payload_hash,
    actor_player_id, actor_auth_user_id, prior_revision,
    next_revision, response
  ) values (
    '2026', action_value, operation_request,
    declared_hash, database_hash, actor_player, actor_auth,
    current_revision, next_revision, response_value
  );
  return response_value;
end;
$$;

-- Preserve the installed Production match-control contract while adding one
-- match-local, server-authoritative readiness gate to MARK_LIVE. Other control
-- operations, receipts, revisions, permission behavior, audit, and the Google
-- archive outbox remain byte-for-byte compatible in shape and semantics.
create or replace function public.mutate_production_match_control(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  operation text := pg_catalog.upper(coalesce(input->>'operation', ''));
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce(
    (input->>'expected_match_revision')::bigint, -1
  );
  expected_permission bigint := coalesce(
    (input#>>'{authorization,permission_revision}')::bigint, -1
  );
  next_match_revision bigint;
  next_permission_revision bigint;
  permission_changes boolean;
  target_locked boolean;
  target_access boolean;
  event_type text;
  mutation_type text;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  readiness_value jsonb;
  transition_at timestamptz := pg_catalog.clock_timestamp();
begin
  perform production_control.assert_production_scoring_runtime(input);
  perform production_control.assert_production_scoring_actor(input, true);
  if operation not in (
       'MARK_LIVE', 'SCORING_LOCK', 'SCORING_UNLOCK',
       'ACCESS_ACTIVATE', 'ACCESS_REVOKE'
     ) or coalesce(target_match, '') = ''
       or coalesce(mutation_identity, '') = '' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INVALID_CONTROL_OPERATION'
    );
  end if;
  -- Tournament Setup always acquires this lock before locking a match. Use the
  -- same order so a setup commit and MARK_LIVE cannot pass one another.
  if operation = 'MARK_LIVE' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'production-access-governance-v1:2026', 0
    ));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'production-tournament-setup-v1:2026', 0
    ));
  end if;
  select * into match_row from scoring_authority.matches
    where match_id = target_match and tournament_id = '2026' for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_NOT_FOUND'
    );
  end if;
  if input#>>'{authorization,match_id}' <> target_match then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'DIRECTOR_REQUIRED'
    );
  end if;
  payload_hash_value := production_control.cutover_payload_hash(
    pg_catalog.jsonb_build_object(
      'match_id', target_match, 'operation', operation, 'actor_id', actor
    )
  );
  select * into mutation_row from scoring_authority.score_mutations
    where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'IDEMPOTENCY_CONFLICT'
    );
  end if;
  if expected_match <> match_row.match_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision
    );
  end if;
  if expected_permission <> match_row.permission_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision
    );
  end if;
  if match_row.status = 'FINAL' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_FINAL'
    );
  end if;
  if operation = 'MARK_LIVE' and match_row.status = 'LIVE' then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'status', match_row.status,
      'scoring_locked', match_row.scoring_locked,
      'google_outbox_created', false
    );
  end if;
  if operation = 'MARK_LIVE' and match_row.status <> 'UPCOMING' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_NOT_UPCOMING'
    );
  end if;
  if operation = 'MARK_LIVE' then
    readiness_value :=
      production_control.assert_production_match_scoring_ready_v1(
        target_match
      );
    if coalesce((readiness_value->>'ready')::boolean, false) is not true then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'code', 'PRODUCTION_MATCH_NOT_SCORING_READY',
        'match_id', target_match,
        'match_revision', match_row.match_revision,
        'permission_revision', match_row.permission_revision,
        'status', match_row.status,
        'scoring_locked', match_row.scoring_locked,
        'scoring_readiness_contract',
          'production-match-scoring-readiness-v1',
        'reasons', coalesce(readiness_value->'reasons', '[]'::jsonb),
        'audit_created', false,
        'google_outbox_created', false
      );
    end if;
  end if;
  if operation in ('SCORING_UNLOCK', 'ACCESS_ACTIVATE') and (
       (operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked)
       or (operation = 'SCORING_UNLOCK' and not match_row.scoring_locked)
     ) then
    if operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'SCORING_LOCKED'
      );
    end if;
    if not exists (
      select 1 from scoring_authority.scoring_permissions
      where match_id = target_match and (
        not can_score or revoked_at is not null
        or permission_revision <> match_row.permission_revision
      )
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
        'match_id', target_match,
        'match_revision', match_row.match_revision,
        'permission_revision', match_row.permission_revision,
        'scoring_locked', match_row.scoring_locked,
        'access_active', true,
        'google_outbox_created', false
      );
    end if;
  end if;
  if operation = 'SCORING_LOCK' and match_row.scoring_locked and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (
      can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', true,
      'access_active', false,
      'google_outbox_created', false
    );
  end if;
  if operation = 'ACCESS_REVOKE' and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (
      can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', match_row.scoring_locked,
      'access_active', false,
      'google_outbox_created', false
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(permission) order by player_id
  ), '[]'::jsonb) into before_permissions
  from scoring_authority.scoring_permissions permission
  where match_id = target_match;
  next_match_revision := match_row.match_revision + 1;
  permission_changes := operation <> 'MARK_LIVE';
  next_permission_revision := match_row.permission_revision
    + case when permission_changes then 1 else 0 end;
  target_locked := case operation
    when 'SCORING_LOCK' then true
    when 'SCORING_UNLOCK' then false
    else match_row.scoring_locked end;
  target_access := case operation
    when 'SCORING_LOCK' then false
    when 'SCORING_UNLOCK' then true
    when 'ACCESS_ACTIVATE' then true
    when 'ACCESS_REVOKE' then false
    else exists (
      select 1 from scoring_authority.scoring_permissions
      where match_id = target_match and can_score and revoked_at is null
    ) end;
  event_type := case operation
    when 'MARK_LIVE' then 'MATCH_MARKED_LIVE'
    when 'SCORING_LOCK' then 'SCORING_LOCKED'
    when 'SCORING_UNLOCK' then 'SCORING_UNLOCKED'
    when 'ACCESS_ACTIVATE' then 'SCORING_ACCESS_ACTIVATED'
    else 'SCORING_ACCESS_REVOKED' end;
  mutation_type := operation;

  update scoring_authority.matches set
    status = case when operation = 'MARK_LIVE' then 'LIVE' else status end,
    scoring_locked = target_locked,
    match_revision = next_match_revision,
    permission_revision = next_permission_revision,
    authority_updated_at = transition_at,
    updated_at = transition_at
  where match_id = target_match returning * into next_match_row;
  if permission_changes then
    update scoring_authority.scoring_permissions set
      can_score = target_access,
      permission_revision = next_permission_revision,
      revoked_at = case when target_access then null else transition_at end,
      updated_at = transition_at
    where match_id = target_match;
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(permission) order by player_id
  ), '[]'::jsonb) into after_permissions
  from scoring_authority.scoring_permissions permission
  where match_id = target_match;
  result_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', operation,
    'match_id', target_match,
    'google_target_match_id', target_match,
    'match_revision', next_match_revision,
    'previous_permission_revision', match_row.permission_revision,
    'permission_revision', next_permission_revision,
    'status', next_match_row.status,
    'scoring_locked', target_locked,
    'access_active', target_access,
    'updated_at', transition_at,
    'permission_transition', pg_catalog.jsonb_build_object(
      'before', before_permissions, 'after', after_permissions
    ),
    'audit_created', true,
    'google_outbox_created', true
  );
  insert into scoring_authority.score_mutations (
    match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id
  ) values (
    target_match, mutation_identity, mutation_type, payload_hash_value,
    match_row.match_revision, next_match_revision, result_value, actor
  );
  insert into scoring_authority.score_revision_history (
    match_id, mutation_key, action, previous_match_revision,
    next_match_revision, before_state, after_state, actor_id
  ) values (
    target_match, mutation_identity, event_type,
    match_row.match_revision, next_match_revision,
    pg_catalog.jsonb_build_object(
      'match', pg_catalog.to_jsonb(match_row),
      'permissions', before_permissions
    ),
    pg_catalog.jsonb_build_object(
      'match', pg_catalog.to_jsonb(next_match_row),
      'permissions', after_permissions
    ),
    actor
  );
  insert into scoring_authority.audit_events (
    tournament_id, match_id, mutation_key, action, actor_id, metadata
  ) values (
    '2026', target_match, mutation_identity, event_type, actor, result_value
  );
  insert into scoring_authority.google_outbox_events (
    tournament_id, match_id, match_revision, mutation_key,
    event_type, payload, payload_hash
  ) values (
    '2026', target_match, next_match_revision, mutation_identity,
    event_type, result_value, payload_hash_value
  );
  return result_value;
end;
$$;

revoke all on function public.read_production_tournament_setup_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.mutate_production_tournament_setup_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.mutate_production_match_control(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_production_match_scoring_ready_v1(text)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_tournament_setup_v1(jsonb)
  to service_role;
grant execute on function public.mutate_production_tournament_setup_v1(jsonb)
  to service_role;
grant execute on function public.mutate_production_match_control(jsonb)
  to service_role;

revoke all on table production_control.tournament_setup_context_v1
  from public, anon, authenticated, service_role;
revoke all on table scoring_authority.tournament_setup_operational_v1
  from public, anon, authenticated, service_role;
revoke all on table scoring_authority.tournament_setup_team_details_v1
  from public, anon, authenticated, service_role;
revoke all on table scoring_authority.tournament_setup_round_details_v1
  from public, anon, authenticated, service_role;
revoke all on table scoring_authority.tournament_setup_course_tees_v1
  from public, anon, authenticated, service_role;
revoke all on table scoring_authority.tournament_setup_course_holes_v1
  from public, anon, authenticated, service_role;
revoke all on table scoring_authority.tournament_setup_round_courses_v1
  from public, anon, authenticated, service_role;
revoke all on table scoring_authority.tournament_setup_match_details_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.tournament_setup_operation_receipts_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.tournament_setup_audit_events_v1
  from public, anon, authenticated, service_role;

comment on function public.read_production_tournament_setup_v1(jsonb) is
  'Service-role transport for the exact Production Director Tournament Setup V1 read model.';
comment on function public.mutate_production_tournament_setup_v1(jsonb) is
  'Service-role transport for bounded, revisioned Production Director Tournament Setup V1 operations.';
comment on function public.mutate_production_match_control(jsonb) is
  'Existing Production match-control transport with server-authoritative MARK_LIVE scoring-readiness enforcement.';

commit;
