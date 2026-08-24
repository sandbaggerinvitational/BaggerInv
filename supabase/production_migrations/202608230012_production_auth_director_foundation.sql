begin;

-- Dormant Step 10B Production Auth certification foundation. This migration
-- creates no Auth users, sends no OTP, selects no public read source, and does
-- not change scoring/identity authority. All operations remain service-only.

create table if not exists participant_identity.production_auth_candidates (
  tournament_id text primary key references scoring_authority.tournaments(tournament_id) on delete restrict,
  player_id text not null references scoring_authority.players(player_id) on delete restrict,
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  email_identity_hash text not null check (email_identity_hash ~ '^[0-9a-f]{64}$'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  identity_source_fingerprint text not null check (identity_source_fingerprint ~ '^[0-9a-f]{64}$'),
  source_workbook_id text not null check (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  project_ref text not null check (project_ref = 'ymqhhtxaywtqllynrmxe'),
  status text not null check (status in ('PREPARED', 'VERIFIED', 'SUSPENDED', 'REVOKED')),
  certification_revision bigint not null default 1 check (certification_revision > 0),
  prepared_by text not null
    check (prepared_by = 'step10b-production-auth-bootstrap'),
  prepared_at timestamptz not null default now(),
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  check (tournament_id = '2026')
);

create table if not exists participant_identity.production_auth_preprovision_claims (
  claim_id uuid primary key default extensions.gen_random_uuid(),
  bootstrap_key text not null unique default 'STEP10B_PRODUCTION_DIRECTOR_AUTH'
    check (bootstrap_key = 'STEP10B_PRODUCTION_DIRECTOR_AUTH'),
  tournament_id text not null check (tournament_id = '2026'),
  player_id text not null references scoring_authority.players(player_id) on delete restrict,
  email_identity_hash text not null check (email_identity_hash ~ '^[0-9a-f]{64}$'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  identity_source_fingerprint text not null check (identity_source_fingerprint ~ '^[0-9a-f]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  source_workbook_id text not null
    check (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  project_ref text not null check (project_ref = 'ymqhhtxaywtqllynrmxe'),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'CONSUMED', 'CANCELLED', 'CLEANUP_REQUIRED')),
  auth_user_id uuid,
  requested_by text not null
    check (requested_by = 'step10b-production-auth-bootstrap'),
  claim_revision bigint not null default 1 check (claim_revision > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  cancelled_at timestamptz,
  cleanup_reason text check (cleanup_reason is null or cleanup_reason in (
    'AUTH_USER_CREATION_FAILED', 'AUTH_USER_DELETE_CONFIRMED',
    'AUTH_USER_DELETE_FAILED', 'AUTH_CANDIDATE_FINALIZATION_FAILED'
  )),
  updated_at timestamptz not null default now(),
  check (
    (status = 'PENDING' and consumed_at is null and cancelled_at is null)
    or (status = 'CONSUMED' and auth_user_id is not null and consumed_at is not null)
    or (status = 'CANCELLED' and consumed_at is null and cancelled_at is not null)
    or (status = 'CLEANUP_REQUIRED' and auth_user_id is not null and consumed_at is null)
  )
);

alter table participant_identity.production_auth_candidates enable row level security;
alter table participant_identity.production_auth_preprovision_claims enable row level security;

-- OTP audit reasons are an operator-facing security contract, not arbitrary
-- provider text. Keep the persisted taxonomy bounded even if a future writer
-- bypasses the normalization in the delivery-recording function.
alter table participant_identity.participant_auth_otp_attempts
  add constraint participant_auth_otp_attempts_production_safe_reason_check
  check (safe_reason is null or safe_reason in (
    'NOT_ELIGIBLE', 'COOLDOWN', 'RATE_LIMIT', 'APPROVED',
    'DELIVERY_ACCEPTED', 'AUTH_CAPTCHA_REJECTED',
    'AUTH_SUPABASE_RATE_LIMITED', 'AUTH_EMAIL_CONFIGURATION_FAILED',
    'AUTH_SMTP_PROVIDER_REJECTED', 'AUTH_EMAIL_SERVICE_UNAVAILABLE',
    'AUTH_EMAIL_SEND_FAILED', 'SESSION_ESTABLISHED',
    'INVALID_OR_EXPIRED_CODE'
  ));

revoke all on participant_identity.production_auth_candidates from public, anon, authenticated, service_role;
revoke all on participant_identity.production_auth_preprovision_claims from public, anon, authenticated, service_role;
grant select on participant_identity.production_auth_candidates to service_role;
grant select on participant_identity.production_auth_preprovision_claims to service_role;

create or replace function production_control.assert_production_auth_candidate_rpc()
returns production_control.resource_scope
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, auth, pg_temp
as $$
declare scope production_control.resource_scope%rowtype;
begin
  scope := production_control.assert_current_shadow_v2_dormant();
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_AUTH_CERTIFICATION_SERVICE_ROLE_REQUIRED';
  end if;
  return scope;
end;
$$;
revoke all on function production_control.assert_production_auth_candidate_rpc()
  from public, anon, authenticated, service_role;

create or replace function public.claim_production_auth_candidate_preprovision(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, scoring_authority, auth, extensions, pg_temp
as $$
declare scope production_control.resource_scope%rowtype;
declare claim participant_identity.production_auth_preprovision_claims%rowtype;
declare target_player text := btrim(coalesce(input->>'player_id', ''));
declare email_hash text := lower(btrim(coalesce(input->>'email_identity_hash', '')));
declare source_hash text := lower(btrim(coalesce(input->>'source_fingerprint', '')));
declare identity_source_hash text := lower(btrim(coalesce(input->>'identity_source_fingerprint', '')));
declare request_hash text := lower(btrim(coalesce(input->>'request_fingerprint', '')));
declare actor constant text := 'step10b-production-auth-bootstrap';
declare expected_request_hash text;
declare auth_user_count integer;
declare matching_auth_user_count integer;
begin
  scope := production_control.assert_production_auth_candidate_rpc();
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PRODUCTION'
    or btrim(coalesce(input->>'project_ref', '')) <> scope.project_ref
    or btrim(coalesce(input->>'project_url', '')) <> scope.project_url
    or btrim(coalesce(input->>'source_workbook_id', '')) <> scope.google_workbook_id
    or btrim(coalesce(input->>'tournament_id', '')) <> '2026'
    or btrim(coalesce(input->>'contract_version', '')) <> 'production-auth-preprovision-v1'
    or btrim(coalesce(input->>'operation', '')) <> 'PRODUCTION_DIRECTOR_AUTH_PREPROVISION'
    or target_player = ''
    or email_hash !~ '^[0-9a-f]{64}$'
    or source_hash !~ '^[0-9a-f]{64}$'
    or identity_source_hash !~ '^[0-9a-f]{64}$'
    or request_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_EXACT_SCOPE_REQUIRED';
  end if;
  expected_request_hash := encode(extensions.digest(concat_ws(E'\n',
    'production-auth-preprovision-v1', 'PRODUCTION_DIRECTOR_AUTH_PREPROVISION',
    'PRODUCTION', scope.project_ref, scope.project_url, scope.google_workbook_id,
    '2026', target_player, email_hash, source_hash, identity_source_hash, actor
  ), 'sha256'), 'hex');
  if request_hash <> expected_request_hash then
    raise exception using errcode = '22023', message = 'PRODUCTION_AUTH_PREPROVISION_EVIDENCE_MISMATCH';
  end if;
  if not exists (
    select 1 from scoring_authority.tournament_players
    where tournament_id = '2026' and player_id = target_player and participation_status = 'ACTIVE'
  ) then raise exception 'The Production Director must be an active 2026 participant.'; end if;
  if not exists (
    select 1 from production_control.current_shadow_revisions revision
    where revision.tournament_id = '2026' and revision.source_workbook_id = scope.google_workbook_id
      and revision.source_fingerprint = source_hash
      and revision.import_run_id = (
        select latest.import_run_id
        from production_control.current_shadow_revisions latest
        where latest.tournament_id = '2026'
        order by latest.imported_at desc, latest.import_run_id desc
        limit 1
      )
  ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_CURRENT_SOURCE_REQUIRED';
  end if;
  -- The service caller cannot choose an email-to-Player mapping. It must already
  -- exist in the approved, workbook-derived identity projection and match the
  -- exact approved configuration fingerprint/current revision.
  if not exists (
    select 1
    from participant_identity.participant_identity_contacts contact
    join participant_identity.identity_context_revisions context_revision
      on context_revision.tournament_id = contact.tournament_id
      and context_revision.context_revision = contact.configuration_revision
      and context_revision.configuration_fingerprint = identity_source_hash
    join participant_identity.identity_config_import_runs import_run
      on import_run.tournament_id = contact.tournament_id
      and import_run.configuration_revision = contact.configuration_revision
      and import_run.source_fingerprint = identity_source_hash
      and import_run.status = 'APPROVED'
      and import_run.approved_at is not null
    where contact.tournament_id = '2026'
      and contact.player_id = target_player
      and contact.identity_active
      and contact.source_workbook_id = scope.google_workbook_id
      and encode(extensions.digest(contact.email_normalized::text, 'sha256'), 'hex') = email_hash
  ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_APPROVED_IDENTITY_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production-auth-preprovision-2026', 0));
  select count(*), count(*) filter (where
    encode(extensions.digest(lower(btrim(coalesce(email, '')))::text, 'sha256'), 'hex') = email_hash
    and raw_app_meta_data->>'provisioning_scope' = 'production_shadow_director_certification'
    and raw_app_meta_data->>'player_id' = target_player
    and raw_app_meta_data->>'tournament_id' = '2026')
  into auth_user_count, matching_auth_user_count from auth.users;

  select * into claim from participant_identity.production_auth_preprovision_claims
  where bootstrap_key = 'STEP10B_PRODUCTION_DIRECTOR_AUTH' for update;
  if found then
    if claim.tournament_id <> '2026' or claim.player_id <> target_player
      or claim.email_identity_hash <> email_hash or claim.source_fingerprint <> source_hash
      or claim.identity_source_fingerprint <> identity_source_hash
      or claim.request_fingerprint <> request_hash or claim.requested_by <> actor
      or claim.project_ref <> scope.project_ref or claim.source_workbook_id <> scope.google_workbook_id then
      raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_ALREADY_BOUND';
    end if;
    if auth_user_count > 1 or (auth_user_count = 1 and matching_auth_user_count <> 1) then
      raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_AUTH_COLLISION';
    end if;
    if claim.status = 'CONSUMED' then
      if auth_user_count <> 1 or claim.auth_user_id is null
        or not exists (select 1 from auth.users where id = claim.auth_user_id) then
        raise exception using errcode = 'P0001', message = 'PRODUCTION_AUTH_PREPROVISION_CONSUMED_DRIFT';
      end if;
      return jsonb_build_object('ok', true, 'claimId', claim.claim_id,
        'status', claim.status, 'duplicate', true, 'recoveryAllowed', true);
    end if;
    if claim.status = 'CLEANUP_REQUIRED' then
      if auth_user_count <> 1 or matching_auth_user_count <> 1
        or claim.auth_user_id is null
        or not exists (select 1 from auth.users where id = claim.auth_user_id) then
        raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_CLEANUP_REQUIRED';
      end if;
      return jsonb_build_object('ok', true, 'claimId', claim.claim_id,
        'status', claim.status, 'duplicate', true, 'recoveryAllowed', true);
    end if;
    if claim.status = 'CANCELLED' then
      if auth_user_count <> 0 then
        raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_CLEANUP_REQUIRED';
      end if;
      update participant_identity.production_auth_preprovision_claims set
        status = 'PENDING', auth_user_id = null, consumed_at = null, cancelled_at = null,
        cleanup_reason = null, expires_at = now() + interval '10 minutes',
        claim_revision = claim_revision + 1, updated_at = now()
      where claim_id = claim.claim_id returning * into claim;
    elsif claim.expires_at <= now() then
      if auth_user_count > 1 or matching_auth_user_count <> auth_user_count then
        raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_CLEANUP_REQUIRED';
      end if;
      update participant_identity.production_auth_preprovision_claims set
        expires_at = now() + interval '10 minutes', claim_revision = claim_revision + 1,
        updated_at = now()
      where claim_id = claim.claim_id returning * into claim;
    end if;
    return jsonb_build_object('ok', true, 'claimId', claim.claim_id,
      'status', claim.status, 'duplicate', true, 'recoveryAllowed', auth_user_count = 1,
      'expiresAt', claim.expires_at);
  end if;

  if auth_user_count <> 0
    or exists (select 1 from participant_identity.production_auth_candidates where tournament_id = '2026')
    or exists (select 1 from participant_identity.user_player_links where player_id = target_player)
    or exists (select 1 from participant_identity.participant_auth_identifiers
      where player_id = target_player and identifier_type = 'EMAIL'
        and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')) then
    raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_CLEAN_STATE_REQUIRED';
  end if;

  insert into participant_identity.production_auth_preprovision_claims (
    bootstrap_key, tournament_id, player_id, email_identity_hash, source_fingerprint,
    identity_source_fingerprint,
    request_fingerprint, source_workbook_id, project_ref, requested_by
  ) values (
    'STEP10B_PRODUCTION_DIRECTOR_AUTH', '2026', target_player, email_hash, source_hash,
    identity_source_hash,
    request_hash, scope.google_workbook_id, scope.project_ref, actor
  ) returning * into claim;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, player_id, actor_name, request_id, safe_metadata
  ) values (
    'PRODUCTION_AUTH_PREPROVISION_CLAIMED', '2026', target_player, actor, claim.claim_id::text,
    jsonb_build_object('requestFingerprint', request_hash, 'sourceFingerprint', source_hash,
      'identitySourceFingerprint', identity_source_hash,
      'emailValueStored', false, 'authUserCreated', false, 'identityAuthorityChanged', false)
  );
  return jsonb_build_object('ok', true, 'claimId', claim.claim_id,
    'status', claim.status, 'duplicate', false, 'recoveryAllowed', false,
    'expiresAt', claim.expires_at);
end;
$$;

create or replace function public.complete_production_auth_candidate_preprovision(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, scoring_authority, auth, extensions, pg_temp
as $$
declare scope production_control.resource_scope%rowtype;
declare claim participant_identity.production_auth_preprovision_claims%rowtype;
declare target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare auth_user auth.users%rowtype;
declare current_contact participant_identity.participant_identity_contacts%rowtype;
declare current_candidate participant_identity.production_auth_candidates%rowtype;
declare current_link participant_identity.user_player_links%rowtype;
declare current_identifier participant_identity.participant_auth_identifiers%rowtype;
declare link_id_value uuid;
begin
  scope := production_control.assert_production_auth_candidate_rpc();
  if btrim(coalesce(input->>'project_ref', '')) <> scope.project_ref
    or btrim(coalesce(input->>'project_url', '')) <> scope.project_url
    or btrim(coalesce(input->>'source_workbook_id', '')) <> scope.google_workbook_id
    or btrim(coalesce(input->>'tournament_id', '')) <> '2026'
    or target_user is null then
    raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_EXACT_SCOPE_REQUIRED';
  end if;
  select * into claim from participant_identity.production_auth_preprovision_claims
  where claim_id = nullif(input->>'claim_id', '')::uuid for update;
  if not found or claim.bootstrap_key <> 'STEP10B_PRODUCTION_DIRECTOR_AUTH'
    or claim.tournament_id <> '2026' or claim.project_ref <> scope.project_ref
    or claim.source_workbook_id <> scope.google_workbook_id then
    raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_CLAIM_REQUIRED';
  end if;
  if claim.auth_user_id is not null and claim.auth_user_id is distinct from target_user then
    raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_CLAIM_USER_MISMATCH';
  end if;
  select * into auth_user from auth.users where id = target_user;
  if not found
    or encode(extensions.digest(lower(btrim(coalesce(auth_user.email, '')))::text, 'sha256'), 'hex')
      is distinct from claim.email_identity_hash
    or auth_user.raw_app_meta_data->>'provisioning_scope'
      is distinct from 'production_shadow_director_certification'
    or auth_user.raw_app_meta_data->>'player_id' is distinct from claim.player_id
    or auth_user.raw_app_meta_data->>'tournament_id' is distinct from '2026'
    or (select count(*) from auth.users) <> 1 then
    raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_AUTH_IDENTITY_MISMATCH';
  end if;

  if claim.status = 'CONSUMED' then
    if claim.auth_user_id <> target_user
      or not exists (select 1 from participant_identity.production_auth_candidates
        where tournament_id = '2026' and auth_user_id = target_user and player_id = claim.player_id)
      or not exists (select 1 from participant_identity.user_player_links
        where auth_user_id = target_user and player_id = claim.player_id
          and status = case when exists (
            select 1 from participant_identity.production_auth_candidates
            where tournament_id = '2026' and auth_user_id = target_user and status = 'VERIFIED'
          ) then 'ACTIVE' else 'PENDING' end) then
      raise exception using errcode = 'P0001', message = 'PRODUCTION_AUTH_PREPROVISION_CONSUMED_DRIFT';
    end if;
    return jsonb_build_object('ok', true, 'status', 'PREPARED', 'duplicate', true,
      'claimId', claim.claim_id, 'authUserId', target_user, 'playerId', claim.player_id);
  end if;
  if claim.status not in ('PENDING', 'CLEANUP_REQUIRED')
    or (claim.status = 'PENDING' and claim.expires_at <= now()) then
    raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_CLAIM_INACTIVE';
  end if;

  -- Revalidate both source boundaries after Auth user creation. A claim may not
  -- finalize against a tournament or identity projection that advanced while
  -- the external Auth operation was in flight.
  if not exists (
    select 1 from production_control.current_shadow_revisions revision
    where revision.tournament_id = '2026'
      and revision.source_workbook_id = scope.google_workbook_id
      and revision.source_fingerprint = claim.source_fingerprint
      and revision.import_run_id = (
        select latest.import_run_id
        from production_control.current_shadow_revisions latest
        where latest.tournament_id = '2026'
        order by latest.imported_at desc, latest.import_run_id desc
        limit 1
      )
  ) or not exists (
    select 1 from scoring_authority.tournament_players
    where tournament_id = '2026' and player_id = claim.player_id
      and participation_status = 'ACTIVE'
  ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_AUTH_PREPROVISION_SOURCE_ADVANCED';
  end if;

  select * into current_contact from participant_identity.participant_identity_contacts
  where tournament_id = '2026' and player_id = claim.player_id for update;
  if not found
    or not current_contact.identity_active
    or current_contact.source_workbook_id is distinct from scope.google_workbook_id
    or encode(extensions.digest(current_contact.email_normalized::text, 'sha256'), 'hex')
      is distinct from claim.email_identity_hash
    or not exists (
      select 1
      from participant_identity.identity_context_revisions context_revision
      join participant_identity.identity_config_import_runs import_run
        on import_run.tournament_id = context_revision.tournament_id
        and import_run.configuration_revision = context_revision.context_revision
        and import_run.source_fingerprint = context_revision.configuration_fingerprint
        and import_run.status = 'APPROVED'
        and import_run.approved_at is not null
      where context_revision.tournament_id = '2026'
        and context_revision.context_revision = current_contact.configuration_revision
        and context_revision.configuration_fingerprint = claim.identity_source_fingerprint
    ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_AUTH_PREPROVISION_APPROVED_IDENTITY_REQUIRED';
  end if;

  select * into current_candidate from participant_identity.production_auth_candidates
  where tournament_id = '2026' for update;
  if found then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_AUTH_PREPROVISION_CANDIDATE_STATE_DRIFT';
  end if;
  insert into participant_identity.production_auth_candidates (
    tournament_id, player_id, auth_user_id, email_identity_hash,
    source_fingerprint, identity_source_fingerprint, source_workbook_id, project_ref, status,
    certification_revision, prepared_by
  ) values (
    '2026', claim.player_id, target_user, claim.email_identity_hash,
    claim.source_fingerprint, claim.identity_source_fingerprint, scope.google_workbook_id,
    scope.project_ref, 'PREPARED', 1, claim.requested_by
  );

  select * into current_link from participant_identity.user_player_links
  where auth_user_id = target_user
    or (player_id = claim.player_id and status in ('PENDING', 'ACTIVE', 'SUSPENDED'))
  limit 1 for update;
  if found and (current_link.auth_user_id <> target_user or current_link.player_id <> claim.player_id
    or current_link.email_identity_hash <> claim.email_identity_hash) then
    raise exception 'Existing Auth user or Player link requires an explicit audited link-change operation.';
  end if;
  if found then
    update participant_identity.user_player_links set status = 'PENDING', linked_at = null,
      linked_by = claim.requested_by, revoked_at = null, revoked_by = null, revoke_reason = null,
      link_revision = link_revision + 1, updated_at = now()
    where link_id = current_link.link_id returning link_id into link_id_value;
  else
    insert into participant_identity.user_player_links (
      auth_user_id, player_id, status, link_method, email_identity_hash, linked_at, linked_by
    ) values (
      target_user, claim.player_id, 'PENDING', 'PRODUCTION_CANDIDATE_PREPROVISION',
      claim.email_identity_hash, null, claim.requested_by
    ) returning link_id into link_id_value;
  end if;

  select * into current_identifier from participant_identity.participant_auth_identifiers
  where (auth_user_id = target_user or player_id = claim.player_id)
    and identifier_type = 'EMAIL'
    and status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
  limit 1 for update;
  if found and (current_identifier.auth_user_id <> target_user
    or current_identifier.player_id <> claim.player_id
    or encode(extensions.digest(current_identifier.normalized_value_private::text, 'sha256'), 'hex') <> claim.email_identity_hash) then
    raise exception 'Existing email identifier requires an explicit audited ownership change.';
  end if;
  if not found then
    insert into participant_identity.participant_auth_identifiers (
      player_id, auth_user_id, identifier_type, normalized_value_private, status,
      verification_source, source_system, source_tournament_id,
      source_configuration_revision, created_by, updated_by
    ) values (
      claim.player_id, target_user, 'EMAIL', lower(btrim(auth_user.email)), 'VERIFICATION_PENDING',
      null, 'PRODUCTION_DIRECTOR_AUTH_CERTIFICATION', '2026', current_contact.configuration_revision,
      claim.requested_by, claim.requested_by
    );
  end if;

  update participant_identity.production_auth_preprovision_claims set
    status = 'CONSUMED', auth_user_id = target_user, consumed_at = now(),
    cancelled_at = null, cleanup_reason = null, updated_at = now()
  where claim_id = claim.claim_id;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, safe_metadata
  ) values (
    'PRODUCTION_AUTH_CANDIDATE_PREPARED', '2026', target_user, claim.player_id, claim.requested_by,
    jsonb_build_object('sourceFingerprint', claim.source_fingerprint, 'emailValueStored', false,
      'projectRef', scope.project_ref, 'claimId', claim.claim_id,
      'linkId', link_id_value, 'authoritativeIdentityChanged', false)
  );
  return jsonb_build_object('ok', true, 'status', 'PREPARED', 'duplicate', false,
    'claimId', claim.claim_id, 'playerId', claim.player_id,
    'authUserId', target_user, 'emailStoredInResponse', false);
end;
$$;
revoke all on function public.complete_production_auth_candidate_preprovision(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.prepare_production_auth_candidate(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, public, pg_temp
as $$
begin
  perform production_control.assert_production_auth_candidate_rpc();
  return public.complete_production_auth_candidate_preprovision(input);
end;
$$;

create or replace function public.record_production_auth_candidate_preprovision_cleanup(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, auth, pg_temp
as $$
declare scope production_control.resource_scope%rowtype;
declare claim participant_identity.production_auth_preprovision_claims%rowtype;
declare target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare cleanup_succeeded boolean := coalesce((input->>'cleanup_succeeded')::boolean, false);
declare safe_reason text := upper(btrim(coalesce(input->>'safe_reason', 'AUTH_CANDIDATE_FINALIZATION_FAILED')));
begin
  scope := production_control.assert_production_auth_candidate_rpc();
  if safe_reason not in ('AUTH_USER_CREATION_FAILED', 'AUTH_USER_DELETE_CONFIRMED',
    'AUTH_USER_DELETE_FAILED', 'AUTH_CANDIDATE_FINALIZATION_FAILED') then
    safe_reason := 'AUTH_CANDIDATE_FINALIZATION_FAILED';
  end if;
  select * into claim from participant_identity.production_auth_preprovision_claims
  where claim_id = nullif(input->>'claim_id', '')::uuid for update;
  if not found or claim.project_ref <> scope.project_ref or claim.source_workbook_id <> scope.google_workbook_id
    or claim.status = 'CONSUMED' then
    raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_CLEANUP_CLAIM_REQUIRED';
  end if;
  if cleanup_succeeded then
    if exists (select 1 from auth.users) then
      raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_AUTH_USER_STILL_PRESENT';
    end if;
    update participant_identity.production_auth_preprovision_claims set
      status = 'CANCELLED', auth_user_id = null, cancelled_at = now(),
      cleanup_reason = safe_reason, updated_at = now()
    where claim_id = claim.claim_id;
  else
    if target_user is null or not exists (select 1 from auth.users where id = target_user) then
      raise exception using errcode = '42501', message = 'PRODUCTION_AUTH_PREPROVISION_CLEANUP_USER_REQUIRED';
    end if;
    update participant_identity.production_auth_preprovision_claims set
      status = 'CLEANUP_REQUIRED', auth_user_id = target_user,
      cleanup_reason = safe_reason, updated_at = now()
    where claim_id = claim.claim_id;
  end if;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, request_id, safe_metadata
  ) values (
    case when cleanup_succeeded then 'PRODUCTION_AUTH_PREPROVISION_CLEANED'
      else 'PRODUCTION_AUTH_PREPROVISION_CLEANUP_REQUIRED' end,
    '2026', target_user, claim.player_id, claim.requested_by, claim.claim_id::text,
    jsonb_build_object('cleanupSucceeded', cleanup_succeeded, 'safeReason', safe_reason,
      'identityAuthorityChanged', false)
  );
  return jsonb_build_object('ok', true,
    'status', case when cleanup_succeeded then 'CANCELLED' else 'CLEANUP_REQUIRED' end);
end;
$$;

create or replace function public.read_production_auth_candidate(target_tournament_id text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, participant_identity, public, auth, pg_temp
as $$
begin
  perform production_control.assert_production_auth_candidate_rpc();
  return (select case when btrim(coalesce(target_tournament_id, '2026')) <> '2026'
    then jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID')
    else coalesce((
      select jsonb_build_object(
        'ok', true, 'found', true, 'tournamentId', c.tournament_id,
        'playerId', c.player_id, 'authUserId', c.auth_user_id,
        'status', c.status, 'revision', c.certification_revision,
        'emailConfirmed', u.email_confirmed_at is not null,
        'linked', exists (select 1 from participant_identity.user_player_links l
          where l.auth_user_id = c.auth_user_id and l.player_id = c.player_id and l.status = 'ACTIVE'),
        'authUserCount', (select count(*) from auth.users),
        'preparedAt', c.prepared_at, 'verifiedAt', c.verified_at
      ) from participant_identity.production_auth_candidates c
      join auth.users u on u.id = c.auth_user_id where c.tournament_id = '2026'
    ), jsonb_build_object('ok', true, 'found', false, 'authUserCount', (select count(*) from auth.users))) end);
end;
$$;

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
declare contact participant_identity.participant_identity_contacts%rowtype;
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
  join participant_identity.participant_identity_contacts contact
    on contact.tournament_id = c.tournament_id and contact.player_id = c.player_id
  join participant_identity.user_player_links link
    on link.auth_user_id = c.auth_user_id and link.player_id = c.player_id
    and ((c.status = 'PREPARED' and link.status = 'PENDING')
      or (c.status = 'VERIFIED' and link.status = 'ACTIVE'))
  join participant_identity.participant_auth_identifiers identifier
    on identifier.auth_user_id = c.auth_user_id and identifier.player_id = c.player_id
    and identifier.identifier_type = 'EMAIL'
    and identifier.normalized_value_private = contact.email_normalized
    and ((c.status = 'PREPARED' and identifier.status = 'VERIFICATION_PENDING')
      or (c.status = 'VERIFIED' and identifier.status = 'VERIFIED'))
  where c.tournament_id = '2026' and c.status in ('PREPARED', 'VERIFIED')
    and contact.identity_active and contact.email_normalized = normalized
  for update of c;
  if found then
    select * into contact from participant_identity.participant_identity_contacts
      where tournament_id = candidate.tournament_id and player_id = candidate.player_id;
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
    'email', case when allowed then contact.email_normalized else null end,
    'authUserId', case when allowed then candidate.auth_user_id else null end,
    'playerId', case when allowed then candidate.player_id else null end);
end;
$$;

create or replace function public.record_production_auth_candidate_otp_delivery(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, participant_identity, pg_temp
as $$
declare request uuid := nullif(input->>'request_id', '')::uuid;
declare succeeded boolean := coalesce((input->>'succeeded')::boolean, false);
declare requested_reason text := upper(btrim(coalesce(input->>'safe_reason', 'AUTH_EMAIL_SEND_FAILED')));
begin
  perform production_control.assert_production_auth_candidate_rpc();
  if requested_reason not in (
    'AUTH_CAPTCHA_REJECTED', 'AUTH_SUPABASE_RATE_LIMITED',
    'AUTH_EMAIL_CONFIGURATION_FAILED', 'AUTH_SMTP_PROVIDER_REJECTED',
    'AUTH_EMAIL_SERVICE_UNAVAILABLE', 'AUTH_EMAIL_SEND_FAILED'
  ) then
    requested_reason := 'AUTH_EMAIL_SEND_FAILED';
  end if;
  update participant_identity.participant_auth_otp_attempts set
    status = case when succeeded then 'SENT' else 'DELIVERY_FAILED' end,
    safe_reason = case when succeeded then 'DELIVERY_ACCEPTED' else requested_reason end,
    request_duration_ms = greatest(0, coalesce((input->>'duration_ms')::integer, 0)),
    sent_at = case when succeeded then now() else sent_at end, updated_at = now()
  where request_id = request and status = 'AUTHORIZED';
  if not found then raise exception 'OTP request is not in an authorized delivery state.'; end if;
  return jsonb_build_object('ok', true, 'requestId', request,
    'status', case when succeeded then 'SENT' else 'DELIVERY_FAILED' end);
end;
$$;

create or replace function public.authorize_production_auth_candidate_otp_verification(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, participant_identity, pg_temp
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
    and candidate.status in ('PREPARED', 'VERIFIED')
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
    'playerId', attempt.player_id, 'tournamentId', attempt.tournament_id);
end;
$$;

create or replace function production_control.certify_production_auth_candidate_otp(
  target_request_id uuid,
  target_auth_user_id uuid,
  target_duration_ms integer,
  recovery boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, auth, pg_temp
as $$
declare attempt participant_identity.participant_auth_otp_attempts%rowtype;
declare candidate participant_identity.production_auth_candidates%rowtype;
declare auth_user auth.users%rowtype;
begin
  perform production_control.assert_production_auth_candidate_rpc();
  select * into attempt from participant_identity.participant_auth_otp_attempts
  where request_id = target_request_id for update;
  if not found then raise exception 'OTP request was not found.'; end if;
  select * into candidate from participant_identity.production_auth_candidates
  where tournament_id = attempt.tournament_id and auth_user_id = target_auth_user_id
    and player_id = attempt.player_id and status in ('PREPARED', 'VERIFIED') for update;
  if not found or attempt.auth_user_id is distinct from target_auth_user_id
    or attempt.email_identity_hash is distinct from candidate.email_identity_hash then
    raise exception 'Verified Auth identity does not match the approved Production candidate.';
  end if;
  select * into auth_user from auth.users where id = target_auth_user_id;
  if not found or auth_user.email_confirmed_at is null
    or encode(extensions.digest(lower(btrim(coalesce(auth_user.email, '')))::text, 'sha256'), 'hex')
      is distinct from candidate.email_identity_hash
    or (auth_user.raw_app_meta_data->>'provisioning_scope')
      is distinct from 'production_shadow_director_certification'
    or (auth_user.raw_app_meta_data->>'player_id') is distinct from candidate.player_id
    or (auth_user.raw_app_meta_data->>'tournament_id') is distinct from candidate.tournament_id then
    raise exception 'Verified Auth identity does not match the approved Production identity.';
  end if;
  if not exists (
    select 1
    from participant_identity.participant_identity_contacts contact
    join participant_identity.identity_context_revisions context_revision
      on context_revision.tournament_id = contact.tournament_id
      and context_revision.context_revision = contact.configuration_revision
      and context_revision.configuration_fingerprint = candidate.identity_source_fingerprint
    join participant_identity.identity_config_import_runs import_run
      on import_run.tournament_id = contact.tournament_id
      and import_run.configuration_revision = contact.configuration_revision
      and import_run.source_fingerprint = candidate.identity_source_fingerprint
      and import_run.status = 'APPROVED' and import_run.approved_at is not null
    where contact.tournament_id = candidate.tournament_id
      and contact.player_id = candidate.player_id
      and contact.identity_active
      and contact.source_workbook_id = candidate.source_workbook_id
      and encode(extensions.digest(contact.email_normalized::text, 'sha256'), 'hex')
        = candidate.email_identity_hash
  ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_AUTH_CERTIFICATION_APPROVED_IDENTITY_REQUIRED';
  end if;
  if attempt.status = 'VERIFIED' then
    if candidate.status <> 'VERIFIED'
      or not exists (select 1 from participant_identity.user_player_links
        where auth_user_id = target_auth_user_id and player_id = attempt.player_id
          and email_identity_hash = candidate.email_identity_hash and status = 'ACTIVE')
      or not exists (select 1 from participant_identity.participant_auth_identifiers
        where auth_user_id = target_auth_user_id and player_id = attempt.player_id
          and identifier_type = 'EMAIL' and status = 'VERIFIED'
          and encode(extensions.digest(normalized_value_private::text, 'sha256'), 'hex')
            = candidate.email_identity_hash) then
      raise exception 'Previously verified Production Auth certification has drifted.';
    end if;
    return jsonb_build_object('ok', true, 'status', 'VERIFIED', 'duplicate', true,
      'recovered', recovery, 'requestId', target_request_id);
  end if;
  if attempt.status <> 'SENT' then
    raise exception 'OTP request is not awaiting verification.';
  end if;
  if candidate.status = 'PREPARED' then
    if not exists (select 1 from participant_identity.user_player_links
        where auth_user_id = target_auth_user_id and player_id = attempt.player_id
          and email_identity_hash = candidate.email_identity_hash and status = 'PENDING')
      or not exists (select 1 from participant_identity.participant_auth_identifiers
        where auth_user_id = target_auth_user_id and player_id = attempt.player_id
          and identifier_type = 'EMAIL' and status = 'VERIFICATION_PENDING'
          and encode(extensions.digest(normalized_value_private::text, 'sha256'), 'hex')
            = candidate.email_identity_hash) then
      raise exception 'The approved Production identity is not awaiting physical verification.';
    end if;
  elsif not exists (select 1 from participant_identity.user_player_links
      where auth_user_id = target_auth_user_id and player_id = attempt.player_id
        and email_identity_hash = candidate.email_identity_hash and status = 'ACTIVE')
    or not exists (select 1 from participant_identity.participant_auth_identifiers
      where auth_user_id = target_auth_user_id and player_id = attempt.player_id
        and identifier_type = 'EMAIL' and status = 'VERIFIED'
        and encode(extensions.digest(normalized_value_private::text, 'sha256'), 'hex')
          = candidate.email_identity_hash) then
    raise exception 'The verified Production identity has drifted.';
  end if;
  update participant_identity.participant_auth_otp_attempts set
    status = 'VERIFIED', safe_reason = 'SESSION_ESTABLISHED',
    verification_duration_ms = greatest(0, coalesce(target_duration_ms, 0)),
    verified_at = coalesce(verified_at, now()), updated_at = now()
  where request_id = target_request_id and status = 'SENT';
  if not found then raise exception 'OTP request certification lost its exact state.'; end if;
  if candidate.status = 'PREPARED' then
    update participant_identity.production_auth_candidates set
      status = 'VERIFIED', verified_at = now(),
      certification_revision = certification_revision + 1,
      updated_at = now()
    where tournament_id = attempt.tournament_id and auth_user_id = target_auth_user_id
      and player_id = attempt.player_id and status = 'PREPARED';
    if not found then raise exception 'Production Auth candidate certification lost its exact state.'; end if;
    update participant_identity.user_player_links set
      status = 'ACTIVE', linked_at = now(),
      linked_by = 'step10b-production-auth-certification',
      link_revision = link_revision + 1, updated_at = now()
    where auth_user_id = target_auth_user_id and player_id = attempt.player_id
      and email_identity_hash = candidate.email_identity_hash and status = 'PENDING';
    if not found then raise exception 'Production Auth Player link certification lost its exact state.'; end if;
    update participant_identity.participant_auth_identifiers set
      status = 'VERIFIED', verified_at = now(),
      verification_source = 'PRODUCTION_EMAIL_OTP',
      revision = revision + 1,
      updated_by = 'step10b-production-auth-certification', updated_at = now()
    where auth_user_id = target_auth_user_id and player_id = attempt.player_id
      and identifier_type = 'EMAIL' and status = 'VERIFICATION_PENDING'
      and encode(extensions.digest(normalized_value_private::text, 'sha256'), 'hex')
        = candidate.email_identity_hash;
    if not found then raise exception 'The approved Production email identifier is unavailable.'; end if;
  end if;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, request_id, safe_metadata
  ) values (
    'PRODUCTION_AUTH_CERTIFIED', attempt.tournament_id, attempt.auth_user_id,
    attempt.player_id, 'step10b-production-auth-certification', target_request_id::text,
    jsonb_build_object('result', 'VERIFIED', 'recovered', recovery,
      'candidateActivated', candidate.status = 'PREPARED',
      'otpStored', false, 'identityAuthorityChanged', false)
  );
  return jsonb_build_object('ok', true, 'status', 'VERIFIED', 'duplicate', false,
    'recovered', recovery, 'requestId', target_request_id);
end;
$$;
revoke all on function production_control.certify_production_auth_candidate_otp(uuid,uuid,integer,boolean)
  from public, anon, authenticated, service_role;

create or replace function public.record_production_auth_candidate_otp_verification(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, auth, pg_temp
as $$
declare request uuid := nullif(input->>'request_id', '')::uuid;
declare user_id uuid := nullif(input->>'auth_user_id', '')::uuid;
declare succeeded boolean := coalesce((input->>'succeeded')::boolean, false);
declare attempt participant_identity.participant_auth_otp_attempts%rowtype;
begin
  perform production_control.assert_production_auth_candidate_rpc();
  if succeeded then
    return production_control.certify_production_auth_candidate_otp(
      request, user_id, greatest(0, coalesce((input->>'duration_ms')::integer, 0)), false
    );
  end if;
  select * into attempt from participant_identity.participant_auth_otp_attempts
  where request_id = request for update;
  if not found then raise exception 'OTP request was not found.'; end if;
  if attempt.status = 'VERIFICATION_FAILED' then
    return jsonb_build_object('ok', true, 'status', 'VERIFICATION_FAILED', 'duplicate', true);
  end if;
  if attempt.status <> 'SENT' then raise exception 'OTP request is not awaiting verification.'; end if;
  update participant_identity.participant_auth_otp_attempts set
    status = 'VERIFICATION_FAILED', safe_reason = 'INVALID_OR_EXPIRED_CODE',
    verification_duration_ms = greatest(0, coalesce((input->>'duration_ms')::integer, 0)),
    updated_at = now()
  where request_id = request;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, request_id, safe_metadata
  ) values (
    'PRODUCTION_AUTH_VERIFY_FAILED', attempt.tournament_id, attempt.auth_user_id,
    attempt.player_id, 'step10b-production-auth-certification', request::text,
    jsonb_build_object('result', 'FAILED', 'otpStored', false, 'identityAuthorityChanged', false)
  );
  return jsonb_build_object('ok', true, 'status', 'VERIFICATION_FAILED', 'duplicate', false);
end;
$$;

create or replace function public.recover_production_auth_candidate_otp_verification(
  target_request_id uuid,
  target_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, auth, pg_temp
as $$
declare candidate participant_identity.production_auth_candidates%rowtype;
declare attempt participant_identity.participant_auth_otp_attempts%rowtype;
begin
  perform production_control.assert_production_auth_candidate_rpc();
  if target_request_id is null or target_auth_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_RECOVERY_EXACT_REQUEST_REQUIRED');
  end if;
  select * into attempt from participant_identity.participant_auth_otp_attempts
  where request_id = target_request_id and tournament_id = '2026'
    and auth_user_id = target_auth_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_RECOVERY_ATTEMPT_NOT_FOUND');
  end if;
  select * into candidate from participant_identity.production_auth_candidates
  where tournament_id = attempt.tournament_id and auth_user_id = target_auth_user_id
    and player_id = attempt.player_id and status in ('PREPARED', 'VERIFIED') for update;
  if not found or attempt.status not in ('SENT', 'VERIFIED')
    or (attempt.status = 'SENT' and attempt.sent_at <= now() - interval '30 minutes')
    or not exists (select 1 from auth.users
      where id = target_auth_user_id and email_confirmed_at is not null) then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_RECOVERY_NOT_ELIGIBLE');
  end if;
  if attempt.status = 'SENT' and exists (
    select 1 from participant_identity.participant_auth_otp_attempts newer
    where newer.tournament_id = attempt.tournament_id
      and newer.auth_user_id = attempt.auth_user_id
      and newer.player_id = attempt.player_id
      and newer.status in ('SENT', 'VERIFIED')
      and (newer.requested_at > attempt.requested_at
        or (newer.requested_at = attempt.requested_at
          and newer.request_id::text > attempt.request_id::text))
  ) then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_RECOVERY_ATTEMPT_SUPERSEDED');
  end if;
  return production_control.certify_production_auth_candidate_otp(
    target_request_id, target_auth_user_id, 0, true
  );
end;
$$;

create or replace function public.read_production_auth_candidate_context_for_auth(
  target_auth_user_id uuid,
  target_tournament_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, participant_identity, scoring_authority, public, auth, extensions, pg_temp
as $$
declare target_tournament text := btrim(coalesce(target_tournament_id, '2026'));
declare candidate participant_identity.production_auth_candidates%rowtype;
declare context jsonb;
begin
  perform production_control.assert_production_auth_candidate_rpc();
  if target_auth_user_id is null or target_tournament <> '2026' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  select c.* into candidate
  from participant_identity.production_auth_candidates c
  join auth.users auth_user on auth_user.id = c.auth_user_id
    and auth_user.email_confirmed_at is not null
    and (auth_user.raw_app_meta_data->>'provisioning_scope')
      is not distinct from 'production_shadow_director_certification'
    and (auth_user.raw_app_meta_data->>'player_id') is not distinct from c.player_id
    and (auth_user.raw_app_meta_data->>'tournament_id') is not distinct from c.tournament_id
    and encode(extensions.digest(lower(btrim(coalesce(auth_user.email, '')))::text, 'sha256'), 'hex')
      = c.email_identity_hash
  join participant_identity.user_player_links link
    on link.auth_user_id = c.auth_user_id and link.player_id = c.player_id
    and link.email_identity_hash = c.email_identity_hash and link.status = 'ACTIVE'
  join participant_identity.participant_auth_identifiers identifier
    on identifier.auth_user_id = c.auth_user_id and identifier.player_id = c.player_id
    and identifier.identifier_type = 'EMAIL' and identifier.status = 'VERIFIED'
    and encode(extensions.digest(identifier.normalized_value_private::text, 'sha256'), 'hex')
      = c.email_identity_hash
  join participant_identity.participant_identity_contacts contact
    on contact.tournament_id = c.tournament_id and contact.player_id = c.player_id
    and contact.identity_active and contact.source_workbook_id = c.source_workbook_id
    and encode(extensions.digest(contact.email_normalized::text, 'sha256'), 'hex')
      = c.email_identity_hash
  join participant_identity.identity_context_revisions context_revision
    on context_revision.tournament_id = contact.tournament_id
    and context_revision.context_revision = contact.configuration_revision
    and context_revision.configuration_fingerprint = c.identity_source_fingerprint
  join participant_identity.identity_config_import_runs import_run
    on import_run.tournament_id = contact.tournament_id
    and import_run.configuration_revision = contact.configuration_revision
    and import_run.source_fingerprint = c.identity_source_fingerprint
    and import_run.status = 'APPROVED' and import_run.approved_at is not null
  join scoring_authority.tournament_players membership
    on membership.tournament_id = c.tournament_id and membership.player_id = c.player_id
    and membership.participation_status = 'ACTIVE'
  where c.tournament_id = target_tournament and c.auth_user_id = target_auth_user_id
    and c.status = 'VERIFIED';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_CERTIFICATION_REQUIRED');
  end if;
  context := public.read_participant_identity_context(candidate.tournament_id, candidate.player_id);
  if coalesce((context->>'ok')::boolean, false) then
    return jsonb_set(context, '{data,authUserId}', to_jsonb(target_auth_user_id), true);
  end if;
  return context;
end;
$$;

create or replace function public.read_production_auth_candidate_player_context(
  target_tournament_id text,
  target_player_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, participant_identity, public, pg_temp
as $$
declare target_user uuid;
begin
  perform production_control.assert_production_auth_candidate_rpc();
  if btrim(coalesce(target_tournament_id, '')) <> '2026'
    or btrim(coalesce(target_player_id, '')) = '' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  select auth_user_id into target_user
  from participant_identity.production_auth_candidates
  where tournament_id = '2026' and player_id = btrim(target_player_id)
    and status = 'VERIFIED';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_CERTIFICATION_REQUIRED');
  end if;
  return public.read_production_auth_candidate_context_for_auth(target_user, '2026');
end;
$$;

create or replace function public.record_production_auth_candidate_logout(
  target_auth_user_id uuid, target_tournament_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, public, pg_temp
as $$
declare candidate participant_identity.production_auth_candidates%rowtype;
begin
  perform production_control.assert_production_auth_candidate_rpc();
  if btrim(coalesce(target_tournament_id, '')) <> '2026' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  select * into candidate from participant_identity.production_auth_candidates
  where tournament_id = '2026' and auth_user_id = target_auth_user_id and status = 'VERIFIED';
  if found then insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, safe_metadata
  ) values ('PRODUCTION_AUTH_LOGOUT', candidate.tournament_id, candidate.auth_user_id,
    candidate.player_id, 'step10b-production-auth-candidate',
    jsonb_build_object('sessionTokenStored', false)); end if;
  return jsonb_build_object('ok', true, 'recorded', found);
end;
$$;

create or replace function public.read_production_director_entitlement(
  target_auth_user_id uuid, target_tournament_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, participant_identity, public, pg_temp
as $$
begin
  perform production_control.assert_production_auth_candidate_rpc();
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
  where entitlement.auth_user_id = target_auth_user_id
    and entitlement.tournament_id = '2026'
    and exists (select 1 from participant_identity.production_auth_candidates candidate
      where candidate.tournament_id = '2026'
        and candidate.auth_user_id = entitlement.auth_user_id
        and candidate.player_id = entitlement.player_id
        and candidate.status = 'VERIFIED')
    and exists (select 1 from participant_identity.tournament_roles role_row
      where role_row.tournament_id = '2026'
        and role_row.auth_user_id = entitlement.auth_user_id
        and role_row.role = 'DIRECTOR' and role_row.role_active)),
  jsonb_build_object('ok', true, 'found', false, 'active', false));
end;
$$;

create or replace function public.grant_production_director_entitlement(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, scoring_authority, public, auth, pg_temp
as $$
declare target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare target_player text := btrim(coalesce(input->>'director_player_id', ''));
declare actor constant text := 'step10b-production-director-certification';
declare scope production_control.resource_scope%rowtype;
declare current production_control.director_entitlements%rowtype;
declare entitlement_id_value uuid;
declare event_revision bigint;
begin
  scope := production_control.assert_production_auth_candidate_rpc();
  if btrim(coalesce(input->>'tournament_id', '')) <> '2026' or target_user is null
    or target_player = ''
    or btrim(coalesce(input->>'project_ref', '')) <> scope.project_ref then
    raise exception 'Exact Production Director grant context is required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'production-director-entitlement:2026:' || target_user::text, 0
  ));
  if not exists (select 1 from participant_identity.production_auth_candidates
    where tournament_id = '2026' and auth_user_id = target_user and player_id = target_player and status = 'VERIFIED')
    or not exists (select 1 from auth.users where id = target_user and email_confirmed_at is not null)
    or not exists (select 1 from participant_identity.user_player_links
      where auth_user_id = target_user and player_id = target_player and status = 'ACTIVE') then
    raise exception 'A physically verified, linked Production Auth identity is required.';
  end if;
  select * into current from production_control.director_entitlements
  where auth_user_id = target_user and tournament_id = '2026' for update;
  if found and (current.player_id <> target_player or current.role not in ('DIRECTOR', 'OWNER')) then
    raise exception 'Director entitlement identity mismatch.';
  end if;
  if found and current.status = 'ACTIVE' then
    if not exists (select 1 from participant_identity.tournament_roles
      where tournament_id = '2026' and auth_user_id = target_user
        and role = 'DIRECTOR' and role_active) then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_DIRECTOR_ENTITLEMENT_ROLE_DRIFT';
    end if;
    select coalesce(max(event_id), 0) into event_revision
    from production_control.director_entitlement_events
    where entitlement_id = current.entitlement_id;
    return jsonb_build_object('ok', true, 'active', true, 'changed', false,
      'revision', event_revision, 'entitlementId', current.entitlement_id,
      'directorPlayerId', current.player_id);
  end if;
  insert into production_control.director_entitlements (
    auth_user_id, tournament_id, player_id, role, status, granted_by
  ) values (
    target_user, '2026', target_player, 'DIRECTOR', 'ACTIVE', actor
  ) on conflict (auth_user_id, tournament_id) do update set
    player_id = excluded.player_id, role = excluded.role, status = 'ACTIVE',
    granted_by = excluded.granted_by, granted_at = now(), revoked_at = null
  returning entitlement_id into entitlement_id_value;
  insert into production_control.director_entitlement_events (
    entitlement_id, action, actor, reason
  ) values (entitlement_id_value, 'GRANTED', actor,
    'CONTROLLED_PRODUCTION_CERTIFICATION') returning event_id into event_revision;
  insert into participant_identity.tournament_roles (
    tournament_id, auth_user_id, role, role_active, role_revision, granted_by
  ) values ('2026', target_user, 'DIRECTOR', true, 1, actor)
  on conflict (tournament_id, auth_user_id, role) do update set
    role_active = true, role_revision = participant_identity.tournament_roles.role_revision + 1,
    granted_at = now(), granted_by = excluded.granted_by, revoked_at = null,
    revoked_by = null, updated_at = now();
  return jsonb_build_object('ok', true, 'active', true, 'changed', true,
    'revision', event_revision, 'entitlementId', entitlement_id_value,
    'directorPlayerId', target_player);
end;
$$;

create or replace function public.revoke_production_director_entitlement(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, public, pg_temp
as $$
declare target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
declare actor constant text := 'step10b-production-director-certification';
declare reason text := upper(btrim(coalesce(input->>'reason', 'CONTROLLED_REVOCATION')));
declare scope production_control.resource_scope%rowtype;
declare current production_control.director_entitlements%rowtype;
declare event_revision bigint;
begin
  scope := production_control.assert_production_auth_candidate_rpc();
  if btrim(coalesce(input->>'tournament_id', '')) <> '2026' or target_user is null
    or btrim(coalesce(input->>'project_ref', '')) <> scope.project_ref then
    raise exception 'Exact Production Director revocation context is required.';
  end if;
  if reason not in ('CONTROLLED_REVOCATION', 'CERTIFICATION_CLEANUP', 'SECURITY_RESPONSE') then
    raise exception using errcode = '22023', message = 'PRODUCTION_DIRECTOR_REVOCATION_REASON_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'production-director-entitlement:2026:' || target_user::text, 0
  ));
  select * into current from production_control.director_entitlements
  where auth_user_id = target_user and tournament_id = '2026' for update;
  if not found or current.status = 'REVOKED' then
    return jsonb_build_object('ok', true, 'changed', false, 'active', false);
  end if;
  update production_control.director_entitlements set
    status = 'REVOKED', revoked_at = now()
  where auth_user_id = target_user and tournament_id = '2026';
  update participant_identity.tournament_roles set
    role_active = false, role_revision = role_revision + 1, revoked_at = now(),
    revoked_by = actor, updated_at = now()
  where auth_user_id = target_user and tournament_id = '2026' and role = 'DIRECTOR';
  insert into production_control.director_entitlement_events (
    entitlement_id, action, actor, reason
  ) values (current.entitlement_id, 'REVOKED', actor, reason)
  returning event_id into event_revision;
  return jsonb_build_object('ok', true, 'changed', true, 'active', false,
    'revision', event_revision, 'entitlementId', current.entitlement_id);
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.claim_production_auth_candidate_preprovision(jsonb)',
    'public.prepare_production_auth_candidate(jsonb)',
    'public.record_production_auth_candidate_preprovision_cleanup(jsonb)',
    'public.read_production_auth_candidate(text)',
    'public.authorize_production_auth_candidate_otp_request(jsonb)',
    'public.record_production_auth_candidate_otp_delivery(jsonb)',
    'public.authorize_production_auth_candidate_otp_verification(jsonb)',
    'public.record_production_auth_candidate_otp_verification(jsonb)',
    'public.recover_production_auth_candidate_otp_verification(uuid,uuid)',
    'public.read_production_auth_candidate_context_for_auth(uuid,text)',
    'public.read_production_auth_candidate_player_context(text,text)',
    'public.record_production_auth_candidate_logout(uuid,text)',
    'public.read_production_director_entitlement(uuid,text)',
    'public.grant_production_director_entitlement(jsonb)',
    'public.revoke_production_director_entitlement(jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
