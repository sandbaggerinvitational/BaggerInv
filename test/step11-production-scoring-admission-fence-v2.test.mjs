import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608260034_production_scoring_admission_fence_v2.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");

function definition(qualifiedName) {
  const marker = `create or replace function ${qualifiedName}`;
  const start = sql.indexOf(marker);
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
  assert.match(sql, /legacy_deployments_fenced and google_credentials_fenced[\s\S]*manual_google_scoring_fenced/);
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

test("migration contains no schema-qualified conditional syntax and is one balanced transaction", () => {
  assert.doesNotMatch(sql, /pg_catalog\.(?:coalesce|nullif|greatest|least)\s*\(/i);
  assert.match(sql, /^--[\s\S]*\nbegin;\n/i);
  assert.match(sql, /notify pgrst, 'reload schema';\ncommit;\n$/);
  assert.equal((sql.match(/\bcommit;/gi) ?? []).length, 1);
  assert.equal((sql.match(/\$\$/g) ?? []).length % 2, 0);
});
