import {
  createHash,
  createPublicKey,
  createSign,
} from "node:crypto";
import { types as nodeTypes } from "node:util";

import {
  PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL,
  PRODUCTION_VERCEL_PROJECT_ID,
} from "./google-service-account-credential-context.js";
import {
  acceptProductionGoogleDriveAclProviderMutationDispatch,
  createProductionGoogleDriveAclTransitionIntent,
  inspectProductionGoogleDriveAclFence,
  inspectProductionGoogleDriveLegacyEditCapability,
  preflightProductionGoogleDriveAclTransition,
  recoverProductionGoogleDriveAclTransitionOutcome,
  revokeProductionGoogleDriveAclProviderMutationDispatch,
  transitionProductionGoogleLegacyDriveRole,
} from "./production-google-drive-acl-fence.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";
import {
  PRODUCTION_CANONICAL_HOSTNAME,
  productionShadowCandidateEnvironment,
} from "./production-shadow-candidate.js";
import {
  productionGoogleWriterAllMethodFenceHosts,
  productionGoogleWriterAllMethodFencePaths,
} from "./production-google-writer-fence-quiesce.js";
import { productionWriterFenceCandidateCutoverEnvironment } from
  "./production-cutover-activation-contract.js";

export const PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_VERSION =
  "step11-6-production-google-drive-acl-rehearsal-v2";
// Retained as the exact operator confirmation/API compatibility value. It no
// longer names or enables a Sheets protected-range operation.
export const PRODUCTION_GOOGLE_WRITER_FENCE_DESCRIPTION =
  "STEP11_6_WRITER_FENCE_REHEARSAL";
export const PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_DESCRIPTION =
  "STEP12_GOOGLE_WRITER_PROVIDER_FENCE";
export const PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_VERSION =
  "step12-production-google-drive-acl-provider-fence-v4";
export const PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_CONFIRMATION =
  "ABORT_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL";
export const PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH =
  "feature/mock-tournament-qa-integration";
export const PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR = "CB01";
export const PRODUCTION_GOOGLE_WRITER_FENCE_OWNER_CONFIRMATION =
  "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS REHEARSAL";

const clean = (value) => String(value ?? "").trim();
const lower = (value) => clean(value).toLowerCase();
const upper = (value) => clean(value).toUpperCase();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");
const isSha256 = (value) => /^[0-9a-f]{64}$/.test(lower(value));
const isCommitSha = (value) => /^[0-9a-f]{40}$/.test(lower(value));
const isRequestId = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(clean(value));
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) =>
      [key, stableValue(value[key])]));
  }
  return value;
};
const fingerprint = (value) => sha256(JSON.stringify(stableValue(value)));
// This is deliberately only a typed sentinel proving that this executor has no
// Sheets mutation/readback surface. It is not a fingerprint of canonical
// Production scoring data; that snapshot belongs to the separate cutover
// reconciliation boundary.
const NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT = fingerprint([]);
const authoritativeProductionGoogleProviderFetch = globalThis.fetch.bind(globalThis);

function fenceError(code, message, { status = 409, diagnostics = {} } = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.safeDiagnostics = Object.freeze({ ...diagnostics });
  return error;
}

function executionDependencyError(code, message, diagnostics = {}) {
  return fenceError(code, message, { status: 500, diagnostics });
}

function executionOptionsSnapshot(value, allowedKeys, code, label) {
  const candidate = value == null ? {} : value;
  let prototype;
  let descriptors;
  try {
    if ((typeof candidate !== "object" && typeof candidate !== "function") ||
        candidate === null || nodeTypes.isProxy(candidate)) {
      throw new TypeError(`${label} must be a non-Proxy object.`);
    }
    prototype = Object.getPrototypeOf(candidate);
    descriptors = Object.getOwnPropertyDescriptors(candidate);
  } catch {
    throw executionDependencyError(
      code,
      `${label} could not be trusted.`,
      { optionsShapeValid: false },
    );
  }
  const keys = Reflect.ownKeys(descriptors);
  const unknownKeys = keys.filter((key) =>
    typeof key !== "string" || !allowedKeys.has(key));
  const accessorKeys = keys.filter((key) => {
    const descriptor = descriptors[key];
    return typeof descriptor?.get === "function" ||
      typeof descriptor?.set === "function";
  });
  const plain = prototype === Object.prototype || prototype === null;
  if (!plain || unknownKeys.length || accessorKeys.length) {
    throw executionDependencyError(
      code,
      `${label} must be a bounded plain-data object.`,
      {
        accessorOptionCount: accessorKeys.length,
        optionsShapeValid: plain,
        unknownOptionCount: unknownKeys.length,
      },
    );
  }
  return Object.freeze(Object.fromEntries(keys.map((key) =>
    [key, descriptors[key].value])));
}

async function productionGoogleWriterExecutionDependencies(optionsInput) {
  const code = "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_DEPENDENCY_INJECTION_FORBIDDEN";
  const snapshot = executionOptionsSnapshot(
    optionsInput,
    new Set(["actor", "authorization", "control", "env", "fetchImpl", "now"]),
    code,
    "The Production Drive ACL provider-fence dependency bundle",
  );
  const testOverridesAllowed = clean(process.env.NODE_TEST_CONTEXT) === "child-v8";
  if (testOverridesAllowed) {
    return Object.freeze({
      control: snapshot.control ?? {},
      env: snapshot.env ?? process.env,
      fetchImpl: snapshot.fetchImpl ?? authoritativeProductionGoogleProviderFetch,
      now: snapshot.now ?? Date.now(),
    });
  }
  const injectedKeys = ["actor", "control", "env", "fetchImpl", "now"]
    .filter((key) => snapshot[key] !== undefined);
  if (injectedKeys.length) {
    throw executionDependencyError(
      code,
      "Production Google provider transport and control dependencies are module-owned.",
      { injectedDependencyCount: injectedKeys.length },
    );
  }
  const { productionGoogleWriterProviderFenceControlDependencies } = await import(
    "./production-google-writer-fence-receipt-server.js"
  );
  return Object.freeze({
    control: productionGoogleWriterProviderFenceControlDependencies({
      authorization: snapshot.authorization,
    }),
    env: Object.freeze({ ...process.env }),
    fetchImpl: authoritativeProductionGoogleProviderFetch,
    now: Date.now(),
  });
}

function normalizedPrivateKey(value) {
  return clean(value).replace(/\\n/g, "\n");
}

function publicKeySha256(privateKey) {
  try {
    const publicKey = createPublicKey(privateKey).export({
      type: "spki",
      format: "der",
    });
    return sha256(publicKey);
  } catch {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_CREDENTIAL_INVALID",
      "A Google writer-fence credential could not be validated.",
      { status: 503 },
    );
  }
}

function credentialRecord(email, privateKey, label) {
  const normalizedEmail = lower(email);
  const normalizedKey = normalizedPrivateKey(privateKey);
  if (!normalizedEmail || !normalizedKey) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_CREDENTIAL_MISSING",
      "Both isolated Google identities are required for the writer-fence rehearsal.",
      { status: 503, diagnostics: { credentialLabel: label } },
    );
  }
  const record = {
    label,
    publicKeySha256: publicKeySha256(normalizedKey),
  };
  Object.defineProperties(record, {
    email: { value: normalizedEmail, enumerable: false },
    privateKey: { value: normalizedKey, enumerable: false },
  });
  return Object.freeze(record);
}

function commonSafety(allMethodFence, allMethodPaths) {
  return Object.freeze({
    applicationDataMutationIssued: false,
    broadDriveEditorPathAllowed: false,
    canonicalSheetUnionCount: 0,
    controlPlaneReceiptRequired: true,
    driveAclMutationOnly: true,
    drivePermissionInventoryRequired: true,
    canonicalDataFingerprintCaptured: false,
    noSheetsTransportSentinelOnly: true,
    noValueWriteProof: true,
    protectedRangeRehearsalRetired: true,
    providerValueWriteAttempted: false,
    spreadsheetOwnerOverrideTested: false,
    allMethodFenceRequiredHostCount: allMethodFence.count,
    allMethodFenceRequiredHostsFingerprint: allMethodFence.fingerprint,
    allMethodFenceRequiredPathCount: allMethodPaths.count,
    allMethodFenceRequiredPathsFingerprint: allMethodPaths.fingerprint,
  });
}

export function productionGoogleWriterFenceRehearsalEnvironment(env = process.env) {
  const candidate = productionShadowCandidateEnvironment(env);
  const allMethodFence = productionGoogleWriterAllMethodFenceHosts();
  const allMethodPaths = productionGoogleWriterAllMethodFencePaths();
  const requested = truthy(env.PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_REHEARSAL_ENABLED);
  const expectedCommitSha = lower(
    env.PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_EXPECTED_COMMIT_SHA,
  );
  const expectedCommitApproved = isCommitSha(expectedCommitSha) &&
    expectedCommitSha === candidate.resources.commitSha;
  const branchApproved = clean(env.VERCEL_GIT_COMMIT_REF) ===
    PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH;
  const workbookApproved = clean(env.GOOGLE_SHEETS_ID) ===
      PRODUCTION_GOOGLE_WORKBOOK_ID &&
    (!clean(env.GOOGLE_SHEETS_SPREADSHEET_ID) ||
      clean(env.GOOGLE_SHEETS_SPREADSHEET_ID) === PRODUCTION_GOOGLE_WORKBOOK_ID);
  let legacy = null;
  let dedicated = null;
  let credentialError = null;
  try {
    legacy = credentialRecord(
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      env.GOOGLE_PRIVATE_KEY,
      "legacy-google-writer",
    );
    dedicated = credentialRecord(
      env.PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL,
      env.PRODUCTION_GOOGLE_PRIVATE_KEY,
      "dedicated-production-google",
    );
  } catch (error) {
    credentialError = error;
  }
  const dedicatedIdentityApproved = Boolean(dedicated) &&
    dedicated.email === PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL;
  const credentialsSeparated = Boolean(legacy && dedicated) &&
    legacy.email !== dedicated.email &&
    legacy.publicKeySha256 !== dedicated.publicKeySha256;
  const allowed = candidate.allowed && requested && expectedCommitApproved &&
    branchApproved && workbookApproved && !credentialError &&
    dedicatedIdentityApproved && credentialsSeparated;
  const reason = allowed ? "step11-6-google-drive-acl-rehearsal-ready"
    : !candidate.allowed ? candidate.reason
    : !requested ? "writer-fence-rehearsal-disabled"
    : !expectedCommitApproved ? "exact-writer-fence-commit-required"
    : !branchApproved ? "exact-writer-fence-branch-required"
    : !workbookApproved ? "exact-production-workbook-required"
    : credentialError ? "writer-fence-credentials-required"
    : !dedicatedIdentityApproved ? "dedicated-production-google-identity-required"
    : !credentialsSeparated ? "separate-google-identities-required"
    : "writer-fence-rehearsal-unavailable";
  const safety = commonSafety(allMethodFence, allMethodPaths);
  const state = {
    contractVersion: PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_VERSION,
    allowed,
    reason,
    requested,
    candidate,
    expectedCommitApproved,
    branchApproved,
    workbookApproved,
    dedicatedIdentityApproved,
    credentialsSeparated,
    resources: Object.freeze({
      workbookId: workbookApproved ? PRODUCTION_GOOGLE_WORKBOOK_ID : "",
      supabaseProjectRef: candidate.resources.supabaseProjectRef || "",
      tournamentId: PRODUCTION_TOURNAMENT_ID,
      tournamentYear: PRODUCTION_TOURNAMENT_YEAR,
      vercelProjectId: candidate.resources.vercelProjectId || "",
      vercelProjectName: candidate.resources.vercelProjectName || "",
      candidateHostname: candidate.resources.candidateHostname || "",
      canonicalHostname: PRODUCTION_CANONICAL_HOSTNAME,
      branch: branchApproved ? PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH : "",
      commitSha: expectedCommitApproved ? expectedCommitSha : "",
    }),
    credentials: Object.freeze({
      separated: credentialsSeparated,
      legacyPublicKeySha256: legacy?.publicKeySha256 || "",
      dedicatedPublicKeySha256: dedicated?.publicKeySha256 || "",
    }),
    safety: Object.freeze({
      ...safety,
      automaticRestore: false,
      candidateOnly: true,
      controlPlaneCriticalWafRequired: true,
      liveDomainPromotion: false,
      participantIdentityChange: false,
      scoringAuthorityChange: false,
      supabaseApplicationDataMutation: false,
    }),
  };
  Object.defineProperties(state, {
    legacyCredential: { value: legacy, enumerable: false },
    dedicatedCredential: { value: dedicated, enumerable: false },
  });
  return Object.freeze(state);
}

export function assertProductionGoogleWriterFenceRehearsalEnvironment(
  env = process.env,
) {
  const state = productionGoogleWriterFenceRehearsalEnvironment(env);
  if (!state.allowed) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_ENVIRONMENT_UNAVAILABLE",
      `The writer-fence rehearsal is unavailable (${state.reason}).`,
      { status: 404, diagnostics: { reason: state.reason } },
    );
  }
  return state;
}

export function productionGoogleWriterProviderFenceEnvironment(env = process.env) {
  const activation = productionWriterFenceCandidateCutoverEnvironment(env);
  const allMethodFence = productionGoogleWriterAllMethodFenceHosts();
  const allMethodPaths = productionGoogleWriterAllMethodFencePaths();
  const expectedCommitSha = lower(
    env.PRODUCTION_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_EXPECTED_COMMIT_SHA,
  );
  const requested = truthy(env.PRODUCTION_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ENABLED);
  const rehearsalDisabled = !truthy(
    env.PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_REHEARSAL_ENABLED,
  );
  const phaseApproved = activation.allowed && activation.phaseIndex >= 3;
  const expectedCommitApproved = isCommitSha(expectedCommitSha) &&
    expectedCommitSha === activation.resources.commitSha;
  const branchApproved = clean(env.VERCEL_GIT_COMMIT_REF) ===
    PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH;
  const candidateHostname = lower(env.VERCEL_BRANCH_URL);
  const deploymentHostname = lower(env.VERCEL_URL);
  const candidateOriginsApproved = candidateHostname.endsWith(".vercel.app") &&
    deploymentHostname.endsWith(".vercel.app") &&
    candidateHostname !== PRODUCTION_CANONICAL_HOSTNAME &&
    deploymentHostname !== PRODUCTION_CANONICAL_HOSTNAME;
  const workbookApproved = clean(env.GOOGLE_SHEETS_ID) ===
      PRODUCTION_GOOGLE_WORKBOOK_ID &&
    (!clean(env.GOOGLE_SHEETS_SPREADSHEET_ID) ||
      clean(env.GOOGLE_SHEETS_SPREADSHEET_ID) === PRODUCTION_GOOGLE_WORKBOOK_ID);
  const identityApproved = lower(env.PARTICIPANT_IDENTITY_AUTHORITY) === "supabase";
  const scoringAuthority = lower(env.SCORING_AUTHORITY || "google");
  const scoringAuthorityApproved = ["google", "supabase"].includes(scoringAuthority);
  let legacy = null;
  let dedicated = null;
  let credentialError = null;
  try {
    legacy = credentialRecord(
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      env.GOOGLE_PRIVATE_KEY,
      "legacy-google-writer",
    );
    dedicated = credentialRecord(
      env.PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EMAIL,
      env.PRODUCTION_GOOGLE_PRIVATE_KEY,
      "dedicated-production-google",
    );
  } catch (error) {
    credentialError = error;
  }
  const dedicatedIdentityApproved = Boolean(dedicated) &&
    dedicated.email === PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL;
  const credentialsSeparated = Boolean(legacy && dedicated) &&
    legacy.email !== dedicated.email &&
    legacy.publicKeySha256 !== dedicated.publicKeySha256;
  const allowed = requested && rehearsalDisabled && activation.allowed &&
    phaseApproved && expectedCommitApproved && branchApproved &&
    candidateOriginsApproved && workbookApproved && identityApproved &&
    scoringAuthorityApproved && !credentialError && dedicatedIdentityApproved &&
    credentialsSeparated;
  const safety = commonSafety(allMethodFence, allMethodPaths);
  const state = {
    contractVersion: PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_VERSION,
    requested,
    allowed,
    rehearsalDisabled,
    phaseApproved,
    expectedCommitApproved,
    branchApproved,
    workbookApproved,
    identityApproved,
    scoringAuthorityApproved,
    dedicatedIdentityApproved,
    credentialsSeparated,
    reason: allowed ? "step12-google-drive-acl-provider-fence-candidate-control-ready"
      : !requested ? "step12-provider-fence-disabled"
      : !rehearsalDisabled ? "step11-6-rehearsal-must-be-disabled"
      : !activation.allowed ? activation.reason
      : !phaseApproved ? "current-reads-phase-required"
      : !expectedCommitApproved ? "exact-step12-provider-fence-commit-required"
      : !branchApproved ? "exact-writer-fence-branch-required"
      : !candidateOriginsApproved ? "exact-production-candidate-origins-required"
      : !workbookApproved ? "exact-production-workbook-required"
      : !identityApproved ? "supabase-participant-identity-required"
      : !scoringAuthorityApproved ? "recognized-scoring-authority-required"
      : credentialError ? "writer-fence-credentials-required"
      : !dedicatedIdentityApproved ? "dedicated-production-google-identity-required"
      : !credentialsSeparated ? "separate-google-identities-required"
      : "step12-provider-fence-unavailable",
    activation,
    resources: Object.freeze({
      workbookId: workbookApproved ? PRODUCTION_GOOGLE_WORKBOOK_ID : "",
      supabaseProjectRef: activation.resources.projectRef || "",
      tournamentId: PRODUCTION_TOURNAMENT_ID,
      tournamentYear: PRODUCTION_TOURNAMENT_YEAR,
      vercelProjectId: activation.resources.vercelProjectId || "",
      vercelProjectName: activation.resources.vercelProjectName || "",
      candidateHostname: candidateOriginsApproved ? candidateHostname : "",
      deploymentHostname: candidateOriginsApproved ? deploymentHostname : "",
      canonicalHostname: PRODUCTION_CANONICAL_HOSTNAME,
      branch: branchApproved ? PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH : "",
      commitSha: expectedCommitApproved ? expectedCommitSha : "",
      cutoverPhase: phaseApproved ? activation.phase : "",
      scoringAuthority: scoringAuthorityApproved ? upper(scoringAuthority) : "",
      candidateDeploymentTarget: "PREVIEW",
    }),
    credentials: Object.freeze({
      separated: credentialsSeparated,
      legacyPublicKeySha256: legacy?.publicKeySha256 || "",
      dedicatedPublicKeySha256: dedicated?.publicKeySha256 || "",
    }),
    safety: Object.freeze({
      ...safety,
      automaticRestore: false,
      candidateOnly: true,
      candidateControlRuntime: true,
      controlPlaneCriticalWafRequired: true,
      databaseGoogleLeaseArmedGateRequiredForInstall: true,
      databaseRemovalAuthorizationRequired: true,
      exactCurrentOrLaterCutoverPhase: phaseApproved,
      liveProductionSelected: true,
      persistentUntilAuthorizedRemoval: true,
      providerFenceInstallPossible: allowed,
      step12Only: true,
    }),
  };
  Object.defineProperties(state, {
    legacyCredential: { value: legacy, enumerable: false },
    dedicatedCredential: { value: dedicated, enumerable: false },
  });
  return Object.freeze(state);
}

export function assertProductionGoogleWriterProviderFenceEnvironment(
  env = process.env,
) {
  const state = productionGoogleWriterProviderFenceEnvironment(env);
  if (!state.allowed) {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ENVIRONMENT_UNAVAILABLE",
      `The persistent writer fence is unavailable (${state.reason}).`,
      { status: 404, diagnostics: { reason: state.reason } },
    );
  }
  return state;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

const GOOGLE_DRIVE_METADATA_SCOPE =
  "https://www.googleapis.com/auth/drive.metadata.readonly";
const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_OAUTH_REQUEST_TIMEOUT_MS = 10_000;
const GOOGLE_DRIVE_ALLOWED_SCOPES = new Set([
  GOOGLE_DRIVE_METADATA_SCOPE,
  GOOGLE_DRIVE_FILE_SCOPE,
]);

async function serviceAccountAccessToken(credential, {
  fetchImpl,
  now = Date.now(),
  scope,
}) {
  if (!GOOGLE_DRIVE_ALLOWED_SCOPES.has(scope)) {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_TOKEN_SCOPE_INVALID",
      "The Google provider token requested an unapproved Drive-only scope.",
      { status: 500 },
    );
  }
  const issuedAt = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: credential.email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 900,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  const assertion = `${header}.${claims}.${signer.sign(
    credential.privateKey,
    "base64url",
  )}`;
  let response;
  try {
    response = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(GOOGLE_OAUTH_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_TOKEN_RESPONSE_UNKNOWN",
      "Google writer-fence authentication was unavailable.",
      { status: 503 },
    );
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.access_token !== "string" ||
      payload.access_token.length < 16) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_TOKEN_REJECTED",
      "Google rejected a writer-fence credential.",
      { status: 503, diagnostics: { providerStatus: response.status } },
    );
  }
  return payload.access_token;
}

function aclOptions(base, fetchImpl) {
  return clean(process.env.NODE_TEST_CONTEXT) === "child-v8"
    ? { ...base, fetchImpl }
    : base;
}

async function captureDriveAcl(environment, { fetchImpl, now }) {
  const [dedicatedToken, legacyToken] = await Promise.all([
    serviceAccountAccessToken(environment.dedicatedCredential, {
      fetchImpl,
      now,
      scope: GOOGLE_DRIVE_METADATA_SCOPE,
    }),
    serviceAccountAccessToken(environment.legacyCredential, {
      fetchImpl,
      now,
      scope: GOOGLE_DRIVE_METADATA_SCOPE,
    }),
  ]);
  const state = await inspectProductionGoogleDriveAclFence(aclOptions({
    accessToken: dedicatedToken,
    dedicatedPrincipalEmail: environment.dedicatedCredential.email,
    legacyPrincipalEmail: environment.legacyCredential.email,
    workbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
  }, fetchImpl));
  const legacyCapability = await inspectProductionGoogleDriveLegacyEditCapability(
    aclOptions({
      accessToken: legacyToken,
      expectedCanEdit: state.legacyRole === "writer",
      expectedCanShare: state.legacyRole === "writer",
      legacyPrincipalEmail: environment.legacyCredential.email,
      workbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    }, fetchImpl),
  );
  return Object.freeze({
    state,
    legacyCapability,
    providerObservedAt: new Date().toISOString(),
    providerFingerprint: fingerprint({
      schemaVersion: "step12-production-google-drive-acl-provider-state-v1",
      aclFingerprint: state.aclFingerprint,
      legacyEditCapabilityFingerprint: legacyCapability.capabilityFingerprint,
    }),
  });
}

async function createDrivePreflight(environment, snapshot, intent, {
  fetchImpl,
  now,
}) {
  const [permissionToken, legacyToken] = await Promise.all([
    serviceAccountAccessToken(environment.dedicatedCredential, {
      fetchImpl,
      now,
      scope: GOOGLE_DRIVE_FILE_SCOPE,
    }),
    serviceAccountAccessToken(environment.legacyCredential, {
      fetchImpl,
      now,
      scope: GOOGLE_DRIVE_METADATA_SCOPE,
    }),
  ]);
  return preflightProductionGoogleDriveAclTransition(aclOptions({
    currentState: snapshot.state,
    legacyReadAccessToken: legacyToken,
    permissionAccessToken: permissionToken,
    transitionIntent: intent,
  }, fetchImpl));
}

function receiptField(receipt, ...names) {
  for (const name of names) {
    const value = receipt?.[name];
    if (value !== undefined && value !== null && clean(value) !== "") return value;
  }
  return "";
}

function receiptId(receipt, ...names) {
  return lower(receiptField(receipt, ...names));
}

function publicDrivePermissionAudit(state) {
  return Object.freeze({
    aclFingerprint: state.aclFingerprint,
    dedicatedCanShare: state.dedicatedCanShare,
    dedicatedIdentityIsOwner: false,
    dedicatedIdentityRole: state.dedicatedRole,
    effectiveNonOwnerEditorFingerprint:
      state.effectiveNonOwnerEditorFingerprint,
    legacyIdentityCanEdit: state.legacyRole === "writer",
    legacyIdentityCanShare: state.legacyRole === "writer",
    legacyIdentityRole: state.legacyRole,
    nonOwnerEditorCount: state.nonOwnerEditorCount,
    ownerCount: state.ownerCount,
    ownerPrincipalFingerprint: state.ownerPrincipalFingerprint,
    permissionCount: state.permissionCount,
    permissionIdentityFingerprint: state.permissionIdentityFingerprint,
    permissionInventoryFingerprint: state.permissionInventoryFingerprint,
    writersCanShare: state.writersCanShare,
  });
}

function publicInspection(snapshot, environment) {
  return Object.freeze({
    contractVersion: environment.contractVersion,
    fenceKind: "DRIVE_ACL",
    protectedRangeRehearsalRetired: true,
    state: snapshot.state.legacyRole === "reader" ? "INSTALLED" : "ABSENT",
    baselineMetadataFingerprint: snapshot.state.aclFingerprint,
    currentMetadataFingerprint: snapshot.state.aclFingerprint,
    canonicalDataFingerprintCaptured: false,
    noSheetsTransportSentinelFingerprint:
      NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT,
    noSheetsTransportSentinelKind: "NO_SHEETS_TRANSPORT_V1",
    providerFingerprint: snapshot.providerFingerprint,
    providerObservedAt: snapshot.providerObservedAt,
    driveAcl: snapshot.state,
    drivePermissionAudit: publicDrivePermissionAudit(snapshot.state),
    resources: environment.resources,
    credentials: environment.credentials,
    applicationDataWriteIssued: false,
    providerValueWriteAttempted: false,
    protectedRangeMutationCount: 0,
  });
}

function lifecycleEnvironment(input, env) {
  return upper(input.quiescePurpose) === "REHEARSAL"
    ? assertProductionGoogleWriterFenceRehearsalEnvironment(env)
    : assertProductionGoogleWriterProviderFenceEnvironment(env);
}

function assertExactRequest(input, environment, action) {
  if (!isRequestId(input.operationRequestId) ||
      lower(input.expectedCommitSha) !== environment.resources.commitSha ||
      clean(input.expectedWorkbookId) !== PRODUCTION_GOOGLE_WORKBOOK_ID ||
      clean(input.expectedBranch) !== PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH ||
      clean(input.expectedDirectorPlayerId) !== PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR) {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REQUEST_SCOPE_INVALID",
      "The Drive ACL provider-fence request did not bind the exact candidate resources.",
      { status: 400 },
    );
  }
  const lifecycle = upper(input.quiescePurpose) === "REHEARSAL"
    ? "REHEARSAL" : "CUTOVER";
  if (action === "install" && (
    !isRequestId(input.quiesceEvidenceId) ||
    !isRequestId(input.criticalWafEpochId) ||
    !isSha256(input.expectedBaselineFingerprint) ||
    !isSha256(input.expectedCanonicalValueFingerprint) ||
    clean(input.confirmation) !== PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_DESCRIPTION
  )) {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_INSTALL_EVIDENCE_REQUIRED",
      "Drive ACL downgrade requires the exact active WAF epoch, quiesce, and provider baseline.",
      { status: 400 },
    );
  }
  if (["abort-install", "remove"].includes(action) && (
    !isRequestId(input.installRequestId) || !isRequestId(input.fenceId) ||
    !isRequestId(input.quiesceEvidenceId) ||
    !isSha256(input.expectedBaselineFingerprint) ||
    !isSha256(input.expectedCanonicalValueFingerprint)
  )) {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_RESTORE_EVIDENCE_REQUIRED",
      "Drive ACL restoration requires the exact fence, reattested quiesce, and baseline.",
      { status: 400 },
    );
  }
  if (action === "abort-install" && clean(input.confirmation) !==
      PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_CONFIRMATION) {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_RESTORE_CONFIRMATION_REQUIRED",
      "The exact provider-fence abort confirmation is required.",
      { status: 400 },
    );
  }
  if (action === "remove" && clean(input.confirmation) !==
      "REMOVE_STEP12_GOOGLE_WRITER_PROVIDER_FENCE") {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_REMOVE_CONFIRMATION_REQUIRED",
      "The exact authority-rollback ACL restoration confirmation is required.",
      { status: 400 },
    );
  }
  return Object.freeze({
    lifecycle,
    operationRequestFingerprint: fingerprint({
      action,
      contractVersion: environment.contractVersion,
      criticalWafEpochId: lower(input.criticalWafEpochId),
      expectedBaselineFingerprint: lower(input.expectedBaselineFingerprint),
      expectedCanonicalValueFingerprint:
        lower(input.expectedCanonicalValueFingerprint),
      fenceId: lower(input.fenceId),
      installRequestId: lower(input.installRequestId),
      lifecycle,
      operationRequestId: lower(input.operationRequestId),
      quiesceEvidenceId: lower(input.quiesceEvidenceId),
      resources: environment.resources,
    }),
  });
}

function assertNoSheetsTransportSentinel(input) {
  if (lower(input.expectedCanonicalValueFingerprint) !==
      NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT) {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_NO_SHEETS_SENTINEL_MISMATCH",
      "The request did not bind the exact no-Sheets-transport sentinel.",
      { status: 409, diagnostics: { canonicalDataFingerprintCaptured: false } },
    );
  }
}

function assertNewInstallBaseline(input, snapshot) {
  assertNoSheetsTransportSentinel(input);
  if (lower(input.expectedBaselineFingerprint) !== snapshot.state.aclFingerprint) {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_BASELINE_MISMATCH",
      "The Drive ACL provider baseline changed before the requested transition.",
      { status: 409, diagnostics: { providerMutationRecoveryRequired: false } },
    );
  }
}

function assertDurableBaseline(input, receipt) {
  assertNoSheetsTransportSentinel(input);
  const durableAclFingerprint = lower(receiptField(
    receipt,
    "baselineAclFingerprint",
    "baseline_acl_fingerprint",
  ));
  const durableSentinel = lower(receiptField(
    receipt,
    "baselineCanonicalValueFingerprint",
    "baseline_canonical_value_fingerprint",
  ));
  if (!isSha256(durableAclFingerprint) ||
      durableAclFingerprint !== lower(input.expectedBaselineFingerprint) ||
      durableSentinel !== NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT) {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_DURABLE_BASELINE_MISMATCH",
      "The request did not match the durable Drive ACL baseline.",
      { status: 409, diagnostics: { canonicalDataFingerprintCaptured: false } },
    );
  }
}

function fenceOwnership(receipt, input) {
  const fenceId = receiptId(receipt, "fenceId", "fence_id");
  const installRequestId = receiptId(
    receipt,
    "installRequestId",
    "install_request_id",
  );
  const expectedInstall = lower(input.installRequestId || input.operationRequestId);
  if (!isRequestId(fenceId) || installRequestId !== expectedInstall) {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_RECEIPT_SCOPE_INVALID",
      "The durable Drive ACL fence receipt did not match this exact operation.",
      { status: 503 },
    );
  }
  return Object.freeze({ fenceId, installRequestId });
}

function transitionIntentFromReceipt(receipt, direction) {
  const dispatch = direction === "INSTALL"
    ? receipt?.installDispatch || receipt?.install_dispatch
    : receipt?.abortDispatch || receipt?.abort_dispatch;
  const intent = dispatch?.transitionIntent || dispatch?.transition_intent;
  return intent && typeof intent === "object" && !Array.isArray(intent)
    ? intent : null;
}

function settlementState(receipt) {
  const settlement = receipt?.settlement || {};
  const rawStage = upper(receiptField(
    receipt,
    "providerSettlementStage",
    "provider_settlement_stage",
  ) || receiptField(settlement, "stage"));
  return Object.freeze({
    stage: rawStage === "AWAITING_ACL_READER_CONFIRMED" ? "" : rawStage,
    observationId: receiptId(
      receipt,
      "providerSettlementLatestObservationId",
      "provider_settlement_latest_observation_id",
    ) || receiptId(settlement, "observationId", "observation_id"),
    remainingWaitSeconds: Number(
      receiptField(
        receipt,
        "providerSettlementRemainingWaitSeconds",
        "provider_settlement_remaining_wait_seconds",
      ) || receiptField(
        settlement,
        "remainingWaitSeconds",
        "remaining_wait_seconds",
      ) || 0,
    ),
  });
}

function transitionProof(result) {
  const {
    afterState: _afterState,
    ambiguousOutcomeRecovered: _ambiguousOutcomeRecovered,
    durableAclResultReceipt: _durableAclResultReceipt,
    idempotentResume: _idempotentResume,
    legacyEditCapability: _legacyEditCapability,
    permissionTokenPreflightProved: _permissionTokenPreflightProved,
    providerPatchDispatched: _providerPatchDispatched,
    providerResponseKnown: _providerResponseKnown,
    providerStatus: _providerStatus,
    ...proof
  } = result;
  return Object.freeze(proof);
}

function settlementEvidence(snapshot, result, priorObservationId = "") {
  const proof = transitionProof(result);
  return Object.freeze({
    aclFingerprint: snapshot.state.aclFingerprint,
    aclTransitionProof: proof,
    aclTransitionProofFingerprint: proof.transitionFingerprint,
    // Legacy receipt-column names carry a typed no-transport sentinel here;
    // they do not attest to canonical Google application data.
    canonicalValueFingerprint: NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT,
    combinedValueFingerprint: NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT,
    formulaFingerprint: NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT,
    canonicalDataFingerprintCaptured: false,
    noSheetsTransportSentinelFingerprint:
      NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT,
    legacyEditCapabilityFingerprint:
      snapshot.legacyCapability.capabilityFingerprint,
    permissionInventoryFingerprint: snapshot.state.permissionInventoryFingerprint,
    priorObservationId,
    protectionRecords: Object.freeze([]),
    providerFingerprint: snapshot.providerFingerprint,
    providerObservedAt: snapshot.providerObservedAt,
    structuralCanaryFingerprint: proof.transitionFingerprint,
    transitionIntentFingerprint: proof.transitionIntentFingerprint,
    transitionProof: proof,
  });
}

function requiredControl(control, names) {
  const missing = names.filter((name) => typeof control?.[name] !== "function");
  if (missing.length) {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_CONTROL_REQUIRED",
      "The durable Drive ACL/WAF control plane is required.",
      { status: 503, diagnostics: { missingControlMethodCount: missing.length } },
    );
  }
}

async function reconcileTarget(environment, snapshot, intent, dependencies) {
  const preflight = await createDrivePreflight(
    environment,
    snapshot,
    intent,
    dependencies,
  );
  if (preflight.position !== "TARGET") {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_TARGET_NOT_CONFIRMED",
      "The durable dispatch result did not match the current Drive ACL target.",
      { status: 409, diagnostics: { providerMutationRecoveryRequired: true } },
    );
  }
  return transitionProductionGoogleLegacyDriveRole({
    providerPreflight: preflight,
    transitionIntent: intent,
  });
}

async function dispatchTransition({
  control,
  controlReceipt,
  dependencies,
  direction,
  environment,
  input,
  intent,
  operationRequestFingerprint,
  snapshot,
}) {
  const providerPreflight = await createDrivePreflight(
    environment,
    snapshot,
    intent,
    dependencies,
  );
  const dispatchReceipt = direction === "INSTALL"
    ? await control.beginInstallDispatch({
      controlReceipt,
      environment,
      input,
      operationRequestFingerprint,
      providerPreflight,
      transitionIntent: intent,
    })
    : await control.beginAbortDispatch({
      controlReceipt,
      environment,
      input,
      operationRequestFingerprint,
      providerPreflight,
      transitionIntent: intent,
    });
  if (dispatchReceipt.databaseRecoveryCapability) {
    return recoverProductionGoogleDriveAclTransitionOutcome({
      databaseRecoveryCapability: dispatchReceipt.databaseRecoveryCapability,
      providerPreflight,
      transitionIntent: intent,
    });
  }
  const providerMutationCapability =
    acceptProductionGoogleDriveAclProviderMutationDispatch({
      databaseDispatchCapability: dispatchReceipt.databaseDispatchCapability,
      providerPreflight,
      transitionIntent: intent,
    });
  try {
    return await transitionProductionGoogleLegacyDriveRole({
      providerPreflight,
      providerMutationCapability,
      transitionIntent: intent,
    });
  } finally {
    revokeProductionGoogleDriveAclProviderMutationDispatch(
      providerMutationCapability,
    );
  }
}

async function inspectOwnedControlReceipt(
  control,
  input,
  environment,
  ownership,
) {
  return control.inspect({
    input: Object.freeze({
      ...input,
      fenceId: ownership.fenceId,
      installRequestId: ownership.installRequestId,
    }),
    environment,
  });
}

async function captureConfirmedTransitionSnapshot(
  environment,
  dependencies,
  result,
) {
  const snapshot = await captureDriveAcl(environment, dependencies);
  if (snapshot.state.aclFingerprint !== result.afterState?.aclFingerprint ||
      snapshot.legacyCapability.capabilityFingerprint !==
        result.legacyEditCapability?.capabilityFingerprint) {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_TRANSITION_READBACK_DRIFT",
      "The Drive ACL changed after its durable transition result was recorded.",
      { status: 503, diagnostics: { providerMutationRecoveryRequired: true } },
    );
  }
  return snapshot;
}

async function executeInspect(input, environment, dependencies, control) {
  const snapshot = await captureDriveAcl(environment, dependencies);
  let controlReceipt = null;
  if (isRequestId(input.installRequestId)) {
    requiredControl(control, ["inspect"]);
    controlReceipt = await control.inspect({
      input,
      environment,
      operationRequestFingerprint: fingerprint({
        action: "inspect",
        fenceId: lower(input.fenceId),
        installRequestId: lower(input.installRequestId),
      }),
    });
  }
  return Object.freeze({
    ok: true,
    action: "inspect",
    controlReceipt,
    inspection: publicInspection(snapshot, environment),
    providerMutations: 0,
    applicationDataWriteIssued: false,
    applicationDataChanged: false,
    protectedRangeMutationCount: 0,
  });
}

async function executeInstall(
  input,
  environment,
  dependencies,
  control,
  operationRequestFingerprint,
) {
  requiredControl(control, [
    "discoverInstall", "beginInstall", "beginInstallDispatch", "inspect",
    "recordSettlement", "finishInstall",
  ]);
  let receipt = await control.discoverInstall({ input, environment });
  let snapshot = await captureDriveAcl(environment, dependencies);
  if (receipt?.found === false) {
    assertNewInstallBaseline(input, snapshot);
    if (snapshot.state.legacyRole !== "writer") {
      throw fenceError(
        "STEP12_GOOGLE_DRIVE_ACL_UNOWNED_READER_STATE",
        "The legacy Drive identity was already fenced without a durable owning receipt.",
        { status: 503, diagnostics: { providerMutationRecoveryRequired: true } },
      );
    }
    receipt = await control.beginInstall({
      input,
      environment,
      operationRequestFingerprint,
      lifecycleMode: upper(input.quiescePurpose) === "REHEARSAL"
        ? "REHEARSAL" : "CUTOVER",
      criticalWafEpochId: lower(input.criticalWafEpochId),
      dedicatedPrincipalFingerprint: snapshot.state.dedicatedPrincipalFingerprint,
      legacyCredentialGenerationFingerprint:
        environment.credentials.legacyPublicKeySha256,
      baselineProviderFingerprint: snapshot.providerFingerprint,
      baselineAclFingerprint: snapshot.state.aclFingerprint,
      baselineCanonicalValueFingerprint:
        NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT,
      baselineFormulaFingerprint: NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT,
      baselineCombinedValueFingerprint:
        NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT,
      writerScopeFingerprint: fingerprint({
        workbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
        dedicatedPrincipalFingerprint: snapshot.state.dedicatedPrincipalFingerprint,
        legacyPrincipalFingerprint: snapshot.state.legacyPrincipalFingerprint,
        fenceKind: "DRIVE_ACL",
      }),
      canonicalSheetUnionFingerprint: NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT,
    });
  } else {
    assertDurableBaseline(input, receipt);
  }
  const ownership = fenceOwnership(receipt, input);
  const status = upper(receiptField(receipt, "status"));
  if (["FAILED", "ACL_RESTORED_WAF_ACTIVE", "REMOVED"].includes(status)) {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_INSTALL_TERMINAL",
      "The durable Drive ACL fence is not eligible for installation.",
      { status: 409 },
    );
  }
  let intent = transitionIntentFromReceipt(receipt, "INSTALL");
  if (!intent) {
    if (snapshot.state.legacyRole !== "writer") {
      throw fenceError(
        "STEP12_GOOGLE_DRIVE_ACL_INSTALL_INTENT_MISSING",
        "A durable transition intent was required to recover this ACL state.",
        { status: 503, diagnostics: { providerMutationRecoveryRequired: true } },
      );
    }
    intent = createProductionGoogleDriveAclTransitionIntent({
      beforeLegacyCapability: snapshot.legacyCapability,
      beforeState: snapshot.state,
      fenceId: ownership.fenceId,
      installRequestId: ownership.installRequestId,
      targetRole: "reader",
    });
  }
  let result;
  const dispatch = receipt?.installDispatch || receipt?.install_dispatch || {};
  const dispatchOutcome = upper(
    receiptField(dispatch, "outcomeStatus", "outcome_status"),
  );
  if (dispatchOutcome === "TARGET_CONFIRMED") {
    result = await reconcileTarget(environment, snapshot, intent, dependencies);
  } else {
    result = await dispatchTransition({
      control,
      controlReceipt: receipt,
      dependencies,
      direction: "INSTALL",
      environment,
      input,
      intent,
      operationRequestFingerprint,
      snapshot,
    });
    snapshot = await captureConfirmedTransitionSnapshot(
      environment,
      dependencies,
      result,
    );
    receipt = await inspectOwnedControlReceipt(
      control,
      input,
      environment,
      ownership,
    );
  }
  const settlement = settlementState(receipt);
  const evidence = settlementEvidence(snapshot, result, settlement.observationId);
  if (!settlement.stage) {
    receipt = await control.recordSettlement({
      ...evidence,
      controlReceipt: receipt,
      environment,
      input,
      operationRequestFingerprint,
      stage: "ACL_READER_CONFIRMED",
    });
  } else if (settlement.stage === "ACL_READER_CONFIRMED" &&
      settlement.remainingWaitSeconds === 0) {
    receipt = await control.recordSettlement({
      ...evidence,
      controlReceipt: receipt,
      environment,
      input,
      operationRequestFingerprint,
      stage: "SETTLEMENT_READBACK_1",
    });
  } else if (settlement.stage === "SETTLEMENT_READBACK_1" &&
      settlement.remainingWaitSeconds === 0) {
    receipt = await control.finishInstall({
      ...evidence,
      aclReaderConfirmedObservationId: receiptId(
        receipt,
        "aclReaderConfirmedObservationId",
        "acl_reader_confirmed_observation_id",
        // Compatibility with already-created dormant receipts that used the
        // pre-retirement response label for the same observation.
        "protectionsInstalledObservationId",
        "protections_installed_observation_id",
      ),
      controlReceipt: receipt,
      environment,
      input,
      operationRequestFingerprint,
      settlementReadback1ObservationId: settlement.observationId,
      startSourceFingerprint: lower(receiptField(
        receipt,
        "startSourceFingerprint",
        "start_source_fingerprint",
      )),
    });
  }
  const finalSettlement = settlementState(receipt);
  return Object.freeze({
    ok: true,
    action: "install",
    controlReceipt: receipt,
    inspection: publicInspection(snapshot, environment),
    providerMutations: result.providerPatchDispatched === true ? 1 : 0,
    providerPatchDispatched: result.providerPatchDispatched === true,
    applicationDataWriteIssued: false,
    applicationDataChanged: false,
    protectedRangeMutationCount: 0,
    persistentFenceActive: snapshot.state.legacyRole === "reader",
    settlementStage: finalSettlement.stage || "ACL_READER_CONFIRMED",
    settlementRemainingWaitSeconds: finalSettlement.remainingWaitSeconds,
    baselineRestored: false,
  });
}

async function executeRestore(
  input,
  environment,
  dependencies,
  control,
  operationRequestFingerprint,
) {
  requiredControl(control, [
    "inspect", "beginAbortInstall", "beginAbortDispatch", "abortInstall",
  ]);
  let receipt = await control.inspect({
    input,
    environment,
    operationRequestFingerprint,
  });
  const ownership = fenceOwnership(receipt, input);
  assertDurableBaseline(input, receipt);
  let snapshot = await captureDriveAcl(environment, dependencies);
  const status = upper(receiptField(receipt, "status"));
  if (["FAILED", "BASELINE_RESTORED", "REMOVED"].includes(status) &&
      snapshot.state.legacyRole === "writer") {
    return Object.freeze({
      ok: true,
      action: input.action,
      idempotent: true,
      controlReceipt: receipt,
      inspection: publicInspection(snapshot, environment),
      providerMutations: 0,
      applicationDataWriteIssued: false,
      applicationDataChanged: false,
      protectedRangeMutationCount: 0,
      persistentFenceActive: false,
      baselineRestored: status !== "ACL_RESTORED_WAF_ACTIVE",
    });
  }
  if (snapshot.state.legacyRole !== "reader") {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_RESTORE_SOURCE_INVALID",
      "Only the exact durably-owned reader ACL may be restored.",
      { status: 409, diagnostics: { providerMutationRecoveryRequired: true } },
    );
  }
  if (status !== "ABORTING") {
    receipt = await control.beginAbortInstall({
      controlReceipt: receipt,
      environment,
      input,
      operationRequestFingerprint,
      restoreQuiesceEvidenceId: lower(input.quiesceEvidenceId),
    });
  }
  const remaining = Number(receiptField(
    receipt,
    "abortProviderQuiescenceRemainingSeconds",
    "abort_provider_quiescence_remaining_seconds",
  ) || 0);
  if (!Number.isSafeInteger(remaining) || remaining < 0) {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_RESTORE_HOLD_INVALID",
      "The durable Drive ACL restoration hold was invalid.",
      { status: 503 },
    );
  }
  if (remaining > 0) {
    return Object.freeze({
      ok: true,
      action: input.action,
      controlReceipt: receipt,
      inspection: publicInspection(snapshot, environment),
      providerMutations: 0,
      applicationDataWriteIssued: false,
      applicationDataChanged: false,
      protectedRangeMutationCount: 0,
      persistentFenceActive: true,
      restorationPending: true,
      restorationRemainingWaitSeconds: remaining,
      baselineRestored: false,
    });
  }
  let intent = transitionIntentFromReceipt(receipt, "ABORT");
  if (!intent) {
    intent = createProductionGoogleDriveAclTransitionIntent({
      beforeLegacyCapability: snapshot.legacyCapability,
      beforeState: snapshot.state,
      fenceId: ownership.fenceId,
      installRequestId: ownership.installRequestId,
      targetRole: "writer",
    });
  }
  const result = await dispatchTransition({
    control,
    controlReceipt: receipt,
    dependencies,
    direction: "ABORT",
    environment,
    input,
    intent,
    operationRequestFingerprint,
    snapshot,
  });
  snapshot = await captureConfirmedTransitionSnapshot(
    environment,
    dependencies,
    result,
  );
  receipt = await inspectOwnedControlReceipt(
    control,
    input,
    environment,
    ownership,
  );
  const proof = transitionProof(result);
  const abortDispatch = receipt?.abortDispatch || receipt?.abort_dispatch || {};
  receipt = await control.abortInstall({
    activeRunOwnedProtectionCount: 0,
    abortDispatchId: receiptId(abortDispatch, "dispatchId", "dispatch_id"),
    controlReceipt: receipt,
    environment,
    input,
    operationRequestFingerprint,
    providerObservedAt: snapshot.providerObservedAt,
    removedProtectionIds: Object.freeze([]),
    restoreTransitionProof: proof,
    restoreTransitionProofFingerprint: proof.transitionFingerprint,
    restoredAclFingerprint: snapshot.state.aclFingerprint,
    restoredCanonicalValueFingerprint:
      NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT,
    restoredCombinedValueFingerprint:
      NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT,
    restoredFormulaFingerprint: NO_SHEETS_TRANSPORT_SENTINEL_FINGERPRINT,
    restoredLegacyCanEdit: true,
    restoredLegacyCanShare: true,
    restoredLegacyRole: "writer",
    restoredProviderFingerprint: snapshot.providerFingerprint,
  });
  const finalStatus = upper(receiptField(receipt, "status"));
  return Object.freeze({
    ok: true,
    action: input.action,
    idempotent: result.idempotentResume === true,
    controlReceipt: receipt,
    inspection: publicInspection(snapshot, environment),
    providerMutations: result.providerPatchDispatched === true ? 1 : 0,
    applicationDataWriteIssued: false,
    applicationDataChanged: false,
    protectedRangeMutationCount: 0,
    persistentFenceActive: false,
    aclRestoredWafActive: finalStatus === "ACL_RESTORED_WAF_ACTIVE",
    baselineRestored: ["FAILED", "BASELINE_RESTORED", "REMOVED"].includes(
      finalStatus,
    ),
  });
}

async function executeProductionGoogleWriterProviderFenceWithDependencies(
  input = {},
  dependencies,
) {
  const environment = lifecycleEnvironment(input, dependencies.env);
  const action = lower(input.action);
  if (!["inspect", "install", "refresh", "abort-install", "remove"]
    .includes(action)) {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ACTION_INVALID",
      "The Drive ACL provider-fence action was invalid.",
      { status: 400 },
    );
  }
  const { operationRequestFingerprint } = assertExactRequest(
    input,
    environment,
    action,
  );
  if (action === "inspect") {
    return executeInspect(input, environment, dependencies, dependencies.control);
  }
  if (action === "refresh") {
    throw fenceError(
      "STEP12_GOOGLE_DRIVE_ACL_REFRESH_RETIRED",
      "The protected-range refresh action is retired; inspect or continue the exact ACL install request.",
      { status: 410 },
    );
  }
  if (action === "install") {
    return executeInstall(
      input,
      environment,
      dependencies,
      dependencies.control,
      operationRequestFingerprint,
    );
  }
  return executeRestore(
    input,
    environment,
    dependencies,
    dependencies.control,
    operationRequestFingerprint,
  );
}

/**
 * Historical direct Sheets rehearsal entrypoint. It intentionally performs no
 * environment evaluation, dependency loading, OAuth, provider read, or write.
 */
export async function executeProductionGoogleWriterFenceRehearsal(
  _input = {},
  _optionsInput = {},
) {
  throw fenceError(
    "STEP11_6_PROTECTED_RANGE_REHEARSAL_RETIRED",
    "The deprecated protected-range Production rehearsal is retired; use the exact Drive ACL rehearsal actions.",
    { status: 410 },
  );
}

export async function executeProductionGoogleWriterProviderFence(
  input = {},
  optionsInput = {},
) {
  const dependencies = await productionGoogleWriterExecutionDependencies(
    optionsInput,
  );
  return executeProductionGoogleWriterProviderFenceWithDependencies(
    input,
    dependencies,
  );
}

export function publicProductionGoogleWriterFenceError(error) {
  return Object.freeze({
    ok: false,
    error: "The Step 11.6 Google writer-fence operation did not complete.",
    code: /^[A-Z][A-Z0-9_]{2,100}$/.test(clean(error?.code))
      ? clean(error.code)
      : "STEP11_6_GOOGLE_WRITER_FENCE_FAILED",
    diagnostics: stableValue(error?.safeDiagnostics || {}),
  });
}
