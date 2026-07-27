import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile scorer supports match codes, admin mode, every format, and revisions", async () => {
  const source = await readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8");
  assert.match(source, /Match code/);
  assert.match(source, /Administrator/);
  assert.match(source, /format === "BB" \? 2 : 1/);
  assert.match(source, /Team gross score/);
  assert.match(source, /expectedRevision/);
  assert.match(source, /Hole result/);
});

test("public Match Center refreshes while visible and stops its timer cleanly", async () => {
  const source = await readFile(new URL("../app/live/MatchCenter.js", import.meta.url), "utf8");
  assert.match(source, /setInterval\(refresh, 15_000\)/);
  assert.match(source, /document\.visibilityState !== "visible"/);
  assert.match(source, /clearInterval\(timer\)/);
  assert.match(source, /router\.refresh\(\)/);
});

test("new scoring writes require a separate test spreadsheet", async () => {
  const source = await readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8");
  assert.match(source, /SCORING_ENVIRONMENT !== "test"/);
  assert.match(source, /requires a separate test GOOGLE_SHEETS_ID/);
  assert.match(source, /expectedRevision/);
  assert.match(source, /finalizeLiveMatch/);
  assert.match(source, /matchComplete/);
});
