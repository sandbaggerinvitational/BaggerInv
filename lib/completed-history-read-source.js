import { isCompletedHistoryYear } from "./completed-history-contract.js";
import { canonicalReadEnvironment } from "./canonical-runtime-source.js";

export const PREVIEW_COMPLETED_HISTORY_SUPABASE_PROJECT_REF = "idgigvjjqkfbqjeredpb";

/** Certified PostgreSQL revisions are the only runtime completed-History authority.
 * Google source import remains a separate, explicitly invoked maintenance tool.
 */
export function completedHistoryReadEnvironment(env = process.env) {
  const state = canonicalReadEnvironment(env, "COMPLETED_HISTORY_READ_SOURCE", {
    requiredPhase: "READ_CUTOVER",
  });
  return { ...state, preview: state.previewDeployment, productionBlocked: state.blocked && !state.productionIsolated, supabaseEligible: !state.blocked && state.resolved === "supabase" };
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

/** A configuration failure stays on the canonical route and fails closed. */
export function isSupabaseCompletedHistoryYear(year, _env = process.env) {
  return isCompletedHistoryYear(year);
}
