import "server-only";

import { createHash } from "node:crypto";

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
  buildFutureYearAdministrationMutation,
  buildFutureRuntimeMutation,
  canonicalOptionalFutureTournamentId,
  mergeProductionFutureYearAdministrationRuntime,
  normalizeProductionFutureYearAdministrationMutation,
  normalizeProductionFutureYearAdministrationPayload,
  normalizeProductionFutureRuntimeMutation,
  normalizeProductionFutureRuntimePayload,
  PRODUCTION_FUTURE_YEAR_ADMINISTRATION_CONTRACT,
  PRODUCTION_FUTURE_RUNTIME_ACTIVATION_CONTRACT,
  stableFutureYearAdministrationValue,
} from "./production-future-year-administration-contract.js";

export {
  PRODUCTION_FUTURE_YEAR_ADMINISTRATION_CONTRACT,
  PRODUCTION_FUTURE_RUNTIME_ACTIVATION_CONTRACT,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RPCS = new Set([
  "read_production_future_year_administration_v1",
  "mutate_production_future_year_administration_v1",
  "read_production_future_runtime_v2",
  "mutate_production_future_runtime_v2",
  "prepare_production_annual_scoring_transition_v1",
  "close_production_annual_scoring_transition_v1",
  "drain_production_annual_scoring_transition_v1",
  "activate_production_annual_scoring_transition_v1",
  "abort_production_annual_scoring_transition_v1",
]);
const ANNUAL_TRANSITION_RPCS = Object.freeze({
  "prepare-annual-transition":
    "prepare_production_annual_scoring_transition_v1",
  "close-annual-transition":
    "close_production_annual_scoring_transition_v1",
  "drain-annual-transition":
    "drain_production_annual_scoring_transition_v1",
  "activate-annual-transition":
    "activate_production_annual_scoring_transition_v1",
  "abort-annual-transition":
    "abort_production_annual_scoring_transition_v1",
});
export const PRODUCTION_ANNUAL_SCORING_TRANSITION_ACTIONS = Object.freeze(
  Object.keys(ANNUAL_TRANSITION_RPCS),
);
const clean = (value) => String(value ?? "").trim();

function futureYearError(code, message, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function exactActorUuid(value) {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) {
    throw futureYearError(
      "FUTURE_YEAR_DIRECTOR_AUTHORIZATION_REQUIRED",
      "Active Tournament Director access is required.",
      403,
    );
  }
  return result;
}

function exactActorPlayerId(value) {
  const result = clean(value).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(result)) {
    throw futureYearError(
      "FUTURE_YEAR_DIRECTOR_AUTHORIZATION_REQUIRED",
      "Active Tournament Director access is required.",
      403,
    );
  }
  return result;
}

function currentAdministrationTournament(value) {
  const result = clean(value || PRODUCTION_TOURNAMENT_ID);
  const year = Number(result);
  if (!/^\d{4}$/.test(result) || !Number.isSafeInteger(year) ||
      year < PRODUCTION_TOURNAMENT_YEAR) {
    throw futureYearError(
      "FUTURE_YEAR_DIRECTOR_AUTHORIZATION_REQUIRED",
      "Active Tournament Director access is required.",
      403,
    );
  }
  return Object.freeze({ tournamentId: result, tournamentYear: year });
}

function fixedProductionScope(input, {
  actorAuthUserId,
  actorPlayerId,
  actorTournamentId,
} = {}, contractVersion = PRODUCTION_FUTURE_YEAR_ADMINISTRATION_CONTRACT) {
  const authUserId = exactActorUuid(actorAuthUserId);
  const playerId = exactActorPlayerId(actorPlayerId);
  const currentTournament = currentAdministrationTournament(actorTournamentId);
  return {
    ...(input || {}),
    contract_version: contractVersion,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    // The project/workbook fields above are immutable Production-platform
    // provenance. Tournament authorization is independently bound to the
    // server-resolved current-tournament identity context. The database holds
    // the annual admission lock and rechecks the pointer before accepting it.
    tournament_id: currentTournament.tournamentId,
    tournament_year: currentTournament.tournamentYear,
    actor_auth_user_id: authUserId,
    actor_player_id: playerId,
    authorization: {
      tournament_id: currentTournament.tournamentId,
      auth_user_id: authUserId,
      player_id: playerId,
      role: "DIRECTOR",
    },
  };
}

function fixedAnnualTransitionPlatformScope(input, {
  actorAuthUserId,
  actorPlayerId,
} = {}) {
  const authUserId = exactActorUuid(actorAuthUserId);
  const playerId = exactActorPlayerId(actorPlayerId);
  return {
    ...(input || {}),
    contract_version: PRODUCTION_FUTURE_RUNTIME_ACTIVATION_CONTRACT,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    // Annual transitions are authorized by the immutable Production Owner
    // governance root. The mutable predecessor is independently bound by
    // expected_current_tournament_id and checked under the admission lock.
    // Keeping these hashed platform fields stable makes an exact ACTIVATE
    // retry replayable after the pointer has advanced to the successor.
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
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
    if (/^(?:(?:PRODUCTION_)?FUTURE_(?:YEAR|RUNTIME|TOURNAMENT|TEAM|ROSTER|ROUND|COURSE|MATCH)|GLOBAL_COURSE|PRODUCTION_ANNUAL_SCORING)_[A-Z0-9_]{3,120}$/.test(candidate)) {
      return candidate;
    }
  }
  return "FUTURE_YEAR_RPC_FAILED";
}

function statusForCode(code, fallback = 409) {
  if (/(?:RPC_FAILED|OPERATION_FAILED|RESPONSE_INVALID|UNAVAILABLE)$/.test(code)) return 503;
  if (/(?:AUTHORIZATION|DIRECTOR|OWNER|SCOPE)_REQUIRED$|FORBIDDEN$/.test(code)) return 403;
  if (/NOT_FOUND$/.test(code)) return 404;
  if (/(?:INVALID|INCOMPLETE|REQUIRED)$/.test(code)) return 400;
  if (/(?:STALE|CONFLICT|COLLISION|BLOCKED|LOCKED|FROZEN|DEPENDENCY|IN_FLIGHT|NOT_READY|ALREADY_EXISTS)/.test(code)) return 409;
  return fallback;
}

function payloadHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableFutureYearAdministrationValue(value)))
    .digest("hex");
}

export async function productionFutureYearAdministrationRpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 20_000,
  activation: suppliedActivation,
} = {}) {
  const name = clean(functionName);
  if (!RPCS.has(name)) {
    throw futureYearError(
      "FUTURE_YEAR_RPC_FORBIDDEN",
      "The Future Tournament operation is not allowlisted.",
      403,
    );
  }
  const activation = suppliedActivation || assertProductionCutoverActivation({
    env,
    requiredPhase: "OBSERVATION",
  });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw futureYearError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "Future Tournament administration is temporarily unavailable.",
    );
  }
  recordDataAuthorityTransport("supabase", {
    adapter: PRODUCTION_FUTURE_YEAR_ADMINISTRATION_CONTRACT,
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
    throw futureYearError(
      code,
      "The Production Future Tournament operation did not complete.",
      statusForCode(code, response.status),
    );
  }
  return { payload, activation };
}

function successful(payload, fallbackStatus = 409) {
  if (!payload || payload.ok === false) {
    const code = safeProviderCode(payload);
    throw futureYearError(
      code,
      "The Future Tournament operation did not complete.",
      statusForCode(code, fallbackStatus),
    );
  }
  return payload;
}

export async function readProductionFutureYearAdministration({
  actorAuthUserId,
  actorPlayerId,
  actorTournamentId,
  targetTournamentId = "",
} = {}, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const target = canonicalOptionalFutureTournamentId(targetTournamentId);
  const input = fixedProductionScope({
    operation: "READ_PRODUCTION_FUTURE_YEAR_ADMINISTRATION_V1",
    target_tournament_id: target || null,
  }, { actorAuthUserId, actorPlayerId, actorTournamentId });
  const rpc = options.rpc || productionFutureYearAdministrationRpc;
  const result = await rpc("read_production_future_year_administration_v1", input, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  return normalizeProductionFutureYearAdministrationPayload(successful(result?.payload));
}

export async function mutateProductionFutureYearAdministration({
  action,
  actorAuthUserId,
  actorPlayerId,
  actorTournamentId,
  ...values
} = {}, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const operation = buildFutureYearAdministrationMutation(action, values);
  const payload = fixedProductionScope(operation, {
    actorAuthUserId, actorPlayerId, actorTournamentId,
  });
  const input = { ...payload, request_payload_hash: payloadHash(payload) };
  const rpc = options.rpc || productionFutureYearAdministrationRpc;
  const result = await rpc("mutate_production_future_year_administration_v1", input, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  const response = successful(result?.payload);
  return normalizeProductionFutureYearAdministrationMutation(
    response?.data && response.data.ok === undefined ? { ...response.data, ok: true } : response,
  );
}

export async function readProductionFutureRuntime({
  actorAuthUserId,
  actorPlayerId,
  actorTournamentId,
  targetTournamentId,
} = {}, options = {}) {
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const target = canonicalOptionalFutureTournamentId(targetTournamentId);
  if (!target) {
    throw futureYearError(
      "FUTURE_RUNTIME_TARGET_TOURNAMENT_REQUIRED",
      "Select a future tournament before loading runtime preparation.",
      400,
    );
  }
  const input = fixedProductionScope({
    operation: "READ_PRODUCTION_FUTURE_RUNTIME_V2",
    target_tournament_id: target,
  }, {
    actorAuthUserId, actorPlayerId, actorTournamentId,
  }, PRODUCTION_FUTURE_RUNTIME_ACTIVATION_CONTRACT);
  const rpc = options.rpc || productionFutureYearAdministrationRpc;
  const result = await rpc("read_production_future_runtime_v2", input, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  return normalizeProductionFutureRuntimePayload(successful(result?.payload));
}

export async function readProductionFutureYearAdministrationWithRuntime(input = {}, options = {}) {
  const administration = await readProductionFutureYearAdministration(input, options);
  if (!administration.selectedTournament?.tournamentId) {
    return mergeProductionFutureYearAdministrationRuntime(administration, null);
  }
  const runtime = await readProductionFutureRuntime({
    actorAuthUserId: input.actorAuthUserId,
    actorPlayerId: input.actorPlayerId,
    actorTournamentId: input.actorTournamentId,
    targetTournamentId: administration.selectedTournament.tournamentId,
  }, options);
  return mergeProductionFutureYearAdministrationRuntime(administration, runtime);
}

export async function mutateProductionFutureRuntime({
  action,
  actorAuthUserId,
  actorPlayerId,
  actorTournamentId,
  ...values
} = {}, options = {}) {
  const selectedAction = clean(action).toLowerCase();
  if (selectedAction === "activate") {
    return mutateProductionAnnualScoringTransition({
      action: "prepare-annual-transition",
      actorAuthUserId,
      actorPlayerId,
      actorTournamentId,
      ...values,
    }, options);
  }
  if (selectedAction === "close") {
    throw futureYearError(
      "PRODUCTION_ANNUAL_SCORING_TRANSITION_REQUIRED",
      "Closing a current tournament requires an explicit annual scoring transition.",
      409,
    );
  }
  if (PRODUCTION_ANNUAL_SCORING_TRANSITION_ACTIONS.includes(selectedAction)) {
    return mutateProductionAnnualScoringTransition({
      action: selectedAction,
      actorAuthUserId,
      actorPlayerId,
      actorTournamentId,
      ...values,
    }, options);
  }
  const env = options.env || process.env;
  const activation = (options.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const operation = buildFutureRuntimeMutation(action, values);
  const payload = fixedProductionScope(
    operation,
    { actorAuthUserId, actorPlayerId, actorTournamentId },
    PRODUCTION_FUTURE_RUNTIME_ACTIVATION_CONTRACT,
  );
  const input = { ...payload, request_payload_hash: payloadHash(payload) };
  const rpc = options.rpc || productionFutureYearAdministrationRpc;
  const result = await rpc("mutate_production_future_runtime_v2", input, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  const response = successful(result?.payload);
  return normalizeProductionFutureRuntimeMutation(
    response?.data && response.data.ok === undefined ? { ...response.data, ok: true } : response,
  );
}

function annualTransitionValues(values = {}) {
  const field = (snake, camel = snake) => clean(
    values[camel] ?? values[snake],
  );
  const numberField = (snake, camel) => {
    const result = Number(values[camel] ?? values[snake]);
    return Number.isSafeInteger(result) && result >= 0 ? result : null;
  };
  return {
    target_tournament_id: field("target_tournament_id", "targetTournamentId"),
    expected_current_tournament_id: field(
      "expected_current_tournament_id", "expectedCurrentTournamentId",
    ),
    expected_pointer_revision: numberField(
      "expected_pointer_revision", "expectedPointerRevision",
    ),
    expected_revision: numberField("expected_revision", "expectedRevision"),
    transition_id: field("transition_id", "transitionId"),
    expected_runtime_generation_id: field(
      "expected_runtime_generation_id", "expectedRuntimeGenerationId",
    ),
    expected_annual_authority_generation_id: field(
      "expected_annual_authority_generation_id",
      "expectedAnnualAuthorityGenerationId",
    ),
    expected_annual_admission_generation_id: field(
      "expected_annual_admission_generation_id",
      "expectedAnnualAdmissionGenerationId",
    ),
    expected_google_writer_generation_id: field(
      "expected_google_writer_generation_id",
      "expectedGoogleWriterGenerationId",
    ),
    annual_destination_workbook_id: field(
      "annual_destination_workbook_id", "annualDestinationWorkbookId",
    ),
    expected_google_target_contract_fingerprint: field(
      "expected_google_target_contract_fingerprint",
      "expectedGoogleTargetContractFingerprint",
    ),
    expected_platform_activation_revision: numberField(
      "expected_platform_activation_revision",
      "expectedPlatformActivationRevision",
    ),
    expected_platform_authority_generation_id: field(
      "expected_platform_authority_generation_id",
      "expectedPlatformAuthorityGenerationId",
    ),
    expected_platform_admission_generation_id: field(
      "expected_platform_admission_generation_id",
      "expectedPlatformAdmissionGenerationId",
    ),
    expected_platform_admission_revision: numberField(
      "expected_platform_admission_revision",
      "expectedPlatformAdmissionRevision",
    ),
    expected_predecessor_runtime_generation_id: field(
      "expected_predecessor_runtime_generation_id",
      "expectedPredecessorRuntimeGenerationId",
    ),
    expected_predecessor_annual_authority_generation_id: field(
      "expected_predecessor_annual_authority_generation_id",
      "expectedPredecessorAnnualAuthorityGenerationId",
    ),
    expected_predecessor_annual_admission_generation_id: field(
      "expected_predecessor_annual_admission_generation_id",
      "expectedPredecessorAnnualAdmissionGenerationId",
    ),
    expected_predecessor_annual_admission_revision: numberField(
      "expected_predecessor_annual_admission_revision",
      "expectedPredecessorAnnualAdmissionRevision",
    ),
    readiness_fingerprint: field(
      "readiness_fingerprint", "readinessFingerprint",
    ),
    start_source_fingerprint: field(
      "start_source_fingerprint", "startSourceFingerprint",
    ),
    final_source_fingerprint: field(
      "final_source_fingerprint", "finalSourceFingerprint",
    ),
    reconciliation_fingerprint: field(
      "reconciliation_fingerprint", "reconciliationFingerprint",
    ),
    external_fence_evidence_id: field(
      "external_fence_evidence_id", "externalFenceEvidenceId",
    ),
    provider_fence_id: field("provider_fence_id", "providerFenceId"),
    provider_fence_verification_id: field(
      "provider_fence_verification_id", "providerFenceVerificationId",
    ),
    quiesce_evidence_id: field(
      "quiesce_evidence_id", "quiesceEvidenceId",
    ),
    operation_request_id: field(
      "operation_request_id", "operationRequestId",
    ),
    reason: field("reason"),
  };
}

function normalizeAnnualTransitionReceipt(payload = {}, operation = "") {
  const value = payload?.data || payload?.result || payload;
  const targetTournamentId = clean(
    value?.successorTournamentId || value?.successor_tournament_id,
  );
  if (value?.ok !== true || !/^\d{4}$/.test(targetTournamentId) ||
      Number(targetTournamentId) <= PRODUCTION_TOURNAMENT_YEAR) {
    throw futureYearError(
      clean(value?.code || "PRODUCTION_ANNUAL_SCORING_TRANSITION_FAILED"),
      "The annual scoring transition did not complete.",
      409,
    );
  }
  return Object.freeze({
    ...value,
    ok: true,
    operation: clean(value.operation || operation)
      .replaceAll("-", "_").toUpperCase(),
    targetTournamentId,
    transitionId: clean(value.transitionId || value.transition_id),
    runtimeGenerationId: clean(
      value.runtimeGenerationId || value.runtime_generation_id,
    ),
    authorityGenerationId: clean(
      value.authorityGenerationId || value.authority_generation_id,
    ),
    admissionGenerationId: clean(
      value.admissionGenerationId || value.admission_generation_id,
    ),
    idempotent: value.idempotent === true,
  });
}

export async function mutateProductionAnnualScoringTransition({
  action,
  actorAuthUserId,
  actorPlayerId,
  actorTournamentId,
  ...values
} = {}, options = {}) {
  const selected = clean(action).toLowerCase();
  const rpcName = ANNUAL_TRANSITION_RPCS[selected];
  if (!rpcName) {
    throw futureYearError(
      "PRODUCTION_ANNUAL_SCORING_TRANSITION_ACTION_INVALID",
      "Select an explicit annual scoring transition stage.",
      400,
    );
  }
  const env = options.env || process.env;
  const activation = assertProductionCutoverActivation({
    env,
    requiredPhase: "OBSERVATION",
  });
  const bounded = Object.fromEntries(Object.entries(
    annualTransitionValues(values),
  ).filter(([, value]) => value !== "" && value !== null));
  const payload = fixedAnnualTransitionPlatformScope(
    {
      ...bounded,
      action: selected.replaceAll("-", "_").toUpperCase(),
    },
    { actorAuthUserId, actorPlayerId },
  );
  const input = { ...payload, request_payload_hash: payloadHash(payload) };
  const rpc = options.rpc || productionFutureYearAdministrationRpc;
  const result = await rpc(rpcName, input, {
    env,
    activation,
    ...(options.rpcOptions || {}),
  });
  return normalizeAnnualTransitionReceipt(successful(result?.payload), selected);
}
