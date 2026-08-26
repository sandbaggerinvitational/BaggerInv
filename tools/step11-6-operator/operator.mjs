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
  providerControlEndpoint: "/api/admin/step11-6-production-google-writer-fence",
  providerFenceBranch: "feature/mock-tournament-qa-integration",
  providerFenceDirector: "CB01",
  providerFenceDescription: "STEP12_GOOGLE_WRITER_PROVIDER_FENCE",
  providerFenceRemoveConfirmation: "REMOVE_STEP12_GOOGLE_WRITER_PROVIDER_FENCE",
  ownerFreezeConfirmation: "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS CUTOVER",
  quiesceScope: "PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE",
  originInventoryArtifact: "docs/evidence/step11-6-production-origin-inventory.json",
  originInventorySchema: "step11-6-production-origin-inventory-v2",
  originInventoryCount: 1140,
  originInventoryFingerprint: "533178a28a5458c5f2f727b77af3024de4cc0402c49e90dcd763b950d26fb4c6",
  credentialConfinementArtifact:
    "docs/evidence/step11-6-production-google-credential-confinement.json",
  credentialConfinementSchema:
    "step11-6-production-google-credential-confinement-v1",
  credentialConfinementRecordCount: 1140,
  credentialConfinementRecordsFingerprint:
    "c63962703a60745786ffce2e43e9fef5fa38e12746fce5627f33bfde92c8f508",
  credentialConfinementEvidenceFingerprint:
    "1d6f4203fc56226ba4f6881339e9b2dfcede0e413485a110785d28e066a569df",
  requiredPriorLiveDeploymentId: "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
  requiredFrozenStep11DeploymentId: "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
  reviewedPostCaptureDeploymentCount: 5,
  reviewedPostCaptureDeploymentFingerprint:
    "9262c1d4edc14259d442c29aa25d04f90b21961ed2124d422e6f77b4e3e49c00",
  minimumLiveOriginInventoryCount: 1140 + 5 + 1,
  quiesceFixedAliasOriginCount: 4,
  quiesceCandidateAliasOriginCount: 1,
  quiesceProbeVectorCount: 9,
  migrationName:
    "202608260036_production_reviewed_post_capture_preview_deployments_v2.sql",
  runbook: "docs/step12-production-cutover-runbook-v2.md",
});

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{8,64}$/;
const TEAM_ID = /^team_[A-Za-z0-9]{8,80}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const SAFE_PROVIDER_ID = /^[A-Za-z0-9._:-]{3,200}$/;
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
  "quiesce_evidence_id", "provider_fence_id", "provider_fence_verification_id",
  "deployment_scope_fingerprint", "google_credential_scope_fingerprint",
  "writer_coverage_fingerprint", "legacy_lease_set_fingerprint",
  "supabase_match_revisions", "google_checkpoints", "boundary_captured_at",
  "captured_at", "stable_readback_count",
]);

const PROVIDER_ACTIONS = new Set([
  "issue-begin-provider-attestation-challenge",
  "inspect-begin-provider-attestation-challenge",
  "issue-finalize-provider-attestation-challenge",
  "inspect-finalize-provider-attestation-challenge",
  "begin-provider-quiesce",
  "finalize-provider-quiesce",
  "inspect-provider-quiesce",
  "install-persistent-provider-fence",
  "inspect-persistent-provider-fence",
  "refresh-persistent-provider-fence",
  "remove-persistent-provider-fence",
]);

const PROVIDER_READ_ONLY_ACTIONS = new Set([
  "inspect-begin-provider-attestation-challenge",
  "inspect-finalize-provider-attestation-challenge",
  "inspect-provider-quiesce",
  "inspect-persistent-provider-fence",
]);

const OWNER_AUTHORIZATION_EXEMPT = new Set([
  "inspect",
  "inspect-begin-provider-attestation-challenge",
  "inspect-finalize-provider-attestation-challenge",
  "inspect-provider-quiesce",
  "inspect-persistent-provider-fence",
  "capture-final-google-fingerprint",
]);

const PERSISTENT_FENCE_REQUIRED_OPERATIONS = new Set([
  "record-provider-fence", "refresh-provider-fence",
  "close-legacy-admission", "drain-legacy-admission",
  "capture-final-google-fingerprint", "finalize-legacy-closed",
  "prepare-authority", "commit-authority", "abort-authority",
  "reopen-legacy-admission", "pause-supabase-ingress",
  "drain-supabase-ingress", "finalize-supabase-ingress-closed",
  "prepare-rollback", "commit-rollback", "workers", "odds-runtime",
]);

const PROVIDER_ACTION_INPUT_KEYS = Object.freeze({
  "issue-begin-provider-attestation-challenge": [
    "action", "operationRequestId", "challengeRequestId", "evidenceRequestId",
    "providerAttestationStage", "expectedCommitSha", "expectedWorkbookId",
    "expectedBranch", "expectedDirectorPlayerId", "quiescePurpose", "routingRule",
  ],
  "inspect-begin-provider-attestation-challenge": [
    "action", "operationRequestId", "evidenceRequestId", "providerAttestationStage",
    "providerChallengeId", "expectedCommitSha", "expectedWorkbookId",
    "expectedBranch", "expectedDirectorPlayerId", "quiescePurpose", "routingRule",
  ],
  "issue-finalize-provider-attestation-challenge": [
    "action", "operationRequestId", "challengeRequestId", "evidenceRequestId",
    "providerAttestationStage", "expectedCommitSha", "expectedWorkbookId",
    "expectedBranch", "expectedDirectorPlayerId", "quiescePurpose", "routingRule",
  ],
  "inspect-finalize-provider-attestation-challenge": [
    "action", "operationRequestId", "evidenceRequestId", "providerAttestationStage",
    "providerChallengeId", "expectedCommitSha", "expectedWorkbookId",
    "expectedBranch", "expectedDirectorPlayerId", "quiescePurpose", "routingRule",
  ],
  "begin-provider-quiesce": [
    "action", "operationRequestId", "expectedCommitSha", "expectedWorkbookId",
    "expectedBranch", "expectedDirectorPlayerId", "quiescePurpose", "evidenceRequestId",
    "priorEvidenceId", "routingRule", "ownerOverrideOperationallyFrozen",
    "ownerFreezeConfirmation", "ownerFreezeTtlSeconds", "challengeRequestId",
    "providerAttestationStage", "providerChallengeId",
    "providerAttestationConsumeRequestId", "providerAttestation",
  ],
  "finalize-provider-quiesce": [
    "action", "operationRequestId", "expectedCommitSha", "expectedWorkbookId",
    "expectedBranch", "expectedDirectorPlayerId", "quiescePurpose", "evidenceRequestId",
    "quiesceEvidenceId", "priorEvidenceId", "routingRule", "challengeRequestId",
    "providerAttestationStage", "providerChallengeId",
    "providerAttestationConsumeRequestId", "providerAttestation",
  ],
  "inspect-provider-quiesce": [
    "action", "operationRequestId", "expectedCommitSha", "expectedWorkbookId",
    "expectedBranch", "expectedDirectorPlayerId", "quiescePurpose", "evidenceRequestId",
    "quiesceEvidenceId",
  ],
  "install-persistent-provider-fence": [
    "action", "operationRequestId", "installRequestId", "quiesceEvidenceId",
    "expectedCommitSha", "expectedWorkbookId", "expectedBranch",
    "expectedDirectorPlayerId", "expectedBaselineFingerprint",
    "expectedCanonicalValueFingerprint", "confirmation",
  ],
  "inspect-persistent-provider-fence": [
    "action", "operationRequestId", "installRequestId", "fenceId",
    "currentVerificationId", "expectedCommitSha", "expectedWorkbookId",
    "expectedBranch", "expectedDirectorPlayerId",
  ],
  "refresh-persistent-provider-fence": [
    "action", "operationRequestId", "installRequestId", "fenceId",
    "currentVerificationId", "quiesceEvidenceId", "expectedCommitSha",
    "expectedWorkbookId", "expectedBranch", "expectedDirectorPlayerId",
  ],
  "remove-persistent-provider-fence": [
    "action", "operationRequestId", "installRequestId", "fenceId",
    "currentVerificationId", "quiesceEvidenceId", "expectedCommitSha",
    "expectedWorkbookId", "expectedBranch", "expectedDirectorPlayerId",
    "confirmation",
  ],
});

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
    "legacy_lease_count", "legacy_deployments_fenced", "legacy_google_credentials_fenced",
    "non_owner_manual_google_scoring_fenced", "owner_override_operationally_frozen",
    "quiesce_evidence_id", "provider_fence_id", "provider_fence_verification_id",
  ],
  "refresh-provider-fence": [
    "operation", "prior_external_fence_evidence_id", "closure_id", "captured_at",
    "provider_evidence_fingerprint", "deployment_scope_fingerprint",
    "google_credential_scope_fingerprint", "writer_coverage_fingerprint",
    "legacy_lease_set_fingerprint", "legacy_lease_count",
    "legacy_deployments_fenced", "legacy_google_credentials_fenced",
    "non_owner_manual_google_scoring_fenced", "owner_override_operationally_frozen",
    "quiesce_evidence_id", "provider_fence_id", "provider_fence_verification_id",
  ],
  "close-legacy-admission": [
    "expected_authority", "start_source_fingerprint", "external_fence_evidence_id",
    "quiesce_evidence_id", "provider_fence_id", "provider_fence_verification_id",
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
    "quiesce_evidence_id", "provider_fence_id", "provider_fence_verification_id",
  ],
  "commit-authority": [
    "epoch_id", "closure_id", "external_fence_evidence_id",
    "reconciliation_fingerprint", "quiesce_evidence_id", "provider_fence_id",
    "provider_fence_verification_id",
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
  "issue-begin-provider-attestation-challenge": {
    kind: "provider-action-payload", rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: ["issue_production_vercel_provider_attestation_challenge"],
  },
  "inspect-begin-provider-attestation-challenge": {
    kind: "provider-read-only-payload", rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: ["inspect_production_vercel_provider_attestation_challenge"],
  },
  "issue-finalize-provider-attestation-challenge": {
    kind: "provider-action-payload", rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: ["issue_production_vercel_provider_attestation_challenge"],
  },
  "inspect-finalize-provider-attestation-challenge": {
    kind: "provider-read-only-payload", rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: ["inspect_production_vercel_provider_attestation_challenge"],
  },
  "begin-provider-quiesce": {
    kind: "provider-action-payload",
    rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: ["begin_production_vercel_writer_quiesce_evidence"],
  },
  "finalize-provider-quiesce": {
    kind: "provider-action-payload",
    rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: ["finalize_production_vercel_writer_quiesce_evidence"],
  },
  "inspect-provider-quiesce": {
    kind: "provider-read-only-payload",
    rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: ["inspect_production_vercel_writer_quiesce_evidence"],
  },
  "install-persistent-provider-fence": {
    kind: "provider-action-payload",
    rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: [
      "begin_production_google_writer_provider_fence_install",
      "finish_production_google_writer_provider_fence_install",
    ],
  },
  "inspect-persistent-provider-fence": {
    kind: "provider-read-only-payload",
    rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: ["inspect_production_google_writer_provider_fence"],
  },
  "refresh-persistent-provider-fence": {
    kind: "provider-action-payload",
    rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: ["refresh_production_google_writer_provider_fence"],
  },
  "remove-persistent-provider-fence": {
    kind: "provider-action-payload",
    rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: [
      "authorize_production_google_writer_provider_fence_removal",
      "finish_production_google_writer_provider_fence_removal",
    ],
  },
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

const codepointCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function exactObjectKeys(value, expected) {
  return plain(value) &&
    Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function exactProductionOrigin(value) {
  try {
    const parsed = new URL(requireString(
      value,
      "ORIGIN_INVENTORY_ARTIFACT_INVALID",
      "origin inventory record origin",
    ));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        !["", "/"].includes(parsed.pathname) || parsed.search || parsed.hash ||
        !parsed.hostname.toLowerCase().endsWith(".vercel.app")) return null;
    return `https://${parsed.hostname.toLowerCase()}`;
  } catch (error) {
    if (error instanceof OperatorRefusalError) throw error;
    return null;
  }
}

let retainedOriginInventoryBinding;
let retainedOriginInventoryOrigins;
let credentialConfinementBinding;

/**
 * Revalidate the repository-retained 1,140-record inventory without ever copying
 * the records into a browser/provider envelope. The application route repeats
 * this validation server-side and supplies the immutable inventory to the DB.
 */
export function productionOriginInventoryBinding() {
  if (retainedOriginInventoryBinding) return retainedOriginInventoryBinding;
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(new URL(
      "../../docs/evidence/step11-6-production-origin-inventory.json",
      import.meta.url,
    ), "utf8"));
  } catch {
    refuse("ORIGIN_INVENTORY_ARTIFACT_UNAVAILABLE",
      "The retained Production deployment inventory could not be loaded.");
  }
  const recordTuple = [
    "deploymentId", "sha", "origin", "scopeClass", "deploymentStatus",
    "sourceProvenance",
  ];
  const scopeClasses = {
    MAIN_PRODUCTION: {
      branch: "main", deploymentEnvironment: "PRODUCTION",
      credentialCapabilities: [
        "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0", "PRODUCTION_WORKBOOK_SELECTOR",
      ],
    },
    FEATURE_PREVIEW: {
      branch: "feature/mock-tournament-qa-integration",
      deploymentEnvironment: "PREVIEW",
      credentialCapabilities: [
        "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
        "POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
        "POTENTIAL_PRODUCTION_WORKBOOK_SELECTOR",
      ],
    },
  };
  const statusSemantics = {
    READY: { publiclyReachable: true, writerCapable: true },
    ERROR: { publiclyReachable: false, writerCapable: false },
    BLOCKED: { publiclyReachable: false, writerCapable: false },
  };
  const paginationEvidence = {
    productionTarget: {
      recordCount: 458, complete: true, remainingLoadMore: false,
    },
    candidateBranchPreview: {
      recordCount: 682, complete: true, remainingLoadMore: false,
    },
  };
  const requiredDeployments = {
    priorLive: FIXED.requiredPriorLiveDeploymentId,
    frozenStep11: FIXED.requiredFrozenStep11DeploymentId,
  };
  if (!exactObjectKeys(artifact, [
    "schemaVersion", "vercelProjectId", "capturedAt", "recordTuple",
    "scopeClasses", "statusSemantics", "paginationEvidence", "recordCount",
    "recordsFingerprint", "requiredDeployments", "records",
  ]) || artifact.schemaVersion !== FIXED.originInventorySchema ||
      artifact.vercelProjectId !== FIXED.vercelProjectId ||
      Number.isNaN(Date.parse(artifact.capturedAt)) ||
      !/[zZ]|[+-]\d\d:\d\d$/.test(String(artifact.capturedAt || "")) ||
      canonicalJson(artifact.recordTuple) !== canonicalJson(recordTuple) ||
      canonicalJson(artifact.scopeClasses) !== canonicalJson(scopeClasses) ||
      canonicalJson(artifact.statusSemantics) !== canonicalJson(statusSemantics) ||
      canonicalJson(artifact.paginationEvidence) !== canonicalJson(paginationEvidence) ||
      canonicalJson(artifact.requiredDeployments) !== canonicalJson(requiredDeployments) ||
      artifact.recordCount !== FIXED.originInventoryCount ||
      artifact.recordsFingerprint !== FIXED.originInventoryFingerprint ||
      !Array.isArray(artifact.records) ||
      artifact.records.length !== FIXED.originInventoryCount) {
    refuse("ORIGIN_INVENTORY_ARTIFACT_INVALID",
      "The retained Production deployment inventory header is invalid.");
  }
  const records = artifact.records.map((record, index) => {
    if (!Array.isArray(record) || record.length !== recordTuple.length) {
      refuse("ORIGIN_INVENTORY_ARTIFACT_INVALID",
        `Origin inventory record ${index} is not an exact six-field tuple.`);
    }
    const [rawDeploymentId, rawSha, rawOrigin, rawScopeClass,
      rawDeploymentStatus, rawSourceProvenance] = record;
    const deploymentId = requireString(rawDeploymentId,
      "ORIGIN_INVENTORY_ARTIFACT_INVALID", `origin inventory record ${index}.deploymentId`);
    const sha = rawSha === null ? null : String(rawSha).toLowerCase();
    const origin = exactProductionOrigin(rawOrigin);
    const scopeClass = String(rawScopeClass || "");
    const deploymentStatus = String(rawDeploymentStatus || "");
    const sourceProvenance = String(rawSourceProvenance || "");
    const scope = scopeClasses[scopeClass];
    const status = statusSemantics[deploymentStatus];
    const shaUnavailable = sourceProvenance === "VERCEL_CLI_SHA_UNAVAILABLE";
    if (!DEPLOYMENT_ID.test(deploymentId) ||
        (sha === null ? !shaUnavailable : !HEX40.test(sha) || shaUnavailable) ||
        !origin || !scope || !status ||
        !new Set(["GIT", "REDEPLOY_INHERITED_GIT", "VERCEL_API_RESOLVED_GIT",
          "VERCEL_CLI_SHA_UNAVAILABLE"])
          .has(sourceProvenance) ||
        (scopeClass === "MAIN_PRODUCTION" &&
          (deploymentStatus !== "READY" || sourceProvenance !== "GIT"))) {
      refuse("ORIGIN_INVENTORY_ARTIFACT_INVALID",
        `Origin inventory record ${index} is outside the frozen Production scope.`);
    }
    return {
      deploymentId, sha, origin, scopeClass, deploymentStatus, sourceProvenance,
      branch: scope.branch,
      deploymentEnvironment: scope.deploymentEnvironment,
      credentialCapabilities: [...scope.credentialCapabilities],
      publiclyReachable: status.publiclyReachable,
      writerCapable: status.writerCapable,
    };
  });
  const sorted = [...records].sort((left, right) =>
    codepointCompare(`${left.deploymentId}\n${left.origin}`,
      `${right.deploymentId}\n${right.origin}`));
  const keys = records.map((record) => `${record.deploymentId}\n${record.origin}`);
  const nullShaCount = records.filter((record) => record.sha === null).length;
  const mainProductionCount = records.filter((record) =>
    record.scopeClass === "MAIN_PRODUCTION").length;
  const featurePreviewCount = records.filter((record) =>
    record.scopeClass === "FEATURE_PREVIEW").length;
  const requiredTuples = [
    [
      "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
      "561a61946be3536c7e32b46be53e4683cbb45579",
      "https://bagger-drmix94o0-sandbagger-invitational.vercel.app",
      "MAIN_PRODUCTION", "READY", "GIT",
    ],
    [
      "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
      "be5531faca009e26617496e47831f365a1b4997b",
      "https://bagger-mribo6cqh-sandbagger-invitational.vercel.app",
      "FEATURE_PREVIEW", "READY", "GIT",
    ],
  ];
  if (records.some((record, index) =>
        keys[index] !== `${sorted[index].deploymentId}\n${sorted[index].origin}`) ||
      new Set(keys).size !== records.length ||
      nullShaCount !== 1 || mainProductionCount !== 458 ||
      featurePreviewCount !== 682 ||
      !records.some((record) =>
        record.deploymentId === FIXED.requiredPriorLiveDeploymentId) ||
      !records.some((record) =>
        record.deploymentId === FIXED.requiredFrozenStep11DeploymentId) ||
      requiredTuples.some((required) => !artifact.records.some((tuple) =>
        canonicalJson(tuple) === canonicalJson(required))) ||
      sha256Hex(JSON.stringify(artifact.records)) !== FIXED.originInventoryFingerprint) {
    refuse("ORIGIN_INVENTORY_ARTIFACT_INVALID",
      "The retained Production deployment inventory does not match its immutable digest.");
  }
  retainedOriginInventoryBinding = Object.freeze({
    artifact: FIXED.originInventoryArtifact,
    schemaVersion: artifact.schemaVersion,
    vercelProjectId: artifact.vercelProjectId,
    capturedAt: requireTimestamp(artifact.capturedAt,
      "ORIGIN_INVENTORY_ARTIFACT_INVALID", "origin inventory capturedAt"),
    recordCount: records.length,
    recordsFingerprint: artifact.recordsFingerprint,
    mainProductionCount,
    featurePreviewCount,
    nullShaCount,
    requiredDeployments: Object.freeze({ ...requiredDeployments }),
    paginationComplete: true,
    reviewedPostCaptureDeploymentCount:
      FIXED.reviewedPostCaptureDeploymentCount,
    reviewedPostCaptureDeploymentFingerprint:
      FIXED.reviewedPostCaptureDeploymentFingerprint,
    minimumLiveOriginInventoryCount: records.length +
      FIXED.reviewedPostCaptureDeploymentCount + 1,
    fixedAliasOriginCount: FIXED.quiesceFixedAliasOriginCount,
    candidateAliasOriginCount: FIXED.quiesceCandidateAliasOriginCount,
    probeVectorCount: FIXED.quiesceProbeVectorCount,
  });
  retainedOriginInventoryOrigins = new Set(records.map((record) => record.origin));
  return retainedOriginInventoryBinding;
}

export function productionCredentialConfinementBinding() {
  if (credentialConfinementBinding) return credentialConfinementBinding;
  const origin = productionOriginInventoryBinding();
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(new URL(
      "../../docs/evidence/step11-6-production-google-credential-confinement.json",
      import.meta.url,
    ), "utf8"));
  } catch {
    refuse("CREDENTIAL_CONFINEMENT_ARTIFACT_UNAVAILABLE",
      "The Production Google credential-confinement artifact could not be loaded.");
  }
  const { evidenceFingerprint, ...base } = artifact;
  const classifications = artifact.classifications;
  const classificationTotal = plain(classifications)
    ? Object.values(classifications).reduce((total, value) =>
      total + Number(value?.recordCount || 0), 0) : 0;
  if (!exactObjectKeys(artifact, [
    "schemaVersion", "originInventorySchemaVersion", "originInventoryRecordCount",
    "originInventoryFingerprint", "classificationRecordTuple",
    "classificationRecordCount", "classificationRecordsFingerprint",
    "markerPatterns", "gitObjectAudit", "classifications",
    "markerBearingPreviewPathSummary", "canonicalMutationRouteAudit",
    "environmentScopeContract", "dynamicCandidateContract", "evidenceFingerprint",
  ]) || artifact.schemaVersion !== FIXED.credentialConfinementSchema ||
      artifact.originInventoryRecordCount !== origin.recordCount ||
      artifact.originInventoryFingerprint !== origin.recordsFingerprint ||
      artifact.classificationRecordCount !== FIXED.credentialConfinementRecordCount ||
      artifact.classificationRecordsFingerprint !==
        FIXED.credentialConfinementRecordsFingerprint ||
      evidenceFingerprint !== FIXED.credentialConfinementEvidenceFingerprint ||
      sha256Hex(JSON.stringify(base)) !== evidenceFingerprint ||
      classificationTotal !== FIXED.credentialConfinementRecordCount ||
      artifact.gitObjectAudit?.missingCommitCount !== 0 ||
      artifact.canonicalMutationRouteAudit?.dedicatedWriterMarkerMatchCount !== 0 ||
      artifact.dynamicCandidateContract?.arbitraryMainProductionAdditionAllowed !== false ||
      artifact.dynamicCandidateContract?.differentShaAdditionAllowed !== false ||
      artifact.environmentScopeContract
        ?.duplicateUnscopedDedicatedPreviewRecordAllowed !== false) {
    refuse("CREDENTIAL_CONFINEMENT_ARTIFACT_INVALID",
      "The Production Google credential-confinement artifact was invalid.");
  }
  credentialConfinementBinding = Object.freeze({
    artifact: FIXED.credentialConfinementArtifact,
    schemaVersion: artifact.schemaVersion,
    recordCount: artifact.classificationRecordCount,
    recordsFingerprint: artifact.classificationRecordsFingerprint,
    evidenceFingerprint,
  });
  return credentialConfinementBinding;
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
  requireBoolean(execution.step12OwnerAuthorizationRecorded,
    "EXECUTION_POLICY_REQUIRED", "execution.step12OwnerAuthorizationRecorded");
}

function validateResources(manifest) {
  const resources = requireObject(manifest.resources, "RESOURCE_SCOPE_REQUIRED", "resources");
  requireEqual(resources.environment, FIXED.environment, "WRONG_ENVIRONMENT", "resources.environment");
  requireEqual(resources.projectRef, FIXED.projectRef, "WRONG_PROJECT", "resources.projectRef");
  requireEqual(resources.projectUrl, FIXED.projectUrl, "WRONG_PROJECT", "resources.projectUrl");
  requireEqual(resources.previewProjectRef, FIXED.previewProjectRef, "PREVIEW_SENTINEL_MISSING", "resources.previewProjectRef");
  requireEqual(resources.sourceWorkbookId, FIXED.sourceWorkbookId, "WRONG_WORKBOOK", "resources.sourceWorkbookId");
  requireEqual(resources.vercelProjectId, FIXED.vercelProjectId, "WRONG_VERCEL_PROJECT", "resources.vercelProjectId");
  const vercelTeamId = requireString(resources.vercelTeamId,
    "WRONG_VERCEL_TEAM", "resources.vercelTeamId");
  if (!unresolved(vercelTeamId) && !TEAM_ID.test(vercelTeamId)) {
    refuse("WRONG_VERCEL_TEAM", "resources.vercelTeamId was not an exact Vercel team ID.");
  }
  requireEqual(resources.vercelProject, FIXED.vercelProject, "WRONG_VERCEL_PROJECT", "resources.vercelProject");
  requireEqual(resources.canonicalDomain, FIXED.canonicalDomain, "WRONG_DOMAIN", "resources.canonicalDomain");
  requireEqual(resources.tournamentId, FIXED.tournamentId, "WRONG_TOURNAMENT", "resources.tournamentId");
  requireEqual(resources.tournamentYear, FIXED.tournamentYear, "WRONG_TOURNAMENT", "resources.tournamentYear");
  requireEqual(resources.oddsPublicationAuthority, FIXED.oddsPublicationAuthority,
    "ODDS_PUBLICATION_AUTHORITY_DRIFT", "resources.oddsPublicationAuthority");
}

function assertRoutingRuleShape(rule, { resolved = false } = {}) {
  requireObject(rule, "PROVIDER_QUIESCE_RULE_REQUIRED", "providerQuiesceEvidence.routingRule");
  if (!exactObjectKeys(rule, [
    "projectId", "ruleId", "revision", "scope", "projectWide", "action",
    "requestPathOperator", "requestPath", "methodOperator", "methods",
  ])) {
    refuse("PROVIDER_QUIESCE_RULE_INVALID",
      "providerQuiesceEvidence.routingRule must have the exact reviewed field set.");
  }
  requireEqual(rule.projectId, FIXED.vercelProjectId,
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.projectId");
  requireEqual(rule.scope, FIXED.quiesceScope,
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.scope");
  requireEqual(rule.projectWide, true,
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.projectWide");
  requireEqual(rule.action, "DENY",
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.action");
  requireEqual(rule.requestPathOperator, "DOES_NOT_EQUAL",
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.requestPathOperator");
  requireEqual(rule.requestPath, FIXED.providerControlEndpoint,
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.requestPath");
  requireEqual(rule.methodOperator, "IS_NOT_ANY_OF",
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.methodOperator");
  requireEqual(canonicalJson(rule.methods), canonicalJson(["GET", "HEAD", "OPTIONS"]),
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.methods");
  for (const field of ["ruleId", "revision"]) {
    const value = requireString(rule[field], "PROVIDER_QUIESCE_RULE_INVALID",
      `providerQuiesceEvidence.routingRule.${field}`);
    if (resolved && (unresolved(value) || !SAFE_PROVIDER_ID.test(value))) {
      refuse("PROVIDER_QUIESCE_RULE_INVALID",
        `providerQuiesceEvidence.routingRule.${field} is unresolved or invalid.`);
    }
  }
  return rule;
}

function validateStructuredProviderEvidence(manifest) {
  for (const [path, value] of [
    ["providerFenceRehearsal", manifest.providerFenceRehearsal],
    ["providerFenceProof", manifest.providerFenceProof],
  ]) {
    if (plain(value) && (Object.prototype.hasOwnProperty.call(value, "originMatrix") ||
        Object.prototype.hasOwnProperty.call(value, "originMatrixFingerprint"))) {
      refuse("CALLER_ORIGIN_MATRIX_FORBIDDEN",
        `${path} must bind the server-derived exact origin scope, not a caller matrix.`);
    }
  }
  const quiesce = requireObject(manifest.providerQuiesceEvidence,
    "PROVIDER_QUIESCE_EVIDENCE_REQUIRED", "providerQuiesceEvidence");
  if (!new Set(["MISSING", "DRAINING", "VERIFIED", "FAILED", "EXPIRED"])
    .has(quiesce.status)) {
    refuse("PROVIDER_QUIESCE_STATUS_INVALID",
      "providerQuiesceEvidence.status is outside the durable evidence states.");
  }
  assertRoutingRuleShape(quiesce.routingRule);
  requireEqual(quiesce.originInventoryArtifact, FIXED.originInventoryArtifact,
    "ORIGIN_INVENTORY_BINDING_DRIFT", "providerQuiesceEvidence.originInventoryArtifact");
  requireEqual(quiesce.originInventoryCount, FIXED.originInventoryCount,
    "ORIGIN_INVENTORY_BINDING_DRIFT", "providerQuiesceEvidence.originInventoryCount");
  requireEqual(quiesce.originInventoryFingerprint, FIXED.originInventoryFingerprint,
    "ORIGIN_INVENTORY_BINDING_DRIFT", "providerQuiesceEvidence.originInventoryFingerprint");
  const credentialConfinement = productionCredentialConfinementBinding();
  requireEqual(quiesce.credentialConfinementArtifact,
    credentialConfinement.artifact, "CREDENTIAL_CONFINEMENT_BINDING_DRIFT",
    "providerQuiesceEvidence.credentialConfinementArtifact");
  requireEqual(quiesce.credentialConfinementSchema,
    credentialConfinement.schemaVersion, "CREDENTIAL_CONFINEMENT_BINDING_DRIFT",
    "providerQuiesceEvidence.credentialConfinementSchema");
  requireEqual(quiesce.credentialConfinementRecordCount,
    credentialConfinement.recordCount, "CREDENTIAL_CONFINEMENT_BINDING_DRIFT",
    "providerQuiesceEvidence.credentialConfinementRecordCount");
  requireEqual(quiesce.credentialConfinementRecordsFingerprint,
    credentialConfinement.recordsFingerprint, "CREDENTIAL_CONFINEMENT_BINDING_DRIFT",
    "providerQuiesceEvidence.credentialConfinementRecordsFingerprint");
  requireEqual(quiesce.credentialConfinementEvidenceFingerprint,
    credentialConfinement.evidenceFingerprint, "CREDENTIAL_CONFINEMENT_BINDING_DRIFT",
    "providerQuiesceEvidence.credentialConfinementEvidenceFingerprint");
  for (const field of [
    "liveOriginInventoryCount", "probeOriginCount", "probeVectorCount", "probeRecordCount",
    "unresolvedRequestLogCount", "unresolvedGoogleWriteCount",
    "unresolvedProbeCount", "ownerFreezeTtlSeconds",
  ]) requireInteger(quiesce[field], "PROVIDER_QUIESCE_EVIDENCE_INVALID",
    `providerQuiesceEvidence.${field}`);
  if (["DRAINING", "VERIFIED"].includes(quiesce.status)) {
    requireResolved(quiesce.liveOriginInventoryFingerprint, HEX64,
      "PROVIDER_QUIESCE_LIVE_INVENTORY_REQUIRED",
      "providerQuiesceEvidence.liveOriginInventoryFingerprint");
    if (quiesce.liveOriginInventoryCount < FIXED.minimumLiveOriginInventoryCount ||
        quiesce.probeOriginCount !== quiesce.liveOriginInventoryCount +
          FIXED.quiesceFixedAliasOriginCount +
          FIXED.quiesceCandidateAliasOriginCount) {
      refuse("PROVIDER_QUIESCE_ORIGIN_COVERAGE_INCOMPLETE",
        "The probe origin count did not derive from the signed live inventory.");
    }
    requireEqual(quiesce.probeVectorCount, FIXED.quiesceProbeVectorCount,
      "PROVIDER_QUIESCE_VECTOR_COVERAGE_INCOMPLETE",
      "providerQuiesceEvidence.probeVectorCount");
    requireEqual(quiesce.probeRecordCount,
      quiesce.probeOriginCount * quiesce.probeVectorCount,
      "PROVIDER_QUIESCE_VECTOR_COVERAGE_INCOMPLETE",
      "providerQuiesceEvidence.probeRecordCount");
  }
  if (quiesce.ownerFreezeTtlSeconds !== 1800) {
    refuse("PROVIDER_QUIESCE_OWNER_FREEZE_TTL_INVALID",
      "providerQuiesceEvidence.ownerFreezeTtlSeconds must be the certified 1800-second window.");
  }
  for (const field of ["ownerOverrideOperationallyFrozen", "allOriginsEdgeDenied"]) {
    requireBoolean(quiesce[field], "PROVIDER_QUIESCE_EVIDENCE_INVALID",
      `providerQuiesceEvidence.${field}`);
  }

  const fence = requireObject(manifest.persistentProviderFence,
    "PERSISTENT_PROVIDER_FENCE_REQUIRED", "persistentProviderFence");
  if (!new Set([
    "MISSING", "INSTALLING", "INSTALLED", "REMOVAL_AUTHORIZED", "REMOVED", "FAILED",
  ]).has(fence.status)) {
    refuse("PERSISTENT_PROVIDER_FENCE_STATUS_INVALID",
      "persistentProviderFence.status is outside the durable fence states.");
  }
  requireInteger(fence.protectionCount,
    "PERSISTENT_PROVIDER_FENCE_INVALID", "persistentProviderFence.protectionCount");
  productionOriginInventoryBinding();
  productionCredentialConfinementBinding();
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
  requireObject(manifest.providerFenceRehearsal,
    "PROVIDER_FENCE_REHEARSAL_REQUIRED", "providerFenceRehearsal");
  validateStructuredProviderEvidence(manifest);
  requireObject(manifest.providerAttestationChallenges,
    "PROVIDER_ATTESTATION_CHALLENGES_REQUIRED", "providerAttestationChallenges");
  requireObject(manifest.providerAttestationChallenges.begin,
    "PROVIDER_ATTESTATION_CHALLENGES_REQUIRED", "providerAttestationChallenges.begin");
  requireObject(manifest.providerAttestationChallenges.finalize,
    "PROVIDER_ATTESTATION_CHALLENGES_REQUIRED", "providerAttestationChallenges.finalize");
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

export function evaluateReadiness(manifest) {
  const blockers = [];
  try { validateManifest(manifest); } catch (error) {
    blockers.push(`${error.code ?? "INVALID_MANIFEST"}: ${error.message}`);
    return { ready: false, blockers };
  }
  const release = manifest.release;
  const certification = manifest.certification;
  const rehearsal = manifest.providerFenceRehearsal;
  const state = manifest.state;

  for (const [field, pattern] of [
    ["candidateSha", HEX40], ["frozenSha", HEX40], ["certificationFingerprint", HEX64],
    ["environmentDeltaFingerprintV2", HEX64], ["executionBundleFingerprintV2", HEX64],
    ["providerAttestationSignerKeyFingerprint", HEX64],
    ["providerAttestationEnvironmentScopeFingerprint", HEX64],
    ["credentialConfinementRecordsFingerprint", HEX64],
    ["credentialConfinementEvidenceFingerprint", HEX64],
    ["migrationSha256", HEX64],
  ]) {
    if (unresolved(release[field]) || !pattern.test(String(release[field]).toLowerCase())) {
      blockers.push(`release.${field} is unresolved`);
    }
  }
  if (!unresolved(release.candidateSha) && !unresolved(release.frozenSha) && release.candidateSha !== release.frozenSha) {
    blockers.push("release.candidateSha does not equal release.frozenSha");
  }
  if (release.credentialConfinementSchema !== FIXED.credentialConfinementSchema ||
      release.credentialConfinementRecordCount !==
        FIXED.credentialConfinementRecordCount ||
      release.credentialConfinementRecordsFingerprint !==
        FIXED.credentialConfinementRecordsFingerprint ||
      release.credentialConfinementEvidenceFingerprint !==
        FIXED.credentialConfinementEvidenceFingerprint) {
    blockers.push("release credential-confinement binding is not exact");
  }
  if (unresolved(release.deploymentId) || !DEPLOYMENT_ID.test(String(release.deploymentId))) {
    blockers.push("release.deploymentId is unresolved");
  }
  if (unresolved(manifest.resources.vercelTeamId) ||
      !TEAM_ID.test(String(manifest.resources.vercelTeamId))) {
    blockers.push("resources.vercelTeamId is unresolved");
  }
  for (const key of [
    "migrationInstalledDormant", "focusedTestsPassed", "criticalTestsPassed",
    "productionBuildPassed", "nonAuthoritativeCandidateReady", "previewIsolationPassed",
    "oldHostEnforcementPassed", "dedicatedCredentialConfinementPassed",
  ]) {
    if (certification[key] !== true) blockers.push(`certification.${key} is not true`);
  }
  if (certification.unexplainedConcurrencyWindows !== 0) blockers.push("unexplained concurrency windows are non-zero");
  if (certification.clientSecretExposures !== 0) blockers.push("client secret exposures are non-zero");
  if (rehearsal.status !== "PASSED_RESTORED") {
    blockers.push("provider fence rehearsal status is not PASSED_RESTORED");
  }
  for (const key of [
    "exactOldHostProviderFence", "allProductionCapableOriginsControlled",
    "legacyDeploymentsFenced", "googleCredentialsSeparated",
    "nonOwnerManualGoogleScoringFenced", "ownerOverrideOperationallyFrozen",
    "dedicatedWriterRetainedAccess", "legacyWriterDenied", "noDataValueWrites",
    "providerBaselineRestored", "previewResourcesAbsent",
  ]) {
    if (rehearsal[key] !== true) blockers.push(`providerFenceRehearsal.${key} is not true`);
  }
  for (const key of [
    "baselineFingerprint", "fencedFingerprint", "restoredFingerprint",
    "deploymentScopeFingerprint", "googleCredentialScopeFingerprint",
    "writerCoverageFingerprint", "probeScopeFingerprint",
  ]) {
    if (unresolved(rehearsal[key]) || !HEX64.test(String(rehearsal[key]).toLowerCase())) {
      blockers.push(`providerFenceRehearsal.${key} is unresolved`);
    }
  }
  if (rehearsal.originInventoryCount !== FIXED.originInventoryCount) {
    blockers.push("providerFenceRehearsal.originInventoryCount is not exact");
  }
  if (rehearsal.originInventoryFingerprint !== FIXED.originInventoryFingerprint) {
    blockers.push("providerFenceRehearsal.originInventoryFingerprint is not exact");
  }
  if (rehearsal.credentialConfinementSchema !== FIXED.credentialConfinementSchema ||
      rehearsal.credentialConfinementRecordCount !==
        FIXED.credentialConfinementRecordCount ||
      rehearsal.credentialConfinementRecordsFingerprint !==
        FIXED.credentialConfinementRecordsFingerprint ||
      rehearsal.credentialConfinementEvidenceFingerprint !==
        FIXED.credentialConfinementEvidenceFingerprint) {
    blockers.push("providerFenceRehearsal credential-confinement binding is not exact");
  }
  if (!Number.isSafeInteger(rehearsal.liveOriginInventoryCount) ||
      rehearsal.liveOriginInventoryCount < FIXED.minimumLiveOriginInventoryCount ||
      !HEX64.test(String(rehearsal.liveOriginInventoryFingerprint || "")) ||
      rehearsal.probeOriginCount !== rehearsal.liveOriginInventoryCount +
        FIXED.quiesceFixedAliasOriginCount +
        FIXED.quiesceCandidateAliasOriginCount ||
      rehearsal.probeVectorCount !== FIXED.quiesceProbeVectorCount ||
      rehearsal.probeRecordCount !== rehearsal.probeOriginCount *
        rehearsal.probeVectorCount) {
    blockers.push("providerFenceRehearsal dynamic live/probe scope is not exact");
  }
  if (unresolved(rehearsal.quiesceEvidenceId) ||
      !UUID.test(String(rehearsal.quiesceEvidenceId))) {
    blockers.push("providerFenceRehearsal.quiesceEvidenceId is unresolved");
  } else if (String(rehearsal.quiesceEvidenceId).toLowerCase() !==
      String(manifest.providerQuiesceEvidence.evidenceId).toLowerCase()) {
    blockers.push("providerFenceRehearsal.quiesceEvidenceId is not the durable quiesce receipt");
  }
  if (rehearsal.probeScopeFingerprint !==
      manifest.providerQuiesceEvidence.probeScopeFingerprint) {
    blockers.push("providerFenceRehearsal.probeScopeFingerprint is not the durable quiesce scope");
  }
  if (rehearsal.protectedRangeCountBefore !== rehearsal.protectedRangeCountAfter) {
    blockers.push("providerFenceRehearsal protected-range baseline was not restored");
  }

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
  requireResolved(manifest.release.providerAttestationSignerKeyFingerprint, HEX64,
    "PROVIDER_ATTESTATION_SIGNER_FINGERPRINT_REQUIRED",
    "release.providerAttestationSignerKeyFingerprint");
  requireResolved(manifest.release.providerAttestationEnvironmentScopeFingerprint, HEX64,
    "PROVIDER_ATTESTATION_ENVIRONMENT_SCOPE_REQUIRED",
    "release.providerAttestationEnvironmentScopeFingerprint");
  requireEqual(manifest.release.credentialConfinementSchema,
    FIXED.credentialConfinementSchema, "CREDENTIAL_CONFINEMENT_BINDING_DRIFT",
    "release.credentialConfinementSchema");
  requireEqual(manifest.release.credentialConfinementRecordCount,
    FIXED.credentialConfinementRecordCount, "CREDENTIAL_CONFINEMENT_BINDING_DRIFT",
    "release.credentialConfinementRecordCount");
  requireEqual(manifest.release.credentialConfinementRecordsFingerprint,
    FIXED.credentialConfinementRecordsFingerprint,
    "CREDENTIAL_CONFINEMENT_BINDING_DRIFT",
    "release.credentialConfinementRecordsFingerprint");
  requireEqual(manifest.release.credentialConfinementEvidenceFingerprint,
    FIXED.credentialConfinementEvidenceFingerprint,
    "CREDENTIAL_CONFINEMENT_BINDING_DRIFT",
    "release.credentialConfinementEvidenceFingerprint");
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
    "legacyDeploymentsFenced", "legacyGoogleCredentialsFenced",
    "nonOwnerManualGoogleScoringFenced", "ownerOverrideOperationallyFrozen",
    "previewResourcesAbsent",
  ]) requireEqual(proof[key], true, "PROVIDER_FENCE_REQUIRED", `providerFenceProof.${key}`);
  for (const key of [
    "providerEvidenceFingerprint", "deploymentScopeFingerprint",
    "googleCredentialScopeFingerprint", "writerCoverageFingerprint", "legacyLeaseSetFingerprint",
  ]) requireResolved(proof[key], HEX64, "PROVIDER_FENCE_REQUIRED", `providerFenceProof.${key}`);
  requireEqual(proof.deploymentScopeFingerprint,
    manifest.providerQuiesceEvidence.deploymentScopeFingerprint,
    "PROVIDER_FENCE_QUIESCE_SCOPE_MISMATCH",
    "providerFenceProof.deploymentScopeFingerprint");
  if (requireEvidenceId) requireResolved(proof.evidenceId, UUID, "PROVIDER_EVIDENCE_ID_REQUIRED", "providerFenceProof.evidenceId");
  for (const [field, sourceField] of [
    ["quiesceEvidenceId", "evidenceId"],
    ["providerFenceId", "fenceId"],
    ["providerFenceVerificationId", "currentVerificationId"],
  ]) {
    const durableId = requireResolved(proof[field], UUID,
      "PROVIDER_FENCE_DURABLE_ID_REQUIRED", `providerFenceProof.${field}`);
    requireEqual(durableId, String(manifest[
      field === "quiesceEvidenceId" ? "providerQuiesceEvidence" : "persistentProviderFence"
    ][sourceField]).toLowerCase(), "PROVIDER_FENCE_DURABLE_ID_MISMATCH",
    `providerFenceProof.${field}`);
  }
}

function assertOwnerAuthorization(manifest, operation) {
  if (!OWNER_AUTHORIZATION_EXEMPT.has(operation)) {
    requireEqual(manifest.execution.step12OwnerAuthorizationRecorded, true,
      "STEP12_OWNER_AUTHORIZATION_REQUIRED",
      "execution.step12OwnerAuthorizationRecorded");
  }
}

function assertCandidateEvidenceBinding(manifest, evidence, path) {
  requireEqual(evidence.candidateDeploymentId, manifest.release.deploymentId,
    "PROVIDER_CANDIDATE_BINDING_MISMATCH", `${path}.candidateDeploymentId`);
  requireEqual(String(evidence.candidateDeploymentCommit).toLowerCase(),
    String(manifest.release.frozenSha).toLowerCase(),
    "PROVIDER_CANDIDATE_BINDING_MISMATCH", `${path}.candidateDeploymentCommit`);
}

function assertQuiesceInventoryBinding(quiesce) {
  const artifact = productionOriginInventoryBinding();
  requireEqual(quiesce.originInventoryArtifact, artifact.artifact,
    "ORIGIN_INVENTORY_BINDING_DRIFT", "providerQuiesceEvidence.originInventoryArtifact");
  requireEqual(quiesce.originInventoryCount, artifact.recordCount,
    "ORIGIN_INVENTORY_BINDING_DRIFT", "providerQuiesceEvidence.originInventoryCount");
  requireEqual(quiesce.originInventoryFingerprint, artifact.recordsFingerprint,
    "ORIGIN_INVENTORY_BINDING_DRIFT", "providerQuiesceEvidence.originInventoryFingerprint");
  const candidateAliasOrigin = exactProductionOrigin(quiesce.candidateAliasOrigin);
  const candidateImmutableOrigin = exactProductionOrigin(
    quiesce.candidateImmutableOrigin,
  );
  if (!candidateAliasOrigin || !candidateImmutableOrigin ||
      candidateAliasOrigin === candidateImmutableOrigin ||
      retainedOriginInventoryOrigins.has(candidateAliasOrigin) ||
      retainedOriginInventoryOrigins.has(candidateImmutableOrigin)) {
    refuse("PROVIDER_QUIESCE_CANDIDATE_ORIGIN_INVALID",
      "The server-derived candidate origins are invalid or collide with retained inventory.");
  }
  requireInteger(quiesce.liveOriginInventoryCount,
    "PROVIDER_QUIESCE_LIVE_INVENTORY_REQUIRED",
    "providerQuiesceEvidence.liveOriginInventoryCount");
  if (quiesce.liveOriginInventoryCount < artifact.minimumLiveOriginInventoryCount) {
    refuse("PROVIDER_QUIESCE_LIVE_INVENTORY_REQUIRED",
      "The signed live inventory omitted the candidate or retained baseline.");
  }
  requireResolved(quiesce.liveOriginInventoryFingerprint, HEX64,
    "PROVIDER_QUIESCE_LIVE_INVENTORY_REQUIRED",
    "providerQuiesceEvidence.liveOriginInventoryFingerprint");
  requireEqual(quiesce.probeOriginCount,
    quiesce.liveOriginInventoryCount + artifact.fixedAliasOriginCount +
      artifact.candidateAliasOriginCount,
    "PROVIDER_QUIESCE_ORIGIN_COVERAGE_INCOMPLETE",
    "providerQuiesceEvidence.probeOriginCount");
  requireEqual(quiesce.probeVectorCount, artifact.probeVectorCount,
    "PROVIDER_QUIESCE_VECTOR_COVERAGE_INCOMPLETE",
    "providerQuiesceEvidence.probeVectorCount");
  requireEqual(quiesce.probeRecordCount,
    quiesce.probeOriginCount * quiesce.probeVectorCount,
    "PROVIDER_QUIESCE_VECTOR_COVERAGE_INCOMPLETE",
    "providerQuiesceEvidence.probeRecordCount");
  requireResolved(quiesce.probeScopeFingerprint, HEX64,
    "PROVIDER_QUIESCE_SCOPE_FINGERPRINT_REQUIRED",
    "providerQuiesceEvidence.probeScopeFingerprint");
}

function assertOwnerFreeze(quiesce, { requireDrain = false } = {}) {
  requireEqual(quiesce.ownerOverrideOperationallyFrozen, true,
    "PROVIDER_QUIESCE_OWNER_FREEZE_REQUIRED",
    "providerQuiesceEvidence.ownerOverrideOperationallyFrozen");
  requireEqual(quiesce.ownerFreezeConfirmation, FIXED.ownerFreezeConfirmation,
    "PROVIDER_QUIESCE_OWNER_FREEZE_REQUIRED",
    "providerQuiesceEvidence.ownerFreezeConfirmation");
  if (requireDrain) {
    const acknowledgedAt = requireTimestamp(quiesce.ownerAcknowledgedAt,
      "PROVIDER_QUIESCE_TIMESTAMP_INVALID", "providerQuiesceEvidence.ownerAcknowledgedAt");
    const freezeExpiresAt = requireTimestamp(quiesce.ownerFreezeExpiresAt,
      "PROVIDER_QUIESCE_TIMESTAMP_INVALID", "providerQuiesceEvidence.ownerFreezeExpiresAt");
    if (Date.parse(freezeExpiresAt) <= Date.parse(acknowledgedAt)) {
      refuse("PROVIDER_QUIESCE_OWNER_FREEZE_EXPIRED",
        "The owner freeze expiry must follow its acknowledgement.");
    }
    const startedAt = requireTimestamp(quiesce.drainStartedAt,
      "PROVIDER_QUIESCE_TIMESTAMP_INVALID", "providerQuiesceEvidence.drainStartedAt");
    const completedAt = requireTimestamp(quiesce.drainCompletedAt,
      "PROVIDER_QUIESCE_TIMESTAMP_INVALID", "providerQuiesceEvidence.drainCompletedAt");
    if (Date.parse(completedAt) - Date.parse(startedAt) < 300_000) {
      refuse("PROVIDER_QUIESCE_DRAIN_TOO_SHORT",
        "The two conclusive quiesce snapshots must be at least 300 seconds apart.");
    }
    if (Date.parse(startedAt) < Date.parse(acknowledgedAt) ||
        Date.parse(completedAt) > Date.parse(freezeExpiresAt)) {
      refuse("PROVIDER_QUIESCE_OWNER_FREEZE_WINDOW_INVALID",
        "The complete quiesce drain must remain inside the owner freeze window.");
    }
  }
}

function assertQuiesceRequestScope(manifest, { requireDrain = false } = {}) {
  const quiesce = manifest.providerQuiesceEvidence;
  assertRoutingRuleShape(quiesce.routingRule, { resolved: true });
  assertCandidateEvidenceBinding(manifest, quiesce, "providerQuiesceEvidence");
  assertQuiesceInventoryBinding(quiesce);
  assertOwnerFreeze(quiesce, { requireDrain });
  requireResolved(quiesce.evidenceRequestId, UUID,
    "PROVIDER_QUIESCE_REQUEST_ID_REQUIRED", "providerQuiesceEvidence.evidenceRequestId");
  if (quiesce.priorEvidenceId !== null) {
    requireResolved(quiesce.priorEvidenceId, UUID,
      "PROVIDER_QUIESCE_PRIOR_ID_INVALID", "providerQuiesceEvidence.priorEvidenceId");
  }
  if (requireDrain) {
    requireEqual(quiesce.unresolvedRequestLogCount, 0,
      "PROVIDER_QUIESCE_UNRESOLVED_WRITES",
      "providerQuiesceEvidence.unresolvedRequestLogCount");
    requireEqual(quiesce.unresolvedGoogleWriteCount, 0,
      "PROVIDER_QUIESCE_UNRESOLVED_WRITES",
      "providerQuiesceEvidence.unresolvedGoogleWriteCount");
  }
  return quiesce;
}

function assertVerifiedQuiesce(manifest) {
  const quiesce = assertQuiesceRequestScope(manifest, { requireDrain: true });
  requireEqual(quiesce.status, "VERIFIED", "PROVIDER_QUIESCE_VERIFIED_REQUIRED",
    "providerQuiesceEvidence.status");
  requireResolved(quiesce.evidenceId, UUID, "PROVIDER_QUIESCE_EVIDENCE_ID_REQUIRED",
    "providerQuiesceEvidence.evidenceId");
  for (const field of [
    "firstProbeFingerprint", "secondProbeFingerprint", "deploymentScopeFingerprint",
    "credentialGenerationFingerprint",
  ]) requireResolved(quiesce[field], HEX64, "PROVIDER_QUIESCE_EVIDENCE_INVALID",
    `providerQuiesceEvidence.${field}`);
  requireEqual(quiesce.allOriginsEdgeDenied, true,
    "PROVIDER_QUIESCE_ORIGIN_COVERAGE_INCOMPLETE",
    "providerQuiesceEvidence.allOriginsEdgeDenied");
  requireEqual(quiesce.unresolvedProbeCount, 0,
    "PROVIDER_QUIESCE_ORIGIN_COVERAGE_INCOMPLETE",
    "providerQuiesceEvidence.unresolvedProbeCount");
  const verifiedAt = requireTimestamp(quiesce.verifiedAt,
    "PROVIDER_QUIESCE_TIMESTAMP_INVALID", "providerQuiesceEvidence.verifiedAt");
  const expiresAt = requireTimestamp(quiesce.expiresAt,
    "PROVIDER_QUIESCE_TIMESTAMP_INVALID", "providerQuiesceEvidence.expiresAt");
  if (Date.parse(verifiedAt) < Date.parse(quiesce.drainCompletedAt) ||
      Date.parse(expiresAt) <= Date.parse(verifiedAt) ||
      Date.parse(expiresAt) > Date.parse(quiesce.ownerFreezeExpiresAt)) {
    refuse("PROVIDER_QUIESCE_EVIDENCE_WINDOW_INVALID",
      "The verified quiesce interval is outside its drain or owner-freeze window.");
  }
  return quiesce;
}

function assertPersistentProviderFence(manifest, {
  allowRemovalAuthorized = false,
  linkCurrentQuiesce = true,
} = {}) {
  const fence = manifest.persistentProviderFence;
  const allowed = allowRemovalAuthorized
    ? new Set(["INSTALLED", "REMOVAL_AUTHORIZED"])
    : new Set(["INSTALLED"]);
  if (!allowed.has(fence.status)) {
    refuse("PERSISTENT_PROVIDER_FENCE_REQUIRED",
      "The exact durable Step 12 provider fence is not installed.");
  }
  const fenceId = requireResolved(fence.fenceId, UUID,
    "PERSISTENT_PROVIDER_FENCE_ID_REQUIRED", "persistentProviderFence.fenceId");
  requireResolved(fence.installRequestId, UUID,
    "PERSISTENT_PROVIDER_FENCE_ID_REQUIRED", "persistentProviderFence.installRequestId");
  requireResolved(fence.currentVerificationId, UUID,
    "PERSISTENT_PROVIDER_FENCE_ID_REQUIRED", "persistentProviderFence.currentVerificationId");
  const quiesceEvidenceId = requireResolved(fence.quiesceEvidenceId, UUID,
    "PERSISTENT_PROVIDER_FENCE_ID_REQUIRED", "persistentProviderFence.quiesceEvidenceId");
  assertCandidateEvidenceBinding(manifest, fence, "persistentProviderFence");
  requireEqual(fence.protectionCount, 17, "PERSISTENT_PROVIDER_FENCE_INCOMPLETE",
    "persistentProviderFence.protectionCount");
  for (const field of [
    "expectedBaselineFingerprint", "expectedCanonicalValueFingerprint",
    "protectionSetFingerprint", "providerFingerprint", "aclFingerprint",
    "canonicalValueFingerprint", "formulaFingerprint", "permissionInventoryFingerprint",
  ]) requireResolved(fence[field], HEX64, "PERSISTENT_PROVIDER_FENCE_INCOMPLETE",
    `persistentProviderFence.${field}`);
  const capturedAt = requireTimestamp(fence.capturedAt,
    "PERSISTENT_PROVIDER_FENCE_TIMESTAMP_INVALID", "persistentProviderFence.capturedAt");
  const expiresAt = requireTimestamp(fence.expiresAt,
    "PERSISTENT_PROVIDER_FENCE_TIMESTAMP_INVALID", "persistentProviderFence.expiresAt");
  if (Date.parse(expiresAt) <= Date.parse(capturedAt)) {
    refuse("PERSISTENT_PROVIDER_FENCE_TIMESTAMP_INVALID",
      "The current persistent provider-fence verification has an invalid interval.");
  }
  if (linkCurrentQuiesce && manifest.providerQuiesceEvidence.status === "VERIFIED") {
    requireEqual(quiesceEvidenceId,
      String(manifest.providerQuiesceEvidence.evidenceId).toLowerCase(),
      "PERSISTENT_PROVIDER_FENCE_QUIESCE_MISMATCH",
      "persistentProviderFence.quiesceEvidenceId");
  }
  return { fence, fenceId, quiesceEvidenceId };
}

function assertInitialCutoverFenceWindowState(manifest) {
  const state = manifest.state;
  requireEqual(state.cutoverPhase, "CURRENT_READS", "PHASE_SKIP_FORBIDDEN",
    "state.cutoverPhase");
  requireEqual(state.activationState, "GOOGLE_LEASE_ARMED", "PHASE_SKIP_FORBIDDEN",
    "state.activationState");
  requireEqual(state.scoringAuthority, "GOOGLE", "AUTHORITY_MISMATCH",
    "state.scoringAuthority");
  requireEqual(state.participantIdentityAuthority, "SUPABASE", "IDENTITY_MISMATCH",
    "state.participantIdentityAuthority");
  requireEqual(state.admissionState, "OPEN", "ADMISSION_STATE_MISMATCH",
    "state.admissionState");
  requireEqual(state.gateExecutionState, "OPEN", "GATE_STATE_MISMATCH",
    "state.gateExecutionState");
  requireEqual(state.admissionProtocolEnforced, true,
    "ADMISSION_PROTOCOL_STATE_MISMATCH", "state.admissionProtocolEnforced");
  requireEqual(state.admissionDeploymentId, manifest.release.deploymentId,
    "PROVIDER_CANDIDATE_BINDING_MISMATCH", "state.admissionDeploymentId");
  requireEqual(state.activeClosureId, null, "CLOSURE_STATE_MISMATCH",
    "state.activeClosureId");
  requireEqual(state.scoringIngressEnabled, false, "INGRESS_STATE_MISMATCH",
    "state.scoringIngressEnabled");
  requireEqual(state.workersEnabled, false, "WORKERS_MUST_BE_DISABLED",
    "state.workersEnabled");
  assertNoLegacyWriters(manifest);
  assertDurableQueuesDrained(manifest);
  assertFirstWrite(manifest, { possible: false, observed: false });
}

function assertOperationGuard(manifest, operation) {
  const state = manifest.state;
  assertOwnerAuthorization(manifest, operation);
  if (operation !== "inspect") assertFrozenRelease(manifest);
  if (!["inspect", "stage-release", ...PROVIDER_ACTIONS].includes(operation)) {
    assertOptimisticState(manifest);
  }
  if (PERSISTENT_FENCE_REQUIRED_OPERATIONS.has(operation)) {
    assertPersistentProviderFence(manifest);
  }

  switch (operation) {
    case "inspect": return;
    case "issue-begin-provider-attestation-challenge":
    case "inspect-begin-provider-attestation-challenge": {
      const quiesce = assertQuiesceRequestScope(manifest);
      requireEqual(quiesce.status, "MISSING",
        "PROVIDER_QUIESCE_BEGIN_STATE_INVALID", "providerQuiesceEvidence.status");
      assertInitialCutoverFenceWindowState(manifest);
      return;
    }
    case "issue-finalize-provider-attestation-challenge":
    case "inspect-finalize-provider-attestation-challenge": {
      const quiesce = assertQuiesceRequestScope(manifest, { requireDrain: true });
      requireEqual(quiesce.status, "DRAINING",
        "PROVIDER_QUIESCE_FINALIZE_STATE_INVALID", "providerQuiesceEvidence.status");
      assertInitialCutoverFenceWindowState(manifest);
      return;
    }
    case "begin-provider-quiesce": {
      const quiesce = assertQuiesceRequestScope(manifest);
      if (String(quiesce.evidenceRequestId).toLowerCase() === String(
        requireResolved(manifest.stableRequestIds[operation], UUID,
          "STABLE_REQUEST_ID_REQUIRED", `stableRequestIds.${operation}`),
      ).toLowerCase()) {
        refuse("PROVIDER_QUIESCE_REQUEST_ID_MISMATCH",
          "The shared evidence identity must be distinct from the BEGIN action identity.");
      }
      if (quiesce.priorEvidenceId === null) {
        requireEqual(quiesce.status, "MISSING", "PROVIDER_QUIESCE_BEGIN_STATE_INVALID",
          "providerQuiesceEvidence.status");
        requireEqual(state.cutoverPhase, "CURRENT_READS", "PHASE_SKIP_FORBIDDEN", "state.cutoverPhase");
        requireEqual(state.activationState, "GOOGLE_LEASE_ARMED", "PHASE_SKIP_FORBIDDEN", "state.activationState");
        requireEqual(state.scoringAuthority, "GOOGLE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
        requireEqual(state.participantIdentityAuthority, "SUPABASE", "IDENTITY_MISMATCH",
          "state.participantIdentityAuthority");
        requireEqual(state.admissionState, "OPEN", "ADMISSION_STATE_MISMATCH", "state.admissionState");
        requireEqual(state.gateExecutionState, "OPEN", "GATE_STATE_MISMATCH", "state.gateExecutionState");
        requireEqual(state.admissionProtocolEnforced, true,
          "ADMISSION_PROTOCOL_STATE_MISMATCH", "state.admissionProtocolEnforced");
        requireEqual(state.admissionDeploymentId, manifest.release.deploymentId,
          "PROVIDER_CANDIDATE_BINDING_MISMATCH", "state.admissionDeploymentId");
        requireEqual(state.activeClosureId, null, "CLOSURE_STATE_MISMATCH", "state.activeClosureId");
        requireEqual(state.scoringIngressEnabled, false,
          "INGRESS_STATE_MISMATCH", "state.scoringIngressEnabled");
        requireEqual(state.workersEnabled, false,
          "WORKERS_MUST_BE_DISABLED", "state.workersEnabled");
        assertNoLegacyWriters(manifest);
        assertDurableQueuesDrained(manifest);
        assertFirstWrite(manifest, { possible: false, observed: false });
      } else {
        assertPersistentProviderFence(manifest, { linkCurrentQuiesce: false });
        if (quiesce.status === "VERIFIED") {
          requireEqual(String(quiesce.priorEvidenceId).toLowerCase(),
            String(quiesce.evidenceId).toLowerCase(),
            "PROVIDER_QUIESCE_PRIOR_ID_INVALID", "providerQuiesceEvidence.priorEvidenceId");
        }
      }
      return;
    }
    case "finalize-provider-quiesce": {
      const quiesce = assertQuiesceRequestScope(manifest, { requireDrain: true });
      requireEqual(quiesce.status, "DRAINING", "PROVIDER_QUIESCE_FINALIZE_STATE_INVALID",
        "providerQuiesceEvidence.status");
      requireResolved(quiesce.evidenceId, UUID, "PROVIDER_QUIESCE_EVIDENCE_ID_REQUIRED",
        "providerQuiesceEvidence.evidenceId");
      if (quiesce.priorEvidenceId === null) assertInitialCutoverFenceWindowState(manifest);
      return;
    }
    case "inspect-provider-quiesce": {
      const quiesce = manifest.providerQuiesceEvidence;
      assertCandidateEvidenceBinding(manifest, quiesce, "providerQuiesceEvidence");
      requireResolved(quiesce.evidenceRequestId, UUID,
        "PROVIDER_QUIESCE_REQUEST_ID_REQUIRED", "providerQuiesceEvidence.evidenceRequestId");
      requireResolved(quiesce.evidenceId, UUID,
        "PROVIDER_QUIESCE_EVIDENCE_ID_REQUIRED", "providerQuiesceEvidence.evidenceId");
      return;
    }
    case "install-persistent-provider-fence": {
      const quiesce = assertVerifiedQuiesce(manifest);
      const fence = manifest.persistentProviderFence;
      if (!["MISSING", "INSTALLING"].includes(fence.status)) {
        refuse("PERSISTENT_PROVIDER_FENCE_INSTALL_STATE_INVALID",
          "A new persistent fence can only start from MISSING or recover INSTALLING.");
      }
      assertCandidateEvidenceBinding(manifest, fence, "persistentProviderFence");
      requireEqual(requireResolved(fence.installRequestId, UUID,
        "PERSISTENT_PROVIDER_FENCE_INSTALL_ID_REQUIRED",
        "persistentProviderFence.installRequestId"),
      requireResolved(manifest.stableRequestIds[operation], UUID,
        "STABLE_REQUEST_ID_REQUIRED", `stableRequestIds.${operation}`),
      "PERSISTENT_PROVIDER_FENCE_INSTALL_ID_MISMATCH",
      "persistentProviderFence.installRequestId");
      requireEqual(String(fence.quiesceEvidenceId).toLowerCase(),
        String(quiesce.evidenceId).toLowerCase(),
        "PERSISTENT_PROVIDER_FENCE_QUIESCE_MISMATCH",
        "persistentProviderFence.quiesceEvidenceId");
      requireResolved(fence.expectedBaselineFingerprint, HEX64,
        "PERSISTENT_PROVIDER_FENCE_BASELINE_REQUIRED",
        "persistentProviderFence.expectedBaselineFingerprint");
      requireResolved(fence.expectedCanonicalValueFingerprint, HEX64,
        "PERSISTENT_PROVIDER_FENCE_BASELINE_REQUIRED",
        "persistentProviderFence.expectedCanonicalValueFingerprint");
      requireEqual(state.cutoverPhase, "CURRENT_READS", "PHASE_SKIP_FORBIDDEN", "state.cutoverPhase");
      requireEqual(state.activationState, "GOOGLE_LEASE_ARMED", "PHASE_SKIP_FORBIDDEN", "state.activationState");
      requireEqual(state.scoringAuthority, "GOOGLE", "AUTHORITY_MISMATCH", "state.scoringAuthority");
      requireEqual(state.participantIdentityAuthority, "SUPABASE", "IDENTITY_MISMATCH",
        "state.participantIdentityAuthority");
      requireEqual(state.admissionState, "OPEN", "ADMISSION_STATE_MISMATCH", "state.admissionState");
      requireEqual(state.gateExecutionState, "OPEN", "GATE_STATE_MISMATCH", "state.gateExecutionState");
      requireEqual(state.admissionProtocolEnforced, true,
        "ADMISSION_PROTOCOL_STATE_MISMATCH", "state.admissionProtocolEnforced");
      requireEqual(state.admissionDeploymentId, manifest.release.deploymentId,
        "PROVIDER_CANDIDATE_BINDING_MISMATCH", "state.admissionDeploymentId");
      requireEqual(state.activeClosureId, null, "CLOSURE_STATE_MISMATCH", "state.activeClosureId");
      requireEqual(state.scoringIngressEnabled, false,
        "INGRESS_STATE_MISMATCH", "state.scoringIngressEnabled");
      requireEqual(state.workersEnabled, false,
        "WORKERS_MUST_BE_DISABLED", "state.workersEnabled");
      assertNoLegacyWriters(manifest);
      assertDurableQueuesDrained(manifest);
      assertFirstWrite(manifest, { possible: false, observed: false });
      assertInitialCutoverFenceWindowState(manifest);
      return;
    }
    case "inspect-persistent-provider-fence": {
      const fence = manifest.persistentProviderFence;
      assertCandidateEvidenceBinding(manifest, fence, "persistentProviderFence");
      if (fence.status !== "MISSING") {
        assertPersistentProviderFence(manifest, {
          allowRemovalAuthorized: true,
          linkCurrentQuiesce: false,
        });
      }
      return;
    }
    case "refresh-persistent-provider-fence": {
      const quiesce = assertVerifiedQuiesce(manifest);
      const { fence } = assertPersistentProviderFence(manifest, { linkCurrentQuiesce: false });
      requireEqual(String(fence.quiesceEvidenceId).toLowerCase() !==
        String(quiesce.evidenceId).toLowerCase(), true,
      "PERSISTENT_PROVIDER_FENCE_REFRESH_EVIDENCE_NOT_NEW",
      "persistentProviderFence.quiesceEvidenceId/current quiesce evidence");
      return;
    }
    case "remove-persistent-provider-fence": {
      assertOptimisticState(manifest);
      assertVerifiedQuiesce(manifest);
      const { fence } = assertPersistentProviderFence(manifest, {
        allowRemovalAuthorized: true,
        linkCurrentQuiesce: true,
      });
      requireEqual(requireResolved(fence.removalRequestId, UUID,
        "PERSISTENT_PROVIDER_FENCE_REMOVAL_ID_REQUIRED",
        "persistentProviderFence.removalRequestId"),
      requireResolved(manifest.stableRequestIds[operation], UUID,
        "STABLE_REQUEST_ID_REQUIRED", `stableRequestIds.${operation}`),
      "PERSISTENT_PROVIDER_FENCE_REMOVAL_ID_MISMATCH",
      "persistentProviderFence.removalRequestId");
      requireEqual(["DORMANT", "ROLLED_BACK"].includes(state.activationState), true,
        "PERSISTENT_PROVIDER_FENCE_REMOVAL_NOT_SAFE", "state.activationState");
      requireEqual(state.scoringAuthority, "GOOGLE",
        "PERSISTENT_PROVIDER_FENCE_REMOVAL_NOT_SAFE", "state.scoringAuthority");
      requireEqual(state.participantIdentityAuthority, "PASSPORT",
        "PERSISTENT_PROVIDER_FENCE_REMOVAL_NOT_SAFE", "state.participantIdentityAuthority");
      requireEqual(state.scoringIngressEnabled, false,
        "PERSISTENT_PROVIDER_FENCE_REMOVAL_NOT_SAFE", "state.scoringIngressEnabled");
      requireEqual(state.workersEnabled, false,
        "PERSISTENT_PROVIDER_FENCE_REMOVAL_NOT_SAFE", "state.workersEnabled");
      requireEqual(state.gateExecutionState, "PAUSED",
        "PERSISTENT_PROVIDER_FENCE_REMOVAL_NOT_SAFE", "state.gateExecutionState");
      requireEqual(state.admissionState, "OPEN",
        "PERSISTENT_PROVIDER_FENCE_REMOVAL_NOT_SAFE", "state.admissionState");
      requireEqual(state.admissionProtocolEnforced, false,
        "PERSISTENT_PROVIDER_FENCE_REMOVAL_NOT_SAFE", "state.admissionProtocolEnforced");
      requireEqual(state.activeClosureId, null,
        "PERSISTENT_PROVIDER_FENCE_REMOVAL_NOT_SAFE", "state.activeClosureId");
      requireEqual(state.preparedEpochId, null,
        "PERSISTENT_PROVIDER_FENCE_REMOVAL_NOT_SAFE", "state.preparedEpochId");
      assertNoLegacyWriters(manifest);
      assertDurableQueuesDrained(manifest);
      return;
    }
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

function providerCommonPayload(manifest, operation, {
  requestOperation = operation,
  routeAction = operation,
} = {}) {
  return {
    action: routeAction,
    operationRequestId: requireResolved(manifest.stableRequestIds[requestOperation], UUID,
      "STABLE_REQUEST_ID_REQUIRED", `stableRequestIds.${requestOperation}`),
    expectedCommitSha: requireResolved(manifest.release.frozenSha, HEX40,
      "FROZEN_SHA_REQUIRED", "release.frozenSha"),
    expectedWorkbookId: FIXED.sourceWorkbookId,
    expectedBranch: FIXED.providerFenceBranch,
    expectedDirectorPlayerId: FIXED.providerFenceDirector,
  };
}

function signedProviderAttestation(manifest, challenge, stage, requestOperation) {
  const envelope = requireObject(challenge.signedAttestation,
    "PROVIDER_ATTESTATION_REQUIRED", `providerAttestationChallenges.${stage.toLowerCase()}.signedAttestation`);
  const claim = requireObject(envelope.attestation, "PROVIDER_ATTESTATION_REQUIRED",
    `providerAttestationChallenges.${stage.toLowerCase()}.signedAttestation.attestation`);
  if (envelope.schemaVersion !== "bagger-vercel-provider-attestation-envelope-v1" ||
      envelope.algorithm !== "Ed25519" ||
      envelope.signerKeyVersion !== "STEP11_6_VERCEL_ATTESTER_V1" ||
      !HEX64.test(String(envelope.signerKeyFingerprint || "")) ||
      envelope.signerKeyFingerprint !==
        manifest.release.providerAttestationSignerKeyFingerprint ||
      !HEX64.test(String(envelope.attestationFingerprint || "")) ||
      !BASE64URL.test(String(envelope.signature || "")) ||
      !UUID.test(String(claim.attestationId || "")) ||
      claim.attestationId === challenge.challengeId ||
      claim.challengeId !== challenge.challengeId ||
      claim.requestId !== manifest.stableRequestIds[requestOperation] ||
      claim.stage !== stage || claim.purpose !== "CUTOVER" ||
      claim.vercelProjectId !== FIXED.vercelProjectId ||
      claim.vercelTeamId !== manifest.resources.vercelTeamId ||
      claim.candidateDeploymentId !== manifest.release.deploymentId ||
      claim.candidateDeploymentCommit !== manifest.release.frozenSha ||
      claim.candidateDeploymentTarget !== "PRODUCTION") {
    refuse("PROVIDER_ATTESTATION_BINDING_MISMATCH",
      `The ${stage} provider attestation does not match its DB challenge and release scope.`);
  }
  return clone(envelope);
}

function providerActionDefaults(manifest, operation) {
  const quiesce = manifest.providerQuiesceEvidence;
  const fence = manifest.persistentProviderFence;
  const common = operation.includes("provider-attestation-challenge")
    ? null : providerCommonPayload(manifest, operation);
  const beginChallenge = manifest.providerAttestationChallenges.begin;
  const finalizeChallenge = manifest.providerAttestationChallenges.finalize;
  switch (operation) {
    case "issue-begin-provider-attestation-challenge": return {
      ...providerCommonPayload(manifest, operation, {
        requestOperation: "begin-provider-quiesce",
        routeAction: "issue-provider-attestation-challenge",
      }),
      challengeRequestId: requireResolved(beginChallenge.challengeRequestId, UUID,
        "PROVIDER_ATTESTATION_CHALLENGE_REQUEST_REQUIRED",
        "providerAttestationChallenges.begin.challengeRequestId"),
      evidenceRequestId: quiesce.evidenceRequestId,
      providerAttestationStage: "BEGIN",
      quiescePurpose: "CUTOVER",
      routingRule: clone(quiesce.routingRule),
    };
    case "inspect-begin-provider-attestation-challenge": return {
      ...providerCommonPayload(manifest, operation, {
        requestOperation: "begin-provider-quiesce",
        routeAction: "inspect-provider-attestation-challenge",
      }),
      evidenceRequestId: quiesce.evidenceRequestId,
      providerAttestationStage: "BEGIN",
      providerChallengeId: beginChallenge.challengeId,
      quiescePurpose: "CUTOVER",
      routingRule: clone(quiesce.routingRule),
    };
    case "issue-finalize-provider-attestation-challenge": return {
      ...providerCommonPayload(manifest, operation, {
        requestOperation: "finalize-provider-quiesce",
        routeAction: "issue-provider-attestation-challenge",
      }),
      challengeRequestId: requireResolved(finalizeChallenge.challengeRequestId, UUID,
        "PROVIDER_ATTESTATION_CHALLENGE_REQUEST_REQUIRED",
        "providerAttestationChallenges.finalize.challengeRequestId"),
      evidenceRequestId: quiesce.evidenceRequestId,
      providerAttestationStage: "FINALIZE",
      quiescePurpose: "CUTOVER",
      routingRule: clone(quiesce.routingRule),
    };
    case "inspect-finalize-provider-attestation-challenge": return {
      ...providerCommonPayload(manifest, operation, {
        requestOperation: "finalize-provider-quiesce",
        routeAction: "inspect-provider-attestation-challenge",
      }),
      evidenceRequestId: quiesce.evidenceRequestId,
      providerAttestationStage: "FINALIZE",
      providerChallengeId: finalizeChallenge.challengeId,
      quiescePurpose: "CUTOVER",
      routingRule: clone(quiesce.routingRule),
    };
    case "begin-provider-quiesce": return {
      ...common,
      quiescePurpose: "CUTOVER",
      evidenceRequestId: quiesce.evidenceRequestId,
      priorEvidenceId: quiesce.priorEvidenceId,
      routingRule: clone(quiesce.routingRule),
      ownerOverrideOperationallyFrozen: quiesce.ownerOverrideOperationallyFrozen,
      ownerFreezeConfirmation: quiesce.ownerFreezeConfirmation,
      ownerFreezeTtlSeconds: quiesce.ownerFreezeTtlSeconds,
      challengeRequestId: beginChallenge.challengeRequestId,
      providerAttestationStage: "BEGIN",
      providerChallengeId: beginChallenge.challengeId,
      providerAttestationConsumeRequestId: beginChallenge.consumeRequestId,
      providerAttestation: signedProviderAttestation(
        manifest, beginChallenge, "BEGIN", "begin-provider-quiesce",
      ),
    };
    case "finalize-provider-quiesce": return {
      ...common,
      quiescePurpose: "CUTOVER",
      evidenceRequestId: quiesce.evidenceRequestId,
      quiesceEvidenceId: quiesce.evidenceId,
      priorEvidenceId: quiesce.priorEvidenceId,
      routingRule: clone(quiesce.routingRule),
      challengeRequestId: finalizeChallenge.challengeRequestId,
      providerAttestationStage: "FINALIZE",
      providerChallengeId: finalizeChallenge.challengeId,
      providerAttestationConsumeRequestId: finalizeChallenge.consumeRequestId,
      providerAttestation: signedProviderAttestation(
        manifest, finalizeChallenge, "FINALIZE", "finalize-provider-quiesce",
      ),
    };
    case "inspect-provider-quiesce": return {
      ...common,
      quiescePurpose: "CUTOVER",
      evidenceRequestId: quiesce.evidenceRequestId,
      quiesceEvidenceId: quiesce.evidenceId,
    };
    case "install-persistent-provider-fence": return {
      ...common,
      installRequestId: fence.installRequestId,
      quiesceEvidenceId: quiesce.evidenceId,
      expectedBaselineFingerprint: fence.expectedBaselineFingerprint,
      expectedCanonicalValueFingerprint: fence.expectedCanonicalValueFingerprint,
      confirmation: FIXED.providerFenceDescription,
    };
    case "inspect-persistent-provider-fence": {
      const absent = fence.status === "MISSING";
      return {
        ...common,
        installRequestId: absent ? null : fence.installRequestId,
        fenceId: absent ? null : fence.fenceId,
        currentVerificationId: absent ? null : fence.currentVerificationId,
      };
    }
    case "refresh-persistent-provider-fence": return {
      ...common,
      installRequestId: fence.installRequestId,
      fenceId: fence.fenceId,
      currentVerificationId: fence.currentVerificationId,
      quiesceEvidenceId: quiesce.evidenceId,
    };
    case "remove-persistent-provider-fence": return {
      ...common,
      installRequestId: fence.installRequestId,
      fenceId: fence.fenceId,
      currentVerificationId: fence.currentVerificationId,
      quiesceEvidenceId: fence.quiesceEvidenceId,
      confirmation: FIXED.providerFenceRemoveConfirmation,
    };
    default: refuse("UNKNOWN_OPERATION", `Unknown provider operation: ${operation}`);
  }
}

function operationDefaults(manifest, operation) {
  const {
    resources,
    release,
    providerQuiesceEvidence: quiesce,
    persistentProviderFence: persistentFence,
    providerFenceProof: proof,
    state,
    evidence,
  } = manifest;
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
      legacy_google_credentials_fenced: proof.legacyGoogleCredentialsFenced,
      non_owner_manual_google_scoring_fenced: proof.nonOwnerManualGoogleScoringFenced,
      owner_override_operationally_frozen: proof.ownerOverrideOperationallyFrozen,
      quiesce_evidence_id: proof.quiesceEvidenceId,
      provider_fence_id: proof.providerFenceId,
      provider_fence_verification_id: proof.providerFenceVerificationId,
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
      legacy_google_credentials_fenced: proof.legacyGoogleCredentialsFenced,
      non_owner_manual_google_scoring_fenced: proof.nonOwnerManualGoogleScoringFenced,
      owner_override_operationally_frozen: proof.ownerOverrideOperationallyFrozen,
      quiesce_evidence_id: proof.quiesceEvidenceId,
      provider_fence_id: proof.providerFenceId,
      provider_fence_verification_id: proof.providerFenceVerificationId,
    };
    case "close-legacy-admission": return {
      expected_authority: "GOOGLE", start_source_fingerprint: evidence.startSourceFingerprint,
      external_fence_evidence_id: proof.evidenceId,
      quiesce_evidence_id: proof.quiesceEvidenceId,
      provider_fence_id: proof.providerFenceId,
      provider_fence_verification_id: proof.providerFenceVerificationId,
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
      quiesce_evidence_id: proof.quiesceEvidenceId,
      provider_fence_id: proof.providerFenceId,
      provider_fence_verification_id: proof.providerFenceVerificationId,
    };
    case "commit-authority": return {
      epoch_id: state.preparedEpochId, closure_id: state.activeClosureId,
      external_fence_evidence_id: proof.evidenceId,
      reconciliation_fingerprint: evidence.reconciliationFingerprint,
      quiesce_evidence_id: proof.quiesceEvidenceId,
      provider_fence_id: proof.providerFenceId,
      provider_fence_verification_id: proof.providerFenceVerificationId,
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

function mergeProviderActionInput(manifest, operation, payload) {
  const input = manifest.operationInputs[operation] ?? {};
  requireObject(input, "OPERATION_INPUT_INVALID", `operationInputs.${operation}`);
  const allowed = new Set(PROVIDER_ACTION_INPUT_KEYS[operation] ?? []);
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) {
      refuse("OPERATION_INPUT_FIELD_FORBIDDEN",
        `Unexpected field operationInputs.${operation}.${key}.`);
    }
    if (!(key in payload) || canonicalJson(value) !== canonicalJson(payload[key])) {
      refuse("AUTHORITY_BINDING_OVERRIDE_FORBIDDEN",
        `operationInputs.${operation}.${key} differs from the computed provider binding.`);
    }
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

function validateRenderedProviderPayload(operation, payload) {
  const allowed = new Set(PROVIDER_ACTION_INPUT_KEYS[operation] ?? []);
  if (Object.keys(payload).length !== allowed.size ||
      Object.keys(payload).some((key) => !allowed.has(key))) {
    refuse("RENDERED_PAYLOAD_FIELD_FORBIDDEN",
      "The rendered provider payload does not have the exact route field set.");
  }
  for (const [key, value] of Object.entries(payload)) {
    if (value === null) continue;
    if (typeof value === "string" && unresolved(value)) {
      refuse("UNRESOLVED_PAYLOAD_PLACEHOLDER", `${key} is unresolved.`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "originInventory") ||
      Object.prototype.hasOwnProperty.call(payload, "probeRecords")) {
    refuse("PROVIDER_INVENTORY_PAYLOAD_FORBIDDEN",
      "The retained Production inventory and probe records are server-loaded only.");
  }
  assertNoSecrets(payload, "payload");
  assertNoPreview(payload);
}

function buildDiagnosticStateGuard(manifest) {
  return {
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
    quiesceEvidenceId: manifest.providerQuiesceEvidence.evidenceId,
    quiesceEvidenceRequestId: manifest.providerQuiesceEvidence.evidenceRequestId,
    persistentProviderFenceStatus: manifest.persistentProviderFence.status,
    persistentProviderFenceId: manifest.persistentProviderFence.fenceId,
    persistentProviderFenceVerificationId:
      manifest.persistentProviderFence.currentVerificationId,
  };
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
  const diagnosticStateGuard = buildDiagnosticStateGuard(manifest);
  if (PROVIDER_ACTIONS.has(operation)) {
    let payload = providerActionDefaults(manifest, operation);
    payload = mergeProviderActionInput(manifest, operation, payload);
    validateRenderedProviderPayload(operation, payload);
    const requestFingerprint = sha256Hex(canonicalJson({
      domain: "BAGGER_STEP12_PROVIDER_ACTION_REQUEST_V1",
      operation,
      payload,
      diagnosticStateGuard,
      originInventoryBinding: productionOriginInventoryBinding(),
    }));
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
      rpc: null,
      endpoint: definition.endpoint,
      httpMethod: "POST",
      contentType: "application/json",
      receiptRpcs: clone(definition.receiptRpcs),
      stableRequestId: payload.operationRequestId,
      requestFingerprint,
      payload,
      diagnosticStateGuard,
      originInventoryBinding: productionOriginInventoryBinding(),
      sqlEnvelope: null,
      runbook: FIXED.runbook,
      warning: "REVIEW ARTIFACT ONLY — THIS TOOL DOES NOT EXECUTE OR AUTHORIZE PRODUCTION CHANGES",
    };
    envelope.envelopeFingerprint = sha256Hex(canonicalJson(envelope));
    return envelope;
  }
  const base = commonPayload(manifest, operation);
  let payload = { ...base, ...operationDefaults(manifest, operation) };
  payload = mergeOperationInput(manifest, operation, payload);
  delete payload.request_fingerprint;
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
