import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";
import { productionCutoverReadSourceEnvironment } from "./production-cutover-read-source.js";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));

export function publishedOddsReadEnvironment(env = process.env) {
  const configured = clean(env.PUBLISHED_ODDS_READ_SOURCE || "google").toLowerCase();
  const requested = ["google", "supabase"].includes(configured) ? configured : "invalid";
  const cutover = productionCutoverReadSourceEnvironment({
    env,
    variable: "PUBLISHED_ODDS_READ_SOURCE",
    configuredValue: env.PUBLISHED_ODDS_READ_SOURCE,
    requiredPhase: "READ_CUTOVER",
  });
  if (cutover.handled) {
    const canonicalSupabasePublication =
      clean(env.ODDS_PUBLICATION_AUTHORITY).toLowerCase() === "supabase" &&
      truthy(env.PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED) &&
      !truthy(env.PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED);
    const canonicalReadMismatch = canonicalSupabasePublication &&
      cutover.resolved !== "supabase";
    return {
      requested: cutover.requested,
      resolved: canonicalReadMismatch ? "unavailable" : cutover.resolved,
      blocked: cutover.blocked || canonicalReadMismatch,
      previewDeployment: false,
      previewWorkbook: false,
      productionIsolated: false,
      credentialsConfigured: cutover.activation.serviceCredentialConfigured,
      productionShadowCandidate: false,
      productionCutover: cutover,
      fallbackUsed: false,
      reason: canonicalReadMismatch
        ? "supabase-publication-requires-supabase-read"
        : cutover.reason,
      failureCode: canonicalReadMismatch
        ? "PUBLISHED_ODDS_SUPABASE_CONFIGURATION_REQUIRED"
        : cutover.failureCode,
    };
  }
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (!previewWorkbookId || workbookId === previewWorkbookId);
  const credentialsConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) && Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const candidate = productionShadowCandidateReadEnvironment(env);
  const eligible = candidate.eligible || (previewDeployment && previewWorkbook && credentialsConfigured);
  const resolved = requested === "supabase" && eligible ? "supabase" : "google";
  const blocked = requested === "invalid" || (
    requested === "supabase" && previewDeployment && !eligible
  );
  return { requested, resolved, blocked, previewDeployment, previewWorkbook, productionIsolated, credentialsConfigured,
    productionShadowCandidate: candidate.eligible,
    reason: resolved === "supabase" ? (candidate.eligible ? "production-shadow-supabase-published-odds" : "preview-supabase-published-odds")
      : requested === "invalid" ? "invalid-source"
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
