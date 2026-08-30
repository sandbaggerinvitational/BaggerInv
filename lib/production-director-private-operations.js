import "server-only";

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

export const PRODUCTION_DIRECTOR_PRIVATE_OPERATIONS_CONTRACT =
  "production-director-private-operations-v1";

const RPC_NAME = "read_production_director_operations_v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_RESPONSE_KEY = /(?:^|_)(?:auth_user|email|phone|secret|token|credential|claim|lease|fingerprint|metadata|details|payload|source_revision|request_fingerprint)(?:_|$)/i;
const clean = (value) => String(value ?? "").trim();

function privateReadError(code, message, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function rpcHeaders(secret) {
  const headers = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  return headers;
}

function assertSafeProjection(value, path = "data") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeProjection(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RESPONSE_KEY.test(key)) {
      throw privateReadError(
        "PRODUCTION_DIRECTOR_PRIVATE_RESPONSE_UNSAFE",
        "The Director-private operational response was rejected.",
      );
    }
    assertSafeProjection(child, `${path}.${key}`);
  }
}

function exactAuthorization({ actorAuthUserId, actorPlayerId } = {}) {
  const authUserId = clean(actorAuthUserId).toLowerCase();
  const playerId = clean(actorPlayerId);
  if (!UUID.test(authUserId) || !playerId) {
    throw privateReadError(
      "PRODUCTION_DIRECTOR_PRIVATE_AUTHORIZATION_REQUIRED",
      "Active Production Director access is required.",
      403,
    );
  }
  return {
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    auth_user_id: authUserId,
    player_id: playerId,
    role: "DIRECTOR",
  };
}

function exactRuntimeScope(env, activation, authorization) {
  const epochId = clean(env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH).toLowerCase();
  if (!UUID.test(epochId)) {
    throw privateReadError(
      "PRODUCTION_DIRECTOR_PRIVATE_AUTHORITY_EPOCH_REQUIRED",
      "The current Production authority binding is unavailable.",
    );
  }
  return {
    contract_version: PRODUCTION_DIRECTOR_PRIVATE_OPERATIONS_CONTRACT,
    operation: "READ_PRODUCTION_DIRECTOR_OPERATIONS_V1",
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
    authorization,
  };
}

/**
 * Fixed-resource, service-only transport for the one Director-private read.
 * The browser cannot select a project, tournament, deployment, or actor.
 */
export async function readProductionDirectorPrivateOperations({
  actorAuthUserId,
  actorPlayerId,
  env = process.env,
  dependencies = {},
} = {}) {
  const activation = (dependencies.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const authorization = exactAuthorization({ actorAuthUserId, actorPlayerId });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw privateReadError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "The Production Director-private read is temporarily unavailable.",
    );
  }
  const fetchImpl = dependencies.fetchImpl || fetch;
  const input = exactRuntimeScope(env, activation, authorization);
  recordDataAuthorityTransport("supabase", {
    adapter: "production-director-private-operations-v1",
    source: RPC_NAME,
  });
  const response = await fetchImpl(
    `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${RPC_NAME}`,
    {
      method: "POST",
      headers: rpcHeaders(secret),
      body: JSON.stringify({ input }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || !payload?.data) {
    const providerCode = clean(payload?.message);
    const code = /^PRODUCTION_DIRECTOR_PRIVATE_[A-Z0-9_]{3,120}$/.test(providerCode)
      ? providerCode
      : "PRODUCTION_DIRECTOR_PRIVATE_READ_FAILED";
    throw privateReadError(
      code,
      `The Production Director-private read did not complete (${response.status}).`,
      response.status,
    );
  }
  if (clean(payload.data.contract_version) !==
      PRODUCTION_DIRECTOR_PRIVATE_OPERATIONS_CONTRACT ||
      clean(payload.data.tournament_id) !== PRODUCTION_TOURNAMENT_ID) {
    throw privateReadError(
      "PRODUCTION_DIRECTOR_PRIVATE_CONTRACT_REQUIRED",
      "The Production Director-private read contract is unavailable.",
    );
  }
  assertSafeProjection(payload.data);
  return payload.data;
}

