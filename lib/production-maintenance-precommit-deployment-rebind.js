import "server-only";

import {
  assertProductionCutoverActivation,
  PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_VERCEL_PROJECT_NAME,
} from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";

export const PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_CONTRACT =
  "production-maintenance-precommit-deployment-rebind-v1";
export const PRODUCTION_VERCEL_TEAM_ID =
  "team_kPw5zaib8uaQJALAwj4fWI6R";

const clean = (value) => String(value ?? "").trim();
const lower = (value) => clean(value).toLowerCase();
const upper = (value) => clean(value).toUpperCase();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const uuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(clean(value));
const deploymentId = (value) => /^dpl_[A-Za-z0-9]{8,64}$/.test(clean(value));
const fingerprint = (value) => /^[0-9a-f]{64}$/.test(lower(value));
const revision = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0;

function disabled(value) {
  return !truthy(value);
}

function error(code, message, diagnostics = {}, status = 503, cause) {
  const result = new Error(message, cause ? { cause } : undefined);
  result.code = code;
  result.status = status;
  result.diagnostics = Object.freeze({ ...diagnostics });
  return result;
}

function rpcHeaders(secret) {
  const headers = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  return headers;
}

export function productionMaintenancePrecommitDeploymentEnvironment(
  env = process.env,
) {
  let activation = null;
  try {
    activation = assertProductionCutoverActivation({
      env,
      requiredPhase: "SCORING_COMMIT",
    });
  } catch (cause) {
    return Object.freeze({
      allowed: false,
      reason: clean(cause?.diagnostics?.reason) ||
        "production-cutover-activation-required",
      activation: cause?.diagnostics || null,
    });
  }

  const exactPhase = activation.phase === "SCORING_COMMIT";
  const runtimeDeploymentId = clean(env.VERCEL_DEPLOYMENT_ID);
  const runtimeDeploymentHostname = lower(env.VERCEL_URL);
  const preparedEpoch = lower(env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH);
  const admissionGeneration = lower(
    env.PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION,
  );
  const productionRuntime = lower(env.VERCEL_ENV) === "production";
  const exactProject = clean(env.VERCEL_PROJECT_ID) ===
      PRODUCTION_VERCEL_PROJECT_ID &&
    clean(env.VERCEL_PROJECT_NAME) === PRODUCTION_VERCEL_PROJECT_NAME;
  const exactRelease = lower(env.VERCEL_GIT_COMMIT_SHA) ===
    lower(activation.resources?.commitSha);
  const exactRuntimeConfiguration =
    truthy(env.PRODUCTION_CUTOVER_ACTIVATION_ENABLED) &&
    truthy(env.PRODUCTION_FOUNDATION_ENABLED) &&
    truthy(env.PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED) &&
    truthy(env.PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED) &&
    disabled(env.PRODUCTION_SUPABASE_WORKERS_ENABLED) &&
    disabled(env.PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED) &&
    disabled(env.ROUND_SCORECARDS_ARCHIVE_ENABLED) &&
    lower(env.SCORING_AUTHORITY) === "supabase" &&
    lower(env.PARTICIPANT_IDENTITY_AUTHORITY) === "supabase";
  const allowed = productionRuntime && exactProject && exactRelease &&
    exactPhase && deploymentId(runtimeDeploymentId) &&
    /^[a-z0-9-]+\.vercel\.app$/.test(runtimeDeploymentHostname) &&
    uuid(preparedEpoch) && uuid(admissionGeneration) &&
    exactRuntimeConfiguration;
  const reason = allowed
    ? "production-maintenance-precommit-deployment-ready"
    : !productionRuntime
      ? "production-runtime-required"
      : !exactProject
        ? "exact-vercel-project-required"
        : !exactRelease
          ? "exact-release-sha-required"
          : !exactPhase
            ? "scoring-commit-phase-required"
            : !deploymentId(runtimeDeploymentId)
              ? "runtime-deployment-id-required"
              : !/^[a-z0-9-]+\.vercel\.app$/.test(runtimeDeploymentHostname)
                ? "runtime-deployment-hostname-required"
                : !uuid(preparedEpoch)
                  ? "prepared-authority-epoch-required"
                  : !uuid(admissionGeneration)
                    ? "admission-generation-required"
                    : !exactRuntimeConfiguration
                      ? "exact-paused-runtime-configuration-required"
                      : "production-maintenance-precommit-deployment-unavailable";

  return Object.freeze({
    allowed,
    reason,
    activation,
    runtimeDeploymentId: allowed ? runtimeDeploymentId : "",
    runtimeDeploymentHostname: allowed ? runtimeDeploymentHostname : "",
    releaseSha: allowed ? lower(env.VERCEL_GIT_COMMIT_SHA) : "",
    preparedEpoch: allowed ? preparedEpoch : "",
    admissionGeneration: allowed ? admissionGeneration : "",
    exactRuntimeConfiguration,
    vercelTeamId: PRODUCTION_VERCEL_TEAM_ID,
  });
}

function exactOperatorInput(value, runtime, actorId, now) {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const originalDeploymentId = clean(input.originalDeploymentId);
  const epochId = lower(input.epochId);
  const closureId = lower(input.closureId);
  const authorityGeneration = lower(input.expectedAuthorityGeneration);
  const admissionGeneration = lower(input.expectedAdmissionGeneration);
  const requestFingerprint = lower(input.requestFingerprint);
  const environmentFingerprint = lower(
    input.stagedEnvironmentDeltaFingerprintV2,
  );
  if (!deploymentId(originalDeploymentId) ||
      originalDeploymentId === runtime.runtimeDeploymentId ||
      !uuid(epochId) || epochId !== runtime.preparedEpoch ||
      !uuid(closureId) || !uuid(authorityGeneration) ||
      !uuid(admissionGeneration) ||
      admissionGeneration !== runtime.admissionGeneration ||
      !revision(input.expectedActivationRevision) ||
      !revision(input.expectedAdmissionRevision) ||
      !fingerprint(requestFingerprint) ||
      !fingerprint(environmentFingerprint) || !clean(actorId)) {
    throw error(
      "PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_INPUT_INVALID",
      "The maintenance precommit deployment rebind request is incomplete.",
      {},
      400,
    );
  }
  return {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    boundary_mode: "MAINTENANCE_WINDOW_V1",
    operation: "REBIND_PRODUCTION_MAINTENANCE_PRECOMMIT_DEPLOYMENT",
    original_deployment_id: originalDeploymentId,
    deployment_id: runtime.runtimeDeploymentId,
    deployment_commit: runtime.releaseSha,
    epoch_id: epochId,
    closure_id: closureId,
    expected_activation_revision: Number(input.expectedActivationRevision),
    expected_authority_generation: authorityGeneration,
    expected_admission_revision: Number(input.expectedAdmissionRevision),
    expected_admission_generation: admissionGeneration,
    staged_environment_delta_fingerprint_v2: environmentFingerprint,
    runtime_binding_contract:
      PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_CONTRACT,
    runtime_deployment_status: "READY",
    runtime_readiness_evidence: "LIVE_CANONICAL_PRODUCTION_ROUTE",
    runtime_deployment_target: "PRODUCTION",
    runtime_environment: "production",
    runtime_vercel_project: PRODUCTION_VERCEL_PROJECT_NAME,
    runtime_vercel_project_id: PRODUCTION_VERCEL_PROJECT_ID,
    runtime_vercel_team_id: PRODUCTION_VERCEL_TEAM_ID,
    runtime_canonical_hostname: "baggerinv.com",
    runtime_deployment_hostname: runtime.runtimeDeploymentHostname,
    runtime_cutover_phase: "SCORING_COMMIT",
    runtime_deployment_commit: runtime.releaseSha,
    runtime_scoring_authority: "SUPABASE",
    runtime_participant_identity_authority: "SUPABASE",
    runtime_expected_authority_epoch: runtime.preparedEpoch,
    runtime_expected_admission_generation: runtime.admissionGeneration,
    runtime_activation_enabled: true,
    runtime_foundation_enabled: true,
    runtime_google_ingress_lease_gate_enabled: true,
    runtime_supabase_scoring_ingress_enabled: true,
    runtime_workers_enabled: false,
    runtime_google_mirror_enabled: false,
    runtime_scorecard_archive_enabled: false,
    runtime_observed_at: new Date(now()).toISOString(),
    actor_id: clean(actorId).slice(0, 160),
    request_fingerprint: requestFingerprint,
  };
}

export async function rebindProductionMaintenancePrecommitDeployment({
  input,
  actorId,
} = {}, {
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
  timeoutMs = 12_000,
} = {}) {
  const runtime = productionMaintenancePrecommitDeploymentEnvironment(env);
  if (!runtime.allowed) {
    throw error(
      "PRODUCTION_MAINTENANCE_PRECOMMIT_RUNTIME_INVALID",
      "The replacement Production deployment is not an exact paused precommit runtime.",
      { reason: runtime.reason },
    );
  }
  const rpcInput = exactOperatorInput(input, runtime, actorId, now);
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (secret.length < 20) {
    throw error(
      "PRODUCTION_MAINTENANCE_PRECOMMIT_CONTROL_CREDENTIAL_REQUIRED",
      "The Production maintenance control credential is unavailable.",
    );
  }
  let response;
  try {
    response = await fetchImpl(
      `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/` +
        "rebind_production_maintenance_precommit_deployment",
      {
        method: "POST",
        headers: rpcHeaders(secret),
        body: JSON.stringify({ input: rpcInput }),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
  } catch (cause) {
    throw error(
      "PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_UNAVAILABLE",
      "The maintenance precommit deployment rebind could not be verified.",
      { transportResponseObserved: false },
      503,
      cause,
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw error(
      clean(payload?.code) ||
        "PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_REJECTED",
      "The maintenance precommit deployment rebind was rejected.",
      {
        status: response.status,
        providerCode: clean(payload?.code),
        transportResponseObserved: true,
      },
      [400, 401, 403, 409].includes(response.status)
        ? response.status
        : 503,
    );
  }
  return payload;
}
