import { canonicalReadEnvironment } from "./canonical-runtime-source.js";

export function calcuttaReadEnvironment(env = process.env) {
  return canonicalReadEnvironment(env, "CALCUTTA_READ_SOURCE", {requiredPhase: "OBSERVATION"});
}

export function requireCalcuttaReadSource(env = process.env) {
  const state = calcuttaReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase Calcutta reads are unavailable (${state.reason}).`);
    error.code = "CALCUTTA_SUPABASE_CONFIGURATION_REQUIRED";
    throw error;
  }
  return state;
}
