-- Phase A single-participant Auth rehearsal.
-- Preview-only application gates remain authoritative. This migration creates
-- no Auth users and sends no email.

create table participant_identity.participant_auth_rehearsals (
  tournament_id text primary key references scoring_authority.tournaments (tournament_id) on delete cascade,
  player_id text not null,
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  approved_fingerprint text not null check (approved_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('PREPARED', 'SUSPENDED', 'REVOKED')),
  shadow_enabled boolean not null default true,
  rehearsal_revision bigint not null default 1 check (rehearsal_revision > 0),
  configured_at timestamptz not null default now(),
  configured_by text not null,
  suspended_at timestamptz,
  suspended_by text,
  suspension_reason text,
  updated_at timestamptz not null default now(),
  foreign key (tournament_id, player_id)
    references participant_identity.participant_identity_contacts (tournament_id, player_id),
  unique (auth_user_id),
  unique (player_id)
);

create table participant_identity.participant_auth_otp_attempts (
  request_id uuid primary key default gen_random_uuid(),
  tournament_id text references scoring_authority.tournaments (tournament_id) on delete cascade,
  player_id text references scoring_authority.players (player_id) on delete restrict,
  auth_user_id uuid references auth.users (id) on delete restrict,
  email_identity_hash text not null check (email_identity_hash ~ '^[0-9a-f]{64}$'),
  client_request_hash text not null check (client_request_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('AUTHORIZED', 'REJECTED', 'SENT', 'DELIVERY_FAILED', 'VERIFIED', 'VERIFICATION_FAILED')),
  safe_reason text,
  request_duration_ms integer check (request_duration_ms is null or request_duration_ms >= 0),
  verification_duration_ms integer check (verification_duration_ms is null or verification_duration_ms >= 0),
  requested_at timestamptz not null default now(),
  sent_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create index participant_auth_otp_player_requested_idx
  on participant_identity.participant_auth_otp_attempts (player_id, requested_at desc);
create index participant_auth_otp_client_requested_idx
  on participant_identity.participant_auth_otp_attempts (client_request_hash, requested_at desc);
create index participant_auth_otp_status_idx
  on participant_identity.participant_auth_otp_attempts (status, requested_at desc);

alter table participant_identity.participant_auth_rehearsals enable row level security;
alter table participant_identity.participant_auth_otp_attempts enable row level security;
revoke all on participant_identity.participant_auth_rehearsals from public, anon, authenticated;
revoke all on participant_identity.participant_auth_otp_attempts from public, anon, authenticated;
revoke all on all sequences in schema participant_identity from public, anon, authenticated;

create or replace function public.read_single_participant_auth_rehearsal_preflight(target_tournament_id text)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, auth, extensions, pg_temp
as $$
declare target text := btrim(coalesce(target_tournament_id, ''));
declare approved participant_identity.identity_config_import_runs%rowtype;
declare context_fingerprint text;
declare active_count integer;
declare real_count integer;
declare dummy_count integer;
declare candidate record;
declare rehearsal record;
declare participant_auth_count integer;
declare dummy_auth_count integer;
declare participant_link_count integer;
declare dummy_link_count integer;
begin
  if target = '' then raise exception 'Tournament identity is required.'; end if;
  select * into approved from participant_identity.identity_config_import_runs
    where tournament_id = target order by requested_at desc limit 1;
  select configuration_fingerprint into context_fingerprint
    from participant_identity.identity_context_revisions where tournament_id = target;

  select count(*),
    count(*) filter (where split_part(email_normalized, '@', 2) !~* '(^|\.)(example\.(com|net|org)|invalid|test|localhost)$'),
    count(*) filter (where split_part(email_normalized, '@', 2) ~* '(^|\.)(example\.(com|net|org)|invalid|test|localhost)$')
  into active_count, real_count, dummy_count
  from participant_identity.participant_identity_contacts
  where tournament_id = target and identity_active;

  select c.player_id, p.display_name, c.email, c.email_normalized, c.configuration_revision
  into candidate
  from participant_identity.participant_identity_contacts c
  join scoring_authority.players p on p.player_id = c.player_id
  where c.tournament_id = target and c.identity_active
    and split_part(c.email_normalized, '@', 2) !~* '(^|\.)(example\.(com|net|org)|invalid|test|localhost)$'
  order by c.player_id limit 1;

  select * into rehearsal from participant_identity.participant_auth_rehearsals where tournament_id = target;
  select count(*) into participant_auth_count from auth.users u
    join participant_identity.participant_identity_contacts c on c.email_normalized = lower(btrim(u.email))
    where c.tournament_id = target;
  select count(*) into dummy_auth_count from auth.users u
    join participant_identity.participant_identity_contacts c on c.email_normalized = lower(btrim(u.email))
    where c.tournament_id = target
      and split_part(c.email_normalized, '@', 2) ~* '(^|\.)(example\.(com|net|org)|invalid|test|localhost)$';
  select count(*) into participant_link_count from participant_identity.user_player_links l
    join scoring_authority.tournament_players tp on tp.player_id = l.player_id and tp.tournament_id = target
    where l.status in ('PENDING', 'ACTIVE', 'SUSPENDED');
  select count(*) into dummy_link_count from participant_identity.user_player_links l
    join participant_identity.participant_identity_contacts c on c.player_id = l.player_id and c.tournament_id = target
    where l.status in ('PENDING', 'ACTIVE', 'SUSPENDED')
      and split_part(c.email_normalized, '@', 2) ~* '(^|\.)(example\.(com|net|org)|invalid|test|localhost)$';

  return jsonb_build_object(
    'ok', true,
    'tournamentId', target,
    'approved', approved.status = 'APPROVED' and approved.source_fingerprint = context_fingerprint,
    'approvedFingerprint', approved.source_fingerprint,
    'configurationRevision', approved.configuration_revision,
    'activePlayers', active_count,
    'realIdentityCount', real_count,
    'dummyIdentityCount', dummy_count,
    'candidate', case when candidate.player_id is null then null else jsonb_build_object(
      'playerId', candidate.player_id, 'displayName', candidate.display_name,
      'email', candidate.email, 'emailNormalized', candidate.email_normalized,
      'configurationRevision', candidate.configuration_revision) end,
    'participantAuthUsers', participant_auth_count,
    'dummyAuthUsers', dummy_auth_count,
    'participantLinks', participant_link_count,
    'dummyLinks', dummy_link_count,
    'rehearsal', case when rehearsal.tournament_id is null then null else jsonb_build_object(
      'playerId', rehearsal.player_id, 'authUserId', rehearsal.auth_user_id,
      'status', rehearsal.status, 'shadowEnabled', rehearsal.shadow_enabled,
      'rehearsalRevision', rehearsal.rehearsal_revision,
      'configuredAt', rehearsal.configured_at, 'configuredBy', rehearsal.configured_by) end,
    'ready', approved.status = 'APPROVED' and approved.source_fingerprint = context_fingerprint
      and active_count = 24 and real_count = 1 and dummy_count = 23
      and dummy_auth_count = 0 and dummy_link_count = 0
  );
end;
$$;

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
  insert into participant_identity.participant_auth_rehearsals (
    tournament_id, player_id, auth_user_id, approved_fingerprint, status,
    shadow_enabled, configured_by
  ) values (target, target_player, user_id, expected_fingerprint, 'PREPARED', true, actor)
  on conflict (tournament_id) do update set
    approved_fingerprint = excluded.approved_fingerprint,
    status = case when participant_identity.participant_auth_rehearsals.status = 'REVOKED'
      then participant_identity.participant_auth_rehearsals.status else 'PREPARED' end,
    shadow_enabled = case when participant_identity.participant_auth_rehearsals.status = 'REVOKED'
      then false else true end,
    updated_at = now();

  if not found then null; end if;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, link_revision, safe_metadata
  ) values (
    'SINGLE_PARTICIPANT_AUTH_PREPARED', target, user_id, target_player, actor, 1,
    jsonb_build_object('fingerprint', expected_fingerprint, 'emailIdentityHash', encode(extensions.digest(contact.email_normalized::text, 'sha256'::text), 'hex'))
  );
  return jsonb_build_object('ok', true, 'status', 'PREPARED', 'playerId', target_player, 'shadowEnabled', true);
end;
$$;

create or replace function public.authorize_single_participant_otp_request(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, auth, extensions, pg_temp
as $$
declare normalized text := lower(btrim(coalesce(input->>'email', '')));
declare client_hash text := lower(btrim(coalesce(input->>'client_request_hash', '')));
declare email_hash text := encode(extensions.digest(normalized::text, 'sha256'::text), 'hex');
declare rehearsal participant_identity.participant_auth_rehearsals%rowtype;
declare contact participant_identity.participant_identity_contacts%rowtype;
declare request uuid := gen_random_uuid();
declare allowed boolean := false;
declare reason text := 'NOT_ELIGIBLE';
declare recent_player integer := 0;
declare recent_client integer := 0;
begin
  if client_hash !~ '^[0-9a-f]{64}$' then raise exception 'A hashed request identity is required.'; end if;
  select r.* into rehearsal from participant_identity.participant_auth_rehearsals r
    join participant_identity.participant_identity_contacts c
      on c.tournament_id = r.tournament_id and c.player_id = r.player_id
    where r.status = 'PREPARED' and r.shadow_enabled and c.identity_active and c.email_normalized = normalized
    for update of r;
  if found then
    select * into contact from participant_identity.participant_identity_contacts
      where tournament_id = rehearsal.tournament_id and player_id = rehearsal.player_id;
    select count(*) into recent_player from participant_identity.participant_auth_otp_attempts
      where player_id = rehearsal.player_id and status in ('AUTHORIZED', 'SENT', 'VERIFIED')
        and requested_at > now() - interval '15 minutes';
    select count(*) into recent_client from participant_identity.participant_auth_otp_attempts
      where client_request_hash = client_hash and requested_at > now() - interval '15 minutes';
    if exists (select 1 from participant_identity.participant_auth_otp_attempts
      where player_id = rehearsal.player_id and status in ('AUTHORIZED', 'SENT')
        and requested_at > now() - interval '60 seconds') then reason := 'COOLDOWN';
    elsif recent_player >= 3 or recent_client >= 5 then reason := 'RATE_LIMIT';
    else allowed := true; reason := 'APPROVED'; end if;
  end if;
  insert into participant_identity.participant_auth_otp_attempts (
    request_id, tournament_id, player_id, auth_user_id, email_identity_hash,
    client_request_hash, status, safe_reason
  ) values (
    request, rehearsal.tournament_id, rehearsal.player_id, rehearsal.auth_user_id,
    email_hash, client_hash, case when allowed then 'AUTHORIZED' else 'REJECTED' end, reason
  );
  return jsonb_build_object('ok', true, 'allowed', allowed, 'requestId', request,
    'email', case when allowed then contact.email_normalized else null end,
    'authUserId', case when allowed then rehearsal.auth_user_id else null end,
    'playerId', case when allowed then rehearsal.player_id else null end);
end;
$$;

create or replace function public.record_single_participant_otp_delivery(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, pg_temp
as $$
declare request uuid := nullif(input->>'request_id', '')::uuid;
declare succeeded boolean := coalesce((input->>'succeeded')::boolean, false);
begin
  update participant_identity.participant_auth_otp_attempts set
    status = case when succeeded then 'SENT' else 'DELIVERY_FAILED' end,
    safe_reason = case when succeeded then 'DELIVERY_ACCEPTED' else btrim(coalesce(input->>'safe_reason', 'DELIVERY_FAILED')) end,
    request_duration_ms = greatest(0, coalesce((input->>'duration_ms')::integer, 0)),
    sent_at = case when succeeded then now() else sent_at end,
    updated_at = now()
  where request_id = request and status = 'AUTHORIZED';
  if not found then raise exception 'OTP request is not in an authorized delivery state.'; end if;
  return jsonb_build_object('ok', true, 'requestId', request, 'status', case when succeeded then 'SENT' else 'DELIVERY_FAILED' end);
end;
$$;

create or replace function public.authorize_single_participant_otp_verification(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, pg_temp
as $$
declare request uuid := nullif(input->>'request_id', '')::uuid;
declare email_hash text := lower(btrim(coalesce(input->>'email_identity_hash', '')));
declare attempt participant_identity.participant_auth_otp_attempts%rowtype;
begin
  select * into attempt from participant_identity.participant_auth_otp_attempts
    where request_id = request and status = 'SENT' and email_identity_hash = email_hash
      and sent_at > now() - interval '15 minutes';
  if not found then return jsonb_build_object('ok', true, 'allowed', false); end if;
  return jsonb_build_object('ok', true, 'allowed', true, 'authUserId', attempt.auth_user_id,
    'playerId', attempt.player_id, 'tournamentId', attempt.tournament_id);
end;
$$;

create or replace function public.record_single_participant_otp_verification(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, pg_temp
as $$
declare request uuid := nullif(input->>'request_id', '')::uuid;
declare user_id uuid := nullif(input->>'auth_user_id', '')::uuid;
declare succeeded boolean := coalesce((input->>'succeeded')::boolean, false);
declare attempt participant_identity.participant_auth_otp_attempts%rowtype;
begin
  select * into attempt from participant_identity.participant_auth_otp_attempts where request_id = request for update;
  if not found or attempt.status <> 'SENT' then raise exception 'OTP request is not awaiting verification.'; end if;
  if succeeded and attempt.auth_user_id <> user_id then raise exception 'Verified Auth identity does not match the approved rehearsal identity.'; end if;
  update participant_identity.participant_auth_otp_attempts set
    status = case when succeeded then 'VERIFIED' else 'VERIFICATION_FAILED' end,
    safe_reason = case when succeeded then 'SESSION_ESTABLISHED' else 'INVALID_OR_EXPIRED_CODE' end,
    verification_duration_ms = greatest(0, coalesce((input->>'duration_ms')::integer, 0)),
    verified_at = case when succeeded then now() else verified_at end,
    updated_at = now()
  where request_id = request;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, request_id, safe_metadata
  ) values (
    case when succeeded then 'PARTICIPANT_AUTH_LOGIN' else 'PARTICIPANT_AUTH_LOGIN_FAILED' end,
    attempt.tournament_id, case when succeeded then user_id else attempt.auth_user_id end,
    attempt.player_id, 'Participant Auth', request::text,
    jsonb_build_object('result', case when succeeded then 'VERIFIED' else 'FAILED' end)
  );
  return jsonb_build_object('ok', true, 'status', case when succeeded then 'VERIFIED' else 'VERIFICATION_FAILED' end);
end;
$$;

create or replace function public.set_single_participant_auth_rehearsal_status(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, pg_temp
as $$
declare target text := btrim(coalesce(input->>'tournament_id', ''));
declare next_status text := upper(btrim(coalesce(input->>'status', '')));
declare actor text := btrim(coalesce(input->>'actor', ''));
declare reason text := btrim(coalesce(input->>'reason', ''));
declare current participant_identity.participant_auth_rehearsals%rowtype;
begin
  if next_status not in ('PREPARED', 'SUSPENDED') or actor = '' then raise exception 'Supported audited rehearsal status is required.'; end if;
  select * into current from participant_identity.participant_auth_rehearsals where tournament_id = target for update;
  if not found or current.status = 'REVOKED' then raise exception 'Prepared rehearsal is required.'; end if;
  update participant_identity.participant_auth_rehearsals set
    status = next_status, shadow_enabled = next_status = 'PREPARED',
    rehearsal_revision = rehearsal_revision + 1,
    suspended_at = case when next_status = 'SUSPENDED' then now() else null end,
    suspended_by = case when next_status = 'SUSPENDED' then actor else null end,
    suspension_reason = case when next_status = 'SUSPENDED' then nullif(reason, '') else null end,
    updated_at = now()
  where tournament_id = target;
  update participant_identity.user_player_links set
    status = case when next_status = 'PREPARED' then 'ACTIVE' else 'SUSPENDED' end,
    link_revision = link_revision + 1, updated_at = now()
  where auth_user_id = current.auth_user_id and player_id = current.player_id
    and status in ('ACTIVE', 'SUSPENDED');
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, link_revision, safe_metadata
  ) values (
    case when next_status = 'PREPARED' then 'PARTICIPANT_AUTH_RESUMED' else 'PARTICIPANT_AUTH_SUSPENDED' end,
    target, current.auth_user_id, current.player_id, actor, current.rehearsal_revision + 1,
    jsonb_build_object('reason', nullif(reason, ''))
  );
  return jsonb_build_object('ok', true, 'status', next_status, 'rehearsalRevision', current.rehearsal_revision + 1);
end;
$$;

create or replace function public.is_single_participant_auth_shadow_enabled(target_auth_user_id uuid, target_tournament_id text)
returns boolean
language sql
stable
security definer
set search_path = participant_identity, public, pg_temp
as $$
  select exists (
    select 1 from participant_identity.participant_auth_rehearsals r
    join participant_identity.user_player_links l on l.auth_user_id = r.auth_user_id and l.player_id = r.player_id
    where r.auth_user_id = target_auth_user_id and r.tournament_id = btrim(target_tournament_id)
      and r.status = 'PREPARED' and r.shadow_enabled and l.status = 'ACTIVE'
  );
$$;

create or replace function public.inspect_participant_identity_security()
returns jsonb
language sql
security definer
set search_path = participant_identity, public, auth, pg_temp
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
    'participantLinks', (select count(*) from participant_identity.user_player_links),
    'authRehearsals', (select count(*) from participant_identity.participant_auth_rehearsals),
    'otpAttempts', (select count(*) from participant_identity.participant_auth_otp_attempts)
  );
$$;

do $$
declare function_signature text;
begin
  foreach function_signature in array array[
    'public.read_single_participant_auth_rehearsal_preflight(text)',
    'public.configure_single_participant_auth_rehearsal(jsonb)',
    'public.authorize_single_participant_otp_request(jsonb)',
    'public.record_single_participant_otp_delivery(jsonb)',
    'public.authorize_single_participant_otp_verification(jsonb)',
    'public.record_single_participant_otp_verification(jsonb)',
    'public.set_single_participant_auth_rehearsal_status(jsonb)',
    'public.is_single_participant_auth_shadow_enabled(uuid,text)',
    'public.inspect_participant_identity_security()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', function_signature);
    execute format('grant execute on function %s to service_role', function_signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
