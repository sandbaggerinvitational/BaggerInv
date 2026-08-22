-- Step 8B.3: final Preview participant SMS sign-in boundary.
--
-- This forward migration generalizes the already-proven same-user phone-login
-- authorization from one rehearsal record to any current VERIFIED phone that
-- satisfies the exact Auth user, Player link, tournament membership, provider
-- identity, collision, scoring, and Director-entitlement invariants. Runtime
-- feature flags still keep Production hard-disabled and initially restrict
-- Preview delivery to the designated rehearsal identity.

create table if not exists participant_identity.participant_auth_public_rate_events (
  event_id uuid primary key default gen_random_uuid(),
  auth_method text not null check (auth_method in ('PHONE')),
  client_fingerprint text not null check (client_fingerprint ~ '^[0-9a-f]{64}$'),
  identifier_fingerprint text not null check (identifier_fingerprint ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in ('REQUEST_ACCEPTED', 'RATE_LIMITED')),
  occurred_at timestamptz not null default now()
);

create index if not exists participant_auth_public_rate_client_idx
  on participant_identity.participant_auth_public_rate_events(client_fingerprint, occurred_at desc);
create index if not exists participant_auth_public_rate_identifier_idx
  on participant_identity.participant_auth_public_rate_events(identifier_fingerprint, occurred_at desc);

alter table participant_identity.participant_auth_public_rate_events enable row level security;
revoke all on participant_identity.participant_auth_public_rate_events from public, anon, authenticated;
grant select, insert, delete on participant_identity.participant_auth_public_rate_events to service_role;

create or replace function public.authorize_participant_phone_login_proof(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = participant_identity, scoring_authority, public, auth, pg_temp
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
declare director_entitlement participant_identity.preview_director_entitlements%rowtype;
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
  if target_tournament = '' or requested_player = '' or expected_auth_user is null then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_CONTEXT_INVALID');
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
    and identifier.identifier_type = 'PHONE';
  if not found or phone_identifier.status <> 'VERIFIED'
     or phone_identifier.verification_source is distinct from 'SUPABASE_AUTH_TWILIO_VERIFY'
     or (expected_identifier is not null and phone_identifier.identifier_id <> expected_identifier)
     or (expected_revision is not null and phone_identifier.revision <> expected_revision) then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_NOT_ELIGIBLE');
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

  select count(*) into director_entitlement_count
  from participant_identity.preview_director_entitlements entitlement
  where entitlement.auth_user_id = expected_auth_user;
  select * into director_entitlement
  from participant_identity.preview_director_entitlements entitlement
  where entitlement.auth_user_id = expected_auth_user
    and entitlement.tournament_id = target_tournament;
  director_entitlement_found := found;
  if director_entitlement_found then
    director_entitlement_state := director_entitlement.status;
    director_role := case when director_entitlement.status = 'ACTIVE' then 'DIRECTOR' else 'NONE' end;
    director_scope := 'TOURNAMENT:' || upper(director_entitlement.tournament_id)
      || ':PLAYER:' || upper(director_entitlement.director_player_id);
    director_entitlement_revision := director_entitlement.entitlement_revision;
    director_entitlement_source := director_entitlement.bootstrap_source;
  end if;
  director_entitlement_fingerprint := md5(concat_ws('|', expected_auth_user::text,
    director_entitlement_count::text, director_entitlement_state, director_role,
    director_scope, director_entitlement_revision::text, director_entitlement_source));

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

create or replace function public.authorize_participant_phone_login_request(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = participant_identity, public, pg_temp
as $$
declare target_phone text := btrim(coalesce(input->>'phone_e164', ''));
declare rollout text := upper(btrim(coalesce(input->>'rollout_mode', 'DESIGNATED')));
declare identifier participant_identity.participant_auth_identifiers%rowtype;
begin
  if target_phone !~ '^\+[1-9][0-9]{7,14}$'::text collate "C"
     or rollout not in ('DESIGNATED', 'VERIFIED') then
    return jsonb_build_object('ok', true, 'allowed', false, 'code', 'PHONE_OTP_NOT_ELIGIBLE');
  end if;
  select * into identifier from participant_identity.participant_auth_identifiers current_identifier
  where current_identifier.identifier_type = 'PHONE'
    and current_identifier.normalized_value_private = target_phone
    and current_identifier.status = 'VERIFIED'
    and current_identifier.verification_source = 'SUPABASE_AUTH_TWILIO_VERIFY';
  if not found then
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
  return public.authorize_participant_phone_login_proof(jsonb_build_object(
    'tournament_id', identifier.source_tournament_id,
    'player_id', identifier.player_id,
    'auth_user_id', identifier.auth_user_id,
    'identifier_id', identifier.identifier_id,
    'identifier_revision', identifier.revision
  ));
end;
$$;

create or replace function public.begin_participant_phone_public_request(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, pg_temp
as $$
declare client_hash text := lower(btrim(coalesce(input->>'client_fingerprint', '')));
declare identifier_hash text := lower(btrim(coalesce(input->>'identifier_fingerprint', '')));
declare recent_client integer := 0;
declare recent_identifier integer := 0;
declare cooldown_seconds integer := 0;
declare allowed_value boolean := false;
begin
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

create or replace function public.cancel_participant_phone_login(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, pg_temp
as $$
declare target_attempt uuid := nullif(input->>'attempt_id', '')::uuid;
declare expected_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare changed integer := 0;
begin
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

create or replace function public.read_participant_sms_rollout_readiness(target_tournament_id text default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = participant_identity, scoring_authority, public, auth, pg_temp
as $$
declare target_tournament text := nullif(btrim(coalesce(target_tournament_id, '')), '');
begin
  return jsonb_build_object(
    'eligibleParticipants', (select count(*) from scoring_authority.tournament_players p
      where p.participation_status = 'ACTIVE' and (target_tournament is null or p.tournament_id = target_tournament)),
    'phoneConfigured', (select count(*) from participant_identity.participant_auth_identifiers i
      where i.identifier_type = 'PHONE' and i.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
        and (target_tournament is null or i.source_tournament_id = target_tournament)),
    'phoneVerified', (select count(*) from participant_identity.participant_auth_identifiers i
      where i.identifier_type = 'PHONE' and i.status = 'VERIFIED'
        and (target_tournament is null or i.source_tournament_id = target_tournament)),
    'phoneUnverified', (select count(*) from participant_identity.participant_auth_identifiers i
      where i.identifier_type = 'PHONE' and i.status in ('ELIGIBLE', 'VERIFICATION_PENDING')
        and (target_tournament is null or i.source_tournament_id = target_tournament)),
    'phoneMissing', (select count(*) from scoring_authority.tournament_players p
      where p.participation_status = 'ACTIVE' and (target_tournament is null or p.tournament_id = target_tournament)
        and not exists (select 1 from participant_identity.participant_auth_identifiers i
          where i.player_id = p.player_id and i.identifier_type = 'PHONE'
            and i.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED'))),
    'phoneRevoked', (select count(*) from participant_identity.participant_auth_identifiers i
      where i.identifier_type = 'PHONE' and i.status = 'REVOKED'
        and (target_tournament is null or i.source_tournament_id = target_tournament)),
    'duplicates', (select count(*) from (select normalized_value_private
      from participant_identity.participant_auth_identifiers i where i.identifier_type = 'PHONE'
        and i.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
        and (target_tournament is null or i.source_tournament_id = target_tournament)
      group by normalized_value_private having count(*) > 1) duplicate),
    'authMismatch', (select count(*) from participant_identity.participant_auth_identifiers i
      left join participant_identity.user_player_links link
        on link.player_id = i.player_id and link.status = 'ACTIVE'
      left join auth.users auth_user on auth_user.id = i.auth_user_id
      where i.identifier_type = 'PHONE' and i.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
        and (target_tournament is null or i.source_tournament_id = target_tournament)
        and (link.auth_user_id is distinct from i.auth_user_id
          or (i.status = 'VERIFIED' and (auth_user.phone_confirmed_at is null
            or participant_identity.canonical_auth_phone(nullif(auth_user.phone, ''))
              is distinct from participant_identity.canonical_auth_phone(i.normalized_value_private)))))
  );
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.authorize_participant_phone_login_request(jsonb)',
    'public.begin_participant_phone_public_request(jsonb)',
    'public.cancel_participant_phone_login(jsonb)',
    'public.read_participant_sms_rollout_readiness(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
