import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";
import { productionShadowCandidateEnvironment } from "./production-shadow-candidate.js";
import {
  productionCutoverActivationEnvironment,
  productionCutoverPhaseAtLeast,
} from "./production-cutover-activation-contract.js";
import { exactProductionSupabaseUrl } from "./production-foundation-resource-contract.js";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(true|yes|1|enabled)$/i.test(clean(value));
const AUTHORITIES = new Set(["passport", "supabase"]);

const PRODUCTION_SHADOW_CANDIDATE_IDENTITY_OPERATIONS = new Set([
  "PRODUCTION_AUTH_USER_ADMIN",
  "prepare_production_auth_candidate",
  "authorize_production_auth_candidate_otp_request",
  "record_production_auth_candidate_otp_delivery",
  "authorize_production_auth_candidate_otp_verification",
  "record_production_auth_candidate_otp_verification",
  "recover_production_auth_candidate_otp_verification",
  "record_production_auth_candidate_logout",
  "read_production_auth_candidate",
  "read_production_auth_candidate_context_for_auth",
  "read_production_auth_candidate_player_context",
  "read_production_director_entitlement",
  "grant_production_director_entitlement",
  "revoke_production_director_entitlement",
]);

const PRODUCTION_CUTOVER_IDENTITY_OPERATIONS = new Set([
  "PRODUCTION_AUTH_USER_ADMIN",
  "authorize_production_participant_otp_request",
  "complete_production_participant_first_login",
  "record_production_participant_first_login_cleanup",
  "record_production_participant_otp_delivery",
  "authorize_production_participant_otp_verification",
  "record_production_participant_otp_verification",
  "recover_production_participant_otp_verification",
  "read_production_participant_context_for_auth",
  "read_production_participant_player_context",
  "record_production_participant_logout",
  "read_production_cutover_director_entitlement",
  "inspect_production_participant_identity_enrollment",
]);

export function participantIdentityAuthorityEnvironment(env = process.env) {
  const configuredValue = clean(env.PARTICIPANT_IDENTITY_AUTHORITY);
  const rawRequested = clean(configuredValue || "passport").toLowerCase();
  const valid = AUTHORITIES.has(rawRequested);
  const requested = valid ? rawRequested : "invalid";
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const productionDeployment = clean(env.VERCEL_ENV).toLowerCase() === "production";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (!previewWorkbookId || workbookId === previewWorkbookId);
  const publicAuthConfigured = Boolean(clean(env.NEXT_PUBLIC_SUPABASE_AUTH_URL)) &&
    Boolean(clean(env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY));
  const serverIdentityConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) &&
    Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const candidate = productionShadowCandidateEnvironment(env);
  const productionShadowCandidate = candidate.allowed;
  const productionCutover = productionCutoverActivationEnvironment(env);
  const productionCutoverRequested = productionDeployment && productionCutover.requested;
  const productionIdentityPhase = productionDeployment &&
    productionCutoverPhaseAtLeast(env, "IDENTITY");
  const productionAuthUrlApproved = exactProductionSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_AUTH_URL);
  const productionCaptchaRequired = truthy(env.PARTICIPANT_AUTH_CAPTCHA_REQUIRED);
  const productionCaptchaConfigured = truthy(env.PARTICIPANT_AUTH_CAPTCHA_CONFIGURED) &&
    Boolean(clean(env.NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY));
  const productionRateLimitConfigured = clean(env.PARTICIPANT_AUTH_RATE_LIMIT_SECRET).length >= 32;
  const productionUserCreationEnabled = truthy(env.PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED);
  const productionIdentityEligible = productionIdentityPhase && productionCutover.allowed &&
    valid && requested === "supabase" && productionAuthUrlApproved &&
    Boolean(clean(env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY)) &&
    Boolean(clean(env.PRODUCTION_SUPABASE_SECRET_KEY)) && productionCaptchaRequired &&
    productionCaptchaConfigured && productionRateLimitConfigured && productionUserCreationEnabled;
  const previewEligible = previewDeployment && previewWorkbook && publicAuthConfigured && serverIdentityConfigured;
  const eligible = productionDeployment
    ? productionIdentityEligible
    : candidate.requested ? productionShadowCandidate : previewEligible;
  const previewBlocked = previewDeployment && (candidate.requested
    ? (!valid || !productionShadowCandidate)
    : (!valid || (requested === "supabase" && !previewEligible)));
  const productionBlocked = productionDeployment && (
    (requested === "supabase" && !productionIdentityEligible) ||
    (productionCutoverRequested && (
      !productionCutover.allowed ||
      (productionIdentityPhase && !productionIdentityEligible)
    ))
  );
  const blocked = previewBlocked || productionBlocked;
  const resolved = productionDeployment
    ? (productionBlocked ? "unavailable" : productionIdentityEligible ? "supabase" : "passport")
    : !previewDeployment ? "passport"
    : blocked ? "unavailable"
    : productionShadowCandidate ? "supabase"
    : requested;
  const shadowRequested = truthy(env.SUPABASE_PARTICIPANT_IDENTITY_SHADOW_ENABLED);
  const shadowEnabled = shadowRequested && previewDeployment && !candidate.requested && previewWorkbook && serverIdentityConfigured;
  const authRehearsalRequested = truthy(env.SUPABASE_PARTICIPANT_AUTH_REHEARSAL_ENABLED);
  const authRehearsalEnabled = authRehearsalRequested && previewDeployment && !candidate.requested && previewWorkbook &&
    serverIdentityConfigured && publicAuthConfigured && requested === "passport" && !blocked;
  const participantAuthEnabled = productionIdentityEligible || productionShadowCandidate || (previewDeployment && previewWorkbook && serverIdentityConfigured &&
    publicAuthConfigured && !blocked && (authRehearsalEnabled || resolved === "supabase"));
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
    productionShadowCandidateRequested: candidate.requested,
    productionShadowCandidate,
    productionShadowCandidateReason: candidate.reason,
    productionCutoverRequested,
    productionCutoverIdentity: productionIdentityEligible,
    productionIdentityPhase,
    productionAuthUrlApproved,
    productionCaptchaRequired,
    productionCaptchaConfigured,
    productionRateLimitConfigured,
    productionUserCreationEnabled,
    productionBlocked,
    failureCode: blocked ? "IDENTITY_AUTHORITY_UNAVAILABLE" : "",
    reason: productionDeployment ? (productionIdentityEligible ? "production-cutover-supabase-identity"
      : productionBlocked ? (!productionCutover.allowed ? productionCutover.reason
        : !valid || requested !== "supabase" ? "production-supabase-identity-selection-required"
        : !productionAuthUrlApproved ? "production-auth-url-required"
        : !publicAuthConfigured ? "production-auth-public-config-missing"
        : !clean(env.PRODUCTION_SUPABASE_SECRET_KEY) ? "production-auth-server-config-missing"
        : !productionCaptchaRequired ? "production-captcha-required"
        : !productionCaptchaConfigured ? "production-captcha-config-missing"
        : !productionRateLimitConfigured ? "production-auth-rate-limit-config-missing"
        : !productionUserCreationEnabled ? "production-controlled-user-creation-required"
        : "production-identity-unavailable")
      : requested === "passport" ? "production-passport-authority" : "production-hard-block")
      : !previewDeployment ? "non-preview-passport-authority"
      : candidate.requested ? (productionShadowCandidate ? "production-shadow-candidate-supabase-identity" : candidate.reason)
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
export function assertParticipantIdentityAdministrativeEnvironment(env = process.env, { operation = "" } = {}) {
  const state = participantIdentityAuthorityEnvironment(env);
  if (state.productionCutoverIdentity) {
    if (PRODUCTION_CUTOVER_IDENTITY_OPERATIONS.has(clean(operation))) return state;
    const error = new Error("Participant identity operation is not allowed for the Production cutover.");
    error.code = "PRODUCTION_CUTOVER_IDENTITY_OPERATION_FORBIDDEN";
    error.status = 403;
    error.authority = state;
    throw error;
  }
  if (state.productionShadowCandidate) {
    if (PRODUCTION_SHADOW_CANDIDATE_IDENTITY_OPERATIONS.has(clean(operation))) return state;
    const error = new Error("Participant identity operation is not allowed for the Production-shadow candidate.");
    error.code = "PRODUCTION_SHADOW_IDENTITY_OPERATION_FORBIDDEN";
    error.status = 403;
    error.authority = state;
    throw error;
  }
  if (!state.previewDeployment || !state.previewWorkbook || !state.serverIdentityConfigured) {
    throw new Error("Participant identity administration is unavailable outside the isolated Preview environment.");
  }
  return state;
}

export function productionShadowCandidateIdentityOperationAllowed(operation) {
  return PRODUCTION_SHADOW_CANDIDATE_IDENTITY_OPERATIONS.has(clean(operation));
}
