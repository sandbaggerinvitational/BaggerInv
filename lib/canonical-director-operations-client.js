// Browser-safe transport: only provider-neutral commands, never privileged credentials.
export const CANONICAL_DIRECTOR_OPERATIONS_ROUTE = "/api/director/canonical-operations";
export const CANONICAL_DIRECTOR_OPERATIONS_CONTRACT = "isolated-director-operations-v1";
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const RESOURCE_TARGET = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const unavailable = (code, extra = {}) => Object.assign(new Error("The canonical operation is unconfirmed. Retry the same operation; do not create a replacement identity."), {code, ...extra});
function validContext(context) {
  // Current play and governance are distinct server-bound authorities after an
  // annual transition. Parsing either identifier grants no client authority;
  // the server still validates the exact actor/resource/current target/token.
  return context?.contract === CANONICAL_DIRECTOR_OPERATIONS_CONTRACT && UUID.test(context.bindingId || "") && HASH.test(context.contextToken || "") && typeof context.tournamentId === "string" && RESOURCE_TARGET.test(context.tournamentId) && typeof context.governanceTournamentId === "string" && RESOURCE_TARGET.test(context.governanceTournamentId);
}
export async function canonicalDirectorOperationsRequest(input = null, {family = null, payload = {}, expectedContextToken, fetchImpl = fetch, signal} = {}) {
  const query = new URLSearchParams();
  if (!input) { if (family) query.set("family", family); if (Object.keys(payload).length) query.set("payload", JSON.stringify(payload)); if (expectedContextToken) query.set("context", expectedContextToken); }
  const recovery = input ? {operationRequestId: input.operationRequestId, outcome: "UNKNOWN", recovery: "CHECK_STATUS_RETRY_SAME_OPERATION"} : {};
  let response, result;
  try {
    response = await fetchImpl(`${CANONICAL_DIRECTOR_OPERATIONS_ROUTE}${query.size ? `?${query}` : ""}`, {method: input ? "POST" : "GET", credentials: "same-origin", cache: "no-store", signal,
      ...(input ? {headers: {"content-type": "application/json"}, body: JSON.stringify(input)} : {})});
  } catch { throw unavailable("DIRECTOR_OPERATIONS_UNAVAILABLE", recovery); }
  try { result = await response.json(); } catch { throw unavailable("DIRECTOR_OPERATIONS_RESPONSE_INVALID", {...recovery, status: response.status}); }
  const valid = response.ok && result?.ok === true && result.contract === CANONICAL_DIRECTOR_OPERATIONS_CONTRACT && result.authority === "supabase" && result.fallbackUsed === false && result.googleRequests === 0 && validContext(result.context) && result.family === (input?.family || family) && (!expectedContextToken || result.context.contextToken === expectedContextToken);
  const statusOnly = input?.mode === "status";
  const validStatus = statusOnly && result.mode === "status" && result.action === input.action && result.operationRequestId === input.operationRequestId && (["NET_SKINS_CALCULATION", "ODDS_INPUT_CONFIGURATION"].includes(input.family) ? ["COMMITTED", "NOT_COMMITTED", "UNKNOWN"] : ["COMMITTED", "UNKNOWN"]).includes(result.outcome) && result.committed === (result.outcome === "COMMITTED") && (result.committed ? result.receipt?.ok === true : result.receipt === null);
  if (!valid || (statusOnly ? !validStatus : input && (result.action !== input.action || result.operationRequestId !== input.operationRequestId || result.context.contextToken !== input.expectedContextToken || result.committed !== true || result.outcome !== "COMMITTED" || result.readbackVerified !== true || result.receipt?.ok !== true || !result.data))) {
    const typedCanonicalFailure = !response.ok && /^DIRECTOR_OPERATIONS_[A-Z_]+$/.test(result?.code || "") && result?.outcome === "COMMITTED" && result?.authority === undefined;
    const committed = input && (valid || typedCanonicalFailure) && result?.committed === true && result.operationRequestId === input.operationRequestId;
    throw unavailable(/^DIRECTOR_OPERATIONS_[A-Z_]+$/.test(result?.code || "") ? result.code : "DIRECTOR_OPERATIONS_RESPONSE_INVALID", {...recovery, status: response.status, ...(input ? {committed: Boolean(committed), outcome: committed ? "COMMITTED" : "UNKNOWN"} : {}), ...(result?.domainCode ? {domainCode: result.domainCode} : {})});
  }
  return result;
}
function fingerprintIdentity(value) {
  if (!HASH.test(value || "")) throw unavailable("DIRECTOR_OPERATIONS_INPUT_INVALID");
  // Existing editor creates a random 256-bit request fingerprint. This stable
  // UUID projection preserves that review's identity across re-created transports.
  const part = value.slice(0, 32).split(""); part[12] = "4"; part[16] = "8";
  const text = part.join(""); return `${text.slice(0,8)}-${text.slice(8,12)}-${text.slice(12,16)}-${text.slice(16,20)}-${text.slice(20)}`;
}
export function createCanonicalDirectorOperationsTransport({fetchImpl = fetch} = {}) {
  let context = null;
  const operations = new Map();
  const read = async (family = null, payload = {}) => {
    const result = await canonicalDirectorOperationsRequest(null, {family, payload, fetchImpl}); context = result.context; return result;
  };
  const mutate = async (family, action, payload, operationRequestId) => {
    if (!UUID.test(operationRequestId || "")) throw unavailable("DIRECTOR_OPERATIONS_INPUT_INVALID");
    const identity = JSON.stringify({family, action, payload});
    let pending = operations.get(operationRequestId);
    if (pending && pending.identity !== identity) throw unavailable("DIRECTOR_OPERATIONS_IDENTITY_CONFLICT", {operationRequestId, outcome: "UNKNOWN"});
    if (!pending) {
      if (!context) await read();
      pending = {identity, input: {family, action, payload, operationRequestId, expectedContextToken: context.contextToken}};
      operations.set(operationRequestId, pending);
    }
    // An explicit retry of an attempted review first reconciles its exact receipt.
    // UNKNOWN is contained under the same ID/context; it never triggers a blind
    // resubmission or a newly bound operation after authority changed.
    if (pending.attempted) {
      const result = await canonicalDirectorOperationsRequest({...pending.input, mode: "status"}, {fetchImpl});
      if (result.outcome === "COMMITTED" && result.readbackVerified === true && result.data) return result;
      throw unavailable("DIRECTOR_OPERATIONS_RECONCILIATION_REQUIRED", {operationRequestId, outcome: result.outcome, committed: result.committed, recovery: "CHECK_STATUS_RETRY_SAME_OPERATION"});
    }
    pending.attempted = true;
    return canonicalDirectorOperationsRequest(pending.input, {fetchImpl});
  };
  const setupRequest = async (input = null) => {
    if (!input) return {ok: true, data: (await read("TOURNAMENT_SETUP")).data};
    const {action, operationRequestId, ...payload} = input;
    const result = await mutate(action === "replace-round-pairings" ? "ROUND_PAIRINGS" : "TOURNAMENT_SETUP", action, payload, operationRequestId);
    return {ok: true, data: result.receipt, canonical: result.data, context: result.context};
  };
  return {
    read, mutate, setupRequest,
    async resolve(operationRequestId) {
      const pending = operations.get(operationRequestId);
      if (!pending) throw unavailable("DIRECTOR_OPERATIONS_IDENTITY_REQUIRED", {operationRequestId, outcome: "UNKNOWN"});
      return canonicalDirectorOperationsRequest({...pending.input, mode: "status"}, {fetchImpl});
    },
    async setupFetch(_url, init = {}) {
      try { return Response.json(await setupRequest(init.method === "POST" ? JSON.parse(init.body) : null)); }
      catch (error) { return Response.json({error: error.message, code: error.code, outcome: error.outcome, operationRequestId: error.operationRequestId}, {status: [400,403,409].includes(error.status) ? error.status : 503}); }
    },
    async netSkinsConfigurationRequest(input = null) {
      if (!input) return (await read("NET_SKINS_CONFIGURATION")).data;
      const {operationRequestId, ...payload} = input;
      return mutate("NET_SKINS_CONFIGURATION", "configure", payload, operationRequestId);
    },
    async netSkinsCalculationRequest(input = null) {
      if (!input) return (await read("NET_SKINS_CALCULATION")).data;
      const {operationRequestId, ...payload} = input;
      return mutate("NET_SKINS_CALCULATION", "calculate", payload, operationRequestId);
    },
    async entriesRequest(input = null) {
      if (!input) return (await read("NET_SKINS_ENTRIES")).data;
      const {operationRequestId, ...payload} = input; return (await mutate("NET_SKINS_ENTRIES", "save", payload, operationRequestId)).receipt;
    },
    async controlRead() { return (await read("MATCH_CONTROL")).data; },
    async controlRequest(action, input) {
      const {operationRequestId} = input;
      return mutate("MATCH_CONTROL", action, {matchId: input.match_id ?? input.matchId, expectedMatchRevision: input.expected_match_revision ?? input.expectedMatchRevision, expectedPermissionRevision: input.expected_permission_revision ?? input.expectedPermissionRevision}, operationRequestId);
    },
    async calcuttaPublicationRequest(input = null) {
      if (!input) return (await read("CALCUTTA_PUBLICATION")).data;
      const {operationRequestId, ...payload} = input;
      return mutate("CALCUTTA_PUBLICATION", "publish", payload, operationRequestId);
    },
    async calcuttaRequest(action, input = {}) {
      if (action === "management-read") return {ok: true, data: (await read("CALCUTTA_MANAGEMENT", input.expectedAuctionRevision === undefined ? {} : {expectedAuctionRevision: input.expectedAuctionRevision})).data};
      const selected = {"management-entry": "replace-auction", "management-clear-entry": "clear-entry"}[action];
      if (!selected) throw unavailable("DIRECTOR_OPERATIONS_INPUT_INVALID");
      const {requestFingerprint, operationRequestId = fingerprintIdentity(requestFingerprint), ...payload} = input;
      return mutate("CALCUTTA_MANAGEMENT", selected, payload, operationRequestId);
    },
  };
}
