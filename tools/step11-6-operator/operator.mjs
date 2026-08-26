#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const FIXED = Object.freeze({
  schemaVersion: "bagger-step11.6-operator-v2",
  environment: "PRODUCTION",
  projectRef: "ymqhhtxaywtqllynrmxe",
  projectUrl: "https://ymqhhtxaywtqllynrmxe.supabase.co",
  previewProjectRef: "idgigvjjqkfbqjeredpb",
  previewProjectUrl: "https://idgigvjjqkfbqjeredpb.supabase.co",
  previewWorkbookId: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts",
  sourceWorkbookId: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
  vercelProjectId: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  vercelProject: "bagger-inv",
  canonicalDomain: "https://baggerinv.com",
  tournamentId: "2026",
  tournamentYear: 2026,
  oddsPublicationAuthority: "GOOGLE",
  migrationName: "202608260034_production_scoring_admission_fence_v2.sql",
  runbook: "docs/step12-production-cutover-runbook-v2.md",
});

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{8,64}$/;
const PLACEHOLDER = /^__[A-Z0-9_.:-]+__$/;
const SECRET_KEY = /(^|_)(authorization|password|passwd|secret|private_key|service_role_key|access_token|refresh_token|cookie|session|api_key|client_secret)($|_)/i;
const SECRET_VALUE = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\bsb_secret_[A-Za-z0-9_-]{12,}|\bsk-[A-Za-z0-9_-]{20,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/i;

const COMMON_INPUT_KEYS = new Set([
  "actor_id", "request_id", "environment", "project_ref", "project_url",
  "source_workbook_id", "tournament_id", "deployment_id", "deployment_commit",
  "expected_activation_revision", "expected_authority_generation",
  "expected_admission_revision", "expected_admission_generation",
  "request_fingerprint",
]);

const AUTHORITY_SENSITIVE_FIELDS = new Set([
  ...COMMON_INPUT_KEYS,
  "expected_epoch_id", "expected_authority", "closure_id", "epoch_id",
  "external_fence_evidence_id", "prior_external_fence_evidence_id",
  "start_source_fingerprint", "source_fingerprint", "final_source_fingerprint",
  "reconciliation_fingerprint", "closure_boundary_fingerprint",
  "lease_set_fingerprint", "supabase_shadow_fingerprint",
  "expected_prior_source_fingerprint", "provider_evidence_fingerprint",
  "deployment_scope_fingerprint", "google_credential_scope_fingerprint",
  "writer_coverage_fingerprint", "legacy_lease_set_fingerprint",
  "supabase_match_revisions", "google_checkpoints", "boundary_captured_at",
  "captured_at", "stable_readback_count",
]);

const OPERATION_EXTRA_KEYS = Object.freeze({
  "inspect": [],
  "stage-release": [
    "contract_version", "vercel_project", "vercel_project_id", "canonical_domain",
    "tournament_year", "source_fingerprint", "certification_fingerprint",
    "environment_delta_fingerprint_v2",
  ],
  "read-cutover": [
    "contract_version", "operation", "phase", "read_state", "source_matrix_fingerprint",
  ],
  "identity": ["contract_version", "phase"],
  "arm-legacy-admission": ["expected_epoch_id"],
  "record-provider-fence": [
    "operation", "captured_at", "provider_evidence_fingerprint",
    "deployment_scope_fingerprint", "google_credential_scope_fingerprint",
    "writer_coverage_fingerprint", "legacy_lease_set_fingerprint",
    "legacy_lease_count", "legacy_deployments_fenced", "google_credentials_fenced",
    "manual_google_scoring_fenced",
  ],
  "refresh-provider-fence": [
    "operation", "prior_external_fence_evidence_id", "closure_id", "captured_at",
    "provider_evidence_fingerprint", "deployment_scope_fingerprint",
    "google_credential_scope_fingerprint", "writer_coverage_fingerprint",
    "legacy_lease_set_fingerprint", "legacy_lease_count",
    "legacy_deployments_fenced", "google_credentials_fenced",
    "manual_google_scoring_fenced",
  ],
  "close-legacy-admission": [
    "expected_authority", "start_source_fingerprint", "external_fence_evidence_id",
  ],
  "drain-legacy-admission": ["closure_id", "external_fence_evidence_id"],
  "capture-final-google-fingerprint": [
    "closure_id", "lease_set_fingerprint", "boundary_captured_at",
    "stable_readback_count", "final_source_fingerprint",
    "supabase_shadow_fingerprint", "supabase_match_revisions", "google_checkpoints",
  ],
  "finalize-legacy-closed": [
    "closure_id", "external_fence_evidence_id", "final_source_fingerprint",
    "reconciliation_fingerprint", "lease_set_fingerprint", "boundary_captured_at",
    "supabase_match_revisions", "google_checkpoints",
  ],
  "prepare-authority": [
    "epoch_type", "closure_id", "external_fence_evidence_id", "source_fingerprint",
    "reconciliation_fingerprint", "closure_boundary_fingerprint",
    "supabase_match_revisions", "google_checkpoints", "reason",
  ],
  "commit-authority": [
    "epoch_id", "closure_id", "external_fence_evidence_id",
    "reconciliation_fingerprint",
  ],
  "abort-authority": ["epoch_id", "closure_id", "external_fence_evidence_id"],
  "abort-precommit-release": [
    "contract_version", "operation", "tournament_year", "vercel_project",
    "vercel_project_id", "canonical_domain", "source_fingerprint", "expected_epoch_id",
  ],
  "reopen-legacy-admission": ["closure_id", "external_fence_evidence_id"],
  "pause-supabase-ingress": [
    "expected_authority", "start_source_fingerprint", "external_fence_evidence_id",
  ],
  "drain-supabase-ingress": ["closure_id", "external_fence_evidence_id"],
  "finalize-supabase-ingress-closed": [
    "closure_id", "external_fence_evidence_id", "final_source_fingerprint",
    "reconciliation_fingerprint", "lease_set_fingerprint", "boundary_captured_at",
    "supabase_match_revisions", "google_checkpoints",
  ],
  "prepare-rollback": [
    "epoch_type", "closure_id", "external_fence_evidence_id", "source_fingerprint",
    "reconciliation_fingerprint", "closure_boundary_fingerprint",
    "supabase_match_revisions", "google_checkpoints",
    "expected_prior_source_fingerprint", "reason",
  ],
  "commit-rollback": [
    "epoch_id", "closure_id", "external_fence_evidence_id",
    "reconciliation_fingerprint",
  ],
  "workers": [
    "worker_name", "enabled", "expected_epoch_id", "google_service_account_email",
  ],
  "odds-runtime": [
    "vercel_project_id", "canonical_domain", "tournament_year", "worker_name",
    "enabled", "expected_runtime_enabled", "expected_runtime_revision",
    "operation_mode", "cutover_phase", "operation", "candidate_hostname",
  ],
});

export const OPERATIONS = Object.freeze({
  inspect: { kind: "rpc-read-only", rpc: "inspect_production_cutover_authority" },
  "stage-release": { kind: "rpc", rpc: "stage_production_cutover_release" },
  "read-cutover": { kind: "rpc", rpc: "set_production_cutover_read_state" },
  identity: { kind: "rpc", rpc: "activate_production_participant_identity" },
  "arm-legacy-admission": { kind: "rpc", rpc: "arm_production_google_ingress_lease_gate" },
  "record-provider-fence": { kind: "rpc", rpc: "record_production_scoring_external_fence_evidence" },
  "refresh-provider-fence": { kind: "rpc", rpc: "refresh_production_scoring_external_fence_evidence" },
  "close-legacy-admission": { kind: "rpc", rpc: "close_production_scoring_admission" },
  "drain-legacy-admission": { kind: "rpc", rpc: "drain_production_scoring_admission" },
  "capture-final-google-fingerprint": { kind: "evidence-payload", rpc: null },
  "finalize-legacy-closed": { kind: "rpc", rpc: "finalize_production_scoring_admission" },
  "prepare-authority": { kind: "rpc", rpc: "prepare_production_authority_epoch" },
  "commit-authority": { kind: "rpc", rpc: "commit_production_authority_epoch" },
  "abort-authority": { kind: "rpc", rpc: "abort_production_authority_epoch" },
  "abort-precommit-release": { kind: "rpc", rpc: "abort_production_precommit_release" },
  "reopen-legacy-admission": { kind: "rpc", rpc: "reopen_production_scoring_admission" },
  "pause-supabase-ingress": { kind: "rpc", rpc: "close_production_scoring_admission" },
  "drain-supabase-ingress": { kind: "rpc", rpc: "drain_production_scoring_admission" },
  "finalize-supabase-ingress-closed": { kind: "rpc", rpc: "finalize_production_scoring_admission" },
  "prepare-rollback": { kind: "rpc", rpc: "prepare_production_authority_epoch" },
  "commit-rollback": { kind: "rpc", rpc: "commit_production_authority_epoch" },
  workers: { kind: "rpc", rpc: "set_production_cutover_worker_state" },
  "odds-runtime": { kind: "rpc", rpc: "configure_production_odds_calculation_runtime" },
});

export class OperatorRefusalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OperatorRefusalError";
    this.code = code;
  }
}

function refuse(code, message) {
  throw new OperatorRefusalError(code, message);
}

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireObject(value, code, label) {
  if (!plain(value)) refuse(code, `${label} must be a plain JSON object.`);
  return value;
}

function requireEqual(actual, expected, code, label) {
  if (actual !== expected) refuse(code, `${label} does not match the frozen Production binding.`);
}

function requireBoolean(value, code, label) {
  if (typeof value !== "boolean") refuse(code, `${label} must be an explicit boolean.`);
  return value;
}

function requireInteger(value, code, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    refuse(code, `${label} must be a non-negative safe integer.`);
  }
  return value;
}

function requireString(value, code, label) {
  if (typeof value !== "string" || value.trim() === "") refuse(code, `${label} is required.`);
  return value.trim();
}

function requirePattern(value, pattern, code, label) {
  const normalized = requireString(value, code, label).toLowerCase();
  if (!pattern.test(normalized)) refuse(code, `${label} has an invalid format.`);
  return normalized;
}

function requireTimestamp(value, code, label) {
  const normalized = requireString(value, code, label);
  if (Number.isNaN(Date.parse(normalized)) || !/[zZ]|[+-]\d\d:\d\d$/.test(normalized)) {
    refuse(code, `${label} must be an RFC3339 timestamp with timezone.`);
  }
  return normalized;
}

function unresolved(value) {
  return typeof value !== "string" || value.trim() === "" || PLACEHOLDER.test(value.trim());
}

function requireResolved(value, pattern, code, label) {
  if (unresolved(value)) refuse(code, `${label} is still an unresolved placeholder.`);
  return requirePattern(value, pattern, code, label);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) refuse("NON_JSON_NUMBER", "Only finite JSON numbers are supported.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!plain(value)) refuse("PLAIN_JSON_REQUIRED", "Only plain JSON values are supported.");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256Hex(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function assertNoSecrets(value, path = "manifest") {
  if (plain(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) refuse("SECRET_INPUT_FORBIDDEN", `Secret-bearing field forbidden at ${path}.${key}.`);
      assertNoSecrets(nested, `${path}.${key}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((nested, index) => assertNoSecrets(nested, `${path}[${index}]`));
    return;
  }
  if (typeof value === "string" && SECRET_VALUE.test(value)) {
    refuse("SECRET_INPUT_FORBIDDEN", `Secret-looking value forbidden at ${path}.`);
  }
}

function assertNoPreview(value) {
  const serialized = canonicalJson(value).toLowerCase();
  for (const forbidden of [FIXED.previewProjectUrl, FIXED.previewWorkbookId]) {
    if (serialized.includes(forbidden.toLowerCase())) {
      refuse("PREVIEW_RESOURCE_FORBIDDEN", "A known Preview resource is present in executable payload material.");
    }
  }
  // The template records the Preview project ref only as a fail-closed sentinel.
  const withoutSentinel = clone(value);
  if (withoutSentinel.resources) delete withoutSentinel.resources.previewProjectRef;
  if (canonicalJson(withoutSentinel).toLowerCase().includes(FIXED.previewProjectRef)) {
    refuse("PREVIEW_RESOURCE_FORBIDDEN", "The Preview Supabase project appears outside the non-executable sentinel field.");
  }
}

function validateExecutionPolicy(manifest) {
  requireEqual(manifest.mode, "DRY_RUN", "DRY_RUN_REQUIRED", "mode");
  const execution = requireObject(manifest.execution, "EXECUTION_POLICY_REQUIRED", "execution");
  for (const key of ["enabled", "networkAllowed", "providerSdkAllowed", "credentialReaderAllowed", "sqlExecutionAllowed"]) {
    requireEqual(requireBoolean(execution[key], "EXECUTION_POLICY_REQUIRED", `execution.${key}`), false,
      "INERT_EXECUTION_REQUIRED", `execution.${key}`);
  }
}

function validateResources(manifest) {
  const resources = requireObject(manifest.resources, "RESOURCE_SCOPE_REQUIRED", "resources");
  requireEqual(resources.environment, FIXED.environment, "WRONG_ENVIRONMENT", "resources.environment");
  requireEqual(resources.projectRef, FIXED.projectRef, "WRONG_PROJECT", "resources.projectRef");
  requireEqual(resources.projectUrl, FIXED.projectUrl, "WRONG_PROJECT", "resources.projectUrl");
  requireEqual(resources.previewProjectRef, FIXED.previewProjectRef, "PREVIEW_SENTINEL_MISSING", "resources.previewProjectRef");
  requireEqual(resources.sourceWorkbookId, FIXED.sourceWorkbookId, "WRONG_WORKBOOK", "resources.sourceWorkbookId");
  requireEqual(resources.vercelProjectId, FIXED.vercelProjectId, "WRONG_VERCEL_PROJECT", "resources.vercelProjectId");
  requireEqual(resources.vercelProject, FIXED.vercelProject, "WRONG_VERCEL_PROJECT", "resources.vercelProject");
  requireEqual(resources.canonicalDomain, FIXED.canonicalDomain, "WRONG_DOMAIN", "resources.canonicalDomain");
  requireEqual(resources.tournamentId, FIXED.tournamentId, "WRONG_TOURNAMENT", "resources.tournamentId");
  requireEqual(resources.tournamentYear, FIXED.tournamentYear, "WRONG_TOURNAMENT", "resources.tournamentYear");
  requireEqual(resources.oddsPublicationAuthority, FIXED.oddsPublicationAuthority,
    "ODDS_PUBLICATION_AUTHORITY_DRIFT", "resources.oddsPublicationAuthority");
}

export function validateManifest(manifest) {
  requireObject(manifest, "MANIFEST_REQUIRED", "manifest");
  requireEqual(manifest.schemaVersion, FIXED.schemaVersion, "SCHEMA_VERSION_MISMATCH", "schemaVersion");
  validateExecutionPolicy(manifest);
  validateResources(manifest);
  requireObject(manifest.operator, "OPERATOR_REQUIRED", "operator");
  const actorId = requireString(manifest.operator.actorId, "OPERATOR_REQUIRED", "operator.actorId");
  if (actorId.length > 160) refuse("OPERATOR_INVALID", "operator.actorId exceeds 160 characters.");
  requireObject(manifest.release, "RELEASE_REQUIRED", "release");
  requireEqual(manifest.release.migrationName, FIXED.migrationName, "MIGRATION_BINDING_DRIFT", "release.migrationName");
  requireEqual(manifest.release.runbook, FIXED.runbook, "RUNBOOK_BINDING_DRIFT", "release.runbook");
  requireObject(manifest.certification, "CERTIFICATION_REQUIRED", "certification");
  requireObject(manifest.providerFenceProof, "PROVIDER_FENCE_REQUIRED", "providerFenceProof");
  requireObject(manifest.state, "STATE_REQUIRED", "state");
  requireObject(manifest.evidence, "EVIDENCE_REQUIRED", "evidence");
  requireObject(manifest.stableRequestIds, "REQUEST_IDS_REQUIRED", "stableRequestIds");
  requireObject(manifest.operationInputs, "OPERATION_INPUTS_REQUIRED", "operationInputs");
  requireInteger(manifest.state.activationRevision, "STATE_INVALID", "state.activationRevision");
  requireInteger(manifest.state.activeLegacyWriters, "STATE_INVALID", "state.activeLegacyWriters");
  requireInteger(manifest.state.unresolvedLegacyWriters, "STATE_INVALID", "state.unresolvedLegacyWriters");
  requireInteger(manifest.state.unresolvedOutbox, "STATE_INVALID", "state.unresolvedOutbox");
  requireInteger(manifest.state.unresolvedArchive, "STATE_INVALID", "state.unresolvedArchive");
  requireBoolean(manifest.state.firstSupabaseCanonicalWritePossible, "STATE_INVALID", "state.firstSupabaseCanonicalWritePossible");
  requireBoolean(manifest.state.firstSupabaseCanonicalWriteObserved, "STATE_INVALID", "state.firstSupabaseCanonicalWriteObserved");
  if (!new Set(["OPEN", "CLOSING", "CLOSED"]).has(manifest.state.admissionState)) {
    refuse("ADMISSION_STATE_INVALID", "state.admissionState must be OPEN, CLOSING, or CLOSED.");
  }
  if (!new Set(["OPEN", "PAUSED"]).has(manifest.state.gateExecutionState)) {
    refuse("GATE_EXECUTION_STATE_INVALID", "state.gateExecutionState must be OPEN or PAUSED.");
  }
  if (![null, "LEGACY_ADMISSION", "SUPABASE_INGRESS"].includes(manifest.state.activeClosureKind)) {
    refuse("CLOSURE_KIND_INVALID", "state.activeClosureKind is outside the certified closure kinds.");
  }
  if (![null, "CLOSING", "CLOSED", "CONSUMED", "REOPENED"].includes(manifest.state.activeClosureStatus)) {
    refuse("CLOSURE_STATUS_INVALID", "state.activeClosureStatus is outside the certified closure statuses.");
  }
  assertNoSecrets(manifest.operationInputs, "operationInputs");
  assertNoPreview(manifest);
  return { ok: true, schemaVersion: FIXED.schemaVersion, mode: "DRY_RUN" };
}

function originMatrixBlockers(proof) {
  if (!Array.isArray(proof.originMatrix) || proof.originMatrix.length === 0) {
    return ["providerFenceProof.originMatrix is empty"];
  }
  const blockers = [];
  for (const [index, origin] of proof.originMatrix.entries()) {
    if (!plain(origin)) {
      blockers.push(`originMatrix[${index}] is invalid`);
      continue;
    }
    if (origin.productionCredentialsAvailable === true && origin.admissionEnforced !== true && origin.providerWriterFenced !== true) {
      blockers.push(`originMatrix[${index}] retains an unfenced Production writer`);
    }
    if (origin.canWriteAfterClosed !== false) blockers.push(`originMatrix[${index}].canWriteAfterClosed is not false`);
  }
  return blockers;
}

export function evaluateReadiness(manifest) {
  const blockers = [];
  try { validateManifest(manifest); } catch (error) {
    blockers.push(`${error.code ?? "INVALID_MANIFEST"}: ${error.message}`);
    return { ready: false, blockers };
  }
  const release = manifest.release;
  const certification = manifest.certification;
  const proof = manifest.providerFenceProof;
  const state = manifest.state;

  for (const [field, pattern] of [
    ["candidateSha", HEX40], ["frozenSha", HEX40], ["certificationFingerprint", HEX64],
    ["environmentDeltaFingerprintV2", HEX64], ["executionBundleFingerprintV2", HEX64],
    ["migrationSha256", HEX64],
  ]) {
    if (unresolved(release[field]) || !pattern.test(String(release[field]).toLowerCase())) {
      blockers.push(`release.${field} is unresolved`);
    }
  }
  if (!unresolved(release.candidateSha) && !unresolved(release.frozenSha) && release.candidateSha !== release.frozenSha) {
    blockers.push("release.candidateSha does not equal release.frozenSha");
  }
  if (unresolved(release.deploymentId) || !DEPLOYMENT_ID.test(String(release.deploymentId))) {
    blockers.push("release.deploymentId is unresolved");
  }
  for (const key of [
    "migrationInstalledDormant", "focusedTestsPassed", "criticalTestsPassed",
    "productionBuildPassed", "nonAuthoritativeCandidateReady", "previewIsolationPassed",
    "oldHostEnforcementPassed",
  ]) {
    if (certification[key] !== true) blockers.push(`certification.${key} is not true`);
  }
  if (certification.unexplainedConcurrencyWindows !== 0) blockers.push("unexplained concurrency windows are non-zero");
  if (certification.clientSecretExposures !== 0) blockers.push("client secret exposures are non-zero");
  if (proof.status !== "VERIFIED") blockers.push("provider fence status is not VERIFIED");
  for (const key of [
    "exactOldHostProviderFence", "allProductionCapableOriginsControlled",
    "legacyDeploymentsFenced", "googleCredentialsFenced", "manualGoogleScoringFenced",
    "previewResourcesAbsent",
  ]) {
    if (proof[key] !== true) blockers.push(`providerFenceProof.${key} is not true`);
  }
  for (const key of [
    "providerEvidenceFingerprint", "deploymentScopeFingerprint",
    "googleCredentialScopeFingerprint", "writerCoverageFingerprint",
    "legacyLeaseSetFingerprint",
  ]) {
    if (unresolved(proof[key]) || !HEX64.test(String(proof[key]).toLowerCase())) {
      blockers.push(`providerFenceProof.${key} is unresolved`);
    }
  }
  blockers.push(...originMatrixBlockers(proof));
  if (proof.legacyLeaseCount !== 0) blockers.push("providerFenceProof.legacyLeaseCount is non-zero");

  const expectedState = {
    cutoverPhase: "DORMANT", activationState: "DORMANT", scoringAuthority: "GOOGLE",
    participantIdentityAuthority: "PASSPORT", admissionState: "OPEN",
    gateExecutionState: "PAUSED", admissionProtocolEnforced: false,
    scoringIngressEnabled: false, workersEnabled: false,
    activeLegacyWriters: 0, unresolvedLegacyWriters: 0, ambiguousGoogleWrites: 0,
    partialGoogleWrites: 0, legacyUnclassifiedWriters: 0,
    unresolvedOutbox: 0, unresolvedArchive: 0,
    firstSupabaseCanonicalWritePossible: false,
    firstSupabaseCanonicalWriteObserved: false,
  };
  for (const [key, expected] of Object.entries(expectedState)) {
    if (state[key] !== expected) blockers.push(`state.${key} does not equal ${JSON.stringify(expected)}`);
  }
  if (unresolved(state.admissionGeneration) || !UUID.test(String(state.admissionGeneration))) {
    blockers.push("state.admissionGeneration is unresolved");
  }
  if (!Number.isSafeInteger(state.admissionRevision)) blockers.push("state.admissionRevision is unresolved");
  return { ready: blockers.length === 0, blockers };
}

function assertFrozenRelease(manifest) {
  const candidate = requireResolved(manifest.release.candidateSha, HEX40, "RELEASE_SHA_REQUIRED", "release.candidateSha");
  const frozen = requireResolved(manifest.release.frozenSha, HEX40, "FROZEN_SHA_REQUIRED", "release.frozenSha");
  requireEqual(candidate, frozen, "RELEASE_SHA_MISMATCH", "candidate/frozen SHA");
  requireResolved(manifest.release.certificationFingerprint, HEX64,
    "CERTIFICATION_FINGERPRINT_REQUIRED", "release.certificationFingerprint");
  requireResolved(manifest.release.deploymentId, DEPLOYMENT_ID,
    "DEPLOYMENT_ID_REQUIRED", "release.deploymentId");
  return frozen;
}

function assertOptimisticState(manifest) {
  const state = manifest.state;
  requireInteger(state.activationRevision, "STALE_ACTIVATION_REVISION", "state.activationRevision");
  requireResolved(state.authorityGeneration, UUID, "AUTHORITY_GENERATION_REQUIRED", "state.authorityGeneration");
  requireInteger(state.admissionRevision, "STALE_ADMISSION_REVISION", "state.admissionRevision");
  requireResolved(state.admissionGeneration, UUID, "ADMISSION_GENERATION_REQUIRED", "state.admissionGeneration");
}

function assertFirstWrite(manifest, { possible, observed }) {
  requireEqual(manifest.state.firstSupabaseCanonicalWritePossible, possible,
    "FIRST_WRITE_POSSIBLE_MISMATCH", "first Supabase canonical write possible");
  requireEqual(manifest.state.firstSupabaseCanonicalWriteObserved, observed,
    "FIRST_WRITE_OBSERVED_MISMATCH", "first Supabase canonical write observed");
}

function assertNoLegacyWriters(manifest) {
  for (const key of [
    "activeLegacyWriters", "unresolvedLegacyWriters", "ambiguousGoogleWrites",
    "partialGoogleWrites", "legacyUnclassifiedWriters",
  ]) requireEqual(manifest.state[key], 0, "LEGACY_WRITERS_NOT_DRAINED", `state.${key}`);
}

function assertDurableQueuesDrained(manifest) {
  requireEqual(manifest.state.unresolvedOutbox, 0,
    "DURABLE_QUEUE_NOT_DRAINED", "state.unresolvedOutbox");
  requireEqual(manifest.state.unresolvedArchive, 0,
    "DURABLE_QUEUE_NOT_DRAINED", "state.unresolvedArchive");
}

function assertImmutableFenceRefreshScope(manifest) {
  const proof = manifest.providerFenceProof;
  const bound = requireObject(proof.boundImmutableScope,
    "PROVIDER_FENCE_BOUND_SCOPE_REQUIRED", "providerFenceProof.boundImmutableScope");
  const fields = [
    "providerEvidenceFingerprint", "deploymentScopeFingerprint",
    "googleCredentialScopeFingerprint", "writerCoverageFingerprint",
  ];
  for (const field of fields) {
    const current = requireResolved(proof[field], HEX64,
      "PROVIDER_FENCE_REQUIRED", `providerFenceProof.${field}`);
    const prior = requireResolved(bound[field], HEX64,
      "PROVIDER_FENCE_BOUND_SCOPE_REQUIRED", `providerFenceProof.boundImmutableScope.${field}`);
    requireEqual(current, prior, "PROVIDER_FENCE_REFRESH_SCOPE_DRIFT",
      `providerFenceProof.${field}`);
  }
}

function assertRollbackEvidence(manifest) {
  const state = manifest.state;
  const evidence = manifest.evidence;
  requireEqual(state.firstSupabaseCanonicalWritePossible, true,
    "ROLLBACK_NOT_POST_COMMIT", "state.firstSupabaseCanonicalWritePossible");
  if (state.firstSupabaseCanonicalWriteObserved) {
    requireEqual(state.rollbackClassification, "POST-WRITE",
      "ROLLBACK_CLASSIFICATION_MISMATCH", "state.rollbackClassification");
    requireEqual(evidence.allSupabaseWindowWritesEnumerated, true,
      "POST_WRITE_RECONCILIATION_REQUIRED", "evidence.allSupabaseWindowWritesEnumerated");
    for (const key of ["rollbackUnresolvedWrites", "rollbackLostWrites", "rollbackDuplicateWrites"]) {
      requireEqual(evidence[key], 0, "POST_WRITE_RECONCILIATION_REQUIRED", `evidence.${key}`);
    }
  } else {
    requireEqual(state.rollbackClassification, "POST-COMMIT / NO WRITE",
      "ROLLBACK_CLASSIFICATION_MISMATCH", "state.rollbackClassification");
  }
}

function assertProviderFence(manifest, { requireEvidenceId = true } = {}) {
  const proof = manifest.providerFenceProof;
  requireEqual(proof.status, "VERIFIED", "PROVIDER_FENCE_REQUIRED", "providerFenceProof.status");
  for (const key of [
    "exactOldHostProviderFence", "allProductionCapableOriginsControlled",
    "legacyDeploymentsFenced", "googleCredentialsFenced", "manualGoogleScoringFenced",
    "previewResourcesAbsent",
  ]) requireEqual(proof[key], true, "PROVIDER_FENCE_REQUIRED", `providerFenceProof.${key}`);
  const matrixBlockers = originMatrixBlockers(proof);
  if (matrixBlockers.length) refuse("ORIGIN_FENCE_INCOMPLETE", matrixBlockers.join("; "));
  for (const key of [
    "providerEvidenceFingerprint", "deploymentScopeFingerprint",
    "googleCredentialScopeFingerprint", "writerCoverageFingerprint", "legacyLeaseSetFingerprint",
  ]) requireResolved(proof[key], HEX64, "PROVIDER_FENCE_REQUIRED", `providerFenceProof.${key}`);
  if (requireEvidenceId) requireResolved(proof.evidenceId, UUID, "PROVIDER_EVIDENCE_ID_REQUIRED", "providerFenceProof.evidenceId");
}

function assertOperationGuard(manifest, operation) {
  const state = manifest.state;
  if (operation !== "inspect") assertFrozenRelease(manifest);
  if (!["inspect", "stage-release"].includes(operation)) assertOptimisticState(manifest);

  switch (operation) {
    case "inspect": return;
    case "stage-release":
      requireEqual(state.cutoverPhase, "DORMANT", "PHASE_SKIP_FORBIDDEN", "state.cutoverPhase");
      requireEqual(state.activationState, "DORMANT", "PHASE_SKIP_FORBIDDEN", "state.activationState");
      requireEqual(state.scoringAuthority, "GOOGLE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      requireEqual(state.participantIdentityAuthority, "PASSPORT", "IDENTITY_MISMATCH", "state.participantIdentityAuthority");
      requireEqual(state.admissionState, "OPEN", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      assertFirstWrite(manifest, { possible: false, observed: false });
      return;
    case "read-cutover":
      requireEqual(state.cutoverPhase, "STATIC_BACKEND", "PHASE_SKIP_FORBIDDEN", "state.cutoverPhase");
      break;
    case "identity":
      requireEqual(state.cutoverPhase, "READ_CUTOVER", "PHASE_SKIP_FORBIDDEN", "state.cutoverPhase");
      break;
    case "arm-legacy-admission":
      requireEqual(state.cutoverPhase, "CURRENT_READS", "PHASE_SKIP_FORBIDDEN", "state.cutoverPhase");
      requireEqual(state.activationState, "STAGED", "PHASE_SKIP_FORBIDDEN", "state.activationState");
      requireEqual(state.admissionState, "OPEN", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.scoringAuthority, "GOOGLE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      assertNoLegacyWriters(manifest);
      assertFirstWrite(manifest, { possible: false, observed: false });
      return;
    case "record-provider-fence":
      requireEqual(state.activationState, "GOOGLE_LEASE_ARMED", "PHASE_SKIP_FORBIDDEN", "state.activationState");
      requireEqual(state.admissionState, "OPEN", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.gateExecutionState, "OPEN", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.admissionProtocolEnforced, true, "ADMISSION_PROTOCOL_REQUIRED", "state.admissionProtocolEnforced");
      assertProviderFence(manifest, { requireEvidenceId: false });
      return;
    case "refresh-provider-fence":
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(["CLOSING", "CLOSED"].includes(state.admissionState), true,
        "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(["CLOSING", "CLOSED"].includes(state.activeClosureStatus), true,
        "CLOSURE_STATUS_MISMATCH", "state.activeClosureStatus");
      requireEqual(["LEGACY_ADMISSION", "SUPABASE_INGRESS"].includes(state.activeClosureKind), true,
        "CLOSURE_KIND_MISMATCH", "state.activeClosureKind");
      requireEqual(state.admissionProtocolEnforced, true,
        "ADMISSION_PROTOCOL_REQUIRED", "state.admissionProtocolEnforced");
      requireEqual(state.externalFenceEvidenceId, manifest.providerFenceProof.evidenceId,
        "PROVIDER_EVIDENCE_BINDING_MISMATCH", "state.externalFenceEvidenceId");
      requireResolved(state.activeClosureId, UUID,
        "CLOSURE_ID_REQUIRED", "state.activeClosureId");
      assertProviderFence(manifest);
      assertImmutableFenceRefreshScope(manifest);
      return;
    case "close-legacy-admission":
      requireEqual(state.activationState, "GOOGLE_LEASE_ARMED", "PHASE_SKIP_FORBIDDEN", "state.activationState");
      requireEqual(state.scoringAuthority, "GOOGLE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      requireEqual(state.admissionState, "OPEN", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.gateExecutionState, "OPEN", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.admissionProtocolEnforced, true, "ADMISSION_PROTOCOL_REQUIRED", "state.admissionProtocolEnforced");
      requireEqual(state.scoringIngressEnabled, false, "INGRESS_STATE_MISMATCH", "state.scoringIngressEnabled");
      assertProviderFence(manifest);
      assertFirstWrite(manifest, { possible: false, observed: false });
      return;
    case "drain-legacy-admission":
      requireEqual(state.scoringAuthority, "GOOGLE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      requireEqual(state.admissionState, "CLOSING", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.activeClosureStatus, "CLOSING", "CLOSURE_STATUS_MISMATCH", "state.activeClosureStatus");
      requireEqual(state.scoringIngressEnabled, false, "INGRESS_STATE_MISMATCH", "state.scoringIngressEnabled");
      return;
    case "capture-final-google-fingerprint":
      requireEqual(state.scoringAuthority, "GOOGLE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      requireEqual(state.admissionState, "CLOSING", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.activeClosureStatus, "CLOSING", "CLOSURE_STATUS_MISMATCH", "state.activeClosureStatus");
      assertNoLegacyWriters(manifest);
      assertProviderFence(manifest);
      assertDurableQueuesDrained(manifest);
      return;
    case "finalize-legacy-closed":
      requireEqual(state.scoringAuthority, "GOOGLE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      requireEqual(state.admissionState, "CLOSING", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.activeClosureStatus, "CLOSING", "CLOSURE_STATUS_MISMATCH", "state.activeClosureStatus");
      assertNoLegacyWriters(manifest);
      assertDurableQueuesDrained(manifest);
      assertProviderFence(manifest);
      requireEqual(manifest.evidence.stableReadbackCount >= 2, true,
        "STABLE_GOOGLE_READBACK_REQUIRED", "evidence.stableReadbackCount >= 2");
      return;
    case "prepare-authority":
      requireEqual(state.scoringAuthority, "GOOGLE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      requireEqual(state.admissionState, "CLOSED", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.activeClosureKind, "LEGACY_ADMISSION", "CLOSURE_KIND_MISMATCH", "state.activeClosureKind");
      requireEqual(state.activeClosureStatus, "CLOSED", "CLOSURE_STATUS_MISMATCH", "state.activeClosureStatus");
      requireEqual(state.finalGoogleAuthoritySnapshotSafe, true,
        "FINAL_GOOGLE_SNAPSHOT_UNSAFE", "state.finalGoogleAuthoritySnapshotSafe");
      requireEqual(state.supabaseAuthorityPrepareSafe, true,
        "SUPABASE_PREPARE_UNSAFE", "state.supabaseAuthorityPrepareSafe");
      requireEqual(state.supabaseShadowParityExact, true, "SHADOW_PARITY_REQUIRED", "state.supabaseShadowParityExact");
      assertNoLegacyWriters(manifest);
      assertDurableQueuesDrained(manifest);
      assertFirstWrite(manifest, { possible: false, observed: false });
      return;
    case "commit-authority":
      requireEqual(state.activationState, "CUTOVER_PREPARED", "PHASE_SKIP_FORBIDDEN", "state.activationState");
      requireEqual(state.scoringAuthority, "GOOGLE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      requireEqual(state.admissionState, "CLOSED", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.activeClosureKind, "LEGACY_ADMISSION", "CLOSURE_KIND_MISMATCH", "state.activeClosureKind");
      requireEqual(state.activeClosureStatus, "CLOSED", "CLOSURE_STATUS_MISMATCH", "state.activeClosureStatus");
      requireEqual(state.supabaseAuthorityCommitSafe, true,
        "SUPABASE_COMMIT_UNSAFE", "state.supabaseAuthorityCommitSafe");
      requireEqual(state.scoringIngressEnabled, false, "INGRESS_MUST_BE_PAUSED", "state.scoringIngressEnabled");
      requireEqual(state.workersEnabled, false, "WORKERS_MUST_BE_DISABLED", "state.workersEnabled");
      assertNoLegacyWriters(manifest);
      assertDurableQueuesDrained(manifest);
      assertFirstWrite(manifest, { possible: false, observed: false });
      return;
    case "abort-authority":
      requireEqual(state.activationState, "CUTOVER_PREPARED", "PHASE_SKIP_FORBIDDEN", "state.activationState");
      requireEqual(state.admissionState, "CLOSED", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.activeClosureStatus, "CLOSED", "CLOSURE_STATUS_MISMATCH", "state.activeClosureStatus");
      return;
    case "abort-precommit-release":
      requireEqual(state.cutoverPhase, "STATIC_BACKEND", "ROLLBACK_ORDER_INVALID", "state.cutoverPhase");
      requireEqual(["STAGED", "GOOGLE_LEASE_ARMED"].includes(state.activationState), true,
        "ROLLBACK_ORDER_INVALID", "state.activationState");
      requireEqual(state.scoringAuthority, "GOOGLE", "ROLLBACK_ORDER_INVALID", "state.scoringAuthority");
      requireEqual(state.participantIdentityAuthority, "PASSPORT", "ROLLBACK_ORDER_INVALID", "state.participantIdentityAuthority");
      requireEqual(state.admissionState, "OPEN", "ROLLBACK_ORDER_INVALID", "state.admissionState");
      requireEqual(state.activeClosureId, null, "ROLLBACK_ORDER_INVALID", "state.activeClosureId");
      requireEqual(state.scoringIngressEnabled, false, "ROLLBACK_ORDER_INVALID", "state.scoringIngressEnabled");
      requireEqual(state.workersEnabled, false, "ROLLBACK_ORDER_INVALID", "state.workersEnabled");
      requireEqual(state.gateExecutionState,
        state.activationState === "STAGED" ? "PAUSED" : "OPEN",
        "GATE_STATE_MISMATCH", "state.gateExecutionState");
      assertNoLegacyWriters(manifest);
      assertFirstWrite(manifest, { possible: false, observed: false });
      return;
    case "reopen-legacy-admission":
      requireEqual(state.scoringAuthority, "GOOGLE", "REOPEN_AUTHORITY_UNSAFE", "state.scoringAuthority");
      requireEqual(["CLOSING", "CLOSED"].includes(state.admissionState), true,
        "REOPEN_STATE_UNSAFE", "state.admissionState");
      requireEqual(state.legacyGoogleReopenSafe, true, "REOPEN_SAFETY_FALSE", "state.legacyGoogleReopenSafe");
      requireEqual(state.preparedEpochId, null, "PREPARED_EPOCH_BLOCKS_REOPEN", "state.preparedEpochId");
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(["CLOSING", "CLOSED"].includes(state.activeClosureStatus), true,
        "CLOSURE_STATUS_MISMATCH", "state.activeClosureStatus");
      assertNoLegacyWriters(manifest);
      return;
    case "pause-supabase-ingress":
      requireEqual(state.activationState, "SCORING_COMMITTED", "ROLLBACK_ORDER_INVALID", "state.activationState");
      requireEqual(state.scoringAuthority, "SUPABASE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      requireEqual(state.admissionState, "CLOSED", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.activeClosureKind, "LEGACY_ADMISSION", "CLOSURE_KIND_MISMATCH", "state.activeClosureKind");
      requireEqual(state.activeClosureStatus, "CONSUMED", "CLOSURE_STATUS_MISMATCH", "state.activeClosureStatus");
      requireEqual(state.gateExecutionState, "OPEN", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.scoringIngressEnabled, true, "SUPABASE_INGRESS_STATE_MISMATCH", "state.scoringIngressEnabled");
      requireEqual(state.firstSupabaseCanonicalWritePossible, true,
        "ROLLBACK_NOT_POST_COMMIT", "state.firstSupabaseCanonicalWritePossible");
      assertProviderFence(manifest);
      return;
    case "drain-supabase-ingress":
      requireEqual(state.activationState, "SCORING_COMMITTED", "ROLLBACK_ORDER_INVALID", "state.activationState");
      requireEqual(state.scoringAuthority, "SUPABASE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      requireEqual(state.admissionState, "CLOSED", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.activeClosureKind, "SUPABASE_INGRESS", "CLOSURE_KIND_MISMATCH", "state.activeClosureKind");
      requireEqual(state.activeClosureStatus, "CLOSING", "CLOSURE_STATUS_MISMATCH", "state.activeClosureStatus");
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.scoringIngressEnabled, true, "ACTIVATION_INGRESS_FLAG_MISMATCH", "state.scoringIngressEnabled");
      return;
    case "finalize-supabase-ingress-closed":
      requireEqual(state.activationState, "SCORING_COMMITTED", "ROLLBACK_ORDER_INVALID", "state.activationState");
      requireEqual(state.scoringAuthority, "SUPABASE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      requireEqual(state.admissionState, "CLOSED", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.activeClosureKind, "SUPABASE_INGRESS", "CLOSURE_KIND_MISMATCH", "state.activeClosureKind");
      requireEqual(state.activeClosureStatus, "CLOSING", "CLOSURE_STATUS_MISMATCH", "state.activeClosureStatus");
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.scoringIngressEnabled, true, "ACTIVATION_INGRESS_FLAG_MISMATCH", "state.scoringIngressEnabled");
      assertNoLegacyWriters(manifest);
      assertProviderFence(manifest);
      assertDurableQueuesDrained(manifest);
      requireEqual(manifest.evidence.rollbackStableReadbackCount >= 2, true,
        "STABLE_ROLLBACK_READBACK_REQUIRED", "evidence.rollbackStableReadbackCount >= 2");
      return;
    case "prepare-rollback":
      requireEqual(state.scoringAuthority, "SUPABASE", "ROLLBACK_ORDER_INVALID", "state.scoringAuthority");
      requireEqual(state.admissionState, "CLOSED", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.activationState, "SCORING_COMMITTED", "ROLLBACK_ORDER_INVALID", "state.activationState");
      requireEqual(state.scoringIngressEnabled, true, "ACTIVATION_INGRESS_FLAG_MISMATCH", "state.scoringIngressEnabled");
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.activeClosureKind, "SUPABASE_INGRESS", "CLOSURE_KIND_MISMATCH", "state.activeClosureKind");
      requireEqual(state.activeClosureStatus, "CLOSED", "CLOSURE_STATUS_MISMATCH", "state.activeClosureStatus");
      assertNoLegacyWriters(manifest);
      assertDurableQueuesDrained(manifest);
      assertRollbackEvidence(manifest);
      return;
    case "commit-rollback":
      requireEqual(state.activationState, "ROLLBACK_PREPARED", "ROLLBACK_ORDER_INVALID", "state.activationState");
      requireEqual(state.scoringAuthority, "SUPABASE", "ROLLBACK_ORDER_INVALID", "state.scoringAuthority");
      requireEqual(state.scoringIngressEnabled, true, "ACTIVATION_INGRESS_FLAG_MISMATCH", "state.scoringIngressEnabled");
      requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.activeClosureKind, "SUPABASE_INGRESS", "CLOSURE_KIND_MISMATCH", "state.activeClosureKind");
      requireEqual(state.activeClosureStatus, "CLOSED", "CLOSURE_STATUS_MISMATCH", "state.activeClosureStatus");
      assertDurableQueuesDrained(manifest);
      assertRollbackEvidence(manifest);
      return;
    case "workers":
      requireEqual(state.activationState, "SCORING_COMMITTED", "PHASE_SKIP_FORBIDDEN", "state.activationState");
      requireEqual(state.scoringAuthority, "SUPABASE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      requireEqual(state.admissionState, "CLOSED", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.scoringIngressEnabled, true, "SUPABASE_INGRESS_REQUIRED", "state.scoringIngressEnabled");
      requireEqual(state.gateExecutionState, "OPEN", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      break;
    case "odds-runtime":
      requireEqual(state.scoringAuthority, "SUPABASE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      requireEqual(state.admissionState, "CLOSED", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.gateExecutionState, "OPEN", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(manifest.resources.oddsPublicationAuthority, "GOOGLE",
        "ODDS_PUBLICATION_AUTHORITY_DRIFT", "resources.oddsPublicationAuthority");
      break;
    default:
      refuse("UNKNOWN_OPERATION", `Unknown operation: ${operation}`);
  }
}

function commonPayload(manifest, operation) {
  const state = manifest.state;
  const release = manifest.release;
  if (operation === "inspect") {
    return {
      environment: FIXED.environment,
      project_ref: FIXED.projectRef,
      project_url: FIXED.projectUrl,
      source_workbook_id: FIXED.sourceWorkbookId,
      tournament_id: FIXED.tournamentId,
    };
  }
  const requestId = requireResolved(manifest.stableRequestIds[operation], UUID,
    "STABLE_REQUEST_ID_REQUIRED", `stableRequestIds.${operation}`);
  const deploymentId = operation === "stage-release"
    ? requireResolved(release.deploymentId, DEPLOYMENT_ID, "DEPLOYMENT_ID_REQUIRED", "release.deploymentId")
    : requireResolved(state.admissionDeploymentId ?? release.deploymentId, DEPLOYMENT_ID,
      "DEPLOYMENT_ID_REQUIRED", "state.admissionDeploymentId/release.deploymentId");
  return {
    actor_id: manifest.operator.actorId,
    request_id: requestId,
    environment: FIXED.environment,
    project_ref: FIXED.projectRef,
    project_url: FIXED.projectUrl,
    source_workbook_id: FIXED.sourceWorkbookId,
    tournament_id: FIXED.tournamentId,
    deployment_id: deploymentId,
    deployment_commit: requireResolved(release.frozenSha, HEX40, "FROZEN_SHA_REQUIRED", "release.frozenSha"),
    expected_activation_revision: state.activationRevision,
    expected_authority_generation: state.authorityGeneration,
    expected_admission_revision: state.admissionRevision,
    expected_admission_generation: state.admissionGeneration,
  };
}

function operationDefaults(manifest, operation) {
  const { resources, release, providerFenceProof: proof, state, evidence } = manifest;
  switch (operation) {
    case "inspect": return {};
    case "stage-release": return {
      contract_version: "production-cutover-activation-v1",
      vercel_project: FIXED.vercelProject,
      vercel_project_id: FIXED.vercelProjectId,
      canonical_domain: FIXED.canonicalDomain,
      tournament_year: FIXED.tournamentYear,
      source_fingerprint: evidence.startSourceFingerprint,
      certification_fingerprint: release.certificationFingerprint,
      environment_delta_fingerprint_v2: release.environmentDeltaFingerprintV2,
    };
    case "read-cutover": return {
      contract_version: "production-cutover-read-sources-v1", operation: "SET_READ_CUTOVER",
      phase: "READ_CUTOVER", read_state: "SUPABASE", source_matrix_fingerprint: evidence.reconciliationFingerprint,
    };
    case "identity": return { contract_version: "production-participant-identity-cutover-v1", phase: "IDENTITY" };
    case "arm-legacy-admission": return { expected_epoch_id: state.authorityGeneration };
    case "record-provider-fence": return {
      operation: "RECORD_PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE",
      captured_at: proof.capturedAt,
      provider_evidence_fingerprint: proof.providerEvidenceFingerprint,
      deployment_scope_fingerprint: proof.deploymentScopeFingerprint,
      google_credential_scope_fingerprint: proof.googleCredentialScopeFingerprint,
      writer_coverage_fingerprint: proof.writerCoverageFingerprint,
      legacy_lease_set_fingerprint: proof.legacyLeaseSetFingerprint,
      legacy_lease_count: proof.legacyLeaseCount,
      legacy_deployments_fenced: proof.legacyDeploymentsFenced,
      google_credentials_fenced: proof.googleCredentialsFenced,
      manual_google_scoring_fenced: proof.manualGoogleScoringFenced,
    };
    case "refresh-provider-fence": return {
      operation: "REFRESH_PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE",
      prior_external_fence_evidence_id: proof.evidenceId,
      closure_id: state.activeClosureId,
      captured_at: proof.capturedAt,
      provider_evidence_fingerprint: proof.providerEvidenceFingerprint,
      deployment_scope_fingerprint: proof.deploymentScopeFingerprint,
      google_credential_scope_fingerprint: proof.googleCredentialScopeFingerprint,
      writer_coverage_fingerprint: proof.writerCoverageFingerprint,
      legacy_lease_set_fingerprint: proof.legacyLeaseSetFingerprint,
      legacy_lease_count: proof.legacyLeaseCount,
      legacy_deployments_fenced: proof.legacyDeploymentsFenced,
      google_credentials_fenced: proof.googleCredentialsFenced,
      manual_google_scoring_fenced: proof.manualGoogleScoringFenced,
    };
    case "close-legacy-admission": return {
      expected_authority: "GOOGLE", start_source_fingerprint: evidence.startSourceFingerprint,
      external_fence_evidence_id: proof.evidenceId,
    };
    case "drain-legacy-admission": return {
      closure_id: state.activeClosureId, external_fence_evidence_id: proof.evidenceId,
    };
    case "capture-final-google-fingerprint": return {
      closure_id: state.activeClosureId,
      lease_set_fingerprint: evidence.closureBoundaryFingerprint,
      boundary_captured_at: evidence.boundaryCapturedAt,
      stable_readback_count: evidence.stableReadbackCount,
      final_source_fingerprint: evidence.finalGoogleFingerprint,
      supabase_shadow_fingerprint: evidence.supabaseShadowFingerprint,
      supabase_match_revisions: evidence.supabaseMatchRevisions,
      google_checkpoints: evidence.googleCheckpoints,
    };
    case "finalize-legacy-closed": return {
      closure_id: state.activeClosureId, external_fence_evidence_id: proof.evidenceId,
      final_source_fingerprint: evidence.finalGoogleFingerprint,
      reconciliation_fingerprint: evidence.reconciliationFingerprint,
      lease_set_fingerprint: evidence.closureBoundaryFingerprint,
      boundary_captured_at: evidence.boundaryCapturedAt,
      supabase_match_revisions: evidence.supabaseMatchRevisions,
      google_checkpoints: evidence.googleCheckpoints,
    };
    case "prepare-authority": return {
      epoch_type: "CUTOVER", closure_id: state.activeClosureId,
      external_fence_evidence_id: proof.evidenceId,
      source_fingerprint: evidence.finalGoogleFingerprint,
      reconciliation_fingerprint: evidence.reconciliationFingerprint,
      closure_boundary_fingerprint: evidence.closureBoundaryFingerprint,
      supabase_match_revisions: evidence.supabaseMatchRevisions,
      google_checkpoints: evidence.googleCheckpoints,
      reason: "STEP12_CERTIFIED_CUTOVER_V2",
    };
    case "commit-authority": return {
      epoch_id: state.preparedEpochId, closure_id: state.activeClosureId,
      external_fence_evidence_id: proof.evidenceId,
      reconciliation_fingerprint: evidence.reconciliationFingerprint,
    };
    case "abort-authority": return {
      epoch_id: state.preparedEpochId, closure_id: state.activeClosureId,
      external_fence_evidence_id: proof.evidenceId,
    };
    case "abort-precommit-release": return {
      contract_version: "production-cutover-activation-v1",
      operation: "ABORT_PRODUCTION_PRECOMMIT_RELEASE",
      tournament_year: FIXED.tournamentYear,
      vercel_project: FIXED.vercelProject,
      vercel_project_id: FIXED.vercelProjectId,
      canonical_domain: FIXED.canonicalDomain,
      source_fingerprint: evidence.startSourceFingerprint,
      expected_epoch_id: state.authorityGeneration,
    };
    case "reopen-legacy-admission": return {
      closure_id: state.activeClosureId, external_fence_evidence_id: proof.evidenceId,
    };
    case "pause-supabase-ingress": return {
      expected_authority: "SUPABASE",
      start_source_fingerprint: evidence.rollbackStartSourceFingerprint,
      external_fence_evidence_id: proof.evidenceId,
    };
    case "drain-supabase-ingress": return {
      closure_id: state.activeClosureId, external_fence_evidence_id: proof.evidenceId,
    };
    case "finalize-supabase-ingress-closed": return {
      closure_id: state.activeClosureId, external_fence_evidence_id: proof.evidenceId,
      final_source_fingerprint: evidence.rollbackFinalCanonicalFingerprint,
      reconciliation_fingerprint: evidence.rollbackReconciliationFingerprint,
      lease_set_fingerprint: evidence.rollbackClosureBoundaryFingerprint,
      boundary_captured_at: evidence.rollbackBoundaryCapturedAt,
      supabase_match_revisions: evidence.rollbackSupabaseMatchRevisions,
      google_checkpoints: evidence.rollbackGoogleCheckpoints,
    };
    case "prepare-rollback": return {
      epoch_type: "ROLLBACK", closure_id: state.activeClosureId,
      external_fence_evidence_id: proof.evidenceId,
      source_fingerprint: evidence.rollbackFinalCanonicalFingerprint,
      reconciliation_fingerprint: evidence.rollbackReconciliationFingerprint,
      closure_boundary_fingerprint: evidence.rollbackClosureBoundaryFingerprint,
      supabase_match_revisions: evidence.rollbackSupabaseMatchRevisions,
      google_checkpoints: evidence.rollbackGoogleCheckpoints,
      expected_prior_source_fingerprint: evidence.finalGoogleFingerprint,
      reason: "STEP12_CERTIFIED_ROLLBACK_V2",
    };
    case "commit-rollback": return {
      epoch_id: state.preparedEpochId, closure_id: state.activeClosureId,
      external_fence_evidence_id: proof.evidenceId,
      reconciliation_fingerprint: evidence.rollbackReconciliationFingerprint,
    };
    case "workers": return { expected_epoch_id: state.authorityGeneration };
    case "odds-runtime": return {
      vercel_project_id: FIXED.vercelProjectId, canonical_domain: FIXED.canonicalDomain,
      tournament_year: FIXED.tournamentYear, worker_name: "ODDS_CALCULATION",
    };
    default: refuse("UNKNOWN_OPERATION", `Unknown operation: ${operation}`);
  }
}

function mergeOperationInput(manifest, operation, payload) {
  const input = manifest.operationInputs[operation] ?? {};
  requireObject(input, "OPERATION_INPUT_INVALID", `operationInputs.${operation}`);
  const allowed = new Set([...COMMON_INPUT_KEYS, ...(OPERATION_EXTRA_KEYS[operation] ?? [])]);
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) refuse("OPERATION_INPUT_FIELD_FORBIDDEN", `Unexpected field operationInputs.${operation}.${key}.`);
    if (AUTHORITY_SENSITIVE_FIELDS.has(key)) {
      if (!(key in payload) || canonicalJson(value) !== canonicalJson(payload[key])) {
        refuse("AUTHORITY_BINDING_OVERRIDE_FORBIDDEN",
          `operationInputs.${operation}.${key} differs from the computed authoritative binding.`);
      }
      continue;
    }
    payload[key] = clone(value);
  }
  return payload;
}

function validateRenderedPayload(operation, payload) {
  const allowed = new Set([...COMMON_INPUT_KEYS, ...(OPERATION_EXTRA_KEYS[operation] ?? [])]);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) refuse("RENDERED_PAYLOAD_FIELD_FORBIDDEN", `Rendered payload field ${key} is not allowlisted.`);
  }
  for (const [key, value] of Object.entries(payload)) {
    if (key === "request_fingerprint") continue;
    if (typeof value === "string" && unresolved(value)) {
      refuse("UNRESOLVED_PAYLOAD_PLACEHOLDER", `${key} is unresolved.`);
    }
  }
  assertNoSecrets(payload, "payload");
  assertNoPreview(payload);
}

function sqlEnvelope(rpc, payload) {
  const json = canonicalJson(payload);
  if (json.includes("$step116$")) refuse("SQL_DELIMITER_COLLISION", "Payload collides with fixed SQL delimiter.");
  return `select public.${rpc}($step116$${json}$step116$::jsonb);`;
}

export function buildOperationEnvelope(manifest, operation) {
  validateManifest(manifest);
  const definition = OPERATIONS[operation];
  if (!definition) refuse("UNKNOWN_OPERATION", `Unknown operation: ${operation}`);
  assertOperationGuard(manifest, operation);
  const base = commonPayload(manifest, operation);
  let payload = { ...base, ...operationDefaults(manifest, operation) };
  payload = mergeOperationInput(manifest, operation, payload);
  delete payload.request_fingerprint;
  const diagnosticStateGuard = {
    activationState: manifest.state.activationState,
    activationRevision: manifest.state.activationRevision,
    authorityGeneration: manifest.state.authorityGeneration,
    scoringAuthority: manifest.state.scoringAuthority,
    scoringIngressEnabled: manifest.state.scoringIngressEnabled,
    gateExecutionState: manifest.state.gateExecutionState,
    admissionState: manifest.state.admissionState,
    admissionRevision: manifest.state.admissionRevision,
    admissionGeneration: manifest.state.admissionGeneration,
    activeClosureId: manifest.state.activeClosureId,
    activeClosureKind: manifest.state.activeClosureKind,
    activeClosureStatus: manifest.state.activeClosureStatus,
    activeLegacyWriters: manifest.state.activeLegacyWriters,
    unresolvedLegacyWriters: manifest.state.unresolvedLegacyWriters,
    unresolvedOutbox: manifest.state.unresolvedOutbox,
    unresolvedArchive: manifest.state.unresolvedArchive,
    firstSupabaseCanonicalWritePossible:
      manifest.state.firstSupabaseCanonicalWritePossible,
    firstSupabaseCanonicalWriteObserved:
      manifest.state.firstSupabaseCanonicalWriteObserved,
  };
  payload.request_fingerprint = sha256Hex(canonicalJson({
    domain: "BAGGER_STEP11_6_OPERATOR_REQUEST_V2",
    operation,
    payload,
    diagnosticStateGuard,
  }));
  validateRenderedPayload(operation, payload);
  const envelope = {
    schemaVersion: FIXED.schemaVersion,
    mode: "DRY_RUN",
    executable: false,
    networkCalls: 0,
    providerSdkCalls: 0,
    credentialReads: 0,
    sqlExecutions: 0,
    operation,
    kind: definition.kind,
    rpc: definition.rpc,
    stableRequestId: payload.request_id ?? null,
    requestFingerprint: payload.request_fingerprint,
    payload,
    diagnosticStateGuard,
    sqlEnvelope: definition.rpc ? sqlEnvelope(definition.rpc, payload) : null,
    runbook: FIXED.runbook,
    warning: "REVIEW ARTIFACT ONLY — THIS TOOL DOES NOT EXECUTE OR AUTHORIZE PRODUCTION CHANGES",
  };
  envelope.envelopeFingerprint = sha256Hex(canonicalJson(envelope));
  return envelope;
}

export function computeExecutionBundleMaterialFingerprint(manifest) {
  validateManifest(manifest);
  const material = clone(manifest);
  delete material.executionReadiness;
  if (material.release) delete material.release.executionBundleFingerprintV2;
  return sha256Hex(canonicalJson({
    domain: "BAGGER_STEP12_EXECUTION_BUNDLE_V2",
    manifest: material,
  }));
}

function readJson(path) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  assertNoSecrets(parsed);
  return parsed;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  return {
    usage: [
      "operator.mjs validate --manifest <path>",
      "operator.mjs readiness --manifest <path>",
      "operator.mjs payload --manifest <path> --operation <name>",
      "operator.mjs fingerprint --manifest <path>",
      "operator.mjs operations",
    ],
    operations: Object.keys(OPERATIONS),
  };
}

export function main() {
  const command = process.argv[2];
  if (!command || command === "help" || command === "--help") {
    print(usage());
    return;
  }
  if (command === "operations") {
    print({ operations: OPERATIONS });
    return;
  }
  const manifestPath = argument("--manifest");
  if (!manifestPath) refuse("MANIFEST_PATH_REQUIRED", "--manifest <path> is required.");
  const manifest = readJson(manifestPath);
  if (command === "validate") {
    print({ ...validateManifest(manifest), executionReadiness: evaluateReadiness(manifest) });
    return;
  }
  if (command === "readiness") {
    print(evaluateReadiness(manifest));
    return;
  }
  if (command === "fingerprint") {
    print({ executionBundleMaterialFingerprintV2: computeExecutionBundleMaterialFingerprint(manifest) });
    return;
  }
  if (command === "payload") {
    const operation = argument("--operation");
    if (!operation) refuse("OPERATION_REQUIRED", "--operation <name> is required.");
    print(buildOperationEnvelope(manifest, operation));
    return;
  }
  refuse("UNKNOWN_COMMAND", `Unknown command: ${command}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      code: error.code ?? "OPERATOR_FAILURE",
      message: error.message,
      executable: false,
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
