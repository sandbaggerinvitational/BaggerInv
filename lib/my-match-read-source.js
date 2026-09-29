import { canonicalReadEnvironment } from "./canonical-runtime-source.js";

export function myMatchReadEnvironment(env = process.env) {
  return canonicalReadEnvironment(env, "MY_MATCH_READ_SOURCE", {requiredPhase: "CURRENT_READS"});
}

export function requireMyMatchReadSource(env = process.env) {
  const state = myMatchReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase My Match reads are unavailable (${state.reason}).`);
    error.code = "MY_MATCH_SUPABASE_CONFIGURATION_REQUIRED";
    throw error;
  }
  return state;
}
