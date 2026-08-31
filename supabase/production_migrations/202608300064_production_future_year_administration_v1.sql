-- Step 13E.7 Production Future-Year Administration V1.
--
-- This migration installs an inert annual-administration staging contract. It
-- represents the already-current 2026 tournament and pointer, but it does not
-- change any canonical 2026 tournament fact or current-runtime control. Future
-- tournaments remain private staged containers until a separately certified
-- activation contract is installed. Structural match definitions deliberately
-- do not create scoring_authority.matches, snapshots, permissions, or scores.
begin;

create table production_control.future_tournament_catalog_v1 (
  tournament_id text primary key check (
    tournament_id ~ '^[0-9]{4}$'
  ),
  tournament_year integer not null unique check (
    tournament_year between 2026 and 2200
  ),
  contract_version text not null check (
    contract_version = 'production-future-year-administration-v1'
  ),
  tournament_name text not null check (
    pg_catalog.btrim(tournament_name) <> ''
    and pg_catalog.length(tournament_name) <= 180
  ),
  destination text,
  start_date date,
  end_date date,
  timezone text,
  lifecycle text not null check (lifecycle in (
    'DRAFT', 'CONFIGURING', 'READY_FOR_ACTIVATION',
    'ACTIVE', 'CLOSED', 'ARCHIVED'
  )),
  lifecycle_revision bigint not null check (lifecycle_revision > 0),
  setup_revision bigint not null check (setup_revision >= 0),
  creation_mode text not null check (creation_mode in (
    'EXISTING', 'BLANK', 'CLONE_STRUCTURE'
  )),
  clone_source_tournament_id text,
  readiness_fingerprint text check (
    readiness_fingerprint is null
    or readiness_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  readiness_setup_revision bigint check (
    readiness_setup_revision is null or readiness_setup_revision >= 0
  ),
  created_by_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  created_by_auth_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_by_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  updated_by_auth_user_id uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  source_manifest jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(source_manifest) = 'object'
  ),
  unique (tournament_id, tournament_year),
  check (tournament_id = tournament_year::text),
  check (destination is null or (
    pg_catalog.btrim(destination) <> ''
    and pg_catalog.length(destination) <= 240
  )),
  check (start_date is null or end_date is null or start_date <= end_date),
  check (timezone is null or (
    pg_catalog.btrim(timezone) <> '' and pg_catalog.length(timezone) <= 120
  )),
  check (
    (creation_mode = 'CLONE_STRUCTURE'
      and clone_source_tournament_id is not null)
    or (creation_mode <> 'CLONE_STRUCTURE'
      and clone_source_tournament_id is null)
  ),
  check (
    (readiness_fingerprint is null and readiness_setup_revision is null)
    or (readiness_fingerprint is not null
      and readiness_setup_revision is not null)
  )
);

create unique index production_future_tournament_single_active_v1
  on production_control.future_tournament_catalog_v1(lifecycle)
  where lifecycle = 'ACTIVE';

create table production_control.current_tournament_pointer_v1 (
  scope_key text primary key references production_control.resource_scope(
    scope_key
  ) on delete restrict,
  contract_version text not null check (
    contract_version = 'production-current-tournament-pointer-v1'
  ),
  tournament_id text not null references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  tournament_year integer not null,
  pointer_revision bigint not null check (pointer_revision > 0),
  lifecycle_revision bigint not null check (lifecycle_revision > 0),
  updated_by_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  updated_by_auth_user_id uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (tournament_id, tournament_year)
    references production_control.future_tournament_catalog_v1(
      tournament_id, tournament_year
    ) on delete restrict
);

create table production_control.future_tournament_resources_v1 (
  tournament_id text primary key references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  project_ref text not null,
  project_url text not null,
  source_workbook_id text,
  resource_status text not null check (resource_status in (
    'CURRENT_RESOURCE_BOUND', 'ANNUAL_RESOURCE_REQUIRED'
  )),
  resource_revision bigint not null check (resource_revision > 0),
  google_compatibility_policy text not null check (
    google_compatibility_policy in (
      'CURRENT_CERTIFIED', 'PROVISIONING_REQUIRED'
    )
  ),
  updated_by_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (resource_status = 'CURRENT_RESOURCE_BOUND'
      and source_workbook_id is not null)
    or resource_status = 'ANNUAL_RESOURCE_REQUIRED'
  )
);

create table production_control.future_tournament_teams_v1 (
  tournament_id text not null references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  team_id text not null check (
    team_id ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'
  ),
  team_side integer not null check (team_side in (1, 2)),
  team_name text not null check (
    pg_catalog.btrim(team_name) <> ''
    and pg_catalog.length(team_name) <= 160
  ),
  captain_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  active boolean not null default true,
  setup_revision bigint not null check (setup_revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, team_id),
  unique (tournament_id, team_side)
);

create table production_control.future_tournament_roster_v1 (
  tournament_id text not null references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  team_id text,
  team_side integer,
  participation_status text not null check (
    participation_status in ('ACTIVE', 'INACTIVE', 'WITHDRAWN')
  ),
  setup_revision bigint not null check (setup_revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, player_id),
  foreign key (tournament_id, team_id)
    references production_control.future_tournament_teams_v1(
      tournament_id, team_id
    ) on delete restrict,
  check (
    (team_id is null and team_side is null)
    or (team_id is not null and team_side is not null)
  )
);

create table production_control.future_tournament_rounds_v1 (
  tournament_id text not null references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  round_number integer not null check (round_number between 1 and 99),
  round_name text not null check (
    pg_catalog.btrim(round_name) <> ''
    and pg_catalog.length(round_name) <= 160
  ),
  format text not null check (format in ('BB', 'SC', 'SI')),
  team_size integer not null check (team_size in (1, 2)),
  points_available numeric not null check (points_available >= 0),
  handicap_allowance numeric not null check (
    handicap_allowance >= 0 and handicap_allowance <= 1
  ),
  setup_revision bigint not null check (setup_revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, round_number),
  check (
    (format in ('BB', 'SC') and team_size = 2)
    or (format = 'SI' and team_size = 1)
  )
);

create table production_control.future_tournament_course_references_v1 (
  tournament_id text not null references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  round_number integer not null,
  course_id text not null check (
    course_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$'
  ),
  tee_id text not null check (
    pg_catalog.btrim(tee_id) <> '' and pg_catalog.length(tee_id) <= 120
  ),
  source_tournament_id text not null,
  source_round_number integer check (
    source_round_number is null or source_round_number between 1 and 99
  ),
  source_setup_revision bigint,
  reference_status text not null default 'EXISTING_REFERENCE' check (
    reference_status = 'EXISTING_REFERENCE'
  ),
  setup_revision bigint not null check (setup_revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, round_number),
  foreign key (tournament_id, round_number)
    references production_control.future_tournament_rounds_v1(
      tournament_id, round_number
    ) on delete restrict,
  check (source_tournament_id = '2026')
);

create table production_control.future_match_definitions_v1 (
  match_definition_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  match_id text not null unique check (
    match_id ~ '^[0-9]{4}-R[0-9]{1,2}-[0-9]{1,2}$'
  ),
  round_number integer not null,
  match_number integer not null check (match_number between 1 and 99),
  format text not null check (format in ('BB', 'SC', 'SI')),
  team_size integer not null check (team_size in (1, 2)),
  lifecycle text not null default 'CONFIGURING' check (
    lifecycle = 'CONFIGURING'
  ),
  has_runtime_match boolean not null default false check (
    not has_runtime_match
  ),
  has_scoring_snapshot boolean not null default false check (
    not has_scoring_snapshot
  ),
  has_scoring_access boolean not null default false check (
    not has_scoring_access
  ),
  setup_revision bigint not null check (setup_revision > 0),
  created_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tournament_id, round_number, match_number),
  unique (tournament_id, match_id),
  foreign key (tournament_id, round_number)
    references production_control.future_tournament_rounds_v1(
      tournament_id, round_number
    ) on delete restrict
);

create table production_control.future_match_google_compatibility_jobs_v1 (
  job_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null,
  match_id text not null unique,
  requirement_class text not null check (requirement_class in (
    'REQUIRED_FOR_ROLLBACK_EVIDENCE', 'OPTIONAL_ARCHIVE'
  )),
  status text not null default 'PROVISIONING_REQUIRED' check (status in (
    'PROVISIONING_REQUIRED', 'CERTIFIED', 'NOT_REQUIRED', 'FAILED'
  )),
  writer_installed boolean not null default false check (
    not writer_installed
  ),
  safe_error_code text,
  certified_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (tournament_id, match_id)
    references production_control.future_match_definitions_v1(
      tournament_id, match_id
    ) on delete restrict,
  check (
    (status = 'CERTIFIED' and certified_at is not null)
    or (status <> 'CERTIFIED' and certified_at is null)
  )
);

create table production_control.future_year_operation_receipts_v1 (
  receipt_id uuid not null default extensions.gen_random_uuid() unique,
  provenance_tournament_id text not null check (
    provenance_tournament_id = '2026'
  ),
  target_tournament_id text not null,
  action text not null check (action in (
    'CREATE_TOURNAMENT', 'UPDATE_TOURNAMENT', 'CONFIGURE_TEAM',
    'REPLACE_ROSTER', 'CONFIGURE_ROUND', 'ASSIGN_COURSE',
    'GENERATE_MATCH_STRUCTURE', 'MARK_READY'
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
  primary key (target_tournament_id, action, operation_request_id)
);

create table production_control.future_year_audit_events_v1 (
  event_id uuid primary key default extensions.gen_random_uuid(),
  provenance_tournament_id text not null check (
    provenance_tournament_id = '2026'
  ),
  target_tournament_id text not null,
  action text not null,
  target_kind text not null check (target_kind in (
    'TOURNAMENT', 'TEAM', 'ROSTER', 'ROUND', 'COURSE_REFERENCE',
    'MATCH_STRUCTURE', 'READINESS'
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

create index production_future_year_audit_history_v1
  on production_control.future_year_audit_events_v1(
    target_tournament_id, occurred_at desc, event_id
  );

alter table production_control.future_tournament_catalog_v1
  enable row level security;
alter table production_control.current_tournament_pointer_v1
  enable row level security;
alter table production_control.future_tournament_resources_v1
  enable row level security;
alter table production_control.future_tournament_teams_v1
  enable row level security;
alter table production_control.future_tournament_roster_v1
  enable row level security;
alter table production_control.future_tournament_rounds_v1
  enable row level security;
alter table production_control.future_tournament_course_references_v1
  enable row level security;
alter table production_control.future_match_definitions_v1
  enable row level security;
alter table production_control.future_match_google_compatibility_jobs_v1
  enable row level security;
alter table production_control.future_year_operation_receipts_v1
  enable row level security;
alter table production_control.future_year_audit_events_v1
  enable row level security;

-- Represent the installed current state without changing its source facts.
insert into production_control.future_tournament_catalog_v1 (
  tournament_id, tournament_year, contract_version, tournament_name,
  lifecycle, lifecycle_revision, setup_revision, creation_mode,
  source_manifest
)
select tournament.tournament_id, tournament.tournament_year,
  'production-future-year-administration-v1', tournament.name,
  'ACTIVE', 1, 0, 'EXISTING',
  pg_catalog.jsonb_build_object(
    'representationOnly', true,
    'canonicalSource', 'scoring_authority.tournaments',
    'installedBy', 'migration-064'
  )
from scoring_authority.tournaments tournament
where tournament.tournament_id = '2026'
  and tournament.tournament_year = 2026
on conflict (tournament_id) do nothing;

create or replace function production_control.reject_future_year_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, production_control
as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_FUTURE_YEAR_IMMUTABLE_RECORD';
end;
$$;

create trigger production_future_year_receipt_immutable_v1
before update or delete
on production_control.future_year_operation_receipts_v1
for each row execute function
  production_control.reject_future_year_immutable_v1();

create trigger production_future_year_audit_immutable_v1
before update or delete
on production_control.future_year_audit_events_v1
for each row execute function
  production_control.reject_future_year_immutable_v1();

create or replace function production_control.future_year_hash_v1(value jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, extensions
as $$
  select pg_catalog.encode(extensions.digest(value::text, 'sha256'), 'hex')
$$;

create or replace function production_control.assert_future_year_runtime_v1(
  input jsonb,
  require_owner boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control
as $$
declare
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  scope production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
begin
  if current_setting('request.jwt.claim.role', true)
       is distinct from 'service_role'
     or input->>'contract_version'
       is distinct from 'production-future-year-administration-v1'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026'
     or coalesce(input#>>'{authorization,tournament_id}', '') <> '2026'
     or coalesce(input#>>'{authorization,role}', '') <> 'DIRECTOR'
     or actor_player !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
     or coalesce(input#>>'{authorization,auth_user_id}', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or (input ? 'actor_player_id' and pg_catalog.upper(pg_catalog.btrim(
       input->>'actor_player_id'
     )) is distinct from actor_player)
     or (input ? 'actor_auth_user_id' and pg_catalog.lower(pg_catalog.btrim(
       input->>'actor_auth_user_id'
     )) is distinct from pg_catalog.lower(pg_catalog.btrim(
       input#>>'{authorization,auth_user_id}'
     ))) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_YEAR_SCOPE_REQUIRED';
  end if;
  begin
    actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  exception when others then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_YEAR_SCOPE_REQUIRED';
  end;
  select value.* into strict scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if input->>'project_ref' is distinct from scope.project_ref
     or input->>'project_url' is distinct from scope.project_url
     or input->>'source_workbook_id'
       is distinct from scope.google_workbook_id
     or scope.current_tournament_id <> '2026'
     or scope.current_tournament_year <> 2026 then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_YEAR_EXACT_RESOURCE_REQUIRED';
  end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id <> '2026'
     or pointer.tournament_year <> 2026 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_YEAR_CURRENT_POINTER_CHANGED';
  end if;
  -- Reuse the certified linked-identity and active Director proof. Only the
  -- annual creation/readiness actions add the installed Owner requirement;
  -- ordinary configuration remains available to active Directors.
  perform production_control.assert_player_access_runtime_v1(
    input || pg_catalog.jsonb_build_object(
      'contract_version', 'production-players-access-v1'
    )
  );
  if require_owner then
    begin
      perform production_control.assert_access_governance_owner_v1(
        '2026', actor_player, actor_auth
      );
    exception when insufficient_privilege then
      raise exception using errcode = '42501',
        message = 'FUTURE_TOURNAMENT_OWNER_REQUIRED';
    end;
  end if;
end;
$$;

create or replace function production_control.future_year_readiness_v1(
  target_tournament text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  value production_control.future_tournament_catalog_v1%rowtype;
  blockers jsonb := '[]'::jsonb;
  team_count integer := 0;
  captain_count integer := 0;
  roster_count integer := 0;
  unassigned_count integer := 0;
  round_count integer := 0;
  course_count integer := 0;
  match_count integer := 0;
  compatibility_pending integer := 0;
  runtime_match_count integer := 0;
  runtime_snapshot_count integer := 0;
  match_format_mismatch_count integer := 0;
  structure_complete boolean;
  fingerprint_value text;
begin
  select candidate.* into value
  from production_control.future_tournament_catalog_v1 candidate
  where candidate.tournament_id = target_tournament;
  if value.tournament_id is null then
    return pg_catalog.jsonb_build_object(
      'readyForActivation', false,
      'setupStructureComplete', false,
      'fingerprint', null,
      'blockers', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'code', 'FUTURE_TOURNAMENT_NOT_FOUND',
        'section', 'Tournament',
        'message', 'The selected future tournament does not exist.'
      )),
      'counts', '{}'::jsonb
    );
  end if;

  select pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where exists (
      select 1
      from production_control.future_tournament_roster_v1 captain
      where captain.tournament_id = team.tournament_id
        and captain.player_id = team.captain_player_id
        and captain.team_id = team.team_id
        and captain.team_side = team.team_side
        and captain.participation_status = 'ACTIVE'
    ))::integer
  into team_count, captain_count
  from production_control.future_tournament_teams_v1 team
  where team.tournament_id = target_tournament and team.active;
  select pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where roster.team_id is null or roster.team_side is null
    )::integer
  into roster_count, unassigned_count
  from production_control.future_tournament_roster_v1 roster
  where roster.tournament_id = target_tournament
    and roster.participation_status = 'ACTIVE';
  select pg_catalog.count(*)::integer into round_count
  from production_control.future_tournament_rounds_v1 round_value
  where round_value.tournament_id = target_tournament;
  select pg_catalog.count(*)::integer into course_count
  from production_control.future_tournament_course_references_v1 course_value
  where course_value.tournament_id = target_tournament;
  select pg_catalog.count(*)::integer into match_count
  from production_control.future_match_definitions_v1 match_value
  where match_value.tournament_id = target_tournament;
  select pg_catalog.count(*)::integer into compatibility_pending
  from production_control.future_match_google_compatibility_jobs_v1 job
  where job.tournament_id = target_tournament
    and job.status not in ('CERTIFIED', 'NOT_REQUIRED');
  select pg_catalog.count(*)::integer into runtime_match_count
  from scoring_authority.matches match_value
  where match_value.tournament_id = target_tournament;
  select pg_catalog.count(*)::integer into runtime_snapshot_count
  from scoring_authority.scoring_snapshots snapshot
  where snapshot.tournament_id = target_tournament;
  select pg_catalog.count(*)::integer into match_format_mismatch_count
  from production_control.future_match_definitions_v1 match_value
  join production_control.future_tournament_rounds_v1 round_value
    on round_value.tournament_id = match_value.tournament_id
   and round_value.round_number = match_value.round_number
  where match_value.tournament_id = target_tournament
    and (match_value.format is distinct from round_value.format
      or match_value.team_size is distinct from round_value.team_size);

  if value.lifecycle = 'ACTIVE' then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'TOURNAMENT_ALREADY_ACTIVE', 'section', 'Lifecycle',
        'message', 'This tournament is already the current tournament.'
      )
    );
  end if;
  if value.destination is null or value.start_date is null
     or value.end_date is null or value.timezone is null then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'TOURNAMENT_METADATA_INCOMPLETE', 'section', 'Tournament',
        'message', 'Tournament dates, destination, and timezone are required.'
      )
    );
  end if;
  if not exists (
    select 1 from production_control.future_tournament_resources_v1 resource
    where resource.tournament_id = target_tournament
      and resource.resource_status = 'CURRENT_RESOURCE_BOUND'
  ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ANNUAL_RESOURCE_REQUIRED', 'section', 'System',
        'message', 'The future tournament needs a certified annual resource binding.'
      )
    );
  end if;
  if team_count <> 2 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'TEAMS_INCOMPLETE', 'section', 'Teams',
        'message', 'Exactly two active tournament teams are required.'
      )
    );
  elsif captain_count <> team_count then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'TEAM_CAPTAINS_INCOMPLETE', 'section', 'Teams',
        'message', 'Every active team needs an eligible captain.'
      )
    );
  end if;
  if roster_count = 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROSTER_EMPTY', 'section', 'Roster',
        'message', 'Select the future tournament roster.'
      )
    );
  elsif unassigned_count > 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROSTER_TEAM_ASSIGNMENTS_INCOMPLETE', 'section', 'Roster',
        'message', unassigned_count::text ||
          ' active roster members still need a team.'
      )
    );
  end if;
  if round_count = 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROUNDS_INCOMPLETE', 'section', 'Rounds',
        'message', 'Configure the tournament rounds and formats.'
      )
    );
  elsif course_count <> round_count then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROUND_COURSES_INCOMPLETE', 'section', 'Courses',
        'message', 'Every configured round needs an existing course reference.'
      )
    );
  end if;
  if round_count > 0 and match_count = 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'MATCH_STRUCTURE_INCOMPLETE', 'section', 'Matches',
        'message', 'Generate the empty structural match definitions.'
      )
    );
  end if;
  if match_format_mismatch_count > 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'MATCH_STRUCTURE_ROUND_FORMAT_MISMATCH',
        'section', 'Matches',
        'message', 'A generated match definition no longer matches its round format.'
      )
    );
  end if;
  if compatibility_pending > 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'GOOGLE_COMPATIBILITY_PROVISIONING_REQUIRED',
        'section', 'Matches',
        'message', compatibility_pending::text ||
          ' match archive compatibility records still need certification.'
      )
    );
  end if;
  if runtime_match_count > 0 or runtime_snapshot_count > 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'FUTURE_RUNTIME_FACTS_UNEXPECTED', 'section', 'Scoring',
        'message', 'A Draft tournament cannot contain live scoring facts.'
      )
    );
  end if;
  if value.lifecycle <> 'ACTIVE' then
    -- These are deliberately unresolved by this safe subset. They prevent a
    -- staging container from being mistaken for an activation-ready runtime.
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'FUTURE_HANDICAP_REVISION_REQUIRED', 'section', 'Handicaps',
        'message', 'An approved future-year handicap revision is required.'
      ),
      pg_catalog.jsonb_build_object(
        'code', 'FUTURE_PAIRINGS_AND_SCORING_PREPARATION_REQUIRED',
        'section', 'Scoring',
        'message', 'Pairings and current scoring snapshots must be prepared.'
      ),
      pg_catalog.jsonb_build_object(
        'code', 'FUTURE_TOURNAMENT_ACTIVATION_NOT_INSTALLED',
        'section', 'Activation',
        'message', 'Future tournament activation remains unavailable.'
      )
    );
  end if;

  structure_complete := value.lifecycle <> 'ACTIVE'
    and value.destination is not null and value.start_date is not null
    and value.end_date is not null and value.timezone is not null
    and team_count = 2 and captain_count = team_count
    and roster_count > 0 and unassigned_count = 0
    and round_count > 0 and course_count = round_count
    and match_count > 0 and match_format_mismatch_count = 0;
  fingerprint_value := production_control.future_year_hash_v1(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-future-year-readiness-v1',
      'tournamentId', target_tournament,
      'setupRevision', value.setup_revision,
      'lifecycleRevision', value.lifecycle_revision,
      'teamCount', team_count, 'captainCount', captain_count,
      'rosterCount', roster_count, 'unassignedCount', unassigned_count,
      'roundCount', round_count, 'courseCount', course_count,
      'matchCount', match_count,
      'compatibilityPending', compatibility_pending,
      'runtimeMatchCount', runtime_match_count,
      'runtimeSnapshotCount', runtime_snapshot_count,
      'matchFormatMismatchCount', match_format_mismatch_count,
      'blockers', blockers
    )
  );
  return pg_catalog.jsonb_build_object(
    'readyForActivation', pg_catalog.jsonb_array_length(blockers) = 0,
    'setupStructureComplete', structure_complete,
    'fingerprint', fingerprint_value,
    'blockers', blockers,
    'counts', pg_catalog.jsonb_build_object(
      'teams', team_count, 'captains', captain_count,
      'roster', roster_count, 'unassignedRoster', unassigned_count,
      'rounds', round_count, 'courseAssignments', course_count,
      'matchDefinitions', match_count,
      'compatibilityPending', compatibility_pending,
      'runtimeMatches', runtime_match_count,
      'runtimeSnapshots', runtime_snapshot_count,
      'matchFormatMismatches', match_format_mismatch_count
    )
  );
end;
$$;

create or replace function public.read_production_future_year_administration_v1(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  selected_id text := nullif(pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  )), '');
  selected_value production_control.future_tournament_catalog_v1%rowtype;
  pointer_value production_control.current_tournament_pointer_v1%rowtype;
  catalog_value jsonb;
  selected_json jsonb;
  teams_value jsonb;
  roster_value jsonb;
  rounds_value jsonb;
  courses_value jsonb;
  matches_value jsonb;
  jobs_value jsonb;
  players_value jsonb;
  library_value jsonb;
  audit_value jsonb;
  readiness_value jsonb;
  editable boolean;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  actor_is_owner boolean := false;
begin
  perform production_control.assert_future_year_runtime_v1(input, false);
  if input->>'operation'
       is distinct from 'READ_PRODUCTION_FUTURE_YEAR_ADMINISTRATION_V1'
     or (selected_id is not null and (
       selected_id !~ '^[0-9]{4}$' or selected_id = '2026'
     )) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_YEAR_READ_INPUT_INVALID';
  end if;
  select value.* into strict pointer_value
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  actor_is_owner := exists (
    select 1
    from production_control.tournament_owner_capabilities_v1 owner_value
    where owner_value.tournament_id = '2026'
      and owner_value.player_id = actor_player
      and owner_value.auth_user_id = actor_auth
      and owner_value.status = 'ACTIVE'
      and owner_value.revoked_at is null
  );
  select value.* into selected_value
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = selected_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'tournamentId', value.tournament_id,
    'tournamentYear', value.tournament_year,
    'name', value.tournament_name,
    'lifecycle', value.lifecycle,
    'setupRevision', value.setup_revision,
    'lifecycleRevision', value.lifecycle_revision,
    'creationMode', value.creation_mode,
    'cloneSourceTournamentId', value.clone_source_tournament_id,
    'isCurrent', value.tournament_id = pointer_value.tournament_id
  ) order by value.tournament_year), '[]'::jsonb)
  into catalog_value
  from production_control.future_tournament_catalog_v1 value;

  if selected_value.tournament_id is null then
    selected_json := null;
    teams_value := '[]'::jsonb;
    roster_value := '[]'::jsonb;
    rounds_value := '[]'::jsonb;
    courses_value := '[]'::jsonb;
    matches_value := '[]'::jsonb;
    jobs_value := '[]'::jsonb;
    readiness_value := production_control.future_year_readiness_v1(selected_id);
    editable := false;
  else
    editable := selected_value.lifecycle in ('DRAFT', 'CONFIGURING');
    selected_json := pg_catalog.jsonb_build_object(
      'tournamentId', selected_value.tournament_id,
      'tournamentYear', selected_value.tournament_year,
      'name', selected_value.tournament_name,
      'destination', selected_value.destination,
      'startDate', selected_value.start_date,
      'endDate', selected_value.end_date,
      'timezone', selected_value.timezone,
      'lifecycle', selected_value.lifecycle,
      'lifecycleRevision', selected_value.lifecycle_revision,
      'setupRevision', selected_value.setup_revision,
      'creationMode', selected_value.creation_mode,
      'cloneSourceTournamentId', selected_value.clone_source_tournament_id,
      'readinessFingerprint', selected_value.readiness_fingerprint,
      'readinessSetupRevision', selected_value.readiness_setup_revision,
      'isCurrent', selected_value.tournament_id = pointer_value.tournament_id
    );
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'teamId', team.team_id, 'teamSide', team.team_side,
      'name', team.team_name,
      'captainPlayerId', team.captain_player_id,
      'captainName', captain.display_name,
      'active', team.active, 'setupRevision', team.setup_revision
    ) order by team.team_side), '[]'::jsonb) into teams_value
    from production_control.future_tournament_teams_v1 team
    left join scoring_authority.players captain
      on captain.player_id = team.captain_player_id
    where team.tournament_id = selected_id;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'playerId', roster.player_id, 'displayName', player.display_name,
      'teamId', roster.team_id, 'teamSide', roster.team_side,
      'participationStatus', roster.participation_status,
      'setupRevision', roster.setup_revision
    ) order by player.display_name, roster.player_id), '[]'::jsonb)
    into roster_value
    from production_control.future_tournament_roster_v1 roster
    join scoring_authority.players player on player.player_id = roster.player_id
    where roster.tournament_id = selected_id;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'roundNumber', round_value.round_number,
      'name', round_value.round_name, 'format', round_value.format,
      'teamSize', round_value.team_size,
      'pointsAvailable', round_value.points_available::text,
      'handicapAllowance', round_value.handicap_allowance::text,
      'setupRevision', round_value.setup_revision
    ) order by round_value.round_number), '[]'::jsonb) into rounds_value
    from production_control.future_tournament_rounds_v1 round_value
    where round_value.tournament_id = selected_id;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'roundNumber', course.round_number, 'courseId', course.course_id,
      'tee', course.tee_id,
      'sourceTournamentId', course.source_tournament_id,
      'sourceRoundNumber', course.source_round_number,
      'sourceSetupRevision', course.source_setup_revision,
      'referenceStatus', course.reference_status,
      'setupRevision', course.setup_revision
    ) order by course.round_number), '[]'::jsonb) into courses_value
    from production_control.future_tournament_course_references_v1 course
    where course.tournament_id = selected_id;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'matchDefinitionId', match_value.match_definition_id,
      'matchId', match_value.match_id,
      'roundNumber', match_value.round_number,
      'matchNumber', match_value.match_number,
      'format', match_value.format, 'teamSize', match_value.team_size,
      'lifecycle', match_value.lifecycle,
      'hasRuntimeMatch', false, 'hasScoringSnapshot', false,
      'hasScoringAccess', false, 'setupRevision', match_value.setup_revision
    ) order by match_value.round_number, match_value.match_number), '[]'::jsonb)
    into matches_value
    from production_control.future_match_definitions_v1 match_value
    where match_value.tournament_id = selected_id;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'jobId', job.job_id, 'matchId', job.match_id,
      'requirementClass', job.requirement_class, 'status', job.status,
      'writerInstalled', false, 'safeErrorCode', job.safe_error_code
    ) order by job.match_id), '[]'::jsonb) into jobs_value
    from production_control.future_match_google_compatibility_jobs_v1 job
    where job.tournament_id = selected_id;
    readiness_value := production_control.future_year_readiness_v1(selected_id);
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'playerId', player.player_id, 'displayName', player.display_name,
    'globalStatus', production_control.access_governance_global_status_v1(
      player.player_id
    )
  ) order by player.display_name, player.player_id), '[]'::jsonb)
  into players_value from scoring_authority.players player;

  -- Only current certified course/tee contexts with all 18 holes are
  -- assignable. Historical identities alone do not prove scoring context.
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'courseId', candidate.course_id, 'name', candidate.course_name,
    'location', candidate.location, 'tees', candidate.tees,
    'assignable', true
  ) order by candidate.course_name, candidate.course_id), '[]'::jsonb)
  into library_value
  from (
    select tee.course_id, pg_catalog.min(tee.display_name) as course_name,
      pg_catalog.min(tee.location) as location,
      pg_catalog.jsonb_agg(tee.tee_id order by tee.tee_id) as tees
    from scoring_authority.tournament_setup_course_tees_v1 tee
    where tee.tournament_id = '2026'
      and (
        select pg_catalog.count(*)
        from scoring_authority.tournament_setup_course_holes_v1 hole
        where hole.tournament_id = tee.tournament_id
          and hole.course_id = tee.course_id and hole.tee_id = tee.tee_id
      ) = 18
    group by tee.course_id
  ) candidate;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', audit.event_id, 'action', audit.action,
    'targetKind', audit.target_kind, 'targetId', audit.target_id,
    'actorPlayerId', audit.actor_player_id, 'result', audit.result,
    'timestamp', audit.occurred_at,
    'summary', audit.safe_metadata->>'summary'
  ) order by audit.occurred_at desc), '[]'::jsonb) into audit_value
  from (
    select value.*
    from production_control.future_year_audit_events_v1 value
    where value.target_tournament_id = selected_id
    order by value.occurred_at desc
    limit 50
  ) audit;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contractVersion', 'production-future-year-administration-v1',
      'currentTournament', pg_catalog.jsonb_build_object(
        'tournamentId', pointer_value.tournament_id,
        'tournamentYear', pointer_value.tournament_year,
        'pointerRevision', pointer_value.pointer_revision,
        'lifecycleRevision', pointer_value.lifecycle_revision,
        'lifecycle', 'ACTIVE'
      ),
      'selectedTournament', selected_json,
      'catalog', catalog_value, 'teams', teams_value,
      'roster', roster_value, 'rounds', rounds_value,
      'courseAssignments', courses_value,
      'matchDefinitions', matches_value,
      'compatibilityJobs', jobs_value,
      'playerCatalog', players_value, 'courseLibrary', library_value,
      'audit', audit_value, 'readiness', readiness_value,
      'activationPlan', pg_catalog.jsonb_build_object(
        'status', 'BLOCKED', 'executable', false,
        'code', 'FUTURE_TOURNAMENT_ACTIVATION_NOT_INSTALLED',
        'blockers', readiness_value->'blockers'
      ),
      'capabilities', pg_catalog.jsonb_build_object(
        'createTournament', actor_is_owner,
        'cloneStructure', actor_is_owner,
        'editTournament', editable, 'configureTeams', editable,
        'replaceRoster', editable, 'configureRounds', editable,
        'assignExistingCourse', editable,
        'generateMatchStructure', editable, 'markReady', false,
        'activateTournament', false, 'closeTournament', false,
        'archiveTournament', false, 'createGlobalCourse', false,
        'runtimeMatchCreation', false,
        'googleCompatibilityWriter', false
      )
    )
  );
end;
$$;

create or replace function public.mutate_production_future_year_administration_v1(
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
  target_id text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  operation_request uuid;
  receipt_uuid uuid := extensions.gen_random_uuid();
  expected_revision bigint;
  current_revision bigint;
  next_revision bigint;
  declared_hash text := pg_catalog.lower(coalesce(
    input->>'request_payload_hash', ''
  ));
  database_hash text;
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason', ''));
  receipt production_control.future_year_operation_receipts_v1%rowtype;
  tournament_value production_control.future_tournament_catalog_v1%rowtype;
  response_value jsonb;
  readiness_value jsonb;
  safe_metadata jsonb := '{}'::jsonb;
  target_kind text := 'TOURNAMENT';
  audit_target text;
  creation_mode text;
  clone_source text;
  tournament_year integer;
  name_value text;
  destination_value text;
  start_value date;
  end_value date;
  timezone_value text;
  item jsonb;
  item_player text;
  item_team text;
  item_side integer;
  target_team text;
  target_side integer;
  target_round integer;
  target_format text;
  team_size_value integer;
  points_value numeric;
  allowance_value numeric;
  target_course text;
  target_tee text;
  source_setup bigint;
  match_count_value integer;
  generated_count integer := 0;
  summary_value text;
begin
  perform production_control.assert_future_year_runtime_v1(
    input, action_value in ('CREATE_TOURNAMENT', 'MARK_READY')
  );
  if action_value in ('ACTIVATE_TOURNAMENT', 'ACTIVATE') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'FUTURE_TOURNAMENT_ACTIVATION_NOT_INSTALLED'
    );
  elsif action_value in ('CLOSE_TOURNAMENT', 'CLOSE') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'FUTURE_TOURNAMENT_CLOSE_NOT_INSTALLED'
    );
  elsif action_value in ('ARCHIVE_TOURNAMENT', 'ARCHIVE') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'FUTURE_TOURNAMENT_ARCHIVE_NOT_INSTALLED'
    );
  elsif action_value in ('CREATE_COURSE', 'ADD_COURSE') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'GLOBAL_COURSE_CREATION_NOT_INSTALLED'
    );
  end if;
  if action_value not in (
       'CREATE_TOURNAMENT', 'UPDATE_TOURNAMENT', 'CONFIGURE_TEAM',
       'REPLACE_ROSTER', 'CONFIGURE_ROUND', 'ASSIGN_COURSE',
       'GENERATE_MATCH_STRUCTURE', 'MARK_READY'
     )
     or target_id !~ '^[0-9]{4}$'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_revision', '') !~ '^[0-9]+$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_FUTURE_YEAR_INPUT_INVALID'
    );
  end if;
  begin
    actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
    operation_request := (input->>'operation_request_id')::uuid;
    expected_revision := (input->>'expected_revision')::bigint;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_FUTURE_YEAR_INPUT_INVALID'
    );
  end;
  perform production_control.assert_access_governance_safe_reason_v1(
    reason_value
  );
  database_hash := production_control.future_year_hash_v1(
    input - 'request_payload_hash'
  );
  select value.* into receipt
  from production_control.future_year_operation_receipts_v1 value
  where value.target_tournament_id = target_id
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
      'ok', false, 'code', 'PRODUCTION_FUTURE_YEAR_IDEMPOTENCY_CONFLICT'
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-future-year-administration-v1:' || target_id, 0
  ));
  select value.* into receipt
  from production_control.future_year_operation_receipts_v1 value
  where value.target_tournament_id = target_id
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
      'ok', false, 'code', 'PRODUCTION_FUTURE_YEAR_IDEMPOTENCY_CONFLICT'
    );
  end if;

  if action_value = 'CREATE_TOURNAMENT' then
    if expected_revision <> 0 or target_id = '2026'
       or exists (
         select 1
         from production_control.future_tournament_catalog_v1 value
         where value.tournament_id = target_id
       ) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FUTURE_TOURNAMENT_CREATE_PREDECESSOR_INVALID'
      );
    end if;
    begin
      tournament_year := (input->>'tournament_year')::integer;
      start_value := nullif(input->>'start_date', '')::date;
      end_value := nullif(input->>'end_date', '')::date;
    exception when others then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FUTURE_TOURNAMENT_METADATA_INVALID'
      );
    end;
    name_value := pg_catalog.btrim(coalesce(
      input->>'tournament_name', ''
    ));
    destination_value := nullif(pg_catalog.btrim(coalesce(
      input->>'destination', ''
    )), '');
    timezone_value := nullif(pg_catalog.btrim(coalesce(
      input->>'time_zone', input->>'timezone', ''
    )), '');
    creation_mode := pg_catalog.upper(pg_catalog.btrim(coalesce(
      input->>'creation_mode', 'BLANK'
    )));
    clone_source := nullif(pg_catalog.btrim(coalesce(
      input->>'clone_source_tournament_id', ''
    )), '');
    if tournament_year <= 2026 or target_id <> tournament_year::text
       or name_value = '' or pg_catalog.length(name_value) > 180
       or destination_value is null or start_value is null or end_value is null
       or start_value > end_value or timezone_value is null
       or not exists (
         select 1 from pg_catalog.pg_timezone_names zone
         where zone.name = timezone_value
       )
       or creation_mode not in ('BLANK', 'CLONE_STRUCTURE')
       or (creation_mode = 'CLONE_STRUCTURE' and clone_source <> '2026')
       or (creation_mode = 'BLANK' and clone_source is not null) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FUTURE_TOURNAMENT_METADATA_INVALID'
      );
    end if;
    insert into production_control.future_tournament_catalog_v1 (
      tournament_id, tournament_year, contract_version, tournament_name,
      destination, start_date, end_date, timezone, lifecycle,
      lifecycle_revision, setup_revision, creation_mode,
      clone_source_tournament_id, created_by_player_id,
      created_by_auth_user_id, updated_by_player_id,
      updated_by_auth_user_id, source_manifest
    ) values (
      target_id, tournament_year,
      'production-future-year-administration-v1', name_value,
      destination_value, start_value, end_value, timezone_value, 'DRAFT',
      1, 1, creation_mode, clone_source, actor_player, actor_auth,
      actor_player, actor_auth, pg_catalog.jsonb_build_object(
        'cloneContractVersion', case when creation_mode = 'CLONE_STRUCTURE'
          then 'production-future-structure-clone-v1' else null end,
        'allowlistedDomains', case when creation_mode = 'CLONE_STRUCTURE'
          then pg_catalog.jsonb_build_array('TEAMS', 'ROUNDS',
            'COURSE_REFERENCES') else '[]'::jsonb end,
        'forbiddenFactsCopied', false
      )
    );
    insert into production_control.future_tournament_resources_v1 (
      tournament_id, project_ref, project_url, source_workbook_id,
      resource_status, resource_revision, google_compatibility_policy,
      updated_by_player_id
    )
    select target_id, scope.project_ref, scope.project_url, null,
      'ANNUAL_RESOURCE_REQUIRED', 1, 'PROVISIONING_REQUIRED', actor_player
    from production_control.resource_scope scope
    where scope.scope_key = 'BAGGER_INV_PRODUCTION';
    if creation_mode = 'CLONE_STRUCTURE' then
      insert into production_control.future_tournament_teams_v1 (
        tournament_id, team_id, team_side, team_name, captain_player_id,
        active, setup_revision, updated_by_player_id
      )
      select target_id, team.team_id, team.team_side, team.name, null,
        true, 1, actor_player
      from scoring_authority.teams team
      where team.tournament_id = '2026';
      insert into production_control.future_tournament_rounds_v1 (
        tournament_id, round_number, round_name, format, team_size,
        points_available, handicap_allowance, setup_revision,
        updated_by_player_id
      )
      select target_id, round_value.round_number, round_value.name,
        round_value.format,
        case when round_value.format = 'SI' then 1 else 2 end,
        coalesce(detail.points_available, 0),
        coalesce(round_value.handicap_allowance, 1), 1, actor_player
      from scoring_authority.rounds round_value
      left join scoring_authority.tournament_setup_round_details_v1 detail
        on detail.tournament_id = round_value.tournament_id
       and detail.round_number = round_value.round_number
      where round_value.tournament_id = '2026';
      insert into production_control.future_tournament_course_references_v1 (
        tournament_id, round_number, course_id, tee_id,
        source_tournament_id, source_round_number, source_setup_revision,
        setup_revision, updated_by_player_id
      )
      select target_id, assignment.round_number, assignment.course_id,
        assignment.tee_id, '2026', assignment.round_number,
        assignment.setup_revision, 1, actor_player
      from scoring_authority.tournament_setup_round_courses_v1 assignment
      where assignment.tournament_id = '2026'
        and exists (
          select 1
          from production_control.future_tournament_rounds_v1 target_round_value
          where target_round_value.tournament_id = target_id
            and target_round_value.round_number = assignment.round_number
        );
    end if;
    current_revision := 0;
    next_revision := 1;
    target_kind := 'TOURNAMENT';
    audit_target := target_id;
    summary_value := case when creation_mode = 'CLONE_STRUCTURE'
      then 'Future tournament Draft created from an allowlisted structure clone.'
      else 'Blank future tournament Draft created.' end;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', summary_value, 'creationMode', creation_mode,
      'forbiddenFactsCopied', false, 'scoringFactsCreated', false,
      'membershipCopied', false, 'identityCopied', false
    );
  else
    select value.* into tournament_value
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id
    for update;
    if tournament_value.tournament_id is null then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FUTURE_TOURNAMENT_NOT_FOUND'
      );
    end if;
    if tournament_value.lifecycle not in ('DRAFT', 'CONFIGURING')
       or target_id = '2026' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FUTURE_TOURNAMENT_STRUCTURE_LOCKED'
      );
    end if;
    current_revision := tournament_value.setup_revision;
    if expected_revision <> current_revision then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FUTURE_TOURNAMENT_REVISION_STALE',
        'expectedRevision', current_revision
      );
    end if;
    next_revision := current_revision + 1;

    if action_value = 'UPDATE_TOURNAMENT' then
      begin
        start_value := nullif(input->>'start_date', '')::date;
        end_value := nullif(input->>'end_date', '')::date;
      exception when others then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TOURNAMENT_METADATA_INVALID'
        );
      end;
      name_value := pg_catalog.btrim(coalesce(
        input->>'tournament_name', ''
      ));
      destination_value := nullif(pg_catalog.btrim(coalesce(
        input->>'destination', ''
      )), '');
      timezone_value := nullif(pg_catalog.btrim(coalesce(
        input->>'time_zone', input->>'timezone', ''
      )), '');
      if name_value = '' or destination_value is null
         or start_value is null or end_value is null or start_value > end_value
         or timezone_value is null or not exists (
           select 1 from pg_catalog.pg_timezone_names zone
           where zone.name = timezone_value
         ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TOURNAMENT_METADATA_INVALID'
        );
      end if;
      update production_control.future_tournament_catalog_v1 value set
        tournament_name = name_value,
        destination = destination_value,
        start_date = start_value, end_date = end_value,
        timezone = timezone_value
      where value.tournament_id = target_id;
      target_kind := 'TOURNAMENT';
      audit_target := target_id;
      summary_value := 'Future tournament operational details updated.';
    elsif action_value = 'CONFIGURE_TEAM' then
      target_team := pg_catalog.upper(pg_catalog.btrim(coalesce(
        input->>'team_id', ''
      )));
      name_value := pg_catalog.btrim(coalesce(input->>'team_name', ''));
      begin
        target_side := (input->>'team_side')::integer;
      exception when others then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TEAM_INPUT_INVALID'
        );
      end;
      item_player := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(
        input->>'captain_player_id', ''
      ))), '');
      if target_team !~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'
         or target_side not in (1, 2) or name_value = '' then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TEAM_CAPTAIN_OR_INPUT_INVALID'
        );
      end if;
      if exists (
        select 1 from production_control.future_tournament_teams_v1 team
        where team.tournament_id = target_id and team.team_id = target_team
          and team.team_side <> target_side
      ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TEAM_SIDE_IMMUTABLE'
        );
      end if;
      if exists (
        select 1 from production_control.future_tournament_teams_v1 team
        where team.tournament_id = target_id
          and team.team_side = target_side and team.team_id <> target_team
      ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TEAM_SIDE_ALREADY_ASSIGNED'
        );
      end if;
      if item_player is not null and not exists (
        select 1 from production_control.future_tournament_roster_v1 roster
        where roster.tournament_id = target_id
          and roster.player_id = item_player
          and roster.team_id = target_team
          and roster.team_side = target_side
          and roster.participation_status = 'ACTIVE'
      ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TEAM_CAPTAIN_OR_INPUT_INVALID'
        );
      end if;
      insert into production_control.future_tournament_teams_v1 (
        tournament_id, team_id, team_side, team_name, captain_player_id,
        active, setup_revision, updated_by_player_id
      ) values (
        target_id, target_team, target_side, name_value, item_player,
        coalesce((input->>'active')::boolean, true),
        next_revision, actor_player
      ) on conflict (tournament_id, team_id) do update set
        team_side = excluded.team_side, team_name = excluded.team_name,
        captain_player_id = excluded.captain_player_id,
        active = excluded.active, setup_revision = excluded.setup_revision,
        updated_by_player_id = excluded.updated_by_player_id,
        updated_at = pg_catalog.clock_timestamp();
      target_kind := 'TEAM';
      audit_target := target_team;
      summary_value := 'Future tournament team configuration updated.';
    elsif action_value = 'REPLACE_ROSTER' then
      if pg_catalog.jsonb_typeof(input->'roster') is distinct from 'array'
         or pg_catalog.jsonb_array_length(input->'roster') > 200
         or exists (
           select 1 from (
             select pg_catalog.upper(pg_catalog.btrim(value->>'player_id')) id,
               pg_catalog.count(*)
             from pg_catalog.jsonb_array_elements(input->'roster') value
             group by 1 having pg_catalog.count(*) > 1
           ) duplicate
         ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_ROSTER_INPUT_INVALID'
        );
      end if;
      for item in select value
        from pg_catalog.jsonb_array_elements(input->'roster') value
      loop
        item_player := pg_catalog.upper(pg_catalog.btrim(coalesce(
          item->>'player_id', ''
        )));
        item_team := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(
          item->>'team_id', ''
        ))), '');
        if item_player !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
           or not exists (
             select 1 from scoring_authority.players player
             where player.player_id = item_player
               and production_control.access_governance_global_status_v1(
                 player.player_id
               ) = 'ACTIVE'
           )
           or pg_catalog.upper(pg_catalog.btrim(coalesce(
             item->>'participation_status', 'ACTIVE'
           ))) not in ('ACTIVE', 'INACTIVE', 'WITHDRAWN') then
          return pg_catalog.jsonb_build_object(
            'ok', false, 'code', 'FUTURE_ROSTER_PLAYER_INVALID'
          );
        end if;
        if item_team is not null then
          select team.team_side into item_side
          from production_control.future_tournament_teams_v1 team
          where team.tournament_id = target_id
            and team.team_id = item_team and team.active;
          if item_side is null
             or (item ? 'team_side'
               and (item->>'team_side')::integer <> item_side) then
            return pg_catalog.jsonb_build_object(
              'ok', false, 'code', 'FUTURE_ROSTER_TEAM_INVALID'
            );
          end if;
        else
          item_side := null;
        end if;
      end loop;
      delete from production_control.future_tournament_roster_v1 roster
      where roster.tournament_id = target_id;
      for item in select value
        from pg_catalog.jsonb_array_elements(input->'roster') value
      loop
        item_player := pg_catalog.upper(pg_catalog.btrim(item->>'player_id'));
        item_team := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(
          item->>'team_id', ''
        ))), '');
        select team.team_side into item_side
        from production_control.future_tournament_teams_v1 team
        where team.tournament_id = target_id and team.team_id = item_team;
        insert into production_control.future_tournament_roster_v1 (
          tournament_id, player_id, team_id, team_side,
          participation_status, setup_revision, updated_by_player_id
        ) values (
          target_id, item_player, item_team, item_side,
          pg_catalog.upper(pg_catalog.btrim(coalesce(
            item->>'participation_status', 'ACTIVE'
          ))), next_revision, actor_player
        );
      end loop;
      target_kind := 'ROSTER';
      audit_target := target_id;
      summary_value := 'Future tournament roster selection replaced atomically.';
      safe_metadata := pg_catalog.jsonb_build_object(
        'rosterCount', pg_catalog.jsonb_array_length(input->'roster'),
        'identityCopied', false, 'authUsersCreated', false
      );
    elsif action_value = 'CONFIGURE_ROUND' then
      begin
        target_round := (input->>'round_number')::integer;
        team_size_value := (input->>'team_size')::integer;
        points_value := (input->>'points_available')::numeric;
        allowance_value := (input->>'handicap_allowance')::numeric;
      exception when others then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_ROUND_INPUT_INVALID'
        );
      end;
      target_format := pg_catalog.upper(pg_catalog.btrim(coalesce(
        input->>'format', ''
      )));
      name_value := pg_catalog.btrim(coalesce(input->>'round_name', ''));
      if target_round not between 1 and 99
         or target_format not in ('BB', 'SC', 'SI')
         or name_value = '' or points_value < 0
         or allowance_value < 0 or allowance_value > 1
         or (target_format in ('BB', 'SC') and team_size_value <> 2)
         or (target_format = 'SI' and team_size_value <> 1) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_ROUND_INPUT_INVALID'
        );
      end if;
      if exists (
        select 1
        from production_control.future_match_definitions_v1 match_value
        join production_control.future_tournament_rounds_v1 round_value
          on round_value.tournament_id = match_value.tournament_id
         and round_value.round_number = match_value.round_number
        where match_value.tournament_id = target_id
          and match_value.round_number = target_round
          and (round_value.format is distinct from target_format
            or round_value.team_size is distinct from team_size_value)
      ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_ROUND_MATCH_STRUCTURE_LOCKED'
        );
      end if;
      insert into production_control.future_tournament_rounds_v1 (
        tournament_id, round_number, round_name, format, team_size,
        points_available, handicap_allowance, setup_revision,
        updated_by_player_id
      ) values (
        target_id, target_round, name_value, target_format,
        team_size_value, points_value, allowance_value,
        next_revision, actor_player
      ) on conflict (tournament_id, round_number) do update set
        round_name = excluded.round_name, format = excluded.format,
        team_size = excluded.team_size,
        points_available = excluded.points_available,
        handicap_allowance = excluded.handicap_allowance,
        setup_revision = excluded.setup_revision,
        updated_by_player_id = excluded.updated_by_player_id,
        updated_at = pg_catalog.clock_timestamp();
      target_kind := 'ROUND';
      audit_target := target_id || ':R' || target_round::text;
      summary_value := 'Future tournament round configuration updated.';
    elsif action_value = 'ASSIGN_COURSE' then
      begin
        target_round := (input->>'round_number')::integer;
      exception when others then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_COURSE_REFERENCE_INVALID'
        );
      end;
      target_course := pg_catalog.btrim(coalesce(input->>'course_id', ''));
      target_tee := pg_catalog.btrim(coalesce(input->>'tee', ''));
      begin
        item_side := nullif(input->>'source_round_number', '')::integer;
      exception when others then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_COURSE_REFERENCE_INVALID'
        );
      end;
      if coalesce(input->>'source_tournament_id', '2026') <> '2026'
         or target_course !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$'
         or target_tee = '' or not exists (
           select 1
           from production_control.future_tournament_rounds_v1 round_value
           where round_value.tournament_id = target_id
             and round_value.round_number = target_round
         ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_COURSE_REFERENCE_INVALID'
        );
      end if;
      select tee.setup_revision into source_setup
      from scoring_authority.tournament_setup_course_tees_v1 tee
      where tee.tournament_id = '2026' and tee.course_id = target_course
        and tee.tee_id = target_tee
        and (item_side is null or exists (
          select 1
          from scoring_authority.tournament_setup_round_courses_v1 assignment
          where assignment.tournament_id = '2026'
            and assignment.round_number = item_side
            and assignment.course_id = tee.course_id
            and assignment.tee_id = tee.tee_id
        ));
      if source_setup is null or (
        select pg_catalog.count(*)
        from scoring_authority.tournament_setup_course_holes_v1 hole
        where hole.tournament_id = '2026'
          and hole.course_id = target_course and hole.tee_id = target_tee
      ) <> 18 then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_EXISTING_COURSE_TEE_REQUIRED'
        );
      end if;
      insert into production_control.future_tournament_course_references_v1 (
        tournament_id, round_number, course_id, tee_id,
        source_tournament_id, source_round_number, source_setup_revision,
        setup_revision, updated_by_player_id
      ) values (
        target_id, target_round, target_course, target_tee,
        '2026', item_side, source_setup, next_revision, actor_player
      ) on conflict (tournament_id, round_number) do update set
        course_id = excluded.course_id, tee_id = excluded.tee_id,
        source_tournament_id = excluded.source_tournament_id,
        source_round_number = excluded.source_round_number,
        source_setup_revision = excluded.source_setup_revision,
        setup_revision = excluded.setup_revision,
        updated_by_player_id = excluded.updated_by_player_id,
        updated_at = pg_catalog.clock_timestamp();
      target_kind := 'COURSE_REFERENCE';
      audit_target := target_id || ':R' || target_round::text;
      summary_value := 'Existing certified course and tee referenced for a future round.';
    elsif action_value = 'GENERATE_MATCH_STRUCTURE' then
      begin
        target_round := (input->>'round_number')::integer;
        match_count_value := (input->>'match_count')::integer;
      exception when others then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_MATCH_STRUCTURE_INPUT_INVALID'
        );
      end;
      select round_value.format into target_format
      from production_control.future_tournament_rounds_v1 round_value
      where round_value.tournament_id = target_id
        and round_value.round_number = target_round;
      if target_format is null or match_count_value not between 1 and 99 then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_MATCH_STRUCTURE_INPUT_INVALID'
        );
      end if;
      if exists (
        select 1 from production_control.future_match_definitions_v1 match_value
        where match_value.tournament_id = target_id
          and match_value.round_number = target_round
      ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_MATCH_STRUCTURE_ALREADY_GENERATED'
        );
      end if;
      insert into production_control.future_match_definitions_v1 (
        tournament_id, match_id, round_number, match_number, format, team_size,
        setup_revision, created_by_player_id
      )
      select target_id,
        target_id || '-R' || target_round::text || '-' || sequence::text,
        target_round, sequence, target_format,
        (select round_value.team_size
         from production_control.future_tournament_rounds_v1 round_value
         where round_value.tournament_id = target_id
           and round_value.round_number = target_round),
        next_revision, actor_player
      from pg_catalog.generate_series(1, match_count_value) sequence;
      get diagnostics generated_count = row_count;
      insert into production_control.future_match_google_compatibility_jobs_v1 (
        tournament_id, match_id, requirement_class
      )
      select match_value.tournament_id, match_value.match_id,
        'REQUIRED_FOR_ROLLBACK_EVIDENCE'
      from production_control.future_match_definitions_v1 match_value
      where match_value.tournament_id = target_id
        and match_value.round_number = target_round;
      target_kind := 'MATCH_STRUCTURE';
      audit_target := target_id || ':R' || target_round::text;
      summary_value := 'Empty future match structure generated without scoring facts.';
      safe_metadata := pg_catalog.jsonb_build_object(
        'matchDefinitionCount', generated_count,
        'runtimeMatchesCreated', false, 'snapshotsCreated', false,
        'scoringAccessCreated', false,
        'googleWriterInvoked', false
      );
    elsif action_value = 'MARK_READY' then
      readiness_value := production_control.future_year_readiness_v1(target_id);
      if not coalesce((readiness_value->>'readyForActivation')::boolean, false)
      then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TOURNAMENT_NOT_READY',
          'readiness', readiness_value
        );
      end if;
      update production_control.future_tournament_catalog_v1 value set
        lifecycle = 'READY_FOR_ACTIVATION',
        lifecycle_revision = value.lifecycle_revision + 1,
        readiness_fingerprint = readiness_value->>'fingerprint',
        readiness_setup_revision = value.setup_revision
      where value.tournament_id = target_id;
      target_kind := 'READINESS';
      audit_target := target_id;
      summary_value := 'Future tournament marked Ready for Activation.';
    end if;

    update production_control.future_tournament_catalog_v1 value set
      lifecycle = case
        when action_value = 'MARK_READY' then value.lifecycle
        when value.lifecycle = 'DRAFT' then 'CONFIGURING'
        else value.lifecycle end,
      setup_revision = next_revision,
      readiness_fingerprint = case when action_value = 'MARK_READY'
        then value.readiness_fingerprint else null end,
      readiness_setup_revision = case when action_value = 'MARK_READY'
        then value.readiness_setup_revision else null end,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where value.tournament_id = target_id;
  end if;

  readiness_value := production_control.future_year_readiness_v1(target_id);
  safe_metadata := safe_metadata || pg_catalog.jsonb_build_object(
    'summary', summary_value,
    'authorityChanged', false, 'currentPointerChanged', false,
    'tournamentFactsChanged', false
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_FUTURE_YEAR_' || action_value || '_COMPLETED',
    'operation', action_value, 'idempotent', false,
    'target_tournament_id', target_id,
    'revision', next_revision,
    'receipt_id', receipt_uuid,
    'lifecycle', (
      select value.lifecycle
      from production_control.future_tournament_catalog_v1 value
      where value.tournament_id = target_id
    ),
    'readiness', readiness_value
  );
  insert into production_control.future_year_audit_events_v1 (
    provenance_tournament_id, target_tournament_id, action,
    target_kind, target_id, actor_player_id, actor_auth_user_id,
    operation_request_id, prior_revision, next_revision,
    result, safe_metadata
  ) values (
    '2026', target_id, action_value, target_kind,
    coalesce(audit_target, target_id), actor_player, actor_auth,
    operation_request, current_revision, next_revision,
    'CHANGED', safe_metadata
  );
  insert into production_control.future_year_operation_receipts_v1 (
    receipt_id, provenance_tournament_id, target_tournament_id, action,
    operation_request_id, declared_request_payload_hash,
    database_request_payload_hash, actor_player_id, actor_auth_user_id,
    prior_revision, next_revision, response
  ) values (
    receipt_uuid, '2026', target_id, action_value, operation_request,
    declared_hash, database_hash, actor_player, actor_auth,
    current_revision, next_revision, response_value
  );
  return response_value;
end;
$$;




insert into production_control.current_tournament_pointer_v1 (
  scope_key, contract_version, tournament_id, tournament_year,
  pointer_revision, lifecycle_revision
)
select scope.scope_key, 'production-current-tournament-pointer-v1',
  '2026', 2026, 1, 1
from production_control.resource_scope scope
where scope.scope_key = 'BAGGER_INV_PRODUCTION'
  and scope.current_tournament_id = '2026'
  and scope.current_tournament_year = 2026
on conflict (scope_key) do nothing;

insert into production_control.future_tournament_resources_v1 (
  tournament_id, project_ref, project_url, source_workbook_id,
  resource_status, resource_revision, google_compatibility_policy
)
select '2026', scope.project_ref, scope.project_url,
  scope.google_workbook_id, 'CURRENT_RESOURCE_BOUND', 1,
  'CURRENT_CERTIFIED'
from production_control.resource_scope scope
where scope.scope_key = 'BAGGER_INV_PRODUCTION'
on conflict (tournament_id) do nothing;

revoke all on table production_control.future_tournament_catalog_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.current_tournament_pointer_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.future_tournament_resources_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.future_tournament_teams_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.future_tournament_roster_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.future_tournament_rounds_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.future_tournament_course_references_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.future_match_definitions_v1
  from public, anon, authenticated, service_role;
revoke all on table
  production_control.future_match_google_compatibility_jobs_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.future_year_operation_receipts_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.future_year_audit_events_v1
  from public, anon, authenticated, service_role;

revoke all on function
  production_control.reject_future_year_immutable_v1()
  from public, anon, authenticated, service_role;
revoke all on function production_control.future_year_hash_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_future_year_runtime_v1(jsonb, boolean)
  from public, anon, authenticated, service_role;
revoke all on function production_control.future_year_readiness_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function
  public.read_production_future_year_administration_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.mutate_production_future_year_administration_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.read_production_future_year_administration_v1(jsonb)
  to service_role;
grant execute on function
  public.mutate_production_future_year_administration_v1(jsonb)
  to service_role;

comment on function public.read_production_future_year_administration_v1(jsonb)
is 'Director server transport for private future-year catalog and setup readiness. No public or client direct grants.';
comment on function public.mutate_production_future_year_administration_v1(jsonb)
is 'Bounded future Draft administration. It cannot activate, close, archive, create a global Course, create a runtime match, or invoke Google.';

commit;
