import historicalData from "./historical-data.json";

const FORMAT_NAMES = {
  BB: "2v2 Best Ball",
  SC: "Scramble",
  SI: "Singles",
};

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

function mergeRecord(target, source) {
  target.wins += source.wins;
  target.losses += source.losses;
  target.halves += source.halves;
  target.matches += source.matches;
  target.points += source.points;
}

function recordPercentage(record) {
  if (!record.matches) return 0;

  return Number(
    (((record.wins + record.halves * 0.5) / record.matches) * 100).toFixed(1)
  );
}

function playerSide(match, playerId) {
  const teamOne = [
    match["Team 1 Player 1"],
    match["Team 1 Player 2"],
  ].filter(Boolean);

  const teamTwo = [
    match["Team 2 Player 1"],
    match["Team 2 Player 2"],
  ].filter(Boolean);

  if (teamOne.includes(playerId)) return 1;
  if (teamTwo.includes(playerId)) return 2;
  return null;
}

function outcomeForSide(match, side) {
  const winner = clean(match["Matchup Winner"]).toLowerCase();

  if (winner === "halved" || winner === "half" || winner === "tie") {
    return "half";
  }

  if (winner === `team ${side}`.toLowerCase()) {
    return "win";
  }

  return "loss";
}

function playerPoints(match, side) {
  return numeric(match[side === 1 ? "Team 1 Points" : "Team 2 Points"]);
}

function teammateForMatch(match, playerId, side) {
  const teammates =
    side === 1
      ? [match["Team 1 Player 1"], match["Team 1 Player 2"]]
      : [match["Team 2 Player 1"], match["Team 2 Player 2"]];

  return teammates.find((id) => id && id !== playerId) ?? null;
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
  const teamNames = historicalData.teamNames.find(
    (item) => Number(item.Year) === Number(year)
  );

  if (!teamNames) return "Team unavailable";

  const match = historicalData.matches.find(
    (item) => Number(item.Year) === Number(year) && playerSide(item, playerId)
  );

  if (!match) return "Team unavailable";

  const side = playerSide(match, playerId);
  return side === 1 ? teamNames["Team 1"] : teamNames["Team 2"];
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
    overall: emptyRecord(),
    BB: emptyRecord(),
    SC: emptyRecord(),
    SI: emptyRecord(),
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
        overall: emptyRecord(),
        BB: emptyRecord(),
        SC: emptyRecord(),
        SI: emptyRecord(),
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

    const opponentIds =
      side === 1
        ? [match["Team 2 Player 1"], match["Team 2 Player 2"]]
        : [match["Team 1 Player 1"], match["Team 1 Player 2"]];

    for (const opponentId of opponentIds.filter(Boolean)) {
      if (!opponents.has(opponentId)) opponents.set(opponentId, emptyRecord());
      addOutcome(opponents.get(opponentId), outcome, points);
    }
  }

  const appearances = [...seasons.keys()].sort((a, b) => a - b);
  const championships = appearances.filter((year) => {
    const winningSide = winningSideForYear(year);
    if (!winningSide) return false;

    return historicalData.matches.some(
      (match) =>
        Number(match.Year) === year &&
        playerSide(match, playerId) === winningSide
    );
  });

  const playerMap = getPlayerMap();

  const partnerRows = [...partners.entries()]
    .map(([id, record]) => ({
      player: playerMap[id],
      record,
      percentage: recordPercentage(record),
    }))
    .filter((row) => row.player)
    .sort(
      (a, b) =>
        b.record.points - a.record.points ||
        b.percentage - a.percentage ||
        b.record.matches - a.record.matches
    );

  const opponentRows = [...opponents.entries()]
    .map(([id, record]) => ({
      player: playerMap[id],
      record,
      percentage: recordPercentage(record),
    }))
    .filter((row) => row.player)
    .sort(
      (a, b) =>
        b.record.matches - a.record.matches ||
        b.record.points - a.record.points
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
    partners: partnerRows,
    opponents: opponentRows,
  };
}

export function getAllPlayerStats() {
  return getPlayers().map((player) => ({
    player,
    stats: getPlayerStats(player["Player ID"]),
  }));
}

export function getRecords() {
  const all = getAllPlayerStats();
  const minimumAppearances = 5;

  return {
    points: [...all].sort(
      (a, b) => b.stats.records.overall.points - a.stats.records.overall.points
    ),
    wins: [...all].sort(
      (a, b) => b.stats.records.overall.wins - a.stats.records.overall.wins
    ),
    championships: [...all].sort(
      (a, b) => b.stats.championships.length - a.stats.championships.length
    ),
    appearances: [...all].sort(
      (a, b) => b.stats.appearances.length - a.stats.appearances.length
    ),
    percentage: [...all]
      .filter((row) => row.stats.appearances.length >= minimumAppearances)
      .sort(
        (a, b) =>
          b.stats.percentages.overall - a.stats.percentages.overall ||
          b.stats.records.overall.matches - a.stats.records.overall.matches
      ),
    byFormat: Object.fromEntries(
      ["BB", "SC", "SI"].map((format) => [
        format,
        [...all]
          .filter((row) => row.stats.appearances.length >= minimumAppearances)
          .sort(
            (a, b) =>
              b.stats.percentages[format] - a.stats.percentages[format] ||
              b.stats.records[format].points - a.stats.records[format].points
          ),
      ])
    ),
  };
}

export function getTournaments() {
  const awardsByYear = Object.groupBy(
    historicalData.awards,
    (award) => Number(award.Year)
  );

  return [...historicalData.tournaments]
    .filter((tournament) => tournament.Year)
    .map((tournament) => {
      const year = Number(tournament.Year);
      return {
        ...tournament,
        year,
        teams: historicalData.teamNames.find(
          (row) => Number(row.Year) === year
        ),
        courses: historicalData.courses.filter(
          (course) => Number(course.Year) === year
        ),
        awards: awardsByYear[year] ?? [],
      };
    })
    .sort((a, b) => b.year - a.year);
}

export function getTournament(year) {
  return getTournaments().find(
    (tournament) => tournament.year === Number(year)
  );
}

export function getFormatName(format) {
  return FORMAT_NAMES[format] ?? format;
}

export function formatRecord(record) {
  return `${record.wins}-${record.losses}-${record.halves}`;
}

export function formatPercentage(value) {
  return `${value.toFixed(1)}%`;
}

export { historicalData };
