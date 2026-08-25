import "server-only";

import {
  assertProductionCutoverActivation,
  productionCutoverActivationEnvironment,
} from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value));

function rpcHeaders(secret) {
  const headers = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  return headers;
}

export function productionGoogleIngressLeaseEnvironment(env = process.env) {
  const requested = truthy(env.PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED);
  const activation = productionCutoverActivationEnvironment(env);
  const production = clean(env.VERCEL_ENV).toLowerCase() === "production";
  const expectedEpoch = clean(env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH).toLowerCase();
  const epochApproved = uuid(expectedEpoch);
  const configuredAuthority = clean(env.SCORING_AUTHORITY || "google").toLowerCase();
  const googleAuthorityRequested = configuredAuthority === "google";
  const enabled = requested && production && activation.allowed && epochApproved && googleAuthorityRequested;
  const reason = enabled ? "production-google-ingress-lease-ready"
    : !requested ? "production-google-ingress-lease-disabled"
    : !production ? "production-environment-required"
    : !activation.allowed ? activation.reason
    : !epochApproved ? "production-authority-epoch-required"
    : !googleAuthorityRequested ? "google-authority-required"
    : "production-google-ingress-lease-unavailable";
  return {
    requested,
    enabled,
    reason,
    activation,
    expectedEpoch: epochApproved ? expectedEpoch : "",
    googleAuthorityRequested,
    serverEnvironmentOnly: true,
  };
}

function ingressError(code, message, diagnostics, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.authorityDiagnostics = diagnostics;
  return error;
}

async function productionScoringIngressRpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 12_000,
} = {}) {
  const activation = assertProductionCutoverActivation({ env, requiredPhase: "STATIC_BACKEND" });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  const url = `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${functionName}`;
  recordDataAuthorityTransport("supabase", { adapter: "production-cutover-scoring-ingress" });
  const response = await fetchImpl(url, {
    method: "POST",
    headers: rpcHeaders(secret),
    body: JSON.stringify({ input }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw ingressError(
      "PRODUCTION_SCORING_INGRESS_RPC_FAILED",
      `Production scoring ingress RPC failed (${response.status}).`,
      { functionName, status: response.status, code: clean(payload?.code), activation },
      response.status,
    );
  }
  return payload;
}

function serverBoundInput(input, state) {
  const tournamentId = clean(input?.tournamentId || input?.tournament_id || PRODUCTION_TOURNAMENT_ID);
  if (tournamentId !== PRODUCTION_TOURNAMENT_ID) {
    throw ingressError("PRODUCTION_SCORING_TOURNAMENT_MISMATCH", "The Production scoring tournament is not eligible.", {
      expectedTournamentId: PRODUCTION_TOURNAMENT_ID,
    }, 403);
  }
  const matchId = clean(input?.matchId || input?.match_id);
  if (!matchId) throw ingressError("PRODUCTION_SCORING_MATCH_REQUIRED", "A Production Match ID is required.", {}, 400);
  const operation = clean(input?.operation).toUpperCase();
  if (!/^[A-Z0-9:_-]{3,100}$/.test(operation)) {
    throw ingressError("PRODUCTION_SCORING_OPERATION_REQUIRED", "A bounded Production scoring operation is required.", {}, 400);
  }
  return {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    match_id: matchId,
    operation,
    actor_id: clean(input?.actorId || input?.actor_id || "Authorized Production scorer").slice(0, 160),
    expected_authority: "GOOGLE",
    expected_epoch_id: state.expectedEpoch,
    deployment_commit: state.activation.resources.commitSha,
    lease_seconds: Math.max(30, Math.min(Number(input?.leaseSeconds || input?.lease_seconds || 180), 300)),
  };
}

/**
 * Starts a future Production Google-authority write lease. With the flag off it
 * is a deliberate no-op, preserving the current live Google path. With the flag
 * on, every missing/malformed dependency fails before a Google write begins.
 */
export async function beginProductionGoogleAuthorityWrite(input, options = {}) {
  const env = options.env || process.env;
  const state = productionGoogleIngressLeaseEnvironment(env);
  if (!state.requested) return { enabled: false, leaseId: "", state };
  if (!state.enabled) {
    throw ingressError("PRODUCTION_GOOGLE_INGRESS_LEASE_UNAVAILABLE", `Production Google ingress lease is unavailable (${state.reason}).`, state);
  }
  const bound = serverBoundInput(input, state);
  const payload = await productionScoringIngressRpc("begin_production_scoring_ingress", bound, options);
  if (payload?.ok !== true || !uuid(payload.lease_id) || clean(payload.authority).toUpperCase() !== "GOOGLE" ||
      clean(payload.epoch_id).toLowerCase() !== state.expectedEpoch) {
    throw ingressError("PRODUCTION_GOOGLE_INGRESS_LEASE_REJECTED", "Production authority rejected the Google write lease.", {
      code: clean(payload?.code), authority: clean(payload?.authority), epochMatched: clean(payload?.epoch_id).toLowerCase() === state.expectedEpoch,
    });
  }
  return { enabled: true, leaseId: clean(payload.lease_id), state, payload };
}

export async function completeProductionGoogleAuthorityWrite(lease, options = {}) {
  if (!lease?.enabled) return { ok: true, idempotent: true, disabled: true };
  const state = productionGoogleIngressLeaseEnvironment(options.env || process.env);
  if (!state.enabled || state.expectedEpoch !== lease.state?.expectedEpoch) {
    throw ingressError("PRODUCTION_GOOGLE_INGRESS_LEASE_COMPLETION_UNAVAILABLE", "Production Google ingress lease completion is unavailable.", state);
  }
  const payload = await productionScoringIngressRpc("complete_production_scoring_ingress", {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    expected_epoch_id: state.expectedEpoch,
    deployment_commit: state.activation.resources.commitSha,
    lease_id: lease.leaseId,
  }, options);
  if (payload?.ok !== true) {
    throw ingressError("PRODUCTION_GOOGLE_INGRESS_LEASE_COMPLETION_REJECTED", "Production authority did not acknowledge lease completion.", {
      code: clean(payload?.code), leaseId: lease.leaseId,
    });
  }
  return payload;
}

export async function withProductionGoogleAuthorityWrite(input, operation, options = {}) {
  if (typeof operation !== "function") throw new TypeError("A Production Google write operation is required.");
  const lease = await beginProductionGoogleAuthorityWrite(input, options);
  let operationFailed = false;
  try {
    return await operation();
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    try {
      await completeProductionGoogleAuthorityWrite(lease, options);
    } catch (error) {
      console.error("Production Google ingress lease completion remains pending", {
        code: error?.code || "PRODUCTION_GOOGLE_INGRESS_LEASE_COMPLETION_FAILED",
        operation: clean(input?.operation),
        operationFailed,
      });
    }
  }
}
