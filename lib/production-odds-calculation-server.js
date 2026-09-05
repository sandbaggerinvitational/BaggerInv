import "server-only";

import {
  buildOddsCalculationInvocation,
  certifyOddsCalculationReference,
  processOddsCalculationJob,
} from "./championship-odds-resilience.js";
import {
  logicalOddsResult,
  oddsEngineInputsFromBundle,
} from "./championship-odds-supabase.js";
import {
  PRODUCTION_ODDS_CALCULATION_WORKER,
  PRODUCTION_ODDS_CALCULATION_MODES,
  assertProductionOddsCalculationEnvironment,
  assertProductionOddsStoredJobScope,
  productionOddsCalculationDependencies,
  productionOddsCalculationRequestInput,
  productionOddsCalculationScope,
  productionOddsInputRevision,
  productionStep11OddsServiceAuthorizationInput,
  productionStep11OddsStageReleaseInput,
  productionStep11OddsRuntimeConfigurationInput,
} from "./production-odds-calculation-contract.js";
import {
  buildProductionOddsRehearsalInputs,
  productionOddsPairingEvidenceFromCurrentState,
} from "./production-odds-rehearsal-fixture.js";
import {
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import { readProductionCurrentTournamentRuntime } from "./production-current-tournament-runtime.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";

const clean = (value) => String(value ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ANNUAL_ODDS_RPC_ALLOWLIST = new Set([
  "read_production_odds_calculation_inputs",
  "request_production_odds_calculation_job",
  "claim_production_odds_calculation_job",
  "checkpoint_production_odds_calculation_job",
  "complete_production_odds_calculation_job",
  "fail_production_odds_calculation_job",
  "supersede_production_odds_calculation_job",
  "read_production_odds_calculation_jobs",
  "read_production_odds_publication_v1",
  "publish_production_championship_odds_v1",
  "withdraw_production_odds_publication_v1",
]);

const ANNUAL_ODDS_DISPATCH_RPC = "dispatch_production_annual_scoring_v1";
const ANNUAL_GOOGLE_DESTINATION_RPC =
  "read_production_annual_google_destination_v1";

const RPC_ALLOWLIST = new Set([
  "configure_production_odds_calculation_runtime",
  "inspect_production_odds_calculation_runtime_control",
  "read_production_odds_calculation_inputs",
  "request_production_odds_calculation_job",
  "claim_production_odds_calculation_job",
  "checkpoint_production_odds_calculation_job",
  "complete_production_odds_calculation_job",
  "fail_production_odds_calculation_job",
  "supersede_production_odds_calculation_job",
  "read_production_odds_calculation_jobs",
  "publish_production_championship_odds_v1",
  "read_production_odds_publication_v1",
  "withdraw_production_odds_publication_v1",
  "authorize_production_step11_odds_service_bridge",
  "stage_production_cutover_release",
  "inspect_production_cutover_authority",
]);

function rpcHeaders(secret) {
  const headers = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  return headers;
}

function operationError(code, message, diagnostics = {}, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.diagnostics = diagnostics;
  return error;
}

function exactActivationRevision(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw operationError(
      "PRODUCTION_STEP11_ODDS_ACTIVATION_REVISION_REQUIRED",
      "An explicit non-negative integer activation revision is required.",
      {},
      400,
    );
  }
  return value;
}

function exactRuntimeRevision(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw operationError(
      "PRODUCTION_STEP11_ODDS_RUNTIME_REVISION_REQUIRED",
      "An explicit non-negative integer runtime revision is required.",
      {},
      400,
    );
  }
  return value;
}

function exactRuntimeEnabled(value) {
  if (typeof value !== "boolean") {
    throw operationError(
      "PRODUCTION_STEP11_ODDS_RUNTIME_STATE_REQUIRED",
      "An explicit current runtime state is required.",
      {},
      400,
    );
  }
  return value;
}

export async function productionOddsCalculationRpc(functionName, input = {}, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 20_000,
} = {}) {
  const name = clean(functionName);
  if (!RPC_ALLOWLIST.has(name)) {
    throw operationError(
      "PRODUCTION_ODDS_CALCULATION_RPC_FORBIDDEN",
      "The Production Odds calculation RPC is not allowlisted.",
      { functionName: name },
      403,
    );
  }
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw operationError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "The Production server credential is unavailable.",
    );
  }
  const body = productionOddsCalculationScope(env, input);
  recordDataAuthorityTransport("supabase", {
    adapter: "production-odds-calculation",
    source: name,
  });
  const startedAt = Date.now();
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: rpcHeaders(secret),
    body: JSON.stringify({ input: body }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw operationError(
      "PRODUCTION_ODDS_CALCULATION_RPC_FAILED",
      `Production Odds calculation RPC failed (${response.status}).`,
      { functionName: name, status: response.status, code: clean(payload?.code || payload?.message) },
      response.status,
    );
  }
  return { ok: true, payload, durationMs: Date.now() - startedAt };
}

function normalizeAnnualOddsGoogleDestination(payload, runtime) {
  const value = payload?.data || payload?.result || payload;
  const contractVersion = clean(
    value?.contractVersion || value?.contract_version,
  );
  const tournamentId = clean(value?.tournamentId || value?.tournament_id);
  const writerGenerationId = clean(
    value?.writerGenerationId || value?.writer_generation_id,
  ).toLowerCase();
  const destinationWorkbookId = clean(
    value?.destinationWorkbookId || value?.destination_workbook_id,
  );
  const targetContractFingerprint = clean(
    value?.targetContractFingerprint || value?.target_contract_fingerprint,
  ).toLowerCase();
  if (value?.ok !== true ||
      contractVersion !== "production-annual-google-destination-v1" ||
      tournamentId !== runtime.tournamentId ||
      !UUID.test(writerGenerationId) || !destinationWorkbookId ||
      !/^[0-9a-f]{64}$/.test(targetContractFingerprint)) {
    throw operationError(
      "PRODUCTION_ANNUAL_GOOGLE_DESTINATION_INVALID",
      "The current annual Odds destination certification is unavailable.",
    );
  }
  return Object.freeze({
    contractVersion,
    tournamentId,
    writerGenerationId,
    destinationWorkbookId,
    targetContractFingerprint,
  });
}

export async function resolveProductionOddsRuntimeContext({
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 10_000,
  readRuntime = readProductionCurrentTournamentRuntime,
  readDestination,
} = {}) {
  const calculation = assertProductionOddsCalculationEnvironment(env);
  if (calculation.mode === PRODUCTION_ODDS_CALCULATION_MODES.REHEARSAL) {
    return Object.freeze({
      frozen2026: true,
      runtime: Object.freeze({
        tournamentId: PRODUCTION_TOURNAMENT_ID,
        tournamentYear: 2026,
      }),
      googleDestination: null,
    });
  }
  const runtime = await readRuntime({}, { env });
  if (runtime.tournamentId === PRODUCTION_TOURNAMENT_ID) {
    return Object.freeze({ frozen2026: true, runtime, googleDestination: null });
  }
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw operationError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "The Production server credential is unavailable.",
    );
  }
  const input = productionOddsCalculationScope(env, {
    target_tournament_id: runtime.tournamentId,
    expected_current_tournament_id: runtime.tournamentId,
    expected_pointer_revision: runtime.pointerRevision,
    expected_runtime_generation_id: runtime.runtimeGenerationId,
    expected_annual_authority_generation_id: runtime.authorityGenerationId,
    expected_annual_admission_generation_id: runtime.admissionGenerationId,
  });
  let payload;
  if (readDestination) {
    payload = await readDestination(input, runtime);
  } else {
    recordDataAuthorityTransport("supabase", {
      adapter: "production-annual-odds-runtime",
      source: ANNUAL_GOOGLE_DESTINATION_RPC,
    });
    const response = await fetchImpl(
      `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${ANNUAL_GOOGLE_DESTINATION_RPC}`,
      {
        method: "POST",
        headers: rpcHeaders(secret),
        body: JSON.stringify({ input }),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw operationError(
        clean(payload?.code || payload?.message ||
          "PRODUCTION_ANNUAL_GOOGLE_DESTINATION_UNAVAILABLE"),
        "The current annual Odds destination certification is unavailable.",
        { status: response.status },
        response.status,
      );
    }
  }
  return Object.freeze({
    frozen2026: false,
    runtime,
    googleDestination: normalizeAnnualOddsGoogleDestination(payload, runtime),
  });
}

export async function productionCurrentOddsCalculationRpc(
  functionName,
  input = {},
  {
    env = process.env,
    fetchImpl = fetch,
    timeoutMs = 20_000,
    runtimeContext,
  } = {},
) {
  const name = clean(functionName);
  const context = runtimeContext || await resolveProductionOddsRuntimeContext({
    env,
    fetchImpl,
    timeoutMs: Math.min(timeoutMs, 10_000),
  });
  if (context.frozen2026) {
    const result = await productionOddsCalculationRpc(name, input, {
      env,
      fetchImpl,
      timeoutMs,
    });
    return { ...result, runtimeContext: context };
  }
  if (!ANNUAL_ODDS_RPC_ALLOWLIST.has(name)) {
    throw operationError(
      "PRODUCTION_ANNUAL_ODDS_OPERATION_FORBIDDEN",
      "The annual Production Odds operation is not allowlisted.",
      { functionName: name },
      403,
    );
  }
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw operationError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "The Production server credential is unavailable.",
    );
  }
  const body = productionOddsCalculationScope(env, {
    ...input,
    annual_odds_operation: name,
  }, context);
  recordDataAuthorityTransport("supabase", {
    adapter: "production-annual-odds",
    source: name,
  });
  const startedAt = Date.now();
  const response = await fetchImpl(
    `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${ANNUAL_ODDS_DISPATCH_RPC}`,
    {
      method: "POST",
      headers: rpcHeaders(secret),
      body: JSON.stringify({ input: body }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw operationError(
      "PRODUCTION_ODDS_CALCULATION_RPC_FAILED",
      `Production Odds calculation RPC failed (${response.status}).`,
      {
        functionName: name,
        status: response.status,
        code: clean(payload?.code || payload?.message),
      },
      response.status,
    );
  }
  return {
    ok: true,
    payload,
    durationMs: Date.now() - startedAt,
    runtimeContext: context,
  };
}

export async function loadProductionOddsCalculationInputs(
  tournamentId = PRODUCTION_TOURNAMENT_ID,
  {
    env = process.env,
    readInputs,
    runtimeContext,
    resolveRuntime = resolveProductionOddsRuntimeContext,
  } = {},
) {
  const context = runtimeContext || await resolveRuntime({ env });
  const target = context.runtime.tournamentId;
  if (context.frozen2026 && clean(tournamentId) !== PRODUCTION_TOURNAMENT_ID) {
    throw operationError(
      "PRODUCTION_ODDS_TOURNAMENT_SCOPE_REQUIRED",
      "The current Production tournament is required.",
      {},
      400,
    );
  }
  if (!context.frozen2026 && clean(tournamentId) !== target) {
    throw operationError(
      "PRODUCTION_ODDS_TOURNAMENT_SCOPE_REQUIRED",
      "The current Production tournament is required.",
      {},
      400,
    );
  }
  if (context.frozen2026) {
    const result = readInputs
      ? await readInputs(PRODUCTION_TOURNAMENT_ID, { env })
      : await productionOddsCalculationRpc(
        "read_production_odds_calculation_inputs",
        {},
        { env },
      );
    return productionOddsInputsFromRpcResult(result, context);
  }
  const result = readInputs
    ? await readInputs(target, { env, runtimeContext: context })
    : await productionCurrentOddsCalculationRpc(
      "read_production_odds_calculation_inputs",
      {},
      { env, runtimeContext: context },
    );
  return productionOddsInputsFromRpcResult(result, context);
}

function productionOddsInputsFromRpcResult(result, context) {
  if (!result.payload?.ok || !result.payload?.data?.input_configuration) {
    throw operationError(
      clean(result.payload?.code || "PRODUCTION_ODDS_INPUTS_UNAVAILABLE"),
      "Production Championship Odds inputs are unavailable.",
    );
  }
  const inputs = oddsEngineInputsFromBundle(result.payload.data);
  return {
    ...inputs,
    metadata: {
      ...(inputs.metadata || {}),
      productionPairingEvidence: productionOddsPairingEvidenceFromCurrentState(
        result.payload.data.current_state,
      ),
    },
    configuration: result.payload.data.input_configuration,
    diagnostics: {
      queryMs: Number(result.payload.data.query_ms || 0),
      serviceMs: Number(result.durationMs || 0),
    },
    runtimeContext: context,
  };
}

export async function configureProductionOddsCalculationRuntime({
  enabled,
  actorId,
  expectedActivationRevision,
  expectedRuntimeRevision,
  expectedRuntimeEnabled,
  requestFingerprint,
} = {}, options = {}) {
  const activationRevision = exactActivationRevision(expectedActivationRevision);
  const runtimeRevision = exactRuntimeRevision(expectedRuntimeRevision);
  const runtimeEnabled = exactRuntimeEnabled(expectedRuntimeEnabled);
  return productionOddsCalculationRpc(
    "configure_production_odds_calculation_runtime",
    {
      enabled: enabled === true,
      actor_id: clean(actorId),
      expected_activation_revision: activationRevision,
      expected_runtime_revision: runtimeRevision,
      expected_runtime_enabled: runtimeEnabled,
      request_fingerprint: clean(requestFingerprint).toLowerCase(),
      worker_name: PRODUCTION_ODDS_CALCULATION_WORKER,
    },
    options,
  );
}

export async function authorizeProductionStep11OddsServiceBridge({
  requestFingerprint,
  env = process.env,
  rpc = productionOddsCalculationRpc,
} = {}) {
  const input = productionStep11OddsServiceAuthorizationInput({
    requestFingerprint,
    env,
  });
  const result = await rpc(
    "authorize_production_step11_odds_service_bridge",
    input,
    { env },
  );
  const payload = result?.payload || {};
  const activationRevision = payload.activationRevision;
  const runtimeActivationRevision = payload.runtimeActivationRevision;
  const runtimeEnabled = payload.runtimeEnabled;
  const runtimeOperationMode = clean(payload.runtimeOperationMode).toUpperCase();
  const workerContractOperationAllowed = payload.workerContractOperationAllowed;
  const entitlementRevision = payload.entitlementRevision;
  const activationRevisionValid = typeof activationRevision === "number" &&
    Number.isSafeInteger(activationRevision) && activationRevision >= 0;
  const entitlementRevisionValid = typeof entitlementRevision === "number" &&
    Number.isSafeInteger(entitlementRevision) && entitlementRevision >= 1;
  const runtimeStateValid = typeof runtimeEnabled === "boolean" &&
    typeof workerContractOperationAllowed === "boolean" &&
    (runtimeEnabled
      ? typeof runtimeActivationRevision === "number" &&
        Number.isSafeInteger(runtimeActivationRevision) && runtimeActivationRevision >= 0 &&
        runtimeActivationRevision === activationRevision &&
        runtimeOperationMode === "STEP11_REHEARSAL" &&
        workerContractOperationAllowed === true
      : runtimeActivationRevision === null && runtimeOperationMode === "DORMANT" &&
        workerContractOperationAllowed === false);
  const workerContractSafe = payload.workerContractSchedulerInstalled === false &&
    payload.workerContractAuthoritativeWriteAllowed === false;
  if (payload.ok !== true || payload.active !== true ||
      clean(payload.contractVersion) !== "production-step11-odds-service-authorization-v1" ||
      clean(payload.operationMode) !== "STEP11_REHEARSAL" ||
      clean(payload.directorPlayerId) !== "CB01" ||
      clean(payload.role).toUpperCase() !== "DIRECTOR" ||
      clean(payload.tournamentId) !== PRODUCTION_TOURNAMENT_ID ||
      payload.publicationCreated !== false ||
      payload.mirrorCreated !== false ||
      payload.externalGoogleWrites !== 0 ||
      payload.auditRecorded !== true || !activationRevisionValid ||
      !entitlementRevisionValid || !runtimeStateValid || !workerContractSafe) {
    throw operationError(
      clean(payload.code || "PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_FAILED"),
      "The isolated Step 11 service authorization could not be proven.",
      {
        active: payload.active === true,
        playerScopeMatches: clean(payload.directorPlayerId) === "CB01",
        roleMatches: clean(payload.role).toUpperCase() === "DIRECTOR",
        tournamentMatches: clean(payload.tournamentId) === PRODUCTION_TOURNAMENT_ID,
        activationRevisionValid,
        entitlementRevisionValid,
        runtimeStateValid,
        workerContractSafe,
      },
      403,
    );
  }
  return {
    status: "active",
    source: "production-step11-odds-service-bridge",
    identity: {
      actor: { id: "CB01", name: "Tournament Director", role: "DIRECTOR" },
      player: { id: "CB01", name: "Tournament Director", role: "DIRECTOR" },
      tournamentId: PRODUCTION_TOURNAMENT_ID,
      entitlement: {
        source: "production-step11-odds-service-bridge",
        revision: entitlementRevision,
      },
    },
    diagnostics: {
      contractVersion: clean(payload.contractVersion),
      operationMode: clean(payload.operationMode),
      activationRevision,
      runtimeActivationRevision,
      runtimeActivationRevisionMatches: true,
      runtimeEnabled,
      runtimeOperationMode,
      workerContractOperationAllowed,
      workerContractSchedulerInstalled: false,
      workerContractAuthoritativeWriteAllowed: false,
      auditRecorded: payload.auditRecorded === true,
      publicationCreated: false,
      mirrorCreated: false,
      externalGoogleWrites: 0,
    },
  };
}

function assertLegacyAuthorityState(payload = {}) {
  const flags = payload.resource_flags || {};
  if (payload.ok !== true || clean(payload.authority).toUpperCase() !== "GOOGLE" ||
      flags.current_tournament_read_authority !== "GOOGLE" ||
      flags.scoring_authority !== "GOOGLE" ||
      flags.participant_identity_authority !== "PASSPORT" ||
      flags.public_supabase_reads_enabled !== false ||
      flags.scoring_ingress_enabled !== false ||
      flags.google_writes_enabled !== false ||
      flags.odds_publication_enabled !== false ||
      payload.first_canonical_write_boundary?.possible === true ||
      payload.first_canonical_write_boundary?.observed === true) {
    throw operationError(
      "PRODUCTION_STEP11_ODDS_LEGACY_AUTHORITY_REQUIRED",
      "The isolated Odds rehearsal requires the unchanged Google/Passport authority state.",
      {},
      409,
    );
  }
  return payload;
}

export async function inspectProductionStep11OddsControlState({
  requestFingerprint,
  authorizationDiagnostics = {},
  env = process.env,
  rpc = productionOddsCalculationRpc,
} = {}) {
  const input = productionStep11OddsServiceAuthorizationInput({
    requestFingerprint,
    env,
  });
  const result = await rpc("inspect_production_cutover_authority", input, { env });
  const payload = assertLegacyAuthorityState(result?.payload || {});
  const runtimeResult = await rpc(
    "inspect_production_odds_calculation_runtime_control",
    input,
    { env },
  );
  const runtime = runtimeResult?.payload || {};
  const oddsWorker = payload.workers?.ODDS_CALCULATION || {};
  const mirrorWorker = payload.workers?.ODDS_GOOGLE_MIRROR || {};
  const activationRevision = payload.activation_revision;
  const activationRevisionValid = typeof activationRevision === "number" &&
    Number.isSafeInteger(activationRevision) && activationRevision >= 0;
  const authorizationSnapshotMatches =
    activationRevisionValid &&
    authorizationDiagnostics.activationRevision === activationRevision &&
    authorizationDiagnostics.runtimeActivationRevisionMatches === true &&
    authorizationDiagnostics.runtimeEnabled === (oddsWorker.enabled === true) &&
    authorizationDiagnostics.workerContractOperationAllowed === (oddsWorker.enabled === true) &&
    authorizationDiagnostics.workerContractSchedulerInstalled === false &&
    authorizationDiagnostics.workerContractAuthoritativeWriteAllowed === false;
  const runtimeRevision = runtime.runtime_revision;
  const runtimeRevisionValid = typeof runtimeRevision === "number" &&
    Number.isSafeInteger(runtimeRevision) && runtimeRevision >= 0;
  const runtimeSnapshotMatches = runtime.ok === true && runtimeRevisionValid &&
    runtime.enabled === (oddsWorker.enabled === true) &&
    clean(runtime.operation_mode).toUpperCase() ===
      (oddsWorker.enabled === true ? "STEP11_REHEARSAL" : "DORMANT") &&
    runtime.activation_revision === (oddsWorker.enabled === true ? activationRevision : null) &&
    runtime.worker_enabled === (oddsWorker.enabled === true) &&
    runtime.worker_operation_allowed === (oddsWorker.enabled === true) &&
    runtime.scheduler_installed === false &&
    runtime.authoritative_write_allowed === false &&
    runtime.google_writes_allowed === false;
  if (oddsWorker.google_writes_allowed === true || oddsWorker.scheduler_installed === true ||
      mirrorWorker.enabled === true || mirrorWorker.google_writes_allowed === true ||
      !authorizationSnapshotMatches || !runtimeSnapshotMatches) {
    throw operationError(
      "PRODUCTION_STEP11_ODDS_EXTERNAL_WRITE_BOUNDARY_FAILED",
      "The isolated Odds rehearsal control state is not internally consistent or write-safe.",
      { authorizationSnapshotMatches, runtimeSnapshotMatches },
      409,
    );
  }
  return {
    ok: true,
    state: clean(payload.state),
    activationRevision,
    runtimeRevision,
    runtimeEnabled: runtime.enabled,
    deploymentCommit: clean(payload.deployment_commit),
    sourceFingerprint: clean(payload.source_fingerprint),
    authority: "GOOGLE",
    scoringIngressEnabled: false,
    oddsWorkerEnabled: oddsWorker.enabled === true,
    oddsWorkerSchedulerInstalled: oddsWorker.scheduler_installed === true,
    runtimeActivationRevision: authorizationDiagnostics.runtimeActivationRevision,
    runtimeActivationRevisionMatches: true,
    workerContractOperationAllowed: authorizationDiagnostics.workerContractOperationAllowed,
    workerContractSchedulerInstalled: false,
    workerContractAuthoritativeWriteAllowed: false,
    googleMirrorEnabled: false,
    publicationEnabled: false,
    firstCanonicalWritePossible: false,
    firstCanonicalWriteObserved: false,
  };
}

export async function stageProductionStep11OddsRelease({
  expectedActivationRevision,
  requestFingerprint,
  env = process.env,
  rpc = productionOddsCalculationRpc,
} = {}) {
  const input = productionStep11OddsStageReleaseInput({
    expectedActivationRevision,
    requestFingerprint,
    env,
  });
  const result = await rpc("stage_production_cutover_release", input, { env });
  const payload = result?.payload || {};
  const activationRevision = payload.activation_revision;
  const returnedRevisionValid = typeof activationRevision === "number" &&
    Number.isSafeInteger(activationRevision) && activationRevision >= 0;
  if (payload.ok !== true || clean(payload.state) !== "STAGED" ||
      clean(payload.authority).toUpperCase() !== "GOOGLE" ||
      payload.scoring_ingress_enabled !== false ||
      !returnedRevisionValid ||
      activationRevision !== input.expected_activation_revision + 1) {
    throw operationError(
      clean(payload.code || "PRODUCTION_STEP11_ODDS_RELEASE_STAGE_FAILED"),
      "The exact isolated Step 11 release could not be staged safely.",
      {},
      409,
    );
  }
  return {
    ok: true,
    state: "STAGED",
    activationRevision,
    authority: "GOOGLE",
    scoringIngressEnabled: false,
    publicationCreated: false,
    mirrorCreated: false,
    externalGoogleWrites: 0,
    idempotent: payload.idempotent === true,
  };
}

export async function setProductionStep11OddsRuntime({
  enabled,
  expectedActivationRevision,
  expectedRuntimeRevision,
  expectedRuntimeEnabled,
  requestFingerprint,
  env = process.env,
  rpc = productionOddsCalculationRpc,
} = {}) {
  const input = productionStep11OddsRuntimeConfigurationInput({
    enabled,
    expectedActivationRevision,
    expectedRuntimeRevision,
    expectedRuntimeEnabled,
    requestFingerprint,
    env,
  });
  const result = await rpc("configure_production_odds_calculation_runtime", input, { env });
  const payload = result?.payload || {};
  const expectedMode = enabled === true ? "STEP11_REHEARSAL" : "DORMANT";
  const returnedRuntimeRevision = payload.runtime_revision;
  const returnedRuntimeRevisionValid = typeof returnedRuntimeRevision === "number" &&
    Number.isSafeInteger(returnedRuntimeRevision) &&
    returnedRuntimeRevision === input.expected_runtime_revision + 1;
  if (payload.ok !== true || payload.enabled !== (enabled === true) ||
      clean(payload.operation_mode).toUpperCase() !== expectedMode ||
      payload.previous_runtime_revision !== input.expected_runtime_revision ||
      payload.previous_runtime_enabled !== input.expected_runtime_enabled ||
      !returnedRuntimeRevisionValid ||
      payload.scheduler_installed !== false ||
      payload.authoritative_write_allowed !== false ||
      payload.publication_created !== false || payload.mirror_created !== false) {
    throw operationError(
      clean(payload.code || "PRODUCTION_STEP11_ODDS_RUNTIME_CONFIGURATION_FAILED"),
      "The isolated Step 11 Odds runtime could not be configured safely.",
      {},
      409,
    );
  }
  return {
    ok: true,
    enabled: payload.enabled,
    operationMode: expectedMode,
    activationRevision: input.expected_activation_revision,
    previousRuntimeRevision: input.expected_runtime_revision,
    runtimeRevision: returnedRuntimeRevision,
    previousRuntimeEnabled: input.expected_runtime_enabled,
    schedulerInstalled: false,
    authoritativeWriteAllowed: false,
    publicationCreated: false,
    mirrorCreated: false,
    externalGoogleWrites: 0,
    serviceAuthorizationBridgeMustBeDisabled: enabled !== true,
    nextRequiredAction: enabled === true
      ? null
      : "DISABLE_PRODUCTION_STEP11_ODDS_SERVICE_AUTH_BRIDGE",
  };
}

export async function requestProductionOddsCalculation({
  phase,
  iterations,
  requestedBy,
  outputTimestamp,
  env = process.env,
  dependencies = {},
} = {}) {
  const resolveRuntime = dependencies.resolveRuntime ||
    resolveProductionOddsRuntimeContext;
  const runtimeContext = await resolveRuntime({ env });
  const target = runtimeContext.runtime.tournamentId;
  const loadInputs = dependencies.loadInputs || loadProductionOddsCalculationInputs;
  const requestJob = dependencies.requestJob || ((input) => productionCurrentOddsCalculationRpc(
    "request_production_odds_calculation_job",
    input,
    { env, runtimeContext },
  ));
  const loadedInputs = await loadInputs(target, { env, runtimeContext });
  const scope = productionOddsCalculationScope(env, {}, runtimeContext);
  const inputs = scope.operation_mode === PRODUCTION_ODDS_CALCULATION_MODES.REHEARSAL
    ? buildProductionOddsRehearsalInputs(loadedInputs, { scope })
    : loadedInputs;
  const invocation = buildOddsCalculationInvocation({
    inputs,
    phase,
    iterations,
    requestedBy,
    outputTimestamp,
  });
  const requestInput = productionOddsCalculationRequestInput({
    invocation,
    configuration: inputs.configuration,
    env,
    runtimeContext,
  });
  requestInput.resource_metrics = {
    ...(requestInput.resource_metrics || {}),
    inputPreparationMs: Number(inputs.diagnostics?.serviceMs || 0),
    supabaseQueryMs: Number(inputs.diagnostics?.queryMs || 0),
    inputSnapshotBytes: Buffer.byteLength(JSON.stringify(requestInput.input_snapshot)),
  };
  const requested = await requestJob(requestInput);
  if (!requested.payload?.ok) {
    throw operationError(
      clean(requested.payload?.code || "PRODUCTION_ODDS_CALCULATION_REQUEST_FAILED"),
      "Production Championship Odds calculation could not be requested.",
    );
  }
  if (requested.payload.job) {
    assertProductionOddsStoredJobScope(
      requested.payload.job,
      env,
      runtimeContext,
    );
  }
  return {
    inputs,
    invocation: requestInput,
    requested: requested.payload,
    runtimeContext,
  };
}

export function productionOddsCalculationWorkerDependencies(
  env = process.env,
  rpc = productionCurrentOddsCalculationRpc,
  runtimeContext = null,
) {
  return productionOddsCalculationDependencies(
    env,
    (functionName, input) => rpc(functionName, input, {
      env,
      runtimeContext,
    }),
    runtimeContext,
  );
}

export async function processProductionOddsCalculationJob(jobId, {
  env = process.env,
  rpc = productionCurrentOddsCalculationRpc,
  runtimeContext,
  resolveRuntime = resolveProductionOddsRuntimeContext,
  ...options
} = {}) {
  const context = runtimeContext || await resolveRuntime({ env });
  return processOddsCalculationJob(jobId, {
    ...options,
    dependencies: productionOddsCalculationWorkerDependencies(env, rpc, context),
  });
}

export async function readProductionOddsCalculationJobs(jobId = "", {
  env = process.env,
  rpc = productionCurrentOddsCalculationRpc,
  runtimeContext,
  resolveRuntime = resolveProductionOddsRuntimeContext,
} = {}) {
  const context = runtimeContext || await resolveRuntime({ env });
  const result = await rpc(
    "read_production_odds_calculation_jobs",
    { job_id: clean(jobId) },
    { env, runtimeContext: context },
  );
  for (const job of result?.payload?.jobs || []) {
    assertProductionOddsStoredJobScope(job, env, context);
  }
  return { ...result, runtimeContext: context };
}

export async function supersedeProductionOddsCalculationJob(jobId, {
  env = process.env,
  rpc = productionCurrentOddsCalculationRpc,
  runtimeContext,
  resolveRuntime = resolveProductionOddsRuntimeContext,
} = {}) {
  const context = runtimeContext || await resolveRuntime({ env });
  return rpc(
    "supersede_production_odds_calculation_job",
    { job_id: clean(jobId) },
    { env, runtimeContext: context },
  );
}

/**
 * Resolve an exact retained Production calculation for publication. READY
 * jobs are rebound to the current canonical inputs before they can publish.
 * A PUBLISHED job is still returned so a lost-response retry can reach the
 * database receipt and complete idempotently without creating a transition.
 */
export async function readPublishableProductionOddsCalculation(jobId, {
  env = process.env,
  rpc = productionCurrentOddsCalculationRpc,
  runtimeContext,
  resolveRuntime = resolveProductionOddsRuntimeContext,
  dependencies = {},
} = {}) {
  const context = runtimeContext || await resolveRuntime({ env });
  const target = context.runtime.tournamentId;
  const normalizedJobId = clean(jobId).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalizedJobId)) {
    throw operationError(
      "PRODUCTION_ODDS_CALCULATION_JOB_REQUIRED",
      "A completed Production Championship Odds calculation is required.",
      {},
      400,
    );
  }
  const readJobs = dependencies.readJobs || ((requestedJobId) =>
    readProductionOddsCalculationJobs(requestedJobId, {
      env,
      rpc,
      runtimeContext: context,
    }));
  const loadInputs = dependencies.loadInputs || ((tournamentId) =>
    loadProductionOddsCalculationInputs(tournamentId, {
      env,
      runtimeContext: context,
    }));
  const supersedeJob = dependencies.supersedeJob || ((requestedJobId) =>
    supersedeProductionOddsCalculationJob(requestedJobId, {
      env,
      rpc,
      runtimeContext: context,
    }));
  const retained = await readJobs(normalizedJobId);
  if (!retained?.payload?.ok) {
    throw operationError(
      clean(retained?.payload?.code || "PRODUCTION_ODDS_CALCULATION_STATE_UNAVAILABLE"),
      "Production Championship Odds calculation state is unavailable.",
    );
  }
  const job = retained.payload.jobs?.find((entry) =>
    clean(entry?.job_id).toLowerCase() === normalizedJobId);
  if (!job) {
    throw operationError(
      "PRODUCTION_ODDS_CALCULATION_JOB_NOT_FOUND",
      "The Production Championship Odds calculation was not found.",
      {},
      404,
    );
  }
  const isolation = assertProductionOddsStoredJobScope(job, env, context);
  const publicationStatus = clean(job.publication_status).toUpperCase();
  if (clean(job.status).toUpperCase() !== "SUCCEEDED" || !job.result_payload ||
      !["READY", "PUBLISHED"].includes(publicationStatus)) {
    throw operationError(
      "PRODUCTION_ODDS_CALCULATION_NOT_READY",
      "The Production Championship Odds calculation is not ready for publication.",
      { publicationStatus },
      409,
    );
  }
  const logicalFingerprint = scoringShadowPayloadHash(
    logicalOddsResult(job.result_payload),
  );
  if (logicalFingerprint !== clean(job.result_fingerprint).toLowerCase()) {
    throw operationError(
      "PRODUCTION_ODDS_CALCULATION_RESULT_INVALID",
      "Stored Production Championship Odds result verification failed.",
      {},
      409,
    );
  }
  if (publicationStatus === "PUBLISHED") {
    return {
      job,
      snapshot: job.result_payload,
      currentInputs: null,
      isolation,
      alreadyPublished: true,
      runtimeContext: context,
    };
  }
  const currentInputs = await loadInputs(target);
  const currentRevision = productionOddsInputRevision(currentInputs.configuration);
  const invocation = buildOddsCalculationInvocation({
    inputs: currentInputs,
    phase: job.phase,
    iterations: Number(job.total_iterations),
    requestedBy: job.requested_by,
    outputTimestamp: job.output_timestamp,
  });
  const expected = productionOddsCalculationRequestInput({
    invocation,
    configuration: currentInputs.configuration,
    env,
    runtimeContext: context,
  });
  const sourceRevision = job.source_revision || {};
  const current = expected.job_id === normalizedJobId &&
    clean(job.input_fingerprint).toLowerCase() === expected.input_fingerprint &&
    clean(sourceRevision.configuration_id) === currentRevision.configuration_id &&
    Number(sourceRevision.configuration_revision) === currentRevision.configuration_revision &&
    clean(sourceRevision.bundle_fingerprint).toLowerCase() === currentRevision.bundle_fingerprint &&
    clean(sourceRevision.settings_fingerprint).toLowerCase() === currentRevision.settings_fingerprint &&
    clean(sourceRevision.effective_settings_fingerprint).toLowerCase() ===
      currentRevision.effective_settings_fingerprint &&
    clean(sourceRevision.ratings_fingerprint).toLowerCase() === currentRevision.ratings_fingerprint &&
    clean(sourceRevision.pairing_fingerprint).toLowerCase() === currentRevision.pairing_fingerprint;
  if (!current) {
    await supersedeJob(normalizedJobId).catch(() => null);
    throw operationError(
      "PRODUCTION_ODDS_CALCULATION_STALE",
      "Canonical Production Championship Odds inputs advanced after this result was calculated.",
      {},
      409,
    );
  }
  return {
    job,
    snapshot: job.result_payload,
    currentInputs,
    isolation,
    alreadyPublished: false,
    runtimeContext: context,
  };
}

export async function certifyProductionOddsCalculation(jobId, {
  env = process.env,
  rpc = productionCurrentOddsCalculationRpc,
  runtimeContext,
  resolveRuntime = resolveProductionOddsRuntimeContext,
} = {}) {
  const context = runtimeContext || await resolveRuntime({ env });
  return certifyOddsCalculationReference({
    tournamentId: context.runtime.tournamentId,
    jobId,
    dependencies: {
      readJobs: async (_tournamentId, requestedJobId) => readProductionOddsCalculationJobs(
        requestedJobId,
        { env, rpc, runtimeContext: context },
      ),
    },
  });
}
