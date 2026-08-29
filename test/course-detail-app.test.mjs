import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { courseDetailModel } from "../lib/course-detail.js";

const content = {
  liveTournament: { name: "Sandbagger Invitational", year: 2026 },
  courses: [{
    "Course ID": "OCGC01", Year: 2026, Round: "Round 3", Format: "SI", Course: "The Ocean Course",
    City: "Kiawah Island", State: "SC", "Tee Played": "Gold", Par: 72, Yardage: 7356,
    Slope: 144, Rating: 75.6, Designer: "Pete Dye", "Year Opened": 1991,
    Website: "https://example.test/ocean", "Course Logo": "ocean-logo", "Course Profile Image": "ocean-profile",
    Overview: "A championship seaside course.", "Playing Tips": "Manage the wind.",
  }],
  courseArchive: [{ "Course ID": "OCGC01", Year: 2025, Course: "The Ocean Course", Designer: "Old value", Notes: "Historical course note." }],
  liveRounds: [{ number: 3, format: "Singles", status: "Upcoming", course: { tee: "Gold" }, matches: [{ teeTime: "10:30 AM" }] }],
  schedule: [{ "Event ID": "r3", "Round ID": "3", "Start Time": "10:30 AM", Details: "Gold Tees. 100% handicap allocation. $25/person net skins. Walking caddies: $100/bag." }],
  courseHoles: [
    ...Array.from({ length: 18 }, (_, index) => ({ "Course ID": "OCGC01", Tee: "Gold", "Hole Number": index + 1, Yardage: 360 + index, Par: index % 3 === 0 ? 5 : 4, "Stroke Index": 18 - index })),
    ...Array.from({ length: 18 }, (_, index) => ({ "Course ID": "OCGC01", Tee: "Black", "Hole Number": index + 1, Yardage: 410 + index, Par: 4, "Stroke Index": index + 1 })),
  ],
};

test("Course Detail binds the active normalized course over historical fallback data", () => {
  const model = courseDetailModel("ocgc01", content);
  assert.equal(model.course.Designer, "Pete Dye");
  assert.equal(model.location, "Kiawah Island, SC");
  assert.equal(model.tee, "Gold");
  assert.equal(model.active, true);
});

test("Course Detail exposes compact course facts without tournament duplication", () => {
  const model = courseDetailModel("OCGC01", content);
  assert.deepEqual(model.facts.map(([label]) => label), ["Par", "Yardage", "Slope", "Course Rating", "Architect", "Opened"]);
  assert.equal("tournamentDetails" in model, false);
  assert.equal("competitionNotes" in model, false);
  assert.equal("subtitle" in model, false);
});

test("Course Detail reuses optional workbook content without inventing missing sections", () => {
  const model = courseDetailModel("OCGC01", content);
  assert.deepEqual(model.experience.map(([label]) => label), ["Course Overview", "Playing Tips", "Signature Holes", "Course History"]);
  assert.equal(model.experience[0][1], "A championship seaside course.");
  assert.equal(model.images.length, 1);
  assert.equal(model.holes.length, 18);
  assert.equal(model.holes.every((hole) => hole.Tee === "Gold"), true);
  assert.equal(model.holes[0].Yardage, 360);
  assert.equal(model.website, "https://example.test/ocean");
});

test("Course Detail uses stable static course copy only when workbook narrative is absent", () => {
  const model = courseDetailModel("TPGC01", {
    courses: [{ "Course ID": "TPGC01", Course: "Turtle Point Golf Course" }],
  });
  assert.deepEqual(model.experience.map(([label]) => label), ["Course Overview", "Playing Tips", "Signature Holes", "Course History"]);
  assert.match(model.experience[0][1], /Jack Nicklaus/);
});

test("Course Detail hides unavailable optional facts, content, and scorecard data", () => {
  const model = courseDetailModel("C2", { courses: [{ "Course ID": "C2", Course: "Minimal Course", Round: 1 }], courseArchive: [] });
  assert.deepEqual(model.facts, []);
  assert.deepEqual(model.experience, []);
  assert.deepEqual(model.images, []);
  assert.deepEqual(model.holes, []);
  assert.equal(model.website, "");
});

test("Course Detail returns null only when neither normalized nor archived course exists", () => {
  assert.equal(courseDetailModel("missing", content), null);
});

test("current Course Detail uses the Guide resolver while archive transport uses the explicit historical-course boundary", async () => {
  const [page, loader, courseService] = await Promise.all([
    readFile(new URL("../app/courses/[courseId]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/tournament-guide/resolveGuideContent.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/historical-course-service.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /resolveTournamentGuideContent/);
  assert.match(page, /resolveTournamentGuideContent\(\{ surface: "course", env \}\)/);
  assert.match(page, /loadHistoricalCourseProfile/);
  assert.match(page, /source\.resolved === "supabase"/);
  assert.match(page, /resolveGoogleArchivedCourseContent/);
  assert.match(page, /courseDetailModel/);
  assert.doesNotMatch(page, /refreshHistoricalData|loadScorecardAnalytics|getCourse\(/);
  assert.match(courseService, /loadCompletedHistoryYears/);
  assert.match(courseService, /loadHistory2026View/);
  assert.doesNotMatch(courseService, /refreshHistoricalData|loadScorecardAnalytics|historical-data\.json/);
  assert.match(loader, /guideParticipantProjection\(\{ payload \}\)\.content/);
  assert.match(loader, /courseHoles: stored\.courseHoles \|\| \[\]/);
  assert.match(loader, /readGuideProjection\(\{ surface, env \}\)/);
  assert.match(loader, /surface === "guide" \? readTournamentLiveView\(source\.tournamentId, \{[\s\S]*?env,[\s\S]*?productionCutoverSurface: "GUIDE_COURSE_CONTEXT",[\s\S]*?\}\) : Promise\.resolve\(null\)/);
  assert.doesNotMatch(loader, /getTournamentData|refreshHistoricalData|readWorkbookSheetsByName/);
});

test("participant Course Detail remains inside the explicit app boundary and has no map action", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/courses/[courseId]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/courses/[courseId]/course-detail.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /if \(!participantPresentation\) return <PublicCoursePage courseId=\{courseId\} env=\{env\} \/>/);
  assert.match(page, /\.replace\(\/\^\\\/courses[\s\S]*?"\/app\/courses"\)/);
  assert.match(page, /historyCourseReturn/);
  assert.match(page, /courseOriginReturn/);
  assert.match(page, /!historyReturn && originReturn/);
  assert.match(page, /href=\{coursePresentationHref\(originReturn\.href, participantPresentation\)\}>‹ \{originReturn\.label\}<\/Link>/);
  assert.doesNotMatch(page, /View Scorecard|href="#course-scorecard"/);
  assert.match(page, /Front Nine/);
  assert.match(page, /Back Nine/);
  assert.match(page, /model\.tee \? `\$\{model\.tee\} Tees Scorecard`/);
  assert.match(page, />Yds</);
  assert.match(page, /Visit Official Course Website/);
  assert.match(page, /<ExternalLinkConfirm href=\{website\}/);
  for (const duplicated of ["Tournament Information", "Round Assignment", "Tee Assignment", "First Tee Time", "Walking Caddies", "Net Skins"]) assert.doesNotMatch(page, new RegExp(duplicated));
  assert.doesNotMatch(page, /View Map|GPS Link|maps\.apple|google\.com\/maps/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /table-layout:\s*fixed/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /min-width:\s*760px;|overflow-x:\s*auto/);
});
