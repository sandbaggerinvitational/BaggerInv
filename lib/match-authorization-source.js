import { canonicalReadEnvironment } from "./canonical-runtime-source.js";

export function matchAuthorizationEnvironment(env = process.env) {
  return canonicalReadEnvironment(env, "MATCH_AUTHORIZATION_SOURCE", {requiredPhase: "CURRENT_READS"});
}

export function requireMatchAuthorizationSource(env = process.env) {
  const state = matchAuthorizationEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase match authorization is unavailable (${state.reason}).`);
    error.code = "MATCH_AUTHORIZATION_SUPABASE_CONFIGURATION_REQUIRED";
    throw error;
  }
  return state;
}
