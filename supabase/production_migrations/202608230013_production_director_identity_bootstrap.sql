-- Step 10B bounded Production Director identity projection bootstrap.
--
-- This is not the Preview participant-identity importer. It accepts exactly
-- one owner-approved Production identity, creates no Auth user, grants no
-- entitlement, changes no authority, and remains callable only by service_role
-- while the Production foundation is dormant and current-shadow V2 is current.
begin;

create or replace function production_control.assert_production_director_identity_bootstrap()
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
      message = 'PRODUCTION_DIRECTOR_IDENTITY_SERVICE_ROLE_REQUIRED';
  end if;
  return scope;
end;
$$;
revoke all on function production_control.assert_production_director_identity_bootstrap()
  from public, anon, authenticated, service_role;

create or replace function public.import_production_director_identity_projection(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, scoring_authority, auth, extensions, pg_temp
as $$
declare scope production_control.resource_scope%rowtype;
declare existing_run participant_identity.identity_config_import_runs%rowtype;
declare source_value jsonb;
declare payload_value jsonb;
declare request_value jsonb;
declare expected_source jsonb;
declare expected_payload jsonb;
declare expected_request jsonb;
declare source_text text := coalesce(input->>'source_canonical_json', '');
declare payload_text text := coalesce(input->>'payload_canonical_json', '');
declare request_text text := coalesce(input->>'request_canonical_json', '');
declare source_hash text := lower(btrim(coalesce(input->>'source_fingerprint', '')));
declare payload_hash text := lower(btrim(coalesce(input->>'payload_fingerprint', '')));
declare request_hash text := lower(btrim(coalesce(input->>'request_fingerprint', '')));
declare current_source_hash text := lower(btrim(coalesce(input->>'current_shadow_source_fingerprint', '')));
declare email_hash text := lower(btrim(coalesce(input->>'email_identity_hash', '')));
declare target_player text := upper(btrim(coalesce(input->>'player_id', '')));
declare normalized_email text;
declare approved_by_value text;
declare approved_at_value timestamptz;
declare approved_at_text text;
declare evidence_reference text;
declare evidence_reference_hash text;
declare approval_evidence_hash text;
declare current_shadow production_control.current_shadow_revisions%rowtype;
declare active_roster_count integer;
declare next_revision bigint;
declare run_id_value uuid := extensions.gen_random_uuid();
begin
  scope := production_control.assert_production_director_identity_bootstrap();
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PRODUCTION'
    or btrim(coalesce(input->>'project_ref', '')) <> scope.project_ref
    or btrim(coalesce(input->>'project_url', '')) <> scope.project_url
    or btrim(coalesce(input->>'source_workbook_id', '')) <> scope.google_workbook_id
    or btrim(coalesce(input->>'tournament_id', '')) <> '2026'
    or coalesce((input->>'tournament_year')::integer, 0) <> 2026
    or btrim(coalesce(input->>'contract_version', '')) <> 'production-director-identity-bootstrap-v1'
    or btrim(coalesce(input->>'operation', '')) <> 'PRODUCTION_DIRECTOR_IDENTITY_IMPORT'
    or btrim(coalesce(input->>'actor_id', '')) <> 'step10b-production-auth-bootstrap'
    or target_player !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
    or source_hash !~ '^[0-9a-f]{64}$'
    or payload_hash !~ '^[0-9a-f]{64}$'
    or request_hash !~ '^[0-9a-f]{64}$'
    or current_source_hash !~ '^[0-9a-f]{64}$'
    or email_hash !~ '^[0-9a-f]{64}$'
    or btrim(source_text) = '' or btrim(payload_text) = '' or btrim(request_text) = '' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_EXACT_SCOPE_REQUIRED';
  end if;

  begin
    source_value := source_text::jsonb;
    payload_value := payload_text::jsonb;
    request_value := request_text::jsonb;
    approved_at_text := btrim(coalesce(payload_value#>>'{approval,approved_at}', ''));
    approved_at_value := approved_at_text::timestamptz;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_EVIDENCE_INVALID';
  end;

  normalized_email := lower(btrim(coalesce(payload_value#>>'{contact,email_normalized}', '')));
  approved_by_value := btrim(coalesce(payload_value#>>'{approval,approved_by}', ''));
  evidence_reference := btrim(coalesce(source_value#>>'{approval,evidence_reference}', ''));
  evidence_reference_hash := lower(btrim(coalesce(payload_value#>>'{approval,evidence_reference_hash}', '')));
  approval_evidence_hash := lower(btrim(coalesce(payload_value#>>'{approval,evidence_fingerprint}', '')));
  if normalized_email !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'::text collate "C"
    or approved_by_value = '' or length(approved_by_value) > 160
    or approved_by_value ~ E'[\r\n]'
    or approved_at_value > now() + interval '1 minute'
    or evidence_reference = '' or length(evidence_reference) > 240
    or evidence_reference ~ E'[\r\n]'
    or evidence_reference_hash !~ '^[0-9a-f]{64}$'
    or approval_evidence_hash !~ '^[0-9a-f]{64}$'
    or encode(extensions.digest(evidence_reference, 'sha256'), 'hex') <> evidence_reference_hash
    or encode(extensions.digest(concat_ws(E'\n', approved_at_text, approved_by_value,
      evidence_reference_hash, target_player), 'sha256'), 'hex') <> approval_evidence_hash
    or encode(extensions.digest(normalized_email, 'sha256'), 'hex') <> email_hash then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_APPROVED_EVIDENCE_REQUIRED';
  end if;

  expected_source := jsonb_build_object(
    'approval', jsonb_build_object(
      'approved_at', approved_at_text,
      'approved_by', approved_by_value,
      'evidence_kind', 'PRODUCTION_OWNER_APPROVED_DIRECTOR_IDENTITY',
      'evidence_reference', evidence_reference
    ),
    'contact', jsonb_build_object(
      'email_normalized', normalized_email,
      'identity_active', true,
      'player_id', target_player
    ),
    'current_shadow_source_fingerprint', current_source_hash,
    'environment', 'PRODUCTION',
    'project_ref', scope.project_ref,
    'project_url', scope.project_url,
    'source_workbook_id', scope.google_workbook_id,
    'tournament_id', '2026',
    'tournament_year', 2026
  );
  expected_payload := jsonb_build_object(
    'approval', jsonb_build_object(
      'approved_at', approved_at_text,
      'approved_by', approved_by_value,
      'evidence_fingerprint', approval_evidence_hash,
      'evidence_kind', 'PRODUCTION_OWNER_APPROVED_DIRECTOR_IDENTITY',
      'evidence_reference_hash', evidence_reference_hash
    ),
    'contact', jsonb_build_object(
      'email', normalized_email,
      'email_identity_hash', email_hash,
      'email_normalized', normalized_email,
      'identity_active', true,
      'player_id', target_player
    ),
    'current_shadow_source_fingerprint', current_source_hash
  );
  expected_request := jsonb_build_object(
    'actor_id', 'step10b-production-auth-bootstrap',
    'contract_version', 'production-director-identity-bootstrap-v1',
    'current_shadow_source_fingerprint', current_source_hash,
    'email_identity_hash', email_hash,
    'environment', 'PRODUCTION',
    'operation', 'PRODUCTION_DIRECTOR_IDENTITY_IMPORT',
    'payload_fingerprint', payload_hash,
    'player_id', target_player,
    'project_ref', scope.project_ref,
    'project_url', scope.project_url,
    'source_fingerprint', source_hash,
    'source_workbook_id', scope.google_workbook_id,
    'tournament_id', '2026',
    'tournament_year', 2026
  );
  if source_value is distinct from expected_source
    or payload_value is distinct from expected_payload
    or input->'payload' is distinct from expected_payload
    or request_value is distinct from expected_request
    or encode(extensions.digest(source_text, 'sha256'), 'hex') <> source_hash
    or encode(extensions.digest(payload_text, 'sha256'), 'hex') <> payload_hash
    or encode(extensions.digest(request_text, 'sha256'), 'hex') <> request_hash then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_EVIDENCE_MISMATCH';
  end if;

  select value.* into current_shadow
  from production_control.current_shadow_revisions value
  where value.tournament_id = '2026'
  order by value.imported_at desc, value.import_run_id desc
  limit 1;
  if current_shadow.import_run_id is null
    or current_shadow.source_workbook_id <> scope.google_workbook_id
    or current_shadow.source_fingerprint <> current_source_hash then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_CURRENT_SHADOW_REQUIRED';
  end if;
  if not exists (
    select 1 from scoring_authority.tournament_players membership
    where membership.tournament_id = '2026'
      and membership.player_id = target_player
      and membership.participation_status = 'ACTIVE'
  ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_ACTIVE_PLAYER_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production-director-identity-bootstrap-2026', 0));
  select value.* into existing_run
  from participant_identity.identity_config_import_runs value
  where value.tournament_id = '2026'
    and value.source_system = 'PRODUCTION_OWNER_APPROVED_IDENTITY_EVIDENCE'
    and value.source_workbook_id = scope.google_workbook_id
    and value.source_fingerprint = source_hash
  order by value.requested_at desc
  limit 1 for update;
  if found then
    if existing_run.configuration_revision <= 0
      or existing_run.status not in ('REVIEW_REQUIRED', 'APPROVED')
      or existing_run.validation_report->>'contractVersion' <> 'production-director-identity-bootstrap-v1'
      or existing_run.validation_report->>'scope' <> 'ONE_PRODUCTION_DIRECTOR_CANDIDATE'
      or existing_run.validation_report->>'playerId' <> target_player
      or existing_run.validation_report->>'emailIdentityHash' <> email_hash
      or existing_run.validation_report->>'payloadFingerprint' <> payload_hash
      or existing_run.validation_report->>'currentShadowSourceFingerprint' <> current_source_hash
      or existing_run.validation_report->>'approvalEvidenceFingerprint' <> approval_evidence_hash
      or (select count(*) from participant_identity.identity_config_import_runs
          where tournament_id = '2026') <> 1
      or (select count(*) from participant_identity.participant_identity_contacts
          where tournament_id = '2026') <> 1
      or not exists (
        select 1 from participant_identity.participant_identity_contacts contact
        join participant_identity.identity_context_revisions revision
          on revision.tournament_id = contact.tournament_id
          and revision.context_revision = contact.configuration_revision
          and revision.configuration_fingerprint = source_hash
        where contact.tournament_id = '2026'
          and contact.player_id = target_player
          and contact.configuration_revision = existing_run.configuration_revision
          and contact.identity_active
          and contact.source_workbook_id = scope.google_workbook_id
          and encode(extensions.digest(contact.email_normalized, 'sha256'), 'hex') = email_hash
      ) then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_DIRECTOR_IDENTITY_DUPLICATE_DRIFT';
    end if;
    return jsonb_build_object('ok', true, 'runId', existing_run.run_id,
      'status', existing_run.status, 'configurationRevision', existing_run.configuration_revision,
      'sourceFingerprint', source_hash, 'payloadFingerprint', payload_hash,
      'playerId', target_player, 'duplicate', true, 'contactsImported', 1,
      'authUsersCreated', 0, 'authoritativeIdentityChanged', false,
      'googleWrite', false, 'previewRpcUsed', false);
  end if;

  if exists (select 1 from participant_identity.identity_config_import_runs where tournament_id = '2026')
    or exists (select 1 from participant_identity.participant_identity_contacts where tournament_id = '2026')
    or exists (select 1 from participant_identity.identity_context_revisions where tournament_id = '2026')
    or exists (select 1 from participant_identity.production_auth_candidates where tournament_id = '2026')
    or exists (select 1 from participant_identity.production_auth_preprovision_claims)
    or exists (select 1 from participant_identity.user_player_links)
    or exists (select 1 from participant_identity.participant_auth_identifiers)
    or exists (select 1 from participant_identity.participant_auth_otp_attempts)
    or exists (select 1 from auth.users) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_CLEAN_FOUNDATION_REQUIRED';
  end if;

  select count(*) into active_roster_count
  from scoring_authority.tournament_players
  where tournament_id = '2026' and participation_status = 'ACTIVE';
  if active_roster_count < 1 then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_ACTIVE_ROSTER_REQUIRED';
  end if;
  next_revision := 1;

  insert into participant_identity.identity_config_import_runs (
    run_id, tournament_id, source_system, source_workbook_id, source_fingerprint,
    configuration_revision, status, roster_count, received_count, valid_count,
    missing_count, duplicate_count, malformed_count, shared_count, inactive_count,
    unknown_player_count, mapping_conflict_count, validation_report, requested_by
  ) values (
    run_id_value, '2026', 'PRODUCTION_OWNER_APPROVED_IDENTITY_EVIDENCE',
    scope.google_workbook_id, source_hash, next_revision, 'REVIEW_REQUIRED',
    active_roster_count, 1, 1, greatest(active_roster_count - 1, 0), 0, 0, 0, 0, 0, 0,
    jsonb_build_object(
      'contractVersion', 'production-director-identity-bootstrap-v1',
      'scope', 'ONE_PRODUCTION_DIRECTOR_CANDIDATE',
      'boundedCandidateValid', true, 'fullRosterProjection', false,
      'explicitOwnerApprovalRequired', true,
      'playerId', target_player, 'emailIdentityHash', email_hash,
      'sourceFingerprint', source_hash, 'payloadFingerprint', payload_hash,
      'currentShadowSourceFingerprint', current_source_hash,
      'approvalEvidenceFingerprint', approval_evidence_hash,
      'evidenceReferenceHash', evidence_reference_hash,
      'approvedBy', approved_by_value, 'approvedAt', approved_at_text,
      'rawEmailStoredInValidationReport', false,
      'authUsersCreated', 0, 'googleWrite', false, 'previewRpcUsed', false
    ),
    'step10b-production-auth-bootstrap'
  );

  insert into participant_identity.participant_identity_contacts (
    tournament_id, player_id, email, email_normalized, identity_active,
    configuration_revision, verified_by, verified_at, source_system,
    source_workbook_id, source_updated_at
  ) values (
    '2026', target_player, normalized_email, normalized_email, true,
    next_revision, approved_by_value, approved_at_value,
    'PRODUCTION_OWNER_APPROVED_IDENTITY_EVIDENCE', scope.google_workbook_id,
    approved_at_value
  );
  insert into participant_identity.identity_context_revisions (
    tournament_id, context_revision, configuration_fingerprint, updated_by
  ) values ('2026', next_revision, source_hash, 'step10b-production-auth-bootstrap');
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, player_id, actor_name, request_id,
    configuration_revision, safe_metadata
  ) values (
    'PRODUCTION_DIRECTOR_IDENTITY_IMPORTED', '2026', target_player,
    'step10b-production-auth-bootstrap', run_id_value::text, next_revision,
    jsonb_build_object('sourceFingerprint', source_hash, 'payloadFingerprint', payload_hash,
      'approvalEvidenceFingerprint', approval_evidence_hash,
      'scope', 'ONE_PRODUCTION_DIRECTOR_CANDIDATE', 'rawEmailStoredInAudit', false,
      'authUsersCreated', 0, 'authoritativeIdentityChanged', false,
      'googleWrite', false, 'previewRpcUsed', false)
  );
  return jsonb_build_object('ok', true, 'runId', run_id_value,
    'status', 'REVIEW_REQUIRED', 'configurationRevision', next_revision,
    'sourceFingerprint', source_hash, 'payloadFingerprint', payload_hash,
    'playerId', target_player, 'duplicate', false, 'contactsImported', 1,
    'authUsersCreated', 0, 'authoritativeIdentityChanged', false,
    'googleWrite', false, 'previewRpcUsed', false);
end;
$$;
revoke all on function public.import_production_director_identity_projection(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.import_production_director_identity_projection(jsonb)
  to service_role;

create or replace function public.approve_production_director_identity_projection(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity, scoring_authority, auth, extensions, pg_temp
as $$
declare scope production_control.resource_scope%rowtype;
declare current_run participant_identity.identity_config_import_runs%rowtype;
declare request_value jsonb;
declare expected_request jsonb;
declare request_text text := coalesce(input->>'request_canonical_json', '');
declare request_hash text := lower(btrim(coalesce(input->>'request_fingerprint', '')));
declare source_hash text := lower(btrim(coalesce(input->>'identity_source_fingerprint', '')));
declare current_source_hash text := lower(btrim(coalesce(input->>'current_shadow_source_fingerprint', '')));
declare email_hash text := lower(btrim(coalesce(input->>'email_identity_hash', '')));
declare approval_evidence_hash text := lower(btrim(coalesce(input->>'approval_evidence_fingerprint', '')));
declare target_player text := upper(btrim(coalesce(input->>'player_id', '')));
declare target_run uuid := nullif(btrim(coalesce(input->>'run_id', '')), '')::uuid;
declare approved_by_value text;
declare approved_at_value timestamptz;
begin
  scope := production_control.assert_production_director_identity_bootstrap();
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PRODUCTION'
    or btrim(coalesce(input->>'project_ref', '')) <> scope.project_ref
    or btrim(coalesce(input->>'project_url', '')) <> scope.project_url
    or btrim(coalesce(input->>'source_workbook_id', '')) <> scope.google_workbook_id
    or btrim(coalesce(input->>'tournament_id', '')) <> '2026'
    or coalesce((input->>'tournament_year')::integer, 0) <> 2026
    or btrim(coalesce(input->>'contract_version', '')) <> 'production-director-identity-bootstrap-v1'
    or btrim(coalesce(input->>'operation', '')) <> 'PRODUCTION_DIRECTOR_IDENTITY_APPROVAL'
    or btrim(coalesce(input->>'actor_id', '')) <> 'step10b-production-auth-bootstrap'
    or target_run is null
    or target_player !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
    or source_hash !~ '^[0-9a-f]{64}$'
    or current_source_hash !~ '^[0-9a-f]{64}$'
    or email_hash !~ '^[0-9a-f]{64}$'
    or approval_evidence_hash !~ '^[0-9a-f]{64}$'
    or request_hash !~ '^[0-9a-f]{64}$'
    or btrim(request_text) = '' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_APPROVAL_EXACT_SCOPE_REQUIRED';
  end if;
  begin
    request_value := request_text::jsonb;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_APPROVAL_EVIDENCE_INVALID';
  end;
  expected_request := jsonb_build_object(
    'actor_id', 'step10b-production-auth-bootstrap',
    'approval_evidence_fingerprint', approval_evidence_hash,
    'contract_version', 'production-director-identity-bootstrap-v1',
    'current_shadow_source_fingerprint', current_source_hash,
    'email_identity_hash', email_hash,
    'environment', 'PRODUCTION',
    'identity_source_fingerprint', source_hash,
    'operation', 'PRODUCTION_DIRECTOR_IDENTITY_APPROVAL',
    'player_id', target_player,
    'project_ref', scope.project_ref,
    'project_url', scope.project_url,
    'run_id', target_run::text,
    'source_workbook_id', scope.google_workbook_id,
    'tournament_id', '2026',
    'tournament_year', 2026
  );
  if request_value is distinct from expected_request
    or encode(extensions.digest(request_text, 'sha256'), 'hex') <> request_hash then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_APPROVAL_EVIDENCE_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production-director-identity-bootstrap-2026', 0));
  select value.* into current_run
  from participant_identity.identity_config_import_runs value
  where value.run_id = target_run for update;
  if not found
    or current_run.tournament_id <> '2026'
    or current_run.source_system <> 'PRODUCTION_OWNER_APPROVED_IDENTITY_EVIDENCE'
    or current_run.source_workbook_id <> scope.google_workbook_id
    or current_run.source_fingerprint <> source_hash
    or current_run.configuration_revision <= 0
    or current_run.status not in ('REVIEW_REQUIRED', 'APPROVED')
    or current_run.validation_report->>'contractVersion' <> 'production-director-identity-bootstrap-v1'
    or current_run.validation_report->>'scope' <> 'ONE_PRODUCTION_DIRECTOR_CANDIDATE'
    or current_run.validation_report->>'playerId' <> target_player
    or current_run.validation_report->>'emailIdentityHash' <> email_hash
    or current_run.validation_report->>'currentShadowSourceFingerprint' <> current_source_hash
    or current_run.validation_report->>'approvalEvidenceFingerprint' <> approval_evidence_hash then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_APPROVAL_BOUND_IMPORT_REQUIRED';
  end if;
  if not exists (
    select 1 from production_control.current_shadow_revisions revision
    where revision.tournament_id = '2026'
      and revision.source_workbook_id = scope.google_workbook_id
      and revision.source_fingerprint = current_source_hash
      and revision.import_run_id = (
        select latest.import_run_id
        from production_control.current_shadow_revisions latest
        where latest.tournament_id = '2026'
        order by latest.imported_at desc, latest.import_run_id desc
        limit 1
      )
  ) or not exists (
    select 1 from participant_identity.participant_identity_contacts contact
    join participant_identity.identity_context_revisions revision
      on revision.tournament_id = contact.tournament_id
      and revision.context_revision = contact.configuration_revision
      and revision.configuration_fingerprint = source_hash
    where contact.tournament_id = '2026'
      and contact.player_id = target_player
      and contact.configuration_revision = current_run.configuration_revision
      and contact.identity_active
      and contact.source_workbook_id = scope.google_workbook_id
      and encode(extensions.digest(contact.email_normalized, 'sha256'), 'hex') = email_hash
  ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_APPROVAL_SOURCE_ADVANCED';
  end if;

  approved_by_value := current_run.validation_report->>'approvedBy';
  approved_at_value := nullif(current_run.validation_report->>'approvedAt', '')::timestamptz;
  -- Older drafts of this migration did not persist these two safe approval
  -- fields. Derive them from the contact only when they match the exact run.
  if btrim(coalesce(approved_by_value, '')) = '' or approved_at_value is null then
    select contact.verified_by, contact.verified_at into approved_by_value, approved_at_value
    from participant_identity.participant_identity_contacts contact
    where contact.tournament_id = '2026' and contact.player_id = target_player
      and contact.configuration_revision = current_run.configuration_revision;
  end if;
  if btrim(coalesce(approved_by_value, '')) = '' or approved_at_value is null then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DIRECTOR_IDENTITY_OWNER_APPROVAL_REQUIRED';
  end if;

  if current_run.status = 'APPROVED' then
    if current_run.approved_by is distinct from approved_by_value
      or current_run.approved_at is distinct from approved_at_value then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_DIRECTOR_IDENTITY_APPROVAL_DRIFT';
    end if;
    return jsonb_build_object('ok', true, 'runId', current_run.run_id,
      'status', 'APPROVED', 'configurationRevision', current_run.configuration_revision,
      'sourceFingerprint', source_hash, 'playerId', target_player,
      'duplicate', true, 'authUsersCreated', 0,
      'authoritativeIdentityChanged', false, 'googleWrite', false,
      'previewRpcUsed', false);
  end if;

  update participant_identity.identity_config_import_runs set
    status = 'APPROVED', approved_by = approved_by_value,
    approved_at = approved_at_value, updated_at = now()
  where run_id = current_run.run_id;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, player_id, actor_name, request_id,
    configuration_revision, safe_metadata
  ) values (
    'PRODUCTION_DIRECTOR_IDENTITY_APPROVED', '2026', target_player,
    approved_by_value, current_run.run_id::text, current_run.configuration_revision,
    jsonb_build_object('sourceFingerprint', source_hash,
      'approvalEvidenceFingerprint', approval_evidence_hash,
      'scope', 'ONE_PRODUCTION_DIRECTOR_CANDIDATE', 'rawEmailStoredInAudit', false,
      'authUsersCreated', 0, 'authoritativeIdentityChanged', false,
      'googleWrite', false, 'previewRpcUsed', false)
  );
  return jsonb_build_object('ok', true, 'runId', current_run.run_id,
    'status', 'APPROVED', 'configurationRevision', current_run.configuration_revision,
    'sourceFingerprint', source_hash, 'playerId', target_player,
    'duplicate', false, 'authUsersCreated', 0,
    'authoritativeIdentityChanged', false, 'googleWrite', false,
    'previewRpcUsed', false);
end;
$$;
revoke all on function public.approve_production_director_identity_projection(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.approve_production_director_identity_projection(jsonb)
  to service_role;

commit;
