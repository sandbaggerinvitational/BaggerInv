-- Step 8B.1B: make Participant Identity mobile ownership and its Director
-- read model use the same Auth-user invariant.
--
-- This migration does not update auth.users phone fields, enable phone Auth,
-- send SMS, or change participant email authentication. It fixes the Preview
-- Director read model's treatment of Supabase's blank phone_change sentinel and
-- adds a database guard for all future current PHONE identifiers.

create or replace function participant_identity.enforce_current_phone_auth_link()
returns trigger
language plpgsql
security definer
set search_path = participant_identity, public, auth, pg_temp
as $$
declare canonical_auth_user_id uuid;
begin
  if new.identifier_type <> 'PHONE'
     or new.status not in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED') then
    return new;
  end if;

  select link.auth_user_id into canonical_auth_user_id
  from participant_identity.user_player_links link
  where link.player_id = new.player_id
    and link.status = 'ACTIVE'
  for key share;

  if canonical_auth_user_id is null then
    raise exception 'Current mobile ownership requires one active Player Passport Auth link.'
      using errcode = 'P0001';
  end if;

  if new.auth_user_id <> canonical_auth_user_id then
    raise exception 'Current mobile ownership must use the active Player Passport Auth user.'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from participant_identity.participant_auth_identifiers email_identifier
    where email_identifier.player_id = new.player_id
      and email_identifier.auth_user_id = canonical_auth_user_id
      and email_identifier.identifier_type = 'EMAIL'
      and email_identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
  ) then
    raise exception 'Current mobile ownership requires matching email ownership for the active Auth user.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function participant_identity.enforce_current_phone_auth_link() from public, anon, authenticated;

drop trigger if exists participant_auth_phone_link_invariant
  on participant_identity.participant_auth_identifiers;

create trigger participant_auth_phone_link_invariant
before insert or update of player_id, auth_user_id, identifier_type, status
on participant_identity.participant_auth_identifiers
for each row
execute function participant_identity.enforce_current_phone_auth_link();

-- Existing data must already satisfy the invariant before the corrected read
-- model can be installed. A mismatch aborts the migration; it is never hidden.
do $$
declare mismatch_count integer;
begin
  select count(*) into mismatch_count
  from participant_identity.participant_auth_identifiers phone_identifier
  left join participant_identity.user_player_links link
    on link.player_id = phone_identifier.player_id
   and link.status = 'ACTIVE'
  left join participant_identity.participant_auth_identifiers email_identifier
    on email_identifier.player_id = phone_identifier.player_id
   and email_identifier.auth_user_id = link.auth_user_id
   and email_identifier.identifier_type = 'EMAIL'
   and email_identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
  where phone_identifier.identifier_type = 'PHONE'
    and phone_identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
    and (
      link.auth_user_id is null
      or phone_identifier.auth_user_id <> link.auth_user_id
      or email_identifier.identifier_id is null
    );

  if mismatch_count <> 0 then
    raise exception 'Participant Auth mobile ownership has % active Auth-link mismatch(es).', mismatch_count;
  end if;
end $$;

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
      email_identifier.auth_user_id as email_auth_user_id,
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
        when link.auth_user_id is null then 'AUTH_USER_MISMATCH'
        when email_identifier.identifier_id is null
          or email_identifier.auth_user_id <> link.auth_user_id then 'AUTH_USER_MISMATCH'
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
              (nullif(btrim(coalesce(expected_user.phone, '')), '') is not null
                and expected_user.phone <> current_phone.normalized_value_private)
              or (nullif(btrim(coalesce(expected_user.phone_change, '')), '') is not null
                and expected_user.phone_change <> current_phone.normalized_value_private)
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
      'emailBackfillMismatches', count(*) filter (
        where auth_user_id is not null
          and (email_identifier_id is null or email_auth_user_id <> auth_user_id)
      ),
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

-- Privacy-safe deployment diagnostic: no raw phone, email, or Auth UUID is
-- returned. The opaque Auth labels are derived only from equality with the
-- canonical active link and are not reusable identity values.
create or replace function public.inspect_participant_auth_phone_link_alignment(
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

  with phone_rows as (
    select
      phone_identifier.player_id,
      phone_identifier.status as phone_status,
      link.auth_user_id as link_auth_user_id,
      email_identifier.auth_user_id as email_auth_user_id,
      phone_identifier.auth_user_id as phone_auth_user_id,
      auth_user.phone as auth_phone,
      auth_user.phone_change as auth_phone_change,
      phone_identifier.normalized_value_private as phone_e164,
      exists (
        select 1 from auth.users other_user
        where other_user.id <> link.auth_user_id
          and (
            other_user.phone = phone_identifier.normalized_value_private
            or other_user.phone_change = phone_identifier.normalized_value_private
          )
      ) as other_auth_collision
    from participant_identity.participant_auth_identifiers phone_identifier
    join scoring_authority.tournament_players membership
      on membership.tournament_id = target_tournament
     and membership.player_id = phone_identifier.player_id
     and membership.participation_status = 'ACTIVE'
    left join participant_identity.user_player_links link
      on link.player_id = phone_identifier.player_id
     and link.status = 'ACTIVE'
    left join participant_identity.participant_auth_identifiers email_identifier
      on email_identifier.player_id = phone_identifier.player_id
     and email_identifier.identifier_type = 'EMAIL'
     and email_identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
    left join auth.users auth_user on auth_user.id = link.auth_user_id
    where phone_identifier.identifier_type = 'PHONE'
      and phone_identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
  )
  select jsonb_build_object(
    'ok', true,
    'configuredPhoneCount', count(*),
    'mismatchCount', count(*) filter (
      where link_auth_user_id is null
        or email_auth_user_id is distinct from link_auth_user_id
        or phone_auth_user_id is distinct from link_auth_user_id
    ),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'playerId', player_id,
      'phoneStatus', phone_status,
      'playerIdMatch', link_auth_user_id is not null,
      'linkAuthLabel', case when link_auth_user_id is null then 'NONE' else 'AUTH-UID-A' end,
      'emailAuthLabel', case
        when email_auth_user_id is null then 'NONE'
        when email_auth_user_id = link_auth_user_id then 'AUTH-UID-A'
        else 'AUTH-UID-OTHER'
      end,
      'phoneAuthLabel', case
        when phone_auth_user_id is null then 'NONE'
        when phone_auth_user_id = link_auth_user_id then 'AUTH-UID-A'
        else 'AUTH-UID-OTHER'
      end,
      'emailAuthUserMatch', email_auth_user_id = link_auth_user_id,
      'phoneAuthUserMatch', phone_auth_user_id = link_auth_user_id,
      'otherAuthUserCollision', other_auth_collision,
      'expectedAuthPhoneState', case
        when nullif(btrim(coalesce(auth_phone, '')), '') is null then 'UNSET'
        when auth_phone = phone_e164 then 'MATCH'
        else 'CONFLICT'
      end,
      'expectedAuthPhoneChangeState', case
        when nullif(btrim(coalesce(auth_phone_change, '')), '') is null then 'UNSET'
        when auth_phone_change = phone_e164 then 'MATCH'
        else 'CONFLICT'
      end
    ) order by player_id), '[]'::jsonb)
  ) into result
  from phone_rows;
  return result;
end;
$$;

revoke all on function public.inspect_participant_auth_phone_link_alignment(text)
  from public, anon, authenticated;
grant execute on function public.inspect_participant_auth_phone_link_alignment(text)
  to service_role;

notify pgrst, 'reload schema';
