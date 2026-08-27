import { createHash } from "node:crypto";

export const VERCEL_ENVIRONMENT_RESOURCE_REVIEW_SCHEMA =
  "step11-6-vercel-environment-resource-review-v1";
export const VERCEL_ENVIRONMENT_CERTIFICATION_CONTINUITY_SCHEMA =
  "step11-6-vercel-environment-certification-continuity-v1";
export const VERCEL_ENVIRONMENT_RESOURCE_REVIEW_RECORD_TUPLE = Object.freeze([
  "id", "name", "type", "targets", "gitBranch", "createdAt", "updatedAt",
  "configurationId", "visibility", "providerValueEvidenceClass",
  "providerValueCiphertextSha256",
  "expectedSemanticClassFromPriorCertification",
]);
export const VERCEL_ENVIRONMENT_RESOURCE_REVIEW_RECORD_COUNT = 12;
export const VERCEL_ENVIRONMENT_RESOURCE_REVIEW_CANDIDATE_BRANCH =
  "feature/mock-tournament-qa-integration";

const HEX64 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9._:-]{3,240}$/;
const SAFE_NAME = /^[A-Z][A-Z0-9_]{2,160}$/;
const SAFE_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,80}$/;
const SAFE_VISIBILITY = /^[A-Za-z][A-Za-z0-9_-]{0,80}$/;
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const clean = (value) => String(value ?? "").trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const plain = (value) => Boolean(value) && typeof value === "object" &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);
const canonical = (value) => JSON.stringify(value);
const exactKeys = (value, keys) => plain(value) &&
  canonical(Object.keys(value).sort(compare)) === canonical([...keys].sort(compare));
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const REVIEW_SPECS = Object.freeze([
  ["GOOGLE_SHEETS_ID", null, "PREVIEW_WORKBOOK"],
  ["GOOGLE_SHEETS_ID", VERCEL_ENVIRONMENT_RESOURCE_REVIEW_CANDIDATE_BRANCH,
    "PRODUCTION_WORKBOOK"],
  ["NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY", null,
    "PREVIEW_SUPABASE_PUBLISHABLE_KEY"],
  ["NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY",
    VERCEL_ENVIRONMENT_RESOURCE_REVIEW_CANDIDATE_BRANCH,
    "PRODUCTION_SUPABASE_PUBLISHABLE_KEY"],
  ["NEXT_PUBLIC_SUPABASE_AUTH_URL", null, "PREVIEW_SUPABASE_URL"],
  ["NEXT_PUBLIC_SUPABASE_AUTH_URL",
    VERCEL_ENVIRONMENT_RESOURCE_REVIEW_CANDIDATE_BRANCH,
    "PRODUCTION_SUPABASE_URL"],
  ["PARTICIPANT_IDENTITY_AUTHORITY", null, "PREVIEW_IDENTITY_AUTHORITY"],
  ["PARTICIPANT_IDENTITY_AUTHORITY",
    VERCEL_ENVIRONMENT_RESOURCE_REVIEW_CANDIDATE_BRANCH,
    "CANDIDATE_IDENTITY_AUTHORITY"],
  ["SCORING_AUTHORITY", null, "PREVIEW_SCORING_AUTHORITY"],
  ["SCORING_AUTHORITY", VERCEL_ENVIRONMENT_RESOURCE_REVIEW_CANDIDATE_BRANCH,
    "CANDIDATE_SCORING_AUTHORITY"],
  ["SUPABASE_PARTICIPANT_AUTH_REHEARSAL_ENABLED", null,
    "PREVIEW_AUTH_REHEARSAL_FLAG"],
  ["SUPABASE_PARTICIPANT_IDENTITY_SHADOW_ENABLED", null,
    "PREVIEW_IDENTITY_SHADOW_FLAG"],
].map(Object.freeze));

const SEMANTIC_SOURCE =
  "OWNER_CERTIFIED_PRIOR_CERTIFICATION_CONTINUITY";

function fail(message) {
  const error = new Error(message);
  error.code = "STEP11_6_VERCEL_ENVIRONMENT_RESOURCE_REVIEW_INVALID";
  throw error;
}

function normalizedTargets(value) {
  const values = (Array.isArray(value) ? value : [value])
    .map((target) => clean(target).toLowerCase()).filter(Boolean);
  return [...new Set(values)].sort(compare);
}

function normalizedTimestamp(value) {
  if (Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && value && !Number.isNaN(Date.parse(value))) {
    return new Date(Date.parse(value)).toISOString();
  }
  fail("A reviewed Vercel environment timestamp was invalid.");
}

function validNormalizedTimestamp(value) {
  if (Number.isSafeInteger(value)) return value >= 0;
  if (typeof value !== "string" || !value || Number.isNaN(Date.parse(value))) return false;
  return new Date(Date.parse(value)).toISOString() === value;
}

function normalizedNullableId(value) {
  if (value === null) return null;
  const selected = clean(value);
  if (!SAFE_ID.test(selected)) fail("A reviewed Vercel configuration identity was invalid.");
  return selected;
}

function normalizedVisibility(value) {
  if (value === null || value === undefined) return null;
  const selected = clean(value);
  if (!SAFE_VISIBILITY.test(selected)) fail("A reviewed Vercel visibility was invalid.");
  return selected;
}

function listMetadata(record) {
  if (!plain(record)) fail("A reviewed Vercel environment record was invalid.");
  const id = clean(record.id);
  const name = clean(record.key || record.name);
  const type = clean(record.type);
  const targets = normalizedTargets(record.target);
  const gitBranch = record.gitBranch === null || record.gitBranch === undefined
    ? null : clean(record.gitBranch);
  if (!SAFE_ID.test(id) || !SAFE_NAME.test(name) || !SAFE_TYPE.test(type) ||
      canonical(targets) !== canonical(["preview"]) ||
      !(gitBranch === null || gitBranch ===
        VERCEL_ENVIRONMENT_RESOURCE_REVIEW_CANDIDATE_BRANCH) ||
      !Object.prototype.hasOwnProperty.call(record, "createdAt") ||
      !Object.prototype.hasOwnProperty.call(record, "updatedAt") ||
      !Object.prototype.hasOwnProperty.call(record, "configurationId") ||
      record.decrypted !== false || typeof record.value !== "string" ||
      !["encrypted", "sensitive"].includes(type) ||
      (type === "encrypted" && record.value.length === 0) ||
      (type === "sensitive" && record.value !== "")) {
    fail("A reviewed Vercel environment metadata tuple was outside the certified scope.");
  }
  return Object.freeze({
    id,
    name,
    type,
    targets: Object.freeze(targets),
    gitBranch,
    createdAt: normalizedTimestamp(record.createdAt),
    updatedAt: normalizedTimestamp(record.updatedAt),
    configurationId: normalizedNullableId(record.configurationId),
    visibility: normalizedVisibility(record.visibility),
    providerValueEvidenceClass: type === "encrypted"
      ? "PROVIDER_CIPHERTEXT_SHA256"
      : "PROVIDER_REDACTED_VERSION_METADATA_ONLY",
    providerValueCiphertextSha256:
      type === "encrypted" ? sha256(record.value) : null,
  });
}

export function ownerCertifiedVercelEnvironmentContinuityBaseline() {
  const continuityRecords = REVIEW_SPECS.map(([name, gitBranch, semanticClass]) => [
    name,
    gitBranch,
    semanticClass,
    SEMANTIC_SOURCE,
    true,
  ]).sort((left, right) => compare(canonical(left), canonical(right)));
  const base = {
    schemaVersion: VERCEL_ENVIRONMENT_CERTIFICATION_CONTINUITY_SCHEMA,
    step11CertificationFingerprint:
      "e3343ff6b252b12f9f90a717f7e7b219a89b9e7ed5e228bb653a871c3a7a6e2b",
    step12EnvironmentDeltaFingerprint:
      "d22267e690bd27d5a55e9d1ce27daedece6c875b8cf7a9deb772576672b68716",
    step11_5ExecutionBundleFingerprint:
      "7cdfb68eea30da0cfd11bbb1f65f947ec95c3fac57c52b2217a0a60e2ef40c20",
    ownerCertifiedSteps10A10B11Pass: true,
    ownerReportedStep11_5CandidateProductionResourcesAndDirectorSignInVerified: true,
    immutableCandidateRuntimeResponseArtifactRetained: false,
    runtimeRouteChecksClassification: "CORROBORATION_ONLY_NOT_SEMANTIC_BASELINE",
    directorStablePlayerId: "CB01",
    continuityClassificationRecordTuple: [
      "name", "gitBranch", "expectedSemanticClass", "source",
      "coveredByPriorCertification",
    ],
    continuityClassificationRecordCount: continuityRecords.length,
    continuityClassificationRecords: continuityRecords,
    providerPlaintextValueReviewPerformed: false,
    providerCiphertextWhereExposedAndVersionContinuityRequired: true,
    rawValuesRetained: false,
  };
  return deepFreeze({
    ...base,
    baselineFingerprint: sha256(canonical(base)),
  });
}

export function validOwnerCertifiedVercelEnvironmentContinuityBaseline(value) {
  const expected = ownerCertifiedVercelEnvironmentContinuityBaseline();
  return exactKeys(value, Object.keys(expected)) && canonical(value) === canonical(expected);
}

export function reviewedVercelEnvironmentRecordIds(listPayload) {
  if (!plain(listPayload) || !Array.isArray(listPayload.envs) ||
      !Object.prototype.hasOwnProperty.call(listPayload, "hiddenProductionEnvCount") ||
      !Number.isSafeInteger(listPayload.hiddenProductionEnvCount) ||
      listPayload.hiddenProductionEnvCount !== 0) {
    fail("The Vercel environment census was incomplete or hidden.");
  }
  const selected = [];
  for (const spec of REVIEW_SPECS) {
    const [expectedName, expectedBranch] = spec;
    const matches = listPayload.envs.filter((record) => {
      const name = clean(record?.key || record?.name);
      const targets = normalizedTargets(record?.target);
      const gitBranch = record?.gitBranch === null || record?.gitBranch === undefined
        ? null : clean(record?.gitBranch);
      return name === expectedName && canonical(targets) === canonical(["preview"]) &&
        gitBranch === expectedBranch;
    });
    if (matches.length !== 1) fail("A reviewed Vercel environment resource was missing or duplicated.");
    selected.push(listMetadata(matches[0]));
  }
  const ids = selected.map((record) => record.id);
  if (selected.length !== VERCEL_ENVIRONMENT_RESOURCE_REVIEW_RECORD_COUNT ||
      new Set(ids).size !== ids.length) {
    fail("The reviewed Vercel environment resource identity set was invalid.");
  }
  return Object.freeze(ids);
}

export function buildVercelEnvironmentResourceReview(listPayload, {
  continuityBaseline = ownerCertifiedVercelEnvironmentContinuityBaseline(),
} = {}) {
  reviewedVercelEnvironmentRecordIds(listPayload);
  if (!validOwnerCertifiedVercelEnvironmentContinuityBaseline(continuityBaseline)) {
    fail("The owner-certified environment continuity baseline was absent or invalid.");
  }
  const records = [];
  for (const [name, branch, semanticClass] of REVIEW_SPECS) {
    const source = listPayload.envs.find((record) =>
      clean(record?.key || record?.name) === name &&
      canonical(normalizedTargets(record?.target)) === canonical(["preview"]) &&
      (record?.gitBranch === null || record?.gitBranch === undefined
        ? null : clean(record?.gitBranch)) === branch);
    const metadata = listMetadata(source);
    records.push(Object.freeze([
      metadata.id, metadata.name, metadata.type, metadata.targets,
      metadata.gitBranch, metadata.createdAt, metadata.updatedAt,
      metadata.configurationId, metadata.visibility,
      metadata.providerValueEvidenceClass,
      metadata.providerValueCiphertextSha256, semanticClass,
    ]));
  }
  records.sort((left, right) => compare(canonical(left), canonical(right)));
  const recordsFingerprint = sha256(canonical(records));
  const base = {
    schemaVersion: VERCEL_ENVIRONMENT_RESOURCE_REVIEW_SCHEMA,
    recordTuple: [...VERCEL_ENVIRONMENT_RESOURCE_REVIEW_RECORD_TUPLE],
    providerEnvironmentRecordCount: listPayload.envs.length,
    hiddenProductionEnvCount: listPayload.hiddenProductionEnvCount,
    recordCount: records.length,
    recordsFingerprint,
    records,
    ownerCertifiedContinuityBaseline: continuityBaseline,
    ownerCertifiedContinuityBaselineFingerprint: continuityBaseline.baselineFingerprint,
    providerPlaintextValueReviewPerformed: false,
    providerCiphertextWhereExposedAndVersionContinuityRequired: true,
    rawValuesRetained: false,
  };
  return deepFreeze({
    ...base,
    reviewFingerprint: sha256(canonical(base)),
  });
}

export function validVercelEnvironmentResourceReview(value) {
  if (!exactKeys(value, [
    "schemaVersion", "recordTuple", "providerEnvironmentRecordCount",
    "hiddenProductionEnvCount", "recordCount", "recordsFingerprint", "records",
    "ownerCertifiedContinuityBaseline", "ownerCertifiedContinuityBaselineFingerprint",
    "providerPlaintextValueReviewPerformed",
    "providerCiphertextWhereExposedAndVersionContinuityRequired", "rawValuesRetained",
    "reviewFingerprint",
  ]) || value.schemaVersion !==
      VERCEL_ENVIRONMENT_RESOURCE_REVIEW_SCHEMA ||
      canonical(value.recordTuple) !==
        canonical(VERCEL_ENVIRONMENT_RESOURCE_REVIEW_RECORD_TUPLE) ||
      !Number.isSafeInteger(value.providerEnvironmentRecordCount) ||
      value.providerEnvironmentRecordCount < value.recordCount ||
      !Number.isSafeInteger(value.hiddenProductionEnvCount) ||
      value.hiddenProductionEnvCount !== 0 ||
      value.recordCount !== VERCEL_ENVIRONMENT_RESOURCE_REVIEW_RECORD_COUNT ||
      !Array.isArray(value.records) || value.records.length !== value.recordCount ||
      !HEX64.test(String(value.recordsFingerprint || "")) ||
      !HEX64.test(String(value.reviewFingerprint || "")) ||
      !validOwnerCertifiedVercelEnvironmentContinuityBaseline(
        value.ownerCertifiedContinuityBaseline,
      ) || value.ownerCertifiedContinuityBaselineFingerprint !==
        value.ownerCertifiedContinuityBaseline.baselineFingerprint ||
      value.providerPlaintextValueReviewPerformed !== false ||
      value.providerCiphertextWhereExposedAndVersionContinuityRequired !== true ||
      value.rawValuesRetained !== false) {
    return false;
  }
  const base = { ...value };
  delete base.reviewFingerprint;
  const expectedIdentities = new Set(REVIEW_SPECS.map(([name, branch, semanticClass]) =>
    `${name}\n${branch ?? ""}\n${semanticClass}`));
  const identities = [];
  const recordsValid = value.records.every((record) => {
    if (!(Array.isArray(record) &&
      record.length === VERCEL_ENVIRONMENT_RESOURCE_REVIEW_RECORD_TUPLE.length &&
      SAFE_ID.test(clean(record[0])) && SAFE_NAME.test(clean(record[1])) &&
      SAFE_TYPE.test(clean(record[2])) && canonical(record[3]) === canonical(["preview"]) &&
      (record[4] === null || record[4] ===
        VERCEL_ENVIRONMENT_RESOURCE_REVIEW_CANDIDATE_BRANCH) &&
      validNormalizedTimestamp(record[5]) &&
      validNormalizedTimestamp(record[6]) &&
      (record[7] === null || SAFE_ID.test(clean(record[7]))) &&
      (record[8] === null || SAFE_VISIBILITY.test(clean(record[8]))) &&
      ["PROVIDER_CIPHERTEXT_SHA256", "PROVIDER_REDACTED_VERSION_METADATA_ONLY"]
        .includes(record[9]) &&
      (record[2] === "encrypted"
        ? record[9] === "PROVIDER_CIPHERTEXT_SHA256" && HEX64.test(clean(record[10]))
        : record[2] === "sensitive" &&
          record[9] === "PROVIDER_REDACTED_VERSION_METADATA_ONLY" &&
          record[10] === null) &&
      typeof record[11] === "string")) return false;
    identities.push(`${record[1]}\n${record[4] ?? ""}\n${record[11]}`);
    return true;
  });
  return recordsValid && identities.length === expectedIdentities.size &&
    identities.every((identity) => expectedIdentities.has(identity)) &&
    new Set(value.records.map((record) => record[0])).size === value.records.length &&
    canonical([...value.records].sort((left, right) => compare(canonical(left), canonical(right)))) ===
      canonical(value.records) &&
    sha256(canonical(value.records)) === value.recordsFingerprint &&
    sha256(canonical(base)) === value.reviewFingerprint;
}
