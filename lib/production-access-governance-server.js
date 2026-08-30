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
  canonicalProductionGovernanceConfirmation,
  canonicalProductionGovernanceDisplayName,
  canonicalProductionGovernanceGlobalStatus,
  canonicalProductionGovernanceName,
  canonicalProductionGovernanceOperationId,
  canonicalProductionGovernancePlayerId,
  canonicalProductionGovernanceReason,
  canonicalProductionGovernanceRevision,
  canonicalProductionGovernanceSlug,
  normalizeProductionAccessGovernanceMutation,
  normalizeProductionAccessGovernancePayload,
  productionAccessGovernancePayloadHash,
  PRODUCTION_ACCESS_GOVERNANCE_CONTRACT,
} from "./production-access-governance-contract.js";

export { PRODUCTION_ACCESS_GOVERNANCE_CONTRACT };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RPCS = new Set([
  "read_production_access_governance_v1",
  "mutate_production_access_governance_v1",
]);
const clean = (value) => String(value ?? "").trim();

function governanceError(code, message, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function exactActorUuid(value) {
  const actorAuthUserId = clean(value).toLowerCase();
  if (!UUID.test(actorAuthUserId)) {
    throw governanceError(
      "ACCESS_GOVERNANCE_DIRECTOR_AUTHORIZATION_REQUIRED",
      "Active Tournament Director access is required.",
      403,
    );
  }
  return actorAuthUserId;
}

function fixedScope(input, { actorAuthUserId, actorPlayerId } = {}) {
  const authUserId = exactActorUuid(actorAuthUserId);
  const playerId = canonicalProductionGovernancePlayerId(actorPlayerId);
  return {
    ...(input || {}),
    contract_version: PRODUCTION_ACCESS_GOVERNANCE_CONTRACT,
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
    if (/^(?:PRODUCTION_)?ACCESS_GOVERNANCE_[A-Z0-9_]{3,120}$/.test(candidate)) {
      return candidate.replace(/^PRODUCTION_ACCESS_GOVERNANCE_/, "ACCESS_GOVERNANCE_");
    }
  }
  return "ACCESS_GOVERNANCE_RPC_FAILED";
}

function statusForCode(code, fallback = 409) {
  if (/(?:RPC_FAILED|OPERATION_FAILED|RESPONSE_INVALID)$/.test(code)) return 503;
  if (/(?:AUTHORIZATION|DIRECTOR)_REQUIRED$|OWNER_REQUIRED$|SCOPE_REQUIRED$|FORBIDDEN$/.test(code)) return 403;
  if (/NOT_FOUND$/.test(code)) return 404;
  if (/(?:ACTIVE_MEMBERSHIP|INACTIVE_MEMBERSHIP|ACTIVE_GLOBAL_PLAYER|LINKED_AUTH|TARGET_ALREADY_OWNER|SELF_REVOKE|OWNER_REVOKE|FINAL_ADMIN)/.test(code)) {
    return 409;
  }
  if (/(?:INVALID|REQUIRED)$/.test(code)) return 400;
  if (/(?:STALE|CONFLICT|COLLISION|BLOCKED|BLOCKS|DEPENDENCY|IN_FLIGHT|FINAL_OWNER|LAST_OWNER|NOT_READY|SPACE_EXHAUSTED)/.test(code)) {
    return 409;
  }
  return fallback;
}

export async function productionAccessGovernanceRpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  activation: suppliedActivation,
} = {}) {
  const name = clean(functionName);
  if (!RPCS.has(name)) {
    throw governanceError(
      "ACCESS_GOVERNANCE_RPC_FORBIDDEN",
      "The access-governance operation is not allowlisted.",
      403,
    );
  }
  const activation = suppliedActivation || assertProductionCutoverActivation({
    env,
    requiredPhase: "OBSERVATION",
  });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw governanceError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "Players & Access is temporarily unavailable.",
    );
  }
  recordDataAuthorityTransport("supabase", {
    adapter: PRODUCTION_ACCESS_GOVERNANCE_CONTRACT,
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
    throw governanceError(
      code,
      "The Production access-governance operation did not complete.",
      statusForCode(code, response.status),
    );
  }
  return { payload, activation };
}

function successful(payload, fallbackStatus = 409) {
  if (!payload || payload.ok === false) {
    const code = safeProviderCode(payload);
    throw governanceError(
      code,
      "The access-governance change was not applied.",
      statusForCode(code, fallbackStatus),
    );
  }
  return payload;
}

export async function readProductionAccessGovernance(actorInput, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const input = fixedScope({ operation: "READ_PRODUCTION_ACCESS_GOVERNANCE_V1" }, actorInput);
  const rpc = options.rpc || productionAccessGovernanceRpc;
  const result = await rpc("read_production_access_governance_v1", input, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  const payload = successful(result?.payload);
  return normalizeProductionAccessGovernancePayload(payload);
}

function mutationInput(action, actorInput, expectedRevision, operationRequestId, values) {
  const payload = fixedScope({
    action,
    expected_revision: canonicalProductionGovernanceRevision(expectedRevision),
    operation_request_id: canonicalProductionGovernanceOperationId(operationRequestId),
    ...values,
  }, actorInput);
  return {
    ...payload,
    request_payload_hash: productionAccessGovernancePayloadHash(payload),
  };
}

export async function mutateProductionAccessGovernance({
  action,
  actorAuthUserId,
  actorPlayerId,
  expectedRevision,
  expectedProfileRevision,
  expectedMembershipRevision,
  operationRequestId,
  playerId,
  firstName,
  lastName,
  displayName,
  slug,
  globalStatus,
  reason,
  confirmed,
} = {}, options = {}) {
  const normalizedAction = clean(action).toLowerCase();
  const actionMap = {
    "create-player": () => {
      const canonicalFirstName = canonicalProductionGovernanceName(firstName, "First name");
      const canonicalLastName = canonicalProductionGovernanceName(lastName, "Last name");
      return ["CREATE_PLAYER", {
        first_name: canonicalFirstName,
        last_name: canonicalLastName,
        display_name: canonicalProductionGovernanceDisplayName(displayName),
        slug: canonicalProductionGovernanceSlug(slug, `${canonicalFirstName} ${canonicalLastName}`),
        global_status: canonicalProductionGovernanceGlobalStatus(globalStatus),
      }];
    },
    "set-global-status": () => ["SET_GLOBAL_STATUS", {
      player_id: canonicalProductionGovernancePlayerId(playerId),
      global_status: canonicalProductionGovernanceGlobalStatus(globalStatus),
      expected_profile_revision: canonicalProductionGovernanceRevision(
        expectedProfileRevision,
        "ACCESS_GOVERNANCE_PROFILE_REVISION_REQUIRED",
        "Refresh this Player profile before changing its status.",
      ),
    }],
    "withdraw-membership": () => ["WITHDRAW_MEMBERSHIP", {
      player_id: canonicalProductionGovernancePlayerId(playerId),
      reason: canonicalProductionGovernanceReason(reason),
      expected_membership_revision: canonicalProductionGovernanceRevision(
        expectedMembershipRevision,
        "ACCESS_GOVERNANCE_MEMBERSHIP_REVISION_REQUIRED",
        "Refresh this tournament membership before changing it.",
      ),
    }],
    "reactivate-membership": () => ["REACTIVATE_MEMBERSHIP", {
      player_id: canonicalProductionGovernancePlayerId(playerId),
      reason: canonicalProductionGovernanceReason(reason),
      expected_membership_revision: canonicalProductionGovernanceRevision(
        expectedMembershipRevision,
        "ACCESS_GOVERNANCE_MEMBERSHIP_REVISION_REQUIRED",
        "Refresh this tournament membership before changing it.",
      ),
    }],
    "grant-director": () => ["GRANT_DIRECTOR", {
      player_id: canonicalProductionGovernancePlayerId(playerId),
      reason: canonicalProductionGovernanceReason(reason),
      confirmed: canonicalProductionGovernanceConfirmation(confirmed),
    }],
    "revoke-director": () => ["REVOKE_DIRECTOR", {
      player_id: canonicalProductionGovernancePlayerId(playerId),
      reason: canonicalProductionGovernanceReason(reason),
      confirmed: canonicalProductionGovernanceConfirmation(confirmed),
    }],
  };
  const buildSelected = actionMap[normalizedAction];
  if (!buildSelected) {
    throw governanceError(
      "ACCESS_GOVERNANCE_ACTION_INVALID",
      "Unsupported access-governance action.",
      400,
    );
  }
  const [operation, values] = buildSelected();
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const input = mutationInput(
    operation,
    { actorAuthUserId, actorPlayerId },
    expectedRevision,
    operationRequestId,
    values,
  );
  const rpc = options.rpc || productionAccessGovernanceRpc;
  const result = await rpc("mutate_production_access_governance_v1", input, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  const payload = successful(result?.payload);
  return normalizeProductionAccessGovernanceMutation(payload?.data && payload.data.ok === undefined
    ? { ...payload.data, ok: true }
    : payload);
}
