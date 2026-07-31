import assert from "node:assert/strict";
import test from "node:test";
import { runningMatchStatusAtHole, scoringProgress } from "../lib/scoring-experience.js";

const names = { 1: "The Pickles", 2: "Lipp It and Rip It" };
const scores = [
  { "Hole Number": 1, "Hole Winner": "Team 1" },
  { "Hole Number": 2, "Hole Winner": "Halved" },
  { "Hole Number": 3, "Hole Winner": "Team 2" },
  { "Hole Number": 4, "Hole Winner": "Team 1" },
];

test("scoring progress derives completed and remaining holes without changing match data", () => {
  assert.deepEqual(scoringProgress(scores, 5), { currentHole: 5, completed: 4, remaining: 14, percent: 4 / 18 * 100 });
  assert.deepEqual(scoringProgress([], 1), { currentHole: 1, completed: 0, remaining: 18, percent: 0 });
  assert.equal(scoringProgress(Array.from({ length: 18 }, (_, index) => ({ "Hole Number": index + 1 })), 18).percent, 100);
});

test("running match status is reconstructed at each recorded hole", () => {
  assert.equal(runningMatchStatusAtHole(scores, 1, names), "The Pickles 1 UP");
  assert.equal(runningMatchStatusAtHole(scores, 3, names), "All Square");
  assert.equal(runningMatchStatusAtHole(scores, 4, names), "The Pickles 1 UP");
  assert.equal(runningMatchStatusAtHole([], 1, names), "");
});
