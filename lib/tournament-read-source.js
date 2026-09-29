import { canonicalReadEnvironment } from "./canonical-runtime-source.js";
export function tournamentReadEnvironment(env = process.env) { return canonicalReadEnvironment(env, "TOURNAMENT_READ_SOURCE"); }
export function tournamentFoundationReadEnvironment(env = process.env) { return canonicalReadEnvironment(env, "TOURNAMENT_FOUNDATION_READ_SOURCE"); }
export function homepageCurrentReadEnvironment(env = process.env) {
  return {...canonicalReadEnvironment({...env, HOMEPAGE_CURRENT_READ_SOURCE: env.HOMEPAGE_CURRENT_READ_SOURCE || env.TOURNAMENT_READ_SOURCE}, "HOMEPAGE_CURRENT_READ_SOURCE"),
    configuredBy: env.HOMEPAGE_CURRENT_READ_SOURCE ? "homepage-override" : "tournament-read-source"};
}

export function requireTournamentReadSource(env = process.env) {
  const state = tournamentReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase Tournament reads are unavailable (${state.reason}).`);
    error.code = "TOURNAMENT_SUPABASE_CONFIGURATION_REQUIRED";
    throw error;
  }
  return state;
}

export function requireTournamentFoundationReadSource(env = process.env) {
  const state = tournamentFoundationReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase Tournament foundation reads are unavailable (${state.reason}).`);
    error.code = "TOURNAMENT_FOUNDATION_SUPABASE_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}

export function requireHomepageCurrentReadSource(env = process.env) {
  const state = homepageCurrentReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase Homepage current-tournament reads are unavailable (${state.reason}).`);
    error.code = "HOMEPAGE_CURRENT_SUPABASE_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}
