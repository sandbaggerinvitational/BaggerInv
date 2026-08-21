-- Step 8B.2A.2 Preview-only repair for the second failed controlled phone test.
--
-- Supabase Auth does not expose a supported Admin API operation that clears an
-- existing user's primary phone value. This one-time transaction therefore
-- changes auth-owned rows only after proving that the unconfirmed phone and
-- phone identity were created by the latest failed Preview attempt. It never
-- prints PII, changes the Auth UUID/email/Player link, creates a user, marks a
-- phone verified, or calls an SMS provider.

do $$
declare
  target_attempt participant_identity.participant_phone_otp_attempts%rowtype;
  phone_identifier participant_identity.participant_auth_identifiers%rowtype;
  email_identifier participant_identity.participant_auth_identifiers%rowtype;
  target_user auth.users%rowtype;
  target_phone_identity auth.identities%rowtype;
  matched_count integer;
begin
  select * into strict target_attempt
  from participant_identity.participant_phone_otp_attempts attempt
  where attempt.player_id = 'CB01'
  order by attempt.requested_at desc
  limit 1;

  if target_attempt.status <> 'SEND_FAILED'
     or target_attempt.safe_reason <> 'PHONE_OTP_AUTH_MISMATCH'
     or target_attempt.provider_called
     or target_attempt.auth_phone_attached
     or target_attempt.verified_at is not null
     or target_attempt.used_at is not null
     or target_attempt.expires_at > now() then
    raise exception 'Preview repair aborted: latest failed attempt is not inert test residue.';
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

  select * into strict target_user
  from auth.users
  where id = target_attempt.auth_user_id
  for update;

  if (select count(*) from auth.users) <> 1
     or target_user.email_confirmed_at is null
     or lower(btrim(coalesce(target_user.email, ''))) <> email_identifier.normalized_value_private
     or target_user.phone_confirmed_at is not null
     or participant_identity.canonical_auth_phone(target_user.phone)
       <> participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)
     or nullif(btrim(coalesce(target_user.phone_change, '')), '') is not null
     or target_user.phone_change_sent_at is not null
     or nullif(btrim(coalesce(target_user.phone_change_token, '')), '') is not null
     or (select count(*) from participant_identity.user_player_links link
       where link.auth_user_id = target_attempt.auth_user_id
         and link.player_id = target_attempt.player_id
         and link.status = 'ACTIVE') <> 1
     or exists (select 1 from auth.users other_user
       where other_user.id <> target_attempt.auth_user_id
         and (participant_identity.canonical_auth_phone(nullif(other_user.phone, ''))
           = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)
           or participant_identity.canonical_auth_phone(nullif(other_user.phone_change, ''))
           = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)))
     or exists (select 1 from participant_identity.participant_phone_otp_attempts attempt
       where attempt.auth_user_id = target_attempt.auth_user_id
         and attempt.status in ('REQUESTING', 'SENT')
         and attempt.expires_at > now()) then
    raise exception 'Preview repair aborted: Auth, email, Player link, or OTP invariants changed.';
  end if;

  select count(*) into matched_count
  from auth.identities identity
  where identity.user_id = target_attempt.auth_user_id
    and identity.provider = 'phone'
    and identity.created_at between target_attempt.requested_at - interval '30 seconds'
      and target_attempt.updated_at + interval '30 seconds'
    and participant_identity.canonical_auth_phone(identity.identity_data->>'phone')
      = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private);

  if matched_count <> 1
     or (select count(*) from auth.identities identity
       where identity.user_id = target_attempt.auth_user_id and identity.provider = 'phone') <> 1
     or (select count(*) from auth.identities identity
       where identity.user_id = target_attempt.auth_user_id and identity.provider = 'email') <> 1 then
    raise exception 'Preview repair aborted: test-created phone identity was not uniquely proven.';
  end if;

  select * into strict target_phone_identity
  from auth.identities identity
  where identity.user_id = target_attempt.auth_user_id
    and identity.provider = 'phone'
    and identity.created_at between target_attempt.requested_at - interval '30 seconds'
      and target_attempt.updated_at + interval '30 seconds'
    and participant_identity.canonical_auth_phone(identity.identity_data->>'phone')
      = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)
  for update;

  delete from auth.identities
  where id = target_phone_identity.id
    and user_id = target_attempt.auth_user_id
    and provider = 'phone';
  if not found then
    raise exception 'Preview repair aborted: phone identity changed concurrently.';
  end if;

  update auth.users
  set phone = null,
      phone_confirmed_at = null,
      phone_change = '',
      phone_change_token = '',
      phone_change_sent_at = null,
      updated_at = now()
  where id = target_attempt.auth_user_id
    and phone_confirmed_at is null
    and participant_identity.canonical_auth_phone(phone)
      = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)
    and nullif(btrim(coalesce(phone_change, '')), '') is null
    and phone_change_sent_at is null
    and nullif(btrim(coalesce(phone_change_token, '')), '') is null;
  if not found then
    raise exception 'Preview repair aborted: Auth phone changed concurrently.';
  end if;

  update participant_identity.participant_phone_otp_attempts
  set status = 'CANCELLED',
      safe_reason = 'PREVIEW_AUTH_PHONE_RESIDUE_REPAIRED',
      updated_at = now()
  where attempt_id = target_attempt.attempt_id
    and status = 'SEND_FAILED'
    and safe_reason = 'PHONE_OTP_AUTH_MISMATCH'
    and not provider_called
    and verified_at is null
    and used_at is null;
  if not found then
    raise exception 'Preview repair aborted: failed attempt changed concurrently.';
  end if;

  if nullif(btrim(coalesce((select phone from auth.users where id = target_attempt.auth_user_id), '')), '') is not null
     or (select phone_confirmed_at from auth.users where id = target_attempt.auth_user_id) is not null
     or nullif(btrim(coalesce((select phone_change from auth.users where id = target_attempt.auth_user_id), '')), '') is not null
     or (select phone_change_sent_at from auth.users where id = target_attempt.auth_user_id) is not null
     or nullif(btrim(coalesce((select phone_change_token from auth.users where id = target_attempt.auth_user_id), '')), '') is not null
     or exists (select 1 from auth.identities identity
       where identity.user_id = target_attempt.auth_user_id and identity.provider = 'phone')
     or (select count(*) from auth.identities identity
       where identity.user_id = target_attempt.auth_user_id and identity.provider = 'email') <> 1
     or not exists (select 1 from participant_identity.user_player_links link
       where link.auth_user_id = target_attempt.auth_user_id
         and link.player_id = target_attempt.player_id and link.status = 'ACTIVE')
     or (select status from participant_identity.participant_auth_identifiers
       where identifier_id = target_attempt.identifier_id) <> 'ELIGIBLE'
     or exists (select 1 from participant_identity.participant_phone_otp_attempts attempt
       where attempt.auth_user_id = target_attempt.auth_user_id
         and attempt.status in ('REQUESTING', 'SENT') and attempt.expires_at > now()) then
    raise exception 'Preview repair aborted: post-repair identity invariants failed.';
  end if;

  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name,
    request_id, safe_metadata
  ) values (
    'PHONE_RESIDUAL_UNCONFIRMED_STATE_REPAIRED', target_attempt.tournament_id,
    target_attempt.auth_user_id, target_attempt.player_id,
    'Step 8B.2A.2 Preview repair', target_attempt.attempt_id::text,
    jsonb_build_object(
      'repairMethod', 'NARROW_AUTH_SQL_NO_SUPPORTED_CLEAR_API',
      'testCreatedPhoneIdentityRemoved', true,
      'staleAttemptCancelled', true,
      'authUserDeleted', false,
      'authUserIdChanged', false,
      'emailPreserved', true,
      'playerLinkPreserved', true,
      'phoneIdentifierStatus', 'ELIGIBLE',
      'rawPhoneLogged', false,
      'rawEmailLogged', false,
      'otpLogged', false,
      'smsSent', false
    )
  );
end $$;

-- PII-safe post-repair evidence for the SQL Editor result grid.
with latest_attempt as (
  select attempt.*
  from participant_identity.participant_phone_otp_attempts attempt
  where attempt.player_id = 'CB01'
  order by attempt.requested_at desc
  limit 1
), target as (
  select attempt.*, identifier.status as phone_identifier_status
  from latest_attempt attempt
  join participant_identity.participant_auth_identifiers identifier
    on identifier.identifier_id = attempt.identifier_id
)
select jsonb_build_object(
  'authPhone', case when nullif(btrim(coalesce(auth_user.phone, '')), '') is null then 'EMPTY' else 'OTHER' end,
  'phoneConfirmedAt', case when auth_user.phone_confirmed_at is null then 'EMPTY' else 'PRESENT' end,
  'phoneChange', case when nullif(btrim(coalesce(auth_user.phone_change, '')), '') is null then 'EMPTY' else 'OTHER' end,
  'phoneChangeSentAt', case when auth_user.phone_change_sent_at is null then 'EMPTY' else 'PRESENT' end,
  'phoneChangeTokenCurrent', case when nullif(btrim(coalesce(auth_user.phone_change_token, '')), '') is null then 'EMPTY' else 'PRESENT' end,
  'phoneIdentifierStatus', target.phone_identifier_status,
  'latestAttemptStatus', target.status,
  'latestAttemptReason', target.safe_reason,
  'activeAttempts', (select count(*) from participant_identity.participant_phone_otp_attempts attempt
    where attempt.auth_user_id = target.auth_user_id
      and attempt.status in ('REQUESTING', 'SENT') and attempt.expires_at > now()),
  'authUserCount', (select count(*) from auth.users),
  'phoneIdentityCount', (select count(*) from auth.identities identity
    where identity.user_id = target.auth_user_id and identity.provider = 'phone'),
  'emailIdentityCount', (select count(*) from auth.identities identity
    where identity.user_id = target.auth_user_id and identity.provider = 'email'),
  'emailConfirmed', auth_user.email_confirmed_at is not null,
  'activePlayerLinkCount', (select count(*) from participant_identity.user_player_links link
    where link.auth_user_id = target.auth_user_id
      and link.player_id = target.player_id and link.status = 'ACTIVE'),
  'smsSent', false
) as repair_result
from target
join auth.users auth_user on auth_user.id = target.auth_user_id;
