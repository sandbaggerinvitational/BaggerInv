begin;

-- The original Production candidate request function declared a PL/pgSQL
-- record named `contact` and also used `contact` as a SQL table alias. In
-- PL/pgSQL that makes qualified references such as contact.tournament_id
-- ambiguous (SQLSTATE 42702), so eligibility failed before any provider
-- handoff. Keep the certified request/rate-limit contract intact and
-- use unambiguous names for the record and table alias.
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
begin
  perform production_control.assert_production_auth_candidate_rpc();
  if client_hash !~ '^[0-9a-f]{64}$' then raise exception 'A hashed request identity is required.'; end if;
  -- Serialize both dimensions in a deterministic order before count+insert.
  -- This makes the durable limits concurrency-safe without disclosing whether
  -- the email belongs to an approved Production participant.
  perform pg_advisory_xact_lock(hashtextextended(
    least('client:' || client_hash, 'email:' || email_hash), 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    greatest('client:' || client_hash, 'email:' || email_hash), 0
  ));
  -- Bound rejected/unknown identifiers before inserting another audit row.
  if (select count(*) from participant_identity.participant_auth_otp_attempts
      where client_request_hash = client_hash and requested_at > now() - interval '15 minutes') >= 5
    or (select count(*) from participant_identity.participant_auth_otp_attempts
      where email_identity_hash = email_hash and requested_at > now() - interval '15 minutes') >= 3 then
    return jsonb_build_object('ok', true, 'allowed', false, 'requestId', request,
      'email', null, 'authUserId', null, 'playerId', null);
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
  where c.tournament_id = '2026' and c.status in ('PREPARED', 'VERIFIED')
    and approved_contact.identity_active and approved_contact.email_normalized = normalized
  for update of c;
  if found then
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
    client_request_hash, status, safe_reason
  ) values (
    request, candidate.tournament_id, candidate.player_id, candidate.auth_user_id,
    email_hash, client_hash, case when allowed then 'AUTHORIZED' else 'REJECTED' end, reason
  );
  return jsonb_build_object('ok', true, 'allowed', allowed, 'requestId', request,
    'email', case when allowed then normalized else null end,
    'authUserId', case when allowed then candidate.auth_user_id else null end,
    'playerId', case when allowed then candidate.player_id else null end);
end;
$$;

revoke all on function public.authorize_production_auth_candidate_otp_request(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.authorize_production_auth_candidate_otp_request(jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
