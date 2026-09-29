import { canonicalReadEnvironment } from "./canonical-runtime-source.js";

export function gameCenterReadEnvironment(env = process.env) {
  return canonicalReadEnvironment(env, "GAME_CENTER_READ_SOURCE", {requiredPhase: "CURRENT_READS"});
}

export function requireGameCenterReadSource(env = process.env) {
  const state = gameCenterReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase Game Center reads are unavailable (${state.reason}).`);
    error.code = "GAME_CENTER_SUPABASE_CONFIGURATION_REQUIRED";
    throw error;
  }
  return state;
}
