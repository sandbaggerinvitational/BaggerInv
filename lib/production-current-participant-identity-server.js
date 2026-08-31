import "server-only";

import { readProductionCurrentTournamentRuntime } from "./production-current-tournament-runtime.js";

const clean = (value) => String(value ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FUTURE_RPC_NAMES = Object.freeze({
  authorize_single_participant_otp_request: "authorize_production_future_participant_otp_request_v1",
  authorize_production_participant_otp_request: "authorize_production_future_participant_otp_request_v1",
  complete_production_participant_first_login: "complete_production_future_participant_first_login_v1",
  record_production_participant_first_login_cleanup: "record_production_future_participant_first_login_cleanup_v1",
  record_single_participant_otp_delivery: "record_production_future_participant_otp_delivery_v1",
  authorize_single_participant_otp_verification: "authorize_production_future_participant_otp_verification_v1",
  record_single_participant_otp_verification: "record_production_future_participant_otp_verification_v1",
  recover_single_participant_otp_verification: "recover_production_future_participant_otp_verification_v1",
  record_single_participant_auth_logout: "record_production_future_participant_logout_v1",
  read_participant_identity_context_for_auth: "read_production_future_participant_context_for_auth_v1",
  read_participant_identity_context: "read_production_future_participant_player_context_v1",
  read_production_director_entitlement: "read_production_future_director_entitlement_v1",
});

const POINTER_TARGET_OPERATIONS = new Set([
  "record_single_participant_auth_logout",
  "read_participant_identity_context_for_auth",
  "read_participant_identity_context",
  "read_production_director_entitlement",
]);

function resolutionError(code = "PRODUCTION_CURRENT_TOURNAMENT_IDENTITY_UNAVAILABLE") {
  const error = new Error("The current Production participant identity runtime is temporarily unavailable.");
  error.code = code;
  error.status = 503;
  return error;
}

function certifiedFutureRuntime(runtime) {
  return Number(runtime?.tournamentYear) > 2026 &&
    clean(runtime?.tournamentId) === String(Number(runtime?.tournamentYear)) &&
    runtime?.lifecycle === "ACTIVE" && runtime?.status === "ACTIVE" &&
    Number.isSafeInteger(Number(runtime?.pointerRevision)) && Number(runtime.pointerRevision) > 1 &&
    UUID.test(clean(runtime?.runtimeGenerationId)) &&
    UUID.test(clean(runtime?.authorityGenerationId)) &&
    UUID.test(clean(runtime?.admissionGenerationId)) &&
    clean(runtime.runtimeGenerationId) !== clean(runtime.authorityGenerationId) &&
    clean(runtime.runtimeGenerationId) !== clean(runtime.admissionGenerationId) &&
    clean(runtime.authorityGenerationId) !== clean(runtime.admissionGenerationId);
}

/**
 * Selects the Production participant-identity RPC from server-owned current
 * pointer state. Frozen 2026 keeps its already-certified RPC and request body
 * exactly; a future generation receives only the pointer-selected tournament.
 */
export function productionCurrentParticipantIdentityRpcResolution({
  logicalFunctionName,
  frozenFunctionName,
  body = {},
  runtime,
} = {}) {
  const tournamentId = clean(runtime?.tournamentId);
  if (tournamentId === "2026" && Number(runtime?.tournamentYear) === 2026 &&
      runtime?.lifecycle === "ACTIVE" && runtime?.status === "FROZEN_2026_RUNTIME") {
    return Object.freeze({
      functionName: clean(frozenFunctionName),
      body,
      tournamentId,
      pointerRevision: Number(runtime.pointerRevision),
      futureGeneration: false,
    });
  }
  if (!certifiedFutureRuntime(runtime)) {
    throw resolutionError("PRODUCTION_CURRENT_TOURNAMENT_IDENTITY_GENERATION_UNCERTIFIED");
  }
  const functionName = FUTURE_RPC_NAMES[clean(logicalFunctionName)];
  if (!functionName) {
    throw resolutionError("PRODUCTION_CURRENT_TOURNAMENT_IDENTITY_OPERATION_UNAVAILABLE");
  }
  const selectedBody = POINTER_TARGET_OPERATIONS.has(clean(logicalFunctionName))
    ? { ...body, target_tournament_id: tournamentId }
    : body;
  return Object.freeze({
    functionName,
    body: selectedBody,
    tournamentId,
    pointerRevision: Number(runtime.pointerRevision),
    futureGeneration: true,
  });
}

export async function resolveProductionCurrentParticipantIdentityRpc({
  logicalFunctionName,
  frozenFunctionName,
  body = {},
} = {}, {
  env = process.env,
  readCurrentTournamentRuntime = readProductionCurrentTournamentRuntime,
} = {}) {
  let runtime;
  try {
    runtime = await readCurrentTournamentRuntime({}, { env });
  } catch (error) {
    if (error?.code) throw error;
    throw resolutionError();
  }
  return productionCurrentParticipantIdentityRpcResolution({
    logicalFunctionName,
    frozenFunctionName,
    body,
    runtime,
  });
}
