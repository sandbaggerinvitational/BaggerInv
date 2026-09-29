import { canonicalReadEnvironment } from "./canonical-runtime-source.js";

export function scoringReadEnvironment(env = process.env) {
  return canonicalReadEnvironment(env, "SCORING_READ_SOURCE", {requiredPhase: "CURRENT_READS"});
}

export function requireScoringReadSource(env = process.env) {
  const state = scoringReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase scoring reads are unavailable (${state.reason}).`);
    error.code = "SCORING_SUPABASE_READ_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}
