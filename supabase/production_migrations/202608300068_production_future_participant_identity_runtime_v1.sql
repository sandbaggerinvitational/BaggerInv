-- Step 13E.7A future-tournament participant identity runtime V1.
--
-- This migration is inert. It leaves the frozen 2026 participant identity
-- cutover functions and evidence unchanged. A future annual runtime may bind
-- only already-linked, verified global Player identities; other active roster
-- members remain explicitly NOT_ENROLLED. No Auth user is created here.
begin;

create or replace function production_control.bind_future_participant_identity_runtime_v1(
  target_tournament_id text,
  target_runtime_generation_id uuid,
  target_authority_generation_id uuid,
  target_admission_generation_id uuid,
  target_actor_player_id text,
  target_actor_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_identity_bind$
declare
  resource production_control.resource_scope%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  source_context participant_identity.identity_context_revisions%rowtype;
  source_run participant_identity.identity_config_import_runs%rowtype;
  existing participant_identity.future_tournament_identity_contexts_v1%rowtype;
  roster_count_value integer;
  enrolled_count_value integer;
  not_enrolled_count_value integer;
  binding_fingerprint_value text;
  source_manifest jsonb;
begin
  perform production_control.assert_production_service_role();
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = pg_catalog.btrim(target_tournament_id)
  for update;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = catalog.tournament_id
    and value.runtime_generation_id = target_runtime_generation_id
  for update;
  if catalog.tournament_year <= 2026
     or catalog.lifecycle <> 'READY_FOR_ACTIVATION'
     or generation.generation_status <> 'PREPARED'
     or generation.authority_generation_id <> target_authority_generation_id
     or generation.admission_generation_id <> target_admission_generation_id
     or target_runtime_generation_id in (
       target_authority_generation_id, target_admission_generation_id
     )
     or target_authority_generation_id = target_admission_generation_id
     or generation.authority <> 'SUPABASE'
     or generation.ingress_state <> 'OPEN'
     or target_actor_player_id is null
     or target_actor_auth_user_id is null then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_BINDING_SCOPE_INVALID';
  end if;
  if resource.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or resource.project_url <> 'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or pg_catalog.btrim(coalesce(resource.google_workbook_id, '')) = '' then
    raise exception using errcode = '42501',
      message = 'FUTURE_PARTICIPANT_IDENTITY_RESOURCE_MISMATCH';
  end if;

  select value.* into strict source_context
  from participant_identity.identity_context_revisions value
  where value.tournament_id = '2026';
  select value.* into strict source_run
  from participant_identity.identity_config_import_runs value
  where value.tournament_id = '2026'
    and value.configuration_revision = source_context.context_revision
    and value.source_fingerprint = source_context.configuration_fingerprint
    and value.status = 'APPROVED' and value.approved_at is not null
  order by value.approved_at desc, value.requested_at desc limit 1;
  if source_context.configuration_fingerprint !~ '^[0-9a-f]{64}$'
     or source_run.source_workbook_id is distinct from resource.google_workbook_id then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_SOURCE_NOT_CERTIFIED';
  end if;

  select pg_catalog.count(*)::integer into roster_count_value
  from scoring_authority.tournament_players membership
  where membership.tournament_id = catalog.tournament_id
    and membership.participation_status = 'ACTIVE';
  if roster_count_value < 1 then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_ROSTER_REQUIRED';
  end if;

  with eligible as (
    select membership.player_id, link.auth_user_id, link.link_revision,
      contact.configuration_revision,
      encode(extensions.digest(
        concat_ws('|', contact.player_id, contact.email_normalized,
          contact.configuration_revision::text)::text, 'sha256'), 'hex') contact_fingerprint
    from scoring_authority.tournament_players membership
    join participant_identity.participant_identity_contacts contact
      on contact.tournament_id = '2026'
     and contact.player_id = membership.player_id and contact.identity_active
     and contact.configuration_revision = source_context.context_revision
     and contact.source_workbook_id = resource.google_workbook_id
    join participant_identity.user_player_links link
      on link.player_id = membership.player_id and link.status = 'ACTIVE'
     and link.revoked_at is null
     and link.email_identity_hash = encode(extensions.digest(
       contact.email_normalized::text, 'sha256'), 'hex')
    join participant_identity.participant_auth_identifiers identifier
      on identifier.player_id = membership.player_id
     and identifier.auth_user_id = link.auth_user_id
     and identifier.identifier_type = 'EMAIL'
     and identifier.status = 'VERIFIED'
     and identifier.normalized_value_private = contact.email_normalized
    join auth.users auth_user on auth_user.id = link.auth_user_id
     and auth_user.email_confirmed_at is not null
     and pg_catalog.lower(pg_catalog.btrim(coalesce(auth_user.email, '')))
       = contact.email_normalized
    where membership.tournament_id = catalog.tournament_id
      and membership.participation_status = 'ACTIVE'
      and split_part(contact.email_normalized, '@', 2)
        !~* '(^|\.)(example\.(com|net|org)|invalid|test|localhost)$'
  )
  select pg_catalog.count(*)::integer into enrolled_count_value from eligible;
  not_enrolled_count_value := roster_count_value - enrolled_count_value;
  if enrolled_count_value < 1 or not exists (
    select 1
    from scoring_authority.tournament_players membership
    join participant_identity.user_player_links link
      on link.player_id = membership.player_id and link.status = 'ACTIVE'
     and link.auth_user_id = target_actor_auth_user_id
    join participant_identity.participant_auth_identifiers identifier
      on identifier.player_id = link.player_id
     and identifier.auth_user_id = link.auth_user_id
     and identifier.identifier_type = 'EMAIL' and identifier.status = 'VERIFIED'
    join participant_identity.participant_identity_contacts contact
      on contact.tournament_id = '2026' and contact.player_id = link.player_id
     and contact.identity_active
     and contact.configuration_revision = source_context.context_revision
     and contact.source_workbook_id = resource.google_workbook_id
     and contact.email_normalized = identifier.normalized_value_private
    join auth.users auth_user on auth_user.id = link.auth_user_id
     and auth_user.email_confirmed_at is not null
    join production_control.tournament_owner_capabilities_v1 owner_value
      on owner_value.tournament_id = '2026'
     and owner_value.player_id = membership.player_id
     and owner_value.auth_user_id = link.auth_user_id
     and owner_value.status = 'ACTIVE' and owner_value.revoked_at is null
    where membership.tournament_id = catalog.tournament_id
      and membership.participation_status = 'ACTIVE'
      and membership.player_id = target_actor_player_id
  ) then
    raise exception using errcode = '42501',
      message = 'FUTURE_PARTICIPANT_IDENTITY_OWNER_ENROLLMENT_REQUIRED';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'playerId', membership.player_id,
    'state', case when link.player_id is null then 'NOT_ENROLLED' else 'ENROLLED' end,
    'sourceContactFingerprint', case when link.player_id is null then null else
      encode(extensions.digest(concat_ws('|', contact.player_id,
        contact.email_normalized, contact.configuration_revision::text)::text,
        'sha256'), 'hex') end,
    'linkRevision', link.link_revision
  ) order by membership.player_id), '[]'::jsonb)
  into source_manifest
  from scoring_authority.tournament_players membership
  left join participant_identity.participant_identity_contacts contact
    on contact.tournament_id = '2026' and contact.player_id = membership.player_id
   and contact.identity_active
   and contact.configuration_revision = source_context.context_revision
   and contact.source_workbook_id = resource.google_workbook_id
  left join participant_identity.user_player_links link
    on link.player_id = membership.player_id and link.status = 'ACTIVE'
   and link.revoked_at is null and contact.player_id is not null
   and link.email_identity_hash = encode(extensions.digest(
     contact.email_normalized::text, 'sha256'), 'hex')
   and exists (select 1
     from participant_identity.participant_auth_identifiers identifier
     join auth.users auth_user on auth_user.id = identifier.auth_user_id
       and auth_user.email_confirmed_at is not null
       and pg_catalog.lower(pg_catalog.btrim(coalesce(auth_user.email, '')))
         = identifier.normalized_value_private
     where identifier.player_id = link.player_id
       and identifier.auth_user_id = link.auth_user_id
       and identifier.identifier_type = 'EMAIL'
       and identifier.status = 'VERIFIED'
       and identifier.normalized_value_private = contact.email_normalized)
  where membership.tournament_id = catalog.tournament_id
    and membership.participation_status = 'ACTIVE';
  binding_fingerprint_value := encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'contract', 'production-future-participant-identity-context-v1',
      'tournamentId', catalog.tournament_id,
      'runtimeGenerationId', target_runtime_generation_id,
      'sourceTournamentId', '2026',
      'sourceContextRevision', source_context.context_revision,
      'sourceConfigurationFingerprint', source_context.configuration_fingerprint,
      'roster', source_manifest
    )::text, 'UTF8'), 'sha256'), 'hex');

  select value.* into existing
  from participant_identity.future_tournament_identity_contexts_v1 value
  where value.tournament_id = catalog.tournament_id;
  if existing.tournament_id is not null then
    if existing.binding_fingerprint <> binding_fingerprint_value
       or existing.roster_count <> roster_count_value
       or existing.enrolled_count <> enrolled_count_value then
      raise exception using errcode = '40001',
        message = 'FUTURE_PARTICIPANT_IDENTITY_BINDING_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'tournamentId', catalog.tournament_id,
      'rosterCount', existing.roster_count,
      'enrolledCount', existing.enrolled_count,
      'notEnrolledCount', existing.not_enrolled_count,
      'bindingRevision', existing.binding_revision,
      'bindingFingerprint', existing.binding_fingerprint,
      'idempotent', true
    );
  end if;

  insert into participant_identity.future_tournament_identity_contexts_v1 (
    tournament_id, contract_version, binding_revision,
    source_identity_tournament_id, source_context_revision,
    source_configuration_fingerprint, binding_fingerprint,
    roster_count, enrolled_count, not_enrolled_count, status,
    certified_by_player_id, certified_by_auth_user_id
  ) values (
    catalog.tournament_id, 'production-future-participant-identity-context-v1',
    1, '2026', source_context.context_revision,
    source_context.configuration_fingerprint, binding_fingerprint_value,
    roster_count_value, enrolled_count_value, not_enrolled_count_value,
    'CERTIFIED', target_actor_player_id, target_actor_auth_user_id
  );

  insert into participant_identity.future_tournament_participant_bindings_v1 (
    tournament_id, player_id, enrollment_state,
    source_identity_tournament_id, source_configuration_revision,
    source_contact_fingerprint, bound_link_revision, binding_revision
  )
  select catalog.tournament_id, membership.player_id,
    case when link.player_id is null then 'NOT_ENROLLED' else 'ENROLLED' end,
    case when link.player_id is null then null else '2026' end,
    case when link.player_id is null then null else contact.configuration_revision end,
    case when link.player_id is null then null else encode(extensions.digest(
      concat_ws('|', contact.player_id, contact.email_normalized,
        contact.configuration_revision::text)::text, 'sha256'), 'hex') end,
    link.link_revision, 1
  from scoring_authority.tournament_players membership
  left join participant_identity.participant_identity_contacts contact
    on contact.tournament_id = '2026' and contact.player_id = membership.player_id
   and contact.identity_active
   and contact.configuration_revision = source_context.context_revision
   and contact.source_workbook_id = resource.google_workbook_id
  left join participant_identity.user_player_links link
    on link.player_id = membership.player_id and link.status = 'ACTIVE'
   and link.revoked_at is null and contact.player_id is not null
   and link.email_identity_hash = encode(extensions.digest(
     contact.email_normalized::text, 'sha256'), 'hex')
   and exists (select 1 from participant_identity.participant_auth_identifiers identifier
     join auth.users auth_user on auth_user.id = identifier.auth_user_id
       and auth_user.email_confirmed_at is not null
       and pg_catalog.lower(pg_catalog.btrim(coalesce(auth_user.email, '')))
         = identifier.normalized_value_private
     where identifier.player_id = link.player_id
       and identifier.auth_user_id = link.auth_user_id
       and identifier.identifier_type = 'EMAIL'
       and identifier.status = 'VERIFIED'
       and identifier.normalized_value_private = contact.email_normalized)
  where membership.tournament_id = catalog.tournament_id
    and membership.participation_status = 'ACTIVE';

  insert into participant_identity.identity_context_revisions (
    tournament_id, context_revision, configuration_fingerprint,
    updated_by
  ) values (
    catalog.tournament_id, 1, binding_fingerprint_value,
    'future-runtime-identity-binding-v1'
  );
  insert into participant_identity.identity_config_import_runs (
    tournament_id, source_system, source_workbook_id,
    source_fingerprint, configuration_revision, status,
    roster_count, received_count, valid_count, missing_count,
    duplicate_count, malformed_count, shared_count, inactive_count,
    unknown_player_count, mapping_conflict_count, validation_report,
    requested_by, approved_by, approved_at
  ) values (
    catalog.tournament_id, 'PRODUCTION_FUTURE_RUNTIME_BINDING',
    resource.google_workbook_id, binding_fingerprint_value, 1, 'APPROVED',
    roster_count_value, enrolled_count_value, enrolled_count_value,
    not_enrolled_count_value, 0, 0, 0, 0, 0, 0,
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-future-participant-identity-context-v1',
      'partialRosterPolicy', true, 'rawIdentifiersStoredInReport', false
    ), 'future-runtime-identity-binding-v1', target_actor_player_id,
    pg_catalog.clock_timestamp()
  );
  insert into participant_identity.participant_identity_contacts (
    tournament_id, player_id, email, email_normalized, identity_active,
    configuration_revision, verified_by, verified_at, source_system,
    source_workbook_id, source_updated_at
  )
  select catalog.tournament_id, source_contact.player_id,
    source_contact.email, source_contact.email_normalized, true, 1,
    'future-runtime-identity-binding-v1', pg_catalog.clock_timestamp(),
    'PRODUCTION_FUTURE_RUNTIME_BINDING', resource.google_workbook_id,
    source_contact.updated_at
  from participant_identity.participant_identity_contacts source_contact
  join participant_identity.future_tournament_participant_bindings_v1 binding
    on binding.tournament_id = catalog.tournament_id
   and binding.player_id = source_contact.player_id
   and binding.enrollment_state = 'ENROLLED'
  where source_contact.tournament_id = '2026'
    and source_contact.identity_active
    and source_contact.configuration_revision = source_context.context_revision;

  insert into participant_identity.tournament_roles (
    tournament_id, auth_user_id, role, role_active, granted_by
  )
  select catalog.tournament_id, link.auth_user_id, 'PARTICIPANT', true,
    'future-runtime-identity-binding-v1'
  from participant_identity.future_tournament_participant_bindings_v1 binding
  join participant_identity.user_player_links link
    on link.player_id = binding.player_id and link.status = 'ACTIVE'
   and link.revoked_at is null
  where binding.tournament_id = catalog.tournament_id
    and binding.enrollment_state = 'ENROLLED'
  on conflict (tournament_id, auth_user_id, role) do update set
    role_active = true, revoked_at = null, revoked_by = null,
    role_revision = participant_identity.tournament_roles.role_revision + 1,
    updated_at = pg_catalog.clock_timestamp();
  insert into participant_identity.tournament_roles (
    tournament_id, auth_user_id, role, role_active, granted_by
  ) values (
    catalog.tournament_id, target_actor_auth_user_id, 'DIRECTOR', true,
    'future-runtime-owner-activation-v1'
  ) on conflict (tournament_id, auth_user_id, role) do update set
    role_active = true, revoked_at = null, revoked_by = null,
    role_revision = participant_identity.tournament_roles.role_revision + 1,
    updated_at = pg_catalog.clock_timestamp();
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, player_id, actor_id, actor_name,
    configuration_revision, safe_metadata
  ) values (
    'FUTURE_TOURNAMENT_IDENTITY_RUNTIME_BOUND', catalog.tournament_id,
    target_actor_player_id, target_actor_player_id,
    'future-runtime-owner-activation-v1', 1,
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-future-participant-identity-context-v1',
      'rosterCount', roster_count_value,
      'enrolledCount', enrolled_count_value,
      'notEnrolledCount', not_enrolled_count_value,
      'rawIdentifiersStoredInAudit', false,
      'authUsersCreated', false
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'tournamentId', catalog.tournament_id,
    'rosterCount', roster_count_value,
    'enrolledCount', enrolled_count_value,
    'notEnrolledCount', not_enrolled_count_value,
    'bindingRevision', 1,
    'bindingFingerprint', binding_fingerprint_value,
    'idempotent', false
  );
end;
$future_identity_bind$;

create or replace function production_control.assert_future_participant_identity_runtime_v1()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $future_identity_assert$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  context participant_identity.future_tournament_identity_contexts_v1%rowtype;
begin
  perform production_control.assert_production_service_role();
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = pointer.tournament_id;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE';
  select value.* into strict context
  from participant_identity.future_tournament_identity_contexts_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.status = 'CERTIFIED';
  if pointer.tournament_year <= 2026 or catalog.lifecycle <> 'ACTIVE'
     or catalog.lifecycle_revision <> pointer.lifecycle_revision
     or generation.pointer_revision <> pointer.pointer_revision
     or generation.authority <> 'SUPABASE'
     or generation.ingress_state <> 'OPEN'
     or context.roster_count <> (
       select pg_catalog.count(*) from scoring_authority.tournament_players membership
       where membership.tournament_id = pointer.tournament_id
         and membership.participation_status = 'ACTIVE'
     ) or context.enrolled_count <> (
       select pg_catalog.count(*)
       from participant_identity.future_tournament_participant_bindings_v1 binding
       where binding.tournament_id = pointer.tournament_id
         and binding.enrollment_state = 'ENROLLED'
     ) or exists (
       select 1
       from participant_identity.future_tournament_participant_bindings_v1 binding
       where binding.tournament_id = pointer.tournament_id
         and binding.enrollment_state = 'ENROLLED'
         and not exists (
           select 1
           from participant_identity.participant_identity_contacts contact
           join participant_identity.user_player_links link
             on link.player_id = contact.player_id and link.status = 'ACTIVE'
            and link.revoked_at is null
           join auth.users auth_user on auth_user.id = link.auth_user_id
            and auth_user.email_confirmed_at is not null
           join participant_identity.participant_auth_identifiers identifier
             on identifier.player_id = link.player_id
            and identifier.auth_user_id = link.auth_user_id
            and identifier.identifier_type = 'EMAIL'
            and identifier.status = 'VERIFIED'
            and identifier.normalized_value_private = contact.email_normalized
           join participant_identity.tournament_roles role_value
             on role_value.tournament_id = pointer.tournament_id
            and role_value.auth_user_id = link.auth_user_id
            and role_value.role = 'PARTICIPANT' and role_value.role_active
            and role_value.revoked_at is null
           where contact.tournament_id = pointer.tournament_id
             and contact.player_id = binding.player_id and contact.identity_active
         )
     ) then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_RUNTIME_REQUIRED';
  end if;
  return pointer.tournament_id;
end;
$future_identity_assert$;

create or replace function public.read_production_future_participant_context_for_auth_v1(
  target_auth_user_id uuid, target_tournament_id text default null
)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog
as $future_context_auth$
declare target_id text; target_player text; context_value jsonb;
begin
  target_id := production_control.assert_future_participant_identity_runtime_v1();
  if target_auth_user_id is null
     or nullif(pg_catalog.btrim(coalesce(target_tournament_id, '')), '')
       is distinct from target_id then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  select link.player_id into target_player
  from participant_identity.user_player_links link
  join auth.users auth_user on auth_user.id = link.auth_user_id
    and auth_user.email_confirmed_at is not null
  join participant_identity.future_tournament_participant_bindings_v1 binding
    on binding.tournament_id = target_id and binding.player_id = link.player_id
    and binding.enrollment_state = 'ENROLLED'
  join participant_identity.participant_identity_contacts contact
    on contact.tournament_id = target_id and contact.player_id = link.player_id
    and contact.identity_active
  join participant_identity.participant_auth_identifiers identifier
    on identifier.player_id = link.player_id
    and identifier.auth_user_id = link.auth_user_id
    and identifier.identifier_type = 'EMAIL' and identifier.status = 'VERIFIED'
    and identifier.normalized_value_private = contact.email_normalized
  join participant_identity.tournament_roles role_value
    on role_value.tournament_id = target_id
    and role_value.auth_user_id = link.auth_user_id
    and role_value.role = 'PARTICIPANT' and role_value.role_active
    and role_value.revoked_at is null
  where link.auth_user_id = target_auth_user_id and link.status = 'ACTIVE'
    and link.revoked_at is null;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false,
      'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED');
  end if;
  context_value := public.read_participant_identity_context(target_id, target_player);
  if coalesce((context_value->>'ok')::boolean, false) then
    return pg_catalog.jsonb_set(context_value, '{data,authUserId}',
      pg_catalog.to_jsonb(target_auth_user_id), true);
  end if;
  return context_value;
end;
$future_context_auth$;

create or replace function public.read_production_future_participant_player_context_v1(
  target_tournament_id text, target_player_id text
)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog
as $future_context_player$
declare target_id text; target_user uuid;
begin
  target_id := production_control.assert_future_participant_identity_runtime_v1();
  if pg_catalog.btrim(coalesce(target_tournament_id, '')) <> target_id then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  select link.auth_user_id into target_user
  from participant_identity.user_player_links link
  join participant_identity.future_tournament_participant_bindings_v1 binding
    on binding.tournament_id = target_id and binding.player_id = link.player_id
    and binding.enrollment_state = 'ENROLLED'
  where link.player_id = pg_catalog.btrim(target_player_id)
    and link.status = 'ACTIVE' and link.revoked_at is null;
  if not found then return pg_catalog.jsonb_build_object('ok', false,
    'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;
  return public.read_production_future_participant_context_for_auth_v1(
    target_user, target_id
  );
end;
$future_context_player$;

create or replace function public.authorize_production_future_participant_otp_request_v1(input jsonb)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $future_otp_authorize$
declare
  target_id text;
  normalized text := pg_catalog.lower(pg_catalog.btrim(coalesce(input->>'email', '')));
  client_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(input->>'client_request_hash', '')));
  email_hash text := encode(extensions.digest(normalized::text, 'sha256'), 'hex');
  request_value uuid := extensions.gen_random_uuid();
  target_player text; target_user uuid; reason text := 'NOT_ELIGIBLE';
begin
  target_id := production_control.assert_future_participant_identity_runtime_v1();
  if client_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode = '22023',
    message = 'PRODUCTION_AUTH_HASHED_REQUEST_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.least('client:' || client_hash, 'email:' || email_hash), 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.greatest('client:' || client_hash, 'email:' || email_hash), 0));
  if (select pg_catalog.count(*) from participant_identity.participant_auth_otp_attempts
      where client_request_hash = client_hash and requested_at > pg_catalog.clock_timestamp() - interval '15 minutes') < 5
     and (select pg_catalog.count(*) from participant_identity.participant_auth_otp_attempts
      where email_identity_hash = email_hash and requested_at > pg_catalog.clock_timestamp() - interval '15 minutes') < 3 then
    select binding.player_id, link.auth_user_id into target_player, target_user
    from participant_identity.future_tournament_participant_bindings_v1 binding
    join participant_identity.participant_identity_contacts contact
      on contact.tournament_id = binding.tournament_id and contact.player_id = binding.player_id
      and contact.identity_active and contact.email_normalized = normalized
    join participant_identity.user_player_links link
      on link.player_id = binding.player_id and link.status = 'ACTIVE' and link.revoked_at is null
    join participant_identity.participant_auth_identifiers identifier
      on identifier.player_id = link.player_id and identifier.auth_user_id = link.auth_user_id
      and identifier.identifier_type = 'EMAIL' and identifier.status = 'VERIFIED'
      and identifier.normalized_value_private = normalized
    join auth.users auth_user on auth_user.id = link.auth_user_id
      and auth_user.email_confirmed_at is not null
      and pg_catalog.lower(pg_catalog.btrim(coalesce(auth_user.email, ''))) = normalized
    where binding.tournament_id = target_id and binding.enrollment_state = 'ENROLLED';
    if found and not exists (
      select 1 from participant_identity.participant_auth_otp_attempts attempt
      where attempt.player_id = target_player and attempt.status in ('AUTHORIZED','SENT')
        and attempt.requested_at > pg_catalog.clock_timestamp() - interval '60 seconds'
    ) then reason := 'APPROVED'; elsif found then reason := 'COOLDOWN'; end if;
  end if;
  insert into participant_identity.participant_auth_otp_attempts (
    request_id, tournament_id, player_id, auth_user_id,
    email_identity_hash, client_request_hash, status, safe_reason,
    verification_type
  ) values (
    request_value, case when reason = 'APPROVED' then target_id else null end,
    case when reason = 'APPROVED' then target_player else null end,
    case when reason = 'APPROVED' then target_user else null end,
    email_hash, client_hash,
    case when reason = 'APPROVED' then 'AUTHORIZED' else 'REJECTED' end,
    reason, 'email'
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'allowed', reason = 'APPROVED', 'requestId', request_value,
    'email', case when reason = 'APPROVED' then normalized else null end,
    'authUserId', case when reason = 'APPROVED' then target_user else null end,
    'playerId', case when reason = 'APPROVED' then target_player else null end,
    'verificationType', case when reason = 'APPROVED' then 'email' else null end,
    'provisioningRequired', false
  );
end;
$future_otp_authorize$;

create or replace function public.record_production_future_participant_otp_delivery_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $future_otp_delivery$
declare target_id text; request_value uuid := nullif(input->>'request_id', '')::uuid;
  succeeded boolean := coalesce((input->>'succeeded')::boolean, false);
  safe_reason text := pg_catalog.upper(pg_catalog.btrim(coalesce(input->>'safe_reason', 'AUTH_EMAIL_SEND_FAILED')));
begin
  target_id := production_control.assert_future_participant_identity_runtime_v1();
  if safe_reason not in ('AUTH_CAPTCHA_REJECTED','AUTH_SUPABASE_RATE_LIMITED',
    'AUTH_SMTP_PROVIDER_RATE_LIMITED','AUTH_EMAIL_RATE_LIMITED_UNKNOWN_SOURCE',
    'AUTH_EMAIL_CONFIGURATION_FAILED','AUTH_SMTP_PROVIDER_REJECTED',
    'AUTH_EMAIL_SERVICE_UNAVAILABLE','AUTH_EMAIL_SEND_FAILED') then
    safe_reason := 'AUTH_EMAIL_SEND_FAILED'; end if;
  update participant_identity.participant_auth_otp_attempts set
    status = case when succeeded then 'SENT' else 'DELIVERY_FAILED' end,
    safe_reason = case when succeeded then 'DELIVERY_ACCEPTED' else safe_reason end,
    request_duration_ms = pg_catalog.greatest(0, coalesce((input->>'duration_ms')::integer, 0)),
    sent_at = case when succeeded then pg_catalog.clock_timestamp() else sent_at end,
    updated_at = pg_catalog.clock_timestamp()
  where request_id = request_value and tournament_id = target_id and status = 'AUTHORIZED';
  if not found then raise exception using errcode = 'P0001',
    message = 'PRODUCTION_PARTICIPANT_OTP_NOT_AUTHORIZED'; end if;
  return pg_catalog.jsonb_build_object('ok', true, 'requestId', request_value,
    'status', case when succeeded then 'SENT' else 'DELIVERY_FAILED' end);
end;
$future_otp_delivery$;

create or replace function public.authorize_production_future_participant_otp_verification_v1(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $future_otp_verify_authorize$
declare target_id text; attempt participant_identity.participant_auth_otp_attempts%rowtype;
  request_value uuid := nullif(input->>'request_id', '')::uuid;
  email_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(input->>'email_identity_hash', '')));
begin
  target_id := production_control.assert_future_participant_identity_runtime_v1();
  select value.* into attempt from participant_identity.participant_auth_otp_attempts value
  join participant_identity.future_tournament_participant_bindings_v1 binding
    on binding.tournament_id = value.tournament_id and binding.player_id = value.player_id
    and binding.enrollment_state = 'ENROLLED'
  where value.request_id = request_value and value.tournament_id = target_id
    and value.status = 'SENT' and value.email_identity_hash = email_hash
    and value.sent_at > pg_catalog.clock_timestamp() - interval '15 minutes';
  if not found then return pg_catalog.jsonb_build_object('ok', true, 'allowed', false); end if;
  return pg_catalog.jsonb_build_object('ok', true, 'allowed', true,
    'authUserId', attempt.auth_user_id, 'playerId', attempt.player_id,
    'tournamentId', attempt.tournament_id,
    'verificationType', attempt.verification_type);
end;
$future_otp_verify_authorize$;

create or replace function production_control.certify_production_future_participant_otp_v1(
  target_request_id uuid, target_auth_user_id uuid,
  target_duration_ms integer, recovery boolean default false
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $future_otp_certify$
declare target_id text; attempt participant_identity.participant_auth_otp_attempts%rowtype;
begin
  target_id := production_control.assert_future_participant_identity_runtime_v1();
  select value.* into attempt from participant_identity.participant_auth_otp_attempts value
  where value.request_id = target_request_id and value.tournament_id = target_id for update;
  if not found or attempt.auth_user_id is distinct from target_auth_user_id
     or not exists (select 1 from participant_identity.user_player_links link
       join auth.users auth_user on auth_user.id = link.auth_user_id
         and auth_user.email_confirmed_at is not null
       join participant_identity.participant_auth_identifiers identifier
         on identifier.player_id = link.player_id and identifier.auth_user_id = link.auth_user_id
         and identifier.identifier_type = 'EMAIL' and identifier.status = 'VERIFIED'
         and encode(extensions.digest(identifier.normalized_value_private::text, 'sha256'), 'hex')
           = attempt.email_identity_hash
       join participant_identity.future_tournament_participant_bindings_v1 binding
         on binding.tournament_id = target_id and binding.player_id = link.player_id
         and binding.enrollment_state = 'ENROLLED'
       where link.auth_user_id = target_auth_user_id and link.player_id = attempt.player_id
         and link.status = 'ACTIVE' and link.revoked_at is null) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PARTICIPANT_OTP_IDENTITY_MISMATCH';
  end if;
  if attempt.status = 'VERIFIED' then return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 'VERIFIED', 'duplicate', true, 'recovered', recovery); end if;
  if attempt.status <> 'SENT' then raise exception using errcode = '42501',
    message = 'PRODUCTION_PARTICIPANT_OTP_NOT_AWAITING_VERIFICATION'; end if;
  update participant_identity.participant_auth_otp_attempts set
    status = 'VERIFIED', safe_reason = 'SESSION_ESTABLISHED',
    verification_duration_ms = pg_catalog.greatest(0, coalesce(target_duration_ms, 0)),
    verified_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
  where request_id = target_request_id and status = 'SENT';
  insert into participant_identity.tournament_roles (
    tournament_id, auth_user_id, role, role_active, granted_by
  ) values (target_id, target_auth_user_id, 'PARTICIPANT', true,
    'future-runtime-email-otp-v1')
  on conflict (tournament_id, auth_user_id, role) do update set
    role_active = true, revoked_at = null, revoked_by = null,
    role_revision = participant_identity.tournament_roles.role_revision + 1,
    updated_at = pg_catalog.clock_timestamp();
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id,
    actor_name, request_id, safe_metadata
  ) values ('FUTURE_TOURNAMENT_PARTICIPANT_AUTH_VERIFIED', target_id,
    target_auth_user_id, attempt.player_id, 'future-runtime-email-otp-v1',
    target_request_id::text,
    pg_catalog.jsonb_build_object('result', 'VERIFIED', 'recovered', recovery,
      'otpStored', false));
  return pg_catalog.jsonb_build_object('ok', true, 'status', 'VERIFIED',
    'duplicate', false, 'recovered', recovery);
end;
$future_otp_certify$;

create or replace function public.record_production_future_participant_otp_verification_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $future_otp_verify$
declare target_id text; request_value uuid := nullif(input->>'request_id', '')::uuid;
  target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
begin
  target_id := production_control.assert_future_participant_identity_runtime_v1();
  if coalesce((input->>'succeeded')::boolean, false) then
    return production_control.certify_production_future_participant_otp_v1(
      request_value, target_user,
      pg_catalog.greatest(0, coalesce((input->>'duration_ms')::integer, 0)), false);
  end if;
  update participant_identity.participant_auth_otp_attempts set
    status = 'VERIFICATION_FAILED', safe_reason = 'INVALID_OR_EXPIRED_CODE',
    verification_duration_ms = pg_catalog.greatest(0, coalesce((input->>'duration_ms')::integer, 0)),
    updated_at = pg_catalog.clock_timestamp()
  where request_id = request_value and tournament_id = target_id and status = 'SENT';
  return pg_catalog.jsonb_build_object('ok', true, 'status', 'VERIFICATION_FAILED');
end;
$future_otp_verify$;

create or replace function public.recover_production_future_participant_otp_verification_v1(
  target_request_id uuid, target_auth_user_id uuid
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $future_otp_recover$
declare target_id text;
begin
  target_id := production_control.assert_future_participant_identity_runtime_v1();
  if not exists (select 1 from participant_identity.participant_auth_otp_attempts value
    where value.request_id = target_request_id and value.auth_user_id = target_auth_user_id
      and value.tournament_id = target_id and value.status in ('SENT','VERIFIED')
      and value.requested_at > pg_catalog.clock_timestamp() - interval '30 minutes')
     or not exists (select 1 from auth.users value where value.id = target_auth_user_id
       and value.email_confirmed_at is not null) then
    return pg_catalog.jsonb_build_object('ok', false,
      'code', 'PRODUCTION_PARTICIPANT_AUTH_RECOVERY_NOT_ELIGIBLE');
  end if;
  return production_control.certify_production_future_participant_otp_v1(
    target_request_id, target_auth_user_id, 0, true);
end;
$future_otp_recover$;

create or replace function public.record_production_future_participant_logout_v1(
  target_auth_user_id uuid, target_tournament_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $future_logout$
declare target_id text; target_player text;
begin
  target_id := production_control.assert_future_participant_identity_runtime_v1();
  if pg_catalog.btrim(coalesce(target_tournament_id, '')) <> target_id then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  select link.player_id into target_player
  from participant_identity.user_player_links link
  join participant_identity.future_tournament_participant_bindings_v1 binding
    on binding.tournament_id = target_id and binding.player_id = link.player_id
    and binding.enrollment_state = 'ENROLLED'
  where link.auth_user_id = target_auth_user_id and link.status = 'ACTIVE';
  if found then insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id, actor_name, safe_metadata
  ) values ('FUTURE_TOURNAMENT_PARTICIPANT_AUTH_LOGOUT', target_id,
    target_auth_user_id, target_player, 'future-runtime-participant-auth-v1',
    pg_catalog.jsonb_build_object('sessionTokenStored', false)); end if;
  return pg_catalog.jsonb_build_object('ok', true, 'recorded', found);
end;
$future_logout$;

create or replace function public.read_production_future_director_entitlement_v1(
  target_auth_user_id uuid, target_tournament_id text
)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $future_director_entitlement$
declare target_id text; target_player text; entitlement_value production_control.director_entitlements%rowtype;
begin
  target_id := production_control.assert_future_participant_identity_runtime_v1();
  if target_auth_user_id is null
     or pg_catalog.btrim(coalesce(target_tournament_id, '')) <> target_id then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  select link.player_id into target_player
  from participant_identity.user_player_links link
  join participant_identity.tournament_roles role_value
    on role_value.tournament_id = target_id and role_value.auth_user_id = link.auth_user_id
    and role_value.role = 'DIRECTOR' and role_value.role_active and role_value.revoked_at is null
  where link.auth_user_id = target_auth_user_id and link.status = 'ACTIVE';
  if not found then return pg_catalog.jsonb_build_object(
    'ok', true, 'found', false, 'active', false, 'tournamentId', target_id); end if;
  select value.* into entitlement_value
  from production_control.director_entitlements value
  where value.tournament_id = '2026' and value.player_id = target_player
    and value.auth_user_id = target_auth_user_id
    and value.role in ('DIRECTOR','OWNER') and value.status = 'ACTIVE'
    and value.revoked_at is null;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'found', entitlement_value.entitlement_id is not null,
    'active', entitlement_value.entitlement_id is not null,
    'status', case when entitlement_value.entitlement_id is null then 'UNAVAILABLE' else 'ACTIVE' end,
    'tournamentId', target_id, 'directorPlayerId', target_player,
    'role', coalesce(entitlement_value.role, 'DIRECTOR'),
    'revision', coalesce((select pg_catalog.max(event_value.event_id)
      from production_control.director_entitlement_events event_value
      where event_value.entitlement_id = entitlement_value.entitlement_id), 0),
    'grantedAt', entitlement_value.granted_at,
    'revokedAt', entitlement_value.revoked_at
  );
end;
$future_director_entitlement$;

revoke all on function production_control.bind_future_participant_identity_runtime_v1(text,uuid,uuid,uuid,text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function production_control.assert_future_participant_identity_runtime_v1()
  from public, anon, authenticated, service_role;
revoke all on function production_control.certify_production_future_participant_otp_v1(uuid,uuid,integer,boolean)
  from public, anon, authenticated, service_role;

do $grant_future_identity$
declare signature text;
begin
  foreach signature in array array[
    'public.read_production_future_participant_context_for_auth_v1(uuid,text)',
    'public.read_production_future_participant_player_context_v1(text,text)',
    'public.authorize_production_future_participant_otp_request_v1(jsonb)',
    'public.record_production_future_participant_otp_delivery_v1(jsonb)',
    'public.authorize_production_future_participant_otp_verification_v1(jsonb)',
    'public.record_production_future_participant_otp_verification_v1(jsonb)',
    'public.recover_production_future_participant_otp_verification_v1(uuid,uuid)',
    'public.record_production_future_participant_logout_v1(uuid,text)',
    'public.read_production_future_director_entitlement_v1(uuid,text)'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
    execute pg_catalog.format('grant execute on function %s to service_role', signature);
  end loop;
end;
$grant_future_identity$;

comment on function production_control.bind_future_participant_identity_runtime_v1(text,uuid,uuid,uuid,text,uuid) is
  'Internal activation-time partial-roster identity binder. It carries forward only already-linked verified global identities and creates no Auth user.';
comment on function production_control.assert_future_participant_identity_runtime_v1() is
  'Internal exact-current-pointer assertion for future Production participant identity RPCs.';

commit;
