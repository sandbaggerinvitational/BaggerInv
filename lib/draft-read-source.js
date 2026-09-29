import { canonicalReadEnvironment, CANONICAL_PREVIEW_PROJECT_REF } from "./canonical-runtime-source.js";
export const PREVIEW_DRAFT_SUPABASE_PROJECT_REF = CANONICAL_PREVIEW_PROJECT_REF;
export function draftReadEnvironment(env = process.env) {
  const state = canonicalReadEnvironment(env, "DRAFT_READ_SOURCE", {requiredPhase: "READ_CUTOVER"});
  return {...state, preview: state.previewDeployment, productionBlocked: env.VERCEL_ENV === "production" && state.blocked};
}
export function requireDraftReadSource(env = process.env) {
  const state = draftReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase Draft reads are unavailable (${state.reason}).`);
    error.code = "DRAFT_SUPABASE_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}

export function isSupabaseDraftRead(env = process.env) {
  return draftReadEnvironment(env).resolved === "supabase";
}
