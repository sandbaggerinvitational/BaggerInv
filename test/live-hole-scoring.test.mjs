import assert from "node:assert/strict";
import test from "node:test";
import {
  accessCodeMatches,
  calculateLiveHole,
  calculateLiveMatchStatus,
  calculateMatchPoints,
  hashAccessCode,
  isScorecardComplete,
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
    complete: false, winner: "",
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

test("singles closes early once the lead exceeds holes remaining", () => {
  const holes = Array.from({ length: 16 }, (_, index) => ({
    holeNumber: index + 1,
    winner: index < 9 ? "Team 1" : index < 15 ? "Team 2" : "Halved",
  }));
  const status = calculateLiveMatchStatus(holes, "SI");
  assert.equal(status.statusText, "Team 1 wins 3 & 2");
  assert.equal(status.complete, true);
  assert.deepEqual(calculateMatchPoints("SI", holes), {
    frontWinner: "", backWinner: "", overallWinner: "Team 1",
    team1Points: 3, team2Points: 0,
  });
});

test("a clinched Singles match remains scoreable through all 18 holes", () => {
  const firstThirteen = ["Team 1", "Team 2", "Team 1", "Team 2", "Team 1", "Team 2", "Team 1", "Team 1", "Team 1", "Team 1", "Team 1", "Team 1", "Team 1"];
  const holes = firstThirteen.map((winner, index) => ({ holeNumber: index + 1, winner }));
  const clinched = calculateLiveMatchStatus(holes, "SI");
  assert.equal(clinched.complete, true);
  assert.equal(clinched.statusText, "Team 1 wins 7 & 5");
  assert.equal(isScorecardComplete(holes), false);

  for (let holeNumber = 14; holeNumber <= 18; holeNumber += 1) {
    holes.push({ holeNumber, winner: "Team 2" });
    assert.equal(isScorecardComplete(holes), holeNumber === 18);
    assert.equal(calculateLiveMatchStatus(holes, "SI").statusText, "Team 1 wins 7 & 5");
    assert.equal(calculateMatchPoints("SI", holes).overallWinner, "Team 1");
  }
});

test("scorecard completeness requires every hole for every supported format", () => {
  for (const format of ["BB", "SC", "SI"]) {
    const incomplete = Array.from({ length: 17 }, (_, index) => ({ holeNumber: index + 1, winner: "Halved" }));
    assert.equal(isScorecardComplete(incomplete), false, `${format} must not complete at 17 holes`);
    assert.equal(isScorecardComplete([...incomplete, { holeNumber: 18, winner: "Halved" }]), true, `${format} completes at 18 holes`);
  }
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
