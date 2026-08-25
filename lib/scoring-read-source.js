import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";
import { productionCutoverReadSourceEnvironment } from "./production-cutover-read-source.js";

const clean = (value) => String(value ?? "").trim();

export function scoringReadEnvironment(env = process.env) {
  const configured = clean(env.SCORING_READ_SOURCE || "google").toLowerCase();
  const requested = ["google", "supabase"].includes(configured) ? configured : "invalid";
  const cutover = productionCutoverReadSourceEnvironment({
    env, variable: "SCORING_READ_SOURCE", configuredValue: env.SCORING_READ_SOURCE,
    requiredPhase: "CURRENT_READS",
  });
  if (cutover.handled) return {
    requested: cutover.requested, resolved: cutover.resolved, blocked: cutover.blocked,
    productionBlocked: cutover.blocked, previewDeployment: false, previewWorkbook: false,
    productionIsolated: false, credentialsConfigured: cutover.activation.serviceCredentialConfigured,
    productionShadowCandidate: false, productionCutover: cutover, fallbackUsed: false,
    reason: cutover.reason,
  };
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (!previewWorkbookId || workbookId === previewWorkbookId);
  const credentialsConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) &&
    Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const candidate = productionShadowCandidateReadEnvironment(env);
  const supabaseEligible = candidate.eligible || (previewDeployment && previewWorkbook && credentialsConfigured);
  const resolved = requested === "supabase" && supabaseEligible ? "supabase" : "google";
  const productionBlocked = requested === "supabase" && !previewDeployment;
  const blocked = requested === "invalid" || (
    requested === "supabase" && previewDeployment && !supabaseEligible
  );
  return {
    requested,
    resolved,
    blocked,
    productionBlocked,
    previewDeployment,
    previewWorkbook,
    productionIsolated,
    credentialsConfigured,
    productionShadowCandidate: candidate.eligible,
    reason: resolved === "supabase" ? (candidate.eligible ? "production-shadow-supabase-scoring-read" : "preview-supabase-read")
      : requested === "invalid" ? "invalid-source"
      : requested !== "supabase" ? "google-configured"
      : productionBlocked ? "production-hard-block"
      : !previewWorkbook ? "preview-workbook-required"
      : !credentialsConfigured ? "credentials-missing"
      : "google-configured",
  };
}

export function requireScoringReadSource(env = process.env) {
  const state = scoringReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase scoring reads are unavailable (${state.reason}).`);
    error.code = "SCORING_SUPABASE_READ_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}
