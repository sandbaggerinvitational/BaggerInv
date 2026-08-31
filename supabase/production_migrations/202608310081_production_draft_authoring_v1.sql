-- Step 13E.8B: Supabase-native, annual Draft authoring V1.
--
-- Installation is inert. It adds no Draft revision, pick, future binding, or
-- current pointer and does not rewrite the certified Google-imported rows.
-- Only an explicit Director stage, validate, commit, or copy operation can
-- create new state. Completed Drafts remain correction-required and read-only.
begin;

do $dependencies$
begin
  if pg_catalog.to_regprocedure(
       'production_control.assert_annual_future_admin_scope_v1(jsonb,text,boolean,boolean)'
     ) is null
     or pg_catalog.to_regprocedure(
       'production_control.prediction_settings_canonical_json_v1(jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.synchronize_production_director_projection(jsonb)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.synchronize_production_future_annual_projection_v1(jsonb)'
     ) is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_DRAFT_AUTHORING_DEPENDENCY_REQUIRED';
  end if;
end;
$dependencies$;

-- Existing rows keep their Google-compatible operation and source columns.
-- New native revisions are classified by the immutable provenance table, and
-- these additional operation values make their revision intent explicit.
alter table scoring_authority.draft_revisions
  drop constraint draft_revisions_operation_check;
alter table scoring_authority.draft_revisions
  add constraint draft_revisions_operation_check check (operation in (
    'INITIAL_IMPORT', 'CURRENT_SYNC', 'HISTORICAL_CORRECTION',
    'DIRECTOR_REVISION', 'DIRECTOR_CLONE'
  ));

-- Step 13E.8A introduced the authority column and limited native future
-- bindings to Prediction Settings. Extend only that conditional allowlist;
-- Guide remains Google-authored.
alter table production_control.future_annual_projection_bindings_v1
  drop constraint future_annual_projection_authoring_domain_v1;
alter table production_control.future_annual_projection_bindings_v1
  add constraint future_annual_projection_authoring_domain_v1 check (
    authoring_authority = 'GOOGLE_IMPORT'
    or domain in ('PREDICTION_SETTINGS', 'DRAFT')
  );

create table production_control.draft_authoring_drafts_v1 (
  draft_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  draft_revision bigint not null check (draft_revision > 0),
  state text not null check (state in (
    'STAGED', 'VALIDATED', 'COMMITTED', 'SUPERSEDED'
  )),
  authoring_kind text not null check (authoring_kind in (
    'DIRECTOR_EDIT', 'COPIED_PREVIOUS'
  )),
  expected_revision bigint not null check (expected_revision >= 0),
  predecessor_revision_id uuid references scoring_authority.draft_revisions(
    revision_id
  ) on delete restrict,
  source_tournament_id text references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  source_revision_id uuid references scoring_authority.draft_revisions(
    revision_id
  ) on delete restrict,
  configuration jsonb not null check (
    pg_catalog.jsonb_typeof(configuration) = 'object'
  ),
  picks jsonb not null check (pg_catalog.jsonb_typeof(picks) = 'array'),
  presentation_seed jsonb not null check (
    pg_catalog.jsonb_typeof(presentation_seed) = 'object'
  ),
  configuration_fingerprint text not null check (
    configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  picks_fingerprint text not null check (
    picks_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  payload_fingerprint text not null check (
    payload_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  validation_diagnostics jsonb not null check (
    pg_catalog.jsonb_typeof(validation_diagnostics) = 'object'
  ),
  reason text not null check (
    pg_catalog.btrim(reason) <> '' and pg_catalog.length(reason) <= 500
  ),
  created_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  created_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  validated_at timestamptz,
  committed_revision_id uuid references scoring_authority.draft_revisions(
    revision_id
  ) on delete restrict,
  committed_at timestamptz,
  unique (tournament_id, draft_revision),
  check ((state = 'COMMITTED' and committed_revision_id is not null
      and committed_at is not null)
    or (state <> 'COMMITTED' and committed_revision_id is null
      and committed_at is null))
);

create unique index production_draft_authoring_open_draft_v1
  on production_control.draft_authoring_drafts_v1(tournament_id)
  where state in ('STAGED', 'VALIDATED');

create table production_control.draft_revision_provenance_v1 (
  revision_id uuid primary key references scoring_authority.draft_revisions(
    revision_id
  ) on delete restrict,
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  authoring_authority text not null check (
    authoring_authority = 'SUPABASE_DIRECTOR'
  ),
  authoring_contract text not null check (
    authoring_contract = 'production-draft-authoring-v1'
  ),
  draft_id uuid not null unique references
    production_control.draft_authoring_drafts_v1(draft_id) on delete restrict,
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  authoring_kind text not null check (authoring_kind in (
    'DIRECTOR_EDIT', 'COPIED_PREVIOUS'
  )),
  selected_pick_count integer not null check (selected_pick_count >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table production_control.draft_operation_receipts_v1 (
  receipt_id uuid not null default extensions.gen_random_uuid() unique,
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  operation text not null check (operation in (
    'STAGE', 'VALIDATE', 'COMMIT', 'COPY_PREVIOUS'
  )),
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

-- This is the human-facing immutable audit. It deliberately has no raw
-- payload, SQL/RPC name, canonical hash, or request fingerprint column.
create table production_control.draft_authoring_audit_events_v1 (
  event_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  draft_id uuid references production_control.draft_authoring_drafts_v1(
    draft_id
  ) on delete restrict,
  revision_id uuid references scoring_authority.draft_revisions(revision_id)
    on delete restrict,
  action text not null check (action in (
    'REVISION_STAGED', 'REVISION_VALIDATED', 'REVISION_COMMITTED',
    'PREVIOUS_SETUP_COPIED', 'PICK_RECORDED', 'PICK_CORRECTED',
    'DRAFT_COMPLETED'
  )),
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  operation_request_id uuid,
  summary jsonb not null check (pg_catalog.jsonb_typeof(summary) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table production_control.draft_authoring_drafts_v1
  enable row level security;
alter table production_control.draft_revision_provenance_v1
  enable row level security;
alter table production_control.draft_operation_receipts_v1
  enable row level security;
alter table production_control.draft_authoring_audit_events_v1
  enable row level security;

revoke all on table
  production_control.draft_authoring_drafts_v1,
  production_control.draft_revision_provenance_v1,
  production_control.draft_operation_receipts_v1,
  production_control.draft_authoring_audit_events_v1
from public, anon, authenticated, service_role;

create function production_control.reject_draft_authoring_immutable_v1()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_DRAFT_AUTHORING_IMMUTABLE_RECORD';
end;
$$;

create trigger production_draft_provenance_immutable_v1
before update or delete on production_control.draft_revision_provenance_v1
for each row execute function
  production_control.reject_draft_authoring_immutable_v1();
create trigger production_draft_receipt_immutable_v1
before update or delete on production_control.draft_operation_receipts_v1
for each row execute function
  production_control.reject_draft_authoring_immutable_v1();
create trigger production_draft_audit_immutable_v1
before update or delete on production_control.draft_authoring_audit_events_v1
for each row execute function
  production_control.reject_draft_authoring_immutable_v1();

create function production_control.draft_authoring_canonical_json_v1(
  value jsonb
)
returns text language sql immutable strict set search_path = pg_catalog as $$
  select production_control.prediction_settings_canonical_json_v1(value)
$$;

create function production_control.draft_authoring_hash_v1(value jsonb)
returns text language sql immutable strict
set search_path = pg_catalog, extensions as $$
  select pg_catalog.encode(extensions.digest(
    production_control.draft_authoring_canonical_json_v1(value), 'sha256'
  ), 'hex')
$$;

create function production_control.draft_team_presentation_v1(
  target text,
  target_team text,
  captain_player text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $draft_team_presentation$
  select pg_catalog.jsonb_build_object(
    'id', team.team_id,
    'side', 'Team ' || team.team_side,
    'name', team.name,
    'logo', coalesce(nullif(team.source_payload->>'Team Logo', ''),
      nullif(team.source_payload->>'Logo Filename', ''), ''),
    'primaryColor', coalesce(nullif(team.source_payload->>'Primary Color', ''),
      '#0b4a3a'),
    'secondaryColor', coalesce(
      nullif(team.source_payload->>'Secondary Color', ''), '#d4b15f'),
    'averageHandicap', (
      select case
        when pg_catalog.count(*) > 0
         and pg_catalog.count(membership.tournament_handicap) =
           pg_catalog.count(*)
          then pg_catalog.avg(membership.tournament_handicap)
        else null
      end
      from scoring_authority.tournament_players membership
      where membership.tournament_id = target
        and membership.team_id = target_team
        and membership.participation_status = 'ACTIVE'
    ),
    'captainId', coalesce(captain_player, ''),
    'captain', case when player.player_id is null then null else
      pg_catalog.jsonb_build_object(
        'id', player.player_id,
        'name', player.display_name,
        'image', case when coalesce(player.source_payload->>'Photo Filename','')=''
          then null else '/images/players/' ||
            pg_catalog.regexp_replace(player.source_payload->>'Photo Filename',
              '\.(png|jpe?g|webp|avif)$', '', 'i') || '.webp' end
      ) end
  )
  from scoring_authority.teams team
  left join scoring_authority.players player
    on player.player_id = nullif(captain_player, '')
  where team.tournament_id = target and team.team_id = target_team
$draft_team_presentation$;

create function production_control.draft_player_presentation_v1(
  target text,
  target_player text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $draft_player_presentation$
  select case when player.player_id is null then null else
    pg_catalog.jsonb_build_object(
      'id', player.player_id,
      'name', player.display_name,
      'image', case when coalesce(player.source_payload->>'Photo Filename','')=''
        then null else '/images/players/' ||
          pg_catalog.regexp_replace(player.source_payload->>'Photo Filename',
            '\.(png|jpe?g|webp|avif)$', '', 'i') || '.webp' end,
      'handicap', membership.tournament_handicap
    ) end
  from scoring_authority.players player
  join scoring_authority.tournament_players membership
    on membership.tournament_id = target
   and membership.player_id = player.player_id
   and membership.participation_status = 'ACTIVE'
  where player.player_id = target_player
$draft_player_presentation$;

-- Scheduling values stay lossless for compatibility with the existing Draft
-- projection (for example 7/12/2027, 7:00 PM, and CST), while rejecting
-- malformed values before a new authoritative revision is created.
create function production_control.draft_date_valid_v1(value text)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog
as $draft_date_valid$
declare
  parts text[];
  year_value integer;
  month_value integer;
  day_value integer;
begin
  if pg_catalog.btrim(value)='' then return true; end if;
  parts:=pg_catalog.regexp_match(pg_catalog.btrim(value),
    '^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$');
  if parts is not null then
    year_value:=parts[1]::integer;
    month_value:=parts[2]::integer;
    day_value:=parts[3]::integer;
  else
    parts:=pg_catalog.regexp_match(pg_catalog.btrim(value),
      '^([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})$');
    if parts is null then return false; end if;
    month_value:=parts[1]::integer;
    day_value:=parts[2]::integer;
    year_value:=parts[3]::integer;
  end if;
  perform pg_catalog.make_date(year_value,month_value,day_value);
  return true;
exception when datetime_field_overflow or invalid_datetime_format then
  return false;
end;
$draft_date_valid$;

create function production_control.draft_time_valid_v1(value text)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $draft_time_valid$
  select pg_catalog.btrim(value)=''
    or pg_catalog.btrim(value) ~
      '^(?:[01]?[0-9]|2[0-3]):[0-5][0-9]$'
    or pg_catalog.btrim(value) ~*
      '^(?:0?[1-9]|1[0-2]):[0-5][0-9][[:space:]](?:AM|PM)$'
$draft_time_valid$;

create function production_control.draft_time_zone_valid_v1(value text)
returns boolean
language sql
stable
strict
set search_path = pg_catalog
as $draft_time_zone_valid$
  select pg_catalog.btrim(value)=''
    or pg_catalog.upper(pg_catalog.btrim(value)) in (
      'UTC','GMT','CST','CDT','EST','EDT','MST','MDT','PST','PDT'
    )
    or (
      pg_catalog.btrim(value) ~
        '^[A-Za-z_]+(?:/[A-Za-z0-9_+.-]+)+$'
      and exists (select 1 from pg_catalog.pg_timezone_names zone
        where zone.name=pg_catalog.btrim(value))
    )
$draft_time_zone_valid$;

create function production_control.validate_draft_authoring_v1(
  target text,
  proposed_configuration jsonb,
  proposed_picks jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $validate_draft_authoring$
declare
  target_year integer;
  total_value integer;
  team_one text;
  team_two text;
  captain_one text;
  captain_two text;
  first_team text;
  status_value text;
  format_value text;
  date_value text;
  time_value text;
  time_zone_value text;
  canonical_config jsonb;
  normalized_picks jsonb := '[]'::jsonb;
  presentation_picks jsonb := '[]'::jsonb;
  presentation_seed_value jsonb;
  teams_value jsonb;
  issues jsonb := '[]'::jsonb;
  diagnostics jsonb := '[]'::jsonb;
  item jsonb;
  pick_value integer;
  round_value integer;
  within_value integer;
  team_value text;
  source_team_value text;
  player_value text;
  pick_status text;
  expected_team text;
  selected_players text[] := array[]::text[];
  seen_picks integer[] := array[]::integer[];
  player_name_value text;
  team_presentation jsonb;
  player_presentation jsonb;
  selected_at_value text;
  selected_by_value text;
  notes_value text;
begin
  if target !~ '^20[0-9]{2}$'
     or not exists (select 1 from scoring_authority.tournaments value
       where value.tournament_id = target
         and value.tournament_year = target::integer)
     or pg_catalog.jsonb_typeof(proposed_configuration) is distinct from 'object'
     or pg_catalog.jsonb_typeof(proposed_picks) is distinct from 'array' then
    return pg_catalog.jsonb_build_object(
      'pass', false,
      'issues', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'code', 'DRAFT_COMPLETE_PAYLOAD_REQUIRED'
      ))
    );
  end if;
  target_year := target::integer;
  begin
    total_value := (proposed_configuration->>'total_picks')::integer;
  exception when others then total_value := 0;
  end;
  team_one := pg_catalog.upper(pg_catalog.btrim(coalesce(
    proposed_configuration->>'team_1_id', '')));
  team_two := pg_catalog.upper(pg_catalog.btrim(coalesce(
    proposed_configuration->>'team_2_id', '')));
  captain_one := pg_catalog.upper(pg_catalog.btrim(coalesce(
    proposed_configuration->>'team_1_captain_player_id', '')));
  captain_two := pg_catalog.upper(pg_catalog.btrim(coalesce(
    proposed_configuration->>'team_2_captain_player_id', '')));
  first_team := pg_catalog.upper(pg_catalog.btrim(coalesce(
    proposed_configuration->>'first_pick_team_id', '')));
  status_value := pg_catalog.btrim(coalesce(
    proposed_configuration->>'status_mode', ''));
  format_value := pg_catalog.btrim(coalesce(
    proposed_configuration->>'format', ''));
  date_value := pg_catalog.btrim(coalesce(
    proposed_configuration->>'date', ''));
  time_value := pg_catalog.btrim(coalesce(
    proposed_configuration->>'time', ''));
  time_zone_value := pg_catalog.btrim(coalesce(
    proposed_configuration->>'time_zone', ''));

  if coalesce((proposed_configuration->>'year')::integer, 0) <> target_year then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'DRAFT_TOURNAMENT_MISMATCH'));
  end if;
  if total_value < 1 then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'DRAFT_TOTAL_PICKS_INVALID'));
  end if;
  if team_one = '' or team_two = '' or team_one = team_two
     or not exists (select 1 from scoring_authority.teams value
       where value.tournament_id = target and value.team_id = team_one)
     or not exists (select 1 from scoring_authority.teams value
       where value.tournament_id = target and value.team_id = team_two) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'DRAFT_TEAM_INVALID'));
  end if;
  if first_team = '' or first_team not in (team_one, team_two) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'DRAFT_FIRST_PICK_TEAM_INVALID'));
  end if;
  if pg_catalog.upper(status_value) not in (
       'AUTOMATIC','UNSCHEDULED','SCHEDULED','LIVE','COMPLETE'
     ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'DRAFT_STATUS_INVALID'));
  end if;
  if not production_control.draft_date_valid_v1(date_value) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'DRAFT_DATE_INVALID'));
  end if;
  if not production_control.draft_time_valid_v1(time_value) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'DRAFT_TIME_INVALID'));
  end if;
  if not production_control.draft_time_zone_valid_v1(time_zone_value) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'DRAFT_TIME_ZONE_INVALID'));
  end if;
  if captain_one <> '' and not exists (
       select 1 from scoring_authority.tournament_players value
       where value.tournament_id = target and value.player_id = captain_one
         and value.participation_status = 'ACTIVE'
     ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'DRAFT_CAPTAIN_INVALID', 'teamId', team_one));
  end if;
  if captain_two <> '' and not exists (
       select 1 from scoring_authority.tournament_players value
       where value.tournament_id = target and value.player_id = captain_two
         and value.participation_status = 'ACTIVE'
     ) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'DRAFT_CAPTAIN_INVALID', 'teamId', team_two));
  end if;
  if captain_one <> '' and captain_one = captain_two then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'DRAFT_CAPTAINS_CONFLICT'));
  end if;
  if pg_catalog.jsonb_array_length(proposed_picks) <> total_value then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'DRAFT_PICK_COUNT_MISMATCH'));
  end if;

  for item in
    select value from pg_catalog.jsonb_array_elements(proposed_picks)
    order by case when value->>'pick_number' ~ '^[0-9]+$'
      then (value->>'pick_number')::integer else 2147483647 end
  loop
    begin
      pick_value := (item->>'pick_number')::integer;
    exception when others then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('code','DRAFT_PICK_NUMBER_INVALID'));
      continue;
    end;
    round_value := ((pick_value - 1) / 2) + 1;
    within_value := pg_catalog.mod(pick_value - 1, 2) + 1;
    if pick_value = any(seen_picks) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code','DRAFT_PICK_NUMBER_DUPLICATE','pickNumber',pick_value));
    elsif pick_value < 1 or pick_value > total_value then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code','DRAFT_PICK_NUMBER_INVALID','pickNumber',pick_value));
    else
      seen_picks := pg_catalog.array_append(seen_picks, pick_value);
    end if;
    team_value := pg_catalog.upper(pg_catalog.btrim(coalesce(
      item->>'team_id', '')));
    source_team_value := team_value;
    player_value := pg_catalog.upper(pg_catalog.btrim(coalesce(
      item->>'player_id', '')));
    pick_status := case when player_value = '' then 'PENDING'
      else 'SELECTED' end;
    selected_at_value := pg_catalog.btrim(coalesce(item->>'selected_at',''));
    selected_by_value := pg_catalog.btrim(coalesce(item->>'selected_by',''));
    notes_value := pg_catalog.btrim(coalesce(item->>'notes',''));
    if pick_status not in ('PENDING','SELECTED')
       or (pick_status = 'PENDING' and player_value <> '')
       or (pick_status = 'SELECTED' and (player_value = '' or team_value = ''))
       or (team_value <> '' and team_value not in (team_one, team_two)) then
      issues := issues || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code','DRAFT_PICK_STATUS_INVALID','pickNumber',pick_value));
    end if;
    if player_value <> '' then
      if player_value in (captain_one,captain_two) then
        issues := issues || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code','DRAFT_CAPTAIN_PICK_PROHIBITED',
            'pickNumber',pick_value,'playerId',player_value));
      end if;
      if player_value = any(selected_players) then
        issues := issues || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code','DRAFT_PLAYER_DUPLICATE','pickNumber',pick_value,
            'playerId',player_value));
      else
        selected_players := pg_catalog.array_append(
          selected_players, player_value);
      end if;
      if not exists (
        select 1 from scoring_authority.tournament_players value
        where value.tournament_id = target
          and value.player_id = player_value and value.team_id = team_value
          and value.participation_status = 'ACTIVE'
      ) then
        issues := issues || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code','DRAFT_PLAYER_TEAM_INVALID','pickNumber',pick_value,
            'playerId',player_value,'teamId',team_value));
      end if;
    end if;
    expected_team := case
      when pg_catalog.mod((pick_value - 1) / 2, 2) = 0 then
        case when pg_catalog.mod(pick_value - 1, 2) = 0
          then first_team
          else case when first_team = team_one then team_two else team_one end
        end
      else case when pg_catalog.mod(pick_value - 1, 2) = 0
          then case when first_team = team_one then team_two else team_one end
          else first_team end
      end;
    if player_value <> '' and pg_catalog.upper(format_value) = 'SNAKE'
       and team_value <> expected_team then
      diagnostics := diagnostics || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'category','DRAFT_SNAKE_TEAM_MISMATCH',
          'pickNumber',pick_value,'expectedTeamId',expected_team,
          'actualTeamId',team_value));
    end if;
    select value.display_name into player_name_value
    from scoring_authority.players value where value.player_id = player_value;
    team_presentation := case when team_value = '' then null else
      production_control.draft_team_presentation_v1(
        target, team_value, case when team_value = team_one
          then captain_one else captain_two end) end;
    player_presentation := case when player_value = '' then null else
      production_control.draft_player_presentation_v1(
        target, player_value) end;
    normalized_picks := normalized_picks || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'pick_number',pick_value,'round_number',round_value,
        'pick_within_round',within_value,
        'source_team_id',source_team_value,'team_id',team_value,
        'player_id',player_value,
        'player_name',coalesce(player_name_value,''),
        'selected_at',selected_at_value,'selected_by',selected_by_value,
        'status',pick_status,'notes',notes_value,
        'presentation',pg_catalog.jsonb_build_object(
          'team',team_presentation,'player',player_presentation)
      ));
    presentation_picks := presentation_picks || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'pickNumber',pick_value,'round',round_value,
        'pickWithinRound',within_value,'sourceTeamId',source_team_value,
        'teamId',team_value,'team',team_presentation,
        'playerId',player_value,'player',player_presentation,
        'selectedAt',selected_at_value,'selectedBy',selected_by_value,
        'status',pick_status,'notes',notes_value
      ));
  end loop;
  if pg_catalog.cardinality(seen_picks) <> total_value
     or exists (select 1 from pg_catalog.generate_series(1,total_value) value
       where not (value = any(seen_picks))) then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code','DRAFT_PICK_SEQUENCE_INVALID'));
  end if;
  if pg_catalog.upper(status_value) = 'COMPLETE'
     and pg_catalog.cardinality(selected_players) <> total_value then
    issues := issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code','DRAFT_COMPLETED_PICK_MISSING'));
  end if;

  canonical_config := pg_catalog.jsonb_build_object(
    'year',target_year,
    'name',coalesce(nullif(pg_catalog.btrim(
      proposed_configuration->>'name'),''), target || ' Sandbagger Draft'),
    'date',pg_catalog.btrim(coalesce(proposed_configuration->>'date','')),
    'time',pg_catalog.btrim(coalesce(proposed_configuration->>'time','')),
    'time_zone',pg_catalog.btrim(coalesce(
      proposed_configuration->>'time_zone','')),
    'location',pg_catalog.btrim(coalesce(
      proposed_configuration->>'location','')),
    'status_mode',status_value,
    'format',format_value,
    'total_picks',total_value,
    'team_1_id',team_one,'team_2_id',team_two,
    'team_1_captain_player_id',captain_one,
    'team_2_captain_player_id',captain_two,
    'first_pick_team_id',first_team,
    'notes',pg_catalog.btrim(coalesce(proposed_configuration->>'notes',''))
  );
  teams_value := pg_catalog.jsonb_build_array(
    production_control.draft_team_presentation_v1(
      target, team_one, captain_one),
    production_control.draft_team_presentation_v1(
      target, team_two, captain_two)
  );
  presentation_seed_value := pg_catalog.jsonb_build_object(
    'year',target_year,'name',canonical_config->>'name',
    'date',canonical_config->>'date','time',canonical_config->>'time',
    'timeZone',canonical_config->>'time_zone',
    'location',canonical_config->>'location',
    'statusMode',canonical_config->>'status_mode',
    'format',canonical_config->>'format',
    'totalDraftPicks',total_value,'firstPickTeamId',first_team,
    'firstPickSourceTeamId',first_team,
    'notes',canonical_config->>'notes','teams',teams_value,
    'picks',presentation_picks
  );
  return pg_catalog.jsonb_build_object(
    'pass',pg_catalog.jsonb_array_length(issues)=0,
    'issues',issues,
    'configuration',canonical_config,
    'picks',normalized_picks,
    'presentationSeed',presentation_seed_value,
    'configurationFingerprint',
      production_control.draft_authoring_hash_v1(canonical_config),
    'picksFingerprint',
      production_control.draft_authoring_hash_v1(normalized_picks),
    'payloadFingerprint',production_control.draft_authoring_hash_v1(
      pg_catalog.jsonb_build_object(
        'configuration',canonical_config,'picks',normalized_picks,
        'presentationSeed',presentation_seed_value
      )),
    'diagnostics',pg_catalog.jsonb_build_object(
      'selectedPicks',pg_catalog.cardinality(selected_players),
      'pendingPicks',total_value-pg_catalog.cardinality(selected_players),
      'corrections',diagnostics)
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'pass',false,
    'issues',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'code','DRAFT_INPUT_INVALID'))
  );
end;
$validate_draft_authoring$;

create function production_control.draft_sanitize_pick_provenance_v1(
  proposed jsonb,
  predecessor jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $sanitize_draft_pick_provenance$
declare
  item jsonb;
  prior jsonb;
  result_value jsonb := '[]'::jsonb;
begin
  if pg_catalog.jsonb_typeof(proposed) is distinct from 'array'
     or pg_catalog.jsonb_typeof(predecessor) is distinct from 'array' then
    return '[]'::jsonb;
  end if;
  for item in
    select value from pg_catalog.jsonb_array_elements(proposed)
    order by (value->>'pick_number')::integer
  loop
    select value into prior
    from pg_catalog.jsonb_array_elements(predecessor) value
    where value->>'pick_number' = item->>'pick_number'
    limit 1;
    if prior is not null
       and pg_catalog.upper(pg_catalog.btrim(coalesce(
         prior->>'team_id',''))) = pg_catalog.upper(pg_catalog.btrim(coalesce(
         item->>'team_id','')))
       and pg_catalog.upper(pg_catalog.btrim(coalesce(
         prior->>'player_id',''))) = pg_catalog.upper(pg_catalog.btrim(coalesce(
         item->>'player_id',''))) then
      result_value := result_value || pg_catalog.jsonb_build_array(
        item || pg_catalog.jsonb_build_object(
          'selected_at',coalesce(prior->>'selected_at',''),
          'selected_by',coalesce(prior->>'selected_by','')
        ));
    else
      result_value := result_value || pg_catalog.jsonb_build_array(
        item || pg_catalog.jsonb_build_object(
          'selected_at','','selected_by',''
        ));
    end if;
    prior := null;
  end loop;
  return result_value;
end;
$sanitize_draft_pick_provenance$;

create function production_control.draft_commit_pick_provenance_v1(
  proposed jsonb,
  actor_player text,
  committed_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $commit_draft_pick_provenance$
declare
  item jsonb;
  result_value jsonb := '[]'::jsonb;
begin
  for item in
    select value from pg_catalog.jsonb_array_elements(proposed)
    order by (value->>'pick_number')::integer
  loop
    if pg_catalog.btrim(coalesce(item->>'player_id','')) <> '' then
      item := item || pg_catalog.jsonb_build_object(
        'selected_at',coalesce(nullif(pg_catalog.btrim(
          item->>'selected_at'),''), committed_at::text),
        'selected_by',coalesce(nullif(pg_catalog.btrim(
          item->>'selected_by'),''), actor_player)
      );
    else
      item := item || pg_catalog.jsonb_build_object(
        'selected_at','','selected_by',''
      );
    end if;
    result_value := result_value || pg_catalog.jsonb_build_array(item);
  end loop;
  return result_value;
end;
$commit_draft_pick_provenance$;

create function production_control.assert_draft_authoring_v1(input jsonb)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $draft_authoring_scope$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id',''));
  target_year integer;
begin
  perform production_control.assert_annual_future_admin_scope_v1(
    input, 'production-draft-authoring-v1', true, false
  );
  begin target_year := (input->>'target_tournament_year')::integer;
  exception when others then
    raise exception using errcode='22023',
      message='DRAFT_TOURNAMENT_REQUIRED';
  end;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key='BAGGER_INV_PRODUCTION';
  if target !~ '^20[0-9]{2}$' or target <> target_year::text then
    raise exception using errcode='22023',
      message='DRAFT_TOURNAMENT_REQUIRED';
  end if;
  if target = pointer.tournament_id then
    if target_year <> pointer.tournament_year or not exists (
      select 1 from production_control.future_tournament_catalog_v1 value
      where value.tournament_id=target
        and value.tournament_year=target_year
        and value.lifecycle='ACTIVE'
        and value.lifecycle_revision=pointer.lifecycle_revision
    ) then
      raise exception using errcode='55000',
        message='DRAFT_CURRENT_TOURNAMENT_REQUIRED';
    end if;
  elsif not exists (
    select 1
    from production_control.future_tournament_catalog_v1 catalog
    join production_control.future_tournament_resources_v1 resource
      on resource.tournament_id=catalog.tournament_id
    where catalog.tournament_id=target
      and catalog.tournament_year=target_year
      and catalog.tournament_year>pointer.tournament_year
      and catalog.lifecycle in ('DRAFT','CONFIGURING','READY_FOR_ACTIVATION')
      and resource.project_ref=input->>'project_ref'
      and resource.project_url=input->>'project_url'
      and resource.project_ref !~* '(preview|staging|test)'
  ) then
    raise exception using errcode='42501',
      message='DRAFT_FUTURE_TOURNAMENT_REQUIRED';
  end if;
  return target;
end;
$draft_authoring_scope$;

create function production_control.draft_mutability_v1(target text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $draft_mutability$
declare
  current_revision uuid;
  total_value integer := 0;
  selected_value integer := 0;
  status_value text := '';
begin
  select value.revision_id into current_revision
  from scoring_authority.draft_current_revisions value
  where value.tournament_id=target;
  if current_revision is null then
    return pg_catalog.jsonb_build_object(
      'state','SETUP_EDITABLE','editable',true,
      'code','DRAFT_NOT_CONFIGURED'
    );
  end if;
  select value.total_picks,coalesce(value.status_mode,'')
    into total_value,status_value
  from scoring_authority.draft_configuration_facts value
  where value.revision_id=current_revision;
  select pg_catalog.count(*)::integer into selected_value
  from scoring_authority.draft_pick_facts value
  where value.revision_id=current_revision and value.pick_status='SELECTED';
  if pg_catalog.upper(status_value)='COMPLETE'
     or (total_value>0 and selected_value>=total_value) then
    return pg_catalog.jsonb_build_object(
      'state','CORRECTION_REQUIRED','editable',false,
      'code','DRAFT_CORRECTION_REQUIRED',
      'selectedPicks',selected_value,'totalPicks',total_value
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'state',case when selected_value>0 then 'IN_PROGRESS'
      else 'SETUP_EDITABLE' end,
    'editable',true,'code','DRAFT_EDITABLE',
    'selectedPicks',selected_value,'totalPicks',total_value
  );
end;
$draft_mutability$;

create function production_control.assert_draft_editable_v1(target text)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $assert_draft_editable$
declare
  mutability jsonb;
begin
  mutability := production_control.draft_mutability_v1(target);
  if not coalesce((mutability->>'editable')::boolean,false) then
    raise exception using errcode='55000',
      message='DRAFT_CORRECTION_REQUIRED';
  end if;
end;
$assert_draft_editable$;

create function production_control.draft_operation_receipt_v1(
  target text,
  operation_value text,
  request_id uuid,
  declared_hash text,
  database_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $draft_operation_receipt$
declare
  receipt production_control.draft_operation_receipts_v1%rowtype;
begin
  select value.* into receipt
  from production_control.draft_operation_receipts_v1 value
  where value.tournament_id=target
    and value.operation=operation_value
    and value.operation_request_id=request_id;
  if not found then return null; end if;
  if receipt.declared_request_payload_hash=declared_hash
     and receipt.request_payload_hash=database_hash then
    return receipt.response || pg_catalog.jsonb_build_object(
      'idempotent',true);
  end if;
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','DRAFT_IDEMPOTENCY_CONFLICT');
end;
$draft_operation_receipt$;

create function production_control.draft_projection_row_v1(
  target_revision uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $draft_projection_row$
declare
  revision scoring_authority.draft_revisions%rowtype;
  picks_value jsonb;
  authority_value text;
begin
  select value.* into strict revision
  from scoring_authority.draft_revisions value
  where value.revision_id=target_revision;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'pick_number',pick.pick_number,
    'round_number',pick.round_number,
    'pick_within_round',pick.pick_within_round,
    'source_team_id',coalesce(pick.source_team_id,''),
    'team_id',coalesce(pick.team_id,''),
    'player_id',coalesce(pick.player_id,''),
    'player_name',coalesce(pick.player_name_snapshot,''),
    'selected_at',coalesce(pick.selected_at_source,''),
    'selected_by',coalesce(pick.selected_by_source,''),
    'status',pick.pick_status,'notes',coalesce(pick.notes,''),
    'presentation',pick.presentation_snapshot
  ) order by pick.pick_number),'[]'::jsonb) into picks_value
  from scoring_authority.draft_pick_facts pick
  where pick.revision_id=target_revision;
  authority_value := case when exists (
    select 1 from production_control.draft_revision_provenance_v1 value
    where value.revision_id=target_revision
  ) then 'SUPABASE_DIRECTOR' else 'GOOGLE_SYNCHRONIZATION' end;
  return pg_catalog.jsonb_build_object(
    'tournament_id',revision.tournament_id,
    'tournament_year',revision.tournament_year,
    'year',revision.tournament_year,
    'revision_id',revision.revision_id,
    'revision_number',revision.revision_number,
    'previous_revision_id',revision.previous_revision_id,
    'source_fingerprint',revision.source_fingerprint,
    'configuration_fingerprint',revision.configuration_fingerprint,
    'picks_fingerprint',revision.picks_fingerprint,
    'payload_fingerprint',revision.payload_fingerprint,
    'contract_version',revision.contract_version,
    'validation_status',revision.validation_status,
    'validation_diagnostics',revision.validation_diagnostics,
    'configuration',revision.configuration,
    'picks',picks_value,'normalized_picks',picks_value,
    'presentation_seed',revision.presentation_seed,
    'operation',revision.operation,
    'synchronized_by',revision.synchronized_by,
    'synchronized_at',revision.synchronized_at,
    'authoring_authority',authority_value
  );
end;
$draft_projection_row$;

create function public.read_production_draft_authoring_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $read_draft_authoring$
declare
  target text;
  target_year integer;
  history_limit_value integer := coalesce((input->>'history_limit')::integer,30);
  current_pointer scoring_authority.draft_current_revisions%rowtype;
  annual_pointer production_control.current_tournament_pointer_v1%rowtype;
  current_revision scoring_authority.draft_revisions%rowtype;
  open_draft production_control.draft_authoring_drafts_v1%rowtype;
  current_row jsonb;
  history_value jsonb;
  teams_value jsonb;
  players_value jsonb;
  audit_value jsonb;
  targets_value jsonb;
  mutability_value jsonb;
  dependency_issues jsonb := '[]'::jsonb;
  inactive_selected_count integer := 0;
  wrong_team_selected_count integer := 0;
  missing_team_count integer := 0;
begin
  target := production_control.assert_draft_authoring_v1(input);
  target_year := target::integer;
  if input->>'operation' is distinct from 'READ_PRODUCTION_DRAFT_AUTHORING_V1'
     or history_limit_value not between 1 and 50 then
    raise exception using errcode='22023',message='DRAFT_READ_INPUT_INVALID';
  end if;
  select value.* into strict annual_pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key='BAGGER_INV_PRODUCTION';
  select value.* into current_pointer
  from scoring_authority.draft_current_revisions value
  where value.tournament_id=target;
  if current_pointer.revision_id is not null then
    select value.* into current_revision
    from scoring_authority.draft_revisions value
    where value.revision_id=current_pointer.revision_id;
    current_row := production_control.draft_projection_row_v1(
      current_pointer.revision_id);
    select
      pg_catalog.count(*) filter (where pick.pick_status='SELECTED'
        and (membership.player_id is null
          or membership.participation_status<>'ACTIVE'))::integer,
      pg_catalog.count(*) filter (where pick.pick_status='SELECTED'
        and membership.participation_status='ACTIVE'
        and membership.team_id is distinct from pick.team_id)::integer
    into inactive_selected_count,wrong_team_selected_count
    from scoring_authority.draft_pick_facts pick
    left join scoring_authority.tournament_players membership
      on membership.tournament_id=target
     and membership.player_id=pick.player_id
    where pick.revision_id=current_pointer.revision_id;
    select pg_catalog.count(*)::integer into missing_team_count
    from (
      select facts.team_1_id team_id
      from scoring_authority.draft_configuration_facts facts
      where facts.revision_id=current_pointer.revision_id
      union all
      select facts.team_2_id
      from scoring_authority.draft_configuration_facts facts
      where facts.revision_id=current_pointer.revision_id
    ) referenced
    left join scoring_authority.teams team
      on team.tournament_id=target and team.team_id=referenced.team_id
    where team.team_id is null;
  end if;
  if inactive_selected_count>0 then
    dependency_issues := dependency_issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code','DRAFT_SELECTED_PLAYER_INACTIVE_OR_MISSING',
        'count',inactive_selected_count));
  end if;
  if wrong_team_selected_count>0 then
    dependency_issues := dependency_issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code','DRAFT_SELECTED_PLAYER_TEAM_CONFLICT',
        'count',wrong_team_selected_count));
  end if;
  if missing_team_count>0 then
    dependency_issues := dependency_issues || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code','DRAFT_CANONICAL_TEAM_MISSING','count',missing_team_count));
  end if;
  select value.* into open_draft
  from production_control.draft_authoring_drafts_v1 value
  where value.tournament_id=target and value.state in ('STAGED','VALIDATED')
  order by value.draft_revision desc limit 1;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'revisionId',history.revision_id,
    'revision',history.revision_number,
    'authoringAuthority',case when provenance.revision_id is null
      then 'GOOGLE_SYNCHRONIZATION' else provenance.authoring_authority end,
    'actorPlayerId',provenance.actor_player_id,
    'operation',history.operation,
    'selectedPickCount',(select pg_catalog.count(*)::integer
      from scoring_authority.draft_pick_facts pick
      where pick.revision_id=history.revision_id
        and pick.pick_status='SELECTED'),
    'effectiveAt',history.synchronized_at,
    'current',history.revision_id=current_pointer.revision_id
  ) order by history.revision_number desc),'[]'::jsonb)
  into history_value
  from (
    select value.* from scoring_authority.draft_revisions value
    where value.tournament_id=target
    order by value.revision_number desc limit history_limit_value
  ) history
  left join production_control.draft_revision_provenance_v1 provenance
    on provenance.revision_id=history.revision_id;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',team.team_id,'name',team.name,'side','Team '||team.team_side,
    'captainPlayerId',coalesce(nullif(
      team.source_payload->>'Captain Player ID',''),
      nullif(team.source_payload->>'Captain',''))
  ) order by team.team_side),'[]'::jsonb) into teams_value
  from scoring_authority.teams team where team.tournament_id=target;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',player.player_id,'name',player.display_name,
    'teamId',membership.team_id,'teamSide','Team '||membership.team_side
  ) order by player.display_name,player.player_id),'[]'::jsonb)
  into players_value
  from scoring_authority.tournament_players membership
  join scoring_authority.players player on player.player_id=membership.player_id
  where membership.tournament_id=target
    and membership.participation_status='ACTIVE';
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'action',event.action,'summary',event.summary,
    'actorPlayerId',event.actor_player_id,
    'createdAt',event.created_at
  ) order by event.created_at desc),'[]'::jsonb) into audit_value
  from (
    select value.* from production_control.draft_authoring_audit_events_v1 value
    where value.tournament_id=target
    order by value.created_at desc limit 50
  ) event;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'tournamentId',catalog.tournament_id,
    'tournamentYear',catalog.tournament_year,
    'name',catalog.tournament_name,
    'lifecycle',catalog.lifecycle,
    'current',catalog.tournament_id=annual_pointer.tournament_id
  ) order by catalog.tournament_year),'[]'::jsonb) into targets_value
  from production_control.future_tournament_catalog_v1 catalog
  join production_control.future_tournament_resources_v1 resource
    on resource.tournament_id=catalog.tournament_id
  where resource.project_ref=input->>'project_ref'
    and resource.project_url=input->>'project_url'
    and resource.project_ref !~* '(preview|staging|test)'
    and ((catalog.tournament_id=annual_pointer.tournament_id
          and catalog.tournament_year=annual_pointer.tournament_year
          and catalog.lifecycle='ACTIVE'
          and catalog.lifecycle_revision=annual_pointer.lifecycle_revision)
      or (catalog.tournament_year>annual_pointer.tournament_year
          and catalog.lifecycle in (
            'DRAFT','CONFIGURING','READY_FOR_ACTIVATION')));
  mutability_value := production_control.draft_mutability_v1(target);
  return pg_catalog.jsonb_build_object(
    'ok',true,
    'data',pg_catalog.jsonb_build_object(
      'contractVersion','production-draft-authoring-v1',
      'draftContractVersion','draft-projection-v1',
      'tournamentId',target,'tournamentYear',target_year,
      'currentTournamentId',annual_pointer.tournament_id,
      'currentTournamentYear',annual_pointer.tournament_year,
      'mutability',mutability_value,
      'dependencyReadiness',pg_catalog.jsonb_build_object(
        'status',case when pg_catalog.jsonb_array_length(dependency_issues)=0
          then 'READY' else 'CONFLICT' end,
        'issueCount',pg_catalog.jsonb_array_length(dependency_issues),
        'issues',dependency_issues),
      'current',current_row,
      'openDraft',case when open_draft.draft_id is null then null else
        pg_catalog.jsonb_build_object(
          'draftId',open_draft.draft_id,
          'draftRevision',open_draft.draft_revision,
          'state',open_draft.state,
          'authoringKind',open_draft.authoring_kind,
          'expectedRevision',open_draft.expected_revision,
          'sourceTournamentId',open_draft.source_tournament_id,
          'configuration',open_draft.configuration,
          'picks',open_draft.picks,
          'presentationSeed',open_draft.presentation_seed,
          'validationDiagnostics',open_draft.validation_diagnostics,
          'createdAt',open_draft.created_at,
          'validatedAt',open_draft.validated_at
        ) end,
      'draft',case when open_draft.draft_id is null then null else
        pg_catalog.jsonb_build_object(
          'draftId',open_draft.draft_id,'draftRevision',open_draft.draft_revision,
          'state',open_draft.state,'authoringKind',open_draft.authoring_kind,
          'expectedRevision',open_draft.expected_revision,
          'configuration',open_draft.configuration,'picks',open_draft.picks,
          'presentationSeed',open_draft.presentation_seed
        ) end,
      'history',history_value,'targets',targets_value,'teams',teams_value,
      'eligiblePlayers',players_value,'audit',audit_value,
      'googleAuthoring',pg_catalog.jsonb_build_object(
        'productionStatus','RETIRED',
        'classification','LEGACY_NON_AUTHORITATIVE'
      )
    )
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='22023',message='DRAFT_READ_INPUT_INVALID';
end;
$read_draft_authoring$;

create function public.read_production_draft_view_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $read_production_draft_view$
declare
  resource production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  scope_value text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'target_scope','YEARS')));
  selected_year integer;
  player_value text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'target_player_id','')));
  drafts_value jsonb;
begin
  perform production_control.assert_production_service_role();
  select value.* into strict resource from production_control.resource_scope value
  where value.scope_key='BAGGER_INV_PRODUCTION';
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key());
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key='BAGGER_INV_PRODUCTION';
  if input->>'environment' is distinct from 'PRODUCTION'
     or input->>'project_ref' is distinct from resource.project_ref
     or input->>'project_url' is distinct from resource.project_url
     or input->>'source_workbook_id' is distinct from resource.google_workbook_id
     or input->>'contract_version' is distinct from 'draft-projection-v1'
     or input->'source_tabs' is distinct from
       '["Draft Settings","Draft Picks"]'::jsonb
     or scope_value not in ('CURRENT','YEAR','YEARS','PLAYER') then
    raise exception using errcode='42501',
      message='PRODUCTION_DRAFT_READ_SCOPE_REQUIRED';
  end if;
  if scope_value='CURRENT' then
    if pointer.tournament_id='2026' and pointer.tournament_year=2026 then
      perform production_control.assert_frozen_2026_current_read_v1();
    else
      perform production_control.assert_annual_current_read_v1(input);
    end if;
    selected_year := pointer.tournament_year;
  elsif scope_value='YEAR' then
    begin selected_year := (input->>'target_year')::integer;
    exception when others then
      raise exception using errcode='22023',message='DRAFT_YEAR_REQUIRED';
    end;
    if selected_year not between 2000 and 2200 then
      raise exception using errcode='22023',message='DRAFT_YEAR_REQUIRED';
    end if;
  elsif scope_value='PLAYER' and player_value !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$' then
    raise exception using errcode='22023',message='DRAFT_PLAYER_REQUIRED';
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    production_control.draft_projection_row_v1(current_value.revision_id)
    order by current_value.tournament_year),'[]'::jsonb) into drafts_value
  from scoring_authority.draft_current_revisions current_value
  where current_value.tournament_year<=pointer.tournament_year
    and ((scope_value='YEARS')
      or (scope_value in ('CURRENT','YEAR')
        and current_value.tournament_year=selected_year)
      or (scope_value='PLAYER' and exists (
        select 1 from scoring_authority.draft_pick_facts pick
        where pick.revision_id=current_value.revision_id
          and pick.player_id=player_value and pick.pick_status='SELECTED'
      )));
  return pg_catalog.jsonb_build_object(
    'ok',true,
    'data',pg_catalog.jsonb_build_object(
      'contract_version','draft-projection-v1',
      'validation_status','VALID','drafts',drafts_value,
      'authoritative',true,'shadow_only',false,
      'google_foreground_requests',0,'fallback_used',false,
      'current_tournament_id',pointer.tournament_id,
      'current_tournament_year',pointer.tournament_year
    )
  );
end;
$read_production_draft_view$;

create function public.stage_production_draft_revision_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $stage_production_draft$
declare
  target text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  expected_value bigint;
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason',''));
  database_hash text;
  prior_receipt jsonb;
  current_pointer scoring_authority.draft_current_revisions%rowtype;
  current_revision scoring_authority.draft_revisions%rowtype;
  predecessor_picks jsonb := '[]'::jsonb;
  sanitized_picks jsonb;
  validation jsonb;
  next_draft_revision bigint;
  draft_id_value uuid;
  response_value jsonb;
  mutability jsonb;
begin
  target := production_control.assert_draft_authoring_v1(input);
  if input->>'operation' is distinct from
       'STAGE_PRODUCTION_DRAFT_REVISION_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_revision','') !~ '^[0-9]+$'
     or pg_catalog.jsonb_typeof(input->'configuration') is distinct from 'object'
     or pg_catalog.jsonb_typeof(input->'picks') is distinct from 'array'
     or reason_value='' or pg_catalog.length(reason_value)>500 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  expected_value := (input->>'expected_revision')::bigint;
  database_hash := production_control.draft_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','STAGE','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'expectedRevision',expected_value,
      'configuration',input->'configuration','picks',input->'picks',
      'reason',reason_value));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'STAGE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-draft-authoring:'||target,0));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'STAGE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  mutability := production_control.draft_mutability_v1(target);
  if not coalesce((mutability->>'editable')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_CORRECTION_REQUIRED',
      'mutability',mutability);
  end if;
  select value.* into current_pointer
  from scoring_authority.draft_current_revisions value
  where value.tournament_id=target for update;
  if current_pointer.revision_id is not null then
    select value.* into current_revision
    from scoring_authority.draft_revisions value
    where value.revision_id=current_pointer.revision_id;
    predecessor_picks := production_control.draft_projection_row_v1(
      current_pointer.revision_id)->'picks';
  end if;
  if coalesce(current_revision.revision_number,0)<>expected_value then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_PREDECESSOR_STALE',
      'currentRevision',coalesce(current_revision.revision_number,0));
  end if;
  sanitized_picks := production_control.draft_sanitize_pick_provenance_v1(
    input->'picks',predecessor_picks);
  validation := production_control.validate_draft_authoring_v1(
    target,input->'configuration',sanitized_picks);
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_VALIDATION_FAILED',
      'issues',validation->'issues');
  end if;
  if current_revision.revision_id is not null
     and current_revision.payload_fingerprint=
       validation->>'payloadFingerprint' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_NO_CHANGES');
  end if;
  update production_control.draft_authoring_drafts_v1 set state='SUPERSEDED'
  where tournament_id=target and state in ('STAGED','VALIDATED');
  select coalesce(pg_catalog.max(value.draft_revision),0)+1
    into next_draft_revision
  from production_control.draft_authoring_drafts_v1 value
  where value.tournament_id=target;
  insert into production_control.draft_authoring_drafts_v1 (
    tournament_id,draft_revision,state,authoring_kind,expected_revision,
    predecessor_revision_id,configuration,picks,presentation_seed,
    configuration_fingerprint,picks_fingerprint,payload_fingerprint,
    validation_diagnostics,reason,created_by_player_id,
    created_by_auth_user_id
  ) values (
    target,next_draft_revision,'STAGED','DIRECTOR_EDIT',expected_value,
    current_revision.revision_id,validation->'configuration',validation->'picks',
    validation->'presentationSeed',validation->>'configurationFingerprint',
    validation->>'picksFingerprint',validation->>'payloadFingerprint',
    validation->'diagnostics',reason_value,actor_player,actor_auth
  ) returning draft_id into draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','DRAFT_REVISION_STAGED','idempotent',false,
    'tournamentId',target,'draftId',draft_id_value,
    'draftRevision',next_draft_revision,'state','STAGED',
    'expectedRevision',expected_value,
    'configuration',validation->'configuration','picks',validation->'picks',
    'validationDiagnostics',validation->'diagnostics');
  insert into production_control.draft_authoring_audit_events_v1 (
    tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,
    operation_request_id,summary
  ) values (
    target,draft_id_value,'REVISION_STAGED',actor_player,actor_auth,request_id,
    pg_catalog.jsonb_build_object(
      'draftRevision',next_draft_revision,
      'predecessorRevision',expected_value,
      'totalPicks',(validation#>>'{configuration,total_picks}')::integer,
      'selectedPicks',(validation#>>'{diagnostics,selectedPicks}')::integer));
  insert into production_control.draft_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'STAGE',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','DRAFT_INPUT_INVALID');
when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','DRAFT_OPERATION_CONFLICT');
end;
$stage_production_draft$;

create function public.validate_production_draft_revision_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $validate_production_draft_revision$
declare
  target text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  expected_value bigint;
  database_hash text;
  prior_receipt jsonb;
  draft production_control.draft_authoring_drafts_v1%rowtype;
  current_revision scoring_authority.draft_revisions%rowtype;
  validation jsonb;
  response_value jsonb;
  mutability jsonb;
begin
  target := production_control.assert_draft_authoring_v1(input);
  if input->>'operation' is distinct from
       'VALIDATE_PRODUCTION_DRAFT_REVISION_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'draft_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_revision','') !~ '^[0-9]+$' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_value := (input->>'expected_revision')::bigint;
  database_hash := production_control.draft_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','VALIDATE','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'draftId',draft_id_value,'expectedRevision',expected_value));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'VALIDATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-draft-authoring:'||target,0));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'VALIDATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  mutability := production_control.draft_mutability_v1(target);
  if not coalesce((mutability->>'editable')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_CORRECTION_REQUIRED','mutability',mutability);
  end if;
  select value.* into strict draft
  from production_control.draft_authoring_drafts_v1 value
  where value.draft_id=draft_id_value and value.tournament_id=target
  for update;
  select revision.* into current_revision
  from scoring_authority.draft_current_revisions pointer
  join scoring_authority.draft_revisions revision
    on revision.revision_id=pointer.revision_id
  where pointer.tournament_id=target for update of pointer;
  if coalesce(current_revision.revision_number,0)<>expected_value
     or draft.expected_revision<>expected_value
     or draft.state not in ('STAGED','VALIDATED') then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_PREDECESSOR_STALE');
  end if;
  validation := production_control.validate_draft_authoring_v1(
    target,draft.configuration,draft.picks);
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_VALIDATION_FAILED',
      'issues',validation->'issues');
  end if;
  update production_control.draft_authoring_drafts_v1 set
    state='VALIDATED',configuration=validation->'configuration',
    picks=validation->'picks',presentation_seed=validation->'presentationSeed',
    configuration_fingerprint=validation->>'configurationFingerprint',
    picks_fingerprint=validation->>'picksFingerprint',
    payload_fingerprint=validation->>'payloadFingerprint',
    validation_diagnostics=validation->'diagnostics'||
      pg_catalog.jsonb_build_object('validated',true),
    validated_at=coalesce(validated_at,pg_catalog.clock_timestamp())
  where draft_id=draft_id_value;
  if draft.state='STAGED' then
    insert into production_control.draft_authoring_audit_events_v1 (
      tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,
      operation_request_id,summary
    ) values (
      target,draft_id_value,'REVISION_VALIDATED',actor_player,actor_auth,
      request_id,pg_catalog.jsonb_build_object(
        'draftRevision',draft.draft_revision,
        'totalPicks',(validation#>>'{configuration,total_picks}')::integer,
        'selectedPicks',(validation#>>'{diagnostics,selectedPicks}')::integer));
  end if;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','DRAFT_REVISION_VALIDATED',
    'idempotent',draft.state='VALIDATED','tournamentId',target,
    'draftId',draft_id_value,'draftRevision',draft.draft_revision,
    'state','VALIDATED','configuration',validation->'configuration',
    'picks',validation->'picks',
    'validationDiagnostics',validation->'diagnostics');
  insert into production_control.draft_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'VALIDATE',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','DRAFT_STAGED_REVISION_NOT_FOUND');
end;
$validate_production_draft_revision$;

create function public.commit_production_draft_revision_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $commit_production_draft_revision$
declare
  target text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  expected_value bigint;
  database_hash text;
  prior_receipt jsonb;
  draft production_control.draft_authoring_drafts_v1%rowtype;
  current_revision scoring_authority.draft_revisions%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  resource production_control.resource_scope%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  annual_resource production_control.future_tournament_resources_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  binding production_control.future_annual_projection_bindings_v1%rowtype;
  final_picks jsonb;
  validation jsonb;
  next_revision bigint;
  next_binding_revision bigint;
  revision_id_value uuid;
  source_hash text;
  binding_payload_hash text;
  selected_count integer;
  effective_at_value timestamptz;
  projection_row jsonb;
  projection_value jsonb;
  response_value jsonb;
  operation_value text;
  mutability jsonb;
  pick_event record;
begin
  target := production_control.assert_draft_authoring_v1(input);
  if input->>'operation' is distinct from
       'COMMIT_PRODUCTION_DRAFT_REVISION_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'draft_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_revision','') !~ '^[0-9]+$'
     or input->>'confirmation' is distinct from 'SAVE DRAFT REVISION' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_COMMIT_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_value := (input->>'expected_revision')::bigint;
  database_hash := production_control.draft_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','COMMIT','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'draftId',draft_id_value,'expectedRevision',expected_value,
      'confirmation',input->>'confirmation'));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'COMMIT',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-draft-authoring:'||target,0));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'COMMIT',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  mutability := production_control.draft_mutability_v1(target);
  if not coalesce((mutability->>'editable')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_CORRECTION_REQUIRED','mutability',mutability);
  end if;
  select value.* into strict draft
  from production_control.draft_authoring_drafts_v1 value
  where value.draft_id=draft_id_value and value.tournament_id=target
  for update;
  select revision.* into current_revision
  from scoring_authority.draft_current_revisions current_value
  join scoring_authority.draft_revisions revision
    on revision.revision_id=current_value.revision_id
  where current_value.tournament_id=target for update of current_value;
  if coalesce(current_revision.revision_number,0)<>expected_value
     or draft.expected_revision<>expected_value then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_PREDECESSOR_STALE',
      'currentRevision',coalesce(current_revision.revision_number,0));
  end if;
  if draft.state<>'VALIDATED' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_STAGED_REVISION_NOT_VALIDATED');
  end if;
  effective_at_value := pg_catalog.clock_timestamp();
  final_picks := production_control.draft_commit_pick_provenance_v1(
    draft.picks,actor_player,effective_at_value);
  validation := production_control.validate_draft_authoring_v1(
    target,draft.configuration,final_picks);
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_VALIDATION_FAILED',
      'issues',validation->'issues');
  end if;
  if current_revision.revision_id is not null
     and current_revision.payload_fingerprint=
       validation->>'payloadFingerprint' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_NO_CHANGES');
  end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key='BAGGER_INV_PRODUCTION';
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key='BAGGER_INV_PRODUCTION';
  select coalesce(pg_catalog.max(value.revision_number),0)+1
    into next_revision
  from scoring_authority.draft_revisions value
  where value.tournament_id=target;
  source_hash := production_control.draft_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'authoringAuthority','SUPABASE_DIRECTOR',
      'authoringContract','production-draft-authoring-v1',
      'tournamentId',target,'revision',next_revision,
      'configuration',validation->'configuration',
      'picks',validation->'picks'));
  selected_count := (validation#>>'{diagnostics,selectedPicks}')::integer;
  operation_value := case when draft.authoring_kind='COPIED_PREVIOUS'
    then 'DIRECTOR_CLONE' else 'DIRECTOR_REVISION' end;
  perform pg_catalog.set_config(
    'scoring_authority.draft_projection_import','on',true);
  insert into scoring_authority.draft_revisions (
    project_ref,source_workbook_id,source_tabs,tournament_id,tournament_year,
    revision_number,previous_revision_id,source_fingerprint,
    configuration_fingerprint,picks_fingerprint,payload_fingerprint,
    contract_version,validation_status,validation_diagnostics,
    source_settings,source_picks,configuration,presentation_seed,
    operation,correction_reason,synchronized_by,synchronized_at
  ) values (
    resource.project_ref,resource.google_workbook_id,
    '["Draft Settings","Draft Picks"]'::jsonb,target,target::integer,
    next_revision,current_revision.revision_id,source_hash,
    validation->>'configurationFingerprint',validation->>'picksFingerprint',
    validation->>'payloadFingerprint','draft-projection-v1','VALID',
    (validation->'diagnostics')||pg_catalog.jsonb_build_object(
      'authoringAuthority','SUPABASE_DIRECTOR',
      'authoringContract','production-draft-authoring-v1'),
    validation->'configuration',validation->'picks',
    validation->'configuration',validation->'presentationSeed',
    operation_value,null,actor_player,effective_at_value
  ) returning revision_id into revision_id_value;
  insert into scoring_authority.draft_configuration_facts (
    revision_id,tournament_id,tournament_year,draft_name,draft_date,draft_time,
    time_zone,location,status_mode,draft_format,total_picks,team_1_id,team_2_id,
    team_1_captain_player_id,team_2_captain_player_id,first_pick_team_id,notes
  ) values (
    revision_id_value,target,target::integer,
    validation#>>'{configuration,name}',
    nullif(validation#>>'{configuration,date}',''),
    nullif(validation#>>'{configuration,time}',''),
    nullif(validation#>>'{configuration,time_zone}',''),
    nullif(validation#>>'{configuration,location}',''),
    nullif(validation#>>'{configuration,status_mode}',''),
    nullif(validation#>>'{configuration,format}',''),
    (validation#>>'{configuration,total_picks}')::integer,
    validation#>>'{configuration,team_1_id}',
    validation#>>'{configuration,team_2_id}',
    nullif(validation#>>'{configuration,team_1_captain_player_id}',''),
    nullif(validation#>>'{configuration,team_2_captain_player_id}',''),
    validation#>>'{configuration,first_pick_team_id}',
    nullif(validation#>>'{configuration,notes}',''));
  insert into scoring_authority.draft_pick_facts (
    revision_id,tournament_id,tournament_year,pick_number,round_number,
    pick_within_round,source_team_id,team_id,player_id,player_name_snapshot,
    selected_at_source,selected_by_source,pick_status,notes,
    presentation_snapshot
  ) select revision_id_value,target,target::integer,
    (item.value->>'pick_number')::integer,
    (item.value->>'round_number')::integer,
    (item.value->>'pick_within_round')::integer,
    nullif(item.value->>'source_team_id',''),nullif(item.value->>'team_id',''),
    nullif(item.value->>'player_id',''),nullif(item.value->>'player_name',''),
    nullif(item.value->>'selected_at',''),nullif(item.value->>'selected_by',''),
    item.value->>'status',nullif(item.value->>'notes',''),
    coalesce(item.value->'presentation','{}'::jsonb)
  from pg_catalog.jsonb_array_elements(validation->'picks') item;
  insert into scoring_authority.draft_current_revisions (
    tournament_id,tournament_year,revision_id,advanced_by,advanced_at
  ) values (
    target,target::integer,revision_id_value,actor_player,effective_at_value
  ) on conflict (tournament_id) do update set
    tournament_year=excluded.tournament_year,
    revision_id=excluded.revision_id,advanced_by=excluded.advanced_by,
    advanced_at=excluded.advanced_at;
  insert into production_control.draft_revision_provenance_v1 (
    revision_id,tournament_id,authoring_authority,authoring_contract,draft_id,
    actor_player_id,actor_auth_user_id,authoring_kind,selected_pick_count,
    created_at
  ) values (
    revision_id_value,target,'SUPABASE_DIRECTOR',
    'production-draft-authoring-v1',draft_id_value,actor_player,actor_auth,
    draft.authoring_kind,selected_count,effective_at_value);

  if target<>pointer.tournament_id then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id=target for update;
    select value.* into strict annual_resource
    from production_control.future_tournament_resources_v1 value
    where value.tournament_id=target
      and value.source_workbook_id is not null
      and value.resource_status='CURRENT_RESOURCE_BOUND' for share;
    select value.* into promotion
    from production_control.future_runtime_promotions_v2 value
    where value.tournament_id=target;
    select value.* into binding
    from production_control.future_annual_projection_bindings_v1 value
    where value.tournament_id=target and value.domain='DRAFT' for update;
    update production_control.future_tournament_catalog_v1 value set
      lifecycle=case when value.lifecycle='READY_FOR_ACTIVATION'
        then 'CONFIGURING' else value.lifecycle end,
      lifecycle_revision=case when value.lifecycle='READY_FOR_ACTIVATION'
        then value.lifecycle_revision+1 else value.lifecycle_revision end,
      setup_revision=case when promotion.tournament_id is null
        then value.setup_revision+1 else value.setup_revision end,
      readiness_fingerprint=null,readiness_setup_revision=null,
      updated_by_player_id=actor_player,updated_at=effective_at_value
    where value.tournament_id=target;
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id=target;
    next_binding_revision:=coalesce(binding.binding_revision,0)+1;
    projection_row:=production_control.draft_projection_row_v1(
      revision_id_value);
    projection_value:=pg_catalog.jsonb_build_object(
      'drafts',pg_catalog.jsonb_build_array(projection_row),
      'synchronization_fingerprint',source_hash,
      'authoring_authority','SUPABASE_DIRECTOR');
    binding_payload_hash:=production_control.draft_authoring_hash_v1(
      projection_value);
    insert into production_control.future_annual_projection_bindings_v1 (
      tournament_id,domain,source_workbook_id,source_revision,
      binding_revision,source_fingerprint,payload_fingerprint,projection,
      certification_status,certified_by_player_id,certified_at,
      authoring_authority
    ) values (
      target,'DRAFT',annual_resource.source_workbook_id,next_revision,
      next_binding_revision,source_hash,binding_payload_hash,projection_value,
      'CERTIFIED',actor_player,effective_at_value,'SUPABASE_DIRECTOR'
    ) on conflict (tournament_id,domain) do update set
      source_workbook_id=excluded.source_workbook_id,
      source_revision=excluded.source_revision,
      binding_revision=excluded.binding_revision,
      source_fingerprint=excluded.source_fingerprint,
      payload_fingerprint=excluded.payload_fingerprint,
      projection=excluded.projection,
      certification_status=excluded.certification_status,
      certified_by_player_id=excluded.certified_by_player_id,
      certified_at=excluded.certified_at,
      authoring_authority=excluded.authoring_authority,
      updated_at=effective_at_value;
  end if;
  update production_control.draft_authoring_drafts_v1 set
    state='COMMITTED',configuration=validation->'configuration',
    picks=validation->'picks',presentation_seed=validation->'presentationSeed',
    configuration_fingerprint=validation->>'configurationFingerprint',
    picks_fingerprint=validation->>'picksFingerprint',
    payload_fingerprint=validation->>'payloadFingerprint',
    validation_diagnostics=validation->'diagnostics'||
      pg_catalog.jsonb_build_object('committed',true),
    committed_revision_id=revision_id_value,committed_at=effective_at_value
  where draft_id=draft_id_value;
  response_value:=pg_catalog.jsonb_build_object(
    'ok',true,'code','DRAFT_REVISION_COMMITTED','idempotent',false,
    'tournamentId',target,'revisionId',revision_id_value,
    'revision',next_revision,'previousRevisionId',current_revision.revision_id,
    'authoringAuthority','SUPABASE_DIRECTOR',
    'selectedPickCount',selected_count,'effectiveAt',effective_at_value,
    'current',production_control.draft_projection_row_v1(revision_id_value));
  insert into production_control.draft_authoring_audit_events_v1 (
    tournament_id,draft_id,revision_id,action,actor_player_id,
    actor_auth_user_id,operation_request_id,summary
  ) values (
    target,draft_id_value,revision_id_value,'REVISION_COMMITTED',
    actor_player,actor_auth,request_id,pg_catalog.jsonb_build_object(
      'revision',next_revision,'predecessorRevision',expected_value,
      'selectedPickCount',selected_count,
      'summary','Draft Revision '||next_revision||' saved'));
  for pick_event in
    select current_pick.pick_number,current_pick.team_id,
      current_pick.player_id,current_pick.pick_status,
      previous_pick.player_id as previous_player_id,
      previous_pick.team_id as previous_team_id
    from scoring_authority.draft_pick_facts current_pick
    left join scoring_authority.draft_pick_facts previous_pick
      on previous_pick.revision_id=current_revision.revision_id
     and previous_pick.pick_number=current_pick.pick_number
     and previous_pick.pick_status='SELECTED'
    where current_pick.revision_id=revision_id_value and (
      (current_pick.pick_status='SELECTED' and (
        previous_pick.pick_number is null
        or previous_pick.player_id is distinct from current_pick.player_id
        or previous_pick.team_id is distinct from current_pick.team_id
      )) or (
        current_pick.pick_status<>'SELECTED'
        and previous_pick.pick_number is not null
      )
    )
    order by current_pick.pick_number
  loop
    insert into production_control.draft_authoring_audit_events_v1 (
      tournament_id,draft_id,revision_id,action,actor_player_id,
      actor_auth_user_id,operation_request_id,summary
    ) values (
      target,draft_id_value,revision_id_value,
      case when pick_event.previous_player_id is null
             and pick_event.pick_status='SELECTED'
        then 'PICK_RECORDED' else 'PICK_CORRECTED' end,
      actor_player,actor_auth,request_id,pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
        'pickNumber',pick_event.pick_number,
        'playerId',case when pick_event.pick_status='SELECTED'
          then pick_event.player_id else null end,
        'teamId',pick_event.team_id,
        'summary',case
          when pick_event.pick_status<>'SELECTED'
            then 'Pick '||pick_event.pick_number||' cleared'
          when pick_event.previous_player_id is null
          then 'Pick '||pick_event.pick_number||' recorded — Player '||
            pick_event.player_id||' to Team '||pick_event.team_id
          else 'Pick '||pick_event.pick_number||' corrected — Player '||
            pick_event.player_id||' to Team '||pick_event.team_id end)));
  end loop;
  if (
       pg_catalog.upper(validation#>>'{configuration,status_mode}')='COMPLETE'
       or selected_count >= (validation#>>'{configuration,total_picks}')::integer
     ) and not (
       pg_catalog.upper(coalesce(
         current_revision.configuration->>'status_mode',''))='COMPLETE'
       or (
         coalesce((current_revision.configuration->>'total_picks')::integer,0)>0
         and (select pg_catalog.count(*)::integer
           from scoring_authority.draft_pick_facts previous_pick
           where previous_pick.revision_id=current_revision.revision_id
             and previous_pick.pick_status='SELECTED') >=
           coalesce((current_revision.configuration->>'total_picks')::integer,0)
       )
     ) then
    insert into production_control.draft_authoring_audit_events_v1 (
      tournament_id,draft_id,revision_id,action,actor_player_id,
      actor_auth_user_id,operation_request_id,summary
    ) values (
      target,draft_id_value,revision_id_value,'DRAFT_COMPLETED',
      actor_player,actor_auth,request_id,pg_catalog.jsonb_build_object(
        'revision',next_revision,
        'summary','Draft completed at Revision '||next_revision));
  end if;
  insert into production_control.operation_audit_events (
    event_type,domain,tournament_id,actor,request_fingerprint,result,details
  ) values (
    'PRODUCTION_DRAFT_REVISION_COMMITTED','DRAFT',target,actor_player,null,
    'SUCCEEDED',pg_catalog.jsonb_build_object(
      'revision',next_revision,'selected_pick_count',selected_count,
      'authoring_authority','SUPABASE_DIRECTOR'));
  insert into production_control.draft_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'COMMIT',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','DRAFT_STAGED_REVISION_NOT_FOUND');
when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','DRAFT_OPERATION_CONFLICT');
end;
$commit_production_draft_revision$;

create function public.copy_production_draft_setup_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $copy_production_draft_setup$
declare
  target text;
  source_target text := pg_catalog.btrim(coalesce(
    input->>'source_tournament_id',''));
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  expected_value bigint;
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason',''));
  database_hash text;
  prior_receipt jsonb;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  source_revision scoring_authority.draft_revisions%rowtype;
  target_revision scoring_authority.draft_revisions%rowtype;
  source_config jsonb;
  copied_config jsonb;
  copied_picks jsonb;
  validation jsonb;
  next_draft_revision bigint;
  draft_id_value uuid;
  response_value jsonb;
  team_one text;
  team_two text;
  first_team text;
  captain_one text;
  captain_two text;
  total_value integer;
  format_value text;
  mutability jsonb;
begin
  target := production_control.assert_draft_authoring_v1(input);
  if input->>'operation' is distinct from 'COPY_PRODUCTION_DRAFT_SETUP_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_revision','') !~ '^[0-9]+$'
     or source_target !~ '^20[0-9]{2}$'
     or reason_value='' or pg_catalog.length(reason_value)>500 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_INPUT_INVALID');
  end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key='BAGGER_INV_PRODUCTION';
  if target=pointer.tournament_id
     or source_target::integer<>target::integer-1 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_COPY_PREVIOUS_YEAR_REQUIRED');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  expected_value := (input->>'expected_revision')::bigint;
  database_hash := production_control.draft_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','COPY_PREVIOUS','tournamentId',target,
      'sourceTournamentId',source_target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'expectedRevision',expected_value,'reason',reason_value));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'COPY_PREVIOUS',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-draft-authoring:'||target,0));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'COPY_PREVIOUS',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  mutability := production_control.draft_mutability_v1(target);
  if not coalesce((mutability->>'editable')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_CORRECTION_REQUIRED','mutability',mutability);
  end if;
  select revision.* into strict source_revision
  from scoring_authority.draft_current_revisions current_value
  join scoring_authority.draft_revisions revision
    on revision.revision_id=current_value.revision_id
  where current_value.tournament_id=source_target;
  select revision.* into target_revision
  from scoring_authority.draft_current_revisions current_value
  join scoring_authority.draft_revisions revision
    on revision.revision_id=current_value.revision_id
  where current_value.tournament_id=target for update of current_value;
  if coalesce(target_revision.revision_number,0)<>expected_value then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_PREDECESSOR_STALE',
      'currentRevision',coalesce(target_revision.revision_number,0));
  end if;
  source_config:=source_revision.configuration;
  team_one:=pg_catalog.upper(pg_catalog.btrim(source_config->>'team_1_id'));
  team_two:=pg_catalog.upper(pg_catalog.btrim(source_config->>'team_2_id'));
  first_team:=pg_catalog.upper(pg_catalog.btrim(
    source_config->>'first_pick_team_id'));
  captain_one:=pg_catalog.upper(pg_catalog.btrim(coalesce(
    source_config->>'team_1_captain_player_id','')));
  captain_two:=pg_catalog.upper(pg_catalog.btrim(coalesce(
    source_config->>'team_2_captain_player_id','')));
  if captain_one<>'' and not exists (
    select 1 from scoring_authority.tournament_players value
    where value.tournament_id=target and value.player_id=captain_one
      and value.participation_status='ACTIVE'
  ) then captain_one:=''; end if;
  if captain_two<>'' and not exists (
    select 1 from scoring_authority.tournament_players value
    where value.tournament_id=target and value.player_id=captain_two
      and value.participation_status='ACTIVE'
  ) then captain_two:=''; end if;
  total_value:=(source_config->>'total_picks')::integer;
  format_value:=coalesce(source_config->>'format','');
  copied_config:=pg_catalog.jsonb_build_object(
    'year',target::integer,'name',target||' Sandbagger Draft',
    'date','','time','',
    'time_zone',coalesce(source_config->>'time_zone',''),
    'location',coalesce(source_config->>'location',''),
    'status_mode','Automatic','format',format_value,
    'total_picks',total_value,'team_1_id',team_one,'team_2_id',team_two,
    'team_1_captain_player_id',captain_one,
    'team_2_captain_player_id',captain_two,
    'first_pick_team_id',first_team,
    'notes',coalesce(source_config->>'notes',''));
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'pick_number',number_value,
    'team_id',case when pg_catalog.upper(format_value)='SNAKE' then
      case when pg_catalog.mod((number_value-1)/2,2)=0 then
        case when pg_catalog.mod(number_value-1,2)=0 then first_team
          else case when first_team=team_one then team_two else team_one end end
      else case when pg_catalog.mod(number_value-1,2)=0 then
          case when first_team=team_one then team_two else team_one end
        else first_team end end
      else '' end,
    'player_id','','selected_at','','selected_by','','notes',''
  ) order by number_value) into copied_picks
  from pg_catalog.generate_series(1,total_value) number_value;
  validation:=production_control.validate_draft_authoring_v1(
    target,copied_config,copied_picks);
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_COPY_TARGET_VALIDATION_FAILED',
      'issues',validation->'issues');
  end if;
  update production_control.draft_authoring_drafts_v1 set state='SUPERSEDED'
  where tournament_id=target and state in ('STAGED','VALIDATED');
  select coalesce(pg_catalog.max(value.draft_revision),0)+1
    into next_draft_revision
  from production_control.draft_authoring_drafts_v1 value
  where value.tournament_id=target;
  insert into production_control.draft_authoring_drafts_v1 (
    tournament_id,draft_revision,state,authoring_kind,expected_revision,
    predecessor_revision_id,source_tournament_id,source_revision_id,
    configuration,picks,presentation_seed,configuration_fingerprint,
    picks_fingerprint,payload_fingerprint,validation_diagnostics,reason,
    created_by_player_id,created_by_auth_user_id
  ) values (
    target,next_draft_revision,'STAGED','COPIED_PREVIOUS',expected_value,
    target_revision.revision_id,source_target,source_revision.revision_id,
    validation->'configuration',validation->'picks',
    validation->'presentationSeed',validation->>'configurationFingerprint',
    validation->>'picksFingerprint',validation->>'payloadFingerprint',
    (validation->'diagnostics')||pg_catalog.jsonb_build_object(
      'sourceTournamentId',source_target,
      'sourceRevision',source_revision.revision_number,
      'setupOnly',true,'selectedPlayersCopied',false,
      'selectionTimestampsCopied',false,'auditCopied',false),
    reason_value,actor_player,actor_auth
  ) returning draft_id into draft_id_value;
  response_value:=pg_catalog.jsonb_build_object(
    'ok',true,'code','DRAFT_PREVIOUS_SETUP_COPIED','idempotent',false,
    'tournamentId',target,'sourceTournamentId',source_target,
    'sourceRevision',source_revision.revision_number,
    'draftId',draft_id_value,'draftRevision',next_draft_revision,
    'state','STAGED','requiresReview',true,'madeCurrent',false,
    'configuration',validation->'configuration','picks',validation->'picks',
    'selectedPlayersCopied',false,'selectionTimestampsCopied',false);
  insert into production_control.draft_authoring_audit_events_v1 (
    tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,
    operation_request_id,summary
  ) values (
    target,draft_id_value,'PREVIOUS_SETUP_COPIED',actor_player,actor_auth,
    request_id,pg_catalog.jsonb_build_object(
      'draftRevision',next_draft_revision,
      'sourceTournamentId',source_target,
      'sourceRevision',source_revision.revision_number,
      'setupOnly',true,'selectedPlayersCopied',false,'madeCurrent',false));
  insert into production_control.operation_audit_events (
    event_type,domain,tournament_id,actor,request_fingerprint,result,details
  ) values (
    'PRODUCTION_DRAFT_PREVIOUS_SETUP_COPIED','DRAFT',target,actor_player,null,
    'SUCCEEDED',pg_catalog.jsonb_build_object(
      'draft_revision',next_draft_revision,
      'source_tournament_id',source_target,
      'setup_only',true,'selected_players_copied',false,'made_current',false));
  insert into production_control.draft_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'COPY_PREVIOUS',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','DRAFT_COPY_SOURCE_REQUIRED');
when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','DRAFT_INPUT_INVALID');
end;
$copy_production_draft_setup$;

-- Retire only Draft from both current and future Google synchronization.
-- The delegated Step 13E.8A wrapper continues to reject Prediction Settings
-- and continues to serve Guide unchanged.
alter function public.synchronize_production_director_projection(jsonb)
  rename to sync_prod_director_projection_before_draft_retirement_v1;
revoke all on function
  public.sync_prod_director_projection_before_draft_retirement_v1(jsonb)
  from public, anon, authenticated, service_role;

create function public.synchronize_production_director_projection(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $retire_current_draft_google_sync$
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(input->>'domain','')))='DRAFT'
  then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_GOOGLE_AUTHORING_RETIRED',
      'authoringAuthority','SUPABASE',
      'googleClassification','LEGACY_NON_AUTHORITATIVE');
  end if;
  return public.sync_prod_director_projection_before_draft_retirement_v1(
    input);
end;
$retire_current_draft_google_sync$;

alter function public.synchronize_production_future_annual_projection_v1(jsonb)
  rename to sync_prod_future_projection_before_draft_retirement_v1;
revoke all on function
  public.sync_prod_future_projection_before_draft_retirement_v1(jsonb)
  from public, anon, authenticated, service_role;

create function public.synchronize_production_future_annual_projection_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $retire_future_draft_google_sync$
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(input->>'domain','')))='DRAFT'
  then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_GOOGLE_AUTHORING_RETIRED',
      'authoringAuthority','SUPABASE',
      'googleClassification','LEGACY_NON_AUTHORITATIVE');
  end if;
  return public.sync_prod_future_projection_before_draft_retirement_v1(input);
end;
$retire_future_draft_google_sync$;

-- Keep the established Director operations feed bounded while adding only
-- human-readable Draft authoring events. Internal draft/revision/request UUIDs
-- and canonical payload material never enter this projection.
create function production_control.director_private_audit_with_draft_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $director_private_audit_with_draft$
  with existing_rows as (
    select
      (item->>'occurred_at')::timestamptz occurred_at,
      coalesce(item->>'category','SYSTEM') category,
      coalesce(item->>'action','UPDATED') action,
      coalesce(item->>'title','Director operation completed') title,
      coalesce(item->>'summary','The operation was confirmed.') summary,
      coalesce(item->>'status','SUCCESS') status,
      coalesce(item#>>'{actor,display_name}','Tournament Director') actor_name,
      coalesce(item->'context',pg_catalog.jsonb_build_object(
        'tournament_id','2026')) context_value
    from pg_catalog.jsonb_array_elements(
      production_control.director_private_audit_with_access_v1()) item
  ), draft_rows as (
    select event.created_at occurred_at,
      'DRAFT'::text category,event.action,
      case event.action
        when 'REVISION_STAGED' then pg_catalog.format(
          'Draft revision %s staged',event.summary->>'draftRevision')
        when 'REVISION_VALIDATED' then pg_catalog.format(
          'Draft revision %s validated',event.summary->>'draftRevision')
        when 'REVISION_COMMITTED' then coalesce(
          nullif(event.summary->>'summary',''),'Draft revision saved')
        when 'PICK_RECORDED' then coalesce(
          nullif(event.summary->>'summary',''),'Draft pick recorded')
        when 'PICK_CORRECTED' then coalesce(
          nullif(event.summary->>'summary',''),'Draft pick corrected')
        when 'DRAFT_COMPLETED' then coalesce(
          nullif(event.summary->>'summary',''),'Draft completed')
        when 'PREVIOUS_SETUP_COPIED' then pg_catalog.format(
          'Previous Draft setup copied to %s',event.tournament_id)
        else 'Draft operation completed'
      end title,
      case event.action
        when 'REVISION_STAGED'
          then 'Draft setup and picks were staged for Director review.'
        when 'REVISION_VALIDATED'
          then 'Draft setup and picks passed the canonical Draft checks.'
        when 'REVISION_COMMITTED'
          then 'The Supabase Draft revision became authoritative.'
        when 'PICK_RECORDED'
          then 'A Draft selection was recorded in the authoritative revision.'
        when 'PICK_CORRECTED'
          then 'A Draft selection was corrected before the Draft was frozen.'
        when 'DRAFT_COMPLETED'
          then 'The Draft became complete and ordinary editing was frozen.'
        when 'PREVIOUS_SETUP_COPIED'
          then 'Only prior-year Draft setup defaults were copied; no picks or selected Players were copied.'
        else 'The Draft operation completed.'
      end summary,
      'SUCCESS'::text status,
      coalesce(actor.display_name,'Tournament Director') actor_name,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'tournament_id',event.tournament_id,
        'revision',case when event.action='REVISION_COMMITTED'
          then event.summary->'revision' else null end,
        'draft_revision',case when event.action<>'REVISION_COMMITTED'
          then event.summary->'draftRevision' else null end,
        'source_tournament_id',event.summary->'sourceTournamentId',
        'selected_pick_count',coalesce(
          event.summary->'selectedPickCount',event.summary->'selectedPicks'),
        'pick_number',event.summary->'pickNumber',
        'player_id',event.summary->'playerId',
        'team_id',event.summary->'teamId'
      )) context_value
    from production_control.draft_authoring_audit_events_v1 event
    left join scoring_authority.players actor
      on actor.player_id=event.actor_player_id
    where event.created_at>=pg_catalog.now()-interval '90 days'
  ), merged as (
    select * from existing_rows
    union all
    select * from draft_rows
  ), bounded as (
    select pg_catalog.row_number() over (
      order by merged.occurred_at desc,merged.title)::integer sequence,
      merged.*
    from merged
    order by merged.occurred_at desc,merged.title
    limit 60
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'sequence',bounded.sequence,'category',bounded.category,
    'action',bounded.action,'title',bounded.title,'summary',bounded.summary,
    'status',bounded.status,
    'actor',pg_catalog.jsonb_build_object('display_name',bounded.actor_name),
    'context',bounded.context_value,'occurred_at',bounded.occurred_at
  ) order by bounded.occurred_at desc,bounded.sequence),'[]'::jsonb)
  from bounded
$director_private_audit_with_draft$;

create or replace function public.read_production_director_operations_v1(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority,
  participant_identity, auth
as $read_director_operations_with_draft$
begin
  perform production_control.assert_production_service_role();
  perform production_control.assert_production_cutover_read_scope(
    input,'OBSERVATION');
  perform production_control.assert_production_scoring_actor(input,true);
  if input->>'contract_version' is distinct from
       'production-director-private-operations-v1'
     or input->>'operation' is distinct from
       'READ_PRODUCTION_DIRECTOR_OPERATIONS_V1'
     or pg_catalog.upper(coalesce(input->>'environment',''))<>'PRODUCTION'
     or input->>'project_ref' is distinct from
       'ymqhhtxaywtqllynrmxe'
     or input->>'project_url' is distinct from
       'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or input->>'source_workbook_id' is distinct from
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or input->>'tournament_id' is distinct from '2026'
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'vercel_team_id' is distinct from
       'team_kPw5zaib8uaQJALAwj4fWI6R'
     or pg_catalog.lower(coalesce(input->>'vercel_environment',''))<>
       'production' then
    raise exception using errcode='42501',
      message='PRODUCTION_DIRECTOR_PRIVATE_RESOURCE_REQUIRED';
  end if;
  return pg_catalog.jsonb_build_object(
    'ok',true,'data',pg_catalog.jsonb_build_object(
      'contract_version','production-director-private-operations-v1',
      'tournament_id','2026',
      'calcutta',production_control.director_private_calcutta_v1(),
      'net_skins',production_control.director_private_net_skins_v1(),
      'audit_timeline',
        production_control.director_private_audit_with_draft_v1(),
      'bounds',pg_catalog.jsonb_build_object(
        'job_limit_per_domain',8,'audit_limit',60,'audit_window_days',90)));
end;
$read_director_operations_with_draft$;

revoke all on function public.import_production_draft_projection(jsonb)
  from public, anon, authenticated, service_role;

revoke all on function
  production_control.reject_draft_authoring_immutable_v1(),
  production_control.draft_authoring_canonical_json_v1(jsonb),
  production_control.draft_authoring_hash_v1(jsonb),
  production_control.draft_team_presentation_v1(text,text,text),
  production_control.draft_player_presentation_v1(text,text),
  production_control.draft_date_valid_v1(text),
  production_control.draft_time_valid_v1(text),
  production_control.draft_time_zone_valid_v1(text),
  production_control.validate_draft_authoring_v1(text,jsonb,jsonb),
  production_control.draft_sanitize_pick_provenance_v1(jsonb,jsonb),
  production_control.draft_commit_pick_provenance_v1(jsonb,text,timestamptz),
  production_control.assert_draft_authoring_v1(jsonb),
  production_control.draft_mutability_v1(text),
  production_control.assert_draft_editable_v1(text),
  production_control.draft_operation_receipt_v1(text,text,uuid,text,text),
  production_control.draft_projection_row_v1(uuid),
  production_control.director_private_audit_with_draft_v1()
from public, anon, authenticated, service_role;

revoke all on function
  public.read_production_draft_authoring_v1(jsonb),
  public.read_production_draft_view_v1(jsonb),
  public.stage_production_draft_revision_v1(jsonb),
  public.validate_production_draft_revision_v1(jsonb),
  public.commit_production_draft_revision_v1(jsonb),
  public.copy_production_draft_setup_v1(jsonb),
  public.synchronize_production_director_projection(jsonb),
  public.synchronize_production_future_annual_projection_v1(jsonb)
from public, anon, authenticated, service_role;

grant execute on function
  public.read_production_draft_authoring_v1(jsonb),
  public.read_production_draft_view_v1(jsonb),
  public.stage_production_draft_revision_v1(jsonb),
  public.validate_production_draft_revision_v1(jsonb),
  public.commit_production_draft_revision_v1(jsonb),
  public.copy_production_draft_setup_v1(jsonb),
  public.synchronize_production_director_projection(jsonb),
  public.synchronize_production_future_annual_projection_v1(jsonb)
to service_role;

comment on function public.read_production_draft_authoring_v1(jsonb)
is 'Director-only annual Draft editor read. Returns current/staged revisions, canonical tournament selectors, sanitized provenance/history, and correction-required mutability without Google access.';

comment on function public.read_production_draft_view_v1(jsonb)
is 'Service-only pointer-aware canonical Draft delivery for CURRENT, YEAR, YEARS, and PLAYER scopes. Reads immutable per-year Supabase facts with zero Google requests.';

comment on function public.commit_production_draft_revision_v1(jsonb)
is 'Director-only, revision-protected, idempotent Supabase Draft commit. Completed Drafts require a separately designed correction workflow.';

notify pgrst, 'reload schema';
commit;
