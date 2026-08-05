const clean = (value) => String(value ?? "").trim();
const numeric = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const PLAYER_METRICS = [
  ["points", "Points"],
  ["wins", "Wins"],
  ["winPct", "Win %"],
  ["grossAvg", "Gross Avg"],
  ["netAvg", "Net Avg"],
];

export function playerPerformanceRows(leaderboard = [], scoreLeaderboard = []) {
  const completedScores = new Map();
  for (const row of scoreLeaderboard) {
    if (row.entityType === "PAIRING" || Number(row.holes) < 18) continue;
    const values = completedScores.get(row.id) || { gross: [], net: [] };
    if (numeric(row.gross) !== null) values.gross.push(Number(row.gross));
    if (numeric(row.net) !== null) values.net.push(Number(row.net));
    completedScores.set(row.id, values);
  }
  return leaderboard.map((row) => {
    const scores = completedScores.get(row.id) || { gross: [], net: [] };
    const played = Number(row.matchesPlayed) || 0;
    const decided = Number(row.wins) + Number(row.losses) + Number(row.halves);
    return {
      ...row,
      record: `${Number(row.wins) || 0}-${Number(row.losses) || 0}-${Number(row.halves) || 0}`,
      winPct: decided ? (Number(row.wins) / decided) * 100 : null,
      grossAvg: scores.gross.length ? scores.gross.reduce((sum, value) => sum + value, 0) / scores.gross.length : null,
      netAvg: scores.net.length ? scores.net.reduce((sum, value) => sum + value, 0) / scores.net.length : null,
      matchesPlayed: played,
    };
  });
}

export function rankPlayerRows(rows = [], metric = "points", direction) {
  const lowerIsBetter = metric === "grossAvg" || metric === "netAvg";
  const factor = direction === "asc" || (!direction && lowerIsBetter) ? 1 : -1;
  const sorted = [...rows].sort((left, right) => {
    const leftValue = numeric(left[metric]);
    const rightValue = numeric(right[metric]);
    if (leftValue === null && rightValue === null) return clean(left.player).localeCompare(clean(right.player));
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    const difference = (leftValue - rightValue) * factor;
    if (difference) return difference;
    if (metric === "points") {
      return Number(right.wins) - Number(left.wins) ||
        Number(left.losses) - Number(right.losses) ||
        clean(left.player).localeCompare(clean(right.player));
    }
    return Number(right.points) - Number(left.points) || clean(left.player).localeCompare(clean(right.player));
  });
  let previousValue;
  let previousRank = 0;
  return sorted.map((row, index) => {
    const value = numeric(row[metric]);
    const rank = index > 0 && value !== null && value === previousValue ? previousRank : index + 1;
    previousValue = value;
    previousRank = rank;
    return { ...row, displayRank: value === null ? null : rank };
  });
}

export function searchPlayerRows(rows = [], query = "") {
  const needle = clean(query).toLowerCase();
  return needle ? rows.filter((row) => clean(row.player || row.name).toLowerCase().includes(needle)) : rows;
}

export function teamStandings(rounds = [], tournament = {}, selectedRound = "overall") {
  const selected = selectedRound === "overall"
    ? rounds
    : rounds.filter((round) => String(round.number) === String(selectedRound));
  const teams = [tournament.teamOne, tournament.teamTwo].map((team, index) => ({
    side: index + 1,
    name: team?.name || `Team ${index + 1}`,
    logo: team?.logo || "",
    wins: 0,
    losses: 0,
    halves: 0,
    points: selectedRound === "overall" ? Number(team?.score) || 0 : 0,
    remaining: 0,
  }));
  for (const match of selected.flatMap((round) => round.matches || [])) {
    const final = String(match.status || "").toLowerCase() === "final" ||
      String(match.status || "").toLowerCase() === "finalized" ||
      Boolean(match.finalizedAt || match["Finalized At"]);
    if (!final) {
      teams.forEach((team) => { team.remaining += 1; });
      continue;
    }
    if (selectedRound !== "overall") {
      teams[0].points += Number(match.team1Points) || 0;
      teams[1].points += Number(match.team2Points) || 0;
    }
    const winner = clean(match.matchupWinner || match.overallWinner);
    if (/halved|tie/i.test(winner)) {
      teams.forEach((team) => { team.halves += 1; });
    } else if (winner === "Team 1") {
      teams[0].wins += 1; teams[1].losses += 1;
    } else if (winner === "Team 2") {
      teams[1].wins += 1; teams[0].losses += 1;
    }
  }
  const sorted = teams.sort((left, right) => right.points - left.points || right.wins - left.wins || left.losses - right.losses || left.name.localeCompare(right.name));
  let previousPoints;
  let previousRank = 0;
  return sorted.map((team, index) => {
    const rank = index > 0 && team.points === previousPoints ? previousRank : index + 1;
    previousPoints = team.points;
    previousRank = rank;
    return { ...team, rank, record: `${team.wins}-${team.losses}-${team.halves}` };
  });
}

export function roundScoreRows(rows = [], round, format = "", sort = { key: "netToPar", direction: "asc" }) {
  const pairing = ["SC", "SCRAMBLE"].includes(clean(format).toUpperCase());
  const eligible = rows.filter((row) =>
    Number(row.round) === Number(round) &&
    (pairing ? row.entityType === "PAIRING" : row.entityType !== "PAIRING")
  );
  const factor = sort.direction === "desc" ? -1 : 1;
  const sorted = [...eligible].sort((left, right) => {
    const leftValue = numeric(left[sort.key]);
    const rightValue = numeric(right[sort.key]);
    if (leftValue === null && rightValue === null) return clean(left.name).localeCompare(clean(right.name));
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    return (leftValue - rightValue) * factor || clean(left.name).localeCompare(clean(right.name));
  });
  let previousValue;
  let previousRank = 0;
  return sorted.map((row, index) => {
    const value = numeric(row[sort.key]);
    const rank = index > 0 && value !== null && value === previousValue ? previousRank : index + 1;
    previousValue = value;
    previousRank = rank;
    return { ...row, displayRank: rank };
  });
}

function joinedNames(names = []) {
  if (names.length < 2) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

export function teamLeaderInsight(teams = [], tournament = {}) {
  if (!teams.length) return null;
  const highestPoints = Math.max(...teams.map((team) => Number(team.points) || 0));
  const tiedLeaders = teams.filter((team) => (Number(team.points) || 0) === highestPoints);
  const officialWinnerSide = Number(tournament.state?.championSide || tournament.championSide) || null;
  const resolvedLeader = tiedLeaders.find((team) => Number(team.side) === officialWinnerSide);
  const leaders = resolvedLeader ? [resolvedLeader] : tiedLeaders;
  const tied = leaders.length > 1;
  const names = leaders.map((team) => team.name);
  const points = Number(leaders[0]?.points) || 0;
  const pointWord = points === 1 ? "point" : "points";
  return {
    tied,
    leaders,
    points,
    label: tied ? "Team Leaders" : "Team Leader",
    namesLabel: joinedNames(names),
    pointsLabel: `${points} ${pointWord}${tied ? " each" : ""}`,
    accessibleLabel: tied
      ? `Team leaders tied at ${points} ${pointWord}: ${joinedNames(names)}`
      : `Team leader: ${names[0]} with ${points} ${pointWord}`,
  };
}

export function tournamentInsights(players = [], teams = [], tournament = {}) {
  const official = rankPlayerRows(players, "points");
  const unbeaten = official.filter((row) => row.matchesPlayed > 0 && Number(row.losses) === 0);
  const lowestGross = rankPlayerRows(players.filter((row) => numeric(row.grossAvg) !== null), "grossAvg")[0];
  const lowestNet = rankPlayerRows(players.filter((row) => numeric(row.netAvg) !== null), "netAvg")[0];
  const teamLeader = teamLeaderInsight(teams, tournament);
  return {
    pointsLeader: official[0] || null,
    unbeaten,
    lowestGross: lowestGross || null,
    lowestNet: lowestNet || null,
    teamLeader,
    leadingTeam: teamLeader?.leaders[0] || null,
  };
}
