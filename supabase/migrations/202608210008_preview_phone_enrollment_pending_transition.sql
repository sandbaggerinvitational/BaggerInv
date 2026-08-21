-- Step 8B.2A.5: persist the authenticated phone-change send as verification
-- pending when the hosted updateUser response proves the pending phone via
-- auth-js `new_phone`, even if auth.users.phone_change is not yet visible to
-- the immediately following PostgREST transaction.

create or replace function public.record_participant_phone_enrollment_send(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, auth, pg_temp
as $$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare actor_auth_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare returned_auth_user uuid := nullif(input->>'returned_auth_user_id', '')::uuid;
declare succeeded boolean := coalesce((input->>'succeeded')::boolean, false);
declare provider_called_value boolean := coalesce((input->>'provider_called')::boolean, false);
declare pending_phone_matches boolean := coalesce((input->>'pending_phone_matches')::boolean, false);
declare pending_phone_source text := upper(btrim(coalesce(input->>'pending_phone_source', '')));
declare reason_value text := upper(btrim(coalesce(input->>'safe_reason', 'PHONE_OTP_SEND_FAILED')));
declare duration_value integer := greatest(0, coalesce((input->>'duration_ms')::integer, 0));
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare identifier participant_identity.participant_auth_identifiers%rowtype;
declare auth_user auth.users%rowtype;
begin
  if reason_value !~ '^[A-Z0-9_]+$' then reason_value := 'PHONE_OTP_SEND_FAILED'; end if;
  if pending_phone_source not in (
    'UPDATE_USER_NEW_PHONE', 'UPDATE_USER_PHONE_CHANGE',
    'ADMIN_USER_NEW_PHONE', 'ADMIN_USER_PHONE_CHANGE'
  ) then
    pending_phone_matches := false;
    pending_phone_source := 'NONE';
  end if;

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

  if succeeded and returned_auth_user is distinct from attempt.auth_user_id then
    succeeded := false;
    reason_value := 'PHONE_OTP_AUTH_MISMATCH';
  elsif succeeded and (
    identifier.identifier_id is null
    or identifier.player_id <> attempt.player_id
    or identifier.auth_user_id <> attempt.auth_user_id
    or identifier.revision <> attempt.identifier_revision
    or identifier.status not in ('ELIGIBLE', 'VERIFICATION_PENDING')
  ) then
    succeeded := false;
    reason_value := 'PHONE_OTP_ENROLLMENT_START_FAILED';
  elsif succeeded and (
    nullif(btrim(coalesce(auth_user.phone, '')), '') is not null
    or auth_user.phone_confirmed_at is not null
    or (
      nullif(btrim(coalesce(auth_user.phone_change, '')), '') is not null
      and participant_identity.canonical_auth_phone(auth_user.phone_change)
        <> participant_identity.canonical_auth_phone(identifier.normalized_value_private)
    )
    or (
      not pending_phone_matches
      and participant_identity.canonical_auth_phone(nullif(auth_user.phone_change, ''))
        is distinct from participant_identity.canonical_auth_phone(identifier.normalized_value_private)
    )
  ) then
    succeeded := false;
    reason_value := 'PHONE_OTP_PENDING_STATE_MISMATCH';
  elsif succeeded and exists (
    select 1 from auth.users other_user where other_user.id <> attempt.auth_user_id
      and (participant_identity.canonical_auth_phone(nullif(other_user.phone, ''))
        = participant_identity.canonical_auth_phone(identifier.normalized_value_private)
        or participant_identity.canonical_auth_phone(nullif(other_user.phone_change, ''))
        = participant_identity.canonical_auth_phone(identifier.normalized_value_private))
  ) then
    succeeded := false;
    reason_value := 'PHONE_OTP_AUTH_COLLISION';
  end if;

  update participant_identity.participant_phone_otp_attempts set
    status = case when succeeded then 'SENT' else 'SEND_FAILED' end,
    safe_reason = case when succeeded then 'PHONE_CHANGE_VERIFICATION_PENDING' else reason_value end,
    provider_called = provider_called_value,
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
    jsonb_build_object(
      'method', 'AUTHENTICATED_PHONE_CHANGE',
      'providerCalled', provider_called_value,
      'safeReason', case when succeeded then 'PHONE_CHANGE_VERIFICATION_PENDING' else reason_value end,
      'pendingPhoneSource', pending_phone_source,
      'pendingPhoneNormalized', pending_phone_matches,
      'returnedAuthUserMatch', returned_auth_user = attempt.auth_user_id,
      'durationMs', duration_value,
      'rawPhoneLogged', false,
      'otpLogged', false
    )
  );

  return jsonb_build_object(
    'ok', succeeded,
    'code', case when succeeded then 'PHONE_OTP_VERIFICATION_PENDING' else reason_value end,
    'status', case when succeeded then 'VERIFICATION_PENDING' else 'SEND_FAILED' end,
    'expiresAt', attempt.expires_at,
    'sameAuthUser', succeeded and returned_auth_user = attempt.auth_user_id,
    'phoneRepresentationNormalized', succeeded and pending_phone_matches
  );
end;
$$;

create or replace function public.read_participant_phone_enrollment_state(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = participant_identity, public, auth, pg_temp
as $$
declare target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
declare requested_player text := btrim(coalesce(input->>'player_id', ''));
declare actor_auth_user uuid := nullif(input->>'actor_auth_user_id', '')::uuid;
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare identifier participant_identity.participant_auth_identifiers%rowtype;
begin
  if target_tournament = '' or requested_player = '' or actor_auth_user is null
     or not exists (
       select 1 from participant_identity.user_player_links link
       where link.player_id = requested_player and link.auth_user_id = actor_auth_user
         and link.status = 'ACTIVE'
     ) then
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_SESSION_REQUIRED');
  end if;

  select * into identifier from participant_identity.participant_auth_identifiers current_identifier
  where current_identifier.player_id = requested_player
    and current_identifier.auth_user_id = actor_auth_user
    and current_identifier.identifier_type = 'PHONE'
    and current_identifier.source_tournament_id = target_tournament
    and current_identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');
  if not found then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_NOT_ELIGIBLE'); end if;

  select * into attempt from participant_identity.participant_phone_otp_attempts current_attempt
  where current_attempt.identifier_id = identifier.identifier_id
    and current_attempt.auth_user_id = actor_auth_user
    and current_attempt.player_id = requested_player
  order by current_attempt.requested_at desc
  limit 1;

  if attempt.attempt_id is null or attempt.status <> 'SENT' or attempt.expires_at <= now()
     or identifier.status <> 'VERIFICATION_PENDING' then
    return jsonb_build_object('ok', true, 'status', 'NONE');
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'VERIFICATION_PENDING',
    'attemptId', attempt.attempt_id,
    'maskedMobile', '••• ••• ' || right(participant_identity.canonical_auth_phone(identifier.normalized_value_private), 4),
    'expiresAt', attempt.expires_at,
    'resendCooldownSeconds', greatest(0, ceil(extract(epoch from ((attempt.requested_at + interval '60 seconds') - now())))::integer)
  );
end;
$$;

revoke all on function public.record_participant_phone_enrollment_send(jsonb) from public, anon, authenticated;
grant execute on function public.record_participant_phone_enrollment_send(jsonb) to service_role;
revoke all on function public.read_participant_phone_enrollment_state(jsonb) from public, anon, authenticated;
grant execute on function public.read_participant_phone_enrollment_state(jsonb) to service_role;

notify pgrst, 'reload schema';
