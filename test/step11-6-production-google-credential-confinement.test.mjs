import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT,
  productionGoogleCredentialConfinementEvidence,
} from "../lib/production-google-credential-confinement.js";
import {
  buildCredentialConfinementEvidenceV2,
  CREDENTIAL_CONFINEMENT_SCHEMA_V2,
  ORIGIN_INVENTORY_SCHEMA_V3,
  verifyCredentialConfinementEvidence,
} from "../tools/step11-6-operator/generate-credential-confinement-evidence.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function v3CredentialInventoryFixture() {
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
    schemaVersion: ORIGIN_INVENTORY_SCHEMA_V3,
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

test("v2 credential confinement classifies the complete v3 provider inventory conservatively", () => {
  const evidence = verifyCredentialConfinementEvidence();
  assert.equal(evidence.classificationRecordCount,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT);
  assert.equal(evidence.classificationRecordsFingerprint,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT);
  assert.equal(evidence.evidenceFingerprint,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT);
  assert.equal(evidence.gitObjectAudit.retainedNonNullRecordCount, 1283);
  assert.equal(evidence.gitObjectAudit.retainedUniqueCommitCount, 1223);
  assert.equal(evidence.gitObjectAudit.auditedUniqueCommitCount, 1220);
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
  assert.equal(evidence.classifications.projectPreviewDedicatedMetadataReadOnly.recordCount, 16);
  assert.equal(evidence.classifications.nullShaLegacyWriterCapable.recordCount, 5);
  assert.equal(
    evidence.classifications.gitObjectUnavailableLegacyWriterCapable.recordCount,
    3,
  );
  assert.equal(evidence.classifications.providerBlockedNonExecutable.recordCount, 3);
  assert.equal(evidence.canonicalMutationRouteAudit.deploymentFileVersionCount, 4774);
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
});

test("runtime loader binds the same immutable v2 evidence and conservative unknowns", () => {
  const evidence = productionGoogleCredentialConfinementEvidence();
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.allMethodFenceRequiredHosts), true);
  assert.equal(Object.isFrozen(evidence.allMethodFenceRequiredHosts.origins), true);
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
});

test("v2 evidence binds both v3 tuple fingerprints and treats every non-blocked null SHA as writer-capable", () => {
  const inventory = v3CredentialInventoryFixture();
  const evidence = buildCredentialConfinementEvidenceV2(inventory);
  assert.equal(evidence.schemaVersion, CREDENTIAL_CONFINEMENT_SCHEMA_V2);
  assert.equal(evidence.originInventorySchemaVersion, ORIGIN_INVENTORY_SCHEMA_V3);
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

test("v2 evidence rejects provider/projection drift before credential classification", () => {
  const inventory = v3CredentialInventoryFixture();
  inventory.records[0][4] = "READY";
  inventory.recordsFingerprint = sha256(JSON.stringify(inventory.records));
  assert.throws(() => buildCredentialConfinementEvidenceV2(inventory),
    /did not match its exact projection/);
});
