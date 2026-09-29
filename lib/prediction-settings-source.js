import { canonicalReadEnvironment } from "./canonical-runtime-source.js";
export function predictionSettingsEnvironment(env = process.env) {
  const state = canonicalReadEnvironment(env, "PREDICTION_SETTINGS_READ_SOURCE", {requiredPhase: "ODDS_WAR_ROOM"});
  return {...state, requestedSource: state.requested, source: state.resolved, preview: state.previewDeployment, isolated: state.productionIsolated, configured: state.credentialsConfigured};
}
export async function loadPredictionSettingsFromSelectedSource({
  env = process.env,
  googleLoader,
  supabaseLoader,
} = {}) {
  const gate = predictionSettingsEnvironment(env);
  if (gate.blocked) {
    throw Object.assign(new Error(`Prediction Settings source is unavailable (${gate.reason}).`), {
      code: "PREDICTION_SETTINGS_SOURCE_UNAVAILABLE",
      status: 503,
      diagnostics: gate,
    });
  }
  if (gate.source === "supabase") {
    if (typeof supabaseLoader !== "function") throw Object.assign(new Error("Supabase Prediction Settings loader is unavailable."), { code: "PREDICTION_SETTINGS_SUPABASE_LOADER_REQUIRED" });
    return { source: "supabase", gate, projection: await supabaseLoader() };
  }
  if (typeof googleLoader !== "function") throw Object.assign(new Error("Google Prediction Settings loader is unavailable."), { code: "PREDICTION_SETTINGS_GOOGLE_LOADER_REQUIRED" });
  return { source: "google", gate, projection: await googleLoader() };
}
