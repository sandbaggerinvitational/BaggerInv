-- Preview-only, one-time repair for the audited Step 8B.2 physical attempt.
-- This script resolves all targets from the safe failed-attempt record. It
-- prints no PII, never deletes an Auth user, and aborts unless every forensic
-- invariant proves the phone identity was created by that failed attempt.

do $$
declare failed_attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare phone_identifier participant_identity.participant_auth_identifiers%rowtype;
declare email_identifier participant_identity.participant_auth_identifiers%rowtype;
declare target_user auth.users%rowtype;
declare target_phone_identity auth.identities%rowtype;
declare matched_count integer;
begin
  select count(*) into matched_count
  from participant_identity.participant_phone_otp_attempts attempt
  where attempt.status = 'SEND_FAILED'
    and attempt.safe_reason = 'PHONE_OTP_AUTH_MISMATCH'
    and not attempt.provider_called
    and not attempt.auth_phone_attached
    and attempt.verified_at is null
    and attempt.used_at is null
    and attempt.expires_at <= now();
  if matched_count <> 1 then
    raise exception 'Preview repair aborted: expected exactly one audited failed attempt.';
  end if;

  select * into strict failed_attempt
  from participant_identity.participant_phone_otp_attempts attempt
  where attempt.status = 'SEND_FAILED'
    and attempt.safe_reason = 'PHONE_OTP_AUTH_MISMATCH'
    and not attempt.provider_called
    and not attempt.auth_phone_attached
    and attempt.verified_at is null
    and attempt.used_at is null
    and attempt.expires_at <= now();
  select * into strict phone_identifier
  from participant_identity.participant_auth_identifiers identifier
  where identifier.identifier_id = failed_attempt.identifier_id
    and identifier.identifier_type = 'PHONE'
    and identifier.status = 'ELIGIBLE'
    and identifier.auth_user_id = failed_attempt.auth_user_id
    and identifier.player_id = failed_attempt.player_id
    and identifier.revision = failed_attempt.identifier_revision;
  select * into strict email_identifier
  from participant_identity.participant_auth_identifiers identifier
  where identifier.player_id = failed_attempt.player_id
    and identifier.identifier_type = 'EMAIL'
    and identifier.auth_user_id = failed_attempt.auth_user_id
    and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');
  select * into strict target_user from auth.users where id = failed_attempt.auth_user_id for update;

  if (select count(*) from auth.users) <> 1
     or (select count(*) from participant_identity.user_player_links link
       where link.auth_user_id = failed_attempt.auth_user_id and link.status = 'ACTIVE') <> 1
     or not exists (select 1 from participant_identity.user_player_links link
       where link.auth_user_id = failed_attempt.auth_user_id
         and link.player_id = failed_attempt.player_id and link.status = 'ACTIVE')
     or lower(btrim(coalesce(target_user.email, ''))) <> email_identifier.normalized_value_private
     or target_user.phone_confirmed_at is not null
     or nullif(btrim(coalesce(target_user.phone_change, '')), '') is not null
     or participant_identity.canonical_auth_phone(target_user.phone)
       <> participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private) then
    raise exception 'Preview repair aborted: Auth user, email, Player link, or phone state no longer matches the audit.';
  end if;

  select count(*) into matched_count from auth.identities identity
  where identity.user_id = failed_attempt.auth_user_id and identity.provider = 'phone'
    and identity.created_at between failed_attempt.requested_at - interval '30 seconds'
      and failed_attempt.updated_at + interval '30 seconds'
    and participant_identity.canonical_auth_phone(identity.identity_data->>'phone')
      = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private);
  if matched_count <> 1
     or (select count(*) from auth.identities identity
       where identity.user_id = failed_attempt.auth_user_id and identity.provider = 'phone') <> 1
     or (select count(*) from auth.identities identity
       where identity.user_id = failed_attempt.auth_user_id and identity.provider = 'email') <> 1 then
    raise exception 'Preview repair aborted: the test-created phone identity was not uniquely proven.';
  end if;

  select * into strict target_phone_identity from auth.identities identity
  where identity.user_id = failed_attempt.auth_user_id and identity.provider = 'phone'
    and identity.created_at between failed_attempt.requested_at - interval '30 seconds'
      and failed_attempt.updated_at + interval '30 seconds'
    and participant_identity.canonical_auth_phone(identity.identity_data->>'phone')
      = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)
  for update;

  delete from auth.identities where id = target_phone_identity.id and user_id = failed_attempt.auth_user_id;
  if not found then raise exception 'Preview repair aborted: phone identity changed concurrently.'; end if;
  update auth.users set phone = null, phone_confirmed_at = null, updated_at = now()
  where id = failed_attempt.auth_user_id
    and phone_confirmed_at is null
    and participant_identity.canonical_auth_phone(phone)
      = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private);
  if not found then raise exception 'Preview repair aborted: Auth phone changed concurrently.'; end if;

  if exists (select 1 from auth.identities identity
       where identity.user_id = failed_attempt.auth_user_id and identity.provider = 'phone')
     or nullif(btrim(coalesce((select phone from auth.users where id = failed_attempt.auth_user_id), '')), '') is not null
     or (select count(*) from auth.identities identity
       where identity.user_id = failed_attempt.auth_user_id and identity.provider = 'email') <> 1
     or not exists (select 1 from participant_identity.user_player_links link
       where link.auth_user_id = failed_attempt.auth_user_id
         and link.player_id = failed_attempt.player_id and link.status = 'ACTIVE') then
    raise exception 'Preview repair aborted: post-repair identity invariants failed.';
  end if;

  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name,
    request_id, safe_metadata
  ) values (
    'PHONE_FAILED_ADMIN_ATTACHMENT_REPAIRED', failed_attempt.tournament_id,
    failed_attempt.auth_user_id, failed_attempt.player_id, 'Step 8B.2A Preview repair',
    failed_attempt.attempt_id::text,
    jsonb_build_object('testCreatedPhoneIdentityRemoved', true, 'authUserDeleted', false,
      'emailPreserved', true, 'playerLinkPreserved', true, 'rawPhoneLogged', false,
      'rawEmailLogged', false, 'otpLogged', false)
  );
end $$;
