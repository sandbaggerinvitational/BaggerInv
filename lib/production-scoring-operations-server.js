import "server-only";

import { assertProductionCutoverActivation } from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";

const clean = (value) => String(value ?? "").trim();

const RPC_PHASE = Object.freeze({
  read_production_scoring_authority: "CURRENT_READS",
  read_production_scoring_participant_context: "CURRENT_READS",
  submit_production_hole_score: "SCORING_COMMIT",
  finalize_production_match: "SCORING_COMMIT",
  reopen_production_match: "SCORING_COMMIT",
  mutate_production_match_control: "SCORING_COMMIT",
  claim_production_google_outbox: "WORKERS",
  claim_production_google_outbox_event: "WORKERS",
  complete_production_google_outbox: "WORKERS",
  fail_production_google_outbox: "WORKERS",
  inspect_production_scoring_workers: "WORKERS",
  claim_production_scorecard_archive_job: "WORKERS",
  complete_production_scorecard_archive_job: "WORKERS",
  fail_production_scorecard_archive_job: "WORKERS",
  inspect_production_scorecard_archive_state: "WORKERS",
});

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

function boundedInput(input, activation, env) {
  const epochId = clean(env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(epochId)) {
    throw operationError(
      "PRODUCTION_SCORING_AUTHORITY_EPOCH_REQUIRED",
      "The exact Production scoring authority epoch is required.",
    );
  }
  return {
    ...(input || {}),
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    deployment_commit: activation.resources.commitSha,
    deployment_id: clean(env.VERCEL_DEPLOYMENT_ID),
    deployment_capability_contract:
      activation.maintenanceDeploymentCapability?.allowed
        ? activation.maintenanceDeploymentCapability.contract
        : "",
    deployment_capability_ceiling:
      activation.maintenanceDeploymentCapability?.allowed
        ? activation.maintenanceDeploymentCapability.ceiling
        : "",
    expected_epoch_id: epochId,
  };
}

/**
 * Calls only the reviewed Production scoring/worker RPC allowlist. The caller
 * cannot supply or override the Production resource tuple or authority epoch.
 */
export async function productionScoringOperationsRpc(functionName, input = {}, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 12_000,
} = {}) {
  const requiredPhase = RPC_PHASE[clean(functionName)];
  if (!requiredPhase) {
    throw operationError("PRODUCTION_SCORING_RPC_FORBIDDEN", "The Production scoring RPC is not allowlisted.", {
      functionName: clean(functionName),
    }, 403);
  }
  const activation = assertProductionCutoverActivation({ env, requiredPhase });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw operationError("PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED", "The Production server credential is unavailable.");
  }
  const body = boundedInput(input, activation, env);
  const startedAt = Date.now();
  recordDataAuthorityTransport("supabase", {
    adapter: "production-scoring-operations",
    source: functionName,
  });
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: rpcHeaders(secret),
    body: JSON.stringify({ input: body }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw operationError(
      "PRODUCTION_SCORING_RPC_FAILED",
      `Production scoring RPC failed (${response.status}).`,
      { functionName, status: response.status, code: clean(payload?.code || payload?.message) },
      response.status,
    );
  }
  return { ok: true, payload, durationMs: Date.now() - startedAt };
}

export function productionScoringOperationEnvironment(env = process.env) {
  const production = clean(env.VERCEL_ENV).toLowerCase() === "production";
  const scoringRequested = clean(env.SCORING_AUTHORITY || "google").toLowerCase() === "supabase";
  const activationRequested = /^(?:1|true|yes|on|enabled)$/i.test(clean(env.PRODUCTION_CUTOVER_ACTIVATION_ENABLED));
  const workersRequested = /^(?:1|true|yes|on|enabled)$/i.test(clean(env.PRODUCTION_SUPABASE_WORKERS_ENABLED));
  return {
    production,
    requested: production && (scoringRequested || activationRequested || workersRequested),
    scoringRequested,
    activationRequested,
    workersRequested,
  };
}
