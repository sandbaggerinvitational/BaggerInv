import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";

const clean = (value) => String(value ?? "").trim();

export function calcuttaReadEnvironment(env = process.env) {
  const configured = clean(env.CALCUTTA_READ_SOURCE || "google").toLowerCase();
  const requested = ["google", "supabase"].includes(configured) ? configured : "invalid";
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (!previewWorkbookId || workbookId === previewWorkbookId);
  const credentialsConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) &&
    Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const supabaseEligible = previewDeployment && previewWorkbook && credentialsConfigured;
  const resolved = requested === "supabase" && supabaseEligible ? "supabase" : "google";
  const blocked = requested === "invalid" || (
    requested === "supabase" && previewDeployment && !supabaseEligible
  );
  return {
    requested, resolved, blocked, previewDeployment, previewWorkbook,
    productionIsolated, credentialsConfigured,
    reason: resolved === "supabase" ? "preview-supabase-calcutta"
      : requested === "invalid" ? "invalid-source"
      : requested !== "supabase" ? "google-configured"
      : !previewDeployment ? "production-hard-block"
      : !previewWorkbook ? "preview-workbook-required"
      : !credentialsConfigured ? "credentials-missing"
      : "google-fallback",
  };
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
