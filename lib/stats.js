import fallbackHistoricalData from "./historical-data.json";
import { loadHistoricalData } from "./google-sheets-data";

let historicalData = fallbackHistoricalData;

export async function refreshHistoricalData() {
  try {
    historicalData = await loadHistoricalData();
  } catch (error) {
    console.error("Unable to refresh historical Google Sheet data. Using the bundled fallback.", error);
    historicalData = fallbackHistoricalData;
  }

  return historicalData;
}

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

function booleanValue(value) {
  if (typeof value === "boolean") return value;

  const normalized = clean(value).toLowerCase();
  return ["true", "yes", "y", "1", "active"].includes(normalized);
}

function normalizedPlayerSlug(player) {
  return clean(player.slug || player.Slug)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePlayer(player) {
  return {
    ...player,
    slug: normalizedPlayerSlug(player),
    active: booleanValue(player.active ?? player.Active),
    boardOfGovernors: booleanValue(
      player.boardOfGovernors ?? player["Board of Governors"] ?? player.BOG
    ),
    rookie: booleanValue(player.rookie ?? player.Rookie),
  };
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

function teamPointsForSide(match, side) {
  return validNumber(
    match[side === 1 ? "Team 1 Points" : "Team 2 Points"]
  );
}

function individualPointsForSide(match, side) {
  const teamPoints = teamPointsForSide(match, side);
  if (teamPoints === null) return null;

  const format = clean(match.Format);

  // Singles points belong entirely to the individual player.
  if (format === "SI") return teamPoints;

  // Best Ball and Scramble totals are team totals shared by two players.
  if (format === "BB" || format === "SC") return teamPoints / 2;

  // Preserve future compatibility if another one-player format is added.
  const playerCount = playersForSide(match, side).length;
  return playerCount > 1 ? teamPoints / playerCount : teamPoints;
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
    historicalData.players.map((player) => {
      const normalized = normalizePlayer(player);
      return [normalized["Player ID"], normalized];
    })
  );
}

export function getPlayers() {
  return historicalData.players
    .map(normalizePlayer)
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return clean(a["Display Name"]).localeCompare(
        clean(b["Display Name"])
      );
    });
}

export function getPlayerBySlug(slug) {
  const requestedSlug = clean(slug).toLowerCase();

  const player = historicalData.players.find(
    (row) => normalizedPlayerSlug(row) === requestedSlug
  );

  return player ? normalizePlayer(player) : null;
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
    const points = individualPointsForSide(match, side);

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

  const individualPointsLeaderYears = historicalData.tournaments
    .map((row) => Number(row.Year))
    .filter(Number.isFinite)
    .filter((year) => {
      const leaderboard = getTournamentPlayerLeaderboard(year);
      if (!leaderboard.length || !leaderboard[0].pointsTracked) return false;
      const leadingPoints = leaderboard[0].points;
      return leaderboard.some((row) => row.id === playerId && row.points === leadingPoints);
    })
    .sort((a, b) => a - b);

  const handicapValues = handicaps
    .map((row) => validNumber(row["Tournament Handicap"]))
    .filter((value) => value !== null);

  const averageHandicap = handicapValues.length
    ? handicapValues.reduce((sum, value) => sum + value, 0) /
      handicapValues.length
    : null;

  const playerMap = getPlayerMap();

  const tournamentYears = historicalData.tournaments
    .map((row) => Number(row.Year))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const firstCareerYear = appearances.length
    ? Math.min(...appearances)
    : tournamentYears[0];

  const lastCareerYear = tournamentYears.length
    ? tournamentYears[tournamentYears.length - 1]
    : firstCareerYear;

  const careerTimeline = [];
  if (Number.isFinite(firstCareerYear) && Number.isFinite(lastCareerYear)) {
    for (let year = firstCareerYear; year <= lastCareerYear; year += 1) {
      const season = seasons.get(year);
      const tournament = historicalData.tournaments.find(
        (row) => Number(row.Year) === year
      );

      if (!season) {
        careerTimeline.push({
          year,
          attended: false,
          teamSide: "",
          teamName: "",
          result: "Did Not Attend",
        });
        continue;
      }

      const winningTeam = clean(tournament?.["Winning Team"]);
      const runnerUpTeam = clean(tournament?.["Runner-Up Team"]);
      const finalScore = clean(tournament?.["Final Score"]);
      const seasonTeam = clean(season.teamName);

      let result = "Upcoming";
      if (winningTeam || runnerUpTeam || finalScore) {
        if (winningTeam === seasonTeam) {
          result = "Champion";
        } else if (runnerUpTeam === seasonTeam) {
          result = "Runner-Up";
        } else {
          result = "Completed";
        }
      }

      careerTimeline.push({
        year,
        attended: true,
        teamSide: season.teamSide,
        teamName: season.teamName,
        result,
      });
    }
  }

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
    individualPointsLeaderYears,
    averageHandicap,
    handicapHistory: handicaps.map((row) => ({
      year: Number(row.Year),
      teamSide: row["Team Side"],
      teamName: teamName(row.Year, row["Team Side"]),
      handicap: validNumber(row["Tournament Handicap"]),
    })),
    seasons: [...seasons.values()].sort((a, b) => b.year - a.year),
    careerTimeline,
    partners: partnerRows,
    opponents: opponentRows,
    biggestRival: opponentRows[0] ?? null,
  };
}


export function getCaptainLegacy(playerId) {
  const seasons = historicalData.teamNames
    .filter((team) => clean(team.Captain) === clean(playerId))
    .map((team) => {
      const year = Number(team.Year);
      const tournament = historicalData.tournaments.find(
        (row) => Number(row.Year) === year
      );

      const teamNameValue = clean(team["Team Names"]);
      const winningTeam = clean(tournament?.["Winning Team"]);
      const runnerUpTeam = clean(tournament?.["Runner-Up Team"]);
      const finalScore = clean(tournament?.["Final Score"]);

      let result = "Upcoming";
      if (winningTeam) {
        result =
          winningTeam === teamNameValue
            ? "Champion"
            : runnerUpTeam === teamNameValue
              ? "Runner-Up"
              : "Completed";
      } else if (finalScore) {
        result = "Completed";
      }

      return {
        year,
        teamSide: clean(team["Team Side"]),
        teamName: teamNameValue,
        teamLogo: clean(team["Team Logo"]),
        result,
      };
    })
    .sort((a, b) => a.year - b.year);

  const completed = seasons.filter((season) =>
    ["Champion", "Runner-Up", "Completed"].includes(season.result)
  );

  const wins = completed.filter(
    (season) => season.result === "Champion"
  ).length;

  return {
    seasons,
    record: {
      wins,
      losses: completed.length - wins,
      halves: 0,
      matches: completed.length,
      points: 0,
    },
    championships: wins,
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
    const points = individualPointsForSide(match, sideOne);

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
      pointsOne: individualPointsForSide(match, sideOne),
      pointsTwo: individualPointsForSide(match, sideTwo),
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

  const pointsPerMatch = (stats) =>
    stats.records.overall.matches
      ? stats.records.overall.points / stats.records.overall.matches
      : 0;

  const pointsPerAppearance = (stats) =>
    stats.appearances.length
      ? stats.records.overall.points / stats.appearances.length
      : 0;

  return {
    all,
    points: [...all].sort(
      (a, b) =>
        b.stats.records.overall.points - a.stats.records.overall.points
    ),
    wins: [...all].sort(
      (a, b) =>
        b.stats.records.overall.wins - a.stats.records.overall.wins
    ),
    losses: [...all].sort(
      (a, b) =>
        b.stats.records.overall.losses - a.stats.records.overall.losses
    ),
    halves: [...all].sort(
      (a, b) =>
        b.stats.records.overall.halves - a.stats.records.overall.halves
    ),
    matches: [...all].sort(
      (a, b) =>
        b.stats.records.overall.matches - a.stats.records.overall.matches
    ),
    championships: [...all].sort(
      (a, b) =>
        b.stats.championships.length - a.stats.championships.length
    ),
    soy: [...all].sort(
      (a, b) =>
        b.stats.sandbaggerOfYearYears.length -
        a.stats.sandbaggerOfYearYears.length
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
    pointsPerMatch: [...all]
      .filter(eligible)
      .filter((row) => row.stats.records.overall.matches > 0)
      .sort(
        (a, b) =>
          pointsPerMatch(b.stats) - pointsPerMatch(a.stats)
      ),
    pointsPerAppearance: [...all]
      .filter(eligible)
      .sort(
        (a, b) =>
          pointsPerAppearance(b.stats) -
          pointsPerAppearance(a.stats)
      ),
    averageHandicap: [...all]
      .filter((row) => row.stats.averageHandicap !== null)
      .sort(
        (a, b) =>
          a.stats.averageHandicap - b.stats.averageHandicap
      ),
    byFormat: Object.fromEntries(
      ["BB", "SC", "SI"].map((format) => [
        format,
        [...all]
          .filter(eligible)
          .sort(
            (a, b) =>
              b.stats.percentages[format] - a.stats.percentages[format] ||
              b.stats.records[format].wins -
                a.stats.records[format].wins
          ),
      ])
    ),
  };
}


export function getPartnershipStats() {
  const playerMap = getPlayerMap();
  const partnerships = new Map();

  for (const match of chronologicalMatches()) {
    for (const side of [1, 2]) {
      const players = playersForSide(match, side);
      if (players.length !== 2) continue;

      const [firstId, secondId] = [...players].sort();
      const key = `${firstId}|${secondId}`;
      const outcome = outcomeForSide(match, side);
      const points = individualPointsForSide(match, side);

      if (!partnerships.has(key)) {
        partnerships.set(key, {
          key,
          playerOne: playerMap[firstId],
          playerTwo: playerMap[secondId],
          record: emptyRecord(),
          byFormat: {
            BB: emptyRecord(),
            SC: emptyRecord(),
            SI: emptyRecord(),
          },
        });
      }

      const partnership = partnerships.get(key);
      addOutcome(partnership.record, outcome, points);
      if (partnership.byFormat[match.Format]) {
        addOutcome(partnership.byFormat[match.Format], outcome, points);
      }
    }
  }

  const rows = [...partnerships.values()]
    .filter((row) => row.playerOne && row.playerTwo)
    .map((row) => ({
      ...row,
      percentage: recordPercentage(row.record),
    }));

  return {
    byPoints: [...rows].sort(
      (a, b) =>
        b.record.points - a.record.points ||
        b.percentage - a.percentage ||
        b.record.matches - a.record.matches
    ),
    byPercentage: [...rows]
      .filter((row) => row.record.matches >= 4)
      .sort(
        (a, b) =>
          b.percentage - a.percentage ||
          b.record.matches - a.record.matches ||
          b.record.points - a.record.points
      ),
    byMatches: [...rows].sort(
      (a, b) =>
        b.record.matches - a.record.matches ||
        b.percentage - a.percentage
    ),
  };
}

export function getRivalryStats() {
  const playerMap = getPlayerMap();
  const rivalries = new Map();

  for (const match of chronologicalMatches()) {
    const teamOne = playersForSide(match, 1);
    const teamTwo = playersForSide(match, 2);

    for (const oneId of teamOne) {
      for (const twoId of teamTwo) {
        if (!oneId || !twoId) continue;

        const [firstId, secondId] = [oneId, twoId].sort();
        const key = `${firstId}|${secondId}`;

        if (!rivalries.has(key)) {
          rivalries.set(key, {
            key,
            playerOne: playerMap[firstId],
            playerTwo: playerMap[secondId],
            playerOneWins: 0,
            playerTwoWins: 0,
            halves: 0,
            meetings: 0,
          });
        }

        const row = rivalries.get(key);
        const winner = clean(match["Matchup Winner"]).toLowerCase();
        row.meetings += 1;

        if (["halved", "half", "tie"].includes(winner)) {
          row.halves += 1;
        } else {
          const winningIds =
            winner === "team 1" ? teamOne : teamTwo;

          if (winningIds.includes(firstId)) row.playerOneWins += 1;
          if (winningIds.includes(secondId)) row.playerTwoWins += 1;
        }
      }
    }
  }

  const rows = [...rivalries.values()]
    .filter((row) => row.playerOne && row.playerTwo)
    .map((row) => ({
      ...row,
      margin: Math.abs(row.playerOneWins - row.playerTwoWins),
      totalDecisions: row.playerOneWins + row.playerTwoWins,
    }));

  return {
    mostPlayed: [...rows].sort(
      (a, b) =>
        b.meetings - a.meetings ||
        a.margin - b.margin ||
        b.halves - a.halves
    ),
    closest: [...rows]
      .filter((row) => row.meetings >= 4)
      .sort(
        (a, b) =>
          a.margin - b.margin ||
          b.meetings - a.meetings ||
          b.halves - a.halves
      ),
    mostHalves: [...rows].sort(
      (a, b) =>
        b.halves - a.halves ||
        b.meetings - a.meetings ||
        a.margin - b.margin
    ),
  };
}

export function getHandicapStats() {
  const playerMap = getPlayerMap();

  const tournamentRows = historicalData.handicaps
    .map((row) => ({
      player: playerMap[row["Player ID"]],
      year: Number(row.Year),
      handicap: validNumber(row["Tournament Handicap"]),
      teamSide: row["Team Side"],
      teamName: teamName(row.Year, row["Team Side"]),
    }))
    .filter((row) => row.player && row.handicap !== null);

  const playerHistories = new Map();

  for (const row of tournamentRows) {
    const id = row.player["Player ID"];
    if (!playerHistories.has(id)) playerHistories.set(id, []);
    playerHistories.get(id).push(row);
  }

  const improvementRows = [...playerHistories.values()]
    .map((history) => {
      const ordered = [...history].sort((a, b) => a.year - b.year);
      const first = ordered[0];
      const latest = ordered.at(-1);

      return {
        player: first.player,
        firstYear: first.year,
        firstHandicap: first.handicap,
        latestYear: latest.year,
        latestHandicap: latest.handicap,
        improvement: first.handicap - latest.handicap,
        appearances: ordered.length,
      };
    })
    .filter((row) => row.appearances >= 2);

  return {
    lowestTournament: [...tournamentRows].sort(
      (a, b) =>
        a.handicap - b.handicap ||
        b.year - a.year
    ),
    highestTournament: [...tournamentRows].sort(
      (a, b) =>
        b.handicap - a.handicap ||
        b.year - a.year
    ),
    mostImproved: [...improvementRows].sort(
      (a, b) =>
        b.improvement - a.improvement ||
        b.appearances - a.appearances
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


function normalizedWinner(value) {
  const winner = clean(value).toLowerCase().replace(/\s+/g, " ");
  if (["halved", "half", "tie", "tied"].includes(winner)) return "Halved";
  if (winner === "team1" || winner === "team 1") return "Team 1";
  if (winner === "team2" || winner === "team 2") return "Team 2";
  return clean(value) || null;
}

function displayWinner(value, firstTeam, secondTeam) {
  const winner = normalizedWinner(value);
  if (winner === "Team 1") return firstTeam;
  if (winner === "Team 2") return secondTeam;
  if (winner === "Halved") return "Halved";
  return winner || "Not recorded";
}

function playerNamesForSide(match, side, playerMap) {
  return playersForSide(match, side)
    .map((id) => playerMap[id])
    .filter(Boolean)
    .map((player) => ({
      id: player["Player ID"],
      name: player["Display Name"],
      slug: normalizedPlayerSlug(player),
    }));
}

export function getHistoricalRound(yearValue, roundValue) {
  const year = Number(yearValue);
  const round = Number(roundValue);
  const tournament = getTournament(year);
  if (!tournament) return null;

  const course = historicalData.courses.find(
    (row) =>
      Number(row.Year) === year &&
      Number(clean(row.Round).replace(/\D/g, "")) === round
  );

  if (!course) return null;

  const playerMap = getPlayerMap();
  const firstTeam = teamName(year, "Team 1");
  const secondTeam = teamName(year, "Team 2");

  const matches = historicalData.matches
    .filter(
      (match) =>
        Number(match.Year) === year &&
        Number(match.Round) === round
    )
    .sort((a, b) => Number(a.Match) - Number(b.Match))
    .map((match) => {
      const teamOnePoints = validNumber(match["Team 1 Points"]);
      const teamTwoPoints = validNumber(match["Team 2 Points"]);

      return {
        id: match["Match ID"],
        matchNumber: Number(match.Match),
        format: clean(match.Format),
        status: clean(match["Match Status"]) || "Complete",
        notes: clean(match.Notes),
        teamOne: {
          name: firstTeam,
          players: playerNamesForSide(match, 1, playerMap),
          playerHandicaps: [
            validNumber(match["Team 1 Player 1 Playing HCP"]),
            validNumber(match["Team 1 Player 2 Playing HCP"]),
          ],
          playerStrokes: [
            validNumber(match["Team 1 Player 1 Stroke"]),
            validNumber(match["Team 1 Player 2 Stroke"]),
          ],
          teamHandicap: validNumber(match["Team 1 Playing HCP"]),
          teamStrokes: validNumber(match["Team 1 Stroke"]),
          points: teamOnePoints,
        },
        teamTwo: {
          name: secondTeam,
          players: playerNamesForSide(match, 2, playerMap),
          playerHandicaps: [
            validNumber(match["Team 2 Player 1 Playing HCP"]),
            validNumber(match["Team 2 Player 2 Playing HCP"]),
          ],
          playerStrokes: [
            validNumber(match["Team 2 Player 1 Stroke"]),
            validNumber(match["Team 2 Player 2 Stroke"]),
          ],
          teamHandicap: validNumber(match["Team 2 Playing HCP"]),
          teamStrokes: validNumber(match["Team 2 Stroke"]),
          points: teamTwoPoints,
        },
        segments: [
          {
            label: "Front 9",
            winner: displayWinner(
              match["Front 9 Winner"],
              firstTeam,
              secondTeam
            ),
          },
          {
            label: "Back 9",
            winner: displayWinner(
              match["Back 9 Winner"],
              firstTeam,
              secondTeam
            ),
          },
          {
            label: "18-Hole",
            winner: displayWinner(
              match["18-Hole Winner"],
              firstTeam,
              secondTeam
            ),
          },
        ],
        winner: displayWinner(
          match["Matchup Winner"],
          firstTeam,
          secondTeam
        ),
      };
    });

  const recordedMatches = matches.filter(
    (match) =>
      match.teamOne.points !== null &&
      match.teamTwo.points !== null
  );

  const roundPoints = recordedMatches.length
    ? {
        teamOne: recordedMatches.reduce(
          (sum, match) => sum + match.teamOne.points,
          0
        ),
        teamTwo: recordedMatches.reduce(
          (sum, match) => sum + match.teamTwo.points,
          0
        ),
      }
    : null;

  let roundWinner = "Not recorded";
  if (roundPoints) {
    if (roundPoints.teamOne > roundPoints.teamTwo) roundWinner = firstTeam;
    else if (roundPoints.teamTwo > roundPoints.teamOne) roundWinner = secondTeam;
    else roundWinner = "Halved";
  }

  return {
    year,
    round,
    tournament,
    course,
    format: clean(course.Format),
    teamOne: {
      name: firstTeam,
      logo: teamLogo(year, "Team 1"),
      points: roundPoints?.teamOne ?? null,
    },
    teamTwo: {
      name: secondTeam,
      logo: teamLogo(year, "Team 2"),
      points: roundPoints?.teamTwo ?? null,
    },
    roundWinner,
    matches,
    previousRound: round > 1 ? round - 1 : null,
    nextRound:
      tournament.courses.some(
        (row) =>
          Number(clean(row.Round).replace(/\D/g, "")) === round + 1
      )
        ? round + 1
        : null,
  };
}


export function getTournamentRoundPoints(yearValue) {
  const year = Number(yearValue);
  const tournament = getTournament(year);
  if (!tournament) return [];

  return tournament.courses
    .map((course) => {
      const round = Number(clean(course.Round).replace(/\D/g, ""));
      const matches = historicalData.matches.filter(
        (match) =>
          Number(match.Year) === year &&
          Number(match.Round) === round
      );

      const pointRows = matches
        .map((match) => {
          const teamOne = validNumber(match["Team 1 Points"]);
          const teamTwo = validNumber(match["Team 2 Points"]);

          return teamOne === null || teamTwo === null
            ? null
            : teamOne + teamTwo;
        })
        .filter((value) => value !== null);

      const pointsAvailable =
        pointRows.length === matches.length && pointRows.length
          ? pointRows.reduce((sum, value) => sum + value, 0)
          : null;

      return {
        round,
        roundLabel: course.Round,
        course: course.Course,
        format: clean(course.Format),
        pointsAvailable,
      };
    })
    .sort((a, b) => a.round - b.round);
}

export function getAdjacentTournamentYears(yearValue) {
  const year = Number(yearValue);
  const years = historicalData.tournaments
    .map((row) => Number(row.Year))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const index = years.indexOf(year);

  return {
    previousYear: index > 0 ? years[index - 1] : null,
    nextYear:
      index >= 0 && index < years.length - 1
        ? years[index + 1]
        : null,
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

export function getTournamentPlayerLeaderboard(yearValue) {
  const year = Number(yearValue);
  const playerMap = getPlayerMap();
  const standings = new Map();
  const pointsTracked = historicalData.matches.some(
    (match) => Number(match.Year) === year && [1, 2].some((side) => teamPointsForSide(match, side) !== null)
  );

  for (const match of historicalData.matches.filter((row) => Number(row.Year) === year)) {
    const winner = clean(match["Matchup Winner"]);
    const hasPoints = [1, 2].some((side) => teamPointsForSide(match, side) !== null);
    if (!winner && !hasPoints) continue;

    for (const side of [1, 2]) {
      for (const playerId of playersForSide(match, side)) {
        if (!standings.has(playerId)) {
          standings.set(playerId, {
            id: playerId,
            player: playerMap[playerId],
            teamSide: side,
            teamName: teamName(year, `Team ${side}`),
            wins: 0,
            losses: 0,
            halves: 0,
            points: 0,
            pointsTracked,
          });
        }

        const row = standings.get(playerId);
        const points = individualPointsForSide(match, side);
        if (points !== null) row.points += points;
        if (winner) {
          const outcome = outcomeForSide(match, side);
          if (outcome === "win") row.wins += 1;
          if (outcome === "loss") row.losses += 1;
          if (outcome === "half") row.halves += 1;
        }
      }
    }
  }

  return [...standings.values()].map((row) => ({
    ...row,
    winPercentage: row.wins + row.losses + row.halves
      ? (row.wins + row.halves * .5) / (row.wins + row.losses + row.halves) * 100
      : 0,
  })).sort((a, b) => pointsTracked
    ? b.points - a.points || b.wins - a.wins || a.losses - b.losses || clean(a.player?.["Display Name"]).localeCompare(clean(b.player?.["Display Name"]))
    : b.winPercentage - a.winPercentage || b.wins - a.wins || a.losses - b.losses || b.halves - a.halves || clean(a.player?.["Display Name"]).localeCompare(clean(b.player?.["Display Name"]))
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
