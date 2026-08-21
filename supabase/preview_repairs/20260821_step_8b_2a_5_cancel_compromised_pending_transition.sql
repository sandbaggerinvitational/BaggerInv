-- Step 8B.2A.5 Preview-only cancellation of the compromised real phone-change
-- OTP. Supabase exposes no supported Admin API to revoke a pending phone-change
-- code, so this transaction clears only the exact unverified phone_change
-- residue after proving Auth A, email, identifier, and Player-link invariants.

do $$
declare
  target_attempt participant_identity.participant_phone_otp_attempts%rowtype;
  phone_identifier participant_identity.participant_auth_identifiers%rowtype;
  email_identifier participant_identity.participant_auth_identifiers%rowtype;
  target_user auth.users%rowtype;
begin
  select * into strict target_attempt
  from participant_identity.participant_phone_otp_attempts attempt
  where attempt.player_id = 'CB01'
  order by attempt.requested_at desc
  limit 1;

  if target_attempt.status <> 'SEND_FAILED'
     or target_attempt.safe_reason <> 'PHONE_OTP_AUTH_MISMATCH'
     or not target_attempt.provider_called
     or target_attempt.sent_at is not null
     or target_attempt.verify_failure_count <> 0
     or target_attempt.verified_at is not null
     or target_attempt.used_at is not null then
    raise exception 'Preview cancellation aborted: latest attempt is not the audited compromised Stage B send.';
  end if;

  select * into strict phone_identifier
  from participant_identity.participant_auth_identifiers identifier
  where identifier.identifier_id = target_attempt.identifier_id
    and identifier.identifier_type = 'PHONE'
    and identifier.status = 'ELIGIBLE'
    and identifier.verified_at is null
    and identifier.auth_user_id = target_attempt.auth_user_id
    and identifier.player_id = target_attempt.player_id
    and identifier.revision = target_attempt.identifier_revision
  for update;

  select * into strict email_identifier
  from participant_identity.participant_auth_identifiers identifier
  where identifier.player_id = target_attempt.player_id
    and identifier.auth_user_id = target_attempt.auth_user_id
    and identifier.identifier_type = 'EMAIL'
    and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');

  select * into strict target_user from auth.users
  where id = target_attempt.auth_user_id for update;

  if (select count(*) from auth.users) <> 1
     or target_user.email_confirmed_at is null
     or lower(btrim(coalesce(target_user.email, ''))) <> email_identifier.normalized_value_private
     or nullif(btrim(coalesce(target_user.phone, '')), '') is not null
     or target_user.phone_confirmed_at is not null
     or participant_identity.canonical_auth_phone(nullif(target_user.phone_change, ''))
       is distinct from participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)
     or target_user.phone_change_sent_at is null
     or nullif(btrim(coalesce(target_user.phone_change_token, '')), '') is null
     or (select count(*) from auth.identities identity
       where identity.user_id = target_attempt.auth_user_id and identity.provider = 'phone') <> 0
     or (select count(*) from auth.identities identity
       where identity.user_id = target_attempt.auth_user_id and identity.provider = 'email') <> 1
     or (select count(*) from participant_identity.user_player_links link
       where link.auth_user_id = target_attempt.auth_user_id
         and link.player_id = target_attempt.player_id and link.status = 'ACTIVE') <> 1
     or exists (select 1 from auth.users other_user
       where other_user.id <> target_attempt.auth_user_id
         and (participant_identity.canonical_auth_phone(nullif(other_user.phone, ''))
           = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)
           or participant_identity.canonical_auth_phone(nullif(other_user.phone_change, ''))
           = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)))
     or exists (select 1 from participant_identity.participant_phone_otp_attempts attempt
       where attempt.auth_user_id = target_attempt.auth_user_id
         and attempt.status in ('REQUESTING', 'SENT')) then
    raise exception 'Preview cancellation aborted: Auth, email, identity, link, or attempt state changed.';
  end if;

  update auth.users
  set phone_change = '', phone_change_token = '', phone_change_sent_at = null, updated_at = now()
  where id = target_attempt.auth_user_id
    and nullif(btrim(coalesce(phone, '')), '') is null
    and phone_confirmed_at is null
    and participant_identity.canonical_auth_phone(nullif(phone_change, ''))
      = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)
    and phone_change_sent_at is not null
    and nullif(btrim(coalesce(phone_change_token, '')), '') is not null;
  if not found then raise exception 'Preview cancellation aborted: pending Auth phone change changed concurrently.'; end if;

  update participant_identity.participant_phone_otp_attempts
  set status = 'CANCELLED', safe_reason = 'COMPROMISED_OTP_SCREENSHOT', updated_at = now()
  where attempt_id = target_attempt.attempt_id
    and status = 'SEND_FAILED' and safe_reason = 'PHONE_OTP_AUTH_MISMATCH'
    and provider_called and sent_at is null and verify_failure_count = 0
    and verified_at is null and used_at is null;
  if not found then raise exception 'Preview cancellation aborted: compromised attempt changed concurrently.'; end if;

  if nullif(btrim(coalesce((select phone from auth.users where id = target_attempt.auth_user_id), '')), '') is not null
     or (select phone_confirmed_at from auth.users where id = target_attempt.auth_user_id) is not null
     or nullif(btrim(coalesce((select phone_change from auth.users where id = target_attempt.auth_user_id), '')), '') is not null
     or (select phone_change_sent_at from auth.users where id = target_attempt.auth_user_id) is not null
     or nullif(btrim(coalesce((select phone_change_token from auth.users where id = target_attempt.auth_user_id), '')), '') is not null
     or exists (select 1 from auth.identities identity where identity.user_id = target_attempt.auth_user_id and identity.provider = 'phone')
     or (select count(*) from auth.identities identity where identity.user_id = target_attempt.auth_user_id and identity.provider = 'email') <> 1
     or not exists (select 1 from participant_identity.user_player_links link where link.auth_user_id = target_attempt.auth_user_id and link.player_id = target_attempt.player_id and link.status = 'ACTIVE')
     or (select status from participant_identity.participant_auth_identifiers where identifier_id = target_attempt.identifier_id) <> 'ELIGIBLE'
     or exists (select 1 from participant_identity.participant_phone_otp_attempts attempt where attempt.auth_user_id = target_attempt.auth_user_id and attempt.status in ('REQUESTING', 'SENT')) then
    raise exception 'Preview cancellation aborted: post-cancellation identity invariants failed.';
  end if;

  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, request_id, safe_metadata
  ) values (
    'PHONE_COMPROMISED_ENROLLMENT_CANCELLED', target_attempt.tournament_id,
    target_attempt.auth_user_id, target_attempt.player_id,
    'Step 8B.2A.5 Preview cancellation', target_attempt.attempt_id::text,
    jsonb_build_object(
      'repairMethod', 'NARROW_AUTH_SQL_NO_SUPPORTED_CANCEL_API',
      'failureStage', 'AFTER_UPDATE_USER_BEFORE_VERIFY_OTP',
      'failedPredicate', 'IMMEDIATE_AUTH_USERS_PHONE_CHANGE_NOT_YET_VISIBLE',
      'authUserIdChanged', false, 'emailPreserved', true,
      'playerLinkPreserved', true, 'phoneIdentifierStatus', 'ELIGIBLE',
      'rawPhoneLogged', false, 'rawEmailLogged', false, 'otpLogged', false,
      'smsSentByRepair', false
    )
  );
end $$;

with latest as (
  select attempt.* from participant_identity.participant_phone_otp_attempts attempt
  where attempt.player_id = 'CB01' order by attempt.requested_at desc limit 1
)
select jsonb_build_object(
  'authPhone', case when nullif(btrim(coalesce(auth_user.phone, '')), '') is null then 'EMPTY' else 'VALUE' end,
  'phoneConfirmedAt', case when auth_user.phone_confirmed_at is null then 'EMPTY' else 'PRESENT' end,
  'phoneChange', case when nullif(btrim(coalesce(auth_user.phone_change, '')), '') is null then 'EMPTY' else 'VALUE' end,
  'phoneChangeSentAt', case when auth_user.phone_change_sent_at is null then 'EMPTY' else 'PRESENT' end,
  'phoneChangeToken', case when nullif(btrim(coalesce(auth_user.phone_change_token, '')), '') is null then 'EMPTY' else 'PRESENT' end,
  'latestAttemptStatus', latest.status,
  'latestAttemptReason', latest.safe_reason,
  'activeAttempts', (select count(*) from participant_identity.participant_phone_otp_attempts attempt where attempt.auth_user_id=latest.auth_user_id and attempt.status in ('REQUESTING','SENT')),
  'authUserCount', (select count(*) from auth.users),
  'phoneIdentityCount', (select count(*) from auth.identities identity where identity.user_id=latest.auth_user_id and identity.provider='phone'),
  'emailConfirmed', auth_user.email_confirmed_at is not null,
  'activePlayerLinkCount', (select count(*) from participant_identity.user_player_links link where link.auth_user_id=latest.auth_user_id and link.player_id=latest.player_id and link.status='ACTIVE'),
  'phoneIdentifierStatus', (select status from participant_identity.participant_auth_identifiers identifier where identifier.identifier_id=latest.identifier_id),
  'smsSentByRepair', false
) as repair_result
from latest join auth.users auth_user on auth_user.id=latest.auth_user_id;
