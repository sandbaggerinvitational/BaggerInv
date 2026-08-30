-- Step 13E.4 Production Players & Access administration.
--
-- Installation is inert: it adds the bounded Director contract and empty
-- revision/audit/receipt tables, but does not change a Player, membership,
-- identifier, Auth link, entitlement, authority, worker, or tournament fact.
-- Email approval deliberately advances the existing approved identity
-- configuration snapshot so the certified first-login flow remains unchanged.
-- Phone approval is eligibility data only; this migration does not enable SMS,
-- attach a phone to Auth, send an OTP, or claim verification.
begin;

create table participant_identity.player_access_context_v1 (
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

create table participant_identity.player_approved_phones_v1 (
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  phone_e164 text not null check (
    phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  ),
  status text not null check (status in ('APPROVED', 'VERIFIED', 'REVOKED')),
  phone_revision bigint not null check (phone_revision > 0),
  approved_at timestamptz not null,
  approved_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  approved_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  verified_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, player_id),
  check (
    (status = 'APPROVED' and verified_at is null and revoked_at is null)
    or (status = 'VERIFIED' and verified_at is not null and revoked_at is null)
    or (status = 'REVOKED' and revoked_at is not null)
  )
);

create unique index player_approved_phone_current_value_v1
  on participant_identity.player_approved_phones_v1(phone_e164)
  where status in ('APPROVED', 'VERIFIED');

create table participant_identity.player_login_preferences_v1 (
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  preferred_login_method text not null check (
    preferred_login_method in ('EMAIL_PRIMARY', 'PHONE_PRIMARY')
  ),
  preference_revision bigint not null check (preference_revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, player_id)
);

create table participant_identity.player_access_operation_receipts_v1 (
  receipt_id uuid not null default extensions.gen_random_uuid() unique,
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  operation text not null check (operation in (
    'APPROVE_EMAIL', 'APPROVE_PHONE', 'REVOKE_PHONE',
    'SET_LOGIN_PREFERENCE', 'SUSPEND_ACCESS', 'RESUME_ACCESS', 'BULK_ENROLL'
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

create table participant_identity.player_access_audit_events_v1 (
  event_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  action text not null check (action in (
    'EMAIL_APPROVED', 'PHONE_APPROVED', 'PHONE_REVOKED',
    'LOGIN_PREFERENCE_CHANGED', 'PARTICIPANT_ACCESS_SUSPENDED',
    'PARTICIPANT_ACCESS_RESUMED',
    'BULK_ENROLLMENT_APPLIED'
  )),
  target_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  prior_revision bigint not null check (prior_revision >= 0),
  next_revision bigint not null check (next_revision >= prior_revision),
  operation_request_id uuid not null,
  result text not null check (result in ('CHANGED', 'NO_CHANGE')),
  safe_metadata jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(safe_metadata) = 'object'
  ),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (result = 'CHANGED' and next_revision = prior_revision + 1)
    or (result = 'NO_CHANGE' and next_revision = prior_revision)
  )
);

create index player_access_audit_timeline_v1
  on participant_identity.player_access_audit_events_v1(
    tournament_id, occurred_at desc, event_id
  );

alter table participant_identity.player_access_context_v1 enable row level security;
alter table participant_identity.player_approved_phones_v1 enable row level security;
alter table participant_identity.player_login_preferences_v1 enable row level security;
alter table participant_identity.player_access_operation_receipts_v1 enable row level security;
alter table participant_identity.player_access_audit_events_v1 enable row level security;

create or replace function production_control.reject_player_access_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, production_control
as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_PLAYER_ACCESS_IMMUTABLE_RECORD';
end;
$$;

create trigger player_access_receipts_immutable_v1
before update or delete on participant_identity.player_access_operation_receipts_v1
for each row execute function production_control.reject_player_access_immutable_v1();

create trigger player_access_audit_immutable_v1
before update or delete on participant_identity.player_access_audit_events_v1
for each row execute function production_control.reject_player_access_immutable_v1();

create or replace function
  production_control.serialize_player_access_identity_claim_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, participant_identity
as $$
declare
  current_revision bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-participant-identity-config-v1:2026', 0
  ));
  if new.status = 'PENDING' then
    select value.context_revision into strict current_revision
    from participant_identity.identity_context_revisions value
    where value.tournament_id = '2026';
    if new.tournament_id <> '2026'
       or new.source_configuration_revision <> current_revision
       or not exists (
         select 1
         from participant_identity.participant_identity_contacts contact
         where contact.tournament_id = '2026'
           and contact.player_id = new.player_id
           and contact.identity_active
           and contact.configuration_revision = current_revision
       ) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_PARTICIPANT_IDENTITY_CONFIGURATION_ADVANCED';
    end if;
  end if;
  return new;
end;
$$;

create trigger production_participant_identity_claim_serialization_v1
before insert or update
on participant_identity.production_participant_enrollment_claims
for each row execute function
  production_control.serialize_player_access_identity_claim_v1();

create or replace function production_control.player_access_hash_v1(value jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, extensions
as $$
  select pg_catalog.encode(extensions.digest(value::text, 'sha256'), 'hex')
$$;

create or replace function production_control.player_access_revision_v1(
  target_tournament text
)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, participant_identity
as $$
  select coalesce((
    select value.revision
    from participant_identity.player_access_context_v1 value
    where value.tournament_id = target_tournament
  ), 0)::bigint
$$;

create or replace function production_control.mask_player_access_email_v1(
  value text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case when pg_catalog.btrim(coalesce(value, '')) = '' then null
    else pg_catalog.left(pg_catalog.split_part(value, '@', 1), 1)
      || '***@'
      || pg_catalog.left(pg_catalog.split_part(value, '@', 2), 1)
      || '***.'
      || pg_catalog.reverse(pg_catalog.split_part(
        pg_catalog.reverse(pg_catalog.split_part(value, '@', 2)), '.', 1
      ))
    end
$$;

create or replace function production_control.mask_player_access_phone_v1(
  value text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case when value ~ '^\+[1-9][0-9]{7,14}$'
    then '+••• ••• ••' || pg_catalog.right(value, 2)
    else null end
$$;

create or replace function production_control.assert_player_access_runtime_v1(
  input jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control
as $$
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_production_scoring_actor(input, true);
  perform production_control.assert_production_handicap_runtime();
  if input->>'contract_version' is distinct from 'production-players-access-v1'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PLAYER_ACCESS_SCOPE_REQUIRED';
  end if;
end;
$$;

create or replace function production_control.apply_player_email_v1(
  target_player text,
  target_email text,
  actor_player text,
  actor_auth_user uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity,
  scoring_authority, extensions
as $$
declare
  normalized text := pg_catalog.lower(pg_catalog.btrim(target_email));
  domain_value text := pg_catalog.split_part(normalized, '@', 2);
  current_value participant_identity.participant_identity_contacts%rowtype;
  current_context participant_identity.identity_context_revisions%rowtype;
  next_identity_revision bigint;
  fingerprint_value text;
  active_roster_count integer;
  active_contact_count integer;
  workbook_id constant text :=
    '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
begin
  if pg_catalog.length(normalized) > 320
     or normalized !~* (
       '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@'
       || '[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?'
       || '(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'
     )::pg_catalog.text collate "C"
     or domain_value ~* '(^|\.)(example\.(com|net|org)|invalid|test|localhost)$'
     or pg_catalog.split_part(normalized, '@', 1)
       ~* '(^|[+._-])(test|fake|placeholder|dummy)([+._-]|$)' then
    raise exception using errcode = '22023',
      message = 'PLAYER_ACCESS_EMAIL_INVALID';
  end if;
  if not exists (
    select 1 from scoring_authority.tournament_players membership
    where membership.tournament_id = '2026'
      and membership.player_id = target_player
      and membership.participation_status = 'ACTIVE'
  ) then
    raise exception using errcode = '22023',
      message = 'PLAYER_ACCESS_ACTIVE_MEMBERSHIP_REQUIRED';
  end if;
  if exists (
    select 1 from participant_identity.participant_identity_contacts contact
    where contact.tournament_id = '2026'
      and contact.identity_active
      and contact.email_normalized = normalized
      and contact.player_id <> target_player
  ) or exists (
    select 1 from participant_identity.participant_auth_identifiers identifier
    where identifier.identifier_type = 'EMAIL'
      and identifier.normalized_value_private = normalized
      and identifier.player_id <> target_player
      and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
  ) or exists (
    select 1 from auth.users auth_user
    where pg_catalog.lower(pg_catalog.btrim(auth_user.email)) = normalized
      and not exists (
        select 1 from participant_identity.user_player_links target_link
        where target_link.auth_user_id = auth_user.id
          and target_link.player_id = target_player
          and target_link.status in ('PENDING', 'ACTIVE', 'SUSPENDED')
      )
  ) then
    raise exception using errcode = '23505',
      message = 'PLAYER_ACCESS_EMAIL_COLLISION';
  end if;

  select value.* into current_value
  from participant_identity.participant_identity_contacts value
  where value.tournament_id = '2026' and value.player_id = target_player;
  if found and current_value.identity_active
     and current_value.email_normalized = normalized then
    return false;
  end if;
  if found and current_value.email_normalized is distinct from normalized
     and exists (
       select 1 from participant_identity.user_player_links link
       where link.player_id = target_player
         and link.status in ('PENDING', 'ACTIVE', 'SUSPENDED')
     ) then
    raise exception using errcode = '55000',
      message = 'PLAYER_ACCESS_LINKED_EMAIL_REPAIR_REQUIRED';
  end if;
  perform claim.claim_id
  from participant_identity.production_participant_enrollment_claims claim
  where claim.tournament_id = '2026'
    and claim.status in ('PENDING', 'CLEANUP_REQUIRED')
  order by claim.claim_id
  for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-participant-identity-config-v1:2026', 0
  ));
  update participant_identity.production_participant_enrollment_claims set
    status = 'CANCELLED',
    cancelled_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = '2026'
    and status = 'PENDING'
    and expires_at <= pg_catalog.clock_timestamp();
  if exists (
    select 1
    from participant_identity.production_participant_enrollment_claims claim
    where claim.tournament_id = '2026'
      and (
        (claim.status = 'PENDING'
          and claim.expires_at > pg_catalog.clock_timestamp())
        or claim.status = 'CLEANUP_REQUIRED'
      )
  ) then
    raise exception using errcode = '55000',
      message = 'PLAYER_ACCESS_ENROLLMENT_CLAIM_IN_FLIGHT';
  end if;

  select value.* into strict current_context
  from participant_identity.identity_context_revisions value
  where value.tournament_id = '2026' for update;
  next_identity_revision := current_context.context_revision + 1;

  update participant_identity.participant_identity_contacts set
    configuration_revision = next_identity_revision,
    source_system = 'DIRECTOR_CONSOLE',
    source_workbook_id = workbook_id,
    source_updated_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = '2026' and identity_active;

  insert into participant_identity.participant_identity_contacts (
    tournament_id, player_id, email, email_normalized, identity_active,
    configuration_revision, verified_by, verified_at, source_system,
    source_workbook_id, source_updated_at
  ) values (
    '2026', target_player, normalized, normalized, true,
    next_identity_revision, actor_player, pg_catalog.clock_timestamp(),
    'DIRECTOR_CONSOLE', workbook_id, pg_catalog.clock_timestamp()
  ) on conflict (tournament_id, player_id) do update set
    email = excluded.email,
    email_normalized = excluded.email_normalized,
    identity_active = true,
    configuration_revision = excluded.configuration_revision,
    verified_by = excluded.verified_by,
    verified_at = excluded.verified_at,
    source_system = excluded.source_system,
    source_workbook_id = excluded.source_workbook_id,
    source_updated_at = excluded.source_updated_at,
    updated_at = pg_catalog.clock_timestamp();

  select production_control.player_access_hash_v1(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-players-access-v1',
      'configuration_revision', next_identity_revision,
      'contacts', coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'player_id', contact.player_id,
          'email_normalized', contact.email_normalized
        ) order by contact.player_id
      ), '[]'::jsonb)
    )
  ) into fingerprint_value
  from participant_identity.participant_identity_contacts contact
  where contact.tournament_id = '2026' and contact.identity_active;

  select pg_catalog.count(*)::integer into active_roster_count
  from scoring_authority.tournament_players membership
  where membership.tournament_id = '2026'
    and membership.participation_status = 'ACTIVE';
  select pg_catalog.count(*)::integer into active_contact_count
  from participant_identity.participant_identity_contacts contact
  where contact.tournament_id = '2026' and contact.identity_active;

  insert into participant_identity.identity_config_import_runs (
    tournament_id, source_system, source_workbook_id, source_fingerprint,
    configuration_revision, status, roster_count, received_count,
    valid_count, missing_count, duplicate_count, malformed_count,
    shared_count, inactive_count, unknown_player_count,
    mapping_conflict_count, validation_report, requested_by, approved_by,
    approved_at
  ) values (
    '2026', 'DIRECTOR_CONSOLE', workbook_id, fingerprint_value,
    next_identity_revision, 'APPROVED', active_roster_count,
    active_contact_count, active_contact_count,
    greatest(active_roster_count - active_contact_count, 0),
    0, 0, 0, 0, 0, 0,
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-players-access-v1',
      'authoring_authority', 'SUPABASE_DIRECTOR',
      'approved_identifier_count', active_contact_count,
      'auth_users_created', 0,
      'otp_sent', false
    ), actor_player, actor_player, pg_catalog.clock_timestamp()
  );

  update participant_identity.identity_context_revisions set
    context_revision = next_identity_revision,
    configuration_fingerprint = fingerprint_value,
    updated_by = actor_player,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = '2026';

  return true;
end;
$$;

create or replace function production_control.apply_player_phone_v1(
  target_player text,
  target_phone text,
  actor_player text,
  actor_auth_user uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, participant_identity, scoring_authority
as $$
declare
  current_value participant_identity.player_approved_phones_v1%rowtype;
begin
  if target_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using errcode = '22023',
      message = 'PLAYER_ACCESS_PHONE_INVALID';
  end if;
  if not exists (
    select 1 from scoring_authority.tournament_players membership
    where membership.tournament_id = '2026'
      and membership.player_id = target_player
      and membership.participation_status = 'ACTIVE'
  ) then
    raise exception using errcode = '22023',
      message = 'PLAYER_ACCESS_ACTIVE_MEMBERSHIP_REQUIRED';
  end if;
  if exists (
    select 1 from participant_identity.player_approved_phones_v1 phone
    where phone.phone_e164 = target_phone
      and phone.player_id <> target_player
      and phone.status in ('APPROVED', 'VERIFIED')
  ) or exists (
    select 1 from participant_identity.participant_auth_identifiers identifier
    where identifier.identifier_type = 'PHONE'
      and identifier.normalized_value_private = target_phone
      and identifier.player_id <> target_player
      and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
  ) or exists (
    select 1 from auth.users auth_user
    where pg_catalog.btrim(coalesce(auth_user.phone, '')) = target_phone
      and not exists (
        select 1 from participant_identity.user_player_links target_link
        where target_link.auth_user_id = auth_user.id
          and target_link.player_id = target_player
          and target_link.status in ('PENDING', 'ACTIVE', 'SUSPENDED')
      )
  ) then
    raise exception using errcode = '23505',
      message = 'PLAYER_ACCESS_PHONE_COLLISION';
  end if;
  select value.* into current_value
  from participant_identity.player_approved_phones_v1 value
  where value.tournament_id = '2026' and value.player_id = target_player;
  if found and current_value.phone_e164 = target_phone
     and current_value.status in ('APPROVED', 'VERIFIED') then
    return false;
  end if;
  if found and current_value.status = 'VERIFIED' then
    raise exception using errcode = '55000',
      message = 'PLAYER_ACCESS_VERIFIED_PHONE_REPAIR_REQUIRED';
  end if;
  if exists (
    select 1 from participant_identity.participant_auth_identifiers identifier
    where identifier.player_id = target_player
      and identifier.identifier_type = 'PHONE'
      and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING')
  ) then
    raise exception using errcode = '55000',
      message = 'PLAYER_ACCESS_PHONE_CLAIM_IN_FLIGHT';
  end if;
  if exists (
    select 1 from participant_identity.participant_auth_identifiers identifier
    where identifier.player_id = target_player
      and identifier.identifier_type = 'PHONE'
      and identifier.status = 'VERIFIED'
      and identifier.normalized_value_private <> target_phone
  ) then
    raise exception using errcode = '55000',
      message = 'PLAYER_ACCESS_VERIFIED_PHONE_REPAIR_REQUIRED';
  end if;
  insert into participant_identity.player_approved_phones_v1 (
    tournament_id, player_id, phone_e164, status, phone_revision,
    approved_at, approved_by_player_id, approved_by_auth_user_id
  ) values (
    '2026', target_player, target_phone, 'APPROVED', 1,
    pg_catalog.clock_timestamp(), actor_player, actor_auth_user
  ) on conflict (tournament_id, player_id) do update set
    phone_e164 = excluded.phone_e164,
    status = 'APPROVED',
    phone_revision = participant_identity.player_approved_phones_v1.phone_revision + 1,
    approved_at = excluded.approved_at,
    approved_by_player_id = excluded.approved_by_player_id,
    approved_by_auth_user_id = excluded.approved_by_auth_user_id,
    verified_at = null,
    revoked_at = null,
    updated_at = pg_catalog.clock_timestamp();
  return true;
end;
$$;

create or replace function public.read_production_players_access_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, participant_identity,
  scoring_authority
as $$
declare
  inspection jsonb;
  players_value jsonb;
  audit_value jsonb;
  revision_value bigint;
  roster_count integer;
  enrolled_count integer;
  not_enrolled_count integer;
  attention_count integer;
begin
  perform production_control.assert_player_access_runtime_v1(input);
  if input->>'operation' is distinct from 'READ_PRODUCTION_PLAYERS_ACCESS_V1' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_PLAYER_ACCESS_READ_INPUT_INVALID';
  end if;
  inspection := production_control
    .build_production_participant_identity_enrollment_inspection();
  revision_value := production_control.player_access_revision_v1('2026');

  with enrollment as (
    select value->>'playerId' player_id,
      value->>'enrollmentStatus' enrollment_status,
      value->>'maskedEmail' masked_email
    from pg_catalog.jsonb_array_elements(
      coalesce(inspection->'players', '[]'::jsonb)
    ) value
  ), directory as (
    select
      player.player_id,
      player.display_name,
      membership.player_id is not null membership_exists,
      membership.participation_status membership_status,
      membership.team_id,
      team.name team_name,
      coalesce(enrollment.enrollment_status,
        case when membership.participation_status = 'ACTIVE'
          then 'NOT_ENROLLED' else 'NOT_ENROLLED' end
      ) enrollment_status,
      enrollment.masked_email,
      contact.identity_active email_active,
      auth_email.status auth_email_status,
      link.status link_status,
      entitlement.status director_status,
      coalesce(preference.preferred_login_method, 'EMAIL_PRIMARY')
        preferred_login_method,
      case
        when phone.status = 'VERIFIED' or auth_phone.status = 'VERIFIED'
          then 'VERIFIED'
        when phone.status = 'APPROVED'
          or auth_phone.status in ('ELIGIBLE', 'VERIFICATION_PENDING')
          then 'APPROVED'
        else 'NOT_CONFIGURED'
      end phone_status,
      coalesce((
        select pg_catalog.jsonb_agg(role_value.role order by role_value.role)
        from participant_identity.tournament_roles role_value
        where role_value.tournament_id = '2026'
          and role_value.auth_user_id = link.auth_user_id
          and role_value.role_active
          and role_value.revoked_at is null
      ), '[]'::jsonb) tournament_roles,
      case when auth_phone.status = 'VERIFIED'
        then production_control.mask_player_access_phone_v1(
          auth_phone.normalized_value_private
        )
        else coalesce(
          production_control.mask_player_access_phone_v1(phone.phone_e164),
          production_control.mask_player_access_phone_v1(
            auth_phone.normalized_value_private
          )
        )
      end masked_phone,
      exists (
        select 1 from scoring_authority.match_participants participant
        join scoring_authority.matches match_value
          on match_value.match_id = participant.match_id
        where match_value.tournament_id = '2026'
          and participant.player_id = player.player_id
      ) match_dependency
    from scoring_authority.players player
    left join scoring_authority.tournament_players membership
      on membership.tournament_id = '2026'
     and membership.player_id = player.player_id
    left join scoring_authority.teams team
      on team.tournament_id = membership.tournament_id
     and team.team_id = membership.team_id
    left join enrollment on enrollment.player_id = player.player_id
    left join participant_identity.participant_identity_contacts contact
      on contact.tournament_id = '2026' and contact.player_id = player.player_id
    left join participant_identity.user_player_links link
      on link.player_id = player.player_id
     and link.status in ('PENDING', 'ACTIVE', 'SUSPENDED')
    left join production_control.director_entitlements entitlement
      on entitlement.tournament_id = '2026'
     and entitlement.player_id = player.player_id
    left join lateral (
      select identifier.status
      from participant_identity.participant_auth_identifiers identifier
      where identifier.player_id = player.player_id
        and identifier.auth_user_id = link.auth_user_id
        and identifier.identifier_type = 'EMAIL'
        and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
      order by identifier.revision desc limit 1
    ) auth_email on true
    left join participant_identity.player_login_preferences_v1 preference
      on preference.tournament_id = '2026'
     and preference.player_id = player.player_id
    left join participant_identity.player_approved_phones_v1 phone
      on phone.tournament_id = '2026'
     and phone.player_id = player.player_id
     and phone.status in ('APPROVED', 'VERIFIED')
    left join lateral (
      select identifier.status, identifier.normalized_value_private
      from participant_identity.participant_auth_identifiers identifier
      where identifier.player_id = player.player_id
        and identifier.auth_user_id = link.auth_user_id
        and identifier.identifier_type = 'PHONE'
        and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
      order by identifier.revision desc limit 1
    ) auth_phone on true
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'playerId', value.player_id,
    'displayName', value.display_name,
    'globalStatus', 'ACTIVE_RECORD',
    'membership', pg_catalog.jsonb_build_object(
      'exists', value.membership_exists,
      'status', coalesce(value.membership_status, 'NOT_PLAYING'),
      'teamId', value.team_id,
      'teamName', value.team_name,
      'revision', revision_value,
      'canChange', false,
      'blocker', case
        when not value.membership_exists then 'TEAM_ASSIGNMENT_REQUIRED'
        else 'TOURNAMENT_SETUP_COORDINATION_REQUIRED' end
    ),
    'enrollmentState', value.enrollment_status,
    'maskedEmail', value.masked_email,
    'emailStatus', case
      when value.auth_email_status = 'VERIFIED' then 'VERIFIED'
      when value.enrollment_status = 'ENROLLED' then 'APPROVED'
      when value.email_active then 'APPROVED'
      else 'NOT_CONFIGURED' end,
    'maskedPhone', value.masked_phone,
    'phoneStatus', case value.phone_status
      when 'ELIGIBLE' then 'APPROVED'
      when 'VERIFICATION_PENDING' then 'APPROVED'
      else value.phone_status end,
    'preferredLoginMethod', value.preferred_login_method,
    'effectiveLoginMethod', case
      when value.preferred_login_method = 'PHONE_PRIMARY'
       and value.phone_status = 'VERIFIED' then 'PHONE_PRIMARY'
      when value.enrollment_status = 'ENROLLED' then 'EMAIL_PRIMARY'
      else 'UNAVAILABLE' end,
    'authLinkState', case
      when value.link_status = 'ACTIVE' then 'LINKED'
      when value.link_status is null then 'NOT_PROVISIONED'
      else 'NEEDS_ATTENTION' end,
    'participantAccessState', case
      when value.membership_status is distinct from 'ACTIVE' then 'INACTIVE'
      when value.enrollment_status <> 'ENROLLED' then 'NOT_ENROLLED'
      when value.link_status = 'SUSPENDED' then 'SUSPENDED'
      when value.link_status = 'ACTIVE' then 'ACTIVE'
      else 'ELIGIBLE_NOT_PROVISIONED' end,
    'roles', value.tournament_roles,
    'directorStatus', coalesce(value.director_status, 'NONE'),
    'needsAttention', coalesce(
      value.enrollment_status = 'INVALID_ENROLLMENT'
      or value.link_status in ('PENDING', 'SUSPENDED')
      or (
        value.preferred_login_method = 'PHONE_PRIMARY'
        and value.phone_status <> 'VERIFIED'
      ),
      false
    )
  ) order by value.display_name, value.player_id), '[]'::jsonb)
  into players_value from directory value;

  select pg_catalog.count(*)::integer into roster_count
  from scoring_authority.tournament_players value
  where value.tournament_id = '2026'
    and value.participation_status = 'ACTIVE';
  enrolled_count := coalesce((inspection->>'enrolledCount')::integer, 0);
  not_enrolled_count := coalesce((inspection->>'notEnrolledCount')::integer, 0);
  select pg_catalog.count(*)::integer into attention_count
  from pg_catalog.jsonb_array_elements(players_value) value
  where coalesce((value->>'needsAttention')::boolean, false);

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'eventId', event.event_id,
    'action', event.action,
    'targetPlayerId', event.target_player_id,
    'actorPlayerId', event.actor_player_id,
    'result', event.result,
    'revision', event.next_revision,
    'occurredAt', event.occurred_at
  ) order by event.occurred_at desc), '[]'::jsonb)
  into audit_value
  from (
    select value.*
    from participant_identity.player_access_audit_events_v1 value
    where value.tournament_id = '2026'
    order by value.occurred_at desc limit 40
  ) event;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contractVersion', 'production-players-access-v1',
      'tournamentId', '2026',
      'revision', revision_value,
      'summary', pg_catalog.jsonb_build_object(
        'globalPlayers', pg_catalog.jsonb_array_length(players_value),
        'activeRoster', roster_count,
        'enrolled', enrolled_count,
        'notEnrolled', not_enrolled_count,
        'needsAttention', attention_count
      ),
      'players', players_value,
      'audit', audit_value,
      'capabilities', pg_catalog.jsonb_build_object(
        'approveEmail', true,
        'approvePhone', true,
        'revokePhone', true,
        'setLoginPreference', true,
        'bulkEnrollment', true,
        'changeExistingMembershipStatus', false,
        'suspendParticipantAccess', true,
        'resumeParticipantAccess', true,
        'createMembership', false,
        'createGlobalPlayer', false,
        'manageDirectorEntitlement', false,
        'smsAuthenticationEnabled', false,
        'manualAuthProvisioning', false
      ),
      'deferred', pg_catalog.jsonb_build_array(
        'GLOBAL_PLAYER_ID_ALLOCATION_POLICY_REQUIRED',
        'TEAM_ASSIGNMENT_OPERATION_REQUIRED_FOR_NEW_MEMBERSHIP',
        'OWNER_AND_FINAL_DIRECTOR_POLICY_REQUIRED',
        'SMS_AUTHENTICATION_MILESTONE_REQUIRED'
      )
    )
  );
end;
$$;

create or replace function public.mutate_production_players_access_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity,
  scoring_authority
as $$
declare
  action_value text := pg_catalog.upper(pg_catalog.btrim(
    coalesce(input->>'action', '')
  ));
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
  target_player text := pg_catalog.upper(pg_catalog.btrim(
    coalesce(input->>'player_id', '')
  ));
  expected_revision bigint;
  current_revision bigint;
  next_revision bigint;
  operation_request uuid;
  declared_hash text := pg_catalog.lower(coalesce(
    input->>'request_payload_hash', ''
  ));
  database_hash text;
  receipt participant_identity.player_access_operation_receipts_v1%rowtype;
  response_value jsonb;
  changed_value boolean := false;
  changed_count integer := 0;
  target_status text;
  metadata_value jsonb := '{}'::jsonb;
  audit_action text;
  item jsonb;
begin
  perform production_control.assert_player_access_runtime_v1(input);
  if action_value not in (
       'APPROVE_EMAIL', 'APPROVE_PHONE', 'REVOKE_PHONE',
       'SET_LOGIN_PREFERENCE', 'SUSPEND_ACCESS', 'RESUME_ACCESS', 'BULK_ENROLL'
     )
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_revision', '') !~ '^[0-9]+$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PLAYER_ACCESS_INPUT_INVALID'
    );
  end if;
  begin
    operation_request := (input->>'operation_request_id')::uuid;
    expected_revision := (input->>'expected_revision')::bigint;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PLAYER_ACCESS_INPUT_INVALID'
    );
  end;
  database_hash := production_control.player_access_hash_v1(
    input - 'request_payload_hash'
  );

  select value.* into receipt
  from participant_identity.player_access_operation_receipts_v1 value
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
      'ok', false, 'code', 'PLAYER_ACCESS_IDEMPOTENCY_CONFLICT'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-players-access-v1:2026', 0
  ));
  select value.* into receipt
  from participant_identity.player_access_operation_receipts_v1 value
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
      'ok', false, 'code', 'PLAYER_ACCESS_IDEMPOTENCY_CONFLICT'
    );
  end if;

  current_revision := production_control.player_access_revision_v1('2026');
  if current_revision <> expected_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PLAYER_ACCESS_REVISION_STALE',
      'currentRevision', current_revision
    );
  end if;

  begin
    if action_value <> 'BULK_ENROLL' and not exists (
      select 1 from scoring_authority.players player
      where player.player_id = target_player
    ) then
      raise exception using errcode = '22023',
        message = 'PLAYER_ACCESS_PLAYER_ID_REQUIRED';
    end if;
    if action_value = 'APPROVE_EMAIL' then
      if target_player = '' then
        raise exception using errcode = '22023',
          message = 'PLAYER_ACCESS_PLAYER_ID_REQUIRED';
      end if;
      changed_value := production_control.apply_player_email_v1(
        target_player, input->>'email', actor_player, actor_auth_user
      );
      audit_action := 'EMAIL_APPROVED';
      metadata_value := pg_catalog.jsonb_build_object(
        'identifier_type', 'EMAIL', 'ownership_verified', false,
        'auth_user_created', false
      );
    elsif action_value = 'APPROVE_PHONE' then
      if target_player = '' then
        raise exception using errcode = '22023',
          message = 'PLAYER_ACCESS_PLAYER_ID_REQUIRED';
      end if;
      changed_value := production_control.apply_player_phone_v1(
        target_player, input->>'phone_e164', actor_player, actor_auth_user
      );
      audit_action := 'PHONE_APPROVED';
      metadata_value := pg_catalog.jsonb_build_object(
        'identifier_type', 'PHONE', 'status', 'APPROVED',
        'verified', false, 'sms_sent', false
      );
    elsif action_value = 'REVOKE_PHONE' then
      if exists (
        select 1 from participant_identity.participant_auth_identifiers identifier
        where identifier.player_id = target_player
          and identifier.identifier_type = 'PHONE'
          and identifier.status = 'VERIFIED'
      ) then
        raise exception using errcode = '55000',
          message = 'PLAYER_ACCESS_VERIFIED_PHONE_REPAIR_REQUIRED';
      end if;
      if exists (
        select 1 from participant_identity.participant_auth_identifiers identifier
        where identifier.player_id = target_player
          and identifier.identifier_type = 'PHONE'
          and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING')
      ) then
        raise exception using errcode = '55000',
          message = 'PLAYER_ACCESS_PHONE_CLAIM_IN_FLIGHT';
      end if;
      update participant_identity.player_approved_phones_v1 set
        status = 'REVOKED', phone_revision = phone_revision + 1,
        revoked_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
      where tournament_id = '2026' and player_id = target_player
        and status = 'APPROVED';
      changed_value := found;
      audit_action := 'PHONE_REVOKED';
      metadata_value := pg_catalog.jsonb_build_object(
        'identifier_type', 'PHONE', 'status', 'REVOKED'
      );
    elsif action_value = 'SET_LOGIN_PREFERENCE' then
      if not exists (
        select 1 from scoring_authority.tournament_players membership
        where membership.tournament_id = '2026'
          and membership.player_id = target_player
          and membership.participation_status = 'ACTIVE'
      ) then
        raise exception using errcode = '22023',
          message = 'PLAYER_ACCESS_ACTIVE_MEMBERSHIP_REQUIRED';
      end if;
      target_status := pg_catalog.upper(pg_catalog.btrim(
        coalesce(input->>'preferred_login_method', '')
      ));
      if target_status not in ('EMAIL_PRIMARY', 'PHONE_PRIMARY') then
        raise exception using errcode = '22023',
          message = 'PLAYER_ACCESS_LOGIN_PREFERENCE_INVALID';
      end if;
      if target_status = 'PHONE_PRIMARY' and not exists (
        select 1 from participant_identity.participant_auth_identifiers identifier
        where identifier.player_id = target_player
          and identifier.identifier_type = 'PHONE'
          and identifier.status = 'VERIFIED'
      ) and not exists (
        select 1 from participant_identity.player_approved_phones_v1 phone
        where phone.tournament_id = '2026'
          and phone.player_id = target_player
          and phone.status = 'VERIFIED'
      ) then
        raise exception using errcode = '55000',
          message = 'PLAYER_ACCESS_VERIFIED_PHONE_REQUIRED';
      end if;
      if exists (
        select 1 from participant_identity.player_login_preferences_v1 value
        where value.tournament_id = '2026'
          and value.player_id = target_player
          and value.preferred_login_method = target_status
      ) then
        changed_value := false;
      else
        insert into participant_identity.player_login_preferences_v1 (
          tournament_id, player_id, preferred_login_method,
          preference_revision, updated_by_player_id, updated_by_auth_user_id
        ) values (
          '2026', target_player, target_status, 1,
          actor_player, actor_auth_user
        ) on conflict (tournament_id, player_id) do update set
          preferred_login_method = excluded.preferred_login_method,
          preference_revision = participant_identity
            .player_login_preferences_v1.preference_revision + 1,
          updated_by_player_id = excluded.updated_by_player_id,
          updated_by_auth_user_id = excluded.updated_by_auth_user_id,
          updated_at = pg_catalog.clock_timestamp();
        changed_value := true;
      end if;
      audit_action := 'LOGIN_PREFERENCE_CHANGED';
      metadata_value := pg_catalog.jsonb_build_object(
        'preferred_login_method', target_status
      );
    elsif action_value in ('SUSPEND_ACCESS', 'RESUME_ACCESS') then
      if not exists (
        select 1 from scoring_authority.tournament_players membership
        where membership.tournament_id = '2026'
          and membership.player_id = target_player
          and membership.participation_status = 'ACTIVE'
      ) then
        raise exception using errcode = '22023',
          message = 'PLAYER_ACCESS_ACTIVE_MEMBERSHIP_REQUIRED';
      end if;
      if exists (
        select 1 from production_control.director_entitlements entitlement
        where entitlement.tournament_id = '2026'
          and entitlement.player_id = target_player
          and entitlement.status = 'ACTIVE'
      ) then
        raise exception using errcode = '55000',
          message = 'PLAYER_ACCESS_DIRECTOR_ACCESS_REVIEW_REQUIRED';
      end if;
      if action_value = 'SUSPEND_ACCESS' then
        update participant_identity.user_player_links set
          status = 'SUSPENDED', link_revision = link_revision + 1,
          updated_at = pg_catalog.clock_timestamp()
        where player_id = target_player and status = 'ACTIVE';
        changed_value := found;
        if not changed_value and not exists (
          select 1 from participant_identity.user_player_links link
          where link.player_id = target_player and link.status = 'SUSPENDED'
        ) then
          raise exception using errcode = '55000',
            message = 'PLAYER_ACCESS_LINKED_IDENTITY_REQUIRED';
        end if;
        update participant_identity.tournament_roles set
          role_active = false, role_revision = role_revision + 1,
          revoked_at = pg_catalog.clock_timestamp(),
          revoked_by = actor_player, updated_at = pg_catalog.clock_timestamp()
        where tournament_id = '2026' and role = 'PARTICIPANT'
          and role_active and auth_user_id = (
            select link.auth_user_id
            from participant_identity.user_player_links link
            where link.player_id = target_player and link.status = 'SUSPENDED'
            limit 1
          );
        changed_value := changed_value or found;
        audit_action := 'PARTICIPANT_ACCESS_SUSPENDED';
        metadata_value := pg_catalog.jsonb_build_object(
          'participant_access', 'SUSPENDED', 'auth_user_deleted', false
        );
      else
        if not exists (
          select 1
          from participant_identity.user_player_links link
          join participant_identity.participant_auth_identifiers identifier
            on identifier.auth_user_id = link.auth_user_id
           and identifier.player_id = link.player_id
           and identifier.identifier_type = 'EMAIL'
           and identifier.status = 'VERIFIED'
          join scoring_authority.tournament_players membership
            on membership.tournament_id = '2026'
           and membership.player_id = link.player_id
           and membership.participation_status = 'ACTIVE'
          join participant_identity.participant_identity_contacts contact
            on contact.tournament_id = membership.tournament_id
           and contact.player_id = membership.player_id
           and contact.identity_active
          join auth.users auth_user
            on auth_user.id = link.auth_user_id
           and auth_user.email_confirmed_at is not null
           and pg_catalog.lower(pg_catalog.btrim(coalesce(auth_user.email, '')))
             = contact.email_normalized
           and auth_user.raw_app_meta_data->>'player_id' = link.player_id
           and auth_user.raw_app_meta_data->>'tournament_id' = '2026'
           and auth_user.raw_app_meta_data->>'provisioning_scope' in (
             'production_controlled_first_login',
             'production_shadow_director_certification'
           )
          join participant_identity.identity_context_revisions context
            on context.tournament_id = contact.tournament_id
           and context.context_revision = contact.configuration_revision
          join participant_identity.identity_config_import_runs import_run
            on import_run.tournament_id = contact.tournament_id
           and import_run.configuration_revision = contact.configuration_revision
           and import_run.source_fingerprint = context.configuration_fingerprint
           and import_run.status = 'APPROVED'
           and import_run.approved_at is not null
           and import_run.source_workbook_id =
             '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
          join participant_identity.tournament_roles participant_role
            on participant_role.tournament_id = '2026'
           and participant_role.auth_user_id = link.auth_user_id
           and participant_role.role = 'PARTICIPANT'
           and not participant_role.role_active
           and participant_role.revoked_at is not null
          where link.player_id = target_player and link.status = 'SUSPENDED'
            and identifier.normalized_value_private = contact.email_normalized
            and identifier.source_tournament_id = '2026'
            and contact.source_system = import_run.source_system
            and contact.source_workbook_id = import_run.source_workbook_id
        ) then
          raise exception using errcode = '55000',
            message = 'PLAYER_ACCESS_RESUME_IDENTITY_NOT_READY';
        end if;
        update participant_identity.user_player_links set
          status = 'ACTIVE', link_revision = link_revision + 1,
          updated_at = pg_catalog.clock_timestamp()
        where player_id = target_player and status = 'SUSPENDED';
        changed_value := found;
        update participant_identity.tournament_roles set
          role_active = true, role_revision = role_revision + 1,
          granted_at = pg_catalog.clock_timestamp(), granted_by = actor_player,
          revoked_at = null, revoked_by = null,
          updated_at = pg_catalog.clock_timestamp()
        where tournament_id = '2026' and role = 'PARTICIPANT'
          and not role_active and auth_user_id = (
            select link.auth_user_id
            from participant_identity.user_player_links link
            where link.player_id = target_player and link.status = 'ACTIVE'
            limit 1
          );
        if not found then
          raise exception using errcode = '55000',
            message = 'PLAYER_ACCESS_RESUME_IDENTITY_NOT_READY';
        end if;
        audit_action := 'PARTICIPANT_ACCESS_RESUMED';
        metadata_value := pg_catalog.jsonb_build_object(
          'participant_access', 'ACTIVE', 'identity_revalidated', true
        );
      end if;
    else
      if pg_catalog.jsonb_typeof(input->'entries') is distinct from 'array'
         or pg_catalog.jsonb_array_length(input->'entries') = 0
         or pg_catalog.jsonb_array_length(input->'entries') > 100 then
        raise exception using errcode = '22023',
          message = 'PLAYER_ACCESS_BULK_INPUT_INVALID';
      end if;
      if exists (
        select 1 from pg_catalog.jsonb_array_elements(input->'entries') value
        where pg_catalog.jsonb_typeof(value) <> 'object'
          or pg_catalog.upper(pg_catalog.btrim(coalesce(
            value->>'player_id', ''
          ))) !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
          or (pg_catalog.btrim(coalesce(value->>'email', '')) = ''
            and pg_catalog.btrim(coalesce(value->>'phone_e164', '')) = '')
      ) or exists (
        select 1 from pg_catalog.jsonb_array_elements(input->'entries') value
        group by pg_catalog.upper(pg_catalog.btrim(value->>'player_id'))
        having pg_catalog.count(*) > 1
      ) then
        raise exception using errcode = '22023',
          message = 'PLAYER_ACCESS_BULK_INPUT_INVALID';
      end if;
      for item in select value
        from pg_catalog.jsonb_array_elements(input->'entries') value
        order by pg_catalog.upper(pg_catalog.btrim(value->>'player_id'))
      loop
        target_player := pg_catalog.upper(pg_catalog.btrim(item->>'player_id'));
        if pg_catalog.btrim(coalesce(item->>'email', '')) <> '' then
          if production_control.apply_player_email_v1(
            target_player, item->>'email', actor_player, actor_auth_user
          ) then changed_count := changed_count + 1; end if;
        end if;
        if pg_catalog.btrim(coalesce(item->>'phone_e164', '')) <> '' then
          if production_control.apply_player_phone_v1(
            target_player, item->>'phone_e164', actor_player, actor_auth_user
          ) then changed_count := changed_count + 1; end if;
        end if;
      end loop;
      changed_value := changed_count > 0;
      target_player := null;
      audit_action := 'BULK_ENROLLMENT_APPLIED';
      metadata_value := pg_catalog.jsonb_build_object(
        'entry_count', pg_catalog.jsonb_array_length(input->'entries'),
        'changed_identifier_count', changed_count,
        'targets', (
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'player_id', pg_catalog.upper(pg_catalog.btrim(value->>'player_id')),
            'identifier_types', pg_catalog.array_remove(array[
              case when pg_catalog.btrim(coalesce(value->>'email', '')) <> ''
                then 'EMAIL' end,
              case when pg_catalog.btrim(coalesce(value->>'phone_e164', '')) <> ''
                then 'PHONE' end
            ], null)
          ) order by pg_catalog.upper(pg_catalog.btrim(value->>'player_id')))
          from pg_catalog.jsonb_array_elements(input->'entries') value
        ),
        'atomic', true,
        'auth_users_created', 0,
        'sms_sent', false
      );
    end if;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', case when sqlerrm ~ '^PLAYER_ACCESS_[A-Z0-9_]+$'
        then sqlerrm else 'PLAYER_ACCESS_OPERATION_FAILED' end
    );
  end;

  next_revision := current_revision + case when changed_value then 1 else 0 end;
  if changed_value then
    insert into participant_identity.player_access_context_v1 (
      tournament_id, revision, updated_by_player_id, updated_by_auth_user_id
    ) values (
      '2026', next_revision, actor_player, actor_auth_user
    ) on conflict (tournament_id) do update set
      revision = excluded.revision,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_by_auth_user_id = excluded.updated_by_auth_user_id,
      updated_at = pg_catalog.clock_timestamp();
  end if;

  insert into participant_identity.player_access_audit_events_v1 (
    tournament_id, action, target_player_id, actor_player_id,
    actor_auth_user_id, prior_revision, next_revision,
    operation_request_id, result, safe_metadata
  ) values (
    '2026', audit_action, target_player, actor_player,
    actor_auth_user, current_revision, next_revision,
    operation_request, case when changed_value then 'CHANGED' else 'NO_CHANGE' end,
    metadata_value
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_PLAYER_ACCESS_' || action_value ||
      case when changed_value then '_COMPLETED' else '_NO_CHANGE' end,
    'action', action_value,
    'changed', changed_value,
    'revision', next_revision,
    'idempotent', false,
    'authUsersCreated', 0,
    'otpSent', false
  );
  insert into participant_identity.player_access_operation_receipts_v1 (
    tournament_id, operation, operation_request_id,
    declared_request_payload_hash, database_request_payload_hash,
    actor_player_id, actor_auth_user_id, response
  ) values (
    '2026', action_value, operation_request, declared_hash, database_hash,
    actor_player, actor_auth_user, response_value
  );
  return response_value;
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'production_control.reject_player_access_immutable_v1()',
    'production_control.serialize_player_access_identity_claim_v1()',
    'production_control.player_access_hash_v1(jsonb)',
    'production_control.player_access_revision_v1(text)',
    'production_control.mask_player_access_email_v1(text)',
    'production_control.mask_player_access_phone_v1(text)',
    'production_control.assert_player_access_runtime_v1(jsonb)',
    'production_control.apply_player_email_v1(text,text,text,uuid)',
    'production_control.apply_player_phone_v1(text,text,text,uuid)',
    'public.read_production_players_access_v1(jsonb)',
    'public.mutate_production_players_access_v1(jsonb)'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
  end loop;
end;
$$;

grant execute on function public.read_production_players_access_v1(jsonb)
  to service_role;
grant execute on function public.mutate_production_players_access_v1(jsonb)
  to service_role;

revoke all on table participant_identity.player_access_context_v1
  from public, anon, authenticated, service_role;
revoke all on table participant_identity.player_approved_phones_v1
  from public, anon, authenticated, service_role;
revoke all on table participant_identity.player_login_preferences_v1
  from public, anon, authenticated, service_role;
revoke all on table participant_identity.player_access_operation_receipts_v1
  from public, anon, authenticated, service_role;
revoke all on table participant_identity.player_access_audit_events_v1
  from public, anon, authenticated, service_role;

comment on function public.read_production_players_access_v1(jsonb) is
  'Returns a Director-only masked Production Player/membership/enrollment/access projection without Auth UUIDs or raw identifiers.';
comment on function public.mutate_production_players_access_v1(jsonb) is
  'Applies revisioned, idempotent Production email eligibility, phone readiness, login preference, atomic bulk enrollment, and linked-participant access suspension/resumption. It never creates Auth users or sends OTPs.';

notify pgrst, 'reload schema';
commit;
