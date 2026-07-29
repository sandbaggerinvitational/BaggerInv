import { calculateLiveMatchStatus, calculateMatchPoints } from "./live-hole-scoring.js";

const clean = (value) => String(value ?? "").trim();
const numeric = (value) => {
  if (!clean(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function gameCenterState(match = {}, holeScores = []) {
  const status = clean(match["Match Status"] || match.status).toLowerCase();
  if (status === "final" || status === "finalized" || clean(match["Finalized At"])) return "final";
  if (status === "live" || holeScores.length) return "live";
  return "pre";
}

export function officialMatchResult(match = {}, teamNames = {}) {
  const official = clean(match["Match Status Text"] || match.liveStatusText || match.Notes || match.notes);
  if (official && !/^scheduled$/i.test(official)) {
    return official
      .replace(/\bTeam 1\b/gi, teamNames[1] || "Team 1")
      .replace(/\bTeam 2\b/gi, teamNames[2] || "Team 2");
  }
  const winner = clean(match["18-Hole Winner"] || match.overallWinner || match["Matchup Winner"] || match.matchupWinner);
  const team1Points = numeric(match["Team 1 Points"] ?? match.team1Points);
  const team2Points = numeric(match["Team 2 Points"] ?? match.team2Points);
  if (/halved|tie/i.test(winner) || (team1Points !== null && team2Points !== null && team1Points === team2Points)) {
    return "HALVED";
  }
  return "";
}

export function matchPlayNotation(holeScores = [], teamNames = {}) {
  const unique = new Map(
    holeScores
      .map((row) => ({
        holeNumber: Number(row["Hole Number"] ?? row.holeNumber),
        winner: clean(row["Hole Winner"] ?? row.winner),
      }))
      .filter((row) => Number.isInteger(row.holeNumber) && row.holeNumber >= 1 && row.holeNumber <= 18)
      .map((row) => [row.holeNumber, row])
  );
  let team1 = 0;
  let team2 = 0;
  for (let hole = 1; hole <= 18; hole += 1) {
    const result = unique.get(hole);
    if (!result) return "";
    if (result.winner === "Team 1") team1 += 1;
    if (result.winner === "Team 2") team2 += 1;
    const lead = Math.abs(team1 - team2);
    const remaining = 18 - hole;
    if (hole === 18) {
      if (team1 === team2) return "HALVED";
      const side = team1 > team2 ? 1 : 2;
      return `${teamNames[side] || `Team ${side}`} ${lead} UP`;
    }
    if (lead > remaining) {
      const side = team1 > team2 ? 1 : 2;
      return `${teamNames[side] || `Team ${side}`} ${lead} & ${remaining}`;
    }
  }
  return "";
}

export function liveMatchResult(match = {}, holeScores = [], teamNames = {}) {
  if (gameCenterState(match, holeScores) === "final") {
    return matchPlayNotation(holeScores, teamNames) || officialMatchResult(match, teamNames);
  }
  const results = holeScores.map((row) => ({
    holeNumber: Number(row["Hole Number"] ?? row.holeNumber),
    winner: row["Hole Winner"] ?? row.winner,
  }));
  const status = calculateLiveMatchStatus(results, match.Format || match.format);
  if (!status.currentHole) return "All Square";
  if (status.team1HolesWon === status.team2HolesWon) return "All Square";
  const side = status.team1HolesWon > status.team2HolesWon ? 1 : 2;
  return `${teamNames[side] || `Team ${side}`} ${Math.abs(status.team1HolesWon - status.team2HolesWon)} Up`;
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
