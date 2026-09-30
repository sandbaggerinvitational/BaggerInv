// Shared by the shipping Director component and its API integration regression.
export const CANONICAL_DIRECTOR_OVERVIEW_ROUTE = "/api/director/canonical-overview";
export async function loadCanonicalDirectorOverview({ fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl(CANONICAL_DIRECTOR_OVERVIEW_ROUTE, { credentials: "same-origin", cache: "no-store", signal });
  let payload;
  try { payload = await response.json(); }
  catch { throw Object.assign(new Error("Canonical Director response could not be read."), { code: "DIRECTOR_CANONICAL_RESPONSE_INVALID", status: response.status }); }
  if (!response.ok || payload?.data?.contract !== "canonical-director-overview-v1" || payload.data.authority !== "supabase" ||
      payload.data.fallbackUsed !== false || payload.data.googleRequests !== 0) {
    const code = /^DIRECTOR_[A-Z_]+$/.test(payload?.code || "") ? payload.code : "DIRECTOR_CANONICAL_RESPONSE_INVALID";
    throw Object.assign(new Error("Canonical Director data is unavailable. Refresh to retry."), { code, status: response.status });
  }
  return payload.data;
}

// Only the new endpoint's explicit pre-write/canonical rejection codes prove
// this operation did not commit. HTTP status alone never proves that outcome.
const NOT_COMMITTED_RESPONSES = Object.freeze({
  DIRECTOR_CANONICAL_ORIGIN_REQUIRED: 403,
  DIRECTOR_AUTHORIZATION_REQUIRED: 403,
  DIRECTOR_AUTHORIZATION_UNAVAILABLE: 503,
  DIRECTOR_CANONICAL_INPUT_INVALID: 400,
  DIRECTOR_CANONICAL_SCOPE_MISMATCH: 403,
  DIRECTOR_CANONICAL_OPERATION_CONFLICT: 409,
  DIRECTOR_CANONICAL_OPERATION_REJECTED: 409,
});
export function canonicalDirectorFailureOutcome(payload, status) {
  if (payload?.committed === true) return "COMMITTED";
  if (Object.hasOwn(NOT_COMMITTED_RESPONSES, payload?.code || "") && NOT_COMMITTED_RESPONSES[payload.code] === status) return "NOT_COMMITTED";
  return "UNKNOWN";
}
export function canonicalDirectorFailureDisposition(error) {
  return error?.outcome === "NOT_COMMITTED"
    ? { retainOperation: false, refreshAuthority: true }
    : { retainOperation: true, refreshAuthority: false };
}

export async function submitCanonicalDirectorOperation(input, { fetchImpl = fetch } = {}) {
  const recovery = { operationRequestId: input.operationRequestId, outcome: "UNKNOWN", recovery: "CHECK_STATUS_RETRY_SAME_OPERATION" };
  let response;
  try {
    response = await fetchImpl(CANONICAL_DIRECTOR_OVERVIEW_ROUTE, { method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  } catch {
    throw Object.assign(new Error("The canonical operation could not be confirmed. Retry the same operation."),
      { code: "DIRECTOR_CANONICAL_OPERATION_UNAVAILABLE", ...recovery });
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw Object.assign(new Error("Canonical Director response could not be read."),
    { code: "DIRECTOR_CANONICAL_RESPONSE_INVALID", status: response.status, ...recovery }); }
  if (!response.ok || payload?.ok !== true || payload?.authority !== "supabase" || payload?.googleRequests !== 0 || !payload?.receipt?.ok || !payload?.canonical?.matchId) {
    const outcome = canonicalDirectorFailureOutcome(payload, response.status);
    const committed = outcome === "COMMITTED";
    throw Object.assign(new Error("The canonical operation could not be confirmed. Refresh current authority before retrying."),
      { code: /^DIRECTOR_[A-Z_]+$/.test(payload?.code || "") ? payload.code : "DIRECTOR_CANONICAL_RESPONSE_INVALID",
        status: response.status, committed, outcome,
        ...(outcome !== "NOT_COMMITTED" ? { ...recovery, outcome } : { recovery: "REFRESH_AUTHORITY_BEFORE_NEW_OPERATION" }) });
  }
  return payload;
}
