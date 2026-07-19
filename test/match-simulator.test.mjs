import test from "node:test";
import assert from "node:assert/strict";
import { simulateMatch } from "../lib/match-simulator.js";

const prediction = { teamA: 64, tie: 11, teamB: 25 };

test("simulation is stable for the same matchup seed", () => {
  const options = { format: "SI", prediction, iterations: 1000, seed: "same-match" };
  assert.deepEqual(simulateMatch(options), simulateMatch(options));
});

test("singles simulation returns one expected point and match-play margins", () => {
  const result = simulateMatch({ format: "SI", prediction, iterations: 2000, seed: "singles" });
  assert.equal(Number((result.expectedPoints.teamA + result.expectedPoints.teamB).toFixed(2)), 1);
  assert.equal(result.maximumPoints, 1);
  assert.ok(result.likelyResults.some((row) => /Up|&|Halved/.test(row.label)));
});

test("team-format simulation returns three expected points and segment probabilities", () => {
  const result = simulateMatch({ format: "BB", prediction, iterations: 2000, seed: "best-ball", teamNames: ["Pickles", "Lipp"] });
  assert.equal(Number((result.expectedPoints.teamA + result.expectedPoints.teamB).toFixed(2)), 3);
  assert.equal(result.maximumPoints, 3);
  for (const segment of ["front", "back", "overall"]) {
    const probabilities = result.segmentProbabilities[segment];
    assert.equal(Number((probabilities.teamA + probabilities.halve + probabilities.teamB).toFixed(1)), 100);
  }
});

test("hole stroke allocation changes the segment distribution", () => {
  const noStrokes = simulateMatch({ format: "BB", prediction, iterations: 3000, seed: "strokes" });
  const withStrokes = simulateMatch({
    format: "BB", prediction, iterations: 3000, seed: "strokes",
    strokeMaps: { teamA: [1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0], teamB: Array(18).fill(0) },
  });
  assert.notEqual(withStrokes.segmentProbabilities.front.teamA, noStrokes.segmentProbabilities.front.teamA);
});
