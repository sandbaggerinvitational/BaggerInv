begin;

-- Bind the Step 11.6 provenance claims at the same authoritative boundary as
-- STAGE_RELEASE.  These values are deliberately stored in the protected
-- control-plane row rather than trusted from a later mutable operator bundle.
alter table production_control.cutover_activation_state
  add column if not exists staged_request_fingerprint text
    check (staged_request_fingerprint is null
      or staged_request_fingerprint ~ '^[0-9a-f]{64}$'),
  add column if not exists staged_payload_hash text
    check (staged_payload_hash is null
      or staged_payload_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists staged_certification_fingerprint text
    check (staged_certification_fingerprint is null
      or staged_certification_fingerprint ~ '^[0-9a-f]{64}$'),
  add column if not exists staged_environment_delta_fingerprint_v2 text
    check (staged_environment_delta_fingerprint_v2 is null
      or staged_environment_delta_fingerprint_v2 ~ '^[0-9a-f]{64}$');

alter function public.stage_production_cutover_release(jsonb)
  rename to stage_production_cutover_release_pre_step11_6_provenance;

revoke all on function
  public.stage_production_cutover_release_pre_step11_6_provenance(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.stage_production_cutover_release(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  response_value jsonb;
  affected_rows integer;
  activation production_control.cutover_activation_state%rowtype;
  stage_request_fingerprint text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  stage_payload_hash text;
  certification_fingerprint text := pg_catalog.lower(
    coalesce(input->>'certification_fingerprint', '')
  );
  environment_delta_fingerprint_v2 text := pg_catalog.lower(
    coalesce(input->>'environment_delta_fingerprint_v2', '')
  );
begin
  if stage_request_fingerprint !~ '^[0-9a-f]{64}$'
     or certification_fingerprint !~ '^[0-9a-f]{64}$'
     or environment_delta_fingerprint_v2 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_STAGE_PROVENANCE_INVALID';
  end if;
  stage_payload_hash := production_control.cutover_payload_hash(input);

  -- Serialize provenance selection before the predecessor can restage. A
  -- second, differently certified STAGE_RELEASE must not overwrite the first
  -- authoritative binding. Exact replay remains valid for lost responses.
  -- ROLLED_BACK is the one deliberate replacement boundary: its retained
  -- provenance remains available for cleanup/audit, while the predecessor's
  -- explicit restage transition may bind a newly recertified release.
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  if activation.staged_request_fingerprint is not null
     or activation.staged_payload_hash is not null
     or activation.staged_certification_fingerprint is not null
     or activation.staged_environment_delta_fingerprint_v2 is not null then
    if activation.state <> 'ROLLED_BACK' and (
       activation.staged_request_fingerprint
         is distinct from stage_request_fingerprint
       or activation.staged_payload_hash is distinct from stage_payload_hash
       or activation.staged_certification_fingerprint
         is distinct from certification_fingerprint
       or activation.staged_environment_delta_fingerprint_v2
         is distinct from environment_delta_fingerprint_v2) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_STAGE_PROVENANCE_IMMUTABLE';
    end if;
  end if;

  -- The predecessor performs the complete resource, rehearsal, state,
  -- idempotency, revision and authority checks and stores the durable receipt.
  -- This wrapper remains in the same transaction, so a lost response cannot
  -- commit the stage without also committing these exact provenance claims.
  response_value :=
    public.stage_production_cutover_release_pre_step11_6_provenance(input);

  if coalesce((response_value->>'idempotent')::boolean, false) then
    if activation.staged_request_fingerprint
         is distinct from stage_request_fingerprint
       or activation.staged_payload_hash is distinct from stage_payload_hash
       or activation.staged_certification_fingerprint
         is distinct from certification_fingerprint
       or activation.staged_environment_delta_fingerprint_v2
         is distinct from environment_delta_fingerprint_v2 then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_STAGE_PROVENANCE_REPLAY_MISMATCH';
    end if;
    return response_value || pg_catalog.jsonb_build_object(
      'stage_request_fingerprint', stage_request_fingerprint,
      'stage_payload_hash', stage_payload_hash,
      'certification_fingerprint', certification_fingerprint,
      'environment_delta_fingerprint_v2',
        environment_delta_fingerprint_v2
    );
  end if;

  update production_control.cutover_activation_state
  set staged_request_fingerprint = stage_request_fingerprint,
      staged_payload_hash = stage_payload_hash,
      staged_certification_fingerprint = certification_fingerprint,
      staged_environment_delta_fingerprint_v2 =
        environment_delta_fingerprint_v2
  where scope_key = 'BAGGER_INV_PRODUCTION'
    and state = 'STAGED'
    and expected_deployment_commit = pg_catalog.lower(
      input->>'deployment_commit'
    );
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_STAGE_PROVENANCE_BINDING_FAILED';
  end if;

  return response_value || pg_catalog.jsonb_build_object(
    'stage_request_fingerprint', stage_request_fingerprint,
    'stage_payload_hash', stage_payload_hash,
    'certification_fingerprint', certification_fingerprint,
    'environment_delta_fingerprint_v2', environment_delta_fingerprint_v2
  );
end;
$$;

revoke all on function public.stage_production_cutover_release(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.stage_production_cutover_release(jsonb)
  to service_role;

comment on function public.stage_production_cutover_release(jsonb) is
  'Stages the exact certified release and atomically binds the Step 11.6 certification/environment provenance claims into protected Production control state.';

create or replace function production_control.clear_stage_provenance_on_reset()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  -- ROLLED_BACK still has authenticated cleanup/fence-removal work to finish,
  -- so retain the binding there. Only a complete return to DORMANT starts a
  -- new certifiable staging lifecycle.
  if new.state = 'DORMANT' then
    new.staged_request_fingerprint := null;
    new.staged_payload_hash := null;
    new.staged_certification_fingerprint := null;
    new.staged_environment_delta_fingerprint_v2 := null;
  end if;
  return new;
end;
$$;

revoke all on function production_control.clear_stage_provenance_on_reset()
  from public, anon, authenticated, service_role;

create trigger clear_cutover_stage_provenance_on_reset
before update on production_control.cutover_activation_state
for each row execute function
  production_control.clear_stage_provenance_on_reset();

-- Vercel's v6 deployment-list API represents Preview deployments with an
-- explicit null target.  The application-side provider attester now validates
-- that exact encoding before classifying a record as FEATURE_PREVIEW.  Preserve
-- migration 037's six-tuple assertion and add the previously dynamic
-- 68c81deb candidate as one exact reviewed tuple for the next frozen SHA.
alter function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) rename to assert_exact_vercel_live_inventory_v3;

revoke all on function production_control.assert_exact_vercel_live_inventory_v3(
  jsonb, jsonb, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function production_control.assert_exact_vercel_live_inventory_v3(
  jsonb, jsonb, text, text, text, text
) to service_role;

create or replace function production_control.assert_exact_vercel_live_inventory(
  retained_inventory jsonb,
  live_inventory jsonb,
  candidate_deployment_id text,
  candidate_deployment_commit text,
  candidate_immutable_origin text,
  candidate_deployment_target text
)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  normalized_live jsonb;
  reviewed_addition jsonb;
  reviewed_record jsonb;
  delegated_live jsonb;
begin
  normalized_live :=
    production_control.normalized_vercel_origin_inventory(live_inventory);
  reviewed_addition := production_control.normalized_vercel_origin_inventory(
    '[
      [
        "dpl_3wULxzmgsbsmUPLmK7B1Ld4FAjeT",
        "68c81debe4c8f99662bb5615d5c82a34a10a011e",
        "https://bagger-99mqqt7qn-sandbagger-invitational.vercel.app",
        "FEATURE_PREVIEW", "READY", "GIT"
      ]
    ]'::jsonb
  );
  reviewed_record := reviewed_addition->0;

  if normalized_live is distinct from live_inventory
     or candidate_deployment_id = reviewed_record->>0
     or pg_catalog.lower(pg_catalog.rtrim(candidate_immutable_origin, '/')) =
       reviewed_record->>2
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized_live) value
       where value = reviewed_record) <> 1
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(normalized_live) value
       where (value->>0 = reviewed_record->>0
           or value->>2 = reviewed_record->>2)
         and value is distinct from reviewed_record
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      value order by (value->>0) collate "C",
        pg_catalog.lower(pg_catalog.rtrim(value->>2, '/'))
    ),
    '[]'::jsonb
  )
  into delegated_live
  from pg_catalog.jsonb_array_elements(normalized_live) value
  where value is distinct from reviewed_record;

  perform production_control.assert_exact_vercel_live_inventory_v3(
    retained_inventory,
    delegated_live,
    candidate_deployment_id,
    candidate_deployment_commit,
    candidate_immutable_origin,
    candidate_deployment_target
  );
end;
$$;

revoke all on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) to service_role;

comment on function production_control.assert_exact_vercel_live_inventory_v3(
  jsonb, jsonb, text, text, text, text
) is 'Internal migration-037 exact live-origin assertion retained for compositional reviewed-deployment verification.';
comment on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) is 'Fail-closed exact Vercel live-origin assertion with seven reviewed post-capture Preview deployments and one collision-free dynamic cutover candidate.';

-- The Step 11.6 receipt server inspects this state while the certified live
-- system is deliberately DORMANT. Migration 034 accidentally selected the
-- cutover-active variant of the resource assertion, making the otherwise
-- read-only inspection reject the exact dormant state it is meant to prove.
-- Keep the same serialized snapshot and exact Production resource binding,
-- but allow the read in DORMANT just as the older authority inspector does.
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
  active_legacy_writers_value integer;
  unresolved_legacy_writers_value integer;
  ambiguous_google_writes_value integer;
  partial_google_writes_value integer;
  unresolved_outbox_value integer;
  unresolved_archive_value integer;
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
  -- Keep all operational counts on one PostgreSQL statement snapshot. The
  -- shared admission lock prevents an authority-sensitive exclusive
  -- transition while these exact diagnostics are captured.
  select
    (
      select pg_catalog.count(*)::integer
      from scoring_authority.scoring_ingress_leases lease
      where lease.tournament_id = '2026'
        and lease.status = 'ACTIVE'
        and (
          (lease.protocol_version = 'ADMISSION_V2'
            and lease.admission_generation_id = gate.admission_generation_id
            and lease.resolution_state in (
              'ADMITTED', 'WRITE_STARTED', 'AMBIGUOUS', 'PARTIAL_WRITE',
              'LEGACY_UNCLASSIFIED'
            ))
          or (lease.protocol_version = 'LEGACY_V1'
            and lease.resolution_state = 'LEGACY_UNCLASSIFIED')
        )
    ),
    (
      select pg_catalog.count(*)::integer
      from scoring_authority.scoring_ingress_leases lease
      where lease.tournament_id = '2026'
        and (
          (lease.protocol_version = 'ADMISSION_V2'
            and lease.admission_generation_id = gate.admission_generation_id
            and lease.resolution_state in (
              'ADMITTED', 'WRITE_STARTED', 'AMBIGUOUS', 'PARTIAL_WRITE',
              'LEGACY_UNCLASSIFIED'
            ))
          or (lease.protocol_version = 'LEGACY_V1'
            and lease.resolution_state = 'LEGACY_UNCLASSIFIED')
        )
    ),
    (
      select pg_catalog.count(*)::integer
      from scoring_authority.scoring_ingress_leases lease
      where lease.tournament_id = '2026'
        and lease.protocol_version = 'ADMISSION_V2'
        and lease.admission_generation_id = gate.admission_generation_id
        and lease.resolution_state = 'AMBIGUOUS'
    ),
    (
      select pg_catalog.count(*)::integer
      from scoring_authority.scoring_ingress_leases lease
      where lease.tournament_id = '2026'
        and lease.protocol_version = 'ADMISSION_V2'
        and lease.admission_generation_id = gate.admission_generation_id
        and lease.resolution_state = 'PARTIAL_WRITE'
    ),
    (
      select pg_catalog.count(*)::integer
      from scoring_authority.google_outbox_events event
      where event.tournament_id = '2026'
        and event.status <> 'DELIVERED'
    ),
    (
      select pg_catalog.count(*)::integer
      from scoring_authority.scorecard_archive_jobs job
      where job.tournament_id = '2026'
        and job.status not in ('VERIFIED', 'SUPERSEDED')
    )
  into active_legacy_writers_value, unresolved_legacy_writers_value,
    ambiguous_google_writes_value, partial_google_writes_value,
    unresolved_outbox_value, unresolved_archive_value;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contract_version', gate.admission_contract_version,
    'activation_state', activation.state,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'staged_request_fingerprint', activation.staged_request_fingerprint,
    'staged_payload_hash', activation.staged_payload_hash,
    'staged_certification_fingerprint',
      activation.staged_certification_fingerprint,
    'staged_environment_delta_fingerprint_v2',
      activation.staged_environment_delta_fingerprint_v2,
    'authority', activation.current_authority,
    'scoring_authority', activation.current_authority,
    'scoring_ingress_enabled', activation.scoring_ingress_enabled,
    'execution_gate', gate.state,
    'admission_state', gate.admission_state,
    'admission_protocol_enforced', gate.admission_protocol_enforced,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'admission_deployment_id', gate.admission_deployment_id,
    'deployment_id', gate.admission_deployment_id,
    'active_closure_id', gate.active_closure_id,
    'external_fence_evidence_id', gate.external_fence_evidence_id,
    'active_closure_kind', case when gate.active_closure_id is null
      then null else closure.closure_kind end,
    'active_closure_status', case when gate.active_closure_id is null
      then null else closure.status end,
    'active_closure_high_watermark', case when gate.active_closure_id is null
      then null else closure.lease_high_watermark end,
    'v2_unresolved', production_control.scoring_admission_unresolved_count(
      gate.admission_generation_id
    ),
    'legacy_unclassified',
      production_control.scoring_admission_legacy_blocker_count(
        gate.admission_enforced_at
      ),
    'active_legacy_writers', active_legacy_writers_value,
    'unresolved_legacy_writers', unresolved_legacy_writers_value,
    'ambiguous_google_writes', ambiguous_google_writes_value,
    'partial_google_writes', partial_google_writes_value,
    'unresolved_outbox', unresolved_outbox_value,
    'unresolved_archive', unresolved_archive_value,
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
    'external_google_writer_fence_centrally_enforced', false,
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
