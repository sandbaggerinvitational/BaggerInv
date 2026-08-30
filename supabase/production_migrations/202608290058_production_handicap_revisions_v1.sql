-- Step 13E.1 Production tournament-handicap revision authority.
--
-- Installation is inert with respect to the live control plane.  It does not
-- change read/scoring/identity authority, cutover phase, maintenance, ingress,
-- workers, Odds publication, match lifecycle, scores, or frozen snapshots.
-- When the imported 2026 roster already has complete Tournament Handicap
-- source facts, those exact decimals are adopted as revision 1; otherwise the
-- current pointer remains empty and the first Director revision must use
-- predecessor 0.
--
-- Match refresh deliberately reuses the certified Production workbook rules:
--   course HCP = index * (slope / 113) + (rating - par), without rounding;
--   BB Playing HCP = ROUND(course HCP), final strokes =
--     ROUND((course HCP - lowest match course HCP) * 0.9);
--   SC participant Playing HCP/final strokes = 0, team HCP =
--     ROUND(35% low partner + 15% high partner), relative team strokes;
--   SI Playing HCP = ROUND(course HCP), final strokes =
--     ROUND(course HCP - lowest active pair course HCP).
-- PostgreSQL numeric ROUND matches the authoritative Sheets ROUND contract.
-- Tournament Handicap, source index, low index, and course HCP remain
-- unconstrained NUMERIC values: no scale is declared and no silent rounding is
-- performed.
begin;

alter table scoring_authority.tournament_players
  add column tournament_handicap numeric,
  add column handicap_revision_id uuid;

alter table scoring_authority.match_participants
  add column tournament_handicap numeric,
  add column handicap_revision_id uuid;

alter table scoring_authority.scoring_snapshots
  add column handicap_revision_id uuid;

create table scoring_authority.handicap_revisions (
  revision_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  revision_number bigint not null check (revision_number > 0),
  status text not null check (status in ('DRAFT', 'APPROVED', 'SUPERSEDED')),
  effective_date date not null,
  method text not null check (
    pg_catalog.btrim(method) <> '' and pg_catalog.length(method) <= 160
  ),
  source_metadata jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(source_metadata) = 'object'
  ),
  source_evidence_date date,
  canonical_fingerprint text not null check (
    canonical_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  roster_fingerprint text not null check (
    roster_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  predecessor_revision bigint not null check (predecessor_revision >= 0),
  predecessor_revision_id uuid references scoring_authority.handicap_revisions(
    revision_id
  ) on delete restrict,
  context_contract_version text not null check (
    context_contract_version = 'production-handicap-context-v1'
  ),
  created_by text not null check (
    pg_catalog.btrim(created_by) <> '' and pg_catalog.length(created_by) <= 160
  ),
  created_by_auth_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  approved_by text,
  approved_by_auth_user_id uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  superseded_at timestamptz,
  unique (tournament_id, revision_number),
  check (
    (predecessor_revision = 0 and predecessor_revision_id is null)
    or (predecessor_revision > 0 and predecessor_revision_id is not null)
  ),
  check (
    (status = 'DRAFT'
      and approved_by is null
      and approved_by_auth_user_id is null
      and approved_at is null
      and superseded_at is null)
    or
    (status = 'APPROVED'
      and approved_by is not null
      and pg_catalog.btrim(approved_by) <> ''
      and approved_at is not null
      and superseded_at is null)
    or
    (status = 'SUPERSEDED'
      and approved_by is not null
      and pg_catalog.btrim(approved_by) <> ''
      and approved_at is not null
      and superseded_at is not null)
  )
);

create unique index production_handicap_one_approved_revision
  on scoring_authority.handicap_revisions(tournament_id)
  where status = 'APPROVED';

create index production_handicap_revision_history
  on scoring_authority.handicap_revisions(
    tournament_id, revision_number desc, created_at desc
  );

create table scoring_authority.handicap_revision_entries (
  revision_id uuid not null references scoring_authority.handicap_revisions(
    revision_id
  ) on delete restrict,
  tournament_id text not null,
  player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  tournament_handicap numeric not null,
  source_index numeric,
  low_index numeric,
  source_metadata jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(source_metadata) = 'object'
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (revision_id, player_id),
  foreign key (tournament_id, player_id)
    references scoring_authority.tournament_players(tournament_id, player_id)
    on delete restrict
);

create index production_handicap_entries_tournament_player
  on scoring_authority.handicap_revision_entries(
    tournament_id, player_id, revision_id
  );

create table scoring_authority.handicap_revision_current (
  tournament_id text primary key references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  revision_id uuid not null unique references scoring_authority.handicap_revisions(
    revision_id
  ) on delete restrict,
  revision_number bigint not null check (revision_number > 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table scoring_authority.handicap_operation_receipts (
  receipt_id uuid not null default extensions.gen_random_uuid() unique,
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  operation text not null check (operation in ('STAGE', 'APPROVE')),
  operation_request_id uuid not null,
  declared_request_payload_hash text not null check (
    declared_request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  request_payload_hash text not null check (
    request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  response jsonb not null check (pg_catalog.jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, operation, operation_request_id)
);

create table scoring_authority.handicap_audit_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  revision_id uuid not null references scoring_authority.handicap_revisions(
    revision_id
  ) on delete restrict,
  action text not null check (action in (
    'INITIAL_REVISION_ADOPTED', 'REVISION_STAGED', 'REVISION_APPROVED'
  )),
  actor_player_id text not null check (
    pg_catalog.btrim(actor_player_id) <> ''
    and pg_catalog.length(actor_player_id) <= 160
  ),
  actor_auth_user_id uuid references auth.users(id) on delete restrict,
  operation_request_id uuid,
  request_payload_hash text check (
    request_payload_hash is null
    or request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  canonical_fingerprint text not null check (
    canonical_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  before_state jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(before_state) = 'object'
  ),
  after_state jsonb not null check (
    pg_catalog.jsonb_typeof(after_state) = 'object'
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index production_handicap_audit_history
  on scoring_authority.handicap_audit_events(
    tournament_id, created_at desc, event_id
  );

create table scoring_authority.handicap_match_refresh_events (
  revision_id uuid not null references scoring_authority.handicap_revisions(
    revision_id
  ) on delete restrict,
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  match_id text not null references scoring_authority.matches(match_id)
    on delete restrict,
  previous_snapshot_revision bigint not null check (
    previous_snapshot_revision >= 0
  ),
  next_snapshot_revision bigint not null check (
    next_snapshot_revision = previous_snapshot_revision + 1
  ),
  before_context jsonb not null check (
    pg_catalog.jsonb_typeof(before_context) = 'object'
  ),
  after_context jsonb not null check (
    pg_catalog.jsonb_typeof(after_context) = 'object'
  ),
  refreshed_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (revision_id, match_id)
);

alter table scoring_authority.tournament_players
  add constraint tournament_players_handicap_revision_fkey
    foreign key (handicap_revision_id)
    references scoring_authority.handicap_revisions(revision_id)
    on delete restrict;

alter table scoring_authority.match_participants
  add constraint match_participants_handicap_revision_fkey
    foreign key (handicap_revision_id)
    references scoring_authority.handicap_revisions(revision_id)
    on delete restrict;

alter table scoring_authority.scoring_snapshots
  add constraint scoring_snapshots_handicap_revision_fkey
    foreign key (handicap_revision_id)
    references scoring_authority.handicap_revisions(revision_id)
    on delete restrict;

alter table scoring_authority.handicap_revisions enable row level security;
alter table scoring_authority.handicap_revision_entries enable row level security;
alter table scoring_authority.handicap_revision_current enable row level security;
alter table scoring_authority.handicap_operation_receipts enable row level security;
alter table scoring_authority.handicap_audit_events enable row level security;
alter table scoring_authority.handicap_match_refresh_events enable row level security;

create or replace function production_control.reject_handicap_immutable_change()
returns trigger
language plpgsql
set search_path = pg_catalog, production_control
as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_HANDICAP_IMMUTABLE_RECORD';
end;
$$;

create or replace function public.stage_production_handicap_revision_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
  operation_request uuid;
  declared_hash text := pg_catalog.lower(coalesce(
    input->>'request_payload_hash', ''
  ));
  expected_predecessor bigint;
  current_revision bigint := 0;
  predecessor_id uuid;
  effective_date_value date;
  source_evidence_date_value date;
  method_value text := pg_catalog.btrim(coalesce(
    input->>'method', ''
  ));
  source_metadata_value jsonb := coalesce(
    input->'source_metadata', '{}'::jsonb
  );
  active_count integer;
  next_revision bigint;
  revision_id_value uuid;
  roster_hash text;
  canonical_entries jsonb;
  canonical_payload jsonb;
  canonical_hash text;
  database_request_hash text;
  receipt scoring_authority.handicap_operation_receipts%rowtype;
  validation_value jsonb;
  response_value jsonb;
  audit_event_id_value uuid;
  receipt_id_value uuid := extensions.gen_random_uuid();
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_production_scoring_actor(input, true);
  perform production_control.assert_production_handicap_runtime();

  if input->>'operation' is distinct from
       'STAGE_PRODUCTION_HANDICAP_REVISION_V1'
     or input->>'contract_version' is distinct from
       'production-handicap-revision-v1'
     or pg_catalog.jsonb_typeof(input->'operation_request_id')
       is distinct from 'string'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'expected_predecessor_revision')
       is distinct from 'number'
     or input->>'expected_predecessor_revision' !~ '^[0-9]+$'
     or pg_catalog.jsonb_typeof(input->'effective_date')
       is distinct from 'string'
     or input->>'effective_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or method_value = ''
     or pg_catalog.length(method_value) > 160
     or pg_catalog.jsonb_typeof(source_metadata_value) <> 'object'
     or (
       input ? 'source_evidence_date'
       and input->'source_evidence_date' <> 'null'::jsonb
       and (
         pg_catalog.jsonb_typeof(input->'source_evidence_date') <> 'string'
         or input->>'source_evidence_date'
           !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       )
     )
     or pg_catalog.jsonb_typeof(input->'entries') is distinct from 'array'
     or pg_catalog.jsonb_array_length(input->'entries') = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_REVISION_INPUT_INVALID'
    );
  end if;

  begin
    operation_request := (input->>'operation_request_id')::uuid;
    expected_predecessor :=
      (input->>'expected_predecessor_revision')::bigint;
    effective_date_value := (input->>'effective_date')::date;
    source_evidence_date_value := case
      when input->'source_evidence_date' is null
        or input->'source_evidence_date' = 'null'::jsonb then null
      else (input->>'source_evidence_date')::date
    end;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_REVISION_INPUT_INVALID'
    );
  end;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(input->'entries') item(value)
    where pg_catalog.jsonb_typeof(item.value) <> 'object'
      or pg_catalog.jsonb_typeof(item.value->'player_id') <> 'string'
      or pg_catalog.btrim(coalesce(
        item.value->>'player_id', ''
      )) = ''
      or item.value->>'player_id' is distinct from
        pg_catalog.btrim(item.value->>'player_id')
      or not production_control.handicap_v1_json_decimal(
        item.value->'tournament_handicap'
      )
      or (
        item.value ? 'source_index'
        and item.value->'source_index' <> 'null'::jsonb
        and not production_control.handicap_v1_json_decimal(
          item.value->'source_index'
        )
      )
      or (
        item.value ? 'low_index'
        and item.value->'low_index' <> 'null'::jsonb
        and not production_control.handicap_v1_json_decimal(
          item.value->'low_index'
        )
      )
      or (
        item.value ? 'source_metadata'
        and pg_catalog.jsonb_typeof(item.value->'source_metadata') <> 'object'
      )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_ENTRY_NUMERIC_INVALID'
    );
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(input->'entries') item(value)
    group by item.value->>'player_id'
    having pg_catalog.count(*) > 1
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_DUPLICATE_PLAYER_ID'
    );
  end if;

  -- Normalize decimal values before the idempotency comparison.  This makes
  -- semantically identical exact values such as "8.10", "8.1", and the JSON
  -- number 8.1 replay the same receipt, while any changed action field under
  -- the same request key fails closed.
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'player_id', item.value->>'player_id',
      'tournament_handicap',
        pg_catalog.trim_scale(
          (item.value->>'tournament_handicap')::numeric
        ),
      'source_index', case
        when item.value->'source_index' is null
          or item.value->'source_index' = 'null'::jsonb then null
        else pg_catalog.trim_scale(
          (item.value->>'source_index')::numeric
        )
      end,
      'low_index', case
        when item.value->'low_index' is null
          or item.value->'low_index' = 'null'::jsonb then null
        else pg_catalog.trim_scale(
          (item.value->>'low_index')::numeric
        )
      end,
      'source_metadata', coalesce(
        item.value->'source_metadata', '{}'::jsonb
      )
    ) order by item.value->>'player_id'
  ) into canonical_entries
  from pg_catalog.jsonb_array_elements(input->'entries') item(value);

  database_request_hash := production_control.handicap_v1_hash(
    pg_catalog.jsonb_build_object(
      'operation', 'STAGE',
      'operation_request_id', operation_request,
      'actor_player_id', actor_player,
      'actor_auth_user_id', actor_auth_user,
      'expected_predecessor_revision', expected_predecessor,
      'effective_date', effective_date_value,
      'method', method_value,
      'source_metadata', source_metadata_value,
      'source_evidence_date', source_evidence_date_value,
      'entries', canonical_entries
    )
  );
  select value.* into receipt
  from scoring_authority.handicap_operation_receipts value
  where value.tournament_id = '2026'
    and value.operation = 'STAGE'
    and value.operation_request_id = operation_request;
  if found then
    if receipt.declared_request_payload_hash = declared_hash
       and receipt.request_payload_hash = database_request_hash then
      return receipt.response || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_IDEMPOTENCY_CONFLICT',
      'operation_request_id', operation_request
    );
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(input->'entries') item(value)
    left join scoring_authority.tournament_players roster
      on roster.tournament_id = '2026'
     and roster.player_id = item.value->>'player_id'
     and roster.participation_status = 'ACTIVE'
    where roster.player_id is null
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_UNKNOWN_PLAYER_ID'
    );
  end if;

  select pg_catalog.count(*) into active_count
  from scoring_authority.tournament_players value
  where value.tournament_id = '2026'
    and value.participation_status = 'ACTIVE';
  if pg_catalog.jsonb_array_length(input->'entries') <> active_count
     or exists (
       select 1
       from scoring_authority.tournament_players roster
       left join pg_catalog.jsonb_array_elements(input->'entries') item(value)
         on item.value->>'player_id' = roster.player_id
       where roster.tournament_id = '2026'
         and roster.participation_status = 'ACTIVE'
         and item.value is null
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_INCOMPLETE_ACTIVE_ROSTER',
      'active_roster_count', active_count,
      'entry_count', pg_catalog.jsonb_array_length(input->'entries')
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('production-handicap-revision:2026', 0)
  );
  -- Close the concurrent first-use race: the same request may have committed
  -- while this transaction waited for the tournament mutation lock.
  select value.* into receipt
  from scoring_authority.handicap_operation_receipts value
  where value.tournament_id = '2026'
    and value.operation = 'STAGE'
    and value.operation_request_id = operation_request;
  if found then
    if receipt.declared_request_payload_hash = declared_hash
       and receipt.request_payload_hash = database_request_hash then
      return receipt.response || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_IDEMPOTENCY_CONFLICT',
      'operation_request_id', operation_request
    );
  end if;
  select pointer.revision_number, pointer.revision_id
    into current_revision, predecessor_id
  from scoring_authority.handicap_revision_current pointer
  where pointer.tournament_id = '2026' for update;
  current_revision := coalesce(current_revision, 0);
  if current_revision <> expected_predecessor then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_PREDECESSOR_STALE',
      'expected_predecessor_revision', expected_predecessor,
      'current_revision', current_revision
    );
  end if;

  roster_hash :=
    production_control.handicap_v1_roster_fingerprint('2026');
  canonical_payload := pg_catalog.jsonb_build_object(
    'contract_version', 'production-handicap-revision-v1',
    'context_contract_version', 'production-handicap-context-v1',
    'tournament_id', '2026',
    'effective_date', effective_date_value,
    'method', method_value,
    'source_metadata', source_metadata_value,
    'source_evidence_date', source_evidence_date_value,
    'predecessor_revision', expected_predecessor,
    'roster_fingerprint', roster_hash,
    'entries', canonical_entries
  );
  canonical_hash := production_control.handicap_v1_hash(canonical_payload);
  select coalesce(pg_catalog.max(value.revision_number), 0) + 1
    into next_revision
  from scoring_authority.handicap_revisions value
  where value.tournament_id = '2026';

  insert into scoring_authority.handicap_revisions (
    tournament_id, revision_number, status, effective_date, method,
    source_metadata, source_evidence_date, canonical_fingerprint,
    roster_fingerprint, predecessor_revision, predecessor_revision_id,
    context_contract_version, created_by, created_by_auth_user_id
  ) values (
    '2026', next_revision, 'DRAFT', effective_date_value, method_value,
    source_metadata_value, source_evidence_date_value, canonical_hash,
    roster_hash, expected_predecessor, predecessor_id,
    'production-handicap-context-v1', actor_player, actor_auth_user
  ) returning revision_id into revision_id_value;

  insert into scoring_authority.handicap_revision_entries (
    revision_id, tournament_id, player_id, tournament_handicap,
    source_index, low_index, source_metadata
  )
  select revision_id_value, '2026', item.value->>'player_id',
    (item.value->>'tournament_handicap')::numeric,
    case when item.value->'source_index' is null
      or item.value->'source_index' = 'null'::jsonb then null
      else (item.value->>'source_index')::numeric end,
    case when item.value->'low_index' is null
      or item.value->'low_index' = 'null'::jsonb then null
      else (item.value->>'low_index')::numeric end,
    coalesce(item.value->'source_metadata', '{}'::jsonb)
  from pg_catalog.jsonb_array_elements(input->'entries') item(value)
  order by item.value->>'player_id';

  validation_value := production_control.validate_handicap_revision_v1(
    revision_id_value, expected_predecessor
  );
  audit_event_id_value := extensions.gen_random_uuid();
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'HANDICAP_REVISION_STAGED',
    'idempotent', false,
    'operation_request_id', operation_request,
    'revision_id', revision_id_value,
    'revision_number', next_revision,
    'status', 'DRAFT',
    'effective_date', effective_date_value,
    'canonical_fingerprint', canonical_hash,
    'changed_player_count', coalesce(
      (validation_value#>>'{summary,changed_player_count}')::integer, 0
    ),
    'affected_match_count', coalesce(
      (validation_value#>>'{summary,unstarted_refresh_count}')::integer, 0
    ) + coalesce(
      (validation_value#>>'{summary,started_preserved_count}')::integer, 0
    ),
    'audit_event_id', audit_event_id_value,
    'request_payload_hash', declared_hash,
    'receipt', pg_catalog.jsonb_build_object(
      'receipt_id', receipt_id_value,
      'operation_request_id', operation_request,
      'request_payload_hash', declared_hash,
      'status', 'STAGED'
    ),
    'validation', validation_value
  );

  insert into scoring_authority.handicap_audit_events (
    event_id, tournament_id, revision_id, action, actor_player_id,
    actor_auth_user_id, operation_request_id, request_payload_hash,
    canonical_fingerprint, before_state, after_state
  ) values (
    audit_event_id_value, '2026', revision_id_value, 'REVISION_STAGED',
    actor_player, actor_auth_user, operation_request,
    database_request_hash, canonical_hash,
    pg_catalog.jsonb_build_object(
      'predecessor_revision', expected_predecessor
    ),
    pg_catalog.jsonb_build_object(
      'revision_number', next_revision,
      'status', 'DRAFT',
      'entry_count', active_count,
      'changed_player_count', coalesce(
        (validation_value#>>'{summary,changed_player_count}')::integer, 0
      ),
      'affected_match_count', coalesce(
        (validation_value#>>'{summary,unstarted_refresh_count}')::integer, 0
      ) + coalesce(
        (validation_value#>>'{summary,started_preserved_count}')::integer, 0
      ),
      'validation', validation_value - 'changed_players'
        - 'unstarted_matches' - 'started_frozen_matches'
    )
  );
  insert into scoring_authority.handicap_operation_receipts (
    receipt_id, tournament_id, operation, operation_request_id,
    declared_request_payload_hash, request_payload_hash,
    actor_player_id, actor_auth_user_id, response
  ) values (
    receipt_id_value, '2026', 'STAGE', operation_request, declared_hash,
    database_request_hash, actor_player, actor_auth_user, response_value
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_HANDICAP_REVISION_STAGED', 'HANDICAP_CONFIGURATION',
    '2026', actor_player, database_request_hash, 'SUCCEEDED',
    response_value - 'validation'
  );
  return response_value;
end;
$$;

create or replace function public.validate_production_handicap_revision_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  target_revision uuid;
  expected_predecessor bigint;
  validation_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_production_scoring_actor(input, true);
  perform production_control.assert_production_handicap_runtime();
  if input->>'operation' is distinct from
       'VALIDATE_PRODUCTION_HANDICAP_REVISION_V1'
     or input->>'contract_version' is distinct from
       'production-handicap-revision-v1'
     or coalesce(input->>'revision_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or pg_catalog.jsonb_typeof(input->'expected_predecessor_revision')
       is distinct from 'number'
     or input->>'expected_predecessor_revision' !~ '^[0-9]+$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_VALIDATION_INPUT_INVALID'
    );
  end if;
  begin
    target_revision := (input->>'revision_id')::uuid;
    expected_predecessor :=
      (input->>'expected_predecessor_revision')::bigint;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_VALIDATION_INPUT_INVALID'
    );
  end;
  validation_value := production_control.validate_handicap_revision_v1(
    target_revision, expected_predecessor
  );
  return pg_catalog.jsonb_build_object(
    'ok', coalesce((validation_value->>'valid')::boolean, false),
    'code', validation_value->>'code',
    'validation', validation_value
  );
end;
$$;

create or replace function public.approve_production_handicap_revision_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
as $$
declare
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
  operation_request uuid;
  declared_hash text := pg_catalog.lower(coalesce(
    input->>'request_payload_hash', ''
  ));
  target_revision uuid;
  expected_predecessor bigint;
  confirmed_effective_date date;
  confirmed_changed_player_count integer;
  confirmed_affected_match_count integer;
  confirmed_unstarted_refresh_count integer;
  confirmed_started_preserved_count integer;
  current_revision bigint := 0;
  current_revision_id uuid;
  revision scoring_authority.handicap_revisions%rowtype;
  receipt scoring_authority.handicap_operation_receipts%rowtype;
  validation_value jsonb;
  database_request_hash text;
  approval_time timestamptz := pg_catalog.clock_timestamp();
  match_item jsonb;
  target_match text;
  match_value scoring_authority.matches%rowtype;
  snapshot_before scoring_authority.scoring_snapshots%rowtype;
  snapshot_after scoring_authority.scoring_snapshots%rowtype;
  participant_item jsonb;
  context_value jsonb;
  before_participants jsonb;
  after_participants jsonb;
  next_snapshot_revision bigint;
  next_snapshot_hash text;
  refreshed_match_ids jsonb := '[]'::jsonb;
  preserved_match_ids jsonb := '[]'::jsonb;
  audit_event_id_value uuid;
  receipt_id_value uuid := extensions.gen_random_uuid();
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_production_scoring_actor(input, true);
  perform production_control.assert_production_handicap_runtime();
  if input->>'operation' is distinct from
       'APPROVE_PRODUCTION_HANDICAP_REVISION_V1'
     or input->>'contract_version' is distinct from
       'production-handicap-revision-v1'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'revision_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or pg_catalog.jsonb_typeof(input->'expected_predecessor_revision')
       is distinct from 'number'
     or input->>'expected_predecessor_revision' !~ '^[0-9]+$'
     or pg_catalog.jsonb_typeof(input->'confirmation')
       is distinct from 'object'
     or pg_catalog.jsonb_typeof(input#>'{confirmation,effective_date}')
       is distinct from 'string'
     or input#>>'{confirmation,effective_date}'
       !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or pg_catalog.jsonb_typeof(
       input#>'{confirmation,changed_player_count}'
     ) is distinct from 'number'
     or input#>>'{confirmation,changed_player_count}' !~ '^[1-9][0-9]*$'
     or pg_catalog.jsonb_typeof(
       input#>'{confirmation,affected_match_count}'
     ) is distinct from 'number'
     or input#>>'{confirmation,affected_match_count}' !~ '^[0-9]+$'
     or pg_catalog.jsonb_typeof(
       input#>'{confirmation,unstarted_refresh_count}'
     ) is distinct from 'number'
     or input#>>'{confirmation,unstarted_refresh_count}' !~ '^[0-9]+$'
     or pg_catalog.jsonb_typeof(
       input#>'{confirmation,started_preserved_count}'
     ) is distinct from 'number'
     or input#>>'{confirmation,started_preserved_count}' !~ '^[0-9]+$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_APPROVAL_INPUT_INVALID'
    );
  end if;
  begin
    operation_request := (input->>'operation_request_id')::uuid;
    target_revision := (input->>'revision_id')::uuid;
    expected_predecessor :=
      (input->>'expected_predecessor_revision')::bigint;
    confirmed_effective_date :=
      (input#>>'{confirmation,effective_date}')::date;
    confirmed_changed_player_count :=
      (input#>>'{confirmation,changed_player_count}')::integer;
    confirmed_affected_match_count :=
      (input#>>'{confirmation,affected_match_count}')::integer;
    confirmed_unstarted_refresh_count :=
      (input#>>'{confirmation,unstarted_refresh_count}')::integer;
    confirmed_started_preserved_count :=
      (input#>>'{confirmation,started_preserved_count}')::integer;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_APPROVAL_INPUT_INVALID'
    );
  end;

  database_request_hash := production_control.handicap_v1_hash(
    pg_catalog.jsonb_build_object(
      'operation', 'APPROVE',
      'operation_request_id', operation_request,
      'actor_player_id', actor_player,
      'actor_auth_user_id', actor_auth_user,
      'revision_id', target_revision,
      'expected_predecessor_revision', expected_predecessor,
      'confirmation', pg_catalog.jsonb_build_object(
        'effective_date', confirmed_effective_date,
        'changed_player_count', confirmed_changed_player_count,
        'affected_match_count', confirmed_affected_match_count,
        'unstarted_refresh_count', confirmed_unstarted_refresh_count,
        'started_preserved_count', confirmed_started_preserved_count
      )
    )
  );
  select value.* into receipt
  from scoring_authority.handicap_operation_receipts value
  where value.tournament_id = '2026'
    and value.operation = 'APPROVE'
    and value.operation_request_id = operation_request;
  if found then
    if receipt.declared_request_payload_hash = declared_hash
       and receipt.request_payload_hash = database_request_hash then
      return receipt.response || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_IDEMPOTENCY_CONFLICT',
      'operation_request_id', operation_request
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('production-handicap-revision:2026', 0)
  );
  select value.* into receipt
  from scoring_authority.handicap_operation_receipts value
  where value.tournament_id = '2026'
    and value.operation = 'APPROVE'
    and value.operation_request_id = operation_request;
  if found then
    if receipt.declared_request_payload_hash = declared_hash
       and receipt.request_payload_hash = database_request_hash then
      return receipt.response || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_IDEMPOTENCY_CONFLICT',
      'operation_request_id', operation_request
    );
  end if;
  -- Serialize against scoring mutations.  A scorer that commits first makes
  -- the match frozen; an approval that locks first refreshes before scoring.
  perform value.match_id
  from scoring_authority.matches value
  where value.tournament_id = '2026'
  order by value.match_id
  for update;

  select pointer.revision_number, pointer.revision_id
    into current_revision, current_revision_id
  from scoring_authority.handicap_revision_current pointer
  where pointer.tournament_id = '2026' for update;
  current_revision := coalesce(current_revision, 0);
  select value.* into revision
  from scoring_authority.handicap_revisions value
  where value.revision_id = target_revision
    and value.tournament_id = '2026' for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_REVISION_NOT_FOUND'
    );
  end if;

  validation_value := production_control.validate_handicap_revision_v1(
    target_revision, expected_predecessor
  );
  if coalesce(
    (validation_value->>'valid')::boolean, false
  ) is not true then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', validation_value->>'code',
      'validation', validation_value
    );
  end if;
  if revision.effective_date <> confirmed_effective_date
     or coalesce(
       (validation_value#>>'{summary,changed_player_count}')::integer, 0
     ) <> confirmed_changed_player_count
     or coalesce(
       (validation_value#>>'{summary,unstarted_refresh_count}')::integer, 0
     ) + coalesce(
       (validation_value#>>'{summary,started_preserved_count}')::integer, 0
     ) <> confirmed_affected_match_count
     or coalesce(
       (validation_value#>>'{summary,unstarted_refresh_count}')::integer, 0
     ) <> confirmed_unstarted_refresh_count
     or coalesce(
       (validation_value#>>'{summary,started_preserved_count}')::integer, 0
     ) <> confirmed_started_preserved_count then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'HANDICAP_APPROVAL_CONFIRMATION_MISMATCH',
      'confirmation', pg_catalog.jsonb_build_object(
        'effective_date', confirmed_effective_date,
        'changed_player_count', confirmed_changed_player_count,
        'affected_match_count', confirmed_affected_match_count,
        'unstarted_refresh_count', confirmed_unstarted_refresh_count,
        'started_preserved_count', confirmed_started_preserved_count
      ),
      'actual', pg_catalog.jsonb_build_object(
        'effective_date', revision.effective_date,
        'changed_player_count', coalesce(
          (validation_value#>>'{summary,changed_player_count}')::integer, 0
        ),
        'affected_match_count', coalesce(
          (validation_value#>>'{summary,unstarted_refresh_count}')::integer, 0
        ) + coalesce(
          (validation_value#>>'{summary,started_preserved_count}')::integer, 0
        ),
        'unstarted_refresh_count', coalesce(
          (validation_value#>>'{summary,unstarted_refresh_count}')::integer, 0
        ),
        'started_preserved_count', coalesce(
          (validation_value#>>'{summary,started_preserved_count}')::integer, 0
        )
      )
    );
  end if;
  if current_revision <> expected_predecessor
     or revision.predecessor_revision <> expected_predecessor
     or revision.predecessor_revision_id is distinct from current_revision_id
     or revision.status <> 'DRAFT' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_PREDECESSOR_STALE',
      'expected_predecessor_revision', expected_predecessor,
      'current_revision', current_revision
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(value->>'match_id'), '[]'::jsonb)
    into preserved_match_ids
  from pg_catalog.jsonb_array_elements(
    validation_value->'started_frozen_matches'
  ) item(value);

  if current_revision_id is not null then
    update scoring_authority.handicap_revisions
    set status = 'SUPERSEDED', superseded_at = approval_time
    where revision_id = current_revision_id and status = 'APPROVED';
    if not found then
      raise exception using errcode = '40001',
        message = 'HANDICAP_PREDECESSOR_STALE';
    end if;
  end if;
  update scoring_authority.handicap_revisions
  set status = 'APPROVED', approved_by = actor_player,
      approved_by_auth_user_id = actor_auth_user,
      approved_at = approval_time
  where revision_id = target_revision and status = 'DRAFT';
  if not found then
    raise exception using errcode = '40001',
      message = 'HANDICAP_PREDECESSOR_STALE';
  end if;

  update scoring_authority.tournament_players roster
  set tournament_handicap = entry.tournament_handicap,
      handicap_revision_id = target_revision,
      -- Preserve the established Supabase projection contract used by current
      -- server/native readers.  This changes only the existing Tournament
      -- Handicap JSON member; it does not enqueue or perform a Google write.
      source_payload = pg_catalog.jsonb_set(
        roster.source_payload,
        array['Tournament Handicap']::text[],
        pg_catalog.to_jsonb(entry.tournament_handicap),
        true
      ),
      updated_at = approval_time
  from scoring_authority.handicap_revision_entries entry
  where entry.revision_id = target_revision
    and entry.tournament_id = '2026'
    and roster.tournament_id = entry.tournament_id
    and roster.player_id = entry.player_id
    and roster.participation_status = 'ACTIVE';

  for match_item in
    select value from pg_catalog.jsonb_array_elements(
      validation_value->'unstarted_matches'
    ) item(value)
  loop
    target_match := match_item->>'match_id';
    if not production_control.handicap_v1_match_is_unstarted(target_match) then
      raise exception using errcode = '55000',
        message = 'HANDICAP_MATCH_BECAME_FROZEN';
    end if;
    select value.* into strict match_value
    from scoring_authority.matches value
    where value.match_id = target_match and value.tournament_id = '2026';
    select value.* into strict snapshot_before
    from scoring_authority.scoring_snapshots value
    where value.snapshot_id = match_value.scoring_snapshot_id
      and value.match_id = target_match
      and value.tournament_id = '2026' for update;
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(value) order by value.team_side, value.player_slot
    ), '[]'::jsonb) into before_participants
    from scoring_authority.match_participants value
    where value.match_id = target_match;

    context_value := production_control.handicap_v1_match_context(
      target_match, target_revision
    );
    for participant_item in
      select value from pg_catalog.jsonb_array_elements(
        context_value->'participants'
      ) item(value)
    loop
      update scoring_authority.match_participants
      set tournament_handicap =
            (participant_item->>'tournament_handicap')::numeric,
          handicap_index = (participant_item->>'handicap_index')::numeric,
          course_handicap =
            (participant_item->>'course_handicap')::numeric,
          playing_handicap =
            (participant_item->>'playing_handicap')::numeric,
          final_strokes = (participant_item->>'final_strokes')::integer,
          handicap_revision_id = target_revision
      where match_id = target_match
        and player_id = participant_item->>'player_id';
    end loop;

    next_snapshot_revision := snapshot_before.snapshot_revision + 1;
    next_snapshot_hash := production_control.handicap_v1_hash(
      pg_catalog.jsonb_build_object(
        'tournament_id', '2026',
        'tournament_year', 2026,
        'round_number', match_value.round_number,
        'match_id', match_value.match_id,
        'format', match_value.format,
        'scoring_rules_version', snapshot_before.scoring_rules_version,
        'handicap_allowance', snapshot_before.handicap_allowance,
        'course', pg_catalog.jsonb_build_object(
          'course_id', snapshot_before.course_id,
          'tee', snapshot_before.tee,
          'rating', snapshot_before.rating,
          'slope', snapshot_before.slope,
          'par', snapshot_before.par
        ),
        'holes', snapshot_before.hole_definitions,
        'participants', context_value->'participant_configuration',
        'teams', context_value->'team_configuration',
        'match_netting_baseline', snapshot_before.match_netting_baseline,
        'snapshot_revision', next_snapshot_revision,
        'effective_at', approval_time,
        'handicap_revision_id', target_revision,
        'handicap_context_contract', 'production-handicap-context-v1'
      )
    );
    update scoring_authority.scoring_snapshots
    set snapshot_revision = next_snapshot_revision,
        participant_configuration =
          context_value->'participant_configuration',
        team_configuration = context_value->'team_configuration',
        effective_at = approval_time,
        canonical_hash = next_snapshot_hash,
        handicap_revision_id = target_revision
    where snapshot_id = snapshot_before.snapshot_id
    returning * into strict snapshot_after;
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(value) order by value.team_side, value.player_slot
    ), '[]'::jsonb) into after_participants
    from scoring_authority.match_participants value
    where value.match_id = target_match;

    insert into scoring_authority.handicap_match_refresh_events (
      revision_id, tournament_id, match_id, previous_snapshot_revision,
      next_snapshot_revision, before_context, after_context, refreshed_at
    ) values (
      target_revision, '2026', target_match,
      snapshot_before.snapshot_revision, snapshot_after.snapshot_revision,
      pg_catalog.jsonb_build_object(
        'snapshot', pg_catalog.to_jsonb(snapshot_before),
        'participants', before_participants
      ),
      pg_catalog.jsonb_build_object(
        'snapshot', pg_catalog.to_jsonb(snapshot_after),
        'participants', after_participants
      ),
      approval_time
    );
    refreshed_match_ids := refreshed_match_ids
      || pg_catalog.jsonb_build_array(target_match);
  end loop;

  insert into scoring_authority.handicap_revision_current (
    tournament_id, revision_id, revision_number, updated_at
  ) values (
    '2026', target_revision, revision.revision_number, approval_time
  ) on conflict (tournament_id) do update set
    revision_id = excluded.revision_id,
    revision_number = excluded.revision_number,
    updated_at = excluded.updated_at;

  audit_event_id_value := extensions.gen_random_uuid();
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'HANDICAP_REVISION_APPROVED',
    'idempotent', false,
    'operation_request_id', operation_request,
    'revision_id', target_revision,
    'revision_number', revision.revision_number,
    'status', 'APPROVED',
    'effective_date', revision.effective_date,
    'canonical_fingerprint', revision.canonical_fingerprint,
    'approved_at', approval_time,
    'approved_by', actor_player,
    'refreshed_match_ids', refreshed_match_ids,
    'preserved_match_ids', preserved_match_ids,
    'refresh_count', pg_catalog.jsonb_array_length(refreshed_match_ids),
    'preserved_count', pg_catalog.jsonb_array_length(preserved_match_ids),
    'unstarted_refresh_count',
      pg_catalog.jsonb_array_length(refreshed_match_ids),
    'started_preserved_count',
      pg_catalog.jsonb_array_length(preserved_match_ids),
    'changed_player_count', coalesce(
      (validation_value#>>'{summary,changed_player_count}')::integer, 0
    ),
    'affected_match_count',
      pg_catalog.jsonb_array_length(refreshed_match_ids)
      + pg_catalog.jsonb_array_length(preserved_match_ids),
    'audit_event_id', audit_event_id_value,
    'request_payload_hash', declared_hash,
    'receipt', pg_catalog.jsonb_build_object(
      'receipt_id', receipt_id_value,
      'operation_request_id', operation_request,
      'request_payload_hash', declared_hash,
      'status', 'APPROVED',
      'approved_at', approval_time
    ),
    'validation', validation_value
  );
  insert into scoring_authority.handicap_audit_events (
    event_id, tournament_id, revision_id, action, actor_player_id,
    actor_auth_user_id, operation_request_id, request_payload_hash,
    canonical_fingerprint, before_state, after_state
  ) values (
    audit_event_id_value, '2026', target_revision, 'REVISION_APPROVED',
    actor_player, actor_auth_user, operation_request,
    database_request_hash, revision.canonical_fingerprint,
    pg_catalog.jsonb_build_object(
      'revision_number', current_revision,
      'revision_id', current_revision_id
    ),
    response_value - 'validation'
  );
  insert into scoring_authority.handicap_operation_receipts (
    receipt_id, tournament_id, operation, operation_request_id,
    declared_request_payload_hash, request_payload_hash,
    actor_player_id, actor_auth_user_id, response
  ) values (
    receipt_id_value, '2026', 'APPROVE', operation_request, declared_hash,
    database_request_hash, actor_player, actor_auth_user, response_value
  );
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'HANDICAP_REVISION_APPROVED', actor_player,
    response_value - 'validation'
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_HANDICAP_REVISION_APPROVED', 'HANDICAP_CONFIGURATION',
    '2026', actor_player, database_request_hash, 'SUCCEEDED',
    response_value - 'validation'
  );
  return response_value;
exception
  when numeric_value_out_of_range then
    raise exception using errcode = '55000',
      message = 'HANDICAP_DERIVED_STROKES_OUT_OF_RANGE';
end;
$$;

create or replace function public.read_production_handicap_revision_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_revision_id uuid;
  current_revision_number bigint := 0;
  revision_value jsonb;
  players_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_production_scoring_actor(input, true);
  perform production_control.assert_production_handicap_runtime();
  if input->>'operation' is distinct from
       'READ_PRODUCTION_HANDICAP_REVISION_V1'
     or input->>'contract_version' is distinct from
       'production-handicap-revision-v1' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_READ_INPUT_INVALID'
    );
  end if;
  select pointer.revision_id, pointer.revision_number
    into current_revision_id, current_revision_number
  from scoring_authority.handicap_revision_current pointer
  where pointer.tournament_id = '2026';
  current_revision_number := coalesce(current_revision_number, 0);

  select pg_catalog.jsonb_build_object(
    'revision_id', revision.revision_id,
    'revision_number', revision.revision_number,
    'status', revision.status,
    'effective_date', revision.effective_date,
    'method', revision.method,
    'source_metadata', revision.source_metadata,
    'source_evidence_date', revision.source_evidence_date,
    'canonical_fingerprint', revision.canonical_fingerprint,
    'predecessor_revision', revision.predecessor_revision,
    'created_by', revision.created_by,
    'created_at', revision.created_at,
    'approved_by', revision.approved_by,
    'approved_at', revision.approved_at
  ) into revision_value
  from scoring_authority.handicap_revisions revision
  where revision.revision_id = current_revision_id;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'player_id', roster.player_id,
      'display_name', player.display_name,
      'team_id', roster.team_id,
      'team_side', roster.team_side,
      'participation_status', roster.participation_status,
      'tournament_handicap', roster.tournament_handicap::text,
      'source_index', entry.source_index::text,
      'low_index', entry.low_index::text,
      'handicap_revision_id', roster.handicap_revision_id,
      'affected_matches', (
        select coalesce(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'match_id', match_value.match_id,
            'round_number', match_value.round_number,
            'format', match_value.format,
            'status', match_value.status,
            'scoring_locked', match_value.scoring_locked,
            'scored_holes', match_value.scored_holes,
            'current_hole', match_value.current_hole,
            'unresolved_mutations', match_value.unresolved_mutations,
            'running_result', match_value.running_result,
            'clinched', match_value.clinched,
            'snapshot_action', case
              when production_control.handicap_v1_match_is_unstarted(
                match_value.match_id
              ) then 'REFRESH_IF_CHANGED'
              else 'PRESERVE_FROZEN' end,
            'snapshot_action_reason', case
              when production_control.handicap_v1_match_is_unstarted(
                match_value.match_id
              ) then 'MATCH_STRICTLY_UNSTARTED'
              when match_value.scoring_locked then 'MATCH_SCORING_LOCKED'
              when match_value.unresolved_mutations <> 0
                then 'MATCH_HAS_UNRESOLVED_MUTATIONS'
              when match_value.status <> 'UPCOMING' then 'MATCH_STARTED'
              else 'MATCH_CONTEXT_FROZEN' end
          ) order by match_value.round_number, match_value.match_id
        ), '[]'::jsonb)
        from scoring_authority.match_participants participant
        join scoring_authority.matches match_value
          on match_value.match_id = participant.match_id
         and match_value.tournament_id = '2026'
        where participant.player_id = roster.player_id
      )
    ) order by player.display_name, roster.player_id
  ), '[]'::jsonb) into players_value
  from scoring_authority.tournament_players roster
  join scoring_authority.players player using (player_id)
  left join scoring_authority.handicap_revision_entries entry
    on entry.revision_id = current_revision_id
   and entry.player_id = roster.player_id
  where roster.tournament_id = '2026'
    and roster.participation_status = 'ACTIVE';

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', case when current_revision_id is null
      then 'HANDICAP_REVISION_NOT_INITIALIZED'
      else 'HANDICAP_REVISION_CURRENT' end,
    'current_revision', current_revision_number,
    'revision', revision_value,
    'active_roster_count', pg_catalog.jsonb_array_length(players_value),
    'players', players_value
  );
end;
$$;

create or replace function public.read_production_handicap_revision_history_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  limit_value integer := 25;
  history_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_production_scoring_actor(input, true);
  perform production_control.assert_production_handicap_runtime();
  if input->>'operation' is distinct from
       'READ_PRODUCTION_HANDICAP_REVISION_HISTORY_V1'
     or input->>'contract_version' is distinct from
       'production-handicap-revision-v1'
     or (
       input ? 'limit'
       and (
         pg_catalog.jsonb_typeof(input->'limit') <> 'number'
         or input->>'limit' !~ '^[0-9]+$'
       )
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_HISTORY_INPUT_INVALID'
    );
  end if;
  if input ? 'limit' then limit_value := (input->>'limit')::integer; end if;
  if limit_value not between 1 and 100 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'HANDICAP_HISTORY_INPUT_INVALID'
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(history.row_value
    order by history.revision_number desc), '[]'::jsonb)
    into history_value
  from (
    select revision.revision_number,
      pg_catalog.jsonb_build_object(
        'revision_id', revision.revision_id,
        'revision_number', revision.revision_number,
        'status', revision.status,
        'effective_date', revision.effective_date,
        'method', revision.method,
        'source_metadata', revision.source_metadata,
        'source_evidence_date', revision.source_evidence_date,
        'canonical_fingerprint', revision.canonical_fingerprint,
        'predecessor_revision', revision.predecessor_revision,
        'created_by', revision.created_by,
        'created_at', revision.created_at,
        'approved_by', revision.approved_by,
        'approved_at', revision.approved_at,
        'superseded_at', revision.superseded_at,
        'changed_player_count', coalesce((
          select (audit.after_state->>'changed_player_count')::integer
          from scoring_authority.handicap_audit_events audit
          where audit.revision_id = revision.revision_id
            and audit.action in ('REVISION_APPROVED', 'REVISION_STAGED')
          order by case audit.action
            when 'REVISION_APPROVED' then 0 else 1 end,
            audit.created_at desc, audit.event_id desc
          limit 1
        ), 0),
        'affected_match_count', coalesce((
          select (audit.after_state->>'affected_match_count')::integer
          from scoring_authority.handicap_audit_events audit
          where audit.revision_id = revision.revision_id
            and audit.action in ('REVISION_APPROVED', 'REVISION_STAGED')
          order by case audit.action
            when 'REVISION_APPROVED' then 0 else 1 end,
            audit.created_at desc, audit.event_id desc
          limit 1
        ), 0),
        'entries', (
          select coalesce(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'player_id', entry.player_id,
              'display_name', player.display_name,
              'tournament_handicap', entry.tournament_handicap::text,
              'source_index', entry.source_index::text,
              'low_index', entry.low_index::text,
              'source_metadata', entry.source_metadata
            ) order by player.display_name, entry.player_id
          ), '[]'::jsonb)
          from scoring_authority.handicap_revision_entries entry
          join scoring_authority.players player using (player_id)
          where entry.revision_id = revision.revision_id
        ),
        'match_refreshes', (
          select coalesce(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'match_id', refresh.match_id,
              'previous_snapshot_revision',
                refresh.previous_snapshot_revision,
              'next_snapshot_revision', refresh.next_snapshot_revision,
              'refreshed_at', refresh.refreshed_at
            ) order by refresh.match_id
          ), '[]'::jsonb)
          from scoring_authority.handicap_match_refresh_events refresh
          where refresh.revision_id = revision.revision_id
        ),
        'receipts', (
          select coalesce(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'receipt_id', receipt.receipt_id,
              'operation', receipt.operation,
              'operation_request_id', receipt.operation_request_id,
              'request_payload_hash',
                receipt.declared_request_payload_hash,
              'status', receipt.response#>>'{receipt,status}',
              'approved_at', receipt.response#>'{receipt,approved_at}',
              'created_at', receipt.created_at
            ) order by receipt.created_at, receipt.operation
          ), '[]'::jsonb)
          from scoring_authority.handicap_operation_receipts receipt
          where receipt.response->>'revision_id' = revision.revision_id::text
        ),
        'audit_events', (
          select coalesce(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'event_id', audit.event_id,
              'action', audit.action,
              'actor_player_id', audit.actor_player_id,
              'operation_request_id', audit.operation_request_id,
              'request_payload_hash', audit.request_payload_hash,
              'created_at', audit.created_at
            ) order by audit.created_at, audit.event_id
          ), '[]'::jsonb)
          from scoring_authority.handicap_audit_events audit
          where audit.revision_id = revision.revision_id
        )
      ) as row_value
    from scoring_authority.handicap_revisions revision
    where revision.tournament_id = '2026'
    order by revision.revision_number desc
    limit limit_value
  ) history;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'HANDICAP_REVISION_HISTORY',
    'revisions', history_value
  );
end;
$$;

create trigger handicap_revision_entries_immutable
before update or delete on scoring_authority.handicap_revision_entries
for each row execute function production_control.reject_handicap_immutable_change();

create trigger handicap_operation_receipts_immutable
before update or delete on scoring_authority.handicap_operation_receipts
for each row execute function production_control.reject_handicap_immutable_change();

create trigger handicap_audit_events_immutable
before update or delete on scoring_authority.handicap_audit_events
for each row execute function production_control.reject_handicap_immutable_change();

create trigger handicap_match_refresh_events_immutable
before update or delete on scoring_authority.handicap_match_refresh_events
for each row execute function production_control.reject_handicap_immutable_change();

create or replace function production_control.handicap_v1_hash(value jsonb)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, production_control, extensions
as $$
  select pg_catalog.encode(extensions.digest(value::text, 'sha256'), 'hex')
$$;

create or replace function production_control.handicap_v1_json_decimal(value jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, production_control
as $$
  select value is not null
    and (
      (pg_catalog.jsonb_typeof(value) = 'number'
        and value::text ~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$')
      or
      (pg_catalog.jsonb_typeof(value) = 'string'
        and value#>>'{}' ~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$')
    )
$$;

create or replace function production_control.handicap_v1_roster_fingerprint(
  target_tournament text
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
  select production_control.handicap_v1_hash(
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'player_id', roster.player_id,
          'team_id', roster.team_id,
          'team_side', roster.team_side,
          'participation_status', roster.participation_status
        ) order by roster.player_id
      ),
      '[]'::jsonb
    )
  )
  from scoring_authority.tournament_players roster
  where roster.tournament_id = target_tournament
    and roster.participation_status = 'ACTIVE'
$$;

create or replace function production_control.assert_production_handicap_runtime()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
begin
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';

  if resource.current_tournament_id <> '2026'
     or resource.current_tournament_read_authority <> 'SUPABASE'
     or resource.scoring_authority <> 'SUPABASE'
     or resource.participant_identity_authority <> 'SUPABASE'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or activation.current_authority <> 'SUPABASE'
     or activation.maintenance_state <> 'NORMAL'
     or not activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or gate.authority <> 'SUPABASE'
     or gate.state <> 'OPEN'
     or gate.active_epoch_id is distinct from activation.authority_generation_id
     or gate.unresolved_client_queues <> 0
     or not exists (
       select 1 from scoring_authority.tournaments value
       where value.tournament_id = '2026'
         and value.tournament_year = 2026
         and value.scoring_authority = 'SUPABASE'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_HANDICAP_RUNTIME_NOT_SAFE';
  end if;
end;
$$;

create or replace function production_control.handicap_v1_match_is_unstarted(
  target_match_id text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
  select coalesce((
    select value.status = 'UPCOMING'
      and value.scoring_locked is false
      and value.scored_holes = 0
      and value.current_hole = 0
      and value.holes_remaining = 18
      and value.team_1_holes_won = 0
      and value.team_2_holes_won = 0
      and value.running_result = 'Scheduled'
      and value.result_winner = ''
      and value.clinched is false
      and value.scorecard_complete is false
      and value.unresolved_mutations = 0
      and value.finalized_at is null
      and not exists (
        select 1 from scoring_authority.hole_scores score
        where score.match_id = value.match_id
      )
      and not exists (
        select 1 from scoring_authority.score_mutations mutation
        where mutation.match_id = value.match_id
          and mutation.mutation_type in (
            'HOLE_SCORE', 'FINALIZE', 'REOPEN', 'MARK_LIVE'
          )
      )
    from scoring_authority.matches value
    where value.match_id = target_match_id
      and value.tournament_id = '2026'
  ), false)
$$;

-- Adopt only a complete set of exact imported source decimals.  Invalid or
-- incomplete legacy facts leave the capability uninitialized rather than
-- guessing, rounding, or failing installation.
update scoring_authority.tournament_players roster
set tournament_handicap = case
  when pg_catalog.jsonb_typeof(
    roster.source_payload->'Tournament Handicap'
  ) = 'number'
    then (roster.source_payload->>'Tournament Handicap')::numeric
  when pg_catalog.jsonb_typeof(
    roster.source_payload->'Tournament Handicap'
  ) = 'string'
    and roster.source_payload->>'Tournament Handicap'
      ~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$'
    then (roster.source_payload->>'Tournament Handicap')::numeric
  else null
end
where roster.tournament_id = '2026'
  and roster.participation_status = 'ACTIVE';

do $bootstrap$
declare
  active_count integer;
  complete_count integer;
  bootstrap_revision_id uuid;
  bootstrap_effective_date date;
  roster_hash text;
  entries_value jsonb;
  canonical_value jsonb;
  canonical_hash text;
begin
  select pg_catalog.count(*), pg_catalog.count(tournament_handicap)
    into active_count, complete_count
  from scoring_authority.tournament_players
  where tournament_id = '2026' and participation_status = 'ACTIVE';

  if active_count = 0 or complete_count <> active_count then return; end if;

  select coalesce(value.imported_at::date, current_date)
    into strict bootstrap_effective_date
  from scoring_authority.tournaments value
  where value.tournament_id = '2026';
  roster_hash := production_control.handicap_v1_roster_fingerprint('2026');
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'player_id', roster.player_id,
      'tournament_handicap',
        pg_catalog.trim_scale(roster.tournament_handicap),
      'source_index', null,
      'low_index', null,
      'source_metadata', '{}'::jsonb
    ) order by roster.player_id
  ) into entries_value
  from scoring_authority.tournament_players roster
  where roster.tournament_id = '2026'
    and roster.participation_status = 'ACTIVE';

  canonical_value := pg_catalog.jsonb_build_object(
    'contract_version', 'production-handicap-revision-v1',
    'context_contract_version', 'production-handicap-context-v1',
    'tournament_id', '2026',
    'effective_date', bootstrap_effective_date,
    'method', 'LEGACY_PRODUCTION_CURRENT_SHADOW_ADOPTION',
    'source_metadata', pg_catalog.jsonb_build_object(
      'authority', 'SUPABASE',
      'legacySource', 'tournament_players.source_payload',
      'sourceWorkbookId',
        '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
    ),
    'source_evidence_date', null,
    'predecessor_revision', 0,
    'roster_fingerprint', roster_hash,
    'entries', entries_value
  );
  canonical_hash := production_control.handicap_v1_hash(canonical_value);

  insert into scoring_authority.handicap_revisions (
    tournament_id, revision_number, status, effective_date, method,
    source_metadata, source_evidence_date, canonical_fingerprint,
    roster_fingerprint, predecessor_revision, predecessor_revision_id,
    context_contract_version, created_by, created_at, approved_by,
    approved_at
  ) values (
    '2026', 1, 'APPROVED', bootstrap_effective_date,
    'LEGACY_PRODUCTION_CURRENT_SHADOW_ADOPTION',
    canonical_value->'source_metadata', null, canonical_hash, roster_hash,
    0, null, 'production-handicap-context-v1',
    'SYSTEM:PRODUCTION_CURRENT_SHADOW', pg_catalog.clock_timestamp(),
    'SYSTEM:PRODUCTION_CURRENT_SHADOW', pg_catalog.clock_timestamp()
  ) returning revision_id into bootstrap_revision_id;

  insert into scoring_authority.handicap_revision_entries (
    revision_id, tournament_id, player_id, tournament_handicap,
    source_index, low_index, source_metadata
  )
  select bootstrap_revision_id, '2026', roster.player_id,
    roster.tournament_handicap, null, null, '{}'::jsonb
  from scoring_authority.tournament_players roster
  where roster.tournament_id = '2026'
    and roster.participation_status = 'ACTIVE'
  order by roster.player_id;

  insert into scoring_authority.handicap_revision_current (
    tournament_id, revision_id, revision_number
  ) values ('2026', bootstrap_revision_id, 1);

  update scoring_authority.tournament_players
  set handicap_revision_id = bootstrap_revision_id
  where tournament_id = '2026' and participation_status = 'ACTIVE';

  insert into scoring_authority.handicap_audit_events (
    tournament_id, revision_id, action, actor_player_id,
    canonical_fingerprint, before_state, after_state
  ) values (
    '2026', bootstrap_revision_id, 'INITIAL_REVISION_ADOPTED',
    'SYSTEM:PRODUCTION_CURRENT_SHADOW', canonical_hash,
    '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'revision_number', 1,
      'status', 'APPROVED',
      'entry_count', active_count,
      'tournament_facts_changed', false,
      'match_contexts_changed', false
    )
  );
end;
$bootstrap$;

create or replace function production_control.handicap_v1_stored_entries(
  target_revision_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'player_id', entry.player_id,
        'tournament_handicap',
          pg_catalog.trim_scale(entry.tournament_handicap),
        'source_index', case when entry.source_index is null then null
          else pg_catalog.trim_scale(entry.source_index) end,
        'low_index', case when entry.low_index is null then null
          else pg_catalog.trim_scale(entry.low_index) end,
        'source_metadata', entry.source_metadata
      ) order by entry.player_id
    ),
    '[]'::jsonb
  )
  from scoring_authority.handicap_revision_entries entry
  where entry.revision_id = target_revision_id
$$;

create or replace function production_control.handicap_v1_revision_fingerprint(
  target_revision_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
  select production_control.handicap_v1_hash(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-handicap-revision-v1',
      'context_contract_version', revision.context_contract_version,
      'tournament_id', revision.tournament_id,
      'effective_date', revision.effective_date,
      'method', revision.method,
      'source_metadata', revision.source_metadata,
      'source_evidence_date', revision.source_evidence_date,
      'predecessor_revision', revision.predecessor_revision,
      'roster_fingerprint', revision.roster_fingerprint,
      'entries', production_control.handicap_v1_stored_entries(
        revision.revision_id
      )
    )
  )
  from scoring_authority.handicap_revisions revision
  where revision.revision_id = target_revision_id
$$;

create or replace function production_control.handicap_v1_match_context(
  target_match_id text,
  target_revision_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  match_value scoring_authority.matches%rowtype;
  snapshot_value scoring_authority.scoring_snapshots%rowtype;
  computed_entries jsonb;
  next_participant_configuration jsonb;
  next_team_configuration jsonb;
  team_1_playing numeric;
  team_2_playing numeric;
  team_1_strokes integer;
  team_2_strokes integer;
begin
  select value.* into strict match_value
  from scoring_authority.matches value
  where value.match_id = target_match_id and value.tournament_id = '2026';
  select value.* into strict snapshot_value
  from scoring_authority.scoring_snapshots value
  where value.snapshot_id = match_value.scoring_snapshot_id
    and value.match_id = match_value.match_id
    and value.tournament_id = match_value.tournament_id;

  with course_values as (
    select participant.match_id, participant.player_id,
      participant.team_side, participant.player_slot,
      entry.tournament_handicap,
      entry.tournament_handicap
        * (snapshot_value.slope::numeric / 113::numeric)
        + (snapshot_value.rating - snapshot_value.par::numeric)
        as course_handicap
    from scoring_authority.match_participants participant
    join scoring_authority.handicap_revision_entries entry
      on entry.revision_id = target_revision_id
     and entry.tournament_id = '2026'
     and entry.player_id = participant.player_id
    where participant.match_id = target_match_id
  ), calculated as (
    select course.*,
      case match_value.format
        when 'SC' then 0::numeric
        else pg_catalog.round(course.course_handicap, 0)
      end as playing_handicap,
      case match_value.format
        when 'BB' then pg_catalog.round(
          (course.course_handicap
            - pg_catalog.min(course.course_handicap) over ()) * 0.9,
          0
        )::integer
        when 'SI' then pg_catalog.round(
          course.course_handicap
            - pg_catalog.min(course.course_handicap) over (),
          0
        )::integer
        else 0::integer
      end as final_strokes
    from course_values course
  )
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'match_id', calculated.match_id,
      'player_id', calculated.player_id,
      'team_side', calculated.team_side,
      'player_slot', calculated.player_slot,
      'tournament_handicap', calculated.tournament_handicap,
      'handicap_index', calculated.tournament_handicap,
      'course_handicap', calculated.course_handicap,
      'playing_handicap', calculated.playing_handicap,
      'final_strokes', calculated.final_strokes
    ) order by calculated.team_side, calculated.player_slot
  ) into strict computed_entries
  from calculated;

  select pg_catalog.jsonb_build_object(
    'team_1', coalesce(pg_catalog.jsonb_agg(
      coalesce((
        select original.value
        from pg_catalog.jsonb_array_elements(coalesce(
          snapshot_value.participant_configuration->'team_1', '[]'::jsonb
        )) original(value)
        where original.value->>'id' = calculated.value->>'player_id'
        limit 1
      ), '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'id', calculated.value->>'player_id',
        'team', 1,
        'slot', (calculated.value->>'player_slot')::integer,
        'handicap_index', (calculated.value->>'handicap_index')::numeric,
        'course_handicap', (calculated.value->>'course_handicap')::numeric,
        'playing_handicap', (calculated.value->>'playing_handicap')::numeric,
        'final_strokes', (calculated.value->>'final_strokes')::integer,
        'tournament_handicap',
          (calculated.value->>'tournament_handicap')::numeric,
        'handicap_revision_id', target_revision_id
      ) order by (calculated.value->>'player_slot')::integer
    ) filter (where (calculated.value->>'team_side')::integer = 1),
      '[]'::jsonb),
    'team_2', coalesce(pg_catalog.jsonb_agg(
      coalesce((
        select original.value
        from pg_catalog.jsonb_array_elements(coalesce(
          snapshot_value.participant_configuration->'team_2', '[]'::jsonb
        )) original(value)
        where original.value->>'id' = calculated.value->>'player_id'
        limit 1
      ), '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'id', calculated.value->>'player_id',
        'team', 2,
        'slot', (calculated.value->>'player_slot')::integer,
        'handicap_index', (calculated.value->>'handicap_index')::numeric,
        'course_handicap', (calculated.value->>'course_handicap')::numeric,
        'playing_handicap', (calculated.value->>'playing_handicap')::numeric,
        'final_strokes', (calculated.value->>'final_strokes')::integer,
        'tournament_handicap',
          (calculated.value->>'tournament_handicap')::numeric,
        'handicap_revision_id', target_revision_id
      ) order by (calculated.value->>'player_slot')::integer
    ) filter (where (calculated.value->>'team_side')::integer = 2),
      '[]'::jsonb),
    'all_ids', pg_catalog.jsonb_agg(
      calculated.value->>'player_id'
      order by (calculated.value->>'team_side')::integer,
        (calculated.value->>'player_slot')::integer
    ),
    'handicap_revision_id', target_revision_id,
    'handicap_context_contract', 'production-handicap-context-v1'
  ) into next_participant_configuration
  from pg_catalog.jsonb_array_elements(computed_entries) calculated(value);

  if match_value.format = 'SC' then
    select pg_catalog.round(
      pg_catalog.min((value->>'course_handicap')::numeric) * 0.35
        + pg_catalog.max((value->>'course_handicap')::numeric) * 0.15,
      0
    ) into team_1_playing
    from pg_catalog.jsonb_array_elements(computed_entries) calculated(value)
    where (value->>'team_side')::integer = 1;
    select pg_catalog.round(
      pg_catalog.min((value->>'course_handicap')::numeric) * 0.35
        + pg_catalog.max((value->>'course_handicap')::numeric) * 0.15,
      0
    ) into team_2_playing
    from pg_catalog.jsonb_array_elements(computed_entries) calculated(value)
    where (value->>'team_side')::integer = 2;
    team_1_strokes := (team_1_playing
      - least(team_1_playing, team_2_playing))::integer;
    team_2_strokes := (team_2_playing
      - least(team_1_playing, team_2_playing))::integer;
  else
    select pg_catalog.max((value->>'playing_handicap')::numeric),
      pg_catalog.max((value->>'final_strokes')::integer)
      into team_1_playing, team_1_strokes
    from pg_catalog.jsonb_array_elements(computed_entries) calculated(value)
    where (value->>'team_side')::integer = 1;
    select pg_catalog.max((value->>'playing_handicap')::numeric),
      pg_catalog.max((value->>'final_strokes')::integer)
      into team_2_playing, team_2_strokes
    from pg_catalog.jsonb_array_elements(computed_entries) calculated(value)
    where (value->>'team_side')::integer = 2;
  end if;

  next_team_configuration := snapshot_value.team_configuration
    || pg_catalog.jsonb_build_object(
      'team_1_handicap', team_1_playing,
      'team_2_handicap', team_2_playing,
      'team_1_playing_handicap', team_1_playing,
      'team_2_playing_handicap', team_2_playing,
      'team_1_strokes', team_1_strokes,
      'team_2_strokes', team_2_strokes,
      'handicap_revision_id', target_revision_id,
      'handicap_context_contract', 'production-handicap-context-v1'
    );

  return pg_catalog.jsonb_build_object(
    'participants', computed_entries,
    'participant_configuration', next_participant_configuration,
    'team_configuration', next_team_configuration,
    'team_1_playing_handicap', team_1_playing,
    'team_2_playing_handicap', team_2_playing,
    'team_1_strokes', team_1_strokes,
    'team_2_strokes', team_2_strokes
  );
exception
  when no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_HANDICAP_CONTEXT_INCOMPLETE';
end;
$$;

create or replace function production_control.validate_handicap_revision_v1(
  target_revision_id uuid,
  expected_predecessor bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  revision scoring_authority.handicap_revisions%rowtype;
  current_revision bigint := 0;
  active_count integer;
  entry_count integer;
  changed_players jsonb := '[]'::jsonb;
  unstarted_matches jsonb := '[]'::jsonb;
  started_matches jsonb := '[]'::jsonb;
  context_issues jsonb := '[]'::jsonb;
  issues jsonb := '[]'::jsonb;
  changed_count integer := 0;
  current_roster_hash text;
  actual_fingerprint text;
begin
  select value.* into revision
  from scoring_authority.handicap_revisions value
  where value.revision_id = target_revision_id
    and value.tournament_id = '2026';
  if not found then
    return pg_catalog.jsonb_build_object(
      'valid', false, 'code', 'HANDICAP_REVISION_NOT_FOUND',
      'changed_players', '[]'::jsonb,
      'unstarted_matches', '[]'::jsonb,
      'started_frozen_matches', '[]'::jsonb,
      'issues', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'code', 'HANDICAP_REVISION_NOT_FOUND',
        'message', 'The staged handicap revision does not exist.'
      )),
      'summary', pg_catalog.jsonb_build_object(
        'active_roster_count', 0, 'entry_count', 0,
        'changed_player_count', 0, 'unstarted_refresh_count', 0,
        'started_preserved_count', 0
      )
    );
  end if;

  select coalesce(value.revision_number, 0)
    into current_revision
  from scoring_authority.handicap_revision_current pointer
  join scoring_authority.handicap_revisions value
    on value.revision_id = pointer.revision_id
  where pointer.tournament_id = '2026';
  current_revision := coalesce(current_revision, 0);
  select pg_catalog.count(*) into active_count
  from scoring_authority.tournament_players value
  where value.tournament_id = '2026'
    and value.participation_status = 'ACTIVE';
  select pg_catalog.count(*) into entry_count
  from scoring_authority.handicap_revision_entries value
  where value.revision_id = target_revision_id;
  current_roster_hash :=
    production_control.handicap_v1_roster_fingerprint('2026');
  actual_fingerprint :=
    production_control.handicap_v1_revision_fingerprint(target_revision_id);

  if revision.status <> 'DRAFT' then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'HANDICAP_REVISION_NOT_DRAFT',
        'message', 'Only a draft handicap revision can be approved.'
      )
    );
  end if;
  if revision.predecessor_revision <> expected_predecessor
     or current_revision <> expected_predecessor then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'HANDICAP_PREDECESSOR_STALE',
        'message', 'The approved handicap predecessor changed.',
        'expected_predecessor_revision', expected_predecessor,
        'staged_predecessor_revision', revision.predecessor_revision,
        'current_revision', current_revision
      )
    );
  end if;
  if revision.roster_fingerprint <> current_roster_hash
     or active_count <> entry_count
     or exists (
       select 1
       from scoring_authority.tournament_players roster
       left join scoring_authority.handicap_revision_entries entry
         on entry.revision_id = target_revision_id
        and entry.tournament_id = roster.tournament_id
        and entry.player_id = roster.player_id
       where roster.tournament_id = '2026'
         and roster.participation_status = 'ACTIVE'
         and entry.player_id is null
     )
     or exists (
       select 1
       from scoring_authority.handicap_revision_entries entry
       left join scoring_authority.tournament_players roster
         on roster.tournament_id = entry.tournament_id
        and roster.player_id = entry.player_id
        and roster.participation_status = 'ACTIVE'
       where entry.revision_id = target_revision_id
         and roster.player_id is null
     ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'HANDICAP_ROSTER_CHANGED',
        'message', 'The active tournament roster no longer matches the draft.',
        'active_roster_count', active_count,
        'entry_count', entry_count
      )
    );
  end if;
  if actual_fingerprint is distinct from revision.canonical_fingerprint then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'HANDICAP_REVISION_FINGERPRINT_MISMATCH',
        'message', 'The immutable staged payload fingerprint does not match.'
      )
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'player_id', entry.player_id,
      'display_name', player.display_name,
      'old_handicap', roster.tournament_handicap::text,
      'new_handicap', entry.tournament_handicap::text,
      'change', case
        when roster.tournament_handicap is null then null
        else (entry.tournament_handicap - roster.tournament_handicap)::text
      end
    ) order by player.display_name, entry.player_id
  ), '[]'::jsonb), pg_catalog.count(*)
  into changed_players, changed_count
  from scoring_authority.handicap_revision_entries entry
  join scoring_authority.tournament_players roster
    on roster.tournament_id = entry.tournament_id
   and roster.player_id = entry.player_id
  join scoring_authority.players player on player.player_id = entry.player_id
  where entry.revision_id = target_revision_id
    and roster.tournament_handicap is distinct from entry.tournament_handicap;

  if changed_count = 0 then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'HANDICAP_NO_CHANGES',
        'message',
          'The staged roster is identical to the approved handicap revision.'
      )
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'match_id', match_value.match_id,
      'round_number', match_value.round_number,
      'format', match_value.format,
      'status', match_value.status,
      'scoring_locked', match_value.scoring_locked,
      'unresolved_mutations', match_value.unresolved_mutations,
      'affected_player_ids', (
        select pg_catalog.jsonb_agg(participant.player_id order by participant.player_id)
        from scoring_authority.match_participants participant
        join scoring_authority.handicap_revision_entries entry
          on entry.revision_id = target_revision_id
         and entry.player_id = participant.player_id
        join scoring_authority.tournament_players roster
          on roster.tournament_id = '2026'
         and roster.player_id = entry.player_id
        where participant.match_id = match_value.match_id
          and roster.tournament_handicap is distinct from entry.tournament_handicap
      ),
      'refresh_allowed', true
    ) order by match_value.round_number, match_value.match_id
  ), '[]'::jsonb) into unstarted_matches
  from scoring_authority.matches match_value
  where match_value.tournament_id = '2026'
    and production_control.handicap_v1_match_is_unstarted(
      match_value.match_id
    )
    and exists (
      select 1
      from scoring_authority.match_participants participant
      join scoring_authority.handicap_revision_entries entry
        on entry.revision_id = target_revision_id
       and entry.player_id = participant.player_id
      join scoring_authority.tournament_players roster
        on roster.tournament_id = '2026'
       and roster.player_id = entry.player_id
      where participant.match_id = match_value.match_id
        and roster.tournament_handicap is distinct from entry.tournament_handicap
    );

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'match_id', match_value.match_id,
      'round_number', match_value.round_number,
      'format', match_value.format,
      'status', match_value.status,
      'scoring_locked', match_value.scoring_locked,
      'scored_holes', match_value.scored_holes,
      'current_hole', match_value.current_hole,
      'unresolved_mutations', match_value.unresolved_mutations,
      'running_result', match_value.running_result,
      'clinched', match_value.clinched,
      'snapshot_preserved', true,
      'preservation_reason', case
        when match_value.scoring_locked then 'MATCH_SCORING_LOCKED'
        when match_value.unresolved_mutations <> 0
          then 'MATCH_HAS_UNRESOLVED_MUTATIONS'
        when match_value.status <> 'UPCOMING' then 'MATCH_STARTED'
        else 'MATCH_CONTEXT_FROZEN' end,
      'affected_player_ids', (
        select pg_catalog.jsonb_agg(participant.player_id order by participant.player_id)
        from scoring_authority.match_participants participant
        join scoring_authority.handicap_revision_entries entry
          on entry.revision_id = target_revision_id
         and entry.player_id = participant.player_id
        join scoring_authority.tournament_players roster
          on roster.tournament_id = '2026'
         and roster.player_id = entry.player_id
        where participant.match_id = match_value.match_id
          and roster.tournament_handicap is distinct from entry.tournament_handicap
      )
    ) order by match_value.round_number, match_value.match_id
  ), '[]'::jsonb) into started_matches
  from scoring_authority.matches match_value
  where match_value.tournament_id = '2026'
    and not production_control.handicap_v1_match_is_unstarted(
      match_value.match_id
    )
    and exists (
      select 1
      from scoring_authority.match_participants participant
      join scoring_authority.handicap_revision_entries entry
        on entry.revision_id = target_revision_id
       and entry.player_id = participant.player_id
      join scoring_authority.tournament_players roster
        on roster.tournament_id = '2026'
       and roster.player_id = entry.player_id
      where participant.match_id = match_value.match_id
        and roster.tournament_handicap is distinct from entry.tournament_handicap
    );

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'code', 'HANDICAP_MATCH_CONTEXT_INCOMPLETE',
      'message', 'An unstarted match lacks complete certified handicap context.',
      'match_id', candidate.match_id
    ) order by candidate.match_id
  ), '[]'::jsonb) into context_issues
  from (
    select match_value.match_id
    from scoring_authority.matches match_value
    left join scoring_authority.scoring_snapshots snapshot
      on snapshot.snapshot_id = match_value.scoring_snapshot_id
     and snapshot.match_id = match_value.match_id
     and snapshot.tournament_id = match_value.tournament_id
    where match_value.tournament_id = '2026'
      and production_control.handicap_v1_match_is_unstarted(
        match_value.match_id
      )
      and exists (
        select 1
        from scoring_authority.match_participants affected
        join scoring_authority.handicap_revision_entries entry
          on entry.revision_id = target_revision_id
         and entry.player_id = affected.player_id
        join scoring_authority.tournament_players roster
          on roster.tournament_id = '2026'
         and roster.player_id = entry.player_id
        where affected.match_id = match_value.match_id
          and roster.tournament_handicap is distinct from entry.tournament_handicap
      )
      and (
        snapshot.snapshot_id is null
        or snapshot.rating is null
        or snapshot.slope is null
        or snapshot.slope <= 0
        or snapshot.par is null
        or snapshot.format is distinct from match_value.format
        or match_value.format not in ('BB', 'SC', 'SI')
        or (select pg_catalog.count(*)
            from scoring_authority.match_participants participant
            where participant.match_id = match_value.match_id)
          <> case when match_value.format = 'SI' then 2 else 4 end
        or exists (
          select 1
          from pg_catalog.generate_series(1, 2) side(team_side)
          where (select pg_catalog.count(*)
            from scoring_authority.match_participants participant
            where participant.match_id = match_value.match_id
              and participant.team_side = side.team_side)
            <> case when match_value.format = 'SI' then 1 else 2 end
        )
        or exists (
          select 1
          from scoring_authority.match_participants participant
          left join scoring_authority.handicap_revision_entries entry
            on entry.revision_id = target_revision_id
           and entry.player_id = participant.player_id
          left join scoring_authority.tournament_players roster
            on roster.tournament_id = '2026'
           and roster.player_id = participant.player_id
           and roster.participation_status = 'ACTIVE'
          where participant.match_id = match_value.match_id
            and (entry.player_id is null or roster.player_id is null)
        )
      )
  ) candidate;
  issues := issues || context_issues;

  return pg_catalog.jsonb_build_object(
    'valid', pg_catalog.jsonb_array_length(issues) = 0,
    'code', case when pg_catalog.jsonb_array_length(issues) = 0
      then 'HANDICAP_REVISION_VALID'
      when issues @> '[{"code":"HANDICAP_PREDECESSOR_STALE"}]'::jsonb
        then 'HANDICAP_PREDECESSOR_STALE'
      when issues @> '[{"code":"HANDICAP_ROSTER_CHANGED"}]'::jsonb
        then 'HANDICAP_ROSTER_CHANGED'
      when issues @> '[{"code":"HANDICAP_NO_CHANGES"}]'::jsonb
        then 'HANDICAP_NO_CHANGES'
      else 'HANDICAP_CORRECTION_REQUIRED' end,
    'revision_id', revision.revision_id,
    'revision_number', revision.revision_number,
    'status', revision.status,
    'expected_predecessor_revision', expected_predecessor,
    'current_revision', current_revision,
    'canonical_fingerprint', revision.canonical_fingerprint,
    'changed_players', changed_players,
    'unstarted_matches', unstarted_matches,
    'started_frozen_matches', started_matches,
    'issues', issues,
    'summary', pg_catalog.jsonb_build_object(
      'active_roster_count', active_count,
      'entry_count', entry_count,
      'changed_player_count', changed_count,
      'unstarted_refresh_count', pg_catalog.jsonb_array_length(unstarted_matches),
      'started_preserved_count', pg_catalog.jsonb_array_length(started_matches)
    )
  );
end;
$$;

revoke all on function
  public.stage_production_handicap_revision_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.validate_production_handicap_revision_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.approve_production_handicap_revision_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.read_production_handicap_revision_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.read_production_handicap_revision_history_v1(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function
  public.stage_production_handicap_revision_v1(jsonb) to service_role;
grant execute on function
  public.validate_production_handicap_revision_v1(jsonb) to service_role;
grant execute on function
  public.approve_production_handicap_revision_v1(jsonb) to service_role;
grant execute on function
  public.read_production_handicap_revision_v1(jsonb) to service_role;
grant execute on function
  public.read_production_handicap_revision_history_v1(jsonb) to service_role;

revoke all on table scoring_authority.handicap_revisions
  from public, anon, authenticated, service_role;
revoke all on table scoring_authority.handicap_revision_entries
  from public, anon, authenticated, service_role;
revoke all on table scoring_authority.handicap_revision_current
  from public, anon, authenticated, service_role;
revoke all on table scoring_authority.handicap_operation_receipts
  from public, anon, authenticated, service_role;
revoke all on table scoring_authority.handicap_audit_events
  from public, anon, authenticated, service_role;
revoke all on table scoring_authority.handicap_match_refresh_events
  from public, anon, authenticated, service_role;

revoke all on function production_control.handicap_v1_hash(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function production_control.handicap_v1_json_decimal(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.handicap_v1_roster_fingerprint(text)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_production_handicap_runtime()
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.handicap_v1_match_is_unstarted(text)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.handicap_v1_stored_entries(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.handicap_v1_revision_fingerprint(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.handicap_v1_match_context(text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.validate_handicap_revision_v1(uuid,bigint)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.reject_handicap_immutable_change()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
