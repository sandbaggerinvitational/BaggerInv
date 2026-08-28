import {
  productionCutoverActivationEnvironment,
  productionCutoverPhaseAtLeast,
} from "./production-cutover-activation-contract.js";
import {
  exactProductionSupabaseUrl,
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";
import {
  adaptProductionShadowCandidatePayload,
  productionShadowCandidateRpcTranslation,
} from "./production-shadow-read-adapters.js";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const falsey = (value) => /^(?:0|false|no|off|disabled)$/i.test(clean(value));

const READ_CUTOVER_RPCS = new Set([
  "read_preview_completed_history",
  "read_current_guide_projection",
  "read_preview_draft_view",
  "read_preview_secondary_history_players",
  "read_published_odds_view",
]);
const CURRENT_READ_RPCS = new Set([
  "read_tournament_live_view",
  "read_tournament_secondary_view",
  "read_leaderboards_core_view",
  "read_preview_2026_historical_view",
  "read_participant_home_view",
  "read_my_match_view",
  "read_game_center_view",
  "read_match_authorization_matrix",
  "read_net_skins_input_view",
  "read_net_skins_result_view",
  "read_calcutta_configuration_view",
  "read_participant_identity_context",
  "read_competition_derived_state",
  "read_preview_scoring_authority",
  "read_preview_scoring_participant_context",
]);
const ODDS_WAR_ROOM_RPCS = new Set([
  "read_championship_odds_inputs",
]);

export const PRODUCTION_CUTOVER_READ_RPCS = Object.freeze([
  ...READ_CUTOVER_RPCS,
  ...CURRENT_READ_RPCS,
  ...ODDS_WAR_ROOM_RPCS,
].sort());
const PRODUCTION_CUTOVER_READ_RPC_SET = new Set(PRODUCTION_CUTOVER_READ_RPCS);

function requiredPhase(functionName, body = {}) {
  const name = clean(functionName);
  if (name === "read_tournament_live_view" &&
      clean(body?.production_cutover_surface).toUpperCase() === "GUIDE_COURSE_CONTEXT") {
    return "READ_CUTOVER";
  }
  if (READ_CUTOVER_RPCS.has(name)) return "READ_CUTOVER";
  if (CURRENT_READ_RPCS.has(name)) return "CURRENT_READS";
  if (ODDS_WAR_ROOM_RPCS.has(name)) return "ODDS_WAR_ROOM";
  return "";
}

function readScope(env, extra = {}) {
  const activation = productionCutoverActivationEnvironment(env);
  const capability = activation.maintenanceDeploymentCapability;
  return {
    ...extra,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    deployment_commit: clean(env.VERCEL_GIT_COMMIT_SHA).toLowerCase(),
    deployment_id: clean(env.VERCEL_DEPLOYMENT_ID),
    cutover_phase: capability?.allowed
      ? capability.ceiling
      : clean(env.PRODUCTION_CUTOVER_PHASE).toUpperCase(),
    deployment_capability_contract: capability?.allowed
      ? capability.contract
      : "",
    deployment_capability_ceiling: capability?.allowed
      ? capability.ceiling
      : "",
    read_contract: "ACTIVE_CUTOVER",
  };
}

/** Translate only the application read RPCs certified for the active cutover. */
export function productionCutoverReadRpcTranslation(functionName, body = {}, env = process.env) {
  const name = clean(functionName);
  if (!PRODUCTION_CUTOVER_READ_RPC_SET.has(name)) return null;
  const phase = requiredPhase(name, body);

  if (name === "read_preview_scoring_authority") {
    return {
      functionName: "read_production_cutover_scoring_authority",
      body: { input: readScope(env, body?.input || {}) },
      requiredPhase: phase,
      adapter: "ACTIVE_CUTOVER",
    };
  }
  if (name === "read_preview_scoring_participant_context") {
    return {
      functionName: "read_production_cutover_scoring_participant_context",
      body: { input: readScope(env, body?.input || {}) },
      requiredPhase: phase,
      adapter: "ACTIVE_CUTOVER",
    };
  }
  if (name === "read_tournament_secondary_view") {
    const moduleName = clean(body?.target_module || body?.module).toLowerCase();
    return {
      functionName: "read_production_cutover_current_view",
      body: { input: readScope(env, {
        surface: moduleName === "calcutta" ? "CALCUTTA_CONFIGURATION" : "INVALID",
      }) },
      requiredPhase: phase,
      adapter: "ACTIVE_CUTOVER",
    };
  }

  const candidate = productionShadowCandidateRpcTranslation(name, body);
  if (!candidate) return null;
  const resolvedFunction = candidate.functionName === "read_production_candidate_current_view"
    ? "read_production_cutover_current_view"
    : candidate.functionName === "read_production_candidate_completed_history"
      ? "read_production_cutover_completed_history"
      : candidate.functionName;
  const activeSurface = name === "read_tournament_live_view" &&
    clean(body?.production_cutover_surface).toUpperCase() === "GUIDE_COURSE_CONTEXT"
    ? { ...(candidate.body?.input || {}), surface: "GUIDE_COURSE_CONTEXT" }
    : candidate.body?.input || {};
  return {
    ...candidate,
    functionName: resolvedFunction,
    body: {
      ...candidate.body,
      input: readScope(env, activeSurface),
    },
    requiredPhase: phase,
    adapter: candidate.adapter || "ACTIVE_CUTOVER",
  };
}

export function productionCutoverReadTransportEnvironment(
  env = process.env,
  functionName = "",
  body = {},
) {
  const activation = productionCutoverActivationEnvironment(env);
  const production = clean(env.VERCEL_ENV).toLowerCase() === "production";
  const activationToken = clean(env.PRODUCTION_CUTOVER_ACTIVATION_ENABLED);
  const malformedActivation = Boolean(activationToken) &&
    !truthy(activationToken) && !falsey(activationToken);
  const requested = production && (activation.requested || malformedActivation) &&
    PRODUCTION_CUTOVER_READ_RPC_SET.has(clean(functionName));
  const phase = requiredPhase(functionName, body);
  const publicReadsEnabled = truthy(env.PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED);
  const phaseReached = Boolean(phase) && productionCutoverPhaseAtLeast(env, phase);
  const exactUrl = exactProductionSupabaseUrl(env.SUPABASE_SCORING_MIRROR_URL);
  const productionSecret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  const exactSecret = productionSecret.length >= 20 &&
    clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY) === productionSecret;
  const allowed = requested && !malformedActivation && activation.allowed && publicReadsEnabled && phaseReached &&
    exactUrl && exactSecret;
  return Object.freeze({
    contract: "production-cutover-read-transport-v1",
    requested,
    allowed,
    reason: allowed ? "production-cutover-read-transport-ready"
      : !requested ? "production-cutover-read-transport-not-requested"
      : malformedActivation ? "invalid-production-cutover-activation-token"
      : !activation.allowed ? activation.reason
      : !publicReadsEnabled ? "production-public-supabase-reads-required"
      : !phaseReached ? "production-read-cutover-phase-not-reached"
      : !exactUrl ? "exact-production-read-url-required"
      : !exactSecret ? "exact-production-read-secret-required"
      : "production-cutover-read-transport-unavailable",
    functionName: clean(functionName),
    requiredPhase: phase,
    publicReadsEnabled,
    phaseReached,
    exactUrl,
    exactSecret,
    malformedActivation,
    activation,
  });
}

function markActive(payload, state) {
  if (!payload || typeof payload !== "object") return payload;
  return {
    ...payload,
    authoritative: true,
    shadow_only: false,
    google_foreground_requests: 0,
    fallback_used: false,
    production_cutover: {
      contract_version: state.activation.contractVersion,
      phase: state.activation.phase,
      required_phase: state.requiredPhase,
      deployment_commit: state.activation.resources.commitSha,
      project_ref: state.activation.resources.projectRef,
      workbook_id: state.activation.resources.workbookId,
    },
  };
}

export function adaptProductionCutoverReadPayload(payload, translation, state) {
  return markActive(adaptProductionShadowCandidatePayload(payload, translation), state);
}
