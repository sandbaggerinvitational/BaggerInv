import "server-only";

import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";

// A clone can copy every enumerable admission field, but it cannot copy
// membership in these module-private weak collections.
const canonicalAdmissionCapabilities = new WeakMap();
const revokedCanonicalAdmissions = new WeakSet();

const clean = (value) => String(value ?? "").trim();
const lower = (value) => clean(value).toLowerCase();
const upper = (value) => clean(value).toUpperCase();
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value));
const sha256 = (value) => /^[0-9a-f]{64}$/i.test(clean(value));
const commitSha = (value) => /^[0-9a-f]{40}$/i.test(clean(value));
const revision = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0;

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
      "Production canonical Google writes require a module-issued admission capability.",
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

/** Minted only by the complete Production authority wrapper. */
export function registerProductionGoogleAdmissionCapability(admission, markWriteStarted) {
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
  canonicalAdmissionCapabilities.set(admission, {
    boundary: admissionBoundary(admission),
    markWriteStarted,
    scope: null,
    writeStartPromise: null,
    writeStarted: false,
  });
  return admission;
}

/** Consume once; same-scope multi-write shares one durable marker promise. */
export function consumeProductionGoogleAdmissionCapability(admission, details = {}) {
  const capability = activeCapability(admission, details);
  if (!capability.writeStartPromise) {
    const markerDetails = Object.freeze({
      operation: capability.boundary.operation,
      method: upper(details.method),
      path: clean(details.path),
    });
    capability.writeStartPromise = Promise.resolve()
      .then(() => capability.markWriteStarted(markerDetails))
      .then((result) => {
        if (result?.ok !== true) {
          throw capabilityError(
            "PRODUCTION_CANONICAL_GOOGLE_WRITE_MARKER_REJECTED",
            "The durable Production Google writer-start marker was not accepted.",
          );
        }
        capability.writeStarted = true;
        return result;
      });
  }
  return capability.writeStartPromise;
}

/** Synchronous final check immediately before provider fetch invocation. */
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

/** Revoked in the authority wrapper's finally block, including detached work. */
export function revokeProductionGoogleAdmissionCapability(admission) {
  if (!admission || typeof admission !== "object") return false;
  const existed = canonicalAdmissionCapabilities.delete(admission);
  revokedCanonicalAdmissions.add(admission);
  return existed;
}
