import { canonicalReadEnvironment } from "./canonical-runtime-source.js";

/** Records and career statistics derive only from canonical PostgreSQL History. */
export function secondaryHistoryReadEnvironment(env = process.env) {
  const state = canonicalReadEnvironment(env, "SECONDARY_HISTORY_READ_SOURCE", {
    requiredPhase: "READ_CUTOVER",
  });
  return { ...state, preview: state.previewDeployment, productionBlocked: state.blocked && !state.productionIsolated };
}

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
