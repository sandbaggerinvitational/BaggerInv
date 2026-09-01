import { isFinalizedMatch, isLiveMatch } from "./live-tournament.js";
import { tournamentDayKey } from "./tournament-timeline.js";

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

export function resolveMatchFilterEmptyState(filter = "all", round = {}) {
  const matches = round.matches || [];
  const status = String(round.status || "").trim().toLowerCase();
  const label = round.label || "This round";
  const tournamentScope = label === "Tournament";
  const teeTime = matches.find((match) => matchState(match) === "upcoming" && match.teeTime)?.teeTime
    || matches.find((match) => match.teeTime)?.teeTime;
  const complete = status === "complete" || (matches.length > 0 && matches.every((match) => matchState(match) === "final"));
  const active = ["live", "active", "in progress", "in-progress"].includes(status)
    || matches.some((match) => matchState(match) === "live");

  if (filter === "live" && !matches.length) return {
    reason: "no-live-matches",
    title: "No matches are live right now.",
    detail: "Check another filter for scheduled or completed matches.",
  };
  if (!matches.length) return {
    reason: "no-pairings",
    title: "Pairings have not been announced yet.",
    detail: "Check back after the tournament schedule is published.",
  };
  if (complete && ["live", "upcoming"].includes(filter)) return {
    reason: "round-complete",
    title: tournamentScope ? "All tournament matches have been completed." : "All matches in this round have been completed.",
    detail: "Select Final to review the completed matches.",
  };
  if (filter === "live") return {
    reason: active ? "no-live-matches" : "round-not-started",
    title: active ? "No matches are live right now." : `${label} has not started yet.`,
    detail: active ? "Check Upcoming or Final for this round." : (teeTime ? `The first tee time is ${teeTime}.` : "Check back when the round begins."),
  };
  if (filter === "upcoming") {
    if (active) return {
      reason: "no-upcoming-matches",
      title: "No upcoming matches remain in this round.",
      detail: "Check Live or Final for the latest match status.",
    };
    return {
      reason: "round-not-started",
      title: teeTime ? `${label} begins at ${teeTime}.` : `${label} has not started yet.`,
      detail: "Scheduled matches will appear here when the round begins.",
    };
  }
  if (filter === "final") return {
    reason: "no-final-matches",
    title: "No matches have been completed in this round.",
    detail: active ? "Final results will appear as matches are completed." : "Final results will appear after the round begins.",
  };
  return {
    reason: "filter-empty",
    title: "No matches match this filter.",
    detail: "Choose another filter to see the available matches.",
  };
}

export function filterEmptyMessage(filter, round = {}) {
  return resolveMatchFilterEmptyState(filter, round).title;
}

export function relativeUpdatedLabel(updatedAt, now = Date.now()) {
  const timestamp = updatedAt instanceof Date ? updatedAt.getTime() : Number(updatedAt);
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return "Updated just now";
  if (seconds < 60) return `Updated ${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}

function supportedTimeZone(value) {
  const requested = String(value || "").trim() || "America/Chicago";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: requested }).format(new Date(0));
    return requested;
  } catch {
    return "America/Chicago";
  }
}

export function formatMatchConfirmationTime(value, { timeZone = "America/Chicago", now = Date.now() } = {}) {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const confirmed = value instanceof Date ? value : new Date(value);
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(confirmed.getTime()) || !Number.isFinite(current.getTime())) return "";

  const zone = supportedTimeZone(timeZone);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  }).format(confirmed);
  if (tournamentDayKey(confirmed, zone) === tournamentDayKey(current, zone)) return time;

  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: zone,
  }).format(confirmed);
  return `${date} at ${time}`;
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
