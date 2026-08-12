import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";

const clean = (value) => String(value ?? "").trim();

export function publishedOddsReadEnvironment(env = process.env) {
  const requested = clean(env.PUBLISHED_ODDS_READ_SOURCE || "google").toLowerCase();
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (!previewWorkbookId || workbookId === previewWorkbookId);
  const credentialsConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) && Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const eligible = previewDeployment && previewWorkbook && credentialsConfigured;
  const resolved = requested === "supabase" && eligible ? "supabase" : "google";
  const blocked = requested === "supabase" && previewDeployment && !eligible;
  return { requested, resolved, blocked, previewDeployment, previewWorkbook, productionIsolated, credentialsConfigured,
    reason: resolved === "supabase" ? "preview-supabase-published-odds"
      : requested !== "supabase" ? "google-configured"
      : !previewDeployment ? "production-hard-block"
      : !previewWorkbook ? "preview-workbook-required"
      : !credentialsConfigured ? "credentials-missing" : "google-fallback" };
}

export function requirePublishedOddsReadSource(env = process.env) {
  const state = publishedOddsReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase published Odds reads are unavailable (${state.reason}).`);
    error.code = "PUBLISHED_ODDS_SUPABASE_CONFIGURATION_REQUIRED";
    throw error;
  }
  return state;
}
