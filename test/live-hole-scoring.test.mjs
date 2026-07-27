import assert from "node:assert/strict";
import test from "node:test";
import {
  accessCodeMatches,
  calculateLiveHole,
  calculateLiveMatchStatus,
  calculateMatchPoints,
  hashAccessCode,
} from "../lib/live-hole-scoring.js";

test("best ball uses the lowest player net score on each side", () => {
  const result = calculateLiveHole({
    format: "BB", holeNumber: 3, strokeIndex: 2,
    team1Players: [{ id: "A", strokes: 2 }, { id: "B", strokes: 0 }],
    team2Players: [{ id: "C", strokes: 0 }, { id: "D", strokes: 0 }],
    team1GrossScores: [5, 4], team2GrossScores: [4, 5],
  });
  assert.equal(result.team1.netScore, 4);
  assert.equal(result.team2.netScore, 4);
  assert.equal(result.winner, "Halved");
});

test("live match status reports holes won and the through-hole position", () => {
  const status = calculateLiveMatchStatus([
    { holeNumber: 1, winner: "Team 1" },
    { holeNumber: 2, winner: "Halved" },
    { holeNumber: 3, winner: "Team 1" },
  ]);
  assert.deepEqual(status, {
    currentHole: 3, team1HolesWon: 2, team2HolesWon: 0,
    holesRemaining: 15, statusText: "Team 1 2 UP through 3",
  });
});

test("scramble applies the team stroke allowance to its gross score", () => {
  const result = calculateLiveHole({
    format: "SC", holeNumber: 1, strokeIndex: 1,
    team1GrossScores: [5], team2GrossScores: [4],
    team1Strokes: 1, team2Strokes: 0,
  });
  assert.equal(result.team1.netScore, 4);
  assert.equal(result.winner, "Halved");
});

test("singles awards all three points for the overall match", () => {
  const holes = Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    winner: index < 10 ? "Team 1" : "Team 2",
  }));
  assert.deepEqual(calculateMatchPoints("SI", holes), {
    frontWinner: "", backWinner: "", overallWinner: "Team 1",
    team1Points: 3, team2Points: 0,
  });
});

test("best ball and scramble award front, back, and overall independently", () => {
  const holes = Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    winner: index < 5 || index >= 9 ? "Team 1" : "Team 2",
  }));
  assert.deepEqual(calculateMatchPoints("BB", holes), {
    frontWinner: "Team 1", backWinner: "Team 1", overallWinner: "Team 1",
    team1Points: 3, team2Points: 0,
  });
});

test("match codes are compared by hash and are case-insensitive", () => {
  const hash = hashAccessCode("Round-4821", "test-salt");
  assert.equal(accessCodeMatches("round-4821", hash, "test-salt"), true);
  assert.equal(accessCodeMatches("wrong-code", hash, "test-salt"), false);
});
