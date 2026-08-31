import "server-only";

import { assertProductionCutoverActivation } from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";
import {
  normalizeProductionPredictionSettingsAuthoring,
  productionPredictionSettingsPayloadHash,
  PRODUCTION_PREDICTION_SETTINGS_AUTHORING_CONTRACT,
  PRODUCTION_PREDICTION_SETTING_CATEGORIES,
  PRODUCTION_PREDICTION_SETTING_SPECS,
} from "./production-prediction-settings-contract.js";

const clean = (value) => String(value ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YEAR = /^20\d{2}$/;
const RPC_ALLOWLIST = new Set([
  "read_production_prediction_settings_authoring_v1",
  "stage_production_prediction_settings_revision_v1",
  "validate_production_prediction_settings_revision_v1",
  "commit_production_prediction_settings_revision_v1",
  "copy_production_prediction_settings_draft_v1",
]);

function settingsError(code, message, status = 503, diagnostics = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (diagnostics !== undefined) error.diagnostics = diagnostics;
  return error;
}

function exactUuid(value, code = "PREDICTION_SETTINGS_OPERATION_REQUEST_ID_REQUIRED") {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) throw settingsError(code, "A secure operation identity is required.", 400);
  return result;
}

function exactPlayerId(value) {
  const result = clean(value).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(result)) {
    throw settingsError(
      "PREDICTION_SETTINGS_DIRECTOR_AUTHORIZATION_REQUIRED",
      "Active Tournament Director access is required.",
      403,
    );
  }
  return result;
}

function exactTournament(value, fallback = PRODUCTION_TOURNAMENT_ID) {
  const result = clean(value || fallback);
  if (!YEAR.test(result)) {
    throw settingsError(
      "PREDICTION_SETTINGS_TOURNAMENT_REQUIRED",
      "Select a certified Production tournament.",
      400,
    );
  }
  return result;
}

function exactRevision(value) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw settingsError(
      "PREDICTION_SETTINGS_PREDECESSOR_REVISION_REQUIRED",
      "The exact current Prediction Settings revision is required.",
      400,
    );
  }
  return revision;
}

function fixedScope(input, {
  actorAuthUserId,
  actorPlayerId,
  actorTournamentId,
} = {}) {
  const currentTournamentId = exactTournament(actorTournamentId);
  const currentTournamentYear = Number(currentTournamentId);
  return {
    ...(input || {}),
    contract_version: PRODUCTION_PREDICTION_SETTINGS_AUTHORING_CONTRACT,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: currentTournamentId,
    tournament_year: currentTournamentYear,
    authorization: {
      tournament_id: currentTournamentId,
      auth_user_id: exactUuid(
        actorAuthUserId,
        "PREDICTION_SETTINGS_DIRECTOR_AUTHORIZATION_REQUIRED",
      ),
      player_id: exactPlayerId(actorPlayerId),
      role: "DIRECTOR",
    },
  };
}

function headers(secret) {
  const result = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) result.authorization = `Bearer ${secret}`;
  return result;
}

function safeCode(payload) {
  for (const candidate of [payload?.code, payload?.message, payload?.error?.code]) {
    const value = clean(candidate).toUpperCase();
    if (/^(?:PRODUCTION_)?PREDICTION_SETTINGS_[A-Z0-9_]{3,120}$/.test(value)) return value;
  }
  return "PREDICTION_SETTINGS_RPC_FAILED";
}

function statusFor(code, fallback = 409) {
  if (/(?:RPC_FAILED|UNAVAILABLE|RESPONSE_INVALID)$/.test(code)) return 503;
  if (/(?:AUTHORIZATION|DIRECTOR|SCOPE|RESOURCE)_REQUIRED$|FORBIDDEN$/.test(code)) return 403;
  if (/NOT_FOUND$/.test(code)) return 404;
  if (/(?:INPUT_INVALID|INVALID|REQUIRED|UNKNOWN_SETTING|COMPLETE_SCHEMA_REQUIRED)$/.test(code)) return 422;
  return fallback;
}

export async function productionPredictionSettingsRpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  activation: suppliedActivation,
} = {}) {
  const name = clean(functionName);
  if (!RPC_ALLOWLIST.has(name)) {
    throw settingsError(
      "PREDICTION_SETTINGS_RPC_FORBIDDEN",
      "The Prediction Settings operation is not allowlisted.",
      403,
    );
  }
  const activation = suppliedActivation || assertProductionCutoverActivation({
    env,
    requiredPhase: "OBSERVATION",
  });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw settingsError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "Prediction Settings are temporarily unavailable.",
    );
  }
  recordDataAuthorityTransport("supabase", {
    adapter: PRODUCTION_PREDICTION_SETTINGS_AUTHORING_CONTRACT,
    source: name,
  });
  const startedAt = Date.now();
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(secret),
    body: JSON.stringify({ input }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = safeCode(payload);
    throw settingsError(
      code,
      "The Prediction Settings operation did not complete.",
      statusFor(code, response.status),
    );
  }
  if (!payload || payload.ok !== true) {
    const code = safeCode(payload);
    throw settingsError(
      code,
      "The Prediction Settings operation did not complete.",
      statusFor(code),
      { issues: Array.isArray(payload?.issues) ? payload.issues : [] },
    );
  }
  return { payload, activation, durationMs: Date.now() - startedAt };
}

function actorScope(values = {}) {
  return {
    actorAuthUserId: values.actorAuthUserId,
    actorPlayerId: values.actorPlayerId,
    actorTournamentId: values.actorTournamentId,
  };
}

async function invoke(name, input, values, options) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const rpc = options.rpc || productionPredictionSettingsRpc;
  const result = await rpc(name, fixedScope(input, actorScope(values)), {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  return result.payload;
}

export async function readProductionPredictionSettingsAuthoring(values = {}, options = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId);
  const payload = await invoke(
    "read_production_prediction_settings_authoring_v1",
    {
      operation: "READ_PRODUCTION_PREDICTION_SETTINGS_AUTHORING_V1",
      target_tournament_id: targetTournamentId,
      history_limit: 30,
    },
    values,
    options,
  );
  return {
    ...payload.data,
    specifications: PRODUCTION_PREDICTION_SETTING_SPECS,
    categories: PRODUCTION_PREDICTION_SETTING_CATEGORIES,
  };
}

export async function stageProductionPredictionSettings(values = {}, options = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId);
  const normalized = normalizeProductionPredictionSettingsAuthoring(values.settings);
  const reason = clean(values.reason || "Prediction Settings Director review");
  const expectedRevision = exactRevision(values.expectedRevision);
  const requestPayloadHash = productionPredictionSettingsPayloadHash({
    operation: "STAGE",
    targetTournamentId,
    expectedRevision,
    canonicalSettings: normalized.canonicalSettings,
    reason,
  });
  return invoke(
    "stage_production_prediction_settings_revision_v1",
    {
      operation: "STAGE_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1",
      operation_request_id: exactUuid(values.operationRequestId),
      target_tournament_id: targetTournamentId,
      expected_configuration_revision: expectedRevision,
      canonical_settings: normalized.canonicalSettings,
      reason,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
}

export async function validateProductionPredictionSettings(values = {}, options = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId);
  const draftId = exactUuid(values.draftId, "PREDICTION_SETTINGS_DRAFT_ID_REQUIRED");
  const expectedRevision = exactRevision(values.expectedRevision);
  const requestPayloadHash = productionPredictionSettingsPayloadHash({
    operation: "VALIDATE",
    targetTournamentId,
    draftId,
    expectedRevision,
  });
  return invoke(
    "validate_production_prediction_settings_revision_v1",
    {
      operation: "VALIDATE_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1",
      operation_request_id: exactUuid(values.operationRequestId),
      target_tournament_id: targetTournamentId,
      draft_id: draftId,
      expected_configuration_revision: expectedRevision,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
}

export async function commitProductionPredictionSettings(values = {}, options = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId);
  const draftId = exactUuid(values.draftId, "PREDICTION_SETTINGS_DRAFT_ID_REQUIRED");
  const expectedRevision = exactRevision(values.expectedRevision);
  const confirmation = clean(values.confirmation);
  const requestPayloadHash = productionPredictionSettingsPayloadHash({
    operation: "COMMIT",
    targetTournamentId,
    draftId,
    expectedRevision,
    confirmation,
  });
  return invoke(
    "commit_production_prediction_settings_revision_v1",
    {
      operation: "COMMIT_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1",
      operation_request_id: exactUuid(values.operationRequestId),
      target_tournament_id: targetTournamentId,
      draft_id: draftId,
      expected_configuration_revision: expectedRevision,
      confirmation,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
}

export async function copyProductionPredictionSettingsDraft(values = {}, options = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId);
  const sourceTournamentId = exactTournament(values.sourceTournamentId);
  const expectedRevision = exactRevision(values.expectedRevision);
  const reason = clean(values.reason || "Copy prior Prediction Settings for Director review");
  const requestPayloadHash = productionPredictionSettingsPayloadHash({
    operation: "COPY",
    targetTournamentId,
    sourceTournamentId,
    expectedRevision,
    reason,
  });
  return invoke(
    "copy_production_prediction_settings_draft_v1",
    {
      operation: "COPY_PRODUCTION_PREDICTION_SETTINGS_DRAFT_V1",
      operation_request_id: exactUuid(values.operationRequestId),
      target_tournament_id: targetTournamentId,
      source_tournament_id: sourceTournamentId,
      expected_configuration_revision: expectedRevision,
      reason,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
}

export const PRODUCTION_PREDICTION_SETTINGS_PLATFORM = Object.freeze({
  tournamentId: PRODUCTION_TOURNAMENT_ID,
  tournamentYear: PRODUCTION_TOURNAMENT_YEAR,
});
