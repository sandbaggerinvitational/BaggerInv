-- Step 11-only service authorization for the isolated Production Odds worker.
--
-- This bridge exists only so the exact candidate can run a bounded rehearsal
-- without borrowing a browser cookie or issuing another OTP. It does not grant
-- an entitlement, enable an authority, publish Odds, create a mirror, or write
-- Google. The route proves the exact candidate and timing-safe rehearsal token;
-- this RPC independently proves the one physically confirmed CB01 Director.
begin;

create or replace function public.authorize_production_step11_odds_service_bridge(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity,
  scoring_authority, auth, extensions
as $$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  runtime production_control.odds_calculation_runtime%rowtype;
  worker_contract production_control.worker_contracts%rowtype;
  director_user_id uuid;
  entitlement_revision_value bigint;
  identity_matches integer;
  candidate_hostname_value text := lower(btrim(coalesce(input->>'candidate_hostname', '')));
  deployment_commit_value text := lower(btrim(coalesce(input->>'deployment_commit', '')));
  source_fingerprint_value text := lower(btrim(coalesce(input->>'source_fingerprint', '')));
  request_fingerprint_value text := lower(btrim(coalesce(input->>'request_fingerprint', '')));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_STEP11_ODDS_SERVICE_ROLE_REQUIRED';
  end if;

  -- This bridge must also authorize the initial STAGE and ENABLE operations,
  -- so it proves the exact resource tuple without requiring an already-staged
  -- release or enabled worker. The state-specific checks below bind DORMANT or
  -- STAGED to the exact candidate and allow no authority transition.
  perform production_control.assert_exact_cutover_resource_scope(input, false);

  if input->>'contract_version'
       is distinct from 'production-step11-odds-service-authorization-v1'
     or input->>'operation'
       is distinct from 'AUTHORIZE_PRODUCTION_STEP11_ODDS_SERVICE_BRIDGE'
     or input->>'operation_mode' is distinct from 'STEP11_REHEARSAL'
     or input->>'expected_director_player_id' is distinct from 'CB01'
     or input->>'required_role' is distinct from 'DIRECTOR'
     or input->'request_token_verified' is distinct from 'true'::jsonb
     or input->'service_authorization_enabled' is distinct from 'true'::jsonb
     or input->'live_production_authorization' is distinct from 'false'::jsonb
     or input->'publication_created' is distinct from 'false'::jsonb
     or input->'mirror_created' is distinct from 'false'::jsonb
     or coalesce((input->>'external_google_writes')::integer, -1) <> 0
     or request_fingerprint_value !~ '^[0-9a-f]{64}$'
     or deployment_commit_value !~ '^[0-9a-f]{40}$'
     or source_fingerprint_value !~ '^[0-9a-f]{64}$'
     or input->>'vercel_project_id'
       is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or input->>'worker_name' is distinct from 'ODDS_CALCULATION'
     or candidate_hostname_value
       !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$'
     or candidate_hostname_value in (
       'baggerinv.com', 'www.baggerinv.com', 'bagger-inv.vercel.app'
     ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_STEP11_ODDS_SERVICE_EXACT_SCOPE_REQUIRED';
  end if;

  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict runtime
  from production_control.odds_calculation_runtime
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict worker_contract
  from production_control.worker_contracts
  where worker_name = 'ODDS_CALCULATION';

  if resource.current_tournament_read_authority <> 'GOOGLE'
     or resource.scoring_authority <> 'GOOGLE'
     or resource.participant_identity_authority <> 'PASSPORT'
     or resource.public_supabase_reads_enabled
     or resource.scoring_ingress_enabled
     or resource.google_writes_enabled
     or resource.auth_user_creation_enabled
     or resource.odds_publication_enabled
     or activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.state not in ('DORMANT', 'STAGED')
     or worker_contract.scope_key <> 'BAGGER_INV_PRODUCTION'
     or worker_contract.domain <> 'CHAMPIONSHIP_ODDS_CALCULATION'
     or worker_contract.operation_kind <> 'DURABLE_CALCULATION'
     or worker_contract.requires_google_read
     or worker_contract.requires_google_write
     or worker_contract.requires_odds_publication
     or worker_contract.scheduler_installed
     or worker_contract.authoritative_write_allowed
     or exists (
       select 1
       from production_control.worker_controls worker
       where worker.worker_name <> 'ODDS_CALCULATION'
         and (worker.enabled or worker.scheduler_installed or worker.google_writes_allowed)
     )
     or exists (
       select 1
       from production_control.worker_controls worker
       where worker.worker_name in ('ODDS_CALCULATION', 'ODDS_GOOGLE_MIRROR')
         and worker.google_writes_allowed
     ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_STEP11_ODDS_SERVICE_LIVE_AUTHORITY_FORBIDDEN';
  end if;

  if activation.state = 'DORMANT' then
    if activation.expected_deployment_commit is not null
       or activation.expected_source_fingerprint is not null
       or runtime.enabled
       or runtime.operation_mode <> 'DORMANT'
       or runtime.deployment_commit is not null
       or runtime.activation_revision is not null
       or runtime.candidate_hostname is not null
       or worker_contract.operation_allowed
       or resource.workers_enabled
       or exists (
         select 1 from production_control.worker_controls worker
         where worker.enabled or worker.scheduler_installed or worker.google_writes_allowed
       ) then
      raise exception using errcode = '42501',
        message = 'PRODUCTION_STEP11_ODDS_SERVICE_DORMANT_STATE_REQUIRED';
    end if;
  elsif activation.expected_deployment_commit is distinct from deployment_commit_value
     or activation.expected_vercel_project_id
       is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or activation.expected_source_fingerprint is distinct from source_fingerprint_value
     or not (
       (
         not runtime.enabled
         and runtime.operation_mode = 'DORMANT'
         and runtime.deployment_commit is null
         and runtime.activation_revision is null
         and runtime.candidate_hostname is null
         and not worker_contract.operation_allowed
         and not resource.workers_enabled
         and not exists (
           select 1 from production_control.worker_controls worker
           where worker.enabled or worker.scheduler_installed or worker.google_writes_allowed
         )
       )
       or
       (
         runtime.enabled
         and runtime.operation_mode = 'STEP11_REHEARSAL'
         and runtime.deployment_commit = deployment_commit_value
         and runtime.activation_revision = activation.activation_revision
         and lower(runtime.candidate_hostname) = candidate_hostname_value
         and worker_contract.operation_allowed
         and resource.workers_enabled
         and exists (
           select 1 from production_control.worker_controls worker
           where worker.worker_name = 'ODDS_CALCULATION'
             and worker.enabled and not worker.scheduler_installed
             and not worker.google_writes_allowed
         )
       )
     ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_STEP11_ODDS_SERVICE_STAGED_STATE_REQUIRED';
  end if;

  -- All physical identity records must resolve to one and only one confirmed
  -- CB01 Director. No caller-provided Auth UUID or email participates in the
  -- lookup, so the service caller cannot choose another identity.
  select count(*) into identity_matches
  from participant_identity.production_auth_candidates candidate
  join auth.users auth_user
    on auth_user.id = candidate.auth_user_id
   and auth_user.email_confirmed_at is not null
   and auth_user.raw_app_meta_data->>'provisioning_scope'
     = 'production_shadow_director_certification'
   and auth_user.raw_app_meta_data->>'player_id' = 'CB01'
   and auth_user.raw_app_meta_data->>'tournament_id' = '2026'
   and encode(extensions.digest(
     lower(btrim(coalesce(auth_user.email, '')))::text, 'sha256'
   ), 'hex') = candidate.email_identity_hash
  join participant_identity.user_player_links player_link
    on player_link.auth_user_id = candidate.auth_user_id
   and player_link.player_id = candidate.player_id
   and player_link.email_identity_hash = candidate.email_identity_hash
   and player_link.status = 'ACTIVE'
  join participant_identity.participant_auth_identifiers identifier
    on identifier.auth_user_id = candidate.auth_user_id
   and identifier.player_id = candidate.player_id
   and identifier.identifier_type = 'EMAIL'
   and identifier.status = 'VERIFIED'
   and identifier.verified_at is not null
   and encode(extensions.digest(
     identifier.normalized_value_private::text, 'sha256'
   ), 'hex') = candidate.email_identity_hash
  join production_control.director_entitlements entitlement
    on entitlement.auth_user_id = candidate.auth_user_id
   and entitlement.tournament_id = candidate.tournament_id
   and entitlement.player_id = candidate.player_id
   and entitlement.role = 'DIRECTOR'
   and entitlement.status = 'ACTIVE'
   and entitlement.revoked_at is null
  join participant_identity.tournament_roles tournament_role
    on tournament_role.auth_user_id = candidate.auth_user_id
   and tournament_role.tournament_id = candidate.tournament_id
   and tournament_role.role = 'DIRECTOR'
   and tournament_role.role_active
   and tournament_role.revoked_at is null
  join scoring_authority.tournament_players membership
    on membership.tournament_id = candidate.tournament_id
   and membership.player_id = candidate.player_id
   and membership.participation_status = 'ACTIVE'
  where candidate.tournament_id = '2026'
    and candidate.player_id = 'CB01'
    and candidate.project_ref = 'ymqhhtxaywtqllynrmxe'
    and candidate.source_workbook_id
      = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
    and candidate.status = 'VERIFIED'
    and candidate.verified_at is not null;

  if identity_matches <> 1
     or (select count(*) from participant_identity.production_auth_candidates
         where tournament_id = '2026' and status = 'VERIFIED') <> 1
     or (select count(*) from participant_identity.user_player_links
         where player_id = 'CB01' and status = 'ACTIVE') <> 1
     or (select count(*) from participant_identity.participant_auth_identifiers
         where player_id = 'CB01' and identifier_type = 'EMAIL'
           and status = 'VERIFIED' and verified_at is not null) <> 1
     or (select count(*) from production_control.director_entitlements
         where tournament_id = '2026' and role = 'DIRECTOR'
           and status = 'ACTIVE' and revoked_at is null) <> 1
     or (select count(*) from participant_identity.tournament_roles
         where tournament_id = '2026' and role = 'DIRECTOR'
           and role_active and revoked_at is null) <> 1 then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_STEP11_ODDS_SINGLE_CONFIRMED_CB01_DIRECTOR_REQUIRED';
  end if;

  select candidate.auth_user_id,
    coalesce((select max(event.event_id)
      from production_control.director_entitlement_events event
      where event.entitlement_id = entitlement.entitlement_id), 0)
  into strict director_user_id, entitlement_revision_value
  from participant_identity.production_auth_candidates candidate
  join production_control.director_entitlements entitlement
    on entitlement.auth_user_id = candidate.auth_user_id
   and entitlement.tournament_id = candidate.tournament_id
   and entitlement.player_id = candidate.player_id
   and entitlement.role = 'DIRECTOR'
   and entitlement.status = 'ACTIVE'
  where candidate.tournament_id = '2026'
    and candidate.player_id = 'CB01'
    and candidate.status = 'VERIFIED';

  if director_user_id is null or entitlement_revision_value < 1 then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_STEP11_ODDS_DIRECTOR_ENTITLEMENT_REVISION_REQUIRED';
  end if;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZED',
    'CHAMPIONSHIP_ODDS_CALCULATION', '2026',
    'step11-odds-service-bridge:CB01', request_fingerprint_value, 'AUTHORIZED',
    jsonb_build_object(
      'contract_version', 'production-step11-odds-service-authorization-v1',
      'operation_mode', 'STEP11_REHEARSAL',
      'deployment_commit', deployment_commit_value,
      'candidate_hostname', candidate_hostname_value,
      'director_player_id', 'CB01',
      'role', 'DIRECTOR',
      'entitlement_revision', entitlement_revision_value,
      'activation_revision', activation.activation_revision,
      'runtime_activation_revision', runtime.activation_revision,
      'runtime_enabled', runtime.enabled,
      'runtime_operation_mode', runtime.operation_mode,
      'worker_contract_operation_allowed', worker_contract.operation_allowed,
      'worker_contract_scheduler_installed', worker_contract.scheduler_installed,
      'worker_contract_authoritative_write_allowed',
        worker_contract.authoritative_write_allowed,
      'auth_user_id_stored', false,
      'request_token_stored', false,
      'live_production_authorization', false,
      'publication_created', false,
      'mirror_created', false,
      'external_google_writes', 0
    )
  );

  return jsonb_build_object(
    'ok', true,
    'active', true,
    'contractVersion', 'production-step11-odds-service-authorization-v1',
    'operationMode', 'STEP11_REHEARSAL',
    'tournamentId', '2026',
    'directorPlayerId', 'CB01',
    'role', 'DIRECTOR',
    'entitlementRevision', entitlement_revision_value,
    'activationRevision', activation.activation_revision,
    'runtimeActivationRevision', runtime.activation_revision,
    'runtimeEnabled', runtime.enabled,
    'runtimeOperationMode', runtime.operation_mode,
    'workerContractOperationAllowed', worker_contract.operation_allowed,
    'workerContractSchedulerInstalled', worker_contract.scheduler_installed,
    'workerContractAuthoritativeWriteAllowed',
      worker_contract.authoritative_write_allowed,
    'auditRecorded', true,
    'publicationCreated', false,
    'mirrorCreated', false,
    'externalGoogleWrites', 0
  );
end;
$$;

revoke all on function public.authorize_production_step11_odds_service_bridge(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.authorize_production_step11_odds_service_bridge(jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
