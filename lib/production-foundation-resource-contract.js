export const PRODUCTION_FOUNDATION_CONTRACT_VERSION =
  "production-foundation-resource-v1";

export const PRODUCTION_SUPABASE_PROJECT_REF = "ymqhhtxaywtqllynrmxe";
export const PRODUCTION_SUPABASE_URL =
  `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;
export const PRODUCTION_GOOGLE_WORKBOOK_ID =
  "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";
export const PRODUCTION_TOURNAMENT_ID = "2026";
export const PRODUCTION_TOURNAMENT_YEAR = 2026;
export const PRODUCTION_COMPLETED_HISTORY_YEARS = Object.freeze([
  2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
]);

const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(String(value ?? "").trim());
const clean = (value) => String(value ?? "").trim();

const OPERATION_POLICIES = Object.freeze({
  CATALOG_INSPECT: Object.freeze({
    googleRead: false,
    supabaseRead: true,
    supabaseWrite: false,
  }),
  SCHEMA_APPLY: Object.freeze({
    googleRead: false,
    supabaseRead: true,
    supabaseWrite: true,
  }),
  SHADOW_IMPORT: Object.freeze({
    googleRead: true,
    supabaseRead: true,
    supabaseWrite: true,
    scopeKind: "CURRENT_TOURNAMENT",
  }),
  PROJECTION_SYNC: Object.freeze({
    googleRead: true,
    supabaseRead: true,
    supabaseWrite: true,
  }),
  SHADOW_PARITY: Object.freeze({
    googleRead: true,
    supabaseRead: true,
    supabaseWrite: false,
    scopeKind: "CURRENT_TOURNAMENT",
  }),
  COMPLETED_HISTORY_IMPORT: Object.freeze({
    googleRead: true,
    supabaseRead: true,
    supabaseWrite: true,
    scopeKind: "COMPLETED_HISTORY",
  }),
  COMPLETED_HISTORY_READBACK: Object.freeze({
    googleRead: false,
    supabaseRead: true,
    supabaseWrite: false,
    scopeKind: "COMPLETED_HISTORY",
  }),
  CURRENT_TOURNAMENT_SHADOW_IMPORT: Object.freeze({
    googleRead: true,
    supabaseRead: true,
    supabaseWrite: true,
    scopeKind: "CURRENT_TOURNAMENT",
  }),
  CURRENT_SCORING_SHADOW_IMPORT: Object.freeze({
    googleRead: true,
    supabaseRead: true,
    supabaseWrite: true,
    scopeKind: "CURRENT_TOURNAMENT",
  }),
  PRODUCTION_PRESENTATION_SHADOW_IMPORT: Object.freeze({
    googleRead: true,
    supabaseRead: true,
    supabaseWrite: true,
    scopeKind: "CURRENT_TOURNAMENT",
  }),
  CURRENT_SHADOW_READBACK: Object.freeze({
    googleRead: false,
    supabaseRead: true,
    supabaseWrite: false,
    scopeKind: "CURRENT_TOURNAMENT",
  }),
});

const LEGACY_FOUNDATION_OPERATION_NAMES = Object.freeze([
  "CATALOG_INSPECT",
  "SCHEMA_APPLY",
  "SHADOW_IMPORT",
  "PROJECTION_SYNC",
  "SHADOW_PARITY",
]);

function exactValue(value, expected) {
  return String(value ?? "") === String(expected);
}

export function exactProductionSupabaseUrl(value) {
  if (!exactValue(value, PRODUCTION_SUPABASE_URL)) return false;
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === "https:" &&
      parsed.hostname === `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` &&
      parsed.host === `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      (parsed.pathname === "" || parsed.pathname === "/") &&
      !parsed.search &&
      !parsed.hash;
  } catch {
    return false;
  }
}

function operationPolicy(operation) {
  const normalized = clean(operation).toUpperCase();
  return {
    operation: normalized,
    policy: OPERATION_POLICIES[normalized] || null,
  };
}

function productionTournamentScope({ operationPolicy: policy, tournamentId, tournamentYear }) {
  const numericYear = typeof tournamentYear === "number"
    ? tournamentYear
    : Number(String(tournamentYear ?? "").trim());
  const normalizedTournamentId = clean(tournamentId);
  const numericTournamentId = Number(normalizedTournamentId);
  const scopeKind = policy?.scopeKind || "CURRENT_TOURNAMENT";
  const completedHistory = scopeKind === "COMPLETED_HISTORY";
  const yearApproved = completedHistory
    ? Number.isInteger(numericYear) && PRODUCTION_COMPLETED_HISTORY_YEARS.includes(numericYear)
    : numericYear === PRODUCTION_TOURNAMENT_YEAR;
  const idApproved = completedHistory
    ? Number.isInteger(numericTournamentId) && PRODUCTION_COMPLETED_HISTORY_YEARS.includes(numericTournamentId)
    : normalizedTournamentId === PRODUCTION_TOURNAMENT_ID;
  const pairApproved = idApproved && yearApproved && normalizedTournamentId === String(numericYear);
  return {
    scopeKind,
    tournamentId: normalizedTournamentId,
    tournamentYear: Number.isInteger(numericYear) ? numericYear : null,
    tournamentIdApproved: idApproved,
    tournamentYearApproved: yearApproved,
    tournamentPairApproved: pairApproved,
  };
}

function sourceAuthorityState(env) {
  const scoring = clean(env.SCORING_AUTHORITY || "google").toLowerCase();
  const identity = clean(env.PARTICIPANT_IDENTITY_AUTHORITY || "passport").toLowerCase();
  return {
    scoring,
    participantIdentity: identity,
    safe: scoring === "google" && identity === "passport",
  };
}

/**
 * Describes the dormant Production foundation transport without selecting it
 * for any application consumer. Every Production operation must supply an
 * exact resource tuple; caller-provided environment labels are never accepted
 * as resource proof on their own.
 */
export function productionFoundationResourceEnvironment({
  env = process.env,
  operation,
  tournamentId,
  tournamentYear,
} = {}) {
  const deploymentApproved = env.VERCEL_ENV === "production";
  const explicitlyEnabled = truthy(env.PRODUCTION_FOUNDATION_ENABLED);
  const projectRefApproved = exactValue(
    env.PRODUCTION_SUPABASE_PROJECT_REF,
    PRODUCTION_SUPABASE_PROJECT_REF,
  );
  const projectUrlApproved = exactProductionSupabaseUrl(
    env.PRODUCTION_SUPABASE_URL,
  );
  const credentialsConfigured = Boolean(clean(env.PRODUCTION_SUPABASE_SECRET_KEY));
  const workbookApproved = exactValue(
    env.GOOGLE_SHEETS_ID,
    PRODUCTION_GOOGLE_WORKBOOK_ID,
  );
  const selectedOperation = operationPolicy(operation);
  const operationApproved = Boolean(selectedOperation.policy);
  const configuredTournamentId = tournamentId ?? env.PRODUCTION_FOUNDATION_TOURNAMENT_ID ?? PRODUCTION_TOURNAMENT_ID;
  const configuredTournamentYear = tournamentYear ?? env.PRODUCTION_FOUNDATION_TOURNAMENT_YEAR ?? PRODUCTION_TOURNAMENT_YEAR;
  const tournamentScope = productionTournamentScope({
    operationPolicy: selectedOperation.policy,
    tournamentId: configuredTournamentId,
    tournamentYear: configuredTournamentYear,
  });
  const { tournamentIdApproved, tournamentYearApproved, tournamentPairApproved } = tournamentScope;
  const authorities = sourceAuthorityState(env);
  const noAuthoritativeFeatureFlags = !truthy(env.PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED) &&
    !truthy(env.PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED);

  const allowed = explicitlyEnabled &&
    deploymentApproved &&
    projectRefApproved &&
    projectUrlApproved &&
    credentialsConfigured &&
    workbookApproved &&
    tournamentIdApproved &&
    tournamentYearApproved &&
    tournamentPairApproved &&
    operationApproved &&
    authorities.safe &&
    noAuthoritativeFeatureFlags;

  const reason = allowed ? "production-foundation-shadow-ready"
    : !explicitlyEnabled ? "foundation-disabled"
    : !deploymentApproved ? "production-environment-required"
    : !projectRefApproved ? "production-project-ref-required"
    : !projectUrlApproved ? "production-project-url-required"
    : !credentialsConfigured ? "production-service-credentials-required"
    : !workbookApproved ? "production-workbook-required"
    : !tournamentIdApproved ? "production-tournament-id-required"
    : !tournamentYearApproved ? "production-tournament-year-required"
    : !tournamentPairApproved ? "production-tournament-scope-mismatch"
    : !operationApproved ? "foundation-operation-not-allowed"
    : !authorities.safe ? "legacy-production-authorities-required"
    : !noAuthoritativeFeatureFlags ? "authoritative-feature-flag-forbidden"
    : "production-foundation-unavailable";

  return {
    contractVersion: PRODUCTION_FOUNDATION_CONTRACT_VERSION,
    allowed,
    reason,
    operation: selectedOperation.operation,
    operationApproved,
    policy: selectedOperation.policy ? {
      googleRead: selectedOperation.policy.googleRead,
      supabaseRead: selectedOperation.policy.supabaseRead,
      supabaseWrite: selectedOperation.policy.supabaseWrite,
      googleWrite: false,
      scoringIngress: false,
      publicRead: false,
      oddsPublication: false,
      authUserCreation: false,
      authoritative: false,
    } : null,
    deploymentApproved,
    explicitlyEnabled,
    projectRefApproved,
    projectUrlApproved,
    credentialsConfigured,
    workbookApproved,
    tournamentIdApproved,
    tournamentYearApproved,
    tournamentPairApproved,
    sourceAuthoritiesApproved: authorities.safe,
    noAuthoritativeFeatureFlags,
    tournamentScopeKind: tournamentScope.scopeKind,
    authority: {
      currentTournament: "google",
      scoring: authorities.scoring,
      participantIdentity: authorities.participantIdentity,
      target: "supabase-shadow",
    },
    resources: {
      supabaseProjectRef: projectRefApproved ? PRODUCTION_SUPABASE_PROJECT_REF : "",
      supabaseHost: projectUrlApproved ? `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` : "",
      sourceWorkbookId: workbookApproved ? PRODUCTION_GOOGLE_WORKBOOK_ID : "",
      tournamentId: tournamentPairApproved ? tournamentScope.tournamentId : "",
      tournamentYear: tournamentPairApproved ? tournamentScope.tournamentYear : null,
    },
  };
}

export function assertProductionFoundationResources(options = {}) {
  const state = productionFoundationResourceEnvironment(options);
  if (!state.allowed) {
    const error = new Error(`Production foundation transport is unavailable (${state.reason}).`);
    error.code = "PRODUCTION_FOUNDATION_RESOURCE_MISMATCH";
    error.status = 503;
    error.diagnostics = state;
    throw error;
  }
  return state;
}

export function productionFoundationOperationNames() {
  return [...LEGACY_FOUNDATION_OPERATION_NAMES];
}

export function productionFoundationShadowImportOperationNames() {
  return Object.keys(OPERATION_POLICIES).filter((name) =>
    !LEGACY_FOUNDATION_OPERATION_NAMES.includes(name)
  );
}
