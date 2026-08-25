import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";
import { scoringShadowEnvironment } from "./scoring-shadow-gate.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";
import { productionCutoverReadSourceEnvironment } from "./production-cutover-read-source.js";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));

export const PREVIEW_HISTORY_2026_TOURNAMENT_ID = "2026";
export const PREVIEW_HISTORY_2026_TOURNAMENT_YEAR = 2026;
export const PREVIEW_HISTORY_2026_SUPABASE_PROJECT_REF = "idgigvjjqkfbqjeredpb";

function configuredWorkbookId(env) {
  // Keep this identical to scoringShadowEnvironment/scoringShadowRpc. An
  // alias accepted only here could claim eligibility while the transport is
  // disabled and would make every bounded RPC return a skipped response.
  return clean(env.GOOGLE_SHEETS_ID);
}

function configuredProjectRef(env) {
  const configured = clean(env.SUPABASE_SCORING_MIRROR_URL);
  if (!configured) return "";
  try {
    const parsed = new URL(configured);
    const expectedHost = `${PREVIEW_HISTORY_2026_SUPABASE_PROJECT_REF}.supabase.co`;
    const exactOrigin = parsed.protocol === "https:" &&
      parsed.hostname === expectedHost &&
      !parsed.username && !parsed.password && !parsed.port &&
      (parsed.pathname === "/" || parsed.pathname === "") &&
      !parsed.search && !parsed.hash;
    return exactOrigin ? PREVIEW_HISTORY_2026_SUPABASE_PROJECT_REF : "";
  } catch {
    return "";
  }
}

function normalizedSource(value) {
  const source = clean(value || "google").toLowerCase();
  return ["google", "supabase"].includes(source) ? source : "invalid";
}

/**
 * Resolve the staged 2026 History read source without permitting the browser to
 * influence it. Supabase is intentionally eligible only in a protected Preview
 * deployment pointed at a non-Production workbook and the explicitly approved
 * 2026 tournament. Production continues to resolve to the existing source.
 */
export function history2026ReadEnvironment(env = process.env) {
  const candidate = productionShadowCandidateReadEnvironment(env);
  const requested = normalizedSource(env.HISTORY_2026_READ_SOURCE);
  const cutover = productionCutoverReadSourceEnvironment({
    env,
    variable: "HISTORY_2026_READ_SOURCE",
    configuredValue: env.HISTORY_2026_READ_SOURCE,
    requiredPhase: "CURRENT_READS",
  });
  if (cutover.handled) {
    return {
      requested: cutover.requested,
      resolved: cutover.resolved,
      blocked: cutover.blocked,
      productionBlocked: cutover.blocked,
      previewDeployment: false,
      workbookId: cutover.activation.resources.workbookId,
      previewWorkbook: false,
      productionIsolated: false,
      projectRef: cutover.activation.resources.projectRef,
      approvedProject: cutover.activation.projectRefApproved,
      tournamentId: PREVIEW_HISTORY_2026_TOURNAMENT_ID,
      tournamentYear: PREVIEW_HISTORY_2026_TOURNAMENT_YEAR,
      approvedTournament: cutover.activation.tournamentIdApproved,
      credentialsConfigured: cutover.activation.serviceCredentialConfigured,
      serviceEnabled: cutover.publicReadsEnabled,
      supabaseAuthority: true,
      supabaseEligible: cutover.resolved === "supabase",
      productionShadowCandidate: false,
      productionCutover: cutover,
      fallbackUsed: false,
      reason: cutover.reason,
    };
  }
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = configuredWorkbookId(env);
  const assertedPreviewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (
    !assertedPreviewWorkbookId || assertedPreviewWorkbookId === workbookId
  );
  const tournamentId = clean(
    env.HISTORY_2026_TOURNAMENT_ID || PREVIEW_HISTORY_2026_TOURNAMENT_ID
  );
  const approvedTournament = tournamentId === PREVIEW_HISTORY_2026_TOURNAMENT_ID;
  const projectRef = configuredProjectRef(env);
  const approvedProject = candidate.eligible || projectRef === PREVIEW_HISTORY_2026_SUPABASE_PROJECT_REF;
  const shadowTransport = scoringShadowEnvironment(env);
  const credentialsConfigured = shadowTransport.credentialsConfigured;
  const serviceEnabled = truthy(env.SUPABASE_SCORING_MIRROR_ENABLED);
  // If an authority assertion is present it must still name Supabase. Existing
  // Preview deployments without the redundant assertion remain eligible.
  const authorityAssertion = clean(env.SCORING_AUTHORITY).toLowerCase();
  const supabaseAuthority = !authorityAssertion || authorityAssertion === "supabase";
  const supabaseEligible = candidate.eligible || (previewDeployment && previewWorkbook && approvedProject &&
    approvedTournament && credentialsConfigured && serviceEnabled &&
    shadowTransport.enabled && supabaseAuthority);
  const productionBlocked = requested === "supabase" && !previewDeployment;
  const blocked = requested === "invalid" || (
    requested === "supabase" && previewDeployment && !supabaseEligible
  );
  const resolved = requested === "supabase" && supabaseEligible ? "supabase" : "google";
  const reason = resolved === "supabase" ? (candidate.eligible ? "production-shadow-supabase-2026-history" : "preview-supabase-2026-history")
    : requested === "invalid" ? "invalid-source"
    : requested !== "supabase" ? "google-configured"
    : productionBlocked ? "production-hard-block"
    : !previewWorkbook ? "preview-workbook-required"
    : !approvedProject ? "preview-project-required"
    : !approvedTournament ? "approved-2026-tournament-required"
    : !credentialsConfigured ? "credentials-missing"
    : !serviceEnabled || !shadowTransport.enabled ? "supabase-service-disabled"
    : !supabaseAuthority ? "supabase-scoring-authority-required"
    : "google-configured";

  return {
    requested,
    resolved,
    blocked,
    productionBlocked,
    previewDeployment,
    workbookId,
    previewWorkbook,
    productionIsolated,
    projectRef: candidate.eligible ? candidate.projectRef : projectRef,
    approvedProject,
    tournamentId,
    tournamentYear: PREVIEW_HISTORY_2026_TOURNAMENT_YEAR,
    approvedTournament,
    credentialsConfigured,
    serviceEnabled,
    supabaseAuthority,
    supabaseEligible,
    productionShadowCandidate: candidate.eligible,
    reason,
  };
}

export function requireHistory2026ReadSource(env = process.env) {
  const state = history2026ReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase 2026 History reads are unavailable (${state.reason}).`);
    error.code = "HISTORY_2026_SUPABASE_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}

/**
 * Route only the explicit 2026 URL through the Preview Supabase path. When the
 * flag requests Supabase but Preview configuration is incomplete, this remains
 * true so the route fails locally through requireHistory2026ReadSource instead
 * of silently falling back to the legacy transport.
 */
export function isSupabaseHistory2026(year, env = process.env) {
  const state = history2026ReadEnvironment(env);
  return Number(year) === PREVIEW_HISTORY_2026_TOURNAMENT_YEAR &&
    state.requested !== "google" &&
    Boolean(state.previewDeployment || state.productionCutover?.handled);
}
