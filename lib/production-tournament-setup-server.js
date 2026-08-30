import "server-only";

import { createHash } from "node:crypto";

import { assertProductionCutoverActivation } from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";
import {
  buildTournamentSetupMutation,
  canonicalTournamentSetupId,
  normalizeProductionTournamentSetupMutation,
  normalizeProductionTournamentSetupPayload,
  PRODUCTION_TOURNAMENT_SETUP_CONTRACT,
  stableTournamentSetupValue,
} from "./production-tournament-setup-contract.js";

export { PRODUCTION_TOURNAMENT_SETUP_CONTRACT };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RPCS = new Set([
  "read_production_tournament_setup_v1",
  "mutate_production_tournament_setup_v1",
]);
const clean = (value) => String(value ?? "").trim();

function setupError(code, message, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function exactActorUuid(value) {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) {
    throw setupError(
      "TOURNAMENT_SETUP_DIRECTOR_AUTHORIZATION_REQUIRED",
      "Active Tournament Director access is required.",
      403,
    );
  }
  return result;
}

function fixedScope(input, { actorAuthUserId, actorPlayerId } = {}) {
  const authUserId = exactActorUuid(actorAuthUserId);
  const playerId = canonicalTournamentSetupId(actorPlayerId, "Director Player ID");
  return {
    ...(input || {}),
    contract_version: PRODUCTION_TOURNAMENT_SETUP_CONTRACT,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    actor_auth_user_id: authUserId,
    actor_player_id: playerId,
    authorization: {
      tournament_id: PRODUCTION_TOURNAMENT_ID,
      auth_user_id: authUserId,
      player_id: playerId,
      role: "DIRECTOR",
    },
  };
}

function headers(secret) {
  const result = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) result.authorization = `Bearer ${secret}`;
  return result;
}

function safeProviderCode(payload) {
  for (const value of [payload?.code, payload?.message, payload?.error?.code]) {
    const candidate = clean(value).toUpperCase();
    if (/^(?:PRODUCTION_)?TOURNAMENT_SETUP_[A-Z0-9_]{3,120}$/.test(candidate)) {
      return candidate.replace(/^PRODUCTION_TOURNAMENT_SETUP_/, "TOURNAMENT_SETUP_");
    }
  }
  return "TOURNAMENT_SETUP_RPC_FAILED";
}

function statusForCode(code, fallback = 409) {
  if (/(?:RPC_FAILED|OPERATION_FAILED|RESPONSE_INVALID|UNAVAILABLE)$/.test(code)) return 503;
  if (/(?:AUTHORIZATION|DIRECTOR|OWNER|SCOPE)_REQUIRED$|FORBIDDEN$/.test(code)) return 403;
  if (/NOT_FOUND$/.test(code)) return 404;
  if (/(?:INVALID|INCOMPLETE|REQUIRED)$/.test(code)) return 400;
  if (/(?:STALE|CONFLICT|COLLISION|BLOCKED|LOCKED|FROZEN|DEPENDENCY|STARTED|PUBLISHED|CONFIGURED|IN_FLIGHT)/.test(code)) return 409;
  return fallback;
}

function payloadHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableTournamentSetupValue(value)))
    .digest("hex");
}

export async function productionTournamentSetupRpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 20_000,
  activation: suppliedActivation,
} = {}) {
  const name = clean(functionName);
  if (!RPCS.has(name)) {
    throw setupError(
      "TOURNAMENT_SETUP_RPC_FORBIDDEN",
      "The Tournament Setup operation is not allowlisted.",
      403,
    );
  }
  const activation = suppliedActivation || assertProductionCutoverActivation({
    env,
    requiredPhase: "OBSERVATION",
  });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw setupError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "Tournament Setup is temporarily unavailable.",
    );
  }
  recordDataAuthorityTransport("supabase", {
    adapter: PRODUCTION_TOURNAMENT_SETUP_CONTRACT,
    source: name,
  });
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(secret),
    body: JSON.stringify({ input }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = safeProviderCode(payload);
    throw setupError(
      code,
      "The Production Tournament Setup operation did not complete.",
      statusForCode(code, response.status),
    );
  }
  return { payload, activation };
}

function successful(payload, fallbackStatus = 409) {
  if (!payload || payload.ok === false) {
    const code = safeProviderCode(payload);
    throw setupError(
      code,
      "The Tournament Setup operation did not complete.",
      statusForCode(code, fallbackStatus),
    );
  }
  return payload;
}

export async function readProductionTournamentSetup(actorInput, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const input = fixedScope({ operation: "READ_PRODUCTION_TOURNAMENT_SETUP_V1" }, actorInput);
  const rpc = options.rpc || productionTournamentSetupRpc;
  const result = await rpc("read_production_tournament_setup_v1", input, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  return normalizeProductionTournamentSetupPayload(successful(result?.payload));
}

export async function mutateProductionTournamentSetup({
  action,
  actorAuthUserId,
  actorPlayerId,
  ...values
} = {}, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const operation = buildTournamentSetupMutation(action, values);
  const payload = fixedScope(operation, { actorAuthUserId, actorPlayerId });
  const input = { ...payload, request_payload_hash: payloadHash(payload) };
  const rpc = options.rpc || productionTournamentSetupRpc;
  const result = await rpc("mutate_production_tournament_setup_v1", input, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  const response = successful(result?.payload);
  return normalizeProductionTournamentSetupMutation(
    response?.data && response.data.ok === undefined ? { ...response.data, ok: true } : response,
  );
}
