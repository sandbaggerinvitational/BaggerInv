import "server-only";

import { createHash } from "node:crypto";

import {
  calculateNetSkinsFromSupabaseView,
  NET_SKINS_ENGINE_VERSION,
} from "./net-skins-supabase.js";
import {
  assertProductionCutoverActivation,
  PRODUCTION_VERCEL_PROJECT_ID,
} from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_VERCEL_TEAM_ID,
} from "./production-maintenance-precommit-deployment-rebind.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";
import {
  PRODUCTION_NET_SKINS_V1_CONTRACT,
} from "./production-net-skins-v1.js";
import {
  productionScoringOperationsRpc,
  resolveProductionScoringDispatchContext,
} from "./production-scoring-operations-server.js";

const clean = (value) => String(value ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[0-9a-f]{64}$/;
const EXACT_ROUNDS = Object.freeze([1, 2, 3]);
const RPC_ALLOWLIST = new Set([
  "inspect_production_cutover_authority",
  "configure_production_net_skins_v1",
  "enqueue_production_net_skins_v1_recalculation",
  "claim_production_net_skins_v1_recalculation",
  "complete_production_net_skins_v1_recalculation",
  "fail_production_net_skins_v1_recalculation",
]);

function netSkinsError(code, message, status = 503, diagnostics = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (diagnostics !== undefined) error.diagnostics = diagnostics;
  return error;
}

function rpcHeaders(secret) {
  const headers = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  return headers;
}

function safeRpcFailureCode(payload) {
  const providerMessage = clean(payload?.message).toUpperCase();
  return /^PRODUCTION_NET_SKINS_[A-Z0-9_]{3,120}$/.test(providerMessage)
    ? providerMessage
    : "PRODUCTION_NET_SKINS_RPC_FAILED";
}

function exactInteger(value, code, { minimum = 0 } = {}) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum) {
    throw netSkinsError(code, "A current Net Skins revision is required.", 400);
  }
  return result;
}

function exactFingerprint(value, code = "PRODUCTION_NET_SKINS_REQUEST_FINGERPRINT_REQUIRED") {
  const result = clean(value).toLowerCase();
  if (!FINGERPRINT.test(result)) {
    throw netSkinsError(code, "An exact Net Skins request fingerprint is required.", 400);
  }
  return result;
}

function operationFingerprint(base, operation) {
  return createHash("sha256").update([
    PRODUCTION_NET_SKINS_V1_CONTRACT,
    clean(operation).toUpperCase(),
    exactFingerprint(base),
  ].join("\n")).digest("hex");
}

function annualOperationFingerprint(base, functionName, scoringDispatchContext) {
  return createHash("sha256").update([
    PRODUCTION_NET_SKINS_V1_CONTRACT,
    "ANNUAL_RUNTIME_V1",
    clean(functionName),
    exactFingerprint(base),
    clean(scoringDispatchContext?.runtime?.tournamentId),
    clean(scoringDispatchContext?.runtime?.runtimeGenerationId).toLowerCase(),
  ].join("\n")).digest("hex");
}

function exactRounds(value, { optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return [];
  if (!Array.isArray(value)) {
    throw netSkinsError(
      "PRODUCTION_NET_SKINS_ROUNDS_REQUIRED",
      "The exact Net Skins rounds are required.",
      400,
    );
  }
  const rounds = [...new Set(value.map(Number))].sort((left, right) => left - right);
  if (!rounds.length || rounds.some((round) => !EXACT_ROUNDS.includes(round))) {
    throw netSkinsError(
      "PRODUCTION_NET_SKINS_ROUNDS_REQUIRED",
      "Only the approved Production Net Skins rounds are supported.",
      400,
    );
  }
  return rounds;
}

function exactRuntimeScope(env, activation, extra = {}) {
  const epochId = clean(env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH).toLowerCase();
  if (!UUID.test(epochId)) {
    throw netSkinsError(
      "PRODUCTION_NET_SKINS_AUTHORITY_EPOCH_REQUIRED",
      "The active Production authority epoch is required.",
    );
  }
  return {
    ...(extra || {}),
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    deployment_commit: activation.resources.commitSha,
    deployment_id: clean(env.VERCEL_DEPLOYMENT_ID),
    vercel_project_id: PRODUCTION_VERCEL_PROJECT_ID,
    vercel_team_id: PRODUCTION_VERCEL_TEAM_ID,
    vercel_environment: "production",
    expected_epoch_id: epochId,
    read_contract: "ACTIVE_CUTOVER",
    cutover_phase: activation.maintenanceDeploymentCapability?.allowed
      ? activation.maintenanceDeploymentCapability.ceiling
      : activation.phase,
    deployment_capability_contract:
      activation.maintenanceDeploymentCapability?.allowed
        ? activation.maintenanceDeploymentCapability.contract
        : "",
    deployment_capability_ceiling:
      activation.maintenanceDeploymentCapability?.allowed
        ? activation.maintenanceDeploymentCapability.ceiling
        : "",
  };
}

/**
 * Fixed-resource service transport for the reviewed Production Net Skins V1
 * RPC allowlist. Callers cannot override the Production project, workbook,
 * tournament, deployment, authority epoch, or capability binding.
 */
export async function productionNetSkinsV1Rpc(functionName, input = {}, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  activation: suppliedActivation,
} = {}) {
  const name = clean(functionName);
  if (!RPC_ALLOWLIST.has(name)) {
    throw netSkinsError(
      "PRODUCTION_NET_SKINS_RPC_FORBIDDEN",
      "The Production Net Skins operation is not allowlisted.",
      403,
    );
  }
  const activation = suppliedActivation ||
    assertProductionCutoverActivation({ env, requiredPhase: "OBSERVATION" });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw netSkinsError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "The Production server credential is unavailable.",
    );
  }
  const scopedInput = exactRuntimeScope(env, activation, input);
  recordDataAuthorityTransport("supabase", {
    adapter: "production-net-skins-v1",
    source: name,
  });
  const startedAt = Date.now();
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: rpcHeaders(secret),
    body: JSON.stringify({ input: scopedInput }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = safeRpcFailureCode(payload);
    throw netSkinsError(
      code,
      `Production Net Skins RPC failed (${response.status}).`,
      response.status,
      { functionName: name, providerCode: code },
    );
  }
  return { ok: true, payload, durationMs: Date.now() - startedAt };
}

async function mutationContext({ env, dependencies }) {
  const activation = (dependencies.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const rpc = dependencies.rpc || productionNetSkinsV1Rpc;
  const inspected = await rpc("inspect_production_cutover_authority", {}, {
    env,
    activation,
    ...(dependencies.rpcOptions || {}),
  });
  const activationRevision = Number(inspected?.payload?.activation_revision);
  if (!inspected?.payload?.ok || !Number.isSafeInteger(activationRevision) || activationRevision < 0 ||
      clean(inspected.payload.authority).toUpperCase() !== "SUPABASE") {
    throw netSkinsError(
      "PRODUCTION_NET_SKINS_AUTHORITY_UNAVAILABLE",
      "The current Production Net Skins authority context is unavailable.",
      409,
    );
  }
  return { activation, activationRevision, rpc };
}

async function scoringDispatchContext({ env, dependencies, suppliedContext }) {
  if (suppliedContext) return suppliedContext;
  const resolve = dependencies.resolveScoringDispatchContext ||
    resolveProductionScoringDispatchContext;
  return resolve({
    requiredPhase: "OBSERVATION",
    env,
    ...(dependencies.scoringDispatchContextOptions || {}),
  });
}

async function mutationRpc(functionName, input, options = {}) {
  const env = options.env || process.env;
  const dependencies = options.dependencies || {};
  const dispatchContext = await scoringDispatchContext({
    env,
    dependencies,
    suppliedContext: options.scoringDispatchContext,
  });
  const annual = clean(dispatchContext?.runtime?.tournamentId) !==
    PRODUCTION_TOURNAMENT_ID;
  if (annual) {
    const rpc = dependencies.scoringRpc || productionScoringOperationsRpc;
    const result = await rpc(functionName, {
      ...(input || {}),
      request_fingerprint: annualOperationFingerprint(
        input?.request_fingerprint,
        functionName,
        dispatchContext,
      ),
    }, {
      env,
      scoringDispatchContext: dispatchContext,
      ...(dependencies.scoringRpcOptions || {}),
    });
    if (!result?.payload?.ok) {
      throw netSkinsError(
        clean(result?.payload?.code || "PRODUCTION_NET_SKINS_OPERATION_FAILED"),
        "The Production Net Skins operation did not complete.",
        409,
      );
    }
    return result.payload;
  }
  const context = await mutationContext({ env, dependencies });
  const result = await context.rpc(functionName, {
    ...(input || {}),
    expected_activation_revision: context.activationRevision,
  }, {
    env,
    activation: context.activation,
    ...(dependencies.rpcOptions || {}),
  });
  if (!result?.payload?.ok) {
    throw netSkinsError(
      clean(result?.payload?.code || "PRODUCTION_NET_SKINS_OPERATION_FAILED"),
      "The Production Net Skins operation did not complete.",
      409,
    );
  }
  return result.payload;
}

export async function configureProductionNetSkinsV1({
  actorAuthUserId,
  actorPlayerId,
  expectedConfigurationRevision,
  eligibleRoundNumbers = EXACT_ROUNDS,
  requestFingerprint,
} = {}, options = {}) {
  const authUserId = clean(actorAuthUserId).toLowerCase();
  const playerId = clean(actorPlayerId);
  if (!UUID.test(authUserId) || !playerId) {
    throw netSkinsError(
      "PRODUCTION_NET_SKINS_DIRECTOR_AUTHORIZATION_REQUIRED",
      "An active Production Director identity is required.",
      403,
    );
  }
  const rounds = exactRounds(eligibleRoundNumbers);
  if (rounds.length !== EXACT_ROUNDS.length || rounds.some((round, index) => round !== EXACT_ROUNDS[index])) {
    throw netSkinsError(
      "PRODUCTION_NET_SKINS_APPROVED_ROUNDS_REQUIRED",
      "The approved three-round Production Net Skins contract is required.",
      400,
    );
  }
  return mutationRpc("configure_production_net_skins_v1", {
    contract_version: PRODUCTION_NET_SKINS_V1_CONTRACT,
    expected_configuration_revision: exactInteger(
      expectedConfigurationRevision,
      "PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_REQUIRED",
    ),
    eligible_round_numbers: rounds,
    publication_policy: "OFFICIAL_ONLY",
    authorization: {
      tournament_id: PRODUCTION_TOURNAMENT_ID,
      auth_user_id: authUserId,
      player_id: playerId,
      role: "DIRECTOR",
    },
    request_fingerprint: operationFingerprint(requestFingerprint, "CONFIGURE"),
  }, options);
}

export async function enqueueProductionNetSkinsV1Recalculation({
  expectedConfigurationRevision,
  roundNumbers,
  reason = "EXPLICIT_RECALCULATION",
  requestedBy = "Production Net Skins worker",
  requestFingerprint,
} = {}, options = {}) {
  const rounds = exactRounds(roundNumbers, { optional: true });
  return mutationRpc("enqueue_production_net_skins_v1_recalculation", {
    expected_configuration_revision: exactInteger(
      expectedConfigurationRevision,
      "PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_REQUIRED",
      { minimum: 1 },
    ),
    ...(rounds.length ? { round_numbers: rounds } : {}),
    reason: clean(reason).slice(0, 120) || "EXPLICIT_RECALCULATION",
    requested_by: clean(requestedBy).slice(0, 180) || "Production Net Skins worker",
    request_fingerprint: operationFingerprint(requestFingerprint, "ENQUEUE"),
  }, options);
}

export async function processProductionNetSkinsV1Job({
  expectedConfigurationRevision,
  workerId = "production-net-skins-v1-worker",
  requestFingerprint,
} = {}, options = {}) {
  const configurationRevision = exactInteger(
    expectedConfigurationRevision,
    "PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_REQUIRED",
    { minimum: 1 },
  );
  const worker = clean(workerId).slice(0, 120);
  if (!worker) {
    throw netSkinsError(
      "PRODUCTION_NET_SKINS_WORKER_REQUIRED",
      "A bounded Production Net Skins worker identity is required.",
      400,
    );
  }
  const baseFingerprint = exactFingerprint(requestFingerprint);
  const env = options.env || process.env;
  const dependencies = options.dependencies || {};
  const dispatchContext = await scoringDispatchContext({
    env,
    dependencies,
    suppliedContext: options.scoringDispatchContext,
  });
  const scopedOptions = { ...options, scoringDispatchContext: dispatchContext };
  const claimed = await mutationRpc("claim_production_net_skins_v1_recalculation", {
    expected_configuration_revision: configurationRevision,
    worker_id: worker,
    lease_seconds: 60,
    request_fingerprint: operationFingerprint(baseFingerprint, "CLAIM"),
  }, scopedOptions);
  if (!claimed.job) return { ok: true, code: claimed.code, empty: true, job: null };

  const job = claimed.job;
  const roundNumber = exactInteger(
    job.round_number,
    "PRODUCTION_NET_SKINS_JOB_INVALID",
    { minimum: 1 },
  );
  const jobId = clean(job.job_id);
  const claimToken = clean(job.claim_token);
  const sourceFingerprint = exactFingerprint(
    job.source_fingerprint,
    "PRODUCTION_NET_SKINS_SOURCE_FINGERPRINT_REQUIRED",
  );
  try {
    if (clean(dispatchContext?.runtime?.tournamentId) !==
        PRODUCTION_TOURNAMENT_ID && (
      clean(job.tournament_id) !== clean(dispatchContext.runtime.tournamentId) ||
      clean(job.runtime_generation_id).toLowerCase() !==
        clean(dispatchContext.runtime.runtimeGenerationId).toLowerCase()
    )) {
      throw netSkinsError(
        "PRODUCTION_NET_SKINS_JOB_RUNTIME_MISMATCH",
        "The claimed Production Net Skins job is outside the current runtime.",
        409,
      );
    }
    if (!jobId || !claimToken || !claimed.calculation_input) {
      throw netSkinsError(
        "PRODUCTION_NET_SKINS_JOB_INVALID",
        "The claimed Production Net Skins job is incomplete.",
      );
    }
    // The Production manifest retains canonical Match IDs while the engine
    // input uses the established display-number compatibility adapter.
    const calculated = calculateNetSkinsFromSupabaseView(claimed.calculation_input);
    const resultPayload = (calculated.netSkins?.rounds || [])
      .find((round) => Number(round.round) === roundNumber);
    if (!resultPayload) {
      throw netSkinsError(
        "PRODUCTION_NET_SKINS_RESULT_REQUIRED",
        "The Net Skins engine did not produce the claimed round.",
      );
    }
    const result = await mutationRpc("complete_production_net_skins_v1_recalculation", {
      expected_configuration_revision: configurationRevision,
      expected_result_revision: exactInteger(
        job.expected_result_revision,
        "PRODUCTION_NET_SKINS_RESULT_REVISION_REQUIRED",
      ),
      job_id: jobId,
      claim_token: claimToken,
      worker_id: worker,
      source_fingerprint: sourceFingerprint,
      engine_version: NET_SKINS_ENGINE_VERSION,
      result_state: resultPayload.finalized === true ? "OFFICIAL" : "PROVISIONAL",
      result_payload: resultPayload,
      request_fingerprint: operationFingerprint(baseFingerprint, `COMPLETE:${jobId}`),
    }, scopedOptions);
    return { ...result, empty: false, calculation: calculated.canonicalInputVerification };
  } catch (error) {
    if (jobId && claimToken) {
      try {
        await mutationRpc("fail_production_net_skins_v1_recalculation", {
          expected_configuration_revision: configurationRevision,
          job_id: jobId,
          claim_token: claimToken,
          worker_id: worker,
          error_code: clean(error?.code || "PRODUCTION_NET_SKINS_CALCULATION_FAILED").slice(0, 120),
          error_safe: "Net Skins recalculation is temporarily unavailable.",
          request_fingerprint: operationFingerprint(baseFingerprint, `FAIL:${jobId}`),
        }, scopedOptions);
      } catch {
        // The original error remains authoritative; a lease timeout or a
        // newer job will safely make the failed claim stale.
      }
    }
    throw error;
  }
}

export async function drainProductionNetSkinsV1Jobs({
  expectedConfigurationRevision,
  maximum = 3,
  workerId,
  requestFingerprint,
} = {}, options = {}) {
  const limit = Math.max(1, Math.min(3, Number(maximum) || 1));
  const base = exactFingerprint(requestFingerprint);
  const env = options.env || process.env;
  const dependencies = options.dependencies || {};
  const dispatchContext = await scoringDispatchContext({
    env,
    dependencies,
    suppliedContext: options.scoringDispatchContext,
  });
  const scopedOptions = { ...options, scoringDispatchContext: dispatchContext };
  const results = [];
  for (let index = 0; index < limit; index += 1) {
    const result = await processProductionNetSkinsV1Job({
      expectedConfigurationRevision,
      workerId,
      requestFingerprint: operationFingerprint(base, `JOB:${index}`),
    }, scopedOptions);
    results.push(result);
    if (result.empty) break;
  }
  return {
    ok: true,
    processed: results.filter((result) => !result.empty).length,
    empty: results.at(-1)?.empty === true,
    results,
  };
}
