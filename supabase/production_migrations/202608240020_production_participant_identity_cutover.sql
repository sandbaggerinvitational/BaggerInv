-- Dormant, controlled Production participant identity cutover contract.
--
-- Applying this migration creates no Auth users and changes no authority. The
-- live resource_scope remains Passport until the explicit, service-role-only
-- activation RPC is called against the staged release. Unknown identifiers
-- can never produce an enrollment claim or an Auth Admin operation.
begin;

create table participant_identity.production_participant_enrollment_claims (
  claim_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null default '2026' check (tournament_id = '2026'),
  player_id text not null references scoring_authority.players(player_id) on delete restrict,
  email_identity_hash text not null check (email_identity_hash ~ '^[0-9a-f]{64}$'),
  client_request_hash text not null check (client_request_hash ~ '^[0-9a-f]{64}$'),
  source_configuration_revision bigint not null check (source_configuration_revision > 0),
  auth_user_id uuid references auth.users(id) on delete restrict,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'CONSUMED', 'CANCELLED', 'CLEANUP_REQUIRED')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  cancelled_at timestamptz,
  cleanup_reason text check (cleanup_reason is null or cleanup_reason in (
    'AUTH_USER_PROVISIONING_FAILED', 'AUTH_USER_DELETE_CONFIRMED',
    'AUTH_USER_DELETE_FAILED'
  )),
  updated_at timestamptz not null default now(),
  check (
    (status = 'PENDING' and auth_user_id is null and consumed_at is null and cancelled_at is null)
    or (status = 'CONSUMED' and auth_user_id is not null and consumed_at is not null and cancelled_at is null)
    or (status = 'CANCELLED' and consumed_at is null and cancelled_at is not null)
    or (status = 'CLEANUP_REQUIRED' and auth_user_id is not null and consumed_at is null)
  )
);

create unique index production_participant_one_open_email_claim_idx
  on participant_identity.production_participant_enrollment_claims(email_identity_hash)
  where status = 'PENDING';
create index production_participant_enrollment_player_idx
  on participant_identity.production_participant_enrollment_claims(player_id, created_at desc);

alter table participant_identity.production_participant_enrollment_claims enable row level security;
revoke all on table participant_identity.production_participant_enrollment_claims
  from public, anon, authenticated, service_role;

create or replace function production_control.assert_production_participant_identity_cutover()
returns production_control.resource_scope
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, participant_identity, auth, pg_temp
as $$
declare resource production_control.resource_scope%rowtype;
declare activation production_control.cutover_activation_state%rowtype;
begin
  perform production_control.assert_production_service_role();
  select * into strict resource from production_control.resource_scope
    where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict activation from production_control.cutover_activation_state
    where scope_key = 'BAGGER_INV_PRODUCTION';
  if resource.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or resource.project_url <> 'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or resource.google_workbook_id <> '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or resource.vercel_project <> 'bagger-inv'
     or resource.canonical_domain <> 'https://baggerinv.com'
     or resource.current_tournament_id <> '2026'
     or resource.current_tournament_year <> 2026
     or resource.participant_identity_authority <> 'SUPABASE'
     or not resource.auth_user_creation_enabled
     or activation.state = 'DORMANT'
     or activation.expected_deployment_commit is null then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PARTICIPANT_IDENTITY_CUTOVER_INACTIVE';
  end if;
  return resource;
end;
$$;
revoke all on function production_control.assert_production_participant_identity_cutover()
  from public, anon, authenticated, service_role;

create or replace function public.activate_production_participant_identity(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, scoring_authority, auth, extensions, pg_temp
as $$
declare resource production_control.resource_scope%rowtype;
declare activation production_control.cutover_activation_state%rowtype;
declare existing jsonb;
declare response_value jsonb;
declare active_roster_count integer;
declare approved_contact_count integer;
declare distinct_email_count integer;
declare expected_revision bigint;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  existing := production_control.lookup_cutover_receipt('ACTIVATE_PARTICIPANT_IDENTITY', input);
  if existing is not null then return existing; end if;
  if input->>'contract_version' is distinct from 'production-participant-identity-cutover-v1'
     or upper(coalesce(input->>'phase', '')) <> 'IDENTITY'
     or coalesce(input->>'actor_id', '') = '' then
    raise exception using errcode = '42501', message = 'PRODUCTION_IDENTITY_ACTIVATION_SCOPE_REQUIRED';
  end if;
  expected_revision := coalesce((input->>'expected_activation_revision')::bigint, -1);
  select * into strict activation from production_control.cutover_activation_state
    where scope_key = 'BAGGER_INV_PRODUCTION' for update;
  -- The activation-row lock serializes a concurrent replay. Re-check the
  -- receipt after acquiring it so the second caller returns the first result.
  existing := production_control.lookup_cutover_receipt('ACTIVATE_PARTICIPANT_IDENTITY', input);
  if existing is not null then return existing; end if;
  select * into strict resource from production_control.resource_scope
    where scope_key = 'BAGGER_INV_PRODUCTION' for update;
  if activation.activation_revision <> expected_revision
     or activation.state = 'DORMANT'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or resource.scoring_authority <> 'GOOGLE'
     or resource.scoring_ingress_enabled then
    raise exception using errcode = '42501', message = 'PRODUCTION_IDENTITY_ACTIVATION_STATE_MISMATCH';
  end if;
  if resource.participant_identity_authority = 'SUPABASE' and resource.auth_user_creation_enabled then
    response_value := jsonb_build_object('ok', true, 'authority', 'SUPABASE',
      'authUserCreationEnabled', true,
      'activationRevision', activation.activation_revision, 'idempotent', true);
    perform production_control.store_cutover_receipt(
      'ACTIVATE_PARTICIPANT_IDENTITY', input, response_value);
    return response_value;
  end if;
  if resource.participant_identity_authority <> 'PASSPORT' or resource.auth_user_creation_enabled then
    raise exception using errcode = '42501', message = 'PRODUCTION_IDENTITY_ACTIVATION_DRIFT';
  end if;

  select count(*) into active_roster_count from scoring_authority.tournament_players
    where tournament_id = '2026' and participation_status = 'ACTIVE';
  select count(*), count(distinct lower(contact.email_normalized))
    into approved_contact_count, distinct_email_count
  from participant_identity.participant_identity_contacts contact
  join scoring_authority.tournament_players membership
    on membership.tournament_id = contact.tournament_id and membership.player_id = contact.player_id
    and membership.participation_status = 'ACTIVE'
  join participant_identity.identity_context_revisions current_revision
    on current_revision.tournament_id = contact.tournament_id
    and current_revision.context_revision = contact.configuration_revision
  join participant_identity.identity_config_import_runs import_run
    on import_run.tournament_id = contact.tournament_id
    and import_run.configuration_revision = contact.configuration_revision
    and import_run.source_fingerprint = current_revision.configuration_fingerprint
    and import_run.status = 'APPROVED' and import_run.approved_at is not null
  where contact.tournament_id = '2026' and contact.identity_active
    and contact.source_workbook_id = resource.google_workbook_id
    and split_part(contact.email_normalized, '@', 2)
      !~* '(^|\.)(example\.(com|net|org)|invalid|test|localhost)$';
  if active_roster_count < 1 or approved_contact_count <> active_roster_count
     or distinct_email_count <> active_roster_count then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_IDENTITY_COMPLETE_APPROVED_ROSTER_REQUIRED';
  end if;

  update production_control.resource_scope set
    participant_identity_authority = 'SUPABASE', auth_user_creation_enabled = true,
    updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION';
  update production_control.cutover_activation_state set
    activation_revision = activation_revision + 1,
    updated_by = left(input->>'actor_id', 160), updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_PARTICIPANT_IDENTITY_ACTIVATED', 'PARTICIPANT_IDENTITY', '2026',
    left(input->>'actor_id', 160), lower(input->>'request_fingerprint'), 'SUCCEEDED',
    jsonb_build_object('authority', 'SUPABASE', 'approvedParticipants', approved_contact_count,
      'authUserCreationEnabled', true, 'scoringAuthorityChanged', false,
      'activationRevision', activation.activation_revision,
      'cutoverState', activation.state)
  );
  response_value := jsonb_build_object('ok', true, 'authority', 'SUPABASE',
    'approvedParticipants', approved_contact_count,
    'authUserCreationEnabled', true,
    'activationRevision', activation.activation_revision, 'idempotent', false);
  perform production_control.store_cutover_receipt(
    'ACTIVATE_PARTICIPANT_IDENTITY', input, response_value);
  return response_value;
end;
$$;

create or replace function public.rollback_production_participant_identity(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, pg_temp
as $$
declare resource production_control.resource_scope%rowtype;
declare activation production_control.cutover_activation_state%rowtype;
declare existing jsonb;
declare response_value jsonb;
declare expected_revision bigint;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  existing := production_control.lookup_cutover_receipt('ROLLBACK_PARTICIPANT_IDENTITY', input);
  if existing is not null then return existing; end if;
  if input->>'contract_version' is distinct from 'production-participant-identity-cutover-v1'
     or input->>'operation' is distinct from 'ROLLBACK_PARTICIPANT_IDENTITY'
     or coalesce(input->>'actor_id', '') = '' then
    raise exception using errcode = '42501', message = 'PRODUCTION_IDENTITY_ROLLBACK_SCOPE_REQUIRED';
  end if;
  expected_revision := coalesce((input->>'expected_activation_revision')::bigint, -1);
  select * into strict activation from production_control.cutover_activation_state
    where scope_key = 'BAGGER_INV_PRODUCTION' for update;
  existing := production_control.lookup_cutover_receipt('ROLLBACK_PARTICIPANT_IDENTITY', input);
  if existing is not null then return existing; end if;
  select * into strict resource from production_control.resource_scope
    where scope_key = 'BAGGER_INV_PRODUCTION' for update;
  if activation.activation_revision <> expected_revision
     or activation.state = 'DORMANT'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit' then
    raise exception using errcode = '42501', message = 'PRODUCTION_IDENTITY_ROLLBACK_STATE_MISMATCH';
  end if;
  if resource.participant_identity_authority = 'PASSPORT' and not resource.auth_user_creation_enabled then
    response_value := jsonb_build_object('ok', true, 'authority', 'PASSPORT',
      'authUserCreationEnabled', false,
      'activationRevision', activation.activation_revision, 'idempotent', true);
    perform production_control.store_cutover_receipt(
      'ROLLBACK_PARTICIPANT_IDENTITY', input, response_value);
    return response_value;
  end if;
  if resource.participant_identity_authority <> 'SUPABASE'
     or not resource.auth_user_creation_enabled then
    raise exception using errcode = '42501', message = 'PRODUCTION_IDENTITY_ROLLBACK_DRIFT';
  end if;
  update production_control.resource_scope set
    participant_identity_authority = 'PASSPORT', auth_user_creation_enabled = false,
    updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION';
  update production_control.cutover_activation_state set
    activation_revision = activation_revision + 1,
    updated_by = left(input->>'actor_id', 160), updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_PARTICIPANT_IDENTITY_ROLLED_BACK', 'PARTICIPANT_IDENTITY', '2026',
    left(input->>'actor_id', 160), lower(input->>'request_fingerprint'), 'SUCCEEDED',
    jsonb_build_object('authority', 'PASSPORT', 'authUserCreationEnabled', false,
      'authUsersDeleted', 0, 'auditPreserved', true,
      'activationRevision', activation.activation_revision,
      'cutoverState', activation.state)
  );
  response_value := jsonb_build_object('ok', true, 'authority', 'PASSPORT',
    'authUserCreationEnabled', false,
    'activationRevision', activation.activation_revision, 'idempotent', false);
  perform production_control.store_cutover_receipt(
    'ROLLBACK_PARTICIPANT_IDENTITY', input, response_value);
  return response_value;
end;
$$;

create or replace function public.authorize_production_participant_otp_request(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, scoring_authority, auth, extensions, pg_temp
as $$
declare resource production_control.resource_scope%rowtype;
declare normalized text := lower(btrim(coalesce(input->>'email', '')));
declare client_hash text := lower(btrim(coalesce(input->>'client_request_hash', '')));
declare email_hash text := encode(extensions.digest(normalized::text, 'sha256'), 'hex');
declare contact participant_identity.participant_identity_contacts%rowtype;
declare link participant_identity.user_player_links%rowtype;
declare identifier participant_identity.participant_auth_identifiers%rowtype;
declare auth_user auth.users%rowtype;
declare claim participant_identity.production_participant_enrollment_claims%rowtype;
declare request uuid := extensions.gen_random_uuid();
declare selected_type text := 'email';
declare reason text := 'NOT_ELIGIBLE';
begin
  resource := production_control.assert_production_participant_identity_cutover();
  if client_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'PRODUCTION_AUTH_HASHED_REQUEST_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(least('client:' || client_hash, 'email:' || email_hash), 0));
  perform pg_advisory_xact_lock(hashtextextended(greatest('client:' || client_hash, 'email:' || email_hash), 0));
  if (select count(*) from participant_identity.participant_auth_otp_attempts
      where client_request_hash = client_hash and requested_at > now() - interval '15 minutes') >= 5
     or (select count(*) from participant_identity.participant_auth_otp_attempts
      where email_identity_hash = email_hash and requested_at > now() - interval '15 minutes') >= 3 then
    return jsonb_build_object('ok', true, 'allowed', false, 'requestId', request,
      'email', null, 'playerId', null, 'provisioningRequired', false);
  end if;

  select approved.* into contact
  from participant_identity.participant_identity_contacts approved
  join scoring_authority.tournament_players membership
    on membership.tournament_id = approved.tournament_id and membership.player_id = approved.player_id
    and membership.participation_status = 'ACTIVE'
  join participant_identity.identity_context_revisions current_revision
    on current_revision.tournament_id = approved.tournament_id
    and current_revision.context_revision = approved.configuration_revision
  join participant_identity.identity_config_import_runs import_run
    on import_run.tournament_id = approved.tournament_id
    and import_run.configuration_revision = approved.configuration_revision
    and import_run.source_fingerprint = current_revision.configuration_fingerprint
    and import_run.status = 'APPROVED' and import_run.approved_at is not null
  where approved.tournament_id = '2026' and approved.identity_active
    and approved.source_workbook_id = resource.google_workbook_id
    and approved.email_normalized = normalized
    and split_part(approved.email_normalized, '@', 2)
      !~* '(^|\.)(example\.(com|net|org)|invalid|test|localhost)$';

  if found then
    select * into link from participant_identity.user_player_links
      where player_id = contact.player_id and status in ('PENDING', 'ACTIVE', 'SUSPENDED') for update;
    if found then
      select * into identifier from participant_identity.participant_auth_identifiers
        where player_id = contact.player_id and auth_user_id = link.auth_user_id
          and identifier_type = 'EMAIL'
          and status in ('VERIFICATION_PENDING', 'VERIFIED') for update;
      select * into auth_user from auth.users where id = link.auth_user_id;
      if not found or identifier.normalized_value_private is distinct from normalized
         or lower(btrim(coalesce(auth_user.email, ''))) is distinct from normalized
         or auth_user.raw_app_meta_data->>'player_id' is distinct from contact.player_id
         or auth_user.raw_app_meta_data->>'tournament_id' is distinct from '2026'
         or auth_user.raw_app_meta_data->>'provisioning_scope' not in (
           'production_controlled_first_login', 'production_shadow_director_certification'
         ) then
        contact := null;
      elsif link.status = 'ACTIVE' and identifier.status = 'VERIFIED'
        and auth_user.email_confirmed_at is not null then
        selected_type := 'email'; reason := 'APPROVED';
      elsif link.status = 'PENDING' and identifier.status = 'VERIFICATION_PENDING'
        and auth_user.email_confirmed_at is null then
        selected_type := 'signup'; reason := 'APPROVED';
      else
        contact := null;
      end if;
    else
      -- A pre-existing Auth email or a link/identifier owned by another Player
      -- is a collision, never an invitation to attach by display name/email.
      if exists (select 1 from auth.users where lower(btrim(coalesce(email, ''))) = normalized)
         or exists (select 1 from participant_identity.user_player_links
           where auth_user_id in (select id from auth.users where lower(btrim(coalesce(email, ''))) = normalized))
         or exists (select 1 from participant_identity.participant_auth_identifiers
           where normalized_value_private = normalized and status in ('ELIGIBLE','VERIFICATION_PENDING','VERIFIED')) then
        contact := null;
      else
        select * into claim from participant_identity.production_participant_enrollment_claims
          where email_identity_hash = email_hash and status = 'PENDING' for update;
        if found and (claim.player_id <> contact.player_id
          or claim.source_configuration_revision <> contact.configuration_revision) then
          raise exception using errcode = '42501', message = 'PRODUCTION_PARTICIPANT_ENROLLMENT_CLAIM_COLLISION';
        end if;
        if not found then
          insert into participant_identity.production_participant_enrollment_claims (
            tournament_id, player_id, email_identity_hash, client_request_hash,
            source_configuration_revision
          ) values ('2026', contact.player_id, email_hash, client_hash, contact.configuration_revision)
          returning * into claim;
          insert into participant_identity.identity_audit_events (
            event_type, tournament_id, player_id, actor_name, request_id, safe_metadata
          ) values (
            'PRODUCTION_PARTICIPANT_FIRST_LOGIN_CLAIMED', '2026', contact.player_id,
            'production-controlled-first-login', claim.claim_id::text,
            jsonb_build_object('rawIdentifierStoredInAudit', false, 'authUserCreated', false)
          );
        elsif claim.expires_at <= now() then
          update participant_identity.production_participant_enrollment_claims set
            expires_at = now() + interval '10 minutes', client_request_hash = client_hash, updated_at = now()
          where claim_id = claim.claim_id returning * into claim;
        end if;
        return jsonb_build_object('ok', true, 'allowed', false,
          'provisioningRequired', true, 'claimId', claim.claim_id,
          'email', normalized, 'playerId', contact.player_id,
          'recoveryAuthUserId', null);
      end if;
    end if;
  end if;

  if contact is null or reason <> 'APPROVED' then
    insert into participant_identity.participant_auth_otp_attempts (
      request_id, email_identity_hash, client_request_hash, status, safe_reason, verification_type
    ) values (request, email_hash, client_hash, 'REJECTED', 'NOT_ELIGIBLE', 'email');
    return jsonb_build_object('ok', true, 'allowed', false, 'requestId', request,
      'email', null, 'authUserId', null, 'playerId', null,
      'verificationType', null, 'provisioningRequired', false);
  end if;

  if exists (select 1 from participant_identity.participant_auth_otp_attempts
    where player_id = contact.player_id and status in ('AUTHORIZED','SENT')
      and requested_at > now() - interval '60 seconds') then
    reason := 'COOLDOWN';
  end if;
  insert into participant_identity.participant_auth_otp_attempts (
    request_id, tournament_id, player_id, auth_user_id, email_identity_hash,
    client_request_hash, status, safe_reason, verification_type
  ) values (
    request, '2026', contact.player_id, link.auth_user_id, email_hash, client_hash,
    case when reason = 'APPROVED' then 'AUTHORIZED' else 'REJECTED' end,
    reason, selected_type
  );
  return jsonb_build_object('ok', true, 'allowed', reason = 'APPROVED',
    'requestId', request, 'email', case when reason = 'APPROVED' then normalized else null end,
    'authUserId', case when reason = 'APPROVED' then link.auth_user_id else null end,
    'playerId', case when reason = 'APPROVED' then contact.player_id else null end,
    'verificationType', case when reason = 'APPROVED' then selected_type else null end,
    'provisioningRequired', false);
end;
$$;

create or replace function public.complete_production_participant_first_login(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, scoring_authority, auth, extensions, pg_temp
as $$
declare resource production_control.resource_scope%rowtype;
declare claim participant_identity.production_participant_enrollment_claims%rowtype;
declare auth_user auth.users%rowtype;
declare target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare contact participant_identity.participant_identity_contacts%rowtype;
begin
  resource := production_control.assert_production_participant_identity_cutover();
  select * into claim from participant_identity.production_participant_enrollment_claims
    where claim_id = nullif(input->>'claim_id', '')::uuid for update;
  if not found or claim.tournament_id <> '2026' or target_user is null then
    raise exception using errcode = '42501', message = 'PRODUCTION_PARTICIPANT_ENROLLMENT_CLAIM_REQUIRED';
  end if;
  if claim.status = 'CONSUMED' then
    if claim.auth_user_id <> target_user or not exists (
      select 1 from participant_identity.user_player_links
      where auth_user_id = target_user and player_id = claim.player_id and status = 'PENDING'
    ) then raise exception using errcode = '42501', message = 'PRODUCTION_PARTICIPANT_ENROLLMENT_DRIFT'; end if;
    return jsonb_build_object('ok', true, 'playerId', claim.player_id,
      'authUserId', target_user, 'idempotent', true);
  end if;
  if claim.status <> 'PENDING' or claim.expires_at <= now() then
    raise exception using errcode = '42501', message = 'PRODUCTION_PARTICIPANT_ENROLLMENT_CLAIM_INACTIVE';
  end if;
  select * into auth_user from auth.users where id = target_user;
  if not found or auth_user.email_confirmed_at is not null
     or encode(extensions.digest(lower(btrim(coalesce(auth_user.email, '')))::text, 'sha256'), 'hex')
       <> claim.email_identity_hash
     or auth_user.raw_app_meta_data->>'provisioning_scope' <> 'production_controlled_first_login'
     or auth_user.raw_app_meta_data->>'player_id' <> claim.player_id
     or auth_user.raw_app_meta_data->>'tournament_id' <> '2026'
     or (select count(*) from auth.users
       where lower(btrim(coalesce(email, ''))) = lower(btrim(auth_user.email))) <> 1 then
    raise exception using errcode = '42501', message = 'PRODUCTION_PARTICIPANT_AUTH_USER_SCOPE_MISMATCH';
  end if;
  select * into contact from participant_identity.participant_identity_contacts
    where tournament_id = '2026' and player_id = claim.player_id and identity_active
      and configuration_revision = claim.source_configuration_revision
      and source_workbook_id = resource.google_workbook_id
      and encode(extensions.digest(email_normalized::text, 'sha256'), 'hex') = claim.email_identity_hash;
  if not found or exists (select 1 from participant_identity.user_player_links
      where auth_user_id = target_user or (player_id = claim.player_id and status in ('PENDING','ACTIVE','SUSPENDED')))
     or exists (select 1 from participant_identity.participant_auth_identifiers
      where normalized_value_private = contact.email_normalized
        and status in ('ELIGIBLE','VERIFICATION_PENDING','VERIFIED')) then
    raise exception using errcode = '42501', message = 'PRODUCTION_PARTICIPANT_IDENTITY_COLLISION';
  end if;
  insert into participant_identity.user_player_links (
    auth_user_id, player_id, status, link_method, email_identity_hash, linked_by
  ) values (
    target_user, claim.player_id, 'PENDING', 'PRODUCTION_CONTROLLED_FIRST_LOGIN',
    claim.email_identity_hash, 'production-controlled-first-login'
  );
  insert into participant_identity.participant_auth_identifiers (
    player_id, auth_user_id, identifier_type, normalized_value_private, status,
    source_system, source_tournament_id, source_configuration_revision, created_by, updated_by
  ) values (
    claim.player_id, target_user, 'EMAIL', contact.email_normalized, 'VERIFICATION_PENDING',
    'PRODUCTION_APPROVED_PARTICIPANT_IDENTITY', '2026', contact.configuration_revision,
    'production-controlled-first-login', 'production-controlled-first-login'
  );
  update participant_identity.production_participant_enrollment_claims set
    status = 'CONSUMED', auth_user_id = target_user, consumed_at = now(), updated_at = now()
  where claim_id = claim.claim_id;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, request_id, safe_metadata
  ) values (
    'PRODUCTION_PARTICIPANT_AUTH_USER_PREPARED', '2026', target_user, claim.player_id,
    'production-controlled-first-login', claim.claim_id::text,
    jsonb_build_object('rawIdentifierStoredInAudit', false, 'emailConfirmed', false,
      'participantAuthorityChanged', false)
  );
  return jsonb_build_object('ok', true, 'playerId', claim.player_id,
    'authUserId', target_user, 'idempotent', false);
end;
$$;

create or replace function public.record_production_participant_first_login_cleanup(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, auth, pg_temp
as $$
declare claim participant_identity.production_participant_enrollment_claims%rowtype;
declare target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare reason text := upper(btrim(coalesce(input->>'safe_reason', 'AUTH_USER_PROVISIONING_FAILED')));
begin
  perform production_control.assert_production_participant_identity_cutover();
  if reason not in ('AUTH_USER_PROVISIONING_FAILED','AUTH_USER_DELETE_CONFIRMED','AUTH_USER_DELETE_FAILED') then
    reason := 'AUTH_USER_PROVISIONING_FAILED';
  end if;
  select * into claim from participant_identity.production_participant_enrollment_claims
    where claim_id = nullif(input->>'claim_id', '')::uuid for update;
  if not found then return jsonb_build_object('ok', true, 'recorded', false); end if;
  if claim.status = 'CONSUMED' then
    raise exception using errcode = '42501', message = 'PRODUCTION_PARTICIPANT_ENROLLMENT_ALREADY_CONSUMED';
  end if;
  update participant_identity.production_participant_enrollment_claims set
    status = case when reason = 'AUTH_USER_DELETE_FAILED' then 'CLEANUP_REQUIRED' else 'CANCELLED' end,
    auth_user_id = case when reason = 'AUTH_USER_DELETE_FAILED' then target_user else null end,
    cleanup_reason = reason, cancelled_at = case when reason = 'AUTH_USER_DELETE_FAILED' then null else now() end,
    updated_at = now()
  where claim_id = claim.claim_id;
  return jsonb_build_object('ok', true, 'recorded', true,
    'cleanupRequired', reason = 'AUTH_USER_DELETE_FAILED');
end;
$$;

create or replace function public.record_production_participant_otp_delivery(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, pg_temp
as $$
declare request uuid := nullif(input->>'request_id', '')::uuid;
declare succeeded boolean := coalesce((input->>'succeeded')::boolean, false);
declare requested_reason text := upper(btrim(coalesce(input->>'safe_reason', 'AUTH_EMAIL_SEND_FAILED')));
begin
  perform production_control.assert_production_participant_identity_cutover();
  if requested_reason not in (
    'AUTH_CAPTCHA_REJECTED','AUTH_SUPABASE_RATE_LIMITED','AUTH_SMTP_PROVIDER_RATE_LIMITED',
    'AUTH_EMAIL_RATE_LIMITED_UNKNOWN_SOURCE','AUTH_EMAIL_CONFIGURATION_FAILED',
    'AUTH_SMTP_PROVIDER_REJECTED','AUTH_EMAIL_SERVICE_UNAVAILABLE','AUTH_EMAIL_SEND_FAILED'
  ) then requested_reason := 'AUTH_EMAIL_SEND_FAILED'; end if;
  update participant_identity.participant_auth_otp_attempts set
    status = case when succeeded then 'SENT' else 'DELIVERY_FAILED' end,
    safe_reason = case when succeeded then 'DELIVERY_ACCEPTED' else requested_reason end,
    request_duration_ms = greatest(0, coalesce((input->>'duration_ms')::integer, 0)),
    sent_at = case when succeeded then now() else sent_at end, updated_at = now()
  where request_id = request and status = 'AUTHORIZED';
  if not found then raise exception using errcode = 'P0001', message = 'PRODUCTION_PARTICIPANT_OTP_NOT_AUTHORIZED'; end if;
  return jsonb_build_object('ok', true, 'requestId', request,
    'status', case when succeeded then 'SENT' else 'DELIVERY_FAILED' end);
end;
$$;

create or replace function public.authorize_production_participant_otp_verification(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, auth, extensions, pg_temp
as $$
declare request uuid := nullif(input->>'request_id', '')::uuid;
declare email_hash text := lower(btrim(coalesce(input->>'email_identity_hash', '')));
declare attempt participant_identity.participant_auth_otp_attempts%rowtype;
begin
  perform production_control.assert_production_participant_identity_cutover();
  select otp.* into attempt from participant_identity.participant_auth_otp_attempts otp
  join participant_identity.user_player_links link
    on link.auth_user_id = otp.auth_user_id and link.player_id = otp.player_id
    and link.status in ('PENDING','ACTIVE')
  join participant_identity.participant_auth_identifiers identifier
    on identifier.auth_user_id = otp.auth_user_id and identifier.player_id = otp.player_id
    and identifier.identifier_type = 'EMAIL'
    and identifier.status in ('VERIFICATION_PENDING','VERIFIED')
    and encode(extensions.digest(identifier.normalized_value_private::text, 'sha256'), 'hex') = email_hash
  where otp.request_id = request and otp.status = 'SENT'
    and otp.email_identity_hash = email_hash and otp.sent_at > now() - interval '15 minutes';
  if not found then return jsonb_build_object('ok', true, 'allowed', false); end if;
  return jsonb_build_object('ok', true, 'allowed', true,
    'authUserId', attempt.auth_user_id, 'playerId', attempt.player_id,
    'tournamentId', attempt.tournament_id, 'verificationType', attempt.verification_type);
end;
$$;

create or replace function production_control.certify_production_participant_otp(
  target_request_id uuid, target_auth_user_id uuid, target_duration_ms integer, recovery boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, scoring_authority, auth, extensions, pg_temp
as $$
declare attempt participant_identity.participant_auth_otp_attempts%rowtype;
declare auth_user auth.users%rowtype;
declare link participant_identity.user_player_links%rowtype;
declare identifier participant_identity.participant_auth_identifiers%rowtype;
begin
  perform production_control.assert_production_participant_identity_cutover();
  select * into attempt from participant_identity.participant_auth_otp_attempts
    where request_id = target_request_id for update;
  if not found or attempt.auth_user_id is distinct from target_auth_user_id then
    raise exception using errcode = '42501', message = 'PRODUCTION_PARTICIPANT_OTP_IDENTITY_MISMATCH';
  end if;
  select * into auth_user from auth.users where id = target_auth_user_id;
  select * into link from participant_identity.user_player_links
    where auth_user_id = target_auth_user_id and player_id = attempt.player_id for update;
  select * into identifier from participant_identity.participant_auth_identifiers
    where auth_user_id = target_auth_user_id and player_id = attempt.player_id
      and identifier_type = 'EMAIL' and status in ('VERIFICATION_PENDING','VERIFIED') for update;
  if auth_user.email_confirmed_at is null or link.link_id is null or identifier.identifier_id is null
     or encode(extensions.digest(lower(btrim(coalesce(auth_user.email, '')))::text, 'sha256'), 'hex')
       <> attempt.email_identity_hash
     or identifier.normalized_value_private <> lower(btrim(auth_user.email))
     or auth_user.raw_app_meta_data->>'player_id' <> attempt.player_id
     or auth_user.raw_app_meta_data->>'tournament_id' <> '2026'
     or auth_user.raw_app_meta_data->>'provisioning_scope' not in (
       'production_controlled_first_login','production_shadow_director_certification'
     ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_PARTICIPANT_VERIFIED_IDENTITY_MISMATCH';
  end if;
  if attempt.status = 'VERIFIED' then
    if link.status <> 'ACTIVE' or identifier.status <> 'VERIFIED' then
      raise exception using errcode = 'P0001', message = 'PRODUCTION_PARTICIPANT_VERIFICATION_DRIFT';
    end if;
    return jsonb_build_object('ok', true, 'status', 'VERIFIED', 'duplicate', true,
      'recovered', recovery);
  end if;
  if attempt.status <> 'SENT' then
    raise exception using errcode = '42501', message = 'PRODUCTION_PARTICIPANT_OTP_NOT_AWAITING_VERIFICATION';
  end if;
  update participant_identity.participant_auth_otp_attempts set
    status = 'VERIFIED', safe_reason = 'SESSION_ESTABLISHED',
    verification_duration_ms = greatest(0, coalesce(target_duration_ms, 0)),
    verified_at = now(), updated_at = now()
  where request_id = target_request_id and status = 'SENT';
  update participant_identity.user_player_links set
    status = 'ACTIVE', linked_at = coalesce(linked_at, now()),
    linked_by = coalesce(linked_by, 'production-email-otp'),
    link_revision = link_revision + case when status = 'ACTIVE' then 0 else 1 end,
    updated_at = now()
  where link_id = link.link_id;
  update participant_identity.participant_auth_identifiers set
    status = 'VERIFIED', verified_at = coalesce(verified_at, now()),
    verification_source = 'PRODUCTION_EMAIL_OTP',
    revision = revision + case when status = 'VERIFIED' then 0 else 1 end,
    updated_by = 'production-email-otp', updated_at = now()
  where identifier_id = identifier.identifier_id;
  insert into participant_identity.tournament_roles (
    tournament_id, auth_user_id, role, role_active, granted_by
  ) values ('2026', target_auth_user_id, 'PARTICIPANT', true, 'production-email-otp')
  on conflict (tournament_id, auth_user_id, role) do update set
    role_active = true, revoked_at = null, revoked_by = null,
    role_revision = participant_identity.tournament_roles.role_revision + 1,
    updated_at = now();
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, request_id, safe_metadata
  ) values (
    'PRODUCTION_PARTICIPANT_AUTH_VERIFIED', '2026', target_auth_user_id,
    attempt.player_id, 'production-email-otp', target_request_id::text,
    jsonb_build_object('result', 'VERIFIED', 'recovered', recovery, 'otpStored', false)
  );
  return jsonb_build_object('ok', true, 'status', 'VERIFIED', 'duplicate', false,
    'recovered', recovery);
end;
$$;

create or replace function public.record_production_participant_otp_verification(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, pg_temp
as $$
declare request uuid := nullif(input->>'request_id', '')::uuid;
declare target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare succeeded boolean := coalesce((input->>'succeeded')::boolean, false);
begin
  perform production_control.assert_production_participant_identity_cutover();
  if succeeded then
    return production_control.certify_production_participant_otp(
      request, target_user, greatest(0, coalesce((input->>'duration_ms')::integer, 0)), false);
  end if;
  update participant_identity.participant_auth_otp_attempts set
    status = 'VERIFICATION_FAILED', safe_reason = 'INVALID_OR_EXPIRED_CODE',
    verification_duration_ms = greatest(0, coalesce((input->>'duration_ms')::integer, 0)), updated_at = now()
  where request_id = request and status = 'SENT';
  return jsonb_build_object('ok', true, 'status', 'VERIFICATION_FAILED');
end;
$$;

create or replace function public.recover_production_participant_otp_verification(
  target_request_id uuid, target_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, auth, pg_temp
as $$
begin
  perform production_control.assert_production_participant_identity_cutover();
  if not exists (select 1 from participant_identity.participant_auth_otp_attempts
      where request_id = target_request_id and auth_user_id = target_auth_user_id
        and status in ('SENT','VERIFIED') and requested_at > now() - interval '30 minutes')
     or not exists (select 1 from auth.users where id = target_auth_user_id and email_confirmed_at is not null) then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_PARTICIPANT_AUTH_RECOVERY_NOT_ELIGIBLE');
  end if;
  return production_control.certify_production_participant_otp(
    target_request_id, target_auth_user_id, 0, true);
end;
$$;

create or replace function public.read_production_participant_context_for_auth(
  target_auth_user_id uuid, target_tournament_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, participant_identity, scoring_authority, public, auth, extensions, pg_temp
as $$
declare target_tournament text := btrim(coalesce(target_tournament_id, '2026'));
declare target_player text;
declare context jsonb;
begin
  perform production_control.assert_production_participant_identity_cutover();
  if target_auth_user_id is null or target_tournament <> '2026' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  select link.player_id into target_player
  from participant_identity.user_player_links link
  join auth.users auth_user on auth_user.id = link.auth_user_id and auth_user.email_confirmed_at is not null
  join participant_identity.participant_auth_identifiers identifier
    on identifier.auth_user_id = link.auth_user_id and identifier.player_id = link.player_id
    and identifier.identifier_type = 'EMAIL' and identifier.status = 'VERIFIED'
    and lower(btrim(auth_user.email)) = identifier.normalized_value_private
  join participant_identity.participant_identity_contacts contact
    on contact.tournament_id = '2026' and contact.player_id = link.player_id
    and contact.identity_active and contact.email_normalized = identifier.normalized_value_private
  join scoring_authority.tournament_players membership
    on membership.tournament_id = contact.tournament_id and membership.player_id = contact.player_id
    and membership.participation_status = 'ACTIVE'
  where link.auth_user_id = target_auth_user_id and link.status = 'ACTIVE';
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;
  context := public.read_participant_identity_context('2026', target_player);
  if coalesce((context->>'ok')::boolean, false) then
    return jsonb_set(context, '{data,authUserId}', to_jsonb(target_auth_user_id), true);
  end if;
  return context;
end;
$$;

create or replace function public.read_production_participant_player_context(
  target_tournament_id text, target_player_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, participant_identity, public, pg_temp
as $$
declare target_user uuid;
begin
  perform production_control.assert_production_participant_identity_cutover();
  if btrim(coalesce(target_tournament_id, '')) <> '2026' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  select auth_user_id into target_user from participant_identity.user_player_links
    where player_id = btrim(target_player_id) and status = 'ACTIVE';
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;
  return public.read_production_participant_context_for_auth(target_user, '2026');
end;
$$;

create or replace function public.record_production_participant_logout(
  target_auth_user_id uuid, target_tournament_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, pg_temp
as $$
declare target_player text;
begin
  perform production_control.assert_production_participant_identity_cutover();
  if btrim(coalesce(target_tournament_id, '')) <> '2026' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  select player_id into target_player from participant_identity.user_player_links
    where auth_user_id = target_auth_user_id and status = 'ACTIVE';
  if found then
    insert into participant_identity.identity_audit_events (
      event_type, tournament_id, auth_user_id, player_id, actor_name, safe_metadata
    ) values ('PRODUCTION_PARTICIPANT_AUTH_LOGOUT', '2026', target_auth_user_id,
      target_player, 'production-participant-auth', jsonb_build_object('sessionTokenStored', false));
  end if;
  return jsonb_build_object('ok', true, 'recorded', found);
end;
$$;

-- The Step 10B Director-candidate reader intentionally asserts the dormant
-- candidate contract. Keep it available for rollback/candidate certification
-- and use this separate reader once participant identity is activated.
create or replace function public.read_production_cutover_director_entitlement(
  target_auth_user_id uuid, target_tournament_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, participant_identity, public, auth, pg_temp
as $$
begin
  perform production_control.assert_production_participant_identity_cutover();
  if target_auth_user_id is null or btrim(coalesce(target_tournament_id, '')) <> '2026' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  return coalesce((select jsonb_build_object(
    'ok', true, 'found', true, 'active', entitlement.status = 'ACTIVE',
    'status', entitlement.status, 'tournamentId', entitlement.tournament_id,
    'directorPlayerId', entitlement.player_id, 'role', entitlement.role,
    'revision', coalesce((select max(event.event_id)
      from production_control.director_entitlement_events event
      where event.entitlement_id = entitlement.entitlement_id), 0),
    'grantedAt', entitlement.granted_at, 'revokedAt', entitlement.revoked_at
  ) from production_control.director_entitlements entitlement
  join participant_identity.user_player_links link
    on link.auth_user_id = entitlement.auth_user_id
    and link.player_id = entitlement.player_id and link.status = 'ACTIVE'
  join auth.users auth_user
    on auth_user.id = entitlement.auth_user_id and auth_user.email_confirmed_at is not null
  where entitlement.auth_user_id = target_auth_user_id
    and entitlement.tournament_id = '2026'
    and exists (select 1 from participant_identity.tournament_roles role_row
      where role_row.tournament_id = '2026'
        and role_row.auth_user_id = entitlement.auth_user_id
        and role_row.role = 'DIRECTOR' and role_row.role_active)),
  jsonb_build_object('ok', true, 'found', false, 'active', false));
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.activate_production_participant_identity(jsonb)',
    'public.rollback_production_participant_identity(jsonb)',
    'public.authorize_production_participant_otp_request(jsonb)',
    'public.complete_production_participant_first_login(jsonb)',
    'public.record_production_participant_first_login_cleanup(jsonb)',
    'public.record_production_participant_otp_delivery(jsonb)',
    'public.authorize_production_participant_otp_verification(jsonb)',
    'public.record_production_participant_otp_verification(jsonb)',
    'public.recover_production_participant_otp_verification(uuid,uuid)',
    'public.read_production_participant_context_for_auth(uuid,text)',
    'public.read_production_participant_player_context(text,text)',
    'public.record_production_participant_logout(uuid,text)',
    'public.read_production_cutover_director_entitlement(uuid,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
