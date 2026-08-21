import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";

const clean = (value) => String(value ?? "").trim();

function sourceEnvironment(env, variable, label) {
  const requested = clean(env[variable] || "google").toLowerCase();
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
    reason: resolved === "supabase" ? `preview-supabase-${label}`
      : requested !== "supabase" ? "google-configured"
      : !previewDeployment ? "production-hard-block"
      : !previewWorkbook ? "preview-workbook-required"
      : !credentialsConfigured ? "credentials-missing"
      : "google-fallback",
  };
}

export function tournamentReadEnvironment(env = process.env) {
  return sourceEnvironment(env, "TOURNAMENT_READ_SOURCE", "tournament");
}

export function tournamentFoundationReadEnvironment(env = process.env) {
  const state = sourceEnvironment(env, "TOURNAMENT_FOUNDATION_READ_SOURCE", "tournament-foundation");
  if (["google", "supabase"].includes(state.requested)) return state;
  return { ...state, blocked: true, reason: "invalid-source" };
}

export function homepageCurrentReadEnvironment(env = process.env) {
  const homepageSelection = clean(env.HOMEPAGE_CURRENT_READ_SOURCE);
  const inheritedSelection = clean(env.TOURNAMENT_READ_SOURCE || "google");
  const requested = homepageSelection || inheritedSelection;
  const state = sourceEnvironment(
    { ...env, HOMEPAGE_CURRENT_READ_SOURCE: requested },
    "HOMEPAGE_CURRENT_READ_SOURCE",
    "homepage-current-tournament",
  );
  if (!["google", "supabase"].includes(state.requested)) {
    return { ...state, blocked: true, reason: "invalid-source",
      configuredBy: homepageSelection ? "homepage-override" : "tournament-read-source" };
  }
  return { ...state,
    configuredBy: homepageSelection ? "homepage-override" : "tournament-read-source" };
}

export function requireTournamentReadSource(env = process.env) {
  const state = tournamentReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase Tournament reads are unavailable (${state.reason}).`);
    error.code = "TOURNAMENT_SUPABASE_CONFIGURATION_REQUIRED";
    throw error;
  }
  return state;
}

export function requireTournamentFoundationReadSource(env = process.env) {
  const state = tournamentFoundationReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase Tournament foundation reads are unavailable (${state.reason}).`);
    error.code = "TOURNAMENT_FOUNDATION_SUPABASE_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}

export function requireHomepageCurrentReadSource(env = process.env) {
  const state = homepageCurrentReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase Homepage current-tournament reads are unavailable (${state.reason}).`);
    error.code = "HOMEPAGE_CURRENT_SUPABASE_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}
