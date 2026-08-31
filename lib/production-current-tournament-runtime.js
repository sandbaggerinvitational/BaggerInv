import "server-only";

import { assertProductionCutoverActivation } from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "./production-foundation-resource-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";

export const PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_CONTRACT =
  "production-current-tournament-runtime-v1";

const RPC = "read_production_current_tournament_runtime_v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value) => String(value ?? "").trim();

function currentTournamentRuntimeError(code, message, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function positiveRevision(value, code = "PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_INVALID") {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw currentTournamentRuntimeError(
      code,
      "The current Production tournament runtime is temporarily unavailable.",
    );
  }
  return revision;
}

function optionalUuid(value) {
  const result = clean(value).toLowerCase();
  return result && UUID.test(result) ? result : "";
}

function headers(secret) {
  const result = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) result.authorization = `Bearer ${secret}`;
  return result;
}

function providerCode(payload) {
  for (const value of [payload?.code, payload?.message, payload?.error?.code]) {
    const result = clean(value).toUpperCase();
    if (/^PRODUCTION_CURRENT_TOURNAMENT_[A-Z0-9_]{3,120}$/.test(result)) return result;
  }
  return "PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_UNAVAILABLE";
}

export function normalizeProductionCurrentTournamentRuntime(payload = {}, {
  expectedPointerRevision,
} = {}) {
  const value = payload?.data || payload?.result || payload;
  if (!value || value.ok === false) {
    throw currentTournamentRuntimeError(
      providerCode(value),
      "The current Production tournament runtime is temporarily unavailable.",
    );
  }
  const contractVersion = clean(value.contractVersion || value.contract_version);
  const tournamentId = clean(value.tournamentId || value.tournament_id);
  const tournamentYear = Number(value.tournamentYear || value.tournament_year);
  const lifecycle = clean(value.lifecycle).toUpperCase();
  const status = clean(value.status).toUpperCase();
  const pointerRevision = positiveRevision(value.pointerRevision || value.pointer_revision);
  const lifecycleRevision = positiveRevision(value.lifecycleRevision || value.lifecycle_revision);
  const frozen2026Runtime = tournamentId === "2026" && status === "FROZEN_2026_RUNTIME";
  const runtimeRevision = frozen2026Runtime
    ? Math.max(0, Number(value.runtimeRevision || value.runtime_revision) || 0)
    : positiveRevision(value.runtimeRevision || value.runtime_revision);
  const runtimeGenerationId = optionalUuid(value.runtimeGenerationId || value.runtime_generation_id);
  const authorityGenerationId = optionalUuid(value.authorityGenerationId || value.authority_generation_id);
  const admissionGenerationId = optionalUuid(value.admissionGenerationId || value.admission_generation_id);
  if (contractVersion !== PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_CONTRACT ||
      !/^\d{4}$/.test(tournamentId) || tournamentYear !== Number(tournamentId) ||
      lifecycle !== "ACTIVE" || (!frozen2026Runtime && (!runtimeGenerationId ||
        !authorityGenerationId || !admissionGenerationId))) {
    throw currentTournamentRuntimeError(
      "PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_INVALID",
      "The current Production tournament runtime is temporarily unavailable.",
    );
  }
  if (expectedPointerRevision !== undefined && expectedPointerRevision !== null &&
      pointerRevision !== positiveRevision(
        expectedPointerRevision,
        "PRODUCTION_CURRENT_TOURNAMENT_POINTER_REVISION_REQUIRED",
      )) {
    throw currentTournamentRuntimeError(
      "PRODUCTION_CURRENT_TOURNAMENT_POINTER_STALE",
      "The current Production tournament changed. Refresh and try again.",
      409,
    );
  }
  return Object.freeze({
    contractVersion,
    tournamentId,
    tournamentYear,
    lifecycle,
    pointerRevision,
    lifecycleRevision,
    runtimeGenerationId,
    runtimeRevision,
    authorityGenerationId,
    admissionGenerationId,
    status: status || "ACTIVE",
  });
}

export async function productionCurrentTournamentRuntimeRpc(input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 10_000,
  activation: suppliedActivation,
} = {}) {
  const activation = suppliedActivation || assertProductionCutoverActivation({
    env,
    requiredPhase: "OBSERVATION",
  });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw currentTournamentRuntimeError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "The current Production tournament runtime is temporarily unavailable.",
    );
  }
  recordDataAuthorityTransport("supabase", {
    adapter: PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_CONTRACT,
    source: RPC,
  });
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${RPC}`, {
    method: "POST",
    headers: headers(secret),
    body: JSON.stringify({ input }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw currentTournamentRuntimeError(
      providerCode(payload),
      "The current Production tournament runtime is temporarily unavailable.",
      response.status >= 400 && response.status < 500 ? response.status : 503,
    );
  }
  return { payload, activation };
}

export async function readProductionCurrentTournamentRuntime({
  expectedPointerRevision,
} = {}, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const input = {
    contract_version: PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_CONTRACT,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
  };
  const rpc = options.rpc || productionCurrentTournamentRuntimeRpc;
  const result = await rpc(input, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  return normalizeProductionCurrentTournamentRuntime(result?.payload, {
    expectedPointerRevision,
  });
}

export function assertProductionCurrentTournamentRuntimeMatch(runtime, tournamentId, {
  code = "PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_MISMATCH",
  status = 503,
} = {}) {
  const expected = clean(runtime?.tournamentId);
  const actual = clean(tournamentId);
  if (!expected || runtime?.lifecycle !== "ACTIVE" || !actual || actual !== expected) {
    throw currentTournamentRuntimeError(
      code,
      "The current Production tournament runtime is temporarily unavailable.",
      status,
    );
  }
  return actual;
}
