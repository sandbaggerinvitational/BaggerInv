import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FIXED,
  OperatorRefusalError,
  buildOperationEnvelope,
  computeAclV2AcceptanceFingerprint,
  computeCertificationFingerprint,
  computeEnvironmentDeltaFingerprintV2,
  computeExecutionBundleMaterialFingerprint,
  computeFingerprintSet,
  evaluateReadiness,
  exactReviewedProjectWidePreviewException,
  productionCredentialConfinementBinding,
  productionHistoricalSafeMethodWriterBinding,
  productionHistoricalWriterScopeBinding,
  productionOriginInventoryBinding,
  setAclV2AcceptanceArtifactForTest,
  validateManifest,
} from "./operator.mjs";

const templateSource = readFileSync(
  new URL("./manifest.template.json", import.meta.url),
  "utf8",
);
const template = JSON.parse(templateSource);
const credentialConfinementEvidence = JSON.parse(readFileSync(
  new URL(
    "../../docs/evidence/step11-6-production-google-credential-confinement-v4.json",
    import.meta.url,
  ),
  "utf8",
));
const activeAliasCensus = JSON.parse(readFileSync(new URL(
  "../../docs/evidence/step11-6-production-active-alias-census-v1.json",
  import.meta.url,
), "utf8"));
const MIGRATION_SHA_PENDING = FIXED.migrationSha256.startsWith("__MIGRATION_040_") &&
  FIXED.migrationSha256.endsWith("_PENDING__");

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
  rehearsalFence: "10101010-2020-4030-8040-505050505050",
  rehearsalFenceInstall: "20202020-3030-4040-8050-606060606060",
  step12QuiesceEvidence: "12121212-3434-4567-89ab-121212121212",
  step12QuiesceRequest: "23232323-4545-4678-8abc-232323232323",
  providerFence: "88888888-8888-4888-8888-888888888888",
  providerFenceInstall: "99999999-9999-4999-8999-999999999999",
  providerFenceVerification: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  providerFenceRemoval: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
  providerFenceAbort: "abababab-cdcd-4efe-8a8a-bcbcbcbcbcbc",
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
  aclReaderConfirmedObservation: "88888888-9999-4aaa-8bbb-bbbbbbbbbbbb",
  settlementReadback1Observation: "99999999-aaaa-4bbb-8ccc-cccccccccccc",
  settlementReadback2Observation: "aaaaaaaa-bbbb-4ccc-8ddd-dddddddddddd",
});

const LIVE_ORIGIN_COUNT = FIXED.maximumLiveOriginInventoryCount;
const PROBE_ORIGIN_COUNT = LIVE_ORIGIN_COUNT +
  FIXED.quiesceFixedAliasOriginCount + FIXED.quiesceCandidateAliasOriginCount;
const PROBE_RECORD_COUNT = PROBE_ORIGIN_COUNT * FIXED.quiesceProbeVectorCount;

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixtureAliasRecords(candidateDeploymentId, candidateAliasOrigin,
  candidateImmutableOrigin) {
  const records = activeAliasCensus.records.map((record) => [...record]);
  const index = records.findIndex((record) => record[0] ===
    "bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app");
  assert.notEqual(index, -1);
  records[index] = [
    new URL(candidateAliasOrigin).hostname,
    candidateDeploymentId,
    new URL(candidateImmutableOrigin).hostname,
    null,
    null,
  ];
  return records.sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);
}

function assertCertifiedReadiness(result) {
  const blockers = [];
  if (MIGRATION_SHA_PENDING) blockers.push("release.migrationSha256 is unresolved");
  assert.deepEqual(result, { ready: blockers.length === 0, blockers });
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
    aclEvidenceOnlyDiffPassed: true,
    aclEvidenceOnlyDiffBaseSha: "e".repeat(40),
    aclEvidenceOnlyDiffTargetSha: manifest.release.frozenSha,
    aclEvidenceOnlyDiffAllowedPathCount: 2,
    aclEvidenceOnlyDiffUnexpectedPathCount: 0,
    aclEvidenceOnlyDiffFingerprint: "f".repeat(64),
    unexplainedConcurrencyWindows: 0,
    clientSecretExposures: 0,
  });
  Object.assign(manifest.providerFenceRehearsal, {
    status: "PASSED_RESTORED",
    lifecycleMode: "REHEARSAL",
    mechanism: "DRIVE_ACL_EXACT_LEGACY_PERMISSION_V2",
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
    wafBaselineRestored: true,
    previewResourcesAbsent: true,
    legacyDriveRoleBefore: "writer",
    legacyDriveRoleDuring: "reader",
    legacyDriveRoleAfter: "writer",
    legacyDriveCanEditDuring: false,
    legacyDriveCanShareDuring: false,
    legacyPrincipalFingerprint: "d".repeat(64),
    aclDowngradeDispatchResult: "TARGET_CONFIRMED",
    aclRestoreDispatchResult: "TARGET_CONFIRMED",
    unknownAclDispatchCount: 0,
    googleCanonicalWriterOperationCount: 0,
    supabaseCanonicalWriteCount: 0,
    baselineProviderFingerprint: "0".repeat(64),
    readerProviderFingerprint: "1".repeat(64),
    restoredProviderFingerprint: "0".repeat(64),
    baselineWafFingerprint: "a".repeat(64),
    criticalWindowWafFingerprint: "b".repeat(64),
    restoredWafFingerprint: "a".repeat(64),
    criticalWindowActivatedAt: "2026-08-26T10:00:00Z",
    aclRestoreConfirmedAt: "2026-08-26T10:30:10Z",
    criticalWindowHeldSeconds: FIXED.criticalWindowWafMinimumHoldSeconds,
    criticalWindowMinimumHoldSeconds: FIXED.criticalWindowWafMinimumHoldSeconds,
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
  const candidateAliasOrigin =
    "https://bagger-inv-git-feature-step116-sandbagger-invitational.vercel.app";
  const candidateImmutableOrigin =
    "https://bagger-step116candidate-sandbagger-invitational.vercel.app";
  const aliasRecords = fixtureAliasRecords(
    manifest.release.deploymentId, candidateAliasOrigin, candidateImmutableOrigin,
  );
  const aliasFingerprint = createHash("sha256")
    .update(JSON.stringify(aliasRecords)).digest("hex");
  const aliasPaginationFingerprint = "e".repeat(64);
  const beginAliasObservedAt = "2026-08-26T10:00:10Z";
  const finalizeAliasObservedAt = "2026-08-26T10:00:20Z";
  Object.assign(manifest.providerQuiesceEvidence, {
    status: "VERIFIED",
    evidenceId: U.quiesceEvidence,
    evidenceRequestId: U.quiesceRequest,
    priorEvidenceId: null,
    routingRule: {
      mode: FIXED.criticalWindowWafMode,
      groupCount: FIXED.criticalWindowWafGroupCount,
      projectId: FIXED.vercelProjectId,
      ruleId: "rule-production-writer-quiesce",
      revision: "revision-17",
      scope: FIXED.quiesceScope,
      projectWide: true,
      action: "DENY",
      hostnameOperator: "DOES_NOT_EQUAL",
      canonicalHostname: FIXED.criticalWindowWafCanonicalHostname,
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
      earlierActiveBypassRuleCount: 0,
    },
    baselineWafFingerprint: "a".repeat(64),
    criticalWindowWafFingerprint: "b".repeat(64),
    criticalWindowActivatedAt: "2026-08-26T10:00:00Z",
    restoredWafFingerprint: "a".repeat(64),
    baselineWafRestored: true,
    candidateControlExceptionExact: true,
    canonicalUnsafeMethodsDenied: true,
    canonicalHistoricalSafeWriterPathsDenied: true,
    canonicalSafeReadsAllowed: true,
    candidateDeploymentId: manifest.release.deploymentId,
    candidateDeploymentCommit: manifest.release.frozenSha,
    candidateAliasOrigin,
    candidateImmutableOrigin,
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
    aliasRecaptureCount: FIXED.criticalWindowWafRequiredAliasRecaptureCount,
    aliasInventoryCount: aliasRecords.length,
    aliasInventoryFingerprint: aliasFingerprint,
    aliasPaginationPageCount: 1,
    aliasPaginationFingerprint,
    beginAliasAttestationId: U.beginAttestation,
    beginAliasAttestationFingerprint: "1".repeat(64),
    beginAliasProviderObservedAt: beginAliasObservedAt,
    finalizeAliasAttestationId: U.finalizeAttestation,
    finalizeAliasAttestationFingerprint: "2".repeat(64),
    finalizeAliasProviderObservedAt: finalizeAliasObservedAt,
    ownerOverrideOperationallyFrozen: true,
    ownerFreezeConfirmation: FIXED.rehearsalOwnerFreezeConfirmation,
    ownerFreezeTtlSeconds: 2100,
    ownerAcknowledgedAt: "2026-08-26T10:00:00Z",
    ownerFreezeExpiresAt: "2026-08-26T10:30:00Z",
    drainStartedAt: "2026-08-26T10:01:00Z",
    drainCompletedAt: "2026-08-26T10:06:00Z",
    unresolvedRequestLogCount: 0,
    unresolvedGoogleWriteCount: 0,
    allOriginsEdgeDenied: true,
    canonicalApexExcludedFromEdgeDenyProbes: true,
    canonicalApexWriteMethodsEdgeDenied: true,
    unresolvedProbeCount: 0,
    verifiedAt: "2026-08-26T10:06:01Z",
    expiresAt: "2026-08-26T10:20:00Z",
  });
  Object.assign(manifest.state, {
    admissionRevision: 7,
    admissionGeneration: U.admission,
    authorityGeneration: U.authority,
    providerPrincipalFingerprint: "d".repeat(64),
  });
  Object.assign(manifest.aclV2Acceptance, {
    acceptedAsPrimaryProof: true,
    unexplainedConcurrencyWindowCount: 0,
    rehearsalCandidateSha: manifest.certification.aclEvidenceOnlyDiffBaseSha,
    rehearsalDeploymentId: "dpl_RehearsalAclV2Candidate123",
    migrationSha256: manifest.release.migrationSha256,
    baselineWafFingerprint: "a".repeat(64),
    criticalWindowWafFingerprint: "b".repeat(64),
    restoredWafFingerprint: "a".repeat(64),
    criticalWindowActivatedAt: "2026-08-26T10:00:00Z",
    criticalWindowHeldSeconds: FIXED.criticalWindowWafMinimumHoldSeconds,
    fenceId: U.rehearsalFence,
    installRequestId: U.rehearsalFenceInstall,
    quiesceEvidenceId: U.quiesceEvidence,
    restoreQuiesceEvidenceId: "45454545-5656-4789-8bcd-454545454545",
    forwardDispatchId: "12121212-1212-4121-8121-121212121212",
    forwardDispatchResult: "TARGET_CONFIRMED",
    forwardTransitionProofFingerprint: "8".repeat(64),
    aclReaderConfirmedAt: "2026-08-26T10:00:00Z",
    reverseDispatchId: "34343434-3434-4343-8343-343434343434",
    reverseDispatchResult: "TARGET_CONFIRMED",
    reverseTransitionProofFingerprint: "9".repeat(64),
    restoreCriticalWindowActivatedAt: "2026-08-26T10:00:00Z",
    aclWriterRestoredAt: "2026-08-26T10:30:10Z",
    rehearsalRestoredAt: "2026-08-26T10:30:11Z",
    settlementReadback1Id: U.settlementReadback1Observation,
    settlementReadback2Id: U.settlementReadback2Observation,
    legacyRoleDuring: "reader",
    legacyPrincipalFingerprint: "d".repeat(64),
    wafBaselineRestored: true,
    oldDeploymentEnforcementPassed: true,
    staleClientEnforcementPassed: true,
    lowLevelWriterEnforcementPassed: true,
    previewIsolationPassed: true,
    restoredProductionStatePassed: true,
    capturedAt: "2026-08-26T10:30:11Z",
  });
  manifest.aclV2Acceptance.acceptanceFingerprint =
    computeAclV2AcceptanceFingerprint(manifest.aclV2Acceptance);
  setAclV2AcceptanceArtifactForTest(manifest.aclV2Acceptance);
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
    schemaVersion: "bagger-vercel-provider-attestation-envelope-v2",
    algorithm: "Ed25519",
    signerKeyVersion: "STEP11_6_VERCEL_ATTESTER_V1",
    signerKeyFingerprint: manifest.release.providerAttestationSignerKeyFingerprint,
    attestation: {
      schemaVersion: "bagger-vercel-provider-attestation-noncanonical-host-v2",
      attestationId,
      challengeId,
      requestId: manifest.stableRequestIds[requestOperation],
      stage,
      purpose: manifest.providerQuiesceEvidence.purpose,
      vercelProjectId: FIXED.vercelProjectId,
      vercelTeamId: manifest.resources.vercelTeamId,
      candidateDeploymentId: manifest.release.deploymentId,
      candidateDeploymentCommit: manifest.release.frozenSha,
      candidateDeploymentTarget: "PREVIEW",
      candidateAliasOrigin,
      candidateImmutableOrigin,
      aliasInventoryCount: aliasRecords.length,
      aliasInventoryFingerprint: aliasFingerprint,
      aliasInventoryRecords: copy(aliasRecords),
      aliasPaginationPageCount: 1,
      aliasPaginationFingerprint,
      providerObservedAt: stage === "BEGIN" ?
        beginAliasObservedAt : finalizeAliasObservedAt,
      routingRuleHostnameOperator:
        manifest.providerQuiesceEvidence.routingRule.hostnameOperator,
      routingRuleCanonicalHostname:
        manifest.providerQuiesceEvidence.routingRule.canonicalHostname,
      routingRuleEarlierActiveBypassRuleCount:
        manifest.providerQuiesceEvidence.routingRule.earlierActiveBypassRuleCount,
      routingRuleAllMethodFenceRequiredHostCount:
        manifest.providerQuiesceEvidence.routingRule.allMethodFenceRequiredHostCount,
      routingRuleAllMethodFenceRequiredHostsFingerprint:
        manifest.providerQuiesceEvidence.routingRule
          .allMethodFenceRequiredHostsFingerprint,
      routingRuleAllMethodFenceRequiredPathCount:
        manifest.providerQuiesceEvidence.routingRule.allMethodFenceRequiredPathCount,
      routingRuleAllMethodFenceRequiredPathsFingerprint:
        manifest.providerQuiesceEvidence.routingRule
          .allMethodFenceRequiredPathsFingerprint,
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
    purpose: manifest.providerQuiesceEvidence.purpose,
    status: "CONSUMED",
    vercelProjectId: FIXED.vercelProjectId,
    vercelTeamId: manifest.resources.vercelTeamId,
    candidateDeploymentId: manifest.release.deploymentId,
    candidateDeploymentCommit: manifest.release.frozenSha,
    candidateDeploymentTarget: "PREVIEW",
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
    legacyDriveCanShare: true,
  });
  return bindComputedFingerprints(manifest);
}

function markQuiesceDraining(manifest) {
  Object.assign(manifest.providerQuiesceEvidence, {
    status: "DRAINING",
    aliasRecaptureCount: 1,
    finalizeAliasAttestationId: null,
    finalizeAliasAttestationFingerprint: null,
    finalizeAliasProviderObservedAt: null,
  });
  return manifest;
}

function activateFreshStep12CriticalWindow(manifest) {
  const now = Date.now();
  const iso = (offsetSeconds) =>
    new Date(now + offsetSeconds * 1000).toISOString();
  manifest.execution.step12StartedAt = iso(-950);
  Object.assign(manifest.providerQuiesceEvidence, {
    purpose: "CUTOVER",
    ownerFreezeConfirmation: FIXED.cutoverOwnerFreezeConfirmation,
    status: "VERIFIED",
    evidenceId: U.step12QuiesceEvidence,
    evidenceRequestId: U.step12QuiesceRequest,
    priorEvidenceId: null,
    baselineWafRestored: false,
    restoredWafFingerprint: null,
    criticalWindowActivatedAt: iso(-850),
    ownerAcknowledgedAt: iso(-900),
    ownerFreezeExpiresAt: iso(1200),
    drainStartedAt: iso(-800),
    drainCompletedAt: iso(-500),
    verifiedAt: iso(-490),
    expiresAt: iso(900),
    beginAliasProviderObservedAt: iso(-840),
    finalizeAliasProviderObservedAt: iso(-480),
  });
  for (const [stage, challenge] of Object.entries(
    manifest.providerAttestationChallenges,
  )) {
    const upperStage = stage.toUpperCase();
    const observedAt = upperStage === "BEGIN"
      ? manifest.providerQuiesceEvidence.beginAliasProviderObservedAt
      : manifest.providerQuiesceEvidence.finalizeAliasProviderObservedAt;
    challenge.signedAttestation.attestation.purpose = "CUTOVER";
    challenge.signedAttestation.attestation.providerObservedAt = observedAt;
    challenge.retainedChallenge.purpose = "CUTOVER";
    challenge.retainedChallenge.evidenceRequestId = U.step12QuiesceRequest;
  }
  manifest.persistentProviderFence.quiesceEvidenceId = U.step12QuiesceEvidence;
  return manifest;
}

function installActiveProviderFenceFixture(manifest) {
  Object.assign(manifest.providerFenceProof, {
    status: "VERIFIED",
    evidenceId: U.evidence,
    quiesceEvidenceId: manifest.providerQuiesceEvidence.evidenceId,
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
    lifecycleMode: "CUTOVER",
    mechanism: "DRIVE_ACL_EXACT_LEGACY_PERMISSION_V2",
    fenceId: U.providerFence,
    installRequestId:
      manifest.stableRequestIds["install-persistent-provider-fence"],
    currentVerificationId: U.providerFenceVerification,
    quiesceEvidenceId: manifest.providerQuiesceEvidence.evidenceId,
    candidateDeploymentId: manifest.release.deploymentId,
    candidateDeploymentCommit: manifest.release.frozenSha,
    expectedBaselineFingerprint: "5".repeat(64),
    expectedCanonicalValueFingerprint: "6".repeat(64),
    legacyDriveRole: "reader",
    legacyDriveCanEdit: false,
    legacyDriveCanShare: false,
    aclDispatchResult: "TARGET_CONFIRMED",
    aclUnknownDispatchCount: 0,
    aclTransitionFingerprint: "7".repeat(64),
    providerFingerprint: "8".repeat(64),
    aclFingerprint: "9".repeat(64),
    canonicalValueFingerprint: "a".repeat(64),
    formulaFingerprint: "b".repeat(64),
    permissionInventoryFingerprint: "c".repeat(64),
    providerSettlementStage: "SETTLEMENT_READBACK_2",
    providerSettlementLatestObservationId: U.settlementReadback2Observation,
    aclReaderConfirmedObservationId: U.aclReaderConfirmedObservation,
    settlementReadback1ObservationId: U.settlementReadback1Observation,
    settlementReadback2ObservationId: U.settlementReadback2Observation,
    providerSettlementNextEligibleAt: null,
    providerSettlementRemainingWaitSeconds: 0,
    providerSettlementInstallWaitSeconds:
      FIXED.providerSettlementInstallWaitSeconds,
    providerSettlementReadbackWaitSeconds:
      FIXED.providerSettlementReadbackWaitSeconds,
    settlementStructuralCanaryFingerprint: "d".repeat(64),
    settlementCompletedAt: "2026-08-26T10:07:00Z",
    admissionCloseCommitted: true,
    capturedAt: "2026-08-26T10:07:00Z",
    expiresAt: "2026-08-26T10:25:00Z",
    removalRequestId: null,
    removalAuthorizedAt: null,
  });
  return bindCurrentExecutionFingerprint(manifest);
}

function activeProviderFenceManifest() {
  const manifest = certifiedManifest();
  activateFreshStep12CriticalWindow(manifest);
  return installActiveProviderFenceFixture(manifest);
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
  activateFreshStep12CriticalWindow(manifest);
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

test(`migration 040 SHA binding is ${MIGRATION_SHA_PENDING
  ? "explicitly pending" : "resolved"}`, () => {
  assert.equal(template.release.migrationSha256, FIXED.migrationSha256);
  if (MIGRATION_SHA_PENDING) {
    assert.match(FIXED.migrationSha256, /^__MIGRATION_040_[A-Z0-9_]+__$/);
  } else {
    assert.match(FIXED.migrationSha256, /^[0-9a-f]{64}$/);
  }
});

test("claimed readiness is ignored; exact evidence derives readiness", () => {
  const manifest = certifiedManifest();
  manifest.executionReadiness.ready = false;
  assertCertifiedReadiness(evaluateReadiness(manifest));
  manifest.executionReadiness.ready = true;
  manifest.providerFenceRehearsal.exactOldHostProviderFence = false;
  const result = evaluateReadiness(manifest);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("providerFenceRehearsal.exactOldHostProviderFence is not true"));
});

test("operator readiness binds the exact migration bytes", () => {
  const manifest = certifiedManifest();
  assert.equal(template.release.migrationSha256, FIXED.migrationSha256);
  assertCertifiedReadiness(evaluateReadiness(manifest));
  if (MIGRATION_SHA_PENDING) return;
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
  assertCertifiedReadiness(evaluateReadiness(manifest));

  const active = activeProviderFenceManifest();
  const activeReadiness = evaluateReadiness(active);
  assert.equal(activeReadiness.ready, false);
  assert.ok(activeReadiness.blockers.includes(
    "persistentProviderFence is not absent/restored at the exact legacy writer capabilities",
  ));
  assert.ok(activeReadiness.blockers.includes(
    "providerFenceProof is not MISSING at DORMANT readiness",
  ));

  const unknownAcl = certifiedManifest();
  unknownAcl.providerFenceRehearsal.unknownAclDispatchCount = 1;
  assert.equal(evaluateReadiness(unknownAcl).ready, false);

  const fingerprintDrift = certifiedManifest();
  fingerprintDrift.providerFenceRehearsal.restoredProviderFingerprint = "f".repeat(64);
  const fingerprintReadiness = evaluateReadiness(fingerprintDrift);
  assert.equal(fingerprintReadiness.ready, false);
  assert.ok(fingerprintReadiness.blockers.includes(
    "providerFenceRehearsal provider baseline was not restored",
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

test("retained origin inventory binding is the exact complete 1,292-record v4 artifact", () => {
  assert.deepEqual(productionOriginInventoryBinding(), {
    artifact: FIXED.originInventoryArtifact,
    schemaVersion: "step11-6-production-origin-inventory-v4",
    vercelProjectId: FIXED.vercelProjectId,
    capturedAt: "2026-08-27T01:50:43.767Z",
    providerRecordCount: 1292,
    providerRecordsFingerprint:
      "abd27e4e2747c17053f6debf71ec0f523d39fea8e2383d4911f9dc4b87959cbe",
    recordCount: 1292,
    recordsFingerprint: "9d25299c72424a2b5c3c613649b7f07760fda64c0b0bb4823edaf2cd91622774",
    productionTargetCount: 458,
    projectPreviewCount: 834,
    nullShaCount: 8,
    requiredDeployments: {
      priorLive: "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
      frozenStep11: "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
      step11_6CandidateV1: "dpl_2oK3GmMa8f93wqjHNp1Gp2Y6Paox",
      step11_6CandidateV2: "dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm",
    },
    paginationComplete: true,
    minimumLiveOriginInventoryCount: 1292,
    maximumLiveOriginInventoryCount: 1293,
    fixedAliasOriginCount: 3,
    candidateAliasOriginCount: 1,
    probeVectorCount: 11,
  });
});

test("historical safe-method writer evidence binds the one-path all-method fence", () => {
  assert.deepEqual(productionHistoricalSafeMethodWriterBinding(), {
    artifact: "docs/evidence/step11-6-historical-safe-method-google-writer-v2.json",
    schemaVersion: "step11-6-historical-safe-method-google-writer-v2",
    evidenceFingerprint:
      "6cb2ac60314de617f8c94d5d0814d710ec14b47eb4c49fdfa9662fdbe46fcd69",
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

  const canonicalHostDrift = certifiedManifest();
  canonicalHostDrift.providerQuiesceEvidence.routingRule.canonicalHostname =
    "www.baggerinv.com";
  expectRefusal("PROVIDER_QUIESCE_RULE_INVALID", () =>
    validateManifest(canonicalHostDrift));

  const earlierBypass = certifiedManifest();
  earlierBypass.providerQuiesceEvidence.routingRule
    .earlierActiveBypassRuleCount = 1;
  expectRefusal("PROVIDER_QUIESCE_RULE_INVALID", () =>
    validateManifest(earlierBypass));
});

test("operator binds historical immutable10/current12 scope and pending settlement honestly", () => {
  assert.deepEqual(productionHistoricalWriterScopeBinding(), {
    artifact: "docs/evidence/step11-6-historical-production-google-writer-scope-v1.json",
    schemaVersion: "step11-6-historical-production-google-writer-scope-v1",
    evidenceFingerprint:
      "2f786886f4b0ec4f070757e8e23f462189304c722a015a260852ccd0888527cd",
    canonicalSheetCount: 17,
    canonicalSheetsFingerprint:
      "cf8e81dc38a72501fa87c2178f9a6fe06487dc8eeb3e3091169037941f2d2cb7",
    sourceUnresolvedImmutableOriginCount: 8,
    sourceUnresolvedImmutableOriginsFingerprint:
      "62f14a6635bc9ec16ce681e04b17bbd0f39e9ff55a858bbcb75f4aa75bc3bc4d",
    historicalImmutableOriginCount: 10,
    historicalImmutableOriginsFingerprint:
      "1a687f3ea97d9e9d2fe65e6732be2c1d9b80aa563370338d26a71b23a3ffa12f",
    historicalAliasAwareOriginCount: 12,
    historicalAliasAwareOriginsFingerprint:
      "3bbe7725448889d88678eb79501a3908613f7e3949f6a026e7b4855477540521",
    activeAliasRecordCount: 56,
    activeAliasRecordsFingerprint:
      "c584b50803b59b52e06d8b699afb0cd22b00c980a3f8be0a7b78f7140f98da1a",
    currentUnresolvedAliasCount: 1,
    currentUnresolvedAliasesFingerprint:
      "7b405a5825ff6abb30c24e48aee1681923df549ca47b044e48e8cb0bc83d1aec",
    settlementAcceptedAsPrimaryProof: false,
    unexplainedConcurrencyWindowCount: 1,
  });
});

test("ACL-v2 acceptance rejects OUTCOME_UNKNOWN or a short WAF hold", () => {
  const exact = certifiedManifest();
  assert.equal(productionHistoricalWriterScopeBinding()
    .settlementAcceptedAsPrimaryProof, false);
  assert.equal(productionHistoricalWriterScopeBinding()
    .unexplainedConcurrencyWindowCount, 1);
  assert.equal(exact.aclV2Acceptance.acceptedAsPrimaryProof, true);
  assert.equal(exact.aclV2Acceptance.unexplainedConcurrencyWindowCount, 0);
  assert.equal(exact.aclV2Acceptance.acceptanceFingerprint,
    computeAclV2AcceptanceFingerprint(exact.aclV2Acceptance));
  assertCertifiedReadiness(evaluateReadiness(exact));

  const unknown = certifiedManifest();
  Object.assign(unknown.aclV2Acceptance, {
    forwardDispatchResult: "OUTCOME_UNKNOWN",
    unknownAclDispatchCount: 1,
  });
  unknown.aclV2Acceptance.acceptanceFingerprint =
    computeAclV2AcceptanceFingerprint(unknown.aclV2Acceptance);
  setAclV2AcceptanceArtifactForTest(unknown.aclV2Acceptance);
  bindComputedFingerprints(unknown);
  const unknownReadiness = evaluateReadiness(unknown);
  assert.equal(unknownReadiness.ready, false);
  assert.ok(unknownReadiness.blockers.includes(
    "aclV2Acceptance Drive transitions are not both TARGET_CONFIRMED"));
  assert.ok(unknownReadiness.blockers.includes(
    "aclV2Acceptance contains an OUTCOME_UNKNOWN ACL dispatch"));

  const shortHold = certifiedManifest();
  shortHold.aclV2Acceptance.criticalWindowHeldSeconds =
    FIXED.criticalWindowWafMinimumHoldSeconds - 1;
  shortHold.aclV2Acceptance.acceptanceFingerprint =
    computeAclV2AcceptanceFingerprint(shortHold.aclV2Acceptance);
  setAclV2AcceptanceArtifactForTest(shortHold.aclV2Acceptance);
  bindComputedFingerprints(shortHold);
  assert.ok(evaluateReadiness(shortHold).blockers.includes(
    "aclV2Acceptance critical WAF hold is shorter than 1810 seconds"));

  const forgedFingerprint = certifiedManifest();
  forgedFingerprint.aclV2Acceptance.acceptanceFingerprint = "f".repeat(64);
  setAclV2AcceptanceArtifactForTest(forgedFingerprint.aclV2Acceptance);
  bindComputedFingerprints(forgedFingerprint);
  assert.ok(evaluateReadiness(forgedFingerprint).blockers.includes(
    "aclV2Acceptance.acceptanceFingerprint is unresolved or invalid"));
});

test("ACL-v2 readiness requires the fixed immutable artifact, not a recomputed manifest self-hash", () => {
  const manifest = certifiedManifest();
  const immutableArtifact = copy(manifest.aclV2Acceptance);

  manifest.aclV2Acceptance.oldDeploymentEnforcementPassed = false;
  manifest.aclV2Acceptance.acceptanceFingerprint =
    computeAclV2AcceptanceFingerprint(manifest.aclV2Acceptance);
  bindComputedFingerprints(manifest);

  // Keep the independently loaded fixed-path artifact on the original receipt.
  setAclV2AcceptanceArtifactForTest(immutableArtifact);
  const readiness = evaluateReadiness(manifest);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockers.includes(
    "aclV2Acceptance does not exactly match the immutable repository artifact",
  ));
});

test("ACL-v2 readiness binds candidate SHA A to frozen SHA B through an evidence-only diff", () => {
  const failedDiff = certifiedManifest();
  failedDiff.certification.aclEvidenceOnlyDiffPassed = false;
  bindComputedFingerprints(failedDiff);
  assert.ok(evaluateReadiness(failedDiff).blockers.includes(
    "ACL-v2 rehearsal SHA A to frozen certification SHA B evidence-only diff is not proved",
  ));

  const selfReferential = certifiedManifest();
  selfReferential.certification.aclEvidenceOnlyDiffBaseSha =
    selfReferential.release.frozenSha;
  selfReferential.aclV2Acceptance.rehearsalCandidateSha =
    selfReferential.release.frozenSha;
  selfReferential.aclV2Acceptance.acceptanceFingerprint =
    computeAclV2AcceptanceFingerprint(selfReferential.aclV2Acceptance);
  setAclV2AcceptanceArtifactForTest(selfReferential.aclV2Acceptance);
  bindComputedFingerprints(selfReferential);
  assert.ok(evaluateReadiness(selfReferential).blockers.includes(
    "ACL-v2 rehearsal SHA A to frozen certification SHA B evidence-only diff is not proved",
  ));
});

test("ACL-v2 principal proof must equal the final DORMANT ADMISSION_V3 principal", () => {
  const mismatch = certifiedManifest();
  mismatch.aclV2Acceptance.legacyPrincipalFingerprint = "e".repeat(64);
  mismatch.aclV2Acceptance.acceptanceFingerprint =
    computeAclV2AcceptanceFingerprint(mismatch.aclV2Acceptance);
  setAclV2AcceptanceArtifactForTest(mismatch.aclV2Acceptance);
  bindComputedFingerprints(mismatch);
  assert.ok(evaluateReadiness(mismatch).blockers.includes(
    "legacy principal fingerprint does not bind rehearsal, ACL artifact, and ADMISSION_V3 gate",
  ));
});

test("credential evidence pins the exact reviewed project-wide Preview exception", () => {
  assert.equal(credentialConfinementEvidence.dynamicCandidateContract.cutoverTarget,
    "PREVIEW");
  assert.deepEqual(
    credentialConfinementEvidence.dynamicCandidateContract
      .permittedAdditionScopeClasses,
    ["PROJECT_PREVIEW"],
  );
  const exact = credentialConfinementEvidence.environmentScopeContract
    .reviewedProjectWidePreviewException;
  assert.equal(exactReviewedProjectWidePreviewException(exact), true);

  const extraProjectWideName = copy(exact);
  extraProjectWideName.unshadowedNonsecretProjectWideRecords.push([
    "PRODUCTION_GOOGLE_PRIVATE_KEY", ["preview"], null,
  ]);
  assert.equal(exactReviewedProjectWidePreviewException(extraProjectWideName), false);

  const wrongBranch = copy(exact);
  wrongBranch.requiredSameNameExactCandidateOverrides[0][2] = "unreviewed-branch";
  assert.equal(exactReviewedProjectWidePreviewException(wrongBranch), false);

  const permissive = copy(exact);
  permissive.unreviewedProjectWideRelevantRecordAllowed = true;
  assert.equal(exactReviewedProjectWidePreviewException(permissive), false);
});

test("credential evidence binds the sanitized Vercel environment review epoch", () => {
  const binding = productionCredentialConfinementBinding();
  assert.equal(binding.environmentReviewSchema,
    FIXED.credentialConfinementEnvironmentReviewSchema);
  assert.equal(binding.providerEnvironmentRecordCount,
    FIXED.credentialConfinementProviderEnvironmentRecordCount);
  assert.equal(binding.hiddenProductionEnvironmentRecordCount, 0);
  assert.equal(binding.reviewedEnvironmentRecordCount,
    FIXED.credentialConfinementReviewedEnvironmentRecordCount);
  assert.equal(binding.reviewedEnvironmentRecordsFingerprint,
    FIXED.credentialConfinementReviewedEnvironmentRecordsFingerprint);
  assert.equal(binding.environmentReviewFingerprint,
    FIXED.credentialConfinementEnvironmentReviewFingerprint);
  assert.equal(binding.environmentContinuityFingerprint,
    FIXED.credentialConfinementEnvironmentContinuityFingerprint);
  assert.equal(credentialConfinementEvidence.providerEnvironmentResourceReview
    .providerPlaintextValueReviewPerformed, false);
  assert.equal(credentialConfinementEvidence.providerEnvironmentResourceReview
    .rawValuesRetained, false);
});

test("operator accepts the exact current candidate as a retained zero-addition provider tuple", () => {
  const manifest = certifiedManifest();
  const retainedCandidate = {
    deploymentId: "dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm",
    commit: "0671bb3b84ac5846218ea60838fe4e1cc07de97f",
    immutableOrigin:
      "https://bagger-6lfjugfk7-sandbagger-invitational.vercel.app",
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
    const claim = challenge.signedAttestation.attestation;
    const records = fixtureAliasRecords(
      retainedCandidate.deploymentId,
      manifest.providerQuiesceEvidence.candidateAliasOrigin,
      retainedCandidate.immutableOrigin,
    );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(records)).digest("hex");
    claim.candidateDeploymentId = retainedCandidate.deploymentId;
    claim.candidateDeploymentCommit = retainedCandidate.commit;
    claim.candidateImmutableOrigin = retainedCandidate.immutableOrigin;
    claim.aliasInventoryRecords = records;
    claim.aliasInventoryFingerprint = fingerprint;
    manifest.providerQuiesceEvidence.aliasInventoryFingerprint = fingerprint;
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
  assert.equal(issue.payload.evidenceRequestId, U.step12QuiesceRequest);
  assert.equal(issue.payload.providerAttestationStage, "BEGIN");
  assert.deepEqual(issue.receiptRpcs,
    ["issue_production_vercel_provider_attestation_challenge"]);

  const finalizeManifest = cutoverFenceWindowManifest();
  markQuiesceDraining(finalizeManifest);
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

test("CUTOVER provider and WAF control candidates remain exact Project Preview runtimes", () => {
  const manifest = cutoverFenceWindowManifest();
  for (const challenge of Object.values(manifest.providerAttestationChallenges)) {
    assert.equal(challenge.signedAttestation.attestation.candidateDeploymentTarget,
      "PREVIEW");
    assert.equal(challenge.retainedChallenge.candidateDeploymentTarget, "PREVIEW");
  }
  assert.equal(manifest.wafCriticalEpoch.candidateDeploymentTarget, "PREVIEW");
  manifest.providerQuiesceEvidence.status = "MISSING";
  bindCurrentExecutionFingerprint(manifest);
  assert.doesNotThrow(() => buildOperationEnvelope(
    manifest, "begin-provider-quiesce"));

  const signedProduction = copy(manifest);
  signedProduction.providerAttestationChallenges.begin.signedAttestation
    .attestation.candidateDeploymentTarget = "PRODUCTION";
  bindCurrentExecutionFingerprint(signedProduction);
  assert.throws(() => buildOperationEnvelope(
    signedProduction, "begin-provider-quiesce"), (error) =>
    error.code === "PROVIDER_ATTESTATION_BINDING_MISMATCH");

  const retainedProduction = copy(manifest);
  retainedProduction.providerAttestationChallenges.begin.retainedChallenge
    .candidateDeploymentTarget = "PRODUCTION";
  bindCurrentExecutionFingerprint(retainedProduction);
  assert.throws(() => buildOperationEnvelope(
    retainedProduction, "inspect-begin-provider-attestation-abandonment"), (error) =>
    error.code === "PROVIDER_ATTESTATION_RETAINED_CHALLENGE_MISMATCH");

  const wafProduction = copy(manifest);
  wafProduction.wafCriticalEpoch.candidateDeploymentTarget = "PRODUCTION";
  assert.throws(() => validateManifest(wafProduction), (error) =>
    error.code === "WAF_CRITICAL_EPOCH_TARGET_MISMATCH");
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
  markQuiesceDraining(finalizeManifest);
  bindCurrentExecutionFingerprint(finalizeManifest);
  const abandonFinalize = buildOperationEnvelope(
    finalizeManifest, "abandon-finalize-provider-attestation-challenge",
  );
  assertProviderRoutePayload(abandonFinalize);
  assert.equal(abandonFinalize.payload.providerAttestationStage, "FINALIZE");
  assert.equal(abandonFinalize.payload.evidenceRequestId,
    U.step12QuiesceRequest);
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
    legacyDriveRole: "writer",
    aclDispatchResult: "NOT_DISPATCHED",
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
  assert.equal(first.payload.evidenceRequestId, U.step12QuiesceRequest);
  assert.notEqual(first.payload.evidenceRequestId, first.stableRequestId);
  assert.equal(first.payload.priorEvidenceId, null);
  assert.equal(first.payload.ownerFreezeTtlSeconds, 2100);
  assert.equal(first.payload.ownerAcknowledgedAt, undefined);
  assert.equal(first.payload.ownerFreezeExpiresAt, undefined);
  assert.equal(first.payload.originInventory, undefined);
  assert.equal(first.payload.originInventoryFingerprint, undefined);
  assert.equal(first.originInventoryBinding.recordCount, 1292);
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
  markQuiesceDraining(manifest);
  bindCurrentExecutionFingerprint(manifest);
  const envelope = buildOperationEnvelope(manifest, "finalize-provider-quiesce");
  assertProviderRoutePayload(envelope);
  assert.equal(envelope.payload.quiesceEvidenceId,
    manifest.providerQuiesceEvidence.evidenceId);
  assert.equal(envelope.diagnosticStateGuard.providerPrincipalFingerprint,
    manifest.state.providerPrincipalFingerprint);
  assert.equal(envelope.diagnosticStateGuard.certifiedLegacyPrincipalFingerprint,
    manifest.aclV2Acceptance.legacyPrincipalFingerprint);
  assert.equal(envelope.payload.evidenceRequestId,
    U.step12QuiesceRequest);
  assert.deepEqual(envelope.receiptRpcs,
    ["finalize_production_vercel_writer_quiesce_evidence"]);
  assert.equal(envelope.payload.unresolvedRequestLogCount, undefined);
  assert.equal(envelope.payload.unresolvedGoogleWriteCount, undefined);

  const drainStartedMs = Date.parse(
    manifest.providerQuiesceEvidence.drainStartedAt,
  );
  manifest.providerQuiesceEvidence.drainCompletedAt =
    new Date(drainStartedMs + 299_000).toISOString();
  expectRefusal("PROVIDER_QUIESCE_DRAIN_TOO_SHORT", () =>
    buildOperationEnvelope(manifest, "finalize-provider-quiesce"));
  manifest.providerQuiesceEvidence.drainCompletedAt =
    new Date(drainStartedMs + 300_000).toISOString();
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
  assert.equal(envelope.payload.quiesceEvidenceId,
    manifest.providerQuiesceEvidence.evidenceId);
  assert.deepEqual(envelope.receiptRpcs,
    ["inspect_production_vercel_writer_quiesce_evidence"]);
});

test("persistent provider-fence install exposes the resumable four-stage settlement contract", () => {
  const manifest = cutoverFenceWindowManifest();
  manifest.persistentProviderFence.status = "MISSING";
  manifest.persistentProviderFence.legacyDriveRole = "writer";
  bindCurrentExecutionFingerprint(manifest);
  const envelope = buildOperationEnvelope(manifest,
    "install-persistent-provider-fence");
  assertProviderRoutePayload(envelope);
  assert.equal(envelope.payload.installRequestId,
    manifest.stableRequestIds["install-persistent-provider-fence"]);
  assert.equal(envelope.payload.quiesceEvidenceId,
    manifest.providerQuiesceEvidence.evidenceId);
  assert.equal(envelope.payload.confirmation, FIXED.providerFenceDescription);
  assert.deepEqual(envelope.receiptRpcs, [
    "begin_production_google_writer_provider_fence_install",
    "record_production_google_writer_provider_fence_settlement",
    "record_production_google_writer_provider_fence_settlement",
    "finish_close_production_google_writer_provider_fence_install",
  ]);
  assert.equal(envelope.providerSettlementCheckpoint.stage,
    "AWAITING_ACL_READER_CONFIRMED");
  assert.equal(envelope.providerSettlementCheckpoint.nextOperation,
    "DISPATCH_DRIVE_WRITER_TO_READER_AND_RECORD_TARGET_CONFIRMED");
  assert.equal(envelope.providerSettlementCheckpoint.minimumSecondsAfterAclReaderConfirmed,
    190);
  assert.equal(envelope.providerSettlementCheckpoint.minimumSecondsBetweenReadbacks, 10);
  assert.equal(envelope.providerSettlementCheckpoint.minimumTotalSeconds, 200);
  assert.equal(envelope.providerSettlementCheckpoint.finishAndCloseRpc,
    "finish_close_production_google_writer_provider_fence_install");
});

test("Step 12 accepts only a fresh active CRITICAL_WINDOW epoch and consumes it on restoration", () => {
  const fresh = cutoverFenceWindowManifest();
  const first = buildOperationEnvelope(
    fresh, "install-persistent-provider-fence",
  );
  assert.equal(first.payload.quiesceEvidenceId, U.step12QuiesceEvidence);
  assert.equal(first.providerSettlementCheckpoint.stage,
    "AWAITING_ACL_READER_CONFIRMED");
  assert.equal(fresh.providerQuiesceEvidence.ownerFreezeConfirmation,
    FIXED.cutoverOwnerFreezeConfirmation);

  const wrongPurposeConfirmation = cutoverFenceWindowManifest();
  wrongPurposeConfirmation.providerQuiesceEvidence.ownerFreezeConfirmation =
    FIXED.rehearsalOwnerFreezeConfirmation;
  expectRefusal("PROVIDER_QUIESCE_OWNER_FREEZE_PURPOSE_MISMATCH", () =>
    buildOperationEnvelope(
      wrongPurposeConfirmation, "install-persistent-provider-fence",
    ));

  const wrongRehearsalConfirmation = certifiedManifest();
  wrongRehearsalConfirmation.providerQuiesceEvidence.ownerFreezeConfirmation =
    FIXED.cutoverOwnerFreezeConfirmation;
  expectRefusal("PROVIDER_QUIESCE_OWNER_FREEZE_PURPOSE_MISMATCH", () =>
    validateManifest(wrongRehearsalConfirmation));

  const restoredHistorical = cutoverFenceWindowManifest();
  Object.assign(restoredHistorical.providerQuiesceEvidence, {
    baselineWafRestored: true,
    restoredWafFingerprint:
      restoredHistorical.providerQuiesceEvidence.baselineWafFingerprint,
  });
  bindCurrentExecutionFingerprint(restoredHistorical);
  expectRefusal("PROVIDER_QUIESCE_EPOCH_ALREADY_CONSUMED", () =>
    buildOperationEnvelope(
      restoredHistorical, "install-persistent-provider-fence",
    ));

  const reusedRehearsalId = cutoverFenceWindowManifest();
  reusedRehearsalId.providerQuiesceEvidence.evidenceId = U.quiesceEvidence;
  reusedRehearsalId.persistentProviderFence.quiesceEvidenceId =
    U.quiesceEvidence;
  bindCurrentExecutionFingerprint(reusedRehearsalId);
  expectRefusal("PROVIDER_QUIESCE_HISTORICAL_EPOCH_REUSE_FORBIDDEN", () =>
    buildOperationEnvelope(
      reusedRehearsalId, "install-persistent-provider-fence",
    ));

  const reusedRehearsalRun = cutoverFenceWindowManifest();
  reusedRehearsalRun.persistentProviderFence.installRequestId =
    reusedRehearsalRun.aclV2Acceptance.installRequestId;
  bindCurrentExecutionFingerprint(reusedRehearsalRun);
  expectRefusal("PERSISTENT_PROVIDER_FENCE_HISTORICAL_RUN_REUSE_FORBIDDEN", () =>
    buildOperationEnvelope(
      reusedRehearsalRun, "install-persistent-provider-fence",
    ));

  const principalDrift = cutoverFenceWindowManifest();
  principalDrift.state.providerPrincipalFingerprint = "e".repeat(64);
  bindCurrentExecutionFingerprint(principalDrift);
  expectRefusal("LEGACY_PROVIDER_PRINCIPAL_BINDING_MISMATCH", () =>
    buildOperationEnvelope(
      principalDrift, "install-persistent-provider-fence",
    ));

  const installed = installActiveProviderFenceFixture(
    cutoverFenceWindowManifest(),
  );
  Object.assign(installed.state, {
    admissionState: "CLOSING",
    gateExecutionState: "PAUSED",
    activeClosureId: U.closure,
    activeClosureKind: "LEGACY_ADMISSION",
    activeClosureStatus: "CLOSING",
  });
  bindCurrentExecutionFingerprint(installed);
  const lostResponseFirst = buildOperationEnvelope(
    installed, "install-persistent-provider-fence",
  );
  const lostResponseReplay = buildOperationEnvelope(
    installed, "install-persistent-provider-fence",
  );
  assert.deepEqual(lostResponseReplay, lostResponseFirst);
  assert.equal(lostResponseReplay.providerSettlementCheckpoint.nextOperation,
    "SETTLEMENT_COMPLETE_ADMISSION_CLOSING_DRAIN_REQUIRED");

  const consumedReplay = copy(installed);
  Object.assign(consumedReplay.providerQuiesceEvidence, {
    baselineWafRestored: true,
    restoredWafFingerprint:
      consumedReplay.providerQuiesceEvidence.baselineWafFingerprint,
  });
  bindCurrentExecutionFingerprint(consumedReplay);
  expectRefusal("PROVIDER_QUIESCE_EPOCH_ALREADY_CONSUMED", () =>
    buildOperationEnvelope(
      consumedReplay, "install-persistent-provider-fence",
    ));
});

test("persistent provider-fence install resumes at each durable settlement boundary", () => {
  const aclReader = cutoverFenceWindowManifest();
  Object.assign(aclReader.state, {
    admissionState: "CLOSING",
    gateExecutionState: "PAUSED",
  });
  Object.assign(aclReader.persistentProviderFence, {
    status: "INSTALLING",
    fenceId: U.providerFence,
    legacyDriveRole: "reader",
    legacyDriveCanEdit: false,
    legacyDriveCanShare: false,
    aclDispatchResult: "TARGET_CONFIRMED",
    providerSettlementStage: "ACL_READER_CONFIRMED",
    providerSettlementLatestObservationId: U.aclReaderConfirmedObservation,
    aclReaderConfirmedObservationId: U.aclReaderConfirmedObservation,
    providerSettlementNextEligibleAt: "2026-08-26T10:10:00Z",
    providerSettlementRemainingWaitSeconds: 73,
    settlementStructuralCanaryFingerprint: "d".repeat(64),
  });
  bindCurrentExecutionFingerprint(aclReader);
  const aclEnvelope = buildOperationEnvelope(
    aclReader, "install-persistent-provider-fence",
  );
  assert.equal(aclEnvelope.providerSettlementCheckpoint.stage,
    "ACL_READER_CONFIRMED");
  assert.equal(aclEnvelope.providerSettlementCheckpoint.nextOperation,
    "WAIT_UNTIL_ELIGIBLE_THEN_RECORD_SETTLEMENT_READBACK_1");
  assert.equal(aclEnvelope.providerSettlementCheckpoint.remainingWaitSeconds, 73);

  const readback1 = copy(aclReader);
  Object.assign(readback1.persistentProviderFence, {
    providerSettlementStage: "SETTLEMENT_READBACK_1",
    providerSettlementLatestObservationId: U.settlementReadback1Observation,
    settlementReadback1ObservationId: U.settlementReadback1Observation,
    providerSettlementNextEligibleAt: "2026-08-26T10:10:10Z",
    providerSettlementRemainingWaitSeconds: 4,
  });
  bindCurrentExecutionFingerprint(readback1);
  const readback1Envelope = buildOperationEnvelope(
    readback1, "install-persistent-provider-fence",
  );
  assert.equal(readback1Envelope.providerSettlementCheckpoint.nextOperation,
    "WAIT_UNTIL_ELIGIBLE_THEN_ATOMIC_READBACK_2_FINISH_AND_CLOSE");

  const installed = installActiveProviderFenceFixture(cutoverFenceWindowManifest());
  Object.assign(installed.state, {
    admissionState: "CLOSING",
    gateExecutionState: "PAUSED",
    activeClosureId: U.closure,
    activeClosureKind: "LEGACY_ADMISSION",
    activeClosureStatus: "CLOSING",
  });
  bindCurrentExecutionFingerprint(installed);
  const lostResponse = buildOperationEnvelope(
    installed, "install-persistent-provider-fence",
  );
  assert.equal(lostResponse.providerSettlementCheckpoint.stage,
    "SETTLEMENT_READBACK_2");
  assert.equal(lostResponse.providerSettlementCheckpoint.nextOperation,
    "SETTLEMENT_COMPLETE_ADMISSION_CLOSING_DRAIN_REQUIRED");
  assert.equal(lostResponse.providerSettlementCheckpoint.admissionCloseCommitted, true);

  const staleOpen = copy(aclReader);
  Object.assign(staleOpen.state, { admissionState: "OPEN", gateExecutionState: "OPEN" });
  bindCurrentExecutionFingerprint(staleOpen);
  expectRefusal("ADMISSION_STATE_MISMATCH", () => buildOperationEnvelope(
    staleOpen, "install-persistent-provider-fence",
  ));
});

test("persistent provider-fence install abort is exact, resumable, and fail-closed", () => {
  const manifest = cutoverFenceWindowManifest();
  manifest.stableRequestIds["abort-persistent-provider-fence-install"] =
    U.providerFenceAbort;
  Object.assign(manifest.state, {
    admissionState: "CLOSING",
    gateExecutionState: "PAUSED",
  });
  Object.assign(manifest.persistentProviderFence, {
    status: "INSTALLING",
    fenceId: U.providerFence,
    abortRequestId: U.providerFenceAbort,
    legacyDriveRole: "reader",
    legacyDriveCanEdit: false,
    legacyDriveCanShare: false,
    aclDispatchResult: "TARGET_CONFIRMED",
    providerSettlementStage: "ACL_READER_CONFIRMED",
    providerSettlementLatestObservationId: U.aclReaderConfirmedObservation,
    aclReaderConfirmedObservationId: U.aclReaderConfirmedObservation,
    providerSettlementNextEligibleAt: "2026-08-26T10:10:00Z",
    providerSettlementRemainingWaitSeconds: 73,
    settlementStructuralCanaryFingerprint: "d".repeat(64),
  });
  bindCurrentExecutionFingerprint(manifest);
  const envelope = buildOperationEnvelope(
    manifest, "abort-persistent-provider-fence-install",
  );
  assertProviderRoutePayload(envelope);
  assert.equal(envelope.payload.operationRequestId, U.providerFenceAbort);
  assert.equal(envelope.payload.installRequestId,
    manifest.persistentProviderFence.installRequestId);
  assert.equal(envelope.payload.fenceId, U.providerFence);
  assert.equal(envelope.payload.expectedBaselineFingerprint,
    manifest.persistentProviderFence.expectedBaselineFingerprint);
  assert.equal(envelope.payload.confirmation,
    FIXED.providerFenceAbortConfirmation);
  assert.deepEqual(envelope.receiptRpcs, [
    "abort_production_google_writer_provider_fence_install",
    "inspect_production_google_writer_provider_fence",
  ]);

  const staleOpen = copy(manifest);
  Object.assign(staleOpen.state, {
    admissionState: "OPEN",
    gateExecutionState: "OPEN",
  });
  bindCurrentExecutionFingerprint(staleOpen);
  expectRefusal("PERSISTENT_PROVIDER_FENCE_ABORT_NOT_SAFE", () =>
    buildOperationEnvelope(staleOpen,
      "abort-persistent-provider-fence-install"));

  const advanced = copy(manifest);
  advanced.state.preparedEpochId = U.epoch;
  bindCurrentExecutionFingerprint(advanced);
  expectRefusal("PERSISTENT_PROVIDER_FENCE_ABORT_NOT_SAFE", () =>
    buildOperationEnvelope(advanced,
      "abort-persistent-provider-fence-install"));

  const recovered = copy(manifest);
  Object.assign(recovered.state, {
    admissionState: "OPEN",
    gateExecutionState: "OPEN",
  });
  Object.assign(recovered.persistentProviderFence, {
    status: "FAILED",
    abortRestorationEvidenceFingerprint: "e".repeat(64),
  });
  bindCurrentExecutionFingerprint(recovered);
  const replay = buildOperationEnvelope(
    recovered, "abort-persistent-provider-fence-install",
  );
  assert.equal(replay.payload.operationRequestId, U.providerFenceAbort);
  assert.equal(replay.payload.confirmation,
    FIXED.providerFenceAbortConfirmation);
});

test("persistent provider-fence inspection supports baseline and active durable lookup", () => {
  const baseline = certifiedManifest();
  baseline.execution.step12OwnerAuthorizationRecorded = false;
  baseline.persistentProviderFence.status = "MISSING";
  baseline.persistentProviderFence.legacyDriveRole = "writer";
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

test("OUTCOME_UNKNOWN Drive ACL dispatch is inspectable but never retryable or reversible", () => {
  const manifest = cutoverFenceWindowManifest();
  Object.assign(manifest.state, {
    admissionState: "CLOSING",
    gateExecutionState: "PAUSED",
  });
  Object.assign(manifest.persistentProviderFence, {
    status: "FAILED",
    fenceId: U.providerFence,
    currentVerificationId: U.providerFenceVerification,
    legacyDriveRole: "writer",
    legacyDriveCanEdit: true,
    legacyDriveCanShare: true,
    aclDispatchResult: "OUTCOME_UNKNOWN",
    aclUnknownDispatchCount: 1,
    providerSettlementStage: "AWAITING_ACL_READER_CONFIRMED",
  });
  manifest.execution.step12OwnerAuthorizationRecorded = false;
  bindCurrentExecutionFingerprint(manifest);
  const inspect = buildOperationEnvelope(
    manifest, "inspect-persistent-provider-fence",
  );
  assert.equal(inspect.kind, "provider-read-only-payload");
  assert.equal(inspect.diagnosticStateGuard.aclDispatchResult, "OUTCOME_UNKNOWN");
  assert.equal(inspect.providerSettlementCheckpoint.aclDispatchRetryAllowed, false);

  manifest.execution.step12OwnerAuthorizationRecorded = true;
  bindCurrentExecutionFingerprint(manifest);
  expectRefusal("ACL_DISPATCH_UNKNOWN_NO_RETRY", () =>
    buildOperationEnvelope(manifest, "install-persistent-provider-fence"));
  expectRefusal("ACL_DISPATCH_UNKNOWN_NO_RETRY", () =>
    buildOperationEnvelope(manifest, "abort-persistent-provider-fence-install"));
});

test("persistent provider-fence refresh requires a new verified quiesce record", () => {
  const manifest = activeProviderFenceManifest();
  expectRefusal("PERSISTENT_PROVIDER_FENCE_REFRESH_EVIDENCE_NOT_NEW", () =>
    buildOperationEnvelope(manifest, "refresh-persistent-provider-fence"));

  manifest.providerQuiesceEvidence.priorEvidenceId = U.step12QuiesceEvidence;
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
  assert.equal(envelope.payload.quiesceEvidenceId,
    manifest.providerQuiesceEvidence.evidenceId);
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
  rehearsalDrift.providerFenceRehearsal.restoredProviderFingerprint = "f".repeat(64);
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

  const writerCapabilityDrift = certifiedManifest();
  writerCapabilityDrift.persistentProviderFence.legacyDriveCanShare = false;
  bindComputedFingerprints(writerCapabilityDrift);
  expectRefusal("STEP11_6_PROVIDER_FENCE_NOT_RESTORED", () =>
    buildOperationEnvelope(writerCapabilityDrift, "stage-release"));

  const principalDrift = certifiedManifest();
  principalDrift.state.providerPrincipalFingerprint = "e".repeat(64);
  bindComputedFingerprints(principalDrift);
  expectRefusal("STEP11_6_PROVIDER_PRINCIPAL_NOT_RESTORED", () =>
    buildOperationEnvelope(principalDrift, "stage-release"));
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
  assert.equal(envelope.payload.quiesce_evidence_id,
    manifest.providerQuiesceEvidence.evidenceId);
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
  assert.equal(envelope.payload.quiesce_evidence_id,
    manifest.providerQuiesceEvidence.evidenceId);
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
  assert.equal(envelope.payload.quiesce_evidence_id,
    closedManifest().providerQuiesceEvidence.evidenceId);
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
  assert.equal(envelope.payload.quiesce_evidence_id,
    manifest.providerQuiesceEvidence.evidenceId);
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
