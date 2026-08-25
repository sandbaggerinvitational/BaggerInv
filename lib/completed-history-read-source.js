import { isCompletedHistoryYear } from "./completed-history-contract.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";
import { productionCutoverReadSourceEnvironment } from "./production-cutover-read-source.js";

const clean = (value) => String(value ?? "").trim();

export const PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF = "idgigvjjqkfbqjeredpb";

function normalizedSource(value) {
  const source = clean(value || "google").toLowerCase();
  return ["google", "supabase"].includes(source) ? source : "invalid";
}

function approvedProject(env) {
  const value = clean(env.SUPABASE_SCORING_MIRROR_URL);
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === `${PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF}.supabase.co` &&
      !url.username && !url.password && !url.port &&
      (url.pathname === "" || url.pathname === "/") &&
      !url.search && !url.hash;
  } catch {
    return false;
  }
}

/**
 * Resolve the completed-history delivery boundary. A Production request for
 * Supabase is deliberately hard-blocked back to the approved Google source.
 * In Preview, an explicitly selected but incomplete Supabase configuration is
 * marked blocked so routes fail closed instead of silently reading Google.
 */
export function completedHistoryReadEnvironment(env = process.env) {
  const requested = normalizedSource(env.COMPLETED_HISTORY_READ_SOURCE);
  const cutover = productionCutoverReadSourceEnvironment({
    env,
    variable: "COMPLETED_HISTORY_READ_SOURCE",
    configuredValue: env.COMPLETED_HISTORY_READ_SOURCE,
    requiredPhase: "READ_CUTOVER",
  });
  if (cutover.handled) {
    return {
      requested: cutover.requested,
      resolved: cutover.resolved,
      blocked: cutover.blocked,
      productionBlocked: cutover.blocked,
      preview: false,
      projectApproved: cutover.activation.projectRefApproved,
      projectRef: cutover.activation.resources.projectRef,
      productionShadowCandidate: false,
      productionCutover: cutover,
      credentialsConfigured: cutover.activation.serviceCredentialConfigured,
      supabaseEligible: cutover.resolved === "supabase",
      fallbackUsed: false,
      reason: cutover.reason,
    };
  }
  const preview = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const candidate = productionShadowCandidateReadEnvironment(env);
  const projectApproved = candidate.eligible || approvedProject(env);
  const credentialsConfigured = Boolean(
    clean(env.SUPABASE_SCORING_MIRROR_URL) &&
    clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY)
  );
  const supabaseEligible = candidate.eligible || (preview && projectApproved && credentialsConfigured);
  const productionBlocked = requested === "supabase" && !preview;
  const blocked = requested === "invalid" || (
    requested === "supabase" && preview && !supabaseEligible
  );
  const resolved = requested === "supabase" && supabaseEligible
    ? "supabase"
    : "google";
  const reason = resolved === "supabase" ? (candidate.eligible ? "production-shadow-supabase-completed-history" : "preview-supabase-completed-history")
    : requested === "invalid" ? "invalid-source"
    : requested !== "supabase" ? "google-configured"
    : productionBlocked ? "production-hard-block"
    : !projectApproved ? "preview-project-required"
    : !credentialsConfigured ? "credentials-missing"
    : "google-configured";

  return {
    requested,
    resolved,
    blocked,
    productionBlocked,
    preview,
    projectApproved,
    projectRef: candidate.eligible ? candidate.projectRef : projectApproved ? PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF : "",
    productionShadowCandidate: candidate.eligible,
    credentialsConfigured,
    supabaseEligible,
    reason,
  };
}

export function requireCompletedHistoryReadSource(env = process.env) {
  const state = completedHistoryReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase completed History reads are unavailable (${state.reason}).`);
    error.code = "COMPLETED_HISTORY_SUPABASE_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}

/**
 * Keep an explicit Supabase request on the strict route even if its Preview
 * credentials are incomplete. This prevents an accidental hidden fallback.
 */
export function isSupabaseCompletedHistoryYear(year, env = process.env) {
  const state = completedHistoryReadEnvironment(env);
  return isCompletedHistoryYear(year) && state.requested !== "google" &&
    Boolean(state.preview || state.productionCutover?.handled);
}
