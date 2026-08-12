-- Preview-only participant identity authority cutover support.
-- This preserves Player Passport as a rollback implementation while making
-- Supabase Auth the sole normal participant identity authority in Preview.

create table participant_identity.preview_impersonation_leases (
  lease_id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(tournament_id) on delete cascade,
  director_player_id text not null references scoring_authority.players(player_id) on delete restrict,
  target_player_id text not null references scoring_authority.players(player_id) on delete restrict,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by text,
  revoke_reason text,
  created_at timestamptz not null default now(),
  check (expires_at > issued_at)
);

create index participant_identity_preview_impersonation_active_idx
  on participant_identity.preview_impersonation_leases (tournament_id, expires_at)
  where revoked_at is null;

alter table participant_identity.preview_impersonation_leases enable row level security;
revoke all on participant_identity.preview_impersonation_leases from public, anon, authenticated;
grant all on participant_identity.preview_impersonation_leases to service_role;

create or replace function public.read_participant_identity_context_for_auth(target_auth_user_id uuid, target_tournament_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare link_row participant_identity.user_player_links%rowtype;
declare target_tournament text := nullif(btrim(coalesce(target_tournament_id, '')), '');
declare membership_status text;
declare context jsonb;
begin
  select * into link_row from participant_identity.user_player_links where auth_user_id = target_auth_user_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;
  if link_row.status = 'SUSPENDED' then return jsonb_build_object('ok', false, 'code', 'USER_PLAYER_LINK_SUSPENDED'); end if;
  if link_row.status = 'REVOKED' then return jsonb_build_object('ok', false, 'code', 'USER_PLAYER_LINK_REVOKED'); end if;
  if link_row.status <> 'ACTIVE' then return jsonb_build_object('ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;

  if target_tournament is null then
    select tp.tournament_id into target_tournament
    from scoring_authority.tournament_players tp
    join scoring_authority.tournaments t on t.tournament_id = tp.tournament_id
    where tp.player_id = link_row.player_id and tp.participation_status = 'ACTIVE'
    order by t.tournament_year desc limit 1;
  end if;
  if target_tournament is null then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_MEMBERSHIP_INACTIVE'); end if;

  select participation_status into membership_status
  from scoring_authority.tournament_players
  where tournament_id = target_tournament and player_id = link_row.player_id;
  if membership_status is null then return jsonb_build_object('ok', false, 'code', 'WRONG_TOURNAMENT'); end if;
  if membership_status <> 'ACTIVE' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_MEMBERSHIP_INACTIVE'); end if;

  context := public.read_participant_identity_context(target_tournament, link_row.player_id);
  if coalesce((context->>'ok')::boolean, false) then
    return jsonb_set(context, '{data,authUserId}', to_jsonb(target_auth_user_id), true);
  end if;
  return context;
end;
$$;

create or replace function public.begin_preview_identity_impersonation(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
declare director_id text := btrim(coalesce(input->>'director_player_id', ''));
declare target_id text := btrim(coalesce(input->>'target_player_id', ''));
declare duration_seconds integer := greatest(300, least(coalesce((input->>'lease_seconds')::integer, 3600), 14400));
declare new_lease uuid;
begin
  if target_tournament = '' or director_id = '' or target_id = '' then
    return jsonb_build_object('ok', false, 'code', 'IMPERSONATION_CONTEXT_REQUIRED');
  end if;
  if not exists (select 1 from scoring_authority.tournament_players
    where tournament_id = target_tournament and player_id = target_id and participation_status = 'ACTIVE') then
    return jsonb_build_object('ok', false, 'code', 'IMPERSONATION_TARGET_INACTIVE');
  end if;
  update participant_identity.preview_impersonation_leases
    set revoked_at = now(), revoked_by = director_id, revoke_reason = 'REPLACED'
    where tournament_id = target_tournament and director_player_id = director_id
      and revoked_at is null and expires_at > now();
  insert into participant_identity.preview_impersonation_leases (
    tournament_id, director_player_id, target_player_id, expires_at
  ) values (target_tournament, director_id, target_id, now() + make_interval(secs => duration_seconds))
  returning lease_id into new_lease;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, player_id, actor_id, actor_name, request_id, safe_metadata
  ) values (
    'PREVIEW_IMPERSONATION_STARTED', target_tournament, target_id, director_id,
    nullif(input->>'director_name', ''), new_lease::text,
    jsonb_build_object('lease_seconds', duration_seconds, 'expires_at', now() + make_interval(secs => duration_seconds))
  );
  return jsonb_build_object('ok', true, 'leaseId', new_lease, 'tournamentId', target_tournament,
    'directorPlayerId', director_id, 'targetPlayerId', target_id,
    'expiresAt', now() + make_interval(secs => duration_seconds));
end;
$$;

create or replace function public.verify_preview_identity_impersonation(
  target_lease_id uuid, target_tournament_id text, target_director_player_id text, target_player_id text
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
    or lease_row.target_player_id <> btrim(target_player_id) then
    return jsonb_build_object('ok', false, 'code', 'IMPERSONATION_LEASE_MISMATCH');
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

create or replace function public.end_preview_identity_impersonation(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare lease_row participant_identity.preview_impersonation_leases%rowtype;
declare actor text := btrim(coalesce(input->>'revoked_by', ''));
begin
  select * into lease_row from participant_identity.preview_impersonation_leases
    where lease_id = nullif(input->>'lease_id', '')::uuid for update;
  if not found then return jsonb_build_object('ok', true, 'idempotent', true); end if;
  if lease_row.revoked_at is null then
    update participant_identity.preview_impersonation_leases
      set revoked_at = now(), revoked_by = actor, revoke_reason = coalesce(nullif(input->>'reason', ''), 'ENDED')
      where lease_id = lease_row.lease_id;
    insert into participant_identity.identity_audit_events (
      event_type, tournament_id, player_id, actor_id, request_id, reason_code
    ) values (
      'PREVIEW_IMPERSONATION_ENDED', lease_row.tournament_id, lease_row.target_player_id,
      actor, lease_row.lease_id::text, coalesce(nullif(input->>'reason', ''), 'ENDED')
    );
  end if;
  return jsonb_build_object('ok', true, 'idempotent', lease_row.revoked_at is not null);
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.read_participant_identity_context_for_auth(uuid,text)',
    'public.begin_preview_identity_impersonation(jsonb)',
    'public.verify_preview_identity_impersonation(uuid,text,text,text)',
    'public.end_preview_identity_impersonation(jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
