-- STEP 2K.1 local source only. NOT AUTHORIZED FOR DEPLOYMENT.
-- No accounts, reviewer entitlements, or capability admissions are created.
begin;

create table participant_identity.review_access_v1 (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  tournament_id text not null references scoring_authority.tournaments(tournament_id),
  final_match_id text not null references scoring_authority.matches(match_id),
  active boolean not null default false,
  protected boolean not null default false,
  expires_at timestamptz not null,
  revision bigint not null default 1 check (revision > 0)
);

create table participant_identity.account_deletion_requests_v1 (
  request_id uuid primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  status text not null check (status in ('PENDING_ADMINISTRATIVE_HANDOFF',
    'PENDING_REVIEW_ACCESS_HANDOFF', 'READY', 'COMPLETED')),
  requested_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check ((status = 'COMPLETED' and completed_at is not null and auth_user_id is null)
    or (status <> 'COMPLETED' and completed_at is null and auth_user_id is not null))
);

alter table participant_identity.review_access_v1 enable row level security;
alter table participant_identity.account_deletion_requests_v1 enable row level security;
revoke all on participant_identity.review_access_v1,
  participant_identity.account_deletion_requests_v1 from public, anon, authenticated, service_role;

-- Caller holds the Auth row first, then these locks. This serializes protection
-- changes and concurrent deletion, including two reviewers/directors racing.
create function participant_identity.lock_deletion_governance_v1()
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
  lock table production_control.tournament_owner_capabilities_v1,
    production_control.director_entitlements,
    participant_identity.tournament_roles,
    participant_identity.user_player_links,
    participant_identity.review_access_v1 in share row exclusive mode;
end;
$$;

create function participant_identity.account_deletion_status_v1(target uuid)
returns text language plpgsql security definer set search_path = pg_catalog as $$
begin
  if exists (select 1 from production_control.tournament_owner_capabilities_v1
      where auth_user_id = target and status = 'ACTIVE')
    or exists (select 1 from production_control.director_entitlements
      where auth_user_id = target and status = 'ACTIVE' and role = 'OWNER') then
    return 'PENDING_ADMINISTRATIVE_HANDOFF';
  end if;
  if exists (
    select 1 from production_control.director_entitlements own
    where own.auth_user_id = target and own.status = 'ACTIVE' and own.role = 'DIRECTOR'
    and not exists (
      select 1 from production_control.director_entitlements other
      join auth.users u on u.id = other.auth_user_id
      join participant_identity.user_player_links l on l.auth_user_id = u.id
        and l.player_id = other.player_id and l.status = 'ACTIVE' and l.revoked_at is null
      join scoring_authority.tournament_players member on member.tournament_id = other.tournament_id
        and member.player_id = other.player_id and member.participation_status = 'ACTIVE'
      join participant_identity.tournament_roles role on role.auth_user_id = u.id
        and role.tournament_id = other.tournament_id and role.role = 'DIRECTOR'
        and role.role_active and role.revoked_at is null
      where other.tournament_id = own.tournament_id and other.auth_user_id <> target
        and other.status = 'ACTIVE' and other.role = 'DIRECTOR'
        and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
    )) then return 'PENDING_ADMINISTRATIVE_HANDOFF';
  end if;
  if exists (select 1 from participant_identity.review_access_v1 own
    where own.auth_user_id = target and own.active and own.protected
      and own.expires_at > clock_timestamp()
      and not exists (
        select 1 from participant_identity.review_access_v1 other
        join auth.users u on u.id = other.auth_user_id and u.email_confirmed_at is not null
        join scoring_authority.matches m on m.match_id = other.final_match_id
          and m.tournament_id = other.tournament_id and m.status = 'FINAL'
        where other.tournament_id = own.tournament_id and other.auth_user_id <> target
          and other.active and other.expires_at > clock_timestamp()
          and not exists (select 1 from participant_identity.user_player_links l where l.auth_user_id = u.id)
          and not exists (select 1 from production_control.director_entitlements d
            where d.auth_user_id = u.id and d.status = 'ACTIVE')
          and not exists (select 1 from participant_identity.account_deletion_requests_v1 req
            where req.auth_user_id = u.id and req.status = 'READY')
      )) then return 'PENDING_REVIEW_ACCESS_HANDOFF';
  end if;
  return 'READY';
end;
$$;

create function public.initiate_account_deletion_v1(target_auth_user_id uuid, operation_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare row_value participant_identity.account_deletion_requests_v1%rowtype;
declare next_status text;
begin
  perform production_control.assert_production_service_role();
  if target_auth_user_id is null or operation_id is null then
    raise exception using errcode = '22023', message = 'ACCOUNT_DELETION_INVALID_REQUEST';
  end if;
  perform 1 from auth.users where id = target_auth_user_id for update;
  if not found then raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_AUTH_REQUIRED'; end if;
  perform participant_identity.lock_deletion_governance_v1();
  if not exists (select 1 from participant_identity.user_player_links
      where auth_user_id = target_auth_user_id)
    and not exists (select 1 from participant_identity.review_access_v1
      where auth_user_id = target_auth_user_id) then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_CANONICAL_ACCOUNT_REQUIRED';
  end if;
  select * into row_value from participant_identity.account_deletion_requests_v1 where request_id = operation_id;
  if found and row_value.auth_user_id is distinct from target_auth_user_id then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_REQUEST_OWNER_MISMATCH';
  end if;
  next_status := participant_identity.account_deletion_status_v1(target_auth_user_id);
  insert into participant_identity.account_deletion_requests_v1(request_id, auth_user_id, status)
    values (operation_id, target_auth_user_id, next_status)
    on conflict (auth_user_id) do update set status = excluded.status, updated_at = clock_timestamp()
    returning * into row_value;
  return jsonb_build_object('requestId', row_value.request_id, 'status', row_value.status, 'completed', false);
end;
$$;

-- Only a server-side caller which already authenticated/initiated this exact
-- request can read its completion receipt. No client table access is granted.
create function public.read_account_deletion_receipt_v1(operation_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare row_value participant_identity.account_deletion_requests_v1%rowtype;
begin
  perform production_control.assert_production_service_role();
  select * into strict row_value from participant_identity.account_deletion_requests_v1 where request_id = operation_id;
  return jsonb_build_object('requestId', row_value.request_id, 'status', row_value.status,
    'completed', row_value.status = 'COMPLETED');
end;
$$;

-- Provider deletion is the commit boundary. Any cleanup/FK failure rolls back
-- the Auth deletion and receipt together; no completion can survive failure.
create function participant_identity.complete_requested_account_deletion_v1()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare request_value participant_identity.account_deletion_requests_v1%rowtype;
declare table_name text;
declare linked_players text[];
begin
  select * into request_value from participant_identity.account_deletion_requests_v1
    where auth_user_id = old.id for update;
  if not found then return old; end if;
  perform participant_identity.lock_deletion_governance_v1();
  if participant_identity.account_deletion_status_v1(old.id) <> 'READY' then
    raise exception using errcode = '55000', message = 'ACCOUNT_DELETION_PROTECTED';
  end if;
  update production_control.director_entitlements set status = 'REVOKED', revoked_at = clock_timestamp()
    where auth_user_id = old.id and status = 'ACTIVE';
  select array_agg(player_id) into linked_players from participant_identity.user_player_links where auth_user_id = old.id;
  -- Bounded account-owned records only. No scoring/tournament table is edited.
  foreach table_name in array array[
    'participant_phone_otp_attempts', 'participant_auth_client_diagnostics',
    'participant_auth_otp_attempts', 'participant_auth_rehearsals',
    'production_participant_enrollment_claims', 'production_auth_candidates',
    'participant_auth_identifiers', 'tournament_roles', 'user_player_links'
  ] loop
    if to_regclass('participant_identity.' || table_name) is not null then
      execute format('delete from participant_identity.%I where auth_user_id = $1', table_name) using old.id;
    end if;
  end loop;
  foreach table_name in array array['player_approved_phones_v1', 'player_login_preferences_v1'] loop
    if to_regclass('participant_identity.' || table_name) is not null then
      execute format('delete from participant_identity.%I where player_id = any($1)', table_name) using linked_players;
    end if;
  end loop;
  delete from participant_identity.participant_identity_contacts where player_id = any(linked_players);
  delete from participant_identity.review_access_v1 where auth_user_id = old.id;
  update participant_identity.account_deletion_requests_v1 set
    status = 'COMPLETED', auth_user_id = null, completed_at = clock_timestamp(), updated_at = clock_timestamp()
    where request_id = request_value.request_id;
  return old;
end;
$$;
revoke all on function participant_identity.complete_requested_account_deletion_v1() from public, anon, authenticated, service_role;
create trigger bagger_requested_account_deletion_v1 before delete on auth.users
  for each row execute function participant_identity.complete_requested_account_deletion_v1();

revoke all on function participant_identity.lock_deletion_governance_v1(),
  participant_identity.account_deletion_status_v1(uuid),
  public.initiate_account_deletion_v1(uuid,uuid),
  public.read_account_deletion_receipt_v1(uuid) from public, anon, authenticated, service_role;
grant execute on function public.initiate_account_deletion_v1(uuid,uuid),
  public.read_account_deletion_receipt_v1(uuid) to service_role;
commit;
