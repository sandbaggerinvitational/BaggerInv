import {
  PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF,
} from "./completed-history-read-source.js";

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
  const projectUrl = clean(env.SUPABASE_SCORING_MIRROR_URL);
  const projectApproved = projectUrl.includes(
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
    projectRef: projectApproved
      ? PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF
      : "",
    projectApproved,
    credentialsConfigured,
    reason: requested === "invalid"
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
