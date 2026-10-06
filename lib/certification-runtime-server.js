// Server-only authority transport. Clients never receive a credential or choose
// a resource. SQL repeats admission under its transaction locks for every call.
import { requireCertificationResourceEnvironment, certificationRegistrationEnvelope } from "./canonical-resource-registration.js";
import { observedJsonRpc } from "./operational-telemetry.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";

export const CERTIFICATION_RUNTIME_CONTRACT = "certification-runtime-v1";
export const CERTIFICATION_INGRESS_CONTRACT = "certification-ingress-v1";
export const CERTIFICATION_OPERATIONS = Object.freeze({
  "SCORING.READ_AUTHORITY": Object.freeze({phase: "READS", mutation: false}),
  "SCORING.READ_PARTICIPANT_CONTEXT": Object.freeze({phase: "READS", mutation: false}),
  "SCORING.READ_MUTATION_STATUS": Object.freeze({phase: "READS", mutation: false}),
  "SCORING.READ_DIRECTOR_OPERATION_STATUS": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "SCORING.SUBMIT_HOLE": Object.freeze({phase: "SCORING", mutation: true}),
  "SCORING.FINALIZE_MATCH": Object.freeze({phase: "SCORING", mutation: true}),
  "SCORING.REOPEN_MATCH": Object.freeze({phase: "DIRECTOR", mutation: true}),
  "DIRECTOR.READ_SETUP": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "DIRECTOR.MUTATE_SETUP": Object.freeze({phase: "DIRECTOR", mutation: true}),
  "DIRECTOR.MUTATE_PAIRINGS": Object.freeze({phase: "DIRECTOR", mutation: true}),
  "DIRECTOR.MATCH_CONTROL": Object.freeze({phase: "DIRECTOR", mutation: true}),
  "DIRECTOR.READ_ODDS_INPUT_CONFIGURATION": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "DIRECTOR.ODDS_INPUT_CONFIGURATION_STATUS": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "DIRECTOR.CONFIGURE_ODDS_INPUTS": Object.freeze({phase: "DIRECTOR", mutation: true}),
  "DIRECTOR.READ_NET_SKINS_CONFIGURATION": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "DIRECTOR.CONFIGURE_NET_SKINS": Object.freeze({phase: "DIRECTOR", mutation: true}),
  "DIRECTOR.READ_NET_SKINS_CALCULATION": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "DIRECTOR.NET_SKINS_CALCULATION_STATUS": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "DIRECTOR.CALCULATE_NET_SKINS": Object.freeze({phase: "DIRECTOR", mutation: true}),
  "DIRECTOR.READ_NET_SKINS": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "DIRECTOR.SAVE_NET_SKINS_ENTRIES": Object.freeze({phase: "DIRECTOR", mutation: true}),
  "DIRECTOR.READ_CALCUTTA_PUBLICATION": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "DIRECTOR.PUBLISH_CALCUTTA": Object.freeze({phase: "DIRECTOR", mutation: true}),
  "DIRECTOR.READ_CALCUTTA": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "DIRECTOR.REPLACE_CALCUTTA_AUCTION": Object.freeze({phase: "DIRECTOR", mutation: true}),
  "DIRECTOR.CLEAR_CALCUTTA_AUCTION": Object.freeze({phase: "DIRECTOR", mutation: true}),
  "DIRECTOR.SETUP_STATUS": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "DIRECTOR.MATCH_CONTROL_STATUS": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "DIRECTOR.NET_SKINS_STATUS": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "DIRECTOR.CALCUTTA_STATUS": Object.freeze({phase: "DIRECTOR", mutation: false}),
  "WORKERS.DELIVERY_TICK": Object.freeze({phase: "WORKERS", mutation: true}),
  "WORKERS.FAIL_PRECLAIM": Object.freeze({phase: "WORKERS", mutation: true}),
  ...Object.fromEntries(["COMPETITION_CLAIM", "COMPETITION_WRITE", "COMPETITION_FAIL", "INTELLIGENCE_CLAIM", "INTELLIGENCE_WRITE", "INTELLIGENCE_FAIL", "CALCUTTA_CLAIM", "CALCUTTA_COMPLETE", "CALCUTTA_FAIL"].map(name => [`WORKERS.${name}`, Object.freeze({phase: "WORKERS", mutation: true})])),
  ...Object.fromEntries(["NET_SKINS_CLAIM", "NET_SKINS_COMPLETE", "NET_SKINS_FAIL", "REQUEUE_DERIVED"].map(name => [`DIRECTOR.${name}`, Object.freeze({phase: "DIRECTOR", mutation: true})])),
  ...Object.fromEntries(["RUNTIME", "GUIDE_CREATE", "GUIDE_VALIDATE", "GUIDE_PUBLISH", "DRAFT_STAGE", "DRAFT_VALIDATE", "DRAFT_COMMIT", "PREDICTION_STAGE", "PREDICTION_VALIDATE", "PREDICTION_COMMIT"].map(name => [`ANNUAL.${name}`, Object.freeze({phase: "ANNUAL", mutation: true, rpc: "mutate_certification_future_authoring_v1"})])),
});
const PHASES = new Set(["READS", "SCORING", "DIRECTOR", "WORKERS", "ANNUAL"]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SCORE_MUTATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const boundContexts = new WeakMap();
// Worker claims/completions retain their existing durable job protocol. Future
// authoring uses exact target/revision receipts under the exclusive annual
// fence and cannot mutate the current scoring predecessor. It is classified
// separately under the approved operation-family contract; missing receipts
// and transport loss still mean UNKNOWN, never proof of non-commit.
const INGRESS_OPERATIONS = new Set(["SCORING.SUBMIT_HOLE", "SCORING.FINALIZE_MATCH", "SCORING.REOPEN_MATCH",
  "DIRECTOR.MUTATE_SETUP", "DIRECTOR.MUTATE_PAIRINGS", "DIRECTOR.MATCH_CONTROL",
  "DIRECTOR.SAVE_NET_SKINS_ENTRIES", "DIRECTOR.CONFIGURE_NET_SKINS", "DIRECTOR.PUBLISH_CALCUTTA", "DIRECTOR.REPLACE_CALCUTTA_AUCTION", "DIRECTOR.CLEAR_CALCUTTA_AUCTION"]);
const INGRESS_STATES = new Set(["ADMITTED", "UNKNOWN", "COMMITTED", "NOT_COMMITTED"]);
const ORIGIN_RECOVERY_READS = new Set(["SCORING.READ_MUTATION_STATUS", "SCORING.READ_DIRECTOR_OPERATION_STATUS"]);
const MUTATING_RPCS = new Set(["execute_certification_operation_v1", "admit_certification_operation_v1",
  "mark_certification_ingress_unknown_v1", "resolve_certification_ingress_v1", "mutate_certification_future_authoring_v1", "dispatch_certification_odds_v1"]);
const clean = value => typeof value === "string" ? value.trim() : "";
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const failure = (code, status = 503, extra = {}) => Object.assign(new Error("Canonical Certification operation could not be confirmed."), {code, status, ...extra});
const positive = value => Number.isSafeInteger(value) && value > 0;

function noAuthorityFields(value, depth = 0) {
  if (depth > 24) throw failure("CERTIFICATION_INPUT_INVALID", 400);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:resource|deployment|authorization|resource_id|resource_class|installation_id|binding_id|manifest_digest|registration_revision|schema_contract|schema_digest|environment|project_ref|project_url|source_workbook_id|actor_auth_user_id|actor_player_id|actorAuthUserId|actorPlayerId|governance_tournament_id|activation_revision|admission_revision|authority_epoch_id|release_commit|context_token|expected_context_token|ingress|lease_id|admission_generation_id|admission_sequence|request_hash)$/.test(key)) throw failure("CERTIFICATION_INPUT_INVALID", 400);
    noAuthorityFields(child, depth + 1);
  }
}
function databaseFailure(payload, status) {
  const sqlstate = /^[0-9A-Z]{5}$/.test(clean(payload?.code)) ? payload.code : undefined;
  const domain = /\b((?:CERTIFICATION|CANONICAL_RESOURCE|ISOLATED_DIRECTOR)_[A-Z_0-9]+)\b/.exec(clean(payload?.message || payload?.code))?.[1];
  const established = /\b((?:(?:SCORING|MATCH|PARTICIPANT|DIRECTOR|TOURNAMENT_SETUP|PRODUCTION|NET_SKINS|FULL_NET|CALCUTTA|FUTURE|ANNUAL|ODDS|PREDICTION_SETTINGS)_[A-Z_0-9]+)|IDEMPOTENCY_CONFLICT|PERMISSION_STALE|ACCESS_PERMISSION_SET_INCOMPLETE)\b/.exec(clean(payload?.message || payload?.code))?.[1];
  if (!domain && established) {
    const establishedStatus = established === "FULL_NET_ENTRY_REVISION_STALE_OR_UNAVAILABLE" ? 409
      : /AUTHORIZATION|FORBIDDEN|DIRECTOR_REQUIRED|OWNER_REQUIRED/.test(established) ? 403 : /INVALID/.test(established) ? 400 : /UNAVAILABLE|SCHEMA_REQUIRED/.test(established) ? 503 : 409;
    return failure("CERTIFICATION_DOMAIN_REJECTED", establishedStatus, {domainCode: established,
      ...(sqlstate ? {databaseSqlstate: sqlstate} : {}), diagnostics: {code: sqlstate || "", message: established}});
  }
  const code = domain || (sqlstate === "57014" ? "CERTIFICATION_DATABASE_TIMEOUT" : ["42883", "42P01", "PGRST202"].includes(clean(payload?.code)) ? "CERTIFICATION_SCHEMA_REQUIRED" : "CERTIFICATION_UNAVAILABLE");
  const mapped = /STALE|CONFLICT/.test(code) ? 409 : /FORBIDDEN|DENIED|AUTHORIZATION_REQUIRED|CONTEXT_REQUIRED/.test(code) ? 403 : /INPUT_INVALID/.test(code) ? 400 : 503;
  return failure(code, mapped, {...(sqlstate ? {databaseSqlstate: sqlstate, diagnostics:{code:sqlstate}} : {}), ...(Number.isInteger(status) ? {upstreamStatus: status} : {})});
}
async function request(name, input, env, state, {fetchImpl = fetch, timeoutMs = 8000} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000) throw failure("CERTIFICATION_INPUT_INVALID", 400);
  const bound = certificationRegistrationEnvelope(state);
  const secret = clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY);
  const headers = {apikey: secret, "content-type": "application/json"};
  if (!secret.startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  let response, payload;
  const startedAt = Date.now();
  try {
    recordDataAuthorityTransport("supabase", {adapter:"certification-runtime"});
    const observed = await observedJsonRpc({fetchImpl, url:`${bound.resource.project_url}/rest/v1/rpc/${name}`,
      domain:input.phase === "SCORING" ? "SCORING" : input.phase === "DIRECTOR" ? "ROUND_CONTROL" : "TOURNAMENT_READ",
      queryFamily:name, mutation:MUTATING_RPCS.has(name),
      input:{...input.payload, operation_request_id:input.operation_request_id},
      init:{method:"POST",headers,body:JSON.stringify({input}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(timeoutMs)}});
    response = observed.response; payload = observed.payload;
  } catch (error) {
    throw failure(error?.name === "TimeoutError" || error?.name === "AbortError" ? "CERTIFICATION_DATABASE_TIMEOUT" : "CERTIFICATION_TRANSPORT_UNAVAILABLE", 503);
  }
  if (!response.ok) throw databaseFailure(payload, response.status);
  return {payload, durationMs: Date.now() - startedAt};
}
function contextMatches(context, envelope) {
  if (!object(context)) return false;
  const expected = {...envelope.resource, ...envelope.deployment};
  if (Object.entries(expected).some(([key, value]) => context[key] !== value)) return false;
  return UUID.test(clean(context.binding_id)) && HASH.test(clean(context.context_token)) &&
    ID.test(clean(context.current_tournament_id)) && context.tournament_id === context.current_tournament_id &&
    Number.isSafeInteger(context.current_tournament_year) && context.current_tournament_year >= 2000 &&
    positive(context.pointer_revision) && ID.test(clean(context.governance_tournament_id)) &&
    UUID.test(clean(context.authority_epoch_id)) && positive(context.activation_revision) && positive(context.admission_revision);
}

export async function resolveCertificationRuntimeContext({env = process.env, phase = "READS"} = {}, dependencies = {}) {
  if (!PHASES.has(phase)) throw failure("CERTIFICATION_PHASE_FORBIDDEN", 403);
  const state = requireCertificationResourceEnvironment(env, dependencies);
  const envelope = certificationRegistrationEnvelope(state);
  const result = await request("read_certification_runtime_context_v1", {contract_version: CERTIFICATION_RUNTIME_CONTRACT, ...envelope, phase}, env, state, dependencies);
  if (result.payload?.contract !== CERTIFICATION_RUNTIME_CONTRACT || !contextMatches(result.payload?.context, envelope)) throw failure("CERTIFICATION_CONTEXT_INVALID");
  const raw = result.payload.context;
  const context = Object.freeze({...envelope.resource, ...envelope.deployment,
    ...Object.fromEntries(["binding_id", "context_token", "current_tournament_id", "tournament_id", "current_tournament_year",
      "pointer_revision", "governance_tournament_id", "authority_epoch_id", "activation_revision", "admission_revision"].map(key => [key, raw[key]])),
    contract: CERTIFICATION_RUNTIME_CONTRACT, phase});
  boundContexts.set(context, {envelope: JSON.stringify(envelope), phase});
  return context;
}

export function assertCertificationRuntimeContext(context, {env = process.env, phase} = {}, dependencies = {}) {
  const state = requireCertificationResourceEnvironment(env, dependencies);
  const bound = boundContexts.get(context);
  if (!bound || bound.phase !== phase || bound.envelope !== JSON.stringify(certificationRegistrationEnvelope(state))) throw failure("CERTIFICATION_CONTEXT_REQUIRED", 403);
  return context;
}

function ingressResult(value, operationRequestId, expectedLease) {
  if (!object(value) || value.ok !== true || value.contract !== CERTIFICATION_INGRESS_CONTRACT ||
    value.operation_request_id !== operationRequestId || !INGRESS_STATES.has(value.state)) throw failure("CERTIFICATION_INGRESS_RESPONSE_INVALID");
  // An exact absent lookup is UNKNOWN, never proof of non-commit. Only status
  // and explicit resolution may return this shape; admission requires a lease.
  if (value.lease_id === null && value.state === "UNKNOWN" && !expectedLease && value.result === undefined) return value;
  if (!UUID.test(clean(value.lease_id)) || !UUID.test(clean(value.admission_generation_id)) ||
    !positive(value.admission_sequence) || !HASH.test(clean(value.request_hash)) ||
    (expectedLease && ["lease_id", "admission_generation_id", "admission_sequence", "request_hash"].some(key => value[key] !== expectedLease[key])) ||
    (["COMMITTED", "NOT_COMMITTED"].includes(value.state) && !object(value.result)) ||
    (value.state === "COMMITTED" && value.result?.ok !== true) ||
    (value.state === "NOT_COMMITTED" && value.result?.ok !== false) ||
    (["ADMITTED", "UNKNOWN"].includes(value.state) && value.result !== undefined)) throw failure("CERTIFICATION_INGRESS_RESPONSE_INVALID");
  return value;
}

function recoveryInput(operation, payload, operationRequestId, authorization, state) {
  if (!INGRESS_OPERATIONS.has(operation)) throw failure("CERTIFICATION_OPERATION_FORBIDDEN", 403);
  const pattern = operation.startsWith("SCORING.") ? SCORE_MUTATION_ID : UUID;
  if (!pattern.test(clean(operationRequestId))) throw failure("CERTIFICATION_OPERATION_ID_REQUIRED", 400);
  if (!object(payload) || Object.keys(payload).some(key => key !== "match_id") ||
    (payload.match_id !== undefined && !ID.test(clean(payload.match_id))) ||
    (authorization !== undefined && !object(authorization))) throw failure("CERTIFICATION_INPUT_INVALID", 400);
  return {contract_version: CERTIFICATION_RUNTIME_CONTRACT, ...certificationRegistrationEnvelope(state),
    phase: CERTIFICATION_OPERATIONS[operation].phase, operation_id: operation, operation_request_id: operationRequestId,
    ...(authorization ? {authorization} : {}), payload};
}

async function ingressRecoveryRpc(name, operation, payload, {env = process.env, operationRequestId, authorization} = {}, dependencies = {}) {
  const state = requireCertificationResourceEnvironment(env, dependencies);
  const input = recoveryInput(operation, payload, operationRequestId, authorization, state);
  const result = await request(name, input, env, state, dependencies);
  return {ok: true, payload: ingressResult(result.payload, operationRequestId), durationMs: result.durationMs};
}

/** Exact-origin status does not require open write admission and cannot execute
 * or terminalize a mutation. SQL revalidates actor/resource/deployment itself. */
export function readCertificationIngressStatus(operation, payload = {}, options = {}, dependencies = {}) {
  return ingressRecoveryRpc("read_certification_ingress_status_v1", operation, payload, options, dependencies);
}

/** Explicit fencing/resolution is separate from status. Only the database may
 * prove NOT_COMMITTED after excluding delayed execution under its locks. */
export function resolveCertificationIngress(operation, payload = {}, options = {}, dependencies = {}) {
  return ingressRecoveryRpc("resolve_certification_ingress_v1", operation, payload, options, dependencies);
}

/** Original context is readback, never a newly branded write context. The
 * resource is immutable; release/admission/pointer revisions may have advanced. */
export async function readCertificationDirectorRecoveryMaterial(operation, payload = {}, {env = process.env,
  operationRequestId, authorization} = {}, dependencies = {}) {
  if (!operation.startsWith("DIRECTOR.")) throw failure("CERTIFICATION_OPERATION_FORBIDDEN", 403);
  const state = requireCertificationResourceEnvironment(env, dependencies);
  const input = recoveryInput(operation, payload, operationRequestId, authorization, state);
  const response = await request("read_certification_director_recovery_material_v1", input, env, state, dependencies);
  const value = ingressResult(response.payload, operationRequestId);
  if (value.lease_id !== null) {
    const context = value.admission_context;
    const expected = certificationRegistrationEnvelope(state).resource;
    if (!object(context) || ["resource_id", "resource_class", "installation_id", "project_ref", "project_url"].some(key => context[key] !== expected[key]) ||
      !UUID.test(clean(context.binding_id)) || !HASH.test(clean(context.context_token)) || !ID.test(clean(context.tournament_id)) ||
      context.tournament_id !== context.current_tournament_id || !ID.test(clean(context.governance_tournament_id)) ||
      !positive(context.activation_revision) || !positive(context.admission_revision) || !positive(context.pointer_revision) ||
      !UUID.test(clean(context.authority_epoch_id)) || !/^[a-f0-9]{40}$/.test(clean(context.release_commit)) ||
      context.operation_request_id !== operationRequestId) throw failure("CERTIFICATION_INGRESS_RESPONSE_INVALID");
  }
  return {ok: true, payload: value, durationMs: response.durationMs};
}

/** Full-request replay verifies the original normalized payload in SQL. It can
 * retrieve existing ingress only; it cannot admit a new write or execute one. */
export async function replayCertificationIngress(operation, payload = {}, {env = process.env,
  operationRequestId, authorization} = {}, dependencies = {}) {
  const state = requireCertificationResourceEnvironment(env, dependencies);
  if (!object(payload)) throw failure("CERTIFICATION_INPUT_INVALID", 400);
  noAuthorityFields(payload);
  const input = recoveryInput(operation, payload.match_id ? {match_id: payload.match_id} : {}, operationRequestId, authorization, state);
  const result = await request("admit_certification_operation_v1", {...input, payload, replay_only: true}, env, state, dependencies);
  return {ok: true, payload: ingressResult(result.payload, operationRequestId), durationMs: result.durationMs};
}

/** authorization is supplied only by server authorization adapters. It is never
 * copied from domain payload. Database gateways independently validate it. */
export async function certificationOperationRpc(operation, payload = {}, {env = process.env,
  context, operationRequestId, expectedContextToken, authorization} = {}, dependencies = {}) {
  const policy = Object.hasOwn(CERTIFICATION_OPERATIONS, operation) ? CERTIFICATION_OPERATIONS[operation] : null;
  if (!policy) throw failure("CERTIFICATION_OPERATION_FORBIDDEN", 403);
  if (!object(payload) || (authorization !== undefined && !object(authorization))) throw failure("CERTIFICATION_INPUT_INVALID", 400);
  noAuthorityFields(payload);
  const requestIdPattern = operation.startsWith("SCORING.") ? SCORE_MUTATION_ID : UUID;
  if (operationRequestId !== undefined && !requestIdPattern.test(clean(operationRequestId))) throw failure("CERTIFICATION_INPUT_INVALID", 400);
  if (policy.mutation && !requestIdPattern.test(clean(operationRequestId))) throw failure("CERTIFICATION_OPERATION_ID_REQUIRED", 400);
  if (policy.mutation && operation.startsWith("SCORING.") && payload.mutation_key !== undefined && payload.mutation_key !== operationRequestId) throw failure("CERTIFICATION_OPERATION_ID_MISMATCH", 400);
  if (expectedContextToken !== undefined && !HASH.test(clean(expectedContextToken))) throw failure("CERTIFICATION_INPUT_INVALID", 400);
  const state = requireCertificationResourceEnvironment(env, dependencies);
  if (ORIGIN_RECOVERY_READS.has(operation)) {
    if (!SCORE_MUTATION_ID.test(clean(operationRequestId)) || !ID.test(clean(payload.match_id)) || payload.mutation_key !== operationRequestId ||
      (operation === "SCORING.READ_DIRECTOR_OPERATION_STATUS" && !["finalize", "reopen"].includes(payload.action))) throw failure("CERTIFICATION_INPUT_INVALID", 400);
    // These exact read branches independently validate the registered resource
    // and original actor in SQL. Current write admission is deliberately absent.
    const response = await request("read_certification_operation_v1", {contract_version: CERTIFICATION_RUNTIME_CONTRACT,
      ...certificationRegistrationEnvelope(state), phase: policy.phase, operation_id: operation,
      operation_request_id: operationRequestId, ...(authorization ? {authorization} : {}), payload}, env, state, dependencies);
    return {ok: true, payload: response.payload, durationMs: response.durationMs};
  }
  const current = context
    ? assertCertificationRuntimeContext(context, {env, phase: policy.phase}, dependencies)
    : await resolveCertificationRuntimeContext({env, phase: policy.phase}, dependencies);
  if (expectedContextToken !== undefined && expectedContextToken !== current.context_token) throw failure("CERTIFICATION_CONTEXT_STALE", 409);
  const envelope = certificationRegistrationEnvelope(state);
  const input = {contract_version: CERTIFICATION_RUNTIME_CONTRACT, ...envelope, phase: policy.phase,
    operation_id: operation, ...(operationRequestId ? {operation_request_id: operationRequestId} : {}),
    expected_context_token: expectedContextToken || current.context_token, ...(authorization ? {authorization} : {}), payload};
  let admission;
  const startedAt = Date.now();
  try {
    if (INGRESS_OPERATIONS.has(operation)) {
      // This RPC commits durable identity before the execution request starts.
      // A lost admission acknowledgement stops here: never guess a lease.
      const admitted = await request("admit_certification_operation_v1", input, env, state, dependencies);
      admission = ingressResult(admitted.payload, operationRequestId);
      if (admission.lease_id === null) throw failure("CERTIFICATION_INGRESS_RESPONSE_INVALID");
      if (["COMMITTED", "NOT_COMMITTED"].includes(admission.state)) return {ok: true, payload: admission.result, durationMs: Date.now() - startedAt};
      input.ingress = {lease_id: admission.lease_id, admission_generation_id: admission.admission_generation_id};
    }
    const response = await request(policy.rpc || (policy.mutation ? "execute_certification_operation_v1" : "read_certification_operation_v1"), input, env, state, dependencies);
    return {ok: true, payload: response.payload, durationMs: Date.now() - startedAt};
  } catch (error) {
    if (admission?.lease_id) {
      // Admission is already durable if this bounded attempt also fails. Its
      // unresolved database state remains a drain blocker across process loss.
      try {
        const recovery = recoveryInput(operation, payload.match_id ? {match_id: payload.match_id} : {}, operationRequestId, authorization, state);
        const response = await request("mark_certification_ingress_unknown_v1", recovery, env, state, dependencies);
        const outcome = ingressResult(response.payload, operationRequestId, admission);
        if (["COMMITTED", "NOT_COMMITTED"].includes(outcome.state)) return {ok: true, payload: outcome.result, durationMs: Date.now() - startedAt};
      } catch { /* Preserve the original typed failure and stable operation ID. */ }
    }
    if (policy.mutation) Object.assign(error, {operationRequestId, outcome: "UNKNOWN", recovery: "CHECK_STATUS_RETRY_SAME_OPERATION"});
    throw error;
  }
}

const PROJECTIONS = new Set(["READS.NET_SKINS_V1", "READS.PUBLISHED_CALCUTTA", "READS.CURRENT_VIEW", "READS.HISTORY_2026", "READS.COMPLETED_HISTORY", "READS.CLOSED_TOURNAMENT", "READS.CLOSED_HISTORY_2026", "READS.GUIDE", "READS.DRAFT", "READS.PREDICTION_SETTINGS", "READS.PLAYER_EDITORIAL", "READS.IDENTITY_FOR_AUTH", "READS.IDENTITY_FOR_PLAYER", "READS.DIRECTOR_ENTITLEMENT"]);
export async function certificationProjectionRpc(operation, payload = {}, {env = process.env, context} = {}, dependencies = {}) {
  if (!PROJECTIONS.has(operation)) throw failure("CERTIFICATION_OPERATION_FORBIDDEN", 403);
  if (!object(payload)) throw failure("CERTIFICATION_INPUT_INVALID", 400);
  noAuthorityFields(payload);
  const state = requireCertificationResourceEnvironment(env, dependencies);
  const current = context ? assertCertificationRuntimeContext(context, {env, phase: "READS"}, dependencies)
    : await resolveCertificationRuntimeContext({env, phase: "READS"}, dependencies);
  const result = await request("read_certification_projection_v1", {contract_version: CERTIFICATION_RUNTIME_CONTRACT,
    ...certificationRegistrationEnvelope(state), phase: "READS", expected_context_token: current.context_token,
    operation, payload}, env, state, dependencies);
  return {ok: true, ...result};
}

const ODDS_OPERATIONS = Object.freeze({
  read_production_odds_calculation_inputs: ["DIRECTOR", false],
  request_production_odds_calculation_job: ["DIRECTOR", true],
  read_production_odds_calculation_jobs: ["DIRECTOR", false],
  supersede_production_odds_calculation_job: ["DIRECTOR", true],
  claim_production_odds_calculation_job: ["WORKERS", true],
  checkpoint_production_odds_calculation_job: ["WORKERS", true],
  complete_production_odds_calculation_job: ["WORKERS", true],
  fail_production_odds_calculation_job: ["WORKERS", true],
  read_production_odds_publication_v1: ["DIRECTOR", false],
  publish_production_championship_odds_v1: ["DIRECTOR", true],
});

/** Server-only durable Odds adapter. Calculator payloads include canonical
 * provenance, so they are accepted only here, after the HTTP adapter has
 * validated its small public command. SQL independently binds every field to
 * the exact resource/context. These are shared domain operation identifiers;
 * the transport always invokes the separately admitted Certification RPC. */
export async function certificationOddsRpc(operation, payload = {}, {env = process.env,
  context, operationRequestId, expectedContextToken, authorization, recovery = false} = {}, dependencies = {}) {
  const policy = Object.hasOwn(ODDS_OPERATIONS, operation) ? ODDS_OPERATIONS[operation] : null;
  if (!policy || (recovery && policy[0] !== "DIRECTOR")) throw failure("CERTIFICATION_OPERATION_FORBIDDEN", 403);
  if (!object(payload) || (authorization !== undefined && !object(authorization)) ||
    (operationRequestId !== undefined && !UUID.test(clean(operationRequestId))) ||
    ((policy[1] || recovery) && !UUID.test(clean(operationRequestId))) ||
    (expectedContextToken !== undefined && !HASH.test(clean(expectedContextToken)))) throw failure("CERTIFICATION_INPUT_INVALID", 400);
  const state = requireCertificationResourceEnvironment(env, dependencies);
  const input = {contract_version: CERTIFICATION_RUNTIME_CONTRACT, ...certificationRegistrationEnvelope(state),
    phase: policy[0], operation_id: `ODDS.${operation}`,
    ...(operationRequestId ? {operation_request_id: operationRequestId} : {}),
    ...(authorization ? {authorization} : {}), payload: {...payload, odds_operation: operation}};
  if (!recovery) {
    const current = context ? assertCertificationRuntimeContext(context, {env, phase: policy[0]}, dependencies)
      : await resolveCertificationRuntimeContext({env, phase: policy[0]}, dependencies);
    if (expectedContextToken !== undefined && expectedContextToken !== current.context_token) throw failure("CERTIFICATION_CONTEXT_STALE", 409);
    input.expected_context_token = expectedContextToken || current.context_token;
  }
  try {
    return {ok: true, ...await request(recovery ? "read_certification_odds_operation_v1" : "dispatch_certification_odds_v1",
      input, env, state, dependencies)};
  } catch (error) {
    if (policy[1] && !recovery) Object.assign(error, {operationRequestId, outcome: "UNKNOWN", recovery: "CHECK_STATUS_RETRY_SAME_OPERATION"});
    throw error;
  }
}
