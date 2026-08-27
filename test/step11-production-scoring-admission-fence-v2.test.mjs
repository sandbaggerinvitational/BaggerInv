import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const baseMigrationUrl = new URL(
  "../supabase/production_migrations/202608260034_production_scoring_admission_fence_v2.sql",
  import.meta.url,
);
const inventoryV3MigrationUrl = new URL(
  "../supabase/production_migrations/202608260039_production_all_project_provider_inventory_v3.sql",
  import.meta.url,
);
const inventoryV4MigrationUrl = new URL(
  "../supabase/production_migrations/202608260040_production_provider_inventory_recertification_v4.sql",
  import.meta.url,
);
const baseSql = await readFile(baseMigrationUrl, "utf8");
const inventoryV3Sql = await readFile(inventoryV3MigrationUrl, "utf8");
const inventoryV4Sql = await readFile(inventoryV4MigrationUrl, "utf8");
const preV4Sql = [baseSql, inventoryV3Sql].join("\n");
const sql = [baseSql, inventoryV3Sql, inventoryV4Sql].join("\n");
const quiesceSource = await readFile(new URL(
  "../lib/production-google-writer-fence-quiesce.js",
  import.meta.url,
), "utf8");

function definitionFrom(source, qualifiedName) {
  const escapedName = qualifiedName.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
  const pattern = new RegExp(
    `create or replace function ${escapedName}\\s*\\(`,
    "gi",
  );
  // Later additive migrations deliberately replace selected functions. Static
  // assertions must inspect the effective latest definition, not the first
  // historical definition retained in the migration ledger.
  let start = -1;
  for (const match of source.matchAll(pattern)) start = match.index;
  assert.notEqual(start, -1, `Missing ${qualifiedName}`);
  const bodyStart = source.indexOf("as $$", start);
  assert.notEqual(bodyStart, -1, `Missing body for ${qualifiedName}`);
  const end = source.indexOf("\n$$;", bodyStart);
  assert.notEqual(end, -1, `Unterminated body for ${qualifiedName}`);
  return source.slice(start, end + 4);
}

function definition(qualifiedName) {
  return definitionFrom(sql, qualifiedName);
}

function definitionBeforeV4(qualifiedName) {
  return definitionFrom(preV4Sql, qualifiedName);
}

function assertOrdered(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.ok(firstIndex >= 0, `Missing ${first}`);
  assert.ok(secondIndex >= 0, `Missing ${second}`);
  assert.ok(firstIndex < secondIndex, message ?? `${first} must precede ${second}`);
}

test("v2 installation is inert and preserves the legacy OPEN dormant default", () => {
  const installation = sql.slice(
    0,
    sql.indexOf("create or replace function production_control.scoring_admission_lock_key"),
  );
  assert.match(sql, /admission_state text not null default 'OPEN'/i);
  assert.match(sql, /admission_protocol_enforced boolean not null default false/i);
  assert.match(
    sql,
    /admission_state = 'OPEN' and active_closure_id is null[\s\S]*admission_state in \('CLOSING', 'CLOSED'\)[\s\S]*active_closure_id is not null[\s\S]*external_fence_evidence_id is not null/i,
  );
  assert.doesNotMatch(installation, /^\s*(?:update|insert|delete)\s+/im);
  assert.doesNotMatch(
    sql,
    /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/,
  );
});

test("the schema retains every admission, ambiguity, closure, and provider-fence proof", () => {
  for (const token of [
    "admission_generation_id",
    "admission_revision",
    "admission_sequence",
    "lease_nonce_hash",
    "writer_intent",
    "operation_request_id",
    "request_payload_hash",
    "write_started_at",
    "provider_readback_fingerprint",
    "outcome_evidence_fingerprint",
    "resolution_fingerprint",
    "external_fence_evidence_id",
    "lease_high_watermark",
    "closure_boundary_fingerprint",
    "prior_source_fingerprint",
    "prior_legacy_closure_id",
  ]) assert.match(sql, new RegExp(`\\b${token}\\b`));
  for (const state of [
    "LEGACY_UNCLASSIFIED",
    "ADMITTED",
    "WRITE_STARTED",
    "CONFIRMED_WRITE",
    "PROVEN_NO_WRITE",
    "AMBIGUOUS",
    "PARTIAL_WRITE",
    "RESOLVED_WRITE",
    "RESOLVED_NO_WRITE",
  ]) assert.match(sql, new RegExp(`'${state}'`));
  assert.match(sql, /closure_kind in \('LEGACY_ADMISSION', 'SUPABASE_INGRESS'\)/);
  assert.match(sql, /expires_at <= captured_at \+ interval '30 minutes'/);
  assert.match(sql, /legacy_deployments_fenced and legacy_google_credentials_fenced[\s\S]*non_owner_manual_google_scoring_fenced[\s\S]*owner_override_operationally_frozen/);
});

test("shared and exclusive admission locks cover every authority-sensitive surface", () => {
  for (const name of [
    "public.begin_production_scoring_ingress_v2",
    "public.mark_production_scoring_ingress_write_started",
    "public.report_production_scoring_ingress_outcome",
    "public.resolve_production_scoring_ingress_ambiguity",
    "public.resolve_production_legacy_scoring_ingress",
    "public.complete_production_scoring_ingress",
    "production_control.assert_production_scoring_runtime",
    "public.inspect_production_scoring_admission",
  ]) assert.match(definition(name), /pg_advisory_xact_lock_shared/);

  for (const name of [
    "public.record_production_scoring_external_fence_evidence",
    "public.begin_production_google_writer_fence_rehearsal",
    "public.finish_production_google_writer_fence_rehearsal",
    "public.arm_production_google_ingress_lease_gate",
    "public.refresh_production_scoring_external_fence_evidence",
    "public.close_production_scoring_admission",
    "public.drain_production_scoring_admission",
    "public.finalize_production_scoring_admission",
    "public.prepare_production_authority_epoch",
    "public.commit_production_authority_epoch",
    "public.abort_production_authority_epoch",
    "public.abort_production_precommit_release",
    "public.record_production_google_writer_provider_fence_settlement",
    "public.finish_close_production_google_writer_provider_fence_install",
    "public.abort_production_google_writer_provider_fence_install",
  ]) assert.match(definition(name), /pg_advisory_xact_lock\s*\(/);
  assert.match(sql, /select 731102026032::bigint/);
});

test("provider-fence rehearsals have durable run ownership and terminal restoration proof", () => {
  assert.match(sql, /create table production_control\.google_writer_fence_rehearsals/);
  assert.match(sql, /status in \('RUNNING', 'RESTORED', 'FAILED'\)/);
  assert.match(sql, /rehearsal_request_id uuid not null unique/);
  assert.match(sql, /candidate_deployment_id text not null unique/);
  assert.match(sql, /begin_request_fingerprint text not null unique/);
  assert.match(sql, /protection_description_prefix text not null unique/);
  assert.match(sql, /STEP11_6_WRITER_FENCE_REHEARSAL:/);
  assert.match(sql, /baseline_canonical_value_fingerprint text not null/);
  assert.match(sql, /restored_canonical_value_fingerprint =\s*baseline_canonical_value_fingerprint/);
  for (const evidence of [
    "edge_quiesce_fingerprint",
    "origin_matrix_fingerprint",
    "owner_principal_fingerprint",
    "canonical_sheet_union_fingerprint",
  ]) assert.match(sql, new RegExp(`${evidence} text not null`));
  assert.match(sql, /owner_override_operationally_frozen boolean not null/);
  assert.match(sql, /owner_freeze_expires_at <= owner_acknowledged_at \+ interval '30 minutes'/);
  assert.match(sql, /status = 'RESTORED'[\s\S]*active_run_owned_protection_count = 0[\s\S]*dedicated_identity_can_edit[\s\S]*legacy_identity_denied[\s\S]*not google_value_writes_performed[\s\S]*not preview_resources_accessed/);
  assert.match(sql, /restored_provider_fingerprint = baseline_provider_fingerprint/);
  assert.match(sql, /restored_protected_ranges_fingerprint =[\s\S]*baseline_protected_ranges_fingerprint/);
});

test("rehearsal begin is exact-state, resource, revision, and lease fail-closed", () => {
  const begin = definition(
    "public.begin_production_google_writer_fence_rehearsal",
  );
  assert.match(begin, /assert_exact_cutover_resource_scope\(input, false\)/);
  assert.match(begin, /candidate_deployment_commit/);
  assert.match(begin, /rehearsal_request_id/);
  assert.match(begin, /expected_activation_revision/);
  assert.match(begin, /expected_authority_generation/);
  assert.match(begin, /expected_admission_generation/);
  assert.match(begin, /expected_admission_revision/);
  assert.match(begin, /baseline_canonical_value_fingerprint/);
  assert.match(begin, /edge_quiesce_fingerprint/);
  assert.match(begin, /origin_matrix_fingerprint/);
  assert.match(begin, /owner_principal_fingerprint/);
  assert.match(begin, /canonical_sheet_union_fingerprint/);
  assert.match(begin, /owner_override_operationally_frozen/);
  assert.match(begin, /quiesce\.purpose is distinct from 'REHEARSAL'/);
  assert.match(begin, /quiesce\.status is distinct from 'VERIFIED'/);
  assert.match(begin, /quiesce\.expires_at <= pg_catalog\.now\(\) \+ interval '5 minutes'/);
  assert.match(begin, /quiesce\.owner_freeze_expires_at <=[\s\S]*interval '5 minutes'/);
  assert.match(begin, /activation\.state is distinct from 'DORMANT'/);
  assert.match(begin, /activation\.current_authority is distinct from 'GOOGLE'/);
  assert.match(begin, /participant_identity_authority is distinct from 'PASSPORT'/);
  assert.match(begin, /gate\.state is distinct from 'PAUSED'/);
  assert.match(begin, /gate\.authority is distinct from 'GOOGLE'/);
  assert.match(begin, /gate\.admission_state is distinct from 'OPEN'/);
  assert.match(begin, /first_supabase_write_possible_at is not null/);
  assert.match(begin, /first_supabase_write_observed_at is not null/);
  assert.match(begin, /scoring_authority\.scoring_ingress_leases/);
  assert.match(begin, /value\.status = 'ACTIVE'/);
  assert.match(begin, /value\.resolution_state in \(/);
  assert.match(begin, /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_CANDIDATE_ALREADY_USED/);
  assert.match(begin, /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_IDEMPOTENCY_CONFLICT/);
});

test("rehearsal finish supports audited failure recovery but RESTORED is immutable", () => {
  const finish = definition(
    "public.finish_production_google_writer_fence_rehearsal",
  );
  assert.match(finish, /desired_status not in \('RESTORED', 'FAILED'\)/);
  assert.match(finish, /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_RESTORATION_PROOF_REQUIRED/);
  assert.match(finish, /restored_provider_fingerprint'[\s\S]*baseline_provider_fingerprint/);
  assert.match(finish, /restored_protected_ranges_fingerprint'[\s\S]*baseline_protected_ranges_fingerprint/);
  assert.match(finish, /restored_canonical_value_fingerprint'[\s\S]*baseline_canonical_value_fingerprint/);
  assert.match(finish, /desired_status = 'FAILED'[\s\S]*restoration_confirmed'[\s\S]*FAILED_RESTORATION_PROOF_REQUIRED/);
  assert.match(finish, /rehearsal\.status = 'FAILED' and desired_status = 'FAILED'/);
  assert.match(finish, /rehearsal\.status = 'RESTORED'/);
  assert.match(finish, /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_ALREADY_RESTORED/);
  assert.match(finish, /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_OWNERSHIP_MISMATCH/);
  assert.match(finish, /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_RESTORED/);
  assert.match(finish, /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_FAILED/);
});

test("unrestored rehearsals block stage and every authority-sensitive storage surface", () => {
  const stage = definition("public.stage_production_cutover_release");
  const guard = definition(
    "production_control.assert_no_unrestored_google_writer_fence_rehearsal",
  );
  assert.match(stage, /assert_no_unrestored_google_writer_fence_rehearsal/);
  assert.match(stage, /assert_certified_google_writer_fence_rehearsal/);
  assert.match(stage, /stage_production_cutover_release_pre_step11_6_rehearsal/);
  assert.match(guard, /status = 'RUNNING'[\s\S]*status = 'FAILED' and not value\.restoration_confirmed/);
  assert.match(guard, /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_UNRESTORED/);
  const certification = definition(
    "production_control.assert_certified_google_writer_fence_rehearsal",
  );
  assert.match(certification, /fence\.status = 'REHEARSAL_RESTORED'/);
  assert.match(certification, /verification\.acl_contract_version = 'DRIVE_ACL_V2'/);
  assert.match(certification, /install_dispatch\.outcome_status = 'TARGET_CONFIRMED'/);
  assert.match(certification, /restore_dispatch\.outcome_status = 'TARGET_CONFIRMED'/);
  assert.match(certification,
    /PRODUCTION_GOOGLE_WRITER_DRIVE_ACL_REHEARSAL_CERTIFICATION_REQUIRED/);
  for (const table of [
    "production_control.cutover_activation_state",
    "production_control.resource_scope",
    "production_control.worker_controls",
    "scoring_authority.ingress_gates",
    "scoring_authority.authority_epochs",
    "production_control.scoring_admission_closures",
    "production_control.scoring_external_fence_evidence",
    "scoring_authority.scoring_ingress_leases",
    "scoring_authority.score_mutations",
  ]) {
    assert.match(
      sql,
      new RegExp(
        `before insert or update or delete on ${table.replaceAll(".", "\\.")}`
          + `[\\s\\S]*?for each row execute function`,
      ),
    );
  }
});

test("legacy admission accepts only exact Google canonical intent with full identity binding", () => {
  const begin = definition("public.begin_production_scoring_ingress_v2");
  assert.match(begin, /expected_authority <> 'GOOGLE'/);
  assert.match(begin, /input->>'writer_intent' is distinct from 'CANONICAL_LEGACY'/);
  assert.match(begin, /gate\.admission_state <> 'OPEN'/);
  assert.match(begin, /gate\.active_closure_id is not null/);
  assert.match(begin, /production_control\.scoring_admission_begin_payload_hash\(input\)/);
  assert.match(begin, /value\.operation_request_id = operation_request/);
  assert.match(begin, /PRODUCTION_SCORING_INGRESS_V2_IDEMPOTENCY_CONFLICT/);
  assert.match(begin, /lease_nonce_rotated/);
  assert.match(begin, /extensions\.digest\(nonce_value, 'sha256'\)/);
  assert.doesNotMatch(begin, /'lease_nonce',\s*lease\./);
  for (const boundary of [
    "expected_activation_revision",
    "expected_authority_generation",
    "expected_admission_generation",
    "expected_admission_revision",
    "deployment_id",
    "deployment_commit",
  ]) assert.match(begin, new RegExp(boundary));
  const stableHash = definition(
    "production_control.scoring_admission_begin_payload_hash",
  );
  assert.match(stableHash, /input - array\['lease_nonce', 'request_fingerprint'\]/);
  assert.match(sql, /unique index production_scoring_admission_v2_operation_request_idx[\s\S]*tournament_id, operation_request_id/);
});

test("v3 pre-dispatch expiry is safe while dispatched and historical ambiguity stays evidence-bound", () => {
  const mark = definition("public.mark_production_scoring_ingress_write_started");
  const markV3 = definition(
    "public.mark_production_scoring_ingress_write_started_v3",
  );
  const report = definition("public.report_production_scoring_ingress_outcome");
  const drain = definition("public.drain_production_scoring_admission");
  const resolve = definition(
    "public.resolve_production_scoring_ingress_ambiguity",
  );
  const legacy = definition("public.resolve_production_legacy_scoring_ingress");
  assert.match(mark, /provider_credential_class = 'LEGACY_PROVIDER_FENCEABLE'[\s\S]*LEASE_EXPIRED_BEFORE_PROVIDER_DISPATCH/);
  assert.match(mark, /last_error_code = 'LEASE_EXPIRED_BEFORE_WRITE_START'/);
  assert.match(mark, /set resolution_state = 'AMBIGUOUS'/);
  assert.match(markV3, /lease\.resolution_state not in \('WRITE_STARTED', 'PROVEN_NO_WRITE'\)/);
  assert.match(markV3, /provider_dispatch_must_begin_before_expires_at', true/);
  assert.match(markV3, /response_value := public\.mark_production_scoring_ingress_write_started\(input\)/);
  assert.match(markV3, /assert_production_scoring_lease_nonce\([\s\S]*operation_request_id is distinct from/);
  assert.match(markV3, /remaining_dispatch_ms := greatest\([\s\S]*clock_timestamp\(\)/);
  assert.match(markV3, /'remaining_dispatch_ms', remaining_dispatch_ms/);
  assert.match(drain, /set resolution_state = 'PROVEN_NO_WRITE'[\s\S]*resolution_state = 'ADMITTED'[\s\S]*provider_credential_class = 'LEGACY_PROVIDER_FENCEABLE'[\s\S]*write_started_at is null[\s\S]*expires_at <= pg_catalog\.now\(\)/);
  assert.match(drain, /set resolution_state = 'AMBIGUOUS'/);
  assert.match(resolve, /lease\.write_started_at is not null[\s\S]*closure\.status is distinct from 'CLOSING'/);
  assert.match(resolve, /provider_before_fingerprint[\s\S]*provider_readback_fingerprint/);
  assert.match(resolve, /activation\.active_transition_epoch_id is not null/);
  assert.match(report, /provider_after_fingerprint'[\s\S]*is distinct from input->>'provider_readback_fingerprint'/);
  assert.match(report, /scoring_lease_outcome_evidence_hash/);
  assert.match(legacy, /scoring_legacy_resolution_evidence_hash/);
  assert.match(legacy, /lease\.protocol_version is distinct from 'LEGACY_V1'/);
  assert.match(sql, /Every unclassified LEGACY_V1 row blocks closure regardless of age/i);
});

test("authority transitions never make legacy Google admission OPEN under Supabase", () => {
  const close = definition("public.close_production_scoring_admission");
  const commit = definition("public.commit_production_authority_epoch");
  const abort = definition("public.abort_production_authority_epoch");
  const reopen = definition("public.reopen_production_scoring_admission");
  const abortInstall = definition(
    "public.abort_production_google_writer_provider_fence_install",
  );
  const runtime = definition("production_control.assert_production_scoring_runtime");
  assert.match(close, /requested_authority = 'SUPABASE'[\s\S]*gate\.admission_state <> 'CLOSED'/);
  assert.match(commit, /set state = 'OPEN', authority = 'SUPABASE',[\s\S]*admission_state = 'CLOSED'/);
  assert.match(commit, /'LEGACY_ADMISSION', null, '2026', 'GOOGLE', epoch\.epoch_id/);
  assert.match(abort, /set state = 'OPEN', authority = 'SUPABASE',[\s\S]*admission_state = 'CLOSED'/);
  assert.match(reopen,
    /PRODUCTION_SCORING_ADMISSION_REOPEN_REQUIRES_ATOMIC_ACL_RESTORE/);
  assert.match(abortInstall, /activation\.current_authority is distinct from 'GOOGLE'/);
  assert.match(abortInstall,
    /fence\.lifecycle_mode = 'REHEARSAL'[\s\S]*activation\.state is distinct from 'DORMANT'/);
  assert.match(abortInstall,
    /fence\.lifecycle_mode = 'CUTOVER'[\s\S]*activation\.state in \('DORMANT', 'ROLLED_BACK'\)/);
  assert.match(runtime, /gate\.admission_state is distinct from 'CLOSED'/);
  assert.match(runtime, /normal_supabase_runtime :=[\s\S]*gate\.state = 'OPEN'[\s\S]*active_closure\.closure_kind = 'LEGACY_ADMISSION'/);
  assert.match(runtime, /rollback_worker_drain :=[\s\S]*required_worker_name in \([\s\S]*'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'[\s\S]*gate\.state = 'PAUSED'[\s\S]*active_closure\.closure_kind = 'SUPABASE_INGRESS'[\s\S]*active_closure\.status = 'CLOSING'/);
  assert.match(runtime, /legacy_closure\.status = 'CONSUMED'[\s\S]*legacy_closure\.consumed_epoch_id = activation\.authority_generation_id/);
  assert.match(runtime, /not \(normal_supabase_runtime or rollback_worker_drain\)/);
  assert.match(runtime, /required_worker_name not in \([\s\S]*'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'/);
});

test("closure and epoch boundaries require exact fresh evidence and stable reconciliation", () => {
  const close = definition("public.close_production_scoring_admission");
  const finalize = definition("public.finalize_production_scoring_admission");
  const prepare = definition("public.prepare_production_authority_epoch");
  const commit = definition("public.commit_production_authority_epoch");
  for (const source of [finalize, prepare, commit]) {
    assert.match(source, /assert_current_external_scoring_fence/);
    assert.match(source, /scoring_admission_unresolved_count/);
    assert.match(source, /scoring_admission_legacy_blocker_count/);
  }
  assert.match(finalize, /input->'supabase_match_revisions' is distinct from current_revisions/);
  assert.match(finalize, /input->'google_checkpoints' is distinct from current_checkpoints/);
  assert.match(finalize, /lease\.admission_sequence > closure\.lease_high_watermark/);
  assert.match(prepare, /closure\.closed_admission_revision[\s\S]*is distinct from gate\.admission_revision/);
  assert.match(commit, /epoch\.closure_boundary_fingerprint[\s\S]*is distinct from closure\.lease_set_fingerprint/);
  for (const source of [close, prepare, commit]) {
    assert.match(source, /quiesce_evidence_id/);
    assert.match(source, /provider_fence_id/);
    assert.match(source, /provider_fence_verification_id/);
    assert.match(source, /active_vercel_quiesce_evidence_id/);
  }
});

test("structured quiesce and durable provider removal are exact and recoverable", () => {
  assert.match(sql, /origin_inventory_count integer not null check \(origin_inventory_count = 1140\)/);
  assert.match(sql, /533178a28a5458c5f2f727b77af3024de4cc0402c49e90dcd763b950d26fb4c6/);
  const probe = definition(
    "production_control.assert_exact_vercel_probe_records",
  );
  assert.match(probe, /expected_origin_count integer :=[\s\S]*jsonb_array_length\(target_origin_inventory\) \+ 4/);
  assert.doesNotMatch(probe, /jsonb_build_array\('https:\/\/baggerinv\.com'/);
  assert.match(
    definitionBeforeV4("production_control.assert_exact_vercel_probe_records"),
    /jsonb_array_length\(target_origin_inventory\) \+ 5/,
  );
  assert.match(
    probe,
    /expected_logical_probe_count integer :=[\s\S]*expected_origin_count \* expected_probe_vector_count/,
  );
  assert.match(probe, /expected_probe_vector_count <> 11/);
  assert.match(probe, /IMMUTABLE_PROJECT_PREVIEW/);
  assert.doesNotMatch(probe, /CUTOVER_PRODUCTION_CANDIDATE/);
  assert.match(probe, /pg_catalog\.jsonb_array_length\(value->9\) <> 11/);
  assert.match(probe, /vectorProofFingerprints|value->9/);
  assert.match(probe, /coalesce\(value->>8, ''\) <> '2047'/);
  assert.match(probe, /normalized_scope is distinct from expected_scope/);
  assert.match(probe, /pg_catalog\.count\(distinct proof #>> '\{\}'\)/);
  const finalizeQuiesce = definitionBeforeV4(
    "public.finalize_production_vercel_writer_quiesce_evidence",
  );
  assert.match(finalizeQuiesce, /\(probe->>10\)::timestamptz < evidence\.drain_started_at/);
  assert.match(finalizeQuiesce, /first_origin->9[\s\S]*intersect[\s\S]*second_origin->9/);

  const verification = definition(
    "production_control.insert_google_writer_provider_fence_verification",
  );
  assert.match(verification, /pg_catalog\.left\(input->>'actor_id', 160\), 'DRIVE_ACL_V2'/);
  assert.match(verification, /install_dispatch\.outcome_status is distinct from 'TARGET_CONFIRMED'/);
  assert.match(verification, /install_dispatch\.transition_proof->>'currentRole' is distinct from[\s\S]*'reader'/);
  assert.match(verification, /install_dispatch\.transition_proof->'currentLegacyCanEdit'[\s\S]*is distinct from 'false'::jsonb/);
  assert.match(verification, /install_dispatch\.transition_proof->'currentLegacyCanShare'[\s\S]*is distinct from 'false'::jsonb/);
  assert.match(verification, /where value\.evidence_id = fence\.quiesce_evidence_id/);
  assert.match(verification, /verification_expiry := least\([\s\S]*interval '2100 seconds'[\s\S]*quiesce\.owner_freeze_expires_at/);
  const currentFence = definition(
    "production_control.assert_current_google_writer_provider_fence",
  );
  assert.match(currentFence, /verification\.recovery_only/);

  const authorize = definition(
    "public.authorize_production_google_writer_provider_fence_removal",
  );
  const finish = definition(
    "public.finish_production_google_writer_provider_fence_removal",
  );
  const safety = definition(
    "production_control.assert_google_writer_provider_fence_removal_safe",
  );
  for (const retired of [authorize, finish]) {
    assert.match(retired, /PRODUCTION_GOOGLE_WRITER_PROTECTED_RANGE_REMOVAL_RETIRED/);
  }
  assert.match(inventoryV4Sql,
    /revoke all on function\s+public\.authorize_production_google_writer_provider_fence_removal\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(inventoryV4Sql,
    /revoke all on function\s+public\.finish_production_google_writer_provider_fence_removal\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(safety,
    /revoke all on function|PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_NOT_SAFE/);
});

test("signed Vercel attestations are fresh, anti-replay, and bind dynamic probe scope", () => {
  assert.match(sql, /create table production_control\.vercel_provider_attestation_challenges/);
  assert.match(sql, /create table production_control\.vercel_provider_attestations/);
  for (const token of [
    "attestation_id", "attestation_fingerprint", "signer_key_fingerprint",
    "signer_key_version", "challenge_id", "challenge_request_fingerprint",
    "operation_request_id", "evidence_request_id", "request_fingerprint",
    "receipt_request_fingerprint", "signature_verified", "vercel_project_id",
    "vercel_team_id", "candidate_deployment_id",
    "candidate_deployment_commit", "candidate_deployment_target",
    "routing_rule_id", "routing_rule_config_version", "routing_rule_etag",
    "routing_rule_fingerprint", "routing_rule_pending_draft_change_count",
    "routing_rule_all_method_fence_required_host_count",
    "routing_rule_all_method_fence_required_hosts_fingerprint",
    "routing_rule_all_method_fence_required_path_count",
    "routing_rule_all_method_fence_required_paths_fingerprint",
    "live_origin_inventory_count",
    "live_origin_inventory_fingerprint",
    "redacted_environment_scope_fingerprint",
    "credential_confinement_evidence_schema",
    "credential_confinement_record_count",
    "credential_confinement_records_fingerprint",
    "credential_confinement_evidence_fingerprint", "provider_observed_at",
  ]) assert.match(sql, new RegExp(`\\b${token}\\b`));
  assert.match(sql, /unique \(evidence_id, stage\)/);
  assert.match(sql, /unique \(evidence_request_id, stage\)/);
  assert.match(sql, /signer_key_version = 'STEP11_6_VERCEL_ATTESTER_V1'/);

  const liveInventory = definition(
    "production_control.assert_exact_vercel_live_inventory",
  );
  const retainedInventory = definition(
    "production_control.assert_exact_vercel_origin_inventory",
  );
  assert.match(
    inventoryV3Sql,
    /provider_inventory_schema[\s\S]*step11-6-production-origin-inventory-v3/,
  );
  assert.match(
    inventoryV3Sql,
    /6488da5c86e50bd0c524a94a8c8f97c1aeb8576393fc14d68a7bd76ebe338692/,
  );
  assert.match(retainedInventory, /record_count <> 1292/);
  assert.match(
    retainedInventory,
    /9d25299c72424a2b5c3c613649b7f07760fda64c0b0bb4823edaf2cd91622774/,
  );
  assert.match(
    retainedInventory,
    /dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm[\s\S]*0671bb3b84ac5846218ea60838fe4e1cc07de97f/,
  );
  assert.match(
    retainedInventory,
    /value->1 <> 'null'::jsonb[\s\S]*'\^\[0-9a-f\]\{40\}\$'/,
  );
  assert.match(liveInventory, /select value[\s\S]*normalized_retained[\s\S]*except[\s\S]*normalized_live/);
  assert.match(liveInventory, /retained_candidate_count not in \(0, 1\)/);
  assert.match(liveInventory, /live_candidate_count <> 1/);
  assert.doesNotMatch(liveInventory, /CUTOVER_PRODUCTION_CANDIDATE/);
  assert.match(liveInventory, /live\.record->>1 = pg_catalog\.lower\(candidate_deployment_commit\)/);
  assert.match(
    liveInventory,
    /candidate_deployment_target is distinct from 'PREVIEW'/,
  );
  assert.match(
    liveInventory,
    /dynamic_candidate_scope := 'PROJECT_PREVIEW'/,
  );
  assert.match(liveInventory, /retained\.record = live\.record/);
  assert.match(liveInventory, /count\(distinct value->>0\)/);
  assert.match(liveInventory, /count\(distinct value->>2\)/);
  assert.match(
    liveInventory,
    /expected_count := pg_catalog\.jsonb_array_length\(normalized_retained\)[\s\S]*case when retained_candidate_count = 1 then 0 else 1 end/,
  );

  const issue = definitionBeforeV4(
    "public.issue_production_vercel_provider_attestation_challenge",
  );
  assert.match(issue, /challenge_identifier uuid := extensions\.gen_random_uuid\(\)/);
  assert.match(issue, /expiry_time timestamptz := issued_time \+ interval '120 seconds'/);
  assert.match(issue, /evidence_request_identifier/);
  assert.match(issue, /begin_challenge\.operation_request_id = operation_request_identifier/);
  assert.match(issue, /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_FINALIZE_SCOPE_DRIFT/);

  const consume = definitionBeforeV4(
    "public.consume_production_vercel_provider_attestation_challenge",
  );
  assert.match(consume, /challenge\.status = 'CONSUMED'/);
  assert.match(consume, /consume_payload_hash is distinct from payload_hash/);
  assert.match(consume, /provider_claim->>'signature_verified' is distinct from 'true'/);
  assert.match(consume, /challenge\.challenge_request_fingerprint is distinct from/);
  assert.match(consume, /observed_at_value < reserved_at_value - interval '120 seconds'/);
  assert.match(consume, /assert_exact_vercel_live_inventory/);
  assert.match(consume, /begin_attestation\.routing_rule_fingerprint/);
  assert.match(consume, /begin_attestation\.live_origin_inventory is distinct from/);
  assert.match(consume, /credential_confinement_evidence_schema/);
  assert.match(consume, /assert_current_provider_inventory_v3/);
  const providerInventory = definition(
    "production_control.assert_current_provider_inventory_v3",
  );
  assert.match(providerInventory, /assert_current_provider_inventory_v4/);
  assert.doesNotMatch(providerInventory, /step11-6-production-origin-inventory-v3/);
  const providerInventoryV4 = definition(
    "production_control.assert_current_provider_inventory_v4",
  );
  assert.match(
    providerInventoryV4,
    /7549a25c6cbdcec38ea0f331c8aff344cfee837a916ac8871fb5a4956f67838e/,
  );
  assert.match(
    providerInventoryV4,
    /6f468334a508553cdb9230c14ad85969c89169df6a2ec88011fb2e7e30c9656a/,
  );
  assert.match(consume, /status = 'CONSUMED'/);
  assert.match(consume, /'RESERVED'/);

  const quiesceBegin = definitionBeforeV4(
    "public.begin_production_vercel_writer_quiesce_evidence",
  );
  const quiesceFinalize = definitionBeforeV4(
    "public.finalize_production_vercel_writer_quiesce_evidence",
  );
  for (const contract of [quiesceBegin, quiesceFinalize]) {
    assert.match(contract, /credential_confinement_evidence_schema/);
    assert.match(contract, /credential_confinement_record_count/);
    assert.match(contract, /credential_confinement_records_fingerprint/);
    assert.match(contract, /credential_confinement_evidence_fingerprint/);
  }

  const candidateCapabilities = [
    "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
    "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
    "PRODUCTION_WORKBOOK_SELECTOR",
  ];
  for (const capability of candidateCapabilities) {
    assert.match(sql, new RegExp(capability));
    assert.match(quiesceSource, new RegExp(capability));
  }
  assert.match(sql, /item->>0 = target_candidate_deployment_id[\s\S]*item->>2 = target_candidate_immutable_origin/);

  const recorder = definition(
    "production_control.record_verified_vercel_provider_attestation",
  );
  assert.match(recorder, /input \?& array\['attestation_id', 'attestation_fingerprint'\]/);
  assert.match(recorder, /reserved\.status is distinct from 'RESERVED'/);
  assert.match(recorder, /reserved\.binding_expires_at < bound_at_value/);
  assert.match(recorder, /challenge\.status is distinct from 'CONSUMED'/);
  assert.match(recorder, /reserved\.live_origin_inventory is distinct from/);
  assert.match(recorder, /begin_attestation\.routing_rule_fingerprint/);
  assert.match(recorder, /receipt_request_fingerprint = target_request_fingerprint/);
  assert.match(recorder, /set status = 'BOUND'/);
  assert.match(sql, /drop function production_control\.disabled_direct_vercel_provider_attestation_record\(/);

  const begin = definitionBeforeV4(
    "public.begin_production_vercel_writer_quiesce_evidence",
  );
  const finalize = definitionBeforeV4(
    "public.finalize_production_vercel_writer_quiesce_evidence",
  );
  assert.match(begin, /purpose_value = 'REHEARSAL'[\s\S]*candidate_deployment_target' <> 'PREVIEW'/);
  assert.match(begin, /purpose_value = 'CUTOVER'[\s\S]*candidate_deployment_target' <> 'PRODUCTION'/);
  assert.match(begin, /record_verified_vercel_provider_attestation\([\s\S]*'BEGIN'/);
  assert.match(finalize, /record_verified_vercel_provider_attestation\([\s\S]*'FINALIZE'/);
  assert.match(finalize, /evidence\.live_origin_inventory/);
  assert.match(finalize, /beginProviderAttestationFingerprint/);
  assert.match(finalize, /finalizeProviderAttestationFingerprint/);
});

test("expired provider-fence proof has an exclusive immutable-scope refresh path", () => {
  const refresh = definition(
    "public.refresh_production_scoring_external_fence_evidence",
  );
  assert.match(refresh, /pg_advisory_xact_lock\s*\(/);
  assert.match(refresh, /gate\.state is distinct from 'PAUSED'/);
  assert.match(refresh, /gate\.admission_state not in \('CLOSING', 'CLOSED'\)/);
  assert.match(refresh, /provider_evidence_fingerprint[\s\S]*SCOPE_DRIFT/);
  assert.match(refresh, /google_credential_scope_fingerprint[\s\S]*SCOPE_DRIFT/);
  assert.match(refresh, /writer_coverage_fingerprint[\s\S]*SCOPE_DRIFT/);
  assert.match(refresh, /set admission_revision = next_admission_revision/);
  assert.match(refresh, /set external_fence_evidence_id = replacement\.evidence_id/);
  assert.match(refresh, /set external_fence_evidence_id = replacement\.evidence_id,[\s\S]*closed_admission_revision = next_admission_revision/);
  assert.match(refresh, /REFRESH_SCORING_EXTERNAL_FENCE_EVIDENCE/);
});

test("receipt-backed exclusive operations recheck idempotency after locking", () => {
  for (const [name, operation] of [
    ["public.arm_production_google_ingress_lease_gate", "ARM_GOOGLE_LEASE_GATE"],
    ["public.close_production_scoring_admission", "CLOSE_SCORING_ADMISSION"],
    ["public.drain_production_scoring_admission", "DRAIN_SCORING_ADMISSION"],
    ["public.finalize_production_scoring_admission", "FINALIZE_SCORING_ADMISSION"],
    ["public.prepare_production_authority_epoch", "PREPARE_AUTHORITY_EPOCH"],
    ["public.commit_production_authority_epoch", "COMMIT_AUTHORITY_EPOCH"],
    ["public.abort_production_authority_epoch", "ABORT_AUTHORITY_EPOCH"],
  ]) {
    const source = definition(name);
    const lock = source.indexOf("pg_advisory_xact_lock(");
    const firstLookup = source.indexOf(`lookup_cutover_receipt(\n    '${operation}'`, lock);
    assert.ok(lock >= 0 && firstLookup > lock, `${name} must recheck after its lock`);
  }
  assert.match(
    definition("public.reopen_production_scoring_admission"),
    /PRODUCTION_SCORING_ADMISSION_REOPEN_REQUIRES_ATOMIC_ACL_RESTORE/,
  );
});

test("all new callable RPCs are service-role only and all definitions use fixed search paths", () => {
  const definitions = sql.split(/create or replace function /i).slice(1);
  assert.ok(definitions.length >= 25);
  for (const source of definitions) {
    assert.match(source, /security definer/i);
    assert.match(source, /set search_path = pg_catalog(?:\n|$)/i);
  }
  for (const rpc of [
    "record_production_scoring_external_fence_evidence",
    "begin_production_vercel_writer_quiesce_evidence",
    "finalize_production_vercel_writer_quiesce_evidence",
    "inspect_production_vercel_writer_quiesce_evidence",
    "begin_production_google_writer_provider_fence_install",
    "finish_production_google_writer_provider_fence_install",
    "inspect_production_google_writer_provider_fence",
    "refresh_production_google_writer_provider_fence",
    "authorize_production_google_writer_provider_fence_removal",
    "finish_production_google_writer_provider_fence_removal",
    "begin_production_google_writer_fence_rehearsal",
    "finish_production_google_writer_fence_rehearsal",
    "inspect_production_google_writer_fence_rehearsal",
    "stage_production_cutover_release",
    "refresh_production_scoring_external_fence_evidence",
    "begin_production_scoring_ingress_v2",
    "mark_production_scoring_ingress_write_started",
    "report_production_scoring_ingress_outcome",
    "close_production_scoring_admission",
    "drain_production_scoring_admission",
    "finalize_production_scoring_admission",
    "reopen_production_scoring_admission",
    "prepare_production_authority_epoch",
    "commit_production_authority_epoch",
    "abort_production_authority_epoch",
    "inspect_production_scoring_admission",
  ]) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${rpc}\\(jsonb\\)\\s+to service_role`, "i"));
  }
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:public|anon|authenticated)/i);
  assert.match(sql, /enable row level security/g);
});

test("migration 040 is a dormant exact v4/v4 recertification with historical receipt compatibility", () => {
  assert.match(
    inventoryV4Sql,
    /activation\.state is distinct from 'DORMANT'[\s\S]*activation\.current_authority is distinct from 'GOOGLE'/,
  );
  assert.match(
    inventoryV4Sql,
    /participant_identity_authority is distinct from 'PASSPORT'/,
  );
  assert.match(
    inventoryV4Sql,
    /gate\.admission_state is distinct from 'OPEN'[\s\S]*gate\.admission_protocol_enforced/,
  );
  for (const activeSurface of [
    "vercel_provider_attestation_challenges",
    "vercel_provider_attestations",
    "vercel_writer_quiesce_evidence",
    "google_writer_provider_fences",
    "google_writer_fence_rehearsals",
    "scoring_external_fence_evidence",
    "scoring_ingress_leases",
    "score_mutations",
    "google_outbox_events",
    "scorecard_archive_jobs",
  ]) assert.match(inventoryV4Sql, new RegExp(`\\b${activeSurface}\\b`));
  assert.match(
    inventoryV4Sql,
    /PRODUCTION_PROVIDER_INVENTORY_V4_MIGRATION_STATE_INVALID/,
  );

  for (const binding of [
    "step11-6-production-google-credential-confinement-v1",
    "533178a28a5458c5f2f727b77af3024de4cc0402c49e90dcd763b950d26fb4c6",
    "step11-6-production-origin-inventory-v3",
    "d238c5eeefef4606e0a05c2d0dbcee1a2b29cd07a2dd480435c0e75a0c3a91a6",
    "6488da5c86e50bd0c524a94a8c8f97c1aeb8576393fc14d68a7bd76ebe338692",
    "step11-6-production-origin-inventory-v4",
    "9d25299c72424a2b5c3c613649b7f07760fda64c0b0bb4823edaf2cd91622774",
    "abd27e4e2747c17053f6debf71ec0f523d39fea8e2383d4911f9dc4b87959cbe",
    "step11-6-production-google-credential-confinement-v3",
    "7549a25c6cbdcec38ea0f331c8aff344cfee837a916ac8871fb5a4956f67838e",
    "0c392e1b369d43c5c117716e6b00d3050ab1c8a9fc79b22df43050d0a7c7fb11",
    "step11-6-production-google-credential-confinement-v4",
    "6f468334a508553cdb9230c14ad85969c89169df6a2ec88011fb2e7e30c9656a",
    "step11-6-vercel-environment-resource-review-v1",
    "b7d8cdd805ecbaa05b39b71aec9d904b3df8a0077a38e2adc8762312d3cf4d8a",
    "eae8a72c03308c75d8eea8b330e798b316842a6a3f05791c7acec1f0f1a2dd54",
    "a5507591c0c3577e9638a8193706b689a7e6da902e6f6216b829df1d4be4254b",
    "62f14a6635bc9ec16ce681e04b17bbd0f39e9ff55a858bbcb75f4aa75bc3bc4d",
    "0423e6a742d6527b10afc071856dbc6c5b1cca5e1ffb09a5d2523d0f04b31c0c",
    "fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa",
  ]) assert.match(inventoryV4Sql, new RegExp(binding));
  assert.match(inventoryV4Sql, /live_origin_inventory_count in \(1292, 1293\)/);
  assert.match(inventoryV4Sql, /retained_provider_inventory_count = 1292/);
  assert.match(inventoryV4Sql, /credential_confinement_record_count = 1292/);
  assert.match(inventoryV4Sql, /routing_rule_all_method_fence_required_host_count = 8/);
  assert.match(inventoryV4Sql, /routing_rule_all_method_fence_required_host_count = 9/);
  assert.match(inventoryV4Sql, /routing_rule_all_method_fence_required_path_count = 1/);
  assert.match(inventoryV4Sql, /121 provider[\s\S]*zero hidden Production[\s\S]*12 reviewed records/);
  assert.match(inventoryV4Sql, /credential-v4 evidence fingerprint transitively binds/);
  assert.ok((inventoryV4Sql.match(
    /step11-6-production-google-credential-confinement-v3/g,
  ) ?? []).length >= 2, "both table constraints must preserve credential-v3 rows");
  assert.ok((inventoryV4Sql.match(
    /step11-6-production-google-credential-confinement-v4/g,
  ) ?? []).length >= 3, "both table constraints and active validator require v4");

  for (const tuple of [
    ["dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
      "561a61946be3536c7e32b46be53e4683cbb45579", "PRODUCTION_TARGET",
      "0383e746abde16275626a8bcd41a38853eb9fe6e2cb036ef7658d21c23d9f5e8"],
    ["dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
      "be5531faca009e26617496e47831f365a1b4997b", "PROJECT_PREVIEW",
      "0c8b213bcad5397731982762bf178cc961254b79a6be5a3b75e71e547ef9dc71"],
    ["dpl_2oK3GmMa8f93wqjHNp1Gp2Y6Paox",
      "a0b79cdef3a34d640e9411035792bd1e91989566", "PROJECT_PREVIEW",
      "acb7fa3de11c8e6e5704c41a22b1693b42428b7b70c1d9ed73763ea6330ddb8e"],
    ["dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm",
      "0671bb3b84ac5846218ea60838fe4e1cc07de97f", "PROJECT_PREVIEW",
      "23d503936f3f41ede80f5e03d7b5df423d43d120d88fbf5c2aeb781866628913"],
  ]) {
    for (const value of tuple) assert.match(inventoryV4Sql, new RegExp(value));
  }
  assert.match(inventoryV4Sql, /record_count <> 1292/);
  assert.match(inventoryV4Sql, /value->>3 = 'PRODUCTION_TARGET'\) <> 458/);
  assert.match(inventoryV4Sql, /value->>3 = 'PROJECT_PREVIEW'\) <> 834/);
  assert.match(
    inventoryV4Sql,
    /expected_count :=[\s\S]*case when retained_candidate_count = 1 then 0 else 1 end/,
  );
  assert.match(
    inventoryV4Sql,
    /dynamic_candidate_scope := 'PROJECT_PREVIEW'/,
  );
  assert.match(inventoryV4Sql, /count\(distinct value->>0\)/);
  assert.match(inventoryV4Sql, /count\(distinct value->>2\)/);

  const activeCompatibilityWrapper = definition(
    "production_control.assert_current_provider_inventory_v3",
  );
  assert.match(
    activeCompatibilityWrapper,
    /perform production_control\.assert_current_provider_inventory_v4/,
  );
  assert.doesNotMatch(
    activeCompatibilityWrapper,
    /step11-6-production-origin-inventory-v3/,
  );
  const activeConsume = definitionBeforeV4(
    "public.consume_production_vercel_provider_attestation_challenge",
  );
  const activeRecorder = definition(
    "production_control.record_verified_vercel_provider_attestation",
  );
  assert.match(
    activeConsume,
    /redacted_environment_scope_fingerprint'[\s\S]*!~ '\^\[0-9a-f\]\{64\}\$'/,
  );
  assert.match(
    activeRecorder,
    /begin_attestation\.redacted_environment_scope_fingerprint[\s\S]*reserved\.redacted_environment_scope_fingerprint/,
  );
  for (const functionName of [
    "production_control.assert_current_provider_inventory_v4",
    "production_control.assert_current_provider_inventory_v3",
    "production_control.assert_exact_vercel_origin_inventory",
    "production_control.assert_exact_vercel_live_inventory",
  ]) {
    const functionSql = definition(functionName);
    assert.match(functionSql, /security definer/);
    assert.match(functionSql, /set search_path = pg_catalog/);
  }
  assert.match(
    inventoryV4Sql,
    /revoke all on function production_control\.assert_current_provider_inventory_v4\([\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    inventoryV4Sql,
    /grant execute on function production_control\.assert_exact_vercel_origin_inventory\([\s\S]*to service_role/,
  );
  assert.match(
    inventoryV4Sql,
    /grant execute on function production_control\.assert_exact_vercel_live_inventory\([\s\S]*to service_role/,
  );
  assertOrdered(
    inventoryV4Sql,
    "PRODUCTION_PROVIDER_INVENTORY_V4_MIGRATION_STATE_INVALID",
    "add column provider_credential_class",
    "the dormant fail-closed preflight must run before lifecycle DDL",
  );
});

test("migration 040 exposes only explicit v3 admission and dispatch capabilities", () => {
  const beginV3 = definition("public.begin_production_scoring_ingress_v3");
  const markV3 = definition(
    "public.mark_production_scoring_ingress_write_started_v3",
  );
  assert.match(beginV3, /response_value := public\.begin_production_scoring_ingress_v2\(input\)/);
  assert.match(beginV3, /'contract_version', 'ADMISSION_V3'/);
  assert.match(beginV3, /'expires_at', lease\.expires_at/);
  assert.match(beginV3, /assert_production_scoring_lease_nonce\(/);
  assert.match(beginV3, /'lease_nonce', pg_catalog\.lower\(input->>'lease_nonce'\)/);
  assert.match(beginV3, /'operation_request_id', lease\.operation_request_id/);
  assert.match(beginV3, /remaining_dispatch_ms := greatest\([\s\S]*clock_timestamp\(\)/);
  assert.match(beginV3, /'remaining_dispatch_ms', remaining_dispatch_ms/);
  assert.match(beginV3, /lease\.resolution_state = 'ADMITTED'[\s\S]*remaining_dispatch_ms > 0/);
  assert.match(beginV3, /'provider_credential_class', lease\.provider_credential_class/);
  assert.match(markV3, /security definer[\s\S]*set search_path = pg_catalog/);
  assert.match(markV3, /PRODUCTION_SCORING_WRITE_STARTED_V3_RECEIPT_MISMATCH/);
  assert.match(markV3, /'write_started_at', lease\.write_started_at/);

  assert.match(inventoryV4Sql, /revoke all on function public\.begin_production_scoring_ingress_v2\(jsonb\)\s+from public, anon, authenticated, service_role/i);
  assert.match(inventoryV4Sql, /revoke all on function public\.begin_production_scoring_ingress\(jsonb\)\s+from public, anon, authenticated, service_role/i);
  assert.match(inventoryV4Sql, /revoke all on function\s+public\.mark_production_scoring_ingress_write_started\(jsonb\)\s+from public, anon, authenticated, service_role/i);
  assert.match(inventoryV4Sql, /grant execute on function public\.begin_production_scoring_ingress_v3\(jsonb\)\s+to service_role/i);
  assert.match(inventoryV4Sql, /grant execute on function\s+public\.mark_production_scoring_ingress_write_started_v3\(jsonb\)\s+to service_role/i);
});

test("migration 040 durably audits the exact non-canonical-host WAF predicate", () => {
  assert.match(
    inventoryV4Sql,
    /create table production_control\.vercel_routing_rule_audit_bindings/,
  );
  assert.doesNotMatch(
    inventoryV4Sql,
    /alter table production_control\.vercel_(?:writer_quiesce_evidence|provider_attestation_challenges|provider_attestations)[\s\S]{0,120}add column routing_rule_/,
  );
  for (const subject of [
    "challenge_id",
    "attestation_id",
    "quiesce_evidence_id",
  ]) assert.match(
    inventoryV4Sql,
    new RegExp(`${subject} uuid unique references`),
  );
  assert.match(
    inventoryV4Sql,
    /routing_rule_hostname_operator text not null check \([\s\S]*= 'DOES_NOT_EQUAL'/,
  );
  assert.match(
    inventoryV4Sql,
    /routing_rule_canonical_hostname text not null check \([\s\S]*= 'baggerinv\.com'/,
  );
  assert.match(
    inventoryV4Sql,
    /routing_rule_earlier_active_bypass_rule_count integer not null check \([\s\S]*= 0/,
  );
  assert.match(
    inventoryV4Sql,
    /alter table production_control\.vercel_routing_rule_audit_bindings[\s\S]*enable row level security/,
  );
  assert.match(
    inventoryV4Sql,
    /revoke all on table production_control\.vercel_routing_rule_audit_bindings[\s\S]*from public, anon, authenticated, service_role/,
  );

  const binder = definition(
    "production_control.bind_current_vercel_routing_rule_audit",
  );
  assert.match(binder, /security definer[\s\S]*set search_path = pg_catalog/);
  assert.match(binder, /normalized_kind not in \('CHALLENGE', 'ATTESTATION', 'QUIESCE'\)/);
  assert.match(binder, /on conflict \(challenge_id\) do nothing/);
  assert.match(binder, /on conflict \(attestation_id\) do nothing/);
  assert.match(binder, /on conflict \(quiesce_evidence_id\) do nothing/);
  assert.match(binder, /PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_BINDING_MISSING/);
  const immutabilityGuard = definition(
    "production_control.guard_vercel_routing_rule_audit_binding",
  );
  assert.match(immutabilityGuard, /PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_IMMUTABLE/);
  assert.match(immutabilityGuard, /set search_path = pg_catalog/);

  const assertion = definition(
    "production_control.assert_exact_vercel_routing_rule_audit",
  );
  assert.match(assertion, /immutable[\s\S]*security definer[\s\S]*set search_path = pg_catalog/);
  assert.match(assertion, /routing_rule_hostname_operator'[\s\S]*DOES_NOT_EQUAL/);
  assert.match(assertion, /routing_rule_canonical_hostname'[\s\S]*baggerinv\.com/);
  assert.match(assertion, /routing_rule_earlier_active_bypass_rule_count'[\s\S]*is distinct from '0'/);

  for (const functionName of [
    "public.issue_production_vercel_provider_attestation_challenge",
    "public.begin_production_vercel_writer_quiesce_evidence",
    "public.finalize_production_vercel_writer_quiesce_evidence",
  ]) {
    const wrapper = definition(functionName);
    assert.match(wrapper, /assert_exact_vercel_routing_rule_audit\(input\)/);
    assert.match(wrapper, /bind_current_vercel_routing_rule_audit/);
    assert.match(wrapper, /set search_path = pg_catalog/);
  }
  const consume = definition(
    "public.consume_production_vercel_provider_attestation_challenge",
  );
  assert.match(consume, /assert_exact_vercel_routing_rule_audit\([\s\S]*provider_claim/);
  for (const field of [
    "routing_rule_hostname_operator",
    "routing_rule_canonical_hostname",
    "routing_rule_earlier_active_bypass_rule_count",
  ]) assert.match(consume, new RegExp(`'${field}'`));
  assert.match(consume, /consume_vercel_provider_attestation_v3_base\(v3_input\)/);
  assert.match(consume, /bind_current_vercel_routing_rule_audit\([\s\S]*'ATTESTATION'/);

  for (const responseName of [
    "production_control.vercel_provider_attestation_challenge_response",
    "production_control.vercel_provider_attestation_response",
    "production_control.vercel_quiesce_response",
  ]) {
    const response = definition(responseName);
    assert.match(response, /routing_rule_hostname_operator/);
    assert.match(response, /routing_rule_canonical_hostname/);
    assert.match(response, /routing_rule_earlier_active_bypass_rule_count/);
    assert.match(response, /set search_path = pg_catalog/);
  }
  assert.match(
    definition("production_control.vercel_provider_attestation_challenge_response"),
    /consumed_provider_attestation[\s\S]*consumed_audit\.routing_rule_hostname_operator/,
  );

  for (const baseName of [
    "issue_vercel_provider_attestation_v3_base",
    "consume_vercel_provider_attestation_v3_base",
    "begin_vercel_writer_quiesce_v3_base",
    "finalize_vercel_writer_quiesce_v3_base",
  ]) assert.match(
    inventoryV4Sql,
    new RegExp(`revoke all on function public\\.${baseName}\\(jsonb\\)[\\s\\S]*from public, anon, authenticated, service_role`),
  );
  assert.match(
    inventoryV4Sql,
    /revoke all on function[\s\S]*bind_current_vercel_routing_rule_audit\([\s\S]*text, uuid, boolean[\s\S]*from public, anon, authenticated, service_role/,
  );
});

test("migration 040 authorizes provider-fence removal only from exact audited v4 evidence", () => {
  const removalSafety = definition(
    "production_control.assert_google_writer_provider_fence_removal_safe",
  );
  assert.match(
    removalSafety,
    /perform production_control\.assert_current_provider_inventory_v4\([\s\S]*pg_catalog\.to_jsonb\(quiesce\), false, true/,
  );
  assert.match(
    removalSafety,
    /perform production_control\.assert_exact_vercel_live_inventory\([\s\S]*quiesce\.live_origin_inventory/,
  );
  assert.equal(
    (removalSafety.match(
      /perform production_control\.assert_exact_vercel_probe_records\(/g,
    ) ?? []).length,
    2,
    "both stored v4 readbacks must be revalidated before removal",
  );
  assert.match(removalSafety, /quiesce\.origin_inventory_count is distinct from 1292/);
  assert.match(
    removalSafety,
    /first_probe_records[\s\S]*live_origin_inventory_count \+ 4[\s\S]*second_probe_records[\s\S]*live_origin_inventory_count \+ 4/,
  );
  assert.doesNotMatch(removalSafety, /live_origin_inventory_count \+ 5/);
  assert.doesNotMatch(
    removalSafety,
    /1140|533178a28a5458c5f2f727b77af3024de4cc0402c49e90dcd763b950d26fb4c6/,
  );
  assert.match(
    removalSafety,
    /not exists \([\s\S]*vercel_routing_rule_audit_bindings[\s\S]*subject_kind = 'QUIESCE'/,
  );
  assert.match(
    removalSafety,
    /routing_rule_hostname_operator = 'DOES_NOT_EQUAL'[\s\S]*routing_rule_canonical_hostname = 'baggerinv\.com'[\s\S]*routing_rule_earlier_active_bypass_rule_count = 0/,
  );
  assert.match(removalSafety, /stable[\s\S]*security definer[\s\S]*set search_path = pg_catalog/);
  assert.match(
    inventoryV4Sql,
    /revoke all on function[\s\S]*assert_google_writer_provider_fence_removal_safe\([\s\S]*uuid, jsonb[\s\S]*from public, anon, authenticated, service_role/,
  );
});

test("migration 040 durably settles the provider fence before atomic close", () => {
  const insertSettlement = definition(
    "production_control.insert_google_writer_provider_fence_settlement_observation",
  );
  const recordSettlement = definition(
    "public.record_production_google_writer_provider_fence_settlement",
  );
  const abortInstall = definition(
    "public.abort_production_google_writer_provider_fence_install",
  );
  const providerFenceResponse = definition(
    "production_control.google_writer_provider_fence_response",
  );
  const finishAndClose = definition(
    "public.finish_close_production_google_writer_provider_fence_install",
  );
  const inspectFence = definition(
    "public.inspect_production_google_writer_provider_fence",
  );
  const inspectAdmission = definition(
    "public.inspect_production_scoring_admission",
  );

  assert.match(
    inventoryV4Sql,
    /create table production_control\.google_writer_provider_fence_settlement_observations/,
  );
  for (const stage of [
    "ACL_READER_CONFIRMED",
    "SETTLEMENT_READBACK_1",
    "SETTLEMENT_READBACK_2",
  ]) assert.match(inventoryV4Sql, new RegExp(`'${stage}'`));
  for (const fingerprint of [
    "protection_set_fingerprint",
    "provider_fingerprint",
    "acl_fingerprint",
    "canonical_value_fingerprint",
    "combined_value_fingerprint",
    "formula_fingerprint",
    "structural_canary_fingerprint",
    "permission_inventory_fingerprint",
  ]) assert.match(insertSettlement, new RegExp(fingerprint));
  assert.match(insertSettlement, /interval '190 seconds'/);
  assert.match(insertSettlement, /interval '10 seconds'/);
  assert.match(insertSettlement, /captured_at_value - interval '5 seconds'/);
  assert.doesNotMatch(insertSettlement, /captured_at_value - interval '120 seconds'/);
  assertOrdered(
    insertSettlement,
    "where value.observation_request_id = request_identifier",
    "captured_at_value - interval '5 seconds'",
    "exact durable settlement replay must precede freshness rejection",
  );
  assert.match(
    insertSettlement,
    /existing\.request_fingerprint is distinct from[\s\S]*existing\.payload_hash is distinct from payload_hash_value[\s\S]*PRODUCTION_GOOGLE_WRITER_PROVIDER_SETTLEMENT_IDEMPOTENCY_CONFLICT/,
  );
  assert.match(
    insertSettlement,
    /captured_at_value < prior\.recorded_at \+ interval '10 seconds'[\s\S]*observed_at_value < prior\.recorded_at \+ interval '10 seconds'/,
  );
  assert.match(insertSettlement, /observed_at_value <= prior\.provider_observed_at/);
  assert.match(insertSettlement, /PRODUCTION_GOOGLE_WRITER_PROVIDER_SETTLEMENT_DRIFT/);
  assert.match(recordSettlement, /set search_path = pg_catalog/);
  assert.match(recordSettlement, /pg_advisory_xact_lock/);
  assertOrdered(
    recordSettlement,
    "pg_advisory_xact_lock",
    "insert_google_writer_provider_fence_settlement_observation",
    "settlement replay lookup must execute while holding the transition lock",
  );
  assert.match(recordSettlement, /required_wait_seconds/);

  assert.match(
    abortInstall,
    /provider_observed < pg_catalog\.clock_timestamp\(\) - interval '5 seconds'/,
  );
  assert.doesNotMatch(
    abortInstall,
    /provider_observed < pg_catalog\.clock_timestamp\(\) - interval '120 seconds'/,
  );
  assertOrdered(
    abortInstall,
    "pg_advisory_xact_lock",
    "where value.abort_request_id = abort_request",
    "abort durable replay lookup must execute under the transition lock",
  );
  assertOrdered(
    abortInstall,
    "where value.abort_request_id = abort_request",
    "provider_observed < pg_catalog.clock_timestamp() - interval '5 seconds'",
    "exact abort replay must precede freshness rejection",
  );
  assert.match(
    abortInstall,
    /prior\.request_fingerprint is distinct from[\s\S]*prior\.payload_hash is distinct from payload_hash_value[\s\S]*PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_RESTORE_IDEMPOTENCY_CONFLICT/,
  );
  assert.match(abortInstall,
    /input->'active_run_owned_protection_count' is distinct from '0'::jsonb[\s\S]*input->'removed_protected_range_ids' is distinct from '\[\]'::jsonb/);
  assert.match(abortInstall,
    /restore_dispatch\.outcome_status is distinct from 'TARGET_CONFIRMED'[\s\S]*restore_dispatch\.target_role is distinct from 'writer'/);
  assert.match(abortInstall,
    /restore_dispatch\.transition_proof->'currentLegacyCanEdit'[\s\S]*is distinct from 'true'::jsonb[\s\S]*restore_dispatch\.transition_proof->'currentLegacyCanShare'[\s\S]*is distinct from 'true'::jsonb/);
  assert.match(abortInstall,
    /fence\.restore_global_writer_stop_active_at \+ interval '1810 seconds'/);
  assert.match(
    providerFenceResponse,
    /'abort', \([\s\S]*google_writer_provider_fence_install_aborts/,
  );
  assert.match(providerFenceResponse,
    /'install_dispatch', \([\s\S]*'transition_intent'[\s\S]*'outcome_status'/);
  assert.match(providerFenceResponse,
    /'abort_dispatch', \([\s\S]*'transition_intent'[\s\S]*'outcome_status'/);
  assert.match(inspectFence, /'acl_reader_confirmed_observation_id'/);
  assert.doesNotMatch(inspectFence, /'protections_installed_observation_id'/);
  assert.doesNotMatch(inspectFence, /'provider_settlement_protected_range_ids'/);
  for (const field of [
    "abort_id",
    "abort_request_id",
    "request_fingerprint",
    "restoration_evidence_fingerprint",
    "removed_protected_range_ids",
    "active_run_owned_protection_count",
    "restored_provider_fingerprint",
    "restored_acl_fingerprint",
    "restored_canonical_value_fingerprint",
    "restored_combined_value_fingerprint",
    "restored_formula_fingerprint",
    "provider_observed_at",
    "aborted_at",
  ]) assert.match(providerFenceResponse, new RegExp(`'${field}'`));

  assertOrdered(
    finishAndClose,
    "insert_google_writer_provider_fence_settlement_observation",
    "finish_production_google_writer_provider_fence_install",
    "final settlement readback must be durable before provider finish",
  );
  assertOrdered(
    finishAndClose,
    "finish_production_google_writer_provider_fence_install",
    "close_production_scoring_admission",
    "provider finish and admission close must remain one ordered transaction",
  );
  assert.match(finishAndClose, /settlement_readback_2_request_id/);
  assert.match(finishAndClose, /settlement_install_wait_seconds', 190/);
  assert.match(finishAndClose, /settlement_readback_wait_seconds', 10/);

  for (const key of [
    "provider_settlement_stage",
    "acl_reader_confirmed_observation_id",
    "settlement_readback_1_observation_id",
    "settlement_readback_2_observation_id",
    "provider_settlement_latest_observation_id",
    "provider_settlement_prior_observation_id",
    "provider_settlement_next_eligible_at",
    "provider_settlement_remaining_wait_seconds",
    "settlement_structural_canary_fingerprint",
    "settlement_permission_inventory_fingerprint",
  ]) assert.match(inspectFence, new RegExp(`'${key}'`));
  assert.match(inspectFence, /stable[\s\S]*set search_path = pg_catalog/);
  assert.match(inspectAdmission, /'expected_source_fingerprint'/);
  assert.match(inspectAdmission, /'start_source_fingerprint'/);
  assert.match(inspectAdmission, /'provider_settlement_install_wait_seconds', 190/);
  assert.match(inspectAdmission, /'provider_settlement_readback_wait_seconds', 10/);

  assert.match(
    inventoryV4Sql,
    /revoke all on function\s+production_control\.insert_google_writer_provider_fence_settlement_observation\([\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    inventoryV4Sql,
    /grant execute on function\s+public\.record_production_google_writer_provider_fence_settlement\(jsonb\)\s+to service_role/,
  );
  assert.match(
    inventoryV4Sql,
    /grant execute on function\s+public\.inspect_production_google_writer_provider_fence\(jsonb\)\s+to service_role/,
  );
});

test("each migration contains no schema-qualified conditional syntax and is one balanced transaction", () => {
  for (const migration of [baseSql, inventoryV3Sql, inventoryV4Sql]) {
    assert.doesNotMatch(
      migration,
      /pg_catalog\.(?:coalesce|nullif|greatest|least)\s*\(/i,
    );
    assert.match(migration, /^--[\s\S]*\nbegin;\n/i);
    assert.match(migration, /notify pgrst, 'reload schema';\s*commit;\n$/);
    assert.equal((migration.match(/\bcommit;/gi) ?? []).length, 1);
    assert.equal((migration.match(/\$\$/g) ?? []).length % 2, 0);
  }
});
