import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const ARTIFACT = new URL(
  "../docs/evidence/step11-6-production-origin-inventory.json",
  import.meta.url,
);
const GENERATOR = new URL(
  "../tools/step11-6-operator/capture-production-origin-inventory.mjs",
  import.meta.url,
);
const SERVER_EVIDENCE_LOADERS = [
  "../lib/production-google-writer-fence-quiesce.js",
  "../lib/production-google-credential-confinement.js",
  "../lib/production-google-historical-safe-method-writer.js",
].map((path) => new URL(path, import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("the v3 retained inventory is the exact complete 1,291-deployment project census", () => {
  const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  assert.equal(artifact.schemaVersion, "step11-6-production-origin-inventory-v3");
  assert.equal(artifact.vercelProjectId, "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU");
  assert.equal(artifact.vercelTeamId, "team_kPw5zaib8uaQJALAwj4fWI6R");
  assert.equal(artifact.providerRecordCount, 1291);
  assert.equal(artifact.recordCount, 1291);
  assert.equal(artifact.providerRecords.length, 1291);
  assert.equal(artifact.records.length, 1291);
  assert.deepEqual(artifact.coverageSummary.targetCounts, {
    PREVIEW: 833,
    PRODUCTION: 458,
  });
  assert.equal(artifact.coverageSummary.nullShaRecordCount, 8);
  assert.equal(artifact.coverageSummary.nullShaReadyRecordCount, 5);
  assert.equal(artifact.coverageSummary.providerCommitShaUnavailableCount, 8);
  assert.equal(artifact.coverageSummary.nullBranchRecordCount, 8);
  assert.equal(artifact.paginationEvidence.firstPass.pageCount, 13);
  assert.equal(artifact.paginationEvidence.secondPass.pageCount, 13);
  assert.equal(artifact.paginationEvidence.firstPass.recordCount, 1291);
  assert.equal(artifact.paginationEvidence.secondPass.recordCount, 1291);
  assert.equal(artifact.paginationEvidence.exactPassMatch, true);
  assert.equal(artifact.paginationEvidence.remainingCursor, null);
  assert.equal(artifact.providerRecordsFingerprint,
    sha256(JSON.stringify(artifact.providerRecords)));
  assert.equal(artifact.recordsFingerprint,
    sha256(JSON.stringify(artifact.records)));
});

test("every full provider record maps one-to-one to the exact six-field database projection", () => {
  const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  const projected = artifact.providerRecords.map((record) => [
    record[0],
    record[1],
    record[3],
    record[4] === "PRODUCTION" ? "PRODUCTION_TARGET" : "PROJECT_PREVIEW",
    record[7],
    sha256(JSON.stringify([
      record[2], record[4], record[5], record[6], record[8], record[9],
    ])),
  ]);
  assert.deepEqual(projected, artifact.records);
  assert.equal(new Set(artifact.records.map((record) => record[0])).size, 1291);
  assert.equal(new Set(artifact.records.map((record) => record[2])).size, 1291);
  assert.ok(artifact.records.every((record) =>
    /^[0-9a-f]{64}$/.test(record[5])));
  assert.equal(artifact.records.filter((record) =>
    record[3] === "PRODUCTION_TARGET").length, 458);
  assert.equal(artifact.records.filter((record) =>
    record[3] === "PROJECT_PREVIEW").length, 833);
});

test("source-unresolved READY CLI deployments remain explicit potential writers", () => {
  const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  const unresolvedReady = artifact.providerRecords.filter((record) =>
    record[1] === null && record[6] === "CLI" && record[7] === "READY");
  assert.equal(unresolvedReady.length, 5);
  assert.ok(unresolvedReady.every((record) =>
    record[2] === null && record[5] === null && record[9] === "UNAVAILABLE"));
  assert.deepEqual(unresolvedReady.map((record) => record[3]), [
    "https://bagger-kh2m1cy6h-sandbagger-invitational.vercel.app",
    "https://bagger-60ah92b8c-sandbagger-invitational.vercel.app",
    "https://bagger-b8ob0hjnu-sandbagger-invitational.vercel.app",
    "https://bagger-6nrmyunec-sandbagger-invitational.vercel.app",
    "https://bagger-f64olgv1h-sandbagger-invitational.vercel.app",
  ]);
});

test("the capture tool performs two unfiltered project-wide provider passes", () => {
  const source = readFileSync(GENERATOR, "utf8");
  assert.match(source, /projectId: VERCEL_PROJECT_ID/);
  assert.match(source, /teamId: VERCEL_TEAM_ID/);
  assert.match(source, /limit: "100"/);
  assert.doesNotMatch(source, /query\.set\("(?:target|gitBranch|branch|source|state)"/);
  assert.match(source,
    /const first = await collectProviderInventory\(readApi\);\s*const second = await collectProviderInventory\(readApi\);/);
  assert.match(source, /JSON\.stringify\(first\.providerRecords\) !==\s*JSON\.stringify\(second\.providerRecords\)/);
});

test("server evidence loaders use statically bundled JSON instead of webpack URL shims", () => {
  for (const loader of SERVER_EVIDENCE_LOADERS) {
    const source = readFileSync(loader, "utf8");
    assert.match(source, /from\s+["'][^"']+\.json["']\s+with\s+\{\s*type:\s*["']json["']/);
    assert.doesNotMatch(source, /readFileSync\s*\(\s*new URL\s*\(/);
  }
});
