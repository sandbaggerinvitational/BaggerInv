-- Step 13E.7B: annual-aware normal application release rebinding.
--
-- Installation is inert.  The existing, certified 2026 implementation is
-- retained byte-for-byte under a frozen internal name.  The public/internal
-- dispatcher delegates to it whenever the current-tournament pointer remains
-- 2026.  A future ACTIVE pointer uses the branch below, which binds an
-- application release to the exact active annual runtime/authority/admission,
-- identity, Google-writer, and side-game certifications.  It does not move
-- the pointer, rotate an annual generation, or alter tournament facts.
begin;

alter function
  production_control.authorize_production_postcutover_normal_release(jsonb)
  rename to authorize_production_postcutover_normal_release_frozen_2026_v1;

alter function
  production_control.rebind_production_postcutover_normal_release(jsonb)
  rename to rebind_production_postcutover_normal_release_frozen_2026_v1;

create function production_control.postcutover_annual_release_context_v1()
returns jsonb
language plpgsql
security definer
volatile
set search_path = pg_catalog
as $annual_release_context$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  platform_certification
    production_control.annual_scoring_platform_certifications_v1%rowtype;
  platform_activation production_control.cutover_activation_state%rowtype;
  platform_gate scoring_authority.ingress_gates%rowtype;
  identity_context
    participant_identity.future_tournament_identity_contexts_v1%rowtype;
  writer production_control.future_google_writer_targets_v2%rowtype;
  side_game jsonb;
begin
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id = '2026' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_NORMAL_RELEASE_CONTEXT_REQUIRED';
  end if;

  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = pointer.tournament_id;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE';
  select value.* into strict annual
  from production_control.annual_scoring_runtime_authorities_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.runtime_generation_id = generation.runtime_generation_id;
  select value.* into strict platform_certification
  from production_control.annual_scoring_platform_certifications_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict platform_activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict platform_gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = platform_certification.platform_tournament_id;
  select value.* into strict identity_context
  from participant_identity.future_tournament_identity_contexts_v1 value
  where value.tournament_id = pointer.tournament_id;
  select value.* into strict writer
  from production_control.future_google_writer_targets_v2 value
  where value.tournament_id = pointer.tournament_id
    and value.contract_status = 'CERTIFIED';

  if catalog.lifecycle <> 'ACTIVE'
     or catalog.lifecycle_revision <> pointer.lifecycle_revision
     or generation.pointer_revision <> pointer.pointer_revision
     or annual.pointer_revision <> pointer.pointer_revision
     or annual.lifecycle_revision <> pointer.lifecycle_revision
     or annual.authority_status <> 'ACTIVE'
     or annual.admission_state <> 'OPEN'
     or annual.authority_generation_id is distinct from
       generation.authority_generation_id
     or annual.admission_generation_id is distinct from
       generation.admission_generation_id
     or annual.platform_tournament_id is distinct from
       platform_certification.platform_tournament_id
     or annual.platform_authority_generation_id is distinct from
       platform_certification.authority_generation_id
     or annual.platform_admission_generation_id is distinct from
       platform_certification.admission_generation_id
     or platform_certification.platform_tournament_id <> '2026'
     or platform_certification.authority_generation_id is distinct from
       platform_activation.authority_generation_id
     or platform_certification.admission_generation_id is distinct from
       platform_gate.admission_generation_id
     or identity_context.status <> 'CERTIFIED'
     or identity_context.runtime_generation_id is distinct from
       generation.runtime_generation_id
     or identity_context.authority_generation_id is distinct from
       generation.authority_generation_id
     or identity_context.admission_generation_id is distinct from
       generation.admission_generation_id
     or identity_context.pointer_revision <> pointer.pointer_revision
     or writer.writer_generation_id is distinct from
       annual.google_writer_generation_id
     or writer.destination_workbook_id is distinct from
       annual.destination_workbook_id
     or writer.target_contract_fingerprint is distinct from
       annual.google_target_contract_fingerprint
     or exists (
       select 1
       from production_control.annual_scoring_transitions_v1 value
       where value.transition_status in ('PREPARED', 'CLOSING', 'CLOSED')
     )
     or production_control.annual_scoring_unresolved_count_v1(
       pointer.tournament_id, annual.admission_generation_id
     ) <> 0
     or exists (
       select 1 from scoring_authority.odds_calculation_jobs value
       where value.tournament_id = pointer.tournament_id
         and (
           value.status in ('PENDING', 'RUNNING', 'RETRYABLE')
           or (value.status = 'SUCCEEDED'
             and value.publication_status = 'READY')
           or value.claim_token is not null
           or value.lease_expires_at is not null
         )
     )
     or exists (
       select 1 from scoring_authority.net_skins_v1_recalculation_jobs value
       where value.tournament_id = pointer.tournament_id
         and (value.status = 'RUNNING' or value.claim_token is not null
           or value.lease_expires_at is not null)
     )
     or exists (
       select 1 from scoring_authority.calcutta_v1_recalculation_jobs value
       where value.tournament_id = pointer.tournament_id
         and (value.status = 'RUNNING' or value.claim_token is not null
           or value.lease_expires_at is not null)
     )
     or exists (
       select 1 from scoring_authority.competition_recalculation_jobs value
       where value.tournament_id = pointer.tournament_id
         and (value.status = 'RUNNING' or value.claim_token is not null
           or value.claimed_by is not null
           or value.lease_expires_at is not null)
     )
     or exists (
       select 1 from scoring_authority.odds_google_mirror_jobs value
       where value.tournament_id = pointer.tournament_id
         and value.status = 'RUNNING'
     )
     or exists (
       select 1 from scoring_authority.google_outbox_events value
       where value.tournament_id = pointer.tournament_id
         and (value.status = 'PROCESSING' or value.claimed_by is not null
           or value.lease_expires_at is not null)
     )
     or exists (
       select 1 from scoring_authority.scorecard_archive_jobs value
       where value.tournament_id = pointer.tournament_id
         and (value.status = 'PROCESSING' or value.claim_token is not null
           or value.claimed_by is not null
           or value.lease_expires_at is not null)
     )
     or exists (
       select 1
       from production_control.future_match_google_compatibility_jobs_v1 value
       where value.tournament_id = pointer.tournament_id
         and (value.status = 'PROCESSING' or value.claim_token is not null
           or value.claimed_by is not null
           or value.lease_expires_at is not null)
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_NORMAL_RELEASE_NOT_SAFE';
  end if;

  perform production_control
    .assert_future_google_writer_live_implementation_v2(
      pointer.tournament_id
    );
  side_game := production_control.ensure_annual_side_game_runtime_v1(
    pointer.tournament_id, generation.runtime_generation_id,
    generation.authority_generation_id,
    generation.admission_generation_id, false
  );

  return pg_catalog.jsonb_build_object(
    'contractVersion', 'production-annual-normal-release-context-v1',
    'tournamentId', pointer.tournament_id,
    'tournamentYear', pointer.tournament_year,
    'pointerRevision', pointer.pointer_revision,
    'lifecycleRevision', pointer.lifecycle_revision,
    'runtimeGenerationId', generation.runtime_generation_id,
    'runtimeRevision', generation.runtime_revision,
    'annualAuthorityGenerationId', generation.authority_generation_id,
    'annualAdmissionGenerationId', generation.admission_generation_id,
    'annualAdmissionRevision', annual.admission_revision,
    'identityBindingRevision', identity_context.binding_revision,
    'identityBindingFingerprint', identity_context.binding_fingerprint,
    'googleWriterGenerationId', writer.writer_generation_id,
    'googleTargetContractFingerprint',
      writer.target_contract_fingerprint,
    'sideGameCertificationFingerprint',
      side_game->>'certificationFingerprint'
  );
exception
  when no_data_found or too_many_rows then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_NORMAL_RELEASE_CONTEXT_REQUIRED';
end;
$annual_release_context$;

create function production_control.postcutover_annual_release_manifest_v1(
  target_sequence bigint,
  predecessor_release_rebind_id uuid,
  predecessor_deployment_id text,
  predecessor_deployment_commit text,
  target_deployment_commit text,
  platform_activation_revision bigint,
  platform_admission_revision bigint,
  platform_epoch_id uuid,
  platform_authority_generation_id uuid,
  platform_admission_generation_id uuid,
  capability_binding_id uuid,
  capability_contract text,
  capability_ceiling text,
  annual_context jsonb
)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $annual_release_manifest$
  select pg_catalog.jsonb_build_object(
    'domain', 'BAGGER_POSTCUTOVER_ANNUAL_NORMAL_RELEASE_INTENT_V1',
    'contract_version', 'production-postcutover-normal-release-intent-v1',
    'annual_context_contract',
      'production-annual-normal-release-context-v1',
    'release_sequence', target_sequence,
    'predecessor_release_rebind_id', predecessor_release_rebind_id,
    'predecessor_deployment_id', predecessor_deployment_id,
    'predecessor_deployment_commit', predecessor_deployment_commit,
    'target_deployment_commit', target_deployment_commit,
    'activation_revision', platform_activation_revision,
    'admission_revision', platform_admission_revision,
    'authority_epoch', platform_epoch_id,
    'authority_generation', platform_authority_generation_id,
    'admission_generation', platform_admission_generation_id,
    'capability_binding_id', capability_binding_id,
    'capability_contract', capability_contract,
    'capability_ceiling', capability_ceiling,
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
    'supabase_project_ref', 'ymqhhtxaywtqllynrmxe',
    'google_workbook_id',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
    'platform_tournament_id', '2026',
    'annual_runtime', annual_context
  )
$annual_release_manifest$;

create function
  production_control.authorize_production_postcutover_normal_release(
    input jsonb
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $authorize_annual_normal_release$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  head production_control.postcutover_normal_release_head%rowtype;
  predecessor
    production_control.postcutover_normal_release_rebindings%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  binding
    production_control.maintenance_deployment_capability_bindings%rowtype;
  existing production_control.postcutover_normal_release_intents%rowtype;
  annual_context jsonb;
  target_sequence bigint;
  manifest jsonb;
  manifest_fingerprint text;
  payload_hash text := production_control.cutover_payload_hash(input);
  response_value jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  if pointer.tournament_id = '2026' then
    return production_control
      .authorize_production_postcutover_normal_release_frozen_2026_v1(input);
  end if;

  if not pg_catalog.pg_has_role(session_user, current_user, 'USAGE') then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DATABASE_OWNER_REQUIRED';
  end if;
  if input->>'operation' is distinct from
       'AUTHORIZE_PRODUCTION_POSTCUTOVER_NORMAL_RELEASE'
     or pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'project_ref' is distinct from 'ymqhhtxaywtqllynrmxe'
     or input->>'project_url' is distinct from
       'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or input->>'source_workbook_id' is distinct from
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or input->>'tournament_id' is distinct from '2026'
     or coalesce(input->>'target_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'expected_predecessor_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'expected_predecessor_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'expected_authority_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_admission_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_current_tournament_id', '')
       !~ '^[0-9]{4}$'
     or pg_catalog.jsonb_typeof(input->'expected_pointer_revision')
       is distinct from 'number'
     or coalesce(input->>'expected_pointer_revision', '') !~ '^[0-9]+$'
     or coalesce(input->>'expected_runtime_generation_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_annual_authority_generation_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_annual_admission_generation_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or pg_catalog.jsonb_typeof(input->'expected_activation_revision')
       is distinct from 'number'
     or coalesce(input->>'expected_activation_revision', '') !~ '^[0-9]+$'
     or pg_catalog.jsonb_typeof(input->'expected_admission_revision')
       is distinct from 'number'
     or coalesce(input->>'expected_admission_revision', '') !~ '^[0-9]+$'
     or (input ? 'expected_release_sequence' and (
       pg_catalog.jsonb_typeof(input->'expected_release_sequence')
         is distinct from 'number'
       or coalesce(input->>'expected_release_sequence', '') !~ '^[0-9]+$'
     )) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_INVALID';
  end if;

  perform production_control.bootstrap_postcutover_normal_release_baseline();
  select value.* into strict head
  from production_control.postcutover_normal_release_head value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict predecessor
  from production_control.postcutover_normal_release_rebindings value
  where value.release_rebind_id = head.release_rebind_id;
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select value.* into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = gate.active_epoch_id;
  select value.* into strict binding
  from production_control.maintenance_deployment_capability_bindings value
  where value.capability_binding_id = predecessor.capability_binding_id;
  annual_context :=
    production_control.postcutover_annual_release_context_v1();
  target_sequence := head.release_sequence + 1;
  manifest := production_control.postcutover_annual_release_manifest_v1(
    target_sequence, predecessor.release_rebind_id,
    head.deployment_id, head.deployment_commit,
    input->>'target_deployment_commit', activation.activation_revision,
    gate.admission_revision, epoch.epoch_id,
    activation.authority_generation_id, gate.admission_generation_id,
    binding.capability_binding_id, binding.contract_version,
    binding.capability_ceiling, annual_context
  );
  manifest_fingerprint := pg_catalog.encode(
    extensions.digest(manifest::text, 'sha256'), 'hex'
  );

  select value.* into existing
  from production_control.postcutover_normal_release_intents value
  where value.request_fingerprint = input->>'request_fingerprint';
  if found then
    if existing.payload_hash is distinct from payload_hash
       or existing.authorization_fingerprint is distinct from
         manifest_fingerprint then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_AUTHORIZED',
      'release_intent_id', existing.release_intent_id,
      'release_sequence', existing.release_sequence,
      'target_deployment_commit', existing.target_deployment_commit,
      'status', existing.status,
      'authorization_fingerprint', existing.authorization_fingerprint,
      'idempotent', true
    );
  end if;

  if (input ? 'expected_release_sequence' and
       (input->>'expected_release_sequence')::bigint <> target_sequence)
     or input->>'expected_current_tournament_id' is distinct from
       annual_context->>'tournamentId'
     or (input->>'expected_pointer_revision')::bigint <>
       (annual_context->>'pointerRevision')::bigint
     or pg_catalog.lower(input->>'expected_runtime_generation_id')
       is distinct from pg_catalog.lower(
         annual_context->>'runtimeGenerationId'
       )
     or pg_catalog.lower(input->>'expected_annual_authority_generation_id')
       is distinct from pg_catalog.lower(
         annual_context->>'annualAuthorityGenerationId'
       )
     or pg_catalog.lower(input->>'expected_annual_admission_generation_id')
       is distinct from pg_catalog.lower(
         annual_context->>'annualAdmissionGenerationId'
       )
     or input->>'expected_predecessor_deployment_id' is distinct from
       head.deployment_id
     or input->>'expected_predecessor_deployment_commit' is distinct from
       head.deployment_commit
     or activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or activation.current_authority <> 'SUPABASE'
     or activation.maintenance_state <> 'NORMAL'
     or not activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.expected_deployment_commit is distinct from
       head.deployment_commit
     or activation.activation_revision <>
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or resource.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or resource.google_workbook_id <>
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or resource.current_tournament_id <> '2026'
     or resource.current_tournament_read_authority <> 'SUPABASE'
     or resource.scoring_authority <> 'SUPABASE'
     or resource.participant_identity_authority <> 'SUPABASE'
     or resource.odds_publication_authority <> 'SUPABASE'
     or not resource.odds_publication_enabled
     or not resource.public_supabase_reads_enabled
     or not resource.scoring_ingress_enabled
     or not resource.workers_enabled
     or not resource.google_writes_enabled
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.authority <> 'SUPABASE'
     or gate.state <> 'OPEN'
     or gate.admission_state <> 'CLOSED'
     or not gate.admission_protocol_enforced
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision <>
       (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from head.deployment_id
     or gate.unresolved_client_queues <> 0
     or binding.contract_version <>
       'production-maintenance-single-deployment-capability-v1'
     or binding.capability_ceiling <> 'OBSERVATION'
     or exists (
       select 1 from production_control.postcutover_normal_release_intents value
       where value.scope_key = 'BAGGER_INV_PRODUCTION'
         and value.status = 'PENDING'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_NOT_SAFE';
  end if;
  perform production_control.assert_no_active_physical_writer_fence();

  insert into production_control.postcutover_normal_release_intents (
    scope_key, contract_version, status, release_sequence,
    predecessor_release_rebind_id, predecessor_deployment_id,
    predecessor_deployment_commit, target_deployment_commit,
    epoch_id, authority_generation_id, admission_generation_id,
    capability_binding_id, capability_contract, capability_ceiling,
    expected_activation_revision, expected_admission_revision,
    authorization_manifest, authorization_fingerprint,
    request_fingerprint, payload_hash, authorized_by
  ) values (
    'BAGGER_INV_PRODUCTION',
    'production-postcutover-normal-release-intent-v1', 'PENDING',
    target_sequence, predecessor.release_rebind_id,
    head.deployment_id, head.deployment_commit,
    input->>'target_deployment_commit', epoch.epoch_id,
    activation.authority_generation_id, gate.admission_generation_id,
    binding.capability_binding_id, binding.contract_version,
    binding.capability_ceiling, activation.activation_revision,
    gate.admission_revision, manifest, manifest_fingerprint,
    input->>'request_fingerprint', payload_hash,
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into existing;

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_AUTHORIZED',
    'release_intent_id', existing.release_intent_id,
    'release_sequence', existing.release_sequence,
    'target_deployment_commit', existing.target_deployment_commit,
    'status', existing.status,
    'authorization_fingerprint', existing.authorization_fingerprint,
    'current_tournament_id', annual_context->>'tournamentId',
    'runtime_generation_id', annual_context->>'runtimeGenerationId',
    'idempotent', false
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_AUTHORIZED',
    'APPLICATION_RELEASE', annual_context->>'tournamentId',
    pg_catalog.left(input->>'actor_id', 160),
    input->>'request_fingerprint', 'SUCCEEDED',
    response_value - 'ok' - 'idempotent'
  );
  return response_value;
exception
  when no_data_found or too_many_rows or invalid_text_representation
    or numeric_value_out_of_range then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_NOT_SAFE';
end;
$authorize_annual_normal_release$;

create function
  production_control.rebind_production_postcutover_normal_release(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $rebind_annual_normal_release$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  baseline
    production_control.postcutover_application_release_rebindings%rowtype;
  head production_control.postcutover_normal_release_head%rowtype;
  predecessor
    production_control.postcutover_normal_release_rebindings%rowtype;
  existing production_control.postcutover_normal_release_rebindings%rowtype;
  authorized_intent
    production_control.postcutover_normal_release_intents%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  binding
    production_control.maintenance_deployment_capability_bindings%rowtype;
  odds_config scoring_authority.odds_input_configurations%rowtype;
  odds_runtime production_control.odds_calculation_runtime%rowtype;
  annual_context jsonb;
  authorization_manifest jsonb;
  target_sequence bigint;
  next_activation_revision bigint;
  next_admission_revision bigint;
  new_release_rebind_id uuid := extensions.gen_random_uuid();
  runtime_observed_at timestamptz;
  runtime_manifest jsonb;
  runtime_fingerprint text;
  response_value jsonb;
  intent_input jsonb := input - 'runtime_observed_at';
begin
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  if pointer.tournament_id = '2026' then
    return production_control
      .rebind_production_postcutover_normal_release_frozen_2026_v1(input);
  end if;

  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'boundary_mode' is distinct from 'MAINTENANCE_WINDOW_V1'
     or input->>'operation' is distinct from
       'REBIND_PRODUCTION_POSTCUTOVER_NORMAL_RELEASE'
     or input->>'contract_version' is distinct from
       'production-postcutover-normal-release-rebind-v1'
     or input->>'runtime_binding_contract' is distinct from
       'production-maintenance-precommit-deployment-rebind-v2'
     or coalesce(input->>'expected_predecessor_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'expected_predecessor_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or input->>'deployment_id' =
       input->>'expected_predecessor_deployment_id'
     or coalesce(input->>'epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or input->>'runtime_deployment_status' is distinct from 'READY'
     or input->>'runtime_readiness_evidence' is distinct from
       'LIVE_CANONICAL_PRODUCTION_ROUTE'
     or input->>'runtime_deployment_target' is distinct from 'PRODUCTION'
     or input->>'runtime_environment' is distinct from 'production'
     or input->>'runtime_vercel_project' is distinct from 'bagger-inv'
     or input->>'runtime_vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'runtime_vercel_team_id' is distinct from
       'team_kPw5zaib8uaQJALAwj4fWI6R'
     or input->>'runtime_canonical_hostname' is distinct from 'baggerinv.com'
     or coalesce(input->>'runtime_deployment_hostname', '')
       !~ '^[a-z0-9-]+\.vercel\.app$'
     or input->>'runtime_deployment_hostname' ~ '-git-'
     or input->>'runtime_deployment_hostname' in (
       'bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app',
       'bagger-inv.vercel.app'
     )
     or input->>'runtime_deployment_commit' is distinct from
       input->>'deployment_commit'
     or input->>'runtime_cutover_phase' is distinct from 'SCORING_COMMIT'
     or input->>'runtime_deployment_capability_contract' is distinct from
       'production-maintenance-single-deployment-capability-v1'
     or input->>'runtime_deployment_capability_ceiling' is distinct from
       'OBSERVATION'
     or input->>'runtime_scoring_authority' is distinct from 'SUPABASE'
     or input->>'runtime_participant_identity_authority' is distinct from
       'SUPABASE'
     or pg_catalog.lower(coalesce(
       input->>'runtime_expected_authority_epoch', ''
     )) is distinct from pg_catalog.lower(
       input->>'expected_authority_generation'
     )
     or pg_catalog.lower(coalesce(
       input->>'runtime_expected_admission_generation', ''
     )) is distinct from pg_catalog.lower(
       input->>'expected_admission_generation'
     )
     or input->'runtime_activation_enabled' is distinct from 'true'::jsonb
     or input->'runtime_foundation_enabled' is distinct from 'true'::jsonb
     or input->'runtime_public_supabase_reads_enabled' is distinct from
       'true'::jsonb
     or input->'runtime_google_ingress_lease_gate_enabled'
       is distinct from 'true'::jsonb
     or input->'runtime_supabase_scoring_ingress_enabled'
       is distinct from 'true'::jsonb
     or input->'runtime_workers_enabled' is distinct from 'true'::jsonb
     or input->'runtime_google_mirror_enabled' is distinct from 'true'::jsonb
     or input->'runtime_scorecard_archive_enabled' is distinct from
       'true'::jsonb
     or input->'runtime_outbox_worker_secret_configured' is distinct from
       'true'::jsonb
     or input->'runtime_archive_worker_secret_configured' is distinct from
       'true'::jsonb
     or input->'runtime_odds_calculation_enabled' is distinct from
       'true'::jsonb
     or input->>'runtime_war_room_input_source' is distinct from 'SUPABASE'
     or input->>'runtime_prediction_settings_read_source' is distinct from
       'SUPABASE'
     or input->>'runtime_odds_calculation_input_source' is distinct from
       'SUPABASE'
     or coalesce(input->>'runtime_prediction_settings_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(
       input->>'runtime_prediction_settings_effective_fingerprint', ''
     ) !~ '^[0-9a-f]{64}$'
     or input->>'runtime_odds_publication_authority' is distinct from
       'SUPABASE'
     or input->'runtime_supabase_odds_publication_enabled' is distinct from
       'true'::jsonb
     or input->'runtime_supabase_odds_google_mirror_enabled' is distinct from
       'false'::jsonb
     or (input ? 'expected_release_sequence' and (
       pg_catalog.jsonb_typeof(input->'expected_release_sequence')
         is distinct from 'number'
       or coalesce(input->>'expected_release_sequence', '') !~ '^[0-9]+$'
     )) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INPUT_INVALID';
  end if;

  perform production_control.bootstrap_postcutover_normal_release_baseline();
  select value.* into strict baseline
  from production_control.postcutover_application_release_rebindings value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict head
  from production_control.postcutover_normal_release_head value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict predecessor
  from production_control.postcutover_normal_release_rebindings value
  where value.release_rebind_id = head.release_rebind_id for update;

  select value.* into existing
  from production_control.postcutover_normal_release_rebindings value
  where value.request_fingerprint = pg_catalog.lower(
    input->>'request_fingerprint'
  );
  if found then
    if existing.release_kind <> 'NORMAL'
       or (input ? 'expected_release_sequence' and
         existing.release_sequence <>
           (input->>'expected_release_sequence')::bigint)
       or existing.predecessor_deployment_id is distinct from
         input->>'expected_predecessor_deployment_id'
       or existing.predecessor_deployment_commit is distinct from
         input->>'expected_predecessor_deployment_commit'
       or existing.deployment_id is distinct from input->>'deployment_id'
       or existing.deployment_commit is distinct from
         input->>'deployment_commit'
       or existing.payload_hash is distinct from
         production_control.cutover_payload_hash(intent_input) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REQUEST_CONFLICT';
    end if;
    if head.release_rebind_id is distinct from existing.release_rebind_id
       or head.release_sequence <> existing.release_sequence
       or head.deployment_id <> existing.deployment_id
       or head.deployment_commit <> existing.deployment_commit then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_STALE_REPLAY';
    end if;
    return existing.response_value || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;

  target_sequence := head.release_sequence + 1;
  if (input ? 'expected_release_sequence' and
       (input->>'expected_release_sequence')::bigint <> target_sequence)
     or exists (
       select 1
       from production_control.postcutover_normal_release_rebindings value
       where value.deployment_id = input->>'deployment_id'
     ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_SEQUENCE_STALE';
  end if;

  select value.* into strict authorized_intent
  from production_control.postcutover_normal_release_intents value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
    and value.status = 'PENDING' for update;
  runtime_observed_at := (input->>'runtime_observed_at')::timestamptz;
  if runtime_observed_at is null
     or runtime_observed_at > pg_catalog.now()
     or runtime_observed_at < pg_catalog.now() - interval '5 minutes' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_RUNTIME_NOT_CURRENT';
  end if;

  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select value.* into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = gate.active_epoch_id for update;
  select value.* into strict binding
  from production_control.maintenance_deployment_capability_bindings value
  where value.capability_binding_id = predecessor.capability_binding_id
  for update;
  select value.* into strict odds_config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = '2026' and value.is_current for update;
  select value.* into strict odds_runtime
  from production_control.odds_calculation_runtime value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  perform value.worker_name
  from production_control.worker_controls value
  where value.worker_name in (
    'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE', 'ODDS_CALCULATION'
  ) order by value.worker_name for update;

  annual_context :=
    production_control.postcutover_annual_release_context_v1();
  authorization_manifest :=
    production_control.postcutover_annual_release_manifest_v1(
      target_sequence, predecessor.release_rebind_id,
      head.deployment_id, head.deployment_commit,
      input->>'deployment_commit', activation.activation_revision,
      gate.admission_revision, epoch.epoch_id,
      activation.authority_generation_id, gate.admission_generation_id,
      binding.capability_binding_id, binding.contract_version,
      binding.capability_ceiling, annual_context
    );

  if head.release_sequence <> predecessor.release_sequence
     or head.deployment_id <> predecessor.deployment_id
     or head.deployment_commit <> predecessor.deployment_commit
     or authorized_intent.release_sequence <> target_sequence
     or authorized_intent.predecessor_release_rebind_id is distinct from
       predecessor.release_rebind_id
     or authorized_intent.predecessor_deployment_id <> head.deployment_id
     or authorized_intent.predecessor_deployment_commit <>
       head.deployment_commit
     or authorized_intent.target_deployment_commit <>
       input->>'deployment_commit'
     or authorized_intent.authorization_manifest is distinct from
       authorization_manifest
     or authorized_intent.authorization_fingerprint is distinct from
       pg_catalog.encode(extensions.digest(
         authorization_manifest::text, 'sha256'
       ), 'hex')
     or authorized_intent.expected_activation_revision <>
       head.activation_revision
     or authorized_intent.expected_admission_revision <>
       head.admission_revision
     or input->>'expected_predecessor_deployment_id' <> head.deployment_id
     or input->>'expected_predecessor_deployment_commit' <>
       head.deployment_commit
     or baseline.capability_binding_id is distinct from
       predecessor.capability_binding_id
     or activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or activation.current_authority <> 'SUPABASE'
     or activation.maintenance_state <> 'NORMAL'
     or not activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.expected_deployment_commit <> head.deployment_commit
     or activation.activation_revision <>
       (input->>'expected_activation_revision')::bigint
     or activation.activation_revision <> head.activation_revision
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or resource.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or resource.google_workbook_id <>
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or resource.current_tournament_id <> '2026'
     or resource.current_tournament_read_authority <> 'SUPABASE'
     or resource.scoring_authority <> 'SUPABASE'
     or resource.participant_identity_authority <> 'SUPABASE'
     or resource.odds_publication_authority <> 'SUPABASE'
     or not resource.odds_publication_enabled
     or not resource.public_supabase_reads_enabled
     or not resource.scoring_ingress_enabled
     or not resource.workers_enabled
     or not resource.google_writes_enabled
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or gate.authority <> 'SUPABASE'
     or gate.state <> 'OPEN'
     or gate.admission_state <> 'CLOSED'
     or not gate.admission_protocol_enforced
     or gate.active_epoch_id is distinct from epoch.epoch_id
     or epoch.epoch_id is distinct from (input->>'epoch_id')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision <>
       (input->>'expected_admission_revision')::bigint
     or gate.admission_revision <> head.admission_revision
     or gate.admission_deployment_id <> head.deployment_id
     or gate.unresolved_client_queues <> 0
     or binding.contract_version <>
       'production-maintenance-single-deployment-capability-v1'
     or binding.capability_ceiling <> 'OBSERVATION'
     or binding.capability_fingerprint is distinct from pg_catalog.encode(
       extensions.digest(binding.capability_manifest::text, 'sha256'), 'hex'
     )
     or odds_config.validation_status <> 'VALID'
     or pg_catalog.lower(odds_config.source_fingerprint) is distinct from
       pg_catalog.lower(
         input->>'runtime_prediction_settings_source_fingerprint'
       )
     or pg_catalog.lower(odds_config.effective_settings_fingerprint)
       is distinct from pg_catalog.lower(
         input->>'runtime_prediction_settings_effective_fingerprint'
       )
     or not odds_runtime.enabled
     or odds_runtime.operation_mode <> 'PRODUCTION_CUTOVER'
     or odds_runtime.cutover_phase <> 'ODDS_WAR_ROOM'
     or odds_runtime.deployment_commit <> head.deployment_commit
     or odds_runtime.activation_revision <> activation.activation_revision
     or 3 <> (
       select pg_catalog.count(*)
       from production_control.worker_controls controls
       join production_control.worker_contracts contracts using (worker_name)
       where controls.worker_name in (
         'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE',
         'ODDS_CALCULATION'
       )
         and controls.enabled
         and not controls.scheduler_installed
         and contracts.operation_allowed
         and not contracts.scheduler_installed
         and not contracts.authoritative_write_allowed
         and controls.metadata->>'deployment_commit' = head.deployment_commit
         and controls.metadata->>'deployment_id' = head.deployment_id
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_NOT_SAFE';
  end if;
  perform production_control.assert_no_active_physical_writer_fence();

  runtime_manifest := pg_catalog.jsonb_build_object(
    'domain', 'BAGGER_POSTCUTOVER_ANNUAL_NORMAL_RELEASE_REBIND_V1',
    'contract_version', 'production-postcutover-normal-release-rebind-v1',
    'annual_context_contract',
      'production-annual-normal-release-context-v1',
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'release_sequence', target_sequence,
    'predecessor_release_sequence', head.release_sequence,
    'release_intent_id', authorized_intent.release_intent_id,
    'release_intent_fingerprint',
      authorized_intent.authorization_fingerprint,
    'predecessor_deployment_id', head.deployment_id,
    'predecessor_release_sha', head.deployment_commit,
    'deployment_id', input->>'deployment_id',
    'release_sha', input->>'deployment_commit',
    'deployment_hostname', input->>'runtime_deployment_hostname',
    'deployment_status', 'READY',
    'deployment_target', 'PRODUCTION',
    'runtime_environment', 'production',
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
    'supabase_project_ref', 'ymqhhtxaywtqllynrmxe',
    'google_workbook_id',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
    'platform_tournament_id', '2026',
    'authority_epoch', epoch.epoch_id,
    'authority_generation', activation.authority_generation_id,
    'admission_generation', gate.admission_generation_id,
    'activation_revision_before', activation.activation_revision,
    'admission_revision_before', gate.admission_revision,
    'database_phase', 'OBSERVATION',
    'scoring_authority', 'SUPABASE',
    'participant_identity_authority', 'SUPABASE',
    'current_tournament_read_authority', 'SUPABASE',
    'odds_publication_authority', 'SUPABASE',
    'capability_contract', binding.contract_version,
    'capability_ceiling', binding.capability_ceiling,
    'annual_runtime', annual_context,
    'pending_rollback_or_reconciliation', false
  );
  runtime_fingerprint := pg_catalog.encode(
    extensions.digest(runtime_manifest::text, 'sha256'), 'hex'
  );
  next_activation_revision := activation.activation_revision + 1;
  next_admission_revision := gate.admission_revision + 1;

  update production_control.cutover_activation_state
  set expected_deployment_commit = input->>'deployment_commit',
      activation_revision = next_activation_revision,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION';
  update scoring_authority.ingress_gates
  set admission_deployment_id = input->>'deployment_id',
      admission_revision = next_admission_revision,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
    and state = 'OPEN' and admission_state = 'CLOSED';
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_HEAD_ADVANCED';
  end if;
  update scoring_authority.authority_epochs
  set deployment_commit = input->>'deployment_commit',
      closed_admission_revision = next_admission_revision
  where epoch_id = epoch.epoch_id;
  update production_control.worker_controls
  set last_verified_at = runtime_observed_at,
      metadata = metadata || pg_catalog.jsonb_build_object(
        'deployment_commit', input->>'deployment_commit',
        'deployment_id', input->>'deployment_id',
        'runtime_revision', case
          when worker_name = 'ODDS_CALCULATION'
            then pg_catalog.to_jsonb(odds_runtime.runtime_revision + 1)
          else metadata->'runtime_revision'
        end,
        'postcutover_normal_release_sequence', target_sequence,
        'postcutover_normal_release_rebind_id', new_release_rebind_id,
        'postcutover_normal_release_rebound_at', pg_catalog.now()
      )
  where worker_name in (
    'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE', 'ODDS_CALCULATION'
  );
  update production_control.odds_calculation_runtime
  set deployment_commit = input->>'deployment_commit',
      activation_revision = next_activation_revision,
      runtime_revision = runtime_revision + 1,
      last_transition_request_fingerprint =
        pg_catalog.lower(input->>'request_fingerprint'),
      configured_by = pg_catalog.left(input->>'actor_id', 160),
      configured_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION';

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REBOUND',
    'release_rebind_id', new_release_rebind_id,
    'release_sequence', target_sequence,
    'predecessor_release_sequence', head.release_sequence,
    'boundary_mode', 'MAINTENANCE_WINDOW_V1',
    'deployment_commit', input->>'deployment_commit',
    'predecessor_deployment_id', head.deployment_id,
    'deployment_id', input->>'deployment_id',
    'activation_revision', next_activation_revision,
    'admission_revision', next_admission_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'capability_contract', binding.contract_version,
    'capability_ceiling', binding.capability_ceiling,
    'runtime_fingerprint', runtime_fingerprint,
    'current_tournament_id', annual_context->>'tournamentId',
    'runtime_generation_id', annual_context->>'runtimeGenerationId',
    'cutover_phase', 'OBSERVATION', 'authority', 'SUPABASE',
    'participant_identity_authority', 'SUPABASE',
    'maintenance_state', 'NORMAL', 'ingress', 'OPEN',
    'workers_enabled', true, 'idempotent', false
  );

  insert into production_control.postcutover_normal_release_rebindings (
    release_rebind_id, scope_key, boundary_mode, contract_version,
    release_kind, release_sequence, predecessor_release_sequence,
    baseline_application_rebind_id, predecessor_release_rebind_id,
    capability_binding_id, tournament_id, epoch_id,
    authority_generation_id, admission_generation_id,
    predecessor_deployment_id, predecessor_deployment_commit,
    deployment_id, deployment_commit, deployment_hostname,
    vercel_project_id, vercel_team_id,
    capability_contract, capability_ceiling,
    activation_revision_before, activation_revision_after,
    admission_revision_before, admission_revision_after,
    runtime_manifest, runtime_fingerprint, runtime_observed_at,
    request_fingerprint, payload_hash, actor_id, response_value
  ) values (
    new_release_rebind_id, 'BAGGER_INV_PRODUCTION',
    'MAINTENANCE_WINDOW_V1',
    'production-postcutover-normal-release-rebind-v1',
    'NORMAL', target_sequence, head.release_sequence,
    baseline.application_rebind_id, predecessor.release_rebind_id,
    predecessor.capability_binding_id, '2026', epoch.epoch_id,
    activation.authority_generation_id, gate.admission_generation_id,
    head.deployment_id, head.deployment_commit,
    input->>'deployment_id', input->>'deployment_commit',
    input->>'runtime_deployment_hostname',
    'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'team_kPw5zaib8uaQJALAwj4fWI6R',
    binding.contract_version, binding.capability_ceiling,
    activation.activation_revision, next_activation_revision,
    gate.admission_revision, next_admission_revision,
    runtime_manifest, runtime_fingerprint, runtime_observed_at,
    pg_catalog.lower(input->>'request_fingerprint'),
    production_control.cutover_payload_hash(intent_input),
    pg_catalog.left(input->>'actor_id', 160), response_value
  );
  update production_control.postcutover_normal_release_intents
  set status = 'CONSUMED',
      consumed_release_rebind_id = new_release_rebind_id,
      consumed_at = pg_catalog.now()
  where release_intent_id = authorized_intent.release_intent_id
    and status = 'PENDING';
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_ADVANCED';
  end if;
  update production_control.postcutover_normal_release_head
  set release_sequence = target_sequence,
      release_rebind_id = new_release_rebind_id,
      deployment_id = input->>'deployment_id',
      deployment_commit = input->>'deployment_commit',
      activation_revision = next_activation_revision,
      admission_revision = next_admission_revision,
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
    and production_control.postcutover_normal_release_head.release_rebind_id =
      predecessor.release_rebind_id;
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_HEAD_ADVANCED';
  end if;

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    annual_context->>'tournamentId',
    'POSTCUTOVER_NORMAL_RELEASE_REBOUND',
    pg_catalog.left(input->>'actor_id', 160),
    response_value - 'ok' - 'idempotent'
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REBOUND',
    'APPLICATION_RELEASE', annual_context->>'tournamentId',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    response_value - 'ok' - 'idempotent'
  );
  perform production_control.store_cutover_receipt(
    'REBIND_POSTCUTOVER_NORMAL_RELEASE', intent_input, response_value
  );
  return response_value;
exception
  when no_data_found or too_many_rows or invalid_text_representation
    or numeric_value_out_of_range then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_NOT_SAFE';
end;
$rebind_annual_normal_release$;

-- Recreate the public SQL adapter after the predecessor rename so its parsed
-- dependency is unambiguously the annual-aware dispatcher above.
create or replace function
  public.rebind_production_postcutover_normal_release(input jsonb)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $public_annual_normal_release$
  select production_control.rebind_production_postcutover_normal_release(input)
$public_annual_normal_release$;

revoke all on function
  production_control
    .authorize_production_postcutover_normal_release_frozen_2026_v1(jsonb),
  production_control
    .rebind_production_postcutover_normal_release_frozen_2026_v1(jsonb),
  production_control.postcutover_annual_release_context_v1(),
  production_control.postcutover_annual_release_manifest_v1(
    bigint,uuid,text,text,text,bigint,bigint,uuid,uuid,uuid,uuid,text,text,jsonb
  ),
  production_control.authorize_production_postcutover_normal_release(jsonb),
  production_control.rebind_production_postcutover_normal_release(jsonb)
from public, anon, authenticated, service_role;

revoke all on function
  public.rebind_production_postcutover_normal_release(jsonb)
from public, anon, authenticated;
grant execute on function
  public.rebind_production_postcutover_normal_release(jsonb)
to service_role;

comment on function
  production_control.authorize_production_postcutover_normal_release(jsonb)
is 'Database-owner annual-aware normal release authorization; delegates the exact frozen 2026 contract while the pointer is 2026.';

comment on function
  production_control.rebind_production_postcutover_normal_release(jsonb)
is 'Service-role consumed annual-aware normal application release rebind; preserves pointer, annual authority, and tournament facts.';

commit;
