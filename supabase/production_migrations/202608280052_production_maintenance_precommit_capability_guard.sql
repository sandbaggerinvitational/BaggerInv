-- Treat the certified single-deployment capability ceiling as dormant metadata
-- until the MAINTENANCE_WINDOW_V1 precommit rebind has established its exact
-- epoch/deployment capability binding. Installation is inert: it changes no
-- state, authority, phase, ingress, worker, or write predicate.
begin;

create or replace function production_control.assert_production_cutover_read_scope(
  input jsonb,
  required_phase text
) returns production_control.resource_scope
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  required_rank integer := production_control.cutover_phase_rank(required_phase);
  capability_bound boolean := false;
  capability_claimed boolean :=
    pg_catalog.btrim(coalesce(
      input->>'deployment_capability_contract', ''
    )) <> '' or pg_catalog.btrim(coalesce(
      input->>'deployment_capability_ceiling', ''
    )) <> '';
  capability_required boolean := false;
  precommit_maintenance boolean := false;
begin
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  capability_bound := exists (
    select 1
    from production_control.maintenance_deployment_capability_bindings value
    where value.epoch_id = gate.active_epoch_id
  );
  capability_required :=
    activation.boundary_mode = 'MAINTENANCE_WINDOW_V1'
    and production_control.cutover_phase_rank(activation.read_cutover_phase)
      >= production_control.cutover_phase_rank('SCORING_COMMIT');
  precommit_maintenance :=
    activation.boundary_mode = 'MAINTENANCE_WINDOW_V1'
    and production_control.cutover_phase_rank(activation.read_cutover_phase)
      < production_control.cutover_phase_rank('SCORING_COMMIT');

  -- The OBSERVATION ceiling is a certified description of the dormant
  -- deployment before precommit. It is not an epoch/deployment authorization.
  -- Validate it exactly, then retain the prior read predicates using the
  -- database-authoritative phase rather than the advertised ceiling.
  if precommit_maintenance
     and not capability_bound
     and not capability_required
  then
    if capability_claimed
       and (
         input->>'deployment_capability_contract' is distinct from
           'production-maintenance-single-deployment-capability-v1'
         or input->>'deployment_capability_ceiling' is distinct from
           'OBSERVATION'
       )
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED';
    end if;
    return production_control
      .assert_production_cutover_read_scope_pre_capability(
        case when capability_claimed
          then input || pg_catalog.jsonb_build_object(
            'cutover_phase', activation.read_cutover_phase
          )
          else input
        end,
        required_phase
      );
  end if;

  -- Every non-maintenance path retains the pre-capability contract. At
  -- SCORING_COMMIT and later, or whenever an exact capability binding exists,
  -- retain migration 051's strict deployment/epoch/rebind assertions.
  if not capability_bound and not capability_claimed
     and not capability_required
  then
    return production_control
      .assert_production_cutover_read_scope_pre_capability(
        input, required_phase
      );
  end if;
  if activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED';
  end if;

  perform production_control.assert_production_maintenance_runtime_capability(
    input, activation.read_cutover_phase
  );
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if required_rank < production_control.cutover_phase_rank('READ_CUTOVER')
     or not resource.public_supabase_reads_enabled
     or production_control.cutover_phase_rank(activation.read_cutover_phase)
       < required_rank
     or pg_catalog.upper(coalesce(input->>'read_contract', '')) <>
       'ACTIVE_CUTOVER'
     or pg_catalog.upper(coalesce(input->>'cutover_phase', '')) <>
       'OBSERVATION'
     or activation.read_source_fingerprint is null
     or activation.read_source_fingerprint is distinct from
       activation.expected_source_fingerprint
     or (required_rank >= production_control.cutover_phase_rank('CURRENT_READS')
       and resource.current_tournament_read_authority <> 'SUPABASE')
  then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CUTOVER_READ_SCOPE_REQUIRED';
  end if;
  return resource;
end;
$$;

revoke all on function
  production_control.assert_production_cutover_read_scope(jsonb, text)
  from public, anon, authenticated, service_role;

commit;
