import { canonicalReadEnvironment } from "./canonical-runtime-source.js";

export function netSkinsReadEnvironment(env = process.env) {
  return canonicalReadEnvironment(env, "NET_SKINS_READ_SOURCE", {requiredPhase: "CURRENT_READS"});
}

export function requireNetSkinsReadSource(env = process.env) {
  const state = netSkinsReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase Net Skins reads are unavailable (${state.reason}).`);
    error.code = "NET_SKINS_SUPABASE_CONFIGURATION_REQUIRED";
    throw error;
  }
  return state;
}
