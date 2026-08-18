import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MINIMUM_DRAFTS_FOR_ADP,
  MINIMUM_DRAFTS_FOR_TRENDS,
} from "../lib/draft-analytics-config.js";

test("historical draft analytics requires repeat participation for ADP", () => {
  assert.equal(MINIMUM_DRAFTS_FOR_ADP, 2);
});

test("historical trends wait for three completed tournament outcomes", () => {
  assert.equal(MINIMUM_DRAFTS_FOR_TRENDS, 3);
});

test("historical analytics includes the Hall of Fame, replay, redraft, and searchable player history", async () => {
  const view = await readFile(
    new URL("../app/draft/analytics/DraftAnalyticsView.js", import.meta.url),
    "utf8"
  );
  assert.match(view, /title="Draft Hall of Fame"/);
  assert.match(view, /function ReplayDraft/);
  assert.match(view, /Pause/);
  assert.match(view, /Skip to Pick/);
  assert.match(view, /function Redraft/);
  assert.match(view, /Search Player/);
  assert.match(view, /Draft Value Leaderboard/);
});

test("AI redraft and historical awards reuse the shared Draft Value Score", async () => {
  const analytics = await readFile(
    new URL("../lib/draft-analytics.js", import.meta.url),
    "utf8"
  );
  assert.match(analytics, /import \{ draftValueScore \} from "\.\/draft-value\.js"/);
  assert.match(analytics, /redraftValue: draftValueScore\(row\.pick, index \+ 1\)/);
  assert.match(analytics, /dvs: draftValueScore\(pick\.pickNumber, finish\)/);
});

test("player profiles preserve draft history as display-only career context", async () => {
  const profile = await readFile(
    new URL("../app/players/[slug]/page.js", import.meta.url),
    "utf8"
  );
  assert.match(profile, /getPlayerDraftHistory/);
  assert.match(profile, /className=\{styles\.profileDraftHistory\}/);
  assert.doesNotMatch(profile, /Open Historical Draft Analytics|href=\{`\/draft\/\$\{draft\.year\}`\}/);
});
