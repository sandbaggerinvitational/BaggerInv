import { canonicalReadEnvironment } from "./canonical-runtime-source.js";

/** Historical course facts have the same certified canonical History authority. */
export function historicalCourseReadEnvironment(env = process.env) {
  const state = canonicalReadEnvironment(env, "HISTORICAL_COURSE_READ_SOURCE", {
    requiredPhase: "READ_CUTOVER",
  });
  return { ...state, preview: state.previewDeployment, productionBlocked: state.blocked && !state.productionIsolated };
}

export function requireHistoricalCourseReadSource(env = process.env) {
  const state = historicalCourseReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Historical course reads are unavailable (${state.reason}).`);
    error.code = "HISTORICAL_COURSE_SUPABASE_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}
