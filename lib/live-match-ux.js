import { isFinalizedMatch, isLiveMatch } from "./live-tournament.js";

export const MATCH_FILTERS = [
  ["live", "Live"],
  ["upcoming", "Upcoming"],
  ["final", "Final"],
  ["all", "All"],
];

export function matchState(match = {}) {
  if (isFinalizedMatch(match)) return "final";
  if (isLiveMatch(match)) return "live";
  return "upcoming";
}

export function defaultMatchFilter(matches = []) {
  if (matches.some((match) => matchState(match) === "live")) return "live";
  if (matches.some((match) => matchState(match) === "upcoming")) return "upcoming";
  if (matches.some((match) => matchState(match) === "final")) return "final";
  return "all";
}

export function filterMatches(matches = [], filter = "all") {
  return filter === "all" ? matches : matches.filter((match) => matchState(match) === filter);
}

export function filterEmptyMessage(filter, round = {}) {
  const teeTime = round.matches?.find((match) => match.teeTime)?.teeTime;
  if (filter === "live") return "No matches are live right now.";
  if (filter === "upcoming" && teeTime) return `${round.label || "This round"} begins at ${teeTime}.`;
  if (filter === "upcoming") return "Pairings have not been announced yet.";
  if (filter === "final") return "No matches are final yet.";
  return "Pairings have not been announced yet.";
}

export function relativeUpdatedLabel(updatedAt, now = Date.now()) {
  const timestamp = updatedAt instanceof Date ? updatedAt.getTime() : Number(updatedAt);
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return "Updated just now";
  if (seconds < 60) return `Updated ${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}

export function createRefreshGuard(load) {
  let pending = null;
  return () => {
    if (pending) return pending;
    try {
      pending = Promise.resolve(load()).finally(() => { pending = null; });
    } catch (error) {
      pending = Promise.reject(error).finally(() => { pending = null; });
    }
    return pending;
  };
}
