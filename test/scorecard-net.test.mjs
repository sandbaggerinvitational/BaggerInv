import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBestBallNetHoleScore,
  calculateHoleWinner,
  calculateNetTotals,
  getStrokesOnHole,
} from "../lib/scorecard-net.js";

test("allocates zero, full-cycle, remainder, and double-cycle strokes correctly", () => {
  assert.equal(getStrokesOnHole(0, 1), 0);
  assert.equal(getStrokesOnHole(-2, 1), 0);
  assert.equal(getStrokesOnHole(7, 7), 1);
  assert.equal(getStrokesOnHole(7, 8), 0);
  assert.equal(getStrokesOnHole(18, 18), 1);
  assert.equal(getStrokesOnHole(19, 1), 2);
  assert.equal(getStrokesOnHole(19, 2), 1);
  assert.equal(getStrokesOnHole(36, 18), 2);
});

test("best ball selects the lower independently calculated net score", () => {
  assert.equal(calculateBestBallNetHoleScore([4, 5]), 4);
  assert.equal(calculateBestBallNetHoleScore([null, 5]), null);
});

test("hole winner treats ties independently and missing scores as unavailable", () => {
  assert.equal(calculateHoleWinner(4, 5, { sideATeamId: "A" }).winnerSide, "A");
  assert.equal(calculateHoleWinner(5, 4, { sideBTeamId: "B" }).winnerSide, "B");
  assert.equal(calculateHoleWinner(4, 4).winnerType, "HALVED");
  assert.equal(calculateHoleWinner(null, 4).winnerType, "UNAVAILABLE");
});

test("net totals require complete nines and complete round metadata", () => {
  const holes = Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    netScore: 4,
    par: 4,
  }));
  assert.deepEqual(calculateNetTotals(holes), {
    frontNine: 36,
    backNine: 36,
    total: 72,
    toPar: 0,
  });
  holes[17].netScore = null;
  assert.equal(calculateNetTotals(holes).backNine, null);
  assert.equal(calculateNetTotals(holes).total, null);
});
