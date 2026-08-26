import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA =
  "step11-6-production-google-credential-confinement-v1";
export const PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT = 1_140;
export const PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT =
  "c63962703a60745786ffce2e43e9fef5fa38e12746fce5627f33bfde92c8f508";
export const PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT =
  "1d6f4203fc56226ba4f6881339e9b2dfcede0e413485a110785d28e066a569df";

const HEX64 = /^[0-9a-f]{64}$/;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys) => value && typeof value === "object" &&
  !Array.isArray(value) && Object.keys(value).sort().join("\n") ===
  [...keys].sort().join("\n");

let cachedEvidence;

export function productionGoogleCredentialConfinementEvidence() {
  if (cachedEvidence) return cachedEvidence;
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(new URL(
      "../docs/evidence/step11-6-production-google-credential-confinement.json",
      import.meta.url,
    ), "utf8"));
  } catch {
    throw new Error("The Production Google credential-confinement evidence is unavailable.");
  }
  const { evidenceFingerprint, ...base } = evidence;
  const classifications = evidence.classifications;
  const classificationTotal = classifications && Object.values(classifications)
    .reduce((total, record) => total + Number(record?.recordCount || 0), 0);
  const blocked = classifications?.providerBlockedNonExecutable?.deployments;
  if (!exactKeys(evidence, [
    "schemaVersion", "originInventorySchemaVersion", "originInventoryRecordCount",
    "originInventoryFingerprint", "classificationRecordTuple",
    "classificationRecordCount", "classificationRecordsFingerprint",
    "markerPatterns", "gitObjectAudit", "classifications",
    "markerBearingPreviewPathSummary", "canonicalMutationRouteAudit",
    "environmentScopeContract", "dynamicCandidateContract", "evidenceFingerprint",
  ]) || evidence.schemaVersion !== PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA ||
      evidence.classificationRecordCount !==
        PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT ||
      evidence.classificationRecordsFingerprint !==
        PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT ||
      evidenceFingerprint !== PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT ||
      sha256(JSON.stringify(base)) !== evidenceFingerprint ||
      !HEX64.test(evidence.originInventoryFingerprint) ||
      evidence.originInventoryRecordCount !==
        PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT ||
      classificationTotal !== PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT ||
      evidence.gitObjectAudit?.missingCommitCount !== 0 ||
      evidence.canonicalMutationRouteAudit?.dedicatedWriterMarkerMatchCount !== 0 ||
      evidence.classifications?.mainProductionLegacyOnly?.markerBearingCommitCount !== 0 ||
      evidence.dynamicCandidateContract?.arbitraryMainProductionAdditionAllowed !== false ||
      evidence.dynamicCandidateContract?.differentShaAdditionAllowed !== false ||
      evidence.dynamicCandidateContract
        ?.databaseAdmissionRequiredForProductionCanonicalLegacyWrite !== true ||
      evidence.environmentScopeContract
        ?.duplicateUnscopedDedicatedPreviewRecordAllowed !== false ||
      !Array.isArray(blocked) || blocked.length !== 1 ||
      blocked[0].deploymentId !== "dpl_J4BFkTk2pqPeWxdUFxwQdRZJ9xCR" ||
      blocked[0].deploymentStatus !== "BLOCKED" || blocked[0].buildsCount !== 0 ||
      blocked[0].functionsCount !== 0 || blocked[0].aliasCount !== 0) {
    throw new Error("The Production Google credential-confinement evidence is invalid.");
  }
  cachedEvidence = Object.freeze(evidence);
  return cachedEvidence;
}
