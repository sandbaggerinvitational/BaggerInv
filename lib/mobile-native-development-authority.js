const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));

const PREVIEW_SUPABASE_PROJECT_REF = "idgigvjjqkfbqjeredpb";
const PREVIEW_SUPABASE_ORIGIN = `https://${PREVIEW_SUPABASE_PROJECT_REF}.supabase.co`;
const PREVIEW_WORKBOOK_ID = "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts";
const NATIVE_AUTH_ANTI_ABUSE_MODE = "supabase-turnstile";

const SUPABASE_MOBILE_SELECTORS = Object.freeze([
  "HOME_READ_SOURCE",
  "TOURNAMENT_READ_SOURCE",
  "LEADERBOARDS_CORE_READ_SOURCE",
  "GUIDE_READ_SOURCE",
  "COURSE_PRESENTATION_READ_SOURCE",
  "SECONDARY_HISTORY_READ_SOURCE",
  "DRAFT_READ_SOURCE",
  "HISTORY_2026_READ_SOURCE",
  "COMPLETED_HISTORY_READ_SOURCE",
  "SCORING_READ_SOURCE",
  "MATCH_AUTHORIZATION_SOURCE",
  "SCORING_AUTHORITY",
]);

const PRODUCTION_MODE_FLAGS = Object.freeze([
  "PRODUCTION_FOUNDATION_ENABLED",
  "PRODUCTION_CUTOVER_ACTIVATION_ENABLED",
  "PRODUCTION_SHADOW_CANDIDATE_ENABLED",
  "PRODUCTION_STEP11_SCORING_REHEARSAL_ENABLED",
  "PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED",
  "PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED",
  "PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED",
  "PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED",
  "PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED",
]);

const PUBLIC_AUTHORITY = Object.freeze({
  mode: "isolated-development",
  authentication: "preview",
  identity: "preview",
  reads: "preview",
  scoringReads: "preview",
  scoringWrites: "preview",
  productionShadow: false,
  nativeAuth: "email-otp",
  antiAbuse: NATIVE_AUTH_ANTI_ABUSE_MODE,
  sessionCertification: "signed-proof-v1",
  authUserCreation: "disabled",
  requestRateLimit: "edge-ip+server-hash",
});

function exactOrigin(value) {
  try {
    const url = new URL(clean(value));
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.pathname !== "/" || url.search || url.hash) return "";
    return url.origin.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Proves the complete server-selected authority used by native development.
 * No individual Vercel environment label, hostname, or client value is enough
 * to satisfy this assertion on its own.
 */
export function mobileNativeDevelopmentAuthorityEnvironment(env = process.env) {
  const runtime = clean(env.VERCEL_ENV).toLowerCase();
  const ordinaryPreviewRuntime = runtime === "preview";

  const authOrigin = exactOrigin(env.NEXT_PUBLIC_SUPABASE_AUTH_URL);
  const identityOrigin = exactOrigin(env.SUPABASE_SCORING_MIRROR_URL);
  const sameSupabaseAuthority = Boolean(authOrigin) && authOrigin === identityOrigin;
  const previewSupabaseSelected = sameSupabaseAuthority &&
    authOrigin === PREVIEW_SUPABASE_ORIGIN;
  const previewWorkbookSelected = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID) ===
    PREVIEW_WORKBOOK_ID && clean(env.PREVIEW_SCORING_SHEET_ID) === PREVIEW_WORKBOOK_ID;
  const identitySelected = clean(env.PARTICIPANT_IDENTITY_AUTHORITY).toLowerCase() === "supabase" &&
    Boolean(clean(env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY)) &&
    Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const supabaseServiceSelected = truthy(env.SUPABASE_SCORING_MIRROR_ENABLED);
  const nativeAuthConfigured = clean(env.MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE).toLowerCase() ===
    NATIVE_AUTH_ANTI_ABUSE_MODE && truthy(env.PARTICIPANT_AUTH_CAPTCHA_REQUIRED) &&
    truthy(env.PARTICIPANT_AUTH_CAPTCHA_CONFIGURED) &&
    clean(env.NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY).length >= 10 &&
    clean(env.PARTICIPANT_AUTH_RATE_LIMIT_SECRET).length >= 32 &&
    clean(env.MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET).length >= 32 &&
    truthy(env.MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED) &&
    truthy(env.MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED);
  const selectorsApproved = SUPABASE_MOBILE_SELECTORS.every(
    (name) => clean(env[name]).toLowerCase() === "supabase",
  );
  const productionShadowRequested = truthy(env.PRODUCTION_SHADOW_CANDIDATE_ENABLED);
  const productionModeRequested = PRODUCTION_MODE_FLAGS.some((name) => truthy(env[name]));
  const noProductionFallback = !productionModeRequested;
  const available = ordinaryPreviewRuntime && previewSupabaseSelected && previewWorkbookSelected &&
    identitySelected && supabaseServiceSelected && nativeAuthConfigured && selectorsApproved && noProductionFallback;

  return {
    available,
    environment: available ? "preview"
      : runtime === "production" ? "production"
      : runtime === "preview" ? "preview"
      : "development",
    runtime,
    ordinaryPreviewRuntime,
    sameSupabaseAuthority,
    identityAuthority: identitySelected ? "supabase" : "unavailable",
    productionShadowRequested,
    nativeAuthConfigured,
    authority: available ? PUBLIC_AUTHORITY : null,
  };
}
