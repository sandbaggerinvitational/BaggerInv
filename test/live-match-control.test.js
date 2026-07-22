import assert from "node:assert/strict";
import test from "node:test";
import { validateLiveMatchFinalResult } from "../lib/google-sheets-write.js";

test("accepts a finalized three-point match", () => {
  assert.doesNotThrow(() => validateLiveMatchFinalResult({
    "Team 1 Points": "1.75",
    "Team 2 Points": "1.25",
    "18-Hole Winner": "Team 1",
  }));
});

test("accepts a halved finalized match", () => {
  assert.doesNotThrow(() => validateLiveMatchFinalResult({
    "Team 1 Points": "1.5",
    "Team 2 Points": "1.5",
    "Matchup Winner": "Halved",
  }));
});

test("rejects final points that do not total three", () => {
  assert.throws(() => validateLiveMatchFinalResult({
    "Team 1 Points": "1",
    "Team 2 Points": "1",
    "18-Hole Winner": "Team 1",
  }), /must total 3/);
});

test("rejects a final without an overall result", () => {
  assert.throws(() => validateLiveMatchFinalResult({
    "Team 1 Points": "2",
    "Team 2 Points": "1",
  }), /overall winner or Halved/);
});
