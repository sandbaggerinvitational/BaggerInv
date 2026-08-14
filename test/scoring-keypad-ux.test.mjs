import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COMMON_GOLF_SCORES,
  MAX_GOLF_SCORE,
  buildScoringSlots,
  nextScoringSlotIndex,
  scoreFromKeypad,
} from "../lib/scoring-keypad.js";

const fixture = {
  match: {
    "Team 1 Player 1": "P1",
    "Team 1 Player 2": "P2",
    "Team 2 Player 1": "P3",
    "Team 2 Player 2": "P4",
  },
  teamNames: { 1: "Pickles", 2: "Lipp It" },
  playerNames: { P1: "One", P2: "Two", P3: "Three", P4: "Four" },
};

test("golf keypad gives one-tap common scores plus controlled 1 through authoritative 20", () => {
  assert.deepEqual(COMMON_GOLF_SCORES, [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const score of COMMON_GOLF_SCORES) assert.equal(scoreFromKeypad("", score), score);
  assert.equal(scoreFromKeypad("", "decrement"), 1);
  assert.equal(scoreFromKeypad("", "increment"), 11);
  let score = 11;
  while (score < MAX_GOLF_SCORE) score = scoreFromKeypad(score, "increment");
  assert.equal(score, 20);
  assert.equal(scoreFromKeypad(score, "increment"), 20);
  assert.equal(scoreFromKeypad(2, "decrement"), 1);
  assert.equal(scoreFromKeypad(1, "decrement"), 1);
  assert.equal(scoreFromKeypad(8, "clear"), "");
  assert.equal(scoreFromKeypad("", 21), "");
});

test("format slots preserve canonical Best Ball, Scramble, and Singles ordering", () => {
  const bestBall = buildScoringSlots({ format: "BB", ...fixture });
  assert.deepEqual(bestBall.map(({ key, playerId }) => [key, playerId]), [
    ["team1:0", "P1"], ["team1:1", "P2"], ["team2:0", "P3"], ["team2:1", "P4"],
  ]);
  const singles = buildScoringSlots({ format: "SI", ...fixture });
  assert.deepEqual(singles.map(({ playerId }) => playerId), ["P1", "P3"]);
  const scramble = buildScoringSlots({ format: "SC", ...fixture });
  assert.equal(scramble.length, 2);
  assert.deepEqual(scramble.map(({ kind, label, playerId }) => [kind, label, playerId]), [
    ["team", "Pickles", "P1"], ["team", "Lipp It", "P3"],
  ]);
  assert.equal(scramble[0].pairing, "One + Two");
  assert.equal(scramble[1].pairing, "Three + Four");
});

test("slot advancement stays on the hole and stops on the final required entry", () => {
  assert.equal(nextScoringSlotIndex(0, 4), 1);
  assert.equal(nextScoringSlotIndex(1, 4), 2);
  assert.equal(nextScoringSlotIndex(2, 4), 3);
  assert.equal(nextScoringSlotIndex(3, 4), 3);
  assert.equal(nextScoringSlotIndex(0, 2), 1);
  assert.equal(nextScoringSlotIndex(1, 2), 1);
});

test("active scoring uses the custom keypad, deliberate sheets, and focus-mode shell only", async () => {
  const [entry, keypad, styles, globals] = await Promise.all([
    readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/ScoringKeypad.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/score.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(entry, /<ScoringKeypad/);
  assert.doesNotMatch(entry, /type="number"[^>]*gross score/);
  assert.match(keypad, /COMMON_GOLF_SCORES\.map/);
  assert.match(keypad, /onAdjust\("increment"\)/);
  assert.match(keypad, /onAdjust\("decrement"\)/);
  assert.match(entry, /nextScoringSlotIndex/);
  assert.match(entry, /Save & Continue/);
  assert.match(entry, /Save correction to Hole/);
  assert.match(entry, /Leave scoring\?/);
  assert.match(entry, /Finalize Match\?/);
  assert.match(entry, /Saved on this phone/);
  assert.match(entry, /Score needs review/);
  assert.match(entry, /participant-scoring-focus-active/);
  assert.match(globals, /body\.participant-scoring-focus-active \[data-participant-navigation\]/);
  assert.match(styles, /\.keypadGrid button\{[^}]*min-height:58px/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
});

test("scoring UX preserves the frozen authorized mutation and finalization contracts", async () => {
  const entry = await readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8");
  assert.match(entry, /syncQueue\.current\.enqueue\(\{/);
  assert.match(entry, /expectedRevision/);
  assert.match(entry, /expectedMatchRevision/);
  assert.match(entry, /expectedUpdatedAt/);
  assert.match(entry, /clientMutationId: `finalize:/);
  assert.match(entry, /action: "confirm"/);
  assert.match(entry, /\/api\/scoring\/current/);
  assert.doesNotMatch(entry, /google-sheets|scoring-google-outbox|round-scorecards-archive/i);
});
