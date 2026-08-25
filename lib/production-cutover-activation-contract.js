import {
  exactProductionSupabaseUrl,
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";

export const PRODUCTION_CUTOVER_ACTIVATION_CONTRACT_VERSION =
  "production-cutover-activation-v1";
export const PRODUCTION_CANONICAL_ORIGIN = "https://baggerinv.com";
export const PRODUCTION_VERCEL_PROJECT_NAME = "bagger-inv";
export const PRODUCTION_VERCEL_PROJECT_ID = "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const exactSha = (value) => /^[0-9a-f]{40}$/.test(clean(value).toLowerCase());

export const PRODUCTION_CUTOVER_PHASES = Object.freeze([
  "STATIC_BACKEND",
  "READ_CUTOVER",
  "IDENTITY",
  "CURRENT_READS",
  "SCORING_PREPARE",
  "SCORING_COMMIT",
  "WORKERS",
  "ODDS_WAR_ROOM",
  "OBSERVATION",
]);

export const PRODUCTION_CUTOVER_CONFIGURATION_PLAN = Object.freeze({
  infrastructure: Object.freeze([
    "PRODUCTION_CUTOVER_ACTIVATION_ENABLED",
    "PRODUCTION_CUTOVER_PHASE",
    "PRODUCTION_FOUNDATION_ENABLED",
    "PRODUCTION_SUPABASE_PROJECT_REF",
    "PRODUCTION_SUPABASE_URL",
    "PRODUCTION_SUPABASE_SECRET_KEY",
    "GOOGLE_SHEETS_ID",
    "PRODUCTION_CANONICAL_DOMAIN",
    "PRODUCTION_CUTOVER_TOURNAMENT_ID",
    "PRODUCTION_CUTOVER_TOURNAMENT_YEAR",
    "PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA",
    "PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID",
    "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "PRODUCTION_GOOGLE_PRIVATE_KEY",
  ]),
  readSources: Object.freeze([
    "PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED",
    "COMPLETED_HISTORY_READ_SOURCE", "SECONDARY_HISTORY_READ_SOURCE",
    "HISTORICAL_COURSE_READ_SOURCE", "GUIDE_READ_SOURCE",
    "COURSE_PRESENTATION_READ_SOURCE", "DRAFT_READ_SOURCE",
    "PUBLISHED_ODDS_READ_SOURCE", "WAR_ROOM_INPUT_SOURCE",
    "PREDICTION_SETTINGS_READ_SOURCE",
    "TOURNAMENT_READ_SOURCE", "TOURNAMENT_FOUNDATION_READ_SOURCE",
    "HOMEPAGE_CURRENT_READ_SOURCE", "HOME_READ_SOURCE",
    "HISTORY_2026_READ_SOURCE", "MY_MATCH_READ_SOURCE",
    "GAME_CENTER_READ_SOURCE", "LEADERBOARDS_CORE_READ_SOURCE",
    "MATCH_AUTHORIZATION_SOURCE", "SCORING_READ_SOURCE",
    "MOMENTUM_READ_SOURCE", "STORYLINES_READ_SOURCE",
    "TOURNAMENT_INTELLIGENCE_READ_SOURCE",
    "PROJECTION_EDITORIAL_READ_SOURCE", "FINAL_RECAP_READ_SOURCE",
    "NET_SKINS_READ_SOURCE", "CALCUTTA_READ_SOURCE",
    "PRODUCTION_NET_SKINS_CONFIGURED", "PRODUCTION_CALCUTTA_CONFIGURED",
  ]),
  participantIdentity: Object.freeze([
    "PARTICIPANT_IDENTITY_AUTHORITY",
    "PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED",
    "PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED",
    "PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED",
    "NEXT_PUBLIC_SUPABASE_AUTH_URL",
    "NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY",
    "PARTICIPANT_AUTH_CAPTCHA_REQUIRED",
    "PARTICIPANT_AUTH_CAPTCHA_CONFIGURED",
    "PARTICIPANT_AUTH_RATE_LIMIT_SECRET",
  ]),
  scoring: Object.freeze([
    "SCORING_AUTHORITY", "PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED",
    "PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH",
    "PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED",
  ]),
  workersMirrors: Object.freeze([
    "PRODUCTION_SUPABASE_WORKERS_ENABLED",
    "PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED",
    "ROUND_SCORECARDS_ARCHIVE_ENABLED",
    "ROUND_SCORECARDS_ARCHIVE_WORKER_SECRET",
  ]),
  odds: Object.freeze([
    "ODDS_CALCULATION_INPUT_SOURCE", "ODDS_PUBLICATION_AUTHORITY",
    "PRODUCTION_SUPABASE_ODDS_CALCULATION_ENABLED",
    "PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED",
  ]),
  rollback: Object.freeze({
    beforeFirstSupabaseWrite: "deployment-and-configuration",
    afterFirstSupabaseWrite: "pause-enumerate-reconcile-new-epoch-then-configuration",
  }),
  firstCanonicalWriteBoundary:
    "commit_production_authority_epoch opens Supabase ingress for its new authority epoch",
});

function normalizedHttpsOrigin(value) {
  const candidate = clean(value);
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        (parsed.pathname !== "" && parsed.pathname !== "/") || parsed.search || parsed.hash) return "";
    return `https://${parsed.hostname.toLowerCase()}`;
  } catch {
    return "";
  }
}

function hostnameFromRequestUrl(value) {
  try {
    const parsed = new URL(clean(value));
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port
      ? parsed.hostname.toLowerCase()
      : "";
  } catch {
    return "";
  }
}

function normalizedHostname(value) {
  const candidate = clean(value).toLowerCase();
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        (parsed.pathname !== "" && parsed.pathname !== "/") || parsed.search || parsed.hash) return "";
    return parsed.hostname;
  } catch {
    return "";
  }
}

function requestHeader(request, name) {
  try { return clean(request?.headers?.get?.(name)); }
  catch { return ""; }
}

function phaseIndex(phase) {
  return PRODUCTION_CUTOVER_PHASES.indexOf(clean(phase).toUpperCase());
}

/**
 * Server-configuration-only eligibility for a future Production cutover. A
 * request body/header claiming environment=PRODUCTION is deliberately absent
 * from this contract and can never satisfy a resource assertion.
 */
export function productionCutoverActivationEnvironment(env = process.env) {
  const requested = truthy(env.PRODUCTION_CUTOVER_ACTIVATION_ENABLED);
  const deploymentApproved = clean(env.VERCEL_ENV).toLowerCase() === "production";
  const foundationEnabled = truthy(env.PRODUCTION_FOUNDATION_ENABLED);
  const projectRefApproved = clean(env.PRODUCTION_SUPABASE_PROJECT_REF) === PRODUCTION_SUPABASE_PROJECT_REF;
  const projectUrlApproved = exactProductionSupabaseUrl(env.PRODUCTION_SUPABASE_URL);
  const serviceCredentialConfigured = clean(env.PRODUCTION_SUPABASE_SECRET_KEY).length >= 20;
  const workbookApproved = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID) ===
    PRODUCTION_GOOGLE_WORKBOOK_ID;
  const canonicalOrigin = normalizedHttpsOrigin(env.PRODUCTION_CANONICAL_DOMAIN);
  const canonicalDomainApproved = canonicalOrigin === PRODUCTION_CANONICAL_ORIGIN;
  const tournamentIdApproved = clean(env.PRODUCTION_CUTOVER_TOURNAMENT_ID) === PRODUCTION_TOURNAMENT_ID;
  const tournamentYearApproved = Number(env.PRODUCTION_CUTOVER_TOURNAMENT_YEAR) === PRODUCTION_TOURNAMENT_YEAR;
  const expectedCommitSha = clean(env.PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA).toLowerCase();
  const runtimeCommitSha = clean(env.VERCEL_GIT_COMMIT_SHA).toLowerCase();
  const commitApproved = exactSha(expectedCommitSha) && expectedCommitSha === runtimeCommitSha;
  const expectedProjectId = clean(env.PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID);
  const runtimeProjectId = clean(env.VERCEL_PROJECT_ID);
  const vercelProjectApproved = expectedProjectId === PRODUCTION_VERCEL_PROJECT_ID &&
    runtimeProjectId === PRODUCTION_VERCEL_PROJECT_ID &&
    clean(env.VERCEL_PROJECT_NAME) === PRODUCTION_VERCEL_PROJECT_NAME;
  const phase = clean(env.PRODUCTION_CUTOVER_PHASE).toUpperCase();
  const phaseApproved = phaseIndex(phase) >= 0;
  const identityPhase = phaseApproved && phaseIndex(phase) >= phaseIndex("IDENTITY");
  const directorAuthApproved = !identityPhase || truthy(env.PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED);
  const adminSessionRevalidationApproved = !identityPhase || truthy(env.PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED);

  const allowed = requested && deploymentApproved && foundationEnabled && projectRefApproved &&
    projectUrlApproved && serviceCredentialConfigured && workbookApproved && canonicalDomainApproved &&
    tournamentIdApproved && tournamentYearApproved && commitApproved && vercelProjectApproved && phaseApproved &&
    directorAuthApproved && adminSessionRevalidationApproved;
  const reason = allowed ? "production-cutover-activation-ready"
    : !requested ? "activation-disabled"
    : !deploymentApproved ? "production-environment-required"
    : !foundationEnabled ? "production-foundation-required"
    : !projectRefApproved ? "production-project-ref-required"
    : !projectUrlApproved ? "production-project-url-required"
    : !serviceCredentialConfigured ? "production-service-credential-required"
    : !workbookApproved ? "production-workbook-required"
    : !canonicalDomainApproved ? "production-canonical-domain-required"
    : !tournamentIdApproved ? "production-tournament-id-required"
    : !tournamentYearApproved ? "production-tournament-year-required"
    : !commitApproved ? "exact-production-commit-required"
    : !vercelProjectApproved ? "exact-vercel-project-required"
    : !phaseApproved ? "cutover-phase-required"
    : !directorAuthApproved ? "production-director-auth-required"
    : !adminSessionRevalidationApproved ? "production-admin-session-revalidation-required"
    : "production-cutover-activation-unavailable";

  return {
    contractVersion: PRODUCTION_CUTOVER_ACTIVATION_CONTRACT_VERSION,
    requested,
    allowed,
    reason,
    phase: phaseApproved ? phase : "",
    phaseIndex: phaseApproved ? phaseIndex(phase) : -1,
    serverEnvironmentOnly: true,
    deploymentApproved,
    foundationEnabled,
    projectRefApproved,
    projectUrlApproved,
    serviceCredentialConfigured,
    workbookApproved,
    canonicalDomainApproved,
    tournamentIdApproved,
    tournamentYearApproved,
    commitApproved,
    vercelProjectApproved,
    phaseApproved,
    directorAuthApproved,
    adminSessionRevalidationApproved,
    resources: {
      projectRef: projectRefApproved ? PRODUCTION_SUPABASE_PROJECT_REF : "",
      projectHost: projectUrlApproved ? new URL(PRODUCTION_SUPABASE_URL).hostname : "",
      workbookId: workbookApproved ? PRODUCTION_GOOGLE_WORKBOOK_ID : "",
      canonicalOrigin: canonicalDomainApproved ? PRODUCTION_CANONICAL_ORIGIN : "",
      tournamentId: tournamentIdApproved ? PRODUCTION_TOURNAMENT_ID : "",
      tournamentYear: tournamentYearApproved ? PRODUCTION_TOURNAMENT_YEAR : null,
      commitSha: commitApproved ? runtimeCommitSha : "",
      vercelProjectId: vercelProjectApproved ? runtimeProjectId : "",
      vercelProjectName: vercelProjectApproved ? PRODUCTION_VERCEL_PROJECT_NAME : "",
    },
    configurationPlan: PRODUCTION_CUTOVER_CONFIGURATION_PLAN,
  };
}

export function assertProductionCutoverActivation({ env = process.env, requiredPhase } = {}) {
  const state = productionCutoverActivationEnvironment(env);
  const requiredIndex = requiredPhase ? phaseIndex(requiredPhase) : -1;
  if (!state.allowed || (requiredIndex >= 0 && state.phaseIndex < requiredIndex)) {
    const phaseReason = state.allowed && requiredIndex >= 0 ? "cutover-phase-not-reached" : state.reason;
    const error = new Error(`Production cutover activation is unavailable (${phaseReason}).`);
    error.code = "PRODUCTION_CUTOVER_RESOURCE_MISMATCH";
    error.status = 503;
    error.diagnostics = { ...state, reason: phaseReason, requiredPhase: requiredPhase || "" };
    throw error;
  }
  return state;
}

export function productionCutoverRequestEnvironment(
  request,
  env = process.env,
  { requireOrigin = !["GET", "HEAD"].includes(clean(request?.method || "GET").toUpperCase()) } = {},
) {
  const activation = productionCutoverActivationEnvironment(env);
  const expectedHostname = new URL(PRODUCTION_CANONICAL_ORIGIN).hostname;
  const requestHostname = hostnameFromRequestUrl(request?.url);
  const host = normalizedHostname(requestHeader(request, "host"));
  const forwardedHostValue = requestHeader(request, "x-forwarded-host").split(",")[0];
  const forwardedHost = forwardedHostValue ? normalizedHostname(forwardedHostValue) : expectedHostname;
  const forwardedProto = requestHeader(request, "x-forwarded-proto").toLowerCase();
  const originValue = requestHeader(request, "origin");
  const origin = originValue ? normalizedHttpsOrigin(originValue) : "";
  const exactHost = activation.allowed && requestHostname === expectedHostname && host === expectedHostname &&
    forwardedHost === expectedHostname;
  const exactOrigin = !originValue ? !requireOrigin : origin === PRODUCTION_CANONICAL_ORIGIN;
  const httpsApproved = !forwardedProto || forwardedProto === "https";
  const allowed = activation.allowed && exactHost && exactOrigin && httpsApproved;
  return {
    allowed,
    reason: allowed ? "production-cutover-request-ready"
      : !activation.allowed ? activation.reason
      : !exactHost ? "exact-production-request-host-required"
      : !exactOrigin ? "exact-production-request-origin-required"
      : !httpsApproved ? "https-request-required"
      : "production-cutover-request-unavailable",
    activation,
    exactHost,
    exactOrigin,
    httpsApproved,
  };
}

export function assertProductionCutoverRequest(request, env = process.env, options = {}) {
  const state = productionCutoverRequestEnvironment(request, env, options);
  if (!state.allowed) {
    const error = new Error(`Production cutover request is unavailable (${state.reason}).`);
    error.code = "PRODUCTION_CUTOVER_REQUEST_UNAVAILABLE";
    error.status = 403;
    error.diagnostics = state;
    throw error;
  }
  return state;
}

export function productionCutoverPhaseAtLeast(env, phase) {
  const state = productionCutoverActivationEnvironment(env);
  const requiredIndex = phaseIndex(phase);
  return state.allowed && requiredIndex >= 0 && state.phaseIndex >= requiredIndex;
}
