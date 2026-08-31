-- Step 13E.7B current-pointer participant identity and mobile dispatch.
--
-- Installation is inert. It creates no Auth user, does not enroll a Player,
-- does not move the current-tournament pointer, and does not enable native
-- mobile access. The frozen 2026 public RPC names and request/response
-- contracts remain unchanged. Future annual identity reuses only the global
-- Auth -> stable Player link and requires a certified annual generation,
-- current active membership, annual binding, and tournament-scoped roles.
begin;

-- A certified identity context is explicitly bound to the same independent
-- runtime/authority/admission generation and pointer revision as scoring.
-- No annual context can exist before 070, so an unexpected predecessor row is
-- drift and must stop installation rather than receive an inferred backfill.
do $future_identity_generation_preflight$
begin
  if exists (
    select 1
    from participant_identity.future_tournament_identity_contexts_v1
  ) then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_GENERATION_BACKFILL_FORBIDDEN';
  end if;
end;
$future_identity_generation_preflight$;

alter table participant_identity.future_tournament_identity_contexts_v1
  add column runtime_generation_id uuid not null references
    production_control.future_annual_runtime_generations_v1(
      runtime_generation_id
    ) on delete restrict,
  add column authority_generation_id uuid not null,
  add column admission_generation_id uuid not null,
  add column pointer_revision bigint not null check (pointer_revision > 1),
  add constraint future_identity_generation_ids_distinct_v1 check (
    runtime_generation_id <> authority_generation_id
    and runtime_generation_id <> admission_generation_id
    and authority_generation_id <> admission_generation_id
  ),
  add constraint future_identity_runtime_generation_unique_v1 unique (
    runtime_generation_id
  );

-- Keep approved annual contact eligibility distinct from a completed global
-- Auth link. A NOT_ENROLLED roster member may retain the certified contact
-- reference needed by the existing controlled first-login workflow.
alter table participant_identity.future_tournament_participant_bindings_v1
  drop constraint future_tournament_participant_bindings_v1_check,
  add column contact_state text not null check (
    contact_state in ('APPROVED', 'MISSING')
  ),
  add constraint future_participant_binding_state_v2 check (
    (enrollment_state = 'ENROLLED'
      and contact_state = 'APPROVED'
      and source_identity_tournament_id = '2026'
      and source_configuration_revision is not null
      and source_contact_fingerprint is not null
      and bound_link_revision is not null)
    or (enrollment_state = 'NOT_ENROLLED'
      and contact_state = 'APPROVED'
      and source_identity_tournament_id = '2026'
      and source_configuration_revision is not null
      and source_contact_fingerprint is not null
      and bound_link_revision is null)
    or (enrollment_state = 'NOT_ENROLLED'
      and contact_state = 'MISSING'
      and source_identity_tournament_id is null
      and source_configuration_revision is null
      and source_contact_fingerprint is null
      and bound_link_revision is null)
  );

-- The frozen table default remains 2026. Future claims must always supply the
-- server-selected annual tournament explicitly.
alter table participant_identity.production_participant_enrollment_claims
  drop constraint production_participant_enrollment_claims_tournament_id_check,
  add constraint production_participant_enrollment_claims_tournament_id_v2_check
    check (tournament_id ~ '^[0-9]{4}$' and tournament_id >= '2026');

-- Migration 060 serializes controlled first-login claims against the frozen
-- identity configuration. Preserve that 2026 branch exactly and add only an
-- exact-current future branch tied to the annual binding/contact/membership.
create or replace function
  production_control.serialize_player_access_identity_claim_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, participant_identity
as $future_identity_claim_serialization_v2$
declare
  current_revision bigint;
  pointer production_control.current_tournament_pointer_v1%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-participant-identity-config-v1:2026', 0
  ));
  if new.status = 'PENDING' and new.tournament_id = '2026' then
    select value.context_revision into strict current_revision
    from participant_identity.identity_context_revisions value
    where value.tournament_id = '2026';
    if new.source_configuration_revision <> current_revision
       or not exists (
         select 1
         from participant_identity.participant_identity_contacts contact
         where contact.tournament_id = '2026'
           and contact.player_id = new.player_id
           and contact.identity_active
           and contact.configuration_revision = current_revision
       ) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_PARTICIPANT_IDENTITY_CONFIGURATION_ADVANCED';
    end if;
  elsif new.status = 'PENDING' then
    perform pg_catalog.pg_advisory_xact_lock_shared(
      production_control.scoring_admission_lock_key()
    );
    select value.* into strict pointer
    from production_control.current_tournament_pointer_v1 value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    if pointer.tournament_year <= 2026
       or new.tournament_id <> pointer.tournament_id
       or not exists (
         select 1
         from participant_identity.future_tournament_identity_contexts_v1
           context
         join participant_identity
           .future_tournament_participant_bindings_v1 binding
           on binding.tournament_id = context.tournament_id
          and binding.player_id = new.player_id
          and binding.contact_state = 'APPROVED'
          and binding.enrollment_state = 'NOT_ENROLLED'
          and binding.binding_revision = context.binding_revision
         join participant_identity.participant_identity_contacts contact
           on contact.tournament_id = context.tournament_id
          and contact.player_id = binding.player_id
          and contact.identity_active
          and contact.configuration_revision =
            new.source_configuration_revision
         join scoring_authority.tournament_players membership
           on membership.tournament_id = context.tournament_id
          and membership.player_id = binding.player_id
          and membership.participation_status = 'ACTIVE'
         where context.tournament_id = pointer.tournament_id
           and context.status = 'CERTIFIED'
           and context.pointer_revision = pointer.pointer_revision
       ) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_PARTICIPANT_IDENTITY_CONFIGURATION_ADVANCED';
    end if;
  end if;
  return new;
end;
$future_identity_claim_serialization_v2$;

-- All frozen Production identity RPCs already call this central assertion.
-- Wrap its exact 2026 body with the shared scoring-admission lock. A pointer
-- switch takes the exclusive form of this same lock, so a server pointer read
-- followed by the frozen RPC cannot race annual activation.
alter function production_control.assert_production_participant_identity_cutover()
  rename to assert_production_participant_identity_cutover_frozen_2026_v1;

create function production_control.assert_production_participant_identity_cutover()
returns production_control.resource_scope
language plpgsql
security definer
set search_path = pg_catalog
as $frozen_identity_pointer_fence$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id <> '2026'
     or pointer.tournament_year <> 2026 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_PARTICIPANT_IDENTITY_POINTER_NOT_2026';
  end if;
  return production_control
    .assert_production_participant_identity_cutover_frozen_2026_v1();
end;
$frozen_identity_pointer_fence$;

revoke all on function
  production_control.assert_production_participant_identity_cutover()
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_production_participant_identity_cutover_frozen_2026_v1()
  from public, anon, authenticated, service_role;

-- One internal predicate owns future annual eligibility. Every active roster
-- member appears exactly once. identity_eligible is the activation-time
-- global Auth -> Player carry-forward decision; runtime_eligible additionally
-- proves the exact current pointer/generation, annual binding/contact, and
-- active PARTICIPANT role. Raw identifiers never leave this ungranted helper.
create function production_control.future_participant_identity_eligibility_v1(
  target_tournament_id text
)
returns table (
  player_id text,
  auth_user_id uuid,
  link_revision bigint,
  source_configuration_revision bigint,
  source_email text,
  source_email_normalized text,
  source_updated_at timestamptz,
  source_contact_fingerprint text,
  contact_approved boolean,
  linked_verified boolean,
  runtime_eligible boolean
)
language sql
stable
security definer
set search_path = pg_catalog
as $future_identity_eligibility$
  with resource as (
    select value.google_workbook_id
    from production_control.resource_scope value
    where value.scope_key = 'BAGGER_INV_PRODUCTION'
      and value.project_ref = 'ymqhhtxaywtqllynrmxe'
      and value.project_url = 'https://ymqhhtxaywtqllynrmxe.supabase.co'
  ), source_context as (
    select value.context_revision, value.configuration_fingerprint
    from participant_identity.identity_context_revisions value
    where value.tournament_id = '2026'
      and value.configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ), approved_run as (
    select value.source_system, value.source_workbook_id
    from participant_identity.identity_config_import_runs value
    cross join source_context
    cross join resource
    where value.tournament_id = '2026'
      and value.configuration_revision = source_context.context_revision
      and value.source_fingerprint = source_context.configuration_fingerprint
      and value.source_workbook_id = resource.google_workbook_id
      and value.status = 'APPROVED'
      and value.approved_at is not null
    order by value.approved_at desc, value.requested_at desc
    limit 1
  ), active_roster as (
    select membership.player_id
    from scoring_authority.tournament_players membership
    where membership.tournament_id = pg_catalog.btrim(target_tournament_id)
      and membership.participation_status = 'ACTIVE'
  ), approved_contacts as (
    select roster.player_id, contact.configuration_revision,
      contact.email, contact.email_normalized, contact.updated_at,
      encode(extensions.digest(pg_catalog.concat_ws('|',
        contact.player_id, contact.email_normalized,
        contact.configuration_revision::text)::text, 'sha256'), 'hex')
        as contact_fingerprint
    from active_roster roster
    join participant_identity.participant_identity_contacts contact
      on contact.tournament_id = '2026'
     and contact.player_id = roster.player_id
     and contact.identity_active
    join source_context
      on source_context.context_revision = contact.configuration_revision
    join approved_run
      on approved_run.source_workbook_id = contact.source_workbook_id
     and approved_run.source_system = contact.source_system
    where contact.player_id = pg_catalog.upper(pg_catalog.btrim(
        contact.player_id
      ))
      and contact.player_id ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
      and contact.email_normalized = pg_catalog.lower(pg_catalog.btrim(
        contact.email
      ))
      and contact.email_normalized ~* (
        '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@'
        || '[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?'
        || '(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'
      )::pg_catalog.text collate "C"
      and pg_catalog.split_part(contact.email_normalized, '@', 2)
        !~* '(^|\.)(example\.(com|net|org)|invalid|test|localhost)$'
  ), link_candidates as (
    select contact.player_id, link.auth_user_id, link.link_revision,
      pg_catalog.count(*) over (partition by contact.player_id)
        as candidate_count
    from approved_contacts contact
    join participant_identity.user_player_links link
      on link.player_id = contact.player_id
     and link.status = 'ACTIVE'
     and link.revoked_at is null
     and link.email_identity_hash = encode(extensions.digest(
       contact.email_normalized::text, 'sha256'), 'hex')
    join participant_identity.participant_auth_identifiers identifier
      on identifier.player_id = link.player_id
     and identifier.auth_user_id = link.auth_user_id
     and identifier.identifier_type = 'EMAIL'
     and identifier.status = 'VERIFIED'
     and identifier.revoked_at is null
     and identifier.normalized_value_private = contact.email_normalized
    join auth.users auth_user
      on auth_user.id = link.auth_user_id
     and auth_user.email_confirmed_at is not null
     and pg_catalog.lower(pg_catalog.btrim(coalesce(auth_user.email, '')))
       = contact.email_normalized
  ), pointer as (
    select value.*
    from production_control.current_tournament_pointer_v1 value
    where value.scope_key = 'BAGGER_INV_PRODUCTION'
  ), catalog as (
    select value.*
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = pg_catalog.btrim(target_tournament_id)
  ), generation as (
    select value.*
    from production_control.future_annual_runtime_generations_v1 value
    where value.tournament_id = pg_catalog.btrim(target_tournament_id)
      and value.generation_status = 'ACTIVE'
  )
  select roster.player_id,
    link.auth_user_id, link.link_revision,
    contact.configuration_revision, contact.email,
    contact.email_normalized, contact.updated_at,
    contact.contact_fingerprint,
    contact.player_id is not null as contact_approved,
    link.player_id is not null as linked_verified,
    coalesce(link.player_id is not null
      and pointer.tournament_id = pg_catalog.btrim(target_tournament_id)
      and pointer.tournament_year > 2026
      and catalog.lifecycle = 'ACTIVE'
      and catalog.lifecycle_revision = pointer.lifecycle_revision
      and generation.pointer_revision = pointer.pointer_revision
      and generation.authority = 'SUPABASE'
      and generation.ingress_state = 'OPEN'
      and context.status = 'CERTIFIED'
      and context.runtime_generation_id = generation.runtime_generation_id
      and context.authority_generation_id = generation.authority_generation_id
      and context.admission_generation_id = generation.admission_generation_id
      and context.pointer_revision = generation.pointer_revision
      and binding.enrollment_state = 'ENROLLED'
      and binding.contact_state = 'APPROVED'
      and binding.binding_revision = context.binding_revision
      and binding.bound_link_revision = link.link_revision
      and binding.source_configuration_revision =
        contact.configuration_revision
      and binding.source_contact_fingerprint =
        contact.contact_fingerprint
      and future_contact.identity_active
      and future_contact.email_normalized = contact.email_normalized
      and participant_role.role_active
      and participant_role.revoked_at is null, false) as runtime_eligible
  from active_roster roster
  left join approved_contacts contact
    on contact.player_id = roster.player_id
  left join link_candidates link
    on link.player_id = roster.player_id
   and link.candidate_count = 1
  cross join pointer
  left join catalog on true
  left join generation on true
  left join participant_identity.future_tournament_identity_contexts_v1 context
    on context.tournament_id = pg_catalog.btrim(target_tournament_id)
  left join participant_identity.future_tournament_participant_bindings_v1 binding
    on binding.tournament_id = pg_catalog.btrim(target_tournament_id)
   and binding.player_id = roster.player_id
  left join participant_identity.participant_identity_contacts future_contact
    on future_contact.tournament_id = pg_catalog.btrim(target_tournament_id)
   and future_contact.player_id = roster.player_id
  left join participant_identity.tournament_roles participant_role
    on participant_role.tournament_id = pg_catalog.btrim(target_tournament_id)
   and participant_role.auth_user_id = link.auth_user_id
   and participant_role.role = 'PARTICIPANT'
  order by roster.player_id;
$future_identity_eligibility$;

revoke all on function
  production_control.future_participant_identity_eligibility_v1(text)
  from public, anon, authenticated, service_role;

-- Owner is a global governance capability rooted in the adopted Production
-- identity. It is intentionally independent of every annual roster and never
-- manufactures a future Director entitlement or tournament role.
create function production_control.future_global_owner_eligibility_v1()
returns table (
  player_id text,
  auth_user_id uuid,
  capability_revision bigint,
  adopted_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $future_global_owner_eligibility$
  select owner_value.player_id, owner_value.auth_user_id,
    owner_value.capability_revision, owner_value.adopted_at
  from production_control.tournament_owner_capabilities_v1 owner_value
  join participant_identity.user_player_links link
    on link.player_id = owner_value.player_id
   and link.auth_user_id = owner_value.auth_user_id
   and link.status = 'ACTIVE'
   and link.revoked_at is null
  join participant_identity.participant_auth_identifiers identifier
    on identifier.player_id = link.player_id
   and identifier.auth_user_id = link.auth_user_id
   and identifier.identifier_type = 'EMAIL'
   and identifier.status = 'VERIFIED'
   and identifier.revoked_at is null
   and link.email_identity_hash = encode(extensions.digest(
     identifier.normalized_value_private::text, 'sha256'), 'hex')
  join auth.users auth_user
    on auth_user.id = link.auth_user_id
   and auth_user.email_confirmed_at is not null
   and pg_catalog.lower(pg_catalog.btrim(coalesce(auth_user.email, '')))
     = identifier.normalized_value_private
  where owner_value.tournament_id = '2026'
    and owner_value.status = 'ACTIVE'
    and owner_value.revoked_at is null;
$future_global_owner_eligibility$;

revoke all on function
  production_control.future_global_owner_eligibility_v1()
  from public, anon, authenticated, service_role;

create function production_control.future_participant_identity_readiness_v1(
  target_tournament_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $future_identity_readiness$
declare
  roster_count_value integer;
  contact_count_value integer;
  linked_count_value integer;
  owner_count_value integer;
  director_count_value integer;
  fingerprint_value text;
begin
  with eligibility as (
    select value.*
    from production_control.future_participant_identity_eligibility_v1(
      pg_catalog.btrim(target_tournament_id)
    ) value
  )
  select pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where eligibility.contact_approved
    )::integer,
    pg_catalog.count(*) filter (
      where eligibility.linked_verified
    )::integer
  into roster_count_value, contact_count_value, linked_count_value
  from eligibility;
  select pg_catalog.count(*)::integer into owner_count_value
  from production_control.future_global_owner_eligibility_v1();
  select pg_catalog.count(distinct eligibility.player_id)::integer
    into director_count_value
  from production_control.future_participant_identity_eligibility_v1(
    pg_catalog.btrim(target_tournament_id)
  ) eligibility
  join production_control.director_entitlements entitlement
    on entitlement.tournament_id = pg_catalog.btrim(target_tournament_id)
   and entitlement.player_id = eligibility.player_id
   and entitlement.auth_user_id = eligibility.auth_user_id
   and entitlement.role = 'DIRECTOR'
   and entitlement.status = 'ACTIVE'
   and entitlement.revoked_at is null
  join participant_identity.tournament_roles role_value
    on role_value.tournament_id = entitlement.tournament_id
   and role_value.auth_user_id = entitlement.auth_user_id
   and role_value.role = 'DIRECTOR'
   and role_value.role_active
   and role_value.revoked_at is null
  where eligibility.linked_verified;
  fingerprint_value := encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-future-participant-identity-readiness-v1',
      'tournamentId', pg_catalog.btrim(target_tournament_id),
      'rosterCount', roster_count_value,
      'approvedContactCount', contact_count_value,
      'linkedVerifiedCount', linked_count_value,
      'notEnrolledCount', roster_count_value - linked_count_value,
      'ownerEligibleCount', owner_count_value,
      'futureDirectorEligibleCount', director_count_value
    )::text, 'UTF8'), 'sha256'), 'hex');
  return pg_catalog.jsonb_build_object(
    'contractVersion', 'production-future-participant-identity-readiness-v1',
    'tournamentId', pg_catalog.btrim(target_tournament_id),
    'ready', roster_count_value >= 1 and contact_count_value >= 1
      and owner_count_value >= 1 and director_count_value >= 1,
    'rosterCount', roster_count_value,
    'approvedContactCount', contact_count_value,
    'linkedVerifiedCount', linked_count_value,
    'notEnrolledCount', roster_count_value - linked_count_value,
    'ownerEligibleCount', owner_count_value,
    'futureDirectorEligibleCount', director_count_value,
    'partialRosterPolicy', true,
    'fingerprint', fingerprint_value
  );
end;
$future_identity_readiness$;

revoke all on function
  production_control.future_participant_identity_readiness_v1(text)
  from public, anon, authenticated, service_role;

-- Extend whichever predecessor-fence implementation is installed by 069.
-- The wrapper adds the canonical partial-roster/Owner identity readiness
-- without copying or weakening the scoring/close readiness body.
alter function production_control.future_runtime_readiness_v2(text)
  rename to future_runtime_readiness_before_identity_v1;

create function production_control.future_runtime_readiness_v2(
  target_tournament text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $future_runtime_identity_readiness$
declare
  base jsonb;
  identity_value jsonb;
  blockers_value jsonb;
  counts_value jsonb;
  fingerprint_value text;
begin
  base := production_control
    .future_runtime_readiness_before_identity_v1(target_tournament);
  identity_value := production_control
    .future_participant_identity_readiness_v1(target_tournament);
  blockers_value := coalesce(base->'blockers', '[]'::jsonb);
  if not coalesce((identity_value->>'ready')::boolean, false) then
    blockers_value := blockers_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'FUTURE_PARTICIPANT_IDENTITY_NOT_READY',
        'section', 'Identity',
        'message', 'At least one approved participant contact, an eligible future Director, and an active global Owner are required.'
      )
    );
  end if;
  counts_value := coalesce(base->'counts', '{}'::jsonb) ||
    pg_catalog.jsonb_build_object(
      'identityApprovedContacts',
        (identity_value->>'approvedContactCount')::integer,
      'identityLinkedVerified',
        (identity_value->>'linkedVerifiedCount')::integer,
      'identityNotEnrolled', (identity_value->>'notEnrolledCount')::integer,
      'identityOwnerEligible', (identity_value->>'ownerEligibleCount')::integer,
      'identityFutureDirectorEligible',
        (identity_value->>'futureDirectorEligibleCount')::integer
    );
  base := base || pg_catalog.jsonb_build_object(
    'ready', pg_catalog.jsonb_array_length(blockers_value) = 0,
    'blockerCount', pg_catalog.jsonb_array_length(blockers_value),
    'blockers', blockers_value,
    'counts', counts_value,
    'participantIdentityReadiness', identity_value
  );
  fingerprint_value := production_control.future_runtime_hash_v2(
    base - 'fingerprint'
  );
  return base || pg_catalog.jsonb_build_object(
    'fingerprint', fingerprint_value
  );
end;
$future_runtime_identity_readiness$;

revoke all on function production_control.future_runtime_readiness_v2(text)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.future_runtime_readiness_before_identity_v1(text)
  from public, anon, authenticated, service_role;

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
as $future_identity_bind_v2$
declare
  resource production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  source_context participant_identity.identity_context_revisions%rowtype;
  source_run participant_identity.identity_config_import_runs%rowtype;
  existing participant_identity.future_tournament_identity_contexts_v1%rowtype;
  roster_count_value integer;
  contact_count_value integer;
  enrolled_count_value integer;
  not_enrolled_count_value integer;
  binding_fingerprint_value text;
  source_manifest jsonb;
begin
  perform production_control.assert_production_service_role();
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
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
     or pointer.tournament_id = catalog.tournament_id
     or generation.generation_status <> 'PREPARED'
     or generation.pointer_revision <> pointer.pointer_revision + 1
     or generation.authority_generation_id
       <> target_authority_generation_id
     or generation.admission_generation_id
       <> target_admission_generation_id
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
    and value.status = 'APPROVED'
    and value.approved_at is not null
  order by value.approved_at desc, value.requested_at desc
  limit 1;
  if source_context.configuration_fingerprint !~ '^[0-9a-f]{64}$'
     or source_run.source_workbook_id is distinct from
       resource.google_workbook_id then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_SOURCE_NOT_CERTIFIED';
  end if;

  select pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where eligibility.contact_approved
    )::integer,
    pg_catalog.count(*) filter (
      where eligibility.linked_verified
    )::integer
  into roster_count_value, contact_count_value, enrolled_count_value
  from production_control.future_participant_identity_eligibility_v1(
    catalog.tournament_id
  ) eligibility;
  not_enrolled_count_value := roster_count_value - enrolled_count_value;
  if roster_count_value < 1 or contact_count_value < 1 then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_APPROVED_ROSTER_REQUIRED';
  end if;
  if not exists (
    select 1
    from production_control.future_global_owner_eligibility_v1() owner_value
    where owner_value.player_id = target_actor_player_id
      and owner_value.auth_user_id = target_actor_auth_user_id
  ) then
    raise exception using errcode = '42501',
      message = 'FUTURE_PARTICIPANT_IDENTITY_OWNER_REQUIRED';
  end if;
  if not exists (
    select 1
    from production_control.future_participant_identity_eligibility_v1(
      catalog.tournament_id
    ) eligibility
    join production_control.director_entitlements entitlement
      on entitlement.tournament_id = catalog.tournament_id
     and entitlement.player_id = eligibility.player_id
     and entitlement.auth_user_id = eligibility.auth_user_id
     and entitlement.role = 'DIRECTOR'
     and entitlement.status = 'ACTIVE'
     and entitlement.revoked_at is null
    join participant_identity.tournament_roles role_value
      on role_value.tournament_id = entitlement.tournament_id
     and role_value.auth_user_id = entitlement.auth_user_id
     and role_value.role = 'DIRECTOR'
     and role_value.role_active
     and role_value.revoked_at is null
    where eligibility.linked_verified
  ) then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_DIRECTOR_REQUIRED';
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'playerId', eligibility.player_id,
      'contactState', case when eligibility.contact_approved
        then 'APPROVED' else 'MISSING' end,
      'state', case when eligibility.linked_verified
        then 'ENROLLED' else 'NOT_ENROLLED' end,
      'sourceContactFingerprint', case when eligibility.contact_approved
        then eligibility.source_contact_fingerprint else null end,
      'linkRevision', case when eligibility.linked_verified
        then eligibility.link_revision else null end
    ) order by eligibility.player_id
  ), '[]'::jsonb)
  into source_manifest
  from production_control.future_participant_identity_eligibility_v1(
    catalog.tournament_id
  ) eligibility;
  binding_fingerprint_value := encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'contract', 'production-future-participant-identity-context-v1',
      'tournamentId', catalog.tournament_id,
      'runtimeGenerationId', target_runtime_generation_id,
      'authorityGenerationId', target_authority_generation_id,
      'admissionGenerationId', target_admission_generation_id,
      'pointerRevision', generation.pointer_revision,
      'sourceTournamentId', '2026',
      'sourceContextRevision', source_context.context_revision,
      'sourceConfigurationFingerprint',
        source_context.configuration_fingerprint,
      'roster', source_manifest
    )::text, 'UTF8'), 'sha256'), 'hex');

  select value.* into existing
  from participant_identity.future_tournament_identity_contexts_v1 value
  where value.tournament_id = catalog.tournament_id;
  if existing.tournament_id is not null then
    if existing.runtime_generation_id <> target_runtime_generation_id
       or existing.authority_generation_id
         <> target_authority_generation_id
       or existing.admission_generation_id
         <> target_admission_generation_id
       or existing.pointer_revision <> generation.pointer_revision
       or existing.binding_fingerprint <> binding_fingerprint_value
       or existing.roster_count <> roster_count_value
       or existing.enrolled_count <> enrolled_count_value
       or existing.not_enrolled_count <> not_enrolled_count_value then
      raise exception using errcode = '40001',
        message = 'FUTURE_PARTICIPANT_IDENTITY_BINDING_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'tournamentId', catalog.tournament_id,
      'rosterCount', existing.roster_count,
      'approvedContactCount', contact_count_value,
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
    certified_by_player_id, certified_by_auth_user_id,
    runtime_generation_id, authority_generation_id,
    admission_generation_id, pointer_revision
  ) values (
    catalog.tournament_id,
    'production-future-participant-identity-context-v1',
    1, '2026', source_context.context_revision,
    source_context.configuration_fingerprint, binding_fingerprint_value,
    roster_count_value, enrolled_count_value, not_enrolled_count_value,
    'CERTIFIED', target_actor_player_id, target_actor_auth_user_id,
    target_runtime_generation_id, target_authority_generation_id,
    target_admission_generation_id, generation.pointer_revision
  );

  insert into participant_identity.future_tournament_participant_bindings_v1 (
    tournament_id, player_id, enrollment_state, contact_state,
    source_identity_tournament_id, source_configuration_revision,
    source_contact_fingerprint, bound_link_revision, binding_revision
  )
  select catalog.tournament_id, eligibility.player_id,
    case when eligibility.linked_verified
      then 'ENROLLED' else 'NOT_ENROLLED' end,
    case when eligibility.contact_approved
      then 'APPROVED' else 'MISSING' end,
    case when eligibility.contact_approved then '2026' else null end,
    case when eligibility.contact_approved
      then eligibility.source_configuration_revision else null end,
    case when eligibility.contact_approved
      then eligibility.source_contact_fingerprint else null end,
    case when eligibility.linked_verified
      then eligibility.link_revision else null end,
    1
  from production_control.future_participant_identity_eligibility_v1(
    catalog.tournament_id
  ) eligibility;

  insert into participant_identity.identity_context_revisions (
    tournament_id, context_revision, configuration_fingerprint, updated_by
  ) values (
    catalog.tournament_id, 1, binding_fingerprint_value,
    'future-runtime-identity-binding-v2'
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
    roster_count_value, contact_count_value, contact_count_value,
    roster_count_value - contact_count_value, 0, 0, 0, 0, 0, 0,
    pg_catalog.jsonb_build_object(
      'contractVersion',
        'production-future-participant-identity-context-v1',
      'partialRosterPolicy', true,
      'approvedContactCount', contact_count_value,
      'linkedVerifiedCount', enrolled_count_value,
      'controlledFirstLoginEligibleCount',
        contact_count_value - enrolled_count_value,
      'rawIdentifiersStoredInReport', false
    ), 'future-runtime-identity-binding-v2', target_actor_player_id,
    pg_catalog.clock_timestamp()
  );
  insert into participant_identity.participant_identity_contacts (
    tournament_id, player_id, email, email_normalized, identity_active,
    configuration_revision, verified_by, verified_at, source_system,
    source_workbook_id, source_updated_at
  )
  select catalog.tournament_id, eligibility.player_id,
    eligibility.source_email, eligibility.source_email_normalized, true, 1,
    'future-runtime-identity-binding-v2', pg_catalog.clock_timestamp(),
    'PRODUCTION_FUTURE_RUNTIME_BINDING', resource.google_workbook_id,
    eligibility.source_updated_at
  from production_control.future_participant_identity_eligibility_v1(
    catalog.tournament_id
  ) eligibility
  where eligibility.contact_approved;

  insert into participant_identity.tournament_roles (
    tournament_id, auth_user_id, role, role_active, granted_by
  )
  select catalog.tournament_id, eligibility.auth_user_id,
    'PARTICIPANT', true, 'future-runtime-identity-binding-v2'
  from production_control.future_participant_identity_eligibility_v1(
    catalog.tournament_id
  ) eligibility
  where eligibility.linked_verified
  on conflict (tournament_id, auth_user_id, role) do update set
    role_active = true, revoked_at = null, revoked_by = null,
    role_revision = participant_identity.tournament_roles.role_revision + 1,
    updated_at = pg_catalog.clock_timestamp();

  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, player_id, actor_id, actor_name,
    configuration_revision, safe_metadata
  ) values (
    'FUTURE_TOURNAMENT_IDENTITY_RUNTIME_BOUND', catalog.tournament_id,
    target_actor_player_id, target_actor_player_id,
    'future-runtime-owner-activation-v2', 1,
    pg_catalog.jsonb_build_object(
      'contractVersion',
        'production-future-participant-identity-context-v1',
      'rosterCount', roster_count_value,
      'approvedContactCount', contact_count_value,
      'enrolledCount', enrolled_count_value,
      'notEnrolledCount', not_enrolled_count_value,
      'controlledFirstLoginEligibleCount',
        contact_count_value - enrolled_count_value,
      'rawIdentifiersStoredInAudit', false,
      'authUsersCreated', false,
      'ownerAddedToAnnualRoster', false,
      'futureDirectorEntitlementCloned', false
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'tournamentId', catalog.tournament_id,
    'rosterCount', roster_count_value,
    'approvedContactCount', contact_count_value,
    'enrolledCount', enrolled_count_value,
    'notEnrolledCount', not_enrolled_count_value,
    'bindingRevision', 1,
    'bindingFingerprint', binding_fingerprint_value,
    'idempotent', false
  );
end;
$future_identity_bind_v2$;

revoke all on function
  production_control.bind_future_participant_identity_runtime_v1(
    text,uuid,uuid,uuid,text,uuid
  ) from public, anon, authenticated, service_role;

create function production_control.future_participant_identity_binding_fingerprint_v1(
  target_tournament_id text
)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $future_identity_binding_fingerprint$
  select encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'contract', context.contract_version,
      'tournamentId', context.tournament_id,
      'runtimeGenerationId', context.runtime_generation_id,
      'authorityGenerationId', context.authority_generation_id,
      'admissionGenerationId', context.admission_generation_id,
      'pointerRevision', context.pointer_revision,
      'sourceTournamentId', context.source_identity_tournament_id,
      'sourceContextRevision', context.source_context_revision,
      'sourceConfigurationFingerprint',
        context.source_configuration_fingerprint,
      'roster', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'playerId', binding.player_id,
          'contactState', binding.contact_state,
          'state', binding.enrollment_state,
          'sourceContactFingerprint', binding.source_contact_fingerprint,
          'linkRevision', binding.bound_link_revision
        ) order by binding.player_id)
        from participant_identity.future_tournament_participant_bindings_v1
          binding
        where binding.tournament_id = context.tournament_id
      ), '[]'::jsonb)
    )::text, 'UTF8'), 'sha256'), 'hex')
  from participant_identity.future_tournament_identity_contexts_v1 context
  where context.tournament_id = pg_catalog.btrim(target_tournament_id);
$future_identity_binding_fingerprint$;

revoke all on function
  production_control.future_participant_identity_binding_fingerprint_v1(text)
  from public, anon, authenticated, service_role;

-- Annual abort may rotate the active admission generation while preserving
-- the same current tournament/runtime/authority generation. Keep identity on
-- that exact generation under the common exclusive serialization boundary;
-- callers may not edit the context row or fingerprint independently.
create function production_control
  .rebind_future_participant_identity_admission_generation_v1(
    target_tournament_id text,
    expected_runtime_generation_id uuid,
    expected_authority_generation_id uuid,
    expected_old_admission_generation_id uuid,
    target_new_admission_generation_id uuid,
    expected_pointer_revision bigint
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_identity_admission_rebind$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  context participant_identity.future_tournament_identity_contexts_v1%rowtype;
  next_fingerprint text;
begin
  perform production_control.assert_production_service_role();
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE'
  for update;
  select value.* into strict context
  from participant_identity.future_tournament_identity_contexts_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.status = 'CERTIFIED'
  for update;
  if pointer.tournament_year <= 2026
     or pointer.tournament_id <> pg_catalog.btrim(target_tournament_id)
     or pointer.pointer_revision <> expected_pointer_revision
     or generation.pointer_revision <> pointer.pointer_revision
     or generation.runtime_generation_id
       <> expected_runtime_generation_id
     or generation.authority_generation_id
       <> expected_authority_generation_id
     or generation.admission_generation_id
       <> target_new_admission_generation_id
     or target_new_admission_generation_id in (
       expected_runtime_generation_id, expected_authority_generation_id
     )
     or context.runtime_generation_id
       <> expected_runtime_generation_id
     or context.authority_generation_id
       <> expected_authority_generation_id
     or context.admission_generation_id
       <> expected_old_admission_generation_id
     or context.pointer_revision <> expected_pointer_revision then
    raise exception using errcode = '40001',
      message = 'FUTURE_PARTICIPANT_IDENTITY_ADMISSION_REBIND_STALE';
  end if;
  update participant_identity.future_tournament_identity_contexts_v1 set
    admission_generation_id = target_new_admission_generation_id,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = pointer.tournament_id;
  next_fingerprint := production_control
    .future_participant_identity_binding_fingerprint_v1(
      pointer.tournament_id
    );
  update participant_identity.future_tournament_identity_contexts_v1 set
    binding_fingerprint = next_fingerprint,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = pointer.tournament_id;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, actor_name, safe_metadata
  ) values (
    'FUTURE_TOURNAMENT_IDENTITY_ADMISSION_REBOUND',
    pointer.tournament_id, 'future-runtime-admission-abort-v1',
    pg_catalog.jsonb_build_object(
      'pointerRevision', pointer.pointer_revision,
      'runtimeGenerationId', expected_runtime_generation_id,
      'authorityGenerationId', expected_authority_generation_id,
      'oldAdmissionGenerationId', expected_old_admission_generation_id,
      'newAdmissionGenerationId', target_new_admission_generation_id,
      'authUsersCreated', false,
      'rolesChanged', false
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'tournamentId', pointer.tournament_id,
    'pointerRevision', pointer.pointer_revision,
    'admissionGenerationId', target_new_admission_generation_id,
    'bindingFingerprint', next_fingerprint
  );
end;
$future_identity_admission_rebind$;

revoke all on function production_control
  .rebind_future_participant_identity_admission_generation_v1(
    text,uuid,uuid,uuid,uuid,bigint
  ) from public, anon, authenticated, service_role;

create or replace function production_control.assert_future_participant_identity_runtime_v1()
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $future_identity_assert_v2$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  context participant_identity.future_tournament_identity_contexts_v1%rowtype;
  roster_count_value integer;
  binding_count_value integer;
  enrolled_count_value integer;
begin
  perform production_control.assert_production_service_role();
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
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
  select pg_catalog.count(*)::integer into roster_count_value
  from scoring_authority.tournament_players membership
  where membership.tournament_id = pointer.tournament_id
    and membership.participation_status = 'ACTIVE';
  select pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where binding.enrollment_state = 'ENROLLED'
    )::integer
  into binding_count_value, enrolled_count_value
  from participant_identity.future_tournament_participant_bindings_v1 binding
  where binding.tournament_id = pointer.tournament_id;
  if pointer.tournament_year <= 2026
     or catalog.lifecycle <> 'ACTIVE'
     or catalog.lifecycle_revision <> pointer.lifecycle_revision
     or generation.pointer_revision <> pointer.pointer_revision
     or generation.authority <> 'SUPABASE'
     or generation.ingress_state <> 'OPEN'
     or context.runtime_generation_id <> generation.runtime_generation_id
     or context.authority_generation_id
       <> generation.authority_generation_id
     or context.admission_generation_id
       <> generation.admission_generation_id
     or context.pointer_revision <> generation.pointer_revision
     or context.roster_count <> roster_count_value
     or binding_count_value <> roster_count_value
     or context.enrolled_count <> enrolled_count_value
     or context.not_enrolled_count <>
       roster_count_value - enrolled_count_value
     or context.binding_fingerprint is distinct from
       production_control
         .future_participant_identity_binding_fingerprint_v1(
           pointer.tournament_id
         )
     or exists (
       select 1
       from participant_identity.future_tournament_participant_bindings_v1
         binding
       left join production_control
         .future_participant_identity_eligibility_v1(
           pointer.tournament_id
         ) eligibility
         on eligibility.player_id = binding.player_id
       where binding.tournament_id = pointer.tournament_id
         and (eligibility.player_id is null
           or (binding.enrollment_state = 'ENROLLED'
             and not eligibility.runtime_eligible)
           or (binding.contact_state = 'APPROVED'
             and not eligibility.contact_approved))
     )
     or not exists (
       select 1
       from production_control.future_global_owner_eligibility_v1()
     ) then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_RUNTIME_REQUIRED';
  end if;
  return pointer.tournament_id;
end;
$future_identity_assert_v2$;

revoke all on function
  production_control.assert_future_participant_identity_runtime_v1()
  from public, anon, authenticated, service_role;

-- Converts one approved NOT_ENROLLED annual binding after the existing
-- controlled first-login flow has verified the global Auth link. Every
-- binding receives the same next revision and the certified context counts
-- and fingerprint change atomically; no Auth user is created here.
create function production_control.enroll_future_participant_identity_link_v1(
  target_tournament_id text,
  target_player_id text,
  target_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_identity_enroll_link$
declare
  target_id text;
  context participant_identity.future_tournament_identity_contexts_v1%rowtype;
  binding participant_identity.future_tournament_participant_bindings_v1%rowtype;
  eligibility record;
  next_revision bigint;
  next_fingerprint text;
  enrolled_count_value integer;
begin
  target_id := production_control
    .assert_future_participant_identity_runtime_v1();
  if pg_catalog.btrim(coalesce(target_tournament_id, '')) <> target_id
     or target_auth_user_id is null then
    raise exception using errcode = '42501',
      message = 'FUTURE_PARTICIPANT_IDENTITY_ENROLLMENT_SCOPE_INVALID';
  end if;
  select value.* into strict context
  from participant_identity.future_tournament_identity_contexts_v1 value
  where value.tournament_id = target_id
  for update;
  select value.* into strict binding
  from participant_identity.future_tournament_participant_bindings_v1 value
  where value.tournament_id = target_id
    and value.player_id = pg_catalog.btrim(target_player_id)
  for update;
  select value.* into eligibility
  from production_control.future_participant_identity_eligibility_v1(
    target_id
  ) value
  where value.player_id = binding.player_id
    and value.auth_user_id = target_auth_user_id
    and value.contact_approved
    and value.linked_verified;
  if not found then
    raise exception using errcode = '42501',
      message = 'FUTURE_PARTICIPANT_IDENTITY_VERIFIED_LINK_REQUIRED';
  end if;
  if binding.enrollment_state = 'ENROLLED' then
    if binding.bound_link_revision <> eligibility.link_revision then
      raise exception using errcode = '40001',
        message = 'FUTURE_PARTICIPANT_IDENTITY_LINK_REVISION_STALE';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'tournamentId', target_id,
      'playerId', binding.player_id,
      'bindingRevision', context.binding_revision,
      'idempotent', true
    );
  end if;
  if binding.contact_state <> 'APPROVED' then
    raise exception using errcode = '42501',
      message = 'FUTURE_PARTICIPANT_IDENTITY_APPROVED_CONTACT_REQUIRED';
  end if;
  insert into participant_identity.tournament_roles (
    tournament_id, auth_user_id, role, role_active, granted_by
  ) values (
    target_id, target_auth_user_id, 'PARTICIPANT', true,
    'future-runtime-controlled-first-login-v1'
  ) on conflict (tournament_id, auth_user_id, role) do update set
    role_active = true, revoked_at = null, revoked_by = null,
    role_revision = participant_identity.tournament_roles.role_revision + 1,
    updated_at = pg_catalog.clock_timestamp();
  next_revision := context.binding_revision + 1;
  update participant_identity.future_tournament_participant_bindings_v1 set
    enrollment_state = 'ENROLLED',
    bound_link_revision = eligibility.link_revision,
    binding_revision = next_revision,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target_id and player_id = binding.player_id;
  update participant_identity.future_tournament_participant_bindings_v1 set
    binding_revision = next_revision,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target_id and player_id <> binding.player_id;
  next_fingerprint := production_control
    .future_participant_identity_binding_fingerprint_v1(target_id);
  select pg_catalog.count(*)::integer into enrolled_count_value
  from participant_identity.future_tournament_participant_bindings_v1 value
  where value.tournament_id = target_id
    and value.enrollment_state = 'ENROLLED';
  update participant_identity.future_tournament_identity_contexts_v1 set
    binding_revision = next_revision,
    binding_fingerprint = next_fingerprint,
    enrolled_count = enrolled_count_value,
    not_enrolled_count = roster_count - enrolled_count_value,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target_id;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id,
    actor_name, configuration_revision, safe_metadata
  ) values (
    'FUTURE_TOURNAMENT_PARTICIPANT_ENROLLED', target_id,
    target_auth_user_id, binding.player_id,
    'future-runtime-controlled-first-login-v1', next_revision,
    pg_catalog.jsonb_build_object(
      'rawIdentifierStoredInAudit', false,
      'authUserCreatedByDatabase', false,
      'bindingRevision', next_revision
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'tournamentId', target_id,
    'playerId', binding.player_id,
    'bindingRevision', next_revision,
    'idempotent', false
  );
end;
$future_identity_enroll_link$;

revoke all on function
  production_control.enroll_future_participant_identity_link_v1(
    text,text,uuid
  ) from public, anon, authenticated, service_role;

create or replace function public.authorize_production_future_participant_otp_request_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_otp_authorize_v2$
declare
  target_id text;
  normalized text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'email', ''
  )));
  client_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'client_request_hash', ''
  )));
  email_hash text := encode(extensions.digest(normalized::text, 'sha256'),
    'hex');
  request_value uuid := extensions.gen_random_uuid();
  contact participant_identity.participant_identity_contacts%rowtype;
  binding participant_identity.future_tournament_participant_bindings_v1%rowtype;
  link participant_identity.user_player_links%rowtype;
  identifier participant_identity.participant_auth_identifiers%rowtype;
  auth_user auth.users%rowtype;
  claim participant_identity.production_participant_enrollment_claims%rowtype;
  selected_type text := 'email';
  reason text := 'NOT_ELIGIBLE';
begin
  target_id := production_control
    .assert_future_participant_identity_runtime_v1();
  if client_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_AUTH_HASHED_REQUEST_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    least('client:' || client_hash, 'email:' || email_hash), 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    greatest('client:' || client_hash, 'email:' || email_hash), 0
  ));
  if (select pg_catalog.count(*)
      from participant_identity.participant_auth_otp_attempts attempt
      where attempt.client_request_hash = client_hash
        and attempt.requested_at > pg_catalog.clock_timestamp()
          - interval '15 minutes') >= 5
     or (select pg_catalog.count(*)
      from participant_identity.participant_auth_otp_attempts attempt
      where attempt.email_identity_hash = email_hash
        and attempt.requested_at > pg_catalog.clock_timestamp()
          - interval '15 minutes') >= 3 then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'allowed', false, 'requestId', request_value,
      'email', null, 'playerId', null, 'provisioningRequired', false,
      'tournamentId', target_id
    );
  end if;

  select contact_value.*
  into contact
  from participant_identity.participant_identity_contacts contact_value
  join participant_identity.future_tournament_participant_bindings_v1
    binding_value
    on binding_value.tournament_id = contact_value.tournament_id
   and binding_value.player_id = contact_value.player_id
   and binding_value.contact_state = 'APPROVED'
  join scoring_authority.tournament_players membership
    on membership.tournament_id = contact_value.tournament_id
   and membership.player_id = contact_value.player_id
   and membership.participation_status = 'ACTIVE'
  where contact_value.tournament_id = target_id
    and contact_value.identity_active
    and contact_value.email_normalized = normalized;
  if found then
    select value.* into strict binding
    from participant_identity.future_tournament_participant_bindings_v1 value
    where value.tournament_id = target_id
      and value.player_id = contact.player_id
      and value.contact_state = 'APPROVED'
    for update;
    select value.* into link
    from participant_identity.user_player_links value
    where value.player_id = contact.player_id
      and value.status in ('PENDING', 'ACTIVE', 'SUSPENDED')
    for update;
    if found then
      select value.* into identifier
      from participant_identity.participant_auth_identifiers value
      where value.player_id = contact.player_id
        and value.auth_user_id = link.auth_user_id
        and value.identifier_type = 'EMAIL'
        and value.status in ('VERIFICATION_PENDING', 'VERIFIED')
      for update;
      select value.* into auth_user
      from auth.users value where value.id = link.auth_user_id;
      if identifier.identifier_id is null
         or identifier.normalized_value_private is distinct from normalized
         or pg_catalog.lower(pg_catalog.btrim(coalesce(auth_user.email, '')))
           is distinct from normalized then
        contact := null;
      elsif link.status = 'ACTIVE'
        and link.revoked_at is null
        and identifier.status = 'VERIFIED'
        and identifier.revoked_at is null
        and auth_user.email_confirmed_at is not null then
        reason := 'APPROVED';
        selected_type := 'email';
        if binding.enrollment_state = 'NOT_ENROLLED' then
          perform production_control.enroll_future_participant_identity_link_v1(
            target_id, contact.player_id, link.auth_user_id
          );
        end if;
      elsif link.status = 'PENDING'
        and identifier.status = 'VERIFICATION_PENDING'
        and auth_user.email_confirmed_at is null
        and auth_user.raw_app_meta_data->>'provisioning_scope'
          = 'production_controlled_first_login'
        and auth_user.raw_app_meta_data->>'player_id' = contact.player_id
        and auth_user.raw_app_meta_data->>'tournament_id' = target_id then
        reason := 'APPROVED';
        selected_type := 'signup';
      else
        contact := null;
      end if;
    else
      if exists (
        select 1 from auth.users value
        where pg_catalog.lower(pg_catalog.btrim(coalesce(value.email, '')))
          = normalized
      ) or exists (
        select 1
        from participant_identity.participant_auth_identifiers value
        where value.normalized_value_private = normalized
          and value.status in (
            'ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED'
          )
      ) then
        contact := null;
      else
        select value.* into claim
        from participant_identity.production_participant_enrollment_claims
          value
        where value.email_identity_hash = email_hash
          and value.status = 'PENDING'
        for update;
        if found and (
          claim.tournament_id <> target_id
          or claim.player_id <> contact.player_id
          or claim.source_configuration_revision
            <> contact.configuration_revision
        ) then
          raise exception using errcode = '42501',
            message = 'PRODUCTION_PARTICIPANT_ENROLLMENT_CLAIM_COLLISION';
        end if;
        if not found then
          insert into participant_identity
            .production_participant_enrollment_claims (
              tournament_id, player_id, email_identity_hash,
              client_request_hash, source_configuration_revision
            ) values (
              target_id, contact.player_id, email_hash, client_hash,
              contact.configuration_revision
            ) returning * into claim;
          insert into participant_identity.identity_audit_events (
            event_type, tournament_id, player_id, actor_name,
            request_id, safe_metadata
          ) values (
            'FUTURE_TOURNAMENT_PARTICIPANT_FIRST_LOGIN_CLAIMED',
            target_id, contact.player_id,
            'future-runtime-controlled-first-login-v1',
            claim.claim_id::text,
            pg_catalog.jsonb_build_object(
              'rawIdentifierStoredInAudit', false,
              'authUserCreated', false
            )
          );
        elsif claim.expires_at <= pg_catalog.clock_timestamp() then
          update participant_identity.production_participant_enrollment_claims
          set expires_at = pg_catalog.clock_timestamp() + interval '10 minutes',
            client_request_hash = client_hash,
            updated_at = pg_catalog.clock_timestamp()
          where claim_id = claim.claim_id
          returning * into claim;
        end if;
        return pg_catalog.jsonb_build_object(
          'ok', true, 'allowed', false,
          'provisioningRequired', true,
          'claimId', claim.claim_id,
          'email', normalized,
          'playerId', contact.player_id,
          'tournamentId', target_id,
          'recoveryAuthUserId', null
        );
      end if;
    end if;
  end if;

  if contact.player_id is null or reason <> 'APPROVED' then
    insert into participant_identity.participant_auth_otp_attempts (
      request_id, email_identity_hash, client_request_hash,
      status, safe_reason, verification_type
    ) values (
      request_value, email_hash, client_hash,
      'REJECTED', 'NOT_ELIGIBLE', 'email'
    );
    return pg_catalog.jsonb_build_object(
      'ok', true, 'allowed', false, 'requestId', request_value,
      'email', null, 'authUserId', null, 'playerId', null,
      'verificationType', null, 'provisioningRequired', false,
      'tournamentId', target_id
    );
  end if;
  if exists (
    select 1
    from participant_identity.participant_auth_otp_attempts attempt
    where attempt.player_id = contact.player_id
      and attempt.status in ('AUTHORIZED', 'SENT')
      and attempt.requested_at > pg_catalog.clock_timestamp()
        - interval '60 seconds'
  ) then
    reason := 'COOLDOWN';
  end if;
  insert into participant_identity.participant_auth_otp_attempts (
    request_id, tournament_id, player_id, auth_user_id,
    email_identity_hash, client_request_hash, status, safe_reason,
    verification_type
  ) values (
    request_value, target_id, contact.player_id, link.auth_user_id,
    email_hash, client_hash,
    case when reason = 'APPROVED' then 'AUTHORIZED' else 'REJECTED' end,
    reason, selected_type
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'allowed', reason = 'APPROVED',
    'requestId', request_value,
    'email', case when reason = 'APPROVED' then normalized else null end,
    'authUserId', case when reason = 'APPROVED'
      then link.auth_user_id else null end,
    'playerId', case when reason = 'APPROVED'
      then contact.player_id else null end,
    'tournamentId', target_id,
    'verificationType', case when reason = 'APPROVED'
      then selected_type else null end,
    'provisioningRequired', false
  );
end;
$future_otp_authorize_v2$;

create function public.complete_production_future_participant_first_login_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_first_login_complete$
declare
  target_id text;
  claim participant_identity.production_participant_enrollment_claims%rowtype;
  auth_user auth.users%rowtype;
  target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
  contact participant_identity.participant_identity_contacts%rowtype;
begin
  target_id := production_control
    .assert_future_participant_identity_runtime_v1();
  select value.* into claim
  from participant_identity.production_participant_enrollment_claims value
  where value.claim_id = nullif(input->>'claim_id', '')::uuid
  for update;
  if not found or claim.tournament_id <> target_id
     or target_user is null then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PARTICIPANT_ENROLLMENT_CLAIM_REQUIRED';
  end if;
  if claim.status = 'CONSUMED' then
    if claim.auth_user_id <> target_user or not exists (
      select 1
      from participant_identity.user_player_links link
      where link.auth_user_id = target_user
        and link.player_id = claim.player_id
        and link.status = 'PENDING'
    ) then
      raise exception using errcode = '42501',
        message = 'PRODUCTION_PARTICIPANT_ENROLLMENT_DRIFT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'playerId', claim.player_id,
      'authUserId', target_user, 'tournamentId', target_id,
      'idempotent', true
    );
  end if;
  if claim.status <> 'PENDING'
     or claim.expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PARTICIPANT_ENROLLMENT_CLAIM_INACTIVE';
  end if;
  select value.* into auth_user
  from auth.users value where value.id = target_user;
  if not found or auth_user.email_confirmed_at is not null
     or encode(extensions.digest(pg_catalog.lower(pg_catalog.btrim(coalesce(
       auth_user.email, ''
     )))::text, 'sha256'), 'hex') <> claim.email_identity_hash
     or auth_user.raw_app_meta_data->>'provisioning_scope'
       <> 'production_controlled_first_login'
     or auth_user.raw_app_meta_data->>'player_id' <> claim.player_id
     or auth_user.raw_app_meta_data->>'tournament_id' <> target_id
     or (select pg_catalog.count(*) from auth.users value
       where pg_catalog.lower(pg_catalog.btrim(coalesce(value.email, '')))
         = pg_catalog.lower(pg_catalog.btrim(auth_user.email))) <> 1 then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PARTICIPANT_AUTH_USER_SCOPE_MISMATCH';
  end if;
  select contact_value.* into contact
  from participant_identity.participant_identity_contacts contact_value
  join participant_identity.future_tournament_participant_bindings_v1 binding
    on binding.tournament_id = contact_value.tournament_id
   and binding.player_id = contact_value.player_id
   and binding.contact_state = 'APPROVED'
   and binding.enrollment_state = 'NOT_ENROLLED'
  join scoring_authority.tournament_players membership
    on membership.tournament_id = contact_value.tournament_id
   and membership.player_id = contact_value.player_id
   and membership.participation_status = 'ACTIVE'
  where contact_value.tournament_id = target_id
    and contact_value.player_id = claim.player_id
    and contact_value.identity_active
    and contact_value.configuration_revision =
      claim.source_configuration_revision
    and encode(extensions.digest(contact_value.email_normalized::text,
      'sha256'), 'hex') = claim.email_identity_hash;
  if not found or exists (
      select 1 from participant_identity.user_player_links value
      where value.auth_user_id = target_user
        or (value.player_id = claim.player_id
          and value.status in ('PENDING', 'ACTIVE', 'SUSPENDED'))
    ) or exists (
      select 1
      from participant_identity.participant_auth_identifiers value
      where value.normalized_value_private = contact.email_normalized
        and value.status in ('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED')
    ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PARTICIPANT_IDENTITY_COLLISION';
  end if;
  insert into participant_identity.user_player_links (
    auth_user_id, player_id, status, link_method,
    email_identity_hash, linked_by
  ) values (
    target_user, claim.player_id, 'PENDING',
    'PRODUCTION_CONTROLLED_FIRST_LOGIN', claim.email_identity_hash,
    'future-runtime-controlled-first-login-v1'
  );
  insert into participant_identity.participant_auth_identifiers (
    player_id, auth_user_id, identifier_type,
    normalized_value_private, status, source_system,
    source_tournament_id, source_configuration_revision,
    created_by, updated_by
  ) values (
    claim.player_id, target_user, 'EMAIL', contact.email_normalized,
    'VERIFICATION_PENDING', 'PRODUCTION_APPROVED_PARTICIPANT_IDENTITY',
    target_id, contact.configuration_revision,
    'future-runtime-controlled-first-login-v1',
    'future-runtime-controlled-first-login-v1'
  );
  update participant_identity.production_participant_enrollment_claims set
    status = 'CONSUMED', auth_user_id = target_user,
    consumed_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where claim_id = claim.claim_id;
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id,
    actor_name, request_id, safe_metadata
  ) values (
    'FUTURE_TOURNAMENT_PARTICIPANT_AUTH_USER_PREPARED', target_id,
    target_user, claim.player_id,
    'future-runtime-controlled-first-login-v1', claim.claim_id::text,
    pg_catalog.jsonb_build_object(
      'rawIdentifierStoredInAudit', false,
      'emailConfirmed', false,
      'participantAuthorityChanged', false
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'playerId', claim.player_id,
    'authUserId', target_user, 'tournamentId', target_id,
    'idempotent', false
  );
end;
$future_first_login_complete$;

create function public.record_production_future_participant_first_login_cleanup_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_first_login_cleanup$
declare
  target_id text;
  claim participant_identity.production_participant_enrollment_claims%rowtype;
  target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
  reason text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'safe_reason', 'AUTH_USER_PROVISIONING_FAILED'
  )));
begin
  target_id := production_control
    .assert_future_participant_identity_runtime_v1();
  if reason not in (
    'AUTH_USER_PROVISIONING_FAILED', 'AUTH_USER_DELETE_CONFIRMED',
    'AUTH_USER_DELETE_FAILED'
  ) then
    reason := 'AUTH_USER_PROVISIONING_FAILED';
  end if;
  select value.* into claim
  from participant_identity.production_participant_enrollment_claims value
  where value.claim_id = nullif(input->>'claim_id', '')::uuid
    and value.tournament_id = target_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'recorded', false
    );
  end if;
  if claim.status = 'CONSUMED' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PARTICIPANT_ENROLLMENT_ALREADY_CONSUMED';
  end if;
  update participant_identity.production_participant_enrollment_claims set
    status = case when reason = 'AUTH_USER_DELETE_FAILED'
      then 'CLEANUP_REQUIRED' else 'CANCELLED' end,
    auth_user_id = case when reason = 'AUTH_USER_DELETE_FAILED'
      then target_user else null end,
    cleanup_reason = reason,
    cancelled_at = case when reason = 'AUTH_USER_DELETE_FAILED'
      then null else pg_catalog.clock_timestamp() end,
    updated_at = pg_catalog.clock_timestamp()
  where claim_id = claim.claim_id;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'recorded', true,
    'cleanupRequired', reason = 'AUTH_USER_DELETE_FAILED'
  );
end;
$future_first_login_cleanup$;

create or replace function public.record_production_future_participant_otp_delivery_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_otp_delivery_v2$
declare
  target_id text;
  request_value uuid := nullif(input->>'request_id', '')::uuid;
  succeeded boolean := coalesce((input->>'succeeded')::boolean, false);
  requested_reason text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'safe_reason', 'AUTH_EMAIL_SEND_FAILED'
  )));
begin
  target_id := production_control
    .assert_future_participant_identity_runtime_v1();
  if requested_reason not in (
    'AUTH_CAPTCHA_REJECTED', 'AUTH_SUPABASE_RATE_LIMITED',
    'AUTH_SMTP_PROVIDER_RATE_LIMITED',
    'AUTH_EMAIL_RATE_LIMITED_UNKNOWN_SOURCE',
    'AUTH_EMAIL_CONFIGURATION_FAILED', 'AUTH_SMTP_PROVIDER_REJECTED',
    'AUTH_EMAIL_SERVICE_UNAVAILABLE', 'AUTH_EMAIL_SEND_FAILED'
  ) then
    requested_reason := 'AUTH_EMAIL_SEND_FAILED';
  end if;
  update participant_identity.participant_auth_otp_attempts set
    status = case when succeeded then 'SENT' else 'DELIVERY_FAILED' end,
    safe_reason = case when succeeded
      then 'DELIVERY_ACCEPTED' else requested_reason end,
    request_duration_ms = greatest(0, coalesce(
      (input->>'duration_ms')::integer, 0
    )),
    sent_at = case when succeeded
      then pg_catalog.clock_timestamp() else sent_at end,
    updated_at = pg_catalog.clock_timestamp()
  where request_id = request_value
    and tournament_id = target_id
    and status = 'AUTHORIZED';
  if not found then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_PARTICIPANT_OTP_NOT_AUTHORIZED';
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'requestId', request_value,
    'status', case when succeeded then 'SENT' else 'DELIVERY_FAILED' end
  );
end;
$future_otp_delivery_v2$;

create or replace function public
  .authorize_production_future_participant_otp_verification_v1(
    input jsonb
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_otp_verify_authorize_v2$
declare
  target_id text;
  attempt participant_identity.participant_auth_otp_attempts%rowtype;
  request_value uuid := nullif(input->>'request_id', '')::uuid;
  email_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'email_identity_hash', ''
  )));
begin
  target_id := production_control
    .assert_future_participant_identity_runtime_v1();
  select otp.* into attempt
  from participant_identity.participant_auth_otp_attempts otp
  join participant_identity.future_tournament_participant_bindings_v1 binding
    on binding.tournament_id = otp.tournament_id
   and binding.player_id = otp.player_id
   and binding.contact_state = 'APPROVED'
  join scoring_authority.tournament_players membership
    on membership.tournament_id = otp.tournament_id
   and membership.player_id = otp.player_id
   and membership.participation_status = 'ACTIVE'
  join participant_identity.participant_identity_contacts contact
    on contact.tournament_id = otp.tournament_id
   and contact.player_id = otp.player_id
   and contact.identity_active
   and encode(extensions.digest(
     contact.email_normalized::text, 'sha256'
   ), 'hex') = email_hash
  join participant_identity.user_player_links link
    on link.auth_user_id = otp.auth_user_id
   and link.player_id = otp.player_id
   and link.status in ('PENDING', 'ACTIVE')
   and link.revoked_at is null
  join participant_identity.participant_auth_identifiers identifier
    on identifier.auth_user_id = otp.auth_user_id
   and identifier.player_id = otp.player_id
   and identifier.identifier_type = 'EMAIL'
   and identifier.status in ('VERIFICATION_PENDING', 'VERIFIED')
   and identifier.revoked_at is null
   and identifier.normalized_value_private = contact.email_normalized
   and encode(extensions.digest(
     identifier.normalized_value_private::text, 'sha256'
   ), 'hex') = email_hash
  join auth.users auth_user
    on auth_user.id = otp.auth_user_id
   and pg_catalog.lower(pg_catalog.btrim(coalesce(auth_user.email, '')))
     = contact.email_normalized
  where otp.request_id = request_value
    and otp.tournament_id = target_id
    and otp.status = 'SENT'
    and otp.email_identity_hash = email_hash
    and otp.sent_at > pg_catalog.clock_timestamp() - interval '15 minutes'
    and (
      (otp.verification_type = 'email'
        and binding.enrollment_state = 'ENROLLED'
        and link.status = 'ACTIVE'
        and identifier.status = 'VERIFIED'
        and auth_user.email_confirmed_at is not null)
      or
      (otp.verification_type = 'signup'
        and binding.enrollment_state = 'NOT_ENROLLED'
        and link.status = 'PENDING'
        and identifier.status = 'VERIFICATION_PENDING'
        and auth_user.email_confirmed_at is null
        and auth_user.raw_app_meta_data->>'provisioning_scope'
          = 'production_controlled_first_login'
        and auth_user.raw_app_meta_data->>'player_id' = otp.player_id
        and auth_user.raw_app_meta_data->>'tournament_id' = target_id)
    );
  if not found then
    return pg_catalog.jsonb_build_object('ok', true, 'allowed', false);
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'allowed', true,
    'authUserId', attempt.auth_user_id,
    'playerId', attempt.player_id,
    'tournamentId', attempt.tournament_id,
    'verificationType', attempt.verification_type
  );
end;
$future_otp_verify_authorize_v2$;

create or replace function production_control
  .certify_production_future_participant_otp_v1(
    target_request_id uuid,
    target_auth_user_id uuid,
    target_duration_ms integer,
    recovery boolean default false
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_otp_certify_v2$
declare
  target_id text;
  attempt participant_identity.participant_auth_otp_attempts%rowtype;
  auth_user auth.users%rowtype;
  link participant_identity.user_player_links%rowtype;
  identifier participant_identity.participant_auth_identifiers%rowtype;
  binding participant_identity.future_tournament_participant_bindings_v1%rowtype;
  normalized text;
begin
  target_id := production_control
    .assert_future_participant_identity_runtime_v1();
  select value.* into attempt
  from participant_identity.participant_auth_otp_attempts value
  where value.request_id = target_request_id
    and value.tournament_id = target_id
  for update;
  if not found or attempt.auth_user_id is distinct from target_auth_user_id then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PARTICIPANT_OTP_IDENTITY_MISMATCH';
  end if;
  select value.* into auth_user
  from auth.users value
  where value.id = target_auth_user_id;
  select value.* into link
  from participant_identity.user_player_links value
  where value.auth_user_id = target_auth_user_id
    and value.player_id = attempt.player_id
  for update;
  select value.* into identifier
  from participant_identity.participant_auth_identifiers value
  where value.auth_user_id = target_auth_user_id
    and value.player_id = attempt.player_id
    and value.identifier_type = 'EMAIL'
    and value.status in ('VERIFICATION_PENDING', 'VERIFIED')
  for update;
  select value.* into binding
  from participant_identity.future_tournament_participant_bindings_v1 value
  where value.tournament_id = target_id
    and value.player_id = attempt.player_id
    and value.contact_state = 'APPROVED'
  for update;
  normalized := pg_catalog.lower(pg_catalog.btrim(coalesce(
    auth_user.email, ''
  )));
  if auth_user.id is null or auth_user.email_confirmed_at is null
     or link.link_id is null or link.status not in ('PENDING', 'ACTIVE')
     or link.revoked_at is not null
     or identifier.identifier_id is null
     or identifier.revoked_at is not null
     or binding.player_id is null
     or not exists (
       select 1
       from scoring_authority.tournament_players membership
       join participant_identity.participant_identity_contacts contact
         on contact.tournament_id = membership.tournament_id
        and contact.player_id = membership.player_id
        and contact.identity_active
        and contact.email_normalized = normalized
       where membership.tournament_id = target_id
         and membership.player_id = attempt.player_id
         and membership.participation_status = 'ACTIVE'
     )
     or encode(extensions.digest(normalized::text, 'sha256'), 'hex')
       <> attempt.email_identity_hash
     or identifier.normalized_value_private <> normalized
     or (attempt.verification_type = 'signup' and (
       link.status <> 'PENDING'
       or identifier.status <> 'VERIFICATION_PENDING'
       or binding.enrollment_state <> 'NOT_ENROLLED'
       or auth_user.raw_app_meta_data->>'provisioning_scope'
         <> 'production_controlled_first_login'
       or auth_user.raw_app_meta_data->>'player_id' <> attempt.player_id
       or auth_user.raw_app_meta_data->>'tournament_id' <> target_id
     ))
     or (attempt.verification_type = 'email' and (
       link.status <> 'ACTIVE'
       or identifier.status <> 'VERIFIED'
       or binding.enrollment_state <> 'ENROLLED'
     ))
     or attempt.verification_type not in ('email', 'signup') then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PARTICIPANT_VERIFIED_IDENTITY_MISMATCH';
  end if;
  if attempt.status = 'VERIFIED' then
    if link.status <> 'ACTIVE'
       or identifier.status <> 'VERIFIED'
       or binding.enrollment_state <> 'ENROLLED' then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_PARTICIPANT_VERIFICATION_DRIFT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'status', 'VERIFIED', 'duplicate', true,
      'recovered', recovery
    );
  end if;
  if attempt.status <> 'SENT' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_PARTICIPANT_OTP_NOT_AWAITING_VERIFICATION';
  end if;
  update participant_identity.participant_auth_otp_attempts set
    status = 'VERIFIED', safe_reason = 'SESSION_ESTABLISHED',
    verification_duration_ms = greatest(0, coalesce(
      target_duration_ms, 0
    )),
    verified_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where request_id = target_request_id and status = 'SENT';
  update participant_identity.user_player_links set
    status = 'ACTIVE',
    linked_at = coalesce(linked_at, pg_catalog.clock_timestamp()),
    linked_by = coalesce(
      linked_by, 'future-runtime-production-email-otp-v1'
    ),
    link_revision = link_revision + case
      when status = 'ACTIVE' then 0 else 1 end,
    updated_at = pg_catalog.clock_timestamp()
  where link_id = link.link_id;
  update participant_identity.participant_auth_identifiers set
    status = 'VERIFIED',
    verified_at = coalesce(verified_at, pg_catalog.clock_timestamp()),
    verification_source = 'PRODUCTION_EMAIL_OTP',
    revision = revision + case
      when status = 'VERIFIED' then 0 else 1 end,
    updated_by = 'future-runtime-production-email-otp-v1',
    updated_at = pg_catalog.clock_timestamp()
  where identifier_id = identifier.identifier_id;
  perform production_control.enroll_future_participant_identity_link_v1(
    target_id, attempt.player_id, target_auth_user_id
  );
  insert into participant_identity.identity_audit_events (
    event_type, tournament_id, auth_user_id, player_id,
    actor_name, request_id, safe_metadata
  ) values (
    'FUTURE_TOURNAMENT_PARTICIPANT_AUTH_VERIFIED', target_id,
    target_auth_user_id, attempt.player_id,
    'future-runtime-production-email-otp-v1',
    target_request_id::text,
    pg_catalog.jsonb_build_object(
      'result', 'VERIFIED', 'recovered', recovery,
      'otpStored', false, 'globalLinkReused', true
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 'VERIFIED', 'duplicate', false,
    'recovered', recovery
  );
end;
$future_otp_certify_v2$;

create or replace function public
  .record_production_future_participant_otp_verification_v1(
    input jsonb
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_otp_verify_v2$
declare
  target_id text;
  request_value uuid := nullif(input->>'request_id', '')::uuid;
  target_user uuid := nullif(input->>'auth_user_id', '')::uuid;
begin
  target_id := production_control
    .assert_future_participant_identity_runtime_v1();
  if coalesce((input->>'succeeded')::boolean, false) then
    return production_control
      .certify_production_future_participant_otp_v1(
        request_value, target_user,
        greatest(0, coalesce(
          (input->>'duration_ms')::integer, 0
        )), false
      );
  end if;
  update participant_identity.participant_auth_otp_attempts set
    status = 'VERIFICATION_FAILED',
    safe_reason = 'INVALID_OR_EXPIRED_CODE',
    verification_duration_ms = greatest(0, coalesce(
      (input->>'duration_ms')::integer, 0
    )),
    updated_at = pg_catalog.clock_timestamp()
  where request_id = request_value
    and tournament_id = target_id
    and status = 'SENT';
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 'VERIFICATION_FAILED'
  );
end;
$future_otp_verify_v2$;

create or replace function public
  .recover_production_future_participant_otp_verification_v1(
    target_request_id uuid,
    target_auth_user_id uuid
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_otp_recover_v2$
declare
  target_id text;
begin
  target_id := production_control
    .assert_future_participant_identity_runtime_v1();
  if not exists (
    select 1
    from participant_identity.participant_auth_otp_attempts value
    where value.request_id = target_request_id
      and value.auth_user_id = target_auth_user_id
      and value.tournament_id = target_id
      and value.status in ('SENT', 'VERIFIED')
      and value.requested_at > pg_catalog.clock_timestamp()
        - interval '30 minutes'
  ) or not exists (
    select 1 from auth.users value
    where value.id = target_auth_user_id
      and value.email_confirmed_at is not null
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'PRODUCTION_PARTICIPANT_AUTH_RECOVERY_NOT_ELIGIBLE'
    );
  end if;
  return production_control
    .certify_production_future_participant_otp_v1(
      target_request_id, target_auth_user_id, 0, true
    );
end;
$future_otp_recover_v2$;

create or replace function public
  .read_production_future_participant_context_for_auth_v1(
    target_auth_user_id uuid,
    target_tournament_id text default null
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_context_auth_v2$
declare
  target_id text;
  target_player text;
  context_value jsonb;
begin
  target_id := production_control
    .assert_future_participant_identity_runtime_v1();
  if target_auth_user_id is null
     or nullif(pg_catalog.btrim(coalesce(target_tournament_id, '')), '')
       is distinct from target_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID'
    );
  end if;
  select eligibility.player_id into target_player
  from production_control.future_participant_identity_eligibility_v1(
    target_id
  ) eligibility
  where eligibility.auth_user_id = target_auth_user_id
    and eligibility.runtime_eligible;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'
    );
  end if;
  context_value := public.read_participant_identity_context(
    target_id, target_player
  );
  if coalesce((context_value->>'ok')::boolean, false) then
    return pg_catalog.jsonb_set(
      context_value, '{data,authUserId}',
      pg_catalog.to_jsonb(target_auth_user_id), true
    );
  end if;
  return context_value;
end;
$future_context_auth_v2$;

create or replace function public
  .read_production_future_participant_player_context_v1(
    target_tournament_id text,
    target_player_id text
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_context_player_v2$
declare
  target_id text;
  target_user uuid;
begin
  target_id := production_control
    .assert_future_participant_identity_runtime_v1();
  if pg_catalog.btrim(coalesce(target_tournament_id, '')) <> target_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID'
    );
  end if;
  select eligibility.auth_user_id into target_user
  from production_control.future_participant_identity_eligibility_v1(
    target_id
  ) eligibility
  where eligibility.player_id = pg_catalog.btrim(target_player_id)
    and eligibility.runtime_eligible;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'
    );
  end if;
  return public.read_production_future_participant_context_for_auth_v1(
    target_user, target_id
  );
end;
$future_context_player_v2$;

create or replace function public.record_production_future_participant_logout_v1(
  target_auth_user_id uuid,
  target_tournament_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_logout_v2$
declare
  target_id text;
  target_player text;
begin
  target_id := production_control
    .assert_future_participant_identity_runtime_v1();
  if pg_catalog.btrim(coalesce(target_tournament_id, '')) <> target_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID'
    );
  end if;
  select eligibility.player_id into target_player
  from production_control.future_participant_identity_eligibility_v1(
    target_id
  ) eligibility
  where eligibility.auth_user_id = target_auth_user_id
    and eligibility.runtime_eligible;
  if found then
    insert into participant_identity.identity_audit_events (
      event_type, tournament_id, auth_user_id, player_id,
      actor_name, safe_metadata
    ) values (
      'FUTURE_TOURNAMENT_PARTICIPANT_AUTH_LOGOUT', target_id,
      target_auth_user_id, target_player,
      'future-runtime-participant-auth-v1',
      pg_catalog.jsonb_build_object('sessionTokenStored', false)
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'recorded', found
  );
end;
$future_logout_v2$;

create or replace function public
  .read_production_future_director_entitlement_v1(
    target_auth_user_id uuid,
    target_tournament_id text
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_director_entitlement_v2$
declare
  target_id text;
  owner_value record;
  target_player text;
  entitlement_value production_control.director_entitlements%rowtype;
  revision_value bigint;
begin
  target_id := production_control
    .assert_future_participant_identity_runtime_v1();
  if target_auth_user_id is null
     or pg_catalog.btrim(coalesce(target_tournament_id, '')) <> target_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID'
    );
  end if;

  -- Global Owner governance survives annual pointer changes and does not
  -- imply annual participant membership or a cloned Director entitlement.
  select value.* into owner_value
  from production_control.future_global_owner_eligibility_v1() value
  where value.auth_user_id = target_auth_user_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'found', true, 'active', true,
      'status', 'ACTIVE', 'tournamentId', target_id,
      'directorPlayerId', owner_value.player_id,
      'role', 'OWNER',
      'revision', owner_value.capability_revision,
      'grantedAt', owner_value.adopted_at,
      'revokedAt', null
    );
  end if;

  select eligibility.player_id into target_player
  from production_control.future_participant_identity_eligibility_v1(
    target_id
  ) eligibility
  join participant_identity.tournament_roles director_role
    on director_role.tournament_id = target_id
   and director_role.auth_user_id = eligibility.auth_user_id
   and director_role.role = 'DIRECTOR'
   and director_role.role_active
   and director_role.revoked_at is null
  where eligibility.auth_user_id = target_auth_user_id
    and eligibility.runtime_eligible;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'found', false, 'active', false,
      'tournamentId', target_id
    );
  end if;
  select value.* into entitlement_value
  from production_control.director_entitlements value
  where value.tournament_id = target_id
    and value.player_id = target_player
    and value.auth_user_id = target_auth_user_id
    and value.role = 'DIRECTOR'
    and value.status = 'ACTIVE'
    and value.revoked_at is null;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'found', false, 'active', false,
      'tournamentId', target_id
    );
  end if;
  select coalesce(pg_catalog.max(event_value.event_id), 0)
  into revision_value
  from production_control.director_entitlement_events event_value
  where event_value.entitlement_id = entitlement_value.entitlement_id;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'found', true, 'active', true,
    'status', 'ACTIVE', 'tournamentId', target_id,
    'directorPlayerId', target_player,
    'role', 'DIRECTOR', 'revision', revision_value,
    'grantedAt', entitlement_value.granted_at,
    'revokedAt', entitlement_value.revoked_at
  );
end;
$future_director_entitlement_v2$;

-- Migration 067's future scoring identity checks predated annual Director
-- scoping and consulted the frozen entitlement. Overlay only those identity
-- predicates: ordinary scoring still requires an enrolled current member;
-- Director scoring additionally requires an explicit target-year role and
-- entitlement. Global Owner governance alone never authorizes scoring.
create or replace function production_control
  .assert_future_production_scoring_actor_v1(
    input jsonb,
    target_tournament text,
    require_director boolean default false
  )
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $future_scoring_actor_identity_v2$
declare
  actor text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_role text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,role}', 'PLAYER'
  )));
  actor_auth_user uuid;
  current_identity_target text;
begin
  begin
    actor_auth_user := nullif(
      input#>>'{authorization,auth_user_id}', ''
    )::uuid;
  exception when others then
    actor_auth_user := null;
  end;
  current_identity_target := production_control
    .assert_future_participant_identity_runtime_v1();
  if target_tournament <> current_identity_target
     or input#>>'{authorization,tournament_id}'
       is distinct from target_tournament
     or actor = '' or actor_auth_user is null
     or actor_role not in ('PLAYER', 'DIRECTOR')
     or (require_director and actor_role <> 'DIRECTOR')
     or not exists (
       select 1
       from production_control.future_participant_identity_eligibility_v1(
         target_tournament
       ) eligibility
       where eligibility.player_id = actor
         and eligibility.auth_user_id = actor_auth_user
         and eligibility.runtime_eligible
     )
     or (actor_role = 'DIRECTOR' and (
       not exists (
         select 1
         from participant_identity.tournament_roles role_value
         where role_value.tournament_id = target_tournament
           and role_value.auth_user_id = actor_auth_user
           and role_value.role = 'DIRECTOR'
           and role_value.role_active
           and role_value.revoked_at is null
       )
       or not exists (
         select 1
         from production_control.director_entitlements entitlement
         where entitlement.auth_user_id = actor_auth_user
           and entitlement.tournament_id = target_tournament
           and entitlement.player_id = actor
           and entitlement.role = 'DIRECTOR'
           and entitlement.status = 'ACTIVE'
           and entitlement.revoked_at is null
       )
     )) then
    raise exception using errcode = '42501', message = case
      when require_director or actor_role = 'DIRECTOR'
        then 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED'
      else 'PRODUCTION_SCORING_AUTHORIZATION_REQUIRED'
    end;
  end if;
end;
$future_scoring_actor_identity_v2$;

create or replace function public
  .future_production_read_scoring_participant_context_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_scoring_participant_context_identity_v2$
declare
  target_tournament text;
  target_match text := input->>'match_id';
  actor text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'player_id', ''
  )));
  actor_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
  participant_role text := pg_catalog.upper(coalesce(
    input->>'role', 'PLAYER'
  ));
  supplied_permission_revision bigint := coalesce(
    (input->>'permission_revision')::bigint, -1
  );
  match_row scoring_authority.matches%rowtype;
  permission_ok boolean := false;
begin
  target_tournament := production_control
    .assert_future_production_scoring_runtime_v1(input);
  if production_control.assert_future_participant_identity_runtime_v1()
       <> target_tournament then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_RUNTIME_REQUIRED';
  end if;
  select value.* into match_row
  from scoring_authority.matches value
  where value.match_id = target_match
    and value.tournament_id = target_tournament;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_NOT_FOUND'
    );
  end if;
  if actor_auth_user is not null
     and participant_role in ('PLAYER', 'DIRECTOR')
     and supplied_permission_revision = match_row.permission_revision
     and exists (
       select 1
       from production_control.future_participant_identity_eligibility_v1(
         target_tournament
       ) eligibility
       where eligibility.auth_user_id = actor_auth_user
         and eligibility.player_id = actor
         and eligibility.runtime_eligible
     )
     and (participant_role <> 'DIRECTOR' or (
       exists (
         select 1
         from participant_identity.tournament_roles role_value
         where role_value.tournament_id = target_tournament
           and role_value.auth_user_id = actor_auth_user
           and role_value.role = 'DIRECTOR'
           and role_value.role_active
           and role_value.revoked_at is null
       )
       and exists (
         select 1
         from production_control.director_entitlements entitlement
         where entitlement.auth_user_id = actor_auth_user
           and entitlement.tournament_id = target_tournament
           and entitlement.player_id = actor
           and entitlement.role = 'DIRECTOR'
           and entitlement.status = 'ACTIVE'
           and entitlement.revoked_at is null
       )
     )) then
    if participant_role = 'PLAYER' then
      select exists (
        select 1
        from scoring_authority.scoring_permissions permission
        where permission.match_id = target_match
          and permission.player_id = actor
          and permission.can_score
          and permission.revoked_at is null
          and permission.permission_revision = match_row.permission_revision
      ) into permission_ok;
    elsif participant_role = 'DIRECTOR' then
      permission_ok := true;
    end if;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'match', pg_catalog.to_jsonb(match_row),
      'holes', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(hole) order by hole.hole_number
        )
        from scoring_authority.hole_scores hole
        where hole.match_id = target_match
      ), '[]'::jsonb),
      'authorization', pg_catalog.jsonb_build_object(
        'verified', permission_ok,
        'writable', permission_ok and match_row.status <> 'FINAL'
          and not match_row.scoring_locked,
        'permission_revision', match_row.permission_revision
      )
    )
  );
end;
$future_scoring_participant_context_identity_v2$;

revoke all on function production_control
  .assert_future_production_scoring_actor_v1(jsonb,text,boolean)
  from public, anon, authenticated, service_role;

revoke all on function production_control
  .certify_production_future_participant_otp_v1(
    uuid,uuid,integer,boolean
  ) from public, anon, authenticated, service_role;

do $grant_future_identity_v2$
declare
  signature text;
begin
  foreach signature in array array[
    'public.authorize_production_future_participant_otp_request_v1(jsonb)',
    'public.complete_production_future_participant_first_login_v1(jsonb)',
    'public.record_production_future_participant_first_login_cleanup_v1(jsonb)',
    'public.record_production_future_participant_otp_delivery_v1(jsonb)',
    'public.authorize_production_future_participant_otp_verification_v1(jsonb)',
    'public.record_production_future_participant_otp_verification_v1(jsonb)',
    'public.recover_production_future_participant_otp_verification_v1(uuid,uuid)',
    'public.read_production_future_participant_context_for_auth_v1(uuid,text)',
    'public.read_production_future_participant_player_context_v1(text,text)',
    'public.record_production_future_participant_logout_v1(uuid,text)',
    'public.read_production_future_director_entitlement_v1(uuid,text)'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
    execute pg_catalog.format(
      'grant execute on function %s to service_role', signature
    );
  end loop;
end;
$grant_future_identity_v2$;

comment on function production_control
  .assert_production_participant_identity_cutover() is
  'Frozen 2026 participant-identity assertion fenced by the shared annual scoring-admission lock and exact current pointer.';
comment on function production_control
  .assert_future_participant_identity_runtime_v1() is
  'Exact current future-generation identity assertion using the shared annual scoring-admission lock.';
comment on function production_control
  .future_participant_identity_eligibility_v1(text) is
  'Canonical annual membership/contact/global-link/binding/role eligibility predicate for future participant identity.';
comment on function production_control
  .future_global_owner_eligibility_v1() is
  'Global Production Owner governance eligibility independent of annual participant membership and Director roles.';
comment on function production_control
  .bind_future_participant_identity_runtime_v1(
    text,uuid,uuid,uuid,text,uuid
  ) is
  'Activation-time partial-roster binder: approved contacts may remain NOT_ENROLLED; global links are reused; Owner governance is separate; no Director role is cloned.';
comment on function public
  .complete_production_future_participant_first_login_v1(jsonb) is
  'Completes only a pointer-selected future controlled-first-login claim by preparing a pending global Auth-to-Player link; verification performs annual enrollment.';
comment on function public
  .read_production_future_director_entitlement_v1(uuid,text) is
  'Pointer-selected future governance reader: global Owner continuity or an explicit current-year Director entitlement and role.';

select pg_catalog.pg_notify('pgrst', 'reload schema');

commit;
