-- Step 8B.2A: same-Auth-user phone enrollment (Preview first).
--
-- Operation A is authenticated updateUser({ phone }) followed by
-- verifyOtp({ type: 'phone_change' }). Operation B (later signed-out phone
-- login) is deliberately separate. These functions never create Auth users,
-- change Player links, or store OTP values.

create or replace function participant_identity.canonical_auth_phone(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
  select regexp_replace(btrim(value), '[^0-9]', '', 'g')
$$;

revoke all on function participant_identity.canonical_auth_phone(text) from public, anon, authenticated;
grant execute on function participant_identity.canonical_auth_phone(text) to service_role;

create or replace function public.begin_participant_phone_enrollment(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, auth, pg_temp
as $$
declare target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
declare requested_player text := btrim(coalesce(input->>'player_id', ''));
declare actor_auth_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare client_hash text := lower(btrim(coalesce(input->>'client_fingerprint', '')));
declare rehearsal participant_identity.participant_auth_rehearsals%rowtype;
declare link_row participant_identity.user_player_links%rowtype;
declare phone_identifier participant_identity.participant_auth_identifiers%rowtype;
declare email_identifier participant_identity.participant_auth_identifiers%rowtype;
declare auth_user auth.users%rowtype;
declare new_attempt uuid := gen_random_uuid();
declare recent_identifier integer := 0;
declare recent_client integer := 0;
declare cooldown_seconds integer := 0;
declare limit_code text;
begin
  if target_tournament = '' or requested_player = '' or actor_auth_user is null
     or client_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_CONTEXT_INVALID');
  end if;

  select * into rehearsal
  from participant_identity.participant_auth_rehearsals
  where tournament_id = target_tournament
    and player_id = requested_player
    and auth_user_id = actor_auth_user
    and status = 'PREPARED'
    and shadow_enabled
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_REHEARSAL_ONLY');
  end if;

  select * into link_row
  from participant_identity.user_player_links
  where player_id = requested_player
    and auth_user_id = actor_auth_user
    and status = 'ACTIVE'
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_AUTH_MISMATCH');
  end if;
  if not exists (
    select 1 from scoring_authority.tournament_players membership
    where membership.tournament_id = target_tournament
      and membership.player_id = requested_player
      and membership.participation_status = 'ACTIVE'
  ) then
    return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_NOT_ELIGIBLE');
  end if;

  select * into email_identifier
  from participant_identity.participant_auth_identifiers
  where player_id = requested_player
    and auth_user_id = actor_auth_user
    and identifier_type = 'EMAIL'
    and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
  for share;
  select * into phone_identifier
  from participant_identity.participant_auth_identifiers
  where player_id = requested_player
    and auth_user_id = actor_auth_user
    and identifier_type = 'PHONE'
    and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
  for update;
  if email_identifier.identifier_id is null or phone_identifier.identifier_id is null then
    return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_NOT_ELIGIBLE');
  end if;
  if phone_identifier.status = 'VERIFIED' then
    return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_ALREADY_VERIFIED');
  end if;

  select * into auth_user from auth.users where id = actor_auth_user for update;
  if not found or lower(btrim(coalesce(auth_user.email, ''))) <> email_identifier.normalized_value_private then
    return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_AUTH_MISMATCH');
  end if;
  if nullif(btrim(coalesce(auth_user.phone, '')), '') is not null then
    return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_REPAIR_REQUIRED');
  end if;
  if nullif(btrim(coalesce(auth_user.phone_change, '')), '') is not null
     and participant_identity.canonical_auth_phone(auth_user.phone_change)
       <> participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private) then
    return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_AUTH_MISMATCH');
  end if;
  if exists (
    select 1 from auth.users other_user
    where other_user.id <> actor_auth_user
      and (
        participant_identity.canonical_auth_phone(nullif(other_user.phone, ''))
          = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)
        or participant_identity.canonical_auth_phone(nullif(other_user.phone_change, ''))
          = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)
      )
  ) then
    return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_AUTH_COLLISION');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('participant-phone-enrollment:' || phone_identifier.identifier_id::text, 0));
  select greatest(0, ceil(extract(epoch from ((max(requested_at) + interval '60 seconds') - now())))::integer)
    into cooldown_seconds
  from participant_identity.participant_phone_otp_attempts
  where identifier_id = phone_identifier.identifier_id
    and status in ('REQUESTING', 'SENT', 'VERIFIED', 'SEND_FAILED')
    and requested_at > now() - interval '60 seconds';
  select count(*) into recent_identifier
  from participant_identity.participant_phone_otp_attempts
  where identifier_id = phone_identifier.identifier_id
    and status in ('REQUESTING', 'SENT', 'VERIFIED', 'SEND_FAILED')
    and requested_at > now() - interval '1 hour';
  select count(*) into recent_client
  from participant_identity.participant_phone_otp_attempts
  where client_fingerprint = client_hash
    and status in ('REQUESTING', 'SENT', 'VERIFIED', 'SEND_FAILED')
    and requested_at > now() - interval '1 hour';
  limit_code := case
    when cooldown_seconds > 0 then 'PHONE_OTP_COOLDOWN'
    when recent_identifier >= 3 or recent_client >= 6 then 'PHONE_OTP_RATE_LIMITED'
    else null
  end;
  if limit_code is not null then
    insert into participant_identity.participant_phone_otp_attempts (
      attempt_id, tournament_id, identifier_id, identifier_revision, player_id,
      auth_user_id, requested_by_auth_user_id, client_fingerprint, status, safe_reason
    ) values (
      new_attempt, target_tournament, phone_identifier.identifier_id, phone_identifier.revision,
      requested_player, actor_auth_user, actor_auth_user, client_hash, 'RATE_LIMITED', limit_code
    );
    return jsonb_build_object('ok', true, 'allowed', false, 'code', limit_code,
      'retryAfterSeconds', cooldown_seconds);
  end if;

  update participant_identity.participant_phone_otp_attempts
  set status = case when expires_at <= now() then 'EXPIRED' else 'CANCELLED' end,
      safe_reason = case when expires_at <= now() then 'ATTEMPT_EXPIRED' else 'RESEND_REPLACED' end,
      updated_at = now()
  where identifier_id = phone_identifier.identifier_id and status in ('REQUESTING', 'SENT');
  insert into participant_identity.participant_phone_otp_attempts (
    attempt_id, tournament_id, identifier_id, identifier_revision, player_id,
    auth_user_id, requested_by_auth_user_id, client_fingerprint, status, safe_reason
  ) values (
    new_attempt, target_tournament, phone_identifier.identifier_id, phone_identifier.revision,
    requested_player, actor_auth_user, actor_auth_user, client_hash, 'REQUESTING',
    'AUTHENTICATED_PHONE_CHANGE_PREFLIGHT_PASSED'
  );
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name,
    request_id, link_revision, safe_metadata
  ) values (
    'PHONE_ENROLLMENT_REQUESTED', target_tournament, actor_auth_user, requested_player,
    requested_player, 'Authenticated participant', new_attempt::text, link_row.link_revision,
    jsonb_build_object('method', 'AUTHENTICATED_PHONE_CHANGE', 'sameAuthUserRequired', true,
      'rawPhoneLogged', false, 'otpLogged', false)
  );
  return jsonb_build_object(
    'ok', true, 'allowed', true, 'code', 'PHONE_OTP_PREFLIGHT_PASSED',
    'attemptId', new_attempt, 'tournamentId', target_tournament,
    'playerId', requested_player, 'authUserId', actor_auth_user,
    'emailNormalized', email_identifier.normalized_value_private,
    'phoneE164', phone_identifier.normalized_value_private,
    'authPhoneState', 'EMPTY',
    'authPhoneChangeState', case when nullif(btrim(coalesce(auth_user.phone_change, '')), '') is null then 'EMPTY' else 'EXPECTED' end,
    'otherAuthUserCollision', false, 'expiresAt', now() + interval '10 minutes'
  );
end;
$$;

create or replace function public.record_participant_phone_enrollment_send(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, auth, pg_temp
as $$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare actor_auth_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare succeeded boolean := coalesce((input->>'succeeded')::boolean, false);
declare provider_called_value boolean := coalesce((input->>'provider_called')::boolean, false);
declare reason_value text := upper(btrim(coalesce(input->>'safe_reason', 'PHONE_CHANGE_PROVIDER_REJECTED')));
declare duration_value integer := greatest(0, coalesce((input->>'duration_ms')::integer, 0));
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare identifier participant_identity.participant_auth_identifiers%rowtype;
declare auth_user auth.users%rowtype;
begin
  if reason_value !~ '^[A-Z0-9_]+$' then reason_value := 'PHONE_CHANGE_PROVIDER_REJECTED'; end if;
  select * into attempt from participant_identity.participant_phone_otp_attempts
  where attempt_id = target_attempt
    and auth_user_id = actor_auth_user
    and requested_by_auth_user_id = actor_auth_user
  for update;
  if not found or attempt.status <> 'REQUESTING' then
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE');
  end if;
  select * into identifier from participant_identity.participant_auth_identifiers
  where identifier_id = attempt.identifier_id for update;
  select * into auth_user from auth.users where id = attempt.auth_user_id;
  if succeeded and (
    identifier.identifier_id is null
    or identifier.player_id <> attempt.player_id
    or identifier.auth_user_id <> attempt.auth_user_id
    or identifier.revision <> attempt.identifier_revision
    or identifier.status not in ('ELIGIBLE', 'VERIFICATION_PENDING')
    or nullif(btrim(coalesce(auth_user.phone, '')), '') is not null
    or auth_user.phone_confirmed_at is not null
    or participant_identity.canonical_auth_phone(nullif(auth_user.phone_change, ''))
      is distinct from participant_identity.canonical_auth_phone(identifier.normalized_value_private)
    or exists (
      select 1 from auth.users other_user where other_user.id <> attempt.auth_user_id
        and (participant_identity.canonical_auth_phone(nullif(other_user.phone, ''))
          = participant_identity.canonical_auth_phone(identifier.normalized_value_private)
          or participant_identity.canonical_auth_phone(nullif(other_user.phone_change, ''))
          = participant_identity.canonical_auth_phone(identifier.normalized_value_private))
    )
  ) then
    succeeded := false;
    reason_value := 'PHONE_OTP_AUTH_MISMATCH';
  end if;
  update participant_identity.participant_phone_otp_attempts set
    status = case when succeeded then 'SENT' else 'SEND_FAILED' end,
    safe_reason = reason_value, provider_called = provider_called_value,
    provider_requested_at = case when provider_called_value then now() else null end,
    sent_at = case when succeeded then now() else null end,
    request_duration_ms = duration_value, updated_at = now()
  where attempt_id = target_attempt;
  update participant_identity.participant_auth_identifiers set
    status = case when succeeded then 'VERIFICATION_PENDING' else 'ELIGIBLE' end,
    updated_by = 'SUPABASE_AUTH_PHONE_CHANGE', updated_at = now()
  where identifier_id = attempt.identifier_id
    and revision = attempt.identifier_revision
    and status in ('ELIGIBLE', 'VERIFICATION_PENDING');
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name,
    request_id, safe_metadata
  ) values (
    case when succeeded then 'PHONE_ENROLLMENT_CODE_SENT' else 'PHONE_ENROLLMENT_SEND_FAILED' end,
    attempt.tournament_id, attempt.auth_user_id, attempt.player_id, attempt.player_id,
    'Authenticated participant', attempt.attempt_id::text,
    jsonb_build_object('method', 'AUTHENTICATED_PHONE_CHANGE', 'providerCalled', provider_called_value,
      'safeReason', reason_value, 'durationMs', duration_value,
      'rawPhoneLogged', false, 'otpLogged', false)
  );
  return jsonb_build_object('ok', succeeded, 'code', case when succeeded then 'PHONE_OTP_SENT' else reason_value end,
    'status', case when succeeded then 'SENT' else 'SEND_FAILED' end,
    'expiresAt', attempt.expires_at);
end;
$$;

create or replace function public.authorize_participant_phone_enrollment_verification(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, auth, pg_temp
as $$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare actor_auth_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare identifier participant_identity.participant_auth_identifiers%rowtype;
declare email_identifier participant_identity.participant_auth_identifiers%rowtype;
declare auth_user auth.users%rowtype;
begin
  select * into attempt from participant_identity.participant_phone_otp_attempts
  where attempt_id = target_attempt
    and auth_user_id = actor_auth_user
    and requested_by_auth_user_id = actor_auth_user
  for update;
  if not found then return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_SESSION_REQUIRED'); end if;
  if attempt.status = 'VERIFIED' then return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_REPLAY'); end if;
  if attempt.status <> 'SENT' then return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_STALE'); end if;
  if attempt.expires_at <= now() then
    update participant_identity.participant_phone_otp_attempts set status = 'EXPIRED', safe_reason = 'ATTEMPT_EXPIRED', updated_at = now()
    where attempt_id = target_attempt;
    update participant_identity.participant_auth_identifiers set status = 'ELIGIBLE', updated_at = now()
    where identifier_id = attempt.identifier_id and status = 'VERIFICATION_PENDING';
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_INVALID_OR_EXPIRED');
  end if;
  select * into identifier from participant_identity.participant_auth_identifiers
  where identifier_id = attempt.identifier_id for update;
  select * into email_identifier from participant_identity.participant_auth_identifiers
  where player_id = attempt.player_id and auth_user_id = attempt.auth_user_id
    and identifier_type = 'EMAIL' and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');
  select * into auth_user from auth.users where id = attempt.auth_user_id;
  if identifier.identifier_id is null or identifier.status <> 'VERIFICATION_PENDING'
     or identifier.revision <> attempt.identifier_revision
     or identifier.player_id <> attempt.player_id or identifier.auth_user_id <> attempt.auth_user_id
     or email_identifier.identifier_id is null
     or lower(btrim(coalesce(auth_user.email, ''))) <> email_identifier.normalized_value_private
     or nullif(btrim(coalesce(auth_user.phone, '')), '') is not null
     or auth_user.phone_confirmed_at is not null
     or participant_identity.canonical_auth_phone(nullif(auth_user.phone_change, ''))
       is distinct from participant_identity.canonical_auth_phone(identifier.normalized_value_private)
     or not exists (select 1 from participant_identity.user_player_links link
       where link.player_id = attempt.player_id and link.auth_user_id = attempt.auth_user_id and link.status = 'ACTIVE')
     or not exists (select 1 from scoring_authority.tournament_players membership
       where membership.tournament_id = attempt.tournament_id and membership.player_id = attempt.player_id
         and membership.participation_status = 'ACTIVE')
     or exists (select 1 from auth.users other_user where other_user.id <> attempt.auth_user_id
       and (participant_identity.canonical_auth_phone(nullif(other_user.phone, ''))
         = participant_identity.canonical_auth_phone(identifier.normalized_value_private)
         or participant_identity.canonical_auth_phone(nullif(other_user.phone_change, ''))
         = participant_identity.canonical_auth_phone(identifier.normalized_value_private))) then
    update participant_identity.participant_phone_otp_attempts set status = 'CANCELLED', safe_reason = 'AUTHORITY_MISMATCH', updated_at = now()
    where attempt_id = target_attempt;
    update participant_identity.participant_auth_identifiers set status = 'ELIGIBLE', updated_at = now()
    where identifier_id = attempt.identifier_id and status = 'VERIFICATION_PENDING';
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_AUTH_MISMATCH');
  end if;
  return jsonb_build_object('ok', true, 'allowed', true, 'code', 'PHONE_OTP_VERIFY_ALLOWED',
    'attemptId', attempt.attempt_id, 'tournamentId', attempt.tournament_id,
    'playerId', attempt.player_id, 'authUserId', attempt.auth_user_id,
    'phoneE164', identifier.normalized_value_private,
    'emailNormalized', email_identifier.normalized_value_private,
    'expiresAt', attempt.expires_at);
end;
$$;

create or replace function public.record_participant_phone_enrollment_failure(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, pg_temp
as $$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare actor_auth_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare reason_value text := upper(btrim(coalesce(input->>'safe_reason', 'PHONE_OTP_INVALID_OR_EXPIRED')));
declare duration_value integer := greatest(0, coalesce((input->>'duration_ms')::integer, 0));
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare next_failures integer;
declare next_status text;
begin
  select * into attempt from participant_identity.participant_phone_otp_attempts
  where attempt_id = target_attempt and auth_user_id = actor_auth_user and requested_by_auth_user_id = actor_auth_user
  for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_SESSION_REQUIRED'); end if;
  if attempt.status = 'VERIFIED' then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_REPLAY'); end if;
  if attempt.status <> 'SENT' then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE'); end if;
  next_failures := least(5, attempt.verify_failure_count + case when reason_value = 'PHONE_OTP_PROVIDER_UNAVAILABLE' then 0 else 1 end);
  next_status := case
    when reason_value = 'PHONE_OTP_AUTH_MISMATCH' then 'UUID_MISMATCH'
    when reason_value = 'PHONE_OTP_INVALID_OR_EXPIRED' and attempt.expires_at <= now() then 'EXPIRED'
    when next_failures >= 5 then 'VERIFY_LOCKED'
    else 'SENT'
  end;
  update participant_identity.participant_phone_otp_attempts set status = next_status,
    safe_reason = reason_value, verify_failure_count = next_failures,
    verification_duration_ms = duration_value, updated_at = now()
  where attempt_id = target_attempt;
  if next_status in ('UUID_MISMATCH', 'EXPIRED', 'VERIFY_LOCKED') then
    update participant_identity.participant_auth_identifiers set status = 'ELIGIBLE', updated_at = now()
    where identifier_id = attempt.identifier_id and status = 'VERIFICATION_PENDING';
  end if;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name, request_id, safe_metadata
  ) values (
    case when reason_value = 'PHONE_OTP_AUTH_MISMATCH' then 'PHONE_ENROLLMENT_UUID_MISMATCH' else 'PHONE_ENROLLMENT_VERIFY_FAILED' end,
    attempt.tournament_id, attempt.auth_user_id, attempt.player_id, attempt.player_id,
    'Authenticated participant', attempt.attempt_id::text,
    jsonb_build_object('safeReason', reason_value, 'attemptStatus', next_status,
      'verifyFailureCount', next_failures, 'durationMs', duration_value,
      'rawPhoneLogged', false, 'otpLogged', false)
  );
  return jsonb_build_object('ok', true, 'status', next_status, 'verifyFailureCount', next_failures);
end;
$$;

create or replace function public.complete_participant_phone_enrollment(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, auth, pg_temp
as $$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare actor_auth_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare returned_auth_user uuid := nullif(input->>'returned_auth_user_id', '')::uuid;
declare duration_value integer := greatest(0, coalesce((input->>'duration_ms')::integer, 0));
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare identifier participant_identity.participant_auth_identifiers%rowtype;
declare email_identifier participant_identity.participant_auth_identifiers%rowtype;
declare auth_user auth.users%rowtype;
begin
  select * into attempt from participant_identity.participant_phone_otp_attempts
  where attempt_id = target_attempt and auth_user_id = actor_auth_user and requested_by_auth_user_id = actor_auth_user
  for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_SESSION_REQUIRED'); end if;
  if attempt.status = 'VERIFIED' then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_REPLAY'); end if;
  if attempt.status <> 'SENT' or attempt.expires_at <= now() then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE'); end if;
  if returned_auth_user is null or returned_auth_user <> attempt.auth_user_id then
    update participant_identity.participant_phone_otp_attempts set status = 'UUID_MISMATCH', safe_reason = 'PHONE_OTP_AUTH_MISMATCH', updated_at = now()
    where attempt_id = target_attempt;
    update participant_identity.participant_auth_identifiers set status = 'ELIGIBLE', updated_at = now()
    where identifier_id = attempt.identifier_id and status = 'VERIFICATION_PENDING';
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_AUTH_MISMATCH');
  end if;
  select * into identifier from participant_identity.participant_auth_identifiers where identifier_id = attempt.identifier_id for update;
  select * into email_identifier from participant_identity.participant_auth_identifiers
  where player_id = attempt.player_id and auth_user_id = attempt.auth_user_id
    and identifier_type = 'EMAIL' and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');
  select * into auth_user from auth.users where id = attempt.auth_user_id;
  if identifier.identifier_id is null or identifier.status <> 'VERIFICATION_PENDING'
     or identifier.revision <> attempt.identifier_revision
     or identifier.player_id <> attempt.player_id or identifier.auth_user_id <> attempt.auth_user_id
     or email_identifier.identifier_id is null
     or lower(btrim(coalesce(auth_user.email, ''))) <> email_identifier.normalized_value_private
     or participant_identity.canonical_auth_phone(nullif(auth_user.phone, ''))
       is distinct from participant_identity.canonical_auth_phone(identifier.normalized_value_private)
     or auth_user.phone_confirmed_at is null
     or nullif(btrim(coalesce(auth_user.phone_change, '')), '') is not null
     or not exists (select 1 from participant_identity.user_player_links link
       where link.player_id = attempt.player_id and link.auth_user_id = attempt.auth_user_id and link.status = 'ACTIVE')
     or (select count(*) from auth.identities identity where identity.user_id = attempt.auth_user_id and identity.provider = 'phone') <> 1
     or exists (select 1 from auth.users other_user where other_user.id <> attempt.auth_user_id
       and (participant_identity.canonical_auth_phone(nullif(other_user.phone, ''))
         = participant_identity.canonical_auth_phone(identifier.normalized_value_private)
         or participant_identity.canonical_auth_phone(nullif(other_user.phone_change, ''))
         = participant_identity.canonical_auth_phone(identifier.normalized_value_private))) then
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_AUTH_MISMATCH');
  end if;
  update participant_identity.participant_phone_otp_attempts set status = 'VERIFIED',
    safe_reason = 'SAME_AUTH_USER_PHONE_CHANGE_VERIFIED', verification_duration_ms = duration_value,
    verified_at = now(), used_at = now(), updated_at = now()
  where attempt_id = target_attempt and status = 'SENT';
  if not found then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_REPLAY'); end if;
  update participant_identity.participant_auth_identifiers set status = 'VERIFIED', verified_at = now(),
    verification_source = 'SUPABASE_AUTH_TWILIO_VERIFY', updated_by = 'SUPABASE_AUTH_PHONE_CHANGE', updated_at = now()
  where identifier_id = attempt.identifier_id and revision = attempt.identifier_revision and status = 'VERIFICATION_PENDING';
  if not found then raise exception 'Phone ownership changed during verification.'; end if;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name,
    request_id, safe_metadata
  ) values (
    'PHONE_ENROLLMENT_VERIFIED', attempt.tournament_id, attempt.auth_user_id,
    attempt.player_id, attempt.player_id, 'Authenticated participant', attempt.attempt_id::text,
    jsonb_build_object('method', 'AUTHENTICATED_PHONE_CHANGE', 'returnedAuthUserMatch', true,
      'playerIdUnchanged', true, 'emailPreserved', true, 'durationMs', duration_value,
      'rawPhoneLogged', false, 'otpLogged', false)
  );
  return jsonb_build_object('ok', true, 'status', 'VERIFIED', 'sameAuthUser', true,
    'playerId', attempt.player_id, 'emailPreserved', true, 'activeLink', true);
end;
$$;

-- Keep the Director read-only surface accurate when hosted Auth canonicalizes
-- an E.164 value without the leading plus sign.
create or replace function public.read_participant_phone_otp_director_state(
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
  if target_tournament = '' or actor_auth_user_id is null or not exists (
    select 1 from participant_identity.preview_director_entitlements entitlement
    where entitlement.auth_user_id = actor_auth_user_id
      and entitlement.tournament_id = target_tournament and entitlement.status = 'ACTIVE'
  ) then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_DIRECTOR_REQUIRED'); end if;
  with rows as (
    select phone.player_id, phone.identifier_id, phone.status as phone_status, phone.auth_user_id,
      phone.normalized_value_private, link.auth_user_id as link_auth_user_id,
      rehearsal.status as rehearsal_status, rehearsal.shadow_enabled,
      email_identifier.identifier_id as email_identifier_id,
      email_identifier.auth_user_id as email_auth_user_id,
      auth_user.phone as auth_phone, auth_user.phone_change as auth_phone_change,
      auth_user.phone_confirmed_at,
      exists (select 1 from auth.users other_user where other_user.id <> phone.auth_user_id
        and (participant_identity.canonical_auth_phone(nullif(other_user.phone, ''))
          = participant_identity.canonical_auth_phone(phone.normalized_value_private)
          or participant_identity.canonical_auth_phone(nullif(other_user.phone_change, ''))
          = participant_identity.canonical_auth_phone(phone.normalized_value_private))) as other_auth_collision,
      latest.attempt_id, latest.status as attempt_status, latest.safe_reason,
      latest.verify_failure_count, latest.requested_at, latest.sent_at,
      latest.expires_at, latest.verified_at as attempt_verified_at
    from participant_identity.participant_auth_identifiers phone
    left join participant_identity.user_player_links link on link.player_id = phone.player_id and link.status = 'ACTIVE'
    left join participant_identity.participant_auth_rehearsals rehearsal
      on rehearsal.tournament_id = target_tournament and rehearsal.player_id = phone.player_id
    left join participant_identity.participant_auth_identifiers email_identifier
      on email_identifier.player_id = phone.player_id and email_identifier.identifier_type = 'EMAIL'
      and email_identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
    left join auth.users auth_user on auth_user.id = phone.auth_user_id
    left join lateral (select attempt.* from participant_identity.participant_phone_otp_attempts attempt
      where attempt.identifier_id = phone.identifier_id order by attempt.requested_at desc limit 1) latest on true
    where phone.identifier_type = 'PHONE' and phone.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
      and phone.source_tournament_id = target_tournament
  ), presented as (
    select rows.*, case
      when phone_status = 'VERIFIED' and phone_confirmed_at is not null
        and participant_identity.canonical_auth_phone(nullif(auth_phone, ''))
          = participant_identity.canonical_auth_phone(normalized_value_private) then 'VERIFIED'
      when rehearsal_status <> 'PREPARED' or not coalesce(shadow_enabled, false) then 'REHEARSAL_NOT_READY'
      when link_auth_user_id is distinct from auth_user_id or email_identifier_id is null
        or email_auth_user_id is distinct from auth_user_id then 'AUTH_UUID_MISMATCH'
      when other_auth_collision then 'AUTH_COLLISION'
      when nullif(btrim(coalesce(auth_phone, '')), '') is not null then 'AUTH_PHONE_REPAIR_REQUIRED'
      when nullif(btrim(coalesce(auth_phone_change, '')), '') is not null
        and participant_identity.canonical_auth_phone(auth_phone_change)
          <> participant_identity.canonical_auth_phone(normalized_value_private) then 'AUTH_PHONE_CHANGE_CONFLICT'
      else 'READY' end as preflight_status
    from rows
  )
  select jsonb_build_object(
    'ok', true,
    'counts', jsonb_build_object(
      'realSmsRequests', (select count(*) from participant_identity.participant_phone_otp_attempts where provider_called),
      'requesting', (select count(*) from participant_identity.participant_phone_otp_attempts where status = 'REQUESTING'),
      'sent', (select count(*) from participant_identity.participant_phone_otp_attempts where status = 'SENT'),
      'verified', (select count(*) from participant_identity.participant_phone_otp_attempts where status = 'VERIFIED'),
      'failed', (select count(*) from participant_identity.participant_phone_otp_attempts where status in ('SEND_FAILED', 'VERIFY_LOCKED', 'UUID_MISMATCH'))
    ),
    'players', coalesce(jsonb_agg(jsonb_build_object(
      'playerId', player_id, 'preflightStatus', preflight_status,
      'preflightReady', preflight_status = 'READY', 'phoneStatus', phone_status,
      'authPhoneState', case when nullif(btrim(coalesce(auth_phone, '')), '') is null then 'EMPTY'
        when participant_identity.canonical_auth_phone(auth_phone)
          = participant_identity.canonical_auth_phone(normalized_value_private) then 'EXPECTED' else 'CONFLICT' end,
      'authPhoneChangeState', case when nullif(btrim(coalesce(auth_phone_change, '')), '') is null then 'EMPTY'
        when participant_identity.canonical_auth_phone(auth_phone_change)
          = participant_identity.canonical_auth_phone(normalized_value_private) then 'EXPECTED' else 'CONFLICT' end,
      'otherAuthUserCollision', other_auth_collision,
      'enrollmentMethod', 'AUTHENTICATED_PHONE_CHANGE',
      'attempt', case when attempt_id is null then null else jsonb_build_object(
        'attemptId', case when attempt_status = 'SENT' and expires_at > now() then attempt_id else null end,
        'status', attempt_status, 'safeReason', safe_reason,
        'verifyFailureCount', verify_failure_count, 'sentAt', sent_at,
        'expiresAt', expires_at, 'verifiedAt', attempt_verified_at,
        'retryAfterSeconds', greatest(0, ceil(extract(epoch from ((requested_at + interval '60 seconds') - now())))::integer)
      ) end
    ) order by player_id), '[]'::jsonb)
  ) into result from presented;
  return result;
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.begin_participant_phone_enrollment(jsonb)',
    'public.record_participant_phone_enrollment_send(jsonb)',
    'public.authorize_participant_phone_enrollment_verification(jsonb)',
    'public.record_participant_phone_enrollment_failure(jsonb)',
    'public.complete_participant_phone_enrollment(jsonb)',
    'public.read_participant_phone_otp_director_state(text,uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
