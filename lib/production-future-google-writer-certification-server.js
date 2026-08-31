import "server-only";

import { createHash } from "node:crypto";

import { recordDataAuthorityTransport } from "./data-authority-request.js";
import { assertProductionCutoverActivation } from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";
import {
  PRODUCTION_FUTURE_RUNTIME_ACTIVATION_CONTRACT,
  stableFutureYearAdministrationValue,
} from "./production-future-year-administration-contract.js";

export const PRODUCTION_FUTURE_GOOGLE_WRITER_CERTIFICATION_ACTIONS =
  Object.freeze([
    "adopt-destination",
    "certify-writer-target",
  ]);

const RPC_BY_ACTION = Object.freeze({
  "adopt-destination": "adopt_production_future_google_destination_v1",
  "certify-writer-target":
    "certify_production_future_google_writer_target_v1",
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value) => String(value ?? "").trim();

function certificationError(code, message, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function actorUuid(value) {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) {
    throw certificationError(
      "PRODUCTION_FUTURE_GOOGLE_OWNER_REQUIRED",
      "Active Production Owner access is required.",
      403,
    );
  }
  return result;
}

function actorPlayerId(value) {
  const result = clean(value).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(result)) {
    throw certificationError(
      "PRODUCTION_FUTURE_GOOGLE_OWNER_REQUIRED",
      "Active Production Owner access is required.",
      403,
    );
  }
  return result;
}

function targetTournamentId(value) {
  const result = clean(value);
  if (!/^\d{4}$/.test(result) || Number(result) <= PRODUCTION_TOURNAMENT_YEAR) {
    throw certificationError(
      "PRODUCTION_FUTURE_GOOGLE_TARGET_INVALID",
      "Select a valid future tournament.",
      400,
    );
  }
  return result;
}

function operationId(value) {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) {
    throw certificationError(
      "PRODUCTION_FUTURE_GOOGLE_OPERATION_ID_REQUIRED",
      "A secure operation identity is required.",
      400,
    );
  }
  return result;
}

function revision(value, name, { allowZero = false } = {}) {
  const result = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(result) || result < minimum) {
    throw certificationError(
      "PRODUCTION_FUTURE_GOOGLE_REVISION_REQUIRED",
      `Refresh the authoritative ${name} revision before continuing.`,
      400,
    );
  }
  return result;
}

function reason(value) {
  const result = clean(value).replace(/\s+/g, " ");
  if (result.length < 8 || result.length > 500 || /[\r\n\t]/.test(result)) {
    throw certificationError(
      "PRODUCTION_FUTURE_GOOGLE_REASON_REQUIRED",
      "Enter a concise non-sensitive reason.",
      400,
    );
  }
  return result;
}

function payloadHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableFutureYearAdministrationValue(value)))
    .digest("hex");
}

function headers(secret) {
  const result = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) {
    result.authorization = `Bearer ${secret}`;
  }
  return result;
}

function providerCode(payload) {
  for (const value of [payload?.code, payload?.message, payload?.error?.code]) {
    const candidate = clean(value).toUpperCase();
    if (/^PRODUCTION_FUTURE_GOOGLE_[A-Z0-9_]{3,120}$/.test(candidate)) {
      return candidate;
    }
  }
  return "PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_FAILED";
}

function statusForCode(code, fallback = 409) {
  if (/(?:OWNER|DIRECTOR|SERVICE_ROLE|SCOPE)_REQUIRED$/.test(code)) return 403;
  if (/(?:CONFLICT|PREDECESSOR_INVALID|STALE)/.test(code)) return 409;
  if (/(?:INPUT|TARGET|HASH|OPERATION_ID|REVISION|REASON)_INVALID$/.test(code) ||
      /_REQUIRED$/.test(code)) return 400;
  return fallback >= 400 && fallback < 600 ? fallback : 503;
}

function fixedScope({
  action,
  actorAuthUserId,
  actorPlayerId: suppliedPlayerId,
  targetTournamentId: suppliedTarget,
  expectedResourceRevision,
  expectedSetupRevision,
  expectedPromotionRevision,
  operationRequestId,
  reason: suppliedReason,
}) {
  const selected = clean(action).toLowerCase();
  if (!PRODUCTION_FUTURE_GOOGLE_WRITER_CERTIFICATION_ACTIONS.includes(selected)) {
    throw certificationError(
      "PRODUCTION_FUTURE_GOOGLE_ACTION_INVALID",
      "Select a supported annual writer certification stage.",
      400,
    );
  }
  const authUserId = actorUuid(actorAuthUserId);
  const playerId = actorPlayerId(suppliedPlayerId);
  const target = targetTournamentId(suppliedTarget);
  const payload = {
    action: selected === "adopt-destination"
      ? "ADOPT_ANNUAL_GOOGLE_DESTINATION"
      : "CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET",
    contract_version: PRODUCTION_FUTURE_RUNTIME_ACTIVATION_CONTRACT,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    // This is the exact-resource assertion consumed by the existing scope
    // guard. It is server-derived and is never accepted from request input.
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    target_tournament_id: target,
    expected_resource_revision: revision(
      expectedResourceRevision,
      "annual resource",
    ),
    expected_setup_revision: revision(
      expectedSetupRevision,
      "tournament setup",
      { allowZero: selected === "adopt-destination" },
    ),
    operation_request_id: operationId(operationRequestId),
    reason: reason(suppliedReason),
    authorization: {
      tournament_id: PRODUCTION_TOURNAMENT_ID,
      auth_user_id: authUserId,
      player_id: playerId,
      role: "DIRECTOR",
    },
  };
  if (selected === "certify-writer-target") {
    payload.expected_promotion_revision = revision(
      expectedPromotionRevision,
      "runtime promotion",
    );
  }
  return { selected, payload };
}

export async function productionFutureGoogleWriterCertificationRpc(
  functionName,
  input,
  {
    env = process.env,
    fetchImpl = fetch,
    timeoutMs = 20_000,
    activation: suppliedActivation,
  } = {},
) {
  if (!Object.values(RPC_BY_ACTION).includes(functionName)) {
    throw certificationError(
      "PRODUCTION_FUTURE_GOOGLE_RPC_FORBIDDEN",
      "The annual writer certification operation is not allowlisted.",
      403,
    );
  }
  const activation = suppliedActivation || assertProductionCutoverActivation({
    env,
    requiredPhase: "OBSERVATION",
  });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw certificationError(
      "PRODUCTION_FUTURE_GOOGLE_SERVICE_CREDENTIAL_REQUIRED",
      "Annual writer certification is temporarily unavailable.",
    );
  }
  recordDataAuthorityTransport("supabase", {
    adapter: "production-annual-google-writer-certification-v1",
    source: functionName,
  });
  const response = await fetchImpl(
    `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: headers(secret),
      body: JSON.stringify({ input }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const code = providerCode(result);
    throw certificationError(
      code,
      "The annual writer certification operation did not complete.",
      statusForCode(code, response.status),
    );
  }
  return { payload: result, activation };
}

export async function certifyProductionFutureGoogleWriter(input = {}, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const { selected, payload } = fixedScope(input);
  const bounded = {
    ...payload,
    request_payload_hash: payloadHash(payload),
  };
  const rpc = options.rpc || productionFutureGoogleWriterCertificationRpc;
  const response = await rpc(RPC_BY_ACTION[selected], bounded, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  const result = response?.payload?.data || response?.payload?.result ||
    response?.payload;
  if (!result || result.ok !== true) {
    const code = providerCode(result);
    throw certificationError(
      code,
      "The annual writer certification operation did not complete.",
      statusForCode(code),
    );
  }
  return Object.freeze({
    ...result,
    action: clean(result.action || payload.action),
    targetTournamentId: clean(
      result.targetTournamentId || result.target_tournament_id ||
      payload.target_tournament_id,
    ),
    googleWrites: Number(result.googleWrites || result.google_writes || 0),
    jobsClaimed: Number(result.jobsClaimed || result.jobs_claimed || 0),
    idempotent: result.idempotent === true,
  });
}
