-- Step 11.6 rejected Vercel WAF epoch retirement.
--
-- A synchronous, observed provider rejection proves that the requested WAF
-- mutation was not accepted, but migration 040 intentionally left that epoch
-- ACTIVATION_PENDING.  This additive migration installs one narrow terminal
-- transition.  It does not retire an epoch automatically and it does not
-- change Production authority, admission, ingress, workers, or application
-- data.
begin;

do $migration_preflight$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';

  if activation.state is distinct from 'DORMANT'
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.active_transition_epoch_id is not null
     or activation.active_google_writer_provider_fence_id is not null
     or activation.active_google_writer_provider_verification_id is not null
     or activation.active_vercel_quiesce_evidence_id is not null
     or resource.scoring_authority is distinct from 'GOOGLE'
     or resource.participant_identity_authority is distinct from 'PASSPORT'
     or resource.current_tournament_read_authority is distinct from 'GOOGLE'
     or resource.public_supabase_reads_enabled
     or resource.auth_user_creation_enabled
     or resource.scoring_ingress_enabled
     or resource.workers_enabled
     or gate.state is distinct from 'PAUSED'
     or gate.authority is distinct from 'GOOGLE'
     or gate.admission_state is distinct from 'OPEN'
     or gate.admission_protocol_enforced
     or gate.active_closure_id is not null
     or gate.external_fence_evidence_id is not null
     or gate.google_writer_provider_fence_id is not null
     or gate.google_writer_provider_verification_id is not null
     or exists (
       select 1
       from production_control.worker_controls value
       where value.enabled or value.google_writes_allowed
     )
     or exists (
       select 1
       from scoring_authority.score_mutations
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_REJECTED_WAF_EPOCH_RETIREMENT_MIGRATION_STATE_INVALID';
  end if;

  -- An in-progress epoch is compatible only when its sole provider attempt
  -- ended in a durable, synchronous rejection. No accepted or ambiguous
  -- provider outcome may be normalized by installing this capability.
  if exists (
    select 1
    from production_control.vercel_writer_critical_waf_epochs epoch
    where epoch.status <> 'BASELINE_RESTORED'
      and not (
        epoch.status = 'ACTIVATION_PENDING'
        and epoch.critical_active_observation_id is null
        and epoch.provider_assigned_rule_id is null
        and epoch.bound_fence_id is null
        and epoch.bound_quiesce_evidence_id is null
        and (
          select pg_catalog.count(*)
          from production_control.vercel_writer_critical_waf_dispatches dispatch
          join production_control.vercel_writer_critical_waf_dispatch_results result
            on result.result_id = dispatch.provider_dispatch_result_id
          where dispatch.epoch_id = epoch.epoch_id
            and dispatch.dispatch_step = 'CRITICAL_RULE_INSERT'
            and dispatch.status = 'PROVIDER_REJECTED'
            and result.dispatch_id = dispatch.dispatch_id
            and result.epoch_id = epoch.epoch_id
            and result.outcome_status = 'PROVIDER_REJECTED'
            and result.provider_response_observed
            and result.provider_response_status between 400 and 599
            and result.provider_readback_fingerprint is null
            and result.provider_assigned_rule_id is null
        ) = 1
        and (
          select pg_catalog.count(*)
          from production_control.vercel_writer_critical_waf_dispatches dispatch
          where dispatch.epoch_id = epoch.epoch_id
        ) = 1
      )
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_REJECTED_WAF_EPOCH_RETIREMENT_MIGRATION_PROGRESSION_INVALID';
  end if;
end;
$migration_preflight$;

alter table production_control.vercel_writer_critical_waf_epochs
  add column retirement_request_id uuid unique,
  add column retirement_request_fingerprint text unique check (
    retirement_request_fingerprint is null or
      retirement_request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add column retirement_payload_hash text check (
    retirement_payload_hash is null or
      retirement_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  add column retirement_observation_id uuid unique references
    production_control.vercel_writer_critical_waf_observations(observation_id)
    on delete restrict deferrable initially deferred,
  add column retirement_evidence_fingerprint text unique check (
    retirement_evidence_fingerprint is null or
      retirement_evidence_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add column retirement_candidate_deployment_id text check (
    retirement_candidate_deployment_id is null or
      retirement_candidate_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  add column retirement_candidate_deployment_commit text check (
    retirement_candidate_deployment_commit is null or
      retirement_candidate_deployment_commit ~ '^[0-9a-f]{40}$'
  ),
  add column retirement_reason text check (
    retirement_reason is null or
      retirement_reason = 'PROVIDER_REJECTED_NO_MUTATION'
  ),
  add column retired_at timestamptz;

alter table production_control.vercel_writer_critical_waf_epochs
  drop constraint vercel_writer_critical_waf_epochs_status_check,
  drop constraint production_vercel_writer_critical_waf_epoch_state_check;

alter table production_control.vercel_writer_critical_waf_epochs
  add constraint vercel_writer_critical_waf_epochs_status_check check (
    status in (
      'ACTIVATION_PENDING', 'ACTIVE_UNBOUND', 'FENCE_BOUND',
      'RESTORE_PENDING', 'BASELINE_RESTORED', 'REJECTED_RETIRED'
    )
  ),
  add constraint production_vercel_writer_critical_waf_epoch_state_check check (
    (
      status <> 'REJECTED_RETIRED'
      and retirement_request_id is null
      and retirement_request_fingerprint is null
      and retirement_payload_hash is null
      and retirement_observation_id is null
      and retirement_evidence_fingerprint is null
      and retirement_candidate_deployment_id is null
      and retirement_candidate_deployment_commit is null
      and retirement_reason is null
      and retired_at is null
      and (
        (status = 'ACTIVATION_PENDING'
          and critical_active_observation_id is null
          and critical_semantic_configuration_fingerprint is null
          and critical_active_at is null and bound_fence_id is null
          and bound_quiesce_evidence_id is null and fence_bound_at is null
          and fence_bind_request_id is null
          and fence_bind_request_fingerprint is null
          and fence_bind_payload_hash is null
          and restore_pending_at is null and baseline_restored_at is null
          and baseline_restored_observation_id is null)
        or (status = 'ACTIVE_UNBOUND'
          and critical_active_observation_id is not null
          and provider_assigned_rule_id is not null
          and critical_semantic_configuration_fingerprint is not null
          and critical_active_at is not null and bound_fence_id is null
          and bound_quiesce_evidence_id is null and fence_bound_at is null
          and fence_bind_request_id is null
          and fence_bind_request_fingerprint is null
          and fence_bind_payload_hash is null
          and restore_pending_at is null and baseline_restored_at is null
          and baseline_restored_observation_id is null)
        or (status = 'FENCE_BOUND'
          and critical_active_observation_id is not null
          and provider_assigned_rule_id is not null
          and critical_semantic_configuration_fingerprint is not null
          and critical_active_at is not null and bound_fence_id is not null
          and bound_quiesce_evidence_id is not null and fence_bound_at is not null
          and fence_bind_request_id is not null
          and fence_bind_request_fingerprint is not null
          and fence_bind_payload_hash is not null
          and restore_pending_at is null and baseline_restored_at is null
          and baseline_restored_observation_id is null)
        or (status = 'RESTORE_PENDING'
          and critical_active_observation_id is not null
          and provider_assigned_rule_id is not null
          and critical_semantic_configuration_fingerprint is not null
          and critical_active_at is not null and bound_fence_id is not null
          and bound_quiesce_evidence_id is not null and fence_bound_at is not null
          and fence_bind_request_id is not null
          and fence_bind_request_fingerprint is not null
          and fence_bind_payload_hash is not null
          and restore_pending_at is not null and baseline_restored_at is null
          and baseline_restored_observation_id is null
          and restore_request_id is not null
          and restore_request_fingerprint is not null
          and restore_payload_hash is not null)
        or (status = 'BASELINE_RESTORED'
          and critical_active_observation_id is not null
          and provider_assigned_rule_id is not null
          and critical_semantic_configuration_fingerprint is not null
          and critical_active_at is not null and bound_fence_id is not null
          and bound_quiesce_evidence_id is not null and fence_bound_at is not null
          and fence_bind_request_id is not null
          and fence_bind_request_fingerprint is not null
          and fence_bind_payload_hash is not null
          and restore_pending_at is not null and baseline_restored_at is not null
          and baseline_restored_observation_id is not null
          and restore_request_id is not null
          and restore_request_fingerprint is not null
          and restore_payload_hash is not null)
      )
    )
    or (
      status = 'REJECTED_RETIRED'
      and critical_active_observation_id is null
      and provider_assigned_rule_id is null
      and critical_semantic_configuration_fingerprint is null
      and critical_active_at is null and bound_fence_id is null
      and bound_quiesce_evidence_id is null and fence_bound_at is null
      and fence_bind_request_id is null
      and fence_bind_request_fingerprint is null
      and fence_bind_payload_hash is null
      and restore_pending_at is null and baseline_restored_at is null
      and baseline_restored_observation_id is null
      and restore_request_id is null
      and restore_request_fingerprint is null
      and restore_payload_hash is null
      and retirement_request_id is not null
      and retirement_request_fingerprint is not null
      and retirement_payload_hash is not null
      and retirement_observation_id is not null
      and retirement_evidence_fingerprint is not null
      and retirement_candidate_deployment_id is not null
      and retirement_candidate_deployment_commit is not null
      and retirement_reason = 'PROVIDER_REJECTED_NO_MUTATION'
      and retired_at is not null
    )
  );

drop index production_control.production_vercel_writer_one_active_critical_waf_epoch_idx;
create unique index production_vercel_writer_one_active_critical_waf_epoch_idx
  on production_control.vercel_writer_critical_waf_epochs((true))
  where status not in ('BASELINE_RESTORED', 'REJECTED_RETIRED');

create or replace function public.retire_production_vercel_writer_rejected_waf_epoch(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  epoch production_control.vercel_writer_critical_waf_epochs%rowtype;
  dispatch production_control.vercel_writer_critical_waf_dispatches%rowtype;
  dispatch_result
    production_control.vercel_writer_critical_waf_dispatch_results%rowtype;
  prior_observation
    production_control.vercel_writer_critical_waf_observations%rowtype;
  inserted_observation
    production_control.vercel_writer_critical_waf_observations%rowtype;
  evidence jsonb := input->'verified_waf_evidence';
  retirement_request uuid;
  observation_request uuid;
  evidence_identifier uuid;
  evidence_request uuid;
  payload_hash_value text := production_control.cutover_payload_hash(input);
  provider_observed timestamptz;
  attested timestamptz;
  expires timestamptz;
  retired_at_value timestamptz;
  allowed_keys text[] := array[
    'environment', 'project_ref', 'project_url', 'source_workbook_id',
    'tournament_id', 'actor_id', 'authenticated_actor_fingerprint',
    'operation', 'epoch_id', 'retirement_request_id',
    'fresh_baseline_observation_request_id', 'request_fingerprint',
    'candidate_deployment_id', 'candidate_deployment_commit',
    'verified_waf_evidence'
  ];
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if pg_catalog.jsonb_typeof(input) is distinct from 'object'
     or not (input ?& allowed_keys)
     or (input - allowed_keys) is distinct from '{}'::jsonb
     or input->>'operation' is distinct from
       'RETIRE_PRODUCTION_VERCEL_WRITER_REJECTED_WAF_EPOCH'
     or coalesce(input->>'epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'retirement_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'fresh_baseline_observation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or pg_catalog.jsonb_typeof(evidence) is distinct from 'object'
     or (
       select pg_catalog.count(*)
       from pg_catalog.jsonb_object_keys(evidence)
     ) <> 49
     or not (evidence ?& array[
       'schemaVersion', 'evidenceId', 'evidenceRequestId', 'wafEpochId',
       'transitionRequestId', 'requestFingerprint', 'stage', 'purpose',
       'transitionMode', 'vercelProjectId', 'vercelTeamId',
       'candidateAliasOrigin', 'candidateImmutableOrigin',
       'candidateDeploymentId', 'candidateCommitSha',
       'candidateDeploymentTarget', 'runOwnedRuleName', 'runOwnedRuleNonce',
       'runOwnedRuleFingerprint', 'runOwnedInsertDocumentFingerprint',
       'providerAssignedRuleId', 'baselineEvidenceId', 'criticalEvidenceId',
       'baselineConfigurationVersion',
       'baselineSourceVersionReadFingerprint', 'configurationMode',
       'configurationVersion', 'configurationEtag',
       'providerConfigurationId', 'providerOwnerId',
       'configurationIdentityFingerprint', 'semanticConfiguration',
       'semanticConfigurationFingerprint', 'orderedCustomRulesFingerprint',
       'baselineSemanticFingerprint', 'criticalSemanticFingerprint',
       'customRuleCount', 'runOwnedProviderRuleDocumentFingerprint',
       'runOwnedRulePrecedence', 'criticalWindowContractFingerprint',
       'pendingDraftChangeCount', 'providerObservedAt', 'attestedAt',
       'expiresAt', 'sourceVersionReadFingerprint', 'evidenceFingerprint',
       'signerKeyFingerprint', 'signerKeyVersion', 'signatureVerified'
     ]::text[])
     or evidence->>'schemaVersion' is distinct from
       'bagger-vercel-waf-provider-evidence-v1'
     or evidence->'signatureVerified' is distinct from 'true'::jsonb
     or evidence->>'signerKeyVersion' is distinct from
       'STEP11_6_VERCEL_ATTESTER_V1'
     or evidence->>'stage' is distinct from 'BASELINE_CAPTURE'
     or evidence->>'configurationMode' is distinct from 'BASELINE'
     or evidence->>'candidateDeploymentTarget' is distinct from 'PREVIEW'
     or evidence->>'candidateDeploymentId' is distinct from
       input->>'candidate_deployment_id'
     or pg_catalog.lower(evidence->>'candidateCommitSha') is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or coalesce(evidence->>'candidateAliasOrigin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(evidence->>'candidateImmutableOrigin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(evidence->>'evidenceId', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(evidence->>'evidenceRequestId', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(evidence->>'transitionRequestId', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(evidence->>'requestFingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(evidence->>'evidenceFingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(evidence->>'signerKeyFingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(evidence->>'configurationIdentityFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(evidence->>'semanticConfigurationFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(evidence->>'orderedCustomRulesFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(evidence->>'baselineSemanticFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(evidence->>'sourceVersionReadFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(evidence->'semanticConfiguration')
       is distinct from 'object'
     or (
       select pg_catalog.count(*)
       from pg_catalog.jsonb_object_keys(evidence->'semanticConfiguration')
     ) <> 7
     or not ((evidence->'semanticConfiguration') ?& array[
       'schemaVersion', 'securityConfigurationKeys',
       'securityConfigurationKeysFingerprint', 'firewallEnabled', 'ips',
       'crs', 'orderedCustomRules'
     ]::text[])
     or evidence->'semanticConfiguration'->'firewallEnabled'
       is distinct from 'true'::jsonb
     or pg_catalog.jsonb_typeof(
       evidence->'semanticConfiguration'->'orderedCustomRules'
     ) is distinct from 'array'
     or pg_catalog.jsonb_array_length(
       evidence->'semanticConfiguration'->'orderedCustomRules'
     ) <> 0
     or evidence->>'providerAssignedRuleId' is not null
     or evidence->>'baselineEvidenceId' is not null
     or evidence->>'criticalEvidenceId' is not null
     or evidence->>'baselineConfigurationVersion' is not null
     or evidence->>'baselineSourceVersionReadFingerprint' is not null
     or evidence->>'criticalSemanticFingerprint' is not null
     or evidence->>'runOwnedProviderRuleDocumentFingerprint' is not null
     or evidence->>'runOwnedRulePrecedence' is not null
     or evidence->>'criticalWindowContractFingerprint' is not null
     or coalesce(evidence->>'customRuleCount', '') !~ '^0$'
     or coalesce(evidence->>'pendingDraftChangeCount', '') !~ '^0$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_WRITER_REJECTED_WAF_RETIREMENT_INPUT_INVALID';
  end if;

  retirement_request := (input->>'retirement_request_id')::uuid;
  observation_request :=
    (input->>'fresh_baseline_observation_request_id')::uuid;
  evidence_identifier := (evidence->>'evidenceId')::uuid;
  evidence_request := (evidence->>'evidenceRequestId')::uuid;
  if evidence->>'wafEpochId' is distinct from input->>'epoch_id'
     or (evidence->>'transitionRequestId')::uuid is distinct from
       retirement_request
     or (
       select pg_catalog.count(distinct identifier)
       from pg_catalog.unnest(array[
         retirement_request, observation_request,
         evidence_identifier, evidence_request
       ]) identifier
     ) <> 4
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_REJECTED_WAF_RETIREMENT_IDENTITY_INVALID';
  end if;

  provider_observed := (evidence->>'providerObservedAt')::timestamptz;
  attested := (evidence->>'attestedAt')::timestamptz;
  expires := (evidence->>'expiresAt')::timestamptz;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into strict epoch
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_id = (input->>'epoch_id')::uuid
  for update;

  -- Every call, including a lost-response retry, must carry a fresh signed
  -- readback of the exact baseline. The durable request identity and evidence
  -- IDs remain stable across a retry; time-bound signature/fingerprint fields
  -- may be refreshed without creating a second observation or audit event.
  if epoch.status not in ('ACTIVATION_PENDING', 'REJECTED_RETIRED')
     or epoch.critical_active_observation_id is not null
     or epoch.provider_assigned_rule_id is not null
     or epoch.bound_fence_id is not null
     or epoch.bound_quiesce_evidence_id is not null
     or evidence->>'purpose' is distinct from epoch.purpose
     or evidence->>'transitionMode' is distinct from epoch.transition_mode
     or evidence->>'vercelProjectId' is distinct from epoch.vercel_project_id
     or evidence->>'vercelTeamId' is distinct from epoch.vercel_team_id
     or evidence->>'runOwnedRuleName' is distinct from epoch.run_owned_rule_name
     or (evidence->>'runOwnedRuleNonce')::uuid is distinct from
       epoch.run_owned_rule_nonce
     or pg_catalog.lower(evidence->>'runOwnedRuleFingerprint') is distinct from
       epoch.run_owned_rule_fingerprint
     or pg_catalog.lower(
       evidence->>'runOwnedInsertDocumentFingerprint'
     ) is distinct from epoch.run_owned_insert_document_fingerprint
     or evidence->>'configurationVersion' is distinct from
       epoch.baseline_active_config_version
     or nullif(evidence->>'configurationEtag', '') is distinct from
       epoch.baseline_active_config_etag
     or evidence->>'providerConfigurationId' is distinct from
       epoch.baseline_provider_configuration_id
     or evidence->>'providerOwnerId' is distinct from
       epoch.baseline_provider_owner_id
     or pg_catalog.lower(
       evidence->>'configurationIdentityFingerprint'
     ) is distinct from epoch.baseline_configuration_identity_fingerprint
     or pg_catalog.lower(
       evidence->>'sourceVersionReadFingerprint'
     ) is distinct from epoch.baseline_source_version_read_fingerprint
     or pg_catalog.lower(
       evidence->>'semanticConfigurationFingerprint'
     ) is distinct from epoch.baseline_semantic_configuration_fingerprint
     or pg_catalog.lower(
       evidence->>'baselineSemanticFingerprint'
     ) is distinct from epoch.baseline_semantic_configuration_fingerprint
     or pg_catalog.lower(
       evidence->>'orderedCustomRulesFingerprint'
     ) is distinct from epoch.baseline_ordered_rules_fingerprint
     or provider_observed is distinct from attested
     or provider_observed < pg_catalog.clock_timestamp() - interval '120 seconds'
     or provider_observed > pg_catalog.clock_timestamp() + interval '30 seconds'
     or expires is distinct from attested + interval '2100 seconds'
     or expires <= pg_catalog.clock_timestamp()
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_REJECTED_WAF_RETIREMENT_BASELINE_INVALID';
  end if;

  select * into prior_observation
  from production_control.vercel_writer_critical_waf_observations value
  where value.observation_id = epoch.retirement_observation_id;
  if epoch.status = 'REJECTED_RETIRED' then
    if epoch.retirement_request_id is distinct from retirement_request
       or epoch.retirement_request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or epoch.retirement_candidate_deployment_id is distinct from
         input->>'candidate_deployment_id'
       or epoch.retirement_candidate_deployment_commit is distinct from
         pg_catalog.lower(input->>'candidate_deployment_commit')
       or epoch.retirement_reason is distinct from
         'PROVIDER_REJECTED_NO_MUTATION'
       or prior_observation.observation_id is null
       or prior_observation.record_request_id is distinct from
         observation_request
       or prior_observation.provider_evidence_id is distinct from
         evidence_identifier
       or prior_observation.evidence_request_id is distinct from
         evidence_request
       or prior_observation.evidence_fingerprint is distinct from
         epoch.retirement_evidence_fingerprint
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_REJECTED_WAF_RETIREMENT_IDEMPOTENCY_CONFLICT';
    end if;
    return production_control.vercel_writer_critical_waf_epoch_response(
      epoch, true
    ) || pg_catalog.jsonb_build_object(
      'retirement_request_id', epoch.retirement_request_id,
      'retirement_observation_id', epoch.retirement_observation_id,
      'retirement_evidence_fingerprint',
        epoch.retirement_evidence_fingerprint,
      'retirement_reason', epoch.retirement_reason,
      'retired_at', epoch.retired_at,
      'provider_mutation_performed', false
    );
  end if;

  if epoch.retirement_request_id is not null
     or activation.state is distinct from 'DORMANT'
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.active_transition_epoch_id is not null
     or activation.active_google_writer_provider_fence_id is not null
     or activation.active_google_writer_provider_verification_id is not null
     or activation.active_vercel_quiesce_evidence_id is not null
     or resource.scoring_authority is distinct from 'GOOGLE'
     or resource.participant_identity_authority is distinct from 'PASSPORT'
     or resource.scoring_ingress_enabled
     or resource.workers_enabled
     or gate.state is distinct from 'PAUSED'
     or gate.authority is distinct from 'GOOGLE'
     or gate.admission_state is distinct from 'OPEN'
     or gate.admission_protocol_enforced
     or gate.active_closure_id is not null
     or gate.external_fence_evidence_id is not null
     or gate.google_writer_provider_fence_id is not null
     or gate.google_writer_provider_verification_id is not null
     or exists (
       select 1
       from production_control.worker_controls value
       where value.enabled or value.google_writes_allowed
     )
     or exists (select 1 from scoring_authority.score_mutations)
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_REJECTED_WAF_RETIREMENT_STATE_INVALID';
  end if;

  select * into dispatch
  from production_control.vercel_writer_critical_waf_dispatches value
  where value.epoch_id = epoch.epoch_id
  for update;
  if not found
     or dispatch.dispatch_step is distinct from 'CRITICAL_RULE_INSERT'
     or dispatch.status is distinct from 'PROVIDER_REJECTED'
     or dispatch.provider_dispatch_started_at is null
     or dispatch.provider_dispatch_result_id is null
     or dispatch.provider_result_observation_id is not null
     or dispatch.provider_result_fingerprint is null
     or dispatch.provider_observed_at is null
     or dispatch.recorded_at is null
     or (
       select pg_catalog.count(*)
       from production_control.vercel_writer_critical_waf_dispatches value
       where value.epoch_id = epoch.epoch_id
     ) <> 1
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_REJECTED_WAF_RETIREMENT_DISPATCH_INVALID';
  end if;

  select * into strict dispatch_result
  from production_control.vercel_writer_critical_waf_dispatch_results value
  where value.result_id = dispatch.provider_dispatch_result_id;
  if dispatch_result.dispatch_id is distinct from dispatch.dispatch_id
     or dispatch_result.epoch_id is distinct from epoch.epoch_id
     or dispatch_result.dispatch_step is distinct from 'CRITICAL_RULE_INSERT'
     or dispatch_result.outcome_status is distinct from 'PROVIDER_REJECTED'
     or not dispatch_result.provider_response_observed
     or dispatch_result.provider_response_status not between 400 and 599
     or dispatch_result.provider_response_fingerprint is null
     or dispatch_result.provider_readback_fingerprint is not null
     or dispatch_result.active_semantic_configuration is not null
     or dispatch_result.active_semantic_configuration_fingerprint is not null
     or dispatch_result.active_custom_rule_count is not null
     or dispatch_result.active_pending_draft_present is not null
     or dispatch_result.draft_semantic_configuration is not null
     or dispatch_result.draft_semantic_configuration_fingerprint is not null
     or dispatch_result.draft_ordered_rules_fingerprint is not null
     or dispatch_result.draft_configuration_version is not null
     or dispatch_result.draft_configuration_identity_fingerprint is not null
     or dispatch_result.draft_custom_rule_count is not null
     or dispatch_result.pending_draft_change_count is not null
     or dispatch_result.provider_assigned_rule_id is not null
     or dispatch_result.run_owned_provider_rule_document_fingerprint is not null
     or dispatch_result.run_owned_rule_precedence is not null
     or dispatch_result.critical_window_contract_fingerprint is not null
     or (
       select pg_catalog.count(*)
       from production_control.vercel_writer_critical_waf_dispatch_results value
       where value.dispatch_id = dispatch.dispatch_id
     ) <> 1
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_REJECTED_WAF_RETIREMENT_RESULT_INVALID';
  end if;

  insert into production_control.vercel_writer_critical_waf_observations (
    observation_id, epoch_id, provider_evidence_id, provider_evidence_schema,
    evidence_request_id, transition_request_id, evidence_stage,
    record_request_id, record_request_fingerprint, record_payload_hash,
    request_fingerprint, evidence_fingerprint, signer_key_fingerprint,
    signer_key_version, purpose, transition_mode,
    vercel_project_id, vercel_team_id,
    candidate_alias_origin, candidate_immutable_origin,
    candidate_deployment_id, candidate_commit_sha,
    candidate_deployment_target, configuration_mode,
    active_config_version, active_config_etag,
    provider_configuration_id, provider_owner_id,
    configuration_identity_fingerprint, semantic_configuration,
    semantic_configuration_fingerprint, ordered_rules_fingerprint,
    custom_rule_count, baseline_configuration_version,
    baseline_source_version_read_fingerprint,
    source_version_read_fingerprint, baseline_evidence_id,
    critical_evidence_id, baseline_semantic_fingerprint,
    critical_semantic_fingerprint, run_owned_rule_name, run_owned_rule_nonce,
    provider_assigned_rule_id, run_owned_rule_fingerprint,
    run_owned_insert_document_fingerprint,
    run_owned_provider_rule_document_fingerprint,
    run_owned_rule_precedence, critical_window_contract_fingerprint,
    pending_draft_change_count, provider_observed_at, attested_at, expires_at
  ) values (
    extensions.gen_random_uuid(), epoch.epoch_id, evidence_identifier,
    evidence->>'schemaVersion', evidence_request, retirement_request,
    'BASELINE_CAPTURE', observation_request,
    pg_catalog.lower(input->>'request_fingerprint'), payload_hash_value,
    pg_catalog.lower(evidence->>'requestFingerprint'),
    pg_catalog.lower(evidence->>'evidenceFingerprint'),
    pg_catalog.lower(evidence->>'signerKeyFingerprint'),
    evidence->>'signerKeyVersion', epoch.purpose, epoch.transition_mode,
    epoch.vercel_project_id, epoch.vercel_team_id,
    pg_catalog.lower(evidence->>'candidateAliasOrigin'),
    pg_catalog.lower(evidence->>'candidateImmutableOrigin'),
    input->>'candidate_deployment_id',
    pg_catalog.lower(input->>'candidate_deployment_commit'), 'PREVIEW',
    'BASELINE', evidence->>'configurationVersion',
    nullif(evidence->>'configurationEtag', ''),
    evidence->>'providerConfigurationId', evidence->>'providerOwnerId',
    pg_catalog.lower(evidence->>'configurationIdentityFingerprint'),
    evidence->'semanticConfiguration',
    pg_catalog.lower(evidence->>'semanticConfigurationFingerprint'),
    pg_catalog.lower(evidence->>'orderedCustomRulesFingerprint'), 0,
    null, null,
    pg_catalog.lower(evidence->>'sourceVersionReadFingerprint'),
    null, null,
    pg_catalog.lower(evidence->>'baselineSemanticFingerprint'), null,
    epoch.run_owned_rule_name, epoch.run_owned_rule_nonce, null,
    epoch.run_owned_rule_fingerprint,
    epoch.run_owned_insert_document_fingerprint,
    null, null, null, 0, provider_observed, attested, expires
  ) returning * into inserted_observation;

  retired_at_value := pg_catalog.clock_timestamp();
  update production_control.vercel_writer_critical_waf_epochs
  set status = 'REJECTED_RETIRED',
      retirement_request_id = retirement_request,
      retirement_request_fingerprint =
        pg_catalog.lower(input->>'request_fingerprint'),
      retirement_payload_hash = payload_hash_value,
      retirement_observation_id = inserted_observation.observation_id,
      retirement_evidence_fingerprint =
        inserted_observation.evidence_fingerprint,
      retirement_candidate_deployment_id = input->>'candidate_deployment_id',
      retirement_candidate_deployment_commit =
        pg_catalog.lower(input->>'candidate_deployment_commit'),
      retirement_reason = 'PROVIDER_REJECTED_NO_MUTATION',
      retired_at = retired_at_value,
      updated_at = retired_at_value
  where epoch_id = epoch.epoch_id
    and status = 'ACTIVATION_PENDING'
    and retirement_request_id is null
  returning * into strict epoch;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor,
    request_fingerprint, result, details
  ) values (
    'PRODUCTION_VERCEL_WRITER_REJECTED_WAF_EPOCH_RETIRED',
    'SCORING_AUTHORITY', '2026', pg_catalog.left(input->>'actor_id', 160),
    epoch.retirement_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'epoch_id', epoch.epoch_id,
      'retirement_request_id', epoch.retirement_request_id,
      'retirement_observation_id', epoch.retirement_observation_id,
      'retirement_evidence_fingerprint',
        epoch.retirement_evidence_fingerprint,
      'retirement_candidate_deployment_id',
        epoch.retirement_candidate_deployment_id,
      'retirement_candidate_deployment_commit',
        epoch.retirement_candidate_deployment_commit,
      'retirement_reason', epoch.retirement_reason,
      'rejected_dispatch_id', dispatch.dispatch_id,
      'rejected_dispatch_result_id', dispatch_result.result_id,
      'provider_response_status', dispatch_result.provider_response_status,
      'provider_mutation_performed', false,
      'retired_at', epoch.retired_at
    )
  );

  return production_control.vercel_writer_critical_waf_epoch_response(
    epoch, false
  ) || pg_catalog.jsonb_build_object(
    'retirement_request_id', epoch.retirement_request_id,
    'retirement_observation_id', epoch.retirement_observation_id,
    'retirement_evidence_fingerprint', epoch.retirement_evidence_fingerprint,
    'retirement_reason', epoch.retirement_reason,
    'retired_at', epoch.retired_at,
    'provider_mutation_performed', false
  );
end;
$$;

create unique index production_vercel_writer_rejected_waf_retirement_audit_idx
  on production_control.operation_audit_events(request_fingerprint)
  where event_type =
    'PRODUCTION_VERCEL_WRITER_REJECTED_WAF_EPOCH_RETIRED';

revoke all on function
  public.retire_production_vercel_writer_rejected_waf_epoch(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.retire_production_vercel_writer_rejected_waf_epoch(jsonb)
  to service_role;

comment on function
  public.retire_production_vercel_writer_rejected_waf_epoch(jsonb)
is 'Terminally retires only an ACTIVATION_PENDING WAF epoch whose sole synchronous provider attempt is durably PROVIDER_REJECTED, after fresh exact baseline readback proves no provider mutation. It never mutates Vercel or Production scoring authority.';

notify pgrst, 'reload schema';

commit;
