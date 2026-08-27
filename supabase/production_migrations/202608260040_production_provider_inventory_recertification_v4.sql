-- Step 11.6 exhaustive Vercel provider inventory recertification v4.
--
-- This migration is deliberately dormant and additive. It installs the next
-- immutable provider-evidence epoch without changing live authority,
-- admission, scoring ingress, participant identity, workers, or application
-- data. Historical v1 and v3/v2 receipts remain valid byte-for-byte.
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
       from production_control.vercel_provider_attestation_challenges value
       where value.status = 'ISSUED'
     )
     or exists (
       select 1
       from production_control.vercel_provider_attestations value
       where value.status = 'RESERVED'
     )
     or exists (
       select 1
       from production_control.vercel_writer_quiesce_evidence value
       where value.status = 'DRAINING'
          or (value.status = 'VERIFIED' and value.expires_at > pg_catalog.now())
     )
     or exists (
       select 1
       from production_control.google_writer_provider_fences value
       where value.status in ('INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED')
     )
     or exists (
       select 1
       from production_control.google_writer_fence_rehearsals value
       where value.status = 'RUNNING'
          or (value.status = 'FAILED' and not value.restoration_confirmed)
     )
     or exists (
       select 1
       from production_control.scoring_external_fence_evidence value
       where value.revoked_at is null and value.expires_at > pg_catalog.now()
     )
     or exists (
       select 1
       from scoring_authority.scoring_ingress_leases value
       where value.tournament_id = '2026'
         and (value.status = 'ACTIVE' or value.resolution_state in (
           'ADMITTED', 'WRITE_STARTED', 'AMBIGUOUS', 'PARTIAL_WRITE',
           'LEGACY_UNCLASSIFIED'
         ))
     )
     or exists (
       select 1
       from scoring_authority.score_mutations
     )
     or exists (
       select 1
       from scoring_authority.google_outbox_events value
       where value.tournament_id = '2026' and value.status <> 'DELIVERED'
     )
     or exists (
       select 1
       from scoring_authority.scorecard_archive_jobs value
       where value.tournament_id = '2026'
         and value.status not in ('VERIFIED', 'SUPERSEDED')
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_PROVIDER_INVENTORY_V4_MIGRATION_STATE_INVALID';
  end if;
end;
$migration_preflight$;

-- The global writer-admission stop must remain certified beyond Vercel's
-- current opt-in 1800-second function ceiling plus the ten-second margin.
-- Widen the prior 30-minute evidence caps to the one exact 2100-second owner
-- and provider-admin freeze contract; no Production state is changed here.
create temporary table expected_provider_freeze_predecessors (
  status text,
  owner_acknowledged_at timestamptz,
  owner_freeze_expires_at timestamptz,
  drain_started_at timestamptz,
  drain_completed_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz,
  finalize_request_fingerprint text,
  finalize_payload_hash text,
  unresolved_request_log_count integer,
  unresolved_google_write_count integer,
  second_probe_records jsonb,
  second_probe_fingerprint text,
  deployment_scope_fingerprint text,
  binding_expires_at timestamptz,
  recorded_at timestamptz,
  captured_at timestamptz,
  protection_count integer,
  failure_code text,
  constraint expected_quiesce_owner check (
    owner_freeze_expires_at <=
      owner_acknowledged_at + interval '30 minutes'
  ),
  constraint expected_quiesce_status check (
    (status = 'DRAINING' and drain_completed_at is null
      and verified_at is null and expires_at is null
      and finalize_request_fingerprint is null
      and finalize_payload_hash is null)
    or (status = 'VERIFIED' and drain_completed_at is not null
      and drain_completed_at >= drain_started_at + interval '300 seconds'
      and verified_at is not null and expires_at is not null
      and expires_at > verified_at
      and expires_at <= verified_at + interval '30 minutes'
      and expires_at <= owner_freeze_expires_at
      and unresolved_request_log_count = 0
      and unresolved_google_write_count = 0
      and second_probe_records is not null
      and second_probe_fingerprint is not null
      and deployment_scope_fingerprint is not null
      and finalize_request_fingerprint is not null
      and finalize_payload_hash is not null)
    or (status = 'FAILED' and failure_code is not null
      and finalize_request_fingerprint is not null
      and finalize_payload_hash is not null)
  ),
  constraint expected_provider_binding check (
    binding_expires_at > recorded_at
    and binding_expires_at <= recorded_at + interval '30 minutes'
  ),
  constraint expected_fence_verification check (
    expires_at <= captured_at + interval '30 minutes'
  ),
  constraint expected_fence_verification_protection_count check (
    protection_count = 17
  ),
  constraint expected_external_fence check (
    expires_at <= captured_at + interval '30 minutes'
  )
) on commit drop;

do $widen_provider_freeze_constraints$
declare
  item record;
  matched_count integer := 0;
begin
  -- Bind every intended predecessor by relation and its complete security
  -- predicate shape. A renamed constraint remains discoverable, but a missing,
  -- duplicated, weakened, or unrelated thirty-minute predicate aborts before
  -- any DROP executes.
  for item in
    with expected(target, relation_name, expected_constraint_name) as (
      values
        ('QUIESCE_OWNER',
          'production_control.vercel_writer_quiesce_evidence'::pg_catalog.regclass,
          'expected_quiesce_owner'),
        ('QUIESCE_STATUS',
          'production_control.vercel_writer_quiesce_evidence'::pg_catalog.regclass,
          'expected_quiesce_status'),
        ('PROVIDER_BINDING',
          'production_control.vercel_provider_attestations'::pg_catalog.regclass,
          'expected_provider_binding'),
        ('FENCE_VERIFICATION',
          'production_control.google_writer_provider_fence_verifications'::pg_catalog.regclass,
          'expected_fence_verification'),
        ('FENCE_VERIFICATION_PROTECTION_COUNT',
          'production_control.google_writer_provider_fence_verifications'::pg_catalog.regclass,
          'expected_fence_verification_protection_count'),
        ('EXTERNAL_FENCE',
          'production_control.scoring_external_fence_evidence'::pg_catalog.regclass,
          'expected_external_fence')
    ), expected_definition as (
      select expected.*,
        pg_catalog.pg_get_constraintdef(constraint_value.oid) as definition
      from expected
      join pg_catalog.pg_constraint constraint_value
        on constraint_value.conrelid =
          'pg_temp.expected_provider_freeze_predecessors'::pg_catalog.regclass
       and constraint_value.conname = expected.expected_constraint_name
       and constraint_value.contype = 'c'
    ), matched as (
      select expected.target, expected.relation_name,
        constraint_value.conname,
        pg_catalog.pg_get_constraintdef(constraint_value.oid) as definition
      from expected_definition expected
      join pg_catalog.pg_constraint constraint_value
        on constraint_value.conrelid = expected.relation_name
       and constraint_value.contype = 'c'
       and pg_catalog.pg_get_constraintdef(constraint_value.oid) =
         expected.definition
    ), counted as (
      select target, relation_name, pg_catalog.count(*) as target_count,
        pg_catalog.min(conname) as conname,
        pg_catalog.min(definition) as definition
      from matched
      group by target, relation_name
    )
    select expected.target, expected.relation_name, counted.conname,
      counted.definition, coalesce(counted.target_count, 0) as target_count
    from expected_definition expected
    left join counted using (target, relation_name)
    order by expected.target
  loop
    if item.target_count <> 1 or item.conname is null then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_PROVIDER_FREEZE_PREDECESSOR_CONSTRAINT_MISMATCH',
        detail = item.target || ':' || item.target_count::text;
    end if;
    matched_count := matched_count + 1;
    execute pg_catalog.format(
      'alter table %s drop constraint %I',
      item.relation_name,
      item.conname
    );
  end loop;
  if matched_count <> 6 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_PROVIDER_FREEZE_PREDECESSOR_COUNT_MISMATCH';
  end if;
end;
$widen_provider_freeze_constraints$;

alter table production_control.vercel_writer_quiesce_evidence
  add constraint production_vercel_writer_owner_freeze_2100_check check (
    owner_freeze_expires_at > owner_acknowledged_at
    and owner_freeze_expires_at <=
      owner_acknowledged_at + interval '2100 seconds'
  ),
  add constraint production_vercel_writer_quiesce_status_v4_check check (
    (status = 'DRAINING' and drain_completed_at is null
      and verified_at is null and expires_at is null
      and finalize_request_fingerprint is null
      and finalize_payload_hash is null)
    or (status = 'VERIFIED' and drain_completed_at is not null
      and drain_completed_at >= drain_started_at + interval '300 seconds'
      and verified_at is not null and expires_at is not null
      and expires_at > verified_at
      and expires_at <= verified_at + interval '2100 seconds'
      and expires_at <= owner_freeze_expires_at
      and unresolved_request_log_count = 0
      and unresolved_google_write_count = 0
      and second_probe_records is not null
      and second_probe_fingerprint is not null
      and deployment_scope_fingerprint is not null
      and finalize_request_fingerprint is not null
      and finalize_payload_hash is not null)
    or (status = 'FAILED' and failure_code is not null
      and finalize_request_fingerprint is not null
      and finalize_payload_hash is not null)
  );

alter table production_control.vercel_provider_attestations
  add constraint production_vercel_provider_binding_2100_check check (
    binding_expires_at > recorded_at
    and binding_expires_at <= recorded_at + interval '2100 seconds'
  );

alter table production_control.google_writer_provider_fence_verifications
  add constraint production_google_writer_provider_verification_2100_check check (
    expires_at > captured_at
    and expires_at <= captured_at + interval '2100 seconds'
  );

-- Historical protected-range receipts remain immutable. New executions use a
-- tagged ACL-v2 verification with an empty retired protection set; no legacy
-- receipt can be reinterpreted as ACL evidence.
alter table production_control.google_writer_provider_fence_verifications
  add column acl_contract_version text,
  add column install_dispatch_id uuid,
  add column acl_transition_intent_fingerprint text,
  add column acl_transition_proof jsonb,
  add column acl_transition_proof_fingerprint text,
  add column legacy_role text,
  add column legacy_can_edit boolean,
  add column legacy_can_share boolean,
  add column legacy_edit_capability_fingerprint text,
  add column settlement_readback_2_observation_id uuid,
  add column global_writer_stop_active_at timestamptz;

alter table production_control.google_writer_provider_fence_verifications
  add constraint production_google_writer_provider_verification_acl_v2_check
  check (
    (acl_contract_version is null and protection_count = 17
      and install_dispatch_id is null
      and acl_transition_intent_fingerprint is null
      and acl_transition_proof is null
      and acl_transition_proof_fingerprint is null
      and legacy_role is null and legacy_can_edit is null
      and legacy_can_share is null
      and legacy_edit_capability_fingerprint is null
      and settlement_readback_2_observation_id is null
      and global_writer_stop_active_at is null)
    or (acl_contract_version = 'DRIVE_ACL_V2' and protection_count = 0
      and protection_records = '[]'::jsonb
      and protected_sheet_ids = '[]'::jsonb
      and protected_range_ids = '[]'::jsonb
      and install_dispatch_id is not null
      and acl_transition_intent_fingerprint ~ '^[0-9a-f]{64}$'
      and pg_catalog.jsonb_typeof(acl_transition_proof) = 'object'
      and acl_transition_proof_fingerprint ~ '^[0-9a-f]{64}$'
      and legacy_role = 'reader'
      and legacy_can_edit is false and legacy_can_share is false
      and legacy_edit_capability_fingerprint ~ '^[0-9a-f]{64}$'
      and settlement_readback_2_observation_id is not null
      and global_writer_stop_active_at is not null)
  );

alter table production_control.scoring_external_fence_evidence
  add constraint production_scoring_external_fence_2100_check check (
    expires_at > captured_at
    and expires_at <= captured_at + interval '2100 seconds'
  );

-- Current provider evidence must preserve the complete critical-window WAF
-- predicate.  DOES_NOT_EQUAL is only the first deny-complement group; the same
-- provider-active ruleset must also stop canonical-apex mutation methods and
-- the exhaustively audited safe-method writer routes.  The sole control POST
-- exception is bound to the two provider-signed candidate hostnames.  Keep the
-- historical receipt rows byte-for-byte intact by storing this v4 contract in
-- an additive immutable relation.
create table production_control.vercel_routing_rule_audit_bindings (
  audit_binding_id uuid primary key default extensions.gen_random_uuid(),
  subject_kind text not null check (
    subject_kind in ('CHALLENGE', 'ATTESTATION', 'QUIESCE')
  ),
  challenge_id uuid unique references
    production_control.vercel_provider_attestation_challenges(challenge_id)
    on delete restrict,
  attestation_id uuid unique references
    production_control.vercel_provider_attestations(attestation_id)
    on delete restrict,
  quiesce_evidence_id uuid unique references
    production_control.vercel_writer_quiesce_evidence(evidence_id)
    on delete restrict,
  routing_rule_hostname_operator text not null check (
    routing_rule_hostname_operator = 'DOES_NOT_EQUAL'
  ),
  routing_rule_canonical_hostname text not null check (
    routing_rule_canonical_hostname = 'baggerinv.com'
  ),
  routing_rule_earlier_active_bypass_rule_count integer not null check (
    routing_rule_earlier_active_bypass_rule_count = 0
  ),
  routing_rule_global_invocation_quiescence_proved boolean not null check (
    routing_rule_global_invocation_quiescence_proved
  ),
  routing_rule_candidate_control_host_count integer not null check (
    routing_rule_candidate_control_host_count = 2
  ),
  routing_rule_candidate_control_hosts_fingerprint text not null check (
    routing_rule_candidate_control_hosts_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  routing_rule_canonical_apex_safe_method_count integer not null check (
    routing_rule_canonical_apex_safe_method_count = 3
  ),
  routing_rule_canonical_apex_safe_methods_fingerprint text not null check (
    routing_rule_canonical_apex_safe_methods_fingerprint =
      '798954f7a6aab53443a1fac2333ce7043f7c5c5bf5bdbffdfdd19f18433e96e7'
  ),
  routing_rule_canonical_apex_safe_method_writer_route_count integer not null check (
    routing_rule_canonical_apex_safe_method_writer_route_count = 10
  ),
  routing_rule_canonical_apex_safe_method_writer_routes_fingerprint text not null check (
    routing_rule_canonical_apex_safe_method_writer_routes_fingerprint =
      '8f3bcfaf2b8fd6825ce5fb56385b1a1aa2e23da7bfe96b42e7e9c3ec23f4bcd7'
  ),
  created_at timestamptz not null default pg_catalog.now(),
  constraint production_vercel_routing_rule_audit_subject_check check (
    (subject_kind = 'CHALLENGE' and challenge_id is not null
      and attestation_id is null and quiesce_evidence_id is null)
    or (subject_kind = 'ATTESTATION' and challenge_id is null
      and attestation_id is not null and quiesce_evidence_id is null)
    or (subject_kind = 'QUIESCE' and challenge_id is null
      and attestation_id is null and quiesce_evidence_id is not null)
  )
);

alter table production_control.vercel_routing_rule_audit_bindings
  enable row level security;
revoke all on table production_control.vercel_routing_rule_audit_bindings
  from public, anon, authenticated, service_role;

create or replace function production_control.guard_vercel_routing_rule_audit_binding()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_IMMUTABLE';
end;
$$;

create trigger guard_vercel_routing_rule_audit_binding
  before update or delete
  on production_control.vercel_routing_rule_audit_bindings
  for each row execute function
    production_control.guard_vercel_routing_rule_audit_binding();

create or replace function production_control.bind_current_vercel_routing_rule_audit(
  target_subject_kind text,
  target_subject_id uuid,
  create_if_missing boolean,
  audit_input jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  normalized_kind text := pg_catalog.upper(target_subject_kind);
  binding jsonb;
begin
  if target_subject_id is null
     or normalized_kind not in ('CHALLENGE', 'ATTESTATION', 'QUIESCE') then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_SUBJECT_INVALID';
  end if;

  if create_if_missing then
    perform production_control.assert_exact_vercel_routing_rule_audit(audit_input);
    if normalized_kind = 'CHALLENGE' then
      if not exists (
        select 1
        from production_control.vercel_provider_attestation_challenges value
        where value.challenge_id = target_subject_id
      ) then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_SUBJECT_MISSING';
      end if;
      insert into production_control.vercel_routing_rule_audit_bindings (
        subject_kind, challenge_id, routing_rule_hostname_operator,
        routing_rule_canonical_hostname,
        routing_rule_earlier_active_bypass_rule_count,
        routing_rule_global_invocation_quiescence_proved,
        routing_rule_candidate_control_host_count,
        routing_rule_candidate_control_hosts_fingerprint,
        routing_rule_canonical_apex_safe_method_count,
        routing_rule_canonical_apex_safe_methods_fingerprint,
        routing_rule_canonical_apex_safe_method_writer_route_count,
        routing_rule_canonical_apex_safe_method_writer_routes_fingerprint
      ) values (
        normalized_kind, target_subject_id, 'DOES_NOT_EQUAL',
        'baggerinv.com', 0, true, 2,
        pg_catalog.lower(audit_input->>'routing_rule_candidate_control_hosts_fingerprint'),
        3,
        '798954f7a6aab53443a1fac2333ce7043f7c5c5bf5bdbffdfdd19f18433e96e7',
        10,
        '8f3bcfaf2b8fd6825ce5fb56385b1a1aa2e23da7bfe96b42e7e9c3ec23f4bcd7'
      ) on conflict (challenge_id) do nothing;
    elsif normalized_kind = 'ATTESTATION' then
      if not exists (
        select 1
        from production_control.vercel_provider_attestations value
        where value.attestation_id = target_subject_id
      ) then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_SUBJECT_MISSING';
      end if;
      insert into production_control.vercel_routing_rule_audit_bindings (
        subject_kind, attestation_id, routing_rule_hostname_operator,
        routing_rule_canonical_hostname,
        routing_rule_earlier_active_bypass_rule_count,
        routing_rule_global_invocation_quiescence_proved,
        routing_rule_candidate_control_host_count,
        routing_rule_candidate_control_hosts_fingerprint,
        routing_rule_canonical_apex_safe_method_count,
        routing_rule_canonical_apex_safe_methods_fingerprint,
        routing_rule_canonical_apex_safe_method_writer_route_count,
        routing_rule_canonical_apex_safe_method_writer_routes_fingerprint
      ) values (
        normalized_kind, target_subject_id, 'DOES_NOT_EQUAL',
        'baggerinv.com', 0, true, 2,
        pg_catalog.lower(audit_input->>'routing_rule_candidate_control_hosts_fingerprint'),
        3,
        '798954f7a6aab53443a1fac2333ce7043f7c5c5bf5bdbffdfdd19f18433e96e7',
        10,
        '8f3bcfaf2b8fd6825ce5fb56385b1a1aa2e23da7bfe96b42e7e9c3ec23f4bcd7'
      ) on conflict (attestation_id) do nothing;
    else
      if not exists (
        select 1
        from production_control.vercel_writer_quiesce_evidence value
        where value.evidence_id = target_subject_id
      ) then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_SUBJECT_MISSING';
      end if;
      insert into production_control.vercel_routing_rule_audit_bindings (
        subject_kind, quiesce_evidence_id,
        routing_rule_hostname_operator, routing_rule_canonical_hostname,
        routing_rule_earlier_active_bypass_rule_count,
        routing_rule_global_invocation_quiescence_proved,
        routing_rule_candidate_control_host_count,
        routing_rule_candidate_control_hosts_fingerprint,
        routing_rule_canonical_apex_safe_method_count,
        routing_rule_canonical_apex_safe_methods_fingerprint,
        routing_rule_canonical_apex_safe_method_writer_route_count,
        routing_rule_canonical_apex_safe_method_writer_routes_fingerprint
      ) values (
        normalized_kind, target_subject_id, 'DOES_NOT_EQUAL',
        'baggerinv.com', 0, true, 2,
        pg_catalog.lower(audit_input->>'routing_rule_candidate_control_hosts_fingerprint'),
        3,
        '798954f7a6aab53443a1fac2333ce7043f7c5c5bf5bdbffdfdd19f18433e96e7',
        10,
        '8f3bcfaf2b8fd6825ce5fb56385b1a1aa2e23da7bfe96b42e7e9c3ec23f4bcd7'
      ) on conflict (quiesce_evidence_id) do nothing;
    end if;
  end if;

  select pg_catalog.jsonb_build_object(
    'routing_rule_hostname_operator', value.routing_rule_hostname_operator,
    'routing_rule_canonical_hostname', value.routing_rule_canonical_hostname,
    'routing_rule_earlier_active_bypass_rule_count',
      value.routing_rule_earlier_active_bypass_rule_count,
    'routing_rule_global_invocation_quiescence_proved',
      value.routing_rule_global_invocation_quiescence_proved,
    'routing_rule_candidate_control_host_count',
      value.routing_rule_candidate_control_host_count,
    'routing_rule_candidate_control_hosts_fingerprint',
      value.routing_rule_candidate_control_hosts_fingerprint,
    'routing_rule_canonical_apex_safe_method_count',
      value.routing_rule_canonical_apex_safe_method_count,
    'routing_rule_canonical_apex_safe_methods_fingerprint',
      value.routing_rule_canonical_apex_safe_methods_fingerprint,
    'routing_rule_canonical_apex_safe_method_writer_route_count',
      value.routing_rule_canonical_apex_safe_method_writer_route_count,
    'routing_rule_canonical_apex_safe_method_writer_routes_fingerprint',
      value.routing_rule_canonical_apex_safe_method_writer_routes_fingerprint
  ) into binding
  from production_control.vercel_routing_rule_audit_bindings value
  where (normalized_kind = 'CHALLENGE'
      and value.challenge_id = target_subject_id)
     or (normalized_kind = 'ATTESTATION'
      and value.attestation_id = target_subject_id)
     or (normalized_kind = 'QUIESCE'
      and value.quiesce_evidence_id = target_subject_id);

  if binding is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_BINDING_MISSING';
  end if;
  if audit_input is not null and (
       binding->>'routing_rule_hostname_operator' is distinct from
         audit_input->>'routing_rule_hostname_operator'
       or binding->>'routing_rule_canonical_hostname' is distinct from
         audit_input->>'routing_rule_canonical_hostname'
       or binding->>'routing_rule_earlier_active_bypass_rule_count' is distinct from
         audit_input->>'routing_rule_earlier_active_bypass_rule_count'
       or binding->'routing_rule_global_invocation_quiescence_proved' is distinct from
         audit_input->'routing_rule_global_invocation_quiescence_proved'
       or binding->>'routing_rule_candidate_control_host_count' is distinct from
         audit_input->>'routing_rule_candidate_control_host_count'
       or binding->>'routing_rule_candidate_control_hosts_fingerprint' is distinct from
         pg_catalog.lower(audit_input->>'routing_rule_candidate_control_hosts_fingerprint')
       or binding->>'routing_rule_canonical_apex_safe_method_count' is distinct from
         audit_input->>'routing_rule_canonical_apex_safe_method_count'
       or binding->>'routing_rule_canonical_apex_safe_methods_fingerprint' is distinct from
         audit_input->>'routing_rule_canonical_apex_safe_methods_fingerprint'
       or binding->>'routing_rule_canonical_apex_safe_method_writer_route_count'
         is distinct from
           audit_input->>'routing_rule_canonical_apex_safe_method_writer_route_count'
       or binding->>'routing_rule_canonical_apex_safe_method_writer_routes_fingerprint'
         is distinct from
           audit_input->>'routing_rule_canonical_apex_safe_method_writer_routes_fingerprint'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_REPLAY_MISMATCH';
  end if;
  return binding;
end;
$$;

revoke all on function
  production_control.guard_vercel_routing_rule_audit_binding()
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.bind_current_vercel_routing_rule_audit(text, uuid, boolean, jsonb)
  from public, anon, authenticated, service_role;

-- Historical challenge/quiesce rows certified a CUTOVER candidate only after
-- Vercel had classified it as a Production-target deployment. The v4 control
-- route is intentionally executable only from the exact signed Project
-- Preview candidate. Replace only the two exact predecessor predicates, keep
-- historical PRODUCTION rows valid, and let the v4 RPCs below require PREVIEW.
create temporary table expected_candidate_target_predecessor (
  purpose text,
  candidate_deployment_target text,
  constraint expected_candidate_target_check check (
    (purpose = 'REHEARSAL' and candidate_deployment_target = 'PREVIEW')
    or (purpose = 'CUTOVER' and candidate_deployment_target = 'PRODUCTION')
  )
) on commit drop;

create temporary table candidate_target_constraints_to_replace (
  relation_name regclass primary key,
  constraint_name name not null
) on commit drop;

do $replace_candidate_target_constraints$
declare
  expected_definition text;
  relation_value regclass;
  matched_count integer;
  matched_name name;
  item record;
begin
  select pg_catalog.pg_get_constraintdef(value.oid)
  into strict expected_definition
  from pg_catalog.pg_constraint value
  where value.conrelid =
      'pg_temp.expected_candidate_target_predecessor'::pg_catalog.regclass
    and value.conname = 'expected_candidate_target_check'
    and value.contype = 'c';

  foreach relation_value in array array[
    'production_control.vercel_writer_quiesce_evidence'::pg_catalog.regclass,
    'production_control.vercel_provider_attestation_challenges'::pg_catalog.regclass
  ] loop
    select pg_catalog.count(*)::integer, pg_catalog.min(value.conname)
    into matched_count, matched_name
    from pg_catalog.pg_constraint value
    where value.conrelid = relation_value
      and value.contype = 'c'
      and pg_catalog.pg_get_constraintdef(value.oid) = expected_definition;
    if matched_count <> 1 or matched_name is null then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_PROVIDER_CANDIDATE_TARGET_PREDECESSOR_INVALID';
    end if;
    insert into candidate_target_constraints_to_replace values (
      relation_value, matched_name
    );
  end loop;

  for item in select * from candidate_target_constraints_to_replace loop
    execute pg_catalog.format(
      'alter table %s drop constraint %I',
      item.relation_name, item.constraint_name
    );
  end loop;
end;
$replace_candidate_target_constraints$;

alter table production_control.vercel_writer_quiesce_evidence
  add constraint production_vercel_quiesce_candidate_target_v4_check check (
    (purpose = 'REHEARSAL' and candidate_deployment_target = 'PREVIEW')
    or (purpose = 'CUTOVER'
      and candidate_deployment_target in ('PREVIEW', 'PRODUCTION'))
  );
alter table production_control.vercel_provider_attestation_challenges
  add constraint production_vercel_challenge_candidate_target_v4_check check (
    (purpose = 'REHEARSAL' and candidate_deployment_target = 'PREVIEW')
    or (purpose = 'CUTOVER'
      and candidate_deployment_target in ('PREVIEW', 'PRODUCTION'))
  );

-- A v4 quiesce receipt is useful only while the exact provider-derived
-- CRITICAL_WINDOW is active.  Model that provider configuration epoch
-- separately from the historical quiesce rows: a restored epoch is terminal
-- and can never authorize another Drive ACL transition.
create table production_control.vercel_writer_critical_waf_epochs (
  epoch_id uuid primary key,
  epoch_request_id uuid not null unique,
  baseline_transition_request_id uuid not null unique,
  purpose text not null check (purpose in ('REHEARSAL', 'CUTOVER')),
  transition_mode text not null check (
    transition_mode in ('REHEARSAL', 'CUTOVER', 'ROLLBACK')
  ),
  status text not null check (status in (
    'ACTIVATION_PENDING', 'ACTIVE_UNBOUND', 'FENCE_BOUND',
    'RESTORE_PENDING', 'BASELINE_RESTORED'
  )),
  begin_request_fingerprint text not null unique check (
    begin_request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  begin_payload_hash text not null check (
    begin_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  vercel_project_id text not null check (
    vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
  ),
  vercel_team_id text not null check (
    vercel_team_id ~ '^[A-Za-z0-9_.:-]{3,160}$'
  ),
  candidate_deployment_id text not null check (
    candidate_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  candidate_deployment_commit text not null check (
    candidate_deployment_commit ~ '^[0-9a-f]{40}$'
  ),
  candidate_deployment_target text not null check (
    candidate_deployment_target = 'PREVIEW'
  ),
  candidate_alias_origin text not null check (
    candidate_alias_origin ~ '^https://[a-z0-9.-]+$'
  ),
  candidate_immutable_origin text not null check (
    candidate_immutable_origin ~ '^https://[a-z0-9.-]+$'
  ),
  candidate_control_hosts_fingerprint text not null check (
    candidate_control_hosts_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  baseline_active_config_version text not null check (
    baseline_active_config_version ~ '^[A-Za-z0-9_.:-]{1,160}$'
  ),
  baseline_active_config_etag text check (
    baseline_active_config_etag is null or (
      pg_catalog.btrim(baseline_active_config_etag) <> '' and
      pg_catalog.length(baseline_active_config_etag) <= 512
    )
  ),
  baseline_provider_configuration_id text not null check (
    baseline_provider_configuration_id ~ '^[A-Za-z0-9_.:-]{1,160}$'
  ),
  baseline_provider_owner_id text not null check (
    baseline_provider_owner_id ~ '^[A-Za-z0-9_.:-]{1,160}$'
  ),
  baseline_configuration_identity_fingerprint text not null check (
    baseline_configuration_identity_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  baseline_source_version_read_fingerprint text not null check (
    baseline_source_version_read_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  baseline_semantic_configuration_fingerprint text not null check (
    baseline_semantic_configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  baseline_ordered_rules_fingerprint text not null check (
    baseline_ordered_rules_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  baseline_custom_rule_count integer not null check (
    baseline_custom_rule_count = 0
  ),
  run_owned_rule_name text not null unique check (
    run_owned_rule_name ~ '^[A-Za-z0-9 _.,:/-]{8,160}$'
  ),
  run_owned_rule_nonce uuid not null unique,
  provider_assigned_rule_id text unique check (
    provider_assigned_rule_id is null or
      provider_assigned_rule_id ~ '^[A-Za-z0-9_.:-]{3,160}$'
  ),
  run_owned_rule_fingerprint text not null check (
    run_owned_rule_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  run_owned_insert_document_fingerprint text not null check (
    run_owned_insert_document_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  critical_semantic_configuration_fingerprint text check (
    critical_semantic_configuration_fingerprint is null or
      critical_semantic_configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  baseline_observation_id uuid unique,
  critical_active_observation_id uuid unique,
  latest_critical_reattest_observation_id uuid unique,
  baseline_restored_observation_id uuid unique,
  bound_fence_id uuid references
    production_control.google_writer_provider_fences(fence_id)
    on delete restrict,
  bound_quiesce_evidence_id uuid unique references
    production_control.vercel_writer_quiesce_evidence(evidence_id)
    on delete restrict,
  fence_bind_request_id uuid unique,
  fence_bind_request_fingerprint text unique check (
    fence_bind_request_fingerprint is null or
      fence_bind_request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  fence_bind_payload_hash text check (
    fence_bind_payload_hash is null or
      fence_bind_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  critical_active_at timestamptz,
  fence_bound_at timestamptz,
  restore_pending_at timestamptz,
  baseline_restored_at timestamptz,
  restore_request_id uuid unique,
  restore_request_fingerprint text unique check (
    restore_request_fingerprint is null or
      restore_request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  restore_payload_hash text check (
    restore_payload_hash is null or restore_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  authenticated_actor_fingerprint text not null check (
    authenticated_actor_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint production_vercel_writer_critical_waf_epoch_target_check check (
    (purpose = 'REHEARSAL' and transition_mode = 'REHEARSAL'
      and candidate_deployment_target = 'PREVIEW') or
    (purpose = 'CUTOVER' and transition_mode in ('CUTOVER', 'ROLLBACK')
      and candidate_deployment_target = 'PREVIEW')
  ),
  constraint production_vercel_writer_critical_waf_epoch_state_check check (
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
);

create unique index production_vercel_writer_one_active_critical_waf_epoch_idx
  on production_control.vercel_writer_critical_waf_epochs((true))
  where status <> 'BASELINE_RESTORED';
create unique index production_vercel_writer_active_waf_fence_binding_idx
  on production_control.vercel_writer_critical_waf_epochs(bound_fence_id)
  where status in ('FENCE_BOUND', 'RESTORE_PENDING');

create table production_control.vercel_writer_critical_waf_observations (
  observation_id uuid primary key,
  epoch_id uuid not null references
    production_control.vercel_writer_critical_waf_epochs(epoch_id)
    on delete restrict,
  provider_evidence_id uuid not null unique,
  provider_evidence_schema text not null check (
    provider_evidence_schema = 'bagger-vercel-waf-provider-evidence-v1'
  ),
  evidence_request_id uuid not null unique,
  transition_request_id uuid not null,
  evidence_stage text not null check (evidence_stage in (
    'BASELINE_CAPTURE', 'CRITICAL_ACTIVE', 'CRITICAL_REATTEST',
    'BASELINE_RESTORED'
  )),
  record_request_id uuid not null unique,
  record_request_fingerprint text not null unique check (
    record_request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  record_payload_hash text not null check (
    record_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  request_fingerprint text not null unique check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  evidence_fingerprint text not null unique check (
    evidence_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  signer_key_fingerprint text not null check (
    signer_key_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  signer_key_version text not null check (
    signer_key_version = 'STEP11_6_VERCEL_ATTESTER_V1'
  ),
  purpose text not null check (purpose in ('REHEARSAL', 'CUTOVER')),
  transition_mode text not null check (
    transition_mode in ('REHEARSAL', 'CUTOVER', 'ROLLBACK')
  ),
  vercel_project_id text not null check (
    vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
  ),
  vercel_team_id text not null check (
    vercel_team_id ~ '^team_[A-Za-z0-9]{8,80}$'
  ),
  candidate_alias_origin text not null check (
    candidate_alias_origin ~ '^https://[a-z0-9.-]+$'
  ),
  candidate_immutable_origin text not null check (
    candidate_immutable_origin ~ '^https://[a-z0-9.-]+$'
  ),
  candidate_deployment_id text not null check (
    candidate_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  candidate_commit_sha text not null check (
    candidate_commit_sha ~ '^[0-9a-f]{40}$'
  ),
  candidate_deployment_target text not null check (
    candidate_deployment_target = 'PREVIEW'
  ),
  configuration_mode text not null check (
    configuration_mode in ('BASELINE', 'CRITICAL_WINDOW')
  ),
  active_config_version text not null check (
    active_config_version ~ '^[A-Za-z0-9_.:-]{1,160}$'
  ),
  active_config_etag text check (
    active_config_etag is null or (
      pg_catalog.btrim(active_config_etag) <> '' and
      pg_catalog.length(active_config_etag) <= 512
    )
  ),
  provider_configuration_id text not null check (
    provider_configuration_id ~ '^[A-Za-z0-9_.:-]{1,160}$'
  ),
  provider_owner_id text not null check (
    provider_owner_id ~ '^[A-Za-z0-9_.:-]{1,160}$'
  ),
  configuration_identity_fingerprint text not null check (
    configuration_identity_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  semantic_configuration jsonb not null check (
    pg_catalog.jsonb_typeof(semantic_configuration) = 'object'
  ),
  semantic_configuration_fingerprint text not null check (
    semantic_configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  ordered_rules_fingerprint text not null check (
    ordered_rules_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  custom_rule_count integer not null check (custom_rule_count >= 0),
  baseline_configuration_version text check (
    baseline_configuration_version is null or
      baseline_configuration_version ~ '^[A-Za-z0-9_.:-]{1,160}$'
  ),
  baseline_source_version_read_fingerprint text check (
    baseline_source_version_read_fingerprint is null or
      baseline_source_version_read_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  source_version_read_fingerprint text not null check (
    source_version_read_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  baseline_evidence_id uuid,
  critical_evidence_id uuid,
  baseline_semantic_fingerprint text not null check (
    baseline_semantic_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  critical_semantic_fingerprint text check (
    critical_semantic_fingerprint is null or
      critical_semantic_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  run_owned_rule_name text not null check (
    run_owned_rule_name ~ '^[A-Za-z0-9 _.,:/-]{8,160}$'
  ),
  run_owned_rule_nonce uuid not null,
  provider_assigned_rule_id text check (
    provider_assigned_rule_id is null or
      provider_assigned_rule_id ~ '^[A-Za-z0-9_.:-]{3,160}$'
  ),
  run_owned_rule_fingerprint text not null check (
    run_owned_rule_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  run_owned_insert_document_fingerprint text not null check (
    run_owned_insert_document_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  run_owned_provider_rule_document_fingerprint text check (
    run_owned_provider_rule_document_fingerprint is null or
      run_owned_provider_rule_document_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  run_owned_rule_precedence integer check (
    run_owned_rule_precedence is null or run_owned_rule_precedence = 0
  ),
  critical_window_contract_fingerprint text check (
    critical_window_contract_fingerprint is null or
      critical_window_contract_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  pending_draft_change_count integer not null check (
    pending_draft_change_count = 0
  ),
  provider_observed_at timestamptz not null,
  attested_at timestamptz not null,
  expires_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint production_vercel_writer_critical_waf_observation_shape_check check (
    attested_at = provider_observed_at
    and expires_at = attested_at + interval '2100 seconds'
    and candidate_deployment_target = 'PREVIEW'
    and ((purpose = 'REHEARSAL' and transition_mode = 'REHEARSAL') or
      (purpose = 'CUTOVER' and transition_mode in ('CUTOVER', 'ROLLBACK')))
    and (
      (evidence_stage = 'BASELINE_CAPTURE'
        and baseline_configuration_version is null
        and baseline_source_version_read_fingerprint is null
        and baseline_evidence_id is null
        and critical_evidence_id is null
        and critical_semantic_fingerprint is null
        and provider_assigned_rule_id is null
        and run_owned_provider_rule_document_fingerprint is null
        and run_owned_rule_precedence is null
        and critical_window_contract_fingerprint is null
        and custom_rule_count = 0)
      or (evidence_stage in ('CRITICAL_ACTIVE', 'CRITICAL_REATTEST')
        and baseline_configuration_version is not null
        and baseline_source_version_read_fingerprint is not null
        and baseline_evidence_id is not null
        and provider_assigned_rule_id is not null
        and run_owned_rule_fingerprint is not null
        and run_owned_provider_rule_document_fingerprint is not null
        and run_owned_rule_precedence = 0
        and critical_window_contract_fingerprint is not null
        and critical_semantic_fingerprint is not null
        and custom_rule_count = 1
        and (evidence_stage = 'CRITICAL_ACTIVE'
          and critical_evidence_id is null
          or evidence_stage = 'CRITICAL_REATTEST'
          and critical_evidence_id is not null))
      or (evidence_stage = 'BASELINE_RESTORED'
        and baseline_configuration_version is not null
        and baseline_source_version_read_fingerprint is not null
        and baseline_evidence_id is not null
        and critical_evidence_id is not null
        and critical_semantic_fingerprint is not null
        and provider_assigned_rule_id is null
        and run_owned_provider_rule_document_fingerprint is null
        and run_owned_rule_precedence is null
        and critical_window_contract_fingerprint is null
        and custom_rule_count = 0)
    )
  ),
  unique (epoch_id, evidence_stage, observation_id)
);

alter table production_control.vercel_writer_critical_waf_epochs
  add constraint production_vercel_writer_waf_baseline_observation_fkey
    foreign key (baseline_observation_id) references
      production_control.vercel_writer_critical_waf_observations(observation_id)
      on delete restrict deferrable initially deferred,
  add constraint production_vercel_writer_waf_active_observation_fkey
    foreign key (critical_active_observation_id) references
      production_control.vercel_writer_critical_waf_observations(observation_id)
      on delete restrict deferrable initially deferred,
  add constraint production_vercel_writer_waf_reattest_observation_fkey
    foreign key (latest_critical_reattest_observation_id) references
      production_control.vercel_writer_critical_waf_observations(observation_id)
      on delete restrict deferrable initially deferred,
  add constraint production_vercel_writer_waf_restored_observation_fkey
    foreign key (baseline_restored_observation_id) references
      production_control.vercel_writer_critical_waf_observations(observation_id)
      on delete restrict deferrable initially deferred;

alter table production_control.vercel_writer_critical_waf_observations
  add constraint production_vercel_writer_waf_baseline_evidence_fkey
    foreign key (baseline_evidence_id) references
      production_control.vercel_writer_critical_waf_observations(
        provider_evidence_id
      ) on delete restrict deferrable initially deferred,
  add constraint production_vercel_writer_waf_critical_evidence_fkey
    foreign key (critical_evidence_id) references
      production_control.vercel_writer_critical_waf_observations(
        provider_evidence_id
      ) on delete restrict deferrable initially deferred;

alter table production_control.vercel_writer_critical_waf_epochs
  alter column baseline_observation_id set not null;

create table production_control.vercel_writer_critical_waf_dispatches (
  dispatch_id uuid primary key,
  epoch_id uuid not null references
    production_control.vercel_writer_critical_waf_epochs(epoch_id)
    on delete restrict,
  dispatch_request_id uuid not null unique,
  transition_request_id uuid not null unique,
  dispatch_step text not null check (dispatch_step in (
    'CRITICAL_RULE_INSERT', 'CRITICAL_DRAFT_ACTIVATE',
    'BASELINE_VERSION_ACTIVATE'
  )),
  attempt integer not null check (attempt = 1),
  status text not null check (status in (
    'RESERVED', 'PROVIDER_MUTATING', 'TARGET_CONFIRMED', 'OUTCOME_UNKNOWN',
    'PROVIDER_REJECTED'
  )),
  request_fingerprint text not null unique check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  provider_intent_fingerprint text not null check (
    provider_intent_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  claimed_at timestamptz not null,
  claim_expires_at timestamptz not null,
  provider_dispatch_started_at timestamptz,
  provider_result_observation_id uuid unique references
    production_control.vercel_writer_critical_waf_observations(observation_id)
    on delete restrict,
  provider_dispatch_result_id uuid unique,
  provider_result_fingerprint text check (
    provider_result_fingerprint is null or
      provider_result_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  provider_observed_at timestamptz,
  recorded_at timestamptz,
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  authenticated_actor_fingerprint text not null check (
    authenticated_actor_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint production_vercel_writer_critical_waf_dispatch_unique
    unique (epoch_id, dispatch_step),
  constraint production_vercel_writer_critical_waf_dispatch_state_check check (
    claim_expires_at > claimed_at
    and claim_expires_at <= claimed_at + interval '15 seconds'
    and (
      (status = 'RESERVED' and provider_dispatch_started_at is null
        and provider_result_observation_id is null
        and provider_dispatch_result_id is null
        and provider_result_fingerprint is null
        and provider_observed_at is null and recorded_at is null)
      or (status = 'PROVIDER_MUTATING'
        and provider_dispatch_started_at is not null
        and provider_result_observation_id is null
        and provider_dispatch_result_id is null
        and provider_result_fingerprint is null
        and provider_observed_at is null and recorded_at is null)
      or (status = 'TARGET_CONFIRMED'
        and provider_dispatch_started_at is not null
        and ((dispatch_step = 'CRITICAL_RULE_INSERT'
            and provider_result_observation_id is null
            and provider_dispatch_result_id is not null)
          or (dispatch_step <> 'CRITICAL_RULE_INSERT'
            and provider_result_observation_id is not null
            and provider_dispatch_result_id is null))
        and provider_result_fingerprint is not null
        and provider_observed_at is not null and recorded_at is not null)
      or (status = 'OUTCOME_UNKNOWN'
        and provider_dispatch_started_at is not null
        and provider_result_observation_id is null
        and provider_dispatch_result_id is not null
        and provider_result_fingerprint is not null
        and provider_observed_at is not null and recorded_at is not null)
      or (status = 'PROVIDER_REJECTED'
        and provider_dispatch_started_at is not null
        and provider_result_observation_id is null
        and provider_dispatch_result_id is not null
        and provider_result_fingerprint is not null
        and provider_observed_at is not null and recorded_at is not null)
    )
  )
);

create table production_control.vercel_writer_critical_waf_dispatch_results (
  result_id uuid primary key,
  dispatch_id uuid not null references
    production_control.vercel_writer_critical_waf_dispatches(dispatch_id)
    on delete restrict,
  epoch_id uuid not null references
    production_control.vercel_writer_critical_waf_epochs(epoch_id)
    on delete restrict,
  provider_result_schema text not null check (
    provider_result_schema =
      'bagger-vercel-waf-rule-insert-dispatch-result-v3'
  ),
  outcome_status text not null check (
    outcome_status in (
      'TARGET_CONFIRMED', 'OUTCOME_UNKNOWN', 'PROVIDER_REJECTED'
    )
  ),
  dispatch_step text not null check (dispatch_step in (
    'CRITICAL_RULE_INSERT', 'CRITICAL_DRAFT_ACTIVATE',
    'BASELINE_VERSION_ACTIVATE'
  )),
  result_evidence_id uuid not null unique,
  dispatch_request_id uuid not null,
  transition_request_id uuid not null,
  signed_request_fingerprint text not null unique check (
    signed_request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  evidence_fingerprint text not null unique check (
    evidence_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  signer_key_fingerprint text not null check (
    signer_key_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  signer_key_version text not null check (
    signer_key_version = 'STEP11_6_VERCEL_ATTESTER_V1'
  ),
  purpose text not null check (purpose in ('REHEARSAL', 'CUTOVER')),
  transition_mode text not null check (
    transition_mode in ('REHEARSAL', 'CUTOVER', 'ROLLBACK')
  ),
  vercel_project_id text not null check (
    vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
  ),
  vercel_team_id text not null check (
    vercel_team_id ~ '^team_[A-Za-z0-9]{8,80}$'
  ),
  candidate_alias_origin text not null check (
    candidate_alias_origin ~ '^https://[a-z0-9.-]+$'
  ),
  candidate_immutable_origin text not null check (
    candidate_immutable_origin ~ '^https://[a-z0-9.-]+$'
  ),
  candidate_deployment_id text not null check (
    candidate_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
  ),
  candidate_commit_sha text not null check (
    candidate_commit_sha ~ '^[0-9a-f]{40}$'
  ),
  candidate_deployment_target text not null check (
    candidate_deployment_target = 'PREVIEW'
  ),
  baseline_evidence_id uuid not null references
    production_control.vercel_writer_critical_waf_observations(
      provider_evidence_id
    ) on delete restrict,
  baseline_configuration_version text not null check (
    baseline_configuration_version ~ '^[A-Za-z0-9_.:-]{1,160}$'
  ),
  baseline_configuration_etag text,
  baseline_configuration_identity_fingerprint text not null check (
    baseline_configuration_identity_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  baseline_semantic_configuration_fingerprint text not null check (
    baseline_semantic_configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  baseline_ordered_rules_fingerprint text not null check (
    baseline_ordered_rules_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  baseline_source_version_read_fingerprint text not null check (
    baseline_source_version_read_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  provider_intent_fingerprint text not null check (
    provider_intent_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  provider_response_observed boolean not null,
  provider_response_status integer check (
    provider_response_status is null or
      provider_response_status between 400 and 599
  ),
  provider_response_fingerprint text check (
    provider_response_fingerprint is null or
      provider_response_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  provider_readback_fingerprint text check (
    provider_readback_fingerprint is null or
      provider_readback_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  active_semantic_configuration jsonb check (
    active_semantic_configuration is null or
      pg_catalog.jsonb_typeof(active_semantic_configuration) = 'object'
  ),
  active_semantic_configuration_fingerprint text check (
    active_semantic_configuration_fingerprint is null or
      active_semantic_configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  active_custom_rule_count integer check (
    active_custom_rule_count is null or active_custom_rule_count = 0
  ),
  active_pending_draft_present boolean check (
    active_pending_draft_present is null or active_pending_draft_present is false
  ),
  draft_semantic_configuration jsonb check (
    draft_semantic_configuration is null or
      pg_catalog.jsonb_typeof(draft_semantic_configuration) = 'object'
  ),
  draft_semantic_configuration_fingerprint text check (
    draft_semantic_configuration_fingerprint is null or
      draft_semantic_configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  draft_ordered_rules_fingerprint text check (
    draft_ordered_rules_fingerprint is null or
      draft_ordered_rules_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  draft_configuration_version text check (
    draft_configuration_version is null or
      draft_configuration_version = 'DRAFT'
  ),
  draft_configuration_identity_fingerprint text check (
    draft_configuration_identity_fingerprint is null or
      draft_configuration_identity_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  draft_custom_rule_count integer check (
    draft_custom_rule_count is null or draft_custom_rule_count = 1
  ),
  pending_draft_change_count integer check (
    pending_draft_change_count is null or pending_draft_change_count = 1
  ),
  run_owned_rule_name text not null check (
    run_owned_rule_name ~ '^[A-Za-z0-9 _.,:/-]{8,160}$'
  ),
  run_owned_rule_nonce uuid not null,
  provider_assigned_rule_id text check (
    provider_assigned_rule_id is null or
      provider_assigned_rule_id ~ '^[A-Za-z0-9_.:-]{3,160}$'
  ),
  run_owned_rule_fingerprint text not null check (
    run_owned_rule_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  run_owned_insert_document_fingerprint text not null check (
    run_owned_insert_document_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  run_owned_provider_rule_document_fingerprint text check (
    run_owned_provider_rule_document_fingerprint is null or
      run_owned_provider_rule_document_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  run_owned_rule_precedence integer check (
    run_owned_rule_precedence is null or run_owned_rule_precedence = 0
  ),
  critical_window_contract_fingerprint text check (
    critical_window_contract_fingerprint is null or
      critical_window_contract_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  provider_observed_at timestamptz not null,
  attested_at timestamptz not null,
  expires_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint production_vercel_writer_critical_waf_dispatch_result_time_check
    check (
      attested_at = provider_observed_at
      and expires_at = attested_at + interval '2100 seconds'
      and candidate_deployment_target = 'PREVIEW'
      and ((purpose = 'REHEARSAL' and transition_mode = 'REHEARSAL') or
        (purpose = 'CUTOVER' and transition_mode in ('CUTOVER', 'ROLLBACK')))
    ),
  constraint production_vercel_writer_critical_waf_dispatch_result_shape_check
    check (
      (outcome_status = 'TARGET_CONFIRMED'
        and dispatch_step = 'CRITICAL_RULE_INSERT'
        and provider_response_status is null
        and ((provider_response_observed
            and provider_response_fingerprint is not null)
          or (not provider_response_observed
            and provider_response_fingerprint is null))
        and provider_readback_fingerprint is not null
        and active_semantic_configuration is not null
        and active_semantic_configuration_fingerprint is not null
        and active_custom_rule_count = 0
        and active_pending_draft_present is false
        and draft_semantic_configuration is not null
        and draft_semantic_configuration_fingerprint is not null
        and draft_ordered_rules_fingerprint is not null
        and draft_configuration_version = 'DRAFT'
        and draft_configuration_identity_fingerprint is not null
        and draft_custom_rule_count = 1
        and pending_draft_change_count = 1
        and provider_assigned_rule_id is not null
        and run_owned_provider_rule_document_fingerprint is not null
        and run_owned_rule_precedence = 0
        and critical_window_contract_fingerprint is not null)
      or (outcome_status = 'OUTCOME_UNKNOWN'
        and not provider_response_observed
        and provider_response_status is null
        and provider_response_fingerprint is null
        and provider_readback_fingerprint is null
        and active_semantic_configuration is null
        and active_semantic_configuration_fingerprint is null
        and active_custom_rule_count is null
        and active_pending_draft_present is null
        and draft_semantic_configuration is null
        and draft_semantic_configuration_fingerprint is null
        and draft_ordered_rules_fingerprint is null
        and draft_configuration_version is null
        and draft_configuration_identity_fingerprint is null
        and draft_custom_rule_count is null
        and pending_draft_change_count is null
        and provider_assigned_rule_id is null
        and run_owned_provider_rule_document_fingerprint is null
        and run_owned_rule_precedence is null
        and critical_window_contract_fingerprint is null)
      or (outcome_status = 'PROVIDER_REJECTED'
        and provider_response_observed
        and provider_response_status between 400 and 599
        and provider_response_fingerprint is not null
        and provider_readback_fingerprint is null
        and active_semantic_configuration is null
        and active_semantic_configuration_fingerprint is null
        and active_custom_rule_count is null
        and active_pending_draft_present is null
        and draft_semantic_configuration is null
        and draft_semantic_configuration_fingerprint is null
        and draft_ordered_rules_fingerprint is null
        and draft_configuration_version is null
        and draft_configuration_identity_fingerprint is null
        and draft_custom_rule_count is null
        and pending_draft_change_count is null
        and provider_assigned_rule_id is null
        and run_owned_provider_rule_document_fingerprint is null
        and run_owned_rule_precedence is null
        and critical_window_contract_fingerprint is null)
    ),
  constraint production_vercel_writer_critical_waf_dispatch_result_unique
    unique (dispatch_id, outcome_status)
);

alter table production_control.vercel_writer_critical_waf_dispatches
  add constraint production_vercel_writer_critical_waf_dispatch_result_fkey
    foreign key (provider_dispatch_result_id) references
      production_control.vercel_writer_critical_waf_dispatch_results(result_id)
      on delete restrict deferrable initially deferred;

alter table production_control.vercel_writer_quiesce_evidence
  add column critical_waf_epoch_id uuid references
    production_control.vercel_writer_critical_waf_epochs(epoch_id)
    on delete restrict,
  add column critical_waf_observation_id uuid references
    production_control.vercel_writer_critical_waf_observations(observation_id)
    on delete restrict,
  add column critical_waf_quiesce_stage text check (
    critical_waf_quiesce_stage is null or
      critical_waf_quiesce_stage in ('INSTALL', 'RESTORE_REATTEST')
  );

alter table production_control.vercel_writer_quiesce_evidence
  add constraint production_vercel_writer_quiesce_critical_waf_link_check check (
    (critical_waf_epoch_id is null
      and critical_waf_observation_id is null
      and critical_waf_quiesce_stage is null)
    or (critical_waf_epoch_id is not null
      and critical_waf_observation_id is not null
      and critical_waf_quiesce_stage is not null)
  );

alter table production_control.vercel_writer_critical_waf_epochs
  enable row level security;
alter table production_control.vercel_writer_critical_waf_observations
  enable row level security;
alter table production_control.vercel_writer_critical_waf_dispatches
  enable row level security;
alter table production_control.vercel_writer_critical_waf_dispatch_results
  enable row level security;
revoke all on table production_control.vercel_writer_critical_waf_epochs
  from public, anon, authenticated, service_role;
revoke all on table production_control.vercel_writer_critical_waf_observations
  from public, anon, authenticated, service_role;
revoke all on table production_control.vercel_writer_critical_waf_dispatches
  from public, anon, authenticated, service_role;
revoke all on table production_control.vercel_writer_critical_waf_dispatch_results
  from public, anon, authenticated, service_role;

create or replace function production_control.guard_vercel_writer_critical_waf_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_EVIDENCE_IMMUTABLE';
end;
$$;

create trigger guard_vercel_writer_critical_waf_observation
  before update or delete
  on production_control.vercel_writer_critical_waf_observations
  for each row execute function
    production_control.guard_vercel_writer_critical_waf_row();

create trigger guard_vercel_writer_critical_waf_dispatch_result
  before update or delete
  on production_control.vercel_writer_critical_waf_dispatch_results
  for each row execute function
    production_control.guard_vercel_writer_critical_waf_row();

-- Dispatch result rows are append-only in their evidence dimension. The
-- dispatch and epoch rows have intentionally narrow mutations exclusively in
-- SECURITY DEFINER lifecycle RPCs below.

create or replace function production_control.vercel_writer_critical_waf_epoch_response(
  value production_control.vercel_writer_critical_waf_epochs,
  was_idempotent boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'contract_version', 'CRITICAL_WINDOW_WAF_V1',
    'epoch_id', value.epoch_id,
    'epoch_request_id', value.epoch_request_id,
    'baseline_transition_request_id', value.baseline_transition_request_id,
    'purpose', value.purpose,
    'transition_mode', value.transition_mode,
    'status', value.status,
    'candidate_deployment_id', value.candidate_deployment_id,
    'candidate_deployment_commit', value.candidate_deployment_commit,
    'candidate_deployment_target', value.candidate_deployment_target,
    'candidate_control_hosts_fingerprint',
      value.candidate_control_hosts_fingerprint,
    'baseline_active_config_version', value.baseline_active_config_version,
    'baseline_active_config_etag', value.baseline_active_config_etag,
    'baseline_provider_configuration_id',
      value.baseline_provider_configuration_id,
    'baseline_provider_owner_id', value.baseline_provider_owner_id,
    'baseline_configuration_identity_fingerprint',
      value.baseline_configuration_identity_fingerprint,
    'baseline_source_version_read_fingerprint',
      value.baseline_source_version_read_fingerprint,
    'baseline_semantic_configuration_fingerprint',
      value.baseline_semantic_configuration_fingerprint,
    'baseline_ordered_rules_fingerprint',
      value.baseline_ordered_rules_fingerprint,
    'baseline_custom_rule_count', value.baseline_custom_rule_count,
    'baseline_observation_id', value.baseline_observation_id,
    'run_owned_rule_name', value.run_owned_rule_name,
    'run_owned_rule_nonce', value.run_owned_rule_nonce,
    'provider_assigned_rule_id', value.provider_assigned_rule_id,
    'run_owned_rule_fingerprint', value.run_owned_rule_fingerprint,
    'run_owned_insert_document_fingerprint',
      value.run_owned_insert_document_fingerprint,
    'critical_semantic_configuration_fingerprint',
      value.critical_semantic_configuration_fingerprint,
    'critical_active_observation_id', value.critical_active_observation_id,
    'latest_critical_reattest_observation_id',
      value.latest_critical_reattest_observation_id,
    'critical_active_at', value.critical_active_at,
    'bound_fence_id', value.bound_fence_id,
    'bound_quiesce_evidence_id', value.bound_quiesce_evidence_id,
    'fence_bind_request_id', value.fence_bind_request_id,
    'fence_bind_request_fingerprint', value.fence_bind_request_fingerprint,
    'fence_bound_at', value.fence_bound_at,
    'restore_pending_at', value.restore_pending_at,
    'baseline_restored_observation_id',
      value.baseline_restored_observation_id,
    'baseline_restored_at', value.baseline_restored_at,
    'critical_window_active', value.status in (
      'ACTIVE_UNBOUND', 'FENCE_BOUND', 'RESTORE_PENDING'
    ),
    'baseline_restored', value.status = 'BASELINE_RESTORED',
    'idempotent', was_idempotent
  );
$$;

create or replace function production_control.insert_vercel_writer_critical_waf_observation(
  target_epoch_id uuid,
  verified_evidence jsonb,
  target_record_request_id uuid,
  target_record_request_fingerprint text,
  target_record_payload_hash text,
  target_observation_id uuid default null
)
returns production_control.vercel_writer_critical_waf_observations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  epoch production_control.vercel_writer_critical_waf_epochs%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  reattestation
    production_control.vercel_writer_critical_waf_observations%rowtype;
  prior production_control.vercel_writer_critical_waf_observations%rowtype;
  inserted production_control.vercel_writer_critical_waf_observations%rowtype;
  baseline_observation
    production_control.vercel_writer_critical_waf_observations%rowtype;
  critical_observation
    production_control.vercel_writer_critical_waf_observations%rowtype;
  observation_identifier uuid := coalesce(
    target_observation_id, extensions.gen_random_uuid()
  );
  stage_value text := pg_catalog.upper(
    coalesce(verified_evidence->>'stage', '')
  );
  evidence_identifier uuid;
  baseline_evidence_identifier uuid;
  critical_evidence_identifier uuid;
  provider_observed timestamptz;
  attested timestamptz;
  expires timestamptz;
begin
  if pg_catalog.jsonb_typeof(verified_evidence) is distinct from 'object'
     or (
       select pg_catalog.count(*)
       from pg_catalog.jsonb_object_keys(verified_evidence)
     ) <> 49
     or not (verified_evidence ?& array[
       'schemaVersion', 'evidenceId', 'evidenceRequestId', 'wafEpochId',
       'transitionRequestId', 'requestFingerprint', 'stage', 'purpose',
       'transitionMode',
       'vercelProjectId', 'vercelTeamId', 'candidateAliasOrigin',
       'candidateImmutableOrigin', 'candidateDeploymentId',
       'candidateCommitSha', 'candidateDeploymentTarget',
       'runOwnedRuleName', 'runOwnedRuleNonce',
       'runOwnedRuleFingerprint', 'runOwnedInsertDocumentFingerprint',
       'providerAssignedRuleId', 'baselineEvidenceId', 'criticalEvidenceId',
       'baselineConfigurationVersion',
       'baselineSourceVersionReadFingerprint',
       'configurationMode', 'configurationVersion', 'configurationEtag',
       'providerConfigurationId', 'providerOwnerId',
       'configurationIdentityFingerprint', 'semanticConfiguration',
       'semanticConfigurationFingerprint', 'orderedCustomRulesFingerprint',
       'baselineSemanticFingerprint', 'criticalSemanticFingerprint',
       'customRuleCount', 'runOwnedProviderRuleDocumentFingerprint',
       'runOwnedRulePrecedence', 'criticalWindowContractFingerprint',
       'pendingDraftChangeCount', 'providerObservedAt', 'attestedAt',
       'expiresAt', 'sourceVersionReadFingerprint', 'evidenceFingerprint',
       'signerKeyFingerprint',
       'signerKeyVersion', 'signatureVerified'
     ]::text[])
     or verified_evidence->>'schemaVersion' is distinct from
       'bagger-vercel-waf-provider-evidence-v1'
     or verified_evidence->'signatureVerified' is distinct from 'true'::jsonb
     or stage_value not in (
       'BASELINE_CAPTURE', 'CRITICAL_ACTIVE', 'CRITICAL_REATTEST',
       'BASELINE_RESTORED'
     )
     or pg_catalog.upper(coalesce(verified_evidence->>'transitionMode', ''))
       not in ('REHEARSAL', 'CUTOVER', 'ROLLBACK')
     or coalesce(verified_evidence->>'candidateDeploymentId', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(verified_evidence->>'candidateCommitSha', '')
       !~ '^[0-9a-f]{40}$'
     or verified_evidence->>'candidateDeploymentTarget' is distinct from
       'PREVIEW'
     or coalesce(verified_evidence->>'evidenceId', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(verified_evidence->>'evidenceRequestId', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(verified_evidence->>'wafEpochId', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(verified_evidence->>'transitionRequestId', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(verified_evidence->>'requestFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(verified_evidence->>'evidenceFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(verified_evidence->>'signerKeyFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or verified_evidence->>'signerKeyVersion' is distinct from
       'STEP11_6_VERCEL_ATTESTER_V1'
     or coalesce(verified_evidence->>'configurationIdentityFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(verified_evidence->>'providerConfigurationId', '')
       !~ '^[A-Za-z0-9_.:-]{1,160}$'
     or coalesce(verified_evidence->>'providerOwnerId', '')
       !~ '^[A-Za-z0-9_.:-]{1,160}$'
     or coalesce(verified_evidence->>'semanticConfigurationFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(verified_evidence->>'orderedCustomRulesFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(verified_evidence->>'baselineSemanticFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(verified_evidence->>'sourceVersionReadFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(verified_evidence->>'runOwnedRuleFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(verified_evidence->>'runOwnedInsertDocumentFingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(verified_evidence->>'runOwnedRuleNonce', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.strpos(
       pg_catalog.lower(coalesce(verified_evidence->>'runOwnedRuleName', '')),
       pg_catalog.lower(verified_evidence->>'runOwnedRuleNonce')
     ) = 0
     or pg_catalog.jsonb_typeof(
       verified_evidence->'semanticConfiguration'
     ) is distinct from 'object'
     or (
       select pg_catalog.count(*)
       from pg_catalog.jsonb_object_keys(
         verified_evidence->'semanticConfiguration'
       )
     ) <> 7
     or not ((verified_evidence->'semanticConfiguration') ?& array[
       'schemaVersion', 'securityConfigurationKeys',
       'securityConfigurationKeysFingerprint', 'firewallEnabled', 'ips',
       'crs', 'orderedCustomRules'
     ]::text[])
     or coalesce(verified_evidence->>'providerObservedAt', '') = ''
     or coalesce(verified_evidence->>'attestedAt', '') = ''
     or coalesce(verified_evidence->>'expiresAt', '') = ''
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_EVIDENCE_INVALID';
  end if;

  evidence_identifier := (verified_evidence->>'evidenceId')::uuid;
  baseline_evidence_identifier :=
    nullif(verified_evidence->>'baselineEvidenceId', '')::uuid;
  critical_evidence_identifier :=
    nullif(verified_evidence->>'criticalEvidenceId', '')::uuid;
  provider_observed :=
    (verified_evidence->>'providerObservedAt')::timestamptz;
  attested := (verified_evidence->>'attestedAt')::timestamptz;
  expires := (verified_evidence->>'expiresAt')::timestamptz;

  select * into strict epoch
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_id = target_epoch_id
  for update;
  select * into prior
  from production_control.vercel_writer_critical_waf_observations value
  where value.record_request_id = target_record_request_id;
  if found then
    if prior.epoch_id is distinct from target_epoch_id
       or prior.provider_evidence_id is distinct from evidence_identifier
       or prior.record_request_fingerprint is distinct from
         pg_catalog.lower(target_record_request_fingerprint)
       or prior.record_payload_hash is distinct from
         pg_catalog.lower(target_record_payload_hash)
       or prior.evidence_fingerprint is distinct from
         pg_catalog.lower(verified_evidence->>'evidenceFingerprint')
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_OBSERVATION_IDEMPOTENCY_CONFLICT';
    end if;
    return prior;
  end if;

  if (verified_evidence->>'wafEpochId')::uuid is distinct from epoch.epoch_id
     or verified_evidence->>'purpose' is distinct from epoch.purpose
     or verified_evidence->>'transitionMode' is distinct from
       epoch.transition_mode
     or verified_evidence->>'vercelProjectId' is distinct from
       epoch.vercel_project_id
     or verified_evidence->>'vercelTeamId' is distinct from epoch.vercel_team_id
     or pg_catalog.lower(verified_evidence->>'candidateAliasOrigin')
       is distinct from epoch.candidate_alias_origin
     or pg_catalog.lower(verified_evidence->>'candidateImmutableOrigin')
       is distinct from epoch.candidate_immutable_origin
     or verified_evidence->>'candidateDeploymentId' is distinct from
       epoch.candidate_deployment_id
     or pg_catalog.lower(verified_evidence->>'candidateCommitSha')
       is distinct from epoch.candidate_deployment_commit
     or verified_evidence->>'candidateDeploymentTarget' is distinct from
       epoch.candidate_deployment_target
     or verified_evidence->>'runOwnedRuleName' is distinct from
       epoch.run_owned_rule_name
     or verified_evidence->>'providerConfigurationId' is distinct from
       epoch.baseline_provider_configuration_id
     or verified_evidence->>'providerOwnerId' is distinct from
       epoch.baseline_provider_owner_id
     or (verified_evidence->>'runOwnedRuleNonce')::uuid is distinct from
       epoch.run_owned_rule_nonce
     or pg_catalog.lower(verified_evidence->>'runOwnedRuleFingerprint')
       is distinct from epoch.run_owned_rule_fingerprint
     or pg_catalog.lower(
       verified_evidence->>'runOwnedInsertDocumentFingerprint'
     ) is distinct from epoch.run_owned_insert_document_fingerprint
     or provider_observed is distinct from attested
     or provider_observed <
       pg_catalog.clock_timestamp() - interval '120 seconds'
     or provider_observed >
       pg_catalog.clock_timestamp() + interval '30 seconds'
     or expires is distinct from attested + interval '2100 seconds'
     or expires <= pg_catalog.clock_timestamp()
     or (verified_evidence->>'pendingDraftChangeCount')::integer <> 0
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_EVIDENCE_NOT_CURRENT';
  end if;

  select * into baseline_observation
  from production_control.vercel_writer_critical_waf_observations value
  where value.observation_id = epoch.baseline_observation_id;
  select * into critical_observation
  from production_control.vercel_writer_critical_waf_observations value
  where value.observation_id = epoch.critical_active_observation_id;

  if (stage_value = 'BASELINE_CAPTURE' and (
        epoch.status is distinct from 'ACTIVATION_PENDING'
        or baseline_evidence_identifier is not null
        or critical_evidence_identifier is not null
        or verified_evidence->>'baselineConfigurationVersion' is not null
        or verified_evidence->>'baselineSourceVersionReadFingerprint' is not null
        or verified_evidence->>'configurationMode' is distinct from 'BASELINE'
        or verified_evidence->>'providerAssignedRuleId' is not null
        or verified_evidence->>'criticalSemanticFingerprint' is not null
        or (verified_evidence->>'customRuleCount')::integer <> 0
        or verified_evidence->>'runOwnedProviderRuleDocumentFingerprint'
          is not null
        or verified_evidence->>'runOwnedRulePrecedence' is not null
        or pg_catalog.lower(
          verified_evidence->>'semanticConfigurationFingerprint'
        ) is distinct from epoch.baseline_semantic_configuration_fingerprint
        or pg_catalog.lower(
          verified_evidence->>'baselineSemanticFingerprint'
        ) is distinct from epoch.baseline_semantic_configuration_fingerprint
      ))
     or (stage_value = 'CRITICAL_ACTIVE' and (
        epoch.status is distinct from 'ACTIVATION_PENDING'
        or baseline_observation.observation_id is null
        or baseline_evidence_identifier is distinct from
          baseline_observation.provider_evidence_id
        or critical_evidence_identifier is not null
        or verified_evidence->>'baselineConfigurationVersion' is distinct from
          epoch.baseline_active_config_version
        or pg_catalog.lower(
          verified_evidence->>'baselineSourceVersionReadFingerprint'
        ) is distinct from epoch.baseline_source_version_read_fingerprint
        or pg_catalog.lower(
          verified_evidence->>'sourceVersionReadFingerprint'
        ) is distinct from epoch.baseline_source_version_read_fingerprint
        or verified_evidence->>'configurationMode' is distinct from
          'CRITICAL_WINDOW'
        or coalesce(verified_evidence->>'providerAssignedRuleId', '')
          !~ '^[A-Za-z0-9_.:-]{3,160}$'
        or verified_evidence->>'providerAssignedRuleId' is distinct from
          epoch.provider_assigned_rule_id
        or (verified_evidence->>'customRuleCount')::integer <> 1
        or coalesce(
          verified_evidence->>'runOwnedProviderRuleDocumentFingerprint', ''
        ) !~ '^[0-9a-f]{64}$'
        or (verified_evidence->>'runOwnedRulePrecedence')::integer <> 0
        or coalesce(
          verified_evidence->>'criticalWindowContractFingerprint', ''
        ) !~ '^[0-9a-f]{64}$'
        or pg_catalog.lower(
          verified_evidence->>'criticalSemanticFingerprint'
        ) is distinct from pg_catalog.lower(
          verified_evidence->>'semanticConfigurationFingerprint'
        )
      ))
     or (stage_value = 'CRITICAL_REATTEST' and (
        epoch.status not in ('FENCE_BOUND', 'RESTORE_PENDING')
        or baseline_observation.observation_id is null
        or critical_observation.observation_id is null
        or baseline_evidence_identifier is distinct from
          baseline_observation.provider_evidence_id
        or critical_evidence_identifier is distinct from
          critical_observation.provider_evidence_id
        or verified_evidence->>'baselineConfigurationVersion' is distinct from
          epoch.baseline_active_config_version
        or pg_catalog.lower(
          verified_evidence->>'baselineSourceVersionReadFingerprint'
        ) is distinct from epoch.baseline_source_version_read_fingerprint
        or pg_catalog.lower(
          verified_evidence->>'sourceVersionReadFingerprint'
        ) is distinct from epoch.baseline_source_version_read_fingerprint
        or verified_evidence->>'configurationMode' is distinct from
          'CRITICAL_WINDOW'
        or verified_evidence->>'providerAssignedRuleId' is distinct from
          epoch.provider_assigned_rule_id
        or (verified_evidence->>'customRuleCount')::integer <> 1
        or pg_catalog.lower(
          verified_evidence->>'semanticConfigurationFingerprint'
        ) is distinct from epoch.critical_semantic_configuration_fingerprint
        or pg_catalog.lower(
          verified_evidence->>'criticalSemanticFingerprint'
        ) is distinct from epoch.critical_semantic_configuration_fingerprint
      ))
     or (stage_value = 'BASELINE_RESTORED' and (
        epoch.status is distinct from 'RESTORE_PENDING'
        or baseline_observation.observation_id is null
        or critical_observation.observation_id is null
        or baseline_evidence_identifier is distinct from
          baseline_observation.provider_evidence_id
        or critical_evidence_identifier is distinct from
          critical_observation.provider_evidence_id
        or verified_evidence->>'baselineConfigurationVersion' is distinct from
          epoch.baseline_active_config_version
        or pg_catalog.lower(
          verified_evidence->>'baselineSourceVersionReadFingerprint'
        ) is distinct from epoch.baseline_source_version_read_fingerprint
        or pg_catalog.lower(
          verified_evidence->>'sourceVersionReadFingerprint'
        ) is distinct from epoch.baseline_source_version_read_fingerprint
        or verified_evidence->>'configurationMode' is distinct from 'BASELINE'
        or verified_evidence->>'providerAssignedRuleId' is not null
        or (verified_evidence->>'customRuleCount')::integer <> 0
        or verified_evidence->>'runOwnedProviderRuleDocumentFingerprint'
          is not null
        or verified_evidence->>'runOwnedRulePrecedence' is not null
        or pg_catalog.lower(
          verified_evidence->>'semanticConfigurationFingerprint'
        ) is distinct from epoch.baseline_semantic_configuration_fingerprint
        or pg_catalog.lower(
          verified_evidence->>'criticalSemanticFingerprint'
        ) is distinct from epoch.critical_semantic_configuration_fingerprint
      ))
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_EVIDENCE_SEMANTICS_MISMATCH';
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
    critical_evidence_id,
    baseline_semantic_fingerprint, critical_semantic_fingerprint,
    run_owned_rule_name, run_owned_rule_nonce, provider_assigned_rule_id,
    run_owned_rule_fingerprint, run_owned_insert_document_fingerprint,
    run_owned_provider_rule_document_fingerprint,
    run_owned_rule_precedence, critical_window_contract_fingerprint,
    pending_draft_change_count, provider_observed_at, attested_at, expires_at
  ) values (
    observation_identifier, epoch.epoch_id, evidence_identifier,
    verified_evidence->>'schemaVersion',
    (verified_evidence->>'evidenceRequestId')::uuid,
    (verified_evidence->>'transitionRequestId')::uuid, stage_value,
    target_record_request_id,
    pg_catalog.lower(target_record_request_fingerprint),
    pg_catalog.lower(target_record_payload_hash),
    pg_catalog.lower(verified_evidence->>'requestFingerprint'),
    pg_catalog.lower(verified_evidence->>'evidenceFingerprint'),
    pg_catalog.lower(verified_evidence->>'signerKeyFingerprint'),
    verified_evidence->>'signerKeyVersion', verified_evidence->>'purpose',
    verified_evidence->>'transitionMode',
    verified_evidence->>'vercelProjectId', verified_evidence->>'vercelTeamId',
    pg_catalog.lower(verified_evidence->>'candidateAliasOrigin'),
    pg_catalog.lower(verified_evidence->>'candidateImmutableOrigin'),
    verified_evidence->>'candidateDeploymentId',
    pg_catalog.lower(verified_evidence->>'candidateCommitSha'),
    verified_evidence->>'candidateDeploymentTarget',
    verified_evidence->>'configurationMode',
    verified_evidence->>'configurationVersion',
    nullif(verified_evidence->>'configurationEtag', ''),
    verified_evidence->>'providerConfigurationId',
    verified_evidence->>'providerOwnerId',
    pg_catalog.lower(
      verified_evidence->>'configurationIdentityFingerprint'
    ),
    verified_evidence->'semanticConfiguration',
    pg_catalog.lower(
      verified_evidence->>'semanticConfigurationFingerprint'
    ),
    pg_catalog.lower(verified_evidence->>'orderedCustomRulesFingerprint'),
    (verified_evidence->>'customRuleCount')::integer,
    nullif(verified_evidence->>'baselineConfigurationVersion', ''),
    nullif(pg_catalog.lower(
      verified_evidence->>'baselineSourceVersionReadFingerprint'
    ), ''),
    pg_catalog.lower(verified_evidence->>'sourceVersionReadFingerprint'),
    baseline_evidence_identifier, critical_evidence_identifier,
    pg_catalog.lower(verified_evidence->>'baselineSemanticFingerprint'),
    nullif(
      pg_catalog.lower(verified_evidence->>'criticalSemanticFingerprint'), ''
    ),
    verified_evidence->>'runOwnedRuleName',
    (verified_evidence->>'runOwnedRuleNonce')::uuid,
    nullif(verified_evidence->>'providerAssignedRuleId', ''),
    pg_catalog.lower(verified_evidence->>'runOwnedRuleFingerprint'),
    pg_catalog.lower(
      verified_evidence->>'runOwnedInsertDocumentFingerprint'
    ),
    nullif(pg_catalog.lower(
      verified_evidence->>'runOwnedProviderRuleDocumentFingerprint'
    ), ''),
    nullif(verified_evidence->>'runOwnedRulePrecedence', '')::integer,
    nullif(pg_catalog.lower(
      verified_evidence->>'criticalWindowContractFingerprint'
    ), ''),
    (verified_evidence->>'pendingDraftChangeCount')::integer,
    provider_observed, attested, expires
  ) returning * into inserted;
  return inserted;
end;
$$;

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
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
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
end;
$$;

create or replace function public.begin_production_vercel_writer_critical_waf_epoch(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  prior production_control.vercel_writer_critical_waf_epochs%rowtype;
  epoch production_control.vercel_writer_critical_waf_epochs%rowtype;
  baseline_observation
    production_control.vercel_writer_critical_waf_observations%rowtype;
  baseline_evidence jsonb := input->'baseline_waf_evidence';
  baseline_observation_identifier uuid := extensions.gen_random_uuid();
  epoch_identifier uuid;
  epoch_request uuid;
  observation_request uuid;
  baseline_transition_request uuid;
  baseline_evidence_request uuid;
  baseline_evidence_identifier uuid;
  purpose_value text := pg_catalog.upper(coalesce(input->>'purpose', ''));
  transition_mode_value text := pg_catalog.upper(
    coalesce(input->>'transition_mode', '')
  );
  payload_hash_value text := production_control.cutover_payload_hash(input);
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if input->>'operation' is distinct from
       'BEGIN_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_EPOCH'
     or coalesce(input->>'epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'epoch_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'baseline_observation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.jsonb_typeof(baseline_evidence) is distinct from 'object'
     or coalesce(baseline_evidence->>'transitionRequestId', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(baseline_evidence->>'evidenceRequestId', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(baseline_evidence->>'evidenceId', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or purpose_value not in ('REHEARSAL', 'CUTOVER')
     or transition_mode_value not in ('REHEARSAL', 'CUTOVER', 'ROLLBACK')
     or (purpose_value = 'REHEARSAL' and
       transition_mode_value <> 'REHEARSAL')
     or (purpose_value = 'CUTOVER' and
       transition_mode_value not in ('CUTOVER', 'ROLLBACK'))
     or input->>'candidate_deployment_target' is distinct from 'PREVIEW'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'candidate_control_hosts_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_EPOCH_INPUT_INVALID';
  end if;
  epoch_identifier := (input->>'epoch_id')::uuid;
  epoch_request := (input->>'epoch_request_id')::uuid;
  observation_request := (input->>'baseline_observation_request_id')::uuid;
  baseline_transition_request :=
    (baseline_evidence->>'transitionRequestId')::uuid;
  baseline_evidence_request :=
    (baseline_evidence->>'evidenceRequestId')::uuid;
  baseline_evidence_identifier := (baseline_evidence->>'evidenceId')::uuid;
  if (
       select pg_catalog.count(distinct identifier)
       from pg_catalog.unnest(array[
         epoch_identifier, epoch_request, observation_request,
         baseline_transition_request, baseline_evidence_request,
         baseline_evidence_identifier
       ]) identifier
     ) <> 6
     or baseline_evidence->>'stage' is distinct from 'BASELINE_CAPTURE'
     or baseline_evidence->>'wafEpochId' is distinct from epoch_identifier::text
     or baseline_evidence->>'purpose' is distinct from purpose_value
     or baseline_evidence->>'transitionMode' is distinct from
       transition_mode_value
     or baseline_evidence->>'candidateAliasOrigin' is distinct from
       pg_catalog.lower(input->>'candidate_alias_origin')
     or baseline_evidence->>'candidateImmutableOrigin' is distinct from
       pg_catalog.lower(input->>'candidate_immutable_origin')
     or baseline_evidence->>'candidateDeploymentId' is distinct from
       input->>'candidate_deployment_id'
     or pg_catalog.lower(baseline_evidence->>'candidateCommitSha') is distinct
       from pg_catalog.lower(input->>'candidate_deployment_commit')
     or baseline_evidence->>'candidateDeploymentTarget' is distinct from
       pg_catalog.upper(input->>'candidate_deployment_target')
     or baseline_evidence->>'configurationMode' is distinct from 'BASELINE'
     or baseline_evidence->>'providerAssignedRuleId' is not null
     or baseline_evidence->>'baselineEvidenceId' is not null
     or baseline_evidence->>'criticalEvidenceId' is not null
     or (baseline_evidence->>'customRuleCount')::integer <> 0
     or (baseline_evidence->>'pendingDraftChangeCount')::integer <> 0
     or baseline_evidence->>'semanticConfigurationFingerprint' is distinct from
       baseline_evidence->>'baselineSemanticFingerprint'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_BASELINE_SCOPE_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into prior
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_request_id = epoch_request
     or value.epoch_id = epoch_identifier
  for update;
  if found then
    if prior.epoch_id is distinct from epoch_identifier
       or prior.epoch_request_id is distinct from epoch_request
       or prior.baseline_transition_request_id is distinct from
         baseline_transition_request
       or prior.begin_request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or prior.begin_payload_hash is distinct from payload_hash_value
       or prior.purpose is distinct from purpose_value
       or prior.transition_mode is distinct from transition_mode_value
       or prior.baseline_observation_id is distinct from (
         select value.observation_id
         from production_control.vercel_writer_critical_waf_observations value
         where value.provider_evidence_id =
           (baseline_evidence->>'evidenceId')::uuid
       )
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_EPOCH_IDEMPOTENCY_CONFLICT';
    end if;
    return production_control.vercel_writer_critical_waf_epoch_response(
      prior, true
    );
  end if;

  insert into production_control.vercel_writer_critical_waf_epochs (
    epoch_id, epoch_request_id, baseline_transition_request_id,
    purpose, transition_mode, status,
    begin_request_fingerprint, begin_payload_hash, vercel_project_id,
    vercel_team_id, candidate_deployment_id, candidate_deployment_commit,
    candidate_deployment_target, candidate_alias_origin,
    candidate_immutable_origin, candidate_control_hosts_fingerprint,
    baseline_active_config_version, baseline_active_config_etag,
    baseline_provider_configuration_id, baseline_provider_owner_id,
    baseline_configuration_identity_fingerprint,
    baseline_source_version_read_fingerprint,
    baseline_semantic_configuration_fingerprint,
    baseline_ordered_rules_fingerprint, baseline_custom_rule_count,
    run_owned_rule_name, run_owned_rule_nonce, provider_assigned_rule_id,
    run_owned_rule_fingerprint, run_owned_insert_document_fingerprint,
    critical_semantic_configuration_fingerprint, baseline_observation_id,
    actor_id, authenticated_actor_fingerprint
  ) values (
    epoch_identifier, epoch_request,
    baseline_transition_request,
    purpose_value, transition_mode_value,
    'ACTIVATION_PENDING',
    pg_catalog.lower(input->>'request_fingerprint'), payload_hash_value,
    baseline_evidence->>'vercelProjectId',
    baseline_evidence->>'vercelTeamId',
    input->>'candidate_deployment_id',
    pg_catalog.lower(input->>'candidate_deployment_commit'),
    pg_catalog.upper(input->>'candidate_deployment_target'),
    pg_catalog.lower(input->>'candidate_alias_origin'),
    pg_catalog.lower(input->>'candidate_immutable_origin'),
    pg_catalog.lower(input->>'candidate_control_hosts_fingerprint'),
    baseline_evidence->>'configurationVersion',
    nullif(baseline_evidence->>'configurationEtag', ''),
    baseline_evidence->>'providerConfigurationId',
    baseline_evidence->>'providerOwnerId',
    pg_catalog.lower(
      baseline_evidence->>'configurationIdentityFingerprint'
    ),
    pg_catalog.lower(
      baseline_evidence->>'sourceVersionReadFingerprint'
    ),
    pg_catalog.lower(
      baseline_evidence->>'semanticConfigurationFingerprint'
    ),
    pg_catalog.lower(baseline_evidence->>'orderedCustomRulesFingerprint'),
    (baseline_evidence->>'customRuleCount')::integer,
    baseline_evidence->>'runOwnedRuleName',
    (baseline_evidence->>'runOwnedRuleNonce')::uuid, null,
    pg_catalog.lower(baseline_evidence->>'runOwnedRuleFingerprint'),
    pg_catalog.lower(
      baseline_evidence->>'runOwnedInsertDocumentFingerprint'
    ),
    null, baseline_observation_identifier,
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'authenticated_actor_fingerprint')
  ) returning * into epoch;

  baseline_observation :=
    production_control.insert_vercel_writer_critical_waf_observation(
      epoch.epoch_id, baseline_evidence, observation_request,
      pg_catalog.lower(input->>'request_fingerprint'), payload_hash_value,
      baseline_observation_identifier
    );
  if baseline_observation.observation_id is distinct from
       epoch.baseline_observation_id
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_BASELINE_RECORD_RACE';
  end if;
  return production_control.vercel_writer_critical_waf_epoch_response(
    epoch, false
  );
end;
$$;

create or replace function public.begin_production_vercel_writer_critical_waf_dispatch(
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
  prior production_control.vercel_writer_critical_waf_dispatches%rowtype;
  inserted production_control.vercel_writer_critical_waf_dispatches%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
  reattestation
    production_control.vercel_writer_critical_waf_observations%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  request_identifier uuid;
  step_value text := pg_catalog.upper(coalesce(input->>'dispatch_step', ''));
  now_value timestamptz := pg_catalog.clock_timestamp();
  payload_hash_value text := production_control.cutover_payload_hash(input);
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if input->>'operation' is distinct from
       'BEGIN_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH'
     or coalesce(input->>'epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'dispatch_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'transition_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or step_value not in (
       'CRITICAL_RULE_INSERT', 'CRITICAL_DRAFT_ACTIVATE',
       'BASELINE_VERSION_ACTIVATE'
     )
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'provider_intent_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_INPUT_INVALID';
  end if;
  request_identifier := (input->>'dispatch_request_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into prior
  from production_control.vercel_writer_critical_waf_dispatches value
  where value.dispatch_request_id = request_identifier
  for update;
  if found then
    if prior.epoch_id is distinct from (input->>'epoch_id')::uuid
       or prior.dispatch_step is distinct from step_value
       or prior.transition_request_id is distinct from
         (input->>'transition_request_id')::uuid
       or prior.request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or prior.payload_hash is distinct from payload_hash_value
       or prior.provider_intent_fingerprint is distinct from
         pg_catalog.lower(input->>'provider_intent_fingerprint')
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_IDEMPOTENCY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'contract_version', 'CRITICAL_WINDOW_WAF_V1',
      'epoch_id', prior.epoch_id, 'dispatch_id', prior.dispatch_id,
      'dispatch_request_id', prior.dispatch_request_id,
      'transition_request_id', prior.transition_request_id,
      'dispatch_step', prior.dispatch_step,
      'request_fingerprint', prior.request_fingerprint,
      'provider_intent_fingerprint', prior.provider_intent_fingerprint,
      'transition_mode', (
        select value.transition_mode
        from production_control.vercel_writer_critical_waf_epochs value
        where value.epoch_id = prior.epoch_id
      ),
      'status', prior.status,
      'dispatch_usable', false, 'replay_usable', false,
      'remaining_dispatch_budget_ms', 0, 'idempotent', true
    );
  end if;
  select * into strict epoch
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_id = (input->>'epoch_id')::uuid
  for update;
  if epoch.actor_id is distinct from input->>'actor_id'
     or epoch.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_ACTOR_MISMATCH';
  end if;
  if (step_value = 'CRITICAL_RULE_INSERT' and (
        epoch.status is distinct from 'ACTIVATION_PENDING'
        or exists (
          select 1
          from production_control.vercel_writer_critical_waf_dispatches value
          where value.epoch_id = epoch.epoch_id
            and value.dispatch_step = 'CRITICAL_RULE_INSERT'
        )
      ))
     or (step_value = 'CRITICAL_DRAFT_ACTIVATE' and (
        epoch.status is distinct from 'ACTIVATION_PENDING'
        or epoch.provider_assigned_rule_id is null
        or not exists (
          select 1
          from production_control.vercel_writer_critical_waf_dispatches value
          where value.epoch_id = epoch.epoch_id
            and value.dispatch_step = 'CRITICAL_RULE_INSERT'
            and value.status = 'TARGET_CONFIRMED'
        )
      ))
     or (step_value = 'BASELINE_VERSION_ACTIVATE' and (
        epoch.status is distinct from 'FENCE_BOUND'
        or coalesce(input->>'restore_request_id', '')
          !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce(input->>'restore_request_fingerprint', '')
          !~ '^[0-9a-f]{64}$'
      ))
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_STATE_INVALID';
  end if;
  if step_value = 'BASELINE_VERSION_ACTIVATE' then
    select * into strict fence
    from production_control.google_writer_provider_fences value
    where value.fence_id = epoch.bound_fence_id
    for update;
    select * into strict reattestation
    from production_control.vercel_writer_critical_waf_observations value
    where value.observation_id = epoch.latest_critical_reattest_observation_id
      and value.epoch_id = epoch.epoch_id;
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
    if reattestation.evidence_stage is distinct from 'CRITICAL_REATTEST'
       or reattestation.expires_at <= pg_catalog.clock_timestamp()
       or (epoch.transition_mode = 'REHEARSAL' and (
         fence.status is distinct from 'ACL_RESTORED_WAF_ACTIVE'
         or activation.state is distinct from 'DORMANT'
         or activation.current_authority is distinct from 'GOOGLE'
         or activation.scoring_ingress_enabled
         or resource.scoring_authority is distinct from 'GOOGLE'
         or gate.state is distinct from 'PAUSED'
         or gate.authority is distinct from 'GOOGLE'
         or gate.admission_state is distinct from 'OPEN'
         or gate.admission_protocol_enforced
       ))
       or (epoch.transition_mode = 'CUTOVER' and (
         fence.status is distinct from 'INSTALLED'
         or activation.state is distinct from 'SCORING_COMMITTED'
         or activation.current_authority is distinct from 'SUPABASE'
         or not activation.scoring_ingress_enabled
         or resource.scoring_authority is distinct from 'SUPABASE'
         or gate.state is distinct from 'OPEN'
         or gate.authority is distinct from 'SUPABASE'
         or gate.admission_state is distinct from 'CLOSED'
         or not gate.admission_protocol_enforced
       ))
       or (epoch.transition_mode = 'ROLLBACK' and (
         fence.status is distinct from 'ACL_RESTORED_WAF_ACTIVE'
         or fence.lifecycle_mode is distinct from 'CUTOVER'
         or activation.current_authority is distinct from 'GOOGLE'
         or activation.scoring_ingress_enabled
         or resource.scoring_authority is distinct from 'GOOGLE'
         or gate.state is distinct from 'PAUSED'
         or gate.authority is distinct from 'GOOGLE'
         or gate.admission_state is distinct from 'OPEN'
         or gate.admission_protocol_enforced
       ))
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_BASELINE_RESTORE_NOT_SAFE';
    end if;
    update production_control.vercel_writer_critical_waf_epochs
    set status = 'RESTORE_PENDING',
        restore_pending_at = now_value,
        restore_request_id = (input->>'restore_request_id')::uuid,
        restore_request_fingerprint =
          pg_catalog.lower(input->>'restore_request_fingerprint'),
        restore_payload_hash = payload_hash_value,
        updated_at = now_value
    where epoch_id = epoch.epoch_id
    returning * into epoch;
  end if;
  insert into production_control.vercel_writer_critical_waf_dispatches (
    dispatch_id, epoch_id, dispatch_request_id, transition_request_id,
    dispatch_step, attempt,
    status, request_fingerprint, payload_hash, provider_intent_fingerprint,
    claimed_at, claim_expires_at, actor_id,
    authenticated_actor_fingerprint
  ) values (
    extensions.gen_random_uuid(), epoch.epoch_id, request_identifier,
    (input->>'transition_request_id')::uuid, step_value, 1, 'RESERVED',
    pg_catalog.lower(input->>'request_fingerprint'), payload_hash_value,
    pg_catalog.lower(input->>'provider_intent_fingerprint'), now_value,
    now_value + interval '15 seconds',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'authenticated_actor_fingerprint')
  ) returning * into inserted;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'contract_version', 'CRITICAL_WINDOW_WAF_V1',
    'epoch_id', inserted.epoch_id, 'dispatch_id', inserted.dispatch_id,
    'dispatch_request_id', inserted.dispatch_request_id,
    'transition_request_id', inserted.transition_request_id,
    'dispatch_step', inserted.dispatch_step,
    'request_fingerprint', inserted.request_fingerprint,
    'transition_mode', epoch.transition_mode,
    'status', inserted.status,
    'provider_intent_fingerprint', inserted.provider_intent_fingerprint,
    'dispatch_usable', true, 'replay_usable', true,
    'remaining_dispatch_budget_ms', 15000, 'idempotent', false
  );
end;
$$;

create or replace function public.mark_production_vercel_writer_critical_waf_dispatch_started(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  dispatch production_control.vercel_writer_critical_waf_dispatches%rowtype;
  remaining_ms integer;
begin
  if input->>'operation' is distinct from
       'MARK_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_STARTED'
     or coalesce(input->>'dispatch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'dispatch_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'transition_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_MARK_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict dispatch
  from production_control.vercel_writer_critical_waf_dispatches value
  where value.dispatch_id = (input->>'dispatch_id')::uuid
    and value.dispatch_request_id = (input->>'dispatch_request_id')::uuid
    and value.transition_request_id = (input->>'transition_request_id')::uuid
  for update;
  if dispatch.status is distinct from 'RESERVED'
     or dispatch.request_fingerprint is distinct from
       pg_catalog.lower(input->>'request_fingerprint')
     or dispatch.claim_expires_at <= pg_catalog.clock_timestamp()
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_NOT_USABLE';
  end if;
  update production_control.vercel_writer_critical_waf_dispatches
  set status = 'PROVIDER_MUTATING',
      provider_dispatch_started_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where dispatch_id = dispatch.dispatch_id
  returning * into dispatch;
  remaining_ms := greatest(0, pg_catalog.floor(extract(epoch from (
    dispatch.claim_expires_at - pg_catalog.clock_timestamp()
  )) * 1000)::integer);
  if remaining_ms <= 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_EXPIRED';
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'contract_version', 'CRITICAL_WINDOW_WAF_V1',
    'epoch_id', dispatch.epoch_id, 'dispatch_id', dispatch.dispatch_id,
    'dispatch_request_id', dispatch.dispatch_request_id,
    'transition_request_id', dispatch.transition_request_id,
    'dispatch_step', dispatch.dispatch_step,
    'provider_intent_fingerprint', dispatch.provider_intent_fingerprint,
    'status', dispatch.status,
    'remaining_dispatch_budget_ms', least(12000, remaining_ms),
    'dispatch_usable', true, 'replay_usable', false
  );
end;
$$;

create or replace function public.record_production_vercel_writer_critical_waf_dispatch_result(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  dispatch production_control.vercel_writer_critical_waf_dispatches%rowtype;
  epoch production_control.vercel_writer_critical_waf_epochs%rowtype;
  observation production_control.vercel_writer_critical_waf_observations%rowtype;
  baseline_observation
    production_control.vercel_writer_critical_waf_observations%rowtype;
  signed_result production_control.vercel_writer_critical_waf_dispatch_results%rowtype;
  prior_signed_result
    production_control.vercel_writer_critical_waf_dispatch_results%rowtype;
  verified_dispatch_result jsonb := input->'verified_dispatch_result';
  verified_waf_evidence jsonb := input->'verified_waf_evidence';
  outcome_value text;
  result_fingerprint_value text;
  expected_stage text;
  payload_hash_value text := production_control.cutover_payload_hash(input);
  provider_observed timestamptz;
  attested timestamptz;
  expires timestamptz;
begin
  if input->>'operation' is distinct from
       'RECORD_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_RESULT'
     or coalesce(input->>'dispatch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or (
       pg_catalog.jsonb_typeof(verified_dispatch_result) is distinct from
         'object'
       and pg_catalog.jsonb_typeof(verified_waf_evidence) is distinct from
         'object'
     )
     or (
       pg_catalog.jsonb_typeof(verified_dispatch_result) = 'object'
       and pg_catalog.jsonb_typeof(verified_waf_evidence) = 'object'
     )
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_RESULT_INPUT_INVALID';
  end if;

  if pg_catalog.jsonb_typeof(verified_dispatch_result) = 'object' then
    if (
       select pg_catalog.count(*)
         from pg_catalog.jsonb_object_keys(verified_dispatch_result)
       ) <> 56
       or not (verified_dispatch_result ?& array[
         'schemaVersion', 'dispatchResultId', 'dispatchId',
         'dispatchRequestId', 'dispatchStep', 'wafEpochId',
         'transitionRequestId', 'requestFingerprint', 'purpose',
         'transitionMode',
         'projectId', 'teamId', 'candidateAliasOrigin',
         'candidateImmutableOrigin', 'candidateDeploymentId',
         'candidateCommitSha', 'candidateDeploymentTarget',
         'baselineEvidenceId',
         'baselineConfigurationVersion', 'baselineConfigurationEtag',
         'baselineConfigurationIdentityFingerprint',
         'baselineSemanticFingerprint',
         'baselineOrderedCustomRulesFingerprint',
         'baselineSourceVersionReadFingerprint', 'providerIntentFingerprint',
         'runOwnedRuleName', 'runOwnedRuleNonce', 'runOwnedRuleFingerprint',
         'runOwnedInsertDocumentFingerprint', 'outcomeStatus',
         'providerResponseObserved', 'providerResponseStatus',
         'providerResponseFingerprint',
         'providerReadbackFingerprint',
         'activeSemanticConfiguration',
         'activeSemanticConfigurationFingerprint', 'activeCustomRuleCount',
         'activePendingDraftPresent', 'draftSemanticConfiguration',
         'draftSemanticConfigurationFingerprint',
         'draftOrderedCustomRulesFingerprint', 'draftConfigurationVersion',
         'draftConfigurationIdentityFingerprint', 'draftCustomRuleCount',
         'pendingDraftChangeCount', 'providerAssignedRuleId',
         'runOwnedProviderRuleDocumentFingerprint',
         'runOwnedRulePrecedence', 'criticalWindowContractFingerprint',
         'providerObservedAt', 'attestedAt', 'expiresAt',
         'evidenceFingerprint', 'signerKeyFingerprint', 'signerKeyVersion',
         'signatureVerified'
       ]::text[])
       or verified_dispatch_result->>'schemaVersion' is distinct from
         'bagger-vercel-waf-rule-insert-dispatch-result-v3'
       or verified_dispatch_result->'signatureVerified' is distinct from
         'true'::jsonb
       or coalesce(verified_dispatch_result->>'dispatchResultId', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(verified_dispatch_result->>'dispatchId', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(verified_dispatch_result->>'dispatchRequestId', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(verified_dispatch_result->>'wafEpochId', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(verified_dispatch_result->>'transitionRequestId', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or verified_dispatch_result->>'dispatchStep' not in (
         'CRITICAL_RULE_INSERT', 'CRITICAL_DRAFT_ACTIVATE',
         'BASELINE_VERSION_ACTIVATE'
       )
       or pg_catalog.upper(coalesce(
         verified_dispatch_result->>'transitionMode', ''
       )) not in ('REHEARSAL', 'CUTOVER', 'ROLLBACK')
       or coalesce(verified_dispatch_result->>'candidateDeploymentId', '')
         !~ '^dpl_[A-Za-z0-9]{8,64}$'
       or coalesce(verified_dispatch_result->>'candidateCommitSha', '')
         !~ '^[0-9a-f]{40}$'
       or verified_dispatch_result->>'candidateDeploymentTarget' is distinct
         from 'PREVIEW'
       or verified_dispatch_result->>'outcomeStatus' not in (
         'TARGET_CONFIRMED', 'OUTCOME_UNKNOWN', 'PROVIDER_REJECTED'
       )
       or pg_catalog.jsonb_typeof(
         verified_dispatch_result->'providerResponseObserved'
       ) is distinct from 'boolean'
       or (verified_dispatch_result->>'outcomeStatus' = 'PROVIDER_REJECTED'
         and (verified_dispatch_result->'providerResponseObserved'
               is distinct from 'true'::jsonb
           or pg_catalog.jsonb_typeof(
           verified_dispatch_result->'providerResponseStatus'
         ) is distinct from 'number'
           or coalesce(
           verified_dispatch_result->>'providerResponseStatus', ''
         ) !~ '^[45][0-9]{2}$'))
       or (verified_dispatch_result->>'outcomeStatus' <>
             'PROVIDER_REJECTED'
         and verified_dispatch_result->'providerResponseStatus' is distinct
           from 'null'::jsonb)
       or (verified_dispatch_result->>'outcomeStatus' = 'OUTCOME_UNKNOWN'
         and verified_dispatch_result->'providerResponseObserved'
           is distinct from 'false'::jsonb)
       or coalesce(verified_dispatch_result->>'requestFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(verified_dispatch_result->>'evidenceFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(verified_dispatch_result->>'signerKeyFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or verified_dispatch_result->>'signerKeyVersion' is distinct from
         'STEP11_6_VERCEL_ATTESTER_V1'
       or coalesce(verified_dispatch_result->>'providerIntentFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(verified_dispatch_result->>'runOwnedRuleFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(
         verified_dispatch_result->>'runOwnedInsertDocumentFingerprint', ''
       ) !~ '^[0-9a-f]{64}$'
       or coalesce(
         verified_dispatch_result->>'baselineSemanticFingerprint', ''
       ) !~ '^[0-9a-f]{64}$'
       or coalesce(
         verified_dispatch_result->>'baselineOrderedCustomRulesFingerprint', ''
       ) !~ '^[0-9a-f]{64}$'
       or coalesce(
         verified_dispatch_result->>'baselineSourceVersionReadFingerprint', ''
       ) !~ '^[0-9a-f]{64}$'
       or coalesce(verified_dispatch_result->>'providerObservedAt', '') = ''
       or coalesce(verified_dispatch_result->>'attestedAt', '') = ''
       or coalesce(verified_dispatch_result->>'expiresAt', '') = ''
    then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_SIGNED_RESULT_INVALID';
    end if;
    outcome_value := verified_dispatch_result->>'outcomeStatus';
    result_fingerprint_value :=
      pg_catalog.lower(verified_dispatch_result->>'evidenceFingerprint');
    provider_observed :=
      (verified_dispatch_result->>'providerObservedAt')::timestamptz;
    attested := (verified_dispatch_result->>'attestedAt')::timestamptz;
    expires := (verified_dispatch_result->>'expiresAt')::timestamptz;
  else
    outcome_value := 'TARGET_CONFIRMED';
    result_fingerprint_value :=
      pg_catalog.lower(verified_waf_evidence->>'evidenceFingerprint');
    provider_observed :=
      (verified_waf_evidence->>'providerObservedAt')::timestamptz;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict dispatch
  from production_control.vercel_writer_critical_waf_dispatches value
  where value.dispatch_id = (input->>'dispatch_id')::uuid
  for update;
  select * into strict epoch
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_id = dispatch.epoch_id
  for update;
  select * into strict baseline_observation
  from production_control.vercel_writer_critical_waf_observations value
  where value.observation_id = epoch.baseline_observation_id;

  if pg_catalog.jsonb_typeof(verified_dispatch_result) = 'object' then
    if (verified_dispatch_result->>'dispatchId')::uuid is distinct from
         dispatch.dispatch_id
       or (verified_dispatch_result->>'dispatchRequestId')::uuid is distinct
         from dispatch.dispatch_request_id
       or verified_dispatch_result->>'dispatchStep' is distinct from
         dispatch.dispatch_step
       or (verified_dispatch_result->>'wafEpochId')::uuid is distinct from
         epoch.epoch_id
       or (verified_dispatch_result->>'transitionRequestId')::uuid is distinct
         from dispatch.transition_request_id
       or verified_dispatch_result->>'purpose' is distinct from epoch.purpose
       or verified_dispatch_result->>'transitionMode' is distinct from
         epoch.transition_mode
       or verified_dispatch_result->>'projectId' is distinct from
         epoch.vercel_project_id
       or verified_dispatch_result->>'teamId' is distinct from
         epoch.vercel_team_id
       or pg_catalog.lower(
         verified_dispatch_result->>'candidateAliasOrigin'
       ) is distinct from epoch.candidate_alias_origin
       or pg_catalog.lower(
         verified_dispatch_result->>'candidateImmutableOrigin'
       ) is distinct from epoch.candidate_immutable_origin
       or verified_dispatch_result->>'candidateDeploymentId' is distinct from
         epoch.candidate_deployment_id
       or pg_catalog.lower(verified_dispatch_result->>'candidateCommitSha')
         is distinct from epoch.candidate_deployment_commit
       or verified_dispatch_result->>'candidateDeploymentTarget' is distinct
         from epoch.candidate_deployment_target
       or (verified_dispatch_result->>'baselineEvidenceId')::uuid is distinct
         from baseline_observation.provider_evidence_id
       or verified_dispatch_result->>'baselineConfigurationVersion'
         is distinct from epoch.baseline_active_config_version
       or nullif(verified_dispatch_result->>'baselineConfigurationEtag', '')
         is distinct from epoch.baseline_active_config_etag
       or pg_catalog.lower(
         verified_dispatch_result->>'baselineConfigurationIdentityFingerprint'
       ) is distinct from epoch.baseline_configuration_identity_fingerprint
       or pg_catalog.lower(
         verified_dispatch_result->>'baselineSemanticFingerprint'
       ) is distinct from epoch.baseline_semantic_configuration_fingerprint
       or pg_catalog.lower(
         verified_dispatch_result->>'baselineOrderedCustomRulesFingerprint'
       ) is distinct from epoch.baseline_ordered_rules_fingerprint
       or pg_catalog.lower(
         verified_dispatch_result->>'baselineSourceVersionReadFingerprint'
       ) is distinct from epoch.baseline_source_version_read_fingerprint
       or pg_catalog.lower(
         verified_dispatch_result->>'providerIntentFingerprint'
       ) is distinct from dispatch.provider_intent_fingerprint
       or verified_dispatch_result->>'runOwnedRuleName' is distinct from
         epoch.run_owned_rule_name
       or (verified_dispatch_result->>'runOwnedRuleNonce')::uuid is distinct
         from epoch.run_owned_rule_nonce
       or pg_catalog.lower(
         verified_dispatch_result->>'runOwnedRuleFingerprint'
       ) is distinct from epoch.run_owned_rule_fingerprint
       or pg_catalog.lower(
         verified_dispatch_result->>'runOwnedInsertDocumentFingerprint'
       ) is distinct from epoch.run_owned_insert_document_fingerprint
       or provider_observed is distinct from attested
       or provider_observed <
         pg_catalog.clock_timestamp() - interval '120 seconds'
       or provider_observed >
         pg_catalog.clock_timestamp() + interval '30 seconds'
       or expires is distinct from attested + interval '2100 seconds'
       or expires <= pg_catalog.clock_timestamp()
       or (outcome_value = 'TARGET_CONFIRMED' and (
         dispatch.dispatch_step is distinct from 'CRITICAL_RULE_INSERT'
         or (verified_dispatch_result->'providerResponseObserved' =
               'true'::jsonb
           and coalesce(
             verified_dispatch_result->>'providerResponseFingerprint', ''
           ) !~ '^[0-9a-f]{64}$')
         or (verified_dispatch_result->'providerResponseObserved' =
               'false'::jsonb
           and verified_dispatch_result->'providerResponseFingerprint'
             is distinct from 'null'::jsonb)
         or coalesce(
           verified_dispatch_result->>'providerReadbackFingerprint', ''
         ) !~ '^[0-9a-f]{64}$'
         or pg_catalog.jsonb_typeof(
           verified_dispatch_result->'activeSemanticConfiguration'
         ) is distinct from 'object'
         or (
           select pg_catalog.count(*)
           from pg_catalog.jsonb_object_keys(
             verified_dispatch_result->'activeSemanticConfiguration'
           )
         ) <> 7
         or not ((verified_dispatch_result->'activeSemanticConfiguration')
           ?& array[
             'schemaVersion', 'securityConfigurationKeys',
             'securityConfigurationKeysFingerprint', 'firewallEnabled',
             'ips', 'crs', 'orderedCustomRules'
           ]::text[])
         or pg_catalog.lower(
           verified_dispatch_result->>'activeSemanticConfigurationFingerprint'
         ) is distinct from epoch.baseline_semantic_configuration_fingerprint
         or (verified_dispatch_result->>'activeCustomRuleCount')::integer <> 0
         or (verified_dispatch_result->>'activePendingDraftPresent')::boolean
         or pg_catalog.jsonb_typeof(
           verified_dispatch_result->'draftSemanticConfiguration'
         ) is distinct from 'object'
         or (
           select pg_catalog.count(*)
           from pg_catalog.jsonb_object_keys(
             verified_dispatch_result->'draftSemanticConfiguration'
           )
         ) <> 7
         or not ((verified_dispatch_result->'draftSemanticConfiguration')
           ?& array[
             'schemaVersion', 'securityConfigurationKeys',
             'securityConfigurationKeysFingerprint', 'firewallEnabled',
             'ips', 'crs', 'orderedCustomRules'
           ]::text[])
         or coalesce(
           verified_dispatch_result->>'draftSemanticConfigurationFingerprint',
           ''
         ) !~ '^[0-9a-f]{64}$'
         or coalesce(
           verified_dispatch_result->>'draftOrderedCustomRulesFingerprint', ''
         ) !~ '^[0-9a-f]{64}$'
         or verified_dispatch_result->>'draftConfigurationVersion'
           is distinct from 'DRAFT'
         or coalesce(
           verified_dispatch_result
             ->>'draftConfigurationIdentityFingerprint', ''
         ) !~ '^[0-9a-f]{64}$'
         or (verified_dispatch_result->>'draftCustomRuleCount')::integer <> 1
         or (verified_dispatch_result->>'pendingDraftChangeCount')::integer <> 1
         or coalesce(
           verified_dispatch_result->>'providerAssignedRuleId', ''
         ) !~ '^[A-Za-z0-9_.:-]{3,160}$'
         or coalesce(
           verified_dispatch_result
             ->>'runOwnedProviderRuleDocumentFingerprint', ''
         ) !~ '^[0-9a-f]{64}$'
         or (verified_dispatch_result->>'runOwnedRulePrecedence')::integer <> 0
         or coalesce(
           verified_dispatch_result->>'criticalWindowContractFingerprint', ''
         ) !~ '^[0-9a-f]{64}$'
       ))
       or (outcome_value = 'OUTCOME_UNKNOWN' and
         verified_dispatch_result->'providerResponseFingerprint' is distinct
           from 'null'::jsonb)
       or (outcome_value = 'PROVIDER_REJECTED' and coalesce(
         verified_dispatch_result->>'providerResponseFingerprint', ''
       ) !~ '^[0-9a-f]{64}$')
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_SIGNED_RESULT_SCOPE_MISMATCH';
    end if;

    select * into prior_signed_result
    from production_control.vercel_writer_critical_waf_dispatch_results value
    where value.result_evidence_id =
      (verified_dispatch_result->>'dispatchResultId')::uuid;
    if found then
      if prior_signed_result.dispatch_id is distinct from dispatch.dispatch_id
         or prior_signed_result.outcome_status is distinct from outcome_value
         or prior_signed_result.evidence_fingerprint is distinct from
           result_fingerprint_value
      then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_SIGNED_RESULT_IDEMPOTENCY_CONFLICT';
      end if;
      signed_result := prior_signed_result;
    else
      insert into production_control.vercel_writer_critical_waf_dispatch_results (
        result_id, dispatch_id, epoch_id, provider_result_schema,
        outcome_status, dispatch_step, result_evidence_id,
        dispatch_request_id, transition_request_id,
        signed_request_fingerprint, evidence_fingerprint,
        signer_key_fingerprint, signer_key_version, purpose, transition_mode,
        vercel_project_id, vercel_team_id, candidate_alias_origin,
        candidate_immutable_origin, candidate_deployment_id,
        candidate_commit_sha, candidate_deployment_target,
        baseline_evidence_id,
        baseline_configuration_version, baseline_configuration_etag,
        baseline_configuration_identity_fingerprint,
        baseline_semantic_configuration_fingerprint,
        baseline_ordered_rules_fingerprint,
        baseline_source_version_read_fingerprint, provider_intent_fingerprint,
        provider_response_observed, provider_response_status,
        provider_response_fingerprint, provider_readback_fingerprint,
        active_semantic_configuration,
        active_semantic_configuration_fingerprint, active_custom_rule_count,
        active_pending_draft_present, draft_semantic_configuration,
        draft_semantic_configuration_fingerprint,
        draft_ordered_rules_fingerprint, draft_configuration_version,
        draft_configuration_identity_fingerprint, draft_custom_rule_count,
        pending_draft_change_count, run_owned_rule_name,
        run_owned_rule_nonce, provider_assigned_rule_id,
        run_owned_rule_fingerprint, run_owned_insert_document_fingerprint,
        run_owned_provider_rule_document_fingerprint,
        run_owned_rule_precedence, critical_window_contract_fingerprint,
        provider_observed_at, attested_at, expires_at
      ) values (
        extensions.gen_random_uuid(), dispatch.dispatch_id, epoch.epoch_id,
        verified_dispatch_result->>'schemaVersion', outcome_value,
        dispatch.dispatch_step,
        (verified_dispatch_result->>'dispatchResultId')::uuid,
        dispatch.dispatch_request_id, dispatch.transition_request_id,
        pg_catalog.lower(verified_dispatch_result->>'requestFingerprint'),
        result_fingerprint_value,
        pg_catalog.lower(verified_dispatch_result->>'signerKeyFingerprint'),
        verified_dispatch_result->>'signerKeyVersion', epoch.purpose,
        epoch.transition_mode,
        epoch.vercel_project_id, epoch.vercel_team_id,
        epoch.candidate_alias_origin, epoch.candidate_immutable_origin,
        epoch.candidate_deployment_id, epoch.candidate_deployment_commit,
        epoch.candidate_deployment_target,
        baseline_observation.provider_evidence_id,
        epoch.baseline_active_config_version,
        epoch.baseline_active_config_etag,
        epoch.baseline_configuration_identity_fingerprint,
        epoch.baseline_semantic_configuration_fingerprint,
        epoch.baseline_ordered_rules_fingerprint,
        epoch.baseline_source_version_read_fingerprint,
        dispatch.provider_intent_fingerprint,
        (verified_dispatch_result->>'providerResponseObserved')::boolean,
        nullif(
          verified_dispatch_result->>'providerResponseStatus', ''
        )::integer,
        nullif(pg_catalog.lower(
          verified_dispatch_result->>'providerResponseFingerprint'
        ), ''),
        nullif(pg_catalog.lower(
          verified_dispatch_result->>'providerReadbackFingerprint'
        ), ''),
        case when pg_catalog.jsonb_typeof(
          verified_dispatch_result->'activeSemanticConfiguration'
        ) = 'object'
          then verified_dispatch_result->'activeSemanticConfiguration'
          else null end,
        nullif(pg_catalog.lower(
          verified_dispatch_result->>'activeSemanticConfigurationFingerprint'
        ), ''),
        nullif(
          verified_dispatch_result->>'activeCustomRuleCount', ''
        )::integer,
        nullif(
          verified_dispatch_result->>'activePendingDraftPresent', ''
        )::boolean,
        case when pg_catalog.jsonb_typeof(
          verified_dispatch_result->'draftSemanticConfiguration'
        ) = 'object'
          then verified_dispatch_result->'draftSemanticConfiguration'
          else null end,
        nullif(pg_catalog.lower(
          verified_dispatch_result->>'draftSemanticConfigurationFingerprint'
        ), ''),
        nullif(pg_catalog.lower(
          verified_dispatch_result->>'draftOrderedCustomRulesFingerprint'
        ), ''),
        nullif(verified_dispatch_result->>'draftConfigurationVersion', ''),
        nullif(pg_catalog.lower(
          verified_dispatch_result
            ->>'draftConfigurationIdentityFingerprint'
        ), ''),
        nullif(
          verified_dispatch_result->>'draftCustomRuleCount', ''
        )::integer,
        nullif(
          verified_dispatch_result->>'pendingDraftChangeCount', ''
        )::integer,
        epoch.run_owned_rule_name, epoch.run_owned_rule_nonce,
        nullif(verified_dispatch_result->>'providerAssignedRuleId', ''),
        epoch.run_owned_rule_fingerprint,
        epoch.run_owned_insert_document_fingerprint,
        nullif(pg_catalog.lower(
          verified_dispatch_result
            ->>'runOwnedProviderRuleDocumentFingerprint'
        ), ''),
        nullif(
          verified_dispatch_result->>'runOwnedRulePrecedence', ''
        )::integer,
        nullif(pg_catalog.lower(
          verified_dispatch_result->>'criticalWindowContractFingerprint'
        ), ''),
        provider_observed, attested, expires
      ) returning * into signed_result;
    end if;
  end if;

  if dispatch.status in (
    'TARGET_CONFIRMED', 'OUTCOME_UNKNOWN', 'PROVIDER_REJECTED'
  ) then
    if dispatch.status = outcome_value
       and dispatch.provider_result_fingerprint = result_fingerprint_value
    then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'contract_version', 'CRITICAL_WINDOW_WAF_V1',
        'epoch_id', epoch.epoch_id, 'dispatch_id', dispatch.dispatch_id,
        'dispatch_request_id', dispatch.dispatch_request_id,
        'transition_request_id', dispatch.transition_request_id,
        'dispatch_step', dispatch.dispatch_step,
        'transition_mode', epoch.transition_mode,
        'outcome_status', dispatch.status,
        'provider_result_observation_id',
          dispatch.provider_result_observation_id,
        'provider_dispatch_result_id', dispatch.provider_dispatch_result_id,
        'status', epoch.status, 'idempotent', true
      );
    end if;
    if dispatch.status is distinct from 'OUTCOME_UNKNOWN'
       or outcome_value is distinct from 'TARGET_CONFIRMED'
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_RESULT_CONFLICT';
    end if;
  elsif dispatch.status is distinct from 'PROVIDER_MUTATING' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_RESULT_NOT_RECORDABLE';
  end if;

  if outcome_value = 'OUTCOME_UNKNOWN' then
    if signed_result.result_id is null then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_UNKNOWN_PROOF_REQUIRED';
    end if;
    update production_control.vercel_writer_critical_waf_dispatches
    set status = 'OUTCOME_UNKNOWN',
        provider_dispatch_result_id = signed_result.result_id,
        provider_result_fingerprint = result_fingerprint_value,
        provider_observed_at = provider_observed,
        recorded_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where dispatch_id = dispatch.dispatch_id
    returning * into dispatch;
  elsif outcome_value = 'PROVIDER_REJECTED' then
    if signed_result.result_id is null
       or signed_result.outcome_status is distinct from 'PROVIDER_REJECTED'
       or not signed_result.provider_response_observed
       or signed_result.provider_response_status not between 400 and 599
       or signed_result.provider_response_fingerprint is null
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_REJECTION_PROOF_REQUIRED';
    end if;
    update production_control.vercel_writer_critical_waf_dispatches
    set status = 'PROVIDER_REJECTED',
        provider_dispatch_result_id = signed_result.result_id,
        provider_result_fingerprint = result_fingerprint_value,
        provider_observed_at = provider_observed,
        recorded_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where dispatch_id = dispatch.dispatch_id
    returning * into dispatch;
  elsif dispatch.dispatch_step = 'CRITICAL_RULE_INSERT' then
    if signed_result.result_id is null
       or signed_result.outcome_status is distinct from 'TARGET_CONFIRMED'
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_RULE_INSERT_TARGET_REQUIRED';
    end if;
    update production_control.vercel_writer_critical_waf_epochs
    set provider_assigned_rule_id = signed_result.provider_assigned_rule_id,
        updated_at = pg_catalog.clock_timestamp()
    where epoch_id = epoch.epoch_id
      and status = 'ACTIVATION_PENDING'
      and provider_assigned_rule_id is null
    returning * into epoch;
    if not found then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_RULE_ID_CAPTURE_RACE';
    end if;
    update production_control.vercel_writer_critical_waf_dispatches
    set status = 'TARGET_CONFIRMED',
        provider_dispatch_result_id = signed_result.result_id,
        provider_result_fingerprint = result_fingerprint_value,
        provider_observed_at = provider_observed,
        recorded_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where dispatch_id = dispatch.dispatch_id
    returning * into dispatch;
  else
    if pg_catalog.jsonb_typeof(verified_waf_evidence) is distinct from 'object'
       or coalesce(input->>'observation_request_id', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or verified_waf_evidence->>'transitionRequestId' is distinct from
         dispatch.transition_request_id::text
    then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_TARGET_EVIDENCE_REQUIRED';
    end if;
    expected_stage := case dispatch.dispatch_step
      when 'CRITICAL_DRAFT_ACTIVATE' then 'CRITICAL_ACTIVE'
      when 'BASELINE_VERSION_ACTIVATE' then 'BASELINE_RESTORED'
      else null end;
    observation :=
      production_control.insert_vercel_writer_critical_waf_observation(
        epoch.epoch_id, verified_waf_evidence,
        (input->>'observation_request_id')::uuid,
        pg_catalog.lower(input->>'request_fingerprint'), payload_hash_value
      );
    if observation.evidence_stage is distinct from expected_stage then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_RESULT_STAGE_MISMATCH';
    end if;
    update production_control.vercel_writer_critical_waf_dispatches
    set status = 'TARGET_CONFIRMED',
        provider_result_observation_id = observation.observation_id,
        provider_dispatch_result_id = null,
        provider_result_fingerprint = result_fingerprint_value,
        provider_observed_at = observation.provider_observed_at,
        recorded_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where dispatch_id = dispatch.dispatch_id
    returning * into dispatch;

    if dispatch.dispatch_step = 'CRITICAL_DRAFT_ACTIVATE' then
      update production_control.vercel_writer_critical_waf_epochs
      set status = 'ACTIVE_UNBOUND',
          critical_active_observation_id = observation.observation_id,
          latest_critical_reattest_observation_id = observation.observation_id,
          critical_semantic_configuration_fingerprint =
            observation.semantic_configuration_fingerprint,
          critical_active_at = observation.provider_observed_at,
          updated_at = pg_catalog.clock_timestamp()
      where epoch_id = epoch.epoch_id
        and status = 'ACTIVATION_PENDING'
      returning * into epoch;
    else
      update production_control.vercel_writer_critical_waf_epochs
      set status = 'BASELINE_RESTORED',
          baseline_restored_observation_id = observation.observation_id,
          baseline_restored_at = observation.provider_observed_at,
          updated_at = pg_catalog.clock_timestamp()
      where epoch_id = epoch.epoch_id
        and status = 'RESTORE_PENDING'
      returning * into epoch;
    end if;
    if epoch.epoch_id is null then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_RESULT_STATE_RACE';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'contract_version', 'CRITICAL_WINDOW_WAF_V1',
    'epoch_id', epoch.epoch_id, 'dispatch_id', dispatch.dispatch_id,
    'dispatch_request_id', dispatch.dispatch_request_id,
    'transition_request_id', dispatch.transition_request_id,
    'dispatch_step', dispatch.dispatch_step,
    'transition_mode', epoch.transition_mode,
    'outcome_status', dispatch.status,
    'provider_result_observation_id', dispatch.provider_result_observation_id,
    'provider_dispatch_result_id', dispatch.provider_dispatch_result_id,
    'provider_result_fingerprint', dispatch.provider_result_fingerprint,
    'provider_observed_at', dispatch.provider_observed_at,
    'status', epoch.status,
    'critical_window_active', epoch.status in (
      'ACTIVE_UNBOUND', 'FENCE_BOUND', 'RESTORE_PENDING'
    ),
    'baseline_restored', epoch.status = 'BASELINE_RESTORED',
    'idempotent', false
  );
end;
$$;

create or replace function public.record_production_vercel_writer_critical_waf_reattestation(
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
  observation production_control.vercel_writer_critical_waf_observations%rowtype;
  verified_evidence jsonb := input->'verified_waf_evidence';
begin
  if input->>'operation' is distinct from
       'RECORD_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_REATTESTATION'
     or coalesce(input->>'epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.jsonb_typeof(verified_evidence) is distinct from 'object'
     or coalesce(input->>'observation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_REATTEST_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict epoch
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_id = (input->>'epoch_id')::uuid
  for update;
  if epoch.status is distinct from 'FENCE_BOUND' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_REATTEST_STATE_INVALID';
  end if;
  observation :=
    production_control.insert_vercel_writer_critical_waf_observation(
      epoch.epoch_id, verified_evidence,
      (input->>'observation_request_id')::uuid,
      pg_catalog.lower(input->>'request_fingerprint'),
      production_control.cutover_payload_hash(input)
    );
  if observation.evidence_stage is distinct from 'CRITICAL_REATTEST' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_REATTEST_STAGE_INVALID';
  end if;
  update production_control.vercel_writer_critical_waf_epochs
  set latest_critical_reattest_observation_id = observation.observation_id,
      updated_at = pg_catalog.clock_timestamp()
  where epoch_id = epoch.epoch_id
  returning * into epoch;
  return production_control.vercel_writer_critical_waf_epoch_response(
    epoch, false
  ) || pg_catalog.jsonb_build_object(
    'critical_reattest_observation_id', observation.observation_id,
    'provider_observed_at', observation.provider_observed_at,
    'expires_at', observation.expires_at
  );
end;
$$;

-- Preserve both historical receipt epochs while admitting one exact new
-- v4/v4 branch. No historical row is rewritten to satisfy these constraints.
--
-- The credential-v4 evidence fingerprint transitively binds the immutable
-- step11-6-vercel-environment-resource-review-v1 provider review: 121 provider
-- environment records, zero hidden Production records, 12 reviewed records,
-- reviewed-records fingerprint
-- b7d8cdd805ecbaa05b39b71aec9d904b3df8a0077a38e2adc8762312d3cf4d8a,
-- and review fingerprint
-- eae8a72c03308c75d8eea8b330e798b316842a6a3f05791c7acec1f0f1a2dd54,
-- including owner-certified continuity baseline fingerprint
-- a5507591c0c3577e9638a8193706b689a7e6da902e6f6216b829df1d4be4254b.
-- The signed redacted_environment_scope_fingerprint independently hashes the
-- provider count, hidden count, exact review fingerprints, and redacted scope
-- records. Migration039 already requires that fingerprint on reservation,
-- persists it, and exact-compares BEGIN against FINALIZE. Keeping the SQL
-- claim fingerprint-only avoids duplicating provider metadata while preserving
-- fail-closed, signed, immutable review binding.
alter table production_control.vercel_writer_quiesce_evidence
  drop constraint production_vercel_quiesce_inventory_contract_check;

alter table production_control.vercel_writer_quiesce_evidence
  add constraint production_vercel_quiesce_inventory_contract_check check (
    origin_inventory_count = pg_catalog.jsonb_array_length(origin_inventory)
    and origin_inventory_fingerprint =
      production_control.vercel_origin_inventory_fingerprint(origin_inventory)
    and live_origin_inventory_count =
      pg_catalog.jsonb_array_length(live_origin_inventory)
    and live_origin_inventory_fingerprint =
      production_control.vercel_origin_inventory_fingerprint(
        live_origin_inventory
      )
    and (
      (
        origin_inventory_count = 1140
        and origin_inventory_fingerprint =
          '533178a28a5458c5f2f727b77af3024de4cc0402c49e90dcd763b950d26fb4c6'
        and credential_confinement_evidence_schema =
          'step11-6-production-google-credential-confinement-v1'
        and credential_confinement_record_count = 1140
        and credential_confinement_records_fingerprint =
          'c63962703a60745786ffce2e43e9fef5fa38e12746fce5627f33bfde92c8f508'
        and credential_confinement_evidence_fingerprint =
          '1d6f4203fc56226ba4f6881339e9b2dfcede0e413485a110785d28e066a569df'
        and provider_inventory_schema is null
        and retained_provider_inventory_count is null
        and retained_provider_inventory_fingerprint is null
        and live_provider_inventory_count is null
        and live_provider_inventory_fingerprint is null
        and routing_rule_all_method_fence_required_host_count is null
        and routing_rule_all_method_fence_required_hosts_fingerprint is null
        and routing_rule_all_method_fence_required_path_count is null
        and routing_rule_all_method_fence_required_paths_fingerprint is null
      )
      or (
        origin_inventory_count = 1291
        and origin_inventory_fingerprint =
          'd238c5eeefef4606e0a05c2d0dbcee1a2b29cd07a2dd480435c0e75a0c3a91a6'
        and credential_confinement_evidence_schema =
          'step11-6-production-google-credential-confinement-v2'
        and credential_confinement_record_count = 1291
        and credential_confinement_records_fingerprint =
          '9ce65239f41086f56ea126e2491afe36ae90e85172a8536706f549912b27979b'
        and credential_confinement_evidence_fingerprint =
          '071ca9163f6a1033e17136ace4c82b3163aa7a1c29900300ddafeeda5b7bb133'
        and provider_inventory_schema =
          'step11-6-production-origin-inventory-v3'
        and provider_inventory_schema is not null
        and retained_provider_inventory_count = 1291
        and retained_provider_inventory_count is not null
        and retained_provider_inventory_fingerprint =
          '6488da5c86e50bd0c524a94a8c8f97c1aeb8576393fc14d68a7bd76ebe338692'
        and retained_provider_inventory_fingerprint is not null
        and live_provider_inventory_count = live_origin_inventory_count
        and live_provider_inventory_count is not null
        and live_origin_inventory_count in (1291, 1292)
        and live_provider_inventory_fingerprint is not null
        and live_provider_inventory_fingerprint ~ '^[0-9a-f]{64}$'
        and routing_rule_all_method_fence_required_host_count is not null
        and routing_rule_all_method_fence_required_host_count = 8
        and routing_rule_all_method_fence_required_hosts_fingerprint is not null
        and routing_rule_all_method_fence_required_hosts_fingerprint =
          '62f14a6635bc9ec16ce681e04b17bbd0f39e9ff55a858bbcb75f4aa75bc3bc4d'
        and routing_rule_all_method_fence_required_path_count is not null
        and routing_rule_all_method_fence_required_path_count = 1
        and routing_rule_all_method_fence_required_paths_fingerprint is not null
        and routing_rule_all_method_fence_required_paths_fingerprint =
          'fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa'
      )
      or (
        origin_inventory_count = 1292
        and origin_inventory_fingerprint =
          '9d25299c72424a2b5c3c613649b7f07760fda64c0b0bb4823edaf2cd91622774'
        and credential_confinement_evidence_schema =
          'step11-6-production-google-credential-confinement-v3'
        and credential_confinement_record_count = 1292
        and credential_confinement_records_fingerprint =
          '7549a25c6cbdcec38ea0f331c8aff344cfee837a916ac8871fb5a4956f67838e'
        and credential_confinement_evidence_fingerprint =
          '0c392e1b369d43c5c117716e6b00d3050ab1c8a9fc79b22df43050d0a7c7fb11'
        and provider_inventory_schema =
          'step11-6-production-origin-inventory-v4'
        and provider_inventory_schema is not null
        and retained_provider_inventory_count = 1292
        and retained_provider_inventory_count is not null
        and retained_provider_inventory_fingerprint =
          'abd27e4e2747c17053f6debf71ec0f523d39fea8e2383d4911f9dc4b87959cbe'
        and retained_provider_inventory_fingerprint is not null
        and live_provider_inventory_count = live_origin_inventory_count
        and live_provider_inventory_count is not null
        and live_origin_inventory_count in (1292, 1293)
        and live_provider_inventory_fingerprint is not null
        and live_provider_inventory_fingerprint ~ '^[0-9a-f]{64}$'
        and routing_rule_all_method_fence_required_host_count is not null
        and routing_rule_all_method_fence_required_host_count = 8
        and routing_rule_all_method_fence_required_hosts_fingerprint is not null
        and routing_rule_all_method_fence_required_hosts_fingerprint =
          '62f14a6635bc9ec16ce681e04b17bbd0f39e9ff55a858bbcb75f4aa75bc3bc4d'
        and routing_rule_all_method_fence_required_path_count is not null
        and routing_rule_all_method_fence_required_path_count = 1
        and routing_rule_all_method_fence_required_paths_fingerprint is not null
        and routing_rule_all_method_fence_required_paths_fingerprint =
          'fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa'
      )
      or (
        origin_inventory_count = 1292
        and origin_inventory_fingerprint =
          '9d25299c72424a2b5c3c613649b7f07760fda64c0b0bb4823edaf2cd91622774'
        and credential_confinement_evidence_schema =
          'step11-6-production-google-credential-confinement-v4'
        and credential_confinement_record_count = 1292
        and credential_confinement_records_fingerprint =
          '7549a25c6cbdcec38ea0f331c8aff344cfee837a916ac8871fb5a4956f67838e'
        and credential_confinement_evidence_fingerprint =
          '6f468334a508553cdb9230c14ad85969c89169df6a2ec88011fb2e7e30c9656a'
        and provider_inventory_schema =
          'step11-6-production-origin-inventory-v4'
        and provider_inventory_schema is not null
        and retained_provider_inventory_count = 1292
        and retained_provider_inventory_count is not null
        and retained_provider_inventory_fingerprint =
          'abd27e4e2747c17053f6debf71ec0f523d39fea8e2383d4911f9dc4b87959cbe'
        and retained_provider_inventory_fingerprint is not null
        and live_provider_inventory_count = live_origin_inventory_count
        and live_provider_inventory_count is not null
        and live_origin_inventory_count in (1292, 1293)
        and live_provider_inventory_fingerprint is not null
        and live_provider_inventory_fingerprint ~ '^[0-9a-f]{64}$'
        and routing_rule_all_method_fence_required_host_count is not null
        and routing_rule_all_method_fence_required_host_count = 9
        and routing_rule_all_method_fence_required_hosts_fingerprint is not null
        and routing_rule_all_method_fence_required_hosts_fingerprint =
          '0423e6a742d6527b10afc071856dbc6c5b1cca5e1ffb09a5d2523d0f04b31c0c'
        and routing_rule_all_method_fence_required_path_count is not null
        and routing_rule_all_method_fence_required_path_count = 1
        and routing_rule_all_method_fence_required_paths_fingerprint is not null
        and routing_rule_all_method_fence_required_paths_fingerprint =
          'fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa'
      )
    )
  );

alter table production_control.vercel_provider_attestations
  drop constraint production_vercel_provider_attestation_inventory_contract_check;

alter table production_control.vercel_provider_attestations
  add constraint production_vercel_provider_attestation_inventory_contract_check check (
    live_origin_inventory_count =
      pg_catalog.jsonb_array_length(live_origin_inventory)
    and live_origin_inventory_fingerprint =
      production_control.vercel_origin_inventory_fingerprint(
        live_origin_inventory
      )
    and (
      (
        credential_confinement_evidence_schema =
          'step11-6-production-google-credential-confinement-v1'
        and credential_confinement_record_count = 1140
        and credential_confinement_records_fingerprint =
          'c63962703a60745786ffce2e43e9fef5fa38e12746fce5627f33bfde92c8f508'
        and credential_confinement_evidence_fingerprint =
          '1d6f4203fc56226ba4f6881339e9b2dfcede0e413485a110785d28e066a569df'
        and provider_inventory_schema is null
        and retained_origin_inventory_count is null
        and retained_origin_inventory_fingerprint is null
        and retained_provider_inventory_count is null
        and retained_provider_inventory_fingerprint is null
        and live_provider_inventory_count is null
        and live_provider_inventory_fingerprint is null
        and routing_rule_all_method_fence_required_host_count is null
        and routing_rule_all_method_fence_required_hosts_fingerprint is null
        and routing_rule_all_method_fence_required_path_count is null
        and routing_rule_all_method_fence_required_paths_fingerprint is null
      )
      or (
        credential_confinement_evidence_schema =
          'step11-6-production-google-credential-confinement-v2'
        and credential_confinement_record_count = 1291
        and credential_confinement_records_fingerprint =
          '9ce65239f41086f56ea126e2491afe36ae90e85172a8536706f549912b27979b'
        and credential_confinement_evidence_fingerprint =
          '071ca9163f6a1033e17136ace4c82b3163aa7a1c29900300ddafeeda5b7bb133'
        and provider_inventory_schema =
          'step11-6-production-origin-inventory-v3'
        and provider_inventory_schema is not null
        and retained_origin_inventory_count = 1291
        and retained_origin_inventory_count is not null
        and retained_origin_inventory_fingerprint =
          'd238c5eeefef4606e0a05c2d0dbcee1a2b29cd07a2dd480435c0e75a0c3a91a6'
        and retained_origin_inventory_fingerprint is not null
        and retained_provider_inventory_count = 1291
        and retained_provider_inventory_count is not null
        and retained_provider_inventory_fingerprint =
          '6488da5c86e50cbd0c524a94a8c8f97c1aeb8576393fc14d68a7bd76ebe338692'
        and retained_provider_inventory_fingerprint is not null
        and live_provider_inventory_count = live_origin_inventory_count
        and live_provider_inventory_count is not null
        and live_origin_inventory_count in (1291, 1292)
        and live_provider_inventory_fingerprint is not null
        and live_provider_inventory_fingerprint ~ '^[0-9a-f]{64}$'
        and routing_rule_all_method_fence_required_host_count is not null
        and routing_rule_all_method_fence_required_host_count = 8
        and routing_rule_all_method_fence_required_hosts_fingerprint is not null
        and routing_rule_all_method_fence_required_hosts_fingerprint =
          '62f14a6635bc9ec16ce681e04b17bbd0f39e9ff55a858bbcb75f4aa75bc3bc4d'
        and routing_rule_all_method_fence_required_path_count is not null
        and routing_rule_all_method_fence_required_path_count = 1
        and routing_rule_all_method_fence_required_paths_fingerprint is not null
        and routing_rule_all_method_fence_required_paths_fingerprint =
          'fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa'
      )
      or (
        credential_confinement_evidence_schema =
          'step11-6-production-google-credential-confinement-v3'
        and credential_confinement_record_count = 1292
        and credential_confinement_records_fingerprint =
          '7549a25c6cbdcec38ea0f331c8aff344cfee837a916ac8871fb5a4956f67838e'
        and credential_confinement_evidence_fingerprint =
          '0c392e1b369d43c5c117716e6b00d3050ab1c8a9fc79b22df43050d0a7c7fb11'
        and provider_inventory_schema =
          'step11-6-production-origin-inventory-v4'
        and provider_inventory_schema is not null
        and retained_origin_inventory_count = 1292
        and retained_origin_inventory_count is not null
        and retained_origin_inventory_fingerprint =
          '9d25299c72424a2b5c3c613649b7f07760fda64c0b0bb4823edaf2cd91622774'
        and retained_origin_inventory_fingerprint is not null
        and retained_provider_inventory_count = 1292
        and retained_provider_inventory_count is not null
        and retained_provider_inventory_fingerprint =
          'abd27e4e2747c17053f6debf71ec0f523d39fea8e2383d4911f9dc4b87959cbe'
        and retained_provider_inventory_fingerprint is not null
        and live_provider_inventory_count = live_origin_inventory_count
        and live_provider_inventory_count is not null
        and live_origin_inventory_count in (1292, 1293)
        and live_provider_inventory_fingerprint is not null
        and live_provider_inventory_fingerprint ~ '^[0-9a-f]{64}$'
        and routing_rule_all_method_fence_required_host_count is not null
        and routing_rule_all_method_fence_required_host_count = 8
        and routing_rule_all_method_fence_required_hosts_fingerprint is not null
        and routing_rule_all_method_fence_required_hosts_fingerprint =
          '62f14a6635bc9ec16ce681e04b17bbd0f39e9ff55a858bbcb75f4aa75bc3bc4d'
        and routing_rule_all_method_fence_required_path_count is not null
        and routing_rule_all_method_fence_required_path_count = 1
        and routing_rule_all_method_fence_required_paths_fingerprint is not null
        and routing_rule_all_method_fence_required_paths_fingerprint =
          'fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa'
      )
      or (
        credential_confinement_evidence_schema =
          'step11-6-production-google-credential-confinement-v4'
        and credential_confinement_record_count = 1292
        and credential_confinement_records_fingerprint =
          '7549a25c6cbdcec38ea0f331c8aff344cfee837a916ac8871fb5a4956f67838e'
        and credential_confinement_evidence_fingerprint =
          '6f468334a508553cdb9230c14ad85969c89169df6a2ec88011fb2e7e30c9656a'
        and provider_inventory_schema =
          'step11-6-production-origin-inventory-v4'
        and provider_inventory_schema is not null
        and retained_origin_inventory_count = 1292
        and retained_origin_inventory_count is not null
        and retained_origin_inventory_fingerprint =
          '9d25299c72424a2b5c3c613649b7f07760fda64c0b0bb4823edaf2cd91622774'
        and retained_origin_inventory_fingerprint is not null
        and retained_provider_inventory_count = 1292
        and retained_provider_inventory_count is not null
        and retained_provider_inventory_fingerprint =
          'abd27e4e2747c17053f6debf71ec0f523d39fea8e2383d4911f9dc4b87959cbe'
        and retained_provider_inventory_fingerprint is not null
        and live_provider_inventory_count = live_origin_inventory_count
        and live_provider_inventory_count is not null
        and live_origin_inventory_count in (1292, 1293)
        and live_provider_inventory_fingerprint is not null
        and live_provider_inventory_fingerprint ~ '^[0-9a-f]{64}$'
        and routing_rule_all_method_fence_required_host_count is not null
        and routing_rule_all_method_fence_required_host_count = 9
        and routing_rule_all_method_fence_required_hosts_fingerprint is not null
        and routing_rule_all_method_fence_required_hosts_fingerprint =
          '0423e6a742d6527b10afc071856dbc6c5b1cca5e1ffb09a5d2523d0f04b31c0c'
        and routing_rule_all_method_fence_required_path_count is not null
        and routing_rule_all_method_fence_required_path_count = 1
        and routing_rule_all_method_fence_required_paths_fingerprint is not null
        and routing_rule_all_method_fence_required_paths_fingerprint =
          'fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa'
      )
    )
  );

create or replace function production_control.assert_current_provider_inventory_v4(
  input jsonb,
  include_retained_origin boolean,
  include_routing_rule boolean
)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
begin
  if include_retained_origin is null
     or include_routing_rule is null
     or pg_catalog.jsonb_typeof(input) is distinct from 'object'
     or input->>'provider_inventory_schema' is distinct from
       'step11-6-production-origin-inventory-v4'
     or pg_catalog.jsonb_typeof(
       input->'retained_provider_inventory_count'
     ) is distinct from 'number'
     or input->>'retained_provider_inventory_count' is distinct from '1292'
     or input->>'retained_provider_inventory_fingerprint' is distinct from
       'abd27e4e2747c17053f6debf71ec0f523d39fea8e2383d4911f9dc4b87959cbe'
     or pg_catalog.jsonb_typeof(
       input->'live_provider_inventory_count'
     ) is distinct from 'number'
     or input->>'live_provider_inventory_count' not in ('1292', '1293')
     or coalesce(input->>'live_provider_inventory_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or input->>'credential_confinement_evidence_schema' is distinct from
       'step11-6-production-google-credential-confinement-v4'
     or pg_catalog.jsonb_typeof(
       input->'credential_confinement_record_count'
     ) is distinct from 'number'
     or input->>'credential_confinement_record_count' is distinct from '1292'
     or input->>'credential_confinement_records_fingerprint' is distinct from
       '7549a25c6cbdcec38ea0f331c8aff344cfee837a916ac8871fb5a4956f67838e'
     or input->>'credential_confinement_evidence_fingerprint' is distinct from
       '6f468334a508553cdb9230c14ad85969c89169df6a2ec88011fb2e7e30c9656a'
     or (include_retained_origin and (
       pg_catalog.jsonb_typeof(
         input->'retained_origin_inventory_count'
       ) is distinct from 'number'
       or input->>'retained_origin_inventory_count' is distinct from '1292'
       or input->>'retained_origin_inventory_fingerprint' is distinct from
         '9d25299c72424a2b5c3c613649b7f07760fda64c0b0bb4823edaf2cd91622774'
     ))
     or (include_routing_rule and (
       pg_catalog.jsonb_typeof(
         input->'routing_rule_all_method_fence_required_host_count'
       ) is distinct from 'number'
       or input->>'routing_rule_all_method_fence_required_host_count'
         is distinct from '9'
       or input->>'routing_rule_all_method_fence_required_hosts_fingerprint'
         is distinct from
           '0423e6a742d6527b10afc071856dbc6c5b1cca5e1ffb09a5d2523d0f04b31c0c'
       or pg_catalog.jsonb_typeof(
         input->'routing_rule_all_method_fence_required_path_count'
       ) is distinct from 'number'
       or input->>'routing_rule_all_method_fence_required_path_count'
         is distinct from '1'
       or input->>'routing_rule_all_method_fence_required_paths_fingerprint'
         is distinct from
           'fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa'
     )) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_PROVIDER_INVENTORY_V4_BINDING_MISMATCH';
  end if;
end;
$$;

revoke all on function production_control.assert_current_provider_inventory_v4(
  jsonb, boolean, boolean
) from public, anon, authenticated, service_role;

-- Keep the migration039 function signature used by active runtime callers,
-- but make its effective epoch singular: every new mutation must carry v4/v4
-- evidence. Historical v3/v2 receipts remain preserved by the table CHECK
-- branches above and are available only for read-only inspection.
create or replace function production_control.assert_current_provider_inventory_v3(
  input jsonb,
  include_retained_origin boolean,
  include_routing_rule boolean
)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
begin
  perform production_control.assert_current_provider_inventory_v4(
    input, include_retained_origin, include_routing_rule
  );
end;
$$;

revoke all on function production_control.assert_current_provider_inventory_v3(
  jsonb, boolean, boolean
) from public, anon, authenticated, service_role;

create or replace function production_control.assert_exact_vercel_origin_inventory(
  input jsonb
)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  normalized jsonb;
  record_count integer;
begin
  if pg_catalog.jsonb_typeof(input) is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_ORIGIN_INVENTORY_ARRAY_REQUIRED';
  end if;
  normalized := production_control.normalized_vercel_origin_inventory(input);
  record_count := pg_catalog.jsonb_array_length(normalized);
  if normalized is distinct from input
     or record_count <> 1292
     or (select pg_catalog.count(distinct value->>0)
       from pg_catalog.jsonb_array_elements(normalized) value) <> record_count
     or (select pg_catalog.count(distinct value->>2)
       from pg_catalog.jsonb_array_elements(normalized) value) <> record_count
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(normalized) value
       where pg_catalog.jsonb_typeof(value) is distinct from 'array'
         or pg_catalog.jsonb_array_length(value) <> 6
         or coalesce(value->>0, '') !~ '^dpl_[A-Za-z0-9]{8,64}$'
         or (value->1 <> 'null'::jsonb
           and coalesce(value->>1, '') !~ '^[0-9a-f]{40}$')
         or coalesce(value->>2, '') !~ '^https://[a-z0-9.-]+$'
         or value->>3 not in ('PRODUCTION_TARGET', 'PROJECT_PREVIEW')
         or value->>4 not in ('READY', 'ERROR', 'BLOCKED')
         or coalesce(value->>5, '') !~ '^[0-9a-f]{64}$'
     )
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized) value
       where value->>3 = 'PRODUCTION_TARGET') <> 458
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized) value
       where value->>3 = 'PROJECT_PREVIEW') <> 834
     or not (normalized @> pg_catalog.jsonb_build_array(
       '["dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2","561a61946be3536c7e32b46be53e4683cbb45579","https://bagger-drmix94o0-sandbagger-invitational.vercel.app","PRODUCTION_TARGET","READY","0383e746abde16275626a8bcd41a38853eb9fe6e2cb036ef7658d21c23d9f5e8"]'::jsonb
     ))
     or not (normalized @> pg_catalog.jsonb_build_array(
       '["dpl_CBgDhovX4cfQx15EJWWvm6Kti25j","be5531faca009e26617496e47831f365a1b4997b","https://bagger-mribo6cqh-sandbagger-invitational.vercel.app","PROJECT_PREVIEW","READY","0c8b213bcad5397731982762bf178cc961254b79a6be5a3b75e71e547ef9dc71"]'::jsonb
     ))
     or not (normalized @> pg_catalog.jsonb_build_array(
       '["dpl_2oK3GmMa8f93wqjHNp1Gp2Y6Paox","a0b79cdef3a34d640e9411035792bd1e91989566","https://bagger-pmt7catuz-sandbagger-invitational.vercel.app","PROJECT_PREVIEW","READY","acb7fa3de11c8e6e5704c41a22b1693b42428b7b70c1d9ed73763ea6330ddb8e"]'::jsonb
     ))
     or not (normalized @> pg_catalog.jsonb_build_array(
       '["dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm","0671bb3b84ac5846218ea60838fe4e1cc07de97f","https://bagger-6lfjugfk7-sandbagger-invitational.vercel.app","PROJECT_PREVIEW","READY","23d503936f3f41ede80f5e03d7b5df423d43d120d88fbf5c2aeb781866628913"]'::jsonb
     ))
     or production_control.vercel_origin_inventory_fingerprint(normalized)
       is distinct from
         '9d25299c72424a2b5c3c613649b7f07760fda64c0b0bb4823edaf2cd91622774'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_ORIGIN_INVENTORY_MISMATCH';
  end if;
end;
$$;

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
  normalized_retained jsonb;
  normalized_live jsonb;
  retained_candidate_scope text;
  dynamic_candidate_scope text;
  retained_candidate_count integer;
  live_candidate_count integer;
  expected_count integer;
begin
  perform production_control.assert_exact_vercel_origin_inventory(
    retained_inventory
  );
  if candidate_deployment_target is distinct from 'PREVIEW'
     or coalesce(candidate_deployment_id, '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(candidate_deployment_commit, '') !~ '^[0-9a-f]{40}$'
     or coalesce(candidate_immutable_origin, '')
       !~ '^https://[a-z0-9.-]+$'
     or pg_catalog.jsonb_typeof(live_inventory) is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_INPUT_INVALID';
  end if;
  normalized_retained :=
    production_control.normalized_vercel_origin_inventory(retained_inventory);
  normalized_live :=
    production_control.normalized_vercel_origin_inventory(live_inventory);
  -- The authenticated control surface is deployment-bound Project Preview for
  -- every v4 transition mode. Production-target inventory remains retained as
  -- historical evidence, but it can never be selected as the live candidate.
  retained_candidate_scope := 'PROJECT_PREVIEW';
  dynamic_candidate_scope := 'PROJECT_PREVIEW';

  select pg_catalog.count(*)::integer
  into retained_candidate_count
  from pg_catalog.jsonb_array_elements(normalized_retained) value
  where value->>0 = candidate_deployment_id
    and value->>1 = pg_catalog.lower(candidate_deployment_commit)
    and value->>2 = pg_catalog.lower(pg_catalog.rtrim(
      candidate_immutable_origin, '/'
    ))
    and value->>3 = retained_candidate_scope
    and value->>4 = 'READY'
    and coalesce(value->>5, '') ~ '^[0-9a-f]{64}$';
  select pg_catalog.count(*)::integer
  into live_candidate_count
  from pg_catalog.jsonb_array_elements(normalized_live) value
  where value->>0 = candidate_deployment_id
    and value->>1 = pg_catalog.lower(candidate_deployment_commit)
    and value->>2 = pg_catalog.lower(pg_catalog.rtrim(
      candidate_immutable_origin, '/'
    ))
    and value->>3 = case when retained_candidate_count = 1
      then retained_candidate_scope else dynamic_candidate_scope end
    and value->>4 = 'READY'
    and coalesce(value->>5, '') ~ '^[0-9a-f]{64}$';
  expected_count := pg_catalog.jsonb_array_length(normalized_retained)
    + case when retained_candidate_count = 1 then 0 else 1 end;

  if normalized_live is distinct from live_inventory
     or retained_candidate_count not in (0, 1)
     or live_candidate_count <> 1
     or pg_catalog.jsonb_array_length(normalized_live) <> expected_count
     or (select pg_catalog.count(distinct value->>0)
       from pg_catalog.jsonb_array_elements(normalized_live) value) <>
       expected_count
     or (select pg_catalog.count(distinct value->>2)
       from pg_catalog.jsonb_array_elements(normalized_live) value) <>
       expected_count
     or exists (
       select value
       from pg_catalog.jsonb_array_elements(normalized_retained)
       except
       select value
       from pg_catalog.jsonb_array_elements(normalized_live)
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(normalized_live) live(record)
       where not exists (
         select 1
         from pg_catalog.jsonb_array_elements(normalized_retained) retained(record)
         where retained.record = live.record
       ) and not (
         live.record->>0 = candidate_deployment_id
         and live.record->>1 = pg_catalog.lower(candidate_deployment_commit)
         and live.record->>2 = pg_catalog.lower(pg_catalog.rtrim(
           candidate_immutable_origin, '/'
         ))
         and live.record->>3 = dynamic_candidate_scope
         and live.record->>4 = 'READY'
         and coalesce(live.record->>5, '') ~ '^[0-9a-f]{64}$'
       )
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH';
  end if;
end;
$$;

revoke all on function production_control.assert_exact_vercel_origin_inventory(
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function production_control.assert_exact_vercel_origin_inventory(
  jsonb
) to service_role;
revoke all on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) to service_role;

comment on function production_control.assert_current_provider_inventory_v4(
  jsonb, boolean, boolean
) is 'Fail-closed exact v4 retained-provider and v4 credential-evidence binding for the dormant Step 11.6 recertification epoch.';
comment on function production_control.assert_exact_vercel_origin_inventory(
  jsonb
) is 'Fail-closed exact 1,292-record v4 retained Vercel origin assertion; every historical deployment remains in scope.';
comment on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) is 'Fail-closed exact v4 retained Vercel inventory plus zero or one collision-free current candidate.';

-- The v4 provider rule excludes the canonical apex by construction
-- (hostname DOES_NOT_EQUAL baggerinv.com). Edge probes therefore cover each
-- immutable inventory origin plus www, the direct project hostname, main
-- branch alias, and candidate alias: live inventory + 4. The canonical apex
-- remains constrained by the independently certified Google protection set.
create or replace function production_control.assert_exact_vercel_probe_records(
  input jsonb,
  target_origin_inventory jsonb,
  target_main_branch_alias_origin text,
  target_candidate_alias_origin text,
  target_candidate_immutable_origin text,
  target_candidate_deployment_id text,
  target_candidate_commit text,
  target_candidate_deployment_target text,
  target_candidate_credential_generation text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  normalized jsonb;
  normalized_scope jsonb;
  expected_scope jsonb;
  expected_origin_count integer :=
    pg_catalog.jsonb_array_length(target_origin_inventory) + 4;
  expected_probe_vector_count integer := pg_catalog.jsonb_array_length(
    production_control.expected_vercel_quiesce_probe_vectors_v3()
  );
  expected_logical_probe_count integer :=
    expected_origin_count * expected_probe_vector_count;
begin
  if pg_catalog.jsonb_typeof(input) is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_PROBE_RECORDS_ARRAY_REQUIRED';
  end if;
  normalized := production_control.normalized_vercel_probe_records(input);
  normalized_scope := production_control.normalized_vercel_probe_scope(
    normalized
  );
  select coalesce(pg_catalog.jsonb_agg(record
      order by (record->>0) collate "C"), '[]'::jsonb)
  into expected_scope
  from (
    select pg_catalog.jsonb_build_array(
      item->2,
      case item->>3
        when 'PRODUCTION_TARGET' then 'IMMUTABLE_PRODUCTION_TARGET'
        when 'PROJECT_PREVIEW' then 'IMMUTABLE_PROJECT_PREVIEW'
      end,
      item->0, item->1,
      item->3, item->4, item->5,
      case
        when item->>0 = target_candidate_deployment_id
          and item->>2 = target_candidate_immutable_origin then
          '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1","PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb
        when item->>3 = 'PRODUCTION_TARGET' then
          '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb
        when item->>3 = 'PROJECT_PREVIEW' then
          '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1","POTENTIAL_PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb
      end,
      2047
    ) as record
    from pg_catalog.jsonb_array_elements(target_origin_inventory) item
    union all
    select value as record
    from pg_catalog.jsonb_array_elements(pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_array('https://www.baggerinv.com', 'FIXED_ALIAS',
        null, null, null, null, null, '[]'::jsonb, 2047),
      pg_catalog.jsonb_build_array('https://bagger-inv.vercel.app',
        'FIXED_ALIAS', null, null, null, null, null, '[]'::jsonb, 2047),
      pg_catalog.jsonb_build_array(target_main_branch_alias_origin,
        'FIXED_ALIAS', null, null, null, null, null, '[]'::jsonb, 2047),
      pg_catalog.jsonb_build_array(target_candidate_alias_origin,
        'CANDIDATE_ALIAS', target_candidate_deployment_id,
        target_candidate_commit, null, null, null,
        '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1","PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb,
        2047)
    )) value
  ) expected;
  if normalized is distinct from input
     or target_candidate_credential_generation is distinct from
       'DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1'
     or target_candidate_deployment_target not in ('PREVIEW', 'PRODUCTION')
     or pg_catalog.jsonb_array_length(normalized) <> expected_origin_count
     or expected_probe_vector_count <> 11
     or expected_origin_count * 11 <> expected_logical_probe_count
     or (
       select pg_catalog.count(distinct value->>0)
       from pg_catalog.jsonb_array_elements(normalized) value
     ) <> pg_catalog.jsonb_array_length(normalized)
     or (
       select pg_catalog.count(distinct proof #>> '{}')
       from pg_catalog.jsonb_array_elements(normalized) value
       cross join lateral pg_catalog.jsonb_array_elements(value->9) proof
     ) <> expected_logical_probe_count
     or normalized_scope is distinct from expected_scope
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(normalized) value
       where pg_catalog.jsonb_typeof(value) is distinct from 'array'
         or pg_catalog.jsonb_array_length(value) <> 11
         or coalesce(value->>0, '') !~ '^https://[a-z0-9.-]+$'
         or coalesce(value->>8, '') <> '2047'
         or pg_catalog.jsonb_typeof(value->9) is distinct from 'array'
         or pg_catalog.jsonb_array_length(value->9) <> 11
         or exists (
           select 1 from pg_catalog.jsonb_array_elements(value->9) proof
           where coalesce(proof #>> '{}', '') !~ '^[0-9a-f]{64}$'
         )
         or coalesce(value->>10, '') = ''
         or (value->>10)::timestamptz <
           pg_catalog.now() - interval '30 minutes'
         or (value->>10)::timestamptz >
           pg_catalog.now() + interval '1 minute'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROBE_RECORDS_MISMATCH';
  end if;
end;
$$;

revoke all on function production_control.assert_exact_vercel_probe_records(
  jsonb, jsonb, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

-- Migration039's removal assertion counted the canonical apex and therefore
-- required live inventory + 5 probe origins. A v4 quiesce receipt deliberately
-- excludes that apex, so replace the assertion in place. Removal is authorized
-- only from the singular current v4/v4 epoch, with exact retained/live/probe
-- evidence and the immutable QUIESCE routing-audit binding created above.
-- Historical receipt rows and their epoch-specific CHECK branches are not
-- rewritten or broadened.
create or replace function production_control.assert_google_writer_provider_fence_removal_safe(
  target_fence_id uuid,
  input jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
  verification
    production_control.google_writer_provider_fence_verifications%rowtype;
  quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
begin
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = target_fence_id;
  select * into strict verification
  from production_control.google_writer_provider_fence_verifications value
  where value.verification_id = fence.active_verification_id
    and value.fence_id = fence.fence_id;
  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = fence.quiesce_evidence_id;

  perform production_control.assert_current_provider_inventory_v4(
    pg_catalog.to_jsonb(quiesce), false, true
  );
  perform production_control.assert_exact_vercel_origin_inventory(
    quiesce.origin_inventory
  );
  perform production_control.assert_exact_vercel_live_inventory(
    quiesce.origin_inventory,
    quiesce.live_origin_inventory,
    quiesce.candidate_deployment_id,
    quiesce.candidate_deployment_commit,
    quiesce.candidate_immutable_origin,
    quiesce.candidate_deployment_target
  );
  perform production_control.assert_exact_vercel_probe_records(
    quiesce.first_probe_records,
    quiesce.live_origin_inventory,
    quiesce.main_branch_alias_origin,
    quiesce.candidate_alias_origin,
    quiesce.candidate_immutable_origin,
    quiesce.candidate_deployment_id,
    quiesce.candidate_deployment_commit,
    quiesce.candidate_deployment_target,
    quiesce.candidate_credential_generation
  );
  perform production_control.assert_exact_vercel_probe_records(
    quiesce.second_probe_records,
    quiesce.live_origin_inventory,
    quiesce.main_branch_alias_origin,
    quiesce.candidate_alias_origin,
    quiesce.candidate_immutable_origin,
    quiesce.candidate_deployment_id,
    quiesce.candidate_deployment_commit,
    quiesce.candidate_deployment_target,
    quiesce.candidate_credential_generation
  );

  if coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or quiesce.evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or quiesce.purpose is distinct from fence.lifecycle_mode
     or quiesce.status is distinct from 'VERIFIED'
     or quiesce.origin_inventory_count is distinct from 1292
     or quiesce.origin_inventory_count is distinct from
       pg_catalog.jsonb_array_length(quiesce.origin_inventory)
     or quiesce.live_origin_inventory_count is distinct from
       pg_catalog.jsonb_array_length(quiesce.live_origin_inventory)
     or quiesce.origin_inventory_fingerprint is distinct from
       production_control.vercel_origin_inventory_fingerprint(
         quiesce.origin_inventory
       )
     or quiesce.live_origin_inventory_fingerprint is distinct from
       production_control.vercel_origin_inventory_fingerprint(
         quiesce.live_origin_inventory
       )
     or coalesce(pg_catalog.jsonb_array_length(
       quiesce.first_probe_records
     ), -1) <> quiesce.live_origin_inventory_count + 4
     or coalesce(pg_catalog.jsonb_array_length(
       quiesce.second_probe_records
     ), -1) <> quiesce.live_origin_inventory_count + 4
     or not exists (
       select 1
       from production_control.vercel_routing_rule_audit_bindings value
       where value.subject_kind = 'QUIESCE'
         and value.challenge_id is null
         and value.attestation_id is null
         and value.quiesce_evidence_id = quiesce.evidence_id
         and value.routing_rule_hostname_operator = 'DOES_NOT_EQUAL'
         and value.routing_rule_canonical_hostname = 'baggerinv.com'
         and value.routing_rule_earlier_active_bypass_rule_count = 0
     )
     or quiesce.deployment_scope_fingerprint is null
     or quiesce.unresolved_request_log_count <> 0
     or quiesce.unresolved_google_write_count <> 0
     or fence.status not in ('INSTALLED', 'REMOVAL_AUTHORIZED')
     or verification.quiesce_evidence_id is distinct from quiesce.evidence_id
     or verification.recovery_only
     or verification.protection_count <> 17
     or verification.protected_sheet_ids is distinct from
       production_control.expected_google_writer_fence_sheet_ids()
     or (fence.status = 'INSTALLED' and (
       pg_catalog.jsonb_typeof(input->'expected_activation_revision')
         is distinct from 'number'
       or input->>'expected_activation_revision' !~ '^[0-9]+$'
       or coalesce(input->>'expected_authority_generation', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(input->>'expected_admission_generation', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or pg_catalog.jsonb_typeof(input->'expected_admission_revision')
         is distinct from 'number'
       or input->>'expected_admission_revision' !~ '^[0-9]+$'
       or activation.activation_revision is distinct from
         (input->>'expected_activation_revision')::bigint
       or activation.authority_generation_id is distinct from
         (input->>'expected_authority_generation')::uuid
       or gate.admission_generation_id is distinct from
         (input->>'expected_admission_generation')::uuid
       or gate.admission_revision is distinct from
         (input->>'expected_admission_revision')::bigint
       or quiesce.expires_at <= pg_catalog.now() + interval '5 minutes'
       or quiesce.owner_freeze_expires_at <=
         pg_catalog.now() + interval '5 minutes'
       or verification.expires_at <= pg_catalog.now() + interval '5 minutes'
     ))
     or (fence.status = 'REMOVAL_AUTHORIZED' and (
       fence.removal_activation_revision is null
       or fence.removal_authority_generation_id is null
       or fence.removal_admission_generation_id is null
       or fence.removal_admission_revision is null
       or activation.activation_revision is distinct from
         fence.removal_activation_revision
       or activation.authority_generation_id is distinct from
         fence.removal_authority_generation_id
       or gate.admission_generation_id is distinct from
         fence.removal_admission_generation_id
       or gate.admission_revision is distinct from
         fence.removal_admission_revision
     ))
     or activation.state not in ('DORMANT', 'ROLLED_BACK')
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.active_google_writer_provider_fence_id
       is distinct from target_fence_id
     or activation.active_google_writer_provider_verification_id
       is distinct from verification.verification_id
     or activation.active_vercel_quiesce_evidence_id
       is distinct from quiesce.evidence_id
     or resource.current_tournament_read_authority is distinct from 'GOOGLE'
     or resource.scoring_authority is distinct from 'GOOGLE'
     or resource.participant_identity_authority is distinct from 'PASSPORT'
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
     or gate.google_writer_provider_fence_id is distinct from target_fence_id
     or gate.google_writer_provider_verification_id
       is distinct from verification.verification_id
     or exists (
       select 1 from production_control.worker_controls value
       where value.enabled or value.google_writes_allowed
     )
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases value
       where value.tournament_id = '2026'
         and (value.status = 'ACTIVE' or value.resolution_state in (
           'LEGACY_UNCLASSIFIED', 'ADMITTED', 'WRITE_STARTED',
           'AMBIGUOUS', 'PARTIAL_WRITE'
         ))
     )
     or exists (
       select 1 from scoring_authority.authority_epochs value
       where value.tournament_id = '2026' and value.status = 'PREPARED'
     )
     or exists (
       select 1 from scoring_authority.google_outbox_events value
       where value.tournament_id = '2026' and value.status <> 'DELIVERED'
     )
     or exists (
       select 1 from scoring_authority.scorecard_archive_jobs value
       where value.tournament_id = '2026'
         and value.status not in ('VERIFIED', 'SUPERSEDED')
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_NOT_SAFE';
  end if;
end;
$$;

revoke all on function
  production_control.assert_google_writer_provider_fence_removal_safe(
    uuid, jsonb
  ) from public, anon, authenticated, service_role;

-- The v2 protected-range removal RPCs were granted to service_role by
-- migration034.  DRIVE_ACL_V2 restores the one exact legacy Drive permission
-- through the serialized abort dispatch instead; no current caller may fall
-- back to the historical protected-range removal surface.
create or replace function public.authorize_production_google_writer_provider_fence_removal(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_GOOGLE_WRITER_PROTECTED_RANGE_REMOVAL_RETIRED';
end;
$$;

create or replace function public.finish_production_google_writer_provider_fence_removal(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_GOOGLE_WRITER_PROTECTED_RANGE_REMOVAL_RETIRED';
end;
$$;

revoke all on function
  public.authorize_production_google_writer_provider_fence_removal(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.finish_production_google_writer_provider_fence_removal(jsonb)
  from public, anon, authenticated, service_role;

-- Bind every current provider attestation to the exact exhaustive /v4/aliases
-- census signed by the local attester. The browser cannot provide or alter
-- this relation: only the service-role consume wrapper can call the private
-- recorder after the migration039 signature/inventory parser succeeds.
create table production_control.vercel_provider_alias_captures (
  alias_capture_id uuid primary key default extensions.gen_random_uuid(),
  attestation_id uuid not null unique references
    production_control.vercel_provider_attestations(attestation_id)
    on delete restrict,
  stage text not null check (stage in ('BEGIN', 'FINALIZE')),
  alias_inventory_count integer not null check (alias_inventory_count = 56),
  alias_inventory_fingerprint text not null check (
    alias_inventory_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  alias_inventory_records jsonb not null check (
    pg_catalog.jsonb_typeof(alias_inventory_records) = 'array'
  ),
  alias_pagination_page_count integer not null check (
    alias_pagination_page_count >= 1
  ),
  alias_pagination_fingerprint text not null check (
    alias_pagination_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  recorded_at timestamptz not null default pg_catalog.now()
);

alter table production_control.vercel_provider_alias_captures
  enable row level security;
revoke all on table production_control.vercel_provider_alias_captures
  from public, anon, authenticated, service_role;

create or replace function production_control.normalized_vercel_alias_inventory(
  input jsonb
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    pg_catalog.lower(value->>0),
    value->>1,
    pg_catalog.lower(value->>2),
    case when value->3 = 'null'::jsonb then null
      else pg_catalog.lower(value->>3) end,
    case when value->4 = 'null'::jsonb then null
      else (value->>4)::integer end
  ) order by pg_catalog.lower(value->>0) collate "C"), '[]'::jsonb)
  from pg_catalog.jsonb_array_elements(input) value
$$;

create or replace function production_control.vercel_alias_inventory_fingerprint(
  input jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(
    ('[' || coalesce(pg_catalog.string_agg(
      '[' || pg_catalog.to_jsonb(pg_catalog.lower(value->>0))::text
      || ',' || pg_catalog.to_jsonb(value->>1)::text
      || ',' || pg_catalog.to_jsonb(pg_catalog.lower(value->>2))::text
      || ',' || case when value->3 = 'null'::jsonb then 'null'
        else pg_catalog.to_jsonb(pg_catalog.lower(value->>3))::text end
      || ',' || case when value->4 = 'null'::jsonb then 'null'
        else ((value->>4)::integer)::text end || ']',
      ',' order by pg_catalog.lower(value->>0) collate "C"
    ), '') || ']')::text,
    'sha256'
  ), 'hex')
  from pg_catalog.jsonb_array_elements(input) value
$$;

create or replace function production_control.assert_exact_vercel_alias_inventory(
  input jsonb,
  expected_fingerprint text,
  candidate_deployment_id text,
  candidate_alias_origin text,
  candidate_immutable_origin text,
  purpose_value text
)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  normalized jsonb;
  candidate_alias_hostname text;
  candidate_immutable_hostname text;
begin
  if pg_catalog.jsonb_typeof(input) is distinct from 'array'
     or pg_catalog.jsonb_array_length(input) <> 56
     or coalesce(expected_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or coalesce(candidate_deployment_id, '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(candidate_alias_origin, '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(candidate_immutable_origin, '')
       !~ '^https://[a-z0-9.-]+$'
     or purpose_value not in ('REHEARSAL', 'CUTOVER')
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(input) value
       where pg_catalog.jsonb_typeof(value) is distinct from 'array'
          or pg_catalog.jsonb_array_length(value) <> 5
          or coalesce(value->>0, '') !~ '^[a-z0-9.-]+$'
          or coalesce(value->>1, '') !~ '^dpl_[A-Za-z0-9]{8,64}$'
          or coalesce(value->>2, '') !~ '^[a-z0-9.-]+[.]vercel[.]app$'
          or not (
            (value->3 = 'null'::jsonb and value->4 = 'null'::jsonb)
            or (
              coalesce(value->>3, '') ~ '^[a-z0-9.-]+$'
              and pg_catalog.jsonb_typeof(value->4) = 'number'
              and (value->>4)::integer in (301, 302, 307, 308)
            )
          )
     ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_ALIAS_INVENTORY_INPUT_INVALID';
  end if;

  normalized := production_control.normalized_vercel_alias_inventory(input);
  candidate_alias_hostname := pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.rtrim(candidate_alias_origin, '/'), '^https://', ''
  ));
  candidate_immutable_hostname := pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.rtrim(candidate_immutable_origin, '/'), '^https://', ''
  ));
  if normalized is distinct from input
     or (select pg_catalog.count(distinct value->>0)
       from pg_catalog.jsonb_array_elements(normalized) value) <> 56
     or production_control.vercel_alias_inventory_fingerprint(normalized)
       is distinct from expected_fingerprint
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized) value
       where value = pg_catalog.jsonb_build_array(
         'bagger-inv-git-agent-course-hole-be25e6-sandbagger-invitational.vercel.app',
         'dpl_73dJVxZVEXkUqrinj17RHVFcjP7j',
         'bagger-kj3c0pkvm-sandbagger-invitational.vercel.app',
         null, null
       )) <> 1
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized) value
       where value = pg_catalog.jsonb_build_array(
         candidate_alias_hostname, candidate_deployment_id,
         candidate_immutable_hostname, null, null
       )) <> 1
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized) value
       where value = pg_catalog.jsonb_build_array(
         'baggerinv.com',
         case when purpose_value = 'CUTOVER' then candidate_deployment_id
           else 'dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2' end,
         case when purpose_value = 'CUTOVER' then candidate_immutable_hostname
           else 'bagger-drmix94o0-sandbagger-invitational.vercel.app' end,
         null, null
       )) <> 1
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized) value
       where value = pg_catalog.jsonb_build_array(
         'bagger-inv.vercel.app',
         case when purpose_value = 'CUTOVER' then candidate_deployment_id
           else 'dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2' end,
         case when purpose_value = 'CUTOVER' then candidate_immutable_hostname
           else 'bagger-drmix94o0-sandbagger-invitational.vercel.app' end,
         null, null
       )) <> 1
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized) value
       where value = pg_catalog.jsonb_build_array(
         'www.baggerinv.com',
         case when purpose_value = 'CUTOVER' then candidate_deployment_id
           else 'dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2' end,
         case when purpose_value = 'CUTOVER' then candidate_immutable_hostname
           else 'bagger-drmix94o0-sandbagger-invitational.vercel.app' end,
         'baggerinv.com', 308
       )) <> 1
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized) value
       where value = pg_catalog.jsonb_build_array(
         'bagger-inv-git-main-sandbagger-invitational.vercel.app',
         'dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2',
         'bagger-drmix94o0-sandbagger-invitational.vercel.app',
         null, null
       )) <> 1 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_ALIAS_INVENTORY_MISMATCH';
  end if;
end;
$$;

alter table production_control.vercel_provider_alias_captures
  add constraint production_vercel_provider_alias_capture_contract_check check (
    alias_inventory_count =
      pg_catalog.jsonb_array_length(alias_inventory_records)
    and alias_inventory_fingerprint =
      production_control.vercel_alias_inventory_fingerprint(
        alias_inventory_records
      )
  );

create or replace function production_control.guard_vercel_provider_alias_capture()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_VERCEL_PROVIDER_ALIAS_CAPTURE_IMMUTABLE';
end;
$$;

create trigger guard_vercel_provider_alias_capture
  before update or delete
  on production_control.vercel_provider_alias_captures
  for each row execute function
    production_control.guard_vercel_provider_alias_capture();

create or replace function production_control.record_current_vercel_alias_capture(
  target_attestation_id uuid,
  provider_claim jsonb
)
returns production_control.vercel_provider_alias_captures
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  attestation production_control.vercel_provider_attestations%rowtype;
  challenge production_control.vercel_provider_attestation_challenges%rowtype;
  capture production_control.vercel_provider_alias_captures%rowtype;
begin
  if target_attestation_id is null
     or pg_catalog.jsonb_typeof(provider_claim) is distinct from 'object'
     or pg_catalog.jsonb_typeof(provider_claim->'alias_inventory_count')
       is distinct from 'number'
     or provider_claim->>'alias_inventory_count' is distinct from '56'
     or pg_catalog.jsonb_typeof(provider_claim->'alias_inventory_records')
       is distinct from 'array'
     or coalesce(provider_claim->>'alias_inventory_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(provider_claim->'alias_pagination_page_count')
       is distinct from 'number'
     or (provider_claim->>'alias_pagination_page_count')::integer < 1
     or coalesce(provider_claim->>'alias_pagination_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(provider_claim->>'candidate_alias_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(provider_claim->>'candidate_immutable_origin', '')
       !~ '^https://[a-z0-9.-]+$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_PROVIDER_ALIAS_CAPTURE_INPUT_INVALID';
  end if;

  select * into strict attestation
  from production_control.vercel_provider_attestations value
  where value.attestation_id = target_attestation_id
  for update;
  select * into strict challenge
  from production_control.vercel_provider_attestation_challenges value
  where value.challenge_id = attestation.challenge_id;

  if provider_claim->>'attestation_id' is distinct from
       attestation.attestation_id::text
     or provider_claim->>'attestation_fingerprint' is distinct from
       attestation.attestation_fingerprint
     or provider_claim->>'stage' is distinct from attestation.stage
     or provider_claim->>'candidate_deployment_id' is distinct from
       attestation.candidate_deployment_id
     or pg_catalog.lower(provider_claim->>'candidate_alias_origin') is distinct from
       challenge.candidate_alias_origin
     or pg_catalog.lower(provider_claim->>'candidate_immutable_origin') is distinct from
       challenge.candidate_immutable_origin then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ALIAS_CAPTURE_BINDING_MISMATCH';
  end if;
  perform production_control.assert_exact_vercel_alias_inventory(
    provider_claim->'alias_inventory_records',
    provider_claim->>'alias_inventory_fingerprint',
    attestation.candidate_deployment_id,
    challenge.candidate_alias_origin,
    challenge.candidate_immutable_origin,
    challenge.purpose
  );

  insert into production_control.vercel_provider_alias_captures (
    attestation_id, stage, alias_inventory_count,
    alias_inventory_fingerprint, alias_inventory_records,
    alias_pagination_page_count, alias_pagination_fingerprint
  ) values (
    attestation.attestation_id, attestation.stage, 56,
    provider_claim->>'alias_inventory_fingerprint',
    provider_claim->'alias_inventory_records',
    (provider_claim->>'alias_pagination_page_count')::integer,
    provider_claim->>'alias_pagination_fingerprint'
  ) on conflict (attestation_id) do nothing;

  select * into strict capture
  from production_control.vercel_provider_alias_captures value
  where value.attestation_id = attestation.attestation_id;
  if capture.stage is distinct from attestation.stage
     or capture.alias_inventory_count is distinct from 56
     or capture.alias_inventory_fingerprint is distinct from
       provider_claim->>'alias_inventory_fingerprint'
     or capture.alias_inventory_records is distinct from
       provider_claim->'alias_inventory_records'
     or capture.alias_pagination_page_count is distinct from
       (provider_claim->>'alias_pagination_page_count')::integer
     or capture.alias_pagination_fingerprint is distinct from
       provider_claim->>'alias_pagination_fingerprint' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ALIAS_CAPTURE_IDEMPOTENCY_CONFLICT';
  end if;
  return capture;
end;
$$;

create or replace function production_control.vercel_alias_recapture_response(
  target_evidence_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with captures as (
    select attestation.stage, attestation.attestation_id,
      attestation.attestation_fingerprint,
      attestation.provider_observed_at,
      capture.alias_inventory_count,
      capture.alias_inventory_fingerprint,
      capture.alias_pagination_page_count,
      capture.alias_pagination_fingerprint
    from production_control.vercel_provider_attestations attestation
    join production_control.vercel_provider_alias_captures capture
      on capture.attestation_id = attestation.attestation_id
    where attestation.evidence_id = target_evidence_id
      and attestation.status = 'BOUND'
  ), summary as (
    select pg_catalog.count(*)::integer as recapture_count,
      pg_catalog.max(alias_inventory_count) as alias_inventory_count,
      pg_catalog.max(alias_inventory_fingerprint)
        as alias_inventory_fingerprint,
      pg_catalog.max(alias_pagination_page_count)
        as alias_pagination_page_count,
      pg_catalog.max(alias_pagination_fingerprint)
        as alias_pagination_fingerprint,
      (pg_catalog.max(attestation_id::text) filter (where stage = 'BEGIN'))::uuid
        as begin_attestation_id,
      pg_catalog.max(attestation_fingerprint) filter (where stage = 'BEGIN')
        as begin_attestation_fingerprint,
      pg_catalog.max(provider_observed_at) filter (where stage = 'BEGIN')
        as begin_provider_observed_at,
      (pg_catalog.max(attestation_id::text) filter (where stage = 'FINALIZE'))::uuid
        as finalize_attestation_id,
      pg_catalog.max(attestation_fingerprint) filter (where stage = 'FINALIZE')
        as finalize_attestation_fingerprint,
      pg_catalog.max(provider_observed_at) filter (where stage = 'FINALIZE')
        as finalize_provider_observed_at
    from captures
  )
  select case when recapture_count = 0 then '{}'::jsonb
    else pg_catalog.jsonb_build_object(
      'alias_recapture_count', recapture_count,
      'alias_inventory_count', alias_inventory_count,
      'alias_inventory_fingerprint', alias_inventory_fingerprint,
      'alias_pagination_page_count', alias_pagination_page_count,
      'alias_pagination_fingerprint', alias_pagination_fingerprint,
      'begin_alias_attestation_id', begin_attestation_id,
      'begin_alias_attestation_fingerprint', begin_attestation_fingerprint,
      'begin_alias_provider_observed_at', begin_provider_observed_at,
      'finalize_alias_attestation_id', finalize_attestation_id,
      'finalize_alias_attestation_fingerprint', finalize_attestation_fingerprint,
      'finalize_alias_provider_observed_at', finalize_provider_observed_at
    ) end
  from summary
$$;

create or replace function production_control.assert_current_vercel_alias_recaptures(
  target_evidence_id uuid,
  required_recapture_count integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  evidence production_control.vercel_writer_quiesce_evidence%rowtype;
  begin_attestation production_control.vercel_provider_attestations%rowtype;
  finalize_attestation production_control.vercel_provider_attestations%rowtype;
  begin_capture production_control.vercel_provider_alias_captures%rowtype;
  finalize_capture production_control.vercel_provider_alias_captures%rowtype;
  response_value jsonb;
begin
  if target_evidence_id is null or required_recapture_count not in (1, 2) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_ALIAS_RECAPTURE_INPUT_INVALID';
  end if;
  select * into strict evidence
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = target_evidence_id;
  select * into strict begin_attestation
  from production_control.vercel_provider_attestations value
  where value.evidence_id = target_evidence_id
    and value.stage = 'BEGIN' and value.status = 'BOUND';
  select * into strict begin_capture
  from production_control.vercel_provider_alias_captures value
  where value.attestation_id = begin_attestation.attestation_id;
  perform production_control.assert_exact_vercel_alias_inventory(
    begin_capture.alias_inventory_records,
    begin_capture.alias_inventory_fingerprint,
    evidence.candidate_deployment_id,
    evidence.candidate_alias_origin,
    evidence.candidate_immutable_origin,
    evidence.purpose
  );

  if begin_capture.stage is distinct from 'BEGIN' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_ALIAS_RECAPTURE_BEGIN_MISMATCH';
  end if;
  if required_recapture_count = 2 then
    select * into strict finalize_attestation
    from production_control.vercel_provider_attestations value
    where value.evidence_id = target_evidence_id
      and value.stage = 'FINALIZE' and value.status = 'BOUND';
    select * into strict finalize_capture
    from production_control.vercel_provider_alias_captures value
    where value.attestation_id = finalize_attestation.attestation_id;
    perform production_control.assert_exact_vercel_alias_inventory(
      finalize_capture.alias_inventory_records,
      finalize_capture.alias_inventory_fingerprint,
      evidence.candidate_deployment_id,
      evidence.candidate_alias_origin,
      evidence.candidate_immutable_origin,
      evidence.purpose
    );
    if finalize_capture.stage is distinct from 'FINALIZE'
       or begin_attestation.attestation_id = finalize_attestation.attestation_id
       or begin_attestation.attestation_fingerprint =
         finalize_attestation.attestation_fingerprint
       or begin_attestation.provider_observed_at >=
         finalize_attestation.provider_observed_at
       or begin_capture.alias_inventory_count is distinct from
         finalize_capture.alias_inventory_count
       or begin_capture.alias_inventory_fingerprint is distinct from
         finalize_capture.alias_inventory_fingerprint
       or begin_capture.alias_inventory_records is distinct from
         finalize_capture.alias_inventory_records
       or begin_capture.alias_pagination_page_count is distinct from
         finalize_capture.alias_pagination_page_count
       or begin_capture.alias_pagination_fingerprint is distinct from
         finalize_capture.alias_pagination_fingerprint then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_ALIAS_RECAPTURE_FINALIZE_DRIFT';
    end if;
  elsif exists (
    select 1 from production_control.vercel_provider_attestations value
    where value.evidence_id = target_evidence_id and value.stage = 'FINALIZE'
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_ALIAS_RECAPTURE_COUNT_MISMATCH';
  end if;

  response_value := production_control.vercel_alias_recapture_response(
    target_evidence_id
  );
  if (response_value->>'alias_recapture_count')::integer is distinct from
       required_recapture_count then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_ALIAS_RECAPTURE_COUNT_MISMATCH';
  end if;
  return response_value;
end;
$$;

-- Preserve migration039 implementations under non-callable internal names and
-- keep the active RPC signatures stable. The wrappers validate the three new
-- signed routing semantics before any historical implementation can mutate a
-- receipt. The consume wrapper removes only these newly audited keys before
-- calling the exact v3 parser; row triggers persist their certified constants.
create or replace function production_control.assert_exact_vercel_routing_rule_audit(
  input jsonb
)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
begin
  if pg_catalog.jsonb_typeof(input) is distinct from 'object'
     or input->>'routing_rule_hostname_operator' is distinct from
       'DOES_NOT_EQUAL'
     or input->>'routing_rule_canonical_hostname' is distinct from
       'baggerinv.com'
     or pg_catalog.jsonb_typeof(
       input->'routing_rule_earlier_active_bypass_rule_count'
     ) is distinct from 'number'
     or input->>'routing_rule_earlier_active_bypass_rule_count'
       is distinct from '0'
     or input->'routing_rule_global_invocation_quiescence_proved'
       is distinct from 'true'::jsonb
     or pg_catalog.jsonb_typeof(
       input->'routing_rule_candidate_control_host_count'
     ) is distinct from 'number'
     or input->>'routing_rule_candidate_control_host_count' is distinct from '2'
     or coalesce(
       input->>'routing_rule_candidate_control_hosts_fingerprint', ''
     ) !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(
       input->'routing_rule_canonical_apex_safe_method_count'
     ) is distinct from 'number'
     or input->>'routing_rule_canonical_apex_safe_method_count'
       is distinct from '3'
     or input->>'routing_rule_canonical_apex_safe_methods_fingerprint'
       is distinct from
         '798954f7a6aab53443a1fac2333ce7043f7c5c5bf5bdbffdfdd19f18433e96e7'
     or pg_catalog.jsonb_typeof(
       input->'routing_rule_canonical_apex_safe_method_writer_route_count'
     ) is distinct from 'number'
     or input->>'routing_rule_canonical_apex_safe_method_writer_route_count'
       is distinct from '10'
     or input->>'routing_rule_canonical_apex_safe_method_writer_routes_fingerprint'
       is distinct from
         '8f3bcfaf2b8fd6825ce5fb56385b1a1aa2e23da7bfe96b42e7e9c3ec23f4bcd7'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_MISMATCH';
  end if;
end;
$$;

alter function production_control.vercel_provider_attestation_challenge_response(
  production_control.vercel_provider_attestation_challenges, boolean
) rename to vercel_provider_challenge_response_v3_base;
alter function production_control.vercel_provider_attestation_response(
  production_control.vercel_provider_attestations, boolean
) rename to vercel_provider_response_v3_base;
alter function production_control.vercel_quiesce_response(
  production_control.vercel_writer_quiesce_evidence, boolean
) rename to vercel_quiesce_response_v3_base;

create or replace function production_control.vercel_provider_attestation_challenge_response(
  value production_control.vercel_provider_attestation_challenges,
  was_idempotent boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select base.response
    || pg_catalog.jsonb_build_object(
      'routing_rule_hostname_operator',
        routing_audit.routing_rule_hostname_operator,
      'routing_rule_canonical_hostname',
        routing_audit.routing_rule_canonical_hostname,
      'routing_rule_earlier_active_bypass_rule_count',
        routing_audit.routing_rule_earlier_active_bypass_rule_count,
      'routing_rule_global_invocation_quiescence_proved',
        routing_audit.routing_rule_global_invocation_quiescence_proved,
      'routing_rule_candidate_control_host_count',
        routing_audit.routing_rule_candidate_control_host_count,
      'routing_rule_candidate_control_hosts_fingerprint',
        routing_audit.routing_rule_candidate_control_hosts_fingerprint,
      'routing_rule_canonical_apex_safe_method_count',
        routing_audit.routing_rule_canonical_apex_safe_method_count,
      'routing_rule_canonical_apex_safe_methods_fingerprint',
        routing_audit.routing_rule_canonical_apex_safe_methods_fingerprint,
      'routing_rule_canonical_apex_safe_method_writer_route_count',
        routing_audit.routing_rule_canonical_apex_safe_method_writer_route_count,
      'routing_rule_canonical_apex_safe_method_writer_routes_fingerprint',
        routing_audit.routing_rule_canonical_apex_safe_method_writer_routes_fingerprint
    )
    || case when pg_catalog.jsonb_typeof(
         base.response->'consumed_provider_attestation'
       ) = 'object'
      then pg_catalog.jsonb_build_object(
        'consumed_provider_attestation',
          base.response->'consumed_provider_attestation'
          || pg_catalog.jsonb_build_object(
            'routing_rule_hostname_operator',
              consumed_audit.routing_rule_hostname_operator,
            'routing_rule_canonical_hostname',
              consumed_audit.routing_rule_canonical_hostname,
            'routing_rule_earlier_active_bypass_rule_count',
              consumed_audit.routing_rule_earlier_active_bypass_rule_count,
            'routing_rule_global_invocation_quiescence_proved',
              consumed_audit.routing_rule_global_invocation_quiescence_proved,
            'routing_rule_candidate_control_host_count',
              consumed_audit.routing_rule_candidate_control_host_count,
            'routing_rule_candidate_control_hosts_fingerprint',
              consumed_audit.routing_rule_candidate_control_hosts_fingerprint,
            'routing_rule_canonical_apex_safe_method_count',
              consumed_audit.routing_rule_canonical_apex_safe_method_count,
            'routing_rule_canonical_apex_safe_methods_fingerprint',
              consumed_audit.routing_rule_canonical_apex_safe_methods_fingerprint,
            'routing_rule_canonical_apex_safe_method_writer_route_count',
              consumed_audit.routing_rule_canonical_apex_safe_method_writer_route_count,
            'routing_rule_canonical_apex_safe_method_writer_routes_fingerprint',
              consumed_audit.routing_rule_canonical_apex_safe_method_writer_routes_fingerprint,
            'alias_inventory_count', consumed_alias.alias_inventory_count,
            'alias_inventory_fingerprint',
              consumed_alias.alias_inventory_fingerprint,
            'alias_inventory_records', consumed_alias.alias_inventory_records,
            'alias_pagination_page_count',
              consumed_alias.alias_pagination_page_count,
            'alias_pagination_fingerprint',
              consumed_alias.alias_pagination_fingerprint
          )
      ) else '{}'::jsonb end
  from (
    select production_control.vercel_provider_challenge_response_v3_base(
      value, was_idempotent
    ) as response
  ) base
  left join production_control.vercel_provider_attestations consumed
    on consumed.attestation_id = value.consumed_attestation_id
  left join production_control.vercel_routing_rule_audit_bindings routing_audit
    on routing_audit.challenge_id = value.challenge_id
  left join production_control.vercel_routing_rule_audit_bindings consumed_audit
    on consumed_audit.attestation_id = consumed.attestation_id
  left join production_control.vercel_provider_alias_captures consumed_alias
    on consumed_alias.attestation_id = consumed.attestation_id
$$;

create or replace function production_control.vercel_provider_attestation_response(
  value production_control.vercel_provider_attestations,
  was_idempotent boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select base.response || pg_catalog.jsonb_build_object(
    'routing_rule_hostname_operator',
      routing_audit.routing_rule_hostname_operator,
    'routing_rule_canonical_hostname',
      routing_audit.routing_rule_canonical_hostname,
    'routing_rule_earlier_active_bypass_rule_count',
      routing_audit.routing_rule_earlier_active_bypass_rule_count,
    'routing_rule_global_invocation_quiescence_proved',
      routing_audit.routing_rule_global_invocation_quiescence_proved,
    'routing_rule_candidate_control_host_count',
      routing_audit.routing_rule_candidate_control_host_count,
    'routing_rule_candidate_control_hosts_fingerprint',
      routing_audit.routing_rule_candidate_control_hosts_fingerprint,
    'routing_rule_canonical_apex_safe_method_count',
      routing_audit.routing_rule_canonical_apex_safe_method_count,
    'routing_rule_canonical_apex_safe_methods_fingerprint',
      routing_audit.routing_rule_canonical_apex_safe_methods_fingerprint,
    'routing_rule_canonical_apex_safe_method_writer_route_count',
      routing_audit.routing_rule_canonical_apex_safe_method_writer_route_count,
    'routing_rule_canonical_apex_safe_method_writer_routes_fingerprint',
      routing_audit.routing_rule_canonical_apex_safe_method_writer_routes_fingerprint,
    'alias_inventory_count', alias_capture.alias_inventory_count,
    'alias_inventory_fingerprint', alias_capture.alias_inventory_fingerprint,
    'alias_inventory_records', alias_capture.alias_inventory_records,
    'alias_pagination_page_count', alias_capture.alias_pagination_page_count,
    'alias_pagination_fingerprint', alias_capture.alias_pagination_fingerprint
  )
  from (
    select production_control.vercel_provider_response_v3_base(
      value, was_idempotent
    ) as response
  ) base
  left join production_control.vercel_routing_rule_audit_bindings routing_audit
    on routing_audit.attestation_id = value.attestation_id
  left join production_control.vercel_provider_alias_captures alias_capture
    on alias_capture.attestation_id = value.attestation_id
$$;

create or replace function production_control.vercel_quiesce_response(
  value production_control.vercel_writer_quiesce_evidence,
  was_idempotent boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select base.response || pg_catalog.jsonb_build_object(
    'routing_rule_hostname_operator',
      routing_audit.routing_rule_hostname_operator,
    'routing_rule_canonical_hostname',
      routing_audit.routing_rule_canonical_hostname,
    'routing_rule_earlier_active_bypass_rule_count',
      routing_audit.routing_rule_earlier_active_bypass_rule_count,
    'routing_rule_global_invocation_quiescence_proved',
      routing_audit.routing_rule_global_invocation_quiescence_proved,
    'routing_rule_candidate_control_host_count',
      routing_audit.routing_rule_candidate_control_host_count,
    'routing_rule_candidate_control_hosts_fingerprint',
      routing_audit.routing_rule_candidate_control_hosts_fingerprint,
    'routing_rule_canonical_apex_safe_method_count',
      routing_audit.routing_rule_canonical_apex_safe_method_count,
    'routing_rule_canonical_apex_safe_methods_fingerprint',
      routing_audit.routing_rule_canonical_apex_safe_methods_fingerprint,
    'routing_rule_canonical_apex_safe_method_writer_route_count',
      routing_audit.routing_rule_canonical_apex_safe_method_writer_route_count,
    'routing_rule_canonical_apex_safe_method_writer_routes_fingerprint',
      routing_audit.routing_rule_canonical_apex_safe_method_writer_routes_fingerprint,
    'critical_waf_epoch_id', value.critical_waf_epoch_id,
    'critical_waf_observation_id', value.critical_waf_observation_id,
    'critical_waf_quiesce_stage', value.critical_waf_quiesce_stage
  ) || production_control.vercel_alias_recapture_response(value.evidence_id)
  from (
    select production_control.vercel_quiesce_response_v3_base(
      value, was_idempotent
    ) as response
  ) base
  left join production_control.vercel_routing_rule_audit_bindings routing_audit
    on routing_audit.quiesce_evidence_id = value.evidence_id
$$;

alter function public.issue_production_vercel_provider_attestation_challenge(
  jsonb
) rename to issue_vercel_provider_attestation_v3_base;
alter function public.consume_production_vercel_provider_attestation_challenge(
  jsonb
) rename to consume_vercel_provider_attestation_v3_base;
alter function public.begin_production_vercel_writer_quiesce_evidence(
  jsonb
) rename to begin_vercel_writer_quiesce_v3_base;
alter function public.finalize_production_vercel_writer_quiesce_evidence(
  jsonb
) rename to finalize_vercel_writer_quiesce_v3_base;

-- The HTTP control plane is deliberately Project Preview-only for both
-- rehearsal and cutover. Preserve the immutable v3 functions for historical
-- receipts, while these v4 internal copies change only the exact CUTOVER
-- candidate-target predicate from PRODUCTION to PREVIEW. All other inventory,
-- replay, provider-signature, and admission predicates remain byte-equivalent.
create or replace function public.issue_vercel_provider_attestation_v4_candidate_base(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  challenge production_control.vercel_provider_attestation_challenges%rowtype;
  begin_challenge
    production_control.vercel_provider_attestation_challenges%rowtype;
  evidence production_control.vercel_writer_quiesce_evidence%rowtype;
  challenge_identifier uuid := extensions.gen_random_uuid();
  challenge_request_identifier uuid;
  operation_request_identifier uuid;
  evidence_request_identifier uuid;
  stage_value text := pg_catalog.upper(coalesce(input->>'stage', ''));
  purpose_value text := pg_catalog.upper(coalesce(input->>'purpose', ''));
  payload_hash text := production_control.cutover_payload_hash(input);
  issued_time timestamptz := pg_catalog.now();
  expiry_time timestamptz := issued_time + interval '120 seconds';
  binding_fingerprint text;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'challenge_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'evidence_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or stage_value not in ('BEGIN', 'FINALIZE')
     or purpose_value not in ('REHEARSAL', 'CUTOVER')
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or input->>'candidate_deployment_target' not in ('PREVIEW', 'PRODUCTION')
     or coalesce(input->>'candidate_alias_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'candidate_immutable_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or coalesce(input->>'vercel_team_id', '')
       !~ '^[A-Za-z0-9_.:-]{3,160}$'
     or coalesce(input->>'routing_rule_id', '')
       !~ '^[A-Za-z0-9_.:-]{3,160}$'
     or coalesce(input->>'routing_rule_config_version', '')
       !~ '^[A-Za-z0-9_.:-]{1,160}$'
     or input->>'routing_rule_scope' is distinct from
       'PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_INPUT_INVALID';
  end if;
  if (purpose_value = 'REHEARSAL'
       and input->>'candidate_deployment_target' <> 'PREVIEW')
     or (purpose_value = 'CUTOVER'
       and input->>'candidate_deployment_target' <> 'PREVIEW') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_TARGET_MISMATCH';
  end if;
  challenge_request_identifier := (input->>'challenge_request_id')::uuid;
  operation_request_identifier := (input->>'operation_request_id')::uuid;
  evidence_request_identifier := (input->>'evidence_request_id')::uuid;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into challenge
  from production_control.vercel_provider_attestation_challenges value
  where value.challenge_request_id = challenge_request_identifier;
  if found then
    if challenge.issue_request_fingerprint is distinct from
         input->>'request_fingerprint'
       or challenge.issue_payload_hash is distinct from payload_hash
       or challenge.operation_request_id is distinct from
         operation_request_identifier
       or challenge.evidence_request_id is distinct from
         evidence_request_identifier
       or challenge.stage is distinct from stage_value then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_IDEMPOTENCY_CONFLICT';
    end if;
    return production_control.vercel_provider_attestation_challenge_response(
      challenge, true
    );
  end if;
  if exists (
    select 1 from production_control.vercel_provider_attestation_challenges value
    where (value.operation_request_id = operation_request_identifier
        or value.evidence_request_id = evidence_request_identifier)
      and value.stage = stage_value
      and value.status <> 'ABANDONED'
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ALREADY_ISSUED';
  end if;

  if stage_value = 'BEGIN' then
    if exists (
      select 1 from production_control.vercel_writer_quiesce_evidence value
      where value.evidence_request_id = evidence_request_identifier
    ) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_BEGIN_ALREADY_BOUND';
    end if;
  else
    select * into strict evidence
    from production_control.vercel_writer_quiesce_evidence value
    where value.evidence_request_id = evidence_request_identifier
    for update;
    select * into strict begin_challenge
    from production_control.vercel_provider_attestation_challenges value
    where value.evidence_request_id = evidence_request_identifier
      and value.stage = 'BEGIN' and value.status = 'CONSUMED';
    if evidence.status is distinct from 'DRAINING'
       or evidence.purpose is distinct from purpose_value
       or begin_challenge.operation_request_id = operation_request_identifier
       or not exists (
         select 1
         from production_control.vercel_provider_attestations attestation
         where attestation.attestation_id =
             begin_challenge.consumed_attestation_id
           and attestation.evidence_id = evidence.evidence_id
           and attestation.evidence_request_id = evidence_request_identifier
           and attestation.stage = 'BEGIN'
           and attestation.status = 'BOUND'
       )
       or begin_challenge.purpose is distinct from purpose_value
       or begin_challenge.authenticated_actor_fingerprint is distinct from
         input->>'authenticated_actor_fingerprint'
       or begin_challenge.actor_id is distinct from input->>'actor_id'
       or begin_challenge.vercel_project_id is distinct from
         input->>'vercel_project_id'
       or begin_challenge.vercel_team_id is distinct from
         input->>'vercel_team_id'
       or begin_challenge.candidate_deployment_id is distinct from
         input->>'candidate_deployment_id'
       or begin_challenge.candidate_deployment_commit is distinct from
         pg_catalog.lower(input->>'candidate_deployment_commit')
       or begin_challenge.candidate_deployment_target is distinct from
         input->>'candidate_deployment_target'
       or begin_challenge.candidate_alias_origin is distinct from
         pg_catalog.lower(input->>'candidate_alias_origin')
       or begin_challenge.candidate_immutable_origin is distinct from
         pg_catalog.lower(input->>'candidate_immutable_origin')
       or begin_challenge.routing_rule_id is distinct from
         input->>'routing_rule_id'
       or begin_challenge.routing_rule_config_version is distinct from
         input->>'routing_rule_config_version'
       or begin_challenge.routing_rule_scope is distinct from
         input->>'routing_rule_scope' then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_FINALIZE_SCOPE_DRIFT';
    end if;
  end if;

  binding_fingerprint := production_control.structured_evidence_fingerprint(
    pg_catalog.jsonb_build_object(
      'challengeId', challenge_identifier,
      'operationRequestId', operation_request_identifier,
      'evidenceRequestId', evidence_request_identifier,
      'stage', stage_value, 'purpose', purpose_value,
      'vercelProjectId', input->>'vercel_project_id',
      'vercelTeamId', input->>'vercel_team_id',
      'candidateDeploymentId', input->>'candidate_deployment_id',
      'candidateDeploymentCommit',
        pg_catalog.lower(input->>'candidate_deployment_commit'),
      'candidateDeploymentTarget', input->>'candidate_deployment_target',
      'candidateAliasOrigin', pg_catalog.lower(input->>'candidate_alias_origin'),
      'candidateImmutableOrigin',
        pg_catalog.lower(input->>'candidate_immutable_origin'),
      'routingRuleId', input->>'routing_rule_id',
      'routingRuleConfigVersion', input->>'routing_rule_config_version',
      'routingRuleScope', input->>'routing_rule_scope',
      'issuedAt', issued_time, 'expiresAt', expiry_time
    )
  );
  insert into production_control.vercel_provider_attestation_challenges (
    challenge_id, challenge_request_id, operation_request_id,
    evidence_request_id, stage, purpose,
    issue_request_fingerprint, issue_payload_hash,
    challenge_request_fingerprint, authenticated_actor_fingerprint,
    vercel_project_id, vercel_team_id,
    candidate_deployment_id, candidate_deployment_commit,
    candidate_deployment_target, candidate_alias_origin,
    candidate_immutable_origin, routing_rule_id, routing_rule_config_version,
    routing_rule_scope, actor_id, issued_at, expires_at
  ) values (
    challenge_identifier, challenge_request_identifier,
    operation_request_identifier, evidence_request_identifier,
    stage_value, purpose_value,
    input->>'request_fingerprint', payload_hash, binding_fingerprint,
    input->>'authenticated_actor_fingerprint',
    input->>'vercel_project_id', input->>'vercel_team_id',
    input->>'candidate_deployment_id',
    pg_catalog.lower(input->>'candidate_deployment_commit'),
    input->>'candidate_deployment_target',
    pg_catalog.lower(input->>'candidate_alias_origin'),
    pg_catalog.lower(input->>'candidate_immutable_origin'),
    input->>'routing_rule_id', input->>'routing_rule_config_version',
    input->>'routing_rule_scope', input->>'actor_id', issued_time, expiry_time
  ) returning * into challenge;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ISSUED',
    'SCORING_AUTHORITY', '2026', challenge.actor_id,
    challenge.issue_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'challenge_id', challenge.challenge_id,
      'operation_request_id', challenge.operation_request_id,
      'evidence_request_id', challenge.evidence_request_id,
      'stage', challenge.stage, 'purpose', challenge.purpose,
      'candidate_deployment_id', challenge.candidate_deployment_id,
      'candidate_deployment_target', challenge.candidate_deployment_target,
      'challenge_request_fingerprint',
        challenge.challenge_request_fingerprint,
      'expires_at', challenge.expires_at
    )
  );
  return production_control.vercel_provider_attestation_challenge_response(
    challenge, false
  );
end;
$$;


create or replace function public.begin_vercel_writer_quiesce_v4_candidate_base(
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
  prior production_control.vercel_writer_quiesce_evidence%rowtype;
  evidence production_control.vercel_writer_quiesce_evidence%rowtype;
  provider_attestation
    production_control.vercel_provider_attestations%rowtype;
  request_identifier uuid;
  prior_identifier uuid;
  evidence_identifier uuid := extensions.gen_random_uuid();
  payload_hash text := production_control.cutover_payload_hash(input);
  normalized_inventory jsonb;
  normalized_live_inventory jsonb;
  normalized_probes jsonb;
  purpose_value text := pg_catalog.upper(coalesce(input->>'purpose', ''));
  freeze_ttl_seconds integer;
  begin_time timestamptz := pg_catalog.now();
  owner_acknowledged timestamptz := begin_time;
  owner_freeze_expires timestamptz;
  probe_scope_fingerprint text;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'evidence_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or input->>'candidate_deployment_target' not in ('PREVIEW', 'PRODUCTION')
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or purpose_value not in ('REHEARSAL', 'CUTOVER')
     or coalesce(input->>'candidate_credential_generation', '')
       !~ '^[A-Z0-9_:-]{3,120}$'
     or coalesce(input->>'main_branch_alias_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'candidate_alias_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'candidate_immutable_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or coalesce(input->>'routing_rule_id', '')
       !~ '^[A-Za-z0-9_.:-]{3,160}$'
     or coalesce(input->>'routing_rule_revision', '')
       !~ '^[A-Za-z0-9_.:-]{1,160}$'
     or input->>'routing_rule_scope' is distinct from
       'PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'owner_principal_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or input->>'owner_override_operationally_frozen' is distinct from 'true'
     or pg_catalog.jsonb_typeof(input->'provider_attestation')
       is distinct from 'object'
     or pg_catalog.jsonb_typeof(input->'live_origin_inventory')
       is distinct from 'array'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or pg_catalog.jsonb_typeof(input->'owner_freeze_ttl_seconds')
       is distinct from 'number'
     or coalesce(input->>'owner_freeze_ttl_seconds', '') !~ '^[0-9]+$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_BEGIN_INPUT_INVALID';
  end if;
  perform production_control.assert_current_provider_inventory_v3(
    input, false, true
  );
  request_identifier := (input->>'evidence_request_id')::uuid;
  prior_identifier := nullif(input->>'prior_evidence_id', '')::uuid;
  freeze_ttl_seconds := (input->>'owner_freeze_ttl_seconds')::integer;
  if freeze_ttl_seconds <> 1800 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_OWNER_FREEZE_INVALID';
  end if;
  if (purpose_value = 'REHEARSAL'
       and input->>'candidate_deployment_target' <> 'PREVIEW')
     or (purpose_value = 'CUTOVER'
       and input->>'candidate_deployment_target' <> 'PREVIEW') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_CANDIDATE_TARGET_MISMATCH';
  end if;
  owner_freeze_expires := begin_time
    + freeze_ttl_seconds * interval '1 second';
  perform production_control.assert_exact_vercel_origin_inventory(
    input->'origin_inventory'
  );
  perform production_control.assert_exact_vercel_live_inventory(
    input->'origin_inventory', input->'live_origin_inventory',
    input->>'candidate_deployment_id',
    pg_catalog.lower(input->>'candidate_deployment_commit'),
    pg_catalog.lower(input->>'candidate_immutable_origin'),
    input->>'candidate_deployment_target'
  );
  perform production_control.assert_exact_vercel_probe_records(
    input->'first_probe_records', input->'live_origin_inventory',
    pg_catalog.lower(input->>'main_branch_alias_origin'),
    pg_catalog.lower(input->>'candidate_alias_origin'),
    pg_catalog.lower(input->>'candidate_immutable_origin'),
    input->>'candidate_deployment_id',
    pg_catalog.lower(input->>'candidate_deployment_commit'),
    input->>'candidate_deployment_target',
    input->>'candidate_credential_generation'
  );
  normalized_inventory := production_control.normalized_vercel_origin_inventory(
    input->'origin_inventory'
  );
  normalized_live_inventory :=
    production_control.normalized_vercel_origin_inventory(
      input->'live_origin_inventory'
    );
  normalized_probes := production_control.normalized_vercel_probe_records(
    input->'first_probe_records'
  );
  if (input->>'live_provider_inventory_count')::integer is distinct from
       pg_catalog.jsonb_array_length(normalized_live_inventory) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_PROVIDER_INVENTORY_MISMATCH';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(normalized_probes) probe
    where (probe->>10)::timestamptz < begin_time - interval '5 minutes'
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_FIRST_PROBE_STALE';
  end if;
  probe_scope_fingerprint := production_control.structured_evidence_fingerprint(
    production_control.normalized_vercel_probe_scope(normalized_probes)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into evidence
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_request_id = request_identifier;
  if found then
    if evidence.begin_request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or evidence.begin_payload_hash is distinct from payload_hash
       or evidence.candidate_deployment_id is distinct from
         input->>'candidate_deployment_id'
       or evidence.candidate_deployment_commit is distinct from
         pg_catalog.lower(input->>'candidate_deployment_commit')
       or evidence.candidate_deployment_target is distinct from
         input->>'candidate_deployment_target'
       or evidence.purpose is distinct from purpose_value then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_IDEMPOTENCY_CONFLICT';
    end if;
    return production_control.vercel_quiesce_response(evidence, true);
  end if;
  if prior_identifier is not null then
    select * into strict prior
    from production_control.vercel_writer_quiesce_evidence value
    where value.evidence_id = prior_identifier;
    if prior.status is distinct from 'VERIFIED'
       or prior.purpose is distinct from purpose_value
       or prior.candidate_deployment_id is distinct from
         input->>'candidate_deployment_id'
       or prior.candidate_deployment_commit is distinct from
         pg_catalog.lower(input->>'candidate_deployment_commit')
       or prior.candidate_deployment_target is distinct from
         input->>'candidate_deployment_target'
       or prior.vercel_project_id is distinct from input->>'vercel_project_id'
       or prior.routing_rule_id is distinct from input->>'routing_rule_id'
       or prior.routing_rule_revision is distinct from
         input->>'routing_rule_revision'
       or prior.routing_rule_scope is distinct from input->>'routing_rule_scope'
       or prior.candidate_credential_generation is distinct from
         input->>'candidate_credential_generation'
       or prior.main_branch_alias_origin is distinct from
         pg_catalog.lower(input->>'main_branch_alias_origin')
       or prior.candidate_alias_origin is distinct from
         pg_catalog.lower(input->>'candidate_alias_origin')
       or prior.candidate_immutable_origin is distinct from
         pg_catalog.lower(input->>'candidate_immutable_origin')
       or prior.owner_principal_fingerprint is distinct from
         pg_catalog.lower(input->>'owner_principal_fingerprint')
       or prior.provider_inventory_schema is distinct from
         input->>'provider_inventory_schema'
       or prior.retained_provider_inventory_count is distinct from
         (input->>'retained_provider_inventory_count')::integer
       or prior.retained_provider_inventory_fingerprint is distinct from
         input->>'retained_provider_inventory_fingerprint'
       or prior.live_provider_inventory_count is distinct from
         (input->>'live_provider_inventory_count')::integer
       or prior.live_provider_inventory_fingerprint is distinct from
         input->>'live_provider_inventory_fingerprint'
       or prior.routing_rule_all_method_fence_required_host_count is distinct from
         (input->>'routing_rule_all_method_fence_required_host_count')::integer
       or prior.routing_rule_all_method_fence_required_hosts_fingerprint
         is distinct from
           input->>'routing_rule_all_method_fence_required_hosts_fingerprint'
       or prior.routing_rule_all_method_fence_required_path_count is distinct from
         (input->>'routing_rule_all_method_fence_required_path_count')::integer
       or prior.routing_rule_all_method_fence_required_paths_fingerprint
         is distinct from
           input->>'routing_rule_all_method_fence_required_paths_fingerprint'
       or prior.credential_confinement_evidence_schema is distinct from
         input->>'credential_confinement_evidence_schema'
       or prior.credential_confinement_record_count is distinct from
         (input->>'credential_confinement_record_count')::integer
       or prior.credential_confinement_records_fingerprint is distinct from
         input->>'credential_confinement_records_fingerprint'
       or prior.credential_confinement_evidence_fingerprint is distinct from
         input->>'credential_confinement_evidence_fingerprint'
       or prior.origin_inventory_fingerprint is distinct from
         production_control.vercel_origin_inventory_fingerprint(
           normalized_inventory
         )
       or exists (
         select value
         from pg_catalog.jsonb_array_elements(
           prior.live_origin_inventory
         ) value
         except
         select value
         from pg_catalog.jsonb_array_elements(
           normalized_live_inventory
         ) value
       ) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_REFRESH_SCOPE_MISMATCH';
    end if;
  end if;

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
  if (purpose_value = 'REHEARSAL' and (
       prior_identifier is not null
       or activation.state is distinct from 'DORMANT'
       or activation.current_authority is distinct from 'GOOGLE'
       or activation.scoring_ingress_enabled
       or activation.first_supabase_write_possible_at is not null
       or activation.first_supabase_write_observed_at is not null
       or activation.active_google_writer_provider_fence_id is not null
       or activation.active_google_writer_provider_verification_id is not null
       or activation.active_vercel_quiesce_evidence_id is not null
       or resource.scoring_authority is distinct from 'GOOGLE'
       or resource.participant_identity_authority is distinct from 'PASSPORT'
       or resource.current_tournament_read_authority is distinct from 'GOOGLE'
       or resource.public_supabase_reads_enabled
       or resource.auth_user_creation_enabled
       or resource.scoring_ingress_enabled or resource.workers_enabled
       or gate.state is distinct from 'PAUSED'
       or gate.authority is distinct from 'GOOGLE'
       or gate.admission_state is distinct from 'OPEN'
       or gate.admission_protocol_enforced
       or gate.active_closure_id is not null
       or gate.external_fence_evidence_id is not null
       or gate.google_writer_provider_fence_id is not null
       or gate.google_writer_provider_verification_id is not null
       or exists (
         select 1 from production_control.worker_controls value
         where value.enabled or value.google_writes_allowed
       )
       or exists (
         select 1 from scoring_authority.scoring_ingress_leases value
         where value.tournament_id = '2026'
           and (value.status = 'ACTIVE' or value.resolution_state in (
             'LEGACY_UNCLASSIFIED', 'ADMITTED', 'WRITE_STARTED',
             'AMBIGUOUS', 'PARTIAL_WRITE'
           ))
       )
     ))
     or (purpose_value = 'CUTOVER' and prior_identifier is null and (
       activation.state is distinct from 'GOOGLE_LEASE_ARMED'
       or activation.read_cutover_phase is distinct from 'CURRENT_READS'
       or activation.current_authority is distinct from 'GOOGLE'
       or activation.scoring_ingress_enabled
       or activation.first_supabase_write_possible_at is not null
       or activation.first_supabase_write_observed_at is not null
       or activation.active_google_writer_provider_fence_id is not null
       or activation.active_google_writer_provider_verification_id is not null
       or activation.active_vercel_quiesce_evidence_id is not null
       or resource.scoring_authority is distinct from 'GOOGLE'
       or resource.participant_identity_authority is distinct from 'SUPABASE'
       or resource.current_tournament_read_authority is distinct from 'SUPABASE'
       or not resource.public_supabase_reads_enabled
       or not resource.auth_user_creation_enabled
       or resource.scoring_ingress_enabled or resource.workers_enabled
       or gate.state is distinct from 'OPEN'
       or gate.authority is distinct from 'GOOGLE'
       or gate.admission_state is distinct from 'OPEN'
       or not gate.admission_protocol_enforced
       or gate.active_closure_id is not null
       or gate.external_fence_evidence_id is not null
       or gate.google_writer_provider_fence_id is not null
       or gate.google_writer_provider_verification_id is not null
       or exists (
         select 1 from production_control.worker_controls value
         where value.enabled or value.google_writes_allowed
       )
     ))
     or (purpose_value = 'CUTOVER' and prior_identifier is not null and (
       activation.active_google_writer_provider_fence_id is null
       or activation.active_google_writer_provider_verification_id is null
       or activation.active_vercel_quiesce_evidence_id is distinct from
         prior_identifier
       or not exists (
         select 1
         from production_control.google_writer_provider_fences fence
         where fence.fence_id =
             activation.active_google_writer_provider_fence_id
           and fence.status = 'INSTALLED'
           and fence.active_verification_id =
             activation.active_google_writer_provider_verification_id
           and fence.quiesce_evidence_id = prior_identifier
           and fence.candidate_deployment_id =
             input->>'candidate_deployment_id'
           and fence.candidate_deployment_commit =
             pg_catalog.lower(input->>'candidate_deployment_commit')
       )
       or gate.google_writer_provider_fence_id is distinct from
         activation.active_google_writer_provider_fence_id
       or gate.google_writer_provider_verification_id is distinct from
         activation.active_google_writer_provider_verification_id
       or not (
         (
           activation.state in ('GOOGLE_LEASE_ARMED', 'CUTOVER_PREPARED')
           and activation.read_cutover_phase = 'CURRENT_READS'
           and activation.current_authority = 'GOOGLE'
           and not activation.scoring_ingress_enabled
           and activation.first_supabase_write_possible_at is null
           and activation.first_supabase_write_observed_at is null
           and resource.scoring_authority = 'GOOGLE'
           and resource.participant_identity_authority = 'SUPABASE'
           and resource.current_tournament_read_authority = 'SUPABASE'
           and resource.public_supabase_reads_enabled
           and resource.auth_user_creation_enabled
           and not resource.scoring_ingress_enabled
           and not resource.workers_enabled
           and gate.authority = 'GOOGLE'
           and gate.admission_protocol_enforced
           and (
             (activation.state = 'GOOGLE_LEASE_ARMED'
               and gate.state = 'OPEN' and gate.admission_state = 'OPEN'
               and gate.active_closure_id is null)
             or (gate.state = 'PAUSED'
               and gate.admission_state in ('CLOSING', 'CLOSED')
               and exists (
                 select 1
                 from production_control.scoring_admission_closures closure
                 where closure.closure_id = gate.active_closure_id
                   and closure.closure_kind = 'LEGACY_ADMISSION'
                   and closure.authority = 'GOOGLE'
                   and closure.status in ('CLOSING', 'CLOSED')
               ))
           )
         )
         or (
           activation.state in ('SCORING_COMMITTED', 'ROLLBACK_PREPARED')
           and activation.read_cutover_phase = 'CURRENT_READS'
           and activation.current_authority = 'SUPABASE'
           and activation.scoring_ingress_enabled
           and activation.first_supabase_write_possible_at is not null
           and resource.scoring_authority = 'SUPABASE'
           and resource.participant_identity_authority = 'SUPABASE'
           and resource.current_tournament_read_authority = 'SUPABASE'
           and resource.public_supabase_reads_enabled
           and resource.auth_user_creation_enabled
           and resource.scoring_ingress_enabled
           and gate.authority = 'SUPABASE'
           and gate.admission_state = 'CLOSED'
           and gate.admission_protocol_enforced
           and (
             (activation.state = 'SCORING_COMMITTED'
               and gate.state = 'OPEN'
               and exists (
                 select 1
                 from production_control.scoring_admission_closures closure
                 where closure.closure_id = gate.active_closure_id
                   and closure.closure_kind = 'LEGACY_ADMISSION'
                   and closure.authority = 'GOOGLE'
                   and closure.status = 'CONSUMED'
               ))
             or (gate.state = 'PAUSED'
               and exists (
                 select 1
                 from production_control.scoring_admission_closures closure
                 where closure.closure_id = gate.active_closure_id
                   and closure.closure_kind = 'SUPABASE_INGRESS'
                   and closure.authority = 'SUPABASE'
                   and closure.status in ('CLOSING', 'CLOSED')
               ))
           )
         )
         or (
           activation.state in ('DORMANT', 'ROLLED_BACK')
           and activation.current_authority = 'GOOGLE'
           and not activation.scoring_ingress_enabled
           and activation.active_transition_epoch_id is null
           and resource.scoring_authority = 'GOOGLE'
           and resource.participant_identity_authority = 'PASSPORT'
           and resource.current_tournament_read_authority = 'GOOGLE'
           and not resource.public_supabase_reads_enabled
           and not resource.auth_user_creation_enabled
           and not resource.scoring_ingress_enabled
           and not resource.workers_enabled
           and gate.state = 'PAUSED'
           and gate.authority = 'GOOGLE'
           and gate.admission_state = 'OPEN'
           and not gate.admission_protocol_enforced
           and gate.active_closure_id is null
           and gate.external_fence_evidence_id is null
         )
       )
     )) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_START_STATE_INVALID';
  end if;

  insert into production_control.vercel_writer_quiesce_evidence (
    evidence_id, prior_evidence_id, evidence_request_id,
    begin_request_fingerprint, begin_payload_hash, purpose, vercel_project_id,
    routing_rule_id, routing_rule_revision, routing_rule_scope,
    candidate_deployment_id, candidate_deployment_commit,
    candidate_deployment_target, candidate_credential_generation,
    main_branch_alias_origin,
    candidate_alias_origin, candidate_immutable_origin,
    origin_inventory, origin_inventory_count, origin_inventory_fingerprint,
    live_origin_inventory, live_origin_inventory_count,
    live_origin_inventory_fingerprint,
    first_probe_records, first_probe_fingerprint, probe_scope_fingerprint,
    credential_generation_fingerprint,
    provider_inventory_schema,
    retained_provider_inventory_count, retained_provider_inventory_fingerprint,
    live_provider_inventory_count, live_provider_inventory_fingerprint,
    routing_rule_all_method_fence_required_host_count,
    routing_rule_all_method_fence_required_hosts_fingerprint,
    routing_rule_all_method_fence_required_path_count,
    routing_rule_all_method_fence_required_paths_fingerprint,
    credential_confinement_evidence_schema,
    credential_confinement_record_count,
    credential_confinement_records_fingerprint,
    credential_confinement_evidence_fingerprint,
    authenticated_actor_fingerprint,
    owner_principal_fingerprint, owner_override_operationally_frozen,
    owner_acknowledged_at, owner_freeze_expires_at, actor_id
  ) values (
    evidence_identifier, prior_identifier, request_identifier,
    pg_catalog.lower(input->>'request_fingerprint'), payload_hash,
    purpose_value,
    input->>'vercel_project_id', input->>'routing_rule_id',
    input->>'routing_rule_revision', input->>'routing_rule_scope',
    input->>'candidate_deployment_id',
    pg_catalog.lower(input->>'candidate_deployment_commit'),
    input->>'candidate_deployment_target',
    input->>'candidate_credential_generation',
    pg_catalog.lower(input->>'main_branch_alias_origin'),
    pg_catalog.lower(input->>'candidate_alias_origin'),
    pg_catalog.lower(input->>'candidate_immutable_origin'),
    normalized_inventory, pg_catalog.jsonb_array_length(normalized_inventory),
    production_control.vercel_origin_inventory_fingerprint(normalized_inventory),
    normalized_live_inventory,
    pg_catalog.jsonb_array_length(normalized_live_inventory),
    production_control.vercel_origin_inventory_fingerprint(
      normalized_live_inventory
    ),
    normalized_probes,
    production_control.structured_evidence_fingerprint(normalized_probes),
    probe_scope_fingerprint,
    production_control.structured_evidence_fingerprint(
      pg_catalog.jsonb_build_object(
        'origin_inventory_fingerprint',
          production_control.vercel_origin_inventory_fingerprint(
            normalized_inventory
          ),
        'live_origin_inventory_fingerprint',
          production_control.vercel_origin_inventory_fingerprint(
            normalized_live_inventory
          ),
        'provider_inventory_schema', input->>'provider_inventory_schema',
        'retained_provider_inventory_fingerprint',
          input->>'retained_provider_inventory_fingerprint',
        'live_provider_inventory_fingerprint',
          input->>'live_provider_inventory_fingerprint',
        'routing_rule_all_method_fence_required_host_count',
          input->'routing_rule_all_method_fence_required_host_count',
        'routing_rule_all_method_fence_required_hosts_fingerprint',
          input->>'routing_rule_all_method_fence_required_hosts_fingerprint',
        'routing_rule_all_method_fence_required_path_count',
          input->'routing_rule_all_method_fence_required_path_count',
        'routing_rule_all_method_fence_required_paths_fingerprint',
          input->>'routing_rule_all_method_fence_required_paths_fingerprint',
        'production_target_capabilities',
          '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb,
        'project_preview_capabilities',
          '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1","POTENTIAL_PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb,
        'candidate_credential_generation',
          input->>'candidate_credential_generation'
      )
    ),
    input->>'provider_inventory_schema',
    (input->>'retained_provider_inventory_count')::integer,
    input->>'retained_provider_inventory_fingerprint',
    (input->>'live_provider_inventory_count')::integer,
    input->>'live_provider_inventory_fingerprint',
    (input->>'routing_rule_all_method_fence_required_host_count')::integer,
    input->>'routing_rule_all_method_fence_required_hosts_fingerprint',
    (input->>'routing_rule_all_method_fence_required_path_count')::integer,
    input->>'routing_rule_all_method_fence_required_paths_fingerprint',
    input->>'credential_confinement_evidence_schema',
    (input->>'credential_confinement_record_count')::integer,
    input->>'credential_confinement_records_fingerprint',
    input->>'credential_confinement_evidence_fingerprint',
    pg_catalog.lower(input->>'authenticated_actor_fingerprint'),
    pg_catalog.lower(input->>'owner_principal_fingerprint'), true,
    owner_acknowledged, owner_freeze_expires,
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into evidence;

  provider_attestation :=
    production_control.record_verified_vercel_provider_attestation(
      evidence.evidence_id, 'BEGIN', evidence.begin_request_fingerprint,
      input->'provider_attestation'
    );

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_VERCEL_WRITER_QUIESCE_DRAIN_STARTED',
    'SCORING_AUTHORITY', '2026', evidence.actor_id,
    evidence.begin_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'evidence_id', evidence.evidence_id,
      'purpose', evidence.purpose,
      'candidate_deployment_id', evidence.candidate_deployment_id,
      'candidate_deployment_commit', evidence.candidate_deployment_commit,
      'routing_rule_id', evidence.routing_rule_id,
      'routing_rule_revision', evidence.routing_rule_revision,
      'provider_attestation_id', provider_attestation.attestation_id,
      'provider_attestation_fingerprint',
        provider_attestation.attestation_fingerprint,
      'provider_attestation_signer_key_fingerprint',
        provider_attestation.signer_key_fingerprint,
      'provider_attestation_signer_key_version',
        provider_attestation.signer_key_version,
      'vercel_team_id', provider_attestation.vercel_team_id,
      'live_origin_inventory_count',
        provider_attestation.live_origin_inventory_count,
      'live_origin_inventory_fingerprint',
        provider_attestation.live_origin_inventory_fingerprint,
      'redacted_environment_scope_fingerprint',
        provider_attestation.redacted_environment_scope_fingerprint,
      'origin_inventory_count', evidence.origin_inventory_count,
      'origin_inventory_fingerprint', evidence.origin_inventory_fingerprint,
      'provider_inventory_schema', evidence.provider_inventory_schema,
      'retained_provider_inventory_fingerprint',
        evidence.retained_provider_inventory_fingerprint,
      'live_provider_inventory_fingerprint',
        evidence.live_provider_inventory_fingerprint,
      'first_probe_fingerprint', evidence.first_probe_fingerprint,
      'drain_started_at', evidence.drain_started_at
    )
  );
  return production_control.vercel_quiesce_response(evidence, false);
end;
$$;



create or replace function public.issue_production_vercel_provider_attestation_challenge(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  response_value jsonb;
  routing_audit jsonb;
  v3_input jsonb;
begin
  perform production_control.assert_exact_vercel_routing_rule_audit(input);
  v3_input := input - array[
    'routing_rule_global_invocation_quiescence_proved',
    'routing_rule_candidate_control_host_count',
    'routing_rule_candidate_control_hosts_fingerprint',
    'routing_rule_canonical_apex_safe_method_count',
    'routing_rule_canonical_apex_safe_methods_fingerprint',
    'routing_rule_canonical_apex_safe_method_writer_route_count',
    'routing_rule_canonical_apex_safe_method_writer_routes_fingerprint'
  ];
  response_value :=
    public.issue_vercel_provider_attestation_v4_candidate_base(v3_input);
  routing_audit :=
    production_control.bind_current_vercel_routing_rule_audit(
      'CHALLENGE', (response_value->>'challenge_id')::uuid, true, input
    );
  return response_value || routing_audit;
end;
$$;

create or replace function public.consume_production_vercel_provider_attestation_challenge(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  provider_claim jsonb := input->'provider_attestation';
  v3_input jsonb;
  response_value jsonb;
  routing_audit jsonb;
  alias_capture production_control.vercel_provider_alias_captures%rowtype;
begin
  perform production_control.assert_exact_vercel_routing_rule_audit(
    provider_claim
  );
  v3_input := pg_catalog.jsonb_set(
    input,
    '{provider_attestation}',
    provider_claim - array[
      'routing_rule_hostname_operator',
      'routing_rule_canonical_hostname',
      'routing_rule_earlier_active_bypass_rule_count',
      'routing_rule_global_invocation_quiescence_proved',
      'routing_rule_candidate_control_host_count',
      'routing_rule_candidate_control_hosts_fingerprint',
      'routing_rule_canonical_apex_safe_method_count',
      'routing_rule_canonical_apex_safe_methods_fingerprint',
      'routing_rule_canonical_apex_safe_method_writer_route_count',
      'routing_rule_canonical_apex_safe_method_writer_routes_fingerprint',
      'candidate_alias_origin',
      'candidate_immutable_origin',
      'alias_inventory_count',
      'alias_inventory_fingerprint',
      'alias_inventory_records',
      'alias_pagination_page_count',
      'alias_pagination_fingerprint'
    ],
    true
  );
  response_value :=
    public.consume_vercel_provider_attestation_v3_base(v3_input);
  routing_audit :=
    production_control.bind_current_vercel_routing_rule_audit(
      'ATTESTATION', (response_value->>'attestation_id')::uuid, true,
      provider_claim
    );
  alias_capture := production_control.record_current_vercel_alias_capture(
    (response_value->>'attestation_id')::uuid, provider_claim
  );
  return response_value || routing_audit || pg_catalog.jsonb_build_object(
    'alias_inventory_count', alias_capture.alias_inventory_count,
    'alias_inventory_fingerprint', alias_capture.alias_inventory_fingerprint,
    'alias_inventory_records', alias_capture.alias_inventory_records,
    'alias_pagination_page_count', alias_capture.alias_pagination_page_count,
    'alias_pagination_fingerprint', alias_capture.alias_pagination_fingerprint
  );
end;
$$;

create or replace function public.begin_production_vercel_writer_quiesce_evidence(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  response_value jsonb;
  routing_audit jsonb;
  alias_recaptures jsonb;
  v3_input jsonb;
  evidence production_control.vercel_writer_quiesce_evidence%rowtype;
  waf_epoch production_control.vercel_writer_critical_waf_epochs%rowtype;
  waf_observation
    production_control.vercel_writer_critical_waf_observations%rowtype;
  was_idempotent boolean;
begin
  perform production_control.assert_exact_vercel_routing_rule_audit(input);
  if pg_catalog.jsonb_typeof(input->'owner_freeze_ttl_seconds') is distinct from
       'number'
     or input->>'owner_freeze_ttl_seconds' is distinct from '2100'
     or pg_catalog.upper(coalesce(input->>'purpose', '')) not in (
       'REHEARSAL', 'CUTOVER'
     )
     or (
       pg_catalog.upper(input->>'purpose') = 'REHEARSAL'
       and input->>'owner_freeze_confirmation' is distinct from
         'I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS REHEARSAL'
     )
     or (
       pg_catalog.upper(input->>'purpose') = 'CUTOVER'
       and input->>'owner_freeze_confirmation' is distinct from
         'I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS PRODUCTION CUTOVER'
     )
     or coalesce(input->>'critical_waf_epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'critical_waf_observation_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or input->>'critical_waf_quiesce_stage' not in (
       'INSTALL', 'RESTORE_REATTEST'
     )
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_OWNER_FREEZE_V4_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict waf_epoch
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_id = (input->>'critical_waf_epoch_id')::uuid
  for update;
  select * into strict waf_observation
  from production_control.vercel_writer_critical_waf_observations value
  where value.observation_id = (input->>'critical_waf_observation_id')::uuid
    and value.epoch_id = waf_epoch.epoch_id;
  if waf_epoch.purpose is distinct from
       pg_catalog.upper(input->>'purpose')
     or waf_epoch.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or waf_epoch.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or waf_observation.expires_at <= pg_catalog.clock_timestamp()
     or (input->>'critical_waf_quiesce_stage' = 'INSTALL' and (
       waf_epoch.status is distinct from 'ACTIVE_UNBOUND'
       or waf_epoch.critical_active_observation_id is distinct from
         waf_observation.observation_id
       or waf_observation.evidence_stage is distinct from 'CRITICAL_ACTIVE'
     ))
     or (input->>'critical_waf_quiesce_stage' = 'RESTORE_REATTEST' and (
       waf_epoch.status is distinct from 'FENCE_BOUND'
       or waf_observation.evidence_stage is distinct from 'CRITICAL_REATTEST'
       or waf_epoch.latest_critical_reattest_observation_id is distinct from
         waf_observation.observation_id
     ))
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_CRITICAL_WAF_NOT_ACTIVE';
  end if;
  v3_input := input - array[
    'routing_rule_global_invocation_quiescence_proved',
    'routing_rule_candidate_control_host_count',
    'routing_rule_candidate_control_hosts_fingerprint',
    'routing_rule_canonical_apex_safe_method_count',
    'routing_rule_canonical_apex_safe_methods_fingerprint',
    'routing_rule_canonical_apex_safe_method_writer_route_count',
    'routing_rule_canonical_apex_safe_method_writer_routes_fingerprint',
    'critical_waf_epoch_id', 'critical_waf_observation_id',
    'critical_waf_quiesce_stage'
  ];
  -- The immutable v3 base continues to validate its historical 1800-second
  -- request epoch.  The v4 wrapper owns the only exact 2100-second contract
  -- and extends only the newly returned v4 evidence row in this transaction;
  -- historical v3/v2 rows are never reinterpreted or rewritten.
  v3_input := pg_catalog.jsonb_set(
    v3_input, '{owner_freeze_ttl_seconds}', '1800'::jsonb, true
  );
  response_value :=
    public.begin_vercel_writer_quiesce_v4_candidate_base(v3_input);
  was_idempotent := coalesce(
    (response_value->>'idempotent')::boolean, false
  );
  update production_control.vercel_writer_quiesce_evidence value
  set owner_freeze_expires_at =
        value.owner_acknowledged_at + interval '2100 seconds',
      critical_waf_epoch_id = coalesce(
        value.critical_waf_epoch_id, waf_epoch.epoch_id
      ),
      critical_waf_observation_id = coalesce(
        value.critical_waf_observation_id, waf_observation.observation_id
      ),
      critical_waf_quiesce_stage = coalesce(
        value.critical_waf_quiesce_stage,
        input->>'critical_waf_quiesce_stage'
      ),
      updated_at = greatest(value.updated_at, pg_catalog.clock_timestamp())
  where value.evidence_id = (response_value->>'evidence_id')::uuid
    and value.owner_freeze_expires_at =
      value.owner_acknowledged_at + interval '1800 seconds'
  returning * into evidence;
  if not found then
    select * into strict evidence
    from production_control.vercel_writer_quiesce_evidence value
    where value.evidence_id = (response_value->>'evidence_id')::uuid;
  end if;
  if evidence.owner_freeze_expires_at is distinct from
       evidence.owner_acknowledged_at + interval '2100 seconds'
     or evidence.critical_waf_epoch_id is distinct from waf_epoch.epoch_id
     or evidence.critical_waf_observation_id is distinct from
       waf_observation.observation_id
     or evidence.critical_waf_quiesce_stage is distinct from
       input->>'critical_waf_quiesce_stage'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_OWNER_FREEZE_V4_MISMATCH';
  end if;
  routing_audit :=
    production_control.bind_current_vercel_routing_rule_audit(
      'QUIESCE', (response_value->>'evidence_id')::uuid, true, input
    );
  alias_recaptures := production_control.assert_current_vercel_alias_recaptures(
    (response_value->>'evidence_id')::uuid, 1
  );
  return production_control.vercel_quiesce_response(
    evidence, was_idempotent
  ) || routing_audit || alias_recaptures;
end;
$$;

create or replace function public.finalize_production_vercel_writer_quiesce_evidence(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  response_value jsonb;
  routing_audit jsonb;
  alias_recaptures jsonb;
  v3_input jsonb;
  evidence production_control.vercel_writer_quiesce_evidence%rowtype;
  waf_epoch production_control.vercel_writer_critical_waf_epochs%rowtype;
  waf_observation
    production_control.vercel_writer_critical_waf_observations%rowtype;
begin
  perform production_control.assert_exact_vercel_routing_rule_audit(input);
  routing_audit :=
    production_control.bind_current_vercel_routing_rule_audit(
      'QUIESCE', (input->>'evidence_id')::uuid, false, input
    );
  select * into strict evidence
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = (input->>'evidence_id')::uuid
  for update;
  if evidence.critical_waf_epoch_id is null
     or evidence.critical_waf_observation_id is null
     or evidence.critical_waf_quiesce_stage is null
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_CRITICAL_WAF_LINK_MISSING';
  end if;
  select * into strict waf_epoch
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_id = evidence.critical_waf_epoch_id
  for update;
  select * into strict waf_observation
  from production_control.vercel_writer_critical_waf_observations value
  where value.observation_id = evidence.critical_waf_observation_id
    and value.epoch_id = waf_epoch.epoch_id;
  if waf_epoch.status not in ('ACTIVE_UNBOUND', 'FENCE_BOUND')
     or waf_observation.expires_at <= pg_catalog.clock_timestamp()
     or (evidence.critical_waf_quiesce_stage = 'INSTALL' and
       waf_observation.evidence_stage is distinct from 'CRITICAL_ACTIVE')
     or (evidence.critical_waf_quiesce_stage = 'RESTORE_REATTEST' and (
       waf_epoch.status is distinct from 'FENCE_BOUND'
       or waf_observation.evidence_stage is distinct from 'CRITICAL_REATTEST'
       or waf_epoch.latest_critical_reattest_observation_id is distinct from
         waf_observation.observation_id
     ))
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_CRITICAL_WAF_FINALIZE_INVALID';
  end if;
  v3_input := input - array[
    'routing_rule_global_invocation_quiescence_proved',
    'routing_rule_candidate_control_host_count',
    'routing_rule_candidate_control_hosts_fingerprint',
    'routing_rule_canonical_apex_safe_method_count',
    'routing_rule_canonical_apex_safe_methods_fingerprint',
    'routing_rule_canonical_apex_safe_method_writer_route_count',
    'routing_rule_canonical_apex_safe_method_writer_routes_fingerprint',
    'critical_waf_epoch_id', 'critical_waf_observation_id',
    'critical_waf_quiesce_stage'
  ];
  response_value := public.finalize_vercel_writer_quiesce_v3_base(v3_input);
  alias_recaptures := production_control.assert_current_vercel_alias_recaptures(
    (response_value->>'evidence_id')::uuid, 2
  );
  return response_value || routing_audit || alias_recaptures;
end;
$$;

revoke all on function
  production_control.assert_exact_vercel_routing_rule_audit(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.normalized_vercel_alias_inventory(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.vercel_alias_inventory_fingerprint(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_exact_vercel_alias_inventory(
    jsonb, text, text, text, text, text
  ) from public, anon, authenticated, service_role;
revoke all on function
  production_control.guard_vercel_provider_alias_capture()
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.record_current_vercel_alias_capture(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.vercel_alias_recapture_response(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_current_vercel_alias_recaptures(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.bind_current_vercel_routing_rule_audit(
    text, uuid, boolean, jsonb
  ) from public, anon, authenticated, service_role;
revoke all on function production_control.vercel_provider_challenge_response_v3_base(
  production_control.vercel_provider_attestation_challenges, boolean
) from public, anon, authenticated, service_role;
revoke all on function production_control.vercel_provider_response_v3_base(
  production_control.vercel_provider_attestations, boolean
) from public, anon, authenticated, service_role;
revoke all on function production_control.vercel_quiesce_response_v3_base(
  production_control.vercel_writer_quiesce_evidence, boolean
) from public, anon, authenticated, service_role;
revoke all on function production_control.vercel_provider_attestation_challenge_response(
  production_control.vercel_provider_attestation_challenges, boolean
) from public, anon, authenticated, service_role;
revoke all on function production_control.vercel_provider_attestation_response(
  production_control.vercel_provider_attestations, boolean
) from public, anon, authenticated, service_role;
revoke all on function production_control.vercel_quiesce_response(
  production_control.vercel_writer_quiesce_evidence, boolean
) from public, anon, authenticated, service_role;

revoke all on function public.issue_vercel_provider_attestation_v3_base(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.consume_vercel_provider_attestation_v3_base(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_vercel_writer_quiesce_v3_base(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_vercel_writer_quiesce_v3_base(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.issue_vercel_provider_attestation_v4_candidate_base(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.begin_vercel_writer_quiesce_v4_candidate_base(jsonb)
  from public, anon, authenticated, service_role;

revoke all on function
  public.issue_production_vercel_provider_attestation_challenge(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.issue_production_vercel_provider_attestation_challenge(jsonb)
  to service_role;
revoke all on function
  public.consume_production_vercel_provider_attestation_challenge(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.consume_production_vercel_provider_attestation_challenge(jsonb)
  to service_role;
revoke all on function
  public.begin_production_vercel_writer_quiesce_evidence(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.begin_production_vercel_writer_quiesce_evidence(jsonb)
  to service_role;
revoke all on function
  public.finalize_production_vercel_writer_quiesce_evidence(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.finalize_production_vercel_writer_quiesce_evidence(jsonb)
  to service_role;

-- Admission v3 is an additive application contract over the historical v2
-- lease rows.  Historical rows remain readable with a NULL credential class;
-- only a successful v3 BEGIN binds the provider-fenceable class that makes an
-- expired, never-dispatched ADMITTED lease provably safe to retire.
alter table scoring_authority.scoring_ingress_leases
  add column provider_credential_class text,
  add column provider_principal_fingerprint text;

alter table scoring_authority.ingress_gates
  add column provider_principal_fingerprint text;

alter table scoring_authority.scoring_ingress_leases
  add constraint production_scoring_lease_provider_credential_class_check
  check (
    provider_credential_class is null
    or provider_credential_class = 'LEGACY_PROVIDER_FENCEABLE'
  );

alter table scoring_authority.scoring_ingress_leases
  add constraint production_scoring_lease_provider_principal_fingerprint_check
  check (
    provider_principal_fingerprint is null
    or provider_principal_fingerprint ~ '^[0-9a-f]{64}$'
  );

alter table scoring_authority.ingress_gates
  add constraint production_scoring_gate_provider_principal_fingerprint_check
  check (
    provider_principal_fingerprint is null
    or provider_principal_fingerprint ~ '^[0-9a-f]{64}$'
  );

-- A provider fence is a durable reservation from its first INSTALLING row.
-- This trigger is the last-line database boundary for both fresh inserts and
-- ADMITTED replay nonce/expiry rotation, including direct callers of the
-- historical v2 function.  The shared admission lock linearizes it with the
-- exclusive provider-fence install/finish/abort/close operations.
create or replace function production_control.guard_scoring_admission_against_provider_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  admission_attempt boolean;
begin
  admission_attempt := new.protocol_version = 'ADMISSION_V2' and (
    tg_op = 'INSERT'
    or (
      tg_op = 'UPDATE'
      and new.resolution_state = 'ADMITTED'
      and (
        new.lease_nonce_hash is distinct from old.lease_nonce_hash
        or new.expires_at is distinct from old.expires_at
      )
    )
  );
  if not admission_attempt then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  if exists (
    select 1
    from production_control.google_writer_provider_fences value
    where value.status in ('INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED')
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_PROVIDER_FENCE_ADMISSION_RESERVED';
  end if;
  return new;
end;
$$;

create trigger guard_scoring_admission_against_provider_fence
before insert or update of lease_nonce_hash, expires_at
on scoring_authority.scoring_ingress_leases
for each row execute function
  production_control.guard_scoring_admission_against_provider_fence();

create or replace function production_control.google_writer_provider_fence_response(
  value production_control.google_writer_provider_fences,
  was_idempotent boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'found', true,
    'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_' || value.status,
    'fence_id', value.fence_id,
    'install_request_id', value.install_request_id,
    'status', value.status,
    'quiesce_evidence_id', value.quiesce_evidence_id,
    'candidate_deployment_id', value.candidate_deployment_id,
    'candidate_deployment_commit', value.candidate_deployment_commit,
    'baseline_provider_fingerprint', value.baseline_provider_fingerprint,
    'baseline_acl_fingerprint', value.baseline_acl_fingerprint,
    'baseline_canonical_value_fingerprint',
      value.baseline_canonical_value_fingerprint,
    'baseline_formula_fingerprint', value.baseline_formula_fingerprint,
    'baseline_combined_value_fingerprint',
      value.baseline_combined_value_fingerprint,
    'writer_scope_fingerprint', value.writer_scope_fingerprint,
    'protection_description_prefix', value.protection_description_prefix,
    'active_verification_id', value.active_verification_id,
    'removal_request_id', value.removal_request_id,
    'installing_at', value.installing_at,
    'installed_at', value.installed_at,
    'removal_authorized_at', value.removal_authorized_at,
    'removed_at', value.removed_at,
    'failure_code', value.failure_code,
    'admission_reservation_active',
      value.status in ('INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED'),
    'admission_reservation_state', case
      when value.status in ('INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED')
        then 'HELD'
      else 'RELEASED'
    end,
    'idempotent', was_idempotent
  )
$$;

create or replace function public.begin_production_scoring_ingress_v3(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  response_value jsonb;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  operation_request uuid;
  expected_provider_principal text;
  remaining_dispatch_ms bigint;
begin
  if coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_INGRESS_V3_REQUEST_INVALID';
  end if;
  operation_request := (input->>'operation_request_id')::uuid;
  expected_provider_principal :=
    pg_catalog.lower(input->>'expected_provider_principal_fingerprint');
  if coalesce(expected_provider_principal, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_INGRESS_V3_PROVIDER_PRINCIPAL_REQUIRED';
  end if;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for share;
  if gate.provider_principal_fingerprint is distinct from
       expected_provider_principal
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_INGRESS_V3_PROVIDER_PRINCIPAL_MISMATCH';
  end if;
  response_value := public.begin_production_scoring_ingress_v2(input);
  if coalesce(response_value->>'lease_id', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_INGRESS_V3_RECEIPT_MISMATCH';
  end if;
  select * into lease
  from scoring_authority.scoring_ingress_leases value
  where value.tournament_id = '2026'
    and value.protocol_version = 'ADMISSION_V2'
    and value.operation_request_id = operation_request
    and value.lease_id = (response_value->>'lease_id')::uuid
  for update;
  if not found
     or lease.request_payload_hash is distinct from
       production_control.scoring_admission_begin_payload_hash(input)
     or lease.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or lease.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or lease.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or lease.admitted_activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or lease.writer_intent is distinct from 'CANONICAL_LEGACY'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_INGRESS_V3_RECEIPT_MISMATCH';
  end if;
  if lease.provider_credential_class is null
     and lease.provider_principal_fingerprint is null then
    update scoring_authority.scoring_ingress_leases
    set provider_credential_class = 'LEGACY_PROVIDER_FENCEABLE',
        provider_principal_fingerprint = expected_provider_principal
    where lease_id = lease.lease_id
    returning * into lease;
  elsif lease.provider_credential_class is distinct from
      'LEGACY_PROVIDER_FENCEABLE'
     or lease.provider_principal_fingerprint is distinct from
       expected_provider_principal then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_INGRESS_V3_CREDENTIAL_OR_PRINCIPAL_MISMATCH';
  end if;
  perform production_control.assert_production_scoring_lease_nonce(
    lease, input->>'lease_nonce'
  );
  remaining_dispatch_ms := greatest(
    0::bigint,
    pg_catalog.floor(extract(epoch from (
      lease.expires_at - pg_catalog.clock_timestamp()
    )) * 1000)::bigint
  );
  return response_value || pg_catalog.jsonb_build_object(
    'contract_version', 'ADMISSION_V3',
    'expires_at', lease.expires_at,
    'remaining_dispatch_ms', remaining_dispatch_ms,
    'lease_nonce', pg_catalog.lower(input->>'lease_nonce'),
    'operation_request_id', lease.operation_request_id,
    'provider_credential_class', lease.provider_credential_class,
    'provider_principal_fingerprint', lease.provider_principal_fingerprint,
    'provider_dispatch_must_begin_before_expires_at', true,
    'replay_usable',
      coalesce((response_value->>'replay_usable')::boolean, false)
      and lease.resolution_state = 'ADMITTED'
      and remaining_dispatch_ms > 0
  );
end;
$$;

-- The unsuffixed bridge follows the intended application contract.  v2 stays
-- installed for the v3 wrapper and historical receipt semantics, but is no
-- longer directly callable by service_role after the ACL block below.
create or replace function public.begin_production_scoring_ingress(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return public.begin_production_scoring_ingress_v3(input);
end;
$$;

-- Drive role terminality is proved by the exact monotone writer-to-reader
-- transition plus a fresh legacy-token readback (canEdit=false,
-- canShare=false).  The subsequent 190+10 sequence is deliberately separate:
-- it settles Sheets mutations that may already have crossed the provider
-- boundary before the global WAF became active.  The retired protected-range
-- columns remain empty compatibility storage only; they are never an ACL-v2
-- close predicate.
create table production_control.google_writer_provider_fence_settlement_observations (
  observation_id uuid primary key,
  fence_id uuid not null references
    production_control.google_writer_provider_fences(fence_id)
    on delete restrict,
  stage text not null check (stage in (
    'ACL_READER_CONFIRMED',
    'SETTLEMENT_READBACK_1',
    'SETTLEMENT_READBACK_2'
  )),
  observation_request_id uuid not null unique,
  request_fingerprint text not null unique
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  prior_observation_id uuid references
    production_control.google_writer_provider_fence_settlement_observations(
      observation_id
    ) on delete restrict,
  protection_records jsonb not null
    check (protection_records = '[]'::jsonb),
  protection_set_fingerprint text not null
    check (protection_set_fingerprint ~ '^[0-9a-f]{64}$'),
  provider_fingerprint text not null
    check (provider_fingerprint ~ '^[0-9a-f]{64}$'),
  acl_fingerprint text not null
    check (acl_fingerprint ~ '^[0-9a-f]{64}$'),
  canonical_value_fingerprint text not null
    check (canonical_value_fingerprint ~ '^[0-9a-f]{64}$'),
  combined_value_fingerprint text not null
    check (combined_value_fingerprint ~ '^[0-9a-f]{64}$'),
  formula_fingerprint text not null
    check (formula_fingerprint ~ '^[0-9a-f]{64}$'),
  structural_canary_fingerprint text not null
    check (structural_canary_fingerprint ~ '^[0-9a-f]{64}$'),
  permission_inventory_fingerprint text not null
    check (permission_inventory_fingerprint ~ '^[0-9a-f]{64}$'),
  legacy_role text not null check (legacy_role = 'reader'),
  legacy_can_edit boolean not null check (not legacy_can_edit),
  legacy_can_share boolean not null check (not legacy_can_share),
  legacy_edit_capability_fingerprint text not null
    check (legacy_edit_capability_fingerprint ~ '^[0-9a-f]{64}$'),
  acl_transition_intent_fingerprint text not null
    check (acl_transition_intent_fingerprint ~ '^[0-9a-f]{64}$'),
  acl_transition_proof_fingerprint text not null
    check (acl_transition_proof_fingerprint ~ '^[0-9a-f]{64}$'),
  acl_transition_proof jsonb not null check (
    pg_catalog.jsonb_typeof(acl_transition_proof) = 'object'
  ),
  provider_observed_at timestamptz not null,
  activation_revision bigint not null check (activation_revision >= 0),
  authority_generation_id uuid not null,
  admission_generation_id uuid not null,
  admission_revision bigint not null check (admission_revision >= 0),
  recorded_at timestamptz not null default pg_catalog.now(),
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  authenticated_actor_fingerprint text not null
    check (authenticated_actor_fingerprint ~ '^[0-9a-f]{64}$'),
  unique (fence_id, stage),
  check (
    (stage = 'ACL_READER_CONFIRMED' and prior_observation_id is null)
    or (stage <> 'ACL_READER_CONFIRMED' and prior_observation_id is not null)
  )
);

alter table
  production_control.google_writer_provider_fence_settlement_observations
  enable row level security;

create or replace function production_control.insert_google_writer_provider_fence_settlement_observation(
  target_fence_id uuid,
  target_stage text,
  input jsonb
)
returns production_control.google_writer_provider_fence_settlement_observations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
  quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  prior
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
  installed
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
  existing
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
  inserted
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
  request_identifier uuid;
  prior_identifier uuid;
  empty_retired_protections jsonb := '[]'::jsonb;
  empty_retired_protections_fingerprint text :=
    production_control.structured_evidence_fingerprint('[]'::jsonb);
  install_dispatch record;
  observed_at_value timestamptz;
  captured_at_value timestamptz := pg_catalog.now();
  payload_hash_value text := production_control.cutover_payload_hash(input);
begin
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if target_stage not in (
       'ACL_READER_CONFIRMED',
       'SETTLEMENT_READBACK_1',
       'SETTLEMENT_READBACK_2'
     )
     or coalesce(input->>'observation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'provider_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'acl_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'canonical_value_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'combined_value_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'formula_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'structural_canary_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'permission_inventory_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or input->>'legacy_role' is distinct from 'reader'
     or input->'legacy_can_edit' is distinct from 'false'::jsonb
     or input->'legacy_can_share' is distinct from 'false'::jsonb
     or coalesce(input->>'legacy_edit_capability_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'acl_transition_intent_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'acl_transition_proof_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'acl_transition_proof') is distinct from
       'object'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_SETTLEMENT_INPUT_INVALID';
  end if;
  request_identifier := (input->>'observation_request_id')::uuid;
  -- Public settlement callers hold scoring_admission_lock_key() before entering
  -- this helper. Resolve the durable request identity under that same lock and
  -- before freshness checks: an exact lost-response replay remains recoverable
  -- after its observation ages, while every changed field is bound by the
  -- immutable request fingerprint and full canonical payload hash.
  select * into existing
  from production_control.google_writer_provider_fence_settlement_observations value
  where value.observation_request_id = request_identifier;
  if found then
    if existing.fence_id is distinct from target_fence_id
       or existing.stage is distinct from target_stage
       or existing.request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or existing.payload_hash is distinct from payload_hash_value
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_SETTLEMENT_IDEMPOTENCY_CONFLICT';
    end if;
    return existing;
  end if;

  observed_at_value := (input->>'provider_observed_at')::timestamptz;
  -- The 190-second DB gate carries only a ten-second margin over the required
  -- provider settlement interval. Limit snapshot transport age to five
  -- seconds so readback 1 still proves more than 180 seconds of provider-side
  -- stability. The same bound applies independently to every observation.
  if observed_at_value < captured_at_value - interval '5 seconds'
     or observed_at_value > captured_at_value + interval '30 seconds'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_SETTLEMENT_OBSERVATION_STALE';
  end if;
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = target_fence_id
  for update;
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
  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = fence.quiesce_evidence_id
  for update;
  select * into strict install_dispatch
  from production_control.google_writer_provider_fence_install_dispatches value
  where value.fence_id = fence.fence_id
    and value.outcome_status = 'TARGET_CONFIRMED'
  order by value.attempt desc
  limit 1
  for update;
  if fence.status is distinct from 'INSTALLING'
     or fence.install_request_id is distinct from
       (input->>'install_request_id')::uuid
     or fence.quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or fence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or fence.actor_id is distinct from input->>'actor_id'
     or fence.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
     or quiesce.status is distinct from 'VERIFIED'
     or quiesce.purpose is distinct from fence.lifecycle_mode
     or quiesce.expires_at <= pg_catalog.clock_timestamp()
     or quiesce.owner_freeze_expires_at <= pg_catalog.clock_timestamp()
     or not exists (
       select 1
       from production_control.vercel_routing_rule_audit_bindings audit
       where audit.quiesce_evidence_id = quiesce.evidence_id
         and audit.routing_rule_global_invocation_quiescence_proved
         and audit.routing_rule_candidate_control_host_count = 2
         and audit.routing_rule_canonical_apex_safe_method_count = 3
         and audit.routing_rule_canonical_apex_safe_method_writer_route_count = 10
     )
     or install_dispatch.outcome_status is distinct from 'TARGET_CONFIRMED'
     or install_dispatch.provider_mutation_class is distinct from
       'DRIVE_LEGACY_PERMISSION_WRITER_TO_READER_V1'
     or install_dispatch.source_role is distinct from 'writer'
     or install_dispatch.target_role is distinct from 'reader'
     or install_dispatch.transition_intent_fingerprint is distinct from
       pg_catalog.lower(input->>'acl_transition_intent_fingerprint')
     or install_dispatch.transition_proof_fingerprint is distinct from
       pg_catalog.lower(input->>'acl_transition_proof_fingerprint')
     or install_dispatch.transition_proof is distinct from
       input->'acl_transition_proof'
     or input->'acl_transition_proof'->>'schemaVersion' is distinct from
       'step12-production-google-drive-acl-transition-proof-v1'
     or input->'acl_transition_proof'->>'workbookId' is distinct from
       fence.source_workbook_id
     or input->'acl_transition_proof'->>'fenceId' is distinct from
       fence.fence_id::text
     or input->'acl_transition_proof'->>'installRequestId' is distinct from
       fence.install_request_id::text
     or input->'acl_transition_proof'->>'transitionPhase' is distinct from
       'INSTALL'
     or input->'acl_transition_proof'->>'providerMutationClass' is distinct from
       install_dispatch.provider_mutation_class
     or input->'acl_transition_proof'->>'priorRole' is distinct from 'writer'
     or input->'acl_transition_proof'->>'currentRole' is distinct from 'reader'
     or input->'acl_transition_proof'->'currentLegacyCanEdit' is distinct from
       'false'::jsonb
     or input->'acl_transition_proof'->'currentLegacyCanShare' is distinct from
       'false'::jsonb
     or input->'acl_transition_proof'->>'transitionFingerprint' is distinct from
       install_dispatch.transition_proof_fingerprint
     or pg_catalog.lower(input->>'canonical_value_fingerprint')
       is distinct from fence.baseline_canonical_value_fingerprint
     or pg_catalog.lower(input->>'combined_value_fingerprint')
       is distinct from fence.baseline_combined_value_fingerprint
     or pg_catalog.lower(input->>'formula_fingerprint') is distinct from
       fence.baseline_formula_fingerprint
     or observed_at_value < fence.installing_at
     or (fence.lifecycle_mode = 'CUTOVER' and (
       activation.state is distinct from 'GOOGLE_LEASE_ARMED'
       or resource.participant_identity_authority is distinct from 'SUPABASE'
       or resource.current_tournament_read_authority is distinct from 'SUPABASE'
       or gate.state is distinct from 'OPEN'
       or not gate.admission_protocol_enforced
     ))
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       activation.state is distinct from 'DORMANT'
       or resource.participant_identity_authority is distinct from 'PASSPORT'
       or resource.current_tournament_read_authority is distinct from 'GOOGLE'
       or gate.state is distinct from 'PAUSED'
       or gate.admission_protocol_enforced
     ))
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.active_google_writer_provider_fence_id is not null
     or resource.scoring_authority is distinct from 'GOOGLE'
     or (fence.lifecycle_mode = 'CUTOVER' and
       (not resource.public_supabase_reads_enabled or
        not resource.auth_user_creation_enabled))
     or (fence.lifecycle_mode = 'REHEARSAL' and
       (resource.public_supabase_reads_enabled or
        resource.auth_user_creation_enabled))
     or resource.scoring_ingress_enabled
     or resource.workers_enabled
     or gate.authority is distinct from 'GOOGLE'
     or gate.admission_state is distinct from 'OPEN'
     or gate.active_closure_id is not null
     or gate.external_fence_evidence_id is not null
     or gate.google_writer_provider_fence_id is not null
     or gate.google_writer_provider_verification_id is not null
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or (fence.lifecycle_mode = 'CUTOVER' and (
       gate.admission_deployment_id is distinct from input->>'deployment_id'
       or activation.expected_deployment_commit is distinct from
         pg_catalog.lower(input->>'deployment_commit')
     ))
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       input->>'deployment_id' is distinct from fence.candidate_deployment_id
       or pg_catalog.lower(input->>'deployment_commit') is distinct from
         fence.candidate_deployment_commit
     ))
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_SETTLEMENT_SCOPE_DRIFT';
  end if;

  select * into installed
  from production_control.google_writer_provider_fence_settlement_observations value
  where value.fence_id = fence.fence_id
    and value.stage = 'ACL_READER_CONFIRMED'
  for update;

  if target_stage = 'ACL_READER_CONFIRMED' then
    if found or input->>'prior_observation_id' is not null then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_SETTLEMENT_SEQUENCE_INVALID';
    end if;
    prior_identifier := null;
  else
    if not found
       or coalesce(input->>'prior_observation_id', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_SETTLEMENT_SEQUENCE_INVALID';
    end if;
    prior_identifier := (input->>'prior_observation_id')::uuid;
    if target_stage = 'SETTLEMENT_READBACK_1' then
      prior := installed;
      if prior_identifier is distinct from installed.observation_id
         or captured_at_value < installed.recorded_at + interval '190 seconds'
      then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_SETTLEMENT_WAIT_REQUIRED';
      end if;
    else
      select * into strict prior
      from production_control.google_writer_provider_fence_settlement_observations value
      where value.fence_id = fence.fence_id
        and value.stage = 'SETTLEMENT_READBACK_1'
      for update;
      if prior_identifier is distinct from prior.observation_id
         or captured_at_value < prior.recorded_at + interval '10 seconds'
         or observed_at_value < prior.recorded_at + interval '10 seconds'
      then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_SETTLEMENT_WAIT_REQUIRED';
      end if;
    end if;
    if observed_at_value <= prior.provider_observed_at
       or observed_at_value <= installed.provider_observed_at
       or pg_catalog.lower(input->>'provider_fingerprint') is distinct from
         installed.provider_fingerprint
       or pg_catalog.lower(input->>'acl_fingerprint') is distinct from
         installed.acl_fingerprint
       or pg_catalog.lower(input->>'canonical_value_fingerprint')
         is distinct from installed.canonical_value_fingerprint
       or pg_catalog.lower(input->>'combined_value_fingerprint')
         is distinct from installed.combined_value_fingerprint
       or pg_catalog.lower(input->>'formula_fingerprint') is distinct from
         installed.formula_fingerprint
       or pg_catalog.lower(input->>'structural_canary_fingerprint')
         is distinct from installed.structural_canary_fingerprint
       or pg_catalog.lower(input->>'permission_inventory_fingerprint')
         is distinct from installed.permission_inventory_fingerprint
       or input->>'legacy_role' is distinct from installed.legacy_role
       or (input->>'legacy_can_edit')::boolean is distinct from
         installed.legacy_can_edit
       or (input->>'legacy_can_share')::boolean is distinct from
         installed.legacy_can_share
       or pg_catalog.lower(input->>'legacy_edit_capability_fingerprint')
         is distinct from installed.legacy_edit_capability_fingerprint
       or pg_catalog.lower(input->>'acl_transition_intent_fingerprint')
         is distinct from installed.acl_transition_intent_fingerprint
       or pg_catalog.lower(input->>'acl_transition_proof_fingerprint')
         is distinct from installed.acl_transition_proof_fingerprint
       or input->'acl_transition_proof' is distinct from
         installed.acl_transition_proof
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_SETTLEMENT_DRIFT';
    end if;
  end if;

  insert into
    production_control.google_writer_provider_fence_settlement_observations (
      observation_id, fence_id, stage, observation_request_id,
      request_fingerprint, payload_hash, prior_observation_id,
      protection_records, protection_set_fingerprint, provider_fingerprint,
      acl_fingerprint, canonical_value_fingerprint,
      combined_value_fingerprint, formula_fingerprint,
      structural_canary_fingerprint, permission_inventory_fingerprint,
      legacy_role, legacy_can_edit, legacy_can_share,
      legacy_edit_capability_fingerprint,
      acl_transition_intent_fingerprint,
      acl_transition_proof_fingerprint, acl_transition_proof,
      provider_observed_at, activation_revision, authority_generation_id,
      admission_generation_id, admission_revision, recorded_at, actor_id,
      authenticated_actor_fingerprint
    ) values (
      extensions.gen_random_uuid(), fence.fence_id, target_stage,
      request_identifier, pg_catalog.lower(input->>'request_fingerprint'),
      payload_hash_value, prior_identifier, empty_retired_protections,
      empty_retired_protections_fingerprint,
      pg_catalog.lower(input->>'provider_fingerprint'),
      pg_catalog.lower(input->>'acl_fingerprint'),
      pg_catalog.lower(input->>'canonical_value_fingerprint'),
      pg_catalog.lower(input->>'combined_value_fingerprint'),
      pg_catalog.lower(input->>'formula_fingerprint'),
      pg_catalog.lower(input->>'structural_canary_fingerprint'),
      pg_catalog.lower(input->>'permission_inventory_fingerprint'),
      'reader', false, false,
      pg_catalog.lower(input->>'legacy_edit_capability_fingerprint'),
      pg_catalog.lower(input->>'acl_transition_intent_fingerprint'),
      pg_catalog.lower(input->>'acl_transition_proof_fingerprint'),
      input->'acl_transition_proof',
      observed_at_value,
      activation.activation_revision, activation.authority_generation_id,
      gate.admission_generation_id, gate.admission_revision,
      captured_at_value, pg_catalog.left(input->>'actor_id', 160),
      pg_catalog.lower(input->>'authenticated_actor_fingerprint')
    ) returning * into inserted;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result,
    details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_' || target_stage,
    'SCORING_AUTHORITY', '2026', inserted.actor_id,
    inserted.request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'observation_id', inserted.observation_id,
      'stage', inserted.stage,
      'prior_observation_id', inserted.prior_observation_id,
      'provider_observed_at', inserted.provider_observed_at,
      'recorded_at', inserted.recorded_at,
      'acl_transition_proof_fingerprint',
        inserted.acl_transition_proof_fingerprint,
      'legacy_role', inserted.legacy_role,
      'legacy_can_edit', inserted.legacy_can_edit,
      'legacy_can_share', inserted.legacy_can_share,
      'structural_canary_fingerprint',
        inserted.structural_canary_fingerprint,
      'permission_inventory_fingerprint',
        inserted.permission_inventory_fingerprint,
      'admission_reservation_active', true
    )
  );
  return inserted;
end;
$$;

create or replace function public.record_production_google_writer_provider_fence_settlement(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  stage_value text := pg_catalog.upper(coalesce(input->>'stage', ''));
  observation
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
  next_eligible timestamptz;
  was_idempotent boolean;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if input->>'operation' is distinct from
       'RECORD_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_SETTLEMENT'
     or stage_value not in (
       'ACL_READER_CONFIRMED', 'SETTLEMENT_READBACK_1'
     )
     or coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_SETTLEMENT_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select exists (
    select 1
    from production_control.google_writer_provider_fence_settlement_observations
    where observation_request_id =
      (input->>'observation_request_id')::uuid
  ) into was_idempotent;
  observation :=
    production_control.insert_google_writer_provider_fence_settlement_observation(
      (input->>'fence_id')::uuid, stage_value, input
    );
  next_eligible := case observation.stage
    when 'ACL_READER_CONFIRMED'
      then observation.recorded_at + interval '190 seconds'
    else observation.recorded_at + interval '10 seconds'
  end;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_' || observation.stage,
    'fence_id', observation.fence_id,
    'observation_id', observation.observation_id,
    'observation_request_id', observation.observation_request_id,
    'stage', observation.stage,
    'prior_observation_id', observation.prior_observation_id,
    'provider_observed_at', observation.provider_observed_at,
    'recorded_at', observation.recorded_at,
    'activation_revision', observation.activation_revision,
    'authority_generation_id', observation.authority_generation_id,
    'admission_generation_id', observation.admission_generation_id,
    'admission_revision', observation.admission_revision,
    'next_stage_eligible_at', next_eligible,
    'required_wait_seconds', case observation.stage
      when 'ACL_READER_CONFIRMED' then 190 else 10 end,
    'remaining_wait_seconds', greatest(
      0, pg_catalog.ceil(extract(epoch from
        (next_eligible - pg_catalog.now())))::integer
    ),
    'protection_set_fingerprint', observation.protection_set_fingerprint,
    'structural_canary_fingerprint',
      observation.structural_canary_fingerprint,
    'permission_inventory_fingerprint',
      observation.permission_inventory_fingerprint,
    'admission_reservation_active', true,
    'idempotent', was_idempotent
  );
end;
$$;

create or replace function production_control.google_writer_provider_fence_response(
  value production_control.google_writer_provider_fences,
  was_idempotent boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'found', true,
    'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_' || value.status,
    'fence_id', value.fence_id,
    'install_request_id', value.install_request_id,
    'status', value.status,
    'quiesce_evidence_id', value.quiesce_evidence_id,
    'candidate_deployment_id', value.candidate_deployment_id,
    'candidate_deployment_commit', value.candidate_deployment_commit,
    'baseline_provider_fingerprint', value.baseline_provider_fingerprint,
    'baseline_acl_fingerprint', value.baseline_acl_fingerprint,
    'baseline_canonical_value_fingerprint',
      value.baseline_canonical_value_fingerprint,
    'baseline_formula_fingerprint', value.baseline_formula_fingerprint,
    'baseline_combined_value_fingerprint',
      value.baseline_combined_value_fingerprint,
    'writer_scope_fingerprint', value.writer_scope_fingerprint,
    'protection_description_prefix', value.protection_description_prefix,
    'active_verification_id', value.active_verification_id,
    'removal_request_id', value.removal_request_id,
    'installing_at', value.installing_at,
    'installed_at', value.installed_at,
    'removal_authorized_at', value.removal_authorized_at,
    'removed_at', value.removed_at,
    'failure_code', value.failure_code,
    'admission_reservation_active',
      value.status in ('INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED'),
    'admission_reservation_state', case
      when value.status in ('INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED')
        then 'HELD'
      else 'RELEASED'
    end,
    'settlement', (
      select pg_catalog.jsonb_build_object(
        'stage', observation.stage,
        'observation_id', observation.observation_id,
        'observation_request_id', observation.observation_request_id,
        'prior_observation_id', observation.prior_observation_id,
        'provider_observed_at', observation.provider_observed_at,
        'recorded_at', observation.recorded_at,
        'next_stage_eligible_at', case observation.stage
          when 'ACL_READER_CONFIRMED'
            then observation.recorded_at + interval '190 seconds'
          when 'SETTLEMENT_READBACK_1'
            then observation.recorded_at + interval '10 seconds'
          else null end,
        'remaining_wait_seconds', case observation.stage
          when 'ACL_READER_CONFIRMED' then greatest(
            0, pg_catalog.ceil(extract(epoch from (
              observation.recorded_at + interval '190 seconds'
              - pg_catalog.now()
            )))::integer
          )
          when 'SETTLEMENT_READBACK_1' then greatest(
            0, pg_catalog.ceil(extract(epoch from (
              observation.recorded_at + interval '10 seconds'
              - pg_catalog.now()
            )))::integer
          )
          else 0 end,
        'protection_set_fingerprint', observation.protection_set_fingerprint,
        'structural_canary_fingerprint',
          observation.structural_canary_fingerprint,
        'permission_inventory_fingerprint',
          observation.permission_inventory_fingerprint,
        'protected_range_ids', (
          select pg_catalog.jsonb_agg(
            (record->>'protectedRangeId')::bigint
            order by (record->>'protectedRangeId')::bigint
          )
          from pg_catalog.jsonb_array_elements(
            observation.protection_records
          ) record
        ),
        'required_install_wait_seconds', 190,
        'required_readback_wait_seconds', 10
      )
      from production_control.google_writer_provider_fence_settlement_observations
        observation
      where observation.fence_id = value.fence_id
      order by case observation.stage
        when 'ACL_READER_CONFIRMED' then 1
        when 'SETTLEMENT_READBACK_1' then 2
        else 3 end desc
      limit 1
    ),
    'idempotent', was_idempotent
  )
$$;

-- Reinstall the inspector explicitly so lost-response recovery has a current,
-- flat settlement contract in addition to the nested provider response.
create or replace function public.inspect_production_google_writer_provider_fence(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  fence production_control.google_writer_provider_fences%rowtype;
  settlement
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
  response_value jsonb;
  next_eligible timestamptz;
  acl_reader_confirmed_id uuid;
  settlement_readback_1_id uuid;
  settlement_readback_2_id uuid;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSPECT_INPUT_INVALID';
  end if;
  select * into fence
  from production_control.google_writer_provider_fences value
  where value.install_request_id = (input->>'install_request_id')::uuid;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'found', false,
      'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_NOT_FOUND',
      'install_request_id', input->>'install_request_id',
      'idempotent', true
    );
  end if;
  if (nullif(input->>'fence_id', '') is not null
       and fence.fence_id is distinct from (input->>'fence_id')::uuid)
     or fence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_OWNERSHIP_MISMATCH';
  end if;
  select * into settlement
  from production_control.google_writer_provider_fence_settlement_observations value
  where value.fence_id = fence.fence_id
  order by case value.stage
    when 'ACL_READER_CONFIRMED' then 1
    when 'SETTLEMENT_READBACK_1' then 2
    else 3 end desc
  limit 1;
  select value.observation_id into acl_reader_confirmed_id
  from production_control.google_writer_provider_fence_settlement_observations value
  where value.fence_id = fence.fence_id
    and value.stage = 'ACL_READER_CONFIRMED';
  select value.observation_id into settlement_readback_1_id
  from production_control.google_writer_provider_fence_settlement_observations value
  where value.fence_id = fence.fence_id
    and value.stage = 'SETTLEMENT_READBACK_1';
  select value.observation_id into settlement_readback_2_id
  from production_control.google_writer_provider_fence_settlement_observations value
  where value.fence_id = fence.fence_id
    and value.stage = 'SETTLEMENT_READBACK_2';
  next_eligible := case settlement.stage
    when 'ACL_READER_CONFIRMED'
      then settlement.recorded_at + interval '190 seconds'
    when 'SETTLEMENT_READBACK_1'
      then settlement.recorded_at + interval '10 seconds'
    else null
  end;
  response_value :=
    production_control.google_writer_provider_fence_response(fence, true)
    || pg_catalog.jsonb_build_object(
      'provider_settlement_stage', case
        when settlement.observation_id is null
          then 'AWAITING_ACL_READER_CONFIRMED'
        else settlement.stage end,
      'acl_reader_confirmed_observation_id', acl_reader_confirmed_id,
      'settlement_readback_1_observation_id', settlement_readback_1_id,
      'settlement_readback_2_observation_id', settlement_readback_2_id,
      'provider_settlement_latest_observation_id', settlement.observation_id,
      'provider_settlement_latest_observation_request_id',
        settlement.observation_request_id,
      'provider_settlement_prior_observation_id',
        settlement.prior_observation_id,
      'provider_settlement_next_eligible_at', next_eligible,
      'provider_settlement_remaining_wait_seconds', case
        when next_eligible is null then 0
        else greatest(0, pg_catalog.ceil(extract(epoch from (
          next_eligible - pg_catalog.now()
        )))::integer)
        end,
      'provider_settlement_install_wait_seconds', 190,
      'provider_settlement_readback_wait_seconds', 10,
      'settlement_structural_canary_fingerprint',
        settlement.structural_canary_fingerprint,
      'settlement_permission_inventory_fingerprint',
        settlement.permission_inventory_fingerprint
    );
  if fence.active_verification_id is not null then
    response_value := response_value || pg_catalog.jsonb_build_object(
      'verification', (
        select pg_catalog.jsonb_build_object(
          'verification_id', value.verification_id,
          'request_fingerprint', value.request_fingerprint,
          'quiesce_evidence_id', value.quiesce_evidence_id,
          'protection_count', value.protection_count,
          'protected_sheet_ids', value.protected_sheet_ids,
          'protected_range_ids', value.protected_range_ids,
          'protection_set_fingerprint', value.protection_set_fingerprint,
          'provider_fingerprint', value.provider_fingerprint,
          'acl_fingerprint', value.acl_fingerprint,
          'canonical_value_fingerprint', value.canonical_value_fingerprint,
          'combined_value_fingerprint', value.combined_value_fingerprint,
          'formula_fingerprint', value.formula_fingerprint,
          'structural_canary_fingerprint',
            value.structural_canary_fingerprint,
          'permission_inventory_fingerprint',
            value.permission_inventory_fingerprint,
          'acl_contract_version', value.acl_contract_version,
          'install_dispatch_id', value.install_dispatch_id,
          'acl_transition_intent_fingerprint',
            value.acl_transition_intent_fingerprint,
          'acl_transition_proof_fingerprint',
            value.acl_transition_proof_fingerprint,
          'legacy_role', value.legacy_role,
          'legacy_can_edit', value.legacy_can_edit,
          'legacy_can_share', value.legacy_can_share,
          'legacy_edit_capability_fingerprint',
            value.legacy_edit_capability_fingerprint,
          'settlement_readback_2_observation_id',
            value.settlement_readback_2_observation_id,
          'global_writer_stop_active_at', value.global_writer_stop_active_at,
          'recovery_only', value.recovery_only,
          'captured_at', value.captured_at,
          'expires_at', value.expires_at
        )
        from production_control.google_writer_provider_fence_verifications value
        where value.verification_id = fence.active_verification_id
      )
    );
  end if;
  return response_value;
end;
$$;

-- A failed ACL transition is recovered in two durable phases. ABORTING remains
-- admission-reserving while the same exact legacy permission is restored. A
-- one-shot DB executor serializes each direction. Drive permissions.update has
-- no asserted late-commit duration: safety comes from monotone direction,
-- exact target readback, and retaining the WAF/reservation. The 1810-second
-- horizon below addresses already accepted legacy application invocations,
-- independently of the later 190+10 Sheets-mutation settlement proof.
alter table production_control.google_writer_provider_fences
  add column abort_request_id uuid,
  add column abort_begin_request_fingerprint text,
  add column abort_begin_payload_hash text,
  add column abort_requested_at timestamptz,
  add column abort_provider_quiescence_not_before timestamptz,
  add column abort_origin_status text check (
    abort_origin_status is null or
      abort_origin_status in ('INSTALLING', 'INSTALLED', 'REMOVAL_AUTHORIZED')
  ),
  add column lifecycle_mode text not null default 'CUTOVER' check (
    lifecycle_mode in ('CUTOVER', 'REHEARSAL')
  ),
  add column critical_waf_epoch_id uuid references
    production_control.vercel_writer_critical_waf_epochs(epoch_id)
    on delete restrict,
  add column global_writer_stop_active_at timestamptz,
  add column restore_quiesce_evidence_id uuid references
    production_control.vercel_writer_quiesce_evidence(evidence_id)
    on delete restrict,
  add column restore_global_writer_stop_active_at timestamptz,
  add column acl_reader_confirmed_at timestamptz,
  add column acl_reader_transition_fingerprint text,
  add column acl_writer_restored_at timestamptz,
  add column acl_writer_restore_transition_fingerprint text,
  add column acl_restored_waf_active_at timestamptz,
  add column baseline_waf_restored_observation_id uuid references
    production_control.vercel_writer_critical_waf_observations(observation_id)
    on delete restrict,
  add column rehearsal_restored_at timestamptz;

alter table production_control.google_writer_provider_fences
  add constraint production_google_writer_provider_fence_abort_request_unique
    unique (abort_request_id),
  add constraint production_google_writer_provider_fence_abort_begin_request_unique
    unique (abort_begin_request_fingerprint),
  add constraint production_google_writer_provider_fence_abort_begin_request_check
    check (abort_begin_request_fingerprint is null
      or abort_begin_request_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_google_writer_provider_fence_abort_begin_payload_check
    check (abort_begin_payload_hash is null
      or abort_begin_payload_hash ~ '^[0-9a-f]{64}$'),
  add constraint production_google_writer_provider_fence_acl_fingerprints_check
    check (
      (acl_reader_transition_fingerprint is null or
        acl_reader_transition_fingerprint ~ '^[0-9a-f]{64}$')
      and (acl_writer_restore_transition_fingerprint is null or
        acl_writer_restore_transition_fingerprint ~ '^[0-9a-f]{64}$')
    ),
  add constraint production_google_writer_provider_fence_waf_epoch_check check (
    (critical_waf_epoch_id is null
      and acl_restored_waf_active_at is null
      and baseline_waf_restored_observation_id is null)
    or critical_waf_epoch_id is not null
  ),
  add constraint production_google_writer_provider_fence_restore_horizon_check
    check (
      acl_writer_restored_at is null or (
        coalesce(restore_global_writer_stop_active_at,
          global_writer_stop_active_at) is not null and
        acl_writer_restored_at >=
          coalesce(restore_global_writer_stop_active_at,
            global_writer_stop_active_at) + interval '1810 seconds'
      )
    );

alter table production_control.google_writer_provider_fences
  drop constraint google_writer_provider_fences_status_check,
  drop constraint google_writer_provider_fences_check;

alter table production_control.google_writer_provider_fences
  add constraint google_writer_provider_fences_status_check check (status in (
    'INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED', 'REMOVED',
    'FAILED', 'ACL_RESTORED_WAF_ACTIVE', 'REHEARSAL_RESTORED'
  )),
  add constraint google_writer_provider_fences_check check (
    (status = 'INSTALLING' and installed_at is null
      and active_verification_id is null and removed_at is null
      and abort_request_id is null and abort_begin_request_fingerprint is null
      and abort_begin_payload_hash is null and abort_requested_at is null
      and abort_provider_quiescence_not_before is null
      and abort_origin_status is null)
    or (status = 'ABORTING' and removed_at is null
      and abort_request_id is not null
      and abort_begin_request_fingerprint is not null
      and abort_begin_payload_hash is not null
      and abort_requested_at is not null
      and abort_provider_quiescence_not_before is not null
      and abort_origin_status is not null
      and ((abort_origin_status = 'INSTALLING'
          and installed_at is null and active_verification_id is null)
        or (abort_origin_status in ('INSTALLED', 'REMOVAL_AUTHORIZED')
          and installed_at is not null and active_verification_id is not null)))
    or (status = 'INSTALLED' and installed_at is not null
      and active_verification_id is not null and removed_at is null)
    or (status = 'REMOVAL_AUTHORIZED' and installed_at is not null
      and active_verification_id is not null and removal_request_id is not null
      and removal_authorized_at is not null and removed_at is null
      and pre_remove_provider_fingerprint is not null
      and expected_post_remove_provider_fingerprint is not null
      and pre_remove_acl_fingerprint is not null
      and pre_remove_canonical_value_fingerprint is not null
      and pre_remove_combined_value_fingerprint is not null
      and pre_remove_formula_fingerprint is not null
      and removal_activation_revision is not null
      and removal_authority_generation_id is not null
      and removal_admission_generation_id is not null
      and removal_admission_revision is not null)
    or (status = 'REMOVED' and installed_at is not null
      and active_verification_id is not null and removal_request_id is not null
      and removal_authorized_at is not null and removed_at is not null
      and restoration_evidence_fingerprint is not null
      and removal_activation_revision is not null
      and removal_authority_generation_id is not null
      and removal_admission_generation_id is not null
      and removal_admission_revision is not null)
    or (status = 'FAILED' and failure_code is not null)
    or (status = 'ACL_RESTORED_WAF_ACTIVE'
      and acl_reader_confirmed_at is not null
      and acl_writer_restored_at is not null
      and acl_restored_waf_active_at is not null
      and baseline_waf_restored_observation_id is null
      and rehearsal_restored_at is null)
    or (status = 'REHEARSAL_RESTORED'
      and lifecycle_mode = 'REHEARSAL'
      and acl_reader_confirmed_at is not null
      and acl_writer_restored_at is not null
      and acl_restored_waf_active_at is not null
      and baseline_waf_restored_observation_id is not null
      and rehearsal_restored_at is not null
      and failure_code is null)
  );

drop index production_control.production_google_writer_one_active_provider_fence_idx;
drop index production_control.production_google_writer_active_candidate_provider_fence_idx;
create unique index production_google_writer_one_active_provider_fence_idx
  on production_control.google_writer_provider_fences((true))
  where status in (
    'INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED',
    'ACL_RESTORED_WAF_ACTIVE'
  );
create unique index production_google_writer_active_candidate_provider_fence_idx
  on production_control.google_writer_provider_fences(
    candidate_deployment_id, candidate_deployment_commit
  )
  where status in (
    'INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED',
    'ACL_RESTORED_WAF_ACTIVE'
  );

create table production_control.google_writer_provider_fence_install_dispatches (
  dispatch_id uuid primary key,
  fence_id uuid not null references
    production_control.google_writer_provider_fences(fence_id) on delete restrict,
  dispatch_request_id uuid not null unique,
  attempt integer not null check (attempt >= 1),
  mutation_plan text not null check (
    mutation_plan = 'DRIVE_ACL_LEGACY_WRITER_TO_READER_V1'
  ),
  provider_mutation_class text not null check (
    provider_mutation_class = 'DRIVE_LEGACY_PERMISSION_WRITER_TO_READER_V1'
  ),
  source_role text not null check (source_role = 'writer'),
  target_role text not null check (target_role = 'reader'),
  transition_intent jsonb not null check (
    pg_catalog.jsonb_typeof(transition_intent) = 'object'
  ),
  transition_intent_fingerprint text not null
    check (transition_intent_fingerprint ~ '^[0-9a-f]{64}$'),
  provider_preflight_fingerprint text not null
    check (provider_preflight_fingerprint ~ '^[0-9a-f]{64}$'),
  provider_preflight_position text not null check (
    provider_preflight_position = 'SOURCE'
  ),
  outcome_status text not null default 'PROVIDER_MUTATING' check (
    outcome_status in (
      'PROVIDER_MUTATING', 'TARGET_CONFIRMED', 'OUTCOME_UNKNOWN'
    )
  ),
  transition_proof jsonb check (
    transition_proof is null or
      pg_catalog.jsonb_typeof(transition_proof) = 'object'
  ),
  transition_proof_fingerprint text check (
    transition_proof_fingerprint is null or
      transition_proof_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  provider_observed_at timestamptz,
  target_confirmed_at timestamptz,
  result_request_id uuid unique,
  result_request_fingerprint text unique check (
    result_request_fingerprint is null or
      result_request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  result_payload_hash text check (
    result_payload_hash is null or result_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  result_recorded_at timestamptz,
  request_fingerprint text not null unique
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  activation_revision bigint not null check (activation_revision >= 0),
  authority_generation_id uuid not null,
  admission_generation_id uuid not null,
  admission_revision bigint not null check (admission_revision >= 0),
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  authenticated_actor_fingerprint text not null
    check (authenticated_actor_fingerprint ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  check (expires_at > issued_at and expires_at <= issued_at + interval '15 seconds'),
  check (
    (outcome_status = 'PROVIDER_MUTATING' and transition_proof is null
      and transition_proof_fingerprint is null
      and provider_observed_at is null and target_confirmed_at is null
      and result_request_id is null and result_request_fingerprint is null
      and result_payload_hash is null and result_recorded_at is null)
    or (outcome_status = 'TARGET_CONFIRMED' and transition_proof is not null
      and transition_proof_fingerprint is not null
      and provider_observed_at is not null and target_confirmed_at is not null
      and result_request_id is not null and result_request_fingerprint is not null
      and result_payload_hash is not null and result_recorded_at is not null)
    or (outcome_status = 'OUTCOME_UNKNOWN' and transition_proof is null
      and transition_proof_fingerprint is null
      and target_confirmed_at is null
      and result_request_id is not null and result_request_fingerprint is not null
      and result_payload_hash is not null and result_recorded_at is not null)
  )
);

alter table production_control.google_writer_provider_fence_install_dispatches
  add constraint production_google_writer_provider_install_attempt_unique
    unique (fence_id, attempt);

alter table production_control.google_writer_provider_fence_install_dispatches
  enable row level security;

create table production_control.google_writer_provider_fence_abort_dispatches (
  dispatch_id uuid primary key,
  fence_id uuid not null references
    production_control.google_writer_provider_fences(fence_id) on delete restrict,
  abort_request_id uuid not null,
  dispatch_request_id uuid not null unique,
  restore_quiesce_evidence_id uuid not null references
    production_control.vercel_writer_quiesce_evidence(evidence_id)
    on delete restrict,
  attempt integer not null check (attempt >= 1),
  mutation_plan text not null check (
    mutation_plan = 'DRIVE_ACL_LEGACY_READER_TO_WRITER_V1'
  ),
  provider_mutation_class text not null check (
    provider_mutation_class = 'DRIVE_LEGACY_PERMISSION_READER_TO_WRITER_V1'
  ),
  source_role text not null check (source_role = 'reader'),
  target_role text not null check (target_role = 'writer'),
  transition_intent jsonb not null check (
    pg_catalog.jsonb_typeof(transition_intent) = 'object'
  ),
  transition_intent_fingerprint text not null
    check (transition_intent_fingerprint ~ '^[0-9a-f]{64}$'),
  provider_preflight_fingerprint text not null
    check (provider_preflight_fingerprint ~ '^[0-9a-f]{64}$'),
  provider_preflight_position text not null check (
    provider_preflight_position = 'SOURCE'
  ),
  outcome_status text not null default 'PROVIDER_MUTATING' check (
    outcome_status in ('PROVIDER_MUTATING', 'TARGET_CONFIRMED', 'OUTCOME_UNKNOWN')
  ),
  transition_proof jsonb check (
    transition_proof is null or
      pg_catalog.jsonb_typeof(transition_proof) = 'object'
  ),
  transition_proof_fingerprint text check (
    transition_proof_fingerprint is null or
      transition_proof_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  provider_observed_at timestamptz,
  target_confirmed_at timestamptz,
  result_request_id uuid unique,
  result_request_fingerprint text unique check (
    result_request_fingerprint is null or
      result_request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  result_payload_hash text check (
    result_payload_hash is null or result_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  result_recorded_at timestamptz,
  request_fingerprint text not null unique
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  activation_revision bigint not null check (activation_revision >= 0),
  authority_generation_id uuid not null,
  admission_generation_id uuid not null,
  admission_revision bigint not null check (admission_revision >= 0),
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  authenticated_actor_fingerprint text not null
    check (authenticated_actor_fingerprint ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  check (expires_at > issued_at and expires_at <= issued_at + interval '15 seconds'),
  check (
    (outcome_status in ('PROVIDER_MUTATING', 'OUTCOME_UNKNOWN')
      and transition_proof is null
      and transition_proof_fingerprint is null
      and target_confirmed_at is null
      and ((outcome_status = 'PROVIDER_MUTATING'
          and provider_observed_at is null and result_request_id is null
          and result_request_fingerprint is null
          and result_payload_hash is null and result_recorded_at is null)
        or (outcome_status = 'OUTCOME_UNKNOWN'
          and result_request_id is not null
          and result_request_fingerprint is not null
          and result_payload_hash is not null and result_recorded_at is not null)))
    or (outcome_status = 'TARGET_CONFIRMED' and transition_proof is not null
      and transition_proof_fingerprint is not null
      and provider_observed_at is not null and target_confirmed_at is not null
      and result_request_id is not null and result_request_fingerprint is not null
      and result_payload_hash is not null and result_recorded_at is not null)
  )
);

alter table production_control.google_writer_provider_fence_abort_dispatches
  add constraint production_google_writer_provider_abort_attempt_unique
    unique (fence_id, attempt);

alter table production_control.google_writer_provider_fence_abort_dispatches
  enable row level security;

create table production_control.google_writer_provider_fence_acl_dispatch_results (
  result_id uuid primary key,
  result_request_id uuid not null unique,
  fence_id uuid not null references
    production_control.google_writer_provider_fences(fence_id) on delete restrict,
  direction text not null check (direction in ('INSTALL', 'RESTORE')),
  install_dispatch_id uuid references
    production_control.google_writer_provider_fence_install_dispatches(dispatch_id)
    on delete restrict,
  abort_dispatch_id uuid references
    production_control.google_writer_provider_fence_abort_dispatches(dispatch_id)
    on delete restrict,
  outcome_status text not null check (outcome_status in (
    'TARGET_CONFIRMED', 'OUTCOME_UNKNOWN'
  )),
  transition_proof jsonb,
  transition_proof_fingerprint text check (
    transition_proof_fingerprint is null or
      transition_proof_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  provider_observed_at timestamptz,
  request_fingerprint text not null unique
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  authenticated_actor_fingerprint text not null
    check (authenticated_actor_fingerprint ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (direction = 'INSTALL' and install_dispatch_id is not null
      and abort_dispatch_id is null)
    or (direction = 'RESTORE' and install_dispatch_id is null
      and abort_dispatch_id is not null)
  ),
  check (
    (outcome_status = 'OUTCOME_UNKNOWN' and transition_proof is null
      and transition_proof_fingerprint is null)
    or (outcome_status <> 'OUTCOME_UNKNOWN' and transition_proof is not null
      and pg_catalog.jsonb_typeof(transition_proof) = 'object'
      and transition_proof_fingerprint is not null
      and provider_observed_at is not null)
  )
);

alter table production_control.google_writer_provider_fence_acl_dispatch_results
  enable row level security;

alter table production_control.google_writer_provider_fence_verifications
  add constraint production_google_writer_provider_verification_install_dispatch_fkey
    foreign key (install_dispatch_id) references
      production_control.google_writer_provider_fence_install_dispatches(dispatch_id)
      on delete restrict,
  add constraint production_google_writer_provider_verification_settlement_rb2_fkey
    foreign key (settlement_readback_2_observation_id) references
      production_control.google_writer_provider_fence_settlement_observations(observation_id)
      on delete restrict;

create table production_control.google_writer_provider_fence_install_aborts (
  abort_id uuid primary key,
  fence_id uuid not null unique references
    production_control.google_writer_provider_fences(fence_id)
    on delete restrict,
  abort_request_id uuid not null unique,
  request_fingerprint text not null unique
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  restoration_evidence_fingerprint text not null
    check (restoration_evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  removed_protected_range_ids jsonb not null
    check (removed_protected_range_ids = '[]'::jsonb),
  active_run_owned_protection_count integer not null
    check (active_run_owned_protection_count = 0),
  restored_provider_fingerprint text not null
    check (restored_provider_fingerprint ~ '^[0-9a-f]{64}$'),
  restored_acl_fingerprint text not null
    check (restored_acl_fingerprint ~ '^[0-9a-f]{64}$'),
  restored_canonical_value_fingerprint text not null
    check (restored_canonical_value_fingerprint ~ '^[0-9a-f]{64}$'),
  restored_combined_value_fingerprint text not null
    check (restored_combined_value_fingerprint ~ '^[0-9a-f]{64}$'),
  restored_formula_fingerprint text not null
    check (restored_formula_fingerprint ~ '^[0-9a-f]{64}$'),
  restore_dispatch_id uuid references
    production_control.google_writer_provider_fence_abort_dispatches(dispatch_id)
    on delete restrict,
  restore_quiesce_evidence_id uuid not null references
    production_control.vercel_writer_quiesce_evidence(evidence_id)
    on delete restrict,
  restored_legacy_role text not null check (restored_legacy_role = 'writer'),
  restored_legacy_can_edit boolean not null check (restored_legacy_can_edit),
  restored_legacy_can_share boolean not null check (restored_legacy_can_share),
  restore_transition_proof jsonb,
  restore_transition_proof_fingerprint text check (
    restore_transition_proof_fingerprint is null or
      restore_transition_proof_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  provider_observed_at timestamptz not null,
  activation_revision bigint not null check (activation_revision >= 0),
  authority_generation_id uuid not null,
  admission_generation_id uuid not null,
  admission_revision bigint not null check (admission_revision >= 0),
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  authenticated_actor_fingerprint text not null
    check (authenticated_actor_fingerprint ~ '^[0-9a-f]{64}$'),
  aborted_at timestamptz not null default pg_catalog.now()
);

alter table production_control.google_writer_provider_fence_install_aborts
  enable row level security;

-- Reinstall the shared fence response after the abort relation exists so a
-- stateless operator can recover a lost abort response without direct table
-- access. The nested receipt contains only immutable ownership and restoration
-- proof fields.
create or replace function production_control.google_writer_provider_fence_response(
  value production_control.google_writer_provider_fences,
  was_idempotent boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'found', true,
    'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_' || value.status,
    'fence_id', value.fence_id,
    'install_request_id', value.install_request_id,
    'status', value.status,
    'quiesce_evidence_id', value.quiesce_evidence_id,
    'candidate_deployment_id', value.candidate_deployment_id,
    'candidate_deployment_commit', value.candidate_deployment_commit,
    'baseline_provider_fingerprint', value.baseline_provider_fingerprint,
    'baseline_acl_fingerprint', value.baseline_acl_fingerprint,
    'baseline_canonical_value_fingerprint',
      value.baseline_canonical_value_fingerprint,
    'baseline_formula_fingerprint', value.baseline_formula_fingerprint,
    'baseline_combined_value_fingerprint',
      value.baseline_combined_value_fingerprint,
    'writer_scope_fingerprint', value.writer_scope_fingerprint,
    'protection_description_prefix', value.protection_description_prefix,
    'active_verification_id', value.active_verification_id,
    'removal_request_id', value.removal_request_id,
    'abort_request_id', value.abort_request_id,
    'lifecycle_mode', value.lifecycle_mode,
    'critical_waf_epoch_id', value.critical_waf_epoch_id,
    'abort_requested_at', value.abort_requested_at,
    'abort_provider_quiescence_not_before',
      value.abort_provider_quiescence_not_before,
    'global_writer_stop_active_at', value.global_writer_stop_active_at,
    'acl_reader_confirmed_at', value.acl_reader_confirmed_at,
    'acl_reader_transition_fingerprint',
      value.acl_reader_transition_fingerprint,
    'acl_writer_restored_at', value.acl_writer_restored_at,
    'acl_writer_restore_transition_fingerprint',
      value.acl_writer_restore_transition_fingerprint,
    'acl_restored_waf_active_at', value.acl_restored_waf_active_at,
    'baseline_waf_restored_observation_id',
      value.baseline_waf_restored_observation_id,
    'abort_provider_quiescence_remaining_seconds', case
      when value.status <> 'ABORTING' then 0
      else greatest(0, pg_catalog.ceil(extract(epoch from (
        value.abort_provider_quiescence_not_before - pg_catalog.now()
      )))::integer)
    end,
    'installing_at', value.installing_at,
    'installed_at', value.installed_at,
    'removal_authorized_at', value.removal_authorized_at,
    'removed_at', value.removed_at,
    'failure_code', value.failure_code,
    'admission_reservation_active',
      value.status in (
        'INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED',
        'ACL_RESTORED_WAF_ACTIVE'
      ),
    'admission_reservation_state', case
      when value.status in (
        'INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED',
        'ACL_RESTORED_WAF_ACTIVE'
      )
        then 'HELD'
      else 'RELEASED'
    end,
    'settlement', (
      select pg_catalog.jsonb_build_object(
        'stage', observation.stage,
        'observation_id', observation.observation_id,
        'observation_request_id', observation.observation_request_id,
        'prior_observation_id', observation.prior_observation_id,
        'provider_observed_at', observation.provider_observed_at,
        'recorded_at', observation.recorded_at,
        'next_stage_eligible_at', case observation.stage
          when 'ACL_READER_CONFIRMED'
            then observation.recorded_at + interval '190 seconds'
          when 'SETTLEMENT_READBACK_1'
            then observation.recorded_at + interval '10 seconds'
          else null end,
        'remaining_wait_seconds', case observation.stage
          when 'ACL_READER_CONFIRMED' then greatest(
            0, pg_catalog.ceil(extract(epoch from (
              observation.recorded_at + interval '190 seconds'
              - pg_catalog.now()
            )))::integer
          )
          when 'SETTLEMENT_READBACK_1' then greatest(
            0, pg_catalog.ceil(extract(epoch from (
              observation.recorded_at + interval '10 seconds'
              - pg_catalog.now()
            )))::integer
          )
          else 0 end,
        'protection_set_fingerprint', observation.protection_set_fingerprint,
        'structural_canary_fingerprint',
          observation.structural_canary_fingerprint,
        'permission_inventory_fingerprint',
          observation.permission_inventory_fingerprint,
        'protected_range_ids', (
          select pg_catalog.jsonb_agg(
            (record->>'protectedRangeId')::bigint
            order by (record->>'protectedRangeId')::bigint
          )
          from pg_catalog.jsonb_array_elements(
            observation.protection_records
          ) record
        ),
        'required_install_wait_seconds', 190,
        'required_readback_wait_seconds', 10
      )
      from production_control.google_writer_provider_fence_settlement_observations
        observation
      where observation.fence_id = value.fence_id
      order by case observation.stage
        when 'ACL_READER_CONFIRMED' then 1
        when 'SETTLEMENT_READBACK_1' then 2
        else 3 end desc
      limit 1
    ),
    'install_dispatch', (
      select pg_catalog.jsonb_build_object(
        'dispatch_id', dispatch.dispatch_id,
        'dispatch_request_id', dispatch.dispatch_request_id,
        'attempt', dispatch.attempt,
        'mutation_plan', dispatch.mutation_plan,
        'provider_mutation_class', dispatch.provider_mutation_class,
        'source_role', dispatch.source_role,
        'target_role', dispatch.target_role,
        'transition_intent', dispatch.transition_intent,
        'transition_intent_fingerprint',
          dispatch.transition_intent_fingerprint,
        'provider_preflight_fingerprint',
          dispatch.provider_preflight_fingerprint,
        'provider_preflight_position', dispatch.provider_preflight_position,
        'outcome_status', dispatch.outcome_status,
        'transition_proof_fingerprint',
          dispatch.transition_proof_fingerprint,
        'provider_observed_at', dispatch.provider_observed_at,
        'target_confirmed_at', dispatch.target_confirmed_at,
        'result_recorded_at', dispatch.result_recorded_at,
        'request_fingerprint', dispatch.request_fingerprint,
        'issued_at', dispatch.issued_at,
        'expires_at', dispatch.expires_at,
        'remaining_dispatch_budget_ms', greatest(0,
          pg_catalog.floor(extract(epoch from (
            dispatch.expires_at - pg_catalog.clock_timestamp()
          )) * 1000)::bigint),
        'dispatch_usable', false,
        'replay_usable', false
      )
      from production_control.google_writer_provider_fence_install_dispatches
        dispatch
      where dispatch.fence_id = value.fence_id
      order by dispatch.attempt desc
      limit 1
    ),
    'abort_dispatch', (
      select pg_catalog.jsonb_build_object(
        'dispatch_id', dispatch.dispatch_id,
        'abort_request_id', dispatch.abort_request_id,
        'dispatch_request_id', dispatch.dispatch_request_id,
        'attempt', dispatch.attempt,
        'mutation_plan', dispatch.mutation_plan,
        'provider_mutation_class', dispatch.provider_mutation_class,
        'source_role', dispatch.source_role,
        'target_role', dispatch.target_role,
        'transition_intent', dispatch.transition_intent,
        'transition_intent_fingerprint',
          dispatch.transition_intent_fingerprint,
        'provider_preflight_fingerprint',
          dispatch.provider_preflight_fingerprint,
        'provider_preflight_position', dispatch.provider_preflight_position,
        'outcome_status', dispatch.outcome_status,
        'transition_proof_fingerprint',
          dispatch.transition_proof_fingerprint,
        'provider_observed_at', dispatch.provider_observed_at,
        'target_confirmed_at', dispatch.target_confirmed_at,
        'result_recorded_at', dispatch.result_recorded_at,
        'request_fingerprint', dispatch.request_fingerprint,
        'issued_at', dispatch.issued_at,
        'expires_at', dispatch.expires_at,
        'remaining_dispatch_budget_ms', greatest(0,
          pg_catalog.floor(extract(epoch from (
            dispatch.expires_at - pg_catalog.clock_timestamp()
          )) * 1000)::bigint),
        'dispatch_usable', false,
        'replay_usable', false
      )
      from production_control.google_writer_provider_fence_abort_dispatches
        dispatch
      where dispatch.fence_id = value.fence_id
      order by dispatch.attempt desc
      limit 1
    ),
    'abort', (
      select pg_catalog.jsonb_build_object(
        'abort_id', abort_value.abort_id,
        'abort_request_id', abort_value.abort_request_id,
        'request_fingerprint', abort_value.request_fingerprint,
        'restoration_evidence_fingerprint',
          abort_value.restoration_evidence_fingerprint,
        'removed_protected_range_ids',
          abort_value.removed_protected_range_ids,
        'active_run_owned_protection_count',
          abort_value.active_run_owned_protection_count,
        'restored_provider_fingerprint',
          abort_value.restored_provider_fingerprint,
        'restored_acl_fingerprint', abort_value.restored_acl_fingerprint,
        'restored_canonical_value_fingerprint',
          abort_value.restored_canonical_value_fingerprint,
        'restored_combined_value_fingerprint',
          abort_value.restored_combined_value_fingerprint,
        'restored_formula_fingerprint',
          abort_value.restored_formula_fingerprint,
        'provider_observed_at', abort_value.provider_observed_at,
        'aborted_at', abort_value.aborted_at
      )
      from production_control.google_writer_provider_fence_install_aborts
        abort_value
      where abort_value.fence_id = value.fence_id
    ),
    'idempotent', was_idempotent
  )
$$;

create or replace function production_control.google_writer_provider_fence_abort_evidence_hash(
  target_fence_id uuid,
  input jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select production_control.structured_evidence_fingerprint(
    pg_catalog.jsonb_build_object(
      'operation', input->>'operation',
      'environment', input->>'environment',
      'project_ref', input->>'project_ref',
      'project_url', input->>'project_url',
      'source_workbook_id', input->>'source_workbook_id',
      'tournament_id', input->>'tournament_id',
      'fence_id', target_fence_id,
      'install_request_id', input->>'install_request_id',
      'abort_request_id', input->>'abort_request_id',
      'restore_quiesce_evidence_id', input->>'restore_quiesce_evidence_id',
      'candidate_deployment_id', input->>'candidate_deployment_id',
      'candidate_deployment_commit',
        pg_catalog.lower(input->>'candidate_deployment_commit'),
      'removed_protected_range_ids', input->'removed_protected_range_ids',
      'active_run_owned_protection_count',
        input->'active_run_owned_protection_count',
      'provider_rollback_verified', input->'provider_rollback_verified',
      'restored_legacy_role', input->>'restored_legacy_role',
      'restored_legacy_can_edit', input->'restored_legacy_can_edit',
      'restored_legacy_can_share', input->'restored_legacy_can_share',
      'restore_transition_proof_fingerprint',
        pg_catalog.lower(input->>'restore_transition_proof_fingerprint'),
      'restored_provider_fingerprint',
        pg_catalog.lower(input->>'restored_provider_fingerprint'),
      'restored_acl_fingerprint',
        pg_catalog.lower(input->>'restored_acl_fingerprint'),
      'restored_canonical_value_fingerprint',
        pg_catalog.lower(input->>'restored_canonical_value_fingerprint'),
      'restored_combined_value_fingerprint',
        pg_catalog.lower(input->>'restored_combined_value_fingerprint'),
      'restored_formula_fingerprint',
        pg_catalog.lower(input->>'restored_formula_fingerprint'),
      'provider_observed_at', input->>'provider_observed_at',
      'expected_activation_revision', input->'expected_activation_revision',
      'expected_authority_generation', input->>'expected_authority_generation',
      'expected_admission_generation', input->>'expected_admission_generation',
      'expected_admission_revision', input->'expected_admission_revision',
      'actor_id', input->>'actor_id',
      'authenticated_actor_fingerprint',
        pg_catalog.lower(input->>'authenticated_actor_fingerprint')
    )
  )
$$;

-- JS and PostgreSQL share a domain-separated newline scalar tuple. This avoids
-- any dependency on JSON key ordering, whitespace, locale, or jsonb rendering.
create or replace function production_control.google_drive_acl_transition_intent_fingerprint_v1(
  input jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(pg_catalog.array_to_string(array[
    'production-google-drive-acl-transition-intent-v1',
    input->>'schemaVersion', input->>'workbookId', input->>'fenceId',
    input->>'installRequestId', input->>'transitionPhase',
    input->>'providerMutationClass', input->>'sourceRole', input->>'targetRole',
    input->>'permissionManagementScope', input->>'legacyPermissionFingerprint',
    input->>'legacyPrincipalFingerprint', input->>'dedicatedPermissionFingerprint',
    input->>'dedicatedPrincipalFingerprint',
    input->>'dedicatedDriveIdentityFingerprint',
    input->>'priorPermissionInventoryFingerprint',
    input->>'expectedTargetPermissionInventoryFingerprint',
    input->>'permissionIdentityFingerprint', input->>'sharingCapabilityFingerprint',
    input->>'priorAclFingerprint', input->>'priorLegacyCanEdit',
    input->>'priorLegacyCanShare', input->>'expectedTargetLegacyCanEdit',
    input->>'expectedTargetLegacyCanShare',
    input->>'priorLegacyEditCapabilityFingerprint',
    input->>'expectedTargetLegacyEditCapabilityFingerprint',
    input->>'legacyDriveIdentityFingerprint', input->>'permissionCount',
    input->>'priorNonOwnerEditorCount', input->>'expectedTargetNonOwnerEditorCount',
    input->>'priorEffectiveNonOwnerEditorFingerprint',
    input->>'expectedTargetEffectiveNonOwnerEditorFingerprint'
  ], E'\n', '<NULL>'), 'sha256'), 'hex')
$$;

create or replace function production_control.google_drive_acl_transition_proof_fingerprint_v1(
  input jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(pg_catalog.array_to_string(array[
    'production-google-drive-acl-transition-proof-v1',
    input->>'schemaVersion', input->>'workbookId', input->>'fenceId',
    input->>'installRequestId', input->>'transitionPhase',
    input->>'providerMutationClass', input->>'permissionManagementScope',
    input->>'transitionIntentFingerprint', input->>'legacyPermissionFingerprint',
    input->>'legacyPrincipalFingerprint', input->>'priorRole', input->>'currentRole',
    input->>'priorPermissionInventoryFingerprint',
    input->>'currentPermissionInventoryFingerprint',
    input->>'permissionIdentityFingerprint', input->>'sharingCapabilityFingerprint',
    input->>'dedicatedDriveIdentityFingerprint',
    input->>'legacyDriveIdentityFingerprint', input->>'priorAclFingerprint',
    input->>'currentAclFingerprint', input->>'priorLegacyCanEdit',
    input->>'currentLegacyCanEdit', input->>'priorLegacyCanShare',
    input->>'currentLegacyCanShare',
    input->>'priorLegacyEditCapabilityFingerprint',
    input->>'currentLegacyEditCapabilityFingerprint', input->>'dedicatedCanShare',
    input->>'writersCanShare'
  ], E'\n', '<NULL>'), 'sha256'), 'hex')
$$;

-- Persist the provider outcome independently from dispatch issuance.  A lost
-- PATCH response is recovered by a fresh exact target readback and this RPC;
-- it never reissues the PATCH.  OUTCOME_UNKNOWN is non-terminal and keeps the
-- admission reservation. A source-state readback, including after a
-- deterministic provider rejection, is never terminal: it cannot exclude a
-- delayed or lost writer-to-reader update and is therefore recorded UNKNOWN.
create or replace function public.record_production_google_writer_acl_dispatch_result(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  direction_value text := pg_catalog.upper(coalesce(input->>'direction', ''));
  outcome_value text := pg_catalog.upper(coalesce(input->>'outcome_status', ''));
  fence production_control.google_writer_provider_fences%rowtype;
  install_dispatch
    production_control.google_writer_provider_fence_install_dispatches%rowtype;
  restore_dispatch
    production_control.google_writer_provider_fence_abort_dispatches%rowtype;
  quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  existing
    production_control.google_writer_provider_fence_acl_dispatch_results%rowtype;
  inserted
    production_control.google_writer_provider_fence_acl_dispatch_results%rowtype;
  payload_hash_value text := production_control.cutover_payload_hash(input);
  result_request_identifier uuid;
  proof_value jsonb := input->'transition_proof';
  proof_fingerprint text := pg_catalog.lower(
    coalesce(input->>'transition_proof_fingerprint', '')
  );
  provider_observed timestamptz;
  expected_mutation_class text;
  expected_source_role text;
  expected_target_role text;
  selected_dispatch_id uuid;
  current_outcome text;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'operation' is distinct from
       'RECORD_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ACL_DISPATCH_RESULT'
     or direction_value not in ('INSTALL', 'RESTORE')
     or outcome_value not in ('TARGET_CONFIRMED', 'OUTCOME_UNKNOWN')
     or coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'dispatch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'result_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or (outcome_value = 'OUTCOME_UNKNOWN' and proof_value is not null)
     or (outcome_value <> 'OUTCOME_UNKNOWN' and (
       pg_catalog.jsonb_typeof(proof_value) is distinct from 'object'
       or (select pg_catalog.count(*)
           from pg_catalog.jsonb_object_keys(proof_value)) <> 29
       or proof_fingerprint !~ '^[0-9a-f]{64}$'
       or proof_value->>'transitionFingerprint' is distinct from
         proof_fingerprint
       or production_control.google_drive_acl_transition_proof_fingerprint_v1(
         proof_value - 'transitionFingerprint'
       ) is distinct from proof_fingerprint
     ))
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_RESULT_INPUT_INVALID';
  end if;
  result_request_identifier := (input->>'result_request_id')::uuid;
  if nullif(input->>'provider_observed_at', '') is not null then
    provider_observed := (input->>'provider_observed_at')::timestamptz;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into existing
  from production_control.google_writer_provider_fence_acl_dispatch_results value
  where value.result_request_id = result_request_identifier;
  if found then
    if existing.fence_id is distinct from (input->>'fence_id')::uuid
       or existing.direction is distinct from direction_value
       or existing.outcome_status is distinct from outcome_value
       or existing.request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or existing.payload_hash is distinct from payload_hash_value
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_RESULT_IDEMPOTENCY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_' ||
        direction_value || '_' || existing.outcome_status,
      'fence_id', existing.fence_id,
      'result_id', existing.result_id,
      'result_request_id', existing.result_request_id,
      'direction', existing.direction,
      'outcome_status', existing.outcome_status,
      'transition_proof_fingerprint',
        existing.transition_proof_fingerprint,
      'provider_observed_at', existing.provider_observed_at,
      'recorded_at', existing.recorded_at,
      'admission_reservation_active', true,
      'idempotent', true
    );
  end if;

  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'fence_id')::uuid
    and value.install_request_id = (input->>'install_request_id')::uuid
  for update;
  if fence.actor_id is distinct from input->>'actor_id'
     or fence.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_RESULT_OWNERSHIP_MISMATCH';
  end if;

  if direction_value = 'INSTALL' then
    select * into strict install_dispatch
    from production_control.google_writer_provider_fence_install_dispatches value
    where value.fence_id = fence.fence_id
      and value.dispatch_id = (input->>'dispatch_id')::uuid
    for update;
    selected_dispatch_id := install_dispatch.dispatch_id;
    current_outcome := install_dispatch.outcome_status;
    expected_mutation_class :=
      'DRIVE_LEGACY_PERMISSION_WRITER_TO_READER_V1';
    expected_source_role := 'writer';
    expected_target_role := 'reader';
    select * into strict quiesce
    from production_control.vercel_writer_quiesce_evidence value
    where value.evidence_id = fence.quiesce_evidence_id
    for update;
    if fence.status is distinct from 'INSTALLING'
       or install_dispatch.provider_mutation_class is distinct from
         expected_mutation_class
       or install_dispatch.source_role is distinct from expected_source_role
       or install_dispatch.target_role is distinct from expected_target_role
       or current_outcome not in ('PROVIDER_MUTATING', 'OUTCOME_UNKNOWN')
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_INSTALL_RESULT_NOT_SETTLEABLE';
    end if;
  else
    select * into strict restore_dispatch
    from production_control.google_writer_provider_fence_abort_dispatches value
    where value.fence_id = fence.fence_id
      and value.dispatch_id = (input->>'dispatch_id')::uuid
    for update;
    selected_dispatch_id := restore_dispatch.dispatch_id;
    current_outcome := restore_dispatch.outcome_status;
    expected_mutation_class :=
      'DRIVE_LEGACY_PERMISSION_READER_TO_WRITER_V1';
    expected_source_role := 'reader';
    expected_target_role := 'writer';
    select * into strict quiesce
    from production_control.vercel_writer_quiesce_evidence value
    where value.evidence_id = fence.restore_quiesce_evidence_id
    for update;
    if fence.status is distinct from 'ABORTING'
       or restore_dispatch.restore_quiesce_evidence_id is distinct from
         fence.restore_quiesce_evidence_id
       or restore_dispatch.provider_mutation_class is distinct from
         expected_mutation_class
       or restore_dispatch.source_role is distinct from expected_source_role
       or restore_dispatch.target_role is distinct from expected_target_role
       or current_outcome not in ('PROVIDER_MUTATING', 'OUTCOME_UNKNOWN')
       or pg_catalog.clock_timestamp() <
         fence.restore_global_writer_stop_active_at + interval '1810 seconds'
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_RESTORE_RESULT_NOT_SETTLEABLE';
    end if;
  end if;

  if quiesce.status is distinct from 'VERIFIED'
     or quiesce.purpose is distinct from fence.lifecycle_mode
     or quiesce.candidate_deployment_id is distinct from
       fence.candidate_deployment_id
     or quiesce.candidate_deployment_commit is distinct from
       fence.candidate_deployment_commit
     or quiesce.expires_at <= pg_catalog.clock_timestamp()
     or quiesce.owner_freeze_expires_at <= pg_catalog.clock_timestamp()
     or not exists (
       select 1
       from production_control.vercel_routing_rule_audit_bindings audit
       where audit.quiesce_evidence_id = quiesce.evidence_id
         and audit.routing_rule_global_invocation_quiescence_proved
         and audit.routing_rule_candidate_control_host_count = 2
         and audit.routing_rule_canonical_apex_safe_method_count = 3
         and audit.routing_rule_canonical_apex_safe_method_writer_route_count = 10
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_RESULT_WAF_EVIDENCE_STALE';
  end if;

  if outcome_value <> 'OUTCOME_UNKNOWN' then
    if provider_observed is null
       or provider_observed < pg_catalog.clock_timestamp() - interval '5 seconds'
       or provider_observed > pg_catalog.clock_timestamp() + interval '30 seconds'
       or proof_value->>'workbookId' is distinct from fence.source_workbook_id
       or proof_value->>'fenceId' is distinct from fence.fence_id::text
       or proof_value->>'installRequestId' is distinct from
         fence.install_request_id::text
       or proof_value->>'providerMutationClass' is distinct from
         expected_mutation_class
       or proof_value->>'permissionManagementScope' is distinct from
         'https://www.googleapis.com/auth/drive.file'
       or coalesce(proof_value->>'legacyPermissionFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(proof_value->>'legacyPrincipalFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(proof_value->>'priorPermissionInventoryFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(proof_value->>'currentPermissionInventoryFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(proof_value->>'permissionIdentityFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(proof_value->>'sharingCapabilityFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(proof_value->>'dedicatedDriveIdentityFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(proof_value->>'legacyDriveIdentityFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(proof_value->>'priorAclFingerprint', '') !~ '^[0-9a-f]{64}$'
       or coalesce(proof_value->>'currentAclFingerprint', '') !~ '^[0-9a-f]{64}$'
       or coalesce(proof_value->>'priorLegacyEditCapabilityFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(proof_value->>'currentLegacyEditCapabilityFingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or proof_value->'dedicatedCanShare' is distinct from 'true'::jsonb
       or proof_value->'writersCanShare' is distinct from 'true'::jsonb
       or proof_value->>'priorRole' is distinct from expected_source_role
       or proof_value->>'currentRole' is distinct from expected_target_role
       or proof_value->>'transitionIntentFingerprint' is distinct from (case
         when direction_value = 'INSTALL'
           then install_dispatch.transition_intent_fingerprint
         else restore_dispatch.transition_intent_fingerprint end)
       or proof_value->>'legacyPermissionFingerprint' is distinct from (case
         when direction_value = 'INSTALL'
           then install_dispatch.transition_intent->>'legacyPermissionFingerprint'
         else restore_dispatch.transition_intent->>'legacyPermissionFingerprint' end)
       or proof_value->>'legacyPrincipalFingerprint' is distinct from (case
         when direction_value = 'INSTALL'
           then install_dispatch.transition_intent->>'legacyPrincipalFingerprint'
         else restore_dispatch.transition_intent->>'legacyPrincipalFingerprint' end)
       or proof_value->>'permissionIdentityFingerprint' is distinct from (case
         when direction_value = 'INSTALL'
           then install_dispatch.transition_intent->>'permissionIdentityFingerprint'
         else restore_dispatch.transition_intent->>'permissionIdentityFingerprint' end)
       or proof_value->>'sharingCapabilityFingerprint' is distinct from (case
         when direction_value = 'INSTALL'
           then install_dispatch.transition_intent->>'sharingCapabilityFingerprint'
         else restore_dispatch.transition_intent->>'sharingCapabilityFingerprint' end)
       or proof_value->>'dedicatedDriveIdentityFingerprint' is distinct from (case
         when direction_value = 'INSTALL'
           then install_dispatch.transition_intent->>'dedicatedDriveIdentityFingerprint'
         else restore_dispatch.transition_intent->>'dedicatedDriveIdentityFingerprint' end)
       or proof_value->>'legacyDriveIdentityFingerprint' is distinct from (case
         when direction_value = 'INSTALL'
           then install_dispatch.transition_intent->>'legacyDriveIdentityFingerprint'
         else restore_dispatch.transition_intent->>'legacyDriveIdentityFingerprint' end)
       or proof_value->>'priorPermissionInventoryFingerprint' is distinct from (case
         when direction_value = 'INSTALL'
           then install_dispatch.transition_intent->>'priorPermissionInventoryFingerprint'
         else restore_dispatch.transition_intent->>'priorPermissionInventoryFingerprint' end)
       or proof_value->>'currentPermissionInventoryFingerprint' is distinct from (case
         when direction_value = 'INSTALL'
           then install_dispatch.transition_intent->>'expectedTargetPermissionInventoryFingerprint'
         else restore_dispatch.transition_intent->>'expectedTargetPermissionInventoryFingerprint' end)
       or proof_value->>'priorAclFingerprint' is distinct from (case
         when direction_value = 'INSTALL'
           then install_dispatch.transition_intent->>'priorAclFingerprint'
         else restore_dispatch.transition_intent->>'priorAclFingerprint' end)
       or proof_value->>'priorLegacyEditCapabilityFingerprint' is distinct from (case
         when direction_value = 'INSTALL'
           then install_dispatch.transition_intent->>'priorLegacyEditCapabilityFingerprint'
         else restore_dispatch.transition_intent->>'priorLegacyEditCapabilityFingerprint' end)
       or proof_value->>'currentLegacyEditCapabilityFingerprint' is distinct from (case
         when direction_value = 'INSTALL'
           then install_dispatch.transition_intent->>'expectedTargetLegacyEditCapabilityFingerprint'
         else restore_dispatch.transition_intent->>'expectedTargetLegacyEditCapabilityFingerprint' end)
       or proof_value->>'schemaVersion' is distinct from
         'step12-production-google-drive-acl-transition-proof-v1'
       or proof_value->>'transitionPhase' is distinct from (case
         when direction_value = 'INSTALL' then 'INSTALL' else 'ABORT' end)
       or proof_value->'priorLegacyCanEdit' is distinct from
         (case when direction_value = 'INSTALL'
           then 'true'::jsonb else 'false'::jsonb end)
       or proof_value->'priorLegacyCanShare' is distinct from
         (case when direction_value = 'INSTALL'
           then 'true'::jsonb else 'false'::jsonb end)
       or proof_value->'currentLegacyCanEdit' is distinct from
         (case when direction_value = 'INSTALL'
           then 'false'::jsonb else 'true'::jsonb end)
       or proof_value->'currentLegacyCanShare' is distinct from
         (case when direction_value = 'INSTALL'
           then 'false'::jsonb else 'true'::jsonb end)
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_RESULT_PROOF_INVALID';
    end if;
  end if;

  insert into production_control.google_writer_provider_fence_acl_dispatch_results (
    result_id, result_request_id, fence_id, direction,
    install_dispatch_id, abort_dispatch_id, outcome_status,
    transition_proof, transition_proof_fingerprint, provider_observed_at,
    request_fingerprint, payload_hash, actor_id,
    authenticated_actor_fingerprint
  ) values (
    extensions.gen_random_uuid(), result_request_identifier, fence.fence_id,
    direction_value,
    case when direction_value = 'INSTALL' then selected_dispatch_id else null end,
    case when direction_value = 'RESTORE' then selected_dispatch_id else null end,
    outcome_value, proof_value,
    nullif(proof_fingerprint, ''), provider_observed,
    pg_catalog.lower(input->>'request_fingerprint'), payload_hash_value,
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'authenticated_actor_fingerprint')
  ) returning * into inserted;

  if direction_value = 'INSTALL' then
    update production_control.google_writer_provider_fence_install_dispatches
    set outcome_status = outcome_value,
        transition_proof = proof_value,
        transition_proof_fingerprint = nullif(proof_fingerprint, ''),
        provider_observed_at = provider_observed,
        target_confirmed_at = case when outcome_value = 'TARGET_CONFIRMED'
          then pg_catalog.clock_timestamp() else null end,
        result_request_id = inserted.result_request_id,
        result_request_fingerprint = inserted.request_fingerprint,
        result_payload_hash = inserted.payload_hash,
        result_recorded_at = inserted.recorded_at
    where dispatch_id = selected_dispatch_id;
    if outcome_value = 'TARGET_CONFIRMED' then
      update production_control.google_writer_provider_fences
      set acl_reader_confirmed_at = inserted.recorded_at,
          acl_reader_transition_fingerprint = proof_fingerprint,
          updated_at = pg_catalog.clock_timestamp()
      where fence_id = fence.fence_id;
    end if;
  else
    update production_control.google_writer_provider_fence_abort_dispatches
    set outcome_status = outcome_value,
        transition_proof = proof_value,
        transition_proof_fingerprint = nullif(proof_fingerprint, ''),
        provider_observed_at = provider_observed,
        target_confirmed_at = case when outcome_value = 'TARGET_CONFIRMED'
          then pg_catalog.clock_timestamp() else null end,
        result_request_id = inserted.result_request_id,
        result_request_fingerprint = inserted.request_fingerprint,
        result_payload_hash = inserted.payload_hash,
        result_recorded_at = inserted.recorded_at
    where dispatch_id = selected_dispatch_id;
    if outcome_value = 'TARGET_CONFIRMED' then
      update production_control.google_writer_provider_fences
      set acl_writer_restored_at = inserted.recorded_at,
          acl_writer_restore_transition_fingerprint = proof_fingerprint,
          updated_at = pg_catalog.clock_timestamp()
      where fence_id = fence.fence_id;
    end if;
  end if;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result,
    details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_' || direction_value || '_' ||
      outcome_value,
    'SCORING_AUTHORITY', '2026', inserted.actor_id,
    inserted.request_fingerprint,
    case when outcome_value = 'TARGET_CONFIRMED'
      then 'SUCCEEDED' else 'UNKNOWN' end,
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'dispatch_id', selected_dispatch_id,
      'result_id', inserted.result_id,
      'direction', direction_value,
      'outcome_status', outcome_value,
      'transition_proof_fingerprint', inserted.transition_proof_fingerprint,
      'provider_observed_at', inserted.provider_observed_at,
      'admission_reservation_active', true
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_' || direction_value ||
      '_' || outcome_value,
    'fence_id', fence.fence_id,
    'result_id', inserted.result_id,
    'result_request_id', inserted.result_request_id,
    'direction', direction_value,
    'outcome_status', outcome_value,
    'transition_proof_fingerprint', inserted.transition_proof_fingerprint,
    'provider_observed_at', inserted.provider_observed_at,
    'recorded_at', inserted.recorded_at,
    'admission_reservation_active', true,
    'idempotent', false
  );
end;
$$;

-- ACL-v2 lifecycle entry point. CUTOVER preserves the armed-candidate state;
-- REHEARSAL is an isolated DORMANT/GOOGLE/PASSPORT execution. Both require the
-- same provider-signed global invocation stop before reserving admission.
create or replace function public.begin_production_google_writer_provider_fence_install(
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
  quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  waf_epoch production_control.vercel_writer_critical_waf_epochs%rowtype;
  waf_observation
    production_control.vercel_writer_critical_waf_observations%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
  request_identifier uuid;
  fence_identifier uuid := extensions.gen_random_uuid();
  payload_hash_value text := production_control.cutover_payload_hash(input);
  lifecycle text := pg_catalog.upper(coalesce(input->>'lifecycle_mode', ''));
  empty_sheet_union_fingerprint text :=
    production_control.structured_evidence_fingerprint('[]'::jsonb);
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'operation' is distinct from
       'BEGIN_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL'
     or lifecycle not in ('CUTOVER', 'REHEARSAL')
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'critical_waf_epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '') !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'dedicated_principal_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'legacy_credential_generation_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'baseline_provider_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'baseline_acl_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'baseline_canonical_value_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'baseline_formula_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'baseline_combined_value_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'writer_scope_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.lower(coalesce(input->>'canonical_sheet_union_fingerprint', ''))
       is distinct from empty_sheet_union_fingerprint
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_BEGIN_INPUT_INVALID';
  end if;
  request_identifier := (input->>'install_request_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into fence
  from production_control.google_writer_provider_fences value
  where value.install_request_id = request_identifier
  for update;
  if found then
    if fence.begin_request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or fence.begin_payload_hash is distinct from payload_hash_value
       or fence.lifecycle_mode is distinct from lifecycle
       or fence.candidate_deployment_id is distinct from
         input->>'candidate_deployment_id'
       or fence.candidate_deployment_commit is distinct from
         pg_catalog.lower(input->>'candidate_deployment_commit')
       or fence.critical_waf_epoch_id is distinct from
         (input->>'critical_waf_epoch_id')::uuid
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_BEGIN_IDEMPOTENCY_CONFLICT';
    end if;
    return production_control.google_writer_provider_fence_response(fence, true);
  end if;
  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = (input->>'quiesce_evidence_id')::uuid
  for update;
  select * into strict waf_epoch
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_id = (input->>'critical_waf_epoch_id')::uuid
  for update;
  select * into strict waf_observation
  from production_control.vercel_writer_critical_waf_observations value
  where value.observation_id = quiesce.critical_waf_observation_id
    and value.epoch_id = waf_epoch.epoch_id;
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
  if quiesce.status is distinct from 'VERIFIED'
     or quiesce.critical_waf_epoch_id is distinct from waf_epoch.epoch_id
     or quiesce.critical_waf_quiesce_stage is distinct from 'INSTALL'
     or waf_epoch.status is distinct from 'ACTIVE_UNBOUND'
     or waf_epoch.bound_fence_id is not null
     or waf_epoch.bound_quiesce_evidence_id is not null
     or waf_epoch.critical_active_observation_id is distinct from
       waf_observation.observation_id
     or waf_observation.evidence_stage is distinct from 'CRITICAL_ACTIVE'
     or waf_observation.expires_at <= pg_catalog.clock_timestamp()
     or quiesce.purpose is distinct from lifecycle
     or quiesce.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or quiesce.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or quiesce.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
     or quiesce.expires_at <= pg_catalog.clock_timestamp() + interval '205 seconds'
     or quiesce.owner_freeze_expires_at <=
       pg_catalog.clock_timestamp() + interval '205 seconds'
     or not exists (
       select 1 from production_control.vercel_routing_rule_audit_bindings audit
       where audit.quiesce_evidence_id = quiesce.evidence_id
         and audit.routing_rule_global_invocation_quiescence_proved
         and audit.routing_rule_candidate_control_host_count = 2
         and audit.routing_rule_canonical_apex_safe_method_count = 3
         and audit.routing_rule_canonical_apex_safe_method_writer_route_count = 10
     )
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or (lifecycle = 'CUTOVER' and (
       gate.admission_deployment_id is distinct from input->>'deployment_id'
       or activation.expected_deployment_commit is distinct from
         pg_catalog.lower(input->>'deployment_commit')
     ))
     or (lifecycle = 'REHEARSAL' and (
       input->>'deployment_id' is distinct from input->>'candidate_deployment_id'
       or pg_catalog.lower(input->>'deployment_commit') is distinct from
         pg_catalog.lower(input->>'candidate_deployment_commit')
     ))
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.active_transition_epoch_id is not null
     or activation.active_google_writer_provider_fence_id is not null
     or resource.scoring_authority is distinct from 'GOOGLE'
     or resource.scoring_ingress_enabled or resource.workers_enabled
     or gate.authority is distinct from 'GOOGLE'
     or gate.admission_state is distinct from 'OPEN'
     or gate.active_closure_id is not null
     or gate.external_fence_evidence_id is not null
     or gate.google_writer_provider_fence_id is not null
     or gate.google_writer_provider_verification_id is not null
     or (lifecycle = 'CUTOVER' and (
       activation.state is distinct from 'GOOGLE_LEASE_ARMED'
       or resource.participant_identity_authority is distinct from 'SUPABASE'
       or resource.current_tournament_read_authority is distinct from 'SUPABASE'
       or gate.state is distinct from 'OPEN'
       or not gate.admission_protocol_enforced
     ))
     or (lifecycle = 'REHEARSAL' and (
       activation.state is distinct from 'DORMANT'
       or resource.participant_identity_authority is distinct from 'PASSPORT'
       or resource.current_tournament_read_authority is distinct from 'GOOGLE'
       or gate.state is distinct from 'PAUSED'
       or gate.admission_protocol_enforced
       or resource.public_supabase_reads_enabled
       or resource.auth_user_creation_enabled
     ))
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_BEGIN_STATE_INVALID';
  end if;
  insert into production_control.google_writer_provider_fences (
    fence_id, install_request_id, begin_request_fingerprint,
    begin_payload_hash, quiesce_evidence_id, candidate_deployment_id,
    candidate_deployment_commit, source_workbook_id,
    dedicated_principal_fingerprint,
    legacy_credential_generation_fingerprint,
    baseline_provider_fingerprint, baseline_acl_fingerprint,
    baseline_canonical_value_fingerprint, baseline_formula_fingerprint,
    baseline_combined_value_fingerprint, writer_scope_fingerprint,
    canonical_sheet_union_fingerprint, protection_description_prefix,
    actor_id, authenticated_actor_fingerprint, lifecycle_mode,
    critical_waf_epoch_id, global_writer_stop_active_at
  ) values (
    fence_identifier, request_identifier,
    pg_catalog.lower(input->>'request_fingerprint'), payload_hash_value,
    quiesce.evidence_id, input->>'candidate_deployment_id',
    pg_catalog.lower(input->>'candidate_deployment_commit'),
    input->>'source_workbook_id',
    pg_catalog.lower(input->>'dedicated_principal_fingerprint'),
    pg_catalog.lower(input->>'legacy_credential_generation_fingerprint'),
    pg_catalog.lower(input->>'baseline_provider_fingerprint'),
    pg_catalog.lower(input->>'baseline_acl_fingerprint'),
    pg_catalog.lower(input->>'baseline_canonical_value_fingerprint'),
    pg_catalog.lower(input->>'baseline_formula_fingerprint'),
    pg_catalog.lower(input->>'baseline_combined_value_fingerprint'),
    pg_catalog.lower(input->>'writer_scope_fingerprint'),
    empty_sheet_union_fingerprint,
    -- This legacy column remains an inert compatibility key for historical
    -- provider-fence rows.  The executable fence kind is carried by the
    -- DRIVE_ACL_V2 verification/dispatch contract below; retaining the exact
    -- predecessor prefix avoids weakening or replacing its table constraint.
    'STEP12_GOOGLE_WRITER_PROVIDER_FENCE:' || fence_identifier::text,
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'authenticated_actor_fingerprint'), lifecycle,
    waf_epoch.epoch_id, waf_epoch.critical_active_at
  ) returning * into fence;
  update production_control.vercel_writer_critical_waf_epochs
  set status = 'FENCE_BOUND',
      bound_fence_id = fence.fence_id,
      bound_quiesce_evidence_id = quiesce.evidence_id,
      fence_bind_request_id = fence.install_request_id,
      fence_bind_request_fingerprint = fence.begin_request_fingerprint,
      fence_bind_payload_hash = fence.begin_payload_hash,
      fence_bound_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where epoch_id = waf_epoch.epoch_id
    and status = 'ACTIVE_UNBOUND'
    and bound_fence_id is null
    and bound_quiesce_evidence_id is null
  returning * into waf_epoch;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_WAF_EPOCH_BIND_RACE';
  end if;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result,
    details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_' || lifecycle || '_STARTED',
    'SCORING_AUTHORITY', '2026', fence.actor_id,
    fence.begin_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'install_request_id', fence.install_request_id,
      'lifecycle_mode', fence.lifecycle_mode,
      'quiesce_evidence_id', fence.quiesce_evidence_id,
      'critical_waf_epoch_id', fence.critical_waf_epoch_id,
      'critical_waf_active_observation_id',
        waf_epoch.critical_active_observation_id,
      'global_writer_stop_active_at', fence.global_writer_stop_active_at,
      'admission_reservation_active', true,
      'protection_mutation_count', 0
    )
  );
  return production_control.google_writer_provider_fence_response(fence, false);
end;
$$;

create or replace function public.begin_production_google_writer_provider_fence_install_dispatch(
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
  fence production_control.google_writer_provider_fences%rowtype;
  prior
    production_control.google_writer_provider_fence_install_dispatches%rowtype;
  latest
    production_control.google_writer_provider_fence_install_dispatches%rowtype;
  inserted
    production_control.google_writer_provider_fence_install_dispatches%rowtype;
  quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  waf_epoch
    production_control.vercel_writer_critical_waf_epochs%rowtype;
  request_identifier uuid;
  payload_hash_value text := production_control.cutover_payload_hash(input);
  remaining_dispatch_budget_ms bigint;
  next_attempt integer := 1;
  dispatch_issued_at timestamptz := pg_catalog.clock_timestamp();
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'operation' is distinct from
       'BEGIN_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_DISPATCH'
     or coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'dispatch_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or input->>'mutation_plan' is distinct from
       'DRIVE_ACL_LEGACY_WRITER_TO_READER_V1'
     or input->>'provider_mutation_class' is distinct from
       'DRIVE_LEGACY_PERMISSION_WRITER_TO_READER_V1'
     or input->>'source_role' is distinct from 'writer'
     or input->>'target_role' is distinct from 'reader'
     or pg_catalog.jsonb_typeof(input->'transition_intent') is distinct from
       'object'
     or (select pg_catalog.count(*)
         from pg_catalog.jsonb_object_keys(input->'transition_intent')) <> 32
     or input->'transition_intent'->>'schemaVersion' is distinct from
       'step12-production-google-drive-acl-transition-intent-v1'
     or input->'transition_intent'->>'workbookId' is distinct from
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or input->'transition_intent'->>'fenceId' is distinct from
       pg_catalog.lower(input->>'fence_id')
     or input->'transition_intent'->>'installRequestId' is distinct from
       pg_catalog.lower(input->>'install_request_id')
     or input->'transition_intent'->>'providerMutationClass' is distinct from
       input->>'provider_mutation_class'
     or input->'transition_intent'->>'sourceRole' is distinct from 'writer'
     or input->'transition_intent'->>'targetRole' is distinct from 'reader'
     or input->'transition_intent'->>'permissionManagementScope' is distinct from
       'https://www.googleapis.com/auth/drive.file'
     or input->'transition_intent'->'priorLegacyCanEdit' is distinct from
       'true'::jsonb
     or input->'transition_intent'->'priorLegacyCanShare' is distinct from
       'true'::jsonb
     or input->'transition_intent'->'expectedTargetLegacyCanEdit' is distinct from
       'false'::jsonb
     or input->'transition_intent'->'expectedTargetLegacyCanShare' is distinct from
       'false'::jsonb
     or input->'transition_intent'->>'transitionIntentFingerprint' is distinct from
       pg_catalog.lower(input->>'transition_intent_fingerprint')
     or production_control.google_drive_acl_transition_intent_fingerprint_v1(
       (input->'transition_intent') - 'transitionIntentFingerprint'
     ) is distinct from pg_catalog.lower(input->>'transition_intent_fingerprint')
     or coalesce(input->>'transition_intent_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'provider_preflight_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or input->>'provider_preflight_position' is distinct from 'SOURCE'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_DISPATCH_INPUT_INVALID';
  end if;
  request_identifier := (input->>'dispatch_request_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into prior
  from production_control.google_writer_provider_fence_install_dispatches value
  where value.dispatch_request_id = request_identifier;
  if found then
    if prior.fence_id is distinct from (input->>'fence_id')::uuid
       or prior.request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or prior.payload_hash is distinct from payload_hash_value
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_DISPATCH_IDEMPOTENCY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_DISPATCH_ISSUED',
      'fence_id', prior.fence_id,
      'install_request_id', pg_catalog.lower(input->>'install_request_id'),
      'dispatch_id', prior.dispatch_id,
      'dispatch_request_id', prior.dispatch_request_id,
      'attempt', prior.attempt,
      'mutation_plan', prior.mutation_plan,
      'provider_mutation_class', prior.provider_mutation_class,
      'source_role', prior.source_role,
      'target_role', prior.target_role,
      'transition_intent_fingerprint', prior.transition_intent_fingerprint,
      'provider_preflight_fingerprint', prior.provider_preflight_fingerprint,
      'provider_preflight_position', prior.provider_preflight_position,
      'status', prior.outcome_status,
      'issued_at', prior.issued_at,
      'expires_at', prior.expires_at,
      'remaining_dispatch_budget_ms', greatest(0,
        pg_catalog.floor(extract(epoch from (
          prior.expires_at - pg_catalog.clock_timestamp()
        )) * 1000)::bigint),
      'dispatch_usable', false,
      'replay_usable', false,
      'idempotent', true
    );
  end if;

  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'fence_id')::uuid
    and value.install_request_id = (input->>'install_request_id')::uuid
  for update;
  select * into latest
  from production_control.google_writer_provider_fence_install_dispatches value
  where value.fence_id = fence.fence_id
  order by value.attempt desc
  limit 1
  for update;
  if found then
    -- Drive permissions.update has no provider-certified late-commit ceiling.
    -- Even a same-direction retry after a SOURCE readback could overlap a
    -- delayed first PATCH and defeat the exact non-impact chronology.  A
    -- TARGET readback settles the existing dispatch through the result RPC;
    -- every non-target/unknown outcome remains reservation-holding and needs
    -- owner/provider intervention rather than a second PATCH.
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_RECOVERY_REDISPATCH_FORBIDDEN';
  end if;
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
  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = fence.quiesce_evidence_id
  for update;
  select * into strict waf_epoch
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_id = fence.critical_waf_epoch_id
  for update;
  if fence.status is distinct from 'INSTALLING'
     or fence.quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or fence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or fence.actor_id is distinct from input->>'actor_id'
     or fence.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
     or quiesce.status is distinct from 'VERIFIED'
     or quiesce.purpose is distinct from fence.lifecycle_mode
     or waf_epoch.status is distinct from 'FENCE_BOUND'
     or waf_epoch.bound_fence_id is distinct from fence.fence_id
     or waf_epoch.bound_quiesce_evidence_id is distinct from
       quiesce.evidence_id
     or waf_epoch.critical_active_at is null
     or quiesce.expires_at <= pg_catalog.clock_timestamp()
     or quiesce.owner_freeze_expires_at <= pg_catalog.clock_timestamp()
     or not exists (
       select 1
       from production_control.vercel_routing_rule_audit_bindings audit
       where audit.quiesce_evidence_id = quiesce.evidence_id
         and audit.routing_rule_global_invocation_quiescence_proved
         and audit.routing_rule_candidate_control_host_count = 2
         and audit.routing_rule_canonical_apex_safe_method_count = 3
         and audit.routing_rule_canonical_apex_safe_method_writer_route_count = 10
     )
     or exists (
       select 1
       from production_control.google_writer_provider_fence_settlement_observations value
       where value.fence_id = fence.fence_id
     )
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or (fence.lifecycle_mode = 'CUTOVER' and (
       gate.admission_deployment_id is distinct from input->>'deployment_id'
       or activation.expected_deployment_commit is distinct from
         pg_catalog.lower(input->>'deployment_commit')
     ))
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       input->>'deployment_id' is distinct from fence.candidate_deployment_id
       or pg_catalog.lower(input->>'deployment_commit') is distinct from
         fence.candidate_deployment_commit
     ))
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.active_transition_epoch_id is not null
     or activation.active_google_writer_provider_fence_id is not null
     or activation.active_google_writer_provider_verification_id is not null
     or resource.scoring_authority is distinct from 'GOOGLE'
     or gate.authority is distinct from 'GOOGLE'
     or gate.admission_state is distinct from 'OPEN'
     or (fence.lifecycle_mode = 'CUTOVER' and (
       activation.state is distinct from 'GOOGLE_LEASE_ARMED'
       or resource.participant_identity_authority is distinct from 'SUPABASE'
       or resource.current_tournament_read_authority is distinct from 'SUPABASE'
       or gate.state is distinct from 'OPEN'
       or not gate.admission_protocol_enforced
     ))
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       activation.state is distinct from 'DORMANT'
       or resource.participant_identity_authority is distinct from 'PASSPORT'
       or resource.current_tournament_read_authority is distinct from 'GOOGLE'
       or gate.state is distinct from 'PAUSED'
       or gate.admission_protocol_enforced
     ))
     or gate.active_closure_id is not null
     or gate.external_fence_evidence_id is not null
     or gate.google_writer_provider_fence_id is not null
     or gate.google_writer_provider_verification_id is not null
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_DISPATCH_NOT_SAFE';
  end if;

  if fence.global_writer_stop_active_at is null then
    update production_control.google_writer_provider_fences
    set global_writer_stop_active_at = waf_epoch.critical_active_at,
        updated_at = pg_catalog.clock_timestamp()
    where fence_id = fence.fence_id
    returning * into fence;
  elsif fence.global_writer_stop_active_at is distinct from
      waf_epoch.critical_active_at then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_GLOBAL_STOP_MISMATCH';
  end if;

  insert into production_control.google_writer_provider_fence_install_dispatches (
    dispatch_id, fence_id, dispatch_request_id, attempt, mutation_plan,
    provider_mutation_class, source_role, target_role, transition_intent,
    transition_intent_fingerprint, provider_preflight_fingerprint,
    provider_preflight_position,
    request_fingerprint,
    payload_hash, activation_revision, authority_generation_id,
    admission_generation_id, admission_revision, actor_id,
    authenticated_actor_fingerprint, issued_at, expires_at
  ) values (
    extensions.gen_random_uuid(), fence.fence_id, request_identifier,
    next_attempt,
    input->>'mutation_plan',
    input->>'provider_mutation_class', input->>'source_role',
    input->>'target_role', input->'transition_intent',
    pg_catalog.lower(input->>'transition_intent_fingerprint'),
    pg_catalog.lower(input->>'provider_preflight_fingerprint'),
    'SOURCE',
    pg_catalog.lower(input->>'request_fingerprint'), payload_hash_value,
    activation.activation_revision, activation.authority_generation_id,
    gate.admission_generation_id, gate.admission_revision,
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'authenticated_actor_fingerprint'),
    dispatch_issued_at, dispatch_issued_at + interval '15 seconds'
  ) returning * into inserted;
  remaining_dispatch_budget_ms := greatest(0,
    pg_catalog.floor(extract(epoch from (
      inserted.expires_at - pg_catalog.clock_timestamp()
    )) * 1000)::bigint);
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result,
    details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_DISPATCH_ISSUED',
    'SCORING_AUTHORITY', '2026', inserted.actor_id,
    inserted.request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', inserted.fence_id,
      'dispatch_id', inserted.dispatch_id,
      'dispatch_request_id', inserted.dispatch_request_id,
      'attempt', inserted.attempt,
      'mutation_plan', inserted.mutation_plan,
      'provider_mutation_class', inserted.provider_mutation_class,
      'source_role', inserted.source_role,
      'target_role', inserted.target_role,
      'transition_intent_fingerprint',
        inserted.transition_intent_fingerprint,
      'provider_preflight_fingerprint',
        inserted.provider_preflight_fingerprint,
      'issued_at', inserted.issued_at,
      'expires_at', inserted.expires_at,
      'global_writer_stop_active_at', fence.global_writer_stop_active_at,
      'admission_reservation_active', true
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_DISPATCH_ISSUED',
    'fence_id', inserted.fence_id,
    'install_request_id', fence.install_request_id,
    'dispatch_id', inserted.dispatch_id,
    'dispatch_request_id', inserted.dispatch_request_id,
    'attempt', inserted.attempt,
    'mutation_plan', inserted.mutation_plan,
    'provider_mutation_class', inserted.provider_mutation_class,
    'source_role', inserted.source_role,
    'target_role', inserted.target_role,
    'transition_intent_fingerprint', inserted.transition_intent_fingerprint,
    'provider_preflight_fingerprint', inserted.provider_preflight_fingerprint,
    'provider_preflight_position', inserted.provider_preflight_position,
    'status', inserted.outcome_status,
    'issued_at', inserted.issued_at,
    'expires_at', inserted.expires_at,
    'remaining_dispatch_budget_ms', remaining_dispatch_budget_ms,
    'dispatch_usable', remaining_dispatch_budget_ms > 0,
    'replay_usable', remaining_dispatch_budget_ms > 0,
    'idempotent', false
  );
end;
$$;

-- A later Supabase-to-Google rollback cannot reuse the already-restored
-- cutover WAF epoch.  After the authority rollback has atomically paused and
-- reconciled Supabase ingress, bind one fresh provider-proved critical window
-- to the retained ACL reader fence.  This does not restore the Drive writer;
-- it only establishes the continuous all-origin admission stop under which the
-- normal ABORTING/reader-to-writer lifecycle may run.
create or replace function public.bind_production_google_writer_provider_fence_rollback_waf_epoch(
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
  closure production_control.scoring_admission_closures%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
  prior_epoch production_control.vercel_writer_critical_waf_epochs%rowtype;
  epoch production_control.vercel_writer_critical_waf_epochs%rowtype;
  quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  observation
    production_control.vercel_writer_critical_waf_observations%rowtype;
  install_dispatch
    production_control.google_writer_provider_fence_install_dispatches%rowtype;
  bind_request uuid;
  payload_hash_value text := production_control.cutover_payload_hash(input);
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'operation' is distinct from
       'BIND_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ROLLBACK_WAF_EPOCH'
     or coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'critical_waf_epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'bind_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_ROLLBACK_WAF_BIND_INPUT_INVALID';
  end if;
  bind_request := (input->>'bind_request_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'fence_id')::uuid
  for update;
  select * into strict epoch
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_id = (input->>'critical_waf_epoch_id')::uuid
  for update;
  if epoch.status = 'FENCE_BOUND' then
    if epoch.transition_mode is distinct from 'ROLLBACK'
       or epoch.bound_fence_id is distinct from fence.fence_id
       or epoch.bound_quiesce_evidence_id is distinct from
         (input->>'quiesce_evidence_id')::uuid
       or epoch.fence_bind_request_id is distinct from bind_request
       or epoch.fence_bind_request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or epoch.fence_bind_payload_hash is distinct from payload_hash_value
       or fence.critical_waf_epoch_id is distinct from epoch.epoch_id
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_ROLLBACK_WAF_BIND_IDEMPOTENCY_CONFLICT';
    end if;
    return production_control.google_writer_provider_fence_response(
      fence, true
    ) || production_control.vercel_writer_critical_waf_epoch_response(
      epoch, true
    );
  end if;
  select * into strict prior_epoch
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_id = fence.critical_waf_epoch_id
  for update;
  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = (input->>'quiesce_evidence_id')::uuid
  for update;
  select * into strict observation
  from production_control.vercel_writer_critical_waf_observations value
  where value.observation_id = quiesce.critical_waf_observation_id
    and value.epoch_id = epoch.epoch_id;
  select * into strict install_dispatch
  from production_control.google_writer_provider_fence_install_dispatches value
  where value.fence_id = fence.fence_id
    and value.outcome_status = 'TARGET_CONFIRMED'
  order by value.attempt desc
  limit 1
  for update;
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
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = gate.active_closure_id
  for update;

  if fence.lifecycle_mode is distinct from 'CUTOVER'
     or fence.status is distinct from 'INSTALLED'
     or fence.active_verification_id is null
     or fence.acl_reader_confirmed_at is null
     or fence.acl_writer_restored_at is not null
     or install_dispatch.transition_proof->>'currentRole' is distinct from
       'reader'
     or install_dispatch.transition_proof->'currentLegacyCanEdit'
       is distinct from 'false'::jsonb
     or install_dispatch.transition_proof->'currentLegacyCanShare'
       is distinct from 'false'::jsonb
     or prior_epoch.status is distinct from 'BASELINE_RESTORED'
     or prior_epoch.bound_fence_id is distinct from fence.fence_id
     or fence.baseline_waf_restored_observation_id is distinct from
       prior_epoch.baseline_restored_observation_id
     or epoch.status is distinct from 'ACTIVE_UNBOUND'
     or epoch.purpose is distinct from 'CUTOVER'
     or epoch.transition_mode is distinct from 'ROLLBACK'
     or epoch.candidate_deployment_target is distinct from 'PREVIEW'
     or epoch.candidate_deployment_id is distinct from
       fence.candidate_deployment_id
     or epoch.candidate_deployment_commit is distinct from
       fence.candidate_deployment_commit
     or epoch.actor_id is distinct from fence.actor_id
     or epoch.authenticated_actor_fingerprint is distinct from
       fence.authenticated_actor_fingerprint
     or epoch.actor_id is distinct from input->>'actor_id'
     or epoch.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
     or epoch.critical_active_observation_id is distinct from
       observation.observation_id
     or observation.evidence_stage is distinct from 'CRITICAL_ACTIVE'
     or observation.expires_at <= pg_catalog.clock_timestamp()
     or quiesce.status is distinct from 'VERIFIED'
     or quiesce.purpose is distinct from 'CUTOVER'
     or quiesce.critical_waf_epoch_id is distinct from epoch.epoch_id
     or quiesce.critical_waf_quiesce_stage is distinct from 'INSTALL'
     or quiesce.candidate_deployment_id is distinct from
       epoch.candidate_deployment_id
     or quiesce.candidate_deployment_commit is distinct from
       epoch.candidate_deployment_commit
     or quiesce.expires_at <= pg_catalog.clock_timestamp()
     or quiesce.owner_freeze_expires_at <= pg_catalog.clock_timestamp()
     or not exists (
       select 1
       from production_control.vercel_routing_rule_audit_bindings audit
       where audit.quiesce_evidence_id = quiesce.evidence_id
         and audit.routing_rule_global_invocation_quiescence_proved
         and audit.routing_rule_candidate_control_host_count = 2
         and audit.routing_rule_canonical_apex_safe_method_count = 3
         and audit.routing_rule_canonical_apex_safe_method_writer_route_count = 10
     )
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or activation.state is distinct from 'ROLLED_BACK'
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.active_google_writer_provider_fence_id is distinct from
       fence.fence_id
     or resource.scoring_authority is distinct from 'GOOGLE'
     or resource.scoring_ingress_enabled
     or resource.participant_identity_authority is distinct from 'PASSPORT'
     or resource.current_tournament_read_authority is distinct from 'GOOGLE'
     or gate.state is distinct from 'PAUSED'
     or gate.authority is distinct from 'GOOGLE'
     or gate.admission_state is distinct from 'CLOSED'
     or not gate.admission_protocol_enforced
     or gate.google_writer_provider_fence_id is distinct from fence.fence_id
     or gate.active_closure_id is distinct from closure.closure_id
     or closure.status is distinct from 'CLOSED'
     or closure.authority is distinct from 'GOOGLE'
     or closure.reconciliation_fingerprint !~ '^[0-9a-f]{64}$'
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
     or exists (
       select 1 from scoring_authority.authority_epochs value
       where value.tournament_id = '2026' and value.status = 'PREPARED'
     )
     or exists (
       select 1 from scoring_authority.google_outbox_events value
       where value.tournament_id = '2026' and value.status <> 'DELIVERED'
     )
     or exists (
       select 1 from scoring_authority.scorecard_archive_jobs value
       where value.tournament_id = '2026'
         and value.status not in ('VERIFIED', 'SUPERSEDED')
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_ROLLBACK_WAF_BIND_NOT_SAFE';
  end if;

  update production_control.vercel_writer_critical_waf_epochs
  set status = 'FENCE_BOUND',
      bound_fence_id = fence.fence_id,
      bound_quiesce_evidence_id = quiesce.evidence_id,
      fence_bind_request_id = bind_request,
      fence_bind_request_fingerprint =
        pg_catalog.lower(input->>'request_fingerprint'),
      fence_bind_payload_hash = payload_hash_value,
      fence_bound_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where epoch_id = epoch.epoch_id
    and status = 'ACTIVE_UNBOUND'
    and bound_fence_id is null
    and bound_quiesce_evidence_id is null
  returning * into epoch;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_ROLLBACK_WAF_BIND_RACE';
  end if;
  update production_control.google_writer_provider_fences
  set critical_waf_epoch_id = epoch.epoch_id,
      global_writer_stop_active_at = epoch.critical_active_at,
      restore_quiesce_evidence_id = null,
      restore_global_writer_stop_active_at = null,
      baseline_waf_restored_observation_id = null,
      updated_at = pg_catalog.clock_timestamp()
  where fence_id = fence.fence_id
    and status = 'INSTALLED'
  returning * into fence;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_ROLLBACK_WAF_FENCE_BIND_RACE';
  end if;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result,
    details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_ROLLBACK_CRITICAL_WAF_BOUND',
    'SCORING_AUTHORITY', '2026', fence.actor_id,
    epoch.fence_bind_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'critical_waf_epoch_id', epoch.epoch_id,
      'prior_critical_waf_epoch_id', prior_epoch.epoch_id,
      'quiesce_evidence_id', quiesce.evidence_id,
      'critical_active_at', epoch.critical_active_at,
      'admission_state', gate.admission_state,
      'admission_reservation_active', true
    )
  );
  return production_control.google_writer_provider_fence_response(
    fence, false
  ) || production_control.vercel_writer_critical_waf_epoch_response(
    epoch, false
  );
end;
$$;

create or replace function public.begin_abort_production_google_writer_provider_fence_install(
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
  fence production_control.google_writer_provider_fences%rowtype;
  dispatch
    production_control.google_writer_provider_fence_install_dispatches%rowtype;
  restore_quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  waf_epoch
    production_control.vercel_writer_critical_waf_epochs%rowtype;
  restore_waf_observation
    production_control.vercel_writer_critical_waf_observations%rowtype;
  prior_status text;
  request_identifier uuid;
  payload_hash_value text := production_control.cutover_payload_hash(input);
  quiescence_not_before timestamptz;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'operation' is distinct from
       'BEGIN_ABORT_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL'
     or coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'abort_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'restore_quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_BEGIN_INPUT_INVALID';
  end if;
  request_identifier := (input->>'abort_request_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'fence_id')::uuid
    and value.install_request_id = (input->>'install_request_id')::uuid
  for update;
  if fence.status in ('ABORTING', 'FAILED') then
    if fence.abort_request_id is distinct from request_identifier
       or fence.abort_begin_request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or fence.abort_begin_payload_hash is distinct from payload_hash_value
       or fence.restore_quiesce_evidence_id is distinct from
         (input->>'restore_quiesce_evidence_id')::uuid
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_BEGIN_IDEMPOTENCY_CONFLICT';
    end if;
    return production_control.google_writer_provider_fence_response(fence, true);
  end if;
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
  select * into dispatch
  from production_control.google_writer_provider_fence_install_dispatches value
  where value.fence_id = fence.fence_id
  order by value.attempt desc
  limit 1
  for update;
  select * into strict restore_quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id =
    (input->>'restore_quiesce_evidence_id')::uuid
  for update;
  select * into strict waf_epoch
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_id = fence.critical_waf_epoch_id
  for update;
  select * into strict restore_waf_observation
  from production_control.vercel_writer_critical_waf_observations value
  where value.observation_id = restore_quiesce.critical_waf_observation_id
    and value.epoch_id = waf_epoch.epoch_id;
  prior_status := fence.status;
  quiescence_not_before :=
    waf_epoch.critical_active_at + interval '1810 seconds';
  if fence.status not in ('INSTALLING', 'INSTALLED', 'REMOVAL_AUTHORIZED')
     or dispatch.dispatch_id is null
     or dispatch.outcome_status is distinct from 'TARGET_CONFIRMED'
     or restore_quiesce.status is distinct from 'VERIFIED'
     or restore_quiesce.critical_waf_epoch_id is distinct from
       waf_epoch.epoch_id
     or restore_quiesce.critical_waf_quiesce_stage is distinct from
       'RESTORE_REATTEST'
     or restore_waf_observation.expires_at <=
       pg_catalog.clock_timestamp()
     or waf_epoch.status is distinct from 'FENCE_BOUND'
     or waf_epoch.bound_fence_id is distinct from fence.fence_id
     or waf_epoch.bound_quiesce_evidence_id is null
     or (waf_epoch.transition_mode <> 'ROLLBACK' and
       waf_epoch.bound_quiesce_evidence_id is distinct from
         fence.quiesce_evidence_id)
     or (waf_epoch.transition_mode = 'ROLLBACK' and
       waf_epoch.bound_quiesce_evidence_id = fence.quiesce_evidence_id)
     or restore_waf_observation.evidence_stage is distinct from
       'CRITICAL_REATTEST'
     or waf_epoch.latest_critical_reattest_observation_id is distinct from
       restore_waf_observation.observation_id
     or restore_quiesce.purpose is distinct from fence.lifecycle_mode
     or (fence.lifecycle_mode = 'REHEARSAL' and
       waf_epoch.transition_mode is distinct from 'REHEARSAL')
     or (fence.lifecycle_mode = 'CUTOVER' and
       activation.state = 'ROLLED_BACK' and
       waf_epoch.transition_mode is distinct from 'ROLLBACK')
     or (fence.lifecycle_mode = 'CUTOVER' and
       activation.state <> 'ROLLED_BACK' and
       waf_epoch.transition_mode is distinct from 'CUTOVER')
     or restore_quiesce.candidate_deployment_id is distinct from
       fence.candidate_deployment_id
     or restore_quiesce.candidate_deployment_commit is distinct from
       fence.candidate_deployment_commit
     or restore_quiesce.expires_at <= pg_catalog.clock_timestamp()
     or restore_quiesce.owner_freeze_expires_at <= pg_catalog.clock_timestamp()
     or not exists (
       select 1
       from production_control.vercel_routing_rule_audit_bindings audit
       where audit.quiesce_evidence_id = restore_quiesce.evidence_id
         and audit.routing_rule_global_invocation_quiescence_proved
         and audit.routing_rule_candidate_control_host_count = 2
         and audit.routing_rule_canonical_apex_safe_method_count = 3
         and audit.routing_rule_canonical_apex_safe_method_writer_route_count = 10
     )
     or fence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or fence.actor_id is distinct from input->>'actor_id'
     or fence.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or (fence.lifecycle_mode = 'CUTOVER' and (
       gate.admission_deployment_id is distinct from input->>'deployment_id'
       or activation.expected_deployment_commit is distinct from
         pg_catalog.lower(input->>'deployment_commit')
     ))
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       input->>'deployment_id' is distinct from fence.candidate_deployment_id
       or pg_catalog.lower(input->>'deployment_commit') is distinct from
         fence.candidate_deployment_commit
     ))
     or (fence.lifecycle_mode = 'CUTOVER' and fence.status = 'INSTALLING' and (
       activation.state is distinct from 'GOOGLE_LEASE_ARMED'
       or resource.participant_identity_authority is distinct from 'SUPABASE'
       or resource.current_tournament_read_authority is distinct from 'SUPABASE'
       or gate.state is distinct from 'OPEN'
       or not gate.admission_protocol_enforced
       or activation.active_google_writer_provider_fence_id is not null
       or activation.active_google_writer_provider_verification_id is not null
       or gate.google_writer_provider_fence_id is not null
       or gate.google_writer_provider_verification_id is not null
     ))
     or (fence.lifecycle_mode = 'CUTOVER' and
       fence.status in ('INSTALLED', 'REMOVAL_AUTHORIZED') and (
       not (
         (activation.state = 'GOOGLE_LEASE_ARMED'
           and resource.participant_identity_authority = 'SUPABASE'
           and resource.current_tournament_read_authority = 'SUPABASE'
           and gate.state = 'OPEN' and gate.admission_state = 'OPEN'
           and gate.admission_protocol_enforced
           and gate.active_closure_id is null)
         or
         (activation.state in ('DORMANT', 'ROLLED_BACK')
           and resource.participant_identity_authority = 'PASSPORT'
           and resource.current_tournament_read_authority = 'GOOGLE'
           and gate.state = 'PAUSED' and gate.admission_state = 'CLOSED'
           and gate.admission_protocol_enforced
           and gate.active_closure_id is not null)
       )
       or activation.active_google_writer_provider_fence_id is distinct from
         fence.fence_id
       or gate.google_writer_provider_fence_id is distinct from fence.fence_id
     ))
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       fence.status not in ('INSTALLING', 'INSTALLED')
       or activation.state is distinct from 'DORMANT'
       or resource.participant_identity_authority is distinct from 'PASSPORT'
       or resource.current_tournament_read_authority is distinct from 'GOOGLE'
       or gate.state is distinct from 'PAUSED'
       or (fence.status = 'INSTALLING' and (
         gate.admission_state is distinct from 'OPEN'
         or gate.admission_protocol_enforced
         or gate.active_closure_id is not null
       ))
       or (fence.status = 'INSTALLED' and (
         gate.admission_state is distinct from 'CLOSED'
         or not gate.admission_protocol_enforced
         or gate.active_closure_id is null
         or activation.active_google_writer_provider_fence_id is distinct from
           fence.fence_id
         or gate.google_writer_provider_fence_id is distinct from fence.fence_id
       ))
     ))
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or ((activation.first_supabase_write_possible_at is not null
          or activation.first_supabase_write_observed_at is not null) and not (
       fence.lifecycle_mode = 'CUTOVER'
       and fence.status in ('INSTALLED', 'REMOVAL_AUTHORIZED')
       and activation.state = 'ROLLED_BACK'
       and gate.admission_state = 'CLOSED'
       and gate.active_closure_id is not null
     ))
     or activation.active_transition_epoch_id is not null
     or resource.scoring_authority is distinct from 'GOOGLE'
     or gate.authority is distinct from 'GOOGLE'
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_BEGIN_NOT_SAFE';
  end if;
  update production_control.google_writer_provider_fences
  set status = 'ABORTING',
      abort_origin_status = prior_status,
      abort_request_id = request_identifier,
      abort_begin_request_fingerprint =
        pg_catalog.lower(input->>'request_fingerprint'),
      abort_begin_payload_hash = payload_hash_value,
      abort_requested_at = pg_catalog.now(),
      abort_provider_quiescence_not_before = quiescence_not_before,
      restore_quiesce_evidence_id = restore_quiesce.evidence_id,
      restore_global_writer_stop_active_at =
        waf_epoch.critical_active_at,
      updated_at = pg_catalog.now()
  where fence_id = fence.fence_id
  returning * into fence;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result,
    details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_ABORT_RESERVED',
    'SCORING_AUTHORITY', '2026', fence.actor_id,
    fence.abort_begin_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'abort_request_id', fence.abort_request_id,
      'prior_status', prior_status,
      'new_status', 'ABORTING',
      'install_dispatch_id', dispatch.dispatch_id,
      'provider_quiescence_not_before',
        fence.abort_provider_quiescence_not_before,
      'restore_quiesce_evidence_id', fence.restore_quiesce_evidence_id,
      'critical_waf_epoch_id', fence.critical_waf_epoch_id,
      'restore_global_writer_stop_active_at',
        fence.restore_global_writer_stop_active_at,
      'admission_reservation_active', true
    )
  );
  return production_control.google_writer_provider_fence_response(fence, false);
end;
$$;

create or replace function public.begin_production_google_writer_provider_fence_abort_dispatch(
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
  fence production_control.google_writer_provider_fences%rowtype;
  dispatch
    production_control.google_writer_provider_fence_abort_dispatches%rowtype;
  latest
    production_control.google_writer_provider_fence_abort_dispatches%rowtype;
  restore_quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  payload_hash_value text := production_control.cutover_payload_hash(input);
  remaining_dispatch_budget_ms bigint;
  next_attempt integer := 1;
  dispatch_issued_at timestamptz := pg_catalog.clock_timestamp();
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'operation' is distinct from
       'BEGIN_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_DISPATCH'
     or coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'abort_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'dispatch_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or input->>'mutation_plan' is distinct from
       'DRIVE_ACL_LEGACY_READER_TO_WRITER_V1'
     or input->>'provider_mutation_class' is distinct from
       'DRIVE_LEGACY_PERMISSION_READER_TO_WRITER_V1'
     or input->>'source_role' is distinct from 'reader'
     or input->>'target_role' is distinct from 'writer'
     or pg_catalog.jsonb_typeof(input->'transition_intent') is distinct from
       'object'
     or (select pg_catalog.count(*)
         from pg_catalog.jsonb_object_keys(input->'transition_intent')) <> 32
     or input->'transition_intent'->>'schemaVersion' is distinct from
       'step12-production-google-drive-acl-transition-intent-v1'
     or input->'transition_intent'->>'workbookId' is distinct from
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or input->'transition_intent'->>'fenceId' is distinct from
       pg_catalog.lower(input->>'fence_id')
     or input->'transition_intent'->>'installRequestId' is distinct from
       pg_catalog.lower(input->>'install_request_id')
     or input->'transition_intent'->>'providerMutationClass' is distinct from
       input->>'provider_mutation_class'
     or input->'transition_intent'->>'sourceRole' is distinct from 'reader'
     or input->'transition_intent'->>'targetRole' is distinct from 'writer'
     or input->'transition_intent'->>'permissionManagementScope' is distinct from
       'https://www.googleapis.com/auth/drive.file'
     or input->'transition_intent'->'priorLegacyCanEdit' is distinct from
       'false'::jsonb
     or input->'transition_intent'->'priorLegacyCanShare' is distinct from
       'false'::jsonb
     or input->'transition_intent'->'expectedTargetLegacyCanEdit' is distinct from
       'true'::jsonb
     or input->'transition_intent'->'expectedTargetLegacyCanShare' is distinct from
       'true'::jsonb
     or input->'transition_intent'->>'transitionIntentFingerprint' is distinct from
       pg_catalog.lower(input->>'transition_intent_fingerprint')
     or production_control.google_drive_acl_transition_intent_fingerprint_v1(
       (input->'transition_intent') - 'transitionIntentFingerprint'
     ) is distinct from pg_catalog.lower(input->>'transition_intent_fingerprint')
     or coalesce(input->>'transition_intent_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'provider_preflight_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or input->>'provider_preflight_position' is distinct from 'SOURCE'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_DISPATCH_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into dispatch
  from production_control.google_writer_provider_fence_abort_dispatches value
  where value.dispatch_request_id = (input->>'dispatch_request_id')::uuid
  for update;
  if found then
    if dispatch.fence_id is distinct from (input->>'fence_id')::uuid
       or dispatch.abort_request_id is distinct from
         (input->>'abort_request_id')::uuid
       or dispatch.request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or dispatch.payload_hash is distinct from payload_hash_value
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_DISPATCH_IDEMPOTENCY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_DISPATCH_ISSUED',
      'fence_id', dispatch.fence_id,
      'install_request_id', pg_catalog.lower(input->>'install_request_id'),
      'dispatch_id', dispatch.dispatch_id,
      'dispatch_request_id', dispatch.dispatch_request_id,
      'abort_request_id', dispatch.abort_request_id,
      'attempt', dispatch.attempt,
      'mutation_plan', dispatch.mutation_plan,
      'provider_mutation_class', dispatch.provider_mutation_class,
      'source_role', dispatch.source_role,
      'target_role', dispatch.target_role,
      'transition_intent_fingerprint', dispatch.transition_intent_fingerprint,
      'provider_preflight_fingerprint', dispatch.provider_preflight_fingerprint,
      'provider_preflight_position', dispatch.provider_preflight_position,
      'status', dispatch.outcome_status,
      'issued_at', dispatch.issued_at,
      'expires_at', dispatch.expires_at,
      'remaining_dispatch_budget_ms', greatest(0,
        pg_catalog.floor(extract(epoch from (
          dispatch.expires_at - pg_catalog.clock_timestamp()
        )) * 1000)::bigint),
      'dispatch_usable', false,
      'replay_usable', false,
      'idempotent', true
    );
  end if;
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'fence_id')::uuid
    and value.install_request_id = (input->>'install_request_id')::uuid
  for update;
  select * into latest
  from production_control.google_writer_provider_fence_abort_dispatches value
  where value.fence_id = fence.fence_id
  order by value.attempt desc
  limit 1
  for update;
  if found then
    -- A delayed reader-to-writer PATCH could otherwise commit after a later
    -- forward fence and silently reopen the legacy writer.  There is no Drive
    -- terminality bound, so UNKNOWN/SOURCE never authorizes redispatch or
    -- reservation release.  Exact target recovery settles this same dispatch.
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_RECOVERY_REDISPATCH_FORBIDDEN';
  end if;
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
  select * into strict restore_quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = fence.restore_quiesce_evidence_id
  for update;
  if fence.status is distinct from 'ABORTING'
     or fence.abort_request_id is distinct from
       (input->>'abort_request_id')::uuid
     or fence.acl_reader_confirmed_at is null
     or pg_catalog.clock_timestamp() < fence.abort_provider_quiescence_not_before
     or fence.restore_global_writer_stop_active_at is null
     or pg_catalog.clock_timestamp() <
       fence.restore_global_writer_stop_active_at + interval '1810 seconds'
     or restore_quiesce.status is distinct from 'VERIFIED'
     or restore_quiesce.purpose is distinct from fence.lifecycle_mode
     or restore_quiesce.candidate_deployment_id is distinct from
       fence.candidate_deployment_id
     or restore_quiesce.candidate_deployment_commit is distinct from
       fence.candidate_deployment_commit
     or restore_quiesce.expires_at <= pg_catalog.clock_timestamp()
     or restore_quiesce.owner_freeze_expires_at <= pg_catalog.clock_timestamp()
     or not exists (
       select 1
       from production_control.vercel_routing_rule_audit_bindings audit
       where audit.quiesce_evidence_id = restore_quiesce.evidence_id
         and audit.routing_rule_global_invocation_quiescence_proved
         and audit.routing_rule_candidate_control_host_count = 2
         and audit.routing_rule_canonical_apex_safe_method_count = 3
         and audit.routing_rule_canonical_apex_safe_method_writer_route_count = 10
     )
     or fence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or fence.actor_id is distinct from input->>'actor_id'
     or fence.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or (fence.lifecycle_mode = 'CUTOVER' and (
       gate.admission_deployment_id is distinct from input->>'deployment_id'
       or activation.expected_deployment_commit is distinct from
         pg_catalog.lower(input->>'deployment_commit')
     ))
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       input->>'deployment_id' is distinct from fence.candidate_deployment_id
       or pg_catalog.lower(input->>'deployment_commit') is distinct from
         fence.candidate_deployment_commit
     ))
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or ((activation.first_supabase_write_possible_at is not null
          or activation.first_supabase_write_observed_at is not null) and not (
       fence.lifecycle_mode = 'CUTOVER'
       and fence.abort_origin_status in ('INSTALLED', 'REMOVAL_AUTHORIZED')
       and activation.state = 'ROLLED_BACK'
       and gate.admission_state = 'CLOSED'
       and gate.active_closure_id is not null
     ))
     or activation.active_transition_epoch_id is not null
     or resource.scoring_authority is distinct from 'GOOGLE'
     or gate.authority is distinct from 'GOOGLE'
     or (fence.lifecycle_mode = 'CUTOVER' and
       fence.abort_origin_status = 'INSTALLING' and (
         activation.state is distinct from 'GOOGLE_LEASE_ARMED'
         or resource.participant_identity_authority is distinct from 'SUPABASE'
         or resource.current_tournament_read_authority is distinct from 'SUPABASE'
         or gate.state is distinct from 'OPEN'
         or gate.admission_state is distinct from 'OPEN'
         or not gate.admission_protocol_enforced
         or gate.active_closure_id is not null
         or activation.active_google_writer_provider_fence_id is not null
         or gate.google_writer_provider_fence_id is not null
       ))
     or (fence.lifecycle_mode = 'CUTOVER' and
       fence.abort_origin_status in ('INSTALLED', 'REMOVAL_AUTHORIZED') and (
         not (
           (activation.state = 'GOOGLE_LEASE_ARMED'
             and resource.participant_identity_authority = 'SUPABASE'
             and resource.current_tournament_read_authority = 'SUPABASE'
             and gate.state = 'OPEN' and gate.admission_state = 'OPEN'
             and gate.admission_protocol_enforced
             and gate.active_closure_id is null)
           or
           (activation.state in ('DORMANT', 'ROLLED_BACK')
             and resource.participant_identity_authority = 'PASSPORT'
             and resource.current_tournament_read_authority = 'GOOGLE'
             and gate.state = 'PAUSED' and gate.admission_state = 'CLOSED'
             and gate.admission_protocol_enforced
             and gate.active_closure_id is not null)
         )
         or activation.active_google_writer_provider_fence_id is distinct from
           fence.fence_id
         or gate.google_writer_provider_fence_id is distinct from fence.fence_id
       ))
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       fence.abort_origin_status not in ('INSTALLING', 'INSTALLED')
       or activation.state is distinct from 'DORMANT'
       or resource.participant_identity_authority is distinct from 'PASSPORT'
       or resource.current_tournament_read_authority is distinct from 'GOOGLE'
       or gate.state is distinct from 'PAUSED'
       or (fence.abort_origin_status = 'INSTALLING' and (
         gate.admission_state is distinct from 'OPEN'
         or gate.admission_protocol_enforced
         or gate.active_closure_id is not null
         or activation.active_google_writer_provider_fence_id is not null
         or gate.google_writer_provider_fence_id is not null
       ))
       or (fence.abort_origin_status = 'INSTALLED' and (
         gate.admission_state is distinct from 'CLOSED'
         or not gate.admission_protocol_enforced
         or gate.active_closure_id is null
         or activation.active_google_writer_provider_fence_id is distinct from
           fence.fence_id
         or gate.google_writer_provider_fence_id is distinct from fence.fence_id
       ))
     ))
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_DISPATCH_NOT_SAFE';
  end if;
  insert into production_control.google_writer_provider_fence_abort_dispatches (
    dispatch_id, fence_id, abort_request_id, dispatch_request_id,
    restore_quiesce_evidence_id, attempt,
    mutation_plan, provider_mutation_class, source_role, target_role,
    transition_intent, transition_intent_fingerprint,
    provider_preflight_fingerprint, provider_preflight_position,
    request_fingerprint, payload_hash,
    activation_revision, authority_generation_id, admission_generation_id,
    admission_revision, actor_id, authenticated_actor_fingerprint,
    issued_at, expires_at
  ) values (
    extensions.gen_random_uuid(), fence.fence_id, fence.abort_request_id,
    (input->>'dispatch_request_id')::uuid, restore_quiesce.evidence_id,
    next_attempt, input->>'mutation_plan',
    input->>'provider_mutation_class', input->>'source_role',
    input->>'target_role', input->'transition_intent',
    pg_catalog.lower(input->>'transition_intent_fingerprint'),
    pg_catalog.lower(input->>'provider_preflight_fingerprint'),
    'SOURCE',
    pg_catalog.lower(input->>'request_fingerprint'), payload_hash_value,
    activation.activation_revision, activation.authority_generation_id,
    gate.admission_generation_id, gate.admission_revision,
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'authenticated_actor_fingerprint'),
    dispatch_issued_at, dispatch_issued_at + interval '15 seconds'
  ) returning * into dispatch;
  remaining_dispatch_budget_ms := greatest(0,
    pg_catalog.floor(extract(epoch from (
      dispatch.expires_at - pg_catalog.clock_timestamp()
    )) * 1000)::bigint);
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result,
    details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_DISPATCH_ISSUED',
    'SCORING_AUTHORITY', '2026', dispatch.actor_id,
    dispatch.request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', dispatch.fence_id,
      'dispatch_id', dispatch.dispatch_id,
      'dispatch_request_id', dispatch.dispatch_request_id,
      'abort_request_id', dispatch.abort_request_id,
      'attempt', dispatch.attempt,
      'mutation_plan', dispatch.mutation_plan,
      'provider_mutation_class', dispatch.provider_mutation_class,
      'transition_intent_fingerprint',
        dispatch.transition_intent_fingerprint,
      'restore_quiesce_evidence_id', dispatch.restore_quiesce_evidence_id,
      'issued_at', dispatch.issued_at,
      'expires_at', dispatch.expires_at,
      'admission_reservation_active', true
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_DISPATCH_ISSUED',
    'fence_id', dispatch.fence_id,
    'install_request_id', fence.install_request_id,
    'dispatch_id', dispatch.dispatch_id,
    'dispatch_request_id', dispatch.dispatch_request_id,
    'abort_request_id', dispatch.abort_request_id,
    'attempt', dispatch.attempt,
    'mutation_plan', dispatch.mutation_plan,
    'provider_mutation_class', dispatch.provider_mutation_class,
    'source_role', dispatch.source_role,
    'target_role', dispatch.target_role,
    'transition_intent_fingerprint', dispatch.transition_intent_fingerprint,
    'provider_preflight_fingerprint', dispatch.provider_preflight_fingerprint,
    'provider_preflight_position', dispatch.provider_preflight_position,
    'status', dispatch.outcome_status,
    'issued_at', dispatch.issued_at,
    'expires_at', dispatch.expires_at,
    'remaining_dispatch_budget_ms', remaining_dispatch_budget_ms,
    'dispatch_usable', remaining_dispatch_budget_ms > 0,
    'replay_usable', remaining_dispatch_budget_ms > 0,
    'idempotent', false
  );
end;
$$;

create or replace function public.abort_production_google_writer_provider_fence_install(
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
  fence production_control.google_writer_provider_fences%rowtype;
  installed_settlement
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
  latest_settlement
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
  abort_dispatch
    production_control.google_writer_provider_fence_abort_dispatches%rowtype;
  prior production_control.google_writer_provider_fence_install_aborts%rowtype;
  abort_row production_control.google_writer_provider_fence_install_aborts%rowtype;
  abort_request uuid;
  payload_hash text := production_control.cutover_payload_hash(input);
  provider_observed timestamptz;
  normalized_removed_ids jsonb;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'operation' is distinct from
       'ABORT_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL'
     or coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'abort_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'abort_dispatch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or input->'provider_rollback_verified' is distinct from 'true'::jsonb
     or pg_catalog.jsonb_typeof(input->'active_run_owned_protection_count')
       is distinct from 'number'
     or input->>'active_run_owned_protection_count' is distinct from '0'
     or pg_catalog.jsonb_typeof(input->'removed_protected_range_ids')
       is distinct from 'array'
     or pg_catalog.jsonb_array_length(input->'removed_protected_range_ids') > 17
     or coalesce(input->>'restored_provider_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'restored_acl_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'restored_canonical_value_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'restored_combined_value_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'restored_formula_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'restoration_evidence_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_EVIDENCE_REQUIRED';
  end if;
  abort_request := (input->>'abort_request_id')::uuid;
  provider_observed := (input->>'provider_observed_at')::timestamptz;
  select coalesce(
    pg_catalog.jsonb_agg(value::bigint order by value::bigint), '[]'::jsonb
  ) into normalized_removed_ids
  from pg_catalog.jsonb_array_elements_text(
    input->'removed_protected_range_ids'
  ) value;
  if normalized_removed_ids is distinct from input->'removed_protected_range_ids'
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements_text(normalized_removed_ids) value
       where value::bigint <= 0
     )
     or pg_catalog.jsonb_array_length(normalized_removed_ids) <> (
       select pg_catalog.count(distinct value::bigint)
       from pg_catalog.jsonb_array_elements_text(normalized_removed_ids) value
     )
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_RANGE_IDS_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into prior
  from production_control.google_writer_provider_fence_install_aborts value
  where value.abort_request_id = abort_request;
  if found then
    if prior.fence_id is distinct from (input->>'fence_id')::uuid
       or prior.request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or prior.payload_hash is distinct from payload_hash
       or prior.restoration_evidence_fingerprint is distinct from
         pg_catalog.lower(input->>'restoration_evidence_fingerprint')
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_IDEMPOTENCY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_ABORTED',
      'fence_id', prior.fence_id,
      'abort_id', prior.abort_id,
      'abort_request_id', prior.abort_request_id,
      'status', 'FAILED',
      'admission_reservation_active', false,
      'admission_reservation_state', 'RELEASED',
      'provider_observed_at', prior.provider_observed_at,
      'aborted_at', prior.aborted_at,
      'idempotent', true
    );
  end if;

  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'fence_id')::uuid
    and value.install_request_id = (input->>'install_request_id')::uuid
  for update;
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
  select * into installed_settlement
  from production_control.google_writer_provider_fence_settlement_observations value
  where value.fence_id = fence.fence_id
    and value.stage = 'ACL_READER_CONFIRMED';
  if found then
    select * into strict latest_settlement
    from production_control.google_writer_provider_fence_settlement_observations value
    where value.fence_id = fence.fence_id
    order by case value.stage
      when 'ACL_READER_CONFIRMED' then 1
      when 'SETTLEMENT_READBACK_1' then 2
      else 3 end desc
    limit 1;
  end if;
  select * into abort_dispatch
  from production_control.google_writer_provider_fence_abort_dispatches value
  where value.fence_id = fence.fence_id
    and value.abort_request_id = abort_request;

  if fence.status is distinct from 'ABORTING'
     or fence.abort_request_id is distinct from abort_request
     or fence.abort_begin_request_fingerprint is null
     or fence.abort_begin_payload_hash is null
     or fence.abort_requested_at is null
     or fence.abort_provider_quiescence_not_before is null
     or abort_dispatch.dispatch_id is distinct from
       (input->>'abort_dispatch_id')::uuid
     or provider_observed < abort_dispatch.issued_at
     or fence.quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or fence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or fence.actor_id is distinct from input->>'actor_id'
     or fence.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
     or pg_catalog.now() < fence.abort_provider_quiescence_not_before
     or provider_observed < fence.abort_provider_quiescence_not_before
     or provider_observed < fence.abort_requested_at
     or provider_observed < pg_catalog.now() - interval '5 seconds'
     or provider_observed > pg_catalog.now() + interval '30 seconds'
     or pg_catalog.lower(input->>'restored_provider_fingerprint') is distinct from
       fence.baseline_provider_fingerprint
     or pg_catalog.lower(input->>'restored_acl_fingerprint') is distinct from
       fence.baseline_acl_fingerprint
     or pg_catalog.lower(input->>'restored_canonical_value_fingerprint')
       is distinct from fence.baseline_canonical_value_fingerprint
     or pg_catalog.lower(input->>'restored_combined_value_fingerprint')
       is distinct from fence.baseline_combined_value_fingerprint
     or pg_catalog.lower(input->>'restored_formula_fingerprint')
       is distinct from fence.baseline_formula_fingerprint
     or pg_catalog.lower(input->>'restoration_evidence_fingerprint')
       is distinct from
         production_control.google_writer_provider_fence_abort_evidence_hash(
           fence.fence_id, input
         )
     or (
       installed_settlement.observation_id is null
       and normalized_removed_ids is distinct from '[]'::jsonb
       and pg_catalog.jsonb_array_length(normalized_removed_ids) <> 17
     )
     or (
       installed_settlement.observation_id is not null
       and (
         normalized_removed_ids is distinct from (
           select pg_catalog.jsonb_agg(
             (value->>'protectedRangeId')::bigint
             order by (value->>'protectedRangeId')::bigint
           )
           from pg_catalog.jsonb_array_elements(
             installed_settlement.protection_records
           ) value
         )
         or provider_observed <= latest_settlement.provider_observed_at
       )
     )
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or activation.state is distinct from 'GOOGLE_LEASE_ARMED'
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.active_transition_epoch_id is not null
     or activation.active_google_writer_provider_fence_id is not null
     or activation.active_google_writer_provider_verification_id is not null
     or resource.scoring_authority is distinct from 'GOOGLE'
     or resource.participant_identity_authority is distinct from 'SUPABASE'
     or resource.current_tournament_read_authority is distinct from 'SUPABASE'
     or gate.state is distinct from 'OPEN'
     or gate.authority is distinct from 'GOOGLE'
     or gate.admission_state is distinct from 'OPEN'
     or not gate.admission_protocol_enforced
     or gate.active_closure_id is not null
     or gate.external_fence_evidence_id is not null
     or gate.google_writer_provider_fence_id is not null
     or gate.google_writer_provider_verification_id is not null
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
     or exists (
       select 1
       from scoring_authority.scoring_ingress_leases value
       where value.tournament_id = '2026'
         and (
           value.status = 'ACTIVE'
           or value.resolution_state in (
             'LEGACY_UNCLASSIFIED', 'ADMITTED', 'WRITE_STARTED',
             'AMBIGUOUS', 'PARTIAL_WRITE'
           )
         )
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_NOT_SAFE';
  end if;

  insert into production_control.google_writer_provider_fence_install_aborts (
    abort_id, fence_id, abort_request_id, request_fingerprint, payload_hash,
    restoration_evidence_fingerprint, removed_protected_range_ids,
    active_run_owned_protection_count, restored_provider_fingerprint,
    restored_acl_fingerprint, restored_canonical_value_fingerprint,
    restored_combined_value_fingerprint, restored_formula_fingerprint,
    provider_observed_at, activation_revision, authority_generation_id,
    admission_generation_id, admission_revision, actor_id,
    authenticated_actor_fingerprint
  ) values (
    extensions.gen_random_uuid(), fence.fence_id, abort_request,
    pg_catalog.lower(input->>'request_fingerprint'), payload_hash,
    pg_catalog.lower(input->>'restoration_evidence_fingerprint'),
    normalized_removed_ids, 0,
    pg_catalog.lower(input->>'restored_provider_fingerprint'),
    pg_catalog.lower(input->>'restored_acl_fingerprint'),
    pg_catalog.lower(input->>'restored_canonical_value_fingerprint'),
    pg_catalog.lower(input->>'restored_combined_value_fingerprint'),
    pg_catalog.lower(input->>'restored_formula_fingerprint'),
    provider_observed, activation.activation_revision,
    activation.authority_generation_id, gate.admission_generation_id,
    gate.admission_revision, input->>'actor_id',
    pg_catalog.lower(input->>'authenticated_actor_fingerprint')
  ) returning * into abort_row;

  update production_control.google_writer_provider_fences
  set status = 'FAILED',
      failure_code = 'INSTALL_ABORTED_AFTER_VERIFIED_PROVIDER_ROLLBACK',
      updated_at = pg_catalog.now()
  where fence_id = fence.fence_id;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result,
    details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_ABORTED',
    'SCORING_AUTHORITY', '2026', abort_row.actor_id,
    abort_row.request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'abort_id', abort_row.abort_id,
      'restoration_evidence_fingerprint',
        abort_row.restoration_evidence_fingerprint,
      'active_run_owned_protection_count', 0,
      'removed_protected_range_ids', abort_row.removed_protected_range_ids,
      'provider_observed_at', abort_row.provider_observed_at,
      'authority', 'GOOGLE',
      'admission_state', gate.admission_state,
      'automatic_reopen_performed', false
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_ABORTED',
    'fence_id', fence.fence_id,
    'abort_id', abort_row.abort_id,
    'abort_request_id', abort_row.abort_request_id,
    'status', 'FAILED',
    'admission_reservation_active', false,
    'admission_reservation_state', 'RELEASED',
    'authority', 'GOOGLE',
    'admission_state', gate.admission_state,
    'provider_observed_at', abort_row.provider_observed_at,
    'aborted_at', abort_row.aborted_at,
    'idempotent', false
  );
  return response_value;
end;
$$;

-- ACL-v2 abort/final removal override.  The provider reader-to-writer target
-- must already be durably confirmed. The same transaction releases
-- the provider reservation and reopens a CLOSED Google admission boundary;
-- WAF and owner-freeze evidence are re-read under the admission lock and stay
-- active through commit.
create or replace function public.abort_production_google_writer_provider_fence_install(
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
  fence production_control.google_writer_provider_fences%rowtype;
  install_dispatch
    production_control.google_writer_provider_fence_install_dispatches%rowtype;
  restore_dispatch
    production_control.google_writer_provider_fence_abort_dispatches%rowtype;
  restore_quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  prior production_control.google_writer_provider_fence_install_aborts%rowtype;
  abort_row production_control.google_writer_provider_fence_install_aborts%rowtype;
  abort_request uuid;
  payload_hash_value text := production_control.cutover_payload_hash(input);
  provider_observed timestamptz;
  next_generation uuid := extensions.gen_random_uuid();
  target_status text;
  response_code text;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'operation' is distinct from
       'ABORT_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL'
     or coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'abort_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'restore_quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or input->'provider_rollback_verified' is distinct from 'true'::jsonb
     or input->>'restored_legacy_role' is distinct from 'writer'
     or input->'restored_legacy_can_edit' is distinct from 'true'::jsonb
     or input->'restored_legacy_can_share' is distinct from 'true'::jsonb
     or input->'active_run_owned_protection_count' is distinct from '0'::jsonb
     or input->'removed_protected_range_ids' is distinct from '[]'::jsonb
     or coalesce(input->>'restored_provider_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'restored_acl_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'restored_canonical_value_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'restored_combined_value_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'restored_formula_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'restoration_evidence_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_RESTORE_EVIDENCE_REQUIRED';
  end if;
  abort_request := (input->>'abort_request_id')::uuid;
  provider_observed := (input->>'provider_observed_at')::timestamptz;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into prior
  from production_control.google_writer_provider_fence_install_aborts value
  where value.abort_request_id = abort_request;
  if found then
    if prior.fence_id is distinct from (input->>'fence_id')::uuid
       or prior.request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or prior.payload_hash is distinct from payload_hash_value
       or prior.restoration_evidence_fingerprint is distinct from
         pg_catalog.lower(input->>'restoration_evidence_fingerprint')
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_RESTORE_IDEMPOTENCY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', case when prior.restore_dispatch_id is null
        then 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_ABORTED'
        else 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ACL_RESTORED_AND_REOPENED'
      end,
      'fence_id', prior.fence_id,
      'abort_id', prior.abort_id,
      'abort_request_id', prior.abort_request_id,
      'restore_dispatch_id', prior.restore_dispatch_id,
      'status', case when exists (
        select 1 from production_control.google_writer_provider_fences value
        where value.fence_id = prior.fence_id
          and value.status in (
            'ACL_RESTORED_WAF_ACTIVE', 'REHEARSAL_RESTORED', 'FAILED'
          )
      ) then (
        select value.status
        from production_control.google_writer_provider_fences value
        where value.fence_id = prior.fence_id
      ) else 'ABORTING' end,
      'admission_reservation_active', false,
      'admission_reservation_state', 'RELEASED',
      'critical_window_active', exists (
        select 1
        from production_control.google_writer_provider_fences fence_value
        join production_control.vercel_writer_critical_waf_epochs epoch
          on epoch.epoch_id = fence_value.critical_waf_epoch_id
        where fence_value.fence_id = prior.fence_id
          and epoch.status in ('FENCE_BOUND', 'RESTORE_PENDING')
      ),
      'provider_observed_at', prior.provider_observed_at,
      'aborted_at', prior.aborted_at,
      'idempotent', true
    );
  end if;

  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'fence_id')::uuid
    and value.install_request_id = (input->>'install_request_id')::uuid
  for update;
  select * into strict install_dispatch
  from production_control.google_writer_provider_fence_install_dispatches value
  where value.fence_id = fence.fence_id
    and value.outcome_status = 'TARGET_CONFIRMED'
  order by value.attempt desc
  limit 1
  for update;
  select * into strict restore_dispatch
  from production_control.google_writer_provider_fence_abort_dispatches value
  where value.fence_id = fence.fence_id
    and value.outcome_status = 'TARGET_CONFIRMED'
  order by value.attempt desc
  limit 1
  for update;
  select * into strict restore_quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = fence.restore_quiesce_evidence_id
  for update;
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
  if gate.active_closure_id is not null then
    select * into strict closure
    from production_control.scoring_admission_closures value
    where value.closure_id = gate.active_closure_id
    for update;
  end if;
  if fence.status is distinct from 'ABORTING'
     or fence.abort_request_id is distinct from abort_request
     or fence.restore_quiesce_evidence_id is distinct from
       (input->>'restore_quiesce_evidence_id')::uuid
     or fence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or fence.actor_id is distinct from input->>'actor_id'
     or fence.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
     or restore_quiesce.status is distinct from 'VERIFIED'
     or restore_quiesce.purpose is distinct from fence.lifecycle_mode
     or restore_quiesce.expires_at <= pg_catalog.clock_timestamp()
     or restore_quiesce.owner_freeze_expires_at <= pg_catalog.clock_timestamp()
     or restore_quiesce.candidate_deployment_id is distinct from
       fence.candidate_deployment_id
     or restore_quiesce.candidate_deployment_commit is distinct from
       fence.candidate_deployment_commit
     or not exists (
       select 1
       from production_control.vercel_routing_rule_audit_bindings audit
       where audit.quiesce_evidence_id = restore_quiesce.evidence_id
         and audit.routing_rule_global_invocation_quiescence_proved
         and audit.routing_rule_candidate_control_host_count = 2
         and audit.routing_rule_canonical_apex_safe_method_count = 3
         and audit.routing_rule_canonical_apex_safe_method_writer_route_count = 10
     )
     or provider_observed < pg_catalog.clock_timestamp() - interval '5 seconds'
     or provider_observed > pg_catalog.clock_timestamp() + interval '30 seconds'
     or pg_catalog.lower(input->>'restored_provider_fingerprint') is distinct from
       fence.baseline_provider_fingerprint
     or pg_catalog.lower(input->>'restored_acl_fingerprint') is distinct from
       fence.baseline_acl_fingerprint
     or pg_catalog.lower(input->>'restored_canonical_value_fingerprint')
       is distinct from fence.baseline_canonical_value_fingerprint
     or pg_catalog.lower(input->>'restored_combined_value_fingerprint')
       is distinct from fence.baseline_combined_value_fingerprint
     or pg_catalog.lower(input->>'restored_formula_fingerprint')
       is distinct from fence.baseline_formula_fingerprint
     or pg_catalog.lower(input->>'restoration_evidence_fingerprint')
       is distinct from
         production_control.google_writer_provider_fence_abort_evidence_hash(
           fence.fence_id, input
         )
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or ((activation.first_supabase_write_possible_at is not null
          or activation.first_supabase_write_observed_at is not null) and not (
       fence.lifecycle_mode = 'CUTOVER'
       and fence.abort_origin_status in ('INSTALLED', 'REMOVAL_AUTHORIZED')
       and activation.state = 'ROLLED_BACK'
       and gate.admission_state = 'CLOSED'
       and closure.closure_id is not null
       and closure.status = 'CLOSED'
       and closure.authority = 'GOOGLE'
       and closure.reconciliation_fingerprint ~ '^[0-9a-f]{64}$'
     ))
     or activation.active_transition_epoch_id is not null
     or resource.scoring_authority is distinct from 'GOOGLE'
     or gate.authority is distinct from 'GOOGLE'
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
     or exists (
       select 1 from scoring_authority.authority_epochs value
       where value.tournament_id = '2026' and value.status = 'PREPARED'
     )
     or (fence.lifecycle_mode = 'CUTOVER' and
       fence.abort_origin_status = 'INSTALLING' and (
         activation.state is distinct from 'GOOGLE_LEASE_ARMED'
         or resource.participant_identity_authority is distinct from 'SUPABASE'
         or resource.current_tournament_read_authority is distinct from 'SUPABASE'
         or gate.state is distinct from 'OPEN'
         or gate.admission_state is distinct from 'OPEN'
         or not gate.admission_protocol_enforced
         or gate.active_closure_id is not null
         or activation.active_google_writer_provider_fence_id is not null
         or gate.google_writer_provider_fence_id is not null
       ))
     or (fence.lifecycle_mode = 'CUTOVER' and
       fence.abort_origin_status in ('INSTALLED', 'REMOVAL_AUTHORIZED') and (
         not (
           (activation.state = 'GOOGLE_LEASE_ARMED'
             and resource.participant_identity_authority = 'SUPABASE'
             and resource.current_tournament_read_authority = 'SUPABASE'
             and gate.state = 'OPEN' and gate.admission_state = 'OPEN'
             and gate.admission_protocol_enforced
             and gate.active_closure_id is null)
           or
           (activation.state in ('DORMANT', 'ROLLED_BACK')
             and resource.participant_identity_authority = 'PASSPORT'
             and resource.current_tournament_read_authority = 'GOOGLE'
             and gate.state = 'PAUSED' and gate.admission_state = 'CLOSED'
             and gate.admission_protocol_enforced
             and gate.active_closure_id is not null)
         )
         or activation.active_google_writer_provider_fence_id is distinct from
           fence.fence_id
         or gate.google_writer_provider_fence_id is distinct from fence.fence_id
       ))
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       fence.abort_origin_status not in ('INSTALLING', 'INSTALLED')
       or activation.state is distinct from 'DORMANT'
       or resource.participant_identity_authority is distinct from 'PASSPORT'
       or resource.current_tournament_read_authority is distinct from 'GOOGLE'
       or gate.state is distinct from 'PAUSED'
       or (fence.abort_origin_status = 'INSTALLING' and (
         gate.admission_state is distinct from 'OPEN'
         or gate.admission_protocol_enforced
         or gate.active_closure_id is not null
         or activation.active_google_writer_provider_fence_id is not null
         or gate.google_writer_provider_fence_id is not null
       ))
       or (fence.abort_origin_status = 'INSTALLED' and (
         gate.admission_state is distinct from 'CLOSED'
         or not gate.admission_protocol_enforced
         or gate.active_closure_id is null
         or activation.active_google_writer_provider_fence_id is distinct from
           fence.fence_id
         or gate.google_writer_provider_fence_id is distinct from fence.fence_id
       ))
     ))
     or restore_dispatch.outcome_status is distinct from 'TARGET_CONFIRMED'
       or restore_dispatch.target_role is distinct from 'writer'
       or restore_dispatch.transition_proof_fingerprint is distinct from
         fence.acl_writer_restore_transition_fingerprint
       or restore_dispatch.transition_proof is distinct from
         input->'restore_transition_proof'
       or restore_dispatch.transition_proof_fingerprint is distinct from
         pg_catalog.lower(input->>'restore_transition_proof_fingerprint')
       or restore_dispatch.transition_proof->'currentLegacyCanEdit'
         is distinct from 'true'::jsonb
       or restore_dispatch.transition_proof->'currentLegacyCanShare'
         is distinct from 'true'::jsonb
       or restore_dispatch.provider_observed_at > provider_observed
       or pg_catalog.clock_timestamp() <
         fence.restore_global_writer_stop_active_at + interval '1810 seconds'
     or install_dispatch.outcome_status is distinct from 'TARGET_CONFIRMED'
     or (gate.admission_state = 'CLOSED' and (
       closure.closure_id is null or closure.status is distinct from 'CLOSED'
       or closure.authority is distinct from 'GOOGLE'
     ))
     or gate.admission_state not in ('OPEN', 'CLOSED')
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_RESTORE_NOT_SAFE';
  end if;

  if gate.admission_state = 'CLOSED' then
    update production_control.scoring_admission_closures
    set status = 'REOPENED', reopened_at = pg_catalog.clock_timestamp()
    where closure_id = closure.closure_id;
    update scoring_authority.ingress_gates
    set state = case when fence.lifecycle_mode = 'REHEARSAL'
          then 'PAUSED' else 'OPEN' end,
        admission_state = 'OPEN',
        admission_protocol_enforced = case
          when activation.state in ('DORMANT', 'ROLLED_BACK') then false
          else admission_protocol_enforced end,
        admission_enforced_at = case when fence.lifecycle_mode = 'REHEARSAL'
          then null else admission_enforced_at end,
        admission_deployment_id = case when fence.lifecycle_mode = 'REHEARSAL'
          then null else admission_deployment_id end,
        legacy_lease_set_fingerprint = case
          when fence.lifecycle_mode = 'REHEARSAL' then null
          else legacy_lease_set_fingerprint end,
        admission_revision = admission_revision + 1,
        admission_generation_id = next_generation,
        admission_opened_at = case when fence.lifecycle_mode = 'REHEARSAL'
          then null else pg_catalog.clock_timestamp() end,
        active_closure_id = null, external_fence_evidence_id = null,
        google_writer_provider_fence_id = null,
        google_writer_provider_verification_id = null,
        unresolved_client_queues = 0,
        updated_by = pg_catalog.left(input->>'actor_id', 160),
        updated_at = pg_catalog.clock_timestamp()
    where tournament_id = '2026'
    returning * into gate;
    update production_control.cutover_activation_state
    set activation_revision = activation_revision + 1,
        active_google_writer_provider_fence_id = null,
        active_google_writer_provider_verification_id = null,
        active_vercel_quiesce_evidence_id = null,
        updated_by = pg_catalog.left(input->>'actor_id', 160),
        updated_at = pg_catalog.clock_timestamp()
    where scope_key = 'BAGGER_INV_PRODUCTION'
    returning * into activation;
  elsif (gate.google_writer_provider_fence_id is not null and
         gate.google_writer_provider_fence_id is distinct from fence.fence_id)
     or (activation.active_google_writer_provider_fence_id is not null and
         activation.active_google_writer_provider_fence_id is distinct from
           fence.fence_id) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_RESTORE_OPEN_POINTER_MISMATCH';
  else
    update scoring_authority.ingress_gates
    set google_writer_provider_fence_id = null,
        google_writer_provider_verification_id = null,
        updated_by = pg_catalog.left(input->>'actor_id', 160),
        updated_at = pg_catalog.clock_timestamp()
    where tournament_id = '2026'
    returning * into gate;
    update production_control.cutover_activation_state
    set active_google_writer_provider_fence_id = null,
        active_google_writer_provider_verification_id = null,
        active_vercel_quiesce_evidence_id = null,
        activation_revision = activation_revision + 1,
        updated_by = pg_catalog.left(input->>'actor_id', 160),
        updated_at = pg_catalog.clock_timestamp()
    where scope_key = 'BAGGER_INV_PRODUCTION'
    returning * into activation;
  end if;

  target_status := 'ACL_RESTORED_WAF_ACTIVE';
  response_code :=
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ACL_RESTORED_WAF_ACTIVE';
  insert into production_control.google_writer_provider_fence_install_aborts (
    abort_id, fence_id, abort_request_id, request_fingerprint, payload_hash,
    restoration_evidence_fingerprint, removed_protected_range_ids,
    active_run_owned_protection_count, restored_provider_fingerprint,
    restored_acl_fingerprint, restored_canonical_value_fingerprint,
    restored_combined_value_fingerprint, restored_formula_fingerprint,
    restore_dispatch_id, restore_quiesce_evidence_id,
    restored_legacy_role, restored_legacy_can_edit, restored_legacy_can_share,
    restore_transition_proof, restore_transition_proof_fingerprint,
    provider_observed_at, activation_revision, authority_generation_id,
    admission_generation_id, admission_revision, actor_id,
    authenticated_actor_fingerprint
  ) values (
    extensions.gen_random_uuid(), fence.fence_id, abort_request,
    pg_catalog.lower(input->>'request_fingerprint'), payload_hash_value,
    pg_catalog.lower(input->>'restoration_evidence_fingerprint'), '[]'::jsonb,
    0, pg_catalog.lower(input->>'restored_provider_fingerprint'),
    pg_catalog.lower(input->>'restored_acl_fingerprint'),
    pg_catalog.lower(input->>'restored_canonical_value_fingerprint'),
    pg_catalog.lower(input->>'restored_combined_value_fingerprint'),
    pg_catalog.lower(input->>'restored_formula_fingerprint'),
    restore_dispatch.dispatch_id, restore_quiesce.evidence_id,
    'writer', true, true, restore_dispatch.transition_proof,
    restore_dispatch.transition_proof_fingerprint, provider_observed,
    activation.activation_revision, activation.authority_generation_id,
    gate.admission_generation_id, gate.admission_revision,
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'authenticated_actor_fingerprint')
  ) returning * into abort_row;

  update production_control.google_writer_provider_fences
  set status = target_status,
      failure_code = null,
      acl_restored_waf_active_at = pg_catalog.clock_timestamp(),
      rehearsal_restored_at = null,
      updated_at = pg_catalog.clock_timestamp()
  where fence_id = fence.fence_id;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result,
    details
  ) values (
    response_code, 'SCORING_AUTHORITY', '2026', abort_row.actor_id,
    abort_row.request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'abort_id', abort_row.abort_id,
      'restore_dispatch_id', abort_row.restore_dispatch_id,
      'restore_transition_proof_fingerprint',
        abort_row.restore_transition_proof_fingerprint,
      'restore_quiesce_evidence_id', abort_row.restore_quiesce_evidence_id,
      'restored_legacy_role', abort_row.restored_legacy_role,
      'restored_legacy_can_edit', abort_row.restored_legacy_can_edit,
      'restored_legacy_can_share', abort_row.restored_legacy_can_share,
      'admission_state', gate.admission_state,
      'admission_reservation_active', false,
      'critical_window_active', true,
      'baseline_restored', false
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', response_code,
    'fence_id', fence.fence_id,
    'abort_id', abort_row.abort_id,
    'abort_request_id', abort_row.abort_request_id,
    'restore_dispatch_id', abort_row.restore_dispatch_id,
    'status', target_status,
    'authority', activation.current_authority,
    'admission_state', gate.admission_state,
    'execution_gate', gate.state,
    'admission_reservation_active', false,
    'admission_reservation_state', 'RELEASED',
    'critical_window_active', true,
    'baseline_restored', false,
    'critical_waf_epoch_id', fence.critical_waf_epoch_id,
    'provider_observed_at', abort_row.provider_observed_at,
    'aborted_at', abort_row.aborted_at,
    'idempotent', false
  );
end;
$$;

-- ACL restoration and DB reopen happen while the temporary five-group rule is
-- still active. Only an exact signed provider readback of the captured
-- baseline may advance the fence from that safe intermediate state.
create or replace function public.finalize_production_google_writer_fence_waf_restore(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  fence production_control.google_writer_provider_fences%rowtype;
  epoch production_control.vercel_writer_critical_waf_epochs%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  observation
    production_control.vercel_writer_critical_waf_observations%rowtype;
  request_fingerprint_value text;
  target_status text;
  response_code text;
  prior_fence_status text;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if input->>'operation' is distinct from
       'FINALIZE_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_WAF_BASELINE_RESTORE'
     or coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'critical_waf_epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'baseline_restored_observation_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_WAF_BASELINE_FINALIZE_INPUT_INVALID';
  end if;
  request_fingerprint_value := pg_catalog.lower(input->>'request_fingerprint');
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'fence_id')::uuid
  for update;
  select * into strict epoch
  from production_control.vercel_writer_critical_waf_epochs value
  where value.epoch_id = (input->>'critical_waf_epoch_id')::uuid
  for update;
  select * into strict observation
  from production_control.vercel_writer_critical_waf_observations value
  where value.observation_id =
    (input->>'baseline_restored_observation_id')::uuid
    and value.epoch_id = epoch.epoch_id;
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
  prior_fence_status := fence.status;

  if fence.baseline_waf_restored_observation_id = observation.observation_id
     and epoch.status = 'BASELINE_RESTORED'
     and fence.status in ('INSTALLED', 'REHEARSAL_RESTORED', 'FAILED')
  then
    return production_control.vercel_writer_critical_waf_epoch_response(
      epoch, true
    ) || production_control.google_writer_provider_fence_response(
      fence, true
    );
  end if;
  if fence.critical_waf_epoch_id is distinct from epoch.epoch_id
     or fence.actor_id is distinct from input->>'actor_id'
     or fence.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
     or epoch.status is distinct from 'BASELINE_RESTORED'
     or epoch.bound_fence_id is distinct from fence.fence_id
     or epoch.baseline_restored_observation_id is distinct from
       observation.observation_id
     or observation.evidence_stage is distinct from 'BASELINE_RESTORED'
     or observation.semantic_configuration_fingerprint is distinct from
       epoch.baseline_semantic_configuration_fingerprint
     or observation.configuration_identity_fingerprint is null
     or observation.ordered_rules_fingerprint is distinct from
       epoch.baseline_ordered_rules_fingerprint
     or observation.custom_rule_count is distinct from
       epoch.baseline_custom_rule_count
     or observation.pending_draft_change_count <> 0
     or observation.provider_assigned_rule_id is not null
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       fence.status is distinct from 'ACL_RESTORED_WAF_ACTIVE'
       or activation.state is distinct from 'DORMANT'
       or activation.current_authority is distinct from 'GOOGLE'
       or activation.scoring_ingress_enabled
       or resource.scoring_authority is distinct from 'GOOGLE'
       or gate.state is distinct from 'PAUSED'
       or gate.authority is distinct from 'GOOGLE'
       or gate.admission_state is distinct from 'OPEN'
       or gate.admission_protocol_enforced
     ))
     or (fence.lifecycle_mode = 'CUTOVER' and not (
       (fence.status = 'ACL_RESTORED_WAF_ACTIVE'
         and activation.current_authority = 'GOOGLE'
         and not activation.scoring_ingress_enabled
         and resource.scoring_authority = 'GOOGLE'
         and gate.authority = 'GOOGLE'
         and gate.admission_state = 'OPEN')
       or (fence.status = 'INSTALLED'
         and activation.state = 'SCORING_COMMITTED'
         and activation.current_authority = 'SUPABASE'
         and activation.scoring_ingress_enabled
         and resource.scoring_authority = 'SUPABASE'
         and gate.state = 'OPEN'
         and gate.authority = 'SUPABASE'
         and gate.admission_state = 'CLOSED'
         and gate.admission_protocol_enforced)
     ))
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_WAF_BASELINE_NOT_RESTORED';
  end if;
  target_status := case when fence.lifecycle_mode = 'REHEARSAL'
    then 'REHEARSAL_RESTORED'
    when prior_fence_status = 'INSTALLED' then 'INSTALLED'
    else 'FAILED' end;
  response_code := case when fence.lifecycle_mode = 'REHEARSAL'
    then 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REHEARSAL_RESTORED'
    when prior_fence_status = 'INSTALLED'
      then 'PRODUCTION_GOOGLE_WRITER_PROVIDER_CRITICAL_WAF_BASELINE_RESTORED'
    else 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_ABORTED' end;
  update production_control.google_writer_provider_fences
  set status = target_status,
      baseline_waf_restored_observation_id = observation.observation_id,
      failure_code = case when target_status = 'FAILED'
        then 'INSTALL_ABORTED_AFTER_VERIFIED_DRIVE_ACL_AND_WAF_RESTORE'
        else null end,
      rehearsal_restored_at = case when target_status = 'REHEARSAL_RESTORED'
        then pg_catalog.clock_timestamp() else rehearsal_restored_at end,
      updated_at = pg_catalog.clock_timestamp()
  where fence_id = fence.fence_id
    and status = prior_fence_status
  returning * into fence;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_WAF_BASELINE_FINALIZE_RACE';
  end if;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result,
    details
  ) values (
    response_code, 'SCORING_AUTHORITY', '2026', fence.actor_id,
    request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'critical_waf_epoch_id', epoch.epoch_id,
      'baseline_restored_observation_id', observation.observation_id,
      'baseline_semantic_configuration_fingerprint',
        epoch.baseline_semantic_configuration_fingerprint,
      'baseline_restored_at', epoch.baseline_restored_at,
      'critical_window_active', false,
      'baseline_restored', true
    )
  );
  return production_control.vercel_writer_critical_waf_epoch_response(
    epoch, false
  ) || production_control.google_writer_provider_fence_response(
    fence, false
  );
end;
$$;

-- ACL-v2 is the only current provider-fence verification contract. Historical
-- PROTECTED_RANGE_V1 rows remain readable through the tagged relation, but no
-- current finish/assert path can create or accept one.
create or replace function production_control.insert_google_writer_provider_fence_verification(
  target_fence_id uuid,
  input jsonb
)
returns production_control.google_writer_provider_fence_verifications
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  fence production_control.google_writer_provider_fences%rowtype;
  quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  install_dispatch
    production_control.google_writer_provider_fence_install_dispatches%rowtype;
  readback_2
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
  verification
    production_control.google_writer_provider_fence_verifications%rowtype;
  captured timestamptz := pg_catalog.clock_timestamp();
  verification_expiry timestamptz;
  empty_protections_fingerprint text :=
    production_control.structured_evidence_fingerprint('[]'::jsonb);
begin
  if coalesce(input->>'install_dispatch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'settlement_readback_2_observation_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_VERIFICATION_INPUT_INVALID';
  end if;

  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = target_fence_id
  for update;
  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = fence.quiesce_evidence_id
  for update;
  select * into strict install_dispatch
  from production_control.google_writer_provider_fence_install_dispatches value
  where value.dispatch_id = (input->>'install_dispatch_id')::uuid
    and value.fence_id = fence.fence_id
  for update;
  select * into strict readback_2
  from production_control.google_writer_provider_fence_settlement_observations value
  where value.observation_id =
      (input->>'settlement_readback_2_observation_id')::uuid
    and value.fence_id = fence.fence_id
    and value.stage = 'SETTLEMENT_READBACK_2'
  for update;

  verification_expiry := least(
    captured + interval '2100 seconds',
    quiesce.expires_at,
    quiesce.owner_freeze_expires_at
  );
  if fence.status is distinct from 'INSTALLING'
     or fence.actor_id is distinct from input->>'actor_id'
     or fence.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
     or quiesce.status is distinct from 'VERIFIED'
     or quiesce.purpose is distinct from fence.lifecycle_mode
     or quiesce.candidate_deployment_id is distinct from
       fence.candidate_deployment_id
     or quiesce.candidate_deployment_commit is distinct from
       fence.candidate_deployment_commit
     or verification_expiry <= captured
     or not exists (
       select 1
       from production_control.vercel_routing_rule_audit_bindings audit
       where audit.quiesce_evidence_id = quiesce.evidence_id
         and audit.routing_rule_global_invocation_quiescence_proved
         and audit.routing_rule_candidate_control_host_count = 2
         and audit.routing_rule_canonical_apex_safe_method_count = 3
         and audit.routing_rule_canonical_apex_safe_method_writer_route_count = 10
     )
     or install_dispatch.outcome_status is distinct from 'TARGET_CONFIRMED'
     or install_dispatch.mutation_plan is distinct from
       'DRIVE_ACL_LEGACY_WRITER_TO_READER_V1'
     or install_dispatch.provider_mutation_class is distinct from
       'DRIVE_LEGACY_PERMISSION_WRITER_TO_READER_V1'
     or install_dispatch.source_role is distinct from 'writer'
     or install_dispatch.target_role is distinct from 'reader'
     or install_dispatch.transition_proof is null
     or install_dispatch.transition_proof_fingerprint is null
     or install_dispatch.transition_intent_fingerprint is distinct from
       readback_2.acl_transition_intent_fingerprint
     or install_dispatch.transition_proof_fingerprint is distinct from
       readback_2.acl_transition_proof_fingerprint
     or install_dispatch.transition_proof is distinct from
       readback_2.acl_transition_proof
     or install_dispatch.transition_proof->>'currentRole' is distinct from
       'reader'
     or install_dispatch.transition_proof->'currentLegacyCanEdit'
       is distinct from 'false'::jsonb
     or install_dispatch.transition_proof->'currentLegacyCanShare'
       is distinct from 'false'::jsonb
     or readback_2.legacy_role is distinct from 'reader'
     or readback_2.legacy_can_edit
     or readback_2.legacy_can_share
     or readback_2.protection_records is distinct from '[]'::jsonb
     or readback_2.protection_set_fingerprint is distinct from
       empty_protections_fingerprint
     or readback_2.canonical_value_fingerprint is distinct from
       fence.baseline_canonical_value_fingerprint
     or readback_2.combined_value_fingerprint is distinct from
       fence.baseline_combined_value_fingerprint
     or readback_2.formula_fingerprint is distinct from
       fence.baseline_formula_fingerprint
     or fence.global_writer_stop_active_at is null
     or readback_2.recorded_at < fence.global_writer_stop_active_at
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_VERIFICATION_NOT_CURRENT';
  end if;

  insert into production_control.google_writer_provider_fence_verifications (
    verification_id, fence_id, quiesce_evidence_id, request_fingerprint,
    payload_hash, protection_records, protected_sheet_ids,
    protected_range_ids, protection_count, protection_set_fingerprint,
    provider_fingerprint, acl_fingerprint, canonical_value_fingerprint,
    combined_value_fingerprint, formula_fingerprint,
    structural_canary_fingerprint, permission_inventory_fingerprint,
    legacy_deployments_fenced, legacy_google_credentials_fenced,
    non_owner_manual_google_scoring_fenced,
    owner_override_operationally_frozen, recovery_only,
    captured_at, expires_at, actor_id, acl_contract_version,
    install_dispatch_id, acl_transition_intent_fingerprint,
    acl_transition_proof, acl_transition_proof_fingerprint,
    legacy_role, legacy_can_edit, legacy_can_share,
    legacy_edit_capability_fingerprint,
    settlement_readback_2_observation_id, global_writer_stop_active_at
  ) values (
    extensions.gen_random_uuid(), fence.fence_id, quiesce.evidence_id,
    pg_catalog.lower(input->>'request_fingerprint'),
    production_control.cutover_payload_hash(input),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 0,
    empty_protections_fingerprint,
    readback_2.provider_fingerprint, readback_2.acl_fingerprint,
    readback_2.canonical_value_fingerprint,
    readback_2.combined_value_fingerprint, readback_2.formula_fingerprint,
    readback_2.structural_canary_fingerprint,
    readback_2.permission_inventory_fingerprint,
    true, true, true, true, false, captured, verification_expiry,
    pg_catalog.left(input->>'actor_id', 160), 'DRIVE_ACL_V2',
    install_dispatch.dispatch_id,
    install_dispatch.transition_intent_fingerprint,
    install_dispatch.transition_proof,
    install_dispatch.transition_proof_fingerprint,
    'reader', false, false, readback_2.legacy_edit_capability_fingerprint,
    readback_2.observation_id, fence.global_writer_stop_active_at
  ) returning * into verification;
  return verification;
end;
$$;

create or replace function production_control.assert_current_google_writer_provider_fence(
  target_fence_id uuid,
  target_verification_id uuid,
  target_candidate_commit text,
  require_fresh_quiesce boolean default true
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  fence production_control.google_writer_provider_fences%rowtype;
  verification
    production_control.google_writer_provider_fence_verifications%rowtype;
  quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  install_dispatch
    production_control.google_writer_provider_fence_install_dispatches%rowtype;
  readback_2
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
begin
  select * into fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = target_fence_id;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_FENCE_REQUIRED';
  end if;
  select * into verification
  from production_control.google_writer_provider_fence_verifications value
  where value.verification_id = target_verification_id
    and value.fence_id = fence.fence_id;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_VERIFICATION_REQUIRED';
  end if;
  select * into quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = verification.quiesce_evidence_id;
  select * into install_dispatch
  from production_control.google_writer_provider_fence_install_dispatches value
  where value.dispatch_id = verification.install_dispatch_id
    and value.fence_id = fence.fence_id;
  select * into readback_2
  from production_control.google_writer_provider_fence_settlement_observations value
  where value.observation_id = verification.settlement_readback_2_observation_id
    and value.fence_id = fence.fence_id;

  if fence.status is distinct from 'INSTALLED'
     or fence.active_verification_id is distinct from verification.verification_id
     or target_candidate_commit !~ '^[0-9a-f]{40}$'
     or (fence.lifecycle_mode = 'CUTOVER' and
       fence.candidate_deployment_commit is distinct from
         pg_catalog.lower(target_candidate_commit))
     or verification.acl_contract_version is distinct from 'DRIVE_ACL_V2'
     or verification.expires_at <= pg_catalog.clock_timestamp()
     or verification.protection_count <> 0
     or verification.protection_records is distinct from '[]'::jsonb
     or verification.protected_sheet_ids is distinct from '[]'::jsonb
     or verification.protected_range_ids is distinct from '[]'::jsonb
     or verification.legacy_role is distinct from 'reader'
     or verification.legacy_can_edit
     or verification.legacy_can_share
     or verification.recovery_only
     or not verification.legacy_deployments_fenced
     or not verification.legacy_google_credentials_fenced
     or not verification.non_owner_manual_google_scoring_fenced
     or not verification.owner_override_operationally_frozen
     or verification.global_writer_stop_active_at is distinct from
       fence.global_writer_stop_active_at
     or install_dispatch.dispatch_id is null
     or install_dispatch.outcome_status is distinct from 'TARGET_CONFIRMED'
     or install_dispatch.provider_mutation_class is distinct from
       'DRIVE_LEGACY_PERMISSION_WRITER_TO_READER_V1'
     or install_dispatch.transition_intent_fingerprint is distinct from
       verification.acl_transition_intent_fingerprint
     or install_dispatch.transition_proof_fingerprint is distinct from
       verification.acl_transition_proof_fingerprint
     or install_dispatch.transition_proof is distinct from
       verification.acl_transition_proof
     or install_dispatch.transition_proof->>'currentRole' is distinct from
       'reader'
     or install_dispatch.transition_proof->'currentLegacyCanEdit'
       is distinct from 'false'::jsonb
     or install_dispatch.transition_proof->'currentLegacyCanShare'
       is distinct from 'false'::jsonb
     or readback_2.observation_id is null
     or readback_2.stage is distinct from 'SETTLEMENT_READBACK_2'
     or readback_2.acl_transition_intent_fingerprint is distinct from
       verification.acl_transition_intent_fingerprint
     or readback_2.acl_transition_proof_fingerprint is distinct from
       verification.acl_transition_proof_fingerprint
     or readback_2.acl_transition_proof is distinct from
       verification.acl_transition_proof
     or readback_2.acl_fingerprint is distinct from verification.acl_fingerprint
     or readback_2.permission_inventory_fingerprint is distinct from
       verification.permission_inventory_fingerprint
     or readback_2.legacy_edit_capability_fingerprint is distinct from
       verification.legacy_edit_capability_fingerprint
     or quiesce.evidence_id is null
     or quiesce.purpose is distinct from fence.lifecycle_mode
     or quiesce.candidate_deployment_id is distinct from
       fence.candidate_deployment_id
     or quiesce.candidate_deployment_commit is distinct from
       fence.candidate_deployment_commit
     or not exists (
       select 1
       from production_control.vercel_routing_rule_audit_bindings audit
       where audit.quiesce_evidence_id = quiesce.evidence_id
         and audit.routing_rule_global_invocation_quiescence_proved
         and audit.routing_rule_candidate_control_host_count = 2
         and audit.routing_rule_canonical_apex_safe_method_count = 3
         and audit.routing_rule_canonical_apex_safe_method_writer_route_count = 10
     )
     or (require_fresh_quiesce and (
       quiesce.status is distinct from 'VERIFIED'
       or quiesce.expires_at <= pg_catalog.clock_timestamp()
       or quiesce.owner_freeze_expires_at <= pg_catalog.clock_timestamp()
     ))
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_FENCE_NOT_CURRENT';
  end if;
end;
$$;

create or replace function production_control.assert_current_external_scoring_fence(
  target_evidence_id uuid,
  target_deployment_commit text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  evidence production_control.scoring_external_fence_evidence%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
begin
  select * into evidence
  from production_control.scoring_external_fence_evidence value
  where value.evidence_id = target_evidence_id;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_EXTERNAL_SCORING_ACL_FENCE_EVIDENCE_REQUIRED';
  end if;
  select * into fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = evidence.provider_fence_id;
  if not found
     or evidence.revoked_at is not null
     or evidence.expires_at <= pg_catalog.clock_timestamp()
     or evidence.captured_at > pg_catalog.clock_timestamp() + interval '30 seconds'
     or evidence.captured_at < pg_catalog.clock_timestamp() - interval '2100 seconds'
     or (fence.lifecycle_mode = 'CUTOVER' and
       evidence.deployment_commit is distinct from
         pg_catalog.lower(target_deployment_commit))
     or (fence.lifecycle_mode = 'REHEARSAL' and
       evidence.deployment_commit is distinct from
         fence.candidate_deployment_commit)
     or not evidence.legacy_deployments_fenced
     or not evidence.legacy_google_credentials_fenced
     or not evidence.non_owner_manual_google_scoring_fenced
     or not evidence.owner_override_operationally_frozen
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_EXTERNAL_SCORING_ACL_FENCE_EVIDENCE_REQUIRED';
  end if;
  perform production_control.assert_current_google_writer_provider_fence(
    evidence.provider_fence_id, evidence.provider_fence_verification_id,
    case when fence.lifecycle_mode = 'REHEARSAL'
      then fence.candidate_deployment_commit else target_deployment_commit end,
    true
  );
end;
$$;

create or replace function public.finish_production_google_writer_provider_fence_install(
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
  fence production_control.google_writer_provider_fences%rowtype;
  install_dispatch
    production_control.google_writer_provider_fence_install_dispatches%rowtype;
  verification
    production_control.google_writer_provider_fence_verifications%rowtype;
  payload_hash_value text := production_control.cutover_payload_hash(input);
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'operation' is distinct from
       'FINISH_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL'
     or coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'install_dispatch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'settlement_readback_2_observation_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_FINISH_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'fence_id')::uuid
    and value.install_request_id = (input->>'install_request_id')::uuid
  for update;
  if fence.status = 'INSTALLED' then
    if fence.finish_request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or fence.finish_payload_hash is distinct from payload_hash_value
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_ALREADY_INSTALLED';
    end if;
    perform production_control.assert_current_google_writer_provider_fence(
      fence.fence_id, fence.active_verification_id,
      pg_catalog.lower(input->>'deployment_commit'), true
    );
    return production_control.google_writer_provider_fence_response(fence, true);
  end if;

  select * into strict install_dispatch
  from production_control.google_writer_provider_fence_install_dispatches value
  where value.dispatch_id = (input->>'install_dispatch_id')::uuid
    and value.fence_id = fence.fence_id
  for update;
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

  if fence.status is distinct from 'INSTALLING'
     or fence.quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or fence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or fence.actor_id is distinct from input->>'actor_id'
     or fence.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
     or install_dispatch.outcome_status is distinct from 'TARGET_CONFIRMED'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or (fence.lifecycle_mode = 'CUTOVER' and (
       gate.admission_deployment_id is distinct from input->>'deployment_id'
       or activation.expected_deployment_commit is distinct from
         pg_catalog.lower(input->>'deployment_commit')
     ))
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       input->>'deployment_id' is distinct from fence.candidate_deployment_id
       or pg_catalog.lower(input->>'deployment_commit') is distinct from
         fence.candidate_deployment_commit
     ))
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.active_google_writer_provider_fence_id is not null
     or resource.scoring_authority is distinct from 'GOOGLE'
     or gate.authority is distinct from 'GOOGLE'
     or gate.admission_state is distinct from 'OPEN'
     or gate.active_closure_id is not null
     or gate.external_fence_evidence_id is not null
     or gate.google_writer_provider_fence_id is not null
     or (fence.lifecycle_mode = 'CUTOVER' and (
       activation.state is distinct from 'GOOGLE_LEASE_ARMED'
       or gate.state is distinct from 'OPEN'
       or not gate.admission_protocol_enforced
       or resource.participant_identity_authority is distinct from 'SUPABASE'
       or resource.current_tournament_read_authority is distinct from 'SUPABASE'
     ))
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       activation.state is distinct from 'DORMANT'
       or gate.state is distinct from 'PAUSED'
       or gate.admission_protocol_enforced
       or resource.participant_identity_authority is distinct from 'PASSPORT'
       or resource.current_tournament_read_authority is distinct from 'GOOGLE'
     ))
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_FINISH_STATE_INVALID';
  end if;

  verification :=
    production_control.insert_google_writer_provider_fence_verification(
      fence.fence_id, input
    );
  update production_control.google_writer_provider_fences
  set status = 'INSTALLED',
      finish_request_fingerprint = pg_catalog.lower(input->>'request_fingerprint'),
      finish_payload_hash = payload_hash_value,
      active_verification_id = verification.verification_id,
      acl_reader_confirmed_at = install_dispatch.provider_observed_at,
      acl_reader_transition_fingerprint =
        install_dispatch.transition_proof_fingerprint,
      installed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where fence_id = fence.fence_id
  returning * into fence;
  update production_control.cutover_activation_state
  set active_google_writer_provider_fence_id = fence.fence_id,
      active_google_writer_provider_verification_id = verification.verification_id,
      active_vercel_quiesce_evidence_id = verification.quiesce_evidence_id,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.clock_timestamp()
  where scope_key = 'BAGGER_INV_PRODUCTION';
  update scoring_authority.ingress_gates
  set google_writer_provider_fence_id = fence.fence_id,
      google_writer_provider_verification_id = verification.verification_id,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.clock_timestamp()
  where tournament_id = '2026';
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result,
    details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_DRIVE_ACL_INSTALLED',
    'SCORING_AUTHORITY', '2026', fence.actor_id,
    fence.finish_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'verification_id', verification.verification_id,
      'install_dispatch_id', verification.install_dispatch_id,
      'acl_contract_version', verification.acl_contract_version,
      'legacy_role', verification.legacy_role,
      'legacy_can_edit', verification.legacy_can_edit,
      'legacy_can_share', verification.legacy_can_share,
      'protection_mutation_count', 0
    )
  );
  return production_control.google_writer_provider_fence_response(fence, false);
end;
$$;

create or replace function public.record_production_scoring_external_fence_evidence(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
  verification
    production_control.google_writer_provider_fence_verifications%rowtype;
  evidence production_control.scoring_external_fence_evidence%rowtype;
  captured timestamptz := pg_catalog.clock_timestamp();
  legacy_fingerprint text;
  legacy_count integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'operation' is distinct from
       'RECORD_PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE'
     or coalesce(input->>'provider_fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'provider_fence_verification_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_EXTERNAL_ACL_FENCE_EXACT_EVIDENCE_REQUIRED';
  end if;
  existing := production_control.lookup_cutover_receipt(
    'RECORD_SCORING_EXTERNAL_FENCE_EVIDENCE', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'RECORD_SCORING_EXTERNAL_FENCE_EVIDENCE', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'provider_fence_id')::uuid
  for update;
  select * into strict verification
  from production_control.google_writer_provider_fence_verifications value
  where value.verification_id =
      (input->>'provider_fence_verification_id')::uuid
    and value.fence_id = fence.fence_id;
  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = verification.quiesce_evidence_id;
  perform production_control.assert_current_google_writer_provider_fence(
    fence.fence_id, verification.verification_id,
    pg_catalog.lower(input->>'deployment_commit'), true
  );
  if activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or (fence.lifecycle_mode = 'CUTOVER' and (
       gate.admission_deployment_id is distinct from input->>'deployment_id'
       or activation.expected_deployment_commit is distinct from
         pg_catalog.lower(input->>'deployment_commit')
     ))
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       input->>'deployment_id' is distinct from fence.candidate_deployment_id
       or pg_catalog.lower(input->>'deployment_commit') is distinct from
         fence.candidate_deployment_commit
     ))
     or activation.active_google_writer_provider_fence_id is distinct from
       fence.fence_id
     or activation.active_google_writer_provider_verification_id is distinct from
       verification.verification_id
     or activation.active_vercel_quiesce_evidence_id is distinct from
       quiesce.evidence_id
     or gate.google_writer_provider_fence_id is distinct from fence.fence_id
     or gate.google_writer_provider_verification_id is distinct from
       verification.verification_id
     or gate.admission_state is distinct from 'OPEN'
     or (fence.lifecycle_mode = 'CUTOVER' and (
       activation.state is distinct from 'GOOGLE_LEASE_ARMED'
       or gate.state is distinct from 'OPEN'
       or not gate.admission_protocol_enforced
     ))
     or (fence.lifecycle_mode = 'REHEARSAL' and (
       activation.state is distinct from 'DORMANT'
       or gate.state is distinct from 'PAUSED'
       or gate.admission_protocol_enforced
     ))
  then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_EXTERNAL_ACL_FENCE_REVISION_CONFLICT';
  end if;

  legacy_fingerprint :=
    production_control.scoring_admission_legacy_set_fingerprint();
  select pg_catalog.count(*)::integer into legacy_count
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.protocol_version = 'LEGACY_V1';
  insert into production_control.scoring_external_fence_evidence (
    request_fingerprint, deployment_commit, deployment_id,
    vercel_project_id, source_workbook_id,
    provider_evidence_fingerprint, deployment_scope_fingerprint,
    google_credential_scope_fingerprint, writer_coverage_fingerprint,
    legacy_lease_set_fingerprint, legacy_lease_count,
    legacy_deployments_fenced, legacy_google_credentials_fenced,
    non_owner_manual_google_scoring_fenced,
    owner_override_operationally_frozen,
    captured_at, expires_at, actor_id, quiesce_evidence_id,
    provider_fence_id, provider_fence_verification_id
  ) values (
    pg_catalog.lower(input->>'request_fingerprint'),
    pg_catalog.lower(input->>'deployment_commit'), input->>'deployment_id',
    'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
    production_control.structured_evidence_fingerprint(
      pg_catalog.jsonb_build_object(
        'contractVersion', verification.acl_contract_version,
        'fenceId', fence.fence_id,
        'installDispatchId', verification.install_dispatch_id,
        'aclTransitionProofFingerprint',
          verification.acl_transition_proof_fingerprint,
        'providerFingerprint', verification.provider_fingerprint,
        'aclFingerprint', verification.acl_fingerprint,
        'legacyEditCapabilityFingerprint',
          verification.legacy_edit_capability_fingerprint
      )
    ),
    quiesce.deployment_scope_fingerprint,
    fence.legacy_credential_generation_fingerprint,
    verification.acl_transition_proof_fingerprint,
    legacy_fingerprint, legacy_count, true, true, true, true,
    captured, least(captured + interval '2100 seconds',
      verification.expires_at, quiesce.expires_at,
      quiesce.owner_freeze_expires_at),
    pg_catalog.left(input->>'actor_id', 160), quiesce.evidence_id,
    fence.fence_id, verification.verification_id
  ) returning * into evidence;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_SCORING_EXTERNAL_ACL_FENCE_EVIDENCE_RECORDED',
    'evidence_id', evidence.evidence_id,
    'deployment_id', evidence.deployment_id,
    'deployment_commit', evidence.deployment_commit,
    'captured_at', evidence.captured_at,
    'expires_at', evidence.expires_at,
    'provider_fence_id', evidence.provider_fence_id,
    'provider_fence_verification_id', evidence.provider_fence_verification_id,
    'quiesce_evidence_id', evidence.quiesce_evidence_id,
    'external_google_writer_fence_centrally_enforced', true,
    'acl_contract_version', 'DRIVE_ACL_V2',
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'RECORD_SCORING_EXTERNAL_FENCE_EVIDENCE', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.finish_close_production_google_writer_provider_fence_install(
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
  gate scoring_authority.ingress_gates%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
  install_dispatch
    production_control.google_writer_provider_fence_install_dispatches%rowtype;
  acl_reader_confirmed
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
  settlement_readback_1
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
  settlement_readback_2
    production_control.google_writer_provider_fence_settlement_observations%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  finish_response jsonb;
  evidence_response jsonb;
  close_response jsonb;
  existing_close jsonb;
  finish_input jsonb;
  evidence_input jsonb;
  close_input jsonb;
  settlement_input jsonb;
  finish_request_fingerprint text;
  evidence_request_fingerprint text;
  close_request_fingerprint text;
  unresolved_count integer;
  legacy_blockers integer;
  high_watermark bigint;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  if input->>'operation' is distinct from
       'FINISH_AND_CLOSE_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL'
     or input->>'expected_authority' is distinct from 'GOOGLE'
     or coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'acl_reader_confirmed_observation_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'settlement_readback_1_observation_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'settlement_readback_2_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'settlement_readback_2_request_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'start_source_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or input->>'candidate_deployment_id' is null
     or input->>'candidate_deployment_commit' is null
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_ATOMIC_CLOSE_INPUT_INVALID';
  end if;

  finish_request_fingerprint :=
    production_control.structured_evidence_fingerprint(
      pg_catalog.jsonb_build_object(
        'parent_request_fingerprint',
          pg_catalog.lower(input->>'request_fingerprint'),
        'operation', 'FINISH_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL'
      )
    );
  evidence_request_fingerprint :=
    production_control.structured_evidence_fingerprint(
      pg_catalog.jsonb_build_object(
        'parent_request_fingerprint',
          pg_catalog.lower(input->>'request_fingerprint'),
        'operation', 'RECORD_PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE'
      )
    );
  close_request_fingerprint :=
    production_control.structured_evidence_fingerprint(
      pg_catalog.jsonb_build_object(
        'parent_request_fingerprint',
          pg_catalog.lower(input->>'request_fingerprint'),
        'operation', 'CLOSE_PRODUCTION_SCORING_ADMISSION'
      )
    );

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'fence_id')::uuid
    and value.install_request_id = (input->>'install_request_id')::uuid
  for update;
  select * into strict acl_reader_confirmed
  from production_control.google_writer_provider_fence_settlement_observations value
  where value.fence_id = fence.fence_id
    and value.stage = 'ACL_READER_CONFIRMED'
    and value.observation_id =
      (input->>'acl_reader_confirmed_observation_id')::uuid
  for update;
  select * into strict settlement_readback_1
  from production_control.google_writer_provider_fence_settlement_observations value
  where value.fence_id = fence.fence_id
    and value.stage = 'SETTLEMENT_READBACK_1'
    and value.observation_id =
      (input->>'settlement_readback_1_observation_id')::uuid
    and value.prior_observation_id = acl_reader_confirmed.observation_id
  for update;
  select * into strict install_dispatch
  from production_control.google_writer_provider_fence_install_dispatches value
  where value.fence_id = fence.fence_id
    and value.outcome_status = 'TARGET_CONFIRMED'
  order by value.attempt desc
  limit 1
  for update;

  if fence.quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or fence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or settlement_readback_1.recorded_at <
       acl_reader_confirmed.recorded_at + interval '190 seconds'
     or pg_catalog.clock_timestamp() <
       settlement_readback_1.recorded_at + interval '10 seconds'
     or install_dispatch.transition_intent_fingerprint is distinct from
       acl_reader_confirmed.acl_transition_intent_fingerprint
     or install_dispatch.transition_proof_fingerprint is distinct from
       acl_reader_confirmed.acl_transition_proof_fingerprint
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_SETTLEMENT_NOT_READY';
  end if;

  settlement_input := input || pg_catalog.jsonb_build_object(
    'operation', 'RECORD_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_SETTLEMENT',
    'stage', 'SETTLEMENT_READBACK_2',
    'observation_request_id', input->>'settlement_readback_2_request_id',
    'request_fingerprint', input->>'settlement_readback_2_request_fingerprint',
    'prior_observation_id', settlement_readback_1.observation_id
  );
  if fence.status = 'INSTALLING' then
    settlement_readback_2 :=
      production_control.insert_google_writer_provider_fence_settlement_observation(
        fence.fence_id, 'SETTLEMENT_READBACK_2', settlement_input
      );
  elsif fence.status = 'INSTALLED' then
    select * into strict settlement_readback_2
    from production_control.google_writer_provider_fence_settlement_observations value
    where value.fence_id = fence.fence_id
      and value.stage = 'SETTLEMENT_READBACK_2'
      and value.observation_request_id =
        (input->>'settlement_readback_2_request_id')::uuid
      and value.request_fingerprint =
        pg_catalog.lower(input->>'settlement_readback_2_request_fingerprint')
      and value.payload_hash =
        production_control.cutover_payload_hash(settlement_input)
      and value.prior_observation_id = settlement_readback_1.observation_id;
  else
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_ATOMIC_CLOSE_STATE_INVALID';
  end if;

  finish_input := input || pg_catalog.jsonb_build_object(
    'operation', 'FINISH_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL',
    'request_fingerprint', finish_request_fingerprint,
    'install_dispatch_id', install_dispatch.dispatch_id,
    'settlement_readback_2_observation_id',
      settlement_readback_2.observation_id
  );
  finish_response :=
    public.finish_production_google_writer_provider_fence_install(finish_input);
  if finish_response->>'status' is distinct from 'INSTALLED'
     or coalesce(finish_response->>'active_verification_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_ATOMIC_CLOSE_INSTALL_FAILED';
  end if;

  evidence_input := input || pg_catalog.jsonb_build_object(
    'operation', 'RECORD_PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE',
    'request_fingerprint', evidence_request_fingerprint,
    'provider_fence_id', finish_response->>'fence_id',
    'provider_fence_verification_id',
      finish_response->>'active_verification_id'
  );
  evidence_response :=
    public.record_production_scoring_external_fence_evidence(evidence_input);
  if coalesce(evidence_response->>'evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_ATOMIC_CLOSE_EVIDENCE_FAILED';
  end if;

  close_input := evidence_input || pg_catalog.jsonb_build_object(
    'operation', 'CLOSE_PRODUCTION_SCORING_ADMISSION',
    'request_fingerprint', close_request_fingerprint,
    'expected_authority', 'GOOGLE',
    'external_fence_evidence_id', evidence_response->>'evidence_id'
  );
  if fence.lifecycle_mode = 'CUTOVER' then
    close_response := public.close_production_scoring_admission(close_input);
  else
    existing_close := production_control.lookup_cutover_receipt(
      'CLOSE_SCORING_ADMISSION', close_input
    );
    if existing_close is not null then
      close_response := existing_close;
    else
      select * into strict activation
      from production_control.cutover_activation_state value
      where value.scope_key = 'BAGGER_INV_PRODUCTION'
      for update;
      select * into strict gate
      from scoring_authority.ingress_gates value
      where value.tournament_id = '2026'
      for update;
      unresolved_count :=
        production_control.scoring_admission_unresolved_count(
          gate.admission_generation_id
        );
      legacy_blockers :=
        production_control.scoring_admission_legacy_blocker_count(
          gate.admission_enforced_at
        );
      if activation.state is distinct from 'DORMANT'
         or activation.current_authority is distinct from 'GOOGLE'
         or activation.scoring_ingress_enabled
         or activation.active_transition_epoch_id is not null
         or activation.active_google_writer_provider_fence_id is distinct from
           fence.fence_id
         or activation.active_google_writer_provider_verification_id is distinct from
           (finish_response->>'active_verification_id')::uuid
         or gate.state is distinct from 'PAUSED'
         or gate.authority is distinct from 'GOOGLE'
         or gate.admission_state is distinct from 'OPEN'
         or gate.admission_protocol_enforced
         or gate.active_closure_id is not null
         or gate.external_fence_evidence_id is not null
         or gate.google_writer_provider_fence_id is distinct from fence.fence_id
         or gate.google_writer_provider_verification_id is distinct from
           (finish_response->>'active_verification_id')::uuid
         or unresolved_count <> 0
         or legacy_blockers <> 0
      then
        raise exception using errcode = '55000',
          message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_REHEARSAL_CLOSE_NOT_SAFE';
      end if;
      select coalesce(pg_catalog.max(lease.admission_sequence), 0)
        into high_watermark
      from scoring_authority.scoring_ingress_leases lease
      where lease.tournament_id = '2026'
        and lease.protocol_version = 'ADMISSION_V2'
        and lease.admission_generation_id = gate.admission_generation_id;
      insert into production_control.scoring_admission_closures (
        closure_kind, tournament_id, authority, authority_generation_id,
        admission_generation_id, deployment_id,
        opening_admission_revision, closing_admission_revision,
        lease_high_watermark, start_source_fingerprint,
        external_fence_evidence_id, google_writer_provider_fence_id,
        google_writer_provider_verification_id, close_request_fingerprint,
        close_payload_hash, actor_id
      ) values (
        'LEGACY_ADMISSION', '2026', 'GOOGLE',
        activation.authority_generation_id, gate.admission_generation_id,
        fence.candidate_deployment_id, gate.admission_revision,
        gate.admission_revision + 1, high_watermark,
        pg_catalog.lower(input->>'start_source_fingerprint'),
        (evidence_response->>'evidence_id')::uuid, fence.fence_id,
        (finish_response->>'active_verification_id')::uuid,
        close_request_fingerprint,
        production_control.cutover_payload_hash(close_input),
        pg_catalog.left(input->>'actor_id', 160)
      ) returning * into closure;
      update scoring_authority.ingress_gates
      set admission_state = 'CLOSING',
          admission_protocol_enforced = true,
          admission_enforced_at = coalesce(
            admission_enforced_at, fence.global_writer_stop_active_at
          ),
          admission_opened_at = coalesce(
            admission_opened_at, fence.global_writer_stop_active_at
          ),
          admission_deployment_id = fence.candidate_deployment_id,
          legacy_lease_set_fingerprint =
            production_control.scoring_admission_legacy_set_fingerprint(),
          admission_revision = closure.closing_admission_revision,
          active_closure_id = closure.closure_id,
          external_fence_evidence_id =
            (evidence_response->>'evidence_id')::uuid,
          unresolved_client_queues = 0,
          updated_by = pg_catalog.left(input->>'actor_id', 160),
          updated_at = pg_catalog.clock_timestamp()
      where tournament_id = '2026'
      returning * into gate;
      update production_control.cutover_activation_state
      set activation_revision = activation_revision + 1,
          updated_by = pg_catalog.left(input->>'actor_id', 160),
          updated_at = pg_catalog.clock_timestamp()
      where scope_key = 'BAGGER_INV_PRODUCTION'
      returning * into activation;
      close_response := pg_catalog.jsonb_build_object(
        'ok', true,
        'code', 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_REHEARSAL_ADMISSION_CLOSING',
        'closure_id', closure.closure_id,
        'activation_revision', activation.activation_revision,
        'authority_generation_id', activation.authority_generation_id,
        'admission_generation_id', gate.admission_generation_id,
        'admission_revision', gate.admission_revision,
        'execution_gate', gate.state,
        'admission_state', gate.admission_state,
        'lease_high_watermark', closure.lease_high_watermark,
        'active_or_unresolved_leases', 0,
        'idempotent', false
      );
      perform production_control.store_cutover_receipt(
        'CLOSE_SCORING_ADMISSION', close_input, close_response
      );
    end if;
  end if;

  if close_response->>'admission_state' is distinct from 'CLOSING' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_ATOMIC_CLOSE_FAILED';
  end if;
  update scoring_authority.ingress_gates
  set provider_principal_fingerprint =
        install_dispatch.transition_intent->>'legacyPrincipalFingerprint',
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.clock_timestamp()
  where tournament_id = '2026'
    and (
      provider_principal_fingerprint is null
      or provider_principal_fingerprint =
        install_dispatch.transition_intent->>'legacyPrincipalFingerprint'
    )
  returning * into gate;
  if not found
     or coalesce(gate.provider_principal_fingerprint, '')
       !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_PRINCIPAL_BINDING_DRIFT';
  end if;
  return close_response || pg_catalog.jsonb_build_object(
    'code',
      'PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_INSTALLED_AND_ADMISSION_CLOSING',
    'lifecycle_mode', fence.lifecycle_mode,
    'provider_fence_id', finish_response->>'fence_id',
    'provider_fence_verification_id',
      finish_response->>'active_verification_id',
    'external_fence_evidence_id', evidence_response->>'evidence_id',
    'provider_fence_status', 'INSTALLED',
    'install_dispatch_id', install_dispatch.dispatch_id,
    'acl_reader_confirmed_observation_id',
      acl_reader_confirmed.observation_id,
    'settlement_readback_1_observation_id',
      settlement_readback_1.observation_id,
    'settlement_readback_2_observation_id',
      settlement_readback_2.observation_id,
    'settlement_completed_at', settlement_readback_2.recorded_at,
    'settlement_install_wait_seconds', 190,
    'settlement_readback_wait_seconds', 10,
    'protection_mutation_count', 0,
    'provider_principal_fingerprint', gate.provider_principal_fingerprint,
    'admission_reservation_active', true,
    'admission_reservation_state', 'HELD'
  );
end;
$$;
create or replace function public.mark_production_scoring_ingress_write_started(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  unresolved_count integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  existing := production_control.lookup_cutover_receipt(
    'MARK_SCORING_INGRESS_WRITE_STARTED', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for share;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into lease
  from scoring_authority.scoring_ingress_leases value
  where value.lease_id = (input->>'lease_id')::uuid
  for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'PRODUCTION_SCORING_LEASE_V3_NOT_FOUND';
  end if;
  perform production_control.assert_production_scoring_lease_nonce(
    lease, input->>'lease_nonce'
  );
  existing := production_control.lookup_cutover_receipt(
    'MARK_SCORING_INGRESS_WRITE_STARTED', input
  );
  if existing is not null then return existing; end if;
  if lease.admitted_activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.activation_revision < lease.admitted_activation_revision
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or lease.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from
       input->>'deployment_commit'
     or lease.authority_generation_id is distinct from
       activation.authority_generation_id
     or lease.admission_generation_id is distinct from
       gate.admission_generation_id
     or lease.admission_revision > gate.admission_revision
     or gate.admission_state not in ('OPEN', 'CLOSING')
     or not gate.admission_protocol_enforced
     or exists (
       select 1
       from production_control.google_writer_provider_fences value
       where value.status in ('INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED')
     )
  then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_LEASE_V3_BOUNDARY_CHANGED';
  end if;
  if lease.resolution_state = 'WRITE_STARTED' then
    response_value := pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_SCORING_WRITE_ALREADY_STARTED',
      'lease_id', lease.lease_id,
      'write_started_at', lease.write_started_at,
      'expires_at', lease.expires_at,
      'provider_credential_class', lease.provider_credential_class,
      'resolution_state', lease.resolution_state,
      'idempotent', true
    );
    perform production_control.store_cutover_receipt(
      'MARK_SCORING_INGRESS_WRITE_STARTED', input, response_value
    );
    return response_value;
  end if;
  if lease.resolution_state <> 'ADMITTED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_LEASE_V3_NOT_STARTABLE';
  end if;
  if lease.expires_at <= pg_catalog.now() then
    if lease.provider_credential_class = 'LEGACY_PROVIDER_FENCEABLE' then
      update scoring_authority.scoring_ingress_leases
      set resolution_state = 'PROVEN_NO_WRITE',
          status = 'COMPLETED',
          completed_at = pg_catalog.now(),
          outcome_reported_at = pg_catalog.now(),
          resolved_at = pg_catalog.now(),
          resolved_by = 'DATABASE_EXPIRY_V3',
          last_error_code = 'LEASE_EXPIRED_BEFORE_PROVIDER_DISPATCH'
      where lease_id = lease.lease_id
      returning * into lease;
      response_value := pg_catalog.jsonb_build_object(
        'ok', false,
        'code', 'PRODUCTION_SCORING_LEASE_EXPIRED_PROVEN_NO_WRITE',
        'lease_id', lease.lease_id,
        'expires_at', lease.expires_at,
        'provider_credential_class', lease.provider_credential_class,
        'resolution_state', lease.resolution_state,
        'requires_reconciliation', false,
        'idempotent', false
      );
    else
      update scoring_authority.scoring_ingress_leases
      set resolution_state = 'AMBIGUOUS',
          outcome_reported_at = pg_catalog.now(),
          last_error_code = 'LEASE_EXPIRED_BEFORE_WRITE_START'
      where lease_id = lease.lease_id
      returning * into lease;
      response_value := pg_catalog.jsonb_build_object(
        'ok', false,
        'code', 'PRODUCTION_SCORING_LEASE_EXPIRED_AMBIGUOUS',
        'lease_id', lease.lease_id,
        'expires_at', lease.expires_at,
        'provider_credential_class', lease.provider_credential_class,
        'resolution_state', lease.resolution_state,
        'requires_reconciliation', true,
        'idempotent', false
      );
    end if;
  else
    update scoring_authority.scoring_ingress_leases
    set resolution_state = 'WRITE_STARTED',
        write_started_at = pg_catalog.now()
    where lease_id = lease.lease_id
    returning * into lease;
    response_value := pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_SCORING_WRITE_STARTED',
      'lease_id', lease.lease_id,
      'write_started_at', lease.write_started_at,
      'expires_at', lease.expires_at,
      'provider_credential_class', lease.provider_credential_class,
      'resolution_state', lease.resolution_state,
      'idempotent', false
    );
  end if;
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  );
  update scoring_authority.ingress_gates
  set unresolved_client_queues = unresolved_count,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    case response_value->>'resolution_state'
      when 'WRITE_STARTED' then 'PRODUCTION_SCORING_LEASE_WRITE_STARTED'
      when 'PROVEN_NO_WRITE'
        then 'PRODUCTION_SCORING_LEASE_EXPIRED_PROVEN_NO_WRITE'
      else 'PRODUCTION_SCORING_LEASE_EXPIRED_AMBIGUOUS'
    end,
    'SCORING_AUTHORITY', '2026', lease.actor_id,
    pg_catalog.lower(input->>'request_fingerprint'),
    case when response_value->>'resolution_state' in (
      'WRITE_STARTED', 'PROVEN_NO_WRITE'
    ) then 'SUCCEEDED' else 'BLOCKED' end,
    pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'admission_generation_id', lease.admission_generation_id,
      'provider_credential_class', lease.provider_credential_class,
      'expires_at', lease.expires_at,
      'resolution_state', response_value->>'resolution_state'
    )
  );
  perform production_control.store_cutover_receipt(
    'MARK_SCORING_INGRESS_WRITE_STARTED', input, response_value
  );
  return response_value;
end;
$$;

-- Only this explicit v3 capability may cross the provider-dispatch boundary.
-- The historical unsuffixed implementation remains an internal primitive so
-- this wrapper can preserve its transaction/audit/idempotency semantics, but
-- its service_role EXECUTE privilege is revoked below.  The authoritative row
-- is re-read after MARK so a caller cannot downgrade or invent the credential
-- class, expiry, resolution, or write-start timestamp returned by the RPC.
create or replace function public.mark_production_scoring_ingress_write_started_v3(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  response_value jsonb;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  expected_provider_principal text;
  remaining_dispatch_ms bigint;
begin
  if coalesce(input->>'lease_id', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(input->>'lease_nonce', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_WRITE_STARTED_V3_REQUEST_INVALID';
  end if;

  expected_provider_principal :=
    pg_catalog.lower(input->>'expected_provider_principal_fingerprint');
  if coalesce(expected_provider_principal, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_WRITE_STARTED_V3_PROVIDER_PRINCIPAL_REQUIRED';
  end if;

  response_value := public.mark_production_scoring_ingress_write_started(input);

  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for share;

  select * into lease
  from scoring_authority.scoring_ingress_leases value
  where value.tournament_id = '2026'
    and value.protocol_version = 'ADMISSION_V2'
    and value.lease_id = (input->>'lease_id')::uuid
  for share;

  if found then
    perform production_control.assert_production_scoring_lease_nonce(
      lease, input->>'lease_nonce'
    );
  end if;

  if not found
     or lease.provider_credential_class is distinct from
       'LEGACY_PROVIDER_FENCEABLE'
     or lease.provider_principal_fingerprint is distinct from
       expected_provider_principal
     or gate.provider_principal_fingerprint is distinct from
       expected_provider_principal
     or response_value->>'lease_id' is distinct from lease.lease_id::text
     or response_value->>'resolution_state' is distinct from
       lease.resolution_state
     or response_value->>'expires_at' is distinct from
       pg_catalog.to_jsonb(lease.expires_at)#>>'{}'
     or response_value->>'provider_credential_class' is distinct from
       lease.provider_credential_class
     or lease.operation_request_id is distinct from
       (input->>'operation_request_id')::uuid
     or lease.resolution_state not in ('WRITE_STARTED', 'PROVEN_NO_WRITE')
     or (
       lease.resolution_state = 'WRITE_STARTED'
       and (
         lease.write_started_at is null
         or response_value->>'write_started_at' is distinct from
           pg_catalog.to_jsonb(lease.write_started_at)#>>'{}'
       )
     )
     or (
       lease.resolution_state = 'PROVEN_NO_WRITE'
       and (
         lease.write_started_at is not null
         or lease.last_error_code is distinct from
           'LEASE_EXPIRED_BEFORE_PROVIDER_DISPATCH'
       )
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_WRITE_STARTED_V3_RECEIPT_MISMATCH';
  end if;

  -- Recompute from the authoritative row after every MARK attempt, including
  -- receipt replay. A lost response retried after expiry therefore returns a
  -- zero window and cannot authorize a delayed provider dispatch.
  remaining_dispatch_ms := greatest(
    0::bigint,
    pg_catalog.floor(extract(epoch from (
      lease.expires_at - pg_catalog.clock_timestamp()
    )) * 1000)::bigint
  );

  return response_value || pg_catalog.jsonb_build_object(
    'contract_version', 'ADMISSION_V3',
    'lease_id', lease.lease_id,
    'lease_nonce', pg_catalog.lower(input->>'lease_nonce'),
    'operation_request_id', lease.operation_request_id,
    'expires_at', lease.expires_at,
    'remaining_dispatch_ms', remaining_dispatch_ms,
    'provider_credential_class', lease.provider_credential_class,
    'provider_principal_fingerprint', lease.provider_principal_fingerprint,
    'provider_dispatch_must_begin_before_expires_at', true,
    'resolution_state', lease.resolution_state,
    'write_started_at', lease.write_started_at
  );
end;
$$;

-- The v2 outcome implementation remains the transactional/audit primitive, but
-- the callable v3 bridge re-reads the authoritative gate and lease and binds the
-- exact Drive principal fenced during Step 11.6. A caller cannot substitute a
-- different GOOGLE_* identity while retaining the generic credential class.
alter function public.report_production_scoring_ingress_outcome(jsonb)
  rename to report_production_scoring_ingress_outcome_v2_base;

revoke all on function
  public.report_production_scoring_ingress_outcome_v2_base(jsonb)
  from public, anon, authenticated, service_role;

create function public.report_production_scoring_ingress_outcome(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  response_value jsonb;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  expected_provider_principal text;
begin
  if coalesce(input->>'lease_id', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(input->>'lease_nonce', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_OUTCOME_V3_REQUEST_INVALID';
  end if;
  expected_provider_principal :=
    pg_catalog.lower(input->>'expected_provider_principal_fingerprint');
  if coalesce(expected_provider_principal, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_OUTCOME_V3_PROVIDER_PRINCIPAL_REQUIRED';
  end if;

  response_value :=
    public.report_production_scoring_ingress_outcome_v2_base(input);

  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for share;
  select * into lease
  from scoring_authority.scoring_ingress_leases value
  where value.tournament_id = '2026'
    and value.protocol_version = 'ADMISSION_V2'
    and value.lease_id = (input->>'lease_id')::uuid
  for share;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_OUTCOME_V3_RECEIPT_MISMATCH';
  end if;
  perform production_control.assert_production_scoring_lease_nonce(
    lease, input->>'lease_nonce'
  );
  if lease.operation_request_id is distinct from
       (input->>'operation_request_id')::uuid
     or lease.provider_credential_class is distinct from
       'LEGACY_PROVIDER_FENCEABLE'
     or lease.provider_principal_fingerprint is distinct from
       expected_provider_principal
     or gate.provider_principal_fingerprint is distinct from
       expected_provider_principal
     or response_value->>'lease_id' is distinct from lease.lease_id::text
     or response_value->>'resolution_state' is distinct from
       lease.resolution_state
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_OUTCOME_V3_RECEIPT_MISMATCH';
  end if;
  return response_value || pg_catalog.jsonb_build_object(
    'contract_version', 'ADMISSION_V3',
    'lease_id', lease.lease_id,
    'lease_nonce', pg_catalog.lower(input->>'lease_nonce'),
    'operation_request_id', lease.operation_request_id,
    'provider_credential_class', lease.provider_credential_class,
    'provider_principal_fingerprint', lease.provider_principal_fingerprint
  );
end;
$$;

revoke all on function public.report_production_scoring_ingress_outcome(jsonb)
  from public, anon, authenticated;
grant execute on function public.report_production_scoring_ingress_outcome(jsonb)
  to service_role;

create or replace function public.drain_production_scoring_admission(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
  transitioned_no_write integer;
  transitioned_ambiguous integer;
  unresolved_count integer;
  legacy_blockers integer;
  lease_fingerprint text;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, true
  );
  existing := production_control.lookup_cutover_receipt(
    'DRAIN_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'DRAIN_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid
  for update;
  if gate.google_writer_provider_fence_id is not null then
    select * into strict fence
    from production_control.google_writer_provider_fences value
    where value.fence_id = gate.google_writer_provider_fence_id
    for update;
  end if;
  if activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id is distinct from
       (input->>'external_fence_evidence_id')::uuid
     or not (
       (fence.fence_id is not null
         and fence.lifecycle_mode = 'REHEARSAL'
         and fence.status = 'INSTALLED'
         and input->>'deployment_id' = fence.candidate_deployment_id
         and pg_catalog.lower(input->>'deployment_commit') =
           fence.candidate_deployment_commit)
       or
       (gate.admission_deployment_id = input->>'deployment_id'
         and activation.expected_deployment_commit =
           pg_catalog.lower(input->>'deployment_commit'))
     )
     or gate.state <> 'PAUSED'
     or gate.admission_state is distinct from (case
       when closure.authority = 'GOOGLE' then 'CLOSING' else 'CLOSED' end)
     or closure.status <> 'CLOSING'
     or closure.authority_generation_id is distinct from
       activation.authority_generation_id
     or closure.admission_generation_id is distinct from
       gate.admission_generation_id
  then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_ADMISSION_DRAIN_REVISION_CONFLICT';
  end if;
  perform lease.lease_id
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and (
      lease.protocol_version = 'LEGACY_V1'
      or lease.admission_generation_id = gate.admission_generation_id
    )
  order by lease.lease_id
  for update;

  update scoring_authority.scoring_ingress_leases
  set resolution_state = 'PROVEN_NO_WRITE',
      status = 'COMPLETED',
      completed_at = pg_catalog.now(),
      outcome_reported_at = pg_catalog.now(),
      resolved_at = pg_catalog.now(),
      resolved_by = 'DATABASE_EXPIRY_V3',
      last_error_code = 'LEASE_EXPIRED_BEFORE_PROVIDER_DISPATCH'
  where tournament_id = '2026'
    and protocol_version = 'ADMISSION_V2'
    and admission_generation_id = gate.admission_generation_id
    and resolution_state = 'ADMITTED'
    and provider_credential_class = 'LEGACY_PROVIDER_FENCEABLE'
    and write_started_at is null
    and expires_at <= pg_catalog.now();
  get diagnostics transitioned_no_write = row_count;

  update scoring_authority.scoring_ingress_leases
  set resolution_state = 'AMBIGUOUS',
      status = 'ACTIVE',
      completed_at = null,
      outcome_reported_at = pg_catalog.now(),
      last_error_code = case when resolution_state = 'ADMITTED'
        then 'LEASE_EXPIRED_WITHOUT_V3_DISPATCH_PROOF'
        else 'LEASE_EXPIRED_AFTER_WRITE_START'
      end
  where tournament_id = '2026'
    and protocol_version = 'ADMISSION_V2'
    and admission_generation_id = gate.admission_generation_id
    and resolution_state in ('ADMITTED', 'WRITE_STARTED')
    and expires_at <= pg_catalog.now();
  get diagnostics transitioned_ambiguous = row_count;

  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  );
  legacy_blockers := production_control.scoring_admission_legacy_blocker_count(
    gate.admission_enforced_at
  );
  lease_fingerprint :=
    production_control.scoring_admission_lease_set_fingerprint(
      gate.admission_generation_id
    );
  update scoring_authority.ingress_gates
  set admission_revision = admission_revision + 1,
      unresolved_client_queues = unresolved_count + legacy_blockers,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
  returning * into gate;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_SCORING_ADMISSION_DRAIN_INSPECTED',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'),
    case when unresolved_count + legacy_blockers = 0
      then 'SUCCEEDED' else 'BLOCKED' end,
    pg_catalog.jsonb_build_object(
      'closure_id', closure.closure_id,
      'expired_proven_no_write', transitioned_no_write,
      'expired_became_ambiguous', transitioned_ambiguous,
      'v2_unresolved', unresolved_count,
      'legacy_unclassified', legacy_blockers,
      'lease_set_fingerprint', lease_fingerprint
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_SCORING_ADMISSION_DRAIN_INSPECTED',
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'admission_revision', gate.admission_revision,
    'expired_proven_no_write', transitioned_no_write,
    'expired_became_ambiguous', transitioned_ambiguous,
    'v2_unresolved', unresolved_count,
    'legacy_unclassified', legacy_blockers,
    'active_or_unresolved_leases', unresolved_count + legacy_blockers,
    'lease_set_fingerprint', lease_fingerprint,
    'ready_to_finalize', unresolved_count + legacy_blockers = 0,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'DRAIN_SCORING_ADMISSION', input, response_value
  );
  return response_value;
end;
$$;

-- Preserve the predecessor finalizer for staged CUTOVER epochs.  The public
-- wrapper below adds only the exact DORMANT ACL-v2 rehearsal branch; it never
-- weakens the staged-release predicate for a real cutover.
alter function public.finalize_production_scoring_admission(jsonb)
  rename to finalize_production_scoring_admission_v2_base;

create or replace function public.finalize_production_scoring_admission(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
  unresolved_count integer;
  legacy_blockers integer;
  unresolved_outbox integer;
  unresolved_archive integer;
  current_revisions jsonb;
  current_checkpoints jsonb;
  current_lease_fingerprint text;
  boundary_captured_at timestamptz;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);

  -- Only an exact active REHEARSAL fence selects the DORMANT path.  Every
  -- other state delegates to the predecessor, which reasserts the staged
  -- release and original CUTOVER contract itself.
  select * into gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  if gate.google_writer_provider_fence_id is not null then
    select * into fence
    from production_control.google_writer_provider_fences value
    where value.fence_id = gate.google_writer_provider_fence_id;
  end if;
  if fence.fence_id is null or fence.lifecycle_mode <> 'REHEARSAL' then
    return public.finalize_production_scoring_admission_v2_base(input);
  end if;

  perform production_control.assert_scoring_admission_optimistic_input(
    input, true
  );
  existing := production_control.lookup_cutover_receipt(
    'FINALIZE_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  if coalesce(input->>'final_source_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'reconciliation_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'lease_set_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'supabase_match_revisions')
       is distinct from 'object'
     or pg_catalog.jsonb_typeof(input->'google_checkpoints')
       is distinct from 'object'
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_ACL_REHEARSAL_FINAL_BOUNDARY_REQUIRED';
  end if;
  boundary_captured_at := (input->>'boundary_captured_at')::timestamptz;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'FINALIZE_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid
  for update;
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = gate.google_writer_provider_fence_id
  for update;
  perform production_control.assert_current_external_scoring_fence(
    (input->>'external_fence_evidence_id')::uuid,
    fence.candidate_deployment_commit
  );
  perform lease.lease_id
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and (
      lease.protocol_version = 'LEGACY_V1'
      or lease.admission_generation_id = gate.admission_generation_id
    )
  order by lease.lease_id
  for update;

  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  );
  legacy_blockers := production_control.scoring_admission_legacy_blocker_count(
    gate.admission_enforced_at
  );
  current_lease_fingerprint :=
    production_control.scoring_admission_lease_set_fingerprint(
      gate.admission_generation_id
    );
  current_revisions := production_control.current_match_revisions('2026');
  current_checkpoints := production_control.current_google_checkpoints('2026');
  select pg_catalog.count(*)::integer into unresolved_outbox
  from scoring_authority.google_outbox_events event
  where event.tournament_id = '2026' and event.status <> 'DELIVERED';
  select pg_catalog.count(*)::integer into unresolved_archive
  from scoring_authority.scorecard_archive_jobs job
  where job.tournament_id = '2026'
    and job.status not in ('VERIFIED', 'SUPERSEDED');

  if activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or activation.state is distinct from 'DORMANT'
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.active_google_writer_provider_fence_id is distinct from
       fence.fence_id
     or activation.active_google_writer_provider_verification_id is distinct from
       fence.active_verification_id
     or fence.lifecycle_mode is distinct from 'REHEARSAL'
     or fence.status is distinct from 'INSTALLED'
     or fence.candidate_deployment_id is distinct from input->>'deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'deployment_commit')
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id is distinct from
       (input->>'external_fence_evidence_id')::uuid
     or gate.admission_deployment_id is distinct from fence.candidate_deployment_id
     or gate.google_writer_provider_fence_id is distinct from fence.fence_id
     or gate.google_writer_provider_verification_id is distinct from
       fence.active_verification_id
     or gate.state is distinct from 'PAUSED'
     or gate.admission_state is distinct from 'CLOSING'
     or not gate.admission_protocol_enforced
     or closure.status is distinct from 'CLOSING'
     or closure.closure_kind is distinct from 'LEGACY_ADMISSION'
     or closure.authority is distinct from 'GOOGLE'
     or closure.deployment_id is distinct from fence.candidate_deployment_id
     or closure.authority_generation_id is distinct from
       activation.authority_generation_id
     or closure.admission_generation_id is distinct from
       gate.admission_generation_id
     or boundary_captured_at < closure.closing_at
     or boundary_captured_at > pg_catalog.clock_timestamp()
     or boundary_captured_at < pg_catalog.clock_timestamp() - interval '5 minutes'
     or unresolved_count <> 0 or legacy_blockers <> 0
     or unresolved_outbox <> 0 or unresolved_archive <> 0
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026'
         and lease.protocol_version = 'ADMISSION_V2'
         and lease.admission_generation_id = gate.admission_generation_id
         and lease.admission_sequence > closure.lease_high_watermark
     )
     or pg_catalog.lower(input->>'lease_set_fingerprint') is distinct from
       current_lease_fingerprint
     or input->'supabase_match_revisions' is distinct from current_revisions
     or input->'google_checkpoints' is distinct from current_checkpoints
     or exists (
       select 1
       from scoring_authority.matches match_value
       left join scoring_authority.google_match_checkpoints checkpoint
         using (match_id)
       where match_value.tournament_id = '2026' and checkpoint.match_id is null
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_ACL_REHEARSAL_FINAL_BOUNDARY_CHANGED';
  end if;

  update production_control.scoring_admission_closures
  set status = 'CLOSED',
      closed_admission_revision = gate.admission_revision + 1,
      final_source_fingerprint = pg_catalog.lower(input->>'final_source_fingerprint'),
      reconciliation_fingerprint =
        pg_catalog.lower(input->>'reconciliation_fingerprint'),
      lease_set_fingerprint = current_lease_fingerprint,
      supabase_match_revisions = current_revisions,
      google_checkpoints = current_checkpoints,
      closed_at = pg_catalog.clock_timestamp()
  where closure_id = closure.closure_id
  returning * into closure;
  update scoring_authority.ingress_gates
  set admission_state = 'CLOSED',
      admission_revision = closure.closed_admission_revision,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.clock_timestamp()
  where tournament_id = '2026'
  returning * into gate;
  update production_control.cutover_activation_state
  set activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.clock_timestamp()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result,
    details
  ) values (
    'PRODUCTION_SCORING_ACL_REHEARSAL_ADMISSION_CLOSED',
    'SCORING_AUTHORITY', '2026', pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'closure_id', closure.closure_id,
      'provider_fence_id', fence.fence_id,
      'admission_revision', gate.admission_revision,
      'final_source_fingerprint', closure.final_source_fingerprint,
      'reconciliation_fingerprint', closure.reconciliation_fingerprint,
      'lease_set_fingerprint', closure.lease_set_fingerprint,
      'active_or_unresolved_leases', 0
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_SCORING_ACL_REHEARSAL_ADMISSION_CLOSED',
    'lifecycle_mode', 'REHEARSAL',
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'execution_gate', gate.state,
    'admission_state', gate.admission_state,
    'final_source_fingerprint', closure.final_source_fingerprint,
    'reconciliation_fingerprint', closure.reconciliation_fingerprint,
    'lease_set_fingerprint', closure.lease_set_fingerprint,
    'active_or_unresolved_leases', 0,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'FINALIZE_SCORING_ADMISSION', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  public.finalize_production_scoring_admission_v2_base(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_production_scoring_admission(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_production_scoring_admission(jsonb)
  to service_role;

create or replace function production_control.scoring_write_started_no_write_evidence_hash(
  target_lease_id uuid,
  input jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select production_control.structured_evidence_fingerprint(
    pg_catalog.jsonb_build_object(
      'lease_id', target_lease_id,
      'resolution', 'NO_WRITE',
      'provider_before_fingerprint',
        pg_catalog.lower(input->>'provider_before_fingerprint'),
      'provider_readback_fingerprint',
        pg_catalog.lower(input->>'provider_readback_fingerprint'),
      'provider_readback_stable', input->'provider_readback_stable',
      'provider_readback_observed_at',
        input->>'provider_readback_observed_at',
      'closure_id', input->>'closure_id',
      'external_fence_evidence_id', input->>'external_fence_evidence_id',
      'quiesce_evidence_id', input->>'quiesce_evidence_id',
      'provider_fence_id', input->>'provider_fence_id',
      'provider_fence_verification_id',
        input->>'provider_fence_verification_id',
      'expected_activation_revision', input->'expected_activation_revision',
      'expected_authority_generation', input->>'expected_authority_generation',
      'expected_admission_generation', input->>'expected_admission_generation',
      'expected_admission_revision', input->'expected_admission_revision',
      'actor_id', input->>'actor_id'
    )
  )
$$;

create or replace function public.resolve_production_scoring_ingress_ambiguity(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  evidence production_control.scoring_external_fence_evidence%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
  verification
    production_control.google_writer_provider_fence_verifications%rowtype;
  quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  requested_resolution text := pg_catalog.upper(
    coalesce(input->>'resolution', '')
  );
  readback_observed timestamptz;
  requires_fenced_no_write_proof boolean;
  unresolved_count integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(
    input, false
  );
  existing := production_control.lookup_cutover_receipt(
    'RESOLVE_SCORING_INGRESS_AMBIGUITY', input
  );
  if existing is not null then return existing; end if;
  if requested_resolution not in ('WRITE', 'NO_WRITE')
     or coalesce(input->>'resolution_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'provider_readback_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'actor_id', '') = ''
  then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_AMBIGUITY_RESOLUTION_EVIDENCE_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for share;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  select * into lease
  from scoring_authority.scoring_ingress_leases value
  where value.lease_id = (input->>'lease_id')::uuid
  for update;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_AMBIGUITY_NOT_RESOLVABLE';
  end if;
  existing := production_control.lookup_cutover_receipt(
    'RESOLVE_SCORING_INGRESS_AMBIGUITY', input
  );
  if existing is not null then return existing; end if;
  if lease.resolution_state not in ('AMBIGUOUS', 'PARTIAL_WRITE') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_AMBIGUITY_NOT_RESOLVABLE';
  end if;
  if lease.resolution_state = 'PARTIAL_WRITE'
     and requested_resolution = 'NO_WRITE' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_PARTIAL_WRITE_REPAIR_REQUIRED';
  end if;
  if activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from
       input->>'deployment_commit'
     or lease.admission_generation_id is distinct from
       gate.admission_generation_id
     or gate.admission_state not in ('OPEN', 'CLOSING')
  then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_AMBIGUITY_BOUNDARY_CHANGED';
  end if;

  requires_fenced_no_write_proof := requested_resolution = 'NO_WRITE'
    and lease.write_started_at is not null;
  if requires_fenced_no_write_proof then
    if coalesce(input->>'closure_id', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(input->>'external_fence_evidence_id', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(input->>'quiesce_evidence_id', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(input->>'provider_fence_id', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(input->>'provider_fence_verification_id', '')
         !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(input->>'provider_before_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or input->'provider_readback_stable' is distinct from 'true'::jsonb
       or pg_catalog.lower(input->>'provider_before_fingerprint')
         is distinct from
           pg_catalog.lower(input->>'provider_readback_fingerprint')
    then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_SCORING_WRITE_STARTED_NO_WRITE_FENCE_PROOF_REQUIRED';
    end if;
    readback_observed :=
      (input->>'provider_readback_observed_at')::timestamptz;
    select * into strict closure
    from production_control.scoring_admission_closures value
    where value.closure_id = (input->>'closure_id')::uuid;
    select * into strict evidence
    from production_control.scoring_external_fence_evidence value
    where value.evidence_id =
      (input->>'external_fence_evidence_id')::uuid;
    select * into strict fence
    from production_control.google_writer_provider_fences value
    where value.fence_id = (input->>'provider_fence_id')::uuid;
    select * into strict verification
    from production_control.google_writer_provider_fence_verifications value
    where value.verification_id =
        (input->>'provider_fence_verification_id')::uuid
      and value.fence_id = fence.fence_id;
    select * into strict quiesce
    from production_control.vercel_writer_quiesce_evidence value
    where value.evidence_id = (input->>'quiesce_evidence_id')::uuid;
    perform production_control.assert_current_external_scoring_fence(
      evidence.evidence_id, activation.expected_deployment_commit
    );
    perform production_control.assert_current_google_writer_provider_fence(
      fence.fence_id, verification.verification_id,
      activation.expected_deployment_commit, true
    );
    if activation.current_authority is distinct from 'GOOGLE'
       or activation.scoring_ingress_enabled
       or activation.active_transition_epoch_id is not null
       or activation.active_google_writer_provider_fence_id is distinct from
         fence.fence_id
       or activation.active_google_writer_provider_verification_id is distinct from
         verification.verification_id
       or activation.active_vercel_quiesce_evidence_id is distinct from
         quiesce.evidence_id
       or gate.state is distinct from 'PAUSED'
       or gate.authority is distinct from 'GOOGLE'
       or gate.admission_state is distinct from 'CLOSING'
       or gate.active_closure_id is distinct from closure.closure_id
       or gate.external_fence_evidence_id is distinct from evidence.evidence_id
       or gate.google_writer_provider_fence_id is distinct from fence.fence_id
       or gate.google_writer_provider_verification_id is distinct from
         verification.verification_id
       or closure.status is distinct from 'CLOSING'
       or closure.closure_kind is distinct from 'LEGACY_ADMISSION'
       or closure.authority is distinct from 'GOOGLE'
       or closure.authority_generation_id is distinct from
         activation.authority_generation_id
       or closure.admission_generation_id is distinct from
         gate.admission_generation_id
       or lease.close_fence_id is distinct from closure.closure_id
       or lease.admission_sequence > closure.lease_high_watermark
       or evidence.provider_fence_id is distinct from fence.fence_id
       or evidence.provider_fence_verification_id is distinct from
         verification.verification_id
       or evidence.quiesce_evidence_id is distinct from quiesce.evidence_id
       or fence.quiesce_evidence_id is distinct from quiesce.evidence_id
       or verification.quiesce_evidence_id is distinct from quiesce.evidence_id
       or readback_observed < greatest(
         fence.installed_at,
         verification.captured_at,
         evidence.captured_at,
         closure.closing_at
       )
       or readback_observed < pg_catalog.now() - interval '5 minutes'
       or readback_observed > pg_catalog.now() + interval '30 seconds'
       or pg_catalog.lower(input->>'resolution_fingerprint') is distinct from
         production_control.scoring_write_started_no_write_evidence_hash(
           lease.lease_id, input
         )
    then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_SCORING_WRITE_STARTED_NO_WRITE_FENCE_PROOF_INVALID';
    end if;
  end if;

  update scoring_authority.scoring_ingress_leases
  set resolution_state = case when requested_resolution = 'WRITE'
        then 'RESOLVED_WRITE' else 'RESOLVED_NO_WRITE' end,
      status = 'COMPLETED',
      completed_at = pg_catalog.now(),
      provider_before_fingerprint = case
        when requires_fenced_no_write_proof then
          pg_catalog.lower(input->>'provider_before_fingerprint')
        else provider_before_fingerprint
      end,
      provider_readback_fingerprint = pg_catalog.lower(
        input->>'provider_readback_fingerprint'
      ),
      resolution_fingerprint = pg_catalog.lower(
        input->>'resolution_fingerprint'
      ),
      resolved_at = pg_catalog.now(),
      resolved_by = pg_catalog.left(input->>'actor_id', 160)
  where lease_id = lease.lease_id
  returning * into lease;
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  );
  update scoring_authority.ingress_gates
  set unresolved_client_queues = unresolved_count,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_SCORING_LEASE_AMBIGUITY_RESOLVED',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'resolution_state', lease.resolution_state,
      'write_started_at', lease.write_started_at,
      'fenced_no_write_proof_required', requires_fenced_no_write_proof,
      'provider_readback_fingerprint', lease.provider_readback_fingerprint,
      'resolution_fingerprint', lease.resolution_fingerprint,
      'closure_id', case when requires_fenced_no_write_proof
        then closure.closure_id else null end,
      'external_fence_evidence_id', case
        when requires_fenced_no_write_proof then evidence.evidence_id
        else null end,
      'active_or_unresolved_leases', unresolved_count
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_SCORING_LEASE_AMBIGUITY_RESOLVED',
    'lease_id', lease.lease_id,
    'resolution_state', lease.resolution_state,
    'fenced_no_write_proof_required', requires_fenced_no_write_proof,
    'active_or_unresolved_leases', unresolved_count,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'RESOLVE_SCORING_INGRESS_AMBIGUITY', input, response_value
  );
  return response_value;
end;
$$;

-- The historical protected-range rehearsal can no longer satisfy the Step
-- 11.6 gate.  Certification now requires one fully restored Drive ACL-v2
-- lifecycle whose install and restore proofs are both durable, whose admission
-- boundary ended DORMANT/GOOGLE/PASSPORT/OPEN, and which mutated zero protected
-- ranges.
create or replace function production_control.assert_certified_google_writer_fence_rehearsal(
  target_candidate_commit text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  perform production_control.assert_no_unrestored_google_writer_fence_rehearsal();
  if target_candidate_commit !~ '^[0-9a-f]{40}$'
     or exists (
       select 1
       from production_control.google_writer_provider_fences value
       where value.status in (
         'INSTALLING', 'ABORTING', 'INSTALLED', 'REMOVAL_AUTHORIZED'
       )
     )
     or not exists (
       select 1
       from production_control.google_writer_provider_fences fence
       join production_control.google_writer_provider_fence_verifications
         verification
         on verification.verification_id = fence.active_verification_id
        and verification.fence_id = fence.fence_id
       join production_control.google_writer_provider_fence_install_aborts abort_value
         on abort_value.fence_id = fence.fence_id
       join production_control.google_writer_provider_fence_install_dispatches
         install_dispatch
         on install_dispatch.dispatch_id = verification.install_dispatch_id
       join production_control.google_writer_provider_fence_abort_dispatches
         restore_dispatch
         on restore_dispatch.dispatch_id = abort_value.restore_dispatch_id
       where fence.lifecycle_mode = 'REHEARSAL'
         and fence.status = 'REHEARSAL_RESTORED'
         and fence.candidate_deployment_commit = target_candidate_commit
         and fence.rehearsal_restored_at is not null
         and fence.acl_reader_confirmed_at is not null
         and fence.acl_writer_restored_at is not null
         and fence.restore_global_writer_stop_active_at is not null
         and fence.acl_writer_restored_at >=
           fence.restore_global_writer_stop_active_at + interval '1810 seconds'
         and verification.acl_contract_version = 'DRIVE_ACL_V2'
         and verification.protection_count = 0
         and verification.protection_records = '[]'::jsonb
         and verification.protected_sheet_ids = '[]'::jsonb
         and verification.protected_range_ids = '[]'::jsonb
         and verification.legacy_role = 'reader'
         and not verification.legacy_can_edit
         and not verification.legacy_can_share
         and install_dispatch.outcome_status = 'TARGET_CONFIRMED'
         and install_dispatch.transition_proof->>'currentRole' = 'reader'
         and install_dispatch.transition_proof->'currentLegacyCanEdit' =
           'false'::jsonb
         and install_dispatch.transition_proof->'currentLegacyCanShare' =
           'false'::jsonb
         and restore_dispatch.outcome_status = 'TARGET_CONFIRMED'
         and restore_dispatch.transition_proof->>'currentRole' = 'writer'
         and restore_dispatch.transition_proof->'currentLegacyCanEdit' =
           'true'::jsonb
         and restore_dispatch.transition_proof->'currentLegacyCanShare' =
           'true'::jsonb
         and abort_value.removed_protected_range_ids = '[]'::jsonb
         and abort_value.active_run_owned_protection_count = 0
         and abort_value.restored_legacy_role = 'writer'
         and abort_value.restored_legacy_can_edit
         and abort_value.restored_legacy_can_share
     )
     or not exists (
       select 1
       from production_control.cutover_activation_state activation
       cross join production_control.resource_scope resource
       cross join scoring_authority.ingress_gates gate
       where activation.scope_key = 'BAGGER_INV_PRODUCTION'
         and resource.scope_key = 'BAGGER_INV_PRODUCTION'
         and gate.tournament_id = '2026'
         and activation.state = 'DORMANT'
         and activation.current_authority = 'GOOGLE'
         and not activation.scoring_ingress_enabled
         and activation.active_transition_epoch_id is null
         and activation.active_google_writer_provider_fence_id is null
         and activation.active_google_writer_provider_verification_id is null
         and activation.active_vercel_quiesce_evidence_id is null
         and resource.scoring_authority = 'GOOGLE'
         and resource.participant_identity_authority = 'PASSPORT'
         and resource.current_tournament_read_authority = 'GOOGLE'
         and not resource.scoring_ingress_enabled
         and not resource.workers_enabled
         and gate.state = 'PAUSED'
         and gate.authority = 'GOOGLE'
         and gate.admission_state = 'OPEN'
         and not gate.admission_protocol_enforced
         and gate.active_closure_id is null
         and gate.external_fence_evidence_id is null
         and gate.google_writer_provider_fence_id is null
         and gate.google_writer_provider_verification_id is null
         and exists (
           select 1
           from production_control.google_writer_provider_fences certified_fence
           join production_control.google_writer_provider_fence_install_dispatches
             certified_dispatch
             on certified_dispatch.fence_id = certified_fence.fence_id
           where certified_fence.lifecycle_mode = 'REHEARSAL'
             and certified_fence.status = 'REHEARSAL_RESTORED'
             and certified_fence.candidate_deployment_commit =
               target_candidate_commit
             and certified_dispatch.outcome_status = 'TARGET_CONFIRMED'
             and gate.provider_principal_fingerprint =
               certified_dispatch.transition_intent->>'legacyPrincipalFingerprint'
         )
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_DRIVE_ACL_REHEARSAL_CERTIFICATION_REQUIRED';
  end if;
end;
$$;

-- ACL restoration and admission reopening are one transaction in the final
-- ABORTING operation above.  The inherited standalone reopen RPC could create
-- a writer-plus-CLOSED or reader-plus-OPEN gap and is therefore permanently
-- non-callable in the v4 contract.
create or replace function public.reopen_production_scoring_admission(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_SCORING_ADMISSION_REOPEN_REQUIRES_ATOMIC_ACL_RESTORE';
end;
$$;

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
  perform production_control.assert_exact_cutover_resource_scope(input, true);
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

revoke all on table
  production_control.google_writer_provider_fence_install_aborts
  from public, anon, authenticated, service_role;
grant select on table
  production_control.google_writer_provider_fence_install_aborts
  to service_role;
revoke all on table
  production_control.google_writer_provider_fence_install_dispatches
  from public, anon, authenticated, service_role;
grant select on table
  production_control.google_writer_provider_fence_install_dispatches
  to service_role;
revoke all on table
  production_control.google_writer_provider_fence_abort_dispatches
  from public, anon, authenticated, service_role;
grant select on table
  production_control.google_writer_provider_fence_abort_dispatches
  to service_role;
revoke all on table
  production_control.google_writer_provider_fence_settlement_observations
  from public, anon, authenticated, service_role;
grant select on table
  production_control.google_writer_provider_fence_settlement_observations
  to service_role;
revoke all on table
  production_control.google_writer_provider_fence_acl_dispatch_results
  from public, anon, authenticated, service_role;
grant select on table
  production_control.google_writer_provider_fence_acl_dispatch_results
  to service_role;
revoke all on table
  production_control.vercel_writer_critical_waf_epochs
  from public, anon, authenticated, service_role;
grant select on table
  production_control.vercel_writer_critical_waf_epochs
  to service_role;
revoke all on table
  production_control.vercel_writer_critical_waf_observations
  from public, anon, authenticated, service_role;
grant select on table
  production_control.vercel_writer_critical_waf_observations
  to service_role;
revoke all on table
  production_control.vercel_writer_critical_waf_dispatches
  from public, anon, authenticated, service_role;
grant select on table
  production_control.vercel_writer_critical_waf_dispatches
  to service_role;
revoke all on table
  production_control.vercel_writer_critical_waf_dispatch_results
  from public, anon, authenticated, service_role;
grant select on table
  production_control.vercel_writer_critical_waf_dispatch_results
  to service_role;

revoke all on function
  production_control.guard_scoring_admission_against_provider_fence()
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.google_writer_provider_fence_abort_evidence_hash(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.scoring_write_started_no_write_evidence_hash(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.insert_google_writer_provider_fence_settlement_observation(
    uuid, text, jsonb
  ) from public, anon, authenticated, service_role;
revoke all on function
  production_control.google_writer_provider_fence_response(
    production_control.google_writer_provider_fences, boolean
  ) from public, anon, authenticated, service_role;
revoke all on function
  production_control.google_drive_acl_transition_intent_fingerprint_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.google_drive_acl_transition_proof_fingerprint_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.insert_google_writer_provider_fence_verification(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_current_google_writer_provider_fence(
    uuid, uuid, text, boolean
  ) from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_current_external_scoring_fence(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_certified_google_writer_fence_rehearsal(text)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.guard_vercel_writer_critical_waf_row()
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.vercel_writer_critical_waf_epoch_response(
    production_control.vercel_writer_critical_waf_epochs, boolean
  ) from public, anon, authenticated, service_role;
revoke all on function
  production_control.insert_vercel_writer_critical_waf_observation(
    uuid, jsonb, uuid, text, text, uuid
  ) from public, anon, authenticated, service_role;

revoke all on function public.begin_production_scoring_ingress_v2(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_production_scoring_ingress(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.mark_production_scoring_ingress_write_started(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.finish_production_google_writer_provider_fence_install(jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.begin_production_scoring_ingress_v3(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_production_scoring_ingress_v3(jsonb)
  to service_role;
revoke all on function
  public.mark_production_scoring_ingress_write_started_v3(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.mark_production_scoring_ingress_write_started_v3(jsonb)
  to service_role;
revoke all on function
  public.record_production_google_writer_provider_fence_settlement(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.record_production_google_writer_provider_fence_settlement(jsonb)
  to service_role;
revoke all on function
  public.record_production_google_writer_acl_dispatch_result(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.record_production_google_writer_acl_dispatch_result(jsonb)
  to service_role;
revoke all on function
  public.inspect_production_google_writer_provider_fence(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.inspect_production_google_writer_provider_fence(jsonb)
  to service_role;
revoke all on function
  public.finish_close_production_google_writer_provider_fence_install(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.finish_close_production_google_writer_provider_fence_install(jsonb)
  to service_role;
revoke all on function
  public.begin_production_google_writer_provider_fence_install_dispatch(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.begin_production_google_writer_provider_fence_install_dispatch(jsonb)
  to service_role;
revoke all on function
  public.bind_production_google_writer_provider_fence_rollback_waf_epoch(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.bind_production_google_writer_provider_fence_rollback_waf_epoch(jsonb)
  to service_role;
revoke all on function
  public.begin_abort_production_google_writer_provider_fence_install(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.begin_abort_production_google_writer_provider_fence_install(jsonb)
  to service_role;
revoke all on function
  public.begin_production_google_writer_provider_fence_abort_dispatch(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.begin_production_google_writer_provider_fence_abort_dispatch(jsonb)
  to service_role;
revoke all on function
  public.abort_production_google_writer_provider_fence_install(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.abort_production_google_writer_provider_fence_install(jsonb)
  to service_role;
revoke all on function public.reopen_production_scoring_admission(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.begin_production_vercel_writer_critical_waf_epoch(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.begin_production_vercel_writer_critical_waf_epoch(jsonb)
  to service_role;
revoke all on function
  public.inspect_production_vercel_writer_critical_waf_epoch(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.inspect_production_vercel_writer_critical_waf_epoch(jsonb)
  to service_role;
revoke all on function
  public.begin_production_vercel_writer_critical_waf_dispatch(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.begin_production_vercel_writer_critical_waf_dispatch(jsonb)
  to service_role;
revoke all on function
  public.mark_production_vercel_writer_critical_waf_dispatch_started(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.mark_production_vercel_writer_critical_waf_dispatch_started(jsonb)
  to service_role;
revoke all on function
  public.record_production_vercel_writer_critical_waf_dispatch_result(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.record_production_vercel_writer_critical_waf_dispatch_result(jsonb)
  to service_role;
revoke all on function
  public.record_production_vercel_writer_critical_waf_reattestation(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.record_production_vercel_writer_critical_waf_reattestation(jsonb)
  to service_role;
revoke all on function
  public.finalize_production_google_writer_fence_waf_restore(
    jsonb
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.finalize_production_google_writer_fence_waf_restore(
    jsonb
  ) to service_role;

comment on function public.begin_production_scoring_ingress_v3(jsonb)
is 'Only application-callable Production legacy admission BEGIN: returns the authoritative database expiry and binds LEGACY_PROVIDER_FENCEABLE before provider dispatch.';
comment on function
  public.mark_production_scoring_ingress_write_started_v3(jsonb)
is 'Only application-callable Production provider-dispatch MARK: binds the exact v3 lease capability, database expiry, provider credential class, and durable WRITE_STARTED or expired PROVEN_NO_WRITE result.';
comment on function
  public.record_production_google_writer_provider_fence_settlement(jsonb)
is 'Records durable ACL_READER_CONFIRMED and delayed SETTLEMENT_READBACK_1 observations while the provider fence holds legacy admission; final readback is consumed atomically by finish-and-close.';
comment on function
  public.finish_close_production_google_writer_provider_fence_install(jsonb)
is 'Atomically verifies and binds the provider fence, records external evidence, and transitions Google admission OPEN to CLOSING under the exclusive admission lock.';
comment on function
  public.begin_production_google_writer_provider_fence_install_dispatch(jsonb)
is 'Issues the single non-replayable 15-second provider-install dispatch receipt while the exact INSTALLING admission reservation and optimistic control revisions remain valid.';
comment on function
  public.begin_abort_production_google_writer_provider_fence_install(jsonb)
is 'Atomically changes INSTALLING to reservation-holding ABORTING and records the provider quiescence horizon before any external restoration may begin.';
comment on function
  public.begin_production_google_writer_provider_fence_abort_dispatch(jsonb)
is 'Exclusively issues the one non-replayable ACL writer-restore executor window. A lost or ambiguous Drive response has no timer-based terminality: UNKNOWN retains the WAF and reservation, forbids redispatch, and requires same-dispatch exact target readback or owner/provider recovery.';
comment on function
  public.abort_production_google_writer_provider_fence_install(jsonb)
is 'Atomically finalizes ABORTING, releases its reservation, and reopens closed Google admission only after the same restore dispatch is durably TARGET_CONFIRMED with exact fresh writer/canEdit/canShare proof and the global writer-stop age is at least 1810 seconds. The 1810-second horizon bounds old application invocations, not Drive outcome ambiguity.';

notify pgrst, 'reload schema';

commit;
