import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildHistoricalCourseArchive,
  courseRoundLabel,
  currentTournamentCourses,
} from "../lib/course-archive.js";
import {
  COURSE_ORIGINS,
  courseOriginReturn,
  courseProfileHref,
} from "../lib/course-navigation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const archive = await source("lib/historical-data.json").then(JSON.parse);

test("current Tournament Courses sort by canonical Round independently of source row order", () => {
  const current = currentTournamentCourses([
    { "Course ID": "CPGC01", Round: 2, Format: "SC", "Tee Played": "Black", Course: "Cougar Point Golf Course" },
    { "Course ID": "OCGC01", Round: 3, Format: "SI", "Tee Played": "Gold", Course: "The Ocean Course" },
    { "Course ID": "TPGC01", Round: 1, Format: "BB", "Tee Played": "Gold", Course: "Turtle Point Golf Course" },
  ]);
  assert.deepEqual(current.map((course) => Number(String(course.Round).replace(/\D/g, ""))), [1, 2, 3]);
  assert.deepEqual(current.map((course) => course["Course ID"]), ["TPGC01", "CPGC01", "OCGC01"]);
  assert.deepEqual(current.map((course) => courseRoundLabel(course.Round)), ["Round 1", "Round 2", "Round 3"]);
  assert.deepEqual(current.map((course) => [course.Format, course["Tee Played"]]), [["BB", "Gold"], ["SC", "Black"], ["SI", "Gold"]]);
});

test("Course Archive derives a complete newest-to-oldest Year and Round chronology", () => {
  const model = buildHistoricalCourseArchive({
    tournaments: [...archive.tournaments].reverse(),
    courses: [...archive.courses].reverse(),
    currentYear: 2026,
  });
  assert.deepEqual(model.groups.map((group) => group.year), [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017]);
  assert.ok(model.groups.every((group) => group.appearances.map((course) => course.round).join(",") === "1,2,3"));
  assert.equal(model.audit.canonicalAssignments, 27);
  assert.equal(model.audit.renderedAppearances, 27);
  assert.equal(model.audit.uniqueCanonicalCourses, 26);
  assert.deepEqual(model.audit.accidentalDuplicates, []);
  assert.deepEqual(model.audit.unresolved, []);
});

test("the repeated 2023 Pete Dye appearances share one canonical Course Profile identity", () => {
  const model = buildHistoricalCourseArchive({ tournaments: archive.tournaments, courses: archive.courses, currentYear: 2026 });
  const year = model.groups.find((group) => group.year === 2023);
  assert.deepEqual(year.appearances.map((course) => [course.round, course["Course ID"], course.Course]), [
    [1, "PDC01", "The Pete Dye Course"],
    [2, "PDC01", "The Pete Dye Course"],
    [3, "DRC01", "The Donald Ross Course"],
  ]);
  assert.deepEqual(model.audit.normalizedAliases, [{
    year: 2023,
    round: 2,
    sourceCourseId: "PDC02",
    canonicalCourseId: "PDC01",
    course: "The Pete Dye Course",
  }]);
  assert.deepEqual(model.audit.repeatedCourses, [{
    courseId: "PDC01",
    course: "The Pete Dye Course",
    appearances: [{ year: 2023, round: 1 }, { year: 2023, round: 2 }],
  }]);
});

test("Course Archive fails closed on conflicting Year/Round course evidence", () => {
  const model = buildHistoricalCourseArchive({
    currentYear: 2026,
    tournaments: [{ Year: 2025, "Course 1": "A" }],
    courses: [
      { Year: 2025, Round: 1, "Course ID": "A", Course: "Canonical", City: "A", State: "TX" },
      { Year: 2025, Round: 1, "Course ID": "B", Course: "Different", City: "B", State: "CA" },
    ],
  });
  assert.equal(model.audit.renderedAppearances, 1);
  assert.equal(model.audit.accidentalDuplicates.length, 1);
});

test("Course origin URLs preserve explicit Archive and current return precedence", () => {
  assert.equal(courseProfileHref({ courseId: "PDC01", origin: COURSE_ORIGINS.ARCHIVE }), "/courses/PDC01?view=archive&source=course-archive");
  assert.equal(courseProfileHref({ courseId: "TPGC01", origin: COURSE_ORIGINS.CURRENT }), "/courses/TPGC01?source=current-courses");
  assert.deepEqual(courseOriginReturn({ view: "archive", source: "course-archive" }), {
    href: "/courses?view=archive",
    label: "Course Archive",
    accessibleLabel: "Back to Course Archive",
  });
  assert.deepEqual(courseOriginReturn({ source: "current-courses" }), {
    href: "/courses",
    label: "Tournament Courses",
    accessibleLabel: "Back to Tournament Courses",
  });
  for (const invalid of [{}, { view: "archive" }, { source: "course-archive" }, { source: "history", view: "archive" }, { source: "unknown" }]) {
    assert.equal(courseOriginReturn(invalid), null);
  }
});

test("Courses UI uses chronological groups, bounded prefetch, one AppShell, and no per-card data topology", async () => {
  const [page, detail, resolver, shell, css] = await Promise.all([
    source("app/courses/page.js"),
    source("app/courses/[courseId]/page.js"),
    source("app/tournament-guide/resolveGuideContentGoogle.js"),
    source("lib/participant-shell.js"),
    source("app/courses/course-directory.module.css"),
  ]);
  assert.match(page, /buildHistoricalCourseArchive/);
  assert.match(page, /historicalArchive\.groups\.map/);
  assert.match(page, /Round \{course\.round\}/);
  assert.match(page, /courseRoundLabel\(course\.Round\)/);
  assert.match(page, /aria-labelledby=\{`course-year-/);
  assert.match(page, /aria-label=\{`View \$\{group\.year\} Round \$\{course\.round\}/);
  assert.match(page, /prefetch=\{false\}/);
  assert.doesNotMatch(page, /<Header|<Footer|fetch\(|\/api\//);
  assert.match(resolver, /courseArchiveTournaments: tournaments/);
  assert.match(detail, /courseOriginReturn/);
  assert.match(shell, /route === "\/courses"/);
  assert.match(css, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 650px\)/);
});
