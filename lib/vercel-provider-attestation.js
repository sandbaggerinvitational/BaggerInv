import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign as signDetached,
  verify as verifyDetached,
} from "node:crypto";

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
  productionLegacyDeploymentInventory,
  PRODUCTION_GOOGLE_WRITER_QUIESCE_CONTROL_PATH,
  PRODUCTION_GOOGLE_WRITER_QUIESCE_SCOPE,
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT,
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT,
  PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS,
} from "./production-google-writer-fence-quiesce.js";

export const VERCEL_PROVIDER_ATTESTATION_REQUEST_SCHEMA =
  "bagger-vercel-provider-attestation-request-v1";
export const VERCEL_PROVIDER_ATTESTATION_SCHEMA =
  "bagger-vercel-provider-attestation-v1";
export const VERCEL_PROVIDER_ATTESTATION_ENVELOPE_SCHEMA =
  "bagger-vercel-provider-attestation-envelope-v1";
export const VERCEL_PROVIDER_ATTESTATION_SIGNER_KEY_VERSION =
  "STEP11_6_VERCEL_ATTESTER_V1";
export const VERCEL_PROVIDER_ATTESTATION_ALGORITHM = "Ed25519";
export const VERCEL_PROVIDER_ATTESTATION_VALIDITY_SECONDS = 1_800;
export const VERCEL_PROVIDER_ATTESTATION_INITIAL_MAX_AGE_SECONDS = 120;
export const VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV =
  "PRODUCTION_VERCEL_PROVIDER_ATTESTATION_ED25519_PUBLIC_KEY";
export const VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV =
  "PRODUCTION_VERCEL_PROVIDER_ATTESTATION_TEAM_ID";
export const VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH =
  "feature/mock-tournament-qa-integration";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{8,64}$/;
const TEAM_ID = /^team_[A-Za-z0-9]{8,80}$/;
const SAFE_PROVIDER_ID = /^[A-Za-z0-9._:-]{3,240}$/;
const SAFE_CONFIG_VERSION = /^[A-Za-z0-9._:-]{1,240}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const clean = (value) => String(value ?? "").trim();
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function attestationError(code, message, diagnostics = {}, status = 409) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.safeDiagnostics = Object.freeze({ ...diagnostics });
  return error;
}

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plain(value) && Object.keys(value).sort().join("\n") ===
    [...keys].sort().join("\n");
}

function canonicalValue(value, path = "$") {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value) &&
      (!Number.isInteger(value) || Number.isSafeInteger(value))) return value;
  if (Array.isArray(value)) return value.map((item, index) =>
    canonicalValue(item, `${path}[${index}]`));
  if (plain(value)) {
    return Object.fromEntries(Object.keys(value).sort(compare).map((key) => {
      if (value[key] === undefined) {
        throw attestationError(
          "STEP11_6_VERCEL_ATTESTATION_CANONICAL_VALUE_INVALID",
          "An attestation value was not canonically serializable.",
          { path: `${path}.${key}` },
          400,
        );
      }
      return [key, canonicalValue(value[key], `${path}.${key}`)];
    }));
  }
  throw attestationError(
    "STEP11_6_VERCEL_ATTESTATION_CANONICAL_VALUE_INVALID",
    "An attestation value was not canonically serializable.",
    { path },
    400,
  );
}

export function canonicalAttestationJson(value) {
  return JSON.stringify(canonicalValue(value));
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

function exactTimestamp(value, label) {
  const selected = clean(value);
  if (!selected || Number.isNaN(Date.parse(selected)) ||
      !/[zZ]|[+-]\d\d:\d\d$/.test(selected)) {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_TIMESTAMP_INVALID",
      "A signed provider timestamp was invalid.",
      { field: label },
      400,
    );
  }
  return new Date(Date.parse(selected)).toISOString();
}

function exactUuid(value, label) {
  const selected = clean(value).toLowerCase();
  if (!UUID.test(selected)) {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_ID_INVALID",
      "A provider-attestation identity was invalid.",
      { field: label },
      400,
    );
  }
  return selected;
}

function normalizeAttestationRequest(value) {
  const keys = [
    "schemaVersion", "challengeId", "challengeRequestFingerprint",
    "requestId", "stage", "purpose",
    "projectId", "teamId", "candidateDeploymentId", "candidateCommitSha",
    "candidateDeploymentTarget",
    "candidateAliasOrigin", "candidateImmutableOrigin", "routingRuleId",
    "routingRuleConfigVersion",
  ];
  if (!exactKeys(value, keys)) {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_REQUEST_INVALID",
      "The local provider-attestation request was not exact.",
      {},
      400,
    );
  }
  const stage = clean(value.stage).toUpperCase();
  const purpose = clean(value.purpose).toUpperCase();
  const projectId = clean(value.projectId);
  const teamId = clean(value.teamId);
  const candidateDeploymentId = clean(value.candidateDeploymentId);
  const candidateCommitSha = clean(value.candidateCommitSha).toLowerCase();
  const candidateDeploymentTarget = clean(value.candidateDeploymentTarget).toUpperCase();
  const candidateAliasOrigin = normalizedOrigin(value.candidateAliasOrigin, {
    requireVercel: true,
  });
  const candidateImmutableOrigin = normalizedOrigin(value.candidateImmutableOrigin, {
    requireVercel: true,
  });
  const routingRuleId = clean(value.routingRuleId);
  const routingRuleConfigVersion = clean(value.routingRuleConfigVersion);
  if (value.schemaVersion !== VERCEL_PROVIDER_ATTESTATION_REQUEST_SCHEMA ||
      !["BEGIN", "FINALIZE"].includes(stage) ||
      !["REHEARSAL", "CUTOVER"].includes(purpose) ||
      !["PREVIEW", "PRODUCTION"].includes(candidateDeploymentTarget) ||
      (purpose === "REHEARSAL" && candidateDeploymentTarget !== "PREVIEW") ||
      (purpose === "CUTOVER" && candidateDeploymentTarget !== "PRODUCTION") ||
      projectId !== PRODUCTION_VERCEL_PROJECT_ID || !TEAM_ID.test(teamId) ||
      !DEPLOYMENT_ID.test(candidateDeploymentId) || !HEX40.test(candidateCommitSha) ||
      !candidateAliasOrigin || !candidateImmutableOrigin ||
      candidateAliasOrigin === candidateImmutableOrigin ||
      !SAFE_PROVIDER_ID.test(routingRuleId) ||
      !SAFE_CONFIG_VERSION.test(routingRuleConfigVersion) ||
      !HEX64.test(clean(value.challengeRequestFingerprint).toLowerCase())) {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_REQUEST_INVALID",
      "The local provider-attestation request did not match the certified scope.",
      {},
      400,
    );
  }
  return Object.freeze({
    schemaVersion: VERCEL_PROVIDER_ATTESTATION_REQUEST_SCHEMA,
    challengeId: exactUuid(value.challengeId, "challengeId"),
    challengeRequestFingerprint: clean(value.challengeRequestFingerprint).toLowerCase(),
    requestId: exactUuid(value.requestId, "requestId"),
    stage,
    purpose,
    projectId,
    teamId,
    candidateDeploymentId,
    candidateCommitSha,
    candidateDeploymentTarget,
    candidateAliasOrigin,
    candidateImmutableOrigin,
    routingRuleId,
    routingRuleConfigVersion,
  });
}

function requestBinding(request) {
  return Object.freeze({
    schemaVersion: "bagger-vercel-provider-attestation-request-binding-v1",
    requestId: request.requestId,
    stage: request.stage,
    purpose: request.purpose,
    projectId: request.projectId,
    teamId: request.teamId,
    candidateDeploymentId: request.candidateDeploymentId,
    candidateCommitSha: request.candidateCommitSha,
    candidateDeploymentTarget: request.candidateDeploymentTarget,
    candidateAliasOrigin: request.candidateAliasOrigin,
    candidateImmutableOrigin: request.candidateImmutableOrigin,
    routingRuleId: request.routingRuleId,
    routingRuleConfigVersion: request.routingRuleConfigVersion,
  });
}

function requestFingerprint(request) {
  return sha256(canonicalAttestationJson(requestBinding(request)));
}

function normalizedFirewallAction(action) {
  if (clean(action).toLowerCase() === "deny") return "DENY";
  if (!plain(action)) return "";
  if (clean(action.type || action.action).toLowerCase() === "deny") return "DENY";
  if (plain(action.mitigate) &&
      clean(action.mitigate.action).toLowerCase() === "deny") return "DENY";
  return "";
}

function firewallConditions(rule) {
  const groups = Array.isArray(rule.conditionGroup)
    ? rule.conditionGroup
    : Array.isArray(rule.conditionGroups) ? rule.conditionGroups : null;
  if (!groups || groups.length !== 1 || !plain(groups[0]) ||
      !Array.isArray(groups[0].conditions) || groups[0].conditions.length !== 2) return null;
  return groups[0].conditions;
}

function conditionType(value) {
  return clean(value).replace(/[-_]/g, "").toLowerCase();
}

function exclusionCondition(condition, { type, value }) {
  if (!plain(condition) || conditionType(condition.type) !== conditionType(type)) return false;
  const operation = clean(condition.op || condition.operator).replace(/[-_]/g, "").toLowerCase();
  const negative = condition.neg === true || condition.negate === true;
  const expected = Array.isArray(value) ? [...value].sort() : value;
  const actual = Array.isArray(condition.value)
    ? [...new Set(condition.value.map((item) => clean(item).toUpperCase()))].sort()
    : clean(condition.value);
  const equality = ["eq", "equals", "is"].includes(operation) && negative;
  const inequality = ["neq", "noteq", "notequals", "isnot"].includes(operation) && !negative;
  const inclusion = ["inc", "in", "includes", "isanyof"].includes(operation) && negative;
  const exclusion = ["ninc", "notin", "excludes", "isnotanyof"].includes(operation) &&
    !negative;
  if (Array.isArray(expected)) {
    return (inclusion || exclusion) && canonicalAttestationJson(actual) ===
      canonicalAttestationJson(expected);
  }
  return (equality || inequality) && actual === expected;
}

export function normalizeVercelFirewallConfiguration(payload, expected) {
  if (!plain(payload) || !own(payload, "active") || !own(payload, "draft") ||
      !own(payload, "versions")) {
    throw attestationError(
      "STEP11_6_VERCEL_FIREWALL_RESPONSE_INVALID",
      "The Vercel firewall response did not use the active-config envelope.",
      {},
      503,
    );
  }
  // Only the provider's active configuration can establish an edge fence.
  // A syntactically valid draft is deliberately ignored and can never satisfy
  // the proof when active is null, empty, or mismatched.
  const config = plain(payload.active) ? payload.active : null;
  if (!config) {
    throw attestationError(
      "STEP11_6_VERCEL_FIREWALL_RULE_INVALID",
      "The Vercel firewall has no active writer-quiesce configuration.",
      {},
      409,
    );
  }
  const draftIsAbsent = payload.draft === null ||
    (plain(payload.draft) && Array.isArray(payload.draft.changes) &&
      payload.draft.changes.length === 0);
  if (!draftIsAbsent) {
    throw attestationError(
      "STEP11_6_VERCEL_FIREWALL_DRAFT_PENDING",
      "The Vercel firewall has unpublished draft changes.",
      {},
      409,
    );
  }
  const projectId = clean(config.projectId || payload.projectId || expected.projectId);
  const teamId = clean(config.teamId || payload.teamId || expected.teamId);
  const configurationVersion = clean(
    config.version ?? config.configVersion,
  );
  const etag = clean(config.etag || payload.etag) || null;
  const rules = Array.isArray(config.rules) ? config.rules : null;
  if (projectId !== expected.projectId || teamId !== expected.teamId ||
      !SAFE_CONFIG_VERSION.test(configurationVersion) ||
      configurationVersion !== expected.routingRuleConfigVersion ||
      config.firewallEnabled !== true || !rules) {
    throw attestationError(
      "STEP11_6_VERCEL_FIREWALL_RESPONSE_INVALID",
      "The Vercel firewall response did not bind the exact project/team/version.",
      {},
      503,
    );
  }
  const matches = rules.filter((rule) => clean(rule?.id) === expected.routingRuleId);
  if (matches.length !== 1) {
    throw attestationError(
      "STEP11_6_VERCEL_FIREWALL_RULE_INVALID",
      "The exact Vercel writer-quiesce rule was not uniquely active.",
      {},
      409,
    );
  }
  const rule = matches[0];
  const conditions = firewallConditions(rule);
  const pathCondition = conditions?.find((condition) =>
    conditionType(condition?.type) === "path" ||
    conditionType(condition?.type) === "requestpath");
  const methodCondition = conditions?.find((condition) =>
    conditionType(condition?.type) === "method" ||
    conditionType(condition?.type) === "requestmethod");
  if (rule.active !== true || normalizedFirewallAction(rule.action) !== "DENY" ||
      !pathCondition || !methodCondition ||
      !exclusionCondition(pathCondition, {
        type: pathCondition.type,
        value: PRODUCTION_GOOGLE_WRITER_QUIESCE_CONTROL_PATH,
      }) || !exclusionCondition(methodCondition, {
        type: methodCondition.type,
        value: ["GET", "HEAD", "OPTIONS"],
      })) {
    throw attestationError(
      "STEP11_6_VERCEL_FIREWALL_RULE_INVALID",
      "The exact project-wide deny rule was not active with the certified conditions.",
      {},
      409,
    );
  }
  const normalizedRule = Object.freeze({
    projectId: expected.projectId,
    teamId: expected.teamId,
    ruleId: expected.routingRuleId,
    configurationVersion,
    etag,
    scope: PRODUCTION_GOOGLE_WRITER_QUIESCE_SCOPE,
    projectWide: true,
    firewallEnabled: true,
    action: "DENY",
    requestPathOperator: "DOES_NOT_EQUAL",
    requestPath: PRODUCTION_GOOGLE_WRITER_QUIESCE_CONTROL_PATH,
    methodOperator: "IS_NOT_ANY_OF",
    methods: Object.freeze(["GET", "HEAD", "OPTIONS"]),
    pendingDraftChangeCount: 0,
  });
  return Object.freeze({
    ...normalizedRule,
    configurationFingerprint: sha256(canonicalAttestationJson(normalizedRule)),
  });
}

function deploymentId(value) {
  const candidates = [value?.uid, value?.id].map(clean).filter(Boolean);
  if (new Set(candidates).size > 1) return "";
  return candidates[0] || "";
}

function deploymentSha(value) {
  const candidates = [
    value?.meta?.githubCommitSha,
    value?.gitSource?.sha,
    value?.gitSource?.ref?.sha,
  ].map((item) => clean(item).toLowerCase()).filter(Boolean);
  if (new Set(candidates).size > 1) return "__MISMATCH__";
  return candidates[0] || null;
}

function deploymentBranch(value) {
  const candidates = [
    value?.meta?.githubCommitRef,
    value?.gitSource?.ref,
  ].filter((item) => typeof item === "string").map(clean).filter(Boolean);
  if (new Set(candidates).size > 1) return "__MISMATCH__";
  return candidates[0] || "";
}

function deploymentStatus(value) {
  const selected = clean(value?.readyState || value?.state).toUpperCase();
  if (selected === "READY") return "READY";
  if (selected === "ERROR") return "ERROR";
  if (["BLOCKED", "CANCELED", "CANCELLED"].includes(selected)) return "BLOCKED";
  return "";
}

function dynamicCandidateTuple(request) {
  return Object.freeze([
    request.candidateDeploymentId,
    request.candidateCommitSha,
    request.candidateImmutableOrigin,
    request.candidateDeploymentTarget === "PRODUCTION"
      ? "CUTOVER_PRODUCTION_CANDIDATE" : "FEATURE_PREVIEW",
    "READY",
    "GIT",
  ]);
}

function requiredCandidateTuple(request) {
  return dynamicCandidateTuple(request);
}

function reviewedPostCaptureDeploymentsByKey() {
  return new Map(PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS.map(
    (tuple) => [`${tuple[0]}\n${tuple[2]}`, tuple],
  ));
}

function validateLiveInventoryRecords(value, request) {
  const retained = productionLegacyDeploymentInventory();
  const candidateTuple = requiredCandidateTuple(request);
  const reviewedByKey = reviewedPostCaptureDeploymentsByKey();
  if (retained.records.some((record) => record.deploymentId === candidateTuple[0] ||
      record.origin === candidateTuple[2]) ||
      PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS.some((tuple) =>
        tuple[0] === candidateTuple[0] || tuple[2] === candidateTuple[2])) {
    throw attestationError(
      "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_COLLISION",
      "The dynamic candidate collided with the retained deployment scope.",
      {},
      409,
    );
  }
  if (!Array.isArray(value)) {
    throw attestationError(
      "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT",
      "The signed live deployment inventory was invalid.",
      {},
      409,
    );
  }
  const retainedKeys = new Map(retained.recordTuples.map((tuple) =>
    [`${tuple[0]}\n${tuple[2]}`, tuple]));
  const allowedAdditionScopes = request.purpose === "CUTOVER"
    ? new Set(["FEATURE_PREVIEW", "CUTOVER_PRODUCTION_CANDIDATE"])
    : new Set(["FEATURE_PREVIEW"]);
  const allowedStatuses = new Set(["READY", "ERROR", "BLOCKED"]);
  const tuples = value.map((record) => {
    if (!Array.isArray(record) || record.length !== 6) {
      throw attestationError(
        "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT",
        "A signed live deployment tuple was invalid.",
        {},
        409,
      );
    }
    const tuple = [
      clean(record[0]),
      record[1] === null ? null : clean(record[1]).toLowerCase(),
      normalizedOrigin(record[2], { requireVercel: true }),
      clean(record[3]), clean(record[4]), clean(record[5]),
    ];
    const key = `${tuple[0]}\n${tuple[2]}`;
    const frozen = retainedKeys.get(key);
    const reviewed = reviewedByKey.get(key);
    const isExactRetained = frozen && JSON.stringify(tuple) === JSON.stringify(frozen);
    const isExactReviewed = reviewed && JSON.stringify(tuple) === JSON.stringify(reviewed);
    if (!DEPLOYMENT_ID.test(tuple[0]) || !tuple[2] ||
        (!isExactRetained && !isExactReviewed &&
          (tuple[1] !== request.candidateCommitSha ||
          !allowedAdditionScopes.has(tuple[3]) ||
          !allowedStatuses.has(tuple[4]) || tuple[5] !== "GIT")) ||
        (frozen && !isExactRetained) || (reviewed && !isExactReviewed)) {
      throw attestationError(
        "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT",
        "A signed live deployment tuple drifted from the retained/additive contract.",
        { deploymentFingerprint: sha256(key) },
        409,
      );
    }
    return tuple;
  });
  const sorted = [...tuples].sort((left, right) =>
    compare(`${left[0]}\n${left[2]}`, `${right[0]}\n${right[2]}`));
  const keys = tuples.map((tuple) => `${tuple[0]}\n${tuple[2]}`);
  const deploymentIds = tuples.map((tuple) => tuple[0]);
  const origins = tuples.map((tuple) => tuple[2]);
  if (tuples.length < retained.recordCount +
        PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS.length + 1 ||
      new Set(keys).size !== tuples.length ||
      new Set(deploymentIds).size !== tuples.length ||
      new Set(origins).size !== tuples.length ||
      JSON.stringify(tuples) !== JSON.stringify(sorted) ||
      retained.recordTuples.some((tuple) => !keys.includes(`${tuple[0]}\n${tuple[2]}`)) ||
      PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS.some((tuple) =>
        !keys.includes(`${tuple[0]}\n${tuple[2]}`)) ||
      tuples.filter((tuple) => JSON.stringify(tuple) ===
        JSON.stringify(candidateTuple)).length !== 1) {
    throw attestationError(
      "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT",
      "The signed live deployment inventory omitted, duplicated, or reordered required scope.",
      {
        expectedMinimumCount: retained.recordCount +
          PRODUCTION_REVIEWED_POST_CAPTURE_PREVIEW_DEPLOYMENTS.length + 1,
        observedCount: tuples.length,
      },
      409,
    );
  }
  return Object.freeze({
    tuples: Object.freeze(tuples.map((item) => Object.freeze([...item]))),
    count: tuples.length,
    fingerprint: sha256(JSON.stringify(tuples)),
  });
}

function deploymentCreatedAt(value) {
  const selected = value?.createdAt ?? value?.created;
  const time = typeof selected === "number" ? selected : Date.parse(clean(selected));
  return Number.isFinite(time) ? Number(time) : NaN;
}

function normalizeDeploymentPage(payload) {
  if (!plain(payload) || !Array.isArray(payload.deployments) ||
      !plain(payload.pagination) || !own(payload.pagination, "next")) {
    throw attestationError(
      "STEP11_6_VERCEL_DEPLOYMENT_PAGE_INVALID",
      "A Vercel deployment page did not expose an explicit pagination boundary.",
      {},
      503,
    );
  }
  const next = payload.pagination.next === null || payload.pagination.next === undefined ||
    payload.pagination.next === 0 || payload.pagination.next === ""
    ? null : clean(payload.pagination.next);
  if (next !== null && !/^\d{1,20}$/.test(next)) {
    throw attestationError(
      "STEP11_6_VERCEL_DEPLOYMENT_PAGE_INVALID",
      "A Vercel deployment page returned an invalid continuation cursor.",
      {},
      503,
    );
  }
  return { deployments: payload.deployments, next };
}

function deploymentApiPath(request, until = null) {
  const query = new URLSearchParams({
    projectId: request.projectId,
    teamId: request.teamId,
    limit: "100",
  });
  if (until !== null) query.set("until", until);
  return `/v6/deployments?${query}`;
}

export async function collectVercelDeploymentScope(readApi, requestInput) {
  const request = normalizeAttestationRequest(requestInput);
  const raw = [];
  const pages = [];
  const seenCursors = new Set();
  let cursor = null;
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const path = deploymentApiPath(request, cursor);
    const page = normalizeDeploymentPage(await readApi(path));
    raw.push(...page.deployments);
    pages.push(Object.freeze({
      pageIndex,
      recordCount: page.deployments.length,
      requestCursor: cursor,
      nextCursor: page.next,
    }));
    if (page.next === null) break;
    if (seenCursors.has(page.next)) {
      throw attestationError(
        "STEP11_6_VERCEL_DEPLOYMENT_PAGINATION_LOOP",
        "Vercel deployment pagination repeated a continuation cursor.",
        {},
        503,
      );
    }
    seenCursors.add(page.next);
    cursor = page.next;
    if (pageIndex === 99) {
      throw attestationError(
        "STEP11_6_VERCEL_DEPLOYMENT_PAGINATION_INCOMPLETE",
        "Vercel deployment pagination did not terminate.",
        {},
        503,
      );
    }
  }
  if (pages.length === 0 || pages.at(-1).nextCursor !== null) {
    throw attestationError(
      "STEP11_6_VERCEL_DEPLOYMENT_PAGINATION_INCOMPLETE",
      "Vercel deployment pagination was not exhausted.",
      {},
      503,
    );
  }
  const retained = productionLegacyDeploymentInventory();
  const retainedByKey = new Map(retained.recordTuples.map((tuple) =>
    [`${tuple[0]}\n${tuple[2]}`, tuple]));
  const reviewedByKey = reviewedPostCaptureDeploymentsByKey();
  const candidateTuple = requiredCandidateTuple(request);
  const retainedAt = Date.parse(retained.capturedAt);
  const observedTuples = [];
  for (const value of raw) {
    const id = deploymentId(value);
    const origin = normalizedOrigin(value?.url?.startsWith?.("http")
      ? value.url : `https://${clean(value?.url)}`, { requireVercel: true });
    const key = `${id}\n${origin}`;
    const retainedTuple = retainedByKey.get(key);
    const reviewedTuple = reviewedByKey.get(key);
    const sha = deploymentSha(value);
    const branch = deploymentBranch(value);
    const status = deploymentStatus(value);
    const target = clean(value?.target).toLowerCase();
    let observedTuple;
    if (retainedTuple) {
      observedTuple = [...retainedTuple];
      if (sha !== retainedTuple[1] || status !== retainedTuple[4] ||
          (retainedTuple[3] === "MAIN_PRODUCTION"
            ? target !== "production" || branch !== "main"
            : target !== "preview" || branch !==
              VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH)) observedTuple = null;
    } else if (reviewedTuple) {
      observedTuple = [...reviewedTuple];
      if (sha !== reviewedTuple[1] || status !== reviewedTuple[4] ||
          target !== "preview" || branch !==
            VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH) observedTuple = null;
    } else {
      const createdAt = deploymentCreatedAt(value);
      const isCurrentCandidate = id === request.candidateDeploymentId &&
        origin === request.candidateImmutableOrigin;
      const scopeClass = target === "preview" && branch ===
        VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH
          ? "FEATURE_PREVIEW"
          : target === "production" &&
              branch === VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH
            ? "CUTOVER_PRODUCTION_CANDIDATE" : "";
      if (Number.isFinite(createdAt) && createdAt >= retainedAt && scopeClass &&
          sha === request.candidateCommitSha && status &&
          (request.purpose === "CUTOVER" || scopeClass === "FEATURE_PREVIEW")) {
        observedTuple = [id, sha, origin, scopeClass, status, "GIT"];
      }
      if (isCurrentCandidate && JSON.stringify(observedTuple) !==
          JSON.stringify(candidateTuple)) observedTuple = null;
    }
    if (!DEPLOYMENT_ID.test(id) || !origin || !observedTuple) {
      throw attestationError(
        "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT",
        "The live Vercel deployment scope differed from the retained scope plus candidate.",
        { deploymentFingerprint: sha256(key) },
        409,
      );
    }
    observedTuples.push(observedTuple);
  }
  observedTuples.sort((left, right) =>
    compare(`${left[0]}\n${left[2]}`, `${right[0]}\n${right[2]}`));
  const live = validateLiveInventoryRecords(observedTuples, request);
  return Object.freeze({
    retainedRecordCount: PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT,
    retainedRecordsFingerprint: PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT,
    liveRecordCount: live.count,
    liveRecordsFingerprint: live.fingerprint,
    liveRecords: live.tuples,
    pageCount: pages.length,
    paginationComplete: true,
    paginationFingerprint: sha256(canonicalAttestationJson(pages)),
  });
}

const RELEVANT_ENVIRONMENT_NAME = /(?:GOOGLE|SUPABASE|SCORING_AUTHORITY|PARTICIPANT_IDENTITY_AUTHORITY|PRODUCTION_CUTOVER|VERCEL_PROVIDER_ATTESTATION|STEP11_6|STEP12)/i;
const ENVIRONMENT_TARGETS = new Set(["development", "preview", "production"]);
const REQUIRED_ATTESTED_RUNTIME_ENVIRONMENT_NAMES = Object.freeze([
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "PRODUCTION_GOOGLE_PRIVATE_KEY",
  "GOOGLE_SHEETS_ID",
  "PRODUCTION_SUPABASE_SECRET_KEY",
  VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV,
  VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV,
]);
const LEGACY_BROAD_PREVIEW_ENVIRONMENT_NAMES = Object.freeze(new Set([
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
]));

function exactLegacyBroadEnvironmentRecord(record) {
  return LEGACY_BROAD_PREVIEW_ENVIRONMENT_NAMES.has(record[0]) &&
    record[2] === null && record[1].length === 2 &&
    record[1][0] === "preview" && record[1][1] === "production";
}

export function normalizeVercelEnvironmentScope(payload, { request } = {}) {
  if (!plain(payload) || !Array.isArray(payload.envs)) {
    throw attestationError(
      "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_INVALID",
      "The Vercel environment metadata response was invalid.",
      {},
      503,
    );
  }
  const records = payload.envs.filter((value) => {
    const name = clean(value?.key || value?.name);
    return RELEVANT_ENVIRONMENT_NAME.test(name);
  }).map((value) => {
    const name = clean(value?.key || value?.name);
    const targets = (Array.isArray(value?.target) ? value.target : [value?.target])
      .map((target) => clean(target).toLowerCase()).filter(Boolean);
    const normalizedTargets = [...new Set(targets)].sort(compare);
    const gitBranch = value?.gitBranch === null || value?.gitBranch === undefined
      ? null : clean(value.gitBranch);
    if (!/^[A-Z][A-Z0-9_]{2,160}$/.test(name) || normalizedTargets.length === 0 ||
        normalizedTargets.some((target) => !ENVIRONMENT_TARGETS.has(target)) ||
        (gitBranch !== null && (!gitBranch || gitBranch.length > 240))) {
      throw attestationError(
        "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_INVALID",
        "A redacted Vercel environment-scope record was invalid.",
        {},
        503,
      );
    }
    return Object.freeze([name, Object.freeze(normalizedTargets), gitBranch]);
  }).sort((left, right) => compare(canonicalAttestationJson(left),
    canonicalAttestationJson(right)));
  const keys = records.map(canonicalAttestationJson);
  if (records.length === 0 || new Set(keys).size !== keys.length) {
    throw attestationError(
      "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_INVALID",
      "The relevant redacted Vercel environment scope was empty or duplicated.",
      {},
      409,
    );
  }
  if (request) {
    const target = request.candidateDeploymentTarget === "PRODUCTION"
      ? "production" : "preview";
    // Vercel represents a branch-bound Preview secret as target=preview plus
    // gitBranch. A null branch on any sensitive Preview record is project-wide
    // Preview exposure and would let an unrelated immutable deployment receive
    // the Production credential. Production-scoped records remain legitimate,
    // but branch metadata is never meaningful for them.
    const unsafeBranchScope = records.some((record) =>
      record[1].includes("development") ||
      (record[1].includes("preview") &&
        record[2] !== VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH &&
        !exactLegacyBroadEnvironmentRecord(record)) ||
      (record[2] !== null &&
        (record[1].length !== 1 || record[1][0] !== "preview" ||
          record[2] !== VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH)));
    const missingRequired = REQUIRED_ATTESTED_RUNTIME_ENVIRONMENT_NAMES.filter((name) =>
      !records.some((record) => record[0] === name && record[1].includes(target) &&
        (target === "production" ? record[2] === null
          : record[2] === VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH ||
            exactLegacyBroadEnvironmentRecord(record))));
    if (unsafeBranchScope || missingRequired.length > 0) {
      throw attestationError(
        "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_UNSAFE",
        "The redacted Vercel environment metadata did not prove the exact candidate scope.",
        { missingRequiredCount: missingRequired.length, unsafeBranchScope },
        409,
      );
    }
  }
  return Object.freeze({
    recordCount: records.length,
    records: Object.freeze(records),
    recordsFingerprint: sha256(JSON.stringify(records)),
  });
}

function environmentApiPath(request) {
  const query = new URLSearchParams({ teamId: request.teamId });
  return `/v9/projects/${encodeURIComponent(request.projectId)}/env?${query}`;
}

function firewallApiPath(request) {
  const query = new URLSearchParams({
    projectId: request.projectId,
    teamId: request.teamId,
  });
  return `/v1/security/firewall/config?${query}`;
}

function signedDocument(attestation, signerKeyFingerprint) {
  return Object.freeze({
    schemaVersion: VERCEL_PROVIDER_ATTESTATION_ENVELOPE_SCHEMA,
    algorithm: VERCEL_PROVIDER_ATTESTATION_ALGORITHM,
    signerKeyVersion: VERCEL_PROVIDER_ATTESTATION_SIGNER_KEY_VERSION,
    signerKeyFingerprint,
    attestation,
  });
}

function publicKeyFingerprint(publicKey) {
  return sha256(publicKey.export({ type: "spki", format: "der" }));
}

export function pinnedEd25519PublicKeyBase64(key) {
  const publicKey = key?.type === "public" ? key : createPublicKey(key);
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_KEY_INVALID",
      "The provider-attestation public key was not Ed25519.",
      {},
      400,
    );
  }
  return publicKey.export({ type: "spki", format: "der" }).toString("base64");
}

function publicKeyFromPinnedBase64(value) {
  const selected = clean(value);
  let publicKey;
  try {
    const bytes = Buffer.from(selected, "base64");
    if (!selected || bytes.length < 32 || bytes.toString("base64") !== selected) throw new Error();
    publicKey = createPublicKey({ key: bytes, format: "der", type: "spki" });
  } catch {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_PUBLIC_KEY_INVALID",
      "The pinned provider-attestation public key was invalid.",
      {},
      503,
    );
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_PUBLIC_KEY_INVALID",
      "The pinned provider-attestation public key was not Ed25519.",
      {},
      503,
    );
  }
  return publicKey;
}

export async function createVercelProviderAttestation({
  request: requestInput,
  privateKey,
  readApi,
  now = Date.now(),
  attestationId: attestationIdInput = randomUUID(),
} = {}) {
  if (typeof readApi !== "function") throw new TypeError("A read-only Vercel API reader is required.");
  const request = normalizeAttestationRequest(requestInput);
  const attestationId = exactUuid(attestationIdInput, "attestationId");
  if (attestationId === request.challengeId) {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_ID_INVALID",
      "The provider attestation and database-issued challenge must have distinct identities.",
      {},
      400,
    );
  }
  let signer;
  try {
    signer = privateKey?.type === "private" ? privateKey : createPrivateKey(privateKey);
  }
  catch {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_PRIVATE_KEY_INVALID",
      "The local provider-attestation private key was invalid.",
      {},
      400,
    );
  }
  if (signer.asymmetricKeyType !== "ed25519") {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_PRIVATE_KEY_INVALID",
      "The local provider-attestation private key was not Ed25519.",
      {},
      400,
    );
  }
  const observedAt = new Date(Number(now));
  if (Number.isNaN(observedAt.getTime())) {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_TIMESTAMP_INVALID",
      "The local provider-attestation clock was invalid.",
      {},
      400,
    );
  }
  const [firewallPayload, deploymentScope, environmentPayload] = await Promise.all([
    readApi(firewallApiPath(request)),
    collectVercelDeploymentScope(readApi, request),
    readApi(environmentApiPath(request)),
  ]);
  const firewall = normalizeVercelFirewallConfiguration(firewallPayload, request);
  const environmentScope = normalizeVercelEnvironmentScope(environmentPayload, { request });
  const credentialConfinement = productionGoogleCredentialConfinementEvidence();
  if (credentialConfinement.originInventoryFingerprint !==
      PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT ||
      credentialConfinement.originInventoryRecordCount !==
        PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT) {
    throw attestationError(
      "STEP11_6_VERCEL_CREDENTIAL_CONFINEMENT_INVALID",
      "The historical credential-confinement proof did not bind the retained inventory.",
      {},
      503,
    );
  }
  const selectedRequestFingerprint = requestFingerprint(request);
  const attestedAt = observedAt.toISOString();
  const expiresAt = new Date(observedAt.getTime() +
    VERCEL_PROVIDER_ATTESTATION_VALIDITY_SECONDS * 1_000).toISOString();
  const attestation = Object.freeze({
    schemaVersion: VERCEL_PROVIDER_ATTESTATION_SCHEMA,
    // The trusted local attester, not the browser/runtime, generates this
    // durable identity. The database-issued challenge remains the nonce.
    attestationId,
    challengeId: request.challengeId,
    challengeRequestFingerprint: request.challengeRequestFingerprint,
    requestId: request.requestId,
    requestFingerprint: selectedRequestFingerprint,
    stage: request.stage,
    purpose: request.purpose,
    vercelProjectId: request.projectId,
    vercelTeamId: request.teamId,
    candidateDeploymentId: request.candidateDeploymentId,
    candidateDeploymentCommit: request.candidateCommitSha,
    candidateDeploymentTarget: request.candidateDeploymentTarget,
    candidateAliasOrigin: request.candidateAliasOrigin,
    candidateImmutableOrigin: request.candidateImmutableOrigin,
    routingRuleId: firewall.ruleId,
    routingRuleConfigVersion: firewall.configurationVersion,
    routingRuleEtag: firewall.etag,
    routingRuleFingerprint: firewall.configurationFingerprint,
    routingRulePendingDraftChangeCount: firewall.pendingDraftChangeCount,
    retainedOriginInventoryCount: deploymentScope.retainedRecordCount,
    retainedOriginInventoryFingerprint: deploymentScope.retainedRecordsFingerprint,
    liveOriginInventoryCount: deploymentScope.liveRecordCount,
    liveOriginInventoryFingerprint: deploymentScope.liveRecordsFingerprint,
    liveOriginInventoryRecords: deploymentScope.liveRecords,
    deploymentPaginationPageCount: deploymentScope.pageCount,
    deploymentPaginationFingerprint: deploymentScope.paginationFingerprint,
    redactedEnvironmentScopeRecordCount: environmentScope.recordCount,
    redactedEnvironmentScopeFingerprint: environmentScope.recordsFingerprint,
    redactedEnvironmentScopeRecords: environmentScope.records,
    credentialConfinementEvidenceSchema:
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA,
    credentialConfinementRecordCount:
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT,
    credentialConfinementRecordsFingerprint:
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT,
    credentialConfinementEvidenceFingerprint:
      PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT,
    providerResponseMetadata: Object.freeze({
      transport: "VERCEL_CLI_JSON_BODY_V1",
      responseHeadersAvailable: false,
      firewallDate: null,
      firewallEtag: firewall.etag,
      firewallRequestId: null,
      deploymentsDate: null,
      deploymentsEtag: null,
      deploymentsRequestId: null,
      environmentDate: null,
      environmentEtag: null,
      environmentRequestId: null,
    }),
    providerObservedAt: attestedAt,
    attestedAt,
    expiresAt,
  });
  const publicKey = createPublicKey(signer);
  const signerKeyFingerprint = publicKeyFingerprint(publicKey);
  const document = signedDocument(attestation, signerKeyFingerprint);
  const serialized = canonicalAttestationJson(document);
  return Object.freeze({
    ...document,
    attestationFingerprint: sha256(serialized),
    signature: signDetached(null, Buffer.from(serialized), signer).toString("base64url"),
  });
}

const ATTESTATION_KEYS = Object.freeze([
  "schemaVersion", "attestationId", "challengeId", "challengeRequestFingerprint",
  "requestId", "requestFingerprint", "stage", "purpose", "vercelProjectId",
  "vercelTeamId", "candidateDeploymentId", "candidateDeploymentCommit",
  "candidateDeploymentTarget",
  "candidateAliasOrigin", "candidateImmutableOrigin", "routingRuleId",
  "routingRuleConfigVersion", "routingRuleEtag", "routingRuleFingerprint",
  "routingRulePendingDraftChangeCount",
  "retainedOriginInventoryCount", "retainedOriginInventoryFingerprint",
  "liveOriginInventoryCount", "liveOriginInventoryFingerprint",
  "liveOriginInventoryRecords",
  "deploymentPaginationPageCount", "deploymentPaginationFingerprint",
  "redactedEnvironmentScopeRecordCount", "redactedEnvironmentScopeFingerprint",
  "redactedEnvironmentScopeRecords", "credentialConfinementEvidenceSchema",
  "credentialConfinementRecordCount", "credentialConfinementRecordsFingerprint",
  "credentialConfinementEvidenceFingerprint", "providerResponseMetadata",
  "providerObservedAt", "attestedAt", "expiresAt",
]);

function validProviderResponseMetadata(value, routingRuleEtag) {
  return exactKeys(value, [
    "transport", "responseHeadersAvailable", "firewallDate", "firewallEtag",
    "firewallRequestId", "deploymentsDate", "deploymentsEtag", "deploymentsRequestId",
    "environmentDate", "environmentEtag", "environmentRequestId",
  ]) && value.transport === "VERCEL_CLI_JSON_BODY_V1" &&
    value.responseHeadersAvailable === false && value.firewallDate === null &&
    value.firewallEtag === routingRuleEtag && value.firewallRequestId === null &&
    value.deploymentsDate === null && value.deploymentsEtag === null &&
    value.deploymentsRequestId === null && value.environmentDate === null &&
    value.environmentEtag === null && value.environmentRequestId === null;
}

function normalizeSignedEnvironmentRecords(value, request) {
  return normalizeVercelEnvironmentScope({ envs: value.map((record) => {
    if (!Array.isArray(record) || record.length !== 3) return {};
    return { key: record[0], target: record[1], gitBranch: record[2] };
  }) }, { request });
}

export function verifyVercelProviderAttestation(envelope, {
  env = process.env,
  request: requestInput,
  expectedRoutingRuleRevision,
  initialMaxAgeSeconds = VERCEL_PROVIDER_ATTESTATION_INITIAL_MAX_AGE_SECONDS,
  now = Date.now(),
} = {}) {
  const envelopeKeys = [
    "schemaVersion", "algorithm", "signerKeyVersion", "signerKeyFingerprint",
    "attestation", "attestationFingerprint", "signature",
  ];
  if (!exactKeys(envelope, envelopeKeys) ||
      envelope.schemaVersion !== VERCEL_PROVIDER_ATTESTATION_ENVELOPE_SCHEMA ||
      envelope.algorithm !== VERCEL_PROVIDER_ATTESTATION_ALGORITHM ||
      envelope.signerKeyVersion !== VERCEL_PROVIDER_ATTESTATION_SIGNER_KEY_VERSION ||
      !HEX64.test(clean(envelope.signerKeyFingerprint).toLowerCase()) ||
      !HEX64.test(clean(envelope.attestationFingerprint).toLowerCase()) ||
      !BASE64URL.test(clean(envelope.signature)) ||
      !exactKeys(envelope.attestation, ATTESTATION_KEYS)) {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_ENVELOPE_INVALID",
      "The signed Vercel provider-attestation envelope was invalid.",
      {},
      400,
    );
  }
  const pinnedTeamId = clean(env[VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]);
  const pinnedPublicKey = publicKeyFromPinnedBase64(
    env[VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV],
  );
  const signerKeyFingerprint = publicKeyFingerprint(pinnedPublicKey);
  if (!TEAM_ID.test(pinnedTeamId) || signerKeyFingerprint !==
      clean(envelope.signerKeyFingerprint).toLowerCase()) {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_PIN_MISMATCH",
      "The signed provider attestation did not match the pinned signer/team.",
      {},
      409,
    );
  }
  const document = signedDocument(envelope.attestation, signerKeyFingerprint);
  const serialized = canonicalAttestationJson(document);
  if (sha256(serialized) !== clean(envelope.attestationFingerprint).toLowerCase() ||
      !verifyDetached(null, Buffer.from(serialized), pinnedPublicKey,
        Buffer.from(clean(envelope.signature), "base64url"))) {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_SIGNATURE_INVALID",
      "The signed Vercel provider attestation did not verify.",
      {},
      409,
    );
  }
  const request = normalizeAttestationRequest(requestInput);
  const claim = envelope.attestation;
  const expectedRequestFingerprint = requestFingerprint(request);
  const environmentScope = normalizeSignedEnvironmentRecords(
    claim.redactedEnvironmentScopeRecords,
    request,
  );
  const liveInventory = validateLiveInventoryRecords(
    claim.liveOriginInventoryRecords,
    request,
  );
  const routingRuleRevision = clean(expectedRoutingRuleRevision);
  const providerObservedAt = exactTimestamp(claim.providerObservedAt, "providerObservedAt");
  const attestedAt = exactTimestamp(claim.attestedAt, "attestedAt");
  const expiresAt = exactTimestamp(claim.expiresAt, "expiresAt");
  const current = Number(now);
  if (!Number.isSafeInteger(initialMaxAgeSeconds) || initialMaxAgeSeconds < 1 ||
      initialMaxAgeSeconds > VERCEL_PROVIDER_ATTESTATION_VALIDITY_SECONDS) {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_FRESHNESS_POLICY_INVALID",
      "The provider-attestation freshness policy was invalid.",
      {},
      500,
    );
  }
  const attestedTime = Date.parse(attestedAt);
  const observedTime = Date.parse(providerObservedAt);
  const expiryTime = Date.parse(expiresAt);
  if (claim.schemaVersion !== VERCEL_PROVIDER_ATTESTATION_SCHEMA ||
      exactUuid(claim.attestationId, "attestationId") === request.challengeId ||
      exactUuid(claim.challengeId, "challengeId") !== request.challengeId ||
      exactUuid(claim.requestId, "requestId") !== request.requestId ||
      claim.requestFingerprint !== expectedRequestFingerprint ||
      claim.challengeRequestFingerprint !== request.challengeRequestFingerprint ||
      claim.stage !== request.stage || claim.purpose !== request.purpose ||
      claim.vercelProjectId !== request.projectId || claim.vercelTeamId !== pinnedTeamId ||
      claim.candidateDeploymentId !== request.candidateDeploymentId ||
      claim.candidateDeploymentCommit !== request.candidateCommitSha ||
      claim.candidateDeploymentTarget !== request.candidateDeploymentTarget ||
      claim.candidateAliasOrigin !== request.candidateAliasOrigin ||
      claim.candidateImmutableOrigin !== request.candidateImmutableOrigin ||
      claim.routingRuleId !== request.routingRuleId ||
      claim.routingRuleConfigVersion !== request.routingRuleConfigVersion ||
      !SAFE_CONFIG_VERSION.test(clean(claim.routingRuleConfigVersion)) ||
      (routingRuleRevision && claim.routingRuleConfigVersion !== routingRuleRevision) ||
      !(claim.routingRuleEtag === null ||
        SAFE_CONFIG_VERSION.test(clean(claim.routingRuleEtag))) ||
      !HEX64.test(clean(claim.routingRuleFingerprint)) ||
      claim.routingRulePendingDraftChangeCount !== 0 ||
      claim.retainedOriginInventoryCount !== PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT ||
      claim.retainedOriginInventoryFingerprint !==
        PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT ||
      claim.liveOriginInventoryCount !== liveInventory.count ||
      claim.liveOriginInventoryFingerprint !== liveInventory.fingerprint ||
      !Number.isSafeInteger(claim.deploymentPaginationPageCount) ||
      claim.deploymentPaginationPageCount < 1 ||
      !HEX64.test(clean(claim.deploymentPaginationFingerprint)) ||
      claim.redactedEnvironmentScopeRecordCount !== environmentScope.recordCount ||
      claim.redactedEnvironmentScopeFingerprint !== environmentScope.recordsFingerprint ||
      claim.credentialConfinementEvidenceSchema !==
        PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_SCHEMA ||
      claim.credentialConfinementRecordCount !==
        PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORD_COUNT ||
      claim.credentialConfinementRecordsFingerprint !==
        PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_RECORDS_FINGERPRINT ||
      claim.credentialConfinementEvidenceFingerprint !==
        PRODUCTION_GOOGLE_CREDENTIAL_CONFINEMENT_EVIDENCE_FINGERPRINT ||
      !validProviderResponseMetadata(claim.providerResponseMetadata,
        claim.routingRuleEtag) ||
      observedTime !== attestedTime || !Number.isFinite(current) ||
      attestedTime > current + 30_000 ||
      current - attestedTime >
        initialMaxAgeSeconds * 1_000 ||
      expiryTime <= current || expiryTime - attestedTime !==
        VERCEL_PROVIDER_ATTESTATION_VALIDITY_SECONDS * 1_000) {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_SCOPE_INVALID",
      "The signed Vercel provider attestation was stale or did not match the exact request.",
      {},
      409,
    );
  }
  return Object.freeze({
    attestationId: claim.attestationId,
    attestationFingerprint: clean(envelope.attestationFingerprint).toLowerCase(),
    signerKeyFingerprint,
    signerKeyVersion: envelope.signerKeyVersion,
    stage: claim.stage,
    challengeId: claim.challengeId,
    challengeRequestFingerprint: claim.challengeRequestFingerprint,
    operationRequestId: claim.requestId,
    requestFingerprint: claim.requestFingerprint,
    signatureVerified: true,
    vercelProjectId: claim.vercelProjectId,
    vercelTeamId: claim.vercelTeamId,
    candidateDeploymentId: claim.candidateDeploymentId,
    candidateDeploymentCommit: claim.candidateDeploymentCommit,
    candidateDeploymentTarget: claim.candidateDeploymentTarget,
    routingRuleId: claim.routingRuleId,
    routingRuleConfigVersion: claim.routingRuleConfigVersion,
    routingRuleEtag: claim.routingRuleEtag,
    routingRuleFingerprint: claim.routingRuleFingerprint,
    routingRulePendingDraftChangeCount: claim.routingRulePendingDraftChangeCount,
    liveOriginInventoryCount: claim.liveOriginInventoryCount,
    liveOriginInventoryFingerprint: claim.liveOriginInventoryFingerprint,
    liveOriginInventoryRecords: liveInventory.tuples,
    redactedEnvironmentScopeFingerprint: claim.redactedEnvironmentScopeFingerprint,
    credentialConfinementEvidenceSchema:
      claim.credentialConfinementEvidenceSchema,
    credentialConfinementRecordCount: claim.credentialConfinementRecordCount,
    credentialConfinementRecordsFingerprint:
      claim.credentialConfinementRecordsFingerprint,
    credentialConfinementEvidenceFingerprint:
      claim.credentialConfinementEvidenceFingerprint,
    providerObservedAt,
  });
}

export function publicVercelProviderAttestationError(error) {
  return Object.freeze({
    ok: false,
    error: "The signed Vercel provider attestation did not verify.",
    code: /^[A-Z][A-Z0-9_]{2,120}$/.test(clean(error?.code))
      ? clean(error.code) : "STEP11_6_VERCEL_ATTESTATION_FAILED",
    diagnostics: Object.freeze({ ...(error?.safeDiagnostics || {}) }),
  });
}
