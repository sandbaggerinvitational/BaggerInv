export async function canonicalDirectorOddsRequest(input = null, { fetchImpl = fetch, jobId = "" } = {}) {
  const recovery = input?.operationRequestId ? {operationRequestId:input.operationRequestId, outcome:"UNKNOWN", recovery:"CHECK_STATUS_RETRY_SAME_OPERATION"} : {};
  let response;
  try { response = await fetchImpl(`/api/director/canonical-odds${jobId ? `?job=${encodeURIComponent(jobId)}` : ""}`, {
    method: input ? "POST" : "GET", credentials: "same-origin", headers: input ? { "content-type": "application/json" } : {},
    ...(input ? { body: JSON.stringify(input) } : {}), cache: "no-store",
  }); } catch { throw Object.assign(new Error("Odds response could not be confirmed. Retain the same operation for recovery."), {code:"DIRECTOR_ODDS_UNAVAILABLE", ...recovery}); }
  let result; try { result = await response.json(); } catch { throw Object.assign(new Error("Odds response could not be confirmed. Retry the same calculation."), { code: "DIRECTOR_ODDS_RESPONSE_INVALID", ...recovery }); }
  if (!response.ok || result.ok !== true) throw Object.assign(new Error(result.error || "Odds operation could not be confirmed."), { code: result.code, committed: result.committed, jobId: result.jobId,
    operationRequestId:result.operationRequestId || input?.operationRequestId, outcome:result.outcome, recovery:result.recovery });
  return result;
}

// The reviewed read supplies the CAS values. Retries retain the returned
// command verbatim; a refresh must never silently replace its expectation.
export function canonicalDirectorOddsCommand(input, state, operationRequestId = globalThis.crypto.randomUUID()) {
  if (state?.contract !== "certification-director-odds-v1") return input;
  if (!/^[a-f0-9]{64}$/.test(state.context?.token || "") || !/^20[0-9]{2}$/.test(state.context?.tournamentId || "") || !["calculate", "publish"].includes(input?.action)) {
    throw Object.assign(new Error("Refresh the current Odds context before continuing."), {code:"DIRECTOR_ODDS_CONTEXT_REQUIRED"});
  }
  return {...input, operationRequestId, operationTournamentId:state.context.tournamentId, expectedContextToken:state.context.token,
    ...(input.action === "publish" ? {expectedPublicationRevision:state.publication.revision, expectedSnapshotId:state.publication.snapshotId} : {})};
}
