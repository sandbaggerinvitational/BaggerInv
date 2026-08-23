import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(true|yes|1|enabled)$/i.test(clean(value));
const AUTHORITIES = new Set(["passport", "supabase"]);

export function participantIdentityAuthorityEnvironment(env = process.env) {
  const configuredValue = clean(env.PARTICIPANT_IDENTITY_AUTHORITY);
  const rawRequested = clean(configuredValue || "passport").toLowerCase();
  const valid = AUTHORITIES.has(rawRequested);
  const requested = valid ? rawRequested : "invalid";
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (!previewWorkbookId || workbookId === previewWorkbookId);
  const publicAuthConfigured = Boolean(clean(env.NEXT_PUBLIC_SUPABASE_AUTH_URL)) &&
    Boolean(clean(env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY));
  const serverIdentityConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) &&
    Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const eligible = previewDeployment && previewWorkbook && publicAuthConfigured && serverIdentityConfigured;
  const blocked = previewDeployment && (!valid || (requested === "supabase" && !eligible));
  const resolved = !previewDeployment ? "passport" : blocked ? "unavailable" : requested;
  const shadowRequested = truthy(env.SUPABASE_PARTICIPANT_IDENTITY_SHADOW_ENABLED);
  const shadowEnabled = shadowRequested && previewDeployment && previewWorkbook && serverIdentityConfigured;
  const authRehearsalRequested = truthy(env.SUPABASE_PARTICIPANT_AUTH_REHEARSAL_ENABLED);
  const authRehearsalEnabled = authRehearsalRequested && previewDeployment && previewWorkbook &&
    serverIdentityConfigured && publicAuthConfigured && requested === "passport" && !blocked;
  const participantAuthEnabled = previewDeployment && previewWorkbook && serverIdentityConfigured &&
    publicAuthConfigured && !blocked && (authRehearsalEnabled || resolved === "supabase");
  const cutoverReady = valid && (requested !== "supabase" || resolved === "supabase" || !previewDeployment);
  return {
    configuredValue,
    requested,
    resolved,
    valid,
    eligible,
    blocked,
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
    productionBlocked: !previewDeployment && requested !== "passport",
    failureCode: blocked ? "IDENTITY_AUTHORITY_UNAVAILABLE" : "",
    reason: !previewDeployment ? (requested === "passport" ? "production-passport-authority" : "production-hard-block")
      : !valid ? "invalid-authority"
      : resolved === "supabase" ? "preview-supabase-identity"
      : requested !== "supabase" ? "preview-passport-authority"
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
  if (state.blocked) {
    const error = new Error("Supabase participant identity authority is unavailable in this runtime.");
    error.code = state.failureCode;
    error.status = 503;
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
