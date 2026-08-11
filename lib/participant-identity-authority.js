import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(true|yes|1|enabled)$/i.test(clean(value));

export function participantIdentityAuthorityEnvironment(env = process.env) {
  const requested = clean(env.PARTICIPANT_IDENTITY_AUTHORITY || "passport").toLowerCase();
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (!previewWorkbookId || workbookId === previewWorkbookId);
  const publicAuthConfigured = Boolean(clean(env.NEXT_PUBLIC_SUPABASE_AUTH_URL)) &&
    Boolean(clean(env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY));
  const serverIdentityConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) &&
    Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const resolved = requested === "supabase" && previewDeployment && previewWorkbook && publicAuthConfigured
    ? "supabase"
    : "passport";
  const shadowRequested = truthy(env.SUPABASE_PARTICIPANT_IDENTITY_SHADOW_ENABLED);
  const shadowEnabled = shadowRequested && previewDeployment && previewWorkbook && serverIdentityConfigured;
  return {
    requested,
    resolved,
    shadowRequested,
    shadowEnabled,
    previewDeployment,
    previewWorkbook,
    productionIsolated,
    publicAuthConfigured,
    serverIdentityConfigured,
    productionBlocked: requested === "supabase" && !previewDeployment,
    reason: resolved === "supabase" ? "preview-supabase-identity"
      : requested !== "supabase" ? "passport-configured"
      : !previewDeployment ? "production-hard-block"
      : !previewWorkbook ? "preview-workbook-required"
      : !publicAuthConfigured ? "auth-public-config-missing"
      : "passport-fallback",
    shadowReason: shadowEnabled ? "preview-shadow-enabled"
      : !shadowRequested ? "shadow-disabled"
      : !previewDeployment ? "production-hard-block"
      : !previewWorkbook ? "preview-workbook-required"
      : !serverIdentityConfigured ? "server-config-missing"
      : "shadow-disabled",
  };
}
export function assertParticipantIdentityAdministrativeEnvironment(env = process.env) {
  const state = participantIdentityAuthorityEnvironment(env);
  if (!state.previewDeployment || !state.previewWorkbook || !state.serverIdentityConfigured) {
    throw new Error("Participant identity administration is unavailable outside the isolated Preview environment.");
  }
  return state;
}
