#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ROOT = new URL("../../", import.meta.url);
const INVENTORY_URL = new URL(
  "../../docs/evidence/step11-6-production-origin-inventory.json",
  import.meta.url,
);
const EVIDENCE_URL = new URL(
  "../../docs/evidence/step11-6-historical-safe-method-google-writer.json",
  import.meta.url,
);

export const HISTORICAL_SAFE_METHOD_WRITER_SCHEMA =
  "step11-6-historical-safe-method-google-writer-v1";
export const HISTORICAL_SAFE_METHOD_WRITER_FILE =
  "app/api/cron/round-scorecards-archive/route.js";
export const HISTORICAL_SAFE_METHOD_WRITER_REQUEST_PATH =
  "/api/cron/round-scorecards-archive";
export const HISTORICAL_SAFE_METHOD_WRITER_BLOB =
  "1d0ea635f7495aab0e619025fd626553d190953b";
export const HISTORICAL_SAFE_METHOD_405_BLOB =
  "c78228ffc3889277d3e91ba47fa42b8ebb967572";
export const HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGIN_COUNT = 236;
export const HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGINS_FINGERPRINT =
  "a8263e02ab7b65df938367fbf39769c70b501a614ebcdfa46800bda2e82de3a2";
export const HISTORICAL_SAFE_METHOD_WRITER_BLOCKED_PATHS_FINGERPRINT =
  "fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa";

const ORIGIN_INVENTORY_SCHEMA = "step11-6-production-origin-inventory-v3";
const PROVIDER_RECORD_TUPLE = Object.freeze([
  "deploymentId", "sha", "providerCommitSha", "origin", "deploymentTarget",
  "gitBranch", "providerSource", "deploymentStatus", "createdAt",
  "shaResolution",
]);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exactArray = (value, expected) =>
  Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected);

function git(args, { input, maxBuffer = 64 * 1024 * 1024 } = {}) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    input,
    encoding: input === undefined ? "utf8" : undefined,
    maxBuffer,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr?.toString?.() || "git command failed").trim());
  }
  return result.stdout;
}

function batchObjectTypes(specs) {
  if (specs.length === 0) return [];
  const lines = git(["cat-file", "--batch-check=%(objectname) %(objecttype)"], {
    input: Buffer.from(`${specs.join("\n")}\n`),
  }).toString("utf8").trim().split("\n");
  if (lines.length !== specs.length) {
    throw new Error("The Git object audit returned an incomplete response.");
  }
  return lines.map((line, index) => {
    if (line === `${specs[index]} missing`) return null;
    const match = line.match(/^([0-9a-f]{40}) (commit|blob)$/);
    if (!match) throw new Error(`Unexpected Git object response: ${line}`);
    return { objectId: match[1], objectType: match[2] };
  });
}

function normalizedInventory(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.schemaVersion !== ORIGIN_INVENTORY_SCHEMA ||
      !exactArray(value.providerRecordTuple, PROVIDER_RECORD_TUPLE) ||
      !Array.isArray(value.providerRecords) ||
      value.providerRecordCount !== value.providerRecords.length ||
      sha256(JSON.stringify(value.providerRecords)) !==
        value.providerRecordsFingerprint) {
    throw new Error("The retained v3 Production origin inventory was invalid.");
  }
  return value;
}

function countSummary(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort(([left], [right]) => compare(left, right));
}

function assertHistoricalBodies() {
  const writer = git(["cat-file", "blob", HISTORICAL_SAFE_METHOD_WRITER_BLOB]);
  if (!/export async function GET\(request\)\s*\{\s*return archiveOperation\(request\);\s*\}/s
    .test(writer) ||
      !/drainScorecardArchiveJobs\(\{\s*maximum:\s*5,\s*stopOnFailure:\s*false\s*\}\)/s
        .test(writer) ||
      !/export async function POST\(request\)/.test(writer)) {
    throw new Error("The reviewed historical safe-method writer blob changed semantics.");
  }
  const successor = git(["cat-file", "blob", HISTORICAL_SAFE_METHOD_405_BLOB]);
  if (!/export async function GET\(request\)\s*\{[\s\S]*?METHOD_NOT_ALLOWED[\s\S]*?status:\s*405[\s\S]*?Allow:\s*"POST"[\s\S]*?\}/
    .test(successor) ||
      !/export async function POST\(request\)\s*\{\s*return archiveOperation\(request\);\s*\}/s
        .test(successor)) {
    throw new Error("The reviewed POST-only successor blob changed semantics.");
  }
}

export function buildHistoricalSafeMethodGoogleWriterEvidence(
  inventoryValue = JSON.parse(readFileSync(INVENTORY_URL, "utf8")),
) {
  const inventory = normalizedInventory(inventoryValue);
  assertHistoricalBodies();
  const ready = inventory.providerRecords.filter((record) => record[7] === "READY");
  const uniqueNonNullShas = [...new Set(ready.map((record) => record[1])
    .filter(Boolean))].sort(compare);
  const commitObjects = batchObjectTypes(uniqueNonNullShas);
  const availableShas = [];
  const unavailableShas = [];
  for (let index = 0; index < uniqueNonNullShas.length; index += 1) {
    const object = commitObjects[index];
    if (object?.objectType === "commit") availableShas.push(uniqueNonNullShas[index]);
    else if (object === null) unavailableShas.push(uniqueNonNullShas[index]);
    else throw new Error("A retained deployment SHA did not resolve to a Git commit.");
  }
  const routeSpecs = availableShas.map((sha) =>
    `${sha}:${HISTORICAL_SAFE_METHOD_WRITER_FILE}`);
  const routeObjects = batchObjectTypes(routeSpecs);
  const routeBlobBySha = new Map();
  for (let index = 0; index < availableShas.length; index += 1) {
    const object = routeObjects[index];
    if (object === null) continue;
    if (object.objectType !== "blob") {
      throw new Error("The historical writer route did not resolve to a Git blob.");
    }
    routeBlobBySha.set(availableShas[index], object.objectId);
  }
  const observedRouteBlobs = [...new Set(routeBlobBySha.values())].sort(compare);
  const expectedRouteBlobs = [
    HISTORICAL_SAFE_METHOD_WRITER_BLOB,
    HISTORICAL_SAFE_METHOD_405_BLOB,
  ].sort(compare);
  if (!exactArray(observedRouteBlobs, expectedRouteBlobs)) {
    throw new Error("An unexplained historical Round Scorecards route blob was present.");
  }
  const availableSet = new Set(availableShas);
  const affected = ready.filter((record) => availableSet.has(record[1]) &&
    routeBlobBySha.get(record[1]) === HISTORICAL_SAFE_METHOD_WRITER_BLOB);
  const affectedOrigins = [...new Set(affected.map((record) => record[3]))].sort(compare);
  const affectedShas = [...new Set(affected.map((record) => record[1]))].sort(compare);
  if (affected.length !== affectedOrigins.length) {
    throw new Error("Affected READY deployment origins were not one-to-one.");
  }
  const routePresent = ready.filter((record) => availableSet.has(record[1]) &&
    routeBlobBySha.has(record[1]));
  const unresolved = ready.filter((record) => !record[1] || !availableSet.has(record[1]));
  const blockedRequestPaths = [HISTORICAL_SAFE_METHOD_WRITER_REQUEST_PATH];
  const base = {
    schemaVersion: HISTORICAL_SAFE_METHOD_WRITER_SCHEMA,
    originInventorySchemaVersion: inventory.schemaVersion,
    originInventoryProviderRecordCount: inventory.providerRecordCount,
    originInventoryProviderRecordsFingerprint: inventory.providerRecordsFingerprint,
    auditScope: {
      deploymentStatus: "READY",
      routeFile: HISTORICAL_SAFE_METHOD_WRITER_FILE,
      readyRecordCount: ready.length,
      readyUniqueNonNullCommitCount: uniqueNonNullShas.length,
      readyAuditedUniqueCommitCount: availableShas.length,
      readyUnauditableUniqueCommitCount: unavailableShas.length,
      readyUnauditableRecordCount: unresolved.length,
      routePresentRecordCount: routePresent.length,
      routeAbsentRecordCount: ready.length - unresolved.length - routePresent.length,
      observedRouteBlobCount: observedRouteBlobs.length,
      unexplainedRouteBlobCount: 0,
    },
    historicalSafeMethodWriter: {
      routeBlob: HISTORICAL_SAFE_METHOD_WRITER_BLOB,
      operationClass: "MIRROR_ARCHIVE",
      writerIntent: "MIRROR_ARCHIVE",
      externalMutationTarget: "GOOGLE_ROUND_SCORECARDS_WORKSHEET",
      explicitMutatingMethods: ["GET"],
      frameworkDispatchedPotentialMutatingMethods: ["HEAD"],
      optionsMutationObserved: false,
      affectedReadyDeploymentCount: affected.length,
      affectedReadyOriginCount: affectedOrigins.length,
      affectedReadyOriginsFingerprint: sha256(JSON.stringify(affectedOrigins)),
      affectedReadyOrigins: affectedOrigins,
      affectedUniqueCommitCount: affectedShas.length,
      affectedUniqueCommitsFingerprint: sha256(JSON.stringify(affectedShas)),
      deploymentTargetSummary: countSummary(affected.map((record) => record[4])),
      gitBranchSummary: countSummary(affected.map((record) => record[5] ?? null)),
      providerSourceSummary: countSummary(affected.map((record) => record[6] ?? null)),
    },
    postFixRoute: {
      routeBlob: HISTORICAL_SAFE_METHOD_405_BLOB,
      safeMethodBehavior: "GET_405_ALLOW_POST",
      affectedReadyDeploymentCount: routePresent.length - affected.length,
    },
    providerFenceContract: {
      blockedRequestPaths,
      blockedRequestPathCount: blockedRequestPaths.length,
      blockedRequestPathsFingerprint: sha256(JSON.stringify(blockedRequestPaths)),
      conditionType: "path",
      conditionOperator: "inc",
      methodScope: "ALL_METHODS",
      conditionGroupRelation: "OR",
      sourceUnresolvedReadyOriginsRemainCoveredByExactHostAllMethodGroup: true,
      policy:
        "EXACT_HISTORICAL_SAFE_METHOD_GOOGLE_WRITER_PATH_REQUIRES_ALL_METHOD_PROJECT_WIDE_DENY",
    },
  };
  if (base.historicalSafeMethodWriter.affectedReadyOriginCount !==
      HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGIN_COUNT ||
      base.historicalSafeMethodWriter.affectedReadyOriginsFingerprint !==
        HISTORICAL_SAFE_METHOD_WRITER_AFFECTED_ORIGINS_FINGERPRINT ||
      base.providerFenceContract.blockedRequestPathsFingerprint !==
        HISTORICAL_SAFE_METHOD_WRITER_BLOCKED_PATHS_FINGERPRINT) {
    throw new Error("The historical safe-method writer evidence drifted.");
  }
  return {
    ...base,
    evidenceFingerprint: sha256(JSON.stringify(base)),
  };
}

export function verifyHistoricalSafeMethodGoogleWriterEvidence() {
  const expected = buildHistoricalSafeMethodGoogleWriterEvidence();
  const actual = JSON.parse(readFileSync(EVIDENCE_URL, "utf8"));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("The committed historical safe-method writer evidence is stale.");
  }
  return actual;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  if (process.argv.includes("--write")) {
    writeFileSync(
      EVIDENCE_URL,
      `${JSON.stringify(buildHistoricalSafeMethodGoogleWriterEvidence(), null, 2)}\n`,
      { mode: 0o644 },
    );
  } else {
    verifyHistoricalSafeMethodGoogleWriterEvidence();
  }
}
