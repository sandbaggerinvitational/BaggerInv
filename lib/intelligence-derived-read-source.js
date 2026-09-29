import { canonicalReadEnvironment } from "./canonical-runtime-source.js";
const stateFor = (variable, env = process.env) => canonicalReadEnvironment(env, variable);

export const tournamentIntelligenceReadEnvironment = (env = process.env) => stateFor("TOURNAMENT_INTELLIGENCE_READ_SOURCE", env);
export const projectionEditorialReadEnvironment = (env = process.env) => stateFor("PROJECTION_EDITORIAL_READ_SOURCE", env);
export const finalRecapReadEnvironment = (env = process.env) => stateFor("FINAL_RECAP_READ_SOURCE", env);

export function requireIntelligenceDerivedReadSources(env = process.env) {
  const sources = {
    tournamentIntelligence: tournamentIntelligenceReadEnvironment(env),
    projectionEditorial: projectionEditorialReadEnvironment(env),
    finalRecap: finalRecapReadEnvironment(env),
  };
  const blocked = Object.entries(sources).find(([, state]) => state.blocked);
  if (blocked) throw Object.assign(new Error(`Supabase ${blocked[0]} reads are unavailable (${blocked[1].reason}).`), { code: "INTELLIGENCE_SUPABASE_CONFIGURATION_REQUIRED" });
  return sources;
}
