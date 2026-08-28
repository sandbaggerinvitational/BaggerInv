import "server-only";

import { createHash } from "node:crypto";

import {
  PRODUCTION_CUTOVER_PHASES,
  assertProductionCutoverActivation,
} from "./production-cutover-activation-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";

const clean = (value) => String(value ?? "").trim();
const fingerprint = (value) => /^[0-9a-f]{64}$/.test(clean(value).toLowerCase());

function headers(secret) {
  const result = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) result.authorization = `Bearer ${secret}`;
  return result;
}

function controlError(code, message, diagnostics = {}, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.diagnostics = diagnostics;
  return error;
}

function exactScope(env, activation, extra = {}) {
  const capability = activation.maintenanceDeploymentCapability;
  return {
    ...extra,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    deployment_commit: activation.resources.commitSha,
    deployment_id: clean(env.VERCEL_DEPLOYMENT_ID),
    deployment_capability_contract: capability?.allowed
      ? capability.contract
      : "",
    deployment_capability_ceiling: capability?.allowed
      ? capability.ceiling
      : "",
  };
}

async function rpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 12_000,
} = {}) {
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  recordDataAuthorityTransport("supabase", { adapter: "production-cutover-read-control" });
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: headers(secret),
    body: JSON.stringify({ input }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw controlError("PRODUCTION_CUTOVER_READ_CONTROL_RPC_FAILED",
      `Production read control RPC failed (${response.status}).`, {
        functionName,
        status: response.status,
        providerCode: clean(payload?.code),
      }, response.status);
  }
  return payload;
}

function deterministicRequestFingerprint(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function setProductionCutoverReadPhase({
  mode,
  expectedPriorPhase,
  targetPhase,
  expectedActivationRevision,
  sourceFingerprint,
  actorId,
  requestFingerprint = "",
} = {}, options = {}) {
  const env = options.env || process.env;
  const activation = assertProductionCutoverActivation({ env, requiredPhase: targetPhase });
  const normalizedMode = clean(mode).toUpperCase();
  const normalizedPrior = clean(expectedPriorPhase).toUpperCase();
  const normalizedTarget = clean(targetPhase).toUpperCase();
  const normalizedSourceFingerprint = clean(sourceFingerprint).toLowerCase();
  const normalizedActor = clean(actorId).slice(0, 160);
  const exactDeployedPhase = activation.phase === normalizedTarget;
  const ceilingAuthorizesTarget =
    activation.maintenanceDeploymentCapability?.allowed === true &&
    PRODUCTION_CUTOVER_PHASES.indexOf(normalizedTarget) >= 0 &&
    PRODUCTION_CUTOVER_PHASES.indexOf(normalizedTarget) <=
      activation.maintenanceDeploymentCapability.ceilingIndex;
  if (!['ACTIVATE', 'ROLLBACK'].includes(normalizedMode) || !normalizedPrior ||
      !normalizedTarget || (!exactDeployedPhase && !ceilingAuthorizesTarget) ||
      !Number.isSafeInteger(Number(expectedActivationRevision)) ||
      Number(expectedActivationRevision) < 0 || !fingerprint(normalizedSourceFingerprint) ||
      !normalizedActor) {
    throw controlError("PRODUCTION_CUTOVER_READ_CONTROL_INPUT_INVALID",
      "The Production read-phase request is incomplete or does not match the deployed phase.", {
        mode: normalizedMode,
        expectedPriorPhase: normalizedPrior,
        targetPhase: normalizedTarget,
        deployedPhase: activation.phase,
      }, 400);
  }
  const request = exactScope(env, activation, {
    mode: normalizedMode,
    expected_prior_phase: normalizedPrior,
    target_phase: normalizedTarget,
    expected_activation_revision: Number(expectedActivationRevision),
    source_fingerprint: normalizedSourceFingerprint,
    actor_id: normalizedActor,
  });
  const supplied = clean(requestFingerprint).toLowerCase();
  request.request_fingerprint = supplied || deterministicRequestFingerprint(request);
  if (!fingerprint(request.request_fingerprint)) {
    throw controlError("PRODUCTION_CUTOVER_READ_REQUEST_FINGERPRINT_INVALID",
      "The Production read-phase request fingerprint is invalid.", {}, 400);
  }
  return rpc("set_production_cutover_read_state", request, options);
}

export async function inspectProductionCutoverReadState(options = {}) {
  const env = options.env || process.env;
  const activation = assertProductionCutoverActivation({ env, requiredPhase: "STATIC_BACKEND" });
  return rpc("inspect_production_cutover_read_state", exactScope(env, activation), options);
}
