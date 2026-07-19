import test from "node:test";
import assert from "node:assert/strict";
import { allocateStrokes, courseHandicap, formatCode, playingHandicaps, predict } from "../lib/prediction-engine.js";

test("normalizes supported match formats", () => {
  assert.equal(formatCode("Best Ball"), "BB");
  assert.equal(formatCode("2-man scramble"), "SC");
  assert.equal(formatCode("Singles"), "SI");
});

test("calculates course and singles handicaps", () => {
  assert.equal(courseHandicap(10, 72, 113, 72), 10);
  assert.deepEqual(playingHandicaps("Singles", [7, 11]).playerStrokes, [0, 4]);
});

test("allocates strokes in stroke-index order", () => {
  const holes = Array.from({ length: 18 }, (_, index) => ({ Hole: index + 1, "Stroke Index": 18 - index }));
  const result = allocateStrokes(2, holes);
  assert.equal(result[17], 1);
  assert.equal(result[16], 1);
  assert.equal(result.reduce((sum, value) => sum + value, 0), 2);
});

test("predictions remain bounded and total 100", () => {
  const players = [{ id: "a" }, { id: "b" }];
  const historical = {
    a: { records: { overall: { matches: 10, wins: 7, halves: 1, points: 7.5 }, SI: { matches: 5, wins: 4, halves: 0 } }, appearances: [1, 2] },
    b: { records: { overall: { matches: 10, wins: 3, halves: 1, points: 3.5 }, SI: { matches: 5, wins: 1, halves: 0 } }, appearances: [1, 2] },
  };
  const result = predict({
    format: "Singles", players, historical, partnership: {}, headToHead: {},
    handicap: { strokesA: 0, strokesB: 2 }, settings: {}, teamNames: ["Blue", "Red"],
  });
  assert.equal(result.teamA + result.teamB + result.tie, 100);
  assert.ok([result.teamA, result.teamB, result.tie].every((value) => value >= 0 && value <= 100));
});
