-- Step 13E.5A.1 initial Production Owner adoption guard correction.
--
-- Migration 061 deliberately restricted initial Owner adoption to a
-- database-owner session without caller JWT claims, but then reused the
-- normal runtime resource assertion whose first predicate requires a
-- service_role JWT claim.  Those caller predicates are mutually exclusive.
--
-- This additive migration leaves the normal service-role assertion unchanged.
-- It adds a private database-owner-safe assertion containing the same exact
-- non-staged Production resource checks, then rewires only the one-time Owner
-- adoption function to use it.  Installation is inert: no Owner, revision,
-- receipt, entitlement, or audit row is created here.
begin;

create or replace function
  production_control.assert_initial_owner_adoption_resource_scope_v1(
    input jsonb
  )
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control
as $$
declare
  database_owner text;
  claim_role text;
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
begin
  select pg_catalog.pg_get_userbyid(database_value.datdba)
    into strict database_owner
  from pg_catalog.pg_database database_value
  where database_value.datname = pg_catalog.current_database();
  claim_role := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb
      ->>'role'
  );
  if not pg_catalog.pg_has_role(
       session_user, database_owner, 'member'
     )
     or claim_role is not null then
    raise exception using errcode = '42501',
      message = 'ACCESS_GOVERNANCE_DATABASE_OWNER_SESSION_REQUIRED';
  end if;

  if input->>'contract_version' is distinct from
       'production-access-governance-v1'
     or input->>'action' is distinct from 'INITIAL_OWNER_ADOPTION' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ACCESS_GOVERNANCE_SCOPE_REQUIRED';
  end if;

  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';

  if resource.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or resource.project_url <>
       'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or resource.google_workbook_id <>
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or resource.vercel_project <> 'bagger-inv'
     or resource.canonical_domain <> 'https://baggerinv.com'
     or resource.current_tournament_id <> '2026'
     or resource.current_tournament_year <> 2026
     or not exists (
       select 1
       from scoring_authority.tournaments tournament
       where tournament.tournament_id = '2026'
         and tournament.tournament_year = 2026
     ) then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_RESOURCE_SCOPE_INVALID';
  end if;

  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'project_ref' is distinct from resource.project_ref
     or input->>'project_url' is distinct from resource.project_url
     or input->>'source_workbook_id'
       is distinct from resource.google_workbook_id
     or input->>'tournament_id'
       is distinct from resource.current_tournament_id then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_RESOURCE_ASSERTION_FAILED';
  end if;
end;
$$;

create or replace function public.adopt_initial_production_owner_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity,
  scoring_authority
as $$
declare
  database_owner text;
  claim_role text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'actor_player_id', ''
  )));
  actor_auth uuid;
  operation_request uuid;
  expected_revision bigint;
  expected_entitlement_id uuid;
  expected_entitlement_event_id bigint;
  expected_entitlement_event_count bigint;
  actual_entitlement_event_id bigint;
  actual_entitlement_event_count bigint;
  current_revision bigint;
  next_revision bigint;
  declared_hash text := pg_catalog.lower(coalesce(
    input->>'request_payload_hash', ''
  ));
  database_hash text;
  receipt production_control.access_governance_operation_receipts_v1%rowtype;
  entitlement_value production_control.director_entitlements%rowtype;
  response_value jsonb;
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason', ''));
begin
  select pg_catalog.pg_get_userbyid(database_value.datdba)
    into strict database_owner
  from pg_catalog.pg_database database_value
  where database_value.datname = pg_catalog.current_database();
  claim_role := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb
      ->>'role'
  );
  if not pg_catalog.pg_has_role(
       session_user, database_owner, 'member'
     )
     or claim_role is not null then
    raise exception using errcode = '42501',
      message = 'ACCESS_GOVERNANCE_DATABASE_OWNER_SESSION_REQUIRED';
  end if;
  if input->>'contract_version' is distinct from
       'production-access-governance-v1'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026'
     or input->>'action' is distinct from 'INITIAL_OWNER_ADOPTION' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ACCESS_GOVERNANCE_SCOPE_REQUIRED';
  end if;
  perform
    production_control.assert_initial_owner_adoption_resource_scope_v1(input);
  perform production_control.assert_production_handicap_runtime();
  perform production_control.assert_access_governance_safe_reason_v1(
    reason_value
  );
  begin
    actor_auth := (input->>'actor_auth_user_id')::uuid;
    operation_request := (input->>'operation_request_id')::uuid;
    expected_revision := (input->>'expected_revision')::bigint;
    expected_entitlement_id := (input->>'expected_entitlement_id')::uuid;
    expected_entitlement_event_id :=
      (input->>'expected_entitlement_event_id')::bigint;
    expected_entitlement_event_count :=
      (input->>'expected_entitlement_event_count')::bigint;
  exception when others then
    raise exception using errcode = '22023',
      message = 'ACCESS_GOVERNANCE_INITIAL_OWNER_INPUT_INVALID';
  end;
  database_hash := production_control.access_governance_hash_v1(
    input - 'request_payload_hash'
  );
  if declared_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'ACCESS_GOVERNANCE_PAYLOAD_HASH_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-access-governance-v1:2026', 0
  ));
  select value.* into receipt
  from production_control.access_governance_operation_receipts_v1 value
  where value.tournament_id = '2026'
    and value.operation = 'INITIAL_OWNER_ADOPTION'
    and value.operation_request_id = operation_request;
  if found then
    if receipt.declared_request_payload_hash = declared_hash
       and receipt.database_request_payload_hash = database_hash then
      return receipt.response || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    raise exception using errcode = '40001',
      message = 'ACCESS_GOVERNANCE_IDEMPOTENCY_CONFLICT';
  end if;
  current_revision := production_control.access_governance_revision_v1('2026');
  if current_revision <> expected_revision then
    raise exception using errcode = '40001',
      message = 'ACCESS_GOVERNANCE_REVISION_STALE';
  end if;
  if exists (
    select 1
    from production_control.tournament_owner_capabilities_v1 owner_value
    where owner_value.tournament_id = '2026'
  ) then
    raise exception using errcode = '55000',
      message = 'ACCESS_GOVERNANCE_OWNER_ALREADY_ADOPTED';
  end if;
  if not exists (
    select 1 from scoring_authority.tournament_players membership
    where membership.tournament_id = '2026'
      and membership.player_id = actor_player
      and membership.participation_status = 'ACTIVE'
  ) or not exists (
    select 1
    from participant_identity.user_player_links link
    join auth.users auth_user on auth_user.id = link.auth_user_id
    where link.player_id = actor_player
      and link.auth_user_id = actor_auth
      and link.status = 'ACTIVE'
      and (auth_user.email_confirmed_at is not null
        or auth_user.phone_confirmed_at is not null)
      and exists (
        select 1
        from participant_identity.participant_auth_identifiers identifier
        where identifier.auth_user_id = link.auth_user_id
          and identifier.player_id = link.player_id
          and identifier.status = 'VERIFIED'
      )
  ) then
    raise exception using errcode = '55000',
      message = 'ACCESS_GOVERNANCE_OWNER_IDENTITY_NOT_READY';
  end if;
  select value.* into entitlement_value
  from production_control.director_entitlements value
  where value.tournament_id = '2026'
    and value.player_id = actor_player
    and value.auth_user_id = actor_auth
    and value.status = 'ACTIVE'
    and value.role = 'DIRECTOR';
  if not found then
    raise exception using errcode = '55000',
      message = 'ACCESS_GOVERNANCE_ACTIVE_DIRECTOR_REQUIRED';
  end if;
  select pg_catalog.count(*)::bigint, coalesce(pg_catalog.max(
      event.event_id
    ), 0)::bigint
    into actual_entitlement_event_count, actual_entitlement_event_id
  from production_control.director_entitlement_events event
  where event.entitlement_id = entitlement_value.entitlement_id;
  if entitlement_value.entitlement_id is distinct from expected_entitlement_id
     or actual_entitlement_event_id is distinct from
       expected_entitlement_event_id
     or actual_entitlement_event_count is distinct from
       expected_entitlement_event_count then
    raise exception using errcode = '40001',
      message = 'ACCESS_GOVERNANCE_ENTITLEMENT_EVIDENCE_STALE';
  end if;

  insert into production_control.tournament_owner_capabilities_v1 (
    tournament_id, player_id, auth_user_id, adopted_from_entitlement_id,
    adopted_entitlement_event_id, adopted_entitlement_event_count,
    status, capability_revision, adopted_by_player_id, adopted_at
  ) values (
    '2026', actor_player, actor_auth, entitlement_value.entitlement_id,
    actual_entitlement_event_id, actual_entitlement_event_count, 'ACTIVE', 1,
    actor_player, pg_catalog.clock_timestamp()
  );

  next_revision := current_revision + 1;
  insert into production_control.access_governance_context_v1 (
    tournament_id, revision, updated_by_player_id, updated_by_auth_user_id
  ) values (
    '2026', next_revision, actor_player, actor_auth
  ) on conflict (tournament_id) do update set
    revision = excluded.revision,
    updated_by_player_id = excluded.updated_by_player_id,
    updated_by_auth_user_id = excluded.updated_by_auth_user_id,
    updated_at = pg_catalog.clock_timestamp();
  insert into production_control.access_governance_audit_events_v1 (
    tournament_id, action, target_player_id, actor_player_id,
    prior_revision, next_revision, operation_request_id, result, safe_metadata
  ) values (
    '2026', 'OWNER_ADOPTED', actor_player, actor_player,
    current_revision, next_revision, operation_request, 'CHANGED',
    pg_catalog.jsonb_build_object(
      'capability', 'OWNER', 'reason', reason_value,
      'entitlement_event_count', actual_entitlement_event_count,
      'entitlement_evidence_bound', true,
      'membership_changed', false, 'identity_changed', false
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ACCESS_GOVERNANCE_INITIAL_OWNER_ADOPTED',
    'playerId', actor_player,
    'revision', next_revision,
    'idempotent', false
  );
  insert into production_control.access_governance_operation_receipts_v1 (
    tournament_id, operation, operation_request_id,
    declared_request_payload_hash, database_request_payload_hash,
    actor_player_id, actor_auth_user_id, response
  ) values (
    '2026', 'INITIAL_OWNER_ADOPTION', operation_request,
    declared_hash, database_hash, actor_player, actor_auth, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  production_control.assert_initial_owner_adoption_resource_scope_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.adopt_initial_production_owner_v1(jsonb)
  from public, anon, authenticated, service_role;

comment on function
  production_control.assert_initial_owner_adoption_resource_scope_v1(jsonb)
is 'Database-owner/no-JWT exact Production resource assertion for the one-time initial Owner adoption only; it does not replace the normal service-role runtime assertion.';
comment on function public.adopt_initial_production_owner_v1(jsonb) is
  'Database-owner-only one-time Production Owner adoption using exact entitlement evidence, immutable idempotency/audit records, and the bootstrap-specific no-JWT resource assertion.';

notify pgrst, 'reload schema';
commit;
