import { canonicalReadEnvironment } from "./canonical-runtime-source.js";
const stateFor = (variable, env = process.env) => canonicalReadEnvironment(env, variable);

export const momentumReadEnvironment = (env = process.env) => stateFor("MOMENTUM_READ_SOURCE", env);
export const storylinesReadEnvironment = (env = process.env) => stateFor("STORYLINES_READ_SOURCE", env);

export function requireMomentumReadSource(env = process.env) {
  const state = momentumReadEnvironment(env);
  if (state.blocked) throw Object.assign(new Error(`Supabase Momentum reads are unavailable (${state.reason}).`),
    { code: "MOMENTUM_SUPABASE_CONFIGURATION_REQUIRED" });
  return state;
}

export function requireStorylinesReadSource(env = process.env) {
  const state = storylinesReadEnvironment(env);
  if (state.blocked) throw Object.assign(new Error(`Supabase Storyline reads are unavailable (${state.reason}).`),
    { code: "STORYLINES_SUPABASE_CONFIGURATION_REQUIRED" });
  return state;
}
