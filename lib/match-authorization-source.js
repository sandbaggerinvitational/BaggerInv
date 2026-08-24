import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";

const clean = (value) => String(value ?? "").trim();

export function matchAuthorizationEnvironment(env = process.env) {
  const candidate = productionShadowCandidateReadEnvironment(env);
  const configured = clean(env.MATCH_AUTHORIZATION_SOURCE || "google").toLowerCase();
  const requested = ["google", "supabase"].includes(configured) ? configured : "invalid";
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (!previewWorkbookId || workbookId === previewWorkbookId);
  const credentialsConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) &&
    Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const supabaseEligible = candidate.eligible || (previewDeployment && previewWorkbook && credentialsConfigured);
  const resolved = requested === "supabase" && supabaseEligible ? "supabase" : "google";
  const blocked = requested === "invalid" || (
    requested === "supabase" && previewDeployment && !supabaseEligible
  );
  return {
    requested,
    resolved,
    blocked,
    previewDeployment,
    previewWorkbook,
    productionIsolated,
    credentialsConfigured,
    productionShadowCandidate: candidate.eligible,
    reason: resolved === "supabase" ? (candidate.eligible ? "production-shadow-supabase-authorization" : "preview-supabase-authorization")
      : requested === "invalid" ? "invalid-source"
      : requested !== "supabase" ? "google-configured"
      : !previewDeployment ? "production-hard-block"
      : !previewWorkbook ? "preview-workbook-required"
      : !credentialsConfigured ? "credentials-missing"
      : "google-fallback",
  };
}

export function requireMatchAuthorizationSource(env = process.env) {
  const state = matchAuthorizationEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase match authorization is unavailable (${state.reason}).`);
    error.code = "MATCH_AUTHORIZATION_SUPABASE_CONFIGURATION_REQUIRED";
    throw error;
  }
  return state;
}
