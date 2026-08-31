import "server-only";

import {
  assertProductionCutoverActivation,
  PRODUCTION_VERCEL_PROJECT_ID,
} from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import { readProductionCurrentTournamentRuntime } from "./production-current-tournament-runtime.js";
import {
  PRODUCTION_CANONICAL_HOSTNAME,
  PRODUCTION_VERCEL_PROJECT_NAME,
} from "./production-shadow-candidate.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";

const clean = (value) => String(value ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const RPC_PHASE = Object.freeze({
  read_production_scoring_authority: "CURRENT_READS",
  read_production_scoring_participant_context: "CURRENT_READS",
  submit_production_hole_score: "SCORING_COMMIT",
  finalize_production_match: "SCORING_COMMIT",
  reopen_production_match: "SCORING_COMMIT",
  mutate_production_match_control: "SCORING_COMMIT",
  claim_production_google_outbox: "WORKERS",
  claim_production_google_outbox_event: "WORKERS",
  complete_production_google_outbox: "WORKERS",
  fail_production_google_outbox: "WORKERS",
  inspect_production_scoring_workers: "WORKERS",
  claim_production_scorecard_archive_job: "WORKERS",
  complete_production_scorecard_archive_job: "WORKERS",
  fail_production_scorecard_archive_job: "WORKERS",
  inspect_production_scorecard_archive_state: "WORKERS",
  claim_production_future_match_google_compatibility_v1: "WORKERS",
  complete_production_future_match_google_compatibility_v1: "WORKERS",
  fail_production_future_match_google_compatibility_v1: "WORKERS",
  resolve_production_future_match_google_compatibility_v2: "WORKERS",
  claim_production_future_match_google_compatibility_v2: "WORKERS",
  complete_production_future_match_google_compatibility_v2: "WORKERS",
  fail_production_future_match_google_compatibility_v2: "WORKERS",
  request_competition_derived_recalculation: "WORKERS",
  claim_competition_derived_jobs: "WORKERS",
  write_competition_derived_snapshot: "WORKERS",
  mark_competition_derived_job_failed: "WORKERS",
  claim_intelligence_derived_bundle: "WORKERS",
  write_intelligence_derived_bundle: "WORKERS",
  dispatch_production_annual_odds_v1: "ODDS_WAR_ROOM",
  configure_production_net_skins_v1: "OBSERVATION",
  enqueue_production_net_skins_v1_recalculation: "OBSERVATION",
  claim_production_net_skins_v1_recalculation: "OBSERVATION",
  complete_production_net_skins_v1_recalculation: "OBSERVATION",
  fail_production_net_skins_v1_recalculation: "OBSERVATION",
  configure_production_calcutta_v1: "OBSERVATION",
  replace_production_calcutta_v1_auction_facts: "OBSERVATION",
  publish_production_calcutta_v1: "OBSERVATION",
  unpublish_production_calcutta_v1: "OBSERVATION",
  enqueue_production_calcutta_v1_recalculation: "OBSERVATION",
  claim_production_calcutta_v1_recalculation: "OBSERVATION",
  complete_production_calcutta_v1_recalculation: "OBSERVATION",
  fail_production_calcutta_v1_recalculation: "OBSERVATION",
  inspect_production_calcutta_v1: "OBSERVATION",
  resolve_production_calcutta_postcommit_match_v1: "OBSERVATION",
});

const ANNUAL_DISPATCH_RPC = "dispatch_production_annual_scoring_v1";
const ANNUAL_DISPATCH_CONTRACT = "production-annual-scoring-dispatch-v1";
const PLATFORM_CERTIFICATION_RPC =
  "read_production_scoring_dispatch_certification_v1";
const PLATFORM_CERTIFICATION_CONTRACT =
  "production-annual-scoring-platform-certification-v1";
const ANNUAL_GOOGLE_DESTINATION_RPC =
  "read_production_annual_google_destination_v1";
const ANNUAL_GOOGLE_DESTINATION_CONTRACT =
  "production-annual-google-destination-v1";
const PREACTIVATION_RPC = new Set([
  "claim_production_future_match_google_compatibility_v1",
  "complete_production_future_match_google_compatibility_v1",
  "fail_production_future_match_google_compatibility_v1",
  "resolve_production_future_match_google_compatibility_v2",
  "claim_production_future_match_google_compatibility_v2",
  "complete_production_future_match_google_compatibility_v2",
  "fail_production_future_match_google_compatibility_v2",
]);
const SCORING_DISPATCH_CONTEXT = Symbol("production-scoring-dispatch-context");

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

function boundedInput(input, activation, env) {
  const epochId = clean(env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(epochId)) {
    throw operationError(
      "PRODUCTION_SCORING_AUTHORITY_EPOCH_REQUIRED",
      "The exact Production scoring authority epoch is required.",
    );
  }
  return {
    ...(input || {}),
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    deployment_commit: activation.resources.commitSha,
    deployment_id: clean(env.VERCEL_DEPLOYMENT_ID),
    deployment_capability_contract:
      activation.maintenanceDeploymentCapability?.allowed
        ? activation.maintenanceDeploymentCapability.contract
        : "",
    deployment_capability_ceiling:
      activation.maintenanceDeploymentCapability?.allowed
        ? activation.maintenanceDeploymentCapability.ceiling
        : "",
    expected_epoch_id: epochId,
  };
}

function annualBoundedInput(input, activation, env, context, operationName) {
  const { runtime, googleDestination } = context;
  const caller = { ...(input || {}) };
  delete caller.target_tournament_id;
  delete caller.current_tournament_id;
  delete caller.expected_current_tournament_id;
  delete caller.expected_pointer_revision;
  delete caller.expected_runtime_generation_id;
  delete caller.expected_annual_authority_generation_id;
  delete caller.expected_annual_admission_generation_id;
  delete caller.expected_google_writer_generation_id;
  delete caller.annual_destination_workbook_id;
  delete caller.expected_google_target_contract_fingerprint;
  delete caller.annual_scoring_dispatch_contract;
  delete caller.annual_scoring_operation;
  const authorization = caller.authorization && typeof caller.authorization === "object"
    ? { ...caller.authorization, tournament_id: runtime.tournamentId }
    : caller.authorization;
  return {
    ...boundedInput({ ...caller, ...(authorization ? { authorization } : {}) }, activation, env),
    annual_scoring_dispatch_contract: ANNUAL_DISPATCH_CONTRACT,
    annual_scoring_operation: operationName,
    expected_current_tournament_id: runtime.tournamentId,
    expected_pointer_revision: runtime.pointerRevision,
    expected_runtime_generation_id: runtime.runtimeGenerationId,
    expected_annual_authority_generation_id: runtime.authorityGenerationId,
    expected_annual_admission_generation_id: runtime.admissionGenerationId,
    expected_google_writer_generation_id:
      googleDestination.writerGenerationId,
    annual_destination_workbook_id:
      googleDestination.destinationWorkbookId,
    expected_google_target_contract_fingerprint:
      googleDestination.targetContractFingerprint,
  };
}

function validDispatchContext(value, requiredPhase, env) {
  const annual = value?.runtime?.tournamentId !== PRODUCTION_TOURNAMENT_ID;
  return Boolean(value?.[SCORING_DISPATCH_CONTEXT]) &&
    value.requiredPhase === requiredPhase &&
    value.certification?.contractVersion === PLATFORM_CERTIFICATION_CONTRACT &&
    value.certification?.platformTournamentId === PRODUCTION_TOURNAMENT_ID &&
    (!annual || (
      value.googleDestination?.contractVersion ===
        ANNUAL_GOOGLE_DESTINATION_CONTRACT &&
      value.googleDestination?.tournamentId === value.runtime?.tournamentId
    )) &&
    value.deploymentId === clean(env.VERCEL_DEPLOYMENT_ID) &&
    value.deploymentCommit === clean(env.VERCEL_GIT_COMMIT_SHA).toLowerCase();
}

function normalizeAnnualGoogleDestination(payload, runtime) {
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
  const implementationFingerprint = clean(
    value?.implementationFingerprint || value?.implementation_fingerprint,
  ).toLowerCase();
  if (value?.ok !== true ||
      contractVersion !== ANNUAL_GOOGLE_DESTINATION_CONTRACT ||
      tournamentId !== runtime.tournamentId ||
      !UUID.test(writerGenerationId) ||
      !destinationWorkbookId ||
      !/^[0-9a-f]{64}$/.test(targetContractFingerprint) ||
      !/^[0-9a-f]{64}$/.test(implementationFingerprint)) {
    throw operationError(
      "PRODUCTION_ANNUAL_GOOGLE_DESTINATION_INVALID",
      "The current annual Google destination certification is unavailable.",
    );
  }
  return Object.freeze({
    contractVersion,
    tournamentId,
    writerGenerationId,
    destinationWorkbookId,
    targetContractFingerprint,
    implementationFingerprint,
  });
}

async function readAnnualGoogleDestination(activation, runtime, {
  env,
  fetchImpl,
  timeoutMs,
}) {
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw operationError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "The Production server credential is unavailable.",
    );
  }
  const input = {
    ...boundedInput({}, activation, env),
    expected_current_tournament_id: runtime.tournamentId,
    expected_pointer_revision: runtime.pointerRevision,
    expected_runtime_generation_id: runtime.runtimeGenerationId,
    expected_annual_authority_generation_id: runtime.authorityGenerationId,
    expected_annual_admission_generation_id: runtime.admissionGenerationId,
  };
  recordDataAuthorityTransport("supabase", {
    adapter: "production-scoring-operations",
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
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw operationError(
      certificationProviderCode(payload),
      "The current annual Google destination certification is unavailable.",
      { status: response.status },
      response.status,
    );
  }
  return normalizeAnnualGoogleDestination(payload, runtime);
}

function certificationProviderCode(payload) {
  const code = clean(payload?.code || payload?.message).toUpperCase();
  return /^PRODUCTION_ANNUAL_SCORING_[A-Z0-9_]{3,120}$/.test(code)
    ? code
    : "PRODUCTION_ANNUAL_SCORING_CERTIFICATION_UNAVAILABLE";
}

function normalizePlatformCertification(payload) {
  const value = payload?.data || payload?.result || payload;
  const contractVersion = clean(
    value?.contractVersion || value?.contract_version,
  );
  const platformTournamentId = clean(
    value?.platformTournamentId || value?.platform_tournament_id,
  );
  const resourceFingerprint = clean(
    value?.resourceFingerprint || value?.resource_fingerprint,
  ).toLowerCase();
  const certificationFingerprint = clean(
    value?.certificationFingerprint || value?.certification_fingerprint,
  ).toLowerCase();
  if (value?.ok !== true || contractVersion !== PLATFORM_CERTIFICATION_CONTRACT ||
      platformTournamentId !== PRODUCTION_TOURNAMENT_ID ||
      !/^[0-9a-f]{64}$/.test(resourceFingerprint) ||
      !/^[0-9a-f]{64}$/.test(certificationFingerprint)) {
    throw operationError(
      "PRODUCTION_ANNUAL_SCORING_CERTIFICATION_INVALID",
      "The Production annual scoring platform certification is unavailable.",
    );
  }
  return Object.freeze({
    contractVersion,
    platformTournamentId,
    resourceFingerprint,
    certificationFingerprint,
    platformAuthorityGenerationId: clean(
      value.platformAuthorityGenerationId ||
        value.platform_authority_generation_id,
    ).toLowerCase(),
    platformAdmissionGenerationId: clean(
      value.platformAdmissionGenerationId ||
        value.platform_admission_generation_id,
    ).toLowerCase(),
  });
}

async function readPlatformCertification(activation, {
  env,
  fetchImpl,
  timeoutMs,
}) {
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw operationError(
      "PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED",
      "The Production server credential is unavailable.",
    );
  }
  const input = boundedInput({}, activation, env);
  recordDataAuthorityTransport("supabase", {
    adapter: "production-scoring-operations",
    source: PLATFORM_CERTIFICATION_RPC,
  });
  const response = await fetchImpl(
    `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${PLATFORM_CERTIFICATION_RPC}`,
    {
      method: "POST",
      headers: rpcHeaders(secret),
      body: JSON.stringify({ input }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw operationError(
      certificationProviderCode(payload),
      "The Production annual scoring platform certification is unavailable.",
      { status: response.status },
      response.status,
    );
  }
  return normalizePlatformCertification(payload);
}

/**
 * Resolve and brand one current-pointer snapshot for a bounded group of
 * server-side scoring calls (for example one worker drain). Database calls
 * still compare every generation token, so a later pointer move aborts safely.
 */
export async function resolveProductionScoringDispatchContext({
  requiredPhase,
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 10_000,
  readCurrentTournamentRuntime = readProductionCurrentTournamentRuntime,
  readScoringPlatformCertification = readPlatformCertification,
  readAnnualScoringGoogleDestination = readAnnualGoogleDestination,
} = {}) {
  if (!Object.values(RPC_PHASE).includes(requiredPhase)) {
    throw operationError(
      "PRODUCTION_SCORING_DISPATCH_PHASE_INVALID",
      "The Production scoring dispatch phase is not allowlisted.",
      { requiredPhase: clean(requiredPhase) },
      403,
    );
  }
  const activation = assertProductionCutoverActivation({ env, requiredPhase });
  const [certification, runtime] = await Promise.all([
    readScoringPlatformCertification(activation, {
      env,
      fetchImpl,
      timeoutMs,
    }),
    readCurrentTournamentRuntime({}, {
      env,
      getActivation: () => activation,
      rpcOptions: { fetchImpl, timeoutMs },
    }),
  ]);
  const googleDestination = runtime.tournamentId === PRODUCTION_TOURNAMENT_ID
    ? null
    : await readAnnualScoringGoogleDestination(activation, runtime, {
        env,
        fetchImpl,
        timeoutMs,
      });
  return Object.freeze({
    [SCORING_DISPATCH_CONTEXT]: true,
    requiredPhase,
    activation,
    runtime,
    certification,
    googleDestination,
    deploymentId: clean(env.VERCEL_DEPLOYMENT_ID),
    deploymentCommit: clean(env.VERCEL_GIT_COMMIT_SHA).toLowerCase(),
  });
}

/**
 * Project exact Google credential resources from a module-branded dispatch
 * context. A caller-supplied tournament or a context from another release or
 * phase is never accepted as Google authority.
 */
export function productionScoringDispatchGoogleResources(
  scoringDispatchContext,
  { requiredPhase = "WORKERS", env = process.env } = {},
) {
  if (!validDispatchContext(scoringDispatchContext, requiredPhase, env) ||
      requiredPhase !== "WORKERS" ||
      scoringDispatchContext.runtime?.lifecycle !== "ACTIVE" ||
      !/^\d{4}$/.test(clean(scoringDispatchContext.runtime?.tournamentId)) ||
      Number(scoringDispatchContext.runtime?.tournamentId) !==
        Number(scoringDispatchContext.runtime?.tournamentYear)) {
    throw operationError(
      "PRODUCTION_SCORING_DISPATCH_CONTEXT_INVALID",
      "The Production scoring worker dispatch context is invalid.",
      {},
      403,
    );
  }
  return Object.freeze({
    environment: "PRODUCTION",
    supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    supabaseProjectUrl: PRODUCTION_SUPABASE_URL,
    googleWorkbookId: scoringDispatchContext.googleDestination
      ?.destinationWorkbookId || PRODUCTION_GOOGLE_WORKBOOK_ID,
    platformGoogleWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournamentId: scoringDispatchContext.runtime.tournamentId,
    tournamentYear: scoringDispatchContext.runtime.tournamentYear,
    platformTournamentId:
      scoringDispatchContext.certification.platformTournamentId,
    resourceFingerprint:
      scoringDispatchContext.certification.resourceFingerprint,
    certificationFingerprint:
      scoringDispatchContext.certification.certificationFingerprint,
    writerGenerationId:
      scoringDispatchContext.googleDestination?.writerGenerationId || "",
    googleTargetContractFingerprint:
      scoringDispatchContext.googleDestination
        ?.targetContractFingerprint || "",
    googleWriterImplementationFingerprint:
      scoringDispatchContext.googleDestination
        ?.implementationFingerprint || "",
    deploymentId: scoringDispatchContext.deploymentId,
    deploymentCommit: scoringDispatchContext.deploymentCommit,
    vercelProjectId: PRODUCTION_VERCEL_PROJECT_ID,
    vercelProjectName: PRODUCTION_VERCEL_PROJECT_NAME,
    canonicalHostname: PRODUCTION_CANONICAL_HOSTNAME,
  });
}

/**
 * Calls only the reviewed Production scoring/worker RPC allowlist. The caller
 * cannot supply or override the Production resource tuple or authority epoch.
 */
export async function productionScoringOperationsRpc(functionName, input = {}, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 12_000,
  scoringDispatchContext,
  readCurrentTournamentRuntime,
  readScoringPlatformCertification,
  readAnnualScoringGoogleDestination,
} = {}) {
  const operationName = clean(functionName);
  const requiredPhase = RPC_PHASE[operationName];
  if (!requiredPhase) {
    throw operationError("PRODUCTION_SCORING_RPC_FORBIDDEN", "The Production scoring RPC is not allowlisted.", {
      functionName: clean(functionName),
    }, 403);
  }
  // Compatibility provisioning targets an inactive tournament and owns a
  // separate certified generation. It deliberately remains outside current
  // scoring dispatch.
  const preactivation = PREACTIVATION_RPC.has(operationName);
  const context = preactivation
    ? null
    : validDispatchContext(scoringDispatchContext, requiredPhase, env)
      ? scoringDispatchContext
      : await resolveProductionScoringDispatchContext({
          requiredPhase,
          env,
          fetchImpl,
          timeoutMs,
          ...(readCurrentTournamentRuntime ? { readCurrentTournamentRuntime } : {}),
          ...(readScoringPlatformCertification
            ? { readScoringPlatformCertification }
            : {}),
          ...(readAnnualScoringGoogleDestination
            ? { readAnnualScoringGoogleDestination }
            : {}),
        });
  const activation = context?.activation ||
    assertProductionCutoverActivation({ env, requiredPhase });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw operationError("PRODUCTION_SUPABASE_SERVICE_CREDENTIAL_REQUIRED", "The Production server credential is unavailable.");
  }
  const annual = !preactivation &&
    context.runtime.tournamentId !== PRODUCTION_TOURNAMENT_ID;
  const dispatchedFunction = annual ? ANNUAL_DISPATCH_RPC : operationName;
  const body = annual
    ? annualBoundedInput(input, activation, env, context, operationName)
    : boundedInput(input, activation, env);
  const startedAt = Date.now();
  recordDataAuthorityTransport("supabase", {
    adapter: "production-scoring-operations",
    source: dispatchedFunction,
  });
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${dispatchedFunction}`, {
    method: "POST",
    headers: rpcHeaders(secret),
    body: JSON.stringify({ input: body }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw operationError(
      "PRODUCTION_SCORING_RPC_FAILED",
      `Production scoring RPC failed (${response.status}).`,
      { functionName: dispatchedFunction, requestedOperation: operationName,
        status: response.status, code: clean(payload?.code || payload?.message) },
      response.status,
    );
  }
  return { ok: true, payload, durationMs: Date.now() - startedAt };
}

export function productionScoringOperationEnvironment(env = process.env) {
  const production = clean(env.VERCEL_ENV).toLowerCase() === "production";
  const scoringRequested = clean(env.SCORING_AUTHORITY || "google").toLowerCase() === "supabase";
  const activationRequested = /^(?:1|true|yes|on|enabled)$/i.test(clean(env.PRODUCTION_CUTOVER_ACTIVATION_ENABLED));
  const workersRequested = /^(?:1|true|yes|on|enabled)$/i.test(clean(env.PRODUCTION_SUPABASE_WORKERS_ENABLED));
  return {
    production,
    requested: production && (scoringRequested || activationRequested || workersRequested),
    scoringRequested,
    activationRequested,
    workersRequested,
  };
}
