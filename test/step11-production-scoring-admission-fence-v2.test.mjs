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
const baseSql = await readFile(baseMigrationUrl, "utf8");
const inventoryV3Sql = await readFile(inventoryV3MigrationUrl, "utf8");
const sql = [baseSql, inventoryV3Sql].join("\n");
const quiesceSource = await readFile(new URL(
  "../lib/production-google-writer-fence-quiesce.js",
  import.meta.url,
), "utf8");

function definition(qualifiedName) {
  const marker = `create or replace function ${qualifiedName}`;
  // Later additive migrations deliberately replace selected functions. Static
  // assertions must inspect the effective latest definition, not the first
  // historical definition retained in the migration ledger.
  const start = sql.lastIndexOf(marker);
  assert.notEqual(start, -1, `Missing ${qualifiedName}`);
  const bodyStart = sql.indexOf("as $$", start);
  assert.notEqual(bodyStart, -1, `Missing body for ${qualifiedName}`);
  const end = sql.indexOf("\n$$;", bodyStart);
  assert.notEqual(end, -1, `Unterminated body for ${qualifiedName}`);
  return sql.slice(start, end + 4);
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
    "public.record_production_scoring_external_fence_evidence",
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
    "public.begin_production_google_writer_fence_rehearsal",
    "public.finish_production_google_writer_fence_rehearsal",
    "public.arm_production_google_ingress_lease_gate",
    "public.refresh_production_scoring_external_fence_evidence",
    "public.close_production_scoring_admission",
    "public.drain_production_scoring_admission",
    "public.finalize_production_scoring_admission",
    "public.reopen_production_scoring_admission",
    "public.prepare_production_authority_epoch",
    "public.commit_production_authority_epoch",
    "public.abort_production_authority_epoch",
    "public.abort_production_precommit_release",
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
  assert.match(certification, /value\.status = 'RESTORED'/);
  assert.match(certification, /value\.certification_passed/);
  assert.match(certification, /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_CERTIFICATION_REQUIRED/);
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

test("outcomes never infer no-write from expiry and evidence hashes are server-bound", () => {
  const mark = definition("public.mark_production_scoring_ingress_write_started");
  const report = definition("public.report_production_scoring_ingress_outcome");
  const drain = definition("public.drain_production_scoring_admission");
  const legacy = definition("public.resolve_production_legacy_scoring_ingress");
  assert.match(mark, /LEASE_EXPIRED_BEFORE_WRITE_START[\s\S]*'AMBIGUOUS'/);
  assert.match(drain, /set resolution_state = 'AMBIGUOUS'/);
  assert.doesNotMatch(drain, /set resolution_state = 'PROVEN_NO_WRITE'/);
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
  const runtime = definition("production_control.assert_production_scoring_runtime");
  assert.match(close, /requested_authority = 'SUPABASE'[\s\S]*gate\.admission_state <> 'CLOSED'/);
  assert.match(commit, /set state = 'OPEN', authority = 'SUPABASE',[\s\S]*admission_state = 'CLOSED'/);
  assert.match(commit, /'LEGACY_ADMISSION', null, '2026', 'GOOGLE', epoch\.epoch_id/);
  assert.match(abort, /set state = 'OPEN', authority = 'SUPABASE',[\s\S]*admission_state = 'CLOSED'/);
  assert.match(reopen, /activation\.current_authority is distinct from 'GOOGLE'/);
  assert.match(reopen, /activation\.state not in \('GOOGLE_LEASE_ARMED', 'ROLLED_BACK'\)/);
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
  assert.match(probe, /expected_origin_count integer :=[\s\S]*jsonb_array_length\(target_origin_inventory\) \+ 5/);
  assert.match(
    probe,
    /expected_logical_probe_count integer :=[\s\S]*expected_origin_count \* expected_probe_vector_count/,
  );
  assert.match(probe, /expected_probe_vector_count <> 11/);
  assert.match(probe, /CUTOVER_PRODUCTION_CANDIDATE/);
  assert.match(probe, /IMMUTABLE_CUTOVER_PRODUCTION_CANDIDATE/);
  assert.match(probe, /pg_catalog\.jsonb_array_length\(value->9\) <> 11/);
  assert.match(probe, /vectorProofFingerprints|value->9/);
  assert.match(probe, /coalesce\(value->>8, ''\) <> '2047'/);
  assert.match(probe, /normalized_scope is distinct from expected_scope/);
  assert.match(probe, /pg_catalog\.count\(distinct proof #>> '\{\}'\)/);
  const finalizeQuiesce = definition(
    "public.finalize_production_vercel_writer_quiesce_evidence",
  );
  assert.match(finalizeQuiesce, /\(probe->>10\)::timestamptz < evidence\.drain_started_at/);
  assert.match(finalizeQuiesce, /first_origin->9[\s\S]*intersect[\s\S]*second_origin->9/);

  const verification = definition(
    "production_control.insert_google_writer_provider_fence_verification",
  );
  assert.match(verification, /recovery_only_value := fence\.status = 'INSTALLING'/);
  assert.match(verification, /quiesce\.evidence_id is distinct from fence\.quiesce_evidence_id/);
  assert.match(verification, /when recovery_only_value then captured \+ interval '1 second'/);
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
  assert.match(authorize, /quiesce_evidence_id/);
  assert.match(authorize, /provider_fence_verification_id/);
  assert.match(authorize, /removal_activation_revision/);
  assert.match(finish, /restored_combined_value_fingerprint/);
  assert.match(finish, /fence\.quiesce_evidence_id is distinct from/);
  assert.match(safety, /fence\.status = 'INSTALLED'[\s\S]*quiesce\.expires_at <= pg_catalog\.now\(\) \+ interval '5 minutes'/);
  assert.match(safety, /fence\.status = 'REMOVAL_AUTHORIZED'[\s\S]*removal_activation_revision/);
  assert.doesNotMatch(
    safety,
    /or quiesce\.expires_at <= pg_catalog\.now\(\)\s*\n\s*or/,
  );
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
  assert.match(retainedInventory, /record_count <> 1291/);
  assert.match(
    retainedInventory,
    /value->1 <> 'null'::jsonb[\s\S]*'\^\[0-9a-f\]\{40\}\$'/,
  );
  assert.match(liveInventory, /select value[\s\S]*normalized_retained[\s\S]*except[\s\S]*normalized_live/);
  assert.match(liveInventory, /retained_candidate_count not in \(0, 1\)/);
  assert.match(liveInventory, /live_candidate_count <> 1/);
  assert.match(liveInventory, /CUTOVER_PRODUCTION_CANDIDATE/);
  assert.match(liveInventory, /live\.record->>1 = pg_catalog\.lower\(candidate_deployment_commit\)/);
  assert.match(
    liveInventory,
    /candidate_deployment_target not in \('PREVIEW', 'PRODUCTION'\)/,
  );
  assert.match(
    liveInventory,
    /dynamic_candidate_scope := case candidate_deployment_target[\s\S]*'PROJECT_PREVIEW'[\s\S]*'CUTOVER_PRODUCTION_CANDIDATE'/,
  );
  assert.match(liveInventory, /retained\.record = live\.record/);
  assert.match(liveInventory, /count\(distinct value->>0\)/);
  assert.match(liveInventory, /count\(distinct value->>2\)/);
  assert.match(
    liveInventory,
    /expected_count := pg_catalog\.jsonb_array_length\(normalized_retained\)[\s\S]*case when retained_candidate_count = 1 then 0 else 1 end/,
  );

  const issue = definition(
    "public.issue_production_vercel_provider_attestation_challenge",
  );
  assert.match(issue, /challenge_identifier uuid := extensions\.gen_random_uuid\(\)/);
  assert.match(issue, /expiry_time timestamptz := issued_time \+ interval '120 seconds'/);
  assert.match(issue, /evidence_request_identifier/);
  assert.match(issue, /begin_challenge\.operation_request_id = operation_request_identifier/);
  assert.match(issue, /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_FINALIZE_SCOPE_DRIFT/);

  const consume = definition(
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
  assert.match(
    providerInventory,
    /9ce65239f41086f56ea126e2491afe36ae90e85172a8536706f549912b27979b/,
  );
  assert.match(
    providerInventory,
    /071ca9163f6a1033e17136ace4c82b3163aa7a1c29900300ddafeeda5b7bb133/,
  );
  assert.match(consume, /status = 'CONSUMED'/);
  assert.match(consume, /'RESERVED'/);

  const quiesceBegin = definition(
    "public.begin_production_vercel_writer_quiesce_evidence",
  );
  const quiesceFinalize = definition(
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

  const begin = definition(
    "public.begin_production_vercel_writer_quiesce_evidence",
  );
  const finalize = definition(
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
    ["public.reopen_production_scoring_admission", "REOPEN_SCORING_ADMISSION"],
    ["public.prepare_production_authority_epoch", "PREPARE_AUTHORITY_EPOCH"],
    ["public.commit_production_authority_epoch", "COMMIT_AUTHORITY_EPOCH"],
    ["public.abort_production_authority_epoch", "ABORT_AUTHORITY_EPOCH"],
  ]) {
    const source = definition(name);
    const lock = source.indexOf("pg_advisory_xact_lock(");
    const firstLookup = source.indexOf(`lookup_cutover_receipt(\n    '${operation}'`, lock);
    assert.ok(lock >= 0 && firstLookup > lock, `${name} must recheck after its lock`);
  }
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

test("each migration contains no schema-qualified conditional syntax and is one balanced transaction", () => {
  for (const migration of [baseSql, inventoryV3Sql]) {
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
