#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES } from
  "../../lib/google-workbook-mutation-intent.js";
import {
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_COMPLEMENT_GROUP_COUNT,
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_METHOD,
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH,
  productionGoogleWriterCriticalWindowWafContract,
} from "../../lib/production-google-writer-critical-window-waf.js";

const ROOT = new URL("../../", import.meta.url);
const INVENTORY_URL = new URL(
  "../../docs/evidence/step11-6-production-origin-inventory-v4.json",
  import.meta.url,
);
const ALIAS_CENSUS_URL = new URL(
  "../../docs/evidence/step11-6-production-active-alias-census-v1.json",
  import.meta.url,
);
const SAFE_METHOD_EVIDENCE_URL = new URL(
  "../../docs/evidence/step11-6-historical-safe-method-google-writer-v2.json",
  import.meta.url,
);
const CREDENTIAL_EVIDENCE_URL = new URL(
  "../../docs/evidence/step11-6-production-google-credential-confinement-v4.json",
  import.meta.url,
);
const EVIDENCE_URL = new URL(
  "../../docs/evidence/step11-6-historical-production-google-writer-scope-v1.json",
  import.meta.url,
);

export const HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_SCHEMA =
  "step11-6-historical-production-google-writer-scope-v1";
export const HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_INVENTORY_SCHEMA =
  "step11-6-production-origin-inventory-v4";
export const HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_ALIAS_SCHEMA =
  "step11-6-production-active-alias-census-v1";
export const HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_ALIAS_RECORDS_FINGERPRINT =
  "c584b50803b59b52e06d8b699afb0cd22b00c980a3f8be0a7b78f7140f98da1a";
export const HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_SAFE_METHOD_EVIDENCE_FINGERPRINT =
  "6cb2ac60314de617f8c94d5d0814d710ec14b47eb4c49fdfa9662fdbe46fcd69";
export const HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_CREDENTIAL_EVIDENCE_FINGERPRINT =
  "6f468334a508553cdb9230c14ad85969c89169df6a2ec88011fb2e7e30c9656a";
export const HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_CANONICAL_SHEETS_FINGERPRINT =
  "cf8e81dc38a72501fa87c2178f9a6fe06487dc8eeb3e3091169037941f2d2cb7";
export const HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_UNRESOLVED_ORIGINS_FINGERPRINT =
  "62f14a6635bc9ec16ce681e04b17bbd0f39e9ff55a858bbcb75f4aa75bc3bc4d";
export const HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_IMMUTABLE_DENY_FINGERPRINT =
  "1a687f3ea97d9e9d2fe65e6732be2c1d9b80aa563370338d26a71b23a3ffa12f";
export const HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_ALIAS_AWARE_DENY_FINGERPRINT =
  "3bbe7725448889d88678eb79501a3908613f7e3949f6a026e7b4855477540521";
export const HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_UNRESOLVED_ALIAS_FINGERPRINT =
  "7b405a5825ff6abb30c24e48aee1681923df549ca47b044e48e8cb0bc83d1aec";
export const HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_EXECUTABLE_ALL_METHOD_HOSTS_FINGERPRINT =
  "0423e6a742d6527b10afc071856dbc6c5b1cca5e1ffb09a5d2523d0f04b31c0c";

// The historical artifact remains byte-stable. This generator-backed dynamic
// contract is instead instantiated from each signed provider challenge because
// the two current candidate hosts may change between rehearsals.
export function buildProductionGoogleWriterCriticalWindowWafContract({
  candidateAliasOrigin,
  candidateImmutableOrigin,
} = {}) {
  const contract = productionGoogleWriterCriticalWindowWafContract({
    candidateAliasOrigin,
    candidateImmutableOrigin,
  });
  if (contract.candidateControlHosts.hostCount !== 2 ||
      contract.exactApplicationAuthenticatedException.requestPath !==
        PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH ||
      contract.exactApplicationAuthenticatedException.requestMethod !==
        PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_METHOD ||
      contract.denyComplement.conditionGroupCount !==
        PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_COMPLEMENT_GROUP_COUNT ||
      contract.denyComplement.everyOtherNoncanonicalHostPathMethodTupleDenied !== true) {
    throw new Error("The critical-window WAF complement drifted from review.");
  }
  return contract;
}

// These two hashes bind the human-reviewed target/method classification to
// the exact retained route and transport blobs. They are populated below
// after the generator's first discovery pass and must never float at runtime.
const EXPECTED_WRITER_TRANSPORT_BLOBS_FINGERPRINT =
  "1d247abede703c4af1efd9d7efe85e4627cac9eabb0f134a6ffd22b588cdc3cb";
const EXPECTED_CANONICAL_ROUTE_BLOB_BINDINGS_FINGERPRINT =
  "81ca821971a5eeba6cd51e8f7eb7b0b90137bc00424ff50d6bad84b46d0c063f";

const PROVIDER_RECORD_TUPLE = Object.freeze([
  "deploymentId", "sha", "providerCommitSha", "origin", "deploymentTarget",
  "gitBranch", "providerSource", "deploymentStatus", "createdAt", "shaResolution",
]);
const ALIAS_RECORD_TUPLE = Object.freeze([
  "alias", "deploymentId", "deploymentOrigin", "redirect", "redirectStatusCode",
]);
export const HISTORICAL_PRODUCTION_CANONICAL_MUTATION_ROUTES = Object.freeze([
  "app/api/admin/cms/route.js",
  "app/api/admin/tournament/route.js",
  "app/api/director/route.js",
  "app/api/live-matches/route.js",
  "app/api/scoring/current/route.js",
  "app/api/scoring/matches/[matchId]/route.js",
]);
export const HISTORICAL_PRODUCTION_CANONICAL_MUTATION_METHODS =
  Object.freeze(["POST"]);
export const HISTORICAL_PRODUCTION_CANONICAL_SHEETS = Object.freeze([
  "Admin Audit Log",
  "Awards",
  "Calcutta Ownership",
  "Calcutta Purchases",
  "Calcutta Round Results",
  "Calcutta Standings",
  "Courses",
  "Handicaps",
  "Live Hole Scores",
  "Live Matches",
  "Match Update Log",
  "Matches",
  "Net Skins",
  "Net Skins Result",
  "Players",
  "Team Names",
  "Tournaments",
]);
export const HISTORICAL_PRODUCTION_NONCANONICAL_MUTATION_SHEETS = Object.freeze([
  "Notification Log",
  "Odds Control",
  "Odds Player Results",
  "Odds Snapshots",
  "Odds Team Results",
  "Player Passport",
  "Round Scorecards",
  "Trusted Devices",
]);
export const HISTORICAL_PRODUCTION_SOURCE_UNRESOLVED_SHAS = Object.freeze([
  "07685fc6f9e6db05c103493eb34e35425023aa42",
  "87d9661818b335a00dfe5f12dbc96531bf005ace",
  "fd3e2d11b19cc15c6120e2990c0b2c3dbcf95785",
]);
export const HISTORICAL_PRODUCTION_DEDICATED_CANONICAL_CANDIDATES = Object.freeze([
  Object.freeze({
    deploymentId: "dpl_2oK3GmMa8f93wqjHNp1Gp2Y6Paox",
    sha: "a0b79cdef3a34d640e9411035792bd1e91989566",
    origin: "https://bagger-pmt7catuz-sandbagger-invitational.vercel.app",
  }),
  Object.freeze({
    deploymentId: "dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm",
    sha: "0671bb3b84ac5846218ea60838fe4e1cc07de97f",
    origin: "https://bagger-6lfjugfk7-sandbagger-invitational.vercel.app",
  }),
]);
export const HISTORICAL_PRODUCTION_CURRENT_UNSAFE_ALIASES = Object.freeze([
  Object.freeze({
    alias: "https://bagger-inv-git-agent-course-hole-be25e6-sandbagger-invitational.vercel.app",
    deploymentId: "dpl_73dJVxZVEXkUqrinj17RHVFcjP7j",
    policy: "DENY_UNLESS_REMOVED_OR_MOVED_TO_AUDITED_SOURCE",
  }),
  Object.freeze({
    alias: "https://bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app",
    deploymentId: "dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm",
    policy: "MOVE_TO_BARRIER_AWARE_CANDIDATE_BEFORE_CLOSE",
  }),
]);

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const DISCOVERY_TOKEN = Symbol("historical-writer-scope-discovery");
const exactArray = (value, expected) =>
  Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected);
const sortedUnique = (values) => [...new Set(values)].sort(compare);
const origin = (host) => `https://${host}`;

function git(args, { input, maxBuffer = 256 * 1024 * 1024 } = {}) {
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

function batchCheck(specs) {
  if (!specs.length) return [];
  const output = git(["cat-file", "--batch-check=%(objectname) %(objecttype)"], {
    input: Buffer.from(`${specs.join("\n")}\n`),
  }).toString("utf8").trim().split("\n");
  if (output.length !== specs.length) {
    throw new Error("The historical Git object audit returned an incomplete response.");
  }
  return output.map((line, index) => {
    if (line === `${specs[index]} missing`) return null;
    const match = line.match(/^([0-9a-f]{40}) (commit|blob)$/);
    if (!match) throw new Error(`Unexpected Git object response: ${line}`);
    return { objectId: match[1], objectType: match[2] };
  });
}

function batchBodies(objectIds) {
  if (!objectIds.length) return new Map();
  const output = git(["cat-file", "--batch"], {
    input: Buffer.from(`${objectIds.join("\n")}\n`),
    maxBuffer: 512 * 1024 * 1024,
  });
  const bodies = new Map();
  let offset = 0;
  for (const objectId of objectIds) {
    const newline = output.indexOf(10, offset);
    if (newline < 0) throw new Error("Historical Git batch output ended before its header.");
    const header = output.subarray(offset, newline).toString("utf8");
    offset = newline + 1;
    const match = header.match(/^([0-9a-f]{40}) blob (\d+)$/);
    if (!match || match[1] !== objectId) {
      throw new Error(`Unexpected historical Git batch header: ${header}`);
    }
    const length = Number(match[2]);
    bodies.set(objectId, output.subarray(offset, offset + length).toString("utf8"));
    offset += length + 1;
  }
  return bodies;
}

function validateInventory(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.schemaVersion !== HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_INVENTORY_SCHEMA ||
      !exactArray(value.providerRecordTuple, PROVIDER_RECORD_TUPLE) ||
      !Array.isArray(value.providerRecords) ||
      value.providerRecordCount !== value.providerRecords.length ||
      sha256(JSON.stringify(value.providerRecords)) !== value.providerRecordsFingerprint) {
    throw new Error("The retained Production origin inventory was invalid.");
  }
  return value;
}

function validateAliasCensus(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.schemaVersion !== HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_ALIAS_SCHEMA ||
      value.vercelTeamId !== "team_kPw5zaib8uaQJALAwj4fWI6R" ||
      value.vercelProjectId !== "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU" ||
      value.providerEndpoint !== "/v4/aliases" || value.requestLimit !== 100 ||
      value.pagination?.count !== 56 || value.pagination?.next !== null ||
      !exactArray(value.recordTuple, ALIAS_RECORD_TUPLE) ||
      !Array.isArray(value.records) || value.recordCount !== value.records.length ||
      value.recordCount !== 56 ||
      JSON.stringify(value.records) !==
        JSON.stringify([...value.records].sort(([left], [right]) => compare(left, right))) ||
      new Set(value.records.map((record) => record[0])).size !== value.records.length ||
      sha256(JSON.stringify(value.records)) !== value.recordsFingerprint ||
      value.recordsFingerprint !==
        HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_ALIAS_RECORDS_FINGERPRINT) {
    throw new Error("The retained exact active-alias census was invalid or stale.");
  }
  return value;
}

function exactReviewedArray(value, expected, label) {
  if (!exactArray(value, expected)) throw new Error(`${label} drifted from its reviewed set.`);
  return value;
}

function objectMap(specs) {
  const objects = batchCheck(specs);
  return new Map(specs.map((spec, index) => [spec, objects[index]]));
}

function exportedMethods(body) {
  return sortedUnique([...body.matchAll(
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g,
  )].map((match) => match[1]));
}

function mutatingTransportMethods(body) {
  return sortedUnique([...body.matchAll(
    /method\s*:\s*["'](POST|PUT|PATCH|DELETE)["']/g,
  )].map((match) => match[1]));
}

function recordObject(record) {
  return Object.freeze({
    deploymentId: record[0], sha: record[1], origin: record[3],
    deploymentTarget: record[4], gitBranch: record[5], providerSource: record[6],
    deploymentStatus: record[7], shaResolution: record[9],
  });
}

function deriveHistoricalSource(inventory) {
  const retained = inventory.providerRecords;
  const ready = inventory.providerRecords.filter((record) => record[7] === "READY");
  const allNonNullShas = sortedUnique(retained.map((record) => record[1]).filter(Boolean));
  const allCommitObjects = batchCheck(allNonNullShas);
  const allAvailableShas = [];
  const allMissingShas = [];
  for (let index = 0; index < allNonNullShas.length; index += 1) {
    if (allCommitObjects[index]?.objectType === "commit") {
      allAvailableShas.push(allNonNullShas[index]);
    } else if (allCommitObjects[index] === null) {
      allMissingShas.push(allNonNullShas[index]);
    }
    else throw new Error("A retained deployment SHA was not a Git commit.");
  }
  exactReviewedArray(allMissingShas, [...HISTORICAL_PRODUCTION_SOURCE_UNRESOLVED_SHAS],
    "The source-unresolved SHA inventory");

  const readyNonNullShas = sortedUnique(ready.map((record) => record[1]).filter(Boolean));
  const allAvailableSet = new Set(allAvailableShas);
  const allMissingSet = new Set(allMissingShas);
  const availableShas = readyNonNullShas.filter((sha) => allAvailableSet.has(sha));
  const missingShas = readyNonNullShas.filter((sha) => allMissingSet.has(sha));

  const availableSet = new Set(availableShas);
  const unresolvedRecords = ready.filter((record) => !record[1] || !availableSet.has(record[1]))
    .map(recordObject).sort((left, right) => compare(left.origin, right.origin));
  const unresolvedOrigins = unresolvedRecords.map((record) => record.origin);
  if (unresolvedRecords.length !== 8 ||
      sha256(JSON.stringify(unresolvedOrigins)) !==
        HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_UNRESOLVED_ORIGINS_FINGERPRINT) {
    throw new Error("The eight source-unresolved READY origins drifted.");
  }

  const writerSpecs = availableShas.map((sha) => `${sha}:lib/google-sheets-write.js`);
  const writerObjects = objectMap(writerSpecs);
  const writerBlobs = sortedUnique(writerSpecs.map((spec) => writerObjects.get(spec)?.objectId)
    .filter(Boolean));
  const writerBodies = batchBodies(writerBlobs);
  const writerTransportMethods = sortedUnique(writerBlobs.flatMap((blob) =>
    mutatingTransportMethods(writerBodies.get(blob))));
  const timeoutProtectedBlobs = writerBlobs.filter((blob) =>
    /AbortSignal\.timeout\s*\(|AbortController\s*\(/.test(writerBodies.get(blob)));

  const routeSpecs = availableShas.flatMap((sha) =>
    HISTORICAL_PRODUCTION_CANONICAL_MUTATION_ROUTES.map((path) => `${sha}:${path}`));
  const routeObjects = objectMap(routeSpecs);
  const routeBlobBindings = sortedUnique(routeSpecs.flatMap((spec) => {
    const object = routeObjects.get(spec);
    if (!object) return [];
    const path = spec.slice(spec.indexOf(":") + 1);
    return [`${path}\n${object.objectId}`];
  })).map((entry) => entry.split("\n"));
  const routeBlobs = sortedUnique(routeBlobBindings.map(([, blob]) => blob));
  const routeBodies = batchBodies(routeBlobs);
  const observedRouteMethods = sortedUnique(routeBlobs.flatMap((blob) =>
    exportedMethods(routeBodies.get(blob))));
  if (observedRouteMethods.some((method) => !["GET", "POST"].includes(method)) ||
      !observedRouteMethods.includes("POST")) {
    throw new Error("A historical canonical route exposed an unreviewed HTTP method.");
  }

  const markerPaths = [
    "lib/google-service-account-credential-context.js",
    "lib/google-sheets-write.js",
    "lib/production-cutover-scoring-ingress.js",
  ];
  const markerSpecs = availableShas.flatMap((sha) => markerPaths.map((path) => `${sha}:${path}`));
  const markerObjects = objectMap(markerSpecs);
  const markerBlobs = sortedUnique(markerSpecs.map((spec) => markerObjects.get(spec)?.objectId)
    .filter(Boolean));
  const markerBodies = batchBodies(markerBlobs);
  const historicalDedicatedMarkerShas = availableShas.filter((sha) => {
    const bodies = Object.fromEntries(markerPaths.map((path) => {
      const blob = markerObjects.get(`${sha}:${path}`)?.objectId;
      return [path, blob ? markerBodies.get(blob) : ""];
    }));
    return /CANONICAL_LEGACY_V2/.test(bodies[markerPaths[0]]) &&
      /production-worker/.test(bodies[markerPaths[0]]) &&
      /credentialSource\s*===\s*["']production-worker["']/.test(bodies[markerPaths[1]]) &&
      /CANONICAL_LEGACY_V2/.test(bodies[markerPaths[1]]) &&
      /CANONICAL_LEGACY_V2/.test(bodies[markerPaths[2]]);
  });
  const dedicatedShas = historicalDedicatedMarkerShas.filter((sha) => {
    const credentialBlob = markerObjects.get(`${sha}:${markerPaths[0]}`)?.objectId;
    const writerBlob = markerObjects.get(`${sha}:${markerPaths[1]}`)?.objectId;
    const ingressBlob = markerObjects.get(`${sha}:${markerPaths[2]}`)?.objectId;
    return /assertProductionGoogleServiceAccountMutationBinding/.test(
      credentialBlob ? markerBodies.get(credentialBlob) : "",
    ) && /assertProductionGoogleServiceAccountMutationBinding/.test(
      writerBlob ? markerBodies.get(writerBlob) : "",
    ) && /registerProductionGoogleAdmissionCapability/.test(
      ingressBlob ? markerBodies.get(ingressBlob) : "",
    );
  });
  const dedicatedShaSet = new Set(dedicatedShas);
  const dedicatedCandidates = ready.filter((record) => dedicatedShaSet.has(record[1]))
    .map((record) => ({ deploymentId: record[0], sha: record[1], origin: record[3] }))
    .sort((left, right) => compare(left.origin, right.origin));
  const expectedDedicated = [...HISTORICAL_PRODUCTION_DEDICATED_CANONICAL_CANDIDATES]
    .map((record) => ({ ...record })).sort((left, right) => compare(left.origin, right.origin));
  if (JSON.stringify(dedicatedCandidates) !== JSON.stringify(expectedDedicated)) {
    throw new Error("The current dedicated Production canonical candidate set drifted.");
  }

  return {
    retained, allNonNullShas, allAvailableShas, allMissingShas,
    ready, availableShas, missingShas, unresolvedRecords, unresolvedOrigins,
    writerBlobs, writerTransportMethods, timeoutProtectedBlobs,
    routeBlobBindings, routeBlobs, observedRouteMethods, dedicatedCandidates,
    historicalDedicatedMarkerShas,
  };
}

function validateBoundEvidence(safeMethod, credential) {
  if (safeMethod?.evidenceFingerprint !==
        HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_SAFE_METHOD_EVIDENCE_FINGERPRINT ||
      safeMethod?.historicalSafeMethodWriter?.affectedReadyOriginCount !== 236 ||
      safeMethod?.historicalSafeMethodWriter?.explicitMutatingMethods?.join(",") !== "GET" ||
      safeMethod?.historicalSafeMethodWriter?.frameworkDispatchedPotentialMutatingMethods
        ?.join(",") !== "HEAD" ||
      safeMethod?.providerFenceContract?.blockedRequestPaths?.join(",") !==
        "/api/cron/round-scorecards-archive" ||
      safeMethod?.providerFenceContract?.methodScope !== "ALL_METHODS") {
    throw new Error("The historical safe-method writer evidence drifted.");
  }
  if (credential?.evidenceFingerprint !==
      HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_CREDENTIAL_EVIDENCE_FINGERPRINT) {
    throw new Error("The credential-confinement evidence drifted.");
  }
}

export function buildHistoricalProductionGoogleWriterScopeEvidence({
  inventory = JSON.parse(readFileSync(INVENTORY_URL, "utf8")),
  aliasCensus = JSON.parse(readFileSync(ALIAS_CENSUS_URL, "utf8")),
  safeMethodEvidence = JSON.parse(readFileSync(SAFE_METHOD_EVIDENCE_URL, "utf8")),
  credentialEvidence = JSON.parse(readFileSync(CREDENTIAL_EVIDENCE_URL, "utf8")),
  reviewedCanonicalRoutes = [...HISTORICAL_PRODUCTION_CANONICAL_MUTATION_ROUTES],
  reviewedCanonicalMethods = [...HISTORICAL_PRODUCTION_CANONICAL_MUTATION_METHODS],
  reviewedHistoricalCanonicalSheets = [...HISTORICAL_PRODUCTION_CANONICAL_SHEETS],
  reviewedDedicatedCandidates = [...HISTORICAL_PRODUCTION_DEDICATED_CANONICAL_CANDIDATES],
  unresolvedDynamicCanonicalTargetCount = 0,
  reviewedPermanentWafCanonicalHostname = "baggerinv.com",
  reviewedPermanentWafSafeMethods = ["GET", "HEAD", "OPTIONS"],
  reviewedPermanentWafRoundScorecardsPath =
    "/api/cron/round-scorecards-archive",
  reviewedSettlementFinishAndCloseRpc =
    "finish_close_production_google_writer_provider_fence_install",
  discoveryToken,
} = {}) {
  const enforceSourceBindings = discoveryToken !== DISCOVERY_TOKEN;
  const normalizedInventory = validateInventory(inventory);
  const normalizedAliases = validateAliasCensus(aliasCensus);
  validateBoundEvidence(safeMethodEvidence, credentialEvidence);
  exactReviewedArray(reviewedCanonicalRoutes,
    [...HISTORICAL_PRODUCTION_CANONICAL_MUTATION_ROUTES], "Canonical route scope");
  exactReviewedArray(reviewedCanonicalMethods,
    [...HISTORICAL_PRODUCTION_CANONICAL_MUTATION_METHODS], "Canonical HTTP method scope");
  exactReviewedArray(reviewedHistoricalCanonicalSheets,
    [...HISTORICAL_PRODUCTION_CANONICAL_SHEETS], "Historical canonical sheet scope");
  if (JSON.stringify(reviewedDedicatedCandidates) !==
      JSON.stringify(HISTORICAL_PRODUCTION_DEDICATED_CANONICAL_CANDIDATES) ||
      unresolvedDynamicCanonicalTargetCount !== 0) {
    throw new Error("Dedicated markers or dynamic canonical targets drifted from review.");
  }
  if (reviewedPermanentWafCanonicalHostname !== "baggerinv.com" ||
      JSON.stringify(reviewedPermanentWafSafeMethods) !==
        JSON.stringify(["GET", "HEAD", "OPTIONS"]) ||
      reviewedPermanentWafRoundScorecardsPath !==
        "/api/cron/round-scorecards-archive" ||
      reviewedSettlementFinishAndCloseRpc !==
        "finish_close_production_google_writer_provider_fence_install") {
    throw new Error("The permanent WAF or settlement contract drifted from review.");
  }

  const source = deriveHistoricalSource(normalizedInventory);
  const writerBlobsFingerprint = sha256(JSON.stringify(source.writerBlobs));
  const routeBlobBindingsFingerprint = sha256(JSON.stringify(source.routeBlobBindings));
  if (enforceSourceBindings &&
      (writerBlobsFingerprint !== EXPECTED_WRITER_TRANSPORT_BLOBS_FINGERPRINT ||
       routeBlobBindingsFingerprint !== EXPECTED_CANONICAL_ROUTE_BLOB_BINDINGS_FINGERPRINT)) {
    throw new Error("The exact historical route/transport source binding drifted.");
  }

  const currentSheets = [...PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES].sort(compare);
  const historicalSheets = [...reviewedHistoricalCanonicalSheets].sort(compare);
  const currentMinusHistorical = currentSheets.filter((sheet) => !historicalSheets.includes(sheet));
  const historicalMinusCurrent = historicalSheets.filter((sheet) => !currentSheets.includes(sheet));
  const union = sortedUnique([...currentSheets, ...historicalSheets]);
  if (currentMinusHistorical.length || historicalMinusCurrent.length || union.length !== 17 ||
      sha256(JSON.stringify(union)) !==
        HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_CANONICAL_SHEETS_FINGERPRINT) {
    throw new Error("Current and historical canonical Google sheet scopes diverged.");
  }

  const immutableDenyOrigins = sortedUnique([
    ...source.unresolvedOrigins,
    ...source.dedicatedCandidates.map((record) => record.origin),
  ]);
  if (immutableDenyOrigins.length !== 10 || sha256(JSON.stringify(immutableDenyOrigins)) !==
      HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_IMMUTABLE_DENY_FINGERPRINT) {
    throw new Error("The persistent immutable all-method deny set drifted.");
  }
  const denyDeploymentIds = new Set([
    ...source.unresolvedRecords.map((record) => record.deploymentId),
    ...source.dedicatedCandidates.map((record) => record.deploymentId),
  ]);
  const unsafeAliases = normalizedAliases.records
    .filter((record) => denyDeploymentIds.has(record[1]))
    .map((record) => ({ alias: origin(record[0]), deploymentId: record[1] }))
    .sort((left, right) => compare(left.alias, right.alias));
  const expectedUnsafeAliases = HISTORICAL_PRODUCTION_CURRENT_UNSAFE_ALIASES
    .map(({ alias, deploymentId }) => ({ alias, deploymentId }))
    .sort((left, right) => compare(left.alias, right.alias));
  if (JSON.stringify(unsafeAliases) !== JSON.stringify(expectedUnsafeAliases)) {
    throw new Error("The active alias-to-unsafe-deployment mapping drifted.");
  }
  const aliasAwareDenyOrigins = sortedUnique([
    ...immutableDenyOrigins,
    ...unsafeAliases.map((record) => record.alias),
  ]);
  if (aliasAwareDenyOrigins.length !== 12 ||
      sha256(JSON.stringify(aliasAwareDenyOrigins)) !==
        HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_ALIAS_AWARE_DENY_FINGERPRINT) {
    throw new Error("The current alias-aware all-method deny set drifted.");
  }
  const unresolvedDeploymentIds = new Set(source.unresolvedRecords.map((record) =>
    record.deploymentId));
  const unresolvedAliases = unsafeAliases.filter((record) =>
    unresolvedDeploymentIds.has(record.deploymentId));
  const unresolvedAliasOrigins = unresolvedAliases.map((record) => record.alias);
  if (unresolvedAliasOrigins.length !== 1 ||
      sha256(JSON.stringify(unresolvedAliasOrigins)) !==
        HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_UNRESOLVED_ALIAS_FINGERPRINT) {
    throw new Error("The current source-unresolved alias set drifted.");
  }
  const executableAllMethodHostOrigins = sortedUnique([
    ...source.unresolvedOrigins,
    ...unresolvedAliasOrigins,
  ]);
  if (executableAllMethodHostOrigins.length !== 9 ||
      sha256(JSON.stringify(executableAllMethodHostOrigins)) !==
        HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_EXECUTABLE_ALL_METHOD_HOSTS_FINGERPRINT) {
    throw new Error("The executable all-method hostname fence drifted.");
  }

  const base = {
    schemaVersion: HISTORICAL_PRODUCTION_GOOGLE_WRITER_SCOPE_SCHEMA,
    inputs: {
      originInventorySchemaVersion: normalizedInventory.schemaVersion,
      originInventoryProviderRecordCount: normalizedInventory.providerRecordCount,
      originInventoryProviderRecordsFingerprint:
        normalizedInventory.providerRecordsFingerprint,
      activeAliasCensusSchemaVersion: normalizedAliases.schemaVersion,
      activeAliasCensusCapturedAt: normalizedAliases.capturedAt,
      activeAliasRecordCount: normalizedAliases.recordCount,
      activeAliasRecordsFingerprint: normalizedAliases.recordsFingerprint,
      credentialConfinementEvidenceFingerprint: credentialEvidence.evidenceFingerprint,
      historicalSafeMethodEvidenceFingerprint: safeMethodEvidence.evidenceFingerprint,
    },
    retainedSourceAudit: {
      retainedDeploymentCount: source.retained.length,
      retainedUniqueNonNullShaCount: source.allNonNullShas.length,
      locallyResolvableRetainedUniqueShaCount: source.allAvailableShas.length,
      locallyUnresolvableRetainedUniqueShaCount: source.allMissingShas.length,
      retainedNullShaDeploymentCount:
        source.retained.filter((record) => !record[1]).length,
      readyNullShaDeploymentCount: source.ready.filter((record) => !record[1]).length,
      nonReadyNullShaDeploymentCount:
        source.retained.filter((record) => record[7] !== "READY" && !record[1]).length,
      locallyUnresolvableShaList: source.allMissingShas,
      readyDeploymentCount: source.ready.length,
      readyUniqueNonNullShaCount: source.availableShas.length + source.missingShas.length,
      locallyResolvableReadyUniqueShaCount: source.availableShas.length,
      locallyUnresolvableReadyUniqueShaCount: source.missingShas.length,
      sourceUnresolvedReadyDeploymentCount: source.unresolvedRecords.length,
      sourceUnresolvedReadyOriginsFingerprint: sha256(JSON.stringify(source.unresolvedOrigins)),
      sourceUnresolvedReadyDeployments: source.unresolvedRecords,
      googleSheetsWritePresentUniqueBlobCount: source.writerBlobs.length,
      googleSheetsWriteBlobsFingerprint: writerBlobsFingerprint,
      canonicalRouteBlobBindingCount: source.routeBlobBindings.length,
      canonicalRouteBlobBindingsFingerprint: routeBlobBindingsFingerprint,
      canonicalRoutePaths: reviewedCanonicalRoutes,
      canonicalMutationMethods: reviewedCanonicalMethods,
      observedCanonicalRouteExportedMethodUnion: source.observedRouteMethods,
      observedGoogleTransportMutationMethodUnion: source.writerTransportMethods,
      reviewedSourceBindingStatus: enforceSourceBindings ? "EXACT" : "DISCOVERY",
    },
    canonicalWorksheetScope: {
      derivation: "REVIEWED_EXACT_ROUTE_AND_TRANSPORT_BLOB_BINDING",
      historicalCanonicalSheets: historicalSheets,
      currentCanonicalSheets: currentSheets,
      currentUnionHistoricalCanonicalSheets: union,
      currentUnionHistoricalCanonicalSheetCount: union.length,
      currentUnionHistoricalCanonicalSheetsFingerprint: sha256(JSON.stringify(union)),
      currentMinusHistorical: currentMinusHistorical,
      historicalMinusCurrent: historicalMinusCurrent,
      unresolvedDynamicCanonicalTargetCount,
      sourceUnresolvedDynamicTargetsPolicy:
        "ALL_METHOD_HOST_DENY_UNTIL_SOURCE_IS_AUDITABLE",
      noncanonicalMutationSheetsExcludedFromCanonicalRangeFence:
        [...HISTORICAL_PRODUCTION_NONCANONICAL_MUTATION_SHEETS],
    },
    dedicatedProductionCredentialCandidates: {
      markerContract:
        "CURRENT_DISPATCH_BOUND_CANONICAL_LEGACY_V2_AND_PRODUCTION_WORKER",
      historicalMarkerBearingUniqueShaCount:
        source.historicalDedicatedMarkerShas.length,
      historicalMarkerBearingPreviewRuntimePolicy:
        "CANONICAL_DEDICATED_SELECTION_REQUIRES_VERCEL_ENV_EXACT_PRODUCTION",
      historicalMarkerBearingCanonicalRoutesUseOnlyPost: true,
      historicalMarkerBearingDeploymentsCoveredByProjectWidePostFence: true,
      count: source.dedicatedCandidates.length,
      candidates: source.dedicatedCandidates.map((record) => ({
        ...record,
        deploymentTarget: "PREVIEW",
        runtimeProductionGate: "VERCEL_ENV_EXACT_PRODUCTION",
        productionCanonicalCredentialReachableInRetainedPreviewDeployment: false,
        persistentAllMethodHostDenyRequiredAsDefenseInDepth: true,
      })),
      nameOnlyProviderEvidence: {
        source: "READ_ONLY_VERCEL_DEPLOYMENT_ENV_NAME_AUDIT",
        sourceUnresolvedReadyEnvNames: [
          "GOOGLE_PRIVATE_KEY", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SHEETS_ID",
        ],
        dedicatedCandidateAdditionalEnvNames: [
          "PRODUCTION_GOOGLE_PRIVATE_KEY", "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL",
        ],
        secretValuesRetained: false,
      },
    },
    persistentProviderFence: {
      immutableAllMethodDenyOrigins: immutableDenyOrigins,
      immutableAllMethodDenyOriginCount: immutableDenyOrigins.length,
      immutableAllMethodDenyOriginsFingerprint: sha256(JSON.stringify(immutableDenyOrigins)),
      currentAliasAwareAllMethodDenyOrigins: aliasAwareDenyOrigins,
      currentAliasAwareAllMethodDenyOriginCount: aliasAwareDenyOrigins.length,
      currentAliasAwareAllMethodDenyOriginsFingerprint:
        sha256(JSON.stringify(aliasAwareDenyOrigins)),
      executableAllMethodHostOrigins,
      executableAllMethodHostOriginCount: executableAllMethodHostOrigins.length,
      executableAllMethodHostOriginsFingerprint:
        sha256(JSON.stringify(executableAllMethodHostOrigins)),
      activeUnsafeAliases: HISTORICAL_PRODUCTION_CURRENT_UNSAFE_ALIASES,
      featureAliasMustMoveToBarrierAwareCandidateBeforeClose: true,
      courseHoleAliasMustRemainDeniedUnlessRemovedOrMovedToAuditedSource: true,
      twoConsecutiveProviderAliasRecapturesRequiredBeforeClose: true,
      liveProviderAliasDriftFailsClosed: true,
      permanentWafContract: {
        canonicalHostname: reviewedPermanentWafCanonicalHostname,
        action: "DENY",
        active: true,
        projectWide: true,
        earlierActiveBypassRuleCount: 0,
        noncanonicalCanonicalMutationGroup: {
          hostnameOperator: "DOES_NOT_EQUAL",
          requestPathOperator: "DOES_NOT_EQUAL",
          requestPath: "/api/admin/step11-6-production-google-writer-fence",
          methodOperator: "IS_NOT_ANY_OF",
          methods: reviewedPermanentWafSafeMethods,
        },
        sourceUnresolvedAndUnsafeAliasAllMethodGroup: {
          hostCount: executableAllMethodHostOrigins.length,
          hostsFingerprint: sha256(JSON.stringify(executableAllMethodHostOrigins)),
          sourceUnresolvedImmutableOriginCount: source.unresolvedOrigins.length,
          sourceUnresolvedImmutableOriginsFingerprint:
            sha256(JSON.stringify(source.unresolvedOrigins)),
          exactUnsafeAliasCount: unresolvedAliasOrigins.length,
          exactUnsafeAliasesFingerprint: sha256(JSON.stringify(unresolvedAliasOrigins)),
          exactUnsafeAliasIncludedAsIncomingRequestHostname: true,
        },
        noncanonicalRoundScorecardsAllMethodGroup: {
          hostnameOperator: "DOES_NOT_EQUAL",
          pathOperator: "IS_ANY_OF",
          paths: [reviewedPermanentWafRoundScorecardsPath],
          methods: "ALL_METHODS",
        },
        aliasRecapture: {
          requiredConsecutiveProviderCaptures: 2,
          providerSignedBeginAndFinalizeCapturesRequired: true,
          browserSuppliedAliasInventoryAllowed: false,
          providerAdminChangeFreezeRequired: true,
          featureAliasMustResolveToBarrierAwareCandidate: true,
          courseHoleAliasMustRemainInDeniedImmutableDeploymentSet: true,
          failClosedOnAnyAliasDrift: true,
        },
        historicalEvidenceBindings: {
          immutableOriginCount: immutableDenyOrigins.length,
          immutableOriginsFingerprint: sha256(JSON.stringify(immutableDenyOrigins)),
          aliasAwareOriginCount: aliasAwareDenyOrigins.length,
          aliasAwareOriginsFingerprint: sha256(JSON.stringify(aliasAwareDenyOrigins)),
        },
      },
    },
    historicalRoundScorecardsSafeMethodWriter: {
      operationClass: "MIRROR_ARCHIVE",
      requestPath: "/api/cron/round-scorecards-archive",
      explicitMethods: ["GET"],
      implicitFrameworkMethods: ["HEAD"],
      affectedReadyOriginCount:
        safeMethodEvidence.historicalSafeMethodWriter.affectedReadyOriginCount,
      affectedReadyOriginsFingerprint:
        safeMethodEvidence.historicalSafeMethodWriter.affectedReadyOriginsFingerprint,
      everyAffectedDeploymentTarget: "PREVIEW",
      historicalBuildTimeWorkbookValuesProvenPreviewOnly: false,
      productionWorkbookExecutionExcludedByNameOnlyEvidence: false,
      conclusion:
        "NAME_ONLY_AND_CURRENT_SCOPE_EVIDENCE_CANNOT_EXCLUDE_HISTORICAL_PRODUCTION_WORKBOOK_EXECUTION",
      requiredControl: {
        type: "PERSISTENT_PROJECT_WIDE_PATH_DENY",
        path: "/api/cron/round-scorecards-archive",
        methods: "ALL_METHODS",
        canonicalSeventeenSheetFenceExpanded: false,
      },
    },
    quiesceDurationSafety: {
      configuredWafQuiesceSeconds: 300,
      providerObservedCanonicalFunctionTimeoutSeconds: 300,
      providerEvidenceDeploymentId: "dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm",
      providerEvidenceCanonicalRouteCount: 6,
      historicalReadyProviderFunctionTimeoutsExhaustivelyObserved: false,
      anyReadyOriginCouldOutliveConfiguredWafSecondsExcluded: false,
      strictlyGreaterThanObservedFunctionTimeout: false,
      historicalWriterTransportBlobCount: source.writerBlobs.length,
      writerTransportBlobWithExplicitAbortTimeoutCount: source.timeoutProtectedBlobs.length,
      writerTransportBlobWithoutExplicitAbortTimeoutCount:
        source.writerBlobs.length - source.timeoutProtectedBlobs.length,
      ambiguousDispatchedGoogleRequestCanBeExcludedByElapsedTimeAlone: false,
      safe: false,
      blocker:
        "300_SECONDS_HAS_NO_MARGIN_OVER_A_300_SECOND_FUNCTION_AND_HISTORICAL_GOOGLE_FETCHES_CAN_REMAIN_AMBIGUOUS",
      requiredMinimumPolicy:
        "WAIT_LONGER_THAN_MAX_PROVIDER_FUNCTION_DURATION_AND_REQUIRE_ZERO_UNRESOLVED_REQUEST_LOGS_PLUS_GOOGLE_READBACK_IDEMPOTENCY_RESOLUTION",
      recommendedMinimumQuiesceSeconds: 360,
      classification:
        "DEFENSE_IN_DEPTH_FINDING_PRIMARY_CANONICAL_PROOF_USES_PROTECTED_RANGE_SETTLEMENT",
    },
    primaryCanonicalProviderSettlement: {
      status: "IMPLEMENTED_PENDING_INDEPENDENT_ACCEPTANCE",
      t0Definition:
        "DURABLE_PROTECTED_RANGE_INSTALLATION_PLUS_LEGACY_PRINCIPAL_DENY_CONFIRMED",
      googleSheetsMaximumRequestProcessingSeconds: 180,
      minimumDatabaseClockSecondsAfterT0ForFirstReadback: 190,
      minimumDatabaseClockSecondsBetweenIndependentReadbacks: 10,
      minimumTotalDatabaseClockSecondsAfterT0: 200,
      firstReadbackRequiresExactCanonicalSeventeenSheetFingerprint: true,
      secondReadbackRequiresIndependentExactCanonicalSeventeenSheetFingerprint: true,
      unresolvedGoogleRequestsMustEqualZero: true,
      ownerWritesMustRemainFrozen: true,
      closeTransitionMustBeAtomicWithSecondReadback: true,
      finishAndCloseRpc: reviewedSettlementFinishAndCloseRpc,
      resumableStages: [
        "AWAITING_PROTECTIONS_INSTALLED",
        "PROTECTIONS_INSTALLED",
        "SETTLEMENT_READBACK_1",
        "SETTLEMENT_READBACK_2",
      ],
      allowsElapsedWafDurationAloneAsProof: false,
      acceptedAsPrimaryProof: false,
    },
    conclusion: {
      protectedCurrentUnionHistoricalCanonicalRangesRequired: true,
      persistentAllMethodFenceForSourceUnresolvedAndDedicatedCandidatesRequired: true,
      persistentNarrowRoundScorecardsPathFenceRequired: true,
      unknownDynamicTargetFailsClosedOrOriginRemainsDenied: true,
      canonicalSheetFencePlusAliasAwareProviderFenceSufficientOnlyWithRuntimeGateProof: true,
      unexplainedHistoricalCanonicalSheetDifferenceCount: 0,
      unexplainedConcurrencyWindowCount: 1,
      concurrencyBlocker:
        "PROVIDER_SETTLEMENT_INDEPENDENT_ACCEPTANCE_PENDING",
    },
  };
  return { ...base, evidenceFingerprint: sha256(JSON.stringify(base)) };
}

export function verifyHistoricalProductionGoogleWriterScopeEvidence() {
  const expected = buildHistoricalProductionGoogleWriterScopeEvidence();
  const actual = JSON.parse(readFileSync(EVIDENCE_URL, "utf8"));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("The committed historical Production Google writer-scope evidence is stale.");
  }
  return actual;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  if (process.argv.includes("--discover")) {
    const evidence = buildHistoricalProductionGoogleWriterScopeEvidence({
      discoveryToken: DISCOVERY_TOKEN,
    });
    process.stdout.write(`${JSON.stringify({
      writerBlobsFingerprint:
        evidence.retainedSourceAudit.googleSheetsWriteBlobsFingerprint,
      writerBlobCount: evidence.retainedSourceAudit.googleSheetsWritePresentUniqueBlobCount,
      routeBlobBindingsFingerprint:
        evidence.retainedSourceAudit.canonicalRouteBlobBindingsFingerprint,
      routeBlobBindingCount: evidence.retainedSourceAudit.canonicalRouteBlobBindingCount,
      observedRouteMethods:
        evidence.retainedSourceAudit.observedCanonicalRouteExportedMethodUnion,
      observedTransportMethods:
        evidence.retainedSourceAudit.observedGoogleTransportMutationMethodUnion,
      writerBlobsWithAbortTimeout:
        evidence.quiesceDurationSafety.writerTransportBlobWithExplicitAbortTimeoutCount,
      evidenceFingerprint: evidence.evidenceFingerprint,
    }, null, 2)}\n`);
  } else if (process.argv.includes("--write")) {
    writeFileSync(
      EVIDENCE_URL,
      `${JSON.stringify(buildHistoricalProductionGoogleWriterScopeEvidence(), null, 2)}\n`,
      { mode: 0o644 },
    );
  } else {
    verifyHistoricalProductionGoogleWriterScopeEvidence();
  }
}
