import "server-only";

import {
  buildOddsCalculationInvocation,
  certifyOddsCalculationReference,
  processOddsCalculationJob,
} from "./championship-odds-resilience.js";
import {
  oddsEngineInputsFromBundle,
  readOddsInputBundle,
} from "./championship-odds-supabase.js";
import {
  PRODUCTION_ODDS_CALCULATION_WORKER,
  productionOddsCalculationDependencies,
  productionOddsCalculationRequestInput,
  productionOddsCalculationScope,
} from "./production-odds-calculation-contract.js";
import {
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";

const clean = (value) => String(value ?? "").trim();

const RPC_ALLOWLIST = new Set([
  "configure_production_odds_calculation_runtime",
  "request_production_odds_calculation_job",
  "claim_production_odds_calculation_job",
  "checkpoint_production_odds_calculation_job",
  "complete_production_odds_calculation_job",
  "fail_production_odds_calculation_job",
  "supersede_production_odds_calculation_job",
  "read_production_odds_calculation_jobs",
]);

function rpcHeaders(secret) {
  const headers = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  return headers;
}

function operationError(code, message, diagnostics = {}, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.diagnostics = diagnostics;
  return error;
}

export async function productionOddsCalculationRpc(functionName, input = {}, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 20_000,
} = {}) {
  const name = clean(functionName);
  if (!RPC_ALLOWLIST.has(name)) {
    throw operationError(
      "PRODUCTION_ODDS_CALCULATION_RPC_FORBIDDEN",
      "The Production Odds calculation RPC is not allowlisted.",
      { functionName: name },
      403,
    );
  }
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw operationError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "The Production server credential is unavailable.",
    );
  }
  const body = productionOddsCalculationScope(env, input);
  recordDataAuthorityTransport("supabase", {
    adapter: "production-odds-calculation",
    source: name,
  });
  const startedAt = Date.now();
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: rpcHeaders(secret),
    body: JSON.stringify({ input: body }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw operationError(
      "PRODUCTION_ODDS_CALCULATION_RPC_FAILED",
      `Production Odds calculation RPC failed (${response.status}).`,
      { functionName: name, status: response.status, code: clean(payload?.code || payload?.message) },
      response.status,
    );
  }
  return { ok: true, payload, durationMs: Date.now() - startedAt };
}

export async function loadProductionOddsCalculationInputs(
  tournamentId = PRODUCTION_TOURNAMENT_ID,
  { env = process.env, readInputs = readOddsInputBundle } = {},
) {
  if (clean(tournamentId) !== PRODUCTION_TOURNAMENT_ID) {
    throw operationError(
      "PRODUCTION_ODDS_TOURNAMENT_SCOPE_REQUIRED",
      "The exact Production tournament is required.",
      {},
      400,
    );
  }
  const result = await readInputs(PRODUCTION_TOURNAMENT_ID, { env });
  if (!result.payload?.ok || !result.payload?.data?.input_configuration) {
    throw operationError(
      clean(result.payload?.code || "PRODUCTION_ODDS_INPUTS_UNAVAILABLE"),
      "Production Championship Odds inputs are unavailable.",
    );
  }
  return {
    ...oddsEngineInputsFromBundle(result.payload.data),
    configuration: result.payload.data.input_configuration,
    diagnostics: {
      queryMs: Number(result.payload.data.query_ms || 0),
      serviceMs: Number(result.durationMs || 0),
    },
  };
}

export async function configureProductionOddsCalculationRuntime({
  enabled,
  actorId,
  expectedActivationRevision,
  requestFingerprint,
} = {}, options = {}) {
  return productionOddsCalculationRpc(
    "configure_production_odds_calculation_runtime",
    {
      enabled: enabled === true,
      actor_id: clean(actorId),
      expected_activation_revision: Number(expectedActivationRevision),
      request_fingerprint: clean(requestFingerprint).toLowerCase(),
      worker_name: PRODUCTION_ODDS_CALCULATION_WORKER,
    },
    options,
  );
}

export async function requestProductionOddsCalculation({
  phase,
  iterations,
  requestedBy,
  outputTimestamp,
  env = process.env,
  dependencies = {},
} = {}) {
  const loadInputs = dependencies.loadInputs || loadProductionOddsCalculationInputs;
  const requestJob = dependencies.requestJob || ((input) => productionOddsCalculationRpc(
    "request_production_odds_calculation_job", input, { env },
  ));
  const inputs = await loadInputs(PRODUCTION_TOURNAMENT_ID, { env });
  const invocation = buildOddsCalculationInvocation({
    inputs,
    phase,
    iterations,
    requestedBy,
    outputTimestamp,
  });
  const requestInput = productionOddsCalculationRequestInput({
    invocation,
    configuration: inputs.configuration,
    env,
  });
  requestInput.resource_metrics = {
    ...(requestInput.resource_metrics || {}),
    inputPreparationMs: Number(inputs.diagnostics?.serviceMs || 0),
    supabaseQueryMs: Number(inputs.diagnostics?.queryMs || 0),
    inputSnapshotBytes: Buffer.byteLength(JSON.stringify(requestInput.input_snapshot)),
  };
  const requested = await requestJob(requestInput);
  if (!requested.payload?.ok) {
    throw operationError(
      clean(requested.payload?.code || "PRODUCTION_ODDS_CALCULATION_REQUEST_FAILED"),
      "Production Championship Odds calculation could not be requested.",
    );
  }
  return { inputs, invocation: requestInput, requested: requested.payload };
}

export function productionOddsCalculationWorkerDependencies(env = process.env, rpc = productionOddsCalculationRpc) {
  return productionOddsCalculationDependencies(env, (functionName, input) => rpc(
    functionName,
    input,
    { env },
  ));
}

export async function processProductionOddsCalculationJob(jobId, {
  env = process.env,
  rpc = productionOddsCalculationRpc,
  ...options
} = {}) {
  return processOddsCalculationJob(jobId, {
    ...options,
    dependencies: productionOddsCalculationWorkerDependencies(env, rpc),
  });
}

export async function readProductionOddsCalculationJobs(jobId = "", {
  env = process.env,
  rpc = productionOddsCalculationRpc,
} = {}) {
  return rpc("read_production_odds_calculation_jobs", { job_id: clean(jobId) }, { env });
}

export async function supersedeProductionOddsCalculationJob(jobId, {
  env = process.env,
  rpc = productionOddsCalculationRpc,
} = {}) {
  return rpc("supersede_production_odds_calculation_job", { job_id: clean(jobId) }, { env });
}

export async function certifyProductionOddsCalculation(jobId, {
  env = process.env,
  rpc = productionOddsCalculationRpc,
} = {}) {
  return certifyOddsCalculationReference({
    tournamentId: PRODUCTION_TOURNAMENT_ID,
    jobId,
    dependencies: {
      readJobs: async (_tournamentId, requestedJobId) => readProductionOddsCalculationJobs(
        requestedJobId,
        { env, rpc },
      ),
    },
  });
}
