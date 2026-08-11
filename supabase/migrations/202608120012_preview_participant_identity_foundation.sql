-- Phase A participant identity foundation.
-- This migration does not enable Supabase Auth, create auth.users, grant
-- participant access, or change either scoring or participant identity authority.

create extension if not exists pgcrypto;

create schema if not exists participant_identity;
revoke all on schema participant_identity from public, anon, authenticated;

create table participant_identity.participant_identity_contacts (
  tournament_id text not null,
  player_id text not null,
  email text not null,
  email_normalized text not null,
  identity_active boolean not null default true,
  configuration_revision bigint not null check (configuration_revision > 0),
  verified_by text,
  verified_at timestamptz,
  source_system text not null,
  source_workbook_id text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, player_id),
  foreign key (tournament_id, player_id)
    references scoring_authority.tournament_players (tournament_id, player_id),
  check (email = btrim(email)),
  check (email_normalized = lower(btrim(email_normalized))),
  check (email_normalized ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'::text collate "C")
);

create unique index participant_identity_active_email_idx
  on participant_identity.participant_identity_contacts (tournament_id, email_normalized)
  where identity_active;
create index participant_identity_contacts_player_idx
  on participant_identity.participant_identity_contacts (player_id, identity_active);

create table participant_identity.user_player_links (
  link_id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  player_id text not null references scoring_authority.players (player_id) on delete restrict,
  status text not null check (status in ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED')),
  link_revision bigint not null default 1 check (link_revision > 0),
  link_method text not null,
  email_identity_hash text not null check (email_identity_hash ~ '^[0-9a-f]{64}$'),
  linked_at timestamptz,
  linked_by text,
  revoked_at timestamptz,
  revoked_by text,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auth_user_id)
);

create unique index participant_identity_current_player_link_idx
  on participant_identity.user_player_links (player_id)
  where status in ('PENDING', 'ACTIVE', 'SUSPENDED');
create index participant_identity_links_status_idx
  on participant_identity.user_player_links (status, player_id);

create table participant_identity.tournament_roles (
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  role text not null check (role in ('PARTICIPANT', 'CAPTAIN', 'DIRECTOR', 'IDENTITY_ADMIN')),
  role_active boolean not null default true,
  role_revision bigint not null default 1 check (role_revision > 0),
  granted_at timestamptz not null default now(),
  granted_by text not null,
  revoked_at timestamptz,
  revoked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, auth_user_id, role)
);

create index participant_identity_tournament_roles_active_idx
  on participant_identity.tournament_roles (tournament_id, role, role_active);

create table participant_identity.identity_config_import_runs (
  run_id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  source_system text not null,
  source_workbook_id text,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  configuration_revision bigint not null check (configuration_revision > 0),
  status text not null check (status in ('APPLIED', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED')),
  roster_count integer not null default 0,
  received_count integer not null default 0,
  valid_count integer not null default 0,
  missing_count integer not null default 0,
  duplicate_count integer not null default 0,
  malformed_count integer not null default 0,
  shared_count integer not null default 0,
  inactive_count integer not null default 0,
  unknown_player_count integer not null default 0,
  mapping_conflict_count integer not null default 0,
  validation_report jsonb not null default '{}'::jsonb,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index participant_identity_import_runs_tournament_idx
  on participant_identity.identity_config_import_runs (tournament_id, requested_at desc);
create unique index participant_identity_approved_fingerprint_idx
  on participant_identity.identity_config_import_runs (tournament_id, source_fingerprint)
  where approved_at is not null;

create table participant_identity.identity_context_revisions (
  tournament_id text primary key references scoring_authority.tournaments (tournament_id) on delete cascade,
  context_revision bigint not null default 1 check (context_revision > 0),
  configuration_fingerprint text,
  updated_at timestamptz not null default now(),
  updated_by text not null
);

create table participant_identity.participant_identity_shadow_observations (
  observation_id uuid primary key default gen_random_uuid(),
  request_id text not null,
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  auth_user_id uuid references auth.users (id) on delete set null,
  passport_player_id text,
  linked_player_id text,
  passport_team_id text,
  linked_team_id text,
  passport_membership_active boolean,
  linked_membership_active boolean,
  passport_match_ids jsonb not null default '[]'::jsonb,
  linked_match_ids jsonb not null default '[]'::jsonb,
  passport_scoring_permissions jsonb not null default '{}'::jsonb,
  linked_scoring_permissions jsonb not null default '{}'::jsonb,
  comparison_status text not null check (comparison_status in ('PASS', 'MISMATCH', 'UNAVAILABLE', 'NOT_RUN')),
  comparison_diagnostics jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (request_id)
);

create index participant_identity_shadow_tournament_idx
  on participant_identity.participant_identity_shadow_observations (tournament_id, observed_at desc);

create table participant_identity.identity_audit_events (
  event_id uuid primary key default gen_random_uuid(),
  event_type text not null,
  tournament_id text references scoring_authority.tournaments (tournament_id) on delete set null,
  auth_user_id uuid references auth.users (id) on delete set null,
  player_id text references scoring_authority.players (player_id) on delete set null,
  actor_id text,
  actor_name text,
  request_id text,
  reason_code text,
  link_revision bigint,
  configuration_revision bigint,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index participant_identity_audit_tournament_idx
  on participant_identity.identity_audit_events (tournament_id, occurred_at desc);
create index participant_identity_audit_player_idx
  on participant_identity.identity_audit_events (player_id, occurred_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'participant_identity_contacts', 'user_player_links', 'tournament_roles',
    'identity_config_import_runs', 'identity_context_revisions',
    'participant_identity_shadow_observations', 'identity_audit_events'
  ] loop
    execute format('alter table participant_identity.%I enable row level security', table_name);
  end loop;
end $$;

revoke all on all tables in schema participant_identity from public, anon, authenticated;
revoke all on all sequences in schema participant_identity from public, anon, authenticated;

create or replace function public.import_participant_identity_configuration(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  source_system_value text := btrim(coalesce(input->>'source_system', 'GOOGLE_PREVIEW'));
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  source_fingerprint_value text := lower(btrim(coalesce(input->>'source_fingerprint', '')));
  requested_by_value text := btrim(coalesce(input->>'requested_by', ''));
  contacts jsonb := coalesce(input->'contacts', '[]'::jsonb);
  run uuid := gen_random_uuid();
  next_revision bigint;
  roster_count_value integer;
  received_count_value integer;
  valid_count_value integer;
  missing_count_value integer;
  duplicate_count_value integer;
  malformed_count_value integer;
  inactive_count_value integer;
  unknown_count_value integer;
  mapping_conflict_value integer;
  status_value text;
  report jsonb;
begin
  if target_tournament = '' or requested_by_value = '' then
    raise exception 'Tournament and Director identity are required.';
  end if;
  if jsonb_typeof(contacts) <> 'array' then raise exception 'Identity contacts must be an array.'; end if;
  if source_fingerprint_value !~ '^[0-9a-f]{64}$' then raise exception 'A canonical SHA-256 source fingerprint is required.'; end if;
  if not exists (select 1 from scoring_authority.tournaments where tournament_id = target_tournament) then
    raise exception 'Unknown tournament.';
  end if;

  select count(*) into roster_count_value
  from scoring_authority.tournament_players
  where tournament_id = target_tournament and participation_status = 'ACTIVE';
  received_count_value := jsonb_array_length(contacts);

  with rows as (
    select btrim(value->>'player_id') player_id,
      lower(btrim(value->>'email_normalized')) email_normalized,
      coalesce((value->>'identity_active')::boolean, false) identity_active
    from jsonb_array_elements(contacts)
  )
  select
    count(*) filter (where email_normalized !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'::text collate "C"),
    count(*) filter (where not identity_active),
    count(*) filter (where not exists (
      select 1 from scoring_authority.tournament_players tp
      where tp.tournament_id = target_tournament and tp.player_id = rows.player_id and tp.participation_status = 'ACTIVE'
    ))
  into malformed_count_value, inactive_count_value, unknown_count_value
  from rows;

  with rows as (
    select lower(btrim(value->>'email_normalized')) email_normalized
    from jsonb_array_elements(contacts)
    where coalesce((value->>'identity_active')::boolean, false)
  ), duplicates as (
    select email_normalized, count(*) total from rows group by email_normalized having count(*) > 1
  )
  select coalesce(sum(total - 1), 0)::integer into duplicate_count_value from duplicates;

  with supplied as (
    select distinct btrim(value->>'player_id') player_id
    from jsonb_array_elements(contacts)
    where coalesce((value->>'identity_active')::boolean, false)
      and lower(btrim(value->>'email_normalized')) ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'::text collate "C"
  )
  select count(*) into missing_count_value
  from scoring_authority.tournament_players tp
  where tp.tournament_id = target_tournament and tp.participation_status = 'ACTIVE'
    and not exists (select 1 from supplied where supplied.player_id = tp.player_id);

  with rows as (
    select btrim(value->>'player_id') player_id,
      lower(btrim(value->>'email_normalized')) email_normalized,
      coalesce((value->>'identity_active')::boolean, false) identity_active
    from jsonb_array_elements(contacts)
  )
  select count(*) into mapping_conflict_value
  from rows
  join participant_identity.user_player_links links on links.player_id = rows.player_id
    and links.status in ('PENDING', 'ACTIVE', 'SUSPENDED')
  where rows.identity_active
    and links.email_identity_hash <> encode(digest(rows.email_normalized, 'sha256'), 'hex');

  valid_count_value := greatest(0, received_count_value - malformed_count_value - inactive_count_value - unknown_count_value - duplicate_count_value);
  status_value := case when roster_count_value > 0 and received_count_value = roster_count_value
      and missing_count_value = 0 and duplicate_count_value = 0 and malformed_count_value = 0
      and inactive_count_value = 0 and unknown_count_value = 0 and mapping_conflict_value = 0
    then 'APPLIED' else 'REVIEW_REQUIRED' end;
  select coalesce(max(configuration_revision), 0) + 1 into next_revision
    from participant_identity.participant_identity_contacts where tournament_id = target_tournament;

  report := jsonb_build_object(
    'activePlayers', roster_count_value, 'playersWithEmail', valid_count_value,
    'missingEmail', missing_count_value, 'duplicateEmail', duplicate_count_value,
    'malformedEmail', malformed_count_value, 'sharedEmail', duplicate_count_value,
    'inactiveIdentityRecords', inactive_count_value, 'unknownPlayerIds', unknown_count_value,
    'mappingConflicts', mapping_conflict_value, 'pass', status_value = 'APPLIED'
  );

  insert into participant_identity.identity_config_import_runs (
    run_id, tournament_id, source_system, source_workbook_id, source_fingerprint,
    configuration_revision, status, roster_count, received_count, valid_count,
    missing_count, duplicate_count, malformed_count, shared_count, inactive_count,
    unknown_player_count, mapping_conflict_count, validation_report, requested_by
  ) values (
    run, target_tournament, source_system_value, nullif(source_workbook, ''), source_fingerprint_value,
    next_revision, status_value, roster_count_value, received_count_value, valid_count_value,
    missing_count_value, duplicate_count_value, malformed_count_value, duplicate_count_value, inactive_count_value,
    unknown_count_value, mapping_conflict_value, report, requested_by_value
  );

  if status_value = 'APPLIED' then
    insert into participant_identity.participant_identity_contacts (
      tournament_id, player_id, email, email_normalized, identity_active,
      configuration_revision, verified_by, verified_at, source_system,
      source_workbook_id, source_updated_at, updated_at
    )
    select target_tournament, btrim(value->>'player_id'), btrim(value->>'email'),
      lower(btrim(value->>'email_normalized')), true, next_revision,
      nullif(btrim(value->>'verified_by'), ''), nullif(value->>'verified_at', '')::timestamptz,
      source_system_value, nullif(source_workbook, ''), nullif(value->>'source_updated_at', '')::timestamptz, now()
    from jsonb_array_elements(contacts)
    on conflict (tournament_id, player_id) do update set
      email = excluded.email, email_normalized = excluded.email_normalized,
      identity_active = excluded.identity_active, configuration_revision = excluded.configuration_revision,
      verified_by = excluded.verified_by, verified_at = excluded.verified_at,
      source_system = excluded.source_system, source_workbook_id = excluded.source_workbook_id,
      source_updated_at = excluded.source_updated_at, updated_at = now();

    insert into participant_identity.identity_context_revisions (tournament_id, context_revision, configuration_fingerprint, updated_by)
      values (target_tournament, 1, source_fingerprint_value, requested_by_value)
    on conflict (tournament_id) do update set
      context_revision = participant_identity.identity_context_revisions.context_revision + 1,
      configuration_fingerprint = excluded.configuration_fingerprint,
      updated_at = now(), updated_by = excluded.updated_by;
  end if;

  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, actor_name, request_id, configuration_revision, safe_metadata
  ) values (
    'IDENTITY_CONFIG_IMPORT', target_tournament, requested_by_value, run::text, next_revision,
    jsonb_build_object('status', status_value, 'fingerprint', source_fingerprint_value, 'counts', report)
  );

  return jsonb_build_object('ok', true, 'runId', run, 'status', status_value,
    'configurationRevision', next_revision, 'fingerprint', source_fingerprint_value, 'quality', report);
end;
$$;

create or replace function public.approve_participant_identity_configuration(
  run_id uuid, expected_fingerprint text, approved_by_name text
)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare current_run participant_identity.identity_config_import_runs%rowtype;
begin
  select * into current_run from participant_identity.identity_config_import_runs where identity_config_import_runs.run_id = approve_participant_identity_configuration.run_id for update;
  if not found then raise exception 'Identity configuration import was not found.'; end if;
  if current_run.status not in ('APPLIED', 'APPROVED') then raise exception 'Only a complete valid mapping can be approved.'; end if;
  if current_run.source_fingerprint <> lower(btrim(expected_fingerprint)) then raise exception 'Identity configuration changed before approval.'; end if;
  if btrim(coalesce(approved_by_name, '')) = '' then raise exception 'Director identity is required.'; end if;

  update participant_identity.identity_config_import_runs set
    status = 'APPROVED', approved_by = btrim(approved_by_name), approved_at = coalesce(approved_at, now()), updated_at = now()
  where identity_config_import_runs.run_id = approve_participant_identity_configuration.run_id;

  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, actor_name, request_id, configuration_revision, safe_metadata
  ) values (
    'IDENTITY_MAPPING_APPROVED', current_run.tournament_id, btrim(approved_by_name), current_run.run_id::text,
    current_run.configuration_revision, jsonb_build_object('fingerprint', current_run.source_fingerprint)
  );
  return jsonb_build_object('ok', true, 'runId', current_run.run_id, 'status', 'APPROVED',
    'fingerprint', current_run.source_fingerprint, 'approvedBy', btrim(approved_by_name));
end;
$$;

create or replace function public.read_participant_identity_admin(target_tournament_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare target text := nullif(btrim(coalesce(target_tournament_id, '')), '');
declare result jsonb;
begin
  if target is null then
    select tournament_id into target from scoring_authority.tournaments order by tournament_year desc limit 1;
  end if;
  select jsonb_build_object(
    'tournamentId', target,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'playerId', tp.player_id, 'displayName', p.display_name, 'teamId', tp.team_id,
      'participationStatus', tp.participation_status, 'email', c.email,
      'identityActive', coalesce(c.identity_active, false),
      'configurationRevision', c.configuration_revision,
      'verifiedBy', c.verified_by, 'verifiedAt', c.verified_at
    ) order by p.display_name)
      from scoring_authority.tournament_players tp
      join scoring_authority.players p on p.player_id = tp.player_id
      left join participant_identity.participant_identity_contacts c
        on c.tournament_id = tp.tournament_id and c.player_id = tp.player_id
      where tp.tournament_id = target and tp.participation_status = 'ACTIVE'), '[]'::jsonb),
    'latestRun', (select to_jsonb(r) - 'validation_report' || jsonb_build_object('validation_report', r.validation_report)
      from participant_identity.identity_config_import_runs r where r.tournament_id = target order by r.requested_at desc limit 1),
    'contextRevision', (select to_jsonb(cr) from participant_identity.identity_context_revisions cr where cr.tournament_id = target),
    'linkCount', (select count(*) from participant_identity.user_player_links l
      join scoring_authority.tournament_players tp on tp.player_id = l.player_id and tp.tournament_id = target
      where l.status in ('PENDING', 'ACTIVE', 'SUSPENDED'))
  ) into result;
  return jsonb_build_object('ok', true, 'data', result);
end;
$$;

create or replace function public.read_participant_identity_context(target_tournament_id text, target_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'playerId', p.player_id, 'displayName', p.display_name,
    'tournament', jsonb_build_object('id', t.tournament_id, 'year', t.tournament_year, 'name', t.name),
    'team', jsonb_build_object('id', team.team_id, 'name', team.name, 'side', team.team_side),
    'membership', jsonb_build_object('active', tp.participation_status = 'ACTIVE', 'status', tp.participation_status),
    'currentRound', (select max(round_number) from scoring_authority.matches m where m.tournament_id = t.tournament_id and m.status in ('LIVE', 'UPCOMING')),
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
      'matchId', m.match_id, 'round', m.round_number, 'format', m.format, 'status', m.status,
      'scoringLocked', m.scoring_locked, 'matchRevision', m.match_revision,
      'canScore', coalesce(sp.can_score, false), 'permissionRevision', sp.permission_revision
    ) order by m.round_number, m.match_id)
      from scoring_authority.match_participants mp
      join scoring_authority.matches m on m.match_id = mp.match_id
      left join scoring_authority.scoring_permissions sp on sp.match_id = m.match_id and sp.player_id = mp.player_id
      where mp.player_id = p.player_id and m.tournament_id = t.tournament_id), '[]'::jsonb),
    'contextRevision', coalesce(cr.context_revision, 0), 'generatedAt', now()
  ) into result
  from scoring_authority.tournament_players tp
  join scoring_authority.players p on p.player_id = tp.player_id
  join scoring_authority.tournaments t on t.tournament_id = tp.tournament_id
  join scoring_authority.teams team on team.tournament_id = tp.tournament_id and team.team_id = tp.team_id
  left join participant_identity.identity_context_revisions cr on cr.tournament_id = tp.tournament_id
  where tp.tournament_id = btrim(target_tournament_id) and tp.player_id = btrim(target_player_id);
  if result is null then return jsonb_build_object('ok', false, 'code', 'PARTICIPANT_CONTEXT_NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'data', result);
end;
$$;

create or replace function public.record_participant_identity_shadow_observation(observation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare id uuid;
begin
  if btrim(coalesce(observation->>'request_id', '')) = '' then raise exception 'Shadow request identity is required.'; end if;
  insert into participant_identity.participant_identity_shadow_observations (
    request_id, tournament_id, auth_user_id, passport_player_id, linked_player_id,
    passport_team_id, linked_team_id, passport_membership_active, linked_membership_active,
    passport_match_ids, linked_match_ids, passport_scoring_permissions, linked_scoring_permissions,
    comparison_status, comparison_diagnostics
  ) values (
    observation->>'request_id', observation->>'tournament_id', nullif(observation->>'auth_user_id', '')::uuid,
    nullif(observation->>'passport_player_id', ''), nullif(observation->>'linked_player_id', ''),
    nullif(observation->>'passport_team_id', ''), nullif(observation->>'linked_team_id', ''),
    nullif(observation->>'passport_membership_active', '')::boolean, nullif(observation->>'linked_membership_active', '')::boolean,
    coalesce(observation->'passport_match_ids', '[]'::jsonb), coalesce(observation->'linked_match_ids', '[]'::jsonb),
    coalesce(observation->'passport_scoring_permissions', '{}'::jsonb), coalesce(observation->'linked_scoring_permissions', '{}'::jsonb),
    coalesce(nullif(observation->>'comparison_status', ''), 'NOT_RUN'), coalesce(observation->'comparison_diagnostics', '{}'::jsonb)
  ) on conflict (request_id) do nothing returning observation_id into id;
  return jsonb_build_object('ok', true, 'created', id is not null, 'observationId', id);
end;
$$;

create or replace function public.read_participant_identity_context_for_auth(target_auth_user_id uuid, target_tournament_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare target_player text;
declare target_tournament text := nullif(btrim(coalesce(target_tournament_id, '')), '');
declare context jsonb;
begin
  select player_id into target_player from participant_identity.user_player_links
    where auth_user_id = target_auth_user_id and status = 'ACTIVE';
  if target_player is null then return jsonb_build_object('ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;
  if target_tournament is null then
    select tp.tournament_id into target_tournament
    from scoring_authority.tournament_players tp join scoring_authority.tournaments t on t.tournament_id = tp.tournament_id
    where tp.player_id = target_player and tp.participation_status = 'ACTIVE'
    order by t.tournament_year desc limit 1;
  end if;
  context := public.read_participant_identity_context(target_tournament, target_player);
  if coalesce((context->>'ok')::boolean, false) then
    return jsonb_set(context, '{data,authUserId}', to_jsonb(target_auth_user_id), true);
  end if;
  return context;
end;
$$;

create or replace function public.admin_link_auth_user_to_player(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, auth, pg_temp
as $$
declare user_id uuid := nullif(input->>'auth_user_id', '')::uuid;
declare target_player text := btrim(coalesce(input->>'player_id', ''));
declare target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
declare actor text := btrim(coalesce(input->>'linked_by', ''));
declare contact participant_identity.participant_identity_contacts%rowtype;
declare existing participant_identity.user_player_links%rowtype;
declare inserted_id uuid;
begin
  if user_id is null or target_player = '' or target_tournament = '' or actor = '' then raise exception 'Complete link administration context is required.'; end if;
  if not exists (select 1 from auth.users where id = user_id) then raise exception 'Auth user does not exist.'; end if;
  select * into contact from participant_identity.participant_identity_contacts
    where tournament_id = target_tournament and player_id = target_player and identity_active;
  if not found then raise exception 'Approved active participant identity contact is required.'; end if;
  select * into existing from participant_identity.user_player_links
    where auth_user_id = user_id or (player_id = target_player and status in ('PENDING', 'ACTIVE', 'SUSPENDED')) limit 1;
  if found then
    if existing.auth_user_id = user_id and existing.player_id = target_player
      and existing.email_identity_hash = encode(digest(contact.email_normalized, 'sha256'), 'hex') then
      return jsonb_build_object('ok', true, 'created', false, 'linkId', existing.link_id, 'status', existing.status);
    end if;
    raise exception 'Existing Auth user or Player link requires an explicit audited link-change operation.';
  end if;
  insert into participant_identity.user_player_links (
    auth_user_id, player_id, status, link_method, email_identity_hash, linked_at, linked_by
  ) values (
    user_id, target_player, 'ACTIVE', 'DIRECTOR_APPROVED_EMAIL', encode(digest(contact.email_normalized, 'sha256'), 'hex'), now(), actor
  ) returning link_id into inserted_id;
  insert into participant_identity.identity_audit_events (event_type, tournament_id, auth_user_id, player_id, actor_name, link_revision)
    values ('AUTH_USER_LINKED', target_tournament, user_id, target_player, actor, 1);
  return jsonb_build_object('ok', true, 'created', true, 'linkId', inserted_id, 'status', 'ACTIVE');
end;
$$;

create or replace function public.inspect_participant_identity_security()
returns jsonb
language sql
security definer
set search_path = participant_identity, public, pg_temp
as $$
  select jsonb_build_object(
    'tables', (select jsonb_agg(jsonb_build_object(
      'table', c.relname, 'rlsEnabled', c.relrowsecurity,
      'policyCount', (select count(*) from pg_policy p where p.polrelid = c.oid),
      'anonPrivileges', has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE'),
      'authenticatedPrivileges', has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
    ) order by c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'participant_identity' and c.relkind = 'r'),
    'authUsers', (select count(*) from auth.users),
    'participantLinks', (select count(*) from participant_identity.user_player_links)
  );
$$;

do $$
declare function_signature text;
begin
  foreach function_signature in array array[
    'public.import_participant_identity_configuration(jsonb)',
    'public.approve_participant_identity_configuration(uuid,text,text)',
    'public.read_participant_identity_admin(text)',
    'public.read_participant_identity_context(text,text)',
    'public.read_participant_identity_context_for_auth(uuid,text)',
    'public.record_participant_identity_shadow_observation(jsonb)',
    'public.admin_link_auth_user_to_player(jsonb)',
    'public.inspect_participant_identity_security()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', function_signature);
    execute format('grant execute on function %s to service_role', function_signature);
  end loop;
end $$;
