const clean = (value) => String(value ?? "").trim();
const numeric = (value) => {
  if (!clean(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function formatOfficialMatchResult(value) {
  return clean(value).replace(/\b(\d+)\s*&\s*(\d+)\b/g, "$1 & $2");
}

export function gameCenterState(match = {}, holeScores = []) {
  const status = clean(match["Match Status"] || match.status).toLowerCase();
  if (status === "final" || status === "finalized" || clean(match["Finalized At"])) return "final";
  if (status === "live" || holeScores.length) return "live";
  return "pre";
}

export function officialMatchResult(match = {}, teamNames = {}) {
  const official = clean(match["Match Status Text"] || match.liveStatusText || match.Notes || match.notes);
  if (official && !/^scheduled$/i.test(official)) {
    return formatOfficialMatchResult(official
      .replace(/\bTeam 1\b/gi, teamNames[1] || "Team 1")
      .replace(/\bTeam 2\b/gi, teamNames[2] || "Team 2"));
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

export function formatLiveMatchResult(scores = [], teamNames = {}, { includeWinner = true } = {}) {
  const decided = matchPlayNotation(scores, teamNames);
  if (decided) {
    if (includeWinner || decided === "HALVED") return decided;
    const winnerName = Object.values(teamNames).find((name) =>
      name && decided.toLowerCase().startsWith(String(name).toLowerCase())
    );
    return winnerName ? decided.slice(String(winnerName).length).trim() : decided;
  }
  const team1 = scores.filter((score) => clean(score?.["Hole Winner"] ?? score?.winner) === "Team 1").length;
  const team2 = scores.filter((score) => clean(score?.["Hole Winner"] ?? score?.winner) === "Team 2").length;
  if (team1 === team2) return "All Square";
  const side = team1 > team2 ? 1 : 2;
  const notation = `${Math.abs(team1 - team2)} UP`;
  return includeWinner ? `${teamNames[side] || `Team ${side}`} ${notation}` : notation;
}

export function formatParticipantMatchResult(match = {}, playerSide) {
  const official = clean(match.result?.officialResult);
  if (/^halved$/i.test(official)) return "Halved";
  if (official) {
    const ownTeam = clean(match.team?.name);
    const opponent = clean(match.opponentTeam?.name);
    const winner = [ownTeam, opponent].find((name) =>
      name && official.toLowerCase().startsWith(name.toLowerCase())
    );
    if (winner) {
      const notation = formatOfficialMatchResult(official.slice(winner.length));
      return `${winner === ownTeam ? "Won" : "Lost"} ${notation}`.trim();
    }
  }
  const label = clean(match.result?.label);
  if (label) return formatOfficialMatchResult(label);
  const winner = clean(match.overallWinner || match.matchupWinner).toLowerCase();
  if (!winner) return "";
  if (["halved", "half", "tie", "tied"].includes(winner)) return "Halved";
  const winningSide = ["team 1", "team1", "1"].includes(winner)
    ? 1
    : ["team 2", "team2", "2"].includes(winner) ? 2 : null;
  if (!winningSide || !playerSide) return "";
  const holes = Math.abs(Number(match.team1HolesWon || 0) - Number(match.team2HolesWon || 0));
  return winningSide === Number(playerSide)
    ? holes ? `Won ${holes} UP` : "Won"
    : holes ? `Lost ${holes} UP` : "Lost";
}

export function formatStoredMatchResult(match = {}, teamNames = {}) {
  const status = clean(match.status || match.matchStatus || match["Match Status"]).toUpperCase();
  const final = ["FINAL", "FINALIZED", "COMPLETE", "COMPLETED"].includes(status);
  const live = ["LIVE", "OPEN", "IN PROGRESS", "IN-PROGRESS"].includes(status);
  if (final) {
    const stored = clean(match.finalResult || match.result?.officialResult || match["Final Result"]);
    if (/^halved$/i.test(stored)) return "Halved";
    if (stored) return formatOfficialMatchResult(stored);
    return officialMatchResult(match, teamNames);
  }
  if (!live) return "";
  const stored = clean(match.liveStatusText || match["Match Status Text"]);
  if (stored) return /^all square$/i.test(stored) ? "All Square" : stored.replace(/\bup\b/gi, "UP");
  const team1 = Number(match.team1HolesWon ?? match["Team 1 Holes Won"] ?? 0);
  const team2 = Number(match.team2HolesWon ?? match["Team 2 Holes Won"] ?? 0);
  if (team1 === team2) return "All Square";
  const side = team1 > team2 ? 1 : 2;
  return `${teamNames[side] || `Team ${side}`} ${Math.abs(team1 - team2)} UP`;
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
