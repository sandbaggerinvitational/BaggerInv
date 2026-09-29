import { canonicalReadEnvironment } from "./canonical-runtime-source.js";

export function leaderboardsCoreReadEnvironment(env = process.env) {
  return canonicalReadEnvironment(env, "LEADERBOARDS_CORE_READ_SOURCE", {requiredPhase: "CURRENT_READS"});
}

export function requireLeaderboardsCoreReadSource(env = process.env) {
  const state = leaderboardsCoreReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase Leaderboards core reads are unavailable (${state.reason}).`);
    error.code = "LEADERBOARDS_CORE_SUPABASE_CONFIGURATION_REQUIRED";
    throw error;
  }
  return state;
}
