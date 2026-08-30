import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";
import { productionCutoverReadSourceEnvironment } from "./production-cutover-read-source.js";

const clean = (value) => String(value ?? "").trim();

export function calcuttaReadEnvironment(env = process.env) {
  const configured = clean(env.CALCUTTA_READ_SOURCE || "google").toLowerCase();
  const requested = ["google", "supabase"].includes(configured) ? configured : "invalid";
  const cutover = productionCutoverReadSourceEnvironment({
    env, variable: "CALCUTTA_READ_SOURCE", configuredValue: env.CALCUTTA_READ_SOURCE,
    // Production Calcutta V1 owns NOT_CONFIGURED and UNPUBLISHED as explicit,
    // safe domain states. Optional Calcutta presentation must never block the
    // tournament shell because a deployment flag predates those states.
    requiredPhase: "OBSERVATION",
  });
  if (cutover.handled) return {
    requested: cutover.requested, resolved: cutover.resolved, blocked: cutover.blocked,
    previewDeployment: false, previewWorkbook: false, productionIsolated: false,
    credentialsConfigured: cutover.activation.serviceCredentialConfigured,
    productionShadowCandidate: false, productionCutover: cutover, fallbackUsed: false,
    configured: cutover.domainConfigured, reason: cutover.reason,
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
  const blocked = requested === "invalid" || (
    requested === "supabase" && previewDeployment && !supabaseEligible
  );
  return {
    requested, resolved, blocked, previewDeployment, previewWorkbook,
    productionIsolated, credentialsConfigured,
    productionShadowCandidate: candidate.eligible,
    reason: resolved === "supabase" ? (candidate.eligible ? "production-shadow-supabase-calcutta" : "preview-supabase-calcutta")
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
