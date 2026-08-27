#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  WAF_CRITICAL_EPOCH_OPERATIONS,
  buildWafCriticalEpochEnvelope,
} from "./waf-critical-epoch.mjs";

export const FIXED = Object.freeze({
  schemaVersion: "bagger-step11.6-operator-v5-acl",
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
  providerFenceAbortConfirmation:
    "ABORT_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL",
  providerFenceRemoveConfirmation: "REMOVE_STEP12_GOOGLE_WRITER_PROVIDER_FENCE",
  rehearsalOwnerFreezeConfirmation:
    "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS REHEARSAL",
  cutoverOwnerFreezeConfirmation:
    "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS PRODUCTION CUTOVER",
  quiesceScope: "PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE",
  originInventoryArtifact: "docs/evidence/step11-6-production-origin-inventory-v4.json",
  originInventorySchema: "step11-6-production-origin-inventory-v4",
  originInventoryCount: 1292,
  originInventoryFingerprint: "9d25299c72424a2b5c3c613649b7f07760fda64c0b0bb4823edaf2cd91622774",
  providerInventoryCount: 1292,
  providerInventoryFingerprint:
    "abd27e4e2747c17053f6debf71ec0f523d39fea8e2383d4911f9dc4b87959cbe",
  credentialConfinementArtifact:
    "docs/evidence/step11-6-production-google-credential-confinement-v4.json",
  credentialConfinementSchema:
    "step11-6-production-google-credential-confinement-v4",
  credentialConfinementRecordCount: 1292,
  credentialConfinementRecordsFingerprint:
    "7549a25c6cbdcec38ea0f331c8aff344cfee837a916ac8871fb5a4956f67838e",
  credentialConfinementEvidenceFingerprint:
    "6f468334a508553cdb9230c14ad85969c89169df6a2ec88011fb2e7e30c9656a",
  credentialConfinementEnvironmentReviewSchema:
    "step11-6-vercel-environment-resource-review-v1",
  credentialConfinementProviderEnvironmentRecordCount: 121,
  credentialConfinementHiddenProductionEnvironmentRecordCount: 0,
  credentialConfinementReviewedEnvironmentRecordCount: 12,
  credentialConfinementReviewedEnvironmentRecordsFingerprint:
    "b7d8cdd805ecbaa05b39b71aec9d904b3df8a0077a38e2adc8762312d3cf4d8a",
  credentialConfinementEnvironmentReviewFingerprint:
    "eae8a72c03308c75d8eea8b330e798b316842a6a3f05791c7acec1f0f1a2dd54",
  credentialConfinementEnvironmentContinuityFingerprint:
    "a5507591c0c3577e9638a8193706b689a7e6da902e6f6216b829df1d4be4254b",
  sourceUnresolvedAllMethodHostCount: 8,
  sourceUnresolvedAllMethodHostsFingerprint:
    "62f14a6635bc9ec16ce681e04b17bbd0f39e9ff55a858bbcb75f4aa75bc3bc4d",
  allMethodFenceRequiredHostCount: 9,
  allMethodFenceRequiredHostsFingerprint:
    "0423e6a742d6527b10afc071856dbc6c5b1cca5e1ffb09a5d2523d0f04b31c0c",
  historicalSafeMethodWriterArtifact:
    "docs/evidence/step11-6-historical-safe-method-google-writer-v2.json",
  historicalSafeMethodWriterSchema:
    "step11-6-historical-safe-method-google-writer-v2",
  historicalSafeMethodWriterEvidenceFingerprint:
    "6cb2ac60314de617f8c94d5d0814d710ec14b47eb4c49fdfa9662fdbe46fcd69",
  historicalSafeMethodWriterAffectedOriginCount: 236,
  historicalSafeMethodWriterAffectedOriginsFingerprint:
    "a8263e02ab7b65df938367fbf39769c70b501a614ebcdfa46800bda2e82de3a2",
  allMethodFenceRequiredPathCount: 1,
  allMethodFenceRequiredPathsFingerprint:
    "fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa",
  historicalWriterScopeArtifact:
    "docs/evidence/step11-6-historical-production-google-writer-scope-v1.json",
  historicalWriterScopeSchema:
    "step11-6-historical-production-google-writer-scope-v1",
  historicalWriterScopeEvidenceFingerprint:
    "2f786886f4b0ec4f070757e8e23f462189304c722a015a260852ccd0888527cd",
  aclAcceptanceArtifact:
    "docs/evidence/step11-6-production-google-drive-acl-v2-acceptance-v1.json",
  historicalCanonicalSheetCount: 17,
  historicalCanonicalSheetsFingerprint:
    "cf8e81dc38a72501fa87c2178f9a6fe06487dc8eeb3e3091169037941f2d2cb7",
  historicalImmutableDenyOriginCount: 10,
  historicalImmutableDenyOriginsFingerprint:
    "1a687f3ea97d9e9d2fe65e6732be2c1d9b80aa563370338d26a71b23a3ffa12f",
  historicalCurrentAliasAwareDenyOriginCount: 12,
  historicalCurrentAliasAwareDenyOriginsFingerprint:
    "3bbe7725448889d88678eb79501a3908613f7e3949f6a026e7b4855477540521",
  activeAliasCensusRecordCount: 56,
  activeAliasCensusRecordsFingerprint:
    "c584b50803b59b52e06d8b699afb0cd22b00c980a3f8be0a7b78f7140f98da1a",
  currentUnresolvedAliasCount: 1,
  currentUnresolvedAliasesFingerprint:
    "7b405a5825ff6abb30c24e48aee1681923df549ca47b044e48e8cb0bc83d1aec",
  historicalWafCanonicalHostname: "baggerinv.com",
  historicalWafRequiredAliasRecaptureCount: 2,
  criticalWindowWafCanonicalHostname: "baggerinv.com",
  criticalWindowWafRequiredAliasRecaptureCount: 2,
  criticalWindowWafGroupCount: 5,
  criticalWindowWafMinimumHoldSeconds: 1810,
  legacyCompatibleBaselineWafMode: "BASELINE",
  criticalWindowWafMode: "CRITICAL_WINDOW",
  legacyDriveRoleOpen: "writer",
  legacyDriveRoleClosed: "reader",
  aclTransitionResultTarget: "TARGET_CONFIRMED",
  aclTransitionResultUnknown: "OUTCOME_UNKNOWN",
  aclAcceptanceSchema: "step11-6-production-google-drive-acl-v2-acceptance-v1",
  providerAliasInventoryRecordCount: 56,
  unsafeCourseAliasHostname:
    "bagger-inv-git-agent-course-hole-be25e6-sandbagger-invitational.vercel.app",
  unsafeCourseAliasDeploymentId: "dpl_73dJVxZVEXkUqrinj17RHVFcjP7j",
  unsafeCourseAliasDeploymentHostname:
    "bagger-kj3c0pkvm-sandbagger-invitational.vercel.app",
  providerSettlementInstallWaitSeconds: 190,
  providerSettlementReadbackWaitSeconds: 10,
  providerSettlementMinimumTotalSeconds: 200,
  providerSettlementFinishAndCloseRpc:
    "finish_close_production_google_writer_provider_fence_install",
  requiredPriorLiveDeploymentId: "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
  requiredFrozenStep11DeploymentId: "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
  originInventoryCapturedAt: "2026-08-27T01:50:43.767Z",
  originInventoryPageRecordsFingerprint:
    "7f19f6f112e2b44b3f6979f7b600a7b926c961cf231fcb2bb583c915b2ababd5",
  minimumLiveOriginInventoryCount: 1292,
  maximumLiveOriginInventoryCount: 1292 + 1,
  quiesceFixedAliasOriginCount: 3,
  quiesceCandidateAliasOriginCount: 1,
  quiesceProbeVectorCount: 11,
  migrationName:
    "202608260040_production_provider_inventory_recertification_v4.sql",
  migrationSha256: "__MIGRATION_040_SHA256_PENDING__",
  runbook: "docs/step12-production-cutover-runbook-v2.md",
});

const REVIEWED_PROJECT_WIDE_PREVIEW_EXCEPTION = Object.freeze({
  recordTuple: ["name", "targets", "gitBranch"],
  shadowedProjectWideRecords: [
    ["GOOGLE_SHEETS_ID", ["preview"], null],
    ["NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY", ["preview"], null],
    ["NEXT_PUBLIC_SUPABASE_AUTH_URL", ["preview"], null],
    ["PARTICIPANT_IDENTITY_AUTHORITY", ["preview"], null],
    ["SCORING_AUTHORITY", ["preview"], null],
  ],
  requiredSameNameExactCandidateOverrides: [
    ["GOOGLE_SHEETS_ID", ["preview"], FIXED.providerFenceBranch],
    ["NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY", ["preview"],
      FIXED.providerFenceBranch],
    ["NEXT_PUBLIC_SUPABASE_AUTH_URL", ["preview"], FIXED.providerFenceBranch],
    ["PARTICIPANT_IDENTITY_AUTHORITY", ["preview"],
      FIXED.providerFenceBranch],
    ["SCORING_AUTHORITY", ["preview"], FIXED.providerFenceBranch],
  ],
  unshadowedNonsecretProjectWideRecords: [
    ["SUPABASE_PARTICIPANT_AUTH_REHEARSAL_ENABLED", ["preview"], null],
    ["SUPABASE_PARTICIPANT_IDENTITY_SHADOW_ENABLED", ["preview"], null],
  ],
  unreviewedProjectWideRelevantRecordAllowed: false,
  wrongBranchRelevantRecordAllowed: false,
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
  "captured_at", "stable_readback_count", "certification_fingerprint",
  "environment_delta_fingerprint_v2",
]);

const PROVIDER_ACTIONS = new Set([
  "issue-begin-provider-attestation-challenge",
  "inspect-begin-provider-attestation-challenge",
  "inspect-begin-provider-attestation-abandonment",
  "abandon-begin-provider-attestation-challenge",
  "issue-finalize-provider-attestation-challenge",
  "inspect-finalize-provider-attestation-challenge",
  "inspect-finalize-provider-attestation-abandonment",
  "abandon-finalize-provider-attestation-challenge",
  "begin-provider-quiesce",
  "finalize-provider-quiesce",
  "inspect-provider-quiesce",
  "install-persistent-provider-fence",
  "abort-persistent-provider-fence-install",
  "inspect-persistent-provider-fence",
  "refresh-persistent-provider-fence",
  "remove-persistent-provider-fence",
]);

const PROVIDER_READ_ONLY_ACTIONS = new Set([
  "inspect-begin-provider-attestation-challenge",
  "inspect-begin-provider-attestation-abandonment",
  "inspect-finalize-provider-attestation-challenge",
  "inspect-finalize-provider-attestation-abandonment",
  "inspect-provider-quiesce",
  "inspect-persistent-provider-fence",
]);

const OWNER_AUTHORIZATION_EXEMPT = new Set([
  "inspect",
  "inspect-scoring-admission",
  "inspect-begin-provider-attestation-challenge",
  "inspect-begin-provider-attestation-abandonment",
  "inspect-finalize-provider-attestation-challenge",
  "inspect-finalize-provider-attestation-abandonment",
  "inspect-provider-quiesce",
  "inspect-persistent-provider-fence",
  "capture-final-google-fingerprint",
]);

const SCOPE_ONLY_INSPECTIONS = new Set([
  "inspect",
  "inspect-scoring-admission",
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
  "inspect-begin-provider-attestation-abandonment": [
    "action", "operationRequestId", "evidenceRequestId", "challengeRequestId",
    "providerAttestationStage", "providerChallengeId", "providerRetainedChallenge",
    "expectedCommitSha", "expectedWorkbookId", "expectedBranch",
    "expectedDirectorPlayerId", "quiescePurpose",
  ],
  "abandon-begin-provider-attestation-challenge": [
    "action", "operationRequestId", "evidenceRequestId", "challengeRequestId",
    "providerAttestationStage", "providerChallengeId", "providerRetainedChallenge",
    "abandonRequestId", "expectedCommitSha", "expectedWorkbookId",
    "expectedBranch", "expectedDirectorPlayerId", "quiescePurpose",
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
  "inspect-finalize-provider-attestation-abandonment": [
    "action", "operationRequestId", "evidenceRequestId", "challengeRequestId",
    "providerAttestationStage", "providerChallengeId", "providerRetainedChallenge",
    "expectedCommitSha", "expectedWorkbookId", "expectedBranch",
    "expectedDirectorPlayerId", "quiescePurpose",
  ],
  "abandon-finalize-provider-attestation-challenge": [
    "action", "operationRequestId", "evidenceRequestId", "challengeRequestId",
    "providerAttestationStage", "providerChallengeId", "providerRetainedChallenge",
    "abandonRequestId", "expectedCommitSha", "expectedWorkbookId",
    "expectedBranch", "expectedDirectorPlayerId", "quiescePurpose",
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
  "abort-persistent-provider-fence-install": [
    "action", "operationRequestId", "installRequestId", "fenceId",
    "quiesceEvidenceId", "expectedCommitSha", "expectedWorkbookId",
    "expectedBranch", "expectedDirectorPlayerId", "expectedBaselineFingerprint",
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
  "inspect-scoring-admission": [],
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
  "inspect-scoring-admission": {
    kind: "rpc-read-only",
    rpc: "inspect_production_scoring_admission",
  },
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
  "inspect-begin-provider-attestation-abandonment": {
    kind: "provider-read-only-payload", rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: ["inspect_production_vercel_provider_challenge_abandonment"],
  },
  "abandon-begin-provider-attestation-challenge": {
    kind: "provider-action-payload", rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: ["abandon_production_vercel_provider_attestation_challenge"],
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
  "inspect-finalize-provider-attestation-abandonment": {
    kind: "provider-read-only-payload", rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: ["inspect_production_vercel_provider_challenge_abandonment"],
  },
  "abandon-finalize-provider-attestation-challenge": {
    kind: "provider-action-payload", rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: ["abandon_production_vercel_provider_attestation_challenge"],
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
      "record_production_google_writer_provider_fence_settlement",
      "record_production_google_writer_provider_fence_settlement",
      "finish_close_production_google_writer_provider_fence_install",
    ],
  },
  "abort-persistent-provider-fence-install": {
    kind: "provider-action-payload",
    rpc: null,
    endpoint: FIXED.providerControlEndpoint,
    receiptRpcs: [
      "abort_production_google_writer_provider_fence_install",
      "inspect_production_google_writer_provider_fence",
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

function requireExactResolved(value, pattern, code, label) {
  const selected = requireString(value, code, label);
  if (unresolved(selected)) refuse(code, `${label} is still an unresolved placeholder.`);
  if (!pattern.test(selected)) refuse(code, `${label} has an invalid format.`);
  return selected;
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

export function exactReviewedProjectWidePreviewException(value) {
  try {
    return canonicalJson(value) ===
      canonicalJson(REVIEWED_PROJECT_WIDE_PREVIEW_EXCEPTION);
  } catch {
    return false;
  }
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
let retainedOriginInventoryDeploymentIds;
let retainedOriginInventoryByOrigin;
let retainedOriginInventoryByDeploymentId;
let credentialConfinementBinding;
let historicalSafeMethodWriterBinding;
let historicalWriterScopeBinding;

export function productionHistoricalSafeMethodWriterBinding() {
  if (historicalSafeMethodWriterBinding) return historicalSafeMethodWriterBinding;
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(new URL(
      "../../docs/evidence/step11-6-historical-safe-method-google-writer-v2.json",
      import.meta.url,
    ), "utf8"));
  } catch {
    refuse("HISTORICAL_SAFE_METHOD_WRITER_ARTIFACT_UNAVAILABLE",
      "The historical safe-method Google-writer artifact could not be loaded.");
  }
  const { evidenceFingerprint, ...base } = artifact;
  const writer = artifact.historicalSafeMethodWriter;
  const contract = artifact.providerFenceContract;
  const paths = contract?.blockedRequestPaths;
  const origins = writer?.affectedReadyOrigins;
  if (artifact.schemaVersion !== FIXED.historicalSafeMethodWriterSchema ||
      artifact.originInventorySchemaVersion !== FIXED.originInventorySchema ||
      artifact.originInventoryProviderRecordCount !== FIXED.providerInventoryCount ||
      artifact.originInventoryProviderRecordsFingerprint !==
        FIXED.providerInventoryFingerprint ||
      evidenceFingerprint !== FIXED.historicalSafeMethodWriterEvidenceFingerprint ||
      sha256Hex(JSON.stringify(base)) !== evidenceFingerprint ||
      writer?.operationClass !== "MIRROR_ARCHIVE" ||
      writer?.writerIntent !== "MIRROR_ARCHIVE" ||
      writer?.affectedReadyOriginCount !==
        FIXED.historicalSafeMethodWriterAffectedOriginCount ||
      !Array.isArray(origins) || origins.length !==
        FIXED.historicalSafeMethodWriterAffectedOriginCount ||
      sha256Hex(JSON.stringify(origins)) !==
        FIXED.historicalSafeMethodWriterAffectedOriginsFingerprint ||
      !Array.isArray(paths) || paths.length !==
        FIXED.allMethodFenceRequiredPathCount ||
      sha256Hex(JSON.stringify(paths)) !==
        FIXED.allMethodFenceRequiredPathsFingerprint ||
      contract?.blockedRequestPathsFingerprint !==
        FIXED.allMethodFenceRequiredPathsFingerprint ||
      contract?.conditionType !== "path" || contract?.conditionOperator !== "inc" ||
      contract?.methodScope !== "ALL_METHODS" ||
      contract?.conditionGroupRelation !== "OR" ||
      contract?.sourceUnresolvedReadyOriginsRemainCoveredByExactHostAllMethodGroup !==
        true) {
    refuse("HISTORICAL_SAFE_METHOD_WRITER_ARTIFACT_INVALID",
      "The historical safe-method Google-writer artifact was invalid.");
  }
  historicalSafeMethodWriterBinding = Object.freeze({
    artifact: FIXED.historicalSafeMethodWriterArtifact,
    schemaVersion: artifact.schemaVersion,
    evidenceFingerprint,
    affectedOriginCount: writer.affectedReadyOriginCount,
    affectedOriginsFingerprint: writer.affectedReadyOriginsFingerprint,
    allMethodFenceRequiredPathCount: contract.blockedRequestPathCount,
    allMethodFenceRequiredPathsFingerprint:
      contract.blockedRequestPathsFingerprint,
  });
  return historicalSafeMethodWriterBinding;
}

export function productionHistoricalWriterScopeBinding() {
  if (historicalWriterScopeBinding) return historicalWriterScopeBinding;
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(new URL(
      "../../docs/evidence/step11-6-historical-production-google-writer-scope-v1.json",
      import.meta.url,
    ), "utf8"));
  } catch {
    refuse("HISTORICAL_WRITER_SCOPE_ARTIFACT_UNAVAILABLE",
      "The historical Production Google writer-scope artifact could not be loaded.");
  }
  const { evidenceFingerprint, ...base } = artifact;
  const source = artifact.retainedSourceAudit;
  const sheets = artifact.canonicalWorksheetScope;
  const fence = artifact.persistentProviderFence;
  const waf = fence?.permanentWafContract;
  const settlement = artifact.primaryCanonicalProviderSettlement;
  if (artifact.schemaVersion !== FIXED.historicalWriterScopeSchema ||
      evidenceFingerprint !== FIXED.historicalWriterScopeEvidenceFingerprint ||
      sha256Hex(JSON.stringify(base)) !== evidenceFingerprint ||
      artifact.inputs?.activeAliasRecordCount !== FIXED.activeAliasCensusRecordCount ||
      artifact.inputs?.activeAliasRecordsFingerprint !==
        FIXED.activeAliasCensusRecordsFingerprint ||
      source?.sourceUnresolvedReadyDeploymentCount !==
        FIXED.sourceUnresolvedAllMethodHostCount ||
      source?.sourceUnresolvedReadyOriginsFingerprint !==
        FIXED.sourceUnresolvedAllMethodHostsFingerprint ||
      sheets?.currentUnionHistoricalCanonicalSheetCount !==
        FIXED.historicalCanonicalSheetCount ||
      sheets?.currentUnionHistoricalCanonicalSheetsFingerprint !==
        FIXED.historicalCanonicalSheetsFingerprint ||
      sheets?.currentMinusHistorical?.length !== 0 ||
      sheets?.historicalMinusCurrent?.length !== 0 ||
      sheets?.unresolvedDynamicCanonicalTargetCount !== 0 ||
      fence?.immutableAllMethodDenyOriginCount !==
        FIXED.historicalImmutableDenyOriginCount ||
      fence?.immutableAllMethodDenyOriginsFingerprint !==
        FIXED.historicalImmutableDenyOriginsFingerprint ||
      fence?.currentAliasAwareAllMethodDenyOriginCount !==
        FIXED.historicalCurrentAliasAwareDenyOriginCount ||
      fence?.currentAliasAwareAllMethodDenyOriginsFingerprint !==
        FIXED.historicalCurrentAliasAwareDenyOriginsFingerprint ||
      waf?.canonicalHostname !== FIXED.historicalWafCanonicalHostname ||
      waf?.action !== "DENY" || waf?.active !== true ||
      waf?.projectWide !== true || waf?.earlierActiveBypassRuleCount !== 0 ||
      waf?.noncanonicalCanonicalMutationGroup?.hostnameOperator !==
        "DOES_NOT_EQUAL" ||
      waf?.noncanonicalCanonicalMutationGroup?.requestPathOperator !==
        "DOES_NOT_EQUAL" ||
      waf?.noncanonicalCanonicalMutationGroup?.requestPath !==
        FIXED.providerControlEndpoint ||
      waf?.noncanonicalCanonicalMutationGroup?.methodOperator !==
        "IS_NOT_ANY_OF" ||
      canonicalJson(waf?.noncanonicalCanonicalMutationGroup?.methods) !==
        canonicalJson(["GET", "HEAD", "OPTIONS"]) ||
      fence?.executableAllMethodHostOriginCount !==
        FIXED.allMethodFenceRequiredHostCount ||
      fence?.executableAllMethodHostOriginsFingerprint !==
        FIXED.allMethodFenceRequiredHostsFingerprint ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup?.hostCount !==
        FIXED.allMethodFenceRequiredHostCount ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup?.hostsFingerprint !==
        FIXED.allMethodFenceRequiredHostsFingerprint ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup
        ?.sourceUnresolvedImmutableOriginCount !==
        FIXED.sourceUnresolvedAllMethodHostCount ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup
        ?.sourceUnresolvedImmutableOriginsFingerprint !==
        FIXED.sourceUnresolvedAllMethodHostsFingerprint ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup?.exactUnsafeAliasCount !==
        FIXED.currentUnresolvedAliasCount ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup
        ?.exactUnsafeAliasesFingerprint !==
        FIXED.currentUnresolvedAliasesFingerprint ||
      waf?.sourceUnresolvedAndUnsafeAliasAllMethodGroup
        ?.exactUnsafeAliasIncludedAsIncomingRequestHostname !== true ||
      waf?.noncanonicalRoundScorecardsAllMethodGroup?.hostnameOperator !==
        "DOES_NOT_EQUAL" ||
      canonicalJson(waf?.noncanonicalRoundScorecardsAllMethodGroup?.paths) !==
        canonicalJson(["/api/cron/round-scorecards-archive"]) ||
      waf?.noncanonicalRoundScorecardsAllMethodGroup?.methods !== "ALL_METHODS" ||
      waf?.aliasRecapture?.requiredConsecutiveProviderCaptures !==
        FIXED.historicalWafRequiredAliasRecaptureCount ||
      waf?.aliasRecapture?.providerSignedBeginAndFinalizeCapturesRequired !== true ||
      waf?.aliasRecapture?.browserSuppliedAliasInventoryAllowed !== false ||
      waf?.aliasRecapture?.providerAdminChangeFreezeRequired !== true ||
      waf?.aliasRecapture?.failClosedOnAnyAliasDrift !== true ||
      waf?.historicalEvidenceBindings?.immutableOriginCount !==
        FIXED.historicalImmutableDenyOriginCount ||
      waf?.historicalEvidenceBindings?.immutableOriginsFingerprint !==
        FIXED.historicalImmutableDenyOriginsFingerprint ||
      waf?.historicalEvidenceBindings?.aliasAwareOriginCount !==
        FIXED.historicalCurrentAliasAwareDenyOriginCount ||
      waf?.historicalEvidenceBindings?.aliasAwareOriginsFingerprint !==
        FIXED.historicalCurrentAliasAwareDenyOriginsFingerprint ||
      settlement?.minimumDatabaseClockSecondsAfterT0ForFirstReadback !==
        FIXED.providerSettlementInstallWaitSeconds ||
      settlement?.minimumDatabaseClockSecondsBetweenIndependentReadbacks !==
        FIXED.providerSettlementReadbackWaitSeconds ||
      settlement?.minimumTotalDatabaseClockSecondsAfterT0 !==
        FIXED.providerSettlementMinimumTotalSeconds ||
      settlement?.finishAndCloseRpc !==
        FIXED.providerSettlementFinishAndCloseRpc ||
      settlement?.acceptedAsPrimaryProof !== false ||
      artifact.conclusion?.unexplainedConcurrencyWindowCount !== 1) {
    refuse("HISTORICAL_WRITER_SCOPE_ARTIFACT_INVALID",
      "The historical Production Google writer-scope artifact was invalid or drifted.");
  }
  historicalWriterScopeBinding = Object.freeze({
    artifact: FIXED.historicalWriterScopeArtifact,
    schemaVersion: artifact.schemaVersion,
    evidenceFingerprint,
    canonicalSheetCount: sheets.currentUnionHistoricalCanonicalSheetCount,
    canonicalSheetsFingerprint:
      sheets.currentUnionHistoricalCanonicalSheetsFingerprint,
    sourceUnresolvedImmutableOriginCount:
      source.sourceUnresolvedReadyDeploymentCount,
    sourceUnresolvedImmutableOriginsFingerprint:
      source.sourceUnresolvedReadyOriginsFingerprint,
    historicalImmutableOriginCount: fence.immutableAllMethodDenyOriginCount,
    historicalImmutableOriginsFingerprint:
      fence.immutableAllMethodDenyOriginsFingerprint,
    historicalAliasAwareOriginCount:
      fence.currentAliasAwareAllMethodDenyOriginCount,
    historicalAliasAwareOriginsFingerprint:
      fence.currentAliasAwareAllMethodDenyOriginsFingerprint,
    activeAliasRecordCount: artifact.inputs.activeAliasRecordCount,
    activeAliasRecordsFingerprint: artifact.inputs.activeAliasRecordsFingerprint,
    currentUnresolvedAliasCount:
      waf.sourceUnresolvedAndUnsafeAliasAllMethodGroup.exactUnsafeAliasCount,
    currentUnresolvedAliasesFingerprint:
      waf.sourceUnresolvedAndUnsafeAliasAllMethodGroup.exactUnsafeAliasesFingerprint,
    settlementAcceptedAsPrimaryProof: settlement.acceptedAsPrimaryProof,
    unexplainedConcurrencyWindowCount:
      artifact.conclusion.unexplainedConcurrencyWindowCount,
  });
  return historicalWriterScopeBinding;
}

const ACL_V2_ACCEPTANCE_KEYS = Object.freeze([
  "artifactPath", "schemaVersion", "acceptanceFingerprint",
  "acceptedAsPrimaryProof",
  "unexplainedConcurrencyWindowCount", "historicalWriterScopeArtifact",
  "historicalWriterScopeEvidenceFingerprint", "rehearsalCandidateSha",
  "rehearsalDeploymentId",
  "migrationSha256", "productionProjectRef", "sourceWorkbookId",
  "originInventoryFingerprint", "credentialConfinementEvidenceFingerprint",
  "lifecycleMode", "mechanism", "baselineWafMode", "criticalWindowWafMode",
  "criticalWindowWafGroupCount", "baselineWafFingerprint",
  "criticalWindowWafFingerprint", "restoredWafFingerprint",
  "criticalWindowActivatedAt", "criticalWindowHeldSeconds",
  "criticalWindowMinimumHoldSeconds", "fenceId", "installRequestId",
  "quiesceEvidenceId", "restoreQuiesceEvidenceId", "forwardDispatchId",
  "forwardDispatchResult", "forwardTransitionProofFingerprint",
  "aclReaderConfirmedAt", "reverseDispatchId", "reverseDispatchResult",
  "reverseTransitionProofFingerprint", "restoreCriticalWindowActivatedAt",
  "aclWriterRestoredAt", "rehearsalRestoredAt",
  "settlementReadback1Id", "settlementReadback2Id", "legacyRoleBefore",
  "legacyRoleDuring", "legacyRoleAfter", "legacyCanEditDuring",
  "legacyCanShareDuring", "legacyPrincipalFingerprint",
  "unknownAclDispatchCount", "wafBaselineRestored",
  "googleDataMutationCount", "supabaseCanonicalWriteCount",
  "oldDeploymentEnforcementPassed", "staleClientEnforcementPassed",
  "lowLevelWriterEnforcementPassed", "previewIsolationPassed",
  "restoredProductionStatePassed", "capturedAt",
]);

export function computeAclV2AcceptanceFingerprint(acceptance) {
  requireObject(acceptance, "ACL_V2_ACCEPTANCE_REQUIRED", "aclV2Acceptance");
  const material = clone(acceptance);
  delete material.acceptanceFingerprint;
  return sha256Hex(canonicalJson({
    domain: "BAGGER_STEP11_6_PRODUCTION_GOOGLE_DRIVE_ACL_V2_ACCEPTANCE_V1",
    acceptance: material,
  }));
}

let aclV2AcceptanceArtifactTestOverride = null;

/** Test-only immutable-artifact seam. Production CLI paths always read the
 * fixed repository artifact. This exists so focused tests can exercise the
 * post-rehearsal state before the real provider/DB-derived artifact exists. */
export function setAclV2AcceptanceArtifactForTest(artifact) {
  const testContext = process.execArgv.includes("--test") ||
    String(process.argv[1] || "").endsWith("/operator.test.mjs");
  if (!testContext) {
    refuse("ACL_V2_ACCEPTANCE_TEST_OVERRIDE_FORBIDDEN",
      "The ACL-v2 artifact override is available only to the Node test runner.");
  }
  aclV2AcceptanceArtifactTestOverride = clone(requireObject(
    artifact, "ACL_V2_ACCEPTANCE_REQUIRED", "aclV2AcceptanceArtifact"));
}

function loadAclV2AcceptanceArtifact() {
  if (aclV2AcceptanceArtifactTestOverride) {
    return { artifact: clone(aclV2AcceptanceArtifactTestOverride), error: null };
  }
  try {
    const artifact = JSON.parse(readFileSync(new URL(
      "../../docs/evidence/step11-6-production-google-drive-acl-v2-acceptance-v1.json",
      import.meta.url,
    ), "utf8"));
    assertNoSecrets(artifact, FIXED.aclAcceptanceArtifact);
    return { artifact, error: null };
  } catch (error) {
    return {
      artifact: null,
      error: `ACL-v2 acceptance artifact unavailable: ${error?.message || "unknown error"}`,
    };
  }
}

function validateAclV2Acceptance(manifest) {
  const acceptance = requireObject(manifest.aclV2Acceptance,
    "ACL_V2_ACCEPTANCE_REQUIRED", "aclV2Acceptance");
  if (!exactObjectKeys(acceptance, ACL_V2_ACCEPTANCE_KEYS)) {
    refuse("ACL_V2_ACCEPTANCE_CONTRACT_INVALID",
      "aclV2Acceptance must have the exact sanitized ACL-v2 field set.");
  }
  requireEqual(acceptance.artifactPath, FIXED.aclAcceptanceArtifact,
    "ACL_V2_ACCEPTANCE_BINDING_DRIFT", "aclV2Acceptance.artifactPath");
  requireEqual(acceptance.schemaVersion, FIXED.aclAcceptanceSchema,
    "ACL_V2_ACCEPTANCE_CONTRACT_INVALID", "aclV2Acceptance.schemaVersion");
  requireEqual(acceptance.historicalWriterScopeArtifact,
    FIXED.historicalWriterScopeArtifact, "ACL_V2_ACCEPTANCE_BINDING_DRIFT",
    "aclV2Acceptance.historicalWriterScopeArtifact");
  requireEqual(acceptance.historicalWriterScopeEvidenceFingerprint,
    FIXED.historicalWriterScopeEvidenceFingerprint,
    "ACL_V2_ACCEPTANCE_BINDING_DRIFT",
    "aclV2Acceptance.historicalWriterScopeEvidenceFingerprint");
  requireEqual(acceptance.productionProjectRef, FIXED.projectRef,
    "ACL_V2_ACCEPTANCE_BINDING_DRIFT", "aclV2Acceptance.productionProjectRef");
  requireEqual(acceptance.sourceWorkbookId, FIXED.sourceWorkbookId,
    "ACL_V2_ACCEPTANCE_BINDING_DRIFT", "aclV2Acceptance.sourceWorkbookId");
  requireEqual(acceptance.originInventoryFingerprint,
    FIXED.originInventoryFingerprint, "ACL_V2_ACCEPTANCE_BINDING_DRIFT",
    "aclV2Acceptance.originInventoryFingerprint");
  requireEqual(acceptance.credentialConfinementEvidenceFingerprint,
    FIXED.credentialConfinementEvidenceFingerprint,
    "ACL_V2_ACCEPTANCE_BINDING_DRIFT",
    "aclV2Acceptance.credentialConfinementEvidenceFingerprint");
  requireEqual(acceptance.lifecycleMode, "REHEARSAL",
    "ACL_V2_ACCEPTANCE_CONTRACT_INVALID", "aclV2Acceptance.lifecycleMode");
  requireEqual(acceptance.mechanism, "DRIVE_ACL_EXACT_LEGACY_PERMISSION_V2",
    "ACL_V2_ACCEPTANCE_CONTRACT_INVALID", "aclV2Acceptance.mechanism");
  requireEqual(acceptance.baselineWafMode, FIXED.legacyCompatibleBaselineWafMode,
    "ACL_V2_ACCEPTANCE_CONTRACT_INVALID", "aclV2Acceptance.baselineWafMode");
  requireEqual(acceptance.criticalWindowWafMode, FIXED.criticalWindowWafMode,
    "ACL_V2_ACCEPTANCE_CONTRACT_INVALID",
    "aclV2Acceptance.criticalWindowWafMode");
  requireEqual(acceptance.criticalWindowWafGroupCount,
    FIXED.criticalWindowWafGroupCount, "ACL_V2_ACCEPTANCE_CONTRACT_INVALID",
    "aclV2Acceptance.criticalWindowWafGroupCount");
  requireEqual(acceptance.criticalWindowMinimumHoldSeconds,
    FIXED.criticalWindowWafMinimumHoldSeconds,
    "ACL_V2_ACCEPTANCE_CONTRACT_INVALID",
    "aclV2Acceptance.criticalWindowMinimumHoldSeconds");
  for (const field of [
    "acceptedAsPrimaryProof", "legacyCanEditDuring", "legacyCanShareDuring",
    "wafBaselineRestored", "oldDeploymentEnforcementPassed",
    "staleClientEnforcementPassed", "lowLevelWriterEnforcementPassed",
    "previewIsolationPassed", "restoredProductionStatePassed",
  ]) requireBoolean(acceptance[field], "ACL_V2_ACCEPTANCE_CONTRACT_INVALID",
    `aclV2Acceptance.${field}`);
  for (const field of [
    "unexplainedConcurrencyWindowCount", "criticalWindowHeldSeconds",
    "criticalWindowMinimumHoldSeconds", "unknownAclDispatchCount",
    "googleDataMutationCount", "supabaseCanonicalWriteCount",
  ]) {
    requireInteger(acceptance[field], "ACL_V2_ACCEPTANCE_CONTRACT_INVALID",
      `aclV2Acceptance.${field}`);
    if (acceptance[field] < 0) refuse("ACL_V2_ACCEPTANCE_CONTRACT_INVALID",
      `aclV2Acceptance.${field} cannot be negative.`);
  }
  for (const field of [
    "acceptanceFingerprint", "rehearsalCandidateSha", "rehearsalDeploymentId",
    "migrationSha256",
    "baselineWafFingerprint", "criticalWindowWafFingerprint",
    "restoredWafFingerprint", "criticalWindowActivatedAt", "forwardDispatchId",
    "reverseDispatchId", "settlementReadback1Id", "settlementReadback2Id",
    "fenceId", "installRequestId", "quiesceEvidenceId",
    "restoreQuiesceEvidenceId", "forwardTransitionProofFingerprint",
    "aclReaderConfirmedAt", "reverseTransitionProofFingerprint",
    "restoreCriticalWindowActivatedAt", "aclWriterRestoredAt",
    "rehearsalRestoredAt", "legacyRoleDuring",
    "legacyPrincipalFingerprint", "capturedAt",
  ]) requireString(acceptance[field], "ACL_V2_ACCEPTANCE_CONTRACT_INVALID",
    `aclV2Acceptance.${field}`);
  for (const field of ["forwardDispatchResult", "reverseDispatchResult"]) {
    if (!new Set(["NOT_DISPATCHED", FIXED.aclTransitionResultTarget,
      FIXED.aclTransitionResultUnknown]).has(acceptance[field])) {
      refuse("ACL_V2_ACCEPTANCE_CONTRACT_INVALID",
        `aclV2Acceptance.${field} is not a certified ACL result.`);
    }
  }
  requireEqual(acceptance.legacyRoleBefore, FIXED.legacyDriveRoleOpen,
    "ACL_V2_ACCEPTANCE_CONTRACT_INVALID", "aclV2Acceptance.legacyRoleBefore");
  requireEqual(acceptance.legacyRoleAfter, FIXED.legacyDriveRoleOpen,
    "ACL_V2_ACCEPTANCE_CONTRACT_INVALID", "aclV2Acceptance.legacyRoleAfter");
  if (!unresolved(acceptance.legacyRoleDuring)) {
    requireEqual(acceptance.legacyRoleDuring, FIXED.legacyDriveRoleClosed,
      "ACL_V2_ACCEPTANCE_CONTRACT_INVALID", "aclV2Acceptance.legacyRoleDuring");
  }
  if (!unresolved(acceptance.acceptanceFingerprint)) {
    requireResolved(acceptance.acceptanceFingerprint, HEX64,
      "ACL_V2_ACCEPTANCE_FINGERPRINT_INVALID",
      "aclV2Acceptance.acceptanceFingerprint");
  }
  return acceptance;
}

/**
 * Revalidate the repository-retained all-project provider census without ever
 * accepting an operator-supplied origin list. The application route repeats
 * this validation server-side, signs the exact live provider scope, and sends
 * only the derived six-field projection to the database.
 */
export function productionOriginInventoryBinding() {
  if (retainedOriginInventoryBinding) return retainedOriginInventoryBinding;
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(new URL(
      "../../docs/evidence/step11-6-production-origin-inventory-v4.json",
      import.meta.url,
    ), "utf8"));
  } catch {
    refuse("ORIGIN_INVENTORY_ARTIFACT_UNAVAILABLE",
      "The retained Production deployment inventory could not be loaded.");
  }
  const providerRecordTuple = [
    "deploymentId", "sha", "providerCommitSha", "origin", "deploymentTarget",
    "gitBranch", "providerSource", "deploymentStatus", "createdAt", "shaResolution",
  ];
  const recordTuple = [
    "deploymentId", "sha", "origin", "scopeClass", "deploymentStatus",
    "providerMetadataFingerprint",
  ];
  const scopeClasses = {
    PRODUCTION_TARGET: {
      deploymentTarget: "PRODUCTION", deploymentEnvironment: "PRODUCTION",
      credentialCapabilities: [
        "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0", "PRODUCTION_WORKBOOK_SELECTOR",
      ],
    },
    PROJECT_PREVIEW: {
      deploymentTarget: "PREVIEW", deploymentEnvironment: "PREVIEW",
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
  const requiredDeployments = {
    priorLive: FIXED.requiredPriorLiveDeploymentId,
    frozenStep11: FIXED.requiredFrozenStep11DeploymentId,
    step11_6CandidateV1: "dpl_2oK3GmMa8f93wqjHNp1Gp2Y6Paox",
    step11_6CandidateV2: "dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm",
  };
  if (!exactObjectKeys(artifact, [
    "schemaVersion", "vercelProjectId", "vercelTeamId", "capturedAt",
    "providerRecordTuple", "recordTuple", "scopeClasses", "statusSemantics",
    "paginationEvidence", "coverageSummary", "providerRecordCount", "recordCount",
    "providerRecordsFingerprint", "recordsFingerprint", "requiredDeployments",
    "providerRecords", "records",
  ]) || artifact.schemaVersion !== FIXED.originInventorySchema ||
      artifact.vercelProjectId !== FIXED.vercelProjectId ||
      artifact.vercelTeamId !== "team_kPw5zaib8uaQJALAwj4fWI6R" ||
      artifact.capturedAt !== FIXED.originInventoryCapturedAt ||
      canonicalJson(artifact.providerRecordTuple) !== canonicalJson(providerRecordTuple) ||
      canonicalJson(artifact.recordTuple) !== canonicalJson(recordTuple) ||
      canonicalJson(artifact.scopeClasses) !== canonicalJson(scopeClasses) ||
      canonicalJson(artifact.statusSemantics) !== canonicalJson(statusSemantics) ||
      canonicalJson(artifact.requiredDeployments) !== canonicalJson(requiredDeployments) ||
      artifact.providerRecordCount !== FIXED.providerInventoryCount ||
      artifact.recordCount !== FIXED.originInventoryCount ||
      artifact.providerRecordsFingerprint !== FIXED.providerInventoryFingerprint ||
      artifact.recordsFingerprint !== FIXED.originInventoryFingerprint ||
      !Array.isArray(artifact.providerRecords) ||
      artifact.providerRecords.length !== FIXED.providerInventoryCount ||
      !Array.isArray(artifact.records) ||
      artifact.records.length !== FIXED.originInventoryCount) {
    refuse("ORIGIN_INVENTORY_ARTIFACT_INVALID",
      "The retained Production deployment inventory header is invalid.");
  }
  const providerSources = new Set(["CLI", "GIT", "IMPORT", "REDEPLOY", "UNAVAILABLE"]);
  const shaResolutions = new Set([
    "EXACT_PROVIDER", "LOCAL_GIT_ABBREVIATION", "UNAVAILABLE",
  ]);
  const providerRecords = artifact.providerRecords.map((record, index) => {
    if (!Array.isArray(record) || record.length !== providerRecordTuple.length) {
      refuse("ORIGIN_INVENTORY_ARTIFACT_INVALID",
        `Provider inventory record ${index} is not an exact ten-field tuple.`);
    }
    const [rawDeploymentId, rawSha, rawProviderCommitSha, rawOrigin,
      rawDeploymentTarget, rawGitBranch, rawProviderSource, rawDeploymentStatus,
      rawCreatedAt, rawShaResolution] = record;
    const deploymentId = String(rawDeploymentId || "");
    const sha = rawSha === null ? null : String(rawSha).toLowerCase();
    const providerCommitSha = rawProviderCommitSha === null
      ? null : String(rawProviderCommitSha).toLowerCase();
    const origin = exactProductionOrigin(rawOrigin);
    const deploymentTarget = String(rawDeploymentTarget || "");
    const gitBranch = rawGitBranch === null ? null : String(rawGitBranch);
    const providerSource = String(rawProviderSource || "");
    const deploymentStatus = String(rawDeploymentStatus || "");
    const createdAt = String(rawCreatedAt || "");
    const shaResolution = String(rawShaResolution || "");
    const exactProviderSha = shaResolution === "EXACT_PROVIDER" &&
      sha !== null && providerCommitSha === sha && HEX40.test(sha);
    const locallyResolved = shaResolution === "LOCAL_GIT_ABBREVIATION" &&
      sha !== null && HEX40.test(sha) && providerCommitSha !== null &&
      /^[0-9a-f]{7,39}$/.test(providerCommitSha) && sha.startsWith(providerCommitSha);
    const unavailable = shaResolution === "UNAVAILABLE" && sha === null &&
      providerCommitSha === null && gitBranch === null && providerSource === "CLI";
    if (!DEPLOYMENT_ID.test(deploymentId) || !origin ||
        !new Set(["PRODUCTION", "PREVIEW"]).has(deploymentTarget) ||
        (gitBranch !== null && (!gitBranch || gitBranch.length > 240)) ||
        !providerSources.has(providerSource) ||
        !statusSemantics[deploymentStatus] ||
        Number.isNaN(Date.parse(createdAt)) ||
        new Date(Date.parse(createdAt)).toISOString() !== createdAt ||
        !shaResolutions.has(shaResolution) ||
        !(exactProviderSha || locallyResolved || unavailable) ||
        (deploymentTarget === "PRODUCTION" &&
          (gitBranch !== "main" || sha === null))) {
      refuse("ORIGIN_INVENTORY_ARTIFACT_INVALID",
        `Provider inventory record ${index} is outside the exact provider contract.`);
    }
    return {
      deploymentId, sha, providerCommitSha, origin, deploymentTarget, gitBranch,
      providerSource, deploymentStatus, createdAt, shaResolution,
    };
  });
  const records = artifact.records.map((record, index) => {
    if (!Array.isArray(record) || record.length !== recordTuple.length) {
      refuse("ORIGIN_INVENTORY_ARTIFACT_INVALID",
        `Origin inventory record ${index} is not an exact six-field tuple.`);
    }
    const [rawDeploymentId, rawSha, rawOrigin, rawScopeClass,
      rawDeploymentStatus, rawProviderMetadataFingerprint] = record;
    const deploymentId = requireString(rawDeploymentId,
      "ORIGIN_INVENTORY_ARTIFACT_INVALID", `origin inventory record ${index}.deploymentId`);
    const sha = rawSha === null ? null : String(rawSha).toLowerCase();
    const origin = exactProductionOrigin(rawOrigin);
    const scopeClass = String(rawScopeClass || "");
    const deploymentStatus = String(rawDeploymentStatus || "");
    const providerMetadataFingerprint = String(rawProviderMetadataFingerprint || "");
    const scope = scopeClasses[scopeClass];
    const status = statusSemantics[deploymentStatus];
    if (!DEPLOYMENT_ID.test(deploymentId) ||
        (sha !== null && !HEX40.test(sha)) || !origin || !scope || !status ||
        !HEX64.test(providerMetadataFingerprint)) {
      refuse("ORIGIN_INVENTORY_ARTIFACT_INVALID",
        `Origin inventory record ${index} is outside the frozen Production scope.`);
    }
    return {
      deploymentId, sha, origin, scopeClass, deploymentStatus,
      providerMetadataFingerprint,
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
  const providerSorted = [...providerRecords].sort((left, right) =>
    codepointCompare(`${left.deploymentId}\n${left.origin}`,
      `${right.deploymentId}\n${right.origin}`));
  const providerKeys = providerRecords.map((record) =>
    `${record.deploymentId}\n${record.origin}`);
  const nullShaCount = providerRecords.filter((record) => record.sha === null).length;
  const productionTargetCount = records.filter((record) =>
    record.scopeClass === "PRODUCTION_TARGET").length;
  const projectPreviewCount = records.filter((record) =>
    record.scopeClass === "PROJECT_PREVIEW").length;
  const derivedRecords = providerRecords.map((record) => [
    record.deploymentId,
    record.sha,
    record.origin,
    record.deploymentTarget === "PRODUCTION" ? "PRODUCTION_TARGET" : "PROJECT_PREVIEW",
    record.deploymentStatus,
    sha256Hex(JSON.stringify([
      record.providerCommitSha, record.deploymentTarget, record.gitBranch,
      record.providerSource, record.createdAt, record.shaResolution,
    ])),
  ]);
  const countBy = (values) => Object.fromEntries([...values.reduce((counts, value) =>
    counts.set(value, (counts.get(value) || 0) + 1), new Map()).entries()]
    .sort(([left], [right]) => codepointCompare(left, right)));
  const branchCountMap = new Map();
  for (const record of providerRecords) {
    const branch = record.gitBranch ?? "__UNAVAILABLE__";
    branchCountMap.set(branch, (branchCountMap.get(branch) || 0) + 1);
  }
  const expectedCoverageSummary = {
    targetCounts: countBy(providerRecords.map((record) => record.deploymentTarget)),
    statusCounts: countBy(providerRecords.map((record) => record.deploymentStatus)),
    providerSourceCounts: countBy(providerRecords.map((record) => record.providerSource)),
    shaResolutionCounts: countBy(providerRecords.map((record) => record.shaResolution)),
    branchCounts: [...branchCountMap.entries()].sort(([left], [right]) =>
      codepointCompare(left, right)),
    nullShaRecordCount: nullShaCount,
    nullShaReadyRecordCount: providerRecords.filter((record) =>
      record.sha === null && record.deploymentStatus === "READY").length,
    providerCommitShaUnavailableCount: providerRecords.filter((record) =>
      record.providerCommitSha === null).length,
    nullBranchRecordCount: providerRecords.filter((record) =>
      record.gitBranch === null).length,
  };
  const pagination = artifact.paginationEvidence;
  const exactPagination = exactObjectKeys(pagination, [
    "queryScope", "pageLimit", "firstPass", "secondPass", "exactPassMatch",
    "remainingCursor",
  ]) && pagination.queryScope === "ALL_PROJECT_DEPLOYMENTS_NO_TARGET_OR_BRANCH_FILTER" &&
    pagination.pageLimit === 100 && pagination.exactPassMatch === true &&
    pagination.remainingCursor === null &&
    exactObjectKeys(pagination.firstPass, [
      "pageCount", "recordCount", "pageRecordsFingerprint",
    ]) && exactObjectKeys(pagination.secondPass, [
      "pageCount", "recordCount", "pageRecordsFingerprint",
    ]) && pagination.firstPass.pageCount === 13 &&
    pagination.secondPass.pageCount === 13 &&
    pagination.firstPass.recordCount === records.length &&
    pagination.secondPass.recordCount === records.length &&
    pagination.firstPass.pageRecordsFingerprint ===
      FIXED.originInventoryPageRecordsFingerprint &&
    pagination.secondPass.pageRecordsFingerprint ===
      FIXED.originInventoryPageRecordsFingerprint;
  const requiredTuples = [
    [
      "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
      "561a61946be3536c7e32b46be53e4683cbb45579",
      "https://bagger-drmix94o0-sandbagger-invitational.vercel.app",
      "PRODUCTION_TARGET", "READY",
      "0383e746abde16275626a8bcd41a38853eb9fe6e2cb036ef7658d21c23d9f5e8",
    ],
    [
      "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
      "be5531faca009e26617496e47831f365a1b4997b",
      "https://bagger-mribo6cqh-sandbagger-invitational.vercel.app",
      "PROJECT_PREVIEW", "READY",
      "0c8b213bcad5397731982762bf178cc961254b79a6be5a3b75e71e547ef9dc71",
    ],
    [
      "dpl_2oK3GmMa8f93wqjHNp1Gp2Y6Paox",
      "a0b79cdef3a34d640e9411035792bd1e91989566",
      "https://bagger-pmt7catuz-sandbagger-invitational.vercel.app",
      "PROJECT_PREVIEW", "READY",
      "acb7fa3de11c8e6e5704c41a22b1693b42428b7b70c1d9ed73763ea6330ddb8e",
    ],
    [
      "dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm",
      "0671bb3b84ac5846218ea60838fe4e1cc07de97f",
      "https://bagger-6lfjugfk7-sandbagger-invitational.vercel.app",
      "PROJECT_PREVIEW", "READY",
      "23d503936f3f41ede80f5e03d7b5df423d43d120d88fbf5c2aeb781866628913",
    ],
  ];
  if (records.some((record, index) =>
        keys[index] !== `${sorted[index].deploymentId}\n${sorted[index].origin}`) ||
      providerRecords.some((record, index) =>
        providerKeys[index] !==
          `${providerSorted[index].deploymentId}\n${providerSorted[index].origin}`) ||
      new Set(keys).size !== records.length ||
      new Set(providerKeys).size !== providerRecords.length ||
      canonicalJson(keys) !== canonicalJson(providerKeys) ||
      canonicalJson(derivedRecords) !== canonicalJson(artifact.records) ||
      canonicalJson(expectedCoverageSummary) !==
        canonicalJson(artifact.coverageSummary) || !exactPagination ||
      nullShaCount !== 8 || productionTargetCount !== 458 ||
      projectPreviewCount !== 834 ||
      !records.some((record) =>
        record.deploymentId === FIXED.requiredPriorLiveDeploymentId) ||
      !records.some((record) =>
        record.deploymentId === FIXED.requiredFrozenStep11DeploymentId) ||
      requiredTuples.some((required) => !artifact.records.some((tuple) =>
        canonicalJson(tuple) === canonicalJson(required))) ||
      sha256Hex(JSON.stringify(artifact.providerRecords)) !==
        FIXED.providerInventoryFingerprint ||
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
    providerRecordCount: providerRecords.length,
    providerRecordsFingerprint: artifact.providerRecordsFingerprint,
    recordCount: records.length,
    recordsFingerprint: artifact.recordsFingerprint,
    productionTargetCount,
    projectPreviewCount,
    nullShaCount,
    requiredDeployments: Object.freeze({ ...requiredDeployments }),
    paginationComplete: true,
    minimumLiveOriginInventoryCount: records.length,
    maximumLiveOriginInventoryCount: records.length + 1,
    fixedAliasOriginCount: FIXED.quiesceFixedAliasOriginCount,
    candidateAliasOriginCount: FIXED.quiesceCandidateAliasOriginCount,
    probeVectorCount: FIXED.quiesceProbeVectorCount,
  });
  retainedOriginInventoryOrigins = new Set(records.map((record) => record.origin));
  retainedOriginInventoryDeploymentIds = new Set(records.map((record) =>
    record.deploymentId));
  retainedOriginInventoryByOrigin = new Map(records.map((record) =>
    [record.origin, record]));
  retainedOriginInventoryByDeploymentId = new Map(records.map((record) =>
    [record.deploymentId, record]));
  return retainedOriginInventoryBinding;
}

export function productionCredentialConfinementBinding() {
  if (credentialConfinementBinding) return credentialConfinementBinding;
  const origin = productionOriginInventoryBinding();
  productionHistoricalSafeMethodWriterBinding();
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(new URL(
      "../../docs/evidence/step11-6-production-google-credential-confinement-v4.json",
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
    "schemaVersion", "originInventorySchemaVersion", "originInventoryRecordTuple",
    "originInventoryRecordCount", "originInventoryFingerprint",
    "originInventoryProviderRecordTuple", "originInventoryProviderRecordCount",
    "originInventoryProviderRecordsFingerprint", "classificationRecordTuple",
    "classificationRecordCount", "classificationRecordsFingerprint",
    "markerPatterns", "gitObjectAudit", "classifications",
    "markerBearingPreviewPathSummary", "canonicalMutationRouteAudit",
    "allMethodFenceRequiredHosts", "providerInventoryContract",
    "environmentScopeContract", "providerEnvironmentResourceReview",
    "dynamicCandidateContract", "evidenceFingerprint",
  ]) || artifact.schemaVersion !== FIXED.credentialConfinementSchema ||
      artifact.originInventorySchemaVersion !== origin.schemaVersion ||
      artifact.originInventoryRecordCount !== origin.recordCount ||
      artifact.originInventoryFingerprint !== origin.recordsFingerprint ||
      artifact.originInventoryProviderRecordCount !== origin.providerRecordCount ||
      artifact.originInventoryProviderRecordsFingerprint !==
        origin.providerRecordsFingerprint ||
      artifact.classificationRecordCount !== FIXED.credentialConfinementRecordCount ||
      artifact.classificationRecordsFingerprint !==
        FIXED.credentialConfinementRecordsFingerprint ||
      evidenceFingerprint !== FIXED.credentialConfinementEvidenceFingerprint ||
      sha256Hex(JSON.stringify(base)) !== evidenceFingerprint ||
      classificationTotal !== FIXED.credentialConfinementRecordCount ||
      artifact.gitObjectAudit?.missingCommitCount !== 3 ||
      artifact.gitObjectAudit?.nullShaRecordCount !== 8 ||
      artifact.gitObjectAudit?.nullShaWriterCapableRecordCount !== 5 ||
      artifact.gitObjectAudit?.nullShaProviderBlockedRecordCount !== 3 ||
      artifact.canonicalMutationRouteAudit?.dedicatedWriterMarkerMatchCount !== 0 ||
      artifact.allMethodFenceRequiredHosts?.count !==
        FIXED.sourceUnresolvedAllMethodHostCount ||
      artifact.allMethodFenceRequiredHosts?.fingerprint !==
        FIXED.sourceUnresolvedAllMethodHostsFingerprint ||
      !Array.isArray(artifact.allMethodFenceRequiredHosts?.origins) ||
      artifact.allMethodFenceRequiredHosts.origins.length !==
        FIXED.sourceUnresolvedAllMethodHostCount ||
      sha256Hex(JSON.stringify(artifact.allMethodFenceRequiredHosts.origins)) !==
        FIXED.sourceUnresolvedAllMethodHostsFingerprint ||
      artifact.providerInventoryContract?.providerRecordCount !==
        origin.providerRecordCount ||
      artifact.providerInventoryContract?.providerRecordsFingerprint !==
        origin.providerRecordsFingerprint ||
      artifact.providerInventoryContract?.projectionRecordCount !== origin.recordCount ||
      artifact.providerInventoryContract?.projectionRecordsFingerprint !==
        origin.recordsFingerprint ||
      artifact.providerInventoryContract?.oneToOneProjection !== true ||
      artifact.dynamicCandidateContract?.rehearsalTarget !== "PREVIEW" ||
      artifact.dynamicCandidateContract?.cutoverTarget !== "PREVIEW" ||
      !Array.isArray(
        artifact.dynamicCandidateContract?.permittedAdditionScopeClasses,
      ) ||
      artifact.dynamicCandidateContract.permittedAdditionScopeClasses.length !== 1 ||
      artifact.dynamicCandidateContract.permittedAdditionScopeClasses[0] !==
        "PROJECT_PREVIEW" ||
      artifact.dynamicCandidateContract?.arbitraryProductionTargetAdditionAllowed !== false ||
      artifact.dynamicCandidateContract?.differentShaAdditionAllowed !== false ||
      !exactObjectKeys(artifact.environmentScopeContract, [
        "broadLegacyNames", "broadLegacyTargets",
        "dedicatedAndProductionResourcePreviewScope", "productionScope",
        "reviewedProjectWidePreviewException",
        "duplicateUnscopedDedicatedPreviewRecordAllowed",
        "providerEnvironmentResourceReview",
        "hiddenProductionEnvironmentRecordsAllowed",
      ]) ||
      !exactReviewedProjectWidePreviewException(artifact.environmentScopeContract
        ?.reviewedProjectWidePreviewException) ||
      artifact.environmentScopeContract
        ?.duplicateUnscopedDedicatedPreviewRecordAllowed !== false ||
      artifact.environmentScopeContract
        ?.hiddenProductionEnvironmentRecordsAllowed !== false ||
      !exactObjectKeys(artifact.providerEnvironmentResourceReview, [
        "schemaVersion", "recordTuple", "providerEnvironmentRecordCount",
        "hiddenProductionEnvCount", "recordCount", "recordsFingerprint",
        "records", "ownerCertifiedContinuityBaseline",
        "ownerCertifiedContinuityBaselineFingerprint",
        "providerPlaintextValueReviewPerformed",
        "providerCiphertextWhereExposedAndVersionContinuityRequired",
        "rawValuesRetained", "reviewFingerprint",
      ]) ||
      artifact.providerEnvironmentResourceReview.schemaVersion !==
        FIXED.credentialConfinementEnvironmentReviewSchema ||
      artifact.providerEnvironmentResourceReview.providerEnvironmentRecordCount !==
        FIXED.credentialConfinementProviderEnvironmentRecordCount ||
      artifact.providerEnvironmentResourceReview.hiddenProductionEnvCount !==
        FIXED.credentialConfinementHiddenProductionEnvironmentRecordCount ||
      artifact.providerEnvironmentResourceReview.recordCount !==
        FIXED.credentialConfinementReviewedEnvironmentRecordCount ||
      artifact.providerEnvironmentResourceReview.recordsFingerprint !==
        FIXED.credentialConfinementReviewedEnvironmentRecordsFingerprint ||
      artifact.providerEnvironmentResourceReview.reviewFingerprint !==
        FIXED.credentialConfinementEnvironmentReviewFingerprint ||
      artifact.providerEnvironmentResourceReview
        .ownerCertifiedContinuityBaselineFingerprint !==
          FIXED.credentialConfinementEnvironmentContinuityFingerprint ||
      artifact.providerEnvironmentResourceReview
        .providerPlaintextValueReviewPerformed !== false ||
      artifact.providerEnvironmentResourceReview
        .providerCiphertextWhereExposedAndVersionContinuityRequired !== true ||
      artifact.providerEnvironmentResourceReview.rawValuesRetained !== false ||
      artifact.environmentScopeContract.providerEnvironmentResourceReview
        ?.schemaVersion !== FIXED.credentialConfinementEnvironmentReviewSchema ||
      artifact.environmentScopeContract.providerEnvironmentResourceReview
        ?.providerEnvironmentRecordCount !==
          FIXED.credentialConfinementProviderEnvironmentRecordCount ||
      artifact.environmentScopeContract.providerEnvironmentResourceReview
        ?.hiddenProductionEnvCount !==
          FIXED.credentialConfinementHiddenProductionEnvironmentRecordCount ||
      artifact.environmentScopeContract.providerEnvironmentResourceReview
        ?.recordCount !== FIXED.credentialConfinementReviewedEnvironmentRecordCount ||
      artifact.environmentScopeContract.providerEnvironmentResourceReview
        ?.recordsFingerprint !==
          FIXED.credentialConfinementReviewedEnvironmentRecordsFingerprint ||
      artifact.environmentScopeContract.providerEnvironmentResourceReview
        ?.reviewFingerprint !== FIXED.credentialConfinementEnvironmentReviewFingerprint ||
      artifact.environmentScopeContract.providerEnvironmentResourceReview
        ?.ownerCertifiedContinuityBaselineFingerprint !==
          FIXED.credentialConfinementEnvironmentContinuityFingerprint ||
      artifact.environmentScopeContract.providerEnvironmentResourceReview
        ?.providerPlaintextValueReviewPerformed !== false ||
      artifact.environmentScopeContract.providerEnvironmentResourceReview
        ?.providerCiphertextWhereExposedAndVersionContinuityRequired !== true ||
      artifact.environmentScopeContract.providerEnvironmentResourceReview
        ?.rawValuesRetained !== false ||
      artifact.environmentScopeContract.providerEnvironmentResourceReview
        ?.exactProviderMetadataRequired !== true ||
      artifact.environmentScopeContract.providerEnvironmentResourceReview
        ?.ciphertextHashRequiredWhereProviderExposesCiphertext !== true ||
      artifact.environmentScopeContract.providerEnvironmentResourceReview
        ?.sensitiveRedactedRecordsUseExactVersionMetadata !== true) {
    refuse("CREDENTIAL_CONFINEMENT_ARTIFACT_INVALID",
      "The Production Google credential-confinement artifact was invalid.");
  }
  credentialConfinementBinding = Object.freeze({
    artifact: FIXED.credentialConfinementArtifact,
    schemaVersion: artifact.schemaVersion,
    recordCount: artifact.classificationRecordCount,
    recordsFingerprint: artifact.classificationRecordsFingerprint,
    evidenceFingerprint,
    environmentReviewSchema:
      artifact.providerEnvironmentResourceReview.schemaVersion,
    providerEnvironmentRecordCount:
      artifact.providerEnvironmentResourceReview.providerEnvironmentRecordCount,
    hiddenProductionEnvironmentRecordCount:
      artifact.providerEnvironmentResourceReview.hiddenProductionEnvCount,
    reviewedEnvironmentRecordCount:
      artifact.providerEnvironmentResourceReview.recordCount,
    reviewedEnvironmentRecordsFingerprint:
      artifact.providerEnvironmentResourceReview.recordsFingerprint,
    environmentReviewFingerprint:
      artifact.providerEnvironmentResourceReview.reviewFingerprint,
    environmentContinuityFingerprint:
      artifact.providerEnvironmentResourceReview
        .ownerCertifiedContinuityBaselineFingerprint,
    allMethodFenceRequiredHostCount:
      artifact.allMethodFenceRequiredHosts.count,
    allMethodFenceRequiredHostsFingerprint:
      artifact.allMethodFenceRequiredHosts.fingerprint,
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
  if (execution.step12StartedAt !== null) requireTimestamp(
    execution.step12StartedAt, "EXECUTION_POLICY_REQUIRED",
    "execution.step12StartedAt");
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
    "mode", "groupCount", "projectId", "ruleId", "revision", "scope",
    "projectWide", "action",
    "hostnameOperator", "canonicalHostname", "requestPathOperator",
    "requestPath", "methodOperator", "methods",
    "allMethodFenceRequiredHostCount",
    "allMethodFenceRequiredHostsFingerprint",
    "allMethodFenceRequiredPathCount",
    "allMethodFenceRequiredPathsFingerprint",
    "earlierActiveBypassRuleCount",
  ])) {
    refuse("PROVIDER_QUIESCE_RULE_INVALID",
      "providerQuiesceEvidence.routingRule must have the exact reviewed field set.");
  }
  requireEqual(rule.mode, FIXED.criticalWindowWafMode,
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.mode");
  requireEqual(rule.groupCount, FIXED.criticalWindowWafGroupCount,
    "PROVIDER_QUIESCE_RULE_INVALID",
    "providerQuiesceEvidence.routingRule.groupCount");
  requireEqual(rule.projectId, FIXED.vercelProjectId,
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.projectId");
  requireEqual(rule.scope, FIXED.quiesceScope,
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.scope");
  requireEqual(rule.projectWide, true,
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.projectWide");
  requireEqual(rule.action, "DENY",
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.action");
  requireEqual(rule.hostnameOperator, "DOES_NOT_EQUAL",
    "PROVIDER_QUIESCE_RULE_INVALID",
    "providerQuiesceEvidence.routingRule.hostnameOperator");
  requireEqual(rule.canonicalHostname, FIXED.criticalWindowWafCanonicalHostname,
    "PROVIDER_QUIESCE_RULE_INVALID",
    "providerQuiesceEvidence.routingRule.canonicalHostname");
  requireEqual(rule.requestPathOperator, "DOES_NOT_EQUAL",
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.requestPathOperator");
  requireEqual(rule.requestPath, FIXED.providerControlEndpoint,
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.requestPath");
  requireEqual(rule.methodOperator, "IS_NOT_ANY_OF",
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.methodOperator");
  requireEqual(canonicalJson(rule.methods), canonicalJson(["GET", "HEAD", "OPTIONS"]),
    "PROVIDER_QUIESCE_RULE_INVALID", "providerQuiesceEvidence.routingRule.methods");
  requireEqual(rule.allMethodFenceRequiredHostCount,
    FIXED.allMethodFenceRequiredHostCount,
    "PROVIDER_QUIESCE_RULE_INVALID",
    "providerQuiesceEvidence.routingRule.allMethodFenceRequiredHostCount");
  requireEqual(rule.allMethodFenceRequiredHostsFingerprint,
    FIXED.allMethodFenceRequiredHostsFingerprint,
    "PROVIDER_QUIESCE_RULE_INVALID",
    "providerQuiesceEvidence.routingRule.allMethodFenceRequiredHostsFingerprint");
  requireEqual(rule.allMethodFenceRequiredPathCount,
    FIXED.allMethodFenceRequiredPathCount,
    "PROVIDER_QUIESCE_RULE_INVALID",
    "providerQuiesceEvidence.routingRule.allMethodFenceRequiredPathCount");
  requireEqual(rule.allMethodFenceRequiredPathsFingerprint,
    FIXED.allMethodFenceRequiredPathsFingerprint,
    "PROVIDER_QUIESCE_RULE_INVALID",
    "providerQuiesceEvidence.routingRule.allMethodFenceRequiredPathsFingerprint");
  requireEqual(rule.earlierActiveBypassRuleCount, 0,
    "PROVIDER_QUIESCE_RULE_INVALID",
    "providerQuiesceEvidence.routingRule.earlierActiveBypassRuleCount");
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

function validatedProviderAliasClaim(manifest, stage) {
  const challenge = requireObject(
    manifest.providerAttestationChallenges?.[stage.toLowerCase()],
    "PROVIDER_ALIAS_RECAPTURE_INCOMPLETE",
    `providerAttestationChallenges.${stage.toLowerCase()}`,
  );
  const envelope = requireObject(challenge.signedAttestation,
    "PROVIDER_ALIAS_RECAPTURE_INCOMPLETE",
    `providerAttestationChallenges.${stage.toLowerCase()}.signedAttestation`);
  const claim = requireObject(envelope.attestation,
    "PROVIDER_ALIAS_RECAPTURE_INCOMPLETE",
    `providerAttestationChallenges.${stage.toLowerCase()}.signedAttestation.attestation`);
  const records = claim.aliasInventoryRecords;
  const quiesce = manifest.providerQuiesceEvidence;
  let candidateAliasHostname = "";
  let candidateImmutableHostname = "";
  try {
    candidateAliasHostname = new URL(quiesce.candidateAliasOrigin).hostname.toLowerCase();
    candidateImmutableHostname =
      new URL(quiesce.candidateImmutableOrigin).hostname.toLowerCase();
  } catch {
    refuse("PROVIDER_ALIAS_RECAPTURE_INCOMPLETE",
      "The provider alias recapture candidate origins were invalid.");
  }
  const courseTuple = [
    FIXED.unsafeCourseAliasHostname,
    FIXED.unsafeCourseAliasDeploymentId,
    FIXED.unsafeCourseAliasDeploymentHostname,
    null,
    null,
  ];
  const candidateTuple = [
    candidateAliasHostname,
    manifest.release.deploymentId,
    candidateImmutableHostname,
    null,
    null,
  ];
  const aliases = Array.isArray(records) ? records.map((record) => record?.[0]) : [];
  if (claim.stage !== stage || claim.purpose !== quiesce.purpose ||
      claim.candidateAliasOrigin !== quiesce.candidateAliasOrigin ||
      claim.candidateImmutableOrigin !== quiesce.candidateImmutableOrigin ||
      claim.aliasInventoryCount !== FIXED.providerAliasInventoryRecordCount ||
      !Array.isArray(records) || records.length !== claim.aliasInventoryCount ||
      !HEX64.test(String(claim.aliasInventoryFingerprint || "")) ||
      sha256Hex(JSON.stringify(records)) !== claim.aliasInventoryFingerprint ||
      new Set(aliases).size !== aliases.length ||
      canonicalJson(aliases) !== canonicalJson([...aliases].sort()) ||
      records.filter((record) => canonicalJson(record) === canonicalJson(courseTuple))
        .length !== 1 ||
      records.filter((record) => canonicalJson(record) === canonicalJson(candidateTuple))
        .length !== 1 ||
      !Number.isSafeInteger(claim.aliasPaginationPageCount) ||
      claim.aliasPaginationPageCount < 1 ||
      !HEX64.test(String(claim.aliasPaginationFingerprint || "")) ||
      !UUID.test(String(claim.attestationId || "")) ||
      !HEX64.test(String(envelope.attestationFingerprint || "")) ||
      !Number.isFinite(Date.parse(String(claim.providerObservedAt || "")))) {
    refuse("PROVIDER_ALIAS_RECAPTURE_INCOMPLETE",
      `The signed ${stage} provider alias census was incomplete or drifted.`);
  }
  return Object.freeze({ envelope, claim, records });
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
  if (!new Set(["REHEARSAL", "CUTOVER"]).has(quiesce.purpose)) {
    refuse("PROVIDER_QUIESCE_PURPOSE_INVALID",
      "providerQuiesceEvidence.purpose must be REHEARSAL or CUTOVER.");
  }
  const purposeBoundOwnerFreeze = quiesce.purpose === "CUTOVER"
    ? FIXED.cutoverOwnerFreezeConfirmation
    : FIXED.rehearsalOwnerFreezeConfirmation;
  requireEqual(quiesce.ownerFreezeConfirmation, purposeBoundOwnerFreeze,
    "PROVIDER_QUIESCE_OWNER_FREEZE_PURPOSE_MISMATCH",
    "providerQuiesceEvidence.ownerFreezeConfirmation");
  assertRoutingRuleShape(quiesce.routingRule);
  requireEqual(quiesce.originInventoryArtifact, FIXED.originInventoryArtifact,
    "ORIGIN_INVENTORY_BINDING_DRIFT", "providerQuiesceEvidence.originInventoryArtifact");
  requireEqual(quiesce.originInventoryCount, FIXED.originInventoryCount,
    "ORIGIN_INVENTORY_BINDING_DRIFT", "providerQuiesceEvidence.originInventoryCount");
  requireEqual(quiesce.originInventoryFingerprint, FIXED.originInventoryFingerprint,
    "ORIGIN_INVENTORY_BINDING_DRIFT", "providerQuiesceEvidence.originInventoryFingerprint");
  requireEqual(quiesce.providerInventorySchema, FIXED.originInventorySchema,
    "PROVIDER_INVENTORY_BINDING_DRIFT",
    "providerQuiesceEvidence.providerInventorySchema");
  requireEqual(quiesce.retainedProviderInventoryCount, FIXED.providerInventoryCount,
    "PROVIDER_INVENTORY_BINDING_DRIFT",
    "providerQuiesceEvidence.retainedProviderInventoryCount");
  requireEqual(quiesce.retainedProviderInventoryFingerprint,
    FIXED.providerInventoryFingerprint, "PROVIDER_INVENTORY_BINDING_DRIFT",
    "providerQuiesceEvidence.retainedProviderInventoryFingerprint");
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
    "liveProviderInventoryCount", "liveOriginInventoryCount", "probeOriginCount",
    "probeVectorCount", "probeRecordCount",
    "unresolvedRequestLogCount", "unresolvedGoogleWriteCount",
    "unresolvedProbeCount", "ownerFreezeTtlSeconds", "aliasRecaptureCount",
    "aliasInventoryCount", "aliasPaginationPageCount",
  ]) requireInteger(quiesce[field], "PROVIDER_QUIESCE_EVIDENCE_INVALID",
    `providerQuiesceEvidence.${field}`);
  if (["DRAINING", "VERIFIED"].includes(quiesce.status)) {
    const expectedLiveInventoryCount = expectedQuiesceLiveInventoryCount(quiesce);
    requireResolved(quiesce.liveProviderInventoryFingerprint, HEX64,
      "PROVIDER_QUIESCE_LIVE_PROVIDER_INVENTORY_REQUIRED",
      "providerQuiesceEvidence.liveProviderInventoryFingerprint");
    requireResolved(quiesce.liveOriginInventoryFingerprint, HEX64,
      "PROVIDER_QUIESCE_LIVE_INVENTORY_REQUIRED",
      "providerQuiesceEvidence.liveOriginInventoryFingerprint");
    if (quiesce.liveProviderInventoryCount !== quiesce.liveOriginInventoryCount ||
        quiesce.liveOriginInventoryCount !== expectedLiveInventoryCount ||
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
  if (quiesce.ownerFreezeTtlSeconds !== 2100) {
    refuse("PROVIDER_QUIESCE_OWNER_FREEZE_TTL_INVALID",
      "providerQuiesceEvidence.ownerFreezeTtlSeconds must be the certified 2100-second window.");
  }
  for (const field of [
    "ownerOverrideOperationallyFrozen", "allOriginsEdgeDenied",
    "canonicalApexExcludedFromEdgeDenyProbes",
    "canonicalApexWriteMethodsEdgeDenied", "baselineWafRestored",
    "candidateControlExceptionExact", "canonicalUnsafeMethodsDenied",
    "canonicalHistoricalSafeWriterPathsDenied", "canonicalSafeReadsAllowed",
  ]) {
    requireBoolean(quiesce[field], "PROVIDER_QUIESCE_EVIDENCE_INVALID",
      `providerQuiesceEvidence.${field}`);
  }
  if (["DRAINING", "VERIFIED"].includes(quiesce.status)) {
    requireEqual(quiesce.canonicalApexExcludedFromEdgeDenyProbes, true,
      "PROVIDER_QUIESCE_CANONICAL_APEX_POLICY_INVALID",
      "providerQuiesceEvidence.canonicalApexExcludedFromEdgeDenyProbes");
    requireEqual(quiesce.canonicalApexWriteMethodsEdgeDenied, true,
      "PROVIDER_QUIESCE_CANONICAL_APEX_POLICY_INVALID",
      "providerQuiesceEvidence.canonicalApexWriteMethodsEdgeDenied");
    for (const field of [
      "candidateControlExceptionExact", "canonicalUnsafeMethodsDenied",
      "canonicalHistoricalSafeWriterPathsDenied", "canonicalSafeReadsAllowed",
    ]) requireEqual(quiesce[field], true,
      "PROVIDER_QUIESCE_CRITICAL_WINDOW_INCOMPLETE",
      `providerQuiesceEvidence.${field}`);
    for (const field of ["baselineWafFingerprint", "criticalWindowWafFingerprint"]) {
      requireResolved(quiesce[field], HEX64,
        "PROVIDER_QUIESCE_CRITICAL_WINDOW_INCOMPLETE",
        `providerQuiesceEvidence.${field}`);
    }
    requireTimestamp(quiesce.criticalWindowActivatedAt,
      "PROVIDER_QUIESCE_CRITICAL_WINDOW_INCOMPLETE",
      "providerQuiesceEvidence.criticalWindowActivatedAt");
    const requiredAliasRecaptureCount = quiesce.status === "VERIFIED" ?
      FIXED.criticalWindowWafRequiredAliasRecaptureCount : 1;
    requireEqual(quiesce.aliasRecaptureCount, requiredAliasRecaptureCount,
      "PROVIDER_ALIAS_RECAPTURE_INCOMPLETE",
      "providerQuiesceEvidence.aliasRecaptureCount");
    requireEqual(quiesce.aliasInventoryCount,
      FIXED.providerAliasInventoryRecordCount,
      "PROVIDER_ALIAS_RECAPTURE_INCOMPLETE",
      "providerQuiesceEvidence.aliasInventoryCount");
    for (const field of ["aliasInventoryFingerprint", "aliasPaginationFingerprint",
      "beginAliasAttestationFingerprint"]) requireResolved(quiesce[field], HEX64,
      "PROVIDER_ALIAS_RECAPTURE_INCOMPLETE",
      `providerQuiesceEvidence.${field}`);
    requireResolved(quiesce.beginAliasAttestationId, UUID,
      "PROVIDER_ALIAS_RECAPTURE_INCOMPLETE",
      "providerQuiesceEvidence.beginAliasAttestationId");
    const beginObservedAt = requireTimestamp(quiesce.beginAliasProviderObservedAt,
      "PROVIDER_ALIAS_RECAPTURE_TIMESTAMP_INVALID",
      "providerQuiesceEvidence.beginAliasProviderObservedAt");
    const beginAlias = validatedProviderAliasClaim(manifest, "BEGIN");
    if (quiesce.aliasInventoryCount !== beginAlias.claim.aliasInventoryCount ||
        quiesce.aliasInventoryFingerprint !== beginAlias.claim.aliasInventoryFingerprint ||
        quiesce.aliasPaginationPageCount !== beginAlias.claim.aliasPaginationPageCount ||
        quiesce.aliasPaginationFingerprint !==
          beginAlias.claim.aliasPaginationFingerprint ||
        quiesce.beginAliasAttestationId !== beginAlias.claim.attestationId ||
        quiesce.beginAliasAttestationFingerprint !==
          beginAlias.envelope.attestationFingerprint ||
        beginObservedAt !== beginAlias.claim.providerObservedAt) {
      refuse("PROVIDER_ALIAS_RECAPTURE_DRIFT",
        "The durable BEGIN alias capture did not match its signed provider census.");
    }
    if (quiesce.status === "VERIFIED") {
      requireResolved(quiesce.finalizeAliasAttestationId, UUID,
        "PROVIDER_ALIAS_RECAPTURE_INCOMPLETE",
        "providerQuiesceEvidence.finalizeAliasAttestationId");
      requireResolved(quiesce.finalizeAliasAttestationFingerprint, HEX64,
        "PROVIDER_ALIAS_RECAPTURE_INCOMPLETE",
        "providerQuiesceEvidence.finalizeAliasAttestationFingerprint");
      const finalizeObservedAt = requireTimestamp(
        quiesce.finalizeAliasProviderObservedAt,
        "PROVIDER_ALIAS_RECAPTURE_TIMESTAMP_INVALID",
        "providerQuiesceEvidence.finalizeAliasProviderObservedAt",
      );
      const finalizeAlias = validatedProviderAliasClaim(manifest, "FINALIZE");
      if (quiesce.finalizeAliasAttestationId !== finalizeAlias.claim.attestationId ||
          quiesce.finalizeAliasAttestationFingerprint !==
            finalizeAlias.envelope.attestationFingerprint ||
          finalizeObservedAt !== finalizeAlias.claim.providerObservedAt ||
          quiesce.beginAliasAttestationId === quiesce.finalizeAliasAttestationId ||
          quiesce.beginAliasAttestationFingerprint ===
            quiesce.finalizeAliasAttestationFingerprint ||
          beginAlias.claim.aliasInventoryFingerprint !==
            finalizeAlias.claim.aliasInventoryFingerprint ||
          canonicalJson(beginAlias.records) !== canonicalJson(finalizeAlias.records) ||
          beginAlias.claim.aliasPaginationPageCount !==
            finalizeAlias.claim.aliasPaginationPageCount ||
          beginAlias.claim.aliasPaginationFingerprint !==
            finalizeAlias.claim.aliasPaginationFingerprint ||
          Date.parse(beginObservedAt) >= Date.parse(finalizeObservedAt)) {
        refuse("PROVIDER_ALIAS_RECAPTURE_DRIFT",
          "The durable FINALIZE alias capture did not match the independent signed census.");
      }
    } else if (quiesce.finalizeAliasAttestationId ||
        quiesce.finalizeAliasAttestationFingerprint ||
        quiesce.finalizeAliasProviderObservedAt) {
      refuse("PROVIDER_ALIAS_RECAPTURE_TIMESTAMP_INVALID",
        "A DRAINING receipt cannot claim a FINALIZE alias capture.");
    }
  }
  if (quiesce.baselineWafRestored === true) {
    requireResolved(quiesce.restoredWafFingerprint, HEX64,
      "PROVIDER_QUIESCE_BASELINE_RESTORATION_INVALID",
      "providerQuiesceEvidence.restoredWafFingerprint");
    requireEqual(quiesce.restoredWafFingerprint, quiesce.baselineWafFingerprint,
      "PROVIDER_QUIESCE_BASELINE_RESTORATION_INVALID",
      "providerQuiesceEvidence.restoredWafFingerprint");
  } else if (quiesce.restoredWafFingerprint !== null) {
    refuse("PROVIDER_QUIESCE_CRITICAL_WINDOW_CONSUMPTION_INVALID",
      "An active CRITICAL_WINDOW epoch cannot retain a restored WAF fingerprint.");
  }

  const fence = requireObject(manifest.persistentProviderFence,
    "PERSISTENT_PROVIDER_FENCE_REQUIRED", "persistentProviderFence");
  if (!new Set([
    "MISSING", "INSTALLING", "INSTALLED", "REMOVAL_AUTHORIZED", "REMOVED", "FAILED",
  ]).has(fence.status)) {
    refuse("PERSISTENT_PROVIDER_FENCE_STATUS_INVALID",
      "persistentProviderFence.status is outside the durable fence states.");
  }
  requireEqual(fence.lifecycleMode, "CUTOVER",
    "PERSISTENT_PROVIDER_FENCE_INVALID", "persistentProviderFence.lifecycleMode");
  requireEqual(fence.mechanism, "DRIVE_ACL_EXACT_LEGACY_PERMISSION_V2",
    "PERSISTENT_PROVIDER_FENCE_INVALID", "persistentProviderFence.mechanism");
  if (!new Set([FIXED.legacyDriveRoleOpen, FIXED.legacyDriveRoleClosed])
    .has(fence.legacyDriveRole)) {
    refuse("PERSISTENT_PROVIDER_FENCE_INVALID",
      "persistentProviderFence.legacyDriveRole is invalid.");
  }
  requireBoolean(fence.legacyDriveCanEdit,
    "PERSISTENT_PROVIDER_FENCE_INVALID", "persistentProviderFence.legacyDriveCanEdit");
  if (typeof fence.legacyDriveCanShare !== "boolean" &&
      !unresolved(fence.legacyDriveCanShare)) {
    refuse("PERSISTENT_PROVIDER_FENCE_INVALID",
      "persistentProviderFence.legacyDriveCanShare is invalid.");
  }
  if (!new Set(["NOT_DISPATCHED", FIXED.aclTransitionResultTarget,
    FIXED.aclTransitionResultUnknown]).has(fence.aclDispatchResult)) {
    refuse("PERSISTENT_PROVIDER_FENCE_INVALID",
      "persistentProviderFence.aclDispatchResult is invalid.");
  }
  requireInteger(fence.aclUnknownDispatchCount,
    "PERSISTENT_PROVIDER_FENCE_INVALID",
    "persistentProviderFence.aclUnknownDispatchCount");
  const settlementStages = new Set([
    "AWAITING_ACL_READER_CONFIRMED", "ACL_READER_CONFIRMED",
    "SETTLEMENT_READBACK_1", "SETTLEMENT_READBACK_2",
  ]);
  if (!settlementStages.has(fence.providerSettlementStage)) {
    refuse("PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "persistentProviderFence.providerSettlementStage is invalid.");
  }
  requireInteger(fence.providerSettlementRemainingWaitSeconds,
    "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
    "persistentProviderFence.providerSettlementRemainingWaitSeconds");
  if (fence.providerSettlementRemainingWaitSeconds < 0) {
    refuse("PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "The provider-settlement remaining wait cannot be negative.");
  }
  requireEqual(fence.providerSettlementInstallWaitSeconds,
    FIXED.providerSettlementInstallWaitSeconds,
    "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
    "persistentProviderFence.providerSettlementInstallWaitSeconds");
  requireEqual(fence.providerSettlementReadbackWaitSeconds,
    FIXED.providerSettlementReadbackWaitSeconds,
    "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
    "persistentProviderFence.providerSettlementReadbackWaitSeconds");
  requireBoolean(fence.admissionCloseCommitted,
    "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
    "persistentProviderFence.admissionCloseCommitted");
  const settlementIds = [
    "providerSettlementLatestObservationId", "aclReaderConfirmedObservationId",
    "settlementReadback1ObservationId", "settlementReadback2ObservationId",
  ];
  for (const field of settlementIds) {
    if (fence[field] !== null) requireResolved(fence[field], UUID,
      "PERSISTENT_PROVIDER_SETTLEMENT_INVALID", `persistentProviderFence.${field}`);
  }
  const expectedLatestField = {
    AWAITING_ACL_READER_CONFIRMED: null,
    ACL_READER_CONFIRMED: "aclReaderConfirmedObservationId",
    SETTLEMENT_READBACK_1: "settlementReadback1ObservationId",
    SETTLEMENT_READBACK_2: "settlementReadback2ObservationId",
  }[fence.providerSettlementStage];
  const requiredObservationFields = fence.providerSettlementStage ===
    "AWAITING_ACL_READER_CONFIRMED" ? [] : fence.providerSettlementStage ===
      "ACL_READER_CONFIRMED" ? ["aclReaderConfirmedObservationId"] :
      fence.providerSettlementStage === "SETTLEMENT_READBACK_1" ? [
        "aclReaderConfirmedObservationId", "settlementReadback1ObservationId",
      ] : [
        "aclReaderConfirmedObservationId", "settlementReadback1ObservationId",
        "settlementReadback2ObservationId",
      ];
  if (expectedLatestField === null) {
    requireEqual(fence.providerSettlementLatestObservationId, null,
      "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "persistentProviderFence.providerSettlementLatestObservationId");
  } else {
    requireEqual(fence.providerSettlementLatestObservationId,
      fence[expectedLatestField], "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "persistentProviderFence.providerSettlementLatestObservationId");
  }
  for (const field of requiredObservationFields) requireResolved(fence[field], UUID,
    "PERSISTENT_PROVIDER_SETTLEMENT_INVALID", `persistentProviderFence.${field}`);
  if (["ACL_READER_CONFIRMED", "SETTLEMENT_READBACK_1"]
    .includes(fence.providerSettlementStage)) {
    requireTimestamp(fence.providerSettlementNextEligibleAt,
      "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "persistentProviderFence.providerSettlementNextEligibleAt");
  } else {
    requireEqual(fence.providerSettlementNextEligibleAt, null,
      "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "persistentProviderFence.providerSettlementNextEligibleAt");
  }
  if (fence.aclDispatchResult === FIXED.aclTransitionResultUnknown) {
    if (!new Set(["INSTALLING", "FAILED"]).has(fence.status) ||
        fence.aclUnknownDispatchCount < 1) {
      refuse("PERSISTENT_PROVIDER_FENCE_INVALID",
        "An OUTCOME_UNKNOWN ACL dispatch must remain durably blocked and unresolved.");
    }
  } else if (fence.providerSettlementStage === "AWAITING_ACL_READER_CONFIRMED") {
    requireEqual(fence.settlementStructuralCanaryFingerprint, null,
      "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "persistentProviderFence.settlementStructuralCanaryFingerprint");
  } else {
    requireResolved(fence.settlementStructuralCanaryFingerprint, HEX64,
      "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "persistentProviderFence.settlementStructuralCanaryFingerprint");
  }
  if (fence.providerSettlementStage === "SETTLEMENT_READBACK_2") {
    requireTimestamp(fence.settlementCompletedAt,
      "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "persistentProviderFence.settlementCompletedAt");
    requireEqual(fence.admissionCloseCommitted, true,
      "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "persistentProviderFence.admissionCloseCommitted");
  } else {
    requireEqual(fence.settlementCompletedAt, null,
      "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "persistentProviderFence.settlementCompletedAt");
    requireEqual(fence.admissionCloseCommitted, false,
      "PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "persistentProviderFence.admissionCloseCommitted");
  }
  if (fence.status === "MISSING" &&
      fence.providerSettlementStage !== "AWAITING_ACL_READER_CONFIRMED") {
    refuse("PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "A missing persistent fence cannot retain a settlement stage.");
  }
  if (fence.aclDispatchResult === FIXED.aclTransitionResultUnknown) {
    // OUTCOME_UNKNOWN remains queryable for recovery diagnostics, but every mutation
    // guard below refuses redispatch, reversal, close, prepare, or reopen.
  } else if (fence.providerSettlementStage === "AWAITING_ACL_READER_CONFIRMED") {
    requireEqual(fence.legacyDriveRole, FIXED.legacyDriveRoleOpen,
      "PERSISTENT_PROVIDER_FENCE_INVALID", "persistentProviderFence.legacyDriveRole");
    requireEqual(fence.aclDispatchResult, "NOT_DISPATCHED",
      "PERSISTENT_PROVIDER_FENCE_INVALID", "persistentProviderFence.aclDispatchResult");
  } else if (!new Set(["REMOVAL_AUTHORIZED", "REMOVED"]).has(fence.status)) {
    requireEqual(fence.legacyDriveRole, FIXED.legacyDriveRoleClosed,
      "PERSISTENT_PROVIDER_FENCE_INVALID", "persistentProviderFence.legacyDriveRole");
    requireEqual(fence.legacyDriveCanEdit, false,
      "PERSISTENT_PROVIDER_FENCE_INVALID", "persistentProviderFence.legacyDriveCanEdit");
    requireEqual(fence.legacyDriveCanShare, false,
      "PERSISTENT_PROVIDER_FENCE_INVALID", "persistentProviderFence.legacyDriveCanShare");
    requireEqual(fence.aclDispatchResult, FIXED.aclTransitionResultTarget,
      "PERSISTENT_PROVIDER_FENCE_INVALID", "persistentProviderFence.aclDispatchResult");
    requireEqual(fence.aclUnknownDispatchCount, 0,
      "PERSISTENT_PROVIDER_FENCE_INVALID",
      "persistentProviderFence.aclUnknownDispatchCount");
  }
  if (fence.status === "INSTALLING" &&
      fence.providerSettlementStage === "SETTLEMENT_READBACK_2") {
    refuse("PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "A completed settlement cannot remain INSTALLING.");
  }
  if (["INSTALLED", "REMOVAL_AUTHORIZED", "REMOVED"].includes(fence.status) &&
      fence.providerSettlementStage !== "SETTLEMENT_READBACK_2") {
    refuse("PERSISTENT_PROVIDER_SETTLEMENT_INVALID",
      "An installed or removed persistent fence requires the atomic readback-2 proof.");
  }
  productionOriginInventoryBinding();
  productionCredentialConfinementBinding();
  productionHistoricalWriterScopeBinding();
}

function validateStagedProvenance(manifest) {
  const state = manifest.state;
  const fields = [
    "stagedRequestFingerprint", "stagedPayloadHash",
    "stagedCertificationFingerprint", "stagedEnvironmentDeltaFingerprintV2",
  ];
  const values = fields.map((field) => state[field]);
  const allMissing = values.every((value) => value === null);
  const allPresent = values.every((value) =>
    typeof value === "string" && HEX64.test(value));
  if (!allMissing && !allPresent) {
    refuse(
      "STAGED_PROVENANCE_INCOMPLETE",
      "Protected STAGE_RELEASE provenance must be either entirely absent or entirely present.",
    );
  }
  if (allPresent) {
    requireEqual(
      state.stagedCertificationFingerprint,
      manifest.release.certificationFingerprint,
      "STAGED_PROVENANCE_MISMATCH",
      "state.stagedCertificationFingerprint",
    );
    requireEqual(
      state.stagedEnvironmentDeltaFingerprintV2,
      manifest.release.environmentDeltaFingerprintV2,
      "STAGED_PROVENANCE_MISMATCH",
      "state.stagedEnvironmentDeltaFingerprintV2",
    );
  }
  return { present: allPresent };
}

function validateWafCriticalEpochManifest(manifest) {
  const epoch = requireObject(
    manifest.wafCriticalEpoch,
    "WAF_CRITICAL_EPOCH_REQUIRED",
    "wafCriticalEpoch",
  );
  requireEqual(epoch.contractVersion, "CRITICAL_WINDOW_WAF_V1",
    "WAF_CRITICAL_EPOCH_CONTRACT_MISMATCH", "wafCriticalEpoch.contractVersion");
  if (!new Set(["REHEARSAL", "CUTOVER"]).has(epoch.purpose) ||
      !new Set(["REHEARSAL", "CUTOVER", "ROLLBACK"]).has(
        epoch.transitionMode,
      ) ||
      (epoch.purpose === "REHEARSAL") !==
        (epoch.transitionMode === "REHEARSAL")) {
    refuse("WAF_CRITICAL_EPOCH_MODE_INVALID",
      "The WAF purpose and transition mode were not an exact supported pair.");
  }
  requireEqual(epoch.candidateDeploymentTarget, "PREVIEW",
    "WAF_CRITICAL_EPOCH_TARGET_MISMATCH",
    "wafCriticalEpoch.candidateDeploymentTarget");
  requireEqual(epoch.authenticatedActorId, "CB01",
    "WAF_CRITICAL_EPOCH_ACTOR_MISMATCH",
    "wafCriticalEpoch.authenticatedActorId");
  if (!new Set([
    "MISSING", "ACTIVATION_PENDING", "ACTIVE_UNBOUND", "FENCE_BOUND",
    "RESTORE_PENDING", "BASELINE_RESTORED",
  ]).has(epoch.status)) {
    refuse("WAF_CRITICAL_EPOCH_STATUS_INVALID",
      "The WAF epoch status was outside the certified state machine.");
  }
  for (const [field, pattern] of [
    ["epochId", UUID], ["epochRequestId", UUID],
    ["candidateDeploymentId", DEPLOYMENT_ID],
    ["candidateDeploymentCommit", HEX40],
    ["authenticatedActorFingerprint", HEX64],
    ["candidateControlHostsFingerprint", HEX64],
    ["runOwnedRuleNonce", UUID], ["runOwnedRuleFingerprint", HEX64],
    ["runOwnedInsertDocumentFingerprint", HEX64],
  ]) {
    if (!unresolved(epoch[field]) && !pattern.test(String(epoch[field]))) {
      refuse("WAF_CRITICAL_EPOCH_FIELD_INVALID",
        `wafCriticalEpoch.${field} was invalid.`);
    }
  }
  if (!unresolved(epoch.candidateDeploymentId) &&
      !unresolved(manifest.release.deploymentId)) {
    requireEqual(epoch.candidateDeploymentId, manifest.release.deploymentId,
      "WAF_CRITICAL_EPOCH_CANDIDATE_MISMATCH",
      "wafCriticalEpoch.candidateDeploymentId");
  }
  if (!unresolved(epoch.candidateDeploymentCommit) &&
      !unresolved(manifest.release.frozenSha)) {
    requireEqual(epoch.candidateDeploymentCommit, manifest.release.frozenSha,
      "WAF_CRITICAL_EPOCH_CANDIDATE_MISMATCH",
      "wafCriticalEpoch.candidateDeploymentCommit");
  }
  const dispatches = requireObject(epoch.dispatches,
    "WAF_CRITICAL_EPOCH_DISPATCHES_REQUIRED", "wafCriticalEpoch.dispatches");
  for (const step of [
    "CRITICAL_RULE_INSERT", "CRITICAL_DRAFT_ACTIVATE",
    "BASELINE_VERSION_ACTIVATE",
  ]) {
    const dispatch = requireObject(dispatches[step],
      "WAF_CRITICAL_EPOCH_DISPATCH_REQUIRED", `wafCriticalEpoch.dispatches.${step}`);
    for (const field of ["dispatchRequestId", "transitionRequestId"]) {
      if (!unresolved(dispatch[field]) && !UUID.test(String(dispatch[field]))) {
        refuse("WAF_CRITICAL_EPOCH_DISPATCH_INVALID",
          `wafCriticalEpoch.dispatches.${step}.${field} was invalid.`);
      }
    }
  }
  const inputs = requireObject(epoch.operationInputs,
    "WAF_CRITICAL_EPOCH_INPUTS_REQUIRED", "wafCriticalEpoch.operationInputs");
  for (const operation of Object.keys(WAF_CRITICAL_EPOCH_OPERATIONS)
    .filter((name) => !name.startsWith("inspect-"))) {
    requireObject(inputs[operation], "WAF_CRITICAL_EPOCH_INPUT_REQUIRED",
      `wafCriticalEpoch.operationInputs.${operation}`);
  }
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
  if (!unresolved(manifest.release.migrationSha256)) {
    requireEqual(manifest.release.migrationSha256, FIXED.migrationSha256,
      "MIGRATION_BINDING_DRIFT", "release.migrationSha256");
  }
  requireEqual(manifest.release.runbook, FIXED.runbook, "RUNBOOK_BINDING_DRIFT", "release.runbook");
  for (const [field, expected] of [
    ["historicalWriterScopeSchema", FIXED.historicalWriterScopeSchema],
    ["historicalWriterScopeEvidenceFingerprint",
      FIXED.historicalWriterScopeEvidenceFingerprint],
    ["historicalCanonicalSheetCount", FIXED.historicalCanonicalSheetCount],
    ["historicalCanonicalSheetsFingerprint",
      FIXED.historicalCanonicalSheetsFingerprint],
    ["historicalImmutableDenyOriginCount",
      FIXED.historicalImmutableDenyOriginCount],
    ["historicalImmutableDenyOriginsFingerprint",
      FIXED.historicalImmutableDenyOriginsFingerprint],
    ["historicalCurrentAliasAwareDenyOriginCount",
      FIXED.historicalCurrentAliasAwareDenyOriginCount],
    ["historicalCurrentAliasAwareDenyOriginsFingerprint",
      FIXED.historicalCurrentAliasAwareDenyOriginsFingerprint],
    ["activeAliasCensusRecordCount", FIXED.activeAliasCensusRecordCount],
    ["activeAliasCensusRecordsFingerprint",
      FIXED.activeAliasCensusRecordsFingerprint],
  ]) requireEqual(manifest.release[field], expected,
    "HISTORICAL_WRITER_SCOPE_BINDING_DRIFT", `release.${field}`);
  requireObject(manifest.certification, "CERTIFICATION_REQUIRED", "certification");
  requireObject(manifest.providerFenceRehearsal,
    "PROVIDER_FENCE_REHEARSAL_REQUIRED", "providerFenceRehearsal");
  validateAclV2Acceptance(manifest);
  requireObject(manifest.providerAttestationChallenges,
    "PROVIDER_ATTESTATION_CHALLENGES_REQUIRED", "providerAttestationChallenges");
  requireObject(manifest.providerAttestationChallenges.begin,
    "PROVIDER_ATTESTATION_CHALLENGES_REQUIRED", "providerAttestationChallenges.begin");
  requireObject(manifest.providerAttestationChallenges.finalize,
    "PROVIDER_ATTESTATION_CHALLENGES_REQUIRED", "providerAttestationChallenges.finalize");
  validateStructuredProviderEvidence(manifest);
  requireObject(manifest.providerFenceProof, "PROVIDER_FENCE_REQUIRED", "providerFenceProof");
  requireObject(manifest.state, "STATE_REQUIRED", "state");
  requireObject(manifest.evidence, "EVIDENCE_REQUIRED", "evidence");
  requireObject(manifest.stableRequestIds, "REQUEST_IDS_REQUIRED", "stableRequestIds");
  requireObject(manifest.operationInputs, "OPERATION_INPUTS_REQUIRED", "operationInputs");
  validateWafCriticalEpochManifest(manifest);
  const stagedProvenance = validateStagedProvenance(manifest);
  if ((manifest.state.cutoverPhase !== "DORMANT" ||
      manifest.state.activationState !== "DORMANT") &&
      !stagedProvenance.present) {
    refuse(
      "STAGED_PROVENANCE_REQUIRED",
      "Post-stage execution requires the protected authoritative STAGE_RELEASE provenance.",
    );
  }
  requireInteger(manifest.state.activationRevision, "STATE_INVALID", "state.activationRevision");
  for (const field of [
    "activeLegacyWriters", "unresolvedLegacyWriters", "ambiguousGoogleWrites",
    "partialGoogleWrites", "legacyUnclassifiedWriters", "unresolvedOutbox",
    "unresolvedArchive",
  ]) {
    requireInteger(manifest.state[field], "STATE_INVALID", `state.${field}`);
  }
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
  const manifestAclAcceptance = manifest.aclV2Acceptance;
  let aclAcceptance = manifestAclAcceptance;
  const state = manifest.state;
  const historicalWriterScope = productionHistoricalWriterScopeBinding();

  const loadedAclAcceptance = loadAclV2AcceptanceArtifact();
  if (!loadedAclAcceptance.artifact) {
    blockers.push(loadedAclAcceptance.error ||
      "ACL-v2 acceptance artifact is unavailable");
  } else {
    try {
      validateAclV2Acceptance({
        aclV2Acceptance: loadedAclAcceptance.artifact,
      });
      aclAcceptance = loadedAclAcceptance.artifact;
      if (canonicalJson(manifestAclAcceptance) !== canonicalJson(aclAcceptance)) {
        blockers.push(
          "aclV2Acceptance does not exactly match the immutable repository artifact",
        );
      }
    } catch (error) {
      blockers.push(`${error.code ?? "ACL_V2_ACCEPTANCE_ARTIFACT_INVALID"}: ` +
        `${error.message}`);
    }
  }

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
  if (!unresolved(release.migrationSha256) &&
      release.migrationSha256 !== FIXED.migrationSha256) {
    blockers.push("release.migrationSha256 does not match the certified migration bytes");
  }
  if (!unresolved(release.candidateSha) && !unresolved(release.frozenSha) && release.candidateSha !== release.frozenSha) {
    blockers.push("release.candidateSha does not equal release.frozenSha");
  }
  if (!unresolved(release.environmentDeltaFingerprintV2) &&
      HEX64.test(String(release.environmentDeltaFingerprintV2).toLowerCase()) &&
      release.environmentDeltaFingerprintV2 !==
        computeEnvironmentDeltaFingerprintV2(manifest)) {
    blockers.push(
      "release.environmentDeltaFingerprintV2 does not match the computed environment delta material",
    );
  }
  const dormantCertificationSnapshot = isDormantCertificationSnapshot(manifest);
  if (dormantCertificationSnapshot &&
      !unresolved(release.certificationFingerprint) &&
      HEX64.test(String(release.certificationFingerprint).toLowerCase()) &&
      release.certificationFingerprint !==
        computeCertificationFingerprint(manifest)) {
    blockers.push(
      "release.certificationFingerprint does not match the computed certification material",
    );
  }
  if (!unresolved(release.executionBundleFingerprintV2) &&
      HEX64.test(String(release.executionBundleFingerprintV2).toLowerCase()) &&
      release.executionBundleFingerprintV2 !==
        computeExecutionBundleMaterialFingerprint(manifest)) {
    blockers.push(
      "release.executionBundleFingerprintV2 does not match the computed execution bundle material",
    );
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
  if (historicalWriterScope.settlementAcceptedAsPrimaryProof !== false ||
      historicalWriterScope.unexplainedConcurrencyWindowCount !== 1) {
    blockers.push(
      "historical writer-scope evidence no longer preserves false/one history",
    );
  }
  if (unresolved(aclAcceptance.acceptanceFingerprint) ||
      !HEX64.test(String(aclAcceptance.acceptanceFingerprint).toLowerCase()) ||
      aclAcceptance.acceptanceFingerprint !==
        computeAclV2AcceptanceFingerprint(aclAcceptance)) {
    blockers.push("aclV2Acceptance.acceptanceFingerprint is unresolved or invalid");
  }
  if (aclAcceptance.acceptedAsPrimaryProof !== true) {
    blockers.push("aclV2Acceptance.acceptedAsPrimaryProof is not true");
  }
  if (aclAcceptance.unexplainedConcurrencyWindowCount !== 0) {
    blockers.push("aclV2Acceptance unexplained concurrency windows are non-zero");
  }
  for (const [field, expected] of [
    ["migrationSha256", release.migrationSha256],
    ["rehearsalCandidateSha", certification.aclEvidenceOnlyDiffBaseSha],
  ]) {
    if (aclAcceptance[field] !== expected) {
      blockers.push(`aclV2Acceptance.${field} does not match the release`);
    }
  }
  if (unresolved(aclAcceptance.rehearsalCandidateSha) ||
      !HEX40.test(String(aclAcceptance.rehearsalCandidateSha).toLowerCase())) {
    blockers.push("aclV2Acceptance.rehearsalCandidateSha is unresolved");
  }
  if (unresolved(aclAcceptance.rehearsalDeploymentId) ||
      !DEPLOYMENT_ID.test(String(aclAcceptance.rehearsalDeploymentId))) {
    blockers.push("aclV2Acceptance.rehearsalDeploymentId is unresolved");
  }
  if (certification.aclEvidenceOnlyDiffPassed !== true ||
      certification.aclEvidenceOnlyDiffUnexpectedPathCount !== 0 ||
      !Number.isSafeInteger(certification.aclEvidenceOnlyDiffAllowedPathCount) ||
      certification.aclEvidenceOnlyDiffAllowedPathCount < 1 ||
      unresolved(certification.aclEvidenceOnlyDiffFingerprint) ||
      !HEX64.test(String(certification.aclEvidenceOnlyDiffFingerprint).toLowerCase()) ||
      certification.aclEvidenceOnlyDiffBaseSha !==
        aclAcceptance.rehearsalCandidateSha ||
      certification.aclEvidenceOnlyDiffTargetSha !== release.frozenSha ||
      certification.aclEvidenceOnlyDiffBaseSha ===
        certification.aclEvidenceOnlyDiffTargetSha) {
    blockers.push(
      "ACL-v2 rehearsal SHA A to frozen certification SHA B evidence-only diff is not proved",
    );
  }
  for (const field of [
    "baselineWafFingerprint", "criticalWindowWafFingerprint",
    "restoredWafFingerprint",
  ]) {
    if (unresolved(aclAcceptance[field]) ||
        !HEX64.test(String(aclAcceptance[field]).toLowerCase())) {
      blockers.push(`aclV2Acceptance.${field} is unresolved`);
    }
  }
  for (const field of [
    "forwardDispatchId", "reverseDispatchId", "settlementReadback1Id",
    "settlementReadback2Id", "fenceId", "installRequestId",
    "quiesceEvidenceId", "restoreQuiesceEvidenceId",
  ]) {
    if (unresolved(aclAcceptance[field]) || !UUID.test(String(aclAcceptance[field]))) {
      blockers.push(`aclV2Acceptance.${field} is unresolved`);
    }
  }
  for (const field of [
    "forwardTransitionProofFingerprint", "reverseTransitionProofFingerprint",
  ]) {
    if (unresolved(aclAcceptance[field]) ||
        !HEX64.test(String(aclAcceptance[field]).toLowerCase())) {
      blockers.push(`aclV2Acceptance.${field} is unresolved`);
    }
  }
  for (const field of [
    "aclReaderConfirmedAt", "restoreCriticalWindowActivatedAt",
    "aclWriterRestoredAt", "rehearsalRestoredAt",
  ]) {
    if (unresolved(aclAcceptance[field]) ||
        !Number.isFinite(Date.parse(String(aclAcceptance[field])))) {
      blockers.push(`aclV2Acceptance.${field} is unresolved`);
    }
  }
  const providerHeldSeconds = Math.floor((
    Date.parse(String(aclAcceptance.aclWriterRestoredAt)) -
    Date.parse(String(aclAcceptance.restoreCriticalWindowActivatedAt))
  ) / 1000);
  if (!Number.isFinite(providerHeldSeconds) ||
      providerHeldSeconds < FIXED.criticalWindowWafMinimumHoldSeconds ||
      providerHeldSeconds !== aclAcceptance.criticalWindowHeldSeconds ||
      Date.parse(String(aclAcceptance.rehearsalRestoredAt)) <
        Date.parse(String(aclAcceptance.aclWriterRestoredAt))) {
    blockers.push(
      "aclV2Acceptance DB-recorded CRITICAL_WINDOW hold/restoration chronology is invalid",
    );
  }
  if (aclAcceptance.quiesceEvidenceId !== rehearsal.quiesceEvidenceId) {
    blockers.push(
      "aclV2Acceptance quiesce receipt does not bind providerFenceRehearsal",
    );
  }
  if (aclAcceptance.forwardDispatchResult !== FIXED.aclTransitionResultTarget ||
      aclAcceptance.reverseDispatchResult !== FIXED.aclTransitionResultTarget) {
    blockers.push("aclV2Acceptance Drive transitions are not both TARGET_CONFIRMED");
  }
  if (aclAcceptance.unknownAclDispatchCount !== 0) {
    blockers.push("aclV2Acceptance contains an OUTCOME_UNKNOWN ACL dispatch");
  }
  if (aclAcceptance.legacyRoleBefore !== FIXED.legacyDriveRoleOpen ||
      aclAcceptance.legacyRoleDuring !== FIXED.legacyDriveRoleClosed ||
      aclAcceptance.legacyRoleAfter !== FIXED.legacyDriveRoleOpen ||
      aclAcceptance.legacyCanEditDuring !== false ||
      aclAcceptance.legacyCanShareDuring !== false) {
    blockers.push("aclV2Acceptance legacy Drive role/capability sequence is invalid");
  }
  if (aclAcceptance.criticalWindowHeldSeconds <
      FIXED.criticalWindowWafMinimumHoldSeconds) {
    blockers.push("aclV2Acceptance critical WAF hold is shorter than 1810 seconds");
  }
  if (aclAcceptance.restoredWafFingerprint !==
      aclAcceptance.baselineWafFingerprint ||
      aclAcceptance.wafBaselineRestored !== true) {
    blockers.push("aclV2Acceptance exact WAF baseline was not restored");
  }
  if (aclAcceptance.googleDataMutationCount !== 0 ||
      aclAcceptance.supabaseCanonicalWriteCount !== 0) {
    blockers.push("aclV2Acceptance reports a Production data mutation");
  }
  for (const field of [
    "oldDeploymentEnforcementPassed", "staleClientEnforcementPassed",
    "lowLevelWriterEnforcementPassed", "previewIsolationPassed",
    "restoredProductionStatePassed",
  ]) {
    if (aclAcceptance[field] !== true) {
      blockers.push(`aclV2Acceptance.${field} is not true`);
    }
  }
  if (certification.clientSecretExposures !== 0) blockers.push("client secret exposures are non-zero");
  if (rehearsal.status !== "PASSED_RESTORED") {
    blockers.push("provider fence rehearsal status is not PASSED_RESTORED");
  }
  for (const key of [
    "exactOldHostProviderFence", "allProductionCapableOriginsControlled",
    "legacyDeploymentsFenced", "googleCredentialsSeparated",
    "nonOwnerManualGoogleScoringFenced", "ownerOverrideOperationallyFrozen",
    "dedicatedWriterRetainedAccess", "legacyWriterDenied", "noDataValueWrites",
    "wafBaselineRestored", "previewResourcesAbsent",
  ]) {
    if (rehearsal[key] !== true) blockers.push(`providerFenceRehearsal.${key} is not true`);
  }
  for (const key of [
    "baselineProviderFingerprint", "readerProviderFingerprint",
    "restoredProviderFingerprint", "baselineWafFingerprint",
    "criticalWindowWafFingerprint", "restoredWafFingerprint",
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
  if (rehearsal.providerInventoryCount !== FIXED.providerInventoryCount ||
      rehearsal.providerInventoryFingerprint !== FIXED.providerInventoryFingerprint) {
    blockers.push("providerFenceRehearsal provider inventory binding is not exact");
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
  const expectedReadinessLiveInventoryCount =
    manifest.providerQuiesceEvidence.status === "VERIFIED"
      ? expectedQuiesceLiveInventoryCount(manifest.providerQuiesceEvidence)
      : null;
  if (!Number.isSafeInteger(rehearsal.liveOriginInventoryCount) ||
      expectedReadinessLiveInventoryCount === null ||
      rehearsal.liveOriginInventoryCount !== expectedReadinessLiveInventoryCount ||
      rehearsal.liveOriginInventoryCount !==
        manifest.providerQuiesceEvidence.liveOriginInventoryCount ||
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
  if (rehearsal.lifecycleMode !== "REHEARSAL" ||
      rehearsal.mechanism !== "DRIVE_ACL_EXACT_LEGACY_PERMISSION_V2") {
    blockers.push("providerFenceRehearsal ACL-v2 lifecycle/mechanism is invalid");
  }
  if (rehearsal.legacyDriveRoleBefore !== FIXED.legacyDriveRoleOpen ||
      rehearsal.legacyDriveRoleDuring !== FIXED.legacyDriveRoleClosed ||
      rehearsal.legacyDriveRoleAfter !== FIXED.legacyDriveRoleOpen ||
      rehearsal.legacyDriveCanEditDuring !== false ||
      rehearsal.legacyDriveCanShareDuring !== false) {
    blockers.push("providerFenceRehearsal Drive role/capability sequence is invalid");
  }
  if (unresolved(rehearsal.legacyPrincipalFingerprint) ||
      !HEX64.test(String(rehearsal.legacyPrincipalFingerprint).toLowerCase()) ||
      rehearsal.legacyPrincipalFingerprint !==
        aclAcceptance.legacyPrincipalFingerprint ||
      rehearsal.legacyPrincipalFingerprint !== state.providerPrincipalFingerprint) {
    blockers.push(
      "legacy principal fingerprint does not bind rehearsal, ACL artifact, and ADMISSION_V3 gate",
    );
  }
  if (rehearsal.aclDowngradeDispatchResult !== FIXED.aclTransitionResultTarget ||
      rehearsal.aclRestoreDispatchResult !== FIXED.aclTransitionResultTarget ||
      rehearsal.unknownAclDispatchCount !== 0) {
    blockers.push("providerFenceRehearsal ACL dispatch proof is unresolved");
  }
  if (rehearsal.googleCanonicalWriterOperationCount !== 0 ||
      rehearsal.supabaseCanonicalWriteCount !== 0) {
    blockers.push("providerFenceRehearsal reports a canonical data mutation");
  }
  if (rehearsal.restoredProviderFingerprint !==
      rehearsal.baselineProviderFingerprint) {
    blockers.push("providerFenceRehearsal provider baseline was not restored");
  }
  if (rehearsal.restoredWafFingerprint !== rehearsal.baselineWafFingerprint ||
      rehearsal.criticalWindowHeldSeconds <
        FIXED.criticalWindowWafMinimumHoldSeconds ||
      rehearsal.criticalWindowMinimumHoldSeconds !==
        FIXED.criticalWindowWafMinimumHoldSeconds) {
    blockers.push("providerFenceRehearsal WAF baseline/hold proof is invalid");
  }
  if (manifest.providerQuiesceEvidence.status !== "VERIFIED") {
    blockers.push("providerQuiesceEvidence is not VERIFIED historical evidence");
  }
  if (!new Set(["MISSING", "REMOVED"])
    .has(manifest.persistentProviderFence.status) ||
      manifest.persistentProviderFence.legacyDriveRole !==
        FIXED.legacyDriveRoleOpen ||
      manifest.persistentProviderFence.legacyDriveCanEdit !== true ||
      manifest.persistentProviderFence.legacyDriveCanShare !== true ||
      manifest.persistentProviderFence.aclUnknownDispatchCount !== 0) {
    blockers.push(
      "persistentProviderFence is not absent/restored at the exact legacy writer capabilities",
    );
  }
  if (manifest.providerFenceProof.status !== "MISSING") {
    blockers.push("providerFenceProof is not MISSING at DORMANT readiness");
  }
  if ([
    state.stagedRequestFingerprint, state.stagedPayloadHash,
    state.stagedCertificationFingerprint,
    state.stagedEnvironmentDeltaFingerprintV2,
  ].some((value) => value !== null)) {
    blockers.push("protected staged provenance is not absent at DORMANT readiness");
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
  requireExactResolved(manifest.release.deploymentId, DEPLOYMENT_ID,
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

function assertStep116DormantNonImpact(manifest) {
  for (const field of [
    "stagedRequestFingerprint", "stagedPayloadHash",
    "stagedCertificationFingerprint", "stagedEnvironmentDeltaFingerprintV2",
  ]) {
    requireEqual(
      manifest.state[field],
      null,
      "STEP11_6_STAGED_PROVENANCE_ALREADY_PRESENT",
      `state.${field}`,
    );
  }
  requireEqual(
    manifest.providerFenceRehearsal.restoredProviderFingerprint,
    manifest.providerFenceRehearsal.baselineProviderFingerprint,
    "STEP11_6_REHEARSAL_BASELINE_NOT_RESTORED",
    "providerFenceRehearsal.restoredProviderFingerprint",
  );
  requireEqual(
    manifest.providerFenceRehearsal.restoredWafFingerprint,
    manifest.providerFenceRehearsal.baselineWafFingerprint,
    "STEP11_6_REHEARSAL_BASELINE_NOT_RESTORED",
    "providerFenceRehearsal.restoredWafFingerprint",
  );
  requireEqual(
    manifest.providerQuiesceEvidence.status,
    "VERIFIED",
    "STEP11_6_PROVIDER_QUIESCE_NOT_VERIFIED",
    "providerQuiesceEvidence.status",
  );
  requireEqual(
    ["MISSING", "REMOVED"].includes(manifest.persistentProviderFence.status),
    true,
    "STEP11_6_PROVIDER_FENCE_NOT_RESTORED",
    "persistentProviderFence.status",
  );
  requireEqual(
    manifest.persistentProviderFence.legacyDriveRole,
    FIXED.legacyDriveRoleOpen,
    "STEP11_6_PROVIDER_FENCE_NOT_RESTORED",
    "persistentProviderFence.legacyDriveRole",
  );
  requireEqual(
    manifest.persistentProviderFence.legacyDriveCanEdit,
    true,
    "STEP11_6_PROVIDER_FENCE_NOT_RESTORED",
    "persistentProviderFence.legacyDriveCanEdit",
  );
  requireEqual(
    manifest.persistentProviderFence.legacyDriveCanShare,
    true,
    "STEP11_6_PROVIDER_FENCE_NOT_RESTORED",
    "persistentProviderFence.legacyDriveCanShare",
  );
  requireEqual(
    manifest.persistentProviderFence.aclUnknownDispatchCount,
    0,
    "STEP11_6_PROVIDER_FENCE_NOT_RESTORED",
    "persistentProviderFence.aclUnknownDispatchCount",
  );
  const legacyPrincipalFingerprint = requireResolved(
    manifest.providerFenceRehearsal.legacyPrincipalFingerprint,
    HEX64,
    "STEP11_6_PROVIDER_PRINCIPAL_NOT_RESTORED",
    "providerFenceRehearsal.legacyPrincipalFingerprint",
  );
  requireEqual(
    legacyPrincipalFingerprint,
    requireResolved(
      manifest.aclV2Acceptance.legacyPrincipalFingerprint,
      HEX64,
      "STEP11_6_PROVIDER_PRINCIPAL_NOT_RESTORED",
      "aclV2Acceptance.legacyPrincipalFingerprint",
    ),
    "STEP11_6_PROVIDER_PRINCIPAL_NOT_RESTORED",
    "ACL-v2 legacy principal fingerprint",
  );
  requireEqual(
    legacyPrincipalFingerprint,
    requireResolved(
      manifest.state.providerPrincipalFingerprint,
      HEX64,
      "STEP11_6_PROVIDER_PRINCIPAL_NOT_RESTORED",
      "state.providerPrincipalFingerprint",
    ),
    "STEP11_6_PROVIDER_PRINCIPAL_NOT_RESTORED",
    "ADMISSION_V3 provider principal fingerprint",
  );
  requireEqual(
    manifest.providerFenceProof.status,
    "MISSING",
    "STEP11_6_PROVIDER_PROOF_NOT_ABSENT",
    "providerFenceProof.status",
  );
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

function expectedQuiesceLiveInventoryCount(quiesce) {
  const artifact = productionOriginInventoryBinding();
  // Vercel deployment ids are case-sensitive. `requireResolved` deliberately
  // lower-cases hash-like operator inputs, so validate this identifier without
  // changing its exact provider spelling before matching retained inventory.
  const deploymentId = requireString(
    quiesce.candidateDeploymentId,
    "PROVIDER_QUIESCE_CANDIDATE_IDENTITY_INVALID",
    "providerQuiesceEvidence.candidateDeploymentId",
  );
  if (unresolved(deploymentId) || !DEPLOYMENT_ID.test(deploymentId)) {
    refuse("PROVIDER_QUIESCE_CANDIDATE_IDENTITY_INVALID",
      "providerQuiesceEvidence.candidateDeploymentId has an invalid format.");
  }
  const commit = requireResolved(
    String(quiesce.candidateDeploymentCommit || "").toLowerCase(),
    HEX40,
    "PROVIDER_QUIESCE_CANDIDATE_IDENTITY_INVALID",
    "providerQuiesceEvidence.candidateDeploymentCommit",
  );
  const candidateAliasOrigin = exactProductionOrigin(quiesce.candidateAliasOrigin);
  const candidateImmutableOrigin = exactProductionOrigin(
    quiesce.candidateImmutableOrigin,
  );
  if (!candidateAliasOrigin || !candidateImmutableOrigin ||
      candidateAliasOrigin === candidateImmutableOrigin ||
      retainedOriginInventoryOrigins.has(candidateAliasOrigin)) {
    refuse("PROVIDER_QUIESCE_CANDIDATE_ORIGIN_INVALID",
      "The server-derived candidate origins are invalid or collide with retained inventory.");
  }
  const retainedByOrigin = retainedOriginInventoryByOrigin.get(candidateImmutableOrigin);
  const retainedByDeploymentId = retainedOriginInventoryByDeploymentId.get(deploymentId);
  if (retainedByOrigin || retainedByDeploymentId) {
    if (!retainedByOrigin || !retainedByDeploymentId ||
        retainedByOrigin.deploymentId !== deploymentId ||
        retainedByDeploymentId.origin !== candidateImmutableOrigin ||
        retainedByOrigin.sha !== commit || retainedByDeploymentId.sha !== commit) {
      refuse("PROVIDER_QUIESCE_CANDIDATE_ORIGIN_INVALID",
        "The candidate only partially matched a retained provider deployment tuple.");
    }
    return artifact.recordCount;
  }
  return artifact.recordCount + 1;
}

function assertQuiesceInventoryBinding(quiesce) {
  const artifact = productionOriginInventoryBinding();
  requireEqual(quiesce.originInventoryArtifact, artifact.artifact,
    "ORIGIN_INVENTORY_BINDING_DRIFT", "providerQuiesceEvidence.originInventoryArtifact");
  requireEqual(quiesce.originInventoryCount, artifact.recordCount,
    "ORIGIN_INVENTORY_BINDING_DRIFT", "providerQuiesceEvidence.originInventoryCount");
  requireEqual(quiesce.originInventoryFingerprint, artifact.recordsFingerprint,
    "ORIGIN_INVENTORY_BINDING_DRIFT", "providerQuiesceEvidence.originInventoryFingerprint");
  requireEqual(quiesce.providerInventorySchema, artifact.schemaVersion,
    "PROVIDER_INVENTORY_BINDING_DRIFT",
    "providerQuiesceEvidence.providerInventorySchema");
  requireEqual(quiesce.retainedProviderInventoryCount, artifact.providerRecordCount,
    "PROVIDER_INVENTORY_BINDING_DRIFT",
    "providerQuiesceEvidence.retainedProviderInventoryCount");
  requireEqual(quiesce.retainedProviderInventoryFingerprint,
    artifact.providerRecordsFingerprint, "PROVIDER_INVENTORY_BINDING_DRIFT",
    "providerQuiesceEvidence.retainedProviderInventoryFingerprint");
  const expectedLiveInventoryCount = expectedQuiesceLiveInventoryCount(quiesce);
  requireInteger(quiesce.liveOriginInventoryCount,
    "PROVIDER_QUIESCE_LIVE_INVENTORY_REQUIRED",
    "providerQuiesceEvidence.liveOriginInventoryCount");
  requireInteger(quiesce.liveProviderInventoryCount,
    "PROVIDER_QUIESCE_LIVE_PROVIDER_INVENTORY_REQUIRED",
    "providerQuiesceEvidence.liveProviderInventoryCount");
  if (quiesce.liveOriginInventoryCount !== expectedLiveInventoryCount ||
      quiesce.liveProviderInventoryCount !== quiesce.liveOriginInventoryCount) {
    refuse("PROVIDER_QUIESCE_LIVE_INVENTORY_REQUIRED",
      "The signed live inventory omitted the candidate or retained baseline.");
  }
  requireResolved(quiesce.liveOriginInventoryFingerprint, HEX64,
    "PROVIDER_QUIESCE_LIVE_INVENTORY_REQUIRED",
    "providerQuiesceEvidence.liveOriginInventoryFingerprint");
  requireResolved(quiesce.liveProviderInventoryFingerprint, HEX64,
    "PROVIDER_QUIESCE_LIVE_PROVIDER_INVENTORY_REQUIRED",
    "providerQuiesceEvidence.liveProviderInventoryFingerprint");
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
  const purposeBoundOwnerFreeze = quiesce.purpose === "CUTOVER"
    ? FIXED.cutoverOwnerFreezeConfirmation
    : FIXED.rehearsalOwnerFreezeConfirmation;
  requireEqual(quiesce.ownerFreezeConfirmation, purposeBoundOwnerFreeze,
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

function assertCertifiedLegacyPrincipalBinding(manifest) {
  const legacyPrincipalFingerprint = requireResolved(
    manifest.aclV2Acceptance.legacyPrincipalFingerprint,
    HEX64,
    "LEGACY_PROVIDER_PRINCIPAL_BINDING_MISMATCH",
    "aclV2Acceptance.legacyPrincipalFingerprint",
  );
  requireEqual(
    requireResolved(
      manifest.providerFenceRehearsal.legacyPrincipalFingerprint,
      HEX64,
      "LEGACY_PROVIDER_PRINCIPAL_BINDING_MISMATCH",
      "providerFenceRehearsal.legacyPrincipalFingerprint",
    ),
    legacyPrincipalFingerprint,
    "LEGACY_PROVIDER_PRINCIPAL_BINDING_MISMATCH",
    "providerFenceRehearsal legacy principal",
  );
  requireEqual(
    requireResolved(
      manifest.state.providerPrincipalFingerprint,
      HEX64,
      "LEGACY_PROVIDER_PRINCIPAL_BINDING_MISMATCH",
      "state.providerPrincipalFingerprint",
    ),
    legacyPrincipalFingerprint,
    "LEGACY_PROVIDER_PRINCIPAL_BINDING_MISMATCH",
    "ADMISSION_V3 provider principal",
  );
  return legacyPrincipalFingerprint;
}

function assertFreshActiveCriticalWindow(manifest, quiesce) {
  assertCertifiedLegacyPrincipalBinding(manifest);
  requireEqual(quiesce.purpose, "CUTOVER",
    "PROVIDER_QUIESCE_ACTIVE_EPOCH_REQUIRED",
    "providerQuiesceEvidence.purpose");
  requireEqual(quiesce.routingRule.mode, FIXED.criticalWindowWafMode,
    "PROVIDER_QUIESCE_ACTIVE_EPOCH_REQUIRED",
    "providerQuiesceEvidence.routingRule.mode");
  requireEqual(quiesce.routingRule.groupCount, FIXED.criticalWindowWafGroupCount,
    "PROVIDER_QUIESCE_ACTIVE_EPOCH_REQUIRED",
    "providerQuiesceEvidence.routingRule.groupCount");
  requireEqual(quiesce.baselineWafRestored, false,
    "PROVIDER_QUIESCE_EPOCH_ALREADY_CONSUMED",
    "providerQuiesceEvidence.baselineWafRestored");
  requireEqual(quiesce.restoredWafFingerprint, null,
    "PROVIDER_QUIESCE_EPOCH_ALREADY_CONSUMED",
    "providerQuiesceEvidence.restoredWafFingerprint");
  const step12StartedAt = requireTimestamp(manifest.execution.step12StartedAt,
    "STEP12_START_TIMESTAMP_REQUIRED", "execution.step12StartedAt");
  const activatedAt = requireTimestamp(quiesce.criticalWindowActivatedAt,
    "PROVIDER_QUIESCE_ACTIVE_EPOCH_REQUIRED",
    "providerQuiesceEvidence.criticalWindowActivatedAt");
  const verifiedAt = requireTimestamp(quiesce.verifiedAt,
    "PROVIDER_QUIESCE_ACTIVE_EPOCH_REQUIRED",
    "providerQuiesceEvidence.verifiedAt");
  const ownerFreezeExpiresAt = requireTimestamp(quiesce.ownerFreezeExpiresAt,
    "PROVIDER_QUIESCE_ACTIVE_EPOCH_REQUIRED",
    "providerQuiesceEvidence.ownerFreezeExpiresAt");
  const expiresAt = requireTimestamp(quiesce.expiresAt,
    "PROVIDER_QUIESCE_ACTIVE_EPOCH_REQUIRED",
    "providerQuiesceEvidence.expiresAt");
  const now = Date.now();
  if (Date.parse(activatedAt) < Date.parse(step12StartedAt) ||
      Date.parse(verifiedAt) < Date.parse(step12StartedAt) ||
      Date.parse(verifiedAt) > now || Date.parse(ownerFreezeExpiresAt) <= now ||
      Date.parse(expiresAt) <= now) {
    refuse("PROVIDER_QUIESCE_ACTIVE_EPOCH_STALE",
      "The verified CRITICAL_WINDOW epoch is not fresh and unexpired after Step 12 start.");
  }
  const rehearsalEvidenceId = manifest.providerFenceRehearsal.quiesceEvidenceId;
  if (String(quiesce.evidenceId).toLowerCase() ===
      String(rehearsalEvidenceId || "").toLowerCase()) {
    refuse("PROVIDER_QUIESCE_HISTORICAL_EPOCH_REUSE_FORBIDDEN",
      "Step 12 must use a new provider quiesce evidence identity, not the restored rehearsal epoch.");
  }
  const rehearsalAcceptance = manifest.aclV2Acceptance;
  const cutoverFence = manifest.persistentProviderFence;
  if (String(cutoverFence.installRequestId || "").toLowerCase() ===
      String(rehearsalAcceptance.installRequestId || "").toLowerCase() ||
      (!unresolved(cutoverFence.fenceId) &&
        String(cutoverFence.fenceId).toLowerCase() ===
          String(rehearsalAcceptance.fenceId || "").toLowerCase())) {
    refuse("PERSISTENT_PROVIDER_FENCE_HISTORICAL_RUN_REUSE_FORBIDDEN",
      "Step 12 must use a new install/fence run identity after Step 12 starts.");
  }
  const beginClaim = validatedProviderAliasClaim(manifest, "BEGIN").claim;
  const finalizeClaim = validatedProviderAliasClaim(manifest, "FINALIZE").claim;
  if (Date.parse(beginClaim.providerObservedAt) < Date.parse(step12StartedAt) ||
      Date.parse(finalizeClaim.providerObservedAt) < Date.parse(step12StartedAt) ||
      Date.parse(finalizeClaim.providerObservedAt) > now) {
    refuse("PROVIDER_QUIESCE_PROVIDER_ATTESTATION_STALE",
      "The provider-signed alias attestations were not captured in this active Step 12 epoch.");
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
  assertFreshActiveCriticalWindow(manifest, quiesce);
  return quiesce;
}

function assertPersistentProviderFence(manifest, {
  allowRemovalAuthorized = false,
  linkCurrentQuiesce = true,
} = {}) {
  assertCertifiedLegacyPrincipalBinding(manifest);
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
  requireEqual(fence.lifecycleMode, "CUTOVER",
    "PERSISTENT_PROVIDER_FENCE_INCOMPLETE", "persistentProviderFence.lifecycleMode");
  requireEqual(fence.mechanism, "DRIVE_ACL_EXACT_LEGACY_PERMISSION_V2",
    "PERSISTENT_PROVIDER_FENCE_INCOMPLETE", "persistentProviderFence.mechanism");
  requireEqual(fence.legacyDriveRole, FIXED.legacyDriveRoleClosed,
    "PERSISTENT_PROVIDER_FENCE_INCOMPLETE", "persistentProviderFence.legacyDriveRole");
  requireEqual(fence.legacyDriveCanEdit, false,
    "PERSISTENT_PROVIDER_FENCE_INCOMPLETE",
    "persistentProviderFence.legacyDriveCanEdit");
  requireEqual(fence.legacyDriveCanShare, false,
    "PERSISTENT_PROVIDER_FENCE_INCOMPLETE",
    "persistentProviderFence.legacyDriveCanShare");
  requireEqual(fence.aclDispatchResult, FIXED.aclTransitionResultTarget,
    "PERSISTENT_PROVIDER_FENCE_INCOMPLETE", "persistentProviderFence.aclDispatchResult");
  requireEqual(fence.aclUnknownDispatchCount, 0,
    "PERSISTENT_PROVIDER_FENCE_INCOMPLETE",
    "persistentProviderFence.aclUnknownDispatchCount");
  requireEqual(fence.providerSettlementStage, "SETTLEMENT_READBACK_2",
    "PERSISTENT_PROVIDER_FENCE_SETTLEMENT_INCOMPLETE",
    "persistentProviderFence.providerSettlementStage");
  requireEqual(fence.admissionCloseCommitted, true,
    "PERSISTENT_PROVIDER_FENCE_SETTLEMENT_INCOMPLETE",
    "persistentProviderFence.admissionCloseCommitted");
  for (const field of [
    "expectedBaselineFingerprint", "expectedCanonicalValueFingerprint",
    "aclTransitionFingerprint", "providerFingerprint", "aclFingerprint",
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
  if (!SCOPE_ONLY_INSPECTIONS.has(operation)) assertFrozenRelease(manifest);
  if (![...SCOPE_ONLY_INSPECTIONS, "stage-release", ...PROVIDER_ACTIONS]
    .includes(operation)) {
    assertOptimisticState(manifest);
  }
  if (PERSISTENT_FENCE_REQUIRED_OPERATIONS.has(operation)) {
    assertPersistentProviderFence(manifest);
  }

  switch (operation) {
    case "inspect": return;
    case "inspect-scoring-admission": return;
    case "issue-begin-provider-attestation-challenge":
    case "inspect-begin-provider-attestation-challenge":
    case "inspect-begin-provider-attestation-abandonment":
    case "abandon-begin-provider-attestation-challenge": {
      const quiesce = assertQuiesceRequestScope(manifest);
      requireEqual(quiesce.status, "MISSING",
        "PROVIDER_QUIESCE_BEGIN_STATE_INVALID", "providerQuiesceEvidence.status");
      assertInitialCutoverFenceWindowState(manifest);
      return;
    }
    case "issue-finalize-provider-attestation-challenge":
    case "inspect-finalize-provider-attestation-challenge":
    case "inspect-finalize-provider-attestation-abandonment":
    case "abandon-finalize-provider-attestation-challenge": {
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
      if (fence.aclDispatchResult === FIXED.aclTransitionResultUnknown ||
          fence.aclUnknownDispatchCount !== 0) {
        refuse("ACL_DISPATCH_UNKNOWN_NO_RETRY",
          "An OUTCOME_UNKNOWN Drive ACL dispatch may be inspected but never redispatched.");
      }
      if (!["MISSING", "INSTALLING", "INSTALLED"].includes(fence.status)) {
        refuse("PERSISTENT_PROVIDER_FENCE_INSTALL_STATE_INVALID",
          "A persistent fence install may start, resume settlement, or recover its atomic-close response only.");
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
      requireEqual(state.cutoverPhase, "CURRENT_READS", "PHASE_SKIP_FORBIDDEN",
        "state.cutoverPhase");
      requireEqual(state.activationState, "GOOGLE_LEASE_ARMED", "PHASE_SKIP_FORBIDDEN",
        "state.activationState");
      requireEqual(state.scoringAuthority, "GOOGLE", "AUTHORITY_MISMATCH",
        "state.scoringAuthority");
      requireEqual(state.participantIdentityAuthority, "SUPABASE", "IDENTITY_MISMATCH",
        "state.participantIdentityAuthority");
      requireEqual(state.admissionProtocolEnforced, true,
        "ADMISSION_PROTOCOL_STATE_MISMATCH", "state.admissionProtocolEnforced");
      requireEqual(state.admissionDeploymentId, manifest.release.deploymentId,
        "PROVIDER_CANDIDATE_BINDING_MISMATCH", "state.admissionDeploymentId");
      requireEqual(state.scoringIngressEnabled, false,
        "INGRESS_STATE_MISMATCH", "state.scoringIngressEnabled");
      requireEqual(state.workersEnabled, false,
        "WORKERS_MUST_BE_DISABLED", "state.workersEnabled");
      assertNoLegacyWriters(manifest);
      assertDurableQueuesDrained(manifest);
      assertFirstWrite(manifest, { possible: false, observed: false });
      if (fence.status === "MISSING") {
        assertInitialCutoverFenceWindowState(manifest);
      } else if (fence.status === "INSTALLING") {
        requireEqual(state.admissionState, "CLOSING", "ADMISSION_STATE_MISMATCH",
          "state.admissionState");
        requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH",
          "state.gateExecutionState");
        requireEqual(state.activeClosureId, null, "CLOSURE_STATE_MISMATCH",
          "state.activeClosureId");
        requireEqual(state.activeClosureKind, null, "CLOSURE_STATE_MISMATCH",
          "state.activeClosureKind");
        requireEqual(state.activeClosureStatus, null, "CLOSURE_STATE_MISMATCH",
          "state.activeClosureStatus");
      } else {
        assertPersistentProviderFence(manifest);
        requireEqual(state.admissionState, "CLOSING", "ADMISSION_STATE_MISMATCH",
          "state.admissionState");
        requireEqual(state.gateExecutionState, "PAUSED", "GATE_STATE_MISMATCH",
          "state.gateExecutionState");
        requireResolved(state.activeClosureId, UUID, "CLOSURE_STATE_MISMATCH",
          "state.activeClosureId");
        requireEqual(state.activeClosureKind, "LEGACY_ADMISSION",
          "CLOSURE_STATE_MISMATCH", "state.activeClosureKind");
        requireEqual(state.activeClosureStatus, "CLOSING",
          "CLOSURE_STATE_MISMATCH", "state.activeClosureStatus");
      }
      return;
    }
    case "abort-persistent-provider-fence-install": {
      const quiesce = assertVerifiedQuiesce(manifest);
      const fence = manifest.persistentProviderFence;
      if (fence.aclDispatchResult === FIXED.aclTransitionResultUnknown ||
          fence.aclUnknownDispatchCount !== 0) {
        refuse("ACL_DISPATCH_UNKNOWN_NO_RETRY",
          "An OUTCOME_UNKNOWN Drive ACL dispatch may not be reversed, retried, or reopened.");
      }
      if (!["INSTALLING", "FAILED"].includes(fence.status)) {
        refuse(
          "PERSISTENT_PROVIDER_FENCE_ABORT_STATE_INVALID",
          "Only an unfinished installation or its exact completed abort receipt may use recovery.",
        );
      }
      assertCandidateEvidenceBinding(manifest, fence, "persistentProviderFence");
      requireResolved(fence.fenceId, UUID,
        "PERSISTENT_PROVIDER_FENCE_ID_REQUIRED", "persistentProviderFence.fenceId");
      requireResolved(fence.installRequestId, UUID,
        "PERSISTENT_PROVIDER_FENCE_INSTALL_ID_REQUIRED",
        "persistentProviderFence.installRequestId");
      requireEqual(requireResolved(fence.abortRequestId, UUID,
        "PERSISTENT_PROVIDER_FENCE_ABORT_ID_REQUIRED",
        "persistentProviderFence.abortRequestId"),
      requireResolved(manifest.stableRequestIds[operation], UUID,
        "STABLE_REQUEST_ID_REQUIRED", `stableRequestIds.${operation}`),
      "PERSISTENT_PROVIDER_FENCE_ABORT_ID_MISMATCH",
      "persistentProviderFence.abortRequestId");
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
      requireEqual(state.cutoverPhase, "CURRENT_READS", "PHASE_SKIP_FORBIDDEN",
        "state.cutoverPhase");
      requireEqual(state.activationState, "GOOGLE_LEASE_ARMED", "PHASE_SKIP_FORBIDDEN",
        "state.activationState");
      requireEqual(state.scoringAuthority, "GOOGLE", "AUTHORITY_MISMATCH",
        "state.scoringAuthority");
      requireEqual(state.participantIdentityAuthority, "SUPABASE", "IDENTITY_MISMATCH",
        "state.participantIdentityAuthority");
      requireEqual(state.scoringIngressEnabled, false,
        "INGRESS_STATE_MISMATCH", "state.scoringIngressEnabled");
      requireEqual(state.workersEnabled, false,
        "WORKERS_MUST_BE_DISABLED", "state.workersEnabled");
      requireEqual(state.activeClosureId, null,
        "PERSISTENT_PROVIDER_FENCE_ABORT_NOT_SAFE", "state.activeClosureId");
      requireEqual(state.preparedEpochId, null,
        "PERSISTENT_PROVIDER_FENCE_ABORT_NOT_SAFE", "state.preparedEpochId");
      assertNoLegacyWriters(manifest);
      assertDurableQueuesDrained(manifest);
      assertFirstWrite(manifest, { possible: false, observed: false });
      if (fence.status === "INSTALLING") {
        requireEqual(state.admissionProtocolEnforced, true,
          "ADMISSION_PROTOCOL_STATE_MISMATCH", "state.admissionProtocolEnforced");
        requireEqual(state.admissionState, "CLOSING",
          "PERSISTENT_PROVIDER_FENCE_ABORT_NOT_SAFE", "state.admissionState");
        requireEqual(state.gateExecutionState, "PAUSED",
          "PERSISTENT_PROVIDER_FENCE_ABORT_NOT_SAFE", "state.gateExecutionState");
      } else {
        requireEqual(fence.abortRequestId,
          manifest.stableRequestIds[operation],
          "PERSISTENT_PROVIDER_FENCE_ABORT_ID_MISMATCH",
          "persistentProviderFence.abortRequestId");
        requireResolved(fence.abortRestorationEvidenceFingerprint, HEX64,
          "PERSISTENT_PROVIDER_FENCE_ABORT_RECEIPT_REQUIRED",
          "persistentProviderFence.abortRestorationEvidenceFingerprint");
      }
      return;
    }
    case "inspect-persistent-provider-fence": {
      const fence = manifest.persistentProviderFence;
      assertCandidateEvidenceBinding(manifest, fence, "persistentProviderFence");
      if (["INSTALLING", "FAILED"].includes(fence.status)) {
        requireResolved(fence.installRequestId, UUID,
          "PERSISTENT_PROVIDER_FENCE_ID_REQUIRED",
          "persistentProviderFence.installRequestId");
        requireResolved(fence.fenceId, UUID,
          "PERSISTENT_PROVIDER_FENCE_ID_REQUIRED",
          "persistentProviderFence.fenceId");
      } else if (fence.status !== "MISSING") {
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
      assertStep116DormantNonImpact(manifest);
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
  if (SCOPE_ONLY_INSPECTIONS.has(operation)) {
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
    ? requireExactResolved(release.deploymentId, DEPLOYMENT_ID,
      "DEPLOYMENT_ID_REQUIRED", "release.deploymentId")
    : requireExactResolved(state.admissionDeploymentId ?? release.deploymentId, DEPLOYMENT_ID,
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
  validatedProviderAliasClaim(manifest, stage);
  const routing = manifest.providerQuiesceEvidence.routingRule;
  if (envelope.schemaVersion !== "bagger-vercel-provider-attestation-envelope-v2" ||
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
      claim.schemaVersion !==
        "bagger-vercel-provider-attestation-noncanonical-host-v2" ||
      claim.stage !== stage ||
      claim.purpose !== manifest.providerQuiesceEvidence.purpose ||
      claim.vercelProjectId !== FIXED.vercelProjectId ||
      claim.vercelTeamId !== manifest.resources.vercelTeamId ||
      claim.candidateDeploymentId !== manifest.release.deploymentId ||
      claim.candidateDeploymentCommit !== manifest.release.frozenSha ||
      claim.candidateDeploymentTarget !== "PREVIEW" ||
      claim.candidateAliasOrigin !==
        manifest.providerQuiesceEvidence.candidateAliasOrigin ||
      claim.candidateImmutableOrigin !==
        manifest.providerQuiesceEvidence.candidateImmutableOrigin ||
      claim.routingRuleHostnameOperator !== routing.hostnameOperator ||
      claim.routingRuleCanonicalHostname !== routing.canonicalHostname ||
      claim.routingRuleEarlierActiveBypassRuleCount !==
        routing.earlierActiveBypassRuleCount ||
      claim.routingRuleAllMethodFenceRequiredHostCount !==
        routing.allMethodFenceRequiredHostCount ||
      claim.routingRuleAllMethodFenceRequiredHostsFingerprint !==
        routing.allMethodFenceRequiredHostsFingerprint ||
      claim.routingRuleAllMethodFenceRequiredPathCount !==
        routing.allMethodFenceRequiredPathCount ||
      claim.routingRuleAllMethodFenceRequiredPathsFingerprint !==
        routing.allMethodFenceRequiredPathsFingerprint) {
    refuse("PROVIDER_ATTESTATION_BINDING_MISMATCH",
      `The ${stage} provider attestation does not match its DB challenge and release scope.`);
  }
  return clone(envelope);
}

function retainedProviderAttestationChallenge(
  manifest,
  challenge,
  stage,
  requestOperation,
) {
  const retained = requireObject(
    challenge.retainedChallenge,
    "PROVIDER_ATTESTATION_RETAINED_CHALLENGE_REQUIRED",
    `providerAttestationChallenges.${stage.toLowerCase()}.retainedChallenge`,
  );
  const quiesce = manifest.providerQuiesceEvidence;
  const status = String(retained.status || "").toUpperCase();
  const expectedTarget = "PREVIEW";
  const exact = [
    [retained.challengeId, challenge.challengeId],
    [retained.challengeRequestId, challenge.challengeRequestId],
    [retained.operationRequestId, manifest.stableRequestIds[requestOperation]],
    [retained.evidenceRequestId, quiesce.evidenceRequestId],
    [retained.stage, stage],
    [retained.purpose, quiesce.purpose],
    [retained.vercelProjectId, FIXED.vercelProjectId],
    [retained.vercelTeamId, manifest.resources.vercelTeamId],
    [retained.candidateDeploymentId, manifest.release.deploymentId],
    [retained.candidateDeploymentCommit, manifest.release.frozenSha],
    [retained.candidateDeploymentTarget, expectedTarget],
    [retained.candidateAliasOrigin, quiesce.candidateAliasOrigin],
    [retained.candidateImmutableOrigin, quiesce.candidateImmutableOrigin],
    [retained.routingRuleId, quiesce.routingRule.ruleId],
    [retained.routingRuleConfigVersion, quiesce.routingRule.revision],
  ];
  if (!new Set(["ISSUED", "CONSUMED"]).has(status) ||
      exact.some(([actual, expected]) => actual !== expected) ||
      !HEX64.test(String(retained.challengeRequestFingerprint || "")) ||
      !Number.isFinite(Date.parse(String(retained.issuedAt || ""))) ||
      !Number.isFinite(Date.parse(String(retained.expiresAt || ""))) ||
      Date.parse(retained.expiresAt) <= Date.parse(retained.issuedAt) ||
      Date.parse(retained.expiresAt) > Date.parse(retained.issuedAt) + 120_000 ||
      (status === "CONSUMED" && (
        retained.consumeRequestId !== challenge.consumeRequestId ||
        !UUID.test(String(retained.consumedAttestationId || "")) ||
        retained.consumedAttestationId !==
          challenge.signedAttestation?.attestation?.attestationId ||
        retained.consumedAttestationFingerprint !==
          challenge.signedAttestation?.attestationFingerprint ||
        !HEX64.test(String(retained.consumedAttestationFingerprint || ""))
      ))) {
    refuse(
      "PROVIDER_ATTESTATION_RETAINED_CHALLENGE_MISMATCH",
      `The retained ${stage} provider challenge does not match the protected cutover binding.`,
    );
  }
  return clone(retained);
}

function providerActionDefaults(manifest, operation) {
  const quiesce = manifest.providerQuiesceEvidence;
  const fence = manifest.persistentProviderFence;
  const common = operation.includes("provider-attestation")
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
    case "inspect-begin-provider-attestation-abandonment": return {
      ...providerCommonPayload(manifest, operation, {
        requestOperation: "begin-provider-quiesce",
        routeAction: "inspect-retained-provider-attestation-challenge",
      }),
      evidenceRequestId: quiesce.evidenceRequestId,
      challengeRequestId: beginChallenge.challengeRequestId,
      providerAttestationStage: "BEGIN",
      providerChallengeId: beginChallenge.challengeId,
      providerRetainedChallenge: retainedProviderAttestationChallenge(
        manifest, beginChallenge, "BEGIN", "begin-provider-quiesce",
      ),
      quiescePurpose: "CUTOVER",
    };
    case "abandon-begin-provider-attestation-challenge": return {
      ...providerCommonPayload(manifest, operation, {
        requestOperation: "begin-provider-quiesce",
        routeAction: "abandon-provider-attestation-challenge",
      }),
      evidenceRequestId: quiesce.evidenceRequestId,
      challengeRequestId: beginChallenge.challengeRequestId,
      providerAttestationStage: "BEGIN",
      providerChallengeId: beginChallenge.challengeId,
      providerRetainedChallenge: retainedProviderAttestationChallenge(
        manifest, beginChallenge, "BEGIN", "begin-provider-quiesce",
      ),
      abandonRequestId: requireResolved(beginChallenge.abandonRequestId, UUID,
        "PROVIDER_ATTESTATION_ABANDON_REQUEST_REQUIRED",
        "providerAttestationChallenges.begin.abandonRequestId"),
      quiescePurpose: "CUTOVER",
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
    case "inspect-finalize-provider-attestation-abandonment": return {
      ...providerCommonPayload(manifest, operation, {
        requestOperation: "finalize-provider-quiesce",
        routeAction: "inspect-retained-provider-attestation-challenge",
      }),
      evidenceRequestId: quiesce.evidenceRequestId,
      challengeRequestId: finalizeChallenge.challengeRequestId,
      providerAttestationStage: "FINALIZE",
      providerChallengeId: finalizeChallenge.challengeId,
      providerRetainedChallenge: retainedProviderAttestationChallenge(
        manifest, finalizeChallenge, "FINALIZE", "finalize-provider-quiesce",
      ),
      quiescePurpose: "CUTOVER",
    };
    case "abandon-finalize-provider-attestation-challenge": return {
      ...providerCommonPayload(manifest, operation, {
        requestOperation: "finalize-provider-quiesce",
        routeAction: "abandon-provider-attestation-challenge",
      }),
      evidenceRequestId: quiesce.evidenceRequestId,
      challengeRequestId: finalizeChallenge.challengeRequestId,
      providerAttestationStage: "FINALIZE",
      providerChallengeId: finalizeChallenge.challengeId,
      providerRetainedChallenge: retainedProviderAttestationChallenge(
        manifest, finalizeChallenge, "FINALIZE", "finalize-provider-quiesce",
      ),
      abandonRequestId: requireResolved(finalizeChallenge.abandonRequestId, UUID,
        "PROVIDER_ATTESTATION_ABANDON_REQUEST_REQUIRED",
        "providerAttestationChallenges.finalize.abandonRequestId"),
      quiescePurpose: "CUTOVER",
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
    case "abort-persistent-provider-fence-install": return {
      ...common,
      installRequestId: fence.installRequestId,
      fenceId: fence.fenceId,
      quiesceEvidenceId: fence.quiesceEvidenceId,
      expectedBaselineFingerprint: fence.expectedBaselineFingerprint,
      expectedCanonicalValueFingerprint: fence.expectedCanonicalValueFingerprint,
      confirmation: FIXED.providerFenceAbortConfirmation,
    };
    case "inspect-persistent-provider-fence": {
      const absent = fence.status === "MISSING";
      const hasVerification = new Set([
        "INSTALLED", "REMOVAL_AUTHORIZED", "REMOVED",
      ]).has(fence.status);
      return {
        ...common,
        installRequestId: absent ? null : fence.installRequestId,
        fenceId: absent ? null : fence.fenceId,
        currentVerificationId: hasVerification ? fence.currentVerificationId : null,
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
    case "inspect":
    case "inspect-scoring-admission": return {};
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
  const providerSettlement = manifest.persistentProviderFence;
  return {
    activationState: manifest.state.activationState,
    activationRevision: manifest.state.activationRevision,
    authorityGeneration: manifest.state.authorityGeneration,
    stagedRequestFingerprint: manifest.state.stagedRequestFingerprint,
    stagedPayloadHash: manifest.state.stagedPayloadHash,
    stagedCertificationFingerprint:
      manifest.state.stagedCertificationFingerprint,
    stagedEnvironmentDeltaFingerprintV2:
      manifest.state.stagedEnvironmentDeltaFingerprintV2,
    scoringAuthority: manifest.state.scoringAuthority,
    scoringIngressEnabled: manifest.state.scoringIngressEnabled,
    gateExecutionState: manifest.state.gateExecutionState,
    admissionState: manifest.state.admissionState,
    admissionRevision: manifest.state.admissionRevision,
    admissionGeneration: manifest.state.admissionGeneration,
    providerPrincipalFingerprint:
      manifest.state.providerPrincipalFingerprint,
    certifiedLegacyPrincipalFingerprint:
      manifest.aclV2Acceptance.legacyPrincipalFingerprint,
    activeClosureId: manifest.state.activeClosureId,
    activeClosureKind: manifest.state.activeClosureKind,
    activeClosureStatus: manifest.state.activeClosureStatus,
    activeLegacyWriters: manifest.state.activeLegacyWriters,
    unresolvedLegacyWriters: manifest.state.unresolvedLegacyWriters,
    ambiguousGoogleWrites: manifest.state.ambiguousGoogleWrites,
    partialGoogleWrites: manifest.state.partialGoogleWrites,
    legacyUnclassifiedWriters: manifest.state.legacyUnclassifiedWriters,
    unresolvedOutbox: manifest.state.unresolvedOutbox,
    unresolvedArchive: manifest.state.unresolvedArchive,
    firstSupabaseCanonicalWritePossible:
      manifest.state.firstSupabaseCanonicalWritePossible,
    firstSupabaseCanonicalWriteObserved:
      manifest.state.firstSupabaseCanonicalWriteObserved,
    quiesceEvidenceId: manifest.providerQuiesceEvidence.evidenceId,
    quiesceEvidenceRequestId: manifest.providerQuiesceEvidence.evidenceRequestId,
    persistentProviderFenceStatus: manifest.persistentProviderFence.status,
    persistentProviderFenceLifecycleMode:
      manifest.persistentProviderFence.lifecycleMode,
    persistentProviderFenceMechanism:
      manifest.persistentProviderFence.mechanism,
    persistentProviderFenceId: manifest.persistentProviderFence.fenceId,
    persistentProviderFenceVerificationId:
      manifest.persistentProviderFence.currentVerificationId,
    legacyDriveRole: manifest.persistentProviderFence.legacyDriveRole,
    legacyDriveCanEdit: manifest.persistentProviderFence.legacyDriveCanEdit,
    legacyDriveCanShare: manifest.persistentProviderFence.legacyDriveCanShare,
    aclDispatchResult: manifest.persistentProviderFence.aclDispatchResult,
    aclUnknownDispatchCount:
      manifest.persistentProviderFence.aclUnknownDispatchCount,
    criticalWindowWafMode: manifest.providerQuiesceEvidence.routingRule.mode,
    criticalWindowWafGroupCount:
      manifest.providerQuiesceEvidence.routingRule.groupCount,
    criticalWindowWafFingerprint:
      manifest.providerQuiesceEvidence.criticalWindowWafFingerprint,
    criticalWindowActivatedAt:
      manifest.providerQuiesceEvidence.criticalWindowActivatedAt,
    aclV2AcceptanceFingerprint:
      manifest.aclV2Acceptance.acceptanceFingerprint,
    providerSettlementStage: providerSettlement.providerSettlementStage,
    providerSettlementLatestObservationId:
      providerSettlement.providerSettlementLatestObservationId,
    aclReaderConfirmedObservationId:
      providerSettlement.aclReaderConfirmedObservationId,
    settlementReadback1ObservationId:
      providerSettlement.settlementReadback1ObservationId,
    settlementReadback2ObservationId:
      providerSettlement.settlementReadback2ObservationId,
    providerSettlementNextEligibleAt:
      providerSettlement.providerSettlementNextEligibleAt,
    providerSettlementRemainingWaitSeconds:
      providerSettlement.providerSettlementRemainingWaitSeconds,
    providerSettlementInstallWaitSeconds:
      providerSettlement.providerSettlementInstallWaitSeconds,
    providerSettlementReadbackWaitSeconds:
      providerSettlement.providerSettlementReadbackWaitSeconds,
    settlementCompletedAt: providerSettlement.settlementCompletedAt,
    admissionCloseCommitted: providerSettlement.admissionCloseCommitted,
  };
}

function buildProviderSettlementCheckpoint(manifest) {
  const fence = manifest.persistentProviderFence;
  const stage = fence.providerSettlementStage;
  const nextOperation = stage === "AWAITING_ACL_READER_CONFIRMED"
    ? "DISPATCH_DRIVE_WRITER_TO_READER_AND_RECORD_TARGET_CONFIRMED"
    : stage === "ACL_READER_CONFIRMED"
      ? "WAIT_UNTIL_ELIGIBLE_THEN_RECORD_SETTLEMENT_READBACK_1"
      : stage === "SETTLEMENT_READBACK_1"
        ? "WAIT_UNTIL_ELIGIBLE_THEN_ATOMIC_READBACK_2_FINISH_AND_CLOSE"
        : "SETTLEMENT_COMPLETE_ADMISSION_CLOSING_DRAIN_REQUIRED";
  return {
    stage,
    nextOperation,
    mechanism: fence.mechanism,
    lifecycleMode: fence.lifecycleMode,
    legacyDriveRole: fence.legacyDriveRole,
    aclDispatchResult: fence.aclDispatchResult,
    aclUnknownDispatchCount: fence.aclUnknownDispatchCount,
    aclDispatchRetryAllowed: false,
    nextEligibleAt: fence.providerSettlementNextEligibleAt,
    remainingWaitSeconds: fence.providerSettlementRemainingWaitSeconds,
    minimumSecondsAfterAclReaderConfirmed:
      FIXED.providerSettlementInstallWaitSeconds,
    minimumSecondsBetweenReadbacks:
      FIXED.providerSettlementReadbackWaitSeconds,
    minimumTotalSeconds: FIXED.providerSettlementMinimumTotalSeconds,
    finishAndCloseRpc: FIXED.providerSettlementFinishAndCloseRpc,
    admissionCloseCommitted: fence.admissionCloseCommitted,
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
  if (!SCOPE_ONLY_INSPECTIONS.has(operation)) {
    assertExactFingerprintClaims(manifest, {
      requireStep11CertificationMaterial: operation === "stage-release",
    });
  }
  const diagnosticStateGuard = buildDiagnosticStateGuard(manifest);
  if (PROVIDER_ACTIONS.has(operation)) {
    const providerSettlementCheckpoint =
      buildProviderSettlementCheckpoint(manifest);
    let payload = providerActionDefaults(manifest, operation);
    payload = mergeProviderActionInput(manifest, operation, payload);
    validateRenderedProviderPayload(operation, payload);
    const requestFingerprint = sha256Hex(canonicalJson({
      domain: "BAGGER_STEP12_PROVIDER_ACTION_REQUEST_V1",
      operation,
      payload,
      diagnosticStateGuard,
      providerSettlementCheckpoint,
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
      providerSettlementCheckpoint,
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

function environmentDeltaMaterial(manifest) {
  const release = clone(manifest.release);
  delete release.environmentDeltaFingerprintV2;
  delete release.certificationFingerprint;
  delete release.executionBundleFingerprintV2;
  return {
    domain: "BAGGER_STEP12_ENVIRONMENT_DELTA_V2",
    newEnvironmentVariables: [],
    resources: clone(manifest.resources),
    release,
    provider: {
      controlEndpoint: FIXED.providerControlEndpoint,
      fenceBranch: FIXED.providerFenceBranch,
      directorPlayerId: FIXED.providerFenceDirector,
      fenceDescription: FIXED.providerFenceDescription,
      fenceRemoveConfirmation: FIXED.providerFenceRemoveConfirmation,
      rehearsalOwnerFreezeConfirmation:
        FIXED.rehearsalOwnerFreezeConfirmation,
      cutoverOwnerFreezeConfirmation:
        FIXED.cutoverOwnerFreezeConfirmation,
      quiesceScope: FIXED.quiesceScope,
      originInventoryArtifact: FIXED.originInventoryArtifact,
      originInventorySchema: FIXED.originInventorySchema,
      originInventoryCount: FIXED.originInventoryCount,
      originInventoryFingerprint: FIXED.originInventoryFingerprint,
      providerInventoryCount: FIXED.providerInventoryCount,
      providerInventoryFingerprint: FIXED.providerInventoryFingerprint,
      credentialConfinementArtifact: FIXED.credentialConfinementArtifact,
      credentialConfinementSchema: FIXED.credentialConfinementSchema,
      credentialConfinementRecordCount: FIXED.credentialConfinementRecordCount,
      credentialConfinementRecordsFingerprint:
        FIXED.credentialConfinementRecordsFingerprint,
      credentialConfinementEvidenceFingerprint:
        FIXED.credentialConfinementEvidenceFingerprint,
      credentialConfinementEnvironmentReviewSchema:
        FIXED.credentialConfinementEnvironmentReviewSchema,
      credentialConfinementProviderEnvironmentRecordCount:
        FIXED.credentialConfinementProviderEnvironmentRecordCount,
      credentialConfinementHiddenProductionEnvironmentRecordCount:
        FIXED.credentialConfinementHiddenProductionEnvironmentRecordCount,
      credentialConfinementReviewedEnvironmentRecordCount:
        FIXED.credentialConfinementReviewedEnvironmentRecordCount,
      credentialConfinementReviewedEnvironmentRecordsFingerprint:
        FIXED.credentialConfinementReviewedEnvironmentRecordsFingerprint,
      credentialConfinementEnvironmentReviewFingerprint:
        FIXED.credentialConfinementEnvironmentReviewFingerprint,
      credentialConfinementEnvironmentContinuityFingerprint:
        FIXED.credentialConfinementEnvironmentContinuityFingerprint,
      historicalSafeMethodWriterArtifact:
        FIXED.historicalSafeMethodWriterArtifact,
      historicalSafeMethodWriterSchema:
        FIXED.historicalSafeMethodWriterSchema,
      historicalSafeMethodWriterEvidenceFingerprint:
        FIXED.historicalSafeMethodWriterEvidenceFingerprint,
      historicalSafeMethodWriterAffectedOriginCount:
        FIXED.historicalSafeMethodWriterAffectedOriginCount,
      historicalSafeMethodWriterAffectedOriginsFingerprint:
        FIXED.historicalSafeMethodWriterAffectedOriginsFingerprint,
      allMethodFenceRequiredPathCount:
        FIXED.allMethodFenceRequiredPathCount,
      allMethodFenceRequiredPathsFingerprint:
        FIXED.allMethodFenceRequiredPathsFingerprint,
      minimumLiveOriginInventoryCount: FIXED.minimumLiveOriginInventoryCount,
      maximumLiveOriginInventoryCount: FIXED.maximumLiveOriginInventoryCount,
      fixedAliasOriginCount: FIXED.quiesceFixedAliasOriginCount,
      candidateAliasOriginCount: FIXED.quiesceCandidateAliasOriginCount,
      probeVectorCount: FIXED.quiesceProbeVectorCount,
      aclAcceptanceSchema: FIXED.aclAcceptanceSchema,
      aclMechanism: "DRIVE_ACL_EXACT_LEGACY_PERMISSION_V2",
      legacyDriveRoleOpen: FIXED.legacyDriveRoleOpen,
      legacyDriveRoleClosed: FIXED.legacyDriveRoleClosed,
      aclTargetResult: FIXED.aclTransitionResultTarget,
      aclUnknownResult: FIXED.aclTransitionResultUnknown,
      aclUnknownRetryAllowed: false,
      providerSettlementInstallWaitSeconds:
        FIXED.providerSettlementInstallWaitSeconds,
      providerSettlementReadbackWaitSeconds:
        FIXED.providerSettlementReadbackWaitSeconds,
      criticalWindowWafMode: FIXED.criticalWindowWafMode,
      criticalWindowWafGroupCount: FIXED.criticalWindowWafGroupCount,
      criticalWindowWafMinimumHoldSeconds:
        FIXED.criticalWindowWafMinimumHoldSeconds,
      baselineWafMode: FIXED.legacyCompatibleBaselineWafMode,
    },
    migration: {
      name: manifest.release.migrationName,
      sha256: manifest.release.migrationSha256,
    },
  };
}

export function computeEnvironmentDeltaFingerprintV2(manifest) {
  validateManifest(manifest);
  return sha256Hex(canonicalJson(environmentDeltaMaterial(manifest)));
}

export function computeCertificationFingerprint(manifest) {
  validateManifest(manifest);
  const release = clone(manifest.release);
  delete release.certificationFingerprint;
  delete release.executionBundleFingerprintV2;
  release.environmentDeltaFingerprintV2 =
    computeEnvironmentDeltaFingerprintV2(manifest);
  return sha256Hex(canonicalJson({
    domain: "BAGGER_STEP11_6_CERTIFICATION_V2",
    certification: clone(manifest.certification),
    providerFenceRehearsal: clone(manifest.providerFenceRehearsal),
    aclV2Acceptance: clone(manifest.aclV2Acceptance),
    providerQuiesceEvidence: clone(manifest.providerQuiesceEvidence),
    state: clone(manifest.state),
    resources: clone(manifest.resources),
    release,
  }));
}

export function computeExecutionBundleMaterialFingerprint(manifest) {
  validateManifest(manifest);
  const material = clone(manifest);
  delete material.executionReadiness;
  if (material.execution) {
    // Owner authorization is a mutable execution decision, not Step 11.6
    // certification material. All inert execution controls remain bound.
    delete material.execution.step12OwnerAuthorizationRecorded;
  }
  if (material.release) delete material.release.executionBundleFingerprintV2;
  return sha256Hex(canonicalJson({
    domain: "BAGGER_STEP12_EXECUTION_BUNDLE_V2",
    manifest: material,
  }));
}

function isDormantCertificationSnapshot(manifest) {
  return manifest.state.cutoverPhase === "DORMANT" &&
    manifest.state.activationState === "DORMANT" &&
    manifest.state.stagedRequestFingerprint === null &&
    manifest.state.stagedPayloadHash === null &&
    manifest.state.stagedCertificationFingerprint === null &&
    manifest.state.stagedEnvironmentDeltaFingerprintV2 === null;
}

export function computeFingerprintSet(manifest) {
  const environmentDeltaFingerprintV2 =
    computeEnvironmentDeltaFingerprintV2(manifest);
  const certificationFingerprint = isDormantCertificationSnapshot(manifest)
    ? computeCertificationFingerprint(manifest)
    : requireResolved(
      manifest.release.certificationFingerprint,
      HEX64,
      "CERTIFICATION_FINGERPRINT_REQUIRED",
      "release.certificationFingerprint",
    );
  const executionMaterial = clone(manifest);
  executionMaterial.release.environmentDeltaFingerprintV2 =
    environmentDeltaFingerprintV2;
  executionMaterial.release.certificationFingerprint = certificationFingerprint;
  const executionBundleFingerprintV2 =
    computeExecutionBundleMaterialFingerprint(executionMaterial);
  return {
    environmentDeltaFingerprintV2,
    certificationFingerprint,
    executionBundleFingerprintV2,
  };
}

function assertExactFingerprintClaims(manifest, {
  requireStep11CertificationMaterial = false,
} = {}) {
  const computedEnvironmentDelta =
    computeEnvironmentDeltaFingerprintV2(manifest);
  requireEqual(
    requireResolved(manifest.release.environmentDeltaFingerprintV2, HEX64,
      "ENVIRONMENT_DELTA_FINGERPRINT_REQUIRED",
      "release.environmentDeltaFingerprintV2"),
    computedEnvironmentDelta,
    "ENVIRONMENT_DELTA_FINGERPRINT_MISMATCH",
    "release.environmentDeltaFingerprintV2",
  );
  const certificationClaim = requireResolved(
    manifest.release.certificationFingerprint,
    HEX64,
    "CERTIFICATION_FINGERPRINT_REQUIRED",
    "release.certificationFingerprint",
  );
  if (requireStep11CertificationMaterial) {
    requireEqual(
      certificationClaim,
      computeCertificationFingerprint(manifest),
      "CERTIFICATION_FINGERPRINT_MISMATCH",
      "release.certificationFingerprint",
    );
  }
  requireEqual(
    requireResolved(manifest.release.executionBundleFingerprintV2, HEX64,
      "EXECUTION_BUNDLE_FINGERPRINT_REQUIRED",
      "release.executionBundleFingerprintV2"),
    computeExecutionBundleMaterialFingerprint(manifest),
    "EXECUTION_BUNDLE_FINGERPRINT_MISMATCH",
    "release.executionBundleFingerprintV2",
  );
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
      "operator.mjs waf-payload --manifest <path> --operation <name>",
      "operator.mjs fingerprint --manifest <path>",
      "operator.mjs operations",
      "operator.mjs waf-operations",
    ],
    operations: Object.keys(OPERATIONS),
    wafCriticalEpochOperations: Object.keys(WAF_CRITICAL_EPOCH_OPERATIONS),
  };
}

export function main() {
  const command = process.argv[2];
  if (!command || command === "help" || command === "--help") {
    print(usage());
    return;
  }
  if (command === "operations") {
    print({
      operations: OPERATIONS,
      wafCriticalEpochOperations: WAF_CRITICAL_EPOCH_OPERATIONS,
    });
    return;
  }
  if (command === "waf-operations") {
    print({ wafCriticalEpochOperations: WAF_CRITICAL_EPOCH_OPERATIONS });
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
    print(computeFingerprintSet(manifest));
    return;
  }
  if (command === "payload") {
    const operation = argument("--operation");
    if (!operation) refuse("OPERATION_REQUIRED", "--operation <name> is required.");
    print(buildOperationEnvelope(manifest, operation));
    return;
  }
  if (command === "waf-payload") {
    const operation = argument("--operation");
    if (!operation) refuse("OPERATION_REQUIRED", "--operation <name> is required.");
    print(buildWafCriticalEpochEnvelope(manifest, operation));
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
