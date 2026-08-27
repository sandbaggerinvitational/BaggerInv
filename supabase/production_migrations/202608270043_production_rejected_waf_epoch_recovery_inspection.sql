begin;

-- Keep the established exact-epoch inspector unchanged and add one bounded
-- service-role recovery operation. The recovery branch reads the private
-- production_control evidence through SECURITY DEFINER instead of exposing
-- that schema through PostgREST.
create or replace function public.inspect_production_vercel_writer_critical_waf_epoch(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  epoch production_control.vercel_writer_critical_waf_epochs%rowtype;
  dispatch production_control.vercel_writer_critical_waf_dispatches%rowtype;
  dispatch_result
    production_control.vercel_writer_critical_waf_dispatch_results%rowtype;
  active_epoch_count bigint;
  retired_epoch_count bigint;
  dispatch_count bigint;
  dispatch_result_count bigint;
  expected_epoch_id uuid;
  expected_retirement_request_id uuid;
  required_recovery_keys text[] := array[
    'environment', 'project_ref', 'project_url', 'source_workbook_id',
    'tournament_id', 'operation', 'vercel_project_id', 'expected_status',
    'expected_purpose', 'expected_transition_mode'
  ];
  allowed_recovery_keys text[] := array[
    'environment', 'project_ref', 'project_url', 'source_workbook_id',
    'tournament_id', 'operation', 'vercel_project_id', 'expected_status',
    'expected_purpose', 'expected_transition_mode', 'expected_epoch_id',
    'retirement_request_id'
  ];
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);

  -- Preserve the pre-043 exact inspector contract and response verbatim.
  if input->>'operation' =
       'INSPECT_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_EPOCH'
  then
    if input->>'operation' is distinct from
         'INSPECT_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_EPOCH'
       or coalesce(input->>'epoch_id', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(input->>'candidate_deployment_id', '')
         !~ '^dpl_[A-Za-z0-9]{8,64}$'
       or coalesce(input->>'candidate_deployment_commit', '')
         !~ '^[0-9a-f]{40}$'
    then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_INSPECT_INPUT_INVALID';
    end if;
    select * into epoch
    from production_control.vercel_writer_critical_waf_epochs value
    where value.epoch_id = (input->>'epoch_id')::uuid;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'found', false,
        'contract_version', 'CRITICAL_WINDOW_WAF_V1',
        'epoch_id', (input->>'epoch_id')::uuid
      );
    end if;
    if epoch.candidate_deployment_id is distinct from
         input->>'candidate_deployment_id'
       or epoch.candidate_deployment_commit is distinct from
         pg_catalog.lower(input->>'candidate_deployment_commit')
       or epoch.candidate_deployment_target is distinct from 'PREVIEW'
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_INSPECT_SCOPE_MISMATCH';
    end if;
    return pg_catalog.jsonb_build_object('found', true) ||
      production_control.vercel_writer_critical_waf_epoch_response(epoch, true);
  end if;

  if pg_catalog.jsonb_typeof(input) is distinct from 'object'
     or not (input ?& required_recovery_keys)
     or (input - allowed_recovery_keys) is distinct from '{}'::jsonb
     or input->>'operation' is distinct from
       'RECOVER_PRODUCTION_VERCEL_WRITER_REJECTED_WAF_EPOCH'
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'expected_purpose' is distinct from 'REHEARSAL'
     or input->>'expected_transition_mode' is distinct from 'REHEARSAL'
     or input->>'expected_status' is null
     or input->>'expected_status' not in (
       'ACTIVATION_PENDING', 'ACTIVATION_PENDING_OR_REJECTED_RETIRED'
     )
     or (input->>'expected_epoch_id' is not null
       and input->>'expected_epoch_id'
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')
     or (input->>'retirement_request_id' is not null
       and input->>'retirement_request_id'
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')
     or (input->>'retirement_request_id' is not null
       and input->>'expected_epoch_id' is null)
     or (input->>'expected_status' =
         'ACTIVATION_PENDING_OR_REJECTED_RETIRED'
       and (input->>'expected_epoch_id' is null
         or input->>'retirement_request_id' is null))
     or (input->>'expected_status' = 'ACTIVATION_PENDING'
       and input->>'retirement_request_id' is not null)
  then
    raise exception using errcode = '22023',
      message = 'STEP11_6_VERCEL_WAF_RECOVERY_INPUT_INVALID';
  end if;

  expected_epoch_id := nullif(input->>'expected_epoch_id', '')::uuid;
  expected_retirement_request_id :=
    nullif(input->>'retirement_request_id', '')::uuid;

  -- Serialize discovery with begin/retire lifecycle operations. This is a
  -- read-only shared lock and does not change authority or epoch state.
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );

  select pg_catalog.count(*) into active_epoch_count
  from production_control.vercel_writer_critical_waf_epochs value
  where value.status = 'ACTIVATION_PENDING'
    and value.purpose = 'REHEARSAL'
    and value.transition_mode = 'REHEARSAL'
    and value.vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU';

  if active_epoch_count > 1 then
    raise exception using errcode = '55000',
      message = 'STEP11_6_VERCEL_WAF_RECOVERY_CONFLICT';
  end if;

  if active_epoch_count = 1 then
    select * into strict epoch
    from production_control.vercel_writer_critical_waf_epochs value
    where value.status = 'ACTIVATION_PENDING'
      and value.purpose = 'REHEARSAL'
      and value.transition_mode = 'REHEARSAL'
      and value.vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU';

    if expected_epoch_id is not null
       and epoch.epoch_id is distinct from expected_epoch_id
    then
      raise exception using errcode = '55000',
        message = 'STEP11_6_VERCEL_WAF_RECOVERY_EPOCH_MISMATCH';
    end if;
  elsif expected_epoch_id is not null
        and expected_retirement_request_id is not null
  then
    select pg_catalog.count(*) into retired_epoch_count
    from production_control.vercel_writer_critical_waf_epochs value
    where value.epoch_id = expected_epoch_id
      and value.status = 'REJECTED_RETIRED'
      and value.purpose = 'REHEARSAL'
      and value.transition_mode = 'REHEARSAL'
      and value.vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
      and value.retirement_request_id = expected_retirement_request_id
      and value.retirement_reason = 'PROVIDER_REJECTED_NO_MUTATION'
      and value.retired_at is not null;

    if retired_epoch_count > 1 then
      raise exception using errcode = '55000',
        message = 'STEP11_6_VERCEL_WAF_RECOVERY_CONFLICT';
    elsif retired_epoch_count = 1 then
      select * into strict epoch
      from production_control.vercel_writer_critical_waf_epochs value
      where value.epoch_id = expected_epoch_id
        and value.status = 'REJECTED_RETIRED'
        and value.purpose = 'REHEARSAL'
        and value.transition_mode = 'REHEARSAL'
        and value.vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
        and value.retirement_request_id = expected_retirement_request_id
        and value.retirement_reason = 'PROVIDER_REJECTED_NO_MUTATION'
        and value.retired_at is not null;
    end if;
  end if;

  if epoch.epoch_id is null then
    raise exception using errcode = '55000',
      message = 'STEP11_6_VERCEL_WAF_RECOVERY_NOT_FOUND';
  end if;

  if epoch.candidate_deployment_target is distinct from 'PREVIEW'
     or epoch.critical_active_observation_id is not null
     or epoch.provider_assigned_rule_id is not null
     or epoch.bound_fence_id is not null
     or epoch.bound_quiesce_evidence_id is not null
  then
    raise exception using errcode = '55000',
      message = 'STEP11_6_VERCEL_WAF_RECOVERY_SCOPE_INVALID';
  end if;

  select pg_catalog.count(*) into dispatch_count
  from production_control.vercel_writer_critical_waf_dispatches value
  where value.epoch_id = epoch.epoch_id;
  if dispatch_count is distinct from 1::bigint then
    raise exception using errcode = '55000',
      message = 'STEP11_6_VERCEL_WAF_RECOVERY_DISPATCH_INVALID';
  end if;
  select * into strict dispatch
  from production_control.vercel_writer_critical_waf_dispatches value
  where value.epoch_id = epoch.epoch_id;

  if dispatch.dispatch_step is distinct from 'CRITICAL_RULE_INSERT'
     or dispatch.status is distinct from 'PROVIDER_REJECTED'
     or dispatch.provider_dispatch_started_at is null
     or dispatch.provider_dispatch_result_id is null
     or dispatch.provider_result_observation_id is not null
     or dispatch.provider_result_fingerprint is null
     or dispatch.provider_observed_at is null
     or dispatch.recorded_at is null
  then
    raise exception using errcode = '55000',
      message = 'STEP11_6_VERCEL_WAF_RECOVERY_DISPATCH_INVALID';
  end if;

  select pg_catalog.count(*) into dispatch_result_count
  from production_control.vercel_writer_critical_waf_dispatch_results value
  where value.dispatch_id = dispatch.dispatch_id;
  if dispatch_result_count is distinct from 1::bigint then
    raise exception using errcode = '55000',
      message = 'STEP11_6_VERCEL_WAF_RECOVERY_RESULT_INVALID';
  end if;
  select * into strict dispatch_result
  from production_control.vercel_writer_critical_waf_dispatch_results value
  where value.dispatch_id = dispatch.dispatch_id;

  if dispatch_result.result_id is distinct from
       dispatch.provider_dispatch_result_id
     or dispatch_result.epoch_id is distinct from epoch.epoch_id
     or dispatch_result.dispatch_step is distinct from 'CRITICAL_RULE_INSERT'
     or dispatch_result.outcome_status is distinct from 'PROVIDER_REJECTED'
     or not dispatch_result.provider_response_observed
     or dispatch_result.provider_response_status is null
     or dispatch_result.provider_response_status not between 400 and 599
     or dispatch_result.provider_response_fingerprint is null
     or dispatch_result.provider_readback_fingerprint is not null
     or dispatch_result.provider_assigned_rule_id is not null
     or dispatch_result.purpose is distinct from 'REHEARSAL'
     or dispatch_result.transition_mode is distinct from 'REHEARSAL'
     or dispatch_result.vercel_project_id is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or dispatch_result.vercel_team_id is distinct from epoch.vercel_team_id
     or dispatch_result.candidate_alias_origin is distinct from
       epoch.candidate_alias_origin
     or dispatch_result.candidate_immutable_origin is distinct from
       epoch.candidate_immutable_origin
     or dispatch_result.candidate_deployment_id is distinct from
       epoch.candidate_deployment_id
     or dispatch_result.candidate_commit_sha is distinct from
       epoch.candidate_deployment_commit
     or dispatch_result.candidate_deployment_target is distinct from 'PREVIEW'
     or dispatch_result.run_owned_rule_name is distinct from
       epoch.run_owned_rule_name
     or dispatch_result.run_owned_rule_nonce is distinct from
       epoch.run_owned_rule_nonce
     or dispatch_result.run_owned_rule_fingerprint is distinct from
       epoch.run_owned_rule_fingerprint
     or dispatch_result.run_owned_insert_document_fingerprint is distinct from
       epoch.run_owned_insert_document_fingerprint
     or dispatch_result.baseline_configuration_version is distinct from
       epoch.baseline_active_config_version
     or dispatch_result.baseline_configuration_etag is distinct from
       epoch.baseline_active_config_etag
     or dispatch_result.baseline_configuration_identity_fingerprint
       is distinct from epoch.baseline_configuration_identity_fingerprint
     or dispatch_result.baseline_semantic_configuration_fingerprint
       is distinct from epoch.baseline_semantic_configuration_fingerprint
     or dispatch_result.baseline_ordered_rules_fingerprint is distinct from
       epoch.baseline_ordered_rules_fingerprint
     or dispatch_result.baseline_source_version_read_fingerprint
       is distinct from epoch.baseline_source_version_read_fingerprint
  then
    raise exception using errcode = '55000',
      message = 'STEP11_6_VERCEL_WAF_RECOVERY_RESULT_INVALID';
  end if;

  return pg_catalog.jsonb_build_object(
      'ok', true,
      'epoch_id', epoch.epoch_id,
      'status', epoch.status,
      'purpose', epoch.purpose,
      'transition_mode', epoch.transition_mode,
      'vercel_project_id', epoch.vercel_project_id,
      'vercel_team_id', epoch.vercel_team_id,
      'candidate_deployment_id', epoch.candidate_deployment_id,
      'candidate_deployment_commit', epoch.candidate_deployment_commit,
      'candidate_deployment_target', epoch.candidate_deployment_target,
      'candidate_alias_origin', epoch.candidate_alias_origin,
      'candidate_immutable_origin', epoch.candidate_immutable_origin,
      'candidate_control_hosts_fingerprint',
        epoch.candidate_control_hosts_fingerprint,
      'run_owned_rule_name', epoch.run_owned_rule_name,
      'run_owned_rule_nonce', epoch.run_owned_rule_nonce,
      'run_owned_rule_fingerprint', epoch.run_owned_rule_fingerprint,
      'run_owned_insert_document_fingerprint',
        epoch.run_owned_insert_document_fingerprint,
      'retirement_request_id', epoch.retirement_request_id,
      'retirement_candidate_deployment_id',
        epoch.retirement_candidate_deployment_id,
      'retirement_candidate_deployment_commit',
        epoch.retirement_candidate_deployment_commit,
      'retirement_reason', epoch.retirement_reason,
      'retired_at', epoch.retired_at,
      'rejected_dispatch_id', dispatch.dispatch_id,
      'rejected_dispatch_result_id', dispatch_result.result_id,
      'provider_response_status', dispatch_result.provider_response_status
    );
end;
$$;

revoke all on function
  public.inspect_production_vercel_writer_critical_waf_epoch(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.inspect_production_vercel_writer_critical_waf_epoch(jsonb)
  to service_role;

comment on function
  public.inspect_production_vercel_writer_critical_waf_epoch(jsonb)
is 'Service-only exact WAF epoch inspection with a bounded provider-rejected rehearsal recovery branch; it never mutates provider or Production authority state.';

commit;
