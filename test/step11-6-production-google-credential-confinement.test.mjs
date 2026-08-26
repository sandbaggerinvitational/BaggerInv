import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT,
  productionGoogleCredentialConfinementEvidence,
} from "../lib/production-google-credential-confinement.js";
import {
  verifyCredentialConfinementEvidence,
} from "../tools/step11-6-operator/generate-credential-confinement-evidence.mjs";

test("historical credential confinement classifies all retained origins from exact Git/provider proof", () => {
  const evidence = verifyCredentialConfinementEvidence();
  assert.equal(evidence.classificationRecordCount,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT);
  assert.equal(evidence.classificationRecordsFingerprint,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT);
  assert.equal(evidence.evidenceFingerprint,
    PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT);
  assert.equal(evidence.gitObjectAudit.retainedNonNullRecordCount, 1139);
  assert.equal(evidence.gitObjectAudit.retainedUniqueCommitCount, 1090);
  assert.equal(evidence.gitObjectAudit.missingCommitCount, 0);
  assert.equal(evidence.classifications.mainProductionLegacyOnly.recordCount, 458);
  assert.equal(evidence.classifications.featurePreviewLegacyOnly.recordCount, 654);
  assert.equal(evidence.classifications
    .featurePreviewDedicatedProductionEnvironmentDenied.recordCount, 19);
  assert.equal(evidence.classifications.featurePreviewDedicatedMetadataReadOnly.recordCount, 8);
  assert.equal(evidence.classifications.providerBlockedNonExecutable.recordCount, 1);
  assert.equal(evidence.canonicalMutationRouteAudit.deploymentFileVersionCount, 4256);
  assert.equal(evidence.canonicalMutationRouteAudit.dedicatedWriterMarkerMatchCount, 0);
});

test("runtime loader binds the same immutable evidence and non-executable null-SHA proof", () => {
  const evidence = productionGoogleCredentialConfinementEvidence();
  const blocked = evidence.classifications.providerBlockedNonExecutable.deployments[0];
  assert.equal(blocked.deploymentId, "dpl_J4BFkTk2pqPeWxdUFxwQdRZJ9xCR");
  assert.equal(blocked.deploymentStatus, "BLOCKED");
  assert.equal(blocked.buildsCount, 0);
  assert.equal(blocked.functionsCount, 0);
  assert.equal(blocked.aliasCount, 0);
  assert.equal(evidence.dynamicCandidateContract.differentShaAdditionAllowed, false);
  assert.equal(evidence.dynamicCandidateContract.arbitraryMainProductionAdditionAllowed, false);
});
