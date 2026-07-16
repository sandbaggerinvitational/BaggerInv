import historicalData from "./historical-data.json";

const FORMAT_NAMES = {
  BB: "2v2 Best Ball",
  SC: "Scramble",
  SI: "Singles",
};

const ELO_START = 1500;
const ELO_K = 24;

function clean(value) {
  return String(value ?? "").trim();
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyRecord() {
  return { wins: 0, losses: 0, halves: 0, matches: 0, points: 0 };
}

function addOutcome(record, outcome, points) {
  record.matches += 1;
  if (points !== null) record.points += points;
  if (outcome === "win") record.wins += 1;
  if (outcome === "loss") record.losses += 1;
  if (outcome === "half") record.halves += 1;
}

function recordPercentage(record) {
  if (!record.matches) return 0;
  return ((record.wins + record.halves * 0.5) / record.matches) * 100;
}

function teamRow(year, side) {
  return historicalData.teamNames.find(
    (row) =>
      Number(row.Year) === Number(year) &&
      clean(row["Team Side"]) === side
  );
}

function teamName(year, side) {
  return teamRow(year, side)?.["Team Names"] || side;
}

function teamLogo(year, side) {
  return teamRow(year, side)?.["Team Logo"] || "";
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

function scoreForTeamOne(match) {
  const winner = clean(match["Matchup Winner"]).toLowerCase();
  if (["halved", "half", "tie"].includes(winner)) return 0.5;
  return winner === "team 1" ? 1 : 0;
}

function pointsForSide(match, side) {
  return validNumber(
    match[side === 1 ? "Team 1 Points" : "Team 2 Points"]
  );
}

function handicapRows(playerId) {
  return historicalData.handicaps
    .filter((row) => row["Player ID"] === playerId)
    .sort((a, b) => Number(b.Year) - Number(a.Year));
}

function winningSideForYear(year) {
  const tournament = historicalData.tournaments.find(
    (row) => Number(row.Year) === Number(year)
  );
  if (!tournament?.["Winning Team"]) return null;

  for (const side of ["Team 1", "Team 2"]) {
    if (clean(teamName(year, side)) === clean(tournament["Winning Team"])) {
      return side;
    }
  }

  return null;
}

function chronologicalMatches() {
  return [...historicalData.matches]
    .filter((match) => match.Year && match["Matchup Winner"])
    .sort(
      (a, b) =>
        Number(a.Year) - Number(b.Year) ||
        Number(a.Round) - Number(b.Round) ||
        Number(a.Match) - Number(b.Match)
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

    const year = Number(match.Year);
    const format = clean(match.Format);
    const outcome = outcomeForSide(match, side);
    const points = pointsForSide(match, side);

    addOutcome(records.overall, outcome, points);
    if (records[format]) addOutcome(records[format], outcome, points);

    if (!seasons.has(year)) {
      seasons.set(year, {
        year,
        teamSide: `Team ${side}`,
        teamName: teamName(year, `Team ${side}`),
        teamLogo: teamLogo(year, `Team ${side}`),
        handicap: null,
        overall: emptyRecord(),
        BB: emptyRecord(),
        SC: emptyRecord(),
        SI: emptyRecord(),
      });
    }

    const season = seasons.get(year);
    addOutcome(season.overall, outcome, points);
    if (season[format]) addOutcome(season[format], outcome, points);

    const teammate = playersForSide(match, side).find(
      (id) => id !== playerId
    );

    if (teammate) {
      if (!partners.has(teammate)) partners.set(teammate, emptyRecord());
      addOutcome(partners.get(teammate), outcome, points);
    }

    for (const opponentId of playersForSide(match, side === 1 ? 2 : 1)) {
      if (!opponents.has(opponentId)) {
        opponents.set(opponentId, emptyRecord());
      }
      addOutcome(opponents.get(opponentId), outcome, points);
    }
  }

  const handicaps = handicapRows(playerId);
  for (const row of handicaps) {
    const year = Number(row.Year);
    const side = clean(row["Team Side"]);

    if (!seasons.has(year)) {
      seasons.set(year, {
        year,
        teamSide: side,
        teamName: teamName(year, side),
        teamLogo: teamLogo(year, side),
        handicap: validNumber(row["Tournament Handicap"]),
        overall: emptyRecord(),
        BB: emptyRecord(),
        SC: emptyRecord(),
        SI: emptyRecord(),
      });
    } else {
      seasons.get(year).handicap = validNumber(row["Tournament Handicap"]);
      seasons.get(year).teamSide = side;
      seasons.get(year).teamName = teamName(year, side);
      seasons.get(year).teamLogo = teamLogo(year, side);
    }
  }

  const appearances = handicaps.map((row) => Number(row.Year));
  const championshipYears = appearances
    .filter(
      (year) =>
        clean(handicaps.find((row) => Number(row.Year) === year)?.["Team Side"]) ===
        clean(winningSideForYear(year))
    )
    .sort((a, b) => a - b);

  const sandbaggerOfYearYears = historicalData.awards
    .filter(
      (award) =>
        clean(award.Award).toLowerCase() === "sandbagger of the year" &&
        clean(award.Winner) === clean(playerId)
    )
    .map((award) => Number(award.Year))
    .sort((a, b) => a - b);

  const handicapValues = handicaps
    .map((row) => validNumber(row["Tournament Handicap"]))
    .filter((value) => value !== null);

  const averageHandicap = handicapValues.length
    ? handicapValues.reduce((sum, value) => sum + value, 0) /
      handicapValues.length
    : null;

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
        b.record.matches - a.record.matches ||
        b.percentage - a.percentage ||
        b.record.points - a.record.points
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
        b.percentage - a.percentage
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
    championships: championshipYears,
    sandbaggerOfYearYears,
    averageHandicap,
    handicapHistory: handicaps.map((row) => ({
      year: Number(row.Year),
      teamSide: row["Team Side"],
      teamName: teamName(row.Year, row["Team Side"]),
      handicap: validNumber(row["Tournament Handicap"]),
    })),
    seasons: [...seasons.values()].sort((a, b) => b.year - a.year),
    partners: partnerRows,
    opponents: opponentRows,
    biggestRival: opponentRows[0] ?? null,
  };
}

export function getAllPlayerStats() {
  return getPlayers().map((player) => ({
    player,
    stats: getPlayerStats(player["Player ID"]),
  }));
}

export function getHeadToHead(playerOneId, playerTwoId) {
  const overall = emptyRecord();
  const byFormat = {
    BB: emptyRecord(),
    SC: emptyRecord(),
    SI: emptyRecord(),
  };
  const meetings = [];

  for (const match of chronologicalMatches()) {
    const sideOne = playerSide(match, playerOneId);
    const sideTwo = playerSide(match, playerTwoId);

    if (!sideOne || !sideTwo || sideOne === sideTwo) continue;

    const outcome = outcomeForSide(match, sideOne);
    const points = pointsForSide(match, sideOne);

    addOutcome(overall, outcome, points);
    if (byFormat[match.Format]) {
      addOutcome(byFormat[match.Format], outcome, points);
    }

    meetings.push({
      matchId: match["Match ID"],
      year: Number(match.Year),
      round: Number(match.Round),
      format: match.Format,
      outcome,
      pointsOne: pointsForSide(match, sideOne),
      pointsTwo: pointsForSide(match, sideTwo),
    });
  }

  return { overall, byFormat, meetings: meetings.reverse() };
}

export function getEloRatings() {
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

    // Ghost matches cannot update Elo because one side has no known player.
    if (!teamOne.length || !teamTwo.length) continue;

    const averageRating = (ids) =>
      ids.reduce((sum, id) => sum + ratings.get(id).rating, 0) / ids.length;

    const ratingOne = averageRating(teamOne);
    const ratingTwo = averageRating(teamTwo);
    const expectedOne =
      1 / (1 + Math.pow(10, (ratingTwo - ratingOne) / 400));
    const actualOne = scoreForTeamOne(match);
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
    .filter((row) => row.matches > 0)
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
  const eligible = (row) => row.stats.appearances.length >= 5;

  return {
    points: [...all].sort(
      (a, b) =>
        b.stats.records.overall.points - a.stats.records.overall.points
    ),
    wins: [...all].sort(
      (a, b) =>
        b.stats.records.overall.wins - a.stats.records.overall.wins
    ),
    championships: [...all].sort(
      (a, b) =>
        b.stats.championships.length - a.stats.championships.length
    ),
    appearances: [...all].sort(
      (a, b) =>
        b.stats.appearances.length - a.stats.appearances.length
    ),
    percentage: [...all]
      .filter(eligible)
      .sort(
        (a, b) =>
          b.stats.percentages.overall - a.stats.percentages.overall
      ),
    byFormat: Object.fromEntries(
      ["BB", "SC", "SI"].map((format) => [
        format,
        [...all]
          .filter(eligible)
          .sort(
            (a, b) =>
              b.stats.percentages[format] - a.stats.percentages[format]
          ),
      ])
    ),
  };
}

export function getTeamSeason(year, side) {
  const team = teamRow(year, side);
  if (!team) return null;

  const playerMap = getPlayerMap();
  const roster = historicalData.handicaps
    .filter(
      (row) =>
        Number(row.Year) === Number(year) &&
        clean(row["Team Side"]) === clean(side)
    )
    .map((row) => ({
      player: playerMap[row["Player ID"]],
      handicap: validNumber(row["Tournament Handicap"]),
    }))
    .filter((row) => row.player)
    .sort((a, b) => a.handicap - b.handicap);

  const averageHandicap = roster.length
    ? roster.reduce((sum, row) => sum + numberOrZero(row.handicap), 0) /
      roster.length
    : null;

  const captain = playerMap[team.Captain];

  return {
    year: Number(year),
    side,
    id: team["Team ID"],
    name: team["Team Names"],
    logo: team["Team Logo"],
    captain,
    roster,
    averageHandicap,
  };
}

export function getTournaments() {
  const playerMap = getPlayerMap();

  return [...historicalData.tournaments]
    .filter((row) => row.Year)
    .map((tournament) => {
      const year = Number(tournament.Year);
      const teams = ["Team 1", "Team 2"]
        .map((side) => getTeamSeason(year, side))
        .filter(Boolean);

      return {
        ...tournament,
        year,
        teams,
        courses: historicalData.courses
          .filter((course) => Number(course.Year) === year)
          .sort(
            (a, b) =>
              Number(clean(a.Round).replace(/\D/g, "")) -
              Number(clean(b.Round).replace(/\D/g, ""))
          ),
        awards: historicalData.awards
          .filter((award) => Number(award.Year) === year)
          .map((award) => ({
            ...award,
            winnerPlayer: playerMap[award.Winner],
          })),
      };
    })
    .sort((a, b) => b.year - a.year);
}

export function getTournament(year) {
  return getTournaments().find(
    (tournament) => tournament.year === Number(year)
  );
}

export function getCourses() {
  const unique = new Map();

  for (const course of historicalData.courses) {
    if (!unique.has(course["Course ID"])) {
      unique.set(course["Course ID"], course);
    }
  }

  return [...unique.values()].sort((a, b) =>
    clean(a.Course).localeCompare(clean(b.Course))
  );
}

export function getCourse(courseId) {
  const base = historicalData.courses.find(
    (course) => clean(course["Course ID"]) === clean(courseId)
  );
  if (!base) return null;

  return {
    ...base,
    appearances: historicalData.courses
      .filter((course) => clean(course.Course) === clean(base.Course))
      .sort((a, b) => Number(b.Year) - Number(a.Year)),
  };
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

export function formatHandicap(value) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(1);
}

export { historicalData, ELO_START, ELO_K };
