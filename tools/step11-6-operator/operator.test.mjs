import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FIXED,
  OperatorRefusalError,
  buildOperationEnvelope,
  computeCertificationFingerprint,
  computeEnvironmentDeltaFingerprintV2,
  computeExecutionBundleMaterialFingerprint,
  computeFingerprintSet,
  evaluateReadiness,
  productionHistoricalSafeMethodWriterBinding,
  productionOriginInventoryBinding,
  validateManifest,
} from "./operator.mjs";

const templateSource = readFileSync(
  new URL("./manifest.template.json", import.meta.url),
  "utf8",
);
const template = JSON.parse(templateSource);

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
  "providerRetainedChallenge", "abandonRequestId",
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
  beginAbandon: "66666666-7777-4888-8ccc-999999999999",
  finalizeAbandon: "77777777-8888-4999-8ddd-aaaaaaaaaaaa",
});

const LIVE_ORIGIN_COUNT = FIXED.maximumLiveOriginInventoryCount;
const PROBE_ORIGIN_COUNT = LIVE_ORIGIN_COUNT +
  FIXED.quiesceFixedAliasOriginCount + FIXED.quiesceCandidateAliasOriginCount;
const PROBE_RECORD_COUNT = PROBE_ORIGIN_COUNT * FIXED.quiesceProbeVectorCount;

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function bindComputedFingerprints(manifest) {
  manifest.release.environmentDeltaFingerprintV2 =
    computeEnvironmentDeltaFingerprintV2(manifest);
  manifest.release.certificationFingerprint =
    computeCertificationFingerprint(manifest);
  manifest.release.executionBundleFingerprintV2 =
    computeExecutionBundleMaterialFingerprint(manifest);
  return manifest;
}

function bindCurrentExecutionFingerprint(manifest) {
  manifest.release.executionBundleFingerprintV2 =
    computeExecutionBundleMaterialFingerprint(manifest);
  return manifest;
}

function bindStagedProvenance(manifest) {
  Object.assign(manifest.state, {
    stagedRequestFingerprint: "1".repeat(64),
    stagedPayloadHash: "2".repeat(64),
    stagedCertificationFingerprint: manifest.release.certificationFingerprint,
    stagedEnvironmentDeltaFingerprintV2:
      manifest.release.environmentDeltaFingerprintV2,
  });
  return manifest;
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
    migrationSha256: FIXED.migrationSha256,
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
      allMethodFenceRequiredHostCount:
        FIXED.allMethodFenceRequiredHostCount,
      allMethodFenceRequiredHostsFingerprint:
        FIXED.allMethodFenceRequiredHostsFingerprint,
      allMethodFenceRequiredPathCount:
        FIXED.allMethodFenceRequiredPathCount,
      allMethodFenceRequiredPathsFingerprint:
        FIXED.allMethodFenceRequiredPathsFingerprint,
    },
    candidateDeploymentId: manifest.release.deploymentId,
    candidateDeploymentCommit: manifest.release.frozenSha,
    candidateAliasOrigin:
      "https://bagger-inv-git-feature-step116-sandbagger-invitational.vercel.app",
    candidateImmutableOrigin:
      "https://bagger-step116candidate-sandbagger-invitational.vercel.app",
    liveProviderInventoryCount: LIVE_ORIGIN_COUNT,
    liveProviderInventoryFingerprint: "7".repeat(64),
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
  const retainedChallenge = (
    stage,
    challengeId,
    challengeRequestId,
    consumeRequestId,
    attestationId,
    requestOperation,
  ) => ({
    found: true,
    challengeId,
    challengeRequestId,
    operationRequestId: manifest.stableRequestIds[requestOperation],
    evidenceRequestId: U.quiesceRequest,
    challengeRequestFingerprint: stage === "BEGIN" ? "3".repeat(64) : "4".repeat(64),
    stage,
    purpose: "CUTOVER",
    status: "CONSUMED",
    vercelProjectId: FIXED.vercelProjectId,
    vercelTeamId: manifest.resources.vercelTeamId,
    candidateDeploymentId: manifest.release.deploymentId,
    candidateDeploymentCommit: manifest.release.frozenSha,
    candidateDeploymentTarget: "PRODUCTION",
    candidateAliasOrigin: manifest.providerQuiesceEvidence.candidateAliasOrigin,
    candidateImmutableOrigin: manifest.providerQuiesceEvidence.candidateImmutableOrigin,
    routingRuleId: manifest.providerQuiesceEvidence.routingRule.ruleId,
    routingRuleConfigVersion: manifest.providerQuiesceEvidence.routingRule.revision,
    issuedAt: "2026-08-26T09:57:00Z",
    expiresAt: "2026-08-26T09:59:00Z",
    consumedAt: "2026-08-26T09:58:00Z",
    consumedAttestationId: attestationId,
    consumedAttestationFingerprint: stage === "BEGIN" ? "1".repeat(64) : "2".repeat(64),
    consumeRequestId,
  });
  Object.assign(manifest.providerAttestationChallenges.begin, {
    challengeRequestId: U.beginChallengeRequest,
    challengeId: U.beginChallenge,
    consumeRequestId: U.beginConsume,
    abandonRequestId: U.beginAbandon,
    retainedChallenge: retainedChallenge(
      "BEGIN", U.beginChallenge, U.beginChallengeRequest, U.beginConsume,
      U.beginAttestation, "begin-provider-quiesce",
    ),
    signedAttestation: signedAttestation(
      "BEGIN", U.beginChallenge, U.beginAttestation, "begin-provider-quiesce",
    ),
  });
  Object.assign(manifest.providerAttestationChallenges.finalize, {
    challengeRequestId: U.finalizeChallengeRequest,
    challengeId: U.finalizeChallenge,
    consumeRequestId: U.finalizeConsume,
    abandonRequestId: U.finalizeAbandon,
    retainedChallenge: retainedChallenge(
      "FINALIZE", U.finalizeChallenge, U.finalizeChallengeRequest,
      U.finalizeConsume, U.finalizeAttestation, "finalize-provider-quiesce",
    ),
    signedAttestation: signedAttestation(
      "FINALIZE", U.finalizeChallenge, U.finalizeAttestation,
      "finalize-provider-quiesce",
    ),
  });
  Object.assign(manifest.persistentProviderFence, {
    installRequestId:
      manifest.stableRequestIds["install-persistent-provider-fence"],
    quiesceEvidenceId: U.quiesceEvidence,
    candidateDeploymentId: manifest.release.deploymentId,
    candidateDeploymentCommit: manifest.release.frozenSha,
    expectedBaselineFingerprint: "5".repeat(64),
    expectedCanonicalValueFingerprint: "6".repeat(64),
  });
  return bindComputedFingerprints(manifest);
}

function installActiveProviderFenceFixture(manifest) {
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
  Object.assign(manifest.persistentProviderFence, {
    status: "INSTALLED",
    fenceId: U.providerFence,
    installRequestId:
      manifest.stableRequestIds["install-persistent-provider-fence"],
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
  return bindCurrentExecutionFingerprint(manifest);
}

function activeProviderFenceManifest() {
  return installActiveProviderFenceFixture(certifiedManifest());
}

function closingManifest() {
  const manifest = activeProviderFenceManifest();
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
  bindStagedProvenance(manifest);
  return bindCurrentExecutionFingerprint(manifest);
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
  bindStagedProvenance(manifest);
  return bindCurrentExecutionFingerprint(manifest);
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
  return bindCurrentExecutionFingerprint(manifest);
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
  return bindCurrentExecutionFingerprint(manifest);
}

function supabaseIngressPausedManifest() {
  const manifest = supabaseCommittedManifest();
  Object.assign(manifest.state, {
    gateExecutionState: "PAUSED",
    activeClosureKind: "SUPABASE_INGRESS",
    activeClosureStatus: "CLOSING",
  });
  return bindCurrentExecutionFingerprint(manifest);
}

function supabaseIngressClosedManifest() {
  const manifest = supabaseIngressPausedManifest();
  manifest.state.activeClosureStatus = "CLOSED";
  return bindCurrentExecutionFingerprint(manifest);
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
  const stateSource = templateSource.match(
    /"state"\s*:\s*\{([\s\S]*?)\n\s*\},\n\s*"evidence"/,
  )?.[1];
  assert.ok(stateSource);
  assert.equal((stateSource.match(/"admissionState"\s*:/g) || []).length, 1,
    "the template must contain one unambiguous admissionState key");
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

test("operator readiness binds the exact migration bytes", () => {
  const manifest = certifiedManifest();
  assert.deepEqual(evaluateReadiness(manifest), { ready: true, blockers: [] });
  manifest.release.migrationSha256 = "e".repeat(64);
  expectRefusal("MIGRATION_BINDING_DRIFT", () => validateManifest(manifest));
  const result = evaluateReadiness(manifest);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((value) =>
    value.includes("release.migrationSha256")));
});

test("readiness binds the claimed execution bundle fingerprint to its material", () => {
  const manifest = certifiedManifest();
  manifest.release.executionBundleFingerprintV2 = "e".repeat(64);
  const result = evaluateReadiness(manifest);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes(
    "release.executionBundleFingerprintV2 does not match the computed execution bundle material",
  ));
});

test("fingerprints derive in environment, certification, execution dependency order", () => {
  const manifest = certifiedManifest();
  const computed = computeFingerprintSet(manifest);
  assert.deepEqual(Object.keys(computed), [
    "environmentDeltaFingerprintV2",
    "certificationFingerprint",
    "executionBundleFingerprintV2",
  ]);
  assert.deepEqual(computed, {
    environmentDeltaFingerprintV2:
      manifest.release.environmentDeltaFingerprintV2,
    certificationFingerprint: manifest.release.certificationFingerprint,
    executionBundleFingerprintV2:
      manifest.release.executionBundleFingerprintV2,
  });

  const staleClaims = copy(manifest);
  staleClaims.release.environmentDeltaFingerprintV2 = "1".repeat(64);
  staleClaims.release.certificationFingerprint = "2".repeat(64);
  const rebound = computeFingerprintSet(staleClaims);
  assert.equal(rebound.environmentDeltaFingerprintV2,
    manifest.release.environmentDeltaFingerprintV2);
  assert.equal(rebound.certificationFingerprint,
    manifest.release.certificationFingerprint);
  assert.equal(rebound.executionBundleFingerprintV2,
    manifest.release.executionBundleFingerprintV2,
    "execution must bind the newly computed env/cert claims, not stale claims");
});

test("environment and certification computation are independent of their claims", () => {
  const manifest = certifiedManifest();
  const environment = computeEnvironmentDeltaFingerprintV2(manifest);
  const certification = computeCertificationFingerprint(manifest);
  manifest.release.environmentDeltaFingerprintV2 = "e".repeat(64);
  manifest.release.certificationFingerprint = "f".repeat(64);
  assert.equal(computeEnvironmentDeltaFingerprintV2(manifest), environment);
  assert.equal(computeCertificationFingerprint(manifest), certification);
  assert.notEqual(computeExecutionBundleMaterialFingerprint(manifest),
    manifest.release.executionBundleFingerprintV2,
    "execution intentionally binds the manifest's env/cert claims");
});

test("readiness rejects environment, certification, and execution material tampering", () => {
  const environmentTamper = certifiedManifest();
  environmentTamper.release.providerAttestationEnvironmentScopeFingerprint =
    "e".repeat(64);
  assert.ok(evaluateReadiness(environmentTamper).blockers.includes(
    "release.environmentDeltaFingerprintV2 does not match the computed environment delta material",
  ));

  const certificationTamper = certifiedManifest();
  certificationTamper.providerFenceRehearsal.capturedAt =
    "2026-08-26T11:00:01Z";
  assert.ok(evaluateReadiness(certificationTamper).blockers.includes(
    "release.certificationFingerprint does not match the computed certification material",
  ));

  const executionTamper = certifiedManifest();
  executionTamper.stableRequestIds["stage-release"] =
    "99999999-aaaa-4aaa-8aaa-000000000099";
  assert.ok(evaluateReadiness(executionTamper).blockers.includes(
    "release.executionBundleFingerprintV2 does not match the computed execution bundle material",
  ));
});

test("owner authorization is mutable outside all certified fingerprint material", () => {
  const manifest = certifiedManifest();
  const before = computeFingerprintSet(manifest);
  manifest.execution.step12OwnerAuthorizationRecorded = false;
  assert.deepEqual(computeFingerprintSet(manifest), before);
  expectRefusal("STEP12_OWNER_AUTHORIZATION_REQUIRED", () =>
    buildOperationEnvelope(manifest, "stage-release"));
  manifest.execution.step12OwnerAuthorizationRecorded = true;
  assert.equal(buildOperationEnvelope(manifest, "stage-release").rpc,
    "stage_production_cutover_release");
});

test("post-stage fingerprinting preserves historical env/cert and rebinds only execution", () => {
  const manifest = closingManifest();
  const historicalEnvironment = manifest.release.environmentDeltaFingerprintV2;
  const historicalCertification = manifest.release.certificationFingerprint;
  assert.notEqual(computeCertificationFingerprint(manifest),
    historicalCertification,
    "mutable cutover state must not silently replace the DORMANT certificate");

  manifest.state.activationRevision += 1;
  const computed = computeFingerprintSet(manifest);
  assert.equal(computed.environmentDeltaFingerprintV2, historicalEnvironment);
  assert.equal(computed.certificationFingerprint, historicalCertification);
  assert.notEqual(computed.executionBundleFingerprintV2,
    manifest.release.executionBundleFingerprintV2);
  manifest.release.executionBundleFingerprintV2 =
    computed.executionBundleFingerprintV2;
  const envelope = buildOperationEnvelope(manifest, "drain-legacy-admission");
  assert.equal(envelope.rpc, "drain_production_scoring_admission");
  assert.equal(envelope.diagnosticStateGuard.stagedRequestFingerprint,
    manifest.state.stagedRequestFingerprint);
  assert.equal(envelope.diagnosticStateGuard.stagedPayloadHash,
    manifest.state.stagedPayloadHash);
  assert.equal(envelope.diagnosticStateGuard.stagedCertificationFingerprint,
    manifest.release.certificationFingerprint);
  assert.equal(envelope.diagnosticStateGuard.stagedEnvironmentDeltaFingerprintV2,
    manifest.release.environmentDeltaFingerprintV2);
});

test("post-stage historical claims are pinned to protected staged provenance", () => {
  const missing = closingManifest();
  Object.assign(missing.state, {
    stagedRequestFingerprint: null,
    stagedPayloadHash: null,
    stagedCertificationFingerprint: null,
    stagedEnvironmentDeltaFingerprintV2: null,
  });
  expectRefusal("STAGED_PROVENANCE_REQUIRED", () =>
    computeFingerprintSet(missing));

  const certificationDrift = closingManifest();
  certificationDrift.release.certificationFingerprint = "e".repeat(64);
  expectRefusal("STAGED_PROVENANCE_MISMATCH", () =>
    computeFingerprintSet(certificationDrift));

  const environmentDrift = closingManifest();
  environmentDrift.state.stagedEnvironmentDeltaFingerprintV2 =
    "e".repeat(64);
  expectRefusal("STAGED_PROVENANCE_MISMATCH", () =>
    computeFingerprintSet(environmentDrift));

  const partial = closingManifest();
  partial.state.stagedPayloadHash = null;
  expectRefusal("STAGED_PROVENANCE_INCOMPLETE", () =>
    computeFingerprintSet(partial));
});

test("stage and current operations refuse stale fingerprint claims", () => {
  const environmentMismatch = certifiedManifest();
  environmentMismatch.release.environmentDeltaFingerprintV2 = "e".repeat(64);
  expectRefusal("ENVIRONMENT_DELTA_FINGERPRINT_MISMATCH", () =>
    buildOperationEnvelope(environmentMismatch, "stage-release"));

  const certificationMismatch = certifiedManifest();
  certificationMismatch.release.certificationFingerprint = "e".repeat(64);
  expectRefusal("CERTIFICATION_FINGERPRINT_MISMATCH", () =>
    buildOperationEnvelope(certificationMismatch, "stage-release"));

  const executionMismatch = certifiedManifest();
  executionMismatch.release.executionBundleFingerprintV2 = "e".repeat(64);
  expectRefusal("EXECUTION_BUNDLE_FINGERPRINT_MISMATCH", () =>
    buildOperationEnvelope(executionMismatch, "stage-release"));

  const current = closingManifest();
  current.state.activationRevision += 1;
  expectRefusal("EXECUTION_BUNDLE_FINGERPRINT_MISMATCH", () =>
    buildOperationEnvelope(current, "drain-legacy-admission"));
});

test("stage claims cannot be overridden and later operations cannot carry them", () => {
  const exact = certifiedManifest();
  Object.assign(exact.operationInputs["stage-release"], {
    certification_fingerprint: exact.release.certificationFingerprint,
    environment_delta_fingerprint_v2:
      exact.release.environmentDeltaFingerprintV2,
  });
  bindCurrentExecutionFingerprint(exact);
  assert.equal(buildOperationEnvelope(exact, "stage-release")
    .payload.certification_fingerprint, exact.release.certificationFingerprint);

  exact.operationInputs["stage-release"].certification_fingerprint =
    "e".repeat(64);
  bindCurrentExecutionFingerprint(exact);
  expectRefusal("AUTHORITY_BINDING_OVERRIDE_FORBIDDEN", () =>
    buildOperationEnvelope(exact, "stage-release"));

  const current = closingManifest();
  current.operationInputs["drain-legacy-admission"].certification_fingerprint =
    current.release.certificationFingerprint;
  bindCurrentExecutionFingerprint(current);
  expectRefusal("OPERATION_INPUT_FIELD_FORBIDDEN", () =>
    buildOperationEnvelope(current, "drain-legacy-admission"));
});

test("manifest rejects a caller-supplied origin subset or arbitrary matrix fingerprint", () => {
  const manifest = certifiedManifest();
  manifest.providerFenceRehearsal.originMatrix = [{
    origin: "https://baggerinv.com",
  }];
  manifest.providerFenceRehearsal.originMatrixFingerprint = "f".repeat(64);
  expectRefusal("CALLER_ORIGIN_MATRIX_FORBIDDEN", () => validateManifest(manifest));
});

test("readiness requires restored rehearsal evidence and an absent Step 12 fence", () => {
  const manifest = certifiedManifest();
  assert.deepEqual(evaluateReadiness(manifest), { ready: true, blockers: [] });

  const active = activeProviderFenceManifest();
  const activeReadiness = evaluateReadiness(active);
  assert.equal(activeReadiness.ready, false);
  assert.ok(activeReadiness.blockers.includes(
    "persistentProviderFence is not absent/restored with zero protections",
  ));
  assert.ok(activeReadiness.blockers.includes(
    "providerFenceProof is not MISSING at DORMANT readiness",
  ));

  const rangeDrift = certifiedManifest();
  rangeDrift.providerFenceRehearsal.protectedRangeCountAfter = 1;
  assert.equal(evaluateReadiness(rangeDrift).ready, false);

  const fingerprintDrift = certifiedManifest();
  fingerprintDrift.providerFenceRehearsal.restoredFingerprint = "f".repeat(64);
  const fingerprintReadiness = evaluateReadiness(fingerprintDrift);
  assert.equal(fingerprintReadiness.ready, false);
  assert.ok(fingerprintReadiness.blockers.includes(
    "providerFenceRehearsal restored fingerprint does not equal baseline",
  ));

  const providerInventoryDrift = certifiedManifest();
  providerInventoryDrift.providerFenceRehearsal.providerInventoryCount -= 1;
  const providerInventoryReadiness = evaluateReadiness(providerInventoryDrift);
  assert.equal(providerInventoryReadiness.ready, false);
  assert.ok(providerInventoryReadiness.blockers.includes(
    "providerFenceRehearsal provider inventory binding is not exact",
  ));

  const quiesceDrift = certifiedManifest();
  quiesceDrift.providerQuiesceEvidence.status = "MISSING";
  const quiesceReadiness = evaluateReadiness(quiesceDrift);
  assert.equal(quiesceReadiness.ready, false);
  assert.ok(quiesceReadiness.blockers.includes(
    "providerQuiesceEvidence is not VERIFIED historical evidence",
  ));
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

test("scoring-admission inspection is exact-scope, owner-auth exempt, and read-only", () => {
  const manifest = copy(template);
  manifest.execution.step12OwnerAuthorizationRecorded = false;
  const envelope = buildOperationEnvelope(manifest, "inspect-scoring-admission");
  assert.equal(envelope.executable, false);
  assert.equal(envelope.kind, "rpc-read-only");
  assert.equal(envelope.rpc, "inspect_production_scoring_admission");
  assert.equal(envelope.stableRequestId, null);
  assert.deepEqual({
    environment: envelope.payload.environment,
    project_ref: envelope.payload.project_ref,
    project_url: envelope.payload.project_url,
    source_workbook_id: envelope.payload.source_workbook_id,
    tournament_id: envelope.payload.tournament_id,
  }, {
    environment: FIXED.environment,
    project_ref: FIXED.projectRef,
    project_url: FIXED.projectUrl,
    source_workbook_id: FIXED.sourceWorkbookId,
    tournament_id: FIXED.tournamentId,
  });
  assert.match(envelope.sqlEnvelope,
    /^select public\.inspect_production_scoring_admission\(/);
});

test("retained origin inventory binding is the exact complete 1,291-record v3 artifact", () => {
  assert.deepEqual(productionOriginInventoryBinding(), {
    artifact: FIXED.originInventoryArtifact,
    schemaVersion: "step11-6-production-origin-inventory-v3",
    vercelProjectId: FIXED.vercelProjectId,
    capturedAt: "2026-08-26T23:27:14.195Z",
    providerRecordCount: 1291,
    providerRecordsFingerprint:
      "6488da5c86e50bd0c524a94a8c8f97c1aeb8576393fc14d68a7bd76ebe338692",
    recordCount: 1291,
    recordsFingerprint: "d238c5eeefef4606e0a05c2d0dbcee1a2b29cd07a2dd480435c0e75a0c3a91a6",
    productionTargetCount: 458,
    projectPreviewCount: 833,
    nullShaCount: 8,
    requiredDeployments: {
      priorLive: "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
      frozenStep11: "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
      step11_6Candidate: "dpl_2oK3GmMa8f93wqjHNp1Gp2Y6Paox",
    },
    paginationComplete: true,
    minimumLiveOriginInventoryCount: 1291,
    maximumLiveOriginInventoryCount: 1292,
    fixedAliasOriginCount: 4,
    candidateAliasOriginCount: 1,
    probeVectorCount: 11,
  });
});

test("historical safe-method writer evidence binds the one-path all-method fence", () => {
  assert.deepEqual(productionHistoricalSafeMethodWriterBinding(), {
    artifact: "docs/evidence/step11-6-historical-safe-method-google-writer.json",
    schemaVersion: "step11-6-historical-safe-method-google-writer-v1",
    evidenceFingerprint:
      "6bf411a2e119e8552e6b3ac9ac51d8828e9fc853e5c43069dc40c31a6e794f28",
    affectedOriginCount: 236,
    affectedOriginsFingerprint:
      "a8263e02ab7b65df938367fbf39769c70b501a614ebcdfa46800bda2e82de3a2",
    allMethodFenceRequiredPathCount: 1,
    allMethodFenceRequiredPathsFingerprint:
      "fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa",
  });
  const missingPathBinding = certifiedManifest();
  delete missingPathBinding.providerQuiesceEvidence.routingRule
    .allMethodFenceRequiredPathCount;
  assert.throws(() => validateManifest(missingPathBinding), (error) =>
    error.code === "PROVIDER_QUIESCE_RULE_INVALID");
});

test("operator accepts the exact current candidate as a retained zero-addition provider tuple", () => {
  const manifest = certifiedManifest();
  const retainedCandidate = {
    deploymentId: "dpl_2oK3GmMa8f93wqjHNp1Gp2Y6Paox",
    commit: "a0b79cdef3a34d640e9411035792bd1e91989566",
    immutableOrigin:
      "https://bagger-pmt7catuz-sandbagger-invitational.vercel.app",
  };
  Object.assign(manifest.release, {
    deploymentId: retainedCandidate.deploymentId,
    candidateSha: retainedCandidate.commit,
    frozenSha: retainedCandidate.commit,
  });
  Object.assign(manifest.providerQuiesceEvidence, {
    candidateDeploymentId: retainedCandidate.deploymentId,
    candidateDeploymentCommit: retainedCandidate.commit,
    candidateImmutableOrigin: retainedCandidate.immutableOrigin,
    liveProviderInventoryCount: FIXED.minimumLiveOriginInventoryCount,
    liveOriginInventoryCount: FIXED.minimumLiveOriginInventoryCount,
    probeOriginCount: FIXED.minimumLiveOriginInventoryCount +
      FIXED.quiesceFixedAliasOriginCount + FIXED.quiesceCandidateAliasOriginCount,
  });
  manifest.providerQuiesceEvidence.probeRecordCount =
    manifest.providerQuiesceEvidence.probeOriginCount *
    manifest.providerQuiesceEvidence.probeVectorCount;
  manifest.providerFenceRehearsal.liveOriginInventoryCount =
    manifest.providerQuiesceEvidence.liveOriginInventoryCount;
  manifest.providerFenceRehearsal.probeOriginCount =
    manifest.providerQuiesceEvidence.probeOriginCount;
  manifest.providerFenceRehearsal.probeRecordCount =
    manifest.providerQuiesceEvidence.probeRecordCount;
  for (const challenge of Object.values(manifest.providerAttestationChallenges)) {
    challenge.signedAttestation.attestation.candidateDeploymentId =
      retainedCandidate.deploymentId;
    challenge.signedAttestation.attestation.candidateDeploymentCommit =
      retainedCandidate.commit;
  }
  Object.assign(manifest.persistentProviderFence, {
    candidateDeploymentId: retainedCandidate.deploymentId,
    candidateDeploymentCommit: retainedCandidate.commit,
  });
  bindComputedFingerprints(manifest);
  assert.doesNotThrow(() => validateManifest(manifest));
  assert.equal(evaluateReadiness(manifest).blockers.some((blocker) =>
    blocker.includes("dynamic live/probe scope")), false);

  const partialCollision = copy(manifest);
  partialCollision.providerQuiesceEvidence.candidateDeploymentId =
    "dpl_DifferentCandidate123";
  assert.throws(() => validateManifest(partialCollision), (error) =>
    error.code === "PROVIDER_QUIESCE_CANDIDATE_ORIGIN_INVALID");
});

test("provider challenge payloads bind DB-issued scope before local signing", () => {
  const manifest = cutoverFenceWindowManifest();
  manifest.providerQuiesceEvidence.status = "MISSING";
  bindCurrentExecutionFingerprint(manifest);
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
  bindCurrentExecutionFingerprint(finalizeManifest);
  const inspect = buildOperationEnvelope(
    finalizeManifest, "inspect-finalize-provider-attestation-challenge",
  );
  assert.equal(inspect.payload.action, "inspect-provider-attestation-challenge");
  assert.equal(inspect.payload.operationRequestId,
    finalizeManifest.stableRequestIds["finalize-provider-quiesce"]);
  assert.equal(inspect.payload.providerChallengeId, U.finalizeChallenge);
  assert.equal(inspect.payload.providerAttestationStage, "FINALIZE");
});

test("provider challenge abandonment payloads preserve exact consumed reservations and stable recovery IDs", () => {
  const beginManifest = cutoverFenceWindowManifest();
  beginManifest.providerQuiesceEvidence.status = "MISSING";
  bindCurrentExecutionFingerprint(beginManifest);
  const inspectBegin = buildOperationEnvelope(
    beginManifest, "inspect-begin-provider-attestation-abandonment",
  );
  assertProviderRoutePayload(inspectBegin);
  assert.equal(inspectBegin.payload.action,
    "inspect-retained-provider-attestation-challenge");
  assert.equal(inspectBegin.payload.providerAttestationStage, "BEGIN");
  assert.equal(inspectBegin.payload.providerRetainedChallenge.status, "CONSUMED");
  assert.equal(inspectBegin.payload.providerRetainedChallenge.consumedAttestationId,
    U.beginAttestation);
  assert.deepEqual(inspectBegin.receiptRpcs,
    ["inspect_production_vercel_provider_challenge_abandonment"]);

  const abandonBegin = buildOperationEnvelope(
    beginManifest, "abandon-begin-provider-attestation-challenge",
  );
  assert.equal(abandonBegin.payload.action,
    "abandon-provider-attestation-challenge");
  assert.equal(abandonBegin.payload.abandonRequestId, U.beginAbandon);
  assert.equal(abandonBegin.payload.operationRequestId,
    beginManifest.stableRequestIds["begin-provider-quiesce"]);
  assert.deepEqual(abandonBegin.receiptRpcs,
    ["abandon_production_vercel_provider_attestation_challenge"]);
  assert.deepEqual(
    buildOperationEnvelope(
      beginManifest, "abandon-begin-provider-attestation-challenge",
    ),
    abandonBegin,
    "a lost response must regenerate the exact same abandonment request",
  );

  const finalizeManifest = cutoverFenceWindowManifest();
  finalizeManifest.providerQuiesceEvidence.status = "DRAINING";
  bindCurrentExecutionFingerprint(finalizeManifest);
  const abandonFinalize = buildOperationEnvelope(
    finalizeManifest, "abandon-finalize-provider-attestation-challenge",
  );
  assertProviderRoutePayload(abandonFinalize);
  assert.equal(abandonFinalize.payload.providerAttestationStage, "FINALIZE");
  assert.equal(abandonFinalize.payload.evidenceRequestId, U.quiesceRequest);
  assert.equal(abandonFinalize.payload.abandonRequestId, U.finalizeAbandon);
  assert.equal(abandonFinalize.payload.providerRetainedChallenge.consumedAttestationId,
    U.finalizeAttestation);

  const drift = copy(finalizeManifest);
  drift.providerAttestationChallenges.finalize.retainedChallenge
    .consumedAttestationFingerprint = "9".repeat(64);
  bindCurrentExecutionFingerprint(drift);
  expectRefusal("PROVIDER_ATTESTATION_RETAINED_CHALLENGE_MISMATCH", () =>
    buildOperationEnvelope(
      drift, "abandon-finalize-provider-attestation-challenge",
    ));
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
  bindCurrentExecutionFingerprint(manifest);
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
  assert.equal(first.originInventoryBinding.recordCount, 1291);
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
  bindCurrentExecutionFingerprint(manifest);
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
  bindCurrentExecutionFingerprint(manifest);
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
  bindCurrentExecutionFingerprint(baseline);
  const missing = buildOperationEnvelope(baseline,
    "inspect-persistent-provider-fence");
  assertProviderRoutePayload(missing);
  assert.equal(missing.payload.installRequestId, null);
  assert.equal(missing.payload.fenceId, null);
  assert.equal(missing.payload.currentVerificationId, null);

  const active = activeProviderFenceManifest();
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
  const manifest = activeProviderFenceManifest();
  expectRefusal("PERSISTENT_PROVIDER_FENCE_REFRESH_EVIDENCE_NOT_NEW", () =>
    buildOperationEnvelope(manifest, "refresh-persistent-provider-fence"));

  manifest.providerQuiesceEvidence.priorEvidenceId = U.quiesceEvidence;
  manifest.providerQuiesceEvidence.evidenceId = U.refreshedQuiesceEvidence;
  bindCurrentExecutionFingerprint(manifest);
  const envelope = buildOperationEnvelope(manifest,
    "refresh-persistent-provider-fence");
  assertProviderRoutePayload(envelope);
  assert.equal(envelope.payload.fenceId, U.providerFence);
  assert.equal(envelope.payload.quiesceEvidenceId, U.refreshedQuiesceEvidence);
  assert.deepEqual(envelope.receiptRpcs,
    ["refresh_production_google_writer_provider_fence"]);
});

test("persistent provider-fence removal is emitted only for authoritative safe rollback/abort state", () => {
  const manifest = activeProviderFenceManifest();
  manifest.persistentProviderFence.removalRequestId =
    manifest.stableRequestIds["remove-persistent-provider-fence"];
  bindCurrentExecutionFingerprint(manifest);
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

  const staleQuiesce = activeProviderFenceManifest();
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
  const first = buildOperationEnvelope(manifest, "stage-release");
  const retry = buildOperationEnvelope(manifest, "stage-release");
  assert.deepEqual(first, retry);
  assert.equal(first.payload.deployment_id, manifest.release.deploymentId,
    "case-sensitive Vercel deployment identity must not be normalized");
  assert.equal(first.payload.deployment_commit, manifest.release.frozenSha);
  assert.equal(first.payload.vercel_project_id, FIXED.vercelProjectId);
  assert.equal(first.payload.quiesce_evidence_id, undefined);
  assert.equal(first.payload.provider_fence_id, undefined);
  assert.equal(first.payload.provider_fence_verification_id, undefined);
  assert.equal(first.stableRequestId, manifest.stableRequestIds["stage-release"]);
  assert.match(first.requestFingerprint, /^[0-9a-f]{64}$/);

  const active = activeProviderFenceManifest();
  bindComputedFingerprints(active);
  expectRefusal("STEP11_6_PROVIDER_FENCE_NOT_RESTORED", () =>
    buildOperationEnvelope(active, "stage-release"));

  const rehearsalDrift = certifiedManifest();
  rehearsalDrift.providerFenceRehearsal.restoredFingerprint = "f".repeat(64);
  bindComputedFingerprints(rehearsalDrift);
  expectRefusal("STEP11_6_REHEARSAL_BASELINE_NOT_RESTORED", () =>
    buildOperationEnvelope(rehearsalDrift, "stage-release"));

  const proofDrift = certifiedManifest();
  proofDrift.providerFenceProof.status = "VERIFIED";
  bindComputedFingerprints(proofDrift);
  expectRefusal("STEP11_6_PROVIDER_PROOF_NOT_ABSENT", () =>
    buildOperationEnvelope(proofDrift, "stage-release"));

  const quiesceDrift = certifiedManifest();
  quiesceDrift.providerQuiesceEvidence.status = "MISSING";
  bindComputedFingerprints(quiesceDrift);
  expectRefusal("STEP11_6_PROVIDER_QUIESCE_NOT_VERIFIED", () =>
    buildOperationEnvelope(quiesceDrift, "stage-release"));
});

test("phase skipping and stale optimistic revisions are refused", () => {
  const skipped = certifiedManifest();
  skipped.state.cutoverPhase = "READ_CUTOVER";
  bindStagedProvenance(skipped);
  expectRefusal("PHASE_SKIP_FORBIDDEN", () => buildOperationEnvelope(skipped, "stage-release"));

  const stale = closingManifest();
  stale.state.admissionRevision = "__STALE__";
  expectRefusal("STALE_ADMISSION_REVISION", () => buildOperationEnvelope(stale, "drain-legacy-admission"));
});

test("close requires barrier-aware state plus exact old-host provider fence", () => {
  const manifest = activeProviderFenceManifest();
  Object.assign(manifest.state, {
    cutoverPhase: "SCORING_PREPARE",
    activationState: "GOOGLE_LEASE_ARMED",
    admissionProtocolEnforced: true,
    admissionDeploymentId: manifest.release.deploymentId,
    gateExecutionState: "OPEN",
  });
  bindStagedProvenance(manifest);
  manifest.providerFenceProof.exactOldHostProviderFence = false;
  expectRefusal("PROVIDER_FENCE_REQUIRED", () => buildOperationEnvelope(manifest, "close-legacy-admission"));
  manifest.providerFenceProof.exactOldHostProviderFence = true;
  bindCurrentExecutionFingerprint(manifest);
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
  bindCurrentExecutionFingerprint(manifest);
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
  bindCurrentExecutionFingerprint(manifest);
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
  bindStagedProvenance(manifest);
  bindCurrentExecutionFingerprint(manifest);
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
  bindCurrentExecutionFingerprint(manifest);
  const drain = buildOperationEnvelope(manifest, "drain-supabase-ingress");
  assert.equal(drain.rpc, "drain_production_scoring_admission");
  assert.equal(drain.payload.closure_id, U.closure);
  expectRefusal("LEGACY_WRITERS_NOT_DRAINED", () =>
    buildOperationEnvelope(manifest, "finalize-supabase-ingress-closed"));

  manifest.state.activeLegacyWriters = 0;
  bindCurrentExecutionFingerprint(manifest);
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
  bindCurrentExecutionFingerprint(preparedInput);
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
  for (const field of [
    "ambiguousGoogleWrites", "partialGoogleWrites",
    "legacyUnclassifiedWriters", "unresolvedArchive",
  ]) {
    const invalid = certifiedManifest();
    invalid.state[field] = "0";
    expectRefusal("STATE_INVALID", () => validateManifest(invalid));
  }

  const manifest = supabaseIngressPausedManifest();
  Object.assign(manifest.state, {
    activeLegacyWriters: 1,
    unresolvedLegacyWriters: 2,
    ambiguousGoogleWrites: 3,
    partialGoogleWrites: 4,
    legacyUnclassifiedWriters: 5,
    unresolvedOutbox: 6,
    unresolvedArchive: 7,
  });
  bindCurrentExecutionFingerprint(manifest);
  const envelope = buildOperationEnvelope(manifest, "drain-supabase-ingress");
  assert.deepEqual({
    activeClosureKind: envelope.diagnosticStateGuard.activeClosureKind,
    activeClosureStatus: envelope.diagnosticStateGuard.activeClosureStatus,
    activeLegacyWriters: envelope.diagnosticStateGuard.activeLegacyWriters,
    unresolvedLegacyWriters:
      envelope.diagnosticStateGuard.unresolvedLegacyWriters,
    ambiguousGoogleWrites: envelope.diagnosticStateGuard.ambiguousGoogleWrites,
    partialGoogleWrites: envelope.diagnosticStateGuard.partialGoogleWrites,
    legacyUnclassifiedWriters:
      envelope.diagnosticStateGuard.legacyUnclassifiedWriters,
    unresolvedOutbox: envelope.diagnosticStateGuard.unresolvedOutbox,
    unresolvedArchive: envelope.diagnosticStateGuard.unresolvedArchive,
  }, {
    activeClosureKind: "SUPABASE_INGRESS",
    activeClosureStatus: "CLOSING",
    activeLegacyWriters: 1,
    unresolvedLegacyWriters: 2,
    ambiguousGoogleWrites: 3,
    partialGoogleWrites: 4,
    legacyUnclassifiedWriters: 5,
    unresolvedOutbox: 6,
    unresolvedArchive: 7,
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
  bindCurrentExecutionFingerprint(manifest);
  const envelope = buildOperationEnvelope(manifest, "prepare-authority");
  assert.equal(envelope.payload.closure_id, U.closure);

  manifest.operationInputs["prepare-authority"].closure_id =
    "66666666-6666-4666-8666-666666666666";
  bindCurrentExecutionFingerprint(manifest);
  expectRefusal("AUTHORITY_BINDING_OVERRIDE_FORBIDDEN", () =>
    buildOperationEnvelope(manifest, "prepare-authority"));

  manifest.operationInputs["prepare-authority"].closure_id = U.closure;
  manifest.operationInputs["prepare-authority"].expected_activation_revision += 1;
  bindCurrentExecutionFingerprint(manifest);
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
  bindCurrentExecutionFingerprint(manifest);
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
  bindCurrentExecutionFingerprint(manifest);
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
  bindCurrentExecutionFingerprint(manifest);
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
