import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile scorer supports match codes, admin mode, every format, and revisions", async () => {
  const source = await readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8");
  assert.match(source, /Match code/);
  assert.match(source, /Administrator/);
  assert.match(source, /format === "BB" \? 2 : 1/);
  assert.match(source, /gross score/);
  assert.match(source, /Submit final scorecard/);
  assert.match(source, /strokeDots/);
  assert.match(source, /namedMatchStatus/);
  assert.match(source, /holeNavigator/);
  assert.match(source, /scorecardRow/);
  assert.match(source, /Gross &amp; net/);
  assert.match(source, /expectedRevision/);
  assert.match(source, /sessionStorage\.setItem\(SCORING_SESSION_KEY/);
  assert.match(source, /Restoring your authorized match/);
  assert.match(source, /<strong>{namedMatchStatus\(data\?\.holeScores, teamNames\)}<\/strong>/);
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
  assert.match(source, /matchComplete/);
  assert.match(source, /confirmLiveMatchScorecard/);
});

test("scoring login remains retryable while writes are rate limited", async () => {
  const [session, match] = await Promise.all([
    readFile(new URL("../app/api/scoring/session/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scoring/matches/[matchId]/route.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(session, /scoring-login:/);
  assert.doesNotMatch(session, /Too many scoring login attempts/);
  assert.match(match, /scoring-write:/);
  assert.match(match, /limit:\s*30/);
});
