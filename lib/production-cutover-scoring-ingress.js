import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import {
  assertProductionCutoverActivation,
  assertProductionCutoverRequest,
  productionCutoverActivationEnvironment,
} from "./production-cutover-activation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";
import {
  GOOGLE_WORKBOOK_MUTATION_INTENTS,
  googleWorkbookMutationOutcome,
  withGoogleWorkbookMutationIntent,
} from "./google-workbook-mutation-intent.js";
import {
  productionGoogleDrivePrincipalFingerprint,
  withProductionGoogleServiceAccountCredentials,
} from "./google-service-account-credential-context.js";
import {
  normalizeScoringMutationAuthorityContract,
  SCORING_MUTATION_AUTHORITY_CONTRACT_VERSION,
} from "./scoring-mutation-authority-contract.js";

export const PRODUCTION_SCORING_ADMISSION_CONTRACT_VERSION =
  "production-scoring-admission-v3";
export const PRODUCTION_SCORING_ADMISSION_RPC_CONTRACT_VERSION =
  "ADMISSION_V3";
export const PRODUCTION_SCORING_LEGACY_PROVIDER_CREDENTIAL_CLASS =
  "LEGACY_PROVIDER_FENCEABLE";
export const PRODUCTION_SCORING_MAINTENANCE_STATE =
  "SCORING_MAINTENANCE";
export const PRODUCTION_SCORING_MAINTENANCE_BOUNDARY_MODE =
  "MAINTENANCE_WINDOW_V1";

export const PRODUCTION_SCORING_ADMISSION_OUTCOMES = Object.freeze({
  CONFIRMED_WRITE: "CONFIRMED_WRITE",
  PROVEN_NO_WRITE: "PROVEN_NO_WRITE",
  AMBIGUOUS: "AMBIGUOUS",
  PARTIAL_WRITE: "PARTIAL_WRITE",
});

const V3_RPCS = Object.freeze({
  INSPECT: "inspect_production_scoring_admission",
  BEGIN: "begin_production_scoring_ingress_v3",
  WRITE_STARTED: "mark_production_scoring_ingress_write_started_v3",
  OUTCOME: "report_production_scoring_ingress_outcome",
});
const productionControlPlaneFetch = globalThis.fetch.bind(globalThis);
const admissionMonotonicWindows = new WeakMap();
// Admission capability provenance and timing are lexical internals of the
// high-level wrapper that owns BEGIN, MARK, credentials, and outcome reporting.
// No exported function can register caller-supplied admission/marker evidence.
const canonicalAdmissionCapabilities = new WeakMap();
const revokedCanonicalAdmissions = new WeakSet();
const admissionBeginMonotonicCaptures = new WeakMap();
const consumedAdmissionBeginMonotonicCaptures = new WeakSet();
const trustedControlPlaneDependencyBundles = new WeakSet();

const clean = (value) => String(value ?? "").trim();
const lower = (value) => clean(value).toLowerCase();
const upper = (value) => clean(value).toUpperCase();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value));
const sha256 = (value) => /^[0-9a-f]{64}$/i.test(clean(value));
const commitSha = (value) => /^[0-9a-f]{40}$/i.test(clean(value));
const revision = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0;
const integer = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0;
const timestamp = (value) => {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
};

function rpcHeaders(secret) {
  const headers = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  return headers;
}

function ingressError(code, message, diagnostics = {}, status = 503, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.status = status;
  error.authorityDiagnostics = Object.freeze({ ...diagnostics });
  return error;
}

function normalizeTrustedControlPlaneDependencies(options = {}) {
  if (options && (typeof options === "object" || typeof options === "function") &&
      trustedControlPlaneDependencyBundles.has(options)) {
    return options;
  }

  const candidate = options == null ? {} : options;
  let prototype;
  let descriptors;
  try {
    if ((typeof candidate !== "object" && typeof candidate !== "function") ||
        candidate === null) {
      throw new TypeError("Control-plane options must be an object.");
    }
    // Capture descriptors exactly once. In particular, never invoke or retain a
    // caller accessor/Proxy and then read it again after the trust decision.
    prototype = Object.getPrototypeOf(candidate);
    descriptors = Object.getOwnPropertyDescriptors(candidate);
  } catch (cause) {
    throw ingressError(
      "PRODUCTION_SCORING_CONTROL_PLANE_TEST_OVERRIDE_FORBIDDEN",
      "Production scoring control-plane dependencies could not be trusted.",
      { optionsShapeValid: false },
      500,
      cause,
    );
  }

  const allowedKeys = new Set(["env", "fetchImpl", "timeoutMs"]);
  const keys = Reflect.ownKeys(descriptors);
  const unknownKeys = keys.filter((key) => typeof key !== "string" || !allowedKeys.has(key));
  const accessorKeys = keys.filter((key) => {
    const descriptor = descriptors[key];
    return typeof descriptor?.get === "function" || typeof descriptor?.set === "function";
  });
  const plainShape = prototype === Object.prototype || prototype === null;
  if (!plainShape || unknownKeys.length > 0 || accessorKeys.length > 0) {
    throw ingressError(
      "PRODUCTION_SCORING_CONTROL_PLANE_TEST_OVERRIDE_FORBIDDEN",
      "Production scoring control-plane dependencies must use a bounded plain-data options object.",
      {
        optionsShapeValid: plainShape,
        unknownOptionCount: unknownKeys.length,
        accessorOptionCount: accessorKeys.length,
      },
      500,
    );
  }

  // Read only the captured data descriptors. The original options object is
  // never consulted again, closing getter/Proxy check-then-use substitution.
  const suppliedEnv = descriptors.env?.value;
  const suppliedFetch = descriptors.fetchImpl?.value;
  const suppliedTimeout = descriptors.timeoutMs?.value;
  const testOverridesAllowed = clean(process.env.NODE_TEST_CONTEXT) === "child-v8";
  if (!testOverridesAllowed) {
    const injectedFetch = suppliedFetch !== undefined;
    const injectedEnvironment = suppliedEnv !== undefined && suppliedEnv !== process.env;
    const injectedTimeout = suppliedTimeout !== undefined;
    if (injectedFetch || injectedEnvironment || injectedTimeout) {
      throw ingressError(
        "PRODUCTION_SCORING_CONTROL_PLANE_TEST_OVERRIDE_FORBIDDEN",
        "Production scoring control-plane transport and environment overrides are unavailable outside Node's test runner.",
        { injectedFetch, injectedEnvironment, injectedTimeout },
        500,
      );
    }
  }

  const env = testOverridesAllowed && suppliedEnv !== undefined ? suppliedEnv : process.env;
  const fetchImpl = testOverridesAllowed && suppliedFetch !== undefined
    ? suppliedFetch
    : productionControlPlaneFetch;
  const timeoutMs = testOverridesAllowed && suppliedTimeout !== undefined
    ? Number(suppliedTimeout)
    : 12_000;
  if (!env || typeof env !== "object" || typeof fetchImpl !== "function" ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw ingressError(
      "PRODUCTION_SCORING_CONTROL_PLANE_TEST_OVERRIDE_FORBIDDEN",
      "Production scoring control-plane dependencies were invalid.",
      {
        environmentValid: Boolean(env && typeof env === "object"),
        transportValid: typeof fetchImpl === "function",
        timeoutValid: Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 120_000,
      },
      500,
    );
  }
  const normalized = Object.freeze({ env, fetchImpl, timeoutMs });
  trustedControlPlaneDependencyBundles.add(normalized);
  return normalized;
}

function capabilityError(code, message, diagnostics = {}, status = 503, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.status = status;
  error.capabilityDiagnostics = Object.freeze({ ...diagnostics });
  return error;
}

function admissionBoundary(admission) {
  const state = admission?.state;
  const activation = state?.activation;
  const resources = activation?.resources;
  const revisions = admission?.revisions;
  const bound = admission?.bound;
  const suppliedLeaseExpiresAt = clean(admission?.expiresAt || admission?.expires_at);
  const boundary = {
    admissionId: lower(admission?.admissionId),
    leaseId: lower(admission?.leaseId),
    leaseNonce: lower(admission?.leaseNonce),
    providerMutationKey: lower(admission?.providerMutationKey),
    operationRequestId: lower(admission?.operationRequestId),
    operation: upper(bound?.operation),
    requestFingerprint: lower(bound?.request_fingerprint),
    matchId: clean(bound?.match_id),
    authorityGeneration: lower(state?.expectedAuthorityGeneration),
    admissionGeneration: lower(state?.expectedAdmissionGeneration),
    activationRevision: Number(revisions?.activationRevision),
    admissionRevision: Number(revisions?.admissionRevision),
    deploymentId: clean(state?.deploymentId),
    deploymentCommit: lower(resources?.commitSha),
    externalFenceEvidenceId: lower(state?.externalFenceEvidenceId),
    rpcContractVersion: upper(admission?.rpcContractVersion),
    providerCredentialClass: upper(admission?.providerCredentialClass),
    providerPrincipalFingerprint: lower(admission?.providerPrincipalFingerprint),
    providerDispatchMustBeginBeforeExpiresAt:
      admission?.providerDispatchMustBeginBeforeExpiresAt === true,
    leaseExpiresAt: timestamp(suppliedLeaseExpiresAt),
  };
  const exactBoundary = admission?.enabled === true && state?.required === true && state?.enabled === true &&
    state?.googleAuthorityRequested === true && state?.exactProductionWorkbook === true &&
    activation?.allowed === true && uuid(boundary.admissionId) && boundary.leaseId === boundary.admissionId &&
    uuid(boundary.leaseNonce) && sha256(boundary.providerMutationKey) && uuid(boundary.operationRequestId) &&
    /^[A-Z0-9:_-]{3,100}$/.test(boundary.operation) && sha256(boundary.requestFingerprint) &&
    Boolean(boundary.matchId) && uuid(boundary.authorityGeneration) && uuid(boundary.admissionGeneration) &&
    revision(boundary.activationRevision) && revision(boundary.admissionRevision) &&
    /^dpl_[A-Za-z0-9]{8,64}$/.test(boundary.deploymentId) && commitSha(boundary.deploymentCommit) &&
    lower(bound?.lease_nonce) === boundary.leaseNonce &&
    lower(bound?.operation_request_id) === boundary.operationRequestId &&
    Number(bound?.expected_activation_revision) === boundary.activationRevision &&
    Number(bound?.expected_admission_revision) === boundary.admissionRevision &&
    lower(bound?.expected_authority_generation) === boundary.authorityGeneration &&
    lower(bound?.expected_admission_generation) === boundary.admissionGeneration &&
    lower(bound?.expected_provider_principal_fingerprint) ===
      boundary.providerPrincipalFingerprint &&
    boundary.rpcContractVersion === PRODUCTION_SCORING_ADMISSION_RPC_CONTRACT_VERSION &&
    boundary.providerCredentialClass === PRODUCTION_SCORING_LEGACY_PROVIDER_CREDENTIAL_CLASS &&
    sha256(boundary.providerPrincipalFingerprint) &&
    boundary.providerPrincipalFingerprint === state?.providerPrincipalFingerprint &&
    boundary.providerDispatchMustBeginBeforeExpiresAt === true &&
    Boolean(suppliedLeaseExpiresAt) && Boolean(boundary.leaseExpiresAt) &&
    clean(bound?.deployment_id) === boundary.deploymentId &&
    lower(bound?.deployment_commit) === boundary.deploymentCommit &&
    upper(bound?.environment) === "PRODUCTION" &&
    clean(bound?.project_ref) === PRODUCTION_SUPABASE_PROJECT_REF &&
    clean(bound?.project_url) === PRODUCTION_SUPABASE_URL &&
    clean(bound?.source_workbook_id) === PRODUCTION_GOOGLE_WORKBOOK_ID &&
    clean(bound?.tournament_id) === PRODUCTION_TOURNAMENT_ID &&
    upper(bound?.expected_authority) === "GOOGLE" &&
    upper(bound?.writer_intent) === "CANONICAL_LEGACY" &&
    clean(resources?.projectRef) === PRODUCTION_SUPABASE_PROJECT_REF &&
    clean(resources?.workbookId) === PRODUCTION_GOOGLE_WORKBOOK_ID &&
    clean(resources?.tournamentId) === PRODUCTION_TOURNAMENT_ID &&
    clean(resources?.commitSha) === clean(bound?.deployment_commit) &&
    clean(state?.deploymentId) === clean(bound?.deployment_id) &&
    (!boundary.externalFenceEvidenceId ||
      lower(bound?.external_fence_evidence_id) === boundary.externalFenceEvidenceId);
  if (!exactBoundary) {
    throw capabilityError(
      "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_CAPABILITY_INVALID",
      "Production canonical Google admission capability did not match the complete server-issued boundary.",
      {
        admissionIdPresent: uuid(boundary.admissionId),
        operation: boundary.operation,
        authorityGenerationPresent: uuid(boundary.authorityGeneration),
        admissionGenerationPresent: uuid(boundary.admissionGeneration),
        activationRevisionPresent: revision(boundary.activationRevision),
        admissionRevisionPresent: revision(boundary.admissionRevision),
      },
    );
  }
  return Object.freeze(boundary);
}

function sameBoundary(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

// Wall-clock time is deliberately irrelevant to provider-dispatch expiry.
function monotonicMilliseconds() {
  return performance.now();
}

function dispatchRemainingMilliseconds(value, label, { allowZero = true } = {}) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || (!allowZero && parsed === 0)) {
    throw capabilityError(
      "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_DISPATCH_WINDOW_INVALID",
      `The ${label} database dispatch window was invalid.`,
      { label, remainingDispatchMillisecondsValid: false },
      409,
    );
  }
  return parsed;
}

function captureProductionGoogleAdmissionBeginMonotonic() {
  const capture = Object.freeze({});
  admissionBeginMonotonicCaptures.set(capture, monotonicMilliseconds());
  return capture;
}

function consumeAdmissionBeginMonotonicCapture(capture, remainingDispatchMs) {
  const startedAt = admissionBeginMonotonicCaptures.get(capture);
  if (!Number.isFinite(startedAt) ||
      consumedAdmissionBeginMonotonicCaptures.has(capture)) {
    throw capabilityError(
      "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_MONOTONIC_CAPTURE_INVALID",
      "The Production canonical Google admission monotonic BEGIN capture was invalid or already consumed.",
      {},
      409,
    );
  }
  const remaining = dispatchRemainingMilliseconds(
    remainingDispatchMs,
    "BEGIN",
    { allowZero: false },
  );
  admissionBeginMonotonicCaptures.delete(capture);
  consumedAdmissionBeginMonotonicCaptures.add(capture);
  return Object.freeze({
    deadline: startedAt + remaining,
  });
}

function assertCapabilityNotExpired(capability) {
  const now = monotonicMilliseconds();
  const deadline = Math.min(
    capability.beginDispatchDeadline,
    capability.markDispatchDeadline ?? Number.POSITIVE_INFINITY,
  );
  if (Number.isFinite(deadline) && now < deadline) return;
  throw capabilityError(
    "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_CAPABILITY_EXPIRED",
    "The Production canonical Google admission capability expired before provider dispatch.",
    {
      operation: capability.boundary.operation,
      monotonicDispatchWindowRemainingMs: Number.isFinite(deadline)
        ? Math.max(0, Math.floor(deadline - now))
        : 0,
      writeStarted: capability.writeStarted === true,
    },
    409,
  );
}

function activeCapability(admission, { scope, operation } = {}) {
  if (!admission || typeof admission !== "object") {
    throw capabilityError(
      "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_CAPABILITY_REQUIRED",
      "Production canonical Google writes require a module-issued admission capability.",
    );
  }
  if (revokedCanonicalAdmissions.has(admission)) {
    throw capabilityError(
      "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_CAPABILITY_REVOKED",
      "This Production canonical Google admission capability is no longer active.",
      {},
      409,
    );
  }
  const capability = canonicalAdmissionCapabilities.get(admission);
  if (!capability) {
    throw capabilityError(
      "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_CAPABILITY_REQUIRED",
      "Production canonical Google writes require a high-level wrapper-issued admission capability.",
    );
  }
  let currentBoundary;
  try {
    currentBoundary = admissionBoundary(admission);
  } catch (error) {
    throw capabilityError(
      "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_CAPABILITY_BOUNDARY_MISMATCH",
      "The Production canonical Google admission changed after it was issued.",
      { operation: upper(operation) },
      409,
      error,
    );
  }
  if (!sameBoundary(capability.boundary, currentBoundary) ||
      upper(operation) !== capability.boundary.operation) {
    throw capabilityError(
      "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_CAPABILITY_BOUNDARY_MISMATCH",
      "The Production canonical Google admission does not match this writer boundary.",
      { expectedOperation: capability.boundary.operation, requestedOperation: upper(operation) },
      409,
    );
  }
  assertCapabilityNotExpired(capability);
  if (!scope || typeof scope !== "object") {
    throw capabilityError(
      "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_CAPABILITY_SCOPE_REQUIRED",
      "Production canonical Google writes require an exact request-scoped capability.",
      {},
      500,
    );
  }
  if (capability.scope && capability.scope !== scope) {
    throw capabilityError(
      "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_CAPABILITY_REPLAYED",
      "A Production canonical Google admission cannot be replayed in another mutation scope.",
      { operation: capability.boundary.operation },
      409,
    );
  }
  capability.scope ||= scope;
  return capability;
}

function registerProductionGoogleAdmissionCapability(
  admission,
  markWriteStarted,
  { beginMonotonicCapture, beginRemainingDispatchMs } = {},
) {
  if (!admission || typeof admission !== "object" || typeof markWriteStarted !== "function") {
    throw capabilityError(
      "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_CAPABILITY_INVALID",
      "Production canonical Google admission capability could not be registered.",
    );
  }
  if (canonicalAdmissionCapabilities.has(admission) || revokedCanonicalAdmissions.has(admission)) {
    throw capabilityError(
      "PRODUCTION_CANONICAL_GOOGLE_ADMISSION_CAPABILITY_DUPLICATE",
      "Production canonical Google admission capability was already registered or revoked.",
      {},
      409,
    );
  }
  const beginWindow = consumeAdmissionBeginMonotonicCapture(
    beginMonotonicCapture,
    beginRemainingDispatchMs,
  );
  canonicalAdmissionCapabilities.set(admission, {
    boundary: admissionBoundary(admission),
    markWriteStarted,
    scope: null,
    writeStartPromise: null,
    writeStarted: false,
    beginDispatchDeadline: beginWindow.deadline,
    markDispatchDeadline: null,
  });
  assertCapabilityNotExpired(canonicalAdmissionCapabilities.get(admission));
  return admission;
}

export function consumeProductionGoogleAdmissionCapability(admission, details = {}) {
  const capability = activeCapability(admission, details);
  if (!capability.writeStartPromise) {
    const markerDetails = Object.freeze({
      operation: capability.boundary.operation,
      method: upper(details.method),
      path: clean(details.path),
    });
    let markStartedAt;
    capability.writeStartPromise = Promise.resolve()
      .then(() => {
        assertCapabilityNotExpired(capability);
        markStartedAt = monotonicMilliseconds();
        return capability.markWriteStarted(markerDetails);
      })
      .then((result) => {
        if (result?.ok !== true) {
          throw capabilityError(
            "PRODUCTION_CANONICAL_GOOGLE_WRITE_MARKER_REJECTED",
            "The durable Production Google writer-start marker was not accepted.",
          );
        }
        const remaining = dispatchRemainingMilliseconds(
          result?.remaining_dispatch_ms ?? result?.remainingDispatchMs,
          "MARK",
        );
        capability.markDispatchDeadline = markStartedAt + remaining;
        capability.writeStarted = true;
        assertCapabilityNotExpired(capability);
        return result;
      });
  }
  return capability.writeStartPromise;
}

export function assertProductionGoogleAdmissionCapabilityActive(admission, details = {}) {
  const capability = activeCapability(admission, details);
  if (!capability.writeStarted) {
    throw capabilityError(
      "PRODUCTION_CANONICAL_GOOGLE_WRITE_MARKER_REQUIRED",
      "The Production canonical Google writer-start marker is not durable.",
    );
  }
  return true;
}

function revokeProductionGoogleAdmissionCapability(admission) {
  if (!admission || typeof admission !== "object") return false;
  const existed = canonicalAdmissionCapabilities.delete(admission);
  revokedCanonicalAdmissions.add(admission);
  return existed;
}

function safeRpcFailureCode(payload) {
  const raw = clean(payload?.code || payload?.message || payload?.error_code).toUpperCase();
  const matched = raw.match(/[A-Z][A-Z0-9_]{4,100}/g) || [];
  return matched.find((value) => value.startsWith("PRODUCTION_") || value.startsWith("SCORING_")) || "";
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function postgresJsonbKeyOrder(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length - rightBytes.length || Buffer.compare(leftBytes, rightBytes);
}

/**
 * Exact PostgreSQL `jsonb::text` encoding for the bounded JSON values used by
 * control-plane evidence hashes. PostgreSQL orders object keys by UTF-8 byte
 * length and then byte value, and emits a space after array/object separators.
 */
export function postgresJsonbText(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(postgresJsonbText).join(", ")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => postgresJsonbKeyOrder(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}: ${postgresJsonbText(item)}`)
      .join(", ")}}`;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  throw new TypeError("Control-plane evidence must be an exact JSON value.");
}

export function postgresJsonbEvidenceHash(value) {
  return createHash("sha256").update(postgresJsonbText(value)).digest("hex");
}

/** PostgreSQL jsonb::text for the outcome evidence object built by migration 034. */
export function productionScoringOutcomeEvidenceHash(value) {
  return postgresJsonbEvidenceHash(value);
}

function productionWorkbookConfigured(env) {
  return clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID) ===
    PRODUCTION_GOOGLE_WORKBOOK_ID;
}

function runtimeDeploymentId(env) {
  return clean(env.VERCEL_DEPLOYMENT_ID);
}

export function productionGoogleIngressLeaseEnvironment(env = process.env) {
  const activation = productionCutoverActivationEnvironment(env);
  const production = clean(env.VERCEL_ENV).toLowerCase() === "production";
  const configuredAuthority = clean(env.SCORING_AUTHORITY || "google").toLowerCase();
  const googleAuthorityRequested = configuredAuthority === "google";
  const exactProductionWorkbook = productionWorkbookConfigured(env);
  const required = production && googleAuthorityRequested;
  const requested = truthy(env.PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED);
  const expectedAuthorityGeneration = clean(env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH).toLowerCase();
  const expectedAdmissionGeneration = clean(env.PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION).toLowerCase();
  const externalFenceEvidenceId = clean(env.PRODUCTION_SCORING_PROVIDER_FENCE_EVIDENCE_ID).toLowerCase();
  const externalFenceSupplied = Boolean(externalFenceEvidenceId);
  const deploymentId = runtimeDeploymentId(env);
  const providerPrincipalFingerprint =
    productionGoogleDrivePrincipalFingerprint(env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const authorityGenerationApproved = uuid(expectedAuthorityGeneration);
  const admissionGenerationApproved = uuid(expectedAdmissionGeneration);
  const externalFenceApproved = !externalFenceSupplied || uuid(externalFenceEvidenceId);
  const deploymentIdApproved = /^dpl_[A-Za-z0-9]{8,64}$/.test(deploymentId);
  const providerPrincipalApproved = sha256(providerPrincipalFingerprint);
  const enabled = required && exactProductionWorkbook && requested && activation.allowed && authorityGenerationApproved &&
    admissionGenerationApproved && externalFenceApproved && deploymentIdApproved &&
    providerPrincipalApproved;
  const reason = enabled ? "production-google-admission-v3-ready"
    : !required ? "production-google-canonical-admission-not-required"
    : !exactProductionWorkbook ? "production-workbook-required"
    : !requested ? "production-google-admission-v3-disabled"
    : !activation.allowed ? activation.reason
    : !authorityGenerationApproved ? "production-authority-generation-required"
    : !admissionGenerationApproved ? "production-admission-generation-required"
    : !externalFenceApproved ? "production-provider-fence-evidence-invalid"
    : !deploymentIdApproved ? "production-deployment-id-required"
    : !providerPrincipalApproved ? "production-google-legacy-principal-required"
    : "production-google-admission-v3-unavailable";
  return Object.freeze({
    contractVersion: PRODUCTION_SCORING_ADMISSION_CONTRACT_VERSION,
    required,
    requested,
    enabled,
    reason,
    activation,
    expectedAuthorityGeneration: authorityGenerationApproved ? expectedAuthorityGeneration : "",
    expectedAdmissionGeneration: admissionGenerationApproved ? expectedAdmissionGeneration : "",
    externalFenceEvidenceId: externalFenceApproved && externalFenceSupplied ? externalFenceEvidenceId : "",
    externalFenceConfigured: externalFenceSupplied && externalFenceApproved,
    externalFenceRequired: false,
    deploymentId: deploymentIdApproved ? deploymentId : "",
    providerPrincipalFingerprint: providerPrincipalApproved
      ? providerPrincipalFingerprint : "",
    deploymentDiagnostic: clean(env.VERCEL_URL),
    googleAuthorityRequested,
    exactProductionWorkbook,
    serverEnvironmentOnly: true,
  });
}

async function productionScoringIngressRpc(functionName, input, options = {}) {
  const { env, fetchImpl, timeoutMs } =
    normalizeTrustedControlPlaneDependencies(options);
  assertProductionCutoverActivation({ env, requiredPhase: "STATIC_BACKEND" });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  const url = `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${functionName}`;
  recordDataAuthorityTransport("supabase", { adapter: "production-scoring-admission-v3" });
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: rpcHeaders(secret),
      body: JSON.stringify({ input }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw ingressError(
      "PRODUCTION_SCORING_ADMISSION_CONTROL_PLANE_UNAVAILABLE",
      "Production scoring is temporarily paused because mutation admission could not be verified.",
      { functionName, transportResponseObserved: false },
      503,
      cause,
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const providerCode = safeRpcFailureCode(payload);
    const missingV3 = response.status === 404 || /FUNCTION|SCHEMA|NOT_FOUND/.test(providerCode);
    throw ingressError(
      missingV3
        ? "PRODUCTION_SCORING_ADMISSION_V3_CONTRACT_UNAVAILABLE"
        : providerCode || "PRODUCTION_SCORING_ADMISSION_RPC_REJECTED",
      "Production scoring is temporarily paused because mutation admission was not granted.",
      { functionName, status: response.status, providerCode, transportResponseObserved: true },
      [401, 403, 409].includes(response.status) ? response.status : 503,
    );
  }
  return payload;
}

function exactResourceInput(state, requestFingerprint) {
  return {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    expected_authority: "GOOGLE",
    writer_intent: GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY,
    expected_authority_generation: state.expectedAuthorityGeneration,
    expected_admission_generation: state.expectedAdmissionGeneration,
    expected_provider_principal_fingerprint: state.providerPrincipalFingerprint,
    ...(state.externalFenceEvidenceId ? { external_fence_evidence_id: state.externalFenceEvidenceId } : {}),
    deployment_id: state.deploymentId,
    deployment_commit: state.activation.resources.commitSha,
    request_fingerprint: requestFingerprint,
  };
}

function inspectedRevision(payload, ...names) {
  for (const name of names) {
    if (integer(payload?.[name])) return Number(payload[name]);
  }
  return -1;
}

function inspectedValue(payload, ...names) {
  for (const name of names) {
    const value = clean(payload?.[name]);
    if (value) return value;
  }
  return "";
}

async function inspectAdmissionBoundary(state, options) {
  const nonce = randomUUID();
  const input = exactResourceInput(state, fingerprint({
    contract: PRODUCTION_SCORING_ADMISSION_CONTRACT_VERSION,
    operation: V3_RPCS.INSPECT,
    nonce,
    deploymentId: state.deploymentId,
  }));
  input.inspection_nonce = nonce;
  const payload = await productionScoringIngressRpc(V3_RPCS.INSPECT, input, options);
  const activationRevision = inspectedRevision(payload, "activation_revision");
  const admissionRevision = inspectedRevision(payload, "admission_revision");
  const authorityGeneration = inspectedValue(payload, "authority_generation", "authority_generation_id", "epoch_id").toLowerCase();
  const admissionGeneration = inspectedValue(payload, "admission_generation", "admission_generation_id").toLowerCase();
  const externalFenceEvidenceId = inspectedValue(payload, "external_fence_evidence_id", "provider_fence_evidence_id").toLowerCase();
  const deploymentId = inspectedValue(payload, "deployment_id");
  const authority = inspectedValue(payload, "authority", "current_authority").toUpperCase();
  const admissionState = inspectedValue(payload, "admission_state").toUpperCase();
  const executionGate = inspectedValue(payload, "execution_gate", "state", "ingress").toUpperCase();
  const rpcContractVersion = inspectedValue(payload, "contract_version").toUpperCase();
  const providerCredentialClass = inspectedValue(
    payload,
    "provider_credential_class",
  ).toUpperCase();
  const providerPrincipalFingerprint = inspectedValue(
    payload,
    "provider_principal_fingerprint",
  ).toLowerCase();
  const scoringIngressEnabled = payload?.scoring_ingress_enabled === true;
  const maintenanceState = inspectedValue(payload, "maintenance_state").toUpperCase();
  const boundaryMode = inspectedValue(payload, "boundary_mode").toUpperCase();
  return Object.freeze({
    payload,
    activationRevision,
    admissionRevision,
    authorityGeneration,
    admissionGeneration,
    externalFenceEvidenceId,
    deploymentId,
    authority,
    admissionState,
    executionGate,
    rpcContractVersion,
    providerCredentialClass,
    providerPrincipalFingerprint,
    scoringIngressEnabled,
    maintenanceState,
    boundaryMode,
  });
}

function assertProductionScoringMaintenanceInactive(inspected) {
  // boundary_mode selects the certified control-plane path and remains
  // MAINTENANCE_WINDOW_V1 after a successful resume. Only the explicit
  // maintenance state pauses application mutations.
  const maintenanceActive =
    inspected.maintenanceState === PRODUCTION_SCORING_MAINTENANCE_STATE;
  if (!maintenanceActive) return;
  throw ingressError(
    "PRODUCTION_SCORING_MAINTENANCE_ACTIVE",
    "Production scoring is temporarily paused for scheduled maintenance.",
    {
      maintenanceState: inspected.maintenanceState,
      boundaryMode: inspected.boundaryMode,
      authority: inspected.authority,
      admissionState: inspected.admissionState,
      executionGate: inspected.executionGate,
    },
    503,
  );
}

function beginRevisionsFromClientContract(input, state, inspected) {
  const contract = normalizeScoringMutationAuthorityContract(input.scoringAuthorityContract);
  if (!contract) {
    throw ingressError(
      "SCORING_AUTHORITY_CONTRACT_REQUIRED",
      "Scoring authority changed after this match was loaded. Refresh the match before saving again.",
      {},
      409,
    );
  }
  const staticBoundaryMatches = contract.version === SCORING_MUTATION_AUTHORITY_CONTRACT_VERSION &&
    contract.scoringAuthority === "google" &&
    contract.authorityGeneration === state.expectedAuthorityGeneration &&
    contract.admissionGeneration === state.expectedAdmissionGeneration &&
    contract.deploymentId === state.deploymentId &&
    contract.deploymentCommit === state.activation.resources.commitSha &&
    inspected.authority === "GOOGLE" &&
    inspected.rpcContractVersion === PRODUCTION_SCORING_ADMISSION_RPC_CONTRACT_VERSION &&
    inspected.providerCredentialClass === PRODUCTION_SCORING_LEGACY_PROVIDER_CREDENTIAL_CLASS &&
    inspected.providerPrincipalFingerprint === state.providerPrincipalFingerprint &&
    inspected.authorityGeneration === state.expectedAuthorityGeneration &&
    inspected.admissionGeneration === state.expectedAdmissionGeneration &&
    inspected.deploymentId === state.deploymentId;
  const currentOpenBoundary = inspected.admissionState === "OPEN" &&
    contract.activationRevision === inspected.activationRevision &&
    contract.admissionRevision === inspected.admissionRevision;
  // A response-lost BEGIN may be recovered while the closure is CLOSING. The
  // original client-bound revisions must be replayed exactly; SQL admits only
  // an existing identical operation_request_id below the closure watermark.
  const closingReplayBoundary = inspected.admissionState === "CLOSING" &&
    contract.activationRevision >= 0 && contract.admissionRevision >= 0 &&
    contract.activationRevision <= inspected.activationRevision &&
    contract.admissionRevision <= inspected.admissionRevision;
  if (!staticBoundaryMatches || (!currentOpenBoundary && !closingReplayBoundary)) {
    throw ingressError(
      "SCORING_AUTHORITY_CONTRACT_STALE",
      "Scoring authority changed after this match was loaded. Refresh the match before saving again.",
      {
        staticBoundaryMatched: staticBoundaryMatches,
        currentOpenBoundary,
        closingReplayBoundary,
        admissionState: inspected.admissionState,
      },
      409,
    );
  }
  return Object.freeze({
    activationRevision: contract.activationRevision,
    admissionRevision: contract.admissionRevision,
    closingReplay: closingReplayBoundary,
  });
}

/**
 * Reads the current Production scoring boundary for a request-scoped mutation
 * contract. Unlike legacy admission, this remains usable after Supabase commit;
 * it never grants a Google lease and never mutates the control plane.
 */
export async function inspectProductionScoringMutationAuthority(input = {}, options = {}) {
  const dependencies = normalizeTrustedControlPlaneDependencies(options);
  const { env } = dependencies;
  const state = productionGoogleIngressLeaseEnvironment(env);
  const expectedAuthority = clean(input.expectedAuthority).toUpperCase();
  if (!state.activation.allowed || !state.expectedAuthorityGeneration ||
      !state.expectedAdmissionGeneration || !state.deploymentId) {
    throw ingressError(
      "SCORING_AUTHORITY_CONTRACT_UNAVAILABLE",
      "Production scoring is temporarily paused because its authority contract is unavailable.",
      { reason: state.reason },
    );
  }
  if (!input.request) {
    throw ingressError(
      "SCORING_AUTHORITY_CONTRACT_UNAVAILABLE",
      "Production scoring is temporarily paused because request identity is unavailable.",
      {},
    );
  }
  assertProductionCutoverRequest(input.request, env, { requireOrigin: false });
  const inspected = await inspectAdmissionBoundary(state, dependencies);
  assertProductionScoringMaintenanceInactive(inspected);
  const validAuthority = ["GOOGLE", "SUPABASE"].includes(expectedAuthority) &&
    inspected.authority === expectedAuthority;
  const googleOpen = expectedAuthority !== "GOOGLE" || inspected.admissionState === "OPEN";
  const supabaseOpen = expectedAuthority !== "SUPABASE" ||
    (inspected.executionGate === "OPEN" && inspected.scoringIngressEnabled);
  const valid = inspected.payload?.ok === true &&
    inspected.activationRevision >= 0 && inspected.admissionRevision >= 0 &&
    inspected.authorityGeneration === state.expectedAuthorityGeneration &&
    inspected.admissionGeneration === state.expectedAdmissionGeneration &&
    inspected.deploymentId === state.deploymentId &&
    inspected.rpcContractVersion === PRODUCTION_SCORING_ADMISSION_RPC_CONTRACT_VERSION &&
    inspected.providerCredentialClass === PRODUCTION_SCORING_LEGACY_PROVIDER_CREDENTIAL_CLASS &&
    inspected.providerPrincipalFingerprint === state.providerPrincipalFingerprint &&
    validAuthority && googleOpen && supabaseOpen;
  if (!valid) {
    throw ingressError(
      "SCORING_AUTHORITY_CONTRACT_STALE",
      "Scoring authority changed after this match was loaded. Refresh the match before saving again.",
      {
        activationRevisionPresent: inspected.activationRevision >= 0,
        admissionRevisionPresent: inspected.admissionRevision >= 0,
        authorityGenerationMatched: inspected.authorityGeneration === state.expectedAuthorityGeneration,
        admissionGenerationMatched: inspected.admissionGeneration === state.expectedAdmissionGeneration,
        deploymentMatched: inspected.deploymentId === state.deploymentId,
        rpcContractVersionMatched: inspected.rpcContractVersion ===
          PRODUCTION_SCORING_ADMISSION_RPC_CONTRACT_VERSION,
        providerCredentialClassMatched: inspected.providerCredentialClass ===
          PRODUCTION_SCORING_LEGACY_PROVIDER_CREDENTIAL_CLASS,
        providerPrincipalMatched: inspected.providerPrincipalFingerprint ===
          state.providerPrincipalFingerprint,
        authorityMatched: validAuthority,
        admissionOpen: googleOpen,
        scoringIngressOpen: supabaseOpen,
      },
      409,
    );
  }
  return Object.freeze({
    scoringAuthority: inspected.authority,
    authorityGeneration: inspected.authorityGeneration,
    admissionGeneration: inspected.admissionGeneration,
    activationRevision: inspected.activationRevision,
    admissionRevision: inspected.admissionRevision,
    deploymentId: inspected.deploymentId,
    deploymentCommit: state.activation.resources.commitSha,
  });
}

function serverBoundInput(input, state, revisions, leaseNonce) {
  const tournamentId = clean(input?.tournamentId || input?.tournament_id || PRODUCTION_TOURNAMENT_ID);
  if (tournamentId !== PRODUCTION_TOURNAMENT_ID) {
    throw ingressError("PRODUCTION_SCORING_TOURNAMENT_MISMATCH", "The Production scoring tournament is not eligible.",
      { expectedTournamentId: PRODUCTION_TOURNAMENT_ID }, 403);
  }
  const matchId = clean(input?.matchId || input?.match_id);
  if (!matchId) {
    throw ingressError("PRODUCTION_SCORING_MATCH_REQUIRED", "A Production Match ID is required.", {}, 400);
  }
  const operation = clean(input?.operation).toUpperCase();
  if (!/^[A-Z0-9:_-]{3,100}$/.test(operation)) {
    throw ingressError("PRODUCTION_SCORING_OPERATION_REQUIRED", "A bounded Production scoring operation is required.", {}, 400);
  }
  const operationRequestId = clean(input?.operationRequestId || input?.operation_request_id).toLowerCase();
  if (!uuid(operationRequestId)) {
    throw ingressError(
      "PRODUCTION_SCORING_OPERATION_REQUEST_ID_REQUIRED",
      "Production scoring requires a durable mutation request identity.",
      {},
      409,
    );
  }
  const bound = {
    ...exactResourceInput(state, ""),
    expected_activation_revision: revisions.activationRevision,
    expected_admission_revision: revisions.admissionRevision,
    match_id: matchId,
    operation,
    actor_id: clean(input?.actorId || input?.actor_id || "Authorized Production scorer").slice(0, 160),
    lease_seconds: Math.max(30, Math.min(Number(input?.leaseSeconds || input?.lease_seconds || 180), 300)),
    operation_request_id: operationRequestId,
    lease_nonce: leaseNonce,
  };
  // Retry-only lease capability variation must not alter semantic idempotency.
  bound.request_fingerprint = fingerprint({
    ...bound,
    request_fingerprint: undefined,
    lease_nonce: undefined,
  });
  return bound;
}

async function beginProductionGoogleAuthorityWrite(input, options = {}) {
  const dependencies = normalizeTrustedControlPlaneDependencies(options);
  const { env } = dependencies;
  const state = productionGoogleIngressLeaseEnvironment(env);
  if (!state.required) return Object.freeze({ enabled: false, admissionId: "", leaseId: "", state });
  if (!state.enabled) {
    throw ingressError(
      "PRODUCTION_SCORING_ADMISSION_V3_UNAVAILABLE",
      "Production scoring is temporarily paused because mutation admission is unavailable.",
      state,
    );
  }
  if (!input?.request) {
    throw ingressError(
      "PRODUCTION_SCORING_REQUEST_PROOF_REQUIRED",
      "Production scoring is temporarily paused because canonical request identity is unavailable.",
      {},
      403,
    );
  }
  assertProductionCutoverRequest(input.request, env);
  const inspected = await inspectAdmissionBoundary(state, dependencies);
  assertProductionScoringMaintenanceInactive(inspected);
  const revisions = beginRevisionsFromClientContract(input, state, inspected);
  const leaseNonce = randomUUID();
  const bound = serverBoundInput(input, state, revisions, leaseNonce);
  // This opaque capture is taken immediately before BEGIN. The capability
  // module later projects the database's remaining duration onto that earlier
  // monotonic instant, conservatively charging all RPC transit time.
  const beginMonotonicCapture =
    captureProductionGoogleAdmissionBeginMonotonic();
  const payload = await productionScoringIngressRpc(V3_RPCS.BEGIN, bound, dependencies);
  const admissionId = clean(payload?.lease_id || payload?.admission_id).toLowerCase();
  const returnedNonce = clean(payload?.lease_nonce).toLowerCase();
  const returnedAuthorityGeneration = inspectedValue(payload, "authority_generation", "authority_generation_id", "epoch_id").toLowerCase();
  const returnedAdmissionGeneration = inspectedValue(payload, "admission_generation", "admission_generation_id").toLowerCase();
  const returnedIntent = inspectedValue(payload, "writer_intent").toUpperCase();
  const returnedOperationRequestId = inspectedValue(payload, "operation_request_id").toLowerCase();
  const rpcContractVersion = inspectedValue(payload, "contract_version").toUpperCase();
  const providerCredentialClass = inspectedValue(payload, "provider_credential_class").toUpperCase();
  const providerPrincipalFingerprint = inspectedValue(
    payload,
    "provider_principal_fingerprint",
  ).toLowerCase();
  const providerDispatchMustBeginBeforeExpiresAt =
    payload?.provider_dispatch_must_begin_before_expires_at === true;
  const suppliedExpiresAt = clean(payload?.expires_at || payload?.lease_expires_at);
  const parsedExpiresAt = Date.parse(suppliedExpiresAt);
  const expiresAt = suppliedExpiresAt && Number.isFinite(parsedExpiresAt)
    ? new Date(parsedExpiresAt).toISOString()
    : "";
  const remainingDispatchMs = Number(payload?.remaining_dispatch_ms);
  const remainingDispatchWindowValid = Number.isSafeInteger(remainingDispatchMs) &&
    remainingDispatchMs > 0 &&
    remainingDispatchMs <= Number(bound.lease_seconds) * 1000;
  const replayUsable = payload?.replay_usable === true;
  if (payload?.ok !== true || !uuid(admissionId) || returnedNonce !== leaseNonce ||
      returnedAuthorityGeneration !== state.expectedAuthorityGeneration ||
      returnedAdmissionGeneration !== state.expectedAdmissionGeneration ||
      returnedIntent !== GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY ||
      returnedOperationRequestId !== bound.operation_request_id || !replayUsable ||
      rpcContractVersion !== PRODUCTION_SCORING_ADMISSION_RPC_CONTRACT_VERSION ||
      providerCredentialClass !== PRODUCTION_SCORING_LEGACY_PROVIDER_CREDENTIAL_CLASS ||
      providerPrincipalFingerprint !== state.providerPrincipalFingerprint ||
      !providerDispatchMustBeginBeforeExpiresAt ||
      !expiresAt || !remainingDispatchWindowValid) {
    throw ingressError(
      "PRODUCTION_SCORING_ADMISSION_V3_REJECTED",
      "Production scoring is temporarily paused because mutation admission was not granted.",
      {
        ok: payload?.ok === true,
        admissionIdPresent: uuid(admissionId),
        leaseNonceMatched: returnedNonce === leaseNonce,
        authorityGenerationMatched: returnedAuthorityGeneration === state.expectedAuthorityGeneration,
        admissionGenerationMatched: returnedAdmissionGeneration === state.expectedAdmissionGeneration,
        writerIntentMatched: returnedIntent === GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY,
        operationRequestIdMatched: returnedOperationRequestId === bound.operation_request_id,
        rpcContractVersionMatched: rpcContractVersion ===
          PRODUCTION_SCORING_ADMISSION_RPC_CONTRACT_VERSION,
        providerCredentialClassMatched: providerCredentialClass ===
          PRODUCTION_SCORING_LEGACY_PROVIDER_CREDENTIAL_CLASS,
        providerPrincipalMatched:
          providerPrincipalFingerprint === state.providerPrincipalFingerprint,
        providerDispatchExpiryContractMatched:
          providerDispatchMustBeginBeforeExpiresAt,
        leaseExpiryPresent: Boolean(suppliedExpiresAt),
        leaseExpiryValid: Boolean(expiresAt),
        remainingDispatchWindowValid,
        replayUsable,
      },
      409,
    );
  }
  const providerMutationKey = fingerprint({
    leaseId: admissionId,
    leaseNonce,
    operation: bound.operation,
    providerPrincipalFingerprint,
    requestFingerprint: bound.request_fingerprint,
  });
  const admission = Object.freeze({
    enabled: true,
    admissionId,
    leaseId: admissionId,
    leaseNonce,
    providerMutationKey,
    rpcContractVersion,
    providerCredentialClass,
    providerPrincipalFingerprint,
    providerDispatchMustBeginBeforeExpiresAt,
    expiresAt,
    operationRequestId: bound.operation_request_id,
    state,
    revisions,
    bound,
  });
  admissionMonotonicWindows.set(admission, Object.freeze({
    beginMonotonicCapture,
    beginRemainingDispatchMs: remainingDispatchMs,
  }));
  return admission;
}

function admissionScopedInput(admission, operation, extra = {}) {
  const input = {
    ...exactResourceInput(admission.state, ""),
    expected_activation_revision: admission.revisions.activationRevision,
    expected_admission_revision: admission.revisions.admissionRevision,
    lease_id: admission.admissionId,
    lease_nonce: admission.leaseNonce,
    operation_request_id: admission.operationRequestId,
    operation,
    actor_id: admission.bound.actor_id,
    ...extra,
  };
  input.request_fingerprint = fingerprint({ ...input, request_fingerprint: undefined });
  return input;
}

async function markProductionGoogleAuthorityWriteStarted(admission, options = {}) {
  const dependencies = normalizeTrustedControlPlaneDependencies(options);
  if (!admission?.enabled) return Object.freeze({ ok: true, disabled: true });
  let payload;
  try {
    payload = await productionScoringIngressRpc(
      V3_RPCS.WRITE_STARTED,
      admissionScopedInput(admission, admission.bound.operation),
      dependencies,
    );
  } catch (cause) {
    throw ingressError(
      "PRODUCTION_SCORING_WRITE_START_UNCONFIRMED",
      "Production scoring is temporarily paused because the write-start boundary could not be confirmed.",
      { admissionId: admission.admissionId, writeStartOutcomeUnknown: true },
      503,
      cause,
    );
  }
  const resolutionState = clean(payload?.resolution_state).toUpperCase();
  const returnedLeaseId = clean(payload?.lease_id).toLowerCase();
  const returnedContractVersion = clean(payload?.contract_version).toUpperCase();
  const returnedCredentialClass = clean(payload?.provider_credential_class).toUpperCase();
  const returnedPrincipalFingerprint = clean(
    payload?.provider_principal_fingerprint,
  ).toLowerCase();
  const returnedLeaseNonce = clean(payload?.lease_nonce).toLowerCase();
  const returnedOperationRequestId = clean(payload?.operation_request_id).toLowerCase();
  const returnedExpiresAt = Date.parse(clean(payload?.expires_at));
  const expectedExpiresAt = Date.parse(admission.expiresAt);
  const remainingDispatchMs = Number(payload?.remaining_dispatch_ms);
  const remainingDispatchWindowValid = Number.isSafeInteger(remainingDispatchMs) &&
    remainingDispatchMs >= 0;
  const exactBoundary = returnedLeaseId === admission.admissionId &&
    returnedLeaseNonce === admission.leaseNonce &&
    returnedOperationRequestId === admission.operationRequestId &&
    returnedContractVersion === PRODUCTION_SCORING_ADMISSION_RPC_CONTRACT_VERSION &&
    returnedCredentialClass === PRODUCTION_SCORING_LEGACY_PROVIDER_CREDENTIAL_CLASS &&
    returnedPrincipalFingerprint === admission.providerPrincipalFingerprint &&
    payload?.provider_dispatch_must_begin_before_expires_at === true &&
    Number.isFinite(returnedExpiresAt) && returnedExpiresAt === expectedExpiresAt &&
    remainingDispatchWindowValid;
  const writeStartedAt = Date.parse(clean(payload?.write_started_at));
  const exactSuccess = payload?.ok === true && resolutionState === "WRITE_STARTED" &&
    exactBoundary && Number.isFinite(writeStartedAt);
  if (!exactSuccess) {
    const provenNoWrite = payload?.ok === false &&
      resolutionState === "PROVEN_NO_WRITE" && exactBoundary;
    throw ingressError(
      "PRODUCTION_SCORING_WRITE_START_UNCONFIRMED",
      "Production scoring is temporarily paused because the write-start boundary was not confirmed.",
      {
        admissionId: admission.admissionId,
        resolutionState,
        exactBoundary,
        remainingDispatchWindowValid,
        writeStartProvenNoWrite: provenNoWrite,
        writeStartOutcomeUnknown: !provenNoWrite,
      },
    );
  }
  return payload;
}

async function reportProductionGoogleAuthorityWriteOutcome(admission, outcome, options = {}) {
  const dependencies = normalizeTrustedControlPlaneDependencies(options);
  if (!admission?.enabled) return Object.freeze({ ok: true, disabled: true, outcomeState: outcome?.outcomeState || "" });
  // Settlement is terminal for the local dispatch capability. Even an
  // accidental future internal call cannot classify the durable lease while a
  // callback or detached task can still reach the provider boundary.
  if (!revokedCanonicalAdmissions.has(admission) ||
      canonicalAdmissionCapabilities.has(admission)) {
    throw ingressError(
      "PRODUCTION_SCORING_OUTCOME_BEFORE_CAPABILITY_REVOCATION_FORBIDDEN",
      "Production scoring outcome cannot be reported before its local Google dispatch capability is revoked.",
      { admissionId: clean(admission?.admissionId), capabilityRevoked: false },
      500,
    );
  }
  const outcomeState = clean(outcome?.outcomeState).toUpperCase();
  if (!Object.values(PRODUCTION_SCORING_ADMISSION_OUTCOMES).includes(outcomeState)) {
    throw ingressError("PRODUCTION_SCORING_OUTCOME_INVALID", "Production scoring mutation outcome is invalid.",
      { outcomeState }, 500);
  }
  const providerMutationKey = clean(outcome?.providerMutationKey || admission.providerMutationKey);
  const providerBeforeFingerprint = clean(outcome?.providerBeforeFingerprint).toLowerCase();
  const providerAfterFingerprint = clean(outcome?.providerAfterFingerprint).toLowerCase();
  const providerReadbackFingerprint = clean(outcome?.providerReadbackFingerprint).toLowerCase();
  const outcomeEvidenceFingerprint = productionScoringOutcomeEvidenceHash({
    outcome: outcomeState,
    lease_id: admission.admissionId,
    request_fingerprint: admission.bound.request_fingerprint,
    admission_revision: admission.revisions.admissionRevision,
    provider_mutation_key: providerMutationKey,
    authority_generation_id: admission.state.expectedAuthorityGeneration,
    admission_generation_id: admission.state.expectedAdmissionGeneration,
    provider_after_fingerprint: providerAfterFingerprint,
    provider_before_fingerprint: providerBeforeFingerprint,
    provider_readback_fingerprint: providerReadbackFingerprint,
  });
  const payload = await productionScoringIngressRpc(
    V3_RPCS.OUTCOME,
    admissionScopedInput(admission, admission.bound.operation, {
      outcome_state: outcomeState,
      write_started: outcome?.writeStarted === true,
      write_attempts: Number(outcome?.writeAttempts || 0),
      confirmed_writes: Number(outcome?.confirmedWrites || 0),
      rejected_writes: Number(outcome?.rejectedWrites || 0),
      ambiguous_writes: Number(outcome?.ambiguousWrites || 0),
      affected_sheets: Array.isArray(outcome?.affectedSheets) ? outcome.affectedSheets : [],
      provider_mutation_key: providerMutationKey,
      provider_before_fingerprint: providerBeforeFingerprint,
      provider_after_fingerprint: providerAfterFingerprint,
      provider_readback_fingerprint: providerReadbackFingerprint,
      outcome_evidence_fingerprint: outcomeEvidenceFingerprint,
      error_code: clean(outcome?.failureCode).slice(0, 100),
    }),
    dependencies,
  );
  const recordedOutcome = clean(payload?.resolution_state || payload?.outcome_state).toUpperCase();
  const exactBoundary = clean(payload?.lease_id).toLowerCase() === admission.admissionId &&
    clean(payload?.lease_nonce).toLowerCase() === admission.leaseNonce &&
    clean(payload?.operation_request_id).toLowerCase() === admission.operationRequestId &&
    clean(payload?.contract_version).toUpperCase() ===
      PRODUCTION_SCORING_ADMISSION_RPC_CONTRACT_VERSION &&
    clean(payload?.provider_credential_class).toUpperCase() ===
      PRODUCTION_SCORING_LEGACY_PROVIDER_CREDENTIAL_CLASS &&
    clean(payload?.provider_principal_fingerprint).toLowerCase() ===
      admission.providerPrincipalFingerprint;
  if (payload?.ok !== true || recordedOutcome !== outcomeState || !exactBoundary) {
    throw ingressError(
      "PRODUCTION_SCORING_ADMISSION_OUTCOME_UNCONFIRMED",
      "Production scoring is paused because the canonical Google mutation outcome is not durably classified.",
      { admissionId: admission.admissionId, outcomeState, exactBoundary },
    );
  }
  return payload;
}

function classifyOutcome(diagnostics, operationError) {
  if (diagnostics.ambiguousWrites > 0) return PRODUCTION_SCORING_ADMISSION_OUTCOMES.AMBIGUOUS;
  if (!diagnostics.writeStarted) return PRODUCTION_SCORING_ADMISSION_OUTCOMES.PROVEN_NO_WRITE;
  if (operationError && diagnostics.confirmedWrites > 0) return PRODUCTION_SCORING_ADMISSION_OUTCOMES.PARTIAL_WRITE;
  if (diagnostics.confirmedWrites > 0 && diagnostics.providerBeforeFingerprint &&
      diagnostics.providerAfterFingerprint &&
      diagnostics.providerAfterFingerprint === diagnostics.providerReadbackFingerprint) {
    return PRODUCTION_SCORING_ADMISSION_OUTCOMES.CONFIRMED_WRITE;
  }
  return PRODUCTION_SCORING_ADMISSION_OUTCOMES.AMBIGUOUS;
}

function canonicalCredentialResources(state) {
  return {
    supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    supabaseProjectUrl: PRODUCTION_SUPABASE_URL,
    googleWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournamentId: PRODUCTION_TOURNAMENT_ID,
    tournamentYear: Number(state.activation.resources.tournamentYear),
    vercelProjectId: state.activation.resources.vercelProjectId,
    vercelProjectName: state.activation.resources.vercelProjectName,
    canonicalHostname: new URL(state.activation.resources.canonicalOrigin).hostname,
  };
}

export async function withProductionGoogleAuthorityWrite(input, operation, options = {}) {
  if (typeof operation !== "function") throw new TypeError("A Production Google write operation is required.");
  const dependencies = normalizeTrustedControlPlaneDependencies(options);
  const admission = await beginProductionGoogleAuthorityWrite(input, dependencies);
  if (!admission.enabled) {
    return withGoogleWorkbookMutationIntent({
      intent: GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY,
      operation: clean(input?.operation || "LEGACY_CANONICAL_WRITE").toUpperCase(),
      admission,
    }, operation);
  }

  registerProductionGoogleAdmissionCapability(
    admission,
    () => markProductionGoogleAuthorityWriteStarted(admission, dependencies),
    admissionMonotonicWindows.get(admission),
  );
  admissionMonotonicWindows.delete(admission);

  const runCanonicalMutation = () => withGoogleWorkbookMutationIntent({
    intent: GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY,
    operation: admission.bound.operation,
    admission,
  }, async () => {
    let result;
    let operationError = null;
    try {
      result = await operation();
    } catch (error) {
      operationError = error;
    } finally {
      // The admitted callback has settled. Detached work must lose its provider
      // dispatch capability before diagnostics or outcome-report I/O can pause
      // this wrapper. The outer finally remains an idempotent cleanup guard.
      revokeProductionGoogleAdmissionCapability(admission);
    }
    const diagnostics = googleWorkbookMutationOutcome();
    const outcomeState = classifyOutcome(diagnostics, operationError);
    try {
      await reportProductionGoogleAuthorityWriteOutcome(admission, {
        ...diagnostics,
        outcomeState,
        failureCode: operationError?.code || "",
      }, dependencies);
    } catch (reportError) {
      throw ingressError(
        "PRODUCTION_SCORING_ADMISSION_OUTCOME_UNCONFIRMED",
        "Production scoring is paused because the canonical Google mutation outcome is not durably classified.",
        {
          admissionId: admission.admissionId,
          outcomeState,
          operationFailed: Boolean(operationError),
          writeStarted: diagnostics.writeStarted,
          confirmedWrites: diagnostics.confirmedWrites,
          ambiguousWrites: diagnostics.ambiguousWrites,
        },
        503,
        reportError,
      );
    }
    if (outcomeState === PRODUCTION_SCORING_ADMISSION_OUTCOMES.AMBIGUOUS ||
        outcomeState === PRODUCTION_SCORING_ADMISSION_OUTCOMES.PARTIAL_WRITE) {
      throw ingressError(
        outcomeState === PRODUCTION_SCORING_ADMISSION_OUTCOMES.PARTIAL_WRITE
          ? "PRODUCTION_SCORING_PARTIAL_WRITE_RECONCILIATION_REQUIRED"
          : "PRODUCTION_SCORING_WRITE_AMBIGUOUS_RECONCILIATION_REQUIRED",
        "Production scoring is paused because the Google mutation requires operator reconciliation.",
        {
          admissionId: admission.admissionId,
          outcomeState,
          writeStarted: diagnostics.writeStarted,
          confirmedWrites: diagnostics.confirmedWrites,
          ambiguousWrites: diagnostics.ambiguousWrites,
          requiresReconciliation: true,
        },
        503,
        operationError,
      );
    }
    if (operationError) throw operationError;
    return result;
  });

  try {
    return await withProductionGoogleServiceAccountCredentials({
      env: dependencies.env,
      operation: "CANONICAL_LEGACY_V2",
      resources: canonicalCredentialResources(admission.state),
      canonicalAdmission: admission,
    }, runCanonicalMutation);
  } finally {
    revokeProductionGoogleAdmissionCapability(admission);
  }
}

export function productionScoringAdmissionRpcNames() {
  return Object.freeze({ ...V3_RPCS });
}
