begin;

-- Supabase treats the first OTP for an administratively pre-provisioned,
-- unconfirmed user as a signup confirmation. Public signup remains disabled;
-- the already-approved PREPARED candidate must therefore use /resend with the
-- signup verification type. Once the candidate is VERIFIED, ordinary email
-- sign-in uses /otp and the email verification type. Persist that provider
-- contract on the exact attempt so request and verification cannot drift.
alter table participant_identity.participant_auth_otp_attempts
  add column verification_type text;

-- Every earlier Production attempt was made through signInWithOtp. Preserve
-- that historical transport fact before making the new column mandatory.
update participant_identity.participant_auth_otp_attempts
set verification_type = 'email'
where verification_type is null;

alter table participant_identity.participant_auth_otp_attempts
  alter column verification_type set not null;

alter table participant_identity.participant_auth_otp_attempts
  add constraint participant_auth_otp_attempts_verification_type_check
  check (verification_type in ('signup', 'email'));

revoke all on table participant_identity.participant_auth_otp_attempts
  from public, anon, authenticated, service_role;

create or replace function public.authorize_production_auth_candidate_otp_request(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, participant_identity, scoring_authority, auth, extensions, pg_temp
as $$
declare normalized text := lower(btrim(coalesce(input->>'email', '')));
declare client_hash text := lower(btrim(coalesce(input->>'client_request_hash', '')));
declare email_hash text := encode(extensions.digest(normalized::text, 'sha256'::text), 'hex');
declare candidate participant_identity.production_auth_candidates%rowtype;
declare request uuid := extensions.gen_random_uuid();
declare allowed boolean := false;
declare reason text := 'NOT_ELIGIBLE';
declare selected_verification_type text := 'email';
begin
  perform production_control.assert_production_auth_candidate_rpc();
  if client_hash !~ '^[0-9a-f]{64}$' then raise exception 'A hashed request identity is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    least('client:' || client_hash, 'email:' || email_hash), 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    greatest('client:' || client_hash, 'email:' || email_hash), 0
  ));
  if (select count(*) from participant_identity.participant_auth_otp_attempts
      where client_request_hash = client_hash and requested_at > now() - interval '15 minutes') >= 5
    or (select count(*) from participant_identity.participant_auth_otp_attempts
      where email_identity_hash = email_hash and requested_at > now() - interval '15 minutes') >= 3 then
    return jsonb_build_object('ok', true, 'allowed', false, 'requestId', request,
      'email', null, 'authUserId', null, 'playerId', null, 'verificationType', null);
  end if;
  select c.* into candidate from participant_identity.production_auth_candidates c
  join participant_identity.participant_identity_contacts approved_contact
    on approved_contact.tournament_id = c.tournament_id and approved_contact.player_id = c.player_id
  join participant_identity.user_player_links link
    on link.auth_user_id = c.auth_user_id and link.player_id = c.player_id
    and ((c.status = 'PREPARED' and link.status = 'PENDING')
      or (c.status = 'VERIFIED' and link.status = 'ACTIVE'))
  join participant_identity.participant_auth_identifiers identifier
    on identifier.auth_user_id = c.auth_user_id and identifier.player_id = c.player_id
    and identifier.identifier_type = 'EMAIL'
    and identifier.normalized_value_private = approved_contact.email_normalized
    and ((c.status = 'PREPARED' and identifier.status = 'VERIFICATION_PENDING')
      or (c.status = 'VERIFIED' and identifier.status = 'VERIFIED'))
  join auth.users auth_user
    on auth_user.id = c.auth_user_id
    and ((c.status = 'PREPARED' and auth_user.email_confirmed_at is null)
      or (c.status = 'VERIFIED' and auth_user.email_confirmed_at is not null))
  where c.tournament_id = '2026' and c.status in ('PREPARED', 'VERIFIED')
    and approved_contact.identity_active and approved_contact.email_normalized = normalized
  for update of c;
  if found then
    selected_verification_type := case candidate.status
      when 'PREPARED' then 'signup'
      when 'VERIFIED' then 'email'
    end;
    if exists (select 1 from participant_identity.participant_auth_otp_attempts
      where player_id = candidate.player_id and status in ('AUTHORIZED', 'SENT')
        and requested_at > now() - interval '60 seconds') then reason := 'COOLDOWN';
    elsif (select count(*) from participant_identity.participant_auth_otp_attempts
      where player_id = candidate.player_id and requested_at > now() - interval '15 minutes') >= 3
      or (select count(*) from participant_identity.participant_auth_otp_attempts
        where client_request_hash = client_hash and requested_at > now() - interval '15 minutes') >= 5
      then reason := 'RATE_LIMIT';
    else allowed := true; reason := 'APPROVED'; end if;
  end if;
  insert into participant_identity.participant_auth_otp_attempts (
    request_id, tournament_id, player_id, auth_user_id, email_identity_hash,
    client_request_hash, status, safe_reason, verification_type
  ) values (
    request, candidate.tournament_id, candidate.player_id, candidate.auth_user_id,
    email_hash, client_hash, case when allowed then 'AUTHORIZED' else 'REJECTED' end,
    reason, selected_verification_type
  );
  return jsonb_build_object('ok', true, 'allowed', allowed, 'requestId', request,
    'email', case when allowed then normalized else null end,
    'authUserId', case when allowed then candidate.auth_user_id else null end,
    'playerId', case when allowed then candidate.player_id else null end,
    'verificationType', case when allowed then selected_verification_type else null end);
end;
$$;

create or replace function public.authorize_production_auth_candidate_otp_verification(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, participant_identity, auth, extensions, pg_temp
as $$
declare request uuid := nullif(input->>'request_id', '')::uuid;
declare email_hash text := lower(btrim(coalesce(input->>'email_identity_hash', '')));
declare attempt participant_identity.participant_auth_otp_attempts%rowtype;
begin
  perform production_control.assert_production_auth_candidate_rpc();
  select otp.* into attempt
  from participant_identity.participant_auth_otp_attempts otp
  join participant_identity.production_auth_candidates candidate
    on candidate.tournament_id = otp.tournament_id
    and candidate.player_id = otp.player_id
    and candidate.auth_user_id = otp.auth_user_id
    and ((candidate.status = 'PREPARED' and otp.verification_type = 'signup')
      or (candidate.status = 'VERIFIED' and otp.verification_type = 'email'))
  join participant_identity.user_player_links link
    on link.auth_user_id = otp.auth_user_id and link.player_id = otp.player_id
    and ((candidate.status = 'PREPARED' and link.status = 'PENDING')
      or (candidate.status = 'VERIFIED' and link.status = 'ACTIVE'))
  join participant_identity.participant_auth_identifiers identifier
    on identifier.auth_user_id = otp.auth_user_id and identifier.player_id = otp.player_id
    and identifier.identifier_type = 'EMAIL'
    and ((candidate.status = 'PREPARED' and identifier.status = 'VERIFICATION_PENDING')
      or (candidate.status = 'VERIFIED' and identifier.status = 'VERIFIED'))
    and encode(extensions.digest(identifier.normalized_value_private::text, 'sha256'), 'hex') = email_hash
  where otp.request_id = request and otp.status = 'SENT'
    and otp.email_identity_hash = email_hash
    and otp.sent_at > now() - interval '15 minutes';
  if not found then return jsonb_build_object('ok', true, 'allowed', false); end if;
  return jsonb_build_object('ok', true, 'allowed', true, 'authUserId', attempt.auth_user_id,
    'playerId', attempt.player_id, 'tournamentId', attempt.tournament_id,
    'verificationType', attempt.verification_type);
end;
$$;

revoke all on function public.authorize_production_auth_candidate_otp_request(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.authorize_production_auth_candidate_otp_request(jsonb)
  to service_role;

revoke all on function public.authorize_production_auth_candidate_otp_verification(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.authorize_production_auth_candidate_otp_verification(jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
