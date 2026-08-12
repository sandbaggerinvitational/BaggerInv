import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";

const clean = (value) => String(value ?? "").trim();

function stateFor(variable, env = process.env) {
  const requested = clean(env[variable] || "application").toLowerCase();
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (!previewWorkbookId || workbookId === previewWorkbookId);
  const credentialsConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) &&
    Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const eligible = previewDeployment && previewWorkbook && credentialsConfigured;
  const resolved = requested === "supabase" && eligible ? "supabase" : "application";
  const blocked = requested === "supabase" && previewDeployment && !eligible;
  return { requested, resolved, blocked, previewDeployment, previewWorkbook,
    productionIsolated, credentialsConfigured,
    reason: resolved === "supabase" ? `preview-supabase-${variable.toLowerCase()}`
      : requested !== "supabase" ? "application-configured"
      : !previewDeployment ? "production-hard-block"
      : !previewWorkbook ? "preview-workbook-required"
      : !credentialsConfigured ? "credentials-missing" : "application-fallback" };
}

export const momentumReadEnvironment = (env = process.env) => stateFor("MOMENTUM_READ_SOURCE", env);
export const storylinesReadEnvironment = (env = process.env) => stateFor("STORYLINES_READ_SOURCE", env);

export function requireMomentumReadSource(env = process.env) {
  const state = momentumReadEnvironment(env);
  if (state.blocked) throw Object.assign(new Error(`Supabase Momentum reads are unavailable (${state.reason}).`),
    { code: "MOMENTUM_SUPABASE_CONFIGURATION_REQUIRED" });
  return state;
}

export function requireStorylinesReadSource(env = process.env) {
  const state = storylinesReadEnvironment(env);
  if (state.blocked) throw Object.assign(new Error(`Supabase Storyline reads are unavailable (${state.reason}).`),
    { code: "STORYLINES_SUPABASE_CONFIGURATION_REQUIRED" });
  return state;
}
