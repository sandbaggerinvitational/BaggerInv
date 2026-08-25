import { AsyncLocalStorage } from "node:async_hooks";

import {
  exactProductionSupabaseUrl,
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";
import {
  PRODUCTION_CANONICAL_HOSTNAME,
  PRODUCTION_VERCEL_PROJECT_NAME,
  productionShadowCandidateEnvironment,
} from "./production-shadow-candidate.js";

export const PRODUCTION_GOOGLE_CREDENTIAL_CONTRACT_VERSION =
  "production-google-service-account-v1";
export const PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL =
  "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com";
export const PRODUCTION_VERCEL_PROJECT_ID =
  "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU";

const credentialContext = new AsyncLocalStorage();
const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const normalizedPrivateKey = (value) => clean(value).replace(/\\n/g, "\n");

const PRODUCTION_OPERATIONS = Object.freeze({
  PRODUCTION_WORKBOOK_METADATA_READ: Object.freeze({
    googleRead: true,
    googleWrite: false,
    requiresRuntimeSupabase: false,
  }),
  GUIDE_SYNCHRONIZATION: Object.freeze({
    googleRead: true,
    googleWrite: false,
    requiresRuntimeSupabase: true,
  }),
  PLAYER_EDITORIAL_SYNCHRONIZATION: Object.freeze({
    googleRead: true,
    googleWrite: false,
    requiresRuntimeSupabase: true,
  }),
  PREDICTION_SETTINGS_SYNCHRONIZATION: Object.freeze({
    googleRead: true,
    googleWrite: false,
    requiresRuntimeSupabase: true,
  }),
  DRAFT_SYNCHRONIZATION: Object.freeze({
    googleRead: true,
    googleWrite: false,
    requiresRuntimeSupabase: true,
  }),
  NET_SKINS_SYNCHRONIZATION: Object.freeze({
    googleRead: true,
    googleWrite: false,
    requiresRuntimeSupabase: true,
  }),
  CALCUTTA_SYNCHRONIZATION: Object.freeze({
    googleRead: true,
    googleWrite: false,
    requiresRuntimeSupabase: true,
  }),
  SCORING_GOOGLE_OUTBOX: Object.freeze({
    googleRead: true,
    googleWrite: true,
    requiresRuntimeSupabase: true,
    authority: "SCORING",
  }),
  ROUND_SCORECARDS_ARCHIVE: Object.freeze({
    googleRead: true,
    googleWrite: true,
    requiresRuntimeSupabase: true,
    authority: "SCORING",
    archive: true,
  }),
  ODDS_GOOGLE_MIRROR: Object.freeze({
    googleRead: true,
    googleWrite: true,
    requiresRuntimeSupabase: true,
    authority: "ODDS_PUBLICATION",
    oddsPublication: true,
  }),
});

function exact(value, expected) {
  return clean(value) === String(expected);
}

function exactResources(resources = {}) {
  const tournamentYear = Number(resources.tournamentYear);
  return {
    supabaseProjectRef: exact(resources.supabaseProjectRef, PRODUCTION_SUPABASE_PROJECT_REF),
    supabaseProjectUrl: exactProductionSupabaseUrl(resources.supabaseProjectUrl),
    googleWorkbookId: exact(resources.googleWorkbookId, PRODUCTION_GOOGLE_WORKBOOK_ID),
    tournamentId: exact(resources.tournamentId, PRODUCTION_TOURNAMENT_ID),
    tournamentYear: Number.isInteger(tournamentYear) && tournamentYear === PRODUCTION_TOURNAMENT_YEAR,
    vercelProjectId: exact(resources.vercelProjectId, PRODUCTION_VERCEL_PROJECT_ID),
    vercelProjectName: exact(resources.vercelProjectName, PRODUCTION_VERCEL_PROJECT_NAME),
    canonicalHostname: exact(resources.canonicalHostname, PRODUCTION_CANONICAL_HOSTNAME),
  };
}

function operationActivation(policy, env) {
  if (!policy) return { authorityApproved: false, activationApproved: false };
  const scoringAuthority = clean(env.SCORING_AUTHORITY || "google").toLowerCase();
  const oddsPublicationAuthority = clean(env.ODDS_PUBLICATION_AUTHORITY || "google").toLowerCase();
  const authorityApproved = policy.authority === "SCORING"
    ? scoringAuthority === "supabase"
    : policy.authority === "ODDS_PUBLICATION"
      ? oddsPublicationAuthority === "supabase"
      : true;
  const mirrorEnabled = truthy(env.PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED);
  const archiveEnabled = truthy(env.ROUND_SCORECARDS_ARCHIVE_ENABLED);
  const oddsPublicationEnabled = truthy(env.PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED);
  const activationApproved = !policy.googleWrite || (
    mirrorEnabled &&
    (!policy.archive || archiveEnabled) &&
    (!policy.oddsPublication || oddsPublicationEnabled)
  );
  return { authorityApproved, activationApproved };
}

/**
 * Safe diagnostics for the dedicated Production Google identity. Selecting a
 * Production credential requires both the exact deployed resource tuple and a
 * narrowly allowlisted operation. Credential values are deliberately absent.
 */
export function productionGoogleCredentialEnvironment({
  env = process.env,
  operation,
  resources = {},
} = {}) {
  const normalizedOperation = clean(operation).toUpperCase();
  const policy = PRODUCTION_OPERATIONS[normalizedOperation] || null;
  const requestedResources = exactResources(resources);
  const requestedResourcesApproved = Object.values(requestedResources).every(Boolean);
  const candidateMetadataReadApproved = normalizedOperation === "PRODUCTION_WORKBOOK_METADATA_READ" &&
    productionShadowCandidateEnvironment(env).allowed;
  // The isolated Step 11 candidate may exercise only the allowlisted,
  // read-only workbook metadata operation. Every synchronization and writer
  // continues to require a real Production deployment plus its own gates.
  const deploymentApproved = exact(env.VERCEL_ENV, "production") || candidateMetadataReadApproved;
  const vercelProjectApproved = exact(env.VERCEL_PROJECT_ID, PRODUCTION_VERCEL_PROJECT_ID) &&
    exact(env.VERCEL_PROJECT_NAME, PRODUCTION_VERCEL_PROJECT_NAME);
  const productionProjectApproved = exact(
    env.PRODUCTION_SUPABASE_PROJECT_REF,
    PRODUCTION_SUPABASE_PROJECT_REF,
  ) && exactProductionSupabaseUrl(env.PRODUCTION_SUPABASE_URL);
  const runtimeProjectApproved = !policy?.requiresRuntimeSupabase ||
    exactProductionSupabaseUrl(env.SUPABASE_SCORING_MIRROR_URL);
  const workbookAlias = clean(env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const workbookApproved = exact(env.GOOGLE_SHEETS_ID, PRODUCTION_GOOGLE_WORKBOOK_ID) &&
    (!workbookAlias || workbookAlias === PRODUCTION_GOOGLE_WORKBOOK_ID);
  const foundationEnabled = truthy(env.PRODUCTION_FOUNDATION_ENABLED);
  const productionEmail = clean(env.PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const productionKey = normalizedPrivateKey(env.PRODUCTION_GOOGLE_PRIVATE_KEY);
  const legacyEmail = clean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const legacyKey = normalizedPrivateKey(env.GOOGLE_PRIVATE_KEY);
  const credentialIdentityApproved = productionEmail ===
    PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL;
  const credentialsConfigured = Boolean(productionEmail && productionKey);
  const credentialsSeparated = credentialsConfigured &&
    (!legacyEmail || productionEmail !== legacyEmail) &&
    (!legacyKey || productionKey !== legacyKey);
  const { authorityApproved, activationApproved } = operationActivation(policy, env);

  const allowed = Boolean(policy) &&
    deploymentApproved &&
    vercelProjectApproved &&
    productionProjectApproved &&
    runtimeProjectApproved &&
    workbookApproved &&
    foundationEnabled &&
    requestedResourcesApproved &&
    credentialsConfigured &&
    credentialIdentityApproved &&
    credentialsSeparated &&
    authorityApproved &&
    activationApproved;

  const reason = allowed ? "production-google-credential-ready"
    : !policy ? "production-google-operation-not-allowed"
    : !deploymentApproved ? "production-environment-required"
    : !vercelProjectApproved ? "production-vercel-project-required"
    : !productionProjectApproved ? "production-supabase-project-required"
    : !runtimeProjectApproved ? "production-runtime-supabase-required"
    : !workbookApproved ? "production-workbook-required"
    : !foundationEnabled ? "production-foundation-required"
    : !requestedResourcesApproved ? "exact-production-resource-request-required"
    : !credentialsConfigured ? "production-google-credentials-required"
    : !credentialIdentityApproved ? "dedicated-production-google-identity-required"
    : !credentialsSeparated ? "production-google-credential-separation-required"
    : !authorityApproved ? "operation-authority-not-ready"
    : !activationApproved ? "production-google-write-activation-required"
    : "production-google-credential-unavailable";

  return Object.freeze({
    contractVersion: PRODUCTION_GOOGLE_CREDENTIAL_CONTRACT_VERSION,
    allowed,
    reason,
    credentialSource: allowed ? "production-worker" : "",
    operation: normalizedOperation,
    operationApproved: Boolean(policy),
    policy: policy ? Object.freeze({
      googleRead: policy.googleRead,
      googleWrite: policy.googleWrite,
      requiresRuntimeSupabase: policy.requiresRuntimeSupabase,
      authority: policy.authority || "DIRECTOR_AUTHORING_PROJECTION",
    }) : null,
    deploymentApproved,
    candidateMetadataReadApproved,
    vercelProjectApproved,
    productionProjectApproved,
    runtimeProjectApproved,
    workbookApproved,
    foundationEnabled,
    requestedResourcesApproved,
    requestedResources: Object.freeze({ ...requestedResources }),
    credentialsConfigured,
    credentialIdentityApproved,
    credentialsSeparated,
    authorityApproved,
    activationApproved,
    safety: Object.freeze({
      automaticWorkerActivation: false,
      automaticGoogleWriteActivation: false,
      automaticAuthorityChange: false,
      automaticPublicReadCutover: false,
      previewCredentialFallback: false,
      legacyCredentialFallback: false,
    }),
    resources: Object.freeze({
      supabaseProjectRef: productionProjectApproved && requestedResources.supabaseProjectRef
        ? PRODUCTION_SUPABASE_PROJECT_REF : "",
      supabaseHost: productionProjectApproved && requestedResources.supabaseProjectUrl
        ? `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` : "",
      googleWorkbookId: workbookApproved && requestedResources.googleWorkbookId
        ? PRODUCTION_GOOGLE_WORKBOOK_ID : "",
      tournamentId: requestedResources.tournamentId ? PRODUCTION_TOURNAMENT_ID : "",
      tournamentYear: requestedResources.tournamentYear ? PRODUCTION_TOURNAMENT_YEAR : null,
      vercelProjectId: vercelProjectApproved && requestedResources.vercelProjectId
        ? PRODUCTION_VERCEL_PROJECT_ID : "",
      vercelProjectName: vercelProjectApproved && requestedResources.vercelProjectName
        ? PRODUCTION_VERCEL_PROJECT_NAME : "",
      canonicalHostname: requestedResources.canonicalHostname
        ? PRODUCTION_CANONICAL_HOSTNAME : "",
    }),
  });
}

export function assertProductionGoogleCredentialEnvironment(options = {}) {
  const state = productionGoogleCredentialEnvironment(options);
  if (!state.allowed) {
    const error = new Error(`Production Google credential is unavailable (${state.reason}).`);
    error.code = "PRODUCTION_GOOGLE_CREDENTIAL_UNAVAILABLE";
    error.status = 503;
    error.diagnostics = state;
    throw error;
  }
  return state;
}

function credentialRecord({ source, email, privateKey, diagnostics }) {
  const selected = { source, diagnostics };
  Object.defineProperties(selected, {
    email: { value: email, enumerable: false },
    privateKey: { value: privateKey, enumerable: false },
    cacheKey: { value: source, enumerable: false },
  });
  return Object.freeze(selected);
}

function legacyGoogleCredentials(env = process.env) {
  const email = clean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = normalizedPrivateKey(env.GOOGLE_PRIVATE_KEY);
  if (!email || !privateKey) {
    const error = new Error("Legacy Google service-account credentials are not configured.");
    error.code = "LEGACY_GOOGLE_CREDENTIALS_MISSING";
    throw error;
  }
  return credentialRecord({
    source: "legacy",
    email,
    privateKey,
    diagnostics: Object.freeze({
      credentialSource: "legacy",
      configured: true,
      productionWorkerContext: false,
    }),
  });
}

/**
 * Existing application/Passport/Google paths always resolve the legacy pair.
 * Only the validated AsyncLocalStorage scope below can select Production.
 */
export function currentGoogleServiceAccountCredentials(env = process.env) {
  return credentialContext.getStore()?.credentials || legacyGoogleCredentials(env);
}

export function googleServiceAccountCredentialDiagnostics(env = process.env) {
  const active = credentialContext.getStore();
  if (active) return active.diagnostics;
  return Object.freeze({
    credentialSource: "legacy",
    configured: Boolean(
      clean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL) && normalizedPrivateKey(env.GOOGLE_PRIVATE_KEY),
    ),
    productionWorkerContext: false,
  });
}

/**
 * The only Production selector. It changes credentials for this asynchronous
 * call tree only; it does not enable a worker, a Google write, an authority, or
 * a public read source.
 */
export function withProductionGoogleServiceAccountCredentials(
  options,
  callback,
) {
  if (typeof callback !== "function") throw new TypeError("A Production Google credential callback is required.");
  const state = assertProductionGoogleCredentialEnvironment(options);
  const env = options?.env || process.env;
  const credentials = credentialRecord({
    source: "production-worker",
    email: clean(env.PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL),
    privateKey: normalizedPrivateKey(env.PRODUCTION_GOOGLE_PRIVATE_KEY),
    diagnostics: state,
  });
  return credentialContext.run({ credentials, diagnostics: state }, callback);
}

export function productionGoogleCredentialOperationNames() {
  return Object.keys(PRODUCTION_OPERATIONS);
}
