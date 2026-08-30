-- Step 13E.5 Production access-governance contract.
--
-- Installation is inert. It creates empty governance overlays, receipts,
-- audit evidence, and bounded RPCs. It does not create a Player, change a
-- membership, adopt an Owner, alter an entitlement, or change tournament
-- facts. Initial Owner adoption is deliberately database-owner-only and is
-- not granted to service_role; installation never invokes it.
begin;

create table production_control.player_governance_profiles_v1 (
  player_id text primary key references scoring_authority.players(player_id)
    on delete restrict,
  first_name text,
  last_name text,
  profile_slug text,
  global_status text not null check (global_status in ('ACTIVE', 'ALUMNI')),
  profile_revision bigint not null check (profile_revision > 0),
  created_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (first_name is null or (
    pg_catalog.btrim(first_name) <> '' and pg_catalog.length(first_name) <= 80
  )),
  check (last_name is null or (
    pg_catalog.btrim(last_name) <> '' and pg_catalog.length(last_name) <= 80
  )),
  check (profile_slug is null or profile_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index production_player_governance_slug_v1
  on production_control.player_governance_profiles_v1(
    pg_catalog.lower(profile_slug)
  ) where profile_slug is not null;

create table production_control.tournament_owner_capabilities_v1 (
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  adopted_from_entitlement_id uuid not null unique references
    production_control.director_entitlements(entitlement_id)
    on delete restrict,
  adopted_entitlement_event_id bigint not null references
    production_control.director_entitlement_events(event_id)
    on delete restrict,
  adopted_entitlement_event_count bigint not null check (
    adopted_entitlement_event_count > 0
  ),
  status text not null check (status in ('ACTIVE', 'REVOKED')),
  capability_revision bigint not null check (capability_revision > 0),
  adopted_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  adopted_at timestamptz not null,
  revoked_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, player_id),
  unique (tournament_id, auth_user_id),
  check (
    (status = 'ACTIVE' and revoked_at is null)
    or (status = 'REVOKED' and revoked_at is not null)
  )
);

create table production_control.access_governance_context_v1 (
  tournament_id text primary key references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  revision bigint not null check (revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table production_control.access_governance_membership_revisions_v1 (
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  membership_revision bigint not null check (membership_revision > 0),
  participation_status text not null check (
    participation_status in ('ACTIVE', 'WITHDRAWN', 'INACTIVE')
  ),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, player_id)
);

create table production_control.access_governance_operation_receipts_v1 (
  receipt_id uuid not null default extensions.gen_random_uuid() unique,
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  operation text not null check (operation in (
    'CREATE_PLAYER', 'SET_GLOBAL_STATUS', 'WITHDRAW_MEMBERSHIP',
    'REACTIVATE_MEMBERSHIP', 'GRANT_DIRECTOR', 'REVOKE_DIRECTOR',
    'INITIAL_OWNER_ADOPTION'
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
  actor_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  response jsonb not null check (pg_catalog.jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, operation, operation_request_id)
);

create table production_control.access_governance_audit_events_v1 (
  event_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  action text not null check (action in (
    'PLAYER_CREATED', 'GLOBAL_STATUS_CHANGED', 'MEMBERSHIP_WITHDRAWN',
    'MEMBERSHIP_REACTIVATED', 'DIRECTOR_GRANTED', 'DIRECTOR_REVOKED',
    'OWNER_ADOPTED'
  )),
  target_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  prior_revision bigint not null check (prior_revision >= 0),
  next_revision bigint not null check (next_revision >= prior_revision),
  operation_request_id uuid not null,
  result text not null check (result in ('CHANGED', 'NO_CHANGE')),
  profile_revision bigint not null default 0 check (profile_revision >= 0),
  membership_revision bigint not null default 0 check (
    membership_revision >= 0
  ),
  safe_metadata jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(safe_metadata) = 'object'
    and not (safe_metadata ?| array[
      'email', 'phone', 'auth_user_id', 'authUserId', 'token', 'secret'
    ])
  ),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (result = 'CHANGED' and next_revision = prior_revision + 1)
    or (result = 'NO_CHANGE' and next_revision = prior_revision)
  )
);

create index production_access_governance_audit_timeline_v1
  on production_control.access_governance_audit_events_v1(
    tournament_id, occurred_at desc, event_id
  );

alter table production_control.player_governance_profiles_v1
  enable row level security;
alter table production_control.tournament_owner_capabilities_v1
  enable row level security;
alter table production_control.access_governance_context_v1
  enable row level security;
alter table production_control.access_governance_membership_revisions_v1
  enable row level security;
alter table production_control.access_governance_operation_receipts_v1
  enable row level security;
alter table production_control.access_governance_audit_events_v1
  enable row level security;

create or replace function production_control.reject_access_governance_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, production_control
as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_ACCESS_GOVERNANCE_IMMUTABLE_RECORD';
end;
$$;

create trigger production_access_governance_receipts_immutable_v1
before update or delete
on production_control.access_governance_operation_receipts_v1
for each row execute function
  production_control.reject_access_governance_immutable_v1();

create trigger production_access_governance_audit_immutable_v1
before update or delete
on production_control.access_governance_audit_events_v1
for each row execute function
  production_control.reject_access_governance_immutable_v1();

create or replace function production_control.access_governance_revision_v1(
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
    from production_control.access_governance_context_v1 value
    where value.tournament_id = target_tournament
  ), 0)::bigint
$$;

create or replace function production_control.access_governance_hash_v1(
  value jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, extensions
as $$
  select pg_catalog.encode(extensions.digest(value::text, 'sha256'), 'hex')
$$;

create or replace function production_control.access_governance_profile_revision_v1(
  target_player text
)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, production_control
as $$
  select coalesce((
    select value.profile_revision
    from production_control.player_governance_profiles_v1 value
    where value.player_id = target_player
  ), 0)::bigint
$$;

create or replace function
  production_control.access_governance_membership_revision_v1(
    target_tournament text,
    target_player text
  )
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, production_control
as $$
  select coalesce((
    select value.membership_revision
    from production_control.access_governance_membership_revisions_v1 value
    where value.tournament_id = target_tournament
      and value.player_id = target_player
  ), 0)::bigint
$$;

create or replace function production_control.access_governance_slug_v1(
  value text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.btrim(coalesce(value, ''))),
      '[^a-z0-9]+', '-', 'g'
    ), '-+', '-', 'g'
  ), '-')
$$;

create or replace function production_control.access_governance_global_status_v1(
  target_player text
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
  select coalesce(profile.global_status, case
    when pg_catalog.upper(pg_catalog.btrim(coalesce(
      player.source_payload->>'Active', 'TRUE'
    ))) in ('FALSE', 'NO', '0', 'INACTIVE', 'ALUMNI') then 'ALUMNI'
    else 'ACTIVE'
  end)
  from scoring_authority.players player
  left join production_control.player_governance_profiles_v1 profile
    on profile.player_id = player.player_id
  where player.player_id = target_player
$$;

-- The installed PLAYER_EDITORIAL projection remains the immutable presentation
-- baseline (names, slugs, photos, honors, and source provenance). Once a
-- Director records an explicit global status through this contract, only the
-- legacy-shaped Active field is overlaid at read time. This keeps the existing
-- website/PWA calculation DTO stable without copying governance state back into
-- the Google-derived projection or admitting global-only Players into History.
create or replace function public.read_production_player_editorial(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  result_value jsonb;
  players_value jsonb;
begin
  result_value := production_control.read_projection(
    input,
    'PLAYER_EDITORIAL',
    'player-public-profile-v1',
    '["Players"]'::jsonb
  );

  if result_value->>'ok' is distinct from 'true'
     or pg_catalog.jsonb_typeof(
       result_value#>'{data,payload,players}'
     ) is distinct from 'array' then
    return result_value;
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    case when profile.player_id is null then editorial.value
      else pg_catalog.jsonb_set(
        editorial.value,
        '{public_profile,Active}',
        pg_catalog.to_jsonb(profile.global_status = 'ACTIVE'),
        true
      )
    end order by editorial.ordinality
  ), '[]'::jsonb)
  into players_value
  from pg_catalog.jsonb_array_elements(
    result_value#>'{data,payload,players}'
  ) with ordinality as editorial(value, ordinality)
  left join production_control.player_governance_profiles_v1 profile
    on profile.player_id = pg_catalog.btrim(coalesce(
      editorial.value->>'player_id', ''
    ));

  return pg_catalog.jsonb_set(
    result_value,
    '{data,payload,players}',
    players_value,
    false
  );
end;
$$;

create or replace function production_control.assert_access_governance_runtime_v1(
  input jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control
as $$
begin
  if input->>'contract_version' is distinct from
       'production-access-governance-v1'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026'
     or pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'actor_player_id', ''
     ))) !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
     or coalesce(input->>'actor_auth_user_id', '')
       !~ '^[0-9a-fA-F-]{36}$' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ACCESS_GOVERNANCE_SCOPE_REQUIRED';
  end if;
  perform production_control.assert_player_access_runtime_v1(
    input || pg_catalog.jsonb_build_object(
      'contract_version', 'production-players-access-v1',
      'authorization', pg_catalog.jsonb_build_object(
        'player_id', input->>'actor_player_id',
        'auth_user_id', input->>'actor_auth_user_id',
        'tournament_id', '2026',
        'role', 'DIRECTOR'
      )
    )
  );
end;
$$;

create or replace function production_control.assert_access_governance_owner_v1(
  target_tournament text,
  actor_player text,
  actor_auth_user uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control
as $$
begin
  if not exists (
    select 1
    from production_control.tournament_owner_capabilities_v1 owner_value
    where owner_value.tournament_id = target_tournament
      and owner_value.player_id = actor_player
      and owner_value.auth_user_id = actor_auth_user
      and owner_value.status = 'ACTIVE'
      and owner_value.revoked_at is null
  ) then
    raise exception using errcode = '42501',
      message = 'ACCESS_GOVERNANCE_ACTIVE_OWNER_REQUIRED';
  end if;
end;
$$;

create or replace function production_control.assert_access_governance_safe_reason_v1(
  reason_value text
)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if pg_catalog.length(pg_catalog.btrim(coalesce(reason_value, '')))
       not between 10 and 500
     or reason_value ~ '@'
     or reason_value ~ '\+[1-9][0-9]{7,14}'
     or reason_value ~* '(bearer[[:space:]]|eyJ[a-zA-Z0-9_-]{10,}|secret|token=)'
  then
    raise exception using errcode = '22023',
      message = 'ACCESS_GOVERNANCE_SAFE_REASON_REQUIRED';
  end if;
end;
$$;

create or replace function
  production_control.access_governance_membership_dependencies_v1(
    target_player text
  )
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, participant_identity,
  scoring_authority
as $$
declare
  hard_blockers jsonb := '[]'::jsonb;
  warnings_value jsonb := '[]'::jsonb;
  assigned_count integer := 0;
  upcoming_count integer := 0;
  competition_count integer := 0;
  snapshot_count integer := 0;
  history_count integer := 0;
  current_draft_count integer := 0;
  active_match_count integer := 0;
  finalized_match_count integer := 0;
  scoring_activity_count integer := 0;
  net_skins_count integer := 0;
  calcutta_count integer := 0;
begin
  select pg_catalog.count(distinct match_value.match_id)::integer,
    pg_catalog.count(distinct match_value.match_id) filter (
      where match_value.status = 'UPCOMING'
        and match_value.scored_holes = 0
        and match_value.current_hole = 0
        and match_value.finalized_at is null
    )::integer,
    pg_catalog.count(distinct match_value.match_id) filter (
      where match_value.status in ('LIVE', 'FINAL')
         or match_value.scored_holes > 0
         or match_value.current_hole > 0
         or match_value.scorecard_complete
         or match_value.finalized_at is not null
         or match_value.unresolved_mutations > 0
         or exists (
           select 1 from scoring_authority.hole_scores score
           where score.match_id = match_value.match_id
         )
         or exists (
           select 1 from scoring_authority.score_mutations mutation
           where mutation.match_id = match_value.match_id
         )
         or exists (
           select 1
           from scoring_authority.finalized_scorecard_snapshots snapshot
           where snapshot.match_id = match_value.match_id
             and snapshot.state = 'CURRENT'
         )
         or exists (
           select 1 from scoring_authority.scoring_ingress_leases lease
           where lease.match_id = match_value.match_id
             and lease.tournament_id = '2026'
             and lease.expires_at > pg_catalog.clock_timestamp()
         )
    )::integer,
    pg_catalog.count(distinct scoring_snapshot.snapshot_id)::integer
  into assigned_count, upcoming_count, competition_count, snapshot_count
  from scoring_authority.match_participants participant
  join scoring_authority.matches match_value
    on match_value.match_id = participant.match_id
   and match_value.tournament_id = '2026'
  left join scoring_authority.scoring_snapshots scoring_snapshot
    on scoring_snapshot.match_id = match_value.match_id
  where participant.player_id = target_player;

  select
    pg_catalog.count(distinct match_value.match_id) filter (
      where match_value.status = 'LIVE'
    )::integer,
    pg_catalog.count(distinct match_value.match_id) filter (
      where match_value.status = 'FINAL'
         or match_value.finalized_at is not null
    )::integer,
    pg_catalog.count(distinct match_value.match_id) filter (
      where match_value.scored_holes > 0
         or exists (
           select 1 from scoring_authority.hole_scores score
           where score.match_id = match_value.match_id
         )
         or exists (
           select 1 from scoring_authority.score_mutations mutation
           where mutation.match_id = match_value.match_id
         )
    )::integer
  into active_match_count, finalized_match_count, scoring_activity_count
  from scoring_authority.match_participants participant
  join scoring_authority.matches match_value
    on match_value.match_id = participant.match_id
   and match_value.tournament_id = '2026'
  where participant.player_id = target_player;

  select pg_catalog.count(*)::integer into history_count
  from scoring_authority.completed_history_match_participants participant
  where participant.player_id = target_player;

  select pg_catalog.count(*)::integer into current_draft_count
  from scoring_authority.draft_current_revisions current_value
  join scoring_authority.draft_pick_facts pick
    on pick.revision_id = current_value.revision_id
   and pick.tournament_id = current_value.tournament_id
  where current_value.tournament_id = '2026'
    and pick.player_id = target_player
    and pick.pick_status = 'SELECTED';

  if exists (
    select 1 from production_control.director_entitlements entitlement
    where entitlement.tournament_id = '2026'
      and entitlement.player_id = target_player
      and entitlement.status = 'ACTIVE'
  ) or exists (
    select 1
    from production_control.tournament_owner_capabilities_v1 owner_value
    where owner_value.tournament_id = '2026'
      and owner_value.player_id = target_player
      and owner_value.status = 'ACTIVE'
  ) then
    hard_blockers := hard_blockers ||
      pg_catalog.jsonb_build_array('ACTIVE_ADMIN_ENTITLEMENT');
  end if;
  if competition_count > 0 then
    hard_blockers := hard_blockers ||
      pg_catalog.jsonb_build_array('CURRENT_COMPETITION_FACTS');
  end if;
  if exists (
    select 1
    from scoring_authority.net_skins_v1_configuration_current current_value
    join scoring_authority.net_skins_v1_configuration_revisions revision_value
      on revision_value.configuration_revision_id =
        current_value.configuration_revision_id
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(revision_value.configuration_manifest->'rounds', '[]'::jsonb)
    ) round_value
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(round_value->'entries', '[]'::jsonb)
    ) entry
    where current_value.tournament_id = '2026'
      and current_value.state = 'CONFIGURED'
      and coalesce((entry->>'eligible')::boolean, false)
      and target_player in (
        entry->>'player_id_1', nullif(entry->>'player_id_2', '')
      )
  ) then
    net_skins_count := 1;
    hard_blockers := hard_blockers ||
      pg_catalog.jsonb_build_array('NET_SKINS_CONFIGURATION_DEPENDENCY');
  end if;
  if exists (
    select 1
    from scoring_authority.calcutta_v1_current current_value
    join scoring_authority.calcutta_v1_auction_fact_revisions auction
      on auction.auction_revision_id = current_value.auction_revision_id
    where current_value.tournament_id = '2026'
      and current_value.auction_revision > 0
      and (
        exists (
          select 1 from pg_catalog.jsonb_array_elements(
            coalesce(auction.auction_manifest->'purchases', '[]'::jsonb)
          ) purchase where purchase->>'player_id' = target_player
        )
        or exists (
          select 1 from pg_catalog.jsonb_array_elements(
            coalesce(auction.auction_manifest->'ownership', '[]'::jsonb)
          ) ownership
          where ownership->>'owner_player_id' = target_player
        )
      )
  ) then
    calcutta_count := 1;
    hard_blockers := hard_blockers ||
      pg_catalog.jsonb_build_array('CALCUTTA_AUCTION_DEPENDENCY');
  end if;
  if exists (
    select 1
    from scoring_authority.odds_publication_current current_value
    join scoring_authority.odds_published_snapshots snapshot
      on snapshot.id = current_value.current_snapshot_id
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(snapshot.published_payload->'players', '[]'::jsonb)
    ) published_player
    where current_value.tournament_id = '2026'
      and current_value.publication_state = 'PUBLISHED'
      and coalesce(
        published_player->>'id', published_player->>'playerId',
        published_player->>'player_id'
      ) = target_player
  ) then
    warnings_value := warnings_value ||
      pg_catalog.jsonb_build_array('PUBLISHED_ODDS_SNAPSHOT_PRESERVED');
  end if;

  if upcoming_count > 0 then
    warnings_value := warnings_value ||
      pg_catalog.jsonb_build_array('UNSTARTED_PAIRINGS_REQUIRE_SETUP_UPDATE');
  end if;
  if current_draft_count > 0 then
    warnings_value := warnings_value ||
      pg_catalog.jsonb_build_array('CURRENT_DRAFT_SELECTION_PRESERVED');
  end if;
  if history_count > 0 then
    warnings_value := warnings_value ||
      pg_catalog.jsonb_build_array('COMPLETED_HISTORY_PRESERVED');
  end if;
  if not exists (
    select 1
    from scoring_authority.handicap_revision_current current_value
    join scoring_authority.handicap_revision_entries entry
      on entry.revision_id = current_value.revision_id
     and entry.tournament_id = current_value.tournament_id
    where current_value.tournament_id = '2026'
      and entry.player_id = target_player
  ) then
    warnings_value := warnings_value ||
      pg_catalog.jsonb_build_array('HANDICAP_REQUIRED');
  end if;
  if assigned_count = 0 then
    warnings_value := warnings_value ||
      pg_catalog.jsonb_build_array('PAIRING_REQUIRED');
  end if;
  if not exists (
    select 1
    from participant_identity.user_player_links link
    join auth.users auth_user on auth_user.id = link.auth_user_id
    where link.player_id = target_player
      and link.status = 'ACTIVE'
      and (auth_user.email_confirmed_at is not null
        or auth_user.phone_confirmed_at is not null)
  ) then
    warnings_value := warnings_value ||
      pg_catalog.jsonb_build_array('PARTICIPANT_IDENTITY_NOT_LINKED');
  end if;

  return pg_catalog.jsonb_build_object(
    'hardBlockers', hard_blockers,
    'warnings', warnings_value,
    'assignedMatchCount', assigned_count,
    'unstartedPairingCount', upcoming_count,
    'competitionDependencyCount', competition_count,
    'scoringSnapshotCount', snapshot_count,
    'completedHistoryAppearanceCount', history_count,
    'currentDraftPickCount', current_draft_count,
    'dependencyCounts', pg_catalog.jsonb_build_object(
      'matchAssignments', assigned_count,
      'activeMatches', active_match_count,
      'finalizedMatches', finalized_match_count,
      'scoringActivity', scoring_activity_count,
      'scoringSnapshots', snapshot_count,
      'unstartedPairings', upcoming_count,
      'netSkins', net_skins_count,
      'calcutta', calcutta_count,
      'draft', current_draft_count,
      'completedHistory', history_count
    ),
    'withdrawAllowed', pg_catalog.jsonb_array_length(hard_blockers) = 0
  );
end;
$$;

create or replace function public.read_production_access_governance_v1(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, participant_identity,
  scoring_authority
as $$
declare
  revision_value bigint;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'actor_player_id', ''
  )));
  actor_auth uuid;
  actor_owner boolean := false;
  owner_required boolean;
  players_value jsonb;
  audit_value jsonb;
begin
  perform production_control.assert_access_governance_runtime_v1(input);
  if input->>'operation' is distinct from
       'READ_PRODUCTION_ACCESS_GOVERNANCE_V1' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ACCESS_GOVERNANCE_READ_INPUT_INVALID';
  end if;
  begin
    actor_auth := (input->>'actor_auth_user_id')::uuid;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ACCESS_GOVERNANCE_READ_INPUT_INVALID';
  end;
  revision_value := production_control.access_governance_revision_v1('2026');
  actor_owner := exists (
    select 1
    from production_control.tournament_owner_capabilities_v1 owner_value
    where owner_value.tournament_id = '2026'
      and owner_value.player_id = actor_player
      and owner_value.auth_user_id = actor_auth
      and owner_value.status = 'ACTIVE'
  );
  owner_required := not exists (
    select 1
    from production_control.tournament_owner_capabilities_v1 owner_value
    where owner_value.tournament_id = '2026'
      and owner_value.status = 'ACTIVE'
  );

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'playerId', player.player_id,
      'displayName', player.display_name,
      'profile', pg_catalog.jsonb_build_object(
        'firstName', coalesce(profile.first_name,
          nullif(player.source_payload->>'First', '')),
        'lastName', coalesce(profile.last_name,
          nullif(player.source_payload->>'Last', '')),
        'slug', coalesce(profile.profile_slug,
          nullif(player.source_payload->>'Slug', '')),
        'globalStatus', production_control
          .access_governance_global_status_v1(player.player_id),
        'revision', coalesce(profile.profile_revision, 0),
        'canSetGlobalStatus', true,
        'statusBlocker', case
          when membership.participation_status = 'ACTIVE'
          then 'ACTIVE_MEMBERSHIP_BLOCKS_ALUMNI' else null end
      ),
      'membership', case when membership.player_id is null then
        pg_catalog.jsonb_build_object(
          'exists', false,
          'status', 'NOT_PLAYING',
          'revision', 0,
          'canAdd', false,
          'canWithdraw', false,
          'canReactivate', false,
          'blockers', pg_catalog.jsonb_build_array(
            'TEAM_ASSIGNMENT_REQUIRED'
          ),
          'readiness', pg_catalog.jsonb_build_array(
            'TEAM_ASSIGNMENT_REQUIRED', 'HANDICAP_REQUIRED'
          ),
          'dependencyCounts', pg_catalog.jsonb_build_object()
        ) else pg_catalog.jsonb_build_object(
          'exists', true,
          'status', membership.participation_status,
          'revision', coalesce(membership_revision.membership_revision, 0),
          'teamId', membership.team_id,
          'teamSide', membership.team_side,
          'teamName', team.name,
          'canAdd', false,
          'canWithdraw', membership.participation_status = 'ACTIVE'
            and pg_catalog.jsonb_array_length(
              dependencies.value->'hardBlockers'
            ) = 0,
          'canReactivate', membership.participation_status in (
            'WITHDRAWN', 'INACTIVE'
          ) and production_control.access_governance_global_status_v1(
            player.player_id
          ) = 'ACTIVE',
          'blockers', dependencies.value->'hardBlockers',
          'readiness', dependencies.value->'warnings',
          'dependencyCounts', dependencies.value->'dependencyCounts'
        ) end,
      'governance', pg_catalog.jsonb_build_object(
        'ownerStatus', coalesce(owner_value.status, 'NONE'),
        'directorStatus', coalesce(entitlement.status, 'NOT_GRANTED'),
        'canGrant', actor_owner
          and membership.participation_status = 'ACTIVE'
          and coalesce(owner_value.status, '') <> 'ACTIVE'
          and identity_ready.ready,
        'canRevoke', actor_owner
          and entitlement.status = 'ACTIVE'
          and entitlement.role = 'DIRECTOR'
          and player.player_id <> actor_player
          and coalesce(owner_value.status, '') <> 'ACTIVE'
          and active_admin.count_value > 1,
        'blockers', pg_catalog.to_jsonb(pg_catalog.array_remove(array[
          case when not actor_owner then 'OWNER_REQUIRED' end,
          case when membership.participation_status is distinct from 'ACTIVE'
            then 'ACTIVE_MEMBERSHIP_REQUIRED' end,
          case when not identity_ready.ready
            then 'LINKED_VERIFIED_IDENTITY_REQUIRED' end,
          case when coalesce(owner_value.status, '') = 'ACTIVE'
            then 'OWNER_PROTECTED' end,
          case when player.player_id = actor_player
            then 'SELF_REVOKE_PROTECTED' end,
          case when entitlement.status = 'ACTIVE'
            and entitlement.role = 'DIRECTOR'
            and active_admin.count_value <= 1
            then 'FINAL_ADMIN_PROTECTED' end
        ], null))
      )
    ) order by player.display_name, player.player_id), '[]'::jsonb)
  into players_value
  from scoring_authority.players player
  left join production_control.player_governance_profiles_v1 profile
    on profile.player_id = player.player_id
  left join scoring_authority.tournament_players membership
    on membership.tournament_id = '2026'
   and membership.player_id = player.player_id
  left join scoring_authority.teams team
    on team.tournament_id = membership.tournament_id
   and team.team_id = membership.team_id
  left join production_control.access_governance_membership_revisions_v1
    membership_revision
    on membership_revision.tournament_id = membership.tournament_id
   and membership_revision.player_id = membership.player_id
  left join participant_identity.user_player_links governance_link
    on governance_link.player_id = player.player_id
   and governance_link.status = 'ACTIVE'
   and governance_link.revoked_at is null
  left join production_control.director_entitlements entitlement
    on entitlement.tournament_id = '2026'
   and entitlement.player_id = governance_link.player_id
   and entitlement.auth_user_id = governance_link.auth_user_id
  left join production_control.tournament_owner_capabilities_v1 owner_value
    on owner_value.tournament_id = '2026'
   and owner_value.player_id = player.player_id
  cross join lateral (
    select production_control.access_governance_membership_dependencies_v1(
      player.player_id
    ) value
  ) dependencies
  cross join lateral (
    select exists (
      select 1
      from participant_identity.user_player_links link
      join auth.users auth_user on auth_user.id = link.auth_user_id
      where link.player_id = player.player_id
        and link.status = 'ACTIVE'
        and (auth_user.email_confirmed_at is not null
          or auth_user.phone_confirmed_at is not null)
        and exists (
          select 1
          from participant_identity.participant_auth_identifiers identifier
          where identifier.auth_user_id = link.auth_user_id
            and identifier.player_id = link.player_id
            and identifier.status = 'VERIFIED'
        )
    ) ready
  ) identity_ready
  cross join lateral (
    select pg_catalog.count(*)::integer count_value
    from production_control.director_entitlements active_value
    join scoring_authority.tournament_players active_membership
      on active_membership.tournament_id = active_value.tournament_id
     and active_membership.player_id = active_value.player_id
     and active_membership.participation_status = 'ACTIVE'
    join participant_identity.user_player_links active_link
      on active_link.auth_user_id = active_value.auth_user_id
     and active_link.player_id = active_value.player_id
     and active_link.status = 'ACTIVE'
    join auth.users active_auth on active_auth.id = active_link.auth_user_id
    join participant_identity.tournament_roles active_role
      on active_role.tournament_id = active_value.tournament_id
     and active_role.auth_user_id = active_value.auth_user_id
     and active_role.role = 'DIRECTOR'
     and active_role.role_active
     and active_role.revoked_at is null
    where active_value.tournament_id = '2026'
      and active_value.status = 'ACTIVE'
      and (active_auth.email_confirmed_at is not null
        or active_auth.phone_confirmed_at is not null)
  ) active_admin;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'eventId', event.event_id,
      'action', event.action,
      'targetPlayerId', event.target_player_id,
      'actorPlayerId', event.actor_player_id,
      'result', event.result,
      'revision', event.next_revision,
      'profileRevision', event.profile_revision,
      'membershipRevision', event.membership_revision,
      'metadata', event.safe_metadata,
      'occurredAt', event.occurred_at
    ) order by event.occurred_at desc, event.event_id), '[]'::jsonb)
  into audit_value
  from (
    select value.*
    from production_control.access_governance_audit_events_v1 value
    where value.tournament_id = '2026'
    order by value.occurred_at desc, value.event_id
    limit 100
  ) event;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', 'production-access-governance-v1',
    'tournamentId', '2026',
    'revision', revision_value,
    'ownerAdoptionRequired', owner_required,
    'actor', pg_catalog.jsonb_build_object(
      'playerId', actor_player, 'owner', actor_owner,
      'ownerAdoptionRequired', owner_required
    ),
    'capabilities', pg_catalog.jsonb_build_object(
      'createPlayer', true,
      'setGlobalStatus', true,
      'withdrawMembership', true,
      'reactivateMembership', true,
      'grantDirector', actor_owner,
      'revokeDirector', actor_owner
    ),
    'membershipAdd', pg_catalog.jsonb_build_object(
      'supported', false,
      'state', 'TEAM_ASSIGNMENT_REQUIRED',
      'reason', 'Canonical membership requires a team assignment.'
    ),
    'players', players_value,
    'audit', audit_value
  );
end;
$$;

create or replace function public.mutate_production_access_governance_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity,
  scoring_authority
as $$
declare
  action_value text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'action', ''
  )));
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'actor_player_id', ''
  )));
  actor_auth uuid;
  target_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'player_id', ''
  )));
  operation_request uuid;
  expected_revision bigint;
  expected_profile_revision bigint := 0;
  expected_membership_revision bigint := 0;
  result_profile_revision bigint := 0;
  result_membership_revision bigint := 0;
  current_revision bigint;
  next_revision bigint;
  declared_hash text := pg_catalog.lower(coalesce(
    input->>'request_payload_hash', ''
  ));
  database_hash text;
  receipt production_control.access_governance_operation_receipts_v1%rowtype;
  response_value jsonb;
  changed_value boolean := false;
  role_changed boolean := false;
  audit_action text;
  metadata_value jsonb := '{}'::jsonb;
  target_status text;
  dependency_value jsonb;
  first_name_value text;
  last_name_value text;
  display_name_value text;
  player_prefix text;
  player_ordinal integer;
  slug_value text;
  target_auth uuid;
  entitlement_value production_control.director_entitlements%rowtype;
  reason_value text := pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(input->>'reason', '')),
    '[[:space:]]+', ' ', 'g'
  );
begin
  perform production_control.assert_access_governance_runtime_v1(input);
  if action_value not in (
       'CREATE_PLAYER', 'SET_GLOBAL_STATUS', 'WITHDRAW_MEMBERSHIP',
       'REACTIVATE_MEMBERSHIP', 'GRANT_DIRECTOR', 'REVOKE_DIRECTOR'
     )
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_revision', '') !~ '^[0-9]+$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ACCESS_GOVERNANCE_INPUT_INVALID'
    );
  end if;
  if action_value = 'SET_GLOBAL_STATUS'
     and coalesce(input->>'expected_profile_revision', '') !~ '^[0-9]+$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ACCESS_GOVERNANCE_PROFILE_REVISION_REQUIRED'
    );
  end if;
  if action_value in ('WITHDRAW_MEMBERSHIP', 'REACTIVATE_MEMBERSHIP')
     and coalesce(input->>'expected_membership_revision', '')
       !~ '^[0-9]+$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ACCESS_GOVERNANCE_MEMBERSHIP_REVISION_REQUIRED'
    );
  end if;
  begin
    actor_auth := (input->>'actor_auth_user_id')::uuid;
    operation_request := (input->>'operation_request_id')::uuid;
    expected_revision := (input->>'expected_revision')::bigint;
    if action_value = 'SET_GLOBAL_STATUS' then
      if coalesce(input->>'expected_profile_revision', '') !~ '^[0-9]+$' then
        raise exception using errcode = '22023',
          message = 'ACCESS_GOVERNANCE_PROFILE_REVISION_REQUIRED';
      end if;
      expected_profile_revision :=
        (input->>'expected_profile_revision')::bigint;
    end if;
    if action_value in ('WITHDRAW_MEMBERSHIP', 'REACTIVATE_MEMBERSHIP') then
      if coalesce(input->>'expected_membership_revision', '') !~ '^[0-9]+$' then
        raise exception using errcode = '22023',
          message = 'ACCESS_GOVERNANCE_MEMBERSHIP_REVISION_REQUIRED';
      end if;
      expected_membership_revision :=
        (input->>'expected_membership_revision')::bigint;
    end if;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ACCESS_GOVERNANCE_INPUT_INVALID'
    );
  end;
  database_hash := production_control.access_governance_hash_v1(
    input - 'request_payload_hash'
  );
  select value.* into receipt
  from production_control.access_governance_operation_receipts_v1 value
  where value.tournament_id = '2026'
    and value.operation = action_value
    and value.operation_request_id = operation_request;
  if found then
    if receipt.declared_request_payload_hash = declared_hash
       and receipt.database_request_payload_hash = database_hash then
      return receipt.response || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ACCESS_GOVERNANCE_IDEMPOTENCY_CONFLICT'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-access-governance-v1:2026', 0
  ));
  select value.* into receipt
  from production_control.access_governance_operation_receipts_v1 value
  where value.tournament_id = '2026'
    and value.operation = action_value
    and value.operation_request_id = operation_request;
  if found then
    if receipt.declared_request_payload_hash = declared_hash
       and receipt.database_request_payload_hash = database_hash then
      return receipt.response || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ACCESS_GOVERNANCE_IDEMPOTENCY_CONFLICT'
    );
  end if;

  current_revision := production_control.access_governance_revision_v1('2026');
  if current_revision <> expected_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ACCESS_GOVERNANCE_REVISION_STALE',
      'currentRevision', current_revision
    );
  end if;

  begin
    if action_value = 'CREATE_PLAYER' then
      first_name_value := pg_catalog.regexp_replace(
        pg_catalog.btrim(coalesce(input->>'first_name', '')),
        '[[:space:]]+', ' ', 'g'
      );
      last_name_value := pg_catalog.regexp_replace(
        pg_catalog.btrim(coalesce(input->>'last_name', '')),
        '[[:space:]]+', ' ', 'g'
      );
      display_name_value := pg_catalog.regexp_replace(
        pg_catalog.btrim(coalesce(
          input->>'display_name', first_name_value || ' ' || last_name_value
        )), '[[:space:]]+', ' ', 'g'
      );
      target_status := pg_catalog.upper(pg_catalog.btrim(coalesce(
        input->>'global_status', 'ACTIVE'
      )));
      if pg_catalog.length(first_name_value) not between 1 and 80
         or pg_catalog.length(last_name_value) not between 1 and 80
         or first_name_value !~
           '^[A-Za-z]([A-Za-z.'' -]*[A-Za-z.])?$'
         or last_name_value !~
           '^[A-Za-z]([A-Za-z.'' -]*[A-Za-z.])?$'
         or pg_catalog.length(display_name_value) not between 2 and 160
         or display_name_value ~ '[[:cntrl:]<>{}]'
         or target_status not in ('ACTIVE', 'ALUMNI') then
        raise exception using errcode = '22023',
          message = 'ACCESS_GOVERNANCE_PLAYER_INPUT_INVALID';
      end if;
      if exists (
        select 1 from scoring_authority.players player
        where pg_catalog.lower(pg_catalog.btrim(player.display_name)) =
          pg_catalog.lower(display_name_value)
           or (
             pg_catalog.lower(pg_catalog.btrim(coalesce(
               player.source_payload->>'First', ''
             ))) = pg_catalog.lower(first_name_value)
             and pg_catalog.lower(pg_catalog.btrim(coalesce(
               player.source_payload->>'Last', ''
             ))) = pg_catalog.lower(last_name_value)
           )
      ) or exists (
        select 1
        from production_control.player_governance_profiles_v1 profile
        where pg_catalog.lower(pg_catalog.btrim(coalesce(
          profile.first_name, ''
        ))) = pg_catalog.lower(first_name_value)
          and pg_catalog.lower(pg_catalog.btrim(coalesce(
            profile.last_name, ''
          ))) = pg_catalog.lower(last_name_value)
      ) then
        raise exception using errcode = '23505',
          message = 'ACCESS_GOVERNANCE_PLAYER_IDENTITY_COLLISION';
      end if;
      player_prefix := pg_catalog.upper(
        pg_catalog.left(first_name_value, 1) ||
        pg_catalog.left(last_name_value, 1)
      );
      if player_prefix !~ '^[A-Z]{2}$' then
        raise exception using errcode = '22023',
          message = 'ACCESS_GOVERNANCE_PLAYER_ID_PREFIX_INVALID';
      end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'production-player-id-v1:' || player_prefix, 0
      ));
      select coalesce(pg_catalog.max(
        pg_catalog.substr(player.player_id, 3)::integer
      ), 0) + 1 into player_ordinal
      from scoring_authority.players player
      where player.player_id ~ ('^' || player_prefix || '[0-9]{2}$');
      if player_ordinal > 99 then
        raise exception using errcode = '54000',
          message = 'ACCESS_GOVERNANCE_PLAYER_ID_SPACE_EXHAUSTED';
      end if;
      target_player := player_prefix || pg_catalog.lpad(
        player_ordinal::text, 2, '0'
      );
      slug_value := pg_catalog.lower(pg_catalog.btrim(coalesce(
        input->>'slug', ''
      )));
      if pg_catalog.length(slug_value) not between 2 and 120
         or slug_value !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
        raise exception using errcode = '22023',
          message = 'ACCESS_GOVERNANCE_PLAYER_SLUG_INVALID';
      end if;
      if exists (
        select 1 from scoring_authority.players player
        where pg_catalog.lower(coalesce(player.source_payload->>'Slug', '')) =
          slug_value
      ) or exists (
        select 1
        from production_control.player_governance_profiles_v1 profile
        where pg_catalog.lower(coalesce(profile.profile_slug, '')) = slug_value
      ) then
        raise exception using errcode = '23505',
          message = 'ACCESS_GOVERNANCE_PLAYER_SLUG_COLLISION';
      end if;
      insert into scoring_authority.players (
        player_id, display_name, source_payload
      ) values (
        target_player, display_name_value,
        pg_catalog.jsonb_build_object(
          'Player ID', target_player,
          'First', first_name_value,
          'Last', last_name_value,
          'Display Name', display_name_value,
          'Slug', slug_value,
          'Active', case when target_status = 'ACTIVE' then 'TRUE' else 'FALSE' end,
          'Governance Contract', 'production-access-governance-v1'
        )
      );
      insert into production_control.player_governance_profiles_v1 (
        player_id, first_name, last_name, profile_slug, global_status,
        profile_revision, created_by_player_id, updated_by_player_id
      ) values (
        target_player, first_name_value, last_name_value, slug_value,
        target_status, 1, actor_player, actor_player
      );
      changed_value := true;
      audit_action := 'PLAYER_CREATED';
      metadata_value := pg_catalog.jsonb_build_object(
        'global_status', target_status,
        'membership_created', false,
        'auth_user_created', false,
        'team_assigned', false
      );
    else
      if target_player = '' or not exists (
        select 1 from scoring_authority.players player
        where player.player_id = target_player
      ) then
        raise exception using errcode = '22023',
          message = 'ACCESS_GOVERNANCE_PLAYER_ID_REQUIRED';
      end if;
      if action_value = 'SET_GLOBAL_STATUS' then
        result_profile_revision := production_control
          .access_governance_profile_revision_v1(target_player);
        if result_profile_revision <> expected_profile_revision then
          return pg_catalog.jsonb_build_object(
            'ok', false, 'code', 'ACCESS_GOVERNANCE_PROFILE_REVISION_STALE',
            'playerId', target_player,
            'currentProfileRevision', result_profile_revision,
            'revision', current_revision
          );
        end if;
        target_status := pg_catalog.upper(pg_catalog.btrim(coalesce(
          input->>'global_status', ''
        )));
        if target_status not in ('ACTIVE', 'ALUMNI') then
          raise exception using errcode = '22023',
            message = 'ACCESS_GOVERNANCE_GLOBAL_STATUS_INVALID';
        end if;
        if target_status = 'ALUMNI' and exists (
          select 1 from scoring_authority.tournament_players membership
          where membership.tournament_id = '2026'
            and membership.player_id = target_player
            and membership.participation_status = 'ACTIVE'
        ) then
          raise exception using errcode = '55000',
            message = 'ACCESS_GOVERNANCE_ACTIVE_MEMBERSHIP_BLOCKS_ALUMNI';
        end if;
        changed_value :=
          production_control.access_governance_global_status_v1(target_player)
          is distinct from target_status;
        if changed_value then
          insert into production_control.player_governance_profiles_v1 (
            player_id, global_status, profile_revision,
            created_by_player_id, updated_by_player_id
          ) values (
            target_player, target_status, 1, actor_player, actor_player
          ) on conflict (player_id) do update set
            global_status = excluded.global_status,
            profile_revision = production_control
              .player_governance_profiles_v1.profile_revision + 1,
            updated_by_player_id = excluded.updated_by_player_id,
            updated_at = pg_catalog.clock_timestamp();
          result_profile_revision := expected_profile_revision + 1;
        end if;
        audit_action := 'GLOBAL_STATUS_CHANGED';
        metadata_value := pg_catalog.jsonb_build_object(
          'global_status', target_status,
          'membership_changed', false,
          'history_preserved', true
        );
      elsif action_value = 'WITHDRAW_MEMBERSHIP' then
        perform production_control.assert_access_governance_safe_reason_v1(
          reason_value
        );
        result_membership_revision := production_control
          .access_governance_membership_revision_v1('2026', target_player);
        if result_membership_revision <> expected_membership_revision then
          return pg_catalog.jsonb_build_object(
            'ok', false,
            'code', 'ACCESS_GOVERNANCE_MEMBERSHIP_REVISION_STALE',
            'playerId', target_player,
            'currentMembershipRevision', result_membership_revision,
            'revision', current_revision
          );
        end if;
        if not exists (
          select 1 from scoring_authority.tournament_players membership
          where membership.tournament_id = '2026'
            and membership.player_id = target_player
            and membership.participation_status = 'ACTIVE'
        ) then
          raise exception using errcode = '55000',
            message = 'ACCESS_GOVERNANCE_ACTIVE_MEMBERSHIP_REQUIRED';
        end if;
        dependency_value := production_control
          .access_governance_membership_dependencies_v1(target_player);
        if pg_catalog.jsonb_array_length(
          dependency_value->'hardBlockers'
        ) > 0 then
          return pg_catalog.jsonb_build_object(
            'ok', false,
            'code', 'ACCESS_GOVERNANCE_MEMBERSHIP_DEPENDENCY_BLOCKED',
            'playerId', target_player,
            'readiness', dependency_value,
            'revision', current_revision
          );
        end if;
        update scoring_authority.tournament_players set
          participation_status = 'WITHDRAWN',
          updated_at = pg_catalog.clock_timestamp()
        where tournament_id = '2026' and player_id = target_player
          and participation_status = 'ACTIVE';
        changed_value := found;
        if changed_value then
          result_membership_revision := expected_membership_revision + 1;
          insert into production_control
            .access_governance_membership_revisions_v1 (
              tournament_id, player_id, membership_revision,
              participation_status, updated_by_player_id,
              updated_by_auth_user_id
            ) values (
              '2026', target_player, result_membership_revision,
              'WITHDRAWN', actor_player, actor_auth
            ) on conflict (tournament_id, player_id) do update set
              membership_revision = excluded.membership_revision,
              participation_status = excluded.participation_status,
              updated_by_player_id = excluded.updated_by_player_id,
              updated_by_auth_user_id = excluded.updated_by_auth_user_id,
              updated_at = pg_catalog.clock_timestamp();
        end if;
        audit_action := 'MEMBERSHIP_WITHDRAWN';
        metadata_value := pg_catalog.jsonb_build_object(
          'membership_status', 'WITHDRAWN',
          'pairings_changed', false,
          'handicap_changed', false,
          'auth_link_changed', false,
          'reason_provided', true,
          'warnings', dependency_value->'warnings'
        );
      elsif action_value = 'REACTIVATE_MEMBERSHIP' then
        perform production_control.assert_access_governance_safe_reason_v1(
          reason_value
        );
        result_membership_revision := production_control
          .access_governance_membership_revision_v1('2026', target_player);
        if result_membership_revision <> expected_membership_revision then
          return pg_catalog.jsonb_build_object(
            'ok', false,
            'code', 'ACCESS_GOVERNANCE_MEMBERSHIP_REVISION_STALE',
            'playerId', target_player,
            'currentMembershipRevision', result_membership_revision,
            'revision', current_revision
          );
        end if;
        if production_control.access_governance_global_status_v1(target_player)
             <> 'ACTIVE' then
          raise exception using errcode = '55000',
            message = 'ACCESS_GOVERNANCE_ACTIVE_GLOBAL_PLAYER_REQUIRED';
        end if;
        if not exists (
          select 1 from scoring_authority.tournament_players membership
          where membership.tournament_id = '2026'
            and membership.player_id = target_player
            and membership.participation_status in ('WITHDRAWN', 'INACTIVE')
        ) then
          raise exception using errcode = '55000',
            message = 'ACCESS_GOVERNANCE_INACTIVE_MEMBERSHIP_REQUIRED';
        end if;
        update scoring_authority.tournament_players set
          participation_status = 'ACTIVE',
          updated_at = pg_catalog.clock_timestamp()
        where tournament_id = '2026' and player_id = target_player
          and participation_status in ('WITHDRAWN', 'INACTIVE');
        changed_value := found;
        if changed_value then
          result_membership_revision := expected_membership_revision + 1;
          insert into production_control
            .access_governance_membership_revisions_v1 (
              tournament_id, player_id, membership_revision,
              participation_status, updated_by_player_id,
              updated_by_auth_user_id
            ) values (
              '2026', target_player, result_membership_revision,
              'ACTIVE', actor_player, actor_auth
            ) on conflict (tournament_id, player_id) do update set
              membership_revision = excluded.membership_revision,
              participation_status = excluded.participation_status,
              updated_by_player_id = excluded.updated_by_player_id,
              updated_by_auth_user_id = excluded.updated_by_auth_user_id,
              updated_at = pg_catalog.clock_timestamp();
        end if;
        dependency_value := production_control
          .access_governance_membership_dependencies_v1(target_player);
        audit_action := 'MEMBERSHIP_REACTIVATED';
        metadata_value := pg_catalog.jsonb_build_object(
          'membership_status', 'ACTIVE',
          'team_changed', false,
          'handicap_changed', false,
          'auth_link_changed', false,
          'reason_provided', true,
          'warnings', dependency_value->'warnings'
        );
      else
        perform production_control.assert_access_governance_owner_v1(
          '2026', actor_player, actor_auth
        );
        perform production_control.assert_access_governance_safe_reason_v1(
          reason_value
        );
        if input->'confirmed' is distinct from 'true'::jsonb then
          raise exception using errcode = '22023',
            message = 'ACCESS_GOVERNANCE_CONFIRMATION_REQUIRED';
        end if;
        if action_value = 'GRANT_DIRECTOR' then
          if not exists (
            select 1 from scoring_authority.tournament_players membership
            where membership.tournament_id = '2026'
              and membership.player_id = target_player
              and membership.participation_status = 'ACTIVE'
          ) then
            raise exception using errcode = '55000',
              message = 'ACCESS_GOVERNANCE_ACTIVE_MEMBERSHIP_REQUIRED';
          end if;
          if exists (
            select 1
            from production_control.tournament_owner_capabilities_v1 owner_value
            where owner_value.tournament_id = '2026'
              and owner_value.player_id = target_player
              and owner_value.status = 'ACTIVE'
          ) then
            raise exception using errcode = '55000',
              message = 'ACCESS_GOVERNANCE_TARGET_ALREADY_OWNER';
          end if;
          select link.auth_user_id into target_auth
          from participant_identity.user_player_links link
          join auth.users auth_user on auth_user.id = link.auth_user_id
          where link.player_id = target_player
            and link.status = 'ACTIVE'
            and (auth_user.email_confirmed_at is not null
              or auth_user.phone_confirmed_at is not null)
            and exists (
              select 1
              from participant_identity.participant_auth_identifiers identifier
              where identifier.auth_user_id = link.auth_user_id
                and identifier.player_id = link.player_id
                and identifier.status = 'VERIFIED'
            )
          order by link.link_revision desc limit 1;
          if target_auth is null then
            raise exception using errcode = '55000',
              message = 'ACCESS_GOVERNANCE_LINKED_AUTH_REQUIRED';
          end if;
          select value.* into entitlement_value
          from production_control.director_entitlements value
          where value.tournament_id = '2026'
            and value.auth_user_id = target_auth;
          if found and (
            entitlement_value.player_id is distinct from target_player
            or entitlement_value.role <> 'DIRECTOR'
          ) then
            raise exception using errcode = '55000',
              message = 'ACCESS_GOVERNANCE_ENTITLEMENT_IDENTITY_CONFLICT';
          end if;
          changed_value := not found
            or entitlement_value.status <> 'ACTIVE'
            or entitlement_value.role <> 'DIRECTOR'
            or entitlement_value.player_id is distinct from target_player;
          if changed_value then
            insert into production_control.director_entitlements (
              auth_user_id, tournament_id, player_id, role, status,
              granted_by, granted_at, revoked_at
            ) values (
              target_auth, '2026', target_player, 'DIRECTOR', 'ACTIVE',
              actor_player, pg_catalog.clock_timestamp(), null
            ) on conflict (auth_user_id, tournament_id) do update set
              player_id = excluded.player_id,
              role = 'DIRECTOR', status = 'ACTIVE',
              granted_by = excluded.granted_by,
              granted_at = excluded.granted_at,
              revoked_at = null;
            select value.* into strict entitlement_value
            from production_control.director_entitlements value
            where value.tournament_id = '2026'
              and value.auth_user_id = target_auth;
            insert into production_control.director_entitlement_events (
              entitlement_id, action, actor, reason
            ) values (
              entitlement_value.entitlement_id, 'GRANTED',
              actor_player, reason_value
            );
          end if;
          role_changed := not exists (
            select 1 from participant_identity.tournament_roles role_value
            where role_value.tournament_id = '2026'
              and role_value.auth_user_id = target_auth
              and role_value.role = 'DIRECTOR'
              and role_value.role_active
              and role_value.revoked_at is null
          );
          insert into participant_identity.tournament_roles (
            tournament_id, auth_user_id, role, role_active, role_revision,
            granted_at, granted_by, revoked_at, revoked_by
          ) values (
            '2026', target_auth, 'DIRECTOR', true, 1,
            pg_catalog.clock_timestamp(), actor_player, null, null
          ) on conflict (tournament_id, auth_user_id, role) do update set
            role_active = true,
            role_revision = participant_identity
              .tournament_roles.role_revision + case
                when participant_identity.tournament_roles.role_active
                  and participant_identity.tournament_roles.revoked_at is null
                then 0 else 1 end,
            granted_at = case
              when participant_identity.tournament_roles.role_active
                and participant_identity.tournament_roles.revoked_at is null
              then participant_identity.tournament_roles.granted_at
              else pg_catalog.clock_timestamp() end,
            granted_by = case
              when participant_identity.tournament_roles.role_active
                and participant_identity.tournament_roles.revoked_at is null
              then participant_identity.tournament_roles.granted_by
              else actor_player end,
            revoked_at = null, revoked_by = null,
            updated_at = case
              when participant_identity.tournament_roles.role_active
                and participant_identity.tournament_roles.revoked_at is null
              then participant_identity.tournament_roles.updated_at
              else pg_catalog.clock_timestamp() end;
          changed_value := changed_value or role_changed;
          audit_action := 'DIRECTOR_GRANTED';
          metadata_value := pg_catalog.jsonb_build_object(
            'role', 'DIRECTOR', 'reason', reason_value,
            'identity_changed', false, 'membership_changed', false
          );
        else
          if target_player = actor_player then
            raise exception using errcode = '55000',
              message = 'ACCESS_GOVERNANCE_SELF_REVOKE_BLOCKED';
          end if;
          if exists (
            select 1
            from production_control.tournament_owner_capabilities_v1 owner_value
            where owner_value.tournament_id = '2026'
              and owner_value.player_id = target_player
              and owner_value.status = 'ACTIVE'
          ) then
            raise exception using errcode = '55000',
              message = 'ACCESS_GOVERNANCE_OWNER_REVOKE_BLOCKED';
          end if;
          select value.* into entitlement_value
          from participant_identity.user_player_links target_link
          join production_control.director_entitlements value
            on value.tournament_id = '2026'
           and value.player_id = target_link.player_id
           and value.auth_user_id = target_link.auth_user_id
           and value.role = 'DIRECTOR'
          where target_link.player_id = target_player
            and target_link.status = 'ACTIVE'
            and target_link.revoked_at is null;
          if not found or entitlement_value.status = 'REVOKED' then
            changed_value := false;
          else
            if not exists (
              select 1
              from production_control.director_entitlements other_value
              join scoring_authority.tournament_players other_membership
                on other_membership.tournament_id = other_value.tournament_id
               and other_membership.player_id = other_value.player_id
               and other_membership.participation_status = 'ACTIVE'
              join participant_identity.user_player_links other_link
                on other_link.auth_user_id = other_value.auth_user_id
               and other_link.player_id = other_value.player_id
               and other_link.status = 'ACTIVE'
              join auth.users other_auth
                on other_auth.id = other_link.auth_user_id
              join participant_identity.tournament_roles other_role
                on other_role.tournament_id = other_value.tournament_id
               and other_role.auth_user_id = other_value.auth_user_id
               and other_role.role = 'DIRECTOR'
               and other_role.role_active
               and other_role.revoked_at is null
              where other_value.tournament_id = '2026'
                and other_value.status = 'ACTIVE'
                and other_value.entitlement_id <>
                  entitlement_value.entitlement_id
                and (other_auth.email_confirmed_at is not null
                  or other_auth.phone_confirmed_at is not null)
            ) then
              raise exception using errcode = '55000',
                message = 'ACCESS_GOVERNANCE_FINAL_ADMIN_PROTECTED';
            end if;
            update production_control.director_entitlements set
              status = 'REVOKED', revoked_at = pg_catalog.clock_timestamp()
            where entitlement_id = entitlement_value.entitlement_id
              and status = 'ACTIVE' and role = 'DIRECTOR';
            changed_value := found;
            if changed_value then
              insert into production_control.director_entitlement_events (
                entitlement_id, action, actor, reason
              ) values (
                entitlement_value.entitlement_id, 'REVOKED',
                actor_player, reason_value
              );
            end if;
          end if;
          update participant_identity.tournament_roles set
            role_active = false,
            role_revision = role_revision + 1,
            revoked_at = pg_catalog.clock_timestamp(),
            revoked_by = actor_player,
            updated_at = pg_catalog.clock_timestamp()
          where tournament_id = '2026'
            and auth_user_id = entitlement_value.auth_user_id
            and role = 'DIRECTOR' and role_active;
          changed_value := changed_value or found;
          audit_action := 'DIRECTOR_REVOKED';
          metadata_value := pg_catalog.jsonb_build_object(
            'role', 'DIRECTOR', 'reason', reason_value,
            'identity_changed', false, 'membership_changed', false
          );
        end if;
      end if;
    end if;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', case
        when sqlerrm ~ '^ACCESS_GOVERNANCE_[A-Z0-9_]+$' then sqlerrm
        else 'ACCESS_GOVERNANCE_OPERATION_FAILED' end
    );
  end;

  next_revision := current_revision + case when changed_value then 1 else 0 end;
  if changed_value then
    insert into production_control.access_governance_context_v1 (
      tournament_id, revision, updated_by_player_id, updated_by_auth_user_id
    ) values (
      '2026', next_revision, actor_player, actor_auth
    ) on conflict (tournament_id) do update set
      revision = excluded.revision,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_by_auth_user_id = excluded.updated_by_auth_user_id,
      updated_at = pg_catalog.clock_timestamp();
  end if;

  result_profile_revision := production_control
    .access_governance_profile_revision_v1(target_player);
  result_membership_revision := production_control
    .access_governance_membership_revision_v1('2026', target_player);

  insert into production_control.access_governance_audit_events_v1 (
    tournament_id, action, target_player_id, actor_player_id,
    prior_revision, next_revision, operation_request_id, result,
    profile_revision, membership_revision, safe_metadata
  ) values (
    '2026', audit_action, target_player, actor_player,
    current_revision, next_revision, operation_request,
    case when changed_value then 'CHANGED' else 'NO_CHANGE' end,
    result_profile_revision, result_membership_revision, metadata_value
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ACCESS_GOVERNANCE_' || action_value ||
      case when changed_value then '_COMPLETED' else '_NO_CHANGE' end,
    'action', action_value,
    'playerId', target_player,
    'changed', changed_value,
    'revision', next_revision,
    'profileRevision', result_profile_revision,
    'membershipRevision', result_membership_revision,
    'idempotent', false,
    'membershipCreated', false,
    'teamChanged', false,
    'authUserCreated', false
  );
  if action_value in ('WITHDRAW_MEMBERSHIP', 'REACTIVATE_MEMBERSHIP') then
    response_value := response_value || pg_catalog.jsonb_build_object(
      'readiness', production_control
        .access_governance_membership_dependencies_v1(target_player)
    );
  end if;
  insert into production_control.access_governance_operation_receipts_v1 (
    tournament_id, operation, operation_request_id,
    declared_request_payload_hash, database_request_payload_hash,
    actor_player_id, actor_auth_user_id, response
  ) values (
    '2026', action_value, operation_request, declared_hash, database_hash,
    actor_player, actor_auth, response_value
  );
  return response_value;
end;
$$;

-- Deliberately not granted to service_role. This function is callable only by
-- a database-owner session, and only once, through a separately authorized,
-- exact-scope, revisioned and audited adoption request.
create or replace function public.adopt_initial_production_owner_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity,
  scoring_authority
as $$
declare
  database_owner text;
  claim_role text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'actor_player_id', ''
  )));
  actor_auth uuid;
  operation_request uuid;
  expected_revision bigint;
  expected_entitlement_id uuid;
  expected_entitlement_event_id bigint;
  expected_entitlement_event_count bigint;
  actual_entitlement_event_id bigint;
  actual_entitlement_event_count bigint;
  current_revision bigint;
  next_revision bigint;
  declared_hash text := pg_catalog.lower(coalesce(
    input->>'request_payload_hash', ''
  ));
  database_hash text;
  receipt production_control.access_governance_operation_receipts_v1%rowtype;
  entitlement_value production_control.director_entitlements%rowtype;
  response_value jsonb;
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason', ''));
begin
  select pg_catalog.pg_get_userbyid(database_value.datdba)
    into strict database_owner
  from pg_catalog.pg_database database_value
  where database_value.datname = pg_catalog.current_database();
  claim_role := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb
      ->>'role'
  );
  if not pg_catalog.pg_has_role(
       session_user, database_owner, 'member'
     )
     or claim_role is not null then
    raise exception using errcode = '42501',
      message = 'ACCESS_GOVERNANCE_DATABASE_OWNER_SESSION_REQUIRED';
  end if;
  if input->>'contract_version' is distinct from
       'production-access-governance-v1'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026'
     or input->>'action' is distinct from 'INITIAL_OWNER_ADOPTION' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ACCESS_GOVERNANCE_SCOPE_REQUIRED';
  end if;
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_production_handicap_runtime();
  perform production_control.assert_access_governance_safe_reason_v1(
    reason_value
  );
  begin
    actor_auth := (input->>'actor_auth_user_id')::uuid;
    operation_request := (input->>'operation_request_id')::uuid;
    expected_revision := (input->>'expected_revision')::bigint;
    expected_entitlement_id := (input->>'expected_entitlement_id')::uuid;
    expected_entitlement_event_id :=
      (input->>'expected_entitlement_event_id')::bigint;
    expected_entitlement_event_count :=
      (input->>'expected_entitlement_event_count')::bigint;
  exception when others then
    raise exception using errcode = '22023',
      message = 'ACCESS_GOVERNANCE_INITIAL_OWNER_INPUT_INVALID';
  end;
  database_hash := production_control.access_governance_hash_v1(
    input - 'request_payload_hash'
  );
  if declared_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'ACCESS_GOVERNANCE_PAYLOAD_HASH_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-access-governance-v1:2026', 0
  ));
  select value.* into receipt
  from production_control.access_governance_operation_receipts_v1 value
  where value.tournament_id = '2026'
    and value.operation = 'INITIAL_OWNER_ADOPTION'
    and value.operation_request_id = operation_request;
  if found then
    if receipt.declared_request_payload_hash = declared_hash
       and receipt.database_request_payload_hash = database_hash then
      return receipt.response || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    raise exception using errcode = '40001',
      message = 'ACCESS_GOVERNANCE_IDEMPOTENCY_CONFLICT';
  end if;
  current_revision := production_control.access_governance_revision_v1('2026');
  if current_revision <> expected_revision then
    raise exception using errcode = '40001',
      message = 'ACCESS_GOVERNANCE_REVISION_STALE';
  end if;
  if exists (
    select 1
    from production_control.tournament_owner_capabilities_v1 owner_value
    where owner_value.tournament_id = '2026'
  ) then
    raise exception using errcode = '55000',
      message = 'ACCESS_GOVERNANCE_OWNER_ALREADY_ADOPTED';
  end if;
  if not exists (
    select 1 from scoring_authority.tournament_players membership
    where membership.tournament_id = '2026'
      and membership.player_id = actor_player
      and membership.participation_status = 'ACTIVE'
  ) or not exists (
    select 1
    from participant_identity.user_player_links link
    join auth.users auth_user on auth_user.id = link.auth_user_id
    where link.player_id = actor_player
      and link.auth_user_id = actor_auth
      and link.status = 'ACTIVE'
      and (auth_user.email_confirmed_at is not null
        or auth_user.phone_confirmed_at is not null)
      and exists (
        select 1
        from participant_identity.participant_auth_identifiers identifier
        where identifier.auth_user_id = link.auth_user_id
          and identifier.player_id = link.player_id
          and identifier.status = 'VERIFIED'
      )
  ) then
    raise exception using errcode = '55000',
      message = 'ACCESS_GOVERNANCE_OWNER_IDENTITY_NOT_READY';
  end if;
  select value.* into entitlement_value
  from production_control.director_entitlements value
  where value.tournament_id = '2026'
    and value.player_id = actor_player
    and value.auth_user_id = actor_auth
    and value.status = 'ACTIVE'
    and value.role = 'DIRECTOR';
  if not found then
    raise exception using errcode = '55000',
      message = 'ACCESS_GOVERNANCE_ACTIVE_DIRECTOR_REQUIRED';
  end if;
  select pg_catalog.count(*)::bigint, coalesce(pg_catalog.max(
      event.event_id
    ), 0)::bigint
    into actual_entitlement_event_count, actual_entitlement_event_id
  from production_control.director_entitlement_events event
  where event.entitlement_id = entitlement_value.entitlement_id;
  if entitlement_value.entitlement_id is distinct from expected_entitlement_id
     or actual_entitlement_event_id is distinct from
       expected_entitlement_event_id
     or actual_entitlement_event_count is distinct from
       expected_entitlement_event_count then
    raise exception using errcode = '40001',
      message = 'ACCESS_GOVERNANCE_ENTITLEMENT_EVIDENCE_STALE';
  end if;

  insert into production_control.tournament_owner_capabilities_v1 (
    tournament_id, player_id, auth_user_id, adopted_from_entitlement_id,
    adopted_entitlement_event_id, adopted_entitlement_event_count,
    status, capability_revision, adopted_by_player_id, adopted_at
  ) values (
    '2026', actor_player, actor_auth, entitlement_value.entitlement_id,
    actual_entitlement_event_id, actual_entitlement_event_count, 'ACTIVE', 1,
    actor_player, pg_catalog.clock_timestamp()
  );

  next_revision := current_revision + 1;
  insert into production_control.access_governance_context_v1 (
    tournament_id, revision, updated_by_player_id, updated_by_auth_user_id
  ) values (
    '2026', next_revision, actor_player, actor_auth
  ) on conflict (tournament_id) do update set
    revision = excluded.revision,
    updated_by_player_id = excluded.updated_by_player_id,
    updated_by_auth_user_id = excluded.updated_by_auth_user_id,
    updated_at = pg_catalog.clock_timestamp();
  insert into production_control.access_governance_audit_events_v1 (
    tournament_id, action, target_player_id, actor_player_id,
    prior_revision, next_revision, operation_request_id, result, safe_metadata
  ) values (
    '2026', 'OWNER_ADOPTED', actor_player, actor_player,
    current_revision, next_revision, operation_request, 'CHANGED',
    pg_catalog.jsonb_build_object(
      'capability', 'OWNER', 'reason', reason_value,
      'entitlement_event_count', actual_entitlement_event_count,
      'entitlement_evidence_bound', true,
      'membership_changed', false, 'identity_changed', false
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ACCESS_GOVERNANCE_INITIAL_OWNER_ADOPTED',
    'playerId', actor_player,
    'revision', next_revision,
    'idempotent', false
  );
  insert into production_control.access_governance_operation_receipts_v1 (
    tournament_id, operation, operation_request_id,
    declared_request_payload_hash, database_request_payload_hash,
    actor_player_id, actor_auth_user_id, response
  ) values (
    '2026', 'INITIAL_OWNER_ADOPTION', operation_request,
    declared_hash, database_hash, actor_player, actor_auth, response_value
  );
  return response_value;
end;
$$;

-- Preserve the installed Phase-3 projection unchanged, then merge only
-- sanitized, human-readable access-governance events through an additive
-- wrapper used by the existing public Director read RPC.
create or replace function
  production_control.director_private_audit_with_access_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
  with existing_rows as (
    select
      (item->>'occurred_at')::timestamptz occurred_at,
      coalesce(item->>'category', 'SYSTEM') category,
      coalesce(item->>'action', 'UPDATED') action,
      coalesce(item->>'title', 'Director operation completed') title,
      coalesce(item->>'summary', 'The operation was confirmed.') summary,
      coalesce(item->>'status', 'SUCCESS') status,
      coalesce(item#>>'{actor,display_name}', 'Tournament Director') actor_name,
      coalesce(item->'context', pg_catalog.jsonb_build_object(
        'tournament_id', '2026'
      )) context_value
    from pg_catalog.jsonb_array_elements(
      production_control.director_private_audit_v1()
    ) item
  ), access_rows as (
    select event.occurred_at,
      'ACCESS'::text category,
      event.action,
      case event.action
        when 'PLAYER_CREATED' then pg_catalog.format(
          '%s added as a global Player', target.display_name
        )
        when 'GLOBAL_STATUS_CHANGED' then pg_catalog.format(
          '%s global Player status changed', target.display_name
        )
        when 'MEMBERSHIP_WITHDRAWN' then pg_catalog.format(
          '%s withdrawn from the 2026 tournament', target.display_name
        )
        when 'MEMBERSHIP_REACTIVATED' then pg_catalog.format(
          '%s reactivated for the 2026 tournament', target.display_name
        )
        when 'DIRECTOR_GRANTED' then pg_catalog.format(
          '%s granted Tournament Director access', target.display_name
        )
        when 'DIRECTOR_REVOKED' then pg_catalog.format(
          '%s Tournament Director access revoked', target.display_name
        )
        else pg_catalog.format(
          '%s adopted Production Owner governance', target.display_name
        )
      end title,
      case event.action
        when 'PLAYER_CREATED'
          then 'The permanent Player record was created without tournament or Auth side effects.'
        when 'GLOBAL_STATUS_CHANGED'
          then 'The global status changed while history and identity were preserved.'
        when 'MEMBERSHIP_WITHDRAWN'
          then 'Tournament membership was withdrawn without rewriting competition facts.'
        when 'MEMBERSHIP_REACTIVATED'
          then 'Existing tournament membership was reactivated without setup side effects.'
        when 'DIRECTOR_GRANTED'
          then 'Owner-authorized Tournament Director access was granted.'
        when 'DIRECTOR_REVOKED'
          then 'Owner-authorized Tournament Director access was revoked.'
        else 'The initial Production Owner capability was adopted through the database-owner-only operation.'
      end summary,
      'SUCCESS'::text status,
      coalesce(actor.display_name, 'Tournament Director') actor_name,
      pg_catalog.jsonb_build_object('tournament_id', '2026') context_value
    from production_control.access_governance_audit_events_v1 event
    join scoring_authority.players target
      on target.player_id = event.target_player_id
    left join scoring_authority.players actor
      on actor.player_id = event.actor_player_id
    where event.tournament_id = '2026'
      and event.occurred_at >= pg_catalog.now() - interval '90 days'
  ), merged as (
    select * from existing_rows
    union all
    select * from access_rows
  ), bounded as (
    select pg_catalog.row_number() over (
      order by merged.occurred_at desc, merged.title
    )::integer sequence, merged.*
    from merged
    order by merged.occurred_at desc, merged.title
    limit 60
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'sequence', bounded.sequence,
    'category', bounded.category,
    'action', bounded.action,
    'title', bounded.title,
    'summary', bounded.summary,
    'status', bounded.status,
    'actor', pg_catalog.jsonb_build_object(
      'display_name', bounded.actor_name
    ),
    'context', bounded.context_value,
    'occurred_at', bounded.occurred_at
  ) order by bounded.occurred_at desc, bounded.sequence), '[]'::jsonb)
  from bounded
$$;

create or replace function public.read_production_director_operations_v1(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority,
  participant_identity, auth
as $$
begin
  perform production_control.assert_production_service_role();
  perform production_control.assert_production_cutover_read_scope(
    input, 'OBSERVATION'
  );
  perform production_control.assert_production_scoring_actor(input, true);

  if input->>'contract_version' is distinct from
       'production-director-private-operations-v1'
     or input->>'operation' is distinct from
       'READ_PRODUCTION_DIRECTOR_OPERATIONS_V1'
     or pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
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
     or pg_catalog.lower(coalesce(input->>'vercel_environment', '')) <>
       'production'
  then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DIRECTOR_PRIVATE_RESOURCE_REQUIRED';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contract_version', 'production-director-private-operations-v1',
      'tournament_id', '2026',
      'calcutta', production_control.director_private_calcutta_v1(),
      'net_skins', production_control.director_private_net_skins_v1(),
      'audit_timeline', production_control
        .director_private_audit_with_access_v1(),
      'bounds', pg_catalog.jsonb_build_object(
        'job_limit_per_domain', 8,
        'audit_limit', 60,
        'audit_window_days', 90
      )
    )
  );
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'production_control.reject_access_governance_immutable_v1()',
    'production_control.access_governance_revision_v1(text)',
    'production_control.access_governance_hash_v1(jsonb)',
    'production_control.access_governance_profile_revision_v1(text)',
    'production_control.access_governance_membership_revision_v1(text,text)',
    'production_control.access_governance_slug_v1(text)',
    'production_control.access_governance_global_status_v1(text)',
    'public.read_production_player_editorial(jsonb)',
    'production_control.assert_access_governance_runtime_v1(jsonb)',
    'production_control.assert_access_governance_owner_v1(text,text,uuid)',
    'production_control.assert_access_governance_safe_reason_v1(text)',
    'production_control.access_governance_membership_dependencies_v1(text)',
    'public.read_production_access_governance_v1(jsonb)',
    'public.mutate_production_access_governance_v1(jsonb)',
    'public.adopt_initial_production_owner_v1(jsonb)',
    'production_control.director_private_audit_with_access_v1()'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
  end loop;
end;
$$;

grant execute on function public.read_production_access_governance_v1(jsonb)
  to service_role;
grant execute on function public.mutate_production_access_governance_v1(jsonb)
  to service_role;
grant execute on function public.read_production_player_editorial(jsonb)
  to service_role;

revoke all on table production_control.player_governance_profiles_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.tournament_owner_capabilities_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.access_governance_context_v1
  from public, anon, authenticated, service_role;
revoke all on table
  production_control.access_governance_membership_revisions_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.access_governance_operation_receipts_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.access_governance_audit_events_v1
  from public, anon, authenticated, service_role;

comment on function public.read_production_access_governance_v1(jsonb) is
  'Returns a Director-only, identifier-safe access-governance projection. Membership creation remains read-only TEAM_ASSIGNMENT_REQUIRED.';
comment on function public.mutate_production_access_governance_v1(jsonb) is
  'Applies bounded global Player creation/status, existing-membership withdrawal/reactivation, and Owner-authorized Director grant/revoke without team, handicap, Auth, pairing, or scoring side effects.';
comment on function public.adopt_initial_production_owner_v1(jsonb) is
  'Database-owner-only, one-time, exact-scope initial Owner adoption. Never granted to service_role and never invoked by installation.';
comment on function public.read_production_player_editorial(jsonb) is
  'Returns the existing Production PLAYER_EDITORIAL DTO with only explicit access-governance global status overlaid onto public_profile.Active. Source projection facts and provenance remain unchanged; global-only Players are not added.';

notify pgrst, 'reload schema';
commit;
