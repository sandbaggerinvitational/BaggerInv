import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FIXED,
  OperatorRefusalError,
  buildOperationEnvelope,
  computeExecutionBundleMaterialFingerprint,
  evaluateReadiness,
  productionOriginInventoryBinding,
  validateManifest,
} from "./operator.mjs";

const template = JSON.parse(readFileSync(
  new URL("./manifest.template.json", import.meta.url),
  "utf8",
));

const PROVIDER_ROUTE_INPUT_KEYS = new Set([
  "action", "confirmation", "currentVerificationId", "evidenceRequestId",
  "expectedBaselineFingerprint", "expectedBranch",
  "expectedCanonicalValueFingerprint", "expectedCommitSha",
  "expectedDirectorPlayerId", "expectedWorkbookId", "fenceId",
  "installRequestId", "operationRequestId", "ownerFreezeConfirmation",
  "ownerFreezeTtlSeconds", "ownerOverrideOperationallyFrozen",
  "priorEvidenceId", "quiesceEvidenceId", "quiescePurpose",
  "challengeRequestId", "providerAttestationStage", "providerChallengeId",
  "providerAttestationConsumeRequestId", "providerAttestation",
  "rehearsalRunId", "rehearsalRequestId", "routingRule",
]);

const U = Object.freeze({
  authority: "11111111-1111-4111-8111-111111111111",
  admission: "22222222-2222-4222-8222-222222222222",
  evidence: "33333333-3333-4333-8333-333333333333",
  closure: "44444444-4444-4444-8444-444444444444",
  epoch: "55555555-5555-4555-8555-555555555555",
  quiesceEvidence: "66666666-6666-4666-8666-666666666666",
  quiesceRequest: "77777777-7777-4777-8777-777777777777",
  providerFence: "88888888-8888-4888-8888-888888888888",
  providerFenceInstall: "99999999-9999-4999-8999-999999999999",
  providerFenceVerification: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  providerFenceRemoval: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
  refreshedQuiesceEvidence: "cccccccc-dddd-4eee-8fff-000000000000",
  beginChallengeRequest: "dddddddd-eeee-4fff-8aaa-111111111111",
  beginChallenge: "eeeeeeee-ffff-4111-8bbb-222222222222",
  beginConsume: "ffffffff-1111-4222-8ccc-333333333333",
  beginAttestation: "11111111-2222-4333-8ddd-444444444444",
  finalizeChallengeRequest: "22222222-3333-4444-8eee-555555555555",
  finalizeChallenge: "33333333-4444-4555-8fff-666666666666",
  finalizeConsume: "44444444-5555-4666-8aaa-777777777777",
  finalizeAttestation: "55555555-6666-4777-8bbb-888888888888",
});

const LIVE_ORIGIN_COUNT = FIXED.minimumLiveOriginInventoryCount;
const PROBE_ORIGIN_COUNT = LIVE_ORIGIN_COUNT +
  FIXED.quiesceFixedAliasOriginCount + FIXED.quiesceCandidateAliasOriginCount;
const PROBE_RECORD_COUNT = PROBE_ORIGIN_COUNT * FIXED.quiesceProbeVectorCount;

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function certifiedManifest() {
  const manifest = copy(template);
  manifest.execution.step12OwnerAuthorizationRecorded = true;
  manifest.resources.vercelTeamId = "team_SandbaggerInvitational01";
  Object.assign(manifest.release, {
    candidateSha: "a".repeat(40),
    frozenSha: "a".repeat(40),
    deploymentId: "dpl_AbCdEf123456",
    certificationFingerprint: "b".repeat(64),
    environmentDeltaFingerprintV2: "c".repeat(64),
    providerAttestationSignerKeyFingerprint: "f".repeat(64),
    providerAttestationEnvironmentScopeFingerprint: "0".repeat(64),
    credentialConfinementSchema: FIXED.credentialConfinementSchema,
    credentialConfinementRecordCount: FIXED.credentialConfinementRecordCount,
    credentialConfinementRecordsFingerprint:
      FIXED.credentialConfinementRecordsFingerprint,
    credentialConfinementEvidenceFingerprint:
      FIXED.credentialConfinementEvidenceFingerprint,
    executionBundleFingerprintV2: "d".repeat(64),
    migrationSha256: "e".repeat(64),
  });
  Object.assign(manifest.certification, {
    migrationInstalledDormant: true,
    focusedTestsPassed: true,
    criticalTestsPassed: true,
    productionBuildPassed: true,
    nonAuthoritativeCandidateReady: true,
    previewIsolationPassed: true,
    oldHostEnforcementPassed: true,
    dedicatedCredentialConfinementPassed: true,
    unexplainedConcurrencyWindows: 0,
    clientSecretExposures: 0,
  });
  Object.assign(manifest.providerFenceRehearsal, {
    status: "PASSED_RESTORED",
    quiesceEvidenceId: U.quiesceEvidence,
    capturedAt: "2026-08-26T11:00:00Z",
    restoredAt: "2026-08-26T11:01:00Z",
    exactOldHostProviderFence: true,
    allProductionCapableOriginsControlled: true,
    legacyDeploymentsFenced: true,
    googleCredentialsSeparated: true,
    nonOwnerManualGoogleScoringFenced: true,
    ownerOverrideOperationallyFrozen: true,
    dedicatedWriterRetainedAccess: true,
    legacyWriterDenied: true,
    noDataValueWrites: true,
    providerBaselineRestored: true,
    previewResourcesAbsent: true,
    protectedRangeCountBefore: 0,
    protectedRangeCountAfter: 0,
    baselineFingerprint: "0".repeat(64),
    fencedFingerprint: "1".repeat(64),
    restoredFingerprint: "0".repeat(64),
    deploymentScopeFingerprint: "2".repeat(64),
    googleCredentialScopeFingerprint: "3".repeat(64),
    writerCoverageFingerprint: "4".repeat(64),
    originInventoryCount: FIXED.originInventoryCount,
    originInventoryFingerprint: FIXED.originInventoryFingerprint,
    liveOriginInventoryCount: LIVE_ORIGIN_COUNT,
    liveOriginInventoryFingerprint: "6".repeat(64),
    probeOriginCount: PROBE_ORIGIN_COUNT,
    probeVectorCount: FIXED.quiesceProbeVectorCount,
    probeRecordCount: PROBE_RECORD_COUNT,
    probeScopeFingerprint: "5".repeat(64),
  });
  Object.assign(manifest.providerFenceProof, {
    status: "VERIFIED",
    evidenceId: U.evidence,
    quiesceEvidenceId: U.quiesceEvidence,
    providerFenceId: U.providerFence,
    providerFenceVerificationId: U.providerFenceVerification,
    capturedAt: "2026-08-26T12:00:00Z",
    expiresAt: "2026-08-26T12:30:00Z",
    exactOldHostProviderFence: true,
    allProductionCapableOriginsControlled: true,
    legacyDeploymentsFenced: true,
    legacyGoogleCredentialsFenced: true,
    nonOwnerManualGoogleScoringFenced: true,
    ownerOverrideOperationallyFrozen: true,
    previewResourcesAbsent: true,
    providerEvidenceFingerprint: "1".repeat(64),
    deploymentScopeFingerprint: "3".repeat(64),
    googleCredentialScopeFingerprint: "3".repeat(64),
    writerCoverageFingerprint: "4".repeat(64),
    legacyLeaseSetFingerprint: "5".repeat(64),
    legacyLeaseCount: 0,
    boundImmutableScope: {
      providerEvidenceFingerprint: "1".repeat(64),
      deploymentScopeFingerprint: "3".repeat(64),
      googleCredentialScopeFingerprint: "3".repeat(64),
      writerCoverageFingerprint: "4".repeat(64),
    },
  });
  Object.assign(manifest.providerQuiesceEvidence, {
    status: "VERIFIED",
    evidenceId: U.quiesceEvidence,
    evidenceRequestId: U.quiesceRequest,
    priorEvidenceId: null,
    routingRule: {
      projectId: FIXED.vercelProjectId,
      ruleId: "rule-production-writer-quiesce",
      revision: "revision-17",
      scope: FIXED.quiesceScope,
      projectWide: true,
      action: "DENY",
      requestPathOperator: "DOES_NOT_EQUAL",
      requestPath: FIXED.providerControlEndpoint,
      methodOperator: "IS_NOT_ANY_OF",
      methods: ["GET", "HEAD", "OPTIONS"],
    },
    candidateDeploymentId: manifest.release.deploymentId,
    candidateDeploymentCommit: manifest.release.frozenSha,
    candidateAliasOrigin:
      "https://bagger-inv-git-feature-step116-sandbagger-invitational.vercel.app",
    candidateImmutableOrigin:
      "https://bagger-step116candidate-sandbagger-invitational.vercel.app",
    liveOriginInventoryCount: LIVE_ORIGIN_COUNT,
    liveOriginInventoryFingerprint: "6".repeat(64),
    probeOriginCount: PROBE_ORIGIN_COUNT,
    probeVectorCount: FIXED.quiesceProbeVectorCount,
    probeRecordCount: PROBE_RECORD_COUNT,
    firstProbeFingerprint: "1".repeat(64),
    secondProbeFingerprint: "2".repeat(64),
    probeScopeFingerprint: "5".repeat(64),
    deploymentScopeFingerprint: "3".repeat(64),
    credentialGenerationFingerprint: "4".repeat(64),
    ownerOverrideOperationallyFrozen: true,
    ownerFreezeConfirmation: FIXED.ownerFreezeConfirmation,
    ownerFreezeTtlSeconds: 1800,
    ownerAcknowledgedAt: "2026-08-26T10:00:00Z",
    ownerFreezeExpiresAt: "2026-08-26T10:30:00Z",
    drainStartedAt: "2026-08-26T10:01:00Z",
    drainCompletedAt: "2026-08-26T10:06:00Z",
    unresolvedRequestLogCount: 0,
    unresolvedGoogleWriteCount: 0,
    allOriginsEdgeDenied: true,
    unresolvedProbeCount: 0,
    verifiedAt: "2026-08-26T10:06:01Z",
    expiresAt: "2026-08-26T10:20:00Z",
  });
  Object.assign(manifest.persistentProviderFence, {
    status: "INSTALLED",
    fenceId: U.providerFence,
    installRequestId: U.providerFenceInstall,
    currentVerificationId: U.providerFenceVerification,
    quiesceEvidenceId: U.quiesceEvidence,
    candidateDeploymentId: manifest.release.deploymentId,
    candidateDeploymentCommit: manifest.release.frozenSha,
    expectedBaselineFingerprint: "5".repeat(64),
    expectedCanonicalValueFingerprint: "6".repeat(64),
    protectionCount: 17,
    protectionSetFingerprint: "7".repeat(64),
    providerFingerprint: "8".repeat(64),
    aclFingerprint: "9".repeat(64),
    canonicalValueFingerprint: "a".repeat(64),
    formulaFingerprint: "b".repeat(64),
    permissionInventoryFingerprint: "c".repeat(64),
    capturedAt: "2026-08-26T10:07:00Z",
    expiresAt: "2026-08-26T10:25:00Z",
    removalRequestId: null,
    removalAuthorizedAt: null,
  });
  Object.assign(manifest.state, {
    admissionRevision: 7,
    admissionGeneration: U.admission,
    authorityGeneration: U.authority,
  });
  Object.assign(manifest.evidence, {
    startSourceFingerprint: "6".repeat(64),
    finalGoogleFingerprint: "7".repeat(64),
    reconciliationFingerprint: "8".repeat(64),
    closureBoundaryFingerprint: "9".repeat(64),
    supabaseShadowFingerprint: "a".repeat(64),
    boundaryCapturedAt: "2026-08-26T12:05:00Z",
    stableReadbackCount: 2,
    rollbackStartSourceFingerprint: "b".repeat(64),
    rollbackFinalCanonicalFingerprint: "c".repeat(64),
    rollbackReconciliationFingerprint: "d".repeat(64),
    rollbackClosureBoundaryFingerprint: "e".repeat(64),
    rollbackBoundaryCapturedAt: "2026-08-26T12:10:00Z",
    rollbackStableReadbackCount: 2,
  });
  let index = 16;
  for (const key of Object.keys(manifest.stableRequestIds)) {
    const suffix = index.toString(16).padStart(12, "0");
    manifest.stableRequestIds[key] = `aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`;
    index += 1;
  }
  const signedAttestation = (stage, challengeId, attestationId, requestOperation) => ({
    schemaVersion: "bagger-vercel-provider-attestation-envelope-v1",
    algorithm: "Ed25519",
    signerKeyVersion: "STEP11_6_VERCEL_ATTESTER_V1",
    signerKeyFingerprint: manifest.release.providerAttestationSignerKeyFingerprint,
    attestation: {
      attestationId,
      challengeId,
      requestId: manifest.stableRequestIds[requestOperation],
      stage,
      purpose: "CUTOVER",
      vercelProjectId: FIXED.vercelProjectId,
      vercelTeamId: manifest.resources.vercelTeamId,
      candidateDeploymentId: manifest.release.deploymentId,
      candidateDeploymentCommit: manifest.release.frozenSha,
      candidateDeploymentTarget: "PRODUCTION",
    },
    attestationFingerprint: stage === "BEGIN" ? "1".repeat(64) : "2".repeat(64),
    signature: "c2lnbmF0dXJl",
  });
  Object.assign(manifest.providerAttestationChallenges.begin, {
    challengeRequestId: U.beginChallengeRequest,
    challengeId: U.beginChallenge,
    consumeRequestId: U.beginConsume,
    signedAttestation: signedAttestation(
      "BEGIN", U.beginChallenge, U.beginAttestation, "begin-provider-quiesce",
    ),
  });
  Object.assign(manifest.providerAttestationChallenges.finalize, {
    challengeRequestId: U.finalizeChallengeRequest,
    challengeId: U.finalizeChallenge,
    consumeRequestId: U.finalizeConsume,
    signedAttestation: signedAttestation(
      "FINALIZE", U.finalizeChallenge, U.finalizeAttestation,
      "finalize-provider-quiesce",
    ),
  });
  manifest.persistentProviderFence.installRequestId =
    manifest.stableRequestIds["install-persistent-provider-fence"];
  return manifest;
}

function closingManifest() {
  const manifest = certifiedManifest();
  Object.assign(manifest.state, {
    cutoverPhase: "SCORING_PREPARE",
    activationState: "GOOGLE_LEASE_ARMED",
    admissionProtocolEnforced: true,
    admissionState: "CLOSING",
    admissionDeploymentId: manifest.release.deploymentId,
    activeClosureId: U.closure,
    activeClosureKind: "LEGACY_ADMISSION",
    activeClosureStatus: "CLOSING",
    externalFenceEvidenceId: U.evidence,
  });
  return manifest;
}

function cutoverFenceWindowManifest() {
  const manifest = certifiedManifest();
  Object.assign(manifest.state, {
    cutoverPhase: "CURRENT_READS",
    activationState: "GOOGLE_LEASE_ARMED",
    participantIdentityAuthority: "SUPABASE",
    admissionState: "OPEN",
    gateExecutionState: "OPEN",
    admissionProtocolEnforced: true,
    admissionDeploymentId: manifest.release.deploymentId,
    activeClosureId: null,
    activeClosureKind: null,
    activeClosureStatus: null,
  });
  return manifest;
}

function closedManifest() {
  const manifest = closingManifest();
  Object.assign(manifest.state, {
    admissionState: "CLOSED",
    activeClosureStatus: "CLOSED",
    finalGoogleAuthoritySnapshotSafe: true,
    supabaseAuthorityPrepareSafe: true,
    supabaseShadowParityExact: true,
  });
  return manifest;
}

function supabaseCommittedManifest() {
  const manifest = closedManifest();
  Object.assign(manifest.state, {
    activationState: "SCORING_COMMITTED",
    scoringAuthority: "SUPABASE",
    gateExecutionState: "OPEN",
    scoringIngressEnabled: true,
    activeClosureKind: "LEGACY_ADMISSION",
    activeClosureStatus: "CONSUMED",
    firstSupabaseCanonicalWritePossible: true,
    firstSupabaseCanonicalWriteObserved: false,
    rollbackClassification: "POST-COMMIT / NO WRITE",
  });
  return manifest;
}

function supabaseIngressPausedManifest() {
  const manifest = supabaseCommittedManifest();
  Object.assign(manifest.state, {
    gateExecutionState: "PAUSED",
    activeClosureKind: "SUPABASE_INGRESS",
    activeClosureStatus: "CLOSING",
  });
  return manifest;
}

function supabaseIngressClosedManifest() {
  const manifest = supabaseIngressPausedManifest();
  manifest.state.activeClosureStatus = "CLOSED";
  return manifest;
}

function expectRefusal(code, callback) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof OperatorRefusalError);
    assert.equal(error.code, code);
    return true;
  });
}

function assertProviderRoutePayload(envelope) {
  assert.ok(Object.keys(envelope.payload)
    .every((key) => PROVIDER_ROUTE_INPUT_KEYS.has(key)));
}

test("template is structurally valid, inert, and not execution-ready", () => {
  assert.equal(validateManifest(template).ok, true);
  const readiness = evaluateReadiness(template);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockers.some((value) => value.includes("candidateSha")));
  assert.ok(readiness.blockers.some((value) => value.includes("probeScopeFingerprint")));
});

test("claimed readiness is ignored; exact evidence derives readiness", () => {
  const manifest = certifiedManifest();
  manifest.executionReadiness.ready = false;
  assert.deepEqual(evaluateReadiness(manifest), { ready: true, blockers: [] });
  manifest.executionReadiness.ready = true;
  manifest.providerFenceRehearsal.exactOldHostProviderFence = false;
  const result = evaluateReadiness(manifest);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("providerFenceRehearsal.exactOldHostProviderFence is not true"));
});

test("manifest rejects a caller-supplied origin subset or arbitrary matrix fingerprint", () => {
  const manifest = certifiedManifest();
  manifest.providerFenceRehearsal.originMatrix = [{
    origin: "https://baggerinv.com",
  }];
  manifest.providerFenceRehearsal.originMatrixFingerprint = "f".repeat(64);
  expectRefusal("CALLER_ORIGIN_MATRIX_FORBIDDEN", () => validateManifest(manifest));
});

test("readiness requires restored rehearsal evidence but not an active Step 12 fence", () => {
  const manifest = certifiedManifest();
  Object.assign(manifest.providerFenceProof, {
    status: "MISSING",
    evidenceId: "__PROVIDER_FENCE_EVIDENCE_UUID__",
    exactOldHostProviderFence: false,
    allProductionCapableOriginsControlled: false,
    legacyDeploymentsFenced: false,
    legacyGoogleCredentialsFenced: false,
    nonOwnerManualGoogleScoringFenced: false,
    ownerOverrideOperationallyFrozen: false,
    previewResourcesAbsent: false,
    providerEvidenceFingerprint: "__SHA256__",
    deploymentScopeFingerprint: "__SHA256__",
    googleCredentialScopeFingerprint: "__SHA256__",
    writerCoverageFingerprint: "__SHA256__",
    legacyLeaseSetFingerprint: "__SHA256__",
  });
  assert.deepEqual(evaluateReadiness(manifest), { ready: true, blockers: [] });

  manifest.providerFenceRehearsal.protectedRangeCountAfter = 1;
  assert.equal(evaluateReadiness(manifest).ready, false);
});

test("manifest refuses any executable/network/provider/credential capability", () => {
  for (const key of ["enabled", "networkAllowed", "providerSdkAllowed", "credentialReaderAllowed", "sqlExecutionAllowed"]) {
    const manifest = certifiedManifest();
    manifest.execution[key] = true;
    expectRefusal("INERT_EXECUTION_REQUIRED", () => validateManifest(manifest));
  }
});

test("Preview resources and secret-bearing operation input fail closed", () => {
  const preview = certifiedManifest();
  preview.operationInputs["stage-release"].source_matrix_fingerprint = FIXED.previewProjectRef;
  expectRefusal("PREVIEW_RESOURCE_FORBIDDEN", () => validateManifest(preview));

  const secret = certifiedManifest();
  secret.operationInputs["stage-release"].private_key = "not-even-a-real-key";
  expectRefusal("SECRET_INPUT_FORBIDDEN", () => validateManifest(secret));
});

test("DORMANT read-only inspection is exact-scope and does not need release placeholders", () => {
  const envelope = buildOperationEnvelope(template, "inspect");
  assert.equal(envelope.executable, false);
  assert.equal(envelope.rpc, "inspect_production_cutover_authority");
  assert.equal(envelope.payload.project_ref, FIXED.projectRef);
  assert.equal(envelope.payload.source_workbook_id, FIXED.sourceWorkbookId);
  assert.equal(envelope.stableRequestId, null);
  assert.match(envelope.sqlEnvelope, /^select public\.inspect_production_cutover_authority\(/);
});

test("retained origin inventory binding is the exact complete 1,140-record v2 artifact", () => {
  assert.deepEqual(productionOriginInventoryBinding(), {
    artifact: FIXED.originInventoryArtifact,
    schemaVersion: "step11-6-production-origin-inventory-v2",
    vercelProjectId: FIXED.vercelProjectId,
    capturedAt: "2026-08-26T15:53:06.445Z",
    recordCount: 1140,
    recordsFingerprint: "533178a28a5458c5f2f727b77af3024de4cc0402c49e90dcd763b950d26fb4c6",
    mainProductionCount: 458,
    featurePreviewCount: 682,
    nullShaCount: 1,
    requiredDeployments: {
      priorLive: "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
      frozenStep11: "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
    },
    paginationComplete: true,
    minimumLiveOriginInventoryCount: 1141,
    fixedAliasOriginCount: 4,
    candidateAliasOriginCount: 1,
    probeVectorCount: 9,
  });
});

test("provider challenge payloads bind DB-issued scope before local signing", () => {
  const manifest = cutoverFenceWindowManifest();
  manifest.providerQuiesceEvidence.status = "MISSING";
  const issue = buildOperationEnvelope(
    manifest, "issue-begin-provider-attestation-challenge",
  );
  assert.equal(issue.payload.action, "issue-provider-attestation-challenge");
  assert.equal(issue.payload.operationRequestId,
    manifest.stableRequestIds["begin-provider-quiesce"]);
  assert.equal(issue.payload.challengeRequestId, U.beginChallengeRequest);
  assert.equal(issue.payload.evidenceRequestId, U.quiesceRequest);
  assert.equal(issue.payload.providerAttestationStage, "BEGIN");
  assert.deepEqual(issue.receiptRpcs,
    ["issue_production_vercel_provider_attestation_challenge"]);

  const finalizeManifest = cutoverFenceWindowManifest();
  finalizeManifest.providerQuiesceEvidence.status = "DRAINING";
  const inspect = buildOperationEnvelope(
    finalizeManifest, "inspect-finalize-provider-attestation-challenge",
  );
  assert.equal(inspect.payload.action, "inspect-provider-attestation-challenge");
  assert.equal(inspect.payload.operationRequestId,
    finalizeManifest.stableRequestIds["finalize-provider-quiesce"]);
  assert.equal(inspect.payload.providerChallengeId, U.finalizeChallenge);
  assert.equal(inspect.payload.providerAttestationStage, "FINALIZE");
});

test("provider quiesce begin is deterministic, owner-authorized, and inventory-free", () => {
  const manifest = cutoverFenceWindowManifest();
  Object.assign(manifest.providerQuiesceEvidence, {
    status: "MISSING",
    evidenceId: "__QUIESCE_EVIDENCE_UUID__",
    priorEvidenceId: null,
    ownerAcknowledgedAt: "__RFC3339_OWNER_ACKNOWLEDGED_TIMESTAMP__",
    ownerFreezeExpiresAt: "__RFC3339_OWNER_FREEZE_EXPIRY_TIMESTAMP__",
    drainStartedAt: "__RFC3339_DRAIN_STARTED_TIMESTAMP__",
    drainCompletedAt: "__RFC3339_DRAIN_COMPLETED_TIMESTAMP__",
  });
  Object.assign(manifest.persistentProviderFence, {
    status: "MISSING",
    fenceId: "__PERSISTENT_PROVIDER_FENCE_UUID__",
    currentVerificationId: "__PERSISTENT_PROVIDER_FENCE_VERIFICATION_UUID__",
    protectionCount: 0,
  });
  const first = buildOperationEnvelope(manifest, "begin-provider-quiesce");
  const retry = buildOperationEnvelope(manifest, "begin-provider-quiesce");
  assertProviderRoutePayload(first);
  assert.deepEqual(first, retry);
  assert.equal(first.endpoint, FIXED.providerControlEndpoint);
  assert.equal(first.httpMethod, "POST");
  assert.equal(first.sqlEnvelope, null);
  assert.deepEqual(first.receiptRpcs,
    ["begin_production_vercel_writer_quiesce_evidence"]);
  assert.equal(first.payload.action, "begin-provider-quiesce");
  assert.equal(first.payload.quiescePurpose, "CUTOVER");
  assert.equal(first.payload.evidenceRequestId, U.quiesceRequest);
  assert.notEqual(first.payload.evidenceRequestId, first.stableRequestId);
  assert.equal(first.payload.priorEvidenceId, null);
  assert.equal(first.payload.ownerFreezeTtlSeconds, 1800);
  assert.equal(first.payload.ownerAcknowledgedAt, undefined);
  assert.equal(first.payload.ownerFreezeExpiresAt, undefined);
  assert.equal(first.payload.originInventory, undefined);
  assert.equal(first.payload.originInventoryFingerprint, undefined);
  assert.equal(first.originInventoryBinding.recordCount, 1140);
  assert.equal(first.payload.providerChallengeId, U.beginChallenge);
  assert.equal(first.payload.providerAttestationConsumeRequestId, U.beginConsume);
  assert.equal(first.payload.providerAttestation.attestation.stage, "BEGIN");

  const dormant = copy(manifest);
  Object.assign(dormant.state, {
    cutoverPhase: "DORMANT",
    activationState: "DORMANT",
    participantIdentityAuthority: "PASSPORT",
    gateExecutionState: "PAUSED",
    admissionProtocolEnforced: false,
    admissionDeploymentId: null,
  });
  expectRefusal("PHASE_SKIP_FORBIDDEN", () =>
    buildOperationEnvelope(dormant, "begin-provider-quiesce"));

  manifest.execution.step12OwnerAuthorizationRecorded = false;
  expectRefusal("STEP12_OWNER_AUTHORIZATION_REQUIRED", () =>
    buildOperationEnvelope(manifest, "begin-provider-quiesce"));
});

test("quiesce finalize requires structured IDs, a 300-second drain, and zero unresolved writes", () => {
  const manifest = cutoverFenceWindowManifest();
  manifest.providerQuiesceEvidence.status = "DRAINING";
  const envelope = buildOperationEnvelope(manifest, "finalize-provider-quiesce");
  assertProviderRoutePayload(envelope);
  assert.equal(envelope.payload.quiesceEvidenceId, U.quiesceEvidence);
  assert.equal(envelope.payload.evidenceRequestId,
    U.quiesceRequest);
  assert.deepEqual(envelope.receiptRpcs,
    ["finalize_production_vercel_writer_quiesce_evidence"]);
  assert.equal(envelope.payload.unresolvedRequestLogCount, undefined);
  assert.equal(envelope.payload.unresolvedGoogleWriteCount, undefined);

  manifest.providerQuiesceEvidence.drainCompletedAt = "2026-08-26T10:05:59Z";
  expectRefusal("PROVIDER_QUIESCE_DRAIN_TOO_SHORT", () =>
    buildOperationEnvelope(manifest, "finalize-provider-quiesce"));
  manifest.providerQuiesceEvidence.drainCompletedAt = "2026-08-26T10:06:00Z";
  manifest.providerQuiesceEvidence.unresolvedGoogleWriteCount = 1;
  expectRefusal("PROVIDER_QUIESCE_UNRESOLVED_WRITES", () =>
    buildOperationEnvelope(manifest, "finalize-provider-quiesce"));
});

test("provider quiesce inspection is read-only and still binds both durable IDs", () => {
  const manifest = certifiedManifest();
  manifest.execution.step12OwnerAuthorizationRecorded = false;
  const envelope = buildOperationEnvelope(manifest, "inspect-provider-quiesce");
  assertProviderRoutePayload(envelope);
  assert.equal(envelope.kind, "provider-read-only-payload");
  assert.equal(envelope.payload.evidenceRequestId,
    manifest.providerQuiesceEvidence.evidenceRequestId);
  assert.equal(envelope.payload.quiesceEvidenceId, U.quiesceEvidence);
  assert.deepEqual(envelope.receiptRpcs,
    ["inspect_production_vercel_writer_quiesce_evidence"]);
});

test("persistent provider-fence install consumes verified quiesce and records both durable RPCs", () => {
  const manifest = cutoverFenceWindowManifest();
  manifest.persistentProviderFence.status = "MISSING";
  manifest.persistentProviderFence.protectionCount = 0;
  const envelope = buildOperationEnvelope(manifest,
    "install-persistent-provider-fence");
  assertProviderRoutePayload(envelope);
  assert.equal(envelope.payload.installRequestId,
    manifest.stableRequestIds["install-persistent-provider-fence"]);
  assert.equal(envelope.payload.quiesceEvidenceId, U.quiesceEvidence);
  assert.equal(envelope.payload.confirmation, FIXED.providerFenceDescription);
  assert.deepEqual(envelope.receiptRpcs, [
    "begin_production_google_writer_provider_fence_install",
    "finish_production_google_writer_provider_fence_install",
  ]);
});

test("persistent provider-fence inspection supports baseline and active durable lookup", () => {
  const baseline = certifiedManifest();
  baseline.execution.step12OwnerAuthorizationRecorded = false;
  baseline.persistentProviderFence.status = "MISSING";
  baseline.persistentProviderFence.protectionCount = 0;
  const missing = buildOperationEnvelope(baseline,
    "inspect-persistent-provider-fence");
  assertProviderRoutePayload(missing);
  assert.equal(missing.payload.installRequestId, null);
  assert.equal(missing.payload.fenceId, null);
  assert.equal(missing.payload.currentVerificationId, null);

  const active = certifiedManifest();
  active.execution.step12OwnerAuthorizationRecorded = false;
  const installed = buildOperationEnvelope(active,
    "inspect-persistent-provider-fence");
  assertProviderRoutePayload(installed);
  assert.equal(installed.payload.fenceId, U.providerFence);
  assert.equal(installed.payload.currentVerificationId,
    U.providerFenceVerification);
  assert.deepEqual(installed.receiptRpcs,
    ["inspect_production_google_writer_provider_fence"]);
});

test("persistent provider-fence refresh requires a new verified quiesce record", () => {
  const manifest = certifiedManifest();
  expectRefusal("PERSISTENT_PROVIDER_FENCE_REFRESH_EVIDENCE_NOT_NEW", () =>
    buildOperationEnvelope(manifest, "refresh-persistent-provider-fence"));

  manifest.providerQuiesceEvidence.priorEvidenceId = U.quiesceEvidence;
  manifest.providerQuiesceEvidence.evidenceId = U.refreshedQuiesceEvidence;
  const envelope = buildOperationEnvelope(manifest,
    "refresh-persistent-provider-fence");
  assertProviderRoutePayload(envelope);
  assert.equal(envelope.payload.fenceId, U.providerFence);
  assert.equal(envelope.payload.quiesceEvidenceId, U.refreshedQuiesceEvidence);
  assert.deepEqual(envelope.receiptRpcs,
    ["refresh_production_google_writer_provider_fence"]);
});

test("persistent provider-fence removal is emitted only for authoritative safe rollback/abort state", () => {
  const manifest = certifiedManifest();
  manifest.persistentProviderFence.removalRequestId =
    manifest.stableRequestIds["remove-persistent-provider-fence"];
  const envelope = buildOperationEnvelope(manifest,
    "remove-persistent-provider-fence");
  assertProviderRoutePayload(envelope);
  assert.equal(envelope.payload.confirmation,
    FIXED.providerFenceRemoveConfirmation);
  assert.equal(envelope.payload.quiesceEvidenceId, U.quiesceEvidence);
  assert.deepEqual(envelope.receiptRpcs, [
    "authorize_production_google_writer_provider_fence_removal",
    "finish_production_google_writer_provider_fence_removal",
  ]);

  const staleQuiesce = certifiedManifest();
  staleQuiesce.persistentProviderFence.removalRequestId =
    staleQuiesce.stableRequestIds["remove-persistent-provider-fence"];
  staleQuiesce.persistentProviderFence.quiesceEvidenceId =
    "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  expectRefusal("PERSISTENT_PROVIDER_FENCE_QUIESCE_MISMATCH", () =>
    buildOperationEnvelope(staleQuiesce, "remove-persistent-provider-fence"));

  manifest.state.scoringAuthority = "SUPABASE";
  expectRefusal("PERSISTENT_PROVIDER_FENCE_REMOVAL_NOT_SAFE", () =>
    buildOperationEnvelope(manifest, "remove-persistent-provider-fence"));
});

test("stage payload binds exact frozen SHA and deterministic stable request identity", () => {
  const manifest = certifiedManifest();
  Object.assign(manifest.providerQuiesceEvidence, {
    status: "MISSING",
    evidenceId: "__QUIESCE_EVIDENCE_UUID__",
  });
  Object.assign(manifest.persistentProviderFence, {
    status: "MISSING",
    fenceId: "__PERSISTENT_PROVIDER_FENCE_UUID__",
    currentVerificationId: "__PERSISTENT_PROVIDER_FENCE_VERIFICATION_UUID__",
    protectionCount: 0,
  });
  const first = buildOperationEnvelope(manifest, "stage-release");
  const retry = buildOperationEnvelope(manifest, "stage-release");
  assert.deepEqual(first, retry);
  assert.equal(first.payload.deployment_commit, manifest.release.frozenSha);
  assert.equal(first.payload.vercel_project_id, FIXED.vercelProjectId);
  assert.equal(first.payload.quiesce_evidence_id, undefined);
  assert.equal(first.payload.provider_fence_id, undefined);
  assert.equal(first.payload.provider_fence_verification_id, undefined);
  assert.equal(first.stableRequestId, manifest.stableRequestIds["stage-release"]);
  assert.match(first.requestFingerprint, /^[0-9a-f]{64}$/);
});

test("phase skipping and stale optimistic revisions are refused", () => {
  const skipped = certifiedManifest();
  skipped.state.cutoverPhase = "READ_CUTOVER";
  expectRefusal("PHASE_SKIP_FORBIDDEN", () => buildOperationEnvelope(skipped, "stage-release"));

  const stale = closingManifest();
  stale.state.admissionRevision = "__STALE__";
  expectRefusal("STALE_ADMISSION_REVISION", () => buildOperationEnvelope(stale, "drain-legacy-admission"));
});

test("close requires barrier-aware state plus exact old-host provider fence", () => {
  const manifest = certifiedManifest();
  Object.assign(manifest.state, {
    cutoverPhase: "SCORING_PREPARE",
    activationState: "GOOGLE_LEASE_ARMED",
    admissionProtocolEnforced: true,
    admissionDeploymentId: manifest.release.deploymentId,
    gateExecutionState: "OPEN",
  });
  manifest.providerFenceProof.exactOldHostProviderFence = false;
  expectRefusal("PROVIDER_FENCE_REQUIRED", () => buildOperationEnvelope(manifest, "close-legacy-admission"));
  manifest.providerFenceProof.exactOldHostProviderFence = true;
  const envelope = buildOperationEnvelope(manifest, "close-legacy-admission");
  assert.equal(envelope.payload.expected_authority, "GOOGLE");
  assert.equal(envelope.payload.external_fence_evidence_id, U.evidence);
  assert.equal(envelope.payload.quiesce_evidence_id, U.quiesceEvidence);
  assert.equal(envelope.payload.provider_fence_id, U.providerFence);
  assert.equal(envelope.payload.provider_fence_verification_id,
    U.providerFenceVerification);
  assert.match(envelope.sqlEnvelope, /close_production_scoring_admission/);
});

test("provider-fence refresh preserves immutable scope and advances only bound evidence", () => {
  const manifest = closingManifest();
  const envelope = buildOperationEnvelope(manifest, "refresh-provider-fence");
  assert.equal(envelope.rpc, "refresh_production_scoring_external_fence_evidence");
  assert.equal(envelope.payload.prior_external_fence_evidence_id, U.evidence);
  assert.equal(envelope.payload.closure_id, U.closure);
  assert.equal(envelope.payload.provider_evidence_fingerprint,
    manifest.providerFenceProof.boundImmutableScope.providerEvidenceFingerprint);
  assert.equal(envelope.payload.quiesce_evidence_id, U.quiesceEvidence);
  assert.equal(envelope.payload.provider_fence_id, U.providerFence);
  assert.equal(envelope.payload.provider_fence_verification_id,
    U.providerFenceVerification);

  manifest.providerFenceProof.boundImmutableScope.writerCoverageFingerprint = "f".repeat(64);
  expectRefusal("PROVIDER_FENCE_REFRESH_SCOPE_DRIFT", () =>
    buildOperationEnvelope(manifest, "refresh-provider-fence"));
});

test("drain can inspect blockers, but fingerprint/finalize refuse potential writers", () => {
  const manifest = closingManifest();
  manifest.state.activeLegacyWriters = 1;
  assert.equal(buildOperationEnvelope(manifest, "drain-legacy-admission").rpc,
    "drain_production_scoring_admission");
  expectRefusal("LEGACY_WRITERS_NOT_DRAINED", () =>
    buildOperationEnvelope(manifest, "capture-final-google-fingerprint"));
  expectRefusal("LEGACY_WRITERS_NOT_DRAINED", () =>
    buildOperationEnvelope(manifest, "finalize-legacy-closed"));
});

test("final Google evidence is separate from CLOSED finalization", () => {
  const manifest = closingManifest();
  const capture = buildOperationEnvelope(manifest, "capture-final-google-fingerprint");
  assert.equal(capture.kind, "evidence-payload");
  assert.equal(capture.sqlEnvelope, null);
  assert.equal(capture.payload.stable_readback_count, 2);

  const finalize = buildOperationEnvelope(manifest, "finalize-legacy-closed");
  assert.equal(finalize.payload.final_source_fingerprint, manifest.evidence.finalGoogleFingerprint);
  assert.equal(finalize.payload.lease_set_fingerprint, manifest.evidence.closureBoundaryFingerprint);
});

test("prepare requires CLOSED and all machine-checkable safety predicates", () => {
  const unsafe = closedManifest();
  unsafe.state.supabaseAuthorityPrepareSafe = false;
  expectRefusal("SUPABASE_PREPARE_UNSAFE", () => buildOperationEnvelope(unsafe, "prepare-authority"));

  const envelope = buildOperationEnvelope(closedManifest(), "prepare-authority");
  assert.equal(envelope.payload.epoch_type, "CUTOVER");
  assert.equal(envelope.payload.closure_id, U.closure);
  assert.equal(envelope.payload.quiesce_evidence_id, U.quiesceEvidence);
  assert.equal(envelope.payload.provider_fence_id, U.providerFence);
  assert.equal(envelope.payload.provider_fence_verification_id,
    U.providerFenceVerification);
  assert.match(envelope.sqlEnvelope, /prepare_production_authority_epoch/);
});

test("commit preserves possible versus observed and rejects pre-existing writes", () => {
  const manifest = closedManifest();
  Object.assign(manifest.state, {
    activationState: "CUTOVER_PREPARED",
    preparedEpochId: U.epoch,
    supabaseAuthorityCommitSafe: true,
  });
  const envelope = buildOperationEnvelope(manifest, "commit-authority");
  assert.equal(envelope.payload.epoch_id, U.epoch);
  assert.equal(envelope.payload.quiesce_evidence_id, U.quiesceEvidence);
  assert.equal(envelope.payload.provider_fence_id, U.providerFence);
  assert.equal(envelope.payload.provider_fence_verification_id,
    U.providerFenceVerification);
  assert.equal(manifest.state.firstSupabaseCanonicalWritePossible, false);
  assert.equal(manifest.state.firstSupabaseCanonicalWriteObserved, false);

  manifest.state.firstSupabaseCanonicalWriteObserved = true;
  expectRefusal("FIRST_WRITE_OBSERVED_MISMATCH", () => buildOperationEnvelope(manifest, "commit-authority"));
});

test("reopen is impossible under Supabase authority or while a prepared epoch exists", () => {
  const manifest = closedManifest();
  manifest.state.legacyGoogleReopenSafe = true;
  manifest.state.scoringAuthority = "SUPABASE";
  expectRefusal("REOPEN_AUTHORITY_UNSAFE", () => buildOperationEnvelope(manifest, "reopen-legacy-admission"));

  manifest.state.scoringAuthority = "GOOGLE";
  manifest.state.preparedEpochId = U.epoch;
  expectRefusal("PREPARED_EPOCH_BLOCKS_REOPEN", () => buildOperationEnvelope(manifest, "reopen-legacy-admission"));
});

test("precommit abort is available only after explicit reopen and read/identity rollback", () => {
  const manifest = certifiedManifest();
  Object.assign(manifest.state, {
    cutoverPhase: "STATIC_BACKEND",
    activationState: "GOOGLE_LEASE_ARMED",
    admissionProtocolEnforced: true,
    admissionDeploymentId: manifest.release.deploymentId,
    gateExecutionState: "OPEN",
  });
  const envelope = buildOperationEnvelope(manifest, "abort-precommit-release");
  assert.equal(envelope.payload.operation, "ABORT_PRODUCTION_PRECOMMIT_RELEASE");
  assert.match(envelope.sqlEnvelope, /abort_production_precommit_release/);

  manifest.state.admissionState = "CLOSED";
  manifest.state.activeClosureId = U.closure;
  expectRefusal("ROLLBACK_ORDER_INVALID", () => buildOperationEnvelope(manifest, "abort-precommit-release"));
});

test("Supabase rollback begins with an exact atomic ingress-pause closure", () => {
  const manifest = supabaseCommittedManifest();
  const envelope = buildOperationEnvelope(manifest, "pause-supabase-ingress");
  assert.equal(envelope.rpc, "close_production_scoring_admission");
  assert.equal(envelope.payload.expected_authority, "SUPABASE");
  assert.equal(envelope.payload.start_source_fingerprint,
    manifest.evidence.rollbackStartSourceFingerprint);
  assert.equal(manifest.state.scoringIngressEnabled, true,
    "the activation authority flag remains true before rollback commit");

  manifest.state.gateExecutionState = "PAUSED";
  expectRefusal("GATE_STATE_MISMATCH", () =>
    buildOperationEnvelope(manifest, "pause-supabase-ingress"));
});

test("Supabase ingress drain allows inspection but closure waits for every writer", () => {
  const manifest = supabaseIngressPausedManifest();
  manifest.state.activeLegacyWriters = 1;
  const drain = buildOperationEnvelope(manifest, "drain-supabase-ingress");
  assert.equal(drain.rpc, "drain_production_scoring_admission");
  assert.equal(drain.payload.closure_id, U.closure);
  expectRefusal("LEGACY_WRITERS_NOT_DRAINED", () =>
    buildOperationEnvelope(manifest, "finalize-supabase-ingress-closed"));

  manifest.state.activeLegacyWriters = 0;
  const finalize = buildOperationEnvelope(manifest, "finalize-supabase-ingress-closed");
  assert.equal(finalize.rpc, "finalize_production_scoring_admission");
  assert.equal(finalize.payload.final_source_fingerprint,
    manifest.evidence.rollbackFinalCanonicalFingerprint);
  assert.equal(finalize.payload.reconciliation_fingerprint,
    manifest.evidence.rollbackReconciliationFingerprint);
  assert.equal(manifest.state.scoringIngressEnabled, true,
    "activation scoringIngressEnabled is distinct from the PAUSED gate");
});

test("rollback prepare and commit require a CLOSED SUPABASE_INGRESS closure with gate PAUSED", () => {
  const open = supabaseCommittedManifest();
  expectRefusal("GATE_STATE_MISMATCH", () => buildOperationEnvelope(open, "prepare-rollback"));

  const closing = supabaseIngressPausedManifest();
  expectRefusal("CLOSURE_STATUS_MISMATCH", () =>
    buildOperationEnvelope(closing, "prepare-rollback"));

  const preparedInput = supabaseIngressClosedManifest();
  const prepare = buildOperationEnvelope(preparedInput, "prepare-rollback");
  assert.equal(prepare.rpc, "prepare_production_authority_epoch");
  assert.equal(prepare.payload.epoch_type, "ROLLBACK");

  Object.assign(preparedInput.state, {
    activationState: "ROLLBACK_PREPARED",
    preparedEpochId: U.epoch,
  });
  const commit = buildOperationEnvelope(preparedInput, "commit-rollback");
  assert.equal(commit.rpc, "commit_production_authority_epoch");
  assert.equal(commit.payload.epoch_id, U.epoch);

  preparedInput.state.activeClosureKind = "LEGACY_ADMISSION";
  expectRefusal("CLOSURE_KIND_MISMATCH", () =>
    buildOperationEnvelope(preparedInput, "commit-rollback"));
});

test("rollback closure finalization, prepare, and commit fail fast on durable queue backlog", () => {
  const finalizing = supabaseIngressPausedManifest();
  finalizing.state.unresolvedOutbox = 1;
  expectRefusal("DURABLE_QUEUE_NOT_DRAINED", () =>
    buildOperationEnvelope(finalizing, "finalize-supabase-ingress-closed"));

  const preparing = supabaseIngressClosedManifest();
  preparing.state.unresolvedArchive = 1;
  expectRefusal("DURABLE_QUEUE_NOT_DRAINED", () =>
    buildOperationEnvelope(preparing, "prepare-rollback"));

  const committing = supabaseIngressClosedManifest();
  Object.assign(committing.state, {
    activationState: "ROLLBACK_PREPARED",
    preparedEpochId: U.epoch,
    unresolvedOutbox: 1,
  });
  expectRefusal("DURABLE_QUEUE_NOT_DRAINED", () =>
    buildOperationEnvelope(committing, "commit-rollback"));
});

test("queue diagnostics are typed and rendered with closure kind/status", () => {
  const invalid = certifiedManifest();
  invalid.state.unresolvedArchive = "0";
  expectRefusal("STATE_INVALID", () => validateManifest(invalid));

  const manifest = supabaseIngressPausedManifest();
  const envelope = buildOperationEnvelope(manifest, "drain-supabase-ingress");
  assert.deepEqual({
    activeClosureKind: envelope.diagnosticStateGuard.activeClosureKind,
    activeClosureStatus: envelope.diagnosticStateGuard.activeClosureStatus,
    unresolvedOutbox: envelope.diagnosticStateGuard.unresolvedOutbox,
    unresolvedArchive: envelope.diagnosticStateGuard.unresolvedArchive,
  }, {
    activeClosureKind: "SUPABASE_INGRESS",
    activeClosureStatus: "CLOSING",
    unresolvedOutbox: 0,
    unresolvedArchive: 0,
  });
});

test("operationInputs can repeat computed authority bindings only when exactly equal", () => {
  const manifest = closedManifest();
  Object.assign(manifest.operationInputs["prepare-authority"], {
    closure_id: U.closure,
    expected_activation_revision: manifest.state.activationRevision,
    source_fingerprint: manifest.evidence.finalGoogleFingerprint,
    external_fence_evidence_id: U.evidence,
  });
  const envelope = buildOperationEnvelope(manifest, "prepare-authority");
  assert.equal(envelope.payload.closure_id, U.closure);

  manifest.operationInputs["prepare-authority"].closure_id =
    "66666666-6666-4666-8666-666666666666";
  expectRefusal("AUTHORITY_BINDING_OVERRIDE_FORBIDDEN", () =>
    buildOperationEnvelope(manifest, "prepare-authority"));

  manifest.operationInputs["prepare-authority"].closure_id = U.closure;
  manifest.operationInputs["prepare-authority"].expected_activation_revision += 1;
  expectRefusal("AUTHORITY_BINDING_OVERRIDE_FORBIDDEN", () =>
    buildOperationEnvelope(manifest, "prepare-authority"));
});

test("post-write rollback requires enumeration with zero lost, duplicate, and unresolved writes", () => {
  const manifest = supabaseIngressClosedManifest();
  Object.assign(manifest.state, {
    activationState: "SCORING_COMMITTED",
    scoringAuthority: "SUPABASE",
    scoringIngressEnabled: true,
    gateExecutionState: "PAUSED",
    activeClosureKind: "SUPABASE_INGRESS",
    firstSupabaseCanonicalWritePossible: true,
    firstSupabaseCanonicalWriteObserved: true,
    rollbackClassification: "POST-WRITE",
  });
  manifest.state.preparedEpochId = null;
  manifest.evidence.allSupabaseWindowWritesEnumerated = false;
  expectRefusal("POST_WRITE_RECONCILIATION_REQUIRED", () =>
    buildOperationEnvelope(manifest, "prepare-rollback"));

  manifest.evidence.allSupabaseWindowWritesEnumerated = true;
  manifest.evidence.rollbackUnresolvedWrites = 1;
  expectRefusal("POST_WRITE_RECONCILIATION_REQUIRED", () =>
    buildOperationEnvelope(manifest, "prepare-rollback"));

  manifest.evidence.rollbackUnresolvedWrites = 0;
  const envelope = buildOperationEnvelope(manifest, "prepare-rollback");
  assert.equal(envelope.payload.epoch_type, "ROLLBACK");
});

test("post-commit/no-write rollback has an independent classification", () => {
  const manifest = supabaseIngressClosedManifest();
  Object.assign(manifest.state, {
    activationState: "SCORING_COMMITTED",
    scoringAuthority: "SUPABASE",
    scoringIngressEnabled: true,
    gateExecutionState: "PAUSED",
    activeClosureKind: "SUPABASE_INGRESS",
    firstSupabaseCanonicalWritePossible: true,
    firstSupabaseCanonicalWriteObserved: false,
    rollbackClassification: "POST-COMMIT / NO WRITE",
  });
  assert.equal(buildOperationEnvelope(manifest, "prepare-rollback").payload.epoch_type, "ROLLBACK");
  manifest.state.rollbackClassification = "PRE-WRITE";
  expectRefusal("ROLLBACK_CLASSIFICATION_MISMATCH", () =>
    buildOperationEnvelope(manifest, "prepare-rollback"));
});

test("worker and Odds payloads cannot change canonical or Odds publication authority", () => {
  const manifest = closedManifest();
  Object.assign(manifest.state, {
    activationState: "SCORING_COMMITTED",
    scoringAuthority: "SUPABASE",
    scoringIngressEnabled: true,
    gateExecutionState: "OPEN",
    activeClosureKind: "LEGACY_ADMISSION",
    firstSupabaseCanonicalWritePossible: true,
  });
  Object.assign(manifest.operationInputs.workers, {
    worker_name: "SCORING_GOOGLE_OUTBOX",
    enabled: true,
    google_service_account_email: "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com",
  });
  const worker = buildOperationEnvelope(manifest, "workers");
  assert.equal(worker.payload.worker_name, "SCORING_GOOGLE_OUTBOX");

  Object.assign(manifest.operationInputs["odds-runtime"], {
    enabled: true,
    expected_runtime_enabled: false,
    expected_runtime_revision: 3,
    operation_mode: "CUTOVER",
    cutover_phase: "ODDS_WAR_ROOM",
    operation: "ENABLE_PRODUCTION_ODDS_RUNTIME",
  });
  const odds = buildOperationEnvelope(manifest, "odds-runtime");
  assert.equal(odds.payload.worker_name, "ODDS_CALCULATION");
  assert.equal(manifest.resources.oddsPublicationAuthority, "GOOGLE");
});

test("output is sanitized and executable material contains no Preview identifiers", () => {
  const envelope = buildOperationEnvelope(certifiedManifest(), "stage-release");
  const serialized = JSON.stringify(envelope);
  assert.equal(serialized.includes(FIXED.previewProjectRef), false);
  assert.equal(serialized.includes(FIXED.previewWorkbookId), false);
  assert.equal(serialized.includes("PRIVATE KEY"), false);
  assert.equal(envelope.networkCalls, 0);
  assert.equal(envelope.providerSdkCalls, 0);
  assert.equal(envelope.credentialReads, 0);
  assert.equal(envelope.sqlExecutions, 0);
});

test("execution bundle material fingerprint is deterministic and excludes claimed readiness", () => {
  const manifest = certifiedManifest();
  const first = computeExecutionBundleMaterialFingerprint(manifest);
  manifest.executionReadiness.ready = true;
  manifest.executionReadiness.note = "untrusted claim";
  const second = computeExecutionBundleMaterialFingerprint(manifest);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("operator implementation has no network, provider SDK, shell, or environment credential surface", () => {
  const source = readFileSync(new URL("./operator.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["']node:(?:http|https|net|tls|dns|child_process|worker_threads)["']/);
  assert.doesNotMatch(source, /@supabase|@vercel|googleapis|fetch\s*\(|process\.env/);
});
