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
  productionGoogleWriterAllMethodFenceHosts,
  productionGoogleWriterAllMethodFencePaths,
  PRODUCTION_GOOGLE_WRITER_QUIESCE_CONTROL_PATH,
  PRODUCTION_GOOGLE_WRITER_QUIESCE_SCOPE,
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT,
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT,
  PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_COUNT,
  PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_FINGERPRINT,
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

function firewallConditionGroups(rule) {
  const groups = Array.isArray(rule.conditionGroup)
    ? rule.conditionGroup
    : Array.isArray(rule.conditionGroups) ? rule.conditionGroups : null;
  if (!groups || groups.some((group) => !plain(group) ||
      !Array.isArray(group.conditions))) return null;
  return groups.map((group) => group.conditions);
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

function inclusionCondition(condition, { types, values }) {
  if (!plain(condition) || !types.map(conditionType).includes(
    conditionType(condition.type),
  )) return false;
  const operation = clean(condition.op || condition.operator)
    .replace(/[-_]/g, "").toLowerCase();
  const actual = Array.isArray(condition.value)
    ? [...new Set(condition.value.map((item) => clean(item).toLowerCase()))].sort(compare)
    : [clean(condition.value).toLowerCase()];
  return condition.neg !== true && condition.negate !== true &&
    ["inc", "in", "includes", "isanyof"].includes(operation) &&
    canonicalAttestationJson(actual) === canonicalAttestationJson(values);
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
  const conditionGroups = firewallConditionGroups(rule);
  const allMethodFence = productionGoogleWriterAllMethodFenceHosts();
  const allMethodHostnames = [...allMethodFence.hostnames].sort(compare);
  const allMethodPaths = productionGoogleWriterAllMethodFencePaths();
  const primaryGroups = conditionGroups?.filter((conditions) => {
    if (conditions.length !== 2) return false;
    const pathCondition = conditions.find((condition) =>
      new Set(["path", "requestpath"]).has(conditionType(condition?.type)));
    const methodCondition = conditions.find((condition) =>
      new Set(["method", "requestmethod"]).has(conditionType(condition?.type)));
    return pathCondition && methodCondition && exclusionCondition(pathCondition, {
      type: pathCondition.type,
      value: PRODUCTION_GOOGLE_WRITER_QUIESCE_CONTROL_PATH,
    }) && exclusionCondition(methodCondition, {
      type: methodCondition.type,
      value: ["GET", "HEAD", "OPTIONS"],
    });
  }) || [];
  const allMethodGroups = conditionGroups?.filter((conditions) =>
    conditions.length === 1 && inclusionCondition(conditions[0], {
      types: ["host", "hostname", "request-host", "request-hostname"],
      values: allMethodHostnames,
    })) || [];
  const allMethodPathGroups = conditionGroups?.filter((conditions) =>
    conditions.length === 1 && inclusionCondition(conditions[0], {
      types: ["path", "requestpath"],
      values: allMethodPaths.paths,
    })) || [];
  if (rule.active !== true || normalizedFirewallAction(rule.action) !== "DENY" ||
      conditionGroups?.length !== 3 || primaryGroups.length !== 1 ||
      allMethodGroups.length !== 1 || allMethodPathGroups.length !== 1) {
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
    allMethodFenceRequiredHostCount: allMethodFence.count,
    allMethodFenceRequiredHostsFingerprint: allMethodFence.fingerprint,
    allMethodFenceRequiredPathCount: allMethodPaths.count,
    allMethodFenceRequiredPathsFingerprint: allMethodPaths.fingerprint,
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

function deploymentProviderCommitSha(value) {
  const candidates = [
    value?.meta?.githubCommitSha,
    value?.gitSource?.sha,
    value?.gitSource?.ref?.sha,
  ].map((item) => clean(item).toLowerCase()).filter(Boolean);
  if (new Set(candidates).size > 1 || candidates.some((sha) =>
    !/^[0-9a-f]{7,40}$/.test(sha))) return "__MISMATCH__";
  return candidates[0] || null;
}

function deploymentBranch(value) {
  const candidates = [
    value?.meta?.githubCommitRef,
    value?.gitSource?.ref,
  ].filter((item) => typeof item === "string").map(clean).filter(Boolean);
  if (new Set(candidates).size > 1) return "__MISMATCH__";
  return candidates[0] || null;
}

function deploymentSource(value) {
  const selected = clean(value?.source).toUpperCase() || "UNAVAILABLE";
  return new Set(["CLI", "GIT", "IMPORT", "REDEPLOY", "UNAVAILABLE"]).has(selected)
    ? selected : "";
}

function deploymentStatus(value) {
  const normalize = (item) => {
    const selected = clean(item).toUpperCase();
    if (selected === "READY") return "READY";
    if (selected === "ERROR") return "ERROR";
    if (["BLOCKED", "CANCELED", "CANCELLED"].includes(selected)) return "BLOCKED";
    return "";
  };
  const candidates = [value?.readyState, value?.state].map(normalize).filter(Boolean);
  return new Set(candidates).size === 1 ? candidates[0] : "";
}

function deploymentTarget(value) {
  // Vercel's v6 deployment-list API represents Preview with an explicit null
  // target. Production is the literal string "production". Bind those exact
  // v6 encodings so an omitted field or later provider representation change
  // fails closed for review rather than widening Preview scope.
  if (value && Object.prototype.hasOwnProperty.call(value, "target") &&
      value.target === null) return "PREVIEW";
  const selected = clean(value?.target).toLowerCase();
  if (selected === "production") return "PRODUCTION";
  return "";
}

function providerMetadataFingerprint(providerRecord) {
  return sha256(JSON.stringify([
    providerRecord[2], providerRecord[4], providerRecord[5], providerRecord[6],
    providerRecord[8], providerRecord[9],
  ]));
}

function projectedProviderRecord(providerRecord, request, retainedKeySet) {
  const key = `${providerRecord[0]}\n${providerRecord[3]}`;
  const dynamicCandidate = !retainedKeySet.has(key) &&
    providerRecord[0] === request.candidateDeploymentId &&
    providerRecord[3] === request.candidateImmutableOrigin;
  const scopeClass = dynamicCandidate && request.purpose === "CUTOVER"
    ? "CUTOVER_PRODUCTION_CANDIDATE"
    : providerRecord[4] === "PRODUCTION" ? "PRODUCTION_TARGET" : "PROJECT_PREVIEW";
  return Object.freeze([
    providerRecord[0], providerRecord[1], providerRecord[3], scopeClass,
    providerRecord[7], providerMetadataFingerprint(providerRecord),
  ]);
}

function exactSignedProviderRecord(value) {
  if (!Array.isArray(value) || value.length !== 10) return null;
  const tuple = [
    clean(value[0]), value[1] === null ? null : clean(value[1]).toLowerCase(),
    value[2] === null ? null : clean(value[2]).toLowerCase(),
    normalizedOrigin(value[3], { requireVercel: true }), clean(value[4]),
    value[5] === null ? null : clean(value[5]), clean(value[6]), clean(value[7]),
    clean(value[8]), clean(value[9]),
  ];
  const timestamp = Date.parse(tuple[8]);
  const exactProvider = tuple[9] === "EXACT_PROVIDER" && HEX40.test(tuple[1] || "") &&
    tuple[2] === tuple[1];
  const localAbbreviation = tuple[9] === "LOCAL_GIT_ABBREVIATION" &&
    HEX40.test(tuple[1] || "") && /^[0-9a-f]{7,39}$/.test(tuple[2] || "") &&
    tuple[1].startsWith(tuple[2]);
  const unavailable = tuple[9] === "UNAVAILABLE" && tuple[1] === null &&
    tuple[2] === null && tuple[5] === null && tuple[6] === "CLI";
  if (!DEPLOYMENT_ID.test(tuple[0]) || !tuple[3] ||
      !new Set(["PRODUCTION", "PREVIEW"]).has(tuple[4]) ||
      (tuple[5] !== null && (!tuple[5] || tuple[5].length > 240)) ||
      !new Set(["CLI", "GIT", "IMPORT", "REDEPLOY", "UNAVAILABLE"]).has(tuple[6]) ||
      !new Set(["READY", "ERROR", "BLOCKED"]).has(tuple[7]) ||
      !Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== tuple[8] ||
      !(exactProvider || localAbbreviation || unavailable) ||
      (tuple[1] !== null && tuple[5] === null && tuple[6] === "GIT")) return null;
  return tuple;
}

function validateLiveProviderInventoryRecords(value, request) {
  const retained = productionLegacyDeploymentInventory();
  if (!Array.isArray(value)) {
    throw attestationError(
      "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT",
      "The signed live provider deployment inventory was invalid.",
      {},
      409,
    );
  }
  const retainedKeys = new Map(retained.providerRecordTuples.map((tuple) =>
    [`${tuple[0]}\n${tuple[3]}`, tuple]));
  const tuples = value.map((record) => {
    const tuple = exactSignedProviderRecord(record);
    const key = `${tuple?.[0]}\n${tuple?.[3]}`;
    const frozen = retainedKeys.get(key);
    const isExactRetained = frozen && JSON.stringify(tuple) === JSON.stringify(frozen);
    const exactDynamicCandidate = !frozen && tuple &&
      tuple[0] === request.candidateDeploymentId &&
      tuple[1] === request.candidateCommitSha &&
      tuple[2] === request.candidateCommitSha &&
      tuple[3] === request.candidateImmutableOrigin &&
      tuple[4] === request.candidateDeploymentTarget &&
      tuple[5] === VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH &&
      tuple[6] === "GIT" && tuple[7] === "READY" &&
      tuple[9] === "EXACT_PROVIDER" &&
      Date.parse(tuple[8]) >= Date.parse(retained.capturedAt);
    if (!tuple || (!isExactRetained && !exactDynamicCandidate) ||
        (frozen && !isExactRetained)) {
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
      compare(`${left[0]}\n${left[3]}`, `${right[0]}\n${right[3]}`));
  const keys = tuples.map((tuple) => `${tuple[0]}\n${tuple[3]}`);
  const deploymentIds = tuples.map((tuple) => tuple[0]);
  const origins = tuples.map((tuple) => tuple[3]);
  const candidateRecords = tuples.filter((tuple) =>
    tuple[0] === request.candidateDeploymentId &&
    tuple[3] === request.candidateImmutableOrigin);
  if (!new Set([retained.providerRecordCount,
    retained.providerRecordCount + 1]).has(tuples.length) ||
      new Set(keys).size !== tuples.length ||
      new Set(deploymentIds).size !== tuples.length ||
      new Set(origins).size !== tuples.length ||
      JSON.stringify(tuples) !== JSON.stringify(sorted) ||
      retained.providerRecordTuples.some((tuple) =>
        !keys.includes(`${tuple[0]}\n${tuple[3]}`)) ||
      candidateRecords.length !== 1 ||
      candidateRecords[0][1] !== request.candidateCommitSha ||
      candidateRecords[0][4] !== request.candidateDeploymentTarget ||
      candidateRecords[0][5] !== VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH ||
      candidateRecords[0][7] !== "READY") {
    throw attestationError(
      "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT",
      "The signed live deployment inventory omitted, duplicated, or reordered required scope.",
      {
        expectedMinimumCount: retained.providerRecordCount,
        expectedMaximumCount: retained.providerRecordCount + 1,
        observedCount: tuples.length,
      },
      409,
    );
  }
  const retainedKeySet = new Set(retainedKeys.keys());
  const projected = tuples.map((tuple) =>
    projectedProviderRecord(tuple, request, retainedKeySet));
  return Object.freeze({
    providerTuples: Object.freeze(tuples.map((item) => Object.freeze([...item]))),
    providerCount: tuples.length,
    providerFingerprint: sha256(JSON.stringify(tuples)),
    tuples: Object.freeze(projected),
    count: tuples.length,
    fingerprint: sha256(JSON.stringify(projected)),
  });
}

function deploymentCreatedAt(value) {
  const candidates = [value?.createdAt, value?.created]
    .filter((item) => item !== null && item !== undefined && item !== "")
    .map((item) => typeof item === "number" ? item : Date.parse(clean(item)));
  if (candidates.length === 0 || candidates.some((item) =>
      !Number.isFinite(item)) || new Set(candidates).size !== 1) return "";
  return new Date(candidates[0]).toISOString();
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
  const retainedByKey = new Map(retained.providerRecordTuples.map((tuple) =>
    [`${tuple[0]}\n${tuple[3]}`, tuple]));
  const observedProviderTuples = [];
  for (const value of raw) {
    const id = deploymentId(value);
    const origin = normalizedOrigin(value?.url?.startsWith?.("http")
      ? value.url : `https://${clean(value?.url)}`, { requireVercel: true });
    const key = `${id}\n${origin}`;
    const retainedTuple = retainedByKey.get(key);
    const providerCommitSha = deploymentProviderCommitSha(value);
    const branch = deploymentBranch(value);
    const status = deploymentStatus(value);
    const target = deploymentTarget(value);
    const source = deploymentSource(value);
    const createdAt = deploymentCreatedAt(value);
    let observedProviderTuple;
    if (retainedTuple) {
      observedProviderTuple = [
        id, retainedTuple[1], providerCommitSha, origin, target, branch, source,
        status, createdAt, retainedTuple[9],
      ];
      if (JSON.stringify(observedProviderTuple) !== JSON.stringify(retainedTuple)) {
        observedProviderTuple = null;
      }
    } else {
      const exactCandidate = id === request.candidateDeploymentId &&
        origin === request.candidateImmutableOrigin &&
        providerCommitSha === request.candidateCommitSha &&
        target === request.candidateDeploymentTarget &&
        branch === VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH &&
        source === "GIT" && status === "READY" && createdAt &&
        Date.parse(createdAt) >= Date.parse(retained.capturedAt);
      if (exactCandidate) observedProviderTuple = [
        id, request.candidateCommitSha, providerCommitSha, origin, target, branch,
        source, status, createdAt, "EXACT_PROVIDER",
      ];
    }
    if (!DEPLOYMENT_ID.test(id) || !origin || !observedProviderTuple) {
      throw attestationError(
        "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT",
        "The live Vercel deployment scope differed from the retained scope plus candidate.",
        { deploymentFingerprint: sha256(key) },
        409,
      );
    }
    observedProviderTuples.push(observedProviderTuple);
  }
  observedProviderTuples.sort((left, right) =>
    compare(`${left[0]}\n${left[3]}`, `${right[0]}\n${right[3]}`));
  const live = validateLiveProviderInventoryRecords(observedProviderTuples, request);
  return Object.freeze({
    retainedRecordCount: PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT,
    retainedRecordsFingerprint: PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT,
    providerInventorySchema: retained.schemaVersion,
    retainedProviderRecordCount:
      PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_COUNT,
    retainedProviderRecordsFingerprint:
      PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_FINGERPRINT,
    liveRecordCount: live.count,
    liveRecordsFingerprint: live.fingerprint,
    liveRecords: live.tuples,
    liveProviderRecordCount: live.providerCount,
    liveProviderRecordsFingerprint: live.providerFingerprint,
    liveProviderRecords: live.providerTuples,
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
  const [firewallPayload, firstDeploymentScope, environmentPayload] = await Promise.all([
    readApi(firewallApiPath(request)),
    collectVercelDeploymentScope(readApi, request),
    readApi(environmentApiPath(request)),
  ]);
  // A single cursor walk can miss a deployment created at the head of the
  // project while older pages are being read. Require a second complete pass
  // to match the first exact full-provider census before signing either its
  // ten-field records or the six-field projection.
  const deploymentScope = await collectVercelDeploymentScope(readApi, request);
  if (firstDeploymentScope.liveProviderRecordCount !==
        deploymentScope.liveProviderRecordCount ||
      firstDeploymentScope.liveProviderRecordsFingerprint !==
        deploymentScope.liveProviderRecordsFingerprint ||
      canonicalAttestationJson(firstDeploymentScope.liveProviderRecords) !==
        canonicalAttestationJson(deploymentScope.liveProviderRecords) ||
      firstDeploymentScope.liveRecordCount !== deploymentScope.liveRecordCount ||
      firstDeploymentScope.liveRecordsFingerprint !==
        deploymentScope.liveRecordsFingerprint ||
      canonicalAttestationJson(firstDeploymentScope.liveRecords) !==
        canonicalAttestationJson(deploymentScope.liveRecords) ||
      firstDeploymentScope.pageCount !== deploymentScope.pageCount ||
      firstDeploymentScope.paginationFingerprint !==
        deploymentScope.paginationFingerprint) {
    throw attestationError(
      "STEP11_6_VERCEL_DEPLOYMENT_SCOPE_DRIFT",
      "The two exhaustive live Vercel deployment passes did not match.",
      {},
      409,
    );
  }
  const firewall = normalizeVercelFirewallConfiguration(firewallPayload, request);
  const environmentScope = normalizeVercelEnvironmentScope(environmentPayload, { request });
  const credentialConfinement = productionGoogleCredentialConfinementEvidence();
  if (credentialConfinement.originInventoryFingerprint !==
      PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT ||
      credentialConfinement.originInventoryRecordCount !==
        PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT ||
      credentialConfinement.originInventoryProviderRecordsFingerprint !==
        PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_FINGERPRINT ||
      credentialConfinement.originInventoryProviderRecordCount !==
        PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_COUNT) {
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
    routingRuleAllMethodFenceRequiredHostCount:
      firewall.allMethodFenceRequiredHostCount,
    routingRuleAllMethodFenceRequiredHostsFingerprint:
      firewall.allMethodFenceRequiredHostsFingerprint,
    routingRuleAllMethodFenceRequiredPathCount:
      firewall.allMethodFenceRequiredPathCount,
    routingRuleAllMethodFenceRequiredPathsFingerprint:
      firewall.allMethodFenceRequiredPathsFingerprint,
    retainedOriginInventoryCount: deploymentScope.retainedRecordCount,
    retainedOriginInventoryFingerprint: deploymentScope.retainedRecordsFingerprint,
    liveOriginInventoryCount: deploymentScope.liveRecordCount,
    liveOriginInventoryFingerprint: deploymentScope.liveRecordsFingerprint,
    liveOriginInventoryRecords: deploymentScope.liveRecords,
    providerInventorySchema: deploymentScope.providerInventorySchema,
    retainedProviderInventoryCount: deploymentScope.retainedProviderRecordCount,
    retainedProviderInventoryFingerprint:
      deploymentScope.retainedProviderRecordsFingerprint,
    liveProviderInventoryCount: deploymentScope.liveProviderRecordCount,
    liveProviderInventoryFingerprint: deploymentScope.liveProviderRecordsFingerprint,
    liveProviderInventoryRecords: deploymentScope.liveProviderRecords,
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
  "routingRuleAllMethodFenceRequiredHostCount",
  "routingRuleAllMethodFenceRequiredHostsFingerprint",
  "routingRuleAllMethodFenceRequiredPathCount",
  "routingRuleAllMethodFenceRequiredPathsFingerprint",
  "retainedOriginInventoryCount", "retainedOriginInventoryFingerprint",
  "liveOriginInventoryCount", "liveOriginInventoryFingerprint",
  "liveOriginInventoryRecords",
  "providerInventorySchema", "retainedProviderInventoryCount",
  "retainedProviderInventoryFingerprint", "liveProviderInventoryCount",
  "liveProviderInventoryFingerprint", "liveProviderInventoryRecords",
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
  const liveInventory = validateLiveProviderInventoryRecords(
    claim.liveProviderInventoryRecords, request,
  );
  const allMethodFence = productionGoogleWriterAllMethodFenceHosts();
  const allMethodPaths = productionGoogleWriterAllMethodFencePaths();
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
      claim.routingRuleAllMethodFenceRequiredHostCount !== allMethodFence.count ||
      claim.routingRuleAllMethodFenceRequiredHostsFingerprint !==
        allMethodFence.fingerprint ||
      claim.routingRuleAllMethodFenceRequiredPathCount !== allMethodPaths.count ||
      claim.routingRuleAllMethodFenceRequiredPathsFingerprint !==
        allMethodPaths.fingerprint ||
      claim.retainedOriginInventoryCount !== PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_COUNT ||
      claim.retainedOriginInventoryFingerprint !==
        PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_FINGERPRINT ||
      claim.liveOriginInventoryCount !== liveInventory.count ||
      claim.liveOriginInventoryFingerprint !== liveInventory.fingerprint ||
      canonicalAttestationJson(claim.liveOriginInventoryRecords) !==
        canonicalAttestationJson(liveInventory.tuples) ||
      claim.providerInventorySchema !==
        productionLegacyDeploymentInventory().schemaVersion ||
      claim.retainedProviderInventoryCount !==
        PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_COUNT ||
      claim.retainedProviderInventoryFingerprint !==
        PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_FINGERPRINT ||
      claim.liveProviderInventoryCount !== liveInventory.providerCount ||
      claim.liveProviderInventoryFingerprint !== liveInventory.providerFingerprint ||
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
    purpose: claim.purpose,
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
    routingRuleAllMethodFenceRequiredHostCount:
      claim.routingRuleAllMethodFenceRequiredHostCount,
    routingRuleAllMethodFenceRequiredHostsFingerprint:
      claim.routingRuleAllMethodFenceRequiredHostsFingerprint,
    routingRuleAllMethodFenceRequiredPathCount:
      claim.routingRuleAllMethodFenceRequiredPathCount,
    routingRuleAllMethodFenceRequiredPathsFingerprint:
      claim.routingRuleAllMethodFenceRequiredPathsFingerprint,
    providerInventorySchema: claim.providerInventorySchema,
    retainedProviderInventoryCount: claim.retainedProviderInventoryCount,
    retainedProviderInventoryFingerprint: claim.retainedProviderInventoryFingerprint,
    liveProviderInventoryCount: claim.liveProviderInventoryCount,
    liveProviderInventoryFingerprint: claim.liveProviderInventoryFingerprint,
    retainedOriginInventoryCount: claim.retainedOriginInventoryCount,
    retainedOriginInventoryFingerprint: claim.retainedOriginInventoryFingerprint,
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
