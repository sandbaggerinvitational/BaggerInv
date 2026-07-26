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
};

test("Phase 2 public pages consume the shared scorecard analytics service", async () => {
  const sources = Object.fromEntries(
    await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]))
  );

  for (const key of ["round", "tournament", "player", "course", "hole", "records"]) {
    assert.match(sources[key], /scorecard-(?:data|analytics)/, `${key} must use the shared scorecard layer`);
  }
  assert.match(sources.round, /Round Statistics/);
  assert.match(sources.tournament, /Tournament Scoring Statistics/);
  assert.match(sources.player, /Scoring Statistics/);
  assert.match(sources.course, /Course Statistics/);
  assert.match(sources.hole, /Hole Statistics/);
  assert.match(sources.records, /Scoring Records/);
  assert.match(sources.playerHistory, /ScorecardTable/);
});

test("scorecard UI exposes missing and partial states and scrolls only the grid", async () => {
  const [component, css] = await Promise.all([
    readFile(paths.scorecard, "utf8"),
    readFile(paths.scorecardCss, "utf8"),
  ]);

  assert.match(component, /Hole-by-hole scorecard unavailable/);
  assert.match(component, /Partial historical scorecard/);
  assert.match(component, /scorecard\.status === "PARTIAL"/);
  assert.match(component, /gross score/);
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /position:sticky/);
});

test("Phase 2 does not add scorecard data to prediction weighting", async () => {
  const prediction = await readFile(new URL("../lib/prediction-engine.js", import.meta.url), "utf8");
  assert.doesNotMatch(prediction, /Round Scorecards|scorecardAnalytics|recordedScoringAverage/);
});
