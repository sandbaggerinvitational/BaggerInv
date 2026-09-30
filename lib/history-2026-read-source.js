import { canonicalReadEnvironment } from "./canonical-runtime-source.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
export const PREVIEW_HISTORY_2026_TOURNAMENT_ID = "2026";
export const PREVIEW_HISTORY_2026_TOURNAMENT_YEAR = 2026;
export const PREVIEW_HISTORY_2026_SUPABASE_PROJECT_REF = "idgigvjjqkfbqjeredpb";


export function history2026ReadEnvironment(env = process.env) {
  const state = canonicalReadEnvironment(env, "HISTORY_2026_READ_SOURCE", {
    requiredPhase: "CURRENT_READS",
  });
  const tournamentId = clean(env.HISTORY_2026_TOURNAMENT_ID || PREVIEW_HISTORY_2026_TOURNAMENT_ID);
  const approvedTournament = tournamentId === PREVIEW_HISTORY_2026_TOURNAMENT_ID;
  // Only the already-admitted diagnostic read may omit the mirror writer flag.
  const diagnostic = state.productionShadowCandidate === true
    ? productionShadowCandidateReadEnvironment(env) : null;
  const diagnosticRead = diagnostic?.eligible === true;
  const authorityAssertion = clean(env.SCORING_AUTHORITY).toLowerCase();
  const supabaseAuthority = diagnosticRead || !authorityAssertion || authorityAssertion === "supabase";
  const cutover = state.productionCutover?.handled;
  const serviceEnabled = diagnosticRead ? true
    : cutover ? state.productionCutover.publicReadsEnabled
    : truthy(env.SUPABASE_SCORING_MIRROR_ENABLED);
  const blocked = state.blocked || !approvedTournament || (!cutover && !supabaseAuthority) || !serviceEnabled;
  const reason = state.blocked ? state.reason
    : !approvedTournament ? "approved-2026-tournament-required"
    : !supabaseAuthority ? "supabase-scoring-authority-required"
    : !serviceEnabled ? "supabase-service-disabled"
    : state.reason;
  return {
    ...state,
    resolved: blocked ? "unavailable" : "supabase",
    blocked,
    reason,
    previewDeployment: state.previewDeployment,
    productionBlocked: state.blocked && !state.productionIsolated,
    workbookId: cutover ? state.productionCutover.activation.resources.workbookId
      : diagnosticRead ? diagnostic.workbookId : "",
    previewWorkbook: false,
    productionIsolated: state.productionIsolated,
    tournamentId,
    tournamentYear: PREVIEW_HISTORY_2026_TOURNAMENT_YEAR,
    approvedTournament,
    approvedProject: diagnosticRead || state.projectApproved || Boolean(state.productionCutover?.activation?.projectRefApproved),
    serviceEnabled,
    supabaseAuthority,
    supabaseEligible: !blocked,
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

/** Misconfiguration must never choose a legacy workbook or bundled fallback. */
export function isSupabaseHistory2026(year, _env = process.env) {
  return Number(year) === PREVIEW_HISTORY_2026_TOURNAMENT_YEAR;
}
