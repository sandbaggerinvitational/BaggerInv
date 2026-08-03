import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const paths = {
  scorecard: new URL("../app/ScorecardTable.js", import.meta.url),
  scorecardCss: new URL("../app/scorecard.module.css", import.meta.url),
  round: new URL("../app/history/[year]/round/[round]/page.js", import.meta.url),
  tournament: new URL("../app/history/[year]/page.js", import.meta.url),
  player: new URL("../app/players/[slug]/page.js", import.meta.url),
  playerHistory: new URL("../app/players/[slug]/PlayerFormatMatchHistory.js", import.meta.url),
  course: new URL("../app/courses/[courseId]/page.js", import.meta.url),
  hole: new URL("../app/courses/[courseId]/holes/[holeNumber]/page.js", import.meta.url),
  records: new URL("../app/records/page.js", import.meta.url),
  sheets: new URL("../lib/google-sheets-data.js", import.meta.url),
};

test("Phase 2 public pages consume the shared scorecard analytics service", async () => {
  const sources = Object.fromEntries(
    await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]))
  );

  for (const key of ["round", "tournament", "player", "hole", "records"]) {
    assert.match(sources[key], /scorecard-(?:data|analytics)/, `${key} must use the shared scorecard layer`);
  }
  assert.match(sources.round, /Round Statistics/);
  assert.match(sources.tournament, /Tournament Scoring Statistics/);
  assert.match(sources.player, /PlayerIntelligenceSections/);
  assert.match(sources.course, /resolveTournamentGuideContent/);
  assert.match(sources.course, /model\.holes/);
  assert.doesNotMatch(sources.course, /loadScorecardAnalytics/);
  assert.match(sources.hole, /Hole Statistics/);
  assert.match(sources.records, /Scoring Records/);
  assert.match(sources.playerHistory, /ScorecardTable/);
});

test("public scorecards are collapsed, mapped, responsive, and silent when missing", async () => {
  const [component, css] = await Promise.all([
    readFile(paths.scorecard, "utf8"),
    readFile(paths.scorecardCss, "utf8"),
  ]);

  assert.doesNotMatch(component, /Hole-by-hole scorecard unavailable/);
  assert.doesNotMatch(component, /Scorecard unavailable for this historical match/);
  assert.match(component, /if \(!available\.length\) return null/);
  assert.match(component, /aria-expanded=\{open\}/);
  assert.match(component, /useState\(false\)/);
  assert.match(component, /courseName/);
  assert.doesNotMatch(component, /available\[0\]\.courseId/);
  assert.match(component, /teeLabel/);
  assert.match(component, /Front 9/);
  assert.match(component, /Back 9/);
  assert.match(component, /segment="front"/);
  assert.match(component, /segment="back"/);
  assert.match(component, /Partial Scorecard/);
  assert.match(component, /scorecard\.status === "PARTIAL"/);
  assert.match(component, /gross score/);
  assert.match(component, /strokeDots/);
  assert.match(component, /Hole Winner/);
  assert.match(component, /matchNetScoring/);
  assert.match(component, /Gross and net scoring available/);
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /position:sticky/);
  assert.match(css, /\.netRow/);
  assert.match(css, /\.winnerRow/);
  assert.match(css, /\.desktopGrid/);
  assert.match(css, /\.mobileGrid/);
  assert.match(css, /focus-visible/);
});

test("Phase 2 does not add scorecard data to prediction weighting", async () => {
  const prediction = await readFile(new URL("../lib/prediction-engine.js", import.meta.url), "utf8");
  assert.doesNotMatch(prediction, /Round Scorecards|scorecardAnalytics|recordedScoringAverage/);
});

test("scorecard histories reuse tournament data and fail fast when optional sheets stall", async () => {
  const source = await readFile(paths.sheets, "utf8");
  const scorecardSheets = source.match(/export const SCORECARD_SHEETS = \{([\s\S]*?)\n\};/)?.[1] || "";

  assert.match(scorecardSheets, /Round Scorecards/);
  assert.match(scorecardSheets, /Course Holes/);
  assert.doesNotMatch(scorecardSheets, /Matches|Courses|Team Names|Players/);
  assert.match(source, /loadHistoricalData\(\)/);
  assert.match(source, /timeoutMs:\s*10_000/);
  assert.match(source, /SCORECARD_CACHE_SECONDS\s*=\s*300/);
  assert.match(source, /HISTORICAL_CACHE_SECONDS\s*=\s*300/);
});

test("scorecard analytics are reused and the War Room avoids a duplicate archive load", async () => {
  const [scorecardData, warRoomPage] = await Promise.all([
    readFile(new URL("../lib/scorecard-data.js", import.meta.url), "utf8"),
    readFile(new URL("../app/war-room/page.js", import.meta.url), "utf8"),
  ]);

  assert.match(scorecardData, /ANALYTICS_CACHE_MS\s*=\s*5 \* 60 \* 1000/);
  assert.match(scorecardData, /if \(cachedAnalytics/);
  assert.match(scorecardData, /if \(pendingAnalytics\)/);
  assert.doesNotMatch(warRoomPage, /loadScorecardAnalytics/);
  assert.match(warRoomPage, /buildScorecardAnalytics/);
  assert.match(warRoomPage, /relevantScorecards\.map\(compactWarRoomScorecard\)/);
});
