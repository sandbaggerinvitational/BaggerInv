import "server-only";

import {
  assertProductionCutoverActivation,
} from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";
import {
  buildTournamentAwardsMutation,
  canonicalTournamentAwardStableId,
  normalizeProductionTournamentAwardsPayload,
  PRODUCTION_TOURNAMENT_AWARDS_CONTRACT,
  stableTournamentAwardsValue,
} from "./production-tournament-awards-contract.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RPCS = new Set([
  "read_production_tournament_awards_v1",
  "save_production_tournament_awards_v1",
]);
const clean = (value) => String(value ?? "").trim();

function awardsError(code, message, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function actorUuid(value) {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) {
    throw awardsError("TOURNAMENT_AWARDS_DIRECTOR_AUTHORIZATION_REQUIRED", "Active Tournament Director access is required.", 403);
  }
  return result;
}

function fixedScope(input, { actorAuthUserId, actorPlayerId } = {}) {
  const authUserId = actorUuid(actorAuthUserId);
  const playerId = canonicalTournamentAwardStableId(actorPlayerId, "Director Player ID");
  return {
    ...(input || {}),
    contract_version: PRODUCTION_TOURNAMENT_AWARDS_CONTRACT,
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
    if (/^(?:PRODUCTION_)?TOURNAMENT_AWARDS_[A-Z0-9_]{3,120}$/.test(candidate)) {
      return candidate.replace(/^PRODUCTION_TOURNAMENT_AWARDS_/, "TOURNAMENT_AWARDS_");
    }
  }
  return "TOURNAMENT_AWARDS_RPC_FAILED";
}

function statusForCode(code, fallback = 409) {
  if (/(?:RPC_FAILED|OPERATION_FAILED|RESPONSE_INVALID|UNAVAILABLE)$/.test(code)) return 503;
  if (/(?:AUTHORIZATION|DIRECTOR|SCOPE)_REQUIRED$|FORBIDDEN$/.test(code)) return 403;
  if (/(?:INVALID|REQUIRED|INCOMPLETE|NOT_FOUND)$/.test(code)) return 400;
  if (/(?:STALE|CONFLICT|COLLISION|BLOCKED)/.test(code)) return 409;
  return fallback;
}

async function awardsRpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 20_000,
  activation: suppliedActivation,
} = {}) {
  const name = clean(functionName);
  if (!RPCS.has(name)) throw awardsError("TOURNAMENT_AWARDS_RPC_FORBIDDEN", "The Awards operation is not allowlisted.", 403);
  const activation = suppliedActivation || assertProductionCutoverActivation({ env, requiredPhase: "OBSERVATION" });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) throw awardsError("PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED", "Awards are temporarily unavailable.");
  recordDataAuthorityTransport("supabase", { adapter: PRODUCTION_TOURNAMENT_AWARDS_CONTRACT, source: name });
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
    throw awardsError(code, "The Production Awards operation did not complete.", statusForCode(code, response.status));
  }
  return { payload, activation };
}

function successful(payload) {
  if (!payload || payload.ok === false) {
    const code = safeProviderCode(payload);
    throw awardsError(code, "The Production Awards operation did not complete.", statusForCode(code));
  }
  return payload;
}

export async function readProductionTournamentAwards(actorInput, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({ env, requiredPhase: "OBSERVATION" });
  const input = fixedScope({ operation: "READ_PRODUCTION_TOURNAMENT_AWARDS_V1" }, actorInput);
  const rpc = options.rpc || awardsRpc;
  const result = await rpc("read_production_tournament_awards_v1", input, { env, activation, ...(options.rpcOptions || {}) });
  return normalizeProductionTournamentAwardsPayload(successful(result?.payload));
}

export async function saveProductionTournamentAwards({ actorAuthUserId, actorPlayerId, ...values } = {}, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({ env, requiredPhase: "OBSERVATION" });
  const operation = buildTournamentAwardsMutation(values);
  const payload = fixedScope(operation, { actorAuthUserId, actorPlayerId });
  const requestPayloadHash = scoringShadowPayloadHash(stableTournamentAwardsValue({
    operation: "SAVE",
    tournamentId: PRODUCTION_TOURNAMENT_ID,
    actorPlayerId: payload.actor_player_id,
    actorAuthUserId: payload.actor_auth_user_id,
    expectedRevision: operation.expected_revision,
    awards: operation.awards,
  }));
  const input = { ...payload, request_payload_hash: requestPayloadHash };
  const rpc = options.rpc || awardsRpc;
  const result = await rpc("save_production_tournament_awards_v1", input, { env, activation, ...(options.rpcOptions || {}) });
  return successful(result?.payload);
}

export const PRODUCTION_TOURNAMENT_AWARDS_PLATFORM = Object.freeze({
  tournamentId: PRODUCTION_TOURNAMENT_ID,
  authority: "SUPABASE",
});
