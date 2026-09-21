-- LOCAL CANDIDATE ONLY. No deployment or feature activation.
-- Reuse existing phone attempts; introduce no tables or retained identifiers.
begin;
alter table participant_identity.participant_auth_identifiers add column approved_phone_revision bigint check (approved_phone_revision > 0);

create or replace function participant_identity.production_phone_runtime_v1()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare scope production_control.resource_scope%rowtype; runtime jsonb;
begin
 perform production_control.assert_production_service_role();
 select * into strict scope from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION';
 runtime := public.read_production_current_tournament_runtime_v1(jsonb_build_object(
 'contract_version','production-current-tournament-runtime-v1','environment','PRODUCTION',
 'project_ref',scope.project_ref,'project_url',scope.project_url,'source_workbook_id',scope.google_workbook_id));
 if runtime->>'ok' is distinct from 'true' or runtime->>'lifecycle' is distinct from 'ACTIVE'
 or coalesce(runtime->>'status','') not in ('FROZEN_2026_RUNTIME','ACTIVE') then
 raise exception 'PRODUCTION_PHONE_RUNTIME_UNAVAILABLE'; end if;
 return runtime;
end;$$;
revoke all on function participant_identity.production_phone_runtime_v1() from public,anon,authenticated,service_role;

create or replace function participant_identity.production_phone_context_v1(user_id uuid, tournament_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare runtime jsonb; context jsonb;
begin
 runtime := participant_identity.production_phone_runtime_v1();
 if tournament_id is distinct from runtime->>'tournamentId' then
 return jsonb_build_object('ok',false,'code','PRODUCTION_AUTH_SCOPE_INVALID'); end if;
 if runtime->>'status'='FROZEN_2026_RUNTIME' and tournament_id='2026' then
 context := public.read_production_participant_context_for_auth(user_id,tournament_id);
 else
 context := public.read_production_future_participant_context_for_auth_v1(user_id,tournament_id);
 end if;
 return context;
end;$$;
revoke all on function participant_identity.production_phone_context_v1(uuid,text) from public,anon,authenticated,service_role;


create or replace function public.authorize_production_participant_phone_login_proof_v1(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, participant_identity, scoring_authority, public, auth
as $$
declare target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
declare requested_player text := btrim(coalesce(input->>'player_id', ''));
declare expected_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare expected_identifier uuid := nullif(input->>'identifier_id', '')::uuid;
declare expected_revision bigint := nullif(input->>'identifier_revision', '')::bigint;
declare link_row participant_identity.user_player_links%rowtype;
declare phone_identifier participant_identity.participant_auth_identifiers%rowtype;
declare email_identifier participant_identity.participant_auth_identifiers%rowtype;
declare auth_user auth.users%rowtype;
declare phone_identity_count integer := 0;
declare email_identity_count integer := 0;
declare auth_phone_user_count integer := 0;
declare scoring_permission_count integer := 0;
declare active_scoring_permission_count integer := 0;
declare scoring_revision_mismatch_count integer := 0;
declare participant_context jsonb;
declare director_entitlement_count integer := 0;
declare director_entitlement_found boolean := false;
declare director_entitlement_state text := 'NONE';
declare director_role text := 'NONE';
declare director_scope text := 'NONE';
declare director_entitlement_revision bigint := 0;
declare director_entitlement_source text := 'NONE';
declare director_entitlement_fingerprint text;
declare expected_director_fingerprint text := lower(btrim(coalesce(input->>'director_entitlement_fingerprint', '')));
declare expected_director_state text := upper(btrim(coalesce(input->>'director_entitlement_state', '')));
declare expected_director_role text := upper(btrim(coalesce(input->>'director_role', '')));
declare expected_director_scope text := upper(btrim(coalesce(input->>'director_scope', '')));
declare expected_director_revision text := btrim(coalesce(input->>'director_entitlement_revision', ''));
declare expected_director_source text := upper(btrim(coalesce(input->>'director_entitlement_source', '')));
declare expected_director_count text := btrim(coalesce(input->>'director_entitlement_count', ''));
begin
  perform participant_identity.production_phone_runtime_v1();
  if target_tournament = '' or requested_player = '' or expected_auth_user is null then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_CONTEXT_INVALID');
  end if;

  if (select count(*) from participant_identity.user_player_links
       where auth_user_id=expected_auth_user and status='ACTIVE') <> 1
     or (select count(*) from participant_identity.participant_auth_identifiers
       where player_id=requested_player and auth_user_id=expected_auth_user
       and identifier_type='PHONE' and status='VERIFIED') <> 1 then
    return jsonb_build_object('ok',true,'allowed',false,'code','PHONE_OTP_AUTH_COLLISION');
  end if;
  select * into link_row from participant_identity.user_player_links
  where player_id = requested_player and auth_user_id = expected_auth_user and status = 'ACTIVE';
  if not found then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_AUTH_MISMATCH');
  end if;
  if not exists (
    select 1 from scoring_authority.tournament_players membership
    where membership.tournament_id = target_tournament
      and membership.player_id = requested_player
      and membership.participation_status = 'ACTIVE'
  ) then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_NOT_ELIGIBLE');
  end if;

  select * into phone_identifier from participant_identity.participant_auth_identifiers identifier
  where identifier.player_id = requested_player
    and identifier.auth_user_id = expected_auth_user
    and identifier.source_tournament_id = target_tournament
    and identifier.identifier_type = 'PHONE' and identifier.status='VERIFIED';
  if not found or phone_identifier.status <> 'VERIFIED'
     or phone_identifier.verification_source is distinct from 'SUPABASE_AUTH_APPROVED_SMS_HOOK'
     or (expected_identifier is not null and phone_identifier.identifier_id <> expected_identifier)
     or (expected_revision is not null and phone_identifier.revision <> expected_revision) then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_NOT_ELIGIBLE');
  end if;
  if not exists (select 1 from participant_identity.player_approved_phones_v1 approval
    where approval.tournament_id=target_tournament and approval.player_id=requested_player
      and approval.status='VERIFIED' and approval.revoked_at is null
      and approval.verified_at is not null
      and approval.phone_e164=phone_identifier.normalized_value_private
      and approval.phone_revision=phone_identifier.approved_phone_revision) then
    return jsonb_build_object('ok',true,'allowed',false,'code','PHONE_APPROVAL_STALE');
  end if;
  select * into email_identifier from participant_identity.participant_auth_identifiers identifier
  where identifier.player_id = requested_player
    and identifier.auth_user_id = expected_auth_user
    and identifier.source_tournament_id = target_tournament
    and identifier.identifier_type = 'EMAIL'
    and identifier.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED');
  select * into auth_user from auth.users where id = expected_auth_user;
  if not found or email_identifier.identifier_id is null
     or lower(btrim(coalesce(auth_user.email, ''))) <> email_identifier.normalized_value_private
     or auth_user.email_confirmed_at is null
     or participant_identity.canonical_auth_phone(nullif(auth_user.phone, ''))
       is distinct from participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)
     or auth_user.phone_confirmed_at is null
     or nullif(btrim(coalesce(auth_user.phone_change, '')), '') is not null then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_AUTH_MISMATCH');
  end if;

  select count(*) into phone_identity_count from auth.identities identity
  where identity.user_id = expected_auth_user and identity.provider = 'phone'
    and coalesce(identity.identity_data->>'sub', expected_auth_user::text) = expected_auth_user::text
    and participant_identity.canonical_auth_phone(identity.identity_data->>'phone')
      = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private);
  select count(*) into email_identity_count from auth.identities identity
  where identity.user_id = expected_auth_user and identity.provider = 'email'
    and coalesce(identity.identity_data->>'sub', expected_auth_user::text) = expected_auth_user::text;
  select count(*) into auth_phone_user_count from auth.users candidate
  where participant_identity.canonical_auth_phone(nullif(candidate.phone, ''))
    = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private);
  if phone_identity_count <> 1 or email_identity_count <> 1 or auth_phone_user_count <> 1
     or exists (
       select 1 from auth.users other_user where other_user.id <> expected_auth_user
         and (participant_identity.canonical_auth_phone(nullif(other_user.phone, ''))
           = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private)
           or participant_identity.canonical_auth_phone(nullif(other_user.phone_change, ''))
           = participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private))
     ) then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_AUTH_COLLISION');
  end if;

  -- Compatibility slots in the existing server-signed PWA proof are not
  -- Director claims. Bind them to canonical participant context instead.
  participant_context := participant_identity.production_phone_context_v1(expected_auth_user,target_tournament);
  if participant_context->>'ok' is distinct from 'true'
     or participant_context#>>'{data,authUserId}' is distinct from expected_auth_user::text
     or participant_context#>>'{data,playerId}' is distinct from requested_player
     or participant_context#>>'{data,tournament,id}' is distinct from target_tournament then
    return jsonb_build_object('ok',true,'allowed',false,'code','PHONE_OTP_AUTH_MISMATCH');
  end if;
  director_entitlement_fingerprint := md5(jsonb_build_object('participant',participant_context,'runtime',participant_identity.production_phone_runtime_v1())::text);

  if input ? 'proof_issued_at' then
    if expected_director_fingerprint !~ '^[0-9a-f]{32}$'
       or expected_director_revision !~ '^[0-9]+$'
       or expected_director_count !~ '^[0-9]+$' then
      return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_LOGIN_PROOF_REQUIRED');
    end if;
    if expected_director_fingerprint <> director_entitlement_fingerprint
       or expected_director_state <> director_entitlement_state
       or expected_director_role <> director_role
       or expected_director_scope <> director_scope
       or expected_director_revision::bigint <> director_entitlement_revision
       or expected_director_source <> director_entitlement_source
       or expected_director_count::integer <> director_entitlement_count then
      return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_LOGIN_DIRECTOR_PARITY_MISMATCH');
    end if;
  end if;

  select count(*), count(*) filter (where permission.can_score and permission.revoked_at is null)
    into scoring_permission_count, active_scoring_permission_count
  from scoring_authority.scoring_permissions permission
  where permission.player_id = requested_player;
  select count(*) into scoring_revision_mismatch_count
  from scoring_authority.scoring_permissions permission
  join scoring_authority.matches match on match.match_id = permission.match_id
  where permission.player_id = requested_player
    and permission.permission_revision <> match.permission_revision;

  return jsonb_build_object(
    'ok', true, 'allowed', true, 'code', 'PHONE_LOGIN_ALLOWED',
    'authUserId', expected_auth_user, 'playerId', requested_player,
    'tournamentId', target_tournament, 'identifierId', phone_identifier.identifier_id,
    'identifierRevision', phone_identifier.revision,
    'phoneE164', phone_identifier.normalized_value_private,
    'maskedMobile', '••• ••• ' || right(participant_identity.canonical_auth_phone(phone_identifier.normalized_value_private), 4),
    'emailPreserved', true, 'phoneConfirmed', true, 'phoneIdentitySameUser', true,
    'activeLink', true, 'membershipActive', true,
    'directorEntitlementState', director_entitlement_state,
    'directorRole', director_role, 'directorScope', director_scope,
    'directorEntitlementRevision', director_entitlement_revision,
    'directorEntitlementSource', director_entitlement_source,
    'directorEntitlementCount', director_entitlement_count,
    'directorEntitlementFingerprint', director_entitlement_fingerprint,
    'directorEntitlementPreserved', true,
    'directorPrivilegeEscalation', false,
    'authMethodChangesDirectorAuthorization', false,
    'phoneIdentifierStatus', phone_identifier.status,
    'phoneVerificationSource', phone_identifier.verification_source,
    'scoringPermissionRows', scoring_permission_count,
    'activeScoringPermissionRows', active_scoring_permission_count,
    'scoringRevisionMismatches', scoring_revision_mismatch_count
  );
end;
$$;

revoke all on function public.authorize_production_participant_phone_login_proof_v1(jsonb) from public,anon,authenticated;
grant execute on function public.authorize_production_participant_phone_login_proof_v1(jsonb) to service_role;

create or replace function public.authorize_production_participant_phone_login_request_v1(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, participant_identity, public
as $$
declare target_phone text := btrim(coalesce(input->>'phone_e164', ''));
declare rollout text := upper(btrim(coalesce(input->>'rollout_mode', 'DESIGNATED')));
declare identifier participant_identity.participant_auth_identifiers%rowtype;
begin
  perform participant_identity.production_phone_runtime_v1();
  if target_phone !~ '^\+[1-9][0-9]{7,14}$'::text collate "C"
     or rollout not in ('DESIGNATED', 'VERIFIED') then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_NOT_ELIGIBLE');
  end if;
  select * into identifier from participant_identity.participant_auth_identifiers current_identifier
  where current_identifier.identifier_type = 'PHONE'
    and current_identifier.normalized_value_private = target_phone
    and current_identifier.status = 'VERIFIED'
    and current_identifier.verification_source = 'SUPABASE_AUTH_APPROVED_SMS_HOOK';
  if not found or (select count(*) from participant_identity.participant_auth_identifiers i where i.identifier_type='PHONE' and i.normalized_value_private=target_phone and i.status='VERIFIED') <> 1 then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_NOT_ELIGIBLE');
  end if;
  if rollout = 'DESIGNATED' and not exists (
    select 1 from participant_identity.participant_auth_rehearsals rehearsal
    where rehearsal.tournament_id = identifier.source_tournament_id
      and rehearsal.player_id = identifier.player_id
      and rehearsal.auth_user_id = identifier.auth_user_id
      and rehearsal.status = 'PREPARED' and rehearsal.shadow_enabled
  ) then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_NOT_ELIGIBLE');
  end if;
  return public.authorize_production_participant_phone_login_proof_v1(jsonb_build_object(
    'tournament_id', participant_identity.production_phone_runtime_v1()->>'tournamentId',
    'player_id', identifier.player_id,
    'auth_user_id', identifier.auth_user_id,
    'identifier_id', identifier.identifier_id,
    'identifier_revision', identifier.revision
  ));
end;
$$;

revoke all on function public.authorize_production_participant_phone_login_request_v1(jsonb) from public,anon,authenticated;
grant execute on function public.authorize_production_participant_phone_login_request_v1(jsonb) to service_role;

create or replace function public.begin_production_participant_phone_public_request_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, participant_identity, public
as $$
declare client_hash text := lower(btrim(coalesce(input->>'client_fingerprint', '')));
declare identifier_hash text := lower(btrim(coalesce(input->>'identifier_fingerprint', '')));
declare recent_client integer := 0;
declare recent_identifier integer := 0;
declare cooldown_seconds integer := 0;
declare allowed_value boolean := false;
begin
  perform participant_identity.production_phone_runtime_v1();
  if client_hash !~ '^[0-9a-f]{64}$' or identifier_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'allowed', false, 'code', 'PHONE_OTP_CONTEXT_INVALID');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('participant-phone-public:' || client_hash, 0));
  delete from participant_identity.participant_auth_public_rate_events
  where occurred_at < now() - interval '30 days';
  select greatest(0, ceil(extract(epoch from ((max(occurred_at) + interval '60 seconds') - now())))::integer)
    into cooldown_seconds
  from participant_identity.participant_auth_public_rate_events
  where outcome = 'REQUEST_ACCEPTED'
    and (client_fingerprint = client_hash or identifier_fingerprint = identifier_hash)
    and occurred_at > now() - interval '60 seconds';
  select count(*) into recent_client
  from participant_identity.participant_auth_public_rate_events
  where client_fingerprint = client_hash and outcome = 'REQUEST_ACCEPTED'
    and occurred_at > now() - interval '1 hour';
  select count(*) into recent_identifier
  from participant_identity.participant_auth_public_rate_events
  where identifier_fingerprint = identifier_hash and outcome = 'REQUEST_ACCEPTED'
    and occurred_at > now() - interval '1 hour';
  allowed_value := cooldown_seconds = 0 and recent_client < 6 and recent_identifier < 3;
  insert into participant_identity.participant_auth_public_rate_events (
    auth_method, client_fingerprint, identifier_fingerprint, outcome
  ) values (
    'PHONE', client_hash, identifier_hash,
    case when allowed_value then 'REQUEST_ACCEPTED' else 'RATE_LIMITED' end
  );
  return jsonb_build_object(
    'ok', true, 'allowed', allowed_value,
    'code', case when allowed_value then 'PHONE_LOGIN_PUBLIC_REQUEST_ALLOWED'
      when cooldown_seconds > 0 then 'PHONE_OTP_COOLDOWN' else 'PHONE_OTP_RATE_LIMITED' end,
    'retryAfterSeconds', cooldown_seconds,
    'limits', jsonb_build_object('cooldownSeconds', 60, 'identifierPerHour', 3, 'clientPerHour', 6)
  );
end;
$$;

revoke all on function public.begin_production_participant_phone_public_request_v1(jsonb) from public,anon,authenticated;
grant execute on function public.begin_production_participant_phone_public_request_v1(jsonb) to service_role;

create or replace function public.begin_production_participant_phone_login_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, participant_identity, public, auth
as $$
declare client_hash text := lower(btrim(coalesce(input->>'client_fingerprint', '')));
declare proof_issued_at timestamptz := nullif(input->>'proof_issued_at', '')::timestamptz;
declare proof jsonb;
declare new_attempt uuid := gen_random_uuid();
declare identifier_key uuid;
declare auth_user_key uuid;
declare recent_identifier integer := 0;
declare recent_client integer := 0;
declare cooldown_seconds integer := 0;
declare limit_code text;
begin
  perform participant_identity.production_phone_runtime_v1();
  if client_hash !~ '^[0-9a-f]{64}$' or proof_issued_at is null
     or proof_issued_at < now() - interval '11 minutes'
     or proof_issued_at > now() + interval '30 seconds' then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_LOGIN_PROOF_REQUIRED');
  end if;
  proof := public.authorize_production_participant_phone_login_proof_v1(input);
  if coalesce((proof->>'allowed')::boolean, false) is not true then return proof; end if;
  identifier_key := (proof->>'identifierId')::uuid;
  auth_user_key := (proof->>'authUserId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('participant-phone-login:' || identifier_key::text, 0));

  if exists (
    select 1 from participant_identity.participant_phone_otp_attempts attempt
    where attempt.identifier_id = identifier_key and attempt.requested_at >= proof_issued_at
      and attempt.safe_reason like 'PHONE_LOGIN_%'
  ) then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_LOGIN_PROOF_USED');
  end if;
  select greatest(0, ceil(extract(epoch from ((max(requested_at) + interval '60 seconds') - now())))::integer)
    into cooldown_seconds
  from participant_identity.participant_phone_otp_attempts attempt
  where attempt.identifier_id = identifier_key and attempt.safe_reason like 'PHONE_LOGIN_%'
    and attempt.requested_at > now() - interval '60 seconds';
  select count(*) into recent_identifier
  from participant_identity.participant_phone_otp_attempts attempt
  where attempt.identifier_id = identifier_key and attempt.safe_reason like 'PHONE_LOGIN_%'
    and attempt.requested_at > now() - interval '1 hour';
  select count(*) into recent_client
  from participant_identity.participant_phone_otp_attempts attempt
  where attempt.client_fingerprint = client_hash and attempt.safe_reason like 'PHONE_LOGIN_%'
    and attempt.requested_at > now() - interval '1 hour';
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
      new_attempt, proof->>'tournamentId', identifier_key, (proof->>'identifierRevision')::bigint,
      proof->>'playerId', auth_user_key, auth_user_key, client_hash, 'RATE_LIMITED',
      'PHONE_LOGIN_' || limit_code
    );
    return jsonb_build_object('ok', true, 'allowed', false, 'code', limit_code,
      'attemptId', new_attempt, 'retryAfterSeconds', cooldown_seconds);
  end if;
  if exists (
    select 1 from participant_identity.participant_phone_otp_attempts attempt
    where attempt.identifier_id = identifier_key and attempt.status in ('REQUESTING', 'SENT')
  ) then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_STALE');
  end if;

  insert into participant_identity.participant_phone_otp_attempts (
    attempt_id, tournament_id, identifier_id, identifier_revision, player_id,
    auth_user_id, requested_by_auth_user_id, client_fingerprint, status, safe_reason
  ) values (
    new_attempt, proof->>'tournamentId', identifier_key, (proof->>'identifierRevision')::bigint,
    proof->>'playerId', auth_user_key, auth_user_key, client_hash,
    'REQUESTING', 'PHONE_LOGIN_PREFLIGHT_PASSED'
  );
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name,
    request_id, safe_metadata
  ) values (
    'PHONE_LOGIN_REQUESTED', proof->>'tournamentId', auth_user_key, proof->>'playerId',
    proof->>'playerId', 'Controlled signed-out participant', new_attempt::text,
    jsonb_build_object('method', 'SIGNED_OUT_PHONE_LOGIN', 'shouldCreateUser', false,
      'phoneStatus', 'VERIFIED',
      'rawPhoneLogged', false, 'otpLogged', false)
  );
  return proof || jsonb_build_object('ok', true, 'allowed', true,
    'code', 'PHONE_LOGIN_PREFLIGHT_PASSED', 'attemptId', new_attempt,
    'expiresAt', now() + interval '10 minutes');
end;
$$;

revoke all on function public.begin_production_participant_phone_login_v1(jsonb) from public,anon,authenticated;
grant execute on function public.begin_production_participant_phone_login_v1(jsonb) to service_role;

create or replace function public.record_production_participant_phone_login_send_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, participant_identity, public
as $$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare expected_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare succeeded boolean := coalesce((input->>'succeeded')::boolean, false);
declare provider_called_value boolean := coalesce((input->>'provider_called')::boolean, false);
declare reason_value text := upper(btrim(coalesce(input->>'safe_reason', 'PHONE_LOGIN_SEND_FAILED')));
declare duration_value integer := greatest(0, coalesce((input->>'duration_ms')::integer, 0));
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare proof jsonb;
begin
  perform participant_identity.production_phone_runtime_v1();
  select * into attempt from participant_identity.participant_phone_otp_attempts current_attempt
  where current_attempt.attempt_id = target_attempt
    and current_attempt.auth_user_id = expected_auth_user
    and current_attempt.status = 'REQUESTING'
    and current_attempt.safe_reason = 'PHONE_LOGIN_PREFLIGHT_PASSED' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE'); end if;
  proof := public.authorize_production_participant_phone_login_proof_v1(input);
  if succeeded and (coalesce((proof->>'allowed')::boolean, false) is not true or not provider_called_value) then
    succeeded := false;
    reason_value := coalesce(proof->>'code', 'PHONE_LOGIN_SEND_FAILED');
  end if;
  if reason_value !~ '^[A-Z0-9_]+$' then reason_value := 'PHONE_LOGIN_SEND_FAILED'; end if;
  if (succeeded and attempt.provider_send_state is distinct from 'SENT') or (not succeeded and attempt.provider_send_state is distinct from 'FAILED') then return jsonb_build_object('ok',false,'code','PHONE_OTP_PROVIDER_UNAVAILABLE'); end if;
  update participant_identity.participant_phone_otp_attempts set
    status = case when succeeded then 'SENT' else 'SEND_FAILED' end,
    safe_reason = case when succeeded then 'PHONE_LOGIN_CODE_SENT' else reason_value end,
    provider_called = provider_called_value,
    provider_requested_at = case when provider_called_value then now() else null end,
    sent_at = case when succeeded then now() else null end,
    request_duration_ms = duration_value, updated_at = now()
  where attempt_id = target_attempt;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name,
    request_id, safe_metadata
  ) values (
    case when succeeded then 'PHONE_LOGIN_CODE_SENT' else 'PHONE_LOGIN_SEND_FAILED' end,
    attempt.tournament_id, attempt.auth_user_id, attempt.player_id, attempt.player_id,
    'Controlled signed-out participant', attempt.attempt_id::text,
    jsonb_build_object('method', 'SIGNED_OUT_PHONE_LOGIN', 'shouldCreateUser', false,
      'providerCalled', provider_called_value, 'safeReason', case when succeeded then 'PHONE_LOGIN_CODE_SENT' else reason_value end,
      'durationMs', duration_value, 'ownershipMutated', false,
      'rawPhoneLogged', false, 'otpLogged', false)
  );
  return jsonb_build_object('ok', succeeded,
    'code', case when succeeded then 'PHONE_LOGIN_VERIFICATION_PENDING' else reason_value end,
    'status', case when succeeded then 'VERIFICATION_PENDING' else 'SEND_FAILED' end,
    'expiresAt', attempt.expires_at);
end;
$$;

revoke all on function public.record_production_participant_phone_login_send_v1(jsonb) from public,anon,authenticated;
grant execute on function public.record_production_participant_phone_login_send_v1(jsonb) to service_role;

create or replace function public.read_production_participant_phone_login_state_v1(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, participant_identity, public
as $$
declare proof_issued_at timestamptz := nullif(input->>'proof_issued_at', '')::timestamptz;
declare proof jsonb;
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
begin
  perform participant_identity.production_phone_runtime_v1();
  proof := public.authorize_production_participant_phone_login_proof_v1(input);
  if coalesce((proof->>'allowed')::boolean, false) is not true then return proof; end if;
  select * into attempt from participant_identity.participant_phone_otp_attempts current_attempt
  where current_attempt.identifier_id = (proof->>'identifierId')::uuid
    and current_attempt.requested_at >= proof_issued_at
    and current_attempt.safe_reason like 'PHONE_LOGIN_%'
  order by current_attempt.requested_at desc limit 1;
  if attempt.attempt_id is null then
    return proof || jsonb_build_object('status', 'READY', 'proofUsed', false);
  end if;
  if attempt.status = 'SENT' and attempt.expires_at > now() then
    return proof || jsonb_build_object('status', 'VERIFICATION_PENDING', 'proofUsed', true,
      'attemptId', attempt.attempt_id, 'expiresAt', attempt.expires_at,
      'resendCooldownSeconds', greatest(0, ceil(extract(epoch from ((attempt.requested_at + interval '60 seconds') - now())))::integer));
  end if;
  return proof || jsonb_build_object('status', attempt.status, 'proofUsed', true);
end;
$$;

revoke all on function public.read_production_participant_phone_login_state_v1(jsonb) from public,anon,authenticated;
grant execute on function public.read_production_participant_phone_login_state_v1(jsonb) to service_role;

create or replace function public.authorize_production_participant_phone_login_verification_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, participant_identity, public
as $$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare expected_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare proof jsonb;
begin
  perform participant_identity.production_phone_runtime_v1();
  perform participant_identity.production_phone_assert_attempt_v1(target_attempt);
  select * into attempt from participant_identity.participant_phone_otp_attempts current_attempt
  where current_attempt.attempt_id = target_attempt
    and current_attempt.auth_user_id = expected_auth_user for update;
  if not found then return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_INVALID_OR_EXPIRED'); end if;
  if attempt.status = 'VERIFIED' then return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_REPLAY'); end if;
  if attempt.status <> 'SENT' or attempt.safe_reason <> 'PHONE_LOGIN_CODE_SENT'
     or not attempt.provider_called or attempt.expires_at <= now() then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_INVALID_OR_EXPIRED');
  end if;
  proof := public.authorize_production_participant_phone_login_proof_v1(input);
  if coalesce((proof->>'allowed')::boolean, false) is not true then return proof; end if;
  if attempt.identifier_id <> (proof->>'identifierId')::uuid
     or attempt.identifier_revision <> (proof->>'identifierRevision')::bigint
     or attempt.player_id <> proof->>'playerId'
     or attempt.tournament_id <> proof->>'tournamentId' then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_STALE');
  end if;
  if attempt.provider_send_state is distinct from 'SENT' or attempt.provider_verify_claimed_at is not null or attempt.provider_confirmed_at is not null then return jsonb_build_object('ok',true,'allowed',false,'code','PHONE_OTP_STALE'); end if;
  update participant_identity.participant_phone_otp_attempts set provider_verify_claimed_at=clock_timestamp() where attempt_id=target_attempt;
  return proof || jsonb_build_object('ok', true, 'allowed', true,
    'code', 'PHONE_LOGIN_VERIFY_ALLOWED', 'attemptId', attempt.attempt_id,
    'expiresAt', attempt.expires_at);
end;
$$;

revoke all on function public.authorize_production_participant_phone_login_verification_v1(jsonb) from public,anon,authenticated;
grant execute on function public.authorize_production_participant_phone_login_verification_v1(jsonb) to service_role;

create or replace function public.record_production_participant_phone_login_failure_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, participant_identity, public
as $$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare expected_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare reason_value text := upper(btrim(coalesce(input->>'safe_reason', 'PHONE_LOGIN_VERIFY_FAILED')));
declare duration_value integer := greatest(0, coalesce((input->>'duration_ms')::integer, 0));
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare next_failures integer;
declare next_status text;
begin
  perform participant_identity.production_phone_runtime_v1();
  if reason_value !~ '^[A-Z0-9_]+$' then reason_value := 'PHONE_LOGIN_VERIFY_FAILED'; end if;
  select * into attempt from participant_identity.participant_phone_otp_attempts current_attempt
  where current_attempt.attempt_id = target_attempt
    and current_attempt.auth_user_id = expected_auth_user for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE'); end if;
  if attempt.status = 'VERIFIED' then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_REPLAY'); end if;
  if attempt.status <> 'SENT' or attempt.safe_reason <> 'PHONE_LOGIN_CODE_SENT' then
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE');
  end if;
  if attempt.provider_confirmed_at is not null or input->>'conclusive_invalid_code' is distinct from 'true' then return jsonb_build_object('ok',false,'code','PHONE_OTP_PROVIDER_UNAVAILABLE'); end if;
  update participant_identity.participant_phone_otp_attempts set provider_verify_claimed_at=null where attempt_id=target_attempt;
  next_failures := least(5, attempt.verify_failure_count + case when reason_value = 'PHONE_OTP_PROVIDER_UNAVAILABLE' then 0 else 1 end);
  next_status := case
    when reason_value = 'PHONE_OTP_AUTH_MISMATCH' then 'UUID_MISMATCH'
    when reason_value in ('PHONE_LOGIN_SESSION_FAILED', 'PHONE_LOGIN_PASSPORT_MISSING') then 'CANCELLED'
    when attempt.expires_at <= now() then 'EXPIRED'
    when next_failures >= 5 then 'VERIFY_LOCKED'
    else 'SENT'
  end;
  update participant_identity.participant_phone_otp_attempts set
    status = next_status, safe_reason = case when next_status = 'SENT' then 'PHONE_LOGIN_CODE_SENT' else reason_value end,
    verify_failure_count = next_failures, verification_duration_ms = duration_value, updated_at = now()
  where attempt_id = target_attempt;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name,
    request_id, safe_metadata
  ) values (
    case when reason_value = 'PHONE_OTP_AUTH_MISMATCH' then 'PHONE_LOGIN_UUID_MISMATCH' else 'PHONE_LOGIN_VERIFY_FAILED' end,
    attempt.tournament_id, attempt.auth_user_id, attempt.player_id, attempt.player_id,
    'Controlled signed-out participant', attempt.attempt_id::text,
    jsonb_build_object('safeReason', reason_value, 'attemptStatus', next_status,
      'verifyFailureCount', next_failures, 'unexpectedSessionTerminated', reason_value = 'PHONE_OTP_AUTH_MISMATCH',
      'ownershipMutated', false, 'rawPhoneLogged', false, 'otpLogged', false)
  );
  return jsonb_build_object('ok', true, 'status', next_status, 'verifyFailureCount', next_failures);
end;
$$;

revoke all on function public.record_production_participant_phone_login_failure_v1(jsonb) from public,anon,authenticated;
grant execute on function public.record_production_participant_phone_login_failure_v1(jsonb) to service_role;

create or replace function public.complete_production_participant_phone_login_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, participant_identity, scoring_authority, public
as $$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare expected_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare returned_auth_user uuid := nullif(input->>'returned_auth_user_id', '')::uuid;
declare session_created boolean := coalesce((input->>'session_created')::boolean, false);
declare refresh_available boolean := coalesce((input->>'refresh_session_available')::boolean, false);
declare duration_value integer := greatest(0, coalesce((input->>'duration_ms')::integer, 0));
declare attempt participant_identity.participant_phone_otp_attempts%rowtype;
declare proof jsonb;
begin
  perform participant_identity.production_phone_runtime_v1();
  -- Same lock order as enrollment/Director invalidation: approval, then attempt.
  -- A revocation committed while verification was remote must be observed here.
  perform 1 from participant_identity.player_approved_phones_v1 p
  join participant_identity.participant_phone_otp_attempts a
    on a.tournament_id=p.tournament_id and a.player_id=p.player_id
  where a.attempt_id=target_attempt and a.auth_user_id=expected_auth_user
  for share of p;
  select * into attempt from participant_identity.participant_phone_otp_attempts current_attempt
  where current_attempt.attempt_id = target_attempt
    and current_attempt.auth_user_id = expected_auth_user for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE'); end if;
  if attempt.status = 'VERIFIED' then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_REPLAY'); end if;
  if attempt.status <> 'SENT' or attempt.safe_reason <> 'PHONE_LOGIN_CODE_SENT'
     or attempt.expires_at <= clock_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE');
  end if;
  if attempt.provider_verify_claimed_at is null or attempt.provider_confirmed_at is null then return jsonb_build_object('ok',false,'code','PHONE_OTP_PROVIDER_UNAVAILABLE'); end if;
  if returned_auth_user is null or returned_auth_user <> expected_auth_user then
    update participant_identity.participant_phone_otp_attempts set
      status = 'UUID_MISMATCH', safe_reason = 'PHONE_OTP_AUTH_MISMATCH', updated_at = now()
    where attempt_id = target_attempt;
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_AUTH_MISMATCH');
  end if;
  if not session_created or not refresh_available then
    return jsonb_build_object('ok', false, 'code', 'PHONE_LOGIN_SESSION_FAILED');
  end if;
  proof := public.authorize_production_participant_phone_login_proof_v1(input);
  if coalesce((proof->>'allowed')::boolean, false) is not true then return proof; end if;
  if attempt.identifier_id <> (proof->>'identifierId')::uuid
     or attempt.identifier_revision <> (proof->>'identifierRevision')::bigint
     or attempt.player_id <> proof->>'playerId'
     or attempt.tournament_id <> proof->>'tournamentId' then
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_STALE');
  end if;
  update participant_identity.participant_phone_otp_attempts set
    status = 'VERIFIED', safe_reason = 'SAME_AUTH_USER_PHONE_LOGIN_VERIFIED',
    verification_duration_ms = duration_value, verified_at = now(), used_at = now(), updated_at = now()
  where attempt_id = target_attempt and status = 'SENT';
  if not found then return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_REPLAY'); end if;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_id, actor_name,
    request_id, safe_metadata
  ) values (
    'PHONE_LOGIN_VERIFIED', attempt.tournament_id, attempt.auth_user_id,
    attempt.player_id, attempt.player_id, 'Controlled signed-out participant', attempt.attempt_id::text,
    jsonb_build_object('method', 'SIGNED_OUT_PHONE_LOGIN', 'verifyType', 'sms',
      'returnedAuthUserMatch', true, 'sessionEstablished', true,
      'refreshSessionAvailable', true, 'playerIdUnchanged', true,
      'phoneIdentifierUnchanged', true, 'scoringAuthorizationUnchanged', true,
      'directorEntitlementPreserved', true,
      'newDirectorEntitlements', 0, 'directorPrivilegeEscalation', false,
      'authMethodChangesDirectorAuthorization', false,
      'rawPhoneLogged', false, 'otpLogged', false)
  );
  return proof || jsonb_build_object('ok', true, 'status', 'VERIFIED',
    'sameAuthUser', true, 'sessionEstablished', true, 'refreshSessionAvailable', true,
    'playerIdUnchanged', true, 'phoneIdentifierUnchanged', true,
    'scoringAuthorizationUnchanged', true, 'directorEntitlementPreserved', true,
    'newDirectorEntitlements', 0, 'directorPrivilegeEscalation', false,
    'authMethodChangesDirectorAuthorization', false);
end;
$$;

revoke all on function public.complete_production_participant_phone_login_v1(jsonb) from public,anon,authenticated;
grant execute on function public.complete_production_participant_phone_login_v1(jsonb) to service_role;

create or replace function public.cancel_production_participant_phone_login_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, participant_identity, public
as $$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare expected_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare changed integer := 0;
begin
  perform participant_identity.production_phone_runtime_v1();
  if target_attempt is null or expected_auth_user is null then
    return jsonb_build_object('ok', false, 'code', 'PHONE_OTP_CONTEXT_INVALID');
  end if;
  update participant_identity.participant_phone_otp_attempts set
    status = 'CANCELLED', safe_reason = 'PARTICIPANT_CHANGED_AUTH_METHOD', updated_at = now()
  where attempt_id = target_attempt and auth_user_id = expected_auth_user
    and status in ('REQUESTING', 'SENT');
  get diagnostics changed = row_count;
  return jsonb_build_object('ok', true, 'cancelled', changed = 1);
end;
$$;

revoke all on function public.cancel_production_participant_phone_login_v1(jsonb) from public,anon,authenticated;
grant execute on function public.cancel_production_participant_phone_login_v1(jsonb) to service_role;

commit;
