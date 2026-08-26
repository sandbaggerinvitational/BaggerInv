import "server-only";

import { createHash, randomUUID } from "node:crypto";

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
  registerProductionGoogleAdmissionCapability,
  revokeProductionGoogleAdmissionCapability,
} from "./production-google-admission-capability.js";
import { withProductionGoogleServiceAccountCredentials } from "./google-service-account-credential-context.js";
import {
  normalizeScoringMutationAuthorityContract,
  SCORING_MUTATION_AUTHORITY_CONTRACT_VERSION,
} from "./scoring-mutation-authority-contract.js";

export const PRODUCTION_SCORING_ADMISSION_CONTRACT_VERSION =
  "production-scoring-admission-v2";

export const PRODUCTION_SCORING_ADMISSION_OUTCOMES = Object.freeze({
  CONFIRMED_WRITE: "CONFIRMED_WRITE",
  PROVEN_NO_WRITE: "PROVEN_NO_WRITE",
  AMBIGUOUS: "AMBIGUOUS",
  PARTIAL_WRITE: "PARTIAL_WRITE",
});

const V2_RPCS = Object.freeze({
  INSPECT: "inspect_production_scoring_admission",
  BEGIN: "begin_production_scoring_ingress_v2",
  WRITE_STARTED: "mark_production_scoring_ingress_write_started",
  OUTCOME: "report_production_scoring_ingress_outcome",
});

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value));
const integer = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0;

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

/** PostgreSQL jsonb::text for the scalar evidence object built by migration 034. */
export function productionScoringOutcomeEvidenceHash(value) {
  const text = `{${Object.entries(value)
    .sort(([left], [right]) => postgresJsonbKeyOrder(left, right))
    .map(([key, item]) => `${JSON.stringify(key)}: ${JSON.stringify(item)}`)
    .join(", ")}}`;
  return createHash("sha256").update(text).digest("hex");
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
  const authorityGenerationApproved = uuid(expectedAuthorityGeneration);
  const admissionGenerationApproved = uuid(expectedAdmissionGeneration);
  const externalFenceApproved = !externalFenceSupplied || uuid(externalFenceEvidenceId);
  const deploymentIdApproved = /^dpl_[A-Za-z0-9]{8,64}$/.test(deploymentId);
  const enabled = required && exactProductionWorkbook && requested && activation.allowed && authorityGenerationApproved &&
    admissionGenerationApproved && externalFenceApproved && deploymentIdApproved;
  const reason = enabled ? "production-google-admission-v2-ready"
    : !required ? "production-google-canonical-admission-not-required"
    : !exactProductionWorkbook ? "production-workbook-required"
    : !requested ? "production-google-admission-v2-disabled"
    : !activation.allowed ? activation.reason
    : !authorityGenerationApproved ? "production-authority-generation-required"
    : !admissionGenerationApproved ? "production-admission-generation-required"
    : !externalFenceApproved ? "production-provider-fence-evidence-invalid"
    : !deploymentIdApproved ? "production-deployment-id-required"
    : "production-google-admission-v2-unavailable";
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
    deploymentDiagnostic: clean(env.VERCEL_URL),
    googleAuthorityRequested,
    exactProductionWorkbook,
    serverEnvironmentOnly: true,
  });
}

async function productionScoringIngressRpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 12_000,
} = {}) {
  assertProductionCutoverActivation({ env, requiredPhase: "STATIC_BACKEND" });
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  const url = `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${functionName}`;
  recordDataAuthorityTransport("supabase", { adapter: "production-scoring-admission-v2" });
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
    const missingV2 = response.status === 404 || /FUNCTION|SCHEMA|NOT_FOUND/.test(providerCode);
    throw ingressError(
      missingV2
        ? "PRODUCTION_SCORING_ADMISSION_V2_CONTRACT_UNAVAILABLE"
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
    operation: V2_RPCS.INSPECT,
    nonce,
    deploymentId: state.deploymentId,
  }));
  input.inspection_nonce = nonce;
  const payload = await productionScoringIngressRpc(V2_RPCS.INSPECT, input, options);
  const activationRevision = inspectedRevision(payload, "activation_revision");
  const admissionRevision = inspectedRevision(payload, "admission_revision");
  const authorityGeneration = inspectedValue(payload, "authority_generation", "authority_generation_id", "epoch_id").toLowerCase();
  const admissionGeneration = inspectedValue(payload, "admission_generation", "admission_generation_id").toLowerCase();
  const externalFenceEvidenceId = inspectedValue(payload, "external_fence_evidence_id", "provider_fence_evidence_id").toLowerCase();
  const deploymentId = inspectedValue(payload, "deployment_id");
  const authority = inspectedValue(payload, "authority", "current_authority").toUpperCase();
  const admissionState = inspectedValue(payload, "admission_state").toUpperCase();
  const executionGate = inspectedValue(payload, "execution_gate", "state", "ingress").toUpperCase();
  const scoringIngressEnabled = payload?.scoring_ingress_enabled === true;
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
    scoringIngressEnabled,
  });
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
  const env = options.env || process.env;
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
  const inspected = await inspectAdmissionBoundary(state, { ...options, env });
  const validAuthority = ["GOOGLE", "SUPABASE"].includes(expectedAuthority) &&
    inspected.authority === expectedAuthority;
  const googleOpen = expectedAuthority !== "GOOGLE" || inspected.admissionState === "OPEN";
  const supabaseOpen = expectedAuthority !== "SUPABASE" ||
    (inspected.executionGate === "OPEN" && inspected.scoringIngressEnabled);
  const valid = inspected.payload?.ok === true &&
    inspected.activationRevision >= 0 && inspected.admissionRevision >= 0 &&
    inspected.authorityGeneration === state.expectedAuthorityGeneration &&
    inspected.admissionGeneration === state.expectedAdmissionGeneration &&
    inspected.deploymentId === state.deploymentId && validAuthority && googleOpen && supabaseOpen;
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

export async function beginProductionGoogleAuthorityWrite(input, options = {}) {
  const env = options.env || process.env;
  const state = productionGoogleIngressLeaseEnvironment(env);
  if (!state.required) return Object.freeze({ enabled: false, admissionId: "", leaseId: "", state });
  if (!state.enabled) {
    throw ingressError(
      "PRODUCTION_SCORING_ADMISSION_V2_UNAVAILABLE",
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
  const inspected = await inspectAdmissionBoundary(state, { ...options, env });
  const revisions = beginRevisionsFromClientContract(input, state, inspected);
  const leaseNonce = randomUUID();
  const bound = serverBoundInput(input, state, revisions, leaseNonce);
  const payload = await productionScoringIngressRpc(V2_RPCS.BEGIN, bound, { ...options, env });
  const admissionId = clean(payload?.lease_id || payload?.admission_id).toLowerCase();
  const returnedNonce = clean(payload?.lease_nonce || leaseNonce).toLowerCase();
  const returnedAuthorityGeneration = inspectedValue(payload, "authority_generation", "authority_generation_id", "epoch_id").toLowerCase();
  const returnedAdmissionGeneration = inspectedValue(payload, "admission_generation", "admission_generation_id").toLowerCase();
  const returnedIntent = inspectedValue(payload, "writer_intent").toUpperCase();
  const returnedOperationRequestId = inspectedValue(payload, "operation_request_id").toLowerCase();
  const replayUsable = payload?.replay_usable === true;
  if (payload?.ok !== true || !uuid(admissionId) || returnedNonce !== leaseNonce ||
      returnedAuthorityGeneration !== state.expectedAuthorityGeneration ||
      returnedAdmissionGeneration !== state.expectedAdmissionGeneration ||
      returnedIntent !== GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY ||
      returnedOperationRequestId !== bound.operation_request_id || !replayUsable) {
    throw ingressError(
      "PRODUCTION_SCORING_ADMISSION_V2_REJECTED",
      "Production scoring is temporarily paused because mutation admission was not granted.",
      {
        ok: payload?.ok === true,
        admissionIdPresent: uuid(admissionId),
        leaseNonceMatched: returnedNonce === leaseNonce,
        authorityGenerationMatched: returnedAuthorityGeneration === state.expectedAuthorityGeneration,
        admissionGenerationMatched: returnedAdmissionGeneration === state.expectedAdmissionGeneration,
        writerIntentMatched: returnedIntent === GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY,
        operationRequestIdMatched: returnedOperationRequestId === bound.operation_request_id,
        replayUsable,
      },
      409,
    );
  }
  const providerMutationKey = fingerprint({
    leaseId: admissionId,
    leaseNonce,
    operation: bound.operation,
    requestFingerprint: bound.request_fingerprint,
  });
  return Object.freeze({
    enabled: true,
    admissionId,
    leaseId: admissionId,
    leaseNonce,
    providerMutationKey,
    operationRequestId: bound.operation_request_id,
    state,
    revisions,
    bound,
  });
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

export async function markProductionGoogleAuthorityWriteStarted(admission, options = {}) {
  if (!admission?.enabled) return Object.freeze({ ok: true, disabled: true });
  const payload = await productionScoringIngressRpc(
    V2_RPCS.WRITE_STARTED,
    admissionScopedInput(admission, admission.bound.operation),
    { ...options, env: options.env || process.env },
  );
  if (payload?.ok !== true) {
    throw ingressError(
      "PRODUCTION_SCORING_WRITE_START_UNCONFIRMED",
      "Production scoring is temporarily paused because the write-start boundary was not confirmed.",
      { admissionId: admission.admissionId },
    );
  }
  return payload;
}

export async function reportProductionGoogleAuthorityWriteOutcome(admission, outcome, options = {}) {
  if (!admission?.enabled) return Object.freeze({ ok: true, disabled: true, outcomeState: outcome?.outcomeState || "" });
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
    V2_RPCS.OUTCOME,
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
    { ...options, env: options.env || process.env },
  );
  const recordedOutcome = clean(payload?.resolution_state || payload?.outcome_state).toUpperCase();
  if (payload?.ok !== true || recordedOutcome !== outcomeState) {
    throw ingressError(
      "PRODUCTION_SCORING_ADMISSION_OUTCOME_UNCONFIRMED",
      "Production scoring is paused because the canonical Google mutation outcome is not durably classified.",
      { admissionId: admission.admissionId, outcomeState },
    );
  }
  return payload;
}

function classifyOutcome(diagnostics, operationError) {
  if (!diagnostics.writeStarted) return PRODUCTION_SCORING_ADMISSION_OUTCOMES.PROVEN_NO_WRITE;
  if (diagnostics.ambiguousWrites > 0) return PRODUCTION_SCORING_ADMISSION_OUTCOMES.AMBIGUOUS;
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
  const admission = await beginProductionGoogleAuthorityWrite(input, options);
  if (!admission.enabled) {
    return withGoogleWorkbookMutationIntent({
      intent: GOOGLE_WORKBOOK_MUTATION_INTENTS.CANONICAL_LEGACY,
      operation: clean(input?.operation || "LEGACY_CANONICAL_WRITE").toUpperCase(),
      admission,
    }, operation);
  }

  registerProductionGoogleAdmissionCapability(
    admission,
    () => markProductionGoogleAuthorityWriteStarted(admission, options),
  );

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
    }
    const diagnostics = googleWorkbookMutationOutcome();
    const outcomeState = classifyOutcome(diagnostics, operationError);
    try {
      await reportProductionGoogleAuthorityWriteOutcome(admission, {
        ...diagnostics,
        outcomeState,
        failureCode: operationError?.code || "",
      }, options);
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
      env: options.env || process.env,
      operation: "CANONICAL_LEGACY_V2",
      resources: canonicalCredentialResources(admission.state),
      canonicalAdmission: admission,
    }, runCanonicalMutation);
  } finally {
    revokeProductionGoogleAdmissionCapability(admission);
  }
}

export function productionScoringAdmissionRpcNames() {
  return Object.freeze({ ...V2_RPCS });
}
