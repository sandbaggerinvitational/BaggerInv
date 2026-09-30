export async function canonicalDirectorOddsRequest(input = null, { fetchImpl = fetch, jobId = "" } = {}) {
  const response = await fetchImpl(`/api/director/canonical-odds${jobId ? `?job=${encodeURIComponent(jobId)}` : ""}`, {
    method: input ? "POST" : "GET", credentials: "same-origin", headers: input ? { "content-type": "application/json" } : {},
    ...(input ? { body: JSON.stringify(input) } : {}), cache: "no-store",
  });
  let result; try { result = await response.json(); } catch { throw Object.assign(new Error("Odds response could not be confirmed. Retry the same calculation."), { code: "DIRECTOR_ODDS_RESPONSE_INVALID" }); }
  if (!response.ok || result.ok !== true) throw Object.assign(new Error(result.error || "Odds operation could not be confirmed."), { code: result.code, committed: result.committed, jobId: result.jobId });
  return result;
}
