import "server-only";

import { createHash } from "node:crypto";

import {
  PRODUCTION_VERCEL_PROJECT_ID,
} from "./google-service-account-credential-context.js";
import {
  productionGoogleWriterProviderFenceControlDependencies,
} from "./production-google-writer-fence-receipt-server.js";
import {
  buildProductionGoogleWriterCriticalWindowVercelRuleInsert,
} from "./production-google-writer-critical-window-waf.js";
import {
  PRODUCTION_VERCEL_PROJECT_NAME,
} from "./production-shadow-candidate.js";
import {
  canonicalAttestationJson,
  createVercelWafProviderEvidence,
  createVercelWafRuleInsertDispatchResult,
  VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV,
  VERCEL_WAF_PROVIDER_EVIDENCE_REQUEST_SCHEMA,
  VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_REQUEST_SCHEMA,
} from "./vercel-provider-attestation.js";

export const PRODUCTION_VERCEL_WAF_EXECUTOR_TOKEN_ENV =
  "PRODUCTION_VERCEL_WAF_EXECUTOR_TOKEN";
export const PRODUCTION_VERCEL_WAF_EXECUTOR_SIGNING_PRIVATE_KEY_ENV =
  "PRODUCTION_VERCEL_WAF_EXECUTOR_SIGNING_PRIVATE_KEY";
export const PRODUCTION_VERCEL_WAF_EXECUTOR_ACTIONS = Object.freeze([
  "INSTALL", "REATTEST", "RESTORE", "RETIRE_REJECTED",
]);
const EXECUTOR_INPUT_KEYS = new Set([
  "action", "criticalWafEpochId", "fenceId", "operationRequestId",
  "quiescePurpose",
]);

const API_ORIGIN = "https://api.vercel.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const TEAM = /^team_[A-Za-z0-9]{8,80}$/;
const clean = (value) => String(value ?? "").trim();
const lower = (value) => clean(value).toLowerCase();
const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");
const sha256Bytes = (value) => createHash("sha256").update(value).digest("hex");

function executorError(code, message, diagnostics = {}, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.safeDiagnostics = Object.freeze({ ...diagnostics });
  return error;
}

function exactUuid(value, code) {
  const selected = lower(value);
  if (!UUID.test(selected)) throw executorError(code, "A WAF execution identity was invalid.", {}, 400);
  return selected;
}

function derivedUuid(namespace, label) {
  const chars = sha256(`BAGGER_VERCEL_WAF_EXECUTOR_V1\n${namespace}\n${label}`)
    .slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16], 16) % 4];
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-` +
    `${value.slice(16, 20)}-${value.slice(20)}`;
}

function value(payload, ...names) {
  for (const name of names) {
    const selected = clean(payload?.[name]);
    if (selected) return selected;
  }
  return "";
}

function exactCandidate(environment, env) {
  const resources = environment?.resources || {};
  const deploymentId = clean(env.VERCEL_DEPLOYMENT_ID);
  const commit = lower(resources.commitSha);
  const aliasOrigin = `https://${lower(resources.candidateHostname)}`;
  const immutableOrigin = `https://${lower(resources.deploymentHostname)}`;
  const teamId = clean(env[VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]);
  if (clean(env.VERCEL_ENV).toLowerCase() !== "preview" ||
      clean(env.VERCEL_PROJECT_ID) !== PRODUCTION_VERCEL_PROJECT_ID ||
      clean(env.VERCEL_PROJECT_NAME) !== PRODUCTION_VERCEL_PROJECT_NAME ||
      clean(resources.vercelProjectId) !== PRODUCTION_VERCEL_PROJECT_ID ||
      clean(resources.vercelProjectName) !== PRODUCTION_VERCEL_PROJECT_NAME ||
      !/^dpl_[A-Za-z0-9]{8,64}$/.test(deploymentId) || !HEX40.test(commit) ||
      !TEAM.test(teamId) ||
      !/^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(aliasOrigin) ||
      !/^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(immutableOrigin) ||
      aliasOrigin === immutableOrigin) {
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_CANDIDATE_INVALID",
      "The WAF executor is available only on the exact bagger-inv Preview candidate.",
      {},
      404,
    );
  }
  return Object.freeze({
    aliasOrigin, immutableOrigin, deploymentId, commit, teamId,
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
  });
}

function exactCredentials(env) {
  const token = clean(env[PRODUCTION_VERCEL_WAF_EXECUTOR_TOKEN_ENV]);
  const privateKey = clean(
    env[PRODUCTION_VERCEL_WAF_EXECUTOR_SIGNING_PRIVATE_KEY_ENV],
  ).replace(/\\n/g, "\n");
  if (token.length < 24 || !privateKey.startsWith("-----BEGIN PRIVATE KEY-----\n") ||
      !privateKey.endsWith("\n-----END PRIVATE KEY-----")) {
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_CREDENTIAL_REQUIRED",
      "The exact server-only Vercel WAF executor credential is unavailable.",
    );
  }
  return Object.freeze({ token, privateKey });
}

function providerUrl(candidate, suffix = "") {
  if (!new Set(["", "/draft", "/draft/activate"]).has(suffix) &&
      !/^\/[A-Za-z0-9_.:-]{1,160}(?:\/activate)?$/.test(suffix)) {
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_ENDPOINT_FORBIDDEN",
      "The WAF executor endpoint was outside its fixed allowlist.", {}, 500,
    );
  }
  const url = new URL(`/v1/security/firewall/config${suffix}`, API_ORIGIN);
  url.searchParams.set("projectId", candidate.projectId);
  url.searchParams.set("teamId", candidate.teamId);
  return url;
}

function assertProviderScope(payload, candidate, { allowDraft = true } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      !payload.active || payload.active.ownerId !== candidate.teamId ||
      (payload.projectId != null && payload.projectId !== candidate.projectId) ||
      (payload.teamId != null && payload.teamId !== candidate.teamId) ||
      (!allowDraft && payload.draft !== null)) {
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_PROVIDER_SCOPE_MISMATCH",
      "The Vercel WAF readback did not match the exact Production project and team.",
      {}, 409,
    );
  }
  return payload;
}

function providerClient({ candidate, credentials, fetchImpl }) {
  async function request(method, suffix, body) {
    let response;
    try {
      response = await fetchImpl(providerUrl(candidate, suffix), {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${credentials.token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return Object.freeze({ ambiguous: true, ok: false, status: 0, payload: null });
    }
    let payload = null;
    let bytes;
    try {
      bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > 2 * 1024 * 1024) throw new Error("oversized");
      const text = bytes.toString("utf8");
      payload = text ? JSON.parse(text) : {};
    } catch {
      if (!response.ok && bytes) {
        return Object.freeze({
          ambiguous: false,
          ok: false,
          status: response.status,
          payload: Object.freeze({
            schemaVersion: "bagger-vercel-provider-rejection-body-v1",
            bodyByteLength: bytes.byteLength,
            bodySha256: sha256Bytes(bytes),
          }),
        });
      }
      return Object.freeze({
        ambiguous: response.ok, ok: false, status: response.status, payload: null,
      });
    }
    return Object.freeze({
      ambiguous: false, ok: response.ok, status: response.status, payload,
    });
  }
  return Object.freeze({
    read: async () => {
      const result = await request("GET", "");
      if (!result.ok) throw executorError(
        "STEP11_6_VERCEL_WAF_EXECUTOR_READBACK_UNAVAILABLE",
        "The exact Vercel WAF provider readback was unavailable.",
        { providerOutcomeAmbiguous: result.ambiguous, providerStatus: result.status },
      );
      const activeEnvelope = assertProviderScope(result.payload, candidate);
      const activeVersion = clean(activeEnvelope.active.version);
      if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(activeVersion)) {
        throw executorError(
          "STEP11_6_VERCEL_WAF_EXECUTOR_READBACK_VERSION_INVALID",
          "The exact active Vercel WAF configuration version was invalid.",
          {},
          409,
        );
      }
      const versionResult = await request("GET", `/${activeVersion}`);
      if (!versionResult.ok || !plainProviderConfiguration(
        versionResult.payload,
        activeEnvelope.active,
        candidate,
      )) {
        throw executorError(
          "STEP11_6_VERCEL_WAF_EXECUTOR_READBACK_VERSION_MISMATCH",
          "The active Vercel WAF configuration could not be linked to its exact provider version.",
          {
            providerOutcomeAmbiguous: versionResult.ambiguous,
            providerStatus: versionResult.status,
          },
          409,
        );
      }
      return Object.freeze({
        ...activeEnvelope,
        projectId: candidate.projectId,
        teamId: candidate.teamId,
        versions: Object.freeze([activeVersion]),
        activeVersion: versionResult.payload,
      });
    },
    mutate: (suffix, body) => request("PATCH", suffix, body),
    activate: (version) => request("POST", `/${encodeURIComponent(version)}/activate`, {}),
  });
}

function plainProviderConfiguration(value, active, candidate) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    clean(value.version) === clean(active?.version) &&
    clean(value.id) === clean(active?.id) &&
    clean(value.ownerId) === candidate.teamId &&
    value.firewallEnabled === active?.firewallEnabled &&
    canonicalAttestationJson({
      rules: value.rules,
      ips: value.ips,
      crs: value.crs,
    }) === canonicalAttestationJson({
      rules: active?.rules,
      ips: active?.ips,
      crs: active?.crs,
    }));
}

function epochField(epoch, camel, snake) {
  return value(epoch, camel, snake);
}

function epochContract(epochId, candidate) {
  const nonce = derivedUuid(epochId, "run-owned-rule-nonce");
  const ruleName = `bagger-step11-6-writer-fence-${nonce}`;
  const insert = buildProductionGoogleWriterCriticalWindowVercelRuleInsert({
    candidateAliasOrigin: candidate.aliasOrigin,
    candidateImmutableOrigin: candidate.immutableOrigin,
    runOwnedRuleName: ruleName,
    runOwnedRuleNonce: nonce,
  });
  return Object.freeze({ nonce, ruleName, insert });
}

function evidenceRequest({
  stage, epochId, epoch, candidate, contract, configurationVersion,
  providerAssignedRuleId = null, transitionRequestId = null,
  identityLabel = stage,
}) {
  const baseline = stage === "BASELINE_CAPTURE";
  const restored = stage === "BASELINE_RESTORED";
  const criticalBound = stage === "CRITICAL_REATTEST" || restored;
  return Object.freeze({
    schemaVersion: VERCEL_WAF_PROVIDER_EVIDENCE_REQUEST_SCHEMA,
    evidenceRequestId: derivedUuid(epochId, `${identityLabel}-evidence-request`),
    wafEpochId: epochId,
    transitionRequestId: transitionRequestId ||
      derivedUuid(epochId, `${identityLabel}-transition-request`),
    stage,
    purpose: baseline ? "REHEARSAL" : epochField(epoch, "purpose", "purpose"),
    transitionMode: baseline
      ? "REHEARSAL" : epochField(epoch, "transitionMode", "transition_mode"),
    projectId: candidate.projectId,
    teamId: candidate.teamId,
    candidateAliasOrigin: candidate.aliasOrigin,
    candidateImmutableOrigin: candidate.immutableOrigin,
    candidateDeploymentId: candidate.deploymentId,
    candidateCommitSha: candidate.commit,
    candidateDeploymentTarget: "PREVIEW",
    runOwnedRuleName: contract.ruleName,
    runOwnedRuleNonce: contract.nonce,
    runOwnedRuleFingerprint: contract.insert.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint:
      contract.insert.runOwnedInsertDocumentFingerprint,
    providerAssignedRuleId,
    baselineEvidenceId: baseline ? null : derivedUuid(epochId, "baseline-evidence"),
    criticalEvidenceId: criticalBound
      ? derivedUuid(epochId, "critical-active-evidence") : null,
    baselineSemanticFingerprint: baseline ? null : lower(epochField(
      epoch, "baselineSemanticConfigurationFingerprint",
      "baseline_semantic_configuration_fingerprint",
    )),
    criticalSemanticFingerprint: criticalBound ? lower(epochField(
      epoch, "criticalSemanticConfigurationFingerprint",
      "critical_semantic_configuration_fingerprint",
    )) : null,
    baselineConfigurationVersion: baseline ? null : epochField(
      epoch, "baselineActiveConfigVersion", "baseline_active_config_version",
    ),
    baselineSourceVersionReadFingerprint: baseline ? null : lower(epochField(
      epoch, "baselineSourceVersionReadFingerprint",
      "baseline_source_version_read_fingerprint",
    )),
    expectedConfigurationVersion: clean(configurationVersion),
  });
}

function dispatchIdentity(epochId, step) {
  return Object.freeze({
    dispatchRequestId: derivedUuid(epochId, `${step}-dispatch-request`),
    transitionRequestId: derivedUuid(epochId, `${step}-transition-request`),
  });
}

function providerIntent(candidate, step, document) {
  return sha256(canonicalAttestationJson({
    schemaVersion: "bagger-vercel-waf-provider-intent-v1",
    projectId: candidate.projectId,
    teamId: candidate.teamId,
    step,
    document,
  }));
}

function dispatchResultRequest({
  epochId, epoch, candidate, contract, dispatch, step, providerIntentFingerprint,
}) {
  return Object.freeze({
    schemaVersion: VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_REQUEST_SCHEMA,
    dispatchResultId: derivedUuid(epochId, `${step}-dispatch-result`),
    dispatchId: lower(epochField(dispatch, "dispatchId", "dispatch_id")),
    dispatchRequestId: lower(epochField(dispatch,
      "dispatchRequestId", "dispatch_request_id")),
    wafEpochId: epochId,
    transitionRequestId: lower(epochField(dispatch,
      "transitionRequestId", "transition_request_id")),
    requestFingerprint: lower(epochField(dispatch,
      "requestFingerprint", "request_fingerprint")),
    dispatchStep: step,
    purpose: epochField(epoch, "purpose", "purpose"),
    transitionMode: epochField(epoch, "transitionMode", "transition_mode"),
    projectId: candidate.projectId,
    teamId: candidate.teamId,
    candidateAliasOrigin: candidate.aliasOrigin,
    candidateImmutableOrigin: candidate.immutableOrigin,
    candidateDeploymentId: candidate.deploymentId,
    candidateCommitSha: candidate.commit,
    candidateDeploymentTarget: "PREVIEW",
    baselineEvidenceId: derivedUuid(epochId, "baseline-evidence"),
    baselineConfigurationVersion: epochField(
      epoch, "baselineActiveConfigVersion", "baseline_active_config_version",
    ),
    baselineConfigurationEtag: epoch.baselineActiveConfigEtag ??
      epoch.baseline_active_config_etag ?? null,
    baselineConfigurationIdentityFingerprint: lower(epochField(
      epoch, "baselineConfigurationIdentityFingerprint",
      "baseline_configuration_identity_fingerprint",
    )),
    baselineSourceVersionReadFingerprint: lower(epochField(
      epoch, "baselineSourceVersionReadFingerprint",
      "baseline_source_version_read_fingerprint",
    )),
    baselineSemanticFingerprint: lower(epochField(
      epoch, "baselineSemanticConfigurationFingerprint",
      "baseline_semantic_configuration_fingerprint",
    )),
    baselineOrderedCustomRulesFingerprint: lower(epochField(
      epoch, "baselineOrderedRulesFingerprint", "baseline_ordered_rules_fingerprint",
    )),
    providerIntentFingerprint,
    runOwnedRuleName: contract.ruleName,
    runOwnedRuleNonce: contract.nonce,
    runOwnedRuleFingerprint: contract.insert.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint:
      contract.insert.runOwnedInsertDocumentFingerprint,
  });
}

function publicEpoch(epoch = {}, providerReadback = null) {
  const latestCriticalReattestObservationId = lower(epochField(
    epoch,
    "latestCriticalReattestObservationId",
    "latest_critical_reattest_observation_id",
  ));
  return Object.freeze({
    found: epoch.found !== false,
    epochId: lower(epochField(epoch, "epochId", "epoch_id")),
    status: epochField(epoch, "status", "status").toUpperCase(),
    baselineConfigurationVersion: epochField(
      epoch, "baselineActiveConfigVersion", "baseline_active_config_version",
    ),
    providerAssignedRuleId: epochField(
      epoch, "providerAssignedRuleId", "provider_assigned_rule_id",
    ),
    criticalActiveConfigurationVersion: clean(
      providerReadback?.active?.version,
    ),
    criticalActiveObservationId: lower(epochField(
      epoch, "criticalActiveObservationId", "critical_active_observation_id",
    )),
    criticalReattestObservationId: lower(epochField(
      epoch, "criticalReattestObservationId", "critical_reattest_observation_id",
    )) || latestCriticalReattestObservationId,
    latestCriticalReattestObservationId,
    criticalWindowActive: epoch.criticalWindowActive === true ||
      epoch.critical_window_active === true,
    baselineRestored: epoch.baselineRestored === true ||
      epoch.baseline_restored === true,
    rejectedRetired: epoch.rejectedRetired === true ||
      epoch.rejected_retired === true ||
      epochField(epoch, "status", "status").toUpperCase() === "REJECTED_RETIRED",
    retirementId: lower(epochField(
      epoch, "retirementId", "retirement_id",
    )),
    providerMutationPerformed: epoch.providerMutationPerformed === true ||
      epoch.provider_mutation_performed === true,
  });
}

function exactExecutorOptions(options = {}) {
  const test = clean(process.env.NODE_TEST_CONTEXT) === "child-v8";
  if (!test && (options.env || options.fetchImpl || options.control || options.now)) {
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_DEPENDENCY_INJECTION_FORBIDDEN",
      "The Production WAF executor dependencies are fixed server-side.", {}, 500,
    );
  }
  return Object.freeze({
    env: test && options.env ? options.env : process.env,
    fetchImpl: test && options.fetchImpl ? options.fetchImpl : globalThis.fetch,
    control: test ? options.control : null,
    now: test && options.now ? options.now : () => Date.now(),
  });
}

async function recordUnknown({
  control, credentials, request, dispatch, now,
}) {
  const envelope = createVercelWafRuleInsertDispatchResult({
    request,
    outcomeStatus: "OUTCOME_UNKNOWN",
    privateKey: credentials.privateKey,
    now: now(),
  });
  return control.recordCriticalWafDispatchResult({
    dispatchId: epochField(dispatch, "dispatchId", "dispatch_id"),
    dispatchResultEnvelope: envelope,
    dispatchResultRequest: request,
  });
}

async function recordRejected({
  control, credentials, request, dispatch, now, providerResult,
}) {
  const envelope = createVercelWafRuleInsertDispatchResult({
    request,
    outcomeStatus: "PROVIDER_REJECTED",
    providerResponse: providerResult.payload,
    providerResponseStatus: providerResult.status,
    privateKey: credentials.privateKey,
    now: now(),
  });
  return control.recordCriticalWafDispatchResult({
    dispatchId: epochField(dispatch, "dispatchId", "dispatch_id"),
    dispatchResultEnvelope: envelope,
    dispatchResultRequest: request,
  });
}

async function executeDispatch({
  control, provider, credentials, now, epochId, epoch, candidate, contract,
  step, mutation, targetEvidence,
}) {
  const identity = dispatchIdentity(epochId, step);
  const intent = providerIntent(candidate, step, mutation.document);
  const dispatch = await control.beginCriticalWafDispatch({
    epochId,
    ...identity,
    dispatchStep: step,
    providerIntentFingerprint: intent,
    ...(mutation.restore || {}),
  });
  const status = epochField(dispatch, "status", "status").toUpperCase();
  const usable = dispatch.dispatchUsable === true || dispatch.dispatch_usable === true;
  if (status === "TARGET_CONFIRMED") {
    return Object.freeze({ dispatch, recovered: true, mutated: false });
  }
  if (status === "PROVIDER_REJECTED") {
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_PROVIDER_REJECTED",
      "The durable Vercel WAF provider request was rejected and cannot be replayed.",
      {
        providerMutationAttempted: true,
        providerMutationPerformed: false,
        providerOutcomeAmbiguous: false,
      }, 409,
    );
  }
  if (status === "RESERVED" && !usable) {
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_RESERVED_DISPATCH_UNUSABLE",
      "The prior durable WAF reservation cannot be replayed.",
      { providerMutationPerformed: false, reconciliationRequired: true }, 409,
    );
  }
  const request = dispatchResultRequest({
    epochId, epoch, candidate, contract, dispatch, step,
    providerIntentFingerprint: intent,
  });
  let providerResult = null;
  if (status === "RESERVED") {
    await control.markCriticalWafDispatchStarted({
      dispatchId: request.dispatchId,
      dispatchRequestId: request.dispatchRequestId,
      transitionRequestId: request.transitionRequestId,
      requestFingerprint: request.requestFingerprint,
    });
    try {
      providerResult = await mutation.perform();
    } catch {
      providerResult = Object.freeze({
        ambiguous: true, ok: false, status: 0, payload: null,
      });
    }
    if (!providerResult || typeof providerResult !== "object" ||
        typeof providerResult.ok !== "boolean" ||
        typeof providerResult.ambiguous !== "boolean" ||
        !Number.isInteger(providerResult.status) ||
        !(providerResult.payload === null ||
          typeof providerResult.payload === "object")) {
      providerResult = Object.freeze({
        ambiguous: true, ok: false, status: 0, payload: null,
      });
    }
  } else if (!new Set(["PROVIDER_MUTATING", "OUTCOME_UNKNOWN"]).has(status)) {
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_DISPATCH_STATE_INVALID",
      "The durable WAF dispatch was not executable.", {}, 409,
    );
  }
  let target;
  try { target = await targetEvidence(request, providerResult); }
  catch {
    if (status !== "OUTCOME_UNKNOWN") {
      if (providerResult && !providerResult.ok && !providerResult.ambiguous &&
          providerResult.status >= 400 && providerResult.status <= 599) {
        await recordRejected({
          control, credentials, request, dispatch, now, providerResult,
        });
        throw executorError(
          "STEP11_6_VERCEL_WAF_EXECUTOR_PROVIDER_REJECTED",
          "The Vercel WAF provider rejected the exact module-owned request.",
          {
            providerMutationAttempted: true,
            providerMutationPerformed: false,
            providerOutcomeAmbiguous: false,
            providerStatus: providerResult.status,
          },
          409,
        );
      }
      await recordUnknown({ control, credentials, request, dispatch, now });
    }
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_OUTCOME_AMBIGUOUS",
      "The provider mutation outcome was ambiguous and requires exact readback reconciliation.",
      { providerOutcomeAmbiguous: true, reconciliationRequired: true }, 409,
    );
  }
  const recorded = await control.recordCriticalWafDispatchResult({
    dispatchId: request.dispatchId,
    ...target,
  });
  return Object.freeze({
    dispatch,
    result: recorded,
    recovered: status !== "RESERVED",
    mutated: status === "RESERVED",
  });
}

async function executeInstall(context) {
  const { control, provider, credentials, now, epochId, candidate, contract,
    operationRequestId, environment } = context;
  let epoch = await control.inspectCriticalWafEpoch({ epochId, environment });
  if (epoch.found === false) {
    const baseline = await provider.read();
    if (baseline.draft !== null || baseline.active.rules?.length !== 0) {
      throw executorError(
        "STEP11_6_VERCEL_WAF_EXECUTOR_BASELINE_INVALID",
        "The exact zero-rule Vercel baseline was not available.", {}, 409,
      );
    }
    const request = evidenceRequest({
      stage: "BASELINE_CAPTURE", epochId, epoch: {}, candidate, contract,
      configurationVersion: baseline.active.version,
    });
    const envelope = createVercelWafProviderEvidence({
      request, firewallPayload: baseline, privateKey: credentials.privateKey,
      now: now(), evidenceId: derivedUuid(epochId, "baseline-evidence"),
    });
    epoch = await control.beginCriticalWafEpoch({
      evidenceEnvelope: envelope,
      evidenceRequest: request,
      environment,
      epochRequestId: operationRequestId,
      baselineObservationRequestId: derivedUuid(epochId, "baseline-observation"),
    });
  }
  const insertMutation = Object.freeze({
    document: contract.insert,
    perform: () => provider.mutate("", contract.insert.body),
  });
  let criticalReadback = null;
  await executeDispatch({
    ...context, epoch, step: "CRITICAL_RULE_INSERT", mutation: insertMutation,
    targetEvidence: async (request, providerResult) => {
      const readback = await provider.read();
      const envelope = createVercelWafRuleInsertDispatchResult({
        request, outcomeStatus: "TARGET_CONFIRMED",
        providerResponse: providerResult?.payload ?? null,
        providerResponseObserved: providerResult !== null,
        firewallPayload: readback,
        privateKey: credentials.privateKey, now: now(),
      });
      return {
        dispatchResultEnvelope: envelope,
        dispatchResultRequest: request,
      };
    },
  });
  epoch = await control.inspectCriticalWafEpoch({ epochId, environment });
  const providerAssignedRuleId = epochField(
    epoch, "providerAssignedRuleId", "provider_assigned_rule_id",
  );
  if (!providerAssignedRuleId) throw executorError(
    "STEP11_6_VERCEL_WAF_EXECUTOR_RULE_ID_UNAVAILABLE",
    "The durable run-owned provider rule identity was unavailable.", {}, 409,
  );
  await executeDispatch({
    ...context,
    epoch,
    step: "CRITICAL_DRAFT_ACTIVATE",
    mutation: {
      document: { action: "activate", version: "draft" },
      perform: () => provider.activate("draft"),
    },
    targetEvidence: async (dispatchRequest) => {
      const readback = await provider.read();
      criticalReadback = readback;
      const request = evidenceRequest({
        stage: "CRITICAL_ACTIVE", epochId, epoch, candidate, contract,
        providerAssignedRuleId, configurationVersion: readback.active.version,
        transitionRequestId: dispatchRequest.transitionRequestId,
      });
      const envelope = createVercelWafProviderEvidence({
        request, firewallPayload: readback, privateKey: credentials.privateKey,
        now: now(), evidenceId: derivedUuid(epochId, "critical-active-evidence"),
      });
      return {
        wafEvidenceEnvelope: envelope,
        wafEvidenceRequest: request,
        observationRequestId: derivedUuid(epochId, "critical-active-observation"),
      };
    },
  });
  epoch = await control.inspectCriticalWafEpoch({ epochId, environment });
  if (!criticalReadback) criticalReadback = await provider.read();
  return Object.freeze({
    ok: true,
    action: "install-vercel-waf-provider-fence",
    providerReadbackVerified: true,
    providerMutationCoupled: true,
    secretsExposed: false,
    wafEpoch: publicEpoch(epoch, criticalReadback),
  });
}

async function executeRestore(context, input) {
  const { control, provider, credentials, now, epochId, candidate, contract,
    environment, operationRequestId } = context;
  let epoch = await control.inspectCriticalWafEpoch({ epochId, environment });
  if (epoch.found === false) throw executorError(
    "STEP11_6_VERCEL_WAF_EXECUTOR_EPOCH_NOT_FOUND",
    "The exact durable WAF epoch was not found.", {}, 409,
  );
  const baselineVersion = epochField(
    epoch, "baselineActiveConfigVersion", "baseline_active_config_version",
  );
  const restoreFingerprint = providerIntent(candidate, "BASELINE_VERSION_ACTIVATE", {
    action: "activate", version: baselineVersion,
  });
  const result = await executeDispatch({
    ...context,
    epoch,
    step: "BASELINE_VERSION_ACTIVATE",
    mutation: {
      document: { action: "activate", version: baselineVersion },
      restore: {
        restoreRequestId: operationRequestId,
        restoreRequestFingerprint: restoreFingerprint,
      },
      perform: () => provider.activate(baselineVersion),
    },
    targetEvidence: async (dispatchRequest) => {
      const readback = await provider.read();
      const request = evidenceRequest({
        stage: "BASELINE_RESTORED", epochId, epoch, candidate, contract,
        configurationVersion: readback.active.version,
        transitionRequestId: dispatchRequest.transitionRequestId,
      });
      const envelope = createVercelWafProviderEvidence({
        request, firewallPayload: readback, privateKey: credentials.privateKey,
        now: now(), evidenceId: derivedUuid(epochId, "baseline-restored-evidence"),
      });
      return {
        wafEvidenceEnvelope: envelope,
        wafEvidenceRequest: request,
        observationRequestId: derivedUuid(epochId, "baseline-restored-observation"),
      };
    },
  });
  epoch = await control.inspectCriticalWafEpoch({ epochId, environment });
  const observationId = epochField(
    result.result, "providerResultObservationId", "provider_result_observation_id",
  ) || epochField(epoch,
    "baselineRestoredObservationId", "baseline_restored_observation_id");
  if (observationId) {
    await control.finalizeWafBaselineRestore({
      fenceId: exactUuid(input.fenceId, "STEP11_6_VERCEL_WAF_EXECUTOR_FENCE_ID_INVALID"),
      epochId,
      baselineRestoredObservationId: observationId,
    });
    epoch = await control.inspectCriticalWafEpoch({ epochId, environment });
  }
  return Object.freeze({
    ok: true,
    action: "restore-vercel-waf-provider-baseline",
    providerReadbackVerified: true,
    providerMutationCoupled: true,
    secretsExposed: false,
    wafEpoch: publicEpoch(epoch),
  });
}

async function executeReattest(context) {
  const { control, provider, credentials, now, epochId, candidate, contract,
    environment, operationRequestId } = context;
  let epoch = await control.inspectCriticalWafEpoch({ epochId, environment });
  if (epoch.found === false) throw executorError(
    "STEP11_6_VERCEL_WAF_EXECUTOR_EPOCH_NOT_FOUND",
    "The exact durable WAF epoch was not found.", {}, 409,
  );
  const existingObservationId = epochField(
    epoch,
    "latestCriticalReattestObservationId",
    "latest_critical_reattest_observation_id",
  );
  if (existingObservationId) {
    return Object.freeze({
      ok: true,
      action: "reattest-vercel-waf-provider-fence",
      providerReadbackVerified: true,
      providerMutationCoupled: false,
      idempotent: true,
      secretsExposed: false,
      wafEpoch: publicEpoch(epoch),
    });
  }
  if (epochField(epoch, "status", "status").toUpperCase() !== "FENCE_BOUND") {
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_REATTEST_STATE_INVALID",
      "The critical WAF can be reattested only after it is durably fence-bound.",
      {}, 409,
    );
  }
  const providerAssignedRuleId = epochField(
    epoch, "providerAssignedRuleId", "provider_assigned_rule_id",
  );
  if (!providerAssignedRuleId) throw executorError(
    "STEP11_6_VERCEL_WAF_EXECUTOR_RULE_ID_UNAVAILABLE",
    "The durable run-owned provider rule identity was unavailable.", {}, 409,
  );
  const readback = await provider.read();
  const request = evidenceRequest({
    stage: "CRITICAL_REATTEST",
    epochId,
    epoch,
    candidate,
    contract,
    providerAssignedRuleId,
    configurationVersion: readback.active.version,
    transitionRequestId: operationRequestId,
  });
  const envelope = createVercelWafProviderEvidence({
    request,
    firewallPayload: readback,
    privateKey: credentials.privateKey,
    now: now(),
    evidenceId: derivedUuid(epochId, "critical-reattest-evidence"),
  });
  epoch = await control.recordCriticalWafReattestation({
    evidenceEnvelope: envelope,
    evidenceRequest: request,
    observationRequestId: derivedUuid(
      epochId, "critical-reattest-observation",
    ),
  });
  return Object.freeze({
    ok: true,
    action: "reattest-vercel-waf-provider-fence",
    providerReadbackVerified: true,
    providerMutationCoupled: false,
    idempotent: false,
    secretsExposed: false,
    wafEpoch: publicEpoch(epoch, readback),
  });
}

async function executeRetireRejected(context) {
  const { control, provider, credentials, now, epochId, candidate, contract,
    environment, operationRequestId } = context;
  const epoch = await control.inspectCriticalWafEpoch({ epochId, environment });
  if (epoch.found === false) throw executorError(
    "STEP11_6_VERCEL_WAF_EXECUTOR_EPOCH_NOT_FOUND",
    "The exact durable WAF epoch was not found.", {}, 409,
  );
  const status = epochField(epoch, "status", "status").toUpperCase();
  if (!new Set(["ACTIVATION_PENDING", "REJECTED_RETIRED"]).has(status)) {
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_RETIRE_STATE_INVALID",
      "Only a provider-rejected, pre-mutation WAF epoch can be retired.", {}, 409,
    );
  }
  const baseline = await provider.read();
  const baselineVersion = epochField(
    epoch, "baselineActiveConfigVersion", "baseline_active_config_version",
  );
  if (baseline.draft !== null || baseline.active.rules?.length !== 0 ||
      clean(baseline.active.version) !== clean(baselineVersion)) {
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_RETIRE_BASELINE_MISMATCH",
      "The current Vercel WAF provider state did not exactly match the captured baseline.",
      { providerMutationPerformed: false, reconciliationRequired: true },
      409,
    );
  }
  const request = evidenceRequest({
    stage: "BASELINE_CAPTURE",
    identityLabel: "REJECTED-RETIREMENT-BASELINE",
    epochId,
    epoch,
    candidate,
    contract,
    configurationVersion: baseline.active.version,
    transitionRequestId: operationRequestId,
  });
  const envelope = createVercelWafProviderEvidence({
    request,
    firewallPayload: baseline,
    privateKey: credentials.privateKey,
    now: now(),
    evidenceId: derivedUuid(epochId, "rejected-retirement-baseline-evidence"),
  });
  const retired = await control.retireRejectedCriticalWafEpoch({
    epochId,
    environment,
    retirementRequestId: operationRequestId,
    freshBaselineObservationRequestId: derivedUuid(
      epochId, "rejected-retirement-baseline-observation",
    ),
    evidenceEnvelope: envelope,
    evidenceRequest: request,
  });
  return Object.freeze({
    ok: true,
    action: "retire-rejected-vercel-waf-provider-epoch",
    providerReadbackVerified: true,
    providerMutationCoupled: false,
    providerMutationPerformed: false,
    secretsExposed: false,
    wafEpoch: publicEpoch(retired, baseline),
  });
}

export async function executeProductionVercelWafProviderAction(
  input = {},
  { environment, authorization, ...optionsInput } = {},
) {
  const options = exactExecutorOptions(optionsInput);
  if (!input || Array.isArray(input) || typeof input !== "object" ||
      Object.keys(input).some((key) => !EXECUTOR_INPUT_KEYS.has(key)) ||
      clean(input.quiescePurpose).toUpperCase() !== "REHEARSAL") {
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_INPUT_INVALID",
      "The Vercel WAF executor accepted only its fixed rehearsal contract.", {}, 400,
    );
  }
  const env = options.env;
  const candidate = exactCandidate(environment, env);
  const credentials = exactCredentials(env);
  const action = clean(input.action).toUpperCase();
  if (!PRODUCTION_VERCEL_WAF_EXECUTOR_ACTIONS.includes(action)) {
    throw executorError(
      "STEP11_6_VERCEL_WAF_EXECUTOR_ACTION_INVALID",
      "The Vercel WAF executor action was invalid.", {}, 400,
    );
  }
  const epochId = exactUuid(
    input.criticalWafEpochId,
    "STEP11_6_VERCEL_WAF_EXECUTOR_EPOCH_ID_INVALID",
  );
  const operationRequestId = exactUuid(
    input.operationRequestId,
    "STEP11_6_VERCEL_WAF_EXECUTOR_REQUEST_ID_INVALID",
  );
  const control = options.control ||
    productionGoogleWriterProviderFenceControlDependencies({ authorization });
  const context = Object.freeze({
    control,
    provider: providerClient({
      candidate, credentials, fetchImpl: options.fetchImpl,
    }),
    credentials,
    now: options.now,
    epochId,
    operationRequestId,
    candidate,
    contract: epochContract(epochId, candidate),
    environment,
  });
  if (action === "INSTALL") return executeInstall(context);
  if (action === "REATTEST") return executeReattest(context);
  if (action === "RETIRE_REJECTED") return executeRetireRejected(context);
  return executeRestore(context, input);
}
