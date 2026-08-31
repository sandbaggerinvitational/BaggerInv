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
  normalizeProductionDraftAuthoring,
  productionDraftAuthoringPayloadHash,
  PRODUCTION_DRAFT_AUTHORING_CONTRACT,
  PRODUCTION_DRAFT_CONFIGURATION_FIELDS,
  PRODUCTION_DRAFT_PICK_FIELDS,
  PRODUCTION_DRAFT_STATUS_MODES,
} from "./production-draft-authoring-contract.js";

const clean = (value) => String(value ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YEAR = /^20\d{2}$/;
const RPC_ALLOWLIST = new Set([
  "read_production_draft_authoring_v1",
  "stage_production_draft_revision_v1",
  "validate_production_draft_revision_v1",
  "commit_production_draft_revision_v1",
  "copy_production_draft_setup_v1",
]);

function draftError(code, message, status = 503, diagnostics = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (diagnostics !== undefined) error.diagnostics = diagnostics;
  return error;
}

function exactUuid(value, code = "DRAFT_OPERATION_REQUEST_ID_REQUIRED") {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) throw draftError(code, "A secure operation identity is required.", 400);
  return result;
}

function exactPlayerId(value) {
  const result = clean(value).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(result)) {
    throw draftError("DRAFT_DIRECTOR_AUTHORIZATION_REQUIRED", "Active Tournament Director access is required.", 403);
  }
  return result;
}

function exactTournament(value, fallback = "") {
  const result = clean(value || fallback);
  if (!YEAR.test(result)) {
    throw draftError("DRAFT_TOURNAMENT_REQUIRED", "Select a certified Production tournament.", 400);
  }
  return result;
}

function exactRevision(value) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw draftError("DRAFT_PREDECESSOR_REVISION_REQUIRED", "The exact current Draft revision is required.", 400);
  }
  return revision;
}

function fixedScope(input, {
  actorAuthUserId,
  actorPlayerId,
  actorTournamentId,
} = {}) {
  const currentTournamentId = exactTournament(actorTournamentId);
  return {
    ...(input || {}),
    contract_version: PRODUCTION_DRAFT_AUTHORING_CONTRACT,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    // This is immutable resource-scope evidence, not Draft provenance. New
    // revisions record Director/Supabase provenance in the database.
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: currentTournamentId,
    tournament_year: Number(currentTournamentId),
    authorization: {
      tournament_id: currentTournamentId,
      auth_user_id: exactUuid(actorAuthUserId, "DRAFT_DIRECTOR_AUTHORIZATION_REQUIRED"),
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
    if (/^(?:PRODUCTION_)?DRAFT_[A-Z0-9_]{3,120}$/.test(value)) return value;
  }
  return "DRAFT_RPC_FAILED";
}

function statusFor(code, fallback = 409) {
  if (/(?:RPC_FAILED|UNAVAILABLE|RESPONSE_INVALID)$/.test(code)) return 503;
  if (/(?:AUTHORIZATION|DIRECTOR|SCOPE|RESOURCE)_REQUIRED$|FORBIDDEN$/.test(code)) return 403;
  if (/NOT_FOUND$/.test(code)) return 404;
  if (/(?:INPUT_INVALID|INVALID|REQUIRED|UNKNOWN_FIELD)$/.test(code)) return 422;
  return fallback;
}

export async function productionDraftAuthoringRpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  activation: suppliedActivation,
} = {}) {
  const name = clean(functionName);
  if (!RPC_ALLOWLIST.has(name)) {
    throw draftError("DRAFT_RPC_FORBIDDEN", "The Draft operation is not allowlisted.", 403);
  }
  const activation = suppliedActivation || assertProductionCutoverActivation({ env, requiredPhase: "OBSERVATION" });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw draftError("PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED", "Draft authoring is temporarily unavailable.");
  }
  recordDataAuthorityTransport("supabase", {
    adapter: PRODUCTION_DRAFT_AUTHORING_CONTRACT,
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
    throw draftError(code, "The Draft operation did not complete.", statusFor(code, response.status));
  }
  if (!payload || payload.ok !== true) {
    const code = safeCode(payload);
    throw draftError(
      code,
      "The Draft operation did not complete.",
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

function withCanonicalPickCount(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = value.pickCount ?? value.pick_count ??
    value.selectedPickCount ?? value.selected_pick_count;
  if (raw === undefined || raw === null || raw === "") return value;
  const pickCount = Number(raw);
  return Number.isSafeInteger(pickCount) && pickCount >= 0
    ? { ...value, pickCount }
    : value;
}

async function invoke(name, input, values, options) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const rpc = options.rpc || productionDraftAuthoringRpc;
  const result = await rpc(name, fixedScope(input, actorScope(values)), {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  return result.payload;
}

export async function readProductionDraftAuthoring(values = {}, options = {}) {
  // An omitted read target follows the authenticated Production Director's
  // current annual entitlement. Mutations below require an explicit target.
  const targetTournamentId = exactTournament(
    values.targetTournamentId,
    values.actorTournamentId,
  );
  const payload = await invoke(
    "read_production_draft_authoring_v1",
    {
      operation: "READ_PRODUCTION_DRAFT_AUTHORING_V1",
      target_tournament_id: targetTournamentId,
      target_tournament_year: Number(targetTournamentId),
      history_limit: 30,
    },
    values,
    options,
  );
  const data = payload.data || {};
  return {
    ...data,
    targetTournamentId: clean(data.targetTournamentId || data.tournamentId || targetTournamentId),
    tournamentId: clean(data.tournamentId || data.targetTournamentId || targetTournamentId),
    tournamentYear: Number(data.tournamentYear || targetTournamentId),
    currentTournamentId: clean(data.currentTournamentId || values.actorTournamentId || PRODUCTION_TOURNAMENT_ID),
    current: data.current || null,
    history: Array.isArray(data.history) ? data.history.map(withCanonicalPickCount) : [],
    targets: Array.isArray(data.targets) ? data.targets : [],
    teams: Array.isArray(data.teams) ? data.teams : [],
    eligiblePlayers: Array.isArray(data.eligiblePlayers)
      ? data.eligiblePlayers
      : Array.isArray(data.eligible_players) ? data.eligible_players : [],
    openDraft: data.openDraft || data.open_draft || data.draft || null,
    specifications: {
      contractVersion: PRODUCTION_DRAFT_AUTHORING_CONTRACT,
      statusModes: PRODUCTION_DRAFT_STATUS_MODES,
      configurationFields: PRODUCTION_DRAFT_CONFIGURATION_FIELDS,
      pickFields: PRODUCTION_DRAFT_PICK_FIELDS,
      commitConfirmation: "SAVE DRAFT REVISION",
      supportsRecordPick: false,
      supportsReset: false,
    },
  };
}

export async function stageProductionDraftRevision(values = {}, options = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId);
  const expectedRevision = exactRevision(values.expectedRevision);
  const normalized = normalizeProductionDraftAuthoring({
    configuration: values.configuration,
    picks: values.picks,
  });
  if (normalized.configuration.year !== Number(targetTournamentId)) {
    throw draftError("DRAFT_TOURNAMENT_SCOPE_MISMATCH", "Draft Setup must match the selected tournament.", 422);
  }
  const reason = clean(values.reason || "Draft Director review");
  const requestPayloadHash = productionDraftAuthoringPayloadHash({
    operation: "STAGE",
    targetTournamentId,
    expectedRevision,
    configuration: normalized.configuration,
    picks: normalized.picks,
    reason,
  });
  return invoke(
    "stage_production_draft_revision_v1",
    {
      operation: "STAGE_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: exactUuid(values.operationRequestId),
      target_tournament_id: targetTournamentId,
      target_tournament_year: Number(targetTournamentId),
      expected_revision: expectedRevision,
      configuration: normalized.configuration,
      picks: normalized.picks,
      reason,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
}

export async function validateProductionDraftRevision(values = {}, options = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId);
  const draftId = exactUuid(values.draftId, "DRAFT_DRAFT_ID_REQUIRED");
  const expectedRevision = exactRevision(values.expectedRevision);
  const requestPayloadHash = productionDraftAuthoringPayloadHash({
    operation: "VALIDATE",
    targetTournamentId,
    draftId,
    expectedRevision,
  });
  return invoke(
    "validate_production_draft_revision_v1",
    {
      operation: "VALIDATE_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: exactUuid(values.operationRequestId),
      target_tournament_id: targetTournamentId,
      target_tournament_year: Number(targetTournamentId),
      draft_id: draftId,
      expected_revision: expectedRevision,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
}

export async function commitProductionDraftRevision(values = {}, options = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId);
  const draftId = exactUuid(values.draftId, "DRAFT_DRAFT_ID_REQUIRED");
  const expectedRevision = exactRevision(values.expectedRevision);
  const confirmation = clean(values.confirmation);
  const requestPayloadHash = productionDraftAuthoringPayloadHash({
    operation: "COMMIT",
    targetTournamentId,
    draftId,
    expectedRevision,
    confirmation,
  });
  const result = await invoke(
    "commit_production_draft_revision_v1",
    {
      operation: "COMMIT_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: exactUuid(values.operationRequestId),
      target_tournament_id: targetTournamentId,
      target_tournament_year: Number(targetTournamentId),
      draft_id: draftId,
      expected_revision: expectedRevision,
      confirmation,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
  return withCanonicalPickCount(result);
}

export async function copyProductionDraftSetup(values = {}, options = {}) {
  const targetTournamentId = exactTournament(values.targetTournamentId);
  const sourceTournamentId = exactTournament(values.sourceTournamentId);
  const expectedRevision = exactRevision(values.expectedRevision);
  const reason = clean(values.reason || "Copy prior Draft Setup for Director review");
  const requestPayloadHash = productionDraftAuthoringPayloadHash({
    operation: "COPY_PREVIOUS",
    targetTournamentId,
    sourceTournamentId,
    expectedRevision,
    reason,
  });
  return invoke(
    "copy_production_draft_setup_v1",
    {
      operation: "COPY_PRODUCTION_DRAFT_SETUP_V1",
      operation_request_id: exactUuid(values.operationRequestId),
      target_tournament_id: targetTournamentId,
      target_tournament_year: Number(targetTournamentId),
      source_tournament_id: sourceTournamentId,
      expected_revision: expectedRevision,
      reason,
      request_payload_hash: requestPayloadHash,
    },
    values,
    options,
  );
}

export const PRODUCTION_DRAFT_AUTHORING_PLATFORM = Object.freeze({
  tournamentId: PRODUCTION_TOURNAMENT_ID,
  tournamentYear: PRODUCTION_TOURNAMENT_YEAR,
});
