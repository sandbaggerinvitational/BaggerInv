import {
  exactProductionSupabaseUrl,
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "./production-foundation-resource-contract.js";

export const PRODUCTION_SHADOW_CANDIDATE_CONTRACT_VERSION =
  "production-shadow-candidate-v1";
export const PRODUCTION_SHADOW_CANDIDATE_SCORING_READ_ONLY_CODE =
  "PRODUCTION_SHADOW_CANDIDATE_SCORING_READ_ONLY";

export const PRODUCTION_CANONICAL_HOSTNAME = "baggerinv.com";
export const PRODUCTION_VERCEL_PROJECT_NAME = "bagger-inv";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));

function normalizedHostname(value) {
  const input = clean(value).toLowerCase();
  if (!input) return "";
  try {
    const parsed = new URL(input.includes("://") ? input : `https://${input}`);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        (parsed.pathname !== "" && parsed.pathname !== "/") || parsed.search || parsed.hash) return "";
    return parsed.hostname;
  } catch {
    return "";
  }
}

function requestUrlHostname(value) {
  try {
    const parsed = new URL(clean(value));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return "";
    return parsed.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function exactCandidateHostname(configured, runtime) {
  const configuredHostname = normalizedHostname(configured);
  const runtimeHostname = normalizedHostname(runtime);
  return Boolean(configuredHostname) &&
    configuredHostname === runtimeHostname &&
    configuredHostname.endsWith(".vercel.app") &&
    configuredHostname !== PRODUCTION_CANONICAL_HOSTNAME &&
    configuredHostname !== `www.${PRODUCTION_CANONICAL_HOSTNAME}`;
}

function exactCommitSha(value) {
  return /^[0-9a-f]{40}$/.test(clean(value).toLowerCase());
}

function requestHeader(request, name) {
  try { return clean(request?.headers?.get?.(name)); }
  catch { return ""; }
}

/**
 * Exact, non-authoritative scope for a Vercel Preview deployment that uses the
 * dormant Production data/Auth plane. This is deliberately separate from both
 * ordinary Preview isolation and live Production source selection.
 */
export function productionShadowCandidateEnvironment(env = process.env) {
  const requested = truthy(env.PRODUCTION_SHADOW_CANDIDATE_ENABLED);
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const configuredHostname = normalizedHostname(env.PRODUCTION_SHADOW_CANDIDATE_HOSTNAME);
  const runtimeHostname = normalizedHostname(env.VERCEL_URL);
  const branchHostname = normalizedHostname(env.VERCEL_BRANCH_URL);
  const hostnameApproved = exactCandidateHostname(configuredHostname, branchHostname);
  const deploymentHostnameApproved = Boolean(runtimeHostname) && runtimeHostname.endsWith(".vercel.app") &&
    runtimeHostname !== PRODUCTION_CANONICAL_HOSTNAME && runtimeHostname !== `www.${PRODUCTION_CANONICAL_HOSTNAME}`;
  const expectedCommitSha = clean(env.PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA).toLowerCase();
  const runtimeCommitSha = clean(env.VERCEL_GIT_COMMIT_SHA).toLowerCase();
  const commitApproved = exactCommitSha(expectedCommitSha) && expectedCommitSha === runtimeCommitSha;
  const expectedProjectId = clean(env.PRODUCTION_SHADOW_CANDIDATE_EXPECTED_VERCEL_PROJECT_ID);
  const runtimeProjectId = clean(env.VERCEL_PROJECT_ID);
  const projectIdentityApproved = Boolean(expectedProjectId) && expectedProjectId === runtimeProjectId &&
    clean(env.VERCEL_PROJECT_NAME) === PRODUCTION_VERCEL_PROJECT_NAME;
  const foundationEnabled = truthy(env.PRODUCTION_FOUNDATION_ENABLED);
  const projectRefApproved = clean(env.PRODUCTION_SUPABASE_PROJECT_REF) === PRODUCTION_SUPABASE_PROJECT_REF;
  const projectUrlApproved = exactProductionSupabaseUrl(env.PRODUCTION_SUPABASE_URL);
  const workbookApproved = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID) ===
    PRODUCTION_GOOGLE_WORKBOOK_ID;
  const serverCredentialsConfigured = clean(env.PRODUCTION_SUPABASE_SECRET_KEY).length >= 20;
  const publicAuthUrlApproved = exactProductionSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_AUTH_URL);
  const publicAuthKeyConfigured = clean(env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY).length >= 20;
  const authEnabled = truthy(env.PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED);
  const scoringAuthorityApproved = clean(env.SCORING_AUTHORITY || "google").toLowerCase() === "google";
  const identityRequested = clean(env.PARTICIPANT_IDENTITY_AUTHORITY).toLowerCase() === "supabase";
  const captchaRequired = truthy(env.PARTICIPANT_AUTH_CAPTCHA_REQUIRED);
  const captchaConfigured = truthy(env.PARTICIPANT_AUTH_CAPTCHA_CONFIGURED);
  const captchaSiteKeyConfigured = clean(env.NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY).length >= 10;
  const authRateLimitConfigured = clean(env.PARTICIPANT_AUTH_RATE_LIMIT_SECRET).length >= 32;
  const noAuthoritativeFeatures = !truthy(env.PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED) &&
    !truthy(env.SUPABASE_SCORING_MIRROR_ENABLED);

  const allowed = requested && previewDeployment && hostnameApproved && deploymentHostnameApproved &&
    commitApproved && projectIdentityApproved && foundationEnabled &&
    projectRefApproved && projectUrlApproved && workbookApproved && serverCredentialsConfigured &&
    publicAuthUrlApproved && publicAuthKeyConfigured && authEnabled && scoringAuthorityApproved &&
    identityRequested && captchaRequired && captchaConfigured && captchaSiteKeyConfigured && authRateLimitConfigured &&
    noAuthoritativeFeatures;

  const reason = allowed ? "production-shadow-candidate-ready"
    : !requested ? "candidate-disabled"
    : !previewDeployment ? "preview-deployment-required"
    : !hostnameApproved ? "stable-branch-hostname-required"
    : !deploymentHostnameApproved ? "deployment-hostname-required"
    : !commitApproved ? "exact-candidate-commit-required"
    : !projectIdentityApproved ? "exact-vercel-project-required"
    : !foundationEnabled ? "production-foundation-required"
    : !projectRefApproved ? "production-project-ref-required"
    : !projectUrlApproved ? "production-project-url-required"
    : !workbookApproved ? "production-workbook-required"
    : !serverCredentialsConfigured ? "production-server-credentials-required"
    : !publicAuthUrlApproved ? "production-public-auth-url-required"
    : !publicAuthKeyConfigured ? "production-public-auth-key-required"
    : !authEnabled ? "candidate-auth-disabled"
    : !scoringAuthorityApproved ? "google-scoring-authority-required"
    : !identityRequested ? "candidate-supabase-identity-required"
    : !captchaRequired ? "captcha-required"
    : !captchaConfigured ? "captcha-configuration-required"
    : !captchaSiteKeyConfigured ? "captcha-site-key-required"
    : !authRateLimitConfigured ? "auth-rate-limit-secret-required"
    : !noAuthoritativeFeatures ? "authoritative-feature-forbidden"
    : "production-shadow-candidate-unavailable";

  return {
    contractVersion: PRODUCTION_SHADOW_CANDIDATE_CONTRACT_VERSION,
    requested,
    allowed,
    reason,
    previewDeployment,
    hostnameApproved,
    deploymentHostnameApproved,
    commitApproved,
    projectIdentityApproved,
    configuredHostname: hostnameApproved ? configuredHostname : "",
    runtimeHostname: hostnameApproved ? runtimeHostname : "",
    foundationEnabled,
    projectRefApproved,
    projectUrlApproved,
    workbookApproved,
    serverCredentialsConfigured,
    publicAuthUrlApproved,
    publicAuthKeyConfigured,
    authEnabled,
    scoringAuthorityApproved,
    identityRequested,
    captchaRequired,
    captchaConfigured,
    captchaSiteKeyConfigured,
    authRateLimitConfigured,
    noAuthoritativeFeatures,
    resources: {
      supabaseProjectRef: projectRefApproved ? PRODUCTION_SUPABASE_PROJECT_REF : "",
      supabaseHost: projectUrlApproved ? `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` : "",
      sourceWorkbookId: workbookApproved ? PRODUCTION_GOOGLE_WORKBOOK_ID : "",
      candidateHostname: hostnameApproved ? configuredHostname : "",
      deploymentHostname: deploymentHostnameApproved ? runtimeHostname : "",
      commitSha: commitApproved ? runtimeCommitSha : "",
      vercelProjectId: projectIdentityApproved ? runtimeProjectId : "",
      vercelProjectName: projectIdentityApproved ? PRODUCTION_VERCEL_PROJECT_NAME : "",
    },
    safety: {
      liveProductionSelected: false,
      scoringAuthority: "google",
      scoringIngressEnabled: false,
      googleMirrorDeliveryEnabled: false,
      oddsPublicationEnabled: false,
      publicApplicationReadCutover: false,
      authUserCreationEnabled: false,
    },
  };
}

/**
 * Bind the dormant candidate to the exact stable alias used by the request.
 * Safe navigation reads may omit Origin, but mutations must supply the exact
 * same-origin value. Canonical Production and per-deployment aliases fail.
 */
export function productionShadowCandidateRequestEnvironment(
  request,
  env = process.env,
  { requireOrigin = !["GET", "HEAD"].includes(clean(request?.method || "GET").toUpperCase()) } = {},
) {
  const candidate = productionShadowCandidateEnvironment(env);
  const expectedHostname = candidate.resources.candidateHostname;
  const requestHostname = requestUrlHostname(request?.url);
  const host = normalizedHostname(requestHeader(request, "host"));
  const forwardedHostValue = requestHeader(request, "x-forwarded-host").split(",")[0];
  const forwardedHost = forwardedHostValue ? normalizedHostname(forwardedHostValue) : expectedHostname;
  const originValue = requestHeader(request, "origin");
  const originHostname = originValue ? normalizedHostname(originValue) : "";
  const forwardedProto = requestHeader(request, "x-forwarded-proto").toLowerCase();
  const exactHost = candidate.allowed && Boolean(expectedHostname) &&
    requestHostname === expectedHostname && host === expectedHostname && forwardedHost === expectedHostname;
  const exactOrigin = !originValue ? !requireOrigin : originHostname === expectedHostname;
  const httpsApproved = !forwardedProto || forwardedProto === "https";
  const allowed = candidate.allowed && exactHost && exactOrigin && httpsApproved &&
    expectedHostname !== PRODUCTION_CANONICAL_HOSTNAME && expectedHostname !== `www.${PRODUCTION_CANONICAL_HOSTNAME}`;
  const reason = allowed ? "production-shadow-candidate-request-ready"
    : !candidate.allowed ? candidate.reason
    : !exactHost ? "exact-request-host-required"
    : !exactOrigin ? "exact-request-origin-required"
    : !httpsApproved ? "https-request-required"
    : "production-shadow-candidate-request-unavailable";
  return { allowed, reason, candidate, exactHost, exactOrigin, httpsApproved };
}

export function assertProductionShadowCandidateRequest(request, env = process.env, options = {}) {
  const state = productionShadowCandidateRequestEnvironment(request, env, options);
  if (!state.allowed) {
    const error = new Error(`Production-shadow candidate request is unavailable (${state.reason}).`);
    error.code = "PRODUCTION_SHADOW_CANDIDATE_REQUEST_UNAVAILABLE";
    error.status = 404;
    error.diagnostics = state;
    throw error;
  }
  return state;
}

/**
 * Candidate scoring is intentionally observation-only.  This decision is
 * request scoped so a malformed candidate deployment also fails closed, while
 * ordinary Preview and live Production retain their existing scoring paths.
 * Callers must evaluate it before reading a request body, issuing a session,
 * consuming ingress/rate-limit state, or invoking either persistence adapter.
 */
export function productionShadowCandidateScoringMutationDecision(request, env = process.env) {
  const candidate = productionShadowCandidateEnvironment(env);
  if (!candidate.requested || !candidate.previewDeployment) {
    return Object.freeze({
      blocked: false,
      code: "",
      status: 0,
      reason: candidate.previewDeployment ? "candidate-not-requested" : "not-a-candidate-preview",
    });
  }

  const requestState = productionShadowCandidateRequestEnvironment(request, env, { requireOrigin: true });
  if (!requestState.allowed) {
    return Object.freeze({
      blocked: true,
      code: "PRODUCTION_SHADOW_CANDIDATE_REQUEST_UNAVAILABLE",
      status: 404,
      reason: requestState.reason,
    });
  }

  return Object.freeze({
    blocked: true,
    code: PRODUCTION_SHADOW_CANDIDATE_SCORING_READ_ONLY_CODE,
    status: 409,
    reason: "production-shadow-candidate-scoring-read-only",
  });
}

/**
 * Migrated read selectors may opt into Production Supabase only after the
 * request-scoped server transport has replaced every Preview mirror value.
 * The marker alone is never sufficient.
 */
export function productionShadowCandidateReadEnvironment(env = process.env) {
  const candidate = productionShadowCandidateEnvironment(env);
  const transportAsserted = truthy(env.PRODUCTION_SHADOW_CANDIDATE_TRANSPORT_ASSERTED);
  const exactUrl = exactProductionSupabaseUrl(env.SUPABASE_SCORING_MIRROR_URL);
  const productionSecret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  const exactSecret = productionSecret.length >= 20 &&
    clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY) === productionSecret;
  const eligible = candidate.allowed && transportAsserted && exactUrl && exactSecret;
  return Object.freeze({
    requested: candidate.requested,
    eligible,
    transportAsserted,
    exactUrl,
    exactSecret,
    projectRef: eligible ? PRODUCTION_SUPABASE_PROJECT_REF : "",
    workbookId: eligible ? PRODUCTION_GOOGLE_WORKBOOK_ID : "",
    reason: eligible ? "production-shadow-candidate-read-ready"
      : !candidate.allowed ? candidate.reason
      : !transportAsserted ? "candidate-request-transport-required"
      : !exactUrl ? "production-read-project-required"
      : !exactSecret ? "production-read-secret-required"
      : "production-shadow-candidate-read-unavailable",
  });
}

export function assertProductionShadowCandidate(env = process.env) {
  const state = productionShadowCandidateEnvironment(env);
  if (!state.allowed) {
    const error = new Error(`Production-shadow candidate is unavailable (${state.reason}).`);
    error.code = "PRODUCTION_SHADOW_CANDIDATE_UNAVAILABLE";
    error.status = 503;
    error.diagnostics = state;
    throw error;
  }
  return state;
}
