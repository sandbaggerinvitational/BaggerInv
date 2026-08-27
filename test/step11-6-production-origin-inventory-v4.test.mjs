import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  productionLegacyDeploymentInventory,
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT,
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT,
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_REQUIRED_DEPLOYMENTS,
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_SCHEMA,
  PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_COUNT,
  PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_FINGERPRINT,
} from "../lib/production-google-writer-fence-quiesce.js";
import {
  buildInventoryArtifact,
  INVENTORY_SCHEMA,
  REQUIRED_DEPLOYMENTS,
} from "../tools/step11-6-operator/capture-production-origin-inventory.mjs";

const V3_ARTIFACT = new URL(
  "../docs/evidence/step11-6-production-origin-inventory.json",
  import.meta.url,
);
const V4_ARTIFACT = new URL(
  "../docs/evidence/step11-6-production-origin-inventory-v4.json",
  import.meta.url,
);
const V2_DEPLOYMENT_ID = "dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm";
const PROVIDER_FINGERPRINT =
  "abd27e4e2747c17053f6debf71ec0f523d39fea8e2383d4911f9dc4b87959cbe";
const PROJECTION_FINGERPRINT =
  "9d25299c72424a2b5c3c613649b7f07760fda64c0b0bb4823edaf2cd91622774";
const PAGE_FINGERPRINT =
  "7f19f6f112e2b44b3f6979f7b600a7b926c961cf231fcb2bb583c915b2ababd5";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readArtifact = (url) => JSON.parse(readFileSync(url, "utf8"));

test("the v4 retained inventory is the exact complete 1,292-deployment project census", () => {
  const artifact = readArtifact(V4_ARTIFACT);
  assert.equal(artifact.schemaVersion, "step11-6-production-origin-inventory-v4");
  assert.equal(artifact.vercelProjectId, "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU");
  assert.equal(artifact.vercelTeamId, "team_kPw5zaib8uaQJALAwj4fWI6R");
  assert.equal(artifact.capturedAt, "2026-08-27T01:50:43.767Z");
  assert.equal(artifact.providerRecordCount, 1292);
  assert.equal(artifact.recordCount, 1292);
  assert.equal(artifact.providerRecords.length, 1292);
  assert.equal(artifact.records.length, 1292);
  assert.equal(artifact.providerRecordsFingerprint, PROVIDER_FINGERPRINT);
  assert.equal(artifact.recordsFingerprint, PROJECTION_FINGERPRINT);
  assert.equal(sha256(JSON.stringify(artifact.providerRecords)), PROVIDER_FINGERPRINT);
  assert.equal(sha256(JSON.stringify(artifact.records)), PROJECTION_FINGERPRINT);
  assert.deepEqual(artifact.coverageSummary.targetCounts, {
    PREVIEW: 834,
    PRODUCTION: 458,
  });
  assert.equal(artifact.paginationEvidence.firstPass.pageCount, 13);
  assert.equal(artifact.paginationEvidence.secondPass.pageCount, 13);
  assert.equal(artifact.paginationEvidence.firstPass.recordCount, 1292);
  assert.equal(artifact.paginationEvidence.secondPass.recordCount, 1292);
  assert.equal(artifact.paginationEvidence.firstPass.pageRecordsFingerprint,
    PAGE_FINGERPRINT);
  assert.equal(artifact.paginationEvidence.secondPass.pageRecordsFingerprint,
    PAGE_FINGERPRINT);
  assert.equal(artifact.paginationEvidence.exactPassMatch, true);
  assert.equal(artifact.paginationEvidence.remainingCursor, null);
  assert.deepEqual(artifact.requiredDeployments, {
    priorLive: "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
    frozenStep11: "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
    step11_6CandidateV1: "dpl_2oK3GmMa8f93wqjHNp1Gp2Y6Paox",
    step11_6CandidateV2: V2_DEPLOYMENT_ID,
  });
});

test("v4 is the historical v3 census plus only the reviewed V2 deployment", () => {
  const v3 = readArtifact(V3_ARTIFACT);
  const v4 = readArtifact(V4_ARTIFACT);
  const addedProviderRecords = v4.providerRecords.filter((record) =>
    record[0] === V2_DEPLOYMENT_ID);
  const addedRecords = v4.records.filter((record) => record[0] === V2_DEPLOYMENT_ID);
  assert.deepEqual(v4.providerRecords.filter((record) =>
    record[0] !== V2_DEPLOYMENT_ID), v3.providerRecords);
  assert.deepEqual(v4.records.filter((record) =>
    record[0] !== V2_DEPLOYMENT_ID), v3.records);
  assert.deepEqual(addedProviderRecords, [[
    V2_DEPLOYMENT_ID,
    "0671bb3b84ac5846218ea60838fe4e1cc07de97f",
    "0671bb3b84ac5846218ea60838fe4e1cc07de97f",
    "https://bagger-6lfjugfk7-sandbagger-invitational.vercel.app",
    "PREVIEW",
    "feature/mock-tournament-qa-integration",
    "GIT",
    "READY",
    "2026-08-27T01:11:05.352Z",
    "EXACT_PROVIDER",
  ]]);
  assert.deepEqual(addedRecords, [[
    V2_DEPLOYMENT_ID,
    "0671bb3b84ac5846218ea60838fe4e1cc07de97f",
    "https://bagger-6lfjugfk7-sandbagger-invitational.vercel.app",
    "PROJECT_PREVIEW",
    "READY",
    "23d503936f3f41ede80f5e03d7b5df423d43d120d88fbf5c2aeb781866628913",
  ]]);
  const projected = v4.providerRecords.map((record) => [
    record[0],
    record[1],
    record[3],
    record[4] === "PRODUCTION" ? "PRODUCTION_TARGET" : "PROJECT_PREVIEW",
    record[7],
    sha256(JSON.stringify([
      record[2], record[4], record[5], record[6], record[8], record[9],
    ])),
  ]);
  assert.deepEqual(projected, v4.records);
});

test("runtime validation and the capture generator both pin the v4 census", () => {
  const artifact = readArtifact(V4_ARTIFACT);
  const pass = {
    providerRecords: artifact.providerRecords,
    recordsFingerprint: artifact.providerRecordsFingerprint,
    pageCount: 13,
    pageRecordsFingerprint: PAGE_FINGERPRINT,
  };
  assert.equal(INVENTORY_SCHEMA, "step11-6-production-origin-inventory-v4");
  assert.deepEqual(REQUIRED_DEPLOYMENTS, artifact.requiredDeployments);
  assert.deepEqual(buildInventoryArtifact(pass, structuredClone(pass), artifact.capturedAt),
    artifact);

  const retained = productionLegacyDeploymentInventory();
  assert.equal(PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_SCHEMA,
    artifact.schemaVersion);
  assert.equal(PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT,
    artifact.recordCount);
  assert.equal(PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT,
    artifact.recordsFingerprint);
  assert.equal(PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_COUNT,
    artifact.providerRecordCount);
  assert.equal(PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_FINGERPRINT,
    artifact.providerRecordsFingerprint);
  assert.deepEqual(PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_REQUIRED_DEPLOYMENTS,
    artifact.requiredDeployments);
  assert.equal(retained.capturedAt, artifact.capturedAt);
  assert.deepEqual(retained.coverageSummary.targetCounts, {
    PREVIEW: 834,
    PRODUCTION: 458,
  });
});
