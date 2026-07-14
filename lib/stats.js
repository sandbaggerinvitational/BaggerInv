import historicalData from "./historical-data.json";

const FORMAT_NAMES = {
  BB: "2v2 Best Ball",
  SC: "Scramble",
  SI: "Singles",
};

const ROUND_ORDER = { "Round 1": 1, "Round 2": 2, "Round 3": 3 };
const ELO_START = 1500;
const ELO_K = 24;

function clean(value) {
  return String(value ?? "").trim();
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyRecord() {
  return { wins: 0, losses: 0, halves: 0, matches: 0, points: 0 };
}

function addOutcome(record, outcome, points) {
  record.matches += 1;
  record.points += numeric(points);
  if (outcome === "win") record.wins += 1;
  if (outcome === "loss") record.losses += 1;
  if (outcome === "half") record.halves += 1;
}

function recordPercentage(record) {
  if (!record.matches) return 0;
  return ((record.wins + record.halves * 0.5) / record.matches) * 100;
}

function playersForSide(match, side) {
  return side === 1
    ? [match["Team 1 Player 1"], match["Team 1 Player 2"]].filter(Boolean)
    : [match["Team 2 Player 1"], match["Team 2 Player 2"]].filter(Boolean);
}

function playerSide(match, playerId) {
  if (playersForSide(match, 1).includes(playerId)) return 1;
  if (playersForSide(match, 2).includes(playerId)) return 2;
  return null;
}

function outcomeForSide(match, side) {
  const winner = clean(match["Matchup Winner"]).toLowerCase();
  if (["halved", "half", "tie"].includes(winner)) return "half";
  if (winner === `team ${side}`) return "win";
  return "loss";
}

function actualScoreForTeamOne(match) {
  const winner = clean(match["Matchup Winner"]).toLowerCase();
  if (["halved", "half", "tie"].includes(winner)) return 0.5;
  if (winner === "team 1") return 1;
  return 0;
}

function playerPoints(match, side) {
  return numeric(match[side === 1 ? "Team 1 Points" : "Team 2 Points"]);
}

function teammateForMatch(match, playerId, side) {
  return playersForSide(match, side).find((id) => id !== playerId) ?? null;
}

function winningSideForYear(year) {
  const tournament = historicalData.tournaments.find(
    (item) => Number(item.Year) === Number(year)
  );
  const teamNames = historicalData.teamNames.find(
    (item) => Number(item.Year) === Number(year)
  );
  if (!tournament || !teamNames || !tournament["Winning Team"]) return null;
  if (clean(tournament["Winning Team"]) === clean(teamNames["Team 1"])) return 1;
  if (clean(tournament["Winning Team"]) === clean(teamNames["Team 2"])) return 2;
  return null;
}

function teamNameForPlayerYear(playerId, year) {
  const names = historicalData.teamNames.find((item) => Number(item.Year) === Number(year));
  if (!names) return "Team unavailable";
  const match = historicalData.matches.find(
    (item) => Number(item.Year) === Number(year) && playerSide(item, playerId)
  );
  if (!match) return "Team unavailable";
  return playerSide(match, playerId) === 1 ? names["Team 1"] : names["Team 2"];
}

function chronologicalMatches() {
  return [...historicalData.matches]
    .filter((match) => match.Year && match["Matchup Winner"])
    .sort((a, b) =>
      Number(a.Year) - Number(b.Year) ||
      (ROUND_ORDER[clean(a.Round)] ?? 99) - (ROUND_ORDER[clean(b.Round)] ?? 99) ||
      numeric(a["Match Number"] ?? a.Match) - numeric(b["Match Number"] ?? b.Match)
    );
}

export function getPlayerMap() {
  return Object.fromEntries(
    historicalData.players.map((player) => [player["Player ID"], player])
  );
}

export function getPlayers() {
  return [...historicalData.players].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return clean(a["Display Name"]).localeCompare(clean(b["Display Name"]));
  });
}

export function getPlayerBySlug(slug) {
  return historicalData.players.find(
    (player) => player.slug === clean(slug).toLowerCase()
  );
}

export function getPlayerStats(playerId) {
  const records = {
    overall: emptyRecord(), BB: emptyRecord(), SC: emptyRecord(), SI: emptyRecord(),
  };
  const seasons = new Map();
  const partners = new Map();
  const opponents = new Map();

  for (const match of historicalData.matches) {
    const side = playerSide(match, playerId);
    if (!side) continue;
    const format = clean(match.Format);
    const year = Number(match.Year);
    const outcome = outcomeForSide(match, side);
    const points = playerPoints(match, side);

    addOutcome(records.overall, outcome, points);
    if (records[format]) addOutcome(records[format], outcome, points);

    if (!seasons.has(year)) {
      seasons.set(year, {
        year,
        teamName: teamNameForPlayerYear(playerId, year),
        overall: emptyRecord(), BB: emptyRecord(), SC: emptyRecord(), SI: emptyRecord(),
      });
    }
    const season = seasons.get(year);
    addOutcome(season.overall, outcome, points);
    if (season[format]) addOutcome(season[format], outcome, points);

    const teammateId = teammateForMatch(match, playerId, side);
    if (teammateId) {
      if (!partners.has(teammateId)) partners.set(teammateId, emptyRecord());
      addOutcome(partners.get(teammateId), outcome, points);
    }

    const opponentIds = playersForSide(match, side === 1 ? 2 : 1);
    for (const opponentId of opponentIds) {
      if (!opponents.has(opponentId)) opponents.set(opponentId, emptyRecord());
      addOutcome(opponents.get(opponentId), outcome, points);
    }
  }

  const appearances = [...seasons.keys()].sort((a, b) => a - b);
  const championships = appearances.filter((year) => {
    const winningSide = winningSideForYear(year);
    return winningSide && historicalData.matches.some(
      (match) => Number(match.Year) === year && playerSide(match, playerId) === winningSide
    );
  });

  const playerMap = getPlayerMap();
  const partnersRows = [...partners.entries()].map(([id, record]) => ({
    player: playerMap[id], record, percentage: recordPercentage(record),
  })).filter((row) => row.player).sort((a, b) =>
    b.record.points - a.record.points || b.percentage - a.percentage || b.record.matches - a.record.matches
  );

  const opponentRows = [...opponents.entries()].map(([id, record]) => ({
    player: playerMap[id], record, percentage: recordPercentage(record),
  })).filter((row) => row.player).sort((a, b) =>
    b.record.matches - a.record.matches || b.record.points - a.record.points
  );

  return {
    records,
    percentages: {
      overall: recordPercentage(records.overall),
      BB: recordPercentage(records.BB),
      SC: recordPercentage(records.SC),
      SI: recordPercentage(records.SI),
    },
    appearances,
    championships,
    seasons: [...seasons.values()].sort((a, b) => b.year - a.year),
    partners: partnersRows,
    opponents: opponentRows,
    biggestRival: opponentRows[0] ?? null,
  };
}

export function getAllPlayerStats() {
  return getPlayers().map((player) => ({ player, stats: getPlayerStats(player["Player ID"]) }));
}

export function getHeadToHead(playerOneId, playerTwoId) {
  const overall = emptyRecord();
  const byFormat = { BB: emptyRecord(), SC: emptyRecord(), SI: emptyRecord() };
  const meetings = [];

  for (const match of chronologicalMatches()) {
    const sideOne = playerSide(match, playerOneId);
    const sideTwo = playerSide(match, playerTwoId);
    if (!sideOne || !sideTwo || sideOne === sideTwo) continue;

    const outcome = outcomeForSide(match, sideOne);
    const points = playerPoints(match, sideOne);
    addOutcome(overall, outcome, points);
    if (byFormat[match.Format]) addOutcome(byFormat[match.Format], outcome, points);
    meetings.push({
      year: Number(match.Year),
      round: match.Round,
      format: match.Format,
      outcome,
      pointsOne: playerPoints(match, sideOne),
      pointsTwo: playerPoints(match, sideTwo),
    });
  }

  return { overall, byFormat, meetings: meetings.reverse() };
}

export function getEloRatings() {
  const playerMap = getPlayerMap();
  const ratings = new Map();

  for (const player of historicalData.players) {
    ratings.set(player["Player ID"], {
      player,
      rating: ELO_START,
      peak: ELO_START,
      matches: 0,
      lastChange: 0,
    });
  }

  for (const match of chronologicalMatches()) {
    const teamOne = playersForSide(match, 1).filter((id) => ratings.has(id));
    const teamTwo = playersForSide(match, 2).filter((id) => ratings.has(id));
    if (!teamOne.length || !teamTwo.length) continue;

    const average = (ids) => ids.reduce((sum, id) => sum + ratings.get(id).rating, 0) / ids.length;
    const ratingOne = average(teamOne);
    const ratingTwo = average(teamTwo);
    const expectedOne = 1 / (1 + Math.pow(10, (ratingTwo - ratingOne) / 400));
    const actualOne = actualScoreForTeamOne(match);
    const delta = ELO_K * (actualOne - expectedOne);

    for (const id of teamOne) {
      const row = ratings.get(id);
      row.rating += delta;
      row.matches += 1;
      row.lastChange = delta;
      row.peak = Math.max(row.peak, row.rating);
    }
    for (const id of teamTwo) {
      const row = ratings.get(id);
      row.rating -= delta;
      row.matches += 1;
      row.lastChange = -delta;
      row.peak = Math.max(row.peak, row.rating);
    }
  }

  return [...ratings.values()]
    .filter((row) => row.matches > 0 && playerMap[row.player["Player ID"]])
    .map((row) => ({
      ...row,
      rating: Math.round(row.rating),
      peak: Math.round(row.peak),
      lastChange: Math.round(row.lastChange * 10) / 10,
    }))
    .sort((a, b) => b.rating - a.rating || b.peak - a.peak);
}

export function getRecords() {
  const all = getAllPlayerStats();
  const minimumAppearances = 5;
  return {
    points: [...all].sort((a, b) => b.stats.records.overall.points - a.stats.records.overall.points),
    wins: [...all].sort((a, b) => b.stats.records.overall.wins - a.stats.records.overall.wins),
    championships: [...all].sort((a, b) => b.stats.championships.length - a.stats.championships.length),
    appearances: [...all].sort((a, b) => b.stats.appearances.length - a.stats.appearances.length),
    percentage: [...all].filter((row) => row.stats.appearances.length >= minimumAppearances)
      .sort((a, b) => b.stats.percentages.overall - a.stats.percentages.overall || b.stats.records.overall.matches - a.stats.records.overall.matches),
    byFormat: Object.fromEntries(["BB", "SC", "SI"].map((format) => [format,
      [...all].filter((row) => row.stats.appearances.length >= minimumAppearances)
        .sort((a, b) => b.stats.percentages[format] - a.stats.percentages[format] || b.stats.records[format].points - a.stats.records[format].points)
    ])),
  };
}

export function getTournaments() {
  const awardsByYear = Object.groupBy(historicalData.awards, (award) => Number(award.Year));
  return [...historicalData.tournaments].filter((tournament) => tournament.Year).map((tournament) => {
    const year = Number(tournament.Year);
    return {
      ...tournament, year,
      teams: historicalData.teamNames.find((row) => Number(row.Year) === year),
      courses: historicalData.courses.filter((course) => Number(course.Year) === year),
      awards: awardsByYear[year] ?? [],
    };
  }).sort((a, b) => b.year - a.year);
}

export function getTournament(year) {
  return getTournaments().find((tournament) => tournament.year === Number(year));
}

export function getFormatName(format) { return FORMAT_NAMES[format] ?? format; }
export function formatRecord(record) { return `${record.wins}-${record.losses}-${record.halves}`; }
export function formatPercentage(value) { return `${value.toFixed(1)}%`; }
export { historicalData, ELO_START, ELO_K };
