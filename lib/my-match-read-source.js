import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";

const clean = (value) => String(value ?? "").trim();

export function myMatchReadEnvironment(env = process.env) {
  const requested = clean(env.MY_MATCH_READ_SOURCE || "google").toLowerCase();
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (!previewWorkbookId || workbookId === previewWorkbookId);
  const credentialsConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) &&
    Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const supabaseEligible = previewDeployment && previewWorkbook && credentialsConfigured;
  const resolved = requested === "supabase" && supabaseEligible ? "supabase" : "google";
  const blocked = requested === "supabase" && previewDeployment && !supabaseEligible;
  return {
    requested,
    resolved,
    blocked,
    previewDeployment,
    previewWorkbook,
    productionIsolated,
    credentialsConfigured,
    reason: resolved === "supabase" ? "preview-supabase-read"
      : requested !== "supabase" ? "google-configured"
      : !previewDeployment ? "production-hard-block"
      : !previewWorkbook ? "preview-workbook-required"
      : !credentialsConfigured ? "credentials-missing"
      : "google-fallback",
  };
}

export function requireMyMatchReadSource(env = process.env) {
  const state = myMatchReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase My Match reads are unavailable (${state.reason}).`);
    error.code = "MY_MATCH_SUPABASE_CONFIGURATION_REQUIRED";
    throw error;
  }
  return state;
}
