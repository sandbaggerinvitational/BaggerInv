import { createHash } from "node:crypto";
import productionOriginInventoryArtifact from
  "../docs/evidence/step11-6-production-origin-inventory.json" with {
    type: "json",
  };

import { PRODUCTION_VERCEL_PROJECT_ID } from
  "./google-service-account-credential-context.js";
import {
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA,
  productionGoogleCredentialConfinementEvidence,
} from "./production-google-credential-confinement.js";
import {
  productionHistoricalSafeMethodGoogleWriterFencePaths,
  PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_PATHS_FINGERPRINT,
} from "./production-google-historical-safe-method-writer.js";

export const PRODUCTION_GOOGLE_WRITER_QUIESCE_VERSION =
  "production-google-writer-quiesce-v1";
export const PRODUCTION_GOOGLE_WRITER_QUIESCE_SCOPE =
  "PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE";
export const PRODUCTION_GOOGLE_WRITER_QUIESCE_OWNER_CONFIRMATIONS = Object.freeze({
  REHEARSAL: "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS REHEARSAL",
  CUTOVER: "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS CUTOVER",
});
export const PRODUCTION_GOOGLE_WRITER_QUIESCE_CANDIDATE_CREDENTIAL_GENERATION =
  "DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1";
export const PRODUCTION_GOOGLE_WRITER_QUIESCE_CONTROL_PATH =
  "/api/admin/step11-6-production-google-writer-fence";
export const PRODUCTION_GOOGLE_WRITER_QUIESCE_ALL_METHOD_PATHS =
  productionHistoricalSafeMethodGoogleWriterFencePaths().paths;
export const PRODUCTION_GOOGLE_WRITER_QUIESCE_ALL_METHOD_PATHS_FINGERPRINT =
  PRODUCTION_HISTORICAL_SAFE_METHOD_WRITER_PATHS_FINGERPRINT;
export const PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_VECTORS = Object.freeze([
  "/api/scoring/current",
  "/api/scoring/matches/__step11_6_probe__",
  "/api/director",
  "/api/live-matches",
  "/api/admin/tournament",
  "/api/admin/cms",
  "/api/odds/publish",
  "/api/tournament-guide",
].map((probePath) => Object.freeze({ probeMethod: "POST", probePath }))
  .concat(Object.freeze({
    probeMethod: "DELETE",
    probePath: "/api/tournament-guide",
  }))
  .concat(PRODUCTION_GOOGLE_WRITER_QUIESCE_ALL_METHOD_PATHS.flatMap((probePath) => [
    Object.freeze({ probeMethod: "GET", probePath }),
    Object.freeze({ probeMethod: "HEAD", probePath }),
  ]))
  .sort((left, right) => {
    const leftKey = `${left.probeMethod}\n${left.probePath}`;
    const rightKey = `${right.probeMethod}\n${right.probePath}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  }));
export const PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_PATHS = Object.freeze(
  [...new Set(PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_VECTORS
    .map((record) => record.probePath))].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0),
);
export const PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT = 1_291;
export const PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT =
  "d238c5eeefef4606e0a05c2d0dbcee1a2b29cd07a2dd480435c0e75a0c3a91a6";
export const PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_SCHEMA =
  "step11-6-production-origin-inventory-v3";
export const PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_COUNT = 1_291;
export const PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_FINGERPRINT =
  "6488da5c86e50bd0c524a94a8c8f97c1aeb8576393fc14d68a7bd76ebe338692";
export const PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_RECORD_TUPLE = Object.freeze([
  "deploymentId", "sha", "providerCommitSha", "origin", "deploymentTarget",
  "gitBranch", "providerSource", "deploymentStatus", "createdAt", "shaResolution",
]);
export const PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_REQUIRED_DEPLOYMENTS =
  Object.freeze({
    priorLive: "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
    frozenStep11: "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
    step11_6Candidate: "dpl_2oK3GmMa8f93wqjHNp1Gp2Y6Paox",
  });
export const PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_RECORD_TUPLE = Object.freeze([
  "deploymentId", "sha", "origin", "scopeClass", "deploymentStatus",
  "providerMetadataFingerprint",
]);
export const PRODUCTION_GOOGLE_WRITER_QUIESCE_VECTOR_COVERAGE_MASK =
  (1 << PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_VECTORS.length) - 1;

const INVENTORY_SCOPE_CLASSES = Object.freeze({
  PRODUCTION_TARGET: Object.freeze({
    deploymentTarget: "PRODUCTION",
    deploymentEnvironment: "PRODUCTION",
    credentialCapabilities: Object.freeze([
      "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
      "PRODUCTION_WORKBOOK_SELECTOR",
    ]),
  }),
  PROJECT_PREVIEW: Object.freeze({
    deploymentTarget: "PREVIEW",
    deploymentEnvironment: "PREVIEW",
    credentialCapabilities: Object.freeze([
      "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
      "POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
      "POTENTIAL_PRODUCTION_WORKBOOK_SELECTOR",
    ]),
  }),
});
const INVENTORY_STATUS_SEMANTICS = Object.freeze({
  READY: Object.freeze({ publiclyReachable: true, writerCapable: true }),
  ERROR: Object.freeze({ publiclyReachable: false, writerCapable: false }),
  BLOCKED: Object.freeze({ publiclyReachable: false, writerCapable: false }),
});
const INVENTORY_PROVIDER_SOURCES = Object.freeze(new Set([
  "CLI", "GIT", "IMPORT", "REDEPLOY", "UNAVAILABLE",
]));
const INVENTORY_SHA_RESOLUTIONS = Object.freeze(new Set([
  "EXACT_PROVIDER", "LOCAL_GIT_ABBREVIATION", "UNAVAILABLE",
]));

export const PRODUCTION_GOOGLE_WRITER_QUIESCE_FIXED_ORIGINS = Object.freeze([
  "https://baggerinv.com",
  "https://www.baggerinv.com",
  "https://bagger-inv.vercel.app",
  "https://bagger-inv-git-main-sandbagger-invitational.vercel.app",
]);
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{8,64}$/;
const SHA40 = /^[0-9a-f]{40}$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{3,200}$/;
const clean = (value) => String(value ?? "").trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const codepointCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function quiesceError(code, message, diagnostics = {}, status = 409) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.safeDiagnostics = Object.freeze({ ...diagnostics });
  return error;
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function normalizedOrigin(value, { requireVercel = false } = {}) {
  try {
    const parsed = new URL(clean(value));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        (parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash ||
        (requireVercel && !parsed.hostname.toLowerCase().endsWith(".vercel.app"))) return "";
    return `https://${parsed.hostname.toLowerCase()}`;
  } catch {
    return "";
  }
}

function exactJson(value, expected) {
  return JSON.stringify(value) === JSON.stringify(expected);
}

function providerMetadataFingerprint(providerRecord) {
  return sha256(JSON.stringify([
    providerRecord[2], providerRecord[4], providerRecord[5], providerRecord[6],
    providerRecord[8], providerRecord[9],
  ]));
}

function projectedInventoryTuple(providerRecord) {
  return Object.freeze([
    providerRecord[0], providerRecord[1], providerRecord[3],
    providerRecord[4] === "PRODUCTION" ? "PRODUCTION_TARGET" : "PROJECT_PREVIEW",
    providerRecord[7], providerMetadataFingerprint(providerRecord),
  ]);
}

function canonicalProviderInventoryRecord(value) {
  if (!Array.isArray(value) || value.length !==
      PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_RECORD_TUPLE.length) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_PROVIDER_INVENTORY_RECORD_INVALID",
      "A retained provider deployment record was not exact.", {}, 400,
    );
  }
  const deploymentId = clean(value[0]);
  const sha = value[1] === null ? null : clean(value[1]).toLowerCase();
  const providerCommitSha = value[2] === null ? null : clean(value[2]).toLowerCase();
  const origin = normalizedOrigin(value[3], { requireVercel: true });
  const deploymentTarget = clean(value[4]);
  const gitBranch = value[5] === null ? null : clean(value[5]);
  const providerSource = clean(value[6]);
  const deploymentStatus = clean(value[7]);
  const createdAt = clean(value[8]);
  const shaResolution = clean(value[9]);
  const status = INVENTORY_STATUS_SEMANTICS[deploymentStatus];
  const timestamp = Date.parse(createdAt);
  const exactProvider = shaResolution === "EXACT_PROVIDER" && SHA40.test(sha || "") &&
    providerCommitSha === sha;
  const localAbbreviation = shaResolution === "LOCAL_GIT_ABBREVIATION" &&
    SHA40.test(sha || "") && /^[0-9a-f]{7,39}$/.test(providerCommitSha || "") &&
    sha.startsWith(providerCommitSha);
  const unavailable = shaResolution === "UNAVAILABLE" && sha === null &&
    providerCommitSha === null && gitBranch === null && providerSource === "CLI";
  if (!DEPLOYMENT_ID.test(deploymentId) || !origin ||
      !new Set(["PRODUCTION", "PREVIEW"]).has(deploymentTarget) ||
      !INVENTORY_PROVIDER_SOURCES.has(providerSource) || !status ||
      !INVENTORY_SHA_RESOLUTIONS.has(shaResolution) ||
      !Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== createdAt ||
      !(exactProvider || localAbbreviation || unavailable) ||
      (gitBranch !== null && (!gitBranch || gitBranch.length > 240)) ||
      (sha !== null && gitBranch === null && providerSource === "GIT")) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_PROVIDER_INVENTORY_RECORD_INVALID",
      "A retained provider deployment record did not match the exact provider contract.",
      {}, 400,
    );
  }
  return Object.freeze([
    deploymentId, sha, providerCommitSha, origin, deploymentTarget, gitBranch,
    providerSource, deploymentStatus, createdAt, shaResolution,
  ]);
}

function canonicalInventoryRecord(value, providerRecord) {
  if (!Array.isArray(value) || value.length !==
      PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_RECORD_TUPLE.length) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_INVENTORY_RECORD_INVALID",
      "A retained deployment inventory tuple was not exact.",
      {},
      400,
    );
  }
  const [rawDeploymentId, rawSha, rawOrigin, rawScopeClass,
    rawDeploymentStatus, rawProviderMetadataFingerprint] = value;
  const deploymentId = clean(rawDeploymentId);
  const sha = rawSha === null ? null : clean(rawSha).toLowerCase();
  const origin = normalizedOrigin(rawOrigin, { requireVercel: true });
  const scopeClass = clean(rawScopeClass);
  const deploymentStatus = clean(rawDeploymentStatus);
  const providerMetadata = clean(rawProviderMetadataFingerprint).toLowerCase();
  const scope = INVENTORY_SCOPE_CLASSES[scopeClass];
  const status = INVENTORY_STATUS_SEMANTICS[deploymentStatus];
  if (!DEPLOYMENT_ID.test(deploymentId) ||
      (sha !== null && !SHA40.test(sha)) || !origin || !scope || !status ||
      !/^[0-9a-f]{64}$/.test(providerMetadata) ||
      !providerRecord || !exactJson(value, projectedInventoryTuple(providerRecord))) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_INVENTORY_RECORD_INVALID",
      "A retained deployment inventory tuple did not match a certified scope/status/provenance.",
      {},
      400,
    );
  }
  return Object.freeze({
    deploymentId,
    sha,
    origin,
    scopeClass,
    deploymentStatus,
    providerMetadataFingerprint: providerMetadata,
    providerRecord,
    providerCommitSha: providerRecord[2],
    gitBranch: providerRecord[5],
    providerSource: providerRecord[6],
    createdAt: providerRecord[8],
    shaResolution: providerRecord[9],
    deploymentTarget: scope.deploymentTarget,
    deploymentEnvironment: scope.deploymentEnvironment,
    credentialCapabilities: scope.credentialCapabilities,
    publiclyReachable: status.publiclyReachable,
    writerCapable: status.writerCapable,
  });
}

let retainedInventory;

const PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_TEAM_ID =
  "team_kPw5zaib8uaQJALAwj4fWI6R";
const PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_CAPTURED_AT =
  "2026-08-26T23:27:14.195Z";
const PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_PAGE_RECORDS_FINGERPRINT =
  "52d6db20fa7adf18aeb9678d0adc7b984855ae0315851e1fdf21e3c49e0d8b38";

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) =>
    codepointCompare(left, right)));
}

function providerCoverageSummary(providerRecords) {
  const nullSha = providerRecords.filter((record) => record[1] === null);
  return Object.freeze({
    targetCounts: countBy(providerRecords.map((record) => record[4])),
    statusCounts: countBy(providerRecords.map((record) => record[7])),
    providerSourceCounts: countBy(providerRecords.map((record) => record[6])),
    shaResolutionCounts: countBy(providerRecords.map((record) => record[9])),
    branchCounts: Object.freeze(Object.entries(countBy(providerRecords.map((record) =>
      record[5] ?? "__UNAVAILABLE__"))).map(([branch, count]) =>
      Object.freeze([branch, count]))),
    nullShaRecordCount: nullSha.length,
    nullShaReadyRecordCount: nullSha.filter((record) => record[7] === "READY").length,
    providerCommitShaUnavailableCount:
      providerRecords.filter((record) => record[2] === null).length,
    nullBranchRecordCount: providerRecords.filter((record) => record[5] === null).length,
  });
}

/**
 * Load and revalidate the retained Vercel deployment inventory server-side.
 * The browser never supplies this inventory or its digest.
 */
export function productionLegacyDeploymentInventory() {
  if (retainedInventory) return retainedInventory;
  let artifact;
  try {
    artifact = JSON.parse(JSON.stringify(productionOriginInventoryArtifact));
  } catch {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_INVENTORY_UNAVAILABLE",
      "The retained Production deployment inventory could not be loaded.",
      {},
      503,
    );
  }
  if (!exactKeys(artifact, [
    "schemaVersion", "vercelProjectId", "vercelTeamId", "capturedAt",
    "providerRecordTuple", "recordTuple", "scopeClasses", "statusSemantics",
    "paginationEvidence", "coverageSummary", "providerRecordCount", "recordCount",
    "providerRecordsFingerprint", "recordsFingerprint", "requiredDeployments",
    "providerRecords", "records",
  ]) || artifact.schemaVersion !== PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_SCHEMA ||
      artifact.vercelProjectId !== PRODUCTION_VERCEL_PROJECT_ID ||
      artifact.vercelTeamId !== PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_TEAM_ID ||
      artifact.capturedAt !== PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_CAPTURED_AT ||
      !exactJson(artifact.providerRecordTuple,
        PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_RECORD_TUPLE) ||
      !exactJson(artifact.recordTuple,
        PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_RECORD_TUPLE) ||
      !exactJson(artifact.scopeClasses, INVENTORY_SCOPE_CLASSES) ||
      !exactJson(artifact.statusSemantics, INVENTORY_STATUS_SEMANTICS) ||
      !exactJson(artifact.paginationEvidence, {
        queryScope: "ALL_PROJECT_DEPLOYMENTS_NO_TARGET_OR_BRANCH_FILTER",
        pageLimit: 100,
        firstPass: { pageCount: 13, recordCount: 1291,
          pageRecordsFingerprint:
            PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_PAGE_RECORDS_FINGERPRINT },
        secondPass: { pageCount: 13, recordCount: 1291,
          pageRecordsFingerprint:
            PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_PAGE_RECORDS_FINGERPRINT },
        exactPassMatch: true,
        remainingCursor: null,
      }) ||
      artifact.providerRecordCount !==
        PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_COUNT ||
      artifact.recordCount !== PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT ||
      artifact.providerRecordsFingerprint !==
        PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_FINGERPRINT ||
      artifact.recordsFingerprint !== PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT ||
      !exactJson(artifact.requiredDeployments,
        PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_REQUIRED_DEPLOYMENTS) ||
      !Array.isArray(artifact.providerRecords) ||
      artifact.providerRecords.length !==
        PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_COUNT ||
      !Array.isArray(artifact.records) ||
      artifact.records.length !== PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_INVENTORY_ARTIFACT_INVALID",
      "The retained Production deployment inventory header was invalid.",
      {},
      503,
    );
  }
  const providerRecordTuples = artifact.providerRecords.map(canonicalProviderInventoryRecord);
  const providerByKey = new Map(providerRecordTuples.map((record) =>
    [`${record[0]}\n${record[3]}`, record]));
  const records = artifact.records.map((record) => canonicalInventoryRecord(
    record,
    providerByKey.get(`${clean(record?.[0])}\n${normalizedOrigin(record?.[2], {
      requireVercel: true,
    })}`),
  ));
  const sorted = [...records].sort((a, b) => codepointCompare(
    `${a.deploymentId}\n${a.origin}`,
    `${b.deploymentId}\n${b.origin}`,
  ));
  const recordKeys = records.map((record) => `${record.deploymentId}\n${record.origin}`);
  const providerKeys = providerRecordTuples.map((record) => `${record[0]}\n${record[3]}`);
  const requiredIds = new Set(Object.values(
    PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_REQUIRED_DEPLOYMENTS));
  if (records.some((record, index) =>
        recordKeys[index] !== `${sorted[index].deploymentId}\n${sorted[index].origin}`) ||
      new Set(recordKeys).size !== records.length ||
      new Set(providerKeys).size !== providerRecordTuples.length ||
      !exactJson(recordKeys, providerKeys) ||
      [...requiredIds].some((deploymentId) =>
        !records.some((record) => record.deploymentId === deploymentId)) ||
      !exactJson(artifact.coverageSummary,
        providerCoverageSummary(providerRecordTuples)) ||
      sha256(JSON.stringify(artifact.providerRecords)) !==
        PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_FINGERPRINT ||
      sha256(JSON.stringify(artifact.records)) !==
        PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_INVENTORY_ARTIFACT_INVALID",
      "The retained Production deployment inventory did not match its immutable digest.",
      {},
      503,
    );
  }
  retainedInventory = Object.freeze({
    schemaVersion: artifact.schemaVersion,
    vercelProjectId: artifact.vercelProjectId,
    vercelTeamId: artifact.vercelTeamId,
    capturedAt: clean(artifact.capturedAt),
    recordTuple: PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_RECORD_TUPLE,
    scopeClasses: INVENTORY_SCOPE_CLASSES,
    statusSemantics: INVENTORY_STATUS_SEMANTICS,
    providerRecordTuple: PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_RECORD_TUPLE,
    paginationEvidence: Object.freeze(structuredClone(artifact.paginationEvidence)),
    coverageSummary: Object.freeze(structuredClone(artifact.coverageSummary)),
    providerRecordCount: providerRecordTuples.length,
    providerRecordsFingerprint: artifact.providerRecordsFingerprint,
    recordCount: records.length,
    recordsFingerprint: artifact.recordsFingerprint,
    requiredDeployments:
      PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_REQUIRED_DEPLOYMENTS,
    recordTuples: Object.freeze(artifact.records.map((tuple) => Object.freeze([...tuple]))),
    providerRecordTuples: Object.freeze(providerRecordTuples),
    records: Object.freeze(records),
  });
  return retainedInventory;
}

export function productionGoogleWriterAllMethodFenceHosts() {
  const evidence = productionGoogleCredentialConfinementEvidence();
  const contract = evidence?.allMethodFenceRequiredHosts;
  const origins = Array.isArray(contract?.origins)
    ? contract.origins.map((origin) => normalizedOrigin(origin, { requireVercel: true }))
    : [];
  const sorted = [...origins].sort(codepointCompare);
  const fingerprint = clean(contract?.fingerprint).toLowerCase();
  if (!exactKeys(contract, ["origins", "count", "fingerprint", "policy"]) ||
      origins.length === 0 || origins.some((origin) => !origin) ||
      new Set(origins).size !== origins.length || !exactJson(origins, sorted) ||
      Number(contract.count) !== origins.length ||
      !/^[0-9a-f]{64}$/.test(fingerprint) ||
      sha256(JSON.stringify(origins)) !== fingerprint ||
      !clean(contract.policy)) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_ALL_METHOD_HOST_SCOPE_INVALID",
      "The exact all-method legacy-host fence scope was unavailable.", {}, 503,
    );
  }
  return Object.freeze({
    origins: Object.freeze(origins),
    hostnames: Object.freeze(origins.map((origin) => new URL(origin).hostname)),
    count: origins.length,
    fingerprint,
    policy: clean(contract.policy),
  });
}

export function productionGoogleWriterAllMethodFencePaths() {
  const evidence = productionHistoricalSafeMethodGoogleWriterFencePaths();
  const paths = [...evidence.paths];
  const fingerprint = evidence.fingerprint;
  if (paths.length !== 1 || new Set(paths).size !== paths.length ||
      !exactJson(paths, [...paths].sort(codepointCompare)) ||
      fingerprint !==
        PRODUCTION_GOOGLE_WRITER_QUIESCE_ALL_METHOD_PATHS_FINGERPRINT) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_ALL_METHOD_PATH_SCOPE_INVALID",
      "The exact safe-method legacy-writer path fence scope was unavailable.", {}, 503,
    );
  }
  return Object.freeze({
    paths: Object.freeze(paths),
    count: paths.length,
    fingerprint,
    policy: evidence.policy,
  });
}

function normalizeRoutingRule(value) {
  if (!exactKeys(value, [
    "projectId", "ruleId", "revision", "scope", "projectWide", "action",
    "requestPathOperator", "requestPath", "methodOperator", "methods",
    "allMethodFenceRequiredHostCount", "allMethodFenceRequiredHostsFingerprint",
    "allMethodFenceRequiredPathCount", "allMethodFenceRequiredPathsFingerprint",
  ])) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_RULE_INVALID",
      "The Vercel routing rule record was not exact.",
      {},
      400,
    );
  }
  const methods = Array.isArray(value.methods)
    ? [...new Set(value.methods.map((item) => clean(item).toUpperCase()))].sort()
    : [];
  const allMethodFence = productionGoogleWriterAllMethodFenceHosts();
  const allMethodPaths = productionGoogleWriterAllMethodFencePaths();
  if (clean(value.projectId) !== PRODUCTION_VERCEL_PROJECT_ID ||
      !SAFE_IDENTIFIER.test(clean(value.ruleId)) ||
      !SAFE_IDENTIFIER.test(clean(value.revision)) ||
      clean(value.scope) !== PRODUCTION_GOOGLE_WRITER_QUIESCE_SCOPE ||
      value.projectWide !== true || clean(value.action).toUpperCase() !== "DENY" ||
      clean(value.requestPathOperator).toUpperCase() !== "DOES_NOT_EQUAL" ||
      clean(value.requestPath) !== PRODUCTION_GOOGLE_WRITER_QUIESCE_CONTROL_PATH ||
      clean(value.methodOperator).toUpperCase() !== "IS_NOT_ANY_OF" ||
      JSON.stringify(methods) !== JSON.stringify(["GET", "HEAD", "OPTIONS"]) ||
      Number(value.allMethodFenceRequiredHostCount) !== allMethodFence.count ||
      clean(value.allMethodFenceRequiredHostsFingerprint).toLowerCase() !==
        allMethodFence.fingerprint ||
      Number(value.allMethodFenceRequiredPathCount) !== allMethodPaths.count ||
      clean(value.allMethodFenceRequiredPathsFingerprint).toLowerCase() !==
        allMethodPaths.fingerprint) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_RULE_INVALID",
      "The Vercel routing rule did not match the reviewed project-wide deny scope.",
      {},
      400,
    );
  }
  return Object.freeze({
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
    ruleId: clean(value.ruleId),
    revision: clean(value.revision),
    scope: PRODUCTION_GOOGLE_WRITER_QUIESCE_SCOPE,
    projectWide: true,
    action: "DENY",
    requestPathOperator: "DOES_NOT_EQUAL",
    requestPath: PRODUCTION_GOOGLE_WRITER_QUIESCE_CONTROL_PATH,
    methodOperator: "IS_NOT_ANY_OF",
    methods: Object.freeze(methods),
    allMethodFenceRequiredHostCount: allMethodFence.count,
    allMethodFenceRequiredHostsFingerprint: allMethodFence.fingerprint,
    allMethodFenceRequiredPathCount: allMethodPaths.count,
    allMethodFenceRequiredPathsFingerprint: allMethodPaths.fingerprint,
  });
}

function attestedLiveInventory(providerAttestation, retained, candidate) {
  const records = providerAttestation?.liveOriginInventoryRecords;
  const count = Number(providerAttestation?.liveOriginInventoryCount);
  const fingerprint = clean(providerAttestation?.liveOriginInventoryFingerprint).toLowerCase();
  const credentialConfinement = productionGoogleCredentialConfinementEvidence();
  const allMethodFence = productionGoogleWriterAllMethodFenceHosts();
  const allMethodPaths = productionGoogleWriterAllMethodFencePaths();
  if (providerAttestation?.signatureVerified !== true || !Array.isArray(records) ||
      count !== records.length ||
      !new Set([retained.recordCount, retained.recordCount + 1]).has(count) ||
      !/^[0-9a-f]{64}$/.test(fingerprint) ||
      sha256(JSON.stringify(records)) !== fingerprint ||
      providerAttestation?.providerInventorySchema !== retained.schemaVersion ||
      providerAttestation?.retainedProviderInventoryCount !== retained.providerRecordCount ||
      providerAttestation?.retainedProviderInventoryFingerprint !==
        retained.providerRecordsFingerprint ||
      providerAttestation?.liveProviderInventoryCount !== count ||
      !/^[0-9a-f]{64}$/.test(clean(
        providerAttestation?.liveProviderInventoryFingerprint,
      ).toLowerCase()) ||
      providerAttestation?.routingRuleAllMethodFenceRequiredHostCount !==
        allMethodFence.count ||
      providerAttestation?.routingRuleAllMethodFenceRequiredHostsFingerprint !==
        allMethodFence.fingerprint ||
      providerAttestation?.routingRuleAllMethodFenceRequiredPathCount !==
        allMethodPaths.count ||
      providerAttestation?.routingRuleAllMethodFenceRequiredPathsFingerprint !==
        allMethodPaths.fingerprint ||
      credentialConfinement.originInventoryFingerprint !==
        retained.recordsFingerprint ||
      credentialConfinement.originInventoryProviderRecordsFingerprint !==
        retained.providerRecordsFingerprint ||
      providerAttestation?.credentialConfinementEvidenceSchema !==
        PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA ||
      providerAttestation?.credentialConfinementRecordCount !==
        PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT ||
      providerAttestation?.credentialConfinementRecordsFingerprint !==
        PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT ||
      providerAttestation?.credentialConfinementEvidenceFingerprint !==
        PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID",
      "The signed live Vercel inventory was unavailable or invalid.",
      {},
      409,
    );
  }
  const retainedByKey = new Map(retained.records.map((record) =>
    [`${record.deploymentId}\n${record.origin}`, record]));
  const retainedTupleByKey = new Map(retained.recordTuples.map((tuple) =>
    [`${tuple[0]}\n${tuple[2]}`, tuple]));
  const normalized = records.map((tuple) => {
    if (!Array.isArray(tuple) || tuple.length !== 6) {
      throw quiesceError(
        "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID",
        "A signed live Vercel inventory tuple was invalid.", {}, 409,
      );
    }
    const key = `${clean(tuple[0])}\n${normalizedOrigin(tuple[2], { requireVercel: true })}`;
    const retainedRecord = retainedByKey.get(key);
    if (retainedRecord) {
      if (!exactJson(tuple, retainedTupleByKey.get(key))) {
        throw quiesceError(
          "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID",
          "A retained live Vercel tuple drifted.", {}, 409,
        );
      }
      return retainedRecord;
    }
    const [deploymentId, rawSha, rawOrigin, scopeClass,
      deploymentStatus, rawProviderMetadataFingerprint] = tuple;
    const sha = clean(rawSha).toLowerCase();
    const origin = normalizedOrigin(rawOrigin, { requireVercel: true });
    const status = INVENTORY_STATUS_SEMANTICS[clean(deploymentStatus)];
    const scope = clean(scopeClass);
    const allowedScope = candidate.purpose === "CUTOVER"
      ? scope === "CUTOVER_PRODUCTION_CANDIDATE"
      : scope === "PROJECT_PREVIEW";
    if (!DEPLOYMENT_ID.test(clean(deploymentId)) ||
        clean(deploymentId) !== candidate.deploymentId ||
        sha !== candidate.commit || origin !== candidate.immutableOrigin ||
        !allowedScope || clean(deploymentStatus) !== "READY" || !status ||
        !/^[0-9a-f]{64}$/.test(clean(rawProviderMetadataFingerprint).toLowerCase())) {
      throw quiesceError(
        "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID",
        "A post-freeze live Vercel tuple was invalid.", {}, 409,
      );
    }
    return Object.freeze({
      deploymentId: clean(deploymentId), sha, origin, scopeClass: scope,
      deploymentStatus: "READY",
      providerMetadataFingerprint: clean(rawProviderMetadataFingerprint).toLowerCase(),
      providerSource: "GIT",
      gitBranch: "feature/mock-tournament-qa-integration",
      deploymentTarget: candidate.purpose === "CUTOVER" ? "PRODUCTION" : "PREVIEW",
      deploymentEnvironment: candidate.purpose === "CUTOVER" ? "PRODUCTION" : "PREVIEW",
      credentialCapabilities: Object.freeze([
        "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
        "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
        "PRODUCTION_WORKBOOK_SELECTOR",
      ]),
      publiclyReachable: status.publiclyReachable,
      writerCapable: status.writerCapable,
    });
  });
  const keys = normalized.map((record) => `${record.deploymentId}\n${record.origin}`);
  const deploymentIds = normalized.map((record) => record.deploymentId);
  const origins = normalized.map((record) => record.origin);
  const sorted = [...keys].sort(codepointCompare);
  const candidateRecords = normalized.filter((record) =>
    record.deploymentId === candidate.deploymentId &&
    record.origin === candidate.immutableOrigin);
  const candidateTarget = candidate.purpose === "CUTOVER" ? "PRODUCTION" : "PREVIEW";
  if (new Set(keys).size !== keys.length ||
      new Set(deploymentIds).size !== normalized.length ||
      new Set(origins).size !== normalized.length ||
      JSON.stringify(keys) !== JSON.stringify(sorted) ||
      retained.records.some((record) => !keys.includes(`${record.deploymentId}\n${record.origin}`)) ||
      candidateRecords.length !== 1 || candidateRecords[0].sha !== candidate.commit ||
      candidateRecords[0].deploymentStatus !== "READY" ||
      candidateRecords[0].deploymentTarget !== candidateTarget ||
      candidateRecords[0].gitBranch !== "feature/mock-tournament-qa-integration") {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID",
      "The signed live Vercel inventory did not contain the exact required scope.", {}, 409,
    );
  }
  return Object.freeze({
    records: Object.freeze(normalized),
    tuples: Object.freeze(records.map((tuple) => Object.freeze([...tuple]))),
    count,
    fingerprint,
  });
}

export function normalizeProductionWriterQuiesceEvidenceInput(
  input,
  environment,
  { providerAttestation } = {},
) {
  const purpose = clean(input.quiescePurpose).toUpperCase();
  if (!["REHEARSAL", "CUTOVER"].includes(purpose)) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_PURPOSE_INVALID",
      "The writer-quiesce purpose was invalid.",
      {},
      400,
    );
  }
  const retained = productionLegacyDeploymentInventory();
  const inventory = retained.records;
  const inventoryFingerprint = retained.recordsFingerprint;
  const candidateAliasOrigin = normalizedOrigin(`https://${clean(
    environment?.resources?.candidateHostname,
  )}`);
  const candidateImmutableOrigin = normalizedOrigin(`https://${clean(
    environment?.candidate?.resources?.deploymentHostname ||
    environment?.resources?.deploymentHostname,
  )}`);
  if (!candidateAliasOrigin || !candidateImmutableOrigin) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_CANDIDATE_ORIGIN_INVALID",
      "The exact candidate origin was unavailable.",
      {},
      503,
    );
  }
  const candidateDeploymentId = clean(
    environment?.resources?.candidateDeploymentId ||
    environment?.candidate?.resources?.candidateDeploymentId ||
    environment?.resources?.deploymentId,
  );
  const candidateCommit = clean(environment?.resources?.commitSha).toLowerCase();
  if (!DEPLOYMENT_ID.test(candidateDeploymentId) || !SHA40.test(candidateCommit)) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_CANDIDATE_IDENTITY_INVALID",
      "The exact candidate deployment identity was unavailable.",
      {},
      503,
    );
  }
  const retainedCandidateMatches = inventory.filter((record) =>
    record.deploymentId === candidateDeploymentId &&
    record.origin === candidateImmutableOrigin);
  const retainedCandidateCollision = inventory.some((record) =>
    (record.deploymentId === candidateDeploymentId ||
      record.origin === candidateImmutableOrigin) &&
    !retainedCandidateMatches.includes(record));
  if (inventory.some((record) => record.origin === candidateAliasOrigin) ||
      retainedCandidateCollision || retainedCandidateMatches.length > 1 ||
      candidateAliasOrigin === candidateImmutableOrigin) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_CANDIDATE_INVENTORY_COLLISION",
      "The dynamic candidate identity collided with the retained origin inventory.",
      {},
      409,
    );
  }
  const liveInventory = attestedLiveInventory(providerAttestation, retained, {
    deploymentId: candidateDeploymentId,
    immutableOrigin: candidateImmutableOrigin,
    commit: candidateCommit,
    purpose,
  });
  const originKinds = new Map(liveInventory.records.map((record) => [
    record.origin,
    record.scopeClass === "PRODUCTION_TARGET" ? "IMMUTABLE_PRODUCTION_TARGET"
      : record.scopeClass === "CUTOVER_PRODUCTION_CANDIDATE"
        ? "IMMUTABLE_CUTOVER_PRODUCTION_CANDIDATE"
        : "IMMUTABLE_PROJECT_PREVIEW",
  ]));
  for (const origin of PRODUCTION_GOOGLE_WRITER_QUIESCE_FIXED_ORIGINS) {
    originKinds.set(origin, "FIXED_ALIAS");
  }
  originKinds.set(candidateAliasOrigin, "CANDIDATE_ALIAS");
  const probeOrigins = [...new Set([
    ...liveInventory.records.map((record) => record.origin),
    ...PRODUCTION_GOOGLE_WRITER_QUIESCE_FIXED_ORIGINS,
    candidateAliasOrigin,
  ])].sort(codepointCompare);
  const expectedProbeOriginCount = liveInventory.count +
    PRODUCTION_GOOGLE_WRITER_QUIESCE_FIXED_ORIGINS.length + 1;
  if (probeOrigins.length !== expectedProbeOriginCount) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_ORIGIN_SCOPE_COLLISION",
      "The retained, fixed, and candidate origin scopes were not disjoint.",
      { expectedProbeOriginCount, actualProbeOriginCount: probeOrigins.length },
      409,
    );
  }
  const probeTargets = probeOrigins.flatMap((origin) =>
    PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_VECTORS.map((vector) =>
      Object.freeze({ origin, ...vector })));
  return Object.freeze({
    contractVersion: PRODUCTION_GOOGLE_WRITER_QUIESCE_VERSION,
    purpose,
    routingRule: normalizeRoutingRule(input.routingRule),
    originInventory: liveInventory.records,
    retainedOriginInventory: Object.freeze(inventory),
    originInventoryTuples: retained.recordTuples,
    originInventoryCount: inventory.length,
    originInventoryFingerprint: inventoryFingerprint,
    providerInventorySchema: retained.schemaVersion,
    retainedProviderInventoryCount: retained.providerRecordCount,
    retainedProviderInventoryFingerprint: retained.providerRecordsFingerprint,
    liveProviderInventoryCount: providerAttestation.liveProviderInventoryCount,
    liveProviderInventoryFingerprint:
      clean(providerAttestation.liveProviderInventoryFingerprint).toLowerCase(),
    liveOriginInventoryTuples: liveInventory.tuples,
    liveOriginInventoryCount: liveInventory.count,
    liveOriginInventoryFingerprint: liveInventory.fingerprint,
    credentialConfinementEvidenceSchema:
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA,
    credentialConfinementRecordCount:
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT,
    credentialConfinementRecordsFingerprint:
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT,
    credentialConfinementEvidenceFingerprint:
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT,
    candidateDeploymentId,
    candidateCommit,
    candidateDeploymentTarget: purpose === "CUTOVER" ? "PRODUCTION" : "PREVIEW",
    candidateAliasOrigin,
    candidateImmutableOrigin,
    candidateCredentialGeneration:
      PRODUCTION_GOOGLE_WRITER_QUIESCE_CANDIDATE_CREDENTIAL_GENERATION,
    candidateCredentialCapabilities: Object.freeze([
      "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
      "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
      "PRODUCTION_WORKBOOK_SELECTOR",
    ]),
    mainBranchAliasOrigin:
      "https://bagger-inv-git-main-sandbagger-invitational.vercel.app",
    originKinds,
    probeOrigins: Object.freeze(probeOrigins),
    probeOriginCount: probeOrigins.length,
    probeOriginSetFingerprint: sha256(JSON.stringify(probeOrigins)),
    probeVectors: PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_VECTORS,
    probeVectorCount: PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_VECTORS.length,
    probeVectorCoverageMask:
      PRODUCTION_GOOGLE_WRITER_QUIESCE_VECTOR_COVERAGE_MASK,
    probeTargets: Object.freeze(probeTargets),
    probeTargetCount: probeTargets.length,
    probeTargetSetFingerprint: sha256(JSON.stringify(probeTargets)),
  });
}

async function probeOneOriginPath(origin, probeMethod, probePath, fetchImpl) {
  const probeUrl = `${origin}${probePath}`;
  let response;
  try {
    const request = {
      method: probeMethod,
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        "x-bagger-quiesce-probe": PRODUCTION_GOOGLE_WRITER_QUIESCE_VERSION,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    };
    if (!new Set(["GET", "HEAD"]).has(probeMethod)) request.body = "{}";
    response = await fetchImpl(probeUrl, request);
  } catch {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_PROBE_RESPONSE_UNKNOWN",
      "A Production-capable origin did not return a conclusive Vercel edge response.",
      { originFingerprint: sha256(origin), probeMethod, probePath },
      503,
    );
  }
  const mitigation = clean(response.headers.get("x-vercel-mitigated")).toLowerCase();
  const server = clean(response.headers.get("server")).toLowerCase();
  const vercelId = clean(response.headers.get("x-vercel-id"));
  await response.arrayBuffer().catch(() => new ArrayBuffer(0));
  if (response.status !== 403 || mitigation !== "deny" || server !== "vercel" || !vercelId) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_PROBE_NOT_EDGE_DENIED",
      "A Production-capable origin was not denied by the exact Vercel edge rule.",
      {
        originFingerprint: sha256(origin),
        probeMethod,
        probePath,
        providerStatus: response.status,
        mitigation,
        server,
        vercelIdPresent: Boolean(vercelId),
      },
      409,
    );
  }
  return Object.freeze({
    origin,
    probeMethod,
    probePath,
    vercelIdFingerprint: sha256(vercelId),
    vectorProofFingerprint: sha256(JSON.stringify({
      origin,
      probeMethod,
      probePath,
      providerStatus: 403,
      mitigation: "deny",
      server: "vercel",
      vercelIdFingerprint: sha256(vercelId),
    })),
  });
}

export async function probeProductionWriterQuiesceOrigins(
  normalized,
  { fetchImpl = globalThis.fetch, concurrency = 32, now = Date.now() } = {},
) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const targets = [...normalized.probeTargets];
  const records = new Array(targets.length);
  const inventoryByOrigin = new Map(
    normalized.originInventory.map((record) => [record.origin, record]),
  );
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= targets.length) return;
      const target = targets[index];
      const proof = await probeOneOriginPath(
        target.origin,
        target.probeMethod,
        target.probePath,
        fetchImpl,
      );
      const originKind = normalized.originKinds.get(target.origin);
      const source = inventoryByOrigin.get(target.origin);
      records[index] = Object.freeze({ proof, source, originKind });
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, Number(concurrency) || 1), 64, targets.length) },
    worker,
  ));
  const capturedAt = new Date(Number(now)).toISOString();
  const probesPerOrigin = normalized.probeVectorCount;
  const probeOriginRecords = normalized.probeOrigins.map((origin, originIndex) => {
    const firstIndex = originIndex * probesPerOrigin;
    const originProofs = records.slice(firstIndex, firstIndex + probesPerOrigin);
    if (originProofs.length !== probesPerOrigin ||
        originProofs.some(({ proof }, vectorIndex) =>
          proof.origin !== origin ||
          proof.probeMethod !== normalized.probeVectors[vectorIndex].probeMethod ||
          proof.probePath !== normalized.probeVectors[vectorIndex].probePath)) {
      throw quiesceError(
        "STEP11_6_WRITER_QUIESCE_PROBE_COVERAGE_INVALID",
        "The server-observed vector proof set was not exact.",
        { originFingerprint: sha256(origin) },
        503,
      );
    }
    const source = inventoryByOrigin.get(origin);
    const originKind = normalized.originKinds.get(origin);
    const candidate = originKind === "CANDIDATE_ALIAS" ||
      (origin === normalized.candidateImmutableOrigin &&
        source?.deploymentId === normalized.candidateDeploymentId);
    const fixed = originKind === "FIXED_ALIAS";
    return Object.freeze([
      origin,
      originKind,
      fixed ? null : source?.deploymentId || normalized.candidateDeploymentId,
      fixed ? null : source ? source.sha : normalized.candidateCommit,
      source?.scopeClass || null,
      source?.deploymentStatus || null,
      source?.providerMetadataFingerprint || null,
      Object.freeze(fixed ? [] : [
        ...(candidate ? normalized.candidateCredentialCapabilities
          : source?.credentialCapabilities || []),
      ]),
      normalized.probeVectorCoverageMask,
      Object.freeze(originProofs.map(({ proof }) => proof.vectorProofFingerprint)),
      capturedAt,
    ]);
  });
  const edgeProofFingerprint = sha256(JSON.stringify(records.map(({ proof }) => proof)));
  return Object.freeze({
    capturedAt,
    probeOriginRecords: Object.freeze(probeOriginRecords),
    // Backward-compatible name at the receipt boundary; these are compact
    // per-origin tuples, not one repeated JSON object per HTTP request.
    probeRecords: Object.freeze(probeOriginRecords),
    compactRecordCount: probeOriginRecords.length,
    probeCount: normalized.probeTargetCount,
    deniedCount: normalized.probeTargetCount,
    probeFingerprint: sha256(JSON.stringify(probeOriginRecords)),
    edgeProofFingerprint,
    allOriginsEdgeDenied: true,
    unresolvedProbeCount: 0,
  });
}

export function publicProductionWriterQuiesceError(error) {
  return Object.freeze({
    ok: false,
    error: "The Production writer-quiesce proof did not complete.",
    code: /^[A-Z][A-Z0-9_]{2,120}$/.test(clean(error?.code))
      ? clean(error.code) : "STEP11_6_WRITER_QUIESCE_FAILED",
    diagnostics: Object.freeze({ ...(error?.safeDiagnostics || {}) }),
  });
}
