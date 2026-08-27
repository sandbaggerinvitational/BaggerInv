-- Step 11.6 all-project Vercel provider inventory v3.
--
-- This migration is deliberately dormant. It replaces only the provider-
-- evidence contract used by the Step 11.6/12 operator; it does not stage a
-- release, close legacy admission, change scoring or identity authority,
-- enable Supabase ingress, or enable workers.
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
       where value.status in ('INSTALLING', 'INSTALLED', 'REMOVAL_AUTHORIZED')
     )
     or exists (
       select 1
       from production_control.scoring_external_fence_evidence value
       where value.revoked_at is null and value.expires_at > pg_catalog.now()
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_PROVIDER_INVENTORY_V3_MIGRATION_STATE_INVALID';
  end if;
end;
$migration_preflight$;

alter table production_control.vercel_provider_attestations
  add column provider_inventory_schema text,
  add column retained_origin_inventory_count integer,
  add column retained_origin_inventory_fingerprint text,
  add column retained_provider_inventory_count integer,
  add column retained_provider_inventory_fingerprint text,
  add column live_provider_inventory_count integer,
  add column live_provider_inventory_fingerprint text,
  add column routing_rule_all_method_fence_required_host_count integer,
  add column routing_rule_all_method_fence_required_hosts_fingerprint text,
  add column routing_rule_all_method_fence_required_path_count integer,
  add column routing_rule_all_method_fence_required_paths_fingerprint text,
  add column abandoned_at timestamptz;

alter table production_control.vercel_provider_attestation_challenges
  add column abandonment_reason text check (
    abandonment_reason is null or abandonment_reason in (
      'EXPIRED_UNCONSUMED_BEGIN_SUPERSEDED',
      'EXPIRED_UNCONSUMED_FINALIZE_SUPERSEDED',
      'EXPIRED_CONSUMED_UNBOUND_PROVIDER_ATTESTATION_SUPERSEDED'
    )
  );

alter table production_control.vercel_writer_quiesce_evidence
  add column provider_inventory_schema text,
  add column retained_provider_inventory_count integer,
  add column retained_provider_inventory_fingerprint text,
  add column live_provider_inventory_count integer,
  add column live_provider_inventory_fingerprint text,
  add column routing_rule_all_method_fence_required_host_count integer,
  add column routing_rule_all_method_fence_required_hosts_fingerprint text,
  add column routing_rule_all_method_fence_required_path_count integer,
  add column routing_rule_all_method_fence_required_paths_fingerprint text;

-- Terminal provider recovery preserves every challenge/attestation row while
-- releasing only the stage-scoped identities needed by an all-new retry.
alter table production_control.vercel_provider_attestation_challenges
  drop constraint vercel_provider_attestation_challenges_status_check,
  drop constraint vercel_provider_attestation_challenges_check2;

alter table production_control.vercel_provider_attestation_challenges
  add constraint vercel_provider_attestation_challenges_status_check check (
    status in ('ISSUED', 'CONSUMED', 'ABANDONED')
  ),
  add constraint vercel_provider_attestation_challenges_check2 check (
    (status = 'ISSUED' and consumed_at is null
      and consumed_attestation_id is null and consume_request_id is null
      and consume_request_fingerprint is null and consume_payload_hash is null
      and abandon_request_id is null and abandon_request_fingerprint is null
      and abandon_payload_hash is null and abandoned_at is null
      and abandonment_reason is null)
    or (status = 'CONSUMED' and consumed_at is not null
      and consumed_attestation_id is not null and consume_request_id is not null
      and consume_request_fingerprint is not null
      and consume_payload_hash is not null and abandon_request_id is null
      and abandon_request_fingerprint is null and abandon_payload_hash is null
      and abandoned_at is null and abandonment_reason is null)
    or (status = 'ABANDONED' and abandon_request_id is not null
      and abandon_request_fingerprint is not null
      and abandon_payload_hash is not null and abandoned_at is not null
      and (
        (consumed_at is null and consumed_attestation_id is null
          and consume_request_id is null and consume_request_fingerprint is null
          and consume_payload_hash is null and abandoned_at >= expires_at
          and ((stage = 'BEGIN' and (abandonment_reason is null
            or abandonment_reason =
              'EXPIRED_UNCONSUMED_BEGIN_SUPERSEDED'))
            or (stage = 'FINALIZE' and abandonment_reason =
              'EXPIRED_UNCONSUMED_FINALIZE_SUPERSEDED')))
        or (consumed_at is not null and consumed_attestation_id is not null
          and consume_request_id is not null
          and consume_request_fingerprint is not null
          and consume_payload_hash is not null and abandonment_reason =
            'EXPIRED_CONSUMED_UNBOUND_PROVIDER_ATTESTATION_SUPERSEDED')
      ))
  );

alter table production_control.vercel_provider_attestations
  drop constraint vercel_provider_attestations_status_check;

do $drop_provider_attestation_state_check$
declare
  constraint_name name;
begin
  select constraint_row.conname into strict constraint_name
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid =
      'production_control.vercel_provider_attestations'::pg_catalog.regclass
    and constraint_row.contype = 'c'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid)
      like '%status = ''RESERVED''%'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid)
      like '%status = ''BOUND''%';
  execute pg_catalog.format(
    'alter table production_control.vercel_provider_attestations drop constraint %I',
    constraint_name
  );
end;
$drop_provider_attestation_state_check$;

alter table production_control.vercel_provider_attestations
  add constraint vercel_provider_attestations_status_check check (
    status in ('RESERVED', 'BOUND', 'ABANDONED')
  ),
  add constraint production_vercel_provider_attestation_state_check check (
    (status = 'RESERVED' and evidence_id is null
      and receipt_request_fingerprint is null and bound_at is null
      and abandoned_at is null)
    or (status = 'BOUND' and evidence_id is not null
      and receipt_request_fingerprint is not null and bound_at is not null
      and abandoned_at is null)
    or (status = 'ABANDONED' and evidence_id is null
      and receipt_request_fingerprint is null and bound_at is null
      and abandoned_at is not null)
  );

do $replace_provider_stage_uniques$
declare
  constraint_name name;
  table_name regclass;
begin
  foreach table_name in array array[
    'production_control.vercel_provider_attestation_challenges'::pg_catalog.regclass,
    'production_control.vercel_provider_attestations'::pg_catalog.regclass
  ] loop
    for constraint_name in
      select constraint_row.conname
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = table_name
        and constraint_row.contype = 'u'
        and (
          constraint_row.conkey = array[
            (select attribute.attnum from pg_catalog.pg_attribute attribute
             where attribute.attrelid = table_name
               and attribute.attname = 'operation_request_id'),
            (select attribute.attnum from pg_catalog.pg_attribute attribute
             where attribute.attrelid = table_name
               and attribute.attname = 'stage')
          ]::smallint[]
          or constraint_row.conkey = array[
            (select attribute.attnum from pg_catalog.pg_attribute attribute
             where attribute.attrelid = table_name
               and attribute.attname = 'evidence_request_id'),
            (select attribute.attnum from pg_catalog.pg_attribute attribute
             where attribute.attrelid = table_name
               and attribute.attname = 'stage')
          ]::smallint[]
        )
    loop
      execute pg_catalog.format(
        'alter table %s drop constraint %I', table_name, constraint_name
      );
    end loop;
  end loop;
end;
$replace_provider_stage_uniques$;

create unique index vercel_provider_challenge_active_operation_stage_idx
  on production_control.vercel_provider_attestation_challenges(
    operation_request_id, stage
  ) where status <> 'ABANDONED';
create unique index vercel_provider_challenge_active_evidence_stage_idx
  on production_control.vercel_provider_attestation_challenges(
    evidence_request_id, stage
  ) where status <> 'ABANDONED';
create unique index vercel_provider_attestation_active_operation_stage_idx
  on production_control.vercel_provider_attestations(
    operation_request_id, stage
  ) where status <> 'ABANDONED';
create unique index vercel_provider_attestation_active_evidence_stage_idx
  on production_control.vercel_provider_attestations(
    evidence_request_id, stage
  ) where status <> 'ABANDONED';


-- Drop only the six historical single-column checks superseded by the paired
-- v1/v3 receipt contract.  Resolve their generated names through conkey so
-- PostgreSQL identifier truncation cannot make this migration version brittle.
do $drop_historical_quiesce_checks$
declare
  constraint_name name;
begin
  for constraint_name in
    select constraint_row.conname
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and constraint_row.conkey = array[attribute.attnum]::smallint[]
    where constraint_row.conrelid =
      'production_control.vercel_writer_quiesce_evidence'::pg_catalog.regclass
      and constraint_row.contype = 'c'
      and attribute.attname in (
        'origin_inventory_count', 'origin_inventory_fingerprint',
        'credential_confinement_evidence_schema',
        'credential_confinement_record_count',
        'credential_confinement_records_fingerprint',
        'credential_confinement_evidence_fingerprint'
      )
  loop
    execute pg_catalog.format(
      'alter table production_control.vercel_writer_quiesce_evidence drop constraint %I',
      constraint_name
    );
  end loop;
end;
$drop_historical_quiesce_checks$;

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
    )
  );

do $drop_historical_attestation_checks$
declare
  constraint_name name;
begin
  for constraint_name in
    select constraint_row.conname
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and constraint_row.conkey = array[attribute.attnum]::smallint[]
    where constraint_row.conrelid =
      'production_control.vercel_provider_attestations'::pg_catalog.regclass
      and constraint_row.contype = 'c'
      and attribute.attname in (
        'credential_confinement_evidence_schema',
        'credential_confinement_record_count',
        'credential_confinement_records_fingerprint',
        'credential_confinement_evidence_fingerprint'
      )
  loop
    execute pg_catalog.format(
      'alter table production_control.vercel_provider_attestations drop constraint %I',
      constraint_name
    );
  end loop;
end;
$drop_historical_attestation_checks$;

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
    )
  );

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
  if pg_catalog.jsonb_typeof(input) is distinct from 'object'
     or input->>'provider_inventory_schema' is distinct from
       'step11-6-production-origin-inventory-v3'
     or pg_catalog.jsonb_typeof(
       input->'retained_provider_inventory_count'
     ) is distinct from 'number'
     or input->>'retained_provider_inventory_count' is distinct from '1291'
     or input->>'retained_provider_inventory_fingerprint' is distinct from
       '6488da5c86e50bd0c524a94a8c8f97c1aeb8576393fc14d68a7bd76ebe338692'
     or pg_catalog.jsonb_typeof(
       input->'live_provider_inventory_count'
     ) is distinct from 'number'
     or input->>'live_provider_inventory_count' not in ('1291', '1292')
     or coalesce(input->>'live_provider_inventory_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or input->>'credential_confinement_evidence_schema' is distinct from
       'step11-6-production-google-credential-confinement-v2'
     or pg_catalog.jsonb_typeof(
       input->'credential_confinement_record_count'
     ) is distinct from 'number'
     or input->>'credential_confinement_record_count' is distinct from '1291'
     or input->>'credential_confinement_records_fingerprint' is distinct from
       '9ce65239f41086f56ea126e2491afe36ae90e85172a8536706f549912b27979b'
     or input->>'credential_confinement_evidence_fingerprint' is distinct from
       '071ca9163f6a1033e17136ace4c82b3163aa7a1c29900300ddafeeda5b7bb133'
     or (include_retained_origin and (
       pg_catalog.jsonb_typeof(
         input->'retained_origin_inventory_count'
       ) is distinct from 'number'
       or input->>'retained_origin_inventory_count' is distinct from '1291'
       or input->>'retained_origin_inventory_fingerprint' is distinct from
         'd238c5eeefef4606e0a05c2d0dbcee1a2b29cd07a2dd480435c0e75a0c3a91a6'
     ))
     or (include_routing_rule and (
       pg_catalog.jsonb_typeof(
         input->'routing_rule_all_method_fence_required_host_count'
       ) is distinct from 'number'
       or input->>'routing_rule_all_method_fence_required_host_count'
         is distinct from '8'
       or input->>'routing_rule_all_method_fence_required_hosts_fingerprint'
         is distinct from
           '62f14a6635bc9ec16ce681e04b17bbd0f39e9ff55a858bbcb75f4aa75bc3bc4d'
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
      message = 'PRODUCTION_PROVIDER_INVENTORY_V3_BINDING_MISMATCH';
  end if;
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
     or record_count <> 1291
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
       where value->>3 = 'PROJECT_PREVIEW') <> 833
     or not (normalized @> pg_catalog.jsonb_build_array(
       '["dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2","561a61946be3536c7e32b46be53e4683cbb45579","https://bagger-drmix94o0-sandbagger-invitational.vercel.app","PRODUCTION_TARGET","READY","0383e746abde16275626a8bcd41a38853eb9fe6e2cb036ef7658d21c23d9f5e8"]'::jsonb
     ))
     or not (normalized @> pg_catalog.jsonb_build_array(
       '["dpl_CBgDhovX4cfQx15EJWWvm6Kti25j","be5531faca009e26617496e47831f365a1b4997b","https://bagger-mribo6cqh-sandbagger-invitational.vercel.app","PROJECT_PREVIEW","READY","0c8b213bcad5397731982762bf178cc961254b79a6be5a3b75e71e547ef9dc71"]'::jsonb
     ))
     or not (normalized @> pg_catalog.jsonb_build_array(
       '["dpl_2oK3GmMa8f93wqjHNp1Gp2Y6Paox","a0b79cdef3a34d640e9411035792bd1e91989566","https://bagger-pmt7catuz-sandbagger-invitational.vercel.app","PROJECT_PREVIEW","READY","acb7fa3de11c8e6e5704c41a22b1693b42428b7b70c1d9ed73763ea6330ddb8e"]'::jsonb
     ))
     or production_control.vercel_origin_inventory_fingerprint(normalized)
       is distinct from
         'd238c5eeefef4606e0a05c2d0dbcee1a2b29cd07a2dd480435c0e75a0c3a91a6'
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
  if candidate_deployment_target not in ('PREVIEW', 'PRODUCTION')
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
  retained_candidate_scope := case candidate_deployment_target
    when 'PREVIEW' then 'PROJECT_PREVIEW'
    else 'PRODUCTION_TARGET'
  end;
  dynamic_candidate_scope := case candidate_deployment_target
    when 'PREVIEW' then 'PROJECT_PREVIEW'
    else 'CUTOVER_PRODUCTION_CANDIDATE'
  end;

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

-- Additional receipt/RPC replacements are appended below. They preserve each
-- existing signature/OID while binding the v3 provider and v2 credential
-- contracts.

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
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'found', true,
    'code', 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_' || value.status,
    'challenge_id', value.challenge_id,
    'challenge_request_id', value.challenge_request_id,
    'operation_request_id', value.operation_request_id,
    'evidence_request_id', value.evidence_request_id,
    'challenge_request_fingerprint', value.challenge_request_fingerprint,
    'stage', value.stage,
    'purpose', value.purpose,
    'status', value.status,
    'vercel_project_id', value.vercel_project_id,
    'vercel_team_id', value.vercel_team_id,
    'candidate_deployment_id', value.candidate_deployment_id,
    'candidate_deployment_commit', value.candidate_deployment_commit,
    'candidate_deployment_target', value.candidate_deployment_target,
    'candidate_alias_origin', value.candidate_alias_origin,
    'candidate_immutable_origin', value.candidate_immutable_origin,
    'routing_rule_id', value.routing_rule_id,
    'routing_rule_config_version', value.routing_rule_config_version,
    'routing_rule_scope', value.routing_rule_scope,
    'issued_at', value.issued_at,
    'expires_at', value.expires_at,
    'consumed_at', value.consumed_at,
    'consumed_attestation_id', value.consumed_attestation_id,
    'consumed_attestation_fingerprint', (
      select attestation.attestation_fingerprint
      from production_control.vercel_provider_attestations attestation
      where attestation.attestation_id = value.consumed_attestation_id
    ),
    'consumed_provider_attestation', (
      select pg_catalog.jsonb_build_object(
        'attestation_id', attestation.attestation_id,
        'attestation_fingerprint', attestation.attestation_fingerprint,
        'challenge_id', attestation.challenge_id,
        'challenge_request_fingerprint',
          attestation.challenge_request_fingerprint,
        'operation_request_id', attestation.operation_request_id,
        'evidence_request_id', attestation.evidence_request_id,
        'request_fingerprint', attestation.request_fingerprint,
        'stage', attestation.stage,
        'purpose', attestation.purpose,
        'status', attestation.status,
        'signer_key_fingerprint', attestation.signer_key_fingerprint,
        'signer_key_version', attestation.signer_key_version,
        'signature_verified', attestation.signature_verified,
        'vercel_project_id', attestation.vercel_project_id,
        'vercel_team_id', attestation.vercel_team_id,
        'candidate_deployment_id', attestation.candidate_deployment_id,
        'candidate_deployment_commit', attestation.candidate_deployment_commit,
        'candidate_deployment_target', attestation.candidate_deployment_target,
        'routing_rule_id', attestation.routing_rule_id,
        'routing_rule_config_version',
          attestation.routing_rule_config_version,
        'routing_rule_etag', attestation.routing_rule_etag,
        'routing_rule_fingerprint', attestation.routing_rule_fingerprint,
        'routing_rule_pending_draft_change_count',
          attestation.routing_rule_pending_draft_change_count,
        'live_origin_inventory_count',
          attestation.live_origin_inventory_count,
        'live_origin_inventory_fingerprint',
          attestation.live_origin_inventory_fingerprint,
        'live_origin_inventory', attestation.live_origin_inventory
      ) || pg_catalog.jsonb_build_object(
        'provider_inventory_schema',
          attestation.provider_inventory_schema,
        'retained_origin_inventory_count',
          attestation.retained_origin_inventory_count,
        'retained_origin_inventory_fingerprint',
          attestation.retained_origin_inventory_fingerprint,
        'retained_provider_inventory_count',
          attestation.retained_provider_inventory_count,
        'retained_provider_inventory_fingerprint',
          attestation.retained_provider_inventory_fingerprint,
        'live_provider_inventory_count',
          attestation.live_provider_inventory_count,
        'live_provider_inventory_fingerprint',
          attestation.live_provider_inventory_fingerprint,
        'routing_rule_all_method_fence_required_host_count',
          attestation.routing_rule_all_method_fence_required_host_count,
        'routing_rule_all_method_fence_required_hosts_fingerprint',
          attestation.routing_rule_all_method_fence_required_hosts_fingerprint,
        'routing_rule_all_method_fence_required_path_count',
          attestation.routing_rule_all_method_fence_required_path_count,
        'routing_rule_all_method_fence_required_paths_fingerprint',
          attestation.routing_rule_all_method_fence_required_paths_fingerprint,
        'redacted_environment_scope_fingerprint',
          attestation.redacted_environment_scope_fingerprint,
        'credential_confinement_evidence_schema',
          attestation.credential_confinement_evidence_schema,
        'credential_confinement_record_count',
          attestation.credential_confinement_record_count,
        'credential_confinement_records_fingerprint',
          attestation.credential_confinement_records_fingerprint,
        'credential_confinement_evidence_fingerprint',
          attestation.credential_confinement_evidence_fingerprint,
        'provider_observed_at', attestation.provider_observed_at,
        'binding_expires_at', attestation.binding_expires_at,
        'bound_at', attestation.bound_at,
        'abandoned_at', attestation.abandoned_at
      )
      from production_control.vercel_provider_attestations attestation
      where attestation.attestation_id = value.consumed_attestation_id
    ),
    'consume_request_id', value.consume_request_id,
    'abandon_request_id', value.abandon_request_id,
    'abandon_request_fingerprint', value.abandon_request_fingerprint,
    'abandonment_reason', value.abandonment_reason,
    'abandoned_at', value.abandoned_at,
    'idempotent', was_idempotent
  )
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
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'found', true,
    'code', 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_' || value.status,
    'attestation_id', value.attestation_id,
    'attestation_fingerprint', value.attestation_fingerprint,
    'challenge_id', value.challenge_id,
    'challenge_request_fingerprint', value.challenge_request_fingerprint,
    'operation_request_id', value.operation_request_id,
    'evidence_request_id', value.evidence_request_id,
    'request_fingerprint', value.request_fingerprint,
    'receipt_request_fingerprint', value.receipt_request_fingerprint,
    'stage', value.stage,
    'purpose', value.purpose,
    'status', value.status,
    'signer_key_fingerprint', value.signer_key_fingerprint,
    'signer_key_version', value.signer_key_version,
    'signature_verified', value.signature_verified,
    'vercel_project_id', value.vercel_project_id,
    'vercel_team_id', value.vercel_team_id,
    'candidate_deployment_id', value.candidate_deployment_id,
    'candidate_deployment_commit', value.candidate_deployment_commit,
    'candidate_deployment_target', value.candidate_deployment_target,
    'routing_rule_id', value.routing_rule_id,
    'routing_rule_config_version', value.routing_rule_config_version,
    'routing_rule_etag', value.routing_rule_etag,
    'routing_rule_fingerprint', value.routing_rule_fingerprint,
    'routing_rule_pending_draft_change_count',
      value.routing_rule_pending_draft_change_count,
    'live_origin_inventory_count', value.live_origin_inventory_count,
    'live_origin_inventory_fingerprint',
      value.live_origin_inventory_fingerprint,
    'live_origin_inventory', value.live_origin_inventory
  ) || pg_catalog.jsonb_build_object(
    'provider_inventory_schema', value.provider_inventory_schema,
    'retained_origin_inventory_count', value.retained_origin_inventory_count,
    'retained_origin_inventory_fingerprint',
      value.retained_origin_inventory_fingerprint,
    'retained_provider_inventory_count',
      value.retained_provider_inventory_count,
    'retained_provider_inventory_fingerprint',
      value.retained_provider_inventory_fingerprint,
    'live_provider_inventory_count', value.live_provider_inventory_count,
    'live_provider_inventory_fingerprint',
      value.live_provider_inventory_fingerprint,
    'routing_rule_all_method_fence_required_host_count',
      value.routing_rule_all_method_fence_required_host_count,
    'routing_rule_all_method_fence_required_hosts_fingerprint',
      value.routing_rule_all_method_fence_required_hosts_fingerprint,
    'routing_rule_all_method_fence_required_path_count',
      value.routing_rule_all_method_fence_required_path_count,
    'routing_rule_all_method_fence_required_paths_fingerprint',
      value.routing_rule_all_method_fence_required_paths_fingerprint,
    'redacted_environment_scope_fingerprint',
      value.redacted_environment_scope_fingerprint,
    'credential_confinement_evidence_schema',
      value.credential_confinement_evidence_schema,
    'credential_confinement_record_count',
      value.credential_confinement_record_count,
    'credential_confinement_records_fingerprint',
      value.credential_confinement_records_fingerprint,
    'credential_confinement_evidence_fingerprint',
      value.credential_confinement_evidence_fingerprint,
    'provider_observed_at', value.provider_observed_at,
    'binding_expires_at', value.binding_expires_at,
    'bound_at', value.bound_at,
    'abandoned_at', value.abandoned_at,
    'idempotent', was_idempotent
  )
$$;

-- Retried BEGIN/FINALIZE challenges use all-new request identities.  Terminal
-- ABANDONED rows remain immutable evidence but no longer block the one active
-- challenge for a stage.
create or replace function public.issue_production_vercel_provider_attestation_challenge(
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
       and input->>'candidate_deployment_target' <> 'PRODUCTION') then
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

create or replace function public.consume_production_vercel_provider_attestation_challenge(
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
  begin_attestation production_control.vercel_provider_attestations%rowtype;
  reserved production_control.vercel_provider_attestations%rowtype;
  evidence production_control.vercel_writer_quiesce_evidence%rowtype;
  consume_request_identifier uuid;
  observed_at_value timestamptz;
  reserved_at_value timestamptz := pg_catalog.now();
  payload_hash text := production_control.cutover_payload_hash(input);
  normalized_live_inventory jsonb;
  live_inventory_fingerprint text;
  provider_claim jsonb := input->'provider_attestation';
  allowed_provider_keys text[] := array[
    'attestation_id', 'attestation_fingerprint',
    'signer_key_fingerprint', 'signer_key_version', 'stage', 'purpose',
    'challenge_id', 'challenge_request_fingerprint', 'operation_request_id',
    'request_fingerprint', 'signature_verified', 'vercel_project_id',
    'vercel_team_id', 'candidate_deployment_id',
    'candidate_deployment_commit', 'candidate_deployment_target',
    'routing_rule_id', 'routing_rule_config_version', 'routing_rule_etag',
    'routing_rule_fingerprint', 'routing_rule_pending_draft_change_count',
    'live_origin_inventory_count',
    'live_origin_inventory_fingerprint',
    'provider_inventory_schema',
    'retained_origin_inventory_count',
    'retained_origin_inventory_fingerprint',
    'retained_provider_inventory_count',
    'retained_provider_inventory_fingerprint',
    'live_provider_inventory_count',
    'live_provider_inventory_fingerprint',
    'routing_rule_all_method_fence_required_host_count',
    'routing_rule_all_method_fence_required_hosts_fingerprint',
    'routing_rule_all_method_fence_required_path_count',
    'routing_rule_all_method_fence_required_paths_fingerprint',
    'redacted_environment_scope_fingerprint',
    'credential_confinement_evidence_schema',
    'credential_confinement_record_count',
    'credential_confinement_records_fingerprint',
    'credential_confinement_evidence_fingerprint', 'provider_observed_at'
  ];
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'consume_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'challenge_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'challenge_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'evidence_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.upper(coalesce(input->>'purpose', ''))
       not in ('REHEARSAL', 'CUTOVER')
     or pg_catalog.upper(coalesce(input->>'stage', ''))
       not in ('BEGIN', 'FINALIZE')
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or pg_catalog.jsonb_typeof(input->'origin_inventory')
       is distinct from 'array'
     or pg_catalog.jsonb_typeof(input->'live_origin_inventory')
       is distinct from 'array'
     or pg_catalog.jsonb_typeof(provider_claim) is distinct from 'object'
     or not (provider_claim ?& allowed_provider_keys)
     or (provider_claim - allowed_provider_keys) is distinct from '{}'::jsonb
     or coalesce(provider_claim->>'attestation_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(provider_claim->>'attestation_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(provider_claim->>'signer_key_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or provider_claim->>'signer_key_version' is distinct from
       'STEP11_6_VERCEL_ATTESTER_V1'
     or provider_claim->>'signature_verified' is distinct from 'true'
     or coalesce(provider_claim->>'request_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(provider_claim->>'routing_rule_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(
       provider_claim->'routing_rule_pending_draft_change_count'
     ) is distinct from 'number'
     or provider_claim->>'routing_rule_pending_draft_change_count'
       is distinct from '0'
     or coalesce(provider_claim->>'live_origin_inventory_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(provider_claim->>'redacted_environment_scope_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(
       provider_claim->'live_origin_inventory_count'
     ) is distinct from 'number'
     or coalesce(provider_claim->>'live_origin_inventory_count', '')
       !~ '^[0-9]+$'
     or coalesce(provider_claim->>'provider_observed_at', '') = ''
     or (provider_claim->>'routing_rule_etag' is not null and (
       pg_catalog.btrim(provider_claim->>'routing_rule_etag') = ''
       or pg_catalog.length(provider_claim->>'routing_rule_etag') > 512
     )) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CONSUME_INPUT_INVALID';
  end if;
  perform production_control.assert_current_provider_inventory_v3(
    provider_claim, true, true
  );

  consume_request_identifier := (input->>'consume_request_id')::uuid;
  observed_at_value := (provider_claim->>'provider_observed_at')::timestamptz;
  perform production_control.assert_exact_vercel_origin_inventory(
    input->'origin_inventory'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict challenge
  from production_control.vercel_provider_attestation_challenges value
  where value.challenge_id = (input->>'challenge_id')::uuid
    and value.challenge_request_id = (input->>'challenge_request_id')::uuid
    and value.operation_request_id = (input->>'operation_request_id')::uuid
    and value.evidence_request_id = (input->>'evidence_request_id')::uuid
    and value.stage = pg_catalog.upper(input->>'stage')
  for update;

  if challenge.status = 'CONSUMED' then
    select * into strict reserved
    from production_control.vercel_provider_attestations value
    where value.attestation_id = challenge.consumed_attestation_id;
    if challenge.consume_request_id is distinct from consume_request_identifier
       or challenge.consume_request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or challenge.consume_payload_hash is distinct from payload_hash
       or reserved.attestation_id is distinct from
         (provider_claim->>'attestation_id')::uuid
       or reserved.attestation_fingerprint is distinct from
         provider_claim->>'attestation_fingerprint' then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CONSUME_IDEMPOTENCY_CONFLICT';
    end if;
    return production_control.vercel_provider_attestation_response(
      reserved, true
    );
  end if;
  if challenge.status = 'ABANDONED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDONED_TERMINAL';
  end if;

  if challenge.expires_at < reserved_at_value then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_EXPIRED';
  end if;
  if challenge.purpose is distinct from
       pg_catalog.upper(input->>'purpose')
     or challenge.candidate_deployment_id is distinct from
       provider_claim->>'candidate_deployment_id'
     or challenge.candidate_deployment_commit is distinct from
       pg_catalog.lower(provider_claim->>'candidate_deployment_commit')
     or challenge.candidate_deployment_target is distinct from
       provider_claim->>'candidate_deployment_target'
     or challenge.authenticated_actor_fingerprint is distinct from
       input->>'authenticated_actor_fingerprint'
     or challenge.actor_id is distinct from
       pg_catalog.left(input->>'actor_id', 160)
     or challenge.vercel_project_id is distinct from
       provider_claim->>'vercel_project_id'
     or challenge.vercel_team_id is distinct from
       provider_claim->>'vercel_team_id'
     or challenge.routing_rule_id is distinct from
       provider_claim->>'routing_rule_id'
     or challenge.routing_rule_config_version is distinct from
       provider_claim->>'routing_rule_config_version'
     or challenge.challenge_id is distinct from
       (provider_claim->>'challenge_id')::uuid
     or challenge.challenge_request_fingerprint is distinct from
       provider_claim->>'challenge_request_fingerprint'
     or challenge.operation_request_id is distinct from
       (provider_claim->>'operation_request_id')::uuid
     or challenge.stage is distinct from provider_claim->>'stage'
     or challenge.purpose is distinct from provider_claim->>'purpose'
     or provider_claim->>'candidate_deployment_id' is distinct from
       input->>'candidate_deployment_id'
     or pg_catalog.lower(provider_claim->>'candidate_deployment_commit')
       is distinct from pg_catalog.lower(input->>'candidate_deployment_commit')
     or provider_claim->>'candidate_deployment_target' is distinct from
       input->>'candidate_deployment_target' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_MISMATCH';
  end if;
  if observed_at_value < reserved_at_value - interval '120 seconds'
     or observed_at_value > reserved_at_value + interval '30 seconds' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_STALE';
  end if;

  perform production_control.assert_exact_vercel_live_inventory(
    input->'origin_inventory', input->'live_origin_inventory',
    challenge.candidate_deployment_id,
    challenge.candidate_deployment_commit,
    challenge.candidate_immutable_origin,
    challenge.candidate_deployment_target
  );
  normalized_live_inventory :=
    production_control.normalized_vercel_origin_inventory(
      input->'live_origin_inventory'
    );
  live_inventory_fingerprint :=
    production_control.vercel_origin_inventory_fingerprint(
      normalized_live_inventory
    );
  if (provider_claim->>'live_origin_inventory_count')::integer is distinct from
       pg_catalog.jsonb_array_length(normalized_live_inventory)
     or (provider_claim->>'live_provider_inventory_count')::integer
       is distinct from pg_catalog.jsonb_array_length(normalized_live_inventory)
     or provider_claim->>'live_origin_inventory_fingerprint' is distinct from
       live_inventory_fingerprint then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_LIVE_INVENTORY_MISMATCH';
  end if;

  if challenge.stage = 'FINALIZE' then
    select * into strict evidence
    from production_control.vercel_writer_quiesce_evidence value
    where value.evidence_request_id = challenge.evidence_request_id
    for update;
    select * into strict begin_attestation
    from production_control.vercel_provider_attestations value
    where value.evidence_request_id = challenge.evidence_request_id
      and value.stage = 'BEGIN'
      and value.status = 'BOUND';
    if evidence.status is distinct from 'DRAINING'
       or observed_at_value <= evidence.drain_started_at
       or begin_attestation.attestation_id =
         (provider_claim->>'attestation_id')::uuid
       or begin_attestation.challenge_id = challenge.challenge_id
       or begin_attestation.signer_key_fingerprint is distinct from
         provider_claim->>'signer_key_fingerprint'
       or begin_attestation.signer_key_version is distinct from
         provider_claim->>'signer_key_version'
       or begin_attestation.vercel_project_id is distinct from
         provider_claim->>'vercel_project_id'
       or begin_attestation.vercel_team_id is distinct from
         provider_claim->>'vercel_team_id'
       or begin_attestation.candidate_deployment_id is distinct from
         provider_claim->>'candidate_deployment_id'
       or begin_attestation.candidate_deployment_commit is distinct from
         pg_catalog.lower(provider_claim->>'candidate_deployment_commit')
       or begin_attestation.candidate_deployment_target is distinct from
         provider_claim->>'candidate_deployment_target'
       or begin_attestation.routing_rule_id is distinct from
         provider_claim->>'routing_rule_id'
       or begin_attestation.routing_rule_config_version is distinct from
         provider_claim->>'routing_rule_config_version'
       or begin_attestation.routing_rule_etag is distinct from
         provider_claim->>'routing_rule_etag'
       or begin_attestation.routing_rule_fingerprint is distinct from
         provider_claim->>'routing_rule_fingerprint'
       or begin_attestation.routing_rule_pending_draft_change_count is distinct from
         (provider_claim->>'routing_rule_pending_draft_change_count')::integer
       or begin_attestation.live_origin_inventory is distinct from
         normalized_live_inventory
       or begin_attestation.live_origin_inventory_fingerprint is distinct from
         live_inventory_fingerprint
       or begin_attestation.provider_inventory_schema is distinct from
         provider_claim->>'provider_inventory_schema'
       or begin_attestation.retained_origin_inventory_count is distinct from
         (provider_claim->>'retained_origin_inventory_count')::integer
       or begin_attestation.retained_origin_inventory_fingerprint is distinct from
         provider_claim->>'retained_origin_inventory_fingerprint'
       or begin_attestation.retained_provider_inventory_count is distinct from
         (provider_claim->>'retained_provider_inventory_count')::integer
       or begin_attestation.retained_provider_inventory_fingerprint is distinct from
         provider_claim->>'retained_provider_inventory_fingerprint'
       or begin_attestation.live_provider_inventory_count is distinct from
         (provider_claim->>'live_provider_inventory_count')::integer
       or begin_attestation.live_provider_inventory_fingerprint is distinct from
         provider_claim->>'live_provider_inventory_fingerprint'
       or begin_attestation.routing_rule_all_method_fence_required_host_count
         is distinct from
           (provider_claim->>'routing_rule_all_method_fence_required_host_count')::integer
       or begin_attestation.routing_rule_all_method_fence_required_hosts_fingerprint
         is distinct from
           provider_claim->>'routing_rule_all_method_fence_required_hosts_fingerprint'
       or begin_attestation.routing_rule_all_method_fence_required_path_count
         is distinct from
           (provider_claim->>'routing_rule_all_method_fence_required_path_count')::integer
       or begin_attestation.routing_rule_all_method_fence_required_paths_fingerprint
         is distinct from
           provider_claim->>'routing_rule_all_method_fence_required_paths_fingerprint'
       or begin_attestation.redacted_environment_scope_fingerprint
         is distinct from
           provider_claim->>'redacted_environment_scope_fingerprint'
       or begin_attestation.credential_confinement_evidence_schema is distinct from
         provider_claim->>'credential_confinement_evidence_schema'
       or begin_attestation.credential_confinement_record_count is distinct from
         (provider_claim->>'credential_confinement_record_count')::integer
       or begin_attestation.credential_confinement_records_fingerprint
         is distinct from
           provider_claim->>'credential_confinement_records_fingerprint'
       or begin_attestation.credential_confinement_evidence_fingerprint
         is distinct from
           provider_claim->>'credential_confinement_evidence_fingerprint' then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_FINALIZE_DRIFT';
    end if;
  end if;

  if exists (
    select 1 from production_control.vercel_provider_attestation_challenges value
    where value.consume_request_id = consume_request_identifier
  ) or exists (
    select 1 from production_control.vercel_provider_attestations value
    where value.attestation_id = (provider_claim->>'attestation_id')::uuid
       or value.attestation_fingerprint =
         provider_claim->>'attestation_fingerprint'
       or value.challenge_id = challenge.challenge_id
       or value.challenge_request_fingerprint =
         provider_claim->>'challenge_request_fingerprint'
       or value.request_fingerprint = provider_claim->>'request_fingerprint'
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_REUSED';
  end if;

  insert into production_control.vercel_provider_attestations (
    attestation_id, status, stage, purpose, attestation_fingerprint,
    signer_key_fingerprint, signer_key_version, challenge_id,
    challenge_request_fingerprint, operation_request_id,
    evidence_request_id, request_fingerprint, signature_verified,
    vercel_project_id, vercel_team_id, candidate_deployment_id,
    candidate_deployment_commit, candidate_deployment_target,
    routing_rule_id, routing_rule_config_version, routing_rule_etag,
    routing_rule_fingerprint, routing_rule_pending_draft_change_count,
    live_origin_inventory_count,
    live_origin_inventory_fingerprint, live_origin_inventory,
    provider_inventory_schema,
    retained_origin_inventory_count, retained_origin_inventory_fingerprint,
    retained_provider_inventory_count, retained_provider_inventory_fingerprint,
    live_provider_inventory_count, live_provider_inventory_fingerprint,
    routing_rule_all_method_fence_required_host_count,
    routing_rule_all_method_fence_required_hosts_fingerprint,
    routing_rule_all_method_fence_required_path_count,
    routing_rule_all_method_fence_required_paths_fingerprint,
    redacted_environment_scope_fingerprint,
    credential_confinement_evidence_schema,
    credential_confinement_record_count,
    credential_confinement_records_fingerprint,
    credential_confinement_evidence_fingerprint,
    provider_observed_at,
    binding_expires_at, recorded_at
  ) values (
    (provider_claim->>'attestation_id')::uuid, 'RESERVED', challenge.stage,
    challenge.purpose, provider_claim->>'attestation_fingerprint',
    provider_claim->>'signer_key_fingerprint',
    provider_claim->>'signer_key_version', challenge.challenge_id,
    provider_claim->>'challenge_request_fingerprint',
    challenge.operation_request_id, challenge.evidence_request_id,
    provider_claim->>'request_fingerprint', true,
    provider_claim->>'vercel_project_id', provider_claim->>'vercel_team_id',
    provider_claim->>'candidate_deployment_id',
    pg_catalog.lower(provider_claim->>'candidate_deployment_commit'),
    provider_claim->>'candidate_deployment_target',
    provider_claim->>'routing_rule_id',
    provider_claim->>'routing_rule_config_version',
    provider_claim->>'routing_rule_etag',
    provider_claim->>'routing_rule_fingerprint',
    (provider_claim->>'routing_rule_pending_draft_change_count')::integer,
    (provider_claim->>'live_origin_inventory_count')::integer,
    live_inventory_fingerprint, normalized_live_inventory,
    provider_claim->>'provider_inventory_schema',
    (provider_claim->>'retained_origin_inventory_count')::integer,
    provider_claim->>'retained_origin_inventory_fingerprint',
    (provider_claim->>'retained_provider_inventory_count')::integer,
    provider_claim->>'retained_provider_inventory_fingerprint',
    (provider_claim->>'live_provider_inventory_count')::integer,
    provider_claim->>'live_provider_inventory_fingerprint',
    (provider_claim->>'routing_rule_all_method_fence_required_host_count')::integer,
    provider_claim->>'routing_rule_all_method_fence_required_hosts_fingerprint',
    (provider_claim->>'routing_rule_all_method_fence_required_path_count')::integer,
    provider_claim->>'routing_rule_all_method_fence_required_paths_fingerprint',
    provider_claim->>'redacted_environment_scope_fingerprint',
    provider_claim->>'credential_confinement_evidence_schema',
    (provider_claim->>'credential_confinement_record_count')::integer,
    provider_claim->>'credential_confinement_records_fingerprint',
    provider_claim->>'credential_confinement_evidence_fingerprint',
    observed_at_value, reserved_at_value + interval '30 minutes',
    reserved_at_value
  ) returning * into reserved;

  update production_control.vercel_provider_attestation_challenges
  set status = 'CONSUMED', consumed_at = reserved_at_value,
      consumed_attestation_id = reserved.attestation_id,
      consume_request_id = consume_request_identifier,
      consume_request_fingerprint = pg_catalog.lower(input->>'request_fingerprint'),
      consume_payload_hash = payload_hash, updated_at = reserved_at_value
  where challenge_id = challenge.challenge_id
  returning * into challenge;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_RESERVED',
    'SCORING_AUTHORITY', '2026', challenge.actor_id,
    challenge.consume_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'attestation_id', reserved.attestation_id,
      'attestation_fingerprint', reserved.attestation_fingerprint,
      'challenge_id', challenge.challenge_id,
      'operation_request_id', challenge.operation_request_id,
      'evidence_request_id', challenge.evidence_request_id,
      'stage', challenge.stage, 'purpose', challenge.purpose,
      'candidate_deployment_id', challenge.candidate_deployment_id,
      'candidate_deployment_target', challenge.candidate_deployment_target,
      'live_origin_inventory_count', reserved.live_origin_inventory_count,
      'live_origin_inventory_fingerprint',
        reserved.live_origin_inventory_fingerprint,
      'provider_inventory_schema', reserved.provider_inventory_schema,
      'retained_provider_inventory_fingerprint',
        reserved.retained_provider_inventory_fingerprint,
      'live_provider_inventory_fingerprint',
        reserved.live_provider_inventory_fingerprint,
      'binding_expires_at', reserved.binding_expires_at
    )
  );
  return production_control.vercel_provider_attestation_response(
    reserved, false
  );
end;
$$;

create or replace function production_control.record_verified_vercel_provider_attestation(
  target_evidence_id uuid,
  target_stage text,
  target_request_fingerprint text,
  input jsonb
)
returns production_control.vercel_provider_attestations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  evidence production_control.vercel_writer_quiesce_evidence%rowtype;
  challenge production_control.vercel_provider_attestation_challenges%rowtype;
  begin_attestation production_control.vercel_provider_attestations%rowtype;
  reserved production_control.vercel_provider_attestations%rowtype;
  bound_at_value timestamptz := pg_catalog.now();
begin
  if target_stage not in ('BEGIN', 'FINALIZE')
     or target_request_fingerprint !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input) is distinct from 'object'
     or not (input ?& array['attestation_id', 'attestation_fingerprint'])
     or (input - array['attestation_id', 'attestation_fingerprint'])
       is distinct from '{}'::jsonb
     or coalesce(input->>'attestation_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'attestation_fingerprint', '')
       !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_BIND_INPUT_INVALID';
  end if;
  select * into strict evidence
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = target_evidence_id
  for update;
  select * into strict reserved
  from production_control.vercel_provider_attestations value
  where value.attestation_id = (input->>'attestation_id')::uuid
    and value.attestation_fingerprint = input->>'attestation_fingerprint'
    and value.evidence_request_id = evidence.evidence_request_id
    and value.stage = target_stage
  for update;
  select * into strict challenge
  from production_control.vercel_provider_attestation_challenges value
  where value.challenge_id = reserved.challenge_id
  for update;

  if reserved.status = 'BOUND' then
    if reserved.evidence_id is distinct from evidence.evidence_id
       or reserved.receipt_request_fingerprint is distinct from
         target_request_fingerprint then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_BIND_IDEMPOTENCY_CONFLICT';
    end if;
    return reserved;
  end if;

  if reserved.status = 'ABANDONED' or challenge.status = 'ABANDONED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_ABANDONED_TERMINAL';
  end if;

  if reserved.provider_observed_at < bound_at_value - interval '120 seconds'
     or reserved.provider_observed_at > bound_at_value + interval '30 seconds' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_BIND_STALE';
  end if;

  if reserved.status is distinct from 'RESERVED'
     or reserved.binding_expires_at < bound_at_value
     or challenge.status is distinct from 'CONSUMED'
     or challenge.consumed_attestation_id is distinct from
       reserved.attestation_id
     or challenge.actor_id is distinct from evidence.actor_id
     or challenge.authenticated_actor_fingerprint is distinct from
       evidence.authenticated_actor_fingerprint
     or challenge.purpose is distinct from evidence.purpose
     or challenge.candidate_alias_origin is distinct from
       evidence.candidate_alias_origin
     or challenge.candidate_immutable_origin is distinct from
       evidence.candidate_immutable_origin
     or challenge.routing_rule_scope is distinct from evidence.routing_rule_scope
     or reserved.purpose is distinct from evidence.purpose
     or reserved.candidate_deployment_id is distinct from
       evidence.candidate_deployment_id
     or reserved.candidate_deployment_commit is distinct from
       evidence.candidate_deployment_commit
     or reserved.candidate_deployment_target is distinct from
       evidence.candidate_deployment_target
     or reserved.vercel_project_id is distinct from evidence.vercel_project_id
     or reserved.routing_rule_id is distinct from evidence.routing_rule_id
     or reserved.routing_rule_config_version is distinct from
       evidence.routing_rule_revision
     or reserved.live_origin_inventory is distinct from
       evidence.live_origin_inventory
     or reserved.live_origin_inventory_count is distinct from
       evidence.live_origin_inventory_count
     or reserved.live_origin_inventory_fingerprint is distinct from
       evidence.live_origin_inventory_fingerprint
     or reserved.provider_inventory_schema is distinct from
       evidence.provider_inventory_schema
     or reserved.retained_origin_inventory_count is distinct from
       evidence.origin_inventory_count
     or reserved.retained_origin_inventory_fingerprint is distinct from
       evidence.origin_inventory_fingerprint
     or reserved.retained_provider_inventory_count is distinct from
       evidence.retained_provider_inventory_count
     or reserved.retained_provider_inventory_fingerprint is distinct from
       evidence.retained_provider_inventory_fingerprint
     or reserved.live_provider_inventory_count is distinct from
       evidence.live_provider_inventory_count
     or reserved.live_provider_inventory_fingerprint is distinct from
       evidence.live_provider_inventory_fingerprint
     or reserved.routing_rule_all_method_fence_required_host_count is distinct from
       evidence.routing_rule_all_method_fence_required_host_count
     or reserved.routing_rule_all_method_fence_required_hosts_fingerprint
       is distinct from
         evidence.routing_rule_all_method_fence_required_hosts_fingerprint
     or reserved.routing_rule_all_method_fence_required_path_count is distinct from
       evidence.routing_rule_all_method_fence_required_path_count
     or reserved.routing_rule_all_method_fence_required_paths_fingerprint
       is distinct from
         evidence.routing_rule_all_method_fence_required_paths_fingerprint
     or reserved.credential_confinement_evidence_schema is distinct from
       evidence.credential_confinement_evidence_schema
     or reserved.credential_confinement_record_count is distinct from
       evidence.credential_confinement_record_count
     or reserved.credential_confinement_records_fingerprint is distinct from
       evidence.credential_confinement_records_fingerprint
     or reserved.credential_confinement_evidence_fingerprint is distinct from
       evidence.credential_confinement_evidence_fingerprint
     or (target_stage = 'BEGIN' and
       reserved.provider_observed_at > evidence.drain_started_at + interval '1 minute')
     or (target_stage = 'FINALIZE' and
       reserved.provider_observed_at <= evidence.drain_started_at) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_BIND_SCOPE_MISMATCH';
  end if;

  if target_stage = 'FINALIZE' then
    select * into strict begin_attestation
    from production_control.vercel_provider_attestations value
    where value.evidence_id = evidence.evidence_id
      and value.stage = 'BEGIN'
      and value.status = 'BOUND';
    if begin_attestation.attestation_id = reserved.attestation_id
       or begin_attestation.challenge_id = reserved.challenge_id
       or begin_attestation.provider_observed_at >= reserved.provider_observed_at
       or begin_attestation.signer_key_fingerprint is distinct from
         reserved.signer_key_fingerprint
       or begin_attestation.signer_key_version is distinct from
         reserved.signer_key_version
       or begin_attestation.vercel_team_id is distinct from
         reserved.vercel_team_id
       or begin_attestation.routing_rule_etag is distinct from
         reserved.routing_rule_etag
       or begin_attestation.routing_rule_fingerprint is distinct from
         reserved.routing_rule_fingerprint
       or begin_attestation.provider_inventory_schema is distinct from
         reserved.provider_inventory_schema
       or begin_attestation.retained_origin_inventory_count is distinct from
         reserved.retained_origin_inventory_count
       or begin_attestation.retained_origin_inventory_fingerprint is distinct from
         reserved.retained_origin_inventory_fingerprint
       or begin_attestation.retained_provider_inventory_count is distinct from
         reserved.retained_provider_inventory_count
       or begin_attestation.retained_provider_inventory_fingerprint is distinct from
         reserved.retained_provider_inventory_fingerprint
       or begin_attestation.live_provider_inventory_count is distinct from
         reserved.live_provider_inventory_count
       or begin_attestation.live_provider_inventory_fingerprint is distinct from
         reserved.live_provider_inventory_fingerprint
       or begin_attestation.routing_rule_all_method_fence_required_host_count
         is distinct from
           reserved.routing_rule_all_method_fence_required_host_count
       or begin_attestation.routing_rule_all_method_fence_required_hosts_fingerprint
         is distinct from
           reserved.routing_rule_all_method_fence_required_hosts_fingerprint
       or begin_attestation.routing_rule_all_method_fence_required_path_count
         is distinct from
           reserved.routing_rule_all_method_fence_required_path_count
       or begin_attestation.routing_rule_all_method_fence_required_paths_fingerprint
         is distinct from
           reserved.routing_rule_all_method_fence_required_paths_fingerprint
       or begin_attestation.redacted_environment_scope_fingerprint
         is distinct from reserved.redacted_environment_scope_fingerprint
       or begin_attestation.credential_confinement_evidence_schema is distinct from
         reserved.credential_confinement_evidence_schema
       or begin_attestation.credential_confinement_record_count is distinct from
         reserved.credential_confinement_record_count
       or begin_attestation.credential_confinement_records_fingerprint
         is distinct from reserved.credential_confinement_records_fingerprint
       or begin_attestation.credential_confinement_evidence_fingerprint
         is distinct from reserved.credential_confinement_evidence_fingerprint then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_BIND_FINALIZE_DRIFT';
    end if;
  end if;

  update production_control.vercel_provider_attestations
  set status = 'BOUND', evidence_id = evidence.evidence_id,
      receipt_request_fingerprint = target_request_fingerprint,
      bound_at = bound_at_value
  where attestation_id = reserved.attestation_id
  returning * into reserved;
  return reserved;
end;
$$;

create or replace function production_control.expected_vercel_quiesce_probe_vectors_v3()
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select '[
    ["DELETE","/api/tournament-guide"],
    ["POST","/api/admin/cms"],
    ["POST","/api/admin/tournament"],
    ["POST","/api/director"],
    ["POST","/api/live-matches"],
    ["POST","/api/odds/publish"],
    ["POST","/api/scoring/current"],
    ["POST","/api/scoring/matches/__step11_6_probe__"],
    ["POST","/api/tournament-guide"],
    ["GET","/api/cron/round-scorecards-archive"],
    ["HEAD","/api/cron/round-scorecards-archive"]
  ]'::jsonb
$$;

revoke all on function
  production_control.expected_vercel_quiesce_probe_vectors_v3()
  from public, anon, authenticated, service_role;

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
    pg_catalog.jsonb_array_length(target_origin_inventory) + 5;
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
        when 'CUTOVER_PRODUCTION_CANDIDATE' then
          'IMMUTABLE_CUTOVER_PRODUCTION_CANDIDATE'
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
        when item->>3 = 'CUTOVER_PRODUCTION_CANDIDATE' then
          '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1","POTENTIAL_PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb
      end,
      2047
    ) as record
    from pg_catalog.jsonb_array_elements(target_origin_inventory) item
    union all
    select value as record
    from pg_catalog.jsonb_array_elements(pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_array('https://baggerinv.com', 'FIXED_ALIAS',
        null, null, null, null, null, '[]'::jsonb, 2047),
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
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'found', true,
    'code', 'PRODUCTION_VERCEL_WRITER_QUIESCE_' || value.status,
    'evidence_id', value.evidence_id,
    'evidence_request_id', value.evidence_request_id,
    'prior_evidence_id', value.prior_evidence_id,
    'status', value.status,
    'purpose', value.purpose,
    'candidate_deployment_id', value.candidate_deployment_id,
    'candidate_deployment_commit', value.candidate_deployment_commit,
    'candidate_deployment_target', value.candidate_deployment_target,
    'candidate_credential_generation', value.candidate_credential_generation,
    'main_branch_alias_origin', value.main_branch_alias_origin,
    'candidate_alias_origin', value.candidate_alias_origin,
    'candidate_immutable_origin', value.candidate_immutable_origin,
    'vercel_project_id', value.vercel_project_id,
    'routing_rule_id', value.routing_rule_id,
    'routing_rule_revision', value.routing_rule_revision,
    'routing_rule_scope', value.routing_rule_scope
  ) || pg_catalog.jsonb_build_object(
    'begin_provider_attestation_id', (
      select attestation.attestation_id
      from production_control.vercel_provider_attestations attestation
      where attestation.evidence_id = value.evidence_id
        and attestation.stage = 'BEGIN'
    ),
    'begin_provider_attestation_fingerprint', (
      select attestation.attestation_fingerprint
      from production_control.vercel_provider_attestations attestation
      where attestation.evidence_id = value.evidence_id
        and attestation.stage = 'BEGIN'
    ),
    'finalize_provider_attestation_id', (
      select attestation.attestation_id
      from production_control.vercel_provider_attestations attestation
      where attestation.evidence_id = value.evidence_id
        and attestation.stage = 'FINALIZE'
    ),
    'finalize_provider_attestation_fingerprint', (
      select attestation.attestation_fingerprint
      from production_control.vercel_provider_attestations attestation
      where attestation.evidence_id = value.evidence_id
        and attestation.stage = 'FINALIZE'
    ),
    'provider_attestation_signer_key_fingerprint', (
      select attestation.signer_key_fingerprint
      from production_control.vercel_provider_attestations attestation
      where attestation.evidence_id = value.evidence_id
        and attestation.stage = 'BEGIN'
    ),
    'provider_attestation_signer_key_version', (
      select attestation.signer_key_version
      from production_control.vercel_provider_attestations attestation
      where attestation.evidence_id = value.evidence_id
        and attestation.stage = 'BEGIN'
    ),
    'vercel_team_id', (
      select attestation.vercel_team_id
      from production_control.vercel_provider_attestations attestation
      where attestation.evidence_id = value.evidence_id
        and attestation.stage = 'BEGIN'
    ),
    'origin_inventory_count', value.origin_inventory_count,
    'origin_inventory_fingerprint', value.origin_inventory_fingerprint,
    'live_origin_inventory_count', value.live_origin_inventory_count,
    'live_origin_inventory_fingerprint',
      value.live_origin_inventory_fingerprint,
    'provider_inventory_schema', value.provider_inventory_schema,
    'retained_provider_inventory_count',
      value.retained_provider_inventory_count,
    'retained_provider_inventory_fingerprint',
      value.retained_provider_inventory_fingerprint,
    'live_provider_inventory_count', value.live_provider_inventory_count,
    'live_provider_inventory_fingerprint',
      value.live_provider_inventory_fingerprint,
    'routing_rule_all_method_fence_required_host_count',
      value.routing_rule_all_method_fence_required_host_count,
    'routing_rule_all_method_fence_required_hosts_fingerprint',
      value.routing_rule_all_method_fence_required_hosts_fingerprint,
    'routing_rule_all_method_fence_required_path_count',
      value.routing_rule_all_method_fence_required_path_count,
    'routing_rule_all_method_fence_required_paths_fingerprint',
      value.routing_rule_all_method_fence_required_paths_fingerprint,
    'credential_confinement_evidence_schema',
      value.credential_confinement_evidence_schema,
    'credential_confinement_record_count',
      value.credential_confinement_record_count,
    'credential_confinement_records_fingerprint',
      value.credential_confinement_records_fingerprint,
    'credential_confinement_evidence_fingerprint',
      value.credential_confinement_evidence_fingerprint,
    'probe_vector_count', 11,
    'probe_origin_count',
      pg_catalog.jsonb_array_length(value.first_probe_records),
    'probe_record_count',
      pg_catalog.jsonb_array_length(value.first_probe_records) * 11,
    'first_probe_fingerprint', value.first_probe_fingerprint,
    'probe_scope_fingerprint', value.probe_scope_fingerprint,
    'second_probe_fingerprint', value.second_probe_fingerprint,
    'deployment_scope_fingerprint', value.deployment_scope_fingerprint,
    'drain_started_at', value.drain_started_at,
    'drain_completed_at', value.drain_completed_at,
    'verified_at', value.verified_at,
    'expires_at', value.expires_at,
    'owner_principal_fingerprint', value.owner_principal_fingerprint,
    'owner_acknowledged_at', value.owner_acknowledged_at,
    'owner_freeze_expires_at', value.owner_freeze_expires_at,
    'failure_code', value.failure_code,
    'idempotent', was_idempotent
  )
$$;

create or replace function public.begin_production_vercel_writer_quiesce_evidence(
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
       and input->>'candidate_deployment_target' <> 'PRODUCTION') then
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

create or replace function public.finalize_production_vercel_writer_quiesce_evidence(
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
  evidence production_control.vercel_writer_quiesce_evidence%rowtype;
  provider_attestation
    production_control.vercel_provider_attestations%rowtype;
  payload_hash text := production_control.cutover_payload_hash(input);
  normalized_probes jsonb;
  verified_time timestamptz := pg_catalog.now();
  expiry_time timestamptz;
  scope_fingerprint text;
  unresolved_request_count integer;
  unresolved_google_count integer;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'evidence_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or input->>'candidate_deployment_target' not in ('PREVIEW', 'PRODUCTION')
     or pg_catalog.upper(coalesce(input->>'purpose', ''))
       not in ('REHEARSAL', 'CUTOVER')
     or coalesce(input->>'main_branch_alias_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'candidate_alias_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'candidate_immutable_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'candidate_credential_generation', '')
       !~ '^[A-Z0-9_:-]{3,120}$'
     or pg_catalog.jsonb_typeof(input->'live_origin_inventory')
       is distinct from 'array'
     or pg_catalog.jsonb_typeof(input->'provider_attestation')
       is distinct from 'object'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_FINALIZE_INPUT_INVALID';
  end if;
  perform production_control.assert_current_provider_inventory_v3(
    input, false, true
  );
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict evidence
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_request_id = (input->>'evidence_request_id')::uuid
    and value.evidence_id = (input->>'evidence_id')::uuid
  for update;
  if evidence.actor_id is distinct from input->>'actor_id'
     or evidence.authenticated_actor_fingerprint is distinct from
       input->>'authenticated_actor_fingerprint' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_FINALIZE_ACTOR_MISMATCH';
  end if;
  if evidence.status = 'VERIFIED' then
    if evidence.finalize_request_fingerprint =
         pg_catalog.lower(input->>'request_fingerprint')
       and evidence.finalize_payload_hash = payload_hash then
      return production_control.vercel_quiesce_response(evidence, true);
    end if;
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_ALREADY_FINALIZED';
  end if;
  if evidence.status is distinct from 'DRAINING'
     or evidence.purpose is distinct from pg_catalog.upper(input->>'purpose')
     or evidence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or evidence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or evidence.candidate_deployment_target is distinct from
       input->>'candidate_deployment_target'
     or evidence.main_branch_alias_origin is distinct from
       pg_catalog.lower(input->>'main_branch_alias_origin')
     or evidence.candidate_alias_origin is distinct from
       pg_catalog.lower(input->>'candidate_alias_origin')
     or evidence.candidate_immutable_origin is distinct from
       pg_catalog.lower(input->>'candidate_immutable_origin')
     or evidence.candidate_credential_generation is distinct from
       input->>'candidate_credential_generation'
     or evidence.live_origin_inventory is distinct from
       input->'live_origin_inventory'
     or evidence.vercel_project_id is distinct from input->>'vercel_project_id'
     or evidence.routing_rule_id is distinct from input->>'routing_rule_id'
     or evidence.routing_rule_revision is distinct from
       input->>'routing_rule_revision'
     or evidence.routing_rule_scope is distinct from input->>'routing_rule_scope'
     or evidence.provider_inventory_schema is distinct from
       input->>'provider_inventory_schema'
     or evidence.retained_provider_inventory_count is distinct from
       (input->>'retained_provider_inventory_count')::integer
     or evidence.retained_provider_inventory_fingerprint is distinct from
       input->>'retained_provider_inventory_fingerprint'
     or evidence.live_provider_inventory_count is distinct from
       (input->>'live_provider_inventory_count')::integer
     or evidence.live_provider_inventory_fingerprint is distinct from
       input->>'live_provider_inventory_fingerprint'
     or evidence.routing_rule_all_method_fence_required_host_count is distinct from
       (input->>'routing_rule_all_method_fence_required_host_count')::integer
     or evidence.routing_rule_all_method_fence_required_hosts_fingerprint
       is distinct from
         input->>'routing_rule_all_method_fence_required_hosts_fingerprint'
     or evidence.routing_rule_all_method_fence_required_path_count is distinct from
       (input->>'routing_rule_all_method_fence_required_path_count')::integer
     or evidence.routing_rule_all_method_fence_required_paths_fingerprint
       is distinct from
         input->>'routing_rule_all_method_fence_required_paths_fingerprint'
     or evidence.credential_confinement_evidence_schema is distinct from
       input->>'credential_confinement_evidence_schema'
     or evidence.credential_confinement_record_count is distinct from
       (input->>'credential_confinement_record_count')::integer
     or evidence.credential_confinement_records_fingerprint is distinct from
       input->>'credential_confinement_records_fingerprint'
     or evidence.credential_confinement_evidence_fingerprint is distinct from
       input->>'credential_confinement_evidence_fingerprint'
     or verified_time < evidence.drain_started_at + interval '300 seconds'
     or evidence.owner_freeze_expires_at < verified_time + interval '5 minutes'
     then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_DRAIN_NOT_SAFE';
  end if;
  perform production_control.assert_exact_vercel_probe_records(
    input->'second_probe_records', evidence.live_origin_inventory,
    evidence.main_branch_alias_origin, evidence.candidate_alias_origin,
    evidence.candidate_immutable_origin, evidence.candidate_deployment_id,
    evidence.candidate_deployment_commit,
    evidence.candidate_deployment_target,
    evidence.candidate_credential_generation
  );
  normalized_probes := production_control.normalized_vercel_probe_records(
    input->'second_probe_records'
  );
  if production_control.structured_evidence_fingerprint(
       production_control.normalized_vercel_probe_scope(normalized_probes)
     ) is distinct from evidence.probe_scope_fingerprint
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(normalized_probes) probe
       where (probe->>10)::timestamptz < evidence.drain_started_at
     )
     or exists (
       select first_proof #>> '{}'
       from pg_catalog.jsonb_array_elements(
         evidence.first_probe_records
       ) first_origin
       cross join lateral pg_catalog.jsonb_array_elements(
         first_origin->9
       ) first_proof
       intersect
       select second_proof #>> '{}'
       from pg_catalog.jsonb_array_elements(normalized_probes) second_origin
       cross join lateral pg_catalog.jsonb_array_elements(
         second_origin->9
       ) second_proof
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_SECOND_PROBE_SCOPE_MISMATCH';
  end if;
  select pg_catalog.count(*)::integer into unresolved_request_count
  from scoring_authority.scoring_ingress_leases value
  where value.tournament_id = '2026'
    and (value.status = 'ACTIVE' or value.resolution_state in (
      'LEGACY_UNCLASSIFIED', 'ADMITTED', 'WRITE_STARTED',
      'AMBIGUOUS', 'PARTIAL_WRITE'
    ));
  select
    (select pg_catalog.count(*)::integer
     from scoring_authority.scoring_ingress_leases value
     where value.tournament_id = '2026'
       and value.resolution_state in (
         'LEGACY_UNCLASSIFIED', 'WRITE_STARTED', 'AMBIGUOUS', 'PARTIAL_WRITE'
       ))
    + (select pg_catalog.count(*)::integer
       from scoring_authority.google_outbox_events value
       where value.tournament_id = '2026' and value.status <> 'DELIVERED')
    + (select pg_catalog.count(*)::integer
       from scoring_authority.scorecard_archive_jobs value
       where value.tournament_id = '2026'
         and value.status not in ('VERIFIED', 'SUPERSEDED'))
  into unresolved_google_count;
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
  if unresolved_request_count <> 0 or unresolved_google_count <> 0
     or (evidence.purpose = 'REHEARSAL' and (
       evidence.prior_evidence_id is not null
       or activation.state is distinct from 'DORMANT'
       or activation.current_authority is distinct from 'GOOGLE'
       or activation.scoring_ingress_enabled
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
     ))
     or (evidence.purpose = 'CUTOVER'
       and evidence.prior_evidence_id is null and (
         activation.state is distinct from 'GOOGLE_LEASE_ARMED'
         or activation.read_cutover_phase is distinct from 'CURRENT_READS'
         or activation.current_authority is distinct from 'GOOGLE'
         or activation.scoring_ingress_enabled
         or resource.scoring_authority is distinct from 'GOOGLE'
         or resource.participant_identity_authority is distinct from 'SUPABASE'
         or resource.current_tournament_read_authority is distinct from 'SUPABASE'
         or not resource.public_supabase_reads_enabled
         or not resource.auth_user_creation_enabled
         or resource.scoring_ingress_enabled or resource.workers_enabled
         or activation.active_google_writer_provider_fence_id is not null
         or gate.state is distinct from 'OPEN'
         or gate.authority is distinct from 'GOOGLE'
         or gate.admission_state is distinct from 'OPEN'
         or not gate.admission_protocol_enforced
       ))
     or (evidence.purpose = 'CUTOVER'
       and evidence.prior_evidence_id is not null and (
         activation.active_google_writer_provider_fence_id is null
         or activation.active_google_writer_provider_verification_id is null
         or activation.active_vercel_quiesce_evidence_id is distinct from
           evidence.prior_evidence_id
         or not exists (
           select 1
           from production_control.google_writer_provider_fences fence
           where fence.fence_id =
               activation.active_google_writer_provider_fence_id
             and fence.status = 'INSTALLED'
             and fence.active_verification_id =
               activation.active_google_writer_provider_verification_id
             and fence.quiesce_evidence_id = evidence.prior_evidence_id
             and fence.candidate_deployment_id =
               evidence.candidate_deployment_id
             and fence.candidate_deployment_commit =
               evidence.candidate_deployment_commit
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
             and resource.scoring_authority = 'GOOGLE'
             and resource.participant_identity_authority = 'SUPABASE'
             and resource.current_tournament_read_authority = 'SUPABASE'
             and resource.public_supabase_reads_enabled
             and resource.auth_user_creation_enabled
             and not resource.scoring_ingress_enabled
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
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_DRAIN_NOT_SAFE';
  end if;
  provider_attestation :=
    production_control.record_verified_vercel_provider_attestation(
      evidence.evidence_id, 'FINALIZE',
      pg_catalog.lower(input->>'request_fingerprint'),
      input->'provider_attestation'
    );
  scope_fingerprint := production_control.structured_evidence_fingerprint(
    pg_catalog.jsonb_build_object(
      'vercelProjectId', evidence.vercel_project_id,
      'routingRuleId', evidence.routing_rule_id,
      'routingRuleRevision', evidence.routing_rule_revision,
      'routingRuleScope', evidence.routing_rule_scope,
      'candidateDeploymentId', evidence.candidate_deployment_id,
      'candidateDeploymentCommit', evidence.candidate_deployment_commit,
      'originInventoryFingerprint', evidence.origin_inventory_fingerprint,
      'liveOriginInventoryFingerprint',
        evidence.live_origin_inventory_fingerprint,
      'providerInventorySchema', evidence.provider_inventory_schema,
      'retainedProviderInventoryCount',
        evidence.retained_provider_inventory_count,
      'retainedProviderInventoryFingerprint',
        evidence.retained_provider_inventory_fingerprint,
      'liveProviderInventoryCount', evidence.live_provider_inventory_count,
      'liveProviderInventoryFingerprint',
        evidence.live_provider_inventory_fingerprint,
      'routingRuleAllMethodFenceRequiredHostCount',
        evidence.routing_rule_all_method_fence_required_host_count,
      'routingRuleAllMethodFenceRequiredHostsFingerprint',
        evidence.routing_rule_all_method_fence_required_hosts_fingerprint,
      'routingRuleAllMethodFenceRequiredPathCount',
        evidence.routing_rule_all_method_fence_required_path_count,
      'routingRuleAllMethodFenceRequiredPathsFingerprint',
        evidence.routing_rule_all_method_fence_required_paths_fingerprint,
      'credentialConfinementEvidenceSchema',
        evidence.credential_confinement_evidence_schema,
      'credentialConfinementRecordCount',
        evidence.credential_confinement_record_count,
      'credentialConfinementRecordsFingerprint',
        evidence.credential_confinement_records_fingerprint,
      'credentialConfinementEvidenceFingerprint',
        evidence.credential_confinement_evidence_fingerprint,
      'firstProbeFingerprint', evidence.first_probe_fingerprint,
      'secondProbeFingerprint',
        production_control.structured_evidence_fingerprint(normalized_probes),
      'beginProviderAttestationFingerprint', (
        select attestation.attestation_fingerprint
        from production_control.vercel_provider_attestations attestation
        where attestation.evidence_id = evidence.evidence_id
          and attestation.stage = 'BEGIN'
      ),
      'finalizeProviderAttestationFingerprint',
        provider_attestation.attestation_fingerprint,
      'drainStartedAt', evidence.drain_started_at,
      'drainCompletedAt', verified_time,
      'unresolvedRequestLogCount', unresolved_request_count,
      'unresolvedGoogleWriteCount', unresolved_google_count,
      'ownerPrincipalFingerprint', evidence.owner_principal_fingerprint
    )
  );
  expiry_time := least(
    verified_time + interval '30 minutes', evidence.owner_freeze_expires_at
  );
  update production_control.vercel_writer_quiesce_evidence
  set status = 'VERIFIED',
      finalize_request_fingerprint =
        pg_catalog.lower(input->>'request_fingerprint'),
      finalize_payload_hash = payload_hash,
      second_probe_records = normalized_probes,
      second_probe_fingerprint =
        production_control.structured_evidence_fingerprint(normalized_probes),
      deployment_scope_fingerprint = scope_fingerprint,
      drain_completed_at = verified_time,
      unresolved_request_log_count = unresolved_request_count,
      unresolved_google_write_count = unresolved_google_count,
      verified_at = verified_time,
      expires_at = expiry_time,
      updated_at = verified_time
  where evidence_id = evidence.evidence_id
  returning * into evidence;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_VERCEL_WRITER_QUIESCE_VERIFIED',
    'SCORING_AUTHORITY', '2026',
    evidence.actor_id,
    evidence.finalize_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'evidence_id', evidence.evidence_id,
      'drain_started_at', evidence.drain_started_at,
      'drain_completed_at', evidence.drain_completed_at,
      'drain_seconds', extract(epoch from
        evidence.drain_completed_at - evidence.drain_started_at),
      'origin_inventory_count', evidence.origin_inventory_count,
      'origin_inventory_fingerprint', evidence.origin_inventory_fingerprint,
      'provider_inventory_schema', evidence.provider_inventory_schema,
      'retained_provider_inventory_fingerprint',
        evidence.retained_provider_inventory_fingerprint,
      'live_provider_inventory_fingerprint',
        evidence.live_provider_inventory_fingerprint,
      'second_probe_fingerprint', evidence.second_probe_fingerprint,
      'deployment_scope_fingerprint', evidence.deployment_scope_fingerprint,
      'provider_attestation_id', provider_attestation.attestation_id,
      'provider_attestation_fingerprint',
        provider_attestation.attestation_fingerprint,
      'provider_attestation_signer_key_fingerprint',
        provider_attestation.signer_key_fingerprint,
      'provider_attestation_signer_key_version',
        provider_attestation.signer_key_version,
      'provider_observed_at', provider_attestation.provider_observed_at,
      'unresolved_request_log_count', 0,
      'unresolved_google_write_count', 0,
      'expires_at', evidence.expires_at
    )
  );
  return production_control.vercel_quiesce_response(evidence, false);
end;
$$;

create or replace function production_control.guard_terminal_vercel_provider_attestation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.status = 'ABANDONED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_ABANDONED_TERMINAL';
  end if;
  if tg_op = 'UPDATE' and old.status = 'BOUND'
     and new.status = 'ABANDONED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_BOUND_ABANDON_FORBIDDEN';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_terminal_vercel_provider_attestation
  before update or delete
  on production_control.vercel_provider_attestations
  for each row execute function
    production_control.guard_terminal_vercel_provider_attestation();

create or replace function production_control.assert_vercel_provider_challenge_abandon_binding(
  challenge production_control.vercel_provider_attestation_challenges,
  input jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if challenge.challenge_request_id is distinct from
       (input->>'challenge_request_id')::uuid
     or challenge.operation_request_id is distinct from
       (input->>'operation_request_id')::uuid
     or challenge.evidence_request_id is distinct from
       (input->>'evidence_request_id')::uuid
     or challenge.stage is distinct from pg_catalog.upper(input->>'stage')
     or challenge.purpose is distinct from pg_catalog.upper(input->>'purpose')
     or challenge.authenticated_actor_fingerprint is distinct from
       input->>'authenticated_actor_fingerprint'
     or challenge.actor_id is distinct from input->>'actor_id'
     or challenge.vercel_project_id is distinct from input->>'vercel_project_id'
     or challenge.vercel_team_id is distinct from input->>'vercel_team_id'
     or challenge.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or challenge.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or challenge.candidate_deployment_target is distinct from
       input->>'candidate_deployment_target'
     or challenge.candidate_alias_origin is distinct from
       pg_catalog.lower(input->>'candidate_alias_origin')
     or challenge.candidate_immutable_origin is distinct from
       pg_catalog.lower(input->>'candidate_immutable_origin')
     or challenge.routing_rule_id is distinct from input->>'routing_rule_id'
     or challenge.routing_rule_config_version is distinct from
       input->>'routing_rule_config_version'
     or challenge.routing_rule_scope is distinct from
       input->>'routing_rule_scope' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_BINDING_MISMATCH';
  end if;
end;
$$;

create or replace function production_control.vercel_provider_challenge_abandonment_code(
  challenge production_control.vercel_provider_attestation_challenges,
  observed_at_value timestamptz
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  attestation production_control.vercel_provider_attestations%rowtype;
  evidence production_control.vercel_writer_quiesce_evidence%rowtype;
begin
  if challenge.status = 'ABANDONED' then
    return 'ABANDONED';
  end if;
  if challenge.status = 'ISSUED' then
    if exists (
      select 1 from production_control.vercel_provider_attestations value
      where value.challenge_id = challenge.challenge_id
    ) then
      return 'PROGRESSION_CONFLICT';
    end if;
    select * into evidence
    from production_control.vercel_writer_quiesce_evidence value
    where value.evidence_request_id = challenge.evidence_request_id;
    if (challenge.stage = 'BEGIN' and found)
       or (challenge.stage = 'FINALIZE' and (
         not found or evidence.status is distinct from 'DRAINING'
         or evidence.purpose is distinct from challenge.purpose
       )) then
      return 'PROGRESSION_CONFLICT';
    end if;
    if observed_at_value <= challenge.expires_at then
      return 'NOT_EXPIRED';
    end if;
    return 'ELIGIBLE';
  end if;
  if challenge.status is distinct from 'CONSUMED'
     or challenge.consumed_attestation_id is null then
    return 'PROGRESSION_CONFLICT';
  end if;
  select * into attestation
  from production_control.vercel_provider_attestations value
  where value.attestation_id = challenge.consumed_attestation_id
    and value.challenge_id = challenge.challenge_id;
  if not found then
    return 'PROGRESSION_CONFLICT';
  end if;
  if attestation.status = 'BOUND' then
    return 'BOUND';
  end if;
  if attestation.status is distinct from 'RESERVED'
     or attestation.evidence_id is not null
     or attestation.receipt_request_fingerprint is not null
     or attestation.bound_at is not null
     or attestation.stage is distinct from challenge.stage
     or attestation.purpose is distinct from challenge.purpose
     or attestation.operation_request_id is distinct from
       challenge.operation_request_id
     or attestation.evidence_request_id is distinct from
       challenge.evidence_request_id then
    return 'PROGRESSION_CONFLICT';
  end if;
  select * into evidence
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_request_id = challenge.evidence_request_id;
  if (challenge.stage = 'BEGIN' and found)
     or (challenge.stage = 'FINALIZE' and (
       not found or evidence.status is distinct from 'DRAINING'
       or evidence.purpose is distinct from challenge.purpose
     )) then
    return 'PROGRESSION_CONFLICT';
  end if;
  if exists (
    select 1 from production_control.google_writer_fence_rehearsals value
    where value.quiesce_evidence_id = evidence.evidence_id
  ) or exists (
    select 1 from production_control.google_writer_provider_fences value
    where value.quiesce_evidence_id = evidence.evidence_id
  ) then
    return 'PROGRESSION_CONFLICT';
  end if;
  if observed_at_value <= attestation.binding_expires_at
     and attestation.provider_observed_at >=
       observed_at_value - interval '120 seconds'
     and attestation.provider_observed_at <=
       observed_at_value + interval '30 seconds' then
    return 'CONSUMED_UNBOUND_NOT_EXPIRED';
  end if;
  return 'ELIGIBLE_CONSUMED_UNBOUND';
end;
$$;

create or replace function public.inspect_production_vercel_provider_challenge_abandonment(
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
  attestation production_control.vercel_provider_attestations%rowtype;
  observed_at_value timestamptz;
  abandonment_code_value text;
  allowed_keys text[] := array[
    'environment', 'project_ref', 'project_url', 'source_workbook_id',
    'tournament_id', 'actor_id', 'authenticated_actor_fingerprint',
    'challenge_id', 'challenge_request_id', 'operation_request_id',
    'evidence_request_id', 'stage', 'purpose', 'vercel_project_id',
    'vercel_team_id', 'candidate_deployment_id',
    'candidate_deployment_commit', 'candidate_deployment_target',
    'candidate_alias_origin', 'candidate_immutable_origin', 'routing_rule_id',
    'routing_rule_config_version', 'routing_rule_scope'
  ];
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if pg_catalog.jsonb_typeof(input) is distinct from 'object'
     or not (input ?& allowed_keys)
     or (input - allowed_keys) is distinct from '{}'::jsonb
     or coalesce(input->>'challenge_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'challenge_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'evidence_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.upper(coalesce(input->>'stage', ''))
       not in ('BEGIN', 'FINALIZE')
     or pg_catalog.upper(coalesce(input->>'purpose', ''))
       not in ('REHEARSAL', 'CUTOVER')
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or coalesce(input->>'vercel_team_id', '')
       !~ '^[A-Za-z0-9_.:-]{3,160}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or input->>'candidate_deployment_target' not in ('PREVIEW', 'PRODUCTION')
     or coalesce(input->>'candidate_alias_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'candidate_immutable_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'routing_rule_id', '')
       !~ '^[A-Za-z0-9_.:-]{3,160}$'
     or coalesce(input->>'routing_rule_config_version', '')
       !~ '^[A-Za-z0-9_.:-]{1,160}$'
     or input->>'routing_rule_scope' is distinct from
       'PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_INSPECT_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict challenge
  from production_control.vercel_provider_attestation_challenges value
  where value.challenge_id = (input->>'challenge_id')::uuid
  for update;
  perform production_control.assert_vercel_provider_challenge_abandon_binding(
    challenge, input
  );
  if challenge.consumed_attestation_id is not null then
    select * into strict attestation
    from production_control.vercel_provider_attestations value
    where value.attestation_id = challenge.consumed_attestation_id
    for update;
  end if;
  observed_at_value := pg_catalog.clock_timestamp();
  abandonment_code_value :=
    production_control.vercel_provider_challenge_abandonment_code(
      challenge, observed_at_value
    );
  return production_control.vercel_provider_attestation_challenge_response(
    challenge, true
  ) || pg_catalog.jsonb_build_object(
    'abandon_eligible', abandonment_code_value in (
      'ELIGIBLE', 'ELIGIBLE_CONSUMED_UNBOUND'
    ),
    'abandonment_code', abandonment_code_value,
    'server_observed_at', observed_at_value
  );
end;
$$;

create or replace function public.abandon_production_vercel_provider_attestation_challenge(
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
  attestation production_control.vercel_provider_attestations%rowtype;
  abandon_request_identifier uuid;
  payload_hash text := production_control.cutover_payload_hash(input);
  abandoned_at_value timestamptz;
  abandonment_code_value text;
  expected_reason text;
  allowed_keys text[] := array[
    'environment', 'project_ref', 'project_url', 'source_workbook_id',
    'tournament_id', 'actor_id', 'authenticated_actor_fingerprint',
    'abandon_request_id', 'request_fingerprint', 'challenge_id',
    'challenge_request_id', 'operation_request_id', 'evidence_request_id',
    'stage', 'purpose', 'vercel_project_id', 'vercel_team_id',
    'candidate_deployment_id', 'candidate_deployment_commit',
    'candidate_deployment_target', 'candidate_alias_origin',
    'candidate_immutable_origin', 'routing_rule_id',
    'routing_rule_config_version', 'routing_rule_scope', 'abandonment_reason'
  ];
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if pg_catalog.jsonb_typeof(input) is distinct from 'object'
     or not (input ?& allowed_keys)
     or (input - allowed_keys) is distinct from '{}'::jsonb
     or coalesce(input->>'abandon_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'challenge_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'challenge_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'evidence_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.upper(coalesce(input->>'stage', ''))
       not in ('BEGIN', 'FINALIZE')
     or pg_catalog.upper(coalesce(input->>'purpose', ''))
       not in ('REHEARSAL', 'CUTOVER')
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or coalesce(input->>'vercel_team_id', '')
       !~ '^[A-Za-z0-9_.:-]{3,160}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or input->>'candidate_deployment_target' not in ('PREVIEW', 'PRODUCTION')
     or coalesce(input->>'candidate_alias_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'candidate_immutable_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'routing_rule_id', '')
       !~ '^[A-Za-z0-9_.:-]{3,160}$'
     or coalesce(input->>'routing_rule_config_version', '')
       !~ '^[A-Za-z0-9_.:-]{1,160}$'
     or input->>'routing_rule_scope' is distinct from
       'PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE'
     or input->>'abandonment_reason' not in (
       'EXPIRED_UNCONSUMED_BEGIN_SUPERSEDED',
       'EXPIRED_UNCONSUMED_FINALIZE_SUPERSEDED',
       'EXPIRED_CONSUMED_UNBOUND_PROVIDER_ATTESTATION_SUPERSEDED'
     ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_INPUT_INVALID';
  end if;
  abandon_request_identifier := (input->>'abandon_request_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict challenge
  from production_control.vercel_provider_attestation_challenges value
  where value.challenge_id = (input->>'challenge_id')::uuid
  for update;
  perform production_control.assert_vercel_provider_challenge_abandon_binding(
    challenge, input
  );
  if challenge.status = 'ABANDONED' then
    if challenge.abandon_request_id is distinct from abandon_request_identifier
       or challenge.abandon_request_fingerprint is distinct from
         input->>'request_fingerprint'
       or challenge.abandon_payload_hash is distinct from payload_hash
       or challenge.abandonment_reason is distinct from
         input->>'abandonment_reason' then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_IDEMPOTENCY_CONFLICT';
    end if;
    return production_control.vercel_provider_attestation_challenge_response(
      challenge, true
    ) || pg_catalog.jsonb_build_object(
      'abandon_eligible', false, 'abandonment_code', 'ABANDONED',
      'server_observed_at', pg_catalog.clock_timestamp()
    );
  end if;
  if challenge.consumed_attestation_id is not null then
    select * into strict attestation
    from production_control.vercel_provider_attestations value
    where value.attestation_id = challenge.consumed_attestation_id
    for update;
  end if;
  abandoned_at_value := pg_catalog.clock_timestamp();
  abandonment_code_value :=
    production_control.vercel_provider_challenge_abandonment_code(
      challenge, abandoned_at_value
    );
  expected_reason := case
    when abandonment_code_value = 'ELIGIBLE' and challenge.stage = 'BEGIN'
      then 'EXPIRED_UNCONSUMED_BEGIN_SUPERSEDED'
    when abandonment_code_value = 'ELIGIBLE' and challenge.stage = 'FINALIZE'
      then 'EXPIRED_UNCONSUMED_FINALIZE_SUPERSEDED'
    when abandonment_code_value = 'ELIGIBLE_CONSUMED_UNBOUND'
      then 'EXPIRED_CONSUMED_UNBOUND_PROVIDER_ATTESTATION_SUPERSEDED'
    else null
  end;
  if expected_reason is null then
    raise exception using errcode = '55000',
      message = case abandonment_code_value
        when 'NOT_EXPIRED' then
          'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_NOT_EXPIRED'
        when 'CONSUMED_UNBOUND_NOT_EXPIRED' then
          'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_BINDING_NOT_EXPIRED'
        when 'BOUND' then
          'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_BOUND_ABANDON_FORBIDDEN'
        else
          'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_PROGRESSION_CONFLICT'
      end;
  end if;
  if input->>'abandonment_reason' is distinct from expected_reason then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_REASON_MISMATCH';
  end if;
  if abandonment_code_value = 'ELIGIBLE_CONSUMED_UNBOUND' then
    update production_control.vercel_provider_attestations
    set status = 'ABANDONED', abandoned_at = abandoned_at_value
    where attestation_id = attestation.attestation_id and status = 'RESERVED'
      and evidence_id is null and receipt_request_fingerprint is null
      and bound_at is null
    returning * into strict attestation;
  end if;
  update production_control.vercel_provider_attestation_challenges
  set status = 'ABANDONED', abandon_request_id = abandon_request_identifier,
      abandon_request_fingerprint = input->>'request_fingerprint',
      abandon_payload_hash = payload_hash,
      abandonment_reason = expected_reason,
      abandoned_at = abandoned_at_value, updated_at = abandoned_at_value
  where challenge_id = challenge.challenge_id
    and status in ('ISSUED', 'CONSUMED')
  returning * into strict challenge;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDONED',
    'SCORING_AUTHORITY', '2026', challenge.actor_id,
    challenge.abandon_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'abandon_request_id', challenge.abandon_request_id,
      'challenge_id', challenge.challenge_id,
      'challenge_request_id', challenge.challenge_request_id,
      'operation_request_id', challenge.operation_request_id,
      'evidence_request_id', challenge.evidence_request_id,
      'consumed_attestation_id', challenge.consumed_attestation_id,
      'stage', challenge.stage, 'purpose', challenge.purpose,
      'candidate_deployment_id', challenge.candidate_deployment_id,
      'candidate_deployment_commit', challenge.candidate_deployment_commit,
      'candidate_deployment_target', challenge.candidate_deployment_target,
      'routing_rule_id', challenge.routing_rule_id,
      'routing_rule_config_version', challenge.routing_rule_config_version,
      'abandonment_reason', challenge.abandonment_reason,
      'abandoned_at', challenge.abandoned_at
    )
  );
  return production_control.vercel_provider_attestation_challenge_response(
    challenge, false
  ) || pg_catalog.jsonb_build_object(
    'abandon_eligible', false, 'abandonment_code', 'ABANDONED',
    'server_observed_at', abandoned_at_value
  );
end;
$$;

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
  perform production_control.assert_exact_vercel_origin_inventory(
    quiesce.origin_inventory
  );
  if coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or quiesce.evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or quiesce.purpose is distinct from 'CUTOVER'
     or quiesce.status is distinct from 'VERIFIED'
     or quiesce.origin_inventory_count is distinct from
       pg_catalog.jsonb_array_length(quiesce.origin_inventory)
     or quiesce.origin_inventory_fingerprint is distinct from
       production_control.vercel_origin_inventory_fingerprint(
         quiesce.origin_inventory
       )
     or coalesce(pg_catalog.jsonb_array_length(
       quiesce.first_probe_records
     ), -1) <> quiesce.live_origin_inventory_count + 5
     or coalesce(pg_catalog.jsonb_array_length(
       quiesce.second_probe_records
     ), -1) <> quiesce.live_origin_inventory_count + 5
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

revoke all on function public.consume_production_vercel_provider_attestation_challenge(jsonb)
  from public, anon, authenticated;
grant execute on function public.consume_production_vercel_provider_attestation_challenge(jsonb)
  to service_role;
revoke all on function public.begin_production_vercel_writer_quiesce_evidence(jsonb)
  from public, anon, authenticated;
grant execute on function public.begin_production_vercel_writer_quiesce_evidence(jsonb)
  to service_role;
revoke all on function public.finalize_production_vercel_writer_quiesce_evidence(jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_production_vercel_writer_quiesce_evidence(jsonb)
  to service_role;
revoke all on function public.inspect_production_vercel_provider_challenge_abandonment(
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.inspect_production_vercel_provider_challenge_abandonment(
  jsonb
) to service_role;
revoke all on function
  public.inspect_production_vercel_provider_attestation_challenge_abandonment(
    jsonb
  ) from public, anon, authenticated, service_role;
revoke all on function
  production_control.guard_terminal_vercel_provider_attestation()
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_vercel_provider_challenge_abandon_binding(
    production_control.vercel_provider_attestation_challenges, jsonb
  ) from public, anon, authenticated, service_role;
revoke all on function
  production_control.vercel_provider_challenge_abandonment_code(
    production_control.vercel_provider_attestation_challenges, timestamptz
  ) from public, anon, authenticated, service_role;

comment on function
  public.inspect_production_vercel_provider_challenge_abandonment(
    jsonb
  ) is 'Classifies exact expired ISSUED or consumed-but-unbound BEGIN/FINALIZE provider evidence for terminal recovery without mutation.';
comment on function
  public.abandon_production_vercel_provider_attestation_challenge(jsonb)
  is 'Atomically preserves and terminally abandons exact expired ISSUED or consumed-but-unbound provider challenge evidence; BOUND attestations are never abandonable.';

notify pgrst, 'reload schema';

commit;
