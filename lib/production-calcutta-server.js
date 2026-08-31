import "server-only";

import { createHash } from "node:crypto";

import {
  calculateCalcuttaFromSupabaseViews,
  CALCUTTA_ENGINE_VERSION,
} from "./calcutta-supabase.js";
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
import {
  PRODUCTION_CALCUTTA_V1_CONTRACT,
  PRODUCTION_CALCUTTA_V1_PUBLICATION_POLICY,
} from "./production-calcutta-v1.js";
import {
  productionScoringOperationsRpc,
  resolveProductionScoringDispatchContext,
} from "./production-scoring-operations-server.js";

const clean = (value) => String(value ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[0-9a-f]{64}$/;
const PLAYER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const DECIMAL = /^(?:0|[1-9]\d{0,29})(?:\.\d{1,30})?$/;
const EXACT_ROUNDS = Object.freeze([1, 2, 3]);
const RPC_ALLOWLIST = new Set([
  "inspect_production_cutover_authority",
  "inspect_production_calcutta_v1",
  "configure_production_calcutta_v1",
  "replace_production_calcutta_v1_auction_facts",
  "publish_production_calcutta_v1",
  "unpublish_production_calcutta_v1",
  "enqueue_production_calcutta_v1_recalculation",
  "claim_production_calcutta_v1_recalculation",
  "complete_production_calcutta_v1_recalculation",
  "fail_production_calcutta_v1_recalculation",
  "resolve_production_calcutta_postcommit_match_v1",
]);

function calcuttaError(code, message, status = 503, diagnostics = undefined) {
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
  const providerMessage = clean(payload?.message).toUpperCase();
  return /^PRODUCTION_(?:ANNUAL_)?CALCUTTA_[A-Z0-9_]{3,120}$/.test(providerMessage)
    ? providerMessage
    : "PRODUCTION_CALCUTTA_RPC_FAILED";
}

function exactInteger(value, code, { minimum = 0 } = {}) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum) {
    throw calcuttaError(code, "A current Calcutta revision is required.", 400);
  }
  return result;
}

function exactFingerprint(value, code = "PRODUCTION_CALCUTTA_REQUEST_FINGERPRINT_REQUIRED") {
  const result = clean(value).toLowerCase();
  if (!FINGERPRINT.test(result)) {
    throw calcuttaError(code, "An exact Calcutta request fingerprint is required.", 400);
  }
  return result;
}

function exactExpectedFingerprint(value, code, { nullable = false } = {}) {
  const result = clean(value).toLowerCase();
  if (nullable && !result) return null;
  return exactFingerprint(result, code);
}

function operationFingerprint(base, operation) {
  return createHash("sha256").update([
    PRODUCTION_CALCUTTA_V1_CONTRACT,
    clean(operation).toUpperCase(),
    exactFingerprint(base),
  ].join("\n")).digest("hex");
}

function annualOperationFingerprint(base, functionName, scoringDispatchContext) {
  return createHash("sha256").update([
    PRODUCTION_CALCUTTA_V1_CONTRACT,
    "ANNUAL_RUNTIME_V1",
    clean(functionName),
    exactFingerprint(base),
    clean(scoringDispatchContext?.runtime?.tournamentId),
    clean(scoringDispatchContext?.runtime?.runtimeGenerationId).toLowerCase(),
  ].join("\n")).digest("hex");
}

function serviceOperationFingerprint(operation, key = "") {
  return createHash("sha256").update([
    PRODUCTION_CALCUTTA_V1_CONTRACT,
    "SERVER_ONLY",
    clean(operation),
    clean(key),
  ].join("\n")).digest("hex");
}

function exactPlayerId(value) {
  const result = clean(value);
  if (!PLAYER_ID.test(result)) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_PLAYER_ID_REQUIRED",
      "A stable Production Player ID is required.",
      400,
    );
  }
  return result;
}

function exactDecimal(value, code, { positive = false } = {}) {
  const source = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : clean(value);
  if (!DECIMAL.test(source)) {
    throw calcuttaError(code, "A canonical non-negative Calcutta decimal is required.", 400);
  }
  let [whole, fraction = ""] = source.split(".");
  whole = whole.replace(/^0+(?=\d)/, "") || "0";
  fraction = fraction.replace(/0+$/, "");
  const result = `${whole}${fraction ? `.${fraction}` : ""}`;
  if (positive && Number(result) <= 0) {
    throw calcuttaError(code, "A positive Calcutta decimal is required.", 400);
  }
  return result;
}

function exactDecimalTotal(values, target = "1") {
  const scale = Math.max(...[...values, target].map((value) =>
    String(value).split(".")[1]?.length || 0));
  const units = (value) => {
    const [whole, fraction = ""] = String(value).split(".");
    return BigInt(whole) * (10n ** BigInt(scale)) +
      BigInt((fraction + "0".repeat(scale)).slice(0, scale) || "0");
  };
  return values.reduce((sum, value) => sum + units(value), 0n) === units(target);
}

function exactPointStructure(value) {
  if (!Array.isArray(value) || !value.length) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_POINT_STRUCTURE_REQUIRED",
      "The complete Calcutta point structure is required.",
      400,
    );
  }
  const rows = value.map((row) => {
    const place = exactInteger(row.place, "PRODUCTION_CALCUTTA_POINT_STRUCTURE_REQUIRED", { minimum: 1 });
    const awards = [1, 2, 3].map((round) => {
      const result = Number(row[`round_${round}_award`] ?? row[`round${round}Award`]);
      if (!Number.isFinite(result) || result < 0) {
        throw calcuttaError(
          "PRODUCTION_CALCUTTA_POINT_STRUCTURE_REQUIRED",
          "Every Calcutta point award must be non-negative.",
          400,
        );
      }
      return result;
    });
    return {
      place,
      round_1_award: awards[0],
      round_2_award: awards[1],
      round_3_award: awards[2],
    };
  }).sort((left, right) => left.place - right.place);
  if (new Set(rows.map((row) => row.place)).size !== rows.length ||
      !rows.some((row) => EXACT_ROUNDS.some((round) => row[`round_${round}_award`] > 0))) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_POINT_STRUCTURE_REQUIRED",
      "The Calcutta point structure is incomplete or ambiguous.",
      400,
    );
  }
  return rows;
}

function exactPayoutStructure(value) {
  if (!Array.isArray(value) || !value.length) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_PAYOUT_STRUCTURE_REQUIRED",
      "The complete Calcutta payout structure is required.",
      400,
    );
  }
  const rows = value.map((row) => ({
    place: exactInteger(row.place, "PRODUCTION_CALCUTTA_PAYOUT_STRUCTURE_REQUIRED", { minimum: 1 }),
    round_1_fraction: exactDecimal(
      row.round_1_fraction ?? row.round1Fraction,
      "PRODUCTION_CALCUTTA_PAYOUT_STRUCTURE_REQUIRED",
    ),
    round_2_fraction: exactDecimal(
      row.round_2_fraction ?? row.round2Fraction,
      "PRODUCTION_CALCUTTA_PAYOUT_STRUCTURE_REQUIRED",
    ),
    round_3_fraction: exactDecimal(
      row.round_3_fraction ?? row.round3Fraction,
      "PRODUCTION_CALCUTTA_PAYOUT_STRUCTURE_REQUIRED",
    ),
    overall_fraction: exactDecimal(
      row.overall_fraction ?? row.overallFraction,
      "PRODUCTION_CALCUTTA_PAYOUT_STRUCTURE_REQUIRED",
    ),
  })).sort((left, right) => left.place - right.place);
  const fields = ["round_1_fraction", "round_2_fraction", "round_3_fraction", "overall_fraction"];
  const allocations = rows.flatMap((row) => fields.map((field) => row[field]));
  if (new Set(rows.map((row) => row.place)).size !== rows.length ||
      !exactDecimalTotal(allocations)) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_PAYOUT_TOTAL_MISMATCH",
      "Calcutta payout fractions must reconcile to exactly 100% of the market.",
      400,
    );
  }
  return rows;
}

function exactAuctionFacts(purchasesValue, ownershipValue) {
  if (!Array.isArray(purchasesValue) || !purchasesValue.length ||
      !Array.isArray(ownershipValue) || !ownershipValue.length) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED",
      "Complete Calcutta purchase and ownership facts are required.",
      400,
    );
  }
  const purchases = purchasesValue.map((row) => ({
    player_id: exactPlayerId(row.player_id ?? row.playerId),
    purchase_price: exactDecimal(
      row.purchase_price ?? row.purchasePrice,
      "PRODUCTION_CALCUTTA_PURCHASE_PRICE_REQUIRED",
    ),
  })).sort((left, right) => left.player_id.localeCompare(right.player_id));
  if (new Set(purchases.map((row) => row.player_id)).size !== purchases.length) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_DUPLICATE_PURCHASE",
      "Each Calcutta asset may be purchased only once.",
      400,
    );
  }
  const purchased = new Set(purchases.map((row) => row.player_id));
  const ownership = ownershipValue.map((row) => ({
    player_id: exactPlayerId(row.player_id ?? row.playerId),
    owner_player_id: exactPlayerId(row.owner_player_id ?? row.ownerPlayerId),
    ownership_fraction: exactDecimal(
      row.ownership_fraction ?? row.ownershipFraction,
      "PRODUCTION_CALCUTTA_OWNERSHIP_REQUIRED",
      { positive: true },
    ),
  })).sort((left, right) => left.player_id.localeCompare(right.player_id) ||
    left.owner_player_id.localeCompare(right.owner_player_id));
  if (ownership.some((row) => !purchased.has(row.player_id)) ||
      new Set(ownership.map((row) => `${row.player_id}:${row.owner_player_id}`)).size !== ownership.length) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_OWNERSHIP_REQUIRED",
      "Every unique Calcutta ownership row must belong to a purchased asset.",
      400,
    );
  }
  for (const purchase of purchases) {
    const shares = ownership.filter((row) => row.player_id === purchase.player_id)
      .map((row) => row.ownership_fraction);
    if (!exactDecimalTotal(shares)) {
      throw calcuttaError(
        "PRODUCTION_CALCUTTA_OWNERSHIP_TOTAL_MISMATCH",
        "Calcutta ownership must total exactly 100% for every purchased asset.",
        400,
      );
    }
  }
  return { purchases, ownership };
}

function directorAuthorization({ actorAuthUserId, actorPlayerId } = {}) {
  const authUserId = clean(actorAuthUserId).toLowerCase();
  const playerId = clean(actorPlayerId);
  if (!UUID.test(authUserId) || !playerId) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_DIRECTOR_AUTHORIZATION_REQUIRED",
      "An active Production Director identity is required.",
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

function exactRuntimeScope(env, activation, extra = {}) {
  const epochId = clean(env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH).toLowerCase();
  if (!UUID.test(epochId)) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_AUTHORITY_EPOCH_REQUIRED",
      "The active Production authority epoch is required.",
    );
  }
  return {
    ...(extra || {}),
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
  };
}

/** Fixed-resource, service-only Production Calcutta RPC transport. */
export async function productionCalcuttaV1Rpc(functionName, input = {}, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  activation: suppliedActivation,
} = {}) {
  const name = clean(functionName);
  if (!RPC_ALLOWLIST.has(name)) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_RPC_FORBIDDEN",
      "The Production Calcutta operation is not allowlisted.",
      403,
    );
  }
  const activation = suppliedActivation ||
    assertProductionCutoverActivation({ env, requiredPhase: "OBSERVATION" });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw calcuttaError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "The Production server credential is unavailable.",
    );
  }
  const scopedInput = exactRuntimeScope(env, activation, input);
  recordDataAuthorityTransport("supabase", {
    adapter: "production-calcutta-v1",
    source: name,
  });
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
    throw calcuttaError(
      code,
      `Production Calcutta RPC failed (${response.status}).`,
      response.status,
      { functionName: name, providerCode: code },
    );
  }
  return { ok: true, payload, durationMs: Date.now() - startedAt };
}

async function mutationContext({ env, dependencies }) {
  const activation = (dependencies.getActivation || assertProductionCutoverActivation)({
    env,
    requiredPhase: "OBSERVATION",
  });
  const rpc = dependencies.rpc || productionCalcuttaV1Rpc;
  const inspected = await rpc("inspect_production_cutover_authority", {}, {
    env,
    activation,
    ...(dependencies.rpcOptions || {}),
  });
  const activationRevision = Number(inspected?.payload?.activation_revision);
  if (!inspected?.payload?.ok || !Number.isSafeInteger(activationRevision) || activationRevision < 0 ||
      clean(inspected.payload.authority).toUpperCase() !== "SUPABASE") {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_AUTHORITY_UNAVAILABLE",
      "The current Production Calcutta authority context is unavailable.",
      409,
    );
  }
  return { activation, activationRevision, rpc };
}

async function scoringDispatchContext({ env, dependencies, suppliedContext }) {
  if (suppliedContext) return suppliedContext;
  const resolve = dependencies.resolveScoringDispatchContext ||
    resolveProductionScoringDispatchContext;
  return resolve({
    requiredPhase: "OBSERVATION",
    env,
    ...(dependencies.scoringDispatchContextOptions || {}),
  });
}

async function mutationRpc(functionName, input, options = {}) {
  const env = options.env || process.env;
  const dependencies = options.dependencies || {};
  const dispatchContext = await scoringDispatchContext({
    env,
    dependencies,
    suppliedContext: options.scoringDispatchContext,
  });
  const annual = clean(dispatchContext?.runtime?.tournamentId) !==
    PRODUCTION_TOURNAMENT_ID;
  if (annual) {
    const rpc = dependencies.scoringRpc || productionScoringOperationsRpc;
    const result = await rpc(functionName, {
      ...(input || {}),
      request_fingerprint: annualOperationFingerprint(
        input?.request_fingerprint,
        functionName,
        dispatchContext,
      ),
    }, {
      env,
      scoringDispatchContext: dispatchContext,
      ...(dependencies.scoringRpcOptions || {}),
    });
    if (!result?.payload?.ok) {
      throw calcuttaError(
        clean(result?.payload?.code || "PRODUCTION_CALCUTTA_OPERATION_FAILED"),
        "The Production Calcutta operation did not complete.",
        409,
      );
    }
    return result.payload;
  }
  const context = await mutationContext({ env, dependencies });
  const result = await context.rpc(functionName, {
    ...(input || {}),
    expected_activation_revision: context.activationRevision,
  }, {
    env,
    activation: context.activation,
    ...(dependencies.rpcOptions || {}),
  });
  if (!result?.payload?.ok) {
    throw calcuttaError(
      clean(result?.payload?.code || "PRODUCTION_CALCUTTA_OPERATION_FAILED"),
      "The Production Calcutta operation did not complete.",
      409,
    );
  }
  return result.payload;
}

export async function configureProductionCalcuttaV1({
  actorAuthUserId,
  actorPlayerId,
  expectedConfigurationRevision,
  expectedConfigurationFingerprint,
  expectedAuctionRevision,
  expectedAuctionFingerprint,
  expectedPublicationRevision,
  pointStructure,
  payoutStructure,
  requestFingerprint,
} = {}, options = {}) {
  return mutationRpc("configure_production_calcutta_v1", {
    contract_version: PRODUCTION_CALCUTTA_V1_CONTRACT,
    publication_policy: PRODUCTION_CALCUTTA_V1_PUBLICATION_POLICY,
    expected_configuration_revision: exactInteger(
      expectedConfigurationRevision,
      "PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_REQUIRED",
    ),
    expected_configuration_fingerprint: exactExpectedFingerprint(
      expectedConfigurationFingerprint,
      "PRODUCTION_CALCUTTA_CONFIGURATION_FINGERPRINT_REQUIRED",
      { nullable: [0, 1].includes(Number(expectedConfigurationRevision)) },
    ),
    expected_auction_revision: exactInteger(
      expectedAuctionRevision,
      "PRODUCTION_CALCUTTA_AUCTION_REVISION_REQUIRED",
    ),
    expected_auction_fingerprint: exactExpectedFingerprint(
      expectedAuctionFingerprint,
      "PRODUCTION_CALCUTTA_AUCTION_FINGERPRINT_REQUIRED",
      { nullable: Number(expectedAuctionRevision) === 0 },
    ),
    expected_publication_revision: exactInteger(
      expectedPublicationRevision,
      "PRODUCTION_CALCUTTA_PUBLICATION_REVISION_REQUIRED",
    ),
    point_structure: exactPointStructure(pointStructure),
    payout_structure: exactPayoutStructure(payoutStructure),
    authorization: directorAuthorization({ actorAuthUserId, actorPlayerId }),
    request_fingerprint: operationFingerprint(requestFingerprint, "CONFIGURE"),
  }, options);
}

export async function replaceProductionCalcuttaV1AuctionFacts({
  actorAuthUserId,
  actorPlayerId,
  expectedConfigurationRevision,
  expectedConfigurationFingerprint,
  expectedAuctionRevision,
  expectedAuctionFingerprint,
  expectedPublicationRevision,
  purchases,
  ownership,
  requestFingerprint,
} = {}, options = {}) {
  const auction = exactAuctionFacts(purchases, ownership);
  return mutationRpc("replace_production_calcutta_v1_auction_facts", {
    contract_version: PRODUCTION_CALCUTTA_V1_CONTRACT,
    expected_configuration_revision: exactInteger(
      expectedConfigurationRevision,
      "PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_REQUIRED",
      { minimum: 1 },
    ),
    expected_configuration_fingerprint: exactExpectedFingerprint(
      expectedConfigurationFingerprint,
      "PRODUCTION_CALCUTTA_CONFIGURATION_FINGERPRINT_REQUIRED",
    ),
    expected_auction_revision: exactInteger(
      expectedAuctionRevision,
      "PRODUCTION_CALCUTTA_AUCTION_REVISION_REQUIRED",
    ),
    expected_auction_fingerprint: exactExpectedFingerprint(
      expectedAuctionFingerprint,
      "PRODUCTION_CALCUTTA_AUCTION_FINGERPRINT_REQUIRED",
      { nullable: Number(expectedAuctionRevision) === 0 },
    ),
    expected_publication_revision: exactInteger(
      expectedPublicationRevision,
      "PRODUCTION_CALCUTTA_PUBLICATION_REVISION_REQUIRED",
    ),
    ...auction,
    authorization: directorAuthorization({ actorAuthUserId, actorPlayerId }),
    request_fingerprint: operationFingerprint(requestFingerprint, "REPLACE_AUCTION"),
  }, options);
}

async function publicationOperation(operation, input = {}, options = {}) {
  const action = clean(operation).toUpperCase();
  return mutationRpc(`${action.toLowerCase()}_production_calcutta_v1`, {
    contract_version: PRODUCTION_CALCUTTA_V1_CONTRACT,
    expected_configuration_revision: exactInteger(
      input.expectedConfigurationRevision,
      "PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_REQUIRED",
      { minimum: 1 },
    ),
    expected_configuration_fingerprint: exactExpectedFingerprint(
      input.expectedConfigurationFingerprint,
      "PRODUCTION_CALCUTTA_CONFIGURATION_FINGERPRINT_REQUIRED",
    ),
    expected_auction_revision: exactInteger(
      input.expectedAuctionRevision,
      "PRODUCTION_CALCUTTA_AUCTION_REVISION_REQUIRED",
      { minimum: 1 },
    ),
    expected_auction_fingerprint: exactExpectedFingerprint(
      input.expectedAuctionFingerprint,
      "PRODUCTION_CALCUTTA_AUCTION_FINGERPRINT_REQUIRED",
    ),
    expected_publication_revision: exactInteger(
      input.expectedPublicationRevision,
      "PRODUCTION_CALCUTTA_PUBLICATION_REVISION_REQUIRED",
    ),
    authorization: directorAuthorization(input),
    request_fingerprint: operationFingerprint(input.requestFingerprint, action),
  }, options);
}

export const publishProductionCalcuttaV1 = (input, options) =>
  publicationOperation("PUBLISH", input, options);

export const unpublishProductionCalcuttaV1 = (input, options) =>
  publicationOperation("UNPUBLISH", input, options);

export async function enqueueProductionCalcuttaV1Recalculation({
  expectedConfigurationRevision,
  expectedConfigurationFingerprint,
  expectedAuctionRevision,
  expectedAuctionFingerprint,
  reason = "EXPLICIT_RECALCULATION",
  requestedBy = "Production Calcutta worker",
  requestFingerprint,
} = {}, options = {}) {
  return mutationRpc("enqueue_production_calcutta_v1_recalculation", {
    contract_version: PRODUCTION_CALCUTTA_V1_CONTRACT,
    expected_configuration_revision: exactInteger(
      expectedConfigurationRevision,
      "PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_REQUIRED",
      { minimum: 1 },
    ),
    expected_configuration_fingerprint: exactExpectedFingerprint(
      expectedConfigurationFingerprint,
      "PRODUCTION_CALCUTTA_CONFIGURATION_FINGERPRINT_REQUIRED",
    ),
    expected_auction_revision: exactInteger(
      expectedAuctionRevision,
      "PRODUCTION_CALCUTTA_AUCTION_REVISION_REQUIRED",
      { minimum: 1 },
    ),
    expected_auction_fingerprint: exactExpectedFingerprint(
      expectedAuctionFingerprint,
      "PRODUCTION_CALCUTTA_AUCTION_FINGERPRINT_REQUIRED",
    ),
    reason: clean(reason).slice(0, 120) || "EXPLICIT_RECALCULATION",
    requested_by: clean(requestedBy).slice(0, 180) || "Production Calcutta worker",
    request_fingerprint: operationFingerprint(requestFingerprint, "ENQUEUE"),
  }, options);
}

function claimedCalculationInputs(claimed, job) {
  const input = claimed?.calculation_input;
  const configuration = input?.configuration;
  const tournament = input?.tournament;
  const core = input?.core_view || input?.core || input?.canonical_core;
  if (!configuration || !tournament || !core) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_JOB_INVALID",
      "The claimed Production Calcutta calculation input is incomplete.",
    );
  }
  return {
    configurationView: {
      tournament,
      configuration: {
        ...configuration,
        configuration_fingerprint: clean(job.configuration_fingerprint),
      },
    },
    coreView: core,
  };
}

function productionCalcuttaResultState(engineState) {
  const state = clean(engineState).toUpperCase();
  if (new Set(["PROVISIONAL", "OFFICIAL"]).has(state)) return state;
  throw calcuttaError(
    "PRODUCTION_CALCUTTA_RESULT_STATE_INVALID",
    "The Production Calcutta engine state is unavailable.",
  );
}

export async function processProductionCalcuttaV1Job({
  expectedConfigurationRevision,
  expectedConfigurationFingerprint,
  expectedAuctionRevision,
  expectedAuctionFingerprint,
  workerId = "production-calcutta-v1-worker",
  requestFingerprint,
} = {}, options = {}) {
  const env = options.env || process.env;
  const dependencies = options.dependencies || {};
  const dispatchContext = await scoringDispatchContext({
    env,
    dependencies,
    suppliedContext: options.scoringDispatchContext,
  });
  const scopedOptions = { ...options, scoringDispatchContext: dispatchContext };
  const configurationRevision = exactInteger(
    expectedConfigurationRevision,
    "PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_REQUIRED",
    { minimum: 1 },
  );
  const auctionRevision = exactInteger(
    expectedAuctionRevision,
    "PRODUCTION_CALCUTTA_AUCTION_REVISION_REQUIRED",
    { minimum: 1 },
  );
  const configurationFingerprint = exactExpectedFingerprint(
    expectedConfigurationFingerprint,
    "PRODUCTION_CALCUTTA_CONFIGURATION_FINGERPRINT_REQUIRED",
  );
  const auctionFingerprint = exactExpectedFingerprint(
    expectedAuctionFingerprint,
    "PRODUCTION_CALCUTTA_AUCTION_FINGERPRINT_REQUIRED",
  );
  const worker = clean(workerId).slice(0, 120);
  if (!worker) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_WORKER_REQUIRED",
      "A bounded Production Calcutta worker identity is required.",
      400,
    );
  }
  const baseFingerprint = exactFingerprint(requestFingerprint);
  const claimed = await mutationRpc("claim_production_calcutta_v1_recalculation", {
    contract_version: PRODUCTION_CALCUTTA_V1_CONTRACT,
    expected_configuration_revision: configurationRevision,
    expected_configuration_fingerprint: configurationFingerprint,
    expected_auction_revision: auctionRevision,
    expected_auction_fingerprint: auctionFingerprint,
    worker_id: worker,
    lease_seconds: 60,
    request_fingerprint: operationFingerprint(baseFingerprint, "CLAIM"),
  }, scopedOptions);
  if (!claimed.job) return { ok: true, code: claimed.code, empty: true, job: null };

  const job = claimed.job;
  const jobId = clean(job.job_id);
  const claimToken = clean(job.claim_token);
  const expectedTournamentId = clean(dispatchContext?.runtime?.tournamentId);
  const expectedRuntimeGenerationId = clean(
    dispatchContext?.runtime?.runtimeGenerationId,
  ).toLowerCase();
  const annualRuntimeMismatch = expectedTournamentId !== PRODUCTION_TOURNAMENT_ID && (
    clean(claimed.tournament_id) !== expectedTournamentId ||
    clean(job.tournament_id) !== expectedTournamentId ||
    clean(job.runtime_generation_id).toLowerCase() !== expectedRuntimeGenerationId
  );
  const sourceFingerprint = exactFingerprint(
    job.source_fingerprint,
    "PRODUCTION_CALCUTTA_SOURCE_FINGERPRINT_REQUIRED",
  );
  const claimedConfigurationFingerprint = exactFingerprint(
    job.configuration_fingerprint,
    "PRODUCTION_CALCUTTA_CONFIGURATION_FINGERPRINT_REQUIRED",
  );
  const claimedAuctionFingerprint = exactFingerprint(
    job.auction_fingerprint,
    "PRODUCTION_CALCUTTA_AUCTION_FINGERPRINT_REQUIRED",
  );
  try {
    if (!jobId || !claimToken || annualRuntimeMismatch ||
        claimedConfigurationFingerprint !== configurationFingerprint ||
        claimedAuctionFingerprint !== auctionFingerprint ||
        Number(job.configuration_revision) !== configurationRevision ||
        Number(job.auction_revision) !== auctionRevision) {
      throw calcuttaError(
        annualRuntimeMismatch
          ? "PRODUCTION_CALCUTTA_JOB_RUNTIME_MISMATCH"
          : "PRODUCTION_CALCUTTA_JOB_INVALID",
        "The claimed Production Calcutta job is incomplete.",
      );
    }
    const { configurationView, coreView } = claimedCalculationInputs(claimed, job);
    const calculated = calculateCalcuttaFromSupabaseViews(configurationView, coreView);
    const result = await mutationRpc("complete_production_calcutta_v1_recalculation", {
      contract_version: PRODUCTION_CALCUTTA_V1_CONTRACT,
      expected_configuration_revision: configurationRevision,
      expected_configuration_fingerprint: claimedConfigurationFingerprint,
      expected_auction_revision: auctionRevision,
      expected_auction_fingerprint: claimedAuctionFingerprint,
      expected_result_revision: exactInteger(
        job.expected_result_revision,
        "PRODUCTION_CALCUTTA_RESULT_REVISION_REQUIRED",
      ),
      job_id: jobId,
      claim_token: claimToken,
      worker_id: worker,
      configuration_fingerprint: claimedConfigurationFingerprint,
      auction_fingerprint: claimedAuctionFingerprint,
      expected_source_fingerprint: sourceFingerprint,
      engine_version: CALCUTTA_ENGINE_VERSION,
      result_state: productionCalcuttaResultState(calculated.resultState),
      result_payload: calculated.calcutta,
      request_fingerprint: operationFingerprint(baseFingerprint, `COMPLETE:${jobId}`),
    }, scopedOptions);
    return {
      ...result,
      empty: false,
      calculation: calculated.canonicalInputVerification,
    };
  } catch (error) {
    if (jobId && claimToken) {
      try {
        await mutationRpc("fail_production_calcutta_v1_recalculation", {
          contract_version: PRODUCTION_CALCUTTA_V1_CONTRACT,
          expected_configuration_revision: configurationRevision,
          expected_configuration_fingerprint: configurationFingerprint,
          expected_auction_revision: auctionRevision,
          expected_auction_fingerprint: auctionFingerprint,
          job_id: jobId,
          claim_token: claimToken,
          worker_id: worker,
          error_code: clean(error?.code || "PRODUCTION_CALCUTTA_CALCULATION_FAILED").slice(0, 120),
          error_safe: "Calcutta recalculation is temporarily unavailable.",
          request_fingerprint: operationFingerprint(baseFingerprint, `FAIL:${jobId}`),
        }, scopedOptions);
      } catch {
        // The original error remains authoritative. A newer job or expired
        // lease safely makes this failed claim stale.
      }
    }
    throw error;
  }
}

export async function drainProductionCalcuttaV1Jobs({
  expectedConfigurationRevision,
  expectedConfigurationFingerprint,
  expectedAuctionRevision,
  expectedAuctionFingerprint,
  maximum = 3,
  workerId,
  requestFingerprint,
} = {}, options = {}) {
  const limit = Math.max(1, Math.min(3, Number(maximum) || 1));
  const base = exactFingerprint(requestFingerprint);
  const env = options.env || process.env;
  const dependencies = options.dependencies || {};
  const dispatchContext = await scoringDispatchContext({
    env,
    dependencies,
    suppliedContext: options.scoringDispatchContext,
  });
  const scopedOptions = { ...options, scoringDispatchContext: dispatchContext };
  const results = [];
  for (let index = 0; index < limit; index += 1) {
    const result = await processProductionCalcuttaV1Job({
      expectedConfigurationRevision,
      expectedConfigurationFingerprint,
      expectedAuctionRevision,
      expectedAuctionFingerprint,
      workerId,
      requestFingerprint: operationFingerprint(base, `JOB:${index}`),
    }, scopedOptions);
    results.push(result);
    if (result.empty) break;
  }
  return {
    ok: true,
    processed: results.filter((result) => !result.empty).length,
    empty: results.at(-1)?.empty === true,
    results,
  };
}

/** Service-only control tokens; never returns auction, result, or identity facts. */
export async function inspectProductionCalcuttaV1(options = {}) {
  const inspected = await mutationRpc("inspect_production_calcutta_v1", {
    contract_version: PRODUCTION_CALCUTTA_V1_CONTRACT,
    request_fingerprint: serviceOperationFingerprint("INSPECT"),
  }, options);
  if (!inspected?.ok || !inspected.data) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_STATE_UNAVAILABLE",
      "The current Production Calcutta control state is unavailable.",
    );
  }
  return inspected.data;
}

/** Resolve the affected canonical Match under the pointer lock. */
export async function resolveProductionCalcuttaPostCommitMatch({
  matchId,
} = {}, options = {}) {
  const targetMatchId = clean(matchId);
  if (!targetMatchId || targetMatchId.length > 120) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_MATCH_REQUIRED",
      "An exact canonical Match is required for Calcutta recalculation.",
      400,
    );
  }
  const env = options.env || process.env;
  const dependencies = options.dependencies || {};
  const dispatchContext = await scoringDispatchContext({
    env,
    dependencies,
    suppliedContext: options.scoringDispatchContext,
  });
  const annual = clean(dispatchContext?.runtime?.tournamentId) !==
    PRODUCTION_TOURNAMENT_ID;
  let resolved;
  if (annual) {
    const rpc = dependencies.scoringRpc || productionScoringOperationsRpc;
    const result = await rpc("resolve_production_calcutta_postcommit_match_v1", {
      contract_version: PRODUCTION_CALCUTTA_V1_CONTRACT,
      match_id: targetMatchId,
      request_fingerprint: annualOperationFingerprint(
        serviceOperationFingerprint("POSTCOMMIT_MATCH", targetMatchId),
        "resolve_production_calcutta_postcommit_match_v1",
        dispatchContext,
      ),
    }, {
      env,
      scoringDispatchContext: dispatchContext,
      ...(dependencies.scoringRpcOptions || {}),
    });
    resolved = result?.payload;
  } else {
    const context = await mutationContext({ env, dependencies });
    const result = await context.rpc(
      "resolve_production_calcutta_postcommit_match_v1",
      {
        match_id: targetMatchId,
        expected_activation_revision: context.activationRevision,
      },
      {
        env,
        activation: context.activation,
        ...(dependencies.rpcOptions || {}),
      },
    );
    resolved = result?.payload;
  }
  const expectedTournamentId = clean(dispatchContext?.runtime?.tournamentId);
  const normalizedTournamentId = clean(resolved?.tournament_id);
  if (!resolved?.ok || normalizedTournamentId !== expectedTournamentId ||
      clean(resolved.match_id) !== targetMatchId) {
    throw calcuttaError(
      "PRODUCTION_CALCUTTA_MATCH_TOURNAMENT_MISMATCH",
      "The canonical Match Calcutta context is unavailable.",
      409,
    );
  }
  return {
    tournamentId: normalizedTournamentId,
    matchId: targetMatchId,
    runtimeGenerationId: clean(resolved.runtime_generation_id),
    pointerRevision: Number(resolved.pointer_revision),
  };
}

/** Drain only the exact currently-bound Production V1 queue. */
export async function drainCurrentProductionCalcuttaV1Jobs({
  maximum = 3,
  workerId = "production-calcutta-v1-worker",
  requestFingerprint,
} = {}, options = {}) {
  const env = options.env || process.env;
  const dependencies = options.dependencies || {};
  const dispatchContext = await scoringDispatchContext({
    env,
    dependencies,
    suppliedContext: options.scoringDispatchContext,
  });
  const scopedOptions = {
    ...options,
    env,
    dependencies,
    scoringDispatchContext: dispatchContext,
  };
  const state = await (dependencies.inspectProductionCalcuttaV1 ||
    inspectProductionCalcuttaV1)(scopedOptions);
  if (clean(state?.state).toUpperCase() === "NOT_CONFIGURED" ||
      Number(state?.auction_revision) === 0) {
    return {
      ok: true,
      code: "PRODUCTION_CALCUTTA_V1_NOT_CONFIGURED",
      skipped: true,
      processed: 0,
      empty: true,
    };
  }
  return (dependencies.drainProductionCalcuttaV1Jobs ||
    drainProductionCalcuttaV1Jobs)({
    expectedConfigurationRevision: state.configuration_revision,
    expectedConfigurationFingerprint: state.configuration_fingerprint,
    expectedAuctionRevision: state.auction_revision,
    expectedAuctionFingerprint: state.auction_fingerprint,
    maximum,
    workerId,
    requestFingerprint,
  }, scopedOptions);
}
