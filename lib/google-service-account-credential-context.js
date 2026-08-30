import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

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
import {
  GOOGLE_WORKBOOK_MUTATION_INTENTS,
  withGoogleWorkbookMutationIntent,
} from "./google-workbook-mutation-intent.js";

export const PRODUCTION_GOOGLE_CREDENTIAL_CONTRACT_VERSION =
  "production-google-service-account-v2";
export const PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL =
  "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com";
export const PRODUCTION_GOOGLE_CANONICAL_LEGACY_CREDENTIAL_CLASS =
  "LEGACY_PROVIDER_FENCEABLE";
export const PRODUCTION_VERCEL_PROJECT_ID =
  "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU";

const credentialContext = new AsyncLocalStorage();
const approvedCredentialSnapshots = new WeakMap();
const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const normalizedPrivateKey = (value) => clean(value).replace(/\\n/g, "\n");

/**
 * Exact Drive ACL principal identity. A Google service-account key may rotate
 * without changing this value because the workbook permission belongs to the
 * normalized service-account email, not to one private-key generation.
 */
export function productionGoogleDrivePrincipalFingerprint(email) {
  const normalized = clean(email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(normalized)) return "";
  return createHash("sha256")
    .update(`google-drive-permission-principal-v1\nuser\n${normalized}`)
    .digest("hex");
}

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
  CANONICAL_LEGACY_V2: Object.freeze({
    googleRead: true,
    googleWrite: true,
    requiresRuntimeSupabase: false,
    authority: "LEGACY_SCORING",
    canonicalLegacy: true,
  }),
  GOOGLE_DIRECTOR_AUTHORING: Object.freeze({
    googleRead: true,
    googleWrite: true,
    requiresRuntimeSupabase: false,
    authority: "DIRECTOR_AUTHORING",
    directorAuthoring: true,
  }),
  SCORING_GOOGLE_OUTBOX: Object.freeze({
    googleRead: true,
    googleWrite: true,
    requiresRuntimeSupabase: true,
    authority: "SCORING",
    mirrorArchive: true,
  }),
  ROUND_SCORECARDS_ARCHIVE: Object.freeze({
    googleRead: true,
    googleWrite: true,
    requiresRuntimeSupabase: true,
    authority: "SCORING",
    archive: true,
    mirrorArchive: true,
  }),
  ODDS_GOOGLE_MIRROR: Object.freeze({
    googleRead: true,
    googleWrite: true,
    requiresRuntimeSupabase: true,
    authority: "ODDS_PUBLICATION",
    oddsPublication: true,
    mirrorArchive: true,
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
    : policy.authority === "LEGACY_SCORING"
      ? scoringAuthority === "google"
    : policy.authority === "ODDS_PUBLICATION"
      ? oddsPublicationAuthority === "supabase"
      : true;
  const mirrorEnabled = truthy(env.PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED);
  const archiveEnabled = truthy(env.ROUND_SCORECARDS_ARCHIVE_ENABLED);
  const oddsPublicationEnabled = truthy(env.PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED);
  const oddsGoogleMirrorEnabled = truthy(
    env.PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED,
  );
  const canonicalAdmissionConfigured = truthy(env.PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED) &&
    /^[0-9a-f-]{36}$/i.test(clean(env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH)) &&
    /^[0-9a-f-]{36}$/i.test(clean(env.PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION)) &&
    /^dpl_[A-Za-z0-9]{8,64}$/.test(clean(env.VERCEL_DEPLOYMENT_ID));
  const activationApproved = policy.canonicalLegacy
    ? canonicalAdmissionConfigured
    : policy.directorAuthoring
      ? true
      : !policy.googleWrite || (
    mirrorEnabled &&
    (!policy.archive || archiveEnabled) &&
    (!policy.oddsPublication ||
      (oddsPublicationEnabled && oddsGoogleMirrorEnabled))
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
  const normalizedProductionEmail = productionEmail.toLowerCase();
  const normalizedLegacyEmail = legacyEmail.toLowerCase();
  const productionCredentialsConfigured = Boolean(productionEmail && productionKey);
  const legacyCredentialsConfigured = Boolean(legacyEmail && legacyKey);
  const canonicalLegacyCredential = policy?.canonicalLegacy === true;
  const selectedEmail = canonicalLegacyCredential ? legacyEmail : productionEmail;
  const selectedPrivateKey = canonicalLegacyCredential ? legacyKey : productionKey;
  const providerPrincipalFingerprint =
    productionGoogleDrivePrincipalFingerprint(selectedEmail);
  const credentialsConfigured = canonicalLegacyCredential
    ? legacyCredentialsConfigured
    : productionCredentialsConfigured;
  const credentialIdentityApproved = canonicalLegacyCredential
    ? legacyCredentialsConfigured &&
      Boolean(providerPrincipalFingerprint) &&
      normalizedLegacyEmail !== PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL.toLowerCase() &&
      (!productionEmail || normalizedLegacyEmail !== normalizedProductionEmail)
    : productionEmail === PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL;
  const credentialsSeparated = productionCredentialsConfigured && legacyCredentialsConfigured &&
    (!legacyEmail || normalizedProductionEmail !== normalizedLegacyEmail) &&
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
    : !credentialsConfigured ? canonicalLegacyCredential
      ? "legacy-google-credentials-required"
      : "production-google-credentials-required"
    : !credentialIdentityApproved ? canonicalLegacyCredential
      ? "legacy-google-identity-required"
      : "dedicated-production-google-identity-required"
    : !credentialsSeparated ? "production-google-credential-separation-required"
    : !authorityApproved ? "operation-authority-not-ready"
    : !activationApproved ? "production-google-write-activation-required"
    : "production-google-credential-unavailable";

  const state = Object.freeze({
    contractVersion: PRODUCTION_GOOGLE_CREDENTIAL_CONTRACT_VERSION,
    allowed,
    reason,
    credentialSource: allowed
      ? canonicalLegacyCredential ? "legacy-canonical" : "production-worker"
      : "",
    operation: normalizedOperation,
    operationApproved: Boolean(policy),
    policy: policy ? Object.freeze({
      googleRead: policy.googleRead,
      googleWrite: policy.googleWrite,
      requiresRuntimeSupabase: policy.requiresRuntimeSupabase,
      authority: policy.authority || "DIRECTOR_AUTHORING_PROJECTION",
      canonicalLegacy: policy.canonicalLegacy === true,
      directorAuthoring: policy.directorAuthoring === true,
      mirrorArchive: policy.mirrorArchive === true,
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
    providerPrincipalFingerprint,
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
      canonicalLegacyUsesLegacyIdentity: canonicalLegacyCredential,
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
  // Capture the exact validated pair once. The scoped selector below never
  // re-reads a caller-controlled environment after the trust decision.
  approvedCredentialSnapshots.set(state, Object.freeze({
    email: selectedEmail,
    privateKey: selectedPrivateKey,
    providerPrincipalFingerprint,
  }));
  return state;
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
  // OAuth caches must never reuse a bearer minted for another Google identity.
  // The Drive ACL principal is stable across service-account key rotation, so
  // it is the correct cache namespace (a key-generation hash would create
  // unnecessary churn without strengthening the ACL identity invariant).
  const principalFingerprint = productionGoogleDrivePrincipalFingerprint(email) ||
    createHash("sha256")
      .update(`google-service-account-email-cache-v1\n${clean(email).toLowerCase()}`)
      .digest("hex");
  Object.defineProperties(selected, {
    email: { value: email, enumerable: false },
    privateKey: { value: privateKey, enumerable: false },
    cacheKey: { value: `${source}:${principalFingerprint}`, enumerable: false },
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

function credentialIntentError(code, message, diagnostics = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = 503;
  error.credentialIntentDiagnostics = Object.freeze({ ...diagnostics });
  return error;
}

/**
 * Last-line binding between a workbook mutation class and the credential
 * operation that activated it. The canonical branch additionally requires the
 * exact (identity-equal) RPC admission carried by the credential scope.
 */
export function assertProductionGoogleServiceAccountMutationBinding({
  intent,
  operation,
  admission,
} = {}) {
  const active = credentialContext.getStore();
  const diagnostics = active?.diagnostics;
  const normalizedIntent = clean(intent).toUpperCase();
  const normalizedOperation = clean(operation).toUpperCase();
  if (!active) {
    throw credentialIntentError(
      "PRODUCTION_GOOGLE_SCOPED_CREDENTIAL_REQUIRED",
      "Production Google writes require an exact request-scoped credential context.",
      { intent: normalizedIntent, operation: normalizedOperation },
    );
  }
  const canonical = normalizedIntent === GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY &&
    diagnostics.credentialSource === "legacy-canonical" &&
    diagnostics.operation === "CANONICAL_LEGACY_V2" && diagnostics.policy?.canonicalLegacy === true &&
    active.canonicalAdmission === admission && admission && typeof admission === "object" &&
    active.providerPrincipalFingerprint ===
      clean(admission.providerPrincipalFingerprint).toLowerCase();
  const authoring = normalizedIntent === GOOGLE_WORKBOOK_MUTATION_INTENTS.AUTHORING &&
    diagnostics.credentialSource === "production-worker" &&
    diagnostics.operation === "GOOGLE_DIRECTOR_AUTHORING" && diagnostics.policy?.directorAuthoring === true &&
    active.canonicalAdmission === null;
  const mirrorArchive = normalizedIntent === GOOGLE_WORKBOOK_MUTATION_INTENTS.MIRROR_ARCHIVE &&
    diagnostics.credentialSource === "production-worker" &&
    diagnostics.operation === normalizedOperation && diagnostics.policy?.mirrorArchive === true &&
    active.canonicalAdmission === null;
  if (!canonical && !authoring && !mirrorArchive) {
    throw credentialIntentError(
      "PRODUCTION_GOOGLE_CREDENTIAL_INTENT_MISMATCH",
      "The Production Google credential operation does not match this workbook mutation intent.",
      {
        intent: normalizedIntent,
        operation: normalizedOperation,
        credentialOperation: clean(diagnostics.operation).toUpperCase(),
        canonicalAdmissionMatched: active.canonicalAdmission === admission,
        providerPrincipalMatched: active.providerPrincipalFingerprint ===
          clean(admission?.providerPrincipalFingerprint).toLowerCase(),
      },
    );
  }
  return diagnostics;
}

/**
 * The only scoped Production selector. Canonical legacy operations deliberately
 * retain the legacy GOOGLE_* principal so the persistent provider fence can
 * deny that principal after closure. Authoring and mirror/archive operations
 * select the dedicated PRODUCTION_GOOGLE_* principal. Neither branch enables a
 * write, worker, authority, or public read source by itself.
 */
export function withProductionGoogleServiceAccountCredentials(
  options,
  callback,
) {
  if (typeof callback !== "function") throw new TypeError("A Production Google credential callback is required.");
  const state = assertProductionGoogleCredentialEnvironment(options);
  const canonicalAdmission = state.policy?.canonicalLegacy
    ? options?.canonicalAdmission
    : null;
  if (state.policy?.canonicalLegacy && (!canonicalAdmission || typeof canonicalAdmission !== "object")) {
    throw credentialIntentError(
      "PRODUCTION_GOOGLE_CANONICAL_CREDENTIAL_ADMISSION_REQUIRED",
      "The Production canonical Google credential requires the exact admitted writer.",
      { operation: state.operation },
    );
  }
  if (state.policy?.canonicalLegacy &&
      clean(canonicalAdmission?.providerCredentialClass).toUpperCase() !==
        PRODUCTION_GOOGLE_CANONICAL_LEGACY_CREDENTIAL_CLASS) {
    throw credentialIntentError(
      "PRODUCTION_GOOGLE_CANONICAL_CREDENTIAL_CLASS_MISMATCH",
      "The Production canonical Google admission is not bound to the fenceable legacy provider identity.",
      { operation: state.operation },
    );
  }
  const selectedCredential = approvedCredentialSnapshots.get(state);
  if (!selectedCredential) {
    throw credentialIntentError(
      "PRODUCTION_GOOGLE_CREDENTIAL_SNAPSHOT_REQUIRED",
      "The validated Production Google credential snapshot was unavailable.",
      { operation: state.operation },
    );
  }
  if (state.policy?.canonicalLegacy &&
      clean(canonicalAdmission?.providerPrincipalFingerprint).toLowerCase() !==
        selectedCredential.providerPrincipalFingerprint) {
    throw credentialIntentError(
      "PRODUCTION_GOOGLE_CANONICAL_PRINCIPAL_MISMATCH",
      "The Production canonical Google admission is not bound to the selected ACL-fenced principal.",
      { operation: state.operation },
    );
  }
  if (!state.policy?.canonicalLegacy && options?.canonicalAdmission) {
    throw credentialIntentError(
      "PRODUCTION_GOOGLE_CREDENTIAL_INTENT_MISMATCH",
      "A noncanonical Production Google credential cannot carry a canonical admission.",
      { operation: state.operation },
    );
  }
  const credentials = credentialRecord({
    source: state.policy?.canonicalLegacy ? "legacy-canonical" : "production-worker",
    email: selectedCredential.email,
    privateKey: selectedCredential.privateKey,
    diagnostics: state,
  });
  return credentialContext.run({
    credentials,
    diagnostics: state,
    canonicalAdmission,
    providerPrincipalFingerprint: selectedCredential.providerPrincipalFingerprint,
  }, () => {
    if (!state.policy?.mirrorArchive) return callback();
    return withGoogleWorkbookMutationIntent({
      intent: GOOGLE_WORKBOOK_MUTATION_INTENTS.MIRROR_ARCHIVE,
      operation: state.operation,
    }, callback);
  });
}

export function productionGoogleCredentialOperationNames() {
  return Object.keys(PRODUCTION_OPERATIONS);
}
