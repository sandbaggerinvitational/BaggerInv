import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";

const clean = (value) => String(value ?? "").trim();
const AUTHORITIES = new Set(["google", "supabase"]);

export function scoringAuthorityEnvironment(env = process.env) {
  const configuredValue = clean(env.SCORING_AUTHORITY);
  const rawRequested = clean(configuredValue || "google").toLowerCase();
  const valid = AUTHORITIES.has(rawRequested);
  const requested = valid ? rawRequested : "invalid";
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (!previewWorkbookId || workbookId === previewWorkbookId);
  const credentialsConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) &&
    Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const eligible = previewDeployment && previewWorkbook && credentialsConfigured;
  const blocked = previewDeployment && (!valid || (requested === "supabase" && !eligible));
  const resolved = !previewDeployment ? "google" : blocked ? "unavailable" : requested;
  const reason = !previewDeployment ? (requested === "google" ? "production-google-authority" : "production-hard-block")
    : !valid ? "invalid-authority"
    : requested === "google" ? "preview-google-authority"
    : !previewWorkbook ? "preview-workbook-required"
    : !credentialsConfigured ? "credentials-missing"
    : "preview-supabase-authority";
  return {
    configuredValue,
    requested,
    resolved,
    valid,
    eligible,
    blocked,
    previewDeployment,
    previewWorkbook,
    productionIsolated,
    credentialsConfigured,
    productionBlocked: !previewDeployment && requested !== "google",
    reason,
    failureCode: blocked ? "SCORING_AUTHORITY_UNAVAILABLE" : "",
  };
}

export function requireScoringAuthority(env = process.env) {
  const state = scoringAuthorityEnvironment(env);
  if (state.blocked) {
    const error = new Error("Scoring authority is unavailable in this Preview runtime.");
    error.code = state.failureCode;
    error.status = 503;
    error.authority = state;
    throw error;
  }
  return state;
}

export function scoringAuthority(env = process.env) {
  return requireScoringAuthority(env).resolved;
}
