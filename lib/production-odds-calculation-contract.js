import {
  PRODUCTION_CUTOVER_PHASES,
  PRODUCTION_CANONICAL_ORIGIN,
  PRODUCTION_VERCEL_PROJECT_ID,
  productionCutoverActivationEnvironment,
  productionCutoverPhaseAtLeast,
} from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";
import { productionShadowCandidateEnvironment } from "./production-shadow-candidate.js";
import { productionOddsRehearsalFixtureEvidence } from "./production-odds-rehearsal-fixture.js";
import { canonicalJson, scoringShadowPayloadHash } from "./scoring-shadow.js";

export const PRODUCTION_ODDS_CALCULATION_RUNTIME_CONTRACT =
  "production-odds-calculation-runtime-v1";
export const PRODUCTION_ODDS_CALCULATION_JOB_IDENTITY_CONTRACT =
  "production-odds-calculation-job-identity-v2";
export const PRODUCTION_ODDS_CALCULATION_PHASE = "ODDS_WAR_ROOM";
export const PRODUCTION_ODDS_CALCULATION_WORKER = "ODDS_CALCULATION";
export const PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_CONTRACT =
  "production-step11-odds-service-authorization-v1";
export const PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_HEADER =
  "production-step11-odds-director-bridge-v1";
export const PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_PLAYER_ID = "CB01";
export const PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_ACTOR =
  "step11-odds-service-bridge:CB01";
export const PRODUCTION_ODDS_CALCULATION_MODES = Object.freeze({
  REHEARSAL: "STEP11_REHEARSAL",
  CUTOVER: "PRODUCTION_CUTOVER",
});

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));

function failure(code, reason, diagnostics = {}) {
  const error = new Error(`Production Odds calculation is unavailable (${reason}).`);
  error.code = code;
  error.status = 503;
  error.diagnostics = { reason, ...diagnostics };
  return error;
}

function cutoverMode(env) {
  const activation = productionCutoverActivationEnvironment(env);
  const requested = truthy(env.PRODUCTION_SUPABASE_ODDS_CALCULATION_ENABLED);
  const phaseReached = productionCutoverPhaseAtLeast(env, PRODUCTION_ODDS_CALCULATION_PHASE);
  const publicationStaysGoogle = clean(env.ODDS_PUBLICATION_AUTHORITY || "google").toLowerCase() === "google" &&
    !truthy(env.PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED);
  const workersRequested = truthy(env.PRODUCTION_SUPABASE_WORKERS_ENABLED);
  const exactProject = activation.resources?.vercelProjectId === PRODUCTION_VERCEL_PROJECT_ID;
  const allowed = requested && activation.allowed && phaseReached && workersRequested &&
    publicationStaysGoogle && exactProject;
  return {
    mode: PRODUCTION_ODDS_CALCULATION_MODES.CUTOVER,
    requested,
    allowed,
    reason: allowed ? "production-odds-cutover-ready"
      : !requested ? "production-odds-calculation-disabled"
      : !activation.allowed ? activation.reason
      : !phaseReached ? "odds-war-room-phase-required"
      : !workersRequested ? "production-workers-disabled"
      : !publicationStaysGoogle ? "google-publication-authority-required"
      : !exactProject ? "exact-vercel-project-required"
      : "production-odds-cutover-unavailable",
    deploymentCommit: activation.resources?.commitSha || "",
    candidateHostname: "",
    activation,
  };
}

function rehearsalMode(env) {
  const candidate = productionShadowCandidateEnvironment(env);
  const requested = truthy(env.PRODUCTION_STEP11_ODDS_REHEARSAL_ENABLED);
  const rehearsalSecretConfigured = clean(env.PRODUCTION_STEP11_ODDS_REHEARSAL_SECRET).length >= 32;
  const publicationStaysGoogle = clean(env.ODDS_PUBLICATION_AUTHORITY || "google").toLowerCase() === "google" &&
    !truthy(env.PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED);
  const exactProject = candidate.resources?.vercelProjectId === PRODUCTION_VERCEL_PROJECT_ID;
  const externalWritesDisabled = !truthy(env.PRODUCTION_STEP11_EXTERNAL_GOOGLE_WRITES_ENABLED);
  const allowed = requested && candidate.allowed && rehearsalSecretConfigured &&
    publicationStaysGoogle && exactProject && externalWritesDisabled;
  return {
    mode: PRODUCTION_ODDS_CALCULATION_MODES.REHEARSAL,
    requested,
    allowed,
    reason: allowed ? "production-step11-odds-rehearsal-ready"
      : !requested ? "production-step11-odds-rehearsal-disabled"
      : !candidate.allowed ? candidate.reason
      : !rehearsalSecretConfigured ? "production-step11-odds-rehearsal-secret-required"
      : !publicationStaysGoogle ? "google-publication-authority-required"
      : !exactProject ? "exact-vercel-project-required"
      : !externalWritesDisabled ? "external-google-writes-forbidden"
      : "production-step11-odds-rehearsal-unavailable",
    deploymentCommit: candidate.resources?.commitSha || "",
    candidateHostname: candidate.resources?.candidateHostname || "",
    rehearsalSecretConfigured,
    candidate,
  };
}

export function productionOddsCalculationEnvironment(env = process.env) {
  const rehearsal = rehearsalMode(env);
  const cutover = cutoverMode(env);
  if (rehearsal.requested) return rehearsal;
  if (cutover.requested) return cutover;
  return {
    mode: "",
    requested: false,
    allowed: false,
    reason: "production-odds-calculation-disabled",
    deploymentCommit: "",
    candidateHostname: "",
    rehearsal,
    cutover,
  };
}

export function assertProductionOddsCalculationEnvironment(env = process.env) {
  const state = productionOddsCalculationEnvironment(env);
  if (state.allowed) return state;
  throw failure("PRODUCTION_ODDS_CALCULATION_UNAVAILABLE", state.reason, state);
}

/**
 * Narrow server-to-server authorization used only to exercise the isolated
 * Step 11 Odds worker without borrowing a browser session. The secret request
 * token is verified by the route and is never sent to Supabase. This contract
 * independently keeps live/cutover execution, global workers, publication,
 * mirrors, and every external Google write disabled.
 */
export function productionStep11OddsServiceAuthorizationEnvironment(env = process.env) {
  const calculation = productionOddsCalculationEnvironment(env);
  const explicitlyEnabled = truthy(env.PRODUCTION_STEP11_ODDS_SERVICE_AUTH_BRIDGE_ENABLED);
  const rehearsalOnly = calculation.allowed &&
    calculation.mode === PRODUCTION_ODDS_CALCULATION_MODES.REHEARSAL &&
    clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const cutoverDisabled = !truthy(env.PRODUCTION_CUTOVER_ACTIVATION_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_ODDS_CALCULATION_ENABLED);
  const globalWorkersDisabled = !truthy(env.PRODUCTION_SUPABASE_WORKERS_ENABLED);
  const publicationAndMirrorDisabled =
    clean(env.ODDS_PUBLICATION_AUTHORITY || "google").toLowerCase() === "google" &&
    !truthy(env.PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED) &&
    !truthy(env.PRODUCTION_STEP11_EXTERNAL_GOOGLE_WRITES_ENABLED);
  const s3Fingerprint = clean(env.PRODUCTION_STEP11_S3_FINGERPRINT).toLowerCase();
  const s3FingerprintConfigured = /^[0-9a-f]{64}$/.test(s3Fingerprint);
  const allowed = explicitlyEnabled && rehearsalOnly && cutoverDisabled &&
    globalWorkersDisabled && publicationAndMirrorDisabled && s3FingerprintConfigured;
  return Object.freeze({
    allowed,
    requested: explicitlyEnabled,
    reason: allowed ? "production-step11-odds-service-authorization-ready"
      : !explicitlyEnabled ? "production-step11-odds-service-authorization-disabled"
      : !rehearsalOnly ? "production-step11-rehearsal-candidate-required"
      : !cutoverDisabled ? "production-cutover-forbidden"
      : !globalWorkersDisabled ? "global-production-workers-forbidden"
      : !publicationAndMirrorDisabled ? "production-publication-and-mirror-must-remain-disabled"
      : !s3FingerprintConfigured ? "production-step11-s3-fingerprint-required"
      : "production-step11-odds-service-authorization-unavailable",
    rehearsalOnly,
    cutoverDisabled,
    globalWorkersDisabled,
    publicationAndMirrorDisabled,
    s3FingerprintConfigured,
    s3Fingerprint: s3FingerprintConfigured ? s3Fingerprint : "",
    calculation,
  });
}

export function assertProductionStep11OddsServiceAuthorizationEnvironment(env = process.env) {
  const state = productionStep11OddsServiceAuthorizationEnvironment(env);
  if (state.allowed) return state;
  throw failure(
    "PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_UNAVAILABLE",
    state.reason,
    state,
  );
}

export function productionStep11OddsServiceAuthorizationInput({
  requestFingerprint,
  env = process.env,
} = {}) {
  const state = assertProductionStep11OddsServiceAuthorizationEnvironment(env);
  const fingerprint = clean(requestFingerprint).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    throw failure(
      "PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_FINGERPRINT_REQUIRED",
      "exact-request-fingerprint-required",
    );
  }
  return productionOddsCalculationScope(env, {
    contract_version: PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_CONTRACT,
    operation: "AUTHORIZE_PRODUCTION_STEP11_ODDS_SERVICE_BRIDGE",
    expected_director_player_id: PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_PLAYER_ID,
    required_role: "DIRECTOR",
    request_fingerprint: fingerprint,
    source_fingerprint: state.s3Fingerprint,
    request_token_verified: true,
    live_production_authorization: false,
    publication_created: false,
    mirror_created: false,
    external_google_writes: 0,
    service_authorization_enabled: state.allowed,
  });
}

function exactActivationRevision(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw failure(
      "PRODUCTION_STEP11_ODDS_ACTIVATION_REVISION_REQUIRED",
      "explicit-activation-revision-required",
    );
  }
  return value;
}

function exactRuntimeRevision(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw failure(
      "PRODUCTION_STEP11_ODDS_RUNTIME_REVISION_REQUIRED",
      "explicit-runtime-revision-required",
    );
  }
  return value;
}

function exactRuntimeEnabled(value) {
  if (typeof value !== "boolean") {
    throw failure(
      "PRODUCTION_STEP11_ODDS_RUNTIME_STATE_REQUIRED",
      "explicit-runtime-state-required",
    );
  }
  return value;
}

export function productionStep11OddsStageReleaseInput({
  expectedActivationRevision,
  requestFingerprint,
  env = process.env,
} = {}) {
  const authorization = productionStep11OddsServiceAuthorizationInput({
    requestFingerprint,
    env,
  });
  return {
    ...authorization,
    contract_version: "production-cutover-activation-v1",
    operation: "STAGE_STEP11_ODDS_REHEARSAL_RELEASE",
    actor_id: PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_ACTOR,
    vercel_project: "bagger-inv",
    canonical_domain: PRODUCTION_CANONICAL_ORIGIN,
    expected_activation_revision: exactActivationRevision(expectedActivationRevision),
  };
}

export function productionStep11OddsRuntimeConfigurationInput({
  enabled,
  expectedActivationRevision,
  expectedRuntimeRevision,
  expectedRuntimeEnabled,
  requestFingerprint,
  env = process.env,
} = {}) {
  const authorization = productionStep11OddsServiceAuthorizationInput({
    requestFingerprint,
    env,
  });
  return {
    ...authorization,
    operation: enabled === true
      ? "ENABLE_STEP11_ODDS_REHEARSAL_RUNTIME"
      : "DISABLE_STEP11_ODDS_REHEARSAL_RUNTIME",
    actor_id: PRODUCTION_STEP11_ODDS_SERVICE_AUTHORIZATION_ACTOR,
    enabled: enabled === true,
    expected_activation_revision: exactActivationRevision(expectedActivationRevision),
    expected_runtime_revision: exactRuntimeRevision(expectedRuntimeRevision),
    expected_runtime_enabled: exactRuntimeEnabled(expectedRuntimeEnabled),
    worker_name: PRODUCTION_ODDS_CALCULATION_WORKER,
  };
}

export function productionOddsCalculationScope(env = process.env, extra = {}) {
  const state = assertProductionOddsCalculationEnvironment(env);
  const capability = state.activation?.maintenanceDeploymentCapability;
  return {
    ...extra,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    deployment_commit: state.deploymentCommit,
    deployment_id: clean(env.VERCEL_DEPLOYMENT_ID),
    deployment_capability_contract: capability?.allowed
      ? capability.contract
      : "",
    deployment_capability_ceiling: capability?.allowed
      ? capability.ceiling
      : "",
    vercel_project_id: PRODUCTION_VERCEL_PROJECT_ID,
    canonical_domain: PRODUCTION_CANONICAL_ORIGIN,
    worker_name: PRODUCTION_ODDS_CALCULATION_WORKER,
    operation_mode: state.mode,
    cutover_phase: PRODUCTION_ODDS_CALCULATION_PHASE,
    ...(state.candidateHostname ? { candidate_hostname: state.candidateHostname } : {}),
  };
}

export function assertProductionOddsStoredJobScope(job = {}, env = process.env) {
  const scope = productionOddsCalculationScope(env);
  const revision = job?.source_revision || {};
  const storedHostname = clean(job?.production_candidate_hostname).toLowerCase();
  const expectedHostname = clean(scope.candidate_hostname).toLowerCase();
  const mode = clean(job?.production_operation_mode).toUpperCase();
  const publicationStatus = clean(job?.publication_status).toUpperCase();
  if (!job || typeof job !== "object" ||
      mode !== scope.operation_mode ||
      clean(job.production_deployment_commit).toLowerCase() !== scope.deployment_commit ||
      storedHostname !== expectedHostname ||
      clean(revision.production_job_identity_contract) !==
        PRODUCTION_ODDS_CALCULATION_JOB_IDENTITY_CONTRACT) {
    throw failure("PRODUCTION_ODDS_JOB_SCOPE_MISMATCH", "retained-job-scope-mismatch", {
      requestedMode: scope.operation_mode,
      retainedMode: mode,
      deploymentMatches: clean(job?.production_deployment_commit).toLowerCase() ===
        scope.deployment_commit,
      candidateHostnameMatches: storedHostname === expectedHostname,
    });
  }
  if (mode === PRODUCTION_ODDS_CALCULATION_MODES.REHEARSAL) {
    if (clean(revision.rehearsal_fixture_contract) !==
          "production-odds-step11-rehearsal-fixture-v1" ||
        !/^[0-9a-f]{64}$/.test(clean(revision.rehearsal_fixture_fingerprint).toLowerCase()) ||
        !/^STEP11_ODDS_[0-9a-f]{40}_[0-9a-f]{16}$/.test(clean(revision.rehearsal_namespace)) ||
        ["READY", "PUBLISHED"].includes(publicationStatus) ||
        (clean(job.status).toUpperCase() === "SUCCEEDED" &&
          publicationStatus !== "REHEARSAL_ONLY")) {
      throw failure(
        "PRODUCTION_ODDS_REHEARSAL_JOB_NOT_ISOLATED",
        "rehearsal-job-publication-boundary-invalid",
      );
    }
  } else if (storedHostname || revision.rehearsal_fixture_contract ||
      revision.rehearsal_fixture_fingerprint || revision.rehearsal_namespace) {
    throw failure(
      "PRODUCTION_ODDS_CUTOVER_JOB_FIXTURE_FORBIDDEN",
      "cutover-job-rehearsal-fixture-forbidden",
    );
  }
  return {
    operationMode: mode,
    deploymentCommit: scope.deployment_commit,
    candidateHostname: expectedHostname,
    publicationEligible: mode === PRODUCTION_ODDS_CALCULATION_MODES.CUTOVER &&
      publicationStatus === "READY",
    mirrorEligible: false,
  };
}

export function productionOddsInputRevision(configuration = {}) {
  const sourceRevision = {
    configuration_id: clean(configuration.id),
    configuration_revision: Number(configuration.configuration_revision),
    source_fingerprint: clean(configuration.source_fingerprint).toLowerCase(),
    bundle_fingerprint: clean(configuration.bundle_fingerprint).toLowerCase(),
    settings_fingerprint: clean(configuration.settings_fingerprint).toLowerCase(),
    effective_settings_fingerprint: clean(configuration.effective_settings_fingerprint).toLowerCase(),
    ratings_fingerprint: clean(configuration.ratings_fingerprint).toLowerCase(),
    pairing_fingerprint: clean(configuration.pairing_fingerprint).toLowerCase(),
  };
  const required = [
    sourceRevision.source_fingerprint,
    sourceRevision.bundle_fingerprint,
    sourceRevision.settings_fingerprint,
    sourceRevision.effective_settings_fingerprint,
    sourceRevision.ratings_fingerprint,
    sourceRevision.pairing_fingerprint,
  ];
  if (!sourceRevision.configuration_id || !Number.isInteger(sourceRevision.configuration_revision) ||
      sourceRevision.configuration_revision < 1 || required.some((value) => !/^[0-9a-f]{64}$/.test(value))) {
    throw failure("PRODUCTION_ODDS_INPUT_REVISION_REQUIRED", "current-production-input-revision-required");
  }
  return sourceRevision;
}

function invocationIdentity(input = {}, scope = {}, rehearsal = null) {
  return {
    productionJobIdentityContract: PRODUCTION_ODDS_CALCULATION_JOB_IDENTITY_CONTRACT,
    jobContractVersion: clean(input.jobContractVersion || "championship-odds-calculation-job-v1"),
    tournamentId: clean(input.tournament_id),
    phase: clean(input.phase),
    iterations: Number(input.total_iterations),
    inputFingerprint: clean(input.input_fingerprint).toLowerCase(),
    settingsFingerprint: clean(input.settings_fingerprint).toLowerCase(),
    engineVersion: clean(input.engine_version),
    publicationContractVersion: clean(input.publication_contract_version),
    checkpointContractVersion: clean(input.checkpoint_contract_version),
    deterministicSeed: clean(input.deterministic_seed),
    operationMode: clean(scope.operation_mode),
    deploymentCommit: clean(scope.deployment_commit).toLowerCase(),
    candidateHostname: clean(scope.candidate_hostname).toLowerCase(),
    rehearsalNamespace: clean(rehearsal?.namespace),
    rehearsalFixtureFingerprint: clean(rehearsal?.fingerprint).toLowerCase(),
  };
}

export function productionOddsCalculationRequestInput({ invocation, configuration, env = process.env } = {}) {
  const revision = productionOddsInputRevision(configuration);
  const scope = productionOddsCalculationScope(env);
  const fixture = invocation?.input_snapshot?.metadata?.productionRehearsalFixture;
  let rehearsal = null;
  if (scope.operation_mode === PRODUCTION_ODDS_CALCULATION_MODES.REHEARSAL) {
    rehearsal = productionOddsRehearsalFixtureEvidence(invocation.input_snapshot, scope);
  } else if (fixture) {
    throw failure(
      "PRODUCTION_ODDS_REHEARSAL_FIXTURE_FORBIDDEN",
      "rehearsal-fixture-forbidden-outside-step11",
    );
  }
  const sourceRevision = {
    ...revision,
    production_job_identity_contract: PRODUCTION_ODDS_CALCULATION_JOB_IDENTITY_CONTRACT,
    ...(rehearsal ? {
      rehearsal_fixture_contract: rehearsal.contract,
      rehearsal_fixture_fingerprint: rehearsal.fingerprint,
      rehearsal_namespace: rehearsal.namespace,
      canonical_pairing_fingerprint: rehearsal.canonicalPairingFingerprint,
      rehearsal_pairing_fingerprint: rehearsal.rehearsalPairingFingerprint,
    } : {}),
  };
  const normalized = {
    ...invocation,
    environment: "PRODUCTION",
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    source_revision: sourceRevision,
    input_configuration_id: revision.configuration_id,
    configuration_revision: revision.configuration_revision,
    settings_fingerprint: revision.settings_fingerprint,
    effective_settings_fingerprint: revision.effective_settings_fingerprint,
    input_bundle_fingerprint: revision.bundle_fingerprint,
  };
  const inputCanonical = canonicalJson(normalized.input_snapshot);
  const checkpointCanonical = canonicalJson(normalized.checkpoint_payload);
  const identity = invocationIdentity(normalized, scope, rehearsal);
  const invocationCanonical = canonicalJson(identity);
  const jobId = scoringShadowPayloadHash(identity);
  if (scoringShadowPayloadHash(normalized.input_snapshot) !== clean(normalized.input_fingerprint).toLowerCase() ||
      scoringShadowPayloadHash(normalized.checkpoint_payload) !== clean(normalized.checkpoint_hash).toLowerCase()) {
    throw failure("PRODUCTION_ODDS_DETERMINISTIC_IDENTITY_MISMATCH", "deterministic-job-identity-mismatch");
  }
  return {
    ...normalized,
    ...scope,
    job_id: jobId,
    invocation_fingerprint: jobId,
    invocation_canonical_json: invocationCanonical,
    input_snapshot_canonical_json: inputCanonical,
    checkpoint_canonical_json: checkpointCanonical,
  };
}

export function productionOddsCheckpointInput(input, env = process.env) {
  return productionOddsCalculationScope(env, {
    ...input,
    checkpoint_canonical_json: canonicalJson(input?.checkpoint_payload || {}),
  });
}

export function productionOddsResultInput(input, env = process.env) {
  const { publishedAt: _publishedAt, ...logicalResult } = input?.result_payload || {};
  return productionOddsCalculationScope(env, {
    ...input,
    result_fingerprint_payload: logicalResult,
    result_canonical_json: canonicalJson(logicalResult),
  });
}

/**
 * Exact-scope dependency adapter for the shared deterministic worker. The
 * transport is injected so interruption/resume behavior can be rehearsed
 * without network access or a Production publication surface.
 */
export function productionOddsCalculationDependencies(env = process.env, call) {
  if (typeof call !== "function") {
    throw failure("PRODUCTION_ODDS_CALCULATION_TRANSPORT_REQUIRED", "server-transport-required");
  }
  return {
    claimJob: async (jobId, { workerId = "Production Championship Odds worker" } = {}) => {
      const result = await call(
        "claim_production_odds_calculation_job",
        productionOddsCalculationScope(env, { job_id: clean(jobId), worker_id: clean(workerId) }),
      );
      if (result?.payload?.job) assertProductionOddsStoredJobScope(result.payload.job, env);
      return result;
    },
    writeCheckpoint: (input) => call(
      "checkpoint_production_odds_calculation_job",
      productionOddsCheckpointInput(input, env),
    ),
    completeJob: (input) => call(
      "complete_production_odds_calculation_job",
      productionOddsResultInput(input, env),
    ),
    failJob: (input) => call(
      "fail_production_odds_calculation_job",
      productionOddsCalculationScope(env, input),
    ),
  };
}

export function productionOddsCalculationPhaseOrder() {
  return PRODUCTION_CUTOVER_PHASES.indexOf(PRODUCTION_ODDS_CALCULATION_PHASE);
}
