// Client-safe action availability only. Mutation authorization and validation remain server-owned.
const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function productionMatchControlActions(match = {}) {
  const status = upper(match.status);
  const final = status === "FINAL";
  const locked = match.scoringLocked === true;
  const access = upper(match.accessState);
  const permissionComplete = match.permissionComplete === true;
  const actions = [];
  if (status === "UPCOMING" && match.scoringReady === true) actions.push("mark-live");
  if (!final && !locked) actions.push("scoring-lock");
  if (!final && locked && permissionComplete) actions.push("scoring-unlock");
  if (!final && !locked && permissionComplete && access !== "ACTIVE") actions.push("access-activate");
  if (!final && ["ACTIVE", "MIXED"].includes(access)) actions.push("access-revoke");
  if (!final && !locked && match.scorecardComplete === true && number(match.scoredHoles) === 18 &&
      number(match.unresolvedMutations) === 0 && clean(match.resultWinner)) actions.push("finalize");
  if (final) actions.push("reopen");
  return actions;
}
