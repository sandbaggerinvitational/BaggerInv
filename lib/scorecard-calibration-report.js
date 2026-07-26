import { buildMatchupScorecardIntelligence } from "./scorecard-intelligence.js";
import {
  calculateScorecardCalibration,
  scorecardCalibrationSettings,
  summarizeCalibrationBacktest,
} from "./scorecard-calibration.js";
import {
  allocateStrokes,
  formatCode,
  pick,
  playingHandicaps,
  predict,
  settingsMap,
} from "./prediction-engine.js";
import { holesForTee } from "./tournament-context.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = null) => {
  if (clean(value) === "") return fallback;
  const parsed = Number.parseFloat(clean(value).replace(/[−–—]/g, "-").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const same = (a, b) => clean(a).toUpperCase() === clean(b).toUpperCase();

function matchPlayers(match) {
  const format = formatCode(pick(match, "Format"));
  const fields = format === "SI"
    ? ["Team 1 Player 1", "Team 2 Player 1"]
    : ["Team 1 Player 1", "Team 1 Player 2", "Team 2 Player 1", "Team 2 Player 2"];
  return fields.map((field) => clean(pick(match, field))).filter(Boolean);
}

function matchOutcome(match, teamNames = []) {
  const value = clean(pick(match, "Matchup Winner", "18-Hole Winner", "Overall Winner")).toUpperCase();
  if (!value) return null;
  if (["HALVED", "HALVE", "TIE", "PUSH"].includes(value)) return "TIE";
  if (value.includes("TEAM 1") || value === "1") return "A";
  if (value.includes("TEAM 2") || value === "2") return "B";
  const teamA = clean(pick(match, "Team 1 Name") || teamNames[0]);
  const teamB = clean(pick(match, "Team 2 Name") || teamNames[1]);
  if (teamA && same(value, teamA)) return "A";
  if (teamB && same(value, teamB)) return "B";
  return null;
}

function teamName(sheets, year, side) {
  const row = (sheets.teamNames || []).find((item) =>
    number(pick(item, "Year")) === year && same(pick(item, "Team Side"), `Team ${side}`)
  );
  return clean(pick(row, "Team Names", "Team Name", "Name")) || `Team ${side}`;
}

function handicapForPlayer(sheets, year, playerId) {
  const row = (sheets.handicaps || []).find((item) =>
    number(pick(item, "Year")) === year && same(pick(item, "Player ID"), playerId)
  );
  return number(pick(row, "Tournament Handicap"));
}

function matchHandicaps(match, sheets, playerIds, year) {
  const format = formatCode(pick(match, "Format"));
  const slots = format === "SI"
    ? [[1, 1], [2, 1]]
    : [[1, 1], [1, 2], [2, 1], [2, 2]];
  return playerIds.map((playerId, index) =>
    number(
      pick(match, `Team ${slots[index][0]} Player ${slots[index][1]} Playing HCP`),
      handicapForPlayer(sheets, year, playerId)
    )
  );
}

function courseForMatch(sheets, match, year) {
  const courseId = clean(pick(match, "Course ID"));
  return (sheets.courses || []).find((row) =>
    same(pick(row, "Course ID"), courseId) && (!pick(row, "Year") || number(pick(row, "Year")) === year)
  ) || (sheets.courses || []).find((row) => same(pick(row, "Course ID"), courseId)) || {};
}

function predictionHandicap(format, handicaps, holes) {
  const play = playingHandicaps(format, handicaps);
  if (holes.length !== 18) return play;
  const sideSize = formatCode(format) === "SI" ? 1 : 2;
  if (formatCode(format) === "SC") {
    const a = allocateStrokes(play.strokesA, holes);
    const b = allocateStrokes(play.strokesB, holes);
    return {
      ...play,
      frontStrokesA: a.slice(0, 9).reduce((sum, value) => sum + value, 0),
      frontStrokesB: b.slice(0, 9).reduce((sum, value) => sum + value, 0),
      backStrokesA: a.slice(9).reduce((sum, value) => sum + value, 0),
      backStrokesB: b.slice(9).reduce((sum, value) => sum + value, 0),
      distributionAdvantageA: a.reduce((sum, value, index) => sum + Math.sign(value - b[index]), 0),
    };
  }
  const maps = play.playerStrokes.map((strokes) => allocateStrokes(strokes, holes));
  const a = holes.map((_, index) => Math.max(...maps.slice(0, sideSize).map((map) => map[index] || 0)));
  const b = holes.map((_, index) => Math.max(...maps.slice(sideSize).map((map) => map[index] || 0)));
  return {
    ...play,
    frontStrokesA: a.slice(0, 9).reduce((sum, value) => sum + value, 0),
    frontStrokesB: b.slice(0, 9).reduce((sum, value) => sum + value, 0),
    backStrokesA: a.slice(9).reduce((sum, value) => sum + value, 0),
    backStrokesB: b.slice(9).reduce((sum, value) => sum + value, 0),
    distributionAdvantageA: a.reduce((sum, value, index) => sum + Math.sign(value - b[index]), 0),
  };
}

function historicalScorecardsBefore(scorecards, match) {
  const year = number(pick(match, "Year"));
  const round = number(pick(match, "Round"), 99);
  return scorecards.filter((card) =>
    number(card.year) < year || (number(card.year) === year && number(card.round, 99) < round)
  );
}

export function buildScorecardCalibrationReport({
  sheets,
  scorecards,
  historical,
  partnerships,
  headToHead,
} = {}) {
  const settings = settingsMap(sheets.settings || []);
  const playerRows = Object.fromEntries((sheets.players || []).map((row) => [clean(pick(row, "Player ID")), row]));
  const matches = (sheets.matches || []).filter((match) => matchPlayers(match).length >= 2);
  const rows = [];

  for (const match of matches) {
    const playerIds = matchPlayers(match);
    const format = formatCode(pick(match, "Format"));
    const sideSize = format === "SI" ? 1 : 2;
    if (playerIds.length !== sideSize * 2) continue;
    const year = number(pick(match, "Year"));
    const handicaps = matchHandicaps(match, sheets, playerIds, year);
    if (handicaps.some((value) => !Number.isFinite(value))) continue;
    const course = courseForMatch(sheets, match, year);
    const tee = clean(pick(match, "Tee", "Tee Played", "Tee Name") || pick(course, "Tee", "Tee Name"));
    const holes = holesForTee(sheets, course, tee);
    const players = playerIds.map((id) => ({
      id,
      name: clean(pick(playerRows[id], "Display Name", "Player Name", "Name")) || id,
      courseHandicap: handicaps[playerIds.indexOf(id)],
    }));
    const teamNames = [teamName(sheets, year, 1), teamName(sheets, year, 2)];
    const existing = predict({
      format,
      players,
      historical,
      partnership: partnerships,
      headToHead,
      handicap: predictionHandicap(format, handicaps, holes),
      settings,
      teamNames,
    });
    // Prevent look-ahead bias: a backtest may only use scorecards recorded
    // before the match being evaluated.
    const priorScorecards = historicalScorecardsBefore(scorecards, match);
    const intelligence = buildMatchupScorecardIntelligence({
      scorecards: priorScorecards,
      playerIds,
      sideSize,
      format,
      selectedHoles: holes,
      courseId: clean(pick(match, "Course ID")),
      tee,
    });
    const calibration = calculateScorecardCalibration({ prediction: existing, intelligence, sideSize, settings });
    rows.push({
      matchId: clean(pick(match, "Match ID")),
      year,
      round: number(pick(match, "Round")),
      format,
      course: clean(pick(course, "Course Name", "Course")) || "Course not recorded",
      tee,
      sideA: players.slice(0, sideSize).map((player) => player.name).join(" + "),
      sideB: players.slice(sideSize).map((player) => player.name).join(" + "),
      teamNames,
      outcome: matchOutcome(match, teamNames),
      existing: calibration.existing,
      adjusted: calibration.adjusted,
      calibration,
    });
  }

  const completed = rows.filter((row) => row.outcome);
  return {
    generatedAt: new Date().toISOString(),
    shadowMode: true,
    settings: scorecardCalibrationSettings(settings),
    rows: rows.sort((a, b) => b.year - a.year || b.round - a.round),
    backtest: summarizeCalibrationBacktest(completed),
    coverage: {
      predictions: rows.length,
      completedMatches: completed.length,
      eligibleMatches: completed.filter((row) => row.calibration.eligible).length,
    },
  };
}
