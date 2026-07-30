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

export function finalizedMatchResult(match = {}, holeScores = [], teamNames = {}) {
  return matchPlayNotation(holeScores, teamNames) || officialMatchResult(match, teamNames);
}

export function finalMatchSummary(match = {}, holeScores = [], teamNames = {}) {
  if (gameCenterState(match, holeScores) !== "final") return "";
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
    if (hole < 18 && lead > remaining) {
      const side = team1 > team2 ? 1 : 2;
      return `${teamNames[side] || `Team ${side}`} clinched on Hole ${hole}.`;
    }
    if (hole === 18) {
      if (team1 === team2) return "Match was halved after 18 holes.";
      const side = team1 > team2 ? 1 : 2;
      return `${teamNames[side] || `Team ${side}`} won ${lead} UP after 18 holes.`;
    }
  }
  return "";
}
