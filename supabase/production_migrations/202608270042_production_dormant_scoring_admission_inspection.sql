begin;

-- Migration 040 reintroduced the staged-release assertion into this read-only
-- inspector. Preserve its current v4 snapshot exactly, but allow the service-
-- role inspection while Production is deliberately DORMANT.
create or replace function public.inspect_production_scoring_admission(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
  settlement
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
  settlement_next_eligible_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  if gate.active_closure_id is not null then
    select * into strict closure
    from production_control.scoring_admission_closures value
    where value.closure_id = gate.active_closure_id;
  end if;
  select * into fence
  from production_control.google_writer_provider_fences value
  where value.status in ('INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED');
  if found then
    select * into settlement
    from production_control.google_writer_provider_fence_settlement_observations value
    where value.fence_id = fence.fence_id
    order by case value.stage
      when 'ACL_READER_CONFIRMED' then 1
      when 'SETTLEMENT_READBACK_1' then 2
      else 3 end desc
    limit 1;
    settlement_next_eligible_at := case settlement.stage
      when 'ACL_READER_CONFIRMED'
        then settlement.recorded_at + interval '190 seconds'
      when 'SETTLEMENT_READBACK_1'
        then settlement.recorded_at + interval '10 seconds'
      else null
    end;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contract_version', 'ADMISSION_V3',
    'database_admission_contract_version', gate.admission_contract_version,
    'admission_begin_contract', 'ADMISSION_V3',
    'provider_credential_class', case
      when gate.provider_principal_fingerprint is not null
        then 'LEGACY_PROVIDER_FENCEABLE'
      else null end,
    'provider_principal_fingerprint', gate.provider_principal_fingerprint,
    'activation_state', activation.state,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'expected_source_fingerprint', activation.expected_source_fingerprint,
    'start_source_fingerprint', activation.expected_source_fingerprint,
    'authority', activation.current_authority,
    'scoring_authority', activation.current_authority,
    'scoring_ingress_enabled', activation.scoring_ingress_enabled,
    -- INSTALLING is already a durable admission reservation even before the
    -- atomic finish-and-close transaction creates the formal closure row.
    -- Report that effective pause explicitly; retain raw database columns under
    -- separate names for audit reconstruction.
    'execution_gate', case when fence.fence_id is not null
      and gate.admission_state = 'OPEN' then 'PAUSED' else gate.state end,
    'admission_state', case when fence.fence_id is not null
      and gate.admission_state = 'OPEN' then 'CLOSING'
      else gate.admission_state end,
    'database_execution_gate', gate.state,
    'database_admission_state', gate.admission_state,
    'admission_pause_reason', case when fence.fence_id is not null
      and gate.admission_state = 'OPEN'
      then 'PROVIDER_FENCE_' || fence.status || '_RESERVATION'
      else null end,
    'admission_protocol_enforced', gate.admission_protocol_enforced,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'admission_deployment_id', gate.admission_deployment_id,
    'deployment_id', gate.admission_deployment_id,
    'active_closure_id', gate.active_closure_id,
    'external_fence_evidence_id', gate.external_fence_evidence_id,
    'active_closure_status', case when gate.active_closure_id is null
      then null else closure.status end,
    'active_closure_high_watermark', case when gate.active_closure_id is null
      then null else closure.lease_high_watermark end,
    'provider_admission_reservation_active', fence.fence_id is not null,
    'provider_admission_reservation_fence_id', fence.fence_id,
    'provider_admission_reservation_status', fence.status,
    'provider_admission_reservation_since', fence.installing_at,
    'provider_settlement_stage', case
      when fence.fence_id is null then null
      when settlement.observation_id is null
        then 'AWAITING_ACL_READER_CONFIRMED'
      else settlement.stage end,
    'provider_settlement_latest_observation_id', settlement.observation_id,
    'provider_settlement_next_eligible_at', settlement_next_eligible_at,
    'provider_settlement_remaining_wait_seconds', case
      when settlement_next_eligible_at is null then 0
      else greatest(0, pg_catalog.ceil(extract(epoch from
        (settlement_next_eligible_at - pg_catalog.now())))::integer)
      end,
    'provider_settlement_install_wait_seconds', 190,
    'provider_settlement_readback_wait_seconds', 10,
    'new_legacy_admission_allowed',
      gate.state = 'OPEN'
      and gate.admission_state = 'OPEN'
      and fence.fence_id is null,
    'v2_unresolved', production_control.scoring_admission_unresolved_count(
      gate.admission_generation_id
    ),
    'legacy_unclassified',
      production_control.scoring_admission_legacy_blocker_count(
        gate.admission_enforced_at
      ),
    'lease_set_fingerprint',
      production_control.scoring_admission_lease_set_fingerprint(
        gate.admission_generation_id
      ),
    'first_supabase_canonical_write_possible',
      activation.first_supabase_write_possible_at is not null,
    'first_supabase_canonical_write_observed',
      activation.first_supabase_write_observed_at is not null,
    'first_supabase_canonical_write_possible_at',
      activation.first_supabase_write_possible_at,
    'first_supabase_canonical_write_observed_at',
      activation.first_supabase_write_observed_at,
    'external_google_writer_fence_centrally_enforced',
      fence.fence_id is not null
      and fence.acl_reader_confirmed_at is not null
      and exists (
        select 1
        from production_control.google_writer_provider_fence_install_dispatches
          install_dispatch
        where install_dispatch.fence_id = fence.fence_id
          and install_dispatch.outcome_status = 'TARGET_CONFIRMED'
          and install_dispatch.provider_mutation_class =
            'DRIVE_LEGACY_PERMISSION_WRITER_TO_READER_V1'
          and install_dispatch.transition_proof->>'currentRole' = 'reader'
          and install_dispatch.transition_proof->'currentLegacyCanEdit' =
            'false'::jsonb
          and install_dispatch.transition_proof->'currentLegacyCanShare' =
            'false'::jsonb
          and install_dispatch.transition_proof_fingerprint =
            fence.acl_reader_transition_fingerprint
      )
      and not exists (
        select 1
        from production_control.google_writer_provider_fence_abort_dispatches
          restore_dispatch
        where restore_dispatch.fence_id = fence.fence_id
          and restore_dispatch.outcome_status = 'TARGET_CONFIRMED'
          and restore_dispatch.provider_mutation_class =
            'DRIVE_LEGACY_PERMISSION_READER_TO_WRITER_V1'
          and restore_dispatch.transition_proof->>'currentRole' = 'writer'
          and restore_dispatch.transition_proof->'currentLegacyCanEdit' =
            'true'::jsonb
          and restore_dispatch.transition_proof->'currentLegacyCanShare' =
            'true'::jsonb
      ),
    'captured_at', pg_catalog.clock_timestamp()
  );
end;
$$;

revoke all on function public.inspect_production_scoring_admission(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.inspect_production_scoring_admission(jsonb)
  to service_role;

comment on function public.inspect_production_scoring_admission(jsonb)
  is 'Service-only exact Production scoring-admission snapshot available in DORMANT and active cutover states without changing authority or application data.';

commit;
