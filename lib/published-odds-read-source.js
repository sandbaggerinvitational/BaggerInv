import { canonicalReadEnvironment } from "./canonical-runtime-source.js";

export function publishedOddsReadEnvironment(env = process.env) {
  return canonicalReadEnvironment(env, "PUBLISHED_ODDS_READ_SOURCE", {requiredPhase: "READ_CUTOVER"});
}

export function requirePublishedOddsReadSource(env = process.env) {
  const state = publishedOddsReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase published Odds reads are unavailable (${state.reason}).`);
    error.code = "PUBLISHED_ODDS_SUPABASE_CONFIGURATION_REQUIRED";
    throw error;
  }
  return state;
}
