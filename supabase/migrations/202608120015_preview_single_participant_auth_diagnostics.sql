-- Forward-only refinements for the single-player Preview Auth rehearsal.

create table participant_identity.participant_auth_client_diagnostics (
  sample_id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  player_id text not null references scoring_authority.players (player_id) on delete restrict,
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  event_type text not null check (event_type in (
    'AUTH_PAGE_LOADED', 'SESSION_CHECK', 'OTP_REQUEST', 'OTP_VERIFICATION',
    'PWA_REOPEN', 'ROUTE_NAVIGATION', 'APP_BACKGROUND', 'APP_FOREGROUND'
  )),
  route_from text,
  route_to text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  device_class text not null default 'UNKNOWN' check (device_class in ('IPHONE', 'MOBILE', 'DESKTOP', 'UNKNOWN')),
  client_recorded_at timestamptz,
  received_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb
);

create index participant_auth_client_diagnostics_player_idx
  on participant_identity.participant_auth_client_diagnostics (player_id, received_at desc);
create index participant_auth_client_diagnostics_event_idx
  on participant_identity.participant_auth_client_diagnostics (event_type, received_at desc);
alter table participant_identity.participant_auth_client_diagnostics enable row level security;
revoke all on participant_identity.participant_auth_client_diagnostics from public, anon, authenticated;

create or replace function public.configure_single_participant_auth_rehearsal(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, auth, extensions, pg_temp
as $$
declare target text := btrim(coalesce(input->>'tournament_id', ''));
declare target_player text := btrim(coalesce(input->>'player_id', ''));
declare user_id uuid := nullif(input->>'auth_user_id', '')::uuid;
declare actor text := btrim(coalesce(input->>'configured_by', ''));
declare expected_fingerprint text := lower(btrim(coalesce(input->>'approved_fingerprint', '')));
declare preflight jsonb;
declare contact participant_identity.participant_identity_contacts%rowtype;
declare auth_email text;
declare current_rehearsal participant_identity.participant_auth_rehearsals%rowtype;
declare created_rehearsal boolean := false;
begin
  if target = '' or target_player = '' or user_id is null or actor = '' or expected_fingerprint = '' then
    raise exception 'Complete rehearsal configuration is required.';
  end if;
  preflight := public.read_single_participant_auth_rehearsal_preflight(target);
  if not coalesce((preflight->>'ready')::boolean, false) then raise exception 'Single-player Auth rehearsal preflight is not clean.'; end if;
  if preflight#>>'{candidate,playerId}' <> target_player or preflight->>'approvedFingerprint' <> expected_fingerprint then
    raise exception 'The approved single test identity changed before provisioning.';
  end if;
  select * into contact from participant_identity.participant_identity_contacts
    where tournament_id = target and player_id = target_player and identity_active;
  select lower(btrim(email)) into auth_email from auth.users where id = user_id;
  if auth_email is null or auth_email <> contact.email_normalized then raise exception 'Auth user email does not match the approved Player ID mapping.'; end if;
  if not exists (select 1 from participant_identity.user_player_links
    where auth_user_id = user_id and player_id = target_player and status = 'ACTIVE') then
    raise exception 'An active audited user-to-player link is required.';
  end if;
  if exists (select 1 from participant_identity.user_player_links l
    join participant_identity.participant_identity_contacts c on c.player_id = l.player_id and c.tournament_id = target
    where l.status in ('PENDING', 'ACTIVE', 'SUSPENDED') and c.player_id <> target_player) then
    raise exception 'Only the approved single test participant may be linked.';
  end if;
  select * into current_rehearsal from participant_identity.participant_auth_rehearsals where tournament_id = target for update;
  if found and (current_rehearsal.player_id <> target_player or current_rehearsal.auth_user_id <> user_id) then
    raise exception 'The rehearsal identity cannot be silently reassigned.';
  end if;
  created_rehearsal := not found;
  insert into participant_identity.participant_auth_rehearsals (
    tournament_id, player_id, auth_user_id, approved_fingerprint, status, shadow_enabled, configured_by
  ) values (target, target_player, user_id, expected_fingerprint, 'PREPARED', true, actor)
  on conflict (tournament_id) do update set
    approved_fingerprint = excluded.approved_fingerprint,
    status = case when participant_identity.participant_auth_rehearsals.status = 'REVOKED'
      then participant_identity.participant_auth_rehearsals.status else 'PREPARED' end,
    shadow_enabled = case when participant_identity.participant_auth_rehearsals.status = 'REVOKED'
      then false else true end,
    updated_at = now();
  if created_rehearsal then
    insert into participant_identity.identity_audit_events (
      event_type, tournament_id, auth_user_id, player_id, actor_name, link_revision, safe_metadata
    ) values (
      'SINGLE_PARTICIPANT_AUTH_PREPARED', target, user_id, target_player, actor, 1,
      jsonb_build_object('fingerprint', expected_fingerprint,
        'emailIdentityHash', encode(extensions.digest(contact.email_normalized::text, 'sha256'::text), 'hex'))
    );
  end if;
  return jsonb_build_object('ok', true, 'created', created_rehearsal, 'status', 'PREPARED',
    'playerId', target_player, 'shadowEnabled', true);
end;
$$;

create or replace function public.record_single_participant_auth_logout(target_auth_user_id uuid, target_tournament_id text)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, pg_temp
as $$
declare target_player text;
begin
  select r.player_id into target_player from participant_identity.participant_auth_rehearsals r
    where r.auth_user_id = target_auth_user_id and r.tournament_id = btrim(target_tournament_id);
  if target_player is null then return jsonb_build_object('ok', false, 'code', 'REHEARSAL_NOT_FOUND'); end if;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, safe_metadata
  ) values ('PARTICIPANT_AUTH_LOGOUT', btrim(target_tournament_id), target_auth_user_id,
    target_player, 'Participant Auth', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.record_single_participant_auth_client_diagnostics(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, pg_temp
as $$
declare user_id uuid := nullif(input->>'auth_user_id', '')::uuid;
declare rehearsal participant_identity.participant_auth_rehearsals%rowtype;
declare sample jsonb;
declare inserted integer := 0;
declare event_name text;
begin
  select * into rehearsal from participant_identity.participant_auth_rehearsals
    where auth_user_id = user_id and status = 'PREPARED' and shadow_enabled;
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTIVE_REHEARSAL_REQUIRED'); end if;
  if jsonb_array_length(coalesce(input->'samples', '[]'::jsonb)) > 50 then raise exception 'Diagnostics batch is too large.'; end if;
  for sample in select value from jsonb_array_elements(coalesce(input->'samples', '[]'::jsonb)) loop
    event_name := upper(btrim(coalesce(sample->>'event_type', '')));
    if event_name not in ('AUTH_PAGE_LOADED', 'SESSION_CHECK', 'OTP_REQUEST', 'OTP_VERIFICATION',
      'PWA_REOPEN', 'ROUTE_NAVIGATION', 'APP_BACKGROUND', 'APP_FOREGROUND') then continue; end if;
    insert into participant_identity.participant_auth_client_diagnostics (
      tournament_id, player_id, auth_user_id, event_type, route_from, route_to,
      duration_ms, device_class, client_recorded_at, safe_metadata
    ) values (
      rehearsal.tournament_id, rehearsal.player_id, user_id, event_name,
      nullif(left(btrim(coalesce(sample->>'route_from', '')), 160), ''),
      nullif(left(btrim(coalesce(sample->>'route_to', '')), 160), ''),
      case when (sample->>'duration_ms') ~ '^\d+$' then least((sample->>'duration_ms')::integer, 600000) else null end,
      case when upper(coalesce(sample->>'device_class', '')) in ('IPHONE', 'MOBILE', 'DESKTOP')
        then upper(sample->>'device_class') else 'UNKNOWN' end,
      case when coalesce(sample->>'recorded_at', '') <> '' then (sample->>'recorded_at')::timestamptz else null end,
      jsonb_build_object('navigationType', left(coalesce(sample->>'navigation_type', ''), 40))
    );
    inserted := inserted + 1;
  end loop;
  return jsonb_build_object('ok', true, 'inserted', inserted);
end;
$$;

revoke all on function public.configure_single_participant_auth_rehearsal(jsonb) from public, anon, authenticated;
revoke all on function public.record_single_participant_auth_logout(uuid,text) from public, anon, authenticated;
revoke all on function public.record_single_participant_auth_client_diagnostics(jsonb) from public, anon, authenticated;
grant execute on function public.configure_single_participant_auth_rehearsal(jsonb) to service_role;
grant execute on function public.record_single_participant_auth_logout(uuid,text) to service_role;
grant execute on function public.record_single_participant_auth_client_diagnostics(jsonb) to service_role;

notify pgrst, 'reload schema';
