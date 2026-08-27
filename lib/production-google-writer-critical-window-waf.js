import { createHash } from "node:crypto";

import { PRODUCTION_CANONICAL_HOSTNAME } from "./production-shadow-candidate.js";

export const PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_WAF_SCHEMA =
  "production-google-writer-critical-window-waf-v2";
export const PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_PROVIDER_RULE_SCHEMA =
  "production-google-writer-critical-window-provider-rule-v2";
export const PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_VERCEL_INSERT_SCHEMA =
  "production-google-writer-critical-window-vercel-rules-insert-v1";
export const PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH =
  "/api/admin/step11-6-production-google-writer-fence";
export const PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_METHOD = "POST";
export const PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_COMPLEMENT_GROUP_COUNT = 5;
export const PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_SAFE_METHODS =
  Object.freeze(["GET", "HEAD", "OPTIONS"]);
export const PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_ROUTES =
  Object.freeze([
    "/api/admin/cms",
    "/api/admin/tournament",
    "/api/cron/round-scorecards-archive",
    "/api/director",
    "/api/player-passport/activation",
    "/api/player-passport/admin",
    "/api/player-passport/notifications",
    "/api/scoring/access",
    "/api/scoring/matches/[matchId]",
    "/api/tournament-guide",
  ]);
export const PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_ROUTES_FINGERPRINT =
  "8f3bcfaf2b8fd6825ce5fb56385b1a1aa2e23da7bfe96b42e7e9c3ec23f4bcd7";
// Vercel Request Path regex is evaluated against the normalized incoming path.
// This exact expression covers the nine static historical writer paths plus
// every concrete value of the one reviewed [matchId] segment.
export const PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_PATH_REGEX =
  "^/api/(?:admin/(?:cms|tournament)|cron/round-scorecards-archive|director|" +
  "player-passport/(?:activation|admin|notifications)|scoring/(?:access|" +
  "matches/[^/]+)|tournament-guide)/?$";

const clean = (value) => String(value ?? "").trim();
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizedVercelOrigin(value) {
  try {
    const parsed = new URL(clean(value));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        (parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash ||
        !parsed.hostname.toLowerCase().endsWith(".vercel.app")) return "";
    return `https://${parsed.hostname.toLowerCase()}`;
  } catch {
    return "";
  }
}

function contractError(message) {
  const error = new Error(message);
  error.code = "STEP11_6_WRITER_CRITICAL_WINDOW_WAF_SCOPE_INVALID";
  error.status = 409;
  return error;
}

export function productionGoogleWriterCriticalWindowCandidateHosts(value) {
  const candidateAliasOrigin = normalizedVercelOrigin(value?.candidateAliasOrigin);
  const candidateImmutableOrigin = normalizedVercelOrigin(
    value?.candidateImmutableOrigin,
  );
  if (!candidateAliasOrigin || !candidateImmutableOrigin ||
      candidateAliasOrigin === candidateImmutableOrigin) {
    throw contractError(
      "The signed candidate alias and immutable origins did not form two exact hosts.",
    );
  }
  const candidateAliasHostname = new URL(candidateAliasOrigin).hostname;
  const candidateImmutableHostname = new URL(candidateImmutableOrigin).hostname;
  const hostnames = [candidateAliasHostname, candidateImmutableHostname].sort(compare);
  const origins = [candidateAliasOrigin, candidateImmutableOrigin].sort(compare);
  if (hostnames.includes(PRODUCTION_CANONICAL_HOSTNAME) ||
      new Set(hostnames).size !== 2) {
    throw contractError(
      "The signed candidate control hosts overlapped the canonical hostname.",
    );
  }
  return deepFreeze({
    candidateAliasOrigin,
    candidateAliasHostname,
    candidateImmutableOrigin,
    candidateImmutableHostname,
    origins,
    originsFingerprint: sha256(JSON.stringify(origins)),
    hostnames,
    hostCount: 2,
    hostsFingerprint: sha256(JSON.stringify(hostnames)),
  });
}

export function productionGoogleWriterCriticalWindowWafContract(value) {
  const candidate = productionGoogleWriterCriticalWindowCandidateHosts(value);
  const base = {
    schemaVersion: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_WAF_SCHEMA,
    mode: "GLOBAL_WRITER_ADMISSION_STOP_WITH_EXACT_CANDIDATE_CONTROL_POST",
    action: "DENY",
    canonicalHostname: PRODUCTION_CANONICAL_HOSTNAME,
    candidateControlHosts: candidate,
    exactApplicationAuthenticatedException: {
      hostnames: candidate.hostnames,
      hostCount: candidate.hostCount,
      hostsFingerprint: candidate.hostsFingerprint,
      requestPath: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH,
      requestMethod: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_METHOD,
      applicationAuthenticationRequired: true,
      providerSignedCandidateAliasAndImmutableOriginsRequired: true,
    },
    canonicalApexContainment: {
      hostname: PRODUCTION_CANONICAL_HOSTNAME,
      allowedSafeMethods:
        PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_SAFE_METHODS,
      allowedSafeMethodsFingerprint: sha256(JSON.stringify(
        PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_SAFE_METHODS,
      )),
      everyOtherMethodDenied: true,
      exhaustiveHistoricalSafeMethodWriterRoutes:
        PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_ROUTES,
      exhaustiveHistoricalSafeMethodWriterRouteCount:
        PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_ROUTES.length,
      exhaustiveHistoricalSafeMethodWriterRoutesFingerprint:
        PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_ROUTES_FINGERPRINT,
      exhaustiveHistoricalSafeMethodWriterPathRegex:
        PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_PATH_REGEX,
      otherwiseSafeReadsAllowed: true,
      globalInvocationQuiescenceStartsOnlyAfterThisRuleIsProviderActive: true,
    },
    denyComplement: {
      conditionGroupRelation: "OR",
      conditionGroupCount:
        PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_COMPLEMENT_GROUP_COUNT,
      everyConditionWithinGroupRelation: "AND",
      everyOtherNoncanonicalHostPathMethodTupleDenied: true,
      canonicalApexMutationAndSafeMethodWriterTuplesDenied: true,
      conditionGroups: [{
        purpose: "DENY_EVERY_NONCANDIDATE_NONCANONICAL_HOST",
        canonicalHostnameOperator: "DOES_NOT_EQUAL",
        candidateHostnameOperator: "IS_NOT_ANY_OF",
      }, {
        purpose: "DENY_CANDIDATE_HOST_ON_EVERY_OTHER_PATH",
        candidateHostnameOperator: "IS_ANY_OF",
        requestPathOperator: "DOES_NOT_EQUAL",
      }, {
        purpose: "DENY_CANDIDATE_HOST_WITH_EVERY_OTHER_METHOD",
        candidateHostnameOperator: "IS_ANY_OF",
        requestMethodOperator: "DOES_NOT_EQUAL",
      }, {
        purpose: "DENY_CANONICAL_APEX_EVERY_NONSAFE_METHOD",
        canonicalHostnameOperator: "EQUALS",
        requestMethodOperator: "IS_NOT_ANY_OF",
      }, {
        purpose: "DENY_CANONICAL_APEX_EXHAUSTIVE_SAFE_METHOD_WRITER_PATHS",
        canonicalHostnameOperator: "EQUALS",
        requestPathOperator: "MATCHES_EXACT_REVIEWED_EXPRESSION",
      }],
    },
  };
  return deepFreeze({
    ...base,
    contractFingerprint: sha256(JSON.stringify(base)),
  });
}

export function productionGoogleWriterCriticalWindowProviderRuleContract(value) {
  const runOwnedRuleName = clean(value?.runOwnedRuleName || value?.routingRuleName);
  if (!/^[A-Za-z0-9 ._:-]{3,160}$/.test(runOwnedRuleName)) {
    throw contractError(
      "The temporary critical-window provider rule name was invalid.",
    );
  }
  const criticalWindow = productionGoogleWriterCriticalWindowWafContract(value);
  const base = {
    schemaVersion:
      PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_PROVIDER_RULE_SCHEMA,
    ownership: "RUN_OWNED_TEMPORARY",
    ruleName: runOwnedRuleName,
    precedence: 0,
    active: true,
    action: "DENY",
    conditionGroupRelation: "OR",
    conditionGroupCount:
      PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_COMPLEMENT_GROUP_COUNT,
    conditionGroups: criticalWindow.denyComplement.conditionGroups,
    candidateControlHostnames:
      criticalWindow.candidateControlHosts.hostnames,
    candidateControlHostsFingerprint:
      criticalWindow.candidateControlHosts.hostsFingerprint,
    controlPath:
      criticalWindow.exactApplicationAuthenticatedException.requestPath,
    controlMethod:
      criticalWindow.exactApplicationAuthenticatedException.requestMethod,
    canonicalHostname: PRODUCTION_CANONICAL_HOSTNAME,
    canonicalSafeMethods:
      criticalWindow.canonicalApexContainment.allowedSafeMethods,
    canonicalSafeMethodsFingerprint:
      criticalWindow.canonicalApexContainment.allowedSafeMethodsFingerprint,
    canonicalSafeMethodWriterPathRegex:
      criticalWindow.canonicalApexContainment
        .exhaustiveHistoricalSafeMethodWriterPathRegex,
    canonicalSafeMethodWriterRoutesFingerprint:
      criticalWindow.canonicalApexContainment
        .exhaustiveHistoricalSafeMethodWriterRoutesFingerprint,
    criticalWindowContractFingerprint: criticalWindow.contractFingerprint,
  };
  return deepFreeze({
    ...base,
    ruleFingerprint: sha256(
      `BAGGER_PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_RULE_V2\n${JSON.stringify(base)}`,
    ),
  });
}

function executableConditionGroups(criticalWindow) {
  const candidateHosts = criticalWindow.candidateControlHosts.hostnames;
  return [{ conditions: [{
    type: "host", op: "neq", value: PRODUCTION_CANONICAL_HOSTNAME,
  }, {
    type: "host", op: "inc", neg: true, value: [...candidateHosts],
  }] }, { conditions: [{
    type: "host", op: "inc", value: [...candidateHosts],
  }, {
    type: "path", op: "eq", neg: true,
    value: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH,
  }] }, { conditions: [{
    type: "host", op: "inc", value: [...candidateHosts],
  }, {
    type: "method", op: "neq",
    value: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_METHOD,
  }] }, { conditions: [{
    type: "host", op: "eq", value: PRODUCTION_CANONICAL_HOSTNAME,
  }, {
    type: "method", op: "ninc",
    value: [...PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_SAFE_METHODS],
  }] }, { conditions: [{
    type: "host", op: "eq", value: PRODUCTION_CANONICAL_HOSTNAME,
  }, {
    type: "path", op: "re",
    value: PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_APEX_WRITER_PATH_REGEX,
  }] }];
}

export function buildProductionGoogleWriterCriticalWindowVercelRuleInsert(value) {
  const runOwnedRuleName = clean(value?.runOwnedRuleName);
  const runOwnedRuleNonce = clean(value?.runOwnedRuleNonce).toLowerCase();
  if (!/^[A-Za-z0-9 ._:-]{3,160}$/.test(runOwnedRuleName) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        runOwnedRuleNonce,
      ) ||
      !runOwnedRuleName.toLowerCase().includes(runOwnedRuleNonce)) {
    throw contractError(
      "The run-owned Vercel rule name must contain its exact unique nonce.",
    );
  }
  const criticalWindow = productionGoogleWriterCriticalWindowWafContract(value);
  const ruleContract = productionGoogleWriterCriticalWindowProviderRuleContract({
    ...value,
    runOwnedRuleName,
  });
  const valueDocument = {
    name: runOwnedRuleName,
    description: `Bagger Step 11.6 critical writer window ${runOwnedRuleNonce}`,
    active: true,
    conditionGroup: executableConditionGroups(criticalWindow),
    action: { mitigate: { action: "deny" } },
  };
  const body = { action: "rules.insert", id: null, value: valueDocument };
  return deepFreeze({
    schemaVersion:
      PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_VERCEL_INSERT_SCHEMA,
    providerOperation: "PATCH /v1/security/firewall/config",
    topPrecedenceAfterInsert: true,
    baselineCustomRuleCountRequired: 0,
    pendingDraftChangeCountExpected: 1,
    runOwnedRuleName,
    runOwnedRuleNonce,
    runOwnedRuleFingerprint: ruleContract.ruleFingerprint,
    runOwnedInsertDocumentFingerprint: sha256(
      `BAGGER_VERCEL_RULES_INSERT_DOCUMENT_V1\n${JSON.stringify(body)}`,
    ),
    body,
  });
}

export function productionGoogleWriterCriticalWindowRequestDisposition(
  request,
  candidate,
) {
  const contract = productionGoogleWriterCriticalWindowWafContract(candidate);
  const hostname = clean(request?.hostname).toLowerCase();
  if (hostname === PRODUCTION_CANONICAL_HOSTNAME) {
    const method = clean(request?.method).toUpperCase();
    const path = clean(request?.path);
    if (!contract.canonicalApexContainment.allowedSafeMethods.includes(method) ||
        new RegExp(
          contract.canonicalApexContainment
            .exhaustiveHistoricalSafeMethodWriterPathRegex,
        ).test(path)) return "DENY";
    return "APEX_SAFE_READ_ALLOWED_DURING_GLOBAL_QUIESCE";
  }
  const exactCandidateHost = contract.candidateControlHosts.hostnames.includes(hostname);
  if (exactCandidateHost &&
      clean(request?.path) === PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_PATH &&
      clean(request?.method).toUpperCase() ===
        PRODUCTION_GOOGLE_WRITER_CRITICAL_WINDOW_CONTROL_METHOD) {
    return "APPLICATION_AUTHENTICATED_CONTROL_POST_EXCEPTION";
  }
  return "DENY";
}
