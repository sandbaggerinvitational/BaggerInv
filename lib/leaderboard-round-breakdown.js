import { segmentMatchResult } from "./game-center-display.js";
import { formatOfficialMatchResult } from "./match-result.js";

const clean = (value) => String(value ?? "").trim();

function includesPlayer(match, playerId) {
  return [...(match?.team1Players || []), ...(match?.team2Players || [])]
    .some((player) => String(player?.id || "") === String(playerId || ""));
}

function segmentLabel(result) {
  if (!result || result === "Not started") return "Pending";
  if (/^(all square|halved)$/i.test(result)) return "Halved";
  return formatOfficialMatchResult(result);
}

function officialOverallLabel(result, teamNames) {
  const value = clean(result);
  if (!value) return "";
  if (/^halved$/i.test(value)) return "Halved";
  const team = Object.values(teamNames).find((name) => name && value.toLowerCase().startsWith(name.toLowerCase()));
  return formatOfficialMatchResult(team ? value.slice(team.length).trim() : value);
}

export function playerRoundBreakdown(round, playerId, officialPlayerResult, tournament = {}) {
  const match = (round?.matches || []).find((candidate) => includesPlayer(candidate, playerId));
  const status = clean(match?.status).toLowerCase();
  const final = Boolean(match && (match.archiveFinal || ["final", "finalized", "complete", "completed"].includes(status)));
  const live = Boolean(match && !final && ["live", "open", "in progress", "in-progress"].includes(status));
  if (!match || (!final && !live)) return { state: "pending", label: "Pending", segments: [], points: null };

  const holes = (match.holeResults || []).map((hole) => ({
    number: Number(hole.holeNumber ?? hole.number),
    winner: hole.winner,
  }));
  const teamNames = {
    1: tournament?.teamOne?.name || "Team 1",
    2: tournament?.teamTwo?.name || "Team 2",
  };
  const segments = [
    ["Front 9", 1, 9, ""],
    ["Back 9", 10, 18, ""],
    ["Overall", 1, 18, final ? match.finalResult : ""],
  ].map(([label, start, end, official]) => ({
    label,
    value: label === "Overall" && official
      ? officialOverallLabel(official, teamNames)
      : segmentLabel(segmentMatchResult(holes, start, end, teamNames, official).result),
  }));

  return {
    state: final ? "final" : "live",
    label: final ? "Final" : "LIVE",
    segments,
    points: final && officialPlayerResult ? officialPlayerResult.points : null,
  };
}
