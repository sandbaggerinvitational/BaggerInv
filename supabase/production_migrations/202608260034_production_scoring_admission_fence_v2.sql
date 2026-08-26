-- Step 11.6 Production scoring-admission fence v2.
--
-- Installation is dormant. It does not change the current Google/Passport
-- authority, enable Supabase scoring, enable workers, or assert that external
-- Google writers have been fenced. Provider/Vercel evidence is accepted only
-- through the structured, server-timed control-plane receipts below; the
-- database binds those receipts while Google/Vercel remain enforcement planes.
begin;

alter table scoring_authority.ingress_gates
  add column if not exists admission_contract_version text not null
    default 'production-scoring-admission-v2',
  add column if not exists admission_state text not null default 'OPEN',
  add column if not exists admission_revision bigint not null default 0,
  add column if not exists admission_generation_id uuid not null
    default extensions.gen_random_uuid(),
  add column if not exists admission_protocol_enforced boolean not null default false,
  add column if not exists admission_enforced_at timestamptz,
  add column if not exists admission_opened_at timestamptz,
  add column if not exists admission_deployment_id text,
  add column if not exists legacy_lease_set_fingerprint text,
  add column if not exists active_closure_id uuid,
  add column if not exists external_fence_evidence_id uuid;

alter table scoring_authority.ingress_gates
  add constraint production_scoring_admission_contract_check
    check (admission_contract_version = 'production-scoring-admission-v2'),
  add constraint production_scoring_admission_state_check
    check (admission_state in ('OPEN', 'CLOSING', 'CLOSED')),
  add constraint production_scoring_admission_revision_check
    check (admission_revision >= 0),
  add constraint production_scoring_admission_legacy_set_check
    check (legacy_lease_set_fingerprint is null
      or legacy_lease_set_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_admission_enforcement_check
    check (
      (not admission_protocol_enforced and admission_enforced_at is null
        and admission_deployment_id is null)
      or (admission_protocol_enforced and admission_enforced_at is not null
        and admission_opened_at is not null
        and admission_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'
        and legacy_lease_set_fingerprint ~ '^[0-9a-f]{64}$')
    );

create table production_control.vercel_writer_quiesce_evidence (
  evidence_id uuid primary key,
  prior_evidence_id uuid references
    production_control.vercel_writer_quiesce_evidence(evidence_id)
    on delete restrict,
  evidence_request_id uuid not null unique,
  begin_request_fingerprint text not null unique
    check (begin_request_fingerprint ~ '^[0-9a-f]{64}$'),
  begin_payload_hash text not null
    check (begin_payload_hash ~ '^[0-9a-f]{64}$'),
  finalize_request_fingerprint text unique
    check (finalize_request_fingerprint is null
      or finalize_request_fingerprint ~ '^[0-9a-f]{64}$'),
  finalize_payload_hash text
    check (finalize_payload_hash is null
      or finalize_payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'DRAINING'
    check (status in ('DRAINING', 'VERIFIED', 'FAILED')),
  purpose text not null check (purpose in ('REHEARSAL', 'CUTOVER')),
  vercel_project_id text not null
    check (vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'),
  routing_rule_id text not null check (
    routing_rule_id ~ '^[A-Za-z0-9_.:-]{3,160}$'
  ),
  routing_rule_revision text not null check (
    routing_rule_revision ~ '^[A-Za-z0-9_.:-]{1,160}$'
  ),
  routing_rule_scope text not null check (
    routing_rule_scope = 'PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE'
  ),
  candidate_deployment_id text not null
    check (candidate_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'),
  candidate_deployment_commit text not null
    check (candidate_deployment_commit ~ '^[0-9a-f]{40}$'),
  candidate_deployment_target text not null check (
    candidate_deployment_target in ('PREVIEW', 'PRODUCTION')
  ),
  candidate_credential_generation text not null check (
    candidate_credential_generation ~ '^[A-Z0-9_:-]{3,120}$'
  ),
  main_branch_alias_origin text not null check (
    main_branch_alias_origin ~ '^https://[a-z0-9.-]+$'
  ),
  candidate_alias_origin text not null check (
    candidate_alias_origin ~ '^https://[a-z0-9.-]+$'
  ),
  candidate_immutable_origin text not null check (
    candidate_immutable_origin ~ '^https://[a-z0-9.-]+$'
  ),
  origin_inventory jsonb not null
    check (pg_catalog.jsonb_typeof(origin_inventory) = 'array'),
  origin_inventory_count integer not null check (origin_inventory_count = 1140),
  origin_inventory_fingerprint text not null check (
    origin_inventory_fingerprint =
      '533178a28a5458c5f2f727b77af3024de4cc0402c49e90dcd763b950d26fb4c6'
  ),
  live_origin_inventory jsonb not null check (
    pg_catalog.jsonb_typeof(live_origin_inventory) = 'array'
  ),
  live_origin_inventory_count integer not null check (
    live_origin_inventory_count >= 1141
  ),
  live_origin_inventory_fingerprint text not null check (
    live_origin_inventory_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  first_probe_records jsonb not null
    check (pg_catalog.jsonb_typeof(first_probe_records) = 'array'),
  first_probe_fingerprint text not null
    check (first_probe_fingerprint ~ '^[0-9a-f]{64}$'),
  probe_scope_fingerprint text not null
    check (probe_scope_fingerprint ~ '^[0-9a-f]{64}$'),
  second_probe_records jsonb
    check (second_probe_records is null
      or pg_catalog.jsonb_typeof(second_probe_records) = 'array'),
  second_probe_fingerprint text
    check (second_probe_fingerprint is null
      or second_probe_fingerprint ~ '^[0-9a-f]{64}$'),
  deployment_scope_fingerprint text
    check (deployment_scope_fingerprint is null
      or deployment_scope_fingerprint ~ '^[0-9a-f]{64}$'),
  credential_generation_fingerprint text not null
    check (credential_generation_fingerprint ~ '^[0-9a-f]{64}$'),
  credential_confinement_evidence_schema text not null check (
    credential_confinement_evidence_schema =
      'step11-6-production-google-credential-confinement-v1'
  ),
  credential_confinement_record_count integer not null check (
    credential_confinement_record_count = 1140
  ),
  credential_confinement_records_fingerprint text not null check (
    credential_confinement_records_fingerprint =
      'c63962703a60745786ffce2e43e9fef5fa38e12746fce5627f33bfde92c8f508'
  ),
  credential_confinement_evidence_fingerprint text not null check (
    credential_confinement_evidence_fingerprint =
      '1d6f4203fc56226ba4f6881339e9b2dfcede0e413485a110785d28e066a569df'
  ),
  authenticated_actor_fingerprint text not null
    check (authenticated_actor_fingerprint ~ '^[0-9a-f]{64}$'),
  owner_principal_fingerprint text not null
    check (owner_principal_fingerprint ~ '^[0-9a-f]{64}$'),
  owner_override_operationally_frozen boolean not null check (
    owner_override_operationally_frozen
  ),
  owner_acknowledged_at timestamptz not null,
  owner_freeze_expires_at timestamptz not null,
  drain_started_at timestamptz not null default pg_catalog.now(),
  drain_completed_at timestamptz,
  unresolved_request_log_count integer
    check (unresolved_request_log_count is null
      or unresolved_request_log_count >= 0),
  unresolved_google_write_count integer
    check (unresolved_google_write_count is null
      or unresolved_google_write_count >= 0),
  verified_at timestamptz,
  expires_at timestamptz,
  failure_code text check (
    failure_code is null or failure_code ~ '^[A-Z0-9:_-]{3,120}$'
  ),
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (owner_freeze_expires_at > owner_acknowledged_at),
  check (owner_freeze_expires_at <= owner_acknowledged_at + interval '30 minutes'),
  check (owner_acknowledged_at <= drain_started_at),
  check (owner_freeze_expires_at >= drain_started_at + interval '10 minutes'),
  check (
    (purpose = 'REHEARSAL' and candidate_deployment_target = 'PREVIEW')
    or (purpose = 'CUTOVER' and candidate_deployment_target = 'PRODUCTION')
  ),
  check (
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
  )
);

create unique index production_vercel_quiesce_candidate_request_idx
  on production_control.vercel_writer_quiesce_evidence(
    candidate_deployment_id, candidate_deployment_commit, evidence_request_id
  );

create table production_control.vercel_provider_attestation_challenges (
  challenge_id uuid primary key,
  challenge_request_id uuid not null unique,
  operation_request_id uuid not null,
  evidence_request_id uuid not null,
  stage text not null check (stage in ('BEGIN', 'FINALIZE')),
  purpose text not null check (purpose in ('REHEARSAL', 'CUTOVER')),
  issue_request_fingerprint text not null unique
    check (issue_request_fingerprint ~ '^[0-9a-f]{64}$'),
  issue_payload_hash text not null
    check (issue_payload_hash ~ '^[0-9a-f]{64}$'),
  challenge_request_fingerprint text not null unique
    check (challenge_request_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'ISSUED'
    check (status in ('ISSUED', 'CONSUMED')),
  authenticated_actor_fingerprint text not null
    check (authenticated_actor_fingerprint ~ '^[0-9a-f]{64}$'),
  vercel_project_id text not null check (
    vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
  ),
  vercel_team_id text not null check (
    vercel_team_id ~ '^[A-Za-z0-9_.:-]{3,160}$'
  ),
  candidate_deployment_id text not null
    check (candidate_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'),
  candidate_deployment_commit text not null
    check (candidate_deployment_commit ~ '^[0-9a-f]{40}$'),
  candidate_deployment_target text not null check (
    candidate_deployment_target in ('PREVIEW', 'PRODUCTION')
  ),
  candidate_alias_origin text not null check (
    candidate_alias_origin ~ '^https://[a-z0-9.-]+$'
  ),
  candidate_immutable_origin text not null check (
    candidate_immutable_origin ~ '^https://[a-z0-9.-]+$'
  ),
  routing_rule_id text not null check (
    routing_rule_id ~ '^[A-Za-z0-9_.:-]{3,160}$'
  ),
  routing_rule_config_version text not null check (
    routing_rule_config_version ~ '^[A-Za-z0-9_.:-]{1,160}$'
  ),
  routing_rule_scope text not null check (
    routing_rule_scope = 'PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE'
  ),
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  issued_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_attestation_id uuid unique,
  consume_request_id uuid unique,
  consume_request_fingerprint text unique check (
    consume_request_fingerprint is null
      or consume_request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  consume_payload_hash text check (
    consume_payload_hash is null or consume_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (operation_request_id, stage),
  unique (evidence_request_id, stage),
  check (expires_at > issued_at and expires_at <= issued_at + interval '120 seconds'),
  check (
    (purpose = 'REHEARSAL' and candidate_deployment_target = 'PREVIEW')
    or (purpose = 'CUTOVER' and candidate_deployment_target = 'PRODUCTION')
  ),
  check (
    (status = 'ISSUED' and consumed_at is null
      and consumed_attestation_id is null and consume_request_id is null
      and consume_request_fingerprint is null and consume_payload_hash is null)
    or (status = 'CONSUMED' and consumed_at is not null
      and consumed_attestation_id is not null and consume_request_id is not null
      and consume_request_fingerprint is not null
      and consume_payload_hash is not null)
  )
);

-- Vercel configuration and deployment inventory evidence is verified by the
-- server against the configured provider-attestation signing key before it is
-- presented to these RPCs.  The database stores the complete redacted binding
-- and makes attestation/challenge reuse impossible across all rehearsal and
-- cutover receipts.  It intentionally stores no provider token, environment
-- value, signature bytes, or unredacted environment record.
create table production_control.vercel_provider_attestations (
  attestation_id uuid primary key,
  evidence_id uuid references
    production_control.vercel_writer_quiesce_evidence(evidence_id)
    on delete restrict,
  status text not null default 'RESERVED'
    check (status in ('RESERVED', 'BOUND')),
  stage text not null check (stage in ('BEGIN', 'FINALIZE')),
  purpose text not null check (purpose in ('REHEARSAL', 'CUTOVER')),
  attestation_fingerprint text not null unique
    check (attestation_fingerprint ~ '^[0-9a-f]{64}$'),
  signer_key_fingerprint text not null
    check (signer_key_fingerprint ~ '^[0-9a-f]{64}$'),
  signer_key_version text not null check (
    signer_key_version = 'STEP11_6_VERCEL_ATTESTER_V1'
  ),
  challenge_id uuid not null unique,
  challenge_request_fingerprint text not null unique
    check (challenge_request_fingerprint ~ '^[0-9a-f]{64}$'),
  operation_request_id uuid not null,
  evidence_request_id uuid not null,
  request_fingerprint text not null unique
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  receipt_request_fingerprint text unique
    check (receipt_request_fingerprint is null
      or receipt_request_fingerprint ~ '^[0-9a-f]{64}$'),
  signature_verified boolean not null check (signature_verified),
  vercel_project_id text not null check (
    vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
  ),
  vercel_team_id text not null check (
    vercel_team_id ~ '^[A-Za-z0-9_.:-]{3,160}$'
  ),
  candidate_deployment_id text not null
    check (candidate_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'),
  candidate_deployment_commit text not null
    check (candidate_deployment_commit ~ '^[0-9a-f]{40}$'),
  candidate_deployment_target text not null check (
    candidate_deployment_target in ('PREVIEW', 'PRODUCTION')
  ),
  routing_rule_id text not null check (
    routing_rule_id ~ '^[A-Za-z0-9_.:-]{3,160}$'
  ),
  routing_rule_config_version text not null check (
    routing_rule_config_version ~ '^[A-Za-z0-9_.:-]{1,160}$'
  ),
  routing_rule_etag text check (
    routing_rule_etag is null or (
      pg_catalog.btrim(routing_rule_etag) <> ''
      and pg_catalog.length(routing_rule_etag) <= 512
    )
  ),
  routing_rule_fingerprint text not null
    check (routing_rule_fingerprint ~ '^[0-9a-f]{64}$'),
  routing_rule_pending_draft_change_count integer not null check (
    routing_rule_pending_draft_change_count = 0
  ),
  live_origin_inventory_count integer not null
    check (live_origin_inventory_count >= 1141),
  live_origin_inventory_fingerprint text not null
    check (live_origin_inventory_fingerprint ~ '^[0-9a-f]{64}$'),
  live_origin_inventory jsonb not null check (
    pg_catalog.jsonb_typeof(live_origin_inventory) = 'array'
  ),
  redacted_environment_scope_fingerprint text not null
    check (redacted_environment_scope_fingerprint ~ '^[0-9a-f]{64}$'),
  credential_confinement_evidence_schema text not null check (
    credential_confinement_evidence_schema =
      'step11-6-production-google-credential-confinement-v1'
  ),
  credential_confinement_record_count integer not null check (
    credential_confinement_record_count = 1140
  ),
  credential_confinement_records_fingerprint text not null check (
    credential_confinement_records_fingerprint =
      'c63962703a60745786ffce2e43e9fef5fa38e12746fce5627f33bfde92c8f508'
  ),
  credential_confinement_evidence_fingerprint text not null check (
    credential_confinement_evidence_fingerprint =
      '1d6f4203fc56226ba4f6881339e9b2dfcede0e413485a110785d28e066a569df'
  ),
  provider_observed_at timestamptz not null,
  binding_expires_at timestamptz not null,
  bound_at timestamptz,
  recorded_at timestamptz not null default pg_catalog.now(),
  unique (evidence_id, stage),
  unique (operation_request_id, stage),
  unique (evidence_request_id, stage),
  check (attestation_id <> challenge_id),
  check (binding_expires_at > recorded_at
    and binding_expires_at <= recorded_at + interval '30 minutes'),
  check (
    (status = 'RESERVED' and evidence_id is null
      and receipt_request_fingerprint is null and bound_at is null)
    or (status = 'BOUND' and evidence_id is not null
      and receipt_request_fingerprint is not null and bound_at is not null)
  )
);

alter table production_control.vercel_provider_attestations
  add constraint production_vercel_provider_attestation_challenge_fkey
    foreign key (challenge_id) references
      production_control.vercel_provider_attestation_challenges(challenge_id)
    on delete restrict;
alter table production_control.vercel_provider_attestation_challenges
  add constraint production_vercel_provider_challenge_consumed_attestation_fkey
    foreign key (consumed_attestation_id) references
      production_control.vercel_provider_attestations(attestation_id)
    on delete restrict;

create table production_control.google_writer_provider_fences (
  fence_id uuid primary key,
  install_request_id uuid not null unique,
  begin_request_fingerprint text not null unique
    check (begin_request_fingerprint ~ '^[0-9a-f]{64}$'),
  begin_payload_hash text not null
    check (begin_payload_hash ~ '^[0-9a-f]{64}$'),
  finish_request_fingerprint text unique
    check (finish_request_fingerprint is null
      or finish_request_fingerprint ~ '^[0-9a-f]{64}$'),
  finish_payload_hash text
    check (finish_payload_hash is null
      or finish_payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'INSTALLING' check (status in (
    'INSTALLING', 'INSTALLED', 'REMOVAL_AUTHORIZED', 'REMOVED', 'FAILED'
  )),
  quiesce_evidence_id uuid not null references
    production_control.vercel_writer_quiesce_evidence(evidence_id)
    on delete restrict,
  candidate_deployment_id text not null
    check (candidate_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'),
  candidate_deployment_commit text not null
    check (candidate_deployment_commit ~ '^[0-9a-f]{40}$'),
  source_workbook_id text not null check (
    source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
  ),
  dedicated_principal_fingerprint text not null
    check (dedicated_principal_fingerprint ~ '^[0-9a-f]{64}$'),
  legacy_credential_generation_fingerprint text not null
    check (legacy_credential_generation_fingerprint ~ '^[0-9a-f]{64}$'),
  baseline_provider_fingerprint text not null
    check (baseline_provider_fingerprint ~ '^[0-9a-f]{64}$'),
  baseline_acl_fingerprint text not null
    check (baseline_acl_fingerprint ~ '^[0-9a-f]{64}$'),
  baseline_canonical_value_fingerprint text not null
    check (baseline_canonical_value_fingerprint ~ '^[0-9a-f]{64}$'),
  baseline_formula_fingerprint text not null
    check (baseline_formula_fingerprint ~ '^[0-9a-f]{64}$'),
  baseline_combined_value_fingerprint text not null
    check (baseline_combined_value_fingerprint ~ '^[0-9a-f]{64}$'),
  writer_scope_fingerprint text not null
    check (writer_scope_fingerprint ~ '^[0-9a-f]{64}$'),
  canonical_sheet_union_fingerprint text not null
    check (canonical_sheet_union_fingerprint ~ '^[0-9a-f]{64}$'),
  protection_description_prefix text not null unique check (
    protection_description_prefix ~
      '^STEP12_GOOGLE_WRITER_PROVIDER_FENCE:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  active_verification_id uuid,
  removal_request_id uuid unique,
  removal_request_fingerprint text unique check (
    removal_request_fingerprint is null
      or removal_request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  removal_payload_hash text check (
    removal_payload_hash is null or removal_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  pre_remove_provider_fingerprint text check (
    pre_remove_provider_fingerprint is null
      or pre_remove_provider_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  expected_post_remove_provider_fingerprint text check (
    expected_post_remove_provider_fingerprint is null
      or expected_post_remove_provider_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  pre_remove_acl_fingerprint text check (
    pre_remove_acl_fingerprint is null
      or pre_remove_acl_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  pre_remove_canonical_value_fingerprint text check (
    pre_remove_canonical_value_fingerprint is null
      or pre_remove_canonical_value_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  pre_remove_combined_value_fingerprint text check (
    pre_remove_combined_value_fingerprint is null
      or pre_remove_combined_value_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  pre_remove_formula_fingerprint text check (
    pre_remove_formula_fingerprint is null
      or pre_remove_formula_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  removal_activation_revision bigint,
  removal_authority_generation_id uuid,
  removal_admission_generation_id uuid,
  removal_admission_revision bigint,
  removal_authorized_at timestamptz,
  removal_finish_request_fingerprint text unique check (
    removal_finish_request_fingerprint is null
      or removal_finish_request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  removal_finish_payload_hash text check (
    removal_finish_payload_hash is null
      or removal_finish_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  restoration_evidence_fingerprint text check (
    restoration_evidence_fingerprint is null
      or restoration_evidence_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  authenticated_actor_fingerprint text not null
    check (authenticated_actor_fingerprint ~ '^[0-9a-f]{64}$'),
  installing_at timestamptz not null default pg_catalog.now(),
  installed_at timestamptz,
  removed_at timestamptz,
  failure_code text check (
    failure_code is null or failure_code ~ '^[A-Z0-9:_-]{3,120}$'
  ),
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    (status = 'INSTALLING' and installed_at is null
      and active_verification_id is null and removed_at is null)
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
  )
);

create unique index production_google_writer_one_active_provider_fence_idx
  on production_control.google_writer_provider_fences((true))
  where status in ('INSTALLING', 'INSTALLED', 'REMOVAL_AUTHORIZED');

create unique index production_google_writer_active_candidate_provider_fence_idx
  on production_control.google_writer_provider_fences(
    candidate_deployment_id, candidate_deployment_commit
  )
  where status in ('INSTALLING', 'INSTALLED', 'REMOVAL_AUTHORIZED');

create table production_control.google_writer_provider_fence_verifications (
  verification_id uuid primary key,
  fence_id uuid not null references
    production_control.google_writer_provider_fences(fence_id)
    on delete restrict,
  quiesce_evidence_id uuid not null references
    production_control.vercel_writer_quiesce_evidence(evidence_id)
    on delete restrict,
  request_fingerprint text not null unique
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  protection_records jsonb not null
    check (pg_catalog.jsonb_typeof(protection_records) = 'array'),
  protected_sheet_ids jsonb not null
    check (pg_catalog.jsonb_typeof(protected_sheet_ids) = 'array'),
  protected_range_ids jsonb not null
    check (pg_catalog.jsonb_typeof(protected_range_ids) = 'array'),
  protection_count integer not null check (protection_count = 17),
  protection_set_fingerprint text not null
    check (protection_set_fingerprint ~ '^[0-9a-f]{64}$'),
  provider_fingerprint text not null
    check (provider_fingerprint ~ '^[0-9a-f]{64}$'),
  acl_fingerprint text not null check (acl_fingerprint ~ '^[0-9a-f]{64}$'),
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
  legacy_deployments_fenced boolean not null check (legacy_deployments_fenced),
  legacy_google_credentials_fenced boolean not null check (
    legacy_google_credentials_fenced
  ),
  non_owner_manual_google_scoring_fenced boolean not null check (
    non_owner_manual_google_scoring_fenced
  ),
  owner_override_operationally_frozen boolean not null check (
    owner_override_operationally_frozen
  ),
  recovery_only boolean not null default false,
  captured_at timestamptz not null,
  expires_at timestamptz not null,
  actor_id text not null,
  created_at timestamptz not null default pg_catalog.now(),
  check (expires_at > captured_at),
  check (expires_at <= captured_at + interval '30 minutes')
);

alter table production_control.google_writer_provider_fences
  add constraint production_google_writer_provider_fence_active_verification_fkey
    foreign key (active_verification_id)
    references production_control.google_writer_provider_fence_verifications(
      verification_id
    ) on delete restrict;

alter table production_control.cutover_activation_state
  add column if not exists active_google_writer_provider_fence_id uuid
    references production_control.google_writer_provider_fences(fence_id)
    on delete restrict,
  add column if not exists active_google_writer_provider_verification_id uuid
    references production_control.google_writer_provider_fence_verifications(
      verification_id
    ) on delete restrict,
  add column if not exists active_vercel_quiesce_evidence_id uuid
    references production_control.vercel_writer_quiesce_evidence(evidence_id)
    on delete restrict;

alter table scoring_authority.ingress_gates
  add column if not exists google_writer_provider_fence_id uuid
    references production_control.google_writer_provider_fences(fence_id)
    on delete restrict,
  add column if not exists google_writer_provider_verification_id uuid
    references production_control.google_writer_provider_fence_verifications(
      verification_id
    ) on delete restrict;

alter table production_control.vercel_writer_quiesce_evidence enable row level security;
alter table production_control.vercel_provider_attestation_challenges
  enable row level security;
alter table production_control.vercel_provider_attestations enable row level security;
alter table production_control.google_writer_provider_fences enable row level security;
alter table production_control.google_writer_provider_fence_verifications
  enable row level security;

create table production_control.scoring_external_fence_evidence (
  evidence_id uuid primary key default extensions.gen_random_uuid(),
  request_fingerprint text not null unique
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  deployment_commit text not null check (deployment_commit ~ '^[0-9a-f]{40}$'),
  deployment_id text not null check (deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'),
  vercel_project_id text not null
    check (vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'),
  source_workbook_id text not null
    check (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  provider_evidence_fingerprint text not null
    check (provider_evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  deployment_scope_fingerprint text not null
    check (deployment_scope_fingerprint ~ '^[0-9a-f]{64}$'),
  google_credential_scope_fingerprint text not null
    check (google_credential_scope_fingerprint ~ '^[0-9a-f]{64}$'),
  writer_coverage_fingerprint text not null
    check (writer_coverage_fingerprint ~ '^[0-9a-f]{64}$'),
  legacy_lease_set_fingerprint text not null
    check (legacy_lease_set_fingerprint ~ '^[0-9a-f]{64}$'),
  legacy_lease_count integer not null check (legacy_lease_count >= 0),
  legacy_deployments_fenced boolean not null,
  legacy_google_credentials_fenced boolean not null,
  non_owner_manual_google_scoring_fenced boolean not null,
  owner_override_operationally_frozen boolean not null,
  captured_at timestamptz not null,
  expires_at timestamptz not null,
  actor_id text not null,
  quiesce_evidence_id uuid not null references
    production_control.vercel_writer_quiesce_evidence(evidence_id)
    on delete restrict,
  provider_fence_id uuid not null references
    production_control.google_writer_provider_fences(fence_id)
    on delete restrict,
  provider_fence_verification_id uuid not null references
    production_control.google_writer_provider_fence_verifications(
      verification_id
    ) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  check (expires_at > captured_at),
  check (expires_at <= captured_at + interval '30 minutes'),
  check (legacy_deployments_fenced and legacy_google_credentials_fenced
    and non_owner_manual_google_scoring_fenced
    and owner_override_operationally_frozen)
);

create table production_control.scoring_admission_closures (
  closure_id uuid primary key default extensions.gen_random_uuid(),
  closure_kind text not null default 'LEGACY_ADMISSION'
    check (closure_kind in ('LEGACY_ADMISSION', 'SUPABASE_INGRESS')),
  prior_legacy_closure_id uuid,
  tournament_id text not null references scoring_authority.tournaments(tournament_id)
    on delete restrict,
  authority text not null check (authority in ('GOOGLE', 'SUPABASE')),
  authority_generation_id uuid not null,
  admission_generation_id uuid not null,
  deployment_id text not null check (deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'),
  status text not null default 'CLOSING'
    check (status in ('CLOSING', 'CLOSED', 'REOPENED', 'CONSUMED')),
  opening_admission_revision bigint not null check (opening_admission_revision >= 0),
  closing_admission_revision bigint not null check (closing_admission_revision > 0),
  closed_admission_revision bigint check (closed_admission_revision is null
    or closed_admission_revision >= closing_admission_revision),
  lease_high_watermark bigint not null default 0 check (lease_high_watermark >= 0),
  start_source_fingerprint text
    check (start_source_fingerprint is null or start_source_fingerprint ~ '^[0-9a-f]{64}$'),
  final_source_fingerprint text
    check (final_source_fingerprint is null or final_source_fingerprint ~ '^[0-9a-f]{64}$'),
  reconciliation_fingerprint text
    check (reconciliation_fingerprint is null or reconciliation_fingerprint ~ '^[0-9a-f]{64}$'),
  lease_set_fingerprint text
    check (lease_set_fingerprint is null or lease_set_fingerprint ~ '^[0-9a-f]{64}$'),
  supabase_match_revisions jsonb,
  google_checkpoints jsonb,
  external_fence_evidence_id uuid not null
    references production_control.scoring_external_fence_evidence(evidence_id)
    on delete restrict,
  google_writer_provider_fence_id uuid not null
    references production_control.google_writer_provider_fences(fence_id)
    on delete restrict,
  google_writer_provider_verification_id uuid not null
    references production_control.google_writer_provider_fence_verifications(
      verification_id
    ) on delete restrict,
  close_request_fingerprint text not null unique
    check (close_request_fingerprint ~ '^[0-9a-f]{64}$'),
  close_payload_hash text not null check (close_payload_hash ~ '^[0-9a-f]{64}$'),
  closing_at timestamptz not null default pg_catalog.now(),
  closed_at timestamptz,
  reopened_at timestamptz,
  consumed_at timestamptz,
  actor_id text not null,
  consumed_epoch_id uuid references scoring_authority.authority_epochs(epoch_id)
    on delete restrict,
  check (
    (status = 'CLOSING' and closed_at is null and reopened_at is null and consumed_at is null)
    or (status = 'CLOSED' and closed_at is not null and reopened_at is null and consumed_at is null)
    or (status = 'REOPENED' and reopened_at is not null and consumed_at is null)
    or (status = 'CONSUMED' and closed_at is not null and consumed_at is not null
      and consumed_epoch_id is not null)
  ),
  check (
    status = 'CLOSING'
    or (
      closed_admission_revision is not null
      and final_source_fingerprint is not null
      and reconciliation_fingerprint is not null
      and lease_set_fingerprint is not null
      and pg_catalog.jsonb_typeof(supabase_match_revisions) = 'object'
      and pg_catalog.jsonb_typeof(google_checkpoints) = 'object'
    )
    or status = 'REOPENED'
  )
);

-- Durable Step 11.6 provider-fence rehearsal receipt.  This is deliberately
-- separate from the short-lived Step 12 external-fence evidence above: the
-- rehearsal must finish with the Google provider restored and Production still
-- DORMANT, while its proof remains queryable for cutover certification.
create table production_control.google_writer_fence_rehearsals (
  run_id uuid primary key,
  rehearsal_request_id uuid not null unique,
  begin_request_fingerprint text not null unique
    check (begin_request_fingerprint ~ '^[0-9a-f]{64}$'),
  begin_payload_hash text not null
    check (begin_payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'RUNNING'
    check (status in ('RUNNING', 'RESTORED', 'FAILED')),
  quiesce_evidence_id uuid not null references
    production_control.vercel_writer_quiesce_evidence(evidence_id)
    on delete restrict,
  candidate_deployment_id text not null unique
    check (candidate_deployment_id ~ '^dpl_[A-Za-z0-9]{8,64}$'),
  candidate_deployment_commit text not null
    check (candidate_deployment_commit ~ '^[0-9a-f]{40}$'),
  vercel_project_id text not null
    check (vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'),
  project_ref text not null
    check (project_ref = 'ymqhhtxaywtqllynrmxe'),
  source_workbook_id text not null
    check (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  tournament_id text not null check (tournament_id = '2026'),
  dedicated_google_service_account text not null
    check (dedicated_google_service_account =
      'sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com'),
  activation_revision bigint not null check (activation_revision >= 0),
  authority_generation_id uuid not null,
  admission_generation_id uuid not null,
  admission_revision bigint not null check (admission_revision >= 0),
  baseline_provider_fingerprint text not null
    check (baseline_provider_fingerprint ~ '^[0-9a-f]{64}$'),
  baseline_protected_ranges_fingerprint text not null
    check (baseline_protected_ranges_fingerprint ~ '^[0-9a-f]{64}$'),
  baseline_canonical_value_fingerprint text not null
    check (baseline_canonical_value_fingerprint ~ '^[0-9a-f]{64}$'),
  writer_scope_fingerprint text not null
    check (writer_scope_fingerprint ~ '^[0-9a-f]{64}$'),
  edge_quiesce_fingerprint text not null
    check (edge_quiesce_fingerprint ~ '^[0-9a-f]{64}$'),
  origin_matrix_fingerprint text not null
    check (origin_matrix_fingerprint ~ '^[0-9a-f]{64}$'),
  owner_principal_fingerprint text not null
    check (owner_principal_fingerprint ~ '^[0-9a-f]{64}$'),
  canonical_sheet_union_fingerprint text not null
    check (canonical_sheet_union_fingerprint ~ '^[0-9a-f]{64}$'),
  owner_override_operationally_frozen boolean not null,
  owner_acknowledged_at timestamptz not null,
  owner_freeze_expires_at timestamptz not null,
  protection_description_prefix text not null unique
    check (protection_description_prefix ~
      '^STEP11_6_WRITER_FENCE_REHEARSAL:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  finish_request_fingerprint text unique
    check (finish_request_fingerprint is null
      or finish_request_fingerprint ~ '^[0-9a-f]{64}$'),
  finish_payload_hash text
    check (finish_payload_hash is null or finish_payload_hash ~ '^[0-9a-f]{64}$'),
  provider_evidence_fingerprint text
    check (provider_evidence_fingerprint is null
      or provider_evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  fenced_provider_fingerprint text
    check (fenced_provider_fingerprint is null
      or fenced_provider_fingerprint ~ '^[0-9a-f]{64}$'),
  restored_provider_fingerprint text
    check (restored_provider_fingerprint is null
      or restored_provider_fingerprint ~ '^[0-9a-f]{64}$'),
  restored_protected_ranges_fingerprint text
    check (restored_protected_ranges_fingerprint is null
      or restored_protected_ranges_fingerprint ~ '^[0-9a-f]{64}$'),
  restored_canonical_value_fingerprint text
    check (restored_canonical_value_fingerprint is null
      or restored_canonical_value_fingerprint ~ '^[0-9a-f]{64}$'),
  restoration_evidence_fingerprint text
    check (restoration_evidence_fingerprint is null
      or restoration_evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  run_owned_protection_ids jsonb not null default '[]'::jsonb
    check (pg_catalog.jsonb_typeof(run_owned_protection_ids) = 'array'),
  active_run_owned_protection_count integer
    check (active_run_owned_protection_count is null
      or active_run_owned_protection_count >= 0),
  dedicated_identity_can_edit boolean,
  legacy_identity_denied boolean,
  google_value_writes_performed boolean,
  preview_resources_accessed boolean,
  restoration_confirmed boolean not null default false,
  certification_passed boolean,
  failure_code text
    check (failure_code is null or failure_code ~ '^[A-Z0-9:_-]{3,120}$'),
  actor_id text not null check (
    pg_catalog.btrim(actor_id) <> '' and pg_catalog.length(actor_id) <= 160
  ),
  started_at timestamptz not null default pg_catalog.now(),
  finished_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  check (owner_override_operationally_frozen),
  check (owner_freeze_expires_at > owner_acknowledged_at),
  check (owner_freeze_expires_at <= owner_acknowledged_at + interval '30 minutes'),
  check (owner_acknowledged_at <= started_at
    and owner_freeze_expires_at > started_at),
  check (
    (status = 'RUNNING' and finished_at is null
      and finish_request_fingerprint is null and finish_payload_hash is null
      and certification_passed is null)
    or (status = 'FAILED' and finished_at is not null
      and finish_request_fingerprint is not null and finish_payload_hash is not null
      and failure_code is not null and not certification_passed
      and (
        not restoration_confirmed
        or (
          active_run_owned_protection_count = 0
          and not google_value_writes_performed
          and not preview_resources_accessed
          and restored_provider_fingerprint = baseline_provider_fingerprint
          and restored_protected_ranges_fingerprint =
            baseline_protected_ranges_fingerprint
          and restored_canonical_value_fingerprint =
            baseline_canonical_value_fingerprint
          and provider_evidence_fingerprint is not null
          and restoration_evidence_fingerprint is not null
        )
      ))
    or (status = 'RESTORED' and finished_at is not null
      and finish_request_fingerprint is not null and finish_payload_hash is not null
      and certification_passed
      and restoration_confirmed
      and active_run_owned_protection_count = 0
      and dedicated_identity_can_edit
      and legacy_identity_denied
      and not google_value_writes_performed
      and not preview_resources_accessed
      and restored_provider_fingerprint = baseline_provider_fingerprint
      and restored_protected_ranges_fingerprint =
        baseline_protected_ranges_fingerprint
      and restored_canonical_value_fingerprint =
        baseline_canonical_value_fingerprint
      and provider_evidence_fingerprint is not null
      and fenced_provider_fingerprint is not null
      and restoration_evidence_fingerprint is not null)
  )
);

create unique index production_google_writer_fence_rehearsal_candidate_idx
  on production_control.google_writer_fence_rehearsals(
    candidate_deployment_id, candidate_deployment_commit
  );

alter table production_control.google_writer_fence_rehearsals
  enable row level security;

alter table production_control.scoring_admission_closures
  add constraint production_scoring_admission_prior_legacy_closure_fkey
    foreign key (prior_legacy_closure_id)
    references production_control.scoring_admission_closures(closure_id)
    on delete restrict,
  add constraint production_scoring_admission_closure_kind_shape_check
    check (
      (closure_kind = 'LEGACY_ADMISSION'
        and prior_legacy_closure_id is null
        and authority = 'GOOGLE')
      or (closure_kind = 'SUPABASE_INGRESS'
        and prior_legacy_closure_id is not null
        and authority = 'SUPABASE')
    );

alter table scoring_authority.ingress_gates
  add constraint production_scoring_admission_active_closure_fkey
    foreign key (active_closure_id)
    references production_control.scoring_admission_closures(closure_id)
    on delete restrict,
  add constraint production_scoring_admission_external_fence_fkey
    foreign key (external_fence_evidence_id)
    references production_control.scoring_external_fence_evidence(evidence_id)
    on delete restrict;

create sequence production_control.scoring_admission_lease_sequence;

alter table scoring_authority.scoring_ingress_leases
  add column if not exists protocol_version text not null default 'LEGACY_V1',
  add column if not exists admission_sequence bigint,
  add column if not exists admission_generation_id uuid,
  add column if not exists admission_revision bigint,
  add column if not exists admitted_activation_revision bigint,
  add column if not exists lease_nonce_hash text,
  add column if not exists operation_request_id uuid,
  add column if not exists writer_intent text,
  add column if not exists request_payload_hash text,
  add column if not exists resolution_state text not null default 'LEGACY_UNCLASSIFIED',
  add column if not exists write_started_at timestamptz,
  add column if not exists outcome_reported_at timestamptz,
  add column if not exists provider_mutation_key text,
  add column if not exists provider_before_fingerprint text,
  add column if not exists provider_after_fingerprint text,
  add column if not exists provider_readback_fingerprint text,
  add column if not exists outcome_evidence_fingerprint text,
  add column if not exists resolution_fingerprint text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text,
  add column if not exists close_fence_id uuid
    references production_control.scoring_admission_closures(closure_id)
    on delete restrict,
  add column if not exists last_error_code text;

alter table scoring_authority.scoring_ingress_leases
  add constraint production_scoring_lease_protocol_version_check
    check (protocol_version in ('LEGACY_V1', 'ADMISSION_V2')),
  add constraint production_scoring_lease_resolution_state_check
    check (resolution_state in (
      'LEGACY_UNCLASSIFIED', 'ADMITTED', 'WRITE_STARTED',
      'CONFIRMED_WRITE', 'PROVEN_NO_WRITE', 'AMBIGUOUS', 'PARTIAL_WRITE',
      'RESOLVED_WRITE', 'RESOLVED_NO_WRITE'
    )),
  add constraint production_scoring_lease_admission_sequence_check
    check (admission_sequence is null or admission_sequence > 0),
  add constraint production_scoring_lease_admission_revision_check
    check (admission_revision is null or admission_revision >= 0),
  add constraint production_scoring_lease_activation_revision_check
    check (admitted_activation_revision is null or admitted_activation_revision >= 0),
  add constraint production_scoring_lease_nonce_hash_check
    check (lease_nonce_hash is null or lease_nonce_hash ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_writer_intent_check
    check (writer_intent is null or writer_intent = 'CANONICAL_LEGACY'),
  add constraint production_scoring_lease_request_payload_hash_check
    check (request_payload_hash is null or request_payload_hash ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_provider_before_check
    check (provider_before_fingerprint is null or provider_before_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_provider_after_check
    check (provider_after_fingerprint is null or provider_after_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_provider_readback_check
    check (provider_readback_fingerprint is null or provider_readback_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_outcome_evidence_check
    check (outcome_evidence_fingerprint is null or outcome_evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_resolution_fingerprint_check
    check (resolution_fingerprint is null or resolution_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_scoring_lease_v2_shape_check
    check (
      protocol_version <> 'ADMISSION_V2'
      or (
        admission_sequence is not null
        and admission_generation_id is not null
        and admission_revision is not null
        and admitted_activation_revision is not null
        and lease_nonce_hash is not null
        and operation_request_id is not null
        and writer_intent = 'CANONICAL_LEGACY'
        and request_payload_hash is not null
        and request_fingerprint is not null
      )
    );

alter table scoring_authority.ingress_gates
  add constraint production_scoring_admission_gate_shape_check
    check (
      not admission_protocol_enforced
      or (
        (admission_state = 'OPEN' and active_closure_id is null)
        or (admission_state in ('CLOSING', 'CLOSED')
          and active_closure_id is not null
          and external_fence_evidence_id is not null)
      )
    );

create unique index production_scoring_admission_v2_request_idx
  on scoring_authority.scoring_ingress_leases(request_fingerprint)
  where protocol_version = 'ADMISSION_V2';
create unique index production_scoring_admission_v2_operation_request_idx
  on scoring_authority.scoring_ingress_leases(
    tournament_id, operation_request_id
  ) where protocol_version = 'ADMISSION_V2';
create unique index production_scoring_admission_v2_sequence_idx
  on scoring_authority.scoring_ingress_leases(admission_sequence)
  where admission_sequence is not null;
create index production_scoring_admission_v2_unresolved_idx
  on scoring_authority.scoring_ingress_leases(
    tournament_id, admission_generation_id, resolution_state, expires_at
  ) where protocol_version = 'ADMISSION_V2';

alter table scoring_authority.authority_epochs
  add column if not exists admission_closure_id uuid
    references production_control.scoring_admission_closures(closure_id)
    on delete restrict,
  add column if not exists admission_generation_id uuid,
  add column if not exists closed_admission_revision bigint,
  add column if not exists closure_boundary_fingerprint text,
  add column if not exists prior_source_fingerprint text,
  add column if not exists external_fence_evidence_id uuid
    references production_control.scoring_external_fence_evidence(evidence_id)
    on delete restrict,
  add column if not exists google_writer_provider_fence_id uuid
    references production_control.google_writer_provider_fences(fence_id)
    on delete restrict,
  add column if not exists google_writer_provider_verification_id uuid
    references production_control.google_writer_provider_fence_verifications(
      verification_id
    ) on delete restrict;

alter table scoring_authority.authority_epochs
  add constraint production_authority_epoch_closed_admission_revision_check
    check (closed_admission_revision is null or closed_admission_revision > 0),
  add constraint production_authority_epoch_closure_boundary_check
    check (closure_boundary_fingerprint is null
      or closure_boundary_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_authority_epoch_prior_source_fingerprint_check
    check (prior_source_fingerprint is null
      or prior_source_fingerprint ~ '^[0-9a-f]{64}$');

alter table production_control.scoring_external_fence_evidence enable row level security;
alter table production_control.scoring_admission_closures enable row level security;

create or replace function production_control.scoring_admission_lock_key()
returns bigint
language sql
immutable
security definer
set search_path = pg_catalog
as $$ select 731102026032::bigint $$;

create or replace function production_control.scoring_admission_unresolved_count(
  target_generation uuid
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.count(*)::integer
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.protocol_version = 'ADMISSION_V2'
    and lease.admission_generation_id = target_generation
    and lease.resolution_state in (
      'ADMITTED', 'WRITE_STARTED', 'AMBIGUOUS', 'PARTIAL_WRITE',
      'LEGACY_UNCLASSIFIED'
    )
$$;

create or replace function production_control.scoring_admission_legacy_blocker_count(
  enforcement_started_at timestamptz
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.count(*)::integer
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.protocol_version = 'LEGACY_V1'
    and lease.resolution_state = 'LEGACY_UNCLASSIFIED'
$$;

comment on function production_control.scoring_admission_legacy_blocker_count(timestamptz)
is 'The timestamp argument is retained for call compatibility. Every unclassified LEGACY_V1 row blocks closure regardless of age or legacy status until audited provider readback classifies it.';

create or replace function production_control.scoring_admission_legacy_set_fingerprint()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'match_id', lease.match_id,
      'authority', lease.authority,
      'status', lease.status,
      'created_at', lease.created_at,
      'expires_at', lease.expires_at,
      'completed_at', lease.completed_at,
      'request_fingerprint', lease.request_fingerprint
    ) order by lease.created_at, lease.lease_id), '[]'::jsonb)::text,
    'sha256'
  ), 'hex')
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.protocol_version = 'LEGACY_V1'
$$;

create or replace function production_control.scoring_admission_lease_set_fingerprint(
  target_generation uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'admission_sequence', lease.admission_sequence,
      'match_id', lease.match_id,
      'operation', lease.operation,
      'resolution_state', lease.resolution_state,
      'provider_readback_fingerprint', lease.provider_readback_fingerprint,
      'resolution_fingerprint', lease.resolution_fingerprint
    ) order by lease.admission_sequence, lease.lease_id), '[]'::jsonb)::text,
    'sha256'
  ), 'hex')
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.protocol_version = 'ADMISSION_V2'
    and lease.admission_generation_id = target_generation
$$;

create or replace function production_control.expected_google_writer_fence_sheet_ids()
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select '[0,28074660,214637017,270637829,314908504,388354025,625223812,804336907,844307454,1074655326,1403525379,1404770729,1471947317,1677468900,1763222762,1802214847,1940053655]'::jsonb
$$;

create or replace function production_control.normalized_vercel_origin_inventory(
  input jsonb
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    value->>0,
    case when value->1 = 'null'::jsonb then null
      else pg_catalog.lower(value->>1) end,
    pg_catalog.lower(pg_catalog.rtrim(value->>2, '/')),
    value->>3,
    value->>4,
    value->>5
  ) order by (value->>0) collate "C",
    pg_catalog.lower(pg_catalog.rtrim(value->>2, '/'))), '[]'::jsonb)
  from pg_catalog.jsonb_array_elements(input) value
$$;

create or replace function production_control.vercel_origin_inventory_fingerprint(
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
      '[' || pg_catalog.to_jsonb(value->>0)::text
      || ',' || case when value->1 = 'null'::jsonb then 'null'
        else pg_catalog.to_jsonb(pg_catalog.lower(value->>1))::text end
      || ',' || pg_catalog.to_jsonb(
        pg_catalog.lower(pg_catalog.rtrim(value->>2, '/'))
      )::text
      || ',' || pg_catalog.to_jsonb(value->>3)::text
      || ',' || pg_catalog.to_jsonb(value->>4)::text
      || ',' || pg_catalog.to_jsonb(value->>5)::text || ']',
      ',' order by (value->>0) collate "C",
        pg_catalog.lower(pg_catalog.rtrim(value->>2, '/'))
    ), '') || ']')::text,
    'sha256'
  ), 'hex')
  from pg_catalog.jsonb_array_elements(input) value
$$;

create or replace function production_control.normalized_vercel_probe_records(
  input jsonb
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    pg_catalog.lower(pg_catalog.rtrim(value->>0, '/')),
    value->>1,
    case when value->2 = 'null'::jsonb then null else value->>2 end,
    case when value->3 = 'null'::jsonb then null
      else pg_catalog.lower(value->>3) end,
    case when value->4 = 'null'::jsonb then null else value->>4 end,
    case when value->5 = 'null'::jsonb then null else value->>5 end,
    case when value->6 = 'null'::jsonb then null else value->>6 end,
    case when value->7 = 'null'::jsonb then null else (
      select coalesce(pg_catalog.jsonb_agg(capability #>> '{}'
        order by (capability #>> '{}') collate "C"), '[]'::jsonb)
      from pg_catalog.jsonb_array_elements(value->7) capability
    ) end,
    value->8,
    case when pg_catalog.jsonb_typeof(value->9) = 'array' then (
      select pg_catalog.jsonb_agg(pg_catalog.lower(proof #>> '{}') order by n)
      from pg_catalog.jsonb_array_elements(value->9)
        with ordinality proofs(proof, n)
    ) else value->9 end,
    value->>10
  ) order by pg_catalog.lower(pg_catalog.rtrim(value->>0, '/'))
      collate "C"),
  '[]'::jsonb)
  from pg_catalog.jsonb_array_elements(input) value
$$;

create or replace function production_control.normalized_vercel_probe_scope(
  input jsonb
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    value->0, value->1, value->2, value->3, value->4,
    value->5, value->6, value->7, value->8
  ) order by (value->>0) collate "C"), '[]'::jsonb)
  from pg_catalog.jsonb_array_elements(input) value
$$;

create or replace function production_control.structured_evidence_fingerprint(
  input jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(input::text, 'sha256'), 'hex')
$$;

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
        'live_origin_inventory', attestation.live_origin_inventory,
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
        'bound_at', attestation.bound_at
      )
      from production_control.vercel_provider_attestations attestation
      where attestation.attestation_id = value.consumed_attestation_id
    ),
    'consume_request_id', value.consume_request_id,
    'idempotent', was_idempotent
  )
$$;

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
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = '' then
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
      and value.stage = 'BEGIN';
    if evidence.status is distinct from 'DRAINING'
       or evidence.purpose is distinct from purpose_value
       or begin_challenge.status is distinct from 'CONSUMED'
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
      'stage', stage_value,
      'purpose', purpose_value,
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
      'issuedAt', issued_time,
      'expiresAt', expiry_time
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
    input->>'routing_rule_scope',
    pg_catalog.left(input->>'actor_id', 160), issued_time, expiry_time
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

create or replace function public.inspect_production_vercel_provider_attestation_challenge(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  challenge production_control.vercel_provider_attestation_challenges%rowtype;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'evidence_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.upper(coalesce(input->>'stage', ''))
       not in ('BEGIN', 'FINALIZE')
     or pg_catalog.upper(coalesce(input->>'purpose', ''))
       not in ('REHEARSAL', 'CUTOVER')
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or input->>'candidate_deployment_target' not in ('PREVIEW', 'PRODUCTION')
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = '' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_INSPECT_INPUT_INVALID';
  end if;
  select * into challenge
  from production_control.vercel_provider_attestation_challenges value
  where value.operation_request_id = (input->>'operation_request_id')::uuid
    and value.evidence_request_id = (input->>'evidence_request_id')::uuid
    and value.stage = pg_catalog.upper(input->>'stage');
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'found', false,
      'code', 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_NOT_FOUND',
      'operation_request_id', input->>'operation_request_id',
      'evidence_request_id', input->>'evidence_request_id',
      'stage', pg_catalog.upper(input->>'stage'), 'idempotent', true
    );
  end if;
  if (nullif(input->>'challenge_id', '') is not null
       and challenge.challenge_id is distinct from
         (input->>'challenge_id')::uuid)
     or challenge.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or challenge.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or challenge.purpose is distinct from pg_catalog.upper(input->>'purpose')
     or challenge.candidate_deployment_target is distinct from
       input->>'candidate_deployment_target'
     or challenge.authenticated_actor_fingerprint is distinct from
       input->>'authenticated_actor_fingerprint'
     or challenge.actor_id is distinct from
       pg_catalog.left(input->>'actor_id', 160) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_OWNERSHIP_MISMATCH';
  end if;
  return production_control.vercel_provider_attestation_challenge_response(
    challenge, true
  );
end;
$$;

create or replace function production_control.expected_vercel_live_inventory(
  retained_inventory jsonb,
  candidate_deployment_id text,
  candidate_deployment_commit text,
  candidate_immutable_origin text,
  candidate_deployment_target text
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select production_control.normalized_vercel_origin_inventory(
    retained_inventory || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_array(
        candidate_deployment_id,
        pg_catalog.lower(candidate_deployment_commit),
        pg_catalog.lower(pg_catalog.rtrim(candidate_immutable_origin, '/')),
        case candidate_deployment_target
          when 'PREVIEW' then 'FEATURE_PREVIEW'
          when 'PRODUCTION' then 'CUTOVER_PRODUCTION_CANDIDATE'
        end,
        'READY', 'GIT'
      )
    )
  )
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
  expected_candidate jsonb;
  expected_candidate_record jsonb;
  live_count integer;
begin
  if candidate_deployment_target not in ('PREVIEW', 'PRODUCTION')
     or pg_catalog.jsonb_typeof(live_inventory) is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_INPUT_INVALID';
  end if;
  normalized_retained :=
    production_control.normalized_vercel_origin_inventory(retained_inventory);
  normalized_live :=
    production_control.normalized_vercel_origin_inventory(live_inventory);
  expected_candidate := production_control.expected_vercel_live_inventory(
    '[]'::jsonb, candidate_deployment_id, candidate_deployment_commit,
    candidate_immutable_origin, candidate_deployment_target
  );
  expected_candidate_record := expected_candidate->0;
  live_count := pg_catalog.jsonb_array_length(normalized_live);

  if normalized_live is distinct from live_inventory
     or live_count < pg_catalog.jsonb_array_length(normalized_retained) + 1
     or (select pg_catalog.count(distinct value->>0)
       from pg_catalog.jsonb_array_elements(normalized_live) value) <>
       live_count
     or (select pg_catalog.count(distinct value->>2)
       from pg_catalog.jsonb_array_elements(normalized_live) value) <>
       live_count
     or exists (
       select value from pg_catalog.jsonb_array_elements(normalized_retained)
       except
       select value from pg_catalog.jsonb_array_elements(normalized_live)
     )
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized_live) value
       where value = expected_candidate_record) <> 1
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(normalized_live) value
       where (value->>0 = candidate_deployment_id
           or value->>2 = pg_catalog.lower(pg_catalog.rtrim(
             candidate_immutable_origin, '/'
           )))
         and value is distinct from expected_candidate_record
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(normalized_live) live(record)
       where pg_catalog.jsonb_typeof(live.record) is distinct from 'array'
         or pg_catalog.jsonb_array_length(live.record) <> 6
         or coalesce(live.record->>0, '') !~ '^dpl_[A-Za-z0-9]{8,64}$'
         or (live.record->1 <> 'null'::jsonb
           and coalesce(live.record->>1, '') !~ '^[0-9a-f]{40}$')
         or coalesce(live.record->>2, '') !~ '^https://[a-z0-9.-]+$'
         or live.record->>3 not in (
           'MAIN_PRODUCTION', 'FEATURE_PREVIEW',
           'CUTOVER_PRODUCTION_CANDIDATE'
         )
         or live.record->>4 not in ('READY', 'ERROR', 'BLOCKED')
         or live.record->>5 not in (
           'GIT', 'REDEPLOY_INHERITED_GIT',
           'VERCEL_API_RESOLVED_GIT',
           'VERCEL_CLI_SHA_UNAVAILABLE'
         )
         or (not exists (
           select 1
           from pg_catalog.jsonb_array_elements(normalized_retained)
             retained(record)
           where retained.record = live.record
         ) and (
           live.record->1 = 'null'::jsonb
           or live.record->>1 <> pg_catalog.lower(candidate_deployment_commit)
           or live.record->>3 not in (
             'FEATURE_PREVIEW', 'CUTOVER_PRODUCTION_CANDIDATE'
           )
           or live.record->>5 <> 'GIT'
         ))
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH';
  end if;
end;
$$;

create or replace function production_control.disabled_direct_vercel_provider_attestation_record(
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
  begin_attestation production_control.vercel_provider_attestations%rowtype;
  recorded production_control.vercel_provider_attestations%rowtype;
  allowed_keys text[] := array[
    'attestation_id', 'attestation_fingerprint',
    'signer_key_fingerprint', 'signer_key_version', 'stage',
    'challenge_id', 'challenge_request_fingerprint', 'operation_request_id',
    'request_fingerprint',
    'signature_verified', 'vercel_project_id', 'vercel_team_id',
    'candidate_deployment_id', 'candidate_deployment_commit',
    'candidate_deployment_target',
    'routing_rule_id', 'routing_rule_config_version', 'routing_rule_etag',
    'routing_rule_fingerprint', 'routing_rule_pending_draft_change_count',
    'live_origin_inventory_count',
    'live_origin_inventory_fingerprint',
    'redacted_environment_scope_fingerprint',
    'credential_confinement_evidence_schema',
    'credential_confinement_record_count',
    'credential_confinement_records_fingerprint',
    'credential_confinement_evidence_fingerprint', 'provider_observed_at'
  ];
  observed_at_value timestamptz;
  expected_live_inventory jsonb;
  expected_live_inventory_fingerprint text;
  recorded_at_value timestamptz := pg_catalog.now();
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_DIRECT_RECORD_DISABLED';
  if target_stage not in ('BEGIN', 'FINALIZE')
     or target_request_fingerprint !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input) is distinct from 'object'
     or not (input ?& allowed_keys)
     or (input - allowed_keys) is distinct from '{}'::jsonb
     or coalesce(input->>'attestation_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'attestation_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'signer_key_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or input->>'signer_key_version' is distinct from
       'STEP11_6_VERCEL_ATTESTER_V1'
     or input->>'stage' is distinct from target_stage
     or coalesce(input->>'challenge_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'challenge_request_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or input->>'signature_verified' is distinct from 'true'
     or coalesce(input->>'vercel_team_id', '')
       !~ '^[A-Za-z0-9_.:-]{3,160}$'
     or input->>'candidate_deployment_target' not in ('PREVIEW', 'PRODUCTION')
     or coalesce(input->>'routing_rule_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'live_origin_inventory_count')
       is distinct from 'number'
     or coalesce(input->>'live_origin_inventory_count', '') !~ '^[0-9]+$'
     or coalesce(input->>'live_origin_inventory_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'redacted_environment_scope_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'provider_observed_at', '') = ''
     or (input->>'routing_rule_etag' is not null and (
       pg_catalog.btrim(input->>'routing_rule_etag') = ''
       or pg_catalog.length(input->>'routing_rule_etag') > 512
     )) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_INPUT_INVALID';
  end if;

  observed_at_value := (input->>'provider_observed_at')::timestamptz;
  select * into strict evidence
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = target_evidence_id
  for update;

  if (input->>'operation_request_id')::uuid is distinct from
       evidence.evidence_request_id then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_REQUEST_BINDING_MISMATCH';
  end if;

  perform production_control.assert_exact_vercel_live_inventory(
    evidence.origin_inventory, evidence.live_origin_inventory,
    evidence.candidate_deployment_id, evidence.candidate_deployment_commit,
    evidence.candidate_immutable_origin,
    evidence.candidate_deployment_target
  );
  expected_live_inventory := evidence.live_origin_inventory;
  expected_live_inventory_fingerprint :=
    production_control.vercel_origin_inventory_fingerprint(
      expected_live_inventory
    );

  if input->>'vercel_project_id' is distinct from evidence.vercel_project_id
     or input->>'candidate_deployment_id' is distinct from
       evidence.candidate_deployment_id
     or pg_catalog.lower(input->>'candidate_deployment_commit') is distinct from
       evidence.candidate_deployment_commit
     or input->>'candidate_deployment_target' is distinct from
       evidence.candidate_deployment_target
     or input->>'routing_rule_id' is distinct from evidence.routing_rule_id
     or input->>'routing_rule_config_version' is distinct from
       evidence.routing_rule_revision
     or (input->>'live_origin_inventory_count')::integer is distinct from
       evidence.live_origin_inventory_count
     or input->>'live_origin_inventory_fingerprint' is distinct from
       evidence.live_origin_inventory_fingerprint
     or expected_live_inventory_fingerprint is distinct from
       evidence.live_origin_inventory_fingerprint then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_SCOPE_MISMATCH';
  end if;
  if observed_at_value < recorded_at_value - interval '5 minutes'
     or observed_at_value > recorded_at_value + interval '1 minute'
     or (target_stage = 'BEGIN' and
       observed_at_value > evidence.drain_started_at + interval '1 minute')
     or (target_stage = 'FINALIZE' and
       observed_at_value <= evidence.drain_started_at) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_STALE';
  end if;
  if (input->>'attestation_id')::uuid = (input->>'challenge_id')::uuid
     or exists (
       select 1
       from production_control.vercel_provider_attestations value
       where value.attestation_id = (input->>'attestation_id')::uuid
          or value.attestation_fingerprint = input->>'attestation_fingerprint'
          or value.challenge_id = (input->>'challenge_id')::uuid
          or value.challenge_request_fingerprint =
            input->>'challenge_request_fingerprint'
          or value.request_fingerprint = input->>'request_fingerprint'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_REUSED';
  end if;

  if target_stage = 'BEGIN' then
    if exists (
      select 1 from production_control.vercel_provider_attestations value
      where value.evidence_id = evidence.evidence_id
    ) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_STAGE_CONFLICT';
    end if;
  else
    select * into strict begin_attestation
    from production_control.vercel_provider_attestations value
    where value.evidence_id = evidence.evidence_id
      and value.stage = 'BEGIN';
    if exists (
         select 1 from production_control.vercel_provider_attestations value
         where value.evidence_id = evidence.evidence_id
           and value.stage = 'FINALIZE'
       )
       or observed_at_value <= begin_attestation.provider_observed_at
       or input->>'signer_key_fingerprint' is distinct from
         begin_attestation.signer_key_fingerprint
       or input->>'signer_key_version' is distinct from
         begin_attestation.signer_key_version
       or input->>'vercel_project_id' is distinct from
         begin_attestation.vercel_project_id
       or input->>'vercel_team_id' is distinct from
         begin_attestation.vercel_team_id
       or input->>'candidate_deployment_id' is distinct from
         begin_attestation.candidate_deployment_id
       or pg_catalog.lower(input->>'candidate_deployment_commit') is distinct from
         begin_attestation.candidate_deployment_commit
       or input->>'candidate_deployment_target' is distinct from
         begin_attestation.candidate_deployment_target
       or input->>'routing_rule_id' is distinct from
         begin_attestation.routing_rule_id
       or input->>'routing_rule_config_version' is distinct from
         begin_attestation.routing_rule_config_version
       or input->>'routing_rule_etag' is distinct from
         begin_attestation.routing_rule_etag
       or input->>'routing_rule_fingerprint' is distinct from
         begin_attestation.routing_rule_fingerprint
       or (input->>'live_origin_inventory_count')::integer is distinct from
         begin_attestation.live_origin_inventory_count
       or input->>'live_origin_inventory_fingerprint' is distinct from
         begin_attestation.live_origin_inventory_fingerprint
       or input->>'redacted_environment_scope_fingerprint' is distinct from
         begin_attestation.redacted_environment_scope_fingerprint then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_SCOPE_DRIFT';
    end if;
  end if;

  insert into production_control.vercel_provider_attestations (
    attestation_id, evidence_id, stage, attestation_fingerprint,
    signer_key_fingerprint, signer_key_version, challenge_id,
    challenge_request_fingerprint, operation_request_id,
    request_fingerprint, receipt_request_fingerprint, signature_verified,
    vercel_project_id, vercel_team_id, candidate_deployment_id,
    candidate_deployment_commit, candidate_deployment_target, routing_rule_id,
    routing_rule_config_version, routing_rule_etag, routing_rule_fingerprint,
    live_origin_inventory_count, live_origin_inventory_fingerprint,
    redacted_environment_scope_fingerprint, provider_observed_at
  ) values (
    (input->>'attestation_id')::uuid, evidence.evidence_id, target_stage,
    input->>'attestation_fingerprint', input->>'signer_key_fingerprint',
    input->>'signer_key_version', (input->>'challenge_id')::uuid,
    input->>'challenge_request_fingerprint',
    (input->>'operation_request_id')::uuid,
    input->>'request_fingerprint', target_request_fingerprint, true,
    input->>'vercel_project_id', input->>'vercel_team_id',
    input->>'candidate_deployment_id',
    pg_catalog.lower(input->>'candidate_deployment_commit'),
    input->>'candidate_deployment_target', input->>'routing_rule_id',
    input->>'routing_rule_config_version',
    input->>'routing_rule_etag', input->>'routing_rule_fingerprint',
    (input->>'live_origin_inventory_count')::integer,
    input->>'live_origin_inventory_fingerprint',
    input->>'redacted_environment_scope_fingerprint', observed_at_value
  ) returning * into recorded;
  return recorded;
end;
$$;

-- A verified provider claim is reserved immediately after signature
-- verification and before the exhaustive edge probes run.  This consumes the
-- short-lived, database-issued challenge exactly once, while leaving the
-- later quiesce receipt transaction responsible for binding the reservation.
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
    'live_origin_inventory', value.live_origin_inventory,
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
    'idempotent', was_idempotent
  )
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
     or provider_claim->>'credential_confinement_evidence_schema'
       is distinct from
         'step11-6-production-google-credential-confinement-v1'
     or pg_catalog.jsonb_typeof(
       provider_claim->'credential_confinement_record_count'
     ) is distinct from 'number'
     or provider_claim->>'credential_confinement_record_count'
       is distinct from '1140'
     or provider_claim->>'credential_confinement_records_fingerprint'
       is distinct from
         'c63962703a60745786ffce2e43e9fef5fa38e12746fce5627f33bfde92c8f508'
     or provider_claim->>'credential_confinement_evidence_fingerprint'
       is distinct from
         '1d6f4203fc56226ba4f6881339e9b2dfcede0e413485a110785d28e066a569df'
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
      'binding_expires_at', reserved.binding_expires_at
    )
  );
  return production_control.vercel_provider_attestation_response(
    reserved, false
  );
end;
$$;

-- Override the earlier direct-record implementation.  Quiesce receipts may
-- only bind a previously reserved, challenge-consumed attestation by its
-- public hash identity; they cannot submit or self-assert a provider claim.
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

  if reserved.status is distinct from 'RESERVED'
     or reserved.binding_expires_at < bound_at_value
     or challenge.status is distinct from 'CONSUMED'
     or challenge.consumed_attestation_id is distinct from
       reserved.attestation_id
     or challenge.actor_id is distinct from evidence.actor_id
     or challenge.authenticated_actor_fingerprint is distinct from
       evidence.authenticated_actor_fingerprint
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
  unique_origin_count integer;
  unique_deployment_count integer;
begin
  if pg_catalog.jsonb_typeof(input) is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_ORIGIN_INVENTORY_ARRAY_REQUIRED';
  end if;
  normalized := production_control.normalized_vercel_origin_inventory(input);
  record_count := pg_catalog.jsonb_array_length(normalized);
  select pg_catalog.count(distinct value->>2)::integer,
         pg_catalog.count(distinct value->>0)::integer
    into unique_origin_count, unique_deployment_count
  from pg_catalog.jsonb_array_elements(normalized) value;
  if record_count <> 1140
     or unique_origin_count <> 1140
     or unique_deployment_count <> 1140
     or normalized is distinct from input
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(normalized) value
       where pg_catalog.jsonb_typeof(value) is distinct from 'array'
         or pg_catalog.jsonb_array_length(value) <> 6
         or coalesce(value->>0, '')
           !~ '^dpl_[A-Za-z0-9]{8,64}$'
         or (value->1 <> 'null'::jsonb
           and coalesce(value->>1, '') !~ '^[0-9a-f]{40}$')
         or coalesce(value->>2, '') !~ '^https://[a-z0-9.-]+$'
         or value->>3 not in ('MAIN_PRODUCTION', 'FEATURE_PREVIEW')
         or value->>4 not in ('READY', 'ERROR', 'BLOCKED')
         or value->>5 not in (
           'GIT', 'REDEPLOY_INHERITED_GIT',
           'VERCEL_API_RESOLVED_GIT',
           'VERCEL_CLI_SHA_UNAVAILABLE'
         )
     )
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized) value
       where value->1 = 'null'::jsonb) <> 1
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized) value
       where value->>3 = 'MAIN_PRODUCTION') <> 458
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized) value
       where value->>3 = 'FEATURE_PREVIEW') <> 682
     or not exists (
       select 1 from pg_catalog.jsonb_array_elements(normalized) value
       where value = '["dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2","561a61946be3536c7e32b46be53e4683cbb45579","https://bagger-drmix94o0-sandbagger-invitational.vercel.app","MAIN_PRODUCTION","READY","GIT"]'::jsonb
     )
     or not exists (
       select 1 from pg_catalog.jsonb_array_elements(normalized) value
       where value = '["dpl_CBgDhovX4cfQx15EJWWvm6Kti25j","be5531faca009e26617496e47831f365a1b4997b","https://bagger-mribo6cqh-sandbagger-invitational.vercel.app","FEATURE_PREVIEW","READY","GIT"]'::jsonb
     )
     or production_control.vercel_origin_inventory_fingerprint(normalized)
       is distinct from
       '533178a28a5458c5f2f727b77af3024de4cc0402c49e90dcd763b950d26fb4c6'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_ORIGIN_INVENTORY_MISMATCH';
  end if;
end;
$$;

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
  expected_logical_probe_count integer := expected_origin_count * 9;
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
        when 'MAIN_PRODUCTION' then 'IMMUTABLE_MAIN_PRODUCTION'
        when 'FEATURE_PREVIEW' then 'IMMUTABLE_FEATURE_PREVIEW'
        when 'CUTOVER_PRODUCTION_CANDIDATE' then
          'IMMUTABLE_CUTOVER_PRODUCTION_CANDIDATE'
      end,
      item->0, item->1,
      item->3, item->4, item->5,
      case
        when item->>0 = target_candidate_deployment_id
          and item->>2 = target_candidate_immutable_origin then
          '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1","PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb
        when item->>3 = 'MAIN_PRODUCTION' then
          '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb
        when item->>3 = 'FEATURE_PREVIEW' then
          '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1","POTENTIAL_PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb
        when item->>3 = 'CUTOVER_PRODUCTION_CANDIDATE' then
          '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1","POTENTIAL_PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb
      end,
      511
    ) as record
    from pg_catalog.jsonb_array_elements(target_origin_inventory) item
    union all
    select value as record
    from pg_catalog.jsonb_array_elements(pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_array('https://baggerinv.com', 'FIXED_ALIAS',
        null, null, null, null, null, '[]'::jsonb, 511),
      pg_catalog.jsonb_build_array('https://www.baggerinv.com', 'FIXED_ALIAS',
        null, null, null, null, null, '[]'::jsonb, 511),
      pg_catalog.jsonb_build_array('https://bagger-inv.vercel.app',
        'FIXED_ALIAS', null, null, null, null, null, '[]'::jsonb, 511),
      pg_catalog.jsonb_build_array(target_main_branch_alias_origin,
        'FIXED_ALIAS', null, null, null, null, null, '[]'::jsonb, 511),
      pg_catalog.jsonb_build_array(target_candidate_alias_origin,
        'CANDIDATE_ALIAS', target_candidate_deployment_id,
        target_candidate_commit, null, null, null,
        '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1","PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb,
        511)
    )) value
  ) expected;
  if normalized is distinct from input
     or target_candidate_credential_generation is distinct from
       'DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1'
     or target_candidate_deployment_target not in ('PREVIEW', 'PRODUCTION')
     or pg_catalog.jsonb_array_length(normalized) <> expected_origin_count
     or expected_origin_count * 9 <> expected_logical_probe_count
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
         or coalesce(value->>8, '') <> '511'
         or pg_catalog.jsonb_typeof(value->9) is distinct from 'array'
         or pg_catalog.jsonb_array_length(value->9) <> 9
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
    'routing_rule_scope', value.routing_rule_scope,
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
    'credential_confinement_evidence_schema',
      value.credential_confinement_evidence_schema,
    'credential_confinement_record_count',
      value.credential_confinement_record_count,
    'credential_confinement_records_fingerprint',
      value.credential_confinement_records_fingerprint,
    'credential_confinement_evidence_fingerprint',
      value.credential_confinement_evidence_fingerprint,
    'probe_vector_count', 9,
    'probe_origin_count',
      pg_catalog.jsonb_array_length(value.first_probe_records),
    'probe_record_count',
      pg_catalog.jsonb_array_length(value.first_probe_records) * 9,
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
     or input->>'credential_confinement_evidence_schema'
       is distinct from
         'step11-6-production-google-credential-confinement-v1'
     or pg_catalog.jsonb_typeof(
       input->'credential_confinement_record_count'
     ) is distinct from 'number'
     or input->>'credential_confinement_record_count' is distinct from '1140'
     or input->>'credential_confinement_records_fingerprint'
       is distinct from
         'c63962703a60745786ffce2e43e9fef5fa38e12746fce5627f33bfde92c8f508'
     or input->>'credential_confinement_evidence_fingerprint'
       is distinct from
         '1d6f4203fc56226ba4f6881339e9b2dfcede0e413485a110785d28e066a569df'
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
    normalized_inventory, 1140,
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
        'main_production_capabilities',
          '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb,
        'feature_preview_capabilities',
          '["LEGACY_GOOGLE_SERVICE_ACCOUNT_V0","POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1","POTENTIAL_PRODUCTION_WORKBOOK_SELECTOR"]'::jsonb,
        'candidate_credential_generation',
          input->>'candidate_credential_generation'
      )
    ),
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
     or pg_catalog.jsonb_typeof(input->'provider_attestation')
       is distinct from 'object'
     or input->>'credential_confinement_evidence_schema'
       is distinct from
         'step11-6-production-google-credential-confinement-v1'
     or pg_catalog.jsonb_typeof(
       input->'credential_confinement_record_count'
     ) is distinct from 'number'
     or input->>'credential_confinement_record_count' is distinct from '1140'
     or input->>'credential_confinement_records_fingerprint'
       is distinct from
         'c63962703a60745786ffce2e43e9fef5fa38e12746fce5627f33bfde92c8f508'
     or input->>'credential_confinement_evidence_fingerprint'
       is distinct from
         '1d6f4203fc56226ba4f6881339e9b2dfcede0e413485a110785d28e066a569df'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = '' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_FINALIZE_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict evidence
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_request_id = (input->>'evidence_request_id')::uuid
    and value.evidence_id = (input->>'evidence_id')::uuid
  for update;
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
     or evidence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or evidence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or evidence.candidate_deployment_target is distinct from
       input->>'candidate_deployment_target'
     or evidence.vercel_project_id is distinct from input->>'vercel_project_id'
     or evidence.routing_rule_id is distinct from input->>'routing_rule_id'
     or evidence.routing_rule_revision is distinct from
       input->>'routing_rule_revision'
     or evidence.routing_rule_scope is distinct from input->>'routing_rule_scope'
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
    pg_catalog.left(input->>'actor_id', 160),
    evidence.finalize_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'evidence_id', evidence.evidence_id,
      'drain_started_at', evidence.drain_started_at,
      'drain_completed_at', evidence.drain_completed_at,
      'drain_seconds', extract(epoch from
        evidence.drain_completed_at - evidence.drain_started_at),
      'origin_inventory_count', evidence.origin_inventory_count,
      'origin_inventory_fingerprint', evidence.origin_inventory_fingerprint,
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

create or replace function public.inspect_production_vercel_writer_quiesce_evidence(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  evidence production_control.vercel_writer_quiesce_evidence%rowtype;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'evidence_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_INSPECT_INPUT_INVALID';
  end if;
  select * into evidence
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_request_id = (input->>'evidence_request_id')::uuid;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'found', false,
      'code', 'PRODUCTION_VERCEL_WRITER_QUIESCE_NOT_FOUND',
      'evidence_request_id', input->>'evidence_request_id',
      'idempotent', true
    );
  end if;
  if (nullif(input->>'evidence_id', '') is not null
     and evidence.evidence_id is distinct from (input->>'evidence_id')::uuid)
     or evidence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or evidence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_WRITER_QUIESCE_OWNERSHIP_MISMATCH';
  end if;
  return production_control.vercel_quiesce_response(evidence, true);
end;
$$;

create or replace function production_control.normalized_google_writer_fence_protections(
  input jsonb
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'sheetId', (value->>'sheetId')::bigint,
    'protectedRangeId', (value->>'protectedRangeId')::bigint,
    'description', value->>'description',
    'warningOnly', value->'warningOnly',
    'dedicatedRequestingUserCanEdit',
      value->'dedicatedRequestingUserCanEdit',
    'legacyRequestingUserCanEdit', value->'legacyRequestingUserCanEdit'
  ) order by (value->>'sheetId')::bigint), '[]'::jsonb)
  from pg_catalog.jsonb_array_elements(input) value
$$;

create or replace function production_control.assert_exact_google_writer_fence_protections(
  input jsonb,
  description_prefix text
)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  normalized jsonb;
  sheet_ids jsonb;
  record_count integer;
  unique_range_count integer;
begin
  if pg_catalog.jsonb_typeof(input) is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_PROTECTIONS_ARRAY_REQUIRED';
  end if;
  normalized :=
    production_control.normalized_google_writer_fence_protections(input);
  record_count := pg_catalog.jsonb_array_length(normalized);
  select pg_catalog.count(distinct (value->>'protectedRangeId')::bigint)::integer,
    coalesce(pg_catalog.jsonb_agg(
      (value->>'sheetId')::bigint order by (value->>'sheetId')::bigint
    ), '[]'::jsonb)
  into unique_range_count, sheet_ids
  from pg_catalog.jsonb_array_elements(normalized) value;
  if record_count <> 17
     or unique_range_count <> 17
     or normalized is distinct from input
     or sheet_ids is distinct from
       production_control.expected_google_writer_fence_sheet_ids()
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(normalized) value
       where (value->>'protectedRangeId')::bigint <= 0
         or value->>'description' is distinct from
           description_prefix || ':' || (value->>'sheetId')
         or value->>'warningOnly' is distinct from 'false'
         or value->>'dedicatedRequestingUserCanEdit' is distinct from 'true'
         or value->>'legacyRequestingUserCanEdit' is distinct from 'false'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_PROTECTIONS_MISMATCH';
  end if;
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
    'protection_description_prefix', value.protection_description_prefix,
    'active_verification_id', value.active_verification_id,
    'removal_request_id', value.removal_request_id,
    'installing_at', value.installing_at,
    'installed_at', value.installed_at,
    'removal_authorized_at', value.removal_authorized_at,
    'removed_at', value.removed_at,
    'failure_code', value.failure_code,
    'idempotent', was_idempotent
  )
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
begin
  select * into fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = target_fence_id;
  select * into verification
  from production_control.google_writer_provider_fence_verifications value
  where value.verification_id = target_verification_id
    and value.fence_id = target_fence_id;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_VERIFICATION_REQUIRED';
  end if;
  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = fence.quiesce_evidence_id;
  if fence.status is distinct from 'INSTALLED'
     or fence.active_verification_id is distinct from verification.verification_id
     or fence.candidate_deployment_commit is distinct from target_candidate_commit
     or verification.expires_at <= pg_catalog.now()
     or verification.protection_count <> 17
     or verification.protected_sheet_ids is distinct from
       production_control.expected_google_writer_fence_sheet_ids()
     or not verification.legacy_deployments_fenced
     or not verification.legacy_google_credentials_fenced
     or not verification.non_owner_manual_google_scoring_fenced
     or not verification.owner_override_operationally_frozen
     or verification.recovery_only
     or (require_fresh_quiesce and (
       quiesce.status is distinct from 'VERIFIED'
       or quiesce.expires_at <= pg_catalog.now()
       or quiesce.candidate_deployment_id is distinct from
         fence.candidate_deployment_id
       or quiesce.candidate_deployment_commit is distinct from
         fence.candidate_deployment_commit
     )) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_NOT_CURRENT';
  end if;
end;
$$;

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
  fence production_control.google_writer_provider_fences%rowtype;
  fence_identifier uuid := extensions.gen_random_uuid();
  request_identifier uuid;
  payload_hash text := production_control.cutover_payload_hash(input);
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'dedicated_principal_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'legacy_credential_generation_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'baseline_provider_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'baseline_acl_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'baseline_canonical_value_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'baseline_formula_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'baseline_combined_value_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'writer_scope_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'canonical_sheet_union_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_BEGIN_INPUT_INVALID';
  end if;
  if pg_catalog.lower(input->>'canonical_sheet_union_fingerprint')
       is distinct from production_control.structured_evidence_fingerprint(
         production_control.expected_google_writer_fence_sheet_ids()
       ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_SHEET_UNION_MISMATCH';
  end if;
  request_identifier := (input->>'install_request_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into fence
  from production_control.google_writer_provider_fences value
  where value.install_request_id = request_identifier;
  if found then
    if fence.begin_request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or fence.begin_payload_hash is distinct from payload_hash
       or fence.candidate_deployment_id is distinct from
         input->>'candidate_deployment_id'
       or fence.candidate_deployment_commit is distinct from
         pg_catalog.lower(input->>'candidate_deployment_commit') then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_IDEMPOTENCY_CONFLICT';
    end if;
    return production_control.google_writer_provider_fence_response(
      fence, true
    );
  end if;
  if exists (
    select 1 from production_control.google_writer_provider_fences value
    where value.candidate_deployment_id = input->>'candidate_deployment_id'
      and value.candidate_deployment_commit =
        pg_catalog.lower(input->>'candidate_deployment_commit')
      and value.status in ('INSTALLING', 'INSTALLED', 'REMOVAL_AUTHORIZED')
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_CANDIDATE_ALREADY_USED';
  end if;
  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = (input->>'quiesce_evidence_id')::uuid;
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
  if quiesce.purpose is distinct from 'CUTOVER'
     or quiesce.status is distinct from 'VERIFIED'
     or quiesce.expires_at <= pg_catalog.now() + interval '5 minutes'
     or quiesce.owner_freeze_expires_at <=
       pg_catalog.now() + interval '5 minutes'
     or quiesce.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint')
     or quiesce.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or quiesce.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or activation.state is distinct from 'GOOGLE_LEASE_ARMED'
     or activation.read_cutover_phase is distinct from 'CURRENT_READS'
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or activation.active_google_writer_provider_fence_id is not null
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
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases value
       where value.tournament_id = '2026'
         and (value.status = 'ACTIVE' or value.resolution_state in (
           'LEGACY_UNCLASSIFIED', 'ADMITTED', 'WRITE_STARTED',
           'AMBIGUOUS', 'PARTIAL_WRITE'
         ))
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_BEGIN_STATE_INVALID';
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
    canonical_sheet_union_fingerprint,
    protection_description_prefix, actor_id, authenticated_actor_fingerprint
  ) values (
    fence_identifier, request_identifier,
    pg_catalog.lower(input->>'request_fingerprint'), payload_hash,
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
    pg_catalog.lower(input->>'canonical_sheet_union_fingerprint'),
    'STEP12_GOOGLE_WRITER_PROVIDER_FENCE:' || fence_identifier::text,
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'authenticated_actor_fingerprint')
  ) returning * into fence;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_STARTED',
    'SCORING_AUTHORITY', '2026', fence.actor_id,
    fence.begin_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'install_request_id', fence.install_request_id,
      'quiesce_evidence_id', fence.quiesce_evidence_id,
      'candidate_deployment_id', fence.candidate_deployment_id,
      'candidate_deployment_commit', fence.candidate_deployment_commit,
      'protection_description_prefix', fence.protection_description_prefix
    )
  );
  return production_control.google_writer_provider_fence_response(fence, false);
end;
$$;

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
  verification
    production_control.google_writer_provider_fence_verifications%rowtype;
  normalized jsonb;
  sheet_ids jsonb;
  range_ids jsonb;
  captured timestamptz := pg_catalog.now();
  recovery_only_value boolean;
  verification_expiry timestamptz;
begin
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = target_fence_id;
  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = (input->>'quiesce_evidence_id')::uuid;
  if quiesce.purpose is distinct from 'CUTOVER'
     or quiesce.status is distinct from 'VERIFIED'
     or (fence.status = 'INSTALLING' and
       quiesce.evidence_id is distinct from fence.quiesce_evidence_id)
     or (fence.status <> 'INSTALLING' and (
       quiesce.expires_at <= captured
       or quiesce.owner_freeze_expires_at <= captured
     ))
     or quiesce.candidate_deployment_id is distinct from
       fence.candidate_deployment_id
     or quiesce.candidate_deployment_commit is distinct from
       fence.candidate_deployment_commit
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
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = '' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_VERIFICATION_INPUT_INVALID';
  end if;
  perform production_control.assert_exact_google_writer_fence_protections(
    input->'protection_records', fence.protection_description_prefix
  );
  recovery_only_value := fence.status = 'INSTALLING' and (
    quiesce.expires_at <= captured
    or quiesce.owner_freeze_expires_at <= captured
  );
  verification_expiry := case
    when recovery_only_value then captured + interval '1 second'
    else least(captured + interval '30 minutes',
      quiesce.owner_freeze_expires_at)
  end;
  normalized :=
    production_control.normalized_google_writer_fence_protections(
      input->'protection_records'
    );
  select pg_catalog.jsonb_agg(
      (value->>'sheetId')::bigint order by (value->>'sheetId')::bigint
    ),
    pg_catalog.jsonb_agg(
      (value->>'protectedRangeId')::bigint
      order by (value->>'protectedRangeId')::bigint
    )
  into sheet_ids, range_ids
  from pg_catalog.jsonb_array_elements(normalized) value;
  if fence.status = 'INSTALLING' and (
       pg_catalog.lower(input->>'canonical_value_fingerprint')
         is distinct from fence.baseline_canonical_value_fingerprint
       or pg_catalog.lower(input->>'combined_value_fingerprint')
         is distinct from fence.baseline_combined_value_fingerprint
       or pg_catalog.lower(input->>'formula_fingerprint')
         is distinct from fence.baseline_formula_fingerprint
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_VALUE_OR_FORMULA_DRIFT';
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
    captured_at, expires_at, actor_id
  ) values (
    extensions.gen_random_uuid(), fence.fence_id, quiesce.evidence_id,
    pg_catalog.lower(input->>'request_fingerprint'),
    production_control.cutover_payload_hash(input), normalized, sheet_ids,
    range_ids, 17,
    production_control.structured_evidence_fingerprint(normalized),
    pg_catalog.lower(input->>'provider_fingerprint'),
    pg_catalog.lower(input->>'acl_fingerprint'),
    pg_catalog.lower(input->>'canonical_value_fingerprint'),
    pg_catalog.lower(input->>'combined_value_fingerprint'),
    pg_catalog.lower(input->>'formula_fingerprint'),
    pg_catalog.lower(input->>'structural_canary_fingerprint'),
    pg_catalog.lower(input->>'permission_inventory_fingerprint'),
    true, true, true, true, recovery_only_value, captured,
    verification_expiry,
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into verification;
  return verification;
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
  fence production_control.google_writer_provider_fences%rowtype;
  verification
    production_control.google_writer_provider_fence_verifications%rowtype;
  payload_hash text := production_control.cutover_payload_hash(input);
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_FINISH_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.install_request_id = (input->>'install_request_id')::uuid
    and value.fence_id = (input->>'fence_id')::uuid
  for update;
  if fence.status = 'INSTALLED' then
    if fence.finish_request_fingerprint =
         pg_catalog.lower(input->>'request_fingerprint')
       and fence.finish_payload_hash = payload_hash then
      return production_control.google_writer_provider_fence_response(
        fence, true
      );
    end if;
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ALREADY_INSTALLED';
  end if;
  if fence.status is distinct from 'INSTALLING'
     or fence.quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or fence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or input->>'protection_description_prefix' is distinct from
       fence.protection_description_prefix then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_OWNERSHIP_MISMATCH';
  end if;
  verification :=
    production_control.insert_google_writer_provider_fence_verification(
      fence.fence_id, input
    );
  update production_control.google_writer_provider_fences
  set status = 'INSTALLED',
      finish_request_fingerprint =
        pg_catalog.lower(input->>'request_fingerprint'),
      finish_payload_hash = payload_hash,
      active_verification_id = verification.verification_id,
      installed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where fence_id = fence.fence_id
  returning * into fence;
  update production_control.cutover_activation_state
  set active_google_writer_provider_fence_id = fence.fence_id,
      active_google_writer_provider_verification_id =
        verification.verification_id,
      active_vercel_quiesce_evidence_id = verification.quiesce_evidence_id,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
    and state = 'GOOGLE_LEASE_ARMED'
    and current_authority = 'GOOGLE'
    and active_google_writer_provider_fence_id is null;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ACTIVATION_BIND_FAILED';
  end if;
  update scoring_authority.ingress_gates
  set google_writer_provider_fence_id = fence.fence_id,
      google_writer_provider_verification_id = verification.verification_id,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
    and state = 'OPEN'
    and authority = 'GOOGLE'
    and admission_state = 'OPEN'
    and admission_protocol_enforced
    and google_writer_provider_fence_id is null;
  if not found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_GATE_BIND_FAILED';
  end if;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALLED',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    fence.finish_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'verification_id', verification.verification_id,
      'quiesce_evidence_id', verification.quiesce_evidence_id,
      'protection_count', verification.protection_count,
      'protected_sheet_ids', verification.protected_sheet_ids,
      'protected_range_ids', verification.protected_range_ids,
      'protection_set_fingerprint', verification.protection_set_fingerprint,
      'expires_at', verification.expires_at,
      'google_value_changed', false,
      'google_formula_changed', false
    )
  );
  return production_control.google_writer_provider_fence_response(fence, false);
end;
$$;

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
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$' then
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
       pg_catalog.lower(input->>'candidate_deployment_commit') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_OWNERSHIP_MISMATCH';
  end if;
  response_value :=
    production_control.google_writer_provider_fence_response(fence, true);
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

create or replace function public.refresh_production_google_writer_provider_fence(
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
  existing
    production_control.google_writer_provider_fence_verifications%rowtype;
  verification
    production_control.google_writer_provider_fence_verifications%rowtype;
  payload_hash text := production_control.cutover_payload_hash(input);
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'provider_fence_verification_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REFRESH_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'fence_id')::uuid
    and value.install_request_id = (input->>'install_request_id')::uuid
  for update;
  select * into existing
  from production_control.google_writer_provider_fence_verifications value
  where value.request_fingerprint =
    pg_catalog.lower(input->>'request_fingerprint');
  if found then
    if existing.fence_id is distinct from fence.fence_id
       or existing.payload_hash is distinct from payload_hash then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REFRESH_IDEMPOTENCY_CONFLICT';
    end if;
    return production_control.google_writer_provider_fence_response(
      fence, true
    );
  end if;
  if fence.status is distinct from 'INSTALLED'
     or fence.active_verification_id is distinct from
       (input->>'provider_fence_verification_id')::uuid
     or fence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or input->>'protection_description_prefix' is distinct from
       fence.protection_description_prefix then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REFRESH_STATE_INVALID';
  end if;
  verification :=
    production_control.insert_google_writer_provider_fence_verification(
      fence.fence_id, input
    );
  update production_control.google_writer_provider_fences
  set quiesce_evidence_id = verification.quiesce_evidence_id,
      active_verification_id = verification.verification_id,
      updated_at = pg_catalog.now()
  where fence_id = fence.fence_id
  returning * into fence;
  update production_control.cutover_activation_state
  set active_google_writer_provider_verification_id =
        verification.verification_id,
      active_vercel_quiesce_evidence_id = verification.quiesce_evidence_id,
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
    and active_google_writer_provider_fence_id = fence.fence_id;
  update scoring_authority.ingress_gates
  set google_writer_provider_verification_id = verification.verification_id,
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
    and google_writer_provider_fence_id = fence.fence_id;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REFRESHED',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'verification_id', verification.verification_id,
      'quiesce_evidence_id', verification.quiesce_evidence_id,
      'protection_set_fingerprint', verification.protection_set_fingerprint,
      'expires_at', verification.expires_at
    )
  );
  return production_control.google_writer_provider_fence_response(fence, false);
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
  if coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or quiesce.evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or quiesce.purpose is distinct from 'CUTOVER'
     or quiesce.status is distinct from 'VERIFIED'
     or quiesce.origin_inventory_count <> 1140
     or quiesce.origin_inventory_fingerprint is distinct from
       '533178a28a5458c5f2f727b77af3024de4cc0402c49e90dcd763b950d26fb4c6'
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

create or replace function public.authorize_production_google_writer_provider_fence_removal(
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
  verification
    production_control.google_writer_provider_fence_verifications%rowtype;
  payload_hash text := production_control.cutover_payload_hash(input);
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'provider_fence_verification_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'removal_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'pre_remove_provider_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_post_remove_provider_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'pre_remove_acl_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'pre_remove_canonical_value_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'pre_remove_combined_value_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'pre_remove_formula_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = '' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'fence_id')::uuid
    and value.install_request_id = (input->>'install_request_id')::uuid
  for update;
  if fence.status = 'REMOVAL_AUTHORIZED' then
    if fence.removal_request_id = (input->>'removal_request_id')::uuid
       and fence.removal_request_fingerprint =
         pg_catalog.lower(input->>'request_fingerprint')
       and fence.removal_payload_hash = payload_hash then
      return production_control.google_writer_provider_fence_response(
        fence, true
      );
    end if;
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_IDEMPOTENCY_CONFLICT';
  end if;
  select * into strict verification
  from production_control.google_writer_provider_fence_verifications value
  where value.verification_id =
      (input->>'provider_fence_verification_id')::uuid
    and value.fence_id = fence.fence_id;
  if fence.status is distinct from 'INSTALLED'
     or fence.active_verification_id is distinct from verification.verification_id
     or fence.quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or verification.quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or fence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_OWNERSHIP_MISMATCH';
  end if;
  perform production_control.assert_google_writer_provider_fence_removal_safe(
    fence.fence_id, input
  );
  update production_control.google_writer_provider_fences
  set status = 'REMOVAL_AUTHORIZED',
      removal_request_id = (input->>'removal_request_id')::uuid,
      removal_request_fingerprint =
        pg_catalog.lower(input->>'request_fingerprint'),
      removal_payload_hash = payload_hash,
      pre_remove_provider_fingerprint =
        pg_catalog.lower(input->>'pre_remove_provider_fingerprint'),
      expected_post_remove_provider_fingerprint = pg_catalog.lower(
        input->>'expected_post_remove_provider_fingerprint'
      ),
      pre_remove_acl_fingerprint =
        pg_catalog.lower(input->>'pre_remove_acl_fingerprint'),
      pre_remove_canonical_value_fingerprint = pg_catalog.lower(
        input->>'pre_remove_canonical_value_fingerprint'
      ),
      pre_remove_combined_value_fingerprint = pg_catalog.lower(
        input->>'pre_remove_combined_value_fingerprint'
      ),
      pre_remove_formula_fingerprint =
        pg_catalog.lower(input->>'pre_remove_formula_fingerprint'),
      removal_activation_revision =
        (input->>'expected_activation_revision')::bigint,
      removal_authority_generation_id =
        (input->>'expected_authority_generation')::uuid,
      removal_admission_generation_id =
        (input->>'expected_admission_generation')::uuid,
      removal_admission_revision =
        (input->>'expected_admission_revision')::bigint,
      removal_authorized_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where fence_id = fence.fence_id
  returning * into fence;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_AUTHORIZED',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    fence.removal_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'verification_id', verification.verification_id,
      'removal_request_id', fence.removal_request_id,
      'protected_range_ids', verification.protected_range_ids,
      'rollback_classification', case
        when (select first_supabase_write_observed_at is null
          from production_control.cutover_activation_state
          where scope_key = 'BAGGER_INV_PRODUCTION')
        then 'PRE_OR_NO_WRITE' else 'POST_WRITE_RECONCILED' end
    )
  );
  return production_control.google_writer_provider_fence_response(fence, false);
end;
$$;

create or replace function public.finish_production_google_writer_provider_fence_removal(
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
  verification
    production_control.google_writer_provider_fence_verifications%rowtype;
  payload_hash text := production_control.cutover_payload_hash(input);
  removed_ids jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'install_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'removal_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'removed_protected_range_ids')
       is distinct from 'array'
     or pg_catalog.jsonb_typeof(input->'active_run_owned_protection_count')
       is distinct from 'number'
     or input->>'active_run_owned_protection_count' is distinct from '0'
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
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = '' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_FINISH_INPUT_INVALID';
  end if;
  select coalesce(pg_catalog.jsonb_agg(value::bigint order by value::bigint),
    '[]'::jsonb) into removed_ids
  from pg_catalog.jsonb_array_elements_text(
    input->'removed_protected_range_ids'
  ) value;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'fence_id')::uuid
    and value.install_request_id = (input->>'install_request_id')::uuid
  for update;
  if fence.status = 'REMOVED' then
    if fence.removal_finish_request_fingerprint =
         pg_catalog.lower(input->>'request_fingerprint')
       and fence.removal_finish_payload_hash = payload_hash then
      return production_control.google_writer_provider_fence_response(
        fence, true
      );
    end if;
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ALREADY_REMOVED';
  end if;
  select * into strict verification
  from production_control.google_writer_provider_fence_verifications value
  where value.verification_id = fence.active_verification_id
    and value.fence_id = fence.fence_id;
  if fence.status is distinct from 'REMOVAL_AUTHORIZED'
     or fence.removal_request_id is distinct from
       (input->>'removal_request_id')::uuid
     or fence.quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or verification.quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or fence.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or fence.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or removed_ids is distinct from verification.protected_range_ids
     or pg_catalog.jsonb_array_length(removed_ids) <> 17
     or pg_catalog.lower(input->>'restored_provider_fingerprint')
       is distinct from fence.expected_post_remove_provider_fingerprint
     or pg_catalog.lower(input->>'restored_acl_fingerprint')
       is distinct from fence.pre_remove_acl_fingerprint
     or pg_catalog.lower(input->>'restored_canonical_value_fingerprint')
       is distinct from fence.pre_remove_canonical_value_fingerprint
     or pg_catalog.lower(input->>'restored_combined_value_fingerprint')
       is distinct from fence.pre_remove_combined_value_fingerprint
     or pg_catalog.lower(input->>'restored_formula_fingerprint')
       is distinct from fence.pre_remove_formula_fingerprint then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_PROOF_MISMATCH';
  end if;
  perform production_control.assert_google_writer_provider_fence_removal_safe(
    fence.fence_id, input
  );
  update production_control.google_writer_provider_fences
  set status = 'REMOVED',
      removal_finish_request_fingerprint =
        pg_catalog.lower(input->>'request_fingerprint'),
      removal_finish_payload_hash = payload_hash,
      restoration_evidence_fingerprint =
        pg_catalog.lower(input->>'restoration_evidence_fingerprint'),
      removed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where fence_id = fence.fence_id
  returning * into fence;
  update production_control.cutover_activation_state
  set active_google_writer_provider_fence_id = null,
      active_google_writer_provider_verification_id = null,
      active_vercel_quiesce_evidence_id = null,
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
    and active_google_writer_provider_fence_id = fence.fence_id;
  update scoring_authority.ingress_gates
  set google_writer_provider_fence_id = null,
      google_writer_provider_verification_id = null,
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
    and google_writer_provider_fence_id = fence.fence_id;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REMOVED',
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    fence.removal_finish_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'fence_id', fence.fence_id,
      'verification_id', verification.verification_id,
      'removed_protected_range_ids', removed_ids,
      'restoration_evidence_fingerprint',
        fence.restoration_evidence_fingerprint,
      'google_value_changed_by_removal', false,
      'google_formula_changed_by_removal', false
    )
  );
  return production_control.google_writer_provider_fence_response(fence, false);
end;
$$;

create or replace function production_control.google_writer_fence_rehearsal_response(
  value production_control.google_writer_fence_rehearsals,
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
    'code', case value.status
      when 'RUNNING' then 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_RUNNING'
      when 'RESTORED' then 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_RESTORED'
      else 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_FAILED'
    end,
    'run_id', value.run_id,
    'rehearsal_request_id', value.rehearsal_request_id,
    'status', value.status,
    'quiesce_evidence_id', value.quiesce_evidence_id,
    'candidate_deployment_id', value.candidate_deployment_id,
    'candidate_deployment_commit', value.candidate_deployment_commit,
    'activation_revision', value.activation_revision,
    'authority_generation_id', value.authority_generation_id,
    'admission_generation_id', value.admission_generation_id,
    'admission_revision', value.admission_revision,
    'baseline_provider_fingerprint', value.baseline_provider_fingerprint,
    'baseline_protected_ranges_fingerprint',
      value.baseline_protected_ranges_fingerprint,
    'baseline_canonical_value_fingerprint',
      value.baseline_canonical_value_fingerprint,
    'writer_scope_fingerprint', value.writer_scope_fingerprint,
    'edge_quiesce_fingerprint', value.edge_quiesce_fingerprint,
    'origin_matrix_fingerprint', value.origin_matrix_fingerprint,
    'owner_principal_fingerprint', value.owner_principal_fingerprint,
    'canonical_sheet_union_fingerprint',
      value.canonical_sheet_union_fingerprint,
    'owner_override_operationally_frozen',
      value.owner_override_operationally_frozen,
    'owner_acknowledged_at', value.owner_acknowledged_at,
    'owner_freeze_expires_at', value.owner_freeze_expires_at,
    'protection_description_prefix', value.protection_description_prefix,
    'provider_evidence_fingerprint', value.provider_evidence_fingerprint,
    'fenced_provider_fingerprint', value.fenced_provider_fingerprint,
    'restored_provider_fingerprint', value.restored_provider_fingerprint,
    'restored_protected_ranges_fingerprint',
      value.restored_protected_ranges_fingerprint,
    'restored_canonical_value_fingerprint',
      value.restored_canonical_value_fingerprint,
    'restoration_evidence_fingerprint',
      value.restoration_evidence_fingerprint,
    'active_run_owned_protection_count',
      value.active_run_owned_protection_count,
    'restoration_confirmed', value.restoration_confirmed,
    'certification_passed', value.certification_passed,
    'failure_code', value.failure_code,
    'started_at', value.started_at,
    'finished_at', value.finished_at,
    'idempotent', was_idempotent
  )
$$;

create or replace function production_control.assert_no_unrestored_google_writer_fence_rehearsal()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1
    from production_control.google_writer_fence_rehearsals value
    where value.status = 'RUNNING'
       or (value.status = 'FAILED' and not value.restoration_confirmed)
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_UNRESTORED';
  end if;
end;
$$;

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
     or not exists (
       select 1
       from production_control.google_writer_fence_rehearsals value
       where value.candidate_deployment_commit = target_candidate_commit
         and value.status = 'RESTORED'
         and value.certification_passed
         and value.restoration_confirmed
         and value.active_run_owned_protection_count = 0
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_CERTIFICATION_REQUIRED';
  end if;
end;
$$;

create or replace function production_control.guard_authority_during_google_writer_fence_rehearsal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform production_control.assert_no_unrestored_google_writer_fence_rehearsal();
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.begin_production_google_writer_fence_rehearsal(
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
  rehearsal production_control.google_writer_fence_rehearsals%rowtype;
  run_identifier uuid := extensions.gen_random_uuid();
  request_identifier uuid;
  request_hash text := production_control.cutover_payload_hash(input);
  canonical_sheet_fingerprint text :=
    production_control.structured_evidence_fingerprint(
      production_control.expected_google_writer_fence_sheet_ids()
    );
  candidate_commit text := pg_catalog.lower(
    coalesce(input->>'candidate_deployment_commit', '')
  );
  candidate_deployment text := coalesce(input->>'candidate_deployment_id', '');
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'rehearsal_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or candidate_deployment !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or candidate_commit !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or input->>'vercel_project_id'
       is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'dedicated_google_service_account' is distinct from
       'sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com'
     or pg_catalog.jsonb_typeof(input->'expected_activation_revision')
       is distinct from 'number'
     or input->>'expected_activation_revision' !~ '^[0-9]+$'
     or coalesce(input->>'expected_authority_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_admission_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.jsonb_typeof(input->'expected_admission_revision')
       is distinct from 'number'
     or input->>'expected_admission_revision' !~ '^[0-9]+$'
     or coalesce(input->>'baseline_provider_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'baseline_protected_ranges_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'baseline_canonical_value_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_BEGIN_INPUT_INVALID';
  end if;
  request_identifier := (input->>'rehearsal_request_id')::uuid;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );

  select * into rehearsal
  from production_control.google_writer_fence_rehearsals value
  where value.rehearsal_request_id = request_identifier;
  if found then
    if rehearsal.begin_request_fingerprint is distinct from
         pg_catalog.lower(input->>'request_fingerprint')
       or rehearsal.begin_payload_hash is distinct from request_hash
       or rehearsal.candidate_deployment_id is distinct from candidate_deployment
       or rehearsal.candidate_deployment_commit is distinct from candidate_commit then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_IDEMPOTENCY_CONFLICT';
    end if;
    return production_control.google_writer_fence_rehearsal_response(
      rehearsal, true
    );
  end if;

  select * into rehearsal
  from production_control.google_writer_fence_rehearsals value
  where value.candidate_deployment_id = candidate_deployment
    and value.candidate_deployment_commit = candidate_commit;
  if found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_CANDIDATE_ALREADY_USED';
  end if;
  perform production_control.assert_no_unrestored_google_writer_fence_rehearsal();

  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = (input->>'quiesce_evidence_id')::uuid;
  if quiesce.purpose is distinct from 'REHEARSAL'
     or quiesce.status is distinct from 'VERIFIED'
     or quiesce.expires_at <= pg_catalog.now() + interval '5 minutes'
     or quiesce.owner_freeze_expires_at <=
       pg_catalog.now() + interval '5 minutes'
     or quiesce.candidate_deployment_id is distinct from candidate_deployment
     or quiesce.candidate_deployment_commit is distinct from candidate_commit
     or quiesce.vercel_project_id is distinct from input->>'vercel_project_id'
     or quiesce.authenticated_actor_fingerprint is distinct from
       pg_catalog.lower(input->>'authenticated_actor_fingerprint') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_QUIESCE_REQUIRED';
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
  perform 1
  from production_control.worker_controls value
  order by value.worker_name
  for update;

  if activation.state is distinct from 'DORMANT'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from
       (input->>'expected_authority_generation')::uuid
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or resource.project_ref is distinct from input->>'project_ref'
     or resource.google_workbook_id is distinct from input->>'source_workbook_id'
     or resource.current_tournament_id is distinct from input->>'tournament_id'
     or resource.current_tournament_read_authority is distinct from 'GOOGLE'
     or resource.scoring_authority is distinct from 'GOOGLE'
     or resource.participant_identity_authority is distinct from 'PASSPORT'
     or resource.public_supabase_reads_enabled
     or resource.scoring_ingress_enabled
     or resource.google_writes_enabled
     or resource.workers_enabled
     or resource.auth_user_creation_enabled
     or gate.state is distinct from 'PAUSED'
     or gate.authority is distinct from 'GOOGLE'
     or gate.admission_state is distinct from 'OPEN'
     or gate.admission_protocol_enforced
     or gate.admission_generation_id is distinct from
       (input->>'expected_admission_generation')::uuid
     or gate.admission_revision is distinct from
       (input->>'expected_admission_revision')::bigint
     or gate.active_closure_id is not null
     or gate.external_fence_evidence_id is not null
     or exists (
       select 1 from production_control.worker_controls value
       where value.enabled or value.scheduler_installed
         or value.google_writes_allowed
     )
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases value
       where value.tournament_id = '2026'
         and (
           value.status = 'ACTIVE'
           or value.resolution_state in (
             'LEGACY_UNCLASSIFIED', 'ADMITTED', 'WRITE_STARTED',
             'AMBIGUOUS', 'PARTIAL_WRITE'
           )
         )
     )
     or exists (
       select 1 from scoring_authority.authority_epochs value
       where value.tournament_id = '2026' and value.status = 'PREPARED'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_START_STATE_INVALID';
  end if;

  insert into production_control.google_writer_fence_rehearsals (
    run_id, rehearsal_request_id, begin_request_fingerprint,
    begin_payload_hash, quiesce_evidence_id, candidate_deployment_id,
    candidate_deployment_commit, vercel_project_id, project_ref,
    source_workbook_id, tournament_id, dedicated_google_service_account,
    activation_revision, authority_generation_id, admission_generation_id,
    admission_revision, baseline_provider_fingerprint,
    baseline_protected_ranges_fingerprint,
    baseline_canonical_value_fingerprint, writer_scope_fingerprint,
    edge_quiesce_fingerprint, origin_matrix_fingerprint,
    owner_principal_fingerprint, canonical_sheet_union_fingerprint,
    owner_override_operationally_frozen, owner_acknowledged_at,
    owner_freeze_expires_at,
    protection_description_prefix, actor_id
  ) values (
    run_identifier, request_identifier,
    pg_catalog.lower(input->>'request_fingerprint'), request_hash,
    quiesce.evidence_id,
    candidate_deployment, candidate_commit, input->>'vercel_project_id',
    input->>'project_ref', input->>'source_workbook_id', input->>'tournament_id',
    input->>'dedicated_google_service_account', activation.activation_revision,
    activation.authority_generation_id, gate.admission_generation_id,
    gate.admission_revision,
    pg_catalog.lower(input->>'baseline_provider_fingerprint'),
    pg_catalog.lower(input->>'baseline_protected_ranges_fingerprint'),
    pg_catalog.lower(input->>'baseline_canonical_value_fingerprint'),
    canonical_sheet_fingerprint,
    quiesce.deployment_scope_fingerprint,
    quiesce.origin_inventory_fingerprint,
    quiesce.owner_principal_fingerprint,
    canonical_sheet_fingerprint,
    quiesce.owner_override_operationally_frozen,
    quiesce.owner_acknowledged_at, quiesce.owner_freeze_expires_at,
    'STEP11_6_WRITER_FENCE_REHEARSAL:' || run_identifier::text,
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into rehearsal;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_STARTED',
    'SCORING_AUTHORITY', '2026', rehearsal.actor_id,
    rehearsal.begin_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'run_id', rehearsal.run_id,
      'candidate_deployment_id', rehearsal.candidate_deployment_id,
      'candidate_deployment_commit', rehearsal.candidate_deployment_commit,
      'activation_revision', rehearsal.activation_revision,
      'authority_generation_id', rehearsal.authority_generation_id,
      'admission_generation_id', rehearsal.admission_generation_id,
      'admission_revision', rehearsal.admission_revision,
      'protection_description_prefix',
        rehearsal.protection_description_prefix,
      'authority_changed', false,
      'google_value_written', false
    )
  );

  return production_control.google_writer_fence_rehearsal_response(
    rehearsal, false
  );
end;
$$;

create or replace function public.finish_production_google_writer_fence_rehearsal(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  rehearsal production_control.google_writer_fence_rehearsals%rowtype;
  quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  desired_status text := pg_catalog.upper(coalesce(input->>'outcome', ''));
  terminal_failure_code text := nullif(input->>'failure_code', '');
  request_hash text := production_control.cutover_payload_hash(input);
  finish_fingerprint text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  run_identifier uuid;
  request_identifier uuid;
  active_protection_count integer;
  owned_protection_count integer;
  unique_owned_protection_count integer;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'run_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'rehearsal_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or finish_fingerprint !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or desired_status not in ('RESTORED', 'FAILED')
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or pg_catalog.jsonb_typeof(input->'run_owned_protection_ids')
       is distinct from 'array'
     or pg_catalog.jsonb_typeof(input->'active_run_owned_protection_count')
       is distinct from 'number'
     or input->>'active_run_owned_protection_count' !~ '^[0-9]+$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_FINISH_INPUT_INVALID';
  end if;
  if desired_status = 'RESTORED' and (
       input->>'restoration_confirmed' is distinct from 'true'
       or (input->>'active_run_owned_protection_count')::integer <> 0
       or input->>'dedicated_identity_can_edit' is distinct from 'true'
       or input->>'legacy_identity_denied' is distinct from 'true'
       or input->>'google_value_writes_performed' is distinct from 'false'
       or input->>'preview_resources_accessed' is distinct from 'false'
       or coalesce(input->>'provider_evidence_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(input->>'fenced_provider_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(input->>'restored_provider_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(input->>'restored_protected_ranges_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(input->>'restored_canonical_value_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(input->>'restoration_evidence_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
     ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_RESTORATION_PROOF_REQUIRED';
  end if;
  if desired_status = 'FAILED'
     and input->>'restoration_confirmed' = 'true'
     and (
       (input->>'active_run_owned_protection_count')::integer <> 0
       or input->>'google_value_writes_performed' is distinct from 'false'
       or input->>'preview_resources_accessed' is distinct from 'false'
       or coalesce(input->>'provider_evidence_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(input->>'restored_provider_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(input->>'restored_protected_ranges_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(input->>'restored_canonical_value_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(input->>'restoration_evidence_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
     ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_FAILED_RESTORATION_PROOF_REQUIRED';
  end if;
  if desired_status = 'FAILED' and coalesce(input->>'failure_code', '')
       !~ '^[A-Z0-9:_-]{3,120}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_FAILURE_CODE_REQUIRED';
  end if;
  run_identifier := (input->>'run_id')::uuid;
  request_identifier := (input->>'rehearsal_request_id')::uuid;
  active_protection_count :=
    (input->>'active_run_owned_protection_count')::integer;
  select pg_catalog.count(*)::integer,
    pg_catalog.count(distinct (value #>> '{}')::bigint)::integer
  into owned_protection_count, unique_owned_protection_count
  from pg_catalog.jsonb_array_elements(input->'run_owned_protection_ids') value
  where pg_catalog.jsonb_typeof(value) = 'number'
    and (value #>> '{}') ~ '^[0-9]+$'
    and (value #>> '{}')::bigint > 0;
  if desired_status = 'RESTORED' and (
       owned_protection_count <> 17
       or unique_owned_protection_count <> 17
       or owned_protection_count <>
         pg_catalog.jsonb_array_length(input->'run_owned_protection_ids')
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_EXACT_17_IDS_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict rehearsal
  from production_control.google_writer_fence_rehearsals value
  where value.run_id = run_identifier
  for update;

  if rehearsal.rehearsal_request_id is distinct from request_identifier
     or rehearsal.candidate_deployment_id
       is distinct from input->>'candidate_deployment_id'
     or rehearsal.candidate_deployment_commit
       is distinct from pg_catalog.lower(input->>'candidate_deployment_commit')
     or input->>'protection_description_prefix'
       is distinct from rehearsal.protection_description_prefix then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_OWNERSHIP_MISMATCH';
  end if;

  if rehearsal.status = 'RESTORED' then
    if rehearsal.finish_request_fingerprint = finish_fingerprint
       and rehearsal.finish_payload_hash = request_hash then
      return production_control.google_writer_fence_rehearsal_response(
        rehearsal, true
      );
    end if;
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_ALREADY_RESTORED';
  end if;
  if rehearsal.status = 'FAILED' and desired_status = 'FAILED' then
    if rehearsal.finish_request_fingerprint = finish_fingerprint
       and rehearsal.finish_payload_hash = request_hash then
      return production_control.google_writer_fence_rehearsal_response(
        rehearsal, true
      );
    end if;
    if rehearsal.restoration_confirmed
       or input->>'restoration_confirmed' is distinct from 'true' then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_FAILED_RECOVERY_REQUIRED';
    end if;
  elsif rehearsal.status = 'FAILED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_FAILURE_IMMUTABLE';
  end if;
  if exists (
    select 1
    from production_control.google_writer_fence_rehearsals value
    where value.finish_request_fingerprint = finish_fingerprint
      and value.run_id <> rehearsal.run_id
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_FINISH_IDEMPOTENCY_CONFLICT';
  end if;
  if input->>'restoration_confirmed' = 'true' and (
       pg_catalog.lower(input->>'restored_provider_fingerprint')
         is distinct from rehearsal.baseline_provider_fingerprint
       or pg_catalog.lower(input->>'restored_protected_ranges_fingerprint')
         is distinct from rehearsal.baseline_protected_ranges_fingerprint
       or pg_catalog.lower(input->>'restored_canonical_value_fingerprint')
         is distinct from rehearsal.baseline_canonical_value_fingerprint
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_BASELINE_NOT_RESTORED';
  end if;
  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = rehearsal.quiesce_evidence_id;
  if input->>'restoration_confirmed' = 'true' and (
       quiesce.status is distinct from 'VERIFIED'
       or quiesce.purpose is distinct from 'REHEARSAL'
       or quiesce.candidate_deployment_id is distinct from
         rehearsal.candidate_deployment_id
       or quiesce.candidate_deployment_commit is distinct from
         rehearsal.candidate_deployment_commit
       or quiesce.owner_principal_fingerprint is distinct from
         rehearsal.owner_principal_fingerprint
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_QUIESCE_OWNERSHIP_MISMATCH';
  end if;
  if exists (
    select 1
    from production_control.google_writer_provider_fence_verifications value
    join production_control.google_writer_provider_fences fence
      on fence.fence_id = value.fence_id
    where fence.status in ('INSTALLED', 'REMOVAL_AUTHORIZED')
      and exists (
        select 1
        from pg_catalog.jsonb_array_elements(value.protected_range_ids) active_id
        join pg_catalog.jsonb_array_elements(
          input->'run_owned_protection_ids'
        ) rehearsal_id
          on active_id = rehearsal_id
      )
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_ACTIVE_FENCE_ID_COLLISION';
  end if;

  update production_control.google_writer_fence_rehearsals
  set status = desired_status,
      finish_request_fingerprint = finish_fingerprint,
      finish_payload_hash = request_hash,
      provider_evidence_fingerprint = pg_catalog.lower(
        nullif(input->>'provider_evidence_fingerprint', '')
      ),
      fenced_provider_fingerprint = pg_catalog.lower(
        nullif(input->>'fenced_provider_fingerprint', '')
      ),
      restored_provider_fingerprint = pg_catalog.lower(
        nullif(input->>'restored_provider_fingerprint', '')
      ),
      restored_protected_ranges_fingerprint = pg_catalog.lower(
        nullif(input->>'restored_protected_ranges_fingerprint', '')
      ),
      restored_canonical_value_fingerprint = pg_catalog.lower(
        nullif(input->>'restored_canonical_value_fingerprint', '')
      ),
      restoration_evidence_fingerprint = pg_catalog.lower(
        nullif(input->>'restoration_evidence_fingerprint', '')
      ),
      run_owned_protection_ids = input->'run_owned_protection_ids',
      active_run_owned_protection_count = active_protection_count,
      dedicated_identity_can_edit =
        nullif(input->>'dedicated_identity_can_edit', '')::boolean,
      legacy_identity_denied =
        nullif(input->>'legacy_identity_denied', '')::boolean,
      google_value_writes_performed =
        nullif(input->>'google_value_writes_performed', '')::boolean,
      preview_resources_accessed =
        nullif(input->>'preview_resources_accessed', '')::boolean,
      restoration_confirmed = coalesce(
        nullif(input->>'restoration_confirmed', '')::boolean, false
      ),
      certification_passed = (desired_status = 'RESTORED'),
      failure_code = case when desired_status = 'FAILED'
        then terminal_failure_code else failure_code end,
      finished_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where run_id = rehearsal.run_id
  returning * into rehearsal;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    case rehearsal.status
      when 'RESTORED' then
        'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_RESTORED'
      else 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_FAILED'
    end,
    'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160), finish_fingerprint,
    case rehearsal.status when 'RESTORED' then 'SUCCEEDED' else 'FAILED' end,
    pg_catalog.jsonb_build_object(
      'run_id', rehearsal.run_id,
      'candidate_deployment_id', rehearsal.candidate_deployment_id,
      'candidate_deployment_commit', rehearsal.candidate_deployment_commit,
      'protection_description_prefix',
        rehearsal.protection_description_prefix,
      'active_run_owned_protection_count',
        rehearsal.active_run_owned_protection_count,
      'restoration_confirmed', rehearsal.restoration_confirmed,
      'failure_code', rehearsal.failure_code,
      'authority_changed', false,
      'google_value_written', coalesce(
        rehearsal.google_value_writes_performed, false
      )
    )
  );

  return production_control.google_writer_fence_rehearsal_response(
    rehearsal, false
  );
end;
$$;

create or replace function public.inspect_production_google_writer_fence_rehearsal(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  rehearsal production_control.google_writer_fence_rehearsals%rowtype;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if coalesce(input->>'run_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'rehearsal_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_INSPECT_INPUT_INVALID';
  end if;
  select * into strict rehearsal
  from production_control.google_writer_fence_rehearsals value
  where value.run_id = (input->>'run_id')::uuid;
  if rehearsal.rehearsal_request_id is distinct from
       (input->>'rehearsal_request_id')::uuid
     or rehearsal.candidate_deployment_id
       is distinct from input->>'candidate_deployment_id'
     or rehearsal.candidate_deployment_commit
       is distinct from pg_catalog.lower(input->>'candidate_deployment_commit') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_OWNERSHIP_MISMATCH';
  end if;
  return production_control.google_writer_fence_rehearsal_response(
    rehearsal, true
  );
end;
$$;

-- The original Stage 12 RPC predates Step 11.6.  Preserve it behind a private
-- name and make the public name reject even an idempotent replay while a
-- provider rehearsal is RUNNING/FAILED and not yet proven restored.
alter function public.stage_production_cutover_release(jsonb)
  rename to stage_production_cutover_release_pre_step11_6_rehearsal;
revoke all on function
  public.stage_production_cutover_release_pre_step11_6_rehearsal(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.stage_production_cutover_release(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if nullif(input->>'provider_fence_id', '') is not null
     or nullif(input->>'provider_fence_verification_id', '') is not null
     or nullif(input->>'quiesce_evidence_id', '') is not null
     or exists (
       select 1
       from production_control.cutover_activation_state value
       where value.scope_key = 'BAGGER_INV_PRODUCTION'
         and (
           value.active_google_writer_provider_fence_id is not null
           or value.active_google_writer_provider_verification_id is not null
           or value.active_vercel_quiesce_evidence_id is not null
         )
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_STAGE_REQUIRES_NO_ACTIVE_PROVIDER_FENCE';
  end if;
  perform production_control.assert_no_unrestored_google_writer_fence_rehearsal();
  perform production_control.assert_certified_google_writer_fence_rehearsal(
    pg_catalog.lower(coalesce(input->>'deployment_commit', ''))
  );
  return public.stage_production_cutover_release_pre_step11_6_rehearsal(input);
end;
$$;

create trigger guard_cutover_activation_during_google_writer_fence_rehearsal
before insert or update or delete on production_control.cutover_activation_state
for each row execute function
  production_control.guard_authority_during_google_writer_fence_rehearsal();
create trigger guard_resource_scope_during_google_writer_fence_rehearsal
before insert or update or delete on production_control.resource_scope
for each row execute function
  production_control.guard_authority_during_google_writer_fence_rehearsal();
create trigger guard_workers_during_google_writer_fence_rehearsal
before insert or update or delete on production_control.worker_controls
for each row execute function
  production_control.guard_authority_during_google_writer_fence_rehearsal();
create trigger guard_execution_gate_during_google_writer_fence_rehearsal
before insert or update or delete on scoring_authority.ingress_gates
for each row execute function
  production_control.guard_authority_during_google_writer_fence_rehearsal();
create trigger guard_authority_epochs_during_google_writer_fence_rehearsal
before insert or update or delete on scoring_authority.authority_epochs
for each row execute function
  production_control.guard_authority_during_google_writer_fence_rehearsal();
create trigger guard_admission_closures_during_google_writer_fence_rehearsal
before insert or update or delete on production_control.scoring_admission_closures
for each row execute function
  production_control.guard_authority_during_google_writer_fence_rehearsal();
create trigger guard_external_fence_evidence_during_google_writer_fence_rehearsal
before insert or update or delete on production_control.scoring_external_fence_evidence
for each row execute function
  production_control.guard_authority_during_google_writer_fence_rehearsal();
create trigger guard_scoring_leases_during_google_writer_fence_rehearsal
before insert or update or delete on scoring_authority.scoring_ingress_leases
for each row execute function
  production_control.guard_authority_during_google_writer_fence_rehearsal();
create trigger guard_score_mutations_during_google_writer_fence_rehearsal
before insert or update or delete on scoring_authority.score_mutations
for each row execute function
  production_control.guard_authority_during_google_writer_fence_rehearsal();

create or replace function production_control.assert_current_external_scoring_fence(
  target_evidence_id uuid,
  target_deployment_commit text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  evidence production_control.scoring_external_fence_evidence%rowtype;
begin
  select * into evidence
  from production_control.scoring_external_fence_evidence value
  where value.evidence_id = target_evidence_id;
  if not found
     or evidence.revoked_at is not null
     or evidence.expires_at <= pg_catalog.now()
     or evidence.captured_at > pg_catalog.now()
     or evidence.captured_at < pg_catalog.now() - interval '30 minutes'
     or evidence.deployment_commit is distinct from target_deployment_commit
     or not evidence.legacy_deployments_fenced
     or not evidence.legacy_google_credentials_fenced
     or not evidence.non_owner_manual_google_scoring_fenced
     or not evidence.owner_override_operationally_frozen then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_EXTERNAL_SCORING_FENCE_EVIDENCE_REQUIRED';
  end if;
  perform production_control.assert_current_google_writer_provider_fence(
    evidence.provider_fence_id, evidence.provider_fence_verification_id,
    target_deployment_commit, true
  );
end;
$$;

-- Defined before the epoch replacements so PostgreSQL can validate every
-- referenced helper while this single migration transaction is parsed. It is
-- repeated below only to keep the admission helpers grouped for reviewers.
create or replace function production_control.assert_scoring_admission_optimistic_input(
  input jsonb,
  require_external_fence boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if pg_catalog.jsonb_typeof(input->'expected_activation_revision')
       is distinct from 'number'
     or input->>'expected_activation_revision' !~ '^[0-9]+$'
     or coalesce(input->>'expected_authority_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_admission_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.jsonb_typeof(input->'expected_admission_revision')
       is distinct from 'number'
     or input->>'expected_admission_revision' !~ '^[0-9]+$'
     or coalesce(input->>'deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'request_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or (require_external_fence and coalesce(
       input->>'external_fence_evidence_id', ''
     ) !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_ADMISSION_OPTIMISTIC_INPUT_REQUIRED';
  end if;
end;
$$;

create or replace function public.prepare_production_authority_epoch(input jsonb)
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
  evidence production_control.scoring_external_fence_evidence%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  requested_type text := pg_catalog.upper(
    coalesce(input->>'epoch_type', '')
  );
  current_revisions jsonb;
  current_checkpoints jsonb;
  unresolved_outbox integer;
  unresolved_archive integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  if requested_type not in ('CUTOVER', 'ROLLBACK')
     or coalesce(input->>'source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'reconciliation_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'closure_boundary_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'closure_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'provider_fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'provider_fence_verification_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.jsonb_typeof(input->'supabase_match_revisions')
       is distinct from 'object'
     or pg_catalog.jsonb_typeof(input->'google_checkpoints')
       is distinct from 'object' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_AUTHORITY_PREPARE_V2_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'PREPARE_AUTHORITY_EPOCH', input
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
  select * into strict evidence
  from production_control.scoring_external_fence_evidence value
  where value.evidence_id = (input->>'external_fence_evidence_id')::uuid;
  perform production_control.assert_current_external_scoring_fence(
    (input->>'external_fence_evidence_id')::uuid,
    activation.expected_deployment_commit
  );
  perform production_control.assert_current_google_writer_provider_fence(
    closure.google_writer_provider_fence_id,
    closure.google_writer_provider_verification_id,
    activation.expected_deployment_commit, true
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

  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit
       is distinct from input->>'deployment_commit'
     or gate.state is distinct from 'PAUSED'
     or gate.admission_state is distinct from 'CLOSED'
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id
       is distinct from (input->>'external_fence_evidence_id')::uuid
     or closure.google_writer_provider_fence_id is distinct from
       (input->>'provider_fence_id')::uuid
     or closure.google_writer_provider_verification_id is distinct from
       (input->>'provider_fence_verification_id')::uuid
     or gate.google_writer_provider_fence_id is distinct from
       closure.google_writer_provider_fence_id
     or gate.google_writer_provider_verification_id is distinct from
       closure.google_writer_provider_verification_id
     or activation.active_google_writer_provider_fence_id is distinct from
       closure.google_writer_provider_fence_id
     or activation.active_google_writer_provider_verification_id is distinct from
       closure.google_writer_provider_verification_id
     or activation.active_vercel_quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or evidence.quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or evidence.provider_fence_id is distinct from
       closure.google_writer_provider_fence_id
     or evidence.provider_fence_verification_id is distinct from
       closure.google_writer_provider_verification_id
     or closure.status is distinct from 'CLOSED'
     or closure.authority_generation_id
       is distinct from activation.authority_generation_id
     or closure.admission_generation_id
       is distinct from gate.admission_generation_id
     or closure.closed_admission_revision
       is distinct from gate.admission_revision
     or closure.external_fence_evidence_id
       is distinct from gate.external_fence_evidence_id
     or closure.final_source_fingerprint
       is distinct from pg_catalog.lower(input->>'source_fingerprint')
     or closure.reconciliation_fingerprint
       is distinct from pg_catalog.lower(input->>'reconciliation_fingerprint')
     or closure.lease_set_fingerprint
       is distinct from pg_catalog.lower(input->>'closure_boundary_fingerprint')
     or closure.supabase_match_revisions is distinct from current_revisions
     or closure.google_checkpoints is distinct from current_checkpoints
     or input->'supabase_match_revisions' is distinct from current_revisions
     or input->'google_checkpoints' is distinct from current_checkpoints
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
     or unresolved_outbox <> 0
     or unresolved_archive <> 0
     or activation.active_transition_epoch_id is not null
     or exists (
       select 1 from scoring_authority.authority_epochs value
       where value.tournament_id = '2026' and value.status = 'PREPARED'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_AUTHORITY_PREPARE_V2_BOUNDARY_CHANGED';
  end if;
  if requested_type = 'CUTOVER' then
    if activation.state is distinct from 'GOOGLE_LEASE_ARMED'
       or activation.current_authority is distinct from 'GOOGLE'
       or activation.scoring_ingress_enabled
       or gate.authority is distinct from 'GOOGLE'
       or closure.authority is distinct from 'GOOGLE'
       or closure.closure_kind is distinct from 'LEGACY_ADMISSION'
       or activation.expected_source_fingerprint
         is distinct from closure.final_source_fingerprint then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_CUTOVER_V2_NOT_PREPARABLE';
    end if;
  else
    if activation.state is distinct from 'SCORING_COMMITTED'
       or activation.current_authority is distinct from 'SUPABASE'
       or not activation.scoring_ingress_enabled
       or gate.authority is distinct from 'SUPABASE'
       or closure.authority is distinct from 'SUPABASE'
       or closure.closure_kind is distinct from 'SUPABASE_INGRESS'
       or activation.expected_source_fingerprint is distinct from
         pg_catalog.lower(coalesce(
           input->>'expected_prior_source_fingerprint', ''
         )) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ROLLBACK_V2_NOT_PREPARABLE';
    end if;
  end if;

  insert into scoring_authority.authority_epochs (
    tournament_id, epoch_type, status, authority_before, authority_after,
    reconciliation_fingerprint, google_checkpoints, supabase_match_revisions,
    deployment_commit, actor_id, reason, request_fingerprint,
    source_fingerprint, prepared_activation_revision, prior_active_epoch_id,
    admission_closure_id, admission_generation_id,
    closed_admission_revision, closure_boundary_fingerprint,
    prior_source_fingerprint,
    external_fence_evidence_id, google_writer_provider_fence_id,
    google_writer_provider_verification_id
  ) values (
    '2026', requested_type, 'PREPARED', activation.current_authority,
    case when requested_type = 'CUTOVER' then 'SUPABASE' else 'GOOGLE' end,
    closure.reconciliation_fingerprint, current_checkpoints, current_revisions,
    activation.expected_deployment_commit, input->>'actor_id',
    pg_catalog.left(coalesce(input->>'reason', ''), 500),
    pg_catalog.lower(input->>'request_fingerprint'),
    closure.final_source_fingerprint, activation.activation_revision,
    gate.active_epoch_id, closure.closure_id, gate.admission_generation_id,
    gate.admission_revision, closure.lease_set_fingerprint,
    activation.expected_source_fingerprint,
    gate.external_fence_evidence_id,
    closure.google_writer_provider_fence_id,
    closure.google_writer_provider_verification_id
  ) returning * into epoch;

  update scoring_authority.ingress_gates
  set active_epoch_id = epoch.epoch_id,
      unresolved_client_queues = 0,
      updated_by = input->>'actor_id',
      updated_at = pg_catalog.now()
  where tournament_id = '2026';
  update production_control.cutover_activation_state
  set state = case when requested_type = 'CUTOVER'
        then 'CUTOVER_PREPARED' else 'ROLLBACK_PREPARED' end,
      activation_revision = activation_revision + 1,
      expected_source_fingerprint = closure.final_source_fingerprint,
      active_transition_epoch_id = epoch.epoch_id,
      updated_by = input->>'actor_id',
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', requested_type || '_EPOCH_PREPARED', input->>'actor_id',
    pg_catalog.jsonb_build_object(
      'epoch_id', epoch.epoch_id,
      'admission_closure_id', closure.closure_id,
      'admission_generation_id', gate.admission_generation_id,
      'closed_admission_revision', gate.admission_revision,
      'closure_boundary_fingerprint', closure.lease_set_fingerprint,
      'external_fence_evidence_id', gate.external_fence_evidence_id
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_' || requested_type || '_EPOCH_V2_PREPARED',
    'SCORING_AUTHORITY', '2026', input->>'actor_id',
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'epoch_id', epoch.epoch_id,
      'closure_id', closure.closure_id,
      'ingress', 'PAUSED',
      'admission_state', 'CLOSED',
      'active_or_unresolved_leases', 0,
      'unresolved_outbox', 0,
      'unresolved_archive', 0
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_AUTHORITY_EPOCH_V2_PREPARED',
    'epoch_id', epoch.epoch_id, 'epoch_type', requested_type,
    'authority', epoch.authority_before,
    'authority_after', epoch.authority_after,
    'closure_id', closure.closure_id,
    'ingress', 'PAUSED', 'admission_state', 'CLOSED',
    'activation_revision', activation.activation_revision,
    'admission_revision', gate.admission_revision,
    'first_supabase_canonical_write_possible', false,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'PREPARE_AUTHORITY_EPOCH', input, response_value
  );
  return response_value;
end;
$$;

create or replace function production_control.assert_production_scoring_lease_nonce(
  lease scoring_authority.scoring_ingress_leases,
  supplied_nonce text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if lease.protocol_version <> 'ADMISSION_V2'
     or coalesce(supplied_nonce, '')
       !~ '^[0-9a-fA-F-]{36}$'
     or lease.lease_nonce_hash is distinct from pg_catalog.encode(
       extensions.digest(pg_catalog.lower(supplied_nonce), 'sha256'), 'hex'
     ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_SCORING_LEASE_NONCE_INVALID';
  end if;
end;
$$;

create or replace function production_control.scoring_lease_outcome_evidence_hash(
  target_lease_id uuid,
  target_request_fingerprint text,
  target_outcome text,
  target_provider_mutation_key text,
  target_provider_before_fingerprint text,
  target_provider_after_fingerprint text,
  target_provider_readback_fingerprint text,
  target_authority_generation uuid,
  target_admission_generation uuid,
  target_admission_revision bigint
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object(
    'lease_id', target_lease_id,
    'request_fingerprint', pg_catalog.lower(target_request_fingerprint),
    'outcome', pg_catalog.upper(target_outcome),
    'provider_mutation_key', coalesce(target_provider_mutation_key, ''),
    'provider_before_fingerprint', pg_catalog.lower(coalesce(target_provider_before_fingerprint, '')),
    'provider_after_fingerprint', pg_catalog.lower(coalesce(target_provider_after_fingerprint, '')),
    'provider_readback_fingerprint', pg_catalog.lower(coalesce(target_provider_readback_fingerprint, '')),
    'authority_generation_id', target_authority_generation,
    'admission_generation_id', target_admission_generation,
    'admission_revision', target_admission_revision
  )::text, 'sha256'), 'hex')
$$;

create or replace function production_control.scoring_admission_begin_payload_hash(
  input jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(
    (input - array['lease_nonce', 'request_fingerprint'])::text,
    'sha256'
  ), 'hex')
$$;

create or replace function production_control.scoring_legacy_resolution_evidence_hash(
  target_lease_id uuid,
  target_request_fingerprint text,
  target_resolution text,
  target_provider_readback_fingerprint text,
  target_external_fence_evidence_id uuid,
  target_actor_id text
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object(
    'lease_id', target_lease_id,
    'request_fingerprint', pg_catalog.lower(target_request_fingerprint),
    'resolution', pg_catalog.upper(target_resolution),
    'provider_readback_fingerprint',
      pg_catalog.lower(target_provider_readback_fingerprint),
    'external_fence_evidence_id', target_external_fence_evidence_id,
    'actor_id', target_actor_id
  )::text, 'sha256'), 'hex')
$$;

create or replace function production_control.assert_scoring_admission_optimistic_input(
  input jsonb,
  require_external_fence boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if pg_catalog.jsonb_typeof(input->'expected_activation_revision') is distinct from 'number'
     or input->>'expected_activation_revision' !~ '^[0-9]+$'
     or coalesce(input->>'expected_authority_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_admission_generation', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or pg_catalog.jsonb_typeof(input->'expected_admission_revision') is distinct from 'number'
     or input->>'expected_admission_revision' !~ '^[0-9]+$'
     or coalesce(input->>'deployment_id', '') !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'deployment_commit', '') !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or (require_external_fence and coalesce(
       input->>'external_fence_evidence_id', ''
     ) !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_ADMISSION_OPTIMISTIC_INPUT_REQUIRED';
  end if;
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
  captured timestamptz := pg_catalog.now();
  legacy_fingerprint text;
  legacy_count integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
  existing := production_control.lookup_cutover_receipt(
    'RECORD_SCORING_EXTERNAL_FENCE_EVIDENCE', input
  );
  if existing is not null then return existing; end if;

  if input->>'operation' is distinct from 'RECORD_PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE'
     or coalesce(input->>'deployment_id', '') !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'deployment_commit', '') !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'provider_fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'provider_fence_verification_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'actor_id', '') = '' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_EXTERNAL_FENCE_EXACT_EVIDENCE_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  perform pg_catalog.pg_advisory_xact_lock(
    731102027,
    pg_catalog.hashtext(pg_catalog.lower(input->>'request_fingerprint'))
  );
  existing := production_control.lookup_cutover_receipt(
    'RECORD_SCORING_EXTERNAL_FENCE_EVIDENCE', input
  );
  if existing is not null then return existing; end if;
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for share;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for share;
  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = (input->>'quiesce_evidence_id')::uuid;
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'provider_fence_id')::uuid;
  select * into strict verification
  from production_control.google_writer_provider_fence_verifications value
  where value.verification_id =
      (input->>'provider_fence_verification_id')::uuid
    and value.fence_id = fence.fence_id;
  perform production_control.assert_current_google_writer_provider_fence(
    fence.fence_id, verification.verification_id,
    pg_catalog.lower(input->>'deployment_commit'), true
  );
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or activation.active_google_writer_provider_fence_id is distinct from
       fence.fence_id
     or activation.active_google_writer_provider_verification_id is distinct from
       verification.verification_id
     or activation.active_vercel_quiesce_evidence_id is distinct from
       quiesce.evidence_id
     or fence.quiesce_evidence_id is distinct from quiesce.evidence_id
     or verification.quiesce_evidence_id is distinct from quiesce.evidence_id
     or fence.candidate_deployment_id is distinct from input->>'deployment_id'
     or activation.state not in ('STAGED', 'GOOGLE_LEASE_ARMED', 'SCORING_COMMITTED')
     or (activation.current_authority = 'GOOGLE' and activation.scoring_ingress_enabled)
     or (activation.current_authority = 'SUPABASE' and (
       activation.state <> 'SCORING_COMMITTED' or not activation.scoring_ingress_enabled
     )) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_EXTERNAL_FENCE_REVISION_CONFLICT';
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
    non_owner_manual_google_scoring_fenced, owner_override_operationally_frozen,
    captured_at, expires_at, actor_id, quiesce_evidence_id,
    provider_fence_id, provider_fence_verification_id
  ) values (
    pg_catalog.lower(input->>'request_fingerprint'),
    pg_catalog.lower(input->>'deployment_commit'), input->>'deployment_id',
    'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
    production_control.structured_evidence_fingerprint(
      pg_catalog.jsonb_build_object(
        'fenceId', fence.fence_id,
        'providerFingerprint', verification.provider_fingerprint,
        'aclFingerprint', verification.acl_fingerprint,
        'permissionInventoryFingerprint',
          verification.permission_inventory_fingerprint
      )
    ),
    quiesce.deployment_scope_fingerprint,
    fence.legacy_credential_generation_fingerprint,
    verification.protection_set_fingerprint,
    legacy_fingerprint, legacy_count,
    verification.legacy_deployments_fenced,
    verification.legacy_google_credentials_fenced,
    verification.non_owner_manual_google_scoring_fenced,
    verification.owner_override_operationally_frozen,
    captured, least(
      captured + interval '30 minutes', verification.expires_at,
      quiesce.expires_at, quiesce.owner_freeze_expires_at
    ),
    pg_catalog.left(input->>'actor_id', 160), quiesce.evidence_id,
    fence.fence_id, verification.verification_id
  ) returning * into evidence;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_EXTERNAL_FENCE_ATTESTED', 'SCORING_AUTHORITY', '2026',
    evidence.actor_id, evidence.request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'evidence_id', evidence.evidence_id,
      'deployment_id', evidence.deployment_id,
      'deployment_commit', evidence.deployment_commit,
      'provider_evidence_fingerprint', evidence.provider_evidence_fingerprint,
      'legacy_lease_set_fingerprint', evidence.legacy_lease_set_fingerprint,
      'legacy_lease_count', evidence.legacy_lease_count,
      'expires_at', evidence.expires_at,
      'quiesce_evidence_id', evidence.quiesce_evidence_id,
      'provider_fence_id', evidence.provider_fence_id,
      'provider_fence_verification_id',
        evidence.provider_fence_verification_id,
      'database_centrally_enforced', true
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE_RECORDED',
    'evidence_id', evidence.evidence_id,
    'deployment_id', evidence.deployment_id,
    'deployment_commit', evidence.deployment_commit,
    'captured_at', evidence.captured_at,
    'expires_at', evidence.expires_at,
    'provider_fence_id', evidence.provider_fence_id,
    'provider_fence_verification_id', evidence.provider_fence_verification_id,
    'quiesce_evidence_id', evidence.quiesce_evidence_id,
    'external_google_writer_fence_centrally_enforced', true,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'RECORD_SCORING_EXTERNAL_FENCE_EVIDENCE', input, response_value
  );
  return response_value;
end;
$$;

-- A provider fence is deliberately short lived. A long drain or reconciliation
-- must not depend on operator speed, so a fresh independently captured proof can
-- replace an expired proof without reopening either ingress. The replacement is
-- allowed only when every immutable provider/deployment/credential/writer-scope
-- fingerprint is byte-for-byte identical to the proof already bound to the
-- active closure. Only the legacy lease-set evidence may advance.
create or replace function public.refresh_production_scoring_external_fence_evidence(
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
  prior_legacy_closure production_control.scoring_admission_closures%rowtype;
  evidence production_control.scoring_external_fence_evidence%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  prior_evidence production_control.scoring_external_fence_evidence%rowtype;
  prior_quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  quiesce production_control.vercel_writer_quiesce_evidence%rowtype;
  fence production_control.google_writer_provider_fences%rowtype;
  verification
    production_control.google_writer_provider_fence_verifications%rowtype;
  replacement production_control.scoring_external_fence_evidence%rowtype;
  captured timestamptz := pg_catalog.now();
  legacy_fingerprint text;
  legacy_count integer;
  next_admission_revision bigint;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
  if input->>'operation' is distinct from
       'REFRESH_PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE'
     or coalesce(input->>'prior_external_fence_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'closure_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'provider_fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'provider_fence_verification_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_EXTERNAL_FENCE_REFRESH_EXACT_EVIDENCE_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'REFRESH_SCORING_EXTERNAL_FENCE_EVIDENCE', input
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
  select * into strict prior_evidence
  from production_control.scoring_external_fence_evidence value
  where value.evidence_id = (input->>'prior_external_fence_evidence_id')::uuid
  for update;
  select * into strict quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = (input->>'quiesce_evidence_id')::uuid;
  select * into strict prior_quiesce
  from production_control.vercel_writer_quiesce_evidence value
  where value.evidence_id = prior_evidence.quiesce_evidence_id;
  select * into strict fence
  from production_control.google_writer_provider_fences value
  where value.fence_id = (input->>'provider_fence_id')::uuid;
  select * into strict verification
  from production_control.google_writer_provider_fence_verifications value
  where value.verification_id =
      (input->>'provider_fence_verification_id')::uuid
    and value.fence_id = fence.fence_id;
  perform production_control.assert_current_google_writer_provider_fence(
    fence.fence_id, verification.verification_id,
    pg_catalog.lower(input->>'deployment_commit'), true
  );
  if closure.prior_legacy_closure_id is not null then
    select * into strict prior_legacy_closure
    from production_control.scoring_admission_closures value
    where value.closure_id = closure.prior_legacy_closure_id
    for update;
  end if;
  if activation.active_transition_epoch_id is not null then
    select * into strict epoch
    from scoring_authority.authority_epochs value
    where value.epoch_id = activation.active_transition_epoch_id
    for update;
  end if;

  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit
       is distinct from input->>'deployment_commit'
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id is distinct from prior_evidence.evidence_id
     or closure.external_fence_evidence_id is distinct from prior_evidence.evidence_id
     or closure.deployment_id is distinct from input->>'deployment_id'
     or activation.active_google_writer_provider_fence_id is distinct from
       fence.fence_id
     or activation.active_google_writer_provider_verification_id is distinct from
       verification.verification_id
     or activation.active_vercel_quiesce_evidence_id is distinct from
       quiesce.evidence_id
     or gate.google_writer_provider_fence_id is distinct from fence.fence_id
     or gate.google_writer_provider_verification_id is distinct from
       verification.verification_id
     or gate.state is distinct from 'PAUSED'
     or gate.admission_state not in ('CLOSING', 'CLOSED')
     or closure.status not in ('CLOSING', 'CLOSED')
     or not gate.admission_protocol_enforced
     or gate.authority is distinct from activation.current_authority
     or closure.authority is distinct from activation.current_authority
     or (activation.active_transition_epoch_id is not null and (
       epoch.status is distinct from 'PREPARED'
       or epoch.admission_closure_id is distinct from closure.closure_id
       or epoch.external_fence_evidence_id is distinct from prior_evidence.evidence_id
     )) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_EXTERNAL_FENCE_REFRESH_BOUNDARY_CHANGED';
  end if;
  if prior_evidence.revoked_at is not null
     or prior_evidence.deployment_commit is distinct from input->>'deployment_commit'
     or prior_evidence.deployment_id is distinct from input->>'deployment_id'
     or prior_evidence.vercel_project_id
       is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or prior_evidence.source_workbook_id
       is distinct from '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or prior_evidence.provider_fence_id is distinct from fence.fence_id
     or prior_evidence.provider_evidence_fingerprint is distinct from
       production_control.structured_evidence_fingerprint(
         pg_catalog.jsonb_build_object(
           'fenceId', fence.fence_id,
           'providerFingerprint', verification.provider_fingerprint,
           'aclFingerprint', verification.acl_fingerprint,
           'permissionInventoryFingerprint',
             verification.permission_inventory_fingerprint
         )
       )
     or prior_evidence.google_credential_scope_fingerprint is distinct from
       fence.legacy_credential_generation_fingerprint
     or prior_evidence.writer_coverage_fingerprint is distinct from
       verification.protection_set_fingerprint
     or prior_quiesce.origin_inventory_fingerprint is distinct from
       quiesce.origin_inventory_fingerprint
     or prior_quiesce.probe_scope_fingerprint is distinct from
       quiesce.probe_scope_fingerprint
     or prior_quiesce.candidate_deployment_id is distinct from
       quiesce.candidate_deployment_id
     or prior_quiesce.candidate_deployment_commit is distinct from
       quiesce.candidate_deployment_commit then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_EXTERNAL_FENCE_REFRESH_SCOPE_DRIFT';
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
    non_owner_manual_google_scoring_fenced, owner_override_operationally_frozen,
    captured_at, expires_at, actor_id, quiesce_evidence_id,
    provider_fence_id, provider_fence_verification_id
  ) values (
    pg_catalog.lower(input->>'request_fingerprint'),
    prior_evidence.deployment_commit, prior_evidence.deployment_id,
    prior_evidence.vercel_project_id, prior_evidence.source_workbook_id,
    production_control.structured_evidence_fingerprint(
      pg_catalog.jsonb_build_object(
        'fenceId', fence.fence_id,
        'providerFingerprint', verification.provider_fingerprint,
        'aclFingerprint', verification.acl_fingerprint,
        'permissionInventoryFingerprint',
          verification.permission_inventory_fingerprint
      )
    ),
    quiesce.deployment_scope_fingerprint,
    fence.legacy_credential_generation_fingerprint,
    verification.protection_set_fingerprint,
    legacy_fingerprint, legacy_count,
    verification.legacy_deployments_fenced,
    verification.legacy_google_credentials_fenced,
    verification.non_owner_manual_google_scoring_fenced,
    verification.owner_override_operationally_frozen,
    captured, least(
      captured + interval '30 minutes', verification.expires_at,
      quiesce.expires_at, quiesce.owner_freeze_expires_at
    ),
    pg_catalog.left(input->>'actor_id', 160), quiesce.evidence_id,
    fence.fence_id, verification.verification_id
  ) returning * into replacement;

  next_admission_revision := gate.admission_revision + 1;
  update scoring_authority.ingress_gates
  set admission_revision = next_admission_revision,
      external_fence_evidence_id = replacement.evidence_id,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026';
  update production_control.scoring_admission_closures
  set external_fence_evidence_id = replacement.evidence_id,
      google_writer_provider_fence_id = fence.fence_id,
      google_writer_provider_verification_id = verification.verification_id,
      closing_admission_revision = case when status = 'CLOSING'
        then next_admission_revision else closing_admission_revision end,
      closed_admission_revision = case when status = 'CLOSED'
        then next_admission_revision else closed_admission_revision end
  where closure_id = closure.closure_id;
  if closure.prior_legacy_closure_id is not null then
    update production_control.scoring_admission_closures
    set external_fence_evidence_id = replacement.evidence_id,
        google_writer_provider_fence_id = fence.fence_id,
        google_writer_provider_verification_id = verification.verification_id
    where closure_id = closure.prior_legacy_closure_id;
  end if;
  if activation.active_transition_epoch_id is not null then
    update scoring_authority.authority_epochs
    set external_fence_evidence_id = replacement.evidence_id,
        google_writer_provider_fence_id = fence.fence_id,
        google_writer_provider_verification_id = verification.verification_id,
        closed_admission_revision = next_admission_revision
    where epoch_id = activation.active_transition_epoch_id;
  end if;
  update production_control.cutover_activation_state
  set activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_SCORING_EXTERNAL_FENCE_REFRESHED',
    'SCORING_AUTHORITY', '2026', pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'closure_id', closure.closure_id,
      'prior_evidence_id', prior_evidence.evidence_id,
      'replacement_evidence_id', replacement.evidence_id,
      'activation_revision', activation.activation_revision,
      'admission_revision', next_admission_revision,
      'expires_at', replacement.expires_at,
      'immutable_scope_match', true,
      'provider_fence_id', replacement.provider_fence_id,
      'provider_fence_verification_id',
        replacement.provider_fence_verification_id,
      'quiesce_evidence_id', replacement.quiesce_evidence_id,
      'database_centrally_enforced', true
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE_REFRESHED',
    'closure_id', closure.closure_id,
    'prior_evidence_id', prior_evidence.evidence_id,
    'evidence_id', replacement.evidence_id,
    'captured_at', replacement.captured_at,
    'expires_at', replacement.expires_at,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', next_admission_revision,
    'provider_fence_id', replacement.provider_fence_id,
    'provider_fence_verification_id',
      replacement.provider_fence_verification_id,
    'quiesce_evidence_id', replacement.quiesce_evidence_id,
    'external_google_writer_fence_centrally_enforced', true,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'REFRESH_SCORING_EXTERNAL_FENCE_EVIDENCE', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.arm_production_google_ingress_lease_gate(input jsonb)
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
  next_admission_generation uuid := extensions.gen_random_uuid();
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
  existing := production_control.lookup_cutover_receipt('ARM_GOOGLE_LEASE_GATE', input);
  if existing is not null then return existing; end if;
  if coalesce(input->>'actor_id', '') = ''
     or coalesce(input->>'deployment_id', '') !~ '^dpl_[A-Za-z0-9]{8,64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_GOOGLE_LEASE_GATE_V2_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'ARM_GOOGLE_LEASE_GATE', input
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
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or activation.state <> 'STAGED'
     or activation.current_authority <> 'GOOGLE'
     or activation.scoring_ingress_enabled
     or gate.authority <> 'GOOGLE'
     or gate.active_epoch_id is not null
     or gate.active_closure_id is not null
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026' and lease.status = 'ACTIVE'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_GOOGLE_LEASE_GATE_V2_NOT_ARMABLE';
  end if;
  update scoring_authority.ingress_gates
  set state = 'OPEN', admission_state = 'OPEN',
      admission_revision = admission_revision + 1,
      admission_generation_id = next_admission_generation,
      admission_protocol_enforced = true,
      admission_enforced_at = pg_catalog.now(),
      admission_opened_at = pg_catalog.now(),
      admission_deployment_id = input->>'deployment_id',
      legacy_lease_set_fingerprint =
        production_control.scoring_admission_legacy_set_fingerprint(),
      active_epoch_id = null, active_closure_id = null,
      external_fence_evidence_id = null,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
  returning * into gate;
  update production_control.cutover_activation_state
  set state = 'GOOGLE_LEASE_ARMED', activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_V2_ARMED', 'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'authority_generation_id', activation.authority_generation_id,
      'admission_generation_id', gate.admission_generation_id,
      'admission_revision', gate.admission_revision,
      'deployment_id', gate.admission_deployment_id,
      'database_centrally_enforced_external_google', false
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_GOOGLE_LEASE_GATE_V2_ARMED',
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'authority', 'GOOGLE', 'execution_gate', gate.state,
    'admission_state', gate.admission_state,
    'external_fence_evidence_id', null,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt('ARM_GOOGLE_LEASE_GATE', input, response_value);
  return response_value;
end;
$$;

create or replace function public.begin_production_scoring_ingress_v2(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  closure production_control.scoring_admission_closures%rowtype;
  prior scoring_authority.scoring_ingress_leases%rowtype;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  expected_authority text := pg_catalog.upper(coalesce(input->>'expected_authority', ''));
  operation_request uuid;
  nonce_value text := pg_catalog.lower(coalesce(input->>'lease_nonce', ''));
  active_count integer;
  replay_nonce_rotated boolean := false;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
  if expected_authority <> 'GOOGLE'
     or input->>'writer_intent' is distinct from 'CANONICAL_LEGACY'
     or coalesce(input->>'operation', '') !~ '^[A-Z0-9:_-]{3,100}$'
     or coalesce(input->>'match_id', '') = ''
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or nonce_value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or coalesce(input->>'deployment_id', '') !~ '^dpl_[A-Za-z0-9]{8,64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_INGRESS_V2_REQUEST_INVALID';
  end if;
  operation_request := (input->>'operation_request_id')::uuid;

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
  select * into prior
  from scoring_authority.scoring_ingress_leases value
  where value.tournament_id = '2026'
    and value.protocol_version = 'ADMISSION_V2'
    and value.operation_request_id = operation_request
  for update;
  if found then
    if prior.request_payload_hash is distinct from
         production_control.scoring_admission_begin_payload_hash(input) then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_SCORING_INGRESS_V2_IDEMPOTENCY_CONFLICT';
    end if;
    if prior.authority is distinct from 'GOOGLE'
       or prior.authority_generation_id
         is distinct from (input->>'expected_authority_generation')::uuid
       or prior.admission_generation_id
         is distinct from (input->>'expected_admission_generation')::uuid
       or prior.admission_revision
         is distinct from (input->>'expected_admission_revision')::bigint
       or prior.admitted_activation_revision
         is distinct from (input->>'expected_activation_revision')::bigint
       or prior.deployment_commit is distinct from input->>'deployment_commit'
       or activation.authority_generation_id
         is distinct from prior.authority_generation_id
       or gate.admission_generation_id
         is distinct from prior.admission_generation_id
       or gate.admission_deployment_id is distinct from input->>'deployment_id'
       or activation.expected_deployment_commit
         is distinct from input->>'deployment_commit'
       or not gate.admission_protocol_enforced
       or gate.authority is distinct from 'GOOGLE'
       or activation.current_authority is distinct from 'GOOGLE'
       or activation.state is distinct from 'GOOGLE_LEASE_ARMED'
       or activation.scoring_ingress_enabled then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_SCORING_ADMISSION_V2_REPLAY_BOUNDARY_CHANGED';
    end if;
    if gate.admission_state = 'OPEN' then
      if gate.state is distinct from 'OPEN'
         or gate.active_closure_id is not null
         or gate.admission_revision is distinct from prior.admission_revision
         or activation.activation_revision
           is distinct from prior.admitted_activation_revision then
        raise exception using errcode = '40001',
          message = 'PRODUCTION_SCORING_ADMISSION_V2_REPLAY_BOUNDARY_CHANGED';
      end if;
    elsif gate.admission_state = 'CLOSING' then
      select * into strict closure
      from production_control.scoring_admission_closures value
      where value.closure_id = gate.active_closure_id
      for share;
      if gate.state is distinct from 'PAUSED'
         or closure.status is distinct from 'CLOSING'
         or closure.closure_kind is distinct from 'LEGACY_ADMISSION'
         or closure.authority is distinct from 'GOOGLE'
         or closure.authority_generation_id
           is distinct from prior.authority_generation_id
         or closure.admission_generation_id
           is distinct from prior.admission_generation_id
         or prior.close_fence_id is distinct from closure.closure_id
         or prior.admission_sequence > closure.lease_high_watermark then
        raise exception using errcode = '40001',
          message = 'PRODUCTION_SCORING_ADMISSION_V2_REPLAY_BOUNDARY_CHANGED';
      end if;
    else
      raise exception using errcode = '40001',
        message = 'PRODUCTION_SCORING_ADMISSION_V2_REPLAY_BOUNDARY_CHANGED';
    end if;
    if prior.resolution_state = 'ADMITTED' then
      update scoring_authority.scoring_ingress_leases
      set lease_nonce_hash = pg_catalog.encode(
            extensions.digest(nonce_value, 'sha256'), 'hex'
          ),
          expires_at = pg_catalog.now() + pg_catalog.make_interval(
            secs => greatest(30, least(
              coalesce((input->>'lease_seconds')::integer, 180), 300
            ))
          )
      where lease_id = prior.lease_id
      returning * into prior;
      replay_nonce_rotated := true;
      insert into production_control.operation_audit_events (
        event_type, domain, tournament_id, actor, request_fingerprint,
        result, details
      ) values (
        'PRODUCTION_SCORING_LEASE_V2_BEGIN_REPLAY',
        'SCORING_AUTHORITY', '2026', prior.actor_id,
        pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
        pg_catalog.jsonb_build_object(
          'lease_id', prior.lease_id,
          'operation_request_id', prior.operation_request_id,
          'resolution_state', prior.resolution_state,
          'lease_nonce_rotated', true,
          'replay_usable', true,
          'expires_at', prior.expires_at
        )
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'lease_id', prior.lease_id,
      'operation_request_id', prior.operation_request_id,
      'authority', prior.authority,
      'authority_generation_id', prior.authority_generation_id,
      'admission_generation_id', prior.admission_generation_id,
      'admission_revision', prior.admission_revision,
      'writer_intent', prior.writer_intent,
      'resolution_state', prior.resolution_state,
      'lease_nonce_rotated', replay_nonce_rotated,
      'replay_usable', replay_nonce_rotated,
      'idempotent', true
    );
  end if;

  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or gate.state <> 'OPEN' or gate.admission_state <> 'OPEN'
     or gate.active_closure_id is not null
     or not gate.admission_protocol_enforced
     or gate.authority <> expected_authority
     or activation.current_authority <> expected_authority
     or activation.state <> 'GOOGLE_LEASE_ARMED'
     or activation.scoring_ingress_enabled
     or not exists (
       select 1 from scoring_authority.matches match_value
       where match_value.tournament_id = '2026'
         and match_value.match_id = input->>'match_id'
     ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_ADMISSION_V2_BOUNDARY_MISMATCH';
  end if;

  insert into scoring_authority.scoring_ingress_leases (
    tournament_id, match_id, authority, actor_id, created_at, expires_at,
    operation, authority_generation_id, deployment_commit, request_fingerprint,
    status, protocol_version, admission_sequence, admission_generation_id,
    admission_revision, admitted_activation_revision, lease_nonce_hash,
    writer_intent, operation_request_id, request_payload_hash, resolution_state
  ) values (
    '2026', input->>'match_id', expected_authority,
    pg_catalog.left(coalesce(nullif(input->>'actor_id', ''),
      'Authorized Production scorer'), 160),
    pg_catalog.now(), pg_catalog.now() + pg_catalog.make_interval(
      secs => greatest(30, least(
        coalesce((input->>'lease_seconds')::integer, 180), 300
      ))
    ),
    input->>'operation', activation.authority_generation_id,
    activation.expected_deployment_commit,
    pg_catalog.lower(input->>'request_fingerprint'), 'ACTIVE', 'ADMISSION_V2',
    pg_catalog.nextval('production_control.scoring_admission_lease_sequence'),
    gate.admission_generation_id, gate.admission_revision,
    activation.activation_revision,
    pg_catalog.encode(extensions.digest(nonce_value, 'sha256'), 'hex'),
    'CANONICAL_LEGACY', operation_request,
    production_control.scoring_admission_begin_payload_hash(input), 'ADMITTED'
  ) returning * into lease;
  select production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  ) into active_count;
  update scoring_authority.ingress_gates
  set unresolved_client_queues = active_count, updated_at = pg_catalog.now()
  where tournament_id = '2026';
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_LEASE_V2_ADMITTED', 'SCORING_AUTHORITY', '2026',
    lease.actor_id, lease.request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'admission_sequence', lease.admission_sequence,
      'match_id', lease.match_id,
      'operation', lease.operation,
      'operation_request_id', lease.operation_request_id,
      'writer_intent', lease.writer_intent,
      'authority_generation_id', lease.authority_generation_id,
      'admission_generation_id', lease.admission_generation_id,
      'admission_revision', lease.admission_revision,
      'expires_at', lease.expires_at
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_LEASE_V2_ADMITTED',
    'lease_id', lease.lease_id,
    'operation_request_id', lease.operation_request_id,
    'authority', lease.authority,
    'authority_generation_id', lease.authority_generation_id,
    'admission_generation_id', lease.admission_generation_id,
    'admission_revision', lease.admission_revision,
    'writer_intent', lease.writer_intent,
    'resolution_state', lease.resolution_state,
    'lease_nonce_rotated', false, 'replay_usable', true,
    'active_or_unresolved_leases', active_count, 'idempotent', false
  );
end;
$$;

-- The legacy name is retained only as a fail-closed compatibility bridge. A
-- v2 caller must supply every new fence field, so old flag-enabled code cannot
-- create an unfenced lease after this migration.
create or replace function public.begin_production_scoring_ingress(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return public.begin_production_scoring_ingress_v2(input);
end;
$$;

create or replace function public.mark_production_scoring_ingress_write_started(input jsonb)
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
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
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
      message = 'PRODUCTION_SCORING_LEASE_V2_NOT_FOUND';
  end if;
  perform production_control.assert_production_scoring_lease_nonce(
    lease, input->>'lease_nonce'
  );
  existing := production_control.lookup_cutover_receipt(
    'MARK_SCORING_INGRESS_WRITE_STARTED', input
  );
  if existing is not null then return existing; end if;
  if lease.admitted_activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.activation_revision < lease.admitted_activation_revision
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or lease.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or lease.authority_generation_id is distinct from activation.authority_generation_id
     or lease.admission_generation_id is distinct from gate.admission_generation_id
     or lease.admission_revision > gate.admission_revision
     or gate.admission_state not in ('OPEN', 'CLOSING')
     or not gate.admission_protocol_enforced then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_LEASE_V2_BOUNDARY_CHANGED';
  end if;
  if lease.resolution_state = 'WRITE_STARTED' then
    response_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_SCORING_WRITE_ALREADY_STARTED',
      'lease_id', lease.lease_id, 'resolution_state', lease.resolution_state,
      'idempotent', true
    );
    perform production_control.store_cutover_receipt(
      'MARK_SCORING_INGRESS_WRITE_STARTED', input, response_value
    );
    return response_value;
  end if;
  if lease.resolution_state <> 'ADMITTED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_LEASE_V2_NOT_STARTABLE';
  end if;
  if lease.expires_at <= pg_catalog.now() then
    update scoring_authority.scoring_ingress_leases
    set resolution_state = 'AMBIGUOUS', outcome_reported_at = pg_catalog.now(),
        last_error_code = 'LEASE_EXPIRED_BEFORE_WRITE_START'
    where lease_id = lease.lease_id;
    unresolved_count := production_control.scoring_admission_unresolved_count(
      gate.admission_generation_id
    );
    update scoring_authority.ingress_gates
    set unresolved_client_queues = unresolved_count, updated_at = pg_catalog.now()
    where tournament_id = '2026';
    response_value := pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_SCORING_LEASE_EXPIRED_AMBIGUOUS',
      'lease_id', lease.lease_id, 'resolution_state', 'AMBIGUOUS',
      'idempotent', false
    );
  else
    update scoring_authority.scoring_ingress_leases
    set resolution_state = 'WRITE_STARTED', write_started_at = pg_catalog.now()
    where lease_id = lease.lease_id
    returning * into lease;
    response_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_SCORING_WRITE_STARTED',
      'lease_id', lease.lease_id,
      'write_started_at', lease.write_started_at,
      'resolution_state', lease.resolution_state,
      'idempotent', false
    );
  end if;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    case when response_value->>'ok' = 'true'
      then 'PRODUCTION_SCORING_LEASE_WRITE_STARTED'
      else 'PRODUCTION_SCORING_LEASE_EXPIRED_AMBIGUOUS' end,
    'SCORING_AUTHORITY', '2026', lease.actor_id,
    pg_catalog.lower(input->>'request_fingerprint'),
    case when response_value->>'ok' = 'true' then 'SUCCEEDED' else 'BLOCKED' end,
    pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'admission_generation_id', lease.admission_generation_id,
      'resolution_state', response_value->>'resolution_state'
    )
  );
  perform production_control.store_cutover_receipt(
    'MARK_SCORING_INGRESS_WRITE_STARTED', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.report_production_scoring_ingress_outcome(input jsonb)
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
  requested_outcome text := pg_catalog.upper(coalesce(input->>'outcome_state', ''));
  unresolved_count integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
  existing := production_control.lookup_cutover_receipt(
    'REPORT_SCORING_INGRESS_OUTCOME', input
  );
  if existing is not null then return existing; end if;
  if requested_outcome not in (
       'CONFIRMED_WRITE', 'PROVEN_NO_WRITE', 'AMBIGUOUS', 'PARTIAL_WRITE'
     )
     or coalesce(input->>'outcome_evidence_fingerprint', '')
       !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_LEASE_OUTCOME_EVIDENCE_REQUIRED';
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
    raise exception using errcode = 'P0002',
      message = 'PRODUCTION_SCORING_LEASE_V2_NOT_FOUND';
  end if;
  perform production_control.assert_production_scoring_lease_nonce(
    lease, input->>'lease_nonce'
  );
  existing := production_control.lookup_cutover_receipt(
    'REPORT_SCORING_INGRESS_OUTCOME', input
  );
  if existing is not null then return existing; end if;
  if lease.admitted_activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.activation_revision < lease.admitted_activation_revision
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or lease.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or lease.authority_generation_id is distinct from activation.authority_generation_id
     or lease.admission_generation_id is distinct from gate.admission_generation_id
     or gate.admission_state not in ('OPEN', 'CLOSING')
     or not gate.admission_protocol_enforced then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_LEASE_V2_BOUNDARY_CHANGED';
  end if;
  if lease.resolution_state in (
    'CONFIRMED_WRITE', 'PROVEN_NO_WRITE', 'RESOLVED_WRITE', 'RESOLVED_NO_WRITE'
  ) then
    if lease.resolution_state <> requested_outcome then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_SCORING_LEASE_OUTCOME_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'lease_id', lease.lease_id,
      'resolution_state', lease.resolution_state, 'idempotent', true
    );
  end if;
  if requested_outcome = 'PROVEN_NO_WRITE'
     and (lease.resolution_state <> 'ADMITTED' or lease.write_started_at is not null) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_NO_WRITE_RECONCILIATION_REQUIRED';
  end if;
  if requested_outcome in ('CONFIRMED_WRITE', 'AMBIGUOUS', 'PARTIAL_WRITE')
     and lease.resolution_state <> 'WRITE_STARTED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_WRITE_START_EVIDENCE_REQUIRED';
  end if;
  if requested_outcome = 'CONFIRMED_WRITE'
     and (
       coalesce(input->>'provider_mutation_key', '') = ''
       or coalesce(input->>'provider_before_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(input->>'provider_after_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or coalesce(input->>'provider_readback_fingerprint', '')
         !~ '^[0-9a-f]{64}$'
       or input->>'provider_after_fingerprint'
         is distinct from input->>'provider_readback_fingerprint'
     ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_CONFIRMED_WRITE_READBACK_REQUIRED';
  end if;
  if pg_catalog.lower(input->>'outcome_evidence_fingerprint')
       is distinct from production_control.scoring_lease_outcome_evidence_hash(
         lease.lease_id,
         lease.request_fingerprint,
         requested_outcome,
         input->>'provider_mutation_key',
         input->>'provider_before_fingerprint',
         input->>'provider_after_fingerprint',
         input->>'provider_readback_fingerprint',
         lease.authority_generation_id,
         lease.admission_generation_id,
         lease.admission_revision
       ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_LEASE_OUTCOME_EVIDENCE_HASH_MISMATCH';
  end if;

  update scoring_authority.scoring_ingress_leases
  set resolution_state = requested_outcome,
      status = case when requested_outcome in ('CONFIRMED_WRITE', 'PROVEN_NO_WRITE')
        then 'COMPLETED' else 'ACTIVE' end,
      completed_at = case when requested_outcome in ('CONFIRMED_WRITE', 'PROVEN_NO_WRITE')
        then pg_catalog.now() else null end,
      outcome_reported_at = pg_catalog.now(),
      provider_mutation_key = nullif(input->>'provider_mutation_key', ''),
      provider_before_fingerprint = nullif(
        pg_catalog.lower(input->>'provider_before_fingerprint'), ''
      ),
      provider_after_fingerprint = nullif(
        pg_catalog.lower(input->>'provider_after_fingerprint'), ''
      ),
      provider_readback_fingerprint = nullif(
        pg_catalog.lower(input->>'provider_readback_fingerprint'), ''
      ),
      outcome_evidence_fingerprint = pg_catalog.lower(
        input->>'outcome_evidence_fingerprint'
      ),
      resolved_at = case when requested_outcome in ('CONFIRMED_WRITE', 'PROVEN_NO_WRITE')
        then pg_catalog.now() else null end,
      resolved_by = case when requested_outcome in ('CONFIRMED_WRITE', 'PROVEN_NO_WRITE')
        then pg_catalog.left(input->>'actor_id', 160) else null end,
      last_error_code = nullif(
        pg_catalog.left(input->>'error_code', 120), ''
      )
  where lease_id = lease.lease_id
  returning * into lease;
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  );
  update scoring_authority.ingress_gates
  set unresolved_client_queues = unresolved_count, updated_at = pg_catalog.now()
  where tournament_id = '2026';
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_LEASE_' || requested_outcome,
    'SCORING_AUTHORITY', '2026', pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'),
    case when requested_outcome in ('AMBIGUOUS', 'PARTIAL_WRITE')
      then 'BLOCKED' else 'SUCCEEDED' end,
    pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'resolution_state', lease.resolution_state,
      'provider_readback_fingerprint', lease.provider_readback_fingerprint,
      'outcome_evidence_fingerprint', lease.outcome_evidence_fingerprint,
      'active_or_unresolved_leases', unresolved_count
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_LEASE_OUTCOME_RECORDED',
    'lease_id', lease.lease_id,
    'resolution_state', lease.resolution_state,
    'active_or_unresolved_leases', unresolved_count,
    'requires_reconciliation', lease.resolution_state in ('AMBIGUOUS', 'PARTIAL_WRITE'),
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'REPORT_SCORING_INGRESS_OUTCOME', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.resolve_production_scoring_ingress_ambiguity(input jsonb)
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
  requested_resolution text := pg_catalog.upper(
    coalesce(input->>'resolution', '')
  );
  unresolved_count integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, false);
  existing := production_control.lookup_cutover_receipt(
    'RESOLVE_SCORING_INGRESS_AMBIGUITY', input
  );
  if existing is not null then return existing; end if;
  if requested_resolution not in ('WRITE', 'NO_WRITE')
     or coalesce(input->>'resolution_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'provider_readback_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'actor_id', '') = '' then
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
  if lease.resolution_state = 'PARTIAL_WRITE' and requested_resolution = 'NO_WRITE' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_PARTIAL_WRITE_REPAIR_REQUIRED';
  end if;
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or lease.admission_generation_id is distinct from gate.admission_generation_id
     or gate.admission_state not in ('OPEN', 'CLOSING') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_AMBIGUITY_BOUNDARY_CHANGED';
  end if;
  update scoring_authority.scoring_ingress_leases
  set resolution_state = case when requested_resolution = 'WRITE'
        then 'RESOLVED_WRITE' else 'RESOLVED_NO_WRITE' end,
      status = 'COMPLETED', completed_at = pg_catalog.now(),
      provider_readback_fingerprint = pg_catalog.lower(
        input->>'provider_readback_fingerprint'
      ),
      resolution_fingerprint = pg_catalog.lower(input->>'resolution_fingerprint'),
      resolved_at = pg_catalog.now(),
      resolved_by = pg_catalog.left(input->>'actor_id', 160)
  where lease_id = lease.lease_id
  returning * into lease;
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  );
  update scoring_authority.ingress_gates
  set unresolved_client_queues = unresolved_count, updated_at = pg_catalog.now()
  where tournament_id = '2026';
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_LEASE_AMBIGUITY_RESOLVED', 'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'resolution_state', lease.resolution_state,
      'provider_readback_fingerprint', lease.provider_readback_fingerprint,
      'resolution_fingerprint', lease.resolution_fingerprint,
      'active_or_unresolved_leases', unresolved_count
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_LEASE_AMBIGUITY_RESOLVED',
    'lease_id', lease.lease_id, 'resolution_state', lease.resolution_state,
    'active_or_unresolved_leases', unresolved_count, 'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'RESOLVE_SCORING_INGRESS_AMBIGUITY', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.resolve_production_legacy_scoring_ingress(input jsonb)
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
  requested_resolution text := pg_catalog.upper(
    coalesce(input->>'resolution', '')
  );
  evidence_id uuid;
  blockers integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  if requested_resolution not in ('WRITE', 'NO_WRITE')
     or coalesce(input->>'provider_readback_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'resolution_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or (requested_resolution = 'WRITE'
       and pg_catalog.btrim(coalesce(
         input->>'provider_mutation_key', ''
       )) = '') then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_LEGACY_SCORING_RESOLUTION_EVIDENCE_REQUIRED';
  end if;
  evidence_id := (input->>'external_fence_evidence_id')::uuid;

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
  if not found
     or lease.protocol_version is distinct from 'LEGACY_V1'
     or lease.resolution_state is distinct from 'LEGACY_UNCLASSIFIED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_LEGACY_SCORING_LEASE_NOT_RESOLVABLE';
  end if;
  existing := production_control.lookup_cutover_receipt(
    'RESOLVE_LEGACY_SCORING_INGRESS', input
  );
  if existing is not null then return existing; end if;
  perform production_control.assert_current_external_scoring_fence(
    evidence_id, activation.expected_deployment_commit
  );
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or activation.expected_deployment_commit
       is distinct from input->>'deployment_commit'
     or (gate.admission_protocol_enforced and gate.admission_deployment_id
       is distinct from input->>'deployment_id')
     or activation.current_authority is distinct from 'GOOGLE'
     or gate.authority is distinct from 'GOOGLE'
     or gate.admission_state not in ('OPEN', 'CLOSING') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_LEGACY_SCORING_RESOLUTION_BOUNDARY_CHANGED';
  end if;
  if pg_catalog.lower(input->>'resolution_fingerprint') is distinct from
    production_control.scoring_legacy_resolution_evidence_hash(
      lease.lease_id,
      pg_catalog.lower(input->>'request_fingerprint'),
      requested_resolution,
      pg_catalog.lower(input->>'provider_readback_fingerprint'),
      evidence_id,
      input->>'actor_id'
    ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_LEGACY_SCORING_RESOLUTION_HASH_MISMATCH';
  end if;

  update scoring_authority.scoring_ingress_leases
  set resolution_state = case when requested_resolution = 'WRITE'
        then 'RESOLVED_WRITE' else 'RESOLVED_NO_WRITE' end,
      status = 'COMPLETED', completed_at = pg_catalog.now(),
      outcome_reported_at = pg_catalog.now(),
      provider_mutation_key = nullif(
        input->>'provider_mutation_key', ''
      ),
      provider_readback_fingerprint = pg_catalog.lower(
        input->>'provider_readback_fingerprint'
      ),
      resolution_fingerprint = pg_catalog.lower(
        input->>'resolution_fingerprint'
      ),
      resolved_at = pg_catalog.now(),
      resolved_by = input->>'actor_id',
      last_error_code = null
  where lease_id = lease.lease_id
  returning * into lease;
  blockers := production_control.scoring_admission_legacy_blocker_count(
    gate.admission_enforced_at
  );
  update scoring_authority.ingress_gates
  set unresolved_client_queues =
        production_control.scoring_admission_unresolved_count(
          gate.admission_generation_id
        ) + blockers,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_LEGACY_SCORING_LEASE_RESOLVED', 'SCORING_AUTHORITY', '2026',
    input->>'actor_id', pg_catalog.lower(input->>'request_fingerprint'),
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'resolution_state', lease.resolution_state,
      'provider_readback_fingerprint', lease.provider_readback_fingerprint,
      'resolution_fingerprint', lease.resolution_fingerprint,
      'external_fence_evidence_id', evidence_id,
      'legacy_unclassified_remaining', blockers
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_LEGACY_SCORING_LEASE_RESOLVED',
    'lease_id', lease.lease_id,
    'resolution_state', lease.resolution_state,
    'legacy_unclassified_remaining', blockers,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'RESOLVE_LEGACY_SCORING_INGRESS', input, response_value
  );
  return response_value;
end;
$$;

-- Old clients have no outcome evidence. Completion is therefore never allowed
-- to turn a potentially transported write into a safe terminal state.
create or replace function public.complete_production_scoring_ingress(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  lease scoring_authority.scoring_ingress_leases%rowtype;
  unresolved_count integer;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
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
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_SCORING_LEASE_NOT_FOUND_IDEMPOTENT',
      'idempotent', true
    );
  end if;
  if lease.protocol_version = 'ADMISSION_V2'
     and lease.resolution_state in ('ADMITTED', 'WRITE_STARTED') then
    update scoring_authority.scoring_ingress_leases
    set resolution_state = 'AMBIGUOUS', status = 'ACTIVE',
        outcome_reported_at = pg_catalog.now(), completed_at = null,
        last_error_code = 'LEGACY_COMPLETION_WITHOUT_OUTCOME_EVIDENCE'
    where lease_id = lease.lease_id
    returning * into lease;
  elsif lease.protocol_version = 'LEGACY_V1' and lease.status = 'ACTIVE' then
    -- Deliberately do not mark a legacy lease completed. It remains an explicit
    -- legacy blocker until a fresh provider boundary accounts for it.
    perform 1;
  end if;
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  ) + production_control.scoring_admission_legacy_blocker_count(
    gate.admission_enforced_at
  );
  update scoring_authority.ingress_gates
  set unresolved_client_queues = unresolved_count, updated_at = pg_catalog.now()
  where tournament_id = '2026';
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_LEGACY_COMPLETION_AMBIGUOUS', 'SCORING_AUTHORITY', '2026',
    lease.actor_id, lease.request_fingerprint, 'BLOCKED',
    pg_catalog.jsonb_build_object(
      'lease_id', lease.lease_id,
      'protocol_version', lease.protocol_version,
      'resolution_state', lease.resolution_state,
      'active_or_unresolved_leases', unresolved_count
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_LEGACY_COMPLETION_AMBIGUOUS',
    'lease_id', lease.lease_id,
    'resolution_state', case when lease.protocol_version = 'ADMISSION_V2'
      then 'AMBIGUOUS' else 'LEGACY_UNCLASSIFIED' end,
    'active_or_unresolved_leases', unresolved_count,
    'requires_reconciliation', true, 'idempotent', false
  );
end;
$$;

create or replace function public.close_production_scoring_admission(input jsonb)
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
  prior_legacy_closure production_control.scoring_admission_closures%rowtype;
  evidence production_control.scoring_external_fence_evidence%rowtype;
  requested_authority text := pg_catalog.upper(
    coalesce(input->>'expected_authority', '')
  );
  evidence_identifier uuid;
  high_watermark bigint;
  unresolved_count integer;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  existing := production_control.lookup_cutover_receipt(
    'CLOSE_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  if requested_authority not in ('GOOGLE', 'SUPABASE')
     or coalesce(input->>'start_source_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'provider_fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'provider_fence_verification_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'actor_id', '') = '' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_ADMISSION_CLOSE_EXACT_INPUT_REQUIRED';
  end if;
  evidence_identifier := (input->>'external_fence_evidence_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'CLOSE_SCORING_ADMISSION', input
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
  if requested_authority = 'SUPABASE' then
    select * into strict prior_legacy_closure
    from production_control.scoring_admission_closures value
    where value.closure_id = gate.active_closure_id
    for update;
  end if;
  perform production_control.assert_current_external_scoring_fence(
    evidence_identifier, activation.expected_deployment_commit
  );
  select * into strict evidence
  from production_control.scoring_external_fence_evidence value
  where value.evidence_id = evidence_identifier;
  perform production_control.assert_current_google_writer_provider_fence(
    evidence.provider_fence_id, evidence.provider_fence_verification_id,
    activation.expected_deployment_commit, true
  );
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or evidence.provider_fence_id is distinct from
       (input->>'provider_fence_id')::uuid
     or evidence.provider_fence_verification_id is distinct from
       (input->>'provider_fence_verification_id')::uuid
     or evidence.quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or activation.active_google_writer_provider_fence_id is distinct from
       evidence.provider_fence_id
     or activation.active_google_writer_provider_verification_id is distinct from
       evidence.provider_fence_verification_id
     or activation.active_vercel_quiesce_evidence_id is distinct from
       evidence.quiesce_evidence_id
     or gate.google_writer_provider_fence_id is distinct from
       evidence.provider_fence_id
     or gate.google_writer_provider_verification_id is distinct from
       evidence.provider_fence_verification_id
     or (requested_authority = 'GOOGLE'
       and activation.expected_source_fingerprint is distinct from
         pg_catalog.lower(input->>'start_source_fingerprint'))
     or activation.current_authority <> requested_authority
     or gate.authority <> requested_authority
     or gate.state <> 'OPEN'
     or not gate.admission_protocol_enforced
     or (requested_authority = 'GOOGLE' and (
       activation.state <> 'GOOGLE_LEASE_ARMED'
       or activation.scoring_ingress_enabled
       or gate.admission_state <> 'OPEN'
       or gate.active_closure_id is not null
     ))
     or (requested_authority = 'SUPABASE' and (
       activation.state <> 'SCORING_COMMITTED'
       or not activation.scoring_ingress_enabled
       or gate.admission_state <> 'CLOSED'
       or gate.active_closure_id is null
       or prior_legacy_closure.closure_kind <> 'LEGACY_ADMISSION'
       or prior_legacy_closure.authority <> 'GOOGLE'
       or prior_legacy_closure.status not in ('CLOSED', 'CONSUMED')
     )) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_SCORING_ADMISSION_CLOSE_REVISION_CONFLICT';
  end if;
  select coalesce(pg_catalog.max(lease.admission_sequence), 0)
    into high_watermark
  from scoring_authority.scoring_ingress_leases lease
  where lease.tournament_id = '2026'
    and lease.protocol_version = 'ADMISSION_V2'
    and lease.admission_generation_id = gate.admission_generation_id;

  insert into production_control.scoring_admission_closures (
    closure_kind, prior_legacy_closure_id,
    tournament_id, authority, authority_generation_id,
    admission_generation_id, deployment_id,
    opening_admission_revision, closing_admission_revision,
    lease_high_watermark, start_source_fingerprint,
    external_fence_evidence_id, google_writer_provider_fence_id,
    google_writer_provider_verification_id, close_request_fingerprint,
    close_payload_hash, actor_id
  ) values (
    case when requested_authority = 'GOOGLE'
      then 'LEGACY_ADMISSION' else 'SUPABASE_INGRESS' end,
    case when requested_authority = 'SUPABASE'
      then prior_legacy_closure.closure_id else null end,
    '2026', requested_authority, activation.authority_generation_id,
    gate.admission_generation_id, gate.admission_deployment_id,
    gate.admission_revision, gate.admission_revision + 1,
    high_watermark, pg_catalog.lower(input->>'start_source_fingerprint'),
    evidence_identifier, evidence.provider_fence_id,
    evidence.provider_fence_verification_id,
    pg_catalog.lower(input->>'request_fingerprint'),
    production_control.cutover_payload_hash(input),
    pg_catalog.left(input->>'actor_id', 160)
  ) returning * into closure;
  update scoring_authority.scoring_ingress_leases
  set close_fence_id = closure.closure_id
  where tournament_id = '2026'
    and protocol_version = 'ADMISSION_V2'
    and admission_generation_id = gate.admission_generation_id
    and resolution_state in ('ADMITTED', 'WRITE_STARTED', 'AMBIGUOUS', 'PARTIAL_WRITE');
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  ) + production_control.scoring_admission_legacy_blocker_count(
    gate.admission_enforced_at
  );
  update scoring_authority.ingress_gates
  set state = 'PAUSED',
      admission_state = case when requested_authority = 'GOOGLE'
        then 'CLOSING' else 'CLOSED' end,
      admission_revision = closure.closing_admission_revision,
      active_closure_id = closure.closure_id,
      external_fence_evidence_id = evidence_identifier,
      unresolved_client_queues = unresolved_count,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
  returning * into gate;
  update production_control.cutover_activation_state
  set activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_ADMISSION_CLOSING', 'SCORING_AUTHORITY', '2026',
    closure.actor_id, closure.close_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'closure_id', closure.closure_id,
      'authority', closure.authority,
      'lease_high_watermark', closure.lease_high_watermark,
      'admission_revision', gate.admission_revision,
      'active_or_unresolved_leases', unresolved_count,
      'external_fence_evidence_id', evidence_identifier
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_ADMISSION_CLOSING',
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'execution_gate', gate.state, 'admission_state', gate.admission_state,
    'lease_high_watermark', closure.lease_high_watermark,
    'active_or_unresolved_leases', unresolved_count,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CLOSE_SCORING_ADMISSION', input, response_value
  );
  return response_value;
end;
$$;

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
  transitioned_count integer;
  unresolved_count integer;
  legacy_blockers integer;
  lease_fingerprint text;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
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
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id
       is distinct from (input->>'external_fence_evidence_id')::uuid
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or gate.state <> 'PAUSED'
     or gate.admission_state is distinct from (case
       when closure.authority = 'GOOGLE' then 'CLOSING' else 'CLOSED' end)
     or closure.status <> 'CLOSING'
     or closure.authority_generation_id is distinct from activation.authority_generation_id
     or closure.admission_generation_id is distinct from gate.admission_generation_id then
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
  set resolution_state = 'AMBIGUOUS', status = 'ACTIVE', completed_at = null,
      outcome_reported_at = pg_catalog.now(),
      last_error_code = case when resolution_state = 'ADMITTED'
        then 'LEASE_EXPIRED_WITHOUT_WRITE_START_PROOF'
        else 'LEASE_EXPIRED_AFTER_WRITE_START' end
  where tournament_id = '2026'
    and protocol_version = 'ADMISSION_V2'
    and admission_generation_id = gate.admission_generation_id
    and resolution_state in ('ADMITTED', 'WRITE_STARTED')
    and expires_at <= pg_catalog.now();
  get diagnostics transitioned_count = row_count;
  unresolved_count := production_control.scoring_admission_unresolved_count(
    gate.admission_generation_id
  );
  legacy_blockers := production_control.scoring_admission_legacy_blocker_count(
    gate.admission_enforced_at
  );
  lease_fingerprint := production_control.scoring_admission_lease_set_fingerprint(
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
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_ADMISSION_DRAIN_INSPECTED', 'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'),
    case when unresolved_count + legacy_blockers = 0 then 'SUCCEEDED' else 'BLOCKED' end,
    pg_catalog.jsonb_build_object(
      'closure_id', closure.closure_id,
      'expired_became_ambiguous', transitioned_count,
      'v2_unresolved', unresolved_count,
      'legacy_unclassified', legacy_blockers,
      'lease_set_fingerprint', lease_fingerprint
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_ADMISSION_DRAIN_INSPECTED',
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'admission_revision', gate.admission_revision,
    'expired_became_ambiguous', transitioned_count,
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

create or replace function public.finalize_production_scoring_admission(input jsonb)
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
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  existing := production_control.lookup_cutover_receipt(
    'FINALIZE_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  if coalesce(input->>'final_source_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'reconciliation_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'lease_set_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'supabase_match_revisions') is distinct from 'object'
     or pg_catalog.jsonb_typeof(input->'google_checkpoints') is distinct from 'object' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_SCORING_ADMISSION_FINAL_BOUNDARY_REQUIRED';
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
  perform production_control.assert_current_external_scoring_fence(
    (input->>'external_fence_evidence_id')::uuid,
    activation.expected_deployment_commit
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
  current_lease_fingerprint := production_control.scoring_admission_lease_set_fingerprint(
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
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id
       is distinct from (input->>'external_fence_evidence_id')::uuid
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or gate.state <> 'PAUSED'
     or gate.admission_state is distinct from (case
       when closure.authority = 'GOOGLE' then 'CLOSING' else 'CLOSED' end)
     or closure.status <> 'CLOSING'
     or closure.authority_generation_id is distinct from activation.authority_generation_id
     or closure.admission_generation_id is distinct from gate.admission_generation_id
     or boundary_captured_at < closure.closing_at
     or boundary_captured_at > pg_catalog.now()
     or boundary_captured_at < pg_catalog.now() - interval '5 minutes'
     or unresolved_count <> 0 or legacy_blockers <> 0
     or unresolved_outbox <> 0 or unresolved_archive <> 0
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026'
         and lease.protocol_version = 'ADMISSION_V2'
         and lease.admission_generation_id = gate.admission_generation_id
         and lease.admission_sequence > closure.lease_high_watermark
     )
     or pg_catalog.lower(input->>'lease_set_fingerprint')
       is distinct from current_lease_fingerprint
     or input->'supabase_match_revisions' is distinct from current_revisions
     or input->'google_checkpoints' is distinct from current_checkpoints
     or exists (
       select 1
       from scoring_authority.matches match_value
       left join scoring_authority.google_match_checkpoints checkpoint using (match_id)
       where match_value.tournament_id = '2026' and checkpoint.match_id is null
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_ADMISSION_FINAL_BOUNDARY_CHANGED';
  end if;
  update production_control.scoring_admission_closures
  set status = 'CLOSED',
      closed_admission_revision = gate.admission_revision + 1,
      final_source_fingerprint = pg_catalog.lower(input->>'final_source_fingerprint'),
      reconciliation_fingerprint = pg_catalog.lower(input->>'reconciliation_fingerprint'),
      lease_set_fingerprint = current_lease_fingerprint,
      supabase_match_revisions = current_revisions,
      google_checkpoints = current_checkpoints,
      closed_at = pg_catalog.now()
  where closure_id = closure.closure_id
  returning * into closure;
  update scoring_authority.ingress_gates
  set admission_state = 'CLOSED',
      admission_revision = closure.closed_admission_revision,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
  returning * into gate;
  update production_control.cutover_activation_state
  set activation_revision = activation_revision + 1,
      expected_source_fingerprint = closure.final_source_fingerprint,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_ADMISSION_CLOSED', 'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'closure_id', closure.closure_id,
      'authority', closure.authority,
      'admission_revision', gate.admission_revision,
      'final_source_fingerprint', closure.final_source_fingerprint,
      'reconciliation_fingerprint', closure.reconciliation_fingerprint,
      'lease_set_fingerprint', closure.lease_set_fingerprint,
      'active_or_unresolved_leases', 0,
      'unresolved_outbox', 0, 'unresolved_archive', 0
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_ADMISSION_CLOSED',
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'execution_gate', gate.state, 'admission_state', gate.admission_state,
    'final_source_fingerprint', closure.final_source_fingerprint,
    'reconciliation_fingerprint', closure.reconciliation_fingerprint,
    'lease_set_fingerprint', closure.lease_set_fingerprint,
    'active_or_unresolved_leases', 0, 'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'FINALIZE_SCORING_ADMISSION', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.reopen_production_scoring_admission(input jsonb)
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
  next_generation uuid := extensions.gen_random_uuid();
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  existing := production_control.lookup_cutover_receipt(
    'REOPEN_SCORING_ADMISSION', input
  );
  if existing is not null then return existing; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'REOPEN_SCORING_ADMISSION', input
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
  perform production_control.assert_current_external_scoring_fence(
    (input->>'external_fence_evidence_id')::uuid,
    activation.expected_deployment_commit
  );
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id
       is distinct from (input->>'external_fence_evidence_id')::uuid
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit is distinct from input->>'deployment_commit'
     or gate.state <> 'PAUSED'
     or gate.admission_state not in ('CLOSING', 'CLOSED')
     or closure.status not in ('CLOSING', 'CLOSED')
     or closure.authority is distinct from activation.current_authority
     or closure.closure_kind is distinct from 'LEGACY_ADMISSION'
     or closure.authority_generation_id
       is distinct from activation.authority_generation_id
     or closure.admission_generation_id
       is distinct from gate.admission_generation_id
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
     or activation.active_transition_epoch_id is not null
     or exists (
       select 1 from scoring_authority.authority_epochs epoch
       where epoch.tournament_id = '2026' and epoch.status = 'PREPARED'
     )
     or activation.current_authority is distinct from 'GOOGLE'
     or activation.scoring_ingress_enabled
     or activation.state not in ('GOOGLE_LEASE_ARMED', 'ROLLED_BACK') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SCORING_ADMISSION_NOT_REOPENABLE';
  end if;
  update production_control.scoring_admission_closures
  set status = 'REOPENED', reopened_at = pg_catalog.now()
  where closure_id = closure.closure_id;
  update scoring_authority.ingress_gates
  set state = 'OPEN', admission_state = 'OPEN',
      admission_revision = admission_revision + 1,
      admission_generation_id = next_generation,
      admission_opened_at = pg_catalog.now(), active_closure_id = null,
      external_fence_evidence_id = null,
      unresolved_client_queues = 0,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
  returning * into gate;
  update production_control.cutover_activation_state
  set activation_revision = activation_revision + 1,
      updated_by = pg_catalog.left(input->>'actor_id', 160),
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_SCORING_ADMISSION_REOPENED', 'SCORING_AUTHORITY', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'closure_id', closure.closure_id,
      'authority', gate.authority,
      'new_admission_generation_id', gate.admission_generation_id,
      'admission_revision', gate.admission_revision
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_SCORING_ADMISSION_REOPENED',
    'closure_id', closure.closure_id,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'execution_gate', gate.state, 'admission_state', gate.admission_state,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'REOPEN_SCORING_ADMISSION', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.commit_production_authority_epoch(input jsonb)
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
  rollback_legacy_closure production_control.scoring_admission_closures%rowtype;
  evidence production_control.scoring_external_fence_evidence%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  unresolved_outbox integer;
  unresolved_archive integer;
  boundary_at timestamptz;
  next_admission_generation uuid := extensions.gen_random_uuid();
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  if coalesce(input->>'epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'closure_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'provider_fence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'provider_fence_verification_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'quiesce_evidence_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'reconciliation_fingerprint', '')
       !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_AUTHORITY_COMMIT_V2_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'COMMIT_AUTHORITY_EPOCH', input
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
  select * into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = (input->>'epoch_id')::uuid
  for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid
  for update;
  select * into strict evidence
  from production_control.scoring_external_fence_evidence value
  where value.evidence_id = (input->>'external_fence_evidence_id')::uuid;
  perform production_control.assert_current_external_scoring_fence(
    (input->>'external_fence_evidence_id')::uuid,
    activation.expected_deployment_commit
  );
  perform production_control.assert_current_google_writer_provider_fence(
    (input->>'provider_fence_id')::uuid,
    (input->>'provider_fence_verification_id')::uuid,
    activation.expected_deployment_commit, true
  );
  select pg_catalog.count(*)::integer into unresolved_outbox
  from scoring_authority.google_outbox_events event
  where event.tournament_id = '2026' and event.status <> 'DELIVERED';
  select pg_catalog.count(*)::integer into unresolved_archive
  from scoring_authority.scorecard_archive_jobs job
  where job.tournament_id = '2026'
    and job.status not in ('VERIFIED', 'SUPERSEDED');

  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or activation.active_transition_epoch_id is distinct from epoch.epoch_id
     or gate.active_epoch_id is distinct from epoch.epoch_id
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id
       is distinct from (input->>'external_fence_evidence_id')::uuid
     or closure.external_fence_evidence_id
       is distinct from (input->>'external_fence_evidence_id')::uuid
     or evidence.quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or evidence.provider_fence_id is distinct from
       (input->>'provider_fence_id')::uuid
     or evidence.provider_fence_verification_id is distinct from
       (input->>'provider_fence_verification_id')::uuid
     or closure.google_writer_provider_fence_id is distinct from
       (input->>'provider_fence_id')::uuid
     or closure.google_writer_provider_verification_id is distinct from
       (input->>'provider_fence_verification_id')::uuid
     or gate.google_writer_provider_fence_id is distinct from
       (input->>'provider_fence_id')::uuid
     or gate.google_writer_provider_verification_id is distinct from
       (input->>'provider_fence_verification_id')::uuid
     or activation.active_google_writer_provider_fence_id is distinct from
       (input->>'provider_fence_id')::uuid
     or activation.active_google_writer_provider_verification_id is distinct from
       (input->>'provider_fence_verification_id')::uuid
     or activation.active_vercel_quiesce_evidence_id is distinct from
       (input->>'quiesce_evidence_id')::uuid
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit
       is distinct from input->>'deployment_commit'
     or gate.state is distinct from 'PAUSED'
     or gate.admission_state is distinct from 'CLOSED'
     or closure.status is distinct from 'CLOSED'
     or epoch.status is distinct from 'PREPARED'
     or epoch.tournament_id is distinct from '2026'
     or epoch.admission_closure_id is distinct from closure.closure_id
     or epoch.admission_generation_id
       is distinct from gate.admission_generation_id
     or epoch.closed_admission_revision
       is distinct from gate.admission_revision
     or epoch.closure_boundary_fingerprint
       is distinct from closure.lease_set_fingerprint
     or epoch.external_fence_evidence_id
       is distinct from gate.external_fence_evidence_id
     or epoch.external_fence_evidence_id is distinct from evidence.evidence_id
     or epoch.google_writer_provider_fence_id is distinct from
       closure.google_writer_provider_fence_id
     or epoch.google_writer_provider_verification_id is distinct from
       closure.google_writer_provider_verification_id
     or epoch.google_writer_provider_fence_id is distinct from
       evidence.provider_fence_id
     or epoch.google_writer_provider_verification_id is distinct from
       evidence.provider_fence_verification_id
     or epoch.deployment_commit
       is distinct from activation.expected_deployment_commit
     or epoch.source_fingerprint
       is distinct from activation.expected_source_fingerprint
     or epoch.reconciliation_fingerprint is distinct from
       pg_catalog.lower(input->>'reconciliation_fingerprint')
     or epoch.supabase_match_revisions is distinct from
       production_control.current_match_revisions('2026')
     or epoch.google_checkpoints is distinct from
       production_control.current_google_checkpoints('2026')
     or production_control.scoring_admission_unresolved_count(
       gate.admission_generation_id
     ) <> 0
     or production_control.scoring_admission_legacy_blocker_count(
       gate.admission_enforced_at
     ) <> 0
     or unresolved_outbox <> 0
     or unresolved_archive <> 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_AUTHORITY_COMMIT_V2_PRECONDITION_FAILED';
  end if;
  if (epoch.epoch_type = 'CUTOVER' and (
       activation.state is distinct from 'CUTOVER_PREPARED'
       or epoch.authority_before is distinct from 'GOOGLE'
       or epoch.authority_after is distinct from 'SUPABASE'
       or gate.authority is distinct from 'GOOGLE'
       or closure.authority is distinct from 'GOOGLE'
       or closure.closure_kind is distinct from 'LEGACY_ADMISSION'
     )) or (epoch.epoch_type = 'ROLLBACK' and (
       activation.state is distinct from 'ROLLBACK_PREPARED'
       or epoch.authority_before is distinct from 'SUPABASE'
       or epoch.authority_after is distinct from 'GOOGLE'
       or gate.authority is distinct from 'SUPABASE'
       or closure.authority is distinct from 'SUPABASE'
       or closure.closure_kind is distinct from 'SUPABASE_INGRESS'
     )) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_AUTHORITY_COMMIT_V2_DIRECTION_INVALID';
  end if;

  boundary_at := pg_catalog.now();
  update scoring_authority.authority_epochs
  set status = 'COMMITTED', committed_at = boundary_at
  where epoch_id = epoch.epoch_id;
  update scoring_authority.tournaments
  set scoring_authority = epoch.authority_after, updated_at = boundary_at
  where tournament_id = '2026';

  if epoch.authority_after = 'SUPABASE' then
    update production_control.scoring_admission_closures
    set status = 'CONSUMED', consumed_at = boundary_at,
        consumed_epoch_id = epoch.epoch_id
    where closure_id = closure.closure_id;
    update scoring_authority.ingress_gates
    set state = 'OPEN', authority = 'SUPABASE',
        active_epoch_id = epoch.epoch_id,
        admission_state = 'CLOSED',
        admission_revision = admission_revision + 1,
        active_closure_id = closure.closure_id,
        external_fence_evidence_id = closure.external_fence_evidence_id,
        unresolved_client_queues = 0,
        updated_by = input->>'actor_id', updated_at = boundary_at
    where tournament_id = '2026'
    returning * into gate;
    update production_control.resource_scope
    set scoring_authority = 'SUPABASE', scoring_ingress_enabled = true,
        updated_at = boundary_at
    where scope_key = 'BAGGER_INV_PRODUCTION';
    update production_control.cutover_activation_state
    set state = 'SCORING_COMMITTED',
        activation_revision = activation_revision + 1,
        current_authority = 'SUPABASE', scoring_ingress_enabled = true,
        authority_generation_id = epoch.epoch_id,
        active_transition_epoch_id = null,
        first_supabase_write_possible_at = boundary_at,
        first_supabase_write_observed_at = null,
        first_supabase_mutation_key = null,
        first_supabase_match_id = null,
        first_supabase_match_revision = null,
        updated_by = input->>'actor_id', updated_at = boundary_at
    where scope_key = 'BAGGER_INV_PRODUCTION'
    returning * into activation;
  else
    insert into production_control.scoring_admission_closures (
      closure_kind, prior_legacy_closure_id,
      tournament_id, authority, authority_generation_id,
      admission_generation_id, deployment_id, status,
      opening_admission_revision, closing_admission_revision,
      closed_admission_revision, lease_high_watermark,
      start_source_fingerprint, final_source_fingerprint,
      reconciliation_fingerprint, lease_set_fingerprint,
      supabase_match_revisions, google_checkpoints,
      external_fence_evidence_id, google_writer_provider_fence_id,
      google_writer_provider_verification_id, close_request_fingerprint,
      close_payload_hash, closing_at, closed_at, actor_id
    ) values (
      'LEGACY_ADMISSION', null, '2026', 'GOOGLE', epoch.epoch_id,
      next_admission_generation, input->>'deployment_id', 'CLOSED',
      gate.admission_revision, gate.admission_revision + 1,
      gate.admission_revision + 1, 0,
      epoch.source_fingerprint, epoch.source_fingerprint,
      epoch.reconciliation_fingerprint,
      production_control.scoring_admission_lease_set_fingerprint(
        next_admission_generation
      ),
      epoch.supabase_match_revisions, epoch.google_checkpoints,
      (input->>'external_fence_evidence_id')::uuid,
      epoch.google_writer_provider_fence_id,
      epoch.google_writer_provider_verification_id,
      pg_catalog.lower(input->>'request_fingerprint'),
      production_control.cutover_payload_hash(input),
      boundary_at, boundary_at, input->>'actor_id'
    ) returning * into rollback_legacy_closure;
    execute 'alter table scoring_authority.matches disable trigger capture_scorecard_archive_transition';
    update production_control.worker_controls
    set enabled = false, google_writes_allowed = false,
        metadata = metadata || pg_catalog.jsonb_build_object(
          'disabled_by_epoch', epoch.epoch_id,
          'disabled_at', boundary_at
        )
    where worker_name in (
      'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'
    );
    update production_control.worker_contracts
    set operation_allowed = false, authoritative_write_allowed = false
    where worker_name in (
      'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'
    );
    update scoring_authority.ingress_gates
    set state = 'PAUSED', authority = 'GOOGLE',
        active_epoch_id = epoch.epoch_id,
        admission_state = 'CLOSED',
        admission_revision = rollback_legacy_closure.closed_admission_revision,
        admission_generation_id = rollback_legacy_closure.admission_generation_id,
        active_closure_id = rollback_legacy_closure.closure_id,
        external_fence_evidence_id = rollback_legacy_closure.external_fence_evidence_id,
        unresolved_client_queues = 0,
        updated_by = input->>'actor_id', updated_at = boundary_at
    where tournament_id = '2026'
    returning * into gate;
    update production_control.resource_scope
    set scoring_authority = 'GOOGLE', scoring_ingress_enabled = false,
        workers_enabled = exists (
          select 1 from production_control.worker_controls value
          where value.enabled
        ),
        google_writes_enabled = exists (
          select 1 from production_control.worker_controls value
          where value.enabled and value.google_writes_allowed
        ),
        updated_at = boundary_at
    where scope_key = 'BAGGER_INV_PRODUCTION';
    update production_control.cutover_activation_state
    set state = 'ROLLED_BACK',
        activation_revision = activation_revision + 1,
        current_authority = 'GOOGLE', scoring_ingress_enabled = false,
        authority_generation_id = epoch.epoch_id,
        active_transition_epoch_id = null,
        updated_by = input->>'actor_id', updated_at = boundary_at
    where scope_key = 'BAGGER_INV_PRODUCTION'
    returning * into activation;
  end if;

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', epoch.epoch_type || '_EPOCH_COMMITTED', input->>'actor_id',
    pg_catalog.jsonb_build_object(
      'epoch_id', epoch.epoch_id,
      'closure_id', closure.closure_id,
      'authority_before', epoch.authority_before,
      'authority_after', epoch.authority_after,
      'first_supabase_canonical_write_possible_at',
        case when epoch.authority_after = 'SUPABASE'
          then boundary_at else null end
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    case when epoch.authority_after = 'SUPABASE'
      then 'FIRST_SUPABASE_CANONICAL_WRITE_POSSIBLE'
      else 'PRODUCTION_SCORING_AUTHORITY_ROLLED_BACK' end,
    'SCORING_AUTHORITY', '2026', input->>'actor_id',
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'epoch_id', epoch.epoch_id,
      'closure_id', closure.closure_id,
      'authority', epoch.authority_after,
      'boundary_at', boundary_at,
      'admission_state', gate.admission_state,
      'scoring_ingress_enabled', activation.scoring_ingress_enabled,
      'workers_enabled', false,
      'google_writes_enabled', false
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_AUTHORITY_EPOCH_V2_COMMITTED',
    'epoch_id', epoch.epoch_id,
    'closure_id', closure.closure_id,
    'authority', epoch.authority_after,
    'ingress', gate.state,
    'admission_state', gate.admission_state,
    'scoring_ingress_enabled', activation.scoring_ingress_enabled,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'first_supabase_canonical_write_possible',
      epoch.authority_after = 'SUPABASE',
    'first_supabase_canonical_write_possible_at',
      case when epoch.authority_after = 'SUPABASE'
        then boundary_at else null end,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'COMMIT_AUTHORITY_EPOCH', input, response_value
  );
  return response_value;
end;
$$;

create or replace function public.abort_production_authority_epoch(input jsonb)
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
  prior_legacy_closure production_control.scoring_admission_closures%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  perform production_control.assert_scoring_admission_optimistic_input(input, true);
  if coalesce(input->>'epoch_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'closure_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_AUTHORITY_ABORT_V2_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'ABORT_AUTHORITY_EPOCH', input
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
  select * into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = (input->>'epoch_id')::uuid
  for update;
  select * into strict closure
  from production_control.scoring_admission_closures value
  where value.closure_id = (input->>'closure_id')::uuid
  for update;
  if epoch.epoch_type = 'ROLLBACK' then
    select * into strict prior_legacy_closure
    from production_control.scoring_admission_closures value
    where value.closure_id = closure.prior_legacy_closure_id
    for update;
  end if;
  if activation.activation_revision
       is distinct from (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id
       is distinct from (input->>'expected_authority_generation')::uuid
     or gate.admission_generation_id
       is distinct from (input->>'expected_admission_generation')::uuid
     or gate.admission_revision
       is distinct from (input->>'expected_admission_revision')::bigint
     or activation.active_transition_epoch_id is distinct from epoch.epoch_id
     or gate.active_epoch_id is distinct from epoch.epoch_id
     or gate.active_closure_id is distinct from closure.closure_id
     or gate.external_fence_evidence_id
       is distinct from (input->>'external_fence_evidence_id')::uuid
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or activation.expected_deployment_commit
       is distinct from input->>'deployment_commit'
     or gate.state is distinct from 'PAUSED'
     or gate.admission_state is distinct from 'CLOSED'
     or closure.status is distinct from 'CLOSED'
     or epoch.status is distinct from 'PREPARED'
     or epoch.admission_closure_id is distinct from closure.closure_id
     or epoch.admission_generation_id
       is distinct from gate.admission_generation_id
     or epoch.closed_admission_revision
       is distinct from gate.admission_revision
     or epoch.external_fence_evidence_id
       is distinct from gate.external_fence_evidence_id
     or (epoch.epoch_type = 'CUTOVER' and (
       activation.state is distinct from 'CUTOVER_PREPARED'
       or activation.current_authority is distinct from 'GOOGLE'
       or activation.scoring_ingress_enabled
       or epoch.authority_before is distinct from 'GOOGLE'
     ))
     or (epoch.epoch_type = 'ROLLBACK' and (
       activation.state is distinct from 'ROLLBACK_PREPARED'
       or activation.current_authority is distinct from 'SUPABASE'
       or not activation.scoring_ingress_enabled
       or epoch.authority_before is distinct from 'SUPABASE'
       or closure.closure_kind is distinct from 'SUPABASE_INGRESS'
       or prior_legacy_closure.closure_kind is distinct from 'LEGACY_ADMISSION'
       or prior_legacy_closure.authority is distinct from 'GOOGLE'
     )) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_AUTHORITY_EPOCH_V2_NOT_ABORTABLE';
  end if;

  update scoring_authority.authority_epochs
  set status = 'ABORTED', aborted_at = pg_catalog.now(),
      reason = pg_catalog.left(coalesce(
        nullif(input->>'reason', ''), reason
      ), 500)
  where epoch_id = epoch.epoch_id;

  if epoch.authority_before = 'SUPABASE' then
    update production_control.scoring_admission_closures
    set status = 'REOPENED', reopened_at = pg_catalog.now()
    where closure_id = closure.closure_id;
    update scoring_authority.ingress_gates
    set state = 'OPEN', authority = 'SUPABASE',
        active_epoch_id = epoch.prior_active_epoch_id,
        admission_state = 'CLOSED',
        admission_revision = admission_revision + 1,
        active_closure_id = prior_legacy_closure.closure_id,
        external_fence_evidence_id =
          (input->>'external_fence_evidence_id')::uuid,
        unresolved_client_queues = 0,
        updated_by = input->>'actor_id', updated_at = pg_catalog.now()
    where tournament_id = '2026'
    returning * into gate;
  else
    -- A CUTOVER abort deliberately leaves legacy Google admission CLOSED.
    -- Only the separately audited Google-only reopen RPC may admit it again.
    update scoring_authority.ingress_gates
    set state = 'PAUSED', authority = 'GOOGLE',
        active_epoch_id = epoch.prior_active_epoch_id,
        admission_state = 'CLOSED',
        unresolved_client_queues = 0,
        updated_by = input->>'actor_id', updated_at = pg_catalog.now()
    where tournament_id = '2026'
    returning * into gate;
  end if;
  update production_control.cutover_activation_state
  set state = case when epoch.authority_before = 'GOOGLE'
        then 'GOOGLE_LEASE_ARMED' else 'SCORING_COMMITTED' end,
      activation_revision = activation_revision + 1,
      expected_source_fingerprint = epoch.prior_source_fingerprint,
      active_transition_epoch_id = null,
      updated_by = input->>'actor_id', updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', epoch.epoch_type || '_EPOCH_ABORTED', input->>'actor_id',
    pg_catalog.jsonb_build_object(
      'epoch_id', epoch.epoch_id,
      'closure_id', closure.closure_id,
      'authority', epoch.authority_before,
      'admission_state', gate.admission_state,
      'legacy_google_automatically_reopened', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_AUTHORITY_EPOCH_V2_ABORTED', 'SCORING_AUTHORITY', '2026',
    input->>'actor_id', pg_catalog.lower(input->>'request_fingerprint'),
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'epoch_id', epoch.epoch_id,
      'closure_id', closure.closure_id,
      'authority', epoch.authority_before,
      'execution_gate', gate.state,
      'admission_state', gate.admission_state,
      'legacy_google_automatically_reopened', false
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_AUTHORITY_EPOCH_V2_ABORTED',
    'epoch_id', epoch.epoch_id,
    'closure_id', closure.closure_id,
    'authority', epoch.authority_before,
    'ingress', gate.state,
    'admission_state', gate.admission_state,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
    'admission_generation_id', gate.admission_generation_id,
    'admission_revision', gate.admission_revision,
    'legacy_google_automatically_reopened', false,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'ABORT_AUTHORITY_EPOCH', input, response_value
  );
  return response_value;
end;
$$;

create or replace function production_control.assert_production_scoring_runtime(
  input jsonb,
  required_worker text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  active_closure production_control.scoring_admission_closures%rowtype;
  legacy_closure production_control.scoring_admission_closures%rowtype;
  required_worker_name text := pg_catalog.upper(
    coalesce(required_worker, '')
  );
  normal_supabase_runtime boolean := false;
  rollback_worker_drain boolean := false;
begin
  -- The transaction-scoped shared lock remains held through the caller RPC.
  -- Close/prepare/commit/reopen use the exclusive counterpart, so no Supabase
  -- canonical mutation can cross an admission boundary after this assertion.
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  select * into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  select * into strict active_closure
  from production_control.scoring_admission_closures value
  where value.closure_id = gate.active_closure_id;

  if active_closure.closure_kind = 'SUPABASE_INGRESS' then
    select * into strict legacy_closure
    from production_control.scoring_admission_closures value
    where value.closure_id = active_closure.prior_legacy_closure_id;
  else
    legacy_closure := active_closure;
  end if;

  normal_supabase_runtime :=
    gate.state = 'OPEN'
    and active_closure.closure_kind = 'LEGACY_ADMISSION'
    and active_closure.authority = 'GOOGLE'
    and active_closure.status = 'CONSUMED'
    and active_closure.consumed_epoch_id = activation.authority_generation_id
    and active_closure.admission_generation_id = gate.admission_generation_id
    and active_closure.deployment_id = gate.admission_deployment_id
    and active_closure.external_fence_evidence_id = gate.external_fence_evidence_id;

  -- A Supabase mutation that held the shared authority lock may have committed
  -- immediately before rollback acquired the exclusive lock and paused new
  -- ingress. Its durable Google mirror/archive work must remain drainable or
  -- rollback finalization would deadlock on its own unresolved-queue checks.
  -- This exception is intentionally worker-only: every participant/Director
  -- canonical mutation calls this function without required_worker and stays
  -- rejected while the execution gate is PAUSED.
  rollback_worker_drain :=
    required_worker_name in (
      'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'
    )
    and gate.state = 'PAUSED'
    and active_closure.closure_kind = 'SUPABASE_INGRESS'
    and active_closure.authority = 'SUPABASE'
    and active_closure.status = 'CLOSING'
    and active_closure.authority_generation_id =
      activation.authority_generation_id
    and active_closure.admission_generation_id = gate.admission_generation_id
    and active_closure.deployment_id = gate.admission_deployment_id
    and active_closure.external_fence_evidence_id =
      gate.external_fence_evidence_id
    and active_closure.prior_legacy_closure_id = legacy_closure.closure_id
    and legacy_closure.closure_kind = 'LEGACY_ADMISSION'
    and legacy_closure.authority = 'GOOGLE'
    and legacy_closure.status = 'CONSUMED'
    and legacy_closure.consumed_epoch_id = activation.authority_generation_id
    and activation.active_transition_epoch_id is null;

  if activation.state is distinct from 'SCORING_COMMITTED'
     or activation.current_authority is distinct from 'SUPABASE'
     or not activation.scoring_ingress_enabled
     or activation.authority_generation_id is distinct from
       nullif(input->>'expected_epoch_id', '')::uuid
     or resource.scoring_authority is distinct from 'SUPABASE'
     or not resource.scoring_ingress_enabled
     or gate.admission_state is distinct from 'CLOSED'
     or not gate.admission_protocol_enforced
     or gate.active_closure_id is null
     or gate.external_fence_evidence_id is null
     or gate.authority is distinct from 'SUPABASE'
     or gate.active_epoch_id
       is distinct from activation.authority_generation_id
     or not (normal_supabase_runtime or rollback_worker_drain)
     or not exists (
       select 1 from scoring_authority.tournaments value
       where value.tournament_id = '2026'
         and value.scoring_authority = 'SUPABASE'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_SUPABASE_SCORING_ADMISSION_V2_REQUIRED';
  end if;

  if required_worker_name <> '' then
    if required_worker_name not in (
         'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'
       )
       or not resource.workers_enabled
       or not resource.google_writes_enabled
       or not exists (
         select 1
         from production_control.worker_controls controls
         join production_control.worker_contracts contracts
           using (worker_name)
         where controls.worker_name = required_worker_name
           and controls.enabled
           and controls.google_writes_allowed
           and contracts.operation_allowed
           and contracts.requires_google_write
           and not contracts.authoritative_write_allowed
           and coalesce(
             controls.metadata->>'activation_epoch_id', ''
           ) = activation.authority_generation_id::text
           and coalesce(
             controls.metadata->>'deployment_commit', ''
           ) = activation.expected_deployment_commit
           and coalesce(
             controls.metadata->>'google_service_account', ''
           ) = activation.expected_google_service_account
       ) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_SCORING_WORKER_NOT_ENABLED';
    end if;
  end if;
  perform pg_catalog.set_config(
    'production_control.scoring_runtime_authority_generation',
    activation.authority_generation_id::text,
    true
  );
  perform pg_catalog.set_config(
    'production_control.scoring_runtime_admission_generation',
    gate.admission_generation_id::text,
    true
  );
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
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contract_version', gate.admission_contract_version,
    'activation_state', activation.state,
    'activation_revision', activation.activation_revision,
    'authority_generation_id', activation.authority_generation_id,
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

-- Preserve the reviewed 033 implementation behind a v2 lock/disarm wrapper.
-- The wrapper prevents the old precommit abort from expiring an ambiguous v2
-- lease or leaving a stale enforced protocol attached to a DORMANT release.
alter function public.abort_production_precommit_release(jsonb)
  rename to abort_production_precommit_release_legacy_v1;

revoke all on function public.abort_production_precommit_release_legacy_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.abort_production_precommit_release(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  existing jsonb;
  gate scoring_authority.ingress_gates%rowtype;
  response_value jsonb;
  was_enforced boolean;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  -- Fixed global order: Odds lock first, admission lock second.
  perform pg_catalog.pg_advisory_xact_lock(731102026031::bigint);
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  existing := production_control.lookup_cutover_receipt(
    'ABORT_PRECOMMIT_RELEASE', input
  );
  if existing is not null then return existing; end if;
  select * into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;
  was_enforced := gate.admission_protocol_enforced;
  if was_enforced and (
       gate.admission_state is distinct from 'OPEN'
       or gate.active_closure_id is not null
       or gate.external_fence_evidence_id is not null
       or production_control.scoring_admission_unresolved_count(
         gate.admission_generation_id
       ) <> 0
       or production_control.scoring_admission_legacy_blocker_count(
         gate.admission_enforced_at
       ) <> 0
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_PRECOMMIT_ABORT_ADMISSION_V2_UNRESOLVED';
  end if;

  response_value := public.abort_production_precommit_release_legacy_v1(input);
  if was_enforced then
    update scoring_authority.ingress_gates
    set admission_state = 'OPEN',
        admission_revision = admission_revision + 1,
        admission_generation_id = extensions.gen_random_uuid(),
        admission_protocol_enforced = false,
        admission_enforced_at = null,
        admission_opened_at = null,
        admission_deployment_id = null,
        legacy_lease_set_fingerprint = null,
        active_closure_id = null,
        external_fence_evidence_id = null,
        unresolved_client_queues = 0,
        updated_by = input->>'actor_id',
        updated_at = pg_catalog.now()
    where tournament_id = '2026';
  end if;
  return response_value;
end;
$$;

revoke all on table production_control.vercel_writer_quiesce_evidence
  from public, anon, authenticated, service_role;
revoke all on table production_control.vercel_provider_attestation_challenges
  from public, anon, authenticated, service_role;
revoke all on table production_control.vercel_provider_attestations
  from public, anon, authenticated, service_role;
revoke all on table production_control.google_writer_provider_fences
  from public, anon, authenticated, service_role;
revoke all on table
  production_control.google_writer_provider_fence_verifications
  from public, anon, authenticated, service_role;
revoke all on table production_control.scoring_external_fence_evidence
  from public, anon, authenticated, service_role;
revoke all on table production_control.scoring_admission_closures
  from public, anon, authenticated, service_role;
revoke all on table production_control.google_writer_fence_rehearsals
  from public, anon, authenticated, service_role;
grant select on table production_control.vercel_writer_quiesce_evidence
  to service_role;
grant select on table production_control.vercel_provider_attestation_challenges
  to service_role;
grant select on table production_control.vercel_provider_attestations
  to service_role;
grant select on table production_control.google_writer_provider_fences
  to service_role;
grant select on table
  production_control.google_writer_provider_fence_verifications
  to service_role;
grant select on table production_control.scoring_external_fence_evidence
  to service_role;
grant select on table production_control.scoring_admission_closures
  to service_role;
grant select on table production_control.google_writer_fence_rehearsals
  to service_role;
revoke all on sequence production_control.scoring_admission_lease_sequence
  from public, anon, authenticated, service_role;

do $admission_acl$
declare
  signature text;
begin
  foreach signature in array array[
    'production_control.structured_evidence_fingerprint(jsonb)',
    'production_control.normalized_vercel_origin_inventory(jsonb)',
    'production_control.vercel_origin_inventory_fingerprint(jsonb)',
    'production_control.expected_vercel_live_inventory(jsonb,text,text,text,text)',
    'production_control.assert_exact_vercel_live_inventory(jsonb,jsonb,text,text,text,text)',
    'production_control.vercel_provider_attestation_challenge_response(production_control.vercel_provider_attestation_challenges,boolean)',
    'production_control.vercel_provider_attestation_response(production_control.vercel_provider_attestations,boolean)',
    'production_control.disabled_direct_vercel_provider_attestation_record(uuid,text,text,jsonb)',
    'production_control.record_verified_vercel_provider_attestation(uuid,text,text,jsonb)',
    'production_control.assert_exact_vercel_origin_inventory(jsonb)',
    'production_control.normalized_vercel_probe_records(jsonb)',
    'production_control.normalized_vercel_probe_scope(jsonb)',
    'production_control.assert_exact_vercel_probe_records(jsonb,jsonb,text,text,text,text,text,text,text)',
    'production_control.vercel_quiesce_response(production_control.vercel_writer_quiesce_evidence,boolean)',
    'production_control.normalized_google_writer_fence_protections(jsonb)',
    'production_control.assert_exact_google_writer_fence_protections(jsonb,text)',
    'production_control.google_writer_provider_fence_response(production_control.google_writer_provider_fences,boolean)',
    'production_control.assert_current_google_writer_provider_fence(uuid,uuid,text,boolean)',
    'production_control.insert_google_writer_provider_fence_verification(uuid,jsonb)',
    'production_control.assert_google_writer_provider_fence_removal_safe(uuid,jsonb)',
    'production_control.scoring_admission_lock_key()',
    'production_control.scoring_admission_unresolved_count(uuid)',
    'production_control.scoring_admission_legacy_blocker_count(timestamptz)',
    'production_control.scoring_admission_legacy_set_fingerprint()',
    'production_control.scoring_admission_lease_set_fingerprint(uuid)',
    'production_control.google_writer_fence_rehearsal_response(production_control.google_writer_fence_rehearsals,boolean)',
    'production_control.assert_no_unrestored_google_writer_fence_rehearsal()',
    'production_control.assert_certified_google_writer_fence_rehearsal(text)',
    'production_control.guard_authority_during_google_writer_fence_rehearsal()',
    'production_control.assert_current_external_scoring_fence(uuid,text)',
    'production_control.assert_scoring_admission_optimistic_input(jsonb,boolean)',
    'production_control.assert_production_scoring_lease_nonce(scoring_authority.scoring_ingress_leases,text)',
    'production_control.scoring_lease_outcome_evidence_hash(uuid,text,text,text,text,text,text,uuid,uuid,bigint)',
    'production_control.scoring_admission_begin_payload_hash(jsonb)',
    'production_control.scoring_legacy_resolution_evidence_hash(uuid,text,text,text,uuid,text)',
    'public.issue_production_vercel_provider_attestation_challenge(jsonb)',
    'public.inspect_production_vercel_provider_attestation_challenge(jsonb)',
    'public.consume_production_vercel_provider_attestation_challenge(jsonb)',
    'public.begin_production_vercel_writer_quiesce_evidence(jsonb)',
    'public.finalize_production_vercel_writer_quiesce_evidence(jsonb)',
    'public.inspect_production_vercel_writer_quiesce_evidence(jsonb)',
    'public.begin_production_google_writer_provider_fence_install(jsonb)',
    'public.finish_production_google_writer_provider_fence_install(jsonb)',
    'public.inspect_production_google_writer_provider_fence(jsonb)',
    'public.refresh_production_google_writer_provider_fence(jsonb)',
    'public.authorize_production_google_writer_provider_fence_removal(jsonb)',
    'public.finish_production_google_writer_provider_fence_removal(jsonb)',
    'public.begin_production_google_writer_fence_rehearsal(jsonb)',
    'public.finish_production_google_writer_fence_rehearsal(jsonb)',
    'public.inspect_production_google_writer_fence_rehearsal(jsonb)',
    'public.stage_production_cutover_release_pre_step11_6_rehearsal(jsonb)',
    'public.stage_production_cutover_release(jsonb)',
    'public.record_production_scoring_external_fence_evidence(jsonb)',
    'public.refresh_production_scoring_external_fence_evidence(jsonb)',
    'public.arm_production_google_ingress_lease_gate(jsonb)',
    'public.begin_production_scoring_ingress_v2(jsonb)',
    'public.begin_production_scoring_ingress(jsonb)',
    'public.mark_production_scoring_ingress_write_started(jsonb)',
    'public.report_production_scoring_ingress_outcome(jsonb)',
    'public.resolve_production_scoring_ingress_ambiguity(jsonb)',
    'public.resolve_production_legacy_scoring_ingress(jsonb)',
    'public.complete_production_scoring_ingress(jsonb)',
    'public.close_production_scoring_admission(jsonb)',
    'public.drain_production_scoring_admission(jsonb)',
    'public.finalize_production_scoring_admission(jsonb)',
    'public.reopen_production_scoring_admission(jsonb)',
    'public.prepare_production_authority_epoch(jsonb)',
    'public.commit_production_authority_epoch(jsonb)',
    'public.abort_production_authority_epoch(jsonb)',
    'production_control.assert_production_scoring_runtime(jsonb,text)',
    'public.inspect_production_scoring_admission(jsonb)',
    'public.abort_production_precommit_release_legacy_v1(jsonb)',
    'public.abort_production_precommit_release(jsonb)'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
  end loop;
end
$admission_acl$;

grant execute on function public.issue_production_vercel_provider_attestation_challenge(jsonb)
  to service_role;
grant execute on function public.inspect_production_vercel_provider_attestation_challenge(jsonb)
  to service_role;
grant execute on function public.consume_production_vercel_provider_attestation_challenge(jsonb)
  to service_role;
grant execute on function public.begin_production_vercel_writer_quiesce_evidence(jsonb)
  to service_role;
grant execute on function public.finalize_production_vercel_writer_quiesce_evidence(jsonb)
  to service_role;
grant execute on function public.inspect_production_vercel_writer_quiesce_evidence(jsonb)
  to service_role;
grant execute on function public.begin_production_google_writer_provider_fence_install(jsonb)
  to service_role;
grant execute on function public.finish_production_google_writer_provider_fence_install(jsonb)
  to service_role;
grant execute on function public.inspect_production_google_writer_provider_fence(jsonb)
  to service_role;
grant execute on function public.refresh_production_google_writer_provider_fence(jsonb)
  to service_role;
grant execute on function public.authorize_production_google_writer_provider_fence_removal(jsonb)
  to service_role;
grant execute on function public.finish_production_google_writer_provider_fence_removal(jsonb)
  to service_role;
grant execute on function public.begin_production_google_writer_fence_rehearsal(jsonb)
  to service_role;
grant execute on function public.finish_production_google_writer_fence_rehearsal(jsonb)
  to service_role;
grant execute on function public.inspect_production_google_writer_fence_rehearsal(jsonb)
  to service_role;
grant execute on function public.stage_production_cutover_release(jsonb)
  to service_role;
grant execute on function public.record_production_scoring_external_fence_evidence(jsonb)
  to service_role;
grant execute on function public.refresh_production_scoring_external_fence_evidence(jsonb)
  to service_role;
grant execute on function public.arm_production_google_ingress_lease_gate(jsonb)
  to service_role;
grant execute on function public.begin_production_scoring_ingress_v2(jsonb)
  to service_role;
grant execute on function public.begin_production_scoring_ingress(jsonb)
  to service_role;
grant execute on function public.mark_production_scoring_ingress_write_started(jsonb)
  to service_role;
grant execute on function public.report_production_scoring_ingress_outcome(jsonb)
  to service_role;
grant execute on function public.resolve_production_scoring_ingress_ambiguity(jsonb)
  to service_role;
grant execute on function public.resolve_production_legacy_scoring_ingress(jsonb)
  to service_role;
grant execute on function public.complete_production_scoring_ingress(jsonb)
  to service_role;
grant execute on function public.close_production_scoring_admission(jsonb)
  to service_role;
grant execute on function public.drain_production_scoring_admission(jsonb)
  to service_role;
grant execute on function public.finalize_production_scoring_admission(jsonb)
  to service_role;
grant execute on function public.reopen_production_scoring_admission(jsonb)
  to service_role;
grant execute on function public.prepare_production_authority_epoch(jsonb)
  to service_role;
grant execute on function public.commit_production_authority_epoch(jsonb)
  to service_role;
grant execute on function public.abort_production_authority_epoch(jsonb)
  to service_role;
grant execute on function public.inspect_production_scoring_admission(jsonb)
  to service_role;
grant execute on function public.abort_production_precommit_release(jsonb)
  to service_role;

alter default privileges in schema production_control
  revoke all on functions from public, anon, authenticated;

-- The superseded direct-record body existed only while this additive
-- migration was assembled.  It is deliberately absent from the installed
-- schema; only challenge consume/reserve and hash-only receipt bind remain.
drop function production_control.disabled_direct_vercel_provider_attestation_record(
  uuid, text, text, jsonb
);

notify pgrst, 'reload schema';
commit;
