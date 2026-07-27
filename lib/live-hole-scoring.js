import { createHash, timingSafeEqual } from "node:crypto";
import {
  calculateBestBallNetHoleScore,
  calculateHoleWinner,
  calculateIndividualNetHoleScore,
  calculateScrambleNetHoleScore,
  getStrokesOnHole,
} from "./scorecard-net.js";

const clean = (value) => String(value ?? "").trim();
const score = (value, label) => {
  if (value === null || value === undefined || clean(value) === "") {
    throw new Error(`${label} is required.`);
  }
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 20) {
    throw new Error(`${label} must be a whole number from 1 to 20.`);
  }
  return numeric;
};

function playerNet(player, gross, strokeIndex) {
  const strokes = getStrokesOnHole(player?.strokes ?? player?.playingHcp ?? 0, strokeIndex);
  const grossScore = score(gross, `${player?.name || player?.id || "Player"} gross score`);
  return {
    playerId: player?.id || "",
    grossScore,
    strokes,
    netScore: calculateIndividualNetHoleScore(grossScore, strokes),
  };
}

function side(format, players, grossScores, teamStrokes, strokeIndex, label) {
  if (format === "BB") {
    if (players.length !== 2) throw new Error(`${label} requires two players for Best Ball.`);
    const playerScores = players.map((player, index) => playerNet(player, grossScores[index], strokeIndex));
    return {
      grossScores: playerScores,
      netScore: calculateBestBallNetHoleScore(playerScores.map((item) => item.netScore)),
    };
  }
  if (format === "SC") {
    const grossScore = score(grossScores[0], `${label} scramble gross score`);
    const strokes = getStrokesOnHole(teamStrokes, strokeIndex);
    return {
      grossScores: [{ grossScore, strokes, netScore: calculateScrambleNetHoleScore(grossScore, strokes) }],
      netScore: calculateScrambleNetHoleScore(grossScore, strokes),
    };
  }
  if (format === "SI") {
    if (players.length !== 1) throw new Error(`${label} requires one player for Singles.`);
    const playerScore = playerNet(players[0], grossScores[0], strokeIndex);
    return { grossScores: [playerScore], netScore: playerScore.netScore };
  }
  throw new Error(`Unsupported match format: ${format || "missing"}.`);
}

export function calculateLiveHole({
  format,
  holeNumber,
  strokeIndex,
  team1Players = [],
  team2Players = [],
  team1GrossScores = [],
  team2GrossScores = [],
  team1Strokes = 0,
  team2Strokes = 0,
} = {}) {
  const normalizedFormat = clean(format).toUpperCase();
  const hole = Number(holeNumber);
  const index = Number(strokeIndex);
  if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new Error("Hole number must be from 1 to 18.");
  if (!Number.isInteger(index) || index < 1 || index > 18) throw new Error("Stroke index must be from 1 to 18.");
  const team1 = side(normalizedFormat, team1Players, team1GrossScores, team1Strokes, index, "Team 1");
  const team2 = side(normalizedFormat, team2Players, team2GrossScores, team2Strokes, index, "Team 2");
  const result = calculateHoleWinner(team1.netScore, team2.netScore, {
    holeNumber: hole,
    sideATeamId: "Team 1",
    sideBTeamId: "Team 2",
  });
  return {
    holeNumber: hole,
    strokeIndex: index,
    format: normalizedFormat,
    team1,
    team2,
    winner: result.winnerType === "HALVED" ? "Halved" : result.winnerSide === "A" ? "Team 1" : "Team 2",
  };
}

function segmentWinner(results, start, end) {
  const segment = results.filter((item) => item.holeNumber >= start && item.holeNumber <= end);
  if (segment.length !== end - start + 1) return "";
  const team1 = segment.filter((item) => item.winner === "Team 1").length;
  const team2 = segment.filter((item) => item.winner === "Team 2").length;
  return team1 === team2 ? "Halved" : team1 > team2 ? "Team 1" : "Team 2";
}

function singlesOutcome(results) {
  const completed = [...results]
    .filter((item) => Number(item.holeNumber) >= 1 && Number(item.holeNumber) <= 18)
    .sort((a, b) => Number(a.holeNumber) - Number(b.holeNumber));
  const unique = new Map(completed.map((item) => [Number(item.holeNumber), item]));
  const currentHole = Math.max(0, ...unique.keys());
  if (!currentHole || Array.from({ length: currentHole }, (_, index) => index + 1).some((hole) => !unique.has(hole))) {
    return { winner: "", complete: false, currentHole, holesRemaining: 18 - currentHole, lead: 0 };
  }
  const played = [...unique.values()];
  const team1 = played.filter((item) => item.winner === "Team 1").length;
  const team2 = played.filter((item) => item.winner === "Team 2").length;
  const lead = Math.abs(team1 - team2);
  const holesRemaining = 18 - currentHole;
  const complete = currentHole === 18 || lead > holesRemaining;
  const winner = !complete ? "" : team1 === team2 ? "Halved" : team1 > team2 ? "Team 1" : "Team 2";
  return { winner, complete, currentHole, holesRemaining, lead };
}

export function calculateMatchPoints(format, holeResults = []) {
  const normalizedFormat = clean(format).toUpperCase();
  const completed = [...holeResults].sort((a, b) => a.holeNumber - b.holeNumber);
  if (normalizedFormat === "SI") {
    const singles = singlesOutcome(completed);
    const overall = singles.winner;
    if (!singles.complete) return { frontWinner: "", backWinner: "", overallWinner: "", team1Points: null, team2Points: null };
    return {
      frontWinner: "",
      backWinner: "",
      overallWinner: overall,
      team1Points: overall === "Team 1" ? 3 : overall === "Halved" ? 1.5 : 0,
      team2Points: overall === "Team 2" ? 3 : overall === "Halved" ? 1.5 : 0,
    };
  }
  const overall = segmentWinner(completed, 1, 18);
  if (!overall) return { frontWinner: "", backWinner: "", overallWinner: "", team1Points: null, team2Points: null };
  if (!["BB", "SC"].includes(normalizedFormat)) throw new Error(`Unsupported match format: ${normalizedFormat}.`);
  const front = segmentWinner(completed, 1, 9);
  const back = segmentWinner(completed, 10, 18);
  const team1Points = [front, back, overall].reduce((total, winner) => total + (winner === "Team 1" ? 1 : winner === "Halved" ? 0.5 : 0), 0);
  return { frontWinner: front, backWinner: back, overallWinner: overall, team1Points, team2Points: 3 - team1Points };
}

export function calculateLiveMatchStatus(holeResults = [], format = "") {
  const completed = [...holeResults]
    .filter((item) => Number(item.holeNumber) >= 1 && Number(item.holeNumber) <= 18)
    .sort((a, b) => a.holeNumber - b.holeNumber);
  if (!completed.length) return { currentHole: 0, team1HolesWon: 0, team2HolesWon: 0, holesRemaining: 18, statusText: "Scheduled" };
  const currentHole = completed.at(-1).holeNumber;
  const team1HolesWon = completed.filter((item) => item.winner === "Team 1").length;
  const team2HolesWon = completed.filter((item) => item.winner === "Team 2").length;
  const holesRemaining = Math.max(0, 18 - currentHole);
  const difference = team1HolesWon - team2HolesWon;
  let statusText = difference === 0
    ? `All square through ${currentHole}`
    : `${difference > 0 ? "Team 1" : "Team 2"} ${Math.abs(difference)} UP through ${currentHole}`;
  let complete = false;
  let winner = "";
  if (clean(format).toUpperCase() === "SI") {
    const singles = singlesOutcome(completed);
    complete = singles.complete;
    winner = singles.winner;
    if (complete) {
      statusText = winner === "Halved"
        ? "Match halved"
        : `${winner} wins ${singles.lead} & ${singles.holesRemaining}`;
    }
  }
  return { currentHole, team1HolesWon, team2HolesWon, holesRemaining, statusText, complete, winner };
}

export function hashAccessCode(code, salt) {
  const normalized = clean(code);
  if (!/^[A-Za-z0-9-]{4,32}$/.test(normalized)) throw new Error("Access code must be 4–32 letters, numbers, or dashes.");
  if (!clean(salt)) throw new Error("Access-code salt is required.");
  return createHash("sha256").update(`${salt}:${normalized.toUpperCase()}`).digest("hex");
}

export function accessCodeMatches(code, expectedHash, salt) {
  if (!expectedHash) return false;
  const actual = Buffer.from(hashAccessCode(code, salt), "hex");
  const expected = Buffer.from(clean(expectedHash), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
