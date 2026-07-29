const clean = (value) => String(value ?? "").trim();

export function normalizedMatchStatus(match = {}) {
  const value = clean(match.status || match.matchStatus).toUpperCase();
  if (["FINAL", "FINALIZED", "COMPLETE", "COMPLETED"].includes(value)) return "FINAL";
  if (["LIVE", "IN PROGRESS", "IN-PROGRESS"].includes(value)) return "LIVE";
  if (match.scoringEnabled) return "OPEN";
  if (["LOCKED", "CLOSED"].includes(value) || match.accessActive === false) return "LOCKED";
  return "UPCOMING";
}

function teeTimeValue(match = {}) {
  const parsed = Date.parse(clean(match.teeTimeAt));
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function matchPriority(match = {}, currentRound) {
  const status = normalizedMatchStatus(match);
  const sameRound = clean(match.round) === clean(currentRound);
  if (status === "LIVE") return 0;
  if (status === "OPEN" && sameRound) return 1;
  if (status === "UPCOMING" && sameRound) return 2;
  if (status === "FINAL" && sameRound) return 3;
  if (status !== "FINAL") return 4;
  return 5;
}

export function selectRelevantPlayerMatches(matches = [], currentRound) {
  const ordered = [...matches].sort((left, right) => {
    const priority = matchPriority(left, currentRound) - matchPriority(right, currentRound);
    if (priority) return priority;
    const time = teeTimeValue(left) - teeTimeValue(right);
    if (time) return time;
    return Number(left.round || 0) - Number(right.round || 0) ||
      Number(left.match || 0) - Number(right.match || 0);
  });
  const simultaneous = ordered.filter((match) =>
    ["LIVE", "OPEN"].includes(normalizedMatchStatus(match)) &&
    matchPriority(match, currentRound) === matchPriority(ordered[0], currentRound)
  );
  return {
    primary: simultaneous.length > 1 ? null : ordered[0] || null,
    choices: simultaneous.length > 1 ? simultaneous : [],
    ordered,
  };
}

export function matchAction(match = {}) {
  const status = normalizedMatchStatus(match);
  if (status === "LIVE") return { label: "Continue Scoring", enabled: true, kind: "score" };
  if (status === "OPEN") return { label: "Open Scorecard", enabled: true, kind: "score" };
  if (status === "FINAL") return { label: "View Match Result", enabled: true, kind: "result" };
  if (status === "LOCKED") return { label: "Scoring Locked", enabled: false, kind: "locked" };
  return { label: "Match Not Open Yet", enabled: false, kind: "upcoming" };
}

export function countdownParts(teeTimeAt, now = Date.now()) {
  const target = Date.parse(clean(teeTimeAt));
  if (!Number.isFinite(target) || target <= now) return null;
  const totalMinutes = Math.ceil((target - now) / 60000);
  if (totalMinutes < 60) return { label: `Tee time in ${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`, totalMinutes };
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { label: `Tee time in ${hours}h${minutes ? ` ${minutes}m` : ""}`, totalMinutes };
}
