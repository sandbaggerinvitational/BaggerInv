import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";

// @deprecated Retained only for external/operator compatibility during the
// Production-legacy window. Runtime consumers use the shared Odds input
// configuration projection and WAR_ROOM_INPUT_SOURCE instead.

const clean = (value) => String(value ?? "").trim();

export function predictionSettingsEnvironment(env = process.env) {
  const candidate = productionShadowCandidateReadEnvironment(env);
  const requestedSource = clean(env.PREDICTION_SETTINGS_READ_SOURCE || "google").toLowerCase();
  const preview = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const isolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID && (!previewWorkbookId || workbookId === previewWorkbookId);
  const configured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) && Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const eligible = candidate.eligible || (preview && isolated && configured);
  const valid = ["google", "supabase"].includes(requestedSource);
  const blocked = !valid || (requestedSource === "supabase" && preview && !eligible);
  return {
    requestedSource,
    source: requestedSource === "supabase" && eligible ? "supabase"
      : blocked ? "unavailable" : "google",
    preview,
    isolated,
    configured,
    eligible,
    blocked,
    productionShadowCandidate: candidate.eligible,
    projectRef: candidate.eligible ? candidate.projectRef : "",
    reason: candidate.eligible && requestedSource === "supabase"
      ? "production-shadow-supabase-prediction-settings"
      : !valid ? "invalid-source"
      : requestedSource === "google" ? "google-configured"
      : !preview ? "production-hard-block"
      : !isolated ? "preview-workbook-required"
      : !configured ? "credentials-missing"
      : "preview-supabase-prediction-settings",
    productionHardBlock: !preview && requestedSource === "supabase",
  };
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
