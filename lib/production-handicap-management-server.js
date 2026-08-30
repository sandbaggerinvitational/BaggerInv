import "server-only";

import {
  assertProductionCutoverActivation,
} from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";
import {
  canonicalProductionHandicapEntries,
  productionHandicapPayloadHash,
  PRODUCTION_HANDICAP_REVISION_CONTRACT,
} from "./production-handicap-contract.js";

export { PRODUCTION_HANDICAP_REVISION_CONTRACT };

const clean = (value) => String(value ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAYER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RPC_ALLOWLIST = new Set([
  "read_production_handicap_revision_v1",
  "read_production_handicap_revision_history_v1",
  "stage_production_handicap_revision_v1",
  "validate_production_handicap_revision_v1",
  "approve_production_handicap_revision_v1",
]);

function handicapError(code, message, status = 503, diagnostics = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (diagnostics !== undefined) error.diagnostics = diagnostics;
  return error;
}

function rpcHeaders(secret) {
  const headers = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  return headers;
}

function safeRpcFailureCode(payload) {
  const message = clean(payload?.message).toUpperCase();
  return /^(?:PRODUCTION_)?HANDICAP_[A-Z0-9_]{3,120}$/.test(message)
    ? message
    : "PRODUCTION_HANDICAP_RPC_FAILED";
}

function exactUuid(value, code, message) {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) throw handicapError(code, message, 400);
  return result;
}

function exactRevision(value, code = "PRODUCTION_HANDICAP_PREDECESSOR_REVISION_REQUIRED") {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw handicapError(code, "The exact current handicap revision is required.", 400);
  }
  return result;
}

function exactDate(value) {
  const result = clean(value);
  const parsed = Date.parse(`${result}T00:00:00.000Z`);
  if (!DATE.test(result) || !Number.isFinite(parsed) ||
      new Date(parsed).toISOString().slice(0, 10) !== result) {
    throw handicapError(
      "PRODUCTION_HANDICAP_EFFECTIVE_DATE_REQUIRED",
      "A valid handicap effective date is required.",
      400,
    );
  }
  return result;
}

function exactPlayerId(value) {
  const result = clean(value).toUpperCase();
  if (!PLAYER_ID.test(result)) {
    throw handicapError(
      "PRODUCTION_HANDICAP_PLAYER_ID_REQUIRED",
      "Every handicap entry must use a stable Production Player ID.",
      400,
    );
  }
  return result;
}

function directorAuthorization({ actorAuthUserId, actorPlayerId } = {}) {
  return {
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    auth_user_id: exactUuid(
      actorAuthUserId,
      "PRODUCTION_HANDICAP_DIRECTOR_AUTHORIZATION_REQUIRED",
      "An active Production Director identity is required.",
    ),
    player_id: exactPlayerId(actorPlayerId),
    role: "DIRECTOR",
  };
}

function fixedScope(input, authorization) {
  return {
    ...(input || {}),
    contract_version: PRODUCTION_HANDICAP_REVISION_CONTRACT,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    authorization,
  };
}

/** Fixed-resource, server-only transport for the reviewed handicap RPC set. */
export async function productionHandicapRevisionRpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  activation: suppliedActivation,
} = {}) {
  const name = clean(functionName);
  if (!RPC_ALLOWLIST.has(name)) {
    throw handicapError(
      "PRODUCTION_HANDICAP_RPC_FORBIDDEN",
      "The Production handicap operation is not allowlisted.",
      403,
    );
  }
  const activation = suppliedActivation || assertProductionCutoverActivation({
    env,
    requiredPhase: "OBSERVATION",
  });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw handicapError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "The Production server credential is unavailable.",
    );
  }
  recordDataAuthorityTransport("supabase", {
    adapter: "production-handicap-revision-v1",
    source: name,
  });
  const scopedInput = {
    ...(input || {}),
    contract_version: PRODUCTION_HANDICAP_REVISION_CONTRACT,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
  };
  const startedAt = Date.now();
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: rpcHeaders(secret),
    body: JSON.stringify({ input: scopedInput }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = safeRpcFailureCode(payload);
    throw handicapError(
      code,
      `Production handicap RPC failed (${response.status}).`,
      response.status,
      { functionName: name, providerCode: code },
    );
  }
  return { ok: true, payload, activation, durationMs: Date.now() - startedAt };
}

function rpcPayload(result) {
  const payload = result?.payload;
  if (!payload || typeof payload !== "object") {
    throw handicapError(
      "PRODUCTION_HANDICAP_RESPONSE_INVALID",
      "The Production handicap response was incomplete.",
    );
  }
  if (payload.ok !== true) {
    throw handicapError(
      /^(?:PRODUCTION_)?HANDICAP_[A-Z0-9_]{3,120}$/.test(clean(payload.code))
        ? clean(payload.code)
        : "PRODUCTION_HANDICAP_OPERATION_FAILED",
      "The Production handicap operation did not complete.",
      409,
      { validation: payload.validation || null },
    );
  }
  return payload;
}

function mutationEnvelope(operation, operationRequestId, payload) {
  const requestId = exactUuid(
    operationRequestId,
    "PRODUCTION_HANDICAP_OPERATION_REQUEST_ID_REQUIRED",
    "A secure handicap operation identity is required.",
  );
  return {
    ...payload,
    operation,
    operation_request_id: requestId,
    request_payload_hash: productionHandicapPayloadHash({ operation, ...payload }),
  };
}

export async function readProductionHandicapManagement({
  actorAuthUserId,
  actorPlayerId,
  historyLimit = 30,
} = {}, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const rpc = options.rpc || productionHandicapRevisionRpc;
  const authorization = directorAuthorization({ actorAuthUserId, actorPlayerId });
  const limit = Number(historyLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw handicapError(
      "PRODUCTION_HANDICAP_HISTORY_LIMIT_INVALID",
      "The handicap revision history limit is invalid.",
      400,
    );
  }
  const [currentResult, historyResult] = await Promise.all([
    rpc("read_production_handicap_revision_v1", fixedScope({
      operation: "READ_PRODUCTION_HANDICAP_REVISION_V1",
    }, authorization), { env, activation, ...(options.rpcOptions || {}) }),
    rpc("read_production_handicap_revision_history_v1", fixedScope({
      operation: "READ_PRODUCTION_HANDICAP_REVISION_HISTORY_V1",
      limit,
    }, authorization), { env, activation, ...(options.rpcOptions || {}) }),
  ]);
  const current = rpcPayload(currentResult);
  const history = rpcPayload(historyResult);
  return {
    tournamentId: PRODUCTION_TOURNAMENT_ID,
    tournamentYear: PRODUCTION_TOURNAMENT_YEAR,
    revision: Number(current.current_revision ?? current.revision_number ?? current.revision ?? 0),
    suggestedEffectiveDate: clean(current.suggested_effective_date),
    current,
    players: Array.isArray(current.players) ? current.players : [],
    history: Array.isArray(history.revisions) ? history.revisions : [],
  };
}

export async function readProductionHandicapCurrent({
  actorAuthUserId,
  actorPlayerId,
} = {}, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const rpc = options.rpc || productionHandicapRevisionRpc;
  const result = await rpc("read_production_handicap_revision_v1", fixedScope({
    operation: "READ_PRODUCTION_HANDICAP_REVISION_V1",
  }, directorAuthorization({ actorAuthUserId, actorPlayerId })), {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  return rpcPayload(result);
}

async function mutationRpc(functionName, input, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const rpc = options.rpc || productionHandicapRevisionRpc;
  const result = await rpc(functionName, input, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  return rpcPayload(result);
}

export async function stageProductionHandicapRevision({
  actorAuthUserId,
  actorPlayerId,
  expectedRevision,
  effectiveDate,
  entries,
  operationRequestId,
} = {}, options = {}) {
  const authorization = directorAuthorization({ actorAuthUserId, actorPlayerId });
  const payload = fixedScope({
    expected_predecessor_revision: exactRevision(expectedRevision),
    effective_date: exactDate(effectiveDate),
    method: "DIRECTOR_WEEKLY_HANDICAP_REVIEW",
    source_metadata: {
      entry_mode: "PRODUCTION_DIRECTOR_CONSOLE",
      decimal_semantics: "EXACT_SIGNED_DECIMAL",
    },
    source_evidence_date: null,
    entries: canonicalProductionHandicapEntries(entries),
  }, authorization);
  return mutationRpc("stage_production_handicap_revision_v1", mutationEnvelope(
    "STAGE_PRODUCTION_HANDICAP_REVISION_V1",
    operationRequestId,
    payload,
  ), options);
}

export async function validateProductionHandicapRevision({
  actorAuthUserId,
  actorPlayerId,
  revisionId,
  expectedRevision,
  operationRequestId,
} = {}, options = {}) {
  const payload = fixedScope({
    revision_id: exactUuid(
      revisionId,
      "PRODUCTION_HANDICAP_REVISION_ID_REQUIRED",
      "The staged handicap revision is required.",
    ),
    expected_predecessor_revision: exactRevision(expectedRevision),
  }, directorAuthorization({ actorAuthUserId, actorPlayerId }));
  return mutationRpc("validate_production_handicap_revision_v1", mutationEnvelope(
    "VALIDATE_PRODUCTION_HANDICAP_REVISION_V1",
    operationRequestId,
    payload,
  ), options);
}

export async function approveProductionHandicapRevision({
  actorAuthUserId,
  actorPlayerId,
  revisionId,
  expectedRevision,
  operationRequestId,
  confirmation,
} = {}, options = {}) {
  if (!confirmation || !DATE.test(clean(confirmation.effectiveDate)) ||
      !Number.isSafeInteger(Number(confirmation.changedPlayerCount)) ||
      Number(confirmation.changedPlayerCount) < 1 ||
      !Number.isSafeInteger(Number(confirmation.affectedMatchCount)) ||
      Number(confirmation.affectedMatchCount) < 0 ||
      !Number.isSafeInteger(Number(confirmation.refreshableMatchCount)) ||
      Number(confirmation.refreshableMatchCount) < 0 ||
      !Number.isSafeInteger(Number(confirmation.frozenMatchCount)) ||
      Number(confirmation.frozenMatchCount) < 0 ||
      Number(confirmation.affectedMatchCount) !==
        Number(confirmation.refreshableMatchCount) + Number(confirmation.frozenMatchCount)) {
    throw handicapError(
      "PRODUCTION_HANDICAP_APPROVAL_CONFIRMATION_REQUIRED",
      "Review and confirm the complete handicap impact before approval.",
      400,
    );
  }
  const payload = fixedScope({
    revision_id: exactUuid(
      revisionId,
      "PRODUCTION_HANDICAP_REVISION_ID_REQUIRED",
      "The staged handicap revision is required.",
    ),
    expected_predecessor_revision: exactRevision(expectedRevision),
    confirmation: {
      effective_date: exactDate(confirmation.effectiveDate),
      changed_player_count: Number(confirmation.changedPlayerCount),
      affected_match_count: Number(confirmation.affectedMatchCount),
      unstarted_refresh_count: Number(confirmation.refreshableMatchCount),
      started_preserved_count: Number(confirmation.frozenMatchCount),
    },
  }, directorAuthorization({ actorAuthUserId, actorPlayerId }));
  return mutationRpc("approve_production_handicap_revision_v1", mutationEnvelope(
    "APPROVE_PRODUCTION_HANDICAP_REVISION_V1",
    operationRequestId,
    payload,
  ), options);
}
