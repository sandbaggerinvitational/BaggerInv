import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { PRODUCTION_VERCEL_PROJECT_ID } from
  "./google-service-account-credential-context.js";
import {
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT,
  PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA,
  productionGoogleCredentialConfinementEvidence,
} from "./production-google-credential-confinement.js";

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
export const PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT = 1_140;
export const PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT =
  "533178a28a5458c5f2f727b77af3024de4cc0402c49e90dcd763b950d26fb4c6";
export const PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_SCHEMA =
  "step11-6-production-origin-inventory-v2";
export const PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_REQUIRED_DEPLOYMENTS =
  Object.freeze({
    priorLive: "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
    frozenStep11: "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
  });
export const PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_RECORD_TUPLE = Object.freeze([
  "deploymentId", "sha", "origin", "scopeClass", "deploymentStatus",
  "sourceProvenance",
]);
// Exact Preview deployments created after the retained provider inventory was
// frozen while the Step 11.6 candidate itself was being corrected. These are
// required live scope, not a wildcard: every tuple field must remain exact.
export const PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS = Object.freeze([
  Object.freeze([
    "dpl_32Upq6iEQoD2MVdxcWWVihj66hEg",
    "41b0517e4e1679536438109ea61028663c80508f",
    "https://bagger-c1miwfnb1-sandbagger-invitational.vercel.app",
    "FEATURE_PREVIEW", "READY", "GIT",
  ]),
  Object.freeze([
    "dpl_44fXUMdcS7QbQiJvMimX1DozcZrR",
    "fdda563eaab6569a6c8e0442ef8118fdc0db8569",
    "https://bagger-m3t3ao7ui-sandbagger-invitational.vercel.app",
    "FEATURE_PREVIEW", "READY", "GIT",
  ]),
  Object.freeze([
    "dpl_ENU4XkC1dpbj9aho5gTz2x8zw9qP",
    "85eb5efce7f5c9d9292e007fc093c05d7dd5c356",
    "https://bagger-7zpm6cjp3-sandbagger-invitational.vercel.app",
    "FEATURE_PREVIEW", "READY", "GIT",
  ]),
]);
export const PRODUCTION_GOOGLE_WRITER_QUIESCE_VECTOR_COVERAGE_MASK =
  (1 << PRODUCTION_GOOGLE_WRITER_QUIESCE_PROBE_VECTORS.length) - 1;

const INVENTORY_SCOPE_CLASSES = Object.freeze({
  MAIN_PRODUCTION: Object.freeze({
    branch: "main",
    deploymentEnvironment: "PRODUCTION",
    credentialCapabilities: Object.freeze([
      "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
      "PRODUCTION_WORKBOOK_SELECTOR",
    ]),
  }),
  FEATURE_PREVIEW: Object.freeze({
    branch: "feature/mock-tournament-qa-integration",
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
const INVENTORY_SOURCE_PROVENANCE = Object.freeze(new Set([
  "GIT", "REDEPLOY_INHERITED_GIT", "VERCEL_API_RESOLVED_GIT",
  "VERCEL_CLI_SHA_UNAVAILABLE",
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

function canonicalInventoryRecord(value) {
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
    rawDeploymentStatus, rawSourceProvenance] = value;
  const deploymentId = clean(rawDeploymentId);
  const sha = rawSha === null ? null : clean(rawSha).toLowerCase();
  const origin = normalizedOrigin(rawOrigin, { requireVercel: true });
  const scopeClass = clean(rawScopeClass);
  const deploymentStatus = clean(rawDeploymentStatus);
  const sourceProvenance = clean(rawSourceProvenance);
  const scope = INVENTORY_SCOPE_CLASSES[scopeClass];
  const status = INVENTORY_STATUS_SEMANTICS[deploymentStatus];
  const shaUnavailable = sourceProvenance === "VERCEL_CLI_SHA_UNAVAILABLE";
  if (!DEPLOYMENT_ID.test(deploymentId) ||
      (sha === null ? !shaUnavailable : !SHA40.test(sha) || shaUnavailable) ||
      !origin || !scope || !status ||
      !INVENTORY_SOURCE_PROVENANCE.has(sourceProvenance) ||
      (scopeClass === "MAIN_PRODUCTION" &&
        (deploymentStatus !== "READY" || sourceProvenance !== "GIT")) ||
      (scopeClass === "FEATURE_PREVIEW" &&
        sourceProvenance === "REDEPLOY_INHERITED_GIT" && deploymentStatus !== "READY")) {
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
    sourceProvenance,
    branch: scope.branch,
    deploymentEnvironment: scope.deploymentEnvironment,
    credentialCapabilities: scope.credentialCapabilities,
    publiclyReachable: status.publiclyReachable,
    writerCapable: status.writerCapable,
  });
}

let retainedInventory;

/**
 * Load and revalidate the retained Vercel deployment inventory server-side.
 * The browser never supplies this inventory or its digest.
 */
export function productionLegacyDeploymentInventory() {
  if (retainedInventory) return retainedInventory;
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(new URL(
      "../docs/evidence/step11-6-production-origin-inventory.json",
      import.meta.url,
    ), "utf8"));
  } catch {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_INVENTORY_UNAVAILABLE",
      "The retained Production deployment inventory could not be loaded.",
      {},
      503,
    );
  }
  if (!exactKeys(artifact, [
    "schemaVersion", "vercelProjectId", "capturedAt", "recordTuple",
    "scopeClasses", "statusSemantics", "paginationEvidence", "recordCount",
    "recordsFingerprint", "requiredDeployments", "records",
  ]) || artifact.schemaVersion !== PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_SCHEMA ||
      artifact.vercelProjectId !== PRODUCTION_VERCEL_PROJECT_ID ||
      Number.isNaN(Date.parse(artifact.capturedAt)) ||
      !/[zZ]|[+-]\d\d:\d\d$/.test(clean(artifact.capturedAt)) ||
      !exactJson(artifact.recordTuple,
        PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_RECORD_TUPLE) ||
      !exactJson(artifact.scopeClasses, INVENTORY_SCOPE_CLASSES) ||
      !exactJson(artifact.statusSemantics, INVENTORY_STATUS_SEMANTICS) ||
      !exactJson(artifact.paginationEvidence, {
        productionTarget: {
          recordCount: 458, complete: true, remainingLoadMore: false,
        },
        candidateBranchPreview: {
          recordCount: 682, complete: true, remainingLoadMore: false,
        },
      }) ||
      artifact.recordCount !== PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT ||
      artifact.recordsFingerprint !== PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT ||
      !exactJson(artifact.requiredDeployments,
        PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_REQUIRED_DEPLOYMENTS) ||
      !Array.isArray(artifact.records) ||
      artifact.records.length !== PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_INVENTORY_ARTIFACT_INVALID",
      "The retained Production deployment inventory header was invalid.",
      {},
      503,
    );
  }
  const records = artifact.records.map(canonicalInventoryRecord);
  const sorted = [...records].sort((a, b) => codepointCompare(
    `${a.deploymentId}\n${a.origin}`,
    `${b.deploymentId}\n${b.origin}`,
  ));
  const recordKeys = records.map((record) => `${record.deploymentId}\n${record.origin}`);
  const scopeCounts = Object.fromEntries(Object.keys(INVENTORY_SCOPE_CLASSES)
    .map((scopeClass) => [scopeClass,
      records.filter((record) => record.scopeClass === scopeClass).length]));
  const requiredIds = new Set(Object.values(
    PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_REQUIRED_DEPLOYMENTS));
  const requiredTuples = Object.freeze([
    Object.freeze([
      "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
      "561a61946be3536c7e32b46be53e4683cbb45579",
      "https://bagger-drmix94o0-sandbagger-invitational.vercel.app",
      "MAIN_PRODUCTION", "READY", "GIT",
    ]),
    Object.freeze([
      "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
      "be5531faca009e26617496e47831f365a1b4997b",
      "https://bagger-mribo6cqh-sandbagger-invitational.vercel.app",
      "FEATURE_PREVIEW", "READY", "GIT",
    ]),
  ]);
  if (records.some((record, index) =>
        recordKeys[index] !== `${sorted[index].deploymentId}\n${sorted[index].origin}`) ||
      new Set(recordKeys).size !== records.length ||
      scopeCounts.MAIN_PRODUCTION !== 458 ||
      scopeCounts.FEATURE_PREVIEW !== 682 ||
      [...requiredIds].some((deploymentId) =>
        !records.some((record) => record.deploymentId === deploymentId)) ||
      requiredTuples.some((required) => !artifact.records.some((tuple) =>
        exactJson(tuple, required))) ||
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
    capturedAt: clean(artifact.capturedAt),
    recordTuple: PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_RECORD_TUPLE,
    scopeClasses: INVENTORY_SCOPE_CLASSES,
    statusSemantics: INVENTORY_STATUS_SEMANTICS,
    paginationEvidence: Object.freeze({
      productionTarget: Object.freeze({ ...artifact.paginationEvidence.productionTarget }),
      candidateBranchPreview: Object.freeze({
        ...artifact.paginationEvidence.candidateBranchPreview,
      }),
    }),
    recordCount: records.length,
    recordsFingerprint: artifact.recordsFingerprint,
    requiredDeployments:
      PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_REQUIRED_DEPLOYMENTS,
    recordTuples: Object.freeze(artifact.records.map((tuple) => Object.freeze([...tuple]))),
    records: Object.freeze(records),
  });
  return retainedInventory;
}

function normalizeRoutingRule(value) {
  if (!exactKeys(value, [
    "projectId", "ruleId", "revision", "scope", "projectWide", "action",
    "requestPathOperator", "requestPath", "methodOperator", "methods",
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
  if (clean(value.projectId) !== PRODUCTION_VERCEL_PROJECT_ID ||
      !SAFE_IDENTIFIER.test(clean(value.ruleId)) ||
      !SAFE_IDENTIFIER.test(clean(value.revision)) ||
      clean(value.scope) !== PRODUCTION_GOOGLE_WRITER_QUIESCE_SCOPE ||
      value.projectWide !== true || clean(value.action).toUpperCase() !== "DENY" ||
      clean(value.requestPathOperator).toUpperCase() !== "DOES_NOT_EQUAL" ||
      clean(value.requestPath) !== PRODUCTION_GOOGLE_WRITER_QUIESCE_CONTROL_PATH ||
      clean(value.methodOperator).toUpperCase() !== "IS_NOT_ANY_OF" ||
      JSON.stringify(methods) !== JSON.stringify(["GET", "HEAD", "OPTIONS"])) {
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
  });
}

function attestedLiveInventory(providerAttestation, retained, candidate) {
  const records = providerAttestation?.liveOriginInventoryRecords;
  const count = Number(providerAttestation?.liveOriginInventoryCount);
  const fingerprint = clean(providerAttestation?.liveOriginInventoryFingerprint).toLowerCase();
  const credentialConfinement = productionGoogleCredentialConfinementEvidence();
  if (providerAttestation?.signatureVerified !== true || !Array.isArray(records) ||
      count !== records.length || count < retained.recordCount +
        PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS.length + 1 ||
      !/^[0-9a-f]{64}$/.test(fingerprint) ||
      sha256(JSON.stringify(records)) !== fingerprint ||
      credentialConfinement.originInventoryFingerprint !==
        retained.recordsFingerprint ||
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
  const reviewedByKey = new Map(
    PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS.map((tuple) =>
      [`${tuple[0]}\n${tuple[2]}`, tuple]),
  );
  if (PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS.some((tuple) =>
    tuple[0] === candidate.deploymentId || tuple[2] === candidate.immutableOrigin)) {
    throw quiesceError(
      "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID",
      "The dynamic candidate collided with reviewed post-capture scope.", {}, 409,
    );
  }
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
      if (JSON.stringify(tuple) !== JSON.stringify(retained.recordTuples.find((item) =>
        item[0] === retainedRecord.deploymentId && item[2] === retainedRecord.origin))) {
        throw quiesceError(
          "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID",
          "A retained live Vercel tuple drifted.", {}, 409,
        );
      }
      return retainedRecord;
    }
    const reviewedTuple = reviewedByKey.get(key);
    if (reviewedTuple && JSON.stringify(tuple) !== JSON.stringify(reviewedTuple)) {
      throw quiesceError(
        "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID",
        "A reviewed post-capture Vercel tuple drifted.", {}, 409,
      );
    }
    const [deploymentId, rawSha, rawOrigin, scopeClass,
      deploymentStatus, sourceProvenance] = tuple;
    const sha = clean(rawSha).toLowerCase();
    const origin = normalizedOrigin(rawOrigin, { requireVercel: true });
    const status = INVENTORY_STATUS_SEMANTICS[clean(deploymentStatus)];
    const scope = clean(scopeClass);
    const allowedScope = candidate.purpose === "CUTOVER"
      ? new Set(["FEATURE_PREVIEW", "CUTOVER_PRODUCTION_CANDIDATE"]).has(scope)
      : scope === "FEATURE_PREVIEW";
    if (!DEPLOYMENT_ID.test(clean(deploymentId)) ||
        (!reviewedTuple && sha !== candidate.commit) || !origin ||
        !allowedScope || !status || clean(sourceProvenance) !== "GIT") {
      throw quiesceError(
        "STEP11_6_WRITER_QUIESCE_PROVIDER_ATTESTATION_INVALID",
        "A post-freeze live Vercel tuple was invalid.", {}, 409,
      );
    }
    const candidateRecord = clean(deploymentId) === candidate.deploymentId &&
      origin === candidate.immutableOrigin;
    return Object.freeze({
      deploymentId: clean(deploymentId), sha, origin, scopeClass: scope,
      deploymentStatus: clean(deploymentStatus), sourceProvenance: "GIT",
      branch: scope === "MAIN_PRODUCTION" ? "main" :
        "feature/mock-tournament-qa-integration",
      deploymentEnvironment: scope === "FEATURE_PREVIEW" ? "PREVIEW" : "PRODUCTION",
      credentialCapabilities: Object.freeze(candidateRecord ? [
        "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
        "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
        "PRODUCTION_WORKBOOK_SELECTOR",
      ] : scope === "MAIN_PRODUCTION" ? [
        "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
        "POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
        "PRODUCTION_WORKBOOK_SELECTOR",
      ] : [
        "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
        "POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
        "POTENTIAL_PRODUCTION_WORKBOOK_SELECTOR",
      ]),
      publiclyReachable: status.publiclyReachable,
      writerCapable: status.writerCapable,
    });
  });
  const keys = normalized.map((record) => `${record.deploymentId}\n${record.origin}`);
  const deploymentIds = normalized.map((record) => record.deploymentId);
  const origins = normalized.map((record) => record.origin);
  const sorted = [...keys].sort(codepointCompare);
  if (new Set(keys).size !== keys.length ||
      new Set(deploymentIds).size !== normalized.length ||
      new Set(origins).size !== normalized.length ||
      JSON.stringify(keys) !== JSON.stringify(sorted) ||
      retained.records.some((record) => !keys.includes(`${record.deploymentId}\n${record.origin}`)) ||
      PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS.some((tuple) =>
        !keys.includes(`${tuple[0]}\n${tuple[2]}`)) ||
      normalized.filter((record) => record.deploymentId === candidate.deploymentId &&
        record.origin === candidate.immutableOrigin).length !== 1) {
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
  if (inventory.some((record) =>
      record.origin === candidateAliasOrigin ||
      record.origin === candidateImmutableOrigin ||
      record.deploymentId === candidateDeploymentId) ||
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
    record.deploymentId === candidateDeploymentId &&
      record.origin === candidateImmutableOrigin ? "CANDIDATE_IMMUTABLE"
      : record.scopeClass === "MAIN_PRODUCTION" ? "IMMUTABLE_MAIN_PRODUCTION"
      : record.scopeClass === "CUTOVER_PRODUCTION_CANDIDATE"
        ? "IMMUTABLE_POST_FREEZE_CUTOVER_PRODUCTION"
        : "IMMUTABLE_FEATURE_PREVIEW",
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
    response = await fetchImpl(probeUrl, {
      method: probeMethod,
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        "x-bagger-quiesce-probe": PRODUCTION_GOOGLE_WRITER_QUIESCE_VERSION,
      },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
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
      originKind === "CANDIDATE_IMMUTABLE";
    const fixed = originKind === "FIXED_ALIAS";
    return Object.freeze([
      origin,
      originKind,
      fixed ? null : source?.deploymentId || normalized.candidateDeploymentId,
      fixed ? null : source ? source.sha : normalized.candidateCommit,
      source?.scopeClass || null,
      source?.deploymentStatus || null,
      source?.sourceProvenance || null,
      Object.freeze(fixed ? [] : [
        ...(source?.credentialCapabilities ||
          (candidate ? normalized.candidateCredentialCapabilities : [])),
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
