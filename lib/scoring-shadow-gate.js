import { PRODUCTION_SPREADSHEET_ID, configuredSpreadsheetId } from "./spreadsheet-environment.js";

const truthy = (value) => String(value || "").trim().toLowerCase() === "true";

export function scoringShadowEnvironment(env = process.env) {
  const deployment = String(env.VERCEL_ENV || "").trim().toLowerCase();
  const localAllowed = deployment === "development" || (!deployment && env.NODE_ENV !== "production");
  const previewDeployment = deployment === "preview";
  const workbookId = String(env.GOOGLE_SHEETS_ID || "").trim();
  const previewWorkbook = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const urlConfigured = Boolean(String(env.SUPABASE_SCORING_MIRROR_URL || "").trim());
  const secretConfigured = Boolean(String(env.SUPABASE_SCORING_MIRROR_SECRET_KEY || "").trim());
  const enabled = truthy(env.SUPABASE_SCORING_MIRROR_ENABLED) &&
    (previewDeployment || localAllowed) && previewWorkbook && urlConfigured && secretConfigured;

  return {
    enabled,
    flagEnabled: truthy(env.SUPABASE_SCORING_MIRROR_ENABLED),
    deploymentAllowed: previewDeployment || localAllowed,
    previewDeployment,
    localDevelopment: localAllowed,
    previewWorkbook,
    credentialsConfigured: urlConfigured && secretConfigured,
    sourceWorkbookId: enabled ? workbookId : "",
    reason: enabled ? "enabled"
      : !truthy(env.SUPABASE_SCORING_MIRROR_ENABLED) ? "flag-disabled"
      : !(previewDeployment || localAllowed) ? "deployment-blocked"
      : !previewWorkbook ? "workbook-blocked"
      : !(urlConfigured && secretConfigured) ? "credentials-missing"
      : "disabled",
  };
}

export function assertScoringShadowAdministrativeEnvironment(env = process.env) {
  const state = scoringShadowEnvironment(env);
  if (!state.enabled) throw new Error(`Scoring shadow is unavailable (${state.reason}).`);
  return state;
}

export function scoringShadowWorkbookId() {
  const configured = configuredSpreadsheetId();
  return configured && configured !== PRODUCTION_SPREADSHEET_ID ? configured : "";
}
