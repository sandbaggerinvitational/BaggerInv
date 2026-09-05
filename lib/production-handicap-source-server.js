import "server-only";

import { assertProductionCutoverActivation } from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";
import {
  canonicalBulkManualHandicapSourcePreviewInput,
  canonicalBulkManualHandicapSourceSaveInput,
  canonicalGhinIdentityInput,
  canonicalGhinRetirementInput,
  canonicalHybridDraftInput,
  canonicalManualHandicapSourceInput,
  productionHandicapSourcePayloadHash,
  PRODUCTION_HANDICAP_SOURCE_CONTRACT,
} from "./production-handicap-source-contract.js";

const clean = (value) => String(value ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAYER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const RPC_ALLOWLIST = new Set([
  "read_production_handicap_source_v1",
  "set_production_player_ghin_identity_v1",
  "retire_production_player_ghin_identity_v1",
  "record_production_manual_handicap_source_v1",
  "preview_production_bulk_manual_handicap_source_v1",
  "record_production_bulk_manual_handicap_source_v1",
  "stage_production_handicap_revision_from_hybrid_v1",
]);

function sourceError(code, message, status = 503, diagnostics) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (diagnostics) error.diagnostics = diagnostics;
  return error;
}

function exactUuid(value) {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) throw sourceError("PRODUCTION_HANDICAP_SOURCE_OPERATION_ID_REQUIRED", "A secure operation identity is required.", 400);
  return result;
}

function authorization({ actorAuthUserId, actorPlayerId } = {}) {
  const authUserId = clean(actorAuthUserId).toLowerCase();
  const playerId = clean(actorPlayerId).toUpperCase();
  if (!UUID.test(authUserId) || !PLAYER_ID.test(playerId)) {
    throw sourceError("PRODUCTION_HANDICAP_SOURCE_DIRECTOR_REQUIRED", "An active Production Director is required.", 403);
  }
  return { tournament_id: PRODUCTION_TOURNAMENT_ID, auth_user_id: authUserId, player_id: playerId, role: "DIRECTOR" };
}

function scoped(payload, actor) {
  return {
    ...payload,
    contract_version: PRODUCTION_HANDICAP_SOURCE_CONTRACT,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    actor_player_id: actor.player_id,
    actor_auth_user_id: actor.auth_user_id,
    authorization: actor,
  };
}

function rpcHeaders(secret) {
  const headers = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  return headers;
}

export async function productionHandicapSourceRpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  activation: suppliedActivation,
} = {}) {
  const name = clean(functionName);
  if (!RPC_ALLOWLIST.has(name)) throw sourceError("PRODUCTION_HANDICAP_SOURCE_RPC_FORBIDDEN", "The source operation is not allowlisted.", 403);
  const activation = suppliedActivation || assertProductionCutoverActivation({ env, requiredPhase: "OBSERVATION" });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) throw sourceError("PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED", "The Production server credential is unavailable.");
  recordDataAuthorityTransport("supabase", { adapter: "production-handicap-source-v1", source: name });
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: rpcHeaders(secret),
    body: JSON.stringify({ input }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = /^PRODUCTION_(?:GHIN|HANDICAP_SOURCE)_[A-Z0-9_]+$/.test(clean(payload?.message).toUpperCase())
      ? clean(payload.message).toUpperCase() : "PRODUCTION_HANDICAP_SOURCE_RPC_FAILED";
    throw sourceError(code, `Production handicap source operation failed (${response.status}).`, response.status);
  }
  if (!payload || payload.ok !== true) {
    throw sourceError(
      /^PRODUCTION_(?:GHIN|HANDICAP_SOURCE)_[A-Z0-9_]+$/.test(clean(payload?.code).toUpperCase())
        ? clean(payload.code).toUpperCase() : "PRODUCTION_HANDICAP_SOURCE_OPERATION_FAILED",
      "The handicap source operation did not complete.",
      409,
      { payload },
    );
  }
  return { ...payload, activation };
}

async function invoke(name, actorInput, payload, options = {}, requestId = null) {
  const actor = authorization(actorInput);
  let input = scoped(payload, actor);
  if (requestId) {
    input = { ...input, operation_request_id: exactUuid(requestId) };
    input.request_payload_hash = productionHandicapSourcePayloadHash(input);
  }
  return (options.rpc || productionHandicapSourceRpc)(name, input, options);
}

export function readProductionHandicapSource(actorInput, options = {}) {
  return invoke("read_production_handicap_source_v1", actorInput, {
    operation: "READ_PRODUCTION_HANDICAP_SOURCE_V1",
  }, options);
}

export function setProductionPlayerGhinIdentity({ operationRequestId, ...input }, options = {}) {
  return invoke("set_production_player_ghin_identity_v1", input, {
    operation: "SET_PRODUCTION_PLAYER_GHIN_IDENTITY_V1",
    ...canonicalGhinIdentityInput(input),
  }, options, operationRequestId);
}

export function retireProductionPlayerGhinIdentity({ operationRequestId, ...input }, options = {}) {
  return invoke("retire_production_player_ghin_identity_v1", input, {
    operation: "RETIRE_PRODUCTION_PLAYER_GHIN_IDENTITY_V1",
    ...canonicalGhinRetirementInput(input),
  }, options, operationRequestId);
}

export function recordProductionManualHandicapSource({ operationRequestId, ...input }, options = {}) {
  return invoke("record_production_manual_handicap_source_v1", input, {
    operation: "RECORD_PRODUCTION_MANUAL_HANDICAP_SOURCE_V1",
    ...canonicalManualHandicapSourceInput(input),
  }, options, operationRequestId);
}

export function previewProductionBulkManualHandicapSource(input, options = {}) {
  return invoke("preview_production_bulk_manual_handicap_source_v1", input, {
    operation: "PREVIEW_PRODUCTION_BULK_MANUAL_HANDICAP_SOURCE_V1",
    ...canonicalBulkManualHandicapSourcePreviewInput(input),
  }, options);
}

export function recordProductionBulkManualHandicapSource({ operationRequestId, ...input }, options = {}) {
  return invoke("record_production_bulk_manual_handicap_source_v1", input, {
    operation: "RECORD_PRODUCTION_BULK_MANUAL_HANDICAP_SOURCE_V1",
    ...canonicalBulkManualHandicapSourceSaveInput(input),
  }, options, operationRequestId);
}

export function stageProductionHybridHandicapDraft({ operationRequestId, ...input }, options = {}) {
  return invoke("stage_production_handicap_revision_from_hybrid_v1", input, {
    operation: "STAGE_PRODUCTION_HANDICAP_REVISION_FROM_HYBRID_V1",
    ...canonicalHybridDraftInput(input),
  }, options, operationRequestId);
}
