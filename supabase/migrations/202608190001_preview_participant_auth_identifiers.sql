-- Step 8B.1: protected, method-neutral participant authentication identifiers.
--
-- This migration is additive. It does not enable phone Auth, change Auth
-- provider configuration, write auth.users.phone/phone_change, send OTPs, or
-- replace the existing email-based participant resolver. Existing email links
-- remain authoritative while this table establishes the future EMAIL/PHONE
-- ownership boundary.

create table participant_identity.participant_auth_identifiers (
  identifier_id uuid primary key default gen_random_uuid(),
  player_id text not null references scoring_authority.players(player_id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  identifier_type text not null check (identifier_type in ('EMAIL', 'PHONE')),
  normalized_value_private text not null,
  status text not null check (status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED', 'REVOKED')),
  verified_at timestamptz,
  verification_source text,
  revision bigint not null default 1 check (revision > 0),
  source_system text not null,
  source_tournament_id text references scoring_authority.tournaments(tournament_id) on delete restrict,
  source_configuration_revision bigint check (source_configuration_revision is null or source_configuration_revision > 0),
  created_by text not null,
  updated_by text not null,
  revoked_at timestamptz,
  revoked_by text,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (normalized_value_private = btrim(normalized_value_private)),
  check (
    (identifier_type = 'EMAIL'
      and normalized_value_private = lower(normalized_value_private)
      and normalized_value_private ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'::text collate "C")
    or
    (identifier_type = 'PHONE'
      and normalized_value_private ~ '^\+[1-9][0-9]{7,14}$'::text collate "C")
  ),
  check (status <> 'VERIFIED' or verified_at is not null),
  check (status not in ('ELIGIBLE', 'VERIFICATION_PENDING') or verified_at is null),
  check (status <> 'REVOKED' or revoked_at is not null)
);

create unique index participant_auth_identifier_current_player_method_idx
  on participant_identity.participant_auth_identifiers(player_id, identifier_type)
  where status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');

create unique index participant_auth_identifier_current_user_method_idx
  on participant_identity.participant_auth_identifiers(auth_user_id, identifier_type)
  where status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');

create unique index participant_auth_identifier_current_email_unique_idx
  on participant_identity.participant_auth_identifiers(normalized_value_private)
  where identifier_type = 'EMAIL' and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');

create unique index participant_auth_identifier_active_phone_unique_idx
  on participant_identity.participant_auth_identifiers(normalized_value_private)
  where identifier_type = 'PHONE' and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');

create index participant_auth_identifier_lookup_idx
  on participant_identity.participant_auth_identifiers(identifier_type, normalized_value_private, status);

create index participant_auth_identifier_player_history_idx
  on participant_identity.participant_auth_identifiers(player_id, identifier_type, updated_at desc);

alter table participant_identity.participant_auth_identifiers enable row level security;
revoke all on participant_identity.participant_auth_identifiers from public, anon, authenticated;
grant select, insert, update on participant_identity.participant_auth_identifiers to service_role;

-- Compatibility backfill: only existing, canonical Auth UID -> Player links are
-- eligible. No Auth users or links are created, and no email resolver is changed.
with email_candidates as (
  select
    link.player_id,
    link.auth_user_id,
    contact.email_normalized,
    contact.tournament_id,
    contact.configuration_revision,
    auth_user.email_confirmed_at,
    row_number() over (
      partition by link.player_id, link.auth_user_id
      order by tournament.tournament_year desc, contact.updated_at desc, contact.tournament_id
    ) as candidate_rank
  from participant_identity.user_player_links link
  join auth.users auth_user on auth_user.id = link.auth_user_id
  join participant_identity.participant_identity_contacts contact
    on contact.player_id = link.player_id
   and contact.identity_active
   and link.email_identity_hash = encode(extensions.digest(contact.email_normalized::text, 'sha256'::text), 'hex')
   and lower(btrim(coalesce(auth_user.email, ''))) = contact.email_normalized
  join scoring_authority.tournaments tournament on tournament.tournament_id = contact.tournament_id
  where link.status in ('PENDING', 'ACTIVE', 'SUSPENDED')
)
insert into participant_identity.participant_auth_identifiers (
  player_id,
  auth_user_id,
  identifier_type,
  normalized_value_private,
  status,
  verified_at,
  verification_source,
  source_system,
  source_tournament_id,
  source_configuration_revision,
  created_by,
  updated_by
)
select
  player_id,
  auth_user_id,
  'EMAIL',
  email_normalized,
  case when email_confirmed_at is not null then 'VERIFIED' else 'ELIGIBLE' end,
  email_confirmed_at,
  case when email_confirmed_at is not null then 'SUPABASE_AUTH_EMAIL_CONFIRMED' else null end,
  'PARTICIPANT_IDENTITY_EMAIL_COMPATIBILITY',
  tournament_id,
  configuration_revision,
  'SYSTEM_EMAIL_COMPATIBILITY_BACKFILL',
  'SYSTEM_EMAIL_COMPATIBILITY_BACKFILL'
from email_candidates
where candidate_rank = 1;

-- Fail closed if an existing current Player link could not be represented by
-- exactly one method-neutral EMAIL identifier. The legacy email source remains
-- untouched when this guard fails because the migration transaction rolls back.
do $$
declare unresolved integer;
begin
  select count(*) into unresolved
  from participant_identity.user_player_links link
  where link.status in ('PENDING', 'ACTIVE', 'SUSPENDED')
    and not exists (
      select 1
      from participant_identity.participant_auth_identifiers identifier
      where identifier.player_id = link.player_id
        and identifier.auth_user_id = link.auth_user_id
        and identifier.identifier_type = 'EMAIL'
        and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
    );
  if unresolved <> 0 then
    raise exception 'Participant Auth email identifier backfill did not reach complete Player-link parity (% unresolved).', unresolved;
  end if;
end $$;

-- Preserve the existing email-link contract while ensuring every future link
-- also receives one canonical method-neutral EMAIL identifier.
create or replace function public.admin_link_auth_user_to_player(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, auth, extensions, pg_temp
as $$
declare user_id uuid := nullif(input->>'auth_user_id', '')::uuid;
declare target_player text := btrim(coalesce(input->>'player_id', ''));
declare target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
declare actor text := btrim(coalesce(input->>'linked_by', ''));
declare contact participant_identity.participant_identity_contacts%rowtype;
declare auth_user auth.users%rowtype;
declare existing participant_identity.user_player_links%rowtype;
declare existing_identifier participant_identity.participant_auth_identifiers%rowtype;
declare inserted_id uuid;
declare identifier_status text;
begin
  if user_id is null or target_player = '' or target_tournament = '' or actor = '' then
    raise exception 'Complete link administration context is required.';
  end if;
  select * into auth_user from auth.users where id = user_id;
  if not found then raise exception 'Auth user does not exist.'; end if;
  select * into contact from participant_identity.participant_identity_contacts
    where tournament_id = target_tournament and player_id = target_player and identity_active;
  if not found then raise exception 'Approved active participant identity contact is required.'; end if;
  if lower(btrim(coalesce(auth_user.email, ''))) <> contact.email_normalized then
    raise exception 'Approved Auth user email does not match Participant Identity ownership.';
  end if;
  identifier_status := case when auth_user.email_confirmed_at is not null then 'VERIFIED' else 'ELIGIBLE' end;

  select * into existing from participant_identity.user_player_links
    where auth_user_id = user_id or (player_id = target_player and status in ('PENDING', 'ACTIVE', 'SUSPENDED')) limit 1;
  if found then
    if existing.auth_user_id <> user_id or existing.player_id <> target_player
      or existing.email_identity_hash <> encode(extensions.digest(contact.email_normalized::text, 'sha256'::text), 'hex') then
      raise exception 'Existing Auth user or Player link requires an explicit audited link-change operation.';
    end if;
    select * into existing_identifier
    from participant_identity.participant_auth_identifiers
    where player_id = target_player and identifier_type = 'EMAIL'
      and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');
    if found and (existing_identifier.auth_user_id <> user_id
      or existing_identifier.normalized_value_private <> contact.email_normalized) then
      raise exception 'Existing email identifier requires an explicit audited ownership change.';
    end if;
    if not found then
      insert into participant_identity.participant_auth_identifiers (
        player_id, auth_user_id, identifier_type, normalized_value_private, status,
        verified_at, verification_source, source_system, source_tournament_id,
        source_configuration_revision, created_by, updated_by
      ) values (
        target_player, user_id, 'EMAIL', contact.email_normalized, identifier_status,
        auth_user.email_confirmed_at,
        case when auth_user.email_confirmed_at is not null then 'SUPABASE_AUTH_EMAIL_CONFIRMED' else null end,
        'PARTICIPANT_IDENTITY_EMAIL_COMPATIBILITY', target_tournament,
        contact.configuration_revision, actor, actor
      );
    end if;
    return jsonb_build_object('ok', true, 'created', false, 'linkId', existing.link_id, 'status', existing.status);
  end if;

  insert into participant_identity.user_player_links (
    auth_user_id, player_id, status, link_method, email_identity_hash, linked_at, linked_by
  ) values (
    user_id, target_player, 'ACTIVE', 'DIRECTOR_APPROVED_EMAIL',
    encode(extensions.digest(contact.email_normalized::text, 'sha256'::text), 'hex'), now(), actor
  ) returning link_id into inserted_id;

  insert into participant_identity.participant_auth_identifiers (
    player_id, auth_user_id, identifier_type, normalized_value_private, status,
    verified_at, verification_source, source_system, source_tournament_id,
    source_configuration_revision, created_by, updated_by
  ) values (
    target_player, user_id, 'EMAIL', contact.email_normalized, identifier_status,
    auth_user.email_confirmed_at,
    case when auth_user.email_confirmed_at is not null then 'SUPABASE_AUTH_EMAIL_CONFIRMED' else null end,
    'PARTICIPANT_IDENTITY_EMAIL_COMPATIBILITY', target_tournament,
    contact.configuration_revision, actor, actor
  );

  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, link_revision, safe_metadata
  ) values (
    'AUTH_USER_LINKED', target_tournament, user_id, target_player, actor, 1,
    jsonb_build_object('emailIdentifierCreated', true, 'emailValueStoredInAudit', false)
  );
  return jsonb_build_object('ok', true, 'created', true, 'linkId', inserted_id, 'status', 'ACTIVE');
end;
$$;

create or replace function public.read_participant_auth_phone_admin(
  target_tournament_id text,
  actor_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = participant_identity, scoring_authority, public, auth, pg_temp
as $$
declare target_tournament text := btrim(coalesce(target_tournament_id, ''));
declare result jsonb;
begin
  if target_tournament = '' or actor_auth_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'PHONE_ADMIN_CONTEXT_REQUIRED');
  end if;
  if not exists (
    select 1 from participant_identity.preview_director_entitlements entitlement
    where entitlement.auth_user_id = actor_auth_user_id
      and entitlement.tournament_id = target_tournament
      and entitlement.status = 'ACTIVE'
  ) then
    return jsonb_build_object('ok', false, 'code', 'PHONE_ADMIN_DIRECTOR_REQUIRED');
  end if;

  with roster as (
    select
      membership.player_id,
      player.display_name,
      membership.team_id,
      link.auth_user_id,
      link.status as link_status,
      email_identifier.identifier_id as email_identifier_id,
      email_identifier.status as email_status,
      current_phone.identifier_id as phone_identifier_id,
      current_phone.auth_user_id as phone_auth_user_id,
      current_phone.normalized_value_private as phone_e164,
      current_phone.status as phone_identifier_status,
      current_phone.verified_at as phone_verified_at,
      current_phone.updated_at as phone_updated_at,
      latest_phone.status as latest_phone_status,
      latest_phone.revoked_at as latest_phone_revoked_at,
      case
        when current_phone.identifier_id is null then 'NONE'
        when current_phone.auth_user_id <> link.auth_user_id then 'AUTH_USER_MISMATCH'
        when exists (
          select 1 from auth.users other_user
          where other_user.id <> link.auth_user_id
            and other_user.phone = current_phone.normalized_value_private
        ) then 'PHONE_CONFLICT'
        when exists (
          select 1 from auth.users other_user
          where other_user.id <> link.auth_user_id
            and other_user.phone_change = current_phone.normalized_value_private
        ) then 'PENDING_AUTH_PHONE_COLLISION'
        when exists (
          select 1 from auth.users expected_user
          where expected_user.id = link.auth_user_id
            and (
              (expected_user.phone is not null and expected_user.phone <> current_phone.normalized_value_private)
              or (expected_user.phone_change is not null and expected_user.phone_change <> current_phone.normalized_value_private)
            )
        ) then 'AUTH_USER_MISMATCH'
        when current_phone.status = 'VERIFIED' and not exists (
          select 1 from auth.users expected_user
          where expected_user.id = link.auth_user_id
            and expected_user.phone = current_phone.normalized_value_private
            and expected_user.phone_confirmed_at is not null
        ) then 'AUTH_USER_MISMATCH'
        else 'NONE'
      end as collision_status
    from scoring_authority.tournament_players membership
    join scoring_authority.players player on player.player_id = membership.player_id
    left join participant_identity.user_player_links link
      on link.player_id = membership.player_id
     and link.status in ('PENDING', 'ACTIVE', 'SUSPENDED')
    left join lateral (
      select identifier.*
      from participant_identity.participant_auth_identifiers identifier
      where identifier.player_id = membership.player_id
        and identifier.identifier_type = 'EMAIL'
        and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
      order by identifier.updated_at desc
      limit 1
    ) email_identifier on true
    left join lateral (
      select identifier.*
      from participant_identity.participant_auth_identifiers identifier
      where identifier.player_id = membership.player_id
        and identifier.identifier_type = 'PHONE'
        and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
      order by identifier.updated_at desc
      limit 1
    ) current_phone on true
    left join lateral (
      select identifier.*
      from participant_identity.participant_auth_identifiers identifier
      where identifier.player_id = membership.player_id
        and identifier.identifier_type = 'PHONE'
      order by identifier.updated_at desc
      limit 1
    ) latest_phone on true
    where membership.tournament_id = target_tournament
      and membership.participation_status = 'ACTIVE'
  ), presentation as (
    select roster.*,
      case
        when auth_user_id is null then 'AUTH_SETUP_REQUIRED'
        when collision_status <> 'NONE' then collision_status
        when phone_identifier_status = 'ELIGIBLE' then 'ELIGIBLE_NOT_VERIFIED'
        when phone_identifier_status = 'VERIFICATION_PENDING' then 'VERIFICATION_PENDING'
        when phone_identifier_status = 'VERIFIED' then 'VERIFIED'
        when latest_phone_status = 'REVOKED' then 'REVOKED'
        else 'NOT_CONFIGURED'
      end as mobile_status
    from roster
  )
  select jsonb_build_object(
    'ok', true,
    'tournamentId', target_tournament,
    'counts', jsonb_build_object(
      'eligiblePlayers', count(*),
      'authLinkedPlayers', count(*) filter (where auth_user_id is not null),
      'emailOwnership', count(*) filter (where email_identifier_id is not null),
      'emailBackfillMismatches', count(*) filter (where auth_user_id is not null and email_identifier_id is null),
      'phoneConfigured', count(*) filter (where phone_identifier_id is not null),
      'phoneEligibleUnverified', count(*) filter (where phone_identifier_status = 'ELIGIBLE'),
      'phoneVerificationPending', count(*) filter (where phone_identifier_status = 'VERIFICATION_PENDING'),
      'phoneVerified', count(*) filter (where phone_identifier_status = 'VERIFIED'),
      'phoneRevoked', count(*) filter (where phone_identifier_id is null and latest_phone_status = 'REVOKED'),
      'duplicatePhone', (
        select count(*) from (
          select normalized_value_private
          from participant_identity.participant_auth_identifiers
          where identifier_type = 'PHONE'
            and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
          group by normalized_value_private having count(*) > 1
        ) duplicate_values
      ),
      'invalidPhone', (
        select count(*)
        from participant_identity.participant_auth_identifiers
        where identifier_type = 'PHONE'
          and normalized_value_private !~ '^\+[1-9][0-9]{7,14}$'::text collate "C"
      ),
      'authUserMismatch', count(*) filter (where collision_status <> 'NONE')
    ),
    'players', coalesce(jsonb_agg(jsonb_build_object(
      'playerId', player_id,
      'displayName', display_name,
      'teamId', team_id,
      'authLinkStatus', coalesce(link_status, 'NOT_PROVISIONED'),
      'emailOwnershipStatus', coalesce(email_status, 'NOT_CONFIGURED'),
      'mobile', jsonb_build_object(
        'identifierId', phone_identifier_id,
        'lastFour', case when phone_e164 is null then null else right(phone_e164, 4) end,
        'status', mobile_status,
        'identifierStatus', phone_identifier_status,
        'collisionStatus', collision_status,
        'verifiedAt', phone_verified_at,
        'updatedAt', phone_updated_at,
        'revokedAt', latest_phone_revoked_at
      )
    ) order by display_name), '[]'::jsonb)
  ) into result
  from presentation;
  return result;
end;
$$;

create or replace function public.manage_participant_auth_phone(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, auth, pg_temp
as $$
declare action_value text := upper(btrim(coalesce(input->>'action', '')));
declare target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
declare target_player text := btrim(coalesce(input->>'player_id', ''));
declare target_phone text := btrim(coalesce(input->>'phone_e164', ''));
declare actor_auth_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare actor_player text;
declare actor_name text;
declare link_row participant_identity.user_player_links%rowtype;
declare current_phone participant_identity.participant_auth_identifiers%rowtype;
declare new_identifier_id uuid;
declare next_revision bigint;
begin
  if action_value not in ('ADD_PHONE', 'CHANGE_PHONE', 'REVOKE_PHONE')
    or target_tournament = '' or target_player = '' or actor_auth_user is null then
    return jsonb_build_object('ok', false, 'code', 'PHONE_MANAGEMENT_CONTEXT_INVALID');
  end if;
  select entitlement.director_player_id, coalesce(player.display_name, 'Tournament Director')
    into actor_player, actor_name
  from participant_identity.preview_director_entitlements entitlement
  left join scoring_authority.players player on player.player_id = entitlement.director_player_id
  where entitlement.auth_user_id = actor_auth_user
    and entitlement.tournament_id = target_tournament
    and entitlement.status = 'ACTIVE';
  if actor_player is null then
    return jsonb_build_object('ok', false, 'code', 'PHONE_ADMIN_DIRECTOR_REQUIRED');
  end if;
  if not exists (
    select 1 from scoring_authority.tournament_players membership
    where membership.tournament_id = target_tournament
      and membership.player_id = target_player
      and membership.participation_status = 'ACTIVE'
  ) then
    return jsonb_build_object('ok', false, 'code', 'PHONE_PLAYER_NOT_FOUND');
  end if;
  select * into link_row
  from participant_identity.user_player_links
  where player_id = target_player and status = 'ACTIVE'
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PHONE_AUTH_SETUP_REQUIRED');
  end if;

  select * into current_phone
  from participant_identity.participant_auth_identifiers
  where player_id = target_player and identifier_type = 'PHONE'
    and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
  for update;

  if action_value in ('ADD_PHONE', 'CHANGE_PHONE') then
    if target_phone !~ '^\+[1-9][0-9]{7,14}$'::text collate "C" then
      return jsonb_build_object('ok', false, 'code', 'PHONE_INVALID');
    end if;
    perform pg_advisory_xact_lock(hashtextextended('participant-auth-phone:' || target_phone, 0));
    if exists (
      select 1 from participant_identity.participant_auth_identifiers identifier
      where identifier.identifier_type = 'PHONE'
        and identifier.normalized_value_private = target_phone
        and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
        and identifier.player_id <> target_player
    ) then
      return jsonb_build_object('ok', false, 'code', 'PHONE_DUPLICATE');
    end if;
    if exists (
      select 1 from auth.users auth_user
      where auth_user.id <> link_row.auth_user_id
        and (auth_user.phone = target_phone or auth_user.phone_change = target_phone)
    ) then
      return jsonb_build_object('ok', false, 'code', 'PHONE_AUTH_COLLISION');
    end if;
    if exists (
      select 1 from auth.users expected_user
      where expected_user.id = link_row.auth_user_id
        and (
          (nullif(expected_user.phone, '') is not null and expected_user.phone <> target_phone)
          or (nullif(expected_user.phone_change, '') is not null and expected_user.phone_change <> target_phone)
        )
    ) then
      return jsonb_build_object('ok', false, 'code', 'PHONE_AUTH_USER_MISMATCH');
    end if;
  end if;

  if action_value = 'ADD_PHONE' then
    if current_phone.identifier_id is not null then
      return jsonb_build_object('ok', false, 'code', 'PHONE_ALREADY_CONFIGURED');
    end if;
    select coalesce(max(revision), 0) + 1 into next_revision
    from participant_identity.participant_auth_identifiers
    where player_id = target_player and identifier_type = 'PHONE';
    begin
      insert into participant_identity.participant_auth_identifiers (
        player_id, auth_user_id, identifier_type, normalized_value_private, status,
        revision, source_system, source_tournament_id, created_by, updated_by
      ) values (
        target_player, link_row.auth_user_id, 'PHONE', target_phone, 'ELIGIBLE',
        next_revision, 'DIRECTOR_PREVIEW', target_tournament, actor_player, actor_player
      ) returning identifier_id into new_identifier_id;
    exception when unique_violation then
      raise exception 'This mobile number is already assigned to another participant.' using errcode = 'P0001';
    end;
    insert into participant_identity.identity_audit_events (
      event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name,
      request_id, link_revision, safe_metadata
    ) values (
      'ADD_PHONE', target_tournament, link_row.auth_user_id, target_player,
      actor_player, actor_name, new_identifier_id::text, link_row.link_revision,
      jsonb_build_object('identifierId', new_identifier_id, 'status', 'ELIGIBLE',
        'verified', false, 'lastFour', right(target_phone, 4), 'rawPhoneLogged', false)
    );
    return jsonb_build_object('ok', true, 'action', 'ADD_PHONE', 'changed', true,
      'identifierId', new_identifier_id, 'status', 'ELIGIBLE',
      'lastFour', right(target_phone, 4), 'verified', false);
  end if;

  if action_value = 'CHANGE_PHONE' then
    if current_phone.identifier_id is null then
      return jsonb_build_object('ok', false, 'code', 'PHONE_NOT_CONFIGURED');
    end if;
    if current_phone.auth_user_id <> link_row.auth_user_id then
      return jsonb_build_object('ok', false, 'code', 'PHONE_AUTH_USER_MISMATCH');
    end if;
    if current_phone.normalized_value_private = target_phone then
      return jsonb_build_object('ok', true, 'action', 'CHANGE_PHONE', 'changed', false,
        'identifierId', current_phone.identifier_id, 'status', current_phone.status,
        'lastFour', right(target_phone, 4), 'verified', current_phone.status = 'VERIFIED');
    end if;
    update participant_identity.participant_auth_identifiers set
      status = 'REVOKED', revoked_at = now(), revoked_by = actor_player,
      revoke_reason = 'REPLACED_BY_DIRECTOR', revision = revision + 1,
      updated_by = actor_player, updated_at = now()
    where identifier_id = current_phone.identifier_id;
    next_revision := current_phone.revision + 2;
    begin
      insert into participant_identity.participant_auth_identifiers (
        player_id, auth_user_id, identifier_type, normalized_value_private, status,
        revision, source_system, source_tournament_id, created_by, updated_by
      ) values (
        target_player, link_row.auth_user_id, 'PHONE', target_phone, 'ELIGIBLE',
        next_revision, 'DIRECTOR_PREVIEW', target_tournament, actor_player, actor_player
      ) returning identifier_id into new_identifier_id;
    exception when unique_violation then
      raise exception 'This mobile number is already assigned to another participant.' using errcode = 'P0001';
    end;
    insert into participant_identity.identity_audit_events (
      event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name,
      request_id, link_revision, safe_metadata
    ) values (
      'CHANGE_PHONE', target_tournament, link_row.auth_user_id, target_player,
      actor_player, actor_name, new_identifier_id::text, link_row.link_revision,
      jsonb_build_object('previousIdentifierId', current_phone.identifier_id,
        'identifierId', new_identifier_id, 'previousStatus', current_phone.status,
        'status', 'ELIGIBLE', 'verified', false, 'lastFour', right(target_phone, 4),
        'rawPhoneLogged', false)
    );
    return jsonb_build_object('ok', true, 'action', 'CHANGE_PHONE', 'changed', true,
      'identifierId', new_identifier_id, 'status', 'ELIGIBLE',
      'lastFour', right(target_phone, 4), 'verified', false);
  end if;

  if current_phone.identifier_id is null then
    return jsonb_build_object('ok', true, 'action', 'REVOKE_PHONE', 'changed', false, 'status', 'REVOKED');
  end if;
  if current_phone.auth_user_id <> link_row.auth_user_id then
    return jsonb_build_object('ok', false, 'code', 'PHONE_AUTH_USER_MISMATCH');
  end if;
  update participant_identity.participant_auth_identifiers set
    status = 'REVOKED', revoked_at = now(), revoked_by = actor_player,
    revoke_reason = 'DIRECTOR_REVOKED', revision = revision + 1,
    updated_by = actor_player, updated_at = now()
  where identifier_id = current_phone.identifier_id;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name,
    request_id, link_revision, safe_metadata
  ) values (
    'REVOKE_PHONE', target_tournament, link_row.auth_user_id, target_player,
    actor_player, actor_name, current_phone.identifier_id::text, link_row.link_revision,
    jsonb_build_object('identifierId', current_phone.identifier_id,
      'previousStatus', current_phone.status, 'status', 'REVOKED',
      'verifiedAtPreserved', current_phone.verified_at is not null, 'rawPhoneLogged', false)
  );
  return jsonb_build_object('ok', true, 'action', 'REVOKE_PHONE', 'changed', true,
    'identifierId', current_phone.identifier_id, 'status', 'REVOKED');
end;
$$;

-- Aggregate-only readiness inspection used by migration/deployment verification.
-- It deliberately exposes no identifiers or private normalized values.
create or replace function public.inspect_participant_auth_identifier_foundation(
  target_tournament_id text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = participant_identity, scoring_authority, public, auth, pg_temp
as $$
declare target_tournament text := btrim(coalesce(target_tournament_id, ''));
declare result jsonb;
begin
  if target_tournament = '' then
    return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED');
  end if;

  with roster as (
    select membership.player_id, link.auth_user_id
    from scoring_authority.tournament_players membership
    left join participant_identity.user_player_links link
      on link.player_id = membership.player_id
     and link.status = 'ACTIVE'
    where membership.tournament_id = target_tournament
      and membership.participation_status = 'ACTIVE'
  ), readiness as (
    select
      roster.player_id,
      roster.auth_user_id,
      email_identifier.identifier_id as email_identifier_id,
      phone_identifier.identifier_id as phone_identifier_id,
      phone_identifier.status as phone_status,
      case
        when phone_identifier.identifier_id is null then false
        when phone_identifier.auth_user_id <> roster.auth_user_id then true
        when exists (
          select 1 from auth.users other_user
          where other_user.id <> roster.auth_user_id
            and (
              other_user.phone = phone_identifier.normalized_value_private
              or other_user.phone_change = phone_identifier.normalized_value_private
            )
        ) then true
        else false
      end as auth_user_mismatch
    from roster
    left join lateral (
      select identifier.identifier_id
      from participant_identity.participant_auth_identifiers identifier
      where identifier.player_id = roster.player_id
        and identifier.auth_user_id = roster.auth_user_id
        and identifier.identifier_type = 'EMAIL'
        and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
      limit 1
    ) email_identifier on true
    left join lateral (
      select identifier.*
      from participant_identity.participant_auth_identifiers identifier
      where identifier.player_id = roster.player_id
        and identifier.identifier_type = 'PHONE'
        and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
      order by identifier.updated_at desc
      limit 1
    ) phone_identifier on true
  )
  select jsonb_build_object(
    'ok', true,
    'tournamentId', target_tournament,
    'eligiblePlayers', count(*),
    'authLinkedPlayers', count(*) filter (where auth_user_id is not null),
    'emailOwnership', count(*) filter (where email_identifier_id is not null),
    'emailBackfillMismatches', count(*) filter (
      where auth_user_id is not null and email_identifier_id is null
    ),
    'phoneConfigured', count(*) filter (where phone_identifier_id is not null),
    'phoneEligibleUnverified', count(*) filter (where phone_status = 'ELIGIBLE'),
    'phoneVerificationPending', count(*) filter (where phone_status = 'VERIFICATION_PENDING'),
    'phoneVerified', count(*) filter (where phone_status = 'VERIFIED'),
    'phoneRevoked', (
      select count(*)
      from participant_identity.participant_auth_identifiers identifier
      join roster current_roster on current_roster.player_id = identifier.player_id
      where identifier.identifier_type = 'PHONE' and identifier.status = 'REVOKED'
    ),
    'duplicatePhone', (
      select count(*) from (
        select identifier.normalized_value_private
        from participant_identity.participant_auth_identifiers identifier
        where identifier.identifier_type = 'PHONE'
          and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
        group by identifier.normalized_value_private
        having count(*) > 1
      ) duplicates
    ),
    'invalidPhone', (
      select count(*)
      from participant_identity.participant_auth_identifiers identifier
      where identifier.identifier_type = 'PHONE'
        and identifier.normalized_value_private !~ '^\+[1-9][0-9]{7,14}$'::text collate "C"
    ),
    'authUserMismatch', count(*) filter (where auth_user_mismatch),
    'playerLinkParity', count(*) filter (
      where auth_user_id is not null and email_identifier_id is null
    ) = 0
  ) into result
  from readiness;
  return result;
end;
$$;

-- Server/service-only primitive for the later OTP boundary. It performs no SMS
-- or Auth mutation and never grants Player access by itself.
create or replace function public.read_participant_auth_phone_eligibility(target_phone_e164 text)
returns jsonb
language plpgsql
security definer
stable
set search_path = participant_identity, scoring_authority, public, auth, pg_temp
as $$
declare target_phone text := btrim(coalesce(target_phone_e164, ''));
declare identifier participant_identity.participant_auth_identifiers%rowtype;
declare link_row participant_identity.user_player_links%rowtype;
declare target_tournament text;
begin
  if target_phone !~ '^\+[1-9][0-9]{7,14}$'::text collate "C" then
    return jsonb_build_object('ok', true, 'eligible', false, 'code', 'PHONE_NOT_ELIGIBLE');
  end if;
  select * into identifier
  from participant_identity.participant_auth_identifiers
  where identifier_type = 'PHONE' and normalized_value_private = target_phone
    and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');
  if not found then return jsonb_build_object('ok', true, 'eligible', false, 'code', 'PHONE_NOT_ELIGIBLE'); end if;
  select * into link_row from participant_identity.user_player_links
  where auth_user_id = identifier.auth_user_id and player_id = identifier.player_id and status = 'ACTIVE';
  if not found then return jsonb_build_object('ok', true, 'eligible', false, 'code', 'PHONE_OWNERSHIP_INACTIVE'); end if;
  if exists (
    select 1 from auth.users auth_user
    where auth_user.id <> identifier.auth_user_id
      and (auth_user.phone = target_phone or auth_user.phone_change = target_phone)
  ) then
    return jsonb_build_object('ok', true, 'eligible', false, 'code', 'PHONE_AUTH_COLLISION');
  end if;
  target_tournament := participant_identity.resolve_approved_participant_tournament(identifier.auth_user_id);
  if target_tournament is null or not exists (
    select 1 from scoring_authority.tournament_players membership
    where membership.tournament_id = target_tournament
      and membership.player_id = identifier.player_id
      and membership.participation_status = 'ACTIVE'
  ) then
    return jsonb_build_object('ok', true, 'eligible', false, 'code', 'PHONE_TOURNAMENT_INELIGIBLE');
  end if;
  return jsonb_build_object('ok', true, 'eligible', true, 'code', 'PHONE_ELIGIBLE',
    'identifierId', identifier.identifier_id, 'authUserId', identifier.auth_user_id,
    'playerId', identifier.player_id, 'tournamentId', target_tournament,
    'status', identifier.status);
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.admin_link_auth_user_to_player(jsonb)',
    'public.read_participant_auth_phone_admin(text,uuid)',
    'public.manage_participant_auth_phone(jsonb)',
    'public.inspect_participant_auth_identifier_foundation(text)',
    'public.read_participant_auth_phone_eligibility(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
