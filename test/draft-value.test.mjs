import test from "node:test";
import assert from "node:assert/strict";
import { draftValueScore, gradeForScore } from "../lib/draft-value.js";

test("Draft Value Score rewards a finish above draft position", () => {
  assert.equal(draftValueScore(18, 3), 15);
  assert.equal(draftValueScore(2, 6), -4);
});

test("Draft Value Score remains unavailable without a valid finish", () => {
  assert.equal(draftValueScore(4, undefined), null);
});

test("captain grades are derived from numeric scores", () => {
  assert.equal(gradeForScore(94), "A");
  assert.equal(gradeForScore(88), "B+");
  assert.equal(gradeForScore(74), "C");
});
