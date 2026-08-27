import { createHash } from "node:crypto";
import credentialConfinementEvidenceArtifact from
  "../docs/evidence/step11-6-production-google-credential-confinement.json" with {
    type: "json",
  };

export const PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA =
  "step11-6-production-google-credential-confinement-v2";
export const PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT = 1_291;
export const PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT =
  "9ce65239f41086f56ea126e2491afe36ae90e85172a8536706f549912b27979b";
export const PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT =
  "071ca9163f6a1033e17136ace4c82b3163aa7a1c29900300ddafeeda5b7bb133";

const HEX64 = /^[0-9a-f]{64}$/;
const REVIEWED_GIT_OBJECT_UNAVAILABLE_SHAS = Object.freeze([
  "07685fc6f9e6db05c103493eb34e35425023aa42",
  "87d9661818b335a00dfe5f12dbc96531bf005ace",
  "fd3e2d11b19cc15c6120e2990c0b2c3dbcf95785",
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys) => value && typeof value === "object" &&
  !Array.isArray(value) && Object.keys(value).sort().join("\n") ===
  [...keys].sort().join("\n");
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

let cachedEvidence;

function validV1Evidence(evidence, classificationTotal, base) {
  const blocked = evidence.classifications?.providerBlockedNonExecutable?.deployments;
  return exactKeys(evidence, [
    "schemaVersion", "originInventorySchemaVersion", "originInventoryRecordCount",
    "originInventoryFingerprint", "classificationRecordTuple",
    "classificationRecordCount", "classificationRecordsFingerprint",
    "markerPatterns", "gitObjectAudit", "classifications",
    "markerBearingPreviewPathSummary", "canonicalMutationRouteAudit",
    "environmentScopeContract", "dynamicCandidateContract", "evidenceFingerprint",
  ]) && evidence.schemaVersion === PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA &&
    evidence.classificationRecordCount ===
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT &&
    evidence.classificationRecordsFingerprint ===
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT &&
    evidence.evidenceFingerprint ===
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT &&
    sha256(JSON.stringify(base)) === evidence.evidenceFingerprint &&
    HEX64.test(evidence.originInventoryFingerprint) &&
    evidence.originInventoryRecordCount ===
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT &&
    classificationTotal === PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT &&
    evidence.gitObjectAudit?.missingCommitCount === 0 &&
    evidence.canonicalMutationRouteAudit?.dedicatedWriterMarkerMatchCount === 0 &&
    evidence.classifications?.mainProductionLegacyOnly?.markerBearingCommitCount === 0 &&
    evidence.dynamicCandidateContract?.arbitraryMainProductionAdditionAllowed === false &&
    evidence.dynamicCandidateContract?.differentShaAdditionAllowed === false &&
    evidence.dynamicCandidateContract
      ?.databaseAdmissionRequiredForProductionCanonicalLegacyWrite === true &&
    evidence.environmentScopeContract
      ?.duplicateUnscopedDedicatedPreviewRecordAllowed === false &&
    Array.isArray(blocked) && blocked.length === 1 &&
    blocked[0].deploymentId === "dpl_J4BFkTk2pqPeWxdUFxwQdRZJ9xCR" &&
    blocked[0].deploymentStatus === "BLOCKED" && blocked[0].buildsCount === 0 &&
    blocked[0].functionsCount === 0 && blocked[0].aliasCount === 0;
}

function validV2NullShaDeployment(record, { blocked }) {
  return exactKeys(record, [
    "deploymentId", "origin", "deploymentTarget", "gitBranch", "providerSource",
    "deploymentStatus", "shaResolution", "providerMetadataFingerprint",
  ]) && /^dpl_[A-Za-z0-9]{8,64}$/.test(String(record.deploymentId || "")) &&
    /^https:\/\/[a-z0-9.-]+$/.test(String(record.origin || "")) &&
    ["PREVIEW", "PRODUCTION"].includes(record.deploymentTarget) &&
    (record.gitBranch === null || typeof record.gitBranch === "string") &&
    typeof record.providerSource === "string" && record.providerSource.length > 0 &&
    HEX64.test(String(record.providerMetadataFingerprint || "")) &&
    record.shaResolution === "UNAVAILABLE" &&
    (blocked
      ? record.deploymentStatus === "BLOCKED"
      : ["READY", "ERROR"].includes(record.deploymentStatus));
}

function validV2GitObjectUnavailableDeployment(record) {
  return exactKeys(record, [
    "deploymentId", "sha", "origin", "deploymentTarget", "gitBranch",
    "providerSource", "deploymentStatus", "shaResolution",
    "providerMetadataFingerprint",
  ]) && /^dpl_[A-Za-z0-9]{8,64}$/.test(String(record.deploymentId || "")) &&
    /^[0-9a-f]{40}$/.test(String(record.sha || "")) &&
    /^https:\/\/[a-z0-9.-]+$/.test(String(record.origin || "")) &&
    ["PREVIEW", "PRODUCTION"].includes(record.deploymentTarget) &&
    (record.gitBranch === null || typeof record.gitBranch === "string") &&
    typeof record.providerSource === "string" && record.providerSource.length > 0 &&
    ["READY", "ERROR", "BLOCKED"].includes(record.deploymentStatus) &&
    ["EXACT_PROVIDER", "LOCAL_GIT_ABBREVIATION"].includes(record.shaResolution) &&
    HEX64.test(String(record.providerMetadataFingerprint || ""));
}

function sortedUniqueStrings(values) {
  return Array.isArray(values) && values.every((value) => typeof value === "string") &&
    new Set(values).size === values.length &&
    JSON.stringify(values) === JSON.stringify([...values].sort());
}

function validV2Evidence(evidence, classificationTotal, base) {
  const classifications = evidence.classifications;
  const writerNullSha = classifications?.nullShaLegacyWriterCapable?.deployments;
  const missingGitObjects =
    classifications?.gitObjectUnavailableLegacyWriterCapable?.deployments;
  const blockedNullSha = classifications?.providerBlockedNonExecutable?.deployments;
  const gitAudit = evidence.gitObjectAudit;
  const nullShaRecordCount = Number(evidence.gitObjectAudit?.nullShaRecordCount);
  const nullShaWriterCount = Number(
    evidence.gitObjectAudit?.nullShaWriterCapableRecordCount,
  );
  const nullShaBlockedCount = Number(
    evidence.gitObjectAudit?.nullShaProviderBlockedRecordCount,
  );
  const providerContract = evidence.providerInventoryContract;
  const allMethodHosts = evidence.allMethodFenceRequiredHosts;
  const classificationKeys = [
    "productionTargetLegacyOnly", "projectPreviewLegacyOnly",
    "projectPreviewDedicatedProductionEnvironmentDenied",
    "projectPreviewDedicatedMetadataReadOnly", "nullShaLegacyWriterCapable",
    "gitObjectUnavailableLegacyWriterCapable", "providerBlockedNonExecutable",
  ];
  const nullShaKeys = [
    ...(Array.isArray(writerNullSha) ? writerNullSha : []),
    ...(Array.isArray(blockedNullSha) ? blockedNullSha : []),
  ].map((record) => `${record.deploymentId}\n${record.origin}`);
  const missingGitKeys = (Array.isArray(missingGitObjects) ? missingGitObjects : [])
    .map((record) => `${record.deploymentId}\n${record.origin}`);
  const expectedAllMethodHosts = [...new Set([
    ...(Array.isArray(writerNullSha) ? writerNullSha : [])
      .filter((record) => record.deploymentStatus === "READY")
      .map((record) => record.origin),
    ...(Array.isArray(missingGitObjects) ? missingGitObjects : [])
      .filter((record) => record.deploymentStatus === "READY")
      .map((record) => record.origin),
  ])].sort();
  const missingCommits = gitAudit?.missingCommits;
  const missingDeploymentShas = Array.isArray(missingGitObjects)
    ? [...new Set(missingGitObjects.map((record) => record.sha))].sort()
    : [];
  const routeAudit = evidence.canonicalMutationRouteAudit;
  const routePathCount = Array.isArray(routeAudit?.paths) ? routeAudit.paths.length : -1;
  const nonNullClassificationCount = [
    "productionTargetLegacyOnly", "projectPreviewLegacyOnly",
    "projectPreviewDedicatedProductionEnvironmentDenied",
    "projectPreviewDedicatedMetadataReadOnly",
    "gitObjectUnavailableLegacyWriterCapable",
  ].reduce((total, key) => total + Number(classifications?.[key]?.recordCount || 0), 0);
  return exactKeys(evidence, [
    "schemaVersion", "originInventorySchemaVersion", "originInventoryRecordTuple",
    "originInventoryRecordCount", "originInventoryFingerprint",
    "originInventoryProviderRecordTuple", "originInventoryProviderRecordCount",
    "originInventoryProviderRecordsFingerprint", "classificationRecordTuple",
    "classificationRecordCount", "classificationRecordsFingerprint",
    "markerPatterns", "gitObjectAudit", "classifications",
    "markerBearingPreviewPathSummary", "canonicalMutationRouteAudit",
    "allMethodFenceRequiredHosts", "providerInventoryContract", "environmentScopeContract",
    "dynamicCandidateContract", "evidenceFingerprint",
  ]) && evidence.schemaVersion === PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA &&
    evidence.originInventorySchemaVersion ===
      "step11-6-production-origin-inventory-v3" &&
    JSON.stringify(evidence.originInventoryRecordTuple) === JSON.stringify([
      "deploymentId", "sha", "origin", "scopeClass", "deploymentStatus",
      "providerMetadataFingerprint",
    ]) && JSON.stringify(evidence.originInventoryProviderRecordTuple) === JSON.stringify([
      "deploymentId", "sha", "providerCommitSha", "origin", "deploymentTarget",
      "gitBranch", "providerSource", "deploymentStatus", "createdAt",
      "shaResolution",
    ]) && evidence.originInventoryRecordCount ===
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT &&
    evidence.originInventoryProviderRecordCount ===
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT &&
    HEX64.test(String(evidence.originInventoryFingerprint || "")) &&
    HEX64.test(String(evidence.originInventoryProviderRecordsFingerprint || "")) &&
    JSON.stringify(evidence.classificationRecordTuple) === JSON.stringify([
      "deploymentId", "sha", "origin", "deploymentStatus", "classification",
    ]) && evidence.classificationRecordCount ===
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT &&
    evidence.classificationRecordsFingerprint ===
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT &&
    evidence.evidenceFingerprint ===
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT &&
    sha256(JSON.stringify(base)) === evidence.evidenceFingerprint &&
    classificationTotal === PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT &&
    exactKeys(classifications, classificationKeys) &&
    exactKeys(gitAudit, [
      "retainedNonNullRecordCount", "retainedUniqueCommitCount",
      "auditedUniqueCommitCount", "missingCommitCount", "missingCommits",
      "nullShaRecordCount", "nullShaWriterCapableRecordCount",
      "nullShaProviderBlockedRecordCount",
    ]) && Number.isSafeInteger(gitAudit.retainedNonNullRecordCount) &&
    Number.isSafeInteger(gitAudit.retainedUniqueCommitCount) &&
    Number.isSafeInteger(gitAudit.auditedUniqueCommitCount) &&
    Number.isSafeInteger(gitAudit.missingCommitCount) &&
    gitAudit.retainedNonNullRecordCount === nonNullClassificationCount &&
    gitAudit.retainedUniqueCommitCount ===
      gitAudit.auditedUniqueCommitCount + gitAudit.missingCommitCount &&
    sortedUniqueStrings(missingCommits) &&
    missingCommits.every((sha) => /^[0-9a-f]{40}$/.test(sha)) &&
    REVIEWED_GIT_OBJECT_UNAVAILABLE_SHAS.every((sha) =>
      missingCommits.includes(sha)) &&
    missingCommits.length === gitAudit.missingCommitCount &&
    JSON.stringify(missingCommits) === JSON.stringify(missingDeploymentShas) &&
    Number.isSafeInteger(nullShaRecordCount) && nullShaRecordCount >= 0 &&
    nullShaRecordCount === nullShaWriterCount + nullShaBlockedCount &&
    classifications.nullShaLegacyWriterCapable.recordCount === nullShaWriterCount &&
    classifications.providerBlockedNonExecutable.recordCount === nullShaBlockedCount &&
    Array.isArray(writerNullSha) && writerNullSha.length === nullShaWriterCount &&
    writerNullSha.every((record) => validV2NullShaDeployment(record, { blocked: false })) &&
    Array.isArray(blockedNullSha) && blockedNullSha.length === nullShaBlockedCount &&
    blockedNullSha.every((record) => validV2NullShaDeployment(record, { blocked: true })) &&
    new Set(nullShaKeys).size === nullShaKeys.length &&
    Array.isArray(missingGitObjects) &&
    missingGitObjects.length ===
      classifications.gitObjectUnavailableLegacyWriterCapable.recordCount &&
    missingGitObjects.every(validV2GitObjectUnavailableDeployment) &&
    new Set(missingGitKeys).size === missingGitKeys.length &&
    classifications.gitObjectUnavailableLegacyWriterCapable.uniqueCommitCount ===
      gitAudit.missingCommitCount &&
    classifications.gitObjectUnavailableLegacyWriterCapable.commitSetFingerprint ===
      sha256(JSON.stringify(missingCommits)) &&
    classifications.gitObjectUnavailableLegacyWriterCapable.policy ===
      "LEGACY_PRINCIPAL_WRITER_CAPABLE_UNLESS_GIT_OBJECT_AUDITED" &&
    routeAudit?.nullShaRoutesUnauditableRecordCount ===
      nullShaRecordCount &&
    routeAudit?.gitObjectUnavailableRoutesUnauditableRecordCount ===
      missingGitObjects.length &&
    routePathCount > 0 &&
    routeAudit.deploymentFileRequestCount ===
      (gitAudit.retainedNonNullRecordCount - missingGitObjects.length) * routePathCount &&
    routeAudit.uniqueCommitFileRequestCount ===
      gitAudit.auditedUniqueCommitCount * routePathCount &&
    routeAudit.deploymentFileVersionCount <= routeAudit.deploymentFileRequestCount &&
    routeAudit.uniqueCommitFileVersionCount <= routeAudit.uniqueCommitFileRequestCount &&
    routeAudit.dedicatedWriterMarkerMatchCount === 0 &&
    classifications.productionTargetLegacyOnly?.markerBearingCommitCount === 0 &&
    exactKeys(allMethodHosts, ["origins", "count", "fingerprint", "policy"]) &&
    sortedUniqueStrings(allMethodHosts.origins) &&
    allMethodHosts.origins.every((origin) => /^https:\/\/[a-z0-9.-]+$/.test(origin)) &&
    JSON.stringify(allMethodHosts.origins) === JSON.stringify(expectedAllMethodHosts) &&
    allMethodHosts.count === allMethodHosts.origins.length &&
    allMethodHosts.fingerprint === sha256(JSON.stringify(allMethodHosts.origins)) &&
    allMethodHosts.policy ===
      "READY_NULL_SHA_OR_GIT_OBJECT_UNAVAILABLE_REQUIRES_ALL_METHOD_PROVIDER_FENCE" &&
    exactKeys(providerContract, [
      "providerRecordCount", "providerRecordsFingerprint", "projectionRecordCount",
      "projectionRecordsFingerprint", "oneToOneProjection", "nullShaNonBlockedPolicy",
      "nullShaBlockedPolicy",
    ]) && providerContract.providerRecordCount ===
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT &&
    providerContract.projectionRecordCount ===
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT &&
    providerContract.providerRecordsFingerprint ===
      evidence.originInventoryProviderRecordsFingerprint &&
    providerContract.projectionRecordsFingerprint === evidence.originInventoryFingerprint &&
    providerContract.oneToOneProjection === true &&
    providerContract.nullShaNonBlockedPolicy === "LEGACY_PRINCIPAL_WRITER_CAPABLE" &&
    providerContract.nullShaBlockedPolicy === "NON_EXECUTABLE_PROVIDER_BLOCKED" &&
    evidence.dynamicCandidateContract?.arbitraryProductionTargetAdditionAllowed === false &&
    evidence.dynamicCandidateContract?.differentShaAdditionAllowed === false &&
    evidence.dynamicCandidateContract
      ?.databaseAdmissionRequiredForProductionCanonicalLegacyWrite === true &&
    evidence.environmentScopeContract
      ?.duplicateUnscopedDedicatedPreviewRecordAllowed === false;
}

export function productionGoogleCredentialConfinementEvidence() {
  if (cachedEvidence) return cachedEvidence;
  let evidence;
  try {
    evidence = JSON.parse(JSON.stringify(credentialConfinementEvidenceArtifact));
  } catch {
    throw new Error("The Production Google credential-confinement evidence is unavailable.");
  }
  const { evidenceFingerprint, ...base } = evidence;
  const classifications = evidence.classifications;
  const classificationTotal = classifications && Object.values(classifications)
    .reduce((total, record) => total + Number(record?.recordCount || 0), 0);
  const valid = PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA ===
      "step11-6-production-google-credential-confinement-v2"
    ? validV2Evidence(evidence, classificationTotal, base)
    : validV1Evidence(evidence, classificationTotal, base);
  if (!valid || evidenceFingerprint !== evidence.evidenceFingerprint) {
    throw new Error("The Production Google credential-confinement evidence is invalid.");
  }
  cachedEvidence = deepFreeze(evidence);
  return cachedEvidence;
}
