import {
  createHash,
  createPublicKey,
  createSign,
  randomUUID,
} from "node:crypto";

import {
  PRODUCTION_GOOGLE_SERVICE_ACCOUNT_EXPECTED_EMAIL,
  PRODUCTION_VERCEL_PROJECT_ID,
} from "./google-service-account-credential-context.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";
import { PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES } from "./google-workbook-mutation-intent.js";
import {
  PRODUCTION_CANONICAL_HOSTNAME,
  PRODUCTION_VERCEL_PROJECT_NAME,
  productionShadowCandidateEnvironment,
} from "./production-shadow-candidate.js";
import {
  productionGoogleWriterAllMethodFenceHosts,
  productionGoogleWriterAllMethodFencePaths,
} from "./production-google-writer-fence-quiesce.js";
import { productionCutoverActivationEnvironment } from
  "./production-cutover-activation-contract.js";

export const PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_VERSION =
  "step11-6-production-google-writer-fence-rehearsal-v1";
export const PRODUCTION_GOOGLE_WRITER_FENCE_DESCRIPTION =
  "STEP11_6_WRITER_FENCE_REHEARSAL";
export const PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_DESCRIPTION =
  "STEP12_GOOGLE_WRITER_PROVIDER_FENCE";
export const PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_VERSION =
  "step12-production-google-writer-provider-fence-v1";
export const PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH =
  "feature/mock-tournament-qa-integration";
export const PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR = "CB01";
export const PRODUCTION_GOOGLE_WRITER_FENCE_OWNER_CONFIRMATION =
  "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS REHEARSAL";
export const PRODUCTION_GOOGLE_WRITER_FENCE_SHEET_IDS = Object.freeze({
  "Players": 0,
  "Awards": 28074660,
  "Calcutta Ownership": 214637017,
  "Net Skins Result": 270637829,
  "Calcutta Round Results": 314908504,
  "Calcutta Standings": 388354025,
  "Tournaments": 625223812,
  "Net Skins": 804336907,
  "Team Names": 844307454,
  "Live Matches": 1074655326,
  "Calcutta Purchases": 1403525379,
  "Admin Audit Log": 1404770729,
  "Match Update Log": 1471947317,
  "Courses": 1677468900,
  "Matches": 1763222762,
  "Live Hole Scores": 1802214847,
  "Handicaps": 1940053655,
});

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isSha256 = (value) => /^[0-9a-f]{64}$/.test(clean(value).toLowerCase());
const isCommitSha = (value) => /^[0-9a-f]{40}$/.test(clean(value).toLowerCase());
const isRequestId = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  .test(clean(value));

function descriptionPrefixFor(descriptionTag, runId) {
  const normalized = clean(runId).toLowerCase();
  return isRequestId(normalized)
    ? `${descriptionTag}:${normalized}`
    : "";
}

function runDescriptionPrefix(runId) {
  return descriptionPrefixFor(PRODUCTION_GOOGLE_WRITER_FENCE_DESCRIPTION, runId);
}

function sheetProtectionDescription(prefix, sheetId) {
  return `${prefix}:${sheetId}`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return sha256(JSON.stringify(stableValue(value)));
}

function fenceError(code, message, { status = 409, diagnostics = {} } = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.safeDiagnostics = Object.freeze({ ...diagnostics });
  return error;
}

function normalizedPrivateKey(value) {
  return clean(value).replace(/\\n/g, "\n");
}

function publicKeySha256(privateKey) {
  try {
    const publicKey = createPublicKey(privateKey).export({ type: "spki", format: "der" });
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
  const normalizedEmail = clean(email);
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

/**
 * Candidate-only environment gate. It deliberately does not make the normal
 * Production Google credential selector writable; this isolated provider
 * exercise has a separate enable flag, exact frozen SHA, and fixed branch.
 */
export function productionGoogleWriterFenceRehearsalEnvironment(env = process.env) {
  const candidate = productionShadowCandidateEnvironment(env);
  const allMethodFence = productionGoogleWriterAllMethodFenceHosts();
  const allMethodPaths = productionGoogleWriterAllMethodFencePaths();
  const requested = truthy(env.PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_REHEARSAL_ENABLED);
  const expectedCommitSha = clean(
    env.PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_EXPECTED_COMMIT_SHA,
  ).toLowerCase();
  const expectedCommitApproved = isCommitSha(expectedCommitSha) &&
    expectedCommitSha === candidate.resources.commitSha;
  const branchApproved = clean(env.VERCEL_GIT_COMMIT_REF) ===
    PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH;
  const workbookApproved = clean(env.GOOGLE_SHEETS_ID) === PRODUCTION_GOOGLE_WORKBOOK_ID &&
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
  const allowed = candidate.allowed && requested && expectedCommitApproved && branchApproved &&
    workbookApproved && !credentialError && dedicatedIdentityApproved && credentialsSeparated;
  const reason = allowed ? "step11-6-google-writer-fence-rehearsal-ready"
    : !candidate.allowed ? candidate.reason
    : !requested ? "writer-fence-rehearsal-disabled"
    : !expectedCommitApproved ? "exact-writer-fence-commit-required"
    : !branchApproved ? "exact-writer-fence-branch-required"
    : !workbookApproved ? "exact-production-workbook-required"
    : credentialError ? "writer-fence-credentials-required"
    : !dedicatedIdentityApproved ? "dedicated-production-google-identity-required"
    : !credentialsSeparated ? "separate-google-identities-required"
    : "writer-fence-rehearsal-unavailable";

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
      candidateOnly: true,
      liveDomainPromotion: false,
      scoringAuthorityChange: false,
      participantIdentityChange: false,
      supabaseApplicationDataMutation: false,
      controlPlaneReceiptRequired: true,
      applicationDataMutationIssued: false,
      canonicalValueFingerprintCaptured: false,
      drivePermissionInventoryRequired: true,
      broadDriveEditorPathAllowed: false,
      noValueWriteProof: true,
      providerValueWriteAttempted: false,
      protectedIdentityScope: "LEGACY_SERVICE_ACCOUNT_ONLY",
      spreadsheetOwnerOverrideTested: false,
      automaticRestore: true,
      allMethodFenceRequiredHostCount: allMethodFence.count,
      allMethodFenceRequiredHostsFingerprint: allMethodFence.fingerprint,
      allMethodFenceRequiredPathCount: allMethodPaths.count,
      allMethodFenceRequiredPathsFingerprint: allMethodPaths.fingerprint,
    }),
  };
  Object.defineProperties(state, {
    legacyCredential: { value: legacy, enumerable: false },
    dedicatedCredential: { value: dedicated, enumerable: false },
  });
  return Object.freeze(state);
}

export function assertProductionGoogleWriterFenceRehearsalEnvironment(env = process.env) {
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
  const activation = productionCutoverActivationEnvironment(env);
  const allMethodFence = productionGoogleWriterAllMethodFenceHosts();
  const allMethodPaths = productionGoogleWriterAllMethodFencePaths();
  const expectedCommitSha = clean(
    env.PRODUCTION_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_EXPECTED_COMMIT_SHA,
  ).toLowerCase();
  const requested = truthy(env.PRODUCTION_STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ENABLED);
  const rehearsalDisabled = !truthy(
    env.PRODUCTION_STEP11_6_GOOGLE_WRITER_FENCE_REHEARSAL_ENABLED,
  );
  const phaseApproved = activation.allowed && activation.phaseIndex >= 3;
  const expectedCommitApproved = isCommitSha(expectedCommitSha) &&
    expectedCommitSha === activation.resources.commitSha;
  const branchApproved = clean(env.VERCEL_GIT_COMMIT_REF) ===
    PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH;
  const candidateHostname = clean(env.VERCEL_BRANCH_URL).toLowerCase();
  const deploymentHostname = clean(env.VERCEL_URL).toLowerCase();
  const candidateOriginsApproved = candidateHostname.endsWith(".vercel.app") &&
    deploymentHostname.endsWith(".vercel.app") &&
    candidateHostname !== PRODUCTION_CANONICAL_HOSTNAME &&
    deploymentHostname !== PRODUCTION_CANONICAL_HOSTNAME;
  const workbookApproved = clean(env.GOOGLE_SHEETS_ID) ===
    PRODUCTION_GOOGLE_WORKBOOK_ID &&
    (!clean(env.GOOGLE_SHEETS_SPREADSHEET_ID) ||
      clean(env.GOOGLE_SHEETS_SPREADSHEET_ID) === PRODUCTION_GOOGLE_WORKBOOK_ID);
  const identityApproved = clean(env.PARTICIPANT_IDENTITY_AUTHORITY).toLowerCase() ===
    "supabase";
  const scoringAuthority = clean(env.SCORING_AUTHORITY || "google").toLowerCase();
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
  const allowed = requested && rehearsalDisabled && activation.allowed && phaseApproved &&
    expectedCommitApproved && branchApproved && candidateOriginsApproved &&
    workbookApproved && identityApproved && scoringAuthorityApproved &&
    !credentialError && dedicatedIdentityApproved && credentialsSeparated;
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
    reason: allowed ? "step12-google-writer-provider-fence-ready"
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
      scoringAuthority: scoringAuthorityApproved ? scoringAuthority.toUpperCase() : "",
    }),
    credentials: Object.freeze({
      separated: credentialsSeparated,
      legacyPublicKeySha256: legacy?.publicKeySha256 || "",
      dedicatedPublicKeySha256: dedicated?.publicKeySha256 || "",
    }),
    safety: Object.freeze({
      liveProductionSelected: true,
      candidateOnly: false,
      step12Only: true,
      exactCurrentOrLaterCutoverPhase: phaseApproved,
      databaseGoogleLeaseArmedGateRequiredForInstall: true,
      databaseRemovalAuthorizationRequired: true,
      controlPlaneReceiptRequired: true,
      applicationDataMutationIssued: false,
      providerValueWriteAttempted: false,
      noValueWriteProof: true,
      drivePermissionInventoryRequired: true,
      broadDriveEditorPathAllowed: false,
      protectedIdentityScope: "LEGACY_SERVICE_ACCOUNT_ONLY",
      spreadsheetOwnerOverrideTested: false,
      persistentUntilAuthorizedRemoval: true,
      automaticRestore: false,
      providerFenceInstallPossible: allowed,
      allMethodFenceRequiredHostCount: allMethodFence.count,
      allMethodFenceRequiredHostsFingerprint: allMethodFence.fingerprint,
      allMethodFenceRequiredPathCount: allMethodPaths.count,
      allMethodFenceRequiredPathsFingerprint: allMethodPaths.fingerprint,
    }),
  };
  Object.defineProperties(state, {
    legacyCredential: { value: legacy, enumerable: false },
    dedicatedCredential: { value: dedicated, enumerable: false },
  });
  return Object.freeze(state);
}

export function assertProductionGoogleWriterProviderFenceEnvironment(env = process.env) {
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

async function serviceAccountAccessToken(credential, { fetchImpl, now = Date.now() }) {
  const issuedAt = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: credential.email,
    scope: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ].join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 900,
    jti: randomUUID(),
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credential.privateKey).toString("base64url")}`;
  let response;
  try {
    response = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_OAUTH_UNAVAILABLE",
      "Google writer-fence authentication was unavailable.",
      { status: 503, diagnostics: { credentialLabel: credential.label } },
    );
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !clean(payload.access_token)) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_OAUTH_REJECTED",
      "Google rejected a writer-fence credential.",
      {
        status: 503,
        diagnostics: { credentialLabel: credential.label, providerStatus: response.status },
      },
    );
  }
  return clean(payload.access_token);
}

function sheetsApiBase() {
  return `https://sheets.googleapis.com/v4/spreadsheets/${PRODUCTION_GOOGLE_WORKBOOK_ID}`;
}

async function authorizedGoogleRequest(token, path, { fetchImpl, method = "GET", body } = {}) {
  try {
    return await fetchImpl(`${sheetsApiBase()}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_PROVIDER_RESPONSE_UNKNOWN",
      "The Google writer-fence provider response was not received.",
      { status: 503 },
    );
  }
}

async function googleJson(token, path, options) {
  const response = await authorizedGoogleRequest(token, path, options);
  if (!response.ok) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_PROVIDER_REJECTED",
      "Google rejected a writer-fence operation.",
      { status: 503, diagnostics: { providerStatus: response.status } },
    );
  }
  return response.json().catch(() => ({}));
}

async function authorizedDriveRequest(token, path, { fetchImpl } = {}) {
  try {
    return await fetchImpl(`https://www.googleapis.com/drive/v3${path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_DRIVE_RESPONSE_UNKNOWN",
      "The Google Drive permission inventory response was not received.",
      { status: 503 },
    );
  }
}

function safeGoogleProviderReasons(payload = {}) {
  const error = payload?.error && typeof payload.error === "object"
    ? payload.error : {};
  const candidates = [
    error.status,
    ...(Array.isArray(error.errors) ? error.errors.map((entry) => entry?.reason) : []),
    ...(Array.isArray(error.details) ? error.details.map((entry) => entry?.reason) : []),
  ];
  return [...new Set(candidates.map(clean).filter((reason) =>
    /^[A-Za-z][A-Za-z0-9_.-]{1,79}$/.test(reason)))].sort();
}

async function driveJson(token, path, { fetchImpl } = {}) {
  const response = await authorizedDriveRequest(token, path, { fetchImpl });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_DRIVE_PERMISSION_AUDIT_REJECTED",
      "Google Drive did not permit the required hash-only permission inventory.",
      {
        status: 503,
        diagnostics: {
          providerStatus: response.status,
          providerReasons: safeGoogleProviderReasons(payload),
        },
      },
    );
  }
  return response.json().catch(() => ({}));
}

const DRIVE_EDIT_ROLES = new Set(["owner", "organizer", "fileorganizer", "writer"]);

function drivePrincipalFingerprint(permission = {}) {
  const type = clean(permission.type).toLowerCase();
  const identifier = clean(
    permission.emailAddress || permission.domain || permission.id ||
      (type === "anyone" ? "anyone" : ""),
  ).toLowerCase();
  if (!type || !identifier) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_DRIVE_PERMISSION_AMBIGUOUS",
      "A Drive permission could not be represented without exposing its principal.",
      { status: 503 },
    );
  }
  return sha256(`google-drive-permission-principal-v1\n${type}\n${identifier}`);
}

/**
 * Enumerates the exact workbook ACL and returns hashes/counts only. Both
 * service accounts must be ordinary non-owner editors before a protected-range
 * denial can be attributed to the fence. Broad group/domain/anyone editor
 * grants fail closed, and the single human owner remains an explicit override.
 */
async function readDrivePermissionAudit(token, environment, fetchImpl) {
  const permissions = [];
  let pageToken = "";
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({
      fields: "nextPageToken,permissions(id,type,role,emailAddress,domain,allowFileDiscovery,pendingOwner)",
      pageSize: "100",
      supportsAllDrives: "true",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const payload = await driveJson(
      token,
      `/files/${encodeURIComponent(PRODUCTION_GOOGLE_WORKBOOK_ID)}/permissions?${query.toString()}`,
      { fetchImpl },
    );
    if (!Array.isArray(payload.permissions)) {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_DRIVE_PERMISSION_AUDIT_INCOMPLETE",
        "The Drive permission inventory was incomplete.",
        { status: 503 },
      );
    }
    permissions.push(...payload.permissions);
    pageToken = clean(payload.nextPageToken);
    if (!pageToken) break;
    if (page === 19) {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_DRIVE_PERMISSION_AUDIT_INCOMPLETE",
        "The Drive permission inventory exceeded its bounded page count.",
        { status: 503 },
      );
    }
  }
  if (!permissions.length) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_DRIVE_PERMISSION_AUDIT_EMPTY",
      "The Production workbook had no enumerable Drive permissions.",
      { status: 503 },
    );
  }
  const records = permissions.map((permission) => {
    const type = clean(permission.type).toLowerCase();
    const role = clean(permission.role).toLowerCase();
    return {
      principalFingerprint: drivePrincipalFingerprint(permission),
      permissionFingerprint: sha256(`google-drive-permission-id-v1\n${clean(permission.id)}`),
      type,
      role,
      pendingOwner: permission.pendingOwner === true,
      allowFileDiscovery: permission.allowFileDiscovery === true,
    };
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const duplicatePermissionIds = records.length - new Set(
    records.map((record) => record.permissionFingerprint),
  ).size;
  const owners = records.filter((record) => record.role === "owner");
  const nonOwnerEditors = records.filter((record) =>
    record.role !== "owner" && DRIVE_EDIT_ROLES.has(record.role));
  const broadNonOwnerEditors = nonOwnerEditors.filter((record) =>
    ["group", "domain", "anyone"].includes(record.type));
  const emailPrincipal = (email) => sha256(
    `google-drive-permission-principal-v1\nuser\n${clean(email).toLowerCase()}`,
  );
  const dedicated = records.filter((record) =>
    record.principalFingerprint === emailPrincipal(environment.dedicatedCredential.email));
  const legacy = records.filter((record) =>
    record.principalFingerprint === emailPrincipal(environment.legacyCredential.email));
  if (duplicatePermissionIds !== 0 || owners.length !== 1 ||
      records.some((record) => record.pendingOwner) ||
      dedicated.length !== 1 || legacy.length !== 1 ||
      !DRIVE_EDIT_ROLES.has(dedicated[0]?.role) || dedicated[0]?.role === "owner" ||
      !DRIVE_EDIT_ROLES.has(legacy[0]?.role) || legacy[0]?.role === "owner" ||
      broadNonOwnerEditors.length !== 0) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_DRIVE_PERMISSION_AUDIT_UNSAFE",
      "The Production workbook Drive ACL did not match the bounded non-owner writer-fence model.",
      {
        status: 503,
        diagnostics: {
          permissionCount: records.length,
          ownerCount: owners.length,
          pendingOwnerCount: records.filter((record) => record.pendingOwner).length,
          dedicatedIdentityPermissionCount: dedicated.length,
          legacyIdentityPermissionCount: legacy.length,
          broadNonOwnerEditorCount: broadNonOwnerEditors.length,
          duplicatePermissionIdCount: duplicatePermissionIds,
        },
      },
    );
  }
  const roleCounts = Object.fromEntries([...new Set(records.map((record) => record.role))]
    .sort().map((role) => [role, records.filter((record) => record.role === role).length]));
  const typeCounts = Object.fromEntries([...new Set(records.map((record) => record.type))]
    .sort().map((type) => [type, records.filter((record) => record.type === type).length]));
  const safeRecords = records.map(Object.freeze);
  const ownerPrincipalFingerprint = owners[0].principalFingerprint;
  const effectiveNonOwnerEditorFingerprint = fingerprint(nonOwnerEditors);
  return Object.freeze({
    permissionCount: records.length,
    ownerCount: 1,
    ownerPrincipalFingerprint,
    nonOwnerEditorCount: nonOwnerEditors.length,
    effectiveNonOwnerEditorFingerprint,
    broadNonOwnerEditorCount: 0,
    dedicatedIdentityRole: dedicated[0].role,
    legacyIdentityRole: legacy[0].role,
    dedicatedIdentityIsOwner: false,
    legacyIdentityIsOwner: false,
    roleCounts: Object.freeze(roleCounts),
    typeCounts: Object.freeze(typeCounts),
    permissionRecords: Object.freeze(safeRecords),
    permissionInventoryFingerprint: fingerprint(safeRecords),
    ownerOverrideScope: "SINGLE_DRIVE_OWNER_NOT_MACHINE_FENCED",
  });
}

const METADATA_FIELDS = [
  "spreadsheetId",
  "properties(title,locale,timeZone)",
  "namedRanges(namedRangeId,name,range)",
  "sheets(properties(sheetId,title,index,hidden,rightToLeft,gridProperties)," +
    "protectedRanges(protectedRangeId,description,warningOnly,range," +
    "editors(users,groups,domainUsersCanEdit),requestingUserCanEdit)," +
    "filterViews(filterViewId,title,range),basicFilter(range),merges)",
].join(",");

async function readProviderMetadata(token, fetchImpl) {
  const query = new URLSearchParams({
    includeGridData: "false",
    fields: METADATA_FIELDS,
  });
  const metadata = await googleJson(token, `?${query.toString()}`, { fetchImpl });
  if (clean(metadata.spreadsheetId) !== PRODUCTION_GOOGLE_WORKBOOK_ID) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_WORKBOOK_MISMATCH",
      "Google returned an unexpected workbook.",
      { status: 503 },
    );
  }
  return metadata;
}

async function readCanonicalValueEvidence(token, fetchImpl) {
  const evidence = [];
  for (const valueRenderOption of ["FORMULA", "UNFORMATTED_VALUE"]) {
    const query = new URLSearchParams({
      majorDimension: "ROWS",
      valueRenderOption,
      dateTimeRenderOption: "SERIAL_NUMBER",
    });
    for (const title of PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES) {
      // A quoted sheet title without a cell suffix asks Sheets for the entire
      // used value extent and does not silently stop at an arbitrary column.
      query.append("ranges", `'${title.replaceAll("'", "''")}'`);
    }
    const payload = await googleJson(
      token,
      `/values:batchGet?${query.toString()}`,
      { fetchImpl },
    );
    const ranges = payload.valueRanges || [];
    if (ranges.length !== PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES.length) {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_VALUE_READ_INCOMPLETE",
        "The canonical value fingerprint did not cover every fixed legacy sheet.",
        {
          status: 503,
          diagnostics: { valueRenderOption, observedRangeCount: ranges.length },
        },
      );
    }
    evidence.push({
      valueRenderOption,
      sheets: PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES.map((title, index) => ({
        title,
        range: clean(ranges[index]?.range),
        majorDimension: clean(ranges[index]?.majorDimension || "ROWS"),
        values: stableValue(ranges[index]?.values || []),
      })),
    });
  }
  if (fingerprint(evidence[0].sheets.map(({ title, range }) => ({ title, range }))) !==
      fingerprint(evidence[1].sheets.map(({ title, range }) => ({ title, range })))) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_VALUE_RANGE_MISMATCH",
      "Formula and unformatted value reads did not cover the same used ranges.",
      { status: 503 },
    );
  }
  return Object.freeze({
    formulaFingerprint: fingerprint(evidence[0]),
    unformattedValueFingerprint: fingerprint(evidence[1]),
    combinedFingerprint: fingerprint(evidence),
    usedRangeFingerprint: fingerprint(
      evidence[0].sheets.map(({ title, range }) => ({ title, range })),
    ),
  });
}

async function readCanonicalValueFingerprint(token, fetchImpl) {
  return (await readCanonicalValueEvidence(token, fetchImpl)).combinedFingerprint;
}

function providerStateFingerprint({
  metadataFingerprint,
  canonicalValueFingerprint,
  permissionInventoryFingerprint,
}) {
  return fingerprint({
    contractVersion: PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_VERSION,
    workbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    metadataFingerprint,
    canonicalValueFingerprint,
    permissionInventoryFingerprint,
  });
}

function writerScopeFingerprint(environment, analysis, drivePermissionAudit) {
  return fingerprint({
    contractVersion: PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_VERSION,
    workbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    canonicalSheetUnionFingerprint: analysis.canonicalSheetMapFingerprint,
    protectedIdentityScope: "LEGACY_SERVICE_ACCOUNT_ONLY",
    legacyPublicKeySha256: environment.credentials.legacyPublicKeySha256,
    dedicatedPublicKeySha256: environment.credentials.dedicatedPublicKeySha256,
    effectiveNonOwnerEditorFingerprint:
      drivePermissionAudit.effectiveNonOwnerEditorFingerprint,
    ownerPrincipalFingerprint: drivePermissionAudit.ownerPrincipalFingerprint,
  });
}

function safeRange(range = {}) {
  return Object.fromEntries([
    ["sheetId", Number(range.sheetId)],
    ["startRowIndex", Number.isInteger(range.startRowIndex) ? range.startRowIndex : undefined],
    ["endRowIndex", Number.isInteger(range.endRowIndex) ? range.endRowIndex : undefined],
    ["startColumnIndex", Number.isInteger(range.startColumnIndex) ? range.startColumnIndex : undefined],
    ["endColumnIndex", Number.isInteger(range.endColumnIndex) ? range.endColumnIndex : undefined],
  ].filter(([, value]) => value !== undefined));
}

function exactWholeSheetRange(range, sheetId) {
  const normalized = safeRange(range);
  return normalized.sheetId === sheetId && Object.keys(normalized).length === 1;
}

function principalHash(value) {
  return sha256(`google-protected-range-principal-v1\n${clean(value).toLowerCase()}`);
}

function safeProtection(protection = {}) {
  const editors = protection.editors || {};
  return {
    protectedRangeId: Number(protection.protectedRangeId),
    descriptionHash: sha256(clean(protection.description)),
    warningOnly: protection.warningOnly === true,
    range: safeRange(protection.range),
    editorHashes: (editors.users || []).map(principalHash).sort(),
    groupHashes: (editors.groups || []).map(principalHash).sort(),
    domainUsersCanEdit: editors.domainUsersCanEdit === true,
  };
}

function safeMetadata(metadata, { omitProtectionIds = new Set() } = {}) {
  return {
    spreadsheetId: clean(metadata.spreadsheetId),
    properties: {
      titleHash: sha256(clean(metadata.properties?.title)),
      locale: clean(metadata.properties?.locale),
      timeZone: clean(metadata.properties?.timeZone),
    },
    namedRanges: (metadata.namedRanges || []).map((range) => ({
      namedRangeId: clean(range.namedRangeId),
      nameHash: sha256(clean(range.name)),
      range: safeRange(range.range),
    })).sort((a, b) => a.namedRangeId.localeCompare(b.namedRangeId)),
    sheets: (metadata.sheets || []).map((sheet) => ({
      properties: {
        sheetId: Number(sheet.properties?.sheetId),
        titleHash: sha256(clean(sheet.properties?.title)),
        index: Number(sheet.properties?.index || 0),
        hidden: sheet.properties?.hidden === true,
        rightToLeft: sheet.properties?.rightToLeft === true,
        gridProperties: stableValue(sheet.properties?.gridProperties || {}),
      },
      protectedRanges: (sheet.protectedRanges || [])
        .filter((protection) => !omitProtectionIds.has(Number(protection.protectedRangeId)))
        .map(safeProtection)
        .sort((a, b) => a.protectedRangeId - b.protectedRangeId),
      filterViews: (sheet.filterViews || []).map((view) => ({
        filterViewId: Number(view.filterViewId),
        titleHash: sha256(clean(view.title)),
        range: safeRange(view.range),
      })).sort((a, b) => a.filterViewId - b.filterViewId),
      basicFilter: sheet.basicFilter ? { range: safeRange(sheet.basicFilter.range) } : null,
      merges: (sheet.merges || []).map(safeRange),
    })).sort((a, b) => a.properties.sheetId - b.properties.sheetId),
  };
}

function exactFenceEditors(editors, dedicatedEmail) {
  if (!editors || typeof editors !== "object" || Array.isArray(editors) ||
      !Array.isArray(editors.users) ||
      (editors.groups !== undefined && !Array.isArray(editors.groups))) return false;
  const users = [...new Set(editors.users.map((value) =>
    clean(value).toLowerCase()))].sort();
  return users.length === 1 && users[0] === dedicatedEmail.toLowerCase() &&
    !(editors.groups || []).length && editors.domainUsersCanEdit !== true;
}

function exactFenceProtection(protection, sheetId, dedicatedEmail, descriptionPrefix) {
  return Boolean(descriptionPrefix) &&
    clean(protection.description) === sheetProtectionDescription(descriptionPrefix, sheetId) &&
    protection.warningOnly !== true &&
    exactWholeSheetRange(protection.range, sheetId) &&
    exactFenceEditors(protection.editors, dedicatedEmail);
}

export function analyzeProductionGoogleWriterFenceMetadata(
  metadata,
  dedicatedEmail,
  {
    rehearsalRunId = "",
    descriptionPrefix = "",
    descriptionTag = PRODUCTION_GOOGLE_WRITER_FENCE_DESCRIPTION,
  } = {},
) {
  if (clean(metadata?.spreadsheetId) !== PRODUCTION_GOOGLE_WORKBOOK_ID) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_WORKBOOK_MISMATCH",
      "Writer-fence metadata did not belong to the Production workbook.",
      { status: 503 },
    );
  }
  const sheetsByTitle = new Map();
  for (const sheet of metadata.sheets || []) {
    const title = clean(sheet.properties?.title);
    if (!title || sheetsByTitle.has(title)) {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_SHEET_CATALOG_INVALID",
        "The Production workbook sheet catalog was ambiguous.",
        { status: 503 },
      );
    }
    sheetsByTitle.set(title, sheet);
  }
  const missing = PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES.filter((title) => !sheetsByTitle.has(title));
  if (missing.length) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_SHEET_MISSING",
      "The canonical legacy sheet union was incomplete in Production metadata.",
      { status: 503, diagnostics: { missingSheetCount: missing.length } },
    );
  }
  const expectedNames = Object.keys(PRODUCTION_GOOGLE_WRITER_FENCE_SHEET_IDS).sort();
  if (fingerprint(expectedNames) !== fingerprint(PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES)) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_INVENTORY_DRIFT",
      "The fixed provider sheet catalog no longer matches the canonical legacy writer union.",
      { status: 503 },
    );
  }

  const taggedPrefixes = new Set();
  for (const sheet of metadata.sheets || []) {
    for (const protection of sheet.protectedRanges || []) {
      const description = clean(protection.description);
      const match = description.match(new RegExp(
        `^${descriptionTag}:([0-9a-f-]{36}):(-?\\d+)$`, "i",
      ));
      if (match && isRequestId(match[1])) {
        taggedPrefixes.add(`${descriptionTag}:${match[1].toLowerCase()}`);
      }
    }
  }
  const requestedPrefix = clean(descriptionPrefix) || runDescriptionPrefix(rehearsalRunId);
  const selectedPrefix = requestedPrefix || (taggedPrefixes.size === 1 ? [...taggedPrefixes][0] : "");
  const exactProtectionIds = new Set();
  const exactProtectionRecords = [];
  const canonicalSheets = [];
  let conflictingProtectionCount = 0;
  let malformedTaggedProtectionCount = 0;
  for (const title of PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES) {
    const sheet = sheetsByTitle.get(title);
    const sheetId = Number(sheet.properties?.sheetId);
    if (!Number.isInteger(sheetId) ||
        sheetId !== PRODUCTION_GOOGLE_WRITER_FENCE_SHEET_IDS[title]) {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_SHEET_ID_INVALID",
        "A canonical legacy sheet did not match its fixed Production provider ID.",
        { status: 503 },
      );
    }
    const protections = sheet.protectedRanges || [];
    const exact = protections.filter((item) =>
      exactFenceProtection(item, sheetId, dedicatedEmail, selectedPrefix));
    const taggedMalformed = protections.filter((item) =>
      clean(item.description).startsWith(`${descriptionTag}:`) &&
      !exactFenceProtection(item, sheetId, dedicatedEmail, selectedPrefix));
    const other = protections.filter((item) => !exact.includes(item) && !taggedMalformed.includes(item));
    for (const item of exact) {
      const protectedRangeId = Number(item.protectedRangeId);
      exactProtectionIds.add(protectedRangeId);
      exactProtectionRecords.push({ protectedRangeId, sheetId });
    }
    conflictingProtectionCount += other.length;
    malformedTaggedProtectionCount += taggedMalformed.length;
    canonicalSheets.push({
      title,
      sheetId,
      exactFenceCount: exact.length,
      conflictingProtectionCount: other.length,
      malformedTaggedProtectionCount: taggedMalformed.length,
      requestingUserCanEdit: exact.length === 1 ? exact[0].requestingUserCanEdit === true : null,
    });
  }
  const exactFenceCount = exactProtectionIds.size;
  const absent = exactFenceCount === 0 && conflictingProtectionCount === 0 &&
    malformedTaggedProtectionCount === 0;
  const installed = exactFenceCount === canonicalSheets.length &&
    canonicalSheets.every((sheet) => sheet.exactFenceCount === 1) &&
    conflictingProtectionCount === 0 && malformedTaggedProtectionCount === 0;
  const state = absent ? "ABSENT" : installed ? "INSTALLED" : "CONFLICT";
  const baselineMetadata = safeMetadata(metadata, { omitProtectionIds: exactProtectionIds });
  const currentMetadata = safeMetadata(metadata);
  return Object.freeze({
    state,
    descriptionTag,
    descriptionPrefix: selectedPrefix,
    activeRehearsalRunIds: Object.freeze([...taggedPrefixes]
      .map((prefix) => prefix.slice(descriptionTag.length + 1)).sort()),
    canonicalSheetCount: canonicalSheets.length,
    exactFenceCount,
    conflictingProtectionCount,
    malformedTaggedProtectionCount,
    canonicalSheets: Object.freeze(canonicalSheets.map(Object.freeze)),
    canonicalSheetMapFingerprint: fingerprint(canonicalSheets.map(({ title, sheetId }) => ({ title, sheetId }))),
    baselineMetadataFingerprint: fingerprint(baselineMetadata),
    currentMetadataFingerprint: fingerprint(currentMetadata),
    fenceProtectionFingerprint: fingerprint(currentMetadata.sheets.flatMap((sheet) => sheet.protectedRanges)
      .filter((protection) => exactProtectionIds.has(protection.protectedRangeId))),
    exactProtectionIds,
    exactProtectionRecords: Object.freeze(exactProtectionRecords.map(Object.freeze)),
  });
}

function legacyIdentityViewMismatch(message, diagnostics = {}) {
  throw fenceError(
    "STEP11_6_GOOGLE_WRITER_FENCE_IDENTITY_VIEW_MISMATCH",
    message,
    { status: 503, diagnostics: { ...diagnostics, restoreRequired: true } },
  );
}

/**
 * Google can redact ProtectedRange.editors from metadata returned to an
 * identity that cannot edit the range. Bind that redacted view to the exact
 * dedicated-identity analysis instead of comparing identity-dependent metadata
 * fingerprints. Every protection ID and non-editor structural field must still
 * match, an exposed editors object must remain exact, and the legacy identity
 * must never report requestingUserCanEdit=true.
 */
function analyzeLegacyGoogleWriterFenceMetadata(
  metadata,
  dedicatedEmail,
  dedicatedAnalysis,
) {
  if (dedicatedAnalysis?.state !== "INSTALLED" ||
      dedicatedAnalysis.exactFenceCount !==
        PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES.length ||
      dedicatedAnalysis.exactProtectionRecords?.length !==
        PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES.length ||
      !clean(dedicatedAnalysis.descriptionPrefix)) {
    legacyIdentityViewMismatch(
      "The dedicated provider view did not supply an exact installed fence.",
    );
  }
  if (clean(metadata?.spreadsheetId) !== PRODUCTION_GOOGLE_WORKBOOK_ID) {
    legacyIdentityViewMismatch(
      "The legacy provider view did not belong to the Production workbook.",
    );
  }
  const sheetsByTitle = new Map();
  for (const sheet of metadata.sheets || []) {
    const title = clean(sheet.properties?.title);
    if (!title || sheetsByTitle.has(title)) {
      legacyIdentityViewMismatch("The legacy provider sheet catalog was ambiguous.");
    }
    sheetsByTitle.set(title, sheet);
  }
  const expectedBySheetId = new Map(dedicatedAnalysis.exactProtectionRecords
    .map(({ protectedRangeId, sheetId }) => [Number(sheetId), Object.freeze({
      protectedRangeId: Number(protectedRangeId),
      sheetId: Number(sheetId),
      description: sheetProtectionDescription(
        dedicatedAnalysis.descriptionPrefix,
        Number(sheetId),
      ),
    })]));
  if (expectedBySheetId.size !== PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES.length ||
      new Set([...expectedBySheetId.values()].map((record) =>
        record.protectedRangeId)).size !== expectedBySheetId.size) {
    legacyIdentityViewMismatch("The dedicated provider protection identities were ambiguous.");
  }
  const tagged = [];
  for (const sheet of metadata.sheets || []) {
    for (const protection of sheet.protectedRanges || []) {
      if (clean(protection.description).startsWith(
        `${dedicatedAnalysis.descriptionTag}:`,
      )) tagged.push({ sheet, protection });
    }
  }
  const observed = [];
  const canonicalSheets = [];
  for (const title of PRODUCTION_CANONICAL_LEGACY_SHEET_NAMES) {
    const sheet = sheetsByTitle.get(title);
    const sheetId = Number(sheet?.properties?.sheetId);
    const expected = expectedBySheetId.get(sheetId);
    if (!sheet || sheetId !== PRODUCTION_GOOGLE_WRITER_FENCE_SHEET_IDS[title] ||
        !expected) {
      legacyIdentityViewMismatch(
        "The legacy provider sheet map differed from the dedicated view.",
      );
    }
    const candidates = (sheet.protectedRanges || []).filter((protection) =>
      Number(protection.protectedRangeId) === expected.protectedRangeId);
    if (candidates.length !== 1) {
      legacyIdentityViewMismatch(
        "The legacy provider view omitted or duplicated an exact protection identity.",
        { sheetId, observedProtectionCount: candidates.length },
      );
    }
    const protection = candidates[0];
    const editorsVisible = Object.prototype.hasOwnProperty.call(protection, "editors");
    if (clean(protection.description) !== expected.description ||
        protection.warningOnly === true ||
        !exactWholeSheetRange(protection.range, sheetId) ||
        protection.requestingUserCanEdit === true ||
        (editorsVisible && !exactFenceEditors(protection.editors, dedicatedEmail))) {
      legacyIdentityViewMismatch(
        "The legacy provider protection structure differed from the dedicated view.",
        { sheetId, editorsVisible },
      );
    }
    observed.push(Object.freeze({
      protectedRangeId: expected.protectedRangeId,
      sheetId,
      descriptionHash: sha256(expected.description),
      warningOnly: false,
      range: Object.freeze({ sheetId }),
      editorsVisible,
      requestingUserCanEdit: false,
    }));
    canonicalSheets.push(Object.freeze({
      title,
      sheetId,
      exactFenceCount: 1,
      conflictingProtectionCount: 0,
      malformedTaggedProtectionCount: 0,
      requestingUserCanEdit: false,
    }));
  }
  const taggedIds = tagged.map(({ protection }) => Number(protection.protectedRangeId));
  const expectedIds = [...expectedBySheetId.values()]
    .map((record) => record.protectedRangeId).sort((left, right) => left - right);
  if (tagged.length !== expectedIds.length ||
      new Set(taggedIds).size !== taggedIds.length ||
      JSON.stringify([...taggedIds].sort((left, right) => left - right)) !==
        JSON.stringify(expectedIds)) {
    legacyIdentityViewMismatch(
      "The legacy provider view contained a missing or extra tagged protection.",
      { expectedProtectionCount: expectedIds.length, observedTaggedCount: tagged.length },
    );
  }
  return Object.freeze({
    state: "INSTALLED",
    descriptionTag: dedicatedAnalysis.descriptionTag,
    descriptionPrefix: dedicatedAnalysis.descriptionPrefix,
    activeRehearsalRunIds: dedicatedAnalysis.activeRehearsalRunIds,
    canonicalSheetCount: canonicalSheets.length,
    exactFenceCount: observed.length,
    conflictingProtectionCount: 0,
    malformedTaggedProtectionCount: 0,
    canonicalSheets: Object.freeze(canonicalSheets),
    canonicalSheetMapFingerprint: fingerprint(
      canonicalSheets.map(({ title, sheetId }) => ({ title, sheetId })),
    ),
    fenceProtectionFingerprint: fingerprint(observed),
    exactProtectionIds: new Set(expectedIds),
    exactProtectionRecords: dedicatedAnalysis.exactProtectionRecords,
  });
}

function publicInspection(analysis, environment, {
  canonicalValueFingerprint = "",
  drivePermissionAudit = null,
  providerFingerprint = "",
} = {}) {
  return Object.freeze({
    contractVersion: PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_VERSION,
    fenceDescriptionTag: analysis.descriptionTag,
    activeRehearsalRunIds: analysis.activeRehearsalRunIds,
    recoveryRunId: analysis.activeRehearsalRunIds.length === 1
      ? analysis.activeRehearsalRunIds[0] : "",
    state: analysis.state,
    canonicalSheetCount: analysis.canonicalSheetCount,
    exactFenceCount: analysis.exactFenceCount,
    conflictingProtectionCount: analysis.conflictingProtectionCount,
    malformedTaggedProtectionCount: analysis.malformedTaggedProtectionCount,
    canonicalSheets: analysis.canonicalSheets.map(({ title, sheetId, exactFenceCount }) => ({
      title,
      sheetId,
      protectedByExactFence: exactFenceCount === 1,
    })),
    canonicalSheetMapFingerprint: analysis.canonicalSheetMapFingerprint,
    baselineMetadataFingerprint: analysis.baselineMetadataFingerprint,
    currentMetadataFingerprint: analysis.currentMetadataFingerprint,
    canonicalValueFingerprint,
    providerFingerprint,
    drivePermissionAudit,
    fenceProtectionFingerprint: analysis.fenceProtectionFingerprint,
    credentials: environment.credentials,
    resources: environment.resources,
    safety: environment.safety,
    applyReady: analysis.state === "ABSENT",
    rehearseReady: analysis.state === "ABSENT" || analysis.state === "INSTALLED",
    restoreReady: analysis.state === "INSTALLED",
  });
}

function assertExpectedInput(input, environment, action) {
  const suppliedCommit = clean(input.expectedCommitSha).toLowerCase();
  if (suppliedCommit !== environment.resources.commitSha || !isCommitSha(suppliedCommit)) {
    throw fenceError("STEP11_6_GOOGLE_WRITER_FENCE_STALE_COMMIT",
      "The writer-fence request did not bind the exact candidate commit.");
  }
  if (clean(input.expectedWorkbookId) !== PRODUCTION_GOOGLE_WORKBOOK_ID ||
      clean(input.expectedBranch) !== PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH ||
      clean(input.expectedDirectorPlayerId) !== PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR) {
    throw fenceError("STEP11_6_GOOGLE_WRITER_FENCE_RESOURCE_MISMATCH",
      "The writer-fence request did not bind the exact certified resource tuple.");
  }
  if (!isRequestId(input.operationRequestId)) {
    throw fenceError("STEP11_6_GOOGLE_WRITER_FENCE_REQUEST_ID_INVALID",
      "A UUID operation request identity is required.", { status: 400 });
  }
  if (action === "restore" && !isRequestId(input.rehearsalRunId)) {
    throw fenceError("STEP11_6_GOOGLE_WRITER_FENCE_RUN_ID_INVALID",
      "An exact durable rehearsal run identity is required.", { status: 400 });
  }
  if (action === "restore" && !isRequestId(input.rehearsalRequestId)) {
    throw fenceError("STEP11_6_GOOGLE_WRITER_FENCE_REHEARSAL_REQUEST_ID_INVALID",
      "The original durable rehearsal request identity is required for recovery.", { status: 400 });
  }
  if (["rehearse", "restore"].includes(action) && !isSha256(input.expectedBaselineFingerprint)) {
    throw fenceError("STEP11_6_GOOGLE_WRITER_FENCE_BASELINE_REQUIRED",
      "An exact inspected baseline fingerprint is required.", { status: 400 });
  }
  if (["rehearse", "restore"].includes(action) &&
      !isSha256(input.expectedCanonicalValueFingerprint)) {
    throw fenceError("STEP11_6_GOOGLE_WRITER_FENCE_VALUE_FINGERPRINT_REQUIRED",
      "An exact canonical value fingerprint is required.", { status: 400 });
  }
  if (["rehearse", "restore"].includes(action) &&
      clean(input.confirmation) !== PRODUCTION_GOOGLE_WRITER_FENCE_DESCRIPTION) {
    throw fenceError("STEP11_6_GOOGLE_WRITER_FENCE_CONFIRMATION_REQUIRED",
      "The exact writer-fence confirmation contract is required.", { status: 400 });
  }
  if (action === "rehearse") {
    if (!isRequestId(input.quiesceEvidenceId)) {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_CONTROL_EVIDENCE_INVALID",
        "A durable, server-verified quiesce evidence identity is required.",
        { status: 400 },
      );
    }
  }
  return fingerprint({
    contractVersion: PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_VERSION,
    action,
    operationRequestId: clean(input.operationRequestId).toLowerCase(),
    rehearsalRunId: clean(input.rehearsalRunId).toLowerCase(),
    rehearsalRequestId: clean(input.rehearsalRequestId).toLowerCase(),
    expectedCommitSha: suppliedCommit,
    expectedWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    expectedBranch: PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH,
    expectedDirectorPlayerId: PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR,
    expectedBaselineFingerprint: clean(input.expectedBaselineFingerprint).toLowerCase(),
    expectedCanonicalValueFingerprint: clean(input.expectedCanonicalValueFingerprint).toLowerCase(),
    quiesceEvidenceId: action === "rehearse"
      ? clean(input.quiesceEvidenceId).toLowerCase() : "",
  });
}

function assertBaseline(analysis, expectedBaselineFingerprint) {
  if (analysis.baselineMetadataFingerprint !== clean(expectedBaselineFingerprint).toLowerCase()) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_BASELINE_DRIFT",
      "Production workbook metadata changed after writer-fence inspection.",
      {
        diagnostics: {
          observedBaselineFingerprint: analysis.baselineMetadataFingerprint,
          expectedBaselineFingerprint: clean(expectedBaselineFingerprint).toLowerCase(),
        },
      },
    );
  }
}

function addFenceRequests(analysis, dedicatedEmail) {
  return analysis.canonicalSheets.map(({ sheetId }) => ({
    addProtectedRange: {
      protectedRange: {
        range: { sheetId },
        description: sheetProtectionDescription(analysis.descriptionPrefix, sheetId),
        warningOnly: false,
        editors: {
          users: [dedicatedEmail],
          domainUsersCanEdit: false,
        },
      },
    },
  }));
}

function deleteFenceRequests(analysis) {
  return [...analysis.exactProtectionIds].sort((a, b) => a - b).map((protectedRangeId) => ({
    deleteProtectedRange: { protectedRangeId },
  }));
}

function assertProviderEditability(analysis, expected, identityLabel) {
  if (analysis.state !== "INSTALLED") {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_INSTALL_READBACK_FAILED",
      "The exact whole-sheet writer fence was not visible to both provider identities.",
      { status: 503, diagnostics: { identityLabel, observedState: analysis.state } },
    );
  }
  const mismatches = analysis.canonicalSheets.filter((sheet) =>
    sheet.requestingUserCanEdit !== expected);
  if (mismatches.length) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_EDITABILITY_PROOF_FAILED",
      "Provider metadata did not prove the expected protected-range editability.",
      {
        status: 503,
        diagnostics: {
          identityLabel,
          expectedRequestingUserCanEdit: expected,
          mismatchCount: mismatches.length,
          restoreRequired: true,
        },
      },
    );
  }
}

function assertStableDrivePermissionAudit(initial, observed, { restoreRequired }) {
  if (initial.permissionInventoryFingerprint !== observed.permissionInventoryFingerprint ||
      initial.ownerPrincipalFingerprint !== observed.ownerPrincipalFingerprint ||
      initial.effectiveNonOwnerEditorFingerprint !==
        observed.effectiveNonOwnerEditorFingerprint) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_DRIVE_PERMISSION_DRIFT",
      "The Production workbook Drive permission inventory changed during the rehearsal.",
      { status: 503, diagnostics: { restoreRequired } },
    );
  }
}

async function readWriterFenceProviderSnapshot(
  token,
  environment,
  fetchImpl,
  fenceScope = {},
) {
  const analysis = await freshAnalysis(token, environment, fetchImpl, fenceScope);
  const canonicalValues = await readCanonicalValueEvidence(token, fetchImpl);
  const drivePermissionAudit = await readDrivePermissionAudit(
    token,
    environment,
    fetchImpl,
  );
  return Object.freeze({
    analysis,
    canonicalValues,
    drivePermissionAudit,
    providerFingerprint: providerStateFingerprint({
      metadataFingerprint: analysis.currentMetadataFingerprint,
      canonicalValueFingerprint: canonicalValues.combinedFingerprint,
      permissionInventoryFingerprint:
        drivePermissionAudit.permissionInventoryFingerprint,
    }),
  });
}

function persistentProtectionRecords(dedicatedAnalysis, legacyAnalysis) {
  const legacyBySheet = new Map(
    legacyAnalysis.canonicalSheets.map((sheet) => [sheet.sheetId, sheet]),
  );
  return Object.freeze(dedicatedAnalysis.exactProtectionRecords
    .map(({ sheetId, protectedRangeId }) => Object.freeze({
      sheetId,
      protectedRangeId,
      description: sheetProtectionDescription(dedicatedAnalysis.descriptionPrefix, sheetId),
      warningOnly: false,
      dedicatedRequestingUserCanEdit: dedicatedAnalysis.canonicalSheets
        .find((sheet) => sheet.sheetId === sheetId)?.requestingUserCanEdit === true,
      legacyRequestingUserCanEdit:
        legacyBySheet.get(sheetId)?.requestingUserCanEdit === true,
    }))
    .sort((a, b) => a.sheetId - b.sheetId));
}

async function proveLegacyStructuralMutationRejected({ legacyToken, analysis, fetchImpl }) {
  const protectedRangeId = [...analysis.exactProtectionIds].sort((a, b) => a - b)[0];
  const canarySheetId = analysis.exactProtectionRecords.find((entry) =>
    entry.protectedRangeId === protectedRangeId)?.sheetId;
  if (!Number.isInteger(protectedRangeId) || !Number.isInteger(canarySheetId)) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_CANARY_MISSING",
      "An exact run-owned protection was not available for the provider canary.",
      { status: 503, diagnostics: { restoreRequired: true } },
    );
  }
  let response;
  try {
    response = await authorizedGoogleRequest(legacyToken, ":batchUpdate", {
      fetchImpl,
      method: "POST",
      body: {
        requests: [{
          updateProtectedRange: {
            protectedRange: {
              protectedRangeId,
              description: sheetProtectionDescription(analysis.descriptionPrefix, canarySheetId),
            },
            fields: "description",
          },
        }],
        includeSpreadsheetInResponse: false,
      },
    });
  } catch (error) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_CANARY_RESPONSE_UNKNOWN",
      "The legacy structural canary did not return a conclusive provider response.",
      { status: 503, diagnostics: { restoreRequired: true } },
    );
  }
  const providerStatus = Number(response.status || 0);
  await response.text().catch(() => "");
  if (providerStatus !== 403) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_CANARY_NOT_REJECTED",
      "Google did not reject the legacy identity's run-owned protection canary.",
      {
        status: 503,
        diagnostics: {
          providerStatus,
          restoreRequired: true,
          applicationDataWriteIssued: false,
        },
      },
    );
  }
  return Object.freeze({
    providerRejected: true,
    providerStatus,
    operationClass: "RUN_OWNED_PROTECTED_RANGE_SAME_DESCRIPTION_UPDATE",
    providerStructuralWriteAttempted: true,
    providerValueWriteAttempted: false,
    applicationDataWriteIssued: false,
  });
}

async function freshAnalysis(token, environment, fetchImpl, fenceScope = {}) {
  const metadata = await readProviderMetadata(token, fetchImpl);
  return analyzeProductionGoogleWriterFenceMetadata(
    metadata,
    environment.dedicatedCredential.email,
    fenceScope,
  );
}

async function freshLegacyAnalysis(
  token,
  dedicatedAnalysis,
  environment,
  fetchImpl,
) {
  const metadata = await readProviderMetadata(token, fetchImpl);
  return analyzeLegacyGoogleWriterFenceMetadata(
    metadata,
    environment.dedicatedCredential.email,
    dedicatedAnalysis,
  );
}

async function installFence({ dedicatedToken, analysis, environment, fetchImpl, fenceScope }) {
  if (analysis.state === "INSTALLED") return { analysis, mutated: false, recovered: true };
  let mutationError = null;
  try {
    await googleJson(dedicatedToken, ":batchUpdate", {
      fetchImpl,
      method: "POST",
      body: {
        requests: addFenceRequests(analysis, environment.dedicatedCredential.email),
        includeSpreadsheetInResponse: false,
      },
    });
  } catch (error) {
    mutationError = error;
  }
  const observed = await freshAnalysis(dedicatedToken, environment, fetchImpl, fenceScope);
  if (observed.state === "INSTALLED") {
    return { analysis: observed, mutated: true, recovered: Boolean(mutationError) };
  }
  if (mutationError) throw mutationError;
  throw fenceError(
    "STEP11_6_GOOGLE_WRITER_FENCE_INSTALL_READBACK_FAILED",
    "The exact whole-sheet writer fence was not visible after provider mutation.",
    { status: 503, diagnostics: { observedState: observed.state, restoreRequired: true } },
  );
}

async function restoreFence({ dedicatedToken, environment, expectedBaselineFingerprint, fetchImpl, fenceScope }) {
  let observed = await freshAnalysis(dedicatedToken, environment, fetchImpl, fenceScope);
  assertBaseline(observed, expectedBaselineFingerprint);
  if (observed.state === "CONFLICT") {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_RESTORE_CONFLICT",
      "Only the exact tagged writer-fence protections may be restored.",
      {
        status: 503,
        diagnostics: {
          conflictingProtectionCount: observed.conflictingProtectionCount,
          malformedTaggedProtectionCount: observed.malformedTaggedProtectionCount,
          restoreRequired: true,
        },
      },
    );
  }
  const alreadyRestored = observed.state === "ABSENT";
  let mutationError = null;
  if (!alreadyRestored) {
    try {
      await googleJson(dedicatedToken, ":batchUpdate", {
        fetchImpl,
        method: "POST",
        body: {
          requests: deleteFenceRequests(observed),
          includeSpreadsheetInResponse: false,
        },
      });
    } catch (error) {
      mutationError = error;
    }
    observed = await freshAnalysis(dedicatedToken, environment, fetchImpl, fenceScope);
  }
  if (observed.state !== "ABSENT" ||
      observed.currentMetadataFingerprint !== clean(expectedBaselineFingerprint).toLowerCase()) {
    if (mutationError && observed.state === "INSTALLED") throw mutationError;
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_RESTORE_READBACK_FAILED",
      "The exact baseline Production metadata was not restored.",
      {
        status: 503,
        diagnostics: {
          observedState: observed.state,
          observedMetadataFingerprint: observed.currentMetadataFingerprint,
          expectedMetadataFingerprint: clean(expectedBaselineFingerprint).toLowerCase(),
          restoreRequired: observed.state !== "ABSENT",
        },
      },
    );
  }
  return {
    analysis: observed,
    mutated: !alreadyRestored,
    recovered: Boolean(mutationError),
    alreadyRestored,
  };
}

/**
 * State-reconciled operations remain safe after a lost HTTP response:
 * - add/delete protected ranges is one atomic Sheets batchUpdate;
 * - retries discover provider state before issuing another mutation;
 * - per-identity requestingUserCanEdit metadata plus one same-description
 *   update of a run-owned protection proves provider rejection without any
 *   cell/value or application-data write;
 * - restore deletes only exact tagged, whole-sheet, dedicated-editor ranges.
 */
export async function executeProductionGoogleWriterFenceRehearsal(
  input = {},
  {
    env = process.env,
    fetchImpl = globalThis.fetch,
    now = Date.now(),
    receipt = {},
  } = {},
) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const environment = assertProductionGoogleWriterFenceRehearsalEnvironment(env);
  const action = clean(input.action).toLowerCase();
  if (!["inspect", "rehearse", "restore"].includes(action)) {
    throw fenceError("STEP11_6_GOOGLE_WRITER_FENCE_ACTION_INVALID",
      "The writer-fence action must be inspect, rehearse, or restore.", { status: 400 });
  }
  const operationRequestFingerprint = assertExpectedInput(input, environment, action);
  const dedicatedToken = await serviceAccountAccessToken(
    environment.dedicatedCredential,
    { fetchImpl, now },
  );
  let analysis = await freshAnalysis(dedicatedToken, environment, fetchImpl, {
    rehearsalRunId: input.rehearsalRunId,
  });
  const initialCanonicalValueFingerprint = await readCanonicalValueFingerprint(
    dedicatedToken,
    fetchImpl,
  );
  const initialDrivePermissionAudit = await readDrivePermissionAudit(
    dedicatedToken,
    environment,
    fetchImpl,
  );
  const initialProviderFingerprint = providerStateFingerprint({
    metadataFingerprint: analysis.currentMetadataFingerprint,
    canonicalValueFingerprint: initialCanonicalValueFingerprint,
    permissionInventoryFingerprint:
      initialDrivePermissionAudit.permissionInventoryFingerprint,
  });

  if (action === "inspect") {
    let controlReceipt = null;
    if (isRequestId(input.rehearsalRunId) && typeof receipt.inspect === "function") {
      controlReceipt = await receipt.inspect({ input, environment, operationRequestFingerprint });
    }
    return Object.freeze({
      ok: true,
      action,
      idempotent: true,
      operationRequestFingerprint,
      inspection: publicInspection(analysis, environment, {
        canonicalValueFingerprint: initialCanonicalValueFingerprint,
        drivePermissionAudit: initialDrivePermissionAudit,
        providerFingerprint: initialProviderFingerprint,
      }),
      controlReceipt,
      providerMutations: 0,
      applicationDataWriteIssued: false,
      canonicalValueFingerprintStable: false,
    });
  }

  assertBaseline(analysis, input.expectedBaselineFingerprint);
  if (initialCanonicalValueFingerprint !== clean(input.expectedCanonicalValueFingerprint).toLowerCase()) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_CANONICAL_VALUE_DRIFT",
      "Canonical Production Google values changed after inspection.",
      {
        diagnostics: {
          expectedCanonicalValueFingerprint: clean(input.expectedCanonicalValueFingerprint).toLowerCase(),
          observedCanonicalValueFingerprint: initialCanonicalValueFingerprint,
        },
      },
    );
  }
  if (analysis.state === "CONFLICT") {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_PROTECTION_CONFLICT",
      "Existing or malformed protected ranges conflict with the exact rehearsal fence.",
      {
        diagnostics: {
          conflictingProtectionCount: analysis.conflictingProtectionCount,
          malformedTaggedProtectionCount: analysis.malformedTaggedProtectionCount,
          exactFenceCount: analysis.exactFenceCount,
        },
      },
    );
  }

  if (action === "restore") {
    if (typeof receipt.inspect !== "function" || typeof receipt.finish !== "function") {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_RECEIPT_REQUIRED",
        "A durable authoritative rehearsal receipt is required before recovery restore.",
        { status: 503 },
      );
    }
    const controlReceipt = await receipt.inspect({ input, environment, operationRequestFingerprint });
    const runId = clean(controlReceipt?.runId || controlReceipt?.run_id).toLowerCase();
    const descriptionPrefix = clean(
      controlReceipt?.protectionDescriptionPrefix || controlReceipt?.protection_description_prefix,
    );
    if (runId !== clean(input.rehearsalRunId).toLowerCase() ||
        descriptionPrefix !== runDescriptionPrefix(runId)) {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_RECEIPT_SCOPE_INVALID",
        "The durable rehearsal receipt did not match this exact run.",
        { status: 503 },
      );
    }
    const receiptStatus = clean(controlReceipt?.status).toUpperCase();
    if (!["RUNNING", "FAILED", "RESTORED"].includes(receiptStatus)) {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_RECEIPT_SCOPE_INVALID",
        "The durable rehearsal receipt was not in a recoverable state.",
        { status: 503 },
      );
    }
    const fenceScope = { rehearsalRunId: runId, descriptionPrefix };
    analysis = await freshAnalysis(dedicatedToken, environment, fetchImpl, fenceScope);
    assertBaseline(analysis, input.expectedBaselineFingerprint);
    const receiptRestorationConfirmed = clean(
      controlReceipt?.restorationConfirmed ?? controlReceipt?.restoration_confirmed,
    ).toLowerCase() === "true";
    if (receiptStatus === "FAILED" && receiptRestorationConfirmed) {
      if (analysis.state !== "ABSENT" ||
          clean(controlReceipt?.restoredProviderFingerprint ||
            controlReceipt?.restored_provider_fingerprint).toLowerCase() !==
              initialProviderFingerprint ||
          clean(controlReceipt?.restoredCanonicalValueFingerprint ||
            controlReceipt?.restored_canonical_value_fingerprint).toLowerCase() !==
              initialCanonicalValueFingerprint) {
        throw fenceError(
          "STEP11_6_GOOGLE_WRITER_FENCE_RECEIPT_REPLAY_MISMATCH",
          "The failed/restored receipt did not match the current Production provider baseline.",
          { status: 503 },
        );
      }
      return Object.freeze({
        ok: true,
        action,
        idempotent: true,
        operationRequestFingerprint,
        inspection: publicInspection(analysis, environment, {
          canonicalValueFingerprint: initialCanonicalValueFingerprint,
          drivePermissionAudit: initialDrivePermissionAudit,
          providerFingerprint: initialProviderFingerprint,
        }),
        controlReceipt: { runId, status: "FAILED", certificationPassed: false },
        providerMutations: 0,
        lostResponseRecovered: true,
        applicationDataWriteIssued: false,
        applicationDataChanged: false,
        canonicalValueFingerprintStable: true,
        restoreRequired: false,
        baselineRestored: true,
        recoveryOnly: true,
        certificationPassed: false,
      });
    }
    const runOwnedProtectionIds = [...analysis.exactProtectionIds].sort((a, b) => a - b);
    const preRestoreProviderFingerprint = providerStateFingerprint({
      metadataFingerprint: analysis.currentMetadataFingerprint,
      canonicalValueFingerprint: initialCanonicalValueFingerprint,
      permissionInventoryFingerprint:
        initialDrivePermissionAudit.permissionInventoryFingerprint,
    });
    const restored = await restoreFence({
      dedicatedToken,
      environment,
      expectedBaselineFingerprint: input.expectedBaselineFingerprint,
      fetchImpl,
      fenceScope,
    });
    const finalCanonicalValueFingerprint = await readCanonicalValueFingerprint(dedicatedToken, fetchImpl);
    const finalDrivePermissionAudit = await readDrivePermissionAudit(
      dedicatedToken,
      environment,
      fetchImpl,
    );
    assertStableDrivePermissionAudit(initialDrivePermissionAudit, finalDrivePermissionAudit, {
      restoreRequired: false,
    });
    const restoredProviderFingerprint = providerStateFingerprint({
      metadataFingerprint: restored.analysis.currentMetadataFingerprint,
      canonicalValueFingerprint: finalCanonicalValueFingerprint,
      permissionInventoryFingerprint: finalDrivePermissionAudit.permissionInventoryFingerprint,
    });
    const receiptBaselineProviderFingerprint = clean(
      controlReceipt?.baselineProviderFingerprint ||
        controlReceipt?.baseline_provider_fingerprint,
    ).toLowerCase();
    const receiptBaselineCanonicalValueFingerprint = clean(
      controlReceipt?.baselineCanonicalValueFingerprint ||
        controlReceipt?.baseline_canonical_value_fingerprint,
    ).toLowerCase();
    if (finalCanonicalValueFingerprint !== initialCanonicalValueFingerprint ||
        (receiptBaselineCanonicalValueFingerprint &&
          receiptBaselineCanonicalValueFingerprint !== finalCanonicalValueFingerprint) ||
        (receiptBaselineProviderFingerprint &&
          receiptBaselineProviderFingerprint !== restoredProviderFingerprint) ||
        (receiptStatus === "RESTORED" && (
          clean(controlReceipt?.certificationPassed ??
            controlReceipt?.certification_passed).toLowerCase() !== "true" ||
          clean(controlReceipt?.restoredProviderFingerprint ||
            controlReceipt?.restored_provider_fingerprint).toLowerCase() !==
              restoredProviderFingerprint ||
          clean(controlReceipt?.restoredCanonicalValueFingerprint ||
            controlReceipt?.restored_canonical_value_fingerprint).toLowerCase() !==
              finalCanonicalValueFingerprint))) {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_CANONICAL_VALUE_DRIFT",
        "The Production Google provider baseline changed during recovery restore.",
        { status: 503, diagnostics: { restoreRequired: false } },
      );
    }
    if (receiptStatus !== "RESTORED") {
      const restorationEvidenceFingerprint = fingerprint({
        action,
        runId,
        preRestoreProviderFingerprint,
        restoredProviderFingerprint,
        runOwnedProtectionIds,
        activeRunOwnedProtectionCount: 0,
        canonicalValueFingerprint: finalCanonicalValueFingerprint,
      });
      await receipt.finish({
        input,
        environment,
        operationRequestFingerprint,
        controlReceipt,
        outcome: "FAILED",
        failureCode: "RECOVERY_RESTORE_WITHOUT_PROVIDER_CERTIFICATION",
        restorationConfirmed: true,
        activeRunOwnedProtectionCount: 0,
        providerEvidenceFingerprint: fingerprint({
          action,
          recoveryOnly: true,
          runId,
          preRestoreProviderFingerprint,
        }),
        fencedProviderFingerprint: analysis.state === "INSTALLED"
          ? preRestoreProviderFingerprint : "",
        restoredProviderFingerprint,
        restoredProtectedRangesFingerprint: restored.analysis.currentMetadataFingerprint,
        restoredCanonicalValueFingerprint: finalCanonicalValueFingerprint,
        restorationEvidenceFingerprint,
        runOwnedProtectionIds,
        dedicatedIdentityCanEdit: analysis.state === "INSTALLED" &&
          analysis.canonicalSheets.every((sheet) => sheet.requestingUserCanEdit === true),
        legacyIdentityDenied: false,
      });
    }
    return Object.freeze({
      ok: true,
      action,
      idempotent: restored.alreadyRestored,
      operationRequestFingerprint,
      inspection: publicInspection(restored.analysis, environment, {
        canonicalValueFingerprint: finalCanonicalValueFingerprint,
        drivePermissionAudit: finalDrivePermissionAudit,
        providerFingerprint: restoredProviderFingerprint,
      }),
      controlReceipt: {
        runId,
        status: receiptStatus === "RESTORED" ? "RESTORED" : "FAILED",
        certificationPassed: receiptStatus === "RESTORED",
      },
      providerMutations: restored.mutated ? 1 : 0,
      lostResponseRecovered: restored.recovered,
      applicationDataWriteIssued: false,
      applicationDataChanged: false,
      canonicalValueFingerprintStable: true,
      restoreRequired: false,
      baselineRestored: true,
      recoveryOnly: receiptStatus !== "RESTORED",
      certificationPassed: receiptStatus === "RESTORED",
    });
  }

  if (typeof receipt.begin !== "function" || typeof receipt.finish !== "function") {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_RECEIPT_REQUIRED",
      "A durable authoritative DORMANT rehearsal receipt is required before fence installation.",
      { status: 503 },
    );
  }
  const controlReceipt = await receipt.begin({
    input,
    environment,
    operationRequestFingerprint,
    baselineProviderFingerprint: initialProviderFingerprint,
    baselineProtectedRangesFingerprint: analysis.currentMetadataFingerprint,
    baselineCanonicalValueFingerprint: initialCanonicalValueFingerprint,
    controlEvidence: {
      quiesceEvidenceId: clean(input.quiesceEvidenceId).toLowerCase(),
      writerScopeFingerprint: writerScopeFingerprint(
        environment,
        analysis,
        initialDrivePermissionAudit,
      ),
      ownerPrincipalFingerprint:
        initialDrivePermissionAudit.ownerPrincipalFingerprint,
      canonicalSheetUnionFingerprint: analysis.canonicalSheetMapFingerprint,
    },
  });
  const runId = clean(controlReceipt?.runId || controlReceipt?.run_id).toLowerCase();
  const descriptionPrefix = clean(
    controlReceipt?.protectionDescriptionPrefix || controlReceipt?.protection_description_prefix,
  );
  const receiptStatus = clean(controlReceipt?.status).toUpperCase();
  if (!isRequestId(runId) ||
      descriptionPrefix !== runDescriptionPrefix(runId) ||
      !["RUNNING", "FAILED", "RESTORED"].includes(receiptStatus)) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_RECEIPT_SCOPE_INVALID",
      "The authoritative rehearsal receipt did not bind the exact run and protection prefix.",
      { status: 503 },
    );
  }
  const fenceScope = { rehearsalRunId: runId, descriptionPrefix };
  analysis = await freshAnalysis(dedicatedToken, environment, fetchImpl, fenceScope);
  assertBaseline(analysis, input.expectedBaselineFingerprint);

  if (receiptStatus === "RESTORED") {
    if (analysis.state !== "ABSENT" ||
        clean(controlReceipt?.certificationPassed ??
          controlReceipt?.certification_passed).toLowerCase() !== "true" ||
        clean(controlReceipt?.restoredProviderFingerprint ||
          controlReceipt?.restored_provider_fingerprint).toLowerCase() !==
            initialProviderFingerprint ||
        clean(controlReceipt?.restoredCanonicalValueFingerprint ||
          controlReceipt?.restored_canonical_value_fingerprint).toLowerCase() !==
            initialCanonicalValueFingerprint) {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_RECEIPT_REPLAY_MISMATCH",
        "The restored durable receipt did not match the current Production provider baseline.",
        { status: 503 },
      );
    }
    return Object.freeze({
      ok: true,
      action,
      idempotent: true,
      operationRequestFingerprint,
      inspection: publicInspection(analysis, environment, {
        canonicalValueFingerprint: initialCanonicalValueFingerprint,
        drivePermissionAudit: initialDrivePermissionAudit,
        providerFingerprint: initialProviderFingerprint,
      }),
      controlReceipt: { runId, status: "RESTORED", certificationPassed: true },
      providerMutations: 0,
      lostResponseRecovered: true,
      applicationDataWriteIssued: false,
      applicationDataChanged: false,
      canonicalValueFingerprintStable: true,
      restoreRequired: false,
      baselineRestored: true,
      certificationPassed: true,
    });
  }

  let proof = null;
  let primaryError = null;
  let installResult = null;
  let restored = null;
  let fencedProviderFingerprint = "";
  let runOwnedProtectionIds = [];
  try {
    installResult = await installFence({
      dedicatedToken,
      analysis,
      environment,
      fetchImpl,
      fenceScope,
    });
    assertBaseline(installResult.analysis, input.expectedBaselineFingerprint);
    assertProviderEditability(installResult.analysis, true, "dedicated-production-google");
    runOwnedProtectionIds = [...installResult.analysis.exactProtectionIds]
      .sort((a, b) => a - b);
    fencedProviderFingerprint = providerStateFingerprint({
      metadataFingerprint: installResult.analysis.currentMetadataFingerprint,
      canonicalValueFingerprint: initialCanonicalValueFingerprint,
      permissionInventoryFingerprint:
        initialDrivePermissionAudit.permissionInventoryFingerprint,
    });
    const legacyToken = await serviceAccountAccessToken(
      environment.legacyCredential,
      { fetchImpl, now },
    );
    const legacyAnalysis = await freshLegacyAnalysis(
      legacyToken,
      installResult.analysis,
      environment,
      fetchImpl,
    );
    assertProviderEditability(legacyAnalysis, false, "legacy-google-writer");
    if (legacyAnalysis.canonicalSheetMapFingerprint !==
        installResult.analysis.canonicalSheetMapFingerprint ||
        legacyAnalysis.exactFenceCount !== installResult.analysis.exactFenceCount) {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_IDENTITY_VIEW_MISMATCH",
        "The two Google identities did not observe the same fixed protection set.",
        { status: 503, diagnostics: { restoreRequired: true } },
      );
    }
    const structuralCanary = await proveLegacyStructuralMutationRejected({
      legacyToken,
      analysis: legacyAnalysis,
      fetchImpl,
    });
    const postCanaryAnalysis = await freshAnalysis(dedicatedToken, environment, fetchImpl, fenceScope);
    assertBaseline(postCanaryAnalysis, input.expectedBaselineFingerprint);
    assertProviderEditability(postCanaryAnalysis, true, "dedicated-production-google");
    const postProofCanonicalValueFingerprint = await readCanonicalValueFingerprint(dedicatedToken, fetchImpl);
    const postProofDrivePermissionAudit = await readDrivePermissionAudit(
      dedicatedToken,
      environment,
      fetchImpl,
    );
    assertStableDrivePermissionAudit(
      initialDrivePermissionAudit,
      postProofDrivePermissionAudit,
      { restoreRequired: true },
    );
    fencedProviderFingerprint = providerStateFingerprint({
      metadataFingerprint: postCanaryAnalysis.currentMetadataFingerprint,
      canonicalValueFingerprint: postProofCanonicalValueFingerprint,
      permissionInventoryFingerprint:
        postProofDrivePermissionAudit.permissionInventoryFingerprint,
    });
    if (postProofCanonicalValueFingerprint !== initialCanonicalValueFingerprint) {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_CANONICAL_VALUE_DRIFT",
        "Canonical Production Google values changed while the provider fence was installed.",
        { status: 503, diagnostics: { restoreRequired: true } },
      );
    }
    proof = Object.freeze({
      protectedSheetCount: installResult.analysis.canonicalSheetCount,
      dedicatedRequestingUserCanEditCount: installResult.analysis.canonicalSheetCount,
      legacyRequestingUserCanEditCount: 0,
      legacyRequestingUserDeniedCount: legacyAnalysis.canonicalSheetCount,
      canonicalSheetMapFingerprint: installResult.analysis.canonicalSheetMapFingerprint,
      dedicatedProtectionViewFingerprint: installResult.analysis.fenceProtectionFingerprint,
      legacyProtectionViewFingerprint: legacyAnalysis.fenceProtectionFingerprint,
      structuralCanary,
      providerValueWriteAttempted: false,
      legacyProviderStructuralWriteAttempts: 1,
      legacyProviderStructuralWritesAccepted: 0,
      applicationDataWriteIssued: false,
      canonicalValueFingerprintStable: true,
      googleCanonicalFactCreated: false,
      protectedIdentityScope: "LEGACY_SERVICE_ACCOUNT_ONLY",
      spreadsheetOwnerOverrideTested: false,
      drivePermissionAudit: initialDrivePermissionAudit,
      ownerPrincipalFingerprint:
        initialDrivePermissionAudit.ownerPrincipalFingerprint,
      effectiveNonOwnerEditorFingerprint:
        initialDrivePermissionAudit.effectiveNonOwnerEditorFingerprint,
      broadNonOwnerEditorCount: 0,
      canonicalValueFingerprint: postProofCanonicalValueFingerprint,
      fencedProviderFingerprint,
    });
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      restored = await restoreFence({
        dedicatedToken,
        environment,
        expectedBaselineFingerprint: input.expectedBaselineFingerprint,
        fetchImpl,
        fenceScope,
      });
    } catch (restoreError) {
      throw fenceError(
        "STEP11_6_GOOGLE_WRITER_FENCE_AUTOMATIC_RESTORE_FAILED",
        "The rehearsal could not prove that its exact protected ranges were restored.",
        {
          status: 503,
          diagnostics: {
            rehearsalFailureCode: clean(primaryError?.code),
            restoreFailureCode: clean(restoreError?.code),
            rehearsalRunId: runId,
            restoreRequired: true,
          },
        },
      );
    }
  }
  const finalCanonicalValueFingerprint = await readCanonicalValueFingerprint(dedicatedToken, fetchImpl);
  const finalDrivePermissionAudit = await readDrivePermissionAudit(
    dedicatedToken,
    environment,
    fetchImpl,
  );
  try {
    assertStableDrivePermissionAudit(initialDrivePermissionAudit, finalDrivePermissionAudit, {
      restoreRequired: false,
    });
  } catch (error) {
    primaryError ||= error;
  }
  const restoredProviderFingerprint = providerStateFingerprint({
    metadataFingerprint: restored.analysis.currentMetadataFingerprint,
    canonicalValueFingerprint: finalCanonicalValueFingerprint,
    permissionInventoryFingerprint: finalDrivePermissionAudit.permissionInventoryFingerprint,
  });
  if (finalCanonicalValueFingerprint !== initialCanonicalValueFingerprint ||
      restoredProviderFingerprint !== initialProviderFingerprint) {
    primaryError ||= fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_CANONICAL_VALUE_DRIFT",
      "The Production Google provider state did not match the inspected baseline after restoration.",
      { status: 503, diagnostics: { baselineRestored: true, restoreRequired: false } },
    );
  }
  const outcome = primaryError ? "FAILED" : "RESTORED";
  const restorationConfirmed = restored.analysis.state === "ABSENT" &&
    restored.analysis.currentMetadataFingerprint === analysis.baselineMetadataFingerprint &&
    finalCanonicalValueFingerprint === initialCanonicalValueFingerprint &&
    finalDrivePermissionAudit.permissionInventoryFingerprint ===
      initialDrivePermissionAudit.permissionInventoryFingerprint &&
    restoredProviderFingerprint === initialProviderFingerprint;
  const providerEvidenceFingerprint = fingerprint(proof || {
    failureCode: clean(primaryError?.code),
    canonicalValueFingerprint: finalCanonicalValueFingerprint,
    fencedProviderFingerprint,
  });
  const restorationEvidenceFingerprint = fingerprint({
    runId,
    outcome,
    restorationConfirmed,
    initialProviderFingerprint,
    restoredProviderFingerprint,
    restoredProtectedRangesFingerprint: restored.analysis.currentMetadataFingerprint,
    finalCanonicalValueFingerprint,
    runOwnedProtectionIds,
    activeRunOwnedProtectionCount: restored.analysis.exactFenceCount,
  });
  try {
    await receipt.finish({
      input,
      environment,
      operationRequestFingerprint,
      controlReceipt,
      outcome,
      failureCode: clean(primaryError?.code),
      restorationConfirmed,
      activeRunOwnedProtectionCount: restored.analysis.exactFenceCount,
      providerEvidenceFingerprint,
      fencedProviderFingerprint,
      restoredProviderFingerprint,
      restoredProtectedRangesFingerprint: restored.analysis.currentMetadataFingerprint,
      restoredCanonicalValueFingerprint: finalCanonicalValueFingerprint,
      restorationEvidenceFingerprint,
      runOwnedProtectionIds,
      dedicatedIdentityCanEdit: proof?.dedicatedRequestingUserCanEditCount === 17,
      legacyIdentityDenied: proof?.legacyRequestingUserDeniedCount === 17 &&
        proof?.structuralCanary?.providerRejected === true,
    });
  } catch (finishError) {
    throw fenceError(
      "STEP11_6_GOOGLE_WRITER_FENCE_RECEIPT_FINISH_FAILED",
      "The exact fence was restored but its authoritative receipt was not finalized.",
      {
        status: 503,
        diagnostics: {
          finishFailureCode: clean(finishError?.code),
          rehearsalFailureCode: clean(primaryError?.code),
          rehearsalRunId: runId,
          baselineRestored: true,
          restoreRequired: false,
        },
      },
    );
  }
  if (primaryError) {
    throw fenceError(
      clean(primaryError.code) || "STEP11_6_GOOGLE_WRITER_FENCE_REHEARSAL_FAILED",
      "The provider-boundary proof failed; the exact fence was restored.",
      {
        status: Number(primaryError.status || 503),
        diagnostics: {
          ...stableValue(primaryError.safeDiagnostics || {}),
          baselineRestored: true,
          restoreRequired: false,
        },
      },
    );
  }
  return Object.freeze({
    ok: true,
    action,
    idempotent: installResult?.recovered === true || restored?.recovered === true,
    operationRequestFingerprint,
    inspection: publicInspection(restored.analysis, environment, {
      canonicalValueFingerprint: finalCanonicalValueFingerprint,
      drivePermissionAudit: finalDrivePermissionAudit,
      providerFingerprint: restoredProviderFingerprint,
    }),
    controlReceipt: {
      runId,
      status: "RESTORED",
      certificationPassed: true,
    },
    providerProof: proof,
    providerMutations: Number(installResult?.mutated === true) + Number(restored?.mutated === true),
    lostResponseRecovered: installResult?.recovered === true || restored?.recovered === true,
    applicationDataWriteIssued: false,
    applicationDataChanged: false,
    canonicalValueFingerprintStable: true,
    restoreRequired: false,
    baselineRestored: true,
    certificationPassed: true,
  });
}

function controlField(value, ...names) {
  for (const name of names) {
    const selected = clean(value?.[name]);
    if (selected) return selected;
  }
  return "";
}

function assertPersistentFenceInput(input, environment, action) {
  if (!isRequestId(input.operationRequestId) ||
      clean(input.expectedCommitSha).toLowerCase() !== environment.resources.commitSha ||
      clean(input.expectedWorkbookId) !== PRODUCTION_GOOGLE_WORKBOOK_ID ||
      clean(input.expectedBranch) !== PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH ||
      clean(input.expectedDirectorPlayerId) !== PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR) {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REQUEST_SCOPE_INVALID",
      "The persistent provider-fence request did not bind the exact candidate resources.",
      { status: 400 },
    );
  }
  if (action === "install" && (
      !isRequestId(input.quiesceEvidenceId) ||
      !isSha256(input.expectedBaselineFingerprint) ||
      !isSha256(input.expectedCanonicalValueFingerprint) ||
      clean(input.confirmation) !== PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_DESCRIPTION)) {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_EVIDENCE_REQUIRED",
      "Install requires the verified quiesce record and exact inspected provider baseline.",
      { status: 400 },
    );
  }
  if (["refresh", "remove"].includes(action) &&
      (!isRequestId(input.installRequestId) ||
        !isRequestId(input.currentVerificationId) ||
        !isRequestId(input.quiesceEvidenceId))) {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_IDENTITY_REQUIRED",
      "The exact provider fence and current verification are required.",
      { status: 400 },
    );
  }
  if (action === "refresh" && !isRequestId(input.quiesceEvidenceId)) {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_QUIESCE_REQUIRED",
      "Refresh requires a current verified quiesce record.",
      { status: 400 },
    );
  }
  if (action === "remove" &&
      clean(input.confirmation) !== "REMOVE_STEP12_GOOGLE_WRITER_PROVIDER_FENCE") {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REMOVE_CONFIRMATION_REQUIRED",
      "The exact persistent provider-fence removal confirmation is required.",
      { status: 400 },
    );
  }
  return fingerprint({
    contractVersion: PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_VERSION,
    action,
    operationRequestId: clean(input.operationRequestId).toLowerCase(),
    installRequestId: clean(input.installRequestId).toLowerCase(),
    fenceId: clean(input.fenceId).toLowerCase(),
    currentVerificationId: clean(input.currentVerificationId).toLowerCase(),
    quiesceEvidenceId: clean(input.quiesceEvidenceId).toLowerCase(),
    expectedCommitSha: environment.resources.commitSha,
    expectedWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    expectedBranch: PRODUCTION_GOOGLE_WRITER_FENCE_BRANCH,
    expectedDirectorPlayerId: PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR,
    expectedBaselineFingerprint: clean(input.expectedBaselineFingerprint).toLowerCase(),
    expectedCanonicalValueFingerprint:
      clean(input.expectedCanonicalValueFingerprint).toLowerCase(),
  });
}

function persistentFenceScope(fenceId, descriptionPrefix = "") {
  return {
    rehearsalRunId: fenceId,
    descriptionPrefix,
    descriptionTag: PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_DESCRIPTION,
  };
}

function assertPersistentFenceReceipt(receipt, input) {
  const fenceId = controlField(receipt, "fenceId", "fence_id").toLowerCase();
  const installRequestId = controlField(
    receipt,
    "installRequestId",
    "install_request_id",
  ).toLowerCase();
  const descriptionPrefix = controlField(
    receipt,
    "protectionDescriptionPrefix",
    "protection_description_prefix",
  );
  const quiesceEvidenceId = controlField(
    receipt,
    "quiesceEvidenceId",
    "quiesce_evidence_id",
  ).toLowerCase();
  if (!isRequestId(fenceId) ||
      (clean(input.fenceId) &&
        fenceId !== clean(input.fenceId).toLowerCase()) ||
      (clean(input.installRequestId) &&
        installRequestId !== clean(input.installRequestId).toLowerCase()) ||
      (clean(input.quiesceEvidenceId) &&
        quiesceEvidenceId !== clean(input.quiesceEvidenceId).toLowerCase()) ||
      descriptionPrefix !== descriptionPrefixFor(
        PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_DESCRIPTION,
        fenceId,
      )) {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_RECEIPT_SCOPE_INVALID",
      "The durable provider-fence receipt did not match this exact installation.",
      { status: 503 },
    );
  }
  return { fenceId, installRequestId, quiesceEvidenceId, descriptionPrefix };
}

function persistentVerificationFromReceipt(receipt) {
  const value = receipt?.verification;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.freeze({
    verificationId: controlField(value, "verificationId", "verification_id")
      .toLowerCase(),
    requestFingerprint: controlField(value, "requestFingerprint", "request_fingerprint")
      .toLowerCase(),
    quiesceEvidenceId: controlField(value, "quiesceEvidenceId", "quiesce_evidence_id")
      .toLowerCase(),
    providerFingerprint: controlField(value, "providerFingerprint", "provider_fingerprint")
      .toLowerCase(),
    aclFingerprint: controlField(value, "aclFingerprint", "acl_fingerprint")
      .toLowerCase(),
    canonicalValueFingerprint: controlField(
      value,
      "canonicalValueFingerprint",
      "canonical_value_fingerprint",
    ).toLowerCase(),
    formulaFingerprint: controlField(value, "formulaFingerprint", "formula_fingerprint")
      .toLowerCase(),
  });
}

function assertRemovalRequestOwnership(receipt, input) {
  const removalRequestId = controlField(
    receipt,
    "removalRequestId",
    "removal_request_id",
  ).toLowerCase();
  if (removalRequestId !== clean(input.operationRequestId).toLowerCase()) {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_OWNERSHIP_MISMATCH",
      "The durable removal receipt belonged to a different request.",
      { status: 409 },
    );
  }
  return removalRequestId;
}

function installedProtectionRecordsFromReceipt(receipt) {
  const records = receipt?.protectionRecords || receipt?.protection_records;
  if (Array.isArray(records) && records.length === 17) {
    return records.map((record) => ({
      sheetId: Number(record.sheetId ?? record.sheet_id),
      protectedRangeId: Number(record.protectedRangeId ?? record.protected_range_id),
    })).filter((record) => Number.isInteger(record.sheetId) &&
      Number.isInteger(record.protectedRangeId));
  }
  const verification = receipt?.verification || {};
  const sheetIds = verification.protectedSheetIds || verification.protected_sheet_ids;
  const rangeIds = verification.protectedRangeIds || verification.protected_range_ids;
  if (!Array.isArray(sheetIds) || !Array.isArray(rangeIds) ||
      sheetIds.length !== 17 || rangeIds.length !== 17) return [];
  return sheetIds.map((sheetId, index) => ({
    sheetId: Number(sheetId),
    protectedRangeId: Number(rangeIds[index]),
  })).filter((record) => Number.isInteger(record.sheetId) &&
    Number.isInteger(record.protectedRangeId));
}

/**
 * Step-12-only persistent provider fence. Unlike the Step 11.6 rehearsal this
 * never restores automatically: the exact 17 protections remain installed
 * through close/prepare/commit, and deletion starts only after a database RPC
 * has authorized a known safe Google rollback/abort state.
 */
export async function executeProductionGoogleWriterProviderFence(
  input = {},
  {
    env = process.env,
    fetchImpl = globalThis.fetch,
    now = Date.now(),
    control = {},
  } = {},
) {
  const environment = assertProductionGoogleWriterProviderFenceEnvironment(env);
  const action = clean(input.action).toLowerCase();
  if (!["install", "inspect", "refresh", "remove"].includes(action)) {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_ACTION_INVALID",
      "The persistent provider-fence action was invalid.",
      { status: 400 },
    );
  }
  const operationRequestFingerprint = assertPersistentFenceInput(
    input,
    environment,
    action,
  );
  const dedicatedToken = await serviceAccountAccessToken(
    environment.dedicatedCredential,
    { fetchImpl, now },
  );

  if (action === "inspect" && !isRequestId(input.installRequestId)) {
    const snapshot = await readWriterFenceProviderSnapshot(
      dedicatedToken,
      environment,
      fetchImpl,
      persistentFenceScope(""),
    );
    return Object.freeze({
      ok: true,
      action,
      durableFenceFound: false,
      operationRequestFingerprint,
      inspection: publicInspection(snapshot.analysis, environment, {
        canonicalValueFingerprint: snapshot.canonicalValues.combinedFingerprint,
        drivePermissionAudit: snapshot.drivePermissionAudit,
        providerFingerprint: snapshot.providerFingerprint,
      }),
      canonicalValueEvidence: snapshot.canonicalValues,
      providerMutations: 0,
      applicationDataWriteIssued: false,
    });
  }

  if (action === "install") {
    if (typeof control.discoverInstall !== "function" ||
        typeof control.beginInstall !== "function" ||
        typeof control.finishInstall !== "function") {
      throw fenceError(
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_CONTROL_REQUIRED",
        "The durable Step 12 provider-fence control plane is required.",
        { status: 503 },
      );
    }
    let receipt = await control.discoverInstall({ input, environment });
    let durableRecovered = receipt?.found !== false;
    let ownership;
    let fenceScope;
    let baseline;
    let current;
    if (durableRecovered) {
      ownership = assertPersistentFenceReceipt(receipt, {
        ...input,
        installRequestId: input.operationRequestId,
      });
      fenceScope = persistentFenceScope(
        ownership.fenceId,
        ownership.descriptionPrefix,
      );
      current = await readWriterFenceProviderSnapshot(
        dedicatedToken,
        environment,
        fetchImpl,
        fenceScope,
      );
      if (current.analysis.baselineMetadataFingerprint !==
            clean(input.expectedBaselineFingerprint).toLowerCase() ||
          current.canonicalValues.combinedFingerprint !==
            clean(input.expectedCanonicalValueFingerprint).toLowerCase() ||
          !["ABSENT", "INSTALLED"].includes(current.analysis.state)) {
        throw fenceError(
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_RECOVERY_BASELINE_DRIFT",
          "The durable provider-fence install could not be reconciled to its baseline.",
          { status: 409 },
        );
      }
      baseline = Object.freeze({
        ...current,
        providerFingerprint: providerStateFingerprint({
          metadataFingerprint: current.analysis.baselineMetadataFingerprint,
          canonicalValueFingerprint: current.canonicalValues.combinedFingerprint,
          permissionInventoryFingerprint:
            current.drivePermissionAudit.permissionInventoryFingerprint,
        }),
      });
    } else {
      baseline = await readWriterFenceProviderSnapshot(
        dedicatedToken,
        environment,
        fetchImpl,
        persistentFenceScope(""),
      );
      if (baseline.analysis.state !== "ABSENT" ||
          baseline.analysis.currentMetadataFingerprint !==
            clean(input.expectedBaselineFingerprint).toLowerCase() ||
          baseline.canonicalValues.combinedFingerprint !==
            clean(input.expectedCanonicalValueFingerprint).toLowerCase()) {
        throw fenceError(
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_BASELINE_DRIFT",
          "The persistent provider-fence baseline changed after inspection.",
          { status: 409 },
        );
      }
      receipt = await control.beginInstall({
        input,
        environment,
        operationRequestFingerprint,
        baselineProviderFingerprint: baseline.providerFingerprint,
        baselineAclFingerprint:
          baseline.drivePermissionAudit.permissionInventoryFingerprint,
        baselineCanonicalValueFingerprint:
          baseline.canonicalValues.unformattedValueFingerprint,
        baselineFormulaFingerprint: baseline.canonicalValues.formulaFingerprint,
        baselineCombinedValueFingerprint: baseline.canonicalValues.combinedFingerprint,
        dedicatedPrincipalFingerprint:
          principalHash(environment.dedicatedCredential.email),
        legacyCredentialGenerationFingerprint: fingerprint({
          generation: "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
          publicKeySha256: environment.credentials.legacyPublicKeySha256,
        }),
        writerScopeFingerprint: writerScopeFingerprint(
          environment,
          baseline.analysis,
          baseline.drivePermissionAudit,
        ),
        canonicalSheetUnionFingerprint:
          baseline.analysis.canonicalSheetMapFingerprint,
      });
      ownership = assertPersistentFenceReceipt(receipt, {
        ...input,
        installRequestId: input.operationRequestId,
      });
      fenceScope = persistentFenceScope(
        ownership.fenceId,
        ownership.descriptionPrefix,
      );
      current = await readWriterFenceProviderSnapshot(
        dedicatedToken,
        environment,
        fetchImpl,
        fenceScope,
      );
    }
    const durableStatus = controlField(receipt, "status").toUpperCase();
    if (durableStatus === "INSTALLED") {
      if (current.analysis.state !== "INSTALLED") {
        throw fenceError(
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_DURABLE_PROVIDER_MISMATCH",
          "The durable installed fence was absent at the Google provider.",
          { status: 503 },
        );
      }
      return Object.freeze({
        ok: true,
        action,
        idempotent: true,
        lostResponseRecovered: durableRecovered,
        operationRequestFingerprint,
        controlReceipt: receipt,
        inspection: publicInspection(current.analysis, environment, {
          canonicalValueFingerprint: current.canonicalValues.combinedFingerprint,
          drivePermissionAudit: current.drivePermissionAudit,
          providerFingerprint: current.providerFingerprint,
        }),
        canonicalValueEvidence: current.canonicalValues,
        providerMutations: 0,
        applicationDataWriteIssued: false,
        persistentFenceActive: true,
      });
    }
    if (durableStatus !== "INSTALLING") {
      throw fenceError(
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_STATE_INVALID",
        "The durable provider fence was not installable.",
        { status: 409 },
      );
    }
    let installResult;
    try {
      installResult = await installFence({
        dedicatedToken,
        analysis: current.analysis,
        environment,
        fetchImpl,
        fenceScope,
      });
      assertProviderEditability(
        installResult.analysis,
        true,
        "dedicated-production-google",
      );
      const legacyToken = await serviceAccountAccessToken(
        environment.legacyCredential,
        { fetchImpl, now },
      );
      const legacyAnalysis = await freshLegacyAnalysis(
        legacyToken,
        installResult.analysis,
        environment,
        fetchImpl,
      );
      assertProviderEditability(legacyAnalysis, false, "legacy-google-writer");
      const structuralCanary = await proveLegacyStructuralMutationRejected({
        legacyToken,
        analysis: legacyAnalysis,
        fetchImpl,
      });
      current = await readWriterFenceProviderSnapshot(
        dedicatedToken,
        environment,
        fetchImpl,
        fenceScope,
      );
      assertProviderEditability(current.analysis, true, "dedicated-production-google");
      assertStableDrivePermissionAudit(
        baseline.drivePermissionAudit,
        current.drivePermissionAudit,
        { restoreRequired: false },
      );
      if (current.canonicalValues.formulaFingerprint !==
            baseline.canonicalValues.formulaFingerprint ||
          current.canonicalValues.unformattedValueFingerprint !==
            baseline.canonicalValues.unformattedValueFingerprint ||
          current.canonicalValues.combinedFingerprint !==
            baseline.canonicalValues.combinedFingerprint) {
        throw fenceError(
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_VALUE_DRIFT",
          "Formula or unformatted values changed during provider-fence installation.",
          { status: 503, diagnostics: { persistentFenceRecoveryRequired: true } },
        );
      }
      const protectionRecords = persistentProtectionRecords(
        current.analysis,
        legacyAnalysis,
      );
      const finished = await control.finishInstall({
        input,
        environment,
        operationRequestFingerprint,
        controlReceipt: receipt,
        protectionRecords,
        installedProviderFingerprint: current.providerFingerprint,
        installedAclFingerprint:
          current.drivePermissionAudit.permissionInventoryFingerprint,
        installedCanonicalValueFingerprint:
          current.canonicalValues.unformattedValueFingerprint,
        installedFormulaFingerprint: current.canonicalValues.formulaFingerprint,
        installedCombinedValueFingerprint:
          current.canonicalValues.combinedFingerprint,
        permissionInventoryFingerprint:
          current.drivePermissionAudit.permissionInventoryFingerprint,
        structuralCanaryFingerprint: fingerprint(structuralCanary),
      });
      assertPersistentFenceReceipt(finished, {
        ...input,
        installRequestId: input.operationRequestId,
        fenceId: ownership.fenceId,
      });
      if (controlField(finished, "status").toUpperCase() !== "INSTALLED" ||
          !isRequestId(controlField(
            finished,
            "activeVerificationId",
            "active_verification_id",
          ))) {
        throw fenceError(
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_RECEIPT_INVALID",
          "The durable install receipt did not prove an active verification.",
          { status: 503, diagnostics: { persistentFenceRecoveryRequired: true } },
        );
      }
      return Object.freeze({
        ok: true,
        action,
        idempotent: installResult.recovered === true,
        lostResponseRecovered: installResult.recovered === true,
        operationRequestFingerprint,
        controlReceipt: finished,
        inspection: publicInspection(current.analysis, environment, {
          canonicalValueFingerprint: current.canonicalValues.combinedFingerprint,
          drivePermissionAudit: current.drivePermissionAudit,
          providerFingerprint: current.providerFingerprint,
        }),
        canonicalValueEvidence: current.canonicalValues,
        providerMutations: installResult.mutated ? 1 : 0,
        applicationDataWriteIssued: false,
        applicationDataChanged: false,
        persistentFenceActive: true,
      });
    } catch (error) {
      throw fenceError(
        clean(error.code) || "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_FAILED",
        "The persistent provider fence requires exact recovery; it was not removed.",
        {
          status: Number(error.status || 503),
          diagnostics: {
            ...(error.safeDiagnostics || {}),
            fenceId: ownership.fenceId,
            persistentFenceRecoveryRequired: true,
            automaticRestorePerformed: false,
          },
        },
      );
    }
  }

  if (typeof control.inspect !== "function") {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_CONTROL_REQUIRED",
      "The durable Step 12 provider-fence control plane is required.",
      { status: 503 },
    );
  }
  const receipt = await control.inspect({
    input,
    environment,
    operationRequestFingerprint,
  });
  const ownership = assertPersistentFenceReceipt(receipt, input);
  const fenceScope = persistentFenceScope(
    ownership.fenceId,
    ownership.descriptionPrefix,
  );
  let snapshot = await readWriterFenceProviderSnapshot(
    dedicatedToken,
    environment,
    fetchImpl,
    fenceScope,
  );
  const durableStatus = controlField(receipt, "status").toUpperCase();

  if (action === "inspect") {
    return Object.freeze({
      ok: true,
      action,
      idempotent: true,
      operationRequestFingerprint,
      controlReceipt: receipt,
      inspection: publicInspection(snapshot.analysis, environment, {
        canonicalValueFingerprint: snapshot.canonicalValues.combinedFingerprint,
        drivePermissionAudit: snapshot.drivePermissionAudit,
        providerFingerprint: snapshot.providerFingerprint,
      }),
      canonicalValueEvidence: snapshot.canonicalValues,
      providerMutations: 0,
      applicationDataWriteIssued: false,
      persistentFenceActive: durableStatus === "INSTALLED" &&
        snapshot.analysis.state === "INSTALLED",
    });
  }

  if (action === "refresh") {
    if (durableStatus !== "INSTALLED" || snapshot.analysis.state !== "INSTALLED" ||
        typeof control.refresh !== "function") {
      throw fenceError(
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REFRESH_STATE_INVALID",
        "Only the exact active persistent provider fence may be refreshed.",
        { status: 409 },
      );
    }
    const durableVerification = persistentVerificationFromReceipt(receipt);
    const requestedVerificationId = clean(input.currentVerificationId).toLowerCase();
    const refreshAlreadyApplied = durableVerification?.requestFingerprint ===
      operationRequestFingerprint;
    if (!refreshAlreadyApplied &&
        durableVerification?.verificationId !== requestedVerificationId) {
      throw fenceError(
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REFRESH_VERIFICATION_STALE",
        "The persistent provider-fence verification advanced before this refresh.",
        { status: 409 },
      );
    }
    if (refreshAlreadyApplied) {
      if (!isRequestId(durableVerification.verificationId) ||
          durableVerification.quiesceEvidenceId !==
            clean(input.quiesceEvidenceId).toLowerCase() ||
          durableVerification.providerFingerprint !== snapshot.providerFingerprint ||
          durableVerification.aclFingerprint !==
            snapshot.drivePermissionAudit.permissionInventoryFingerprint ||
          durableVerification.canonicalValueFingerprint !==
            snapshot.canonicalValues.unformattedValueFingerprint ||
          durableVerification.formulaFingerprint !==
            snapshot.canonicalValues.formulaFingerprint) {
        throw fenceError(
          "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REFRESH_RECOVERY_MISMATCH",
          "The durable refresh receipt did not match current Google provider state.",
          { status: 503 },
        );
      }
      return Object.freeze({
        ok: true,
        action,
        idempotent: true,
        lostResponseRecovered: true,
        operationRequestFingerprint,
        controlReceipt: receipt,
        inspection: publicInspection(snapshot.analysis, environment, {
          canonicalValueFingerprint: snapshot.canonicalValues.combinedFingerprint,
          drivePermissionAudit: snapshot.drivePermissionAudit,
          providerFingerprint: snapshot.providerFingerprint,
        }),
        canonicalValueEvidence: snapshot.canonicalValues,
        providerMutations: 0,
        applicationDataWriteIssued: false,
        applicationDataChanged: false,
        persistentFenceActive: true,
      });
    }
    const legacyToken = await serviceAccountAccessToken(
      environment.legacyCredential,
      { fetchImpl, now },
    );
    const legacyAnalysis = await freshLegacyAnalysis(
      legacyToken,
      snapshot.analysis,
      environment,
      fetchImpl,
    );
    assertProviderEditability(snapshot.analysis, true, "dedicated-production-google");
    assertProviderEditability(legacyAnalysis, false, "legacy-google-writer");
    const structuralCanary = await proveLegacyStructuralMutationRejected({
      legacyToken,
      analysis: legacyAnalysis,
      fetchImpl,
    });
    const before = snapshot;
    snapshot = await readWriterFenceProviderSnapshot(
      dedicatedToken,
      environment,
      fetchImpl,
      fenceScope,
    );
    assertStableDrivePermissionAudit(
      before.drivePermissionAudit,
      snapshot.drivePermissionAudit,
      { restoreRequired: false },
    );
    if (before.canonicalValues.combinedFingerprint !==
        snapshot.canonicalValues.combinedFingerprint) {
      throw fenceError(
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REFRESH_VALUE_DRIFT",
        "Google values changed during the persistent fence refresh proof.",
        { status: 503 },
      );
    }
    const protectionRecords = persistentProtectionRecords(
      snapshot.analysis,
      legacyAnalysis,
    );
    const refreshed = await control.refresh({
      input,
      environment,
      operationRequestFingerprint,
      controlReceipt: receipt,
      protectionRecords,
      providerFingerprint: snapshot.providerFingerprint,
      aclFingerprint:
        snapshot.drivePermissionAudit.permissionInventoryFingerprint,
      canonicalValueFingerprint:
        snapshot.canonicalValues.unformattedValueFingerprint,
      formulaFingerprint: snapshot.canonicalValues.formulaFingerprint,
      combinedValueFingerprint: snapshot.canonicalValues.combinedFingerprint,
      permissionInventoryFingerprint:
        snapshot.drivePermissionAudit.permissionInventoryFingerprint,
      structuralCanaryFingerprint: fingerprint(structuralCanary),
    });
    assertPersistentFenceReceipt(refreshed, input);
    if (controlField(refreshed, "status").toUpperCase() !== "INSTALLED" ||
        !isRequestId(controlField(
          refreshed,
          "activeVerificationId",
          "active_verification_id",
        ))) {
      throw fenceError(
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REFRESH_RECEIPT_INVALID",
        "The durable refresh receipt did not prove an active verification.",
        { status: 503 },
      );
    }
    return Object.freeze({
      ok: true,
      action,
      idempotent: false,
      operationRequestFingerprint,
      controlReceipt: refreshed,
      inspection: publicInspection(snapshot.analysis, environment, {
        canonicalValueFingerprint: snapshot.canonicalValues.combinedFingerprint,
        drivePermissionAudit: snapshot.drivePermissionAudit,
        providerFingerprint: snapshot.providerFingerprint,
      }),
      canonicalValueEvidence: snapshot.canonicalValues,
      providerMutations: 0,
      applicationDataWriteIssued: false,
      applicationDataChanged: false,
      persistentFenceActive: true,
    });
  }

  if (typeof control.authorizeRemoval !== "function" ||
      typeof control.finishRemoval !== "function") {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_CONTROL_REQUIRED",
      "Persistent provider-fence removal requires authoritative rollback authorization.",
      { status: 503 },
    );
  }
  if (durableStatus === "REMOVED") {
    assertRemovalRequestOwnership(receipt, input);
    if (snapshot.analysis.state !== "ABSENT") {
      throw fenceError(
        "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_MISMATCH",
        "The durable removed fence remained installed at Google.",
        { status: 503 },
      );
    }
    return Object.freeze({
      ok: true,
      action,
      idempotent: true,
      lostResponseRecovered: true,
      operationRequestFingerprint,
      controlReceipt: receipt,
      inspection: publicInspection(snapshot.analysis, environment, {
        canonicalValueFingerprint: snapshot.canonicalValues.combinedFingerprint,
        drivePermissionAudit: snapshot.drivePermissionAudit,
        providerFingerprint: snapshot.providerFingerprint,
      }),
      providerMutations: 0,
      applicationDataWriteIssued: false,
      applicationDataChanged: false,
      persistentFenceActive: false,
    });
  }
  if (!["INSTALLED", "REMOVAL_AUTHORIZED"].includes(durableStatus)) {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_STATE_INVALID",
      "The durable provider fence was not eligible for removal.",
      { status: 409 },
    );
  }
  const preRemoval = snapshot;
  if (durableStatus === "REMOVAL_AUTHORIZED") {
    assertRemovalRequestOwnership(receipt, input);
  }
  const authorization = durableStatus === "REMOVAL_AUTHORIZED" ? receipt
    : await control.authorizeRemoval({
      input,
      environment,
      operationRequestFingerprint,
      controlReceipt: receipt,
      currentProviderFingerprint: preRemoval.providerFingerprint,
      currentAclFingerprint:
        preRemoval.drivePermissionAudit.permissionInventoryFingerprint,
      currentCanonicalValueFingerprint:
        preRemoval.canonicalValues.unformattedValueFingerprint,
      currentFormulaFingerprint: preRemoval.canonicalValues.formulaFingerprint,
      currentCombinedValueFingerprint:
        preRemoval.canonicalValues.combinedFingerprint,
      currentProviderWithoutFenceFingerprint: providerStateFingerprint({
        metadataFingerprint: preRemoval.analysis.baselineMetadataFingerprint,
        canonicalValueFingerprint: preRemoval.canonicalValues.combinedFingerprint,
        permissionInventoryFingerprint:
          preRemoval.drivePermissionAudit.permissionInventoryFingerprint,
      }),
    });
  assertPersistentFenceReceipt(authorization, input);
  assertRemovalRequestOwnership(authorization, input);
  if (controlField(authorization, "status").toUpperCase() !== "REMOVAL_AUTHORIZED") {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_NOT_AUTHORIZED",
      "The Production control plane did not authorize provider-fence removal.",
      { status: 409 },
    );
  }
  let removedProtectionIds = [...preRemoval.analysis.exactProtectionIds]
    .sort((a, b) => a - b);
  if (!removedProtectionIds.length) {
    removedProtectionIds = installedProtectionRecordsFromReceipt(authorization)
      .map((record) => record.protectedRangeId).sort((a, b) => a - b);
  }
  const removalResult = await restoreFence({
    dedicatedToken,
    environment,
    expectedBaselineFingerprint: preRemoval.analysis.baselineMetadataFingerprint,
    fetchImpl,
    fenceScope,
  });
  snapshot = await readWriterFenceProviderSnapshot(
    dedicatedToken,
    environment,
    fetchImpl,
    fenceScope,
  );
  assertStableDrivePermissionAudit(
    preRemoval.drivePermissionAudit,
    snapshot.drivePermissionAudit,
    { restoreRequired: false },
  );
  if (snapshot.analysis.state !== "ABSENT" ||
      snapshot.analysis.currentMetadataFingerprint !==
        preRemoval.analysis.baselineMetadataFingerprint ||
      snapshot.canonicalValues.formulaFingerprint !==
        preRemoval.canonicalValues.formulaFingerprint ||
      snapshot.canonicalValues.unformattedValueFingerprint !==
        preRemoval.canonicalValues.unformattedValueFingerprint ||
      snapshot.canonicalValues.combinedFingerprint !==
        preRemoval.canonicalValues.combinedFingerprint ||
      removedProtectionIds.length !== 17) {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_READBACK_FAILED",
      "The exact provider state was not preserved after authorized fence removal.",
      {
        status: 503,
        diagnostics: {
          fenceId: ownership.fenceId,
          activeRunOwnedProtectionCount: snapshot.analysis.exactFenceCount,
        },
      },
    );
  }
  const finished = await control.finishRemoval({
    input,
    environment,
    operationRequestFingerprint,
    controlReceipt: receipt,
    removalAuthorization: authorization,
    removedProtectionIds,
    activeRunOwnedProtectionCount: 0,
    restoredProviderFingerprint: snapshot.providerFingerprint,
    restoredAclFingerprint:
      snapshot.drivePermissionAudit.permissionInventoryFingerprint,
    restoredCanonicalValueFingerprint:
      snapshot.canonicalValues.unformattedValueFingerprint,
    restoredFormulaFingerprint: snapshot.canonicalValues.formulaFingerprint,
    restoredCombinedValueFingerprint: snapshot.canonicalValues.combinedFingerprint,
    restoredMetadataFingerprint: snapshot.analysis.currentMetadataFingerprint,
    restorationEvidenceFingerprint: fingerprint({
      fenceId: ownership.fenceId,
      removedProtectionIds,
      beforeMetadataFingerprint: preRemoval.analysis.currentMetadataFingerprint,
      afterMetadataFingerprint: snapshot.analysis.currentMetadataFingerprint,
      values: snapshot.canonicalValues,
    }),
  });
  assertPersistentFenceReceipt(finished, input);
  assertRemovalRequestOwnership(finished, input);
  if (controlField(finished, "status").toUpperCase() !== "REMOVED") {
    throw fenceError(
      "STEP12_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_RECEIPT_INVALID",
      "The durable removal receipt did not prove exact removal.",
      { status: 503 },
    );
  }
  return Object.freeze({
    ok: true,
    action,
    idempotent: preRemoval.analysis.state === "ABSENT",
    lostResponseRecovered: removalResult.recovered === true,
    operationRequestFingerprint,
    controlReceipt: finished,
    inspection: publicInspection(snapshot.analysis, environment, {
      canonicalValueFingerprint: snapshot.canonicalValues.combinedFingerprint,
      drivePermissionAudit: snapshot.drivePermissionAudit,
      providerFingerprint: snapshot.providerFingerprint,
    }),
    canonicalValueEvidence: snapshot.canonicalValues,
    providerMutations: removalResult.mutated ? 1 : 0,
    applicationDataWriteIssued: false,
    applicationDataChanged: false,
    persistentFenceActive: false,
  });
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
