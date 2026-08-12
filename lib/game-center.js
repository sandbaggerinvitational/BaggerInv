import { calculateLiveMatchStatus, calculateMatchPoints } from "./live-hole-scoring.js";
import {
  finalMatchSummary,
  finalizedMatchResult,
  gameCenterState,
} from "./match-result.js";

export {
  finalMatchSummary,
  finalizedMatchResult,
  gameCenterState,
  matchPlayNotation,
  officialMatchResult,
} from "./match-result.js";

const clean = (value) => String(value ?? "").trim();
const numeric = (value) => {
  if (!clean(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function liveMatchResult(match = {}, holeScores = [], teamNames = {}) {
  if (gameCenterState(match, holeScores) === "final") {
    return finalizedMatchResult(match, holeScores, teamNames);
  }
  const results = holeScores.map((row) => ({
    holeNumber: Number(row["Hole Number"] ?? row.holeNumber),
    winner: row["Hole Winner"] ?? row.winner,
  }));
  const status = calculateLiveMatchStatus(results, match.Format || match.format);
  if (!status.currentHole) return "All Square";
  if (status.team1HolesWon === status.team2HolesWon) return "All Square";
  const side = status.team1HolesWon > status.team2HolesWon ? 1 : 2;
  return `${teamNames[side] || `Team ${side}`} ${Math.abs(status.team1HolesWon - status.team2HolesWon)} UP`;
}

function teeTimeMinutes(value) {
  const raw = clean(value);
  const match = raw.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1]);
  const suffix = clean(match[3]).toUpperCase();
  if (suffix === "PM" && hour < 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;
  return (hour * 60) + Number(match[2]);
}

export function orderedTournamentMatches(rounds = []) {
  return rounds
    .flatMap((round) => (round.matches || []).map((match, configuredIndex) => ({
      ...match,
      round: Number(match.round ?? round.number) || 0,
      configuredIndex,
    })))
    .sort((left, right) =>
      left.round - right.round ||
      teeTimeMinutes(left.teeTime || left["Tee Time"]) - teeTimeMinutes(right.teeTime || right["Tee Time"]) ||
      (Number(left.match || left.Match) || left.configuredIndex) - (Number(right.match || right.Match) || right.configuredIndex)
    );
}

export function gameCenterNavigation(rounds = [], matchId) {
  const ordered = orderedTournamentMatches(rounds);
  const index = ordered.findIndex((match) => clean(match.id || match["Match ID"]) === clean(matchId));
  if (index < 0) return { previous: null, next: null, position: null };
  const destination = (match) => match ? ({
    id: clean(match.id || match["Match ID"]),
    label: `Round ${match.round}, Match ${match.match || match.Match || "scheduled"}`,
  }) : null;
  const current = ordered[index];
  const roundMatches = ordered.filter((match) => match.round === current.round);
  const roundIndex = roundMatches.findIndex((match) =>
    clean(match.id || match["Match ID"]) === clean(matchId)
  );
  return {
    previous: destination(ordered[index - 1]),
    next: destination(ordered[index + 1]),
    position: roundIndex >= 0 ? {
      round: current.round,
      index: roundIndex + 1,
      total: roundMatches.length,
    } : null,
  };
}

export function gameCenterUserTeamSide(match = {}, playerIdValue = "") {
  const playerId = clean(playerIdValue);
  if (!playerId) return 0;
  for (const side of [1, 2]) {
    if ((match[`team${side}Players`] || []).some((player) => clean(player?.id) === playerId)) return side;
  }
  return 0;
}

export function gameCenterPoints(match = {}, holeScores = []) {
  const results = holeScores.map((row) => ({
    holeNumber: Number(row["Hole Number"] ?? row.holeNumber),
    winner: row["Hole Winner"] ?? row.winner,
  }));
  const calculated = calculateMatchPoints(match.Format || match.format, results);
  return {
    frontWinner: clean(match["Front 9 Winner"] || match.frontWinner) || calculated.frontWinner,
    backWinner: clean(match["Back 9 Winner"] || match.backWinner) || calculated.backWinner,
    overallWinner: clean(match["18-Hole Winner"] || match.overallWinner || match["Matchup Winner"] || match.matchupWinner) || calculated.overallWinner,
    team1Points: numeric(match["Team 1 Points"] ?? match.team1Points) ?? calculated.team1Points,
    team2Points: numeric(match["Team 2 Points"] ?? match.team2Points) ?? calculated.team2Points,
  };
}

export function gameCenterHoles(holeScores = [], courseHoles = []) {
  const scores = new Map(holeScores.map((row) => [Number(row["Hole Number"] ?? row.holeNumber), row]));
  const metadata = new Map(courseHoles.map((row) => [Number(row["Hole Number"] ?? row.holeNumber), row]));
  return Array.from({ length: 18 }, (_, index) => {
    const number = index + 1;
    const score = scores.get(number) || {};
    const hole = metadata.get(number) || {};
    return {
      number,
      winner: clean(score["Hole Winner"] || score.winner),
      par: numeric(hole.Par ?? hole.par),
      yardage: numeric(hole.Yardage ?? hole.yardage),
      strokeIndex: numeric(hole["Stroke Index"] ?? hole.strokeIndex),
      team1Gross: clean(score["Team 1 Gross Scores"] || score.team1GrossScores),
      team2Gross: clean(score["Team 2 Gross Scores"] || score.team2GrossScores),
      team1Strokes: score["Team 1 Strokes"] ?? score.team1Strokes ?? [],
      team2Strokes: score["Team 2 Strokes"] ?? score.team2Strokes ?? [],
      team1Net: numeric(score["Team 1 Net Score"] ?? score.team1Net),
      team2Net: numeric(score["Team 2 Net Score"] ?? score.team2Net),
      updatedAt: clean(score["Updated At"] || score.updatedAt),
    };
  });
}

export function gameCenterStats(holes = []) {
  const played = holes.filter((hole) => hole.winner);
  const team1 = played.filter((hole) => hole.winner === "Team 1").length;
  const team2 = played.filter((hole) => hole.winner === "Team 2").length;
  const halved = played.filter((hole) => hole.winner === "Halved").length;
  let running = 0;
  let biggestLead = 0;
  let leadChanges = 0;
  let priorLeader = 0;
  for (const hole of played) {
    if (hole.winner === "Team 1") running += 1;
    if (hole.winner === "Team 2") running -= 1;
    biggestLead = Math.max(biggestLead, Math.abs(running));
    const leader = Math.sign(running);
    if (leader && priorLeader && leader !== priorLeader) leadChanges += 1;
    if (leader) priorLeader = leader;
  }
  return { played: played.length, team1, team2, halved, biggestLead, leadChanges, remaining: Math.max(0, 18 - played.length) };
}
