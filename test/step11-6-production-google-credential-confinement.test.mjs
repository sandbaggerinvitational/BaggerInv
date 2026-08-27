import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT,
  productionGoogleCredentialConfinementEvidence,
} from "../lib/production-google-credential-confinement.js";
import {
  buildCredentialConfinementEvidenceV3,
  captureCredentialConfinementProviderEnvironmentReview,
  CREDENTIAL_CONFINEMENT_SCHEMA_V4,
  CREDENTIAL_CONFINEMENT_CANDIDATE_BRANCH,
  CREDENTIAL_CONFINEMENT_REVIEWED_SHADOWED_PROJECT_WIDE_PREVIEW_NAMES,
  CREDENTIAL_CONFINEMENT_REVIEWED_UNSHADOWED_NONSECRET_PREVIEW_NAMES,
  CREDENTIAL_CONFINEMENT_SCHEMA_V3,
  CREDENTIAL_CONFINEMENT_VERCEL_TEAM_ID,
  ORIGIN_INVENTORY_SCHEMA_V4,
  verifyCredentialConfinementEvidence,
} from "../tools/step11-6-operator/generate-credential-confinement-evidence.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("the three legacy evidence artifacts remain byte-for-byte immutable", () => {
  const originBytes = readFileSync(new URL(
    "../docs/evidence/step11-6-production-origin-inventory.json",
    import.meta.url,
  ));
  const historicalBytes = readFileSync(new URL(
    "../docs/evidence/step11-6-historical-safe-method-google-writer.json",
    import.meta.url,
  ));
  const confinementBytes = readFileSync(new URL(
    "../docs/evidence/step11-6-production-google-credential-confinement.json",
    import.meta.url,
  ));
  assert.equal(sha256(originBytes),
    "e3162bd5ea8cc5ca732527fcd91f04ac17d9562e3bfedaf11a7085ce10bc8d9f");
  assert.equal(sha256(historicalBytes),
    "a1bbe0b4d948e2e593551f01b3b1cfc72e69a09fbc473f9a1063b84712f00efc");
  assert.equal(sha256(confinementBytes),
    "a58ded8a791c40d6b6ea9ddccefca992a5e1c5df9c692a6c4ba805c3e73459af");

  const origin = JSON.parse(originBytes);
  assert.equal(origin.schemaVersion, "step11-6-production-origin-inventory-v3");
  assert.equal(origin.recordCount, 1291);
  assert.equal(origin.providerRecordCount, 1291);
  assert.equal(origin.recordsFingerprint,
    "d238c5eeefef4606e0a05c2d0dbcee1a2b29cd07a2dd480435c0e75a0c3a91a6");
  assert.equal(origin.providerRecordsFingerprint,
    "6488da5c86e50bd0c524a94a8c8f97c1aeb8576393fc14d68a7bd76ebe338692");

  const historical = JSON.parse(historicalBytes);
  assert.equal(historical.schemaVersion,
    "step11-6-historical-safe-method-google-writer-v1");
  assert.equal(historical.originInventoryProviderRecordCount, 1291);
  assert.equal(historical.originInventoryProviderRecordsFingerprint,
    "6488da5c86e50bd0c524a94a8c8f97c1aeb8576393fc14d68a7bd76ebe338692");
  assert.equal(historical.historicalSafeMethodWriter.affectedReadyDeploymentCount, 236);
  assert.equal(historical.evidenceFingerprint,
    "6bf411a2e119e8552e6b3ac9ac51d8828e9fc853e5c43069dc40c31a6e794f28");

  const confinement = JSON.parse(confinementBytes);
  assert.equal(confinement.schemaVersion,
    "step11-6-production-google-credential-confinement-v2");
  assert.equal(confinement.classificationRecordCount, 1291);
  assert.equal(confinement.classificationRecordsFingerprint,
    "9ce65239f41086f56ea126e2491afe36ae90e85172a8536706f549912b27979b");
  assert.equal(confinement.evidenceFingerprint,
    "071ca9163f6a1033e17136ace4c82b3163aa7a1c29900300ddafeeda5b7bb133");
});

function v4CredentialInventoryFixture() {
  const providerRecords = [
    [
      "dpl_V3BlockedNull01", null,
      null, "https://bagger-v3-blocked-null.vercel.app",
      "PREVIEW", null, "CLI", "BLOCKED", "2026-08-26T14:00:00.000Z",
      "UNAVAILABLE",
    ],
    [
      "dpl_V3ErrorNull001", null,
      null, "https://bagger-v3-error-null.vercel.app",
      "PREVIEW", null, "CLI", "ERROR", "2026-08-26T14:01:00.000Z",
      "UNAVAILABLE",
    ],
    [
      "dpl_V3MissingGit01",
      "ffffffffffffffffffffffffffffffffffffffff",
      "ffffffffffffffffffffffffffffffffffffffff",
      "https://bagger-v3-missing-git.vercel.app", "PREVIEW",
      "feature/missing-git-object", "GIT", "READY",
      "2026-08-26T14:01:30.000Z", "EXACT_PROVIDER",
    ],
    [
      "dpl_V3PreviewGit01",
      "be5531faca009e26617496e47831f365a1b4997b",
      "be5531faca009e26617496e47831f365a1b4997b",
      "https://bagger-v3-preview-git.vercel.app", "PREVIEW",
      "feature/mock-tournament-qa-integration", "GIT", "READY",
      "2026-08-26T14:02:00.000Z", "EXACT_PROVIDER",
    ],
    [
      "dpl_V3Production01",
      "561a61946be3536c7e32b46be53e4683cbb45579",
      "561a61946be3536c7e32b46be53e4683cbb45579",
      "https://bagger-v3-production.vercel.app", "PRODUCTION", "main", "GIT",
      "READY", "2026-08-26T14:03:00.000Z", "EXACT_PROVIDER",
    ],
    [
      "dpl_V3ReadyNull001", null,
      null, "https://bagger-v3-ready-null.vercel.app",
      "PREVIEW", null, "CLI", "READY", "2026-08-26T14:04:00.000Z",
      "UNAVAILABLE",
    ],
  ];
  const records = providerRecords.map((providerRecord) => [
    providerRecord[0], providerRecord[1], providerRecord[3],
    providerRecord[4] === "PRODUCTION" ? "PRODUCTION_TARGET" : "PROJECT_PREVIEW",
    providerRecord[7], sha256(JSON.stringify([
      providerRecord[2], providerRecord[4], providerRecord[5], providerRecord[6],
      providerRecord[8], providerRecord[9],
    ])),
  ]);
  return {
    schemaVersion: ORIGIN_INVENTORY_SCHEMA_V4,
    providerRecordTuple: [
      "deploymentId", "sha", "providerCommitSha", "origin", "deploymentTarget",
      "gitBranch", "providerSource", "deploymentStatus", "createdAt",
      "shaResolution",
    ],
    recordTuple: [
      "deploymentId", "sha", "origin", "scopeClass", "deploymentStatus",
      "providerMetadataFingerprint",
    ],
    providerRecordsFingerprint: sha256(JSON.stringify(providerRecords)),
    providerRecordCount: providerRecords.length,
    recordCount: records.length,
    recordsFingerprint: sha256(JSON.stringify(records)),
    providerRecords,
    records,
  };
}

test("v4 credential confinement classifies the complete provider and environment inventories", () => {
  const evidence = verifyCredentialConfinementEvidence();
  assert.equal(evidence.schemaVersion, CREDENTIAL_CONFINEMENT_SCHEMA_V4);
  assert.equal(evidence.classificationRecordCount,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT);
  assert.equal(evidence.classificationRecordsFingerprint,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT);
  assert.equal(evidence.evidenceFingerprint,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT);
  assert.equal(evidence.gitObjectAudit.retainedNonNullRecordCount, 1284);
  assert.equal(evidence.gitObjectAudit.retainedUniqueCommitCount, 1224);
  assert.equal(evidence.gitObjectAudit.auditedUniqueCommitCount, 1221);
  assert.equal(evidence.gitObjectAudit.missingCommitCount, 3);
  assert.deepEqual(evidence.gitObjectAudit.missingCommits, [
    "07685fc6f9e6db05c103493eb34e35425023aa42",
    "87d9661818b335a00dfe5f12dbc96531bf005ace",
    "fd3e2d11b19cc15c6120e2990c0b2c3dbcf95785",
  ]);
  assert.equal(evidence.classifications.productionTargetLegacyOnly.recordCount, 458);
  assert.equal(evidence.classifications.projectPreviewLegacyOnly.recordCount, 787);
  assert.equal(evidence.classifications
    .projectPreviewDedicatedProductionEnvironmentDenied.recordCount, 19);
  assert.equal(evidence.classifications.projectPreviewDedicatedMetadataReadOnly.recordCount, 17);
  assert.equal(evidence.classifications.nullShaLegacyWriterCapable.recordCount, 5);
  assert.equal(
    evidence.classifications.gitObjectUnavailableLegacyWriterCapable.recordCount,
    3,
  );
  assert.equal(evidence.classifications.providerBlockedNonExecutable.recordCount, 3);
  assert.equal(evidence.canonicalMutationRouteAudit.deploymentFileVersionCount, 4780);
  assert.equal(evidence.canonicalMutationRouteAudit.dedicatedWriterMarkerMatchCount, 0);
  assert.equal(evidence.allMethodFenceRequiredHosts.count, 8);
  assert.deepEqual(evidence.allMethodFenceRequiredHosts.origins, [
    "https://bagger-1w07if9d1-sandbagger-invitational.vercel.app",
    "https://bagger-60ah92b8c-sandbagger-invitational.vercel.app",
    "https://bagger-6nrmyunec-sandbagger-invitational.vercel.app",
    "https://bagger-b8ob0hjnu-sandbagger-invitational.vercel.app",
    "https://bagger-f64olgv1h-sandbagger-invitational.vercel.app",
    "https://bagger-h0eycprri-sandbagger-invitational.vercel.app",
    "https://bagger-kh2m1cy6h-sandbagger-invitational.vercel.app",
    "https://bagger-kj3c0pkvm-sandbagger-invitational.vercel.app",
  ]);
  assert.equal(evidence.allMethodFenceRequiredHosts.fingerprint,
    "62f14a6635bc9ec16ce681e04b17bbd0f39e9ff55a858bbcb75f4aa75bc3bc4d");
  const exception = evidence.environmentScopeContract
    .reviewedProjectWidePreviewException;
  assert.deepEqual(exception.recordTuple, ["name", "targets", "gitBranch"]);
  assert.deepEqual(exception.shadowedProjectWideRecords,
    CREDENTIAL_CONFINEMENT_REVIEWED_SHADOWED_PROJECT_WIDE_PREVIEW_NAMES.map(
      (name) => [name, ["preview"], null],
    ));
  assert.deepEqual(exception.requiredSameNameExactCandidateOverrides,
    CREDENTIAL_CONFINEMENT_REVIEWED_SHADOWED_PROJECT_WIDE_PREVIEW_NAMES.map(
      (name) => [name, ["preview"], CREDENTIAL_CONFINEMENT_CANDIDATE_BRANCH],
    ));
  assert.deepEqual(exception.unshadowedNonsecretProjectWideRecords,
    CREDENTIAL_CONFINEMENT_REVIEWED_UNSHADOWED_NONSECRET_PREVIEW_NAMES.map(
      (name) => [name, ["preview"], null],
    ));
  assert.equal(exception.unreviewedProjectWideRelevantRecordAllowed, false);
  assert.equal(exception.wrongBranchRelevantRecordAllowed, false);
  assert.equal(evidence.providerEnvironmentResourceReview.providerEnvironmentRecordCount, 121);
  assert.equal(evidence.providerEnvironmentResourceReview.hiddenProductionEnvCount, 0);
  assert.equal(evidence.providerEnvironmentResourceReview.recordCount, 12);
  assert.equal(evidence.providerEnvironmentResourceReview.recordsFingerprint,
    "b7d8cdd805ecbaa05b39b71aec9d904b3df8a0077a38e2adc8762312d3cf4d8a");
  assert.equal(evidence.providerEnvironmentResourceReview.reviewFingerprint,
    "eae8a72c03308c75d8eea8b330e798b316842a6a3f05791c7acec1f0f1a2dd54");
  assert.equal(evidence.providerEnvironmentResourceReview
    .providerPlaintextValueReviewPerformed, false);
  assert.equal(evidence.providerEnvironmentResourceReview
    .providerCiphertextWhereExposedAndVersionContinuityRequired, true);
  assert.equal(evidence.environmentScopeContract.providerEnvironmentResourceReview
    .exactProviderMetadataRequired, true);
  assert.equal(evidence.environmentScopeContract.providerEnvironmentResourceReview
    .ciphertextHashRequiredWhereProviderExposesCiphertext, true);
  assert.equal(evidence.environmentScopeContract.providerEnvironmentResourceReview
    .sensitiveRedactedRecordsUseExactVersionMetadata, true);
  assert.equal(evidence.dynamicCandidateContract.rehearsalTarget, "PREVIEW");
  assert.equal(evidence.dynamicCandidateContract.cutoverTarget, "PREVIEW");
  assert.deepEqual(evidence.dynamicCandidateContract.permittedAdditionScopeClasses,
    ["PROJECT_PREVIEW"]);
});

test("runtime loader binds the same immutable v4 evidence and conservative unknowns", () => {
  const evidence = productionGoogleCredentialConfinementEvidence();
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.allMethodFenceRequiredHosts), true);
  assert.equal(Object.isFrozen(evidence.allMethodFenceRequiredHosts.origins), true);
  assert.equal(Object.isFrozen(evidence.environmentScopeContract
    .reviewedProjectWidePreviewException), true);
  assert.equal(Object.isFrozen(evidence.providerEnvironmentResourceReview), true);
  const blocked = evidence.classifications.providerBlockedNonExecutable.deployments
    .find((record) => record.deploymentId === "dpl_J4BFkTk2pqPeWxdUFxwQdRZJ9xCR");
  assert.ok(blocked);
  assert.equal(blocked.deploymentId, "dpl_J4BFkTk2pqPeWxdUFxwQdRZJ9xCR");
  assert.equal(blocked.deploymentStatus, "BLOCKED");
  assert.equal(blocked.shaResolution, "UNAVAILABLE");
  assert.equal(evidence.classifications.nullShaLegacyWriterCapable.recordCount, 5);
  assert.equal(
    evidence.classifications.gitObjectUnavailableLegacyWriterCapable.recordCount,
    3,
  );
  assert.equal(evidence.dynamicCandidateContract.differentShaAdditionAllowed, false);
  assert.equal(evidence.dynamicCandidateContract.arbitraryProductionTargetAdditionAllowed, false);
  assert.equal(evidence.dynamicCandidateContract.cutoverTarget, "PREVIEW");
  assert.deepEqual(evidence.dynamicCandidateContract.permittedAdditionScopeClasses,
    ["PROJECT_PREVIEW"]);
});

test("trusted provider capture is pinned to the exact linked Vercel team", () => {
  assert.equal(CREDENTIAL_CONFINEMENT_VERCEL_TEAM_ID,
    "team_kPw5zaib8uaQJALAwj4fWI6R");
  let called = false;
  assert.throws(() => captureCredentialConfinementProviderEnvironmentReview({
    teamId: "team_NotTheProductionTeam01",
    readProviderJson: () => { called = true; },
  }), /exact Vercel team identity/);
  assert.equal(called, false);
});

test("v3 evidence binds both v4 tuple fingerprints and treats every non-blocked null SHA as writer-capable", () => {
  const inventory = v4CredentialInventoryFixture();
  const evidence = buildCredentialConfinementEvidenceV3(inventory);
  assert.equal(evidence.schemaVersion, CREDENTIAL_CONFINEMENT_SCHEMA_V3);
  assert.equal(evidence.originInventorySchemaVersion, ORIGIN_INVENTORY_SCHEMA_V4);
  assert.equal(evidence.originInventoryRecordCount, 6);
  assert.equal(evidence.originInventoryFingerprint, inventory.recordsFingerprint);
  assert.equal(evidence.originInventoryProviderRecordCount, 6);
  assert.equal(evidence.originInventoryProviderRecordsFingerprint,
    inventory.providerRecordsFingerprint);
  assert.deepEqual(evidence.classificationRecordTuple, [
    "deploymentId", "sha", "origin", "deploymentStatus", "classification",
  ]);
  assert.equal(evidence.classificationRecordCount, 6);
  assert.equal(evidence.gitObjectAudit.retainedNonNullRecordCount, 3);
  assert.equal(evidence.gitObjectAudit.retainedUniqueCommitCount, 3);
  assert.equal(evidence.gitObjectAudit.auditedUniqueCommitCount, 2);
  assert.equal(evidence.gitObjectAudit.missingCommitCount, 1);
  assert.deepEqual(evidence.gitObjectAudit.missingCommits,
    ["ffffffffffffffffffffffffffffffffffffffff"]);
  assert.equal(evidence.gitObjectAudit.nullShaRecordCount, 3);
  assert.equal(evidence.gitObjectAudit.nullShaWriterCapableRecordCount, 2);
  assert.equal(evidence.gitObjectAudit.nullShaProviderBlockedRecordCount, 1);
  assert.equal(evidence.classifications.productionTargetLegacyOnly.recordCount, 1);
  assert.equal(evidence.classifications.projectPreviewDedicatedMetadataReadOnly.recordCount, 1);
  assert.equal(evidence.classifications.nullShaLegacyWriterCapable.recordCount, 2);
  assert.equal(evidence.dynamicCandidateContract.cutoverTarget, "PRODUCTION");
  assert.deepEqual(evidence.dynamicCandidateContract.permittedAdditionScopeClasses,
    ["PROJECT_PREVIEW", "PRODUCTION_TARGET"]);
  assert.equal(
    evidence.classifications.gitObjectUnavailableLegacyWriterCapable.recordCount,
    1,
  );
  assert.deepEqual(
    evidence.classifications.nullShaLegacyWriterCapable.deployments
      .map((record) => [record.deploymentId, record.deploymentStatus]),
    [
      ["dpl_V3ErrorNull001", "ERROR"],
      ["dpl_V3ReadyNull001", "READY"],
    ],
  );
  assert.deepEqual(
    evidence.classifications.providerBlockedNonExecutable.deployments
      .map((record) => [record.deploymentId, record.deploymentStatus]),
    [["dpl_V3BlockedNull01", "BLOCKED"]],
  );
  assert.equal(evidence.canonicalMutationRouteAudit.deploymentFileRequestCount, 12);
  assert.equal(evidence.canonicalMutationRouteAudit.nullShaRoutesUnauditableRecordCount, 3);
  assert.equal(
    evidence.canonicalMutationRouteAudit.gitObjectUnavailableRoutesUnauditableRecordCount,
    1,
  );
  assert.equal(evidence.canonicalMutationRouteAudit.dedicatedWriterMarkerMatchCount, 0);
  assert.deepEqual(evidence.allMethodFenceRequiredHosts, {
    origins: [
      "https://bagger-v3-missing-git.vercel.app",
      "https://bagger-v3-ready-null.vercel.app",
    ],
    count: 2,
    fingerprint: sha256(JSON.stringify([
      "https://bagger-v3-missing-git.vercel.app",
      "https://bagger-v3-ready-null.vercel.app",
    ])),
    policy: "READY_NULL_SHA_OR_GIT_OBJECT_UNAVAILABLE_REQUIRES_ALL_METHOD_PROVIDER_FENCE",
  });
  assert.equal(evidence.providerInventoryContract.oneToOneProjection, true);
  assert.equal(evidence.providerInventoryContract.nullShaNonBlockedPolicy,
    "LEGACY_PRINCIPAL_WRITER_CAPABLE");
  assert.equal(evidence.evidenceFingerprint.length, 64);
});

test("v3 evidence rejects provider/projection drift before credential classification", () => {
  const inventory = v4CredentialInventoryFixture();
  inventory.records[0][4] = "READY";
  inventory.recordsFingerprint = sha256(JSON.stringify(inventory.records));
  assert.throws(() => buildCredentialConfinementEvidenceV3(inventory),
    /did not match its exact projection/);
});
