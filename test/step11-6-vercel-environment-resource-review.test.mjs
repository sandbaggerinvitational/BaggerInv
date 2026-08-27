import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVercelEnvironmentResourceReview,
  ownerCertifiedVercelEnvironmentContinuityBaseline,
  reviewedVercelEnvironmentRecordIds,
  validVercelEnvironmentResourceReview,
  VERCEL_ENVIRONMENT_RESOURCE_REVIEW_CANDIDATE_BRANCH,
  VERCEL_ENVIRONMENT_RESOURCE_REVIEW_RECORD_COUNT,
} from "../lib/vercel-environment-resource-review.js";

const branch = VERCEL_ENVIRONMENT_RESOURCE_REVIEW_CANDIDATE_BRANCH;
const specifications = [
  ["GOOGLE_SHEETS_ID", null], ["GOOGLE_SHEETS_ID", branch],
  ["NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY", null],
  ["NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY", branch],
  ["NEXT_PUBLIC_SUPABASE_AUTH_URL", null],
  ["NEXT_PUBLIC_SUPABASE_AUTH_URL", branch],
  ["PARTICIPANT_IDENTITY_AUTHORITY", null],
  ["PARTICIPANT_IDENTITY_AUTHORITY", branch],
  ["SCORING_AUTHORITY", null], ["SCORING_AUTHORITY", branch],
  ["SUPABASE_PARTICIPANT_AUTH_REHEARSAL_ENABLED", null],
  ["SUPABASE_PARTICIPANT_IDENTITY_SHADOW_ENABLED", null],
];

function providerList() {
  return {
    hiddenProductionEnvCount: 0,
    envs: [
      ...specifications.map(([key, gitBranch], index) => {
        const type = gitBranch || ["GOOGLE_SHEETS_ID", "SCORING_AUTHORITY"].includes(key)
          ? "sensitive" : "encrypted";
        return {
          id: `env_reviewed_${String(index).padStart(2, "0")}`,
          key,
          type,
          target: ["preview"],
          ...(gitBranch ? { gitBranch } : {}),
          createdAt: 1_724_000_000_000 + index,
          updatedAt: 1_725_000_000_000 + index,
          configurationId: null,
          value: type === "sensitive"
            ? "" : `provider-ciphertext-${index}-${"x".repeat(32)}`,
          decrypted: false,
        };
      }),
      ...Array.from({ length: 109 }, (_, index) => ({
        id: `env_unrelated_${String(index).padStart(3, "0")}`,
        key: `UNRELATED_${index}`,
        target: ["preview"],
        value: "not-reviewed",
      })),
    ],
  };
}

test("the v4 provider review binds 12 ciphertext/versioned records without retaining values", () => {
  const payload = providerList();
  const rawCiphertexts = payload.envs.slice(0, specifications.length)
    .map((record) => record.value).filter(Boolean);
  const review = buildVercelEnvironmentResourceReview(payload);
  assert.equal(review.recordCount, VERCEL_ENVIRONMENT_RESOURCE_REVIEW_RECORD_COUNT);
  assert.equal(review.providerEnvironmentRecordCount, 121);
  assert.equal(review.hiddenProductionEnvCount, 0);
  assert.equal(review.providerPlaintextValueReviewPerformed, false);
  assert.equal(review.providerCiphertextWhereExposedAndVersionContinuityRequired, true);
  assert.equal(review.rawValuesRetained, false);
  assert.equal(validVercelEnvironmentResourceReview(review), true);
  assert.equal(Object.isFrozen(review), true);
  assert.equal(Object.isFrozen(review.records), true);
  assert.equal(Object.isFrozen(review.ownerCertifiedContinuityBaseline), true);
  assert.ok(rawCiphertexts.every((value) => !JSON.stringify(review).includes(value)));
  assert.equal(review.records.filter((record) =>
    record[9] === "PROVIDER_CIPHERTEXT_SHA256" && /^[0-9a-f]{64}$/.test(record[10]))
    .length, 5);
  assert.equal(review.records.filter((record) =>
    record[9] === "PROVIDER_REDACTED_VERSION_METADATA_ONLY" && record[10] === null)
    .length, 7);
  assert.equal(review.ownerCertifiedContinuityBaseline
    .immutableCandidateRuntimeResponseArtifactRetained, false);
  assert.equal(review.ownerCertifiedContinuityBaseline.runtimeRouteChecksClassification,
    "CORROBORATION_ONLY_NOT_SEMANTIC_BASELINE");
});

test("the prior semantic baseline is the exact owner-certified continuity chain", () => {
  const baseline = ownerCertifiedVercelEnvironmentContinuityBaseline();
  assert.equal(baseline.step11CertificationFingerprint,
    "e3343ff6b252b12f9f90a717f7e7b219a89b9e7ed5e228bb653a871c3a7a6e2b");
  assert.equal(baseline.step12EnvironmentDeltaFingerprint,
    "d22267e690bd27d5a55e9d1ce27daedece6c875b8cf7a9deb772576672b68716");
  assert.equal(baseline.step11_5ExecutionBundleFingerprint,
    "7cdfb68eea30da0cfd11bbb1f65f947ec95c3fac57c52b2217a0a60e2ef40c20");
  assert.ok(baseline.continuityClassificationRecords.every((record) =>
    record[3] === "OWNER_CERTIFIED_PRIOR_CERTIFICATION_CONTINUITY" &&
    record[4] === true));
  assert.equal(baseline.providerPlaintextValueReviewPerformed, false);
});

test("hidden, missing, duplicate, or decrypted reviewed records fail closed", () => {
  const hidden = providerList();
  hidden.hiddenProductionEnvCount = 1;
  assert.throws(() => buildVercelEnvironmentResourceReview(hidden));

  const missing = providerList();
  missing.envs.splice(0, 1);
  assert.throws(() => buildVercelEnvironmentResourceReview(missing));

  const duplicate = providerList();
  duplicate.envs.push({ ...duplicate.envs[0], id: "env_duplicate_reviewed" });
  assert.throws(() => reviewedVercelEnvironmentRecordIds(duplicate));

  const decrypted = providerList();
  decrypted.envs[0].decrypted = true;
  assert.throws(() => buildVercelEnvironmentResourceReview(decrypted));

  const exposedSensitive = providerList();
  exposedSensitive.envs.find((record) => record.type === "sensitive").value = "unexpected";
  assert.throws(() => buildVercelEnvironmentResourceReview(exposedSensitive));

  const emptyEncrypted = providerList();
  emptyEncrypted.envs.find((record) => record.type === "encrypted").value = "";
  assert.throws(() => buildVercelEnvironmentResourceReview(emptyEncrypted));
});

test("exposed ciphertext, id, sensitive updatedAt, visibility, and extra drift fail closed", () => {
  const exact = buildVercelEnvironmentResourceReview(providerList());
  for (const mutate of [
    (payload) => {
      payload.envs.find((record) => record.type === "encrypted").value += "-changed";
    },
    (payload) => { payload.envs[0].id = "env_reviewed_drifted"; },
    (payload) => { payload.envs[0].updatedAt += 1; },
    (payload) => { payload.envs[0].visibility = "secret"; },
  ]) {
    const payload = providerList();
    mutate(payload);
    const drift = buildVercelEnvironmentResourceReview(payload);
    assert.notEqual(drift.recordsFingerprint, exact.recordsFingerprint);
    assert.notEqual(drift.reviewFingerprint, exact.reviewFingerprint);
  }
  const extra = providerList();
  extra.envs.push({ ...extra.envs[0], id: "env_reviewed_extra" });
  assert.throws(() => buildVercelEnvironmentResourceReview(extra));

  const invalidTimestamp = structuredClone(exact);
  invalidTimestamp.records[0][6] = "not-a-timestamp";
  assert.equal(validVercelEnvironmentResourceReview(invalidTimestamp), false);
});
