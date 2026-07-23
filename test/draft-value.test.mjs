import test from "node:test";
import assert from "node:assert/strict";
import {
  draftValueScore,
  gradeForScore,
  relativeDraftResults,
} from "../lib/draft-value.js";

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

test("relative draft grades reward the stronger of two close rosters", () => {
  const results = relativeDraftResults([
    { id: "pickles", strength: 54, objective: 1 },
    { id: "lipp", strength: 46, objective: -1 },
  ]);
  assert.equal(results[0].grade, "A");
  assert.equal(results[1].grade, "B+");
  assert.ok(results[0].score > results[1].score);
});

test("relative draft grades keep nearly even strong drafts near the top", () => {
  const results = relativeDraftResults([
    { id: "pickles", strength: 51, objective: 2 },
    { id: "lipp", strength: 49, objective: 1 },
  ]);
  assert.equal(results[0].grade, "A");
  assert.equal(results[1].grade, "A−");
});

test("both drafts receive low grades only when both miss the objective baseline", () => {
  const results = relativeDraftResults([
    { id: "pickles", strength: 52, objective: -10 },
    { id: "lipp", strength: 48, objective: -12 },
  ]);
  assert.deepEqual(results.map((row) => row.grade), ["B−", "C"]);
});
