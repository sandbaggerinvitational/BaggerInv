import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";
import { productionCutoverReadSourceEnvironment } from "./production-cutover-read-source.js";

const clean = (value) => String(value ?? "").trim();

function stateFor(variable, env = process.env) {
  const configuredSource = clean(env[variable] || "application").toLowerCase();
  const requested = ["application", "supabase"].includes(configuredSource) ? configuredSource : "invalid";
  const cutover = productionCutoverReadSourceEnvironment({
    env, variable, configuredValue: env[variable], defaultSource: "application",
    legacySource: "application", requiredPhase: "CURRENT_READS",
  });
  if (cutover.handled) return {
    requested: cutover.requested, resolved: cutover.resolved, blocked: cutover.blocked,
    productionShadowCandidate: false, productionCutover: cutover, fallbackUsed: false,
    reason: cutover.reason,
  };
  const preview = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbook = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbook = clean(env.PREVIEW_SCORING_SHEET_ID);
  const isolated = Boolean(workbook) && workbook !== PRODUCTION_SPREADSHEET_ID && (!previewWorkbook || workbook === previewWorkbook);
  const configured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) && Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const candidate = productionShadowCandidateReadEnvironment(env);
  const eligible = candidate.eligible || (preview && isolated && configured);
  const resolved = requested === "supabase" && eligible ? "supabase" : "application";
  return { requested, resolved, blocked: requested === "invalid" || (requested === "supabase" && preview && !eligible),
    productionShadowCandidate: candidate.eligible,
    reason: resolved === "supabase" ? (candidate.eligible ? "production-shadow-supabase" : "preview-supabase") : requested === "invalid" ? "invalid-source" : !preview ? "production-hard-block" : !isolated ? "preview-workbook-required" : !configured ? "credentials-missing" : "application-configured" };
}

export const tournamentIntelligenceReadEnvironment = (env = process.env) => stateFor("TOURNAMENT_INTELLIGENCE_READ_SOURCE", env);
export const projectionEditorialReadEnvironment = (env = process.env) => stateFor("PROJECTION_EDITORIAL_READ_SOURCE", env);
export const finalRecapReadEnvironment = (env = process.env) => stateFor("FINAL_RECAP_READ_SOURCE", env);

export function requireIntelligenceDerivedReadSources(env = process.env) {
  const sources = {
    tournamentIntelligence: tournamentIntelligenceReadEnvironment(env),
    projectionEditorial: projectionEditorialReadEnvironment(env),
    finalRecap: finalRecapReadEnvironment(env),
  };
  const blocked = Object.entries(sources).find(([, state]) => state.blocked);
  if (blocked) throw Object.assign(new Error(`Supabase ${blocked[0]} reads are unavailable (${blocked[1].reason}).`), { code: "INTELLIGENCE_SUPABASE_CONFIGURATION_REQUIRED" });
  return sources;
}
