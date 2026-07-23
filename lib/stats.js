import fallbackHistoricalData from "./historical-data.json";
import { loadHistoricalData } from "./google-sheets-data";
import { formatHandicap, parseNumericValue } from "./formatters";
import {
  historicalCaptainReference,
  resolveHistoricalCaptain,
} from "./historical-captains";
import {
  isValidTournamentYear,
  recordBelongsToTournament,
  tournamentId,
  tournamentYear,
} from "./tournament-identifiers";

let historicalData = fallbackHistoricalData;

const HISTORICAL_COLLECTIONS = [
  "players",
  "tournaments",
  "teamNames",
  "matches",
  "rounds",
  "rules",
  "awards",
  "courses",
  "handicaps",
];

function normalizeHistoricalData(data) {
  const normalized = {};

  for (const key of HISTORICAL_COLLECTIONS) {
    if (Array.isArray(data?.[key])) {
      normalized[key] = data[key].filter((row) => row && typeof row === "object");
    } else {
      console.warn("Historical data collection was missing or invalid", {
        collection: key,
        receivedType: data?.[key] === null ? "null" : typeof data?.[key],
        fallbackRows: Array.isArray(fallbackHistoricalData[key])
          ? fallbackHistoricalData[key].length
          : 0,
      });
      normalized[key] = Array.isArray(fallbackHistoricalData[key])
        ? fallbackHistoricalData[key]
        : [];
    }
  }

  if (!normalized.tournaments.length) {
    throw new Error("The Tournaments sheet contains no usable tournament rows.");
  }

  normalized.tournaments = normalized.tournaments.map((row) => {
    const year = tournamentYear(row);
    if (!year || isValidTournamentYear(row.Year)) return row;
    console.warn("Recovered a tournament year from stable row metadata", {
      sheet: row?.__sheetName || "Tournaments",
      row: row?.__sheetRow || "unknown",
      field: "Year",
      recoveredYear: year,
    });
    return { ...row, Year: year };
  });

  return normalized;
}

export async function refreshHistoricalData() {
  try {
    historicalData = normalizeHistoricalData(await loadHistoricalData());
  } catch (error) {
    console.error("Unable to refresh historical Google Sheet data. Using the bundled fallback.", {
      name: error?.name,
      message: error?.message || String(error),
      stack: error?.stack,
    });
    historicalData = normalizeHistoricalData(fallbackHistoricalData);
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
    handicapCommittee: booleanValue(
      player.handicapCommittee ?? player["Handicap Committee"]
    ),
  };
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validNumber(value) {
  return parseNumericValue(value);
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
  const tournament = historicalData.tournaments.find(
    (row) => tournamentYear(row) === Number(year)
  );
  const selectedTournamentId = tournament ? tournamentId(tournament) : "";
  return historicalData.teamNames.find((row) => {
    const belongs = selectedTournamentId
      ? recordBelongsToTournament(row, selectedTournamentId, year)
      : Number(row.Year) === Number(year);
    return belongs && clean(row["Team Side"]) === clean(side);
  });
}

function teamName(year, side) {
  return teamRow(year, side)?.["Team Names"] || side;
}

function teamLogo(year, side) {
  return teamRow(year, side)?.["Team Logo"] || "";
}

function teamForReference(teams, reference) {
  const value = clean(reference).toLowerCase();
  if (!value) return null;

  return teams.find((team) =>
    [team.id, team.side, team.name]
      .map((candidate) => clean(candidate).toLowerCase())
      .includes(value)
  ) || null;
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

  const teams = ["Team 1", "Team 2"]
    .map((side) => {
      const row = teamRow(year, side);
      return row ? { id: row["Team ID"], side, name: row["Team Names"] } : null;
    })
    .filter(Boolean);

  return teamForReference(teams, tournament["Winning Team"])?.side || null;
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

export function getTournamentHandicap(playerId, yearValue) {
  const row = historicalData.handicaps.find(
    (handicap) =>
      clean(handicap["Player ID"]) === clean(playerId) &&
      Number(handicap.Year) === Number(yearValue)
  );

  return row ? validNumber(row["Tournament Handicap"]) : null;
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

  const pointsChampionYears = historicalData.tournaments
    .map((row) => Number(row.Year))
    .filter(Number.isFinite)
    .filter((year) => {
      const leaderboard = getTournamentPlayerLeaderboard(year);
      if (!leaderboard.length || !leaderboard[0].pointsTracked) return false;
      const leadingPoints = leaderboard[0].points;
      return leaderboard.some((row) => row.id === playerId && Math.abs(row.points - leadingPoints) < 1e-9);
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
    pointsChampionYears,
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
  const ratingMap = Object.fromEntries(
    getSandbaggerRatings().byCategory.OVERALL.map((row) => [row.player["Player ID"], row.allRatings])
  );
  return getPlayers().map((player) => ({
    player,
    stats: { ...getPlayerStats(player["Player ID"]), sandbaggerRatings: ratingMap[player["Player ID"]] || {} },
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

export const SBR_CATEGORIES = [
  { id: "OVERALL", label: "Overall", format: null },
  { id: "BB", label: "Best Ball", format: "BB" },
  { id: "SC", label: "Scramble", format: "SC" },
  { id: "SI", label: "Singles", format: "SI" },
];

export function getSandbaggerRatings() {
  const playerMap = getPlayerMap();
  const states = Object.fromEntries(SBR_CATEGORIES.map((category) => [category.id, new Map()]));
  const snapshots = Object.fromEntries(SBR_CATEGORIES.map((category) => [category.id, new Map()]));
  for (const category of SBR_CATEGORIES) for (const player of historicalData.players) states[category.id].set(player["Player ID"], { rating:ELO_START,peak:ELO_START,matches:0,lastChange:0,trend:[] });
  const matches=chronologicalMatches();
  let activeYear=null;
  const saveSnapshot=(year)=>{if(!year)return;for(const category of SBR_CATEGORIES){const values=new Map();for(const [id,row] of states[category.id]){values.set(id,{rating:row.rating,matches:row.matches});if(row.matches)row.trend.push({year,rating:Math.round(row.rating)});}snapshots[category.id].set(year,values);}};
  for(const match of matches){const year=Number(match.Year);if(activeYear!==null&&year!==activeYear)saveSnapshot(activeYear);activeYear=year;for(const category of SBR_CATEGORIES){if(category.format&&category.format!==clean(match.Format))continue;const ratings=states[category.id];const one=playersForSide(match,1).filter(id=>ratings.has(id)),two=playersForSide(match,2).filter(id=>ratings.has(id));if(!one.length||!two.length)continue;const avg=(ids)=>ids.reduce((sum,id)=>sum+ratings.get(id).rating,0)/ids.length;const expected=1/(1+Math.pow(10,(avg(two)-avg(one))/400));const roundWeight=Number(match.Round)===3?1.1:1;const delta=ELO_K*roundWeight*(scoreForTeamOne(match)-expected);for(const [ids,change] of [[one,delta],[two,-delta]])for(const id of ids){const row=ratings.get(id);row.rating+=change;row.matches++;row.lastChange=change;row.peak=Math.max(row.peak,row.rating);}}}saveSnapshot(activeYear);
  const byCategory={};
  for(const category of SBR_CATEGORIES){const rows=[...states[category.id]].filter(([,row])=>row.matches).map(([id,row])=>({player:playerMap[id],rating:Math.round(row.rating),peak:Math.round(row.peak),matches:row.matches,lastChange:Math.round(row.lastChange*10)/10,trend:row.trend})).filter(row=>row.player).sort((a,b)=>b.rating-a.rating||b.peak-a.peak||clean(a.player["Display Name"]).localeCompare(clean(b.player["Display Name"])));const years=[...snapshots[category.id].keys()].sort((a,b)=>a-b),previous=snapshots[category.id].get(years.at(-2));const previousRanks=new Map(previous?[...previous].filter(([,value])=>value.matches>0).sort((a,b)=>b[1].rating-a[1].rating).map(([id],index)=>[id,index+1]):[]);byCategory[category.id]=rows.map((row,index)=>({...row,rank:index+1,movement:previousRanks.has(row.player["Player ID"])?previousRanks.get(row.player["Player ID"])-(index+1):0}));}
  const allByPlayer={};for(const category of SBR_CATEGORIES)for(const row of byCategory[category.id]){if(!allByPlayer[row.player["Player ID"]])allByPlayer[row.player["Player ID"]]={};allByPlayer[row.player["Player ID"]][category.id]={rating:row.rating,matches:row.matches,peak:row.peak,lastChange:row.lastChange};}
  for(const category of SBR_CATEGORIES)byCategory[category.id]=byCategory[category.id].map(row=>({...row,allRatings:allByPlayer[row.player["Player ID"]]}));
  return {categories:SBR_CATEGORIES,byCategory};
}

export function getEloRatings() { return getSandbaggerRatings().byCategory.OVERALL; }

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

  const captainReference = historicalCaptainReference(team);
  const captainId = captainReference.id;
  const captainName = captainReference.name;
  const captain = resolveHistoricalCaptain(team, playerMap);

  return {
    year: Number(year),
    side,
    id: team["Team ID"],
    name: team["Team Names"],
    logo: team["Team Logo"],
    primaryColor: team["Primary Color"] || "",
    secondaryColor: team["Secondary Color"] || "",
    captainId,
    captainRecordedName: captainName,
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

  const availableRounds = tournament.courses
    .map((roundCourse) => {
      const roundNumber = Number(
        clean(roundCourse.Round).replace(/\D/g, "")
      );

      if (!Number.isFinite(roundNumber)) return null;

      const rawLabel = clean(
        roundCourse["Round Label"] || roundCourse.Round
      );

      return {
        id: clean(roundCourse["Round ID"] || roundCourse.Round),
        number: roundNumber,
        label: /round/i.test(rawLabel)
          ? rawLabel
          : `Round ${roundNumber}`,
      };
    })
    .filter(Boolean)
    .filter(
      (roundEntry, index, rounds) =>
        rounds.findIndex((candidate) => candidate.number === roundEntry.number) ===
        index
    )
    .sort((a, b) => a.number - b.number);

  const currentRoundIndex = availableRounds.findIndex(
    (roundEntry) => roundEntry.number === round
  );
  const previousRound =
    currentRoundIndex > 0 ? availableRounds[currentRoundIndex - 1] : null;
  const nextRound =
    currentRoundIndex >= 0 && currentRoundIndex < availableRounds.length - 1
      ? availableRounds[currentRoundIndex + 1]
      : null;

  const playerMap = getPlayerMap();
  const firstTeamSeason = getTeamSeason(year, "Team 1");
  const secondTeamSeason = getTeamSeason(year, "Team 2");
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
      const teamOnePlayers = playerNamesForSide(match, 1, playerMap).map((player, index) => ({
        ...player,
        playingHcp: validNumber(match[`Team 1 Player ${index + 1} Playing HCP`]),
        stroke: validNumber(match[`Team 1 Player ${index + 1} Stroke`]),
      }));
      const teamTwoPlayers = playerNamesForSide(match, 2, playerMap).map((player, index) => ({
        ...player,
        playingHcp: validNumber(match[`Team 2 Player ${index + 1} Playing HCP`]),
        stroke: validNumber(match[`Team 2 Player ${index + 1} Stroke`]),
      }));

      return {
        id: match["Match ID"],
        match: Number(match.Match),
        matchNumber: Number(match.Match),
        round,
        format: clean(match.Format),
        status: clean(match["Match Status"]) || "Complete",
        teeTime: clean(match["Tee Time"]),
        course: { id: clean(match["Course ID"] || course["Course ID"]), name: clean(course.Course), tee: clean(course["Tee Played"]) },
        notes: clean(match.Notes),
        team1Players: teamOnePlayers,
        team2Players: teamTwoPlayers,
        team1PlayingHcp: validNumber(match["Team 1 Playing HCP"]),
        team2PlayingHcp: validNumber(match["Team 2 Playing HCP"]),
        team1Stroke: validNumber(match["Team 1 Stroke"]),
        team2Stroke: validNumber(match["Team 2 Stroke"]),
        frontWinner: normalizedWinner(match["Front 9 Winner"]),
        backWinner: normalizedWinner(match["Back 9 Winner"]),
        overallWinner: normalizedWinner(match["18-Hole Winner"]),
        matchupWinner: normalizedWinner(match["Matchup Winner"]),
        team1Points: teamOnePoints,
        team2Points: teamTwoPoints,
        teamOne: {
          name: firstTeam,
          players: teamOnePlayers,
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
          players: teamTwoPlayers,
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
      id: firstTeamSeason?.id || "",
      name: firstTeam,
      logo: firstTeamSeason?.logo || teamLogo(year, "Team 1"),
      primaryColor: firstTeamSeason?.primaryColor || "",
      secondaryColor: firstTeamSeason?.secondaryColor || "",
      points: roundPoints?.teamOne ?? null,
    },
    teamTwo: {
      id: secondTeamSeason?.id || "",
      name: secondTeam,
      logo: secondTeamSeason?.logo || teamLogo(year, "Team 2"),
      primaryColor: secondTeamSeason?.primaryColor || "",
      secondaryColor: secondTeamSeason?.secondaryColor || "",
      points: roundPoints?.teamTwo ?? null,
    },
    roundWinner,
    matches,
    availableRounds,
    previousRound,
    nextRound,
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
    .map(tournamentYear)
    .filter(Boolean)
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
    .filter((row) => {
      const valid = Boolean(tournamentYear(row));
      if (!valid) {
        console.warn("Skipping tournament row without a valid year", {
          sheet: row?.__sheetName || "Tournaments",
          row: row?.__sheetRow || "unknown",
          field: "Year",
          value: row?.Year ?? null,
        });
      }
      return valid;
    })
    .flatMap((tournament) => {
      const year = tournamentYear(tournament);
      try {
        const teams = ["Team 1", "Team 2"]
          .map((side) => getTeamSeason(year, side))
          .filter(Boolean)
          .map((team) => {
            const sideNumber = clean(team.side).replace(/\D/g, "");
            const captainId = clean(
              team.captainId ||
              tournament[`Captain Team ${sideNumber}`]
            ) || null;

            return {
              ...team,
              captainId,
              captain: captainId
                ? playerMap[captainId] || team.captain || null
                : team.captain || null,
            };
          });
        const winningCaptainId = clean(tournament["Winning Captain"]);
        const championByReference = teamForReference(teams, tournament["Winning Team"]);
        const championByCaptain = winningCaptainId
          ? teams.find((team) => clean(team.captainId) === winningCaptainId)
          : null;
        const championTeam = championByReference || championByCaptain || null;
        const runnerUpByReference = teamForReference(teams, tournament["Runner-Up Team"]);
        const runnerUpTeam = runnerUpByReference || (
          championTeam && teams.length === 2
            ? teams.find((team) => team.id !== championTeam.id) || null
            : null
        );
        const courses = historicalData.courses
          .filter((course) => Number(course?.Year) === year)
          .sort((a, b) => {
            const roundA = Number(clean(a?.Round).replace(/\D/g, ""));
            const roundB = Number(clean(b?.Round).replace(/\D/g, ""));
            return (Number.isFinite(roundA) ? roundA : 999) -
              (Number.isFinite(roundB) ? roundB : 999);
          });

        if (teams.length < 2) {
          console.warn("Tournament loaded with an incomplete team mapping", {
            year,
            sheet: "Team Names",
            field: "Team Side",
            expectedTeams: 2,
            resolvedTeams: teams.length,
          });
        }
        if (clean(tournament["Winning Team"]) && !championByReference) {
          console.warn("Tournament champion could not be matched to a historical team", {
            year,
            sheet: tournament.__sheetName || "Tournaments",
            row: tournament.__sheetRow || "unknown",
            field: "Winning Team",
            value: clean(tournament["Winning Team"]),
            availableTeamIds: teams.map((team) => team.id),
            availableTeamNames: teams.map((team) => team.name),
            recoveredByWinningCaptainId: championByCaptain?.id || null,
          });
        }
        if (clean(tournament["Runner-Up Team"]) && !runnerUpByReference) {
          console.warn("Tournament runner-up could not be matched to a historical team", {
            year,
            sheet: tournament.__sheetName || "Tournaments",
            row: tournament.__sheetRow || "unknown",
            field: "Runner-Up Team",
            value: clean(tournament["Runner-Up Team"]),
            availableTeamIds: teams.map((team) => team.id),
            availableTeamNames: teams.map((team) => team.name),
            recoveredAsOpposingTeamId: runnerUpTeam?.id || null,
          });
        }

        return [{
          ...tournament,
          year,
          id: tournamentId(tournament),
          editionTitle: clean(tournament.Annual),
          logoFileName: clean(tournament["Annual Image"]),
          teams,
          team1: teams.find((team) => team.side === "Team 1") || null,
          team2: teams.find((team) => team.side === "Team 2") || null,
          championTeamId: championTeam?.id || null,
          runnerUpTeamId: runnerUpTeam?.id || null,
          championTeam: championTeam || null,
          runnerUpTeam: runnerUpTeam || null,
          courses,
          awards: historicalData.awards
            .filter((award) => Number(award?.Year) === year)
            .map((award) => ({
              ...award,
              winnerPlayer: playerMap[award?.Winner] || null,
            })),
        }];
      } catch (error) {
        console.error("Failed loading tournament", {
          year,
          sheet: tournament.__sheetName || "Tournaments",
          row: tournament.__sheetRow || "unknown",
          field: error?.field || "Tournament object",
          reason: error?.message || String(error),
          stack: error?.stack,
        });
        return [];
      }
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

export { formatHandicap, historicalData, ELO_START, ELO_K };
