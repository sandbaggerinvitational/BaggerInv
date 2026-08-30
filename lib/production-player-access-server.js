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
import {
  canonicalProductionBulkEnrollment,
  canonicalProductionLoginPreference,
  canonicalProductionPlayerEmail,
  canonicalProductionPlayerId,
  canonicalProductionPlayerPhone,
  productionPlayerAccessPayloadHash,
  PRODUCTION_PLAYER_ACCESS_CONTRACT,
} from "./production-player-access-contract.js";
import { normalizeProductionPlayerAccessPayload } from "./production-director-players-access.js";

export { PRODUCTION_PLAYER_ACCESS_CONTRACT };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RPCS = new Set([
  "read_production_players_access_v1",
  "mutate_production_players_access_v1",
]);
const clean = (value) => String(value ?? "").trim();

function accessError(code, message, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function exactUuid(value, code = "PLAYER_ACCESS_OPERATION_REQUEST_ID_REQUIRED") {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) throw accessError(code, "A secure operation identity is required.", 400);
  return result;
}

function exactRevision(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw accessError(
      "PLAYER_ACCESS_REVISION_REQUIRED",
      "Refresh Players & Access before making this change.",
      400,
    );
  }
  return result;
}

function authorization({ actorAuthUserId, actorPlayerId } = {}) {
  return {
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    auth_user_id: exactUuid(
      actorAuthUserId,
      "PLAYER_ACCESS_DIRECTOR_AUTHORIZATION_REQUIRED",
    ),
    player_id: canonicalProductionPlayerId(actorPlayerId),
    role: "DIRECTOR",
  };
}

function fixedScope(input, actor) {
  return {
    ...(input || {}),
    contract_version: PRODUCTION_PLAYER_ACCESS_CONTRACT,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    authorization: actor,
  };
}

function headers(secret) {
  const result = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) result.authorization = `Bearer ${secret}`;
  return result;
}

function safeProviderCode(payload) {
  for (const value of [payload?.code, payload?.message]) {
    const candidate = clean(value).toUpperCase();
    if (/^PLAYER_ACCESS_[A-Z0-9_]{3,120}$/.test(candidate)) return candidate;
  }
  return "PLAYER_ACCESS_RPC_FAILED";
}

export async function productionPlayerAccessRpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  activation: suppliedActivation,
} = {}) {
  const name = clean(functionName);
  if (!RPCS.has(name)) {
    throw accessError("PLAYER_ACCESS_RPC_FORBIDDEN", "The Player access operation is not allowlisted.", 403);
  }
  const activation = suppliedActivation || assertProductionCutoverActivation({
    env,
    requiredPhase: "OBSERVATION",
  });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw accessError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "Players & Access is temporarily unavailable.",
    );
  }
  recordDataAuthorityTransport("supabase", {
    adapter: "production-players-access-v1",
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
    throw accessError(code, "The Production Players & Access operation did not complete.", response.status);
  }
  return { payload, activation };
}

function successful(result) {
  const payload = result?.payload;
  if (!payload || payload.ok !== true) {
    const code = safeProviderCode(payload);
    const status = /(?:REVISION_STALE|COLLISION|CONFLICT|BLOCKED|REPAIR_REQUIRED|IN_FLIGHT|NOT_READY|LINKED_IDENTITY_REQUIRED|VERIFIED_PHONE_REQUIRED|ACTIVE_MEMBERSHIP_REQUIRED|DIRECTOR_ACCESS_REVIEW_REQUIRED)/.test(code)
      ? 409
      : /(?:INVALID|REQUIRED)$/.test(code) ? 400 : 409;
    throw accessError(code, "The Players & Access change was not applied.", status);
  }
  return payload;
}

export async function readProductionPlayersAccess(actorInput, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const actor = authorization(actorInput);
  const input = fixedScope({ operation: "READ_PRODUCTION_PLAYERS_ACCESS_V1" }, actor);
  const rpc = options.rpc || productionPlayerAccessRpc;
  const result = await rpc("read_production_players_access_v1", input, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  const payload = successful(result);
  if (payload.data?.contractVersion !== PRODUCTION_PLAYER_ACCESS_CONTRACT ||
      payload.data?.tournamentId !== PRODUCTION_TOURNAMENT_ID ||
      !Number.isSafeInteger(Number(payload.data?.revision)) ||
      Number(payload.data.revision) < 0 ||
      !Array.isArray(payload.data?.players)) {
    throw accessError("PLAYER_ACCESS_RESPONSE_INVALID", "Players & Access returned an invalid response.");
  }
  return normalizeProductionPlayerAccessPayload({ data: payload.data });
}

function mutationInput(action, actorInput, expectedRevision, operationRequestId, values) {
  const actor = authorization(actorInput);
  const payload = fixedScope({
    action,
    expected_revision: exactRevision(expectedRevision),
    operation_request_id: exactUuid(operationRequestId),
    ...values,
  }, actor);
  return {
    ...payload,
    request_payload_hash: productionPlayerAccessPayloadHash(payload),
  };
}

export async function mutateProductionPlayersAccess({
  action,
  actorAuthUserId,
  actorPlayerId,
  expectedRevision,
  operationRequestId,
  playerId,
  email,
  phone,
  preferredLoginMethod,
  entries,
} = {}, options = {}) {
  const normalizedAction = clean(action).toLowerCase();
  const actionMap = {
    "approve-email": () => ["APPROVE_EMAIL", {
      player_id: canonicalProductionPlayerId(playerId),
      email: canonicalProductionPlayerEmail(email),
    }],
    "approve-phone": () => ["APPROVE_PHONE", {
      player_id: canonicalProductionPlayerId(playerId),
      phone_e164: canonicalProductionPlayerPhone(phone),
    }],
    "revoke-phone": () => ["REVOKE_PHONE", {
      player_id: canonicalProductionPlayerId(playerId),
    }],
    "set-login-preference": () => ["SET_LOGIN_PREFERENCE", {
      player_id: canonicalProductionPlayerId(playerId),
      preferred_login_method: canonicalProductionLoginPreference(preferredLoginMethod),
    }],
    "suspend-access": () => ["SUSPEND_ACCESS", {
      player_id: canonicalProductionPlayerId(playerId),
    }],
    "resume-access": () => ["RESUME_ACCESS", {
      player_id: canonicalProductionPlayerId(playerId),
    }],
    "bulk-enroll": () => ["BULK_ENROLL", {
      entries: canonicalProductionBulkEnrollment(entries),
    }],
  };
  const buildSelected = actionMap[normalizedAction];
  if (!buildSelected) throw accessError("PLAYER_ACCESS_ACTION_INVALID", "Unsupported Players & Access action.", 400);
  const selected = buildSelected();
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const input = mutationInput(
    selected[0],
    { actorAuthUserId, actorPlayerId },
    expectedRevision,
    operationRequestId,
    selected[1],
  );
  const rpc = options.rpc || productionPlayerAccessRpc;
  return successful(await rpc("mutate_production_players_access_v1", input, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  }));
}
