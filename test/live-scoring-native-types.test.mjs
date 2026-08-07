import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { grossScoresForWorkbook, grossScoresFromCell, normalizeLiveScoreInput, normalizeLiveScoringRequest } from "../lib/live-score-values.js";
import { normalizeWorkbookWriteValue } from "../lib/workbook-protection.js";
import { participantScoringError } from "../lib/scoring-api-errors.js";

test("live scoring normalizes HTML score strings before the protected writer", () => {
  assert.equal(normalizeLiveScoreInput("3"), 3);
  assert.equal(normalizeLiveScoreInput(""), "");
  const request = normalizeLiveScoringRequest({ holeNumber: "1", expectedRevision: "0", team1GrossScores: ["3"], team2GrossScores: ["4"], expectedUpdatedAt: "stamp" });
  assert.deepEqual(request, { holeNumber: 1, expectedRevision: 0, team1GrossScores: [3], team2GrossScores: [4], expectedUpdatedAt: "stamp" });
  assert.equal(typeof request.holeNumber, "number");
  assert.equal(typeof request.team1GrossScores[0], "number");
});

test("Scramble and Singles persist native scalar gross scores", () => {
  assert.equal(grossScoresForWorkbook([3]), 3);
  assert.equal(normalizeWorkbookWriteValue("Live Hole Scores", "Team 1 Gross Scores", 3), 3);
  assert.equal(typeof normalizeWorkbookWriteValue("Live Hole Scores", "Team 2 Gross Scores", 4), "number");
  assert.deepEqual(grossScoresFromCell(3), [3]);
});

test("Best Ball preserves two native player scores in the existing structured cell", () => {
  const scores = grossScoresForWorkbook([4, 5]);
  assert.deepEqual(scores, [4, 5]);
  assert.equal(normalizeWorkbookWriteValue("Live Hole Scores", "Team 1 Gross Scores", scores), "[4,5]");
  assert.deepEqual(grossScoresFromCell("[4,5]"), [4, 5]);
});

test("gross score fields reject arbitrary strings and apostrophe-prefixed values", () => {
  assert.throws(() => normalizeWorkbookWriteValue("Live Hole Scores", "Team 1 Gross Scores", "3"), /native numeric score values/);
  assert.throws(() => normalizeWorkbookWriteValue("Live Hole Scores", "Team 1 Gross Scores", "'3"), /native numeric score values/);
  assert.throws(() => normalizeLiveScoringRequest({ holeNumber: 1, expectedRevision: 0, team1GrossScores: [""], team2GrossScores: [4] }), /required/);
});

test("technical workbook failures stay in diagnostics and out of participant copy", () => {
  assert.equal(participantScoringError(new Error("Live Hole Scores.Team 1 Gross Scores must be written as a native number.")), "Your score could not be saved. Please try again.");
  assert.equal(participantScoringError(new Error("This hole was updated by someone else.")), "This hole was updated by someone else.");
});

test("both scoring APIs normalize requests and preserve technical diagnostics", async () => {
  const [current, match, writer] = await Promise.all([
    readFile(new URL("../app/api/scoring/current/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scoring/matches/[matchId]/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8"),
  ]);
  for (const source of [current, match]) {
    assert.match(source, /normalizeLiveScoringRequest\(submitted\)/);
    assert.match(source, /participantScoringError\(error\)/);
    assert.match(source, /logScoringFailure/);
  }
  assert.match(writer, /grossScoresForWorkbook/);
  assert.match(writer, /Live Hole Scores read-back verification failed/);
});
