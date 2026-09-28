// Server-only by construction: AsyncLocalStorage is never imported by a client.
// This is operational telemetry, not the correctness-critical database audit.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { RPC_MUTATION_CONTRACT } from "./operational-rpc-contract.js";

const storage = new AsyncLocalStorage();
export const OPERATIONAL_EVENT_VERSION = 1;
export const TELEMETRY_DOMAINS = Object.freeze([
  "AUTH", "AUTHORIZATION", "SCORING", "ROUND_CONTROL", "TOURNAMENT_READ",
  "NET_SKINS", "CALCUTTA", "ODDS", "DIRECTOR", "DATABASE", "RELEASE_CONTROL",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_:.-]{0,127}$/;
const CODE = /^(?:AUTH|AUTHORIZATION|SCORING|SCORE|MATCH|ROUND|TOURNAMENT|PRODUCTION|NET_SKINS|CALCUTTA|ODDS|MOBILE|DIRECTOR|STALE|DEPENDENCY|CONFLICT|INVALID|INTERNAL|DATABASE|FEATURE|UNKNOWN|SESSION|PERMISSION|HANDICAP|SETUP|PAIRING|RELEASE|PGRST)[A-Z0-9_]{0,95}$/;
const FAMILY = /^[a-zA-Z][a-zA-Z0-9_-]{0,95}$/;
const OUTCOMES = new Set(["COMMITTED", "NOT_COMMITTED", "UNKNOWN", "NOT_APPLICABLE", "UNOBSERVED"]);
const EVENT_TYPES = new Set(["REQUEST", "PHASE", "RPC", "DOMAIN_ERROR", "OUTCOME"]);
const MAX_EVENTS = 64;
const number = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const configuredRevision = value => typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value) ? number(Number(value)) : null;
const safeId = value => typeof value === "string" && ID.test(value) && !/^(?:sb_secret_|eyJ)/.test(value) ? value : null;
const safeCode = value => typeof value === "string" && CODE.test(value) ? value : null;
const duration = value => Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) / 1000 : null;
const defaultSink = event => console.info(JSON.stringify(event));

export function classifyOperationalError(error = {}, status) {
  const raw = error.sqlstate || error.code || error.shadowDiagnostics?.code || error.diagnostics?.code;
  const sqlstate = typeof raw === "string" && /^[0-9A-Z]{5}$/.test(raw) ? raw : null;
  const code = safeCode(raw);
  let errorClass = "INTERNAL_ERROR";
  if (sqlstate === "57014" || /TIMEOUT/.test(code || "") || error.name === "TimeoutError") errorClass = "DATABASE_TIMEOUT";
  else if (sqlstate?.startsWith("08") || ["57P01", "57P02", "57P03", "53300"].includes(sqlstate) || /^PGRST00[0-3]$/.test(code || "")) errorClass = "DATABASE_UNAVAILABLE";
  else if (/UNKNOWN|OUTCOME_NOT_CONFIRMED/.test(code || "")) errorClass = "UNKNOWN_OUTCOME";
  else if (/DEPENDENCY/.test(code || "")) errorClass = "DEPENDENCY_BLOCKED";
  else if (/STALE|REVISION|SNAPSHOT|HANDICAP_CONTEXT|AUTHORITY_INCOMPATIBLE/.test(code || "")) errorClass = "STALE_AUTHORITY";
  else if (/CONFLICT/.test(code || "") || status === 409) errorClass = "CONFLICT";
  else if (status === 401 || /AUTH_INVALID|SESSION_EXPIRED|SESSION_INVALID/.test(code || "")) errorClass = "AUTH_INVALID";
  else if (status === 403 || /FORBIDDEN|AUTHORIZATION|PERMISSION_DENIED/.test(code || "")) errorClass = "AUTHORIZATION_DENIED";
  else if (/UNAVAILABLE/.test(code || "") || status === 503) errorClass = "FEATURE_UNAVAILABLE";
  return { error_class: errorClass, domain_error_code: code, sqlstate };
}

// Accept metadata only from named, already-validated operation fields. Never a
// request body, URL, header map, error.message, SQL text, or arbitrary attributes.
export function operationMetadata(input = {}) {
  return {
    operation_id: safeId(input.operation_id ?? input.operationId ?? input.operation_request_id ?? input.operationRequestId),
    mutation_id: safeId(input.mutation_key ?? input.mutation_id ?? input.clientMutationId),
    job_id: safeId(String(input.job_id ?? input.jobId ?? "")),
    match_id: safeId(input.match_id ?? input.matchId),
    round: number(Number(input.round ?? input.round_number)),
    target_count: number(input.target_count ?? input.targetCount),
    authority_revision: number(input.expected_setup_revision ?? input.expectedSetupRevision),
    authority_fingerprint: /^[0-9a-f]{64}$/i.test(input.expected_fingerprint ?? input.expectedFingerprint ?? input.review_fingerprint ?? input.reviewFingerprint ?? "")
      ? (input.expected_fingerprint ?? input.expectedFingerprint ?? input.review_fingerprint ?? input.reviewFingerprint).toLowerCase() : null,
  };
}

export function setOperationalContext(fields = {}) {
  const state = storage.getStore();
  if (!state) return;
  for (const [key, value] of Object.entries(operationMetadata(fields))) if (value !== null) state.metadata[key] = value;
}

// Call only after an existing trusted authority read; never fetch authority for
// telemetry. A missing release or activation remains null, not a guessed value.
export function observeOperationalAuthority(value = {}) {
  const state = storage.getStore();
  if (!state) return;
  const activation = value.activation_revision ?? value.activationRevision;
  const release = value.release_id ?? value.releaseId;
  if (number(activation) !== null) { state.activation = activation; state.activationSource = "AUTHORITY_READ"; }
  if (number(release) !== null) { state.release = release; state.releaseSource = "AUTHORITY_READ"; }
  const sha = value.deploymentCommit;
  if (typeof sha === "string" && /^[0-9a-f]{40}$/i.test(sha)) state.sha = sha.toLowerCase();
}

export function operationalRequestHeaders(headers = {}) {
  const state = storage.getStore();
  if (!state) return headers;
  const result = new Headers(headers);
  if (state) result.set("x-request-id", state.requestId);
  return Object.fromEntries(result.entries());
}

export function emitOperationalEvent(fields = {}) {
  const state = storage.getStore();
  if (!state?.enabled) return;
  // Reserve the final event for the request summary, even on very busy routes.
  if (fields.event !== "REQUEST" && state.count >= MAX_EVENTS - 1) { state.dropped++; return; }
  if (state.count >= MAX_EVENTS) return;
  state.count++;
  const event = {
    schema_version: OPERATIONAL_EVENT_VERSION,
    timestamp: new Date().toISOString(),
    event: EVENT_TYPES.has(fields.event) ? fields.event : "PHASE",
    request_id: state.requestId,
    correlation_id: state.requestId,
    route: state.route,
    domain: TELEMETRY_DOMAINS.includes(fields.domain) ? fields.domain : state.domain,
    feature: state.feature,
    release: state.release,
    release_source: state.releaseSource,
    activation: state.activation,
    activation_source: state.activationSource,
    sha: state.sha,
    ...state.metadata,
    ...operationMetadata(fields),
    latency_ms: duration(fields.latency_ms),
    http_status: number(fields.http_status),
    query_family: FAMILY.test(fields.query_family || "") ? fields.query_family : null,
    phase: FAMILY.test(fields.phase || "") ? fields.phase : null,
    outcome: OUTCOMES.has(fields.outcome) ? fields.outcome : "UNOBSERVED",
    error_class: ["DATABASE_TIMEOUT", "DATABASE_UNAVAILABLE", "FEATURE_UNAVAILABLE", "AUTH_INVALID", "AUTHORIZATION_DENIED", "STALE_AUTHORITY", "DEPENDENCY_BLOCKED", "UNKNOWN_OUTCOME", "CONFLICT", "INTERNAL_ERROR"].includes(fields.error_class) ? fields.error_class : null,
    domain_error_code: safeCode(fields.domain_error_code),
    sqlstate: /^[0-9A-Z]{5}$/.test(fields.sqlstate || "") ? fields.sqlstate : null,
    canonical_readback: ["VERIFIED", "FAILED", "NOT_OBSERVED"].includes(fields.canonical_readback) ? fields.canonical_readback : "NOT_OBSERVED",
    dropped_events: state.dropped,
  };
  // Retain request metadata where an individual event has no override.
  for (const [key, value] of Object.entries(state.metadata)) if (event[key] === null) event[key] = value;
  try {
    const pending = state.sink(Object.freeze(event));
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch { /* Optional telemetry must never change a canonical outcome. */ }
}

export function recordOperationalError(error, status) {
  const fields = classifyOperationalError(error, status ?? error?.status);
  const state = storage.getStore();
  if (state) state.lastError = fields;
  emitOperationalEvent({ event: "DOMAIN_ERROR", ...fields, http_status: status ?? error?.status });
}

export async function operationalPhase(phase, operation, domain) {
  const start = performance.now();
  try {
    const result = await operation();
    emitOperationalEvent({ event: "PHASE", phase, domain, latency_ms: performance.now() - start, outcome: "NOT_APPLICABLE" });
    return result;
  } catch (error) {
    emitOperationalEvent({ event: "PHASE", phase, domain, latency_ms: performance.now() - start, ...classifyOperationalError(error, error?.status) });
    throw error;
  }
}

export function withOperationalRoute({ route, domain, feature = domain }, handler, options = {}) {
  if (!/^\/api\/[a-zA-Z0-9_/[\]-]+$/.test(route) || !TELEMETRY_DOMAINS.includes(domain) || !FAMILY.test(feature)) throw new Error("Invalid static telemetry route");
  return async function operationalRoute(request, ...args) {
    if (storage.getStore()) return handler(request, ...args);
    const env = options.env || process.env;
    const incoming = request?.headers?.get?.("x-request-id");
    const state = {
      requestId: typeof incoming === "string" && UUID.test(incoming) ? incoming.toLowerCase() : randomUUID(),
      route, domain, feature, metadata: {}, lastError: null, count: 0, dropped: 0,
      release: configuredRevision(env.BAGGER_TELEMETRY_RELEASE_ID),
      activation: configuredRevision(env.BAGGER_TELEMETRY_ACTIVATION_REVISION),
      releaseSource: configuredRevision(env.BAGGER_TELEMETRY_RELEASE_ID) !== null ? "DEPLOYMENT_CONFIG" : "UNAVAILABLE",
      activationSource: configuredRevision(env.BAGGER_TELEMETRY_ACTIVATION_REVISION) !== null ? "DEPLOYMENT_CONFIG" : "UNAVAILABLE",
      sha: /^[0-9a-f]{40}$/i.test(env.VERCEL_GIT_COMMIT_SHA || "") ? env.VERCEL_GIT_COMMIT_SHA.toLowerCase() : null,
      enabled: options.enabled ?? env.BAGGER_OPERATIONAL_TELEMETRY_ENABLED !== "false",
      sink: options.sink || defaultSink,
    };
    return storage.run(state, async () => {
      const start = performance.now();
      try {
        const response = await handler(request, ...args);
        // Route-created NextResponse/Response headers are mutable. Do not turn
        // an immutable third-party response into an operation failure.
        const sharedCache = /(?:\bpublic\b|\bs-maxage\s*=)/i.test(response?.headers?.get?.("cache-control") || "");
        try { if (!sharedCache) response.headers.set("X-Request-ID", state.requestId); } catch {}
        const finalError = state.lastError?.domain_error_code || state.lastError?.sqlstate
          ? classifyOperationalError({ code: state.lastError.sqlstate || state.lastError.domain_error_code }, response?.status)
          : classifyOperationalError({}, response?.status);
        emitOperationalEvent({ event: "REQUEST", latency_ms: performance.now() - start, http_status: response?.status,
          ...(response?.status >= 400 ? finalError : {}), outcome: "NOT_APPLICABLE" });
        return response;
      } catch (error) {
        emitOperationalEvent({ event: "REQUEST", latency_ms: performance.now() - start, http_status: error?.status || 500, ...classifyOperationalError(error, error?.status) });
        throw error;
      }
    });
  };
}

export function rpcIsMutation(family) {
  return Object.hasOwn(RPC_MUTATION_CONTRACT, family) ? RPC_MUTATION_CONTRACT[family] : null;
}

// This measures transport + response decoding, NOT server-only database time.
// The payload is decoded once, exactly as the existing transports did.
export async function observedJsonRpc({ fetchImpl = fetch, url, init, domain, queryFamily, input = {}, mutation = rpcIsMutation(queryFamily) }) {
  const start = performance.now();
  const metadata = operationMetadata(input);
  const state = storage.getStore();
  if (mutation) setOperationalContext(input);
  try {
    const response = await fetchImpl(url, { ...init, headers: operationalRequestHeaders(init.headers) });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.ok === true) observeOperationalAuthority(payload);
    const error = !response.ok || payload?.ok === false;
    const failure = error ? classifyOperationalError({ code: payload?.code || payload?.error?.code }, response.status) : {};
    // A PostgREST SQL error means that single RPC transaction did not commit.
    // A gateway failure or missing body cannot prove rollback.
    const rejected = payload?.ok === false || (!response.ok && failure.sqlstate !== null && failure.sqlstate !== undefined);
    const outcome = mutation === null ? "UNOBSERVED" : !mutation ? "NOT_APPLICABLE" : response.ok && payload?.ok === true ? "COMMITTED" : rejected ? "NOT_COMMITTED" : "UNKNOWN";
    // The existing SQL result itself may be an idempotent operation receipt.
    // Do not claim an independent canonical readback from this acknowledgement.
    const receiptMetadata = operationMetadata(payload?.receipt || payload || {});
    const claimedJob = operationMetadata(payload?.job || {});
    if (receiptMetadata.job_id === null && claimedJob.job_id !== null) receiptMetadata.job_id = claimedJob.job_id;
    for (const key of ["operation_id", "mutation_id", "job_id"]) if (metadata[key] === null && receiptMetadata[key] !== null) metadata[key] = receiptMetadata[key];
    if (mutation && response.ok && payload?.ok === true && metadata.job_id !== null) setOperationalContext({ job_id: metadata.job_id });
    if (Array.isArray(payload?.matches) && payload.matches.length <= 24) metadata.target_count = payload.matches.length;
    if (error && state) state.lastError = failure;
    emitOperationalEvent({ event: "RPC", domain, query_family: queryFamily, phase: "rpc_transport", ...metadata,
      latency_ms: performance.now() - start, http_status: response.status, outcome, ...failure });
    return { response, payload };
  } catch (error) {
    emitOperationalEvent({ event: "RPC", domain, query_family: queryFamily, phase: "rpc_transport", ...metadata,
      latency_ms: performance.now() - start, outcome: mutation === null ? "UNOBSERVED" : mutation ? "UNKNOWN" : "NOT_APPLICABLE", ...classifyOperationalError(error, error?.status) });
    throw error;
  }
}
