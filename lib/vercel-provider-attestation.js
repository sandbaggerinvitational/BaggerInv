import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign as signDetached,
  verify as verifyDetached,
} from "node:crypto";
import { types as nodeTypes } from "node:util";

import { PRODUCTION_VERCEL_PROJECT_ID } from
  "./google-service-account-credential-context.js";
import { PRODUCTION_CANONICAL_HOSTNAME } from "./production-shadow-candidate.js";
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
  PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_SCHEMA,
  PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_COUNT,
  PRODUCTION_LEGACY_DEPLOYMENT_PROVIDER_INVENTORY_FINGERPRINT,
} from "./production-google-writer-fence-quiesce.js";
import {
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_SAFE_METHODS,
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_PATH_REGEX,
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_ROUTES_FINGERPRINT,
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_COMPLEMENT_GROUP_COUNT,
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_METHOD,
  PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH,
  buildProductionGoogleWriterCriticalWindowVercelRuleInsert,
  productionGoogleWriterCriticalWindowProviderRuleContract,
  productionGoogleWriterCriticalWindowWafContract,
} from "./production-google-writer-critical-window-waf.js";
import {
  buildVercelEnvironmentResourceReview,
  validVercelEnvironmentResourceReview,
} from "./vercel-environment-resource-review.js";

export const VERCEL_PROVIDER_ATTESTATION_REQUEST_SCHEMA =
  "bagger-vercel-provider-attestation-request-v1";
export const VERCEL_PROVIDER_ATTESTATION_SCHEMA =
  "bagger-vercel-provider-attestation-noncanonical-host-v2";
export const VERCEL_PROVIDER_ATTESTATION_ENVELOPE_SCHEMA =
  "bagger-vercel-provider-attestation-envelope-v2";
export const VERCEL_PROVIDER_ATTESTATION_SIGNER_KEY_VERSION =
  "STEP11_6_VERCEL_ATTESTER_V1";
export const VERCEL_PROVIDER_ATTESTATION_ALGORITHM = "Ed25519";
export const VERCEL_PROVIDER_ATTESTATION_VALIDITY_SECONDS = 2_100;
export const VERCEL_PROVIDER_ATTESTATION_INITIAL_MAX_AGE_SECONDS = 120;
export const VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV =
  "PRODUCTION_VERCEL_PROVIDER_ATTESTATION_ED25519_PUBLIC_KEY";
export const VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV =
  "PRODUCTION_VERCEL_PROVIDER_ATTESTATION_TEAM_ID";
export const VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH =
  "feature/mock-tournament-qa-integration";
export const VERCEL_PROVIDER_ALIAS_INVENTORY_RECORD_COUNT = 56;
export const VERCEL_PROVIDER_UNSAFE_COURSE_ALIAS_HOSTNAME =
  "bagger-inv-git-agent-course-hole-be25e6-sandbagger-invitational.vercel.app";
export const VERCEL_PROVIDER_UNSAFE_COURSE_ALIAS_DEPLOYMENT_ID =
  "dpl_73dJVxZVEXkUqrinj17RHVFcjP7j";
export const VERCEL_PROVIDER_UNSAFE_COURSE_ALIAS_DEPLOYMENT_HOSTNAME =
  "bagger-kj3c0pkvm-sandbagger-invitational.vercel.app";
export const VERCEL_PROVIDER_CANONICAL_APEX_HOSTNAME = "baggerinv.com";
export const VERCEL_PROVIDER_CANONICAL_WWW_HOSTNAME = "www.baggerinv.com";
export const VERCEL_PROVIDER_CANONICAL_DIRECT_HOSTNAME = "bagger-inv.vercel.app";
export const VERCEL_PROVIDER_MAIN_BRANCH_ALIAS_HOSTNAME =
  "bagger-inv-git-main-sandbagger-invitational.vercel.app";
export const VERCEL_PROVIDER_BASELINE_PRODUCTION_DEPLOYMENT_ID =
  "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2";
export const VERCEL_PROVIDER_BASELINE_PRODUCTION_DEPLOYMENT_HOSTNAME =
  "bagger-drmix94o0-sandbagger-invitational.vercel.app";
export const VERCEL_WAF_PROVIDER_CONFIGURATION_SCHEMA =
  "bagger-vercel-waf-provider-configuration-v1";
export const VERCEL_WAF_PROVIDER_EVIDENCE_REQUEST_SCHEMA =
  "bagger-vercel-waf-provider-evidence-request-v1";
export const VERCEL_WAF_PROVIDER_EVIDENCE_SCHEMA =
  "bagger-vercel-waf-provider-evidence-v1";
export const VERCEL_WAF_PROVIDER_EVIDENCE_ENVELOPE_SCHEMA =
  "bagger-vercel-waf-provider-evidence-envelope-v1";
export const VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_REQUEST_SCHEMA =
  "bagger-vercel-waf-rule-insert-dispatch-result-request-v2";
export const VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_SCHEMA =
  "bagger-vercel-waf-rule-insert-dispatch-result-v3";
export const VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_ENVELOPE_SCHEMA =
  "bagger-vercel-waf-rule-insert-dispatch-result-envelope-v3";
export const VERCEL_WAF_PROVIDER_EVIDENCE_STAGES = Object.freeze([
  "BASELINE_CAPTURE",
  "CRITICAL_ACTIVE",
  "CRITICAL_REATTEST",
  "BASELINE_RESTORED",
]);

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
      candidateDeploymentTarget !== "PREVIEW" ||
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
  const direct = clean(action).toUpperCase();
  if (["DENY", "BYPASS"].includes(direct)) return direct;
  if (!plain(action)) return "";
  const nested = clean(action.type || action.action).toUpperCase();
  if (["DENY", "BYPASS"].includes(nested)) return nested;
  if (plain(action.mitigate) &&
      ["DENY", "BYPASS"].includes(
        clean(action.mitigate.action).toUpperCase(),
      )) return clean(action.mitigate.action).toUpperCase();
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
  const listNormalizer = new Set(["method", "requestmethod"]).has(
    conditionType(condition.type),
  ) ? (item) => clean(item).toUpperCase() : (item) => clean(item).toLowerCase();
  const expected = Array.isArray(value)
    ? [...new Set(value.map(listNormalizer))].sort(compare) : value;
  const actual = Array.isArray(condition.value)
    ? [...new Set(condition.value.map(listNormalizer))].sort(compare)
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

function exactScalarCondition(condition, { types, value }) {
  if (!plain(condition) || !types.map(conditionType).includes(
    conditionType(condition.type),
  )) return false;
  const operation = clean(condition.op || condition.operator)
    .replace(/[-_]/g, "").toLowerCase();
  return condition.neg !== true && condition.negate !== true &&
    ["eq", "equals", "is"].includes(operation) &&
    clean(condition.value).toLowerCase() === clean(value).toLowerCase();
}

function exactRegexCondition(condition, { types, value }) {
  if (!plain(condition) || !types.map(conditionType).includes(
    conditionType(condition.type),
  )) return false;
  const operation = clean(condition.op || condition.operator)
    .replace(/[-_]/g, "").toLowerCase();
  return condition.neg !== true && condition.negate !== true &&
    ["re", "regex", "matchesexpression"].includes(operation) &&
    clean(condition.value) === value;
}

const VERCEL_WAF_CONFIGURATION_KEYS = Object.freeze([
  "changes", "crs", "firewallEnabled", "id", "ips", "ownerId",
  "projectKey", "rules", "updatedAt", "version",
]);
const VERCEL_WAF_SECURITY_KEYS = Object.freeze([
  "firewallEnabled", "rules", "ips", "crs",
]);
const VERCEL_WAF_SECURITY_KEYS_FINGERPRINT = sha256(canonicalAttestationJson(
  VERCEL_WAF_SECURITY_KEYS,
));

function normalizeVercelWafConfigurationDocument(value, { draft = false } = {}) {
  const exactActiveShape = exactKeys(value, VERCEL_WAF_CONFIGURATION_KEYS);
  const exactDraftShape = draft && exactKeys(
    value,
    VERCEL_WAF_CONFIGURATION_KEYS.filter((key) => key !== "version"),
  );
  if (!(exactActiveShape || exactDraftShape) ||
      value.firewallEnabled !== true || !Array.isArray(value.rules) ||
      !Array.isArray(value.ips) || !Array.isArray(value.crs) ||
      !Array.isArray(value.changes) || typeof value.projectKey !== "string" ||
      typeof value.updatedAt !== "string" ||
      !SAFE_PROVIDER_ID.test(clean(value.id)) ||
      !SAFE_PROVIDER_ID.test(clean(value.ownerId))) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_CONFIGURATION_SCHEMA_INVALID",
      "The Vercel WAF configuration did not match the reviewed full schema.",
      {},
      409,
    );
  }
  const providerVersion = own(value, "version") ? clean(value.version) : null;
  const configurationVersion = draft ? "DRAFT" : providerVersion;
  if (!SAFE_CONFIG_VERSION.test(configurationVersion) || draft &&
      !(providerVersion === null || providerVersion.toLowerCase() === "draft")) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_CONFIGURATION_SCHEMA_INVALID",
      "The Vercel WAF configuration version was invalid.", {}, 409,
    );
  }
  // Canonical round-tripping rejects accessors, non-JSON values, and other
  // representations that cannot be bound into signed provider evidence.
  const ips = JSON.parse(canonicalAttestationJson(value.ips));
  const crs = JSON.parse(canonicalAttestationJson(value.crs));
  return Object.freeze({
    configurationVersion,
    providerConfigurationId: clean(value.id),
    providerOwnerId: clean(value.ownerId),
    firewallEnabled: true,
    rules: value.rules,
    ips: Object.freeze(ips),
    crs: Object.freeze(crs),
    securityConfigurationKeys: VERCEL_WAF_SECURITY_KEYS,
    securityConfigurationKeysFingerprint:
      VERCEL_WAF_SECURITY_KEYS_FINGERPRINT,
  });
}

function wafSemanticConfiguration(document, orderedCustomRules) {
  return Object.freeze({
    schemaVersion: VERCEL_WAF_PROVIDER_CONFIGURATION_SCHEMA,
    securityConfigurationKeys: document.securityConfigurationKeys,
    securityConfigurationKeysFingerprint:
      document.securityConfigurationKeysFingerprint,
    firewallEnabled: document.firewallEnabled,
    ips: document.ips,
    crs: document.crs,
    orderedCustomRules: Object.freeze(orderedCustomRules),
  });
}

function validWafSemanticConfiguration(value) {
  return exactKeys(value, [
    "schemaVersion", "securityConfigurationKeys",
    "securityConfigurationKeysFingerprint", "firewallEnabled", "ips", "crs",
    "orderedCustomRules",
  ]) && value.schemaVersion === VERCEL_WAF_PROVIDER_CONFIGURATION_SCHEMA &&
    canonicalAttestationJson(value.securityConfigurationKeys) ===
      canonicalAttestationJson(VERCEL_WAF_SECURITY_KEYS) &&
    value.securityConfigurationKeysFingerprint ===
      VERCEL_WAF_SECURITY_KEYS_FINGERPRINT && value.firewallEnabled === true &&
    Array.isArray(value.ips) && Array.isArray(value.crs) &&
    Array.isArray(value.orderedCustomRules);
}

function baselineSemanticFingerprintFrom(value) {
  return validWafSemanticConfiguration(value)
    ? sha256(canonicalAttestationJson({ ...value, orderedCustomRules: [] })) : "";
}

export function normalizeVercelFirewallConfiguration(payload, expected) {
  if (!plain(payload) || !own(payload, "active") || !own(payload, "draft") ||
      !own(payload, "versions") || !own(payload, "activeVersion")) {
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
  const draftIsAbsent = payload.draft === null;
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
  const exactVersion = plain(payload.activeVersion) ? payload.activeVersion : null;
  const activeDocument = normalizeVercelWafConfigurationDocument(config);
  const exactVersionDocument = exactVersion
    ? normalizeVercelWafConfigurationDocument(exactVersion) : null;
  const configurationVersion = activeDocument.configurationVersion;
  const etag = null;
  const rules = activeDocument.rules;
  if (projectId !== expected.projectId || teamId !== expected.teamId ||
      !SAFE_CONFIG_VERSION.test(configurationVersion) ||
      configurationVersion !== expected.routingRuleConfigVersion || !exactVersion ||
      !Array.isArray(payload.versions)) {
    throw attestationError(
      "STEP11_6_VERCEL_FIREWALL_RESPONSE_INVALID",
      "The Vercel firewall response did not bind the exact project/team/version.",
      {},
      503,
    );
  }
  if (exactVersionDocument.configurationVersion !== configurationVersion ||
      exactVersionDocument.providerConfigurationId !==
        activeDocument.providerConfigurationId ||
      exactVersionDocument.providerOwnerId !== activeDocument.providerOwnerId ||
      canonicalAttestationJson({
        firewallEnabled: exactVersionDocument.firewallEnabled,
        rules: exactVersionDocument.rules,
        ips: exactVersionDocument.ips,
        crs: exactVersionDocument.crs,
      }) !== canonicalAttestationJson({
        firewallEnabled: activeDocument.firewallEnabled,
        rules: activeDocument.rules,
        ips: activeDocument.ips,
        crs: activeDocument.crs,
      })) {
    throw attestationError(
      "STEP11_6_VERCEL_FIREWALL_ACTIVE_VERSION_UNLINKED",
      "The active firewall response was not linked to one exact provider ruleset version.",
      {},
      409,
    );
  }
  const expectedRoutingRuleName = clean(expected.routingRuleName);
  const matches = rules.filter((rule) =>
    clean(rule?.id) === expected.routingRuleId &&
    (!expectedRoutingRuleName || clean(rule?.name) === expectedRoutingRuleName));
  if (matches.length !== 1) {
    throw attestationError(
      "STEP11_6_VERCEL_FIREWALL_RULE_INVALID",
      "The exact Vercel writer-quiesce rule was not uniquely active.",
      {},
      409,
    );
  }
  const rule = matches[0];
  const ruleIndex = rules.indexOf(rule);
  const earlierActiveBypassRuleCount = rules.slice(0, ruleIndex).filter((item) =>
    item?.active === true && normalizedFirewallAction(item.action) === "BYPASS").length;
  const conditionGroups = firewallConditionGroups(rule);
  const allMethodFence = productionGoogleWriterAllMethodFenceHosts();
  const allMethodPaths = productionGoogleWriterAllMethodFencePaths();
  const criticalWindow = productionGoogleWriterCriticalWindowWafContract(expected);
  const candidateControlHostnames = criticalWindow.candidateControlHosts.hostnames;
  const hostTypes = new Set(["host", "hostname", "requesthost", "requesthostname"]);
  const pathTypes = new Set(["path", "requestpath"]);
  const methodTypes = new Set(["method", "requestmethod"]);
  const noncandidateHostGroups = conditionGroups?.filter((conditions) =>
    conditions.length === 2 && conditions.every((condition) =>
      hostTypes.has(conditionType(condition?.type))) && conditions.some((condition) =>
      exclusionCondition(condition, {
        type: condition.type,
        value: PRODUCTION_CANONICAL_HOSTNAME,
      })) && conditions.some((condition) => exclusionCondition(condition, {
      type: condition.type,
      value: candidateControlHostnames,
    }))) || [];
  const candidateWrongPathGroups = conditionGroups?.filter((conditions) =>
    conditions.length === 2 && conditions.some((condition) =>
      hostTypes.has(conditionType(condition?.type)) && inclusionCondition(condition, {
        types: ["host", "hostname", "request-host", "request-hostname"],
        values: candidateControlHostnames,
      })) && conditions.some((condition) =>
      pathTypes.has(conditionType(condition?.type)) && exclusionCondition(condition, {
        type: condition.type,
        value: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH,
      }))) || [];
  const candidateWrongMethodGroups = conditionGroups?.filter((conditions) =>
    conditions.length === 2 && conditions.some((condition) =>
      hostTypes.has(conditionType(condition?.type)) && inclusionCondition(condition, {
        types: ["host", "hostname", "request-host", "request-hostname"],
        values: candidateControlHostnames,
      })) && conditions.some((condition) =>
      methodTypes.has(conditionType(condition?.type)) && exclusionCondition(condition, {
        type: condition.type,
        value: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_METHOD,
      }))) || [];
  const apexNonSafeMethodGroups = conditionGroups?.filter((conditions) =>
    conditions.length === 2 && conditions.some((condition) =>
      exactScalarCondition(condition, {
        types: ["host", "hostname", "request-host", "request-hostname"],
        value: PRODUCTION_CANONICAL_HOSTNAME,
      })) && conditions.some((condition) =>
      methodTypes.has(conditionType(condition?.type)) && exclusionCondition(condition, {
        type: condition.type,
        value: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_SAFE_METHODS,
      }))) || [];
  const apexSafeMethodWriterPathGroups = conditionGroups?.filter((conditions) =>
    conditions.length === 2 && conditions.some((condition) =>
      exactScalarCondition(condition, {
        types: ["host", "hostname", "request-host", "request-hostname"],
        value: PRODUCTION_CANONICAL_HOSTNAME,
      })) && conditions.some((condition) =>
      exactRegexCondition(condition, {
        types: ["path", "request-path"],
        value: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_PATH_REGEX,
      }))) || [];
  if (PRODUCTION_GOOGLE_WRITER_QUIESCE_CONTROL_PATH !==
        PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH ||
      rule.active !== true || normalizedFirewallAction(rule.action) !== "DENY" ||
      conditionGroups?.length !== 5 || noncandidateHostGroups.length !== 1 ||
      candidateWrongPathGroups.length !== 1 ||
      candidateWrongMethodGroups.length !== 1 ||
      apexNonSafeMethodGroups.length !== 1 ||
      apexSafeMethodWriterPathGroups.length !== 1 ||
      rules.length !== 1 || ruleIndex !== 0 || earlierActiveBypassRuleCount !== 0) {
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
    ruleName: expectedRoutingRuleName || clean(rule.name) || expected.routingRuleId,
    configurationVersion,
    etag,
    providerConfigurationId: activeDocument.providerConfigurationId,
    providerOwnerId: activeDocument.providerOwnerId,
    scope: PRODUCTION_GOOGLE_WRITER_QUIESCE_SCOPE,
    projectWide: true,
    firewallEnabled: true,
    action: "DENY",
    hostnameOperator: "DOES_NOT_EQUAL",
    canonicalHostname: PRODUCTION_CANONICAL_HOSTNAME,
    criticalWindowComplementConditionGroupCount:
      PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_COMPLEMENT_GROUP_COUNT,
    candidateControlHostCount: criticalWindow.candidateControlHosts.hostCount,
    candidateControlHostsFingerprint:
      criticalWindow.candidateControlHosts.hostsFingerprint,
    canonicalApexSafeMethodCount:
      PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_SAFE_METHODS.length,
    canonicalApexSafeMethodsFingerprint:
      criticalWindow.canonicalApexContainment.allowedSafeMethodsFingerprint,
    canonicalApexSafeMethodWriterRouteCount:
      criticalWindow.canonicalApexContainment
        .exhaustiveHistoricalSafeMethodWriterRouteCount,
    canonicalApexSafeMethodWriterRoutesFingerprint:
      PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_ROUTES_FINGERPRINT,
    canonicalApexSafeMethodWriterPathRegex:
      PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_PATH_REGEX,
    globalInvocationQuiescenceProved: true,
    requestPathOperator: "EQUALS_FOR_ONLY_EXCEPTION",
    requestPath: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH,
    methodOperator: "EQUALS_FOR_ONLY_EXCEPTION",
    methods: Object.freeze([PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_METHOD]),
    pendingDraftChangeCount: 0,
    earlierActiveBypassRuleCount,
    allMethodFenceRequiredHostCount: allMethodFence.count,
    allMethodFenceRequiredHostsFingerprint: allMethodFence.fingerprint,
    allMethodFenceRequiredPathCount: allMethodPaths.count,
    allMethodFenceRequiredPathsFingerprint: allMethodPaths.fingerprint,
  });
  const providerRule = productionGoogleWriterCriticalWindowProviderRuleContract({
    ...expected,
    runOwnedRuleName:
      expectedRoutingRuleName || clean(rule.name) || expected.routingRuleId,
  });
  const normalizedProviderRule = Object.freeze({
    ...providerRule,
    providerRuleDocumentFingerprint: sha256(canonicalAttestationJson(rule)),
  });
  const semanticConfiguration = wafSemanticConfiguration(
    activeDocument,
    [normalizedProviderRule],
  );
  const configurationFingerprint = sha256(
    canonicalAttestationJson(semanticConfiguration),
  );
  const configurationIdentityFingerprint = sha256(canonicalAttestationJson({
    projectId: expected.projectId,
    teamId: expected.teamId,
    configurationVersion,
    etag,
    providerConfigurationId: activeDocument.providerConfigurationId,
    providerOwnerId: activeDocument.providerOwnerId,
  }));
  return Object.freeze({
    ...normalizedRule,
    configurationFingerprint,
    configurationIdentityFingerprint,
    semanticConfiguration,
    orderedCustomRulesFingerprint: sha256(canonicalAttestationJson(
      semanticConfiguration.orderedCustomRules,
    )),
    runOwnedRuleFingerprint: normalizedProviderRule.ruleFingerprint,
  });
}

function baselineWafSemanticConfiguration(document) {
  return wafSemanticConfiguration(document, []);
}

function baselineWafSemanticFingerprint(document) {
  return sha256(canonicalAttestationJson(
    baselineWafSemanticConfiguration(document),
  ));
}

export function normalizeVercelWafProviderConfiguration(payload, expected = {}) {
  const stage = clean(expected.stage).toUpperCase();
  if (!VERCEL_WAF_PROVIDER_EVIDENCE_STAGES.includes(stage)) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_EVIDENCE_STAGE_INVALID",
      "The WAF provider evidence stage was invalid.",
      {},
      400,
    );
  }
  const expectedBaselineFingerprint = clean(
    expected.baselineSemanticFingerprint,
  ).toLowerCase();
  const baselineStage = stage === "BASELINE_CAPTURE" ||
    stage === "BASELINE_RESTORED";
  if (stage === "BASELINE_CAPTURE" && expectedBaselineFingerprint ||
      stage !== "BASELINE_CAPTURE" && !HEX64.test(expectedBaselineFingerprint)) {
    throw attestationError("STEP11_6_VERCEL_WAF_BASELINE_BINDING_INVALID",
      "The WAF evidence did not bind the exact captured baseline semantics.", {}, 409);
  }
  if (!plain(payload) || !plain(payload.active) || payload.draft !== null ||
      !Array.isArray(payload.versions) || !plain(payload.activeVersion)) {
    throw attestationError(
      payload?.draft === null
        ? "STEP11_6_VERCEL_FIREWALL_RESPONSE_INVALID"
        : "STEP11_6_VERCEL_FIREWALL_DRAFT_PENDING",
      "The WAF evidence required one active provider configuration and no draft.",
      {},
      409,
    );
  }
  const config = payload.active;
  const projectId = clean(config.projectId || payload.projectId || expected.projectId);
  const teamId = clean(config.teamId || payload.teamId || expected.teamId);
  const activeDocument = normalizeVercelWafConfigurationDocument(config);
  const exactVersionDocument = normalizeVercelWafConfigurationDocument(
    payload.activeVersion,
  );
  const configurationVersion = activeDocument.configurationVersion;
  const etag = null;
  const expectedVersion = clean(
    expected.configurationVersion || expected.routingRuleConfigVersion,
  );
  const rules = activeDocument.rules;
  if (projectId !== clean(expected.projectId) || teamId !== clean(expected.teamId) ||
      !SAFE_CONFIG_VERSION.test(configurationVersion) ||
      (expectedVersion && configurationVersion !== expectedVersion) ||
      exactVersionDocument.configurationVersion !== configurationVersion ||
      exactVersionDocument.providerConfigurationId !==
        activeDocument.providerConfigurationId ||
      exactVersionDocument.providerOwnerId !== activeDocument.providerOwnerId ||
      canonicalAttestationJson({
        firewallEnabled: exactVersionDocument.firewallEnabled,
        rules: exactVersionDocument.rules,
        ips: exactVersionDocument.ips,
        crs: exactVersionDocument.crs,
      }) !== canonicalAttestationJson({
        firewallEnabled: activeDocument.firewallEnabled,
        rules: activeDocument.rules,
        ips: activeDocument.ips,
        crs: activeDocument.crs,
      }) ||
      (etag !== null && etag.length > 512)) {
    throw attestationError(
      "STEP11_6_VERCEL_FIREWALL_ACTIVE_VERSION_UNLINKED",
      "The WAF evidence did not bind one exact active provider ruleset version.",
      {},
      409,
    );
  }
  let semanticConfiguration;
  const baselineSemanticConfiguration =
    baselineWafSemanticConfiguration(activeDocument);
  const baselineFingerprint = sha256(canonicalAttestationJson(
    baselineSemanticConfiguration,
  ));
  if (stage !== "BASELINE_CAPTURE" &&
      expectedBaselineFingerprint !== baselineFingerprint) {
    throw attestationError("STEP11_6_VERCEL_WAF_BASELINE_BINDING_INVALID",
      "The full security configuration drifted from the captured baseline.", {}, 409);
  }
  const runOwnedRuleName = clean(expected.runOwnedRuleName);
  const expectedRule = productionGoogleWriterCriticalWindowProviderRuleContract({
    ...expected,
    runOwnedRuleName,
  });
  let providerAssignedRuleId = null;
  let runOwnedRuleFingerprint = expectedRule.ruleFingerprint;
  let runOwnedProviderRuleDocumentFingerprint = null;
  let criticalWindowContractFingerprint = null;
  if (baselineStage) {
    if (rules.length !== 0) {
      throw attestationError(
        "STEP11_6_VERCEL_WAF_BASELINE_INVALID",
        "The baseline WAF configuration must have zero ordered custom rules.",
        {},
        409,
      );
    }
    semanticConfiguration = baselineSemanticConfiguration;
  } else {
    if (rules.length !== 1 || clean(rules[0]?.id) !==
        clean(expected.providerAssignedRuleId) ||
        clean(rules[0]?.name) !== runOwnedRuleName) {
      throw attestationError(
        "STEP11_6_VERCEL_FIREWALL_RULE_INVALID",
        "The critical WAF must contain exactly one top-precedence run-owned rule.",
        {},
        409,
      );
    }
    const normalized = normalizeVercelFirewallConfiguration(payload, {
      projectId,
      teamId,
      routingRuleId: clean(expected.providerAssignedRuleId),
      routingRuleName: runOwnedRuleName,
      routingRuleConfigVersion: configurationVersion,
      candidateAliasOrigin: expected.candidateAliasOrigin,
      candidateImmutableOrigin: expected.candidateImmutableOrigin,
    });
    semanticConfiguration = normalized.semanticConfiguration;
    providerAssignedRuleId = clean(expected.providerAssignedRuleId);
    runOwnedRuleFingerprint = normalized.runOwnedRuleFingerprint;
    runOwnedProviderRuleDocumentFingerprint =
      semanticConfiguration.orderedCustomRules[0]
        .providerRuleDocumentFingerprint;
    criticalWindowContractFingerprint =
      semanticConfiguration.orderedCustomRules[0]
        .criticalWindowContractFingerprint;
  }
  const selectedSemanticFingerprint = sha256(
    canonicalAttestationJson(semanticConfiguration),
  );
  const expectedCriticalFingerprint = clean(
    expected.criticalSemanticFingerprint,
  ).toLowerCase();
  if (stage === "CRITICAL_REATTEST" &&
        (!HEX64.test(expectedCriticalFingerprint) ||
          selectedSemanticFingerprint !== expectedCriticalFingerprint) ||
      stage === "BASELINE_RESTORED" &&
        selectedSemanticFingerprint !== expectedBaselineFingerprint) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_TRANSITION_BINDING_INVALID",
      "The provider WAF state did not match the bound transition fingerprint.",
      {},
      409,
    );
  }
  return Object.freeze({
    stage,
    mode: baselineStage ? "BASELINE" : "CRITICAL_WINDOW",
    projectId,
    teamId,
    configurationVersion,
    etag,
    providerConfigurationId: activeDocument.providerConfigurationId,
    providerOwnerId: activeDocument.providerOwnerId,
    configurationIdentityFingerprint: sha256(canonicalAttestationJson({
      projectId,
      teamId,
      configurationVersion,
      etag,
      providerConfigurationId: activeDocument.providerConfigurationId,
      providerOwnerId: activeDocument.providerOwnerId,
    })),
    sourceVersionReadFingerprint: sha256(canonicalAttestationJson({
      schemaVersion: "bagger-vercel-waf-source-version-semantic-read-v1",
      projectId,
      teamId,
      configurationVersion,
      providerConfigurationId: activeDocument.providerConfigurationId,
      providerOwnerId: activeDocument.providerOwnerId,
      firewallEnabled: true,
      semanticConfiguration,
    })),
    semanticConfiguration,
    semanticConfigurationFingerprint: selectedSemanticFingerprint,
    orderedCustomRulesFingerprint: sha256(canonicalAttestationJson(
      semanticConfiguration.orderedCustomRules,
    )),
    baselineSemanticFingerprint: baselineFingerprint,
    criticalSemanticFingerprint: baselineStage
      ? expectedCriticalFingerprint || null : selectedSemanticFingerprint,
    customRuleCount: semanticConfiguration.orderedCustomRules.length,
    runOwnedRuleName,
    providerAssignedRuleId,
    runOwnedRuleFingerprint,
    runOwnedProviderRuleDocumentFingerprint,
    runOwnedRulePrecedence: providerAssignedRuleId === null ? null : 0,
    criticalWindowContractFingerprint,
    pendingDraftChangeCount: 0,
  });
}

const WAF_PROVIDER_EVIDENCE_REQUEST_KEYS = Object.freeze([
  "schemaVersion", "evidenceRequestId", "wafEpochId", "transitionRequestId",
  "stage", "purpose", "transitionMode", "projectId", "teamId", "candidateAliasOrigin",
  "candidateImmutableOrigin", "candidateDeploymentId", "candidateCommitSha",
  "candidateDeploymentTarget", "runOwnedRuleName", "runOwnedRuleNonce",
  "runOwnedRuleFingerprint", "runOwnedInsertDocumentFingerprint",
  "providerAssignedRuleId",
  "baselineEvidenceId",
  "criticalEvidenceId", "baselineSemanticFingerprint",
  "criticalSemanticFingerprint", "baselineConfigurationVersion",
  "baselineSourceVersionReadFingerprint", "expectedConfigurationVersion",
]);

export function normalizeVercelWafProviderEvidenceRequest(value) {
  if (!exactKeys(value, WAF_PROVIDER_EVIDENCE_REQUEST_KEYS)) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_EVIDENCE_REQUEST_INVALID",
      "The WAF provider evidence request was not exact.",
      {},
      400,
    );
  }
  const stage = clean(value.stage).toUpperCase();
  const purpose = clean(value.purpose).toUpperCase();
  const transitionMode = clean(value.transitionMode).toUpperCase();
  const projectId = clean(value.projectId);
  const teamId = clean(value.teamId);
  const candidateAliasOrigin = normalizedOrigin(value.candidateAliasOrigin, {
    requireVercel: true,
  });
  const candidateImmutableOrigin = normalizedOrigin(
    value.candidateImmutableOrigin,
    { requireVercel: true },
  );
  const candidateDeploymentId = clean(value.candidateDeploymentId);
  const candidateCommitSha = clean(value.candidateCommitSha).toLowerCase();
  const candidateDeploymentTarget = clean(
    value.candidateDeploymentTarget,
  ).toUpperCase();
  const runOwnedRuleName = clean(value.runOwnedRuleName);
  const runOwnedRuleNonce = clean(value.runOwnedRuleNonce).toLowerCase();
  const runOwnedRuleFingerprint = clean(value.runOwnedRuleFingerprint).toLowerCase();
  const runOwnedInsertDocumentFingerprint = clean(
    value.runOwnedInsertDocumentFingerprint,
  ).toLowerCase();
  const providerAssignedRuleId = value.providerAssignedRuleId === null
    ? null : clean(value.providerAssignedRuleId);
  const evidenceRequestId = exactUuid(
    value.evidenceRequestId,
    "evidenceRequestId",
  );
  const wafEpochId = exactUuid(value.wafEpochId, "wafEpochId");
  const transitionRequestId = exactUuid(
    value.transitionRequestId,
    "transitionRequestId",
  );
  const baselineEvidenceId = value.baselineEvidenceId === null ? null :
    exactUuid(value.baselineEvidenceId, "baselineEvidenceId");
  const criticalEvidenceId = value.criticalEvidenceId === null ? null :
    exactUuid(value.criticalEvidenceId, "criticalEvidenceId");
  const baselineSemanticFingerprint = value.baselineSemanticFingerprint === null
    ? null : clean(value.baselineSemanticFingerprint).toLowerCase();
  const criticalSemanticFingerprint = value.criticalSemanticFingerprint === null
    ? null : clean(value.criticalSemanticFingerprint).toLowerCase();
  const expectedConfigurationVersion = value.expectedConfigurationVersion === null
    ? null : clean(value.expectedConfigurationVersion);
  const baselineConfigurationVersion = value.baselineConfigurationVersion === null
    ? null : clean(value.baselineConfigurationVersion);
  const baselineSourceVersionReadFingerprint =
    value.baselineSourceVersionReadFingerprint === null ? null :
      clean(value.baselineSourceVersionReadFingerprint).toLowerCase();
  const baselineBound = baselineEvidenceId !== null &&
    HEX64.test(baselineSemanticFingerprint || "");
  const criticalBound = criticalEvidenceId !== null &&
    HEX64.test(criticalSemanticFingerprint || "");
  const stageBindingValid = stage === "BASELINE_CAPTURE"
    ? baselineEvidenceId === null && criticalEvidenceId === null &&
      baselineSemanticFingerprint === null && criticalSemanticFingerprint === null &&
      baselineConfigurationVersion === null &&
      baselineSourceVersionReadFingerprint === null && providerAssignedRuleId === null
    : stage === "CRITICAL_ACTIVE"
      ? baselineBound && criticalEvidenceId === null &&
        criticalSemanticFingerprint === null &&
        SAFE_CONFIG_VERSION.test(baselineConfigurationVersion) &&
        HEX64.test(baselineSourceVersionReadFingerprint || "") &&
        providerAssignedRuleId !== null
      : stage === "CRITICAL_REATTEST"
        ? baselineBound && criticalBound &&
          SAFE_CONFIG_VERSION.test(baselineConfigurationVersion) &&
          HEX64.test(baselineSourceVersionReadFingerprint || "") &&
          providerAssignedRuleId !== null
        : stage === "BASELINE_RESTORED"
          ? baselineBound && criticalBound &&
            SAFE_CONFIG_VERSION.test(baselineConfigurationVersion) &&
            HEX64.test(baselineSourceVersionReadFingerprint || "") &&
            providerAssignedRuleId === null &&
            expectedConfigurationVersion === baselineConfigurationVersion
          : false;
  const identities = [
    evidenceRequestId, wafEpochId, transitionRequestId,
    baselineEvidenceId, criticalEvidenceId,
  ].filter(Boolean);
  let generatedRule;
  try {
    generatedRule = buildProductionGoogleWriterCriticalWindowVercelRuleInsert({
      candidateAliasOrigin,
      candidateImmutableOrigin,
      runOwnedRuleName,
      runOwnedRuleNonce,
    });
  } catch {
    generatedRule = null;
  }
  if (value.schemaVersion !== VERCEL_WAF_PROVIDER_EVIDENCE_REQUEST_SCHEMA ||
      new Set(identities).size !== identities.length ||
      !VERCEL_WAF_PROVIDER_EVIDENCE_STAGES.includes(stage) ||
      !["REHEARSAL", "CUTOVER"].includes(purpose) ||
      !["REHEARSAL", "CUTOVER", "ROLLBACK"].includes(transitionMode) ||
      (transitionMode === "REHEARSAL") !== (purpose === "REHEARSAL") ||
      projectId !== PRODUCTION_VERCEL_PROJECT_ID || !TEAM_ID.test(teamId) ||
      !candidateAliasOrigin || !candidateImmutableOrigin ||
      candidateAliasOrigin === candidateImmutableOrigin ||
      !DEPLOYMENT_ID.test(candidateDeploymentId) ||
      !HEX40.test(candidateCommitSha) || candidateDeploymentTarget !== "PREVIEW" ||
      !/^[A-Za-z0-9 ._:-]{3,160}$/.test(runOwnedRuleName) ||
      !generatedRule ||
      runOwnedRuleFingerprint !== generatedRule.runOwnedRuleFingerprint ||
      runOwnedInsertDocumentFingerprint !==
        generatedRule.runOwnedInsertDocumentFingerprint ||
      providerAssignedRuleId !== null && !SAFE_PROVIDER_ID.test(providerAssignedRuleId) ||
      expectedConfigurationVersion !== null &&
        !SAFE_CONFIG_VERSION.test(expectedConfigurationVersion) ||
      !stageBindingValid) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_EVIDENCE_REQUEST_INVALID",
      "The WAF provider evidence request did not match a supported transition stage.",
      {},
      400,
    );
  }
  return Object.freeze({
    schemaVersion: VERCEL_WAF_PROVIDER_EVIDENCE_REQUEST_SCHEMA,
    evidenceRequestId,
    wafEpochId,
    transitionRequestId,
    stage,
    purpose,
    transitionMode,
    projectId,
    teamId,
    candidateAliasOrigin,
    candidateImmutableOrigin,
    candidateDeploymentId,
    candidateCommitSha,
    candidateDeploymentTarget,
    runOwnedRuleName,
    runOwnedRuleNonce,
    runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint,
    providerAssignedRuleId,
    baselineEvidenceId,
    criticalEvidenceId,
    baselineSemanticFingerprint,
    criticalSemanticFingerprint,
    baselineConfigurationVersion,
    baselineSourceVersionReadFingerprint,
    expectedConfigurationVersion,
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

function projectedProviderRecord(providerRecord) {
  const scopeClass = providerRecord[4] === "PRODUCTION"
    ? "PRODUCTION_TARGET"
    : "PROJECT_PREVIEW";
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

function normalizedHostname(value, { requireVercel = false } = {}) {
  const selected = clean(value).toLowerCase();
  if (!selected || selected.includes("://") || selected.includes("/") ||
      selected.includes("?") || selected.includes("#")) return "";
  const normalized = normalizedOrigin(`https://${selected}`, { requireVercel });
  return normalized ? new URL(normalized).hostname : "";
}

function normalizeAliasPage(payload) {
  if (!plain(payload) || !Array.isArray(payload.aliases) ||
      !plain(payload.pagination) || !own(payload.pagination, "count") ||
      !own(payload.pagination, "next") ||
      !Number.isSafeInteger(payload.pagination.count) ||
      payload.pagination.count !== payload.aliases.length) {
    throw attestationError(
      "STEP11_6_VERCEL_ALIAS_PAGE_INVALID",
      "A Vercel alias page did not expose an exact pagination boundary.",
      {},
      503,
    );
  }
  const next = payload.pagination.next === null ||
    payload.pagination.next === undefined || payload.pagination.next === 0 ||
    payload.pagination.next === "" ? null : clean(payload.pagination.next);
  if (next !== null && !/^\d{1,20}$/.test(next)) {
    throw attestationError(
      "STEP11_6_VERCEL_ALIAS_PAGE_INVALID",
      "A Vercel alias page returned an invalid continuation cursor.",
      {},
      503,
    );
  }
  return { aliases: payload.aliases, count: payload.pagination.count, next };
}

function aliasApiPath(request, until = null) {
  const query = new URLSearchParams({
    projectId: request.projectId,
    teamId: request.teamId,
    limit: "100",
  });
  if (until !== null) query.set("until", until);
  return `/v4/aliases?${query}`;
}

function normalizedAliasRecord(value, request) {
  const alias = normalizedHostname(value?.alias);
  const ids = [value?.deploymentId, value?.deployment?.id]
    .filter((item) => item !== null && item !== undefined && clean(item))
    .map(clean);
  const selectedDeploymentId = new Set(ids).size === 1 ? ids[0] : "";
  const deploymentOrigin = normalizedHostname(value?.deployment?.url, {
    requireVercel: true,
  });
  const redirect = value?.redirect === null || value?.redirect === undefined
    ? null : normalizedHostname(value.redirect);
  const redirectStatusCode = value?.redirectStatusCode === null ||
    value?.redirectStatusCode === undefined ? null : Number(value.redirectStatusCode);
  if (!alias || !DEPLOYMENT_ID.test(selectedDeploymentId) || !deploymentOrigin ||
      clean(value?.projectId) !== request.projectId ||
      !(value?.deletedAt === null || value?.deletedAt === undefined) ||
      !(redirect === null && redirectStatusCode === null ||
        redirect !== null && [301, 302, 307, 308].includes(redirectStatusCode))) {
    throw attestationError(
      "STEP11_6_VERCEL_ALIAS_SCOPE_INVALID",
      "A Vercel alias record was not an exact active project alias.",
      {},
      503,
    );
  }
  return Object.freeze([
    alias, selectedDeploymentId, deploymentOrigin, redirect, redirectStatusCode,
  ]);
}

function expectedCanonicalRoutingAliasRecords(request) {
  const cutover = request.purpose === "CUTOVER";
  const activeDeploymentId = cutover
    ? request.candidateDeploymentId
    : VERCEL_PROVIDER_BASELINE_PRODUCTION_DEPLOYMENT_ID;
  const activeDeploymentHostname = cutover
    ? new URL(request.candidateImmutableOrigin).hostname
    : VERCEL_PROVIDER_BASELINE_PRODUCTION_DEPLOYMENT_HOSTNAME;
  return Object.freeze([
    Object.freeze([
      VERCEL_PROVIDER_CANONICAL_APEX_HOSTNAME,
      activeDeploymentId,
      activeDeploymentHostname,
      null,
      null,
    ]),
    Object.freeze([
      VERCEL_PROVIDER_CANONICAL_DIRECT_HOSTNAME,
      activeDeploymentId,
      activeDeploymentHostname,
      null,
      null,
    ]),
    // A feature-branch CUTOVER must not silently retarget the main-branch
    // alias. The critical WAF denies it throughout the global quiesce window.
    Object.freeze([
      VERCEL_PROVIDER_MAIN_BRANCH_ALIAS_HOSTNAME,
      VERCEL_PROVIDER_BASELINE_PRODUCTION_DEPLOYMENT_ID,
      VERCEL_PROVIDER_BASELINE_PRODUCTION_DEPLOYMENT_HOSTNAME,
      null,
      null,
    ]),
    Object.freeze([
      VERCEL_PROVIDER_CANONICAL_WWW_HOSTNAME,
      activeDeploymentId,
      activeDeploymentHostname,
      VERCEL_PROVIDER_CANONICAL_APEX_HOSTNAME,
      308,
    ]),
  ].sort((left, right) => compare(left[0], right[0])));
}

function assertCanonicalRoutingAliasRecords(records, request) {
  const expected = expectedCanonicalRoutingAliasRecords(request);
  const hostnames = new Set(expected.map((record) => record[0]));
  const actual = records.filter((record) => hostnames.has(record?.[0]));
  if (canonicalAttestationJson(actual) !== canonicalAttestationJson(expected)) {
    throw attestationError(
      "STEP11_6_VERCEL_CANONICAL_ALIAS_SCOPE_DRIFT",
      "The apex, www, direct, and main-branch alias policy was not exact.",
      {},
      409,
    );
  }
  return Object.freeze({
    recordCount: expected.length,
    recordsFingerprint: sha256(canonicalAttestationJson(expected)),
    policy: request.purpose === "CUTOVER"
      ? "APEX_WWW_DIRECT_TO_EXACT_CANDIDATE_MAIN_RETAINED"
      : "APEX_WWW_DIRECT_MAIN_RETAINED_DURING_REHEARSAL",
  });
}

export async function collectVercelAliasScope(readApi, requestInput) {
  const request = normalizeAttestationRequest(requestInput);
  const records = [];
  const pages = [];
  const seenCursors = new Set();
  let cursor = null;
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const path = aliasApiPath(request, cursor);
    const page = normalizeAliasPage(await readApi(path));
    records.push(...page.aliases.map((value) => normalizedAliasRecord(value, request)));
    pages.push(Object.freeze({
      pageIndex,
      recordCount: page.count,
      requestCursor: cursor,
      nextCursor: page.next,
    }));
    if (page.next === null) break;
    if (seenCursors.has(page.next)) {
      throw attestationError(
        "STEP11_6_VERCEL_ALIAS_PAGINATION_LOOP",
        "Vercel alias pagination repeated a continuation cursor.",
        {},
        503,
      );
    }
    seenCursors.add(page.next);
    cursor = page.next;
    if (pageIndex === 99) {
      throw attestationError(
        "STEP11_6_VERCEL_ALIAS_PAGINATION_INCOMPLETE",
        "Vercel alias pagination did not terminate.",
        {},
        503,
      );
    }
  }
  const sorted = records.sort((left, right) => compare(left[0], right[0]));
  const aliasNames = sorted.map((record) => record[0]);
  const course = sorted.filter((record) =>
    record[0] === VERCEL_PROVIDER_UNSAFE_COURSE_ALIAS_HOSTNAME);
  const candidateAlias = new URL(request.candidateAliasOrigin).hostname;
  const candidate = sorted.filter((record) => record[0] === candidateAlias);
  if (pages.length === 0 || pages.at(-1).nextCursor !== null ||
      sorted.length !== VERCEL_PROVIDER_ALIAS_INVENTORY_RECORD_COUNT ||
      new Set(aliasNames).size !== sorted.length ||
      course.length !== 1 ||
      canonicalAttestationJson(course[0]) !== canonicalAttestationJson([
        VERCEL_PROVIDER_UNSAFE_COURSE_ALIAS_HOSTNAME,
        VERCEL_PROVIDER_UNSAFE_COURSE_ALIAS_DEPLOYMENT_ID,
        VERCEL_PROVIDER_UNSAFE_COURSE_ALIAS_DEPLOYMENT_HOSTNAME,
        null,
        null,
      ]) || candidate.length !== 1 ||
      candidate[0][1] !== request.candidateDeploymentId ||
      candidate[0][2] !== new URL(request.candidateImmutableOrigin).hostname ||
      candidate[0][3] !== null || candidate[0][4] !== null) {
    throw attestationError(
      "STEP11_6_VERCEL_ALIAS_SCOPE_DRIFT",
      "The exhaustive live Vercel alias scope did not preserve the exact unsafe and candidate mappings.",
      {},
      409,
    );
  }
  const canonicalRouting = assertCanonicalRoutingAliasRecords(sorted, request);
  return Object.freeze({
    records: Object.freeze(sorted),
    count: sorted.length,
    fingerprint: sha256(canonicalAttestationJson(sorted)),
    pageCount: pages.length,
    paginationFingerprint: sha256(canonicalAttestationJson(pages)),
    canonicalRouting,
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
let reviewedProjectWidePreviewException;

function exactLegacyBroadEnvironmentRecord(record) {
  return LEGACY_BROAD_PREVIEW_ENVIRONMENT_NAMES.has(record[0]) &&
    record[2] === null && record[1].length === 2 &&
    record[1][0] === "preview" && record[1][1] === "production";
}

function credentialConfinementPreviewException() {
  if (reviewedProjectWidePreviewException) {
    return reviewedProjectWidePreviewException;
  }
  const exception = productionGoogleCredentialConfinementEvidence()
    ?.environmentScopeContract?.reviewedProjectWidePreviewException;
  const shadowed = exception?.shadowedProjectWideRecords;
  const overrides = exception?.requiredSameNameExactCandidateOverrides;
  const unshadowed = exception?.unshadowedNonsecretProjectWideRecords;
  const exactProjectWide = (record) => Array.isArray(record) && record.length === 3 &&
    /^[A-Z][A-Z0-9_]{2,160}$/.test(record[0]) &&
    Array.isArray(record[1]) && record[1].length === 1 &&
    record[1][0] === "preview" && record[2] === null;
  const exactOverride = (record) => Array.isArray(record) && record.length === 3 &&
    /^[A-Z][A-Z0-9_]{2,160}$/.test(record[0]) &&
    Array.isArray(record[1]) && record[1].length === 1 &&
    record[1][0] === "preview" &&
    record[2] === VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH;
  const shadowedNames = Array.isArray(shadowed)
    ? shadowed.map((record) => record?.[0]) : [];
  const overrideNames = Array.isArray(overrides)
    ? overrides.map((record) => record?.[0]) : [];
  const unshadowedNames = Array.isArray(unshadowed)
    ? unshadowed.map((record) => record?.[0]) : [];
  if (!exactKeys(exception, [
    "recordTuple", "shadowedProjectWideRecords",
    "requiredSameNameExactCandidateOverrides",
    "unshadowedNonsecretProjectWideRecords",
    "unreviewedProjectWideRelevantRecordAllowed",
    "wrongBranchRelevantRecordAllowed",
  ]) || canonicalAttestationJson(exception.recordTuple) !==
      canonicalAttestationJson(["name", "targets", "gitBranch"]) ||
      !Array.isArray(shadowed) || shadowed.length === 0 ||
      !shadowed.every(exactProjectWide) ||
      !Array.isArray(overrides) || !overrides.every(exactOverride) ||
      !Array.isArray(unshadowed) || !unshadowed.every(exactProjectWide) ||
      new Set(shadowedNames).size !== shadowedNames.length ||
      new Set(overrideNames).size !== overrideNames.length ||
      new Set(unshadowedNames).size !== unshadowedNames.length ||
      canonicalAttestationJson([...shadowedNames].sort(compare)) !==
        canonicalAttestationJson([...overrideNames].sort(compare)) ||
      shadowedNames.some((name) => unshadowedNames.includes(name)) ||
      exception.unreviewedProjectWideRelevantRecordAllowed !== false ||
      exception.wrongBranchRelevantRecordAllowed !== false) {
    throw attestationError(
      "STEP11_6_VERCEL_CREDENTIAL_CONFINEMENT_INVALID",
      "The credential-confinement Preview exception contract was invalid.",
      {},
      503,
    );
  }
  reviewedProjectWidePreviewException = Object.freeze({
    shadowedRecords: new Set(shadowed.map(canonicalAttestationJson)),
    overrideByName: new Map(overrides.map((record) =>
      [record[0], canonicalAttestationJson(record)])),
    unshadowedRecords: new Set(unshadowed.map(canonicalAttestationJson)),
  });
  return reviewedProjectWidePreviewException;
}

function exactReviewedProjectWidePreviewDefault(record, records, exception) {
  const serialized = canonicalAttestationJson(record);
  if (exception.unshadowedRecords.has(serialized)) return true;
  if (!exception.shadowedRecords.has(serialized)) return false;
  const requiredOverride = exception.overrideByName.get(record[0]);
  return records.some((candidate) =>
    canonicalAttestationJson(candidate) === requiredOverride);
}

export function normalizeVercelEnvironmentScope(payload, {
  request,
  reviewedResourceReview,
  providerEnvironmentRecordCount: providerEnvironmentRecordCountInput,
} = {}) {
  if (!plain(payload) || !Array.isArray(payload.envs) ||
      !own(payload, "hiddenProductionEnvCount") ||
      !Number.isSafeInteger(payload.hiddenProductionEnvCount) ||
      payload.hiddenProductionEnvCount !== 0) {
    throw attestationError(
      "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_INVALID",
      "The Vercel environment metadata response was invalid, incomplete, or hidden.",
      {},
      503,
    );
  }
  const providerEnvironmentRecordCount = providerEnvironmentRecordCountInput === undefined
    ? payload.envs.length : providerEnvironmentRecordCountInput;
  if (!Number.isSafeInteger(providerEnvironmentRecordCount) ||
      providerEnvironmentRecordCount < payload.envs.length) {
    throw attestationError(
      "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_INVALID",
      "The Vercel environment record census count was invalid.",
      {},
      503,
    );
  }
  const normalized = payload.envs.filter((value) => {
    const name = clean(value?.key || value?.name);
    return RELEVANT_ENVIRONMENT_NAME.test(name);
  }).map((value) => {
    const id = clean(value?.id);
    const name = clean(value?.key || value?.name);
    const type = clean(value?.type);
    const targets = (Array.isArray(value?.target) ? value.target : [value?.target])
      .map((target) => clean(target).toLowerCase()).filter(Boolean);
    const normalizedTargets = [...new Set(targets)].sort(compare);
    const gitBranch = value?.gitBranch === null || value?.gitBranch === undefined
      ? null : clean(value.gitBranch);
    const createdAt = value?.createdAt;
    const updatedAt = value?.updatedAt;
    const configurationId = value?.configurationId === null
      ? null : clean(value?.configurationId);
    const visibility = value?.visibility === null || value?.visibility === undefined
      ? null : clean(value?.visibility);
    if (!SAFE_PROVIDER_ID.test(id) || !/^[A-Z][A-Z0-9_]{2,160}$/.test(name) ||
        !/^[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(type) ||
        normalizedTargets.length === 0 ||
        normalizedTargets.some((target) => !ENVIRONMENT_TARGETS.has(target)) ||
        (gitBranch !== null && (!gitBranch || gitBranch.length > 240)) ||
        !(Number.isSafeInteger(createdAt) && createdAt >= 0 ||
          typeof createdAt === "string" && !Number.isNaN(Date.parse(createdAt))) ||
        !(Number.isSafeInteger(updatedAt) && updatedAt >= 0 ||
          typeof updatedAt === "string" && !Number.isNaN(Date.parse(updatedAt))) ||
        !(configurationId === null || SAFE_PROVIDER_ID.test(configurationId)) ||
        !(visibility === null || /^[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(visibility)) ||
        value?.decrypted !== false) {
      throw attestationError(
        "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_INVALID",
        "A redacted Vercel environment-scope record was invalid.",
        {},
        503,
      );
    }
    const exactCreatedAt = Number.isSafeInteger(createdAt)
      ? createdAt : new Date(Date.parse(createdAt)).toISOString();
    const exactUpdatedAt = Number.isSafeInteger(updatedAt)
      ? updatedAt : new Date(Date.parse(updatedAt)).toISOString();
    return Object.freeze({
      scope: Object.freeze([name, Object.freeze(normalizedTargets), gitBranch]),
      metadata: Object.freeze([
        id, name, type, Object.freeze(normalizedTargets), gitBranch,
        exactCreatedAt, exactUpdatedAt, configurationId, visibility, false,
      ]),
    });
  }).sort((left, right) => compare(canonicalAttestationJson(left.metadata),
    canonicalAttestationJson(right.metadata)));
  const records = normalized.map((record) => record.metadata);
  const scopeRecords = normalized.map((record) => record.scope);
  const keys = records.map(canonicalAttestationJson);
  if (records.length === 0 || new Set(keys).size !== keys.length ||
      new Set(records.map((record) => record[0])).size !== records.length) {
    throw attestationError(
      "STEP11_6_VERCEL_ENVIRONMENT_SCOPE_INVALID",
      "The relevant redacted Vercel environment scope was empty or duplicated.",
      {},
      409,
    );
  }
  if (request) {
    const previewException = credentialConfinementPreviewException();
    // Current REHEARSAL/CUTOVER control candidates are always exact Project
    // Preview deployments. Purpose is signed separately and must never relabel
    // the provider environment target as Production.
    const target = "preview";
    // Vercel represents a branch-bound Preview secret as target=preview plus
    // gitBranch. Dedicated Production credentials/resources must be bound to
    // the exact candidate branch. The project also has a reviewed, finite set
    // of ordinary project-wide Preview defaults; Vercel applies the exact
    // branch record over those defaults for the selected candidate. Keeping
    // that distinction explicit prevents a harmless fallback from weakening
    // the rejection of an unscoped Production credential. Production-scoped
    // records remain legitimate, but branch metadata is never meaningful for
    // them. A record for any other branch remains a scope failure.
    const unsafeBranchScope = scopeRecords.some((record) =>
      record[1].includes("development") ||
      (record[1].includes("preview") &&
        record[2] !== VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH &&
        !exactLegacyBroadEnvironmentRecord(record) &&
        !exactReviewedProjectWidePreviewDefault(record, scopeRecords, previewException)) ||
      (record[2] !== null &&
        (record[1].length !== 1 || record[1][0] !== "preview" ||
          record[2] !== VERCEL_PROVIDER_ATTESTATION_CANDIDATE_BRANCH)));
    const missingRequired = REQUIRED_ATTESTED_RUNTIME_ENVIRONMENT_NAMES.filter((name) =>
      !scopeRecords.some((record) => record[0] === name && record[1].includes(target) &&
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
    const expectedReview = productionGoogleCredentialConfinementEvidence()
      ?.providerEnvironmentResourceReview;
    if (!validVercelEnvironmentResourceReview(reviewedResourceReview) ||
        !validVercelEnvironmentResourceReview(expectedReview) ||
        reviewedResourceReview.providerEnvironmentRecordCount !==
          providerEnvironmentRecordCount ||
        reviewedResourceReview.hiddenProductionEnvCount !==
          payload.hiddenProductionEnvCount ||
        reviewedResourceReview.records.some((reviewed) =>
          !records.some((record) => canonicalAttestationJson(record) ===
            canonicalAttestationJson([
              reviewed[0], reviewed[1], reviewed[2], reviewed[3], reviewed[4],
              reviewed[5], reviewed[6], reviewed[7], reviewed[8], false,
            ]))) ||
        canonicalAttestationJson(reviewedResourceReview) !==
          canonicalAttestationJson(expectedReview)) {
      throw attestationError(
        "STEP11_6_VERCEL_ENVIRONMENT_RESOURCE_DRIFT",
        "The exact reviewed Vercel environment resources did not match the certified evidence.",
        {},
        409,
      );
    }
  }
  const review = request ? reviewedResourceReview : null;
  const recordsFingerprint = sha256(canonicalAttestationJson({
    schemaVersion: "step11-6-vercel-environment-scope-binding-v2",
    providerEnvironmentRecordCount,
    hiddenProductionEnvCount: payload.hiddenProductionEnvCount,
    records,
    reviewedResourceRecordCount: review?.recordCount ?? 0,
    reviewedResourceRecordsFingerprint: review?.recordsFingerprint ?? null,
    reviewedResourceReviewFingerprint: review?.reviewFingerprint ?? null,
  }));
  return Object.freeze({
    recordCount: records.length,
    records: Object.freeze(records),
    recordsFingerprint,
    providerEnvironmentRecordCount,
    hiddenProductionEnvCount: payload.hiddenProductionEnvCount,
    reviewedResourceRecordCount: review?.recordCount ?? 0,
    reviewedResourceRecordsFingerprint: review?.recordsFingerprint ?? null,
    reviewedResourceReviewFingerprint: review?.reviewFingerprint ?? null,
    reviewedResourceRecords: review?.records ?? Object.freeze([]),
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

const WAF_PROVIDER_EVIDENCE_KEYS = Object.freeze([
  "schemaVersion", "evidenceId", "evidenceRequestId", "wafEpochId",
  "transitionRequestId", "requestFingerprint", "stage", "purpose",
  "transitionMode", "vercelProjectId", "vercelTeamId", "candidateAliasOrigin",
  "candidateImmutableOrigin", "candidateDeploymentId", "candidateCommitSha",
  "candidateDeploymentTarget", "runOwnedRuleName", "runOwnedRuleNonce",
  "runOwnedRuleFingerprint", "runOwnedInsertDocumentFingerprint",
  "providerAssignedRuleId",
  "baselineEvidenceId",
  "criticalEvidenceId", "configurationMode", "configurationVersion",
  "configurationEtag", "providerConfigurationId", "providerOwnerId",
  "configurationIdentityFingerprint",
  "semanticConfiguration", "semanticConfigurationFingerprint",
  "orderedCustomRulesFingerprint", "baselineSemanticFingerprint",
  "criticalSemanticFingerprint", "baselineConfigurationVersion",
  "baselineSourceVersionReadFingerprint", "sourceVersionReadFingerprint",
  "customRuleCount",
  "runOwnedProviderRuleDocumentFingerprint", "runOwnedRulePrecedence",
  "criticalWindowContractFingerprint", "pendingDraftChangeCount",
  "providerObservedAt", "attestedAt", "expiresAt",
]);

function wafEvidenceRequestFingerprint(request) {
  return sha256(canonicalAttestationJson({
    schemaVersion: "bagger-vercel-waf-provider-evidence-request-binding-v1",
    ...request,
  }));
}

function wafEvidenceSigner(privateKey) {
  let signer;
  try {
    signer = privateKey?.type === "private" ? privateKey : createPrivateKey(privateKey);
  } catch {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_PRIVATE_KEY_INVALID",
      "The local WAF provider-evidence private key was invalid.",
      {},
      400,
    );
  }
  if (signer.asymmetricKeyType !== "ed25519") {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_PRIVATE_KEY_INVALID",
      "The local WAF provider-evidence private key was not Ed25519.",
      {},
      400,
    );
  }
  return signer;
}

export function createVercelWafProviderEvidence({
  request: requestInput,
  firewallPayload,
  privateKey,
  now = Date.now(),
  evidenceId: evidenceIdInput = randomUUID(),
} = {}) {
  const request = normalizeVercelWafProviderEvidenceRequest(requestInput);
  const evidenceId = exactUuid(evidenceIdInput, "evidenceId");
  const evidenceIdentities = [
    evidenceId,
    request.evidenceRequestId,
    request.wafEpochId,
    request.transitionRequestId,
    request.baselineEvidenceId,
    request.criticalEvidenceId,
  ].filter(Boolean);
  if (new Set(evidenceIdentities).size !== evidenceIdentities.length) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_EVIDENCE_ID_INVALID",
      "The WAF provider evidence identities were not distinct.",
      {},
      400,
    );
  }
  const selectedTime = new Date(Number(now));
  if (Number.isNaN(selectedTime.getTime())) {
    throw attestationError(
      "STEP11_6_VERCEL_ATTESTATION_TIMESTAMP_INVALID",
      "The WAF provider-evidence clock was invalid.",
      {},
      400,
    );
  }
  const normalized = normalizeVercelWafProviderConfiguration(firewallPayload, {
    stage: request.stage,
    projectId: request.projectId,
    teamId: request.teamId,
    configurationVersion: request.expectedConfigurationVersion,
    runOwnedRuleName: request.runOwnedRuleName,
    runOwnedRuleNonce: request.runOwnedRuleNonce,
    runOwnedRuleFingerprint: request.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint:
      request.runOwnedInsertDocumentFingerprint,
    providerAssignedRuleId: request.providerAssignedRuleId,
    baselineSemanticFingerprint: request.baselineSemanticFingerprint,
    criticalSemanticFingerprint: request.criticalSemanticFingerprint,
    candidateAliasOrigin: request.candidateAliasOrigin,
    candidateImmutableOrigin: request.candidateImmutableOrigin,
  });
  const signer = wafEvidenceSigner(privateKey);
  const signerKeyFingerprint = publicKeyFingerprint(createPublicKey(signer));
  const attestedAt = selectedTime.toISOString();
  const evidence = Object.freeze({
    schemaVersion: VERCEL_WAF_PROVIDER_EVIDENCE_SCHEMA,
    evidenceId,
    evidenceRequestId: request.evidenceRequestId,
    wafEpochId: request.wafEpochId,
    transitionRequestId: request.transitionRequestId,
    requestFingerprint: wafEvidenceRequestFingerprint(request),
    stage: request.stage,
    purpose: request.purpose,
    transitionMode: request.transitionMode,
    vercelProjectId: request.projectId,
    vercelTeamId: request.teamId,
    candidateAliasOrigin: request.candidateAliasOrigin,
    candidateImmutableOrigin: request.candidateImmutableOrigin,
    candidateDeploymentId: request.candidateDeploymentId,
    candidateCommitSha: request.candidateCommitSha,
    candidateDeploymentTarget: request.candidateDeploymentTarget,
    runOwnedRuleName: request.runOwnedRuleName,
    runOwnedRuleNonce: request.runOwnedRuleNonce,
    providerAssignedRuleId: request.providerAssignedRuleId,
    baselineEvidenceId: request.baselineEvidenceId,
    criticalEvidenceId: request.criticalEvidenceId,
    configurationMode: normalized.mode,
    configurationVersion: normalized.configurationVersion,
    configurationEtag: normalized.etag,
    providerConfigurationId: normalized.providerConfigurationId,
    providerOwnerId: normalized.providerOwnerId,
    configurationIdentityFingerprint:
      normalized.configurationIdentityFingerprint,
    semanticConfiguration: normalized.semanticConfiguration,
    semanticConfigurationFingerprint:
      normalized.semanticConfigurationFingerprint,
    orderedCustomRulesFingerprint:
      normalized.orderedCustomRulesFingerprint,
    baselineSemanticFingerprint: normalized.baselineSemanticFingerprint,
    criticalSemanticFingerprint: normalized.criticalSemanticFingerprint,
    baselineConfigurationVersion: request.baselineConfigurationVersion,
    baselineSourceVersionReadFingerprint:
      request.baselineSourceVersionReadFingerprint,
    sourceVersionReadFingerprint: normalized.sourceVersionReadFingerprint,
    customRuleCount: normalized.customRuleCount,
    runOwnedRuleFingerprint: normalized.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint:
      request.runOwnedInsertDocumentFingerprint,
    runOwnedProviderRuleDocumentFingerprint:
      normalized.runOwnedProviderRuleDocumentFingerprint,
    runOwnedRulePrecedence: normalized.runOwnedRulePrecedence,
    criticalWindowContractFingerprint:
      normalized.criticalWindowContractFingerprint,
    pendingDraftChangeCount: normalized.pendingDraftChangeCount,
    providerObservedAt: attestedAt,
    attestedAt,
    expiresAt: new Date(selectedTime.getTime() +
      VERCEL_PROVIDER_ATTESTATION_VALIDITY_SECONDS * 1_000).toISOString(),
  });
  const document = Object.freeze({
    schemaVersion: VERCEL_WAF_PROVIDER_EVIDENCE_ENVELOPE_SCHEMA,
    algorithm: VERCEL_PROVIDER_ATTESTATION_ALGORITHM,
    signerKeyVersion: VERCEL_PROVIDER_ATTESTATION_SIGNER_KEY_VERSION,
    signerKeyFingerprint,
    evidence,
  });
  const serialized = canonicalAttestationJson(document);
  return Object.freeze({
    ...document,
    evidenceFingerprint: sha256(serialized),
    signature: signDetached(null, Buffer.from(serialized), signer)
      .toString("base64url"),
  });
}

export function verifyVercelWafProviderEvidence(envelope, {
  request: requestInput,
  env = process.env,
  now = Date.now(),
  initialMaxAgeSeconds = VERCEL_PROVIDER_ATTESTATION_INITIAL_MAX_AGE_SECONDS,
} = {}) {
  if (!exactKeys(envelope, [
    "schemaVersion", "algorithm", "signerKeyVersion", "signerKeyFingerprint",
    "evidence", "evidenceFingerprint", "signature",
  ]) || envelope.schemaVersion !== VERCEL_WAF_PROVIDER_EVIDENCE_ENVELOPE_SCHEMA ||
      envelope.algorithm !== VERCEL_PROVIDER_ATTESTATION_ALGORITHM ||
      envelope.signerKeyVersion !== VERCEL_PROVIDER_ATTESTATION_SIGNER_KEY_VERSION ||
      !HEX64.test(clean(envelope.signerKeyFingerprint).toLowerCase()) ||
      !HEX64.test(clean(envelope.evidenceFingerprint).toLowerCase()) ||
      !BASE64URL.test(clean(envelope.signature)) ||
      !exactKeys(envelope.evidence, WAF_PROVIDER_EVIDENCE_KEYS)) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_EVIDENCE_ENVELOPE_INVALID",
      "The signed WAF provider-evidence envelope was invalid.",
      {},
      400,
    );
  }
  const request = normalizeVercelWafProviderEvidenceRequest(requestInput);
  const evidence = envelope.evidence;
  const pinnedTeamId = clean(env[VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]);
  const publicKey = publicKeyFromPinnedBase64(
    env[VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV],
  );
  const signerKeyFingerprint = publicKeyFingerprint(publicKey);
  const document = Object.freeze({
    schemaVersion: envelope.schemaVersion,
    algorithm: envelope.algorithm,
    signerKeyVersion: envelope.signerKeyVersion,
    signerKeyFingerprint: envelope.signerKeyFingerprint,
    evidence,
  });
  const serialized = canonicalAttestationJson(document);
  if (pinnedTeamId !== request.teamId ||
      signerKeyFingerprint !== clean(envelope.signerKeyFingerprint).toLowerCase() ||
      sha256(serialized) !== clean(envelope.evidenceFingerprint).toLowerCase() ||
      !verifyDetached(null, Buffer.from(serialized), publicKey,
        Buffer.from(clean(envelope.signature), "base64url"))) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_EVIDENCE_SIGNATURE_INVALID",
      "The signed WAF provider evidence did not verify against the pinned signer.",
      {},
      409,
    );
  }
  const semantic = evidence.semanticConfiguration;
  const rules = plain(semantic) && Array.isArray(semantic.orderedCustomRules)
    ? semantic.orderedCustomRules : null;
  const semanticHash = rules === null ? "" : sha256(canonicalAttestationJson(semantic));
  const rulesHash = rules === null ? "" : sha256(canonicalAttestationJson(rules));
  const semanticShapeValid = validWafSemanticConfiguration(semantic);
  const baselineFingerprint = baselineSemanticFingerprintFrom(semantic);
  const identityHash = sha256(canonicalAttestationJson({
    projectId: evidence.vercelProjectId,
    teamId: evidence.vercelTeamId,
    configurationVersion: evidence.configurationVersion,
    etag: evidence.configurationEtag,
    providerConfigurationId: evidence.providerConfigurationId,
    providerOwnerId: evidence.providerOwnerId,
  }));
  const sourceVersionReadHash = sha256(canonicalAttestationJson({
    schemaVersion: "bagger-vercel-waf-source-version-semantic-read-v1",
    projectId: evidence.vercelProjectId,
    teamId: evidence.vercelTeamId,
    configurationVersion: evidence.configurationVersion,
    providerConfigurationId: evidence.providerConfigurationId,
    providerOwnerId: evidence.providerOwnerId,
    firewallEnabled: true,
    semanticConfiguration: semantic,
  }));
  const providerObservedAt = exactTimestamp(
    evidence.providerObservedAt,
    "providerObservedAt",
  );
  const attestedAt = exactTimestamp(evidence.attestedAt, "attestedAt");
  const expiresAt = exactTimestamp(evidence.expiresAt, "expiresAt");
  const current = Number(now);
  const observedTime = Date.parse(providerObservedAt);
  const attestedTime = Date.parse(attestedAt);
  const expiryTime = Date.parse(expiresAt);
  let stageShapeValid = false;
  if (new Set(["BASELINE_CAPTURE", "BASELINE_RESTORED"]).has(request.stage)) {
    stageShapeValid = evidence.configurationMode === "BASELINE" &&
      evidence.customRuleCount === 0 && rules?.length === 0 &&
      HEX64.test(clean(evidence.runOwnedRuleFingerprint)) &&
      evidence.runOwnedProviderRuleDocumentFingerprint === null &&
      evidence.runOwnedRulePrecedence === null &&
      evidence.criticalWindowContractFingerprint === null &&
      semanticHash === baselineFingerprint;
  } else if (rules?.length === 1) {
    const providerRuleDocumentFingerprint =
      rules[0]?.providerRuleDocumentFingerprint;
    const normalizedRule = plain(rules[0]) ? { ...rules[0] } : null;
    if (normalizedRule) delete normalizedRule.providerRuleDocumentFingerprint;
    const expectedRule = productionGoogleWriterCriticalWindowProviderRuleContract({
      ...request,
      runOwnedRuleName: request.runOwnedRuleName,
    });
    stageShapeValid = evidence.configurationMode === "CRITICAL_WINDOW" &&
      evidence.customRuleCount === 1 &&
      evidence.runOwnedRulePrecedence === 0 &&
      HEX64.test(clean(providerRuleDocumentFingerprint)) &&
      canonicalAttestationJson(normalizedRule) ===
        canonicalAttestationJson(expectedRule) &&
      evidence.runOwnedRuleFingerprint === expectedRule.ruleFingerprint &&
      evidence.runOwnedProviderRuleDocumentFingerprint ===
        providerRuleDocumentFingerprint &&
      evidence.criticalWindowContractFingerprint ===
        expectedRule.criticalWindowContractFingerprint;
  }
  const expectedCriticalFingerprint = request.stage === "CRITICAL_ACTIVE"
    ? semanticHash : request.criticalSemanticFingerprint;
  const evidenceIdentities = [
    evidence.evidenceId,
    evidence.evidenceRequestId,
    evidence.wafEpochId,
    evidence.transitionRequestId,
    evidence.baselineEvidenceId,
    evidence.criticalEvidenceId,
  ].filter(Boolean);
  if (!Number.isSafeInteger(initialMaxAgeSeconds) || initialMaxAgeSeconds < 1 ||
      initialMaxAgeSeconds > VERCEL_PROVIDER_ATTESTATION_VALIDITY_SECONDS ||
      evidence.schemaVersion !== VERCEL_WAF_PROVIDER_EVIDENCE_SCHEMA ||
      exactUuid(evidence.evidenceId, "evidenceId") !== evidence.evidenceId ||
      new Set(evidenceIdentities).size !== evidenceIdentities.length ||
      evidence.evidenceRequestId !== request.evidenceRequestId ||
      evidence.wafEpochId !== request.wafEpochId ||
      evidence.transitionRequestId !== request.transitionRequestId ||
      evidence.requestFingerprint !== wafEvidenceRequestFingerprint(request) ||
      evidence.stage !== request.stage || evidence.purpose !== request.purpose ||
      evidence.transitionMode !== request.transitionMode ||
      evidence.vercelProjectId !== request.projectId ||
      evidence.vercelTeamId !== request.teamId ||
      evidence.candidateAliasOrigin !== request.candidateAliasOrigin ||
      evidence.candidateImmutableOrigin !== request.candidateImmutableOrigin ||
      evidence.candidateDeploymentId !== request.candidateDeploymentId ||
      evidence.candidateCommitSha !== request.candidateCommitSha ||
      evidence.candidateDeploymentTarget !== request.candidateDeploymentTarget ||
      evidence.runOwnedRuleName !== request.runOwnedRuleName ||
      evidence.runOwnedRuleNonce !== request.runOwnedRuleNonce ||
      evidence.runOwnedRuleFingerprint !== request.runOwnedRuleFingerprint ||
      evidence.runOwnedInsertDocumentFingerprint !==
        request.runOwnedInsertDocumentFingerprint ||
      evidence.providerAssignedRuleId !== request.providerAssignedRuleId ||
      evidence.baselineEvidenceId !== request.baselineEvidenceId ||
      evidence.criticalEvidenceId !== request.criticalEvidenceId ||
      evidence.baselineConfigurationVersion !==
        request.baselineConfigurationVersion ||
      evidence.baselineSourceVersionReadFingerprint !==
        request.baselineSourceVersionReadFingerprint ||
      request.expectedConfigurationVersion !== null &&
        evidence.configurationVersion !== request.expectedConfigurationVersion ||
      !SAFE_CONFIG_VERSION.test(clean(evidence.configurationVersion)) ||
      !SAFE_PROVIDER_ID.test(clean(evidence.providerConfigurationId)) ||
      !SAFE_PROVIDER_ID.test(clean(evidence.providerOwnerId)) ||
      !(evidence.configurationEtag === null ||
        clean(evidence.configurationEtag).length > 0 &&
          clean(evidence.configurationEtag).length <= 512) ||
      evidence.configurationIdentityFingerprint !== identityHash ||
      evidence.sourceVersionReadFingerprint !== sourceVersionReadHash ||
      evidence.semanticConfigurationFingerprint !== semanticHash ||
      evidence.orderedCustomRulesFingerprint !== rulesHash ||
      evidence.baselineSemanticFingerprint !== baselineFingerprint ||
      request.baselineSemanticFingerprint !== null &&
        request.baselineSemanticFingerprint !== baselineFingerprint ||
      evidence.criticalSemanticFingerprint !== expectedCriticalFingerprint ||
      request.stage === "BASELINE_RESTORED" &&
        (semanticHash !== request.baselineSemanticFingerprint ||
          evidence.sourceVersionReadFingerprint !==
            request.baselineSourceVersionReadFingerprint) ||
      evidence.pendingDraftChangeCount !== 0 || !semanticShapeValid ||
      !stageShapeValid ||
      observedTime !== attestedTime || !Number.isFinite(current) ||
      attestedTime > current + 30_000 ||
      current - attestedTime > initialMaxAgeSeconds * 1_000 ||
      expiryTime <= current || expiryTime - attestedTime !==
        VERCEL_PROVIDER_ATTESTATION_VALIDITY_SECONDS * 1_000) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_EVIDENCE_SCOPE_INVALID",
      "The signed WAF provider evidence was stale or did not match its transition.",
      {},
      409,
    );
  }
  return Object.freeze({
    ...evidence,
    evidenceFingerprint: clean(envelope.evidenceFingerprint).toLowerCase(),
    signerKeyFingerprint,
    signerKeyVersion: envelope.signerKeyVersion,
    signatureVerified: true,
  });
}

const WAF_RULE_INSERT_RESULT_REQUEST_KEYS = Object.freeze([
  "schemaVersion", "dispatchResultId", "dispatchId", "dispatchRequestId",
  "wafEpochId", "transitionRequestId", "requestFingerprint", "dispatchStep",
  "purpose", "transitionMode",
  "projectId", "teamId", "candidateAliasOrigin", "candidateImmutableOrigin",
  "candidateDeploymentId", "candidateCommitSha", "candidateDeploymentTarget",
  "baselineEvidenceId", "baselineConfigurationVersion",
  "baselineConfigurationEtag", "baselineConfigurationIdentityFingerprint",
  "baselineSourceVersionReadFingerprint",
  "baselineSemanticFingerprint", "baselineOrderedCustomRulesFingerprint",
  "providerIntentFingerprint", "runOwnedRuleName", "runOwnedRuleNonce",
  "runOwnedRuleFingerprint", "runOwnedInsertDocumentFingerprint",
]);

const WAF_RULE_INSERT_RESULT_KEYS = Object.freeze([
  ...WAF_RULE_INSERT_RESULT_REQUEST_KEYS.filter((key) => key !== "schemaVersion"),
  "schemaVersion", "outcomeStatus", "providerResponseObserved",
  "providerResponseStatus", "providerResponseFingerprint",
  "providerReadbackFingerprint", "activeSemanticConfiguration",
  "activeSemanticConfigurationFingerprint", "activeCustomRuleCount",
  "activePendingDraftPresent", "draftSemanticConfiguration",
  "draftSemanticConfigurationFingerprint", "draftOrderedCustomRulesFingerprint",
  "draftConfigurationVersion", "draftConfigurationIdentityFingerprint",
  "draftCustomRuleCount", "pendingDraftChangeCount", "providerAssignedRuleId",
  "runOwnedProviderRuleDocumentFingerprint", "runOwnedRulePrecedence",
  "criticalWindowContractFingerprint", "providerObservedAt", "attestedAt",
  "expiresAt",
]);

function normalizeWafRuleInsertResultRequest(value) {
  if (!exactKeys(value, WAF_RULE_INSERT_RESULT_REQUEST_KEYS)) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_RULE_INSERT_RESULT_REQUEST_INVALID",
      "The WAF rule-insert dispatch-result request was not exact.", {}, 400,
    );
  }
  const candidateAliasOrigin = normalizedOrigin(value.candidateAliasOrigin, {
    requireVercel: true,
  });
  const candidateImmutableOrigin = normalizedOrigin(
    value.candidateImmutableOrigin, { requireVercel: true },
  );
  const result = {
    schemaVersion: value.schemaVersion,
    dispatchResultId: exactUuid(value.dispatchResultId, "dispatchResultId"),
    dispatchId: exactUuid(value.dispatchId, "dispatchId"),
    dispatchRequestId: exactUuid(value.dispatchRequestId, "dispatchRequestId"),
    wafEpochId: exactUuid(value.wafEpochId, "wafEpochId"),
    transitionRequestId: exactUuid(value.transitionRequestId,
      "transitionRequestId"),
    requestFingerprint: clean(value.requestFingerprint).toLowerCase(),
    dispatchStep: clean(value.dispatchStep).toUpperCase(),
    purpose: clean(value.purpose).toUpperCase(),
    transitionMode: clean(value.transitionMode).toUpperCase(),
    projectId: clean(value.projectId),
    teamId: clean(value.teamId),
    candidateAliasOrigin,
    candidateImmutableOrigin,
    candidateDeploymentId: clean(value.candidateDeploymentId),
    candidateCommitSha: clean(value.candidateCommitSha).toLowerCase(),
    candidateDeploymentTarget: clean(
      value.candidateDeploymentTarget,
    ).toUpperCase(),
    baselineEvidenceId: exactUuid(value.baselineEvidenceId, "baselineEvidenceId"),
    baselineConfigurationVersion: clean(value.baselineConfigurationVersion),
    baselineConfigurationEtag: value.baselineConfigurationEtag === null
      ? null : clean(value.baselineConfigurationEtag),
    baselineConfigurationIdentityFingerprint:
      clean(value.baselineConfigurationIdentityFingerprint).toLowerCase(),
    baselineSourceVersionReadFingerprint:
      clean(value.baselineSourceVersionReadFingerprint).toLowerCase(),
    baselineSemanticFingerprint:
      clean(value.baselineSemanticFingerprint).toLowerCase(),
    baselineOrderedCustomRulesFingerprint:
      clean(value.baselineOrderedCustomRulesFingerprint).toLowerCase(),
    providerIntentFingerprint: clean(value.providerIntentFingerprint).toLowerCase(),
    runOwnedRuleName: clean(value.runOwnedRuleName),
    runOwnedRuleNonce: clean(value.runOwnedRuleNonce).toLowerCase(),
    runOwnedRuleFingerprint: clean(value.runOwnedRuleFingerprint).toLowerCase(),
    runOwnedInsertDocumentFingerprint:
      clean(value.runOwnedInsertDocumentFingerprint).toLowerCase(),
  };
  const identities = [result.dispatchResultId, result.dispatchId,
    result.dispatchRequestId, result.wafEpochId, result.transitionRequestId,
    result.baselineEvidenceId];
  let generated;
  try {
    generated = buildProductionGoogleWriterCriticalWindowVercelRuleInsert({
      candidateAliasOrigin,
      candidateImmutableOrigin,
      runOwnedRuleName: result.runOwnedRuleName,
      runOwnedRuleNonce: result.runOwnedRuleNonce,
    });
  } catch {
    generated = null;
  }
  if (result.schemaVersion !==
        VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_REQUEST_SCHEMA ||
      new Set(identities).size !== identities.length ||
      !HEX64.test(result.requestFingerprint) ||
      !new Set([
        "CRITICAL_RULE_INSERT", "CRITICAL_DRAFT_ACTIVATE",
        "BASELINE_VERSION_ACTIVATE",
      ]).has(result.dispatchStep) ||
      !["REHEARSAL", "CUTOVER"].includes(result.purpose) ||
      !["REHEARSAL", "CUTOVER", "ROLLBACK"].includes(result.transitionMode) ||
      (result.transitionMode === "REHEARSAL") !==
        (result.purpose === "REHEARSAL") ||
      result.projectId !== PRODUCTION_VERCEL_PROJECT_ID ||
      !TEAM_ID.test(result.teamId) || !candidateAliasOrigin ||
      !candidateImmutableOrigin || candidateAliasOrigin === candidateImmutableOrigin ||
      !DEPLOYMENT_ID.test(result.candidateDeploymentId) ||
      !HEX40.test(result.candidateCommitSha) ||
      result.candidateDeploymentTarget !== "PREVIEW" ||
      !SAFE_CONFIG_VERSION.test(result.baselineConfigurationVersion) ||
      !(result.baselineConfigurationEtag === null ||
        result.baselineConfigurationEtag.length <= 512) ||
      !HEX64.test(result.baselineConfigurationIdentityFingerprint) ||
      !HEX64.test(result.baselineSourceVersionReadFingerprint) ||
      !HEX64.test(result.baselineSemanticFingerprint) ||
      !HEX64.test(result.baselineOrderedCustomRulesFingerprint) ||
      !HEX64.test(result.providerIntentFingerprint) || !generated ||
      result.runOwnedRuleFingerprint !== generated.runOwnedRuleFingerprint ||
      result.runOwnedInsertDocumentFingerprint !==
        generated.runOwnedInsertDocumentFingerprint) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_RULE_INSERT_RESULT_REQUEST_INVALID",
      "The WAF rule-insert dispatch-result request did not match its exact run.", {}, 400,
    );
  }
  return Object.freeze(result);
}

function normalizeRuleInsertTargetReadback(request, providerResponse, payload) {
  if (!plain(payload) || !plain(payload.active) ||
      !plain(payload.activeVersion) || !plain(payload.draft) ||
      !Array.isArray(payload.versions)) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_RULE_INSERT_TARGET_INVALID",
      "The rule-insert target proof required exact provider response and draft readback.",
      {}, 409,
    );
  }
  const activePayload = {
    active: payload.active,
    draft: null,
    versions: payload.versions,
    activeVersion: payload.activeVersion,
  };
  const active = normalizeVercelWafProviderConfiguration(activePayload, {
    stage: "BASELINE_CAPTURE",
    projectId: request.projectId,
    teamId: request.teamId,
    configurationVersion: request.baselineConfigurationVersion,
    runOwnedRuleName: request.runOwnedRuleName,
    runOwnedRuleNonce: request.runOwnedRuleNonce,
    runOwnedRuleFingerprint: request.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint: request.runOwnedInsertDocumentFingerprint,
    providerAssignedRuleId: null,
    baselineSemanticFingerprint: null,
    criticalSemanticFingerprint: null,
    candidateAliasOrigin: request.candidateAliasOrigin,
    candidateImmutableOrigin: request.candidateImmutableOrigin,
  });
  const draftConfig = payload.draft;
  const draftDocument = normalizeVercelWafConfigurationDocument(
    draftConfig,
    { draft: true },
  );
  const changes = Array.isArray(draftConfig.changes) ? draftConfig.changes : null;
  const draftRules = Array.isArray(draftConfig.rules) ? draftConfig.rules : null;
  const providerAssignedRuleId = clean(draftRules?.[0]?.id);
  const draftChangeRuleId = changes?.[0] && own(changes[0], "id") &&
    changes[0].id !== null ? clean(changes[0].id) : null;
  if (!SAFE_PROVIDER_ID.test(providerAssignedRuleId) ||
      !draftRules || draftRules.length !== 1 ||
      clean(draftRules[0]?.name) !== request.runOwnedRuleName ||
      !changes || changes.length !== 1 || changes[0]?.action !== "rules.insert" ||
      draftChangeRuleId !== null && draftChangeRuleId !== providerAssignedRuleId) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_RULE_INSERT_TARGET_INVALID",
      "The provider did not return one exact assigned rule in one pending draft.", {}, 409,
    );
  }
  const normalizedDraftConfig = {
    ...draftConfig,
    version: "DRAFT",
    rules: draftRules,
  };
  const draftPayload = {
    active: normalizedDraftConfig,
    draft: null,
    versions: [],
    activeVersion: structuredClone(normalizedDraftConfig),
  };
  const draft = normalizeVercelWafProviderConfiguration(draftPayload, {
    stage: "CRITICAL_ACTIVE",
    projectId: request.projectId,
    teamId: request.teamId,
    configurationVersion: "DRAFT",
    runOwnedRuleName: request.runOwnedRuleName,
    runOwnedRuleNonce: request.runOwnedRuleNonce,
    runOwnedRuleFingerprint: request.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint: request.runOwnedInsertDocumentFingerprint,
    providerAssignedRuleId,
    baselineSemanticFingerprint: request.baselineSemanticFingerprint,
    criticalSemanticFingerprint: null,
    candidateAliasOrigin: request.candidateAliasOrigin,
    candidateImmutableOrigin: request.candidateImmutableOrigin,
  });
  if (active.configurationIdentityFingerprint !==
        request.baselineConfigurationIdentityFingerprint ||
      active.sourceVersionReadFingerprint !==
        request.baselineSourceVersionReadFingerprint ||
      active.semanticConfigurationFingerprint !== request.baselineSemanticFingerprint ||
      active.orderedCustomRulesFingerprint !==
        request.baselineOrderedCustomRulesFingerprint ||
      active.customRuleCount !== 0 || draft.customRuleCount !== 1) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_RULE_INSERT_BASELINE_DRIFT",
      "The active baseline changed while the run-owned rule was staged.", {}, 409,
    );
  }
  if (draft.providerConfigurationId !== draftDocument.providerConfigurationId ||
      draft.providerOwnerId !== draftDocument.providerOwnerId ||
      draft.configurationVersion !== "DRAFT") {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_RULE_INSERT_TARGET_INVALID",
      "The pending provider draft did not retain its exact DRAFT identity.", {}, 409,
    );
  }
  return { active, draft, providerAssignedRuleId };
}

export function createVercelWafRuleInsertDispatchResult({
  request: requestInput,
  outcomeStatus: outcomeInput,
  providerResponse = null,
  providerResponseObserved: providerResponseObservedInput,
  providerResponseStatus = null,
  firewallPayload = null,
  privateKey,
  now = Date.now(),
} = {}) {
  const request = normalizeWafRuleInsertResultRequest(requestInput);
  const outcomeStatus = clean(outcomeInput).toUpperCase();
  const providerResponseObserved = providerResponseObservedInput === undefined
    ? providerResponse !== null : providerResponseObservedInput;
  if (!["TARGET_CONFIRMED", "OUTCOME_UNKNOWN", "PROVIDER_REJECTED"].includes(
    outcomeStatus,
  )) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_RULE_INSERT_OUTCOME_INVALID",
      "The rule-insert result outcome was invalid.", {}, 400,
    );
  }
  if (outcomeStatus === "TARGET_CONFIRMED" &&
      request.dispatchStep !== "CRITICAL_RULE_INSERT") {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_RULE_INSERT_OUTCOME_INVALID",
      "Only the rule-insert dispatch may carry this exact target proof.", {}, 400,
    );
  }
  if (typeof providerResponseObserved !== "boolean" ||
      (providerResponseObserved
        ? providerResponse === null : providerResponse !== null) ||
      (outcomeStatus === "PROVIDER_REJECTED" &&
        (!Number.isInteger(providerResponseStatus) ||
          providerResponseStatus < 400 || providerResponseStatus > 599 ||
          !providerResponseObserved || firewallPayload !== null)) ||
      (outcomeStatus !== "PROVIDER_REJECTED" &&
        providerResponseStatus !== null)) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_RULE_INSERT_REJECTION_INVALID",
      "The rejected provider result did not carry one exact HTTP rejection.", {}, 400,
    );
  }
  const selectedTime = new Date(Number(now));
  if (Number.isNaN(selectedTime.getTime())) {
    throw attestationError("STEP11_6_VERCEL_ATTESTATION_TIMESTAMP_INVALID",
      "The rule-insert result clock was invalid.", {}, 400);
  }
  const target = outcomeStatus === "TARGET_CONFIRMED"
    ? normalizeRuleInsertTargetReadback(request, providerResponse, firewallPayload)
    : null;
  if (outcomeStatus === "OUTCOME_UNKNOWN" &&
      (providerResponseObserved || firewallPayload !== null)) {
    throw attestationError(
      "STEP11_6_VERCEL_WAF_RULE_INSERT_UNKNOWN_TARGET_FORBIDDEN",
      "OUTCOME_UNKNOWN cannot carry target proof.", {}, 400,
    );
  }
  const signer = wafEvidenceSigner(privateKey);
  const signerKeyFingerprint = publicKeyFingerprint(createPublicKey(signer));
  const attestedAt = selectedTime.toISOString();
  const evidence = Object.freeze({
    ...request,
    schemaVersion: VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_SCHEMA,
    outcomeStatus,
    providerResponseObserved,
    providerResponseStatus: outcomeStatus === "PROVIDER_REJECTED"
      ? providerResponseStatus : null,
    providerResponseFingerprint: providerResponseObserved
      ? sha256(canonicalAttestationJson(providerResponse)) : null,
    providerReadbackFingerprint: target
      ? sha256(canonicalAttestationJson(firewallPayload)) : null,
    activeSemanticConfiguration: target?.active.semanticConfiguration ?? null,
    activeSemanticConfigurationFingerprint:
      target?.active.semanticConfigurationFingerprint ?? null,
    activeCustomRuleCount: target?.active.customRuleCount ?? null,
    activePendingDraftPresent: target ? false : null,
    draftSemanticConfiguration: target?.draft.semanticConfiguration ?? null,
    draftSemanticConfigurationFingerprint:
      target?.draft.semanticConfigurationFingerprint ?? null,
    draftOrderedCustomRulesFingerprint:
      target?.draft.orderedCustomRulesFingerprint ?? null,
    draftConfigurationVersion: target?.draft.configurationVersion ?? null,
    draftConfigurationIdentityFingerprint:
      target?.draft.configurationIdentityFingerprint ?? null,
    draftCustomRuleCount: target?.draft.customRuleCount ?? null,
    pendingDraftChangeCount: target ? 1 : null,
    providerAssignedRuleId: target?.providerAssignedRuleId ?? null,
    runOwnedProviderRuleDocumentFingerprint:
      target?.draft.runOwnedProviderRuleDocumentFingerprint ?? null,
    runOwnedRulePrecedence: target?.draft.runOwnedRulePrecedence ?? null,
    criticalWindowContractFingerprint:
      target?.draft.criticalWindowContractFingerprint ?? null,
    providerObservedAt: attestedAt,
    attestedAt,
    expiresAt: new Date(selectedTime.getTime() +
      VERCEL_PROVIDER_ATTESTATION_VALIDITY_SECONDS * 1_000).toISOString(),
  });
  const document = Object.freeze({
    schemaVersion: VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_ENVELOPE_SCHEMA,
    algorithm: VERCEL_PROVIDER_ATTESTATION_ALGORITHM,
    signerKeyVersion: VERCEL_PROVIDER_ATTESTATION_SIGNER_KEY_VERSION,
    signerKeyFingerprint,
    evidence,
  });
  const serialized = canonicalAttestationJson(document);
  return Object.freeze({
    ...document,
    evidenceFingerprint: sha256(serialized),
    signature: signDetached(null, Buffer.from(serialized), signer)
      .toString("base64url"),
  });
}

export function verifyVercelWafRuleInsertDispatchResult(envelope, {
  request: requestInput,
  env = process.env,
  now = Date.now(),
  initialMaxAgeSeconds = VERCEL_PROVIDER_ATTESTATION_INITIAL_MAX_AGE_SECONDS,
} = {}) {
  const request = normalizeWafRuleInsertResultRequest(requestInput);
  if (!exactKeys(envelope, [
    "schemaVersion", "algorithm", "signerKeyVersion", "signerKeyFingerprint",
    "evidence", "evidenceFingerprint", "signature",
  ]) || envelope.schemaVersion !==
      VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_ENVELOPE_SCHEMA ||
      envelope.algorithm !== VERCEL_PROVIDER_ATTESTATION_ALGORITHM ||
      envelope.signerKeyVersion !== VERCEL_PROVIDER_ATTESTATION_SIGNER_KEY_VERSION ||
      !HEX64.test(clean(envelope.signerKeyFingerprint).toLowerCase()) ||
      !HEX64.test(clean(envelope.evidenceFingerprint).toLowerCase()) ||
      !BASE64URL.test(clean(envelope.signature)) ||
      !exactKeys(envelope.evidence, WAF_RULE_INSERT_RESULT_KEYS)) {
    throw attestationError("STEP11_6_VERCEL_WAF_RULE_INSERT_ENVELOPE_INVALID",
      "The signed rule-insert result envelope was invalid.", {}, 400);
  }
  const evidence = envelope.evidence;
  const publicKey = publicKeyFromPinnedBase64(
    env[VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV],
  );
  const signerKeyFingerprint = publicKeyFingerprint(publicKey);
  const document = Object.freeze({
    schemaVersion: envelope.schemaVersion,
    algorithm: envelope.algorithm,
    signerKeyVersion: envelope.signerKeyVersion,
    signerKeyFingerprint: envelope.signerKeyFingerprint,
    evidence,
  });
  const serialized = canonicalAttestationJson(document);
  const requestFieldsMatch = WAF_RULE_INSERT_RESULT_REQUEST_KEYS
    .filter((key) => key !== "schemaVersion")
    .every((key) => evidence[key] === request[key]);
  const attested = Date.parse(exactTimestamp(evidence.attestedAt, "attestedAt"));
  const observed = Date.parse(exactTimestamp(
    evidence.providerObservedAt, "providerObservedAt",
  ));
  const expires = Date.parse(exactTimestamp(evidence.expiresAt, "expiresAt"));
  const current = Number(now);
  const target = evidence.outcomeStatus === "TARGET_CONFIRMED";
  const targetProofFields = [
    "providerReadbackFingerprint",
    "activeSemanticConfiguration", "activeSemanticConfigurationFingerprint",
    "activeCustomRuleCount", "activePendingDraftPresent",
    "draftSemanticConfiguration", "draftSemanticConfigurationFingerprint",
    "draftOrderedCustomRulesFingerprint", "draftConfigurationVersion",
    "draftConfigurationIdentityFingerprint", "draftCustomRuleCount",
    "pendingDraftChangeCount", "providerAssignedRuleId",
    "runOwnedProviderRuleDocumentFingerprint", "runOwnedRulePrecedence",
    "criticalWindowContractFingerprint",
  ];
  const activeSemanticHash = validWafSemanticConfiguration(
    evidence.activeSemanticConfiguration,
  ) ? sha256(canonicalAttestationJson(evidence.activeSemanticConfiguration)) : "";
  const activeRulesHash = validWafSemanticConfiguration(
    evidence.activeSemanticConfiguration,
  ) ? sha256(canonicalAttestationJson(
      evidence.activeSemanticConfiguration.orderedCustomRules,
    )) : "";
  const draftSemanticHash = validWafSemanticConfiguration(
    evidence.draftSemanticConfiguration,
  ) ? sha256(canonicalAttestationJson(evidence.draftSemanticConfiguration)) : "";
  const draftRulesHash = validWafSemanticConfiguration(
    evidence.draftSemanticConfiguration,
  ) ? sha256(canonicalAttestationJson(
      evidence.draftSemanticConfiguration.orderedCustomRules,
    )) : "";
  const draftRule = evidence.draftSemanticConfiguration?.orderedCustomRules?.[0];
  const draftProviderDocumentFingerprint = clean(
    draftRule?.providerRuleDocumentFingerprint,
  ).toLowerCase();
  const normalizedDraftRule = plain(draftRule) ? { ...draftRule } : null;
  if (normalizedDraftRule) delete normalizedDraftRule.providerRuleDocumentFingerprint;
  const expectedDraftRule = productionGoogleWriterCriticalWindowProviderRuleContract({
    ...request,
    runOwnedRuleName: request.runOwnedRuleName,
  });
  const targetShape = target
    ? typeof evidence.providerResponseObserved === "boolean" &&
      evidence.providerResponseStatus === null &&
      (evidence.providerResponseObserved
        ? HEX64.test(clean(evidence.providerResponseFingerprint))
        : evidence.providerResponseFingerprint === null) &&
      targetProofFields.every((key) => evidence[key] !== null) &&
      HEX64.test(clean(evidence.providerReadbackFingerprint)) &&
      activeSemanticHash === evidence.activeSemanticConfigurationFingerprint &&
      activeSemanticHash === request.baselineSemanticFingerprint &&
      activeRulesHash === request.baselineOrderedCustomRulesFingerprint &&
      baselineSemanticFingerprintFrom(evidence.draftSemanticConfiguration) ===
        request.baselineSemanticFingerprint &&
      draftSemanticHash === evidence.draftSemanticConfigurationFingerprint &&
      draftRulesHash === evidence.draftOrderedCustomRulesFingerprint &&
      canonicalAttestationJson(normalizedDraftRule) ===
        canonicalAttestationJson(expectedDraftRule) &&
      draftProviderDocumentFingerprint ===
        evidence.runOwnedProviderRuleDocumentFingerprint &&
      evidence.criticalWindowContractFingerprint ===
        expectedDraftRule.criticalWindowContractFingerprint &&
      evidence.activeCustomRuleCount === 0 &&
      evidence.activePendingDraftPresent === false &&
      evidence.draftConfigurationVersion === "DRAFT" &&
      HEX64.test(clean(evidence.draftConfigurationIdentityFingerprint)) &&
      evidence.draftCustomRuleCount === 1 &&
      evidence.pendingDraftChangeCount === 1 &&
      evidence.runOwnedRulePrecedence === 0 &&
      SAFE_PROVIDER_ID.test(clean(evidence.providerAssignedRuleId))
    : evidence.outcomeStatus === "OUTCOME_UNKNOWN"
      ? evidence.providerResponseObserved === false &&
        evidence.providerResponseStatus === null &&
        evidence.providerResponseFingerprint === null &&
        targetProofFields.every((key) => evidence[key] === null)
      : evidence.outcomeStatus === "PROVIDER_REJECTED" &&
        evidence.providerResponseObserved === true &&
        Number.isInteger(evidence.providerResponseStatus) &&
        evidence.providerResponseStatus >= 400 &&
        evidence.providerResponseStatus <= 599 &&
        HEX64.test(clean(evidence.providerResponseFingerprint)) &&
        targetProofFields.every((key) => evidence[key] === null);
  if (clean(env[VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]) !== request.teamId ||
      signerKeyFingerprint !== clean(envelope.signerKeyFingerprint).toLowerCase() ||
      sha256(serialized) !== clean(envelope.evidenceFingerprint).toLowerCase() ||
      !verifyDetached(null, Buffer.from(serialized), publicKey,
        Buffer.from(clean(envelope.signature), "base64url")) ||
      evidence.schemaVersion !== VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_SCHEMA ||
      !requestFieldsMatch || !targetShape || observed !== attested ||
      !Number.isFinite(current) || attested > current + 30_000 ||
      current - attested > initialMaxAgeSeconds * 1_000 || expires <= current ||
      expires - attested !== VERCEL_PROVIDER_ATTESTATION_VALIDITY_SECONDS * 1_000) {
    throw attestationError("STEP11_6_VERCEL_WAF_RULE_INSERT_RESULT_INVALID",
      "The signed rule-insert result was stale or did not match its dispatch.", {}, 409);
  }
  return Object.freeze({
    ...evidence,
    evidenceFingerprint: clean(envelope.evidenceFingerprint).toLowerCase(),
    signerKeyFingerprint,
    signerKeyVersion: envelope.signerKeyVersion,
    signatureVerified: true,
  });
}

function providerAttestationCreationOptions(optionsInput) {
  const candidate = optionsInput == null ? {} : optionsInput;
  let prototype;
  let descriptors;
  try {
    if ((typeof candidate !== "object" && typeof candidate !== "function") ||
        candidate === null || nodeTypes.isProxy(candidate)) {
      throw new TypeError("Provider attestation options must be non-Proxy data.");
    }
    prototype = Object.getPrototypeOf(candidate);
    descriptors = Object.getOwnPropertyDescriptors(candidate);
  } catch {
    throw attestationError(
      "STEP11_6_VERCEL_ENVIRONMENT_TEST_OVERRIDE_FORBIDDEN",
      "The provider-attestation dependency bundle could not be trusted.",
      {},
      500,
    );
  }
  const allowed = new Set([
    "request", "privateKey", "readApi", "now", "attestationId",
    "_testOnlyEnvironmentResourceReview",
  ]);
  const keys = Reflect.ownKeys(descriptors);
  const invalid = (prototype !== Object.prototype && prototype !== null) ||
    keys.some((key) => typeof key !== "string" || !allowed.has(key) ||
      typeof descriptors[key]?.get === "function" ||
      typeof descriptors[key]?.set === "function");
  if (invalid) {
    throw attestationError(
      "STEP11_6_VERCEL_ENVIRONMENT_TEST_OVERRIDE_FORBIDDEN",
      "The provider-attestation dependency bundle must use plain data properties.",
      {},
      500,
    );
  }
  return Object.freeze(Object.fromEntries(keys.map((key) =>
    [key, descriptors[key].value])));
}

export async function createVercelProviderAttestation(optionsInput = {}) {
  const options = providerAttestationCreationOptions(optionsInput);
  const requestInput = options.request;
  const privateKey = options.privateKey;
  const readApi = options.readApi;
  const now = options.now ?? Date.now();
  const attestationIdInput = options.attestationId ?? randomUUID();
  const _testOnlyEnvironmentResourceReview =
    options._testOnlyEnvironmentResourceReview;
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
  const [firewallPayload, firstDeploymentScope, firstAliasScope,
    environmentPayload] = await Promise.all([
    readApi(firewallApiPath(request)),
    collectVercelDeploymentScope(readApi, request),
    collectVercelAliasScope(readApi, request),
    readApi(environmentApiPath(request)),
  ]);
  // A single cursor walk can miss a deployment created at the head of the
  // project while older pages are being read. Require a second complete pass
  // to match the first exact full-provider census before signing either its
  // ten-field records or the six-field projection.
  const [deploymentScope, aliasScope] = await Promise.all([
    collectVercelDeploymentScope(readApi, request),
    collectVercelAliasScope(readApi, request),
  ]);
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
  if (firstAliasScope.count !== aliasScope.count ||
      firstAliasScope.fingerprint !== aliasScope.fingerprint ||
      canonicalAttestationJson(firstAliasScope.records) !==
        canonicalAttestationJson(aliasScope.records) ||
      firstAliasScope.pageCount !== aliasScope.pageCount ||
      firstAliasScope.paginationFingerprint !== aliasScope.paginationFingerprint) {
    throw attestationError(
      "STEP11_6_VERCEL_ALIAS_SCOPE_DRIFT",
      "The two exhaustive live Vercel alias passes did not match.",
      {},
      409,
    );
  }
  const firewall = normalizeVercelFirewallConfiguration(firewallPayload, request);
  if (_testOnlyEnvironmentResourceReview !== undefined &&
      clean(process.env.NODE_TEST_CONTEXT) !== "child-v8") {
    throw attestationError(
      "STEP11_6_VERCEL_ENVIRONMENT_TEST_OVERRIDE_FORBIDDEN",
      "The environment-review fixture override is unavailable outside Node's test runner.",
      {},
      500,
    );
  }
  const reviewedResourceReview = _testOnlyEnvironmentResourceReview ??
    buildVercelEnvironmentResourceReview(environmentPayload);
  const environmentScope = normalizeVercelEnvironmentScope(environmentPayload, {
    request,
    reviewedResourceReview,
  });
  const credentialConfinement = productionGoogleCredentialConfinementEvidence();
  if (credentialConfinement.originInventorySchemaVersion !==
      PRODUCTION_LEGACY_DEPLOYMENT_INVENTORY_SCHEMA ||
      credentialConfinement.originInventoryFingerprint !==
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
    routingRuleHostnameOperator: firewall.hostnameOperator,
    routingRuleCanonicalHostname: firewall.canonicalHostname,
    routingRuleEarlierActiveBypassRuleCount:
      firewall.earlierActiveBypassRuleCount,
    routingRuleCandidateControlHostCount:
      firewall.candidateControlHostCount,
    routingRuleCandidateControlHostsFingerprint:
      firewall.candidateControlHostsFingerprint,
    routingRuleCanonicalApexSafeMethodCount:
      firewall.canonicalApexSafeMethodCount,
    routingRuleCanonicalApexSafeMethodsFingerprint:
      firewall.canonicalApexSafeMethodsFingerprint,
    routingRuleCanonicalApexSafeMethodWriterRouteCount:
      firewall.canonicalApexSafeMethodWriterRouteCount,
    routingRuleCanonicalApexSafeMethodWriterRoutesFingerprint:
      firewall.canonicalApexSafeMethodWriterRoutesFingerprint,
    routingRuleCanonicalApexSafeMethodWriterPathRegex:
      firewall.canonicalApexSafeMethodWriterPathRegex,
    routingRuleGlobalInvocationQuiescenceProved:
      firewall.globalInvocationQuiescenceProved,
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
    aliasInventoryCount: aliasScope.count,
    aliasInventoryFingerprint: aliasScope.fingerprint,
    aliasInventoryRecords: aliasScope.records,
    aliasPaginationPageCount: aliasScope.pageCount,
    aliasPaginationFingerprint: aliasScope.paginationFingerprint,
    canonicalRoutingAliasRecordCount:
      aliasScope.canonicalRouting.recordCount,
    canonicalRoutingAliasRecordsFingerprint:
      aliasScope.canonicalRouting.recordsFingerprint,
    canonicalRoutingAliasPolicy: aliasScope.canonicalRouting.policy,
    redactedEnvironmentScopeRecordCount: environmentScope.recordCount,
    redactedEnvironmentScopeFingerprint: environmentScope.recordsFingerprint,
    redactedEnvironmentScopeRecords: environmentScope.records,
    providerEnvironmentRecordCount: environmentScope.providerEnvironmentRecordCount,
    hiddenProductionEnvironmentRecordCount:
      environmentScope.hiddenProductionEnvCount,
    reviewedEnvironmentResourceRecordCount:
      environmentScope.reviewedResourceRecordCount,
    reviewedEnvironmentResourceRecordsFingerprint:
      environmentScope.reviewedResourceRecordsFingerprint,
    reviewedEnvironmentResourceReviewFingerprint:
      environmentScope.reviewedResourceReviewFingerprint,
    reviewedEnvironmentResourceRecords:
      environmentScope.reviewedResourceRecords,
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
      aliasesDate: null,
      aliasesEtag: null,
      aliasesRequestId: null,
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
  "routingRuleHostnameOperator", "routingRuleCanonicalHostname",
  "routingRuleEarlierActiveBypassRuleCount",
  "routingRuleCandidateControlHostCount",
  "routingRuleCandidateControlHostsFingerprint",
  "routingRuleCanonicalApexSafeMethodCount",
  "routingRuleCanonicalApexSafeMethodsFingerprint",
  "routingRuleCanonicalApexSafeMethodWriterRouteCount",
  "routingRuleCanonicalApexSafeMethodWriterRoutesFingerprint",
  "routingRuleCanonicalApexSafeMethodWriterPathRegex",
  "routingRuleGlobalInvocationQuiescenceProved",
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
  "aliasInventoryCount", "aliasInventoryFingerprint", "aliasInventoryRecords",
  "aliasPaginationPageCount", "aliasPaginationFingerprint",
  "canonicalRoutingAliasRecordCount",
  "canonicalRoutingAliasRecordsFingerprint", "canonicalRoutingAliasPolicy",
  "redactedEnvironmentScopeRecordCount", "redactedEnvironmentScopeFingerprint",
  "redactedEnvironmentScopeRecords", "providerEnvironmentRecordCount",
  "hiddenProductionEnvironmentRecordCount",
  "reviewedEnvironmentResourceRecordCount",
  "reviewedEnvironmentResourceRecordsFingerprint",
  "reviewedEnvironmentResourceReviewFingerprint",
  "reviewedEnvironmentResourceRecords",
  "credentialConfinementEvidenceSchema",
  "credentialConfinementRecordCount", "credentialConfinementRecordsFingerprint",
  "credentialConfinementEvidenceFingerprint", "providerResponseMetadata",
  "providerObservedAt", "attestedAt", "expiresAt",
]);

function validProviderResponseMetadata(value, routingRuleEtag) {
  return exactKeys(value, [
    "transport", "responseHeadersAvailable", "firewallDate", "firewallEtag",
    "firewallRequestId", "deploymentsDate", "deploymentsEtag", "deploymentsRequestId",
    "aliasesDate", "aliasesEtag", "aliasesRequestId",
    "environmentDate", "environmentEtag", "environmentRequestId",
  ]) && value.transport === "VERCEL_CLI_JSON_BODY_V1" &&
    value.responseHeadersAvailable === false && value.firewallDate === null &&
    value.firewallEtag === routingRuleEtag && value.firewallRequestId === null &&
    value.deploymentsDate === null && value.deploymentsEtag === null &&
    value.deploymentsRequestId === null && value.environmentDate === null &&
    value.aliasesDate === null && value.aliasesEtag === null &&
    value.aliasesRequestId === null &&
    value.environmentEtag === null && value.environmentRequestId === null;
}

function normalizeSignedEnvironmentRecords(value, request, claim) {
  const envs = Array.isArray(value) ? value.map((record) => {
    if (!Array.isArray(record) || record.length !== 10) return {};
    return {
      id: record[0],
      key: record[1],
      type: record[2],
      target: record[3],
      gitBranch: record[4],
      createdAt: record[5],
      updatedAt: record[6],
      configurationId: record[7],
      visibility: record[8],
      decrypted: record[9],
    };
  }) : [];
  return normalizeVercelEnvironmentScope({
    envs,
    hiddenProductionEnvCount: claim.hiddenProductionEnvironmentRecordCount,
  }, {
    request,
    reviewedResourceReview:
      productionGoogleCredentialConfinementEvidence().providerEnvironmentResourceReview,
    providerEnvironmentRecordCount: claim.providerEnvironmentRecordCount,
  });
}

function validateSignedAliasInventoryRecords(value, request) {
  const records = Array.isArray(value) ? value.map((record) => {
    if (!Array.isArray(record) || record.length !== 5) return null;
    const alias = normalizedHostname(record[0]);
    const deployment = clean(record[1]);
    const deploymentOrigin = normalizedHostname(record[2], { requireVercel: true });
    const redirect = record[3] === null ? null : normalizedHostname(record[3]);
    const status = record[4] === null ? null : Number(record[4]);
    if (!alias || !DEPLOYMENT_ID.test(deployment) || !deploymentOrigin ||
        !(redirect === null && status === null ||
          redirect !== null && [301, 302, 307, 308].includes(status))) return null;
    return [alias, deployment, deploymentOrigin, redirect, status];
  }) : [];
  const aliases = records.map((record) => record?.[0]);
  const candidateAlias = new URL(request.candidateAliasOrigin).hostname;
  const course = records.filter((record) =>
    record?.[0] === VERCEL_PROVIDER_UNSAFE_COURSE_ALIAS_HOSTNAME);
  const candidate = records.filter((record) => record?.[0] === candidateAlias);
  if (records.length !== VERCEL_PROVIDER_ALIAS_INVENTORY_RECORD_COUNT ||
      records.some((record) => record === null) ||
      new Set(aliases).size !== records.length ||
      canonicalAttestationJson(records) !==
        canonicalAttestationJson([...records].sort((left, right) =>
          compare(left[0], right[0]))) ||
      course.length !== 1 ||
      canonicalAttestationJson(course[0]) !== canonicalAttestationJson([
        VERCEL_PROVIDER_UNSAFE_COURSE_ALIAS_HOSTNAME,
        VERCEL_PROVIDER_UNSAFE_COURSE_ALIAS_DEPLOYMENT_ID,
        VERCEL_PROVIDER_UNSAFE_COURSE_ALIAS_DEPLOYMENT_HOSTNAME,
        null,
        null,
      ]) || candidate.length !== 1 ||
      candidate[0][1] !== request.candidateDeploymentId ||
      candidate[0][2] !== new URL(request.candidateImmutableOrigin).hostname ||
      candidate[0][3] !== null || candidate[0][4] !== null) {
    throw attestationError(
      "STEP11_6_VERCEL_ALIAS_SCOPE_INVALID",
      "The signed Vercel alias inventory did not preserve the exact unsafe and candidate mappings.",
      {},
      409,
    );
  }
  const canonicalRouting = assertCanonicalRoutingAliasRecords(records, request);
  return Object.freeze({
    records: Object.freeze(records.map((record) => Object.freeze(record))),
    count: records.length,
    fingerprint: sha256(canonicalAttestationJson(records)),
    canonicalRouting,
  });
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
    claim,
  );
  const liveInventory = validateLiveProviderInventoryRecords(
    claim.liveProviderInventoryRecords, request,
  );
  const aliasInventory = validateSignedAliasInventoryRecords(
    claim.aliasInventoryRecords, request,
  );
  const criticalWindow = productionGoogleWriterCriticalWindowWafContract(request);
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
      claim.routingRuleHostnameOperator !== "DOES_NOT_EQUAL" ||
      claim.routingRuleCanonicalHostname !== PRODUCTION_CANONICAL_HOSTNAME ||
      claim.routingRuleEarlierActiveBypassRuleCount !== 0 ||
      claim.routingRuleCandidateControlHostCount !==
        criticalWindow.candidateControlHosts.hostCount ||
      claim.routingRuleCandidateControlHostsFingerprint !==
        criticalWindow.candidateControlHosts.hostsFingerprint ||
      claim.routingRuleCanonicalApexSafeMethodCount !==
        criticalWindow.canonicalApexContainment.allowedSafeMethods.length ||
      claim.routingRuleCanonicalApexSafeMethodsFingerprint !==
        criticalWindow.canonicalApexContainment.allowedSafeMethodsFingerprint ||
      claim.routingRuleCanonicalApexSafeMethodWriterRouteCount !==
        criticalWindow.canonicalApexContainment
          .exhaustiveHistoricalSafeMethodWriterRouteCount ||
      claim.routingRuleCanonicalApexSafeMethodWriterRoutesFingerprint !==
        criticalWindow.canonicalApexContainment
          .exhaustiveHistoricalSafeMethodWriterRoutesFingerprint ||
      claim.routingRuleCanonicalApexSafeMethodWriterPathRegex !==
        criticalWindow.canonicalApexContainment
          .exhaustiveHistoricalSafeMethodWriterPathRegex ||
      claim.routingRuleGlobalInvocationQuiescenceProved !== true ||
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
      claim.aliasInventoryCount !== aliasInventory.count ||
      claim.aliasInventoryFingerprint !== aliasInventory.fingerprint ||
      canonicalAttestationJson(claim.aliasInventoryRecords) !==
        canonicalAttestationJson(aliasInventory.records) ||
      !Number.isSafeInteger(claim.aliasPaginationPageCount) ||
      claim.aliasPaginationPageCount < 1 ||
      !HEX64.test(clean(claim.aliasPaginationFingerprint)) ||
      claim.canonicalRoutingAliasRecordCount !==
        aliasInventory.canonicalRouting.recordCount ||
      claim.canonicalRoutingAliasRecordsFingerprint !==
        aliasInventory.canonicalRouting.recordsFingerprint ||
      claim.canonicalRoutingAliasPolicy !==
        aliasInventory.canonicalRouting.policy ||
      claim.redactedEnvironmentScopeRecordCount !== environmentScope.recordCount ||
      claim.redactedEnvironmentScopeFingerprint !== environmentScope.recordsFingerprint ||
      claim.providerEnvironmentRecordCount !==
        environmentScope.providerEnvironmentRecordCount ||
      claim.hiddenProductionEnvironmentRecordCount !== 0 ||
      claim.hiddenProductionEnvironmentRecordCount !==
        environmentScope.hiddenProductionEnvCount ||
      claim.reviewedEnvironmentResourceRecordCount !==
        environmentScope.reviewedResourceRecordCount ||
      claim.reviewedEnvironmentResourceRecordsFingerprint !==
        environmentScope.reviewedResourceRecordsFingerprint ||
      claim.reviewedEnvironmentResourceReviewFingerprint !==
        environmentScope.reviewedResourceReviewFingerprint ||
      canonicalAttestationJson(claim.reviewedEnvironmentResourceRecords) !==
        canonicalAttestationJson(environmentScope.reviewedResourceRecords) ||
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
    candidateAliasOrigin: claim.candidateAliasOrigin,
    candidateImmutableOrigin: claim.candidateImmutableOrigin,
    routingRuleId: claim.routingRuleId,
    routingRuleConfigVersion: claim.routingRuleConfigVersion,
    routingRuleEtag: claim.routingRuleEtag,
    routingRuleFingerprint: claim.routingRuleFingerprint,
    routingRulePendingDraftChangeCount: claim.routingRulePendingDraftChangeCount,
    routingRuleHostnameOperator: claim.routingRuleHostnameOperator,
    routingRuleCanonicalHostname: claim.routingRuleCanonicalHostname,
    routingRuleEarlierActiveBypassRuleCount:
      claim.routingRuleEarlierActiveBypassRuleCount,
    routingRuleCandidateControlHostCount:
      claim.routingRuleCandidateControlHostCount,
    routingRuleCandidateControlHostsFingerprint:
      claim.routingRuleCandidateControlHostsFingerprint,
    routingRuleCanonicalApexSafeMethodCount:
      claim.routingRuleCanonicalApexSafeMethodCount,
    routingRuleCanonicalApexSafeMethodsFingerprint:
      claim.routingRuleCanonicalApexSafeMethodsFingerprint,
    routingRuleCanonicalApexSafeMethodWriterRouteCount:
      claim.routingRuleCanonicalApexSafeMethodWriterRouteCount,
    routingRuleCanonicalApexSafeMethodWriterRoutesFingerprint:
      claim.routingRuleCanonicalApexSafeMethodWriterRoutesFingerprint,
    routingRuleCanonicalApexSafeMethodWriterPathRegex:
      claim.routingRuleCanonicalApexSafeMethodWriterPathRegex,
    routingRuleGlobalInvocationQuiescenceProved:
      claim.routingRuleGlobalInvocationQuiescenceProved,
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
    aliasInventoryCount: aliasInventory.count,
    aliasInventoryFingerprint: aliasInventory.fingerprint,
    aliasInventoryRecords: aliasInventory.records,
    aliasPaginationPageCount: claim.aliasPaginationPageCount,
    aliasPaginationFingerprint: claim.aliasPaginationFingerprint,
    canonicalRoutingAliasRecordCount:
      aliasInventory.canonicalRouting.recordCount,
    canonicalRoutingAliasRecordsFingerprint:
      aliasInventory.canonicalRouting.recordsFingerprint,
    canonicalRoutingAliasPolicy: aliasInventory.canonicalRouting.policy,
    redactedEnvironmentScopeFingerprint: claim.redactedEnvironmentScopeFingerprint,
    providerEnvironmentRecordCount: claim.providerEnvironmentRecordCount,
    hiddenProductionEnvironmentRecordCount:
      claim.hiddenProductionEnvironmentRecordCount,
    reviewedEnvironmentResourceRecordCount:
      claim.reviewedEnvironmentResourceRecordCount,
    reviewedEnvironmentResourceRecordsFingerprint:
      claim.reviewedEnvironmentResourceRecordsFingerprint,
    reviewedEnvironmentResourceReviewFingerprint:
      claim.reviewedEnvironmentResourceReviewFingerprint,
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
