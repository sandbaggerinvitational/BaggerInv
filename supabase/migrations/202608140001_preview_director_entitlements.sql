-- Preview-only, account-scoped Tournament Director entitlement.
-- Supabase Auth proves the account; the legacy Director Passport is used only
-- to bootstrap the first entitlement for that already-linked account.

create table participant_identity.preview_director_entitlements (
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  tournament_id text not null references scoring_authority.tournaments(tournament_id) on delete restrict,
  director_player_id text not null references scoring_authority.players(player_id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  entitlement_revision bigint not null default 1 check (entitlement_revision > 0),
  bootstrap_source text not null default 'DIRECTOR_PASSPORT' check (bootstrap_source in ('DIRECTOR_PASSPORT', 'CONTROLLED_MIGRATION')),
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_auth_user_id uuid references auth.users(id) on delete set null,
  revoke_reason text,
  primary key (auth_user_id, tournament_id),
  check (tournament_id = '2026'),
  check ((status = 'ACTIVE' and revoked_at is null) or (status = 'REVOKED' and revoked_at is not null))
);

create index preview_director_entitlements_active_idx
  on participant_identity.preview_director_entitlements (tournament_id, director_player_id)
  where status = 'ACTIVE';

create table participant_identity.preview_director_entitlement_events (
  event_id bigint generated always as identity primary key,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  tournament_id text not null,
  director_player_id text not null,
  event_type text not null check (event_type in ('LINKED', 'LINK_NOOP', 'REVOKED')),
  entitlement_revision bigint not null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  bootstrap_source text,
  reason_code text,
  occurred_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb
);

alter table participant_identity.preview_director_entitlements enable row level security;
alter table participant_identity.preview_director_entitlement_events enable row level security;
revoke all on participant_identity.preview_director_entitlements from public, anon, authenticated;
revoke all on participant_identity.preview_director_entitlement_events from public, anon, authenticated;
grant all on participant_identity.preview_director_entitlements to service_role;
grant all on participant_identity.preview_director_entitlement_events to service_role;

create or replace function public.read_preview_director_entitlement(
  target_auth_user_id uuid,
  target_tournament_id text
)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare entitlement participant_identity.preview_director_entitlements%rowtype;
begin
  if target_auth_user_id is null or btrim(coalesce(target_tournament_id, '')) <> '2026' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_DIRECTOR_SCOPE_INVALID');
  end if;
  select * into entitlement
  from participant_identity.preview_director_entitlements
  where auth_user_id = target_auth_user_id and tournament_id = '2026';
  if not found then
    return jsonb_build_object('ok', true, 'found', false, 'active', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'found', true,
    'active', entitlement.status = 'ACTIVE',
    'status', entitlement.status,
    'tournamentId', entitlement.tournament_id,
    'directorPlayerId', entitlement.director_player_id,
    'revision', entitlement.entitlement_revision,
    'linkedAt', entitlement.linked_at,
    'revokedAt', entitlement.revoked_at
  );
end;
$$;

create or replace function public.link_preview_director_entitlement(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
declare director_id text := btrim(coalesce(input->>'director_player_id', ''));
declare source text := upper(btrim(coalesce(input->>'bootstrap_source', 'DIRECTOR_PASSPORT')));
declare current participant_identity.preview_director_entitlements%rowtype;
declare next_revision bigint;
begin
  if target_user is null or target_tournament <> '2026' or director_id = '' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_DIRECTOR_LINK_CONTEXT_INVALID');
  end if;
  if source not in ('DIRECTOR_PASSPORT', 'CONTROLLED_MIGRATION') then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_DIRECTOR_BOOTSTRAP_INVALID');
  end if;
  if not exists (
    select 1 from participant_identity.user_player_links
    where auth_user_id = target_user and player_id = director_id and status = 'ACTIVE'
  ) then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_DIRECTOR_ACCOUNT_MISMATCH');
  end if;
  if not exists (
    select 1 from scoring_authority.tournament_players
    where tournament_id = '2026' and player_id = director_id and participation_status = 'ACTIVE'
  ) then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_DIRECTOR_MEMBERSHIP_INACTIVE');
  end if;

  select * into current from participant_identity.preview_director_entitlements
  where auth_user_id = target_user and tournament_id = '2026' for update;
  if found and current.status = 'ACTIVE' then
    if current.director_player_id <> director_id then
      return jsonb_build_object('ok', false, 'code', 'PREVIEW_DIRECTOR_ACCOUNT_MISMATCH');
    end if;
    insert into participant_identity.preview_director_entitlement_events (
      auth_user_id, tournament_id, director_player_id, event_type,
      entitlement_revision, actor_auth_user_id, bootstrap_source
    ) values (target_user, '2026', director_id, 'LINK_NOOP', current.entitlement_revision, target_user, source);
    return jsonb_build_object('ok', true, 'active', true, 'changed', false,
      'tournamentId', '2026', 'directorPlayerId', director_id,
      'revision', current.entitlement_revision, 'linkedAt', current.linked_at);
  end if;

  next_revision := coalesce(current.entitlement_revision, 0) + 1;
  insert into participant_identity.preview_director_entitlements (
    auth_user_id, tournament_id, director_player_id, status, entitlement_revision,
    bootstrap_source, linked_at, revoked_at, revoked_by_auth_user_id, revoke_reason
  ) values (
    target_user, '2026', director_id, 'ACTIVE', next_revision,
    source, now(), null, null, null
  ) on conflict (auth_user_id, tournament_id) do update set
    director_player_id = excluded.director_player_id,
    status = 'ACTIVE',
    entitlement_revision = excluded.entitlement_revision,
    bootstrap_source = excluded.bootstrap_source,
    linked_at = now(),
    updated_at = now(),
    revoked_at = null,
    revoked_by_auth_user_id = null,
    revoke_reason = null;
  insert into participant_identity.preview_director_entitlement_events (
    auth_user_id, tournament_id, director_player_id, event_type,
    entitlement_revision, actor_auth_user_id, bootstrap_source
  ) values (target_user, '2026', director_id, 'LINKED', next_revision, target_user, source);
  return jsonb_build_object('ok', true, 'active', true, 'changed', true,
    'tournamentId', '2026', 'directorPlayerId', director_id,
    'revision', next_revision, 'linkedAt', now());
end;
$$;

create or replace function public.revoke_preview_director_entitlement(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare actor_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare reason text := btrim(coalesce(input->>'reason', 'DIRECTOR_REVOKED'));
declare current participant_identity.preview_director_entitlements%rowtype;
declare next_revision bigint;
begin
  select * into current from participant_identity.preview_director_entitlements
  where auth_user_id = target_user and tournament_id = '2026' for update;
  if not found then return jsonb_build_object('ok', true, 'changed', false, 'active', false); end if;
  if current.status = 'REVOKED' then
    return jsonb_build_object('ok', true, 'changed', false, 'active', false,
      'revision', current.entitlement_revision, 'revokedAt', current.revoked_at);
  end if;
  if actor_user is null or actor_user <> target_user then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_DIRECTOR_REVOKE_UNAUTHORIZED');
  end if;
  next_revision := current.entitlement_revision + 1;
  update participant_identity.preview_director_entitlements set
    status = 'REVOKED', entitlement_revision = next_revision, updated_at = now(),
    revoked_at = now(), revoked_by_auth_user_id = actor_user, revoke_reason = reason
  where auth_user_id = target_user and tournament_id = '2026';
  update participant_identity.preview_impersonation_leases set
    revoked_at = now(), revoked_by = current.director_player_id, revoke_reason = 'DIRECTOR_ENTITLEMENT_REVOKED'
  where tournament_id = '2026' and director_player_id = current.director_player_id
    and revoked_at is null and expires_at > now();
  insert into participant_identity.preview_director_entitlement_events (
    auth_user_id, tournament_id, director_player_id, event_type,
    entitlement_revision, actor_auth_user_id, reason_code
  ) values (target_user, '2026', current.director_player_id, 'REVOKED', next_revision, actor_user, reason);
  return jsonb_build_object('ok', true, 'changed', true, 'active', false,
    'revision', next_revision, 'revokedAt', now());
end;
$$;

alter table participant_identity.preview_impersonation_leases
  add column director_auth_user_id uuid references auth.users(id) on delete restrict;

create or replace function public.begin_preview_identity_impersonation(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
declare director_id text := btrim(coalesce(input->>'director_player_id', ''));
declare director_user uuid := nullif(input->>'director_auth_user_id', '')::uuid;
declare target_id text := btrim(coalesce(input->>'target_player_id', ''));
declare duration_seconds integer := greatest(300, least(coalesce((input->>'lease_seconds')::integer, 3600), 14400));
declare new_lease uuid;
begin
  if target_tournament <> '2026' or director_id = '' or director_user is null or target_id = '' then
    return jsonb_build_object('ok', false, 'code', 'IMPERSONATION_CONTEXT_REQUIRED');
  end if;
  if not exists (select 1 from participant_identity.preview_director_entitlements
    where auth_user_id = director_user and tournament_id = '2026'
      and director_player_id = director_id and status = 'ACTIVE') then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_ENTITLEMENT_REQUIRED');
  end if;
  if not exists (select 1 from scoring_authority.tournament_players
    where tournament_id = target_tournament and player_id = target_id and participation_status = 'ACTIVE') then
    return jsonb_build_object('ok', false, 'code', 'IMPERSONATION_TARGET_INACTIVE');
  end if;
  update participant_identity.preview_impersonation_leases
    set revoked_at = now(), revoked_by = director_id, revoke_reason = 'REPLACED'
    where tournament_id = target_tournament and director_auth_user_id = director_user
      and revoked_at is null and expires_at > now();
  insert into participant_identity.preview_impersonation_leases (
    tournament_id, director_player_id, director_auth_user_id, target_player_id, expires_at
  ) values (target_tournament, director_id, director_user, target_id, now() + make_interval(secs => duration_seconds))
  returning lease_id into new_lease;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name, request_id, safe_metadata
  ) values (
    'PREVIEW_IMPERSONATION_STARTED', target_tournament, director_user, target_id, director_id,
    nullif(input->>'director_name', ''), new_lease::text,
    jsonb_build_object('lease_seconds', duration_seconds, 'expires_at', now() + make_interval(secs => duration_seconds))
  );
  return jsonb_build_object('ok', true, 'leaseId', new_lease, 'tournamentId', target_tournament,
    'directorPlayerId', director_id, 'targetPlayerId', target_id,
    'expiresAt', now() + make_interval(secs => duration_seconds));
end;
$$;

drop function if exists public.verify_preview_identity_impersonation(uuid,text,text,text);
create function public.verify_preview_identity_impersonation(
  target_lease_id uuid,
  target_tournament_id text,
  target_director_player_id text,
  target_player_id text,
  target_director_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare lease_row participant_identity.preview_impersonation_leases%rowtype;
declare context jsonb;
begin
  select * into lease_row from participant_identity.preview_impersonation_leases where lease_id = target_lease_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'IMPERSONATION_LEASE_NOT_FOUND'); end if;
  if lease_row.revoked_at is not null then return jsonb_build_object('ok', false, 'code', 'IMPERSONATION_LEASE_REVOKED'); end if;
  if lease_row.expires_at <= now() then return jsonb_build_object('ok', false, 'code', 'IMPERSONATION_LEASE_EXPIRED'); end if;
  if lease_row.tournament_id <> btrim(target_tournament_id)
    or lease_row.director_player_id <> btrim(target_director_player_id)
    or lease_row.target_player_id <> btrim(target_player_id)
    or lease_row.director_auth_user_id is null
    or lease_row.director_auth_user_id <> target_director_auth_user_id then
    return jsonb_build_object('ok', false, 'code', 'IMPERSONATION_LEASE_MISMATCH');
  end if;
  if not exists (select 1 from participant_identity.preview_director_entitlements
    where auth_user_id = target_director_auth_user_id and tournament_id = '2026'
      and director_player_id = target_director_player_id and status = 'ACTIVE') then
    return jsonb_build_object('ok', false, 'code', 'DIRECTOR_ENTITLEMENT_REQUIRED');
  end if;
  context := public.read_participant_identity_context(lease_row.tournament_id, lease_row.target_player_id);
  if not coalesce((context->>'ok')::boolean, false) or not coalesce((context#>>'{data,membership,active}')::boolean, false) then
    return jsonb_build_object('ok', false, 'code', 'IMPERSONATION_TARGET_INACTIVE');
  end if;
  return jsonb_build_object('ok', true, 'leaseId', lease_row.lease_id, 'expiresAt', lease_row.expires_at,
    'directorPlayerId', lease_row.director_player_id, 'targetPlayerId', lease_row.target_player_id,
    'context', context->'data');
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.read_preview_director_entitlement(uuid,text)',
    'public.link_preview_director_entitlement(jsonb)',
    'public.revoke_preview_director_entitlement(jsonb)',
    'public.begin_preview_identity_impersonation(jsonb)',
    'public.verify_preview_identity_impersonation(uuid,text,text,text,uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
