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
import { canonicalJson, scoringShadowPayloadHash } from "./scoring-shadow.js";

export const PRODUCTION_ODDS_CALCULATION_RUNTIME_CONTRACT =
  "production-odds-calculation-runtime-v1";
export const PRODUCTION_ODDS_CALCULATION_PHASE = "ODDS_WAR_ROOM";
export const PRODUCTION_ODDS_CALCULATION_WORKER = "ODDS_CALCULATION";
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

export function productionOddsCalculationScope(env = process.env, extra = {}) {
  const state = assertProductionOddsCalculationEnvironment(env);
  return {
    ...extra,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    deployment_commit: state.deploymentCommit,
    vercel_project_id: PRODUCTION_VERCEL_PROJECT_ID,
    canonical_domain: PRODUCTION_CANONICAL_ORIGIN,
    worker_name: PRODUCTION_ODDS_CALCULATION_WORKER,
    operation_mode: state.mode,
    cutover_phase: PRODUCTION_ODDS_CALCULATION_PHASE,
    ...(state.candidateHostname ? { candidate_hostname: state.candidateHostname } : {}),
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

function invocationIdentity(input = {}) {
  return {
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
  };
}

export function productionOddsCalculationRequestInput({ invocation, configuration, env = process.env } = {}) {
  const revision = productionOddsInputRevision(configuration);
  const normalized = {
    ...invocation,
    environment: "PRODUCTION",
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    source_revision: revision,
    input_configuration_id: revision.configuration_id,
    configuration_revision: revision.configuration_revision,
    settings_fingerprint: revision.settings_fingerprint,
    effective_settings_fingerprint: revision.effective_settings_fingerprint,
    input_bundle_fingerprint: revision.bundle_fingerprint,
  };
  const inputCanonical = canonicalJson(normalized.input_snapshot);
  const checkpointCanonical = canonicalJson(normalized.checkpoint_payload);
  const identity = invocationIdentity(normalized);
  const invocationCanonical = canonicalJson(identity);
  const jobId = scoringShadowPayloadHash(identity);
  if (jobId !== clean(normalized.job_id).toLowerCase() ||
      jobId !== clean(normalized.invocation_fingerprint).toLowerCase() ||
      scoringShadowPayloadHash(normalized.input_snapshot) !== clean(normalized.input_fingerprint).toLowerCase() ||
      scoringShadowPayloadHash(normalized.checkpoint_payload) !== clean(normalized.checkpoint_hash).toLowerCase()) {
    throw failure("PRODUCTION_ODDS_DETERMINISTIC_IDENTITY_MISMATCH", "deterministic-job-identity-mismatch");
  }
  return productionOddsCalculationScope(env, {
    ...normalized,
    invocation_canonical_json: invocationCanonical,
    input_snapshot_canonical_json: inputCanonical,
    checkpoint_canonical_json: checkpointCanonical,
  });
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
    claimJob: (jobId, { workerId = "Production Championship Odds worker" } = {}) => call(
      "claim_production_odds_calculation_job",
      productionOddsCalculationScope(env, { job_id: clean(jobId), worker_id: clean(workerId) }),
    ),
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
