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
  const resolved = requested === "supabase" && previewDeployment && previewWorkbook && publicAuthConfigured && serverIdentityConfigured
    ? "supabase"
    : "passport";
  const shadowRequested = truthy(env.SUPABASE_PARTICIPANT_IDENTITY_SHADOW_ENABLED);
  const shadowEnabled = shadowRequested && previewDeployment && previewWorkbook && serverIdentityConfigured;
  const authRehearsalRequested = truthy(env.SUPABASE_PARTICIPANT_AUTH_REHEARSAL_ENABLED);
  const authRehearsalEnabled = authRehearsalRequested && previewDeployment && previewWorkbook &&
    serverIdentityConfigured && publicAuthConfigured && resolved === "passport";
  const participantAuthEnabled = previewDeployment && previewWorkbook && serverIdentityConfigured &&
    publicAuthConfigured && (authRehearsalEnabled || resolved === "supabase");
  const cutoverReady = requested !== "supabase" || resolved === "supabase";
  return {
    requested,
    resolved,
    shadowRequested,
    shadowEnabled,
    authRehearsalRequested,
    authRehearsalEnabled,
    participantAuthEnabled,
    cutoverReady,
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
      : !serverIdentityConfigured ? "auth-server-config-missing"
      : "passport-fallback",
    shadowReason: shadowEnabled ? "preview-shadow-enabled"
      : !shadowRequested ? "shadow-disabled"
      : !previewDeployment ? "production-hard-block"
      : !previewWorkbook ? "preview-workbook-required"
      : !serverIdentityConfigured ? "server-config-missing"
      : "shadow-disabled",
    authRehearsalReason: authRehearsalEnabled ? "single-participant-preview-rehearsal"
      : !authRehearsalRequested ? "auth-rehearsal-disabled"
      : !previewDeployment ? "production-hard-block"
      : !previewWorkbook ? "preview-workbook-required"
      : !serverIdentityConfigured || !publicAuthConfigured ? "auth-configuration-missing"
      : resolved !== "passport" ? "passport-authority-required"
      : "auth-rehearsal-disabled",
  };
}

export function requireParticipantIdentityAuthority(env = process.env) {
  const state = participantIdentityAuthorityEnvironment(env);
  if (state.requested === "supabase" && !state.cutoverReady) {
    const error = new Error("Supabase participant identity authority is unavailable in this runtime.");
    error.code = "IDENTITY_AUTHORITY_UNAVAILABLE";
    error.authority = state;
    throw error;
  }
  return state;
}
export function assertParticipantIdentityAdministrativeEnvironment(env = process.env) {
  const state = participantIdentityAuthorityEnvironment(env);
  if (!state.previewDeployment || !state.previewWorkbook || !state.serverIdentityConfigured) {
    throw new Error("Participant identity administration is unavailable outside the isolated Preview environment.");
  }
  return state;
}
