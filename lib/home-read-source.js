import { canonicalReadEnvironment } from "./canonical-runtime-source.js";

export function homeReadEnvironment(env = process.env) {
  return canonicalReadEnvironment(env, "HOME_READ_SOURCE", {requiredPhase: "CURRENT_READS"});
}

export function requireHomeReadSource(env = process.env) {
  const state = homeReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase Home reads are unavailable (${state.reason}).`);
    error.code = "HOME_SUPABASE_CONFIGURATION_REQUIRED";
    throw error;
  }
  return state;
}
