import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const ROUTES = [
  "app/records/page.js",
  "app/records/[slug]/page.js",
  "app/statistics/page.js",
  "app/statistics/handicaps/page.js",
  "app/statistics/partnerships/page.js",
  "app/statistics/rivalries/page.js",
  "app/ratings/page.js",
  "app/compare/page.js",
  "app/board-of-governors/page.js",
];

test("all Step 6C.2 routes use the shared secondary-History boundary", async () => {
  const routes = await Promise.all(ROUTES.map(source));
  for (const route of routes) {
    assert.match(route, /isSupabaseSecondaryHistory/);
    assert.match(route, /loadSecondaryHistoryModel/);
    assert.match(route, /data-secondary-history-source/);
    assert.doesNotMatch(route, /scoringShadowRpc|read_preview_completed_history|\.from\(["']scoring_authority/);
  }
});

test("Supabase branches reuse canonical calculations and scorecards without a hidden Google fallback", async () => {
  const [records, detail, statistics, compare, service] = await Promise.all([
    source("app/records/page.js"),
    source("app/records/[slug]/page.js"),
    source("app/statistics/page.js"),
    source("app/compare/page.js"),
    source("lib/secondary-history-service.js"),
  ]);
  assert.match(records, /secondaryHistory\.calculations\.getRecords\(\)/);
  assert.match(records, /Promise\.resolve\(secondaryHistory\.scorecardAnalytics\)/);
  assert.match(detail, /getLeaderboardFromRecords\(slug, records\)/);
  assert.match(detail, /secondaryHistory\.scorecardAnalytics/);
  assert.match(statistics, /getLeaderboardFromRecords\(item\.slug, records\)/);
  assert.match(compare, /secondaryHistory\.calculations\.getHeadToHead/);
  assert.match(service, /googleForegroundRequests:\s*0/);
  assert.match(service, /noFallback:\s*true/);
  assert.doesNotMatch(service, /refreshHistoricalData|historical-data\.json|readWorkbookSheetsByName/);
});

test("ratings, handicaps, partnerships, rivalries, compare, and governors preserve established algorithms", async () => {
  const [stats, handicaps, partnerships, rivalries, ratings, compare, governors] = await Promise.all([
    source("lib/stats.js"),
    source("app/statistics/handicaps/page.js"),
    source("app/statistics/partnerships/page.js"),
    source("app/statistics/rivalries/page.js"),
    source("app/ratings/page.js"),
    source("app/compare/page.js"),
    source("app/board-of-governors/page.js"),
  ]);
  for (const method of ["getHandicapStats"]) {
    assert.match(stats, new RegExp(`${method}: invoke\\(${method}\\)`));
  }
  assert.match(stats, /const ratings = memoized\(getSandbaggerRatings\)/);
  assert.match(stats, /const allPlayerStats = memoized\(\(\) => getAllPlayerStats\(ratings\(\)\)\)/);
  assert.match(stats, /const records = memoized\(\(\) => getRecords\(allPlayerStats\(\)\)\)/);
  assert.match(stats, /const partnershipStats = memoized\(getPartnershipStats\)/);
  assert.match(stats, /const rivalryStats = memoized\(getRivalryStats\)/);
  assert.match(stats, /const chronological = memoized\(chronologicalMatches\)/);
  assert.match(stats, /const exclusions = memoized\(ghostMatchExclusions\)/);
  assert.match(stats, /getHeadToHead: headToHead/);
  assert.match(handicaps, /calculations\.getHandicapStats\(\)/);
  assert.match(partnerships, /calculations\.getPartnershipStats\(\)/);
  assert.match(rivalries, /calculations\.getRivalryStats\(\)/);
  assert.match(ratings, /calculations\.getSandbaggerRatings\(\)/);
  assert.match(compare, /for \(let oneIndex = 0; oneIndex < players\.length; oneIndex \+= 1\)/);
  assert.match(compare, /for \(let twoIndex = oneIndex \+ 1; twoIndex < players\.length; twoIndex \+= 1\)/);
  assert.match(governors, /calculations\.getAllPlayerStats\(\)/);
});

test("historical course pages remain outside the Step 6C source boundary", async () => {
  const [courses, course, hole] = await Promise.all([
    source("app/courses/page.js"),
    source("app/courses/[courseId]/page.js"),
    source("app/courses/[courseId]/holes/[holeNumber]/page.js"),
  ]);
  for (const route of [courses, course, hole]) {
    assert.doesNotMatch(route, /isSupabaseSecondaryHistory|loadSecondaryHistoryModel/);
  }
});
