import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { courseDetailModel } from "../lib/course-detail.js";
import {
  buildHistoricalCourseModel,
  historicalCourseArchiveContent,
  historicalCourseHoleInput,
  historicalCourseProfileInput,
} from "../lib/historical-course-model.js";
import {
  historicalCourseReadEnvironment,
  requireHistoricalCourseReadSource,
} from "../lib/historical-course-read-source.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const preview = {
  VERCEL_ENV: "preview",
  HISTORICAL_COURSE_READ_SOURCE: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "test-only",
};

const yearCourseIds = {
  2017: ["TNGC01", "WKPS01", "GGCR01"],
  2018: ["ARGC01", "SRGC01", "SRGC02"],
  2019: ["RSF01", "EVGC01", "RSN01"],
  2020: ["GTW01", "GTB01", "FDGC01"],
  2021: ["ONGC01", "BRGC01", "PVGC01"],
  2022: ["P201", "P701", "P401"],
  2023: ["PDC01", "PDC01", "DRC01"],
  2024: ["SVGC01", "MDGC01", "SVGC02"],
  2025: ["OMGC01", "BDGC01", "PDGC03"],
};

function definitions(year, round) {
  if (year < 2023) return [];
  return Array.from({ length: 18 }, (_, index) => ({
    hole_number: index + 1,
    yardage: 330 + (year - 2023) * 10 + round + index,
    par: index % 5 === 0 ? 5 : index % 4 === 0 ? 3 : 4,
    stroke_index: index + 1,
  }));
}

function appearance(year, round) {
  const courseId = yearCourseIds[year][round - 1];
  const holes = definitions(year, round);
  return {
    Year: year,
    Round: `Round ${round}`,
    "Course ID": courseId,
    "Source Course ID": year === 2023 && round === 2 ? "PDC02" : courseId,
    Course: courseId === "PDC01" ? "The Pete Dye Course" : `${year} Course ${round}`,
    City: "Test City",
    State: "TS",
    Destination: `${year} Destination`,
    "Tee Played": year >= 2023 ? "Blue" : "",
    Rating: year >= 2023 ? 70 + round / 10 : null,
    Slope: year >= 2023 ? 120 + round : null,
    Yardage: holes.reduce((sum, hole) => sum + hole.yardage, 0) || null,
    Par: holes.reduce((sum, hole) => sum + hole.par, 0) || null,
    Designer: `Architect ${round}`,
    Website: `https://course-${year}-${round}.test`,
    holeDefinitions: holes,
  };
}

function scorecard({ year, round, index, missing = false }) {
  const course = appearance(year, round);
  return {
    status: missing ? "MISSING" : "COMPLETE",
    year,
    round,
    matchId: `${year}-R${round}-${index + 1}`,
    courseId: course["Course ID"],
    courseName: course.Course,
    tee: course["Tee Played"],
    holes: course.holeDefinitions.map((hole) => ({
      holeNumber: hole.hole_number,
      score: missing ? null : hole.par + ((index + hole.hole_number) % 3) - 1,
      par: hole.par,
      yardage: hole.yardage,
      strokeIndex: hole.stroke_index,
      toPar: missing ? null : ((index + hole.hole_number) % 3) - 1,
    })),
  };
}

function completedView(year) {
  const courses = [1, 2, 3].map((round) => appearance(year, round));
  let scorecards = [];
  if (year >= 2023) {
    scorecards = courses.flatMap((_course, roundIndex) =>
      Array.from({ length: 20 }, (_, index) => scorecard({
        year,
        round: roundIndex + 1,
        index,
        missing: (year === 2023 && roundIndex === 2 && index >= 14) ||
          (year === 2025 && roundIndex === 2 && index >= 17),
      }))
    );
  }
  return {
    source: "supabase",
    year,
    tournament: { year, Destination: `${year} Destination`, courses },
    analytics: { scorecards },
  };
}

function currentView() {
  const course = {
    Year: 2026,
    Round: "Round 1",
    "Course ID": "TPGC01",
    Course: "Turtle Point Golf Course",
    "Tee Played": "Gold",
  };
  const currentCard = {
    status: "COMPLETE",
    year: 2026,
    round: 1,
    matchId: "2026-R1-1",
    courseId: "TPGC01",
    courseName: course.Course,
    tee: "Gold",
    holes: Array.from({ length: 18 }, (_, index) => ({
      holeNumber: index + 1,
      score: 4,
      par: 4,
      yardage: 400,
      strokeIndex: index + 1,
      toPar: 0,
    })),
  };
  return {
    source: "supabase",
    year: 2026,
    tournament: { courses: [course] },
    analytics: { scorecards: [currentCard] },
  };
}

function model() {
  return buildHistoricalCourseModel({
    completedViews: Array.from({ length: 9 }, (_, index) => completedView(2017 + index)),
    currentView: currentView(),
  });
}

test("historical-course source is reversible, Preview-only, and fails closed", () => {
  assert.deepEqual(["google", "supabase", "google", "supabase"].map((value) =>
    historicalCourseReadEnvironment({ ...preview, HISTORICAL_COURSE_READ_SOURCE: value }).resolved
  ), ["google", "supabase", "google", "supabase"]);
  const production = historicalCourseReadEnvironment({ ...preview, VERCEL_ENV: "production" });
  assert.equal(production.resolved, "google");
  assert.equal(production.productionBlocked, true);
  const incomplete = { ...preview, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" };
  assert.equal(historicalCourseReadEnvironment(incomplete).blocked, true);
  assert.throws(() => requireHistoricalCourseReadSource(incomplete), /credentials-missing/);
  assert.throws(() => requireHistoricalCourseReadSource({ ...preview, HISTORICAL_COURSE_READ_SOURCE: "mystery" }), /invalid-source/);
});

test("canonical course identity, temporal appearances, and known aliases remain certified", () => {
  const result = model();
  assert.equal(result.diagnostics.completedAppearances, 27);
  assert.equal(result.diagnostics.stableCompletedCourses, 26);
  assert.equal(result.aliases.PDC02, "PDC01");
  const pete = historicalCourseProfileInput(result, { courseId: "PDC02" });
  assert.equal(pete.canonicalCourseId, "PDC01");
  assert.deepEqual(pete.course.appearances.filter((row) => row.Year === 2023).map((row) => [row.round, row["Source Course ID"]]), [
    [2, "PDC02"],
    [1, "PDC01"],
  ]);
  const archive = historicalCourseArchiveContent(result);
  assert.equal(archive.courseArchive.length, 27);
  assert.equal(archive.courseArchiveTournaments.length, 9);
});

test("course profiles select exact year/round configuration without current-course bleed", () => {
  const result = model();
  const profile = historicalCourseProfileInput(result, { courseId: "PDC01" });
  const first = courseDetailModel(profile.canonicalCourseId, profile.content, { year: 2023, round: 1 });
  const second = courseDetailModel(profile.canonicalCourseId, profile.content, { year: 2023, round: 2 });
  assert.equal(first.course.Round, "Round 1");
  assert.equal(second.course.Round, "Round 2");
  assert.equal(first.holes.length, 18);
  assert.equal(second.holes.length, 18);
  assert.notEqual(first.holes[0].Yardage, second.holes[0].Yardage);
  assert.equal(courseDetailModel("TNGC01", profile.content, { year: 2017, round: 1 }).holes.length, 0);
  assert.equal(courseDetailModel("PDC01", profile.content, { year: 2024, round: 1 }), null);
});

test("scorecard and hole analytics preserve complete, unavailable, and current finalized evidence", () => {
  const result = model();
  assert.equal(result.diagnostics.completedHoleConfigurations, 9);
  assert.equal(result.diagnostics.completedScorecards, 180);
  assert.equal(result.diagnostics.completedHoleValues, 3078);
  assert.equal(result.completedScorecards.filter((card) => card.status === "MISSING").length, 9);
  assert.equal(result.currentScorecards.length, 1);
  const peteHole = historicalCourseHoleInput(result, { courseId: "PDC02", holeNumber: 1, tee: "Blue" });
  assert.equal(peteHole.canonicalCourseId, "PDC01");
  assert.equal(peteHole.hole.scoringAverage.sampleSize, 40);
  assert.equal(peteHole.hole.averageToPar.sampleSize, 40);
  assert.ok(Number.isInteger(peteHole.hole.difficultyRank));
  const unavailable = historicalCourseHoleInput(result, { courseId: "TNGC01", holeNumber: 1 });
  assert.equal(unavailable.hole, null);
  const current = historicalCourseHoleInput(result, { courseId: "TPGC01", holeNumber: 1, tee: "Gold" });
  assert.equal(current.hole.scoringAverage.sampleSize, 1);
});

test("every evidence-bearing course, tee, and hole resolves through the shared contract", () => {
  const result = model();
  assert.ok(result.courseHoleSummaries.length > 0);
  for (const expected of result.courseHoleSummaries) {
    const resolved = historicalCourseHoleInput(result, {
      courseId: expected.courseId,
      holeNumber: expected.holeNumber,
      tee: expected.tee,
    });
    assert.ok(resolved?.hole, `${expected.courseId} ${expected.tee} hole ${expected.holeNumber}`);
    assert.equal(resolved.hole.scoringAverage.sampleSize, expected.scoringAverage.sampleSize);
    assert.equal(resolved.hole.averageToPar.sampleSize, expected.averageToPar.sampleSize);
  }
});

test("course routes use the shared service with an isolated current Guide path and no direct Supabase query", async () => {
  const [index, profile, hole, service, envExample, players, records, compare] = await Promise.all([
    source("app/courses/page.js"),
    source("app/courses/[courseId]/page.js"),
    source("app/courses/[courseId]/holes/[holeNumber]/page.js"),
    source("lib/historical-course-service.js"),
    source(".env.example"),
    source("app/players/[slug]/page.js"),
    source("app/records/page.js"),
    source("app/compare/page.js"),
  ]);
  assert.match(index, /historical-course-service[\s\S]*loadHistoricalCourseArchive/);
  assert.match(index, /year: group\.year/);
  assert.match(index, /round: course\.round/);
  assert.match(profile, /historical-course-service[\s\S]*loadHistoricalCourseProfile/);
  assert.match(hole, /loadHistoricalCourseHole/);
  assert.match(profile, /resolveTournamentGuideContent\(\{ surface: "course" \}\)/);
  assert.match(profile, /source\.resolved === "supabase"/);
  assert.match(hole, /source\.resolved === "supabase"/);
  assert.doesNotMatch(service, /refreshHistoricalData|loadScorecardAnalytics|historical-data\.json|readWorkbookSheetsByName|getTournamentData/);
  assert.doesNotMatch(service, /\.from\(|createClient\(|scoringShadowRpc/);
  assert.match(service, /googleForegroundRequests:\s*0/);
  assert.match(service, /noFallback:\s*true/);
  assert.match(envExample, /^HISTORICAL_COURSE_READ_SOURCE=google$/m);
  for (const protectedRoute of [players, records, compare]) assert.match(protectedRoute, /loadSecondaryHistoryModel/);
});

test("Supabase read modules do not eagerly initialize the legacy Google workbook", async () => {
  const [completedService, completedSupabase, holeRoute] = await Promise.all([
    source("lib/completed-history-service.js"),
    source("lib/completed-history-supabase.js"),
    source("app/courses/[courseId]/holes/[holeNumber]/page.js"),
  ]);
  assert.doesNotMatch(completedSupabase, /^import .*google-sheets-data/m);
  assert.match(completedSupabase, /await import\("\.\/google-sheets-data\.js"\)/);
  assert.doesNotMatch(completedService, /google-sheets-data/);
  assert.doesNotMatch(holeRoute, /^import .*\/(?:scorecard-data|stats)";$/m);
  assert.match(holeRoute, /source\.resolved === "supabase"[\s\S]*else[\s\S]*import\("\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/lib\/scorecard-data"\)/);
});
