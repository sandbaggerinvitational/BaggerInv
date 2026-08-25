import {
  PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF,
} from "./completed-history-read-source.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";
import { productionCutoverReadSourceEnvironment } from "./production-cutover-read-source.js";

const clean = (value) => String(value ?? "").trim();
const sourceValue = (value) => {
  const source = clean(value || "google").toLowerCase();
  return ["google", "supabase"].includes(source) ? source : "invalid";
};

/**
 * Independent Preview delivery boundary for the player/statistics consumers.
 * Completed History and 2026 History remain separately gated prerequisites;
 * this gate never changes either underlying authority.
 */
export function secondaryHistoryReadEnvironment(env = process.env) {
  const deployment = clean(env.VERCEL_ENV).toLowerCase();
  const requested = sourceValue(env.SECONDARY_HISTORY_READ_SOURCE);
  const cutover = productionCutoverReadSourceEnvironment({
    env,
    variable: "SECONDARY_HISTORY_READ_SOURCE",
    configuredValue: env.SECONDARY_HISTORY_READ_SOURCE,
    requiredPhase: "READ_CUTOVER",
  });
  if (cutover.handled) {
    return {
      requested: cutover.requested,
      resolved: cutover.resolved,
      preview: false,
      productionBlocked: cutover.blocked,
      blocked: cutover.blocked,
      projectRef: cutover.activation.resources.projectRef,
      productionShadowCandidate: false,
      productionCutover: cutover,
      projectApproved: cutover.activation.projectRefApproved,
      credentialsConfigured: cutover.activation.serviceCredentialConfigured,
      fallbackUsed: false,
      reason: cutover.reason,
    };
  }
  const projectUrl = clean(env.SUPABASE_SCORING_MIRROR_URL);
  const candidate = productionShadowCandidateReadEnvironment(env);
  const projectApproved = candidate.eligible || projectUrl.includes(
    PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF
  );
  const credentialsConfigured = Boolean(
    projectUrl && clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY)
  );
  const preview = deployment === "preview";
  const productionBlocked = deployment === "production" && requested === "supabase";
  const resolved = preview && requested === "supabase" ? "supabase" : "google";
  const blocked = requested === "invalid" || (
    resolved === "supabase" && (!projectApproved || !credentialsConfigured)
  );

  return {
    requested,
    resolved,
    preview,
    productionBlocked,
    blocked,
    projectRef: candidate.eligible ? candidate.projectRef : projectApproved
      ? PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF
      : "",
    productionShadowCandidate: candidate.eligible,
    projectApproved,
    credentialsConfigured,
    reason: resolved === "supabase" && candidate.eligible
      ? "production-shadow-supabase-secondary-history"
      : requested === "invalid"
      ? "invalid-source"
      : productionBlocked
      ? "production-hard-block"
      : resolved === "google"
        ? "google-selected"
        : !projectApproved
          ? "preview-project-required"
          : !credentialsConfigured
            ? "credentials-missing"
            : "preview-supabase-secondary-history",
  };
}

/** Resolve the route branch only after enforcing invalid/misconfigured input. */
export function isSupabaseSecondaryHistory(env = process.env) {
  return requireSecondaryHistoryReadSource(env).resolved === "supabase";
}

export function requireSecondaryHistoryReadSource(env = process.env) {
  const state = secondaryHistoryReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Secondary History is unavailable (${state.reason}).`);
    error.code = "SECONDARY_HISTORY_SUPABASE_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}
